// ms-pba-bridge — root shim (backward compat). Canonical is src/index.ts → src/core/engine.ts
export * from './src/core/engine.js';
export type { PbaSignal, PbaStateChange, PrearmTarget, LayerBoostConfig, PbaBridge } from './src/core/types.js';
