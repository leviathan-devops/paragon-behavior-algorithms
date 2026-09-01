export type BehaviorState = 'IDLE' | 'MONITORING' | 'PRIMED' | 'INTERVENING';

export type MachineEvent =
  | 'TOOL_SIGNAL'
  | 'FIRST_TOOL_SIGNAL'
  | 'CHAIN_PATTERN_HIT'
  | 'INTERVENE'
  | 'COMPLIANCE_VERIFIED'
  | 'COMPLIANCE_FAILED'
  | 'SEQ_WINDOW';

export interface BehaviorRecord {
  state: BehaviorState;
  tier: 0 | 1 | 2 | 3 | 4;
  denialCount: number;
  escalationCount: number;
  lastComplianceVerified: boolean | null;
  complianceDeadlineSeq: number | null;
  seq: number;
  counters: Record<string, number>;
  directives: Array<{ seq: number; verb: string; patternOrMember: string }>;
}

export interface StepPayload {
  patternId?: string;
  memberId?: string;
  family?: string;
  advanced?: number;
  isGenuine?: boolean;
  instrument?: string;
  [key: string]: unknown;
}

export function createInitialRecord(overrides?: Partial<BehaviorRecord>): BehaviorRecord {
  return {
    state: 'IDLE',
    tier: 0,
    denialCount: 0,
    escalationCount: 0,
    lastComplianceVerified: null,
    complianceDeadlineSeq: null,
    seq: 0,
    counters: {},
    directives: [],
    ...overrides,
  };
}
