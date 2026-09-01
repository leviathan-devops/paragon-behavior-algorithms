// ms-pba-bridge — src/tools/bridge-status.ts (telemetry/status tool)
// Copy-and-customize: expose bridge telemetry for the orchestrator / diagnostics.
import type { PbaBridgeImpl } from '../core/engine.js';

export function createBridgeStatusTool(bridge: PbaBridgeImpl) {
  return {
    description: 'PBA Bridge status: recent signals, active families, macro tier, pre-arm targets.',
    parameters: { sessionId: { type: 'string', description: 'Session id' }, family: { type: 'string', description: 'Optional family for pre-arm lookup' } },
    execute: async (params: { sessionId?: string; family?: string }) => {
      const sid = params.sessionId ?? 'default';
      return {
        recentSignals: bridge.getRecentSignals(sid, 10),
        activeFamilies: bridge.getActiveFamilies(sid),
        macroTier: bridge.getMacroTier(sid),
        prearm: params.family ? bridge.getLayersToPrearm(params.family) : [],
      };
    },
  };
}
