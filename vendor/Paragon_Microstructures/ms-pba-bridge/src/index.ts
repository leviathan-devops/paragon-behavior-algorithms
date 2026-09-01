// ms-pba-bridge — src/index.ts (public entry re-exporting from src/core/)
export * from './core/engine.js';
export type { PbaSignal, PbaStateChange, PrearmTarget, LayerBoostConfig, PbaBridge } from './core/types.js';
export { correlateEscalation, PbaBridgeImpl } from './core/engine.js';
