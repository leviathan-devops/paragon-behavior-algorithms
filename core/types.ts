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

export interface FourBankFamily {
  id?: string;
  descriptive: RegExp[];
  suggestive: RegExp[];
  substitute: RegExp[];
  use: RegExp[];
}

export interface ScoreResult {
  pos: number;
  neg: number;
  evidence: string;
}

export type ConfidenceBand = 'ENFORCE' | 'DAMPEN' | 'SUPPRESS';

export interface WeightedViolation {
  familyId: string | number;
  pos: number;
  neg: number;
  confidence: number;
  weight: number;
  evidence: string;
}

export interface V2Thresholds {
  fire: Record<string, number>;
  decayAlpha: number;
  refractorySeq: number;
}

export interface NeuronSnapshot {
  lambda: number;
  primed: boolean;
  lastAccumSeq: number;
  lastFireSeq: number;
  currentSeq: number;
}

export interface PbaSignal {
  family: string;
  confidence: number;
  excerpt: string;
  seq: number;
  sessionId: string;
}

export interface PbaStateChange {
  tier: number;
  escalationCount: number;
  activeFamilies: string[];
  lastWarheadBody: string | null;
}

export interface PrearmTarget {
  layerId: string;
  boostAmount: number;
}

export interface LayerBoostConfig {
  layerId: string;
  pbaContextBoost?: {
    families: string[];
    boostAmount: number;
  };
}

export interface PbaBridge {
  onPbaSignal(signal: PbaSignal): void;
  onPbaStateChange(state: PbaStateChange & { sessionId?: string }): void;
  getRecentSignals(sessionId: string, limit: number): PbaSignal[];
  getActiveFamilies(sessionId: string): string[];
  getMacroTier(sessionId: string): number;
}

export type ViolationType = 'MISSING_PREREQUISITE' | 'FORBIDDEN_PRECEDENT' | 'LOOP_DETECTED' | 'SEQUENCE_REVERSED';

export interface ChainRule {
  name: string;
  description: string;
  requires?: Array<{
    tool: string | RegExp;
    args?: Record<string, string | RegExp>;
    withinMs?: number;
  }>;
  forbids?: Array<{
    tool: string | RegExp;
    withinMs?: number;
  }>;
  violation: {
    layerId: string;
    customMessage?: string;
  };
}

export interface ChainViolation {
  ruleName: string;
  violationType: ViolationType;
  expectedTool: string;
  actualContext: string;
  layerId: string;
}

export interface CallRecord {
  tool: string;
  at: number;
  args?: Record<string, unknown>;
  exitCode?: number;
  output?: string;
}

export type DeliverySurface = 'TEA' | 'TEB' | 'GATE';

export interface WarheadContext {
  count?: number;
  toolName?: string;
  args?: string;
  chainViolations?: string;
  pbaFamilies?: string;
  pbaTier?: number;
  escalationCount?: number;
  correctTool?: string;
  anchor?: string;
}

export interface WarheadLayer {
  id: string;
  enforcement: {
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
  };
}

export interface PlatformAdapter {
  inject(message: { type: string; content?: string; body?: string; text?: string; [key: string]: unknown }): void;
}

export class StructuredEnforcementError extends Error {
  readonly machine: 'pta' = 'pta';
  readonly detected: string;
  readonly correction: string;
  readonly evidenceRequired: true = true;
  readonly tier: 3 = 3;
  constructor(opts: { detected: string; correction: string }) {
    super(`[PTA ENFORCEMENT] ${opts.detected}`);
    this.name = 'StructuredEnforcementError';
    this.detected = opts.detected;
    this.correction = opts.correction;
  }
}

export interface ToolEvidenceRecord {
  type: 'tool_result';
  tool: string;
  args: Record<string, unknown>;
  exitCode: number;
  output: string;
  timestamp: number;
  signature: string;
}

export interface GateCriteria {
  minEvidenceCount: boolean;
  freshness: boolean;
  requiredTypes: boolean;
  allTypes: boolean;
  signatureVerification: boolean;
}

export interface GateResult {
  verdict: 'PASS' | 'INCONCLUSIVE' | 'FAIL';
  criteria: GateCriteria;
  poolSize: number;
  totalFresh?: number;
}

export interface OffenseRecord {
  layerId: string;
  violation: unknown;
  timestamp: number;
}

export interface DispatchRecord {
  layerId: string;
  tier: number;
  surface: string;
  timestamp: number;
}

export const POOL_TTL_MS = 600_000;
export const GATE_TTL_MS = 300_000;

export interface EnforcementEvent {
  type: string;
  sessionId?: string;
  layerId?: string;
  tier?: number;
  timestamp: number;
  [key: string]: unknown;
}

export interface PersistenceConfig {
  stateDir: string;
}

export interface LayerJson {
  id: string;
  description?: string;
  toolMatchers: Array<{
    toolName: string;
    argPatterns?: Record<string, string[]>;
  }>;
  banks: {
    descriptive: string[];
    suggestive: string[];
    substitute: string[];
    use: string[];
  };
  pbaContextBoost?: {
    families: string[];
    boostAmount: number;
  };
  enforcement: {
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
  };
  threshold: number;
  severity: string;
  chainRules?: Array<{
    name: string;
    description?: string;
    requires?: Array<{ tool: string; withinMs?: number }>;
    forbids?: Array<{ tool: string; withinMs?: number }>;
    violation: { layerId: string; customMessage?: string };
  }>;
}

export interface CompiledLayer {
  id: string;
  description: string;
  toolMatchers: Array<{
    toolName: string;
    argPatterns?: Record<string, RegExp[]>;
  }>;
  banks: {
    descriptive: RegExp[];
    suggestive: RegExp[];
    substitute: RegExp[];
    use: RegExp[];
  };
  pbaContextBoost?: {
    families: string[];
    boostAmount: number;
  };
  enforcement: {
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
  };
  threshold: number;
  severity: string;
  chainRules: Array<{
    name: string;
    description: string;
    requires?: Array<{ tool: string; withinMs?: number }>;
    forbids?: Array<{ tool: string; withinMs?: number }>;
    violation: { layerId: string; customMessage?: string };
  }>;
}

export interface LayerRegistry {
  layers: Map<string, CompiledLayer>;
  chainRules: Array<{ name: string; layerId: string; [k: string]: unknown }>;
  pbaBoosts: Array<{ layerId: string; families: string[]; boostAmount: number }>;
}

export class LoaderValidationFailedError extends Error {
  readonly missingField: string;
  constructor(missingField: string) {
    super(`LOADER_VALIDATION_FAILED: missing field '${missingField}'`);
    this.name = 'LoaderValidationFailedError';
    this.missingField = missingField;
  }
}

export interface IntentSources {
  toolMatch: { toolName: string; matchedPattern: string | null; confidence: number };
  chainContext: { previousTools: string[]; chainViolations: string[]; confidence: number };
  pbaContext: { activeFamilies: string[]; latestSignals: PbaSignal[]; macroTier: number; confidence: number };
}

export interface ToolIntent {
  action: 'ALLOW' | 'ADVISE' | 'BLOCK';
  layerId: string | null;
  confidence: number;
  tier: number;
  sources: IntentSources;
}

export interface LayerShape {
  id: string;
  threshold: number;
  banks: {
    descriptive: RegExp[];
    suggestive: RegExp[];
    substitute: RegExp[];
    use: RegExp[];
  };
  toolMatchers: Array<{
    toolName: string | RegExp;
    argPatterns?: Record<string, (string | RegExp)[]>;
  }>;
  pbaContextBoost?: {
    families: string[];
    boostAmount: number;
  };
  enforcement?: {
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
  };
}

export interface EscalationState {
  escalationCount: number;
  lastEscalationSeq: number;
  deadlineWindow: number;
  debounceWindow: number;
  skipTierLevel: number;
}

export interface ToolChainLayer {
  id: string;
  description: string;
  toolMatchers: {
    toolName: string | RegExp;
    argPatterns?: Record<string, (string | RegExp)[]>;
  }[];
  banks: {
    descriptive: RegExp[];
    suggestive: RegExp[];
    substitute: RegExp[];
    use: RegExp[];
  };
  pbaContextBoost?: {
    families: string[];
    boostAmount: number;
  };
  enforcement: {
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
  };
  threshold: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  chainRules?: ChainRule[];
}

export interface ToolChainModule {
  name: string;
  brandPrefix: string;
  layers: ToolChainLayer[];
  chainRules: ChainRule[];
  compliance: {
    escapeHatches: string[];
    remediationTools: string[];
    verificationPatterns: RegExp[];
  };
  pbaBridge: {
    enabled: boolean;
    signalFilter?: string[];
    contextWindowSize?: number;
    confidenceBoost?: number;
  };
}

export interface PtaSessionState {
  sessionId: string;
  record: BehaviorRecord;
  synapse: V2SynapseShape;
  chainState: {
    callHistory: CallRecord[];
    activeViolations: ChainViolation[];
  };
  pbaSignals: PbaSignal[];
  behavioral: {
    toolCalls: number;
    verificationCalls: number;
    completionClaims: number;
    lastClaimTimestamp: number | null;
  };
  lastDispatchedTier: Map<string, number>;
}

export interface V2SynapseShape {
  accumulate(violation: { familyId?: string; weight: number; family?: string }, seq: number): void;
  canAnyFire(): boolean;
  getNeuron(family: string): FamilyNeuronShape;
  snapshot(): Record<string, NeuronSnapshot>;
  restore(snap: Record<string, NeuronSnapshot>): void;
}

export interface FamilyNeuronShape {
  accumulate(weight: number, atSeq: number): void;
  canFire(): boolean;
  fire(): void;
  value(): number;
  boostBaseline(amount: number): void;
  restore(snapshot: NeuronSnapshot): void;
  snapshot(): NeuronSnapshot;
}
