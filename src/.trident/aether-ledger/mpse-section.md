# AETHER FINDINGS REPORT — MPSE

## MPSE
## R24 — R24-mpse-contract
# R24 CONTRACT HUNT — MPSE Contract Conformance

**Hunt Predicate:** `contract.*` — contract conformance, unimplemented, violated, missing-guard, drift  
**Layer:** `R24-mpse-contract` (contract-checker per V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC §2.4: trace `contract.checkContract()` call chains + find implementations matching spec declarations)  
**Target Root:** `src/` (verified via stat on ledgerRoot `src/.trident/aether-ledger/R24-mpse-contract`)  
**Spec Roots:** `PARAGON_L2_BUILD_SPEC.md §4.2` (master contract substrate: MathContract / ContractRole / OracleRegistry / BrandedVerdict / checkContract) and `V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC §2.4` (MPSE gate roster)  
**Method:** Graph-first → file verification. Ran scoped grep for `checkContract`, `OracleDeclaration`, `Function\(`, `SupervisionEscalation` across target+specs (≤120 results, rg+grep fallback), then direct `read_file` on 6 source files (contract.ts, firewall.ts, oracle.ts, pipeline.ts, eval.ts, hydra/instances/mpse.ts) plus full reads of two spec files at lines 640–740 and 260–340. Compared each declared spec clause to implementing code, checked call chains for guard presence, stage-role ladder, and registration wiring. Cross-checked LASME filterTags `['threshold','contract','spec-clause']` — no LASME candidate carried a conformant contract shape; all contract sites were TRACE_GAP.

---

## FINDING: checkContract guard absent on firewall expression evaluation path — raw Function eval without REJECT
- layer: R24-mpse-contract
- predicate: contract.missing-guard
- subject: evaluateExpression
- object: MathContract
- file: src/audit-engine/math/firewall.ts:43
- line: 43
- evidence: "const result = Function(`\"use strict\"; return (${expr});`)() as number;"
- spec: PARAGON_L2_BUILD_SPEC.md:659-666 — `MathContract.preconditions` role `REJECT` — "fail ⇒ refuse the input" (REJECT/THROW/DIE/ESCALATE ladder KB-03:1029). Firewall is the validation boundary and must refuse via `PreconditionRejected` through `checkContract`, not via generic Error or unchecked eval.
- severity: HIGH
- confidence: 0.92
- crossReferenced: false
- graphRefs: ["graphify:query 'find function implementations matching spec declarations' → no graph edge links firewall.ts:43 to any MathContract node [INFERRED: no EXTRACTED edge]"]
- detail: File verified 2026-08-31 via `read_file` on `src/audit-engine/math/firewall.ts` (62L). The module imports only `InvariantDeath` and never imports `checkContract`. `evaluateExpression` sanitizes via `SAFE_EXPR_RE`/`IDENT_RE`/`ALLOWED_FNS` then executes `Function` eval. On disallowed tokens it throws generic `Error("Expression contains disallowed tokens...")`; on non-finite result it throws `InvariantDeath`. Neither path evaluates a `MathContract` precondition via `checkContract(..., 'pre', bindings)` to produce `PreconditionRejected` (REJECT). `passThroughFirewall` only checks oracle mismatch (`Math.abs(evaluated - oracle) > tolerance` → `FirewallError`), not a branded contract. No caller in `src/` guards this path with `checkContract`. This bypasses the spec-mandated REJECT boundary.

## FINDING: Oracle contract f(T)=N×(1+P)=24 declared but no production registration — TRACE_GAP / unimplemented
- layer: R24-mpse-contract
- predicate: contract.unimplemented
- subject: f(T)=N*(1+P)
- object: OracleDeclaration
- file: src/audit-engine/math/oracle.ts:27
- line: 27
- evidence: "if (store.has(decl.exprId)) throw new Error(`ORACLE_CONFLICT: duplicate exprId ${decl.exprId}`);"
- spec: PARAGON_L2_BUILD_SPEC.md:688-695 — `OracleDeclaration` with canonical demo oracle `f(T) = N × (1 + P) = 8 × 3 = 24` and abort `If |all_setups| ≠ 24 → ABORT` (KB-01:311). Discharge discipline: INTEGER EQUALITY `evaluated === oracleValue ⇒ VALID` else `CONTRADICTED`.
- severity: MEDIUM
- confidence: 0.86
- crossReferenced: true
- graphRefs: ["graphify:path 'path spec clause reference to code implementation' from `PARAGON_L2_BUILD_SPEC.md:688` to `src/audit-engine/math/oracle.ts` → no EXTRACTED path; only INFERRED via exprId string"]
- detail: Verified via `read_file` on `src/audit-engine/math/oracle.ts` (98L). Registry implements `register` with epsilon-required check and `ORACLE_CONFLICT` on duplicate, `discharge` with `Math.abs(evaluated - oracle) <= epsilon`. Constant `UNIMPLEMENTED_ORACLE_TODO` (line 16) notes pending wiring. No production file in `src/` registers canonical `f(T)=24` — only test `src/audit-engine/math/math.test.ts` exercises it. Grep `all_setups|f\(T\)` across src returned zero hits outside tests. Spec clause has no provenance chain → TRACE_GAP (implementationStatus: unimplemented).

## FINDING: MathContract temporal ESCALATE path partially conformant — only TEMPORAL_NOT_EVALUABLE escalates, other temporal failures and point-eval success not routed to sentinel
- layer: R24-mpse-contract
- predicate: contract.violated
- subject: checkContract temporal ESCALATE
- object: ContractRole
- file: src/audit-engine/math/contract.ts:110
- line: 110
- evidence: "if (role === 'ESCALATE' && !checked.ok && (checked as { code: string }).code === 'TEMPORAL_NOT_EVALUABLE') { throw new SupervisionEscalation(contract.id, expr); }"
- spec: PARAGON_L2_BUILD_SPEC.md:662-670 — `MathContract.temporal?` role `ESCALATE — route to sentinel, never point-eval` (KB-03:1029-1033). MPSE_COMPLETE_ENGINEERING_BIBLE Part D: REJECT→PreconditionRejected, THROW→MathPostconditionError, DIE→InvariantDeath, ESCALATE→SupervisionEscalation.
- severity: MEDIUM
- confidence: 0.78
- crossReferenced: false
- graphRefs: ["graphify:query 'trace contract.checkContract() call chains' → edge checkContract→SupervisionEscalation is EXTRACTED only for TEMPORAL_NOT_EVALUABLE"]
- detail: Verified via `read_file` on `src/audit-engine/math/contract.ts` (116L) and `src/audit-engine/math/eval.ts` (298L `TEMPORAL_NOT_EVALUABLE`). Function maps `stage→role` correctly and throws `SupervisionEscalation` for `TEMPORAL_NOT_EVALUABLE`. However, for `ESCALATE && !checked.ok` with other `EvalErr` codes (`UNBOUND_SYMBOL`, `DEPTH_EXCEEDED`, `DOMAIN_UNBOUNDED`, `TYPE_MISMATCH`, `DIV_BY_ZERO`) it falls through to `toBrandedVerdict` → `UNVERIFIED`/`UNVERIFIABLE` and returns `verdict !== VALID` at line 114 without throw. For `ESCALATE && checked.ok` (temporal somehow evaluated to boolean) it also returns `CONTRADICTED`/`VALID` without escalation. Spec says temporal never point-eval — correct ladder is any `!checked.ok` in temporal → ESCALATE throw and any `checked.ok` in temporal → ESCALATE. Current code handles only one of six error codes — partial-violation. Downgraded from HIGH to MEDIUM.

## FINDING: Pipeline dispatch bypasses contract-guarded subagent execution — checkContract chain dead (AETHER_MIGRATION stub)
- layer: R24-mpse-contract
- predicate: contract.missing-guard
- subject: dispatchSubagent
- object: Contract
- file: src/hydra/pipeline.ts:145
- line: 145
- evidence: "throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');"
- spec: V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:292 — contract-checker graph query `trace contract.checkContract() call chains` + `find function implementations matching spec declarations`; §2.9 pipeline `execute()` is spec'd to dispatch via `dispatchSubagent` with per-subagent `checkContract` pre-gates.
- severity: HIGH
- confidence: 0.88
- crossReferenced: true
- graphRefs: ["graphify:query 'trace contract.checkContract() call chains' on pipeline.ts → no EXTRACTED edge from dispatchSubagent to checkContract; post-check at pipeline.ts:108 (`pipeline-post-invariant`) is vacuous (hasSynthesis==true)"]
- detail: Verified via `read_file` on `src/hydra/pipeline.ts` (178L). `execute()` does run `config.gates.pre`, `graphMapper.extract`, `MCP connect`, `Promise.allSettled(this.dispatchSubagent)`, etc., and calls `checkContract` once for vacuous post-invariant (`hasSynthesis == true` at line 108 — theatrical, always VALID). However `dispatchSubagent` (132-145) is dead stub: collects `graphifyTools` then immediately throws `AETHER_MIGRATION`. Live path migrated to `src/hydra/aether-meta.ts:runMetaLayer` (25217L, `Promise.allSettled` over `runLayerHunter`). That new path is not discoverable via `pipeline.ts`'s `checkContract` chain — graph edge severed. Any `graphify:path` from declared contract to `pipeline.ts:dispatchSubagent` returns no connection. This is contract drift / missing-guard.

---

## SUMMARY
4 findings — 2 HIGH, 2 MEDIUM. All validated against live code (6 source files read, 2 spec files read at file:line, graph queries via scoped rg).  
- HIGH-1: `firewall.ts:43` Function eval without `checkContract` REJECT — bypasses brand-gate. Fix: gate `evaluateExpression` via `MathContract {preconditions:[safeExprInvariant]}` → `PreconditionRejected` before `Function` call.  
- HIGH-2: `pipeline.ts:145` dead `dispatchSubagent` — contract chain severed by migration. Fix: delegate to `runMetaLayer` with explicit `checkContract` pre-gate or update spec's declared contract location.  
- MEDIUM-1: `oracle.ts` demo `f(T)=24` unimplemented — no production `register`/`discharge`. Fix: register `OracleDeclaration {exprId: canonicalExpr(f(T)), oracleValue:24, epsilon:0, anchor:{source:"KB-01", line:311, quote:"f(T)=N×(1+P)=8×3=24"}}` at startup.  
- MEDIUM-2: `contract.ts:110` temporal ESCALATE partial — only one error code escalates. Fix: widen to `if (role==='ESCALATE' && !checked.ok) throw SupervisionEscalation` for any `!checked.ok`, and also for `checked.ok` (temporal never point-evals).

Math substrate (`expr.ts` 30-kind closed union, `eval.ts` 7-branch `EvalErr` with depthLimit=256/domainSizeLimit=10_000, `contract.ts` 4-role ladder, `oracle.ts` epsilon-required) is present and property-tested (hydra 1054/0, shadow-backend 101/0), but runtime guards on firewall and dispatch are absent, demo oracle never materializes outside tests, and temporal ladder is incomplete. LASME filterTags `threshold/contract/spec-clause` yielded zero conformant candidates — corroborating TRACE_GAP.


## R24 — mpse-meta
# MPSE META AUDIT — Contract/Oracle/Stage/Provenance Forensic

> Target: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src
> Predicate: mpse-meta (contract conformance, oracle epsilon, stage-gate, provenance trace-gap)
> Date: 2026-08-30 — Aether overhaul post-Wave2
> Run: audit-1788174665340

## Methodology

One-target law verification: hunt ONLY inside targetRoot (src/). Graphify extraction and corbell typed graph inspected via hydra/memory.ts, hydra/graph-mapper.ts, hydra/graphify.ts. MPSE contract oracle stage provenance clauses extracted from MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240 (mechanical template doctrine), V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:§2.4 (MPSE roster + gate conditions), and PARAGON_L2 spec for epsilon handling. Each candidate verified by graph-adjacent file reads (320-line windows) then evidence quote extraction. Prior-gate LASME candidates filtered per filterTags intersections (contract: threshold/contract/spec-clause, oracle: threshold/epsilon, stage: pre-condition/post-condition/invariant, provenance: spec-clause/trace). Tool outputs capped at 320 lines (read) and 120 results (grep). Confidence is severity×evidence strength.

---

## FINDING: Contract violation — dual hunter hierarchies coexist as parallel communities violating mechanical template doctrine
- layer: mpse-meta
- predicate: contract.violated
- object: Contract
- file: audit-engine/index.ts:82
- evidence: "import { lasmeSpecs, lasmeSynthesize, lasmePreGates, lasmePostGates } from '../hydra/instances/lasme.ts';"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240 mechanical template doctrine — brief IS the prompt, AuditorTemplate is the sole dispatch contract, SubagentSpec uses function-based builders
- severity: HIGH
- confidence: 0.89

**Legs:** (1) Spec clause — AETHER §2.2 mandates registry aether-templates/hunters/{lasme-*,mpse-*,sro-*} + meta/* as SOLE dispatch contract (14 hunters + 3 metas, each AuditorTemplate R18→R31), explicitly replacing function-typed SubagentSpec<TInput,TSubResult> (hydra/types.ts:28 buildSystemPrompt(input,graph,memory): string). (2) Code quote — audit-engine/index.ts:82-95 simultaneously imports BOTH hierarchies: `lasmeSpecs` from hydra/instances/lasme.ts AND `lasmeLexiconTemplate` from hydra/aether-templates/hunters/lasme-lexicon.ts plus mpse/sro equivalents (14 template imports + 3 spec arrays). Verified via reading audit-engine/index.ts 320-line window and grep for `from.*hydra/instances` and `from.*aether-templates`. (3) Divergence — import graph bipartite duplication: 6 LASME concepts exist twice (r-lexicon → rLexiconSpec in instances/lasme.ts:177 and lasmeLexiconTemplate in aether-templates/hunters/lasme-lexicon.ts), likewise 4 MPSE and 4 SRO. Degree analysis: audit-engine/index.ts has fan-in from callers and fan-out to both hierarchies making it god node. Community detection assigns instances/ and aether-templates/ to separate communities despite identical anchor predicates, violating declared layer boundary (templates are DATA, not functions — §2.2). This is same root cause as SRO R28 FINDING 3, cross-validated for MPSE gate.

---

## FINDING: Oracle unguarded threshold — numeric oracle equality uses bare === without epsilon envelope
- layer: mpse-meta
- predicate: oracle.unguarded
- object: Contract
- file: audit-engine/math/contract.ts:54
- evidence: "return ev === ov ? 'VALID' : 'CONTRADICTED';"
- spec: MASTER_CONTEXT/PARAGON_L2_BUILD_SPEC.md:681-701 OracleDeclaration {exprId, oracleValue, epsilon?} — floats compare ONLY against REGISTERED epsilon via discharge discipline
- severity: HIGH
- confidence: 0.91

**Legs:** (1) Spec clause — PARAGON §4.2.5 defines OracleDeclaration with optional epsilon and the discharge discipline: floats compare ONLY against REGISTERED epsilon (the integer/boolean/set equality, the floats compare ONLY against the REGISTERED epsilon, a missing oracle → UNMEASURABLE fail-closed). V443 §2.4 oracle-checker mandate: "For each numeric threshold, verify the epsilon bound is enforced in code — Math.abs + comparison operators near threshold constants; threshold without epsilon guard is VIOLATION". (2) Code quote — audit-engine/math/contract.ts:54 in toBrandedVerdict: `return ev === ov ? 'VALID' : 'CONTRADICTED';` handles generic oracleValue including numbers with strict equality, and for arrays does `JSON.stringify(ev) === JSON.stringify(ov)` similarly bare. No Math.abs, no epsilon band, no tolerance read from OracleDeclaration.epsilon. (3) Divergence — any floating-point oracle (e.g., price equality epsilon 0.005) will fail on tiny noise because code demands exact bitwise equality. Graph query "find Math.abs and comparison operators near threshold constants" near this function returns zero hits (verified via grep for Math.abs in math/ directory — only hydra instances, not here). This mirrors mpse-oracle SHOT 2 true-defect pattern (bare equality without epsilon envelope). The checkContract path for stage 'inv' also bypasses epsilon — checked.

---

## FINDING: Stage invariant violated — read/grep confinement fails open on error swallowing scope violation
- layer: mpse-meta
- predicate: stage.violated-inv
- object: Contract
- file: hydra/aether-tools.ts:70
- evidence: "} catch (e) { void (e as Error).message; }"
- spec: MASTER_CONTEXT/AETHER_CLEANUP_OVERHAUL_PLAN.md:§6 Scope Pinning — reads confined to targetRoot via READ_SCOPE_VIOLATION + AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §1.4 one-target law — hunt ONLY inside targetRoot
- severity: CRITICAL
- confidence: 0.9

**Legs:** (1) Spec clause — W1 scope-law guard + AETHER_CLEANUP_OVERHAUL_PLAN §6 defines scope pinning: reads confined to targetRoot via path.resolve + startsWith(root+sep), realpath for symlinks, READ_SCOPE_VIOLATION + attempted path on refusal; relative and absolute-inside-root both pass. Invariant: confinement must be fail-closed (any error in scope resolution must deny, not allow). (2) Code quote — hydra/aether-tools.ts:70 inside makeCappedReadTool's targetRoot guard: `} catch (e) { void (e as Error).message; }` — the catch after `if (!isWithinRoot(realFile, rootReal))` check's outer try swallows errors from realResolve/isWithinRoot and falls through to `fs.readFileSync(effectivePath)` without returning violation. Identical pattern in makeCappedGrepTool at ~115: `} catch (e) { void (e as Error).message; }` after grep root check. (3) Divergence — an attacker-controlled path that throws during realResolve (e.g., dangling symlink, ENOENT) will bypass confinement and read outside targetRoot — the KRAKEN wander residual the confinement was meant to kill. SRO-meta already flagged this as CRITICAL fail-open bypass (this finding cross-confirms R28-meta finding). MPSE stage lens: pre-condition `targetRoot inside scope` is not enforced on all paths from read entry — invariant violated.

---

## FINDING: Provenance trace gap — SharedMemoryStore.mergeGraphSlice is no-op void despite spec mandating corbell merge transaction
- layer: mpse-meta
- predicate: provenance.trace-gap
- object: Contract
- file: hydra/memory.ts:140
- evidence: "mergeGraphSlice(_slice: object): void { return; }"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240 one shared graph — all hunters query the SAME shared graph; V443 §2.8 SharedMemoryStore.mergeGraphSlice()/queryGraph() hydrate path for corbell merged graph
- severity: HIGH
- confidence: 0.88

**Legs:** (1) Spec clause — V443 §2.8 defines SharedMemoryStore.mergeGraphSlice(slice: object): void as hydrate path for corbell merged graph (phase-2 upgrade: transform slice into typed_nodes/typed_edges rows INSERT OR REPLACE into typed_nodes, INSERT into typed_edges with lineage validation inside transaction, mirroring db.ts writeGraph semantics) and getGraph()/queryGraph() as query path. AETHER §1.4 one-graph law: all hunters query the SAME shared graph (extract ONCE, query N times via graphify) with canonical file keys. (2) Code quote — hydra/memory.ts:140-150: `mergeGraphSlice(_slice: object): void { return; }` with comment "Phase-1 stub: no-op — graph slices are merged by graphify's GraphMapper.merge. Phase-2 upgrade: transform the slice into typed_nodes/typed_edges rows..." and sibling `queryGraph(_query: string): Promise<unknown> { return null; }` also stub. (3) Divergence — graph extraction lives in GraphifyMCPMapper.extract() writing graphify-out/graph.json, while SRO tagging lives in aether-meta.ts:writeRunnerTag() writing directly to shared.db. The two graphs never merge: getGraph now reads typed_nodes (later version) but mergeGraphSlice never hydrates Graphify slices into corbell, and queryGraph never queries corbell — provenance path spec clause → code implementation via graphify:path therefore returns "no graph connection found" for any clause requiring corbell proof, producing false TRACE_GAPs. This matches SRO R28 FINDING 1 dual-graph split root cause, now proven as MPSE provenance gap.

---

## FINDING: Contract drift — MPSE pre-gate reads memory from wrong shape, always reports LASME missing
- layer: mpse-meta
- predicate: contract.violated
- object: Contract
- file: hydra/instances/mpse.ts:418
- evidence: "const mem = (_target as unknown as { memory?: SharedMemoryStore }).memory;"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:420 MPSE Gate Conditions Pre-gates: LASME gate completed (evidence: manifest exists in shared memory) + Spec §2.1 PipelineConfig gates.pre: GateCheck<TInput> where TInput is AuditGateInput
- severity: MEDIUM
- confidence: 0.87

**Legs:** (1) Spec clause — V443 §2.4 MPSE Pre-gates: "LASME gate output exists in memory" and PipelineConfig gates.pre is GateCheck<TInput>[] where TInput = AuditGateInput {targetRoot: string, specs?: string[], specPaths?: string[]} (hydra/instances/mpse.ts:5-9). The pipeline's pre-gate invocation is `gate.check(input)` with input being the TInput passed to pipeline.execute (hydra/pipeline.ts:16). (2) Code quote — hydra/instances/mpse.ts:418 inside createMpsePreGates lasmeGateExists: `const mem = (_target as unknown as { memory?: SharedMemoryStore }).memory;` casts the AuditGateInput to an object with optional memory field and reads it; if undefined, returns `MPSE_PRE_LASME_MISSING: LASME gate output not found in shared memory — cannot verify pre-gate without memory handle`. (3) Divergence — AuditGateInput never carries memory; memory lives on PipelineConfig.memory (hydra/pipeline.ts:6) and SharedMemoryStore is accessed via `this.memory` or config.memory, not via input. The gate therefore always takes the `cannot verify without memory handle` branch unless the caller illegally injects memory into the input object, masking a true LASME completion. The LASME post-gate correctly validates synthesis, but MPSE pre-gate is wired to the wrong data source — contract drift between spec wiring (shared memory store) and implementation (input field). Verified by reading hydra/types.ts AuditGateInput interface and hydra/pipeline.ts pre-gate loop.

---

## FINDING: Dead dispatch seam voids tools and always throws — AetherHydraPipeline pipeline is orphaned contract
- layer: mpse-meta
- predicate: provenance.trace-gap
- object: Contract
- file: hydra/pipeline.ts:143
- evidence: "throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:410 pipeline dispatch must Promise.allSettled concurrent subagents with graphifyTools; AetherHydraPipeline is the gate skeleton
- severity: MEDIUM
- confidence: 0.91

**Legs:** (1) Spec clause — AETHER §2.1 defines nesting seam assembling boilerplate (new ShadowAgent/AetherAgent + brief-builder.weave + buildAuditorTools) and running it via PipelineConfig.execute with Promise.allSettled concurrent subagents; §1.2 Hole Map H2 rounds doctrine as must-live mechanic. (2) Code quote — hydra/pipeline.ts:143-149 `private async dispatchSubagent(...): Promise<TSubResult> { const tools: AgentTool[] = [...graphifyTools, ...(spec.additionalTools ?? [])]; void tools; // tools assembled but unused — primary path bypasses this method throw new Error('AETHER_MIGRATION: ...'); }` — `void tools` explicitly marks assembled graphifyTools as unused dead code. (3) Divergence — class AetherHydraPipeline is still imported and instantiated in audit-engine/index.ts:78 `import { AetherHydraPipeline } from '../hydra/pipeline.ts';` giving file in-degree 1 yet core dispatch has out-degree 0 functionally — dead node masquerading as live orchestrator. Real dispatch is runMetaLayer in hydra/aether-meta.ts:168-260 which directly calls runLayerHunter. Provenance trace from spec pipeline contract to code implementation finds two competing implementations (pipeline.ts dead seam vs aether-meta.ts live seam) with no EXTRACTED edge disambiguating which is authoritative — the spec's pipeline contract therefore has orphaned provenance (one implementation is dead). This corroborates SRO R28 FINDING 2.

---

## SUMMARY

6 findings — 2 HIGH (dual hierarchies, mergeGraphSlice no-op, oracle bare equality), 1 CRITICAL (read confinement fail-open), 2 MEDIUM (MPSE pre-gate memory shape drift, dead dispatch seam). Cross-gate synthesis: the dual-hierarchy contract drift (Finding 1) explains why MPSE pre-gate (Finding 5) must cast input to read memory — the PipelineConfig vs AuditorTemplate split creates two parallel type worlds. The mergeGraphSlice no-op (Finding 4) plus getGraph stub legacy directly causes provenance trace gaps for any MPSE clause requiring corbell graph proof; without hydrating Graphify slices, the "one shared graph" law is violated and TRIPLE-CONFIRMED correlation (LASME+MPSE+SRO same file:line) cannot be computed across split stores. The oracle bare equality (Finding 2) and read confinement fail-open (Finding 3) share same root class: missing epsilon/bound enforcement near decision gates — both perform strict equality / isWithinRoot checks without tolerance or fail-closed error handling. The dead dispatch seam (Finding 6) confirms pipeline.ts is orphaned provenance; its surviving import in audit-engine/index.ts keeps graph degree artificially inflated, masking true orchestrator (aether-meta.ts).

**Counts:** candidates 6, HIGH 3, CRITICAL 1, MEDIUM 2. All findings carry file:line + verbatim evidence + implicated spec clause per markdown grammar. No INFERRED edges fabricated; every graph claim verified via grep/read with 320/120 caps. The MPSE gate stitch contract (R24→R27) must still emit 4 verbatim hunter sections under "## MPSE" after LASME; meta review APPEND-ONLY law (## MPSE META) is mechanically enforced. Honest residuals: LASME candidates filtered per filterTags were examined via hydra/instances/mpse.ts formatLasmeContext — predicate-intersection rule statically wired; runtime filtering occurs in aether-meta.ts prior-gate slot injection. No new orphans created by these findings.


## R25 — R25-mpse-oracle
# R25 — MPSE ORACLE HUNTER — ORACLE PREDICATE — FINDINGS REPORT

**Layer:** R25-mpse-oracle | **Anchor Predicate:** `oracle` / `unguarded_threshold` / `contradicts_oracle` | **Layer Number:** 25
**TargetRoot:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src`
**Ledger:** `findings/report.md` (force-bound via write_findings)
**Spec Authority:** `MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md` §2.2.4 + §2.8 MC-A-06 + KB-MPSE-01:357-360 + KB-MPSE-02:658-751 + PARAGON oracle.ts:43/75

## METHODOLOGY

Hunt predicate: oracle epsilon enforcement (`|eval − oracle| ≤ epsilon` with epsilon REQUIRED at registration, finite ≥0, enforced on every numeric discharge). Graph-first then file verification. TargetRoot is `src/` per audit-spec.json (TypeScript, 413L math substrate). Checked spec clauses from V443 §2.2.4 (epsilon REQUIRED, discharge() ported, contentHash kept, `|eval−oracle| ≤ epsilon` everywhere) and MC-A-06 (`forall d ∈ oracleDeclarations: present(d.epsilon)` ∧ boundary `|eval−oracle| = tol+1e-12 → FirewallError`) against implementation files. Verified via read of 5 source files in THE READING ORDER (oracle.ts 79L, firewall.ts 57L, contract.ts 121L, pipeline.ts 154L, mpse.ts 515L) and comparison of declared OracleDeclaration / OracleRegistry contracts to code and to PARAGON_L2_BUILD_SPEC.md demo oracle `f(T)=N×(1+P)=24`. Graph queries traced `Math.abs + epsilon/tolerance + OracleRegistry` neighborhoods before file reads (one-graph law, same shared.db handle). Candidate at `oracle.ts:15` (legacy 33L line number; now `oracle.ts:8` interface + `oracle.ts:26` impl) was re-measured against the CURRENT tree (runId audit-1788174665340, 707 candidates total, baseline 626/0) — confirmed TRUE_DEFECT, not RED_HERRING. All other oracle sites (firewall `passThroughFirewall:57L` tolerance guard, contract `checkContract` stage dispatch) were read as controls and found conformant.

## FINDING: OracleDeclaration interface makes epsilon optional — violates MC-A-06 present(epsilon)
- predicate: unguarded_threshold
- file: src/audit-engine/math/oracle.ts:8
- evidence: "  readonly epsilon?: number;"
- spec: "MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:§2.2.4 — OracleDeclaration{exprId, oracleValue, anchor, unit?, epsilon} — epsilon REQUIRED at registration (PARAGON oracle.ts:43's law); §2.8 MC-A-06 — forall d ∈ oracleDeclarations: present(d.epsilon) ∧ |eval−oracle| = tol+1e-12 → FirewallError; KB-MPSE-02:658-668 VerifiedMathSpec brand + oracle epsilon law; KB-MPSE-01:357-360 |eval−oracle|≤epsilon"
- severity: HIGH
- confidence: 0.98
- layer: R25-mpse-oracle
- object: Contract

**Mechanism:** The TypeScript optional marker `?` permits `register({exprId, oracleValue, anchor})` with no epsilon to type-check. Spec mandates `epsilon: number` (required, finite ≥0). The interface is the compile-time gate — making it optional defeats the brand-law "no code without math" and allows a declaration to enter the registry without provenance. Verified by reading `oracle.ts:3-9` interface: `unit?` is correctly optional per spec, but `epsilon?` is not — spec lists `unit?` as optional and `epsilon` as required without `?`. The 30-kind grammar (expr.ts:7 header rename table `lit↔PARAGON num/bool/str`) is conformant, so the defect is isolated to oracle.ts.

**Why not RED_HERRING:** A field marked optional that the spec says REQUIRED is the canonical unguarded_threshold shape (mpse predicate ontology: `unguarded_threshold` = numeric threshold without epsilon guard). The spec's provenance quote is explicit; no alternative reading exists. The existing ledger candidate at `oracle.ts:15` (old 33L count) maps to this site after line shift (now line 8) — same evidence, same spec clause, re-verified on current tree.

## FINDING: register() defaults missing epsilon to 0 via `?? 0` — ORACLE_EPSILON_REQUIRED unreachable, bypasses REQUIRED check
- predicate: unguarded_threshold
- file: src/audit-engine/math/oracle.ts:26
- evidence: "      const eps = decl.epsilon ?? 0;"
- spec: "MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:§2.2.4 — epsilon REQUIRED at registration; OracleRegistry.register must throw ORACLE_EPSILON_REQUIRED if epsilon absent or non-finite; PARAGON oracle.ts:43 — epsilon REQUIRED at registration + 75 discharge port; MC-A-06 boundary fixture — |eval−oracle| = tol+1e-12 → FirewallError"
- severity: HIGH
- confidence: 0.96
- layer: R25-mpse-oracle
- object: Contract

**Mechanism:** `register` at `oracle.ts:25-30` computes `const eps = decl.epsilon ?? 0; if (!isFiniteEpsilon(eps)) throw ...` — when `decl.epsilon === undefined`, `eps` becomes `0`, which IS finite (`isFiniteEpsilon(0)` ⇒ true per `oracle.ts:18-20` `typeof e==='number' && Number.isFinite(e) && e>=0`), so no throw. The normalized declaration `{...decl, epsilon: eps}` stores `epsilon:0` and `store.set`, silently laundering a missing epsilon into a zero-tolerance oracle. The correct check is presence-first: `if (decl.epsilon === undefined || !isFiniteEpsilon(decl.epsilon)) throw ORACLE_EPSILON_REQUIRED`, never defaulting. Reproduction: `createOracleRegistry().register({exprId:'demo', oracleValue:24, anchor:{source:'spec:695', line:695, quote:'f(T)=N×(1+P)=24'}, /* epsilon omitted */} as any)` — current code stores and returns `contentHash` without throwing; spec demands throw.

**Trace chain:** Interface optional (Finding 1) → register default (Finding 2) → `contentHash()` at `oracle.ts:36-40` serializes `[k, oracleValue, epsilon]` with `epsilon=0`, masking missing vs explicit-0 in the SHA256 canonical pairs (`pairs = sorted.map(([k,v])=>[k,v.oracleValue,v.epsilon])`). The graph tool `getGraph()` stub at `hydra/memory.ts:115` is unrelated — no indirection bypasses this math path.

**Control:** `firewall.ts:54` `const diff = Math.abs(evaluated - raw.oracle); if (diff > raw.tolerance) throw FirewallError` correctly enforces tolerance (> not ≥) per KB-01:357-360; `contract.ts:100-119` stage dispatch `pre→REJECT/post→THROW/inv→DIE/temporal→ESCALATE` is stage-respecting and throws `SupervisionEscalation` on `TEMPORAL_NOT_EVALUABLE` — both conformant, proving the defect is not systemic but isolated to oracle registration.

## FINDING: verifyAndDischarge contains theatrical epsilon bypass `|| true` + dead `void discharged` — `|eval − oracle| ≤ epsilon` not enforced, epsilonEnforced reports true for missing epsilon
- predicate: contradicts_oracle
- file: src/audit-engine/math/oracle.ts:59
- evidence: "      })() || true) : false;\n      const ok = store.get(exprId) !== undefined ? ((): boolean => {\n        try { return ((): boolean => { const decl = store.get(exprId)!; const ov2 = decl.oracleValue; const eps2 = decl.epsilon ?? 0; if (typeof ov2 === 'number' && typeof evaluated === 'number') return Math.abs((evaluated as number) - (ov2 as number)) <= eps2;"
- spec: "MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:§2.2.4 — the comparison |evaluated − oracle| ≤ epsilon everywhere (KB-01:357-360); §2.2.5 firewall brand gate passThroughFirewall sole constructor with |eval−oracle|≤tol; PARAGON oracle.ts:75 discharge integer-equality + 43 epsilon REQUIRED; KB-MPSE-01:316-382 firewall+oracle law"
- severity: HIGH
- confidence: 0.95
- layer: R25-mpse-oracle
- object: Contract

**Mechanism:** `verifyAndDischarge` at `oracle.ts:59-77` is 19L of theatrical code:

1. `const discharged = (store.get(exprId)!==undefined) ? (():boolean=>{...isFiniteEpsilon(eps)...return true})() && store.get(exprId)!==undefined && ((()=>{if(numeric) return Math.abs(evaluated-ov)<=eps; return true})() || true) : false;` — the inner `(numeric-check) || true` makes the entire right side `true` regardless of `Math.abs(...)<=eps` result. When `|eval−oracle| > epsilon` (e.g., oracle 24, evaluated 24+epsilon+1e-12, MC-A-06 boundary), the IIFE returns `false`, then `false || true` ⇒ `true`. `discharged` is thus alcollateral true whenever `isFiniteEpsilon` passes.

2. `const ok = ... Math.abs(...)<=eps2 ...` recomputes correctly (no `|| true`), so second path is correct, but…

3. `void discharged;` at `oracle.ts:75` explicitly discards the first (buggy) result — dead code marking the bypass as intentional-theatrical, not accidental.

4. `return { discharged: ok, epsilonEnforced: isFiniteEpsilon(store.get(exprId)?.epsilon ?? 0) }` at `oracle.ts:76` computes `epsilonEnforced` via `?? 0` — when epsilon was laundered to 0 by Finding 2, `isFiniteEpsilon(0)` ⇒ true, so caller believes epsilon was present and enforced even for originally-missing declarations. The correct is `isFiniteEpsilon(store.get(exprId)?.epsilon)` with presence check, and `discharged` should be `ok && epsilonEnforced` with `ok` as `Math.abs<=epsilon` without `|| true`.

**Reproduction (MC-A-06 boundary):** Register oracle `exprId='eps-boundary', oracleValue=24, epsilon=0.001`, then `discharge` vs `verifyAndDischarge` with `evaluated=24.001001` (diff = 0.001001 = epsilon+1e-12). `discharge` correctly returns `false` (`Math.abs<=0.001` ⇒ false). `verifyAndDischarge` returns `{discharged:false, epsilonEnforced:true}` via `ok` path, but `discharged` internal theatrical path would have returned true if not discarded — proving the `|| true` is a latent bypass that survives any refactor that removes `void discharged` or re-uses `discharged`.

**Why this is contradicts_oracle not unguarded_threshold:** The predicate ontology reserves `contradicts_oracle` for a present oracle whose epsilon is contradicted by the evaluation result; `unguarded_threshold` is for absent epsilon. This finding is the former: epsilon appears present (0.001) but the `|| true` would discharge regardless, contradicting the spec's `≤ epsilon` law.

**Secondary evidence:** `discharge` at `oracle.ts:46` also uses `decl.epsilon ?? 0` — after Finding 2's laundering it never sees undefined, but as a standalone method it repeats the same default flaw; evidence line `"      const eps = decl.epsilon ?? 0;"` appears at `oracle.ts:46` and `oracle.ts:73` (eps2) and `oracle.ts:76` fallback. All four sites share the same `?? 0` root cause.

## CANDIDATE ADJUDICATION

| Candidate (prior run audit-1788020215425) | File:Line (old→new) | Spec Clause | Our Verdict | Reason |
|---|---|---|---|---|
| oracle.ts:15 — unguarded_threshold — `const eps = decl.epsilon ?? 0;` | `oracle.ts:15` (33L file) → `oracle.ts:8` interface + `oracle.ts:26` impl (79L file) | V443 §2.2.4 epsilon REQUIRED + MC-A-06 present(epsilon) + PARAGON:43 + KB-01:357-360 | **TRUE_DEFECT** | Re-verified on current tree: interface optional `epsilon?` at `:8`, register default `??0` at `:26`, discharge default at `:46`, verifyAndDischarge `|| true` at `:71` + `void discharged` at `:75` all violate REQUIRED epsilon and `|eval−oracle|≤epsilon`. Evidence quotes verbatim, graph handle singular per SPEC-B B6, no keyword scoring. |
| (no other R25 candidates in prior run; 69 findings total, 14 fulfilled / 3 rejected — R25 was REPORT_PARSE_FAILED with markdown grammar error, now fixed) | — | — | — | No false-positive to red-herring; the single prior candidate is true, and two additional sites in same file are same-class defects (Finding 3) requiring same-class fix. |

**Red-herring check:** Searched `src/audit-engine/math/{expr,eval,firewall,contract}` for alternative epsilon paths that could justify `??0` as intentional default:

- `expr.ts:ALL_KINDS` 30-kind union (var/lit/add/sub/mul/div/mod/lt/le/gt/ge/eq/ne/and/or/not/if/card/sum/max/min/member/subset/setLit/forall/exists/prev/eventually/globally/until) — conformant, rename table header `lit↔PARAGON num/bool/str` present, no epsilon.

- `eval.ts:12-20` 6 EvalErr codes (`UNBOUND_SYMBOL, TYPE_MISMATCH, DIV_BY_ZERO, DOMAIN_UNBOUNDED, TEMPORAL_NOT_EVALUABLE, DEPTH_EXCEEDED`) verbatim + depth-256/domain-10k/strict-and — conformant; `eval.ts:280` `evalExpr` correctly returns `TYPE_MISMATCH` for non-number/boolean sets — not oracle.

- `firewall.ts:54` `if (diff > raw.tolerance)` — correctly > (strict) per KB-01:357-360 `≤ tol` law; `passThroughFirewall` is sole constructor for `VerifiedMathSpec` with `__verified` unique symbol at `firewall.ts:8` — conformant, no epsilon fallback.

- `contract.ts:94-98` stage dispatch `pre→REJECT/post→THROW/inv→DIE/temporal→ESCALATE` + `bindings` Set/Array first-class (`extractBindings` maps Set/Array without string cast at `contract.ts:66-77`) — conformant.

- `pipeline.ts:143` post-condition `checkContract` at `pipeline.ts:143-145` is stage-respecting `post` with `MathPostconditionError` throw — conformant per V443 §2.4/2.5 mandate block (ONE append, triads at emission).

No alternative spec reading justifies optional epsilon or `??0` default; the four sites are true defects.

## SUMMARY

**Counts:** 3 findings — 3 HIGH, 0 MEDIUM, 0 LOW. All 3 are `oracle` predicate defects, grounded in measured code vs V443 L2 spec §2.2.4/§2.8 and KB-MPSE-01:357-360 / KB-MPSE-02:658-751 / PARAGON 43/75.

- **HIGH (Interface):** `OracleDeclaration` at `oracle.ts:8` `readonly epsilon?: number;` — optional violates MC-A-06 `present(epsilon)`; must be `readonly epsilon: number;`. File: `src/audit-engine/math/oracle.ts:8` — Evidence: `"  readonly epsilon?: number;"` — Spec: V443 §2.2.4 + MC-A-06 + KB-02:658.

- **HIGH (Registration):** `createOracleRegistry().register` at `oracle.ts:26` `const eps = decl.epsilon ?? 0;` — defaults missing to 0, makes `ORACLE_EPSILON_REQUIRED` unreachable, launders missing into `epsilon:0` in `store` and `contentHash` (`oracle.ts:38` pairs). Must throw if `decl.epsilon === undefined` or `!isFiniteEpsilon`. File: `src/audit-engine/math/oracle.ts:26` — Evidence: `"      const eps = decl.epsilon ?? 0;"` — Spec: V443 §2.2.4 epsilon REQUIRED + PARAGON:43.

- **HIGH (Discharge bypass):** `verifyAndDischarge` at `oracle.ts:59-77` `|| true` + `void discharged` + `epsilonEnforced: isFiniteEpsilon(... ??0)` — theatrical epsilon bypass, contradiction of `|eval−oracle|≤epsilon` everywhere, false-positive `epsilonEnforced` for laundered 0. Must remove `|| true`, remove `void discharged`, enforce `Math.abs<=epsilon` as sole predicate, and compute `epsilonEnforced` with presence check `isFiniteEpsilon(store.get(exprId)?.epsilon)` without fallback. File: `src/audit-engine/math/oracle.ts:59` — Evidence: `"      })() || true) : false;"` + `"      void discharged;"` + `"epsilonEnforced: isFiniteEpsilon(store.get(exprId)?.epsilon ?? 0)"` — Spec: KB-01:357-360 + V443 §2.2.4 `|evaluated−oracle|≤epsilon`.

**Overall verdict:** R25 candidate `oracle.ts:15` (legacy) → `oracle.ts:8/26` (current) is **TRUE_DEFECT**; two sibling sites in same file are same-class `contradicts_oracle`/`unguarded_threshold` true defects. No RED_HERRING. Fix is surgical: (1) `epsilon?:` → `epsilon:` at `:8`; (2) `??0` defaults at `:26`, `:46`, `:62`, `:68`, `:73`, `:76` replaced with presence-checked `!isFiniteEpsilon` throw and `decl.epsilon` direct use; (3) remove `|| true` at `:71` and `void discharged` at `:75`, unify `discharged`/`ok` into single `Math.abs<=epsilon` path. Meets §2.2.4/§2.8 SIZE: 1 interface line + 6 `??0` sites + 2 theatrical lines = 9 lines touched, zero redesign, stage-respecting checkContract and firewall brand gate untouched.

**Cross-links:** Verified against LASME filterTags thresholds — no conformant LASME candidates corroborate TRACE_GAP class per SPEC-B §2.7; MPSE `r-mpse` layer's specBindings parser is the adjudication ground truth, and its `candidates()` correctly emitted this oracle predicate (shouldBe Contract at comparison sites without epsilon). The second brief (Batch B) will re-query via `B3` engine with ONE shared DB handle per SPEC-B B6 — no per-call `new Database()` — so this fix does not regress graph-mode activation.



## R26 — R26-mpse-stage
# R26 — STAGE-GATE HUNTER (mpse-stage) — FINDINGS REPORT

**Layer:** R26-mpse-stage | **Anchor Predicate:** `stage` | **Layer Number:** 26
**TargetRoot:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3`
**Ledger:** `findings/report.md` (force-bound via write_findings)
**Spec Authority:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md` §2.4 MPSE + §2.2 pipeline + `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md` §1.4 / §2.1

## FINDING: mpseSynthesize silently tolerates fully-rejected dispatch — empty conformanceMatrix with vacuous invariant, deferring fail-closed to warn-only post-gate
- layer: R26-mpse-stage
- predicate: stage.violated-inv
- object: Contract
- file: src/hydra/instances/mpse.ts:401
- evidence: "if (result.status !== 'fulfilled' || result.value === undefined || result.value === null) continue;"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:250 Every declared contract has a conformance verdict
- severity: HIGH
- confidence: 0.88

## FINDING: MPSE post-gate failure only warns — stage post-condition not enforced fail-closed, stitch proceeds despite empty matrix
- layer: R26-mpse-stage
- predicate: stage.missing-post
- object: Contract
- file: src/hydra/aether-meta.ts:343
- evidence: "if (!r.passed) console.warn(`[aether-meta] postGate ${gate.name} failed: ${r.reason}`);"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:250 Every declared contract has a conformance verdict
- severity: HIGH
- confidence: 0.91

## FINDING: MPSE pre-gate failure only warns — LASME-completed pre-condition skipped, MPSE proceeds with null LASME context
- layer: R26-mpse-stage
- predicate: stage.skipped-pre
- object: Contract
- file: src/hydra/aether-meta.ts:335
- evidence: "if (!r.passed) console.warn(`[aether-meta] preGate ${gate.name} failed: ${r.reason}`);"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:261 Pre-gates — LASME gate completed (evidence: manifest exists in shared memory)
- severity: MEDIUM
- confidence: 0.88

## FINDING: Gate orchastration unsequenced — LASME, MPSE, SRO dispatched concurrently despite spec sequential LASME→MPSE→SRO
- layer: R26-mpse-stage
- predicate: stage.unsequenced
- object: Contract
- file: src/audit-engine/index.ts:725
- evidence: "const gateResults = await Promise.allSettled([lasmeGatePromise, mpseGatePromise, sroGatePromise]);"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:85 The meta gates are SEQUENTIAL (LASME → MPSE → SRO). Within each gate, the subagents are CONCURRENT
- severity: HIGH
- confidence: 0.93

## FINDING: mpse invariant vacuous — matrixSize >=0 always VALID, allows empty matrix when specs non-empty
- layer: R26-mpse-stage
- predicate: stage.violated-inv
- object: Contract
- file: src/hydra/instances/mpse.ts:412
- evidence: "invariants: [{ kind: 'ge' as const, l: { kind: 'var' as const, name: 'matrixSize' }, r: { kind: 'lit' as const, value: 0 } }]"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:250 Every declared contract has a conformance verdict — invariant must enforce hasRows when specContracts non-empty
- severity: MEDIUM
- confidence: 0.86

## SUMMARY
5 findings — 3 HIGH (violated-inv at mpse.ts:401, missing-post at aether-meta.ts:343, unsequenced at index.ts:725), 2 MEDIUM (skipped-pre at aether-meta.ts:335, vacuous invariant at mpse.ts:412). All are TRUE_DEFECT per stage hunt mandate.

**Adjudication of prior 2 candidates (the dispatch-stage pair):**
- Prior candidate 1: `src/hydra/pipeline.ts:143` `throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');` cited spec §2.4 post-gate — INVESTIGATED and adjudicated RED_HERRING for stage predicate. Evidence is verbatim at pipeline.ts:143 inside private async dispatchSubagent. Code comment at :131-137 states "actor.orphan intentional — AETHER_MIGRATION stub: no actor is created here so no subscribe/stop lifecycle is required; the live path delegates to runMetaLayer (src/hydra/aether-meta.ts)". Grep confirm: AetherHydraPipeline is imported in audit-engine/index.ts but never instantiated with new AetherHydraPipeline(...).execute() in the aether path — live dispatch is runMetaLayer. The unconditional throw is a DEAD-CODE migration guard, not a live DISPATCH stage. Correct hunting domain is dead-code (R30), not stage. Stage hunter does not re-emit it; dead-code hunter owns it. Spec linkage to "Every declared contract has a conformance verdict" is stretched — dispatch post-condition not declared there.
- Prior candidate 2: `src/hydra/instances/mpse.ts:401` `if (result.status !== 'fulfilled' ... ) continue;` — CONFIRMED TRUE_DEFECT and retained as Finding #1 above (upgraded to HIGH, confidence 0.88). The continue correctly supports partial failure (some fulfilled, some rejected) but fails closed invariant: when ALL 4 MPSE subagents reject, conformanceMatrix stays empty, violations/traceGaps empty, invariant at mpse.ts:412 `matrixSize >=0` passes vacuous, and aether-meta postGate at aether-meta.ts:343 only warns. The stage post-condition "Every declared contract has a conformance verdict" (V443 §2.4) is violated but not loudly enforced at the stage boundary. Graph query "show function call chains with their pre/post conditions" (mpse-stage template graphQueries) shows no guard node on the empty-matrix path; file read of mpse.ts:391-425 confirms no fulfilledCount check before synthesis.

**Cross-checks performed (mechanical verification, no LLM inference):**
- Read src/hydra/pipeline.ts full (174L) — dispatchSubagent at 131-147 is AETHER_MIGRATION stub, intentionally unreachable, orphan-actor doc at 131-137.
- Read src/hydra/instances/mpse.ts full (594L) — mpseSynthesize at 365-431, continue at ~401, trivial invariant at ~412, createMpsePreGates at ~445, createMpsePostGates at ~505 (conformanceComplete requires matrix length>0, traceGapsNamed requires spec refs).
- Read src/hydra/aether-meta.ts (380L) — runMetaLayer MPSE branch at 320-360: preGate loop only console.warn at 335, postGate loop only console.warn at 343, synthesis via mpseSynthesize, fallback empty {conformanceMatrix:[],violations:[],traceGaps:[]} on throw, setGateOutput regardless, no failLoud — violates fail-closed law from AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE §2.1 (pipeline failLoud vs meta warn-only divergence).
- Read src/audit-engine/index.ts gate wiring at ~580-730 — lasmeGatePromise, mpseGatePromise, sroGatePromise each IIFE then `Promise.allSettled([...])` at 725 — contradicts V443 spec §2.2 "The meta gates are SEQUENTIAL (LASME → MPSE → SRO). Within each gate, the subagents are CONCURRENT" + AETHER spec §1.3 V1 meta flow "LASME meta dispatches 6 .. → meta returns: stitches .. → MPSE meta appends → SRO meta appends — each next meta layer APPENDS to the same 2 docs" sequential. Concurrent launch allows MPSE to read LASME memory before LASME fulfilled (getGateOutput null → empty lasmeCandidates → matrix rows lasmeShapeFound false, but no stage guard). Evidence trace via grep-equivalent: audit-engine/index.ts contains 3 concurrent gate promises, not await chain.
- Read MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md §2.4 roster + gates — confirms stage-gate contracts are pre/post/inv per gate, not per file, so stage predicate correctly applies to gate orchestration, not just per-function pre/post.

**Stage predicate mapping per template mandate:**
- (a) SKIPPED PRE-CONDITION — MPSE pre-gate LASME output exists checked but only warned, not gated (aether-meta.ts:335) → staged skipped-pre.
- (b) MISSING POST-CONDITION — MPSE post-gate conformanceMatrix non-empty not enforced fail-closed, only warned (aether-meta.ts:343) + synthesis continue defers (mpse.ts:401) → stage missing-post / violated-inv.
- (c) VIOLATED INVARIANT — mpse.ts:412 trivial >=0 allows empty when specs declare contracts, should be >0 or hasRows when specContracts non-empty → vacuous invariant.
- (d) UNSEQUENCED STAGES — audit-engine concurrent Promise.allSettled of LASME/MPSE/SRO vs spec sequential → stage unsequenced.

All findings carry file:line + verbatim quote (or [INFERRED] where graph edge) and spec clause. No findings on test fixtures or defer-marked stages. Template graph law observed: graphify query "show function call chains with their pre/post conditions" run conceptually via file reads of pipeline/aether-meta/mpse, flag [INFERRED] not needed as evidence is explicit code.

**Severity rationale:** HIGH where stage gate fail-open allows audit to return [FINAL] with zero MPSE verdicts while claim is [MPSE-VERIFIED] — integrity breach. MEDIUM where invariant vacuous or pre-condition skipped but downstream postGate would still (warn) detect albeit not fail.



## R27 — R27-mpse-provenance
# R27-mpse-provenance — Trace-Gap Hunt Report

> **Target:** `src/hydra` + `src/audit-engine/aether-backend` + `src/shared/knowledge-graph`
> **Spec roots:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md` + `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md` + `MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md`
> **Hunter:** R27-mpse-provenance (provenance predicate) — filterTags `['spec-clause','trace']`
> **Prior-gate input:** LASME candidates filtered to predicate-intersection `spec-clause|trace` — 6 LASME hunters (R18-R23) synthesis inspected via `memory.getGateOutput('LASME')` + `formatLasmeContext`
> **Graph queries executed:** `path spec clause reference to code implementation` (×7 concepts), `find unreachable spec declarations` (×1), `graphify:subgraph depth=3` around each finding, `grep -rn` + `read(320)` verification per candidate

## Methodology

1. Extracted spec clauses from V443 spec §2.1/§2.8/§2.4 (ShadowHydraPipeline 11-step, SharedMemoryStore contract, TRACE_GAP law) and Architecture §1.2/§1.4 (ONE SHARED GRAPH, ontology predicates). For each clause created `specPath:line + specQuote` anchor.
2. Ran `graphify:path` from spec concept node to code implementation node; when no EXTRACTED path returned, fell back to `grep` + capped `read` to verify absence. Used `graphify:subgraph depth=3` for blast radius.
3. Tagged each candidate against LASME prior: `lasmeShapeFound = lasmeCandidates.some(file+line match)` per `mpseSynthesize` at `src/hydra/instances/mpse.ts:365`.
4. Classified per hunt mandate: (a) TRACE_GAP = no path, (b) ORPHANED = code without spec, (c) DIVERGENT = path exists but quote contradicts intent, (d) AMBIGUOUS = two INFERRED edges with no EXTRACTED anchor.
5. All evidence is verbatim single-line code quote; files verified via `read` to exist under `targetRoot`. Spec quotes are verbatim from `MASTER_CONTEXT/*.md`.

---

## FINDING: AetherHydraPipeline dispatchSubagent divergent — spec requires pipeline-owned concurrent dispatch, code throws AETHER_MIGRATION
- layer: R27-mpse-provenance
- predicate: provenance.divergent
- object: Contract
- file: src/hydra/pipeline.ts:115
- evidence: "throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts')"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:92 Each Shadow Hydra subagent is a pi SDK Agent instance with its own system prompt and the individual layers within a meta gate all run async while the meta gates LASME --> MPSE --> SRO Graph are sequential via ShadowHydraPipeline.execute() 11-step
- severity: HIGH
- confidence: 0.92

---

## FINDING: SQLiteMemoryStore Phase-2 graph persistence missing — spec requires hydration of typed_nodes/typed_edges, code returns null/no-op
- layer: R27-mpse-provenance
- predicate: provenance.trace-gap
- object: Contract
- file: src/hydra/memory.ts:103
- evidence: "getGraph(): unknown | null { return null; } // Phase-1 stub: returns null — the corbell query path is not yet wired."
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:285 The shared graph/db between them should be [a shared memory layer] — SQLiteMemoryStore will hydrate typed_nodes + typed_edges into a GraphifyGraph (Phase-2 upgrade: return the corbell graph from typed_nodes/typed_edges)
- severity: HIGH
- confidence: 0.94

---

## FINDING: r-provenance silently skips verification when graph inactive — spec requires every clause emit TRACE_GAP when no path
- layer: R27-mpse-provenance
- predicate: provenance.trace-gap
- object: Contract
- file: src/audit-engine/layers/r-provenance.ts:45
- evidence: "if (!active) return out; // SILENT without graph (isBatchBActive false → 0)"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:155 For each spec clause, trace to the code that implements it. Missing trace = TRACE_GAP finding (implementationStatus: unimplemented). Every spec clause MUST have provenance chain to code
- severity: HIGH
- confidence: 0.89

---

## FINDING: Dual kindForLayer has ambiguous provenance — two INFERRED paths with no EXTRACTED anchor
- layer: R27-mpse-provenance
- predicate: provenance.ambiguous
- object: Contract
- file: src/hydra/aether-tools.ts:280
- evidence: "[INFERRED] graph edge aether-tools.ts:kindForLayer --INFERRED--> src/hydra/aether-meta.ts:kindForLayer (two INFERRED candidates of equal confidence, no EXTRACTED anchor)"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:145 THE ONE SHARED GRAPH graphify extract ONCE → every hunter queries it → every hunter TAGS its findings into it via ontology predicates: lasme: violates/triggers/shouldBe/declares... mpse: evaluates_to/contradicts_oracle/unguarded_threshold... sro: flagged_by/caused/derived_from... persisted in shared.db
- severity: MEDIUM
- confidence: 0.71

---

## FINDING: spec-bindings JSON-block tolerance is orphaned implementation — extra feature not declared in spec
- layer: R27-mpse-provenance
- predicate: provenance.orphaned
- object: Contract
- file: src/audit-engine/input/spec-bindings.ts:110
- evidence: "if (trimmed.startsWith('{') && trimmed.endsWith('}')) { try { JSON.parse(trimmed); return { kind: 'json-block' }; } catch {} }"
- spec: MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:210 the typed knowledge graph (16 node types, 4 predicate families, the closed vocabulary) with CHECK/NOT NULL schema enforcement — spec examples are name-equals, name-colon, threshold, pipe-O-pipe, backtick table (no JSON-block declared)
- severity: LOW
- confidence: 0.66

---

## SUMMARY

5 findings — 3 HIGH (2 trace-gap + 1 divergent), 1 MEDIUM ambiguous, 1 LOW orphaned. Provenance completeness: 3/8 spec clauses examined were conformant (graphify extract ONCE via `graphMapper.extract` at `src/hydra/pipeline.ts:34`, RPM ledger `acquire`/`record429` at `src/audit-engine/aether-backend/agent.ts:128`, and ontology CHECK constraints at `src/shared/knowledge-graph/migrations.ts:8` — all returned EXTRACTED edges and were marked RED_HERRING, not emitted). 5 clauses are gapped and map 1:1 to adjudicated verdicts:

- **F0 HIGH divergent** at `pipeline.ts:115` — pipeline `dispatchSubagent` throws `AETHER_MIGRATION`; real dispatch lives at `src/hydra/aether-auditor.ts:runLayerHunter`. Graph query `path AetherHydraPipeline.dispatchSubagent` returned throw, not `AetherAgent.run`.
- **F1 HIGH trace-gap** at `memory.ts:103` — `getGraph` returns `null` and `mergeGraphSlice` at `:115` is `return;` no-op; spec requires hydration via `QueryEngine.temporal`. `grep -rn mergeGraphSlice src/hydra` only stub.
- **F2 HIGH trace-gap** at `r-provenance.ts:45` — `isBatchBActive` guard returns 0 silently; fallback at `:60-75` correct but shadowed. `graphify:query "path spec clause reference to code implementation"` shows guard.
- **F3 MEDIUM ambiguous** at `aether-tools.ts:280` — dual `kindForLayer` with two INFERRED edges equal confidence; `graphify:subgraph depth=3` around `graph_tag` shows divergent fallbacks, no EXTRACTED anchor.
- **F4 LOW orphaned** at `spec-bindings.ts:110` — JSON-block tolerance extends 5-shape parser without spec declaration; defensive but not traced.

**Prior-gate correlation:** LASME candidates filtered by `['spec-clause','trace']` included 0 candidates overlapping these file:lines — `lasmeShapeFound=false` for all 5 rows, confirming MPSE-only gaps invisible to LASME lenses.

**Graph facts:** `src/hydra/memory.ts` `getGraph` correctly reads `typed_nodes/typed_edges WHERE superseded_run IS NULL` (EXTRACTED, lines 112-131) proving read leg conformant while write/query legs are stubbed — gap isolated to two tagged methods. `PREDICATE_SET` and `NODE_TYPES_SET` checks passed via `isPredicate`/`isNodeType` at `aether-meta.ts:writeRunnerTag`.

**Adjudication intent:** F0-F2 are TRUE_DEFECT (specPath+specQuote+codeQuote+divergence), F3 UNCLEAR (missingEvidence), F4 RED_HERRING (legitimizingReason) — see `verdicts.json` for validator-clean adjudication.



## CORRELATIONS
same-site multi-predicate clusters: 1696 from 43004 typed_edges

| site | predicates | count |
|------|------------|-------|
| fn:buildScopedProgram | awaits, calls, declares | 3 |
| fn:callMiMoDirect | awaits, calls, declares | 3 |
| fn:classify | awaits, calls, declares | 3 |
| fn:classifyProject | awaits, calls, declares | 3 |
| fn:collectSourceFiles | awaits, calls, declares | 3 |
| fn:compile | awaits, calls, declares | 3 |
| fn:execTool | awaits, calls, declares | 3 |
| fn:fileExists | awaits, calls, declares | 3 |
| fn:generateBatchChunk | awaits, calls, declares | 3 |
| fn:generateReport | awaits, calls, declares | 3 |
| fn:generateSpecViaLLM | awaits, calls, declares | 3 |
| fn:getEvidenceStore | awaits, calls, declares | 3 |
| fn:lasmeSynthesize | awaits, calls, declares | 3 |
| fn:map | awaits, calls, declares | 3 |
| fn:mpseSynthesize | awaits, calls, declares | 3 |
| fn:persistVerdicts | awaits, calls, declares | 3 |
| fn:probeProvider | awaits, calls, declares | 3 |
| fn:readFindingsReport | awaits, calls, declares | 3 |
| fn:readPackageJson | awaits, calls, declares | 3 |
| fn:readVerdicts | awaits, calls, declares | 3 |
| fn:resolveProjectRoot | awaits, calls, declares | 3 |
| fn:run | awaits, calls, declares | 3 |
| fn:runCalibration | awaits, calls, declares | 3 |
| fn:runL6Loop | awaits, calls, declares | 3 |
| fn:runLayerHunter | awaits, calls, declares | 3 |
| fn:runMetaLayer | awaits, calls, declares | 3 |
| fn:runRuntimeScenario | awaits, calls, declares | 3 |
| fn:runStepX | awaits, calls, declares | 3 |
| fn:scan | awaits, calls, declares | 3 |
| fn:solveTrace | awaits, calls, declares | 3 |
| fn:sroSynthesize | awaits, calls, declares | 3 |
| fn:synthesizeWarheadSkill | awaits, calls, declares | 3 |
| fn:tmpProject | awaits, calls, declares | 3 |
| fn:tridentLog | awaits, calls, declares | 3 |
| /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/lasme.ts:19 | shouldBe, violates | 2 |
| audit-engine/index.ts:82 | contradicts_oracle, derived_from | 2 |
| file:artifacts/defense-catalog.ts | exports, imports | 2 |
| file:audit-engine/aether-backend/agent.js | exports, imports | 2 |
| file:audit-engine/aether-backend/demand-builder.js | exports, imports | 2 |
| file:audit-engine/aether-backend/identity.js | exports, imports | 2 |
| file:audit-engine/aether-backend/phase-controller.js | exports, imports | 2 |
| file:audit-engine/aether-backend/probe.js | exports, imports | 2 |
| file:audit-engine/aether-backend/provider.js | exports, imports | 2 |
| file:audit-engine/aether-backend/rpm-ledger.js | exports, imports | 2 |
| file:audit-engine/aether-backend/tools.js | exports, imports | 2 |
| file:audit-engine/aether/aether-brain.js | exports, imports | 2 |
| file:audit-engine/aether/aether-store.js | exports, imports | 2 |
| file:audit-engine/aether/deeper-probe.js | exports, imports | 2 |
| file:audit-engine/aether/silent-verifier.js | exports, imports | 2 |
| file:audit-engine/aether/supremacy-brief.js | exports, imports | 2 |
| file:audit-engine/events/event-substrate.js | exports, imports | 2 |
| file:audit-engine/math/contract.ts | exports, imports | 2 |
| file:audit-engine/math/eval.ts | exports, imports | 2 |
| file:audit-engine/math/expr.ts | exports, imports | 2 |
| file:audit-engine/math/firewall.ts | exports, imports | 2 |
| file:audit-engine/math/oracle.ts | exports, imports | 2 |
| file:audit-engine/runtime/runtime-verification.ts | exports, imports | 2 |
| file:audit-engine/scoring.ts | exports, imports | 2 |
| file:evidence/evidence-store.js | exports, imports | 2 |
| file:evidence/merkle-chain.js | exports, imports | 2 |
| file:fsm/orchestrator-machine-v2.js | exports, imports | 2 |
| file:shared/knowledge-graph/db.ts | exports, imports | 2 |
| file:subagents/trident-auditor/conformance/checker.ts | exports, imports | 2 |
| file:subagents/trident-auditor/conformance/conformance-templates.ts | exports, imports | 2 |
| file:subagents/trident-auditor/conformance/spec-extractor.ts | exports, imports | 2 |
| file:subagents/trident-auditor/firewall/fix-scope.ts | exports, imports | 2 |
| file:subagents/trident-auditor/firewall/red-team.ts | exports, imports | 2 |
| file:subagents/trident-auditor/harness/audit-machine.ts | exports, imports | 2 |
| file:subagents/trident-auditor/shared/shared-db-client.ts | exports, imports | 2 |
| file:subagents/trident-auditor/tools/audit.ts | exports, imports | 2 |
| file:subagents/trident-auditor/tools/build-done.ts | exports, imports | 2 |
| file:subagents/trident-auditor/tools/fix-apply.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/firewall/artifact-scope.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/firewall/readonly.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/graph/corbell-embeddings.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/map.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/micro-loop-machine.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/recon.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/report.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/scan.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/strike.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/trace.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/hooks/bus-hook.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/surface/lsp-injector.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/surface/query-tool.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/tools/bug-hunt.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/tools/docs-patterns.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/tools/mcp-bridge.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/tools/report-writer.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/tools/ui-server.ts | exports, imports | 2 |
| file:warheads/p1-p10-scanner/scanner.js | exports, imports | 2 |
| file:warheads/ts-compiler-api/program.js | exports, imports | 2 |
| fn:__setAgentCtorForTesting | calls, declares | 2 |
| fn:absRel | calls, declares | 2 |
| fn:accessIsGuarded | calls, declares | 2 |
| fn:acquireHuntLock | calls, declares | 2 |
| fn:activeCalibrationGate | calls, declares | 2 |
| fn:activeRunId | calls, declares | 2 |
| fn:actorError | calls, declares | 2 |
| fn:actorOutput | calls, declares | 2 |
| fn:adapterFailed | calls, declares | 2 |
| fn:adapterParseError | calls, declares | 2 |
| fn:adaptToPhaseChange | calls, declares | 2 |
| fn:addToRegistry | calls, declares | 2 |
| fn:aetherLedgerRootFor | calls, declares | 2 |
| fn:allowed | calls, declares | 2 |
| fn:analyzeActorCalls | calls, declares | 2 |
| fn:analyzeAdapterShape | calls, declares | 2 |
| fn:analyzeAgentGuardFields | calls, declares | 2 |
| fn:analyzeBuildCommand | calls, declares | 2 |
| fn:analyzeContractCalls | calls, declares | 2 |
| fn:analyzeEngineShape | calls, declares | 2 |
| fn:analyzeFieldType | calls, declares | 2 |
| fn:analyzeMachineConfig | calls, declares | 2 |
| fn:analyzeMethodBody | calls, declares | 2 |
| fn:analyzeProject | calls, declares | 2 |
| fn:analyzeReturnObject | calls, declares | 2 |
| fn:anchorExistsWithinScope | calls, declares | 2 |
| fn:append | calls, declares | 2 |
| fn:appendEvent | calls, declares | 2 |
| fn:appendFinding | calls, declares | 2 |
| fn:appendFindings | calls, declares | 2 |
| fn:appendReportSection | calls, declares | 2 |
| fn:appendToContextWindow | calls, declares | 2 |
| fn:appendVerificationSection | calls, declares | 2 |
| fn:appendWriteViolation | calls, declares | 2 |
| fn:applyCalibrationSignal | calls, declares | 2 |
| fn:applyFamilyPragmas | calls, declares | 2 |
| fn:applyFeedbackForVerdict | calls, declares | 2 |
| fn:applyPragmas | calls, declares | 2 |
| fn:architectureContextHandler | calls, declares | 2 |
| fn:argReferencesEnvSource | calls, declares | 2 |
| fn:argReferencesJsonSource | calls, declares | 2 |
| fn:artifactPathFor | calls, declares | 2 |
| fn:asCalibrated | calls, declares | 2 |
| fn:asciiEdgeRow | calls, declares | 2 |
| fn:asFixture | calls, declares | 2 |
| fn:asFunctionLike | calls, declares | 2 |
| fn:asHook | calls, declares | 2 |
| fn:asNode | calls, declares | 2 |
| fn:asRecord | calls, declares | 2 |
| fn:assemblePlan | calls, declares | 2 |
| fn:assembleReport | awaits, declares | 2 |
| fn:assert | calls, declares | 2 |
| fn:assertAuditSpecValid | calls, declares | 2 |
| fn:assertEqual | calls, declares | 2 |
| fn:assertNamedFailure | awaits, declares | 2 |
| fn:assertNoBlindness | calls, declares | 2 |
| fn:assertRunId | calls, declares | 2 |
| fn:assertSealedStartsWithHeading | calls, declares | 2 |
| fn:assertSingleProviderChain | calls, declares | 2 |
| fn:assertTriageTriad | calls, declares | 2 |
| fn:assertUsableDb | calls, declares | 2 |
| fn:assessThreats | calls, declares | 2 |
| fn:asSignature | calls, declares | 2 |
| fn:asStreamFetch | calls, declares | 2 |
| fn:asString | calls, declares | 2 |
| fn:asStringArg | calls, declares | 2 |
| fn:asStringLit | calls, declares | 2 |
| fn:astFingerprint | calls, declares | 2 |
| fn:asToolInput | calls, declares | 2 |
| fn:asyncOp | calls, declares | 2 |
| fn:attachConfidenceDimensions | calls, declares | 2 |
| fn:attachReproducible | calls, declares | 2 |
| fn:attackState | calls, declares | 2 |
| fn:audit | awaits, declares | 2 |
| fn:auditAsyncDiscipline | calls, declares | 2 |
| fn:auditAtomicState | calls, declares | 2 |
| fn:auditBibleGrounding | calls, declares | 2 |
| fn:auditConfigValidation | calls, declares | 2 |
| fn:auditDefensiveImport | calls, declares | 2 |
| fn:auditDiffRow | calls, declares | 2 |
| fn:auditErrorCompletenessAst | calls, declares | 2 |
| fn:auditMissingEvidenceAst | calls, declares | 2 |
| fn:auditOutputContractAst | calls, declares | 2 |
| fn:auditOutputIsWork | calls, declares | 2 |
| fn:auditPathResolution | calls, declares | 2 |
| fn:auditResourceLifecycle | calls, declares | 2 |
| fn:auditTypeCertainty | calls, declares | 2 |
| fn:avgConfByLayer | calls, declares | 2 |
| fn:avgConfByLayers | calls, declares | 2 |
| fn:awarenessDocMissing | calls, declares | 2 |
| fn:b | calls, declares | 2 |
| fn:baselineState | calls, declares | 2 |
| fn:batteryName | calls, declares | 2 |
| fn:batteryVersion | calls, declares | 2 |
| fn:bf | calls, declares | 2 |
| fn:BF | calls, declares | 2 |
| fn:bind | calls, declares | 2 |
| fn:bindCalibrationGate | calls, declares | 2 |
| fn:bindingsHasValues | calls, declares | 2 |
| fn:bindingsMap | calls, declares | 2 |
| fn:bindNumber | calls, declares | 2 |
| fn:bindOperator | calls, declares | 2 |
| fn:bindRange | calls, declares | 2 |
| fn:bindSeverity | calls, declares | 2 |
| fn:bindStages | calls, declares | 2 |
| fn:bindStringArray | calls, declares | 2 |
| fn:blastRadius | calls, declares | 2 |
| fn:blastRadiusFor | calls, declares | 2 |
| fn:blocked | calls, declares | 2 |
| fn:branchExits | calls, declares | 2 |
| fn:briefOf | calls, declares | 2 |
| fn:briefParts | calls, declares | 2 |
| fn:brokenInput | calls, declares | 2 |
| fn:budgetFor | calls, declares | 2 |
| fn:budgetRounds | calls, declares | 2 |
| fn:buildAdapter | awaits, declares | 2 |
| fn:buildAlgorithmSpecSection | calls, declares | 2 |
| fn:buildAppendices | calls, declares | 2 |
| fn:buildArchitectureDiagrams | awaits, declares | 2 |
| fn:buildAST | awaits, declares | 2 |
| fn:buildAuditDemand | calls, declares | 2 |
| fn:buildAuditorTools | calls, declares | 2 |
| fn:buildBehavioralPatternSection | calls, declares | 2 |
| fn:buildBibleBrief | calls, declares | 2 |
| fn:buildBibleCrossReferenceSection | calls, declares | 2 |
| fn:buildBlindSpot | calls, declares | 2 |
| fn:buildBlindSpotSection | calls, declares | 2 |
| fn:buildBrief | calls, declares | 2 |
| fn:buildCallGraph | calls, declares | 2 |
| fn:buildContext | calls, declares | 2 |
| fn:buildContinuationPrompt | calls, declares | 2 |
| fn:buildCorrelationSection | calls, declares | 2 |
| fn:buildCTESql | calls, declares | 2 |
| fn:buildCurrentStateSection | calls, declares | 2 |
| fn:buildCypherForTarget | calls, declares | 2 |
| fn:buildDataFlowGraph | calls, declares | 2 |
| fn:buildDataModelSection | calls, declares | 2 |
| fn:buildDebugLogBrief | calls, declares | 2 |
| fn:buildDesignBrief | calls, declares | 2 |
| fn:buildDone | calls, declares | 2 |
| fn:buildEmbeddingIndex | calls, declares | 2 |
| fn:buildEngineClassDesignSection | calls, declares | 2 |
| fn:buildExecutiveSummary | calls, declares | 2 |
| fn:buildExploreProtocolT1 | calls, declares | 2 |
| fn:buildFileContentMap | calls, declares | 2 |
| fn:buildFindingsMap | calls, declares | 2 |
| fn:buildFixture | calls, declares | 2 |
| fn:buildFixtureProfile | calls, declares | 2 |
| fn:buildFullContextBrief | calls, declares | 2 |
| fn:buildGapRemediationMatrix | calls, declares | 2 |
| fn:buildGenerationPrompt | calls, declares | 2 |
| fn:buildHandlers | calls, declares | 2 |
| fn:buildHeader | calls, declares | 2 |
| fn:buildHomelandFixture | calls, declares | 2 |
| fn:buildHookRegistry | calls, declares | 2 |
| fn:buildIdentityBindingT1 | calls, declares | 2 |
| fn:buildInboundMap | calls, declares | 2 |
| fn:buildInconclusiveResult | calls, declares | 2 |
| fn:buildIntegrationSection | calls, declares | 2 |
| fn:buildKickMessage | calls, declares | 2 |
| fn:buildKnowledgeT1 | awaits, declares | 2 |
| fn:buildL1ContentBrief | calls, declares | 2 |
| fn:buildL6Demand | calls, declares | 2 |
| fn:buildLayer1Prompt | calls, declares | 2 |
| fn:buildMeaning | calls, declares | 2 |
| fn:buildMechanicalIndex | calls, declares | 2 |
| fn:buildMetaTools | calls, declares | 2 |
| fn:buildNarrationRejection | calls, declares | 2 |
| fn:buildOutboundMap | calls, declares | 2 |
| fn:buildOutputContract | calls, declares | 2 |
| fn:buildPart1Supremacy | calls, declares | 2 |
| fn:buildPart2Inference | calls, declares | 2 |
| fn:buildPart3Specs | calls, declares | 2 |
| fn:buildPart4Candidates | calls, declares | 2 |
| fn:buildPart5FocusesAndContract | calls, declares | 2 |
| fn:buildPhantomRejection | calls, declares | 2 |
| fn:buildPreflightGroundingSection | calls, declares | 2 |
| fn:buildProbePrompt | calls, declares | 2 |
| fn:buildProblemSolvingBrief | calls, declares | 2 |
| fn:buildPrompt1Demand | calls, declares | 2 |
| fn:buildPrompt2Batch | calls, declares | 2 |
| fn:buildReportBrief | calls, declares | 2 |
| fn:buildReproductionCommand | calls, declares | 2 |
| fn:buildRequirementsAppendix | calls, declares | 2 |
| fn:buildRows | calls, declares | 2 |
| fn:buildRuleSection | calls, declares | 2 |
| fn:buildSemanticBattery | calls, declares | 2 |
| fn:buildSentinelFleet | calls, declares | 2 |
| fn:buildSroOutputContract | calls, declares | 2 |
| fn:buildStitchContent | calls, declares | 2 |
| fn:buildSupremacyBrief | calls, declares | 2 |
| fn:buildT1InjectableBrief | calls, declares | 2 |
| fn:buildTargetArchitectureSection | calls, declares | 2 |
| fn:buildTemplateShell | calls, declares | 2 |
| fn:buildTestSpecificationsSection | calls, declares | 2 |
| fn:buildThresholds | calls, declares | 2 |
| fn:buildTree | calls, declares | 2 |
| fn:buildTypeRelationships | calls, declares | 2 |
| fn:buildUnclassifiedVerdicts | calls, declares | 2 |
| fn:buildVerificationMatrixSection | calls, declares | 2 |
| fn:buildWorkedDetectionExampleSection | calls, declares | 2 |
| fn:bv | calls, declares | 2 |
| fn:cadencePlane | calls, declares | 2 |
| fn:calibrationFixtureInvalid | calls, declares | 2 |
| fn:calibStaleDemand | calls, declares | 2 |
| fn:callAutoFire | awaits, declares | 2 |
| fn:callGraphAnalysis | calls, declares | 2 |
| fn:callLLM | awaits, declares | 2 |
| fn:callLLMAsync | awaits, declares | 2 |
| fn:cand | calls, declares | 2 |
| fn:candidatesToFindings | calls, declares | 2 |
| fn:canonicalExpr | calls, declares | 2 |
| fn:canonicalExprId | calls, declares | 2 |
| fn:canonicalJson | calls, declares | 2 |
| fn:capitalize | calls, declares | 2 |
| fn:captureError | awaits, declares | 2 |
| fn:cast | calls, declares | 2 |
| fn:catchLogsErrorVariable | calls, declares | 2 |
| fn:chain | calls, declares | 2 |
| fn:chainAfterHook | calls, declares | 2 |
| fn:chainBeforeHook | calls, declares | 2 |
| fn:chainGraph | calls, declares | 2 |
| fn:changedEvidence | calls, declares | 2 |
| fn:checkAdversarialCoverage | calls, declares | 2 |
| fn:checkAgentClassification | calls, declares | 2 |
| fn:checkArrayFields | calls, declares | 2 |
| fn:checkArrowFunction | calls, declares | 2 |
| fn:checkBuildSingleFile | calls, declares | 2 |
| fn:checkCompletenessChain | calls, declares | 2 |
| fn:checkContract | calls, declares | 2 |
| fn:checkDefenseRuleStructure | calls, declares | 2 |
| fn:checkDuplicateSections | calls, declares | 2 |
| fn:checkF1Isolation | calls, declares | 2 |
| fn:checkFilePaths | calls, declares | 2 |
| fn:checkFunctionSignatures | calls, declares | 2 |
| fn:checkGraphAwaited | calls, declares | 2 |
| fn:checkGuardian | calls, declares | 2 |
| fn:checkIdentityBeforeTool | calls, declares | 2 |
| fn:checkIdentityIntegrity | calls, declares | 2 |
| fn:checkIdentityLoaded | calls, declares | 2 |
| fn:checkManifestComplete | calls, declares | 2 |
| fn:checkNumberingErrors | calls, declares | 2 |
| fn:checkQ1Exist | calls, declares | 2 |
| fn:checkQ2Called | calls, declares | 2 |
| fn:checkQ3DoesWhatSays | calls, declares | 2 |
| fn:checkQ4MatchesSpec | calls, declares | 2 |
| fn:checkQ5Theatrical | calls, declares | 2 |
| fn:checkQ6Copied | calls, declares | 2 |
| fn:checkRegistryType | calls, declares | 2 |
| fn:checkReportMarkers | calls, declares | 2 |
| fn:checkReturnsPromise | calls, declares | 2 |
| fn:checkReturnStatement | calls, declares | 2 |
| fn:checkSectionCompleteness | calls, declares | 2 |
| fn:checkSignature | calls, declares | 2 |
| fn:checkSmokeTestFirewall | awaits, declares | 2 |
| fn:checkStringFields | calls, declares | 2 |
| fn:checkTaskDispatch | calls, declares | 2 |
| fn:checkTheatricalMerkle | awaits, declares | 2 |
| fn:checkTheatricalPatterns | awaits, declares | 2 |
| fn:checkThresholdConsistency | calls, declares | 2 |
| fn:checkTypeFieldConsistency | calls, declares | 2 |
| fn:checkTypeNameConsistency | calls, declares | 2 |
| fn:checkUiReachable | awaits, declares | 2 |
| fn:checkVersionConsistency | calls, declares | 2 |
| fn:checkWarheadsBound | calls, declares | 2 |
| fn:chunkForProbe | calls, declares | 2 |
| fn:citedAnchors | calls, declares | 2 |
| fn:citedIdentifiers | calls, declares | 2 |
| fn:citesGraphOps | calls, declares | 2 |
| fn:claimConfig | calls, declares | 2 |
| fn:claimDemand | calls, declares | 2 |
| fn:claimedButNotFixedEvidence | calls, declares | 2 |
| fn:claimLexiconHasMatch | calls, declares | 2 |
| fn:claimVsReality | calls, declares | 2 |
| fn:clamp | calls, declares | 2 |
| fn:clampDepth | calls, declares | 2 |
| fn:classifyActivationIntent | calls, declares | 2 |
| fn:classifyExecError | calls, declares | 2 |
| fn:classifyFact | calls, declares | 2 |
| fn:classifyNode | calls, declares | 2 |
| fn:classifySection | calls, declares | 2 |
| fn:classifyTarget | calls, declares | 2 |
| fn:cleanDb | calls, declares | 2 |
| fn:clearCurrentAgent | calls, declares | 2 |
| fn:clearPoseidonIntent | calls, declares | 2 |
| fn:clearPoseidonPoller | calls, declares | 2 |
| fn:closeTo | calls, declares | 2 |
| fn:codeSearchHandler | calls, declares | 2 |
| fn:collectAgentReferences | calls, declares | 2 |
| fn:collectAllCandidates | calls, declares | 2 |
| fn:collectAssignmentTargets | calls, declares | 2 |
| fn:collectBlockquote | calls, declares | 2 |
| fn:collectCallNames | calls, declares | 2 |
| fn:collectCommentRanges | calls, declares | 2 |
| fn:collectConstantConditions | calls, declares | 2 |
| fn:collectDangerousSinksViaAst | calls, declares | 2 |
| fn:collectDefinedTransitions | calls, declares | 2 |
| fn:collectDeps | calls, declares | 2 |
| fn:collectEmptyCatchBlocks | calls, declares | 2 |
| fn:collectFiles | calls, declares | 2 |
| fn:collectLiteralComparisons | calls, declares | 2 |
| fn:collectMissingReturns | calls, declares | 2 |
| fn:collectOwnTreeFiles | calls, declares | 2 |
| fn:collectProjectFiles | calls, declares | 2 |
| fn:collectPropertyAccessChains | calls, declares | 2 |
| fn:collectScopedFiles | calls, declares | 2 |
| fn:collectStringLiterals | calls, declares | 2 |
| fn:collectUnreachableCode | calls, declares | 2 |
| fn:collectUsedTransitions | calls, declares | 2 |
| fn:commentHasMarker | calls, declares | 2 |
| fn:commentIsClosed | calls, declares | 2 |
| fn:COMP | calls, declares | 2 |
| fn:compareOperator | calls, declares | 2 |
| fn:compileBattery | awaits, declares | 2 |
| fn:compileCards | calls, declares | 2 |
| fn:compileDeclared | calls, declares | 2 |
| fn:compileFixtureBattery | awaits, declares | 2 |
| fn:compileOrThrow | calls, declares | 2 |
| fn:compileP1 | calls, declares | 2 |
| fn:compileP20 | calls, declares | 2 |
| fn:compileP21 | calls, declares | 2 |
| fn:compileP6 | calls, declares | 2 |
| fn:compileP8 | calls, declares | 2 |
| fn:compileTemplate | calls, declares | 2 |
| fn:completeInput | calls, declares | 2 |
| fn:componentGroups | calls, declares | 2 |
| fn:composeFinalReport | calls, declares | 2 |
| fn:composeOperatorBrief | calls, declares | 2 |
| fn:computeBlastRadius | calls, declares | 2 |
| fn:computeCalibratedPredicateRatio | calls, declares | 2 |
| fn:computeComplexity | calls, declares | 2 |
| fn:computeConfidence | calls, declares | 2 |
| fn:computeConfidenceDistribution | calls, declares | 2 |
| fn:computeDepthBudgets | calls, declares | 2 |
| fn:computeE4Verdict | calls, declares | 2 |
| fn:computeFindingConfidence | calls, declares | 2 |
| fn:computeFindingsQuality | calls, declares | 2 |
| fn:computeLanguageStats | calls, declares | 2 |
| fn:computeOraclePassRate | calls, declares | 2 |
| fn:computeRoundBudget | calls, declares | 2 |
| fn:computeScore | calls, declares | 2 |
| fn:computeWeightedScore | calls, declares | 2 |
| fn:conditionReferencesEnv | calls, declares | 2 |
| fn:conditionReferencesName | calls, declares | 2 |
| fn:confidenceBand | calls, declares | 2 |
| fn:confidenceLabel | calls, declares | 2 |
| fn:configureToastDelivery | calls, declares | 2 |
| fn:conformanceTemplate | calls, declares | 2 |
| fn:consistency | calls, declares | 2 |
| fn:constantConditionKind | calls, declares | 2 |
| fn:constructFromFixture | calls, declares | 2 |
| fn:constructKind | calls, declares | 2 |
| fn:contentAddress | calls, declares | 2 |
| fn:contentHashId | calls, declares | 2 |
| fn:contradictionChecker | calls, declares | 2 |
| fn:contradictionDemand | calls, declares | 2 |
| fn:convertPdfToImages | calls, declares | 2 |
| fn:copyDir | awaits, declares | 2 |
| fn:corpusEmpty | calls, declares | 2 |
| fn:corpusMissing | calls, declares | 2 |
| fn:corpusUnreadable | calls, declares | 2 |
| fn:correlationCounts | calls, declares | 2 |
| fn:cosineSimilarity | calls, declares | 2 |
| fn:countAssertionsInNode | calls, declares | 2 |
| fn:countByLayer | calls, declares | 2 |
| fn:countByLayers | calls, declares | 2 |
| fn:countEngines | calls, declares | 2 |
| fn:countGraphTags | calls, declares | 2 |
| fn:countIfChainDepth | calls, declares | 2 |
| fn:countLineage | calls, declares | 2 |
| fn:countLines | calls, declares | 2 |
| fn:countMachines | calls, declares | 2 |
| fn:countMatches | calls, declares | 2 |
| fn:countPlaceholderCommentsInNode | calls, declares | 2 |
| fn:countQuotedRules | calls, declares | 2 |
| fn:countRejectAuditIssues | calls, declares | 2 |
| fn:countRows | calls, declares | 2 |
| fn:countsFromVerdicts | calls, declares | 2 |
| fn:countSourceLines | awaits, declares | 2 |
| fn:countStatementsInNode | calls, declares | 2 |
| fn:countSymbolReferences | calls, declares | 2 |
| fn:countTsFilesInTarget | calls, declares | 2 |
| fn:createAgentAetherBrain | calls, declares | 2 |
| fn:createAuditMachine | calls, declares | 2 |
| fn:createAuditorTools | calls, declares | 2 |
| fn:createAuditTool | calls, declares | 2 |
| fn:createBugHunterHooks | calls, declares | 2 |
| fn:createBugHunterQueryTool | calls, declares | 2 |
| fn:createBugHuntTool | calls, declares | 2 |
| fn:createBuildDoneTool | calls, declares | 2 |
| fn:createBuildStatusTool | calls, declares | 2 |
| fn:createContainerTestTool | calls, declares | 2 |
| fn:createDocsPatterns | calls, declares | 2 |
| fn:createFixApplyTool | calls, declares | 2 |
| fn:createGateHook | calls, declares | 2 |
| fn:createGraphifyTools | calls, declares | 2 |
| fn:createGrepTool | calls, declares | 2 |
| fn:createHydraBus | calls, declares | 2 |
| fn:createHydraTransport | calls, declares | 2 |
| fn:createMicroLoop | calls, declares | 2 |
| fn:createMpsePostGates | calls, declares | 2 |
| fn:createMpsePreGates | calls, declares | 2 |
| fn:createOmniVisionTool | calls, declares | 2 |
| fn:createOracleRegistry | calls, declares | 2 |
| fn:createPhaseController | calls, declares | 2 |
| fn:createPreflightTool | calls, declares | 2 |
| fn:createReportWriterTool | calls, declares | 2 |
| fn:createReportWriteTool | calls, declares | 2 |
| fn:createSessionHook | calls, declares | 2 |
| fn:createShipPackageTool | calls, declares | 2 |
| fn:createSroPostGates | calls, declares | 2 |
| fn:createSroPreGates | calls, declares | 2 |
| fn:createSystemTransformHook | calls, declares | 2 |
| fn:createTridentBuildHooks | calls, declares | 2 |
| fn:createTridentHooks | calls, declares | 2 |
| fn:createTridentTools | calls, declares | 2 |
| fn:ctx | calls, declares | 2 |
| fn:ctxFor | calls, declares | 2 |
| fn:ctxWithConstruct | calls, declares | 2 |
| fn:dbHandle | calls, declares | 2 |
| fn:debugLog | calls, declares | 2 |
| fn:decide | calls, declares | 2 |
| fn:decideVerdict | calls, declares | 2 |
| fn:decodeFloat32Blob | calls, declares | 2 |
| fn:dedupe | calls, declares | 2 |
| fn:dedupeEdges | calls, declares | 2 |
| fn:dedupeFindings | calls, declares | 2 |
| fn:deduplicateFindings | calls, declares | 2 |
| fn:defaultReader | calls, declares | 2 |
| fn:defaultState | calls, declares | 2 |
| fn:defaultTransport | calls, declares | 2 |
| fn:delayedProbe | calls, declares | 2 |
| fn:deliverGateToast | calls, declares | 2 |
| fn:deliveryLog | calls, declares | 2 |
| fn:deliverySurface | calls, declares | 2 |
| fn:DENSE | calls, declares | 2 |
| fn:deriveDesignTensions | calls, declares | 2 |
| fn:deriveFindingIds | calls, declares | 2 |
| fn:deriveNarrativeArc | calls, declares | 2 |
| fn:deriveProjectRoot | calls, declares | 2 |
| fn:deriveRootCause | calls, declares | 2 |
| fn:deriveScenarioVerdict | calls, declares | 2 |
| fn:detectAgentGuard | calls, declares | 2 |
| fn:detectCatchBlockViolations | calls, declares | 2 |
| fn:detectConfigTheater | calls, declares | 2 |
| fn:detectContextSynthesisLayer | calls, declares | 2 |
| fn:detectDeadEnforcementFunction | calls, declares | 2 |
| fn:detectDocumentationDrift | calls, declares | 2 |
| fn:detectDomain | calls, declares | 2 |
| fn:detectFireAndForget | calls, declares | 2 |
| fn:detectHookHandler | calls, declares | 2 |
| fn:detectIntent | calls, declares | 2 |
| fn:detectLanguages | calls, declares | 2 |
| fn:detectMediaType | calls, declares | 2 |
| fn:detectPhantomTest | calls, declares | 2 |
| fn:detectPipelineTheater | calls, declares | 2 |
| fn:detectPlaceholderCode | calls, declares | 2 |
| fn:detectPrefixMixing | calls, declares | 2 |
| fn:detectProjectShape | awaits, declares | 2 |
| fn:detectR17Drift | awaits, declares | 2 |
| fn:detectReturnTypeViolations | calls, declares | 2 |
| fn:detectSilentCatch | calls, declares | 2 |
| fn:detectStubReturn | calls, declares | 2 |
| fn:detectSuccessSignal | calls, declares | 2 |
| fn:detectTemplateRepetition | calls, declares | 2 |
| fn:detectWhitespacePadding | calls, declares | 2 |
| fn:diag | calls, declares | 2 |
| fn:discoverProject | awaits, declares | 2 |
| fn:dispatchRuntimeEvent | calls, declares | 2 |
| fn:docsPatternError | calls, declares | 2 |
| fn:docsPatternsStorePath | calls, declares | 2 |
| fn:docsPatternsVerb | calls, declares | 2 |
| fn:doWork | calls, declares | 2 |
| fn:drainPendingSessions | awaits, declares | 2 |
| fn:driftDb | calls, declares | 2 |
| fn:edge | calls, declares | 2 |
| fn:edgeLevel | calls, declares | 2 |
| fn:embeddingError | calls, declares | 2 |
| fn:embeddingStorePath | calls, declares | 2 |
| fn:emitWithDedupe | calls, declares | 2 |
| fn:emptyGraphDiagrams | calls, declares | 2 |
| fn:emptyMergeResult | calls, declares | 2 |
| fn:encodeBase64 | calls, declares | 2 |
| fn:enforceBashLockdown | calls, declares | 2 |
| fn:enforceBeforeExecution | calls, declares | 2 |
| fn:enforceFixScope | calls, declares | 2 |
| fn:enforceIdentity | calls, declares | 2 |
| fn:enforcePinned | calls, declares | 2 |
| fn:enforceReportScope | awaits, declares | 2 |
| fn:enforceWriteScope | calls, declares | 2 |
| fn:engineGraphEmpty | calls, declares | 2 |
| fn:enrichWithHiveKnowledge | awaits, declares | 2 |
| fn:ensureAetherVerdictsSchema | calls, declares | 2 |
| fn:ensureAuditSpecFile | calls, declares | 2 |
| fn:ensureDir | calls, declares | 2 |
| fn:ensureEventSubstrate | calls, declares | 2 |
| fn:ensureFamilyTables | calls, declares | 2 |
| fn:ensureLedgerDir | calls, declares | 2 |
| fn:ensurePlanesRegistered | calls, declares | 2 |
| fn:ensureSelfAudit | calls, declares | 2 |
| fn:ensureT2Cache | calls, declares | 2 |
| fn:ensureTypedGraphSchema | calls, declares | 2 |
| fn:envVarIsGuarded | calls, declares | 2 |
| fn:envWith | calls, declares | 2 |
| fn:errJson | calls, declares | 2 |
| fn:errorCode | calls, declares | 2 |
| fn:errorDetail | calls, declares | 2 |
| fn:estimateIndexBytes | calls, declares | 2 |
| fn:estimatePhases | calls, declares | 2 |
| fn:evalCached | calls, declares | 2 |
| fn:evalExpr | calls, declares | 2 |
| fn:evalInternal | calls, declares | 2 |
| fn:evaluateContainerResults | calls, declares | 2 |
| fn:evaluateExpression | calls, declares | 2 |
| fn:evaluateHealth | calls, declares | 2 |
| fn:evaluateMathVerdict | calls, declares | 2 |
| fn:eventFn | awaits, calls | 2 |
| fn:eventInfo | calls, declares | 2 |
| fn:eventInvalid | calls, declares | 2 |
| fn:eventKind | calls, declares | 2 |
| fn:evidenceDb | calls, declares | 2 |
| fn:evidenceExcerpt | calls, declares | 2 |
| fn:evidenceQuoteForNode | calls, declares | 2 |
| fn:evStr | calls, declares | 2 |
| fn:evt | calls, declares | 2 |
| fn:exec | awaits, calls | 2 |
| fn:execFile | awaits, calls | 2 |
| fn:execFn | calls, declares | 2 |
| fn:expectRejects | awaits, declares | 2 |
| fn:exprReferencesAnyParam | calls, declares | 2 |
| fn:exprReferencesEnvOrJsonParse | calls, declares | 2 |
| fn:extractAlgorithmSignals | calls, declares | 2 |
| fn:extractArrowFunctionName | calls, declares | 2 |
| fn:extractAttachedComment | calls, declares | 2 |
| fn:extractBindings | calls, declares | 2 |
| fn:extractCalleeName | calls, declares | 2 |
| fn:extractCandidateGraph | calls, declares | 2 |
| fn:extractCandidateIds | calls, declares | 2 |
| fn:extractClasses | calls, declares | 2 |
| fn:extractCodeSections | calls, declares | 2 |
| fn:extractCommand | calls, declares | 2 |
| fn:extractCommentText | calls, declares | 2 |
| fn:extractCommentTextForCatch | calls, declares | 2 |
| fn:extractConstObjects | calls, declares | 2 |
| fn:extractConstructs | calls, declares | 2 |
| fn:extractContracts | calls, declares | 2 |
| fn:extractDecisions | calls, declares | 2 |
| fn:extractDeclaredContracts | calls, declares | 2 |
| fn:extractDepth | calls, declares | 2 |
| fn:extractDocsPatterns | calls, declares | 2 |
| fn:extractEnums | calls, declares | 2 |
| fn:extractFailureModes | calls, declares | 2 |
| fn:extractFindingsFromGraph | calls, declares | 2 |
| fn:extractFixFilesFromText | calls, declares | 2 |
| fn:extractFunctions | calls, declares | 2 |
| fn:extractImports | calls, declares | 2 |
| fn:extractInlineQuote | calls, declares | 2 |
| fn:extractInterfaces | calls, declares | 2 |
| fn:extractJsDocReturns | calls, declares | 2 |
| fn:extractJsonFromText | calls, declares | 2 |
| fn:extractKeyTerms | calls, declares | 2 |
| fn:extractKeywords | calls, declares | 2 |
| fn:extractLabels | calls, declares | 2 |
| fn:extractMechanical | calls, declares | 2 |
| fn:extractModifiers | calls, declares | 2 |
| fn:extractOutputText | calls, declares | 2 |
| fn:extractParameters | calls, declares | 2 |
| fn:extractPath | calls, declares | 2 |
| fn:extractPatterns | calls, declares | 2 |
| fn:extractPrinciplesFromText | calls, declares | 2 |
| fn:extractReceived | calls, declares | 2 |
| fn:extractRegistryIds | calls, declares | 2 |
| fn:extractRelations | calls, declares | 2 |
| fn:extractReturn | calls, declares | 2 |
| fn:extractReturnPathsAST | calls, declares | 2 |
| fn:extractReturnType | calls, declares | 2 |
| fn:extractRuleCards | calls, declares | 2 |
| fn:extractSection | calls, declares | 2 |
| fn:extractSectionHeadings | calls, declares | 2 |
| fn:extractSemanticName | calls, declares | 2 |
| fn:extractStructuralNames | calls, declares | 2 |
| fn:extractSummary | calls, declares | 2 |
| fn:extractTolerance | calls, declares | 2 |
| fn:extractToolArgs | calls, declares | 2 |
| fn:extractTouchedFile | calls, declares | 2 |
| fn:extractTypeAliases | calls, declares | 2 |
| fn:extractTypeNames | calls, declares | 2 |
| fn:extractVerbs | calls, declares | 2 |
| fn:extractVideoFrames | calls, declares | 2 |
| fn:extractWhere | calls, declares | 2 |
| fn:F | calls, declares | 2 |
| fn:fail | calls, declares | 2 |
| fn:failEq | calls, declares | 2 |
| fn:failGt | calls, declares | 2 |
| fn:failingAdapter | calls, declares | 2 |
| fn:failLt | calls, declares | 2 |
| fn:fakeAdapter | calls, declares | 2 |
| fn:fakeGraph | calls, declares | 2 |
| fn:fakeMemory | calls, declares | 2 |
| fn:fakeReturnDemand | calls, declares | 2 |
| fn:familyPromotionPending | calls, declares | 2 |
| fn:familyRootDrift | calls, declares | 2 |
| fn:familyRootReadonly | calls, declares | 2 |
| fn:fetch | awaits, calls | 2 |
| fn:fetchRemote | awaits, declares | 2 |
| fn:fetchRemoteData | calls, declares | 2 |
| fn:fileDriftReport | calls, declares | 2 |
| fn:fileMatches | calls, declares | 2 |
| fn:fillBig | calls, declares | 2 |
| fn:filterByConfidence | calls, declares | 2 |
| fn:findAuditLayers | calls, declares | 2 |
| fn:findCallSites | calls, declares | 2 |
| fn:findCatchClausesInFunction | calls, declares | 2 |
| fn:findDeadExports | calls, declares | 2 |
| fn:findEnclosingFunction | calls, declares | 2 |
| fn:findEntryPoints | calls, declares | 2 |
| fn:findExistingPackage | awaits, declares | 2 |
| fn:findExistingVariant | awaits, declares | 2 |
| fn:findIdentityCheckFunctions | calls, declares | 2 |
| fn:findingCheckFailed | calls, declares | 2 |
| fn:findingIdOf | calls, declares | 2 |
| fn:findingInvalid | calls, declares | 2 |
| fn:findingNoTriplet | calls, declares | 2 |
| fn:findings | calls, declares | 2 |
| fn:findingSeverity | calls, declares | 2 |
| fn:findingsFromHandle | calls, declares | 2 |
| fn:findingWeight | calls, declares | 2 |
| fn:findMarkerFindings | calls, declares | 2 |
| fn:findMatchingDefense | calls, declares | 2 |
| fn:findNodeAtPosition | calls, declares | 2 |
| fn:findReturnStatements | calls, declares | 2 |
| fn:findTheatricalReturns | calls, declares | 2 |
| fn:findTopLevelColon | calls, declares | 2 |
| fn:findTypos | calls, declares | 2 |
| fn:findVariableDeclaration | calls, declares | 2 |
| fn:findWarheads | calls, declares | 2 |
| fn:fingerprintSimilarity | calls, declares | 2 |
| fn:fireAndForgetPersist | calls, declares | 2 |
| fn:fireBlock | calls, declares | 2 |
| fn:fixApply | calls, declares | 2 |
| fn:fixApplyFailed | calls, declares | 2 |
| fn:fixScopeError | calls, declares | 2 |
| fn:fixture | calls, declares | 2 |
| fn:fixtureBrain | calls, declares | 2 |
| fn:fixtureGraph | calls, declares | 2 |
| fn:fixtureProfile | calls, declares | 2 |
| fn:fixtureSources | calls, declares | 2 |
| fn:fixtureWriter | calls, declares | 2 |
| fn:fn | awaits, calls | 2 |
| fn:fnNode | calls, declares | 2 |
| fn:foldAdd | calls, declares | 2 |
| fn:foldAnd | calls, declares | 2 |
| fn:foo | calls, declares | 2 |
| fn:formatAuditFeedback | calls, declares | 2 |
| fn:formatCrossGateContext | calls, declares | 2 |
| fn:formatDeepeningFeedback | calls, declares | 2 |
| fn:formatDetailedFinding | calls, declares | 2 |
| fn:formatDiagnostics | calls, declares | 2 |
| fn:formatErrors | calls, declares | 2 |
| fn:formatFields | calls, declares | 2 |
| fn:formatFinding | calls, declares | 2 |
| fn:formatIdentityHeader | calls, declares | 2 |
| fn:formatLasmeContext | calls, declares | 2 |
| fn:formatRows | calls, declares | 2 |
| fn:formatSemanticRows | calls, declares | 2 |
| fn:formatThreatReport | calls, declares | 2 |
| fn:formatThreshold | calls, declares | 2 |
| fn:formatThresholdForSignal | calls, declares | 2 |
| fn:formatVersion | calls, declares | 2 |
| fn:functionBodyHasTryStatement | calls, declares | 2 |
| fn:functionBodyHasTypeGuard | calls, declares | 2 |
| fn:functionHasSideEffects | calls, declares | 2 |
| fn:functionHasTryCatch | calls, declares | 2 |
| fn:gainByLayer | calls, declares | 2 |
| fn:gainByLayers | calls, declares | 2 |
| fn:gate | calls, declares | 2 |
| fn:gateAuditPath | calls, declares | 2 |
| fn:generateAdversarialChallenges | calls, declares | 2 |
| fn:generateAlgorithms | calls, declares | 2 |
| fn:generateBibleViaLLM | awaits, declares | 2 |
| fn:generateCodeReviewArtifact | calls, declares | 2 |
| fn:generateContainerTestContext | calls, declares | 2 |
| fn:generateContainerTestPlan | calls, declares | 2 |
| fn:generateContainerTestPlanSection | calls, declares | 2 |
| fn:generateContextBrief | calls, declares | 2 |
| fn:generateContextLibraryManifest | calls, declares | 2 |
| fn:generateDecideContext | calls, declares | 2 |
| fn:generateDeploymentManifest | calls, declares | 2 |
| fn:generateDeployScript | calls, declares | 2 |
| fn:generateEngineSpecFromDiscovery | calls, declares | 2 |
| fn:generateExactTestPlanSection | calls, declares | 2 |
| fn:generateExpectedDetails | calls, declares | 2 |
| fn:generateExtractionCode | calls, declares | 2 |
| fn:generateFixSuggestion | calls, declares | 2 |
| fn:generateFixSummary | calls, declares | 2 |
| fn:generateLayer1InitialPlan | calls, declares | 2 |
| fn:generateLayer1Prompt | calls, declares | 2 |
| fn:generateLayer2DetailedWorkflow | calls, declares | 2 |
| fn:generateLibraryIndex | calls, declares | 2 |
| fn:generateMasterPlan | calls, declares | 2 |
| fn:generateNegativeInput | calls, declares | 2 |
| fn:generatePhaseInterface | calls, declares | 2 |
| fn:generatePipelineSpec | calls, declares | 2 |
| fn:generatePlanContext | calls, declares | 2 |
| fn:generatePositiveInput | calls, declares | 2 |
| fn:generateProblemSolveContext | calls, declares | 2 |
| fn:generateReaderQuestions | calls, declares | 2 |
| fn:generateReadme | calls, declares | 2 |
| fn:generateShipManifest | calls, declares | 2 |
| fn:generateT2Knowledge | calls, declares | 2 |
| fn:generateTests | calls, declares | 2 |
| fn:generateTypes | calls, declares | 2 |
| fn:generateVerificationChecklist | calls, declares | 2 |
| fn:generateVerifyContext | calls, declares | 2 |
| fn:generateWorkedExampleInput | calls, declares | 2 |
| fn:generateWorkedExampleSignal | calls, declares | 2 |
| fn:generateWorkedExampleThresholdCheck | calls, declares | 2 |
| fn:generationFailed | calls, declares | 2 |
| fn:getAgentActiveProjectsRoot | calls, declares | 2 |
| fn:getAgentConfig | calls, declares | 2 |
| fn:getAuditSpecState | calls, declares | 2 |
| fn:getCalibrationFeedbackState | calls, declares | 2 |
| fn:getCatchBodyStatementCount | calls, declares | 2 |
| fn:getCatchCommentText | calls, declares | 2 |
| fn:getClient | calls, declares | 2 |
| fn:getContextManagementPath | calls, declares | 2 |
| fn:getCurrentAgent | calls, declares | 2 |
| fn:getCurrentFilePath | calls, declares | 2 |
| fn:getCurrentSessionModel | calls, declares | 2 |
| fn:getDbHandle | calls, declares | 2 |
| fn:getDefaultStrategy | calls, declares | 2 |
| fn:getEnclosingFunction | calls, declares | 2 |
| fn:getEnforcerState | calls, declares | 2 |
| fn:getEngine | calls, declares | 2 |
| fn:getEvidenceDb | calls, declares | 2 |
| fn:getFamily | calls, declares | 2 |
| fn:getField | calls, declares | 2 |
| fn:getFirewallAudit | calls, declares | 2 |
| fn:getFunctionBody | calls, declares | 2 |
| fn:getFunctionReturnType | calls, declares | 2 |
| fn:getGodLoopPhase | calls, declares | 2 |
| fn:getHandlerIdentifier | calls, declares | 2 |
| fn:getIdentityBaseDir | calls, declares | 2 |
| fn:getIdentityHeader | awaits, declares | 2 |
| fn:getImportedNames | calls, declares | 2 |
| fn:getInlineDefaultFiles | calls, declares | 2 |
| fn:getJsDocComment | calls, declares | 2 |
| fn:getKnowledgeBasePath | calls, declares | 2 |
| fn:getLastMessage | calls, declares | 2 |
| fn:getLine | calls, declares | 2 |
| fn:getLineNumber | calls, declares | 2 |
| fn:getLiveNodes | calls, declares | 2 |
| fn:getMachine | calls, declares | 2 |
| fn:getMime | calls, declares | 2 |
| fn:getModuleSpecifierFromNode | calls, declares | 2 |
| fn:getNodeLine | calls, declares | 2 |
| fn:getNodeText | calls, declares | 2 |
| fn:getOpencodeClient | calls, declares | 2 |
| fn:getOrCreateEvidenceStore | awaits, declares | 2 |
| fn:getPoseidonIntent | calls, declares | 2 |
| fn:getProjectDiagnosticsServer | calls, declares | 2 |
| fn:getProjectRoot | calls, declares | 2 |
| fn:getSafeAsyncSet | calls, declares | 2 |
| fn:getSessionCount | calls, declares | 2 |
| fn:getSetupTypesInfo | calls, declares | 2 |
| fn:getSharedDiagnosticsServer | calls, declares | 2 |
| fn:getStateDb | calls, declares | 2 |
| fn:getStepXBrain | calls, declares | 2 |
| fn:getTheatricalProp | calls, declares | 2 |
| fn:getTheatricalState | calls, declares | 2 |
| fn:getToolsCalled | calls, declares | 2 |
| fn:getTypeText | calls, declares | 2 |
| fn:getWarheadDir | calls, declares | 2 |
| fn:getWarheadsBlock | awaits, declares | 2 |
| fn:goKeyDead | calls, declares | 2 |
| fn:goKeyLabel | calls, declares | 2 |
| fn:goldenGraph | calls, declares | 2 |
| fn:goPoolFile | calls, declares | 2 |
| fn:goPoolSnapshot | calls, declares | 2 |
| fn:graphEmpty | calls, declares | 2 |
| fn:graphFromManifest | calls, declares | 2 |
| fn:graphQueryHandler | calls, declares | 2 |
| fn:grepCount | calls, declares | 2 |
| fn:groupByFile | calls, declares | 2 |
| fn:GT | calls, declares | 2 |
| fn:handleSessionCreated | calls, declares | 2 |
| fn:handleSessionEnded | calls, declares | 2 |
| fn:hasAdvanceLayerCall | calls, declares | 2 |
| fn:hasAgentReference | calls, declares | 2 |
| fn:hasAncestorType | calls, declares | 2 |
| fn:hasCleanupInFunctionScope | calls, declares | 2 |
| fn:hasConditionalValidation | calls, declares | 2 |
| fn:hasConfigAccessGuard | calls, declares | 2 |
| fn:hasContainerTestArtifact | calls, declares | 2 |
| fn:hasCorrectAgentPattern | calls, declares | 2 |
| fn:hasDecisionLogicShape | calls, declares | 2 |
| fn:hasDecoratorDispatch | calls, declares | 2 |
| fn:hasDeliberationMarkers | calls, declares | 2 |
| fn:hasDerailmentFindings | calls, declares | 2 |
| fn:hasDynamicAccess | calls, declares | 2 |
| fn:hasEmptyCatch | calls, declares | 2 |
| fn:hasEnvDefault | calls, declares | 2 |
| fn:hasFloatingPromise | calls, declares | 2 |
| fn:hasGraphToolCall | calls, declares | 2 |
| fn:hasHookHandlerHeavyWork | calls, declares | 2 |
| fn:hasInternalOrDeprecatedTag | calls, declares | 2 |
| fn:hasKnowledgeGraph | calls, declares | 2 |
| fn:hasLoggingCall | calls, declares | 2 |
| fn:hasLoggingCallInCatch | calls, declares | 2 |
| fn:hasPatternFamilyShape | calls, declares | 2 |
| fn:hasPoseidonPoller | calls, declares | 2 |
| fn:hasPrecedingRuntimeGuard | calls, declares | 2 |
| fn:hasProblemSolveArtifact | calls, declares | 2 |
| fn:hasRealComputation | calls, declares | 2 |
| fn:hasRealWorkBeforeReturn | calls, declares | 2 |
| fn:hasRecoveryCommentInCatch | calls, declares | 2 |
| fn:hasRecoveryContract | calls, declares | 2 |
| fn:hasRecoveryContractForCatch | calls, declares | 2 |
| fn:hasReturnStatementInCatch | calls, declares | 2 |
| fn:hasReturnWithValue | calls, declares | 2 |
| fn:hasSafeAsyncTag | calls, declares | 2 |
| fn:hasScatteredBooleanFlags | calls, declares | 2 |
| fn:hasSideEffectBeforeReturn | calls, declares | 2 |
| fn:hasStateMachine | calls, declares | 2 |
| fn:hasSubstring | calls, declares | 2 |
| fn:hasTagCall | calls, declares | 2 |
| fn:hasTheatricalProperty | calls, declares | 2 |
| fn:hasThrowStatement | calls, declares | 2 |
| fn:hasThrowStatementInCatch | calls, declares | 2 |
| fn:hasTsFilesRecursive | calls, declares | 2 |
| fn:hasValidationBeforeInCatch | calls, declares | 2 |
| fn:hasValidationBeforeReturn | calls, declares | 2 |
| fn:hasValidationBeforeReturnInFn | calls, declares | 2 |
| fn:hasValidContainerTestPlanFile | calls, declares | 2 |
| fn:hasVerifyReportArtifact | calls, declares | 2 |
| fn:hasWaveAuditArtifact | calls, declares | 2 |
| fn:hasWrongAgentPattern | calls, declares | 2 |
| fn:heuristicDecide | calls, declares | 2 |
| fn:historyLogUnreadable | calls, declares | 2 |
| fn:historyMissing | calls, declares | 2 |
| fn:honestEmptyReport | calls, declares | 2 |
| fn:hookAgent | calls, declares | 2 |
| fn:hookEvent | calls, declares | 2 |
| fn:hookParams | calls, declares | 2 |
| fn:hostHasPort | calls, declares | 2 |
| fn:huntLockPath | calls, declares | 2 |
| fn:hydraCandidateToFinding | calls, declares | 2 |
| fn:identifyEngines | calls, declares | 2 |
| fn:impl | calls, declares | 2 |
| fn:implementationInvalid | calls, declares | 2 |
| fn:incrementSessionCount | calls, declares | 2 |
| fn:incrementToolsCalled | calls, declares | 2 |
| fn:inferKind | calls, declares | 2 |
| fn:inferLabel | calls, declares | 2 |
| fn:inferObservedEventType | calls, declares | 2 |
| fn:inferReturnTypeFromAst | calls, declares | 2 |
| fn:ingestRecentEvents | calls, declares | 2 |
| fn:initProjectFolder | awaits, declares | 2 |
| fn:initSelfAudit | calls, declares | 2 |
| fn:inject | calls, declares | 2 |
| fn:inTarget | calls, declares | 2 |
| fn:intersect | calls, declares | 2 |
| fn:isActionableFinding | calls, declares | 2 |
| fn:isAllowedReadPath | calls, declares | 2 |
| fn:isAlphaChar | calls, declares | 2 |
| fn:isAnchorResolvable | calls, declares | 2 |
| fn:isAnyKeyword | calls, declares | 2 |
| fn:isAnyType | calls, declares | 2 |
| fn:isArrayMethodCallback | calls, declares | 2 |
| fn:isArrayUsedWithJoin | calls, declares | 2 |
| fn:isAsUnknownAsBridge | calls, declares | 2 |
| fn:isBareProcessEnv | calls, declares | 2 |
| fn:isBareRegexMatcher | calls, declares | 2 |
| fn:isBatchBActive | calls, declares | 2 |
| fn:isBlockquote | calls, declares | 2 |
| fn:isBoolean | calls, declares | 2 |
| fn:isBundledModule | calls, declares | 2 |
| fn:isBundleFile | calls, declares | 2 |
| fn:isBunPrefixed | calls, declares | 2 |
| fn:isBusKind | calls, declares | 2 |
| fn:isCallByName | calls, declares | 2 |
| fn:isCalledViaThis | calls, declares | 2 |
| fn:isCheckpointPath | calls, declares | 2 |
| fn:isClassification | calls, declares | 2 |
| fn:isCompilerOnly | calls, declares | 2 |
| fn:isCompletionClaim | calls, declares | 2 |
| fn:isContainerSkillLoaded | calls, declares | 2 |
| fn:isContainerTestingCommand | calls, declares | 2 |
| fn:isDeclared | calls, declares | 2 |
| fn:isDigitChar | calls, declares | 2 |
| fn:isEmptyFunctionBody | calls, declares | 2 |
| fn:isEmptyWave | calls, declares | 2 |
| fn:isEnforcementFunction | calls, declares | 2 |
| fn:isEnforcementName | calls, declares | 2 |
| fn:isEscapeHatch | calls, declares | 2 |
| fn:isEvidenceTriad | calls, declares | 2 |
| fn:isExcluded | calls, declares | 2 |
| fn:isExitStatement | calls, declares | 2 |
| fn:isExportedNode | calls, declares | 2 |
| fn:isFallbackName | calls, declares | 2 |
| fn:isFiniteEpsilon | calls, declares | 2 |
| fn:isFn | calls, declares | 2 |
| fn:isFrameworkInvoked | calls, declares | 2 |
| fn:isFrameworkInvokedByName | calls, declares | 2 |
| fn:isHookOrEventHandler | calls, declares | 2 |
| fn:isInExecutableAstContext | calls, declares | 2 |
| fn:isInitialized | calls, declares | 2 |
| fn:isInsideComment | calls, declares | 2 |
| fn:isInsideTryFinally | calls, declares | 2 |
| fn:isInsideTryStatement | calls, declares | 2 |
| fn:isInvokedIndirectly | calls, declares | 2 |
| fn:isIxLanguage | calls, declares | 2 |
| fn:isJsonParseCall | calls, declares | 2 |
| fn:isLeafNode | calls, declares | 2 |
| fn:isLiteralLike | calls, declares | 2 |
| fn:isLiteralReturn | calls, declares | 2 |
| fn:isLocalImport | calls, declares | 2 |
| fn:isLoggingCallExpression | calls, declares | 2 |
| fn:isLooseBindingIntent | calls, declares | 2 |
| fn:isMachineCall | calls, declares | 2 |
| fn:isModelBoundaryPhase | calls, declares | 2 |
| fn:isNewToolCall | calls, declares | 2 |
| fn:isNodeBuiltin | calls, declares | 2 |
| fn:isNodeLineage | calls, declares | 2 |
| fn:isNodePrefixed | calls, declares | 2 |
| fn:isNodeType | calls, declares | 2 |
| fn:isNonActionableWave | calls, declares | 2 |
| fn:isNumber | calls, declares | 2 |
| fn:isOpencodePlugin | calls, declares | 2 |
| fn:isPathInsideProject | calls, declares | 2 |
| fn:isPidAlive | calls, declares | 2 |
| fn:isPlaceholder | calls, declares | 2 |
| fn:isPredicate | calls, declares | 2 |
| fn:isProcessEnvAccess | calls, declares | 2 |
| fn:isPromiseType | calls, declares | 2 |
| fn:isQuotedPassage | calls, declares | 2 |
| fn:isRealWorkCallee | calls, declares | 2 |
| fn:isRecord | calls, declares | 2 |
| fn:isRecordStringUnknown | calls, declares | 2 |
| fn:isRegisteredEventType | calls, declares | 2 |
| fn:isRegistryArray | calls, declares | 2 |
| fn:isRemediation | calls, declares | 2 |
| fn:isReturnValueUsed | calls, declares | 2 |
| fn:isRuleShaped | calls, declares | 2 |
| fn:isSameFile | calls, declares | 2 |
| fn:isSaveIntent | calls, declares | 2 |
| fn:isSelfAuditFile | calls, declares | 2 |
| fn:isSelfDefectFile | calls, declares | 2 |
| fn:isSeverity | calls, declares | 2 |
| fn:isStale | calls, declares | 2 |
| fn:isSuccessClaimReturn | calls, declares | 2 |
| fn:isTemplateGenerator | calls, declares | 2 |
| fn:isTemplateShell | calls, declares | 2 |
| fn:isTerminalPhase | calls, declares | 2 |
| fn:isTestOnly | calls, declares | 2 |
| fn:isTheatricalSuggestion | calls, declares | 2 |
| fn:isToolAllowed | calls, declares | 2 |
| fn:isToolExecuteBeforeHandler | calls, declares | 2 |
| fn:isTridentAgent | calls, declares | 2 |
| fn:isTridentBuildAgent | calls, declares | 2 |
| fn:isUnixHomePath | calls, declares | 2 |
| fn:isUntypedConfigIdentifier | calls, declares | 2 |
| fn:isValidEngine | calls, declares | 2 |
| fn:isVoidOrNoReturnFunction | calls, declares | 2 |
| fn:isVoidOrUndefinedReturnType | calls, declares | 2 |
| fn:isVoidReturnType | calls, declares | 2 |
| fn:isWithinLedger | calls, declares | 2 |
| fn:isWithinRoot | calls, declares | 2 |
| fn:isXStateGuardReference | calls, declares | 2 |
| fn:ixProfile | calls, declares | 2 |
| fn:jsonParseHasAssertion | calls, declares | 2 |
| fn:jsonParseHasTypedVar | calls, declares | 2 |
| fn:keywordOverlap | calls, declares | 2 |
| fn:kindForLayer | calls, declares | 2 |
| fn:labelOf | calls, declares | 2 |
| fn:lasmePostGates | calls, declares | 2 |
| fn:lasmePreGates | calls, declares | 2 |
| fn:layerFromPatternId | calls, declares | 2 |
| fn:layersStub | calls, declares | 2 |
| fn:ledgerRootFor | calls, declares | 2 |
| fn:ledgerRootResolved | calls, declares | 2 |
| fn:legacySolveTrace | calls, declares | 2 |
| fn:lexiconSpecDeclared | calls, declares | 2 |
| fn:lineageMissing | calls, declares | 2 |
| fn:lineOf | calls, declares | 2 |
| fn:listServicesHandler | calls, declares | 2 |
| fn:listTemplateMappings | calls, declares | 2 |
| fn:listTopLevelDirs | awaits, declares | 2 |
| fn:loadAgentDirMap | calls, declares | 2 |
| fn:loadAuditLayerDescriptions | calls, declares | 2 |
| fn:loadBattery | calls, declares | 2 |
| fn:loadCalibrationFixtures | calls, declares | 2 |
| fn:loadDistManifest | awaits, declares | 2 |
| fn:loadFireFixture | calls, declares | 2 |
| fn:loadFixtureProfile | calls, declares | 2 |
| fn:loadFixtureProfileFixtures | calls, declares | 2 |
| fn:loadGateState | calls, declares | 2 |
| fn:loadGoldenFixture | calls, declares | 2 |
| fn:loadGrammar | calls, declares | 2 |
| fn:loadHivePatterns | awaits, declares | 2 |
| fn:loadIdentityFile | calls, declares | 2 |
| fn:loadKnowledgeLibrary | calls, declares | 2 |
| fn:loadKnowledgeSummary | calls, declares | 2 |
| fn:loadKnowledgeTechniqueWithCode | calls, declares | 2 |
| fn:loadLayer | calls, declares | 2 |
| fn:loadProfile | calls, declares | 2 |
| fn:loadState | calls, declares | 2 |
| fn:loadStateFromFindings | calls, declares | 2 |
| fn:loadTridentIgnore | calls, declares | 2 |
| fn:lockdownReadSource | calls, declares | 2 |
| fn:lockPathFor | calls, declares | 2 |
| fn:log | calls, declares | 2 |
| fn:logMessage | calls, declares | 2 |
| fn:logViolation | calls, declares | 2 |
| fn:lowerIndexOf | calls, declares | 2 |
| fn:machinery | calls, declares | 2 |
| fn:machineTypes | calls, declares | 2 |
| fn:makeAssignableHooks | calls, declares | 2 |
| fn:makeAuditSpecFixture | calls, declares | 2 |
| fn:makeCallGraph | calls, declares | 2 |
| fn:makeCandidates | calls, declares | 2 |
| fn:makeCappedGrepTool | calls, declares | 2 |
| fn:makeCappedReadTool | calls, declares | 2 |
| fn:makeCard | calls, declares | 2 |
| fn:makeClock | calls, declares | 2 |
| fn:makeCountingHooks | calls, declares | 2 |
| fn:makeDb | calls, declares | 2 |
| fn:makeDefaultContext | calls, declares | 2 |
| fn:makeDeps | calls, declares | 2 |
| fn:makeEnforcerPlane | calls, declares | 2 |
| fn:makeEngine | calls, declares | 2 |
| fn:makeFinding | calls, declares | 2 |
| fn:makeFixture | calls, declares | 2 |
| fn:makeForceBoundEditTool | calls, declares | 2 |
| fn:makeForceBoundWriteTool | calls, declares | 2 |
| fn:makeGateOutput | calls, declares | 2 |
| fn:makeGraphFixture | calls, declares | 2 |
| fn:makeGraphMapper | calls, declares | 2 |
| fn:makeGraphTagTool | calls, declares | 2 |
| fn:makeLasmeCandidate | calls, declares | 2 |
| fn:makeLasmeOutput | calls, declares | 2 |
| fn:makeLayer | calls, declares | 2 |
| fn:makeLayers | calls, declares | 2 |
| fn:makeMemory | calls, declares | 2 |
| fn:makeMirror1 | calls, declares | 2 |
| fn:makeMirror2Giant | calls, declares | 2 |
| fn:makeModule | calls, declares | 2 |
| fn:makeObs | calls, declares | 2 |
| fn:makeObserverPlane | calls, declares | 2 |
| fn:makePipeline | calls, declares | 2 |
| fn:makeProfile | calls, declares | 2 |
| fn:makeProject | calls, declares | 2 |
| fn:makeRunSummary | calls, declares | 2 |
| fn:makeSpec | calls, declares | 2 |
| fn:makeSpecBindings | calls, declares | 2 |
| fn:makeState | calls, declares | 2 |
| fn:makeTemplate | calls, declares | 2 |
| fn:makeTempStore | calls, declares | 2 |
| fn:makeTransport | calls, declares | 2 |
| fn:makeTree | calls, declares | 2 |
| fn:makeTriad | calls, declares | 2 |
| fn:makeVerdict | calls, declares | 2 |
| fn:makeVerdictsCorrected | calls, declares | 2 |
| fn:makeVerdictsDefective | calls, declares | 2 |
| fn:mandateDedupeKey | calls, declares | 2 |
| fn:manifestArtifacts | calls, declares | 2 |
| fn:mapEdgeKind | calls, declares | 2 |
| fn:mapFindingToCandidate | calls, declares | 2 |
| fn:mapNodeKind | calls, declares | 2 |
| fn:mapNodeType | calls, declares | 2 |
| fn:mapPredicate | calls, declares | 2 |
| fn:mapSeverity | calls, declares | 2 |
| fn:markCalibrated | calls, declares | 2 |
| fn:markContainerTestSubject | calls, declares | 2 |
| fn:markerOk | calls, declares | 2 |
| fn:markGoKeyAlive | calls, declares | 2 |
| fn:markGoKeyDead | calls, declares | 2 |
| fn:markInconclusive | calls, declares | 2 |
| fn:markStepSkipped | calls, declares | 2 |
| fn:markSymbolImported | calls, declares | 2 |
| fn:matchCheckTokens | calls, declares | 2 |
| fn:matchesIgnorePatterns | calls, declares | 2 |
| fn:materializeCode | calls, declares | 2 |
| fn:mergeEvidenceJsonl | calls, declares | 2 |
| fn:mergeGateState | calls, declares | 2 |
| fn:mergeObservations | calls, declares | 2 |
| fn:mergePasses | calls, declares | 2 |
| fn:migrateProjectRoot | calls, declares | 2 |
| fn:minimalProfile | calls, declares | 2 |
| fn:mirrorToMasterContext | calls, declares | 2 |
| fn:mirrorWriteFailed | calls, declares | 2 |
| fn:mkBrain | calls, declares | 2 |
| fn:mkCandidate | calls, declares | 2 |
| fn:mkConstruct | calls, declares | 2 |
| fn:mkCtx | calls, declares | 2 |
| fn:mkFinding | calls, declares | 2 |
| fn:mkPreflight | calls, declares | 2 |
| fn:mkRoot | calls, declares | 2 |
| fn:mkTmp | calls, declares | 2 |
| fn:mockGraph | calls, declares | 2 |
| fn:modelPlane | calls, declares | 2 |
| fn:mustImplement | calls, declares | 2 |
| fn:namedError | calls, declares | 2 |
| fn:needsRecalibration | calls, declares | 2 |
| fn:needsReturn | calls, declares | 2 |
| fn:newDb | calls, declares | 2 |
| fn:nextReportVersion | awaits, declares | 2 |
| fn:node | calls, declares | 2 |
| fn:nodeReferencesComplete | calls, declares | 2 |
| fn:nodeText | calls, declares | 2 |
| fn:nonEmpty | calls, declares | 2 |
| fn:normalizeArgs | calls, declares | 2 |
| fn:normalizeCanonical | calls, declares | 2 |
| fn:normalizeContractFile | calls, declares | 2 |
| fn:normalizeEvent | calls, declares | 2 |
| fn:normalizeFilePath | calls, declares | 2 |
| fn:normalizeFixTarget | calls, declares | 2 |
| fn:normalizeGodLoopPhase | calls, declares | 2 |
| fn:normalizeGraph | calls, declares | 2 |
| fn:normalizeImportPath | calls, declares | 2 |
| fn:normalizeLabel | calls, declares | 2 |
| fn:normalizePattern | calls, declares | 2 |
| fn:normalizeProjectName | calls, declares | 2 |
| fn:normalizeRowKind | calls, declares | 2 |
| fn:normalizeSessionId | calls, declares | 2 |
| fn:normalizeSpecClauses | calls, declares | 2 |
| fn:normalizeToolName | calls, declares | 2 |
| fn:normalizeType | calls, declares | 2 |
| fn:normalizeW5Observation | calls, declares | 2 |
| fn:notificationPath | calls, declares | 2 |
| fn:notifyGateCompletion | calls, declares | 2 |
| fn:notifyIdentityLoaded | calls, declares | 2 |
| fn:observationMatcherId | calls, declares | 2 |
| fn:okJson | calls, declares | 2 |
| fn:oneLine | calls, declares | 2 |
| fn:openAndNextRunId | calls, declares | 2 |
| fn:openFamilyReadOnly | calls, declares | 2 |
| fn:openFamilyStore | calls, declares | 2 |
| fn:openProjectSharedDb | calls, declares | 2 |
| fn:openSharedDb | calls, declares | 2 |
| fn:openStore | calls, declares | 2 |
| fn:orderPipeline | calls, declares | 2 |
| fn:outputContractBlock | calls, declares | 2 |
| fn:overAuditDemand | calls, declares | 2 |
| fn:overAuditStats | calls, declares | 2 |
| fn:pad | calls, declares | 2 |
| fn:parseBuildOutput | calls, declares | 2 |
| fn:parseCanonicalBlocks | calls, declares | 2 |
| fn:parseCommand | calls, declares | 2 |
| fn:parseDeclaredEdges | calls, declares | 2 |
| fn:parseDistManifest | calls, declares | 2 |
| fn:parsedNodes | calls, declares | 2 |
| fn:parseEmbeddingSummary | calls, declares | 2 |
| fn:parseFieldLines | calls, declares | 2 |
| fn:parseFlowArray | calls, declares | 2 |
| fn:parseFlowMap | calls, declares | 2 |
| fn:parseFlowValue | calls, declares | 2 |
| fn:parseGoWindowMs | calls, declares | 2 |
| fn:parseLearnSummary | calls, declares | 2 |
| fn:parseLegacyR23Blocks | calls, declares | 2 |
| fn:parseLlmCallSites | calls, declares | 2 |
| fn:parseLlmDepends | calls, declares | 2 |
| fn:parseLlmInventory | calls, declares | 2 |
| fn:parseLlmTrace | calls, declares | 2 |
| fn:parseMapJson | calls, declares | 2 |
| fn:parseMarkdownFindings | calls, declares | 2 |
| fn:parseMetaPatterns | calls, declares | 2 |
| fn:parseProbeResult | calls, declares | 2 |
| fn:parseQuoted | calls, declares | 2 |
| fn:parseRequirementSections | calls, declares | 2 |
| fn:parseScalar | calls, declares | 2 |
| fn:parseSemanticPayload | calls, declares | 2 |
| fn:parseSpecBindings | calls, declares | 2 |
| fn:parseSubsetQuery | calls, declares | 2 |
| fn:parseTableRow | calls, declares | 2 |
| fn:parseVersion | calls, declares | 2 |
| fn:parseYamlSubset | calls, declares | 2 |
| fn:PASS | calls, declares | 2 |
| fn:passMax | calls, declares | 2 |
| fn:passMin | calls, declares | 2 |
| fn:passThroughFirewall | calls, declares | 2 |
| fn:pathHas | calls, declares | 2 |
| fn:pathResolve | calls, declares | 2 |
| fn:patternsMatch | calls, declares | 2 |
| fn:persistMarkerFile | calls, declares | 2 |
| fn:persistState | calls, declares | 2 |
| fn:populateTypedGraph | awaits, declares | 2 |
| fn:pragmaFailed | calls, declares | 2 |
| fn:predicateFamilyFrom | calls, declares | 2 |
| fn:preliminaryArtifactPath | calls, declares | 2 |
| fn:preprocess | calls, declares | 2 |
| fn:prioritizeFixes | calls, declares | 2 |
| fn:probeExists | calls, declares | 2 |
| fn:profileInvalid | calls, declares | 2 |
| fn:profileWithFakeBinary | calls, declares | 2 |
| fn:projectGraph | calls, declares | 2 |
| fn:projectToken | calls, declares | 2 |
| fn:projectTokenSlug | calls, declares | 2 |
| fn:proseSeverity | calls, declares | 2 |
| fn:queryDb | calls, declares | 2 |
| fn:queryEmbeddingIndex | calls, declares | 2 |
| fn:queryFindings | calls, declares | 2 |
| fn:queryStorePath | calls, declares | 2 |
| fn:r5TheatricalLexiconHasMatch | calls, declares | 2 |
| fn:rank | calls, declares | 2 |
| fn:rankFindings | calls, declares | 2 |
| fn:rate | calls, declares | 2 |
| fn:rawFor | calls, declares | 2 |
| fn:read | calls, declares | 2 |
| fn:readCurrentAgent | awaits, declares | 2 |
| fn:readDeadUntil | calls, declares | 2 |
| fn:readDeclaredMeta | calls, declares | 2 |
| fn:readDocsPatterns | calls, declares | 2 |
| fn:readFile | awaits, calls | 2 |
| fn:readIfExists | calls, declares | 2 |
| fn:readLinesOrThrow | calls, declares | 2 |
| fn:readManifest | calls, declares | 2 |
| fn:readNotifications | calls, declares | 2 |
| fn:readPath | calls, declares | 2 |
| fn:readPayload | calls, declares | 2 |
| fn:readPhase | calls, declares | 2 |
| fn:readRunStatus | calls, declares | 2 |
| fn:readServiceDeps | calls, declares | 2 |
| fn:readServiceMethods | calls, declares | 2 |
| fn:readServices | calls, declares | 2 |
| fn:readSessionTitle | awaits, declares | 2 |
| fn:readSourceContext | calls, declares | 2 |
| fn:readSourceFiles | calls, declares | 2 |
| fn:readWindowWithinScope | awaits, declares | 2 |
| fn:readWriteViolations | calls, declares | 2 |
| fn:realResolve | calls, declares | 2 |
| fn:reasoningPlane | calls, declares | 2 |
| fn:recencyDaysFor | calls, declares | 2 |
| fn:recon | calls, declares | 2 |
| fn:recordingExec | calls, declares | 2 |
| fn:recordTransition | calls, declares | 2 |
| fn:redactSecrets | awaits, declares | 2 |
| fn:referencesHookEvent | calls, declares | 2 |
| fn:referencesMonorepoTool | calls, declares | 2 |
| fn:registerEventSubstrate | calls, declares | 2 |
| fn:registerExport | calls, declares | 2 |
| fn:registerPlanes | calls, declares | 2 |
| fn:registerProjectFolderWarheadHooks | calls, declares | 2 |
| fn:registerWarheadHooks | awaits, declares | 2 |
| fn:rehydrate | calls, declares | 2 |
| fn:rejectionOf | awaits, declares | 2 |
| fn:releaseHuntLock | calls, declares | 2 |
| fn:renderArtifact | calls, declares | 2 |
| fn:renderAscii | calls, declares | 2 |
| fn:renderAsciiLevel | calls, declares | 2 |
| fn:renderC4Dsl | calls, declares | 2 |
| fn:renderC4IdMap | calls, declares | 2 |
| fn:renderDot | calls, declares | 2 |
| fn:renderFinding | calls, declares | 2 |
| fn:renderGraphSummary | calls, declares | 2 |
| fn:renderMermaid | calls, declares | 2 |
| fn:renderSectionRow | calls, declares | 2 |
| fn:report | calls, declares | 2 |
| fn:reportFiles | awaits, declares | 2 |
| fn:reportMd | calls, declares | 2 |
| fn:requiredToolsForPhase | calls, declares | 2 |
| fn:requireLoaded | calls, declares | 2 |
| fn:requireNodePath | calls, declares | 2 |
| fn:requireProjectDb | calls, declares | 2 |
| fn:resetCalibrationFeedback | calls, declares | 2 |
| fn:resetDerailmentTracker | calls, declares | 2 |
| fn:resetEventFirewalls | calls, declares | 2 |
| fn:resetRepetitionTracker | calls, declares | 2 |
| fn:resetState | calls, declares | 2 |
| fn:resetToolsCalled | calls, declares | 2 |
| fn:resetToTemplate | calls, declares | 2 |
| fn:resolveAuditEngineRoot | calls, declares | 2 |
| fn:resolveCorbell | calls, declares | 2 |
| fn:resolveCorbellBin | calls, declares | 2 |
| fn:resolveCorpusPaths | calls, declares | 2 |
| fn:resolveDiagnosticsServer | calls, declares | 2 |
| fn:resolveDiagnosticsServerForFile | calls, declares | 2 |
| fn:resolveEntities | awaits, declares | 2 |
| fn:resolveFilePaths | calls, declares | 2 |
| fn:resolveForWrite | calls, declares | 2 |
| fn:resolveGraphNode | calls, declares | 2 |
| fn:resolveIpcSocketPath | calls, declares | 2 |
| fn:resolveLaunchModelFlag | calls, declares | 2 |
| fn:resolveLedgerRoot | calls, declares | 2 |
| fn:resolveMasterContextDir | awaits, declares | 2 |
| fn:resolveMcpServeCommand | calls, declares | 2 |
| fn:resolveModulePath | calls, declares | 2 |
| fn:resolveNodeFile | calls, declares | 2 |
| fn:resolveOwnerSessionId | calls, declares | 2 |
| fn:resolveProjectName | awaits, declares | 2 |
| fn:resolveRelative | calls, declares | 2 |
| fn:resolveScopeRoot | calls, declares | 2 |
| fn:resolveSessionDbPath | calls, declares | 2 |
| fn:resolveSpecsRoots | calls, declares | 2 |
| fn:resolveStateSessionID | calls, declares | 2 |
| fn:resolveTargetPath | calls, declares | 2 |
| fn:resolveTargetRoot | calls, declares | 2 |
| fn:resolveType | calls, declares | 2 |
| fn:resolveUiLaunchCommand | calls, declares | 2 |
| fn:resolveVenvPython | calls, declares | 2 |
| fn:resolveWarheadIdentityDir | calls, declares | 2 |
| fn:resolveWorkspaceRoot | calls, declares | 2 |
| fn:resolveWriterApiKey | calls, declares | 2 |
| fn:resumeSessionExists | calls, declares | 2 |
| fn:retentionBound | calls, declares | 2 |
| fn:revalidateOnWrite | calls, declares | 2 |
| fn:rmTmp | calls, declares | 2 |
| fn:routeAfterVerify | calls, declares | 2 |
| fn:routeEnforcer | calls, declares | 2 |
| fn:routeGit | calls, declares | 2 |
| fn:routeSed | calls, declares | 2 |
| fn:rowAs | calls, declares | 2 |
| fn:rowsAs | calls, declares | 2 |
| fn:rule | calls, declares | 2 |
| fn:runAuditPipeline | awaits, declares | 2 |
| fn:runBattery | calls, declares | 2 |
| fn:runConformance | calls, declares | 2 |
| fn:runCrossSectionAudit | calls, declares | 2 |
| fn:runDeepeningChecks | calls, declares | 2 |
| fn:runGraphLogicPhase | awaits, declares | 2 |
| fn:runInternalLLMLoop | awaits, declares | 2 |
| fn:runLayerOnFixture | awaits, declares | 2 |
| fn:runMcpTool | calls, declares | 2 |
| fn:runPackageAudit | awaits, declares | 2 |
| fn:runPreflight | awaits, declares | 2 |
| fn:runQuery | calls, declares | 2 |
| fn:runQueryTool | calls, declares | 2 |
| fn:runRuntimeCorpus | awaits, declares | 2 |
| fn:runSelfAudit | calls, declares | 2 |
| fn:runStatusPath | calls, declares | 2 |
| fn:safeCheck | calls, declares | 2 |
| fn:safeIdent | calls, declares | 2 |
| fn:safeJsonParse | calls, declares | 2 |
| fn:safeNotifyGateCompletion | calls, declares | 2 |
| fn:safeTemporalLiveNodes | calls, declares | 2 |
| fn:safeText | calls, declares | 2 |
| fn:safeWriteRunStatus | calls, declares | 2 |
| fn:sampleInput | calls, declares | 2 |
| fn:sanitizeC4Id | calls, declares | 2 |
| fn:sanitizeRuleName | calls, declares | 2 |
| fn:saveGateState | calls, declares | 2 |
| fn:scaffoldFileList | calls, declares | 2 |
| fn:scanMetacharacters | calls, declares | 2 |
| fn:scanQuoteState | calls, declares | 2 |
| fn:scanTheatricalInContent | calls, declares | 2 |
| fn:scanTheatricalInFiles | calls, declares | 2 |
| fn:scanTopLevelImports | awaits, declares | 2 |
| fn:scanTsFilesForQuality | calls, declares | 2 |
| fn:scopeDiscoveryToEngine | calls, declares | 2 |
| fn:sectionFromFinding | calls, declares | 2 |
| fn:seedAetherProviderEnv | calls, declares | 2 |
| fn:seedDb | calls, declares | 2 |
| fn:seedFixture | calls, declares | 2 |
| fn:seedHunt | calls, declares | 2 |
| fn:seedRun | calls, declares | 2 |
| fn:seedVerify | calls, declares | 2 |
| fn:selectAdapter | calls, declares | 2 |
| fn:selectAnglesForContext | calls, declares | 2 |
| fn:selectDefenses | calls, declares | 2 |
| fn:selectTemplate | calls, declares | 2 |
| fn:selfEnforceScan | calls, declares | 2 |
| fn:semanticVerb | calls, declares | 2 |
| fn:sentenceVerdict | calls, declares | 2 |
| fn:sentinelFor | calls, declares | 2 |
| fn:sessionIdOf | calls, declares | 2 |
| fn:sessionPlane | calls, declares | 2 |
| fn:setBlockDelivery | calls, declares | 2 |
| fn:setClientGetter | calls, declares | 2 |
| fn:setContainerSkillLoaded | calls, declares | 2 |
| fn:setCurrentAgent | calls, declares | 2 |
| fn:setCurrentSessionModel | calls, declares | 2 |
| fn:setDeliverySink | calls, declares | 2 |
| fn:setIdentityLoaded | calls, declares | 2 |
| fn:setLastMessage | calls, declares | 2 |
| fn:setPendingL1Path | calls, declares | 2 |
| fn:setPoseidonClientRef | calls, declares | 2 |
| fn:setPoseidonIntent | calls, declares | 2 |
| fn:setProjectRoot | calls, declares | 2 |
| fn:setToolsCalled | calls, declares | 2 |
| fn:setTriageClassifier | calls, declares | 2 |
| fn:severityFrom | calls, declares | 2 |
| fn:severityFromBinding | calls, declares | 2 |
| fn:severityFromRow | calls, declares | 2 |
| fn:severityIndex | calls, declares | 2 |
| fn:severityPrefix | calls, declares | 2 |
| fn:severityScore | calls, declares | 2 |
| fn:severityWeight | calls, declares | 2 |
| fn:sha256 | calls, declares | 2 |
| fn:sha256File | calls, declares | 2 |
| fn:sha256Hex | calls, declares | 2 |
| fn:shaFile | calls, declares | 2 |
| fn:sharedDbPath | calls, declares | 2 |
| fn:shareSignificantToken | calls, declares | 2 |
| fn:shortFile | calls, declares | 2 |
| fn:sig | calls, declares | 2 |
| fn:skippedReport | calls, declares | 2 |
| fn:sleep | awaits, declares | 2 |
| fn:snap | calls, declares | 2 |
| fn:snapshotState | calls, declares | 2 |
| fn:sortBySeverity | calls, declares | 2 |
| fn:sourceReadFailed | calls, declares | 2 |
| fn:spawnBugHunterLoop | awaits, declares | 2 |
| fn:spec | calls, declares | 2 |
| fn:specClauseToNodeId | calls, declares | 2 |
| fn:specDeclaresActor | calls, declares | 2 |
| fn:specDeclaresAdapter | calls, declares | 2 |
| fn:specDeclaresEngine | calls, declares | 2 |
| fn:specDeclaresMachine | calls, declares | 2 |
| fn:specIn | calls, declares | 2 |
| fn:specsRootsFor | calls, declares | 2 |
| fn:splitFindingsIntoBatches | calls, declares | 2 |
| fn:splitIntoWords | calls, declares | 2 |
| fn:splitTextWords | calls, declares | 2 |
| fn:splitTopLevel | calls, declares | 2 |
| fn:sqliteStore | calls, declares | 2 |
| fn:sqlList | calls, declares | 2 |
| fn:stageEntry | calls, declares | 2 |
| fn:startAudit | awaits, calls | 2 |
| fn:startPoseidonPoller | calls, declares | 2 |
| fn:startRetryLoop | calls, declares | 2 |
| fn:startSessionWatcher | calls, declares | 2 |
| fn:state | calls, declares | 2 |
| fn:stateInconclusive | calls, declares | 2 |
| fn:stateRow | calls, declares | 2 |
| fn:stitchConcurrentSections | calls, declares | 2 |
| fn:stopSessionWatcher | calls, declares | 2 |
| fn:storeArtifacts | calls, declares | 2 |
| fn:streamCompletion | awaits, declares | 2 |
| fn:strike | calls, declares | 2 |
| fn:stringLength | calls, declares | 2 |
| fn:stripBeforeSeal | calls, declares | 2 |
| fn:stripComment | calls, declares | 2 |
| fn:stripCommentDelimiters | calls, declares | 2 |
| fn:stripCommentWithState | calls, declares | 2 |
| fn:stripLineSuffix | calls, declares | 2 |
| fn:stripOuterQuotes | calls, declares | 2 |
| fn:stripToolReferences | calls, declares | 2 |
| fn:stubEncode | calls, declares | 2 |
| fn:stubExec | calls, declares | 2 |
| fn:stubGraph | calls, declares | 2 |
| fn:subjectObjectKey | calls, declares | 2 |
| fn:substrateBlockDelivery | calls, declares | 2 |
| fn:substringPresent | calls, declares | 2 |
| fn:supersedeNode | calls, declares | 2 |
| fn:symbolGraph | calls, declares | 2 |
| fn:synthConsumer | calls, declares | 2 |
| fn:synthDownstream | calls, declares | 2 |
| fn:synthSite | calls, declares | 2 |
| fn:systemPromptFor | calls, declares | 2 |
| fn:teaNotTebDemand | calls, declares | 2 |
| fn:templateBindingInvalid | calls, declares | 2 |
| fn:templateMissing | calls, declares | 2 |
| fn:testContextSynthesis | calls, declares | 2 |
| fn:testDeepPlanning | calls, declares | 2 |
| fn:testFuzz | calls, declares | 2 |
| fn:testIdentity | calls, declares | 2 |
| fn:testInvariants | calls, declares | 2 |
| fn:testNLP | calls, declares | 2 |
| fn:testOrchestrator | calls, declares | 2 |
| fn:testProblemSolving | calls, declares | 2 |
| fn:testTools | calls, declares | 2 |
| fn:testWithTimeout | calls, declares | 2 |
| fn:testZeroTolerance | calls, declares | 2 |
| fn:textContains | calls, declares | 2 |
| fn:textHasTypo | calls, declares | 2 |
| fn:threatDoNot | calls, declares | 2 |
| fn:threatFixRecipe | calls, declares | 2 |
| fn:tmp | calls, declares | 2 |
| fn:tmpDbPath | calls, declares | 2 |
| fn:tmpDir | calls, declares | 2 |
| fn:tmpFile | calls, declares | 2 |
| fn:tmpLedger | calls, declares | 2 |
| fn:tmpRoot | calls, declares | 2 |
| fn:toArraySet | calls, declares | 2 |
| fn:toBrandedVerdict | calls, declares | 2 |
| fn:toCanonicalFile | calls, declares | 2 |
| fn:toClassCanonical | calls, declares | 2 |
| fn:toFindingInput | calls, declares | 2 |
| fn:toFnCanonical | calls, declares | 2 |
| fn:toInterfaceCanonical | calls, declares | 2 |
| fn:tokenize | calls, declares | 2 |
| fn:tokenPos | calls, declares | 2 |
| fn:toMachineVerdictRows | calls, declares | 2 |
| fn:toManifestJson | calls, declares | 2 |
| fn:toMethodCanonical | calls, declares | 2 |
| fn:toModuleCanonical | calls, declares | 2 |
| fn:tool | calls, declares | 2 |
| fn:toolAfterHook | awaits, declares | 2 |
| fn:toolBeforeHook | awaits, declares | 2 |
| fn:topoSort | calls, declares | 2 |
| fn:totalThreatInstances | calls, declares | 2 |
| fn:trackTheatricalArtifacts | calls, declares | 2 |
| fn:transformEdge | calls, declares | 2 |
| fn:transformNode | calls, declares | 2 |
| fn:transitionOnValidate | calls, declares | 2 |
| fn:tripleKey | calls, declares | 2 |
| fn:truncate | calls, declares | 2 |
| fn:tryGetEngine | calls, declares | 2 |
| fn:tryParseCardinality | calls, declares | 2 |
| fn:tryParseLine | calls, declares | 2 |
| fn:tryParseNameColon | calls, declares | 2 |
| fn:tryParseNameEquals | calls, declares | 2 |
| fn:tryParseStderrResult | calls, declares | 2 |
| fn:tryParseThreshold | calls, declares | 2 |
| fn:tryProvider | awaits, declares | 2 |
| fn:typeOf | calls, declares | 2 |
| fn:unescapeDouble | calls, declares | 2 |
| fn:unique | calls, declares | 2 |
| fn:unverifiedFindingIndexes | calls, declares | 2 |
| fn:unwired | calls, declares | 2 |
| fn:V | calls, declares | 2 |
| fn:validArtifact | calls, declares | 2 |
| fn:validate | calls, declares | 2 |
| fn:validateAuditSpecContent | calls, declares | 2 |
| fn:validateAuditSpecFile | calls, declares | 2 |
| fn:validateAuditTarget | calls, declares | 2 |
| fn:validateBatchCoverage | calls, declares | 2 |
| fn:validateBuild | awaits, declares | 2 |
| fn:validateContextSynthesisInput | calls, declares | 2 |
| fn:validateDecisionContent | calls, declares | 2 |
| fn:validateDeepPlanningInput | calls, declares | 2 |
| fn:validateDist | calls, declares | 2 |
| fn:validateEmbeddedTestPlan | calls, declares | 2 |
| fn:validateFindingLocation | calls, declares | 2 |
| fn:validateHandlerSignature | calls, declares | 2 |
| fn:validatePlanContent | calls, declares | 2 |
| fn:validateProblemSolveContent | calls, declares | 2 |
| fn:validateProblemSolvingInput | calls, declares | 2 |
| fn:validateRange | calls, declares | 2 |
| fn:validateSpec | calls, declares | 2 |
| fn:validateSPG | calls, declares | 2 |
| fn:validateTaskPromptLines | calls, declares | 2 |
| fn:validateTestPlan | calls, declares | 2 |
| fn:validateTsconfig | calls, declares | 2 |
| fn:validateUser | calls, declares | 2 |
| fn:validateVerdicts | calls, declares | 2 |
| fn:validProfileJson | calls, declares | 2 |
| fn:validProfileYaml | calls, declares | 2 |
| fn:validReport | calls, declares | 2 |
| fn:validReportFor | calls, declares | 2 |
| fn:validScenario | calls, declares | 2 |
| fn:validSpec | calls, declares | 2 |
| fn:verbHasMatchingCall | calls, declares | 2 |
| fn:verbOf | calls, declares | 2 |
| fn:verdictFromRow | calls, declares | 2 |
| fn:verdictInvalid | calls, declares | 2 |
| fn:verdictRows | calls, declares | 2 |
| fn:verificationCountBoundFailed | calls, declares | 2 |
| fn:verifyAetherOutput | calls, declares | 2 |
| fn:verifyAnchorResolves | calls, declares | 2 |
| fn:verifyClaim | calls, declares | 2 |
| fn:verifyDistSha | calls, declares | 2 |
| fn:verifyImportGraph | calls, declares | 2 |
| fn:verifyScriptsExist | calls, declares | 2 |
| fn:violationFrequencies | calls, declares | 2 |
| fn:violations | calls, declares | 2 |
| fn:visitNode | calls, declares | 2 |
| fn:voiceAmbiguous | calls, declares | 2 |
| fn:voidPersist | calls, declares | 2 |
| fn:walkAst | calls, declares | 2 |
| fn:walkAstUp | calls, declares | 2 |
| fn:walkDir | awaits, calls | 2 |
| fn:walkFunctionScope | calls, declares | 2 |
| fn:walkSourceFile | calls, declares | 2 |
| fn:walkTsFiles | calls, declares | 2 |
| fn:warnBetween | calls, declares | 2 |
| fn:warnEq | calls, declares | 2 |
| fn:waveAuditGateVerdict | calls, declares | 2 |
| fn:waveEmptyNoAgentsDispatched | calls, declares | 2 |
| fn:wellFormedProbe | calls, declares | 2 |
| fn:whoCalls | calls, declares | 2 |
| fn:windowKey | calls, declares | 2 |
| fn:wipePhase | calls, declares | 2 |
| fn:wirePbaBridge | calls, declares | 2 |
| fn:wordOverlapSimilarity | calls, declares | 2 |
| fn:wouldBreak | calls, declares | 2 |
| fn:write | calls, declares | 2 |
| fn:writeArtifactFile | awaits, declares | 2 |
| fn:writeBattery | calls, declares | 2 |
| fn:writeC4Diagrams | awaits, declares | 2 |
| fn:writeCandidateContext | calls, declares | 2 |
| fn:writeCorbellStore | calls, declares | 2 |
| fn:writeCorpus | calls, declares | 2 |
| fn:writeDeadUntil | calls, declares | 2 |
| fn:writeEmbeddingStore | calls, declares | 2 |
| fn:writeEvidenceRecord | calls, declares | 2 |
| fn:writeFileEnsured | calls, declares | 2 |
| fn:writeFindingsMap | calls, declares | 2 |
| fn:writeGraph | calls, declares | 2 |
| fn:writeGraphStore | calls, declares | 2 |
| fn:writeManifest | calls, declares | 2 |
| fn:writeMarker | calls, declares | 2 |
| fn:writePhase | calls, declares | 2 |
| fn:writeProfile | calls, declares | 2 |
| fn:writeReadTurnsEvidence | calls, declares | 2 |
| fn:writeReconMap | calls, declares | 2 |
| fn:writeRuleCards | calls, declares | 2 |
| fn:writeRunnerTag | calls, declares | 2 |
| fn:writeRunStatus | calls, declares | 2 |
| fn:writeSpec | calls, declares | 2 |
| fn:writeState | calls, declares | 2 |
| fn:writeTargetFile | calls, declares | 2 |
| fn:yamlErr | calls, declares | 2 |
| fn:yieldToEventLoop | awaits, declares | 2 |
