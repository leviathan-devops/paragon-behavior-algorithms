// ms-layer-loader — src/tools/layer-loader-status.ts
// Telemetry: registered layers, compiled pattern counts, registry stats.
import type { LayerRegistry } from '../core/types.js';

export function createLayerLoaderStatusTool(registry: LayerRegistry) {
  return {
    description: 'Layer-loader status: registered layers, compiled banks, chain rules, PBA boosts.',
    parameters: {
      layerId: { type: 'string', description: 'Optional layer id to inspect' },
    },
    execute: async (params: { layerId?: string }) => {
      if (params.layerId) {
        const layer = registry.layers.get(params.layerId);
        if (!layer) return { found: false, layerId: params.layerId };
        return {
          found: true,
          id: layer.id,
          banks: {
            descriptive: layer.banks.descriptive.length,
            suggestive: layer.banks.suggestive.length,
            substitute: layer.banks.substitute.length,
            use: layer.banks.use.length,
          },
          argPatterns: layer.toolMatchers.map((m) => ({
            toolName: m.toolName,
            patterns: m.argPatterns ? Object.keys(m.argPatterns).length : 0,
          })),
          chainRules: layer.chainRules.length,
          threshold: layer.threshold,
          severity: layer.severity,
        };
      }
      return {
        layers: [...registry.layers.values()].map((l) => ({
          id: l.id,
          threshold: l.threshold,
          severity: l.severity,
          banks: {
            descriptive: l.banks.descriptive.length,
            suggestive: l.banks.suggestive.length,
            substitute: l.banks.substitute.length,
            use: l.banks.use.length,
          },
        })),
        chainRules: registry.chainRules.length,
        pbaBoosts: registry.pbaBoosts.length,
      };
    },
  };
}
