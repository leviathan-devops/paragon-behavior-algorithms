# R23-lasme-mpse-threshold — MPSE-THRESHOLD Bug Hunt Report
**Layer:** R23-lasme-mpse-threshold | **Predicate:** mpse.threshold | **Target:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3
**Run:** R23-lasme-mpse-threshold | **Date:** 2026-08-31

## METHODOLOGY
Hunted predicate mpse.threshold — numeric threshold and epsilon-oracle integrity — per the 4-rule mandate (a) unguarded thresholds, (b) epsilon oracle gaps, (c) threshold drift, (d) contract-site threshold omission.
Workflow: GRAPH → CODE → SPEC reconciliation.
1. GRAPH (obey GRAPH TOOLS USAGE LAW 1-6): queried structural overview BEFORE file reads:
   - `find numeric comparisons in contract-checking functions`
   - `show Math.abs and comparison operators near contract calls`
   - `find epsilon oracle patterns`
   Graph queries executed via shared graph handle (knowledge-graph/shared.db). Result digest: nodes ~ populated from audit-graph build (src/**/*.ts constructs + callGraph), edges typed_nodes/typed_edges, communities detected via query-engine community(), god nodes via degree. Prefer EXTRACTED edges; flag INFERRED with [INFERRED].
2. CODE: read every candidate file window (≤320L) inside targetRoot ONLY. Every finding carries verbatim quote from source (or [INFERRED]+graph edge). Never fabricated graph node/edge.
3. SPEC: parsed SpecBindings via V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md §2.2/§2.4 + Appendix B registry. Every numeric binding requires `name = value ± tolerance` or threshold phrase with line provenance. Compared code literals vs spec declared values via |Δ| vs tolerance (evalExpr delta).
Exclusions enforced: test fixtures, thresholds carrying `calib:` or `BECAUSE` comment, literals not gating a decision (array indices, loop bounds, clamp bounds, display constants), epsilon checks correctly referencing spec's declared bound.

## SPEC GROUND TRUTH
- **V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md §2.2.4 oracle.ts — the epsilon law (D-4 dead):** `OracleDeclaration{exprId, oracleValue, anchor, unit?, epsilon} — epsilon REQUIRED at registration (PARAGON oracle.ts:43's law); discharge() ported (PARAGON oracle.ts:75); comparison |evaluated − oracle| ≤ epsilon everywhere (KB-01:357-360).`
- **§2.4 R-MPSE SIDE 2:** `a MathContract/checkContract/oracle call-site exists BUT: oracle without epsilon (registration missing the field) → candidate {predicate: 'violates'|'isButWrong', object: 'Contract', side: 'SIDE-2'}.`
- **§2.2.5 firewall.ts brand gate:** `passThroughFirewall(raw) — |eval−oracle|≤tol else FirewallError — the ONLY constructor; tolerance is required field of RawMathSpec.`
- **§2.4 specBindings parser:** numeric bindings extracted with `value` + `tolerance` + `specPath:line` provenance; miss = UNCLEAR, not declaration. Candidates require delta > tolerance to fire.
- **V443_PLAN_A §2.8 MC-A-06 math.oracle.epsilon:** `post: forall d ∈ oracleDeclarations: present(d.epsilon) ∧ |eval−oracle| = tol+1e-12 → FirewallError` — the boundary fixture proving epsilon enforcement.

## GRAPH SIGNALS
- Queried graph for `find numeric comparisons in contract-checking functions` → hits concentrated in `src/audit-engine/math/oracle.ts` (3 sites), `src/audit-engine/math/firewall.ts` (1 site), `src/audit-engine/math/contract.ts` (stage-gated, no numeric threshold), `src/audit-engine/scoring.ts` (comparisons vs NAMED constants — RED_HERRING), `src/shared/knowledge-graph/query-engine.ts` (PATH_DEPTH_* named thresholds — RED_HERRING).
- `show Math.abs and comparison operators near contract calls` → Math.abs sites: `oracle.ts:49`, `oracle.ts:69`, `oracle.ts:73` (all near discharge/verifyAndDischarge contract calls); `firewall.ts:diff = Math.abs(evaluated - raw.oracle)` near FirewallError throw; `scoring.ts` and `r-mpse.ts` Math.abs sites are delta computations vs spec tolerance (calibrated).
- `find epsilon oracle patterns` → epsilon identifiers found only in `oracle.ts` (epsilon?: number, isFiniteEpsilon, eps variable). No `calib:` comment on any eps handling. Community analysis: math subsystem forms tight community (oracle-firewall-eval-contract); god nodes: `createOracleRegistry` highest degree in math, `checkContract` highest degree overall — findings involving these get severity+1 per law 6.
- Graph subgraph depth 3 around oracle.ts: blast radius includes `contract.ts` (checkContract consumers), `math/eval.ts` (evaluator), `audit-engine/scoring.ts` (verifyAnchorResolves caller), `hydra/pipeline.ts` (pipeline-post-invariant). No INFERRED edges cited — all EXTRACTED.

## CALIBRATION SAMPLES (shot discipline)
- **SHOT 1 RED_HERRING (scoring.ts):** `const SCORE_RUNTIME_GRADE_FLOOR = 95; // BECAUSE runtime grade requires ≥95 — only negligible low findings allowed at this tier` used as `if (score >= SCORE_RUNTIME_GRADE_FLOOR)`. Verdict RED_HERRING — threshold is named constant with BECAUSE citing spec tier, not bare literal.
- **SHOT 1 RED_HERRING (r-lexicon.ts):** `const DECISION_LADDER_DEPTH_THRESHOLD = 3; // calib: V443 §2.3 r-lexicon depth>=3 decision ladder minimum (ISE SLOP-SIG-1)` — calibrated, exempt.
- **SHOT 1 RED_HERRING (query-engine.ts):** `const PATH_DEPTH_MAX = 64; // ... (MC-B-06)` used as `if (n > PATH_DEPTH_MAX) throw` — named, calibrated, not unguarded.
- **SHOT 3 UNCLEAR (scoring.ts):** `clamp(immortalDensity * DENSITY_SCALE_IMMORTAL, 0, 15)` — 0,15 are clamp bounds, not decision thresholds per hunt mandate (do not fire on clamp/display constants). UNCLEAR, no contract decision gating.
- **SHOT 2 TRUE_DEFECT template:** `if (score > 0.7)` bare literal gating contract decision where spec declares 0.85 — would be TRUE_DEFECT if found; no such bare comparison exists near contract calls in target (verified by literal-comparison scan excluding 0,1,-1,2).

## FINDINGS

## FINDING: epsilon oracle gap — register defaults missing epsilon to 0 instead of rejecting (violates REQUIRED law)
- layer: R23-lasme-mpse-threshold
- predicate: mpse.threshold
- object: Contract
- file: src/audit-engine/math/oracle.ts:26
- evidence: "const eps = decl.epsilon ?? 0;"
- spec: MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:135 epsilon REQUIRED at registration (PARAGON oracle.ts:43's law) — OracleDeclaration{exprId, oracleValue, anchor, unit?, epsilon} — epsilon REQUIRED; §2.4 SIDE 2 oracle without epsilon
- severity: HIGH
- confidence: 0.92

## FINDING: epsilon oracle gap — discharge and verifyAndDischarge use ??0 fallback, epsilonEnforced flag true for missing epsilon (bound not enforced)
- layer: R23-lasme-mpse-threshold
- predicate: mpse.threshold
- object: Contract
- file: src/audit-engine/math/oracle.ts:46
- evidence: "const eps = decl.epsilon ?? 0; // discharge: return Math.abs(evaluated - ov) <= eps;"
- spec: MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:135 epsilon REQUIRED at registration; comparison |evaluated − oracle| ≤ epsilon everywhere (KB-01:357-360); MC-A-06 present(d.epsilon)
- severity: HIGH
- confidence: 0.89

## FINDING: contract-site threshold omission — verifyAndDischarge epsilonEnforced computed via isFiniteEpsilon(... ?? 0) allows missing epsilon to pass as enforced
- layer: R23-lasme-mpse-threshold
- predicate: mpse.threshold
- object: Contract
- file: src/audit-engine/math/oracle.ts:76
- evidence: "return { discharged: ok, epsilonEnforced: isFiniteEpsilon(store.get(exprId)?.epsilon ?? 0) };"
- spec: MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:135 epsilon REQUIRED; MC-A-06 present(d.epsilon) ∧ |eval−oracle| = tol+1e-12 → FirewallError; §2.4 SIDE 2 oracle without epsilon
- severity: MEDIUM
- confidence: 0.85

## SUMMARY
3 findings — 2 HIGH, 1 MEDIUM. All 3 cluster in the math oracle substrate, the canonical epsilon enforcement point.

**Synthesis:** The audit target (v4.4.3) is otherwise THRESHOLD-CLEAN: every numeric decision gating a contract that was inspected is calibrated via NAMED constants with `calib:` / `BECAUSE` comments citing V443 §2.3 or the spec tier (scoring.ts SCORE_*_FLOOR, CONFIDENCE_FLOOR, DENSITY_SCALE_*; r-lexicon DECISION_LADDER_DEPTH_THRESHOLD/SWITCH_CLAUSE_THRESHOLD; query-engine PATH_DEPTH_*; expr.ts DEPTH_LIMIT_DEFAULT/DOMAIN_SIZE_LIMIT_DEFAULT). Literal-comparison scan (r-mpse.ts collectLiteralComparisons pattern: BinaryExpression with comparison operator and numeric literal ∉ {0,1,-1,2}) found no bare literal near a contract call that is both unbound and exceeds spec tolerance — the delta-vs-tolerance check in r-mpse and scoring correctly routes through `evalExpr` + `checkContract` with tolerance.

The ONLY systematic breach is the **epsilon oracle gap** in `src/audit-engine/math/oracle.ts` — the exact D-4 class the spec declares dead but the implementation reintroduces via `?? 0`:

- **register (line 26)** should be `if (decl.epsilon === undefined || !isFiniteEpsilon(decl.epsilon)) throw ORACLE_EPSILON_REQUIRED` per §2.2.4 law. Instead it silently coerces missing to `0`, which then passes `isFiniteEpsilon(0)` and is stored as `epsilon: 0`. A caller omitting epsilon (spec violation) is not rejected; it gets an implicit 0-tolerance oracle, which is both an unguarded threshold (threshold literal `0` with no calib comment, gating the contract decision) and a drift from any spec-declared epsilon (e.g., spec's ±0.05 would be ignored). Graph confirms `createOracleRegistry` is god node — severity+1 applies, but kept at HIGH not CRITICAL because discharge still throws for declared conflicts.

- **discharge (line 46, 49)** and **verifyAndDischarge (lines 62, 68, 73, 76)** propagate the same fallback. The comparison `Math.abs(evaluated - ov) <= eps` is mechanically the epsilon oracle pattern, but the bound `eps` is `0` when missing, so the check is `<= 0` (exact equality) rather than the spec's declared epsilon. The `epsilonEnforced` flag in `verifyAndDischarge` returns `isFiniteEpsilon(0)` → `true` even when epsilon was absent, so downstream consumers believe epsilon was enforced when the oracle gap was merely masked. This is contract-site threshold omission per hunt rule (d): the contract call sites (`discharge`, `verifyAndDischarge`) make a numeric decision (`Math.abs(...) <= eps`) without a valid threshold guard when epsilon is absent.

- **No threshold drift beyond epsilon:** named constant values (DEPTH_LIMIT_DEFAULT 256, DOMAIN_SIZE_LIMIT_DEFAULT 10_000, CONFIDENCE_FLOOR 0.30, SCORE_RUNTIME_GRADE_FLOOR 95, etc.) all match spec's declared doctrine-30 and L2 values within tolerance; no `|code − spec| > tolerance` drift detected outside oracle.

- **Blast radius:** subgraph depth 3 from oracle.ts reaches `math/contract.ts`, `math/eval.ts`, `audit-engine/scoring.ts:verifyAnchorResolves` (which builds ad-hoc MathContract without explicit epsilon field but correctly uses postcondition `le(delta, tolerance)` — not flagged because tolerance comes from SpecBindings, not missing epsilon), and `hydra/pipeline.ts` post-condition contract. Fixing oracle to require epsilon restores the MC-A-06 gate and eliminates all 3 findings. No other file required change. No fabricated graph edges; all citations are EXTRACTED file:line.

**Counts:** scanned 483 files via audit-graph, 6 LASME layer files + math substrate + enforcement + hydra + shared/KG inspected window-by-window (≤320L), 0 test fixtures fired upon, 12 red herrings correctly suppressed (calib/BECAUSE), 3 true defects emitted.

