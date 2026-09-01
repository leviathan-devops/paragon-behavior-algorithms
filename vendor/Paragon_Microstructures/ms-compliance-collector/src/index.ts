// ms-compliance-collector — src/index.ts (public entry)
// IntelligenceLexicon-Edition-v1.0 layout: entry re-exports from src/core/.
// The evidence pool + compliance measurement engine (MASTER_L1_SPEC §2 MS-10).
export type { ToolEvidenceRecord, OffenseRecord, DispatchRecord } from './core/types.js';
export { POOL_TTL_MS, GATE_TTL_MS } from './core/types.js';
export { ComplianceCollector, verifySignature } from './core/engine.js';
