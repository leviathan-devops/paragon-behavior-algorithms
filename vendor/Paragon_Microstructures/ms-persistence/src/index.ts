// ms-persistence — src/index.ts (public entry)
// IntelligenceLexicon-Edition-v1.0 layout: entry re-exports from src/core/.
// Per-session atomic state store (MASTER_L1_SPEC §2 MS-12).
export type { EnforcementEvent, PersistenceConfig } from './core/types.js';
export { Persistence, persistState, loadState, persistSynapse, loadSynapse, appendLedger } from './core/engine.js';
