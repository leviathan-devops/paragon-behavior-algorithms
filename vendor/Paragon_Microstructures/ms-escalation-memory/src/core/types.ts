export interface EscalationState {
  escalationCount: number;
  lastEscalationSeq: number;
  deadlineWindow: number;
  debounceWindow: number;
  skipTierLevel: number;
}
