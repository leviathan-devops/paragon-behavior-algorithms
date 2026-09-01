// ms-escalation-memory — src/tools/escalation-status.ts (telemetry/status tool)
import { computeDeadline, computeSkipTier } from '../core/engine.js';

export function createEscalationStatusTool(getState: (sessionId: string) => { escalationCount: number }) {
  return {
    description: 'Escalation memory status: deadline window, skip tier, count.',
    parameters: { sessionId: { type: 'string' }, escalationCount: { type: 'number' } },
    execute: async (params: { sessionId?: string; escalationCount?: number }) => {
      const count = params.escalationCount ?? (params.sessionId ? getState(params.sessionId).escalationCount : 0);
      return { escalationCount: count, deadlineWindow: computeDeadline(count), skipTierLevel: computeSkipTier(count) };
    },
  };
}
