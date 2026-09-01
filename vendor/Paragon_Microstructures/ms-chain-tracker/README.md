# ms-chain-tracker

## What
Per-session tool-call history and ChainRule evaluation engine. Records every tool call and result, detects loops, enforces prerequisite and forbidden-precedent chain rules. The tracking layer of the Paragon Tool Engine (PTA) — gives PTA memory of WHAT was called before the current call. Spec: MASTER_L1_SPEC §2 MS-04 + PTA_L2_SPEC §2.8.

## Import
```ts
import { ChainTracker } from './ms-chain-tracker/index.js';
const tracker = new ChainTracker();
tracker.recordCall('sid-123', 'bash', { command: 'bun test' });
tracker.recordResult('sid-123', 'bash', 0, 'ok');
tracker.wasCalled('sid-123', 'bash');
tracker.recentTools('sid-123', 5);
tracker.detectLoop('sid-123', 10);
tracker.evaluateRules('sid-123', 'bash', {}, rules);
```

## Interface
```ts
class ChainTracker {
  recordCall(sessionId: string, toolName: string, args: Record<string, unknown>): void;
  recordResult(sessionId: string, toolName: string, exitCode: number, output: string): void;
  wasCalled(sessionId: string, tool: string | RegExp, withinMs?: number): boolean;
  recentTools(sessionId: string, limit: number): Array<{ tool: string; at: number; exitCode?: number }>;
  detectLoop(sessionId: string, windowSize?: number): boolean;
  evaluateRules(sessionId: string, currentTool: string, currentArgs: Record<string, unknown>, rules: ChainRule[]): ChainViolation[];
}
interface ChainRule { name: string; description: string; requires?: { tool: string|RegExp; args?: Record<string,string|RegExp>; withinMs?: number }[]; forbids?: { tool: string|RegExp; withinMs?: number }[]; violation: { layerId: string; customMessage?: string } }
interface ChainViolation { ruleName: string; violationType: 'MISSING_PREREQUISITE'|'FORBIDDEN_PRECEDENT'|'LOOP_DETECTED'|'SEQUENCE_REVERSED'; expectedTool: string; actualContext: string; layerId: string }
interface CallRecord { tool: string; at: number; args?: Record<string, unknown>; exitCode?: number; output?: string }
```
- `recordCall` caps history at 100 ring-buffer per session; oldest evicted.
- `recordResult` attaches to most recent unresolved call for that session+tool pair; output capped 500 chars (truncated, never error).
- `wasCalled` with `withinMs` defaults to 0 meaning since session start (AP-5); 10-minute-old prerequisite still satisfies unless rule narrows window.
- `detectLoop` requires BOTH >=3 same tool in window AND <=1 unique completed output (x3 varying outputs = false; x2 = false).
- `evaluateRules`: requires[] AND-checked each unsatisfied -> MISSING_PREREQUISITE; forbids[] OR-checked any hit -> FORBIDDEN_PRECEDENT.

## Test
```sh
cd ms-chain-tracker && bun test
# 14 cases covering:
# - prerequisite satisfied vs missing (MISSING_PREREQUISITE with ruleName+layerId)
# - forbidden hit vs clean (FORBIDDEN_PRECEDENT)
# - loop x3 same output true, x3 varying false, x2 false, window edge false
# - history cap 100 eviction (101st evicts first)
# - output cap 500
# - wasCalled RegExp, withinMs expiry vs session-default
# - recordResult attaches to most recent unresolved
# - empty session clean returns
```

## Compose
Wire into PTA engine on every tool event:
```ts
tracker.recordCall(sid, toolName, args); // on tool.call.started
tracker.recordResult(sid, toolName, exitCode, output); // on tool.call.completed
const violations = tracker.evaluateRules(sid, toolName, args, layer.chainRules); // on tool.execute.before
if (tracker.detectLoop(sid)) violations.push({ ... LOOP_DETECTED });
```
Downstream: intent classifier reads violations for source2 confidence (0.8 if violated). Zero imports from sibling ms-* or v2 — self-contained.

## Error Paths
All methods validate inputs and throw with named messages on invalid args. `recordResult` on unknown session is no-op (not error) — the call may have been evicted. Empty catches banned; every catch logs or propagates.

## File Map
- `types.ts:1` — ChainRule, ChainViolation, CallRecord, ViolationType
- `index.ts:7` — ChainTracker class (HISTORY_CAP=100, OUTPUT_CAP=500)
- `chain-tracker.test.ts:1` — 14 adversarial cases

## Notes
Provenance: v2/machines/v2-machine.ts deadlock window pattern; stream-predicate-lexicon.ts excerpt cap pattern. No cross-MS imports. Standalone TypeScript.


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

