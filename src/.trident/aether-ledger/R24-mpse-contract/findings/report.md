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
