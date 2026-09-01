// ms-intent-classifier — src/machines/index.ts (layer configs as data)
// IntelligenceLexicon-Edition-v1.0 layout: machines are data, core is algorithm.
import type { LayerShape } from '../core/types.js';

export const SMOKE_LAYER: LayerShape = {
  id: 'SMOKE_SUBSTITUTION',
  threshold: 0.9,
  banks: {
    descriptive: [/for the container test/i],
    suggestive: [/bash/i, /bun test/i],
    substitute: [/instead of the container/i],
    use: [/trident-container-test/i],
  },
  toolMatchers: [{ toolName: 'bash' }],
  pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 },
};

export const LOW_LAYER: LayerShape = {
  id: 'LOW_LAYER',
  threshold: 0.3,
  banks: { descriptive: [], suggestive: [/\bbash\b/i], substitute: [], use: [] },
  toolMatchers: [{ toolName: 'bash' }],
  pbaContextBoost: { families: ['A', 'B'], boostAmount: 0.3 },
};

export const DEFAULT_LAYERS: LayerShape[] = [SMOKE_LAYER, LOW_LAYER];
