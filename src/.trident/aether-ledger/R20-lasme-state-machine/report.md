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
