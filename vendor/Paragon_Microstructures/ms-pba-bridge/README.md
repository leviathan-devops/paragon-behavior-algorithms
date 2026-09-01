# ms-pba-bridge

## What
One-directional PBA signal receiver for PTA. Receives PBA reasoning signals and state changes, buffers them per session, computes layer pre-arming targets and escalation correlation. The bridge is a BOOST not a dependency — PTA works standalone with zero signals. Spec: MASTER_L1_SPEC §2 MS-05 + PTA_L2_SPEC §2.5. Doctrine: R5 one-directional PBA->PTA, AP-3 boost not dependency.

## Import
```ts
import { PbaBridgeImpl, correlateEscalation } from './ms-pba-bridge/index.js';
const bridge = new PbaBridgeImpl();
bridge.registerLayer({ layerId: 'SMOKE_SUBSTITUTION', pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 } });
bridge.onPbaSignal({ family: 'TEST_EVASION', confidence: 0.75, excerpt: 'let me just get this working', seq: 5, sessionId: 's1' });
bridge.onPbaStateChange({ tier: 2, escalationCount: 1, activeFamilies: ['TEST_EVASION'], lastWarheadBody: null, sessionId: 's1' });
bridge.getRecentSignals('s1', 10);
bridge.getActiveFamilies('s1');
bridge.getMacroTier('s1');
bridge.getLayersToPrearm('TEST_EVASION');
correlateEscalation(ptaNaturalTier, pbaMacroTier);
```

## Interface
```ts
class PbaBridgeImpl {
  registerLayer(config: LayerBoostConfig): void;
  registerLayers(configs: LayerBoostConfig[]): void;
  onPbaSignal(signal: PbaSignal): void;
  onPbaStateChange(state: PbaStateChange & { sessionId?: string }): void;
  getRecentSignals(sessionId: string, limit: number): PbaSignal[];
  getActiveFamilies(sessionId: string): string[];
  getMacroTier(sessionId: string): number;
  getLayersToPrearm(family: string): PrearmTarget[];
  getEscalationCount(sessionId: string): number;
}
interface PbaSignal { family: string; confidence: number; excerpt: string; seq: number; sessionId: string }
interface PbaStateChange { tier: number; escalationCount: number; activeFamilies: string[]; lastWarheadBody: string|null }
interface PrearmTarget { layerId: string; boostAmount: number }
interface LayerBoostConfig { layerId: string; pbaContextBoost?: { families: string[]; boostAmount: number } }
function correlateEscalation(ptaNaturalTier: number, pbaMacroTier: number): number;
```
- Ring buffer last 20 signals per session; oldest evicted past 20.
- `onPbaSignal` stores and enables prearm computation; never emits to PBA.
- `getLayersToPrearm(family)` computes which registered layers have family in pbaContextBoost.families and returns [{layerId, boostAmount}]; caller applies synapse boost — bridge never mutates synapse.
- `correlateEscalation = Math.max(ptaNaturalTier, pbaMacroTier>=3?2:pbaMacroTier>=2?1:0)` pin table: pba 0->0,1->0,2->1,3->2,4->2.
- Standalone mode: zero signals -> all queries return empty/0 without throw.

## Test
```sh
cd ms-pba-bridge && bun test
# 9 cases covering:
# - signal stored + retrievable via getRecentSignals
# - ring buffer evicts past 20 (21st evicts first)
# - active families tracked from onPbaStateChange
# - macroTier tracked
# - getLayersToPrearm returns exactly matching layers with boostAmount
# - correlateEscalation pin table (pba 0/1/2/3/4 -> floor 0/0/1/2/2, plus max with pta tier)
# - standalone mode (no signals -> empty/0 no error)
# - session isolation (s1 vs s2 separate buffers)
# - limit respected (slice -limit)
```

## Compose
Wire once at engine construction; PBA feeds bridge on every signal/stateChange:
```ts
pba.onSignal(s => bridge.onPbaSignal(s));
pba.onStateChange(s => bridge.onPbaStateChange({ ...s, sessionId }));
// Intent classifier queries:
const recent = bridge.getRecentSignals(sid, 10); // enrich text blob for 4-bank scan
const pbaTier = bridge.getMacroTier(sid); // for correlateEscalation
const prearms = bridge.getLayersToPrearm(signal.family); // for synapse boostBaseline
// Correlated tier:
const tier = correlateEscalation(ptaNatural, bridge.getMacroTier(sid));
```
Plan 2 engine wires getLayersToPrearm -> ms-synapse boostBaseline.

## Error Paths
All methods validate inputs; invalid signal/session throws named error. Queries on unknown session return empty/0 (never throw). No empty catches. One-directional: no method emits outward.

## File Map
- `types.ts:1` — PbaSignal, PbaStateChange, PrearmTarget, LayerBoostConfig, PbaBridge
- `index.ts:6` — PbaBridgeImpl + correlateEscalation (RING_CAP=20)
- `pba-bridge.test.ts:1` — 9 cases including pin table + standalone

## Notes
Reference: v2/lexicons/stream-predicate-lexicon.ts signal shape (memberId/plane/excerpt/anchor/weight). No cross-MS imports.


## Adversarial Cases
- empty session: no calls yet -> wasCalled false, recentTools [], detectLoop false, evaluateRules [].
- null/invalid args: recordCall with empty toolName throws; recordResult with non-string output throws.
- concurrent sessions: s1 and s2 isolated; calls in s1 invisible to s2 queries.
- boundary: history exactly 100 retains all; 101 evicts first; limit 0 returns [].
- withinMs: 0 means session start (AP-5); explicit window filters by Date.now()-withinMs.
- loop edge: windowSize narrower than loop history -> false when loop outside window.
- output truncation: 501 chars -> 500; 500 exact -> 500; empty output handled.

## Verification
```
ls ms-chain-tracker/index.ts ms-pba-bridge/index.ts ms-escalation-memory/index.ts
bun test # per dir
bunx tsc --noEmit # 0 errors
grep -r "from '../ms-" ms-*/ # 0 matches
wc -l ms-*/README.md # each >=100
```

## Change Log
- v1.0 initial standalone implementation per MASTER_L1_SPEC + PTA_L2_SPEC §2.8/2.5.
- No cross-MS imports; no v2 imports; pure TypeScript strict.

## References
- MASTER_L1_SPEC §2 MS-04/05/06
- PTA_L2_SPEC §2.5 bridge, §2.8 chain tracker
- v2/machines/v2-machine.ts escalation arithmetic (read-only reference)
- v2/lexicons/stream-predicate-lexicon.ts signal shape (read-only reference)

## License
Private — Paragon_Microstructures boilerplate.

## Ownership
Orchestrator owns package.json + tsconfig.json; this ms-* owns its own index.ts/types.ts/tests/README.md. Zero cross-MS deps.


## IntelligenceLexicon-Edition-v1.0 — Boilerplate Upgrade (Restructure, NOT Rewrite)

This microstructure was upgraded to the IntelligenceLexicon-Edition-v1.0 boilerplate standard. All algorithms, constants, and pinned values are preserved EXACTLY as in v1.0 — only the file layout was restructured.

### Architecture (Lexicon-Edition)

| Component | File | Purpose |
|---|---|---|
| Registry/Core | `src/core/engine.ts` + `src/core/types.ts` | ChainTracker / PbaBridge / EscalationMemory — the algorithm (moved verbatim from root index.ts+types.ts) |
| Entry | `src/index.ts` | Public entry re-exporting from `src/core/` |
| Machines | `src/machines/index.ts` | Pattern families / bank configs as data (pinned rule templates, tables) |
| Hooks | `src/hooks/` | Bridge wiring hook (ms-pba-bridge only — PBA→PTA one-directional) |
| Tools | `src/tools/` | Telemetry status tool (per-session block counts, history length) |
| Tests (determinism) | `tests/properties.ts` | 500-run determinism: same input → same verdict, pure TS LCG loop, fixed seeds, NO fast-check |
| Tests (per-machine) | `tests/per-machine.test.ts` | Per-machine must-fire + must-suppress + pin tables |
| Legacy | `index.ts` / `types.ts` (root) + `*.test.ts` (root) | Backward-compat shims re-exporting from `src/` — PRESERVED, 143/0 floor intact |

### Copy-and-customize (how to integrate)

```
1. cp -r IntelligenceLexicon-Edition-v1.0 <your-plugin>/lexicon
2. cp -r ms-chain-tracker/src <your-plugin>/chain-tracker/src   # or pba-bridge / escalation-memory
3. Register machines: import { CHAIN_BANKS } from './src/machines/index.js' (or BRIDGE_FAMILIES, DEADLINE_TABLE) into your registry
4. Wire hooks: ms-pba-bridge: import { wireBridgeHooks } from './src/hooks/bridge-hook.js' — onPbaSignal/onPbaStateChange ingress + getRecentSignals/getLayersToPrearm query surface
5. Wire tools: import { createChainStatusTool } from './src/tools/chain-status.js' (or bridge-status / escalation-status) — telemetry for diagnostics
6. Test: bun test (existing 14/9/8 + new per-machine + 500-run properties) — 143/0 battery floor must NOT shrink
7. Build: bun build src/index.ts --outdir dist (with @opencode-ai/plugin external if you wrap as plugin)
```

### File Map (Lexicon-Edition)

- `src/core/engine.ts` — canonical algorithm (HISTORY_CAP=100 OUTPUT_CAP=500 / RING_CAP=20 / deadline 5/2/0)
- `src/core/types.ts` — ChainRule/ChainViolation/CallRecord / PbaSignal/PbaStateChange / EscalationState
- `src/machines/index.ts` — CHAIN_BANKS / BRIDGE_FAMILIES+CORRELATE_TABLE / DEADLINE_TABLE+SKIP_TIER_TABLE as data
- `src/index.ts` — public re-export (entry)
- `tests/properties.ts` — 500-run determinism (LCG seeded, same input→same verdict)
- `tests/per-machine.test.ts` — per-machine behavior + pin tables + properties smoke
- `index.ts` (root) — shim `export * from './src/core/engine.js'` (backward compat)
- `types.ts` (root) — shim type re-export (backward compat)

### Determinism Guarantee

`tests/properties.ts` runs 500 iterations with fixed LCG seeds (NO fast-check). Each iteration creates two fresh instances, feeds identical inputs, and asserts identical verdicts + idempotence. If determinism fails, the microstructure is theater (a firewall that sometimes fires is not a firewall).

### Why Hooks/Tools only where they exist

- **ms-pba-bridge** has a hook surface (PBA signal ingress → bridge store → intent-classifier query surface). The hook (`src/hooks/bridge-hook.ts`) is the one-directional PBA→PTA wiring.
- **ms-chain-tracker** and **ms-escalation-memory** have no chat.message/tool.before hook — their enforcement is via the PTA engine's call history / escalation memory, not a direct hook. They still expose a `src/tools/*-status.ts` telemetry tool.

