# ms-state-machine — 8-Transition Enforcement Escalation Lattice

## Purpose
The 8-transition lattice IDLE→MONITORING→PRIMED→INTERVENING tier 0-4 is the shared PBA-proven decision core ported to PTA's tool-event substrate. Purity (record in → record out, no I/O) makes it testable and portable.

## States
- IDLE: no signals yet; observation unconditional.
- MONITORING: counters accumulating; nothing emitted but evidence rows.
- PRIMED: a macro pattern fused (CHAIN_PATTERN_HIT). Next eligible INTERVENE triggers intervene.
- INTERVENING: directive dispatched; REFRACTORY 25 seq window until cool.

## Events
TOOL_SIGNAL, FIRST_TOOL_SIGNAL, CHAIN_PATTERN_HIT, INTERVENE, COMPLIANCE_VERIFIED, COMPLIANCE_FAILED, SEQ_WINDOW

## Transition Table (FIRST-MATCH-WINS, REARM FIRST is load-bearing)
1. rearm TOOL_SIGNAL INTERVENING→INTERVENING always — NEVER-TWICE law; a SIGNAL during refractory stays INTERVENING, counter bumped.
2. observe FIRST_TOOL_SIGNAL IDLE→MONITORING — first matching tool call lifts the machine.
3. accumulate TOOL_SIGNAL {MON,PRIM,INT}→MONITORING — subsequent matching calls accumulate; rearm shadows INT.
4. prime CHAIN_PATTERN_HIT MONITORING→PRIMED requires patternId or memberId anchor; without anchor no-op (not a fusable verdict).
5. intervene INTERVENE PRIMED→INTERVENING tier:=skipTier (esc>=3→3, esc>=2→2 else 1), deadline:=seq+5, directive appended with patternOrMember.
6. comply COMPLIANCE_VERIFIED INTERVENING→MONITORING tier:=0 denial:=0 esc-- if genuine else stays, probation deadline half-window if minimum, null if genuine, lastComplianceVerified:=true.
7. escalate COMPLIANCE_FAILED INTERVENING→INTERVENING tier++ (cap 4), denial++ at tier>=3, esc++ at tier>=2, deadline compressed window 5/2/0, lastComplianceVerified:=false.
8. cool SEQ_WINDOW INTERVENING→MONITORING requires advanced>=25 AND (no outstanding directive OR compliance verified).

## Escalation Memory
- escalationCount: lifetime count of tier≥2 escalations; genuine comply decrements by 1 (min 0); minimum comply stays.
- deadline table: count 0-1→5 (seq+6), count 2→2 (seq+3), count 3+→0 (seq+1 immediate).
- debounce: same table; guard not needed in simplified MS but deadline compression applies.
- skipTier: count≥2 + minimum comply → start tier 2; count≥3 → tier 3.
- genuine vs minimum: Genuine = isGenuine true or instrument==='trident-problem-solving' → clean slate; Minimum = tool called exit0 no artifact → probation.

## API
```ts
import { step, createInitialRecord } from './src/index.js';
let r = createInitialRecord();
r = step(r, 'FIRST_TOOL_SIGNAL');
r = step(r, 'CHAIN_PATTERN_HIT', { patternId: 'SMOKE' });
r = step(r, 'INTERVENE', { patternId: 'SMOKE' });
r = step(r, 'COMPLIANCE_FAILED');
r = step(r, 'COMPLIANCE_VERIFIED', { isGenuine: true });
```

## Architecture (IntelligenceLexicon-Edition-v1.0)

| Component | File | Purpose |
|---|---|---|
| Core types | `src/core/types.ts` | BehaviorState, BehaviorRecord, MachineEvent, StepPayload |
| Core engine | `src/core/engine.ts` | step() pure function, constants ESCALATION_DEADLINE_WINDOW 5, REFRACTORY 25 |
| Machines | `src/machines/transitions.ts` | 8-transition declarative table as data (TRANSITIONS, STATES) |
| Machines index | `src/machines/index.ts` | Re-export transition configs |
| Entry | `src/index.ts` | Public entry re-exporting from src/core/ + src/machines/ |
| Tests | `tests/properties.ts` | 500-run determinism property tests (fixed-seed PRNG, no fast-check) |
| Tests | `tests/per-machine.test.ts` | Per-transition behavior tests |
| Legacy tests | `state.test.ts` | 15 original cases (preserved) |

## How to integrate (copy-and-customize)

```
1. cp -r ms-state-machine <your-plugin>/my-state-machine
2. Add your transition: edit src/machines/transitions.ts — add entry to TRANSITIONS array
   (id, event, from[], to, guard description) — order is load-bearing, rearm FIRST.
3. Add your constant: edit src/machines/transitions.ts — ESCALATION_DEADLINE_WINDOW, REFRACTORY_SEQ_WINDOW
4. Wire: src/index.ts re-exports from src/core/ — add your new machine import there
5. Implement: src/core/engine.ts — add the transition's apply/guard logic in step() at correct position
6. Test: bun test (per-machine + 500-run properties) + tsc --noEmit
7. Customize: update src/core/types.ts for new BehaviorState or StepPayload fields
```

## Purity Contract
step is PURE — no side effects, no I/O, no global state. Every call returns a new BehaviorRecord; input is never mutated. Counters bump on family payload via bumpCounter. seq increments exactly 1 per successful transition; no-ops return identical record.

## Error Handling
Invalid transitions are no-ops (return same record, seq unchanged). Missing anchors guard prime. Tier cap 4 prevents overflow. Empty/null/undefined payload does not throw. Every catch propagates — no silent continuation.

## Testing
- Original: 15 cases covering every transition, rearm-first proof, tier 1→4, genuine/minimum, cool gate, no-ops, purity
- New: tests/per-machine.test.ts — 11 per-machine cases (each transition fires + no-op) + 500-run determinism
- New: tests/properties.ts — 500 runs pure TS loop, mulberry32 fixed seed, same input→same verdict, sequential stability

## Invariants
- REARM FIRST shadows accumulate for INTERVENING — order is doctrine, not preference.
- seq increments exactly 1 per successful transition; no-ops do not increment.
- ComplianceDeadlineSeq compressed per escalationCount (5/2/0).
- Directives grow only on intervene; tier resets only on comply.
- DenialCount increments only at tier≥3; escalationCount at tier≥2.

## Provenance
Vendored lattice from v2/machines/v2-machine.ts lines 56-122 (frozen reference) — step() first-match-wins, withTriad I2, rearm-before-accumulate. Simplified BehaviorRecord without triads but identical 8-transition semantics.

## File Map
- src/core/types.ts: BehaviorState union, BehaviorRecord interface, MachineEvent union, StepPayload, createInitialRecord helper
- src/core/engine.ts: step() pure function, constants ESCALATION_DEADLINE_WINDOW 5, REFRACTORY_SEQ_WINDOW 25, bumpCounter helper
- src/machines/transitions.ts: TRANSITIONS declarative table, ESCALATION_DEADLINE_WINDOW, REFRACTORY_SEQ_WINDOW, STATES
- src/machines/index.ts: re-export transition configs
- src/index.ts: public entry re-exporting from src/core/ + src/machines/
- tests/properties.ts: 500-run determinism (runProperties, fixed-seed mulberry32, sequential stability)
- tests/per-machine.test.ts: 11 per-machine cases proving each transition fires + no-ops
- state.test.ts: 15 original green cases (preserved)
- README.md: this file

## Integration
Plan 2 engine calls step() on every tool event and routes resulting tier through ms-warhead-dispatcher to correct surface (TEA/TEB/GATE). Evidence gates verdict (PASS/FAIL) drives COMPLIANCE_VERIFIED vs COMPLIANCE_FAILED transitions.

## Anti-Patterns Killed
No theatrical code, no empty catches, no console-only handlers, no success-without-side-effect, no hardcode fitted to oracle — every value computed from data (tier arithmetic, deadline compression).

## Constraints
Zero cross-MS imports (grep check). Zero v2 imports (standalone TypeScript). Do NOT touch other ms-* dirs or root config. Bun for everything.

## Verification
- bun test ms-state-machine → 26 pass (15 original + 11 per-machine/properties)
- bunx tsc --noEmit --project ms tsconfig → 0 errors from this dir
- ls ms-state-machine/src/index.ts → exists

## Future Extensions
- Per-sid persistence via ms-persistence (pta-state-<sid>.json atomic tmp+rename)
- λ-synapse integration for synapse-driven prime (threshold crossing fires CHAIN_PATTERN_HIT)
- Dial FULL/STEER/OFF gating (currently unconditional monitoring)

## References
- MASTER_L1_SPEC §2 MS-07 + §3 surfaces
- PTA_L2_SPEC §2.9 state machine, §2.11 evidence gates
- IntelligenceLexicon-Edition-v1.0 — Registry → machines → hooks pattern
- v2-machine.ts (472L proven reference, lines 56-122 frozen)

## License
Private — paragon-microstructures, Paragon V3 Tool-Chain Algorithms.

## Appendix: Example Trajectories
Trajectory A full ladder: IDLE --FIRST_TOOL_SIGNAL--> MON --CHAIN_PATTERN_HIT--> PRIMED --INTERVENE--> INTERVENING(tier1) --COMPLIANCE_FAILED--> INTERVENING(tier2) --COMPLIANCE_FAILED--> INTERVENING(tier3) --COMPLIANCE_FAILED--> INTERVENING(tier4) --COMPLIANCE_VERIFIED(genuine)--> MON(tier0).
Trajectory B rearm: INTERVENING --TOOL_SIGNAL--> INTERVENING (seq+1, counter bumped, not MONITORING).
Trajectory C cool: INTERVENING --SEQ_WINDOW(advanced:25)--> MON only if lastComplianceVerified true or no directives.
Trajectory D escalation memory: second offense after genuine→minimum split starts tier 2 not 1.

## Changelog
- v1.1 2026-08-31 IntelligenceLexicon restructure: src/ tree, 8-transition data table, 500-run properties, per-machine tests
- v1.0 2026-08-31 initial 8-transition lattice, 15 tests, REARM-FIRST verified.

## Contact
Paragon V3 Tool-Chain Algorithms — MS-07 State Machine.
