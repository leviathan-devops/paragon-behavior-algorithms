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

