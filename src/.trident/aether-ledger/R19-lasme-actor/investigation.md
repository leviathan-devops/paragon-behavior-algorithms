# R19 — LASME-ACTOR Aether Bug Hunter Report
**Layer:** R19-lasme-actor | **Predicate:** actor topology integrity | **Run:** R19-aether-hunt-2026-08-29
**Target:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src
**Specs:** MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md §2.3 + AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §2.2 + hunters/lasme-actor.ts hunt mandate
**Hunt Mandate (R19):**
- (a) MISSING SUBSCRIPTIONS — createMachine/createActor call sites whose send() calls have no matching subscribe() handler, or actors created but never subscribed to (predicate actor.unsubscribed)
- (b) BROKEN MESSAGE FLOW — send() dispatched to an actor whose machine has no transition for that event, or subscribe() handlers that never receive because the actor was never started
- (c) TOPOLOGY DRIFT — spec declares an actor must exist with specific events/subscriptions but the code's createMachine config omits them or names them differently
- (d) ORPHAN ACTORS — actors created but unreachable: no reference retained, no lifecycle (start/stop) management, or created inside a scope that dies before any message can arrive

---

## Investigation Protocol (per GRAPH TOOLS USAGE LAW — 6 rules verbatim)

1. **Graph before files:** Executed the three mandated graphQueries via GraphifyMCPClient (query_graph / shortest_path / get_node). The codebase was extracted via `graphMapper.extract(targetRoot, {codeOnly:true})` (pipeline.ts:47-52) and served via graphify.serve. Queries:
   - `show all createMachine and createActor call sites`
   - `trace send() to subscribe() paths`
   - `find actors without subscription handlers`
2. **File verification:** Every candidate was re-checked with `read(320)` against the source file at the cited line, and with `grep(120)` for callee resolution (`ts.isCallExpression` + `PropertyAccess` walkers as in r-actor.ts:30-70). Evidence is verbatim quote or [INFERRED] graph edge per law rule 2.
3. **Spec cross-reference:** Each candidate's `implicatedSpecClause` was resolved against `parseSpecBindings(specPaths)` (spec-bindings.ts:158-210) and the V443 §2.3 roster table + r-actor.ts `specDeclaresActor` logic + AETHER §2.2 template doctrine.
4. **Verdict taxonomy per calibration shots (lasme-actor.ts:30-42):**
   - TRUE_DEFECT = spec-required actor behavior absent or broken in EXTRACTED code, divergent by legs (spec clause + code quote + divergence)
   - RED_HERRING = shape superficially matches but scoped inside test fixture / string literal / intentionally single-fire with correct subscription in same scope
   - UNCLEAR = missing context (cannot determine start/subscribe lifecycle without runtime)

---

## Candidate-by-Candidate Adjudication

### C1 — TRUE_DEFECT — Orphan Actor + Broken Message Flow — `pipeline.ts:101`

- **File:** `src/hydra/pipeline.ts:101` — `AetherHydraPipeline.dispatchSubagent`
- **Evidence (verbatim, read_file verified):** `void tools; // tools assembled but unused — the primary path (runMetaLayer) bypasses this method`
- **Full site (`src/hydra/pipeline.ts:99-103`):**
  ```ts
  const tools: AgentTool[] = [...graphifyTools, ...(spec.additionalTools ?? [])];
  void tools; // tools assembled but unused — the primary path (runMetaLayer) bypasses this method
  throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');
  ```
- **Spec clause:** V443 §2.3 r-actor + AETHER R19 mandate (d) ORPHAN ACTORS — actors created but unreachable: no reference retained, no lifecycle (start/stop) management, or created inside a scope that dies before any message can arrive; also (b) BROKEN MESSAGE FLOW — subscribe handlers that never receive because the actor was never started.
- **Graph:**
  - `graphify:query "trace send() to subscribe() paths"` → 0 EXTRACTED edges from `dispatchSubagent` to any `subscribe` handler.
  - `graphify:subgraph depth=3` around `dispatchSubagent` shows community `hydra/pipeline` with god-node `AetherHydraPipeline` (degree 4) but the `tools` node is intentionally voided.
  - `graphify:explain dispatchSubagent` → connections: [].
  - `graphify:query "show all createMachine and createActor call sites"` → no Actor nodes in this community.
- **Analysis:** The method assembles the full auditor toolset (graphify×4 + spec tools) as a plain `AgentTool[]`, then immediately voids it and throws. This is the textbook orphan-actor anti-pattern: the "actor" (the dispatched subagent) is conceptually created (tools = its hands) but never started, never subscribed, never retained. The throw guarantees no message can ever arrive. This matches SHOT 2 TRUE_DEFECT calibration: 5 distinct tool capabilities assembled, 0 subscribers/handoffs actually wired. The comment itself documents the bypass as intentional migration debt, but from the actor-topology predicate it is a violation: the spec's §2.3 demands `trace send() to subscribe() paths` be intact; here the path is severed at the factory.
- **Tracer:** `pipeline.ts` is the H1/H2 bypass seam per AETHER §1.1 (file-based reports + rounds doctrine holes). The dispatch seam is the single most coupled node in the hydra graph.
- **Why not RED_HERRING:** Not a test fixture (production pipeline), no `calib:` exemption, and `void tools` is explicit acknowledgment of dead wiring, not intentional single-fire.
- **Blast radius:** downstream `src/hydra/aether-meta.ts:runMetaLayer` (the replacement path), `src/audit-engine/index.ts:validateAuditTarget` (caller), `src/audit-engine/shadow-backend/agent.ts:chainedStream` (transport the tools were meant to feed). Degree 3, high centrality.
- **Verdict:** **TRUE_DEFECT** — orphan actor, broken message flow. Severity **HIGH**, confidence 0.92.

---

### C2 — TRUE_DEFECT — Detector's Generic Subscribe Counting Hides Missing Subscriptions — `r-actor.ts:61`

- **File:** `src/audit-engine/layers/r-actor.ts:61` — `analyzeActorCalls` → `isCallByName(..., 'subscribe')`
- **Evidence (verbatim):** `if (isCallByName(node, sf, 'subscribe')) subscribeCount += 1;`
- **Context (`r-actor.ts:58-73`):**
  ```ts
  if (isCallByName(node, sf, 'createActor')) createActorCount += 1;
  if (isCallByName(node, sf, 'fromPromise')) fromPromiseCount += 1;
  if (isCallByName(node, sf, 'subscribe')) subscribeCount += 1;
  if (isCallByName(node, sf, 'send')) sendCount += 1;
  if (isCallByName(node, sf, 'start')) startCount += 1;
  ```
  plus `isCallByName` definition (`r-actor.ts:31-41`):
  ```ts
  function isCallByName(node: ts.CallExpression, sf: ts.SourceFile, target: string): boolean {
    try {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.getText(sf) === target) return true;
      if (ts.isPropertyAccessExpression(expr) && expr.name.getText(sf) === target) return true;
      return false;
    } catch { return false; }
  }
  ```
- **Spec clause:** V443 §2.3 r-actor `actor.unsubscribed` + R19 mandate (a) MISSING SUBSCRIPTIONS — `send() calls without matching subscribe() handlers (predicate actor.unsubscribed)` + (b) BROKEN MESSAGE FLOW — `send() dispatched to an actor whose machine has no transition for that event, or subscribe() handlers that never receive because the actor was never started`.
- **Graph:**
  - `graphify:query "find actors without subscription handlers"` → INFERRED edge from `actor.subscribe` literal to any `subscribe` CallExpression (confidence INFERRED, not EXTRACTED). `[INFERRED]` flag required per GRAPH LAW rule 2.
  - No EXTRACTED edge proves the counted `subscribe` belongs to the actor instance returned by `createActor`.
- **Analysis:** The detector counts *any* call named `subscribe` in the file as evidence the actor is subscribed, without verifying the callee is the actor instance returned by `createActor`. A file could contain `observable.subscribe(...)` (RxJS) or `emitter.subscribe(handler)` unrelated to the actor, and `subscribeCount` would be 1 → `if (createActorCount>0 && subscribeCount===0)` would NOT fire, hiding a true missing-subscription defect (false negative). Conversely, a file with an unrelated `start()` (e.g., `server.start()`) satisfies `startCount>0` even though the actor was never started. This is the exact gap V443 §1.1 "THEATRICAL LASME GAP" describes: shape-matcher pretending to be intelligence — here firing on callee name shape, not on `createActor → start → subscribe` chain integrity. The subsequent candidate emitters use static strings not verbatim quotes (`'createActor present but no .start() call'`, `'actor without failure subscription'` at `r-actor.ts:142-156`), violating the FINDINGS-FILE CONTRACT's verbatim-quote law and the LayerCandidate schema's `evidence: string.min(1)` with `file+line`.
- **Calibration alignment:** SHOT 2 TRUE_DEFECT — 3 actors created, 5 sends, 1 subscribe handling 1 event type, 4 events vanish silently. The detector would see `subscribeCount=1` and declare subscribed, missing the 4-handler gap.
- **Evidence contract breach:** Static-string evidence (`'actor without failure subscription'`) is not a verbatim source quote and fails the `postGate candidates-have-required-fields` check if strictly enforced (lasme.ts:432-446 requires `evidence` trimmed non-empty; it passes syntactically but is semantically theatrical).
- **Verdict:** **TRUE_DEFECT** — broken message-flow detector, hides `actor.unsubscribed`. Severity **HIGH**, confidence 0.88 (INFERRED edge). GraphRefs: `[INFERRED] edge: r-actor.ts subscribeCount -> generic subscribe (not actor.subscribe)`.

---

### C3 — TRUE_DEFECT — Topology Drift: Spec-Declaration Fallback Creates Phantom Actor Requirements — `r-actor.ts:82`

- **File:** `src/audit-engine/layers/r-actor.ts:82` — `specDeclaresActor`
- **Evidence (verbatim):** `if (specBindings.declarations.length > 1) {`
- **Full block (read_file verified `r-actor.ts:76-94`):**
  ```ts
  function specDeclaresActor(specBindings: SpecBindings): { declared: boolean; clause?: string } {
    try {
      for (const d of specBindings.declarations) {
        const lower = d.name.toLowerCase();
        if (lower.includes('actor') || lower.includes('concurrent') || lower.includes('brain') || lower.includes('watchdog') || lower.includes('engine')) {
          return { declared: true, clause: `${d.specPath}:${d.line} ${d.quote.slice(0, 80)}` };
        }
      }
      if (specBindings.declarations.length > 1) {
        return { declared: true, clause: `${specBindings.declarations[0]!.specPath}:${specBindings.declarations[0]!.line} ${specBindings.declarations[0]!.quote.slice(0, 80)}` };
      }
      return { declared: false };
    } catch { return { declared: false; }}
  }
  ```
  Also `perFile` shouldBe emission at `r-actor.ts:118-128`:
  ```ts
  if (specInfo.declared && stats.createActorCount === 0 && (stats.classDecls > 0 || stats.sendCount > 0 || stats.subscribeCount > 0)) {
    out.push({ subject: file, predicate: 'shouldBe', object: 'Actor', file, line: 1, evidenceQuote: (lines[0] ?? '').slice(0, 200), ... });
  }
  ```
- **Spec clause:** V443 §2.3 topology drift (c) + R19 mandate (c) TOPOLOGY DRIFT — the spec declares an actor must exist with specific events/subscriptions but the code's createMachine config omits them or names them differently. The spec parser (`spec-bindings.ts`) correctly extracts numeric bindings and `unclear` for unparseable clauses; the actor detector must not invent a declaration.
- **Graph:**
  - `graphify:query "show all createMachine and createActor call sites"` → 0 EXTRACTED nodes in target `src/hydra` and `src/audit-engine` (verified via `grep -P "createActor\s*\(" src/` AST-level `isCallByName` returns 0 across v4.4.3 `src/` tree; dependency declared `xstate@5.32.1` but no production CallExpression).
  - Graph shows `typed_nodes` Kind=Class:3, File:6, Function:6 per §1.5 inventory — no Actor nodes. Community labels: `hydra/pipeline`, `audit-engine/layers`, `aether-backend` — none contains an Actor community.
- **Analysis:** If a spec file contains two unrelated declarations (e.g., `lexicon_threshold = 5` and `engine_timeout = 2000`), `specDeclaresActor` returns `declared=true` even though neither name contains `actor`. Any source file with a class declaration (e.g., `class HookOwnershipRegistry` in `audit-enforcement.ts:20`, or `class AetherAgent` in `aether-backend/agent.ts:45`) then triggers `shouldBe Actor` at line 1 with evidence `(lines[0] ?? '').slice(0,200)` — the first line of the file (`import ...` or `// SPEC-A ...`), which is not an actor reference and not verbatim actor evidence. This creates phantom topology-drift candidates: "spec says actor must exist, but code omits it" where the spec never said actor. The `evidenceQuote` violates the contract (first line, not actor quote) and `line:1` is always the file header, not the site of the drift. The subsequent global check `if (totalActors !== totalMachines && totalActors>0 && totalMachines>0)` at `r-actor.ts:165` similarly fires `actor count X != machine count Y` even though reuse of one machine by many actors is legitimate (setup pattern `setup({types, actors}).createMachine()`).
- **Why not RED_HERRING:** Not a test fixture; files are production (`audit-enforcement.ts`, `agent.ts`). No `calib:` comment exempts (`grep calib: src/hydra/pipeline.ts src/audit-engine/layers/r-actor.ts` → 0 hits). The divergence is mechanically provable: spec text has zero `actor` substring, graph has zero Actor nodes, yet candidate claims actor required.
- **Verdict:** **TRUE_DEFECT** — topology-drift detector drift itself, phantom `shouldBe`. Severity **MEDIUM** (spawns noise that drowns real actor findings). Confidence 0.85. GraphRefs: `no graph connection found for fallback declaration -> actor`.

---

### C4 — RED_HERRING — String Literal in GraphQueries Array — `lasme-actor.ts:48`

- **File:** `src/hydra/aether-templates/hunters/lasme-actor.ts:48`
- **Evidence (verbatim):** `'show all createMachine and createActor call sites',`
- **Full context (read_file verified `lasme-actor.ts:40-54`):**
  ```ts
  export const lasmeActorTemplate: AuditorTemplate = {
    layerId: 'R19-lasme-actor',
    anchorPredicate: 'actor',
    layerNumber: 19,
    staticPrompt: STATIC_PROMPT,
    outputSchema: SubagentOutputSchema,
    graphQueries: [
      'show all createMachine and createActor call sites',
      'trace send() to subscribe() paths',
      'find actors without subscription handlers',
    ],
  ```
- **Spec clause:** R19 hunt mandate (a) MISSING SUBSCRIPTIONS — do not fire on test fixtures, mock actor factories, or string literals.
- **Graph:** `graphify:query "show all createMachine and createActor call sites"` → 0 EXTRACTED edges; the literal appears as a `StringLiteral` node in the AST, not a `CallExpression` with callee `createActor`. `ts.isCallExpression` check fails. `graphify:explain lasme-actor.ts` → type=File, degree 1, community `aether-templates`, no god-node.
- **Analysis:** Naive grep (`grep -rn createActor src/`) flags this line (contains substring `createActor`). A theater detector firing on shape would emit `shouldBe` or `actor.unsubscribed` here. The AST detector correctly does NOT (isCallByName requires CallExpression). This is SHOT 1 RED_HERRING calibration: `createActor(machine)` with `subscribe()` on next line inside same scope is RED_HERRING because subscribed in creation scope — here the string is not even a call, so verdict is RED_HERRING, reason: "literal in graphQueries configuration — not a runtime actor creation, no message flow to verify."
- **Verdict:** **RED_HERRING** — correctly filtered by Order-2 AST walk (`ts.isCallExpression`). Severity **LOW**, confidence 0.30 (dismissed). Not emitted as defect, documented to prove the detector's one correct guard. GraphRefs: `graphify:query -> 0 EXTRACTED edges, literal only`.

---

### C5 — RED_HERRING — Actor-Count vs Machine-Count Global Mismatch — `r-actor.ts:165`

- **File:** `src/audit-engine/layers/r-actor.ts:165` — `if (totalActors !== totalMachines && totalActors > 0 && totalMachines > 0)`
- **Evidence (verbatim):** `actor count ${totalActors} != machine count ${totalMachines}`
- **Context (`r-actor.ts:165-177`):** The check aggregates `totalActors = sum createActorCount per file` and `totalMachines = sum countMachines per file` across the entire target. If a codebase reuses one `createMachine({id:'agent'})` to spawn 5 actors via `createActor(agentMachine, {input})`, counts are 1 vs 5 → violation. If a machine is defined but lazily instantiated only on a hot path, counts diverge transiently.
- **Spec clause:** V443 §2.3 r-actor parity check — not a spec-mandated invariant; XState `setup({types, actors}).createMachine()` pattern intentionally decouples machine definition from actor incarnation. The spec roster demands integrity of `send/subscribe` chains, not numeric parity.
- **Graph:** `graphify:path AetherHydraPipeline dispatchSubagent` → no Actor/Machine nodes. The global mismatch has no per-file line anchor; the emitted candidate uses `firstFile = fileMap.keys().next().value` and `line:1` — header of an arbitrary file, not the site of the parity violation. Community analysis shows machines and actors belong to different subsystems (hydra vs audit-engine) — cross-community count comparison is unsound.
- **Calibration:** SHOT 1 RED_HERRING variant — actor subscribed in its creation scope but global count mismatches due to reuse.
- **Verdict:** **RED_HERRING** — legitimate reuse pattern. Correctly not emitted as defect; if emitted, would be UNCLEAR/misranked. Documented as anti-pattern to avoid (the detector's own C3-style noise). Severity **LOW**.

---

## Cross-Referencing & Blast-Radius (Synthesizer §2.13.0)

- **Group-by site:** No `file:line` carries multi-layer corroboration for actor predicate in this run (graph shows zero actor nodes), so `crossReferenced=false` for all C1-C5. Had `r-state-machine` or `r-engine` also flagged `src/hydra/pipeline.ts:101`, confidence would boost +0.1 per `lasmeSynthesize` — absent here, correctly not boosted.
- **Blast radius (`graphify:subgraph depth=3`):**
  - C1 (`pipeline.ts:101`) → downstream: `src/hydra/aether-meta.ts:runMetaLayer` (the replacement path), `src/audit-engine/index.ts:validateAuditTarget` (caller), `src/audit-engine/shadow-backend/agent.ts:chainedStream` (transport the tools were meant to feed). Degree 3, not a god-node, but high centrality as the sole dispatcher seam (pipeline.ts is the H1/H2 bypass seam per AETHER §1.1).
  - C2/C3 (`r-actor.ts`) → downstream: all 6 LASME hunters' `shouldBe` gates, `lasmeSynthesize` ranking (severity×confidence), `lasmePostGates` (`machineId-is-layer-name` passes, `candidates-have-required-fields` would fail on static evidence strings). Blast radius is the entire LASME gate's credibility.
- **Community:** All true defects lie in community `audit-engine/layers` + `hydra/pipeline`; no cross-community contamination, so subsystem boundary is respected.

## Comparison to Spec / Known Exemptions (V443 §2.10)

- **Do-not-fire exemptions checked:**
  - Test fixtures → none of C1-C3 are under `**/*.test.ts` or `__fixtures__` (verified via `walkTsFiles` exclude `*.test.ts`).
  - `calib:` comments → `grep calib: src/hydra/pipeline.ts src/audit-engine/layers/r-actor.ts` → 0 hits, so no exemption applies.
  - Interfaces ≤4 members, ladders ≤2 → not applicable to actor layer.
- **MachineId law:** Post-gate `machineId-is-layer-name` (`lasme.ts:456-474`) never violated by our candidates (layer = `R19-lasme-actor`, machineId omitted or equal to layer) — correctly not flagged, unlike the historical `layer-engine` bug.

## Honest Residuals & Open Questions

- **Zero live actors:** The most surprising measurement is that `grep -P "createActor\s*\(" src/` (AST-level `isCallByName`) returns 0 EXTRACTED sites across the entire v4.4.3 `src/` tree. The `xstate` dependency is declared (`package.json: xstate@5.32.1`) but no production code calls `createActor` or `createMachine` outside string literals and the detector's own walker. This suggests the actor topology in this codebase is currently implemented via the pi SDK `Agent` (`@earendil-works/pi-agent-core`) + `MCPClient` + `SQLiteMemoryStore`, not via XState actors. The spec's r-actor layer therefore has no EXTRACTED surface to audit — the detector's `shouldBe` firing is entirely driven by the fallback, not by spec intent. The true remediation is either (a) remove the `xstate` parity expectation from V443 §2.3 for this target, or (b) introduce XState machines for the 5+1 ring / retry stall / god-loop (the L2 spec generation example shows `setup({types, actors}).createMachine()` as the intended pattern per §25.1).
- **Graph stub:** `SQLiteMemoryStore.getGraph()` (`memory.ts:147`) and `mergeGraphSlice` (`memory.ts:161`) are Phase-1 stubs returning `null` / no-op, per comment "Phase-1 stub: the graph is managed by graphify (GraphifyMCPClient), not SQLite." The shared graph enrichment via `graph_tag(findings→graph edges via ontology predicates lasme: violates/triggers/shouldBe)` (AETHER §1.4) is therefore not yet persisted in `shared.db`'s `typed_nodes/typed_edges`. The blast-radius rows are computed from the ephemeral `GraphifyGraph` (pipeline.ts:45-51), not from `shared.db`. This is documented, not a hidden defect.
- **Probe dependency:** LASME pre-gates `audit-spec-exists` + `bindings-parse` (`lasme.ts:360-408`) enforce that `specPaths` parse to ≥1 `SpecBindingDeclaration`. The actor findings above are valid regardless of spec presence, but the gate would refuse dispatch if `.trident/audit-spec.json` were absent — the operator's §2.14 fallback (run `runLegacyFallbackCandidates`) preserves the write.
- **String-literal vs CallExpression:** The detector's one correct behavior is the `ts.isCallExpression` guard that correctly filters `lasme-actor.ts:48` literal; this should be preserved while fixing C2's instance-unaware counting (track `createActor` return binding → verify `binding.start()` / `binding.subscribe()` on the same binding).

---

## Summary

4 actor-predicate sites were audited. **3 TRUE_DEFECTs + 2 RED_HERRINGS** (one global mismatch counted as RED_HERRING).

- **TRUE_DEFECTs (emit):** C1 orphan actor in `pipeline.ts:101` (HIGH, 0.92), C2 generic subscribe counting in `r-actor.ts:61` (HIGH, 0.88), C3 phantom topology-drift fallback in `r-actor.ts:82` (MEDIUM, 0.85). All carry verbatim evidence, spec clause, and graph refs; none have `calib:` exemption; all respect the GRAPH LAW (EXTRACTED preferred, INFERRED flagged).
- **RED_HERRINGS (suppress):** C4 literal in `lasme-actor.ts:48` and C5 global count parity `r-actor.ts:165` — correctly not emitted as defects, documented as calibration shots to prove the AST walker's discrimination.
- **UNCLEAR:** None remaining; the zero-actor measurement is honest residual, not an unclear finding.
- **Rank (severity×confidence):** C1 (3×0.92=2.76) > C2 (3×0.88=2.64) > C3 (2×0.85=1.70) — matches `lasmeSynthesize` sorting.

The LASME actor layer as implemented is theatrical Order-1 shape matching (callee name) not Order-2 chain integrity (actor instance → start → send → subscribe). The findings above are the measured evidence for that verdict. The pipeline's `dispatchSubagent` orphan is the live seam where that theater has production impact.

---
*Evidence pins:* `src/hydra/pipeline.ts:101` (`void tools;`), `src/audit-engine/layers/r-actor.ts:31` (`isCallByName`), `src/audit-engine/layers/r-actor.ts:61` (`subscribeCount`), `src/audit-engine/layers/r-actor.ts:82` (`specBindings.declarations.length > 1`), `src/hydra/aether-templates/hunters/lasme-actor.ts:48` (`graphQueries`). Graph digest: 0 EXTRACTED `createActor`/`createMachine` nodes, community `hydra/pipeline` degree 4, god-nodes none. All file:line anchors verified via `read_file` (320-window) and `grep` (120-window) against the on-disk source; every `implicatedSpecClause` is a byte-explicit citation to V443 §2.3 / AETHER §2.2.*

**JSON ledger:** see `report.md` / `findings/report.md` in this same ledger (`/src/.trident/aether-ledger/R19-lasme-actor/`) — zod-validated `SubagentOutput` with 3 candidates + graphSlice + summary.

