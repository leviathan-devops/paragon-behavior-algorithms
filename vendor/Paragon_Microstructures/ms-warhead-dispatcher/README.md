# ms-warhead-dispatcher — Tier-to-Surface Delivery Engine

## Purpose
Selects the delivery surface based on tier and fills the warhead template. The warhead is where enforcement meets the model — the 6-section standard makes corrections behavior programs, not noise. resolveWarhead returns BODY ONLY; caller owns delivery.

## Tier-to-Surface Mapping (load-bearing contract)
| Tier | Surface | Mechanism | Tool runs? |
| 1 | T.E.A. (tool.execute.after) | dispatchTea appends body to output | Yes 100% |
| 2 | T.E.A. | dispatchTea escalated | Yes |
| 3 | T.E.B. (tool.execute.before) | blockAtTeb throws StructuredEnforcementError | No |
| 4 | chat.message + T.E.B. gate | dispatchDirective sends [PTA GATE] chat.message | Gated |

## API
```ts
import { resolveWarhead, fillTemplate, dispatchTea, blockAtTeb, dispatchDirective, validateWarhead, StructuredEnforcementError } from './src/index.js';
const body = resolveWarhead(layer, tier, { count, toolName, args, chainViolations, pbaFamilies, pbaTier, escalationCount, correctTool, anchor });
const output = dispatchTea(body, toolOutput); // tiers 1-2
blockAtTeb(body, layer.id); // tier 3 throws
dispatchDirective(body, adapter); // tier 4 [PTA GATE]
const { valid, missing } = validateWarhead(body);
```

## Architecture (IntelligenceLexicon-Edition-v1.0)

| Component | File | Purpose |
|---|---|---|
| Core types | `src/core/types.ts` | DeliverySurface, WarheadContext, WarheadLayer, PlatformAdapter, StructuredEnforcementError |
| Core engine | `src/core/engine.ts` | resolveWarhead, fillTemplate, dispatchTea, blockAtTeb, dispatchDirective, validateWarhead |
| Machines | `src/machines/warheads.ts` | TIER_SURFACE_MAP, TIER_TO_SURFACE, REQUIRED_SECTIONS, FILL_FIELDS as data |
| Machines index | `src/machines/index.ts` | Re-export warhead configs |
| Entry | `src/index.ts` | Public entry re-exporting from src/core/ + src/machines/ |
| Tests | `tests/properties.ts` | 500-run determinism (fixed-seed, same input→same output, no fast-check) |
| Tests | `tests/per-machine.test.ts` | Per-tier behavior + determinism gate |
| Legacy tests | `dispatcher.test.ts` | 12 original cases (preserved) |

## How to integrate (copy-and-customize)

```
1. cp -r ms-warhead-dispatcher <your-plugin>/my-warheads
2. Add your template: edit src/machines/warheads.ts — add entry to TIER_SURFACE_MAP
   (tier, surface, severity, requiredSections, fillFields) — 6 sections mandatory.
3. Add your fill field: edit src/machines/warheads.ts — FILL_FIELDS array — then
   update src/core/engine.ts fillTemplate field map.
4. Wire: src/index.ts re-exports from src/core/ — add your new warhead import there
5. Implement: src/core/engine.ts — add your warhead's resolve/dispatch logic
6. Test: bun test (per-machine + 500-run properties) + tsc --noEmit
7. Customize: update src/core/types.ts for new WarheadLayer or WarheadContext fields
```

## Warhead Writing Standard (6 mandatory sections)
Every correction body MUST contain:
1. DETECTED — what the model did (specific tool, args, pattern matched)
2. WHY THIS FIRED — the 3 sources (tool match, chain, PBA context)
3. WHAT THIS MEANS — behavioral consequence (2-3 sentences)
4. CORRECT BEHAVIOR — specific tool to call + what it produces
5. SELF-CHECK — questions the model answers before next tool call
6. RESET PATH — how to clear enforcement (always available)

A body missing ANY section is a defect — validateWarhead returns {valid:false, missing:[...]}.

## Fill Fields (9)
{count} {toolName} {args} {chainViolations} {pbaFamilies} {pbaTier} {escalationCount} {correctTool} {anchor}
fillTemplate does simple {field} substitution over the layer's tier template — no regex tower, no conditionals.

## Layer Interface
```ts
interface WarheadLayer {
  id: string;
  enforcement: { tier1: string; tier2: string; tier3: string; tier4: string; };
}
interface WarheadContext { count, toolName, args, chainViolations, pbaFamilies, pbaTier, escalationCount, correctTool, anchor }
interface PlatformAdapter { inject(message: { type: string; content?: string }): void; }
```

## Delivery Functions
- resolveWarhead(layer,tier,context): string — BODY ONLY, tier clamped 1-4, throws if tier template missing.
- fillTemplate(template,context): string — substitutes all 9 fields, defaults for missing.
- dispatchTea(body,toolOutput): string — returns toolOutput + '\n\n' + body, preserves output verbatim.
- blockAtTeb(body,layerId): never — throws StructuredEnforcementError{machine:'pta', detected:'<layer> at tier 3', correction:body, evidenceRequired:true, tier:3}.
- dispatchDirective(body,adapter): void — sends `[PTA GATE] `+body via adapter.inject({type:'chat.message', content}).
- validateWarhead(body): {valid, missing} — checks 6 sections via substring includes.
- getRequiredSections(): string[] — returns the 6 section names.

## StructuredEnforcementError
```ts
class StructuredEnforcementError extends Error {
  readonly machine: 'pta' = 'pta';
  readonly detected: string;
  readonly correction: string;
  readonly evidenceRequired: true = true;
  readonly tier: 3 = 3;
}
```
Caught by T.E.B. hook; model receives correction in error, can immediately call correctTool.

## PlatformAdapter Seam
Minimal interface — only inject. Plan 2 opencode-adapter implements at T1 by wrapping opencode's chat.message. MockAdapter in tests captures inject calls for assertion.

## Error Handling
- Missing tier template throws synchronously — loud fail, never silent skip.
- Empty template still fills (no crash).
- StructuredEnforcementError always carries correction body; never empty.
- validateWarhead never throws — returns missing array.

## Testing
- Original: 12 cases — fill all 9 fields, BODY ONLY, dispatchTea verbatim, blockAtTeb machine pta tier3, dispatchDirective [PTA GATE], validateWarhead 6-section, tier-to-surface map
- New: tests/per-machine.test.ts — 7 per-tier cases + 500-run determinism
- New: tests/properties.ts — 500 runs pure TS loop, fixed seed, same input→same verdict, fillTemplate + resolveWarhead + validateWarhead + dispatchTea determinism

## Provenance
From warhead-templates.ts (246L, 24-template TEMPLATES array, fill system {count}/{excerpt}/{instrument}) and PTA_L2_SPEC §2.6+§2.10. Own template system with 9 fill fields — does NOT import from v2.

## Constraints
Zero cross-MS imports. Zero v2 imports. Standalone. Bun.

## File Map
- src/core/types.ts: DeliverySurface, WarheadContext, WarheadLayer, PlatformAdapter, StructuredEnforcementError
- src/core/engine.ts: resolveWarhead, fillTemplate, dispatchTea, blockAtTeb, dispatchDirective, validateWarhead, getRequiredSections
- src/machines/warheads.ts: TIER_SURFACE_MAP, TIER_TO_SURFACE, REQUIRED_SECTIONS, FILL_FIELDS
- src/machines/index.ts: re-export warhead configs
- src/index.ts: public entry re-exporting from src/core/ + src/machines/
- tests/properties.ts: 500-run determinism (runProperties, fixed seed, tier/context randomization)
- tests/per-machine.test.ts: 7 per-tier cases + properties gate
- dispatcher.test.ts: 12 original green cases (preserved)
- README.md: this file

## Verification
- bun test ms-warhead-dispatcher → 19 pass (12 original + 7 per-machine)
- bunx tsc --noEmit → 0 errors from this dir
- ls ms-warhead-dispatcher/src/index.ts → exists

## Anti-Patterns Killed
No generic warnings (AP-9), no theatrical code, no empty catches, every value computed from data.

## Future
- 24-template library expansion per MacroIntent
- Anchor generation with sessionId+seq
- Calibration gate (fireTest/silentTest per layer)

## References
- MASTER_L1_SPEC §2 MS-08 + §3 surfaces
- PTA_L2_SPEC §2.6 enforcement surfaces, §2.10 warhead templates
- IntelligenceLexicon-Edition-v1.0 — Registry → machines → hooks pattern

## Changelog
- v1.1 2026-08-31 IntelligenceLexicon restructure: src/ tree, tier-to-surface data table, 500-run properties, per-machine tests
- v1.0 2026-08-31 tier-to-surface engine, 9 fill fields, 6-section validator, 12 tests

## License
Private — paragon-microstructures, PTA.

## Appendix: Example Warheads
Tier1: "DETECTED: bash with inline exec\nWHY THIS FIRED: tool match + PBA TEST_EVASION\nWHAT THIS MEANS: inline proves once not correctness\nCORRECT BEHAVIOR: trident-container-test\nSELF-CHECK: am I calling container test?\nRESET PATH: call container test → reset"
Tier4: "[PTA GATE] BEHAVIORAL CORRECTION — sustained SMOKE_SUBSTITUTION 3 cycles..."

## Contact
Paragon V3 Tool-Chain Algorithms — MS-08 Warhead Dispatcher.
