# TRIDENT PBA/PTA INTEGRATION — WAVE PLAN (Plan 2 of 3)
WAVES: 3

## TARGET (verbatim success criteria from PBA_PTA_PARALLEL_BUILD_MASTER_L1_SPEC.md)
- T-1: PTA engine wired into v4.4.3 (bridge + hooks working) — DONE (Wave 1, 15/0 verified)
- T-2: God loop running on PTA layers (enterPhase integration live)
- T-3: All 7 firewalls replaced by PTA layers
- T-4: Container test passed (Phase-E 10/10 + S-01..S-18)

## BASELINE (verified state)
- B-1: v4.4.3 exists with god loop (god-loop.ts 2364L, 13 phases)
- B-2: PTA engine DONE at v4.4.3/src/pta/engine.ts (15/0 verified)
- B-3: 12 microstructures built (232/0, IntelligenceLexicon boilerplate standard)
- B-4: poseidon-enforcer-hook.ts (434L) to be replaced by layers

## FORWARD WAVES

### Wave 2 — GOD LOOP + FIREWALL LAYERS [depends: Wave 1 DONE]
Gate: `ls src/pta/layers/god-loop/*.layer.json | wc -l` → ≥8 AND `ls src/pta/layers/tool-firewalls/*.layer.json | wc -l` → ≥7

| Subagent | Files (disjoint) | Micro-tasks | Gate | Oracles |
|---|---|---|---|---|
| god-loop-layers | src/pta/layers/god-loop/*.json, src/poseidon/god-loop.ts (modified) | 8+ phase layer JSONs + enterPhase() integration + remove old enforcer/watcher/kick imports | 8+ layer files + enterPhase wired | OR-4,5,7 |
| firewall-layers | src/pta/layers/tool-firewalls/*.json | 7 firewall replacement layer JSONs | 7 layer files | OR-6 |

### Wave 3 — CONTAINER TEST [depends: Wave 2]
Gate: Phase-E circuit breaker 10/10

| Subagent | Files (disjoint) | Micro-tasks | Gate | Oracles |
|---|---|---|---|---|
| container-test | .trident/container-test-results-pta.json | Full god loop + scenario rolodex S-01..S-18 in container | Phase-E 10/10 + artifact | OR-8,9 |

## THE ORACLE TABLE (§O) — PLAN 2
| OR-n | Type | Description | Command | Expected |
|---|---|---|---|---|
| OR-1 | O2 | PTA engine compiles | `cd v4.4.3 && npx tsc --noEmit` | 0 errors |
| OR-2 | O2 | PTA engine instantiates | `grep -c "ParagonToolEngine" v4.4.3/src/pta/engine.ts` | ≥1 |
| OR-3 | O2 | Bridge wired | `grep -c "pbaBridge.onPbaSignal" v4.4.3/src/pta/` | ≥1 |
| OR-4 | O2 | God loop layers exist | `ls v4.4.3/src/pta/layers/god-loop/*.layer.json` | ≥8 files |
| OR-5 | O2 | enterPhase integration | `grep -c "pta.activateLayer" v4.4.3/src/poseidon/god-loop.ts` | ≥1 |
| OR-6 | O2 | Firewall layers exist | `ls v4.4.3/src/pta/layers/tool-firewalls/*.layer.json` | ≥7 files |
| OR-7 | O2 | Enforcer hook replaced | `grep -c "PTA" v4.4.3/src/hooks/poseidon-enforcer-hook.ts` | ≥1 (or file removed) |
| OR-8 | O3 | Container test artifact | `cat v4.4.3/.trident/container-test-results-pta.json` | exists + PASS |
| OR-9 | O1 | Zero regressions on PBA | `cd v4.4.2-baseline/src/tests && bun test` | 1457/0 unchanged |

## COVERAGE MAP
- T-1 → Wave 1 (pta-engine, DONE 15/0 verified)
- T-2 → Wave 2 (god-loop-layers)
- T-3 → Wave 2 (firewall-layers)
- T-4 → Wave 3 (container-test)
