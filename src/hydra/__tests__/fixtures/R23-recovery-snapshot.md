# R23 MPSE-THRESHOLD HUNT — FINDINGS REPORT
## Method
Hunted predicate `mpse.threshold` per R23 hunt mandate (a) UNGUARDED THRESHOLDS (b) EPSILON ORACLE GAPS (c) THRESHOLD DRIFT (d) CONTRACT-SITE THRESHOLD OMISSION. GRAPH TOOLS USAGE LAW obeyed: queried graph BEFORE file reads; prefer EXTRACTED edges; flagged INFERRED.

**Graph queries executed (shared graph, ONE extraction, read-only):**
- `find numeric comparisons in contract-checking functions` → returned candidate files: src/audit-engine/aether-backend/report/validator.ts, src/audit-engine/aether-backend/demand-builder.ts, src/audit-engine/scoring.ts, src/audit-engine/aether-backend/phase-controller.ts
- `show Math.abs and comparison operators near contract calls` → checked for Math.abs epsilon envelope near checkContract/verify sites; r-mpse.ts correctly uses `Math.abs(site.literal - decl.value)` with tolerance, so no gap there; validator.ts and demand-builder.ts showed NO Math.abs guard around numeric confidence comparisons
- `find epsilon oracle patterns` → confirmed epsilon field present in r-mpse's contract analysis (`hasEpsilonField` check) but absent in validator's confidence gate

**File reads (capped 320):**
- TargetRoot: `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3` — ONE TARGET LAW enforced, every finding's file:line verified under targetRoot via realpath+isWithinRoot
- Hot files digested via graph: validator.ts, demand-builder.ts, scoring.ts (calibrated control), phase-controller.ts
- Spec bindings read: src/audit-engine/aether-backend/identity.ts THE_ADJUDICATION_RUBRIC LAW 5 (confidence 0.55..1.0, starts 0.85 +/-), and MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md mechanical template doctrine
- Prior-gate filtered output (LASME candidates intersecting threshold predicate): none for LASME first gate — replay check of LASME MPSE-threshold candidates showed no prior threshold predicate overlap; so hunt was de novo, not cross-gate filtered

**Calibration against shots:**
- SHOT 1 RED_HERRING (named const with calib: comment) → scoring.ts `CONFIDENCE_FLOOR = 0.30 // BECAUSE findings below 0.30 are noise` correctly exempted — not filed
- SHOT 2 TRUE_DEFECT (bare 0.7 vs spec 0.85) → maps to demand-builder `0.85` vs rubric `0.85` but bare literal form still unguarded → filed
- SHOT 3 UNCLEAR (1.0 clamp with no comparison) → analogous to scoring.ts `Math.round(clamp(rawScore, SCORE_FLOOR, SCORE_CEILING))` where 1.0 is not a decision — correctly not filed as defect; we file UNCLEAR for the ambiguous 1.0 in demand-builder's clamp

## FINDING: bare confidence thresholds 0.55/1.0 gate validation without named constant or epsilon guard
- layer: R23-lasme-mpse-threshold
- predicate: mpse.threshold
- object: Contract
- file: src/audit-engine/aether-backend/report/validator.ts:32
- evidence: "if (typeof conf !== 'number' || Number.isNaN(conf) || conf < 0.55 || conf > 1.0) rej.push(`V5:${pre} confidence ${String(conf)} not in [0.55,1.0]`)"
- spec: src/audit-engine/aether-backend/identity.ts:58 LAW 5 — CONFIDENCE is earned, not felt: {0.55..1.0}; a TRUE_DEFECT with all three legs present-and-quoted starts at 0.85; Confidence < 0.55 is NOT emittable — the ISE named-threshold law requires a named constant with calib: provenance
- severity: HIGH
- confidence: 0.88

## FINDING: unguarded confidence calibration literals 0.85/0.05/0.15 bare without named constant and no calib comment
- layer: R23-lasme-mpse-threshold
- predicate: mpse.threshold
- object: Contract
- file: src/audit-engine/aether-backend/demand-builder.ts:22
- evidence: "let c = 0.85; if (opts.derailmentMode) c += 0.05; if (opts.anyLegParaphrased) c -= 0.15; c = Math.round(c * 100) / 100; if (c < 0.55) return { confidence: c, verdict: 'UNCLEAR' }"
- spec: src/audit-engine/aether-backend/identity.ts:58 LAW 5 — CONFIDENCE is earned, not felt: {0.55..1.0}; a TRUE_DEFECT with all three legs present-and-quoted starts at 0.85; +0.05 if divergence matches D1-D9; −0.15 if paraphrased; Confidence < 0.55 NOT emittable
- severity: MEDIUM
- confidence: 0.82

## FINDING: bare budget formula literals 3/4/8 gate phase budget without named calibration
- layer: R23-lasme-mpse-threshold
- predicate: mpse.threshold
- object: Contract
- file: src/audit-engine/aether-backend/phase-controller.ts:14
- evidence: "if (candidates <= 0) return 3; return 4 + Math.ceil(candidates / 8);"
- spec: src/audit-engine/aether-backend/phase-controller.ts:14 budgetRounds contract — spec expects budgetRounds(4)==5, budgetRounds(12)==6, budgetRounds(80)==14 via 4 + ceil(candidates/8) with no named constant or calib: comment reconciling the divergence from a declared spec threshold
- severity: LOW
- confidence: 0.65

## FINDING: ambiguous clamp literal 1.0 in demand-builder close without decision semantics
- layer: R23-lasme-mpse-threshold
- predicate: mpse.threshold
- object: Contract
- file: src/audit-engine/aether-backend/demand-builder.ts:27
- evidence: "if (c > 1.0) c = 1.0;"
- spec: src/audit-engine/aether-backend/identity.ts:58 LAW 5 — CONFIDENCE is earned, not felt: {0.55..1.0} — 1.0 is the mathematical ceiling, but without a surrounding comparison gating a contract decision it is a clamp bound
- severity: LOW
- confidence: 0.58

## SUMMARY
4 findings — 2 HIGH/MEDIUM TRUE_DEFECT (validator 0.55/1.0, demand-builder 0.85 calibration), 1 LOW TRUE_DEFECT (phase-controller budget 3/4/8), 1 UNCLEAR (1.0 clamp). 0 RED_HERRING filed — correctly excluded calibrated thresholds in scoring.ts (CONFIDENCE_FLOOR 0.30, CONFIDENCE_HIGH_FLOOR 0.85, SCORE_CEILING 100 all carry BECAUSE comments and named constants, e.g., `const CONFIDENCE_FLOOR = 0.30; // BECAUSE findings below 0.30 are noise`). R-mpse.ts correctly implements epsilon envelope `delta = Math.abs(site.literal - decl.value)` with `delta <= decl.tolerance` and named tolerance from specBindings, so no EPSILON ORACLE GAP filed. No THRESHOLD DRIFT found where spec declares a value but code uses divergent literal without calib: comment — the 0.85 in demand-builder matches the rubric's 0.85, but the violation is the bare-literal form (UNGARDED THRESHOLD), not drift. Cross-checked via graph: validator.ts and demand-builder.ts have zero inbound `imports` edges from a named threshold constant and zero `contradicts_oracle` guard tags in shared.db, confirming unguarded. File:line citations verified by reading targetRoot files with capped read (320) and grep (120) — every evidence quote is verbatim. Residual: phase-controller budget literals are low severity because they are not near a checkContract site; demand-builder's 0.85 family is contract-adjacent (confidence gates TRUE_DEFECT vs UNCLEAR adjudication). Recommend: promote 0.55, 1.0, 0.85, 0.05, 0.15 in validator/demand-builder to named constants (e.g., `CONFIDENCE_EMITTABLE_FLOOR = 0.55 // calib: identity.ts:58 LAW 5`) and reference spec clause explicitly.
