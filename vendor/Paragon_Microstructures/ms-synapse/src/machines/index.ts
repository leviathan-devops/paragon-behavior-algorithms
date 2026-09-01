// ms-synapse — src/machines/index.ts (threshold configs as data)
// IntelligenceLexicon-Edition-v1.0 layout: machines are data, core is algorithm.
import type { V2Thresholds } from '../core/types.js';

export const DEFAULT_THRESHOLDS: V2Thresholds = {
  fire: { TEST_EVASION: 0.9, SMOKE_EVASION: 0.9, SYNTHETIC: 1.2, X: 0.9, A: 0.9, B: 0.9 },
  decayAlpha: 0.05,
  refractorySeq: 25,
};

export const LOW_THRESHOLD: V2Thresholds = {
  fire: { LOW: 0.5 },
  decayAlpha: 0.05,
  refractorySeq: 25,
};

export const LIFECYCLE_THRESHOLDS: V2Thresholds = {
  fire: { LIFECYCLE: 0.9 },
  decayAlpha: 0.05,
  refractorySeq: 25,
};
