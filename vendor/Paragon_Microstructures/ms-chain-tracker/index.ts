// ms-chain-tracker — root shim (backward compat). Canonical is src/index.ts → src/core/engine.ts
export * from './src/core/engine.js';
export type { ChainRule, ChainViolation, CallRecord, ViolationType } from './src/core/types.js';
