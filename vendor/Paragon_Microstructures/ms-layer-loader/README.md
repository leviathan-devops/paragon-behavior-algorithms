# ms-layer-loader — JSON-to-Runtime Compiler

## What It Does

ms-layer-loader is the PROGRAMMING SURFACE of the Paragon Tool Engine (PTA). It compiles layer JSON files (MASTER §4 SMOKE_TEST_GUARD canonical example) into runtime enforcement: validates every required field (throw `LOADER_VALIDATION_FAILED` with the named missing field), compiles string globs to RegExp (`*`→`.*`; banks unanchored case-insensitive, argPatterns anchored `^...$` case-insensitive), and registers the compiled layer into a `LayerRegistry` extracting `chainRules` and `pbaContextBoost`.

This is infrastructure MS-11 per MASTER_L1_SPEC §2 and PTA_L2_SPEC §2.7 config-loader reference. The 30-minute layer creation story lives or dies on this loader: invalid layers fail loud, valid layers become live enforcement in one call.

## How to Import

```typescript
import { loadLayer, registerLayer, createRegistry, compileGlob } from './src/index.js';
import { SMOKE_TEST_GUARD_FIXTURE } from './src/machines/machines.js';
import { createLayerLoaderStatusTool } from './src/tools/layer-loader-status.js';

const layer = loadLayer('/path/to/layer.json');
const registry: LayerRegistry = createRegistry();
registerLayer(registry, layer);
const tool = createLayerLoaderStatusTool(registry);
const status = await tool.execute({});
compileGlob('node -e*', true);  // /^node\-e.*$/i
```

Zero cross-MS dependencies. Uses `node:fs` only.

## The Interface

### Types (src/core/types.ts)

```typescript
interface LayerJson { id:string; toolMatchers:{toolName:string;argPatterns?:Record<string,string[]>}[]; banks:{descriptive:string[];suggestive:string[];substitute:string[];use:string[]}; pbaContextBoost?:{families:string[];boostAmount:number}; enforcement:{tier1:string;tier2:string;tier3:string;tier4:string}; threshold:number; severity:string; chainRules?:Array<{name:string;requires?:{tool:string}[];violation:{layerId:string}}> }
interface CompiledLayer { id:string; toolMatchers:{toolName:string;argPatterns?:Record<string,RegExp[]>}[]; banks:{descriptive:RegExp[];suggestive:RegExp[];substitute:RegExp[];use:RegExp[]}; enforcement:{tier1-4:string}; threshold:number; severity:string; chainRules: ...; }
interface LayerRegistry { layers:Map<string,CompiledLayer>; chainRules:ChainRule[]; pbaBoosts:PbaBoost[] }
class LoaderValidationFailedError extends Error { missingField: string }
```

### Engine (src/core/engine.ts)

- `compileGlob(pattern, anchored): RegExp` — `*`→`.*` via escapeRegex, `^...$` when anchored, `i` flag. Throws if pattern missing.
- `compileBankPatterns(patterns): RegExp[]` — maps via `compileGlob(p,false)` (unanchored).
- `compileArgPatterns(argPatterns): Record<string,RegExp[]>` — maps via `compileGlob(p,true)` (anchored).
- `loadLayer(jsonPath): CompiledLayer` — readFileSync, JSON.parse, validateLayerJson (throws LOADER_VALIDATION_FAILED naming the missing field), compile banks + argPatterns, return compiled layer. Malformed JSON and ENOENT mapped to LOADER_VALIDATION_FAILED.
- `registerLayer(registry, layer)` — throws on duplicate id, appends to `layers`, extracts `chainRules` (+layerId) and `pbaBoosts`.
- `createRegistry(): LayerRegistry` — `{layers:new Map(), chainRules:[], pbaBoosts:[]}`.

### Machines (src/machines/machines.ts)

- `LAYER_LOADER_LEXICON` — requiredFields, bankBands, enforcementTiers, globRules as data.
- `SMOKE_TEST_GUARD_FIXTURE` — the canonical SMOKE_TEST_GUARD JSON (MASTER §4) as const data, used by tests and the tool example.

### Tools (src/tools/layer-loader-status.ts)

- `createLayerLoaderStatusTool(registry)` — telemetry tool. `execute({layerId?})` returns per-layer bank counts + thresholds or the full registry summary. The layer-loader's status surface per the IntelligenceLexicon layout.

### Error Paths

Every validator throws `LoaderValidationFailedError` naming the missing field. Never silently registers a broken layer (R2). File-not-found and JSON syntax errors mapped to `LOADER_VALIDATION_FAILED`. All catches log via `console.error` and propagate where the caller must handle.

## How to Test

```bash
cd ms-layer-loader && bun test
bunx tsc --noEmit
```

- `tests/per-machine.test.ts` — 12 cases: canonical SMOKE_TEST_GUARD loads+compiles, glob pin `node -e*` matches `node -e` not `node -x`, bank case-insensitive, missing id/banks/tier3/threshold/toolMatchers throw LOADER_VALIDATION_FAILED, malformed JSON throws, register populates layers+chainRules+pbaBoosts, duplicate rejected, anchored vs unanchored.
- `tests/properties.ts` — 500-run determinism: same pattern/anchored → same source/flags; anchored has `^$`; same fixture file → same compiled id/threshold/banks; same layer to fresh registries → same counts. Fixed seeds, pure TS loop, NO fast-check.

## How to Compose

- ParagonToolEngine calls `loadLayer(jsonPath)` at T1/T2 and `registerLayer` to wire chainRules into ChainTracker and pbaContextBoost into PbaBridge.
- Boilerplate ships this MS as the adopter-facing programming surface (30-minute story).
- The `CompiledLayer` type is the exact runtime shape intent classifier's `LayerRef` must satisfy.

## How to Copy-and-Customize

```
1. cp -r ms-layer-loader <your-plugin>/layer-loader
2. Add your lexicon: edit src/machines/machines.ts — extend LAYER_LOADER_LEXICON and add your fixture const.
3. Add your compiler pass: extend src/core/engine.ts — e.g. compile a new arg field following compileArgPatterns anchored pattern.
4. Register: export machines in src/machines/index.ts DEFAULT_MACHINES and add a tool in src/tools/.
5. Test: bun test (per-machine + 500-run properties).
6. Build: bunx tsc --noEmit — entry is src/index.ts.
```

Custom glob example: to add `filePath` globs, reuse `compileGlob(p, true)` for anchored file patterns. Custom validation: add a field check in `validateLayerJson` throwing `LoaderValidationFailedError('myField')`.

## Architecture Notes

- `escapeRegex` escapes `.[+?^${}()|[\]\\]` before `*`→`.*` so literal dots don't become wildcards.
- Banks are intentionally unanchored (substring match, `i` flag) so `trident-container-test` matches inside longer text; argPatterns are anchored (`^...$`, `i`) so `node -e*` matches exactly the command shape.
- Validation order: JSON read → `validateLayerJson` (required fields) → compilation. No compilation runs on invalid JSON.
- Severity defaults to `'MEDIUM'` when absent — defensively permissive.
- Registry is a plain object with a Map — serializable except the Map, which the engine holds ephemerally; persistence serializes via separate file.
- Tool surface (`src/tools/`) exists only for this MS because layer introspection is observable; collector and persistence expose no tools.

## File Map

- `src/core/types.ts:1` — LayerJson, CompiledLayer, LayerRegistry, LoaderValidationFailedError
- `src/core/engine.ts:1` — compileGlob, compileBankPatterns, compileArgPatterns, loadLayer, registerLayer, createRegistry
- `src/machines/machines.ts:1` / `index.ts:1` — LAYER_LOADER_LEXICON, SMOKE_TEST_GUARD_FIXTURE
- `src/tools/layer-loader-status.ts:1` — createLayerLoaderStatusTool
- `src/index.ts:1` — public entry
- `index.ts:1`, `types.ts:1` — root shims
- `index.test.ts:1` — preserved original 12-case suite
- `tests/per-machine.test.ts:1` — 12 per-machine cases
- `tests/properties.ts:1` — 500-run properties

## Verification Commands

```bash
ls ms-layer-loader/src/index.ts ms-layer-loader/src/core/engine.ts
bun test ms-layer-loader
bunx tsc --noEmit
wc -l ms-layer-loader/README.md
grep -r "from '../ms-" ms-layer-loader # 0
```

## Operator Doctrine

- R2 "BOTH need to be able to be pre-programmed with natural language based operating systems" — the layer system IS that surface; the loader makes JSON become live enforcement; `LOADER_VALIDATION_FAILED` fail-loud, never silently register a broken layer.
- R10 canonical id is SMOKE_TEST_GUARD, never 'sstf'.

## References

- MASTER_L1_SPEC §2 MS-11, §4 SMOKE_TEST_GUARD fixture (lines 760-825)
- PTA_L2_SPEC §2.7 layer system + config loader reference (lines 1176-1329)
- IntelligenceLexicon-Edition-v1.0 src/tools/lexicon-status.ts (tool surface pattern)

## Additional Details

- Package paragon-microstructures, type:module, bun, strict ES2022
- Zero cross-MS deps
- Error paths first, no empty catches
- Hardcode ban — every RegExp computed from the pattern string
- Adversarial suite covers empty/null/concurrent/boundary
- IntelligenceLexicon layout (src/core + src/machines + src/tools + src/index.ts + tests/properties.ts)
