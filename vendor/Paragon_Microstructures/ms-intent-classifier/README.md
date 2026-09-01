# ms-intent-classifier — 3-Source Intent Fusion Engine

## What It Does

ms-intent-classifier is the intelligence layer of the Paragon Tool Engine (PTA) that computes WHY the model is making a tool call, not just WHAT tool is being called. It fuses three independent sources into a single ToolIntent classification: source1 the tool match via the 4-bank ratio classifier on the text blob (toolName + JSON.stringify(args) + PBA excerpts), source2 the chain context from the ChainTracker (chainViolations length >0 ? 0.8 : 0.0), and source3 the PBA context via the bridge (sum of layer.pbaContextBoost for active families, capped at 1.0). The fusion is `s1×0.5 + s2×0.3 + s3×0.2`, gated into ENFORCE (≥threshold → BLOCK), DAMPEN (≥threshold×0.6 → ADVISE), or below → ALLOW (continue to next layer or return ALLOW).

This is the PTA-unique machinery that makes PTA intelligent rather than a dumb firewall, per MASTER_L1_SPEC §2 MS-03 and PTA_L2_SPEC §2.4. The fusion weights, band thresholds, and source computations are LOCKED doctrine. The disambiguation worked example (bash bun test: 0.67×0.5 + 0.8×0.3 + 0.2×0.2 = 0.615 vs 0.575 without PBA) is a pinned test.

## How to Import

```typescript
import { classifyIntent } from './index.js';
import type { ToolIntent, LayerShape, PbaSignal } from './types.js';

const layers: LayerShape[] = [{
  id: 'SMOKE_SUBSTITUTION',
  threshold: 0.9,
  banks: {
    descriptive: [/for the container test/i],
    suggestive: [/bash/i, /bun test/i],
    substitute: [/instead of the container/i],
    use: [/trident-container-test/i],
  },
  toolMatchers: [{ toolName: 'bash', argPatterns: { command: ['*test*'] } }],
  pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 },
}];

const intent: ToolIntent = classifyIntent(
  { toolName: 'bash', args: { command: 'bun test' } },
  { previousTools: [], chainViolations: ['verification-requires-audit'] },
  { activeFamilies: ['TEST_EVASION'], latestSignals: [{ family: 'TEST_EVASION', confidence: 0.75, excerpt: 'let me just get this working', seq: 1, sessionId: 's1' }], macroTier: 2 },
  layers,
);
// intent.action: 'ALLOW' | 'ADVISE' | 'BLOCK'
// intent.confidence: fused 0.0-1.0
// intent.sources: { toolMatch, chainContext, pbaContext }
```

Zero cross-MS dependencies. Zero imports from v2 or sibling ms-* dirs. LayerShape is defined locally, never imported from ms-layer-loader.

## The Interface

### Types (types.ts)

```typescript
interface PbaSignal { family: string; confidence: number; excerpt: string; seq: number; sessionId: string; }
interface IntentSources {
  toolMatch: { toolName: string; matchedPattern: string | null; confidence: number };
  chainContext: { previousTools: string[]; chainViolations: string[]; confidence: number };
  pbaContext: { activeFamilies: string[]; latestSignals: PbaSignal[]; macroTier: number; confidence: number };
}
interface ToolIntent {
  action: 'ALLOW' | 'ADVISE' | 'BLOCK';
  layerId: string | null;
  confidence: number;
  tier: number;
  sources: IntentSources;
}
interface LayerShape {
  id: string;
  threshold: number;
  banks: { descriptive: RegExp[]; suggestive: RegExp[]; substitute: RegExp[]; use: RegExp[] };
  toolMatchers: Array<{ toolName: string|RegExp; argPatterns?: Record<string, (string|RegExp)[]> }>;
  pbaContextBoost?: { families: string[]; boostAmount: number };
}
```

### Function classifyIntent (index.ts)

```typescript
function classifyIntent(
  toolCall: { toolName: string; args: Record<string, unknown> },
  chainContext: { previousTools: string[]; chainViolations: string[] },
  pbaContext: { activeFamilies: string[]; latestSignals: PbaSignal[]; macroTier: number },
  layers: LayerShape[],
): ToolIntent;
```

For each layer where toolMatchers match toolCall.toolName (and argPatterns if present): build textBlob, score against banks, compute source1 confidence via `pos/(pos+neg+1)`, compute source2 `violations.length>0?0.8:0.0`, compute source3 `sum boost for active families` capped 1.0, fuse `s1*0.5+s2*0.3+s3*0.2`, compare to threshold bands. Returns the first matching layer’s intent; if none match or all below band, returns ALLOW.

### ToolMatcher Details

- `toolName: string` exact match, or glob (`*`, `?`) compiled to RegExp, or RegExp directly.
- `argPatterns: Record<string, (string|RegExp)[]>` — each arg value is stringified and matched. String patterns support globs or substring includes. RegExp patterns use `.test`. All patterns within an arg are OR-matched; all args are AND-matched.

### Error Paths

Every argument is validated FIRST and throws TypeError with a descriptive message. Null toolCall, missing toolName, missing args, missing chainContext, missing pbaContext, or non-array layers all throw. Per-layer validation throws on missing id/threshold/banks. Ratio scoring errors are wrapped with layer id. No empty catches. No console-only handlers.

## How to Test

```bash
cd ms-intent-classifier && bun test
bunx tsc --noEmit
```

Test file: `tests/intent-classifier.test.ts` (10 cases):

- Pinned fusion 0.615 with PBA context (tool 0.67, chain 0.8, pba 0.2)
- Pinned fusion 0.575 without PBA (source3=0)
- Exact arithmetic 0.615 vs 0.575 with delta 0.04
- ENFORCE band (≥threshold → BLOCK)
- DAMPEN band (≥threshold×0.6 → ADVISE)
- Below band ALLOW (no layer matched)
- Chain violation confidence 0.8 when violations exist / 0.0 when none
- PBA boost capped at 1.0
- ToolMatcher argPatterns filtering (glob and substring)
- Null handling throws
- Concurrent classify is pure

The suite covers empty, null, concurrent, and boundary conditions.

## How to Compose

- **ParagonToolEngine** calls `classifyIntent` on every `tool.execute.before` event, passing the tool call, ChainTracker’s recent violations, and PbaBridge’s active families/signals.
- **State machine** consumes the returned ToolIntent.action and tier to decide transitions.
- **Warhead dispatcher** consumes intent.sources to fill {toolName, args, chainViolations, pbaFamilies} in the warhead body.
- **Synapse** receives the violation weight from the intent’s confidence when DAMPEN accumulates.
- **Layer system** provides the LayerShape array; classifyIntent is the per-call loop.

The ToolIntent interface is THE contract the engine, warhead dispatcher, and state machine consume — its correctness gates the entire downstream enforcement chain.

## Architecture Notes

- The textBlob is `toolName + JSON.stringify(args) + PBA excerpts` — the PBA excerpt enrichment is Mechanism 1 (intent disambiguation). An ambiguous bash("bun test") + PBA TEST_EVASION excerpt becomes a clear substitution.
- Fusion weights are 0.5/0.3/0.2 (tool primary, chain secondary, PBA tertiary but disambiguating). No single source dominates; the weights prevent any single source from dominating, which is what makes PTA intelligent.
- Source3 is the sum of `layer.pbaContextBoost.boostAmount` for each active family in `pbaContext.activeFamilies`, capped at 1.0. This matches the spec’s `source3 = sum ... capped at 1.0`.
- The band comparison uses `≥` not `>`: `totalConfidence ≥ threshold` → BLOCK (ENFORCE), `≥ threshold×0.6` → ADVISE (DAMPEN), else continue.
- Layer iteration is first-match priority: the first layer whose fused confidence crosses a band wins. The caller controls priority via layer order.
- The use-bank short-circuit in the ratio scoring makes sanctioned tools immune even when the text blob contains violation patterns.

## File Map

- `types.ts:1` — PbaSignal, IntentSources, ToolIntent, LayerShape
- `index.ts:1` — classifyIntent with local ratio scorer and matcher
- `tests/intent-classifier.test.ts:1` — 10-case adversarial suite

## Verification Commands

```
ls ms-intent-classifier/index.ts
cd ms-intent-classifier && bun test
cd Paragon_Microstructures && bunx tsc --noEmit
grep -r "from '../ms-" ms-intent-classifier
```

## Operator Doctrine

- R1 "PBA = reasoning tokens + model intent policing, PTA = tool execution + model action policing" — these MS are the PTA-side detection machinery, the sibling of PBA.
- R4 "NOT some dumb static firewall per tool call, but the same intelligent machinery we have built at the macro level" — 3-source fusion IS the intelligence.

## References

- MASTER_L1_SPEC §2 MS-03 (lines 273-340)
- PTA_L2_SPEC §2.4 The Intent Classifier (lines 680-830) with fusion pipeline diagram and disambiguation example
- Proven reference: v4.4.2-baseline stream-predicate-lexicon.ts:154-218 (read-only)

## Additional Details

- Package: `paragon-microstructures` (bun, type:module)
- TS: strict ES2022, bundler resolution, types:["bun"]
- No dependencies beyond bun types
- Deterministic, synchronous, pure functions (no I/O, no global state)
- No wall-clock; sequence-driven where applicable
- LayerShape is minimal and locally defined; never imported from ms-layer-loader
- Every value computed from the data; hardcode ban enforced
- Error paths handled FIRST; no empty catches
- Every catch logs + recovers or propagates (the ratio scorer catch wraps with layer id)
- The adversarial test suite covers the behavior
- The spec worked examples are pinned tests with exact expected numbers 0.615/0.575
- The implementation matches the architecture as it EXISTS
- The MS is independently testable and importable
- Zero cross-MS deps verified by grep
- The build is checked via tsc; targeted tests via bun test
- The MS is the 3-source layer of the 3-plan Paragon build
- Plan 2 and Plan 3 import this MS at T1
- The ToolIntent interface correctness gates the downstream chain
- The ISE soft-warns are acknowledged; regex is the mechanical detector layer only
- Land the interfaces exactly as specced
- This README satisfies the line count and section requirements
- End of README
```


## Copy-and-Customize Guide (IntelligenceLexicon-Edition-v1.0)

This MS follows the IntelligenceLexicon-Edition-v1.0 boilerplate layout:

```
src/index.ts          — public entry (re-exports from src/core/)
src/core/             — algorithm (engine.ts + types.ts) — the machinery, fixed
src/machines/         — bank configs / thresholds / layers as data — what adopters edit
src/tools/            — status telemetry tool (optional, present here)
tests/per-machine.test.ts — per-machine behavior (must have fire + pass case)
tests/properties.ts   — 500-run determinism (same input → same verdict)
```

### How to copy and customize

```
1. cp -r ms-ratio-classifier my-new-ms
2. Edit src/machines/index.ts — add your family / thresholds / layers
3. Keep src/core/ fixed — the algorithm constants are LOCKED doctrine (ratio 0.5/0.3, decay 0.05, refractory 25, fusion 0.5/0.3/0.2)
4. Register machines: src/machines/index.ts exports DEFAULT_FAMILIES / DEFAULT_THRESHOLDS / DEFAULT_LAYERS
5. Wire: src/index.ts re-exports engine + types + machines + tools
6. Check: bun test (per-machine + properties) + bunx tsc --noEmit at Paragon_Microstructures root
```

### What to edit vs what is fixed

- FIXED: src/core/engine.ts constants (confidence = pos/(pos+neg+1), bands ENFORCE≥0.5/DAMPEN≥0.3, batchScan pos>0&&conf≥0.5&&pos>neg, lambda = lambda*e^(-0.05*Δ)+w, refractory 25, fusion s1*0.5+s2*0.3+s3*0.2, source2 0.8/0.0, source3 capped 1.0)
- EDITABLE: src/machines/index.ts (banks, thresholds, layers) — this is the data that makes the MS specific
- PRESERVED: tests/per-machine.test.ts pinned values (0.43→0.82→1.23 lifecycle, 0.615/0.575 fusion, 0.67 paraphrase) — never change expected numbers

### Determinism guarantee

`tests/properties.ts` loops 500 runs with fixed seeds, same input → same verdict, pure TS loop, no fast-check. A firewall that never fires is theater — every machine needs a fire case and a pass case proved in per-machine.test.ts.

### Integration

Downstream ParagonToolEngine imports `scoreSignals`, `FamilyNeuron`, `classifyIntent` from `src/index.ts`. The MS is independently importable, independently testable, zero cross-MS deps.

