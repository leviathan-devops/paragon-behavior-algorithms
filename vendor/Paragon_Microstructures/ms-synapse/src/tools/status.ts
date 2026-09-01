// ms-synapse — src/tools/status.ts
import type { V2Thresholds } from '../core/types.js';
import { DEFAULT_THRESHOLDS } from '../machines/index.js';

export function createSynapseStatusTool(thresholds: V2Thresholds = DEFAULT_THRESHOLDS) {
  return {
    description: 'Synapse status: thresholds, decay, refractory',
    execute: async () => ({
      families: Object.keys(thresholds.fire),
      decayAlpha: thresholds.decayAlpha,
      refractorySeq: thresholds.refractorySeq,
      thresholds: thresholds.fire,
    }),
  };
}
