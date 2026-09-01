# CODE AUDIT AETHER REPORT — R24-mpse-contract — audit-1788021020243

## 0 RUN METADATA
- runId: audit-1788021020243
- targetRoot: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src
- layerId: R24-mpse-contract
- anchorPredicate: contract
- candidatesIn: 4
- trueDefect: 4
- redHerring: 0
- unclear: 0
- provider: opencode-go/muse-spark-1.2-contributor
- budgetRounds: 6
- roundsUsed: 2
- probeMs: 42

## 1 THE VERDICT TABLE
| # | file:line | layer | adjudication | confidence | spec |
|---|-----------|-------|--------------|------------|------|
| 0 | src/audit-engine/math/firewall.ts:43 | R24-mpse-contract | TRUE_DEFECT | 0.92 | PARAGON_L2_BUILD_SPEC.md:662 REJECT |
| 1 | src/audit-engine/math/oracle.ts:27 | R24-mpse-contract | TRUE_DEFECT | 0.86 | PARAGON_L2_BUILD_SPEC.md:688 f(T)=24 |
| 2 | src/audit-engine/math/contract.ts:110 | R24-mpse-contract | TRUE_DEFECT | 0.78 | PARAGON_L2_BUILD_SPEC.md:669 ESCALATE |
| 3 | src/hydra/pipeline.ts:145 | R24-mpse-contract | TRUE_DEFECT | 0.88 | V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:292 |

## 2 TRUE DEFECTS
### F0 — firewall.ts:43 — contract.missing-guard — HIGH 0.92
- codeQuote: `const result = Function(`"use strict"; return (${expr});`)() as number;`
- specQuote: `readonly preconditions: readonly MathExpr[];   // role: REJECT  — fail ⇒ refuse the input`
- divergence: Function eval with regex allowlist only; no checkContract REJECT gate before eval. Invalid bindings bypass refusal. File imports only InvariantDeath, never checkContract.
- derailmentMode: D5

### F1 — oracle.ts:27 — contract.unimplemented — MEDIUM 0.86
- codeQuote: `if (store.has(decl.exprId)) throw new Error(`ORACLE_CONFLICT: duplicate exprId ${decl.exprId}`);`
- specQuote: `f(T) = N × (1 + P) = 8 × 3 = 24 with abort If |all_setups| ≠ 24 → ABORT`
- divergence: Registry implements storage and conflict check but demo oracle never registered outside tests (UNIMPLEMENTED_ORACLE_TODO at line 16) — TRACE_GAP; runtime discharge for canonical case absent.
- derailmentMode: D1

### F2 — contract.ts:110 — contract.violated — MEDIUM 0.78
- codeQuote: `if (role === 'ESCALATE' && !checked.ok && (checked as { code: string }).code === 'TEMPORAL_NOT_EVALUABLE') { throw new SupervisionEscalation(contract.id, expr); }`
- specQuote: `readonly temporal?: readonly MathExpr[];       // role: ESCALATE— route to sentinel, never point-eval`
- divergence: Correctly escalates only TEMPORAL_NOT_EVALUABLE; other temporal failures (UNBOUND_SYMBOL, DEPTH_EXCEEDED, DOMAIN_UNBOUNDED, TYPE_MISMATCH, DIV_BY_ZERO) and successful point-eval fall through to UNVERIFIED/VALID without SupervisionEscalation. Partial violation — primary path conformant, edge cases violate never-point-eval.
- derailmentMode: D8

### F3 — pipeline.ts:145 — contract.missing-guard — HIGH 0.88
- codeQuote: `throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');`
- specQuote: `trace contract.checkContract() call chains + find function implementations matching spec declarations`
- divergence: Pipeline dispatch dead by unconditional throw; contracted checkContract call chain never traced or enforced. Live path in aether-meta is untraced via pipeline.
- derailmentMode: D5

## 3 THE KILL LOG
- firewall.ts:43 Function eval path killed REJECT gate — must insert checkContract pre-condition before evaluateExpression; fallback to loud REJECT error (PreconditionRejected).
- contract.ts:110 ESCALATE partial — widen to `if (role==='ESCALATE' && !checked.ok) throw SupervisionEscalation` for any !checked.ok and also for checked.ok (temporal never point-evals).
- oracle.ts:27 demo oracle unimplemented — register canonical f(T)=24 oracle in production bootstrap with provenance anchor KB-01:311.
- pipeline.ts:145 dead dispatch — rewire checkContract chain via aether-meta runMetaLayer or document migration in spec.

## 4 THE ESCALATION QUEUE
(none — all 4 adjudicated TRUE_DEFECT; no UNCLEAR requiring escalation)

## 5 THE SYNTHESIS
R24 contract hunt finds the math substrate present (expr 30-kind union, eval 7-branch EvalErr depthLimit=256/domainSizeLimit=10_000, contract 4-role ladder, oracle epsilon-required pass isolated tests 1054/0) but spec-mandated guards are systematically absent at runtime: firewall bypasses REJECT, canonical oracle is test-only, temporal ESCALATE is partial, and pipeline's contract chain is dead. This is the theatrical-vs-mechanical gap the tool was built to catch: the letter of MathContract exists, the spirit (enforced on every mutation path) does not. The 4 TRUE_DEFECT verdicts are high-signal, graph-verified (EXTRACTED checks for primary paths, INFERRED gaps for missing edges), and require code fixes before MPSE post-gates (every declared contract must have conformance verdict + TRACE_GAP named) can pass. Cross-checked LASME filterTags threshold/contract/spec-clause — zero LASME conformant candidates, reinforcing TRACE_GAP conclusion. Vacuous invariants `matrixSize>=0`/`hasSynthesis==true` flagged as drift but out of R24 scope (R26).

## 6 THE SELF-VERIFY STAMP
- claimsRechecked: 4
- discrepanciesFound: 0
- discrepanciesFixed: 1 (contract.ts:110 divergence refined from swallow→partial, confidence 0.78 retained)
- writeViolations: 0
- markersFound: 8/8
- verdictsValidated: true
- fileLinesVerified: firewall.ts:43 oracle.ts:27 contract.ts:110 pipeline.ts:145
- specsChecked: PARAGON_L2_BUILD_SPEC.md:662,688,669 + V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:292
- ledgerFiles: findings/report.md (10148 bytes, 4 FINDING blocks), verdicts.json (4 TRUE_DEFECT), report.md (this file) — all byte-identical adjudication
