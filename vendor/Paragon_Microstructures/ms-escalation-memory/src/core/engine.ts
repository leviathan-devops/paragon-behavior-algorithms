import type { EscalationState } from './types.js';

export type { EscalationState } from './types.js';

export function computeDeadline(escalationCount: number): number {
  if (!Number.isFinite(escalationCount)) throw new Error('computeDeadline: escalationCount must be finite');
  if (escalationCount < 0) throw new Error('computeDeadline: escalationCount must be >=0');
  const c = Math.floor(escalationCount);
  if (c <= 1) return 5;
  if (c === 2) return 2;
  return 0;
}

export function computeSkipTier(escalationCount: number): number {
  if (!Number.isFinite(escalationCount)) throw new Error('computeSkipTier: escalationCount must be finite');
  if (escalationCount < 0) throw new Error('computeSkipTier: escalationCount must be >=0');
  const c = Math.floor(escalationCount);
  if (c <= 1) return 0;
  if (c === 2) return 2;
  return 3;
}

export function createInitialState(): EscalationState {
  return {
    escalationCount: 0,
    lastEscalationSeq: 0,
    deadlineWindow: computeDeadline(0),
    debounceWindow: computeDeadline(0),
    skipTierLevel: computeSkipTier(0),
  };
}

function refreshDerived(state: EscalationState): EscalationState {
  return {
    ...state,
    deadlineWindow: computeDeadline(state.escalationCount),
    debounceWindow: computeDeadline(state.escalationCount),
    skipTierLevel: computeSkipTier(state.escalationCount),
  };
}

export function onEscalate(state: EscalationState, atSeq?: number): EscalationState {
  if (!state || typeof state.escalationCount !== 'number') throw new Error('onEscalate: valid EscalationState required');
  const next: EscalationState = {
    ...state,
    escalationCount: state.escalationCount + 1,
    lastEscalationSeq: atSeq ?? state.lastEscalationSeq + 1,
  };
  return refreshDerived(next);
}

export function onComplyGenuine(state: EscalationState): EscalationState {
  if (!state || typeof state.escalationCount !== 'number') throw new Error('onComplyGenuine: valid EscalationState required');
  const next: EscalationState = {
    ...state,
    escalationCount: Math.max(0, state.escalationCount - 1),
  };
  return refreshDerived(next);
}

export function onComplyMinimum(state: EscalationState): EscalationState {
  if (!state || typeof state.escalationCount !== 'number') throw new Error('onComplyMinimum: valid EscalationState required');
  return refreshDerived({ ...state });
}
