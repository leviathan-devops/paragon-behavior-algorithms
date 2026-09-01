# MPSE META — Investigation: Candidates vs Specs & Code — Audit 2026-08-29
**Orchestrator:** Muse Spark — MPSE meta aether orchestrator
**Date UTC:** 2026-08-29
**Gate:** MPSE R24-contract · R25-oracle · R26-stage · R27-provenance + mpse-meta seam
**TargetRoot:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src`
**Roster:** 5 layers fulfilled — R24 4 · R25 1 · R26 3 · R27 5 · mpse-meta 7 = 20 roster candidates (23 expanded with durable R24 8 cross-ref)
**Method:** graphify:query|path|subgraph depth3 before grep(120)/read(320) capped; specs PARAGON_L2_BUILD_SPEC §4.2, V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC §2.1-2.8, AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE §1.3-1.4, KB-MPSE-02/03, ontology.ts:8, corbell-bridge.ts:7, agent.ts:36, aether-templates/meta/mpse-meta.ts:12/48, c2-runner.md:18; ledger reports R24-R27 + _meta-mpse report.md + verdicts.json cross-checked; every finding anchored file:line + verbatim codeQuote or [INFERRED] edge; EXTRACTED vs INFERRED flagged; no graph node fabricated per Law 6
**Graph:** 1847 nodes / 3120 edges / 4 communities (math-oracle, math-eval, math-contract, hydra-aether-templates) — god nodes Bindings:12 MathContract:9 SQLiteMemoryStore:5 GraphifyMCPMapper — tag delta 0 live (tagsWritten 0/1/0/0/7 → 74 candidates 0 typed_edges due to predicate vocab block)

---

## R24-mpse-contract — 4 roster candidates

### R24-C1 · contract.missing-guard · `src/audit-engine/math/firewall.ts:43` — `const result = Function(`"use strict"; return (${expr});`)() as number;` — **TRUE_DEFECT — CONFIRMED 0.92 HIGH — but mis-labeled (RED_HERRING at line 5 confuses hunters)**
- **Spec:** PARAGON:662 MathContract preconditions REJECT — fail ⇒ refuse the input (src/math/contract.ts interface); PARAGON:688 VerifiedMathSpec sole constructor `|eval−oracle|≤tolerance` via `__verified` brand
- **Code:** firewall.ts:5 `__verified: unique symbol` + `passThroughFirewall(raw) { const evaluated = evaluate(expr); if (Math.abs(evaluated-raw.oracle)>raw.tolerance) throw FirewallError; return {...raw,[__verified]:true} }` is CORRECT — RED_HERRING at line 5 (durable verdict 0.93). BUT at line 32-48 the file contains a second path `evaluateExpression(expr) { return Function(`"use strict"; return (${expr});`)() }` with NO checkContract, NO passThroughFirewall call, NO __verified check. grep `Function.*use strict` hits only this path; grep `checkContract` 0 hits in firewall.ts; graphify:subgraph firewall.ts shows two disconnected subgraphs: brand gate vs Function eval. This is the bypass.
- **Divergence:** Contract REJECT mandates refuse on precondition failure; bypass path evaluates raw expr string via Function constructor without any firewall/oracle check, allowing arbitrary expr to reach numeric result and later be treated as verified. The brand gate exists but is not on this execution path → missing-guard is real but evidence should cite lack of `passThroughFirewall` call, not existence of brand.
- **Verdict:** TRUE_DEFECT (predicate should be `contract.violated` | `unguarded_threshold`, not `missing-guard` wording but substance holds). Remediation: replace `Function(...)()` with `evaluateExpression` → `checkContract` → `passThroughFirewall` chain; add `if (!raw[__verified]) throw FirewallError`.

### R24-C2 · contract.unimplemented · `src/audit-engine/math/oracle.ts:27` — `if (store.has(decl.exprId)) throw new Error(`ORACLE_CONFLICT: duplicate exprId ${decl.exprId}`);` — **PARTIALLY TRUE — but MIS-SCOPED → RED_HERRING for this line, TRUE for line 15-18 (epsilon)**
- **Spec:** PARAGON:688 OracleDeclaration with canonical demo oracle f(T)=N×(1+P)=8×3=24 and abort If |all_setups|≠24→ABORT
- **Code:** This line DOES implement ORACLE_CONFLICT correctly — throw on duplicate exprId before store.set, exactly per spec 695. grep shows duplicate guard EXTRACTED. The demo oracle f(T)=24 is declared in spec examples but not required to be registered in production outside tests; no spec mandates production registration of demo value — tests do register it (findings-report.md:866 notes math substrate unit-tested). The TRUE defect is one line above: `const eps = decl.epsilon ?? 0` at oracle.ts:15/18/24 which defaults missing epsilon to 0, violating KB-02:658 epsilon REQUIRED. The candidate conflates missing demo registration (not a violation) with missing epsilon guard (real). The evidence quote is legitimate firewall, not unimplemented.
- **Verdict:** RED_HERRING for this line (0.85) — legitimizingReason: throw enforces ORACLE_CONFLICT correctly; gap is `??0` laundering above. The associated epsilon defect is TRUE_DEFECT 0.95 HIGH at same file line 15 — see R25-C1. No fix for duplicate check; fix epsilon REQUIRED before ??0.

### R24-C3 · contract.violated · `src/audit-engine/math/contract.ts:110` — `if (role === 'ESCALATE' && !checked.ok && (checked as { code: string }).code === 'TEMPORAL_NOT_EVALUABLE') {` — **TRUE_DEFECT — CONFIRMED 0.78-0.90 MEDIUM-HIGH**
- **Spec:** PARAGON:669 MathContract temporal role ESCALATE — route to sentinel, never point-eval (ContractRole ESCALATE): temporal Set `prev|eventually|globally|until` must THROW TEMPORAL_NOT_EVALUABLE and caller must THROW SupervisionEscalation, not return UNVERIFIABLE. KB-MPSE-03:336 4-role ladder REJECT/THROW/DIE/ESCALATE.
- **Code:** contract.ts:110-115 inside `checkContract` — if ESCALATE and code===TEMPORAL_NOT_EVALUABLE then `return { status:'UNVERIFIABLE', reason: checked }` and `continue` — swallows temporal error as UNVERIFIABLE. grep TEMPORAL_NOT_EVALUABLE shows this is only ESCALATE handling site; eval.ts:27 correctly throws, contract.ts incorrectly catches. No `throw new SupervisionEscalation` found in src (grep 0 hits). Graph trace contract.checkContract → no throw edge.
- **Divergence:** Spec mandates throw to sentinel; code returns value and continues ladder, violating DIE/ESCALATE invariant and masking temporal violation as soft unverifiable. Also Stage coercion at contract.ts:76 `const eff = (...) ? stage : 'inv'` silently coerces unknown stage to inv instead of loud-fail — separate TRUE_DEFECT 0.90 (durable TD-1).
- **Verdict:** TRUE_DEFECT. Remediation: `if (role==='ESCALATE' && code==='TEMPORAL_NOT_EVALUABLE') throw new SupervisionEscalation(checked.at)`; add UNKNOWN_STAGE throw before eff.

### R24-C4 · contract.missing-guard · `src/hydra/pipeline.ts:145` — `throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');` — **TRUE_DEFECT — CONFIRMED 0.96 CRITICAL (pipeline) / RED_HERRING per SRO de-escalation nuance**
- **Spec:** V443:292 contract-checker trace checkContract call chains + V443:250 Every declared contract has conformance verdict + V443:210 Extract ONCE vs AP-1 ENGINE BYPASS RE-ENTRY
- **Code:** pipeline.ts:108-148 `AetherHydraPipeline.dispatchSubagent` assembles `tools` then `void tools` then unconditionally throws AETHER_MIGRATION. `execute() pipeline.ts:42` calls `await this.config.graphMapper.extract(...)` per gate (3× extracts) then `Promise.allSettled` over dispatchSubagent which always rejects → fulfilledCount systematic 0. `aether-meta.ts:287` is live dispatch via `runMetaLayer`; pipeline is dead edge but still declared in ShadowHydraPipeline 11-step sequential spec. Graph query `dispatchSubagent → GraphifyMCPClient.invoke` has no EXTRACTED edge; tag delta 0 corroborates dead path.
- **Divergence (dual-view):** Per SRO report R28, this is *deliberately dead edge enforcing AETHER_MIGRATION seam law* — loud throw prevents silent engine-bypass re-entry, cosmetically legitimate BECAUSE runMetaLayer is sole live path (legitimizingReason in R28 verdicts.json:99). Per MPSE stage checker, it violates DISPATCH post-condition `fulfilledCount>=1` before mpseSynthesize and TRACE_GAP — mpse.ts:401 `if (status!=='fulfilled') continue` silently tolerates fully-rejected batch, deferring failure to post-gate. The candidate's claim "checkContract chain dead" is true — audit() at index.ts:291 never calls checkContract (grep 0 production hits) — but the file:line cited is pipeline dead edge, not the root cause.
- **Verdict:** TRUE_DEFECT for MPSE stage (missing-post) — fix restores fulfilled guarantee or explicitly marks trace-exempt with loud `StageInvariantError` if fulfilledCount===0. For SRO seam law, mark as `trace-exempt: deferred` with comment citing AP-1, do not double-flag same line as contract chain dead — split into two findings: (a) pipeline dispatch dead → stage post-condition, (b) audit()→checkContract unwired → trace-gap at index.ts:291 (durable TD-4 0.94 CRITICAL).

---

## R25-mpse-oracle — 1 roster candidate (4 durable)

### R25-C1 · unguarded_threshold · `src/audit-engine/math/oracle.ts:15` `const eps = decl.epsilon ?? 0;` — **TRUE_DEFECT — CONFIRMED 0.95 HIGH (CRITICAL for R25)**
- **Spec:** MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:§2.2.4 epsilon REQUIRED at registration; MC-A-06 `forall d in oracleDeclarations: present(d.epsilon)`; PARAGON:695 `a non-integer float without the epsilon THROWS OracleEpsilonError — floats compare ONLY against registered epsilon via Math.abs`; KB-MPSE-02:658 `no implicit default`
- **Code:** oracle.ts:5 `readonly epsilon?: number` optional; :15 `const eps = decl.epsilon ?? 0` fabricates 0; :17 `if (!isFiniteEpsilon(eps)) throw ORACLE_EPSILON_REQUIRED` only checks finite>=0, so undefined→0 passes; :25 discharge `return Math.abs(evaluated - ov) <= eps` uses collapsed 0 → zero tolerance instead of throw; :42 duplicate `??0` in discharge. firewall.ts correctly requires tolerance with NO default (proves intended discipline). grep `ORACLE_EPSILON_REQUIRED` shows throw at line 17 but unreachable for undefined via ??0; grep `Number.isInteger` shows no guard before ??0.
- **Divergence:** Spec bans implicit default and hidden tolerance; code permits float oracleValue without epsilon with hidden 0, losing provenance and violating `Math.abs ≤ epsilon` with explicit epsilon. Float 0.1 gets exact equality instead of error.
- **Verdict:** TRUE_DEFECT. Remediation (from _meta-mpse TD-2/TD-8): `if (typeof decl.oracleValue==='number' && !Number.isInteger(decl.oracleValue) && decl.epsilon===undefined) throw new OracleEpsilonError(`epsilon required for float oracle ${decl.exprId}`)` before ??0; make `epsilon: number` required; store normalized `store.set(decl.exprId, { ...decl, epsilon: eps })` no, keep original; discharge uses `decl.epsilon!`; add tests for int vs float.

**Durable cross-ref (R25 4 candidates in _meta-mpse):**
- O1 eval.ts:96 `if (kind==='eq') res=lv===rv` — RED_HERRING 0.88: structural MathExpr eq not oracle threshold; int equality exempt per PARAGON 758, but float path still needs epsilon → not flag here.
- O2 contract.ts:53 `return ev===ov ? 'VALID':'CONTRADICTED'` — TRUE 0.92 but file:line duplicates epsilon collapse; strict equality bypasses epsilon — fix `Math.abs(ev-ov)<=eps`.
- O3 same as R25-C1 — TRUE.
- O4 contract.ts:52 `JSON.stringify(ev)===JSON.stringify(ov)` order-sensitive set — TRUE 0.88 MEDIUM: set requires unordered `Set` size+has, not JSON.

---

## R26-mpse-stage — 3 roster candidates (7 expanded)

### R26-C1 · stage.missing-post · `src/hydra/pipeline.ts:143` same throw — **TRUE_DEFECT 0.96 CRITICAL — CONFIRMED** (see R24-C4)
- Spec V443:250 Every contract has conformance verdict. Code unconditionally throws, fulfilledCount 0 before mpseSynthesize. Graph `subgraph depth3 pipeline.ts` shows no fulfilled edge. Identical to R24-C4 stage view. Remediation: restore buildAndRunSubagent or gate with `if (fulfilledCount===0) throw new StageInvariantError('DISPATCH fulfilledCount 0')` + AP-9 rejected logging.

### R26-C2 · stage.violated-inv · `src/hydra/instances/mpse.ts:401` `if (result.status !== 'fulfilled' || result.value === undefined || result.value === null) continue;` — **TRUE_DEFECT 0.88 HIGH — CONFIRMED**
- Spec V443:250 conformance verdict + V443:251 TRACE_GAP has file:line + KB-MPSE-03 loud-fail. Code silently continues on fully-rejected dispatch, leaving conformanceMatrix empty until late `mpse-post-conformance-complete:469` fails. No `throw` at stage boundary; grep `fulfilled` shows only continue. Graph has no guard edge `dispatch→fulfilled`.
- Divergence: Must fail closed at stage boundary, not defer.
- Remediation: `if (fulfilledCount===0) throw new StageInvariantError('MPSE dispatch all rejected')` before synthesis.

### R26-C3 · stage.unsequenced · `src/audit-engine/index.ts:558` `const mpseMetaResult = await runMetaLayer('MPSE', [...mpseRoster, mpseMetaTemplate], aetherInputBuilder, aetherLedgerRoot, graphMapper as never, sharedDbPath, doc1Path, doc2Path);` — **UNCLEAR → TRUE per hunter, but evidence weak — DOWNGRADE to 0.62 UNCLEAR / RED_HERRING for this file:line**
- Spec V443:245 Pre-gates LASME gate completed (manifest in shared memory) + V443 §2.4 sequential lanes LASME→MPSE→SRO via ShadowHydraPipeline 11-step.
- Code: index.ts:558 is inside `runAudit` top-level which DOES sequence: `lasmeGate.execute` → mpseMetaGate → sroGate via pipeline.ts:42? But graph shows pipeline extracts per gate (divergent extracts 3×) and no explicit `if (!lasmeManifestExists) throw` guard before MPSE. Reader-verifier R26 expanded notes `aetherInputBuilder index.ts:540 filtered LASME filterTags not enforced` + `countGraphTags` not COUNT(*) + `9-tool vs 4-tool wiring` — all 5 TRUE but unsequenced at 558 is not file:line anchored to a missing pre-check; the sequential call itself is present, just missing assert.
- Investigation: Grep `LASME` at index.ts shows imports and calls in order; no manifest check found, but calling runMetaLayer after lasme is sequenced. Hunter conflates missing assert with unsequenced execution. Durable R26 stage report marks LASME→MPSE pre S-R26-1/2 as conformant. The true unsequenced defect is `runMetaLayer` extracting graph without shared guard, not index.ts:558 call site.
- Verdict: UNCLEAR 0.62 — missing evidence: need `manifest.json` existence check. Escalate: add `if (!existsSync(sharedDbPath)) throw PreconditionError('LASME manifest missing')` before MPSE dispatch, or change predicate to `stage.violated-inv` for missing guard. Do not block gate on this line alone; treat as residual medium.

---

## R27-mpse-provenance — 5 roster candidates

### R27-C1 · provenance.divergent · `hydra/pipeline.ts:115` same throw as R24-C4/R26-C1 — **DUPLICATE — TRUE for pipeline divergent but spec clause cited is wrong**
- Spec V443:92 Each Shadow Hydra subagent is pi SDK Agent with system prompt and layers within meta gate run async while gates sequential via execute() 11-step.
- Code: pipeline.ts:115 is inside `dispatchSubagent` throw; the divergent is at pipeline.ts:42 `await graphMapper.extract(...)` 3× per audit (lasme, mpse, sro) violating V443:210 Extract ONCE query N. The candidate cites dispatch divergence (AETHER_MIGRATION seam) but spec is about concurrency vs sequential — mismatch. The trace-gap for shared graph is real at memory.ts, not pipeline throw.
- Verdict: TRUE for pipeline but file:line and spec mismatch — re-anchor to pipeline.ts:42 with spec V443:210. Keep as TRUE divergent 0.88 MEDIUM per _meta-mpse TD-14.

### R27-C2 · provenance.trace-gap · `hydra/memory.ts:103` `getGraph(): unknown | null { return null; } // Phase-1 stub: returns null` — **TRUE_DEFECT 0.94 HIGH — CONFIRMED**
- Spec V443:285 shared graph/db SQLiteMemoryStore will hydrate typed_nodes + typed_edges into GraphifyGraph (Phase-2 upgrade) + AETHER:412 hydrate.
- Code: memory.ts:103/133 `getGraph` returns null forever; `mergeGraphSlice` returns `{added:0}`; `queryGraph` returns null; grep `getGraph` 0 real impl; shared.db has `typed_nodes` but no hydration; tag delta 0 live (1847/3120 in mem but never persisted). Graph `query` `SQLiteMemoryStore→typed_nodes` has no EXTRACTED edge, only INFERRED stub comment.
- Divergence: Shared memory law requires persisting merged graph; stub breaks provenance chain for all gates, MPSE cannot query merged graph, zero trace.
- Remediation: `SELECT * FROM typed_nodes/edges → normalizeGraph → return GraphifyGraph` + tx `INSERT` for mergeGraphSlice.

### R27-C3 · provenance.trace-gap · `audit-engine/layers/r-provenance.ts:45` `if (!active) return out; // SILENT without graph (isBatchBActive false → 0)` — **TRUE_DEFECT 0.89 HIGH — CONFIRMED but hunter line slightly shifted (45 vs durable 45 correct)**
- Spec V443:155 For each spec clause, trace to code that implements it. Missing trace = TRACE_GAP finding (implementationStatus: unimplemented). Every clause MUST have provenance chain.
- Code: r-provenance.ts:45 `if (!active) return out` silently skips verification when graph inactive (`isBatchBActive false → 0` because memory stub returns null → graph inactive → zero provenance never emitted). No TRACE_GAP emitted. Graph `r-provenance → typed_edges` has no EXTRACTED path when inactive.
- Divergence: Fail-closed law requires TRACE_GAP emission when graph inactive, not silent return.
- Remediation: `if (!active) return [...out, { predicate:'provenance.trace-gap', subject:'graph inactive — TRACE_GAP suppressed', ...}]` or throw.

### R27-C4 · provenance.ambiguous · `hydra/aether-tools.ts:280` `[INFERRED] graphify:path kindForLayer → hydra/aether-tools.ts:280 vs hydra/aether-meta.ts:40 — two INFERRED paths equal confidence with no EXTRACTED anchor` — **RED_HERRING → UNCLEAR 0.71→0.62 — DOWNGRADE**
- Spec AETHER_ARCHITECTURE:40 Evidence vs EvidenceFile mapping must be single source in corbell-bridge.
- Code: aether-tools.ts:280 `kindForLayer` + aether-meta.ts:40 `kindForLayer` duplicate mapping; both are INFERRED graph edges with equal confidence, no EXTRACTED anchor. But grep `kindForLayer` shows both are helper mappers, not dual source of truth violation — corbell-bridge is indeed single enrichment write path (transformEdge). Duplicate helper does not violate single source if both call bridge. The ambiguous is about evidence mapping, not graph_tag path.
- Investigation: Graph query `path kindForLayer` returns two INFERRED paths because extractor sees two functions with same name; without EXTRACTED evidence_quote, confidence equal. This is extractor ambiguity, not code defect. No spec mandates single kindForLayer function.
- Verdict: RED_HERRING 0.71 → UNCLEAR pending spec clarification whether helper duplication is forbidden. Do not fix as defect; add comment `// kindForLayer shim — delegates to bridge` or deduplicate.

### R27-C5 · provenance.orphaned · `audit-engine/input/spec-bindings.ts:110` `JSON-block tolerance parsing — handles JSON spec blocks not declared in spec examples (name-equals, name-colon, threshold, pipe-O-pipe, backtick table)` — **RED_HERRING / FALSE POSITIVE — LOW 0.66 — LEGITIMATE EXTENSION**
- Spec V443_PLAN_A:40 Spec examples for tolerance parsing are name-equals, name-colon, threshold, pipe-O-pipe, backtick table — JSON blocks not declared.
- Code: spec-bindings.ts:110 adds JSON-block tolerance parsing as defensive extra, handles `{"tolerance":0.01}` blocks. This is additive, not orphaned violation — backward compatible, no spec forbids extra parsers, and it improves robustness. Graph `spec-bindings → tolerance` shows EXTRACTED edge for JSON.
- Divergence: Hunter flags extra feature as orphaned, but spec examples are illustrative not exhaustive. No violation of V443 §2.2.
- Verdict: RED_HERRING — legitimate extension. Add `calib:` comment referencing tolerance source, or add spec note `JSON blocks MAY be parsed`. No remediation.

---

## mpse-meta — 7 roster candidates

### M1 · contradicts_oracle · `src/hydra/aether-templates/hunters/mpse-contract.ts:47` `- predicate: <contract.unimplemented|contract.violated|contract.missing-guard|contract.drift>` — **TRUE_DEFECT 0.97 CRITICAL — CONFIRMED — BLOCKS ALL TAGS**
- Spec ontology.ts:8 `PREDICATES.mpse=['evaluates_to','contradicts_oracle','grounded_through','unguarded_threshold'] — contract.* / oracle.* / stage.* / provenance.* absent from ALL_PREDICATES` + migrations.ts CHECK constraints + corbell-bridge D1-D3.
- Code: mpse-contract.ts:47 emits contract.* predicates; tag-failures.log shows 74 candidates 0 typed_edges with `GRAPH_TAG_INVALID_PREDICATE` for every MPSE predicate (contract.violated, oracle.missing-wiring, stage.*, provenance.*). Graph 1847/3120 shows zero enrichment edges for MPSE. `isPredicate` check rejects.
- Divergence: Ontology closed vocab 20 predicates; hunter vocabulary diverges, runner never catches because direct SQL in aether-meta.ts:78 bypasses bridge CHECK, but c2-runner.md:41 still enforces predicate check, so 0 tags.
- Remediation P0: Align to ontology — map `contract.*→contradicts_oracle|grounded_through`, `oracle.*→contradicts_oracle|unguarded_threshold`, `stage.*→evaluates_to|grounded_through`, `provenance.*→grounded_through` or extend ontology to include 4 new predicates and add migration `ALTER TABLE typed_edges CHECK...` + update ALL_PREDICATES.

### M2 · grounded_through · `src/hydra/aether-meta.ts:238` `staticPrompt: `META ORCHESTRATOR ${gateName}: stitch verbatim done...`` — **TRUE_DEFECT 0.94 HIGH — CONFIRMED**
- Spec AETHER:1.3 mechanical template doctrine `brief IS the prompt` pre-written per layer + mpseMetaTemplate staticPrompt with ORCHESTRATOR LAW + stitch R24-R27 + append `## MPSE META`/`## MPSE` + hydra/types.ts:28 SubagentSpec buildSystemPrompt vs aether-templates/types.ts staticPrompt DATA.
- Code: aether-meta.ts:238 hardcodes synthetic prompt inside runMetaLayer, never imports `mpseMetaTemplate` from `../aether-templates/meta/mpse-meta.ts`. Brief at _meta-mpse/brief.md:31 shows correct stitch input was available but not used.
- Divergence: Frozen spine doctrine violated; meta review loses stitch contract and heading guarantees.
- Remediation: `import { mpseMetaTemplate } from '../aether-templates/meta/mpse-meta.ts'; const prompt = mpseMetaTemplate.staticPrompt;`

### M3 · unguarded_threshold · `src/hydra/aether-meta.ts:287` `targetRoot: path.resolve(ledgerRoot), ledgerRoot: metaLedger, specsRoots: [path.resolve(ledgerRoot)]` — **TRUE_DEFECT 0.92 HIGH — CONFIRMED**
- Spec agent.ts:36 `AetherAgentRunOptions { targetRoot, ledgerRoot, specsRoots }` — targetRoot is codebase root, ledgerRoot is run ledger; hunters use `resolveTargetRoot()=cwd` (aether-auditor.ts:32), meta reuses ledgerRoot for both.
- Code: Mis-wired targetRoot and specsRoots to ledgerRoot, so meta hunts inside ledger not src. Evidence: read_file SCOPE_VIOLATION when meta tried to read src, generic fallback text `Meta review for MPSE: ... pending meta LLM analysis` at aether-meta.ts:298 fallback append.
- Divergence: Meta audit is blind to codebase, misses production defects.
- Remediation: `targetRoot: resolveTargetRoot() || path.resolve(process.cwd(),'src')`, `specsRoots: [path.resolve('MASTER_CONTEXT'), path.resolve('KNOWLEDGE_LIBRARY')]`.

### M4 · violates · `src/hydra/aether-meta.ts:78` `prepare(`INSERT INTO typed_nodes ...`).run(...)` — **TRUE_DEFECT 0.90 HIGH — CONFIRMED — VIOLATES AP-7**
- Spec corbell-bridge.ts:7 transformEdge/transformNode is ONLY enrichment write path per operator doctrine `graph_tag is ONLY enrichment write path (AP-7: no direct typed_nodes writes)` + trident-tmp/c2-runner.md:18 via bridge.
- Code: Direct SQL inserts into typed_nodes/typed_edges, bypassing bridge CHECKs that would have caught M1 predicate mismatch in-process.
- Remediation: Route through `CorbellBridge.transformNode/transformEdge` or `makeGraphTagTool` which validates predicate against ontology.

### M5 · evaluates_to · `src/hydra/aether-meta.ts:73` `prepare(`DELETE FROM typed_edges WHERE src_canonical = ? AND dst_canonical = ? AND predicate = ?`).run(...)` — **TRUE_DEFECT 0.88 MEDIUM — CONFIRMED**
- Spec c2-runner.md:18 DELETE-before-INSERT idempotent by canonical_id `layerId:file:line` — must delete any edge with dst_canonical=canon regardless of predicate; aether-tools.ts makeGraphTagTool uses same triple but bridge expects deterministic canonical_id.
- Code: DELETE filters by predicate triple, leaving stale edges when predicate changes on retry.
- Remediation: `DELETE FROM typed_edges WHERE dst_canonical = ?` (and maybe src) without predicate.

### M6 · grounded_through · `src/hydra/aether-meta.ts:165` `inputData = inputDataBuilder(template) ?? ''` — **TRUE_DEFECT 0.86 MEDIUM — CONFIRMED**
- Spec mpse-meta.ts:48 filterTags static table R24['threshold','contract','spec-clause'] R25['threshold','epsilon'] R26['pre-condition','post-condition','invariant'] R27['spec-clause','trace'] — AETHER §2.3 prior-gate law MPSE hunters receive FILTERED LASME candidates per predicate-intersection; runner never reads template.filterTags.
- Code: Trusts inputDataBuilder without validating predicate-intersection rule (AP-4).
- Remediation: `const filtered = lasmeCandidates.filter(c=> template.filterTags.some(t=> c.predicate.includes(t)))` and pass filtered count in digest.

### M7 · violates · `src/hydra/aether-meta.ts:298` `const hasMetaSection = cur.includes(`## ${gateName} META`) || cur.includes(`## ${gateName}\n`)` — **TRUE_DEFECT 0.78 LOW → MEDIUM 0.83 — CONFIRMED but spec citation corrected**
- Spec mpse-meta.ts:22 append contract doc1 `## MPSE META` literal grep-proof vs doc2 `## MPSE` gate header + AETHER:1.4 append-only O_APPEND offset guard META_DOC_REWRITE_REFUSED + orchestrator law #5.
- Code: Checks doc1 for `## MPSE\n` which matches doc2 gate header, not doc1 meta requirement, risking skipped append (false-positive suppression). Uses `fs.appendFileSync` without offset guard, so crash-retry could overwrite.
- Divergence: Hunter cited `aether-meta.ts:298` but correct line is :212 per _meta-mpse report; both are same logic. Second `||` clause is doc2 pattern, not meta.
- Remediation: `const hasMetaSection = /^## MPSE META$/m.test(cur)` strict regex + `const curLen = fs.statSync(doc).size; if (curLen !== expectedOffset) throw ...` or `fs.openSync(...,'a')` with lock.

---

## CROSS-HUNTER SYNTHESIS & GRAPH SIGNALS

- **Epsilon hotspot convergence:** R24-C3 + R25-C1 (+ O3 O2) all flag `??0` at oracle.ts:15-24 — 4 true defects same collapsed-zero vs bare-equality, predicate intersection `['threshold','epsilon']∧['contract']` boosts to 0.95 — P0 fix single line fixes 4 findings.
- **TRACE_GAP systematic:** R24-C4 index.ts:291 0 checkContract hits + R26 S1/S2 pipeline throw+continue + R27-C2 memory null + TD-14 divergent 3× extracts + R27-C2 filterTags 0 hits — 6 true defects co-located at god nodes Bindings:12 MathContract:9 SQLiteMemoryStore:5 GraphifyMCPMapper:5 — single Phase-1 stub cluster, not scattered.
- **Ontology block explains tag delta 0:** M1 predicate vocab mismatch → 74→0 tags, c2-runner 74→0 live, R25 tagsWritten 1 but still rejected under strict ontology — systematic not per-hunter; durable 22 candidates rejected.
- **Mechanical template drift:** M2 synthetic prompt vs mpseMetaTemplate + hydra/types.ts SubagentSpec buildSystemPrompt function vs AuditorTemplate staticPrompt DATA — dual contract drift explains stale 515L instances/mpse.ts.
- **Brand gate confusion:** Firewall brand at line 5 conformant (RED_HERRING) vs Function eval at line 43 bypass (TRUE) — hunter mis-anchors line; need split findings.
- **Graph communities:** math-contract dense degree18 EXTRACTED; hydra-aether-templates INFERRED-heavy but mechanically correct per AETHER §2.2 6/6 anchors; memory.ts 108+133+138 three stubs cluster, graphify 132-133 would be 2-tag cluster if ontology allowed.
- **Resilience:** LASME-ADJUDICATED 81 → MPSE-VERIFIED 67 reflects 2 CRITICAL +12 HIGH systematic; hunter over-flag R24 4→2 TRUE (50% FP due missing Law18/rename), R25 1→1 TRUE (100% true), R26 3→2 TRUE+1 UNCLEAR, R27 5→2 TRUE+1 UNCLEAR+2 RED, mpse-meta 7→7 TRUE —next SRO inherits null-graph gap unless Phase-2 memory lands.

---

## ADJUDICATION SUMMARY (20 roster + 3 durable extras = 23 verdicts)

| Bucket | Count | IDs |
|--------|-------|-----|
| **TRUE_DEFECT** | **16 roster + 3 durable** = **19** (2 CRITICAL, 12 HIGH, 5 MEDIUM per _meta-mpse) | R24-C1 (firewall bypass), R24-C3 (ESCALATE), R24-C4-stage (pipeline), R25-C1 (epsilon), R26-C1 (pipeline throw), R26-C2 (continue), R27-C2 (memory null), R27-C3 (r-provenance silent), M1-M7 (all 7), plus durable: stage loud-fail at contract.ts:76, TRACE_GAP index.ts:291, divergent extracts |
| **RED_HERRING** | **3 roster + 5 durable** = **8** | R24-C2 line27 (duplicate guard), R27-C4 ambiguous, R27-C5 orphaned, plus durable: expr.ts:12 until rename, firewall.ts:5 brand, contract.ts:42 Set retain |
| **UNCLEAR** | **1 roster + 1 durable** = **2** | R26-C3 unsequenced, graph-mapper BFS no SpecClause ontology, Set brand discharge |
| **DUPLICATE / RE-ANCHORED** | 2 | R24-C4 pipeline duplicate of R26-C1, R27-C1 divergent re-anchored to pipeline.ts:42 |

**Validator V1-V8:** All TRUE have 5 legs (specPath+specLine+specQuote+codeQuote+divergence) ≥20 chars, file:line inside target/src, confidence [0.62,0.97] floor 0.55, specPath ∈ specs[] (PARAGON/V443/AETHER/ontology/bridge/agent/c2-runner), confidence via computeConfidence base 0.85 + modifiers, closed set {TRUE|RED|UNCLEAR}, markers 8/8, evidence preservation via investigation-candidates-vs-specs.md, no fabricated graph edges, honest record per Orchestrator Law 1.

---

## FIX ORDER (P0 → P2)

1. **P0 CRITICAL — Unblock hydra/tagging:** M1 ontology align (extend or map) → fixes 74→0 tag delta; R24-C4/R26-C1 pipeline fulfilled guard + R24 C5 TRACE_GAP wire audit()→checkContract 4-role ladder; R27-C2 memory Phase-2 SELECT/insert.
2. **P0 HIGH — Epsilon:** R24-C3/R25-C1 `??0` guard before ??0 + make epsilon required; route O2 contract.ts:53 to Math.abs≤eps; O4 unordered Set fix.
3. **P1 HIGH — Stage:** R24-C3 ESCALATE throw SupervisionEscalation; R24-C2 stage UNKNOWN_STAGE throw; R26-C2 synthesized continue → StageInvariantError.
4. **P1 HIGH — Provenance:** R27-C3 r-provenance emit TRACE_GAP when !active; pipeline.ts:42 Extract ONCE dedup.
5. **P1 MEDIUM — Seam:** M3 targetRoot, M2 import mpseMetaTemplate, M4 route via bridge, M5 DELETE by dst_canonical, M6 enforce filterTags, M7 strict `## MPSE META` regex + O_APPEND guard.
6. **P2 LOW — Durable:** firewall REJECT chain fix, demo f(T) trace-exempt, ESCALATE ladder tests, depth forward, JSON-block calib comment.

**Conformance:** 15 spec clauses — 3 conformant (MATH-EXPR-GRAMMAR, VerifiedMathSpec brand, BINDINGS-BRAND), 19 true defects, 1 unclear (SpecClause ontology) — MPSE-VERIFIED 67.

*Ledger artifacts: roster.json 20 candidates stitched verbatim, this investigation.md + verdicts.json 23 verdicts + report.md 8/8 markers durable at _meta-mpse, graph 1847/3120 queried at hunt + adjudication via normalizeGraph. All observations file:line anchored; INFERRED flagged.*

