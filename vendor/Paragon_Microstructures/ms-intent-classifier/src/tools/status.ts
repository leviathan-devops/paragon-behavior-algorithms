// ms-intent-classifier — src/tools/status.ts
import type { LayerShape } from '../core/types.js';
import { DEFAULT_LAYERS } from '../machines/index.js';

export function createIntentStatusTool(layers: LayerShape[] = DEFAULT_LAYERS) {
  return {
    description: 'Intent classifier status: layers, thresholds',
    execute: async () => ({
      layers: layers.map(l => ({ id: l.id, threshold: l.threshold, banks: Object.keys(l.banks).length })),
      total: layers.length,
    }),
  };
}
