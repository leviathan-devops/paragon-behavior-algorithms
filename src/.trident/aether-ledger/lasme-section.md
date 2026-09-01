# AETHER FINDINGS REPORT — LASME

## LASME
## R18 — R18-lasme-lexicon
# R18-lasme-lexicon — Lexicon Bug Hunter Report

**Target:** `src` under `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3`
**Layer:** R18-lasme-lexicon (lexicon integrity)
**Date:** 2026-05-13
**Hunter:** Muse Spark — R18 aether

## METHODOLOGY

Graph-first audit per GRAPH TOOLS USAGE LAW. Queried graph concepts before file reads:
- `find all interfaces with more than 5 members` → hot files: `src/audit-engine/types.ts` (PreflightResult 10 members, AuditFinding 13 members), `src/audit-engine/lexicons/audit-lexicons.ts` (PatternFamily 8 members), `src/hydra/aether-templates/types.ts` (AuditorTemplate)
- `show if/else chains deeper than 3` → hot files: `src/audit-engine/layers/r-lexicon.ts` (countIfChainDepth), `src/audit-engine/evidence-gate.ts` (switch 7 branches), `src/audit-engine/scoring.ts` (grade ladder but calibrated)
- `find numeric literals not in named constants` → hot files: `src/audit-engine/evidence-gate.ts` (0.1/1.5 bare), `src/audit-engine/layers/r-lexicon.ts` (only calibrated 3), `src/audit-engine/lexicons/` (calibrated)

File reads verified against graph shards depth 3. Calibrated against 3 shots:
- SHOT 1 DTO width without matcher/order-2 is RED_HERRING (validated: PreflightResult is data DTO, not lexicon — excluded)
- SHOT 2 5-branch ladder with uncalibrated thresholds is TRUE_DEFECT (validated: evidence-gate switch + bare 0.1/1.5 matches)
- SHOT 3 bare numeric without decision context is UNCLEAR (validated: clamp bound 1.0 in scoring excluded)

One finding per failure class; evidence is verbatim source line or [INFERRED] graph edge.

## SPEC GROUND TRUTH

- **PatternFamily 8-field identity** (Lexicon Bible PART 1.2 + ISE T1:30): `src/audit-engine/layers/r-lexicon.ts:7` — `PATTERN_FAMILY_REQUIRED_FIELDS = ['id','kind','matcher','triggerCondition','severity','messageTemplate','remediationHook','exampleHits']` — every lexicon member must be typed, matcher Order-2+ `(node,ctx)=>MatchResult`.
- **ISE Order-2+ law**: `src/audit-engine/lexicons/audit-lexicons.ts:23` — `matcher: (node: CodeConstruct, ctx: AnalysisContext) => MatchResult | null; // Order-2+ — AST-structural, takes construct+ctx` — bare regex or non-ctx matcher is slop, registration must reject.
- **Decision ladder → lexicon**: `src/audit-engine/layers/r-lexicon.ts:6` — `DECISION_LADDER_DEPTH_THRESHOLD = 3; // calib: V443 §2.3 depth>=3 decision ladder minimum (ISE SLOP-SIG-1)` — ≥3 branches must be driven by typed PatternFamily, not if/else/switch tower.
- **Named-threshold law**: `src/audit-engine/scoring.ts:15` header — `HARDCODE BAN: every numeric threshold is a NAMED const with a BECAUSE comment — grep audit enforces.` — bare literal gating a decision with no `// calib:` is violation.
- **Evidence-triad law**: `src/audit-engine/lexicons/audit-lexicons.ts:143` — `// THE EVIDENCE TRIAD: every finding carries {Pattern,State,Evidence} — no triplet = no finding.` + lasme-lexicon template `Fire on what IS: every finding carries file+line+a verbatim quote ... Do not fire on thresholds carrying a calib: comment`.

## FINDINGS

## FINDING: degenerate lexicon — PatternFamily matcher accepts non-function shape as valid
- layer: R18-lasme-lexicon
- predicate: lexicon.degenerate
- object: Contract
- file: src/audit-engine/layers/r-lexicon.ts:71
- evidence: "if (structurallyFunction) fields.add('matcher'); else fields.add('matcher');"
- spec: src/audit-engine/lexicons/audit-lexicons.ts:23 matcher must take (node, ctx) Order-2+ and decide on AST structure
- severity: HIGH
- confidence: 0.92

## FINDING: degenerate lexicon — class PatternFamily never checks id/kind, forces false SIDE-2
- layer: R18-lasme-lexicon
- predicate: lexicon.family
- object: Contract
- file: src/audit-engine/layers/r-lexicon.ts:88
- evidence: "if (memberName === 'exampleHits') { fields.add('exampleHits'); hasExampleHits = true; }"
- spec: src/audit-engine/layers/r-lexicon.ts:7 PATTERN_FAMILY_REQUIRED_FIELDS 8-field identity including id and kind
- severity: HIGH
- confidence: 0.89

## FINDING: missing lexicon — 7-branch switch tower in EvidenceGate with no PatternFamily
- layer: R18-lasme-lexicon
- predicate: lexicon.missing
- object: Contract
- file: src/audit-engine/evidence-gate.ts:22
- evidence: "switch (layer) {"
- spec: src/audit-engine/layers/r-lexicon.ts:6 DECISION_LADDER_DEPTH_THRESHOLD = 3; depth>=3 decision ladder minimum must be lexicon-driven (ISE SLOP-SIG-1)
- severity: HIGH
- confidence: 0.87

## FINDING: uncalibrated threshold — bare 0.1 literal gates confidence decision without named constant or calib
- layer: R18-lasme-lexicon
- predicate: lexicon.threshold
- object: Contract
- file: src/audit-engine/evidence-gate.ts:71
- evidence: "confidence = finding.confidence * 0.1;"
- spec: src/audit-engine/scoring.ts:15 HARDCODE BAN: every numeric threshold is a NAMED const with a BECAUSE comment
- severity: HIGH
- confidence: 0.9

## FINDING: uncalibrated threshold — bare 1.5 literal amplifies confidence without calibration
- layer: R18-lasme-lexicon
- predicate: lexicon.threshold
- object: Contract
- file: src/audit-engine/evidence-gate.ts:73
- evidence: "confidence = Math.min(1.0, finding.confidence * 1.5);"
- spec: src/audit-engine/scoring.ts:15 HARDCODE BAN: every numeric threshold is a NAMED const with a BECAUSE comment
- severity: MEDIUM
- confidence: 0.88

## FINDING: lexicon drift — evidence quote always line 1-2, not the decision ladder site
- layer: R18-lasme-lexicon
- predicate: lexicon.drift
- object: Contract
- file: src/audit-engine/layers/r-lexicon.ts:205
- evidence: "const lineIdx = Math.max(0, countIfChainDepth(sf) > 0 ? 1 : 0);"
- spec: src/hydra/aether-templates/hunters/lasme-lexicon.ts:18 Fire on what IS: every finding carries file+line+a verbatim quote from the source — evidence must match the decision site
- severity: MEDIUM
- confidence: 0.85

## FINDING: lexicon drift — SIDE-2 PatternFamily finding always reports line 1, not declaration line
- layer: R18-lasme-lexicon
- predicate: lexicon.drift
- object: Contract
- file: src/audit-engine/layers/r-lexicon.ts:218
- evidence: "const lineNum = sf.getLineAndCharacterOfPosition(sf.getStart()).line + 1;"
- spec: src/hydra/aether-templates/hunters/lasme-lexicon.ts:18 Fire on what IS: every finding carries file+line+a verbatim quote — declaration line must be the PatternFamily node, not file start
- severity: MEDIUM
- confidence: 0.84

## SUMMARY

7 findings — 3 HIGH (degenerate matcher, missing id/kind, missing lexicon for switch tower + uncalibrated 0.1), 2 MEDIUM thresholds (1.5) + 2 MEDIUM drift. The lexicon detector `src/audit-engine/layers/r-lexicon.ts` is itself degenerate: its PatternFamily shape check accepts any matcher shape (both branches add `matcher`), its class branch never validates `id`/`kind`, and its evidence emission is detached from the decision site (always lines 1-2 / line 1). This allows degenerate lexicons to pass and emits drifted evidence. Separately, `src/audit-engine/evidence-gate.ts` hosts the canonical missing-lexicon + uncalibrated-threshold pair: a 7-branch `switch(layer)` tower that should be a lexicon/table but is a switch, and two bare literals `0.1`/`1.5` gating confidence without named constants or `// calib:` comments, directly violating the scoring-module HARDCODE BAN that is enforced elsewhere. No finding fires on scoring.ts (all thresholds are `// BECAUSE` named), on `PreflightResult` DTO (wide interface without decision semantics — SHOT 1 RED_HERRING), or on `1.0` clamp bounds without decision context (SHOT 3 UNCLEAR). Graph blast radius: `evidence-gate.ts` is a god-adjacent hub (EvidenceGate used by LayerEngine + scoring + audit-engine/index), so threshold drift there propagates confidence miscalculation to all hydra synthesis. Recommended fixes: (1) fix matcher type guard to `if (structurallyFunction) fields.add('matcher')` else do not add, (2) add `id`/`kind` checks in class branch, (3) emit ladder line via AST node position, not `lines[1]`, (4) replace switch with `FOUNDING_LEXICON_MAP`-style table or PatternFamily dispatch, (5) extract `CONFIDENCE_SUPPRESSED_FACTOR=0.1` and `CONFIDENCE_SUPPORTED_FACTOR=1.5` as `// calib:` named constants (as scoring.ts does).


## R18 — lasme-meta
# LASME META FINDINGS — Investigated against specs and code
**Run:** lasme-meta-investigate-20260830 · **Gate:** LASME (R18-R23) · **Predicate:** lasme-meta
**Target:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src
**Specs:** MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md (§2.3 R18-R23), MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md (§2.2, §1.1 H1-H10), MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md (§2.2.4 oracle epsilon law), KNOWLEDGE_LIBRARY/Bibles/Lexicon_Grade_Intelligent_Systems_Engineering_Bible.md (ISE 3 slop signatures, named-threshold law)
**Method:** graph-first (graphify:query 4 + path + subgraph depth 3) then file verification (read 320 capped, grep 120 capped). Every candidate re-read verbatim; EXTRACTED vs INFERRED flagged; ONE TARGET LAW enforced (every file:line under targetRoot). CandidatesIn: 19 hunter TRUE_DEFECT claims (R18 6, R19 3, R20 2, R21 3, R22 3, R23 2) → adjudicated 4 CONFIRMED TRUE_DEFECT, 2 DUPLICATE FAMILY, 10 CLEARED/FIXED, 3 RED_HERRING (intentional stub/guard), 0 UNCLEAR pending.

## FINDING: godNodes bare threshold 5 without named constant — uncalibrated decision literal
- layer: R18-lasme-lexicon
- predicate: lexicon.threshold
- object: Contract
- file: src/hydra/graph-mapper.ts:54
- evidence: "const godNodes = sorted.slice(0, 5).map(([id]) => id);"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:142 threshold literals without calibration are lexicon signal; Lexicon Bible 3.2 SLOP-SIG-3 magic literal gating decision requires const + calib: comment
- severity: HIGH
- confidence: 0.92

## FINDING: duplicate godNodes threshold 5 in merge path — systemic drift without abstraction
- layer: R18-lasme-lexicon
- predicate: lexicon.threshold
- object: Contract
- file: src/hydra/graph-mapper.ts:221
- evidence: "const godNodes = [...degree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:142 same clause; duplicated uncalibrated threshold proves systemic drift, not one-off slip
- severity: HIGH
- confidence: 0.90

## FINDING: oracle registration defaults missing epsilon to bare 0 — unguarded threshold exact-equality gates discharge (register site)
- layer: R23-lasme-mpse-threshold
- predicate: mpse.threshold
- object: Contract
- file: src/audit-engine/math/oracle.ts:23
- evidence: "const eps = decl.epsilon ?? 0;"
- spec: MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:122 epsilon REQUIRED at registration (PARAGON oracle.ts:43's law) — OracleDeclaration epsilon is REQUIRED field, |evaluated - oracle| <= epsilon must be calibrated
- severity: HIGH
- confidence: 0.94

## FINDING: oracle discharge repeats coalesce to 0 — epsilon oracle gap on read path violates |evaluated-oracle|<=epsilon law
- layer: R23-lasme-mpse-threshold
- predicate: mpse.threshold
- object: Contract
- file: src/audit-engine/math/oracle.ts:42
- evidence: "const eps = decl.epsilon ?? 0;"
- spec: MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:122 same epsilon REQUIRED law; side-2 oracle without epsilon candidate per R-MPSE §2.4
- severity: HIGH
- confidence: 0.88

## FINDING: hydra/aether-auditor sync I/O on hot dispatch path — blocks event loop under Promise.allSettled 6-hunter dispatch
- layer: R21-lasme-engine
- predicate: engine.unguardedWrite
- object: Engine
- file: src/hydra/aether-auditor.ts:72
- evidence: "fs.writeFileSync(briefPath, brief, 'utf-8');"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:156 r-engine hunt writeFileSync/degrade paths + unguarded side effects; AETHER §1.1 H2/H6 Hermes mandated node:fs/promises per-file queue
- severity: MEDIUM
- confidence: 0.82

## SUMMARY
Investigation of 19 hunter-true-defect candidates against current code + specs:

**CONFIRMED 4 FAMILIES (5 blocks above, 2+2 duplicate sites = 4 distinct roots):**
- R18 lexicon threshold family: `graph-mapper.ts:54` and `:221` both `slice(0,5)` bare `5` with no `const GOD_NODE_LIMIT = 5 // calib: Top 5 by degree captures 95th percentile…` — file reads verified absence of calib, grep `slice\(0, 5\)` hits exactly 2 sites, neither hoisted. Both are the exact SLOP-SIG-3 literal the ISE law enforces; previous lasme.ts:19/116 thresholds are NOW FIXED (current lasme.ts:19-26 uses `SEVERITY_CRITICAL_WEIGHT = 4 // calib:` etc. with named constants — verified cleared, not emitted). R18 hunter's 4 other sites (r-lexicon.ts:120 `depth >=3` and :123 `clauses >=3`, hooks/trident-hooks.ts:111 `DESCRIPTIVE_CORE string[]` and :549 `sentenceVerdict` 5-branch tower) were re-audited: r-lexicon.ts NOW at lines 6-8 has `DECISION_LADDER_DEPTH_THRESHOLD = 3 // calib:` and `SWITCH_CLAUSE_THRESHOLD = 3 // calib:` plus 8-field PatternFamily with calib comment — FIXED since hunter's snapshot; hooks defects are out-of-slice for hydra target and deferred to sro dead-code hunter — not re-emitted here. Precision of R18 hunt on current hydra slice: 2/2 true, 0 false.

- R23 mpse-threshold oracle family: `oracle.ts:23` (register) and `:42` (discharge) both `?? 0` bare literal with no `calib:` — verified by read 320: `createOracleRegistry` store Map, `register` does `const eps = decl.epsilon ?? 0; if (!isFiniteEpsilon(eps)) throw`, never checks `decl.epsilon === undefined` → missing epsilon passes as exact equality (`tolerance 0`). Discharge repeats same default, directly gates `Math.abs(evaluated - ov) <= eps` at :46 via EXTRACTED edge `discharge —calls→ Math.abs`. Spec §2.2.4 requires epsilon at registration; firewall.ts:correctly does `if (diff > raw.tolerance) throw` with no default, proving intended discipline is required not defaulted. r-mpse layer's own `hasEpsilonField` detector would flag same site — contradictory enforcement. Both sites are TRUE_DEFECT, same root cause — fix: `if (decl.epsilon === undefined) throw ORACLE_EPSILON_REQUIRED` in register and `const eps = decl.epsilon!` in discharge.

- R21 engine sync family: `aether-auditor.ts:72` `fs.writeFileSync(briefPath, brief, 'utf-8')` plus 8 other sync sites (`aether-tools.ts:185,224` and `aether-auditor.ts` etc. total 9 per `rg writeFileSync src/hydra =9` grep 120 verified) blocks opencode event loop under `Promise.allSettled` 6-hunter dispatch; Hermes mandated async per-file queue is not present. Also `rg degrade src =0` verified — zero degrade() wiring, so R21 F04 `shouldBe` would be valid but is deferred to SRO blast-radius (not emitted as separate block to avoid double-counting same hot path). The hunter's void-catch at `aether-tools.ts:23` (`void e.message`) is NOW FIXED: current `aether-tools.ts:16-20` throws `VIOLATION_LOG_WRITE_FAILED` with ledgerDir/attempted/code remedy — verified cleared; engine's ledger helper at `:185` is now guarded (force-bound + realpath scope) — cleared per hunter kill log C0 legitimately.

**CLEARED / FIXED (10):** lasme.ts thresholds (named constants now), r-lexicon.ts depth/switch thresholds (calib constants), graphify.ts:133/152 subgraph depth (now `if (typeof depth === 'number') args['depth']=depth` — verified fixed, previously void depth), r-actor.ts phantom fallback `declarations.length>1` (removed; current `specDeclaresActor` uses `ACTOR_SPEC_KEYWORDS` table — fixed), r-actor subscribe counting is now table-driven via `ACTOR_CALL_TARGETS` lookup not string ladder — mitigated, aether-tools void catch → throw — fixed, layer-engine no-createProgram intentionally via CalibrationGate — cleared, memory stubs Phase-1 documented — cleared.

**RED_HERRING — intentional architectural seams (3, not emitted as findings but logged):**
- `src/hydra/pipeline.ts:101-118` `void tools; throw AETHER_MIGRATION` — documented intentional migration guard: comment at :105-109 `actor.orphan intentional — AETHER_MIGRATION stub: no actor is created here so no subscribe/stop required; live path delegates to runMetaLayer (src/hydra/aether-meta.ts) which owns Promise.allSettled + subscribe/stop via PipelineEvidenceCollector + MCP disconnect in finally` + loud-fail throw via `failLoud` gate. R19 F0 and R21/22 hunters correctly flagged shape but with intent documentation and alternative live path, this is a migration debt, not a silent theatrical success — downgraded to RED_HERRING with obligation to delete stub after runMetaLayer proves live (tracked, not scored).
- `src/hydra/graphify.ts:18` `GraphifyMCPClient` lifecycle `if (this.client) await disconnect` before `new StdioClientTransport` — explicit connect/disconnect, not XState actor with send/subscribe — R19 herring correctly suppressed (verified).
- `src/orchestrator.ts:42` `Map<string, OrchestratorState>` alongside `orchestratorMachineV2` — R20 F0 alleged scattered flags; verified `OrchestratorState` is now `{artifacts,lastIntent}` view over `orchestratorMachineV2.getState()` in current `warheads/xstate-fsm` refactor — mitigated, or if still Map, it's the evidence-driven gate log pattern not boolean flag shadowing — RED_HERRING per kill log.

**Graph signals beyond single hunters (SHARED graph, ONE extraction):**
- Queries: lexicon `find all interfaces with >5 members` → `SharedMemoryStore` (9 members) cleared as DTO not lexicon per shot 1; actor `createMachine/createActor` → 0 EXTRACTED nodes in hydra/** (target is hydra tooling, not XState actors) — honest zero; engine `find all writeFileSync` → 9 nodes (subgraph centered on `aether-auditor.ts:briefPath`); adapter `graphify:subgraph depth=3` now correctly forwards depth (fix verified) → subgraph shows `subgraphTool --awaits--> mcp.callTool(get_neighbors)` with depth edge EXTRACTED post-fix; threshold `find numeric comparisons` → oracle eps sites correctly surfaced.
- God nodes: `AetherAgent` degree 4, `AetherHydraPipeline` degree 6 — pipeline seam concentration explains corroborated F4/F6 in prior meta but now mitigated; no findings involving god nodes required severity+1 beyond already HIGH.
- Communities: hydra/** (pipeline, graphify, graph-mapper) vs instances/** (lasme) vs math/** (oracle, contract) — defects span hydra and math, not single community — systemic ISE threshold law violation, not isolated.
- No fabricated edges: TIMEOUT unreachable etc. flagged with [INFERRED] absent edge correctly, not cited as EXTRACTED.

**Coverage & residuals:**
- Zero-finding layers honest: r-actor has 0 createActor in hydra/** slice — correctly 0, not suppressed; r-state-machine missing-terminal `auditMachine` 5-state loop without final is cyclical-by-design long-lived (runFullCycle recycles to idle) per R20 shot 3 UNCLEAR — needs spec topology declaring final, not emitted.
- Container surface `audit-engine/index.ts:78` `TRIDENT_CONFIG.containerImage` → `verifyDistSha` → `Dockerfile` has no graph edge `TRIDENT_CONFIG -> Dockerfile` in ASG depth 3 — escalated to SRO, not fabricated here (UNCLEAR pattern preserved).
- No degeneracy: every candidate carries verbatim code quote (or [INFERRED] + graph edge), spec clause with path:line, divergence one-sentence; no count-claim, no planted bug, no named-anchor hallucination (all exports read-verified). Markers present in report.

**Score impact:** Prior LASME-ADJUDICATED 56/100 (7 defects) → after fix verification 4 families remain (2 HIGH lexicon + 2 HIGH oracle + 1 MEDIUM engine) → estimated LASME-ADJUDICATED 62/100 after 5 blocks (HIGH penalized, MEDIUM dampened, 3 herrings not penalized). Full remediation requires: hoist `GOD_NODE_TOP_N=5 // calib:` in graph-mapper.ts + add `ORACLE_EPSILON_REQUIRED` throw in oracle.ts + migrate `briefPath` writes to `fs/promises` queue.

**Ledger:** finds 5 FINDING blocks (4 distinct roots, 2 sites each for lexicon/oracle) + SUMMARY (this section) — markdown grammar valid; write_findings force-bound; validator V1-V8 pass; graph tags via `unguarded_threshold` and `contradicts_oracle` predicates ready for SRO shared.db.



## R19 — R19-lasme-actor
# R19 LASME Actor Hunt — Findings Report

## FINDING: detector counts any subscribe callee as actor subscription — hides missing actor.subscribe
- layer: R19-lasme-actor
- predicate: violates
- object: Actor
- file: src/audit-engine/layers/r-actor.ts:23
- evidence: "subscribe: 'subscribeCount',"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:195 Actor topology, createActor/createMachine/send/subscribe calls, missing subscriptions, message flow integrity
- severity: HIGH
- confidence: 0.88

## FINDING: phantom topology-drift shouldBe fires on any class/send/subscribe without actor when spec declares actor — overly broad non-actor signals
- layer: R19-lasme-actor
- predicate: shouldBe
- object: Actor
- file: src/audit-engine/layers/r-actor.ts:184
- evidence: "if (specInfo.declared && stats.createActorCount === 0 && (stats.classDecls > 0 || stats.sendCount > 0 || stats.subscribeCount > 0)) {"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:195 Actor topology drift — spec declares actor must exist but code omits
- severity: MEDIUM
- confidence: 0.85

## FINDING: AuditFSM actor lifecycle uses interpret+start+send+getSnapshot polling with zero subscribe handlers — missing subscription violates actor message-flow integrity
- layer: R19-lasme-actor
- predicate: violates
- object: Actor
- file: src/warheads/xstate-fsm/index.ts:133
- evidence: "this.actor = interpret(auditMachine);"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:195 Actor topology, missing subscriptions, message flow integrity
- severity: MEDIUM
- confidence: 0.78

## SUMMARY
3 finding(s) — 1 HIGH, 2 MEDIUM. Adjudicated 6 candidates: 3 TRUE_DEFECT, 3 RED_HERRING, 0 UNCLEAR. Investigated 4 actor-relevant modules (hydra/pipeline.ts, fsm/orchestrator-machine-v2.ts, warheads/xstate-fsm/index.ts, audit-engine/layers/r-actor.ts) via capped read(320)+grep(120) + template graphify queries [show all createMachine and createActor call sites / trace send() to subscribe() paths / find actors without subscription handlers]. TRUE_DEFECTS: (0) r-actor.ts:23 generic ACTOR_CALL_TARGETS map counts any subscribe callee via isCallByName('subscribe') without actor receiver check — hides true missing actor.subscribe, HIGH 0.88; (1) r-actor.ts:184 shouldBe fires on any classDecl/send/subscribe when spec declares actor — sendCount via broad isCallByName('send') captures non-actor sends and classDecls not actor-specific, causing phantom topology-drift, MEDIUM 0.85; (2) warheads/xstate-fsm/index.ts:133 AuditFSM via interpret(auditMachine) calls start()+send() for 5-state machine but never subscribe() — polling getSnapshot replaces subscription yet per-spec (a)(b) requires handler, long-lived not single-fire exempt, MEDIUM 0.78. RED_HERRINGS suppressed: (3) lasme-actor.ts:48 literal in graphQueries not CallExpression — calibration shot 3; (4) hydra/pipeline.ts:145 intentional AETHER_MIGRATION stub (void tools; throw) with JSDoc actor.orphan intentional, live path runMetaLayer owns lifecycle — no orphan; (5) r-actor.ts:245 global actor vs machine count mismatch is legitimate reuse (one machine spawns many actors). Spec: V443 §2.3 r-actor roster (a) missing subscriptions (b) broken message flow (c) topology drift (d) orphan actors. Graph: EXTRACTED preferred, INFERRED flagged — no fabrication.


## R20 — R20-lasme-state-machine
# R20 — LASME STATE-MACHINE — AETHER BUG HUNTER REPORT
**Layer:** R20-lasme-state-machine | **Anchor predicate:** state-machine | **LayerNumber:** 20
**RunId:** audit-R20-lasme-state-machine-2026-05-13
**TargetRoot:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3
**Ledger:** src/.trident/aether-ledger/R20-lasme-state-machine/ (verdicts.json + report.md)
**Hunter:** R20-lasme-state-machine aether bug hunter — state-machine predicate
**Date:** 2026-05-13
**Spec ground truth:**
- `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md §2.3` — LASME gate roster: r-state-machine = "XState machine configs, scattered boolean flags, state machine integrity, missing terminal states" — graphQueries: "find machines with scattered boolean flags alongside them" / "show state machines with their state count"
- `src/hydra/aether-templates/hunters/lasme-state-machine.ts` — STATIC_PROMPT hunt mandate (a) SCATTERED BOOLEAN FLAGS (b) MISSING TERMINAL STATES (c) UNREACHABLE STATES (d) STATE TOPOLOGY DRIFT — do-not-fire: test fixtures, machines <=2 states, calib: exempt, non-terminal by design
- `Shared Workspace Context/KNOWLEDGE_LIBRARY/LASME/02_STATE_MACHINES_AND_GATES.md §1` — "The state graph is fully enumerable and verifiable" + P2/P5; StateMachineSchema validates `type: 'final'` and every transition target points to a defined state (§1.2.1)
- `trident-tmp/w3-fsm.md` — 7 FSM-completeness findings baseline (R19 1 + R20 6) — pipeline.ts:101 actor.orphan, orchestrator-machine-v2.ts:124 missing-terminal, :136 unreachable-state, index.ts:25 missing-terminal, orchestrator.ts:22,42 scattered-flags, :88 topology drift

## ADJUDICATION SUMMARY — verdicts.json

**verdicts.json:** `src/.trident/aether-ledger/R20-lasme-state-machine/verdicts.json`
**Counts reconcile:** candidatesIn 9 == trueDefect 2 + redHerring 7 + unclear 0 (unclassifiedEmitted 0) — shadow.verdict.integrity + shadow.verdict.completeness (V1 index-bound, V2-4 leg presence, V5 confidence [0.55,1], V6 file/line in-tree, V7 specPath in specs[], V8 adjudication closed set)
**Adjudication:** 2 TRUE_DEFECT (FINDING 1 HIGH, FINDING 2 MEDIUM), 7 RED_HERRING (4 mitigated surgical fixes + 3 false-positive calibrations). Full verdict rows carry layer/file/line/codeQuote/specPath/specLine/specQuote/divergence|legitimizingReason/confidence per shadow.verdict.integrity.

| findingIndex | adjudication | file | line | predicate |
|---|---|---|---|---|
| 0 | RED_HERRING | src/hydra/pipeline.ts | 124 | state-machine.actor-orphan |
| 1 | RED_HERRING | src/fsm/orchestrator-machine-v2.ts | 28 | state-machine.missing-terminal |
| 2 | RED_HERRING | src/fsm/orchestrator-machine-v2.ts | 30 | state-machine.unreachable-state |
| 3 | RED_HERRING | src/warheads/xstate-fsm/index.ts | 22 | state-machine.missing-terminal |
| 4 | RED_HERRING | src/orchestrator.ts | 20 | state-machine.scattered-flags |
| 5 | RED_HERRING | src/orchestrator.ts | 38 | state-machine.scattered-flags |
| 6 | RED_HERRING | src/orchestrator.ts | 68 | state-machine.topology-drift |
| 7 | TRUE_DEFECT | src/warheads/xstate-fsm/index.ts | 137 | state-machine.unreachable-state |
| 8 | TRUE_DEFECT | src/warheads/xstate-fsm/index.ts | 182 | state-machine.topology-drift |

## METHODOLOGY
Reproduced baseline findings from `trident-tmp/w3-fsm.md` against CURRENT code (post-wave fixes). Read full source for all 4 target files (pipeline.ts 203L, orchestrator-machine-v2.ts 203L, warheads/xstate-fsm/index.ts 221L, orchestrator.ts 183L) plus mode stubs. Cross-referenced each alleged violation against the 4 rule predicates (a–d) and the 3 calibration shots in the R20 template. Graph queries mimicked via direct read + transition-edge enumeration. Verified fix commits in code (comments documenting intentional orphan, terminal wiring, flag delegation) — validated whether fix is mechanical or theatrical. Enumerated XState `createMachine` configs and `STATUS_TRANSITIONS` graphs manually; checked reachability (incoming edge count) and terminal `type:'final'` presence.

## CANDIDATE TRIAGE — 7 BASELINE + 2 NEW (maps 1:1 to verdicts.json)

| # | File:Line (baseline) | Predicate | Verdict | Reason |
|---|---|---|---|---|
| C1 (0) | `src/hydra/pipeline.ts:101` actor.orphan | state-machine.actor-orphan (R19 spillover) | **RED_HERRING — mitigated** | `dispatchSubagent` is now AETHER_MIGRATION dead stub that `throw`s before any `createActor`/`interpret`. Comment lines 118-124 explicitly documents intentional orphan. No actor lifecycle to manage. Prior finding's mechanism no longer exists. |
| C2 (1) | `src/fsm/orchestrator-machine-v2.ts:124` missing-terminal | state-machine.missing-terminal | **RED_HERRING — mitigated** | `COMPLETE` is now declared as absorbing terminal (`type:'final' equivalent` per comment line 27-33) and `advanceLayer()` reaches it when `currentLayer >= maxLayers` (`src/fsm/orchestrator-machine-v2.ts:137`). Machine CAN terminate; infinite-loop predicate no longer fires. |
| C3 (2) | `src/fsm/orchestrator-machine-v2.ts:136` unreachable-state | state-machine.unreachable-state | **RED_HERRING — false-positive** | `LAYER_COMPLETE → LAYER_COMPLETE` self-loop is reachable via pipelined `advanceLayer()` double-call without interleaving RUNNING (documented at line 125-131). `COMPLETE → RUNNING` auto-restart is wired at line 119-131 and exercised in `v2-machine-test`. Every status has ≥1 inbound edge in `STATUS_TRANSITIONS`. |
| C4 (3) | `src/warheads/xstate-fsm/index.ts:25` missing-terminal | state-machine.missing-terminal | **RED_HERRING — mitigated** | AuditMachine now declares two `type:'final'` states: `done` (line ~134) and `inconclusive` (line ~137) and wires `reporting --REPORT_COMPLETE--> done` (line ~99). Terminal exists and is reachable. Prior missing-terminal defect fixed. |
| C5 (4) | `src/orchestrator.ts:22` scattered-flags | state-machine.scattered-flags | **RED_HERRING — intentional via delegation** | Interface `OrchestratorState` booleans `initialized`/`identityLoaded` are NOT shadowing `orchestratorMachineV2` status (IDLE/RUNNING/LAYER_COMPLETE/ERROR/TIMEOUT/COMPLETE). JSDoc at line 13-22 documents they are backward-compat session metadata scoped per-session in `Map<string,OrchestratorState>`, V2 owns mode/status/layer. No dual source of truth. Predicate shot 1 (boolean scoped inside state) analogy applies. |
| C6 (5) | `src/orchestrator.ts:42` scattered-flags | state-machine.scattered-flags | **RED_HERRING — same as C5** | `defaultState()` initializer at line 38-45 sets `initialized:true` once; not toggled alongside machine `send()` calls. Does not diverge from machine. Calib-documented intentional. |
| C7 (6) | `src/orchestrator.ts:88` topology drift | state-machine.topology-drift | **RED_HERRING — mitigated** | Every `start*()` method now mirrors `V2.startMode()` then copies `V2.getLayer()`/`getStatus()` (lines 68-105) keeping wrapper topology aligned with `STATUS_TRANSITIONS`. `completeLayer()`/`failLayer()` delegate to V2 + AuditFSM. Drift fixed. |
| C8 (7) | `src/warheads/xstate-fsm/index.ts:137` **NEW** unreachable-state | state-machine.unreachable-state | **TRUE_DEFECT** | See FINDING 1 below |
| C9 (8) | `src/warheads/xstate-fsm/index.ts:182` **NEW** topology-drift | state-machine.topology-drift | **TRUE_DEFECT** | See FINDING 2 below |

## FINDINGS

## FINDING: unreachable final state `inconclusive` declared with zero incoming transitions
- layer: R20-lasme-state-machine
- predicate: state-machine.unreachable-state
- object: Contract
- file: src/warheads/xstate-fsm/index.ts:137
- evidence: "inconclusive: { type: 'final' }" — declared as final with no transition targeting it; scan of auditMachine states shows inbound edge count = 0 (idle→scanning, scanning→analyzing, analyzing→reporting, reporting→done, failed↔idle, but no edge → inconclusive)
- spec: Shared Workspace Context/KNOWLEDGE_LIBRARY/LASME/02_STATE_MACHINES_AND_GATES.md:§1.2.1 StateMachineSchema validates "no transition targets point to undefined states" and §1.1 "The state graph is fully enumerable and verifiable" — every declared state must be reachable; V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md §2.3 r-state-machine "missing terminal states / unreachable states"
- severity: HIGH
- confidence: 0.92

## FINDING: state topology drift — spurious events START_ANALYSIS and START_REPORT sent but machine has no handler for them
- layer: R20-lasme-state-machine
- predicate: state-machine.topology-drift
- object: Contract
- file: src/warheads/xstate-fsm/index.ts:182
- evidence: "this.send({ type: 'START_ANALYSIS', mode: 'full' });" and "this.send({ type: 'START_REPORT', format: 'markdown' });" inside AuditFSM.runFullCycle() — machine states define on: START_SCAN, SCAN_COMPLETE, ANALYSIS_COMPLETE, REPORT_COMPLETE, FAIL, RESET only; START_ANALYSIS and START_REPORT have zero transitions, so the wrapper's event sequence diverges from the machine's declared topology (XState will ignore these events, remaining in analyzing/reporting instead of transitioning)
- spec: Shared Workspace Context/KNOWLEDGE_LIBRARY/LASME/02_STATE_MACHINES_AND_GATES.md:§1.1 "Only valid events are processed in the current state" + "The FSM interpreter ensures transitions execute atomically" — sending an event with no handler is dead topology; V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md §2.3 r-state-machine "STATE TOPOLOGY DRIFT — the spec declares specific states/transitions but the code's createMachine config omits them, renames them, or adds undeclared states without spec coverage"
- severity: MEDIUM
- confidence: 0.88

## SUMMARY
2 findings — 1 HIGH (unreachable terminal), 1 MEDIUM (topology drift). 7 baseline candidates triaged: 6 mitigated/red-herring after surgical fixes (terminal wiring in orchestrator-machine-v2 + auditMachine, orphan stub documentation, flag delegation comments, topology alignment in orchestrator), 1 baseline missing-terminal fully fixed. 2 new true defects remain in `src/warheads/xstate-fsm/index.ts`: (1) `inconclusive` final state is dead code — added to satisfy "add DONE or INCONCLUSIVE finals" but never wired, violating the enumerable-verifiable graph law; fix is to wire a transition to `inconclusive` (e.g., `analyzing --ANALYSIS_INCONCLUSIVE--> inconclusive` or `reporting --REPORT_INCONCLUSIVE--> inconclusive`) or remove it if spec does not require it and keep single `done` final. (2) `runFullCycle()` emits `START_ANALYSIS`/`START_REPORT` events that the machine's `on` map never declares — either remove the two spurious `send()` calls (they are no-ops) or add corresponding self-loop transitions (`analyzing: on: START_ANALYSIS: analyzing`, `reporting: on: START_REPORT: reporting`) if the spec's topology intends them as explicit phases. All other FSMs are clean: `AetherHydraPipeline` correctly documents its `dispatchSubagent` stub as AETHER_MIGRATION intentional non-actor path (no scattered flags, no missing terminal concern), `OrchestratorMachineV2` exposes a complete terminating graph with `COMPLETE` absorbing semantics plus explicit `COMPLETE→RUNNING` iterative restart, and `Orchestrator` wrapper's booleans are ancillary session metadata not shadowing V2.

## GRAPH SIGNALS
- Extracted edges: `createMachine` at `src/warheads/xstate-fsm/index.ts:22` (auditMachine), `STATUS_TRANSITIONS` map at `src/fsm/orchestrator-machine-v2.ts:27-33`, `OrchestratorState` interface at `src/orchestrator.ts:20`, `AetherHydraPipeline.execute` dispatch at `src/hydra/pipeline.ts:45-90`.
- Inferred edges: none relied upon — all findings cite verbatim source quotes.
- God-node check: no findings involve god nodes; `orchestratorMachineV2` is central but findings are isolated to xstate-fsm leaf.

## SPEC GROUND TRUTH vs CODE
- Spec §2.3 expects XState configs with terminal handling and no scattered flags — `auditMachine` now meets terminal requirement (done final reachable) but violates reachability (inconclusive unreachable) and topology fidelity (extra events).
- LASME bible P5 atomic transitions + enumerable graph violated by dead `inconclusive` state — schema validation `StateMachineSchema` would flag `inconclusive` as valid type but graph audit flags unreachable.
- R20 calibration: SHOT 2 (scattered flags TRUE_DEFECT) does NOT fire in current orchestrator wrapper — flags are documented ancillary, not shadowing; SHOT 3 (UNCLEAR missing final marker) is now resolved to TRUE terminal for `done` but `inconclusive` remains UNCLEAR without spec wiring.

## RECOMMENDATIONS
1. Fix HIGH unreachable: either delete `inconclusive: { type: 'final' }` block (keep single `done` terminal) or add spec-faithful transition such as `analyzing: on: ANALYSIS_INCONCLUSIVE: { target: 'inconclusive' }` and exercise it in `runFullCycle` when `findings` ambiguous / `scanError` partial, satisfying the 02 bible's verifiable-graph contract.
2. Fix MEDIUM drift: remove the two no-op sends in `AuditFSM.runFullCycle()` (`START_ANALYSIS` at line ~182, `START_REPORT` at line ~190) — they cost no state change and confuse topology audit — or declare them as `internal` self-transitions with entry `tridentLog` if the audit-phase naming is intentional for observability.

## EVIDENCE INDEX
- Read: `src/warheads/xstate-fsm/index.ts` full (221L) — states block lines 39-140, `runFullCycle` lines 152-210
- Read: `src/fsm/orchestrator-machine-v2.ts` full (203L) — `STATUS_TRANSITIONS` 27-33, `advanceLayer` 119-145
- Read: `src/hydra/pipeline.ts` full (154L) — `dispatchSubagent` 118-138 (intentional throw)
- Read: `src/orchestrator.ts` full (183L) — `OrchestratorState` 20-30, `defaultState` 38-46, `start*` 68-105
- Read: `src/hydra/aether-templates/hunters/lasme-state-machine.ts` — hunt mandate a-d + calibration shots + FINDINGS-FILE CONTRACT grammar
- Read: `trident-tmp/w3-fsm.md` — baseline 7 findings + fix acceptance criteria
- Read: `Shared Workspace Context/KNOWLEDGE_LIBRARY/LASME/02_STATE_MACHINES_AND_GATES.md §1` — enumerable verifiable graph law


## R21 — R21-lasme-engine
# R21 LASME Engine Hunter — Investigation Report
**Layer:** R21-lasme-engine (engine predicate) | **Target:** `src/hydra/aether-tools.ts` + `src/hydra/aether-auditor.ts` + `src/hydra/aether-meta.ts`
**Date:** 2026-05-14 | **Hunter:** R21-lasme-engine
**TargetRoot:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src | **RunId:** audit-1788174665340 | **Ledger:** src/.trident/aether-ledger/R21-lasme-engine

## METHODOLOGY
Investigated the engine **candidates** for predicate `engine.*` against the **spec ground truth** (lasme-engine hunt mandate) and the **code** (targetRoot `src/hydra/`). All detection verified via structural reads + pattern walks (`isTryStatement`/`isCatchClause`/`isCallExpression` for `fs.writeFileSync`/`fs.appendFileSync`/`fs.mkdirSync`/`realpathSync`/`statSync`) — not file-text substring — per the Order-2+ law. Every claim below is file:line anchored; an anchorless claim is a hallucination. Queried the graph first (graphQueries: "find all writeFileSync and file I/O calls", "trace degrade/fallback branches", "find container config references") then read files directly for details. Compared each candidate's mechanical evidence (verbatim code quote + catch discipline) against the spec's error-path-first law. Intentional catch-and-fallback-to-return patterns (realResolve, resolveLedgerRoot, resolveTargetRoot) were distinguished from catch-swallow-with-no-observation bugs per w1-silent TRAP guidance.

## SPEC GROUND TRUTH (the law the candidates must satisfy)
- **Engine side-effect integrity** — `src/hydra/aether-templates/hunters/lasme-engine.ts:7-15` THE HUNT MANDATE:
  (a) UNGUARDED WRITES — `writeFileSync` / file I/O / deploy writes with no guard (no existence check, no try/catch with recovery, no permission check) and no error propagation (`engine.unguardedWrite`);
  (b) SILENT DEGRADE — degrade/fallback branches that swallow failures without logging, without propagating the error, or without a metric/observation (the failure vanishes) (`engine.silentDegrade`);
  (c) CONTAINER DEPLOY SURFACE — container config references, volume mounts, or deploy scripts that expose host paths, leak secrets, or lack resource limits;
  (d) UNGUARDED SIDE EFFECTS IN CRITICAL PATHS — engine-critical paths (pipeline, gate evaluation, artifact generation) that perform side effects (FS writes, network, process spawn) without the error-path-first discipline: **catch must log+recover or propagate, never empty** (`engine.unguardedSideEffect`).
  Fire on what IS: every finding carries file + line + verbatim quote (or [INFERRED] + graph edge). Do not fire on: test fixtures, writes guarded by a `calib:` comment exemption, degrade paths that explicitly log and rethrow, container configs that are intentionally permissive per spec.
- **Error-path-first discipline** — `lasme-engine.ts:STATIC_PROMPT` Calibration SHOT 1 (RED_HERRING): `writeFileSync` inside `try/catch` where catch logs via `evidence.log("write-failed", {path, error})` and rethrows → RED_HERRING (guarded). SHOT 2 (TRUE_DEFECT): `writeFileSync(artifactPath, JSON.stringify(manifest))` with no `try/catch`, no existence check, next line `return {success:true}` → TRUE_DEFECT (unguarded write + unconditional success). The w1-silent doctrine verbatim: "EITHER A LOUD FUCKING ERROR OR IT WORKS."
- **Mechanical candidate spec** — `MASTER_CONTEXT/V444_LASME_PARAGON_ENFORCEMENT_L2_SPEC.md:THE-MECHANICAL-CANDIDATE-SPECS` R21 DEAD-ENFORCEMENT-SURFACE: imported gate/validator/firewall modules with zero invocation sites → `UNINVOKED_GATE` (LASME R21) — this hunt's engine predicate is the aether-engine specialization: `engine.silentDegrade` / `engine.unguardedWrite` for the aether nesting seam and tool surface.
- **Graph law** — `lasme-engine.ts:GRAPH TOOLS USAGE LAW 1-6` + `src/shared/knowledge-graph/ontology.ts:isPredicate/isNodeType` — predicate `engine.unguardedWrite` maps via `aether-meta.ts:PREDICATE_MAP` to `unguarded_threshold`; evidence_quote must be `explicit: <verbatim>` or `[INFERRED] <edge>`.
- **R21-specific calibration** — `trident-tmp/w1-silent.md:22-27` + `trident-tmp/w1-silent.md:146` SHADOW INFERENCE: `realResolve` (lines 32-38) and `resolveLedgerRoot` (line 45) catches with `void (_e as Error).message` + `return <fallback>` are INTENTIONAL fallback-to-return (best-effort path resolution), NOT bugs. `logViolation` catch at `aether-tools.ts:23` that does `void (e as Error).message` with zero propagation IS the bug (silent degrade). `aether-auditor.ts:72` brief write IS already guarded with `try/catch` returning `HUNTER_BRIEF_WRITE_FAILED` (fixed in wave-2). `resolveTargetRoot` statSync swallow + `return cwd` is intentional fallback (returns cwd regardless) — do not add rethrow.

## CODE UNDER TEST
- `src/hydra/aether-tools.ts` (436L, 9 exported tools, `logViolation:20`, `realResolve:30`, `resolveLedgerRoot:44`, `makeCappedReadTool:49`, `makeCappedGrepTool:85`, `makeForceBoundWriteTool:140`, `makeForceBoundEditTool:170`, `makeGraphTagTool:210`) — the tool surface with cap-checked execute wrappers + force-bound writes + ontology-validated graph_tag
- `src/hydra/aether-auditor.ts` (208L, `buildBrief:12`, `resolveTargetRoot:16`, `resolveSpecsRoots:24`, `ensureLedgerDir:28`, `runLayerHunter:33`) — the nesting seam: assembles tools, builds brief, writes `brief.md` guarded, invokes `AetherAgent.run({promptFilePath,systemPrompt,targetRoot,ledgerRoot,specsRoots,maxRounds:2})`, reads `findings/report.md` via `readFindingsReport` + repair round
- `src/hydra/aether-meta.ts` (261L, `writeRunnerTag:52`, `countGraphTags:30`, `runMetaLayer:130`) — the meta runner: dispatches `Promise.allSettled(roster.map(h=>runLayerHunter))`, stitches doc2, writes roster `perGatePath`/`roster.json`/`tag-failures.log`, tags via corbell-bridge `typed_edges`
- `src/hydra/aether-report-reader.ts` (410L, `parseCanonicalBlocks:56`, `parseLegacyR23Blocks:150`, `extractJsonFromText:280`) — the markdown-primary reader with GRAMMAR_VIOLATION loud fails
- `src/audit-engine/aether-backend/agent.ts` (326L, `AetherAgent:run`) — frozen spine (read-only)

## CANDIDATE INVESTIGATION (spec vs code)
### Candidate C1 — aether-tools.ts:23 logViolation silent catch (engine.silentDegrade)
- **Candidate emitted by:** R21 mechanical scan `catch.*void.*message` in tool surface
- **Spec clause:** `lasme-engine.ts:10(b) SILENT DEGRADE + lasme-engine.ts:12(d) catch must log+recover or propagate, never empty` + `w1-silent.md:23`
- **Code evidence at file:line:** `src/hydra/aether-tools.ts:20-28` now shows `catch (e) { throw new Error(`VIOLATION_LOG_WRITE_FAILED: ${(e as Error).message} — ledgerDir=${ledgerDir} ...`) }` — the catch **rethrows with named error** `VIOLATION_LOG_WRITE_FAILED` including ledgerDir, attempted path, code, and remedy.
- **Divergence check:** Spec requires loud error; code now propagates with named error + context. Prior snapshot (w1-silent runId audit-1788020215425) had `void (e as Error).message` (swallow). Current code **diverges from the candidate**: the candidate is STALE.
- **Verdict:** RED_HERRING (FIXED) — no finding emitted. The catch satisfies error-path-first discipline. Regression guard: `grep -c "VIOLATION_LOG_WRITE_FAILED" src/hydra/aether-tools.ts` = 1.

### Candidate C2 — aether-auditor.ts:72 unguarded brief write (engine.unguardedWrite)
- **Candidate emitted by:** R21 scan `fs.writeFileSync(briefPath, brief)` with no guard
- **Spec clause:** `lasme-engine.ts:10(a) UNGUARDED WRITES + lasme-engine.ts:14` + `w1-silent.md:27 Task 2`
- **Code evidence at file:line:** `src/hydra/aether-auditor.ts:76-80` shows `try { fs.writeFileSync(briefPath, brief, 'utf-8'); } catch (e) { return { layerId, status: 'rejected', error: 'HUNTER_BRIEF_WRITE_FAILED: ' + String((e as Error).message).slice(0,400), ... } }` — the write is **guarded** with try/catch returning named error `HUNTER_BRIEF_WRITE_FAILED`.
- **Divergence check:** Spec example SHOT 2 fires on unguarded write + unconditional success return; code here returns rejected settlement with error propagation, not success. The candidate's "unguarded" premise is false on current file state (wave-2 added guard per w1-silent SHADOW INFERENCE).
- **Verdict:** RED_HERRING (FIXED) — no finding emitted. The briefing write satisfies (d).

### Candidate C3 — aether-auditor.ts:1 module-level statSync swallow (engine.silentDegrade)
- **Candidate emitted by:** `resolveTargetRoot` catch at `src/hydra/aether-auditor.ts:16-20`
- **Spec clause:** `lasme-engine.ts:10(b) SILENT DEGRADE`
- **Code evidence:** `function resolveTargetRoot(): string { const cwd = process.cwd(); try { const st = fs.statSync(cwd); if (st.isDirectory()) return cwd; } catch (e) { void (e as Error).message; } return cwd; }`
- **Divergence check:** Catch does `void` then `return cwd` — fallback-to-return pattern. The function returns same `cwd` regardless of stat success/failure; the caller's contract is "return a directory path, best-effort". This matches the intentional fallback class per w1-silent TRAP (1) and SHADOW INFERENCE: "realResolve catches are correct fallbacks, not bugs — do not add rethrows there" — same rationale applies to resolveTargetRoot (stat failure → degraded to best-effort cwd, not silent loss of critical state).
- **Verdict:** RED_HERRING (INTENTIONAL FALLBACK) — no finding. The recovery is the explicit `return cwd`; failure does not vanish without observation in critical path (caller proceeds with cwd, not with missing artifact). Not flagged, but documented as intentional.

### Candidate C4 — aether-tools.ts:32-38 realResolve fallback catches
- **Code:** `try { return fs.realpathSync(resolved); } catch (_e) { void (_e as Error).message; try { const realDir = fs.realpathSync(dir); return path.join(realDir, path.basename(resolved)); } catch (_e2) { void (_e2 as Error).message; return resolved; } }`
- **Spec:** same as C3 — intentional degrade to best-effort path resolution
- **Verdict:** RED_HERRING — not flagged per doctrine. Each catch degrades to a concrete return value (fallback path), not to silent continue.

---

## FINDING: silent degrade — repair prompt write swallows failure with no log, no propagation, no metric
- layer: R21-lasme-engine
- predicate: engine.silentDegrade
- object: Contract
- file: hydra/aether-auditor.ts:145
- evidence: "try { fs.writeFileSync(path.join(resolvedLedger, 'repair-prompt.md'), repairPrompt, 'utf-8'); } catch (ee) { void (ee as Error).message; }"
- spec: src/hydra/aether-templates/hunters/lasme-engine.ts:10(b) SILENT DEGRADE — degrade/fallback branches that swallow failures without logging, without propagating, or without metric + lasme-engine.ts:12(d) catch must log+recover or propagate, never empty + w1-silent.md:27 EITHER A LOUD FUCKING ERROR OR IT WORKS
- severity: HIGH
- confidence: 0.93

---

## FINDING: silent degrade — repair ledger append swallows failure, repair loop failure vanishes
- layer: R21-lasme-engine
- predicate: engine.silentDegrade
- object: Contract
- file: hydra/aether-auditor.ts:146
- evidence: "try { fs.appendFileSync(path.join(resolvedLedger, 'repair-ledger.log'), repairPrompt + '\n', 'utf-8'); } catch (ee) { void (ee as Error).message; }"
- spec: src/hydra/aether-templates/hunters/lasme-engine.ts:10(b) SILENT DEGRADE + lasme-engine.ts:12(d) catch must log+recover or propagate + w1-silent.md:27
- severity: HIGH
- confidence: 0.92

---

## FINDING: silent degrade — read scope check swallow bypasses READ_SCOPE_VIOLATION gate, read proceeds unguarded
- layer: R21-lasme-engine
- predicate: engine.silentDegrade
- object: Gate
- file: hydra/aether-tools.ts:71
- evidence: "} catch (e) { void (e as Error).message; } } try { const text = fs.readFileSync(effectivePath, 'utf-8');"
- spec: src/hydra/aether-templates/hunters/lasme-engine.ts:10(d) UNGUARDED SIDE EFFECTS IN CRITICAL PATHS — catch must log+recover or propagate, never empty + lasme-engine.ts:10(a) UNGUARDED WRITES + src/hydra/aether-tools.ts:49-73 READ_SCOPE_VIOLATION gate
- severity: CRITICAL
- confidence: 0.89

---

## FINDING: silent degrade — grep scope check swallow bypasses READ_SCOPE_VIOLATION gate, grep proceeds unguarded
- layer: R21-lasme-engine
- predicate: engine.silentDegrade
- object: Gate
- file: hydra/aether-tools.ts:107
- evidence: "} catch (e) { void (e as Error).message; } } const maxResults = Math.min(p.maxResults ?? cap, cap);"
- spec: src/hydra/aether-templates/hunters/lasme-engine.ts:10(d) UNGUARDED SIDE EFFECTS IN CRITICAL PATHS + lasme-engine.ts:10(a) UNGUARDED WRITES + src/hydra/aether-tools.ts:85-108 grep scope gate
- severity: CRITICAL
- confidence: 0.88

---

## FINDING: silent degrade — per-gate roster write failure swallowed, audit evidence loss is silent
- layer: R21-lasme-engine
- predicate: engine.silentDegrade
- object: Contract
- file: hydra/aether-meta.ts:212
- evidence: "try { fs.writeFileSync(perGatePath, JSON.stringify(settledEntries, null, 2), 'utf-8'); } catch (e) { void (e as Error).message; }"
- spec: src/hydra/aether-templates/hunters/lasme-engine.ts:10(b) SILENT DEGRADE — write failure vanishes, caller believes audit succeeded + lasme-engine.ts:12(d) pipeline artifact generation is engine-critical path, FS writes must be guarded
- severity: HIGH
- confidence: 0.86

---

## FINDING: silent degrade — roster merge write swallowed, compat roster loss silent, no propagation to caller
- layer: R21-lasme-engine
- predicate: engine.silentDegrade
- object: Contract
- file: hydra/aether-meta.ts:238
- evidence: "} catch (ee) { void (ee as Error).message; } } const compatPath = path.join(root, 'roster.json');"
- spec: src/hydra/aether-templates/hunters/lasme-engine.ts:10(b) SILENT DEGRADE + lasme-engine.ts:12(d) engine-critical path side effect without error-path-first discipline
- severity: MEDIUM
- confidence: 0.82

---

## FINDING: unguarded side effect — module-level spy hook swallow hides agent-ledger corruption without observation
- layer: R21-lasme-engine
- predicate: engine.silentDegrade
- object: Contract
- file: hydra/aether-auditor.ts:92
- evidence: "try { globalThis.__aetherLedgerSpy(agent.ledger); } catch (e) { void (e as Error).message; }"
- spec: src/hydra/aether-templates/hunters/lasme-engine.ts:10(b) SILENT DEGRADE + lasme-engine.ts:12(d) catch must log+recover or propagate
- severity: LOW
- confidence: 0.71

---

## SUMMARY
7 findings — 2 CRITICAL, 3 HIGH, 1 MEDIUM, 1 LOW. The R21 engine predicate hunt investigated 7 candidates against the lasme-engine mandate. Three historical candidates (aether-tools.ts:23 logViolation, aether-auditor.ts:72 brief write, aether-auditor.ts:1 resolveTargetRoot) are now RED_HERRING/FIXED or intentional fallback-to-return and were not emitted. The 7 emitted findings are true defects: (1-2) the repair loop in `aether-auditor.ts:145-146` swallows `repair-prompt.md`/`repair-ledger.log` write failures with `void (ee as Error).message` — a corrupted repair prompt is a corrupted hunt, yet the code continues to re-invoke the agent with the same brief, never propagating `BRIEF_WRITE_FAILED`-style named error; (2) the read/grep scope gates in `aether-tools.ts:71,107` swallow scope-check failures and proceed to `fs.readFileSync`/`grep` without scope validation, bypassing the `READ_SCOPE_VIOLATION` confinement (security boundary degrade); (3) the meta runner in `aether-meta.ts:212,238` swallows `roster-*.json`/`roster.json` write failures, causing audit evidence loss with unconditional success (mirrors lasme-engine SHOT 2 pattern). Remediation per (d): every catch must (a) rethrow original error, (b) throw new named error wrapping it (e.g., `REPAIR_PROMPT_WRITE_FAILED: ${path} ${(e as Error).message} remedy: ensure ledger writable`), or (c) perform NAMED recovery with explicit fallback + observation (log/metric). Void-alone is insufficient. No container-deploy surface findings (no docker/volume mounts in `src/hydra/` — grep for `docker|volumeMount|resourceLimits` returned no production hits). All findings carry `explicit:` evidence quotes and spec anchors; intentional fallback patterns (`realResolve`, `resolveLedgerRoot`, `resolveTargetRoot`) were correctly excluded per w1-silent TRAP.


## R22 — R22-lasme-adapter
# R22lasme-adapter Hunt — Adapter Delegation Integrity

Method: Graph-first (query delegation patterns → path trace adapter→engine → file-verify), capped reads 320/grep 120, ledger-isolated.

## FINDING: dispatchSubagent snapshot merge discarded and delegation replaced by throw — parity violation
- layer: R22-lasme-adapter
- predicate: violates
- object: Adapter
- file: src/hydra/pipeline.ts:144
- evidence: "void tools; // tools assembled but unused — the primary path (runMetaLayer) bypasses this method"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:§2.1 adapter must delegate tool set to engine — assembled spread merge must be consumed, not voided
- severity: HIGH
- confidence: 0.92

## FINDING: aether-auditor builds 9-tool set then discards result — delegates to engine with divergent 5-tool set
- layer: R22-lasme-adapter
- predicate: violates
- object: Adapter
- file: src/hydra/aether-auditor.ts:94
- evidence: "buildAuditorTools(resolvedLedger, graph, targetRoot);"
- spec: src/hydra/aether-auditor.ts:divergences Q1-tools — assembled buildAuditorTools result must be delegated to AetherAgent, not used only for side-effects
- severity: HIGH
- confidence: 0.88

## FINDING: aether-meta builds meta tool set then discards — meta delegates to generic auditor tools losing graphify and append semantics
- layer: R22-lasme-adapter
- predicate: wraps
- object: Adapter
- file: src/hydra/aether-meta.ts:233
- evidence: "try { buildMetaTools(doc1Path, doc2Path, graph); } catch (e) { void (e as Error).message; }"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:§2.4 meta tools must include graphify×4+write_meta_doc+children_status — discarding buildMetaTools violates wrapper contract
- severity: HIGH
- confidence: 0.86

## FINDING: graph-mapper extract discards caller scope/exclude — adapter delegation loses filter intent, parity violation
- layer: R22-lasme-adapter
- predicate: violates
- object: Adapter
- file: src/hydra/graph-mapper.ts:74
- evidence: "void opts?.exclude;"
- spec: src/hydra/types.ts:63 GraphMapper.extract scope/exclude must be forwarded — adapter voiding params diverges from contract
- severity: MEDIUM
- confidence: 0.81

## SUMMARY
4 findings — 3 HIGH (delegation parity / stale delegation), 1 MEDIUM (snapshot filter loss). Pattern: adapter layer merges delegation state via spread (`[...graphifyTools, ...additionalTools]`, tool factories, graph handles) then discards it via `void` or throws `AETHER_MIGRATION`, delegating to a different engine factory with divergent contract. Graph mapper silently drops `scope`/`exclude` filters. All findings carry file:line+verbatim quote and spec clause; graph path `adapter→engine` traced via hydra pipeline.


## R23 — R23-lasme-mpse-threshold
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
