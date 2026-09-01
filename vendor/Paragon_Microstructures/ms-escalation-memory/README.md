# ms-escalation-memory

## What
Repeat-offender pressure system. Counts escalations, compresses deadlines, escalates skip-tier, distinguishes genuine vs minimum compliance. The DEADLINE DOCTRINE DONT BE GENEROUS: count 3+ means window 0 immediate and start at tier 3; genuine compliance (demanded tool + artifact) is the ONLY decrement. Spec: MASTER_L1_SPEC §2 MS-06; proven arithmetic in v2/machines/v2-machine.ts.

## Import
```ts
import { computeDeadline, computeSkipTier, onEscalate, onComplyGenuine, onComplyMinimum, createInitialState } from './ms-escalation-memory/index.js';
computeDeadline(2); // -> 2
computeSkipTier(3); // -> 3
let s = createInitialState();
s = onEscalate(s);
s = onComplyGenuine(s); // decrements floor 0
s = onComplyMinimum(s); // keeps count
```

## Interface
```ts
interface EscalationState { escalationCount: number; lastEscalationSeq: number; deadlineWindow: number; debounceWindow: number; skipTierLevel: number }
function computeDeadline(escalationCount: number): number;
function computeSkipTier(escalationCount: number): number;
function createInitialState(): EscalationState;
function onEscalate(state: EscalationState, atSeq?: number): EscalationState;
function onComplyGenuine(state: EscalationState): EscalationState;
function onComplyMinimum(state: EscalationState): EscalationState;
```
Tables:
- `computeDeadline`: 0-1 -> 5, 2 -> 2, 3+ -> 0.
- `computeSkipTier`: 0-1 -> 0, 2 -> 2, 3+ -> 3.
- `onEscalate`: count++, deadline/skip recomputed, lastEscalationSeq bumped.
- `onComplyGenuine`: count-- floor 0, windows recomputed.
- `onComplyMinimum`: count unchanged, windows recomputed (holds pressure).
- All derived fields (deadlineWindow, debounceWindow, skipTierLevel) recomputed from count on every transition; no stale state.

## Test
```sh
cd ms-escalation-memory && bun test
# 8 cases covering:
# - deadline table 5/2/0 at counts 0,1,2,3,10 pinned
# - skipTier 0/0/2/3 at 0,1,2,3,10 pinned
# - onEscalate increments with deadline/skip update
# - genuine comply decrements 3->2 with window update
# - minimum comply keeps 3->3
# - floor at 0 (genuine at 0 stays 0)
# - derived fields update on every transition (5 escalates -> 0/3)
# - invalid inputs throw (negative, NaN, null state)
```

## Compose
Feeds state machine intervene/escalate transitions at T1:
```ts
let mem = createInitialState();
mem = onEscalate(mem); // on COMPLIANCE_FAILED escalate path
mem = onComplyGenuine(mem); // on COMPLIANCE_VERIFIED genuine
mem = onComplyMinimum(mem); // on minimum comply
const window = computeDeadline(mem.escalationCount); // deadline seq+window
const startTier = computeSkipTier(mem.escalationCount); // intervene tier
```
Engine stores one EscalationState per session; pure functions — no hidden mutation.

## Error Paths
All functions validate finite non-negative count; invalid throws. Null state throws. No empty catches. Values computed from data, never hardcoded per test oracle.

## File Map
- `types.ts:1` — EscalationState
- `index.ts:1` — computeDeadline, computeSkipTier, createInitialState, onEscalate, onComplyGenuine, onComplyMinimum
- `escalation-memory.test.ts:1` — 8 pinned cases

## Notes
Arithmetic mirrors v2-machine.ts lines 365-369 + 288-291 + 316-324 proven live. No cross-MS imports.


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

