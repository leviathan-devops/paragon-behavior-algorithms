// ms-chain-tracker — src/index.ts (public entry re-exporting from src/core/)
// Copy-and-customize: import { ChainTracker } from './src/index.js' or from root index.ts (backward compat)
export * from './core/engine.js';
export type { ChainRule, ChainViolation, CallRecord, ViolationType } from './core/types.js';
