// ms-ratio-classifier — src/tools/status.ts
// Telemetry tool: reports configured families. Pure data, no side effects.
import type { FourBankFamily } from '../core/types.js';
import { DEFAULT_FAMILIES } from '../machines/index.js';

export function createRatioStatusTool(families: FourBankFamily[] = DEFAULT_FAMILIES) {
  return {
    description: 'Ratio classifier status: families, bank counts',
    execute: async () => ({
      families: families.map(f => ({ id: f.id ?? 'unnamed', descriptive: f.descriptive.length, suggestive: f.suggestive.length, substitute: f.substitute.length, use: f.use.length })),
      total: families.length,
    }),
  };
}
