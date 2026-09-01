# DECIDE 0 — the finding triage

## FINDINGS FROM THE AUDIT + THE LIVE RUNS

F-1: extractJSON dead code at src/hydra/pipeline.ts:131 — the old chat-JSON engine's parser, orphaned by A4. In-degree 0.
SELECTION: fix — delete the dead method (the SRO dead-code hunter found it; it's confirmed dead).

F-2: god-loop.ts:2278 writeStateAtomic silent degrade — catch logs but doesn't rethrow; the loop continues on stale state.
SELECTION: fix — rethrow after log (the CRITICAL finding from the aether audit, confirmed by the orchestrator).

F-3: The toast targeting — the calling-session fix (context.sessionID) landed in dist 4a60ac25 but is NOT yet live-verified.
SELECTION: defer to container-test wave (verify in the container, then live).

F-4: The runner-side tagging — unit-proven (tags==candidates fixture) but the live shared.db typed_edges count needs the current run's completion to verify.
SELECTION: defer to verify wave (the run in flight will mint the tags; count them at harvest).

F-5: The SRO correlations table — computes from tags; depends on F-4.
SELECTION: defer to verify wave.

F-6: The legacy noise — purge executed (4598→2018, -56%), the remaining ~2018 are the fix-semantics survivors + the calibrated founding lexicons. The diagnose desk projected ~1,100; the MEASURED is 2018 — the delta is the fix-semantics rules' survivors (higher than the conservative estimate, honest).
SELECTION: triage — accept the measured number as the honest baseline (the diagnosis doc's constraint: the measured number replaces the estimate; wave 3's live run IS the measurement).

## THE WAVE-0 SCOPE
The two fixes (F-1 dead code, F-2 silent degrade) are surgical, disjoint, and mechanically verifiable. Dispatch 2 build agents. F-3/F-4/F-5 defer to the verify wave. F-6 is accepted as measured.
