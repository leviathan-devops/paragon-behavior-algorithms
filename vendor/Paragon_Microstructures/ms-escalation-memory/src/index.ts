// ms-escalation-memory — src/index.ts (public entry re-exporting from src/core/)
export * from './core/engine.js';
export type { EscalationState } from './core/types.js';
export { computeDeadline, computeSkipTier, createInitialState, onEscalate, onComplyGenuine, onComplyMinimum } from './core/engine.js';
