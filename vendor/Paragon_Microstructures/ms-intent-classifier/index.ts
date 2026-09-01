// ms-intent-classifier — index.ts (re-export shim — real implementation in src/core/engine.ts)
// Backward-compat surface: keeps the root-path import (used by Plan 2 engine) valid
// after the IntelligenceLexicon-Edition-v1.0 src/ restructure.
export * from './src/core/engine.js';
export * from './src/core/types.js';
