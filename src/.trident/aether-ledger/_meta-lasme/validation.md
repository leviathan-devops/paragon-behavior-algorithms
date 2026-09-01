# LASME META VALIDATION — Cross-Layer Candidate Investigation (v4.4.3)
**Orchestrator:** LASME meta aether orchestrator (Muse Spark) · **Date:** 2026-08-30 · **Run:** lasme-meta-validation-2026-08-30
**TargetRoot:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3`
**Spec Roots:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md` + `MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md` + `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md` + `Lexicon_Grade_Intelligent_Systems_Engineering_Bible.md` + `INTELLIGENT_SYSTEMS_ENGINEERING_T1.md` + `src/hydra/aether-templates/hunters/*` + `src/hydra/instances/lasme.ts`
**Method:** Graph-first law honored — grep (target/specs) BEFORE file-echo; every candidate re-checked against (1) spec clause quote, (2) code evidence quote verbatim, (3) divergence, (4) calibration shots & do-not-fire exemptions. Direct `read_file` blocked outside ledger (SCOPE_VIOLATION on absolute src paths) — verified via EXTRACTED grep results (target root) + ledger-contained verbatim evidence already read(320)-verified in hunter reports. All file:line anchors were grep-confirmed; no INFERRED edges cited without flag.

---

## SCOPE PRE-FILTER

| Group | Count | Verdict |
|-------|-------|---------|
| **PLUTUS_AGENT 5 candidates** (`/…/Manta Agent/Active_Projects/PLUTUS_AGENT/src/...`) at `findings-report.md: R18-lasme-lexicon 5` | 5 | **SCOPE_INVALID** — file path outside targetRoot `.../v4.4.3`. Hunter ran on wrong extraction. Not counted. Evidence `if (zfp < ZFP_FORTRESS...)`, `blocked = ['cmegroup'...]`, `SHAPE_MAX_DISTANCE`, `EARTH_ZONE_PROXIMITY`, `ShapeCode` are PLUTUS-only. Discard. |
| **v4.4.3 LASME + MPSE candidates** | 4 (R18) +3 (R19)+6 (R20)+3 (R21)+4 (R22)+1 (R23)+10 (lasme-meta)=31 raw, 21 unique after dedup | Investigated below |

No hallucinated `specPath` — every `implicatedSpecClause` below resolves to a file that `grep` confirms exists in ledger or target.

---

## R18 — lasme-lexicon (v4.4.3) — 4 candidates

### R18-C1 `lexicon.family` HIGH 0.92 — degenerate PatternFamily detection omits mandatory identity fields `id/kind/matcher`
- **File:** `src/audit-engine/layers/r-lexicon.ts:147` — evidence grep-confirmed `for (const req of ['triggerCondition', 'severity', 'messageTemplate', 'remediationHook', 'exampleHits'])`
- **Spec:** `Lexicon_Grade_ISE_Bible.md: PART 1.2` canon `{ id, kind, matcher, triggerCondition, severity, messageTemplate, remediationHook }` (7) + `ISE_T1.md:30` `{ id, kind, matcher(Order-2+), ..., exampleHits }` (8)
- **Divergence:** Detector enumerates only 5 trailing fields, omits 3 identity fields `id`, `kind`, `matcher`. A lexicon without `id/kind/matcher` would pass the degenerate check, violating the hunter's own ISE law that matcher must be structural Order-2+. Code path allows false-negative.
- **Validation:** TRUE_DEFECT. Verbatim quote matches loop; spec clause is 7/8 fields; fix is add `['id','kind','matcher',...]` to required array. Not a RED_HERRING (wide DTO exemption does not apply — this is the detector's own PatternFamily shape walk).
- **Confidence:** 0.92 sustained.

### R18-C2 `lexicon.threshold` MEDIUM 0.88 — uncalibrated threshold literal `depth >=3`
- **File:** `src/audit-engine/layers/r-lexicon.ts:80` (report says 80, investigation notes 120 `hasDecisionLogicShape`) — evidence `if (depth >= 3) return true;` — grep-confirmed 10+ hits for `if (depth >= 3)`
- **Spec:** `ISE_T1.md:26-27` magic ladder + `Lexicon_Bible PART 3.2 SLOP-SIG-3` + `lasme-lexicon.ts:28-30` + `lasme.ts:LEXICON_DIRECTIVE` — every numeric literal gating a decision must be named constant or `calib:` comment; unnamed `3` in ≥3-branch ladder is slop.
- **Divergence:** `depth` is `countIfChainDepth` result; `3` is the ladder decision threshold with no `DECISION_DEPTH_THRESHOLD` constant and no `// calib:` provenance. Self-violation: the lexicon hunter violates its own threshold law.
- **Validation:** TRUE_DEFECT. Calibration SHOT 1 (RED_HERRING) is `READ_FILE_MAX_LINES=320` named constant — correctly exempt. This site has no name, no calib. `depth=3` is not loop bound/display constant. Fix: `const DECISION_LADDER_THRESHOLD = 3; // calib: V443 §2.3 r-lexicon depth >=3` then `if (depth >= DECISION_LADDER_THRESHOLD)`.
- **Confidence:** 0.88 sustained.

### R18-C3 `lexicon.tower` MEDIUM 0.81 — N-branch tower default-pass in spec-declaration classifier
- **File:** `src/audit-engine/layers/r-actor.ts:94` (note: file is r-actor but predicate is lexicon.tower; cross-layer) — evidence `if (specBindings.declarations.length > 1) { return { declared: true, clause: `${specBindings.declarations[0]!.specPath}` — grep confirms
- **Spec:** `ISE_T1.md:22-23` N-branch tower + `Lexicon_Bible PART 3.2 SLOP-SIG-1` + `02_STATE_MACHINES_AND_GATES.md:P8` fail-closed, `INCONCLUSIVE` never `PASS`
- **Divergence:** Cardinality `>1` is a default-pass tower: “if more than one declaration, auto-declared true” without checking `kind`/`matcher` fields. This is phantom topology-drift fallback that invents actor requirement when spec never declares actor, same root cause as R19-C3.
- **Validation:** TRUE_DEFECT (MEDIUM). Not RED_HERRING. Branch count ≥2 pass path is SLOP-SIG-1; fail path missing. Should return `INCONCLUSIVE` when ambiguous.
- **Confidence:** 0.81 sustained (downgrade to MEDIUM correct — not blocking prod).

### R18-C4 `lexicon.detector` LOW 0.76 — Order-2 enforcement gap, matcher shape not structural
- **File:** `src/audit-engine/layers/r-lexicon.ts:44` — evidence `if (memberName === 'matcher') fields.add('matcher');`
- **Spec:** `Lexicon_Bible PART 3.3` Order-2+ structural matcher + `ISE_T1.md:14-15` zero-regex law + `02_STATE_MACHINES_AND_GATES.md:P1` defensive import
- **Divergence:** Presence check for `matcher` field does not verify structural type (`ts.is*` / AST / CallGraph). No check that matcher `type` is function/callgraph shape vs string.
- **Validation:** TRUE_DEFECT LOW (remediable by `if (memberName==='matcher' && ts.isFunctionLike...)`). Confidence 0.76 appropriate — low severity because detector still walks AST at higher level, gap is shape typing not total absence.
- **Fix hint:** enforce `matcher` property assignment is `ArrowFunction`/`FunctionExpression` with `ts.is*` body, not string literal.

**R18 Summary:** 4/4 TRUE (1 HIGH, 2 MEDIUM, 1 LOW). Hunter is Order-2 sound but ships minimal file-local gaps. No RED_HERRING here (wide DTOs already cleared via shot 1).

---

## R19 — lasme-actor — 5 sites audited, 3 TRUE + 2 RED_HERRING

### R19-C1 `actor.orphan` HIGH 0.92 — assembled tools voided and bypassed via throw
- **File:** `src/hydra/pipeline.ts:101` (report 101, also 143-144) — evidence `void tools; // tools assembled but unused — the primary path (runMetaLayer) bypasses this method` — grep confirms 4 hits across roster + 3 hunter reports
- **Spec:** `V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:195` Actor topology, createActor/createMachine/send/subscribe, missing subscriptions, message flow integrity; hunt mandate (d) ORPHAN ACTORS
- **Divergence:** `dispatchSubagent` assembles `const tools: AgentTool[] = [...graphifyTools, ...(spec.additionalTools ?? [])]; void tools; throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed…')` — primary `execute` at pipeline.ts:66-73 unconditionally calls `dispatchSubagent`, so `fulfilledCount` is systematically 0 until `mpseSynthesize` tolerates via `continue` and later `mpse-post-conformance-complete` fails. Orphan seam: tools merged via spread then discarded — delegation parity violation corroborated by R22.
- **Validation:** TRUE_DEFECT HIGH. Not a test fixture, production hydra spine. Comment is honest admission of degraded path without guard. Graph query `trace send() to subscribe() paths` returned 0 EXTRACTED edges from dispatchSubagent to any subscribe — broken message flow. Cross-referenced by R22-C1 and R26 stage missing post.
- **Confidence:** 0.92 sustained.

### R19-C2 `actor.missingSubscribe` HIGH 0.88 — generic subscribe counting hides missing actor.subscribe
- **File:** `src/audit-engine/layers/r-actor.ts:61` — evidence `if (isCallByName(node, sf, 'subscribe')) subscribeCount += 1;` — grep confirms
- **Spec:** same V443:195
- **Divergence:** `isCallByName(..., 'subscribe')` counts *any* callee named `subscribe` (e.g., `observable.subscribe`, `array.subscribe`) as actor subscription. This inflates `subscribeCount`, hiding the orphan's missing `actor.subscribe` / `createActor(...).subscribe`. Evidence quote in report is static-string `‘show all createMachine...’` pattern? No — actual evidence is the `isCallByName` line, which violates verbatim-quote law? Report notes “emits static-string evidence violating verbatim-quote law” for generic counting — the detector’s output is not file:line anchored correctly. False negative risk.
- **Validation:** TRUE_DEFECT HIGH. Calibration SHOT 3 UNCLEAR (empty createMachine in test helper) was correctly UNCLEAR, not this. Fix: `isCallByName` must check `receiver` is `actor` / `createActor` result, not any `subscribe`.
- **Confidence:** 0.88 sustained.

### R19-C3 `actor.topologyDrift` MEDIUM 0.85 — phantom shouldBe via `declarations.length >1`
- **File:** `src/audit-engine/layers/r-actor.ts:82` — evidence `if (specBindings.declarations.length > 1) {` — same as R18-C3, cross-layer duplicate
- **Spec:** same V443:195 topology drift — spec declares actor must exist but code omits
- **Divergence:** Fallback declares `shouldBe actor` when `>1` declarations exist, inventing requirement when spec may have never declared actor. SpecBindings with multiple declarations triggers `declared:true` without checking predicate `actor`.
- **Validation:** TRUE_DEFECT MEDIUM. Note: R18-C3 and R19-C3 are same code site flagged twice (lexicon.tower vs actor.topologyDrift) — dedup to one finding, crossReferenced boost +0.1 per lasme.ts synthesize would apply (otherLayers). Keep single, mark crossReferenced.
- **Confidence:** 0.85 sustained.

### R19-C4/C5 RED_HERRING — correctly suppressed
- **C4** `lasme-actor.ts:48` literal `'show all createMachine and createActor call sites'` — graphQuery string literal, do-not-fire per R19 brief. Confidence 0.30 LOW — correctly RED_HERRING with legitimizingReason.
- **C5** `r-actor.ts:165` global `totalActors !== totalMachines` — legitimate reuse via `setup({types,actors}).createMachine()` one machine spawns many actors; parity not invariant. Confidence 0.35 LOW — correctly RED_HERRING.

**R19 Summary:** 3 HIGH/MEDIUM TRUE (orphan seam + generic subscribe + phantom drift), 2 LOW RED_HERRING correctly cleared. Graph found 0 EXTRACTED createActor/createMachine nodes in target (XState declared but runtime is pi Agent + MCPClient) — honest zero coverage for XState actors, correctly not suppressed but noted as residual.

---

## R20 — lasme-state-machine — 6 findings (3 HIGH, 3 MEDIUM)

All verified via graph-first `find machines with scattered boolean flags` + `show state machines with their state count` + `find XState createMachine configurations` against ONE shared graph (extract-once query-N). Reads at 320L verified.

### R20-C1 `state-machine.scattered-flags` HIGH 0.88 — `private states = new Map<string, OrchestratorState>();` duplicates machine state
- **File:** `src/orchestrator.ts:42` — evidence grep matches snippet; report confirms `private states = new Map<string, OrchestratorState>();`
- **Spec:** `AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §2.2 R20 (a) SCATTERED BOOLEAN FLAGS`
- **Divergence:** Wrapper `Orchestrator` maintains parallel `Map<string,OrchestratorState>` while owning `orchestratorMachineV2.state` and `public auditFSM: AuditFSM` at line 44. Dual source of truth; after gated `startMode` manual copy at lines 91-93 (`state.mode = 'CODE_REVIEW'; state.currentLayer = orchestratorMachineV2.getLayer(); state.status = orchestratorMachineV2.getStatus();`) is not atomic — when V2 throws `[ORCHESTRATOR GATE] Illegal transition` Map stays stale, AuditFSM can diverge (`V2=RUNNING` while `AuditFSM=failed` after `failLayer`).
- **Validation:** TRUE_DEFECT HIGH. Not RED_HERRING (AuditFSM context at `xstate-fsm/index.ts:18` holds `targetPath/currentLayer/filesFound` inside machine — correctly scoped, noted as RED_HERRING).

### R20-C2 `scattered-flags` MEDIUM 0.81 — `identityLoaded: boolean;` + `initialized: boolean;` in OrchestratorState
- **File:** `src/orchestrator.ts:21-22` — evidence `identityLoaded: boolean;` + `initialized: boolean;`
- **Spec:** same R20 (a)
- **Divergence:** Booleans `identityLoaded`/`initialized` shadow states `identity_loading` vs `identity_loaded` that should BE machine states.
- **Validation:** TRUE_DEFECT MEDIUM.

### R20-C3 `missing-terminal` MEDIUM 0.82 — `auditMachine` zero terminal states, infinite loop
- **File:** `src/warheads/xstate-fsm/index.ts:25` — evidence `const auditMachine = createMachine({` defines 5 states `idle, scanning, analyzing, reporting, failed` with zero `type: 'final'`, `reporting → idle` loops forever
- **Spec:** `AETHER §2.2 R20 (b) MISSING TERMINAL STATES`
- **Divergence:** No final/done state; workflow never terminates. Report notes same pattern as V2 `COMPLETE → RUNNING` auto-restart.
- **Validation:** TRUE_DEFECT MEDIUM. Note: `isRunning()` at `xstate-fsm/index.ts:145` is derived query, correctly RED_HERRING.

### R20-C4 `missing-terminal` MEDIUM 0.79 — `orchestratorMachineV2` COMPLETE auto-restarts, never terminal
- **File:** `src/fsm/orchestrator-machine-v2.ts:124-130` — evidence `if (this.state.status === 'COMPLETE') { … this.transition('RUNNING', 'auto-restart-from-complete')`
- **Spec:** same R20 (b), verified against `STATUS_TRANSITIONS` at line 50 `COMPLETE: new Set(['IDLE', 'RUNNING'])`
- **Divergence:** COMPLETE is not terminal; `advanceLayer` auto-restarts, workflow can never terminate.
- **Validation:** TRUE_DEFECT MEDIUM.

### R20-C5 `unreachable` HIGH 0.85 — ERROR/TIMEOUT silent reset bypasses transition gate
- **File:** `src/fsm/orchestrator-machine-v2.ts:136-137` — evidence `if (this.state.status === 'ERROR' || this.state.status === 'TIMEOUT') { this.state = this.defaultState(); return; }`
- **Spec:** `V443 §2.3 R20 (c) UNREACHABLE STATES` — TIMEOUT defined in STATUS_TRANSITIONS but `timeout()` at line 160 has 0 call sites (grep `grep -rn "timeout()" src --include="*.ts"` = 0)
- **Divergence:** Branch bypasses `transition()` gate that otherwise `throw new Error([ORCHESTRATOR GATE] Illegal transition…)` at line 78, discarding `mode/maxLayers` diagnostic context. Also unreachable trigger.
- **Validation:** TRUE_DEFECT HIGH.

### R20-C6 `topology-drift` HIGH 0.86 — wrapper manually shadows machine state after gated transition
- **File:** `src/orchestrator.ts:88-93` — evidence `orchestratorMachineV2.startMode('CODE_REVIEW'); … state.mode = 'CODE_REVIEW'; …`
- **Spec:** `AETHER §2.2 R20 (d) STATE TOPOLOGY DRIFT` — spec declares single source of truth via gate
- **Divergence:** Manual sync after `startMode`/`auditFSM.send` is not atomic, risk desync as above.
- **Validation:** TRUE_DEFECT HIGH.

**R20 Summary:** 6/6 TRUE. Honest residuals correctly noted: `AuditFSM` context not scattered, `V2 advanceLayer` IDLE→COMPLETE illegal transition is latent but not defect because `startMode` precedes `advanceLayer` in observed chain.

---

## R21 — lasme-engine — 3 findings (2 HIGH, 1 MEDIUM)

### R21-C1 `engine.silentDegrade` HIGH 0.89 — `logViolation` void catch swallows ledger failure
- **File:** `src/hydra/aether-tools.ts:23` — evidence `catch (e) { void (e as Error).message; }` — grep confirms; full function at lines 14-23 shows `fs.mkdirSync` + `fs.appendFileSync` inside try, catch voids
- **Spec:** `V443 §2.3:156 r-engine | writeFileSync/degrade paths, engine-level side effects without guards` + hunt mandates (b) SILENT DEGRADE, (d) UNGUARDED SIDE EFFECTS — catch must log+recover or propagate, never empty
- **Divergence:** `void (e as Error).message` is theatrical swallowing — no log, no propagate. Same file `execFile` side effect nearby.
- **Validation:** TRUE_DEFECT HIGH. Calibration SHOT1 RED_HERRING `writeFileSync inside try/catch where catch logs via evidence.log and rethrows` is correctly not this. This catch is empty. Cross-referenced by lasme-meta R21-C1 identical site.
- **Confidence:** 0.89 sustained.

### R21-C2 `engine.unguardedWrite` MEDIUM 0.82 — `fs.writeFileSync(briefPath, brief, 'utf-8');` on hydra hot path blocks event loop
- **File:** `src/hydra/aether-auditor.ts:72` — evidence `fs.writeFileSync(briefPath, brief, 'utf-8');` — grep confirms inside `Promise.allSettled` 6-hunter dispatch per report
- **Spec:** same V443:156 + (a) UNGUARDED WRITES + (d) Hermes async queue mandated
- **Divergence:** Sync I/O on orchestrator hot path; no guard for existence/try-catch with recovery; next line returns `{success:true}` per SHOT2 TRUE_DEFECT pattern.
- **Validation:** TRUE_DEFECT MEDIUM. Note: `aether-tools.ts:writeFileTool` is scoped via `enforceWriteScope` + `realpathSync` + `startsWith(root+sep)` — that site was correctly cleared as guarded (lasme-meta residuals).
- **Confidence:** 0.82 sustained.

### R21-C3 `engine.silentDegrade` HIGH 0.78 — Missing `degrade()` wiring codebase-wide
- **File:** `src/hydra/aether-auditor.ts:1` — evidence `import * as fs from 'node:fs';` (generic) — but true divergence is `rg degrade src =0` — 18 degrade-required points, 0 wired, no explicit fallback predicate for SRO. Report lists `aether-meta.ts` ×5 writeFileSync etc. without degrade.
- **Spec:** same V443:156 trace degrade/fallback branches
- **Divergence:** No `degrade()` call sites; engine-level side effects without fallback. Evidence quote is weak (file:1 import) but supporting grep `degrade` count 0 + file reads confirm no degrade wiring. Same as lasme-meta check.
- **Validation:** TRUE_DEFECT HIGH but **confidence should be 0.78 MEDIUM-HIGH, not 0.89** — evidence anchoring is via absence proof (grep 0), not verbatim line, so meta marks as TRUE but escalate for stronger file:line anchor (e.g., cite `aether-auditor.ts:72 next line return success` as degrade omission). Keep, but note weak anchoring.
- **Action:** Rewrite evidence to `rg "degrade" src → 0 hits; aether-auditor.ts:72 writeFileSync with no degrade fallback` for report grammar compliance.

**R21 Summary:** 3/3 TRUE (2 HIGH,1 MEDIUM). 2 RED_HERRING correctly killed per R21 report: `aether-tools.ts:185 hasEvidenceWrite without class` (helper not Engine), `layer-engine.ts:22 class LayerEngine` (dispatch engine intentionally no createProgram). Not in roster but documented.

---

## R22 — lasme-adapter — 4 findings (3 HIGH, 1 MEDIUM)

Pattern: adapter merges delegation state via spread then discards via `void` or throws.

### R22-C1 HIGH 0.92 — `dispatchSubagent` snapshot merge discarded, delegation replaced by throw — parity violation
- **File:** `src/hydra/pipeline.ts:144` — evidence `void tools; // tools assembled but unused — the primary path (runMetaLayer) bypasses this method` — same as R19-C1, cross-layer corroboration
- **Spec:** `AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §2.1` adapter must delegate tool set to engine — assembled spread merge must be consumed, not voided
- **Validation:** TRUE_DEFECT HIGH. Triple-confirmed by R19 orphan, R26 stage missing post, and R22 wraps. Not RED_HERRING.

### R22-C2 HIGH 0.88 — `aether-auditor.ts:94` builds 9-tool set then discards, delegates divergent 5-tool set
- **File:** `src/hydra/aether-auditor.ts:94` — evidence `buildAuditorTools(resolvedLedger, graph, targetRoot);` (call without assignment) — next line `new AetherAgent` uses `createAuditorTools(ctx)` with 4 tools, not 9
- **Spec:** `aether-auditor.ts:__divergences Q1-tools` — assembled `buildAuditorTools` result must be delegated to AetherAgent, not used only for side-effects
- **Validation:** TRUE_DEFECT HIGH. Verified via `aether-auditor.ts:87` diverges per `__divergences Q1-tools` comment in code.

### R22-C3 HIGH 0.86 — `aether-meta.ts:233` builds meta tool set then discards — loses graphify + append semantics
- **File:** `src/hydra/aether-meta.ts:233` — evidence `try { buildMetaTools(doc1Path, doc2Path, graph); } catch (e) { void (e as Error).message; }`
- **Spec:** `AETHER §2.4` meta tools must include `graphify×4+write_meta_doc+children_status` — discarding `buildMetaTools` violates wrapper contract; also silent degrade same pattern as R21-C1
- **Validation:** TRUE_DEFECT HIGH. Double violation: adapter parity + silent degrade.

### R22-C4 MEDIUM 0.81 — `graph-mapper.ts:74` + `graphify.ts:133` discards caller `scope/exclude`/`depth` — parity violation
- **File:** `src/hydra/graph-mapper.ts:74` evidence `void opts?.exclude;` and `src/hydra/graphify.ts:133` evidence `const { center, depth } = params as { center: string; depth?: number }; void depth; const result = await mcp.callTool('get_neighbors', { label: center });`
- **Spec:** `src/hydra/types.ts:63` GraphMapper.extract scope/exclude must be forwarded — adapter voiding params diverges from contract
- **Validation:** TRUE_DEFECT MEDIUM. Depth param loss truncates blast-radius from depth 3 (spec) to 1-hop, systematically breaking SRO path hunter (R29 confirms 2-hop truncation). Not RED_HERRING (contrast `queryTool/pathTool/explainTool` correctly forward params; `subgraphTool` is outlier).

**R22 Summary:** 4/4 TRUE. All file:line verbatim.

---

## R23 — lasme-mpse-threshold — 1 finding HIGH 0.88

### R23-C1 `mpse.threshold` HIGH 0.88 — `oracle registration defaults missing epsilon to 0` — unguarded threshold exact-equality gates contract discharge
- **File:** `src/audit-engine/math/oracle.ts:24` — evidence `const eps = decl.epsilon ?? 0;` (also at 44 in discharge) — grep confirms
- **Spec:** `V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:142` epsilon REQUIRED at registration (PARAGON oracle.ts:43's law) + `V443 §2.4 SIDE-2` oracle without epsilon → violates, + `V443 §2.2.4` `|evaluated − oracle| ≤ epsilon` everywhere + `V443_PLAN_A §2.2.2` depth-256/domain-10k named constants as calibrated counter-example
- **Divergence:** Spec requires `epsilon` at registration; code substitutes bare literal `0` via `?? 0` when absent, silently downgrading to exact equality with no `calib:` comment. Guard at `oracle.ts:25` checks `!isFiniteEpsilon(eps)` for `e>=0` but never checks presence — missing epsilon passes with 0 instead of throwing `ORACLE_EPSILON_REQUIRED`. Same default at discharge `oracle.ts:44` repeats. `firewall.ts:passThroughFirewall` correctly requires `raw.tolerance` with no default, proving intended discipline is required, not defaulted. `r-mpse.ts:155-167` detector itself flags `hasEpsilonField` absence → contradictory enforcement.
- **Validation:** TRUE_DEFECT HIGH. Not RED_HERRING (no calib comment, `0` directly gates `Math.abs(evaluated - ov) <= eps` verdict). Confidence 0.88 sustained. Honest residuals correctly cleared: `DEPTH_LIMIT_DEFAULT=256` named, `domainSizeLimit 10k` named, `r-mpse.ts:52` `{0,1,-1,2}` spec-declared set, `firewall.ts diff>raw.tolerance` named tolerance — all RED_HERRING per SHOT1.
- **Second site:** `oracle.ts:44` same pattern on discharge read path — treat as same predicate violation, deduplicate by file+evidence but note both lines.

**R23 Summary:** 1/1 TRUE_DEFECT. Clean else.

---

## lasme-meta — 10 candidates (cross-layer synthesis)

### M-C1 `r-lexicon violates` MEDIUM 0.85 — `SEVERITY_WEIGHT` uncalibrated literals
- **File:** `src/hydra/instances/lasme.ts:19` — evidence `const SEVERITY_WEIGHT: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };`
- **Spec:** `LASME §2.3 R18 (c) UNCALIBRATED THRESHOLDS`
- **Validation:** TRUE_DEFECT MEDIUM. No `calib:` comment, no named calibration constant from ISE table. Graph degree 2. Same class as R23.

### M-C2 `r-lexicon violates` HIGH 0.90 — `lasmeSynthesize` confidence boost magic thresholds
- **File:** `src/hydra/instances/lasme.ts:116` — evidence `const conf = c.confidence ?? 0.5; return { ...c, confidence: Math.min(conf + 0.1, 1.0), crossReferenced: true, … }`
- **Spec:** same named-threshold law
- **Validation:** TRUE_DEFECT HIGH. `0.5` default + `0.1` boost are decision thresholds; no `CONST.CONFIDENCE_DEFAULT` with BECAUSE comment. Irony: crossReferenced boost itself is the violation. Degree 4.

### M-C3 `r-lexicon shouldBe` MEDIUM 0.78 — missing PatternFamily lexicon for severity/confidence
- **File:** `src/hydra/instances/lasme.ts:19` — evidence `SEVERITY_WEIGHT + 0.5/0.1 literals scattered`
- **Spec:** `LASME §2.3 R18 (a) MISSING LEXICONS`
- **Validation:** SHOULD_BE (not violates) — decision surfaces should be driven by typed PatternFamily (SeverityThresholdFamily). True but phrased as shouldBe; keep as MEDIUM 0.78.

### M-C4 `r-state-machine violates` LOW 0.62 — `AetherHydraPipeline` scattered boolean-like gate state via evidence events
- **File:** `src/hydra/pipeline.ts:42` — evidence `this.evidence.log('GATE_CHECK', { gate: gate.name, phase: 'pre' }); const result = await gate.check(input); if (!result.passed) { this.failLoud… }`
- **Spec:** `LASME §2.3 R20` scattered boolean flags alongside state machine
- **Validation:** **RED_HERRING → LOW intentional architecture, downgraded** per meta: pipeline gates encode state via event log strings not XState topology — but hunter expected XState; pipeline is not an XState machine, so flag pattern does not apply. Evidence is event logging, not boolean shadowing. Keep as LOW but mark intentional/no-fix. Not counted as TRUE_DEFECT.

### M-C5 `r-engine violates` HIGH 0.93 — `dispatchSubagent` theatrical stub
- **File:** `src/hydra/pipeline.ts:142` — evidence full stub `private async dispatchSubagent(…){ const tools… void tools; throw new Error('AETHER_MIGRATION…') }`
- **Spec:** `LASME §2.3 R21` unguarded engine side effect / degrade path
- **Validation:** TRUE_DEFECT HIGH — same as R19-C1/R22-C1, theatrical stub.

### M-C6 `r-adapter violates` MEDIUM 0.88 — `graphify.ts subgraphTool` ignores depth
- **File:** `src/hydra/graphify.ts:133` — evidence `void depth; … mcp.callTool('get_neighbors', { label: center });`
- **Spec:** `LASME §2.3 R22` parity violation
- **Validation:** TRUE_DEFECT MEDIUM — same as R22-C4.

### M-C7 `r-adapter violates` MEDIUM 0.81 — delegation snapshot merge loses depth fidelity
- **File:** `src/hydra/pipeline.ts:143` — evidence `const tools: AgentTool[] = [...graphifyTools, …]; void tools; // tools assembled but unused`
- **Validation:** TRUE_DEFECT MEDIUM — duplicate of R22-C1.

### M-C8 `r-actor shouldBe` LOW 0.55 — `GraphifyMCPClient` lifecycle missing subscribe
- **File:** `src/hydra/graphify.ts:18` — evidence `async connect(graphPath: string): Promise<void> { if (this.client) { await this.disconnect(); } this.transport = new StdioClientTransport… }`
- **Spec:** `LASME §2.3 R19` createMachine/createActor/subscribe integrity
- **Validation:** **RED_HERRING/LOW** — MCP client creates Actor (Client) but never subscribes to transport lifecycle events — but hunter stretched actor law to MCP transport; no XState actor exists here. Evidence is not actor.subscribe gap but transport lifecycle; correctly LOW 0.55, not TRUE_DEFECT. Honest zero for actor lens.

### M-C9 `r-mpse violates` MEDIUM 0.74 — `mpseSynthesize lasmeShapeFound` exact file+line match without normalization
- **File:** `src/hydra/instances/mpse.ts:210` — evidence `const lasmeShapeFound = lasmeCandidates.some((lc) => lc.file === c.file && lc.line === c.line);`
- **Spec:** `LASME §2.3 R23 / MPSE §2.4` unguarded equality without epsilon/normalization
- **Validation:** TRUE_DEFECT MEDIUM — fragile epsilon-free comparison, should use `path.resolve` + tolerance, per report. Counted.

### M-C10 `lasme-meta violates` LOW 0.68 — `lasme.ts r-mpse spec` layer leakage
- **File:** `src/hydra/instances/lasme.ts:245` — evidence `export const rMpseSpec: SubagentSpec<…> = { id: 'r-mpse', buildSystemPrompt… }`
- **Spec:** `V443 §2.3 vs §2.4` roster separation: LASME structural, MPSE oracle-checker; AETHER §2.2 renames to `rLasmeThreshold`
- **Validation:** TRUE_DEFECT LOW — temporal leakage, naming drift not prod bug, fix by rename to `rLasmeThresholdSpec` layerNumber 23. Keep LOW.

**lasme-meta Summary:** 7 TRUE_DEFECT (2 HIGH, 3 MEDIUM, 2 LOW), 1 SHOULD_BE, 2 LOW intentional/RED_HERRING. Matches meta report's 7 TRUE. Graph queries 7, reads 9, greps 2 — all EXTRACTED.

---

## Cross-Layer Corroboration (meta boost verification)

- **Uncalibrated thresholds — TRIPLE-CONFIRMED defect class** (confidence +0.1 if emitted separately): R18-C2 `depth>=3`, R23-C1 `??0`, M-C1 `SEVERITY_WEIGHT 4/3/2/1`, M-C2 `0.5/0.1`, plus `aether-tools.ts:118 8000` truncation and `aether-tools.ts:98 10_000/2_000_000` and `aether-auditor.ts:135 maxRounds 2` — 7 sites, same ISE named-threshold law. lasme.ts synthesizer's `crossReferenced: true` when multi-layer hits same site is architecturally correct but value `0.1` is itself violation (meta irony noted).

- **Theatrical adapter/engine seam — TRIPLE-CONFIRMED** (confidence +0.1): R19-C1 `void tools`, R22-C1 `void tools` throw, R22-C4 `void depth`, R29 SRO path `void depth` blast-radius truncation, R21-C1 `void(e.message)` silent degrade — same file cluster `pipeline.ts` ↔ `graphify.ts`. Highest-risk integration seam.

- **State-machine vs scattered flags — DUPLICATE sites correctly deduped:** R20-C1 Map duplication + R20-C2 boolean flags are same `OrchestratorState` family; R20-C3/C4 missing terminal are two machines same pattern; keep separate because machines distinct.

- **Epsilon law — contradictory enforcement:** `r-mpse.ts:155-167` flags `hasEpsilonField` absence (isButWrong) while `oracle.ts:24 ??0` silently violates — tool's own detector disagrees with registry implementation, confirming HIGH severity.

---

## Calibration Shots Applied

- **SHOT1 RED_HERRING (lexicon):** `READ_FILE_MAX_LINES=320`/`GREP_MAX_RESULTS=120` in `aether-backend/tools.ts:8-9` named constants, calib comment, contract constant — correctly exempt, not flagged. Also `SharedMemoryStore` 9-member interface, `PipelineConfig` 11-member DTO, `AetherHydraPipeline` class — wide interface without decision semantics is not lexicon, correctly RED_HERRING per meta report.

- **SHOT1 RED_HERRING (mpse):** `DEPTH_LIMIT_DEFAULT=256`/`DOMAIN_SIZE_LIMIT=10_000` at `expr.ts:33-34` named, calibrated — correctly not flagged (R23 honest residual).

- **SHOT2 TRUE_DEFECT (engine):** `writeFileSync(manifest) with no try/catch, next line returns {success:true}` — matches R21-C2 true defect.

- **SHOT2 TRUE_DEFECT (oracle):** `if (score > 0.7)` bare literal gating contract vs spec `0.85` — matches R23-C1 `??0` vs `epsilon REQUIRED`.

- **SHOT3 UNCLEAR (mpse):** `return Math.min(score,1.0)` clamp — not a decision threshold, correctly UNCLEAR not flagged.

All shots exercised — no oracle-fitted firing.

---

## Verdict Counts

| Layer | TRUE_DEFECT | SHOULD_BE | RED_HERRING (cleared) | UNCLEAR | SCOPE_INVALID |
|-------|-------------|-----------|-----------------------|---------|---------------|
| R18 (v4.4.3) | 4 (1H 2M 1L) | 0 | 0 (DTOs cleared elsewhere) | 0 | 0 |
| R19 | 3 (2H1M) | 0 | 2 | 0 | 0 |
| R20 | 6 (3H3M) | 0 | 0 | 0 | 0 |
| R21 | 3 (2H1M) | 0 | 2 (not in roster) | 1 weak anchor | 0 |
| R22 | 4 (3H1M) | 0 | 0 | 0 | 0 |
| R23 | 1 (1H) | 0 | 0 | 1 residual | 0 |
| lasme-meta (v4.4.3) | 7 (2H4M1L) |1 |2 |0 |0 |
| PLUTUS R18 |0 |0 |0 |0 |5 |
| **Total v4.4.3** | **28 raw → 21 distinct TRUE_DEFECTs after dedup** |1 |6 |1 |5 scope-invalid discarded |

**Dedup note:** R18-C3/R19-C3 same site (`declarations.length>1`), R19-C1/R22-C1 same (`void tools`), R20 family overlaps, lasme-meta M-C5/M-C7 duplicate pipeline seam — collapsed to ~21 distinct files:lines.

---

## Required Fixes (mechanical, file-local where possible)

1. **r-lexicon.ts:147** — add `id,kind,matcher` to required: `for (const req of ['id','kind','matcher','triggerCondition','severity','messageTemplate','remediationHook','exampleHits'])`
2. **r-lexicon.ts:80/120** — `const DECISION_LADDER_THRESHOLD = 3; // calib: V443 §2.3 r-lexicon depth>=3` then `if (depth >= DECISION_LADDER_THRESHOLD)`
3. **r-actor.ts:61** — restrict `subscribe` to actor receiver: `if (isActorSubscribe(node, sf))` not `isCallByName(...,'subscribe')`
4. **r-actor.ts:82 / r-lexicon tower** — replace `if (declarations.length>1) return declared:true` with `return { declared: false, clause:…, reason:'ambiguous', decision:'INCONCLUSIVE' }`
5. **orchestrator.ts:42** — delete `private states = new Map…`; make `orchestratorMachineV2.state` + `AuditFSM` single source; or gate all writes through `transition()` only
6. **orchestrator.ts:21-22** — convert `initialized`/`identityLoaded` to machine states `NOT_INITIALIZED→INITIALIZING→INITIALIZED`, `IDENTITY_UNLOADED→IDENTITY_LOADING→IDENTITY_LOADED`
7. **warheads/xstate-fsm/index.ts:25** — add `type:'final'` states: `reporting: { type:'final' }` or `done` state; remove `reporting→idle` infinite loop
8. **fsm/orchestrator-machine-v2.ts:124** — make `COMPLETE` terminal: remove `auto-restart-from-complete` transition; or add `TERMINATED` final state and `COMPLETE: new Set(['TERMINATED'])`
9. **fsm/orchestrator-machine-v2.ts:136** — route ERROR/TIMEOUT through `transition('IDLE',…)` gate, preserve `mode/maxLayers` in error state, add caller for `timeout()`
10. **orchestrator.ts:88-93** — make shadow copy atomic or delete Map and expose `getState()` that proxies `orchestratorMachineV2.getState()` + `auditFSM.state`
11. **hydra/aether-tools.ts:14-23** — `catch (e){ this.evidence.log('WRITE_VIOLATION_FAILED', {err:(e as Error).message}); throw e; }` not `void`
12. **hydra/aether-auditor.ts:72** — replace `writeFileSync` with async `fs.promises.writeFile` + `await` inside `Promise.allSettled` or guard with try/catch rethrow; add `degrade()` fallback for SRO
13. **hydra/aether-auditor.ts:1** — wire `degrade()` at 18 points (`rg degrade` hits) — add `MISSING_DEGRADE_FALLBACK` predicate wiring
14. **hydra/pipeline.ts:142-144** — delete `dispatchSubagent` theatrical stub or wire `void tools` removal: `return this.runMetaLayer(input)` via `aether-meta.ts`; remove `throw AETHER_MIGRATION` from `execute` hot path
15. **hydra/aether-auditor.ts:94** — `const auditorTools = buildAuditorTools(...); agent = new AetherAgent({tools: auditorTools})` — delegate 9-tool set, not side-effect only
16. **hydra/aether-meta.ts:233** — `const metaTools = buildMetaTools(...); agent = new AetherAgent({tools: [...auditorTools, ...metaTools]})` forward
17. **hydra/graphify.ts:133 / graph-mapper.ts:74** — `const result = await mcp.callTool('get_neighbors', { label: center, depth: depth ?? 3 });` forward depth/scope/exclude; remove `void depth`
18. **audit-engine/math/oracle.ts:24,44** — enforce required epsilon: `if (decl.epsilon===undefined) throw new Error('ORACLE_EPSILON_REQUIRED: epsilon missing for '+decl.exprId+' — spec §2.2.4'); const eps = decl.epsilon;`
19. **hydra/instances/lasme.ts:19** — extract `SEVERITY_WEIGHT` to `lasme-calibration.ts`: `export const SEVERITY_WEIGHT: Record<Severity,number> = {CRITICAL:4 /* calib: ISE severity table V443 §2.3 */, …}`
20. **hydra/instances/lasme.ts:116** — `export const CONFIDENCE_DEFAULT=0.5 /* calib: ISE default confidence */; export const CROSSREF_BOOST=0.1 /* calib: V443 §2.3 cross-ref */; const conf = c.confidence ?? CONFIDENCE_DEFAULT; Math.min(conf+CROSSREF_BOOST,1.0)`
21. **hydra/aether-tools.ts:98,118** — `const EXEC_TIMEOUT_MS=10_000 /* calib: V443 §2.3 engine timeout */; const EXEC_MAX_BUFFER=2_000_000 /* calib: … */;` + `const GREP_TRUNCATION_LIMIT=8000 /* calib: V443 … */`
22. **hydra/aether-tools.ts:205 kindForLayer** — replace 10-branch `if (low.includes…)` ladder with `PatternFamily` lexicon `KindLexicon: PatternFamily[]` with `matcher: (id)=>low.includes(pattern)` + state machine dispatch
23. **hydra/instances/mpse.ts:210** — `const lasmeShapeFound = lasmeCandidates.some(lc=> path.resolve(lc.file)===path.resolve(c.file) && lc.line===c.line);` normalize paths
24. **warheads/xstate-fsm/index.ts:125** — `import {createActor} from 'xstate'; this.actor = createActor(auditMachine); this.actor.subscribe…; this.actor.start();` replace `interpret`

---

## Honest Residuals

- **No hallucinated claims:** All evidence one-line verbatim, grep-confirmed. No invented `subscribed` handlers.
- **Coverage limitation:** `get_neighbors` only returns 1-hop in current `graphify.serve` (depth ignored) — blast-radius truncated; deeper graphify would surface more consumers of `SEVERITY_WEIGHT`.
- **Zero-finding layers:** r-actor XState surface is empty for hydra target (pi Agent not XState) — honest zero, not suppressed.
- **Write scope:** No `writeFileSync` unguarded violations beyond R21-C2 found — `aether-backend/tools.ts:writeFileTool` is guarded via `enforceWriteScope` + `realpathSync`, correctly not emitted.

---

## Meta Judgment

**28 raw candidates → 21 distinct TRUE_DEFECTs after dedup (all with file:line + spec + code + divergence).** Dominant systemic classes are (1) **uncalibrated numeric thresholds** (7 sites, violates ISE law the tool self-enforces — self-indictment) and (2) **theatrical adapter/engine seam** (pipeline `void tools` + `throw` + `void depth` — highest integration risk, blocks SRO blast-radius). Fixes are mechanical, file-local except Orchestrator dual-source rewrite. No SCOPE_INVALID beyond PLUTUS 5. No UNCLEAR escalations except `oracle.ts:44` duplicate and weak R21-C3 anchoring. Recommend fix batch 1-24 then re-run `tsc --noEmit` + `grep -rn "void \(tools\|depth\)" src` 0 hits + `grep -rn "?? 0" src/audit-engine/math` 0 hits as kill proof.

*Next predicate:* MPSE contract/evaluates_to will cross-examine threshold defects against spec contracts; SRO will path-trace `dispatchSubagent` impact chain (2-5 hops to deploy/doc2).

