// ms-synapse — src/index.ts (public entry)
// IntelligenceLexicon-Edition-v1.0 layout: entry re-exports from src/core/.
// The lambda-decay signal accumulator (MASTER_L1_SPEC §2 MS-02).
import type { V2Thresholds, NeuronSnapshot } from './core/types.js';
import { FamilyNeuron, V2Synapse } from './core/engine.js';

export type { V2Thresholds, NeuronSnapshot };
export { FamilyNeuron, V2Synapse };
