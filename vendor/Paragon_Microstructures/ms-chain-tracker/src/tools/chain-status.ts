// ms-chain-tracker — src/tools/chain-status.ts (telemetry/status tool)
import type { ChainTracker } from '../core/engine.js';

export function createChainStatusTool(tracker: ChainTracker) {
  return {
    description: 'Chain tracker status: recent tools, loop detection, per-session history length.',
    parameters: { sessionId: { type: 'string' }, limit: { type: 'number' } },
    execute: async (params: { sessionId?: string; limit?: number }) => {
      const sid = params.sessionId ?? 'default';
      return {
        historyLength: tracker._getHistoryLength(sid),
        recentTools: tracker.recentTools(sid, params.limit ?? 10),
        loopDetected: tracker.detectLoop(sid),
      };
    },
  };
}
