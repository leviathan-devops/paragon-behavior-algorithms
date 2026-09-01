// ms-layer-loader — src/index.ts (public entry)
// IntelligenceLexicon-Edition-v1.0 layout: entry re-exports from src/core/.
// The JSON-to-runtime compiler (MASTER_L1_SPEC §2 MS-11, PTA_L2_SPEC §2.7).
export type { LayerJson, CompiledLayer, LayerRegistry } from './core/types.js';
export { LoaderValidationFailedError } from './core/types.js';
export { loadLayer, registerLayer, createRegistry, compileGlob, compileBankPatterns, compileArgPatterns } from './core/engine.js';
