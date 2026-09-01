// core/types.ts — THE SHARED TYPE VOCABULARY (domain-agnostic, never edited)
//
// The complete type vocabulary for the Paragon V2 behavior enforcement stack.
// Every module (core, capture, actuation, config, hooks) imports from here.

// ═══ THE DIAL ═══
export type DialLevel = 'OFF' | 'STEER' | 'FULL';

// ═══ THE STATE ═══
export type BehaviorState = 'IDLE' | 'MONITORING' | 'PRIMED' | 'INTERVENING';

// ═══ THE PLANES (the capture discriminators) ═══
export type CapturePlane = 'reasoning' | 'text-think' | 'tool-cadence';

// ═══ THE VIOLATION FAMILIES (the detection categories) ═══
// NOTE: in the pluggable architecture, families are defined per domain.
// This type is the generic string — the domain module provides its own union.
export type ViolationFamily = string;

// ═══ THE ENFORCEMENT VERBS ═══
export type EnforcementVerb = 'TOOL_PREPEND' | 'STEER_INJECT' | 'EVIDENCE_FEED' | 'ADVISORY';

// ═══ THE FOUR-BANK PATTERN FAMILY (the classifier's input) ═══
export interface FourBankFamily {
  readonly descriptive: readonly RegExp[];   // neg += 1 per hit (context suppresses)
  readonly suggestive: readonly RegExp[];    // pos += 1, +2 if word-bounded
  readonly substitute?: readonly RegExp[];  // pos += 2 per hit (the paraphrase class)
  readonly use?: readonly RegExp[];          // neg += 3 per hit (the legitimate exemptors)
}

// ═══ THE PATTERN FAMILY MEMBER (the domain module's unit of detection) ═══
export interface PatternFamilyMember extends FourBankFamily {
  readonly id: string;                        // e.g. 'TEST_EVASION.skip-verify'
  readonly kind: 'detector' | 'classifier';
  readonly group: string;                     // e.g. 'verb-frame', 'claim-signal'
  readonly matcher: {
    kind: 'sentence-frame' | 'frame-pattern';
    positive: readonly string[];
    negative: readonly string[];
    markers?: Array<{ re: RegExp; weight: number }>;
  };
  readonly triggerCondition: string | null;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly messageTemplate: string;
  readonly remediationHook?: string;
  readonly exampleHits: ReadonlyArray<{
    text: string;
    shouldFlag: boolean;
    because?: string;
  }>;
}

// ═══ THE CLASSIFIER ═══
export interface ClassifierInput {
  readonly text: string;
  readonly tool?: string;
  readonly args?: Record<string, unknown>;
  readonly sessionID?: string;
}

export interface ClassifierResult {
  readonly intent: string;
  readonly confidence: number;
  readonly action: 'allow' | 'block' | 'warn' | 'chain';
  readonly matchedFamilies: readonly string[];
  readonly evidence: string;
}

// ═══ THE WEIGHTED VIOLATION (the classified signal) ═══
export interface StreamSignal {
  readonly memberId: string;
  readonly plane: CapturePlane;
  readonly excerpt: string;
  readonly anchor: { readonly seq: number; readonly ts: number; readonly sessionID: string };
  readonly weight: number;
}

export interface WeightedViolation extends StreamSignal {
  readonly family: ViolationFamily;
}

// ═══ THE MACRO PATTERN (the fusion hit) ═══
export interface MacroPatternHit {
  readonly patternId: string;
  readonly evidence: ReadonlyArray<WeightedViolation>;
  readonly windowSeq: number;
}

// ═══ THE BEHAVIORAL STATE (the tracker's input) ═══
export interface BehavioralState {
  claims: number;
  results: number;
  claimedPaths: string[];
  narrationTurns: number;
  toolCalls: number;
  completionClaims: number;
  verificationCalls: number;
  seq: number;
  sessionID: string;
}

// ═══ THE BEHAVIORAL SIGNAL (a check's output) ═══
export type BehavioralSignal = WeightedViolation;

// ═══ THE MACHINE RECORD (the per-session state) ═══
export interface BehaviorRecord {
  sessionID: string;
  level: DialLevel;
  counters: Record<string, number>;
  directives: Array<{ seq: number; verb: string; patternOrMember: string }>;
  tier: 0 | 1 | 2 | 3 | 4;
  denialCount: number;
  escalationCount: number;
  lastComplianceVerified: boolean | null;
  complianceDeadlineSeq: number | null;
  seq: number;
  state: BehaviorState;
}

// ═══ THE EVIDENCE (the gate's input) ═══
export type EvidenceType = 'audit_log' | 'test_result' | 'build_output' | 'deploy_confirm' | 'metric';

export interface EvidenceRecord {
  id: string;
  gateId: string;
  operationId: string;
  type: EvidenceType;
  data: Record<string, unknown>;
  signature: string;
  timestamp: number;
  verified: boolean;
}

// ═══ THE GATE ═══
export interface GateCriteria {
  gateId: string;
  description: string;
  minEvidenceCount: number;
  requiredEvidenceTypes: string[];
  ttlMs: number;
  requireAllTypes?: boolean;
  verifySignatures?: boolean;
}

export interface GateResult {
  gateId: string;
  verdict: 'PASS' | 'INCONCLUSIVE' | 'FAIL' | 'ERROR';
  evidenceEvaluated: number;
  evidencePassed: number;
  evidenceFailed: number;
  criteriaResults: Array<{ criteria: string; passed: boolean; detail: string }>;
  timestamp: number;
  durationMs: number;
}

// ═══ THE COMPLIANCE ═══
export interface ComplianceDemand {
  toolClass: string;
  toolPattern: RegExp;
}

export interface ObservedCall {
  tool: string;
  args: Record<string, unknown>;
  exitCode?: number;
}

// ═══ THE ENFORCEMENT DIRECTIVE ═══
export interface EnforcementDirective {
  verb: EnforcementVerb;
  trigger: MacroPatternHit | WeightedViolation;
  level: DialLevel;
  tier?: number;
  triad: EvidenceTriad;
}

// ═══ THE EVIDENCE TRIAD (the LASME contract) ═══
export interface EvidenceTriad {
  pattern: { memberId: string; familySeverity: string };
  state: { machineId: string; from: string; to: string };
  evidence: { file: string; line: number };
  seq: number;
  observedAt: number;
}

// ═══ THE DISPATCH SURFACE ═══
export interface DirectiveSurface {
  kind: 'tool-before' | 'messages' | 'advisory' | 'none';
  attach: (text: string) => void;
}

// ═══ THE DOMAIN MODULE (THE PLUG — the aggregate interface) ═══
export interface DomainModule {
  name: string;
  brandPrefix: string;
  instrumentName: string;
  instrumentTier3: string;
  families: readonly PatternFamilyMember[];
  behavioralChecks: ((st: BehavioralState) => WeightedViolation | null)[];
  templates: {
    steer: (families: string, anchor: string) => string;
    demand: (families: string, anchor: string) => string;
    mandate: (tier: number) => string;
    advisory: (patternId: string, summary: string) => string;
  };
  thresholds: Record<string, number>;
  compliance: {
    remediationTools: string[];
    verificationPatterns: RegExp[];
    escapeHatches: string[];
  };
  macroPatterns: MacroPatternDefinition[];
  testFixtures: {
    evasionText: string;
    legitimateText: string;
  };
  lexicon?: Record<string, string>;
}

export interface MacroPatternDefinition {
  id: string;
  description: string;
  families: string[];
  window: number;
}

// ═══ THE PLATFORM ADAPTER (the per-runtime interface) ═══
export interface PlatformEvent {
  type: string;
  properties?: unknown;
}

export interface PlatformAdapter {
  normalizeEvent(rawEvent: unknown): PlatformEvent | null;
  inject(text: string, context: unknown): void;
  interceptTool(toolName: string, args: Record<string, unknown>): StructuredEnforcementError | null;
  observeTool(toolName: string, args: Record<string, unknown>, result: unknown): void;
  observeCompletion(text: string, sessionID: string): void;
}

// ═══ THE PBA BRIDGE EXPORTS (PBA→PTA one-directional) ═══
export interface PbaSignalExport {
  family: string;
  confidence: number;
  excerpt: string;
  seq: number;
  sessionId: string;
}

export interface PbaStateExport {
  tier: number;
  escalationCount: number;
  activeFamilies: string[];
  lastWarheadBody: string | null;
}

// ═══ THE STRUCTURED ENFORCEMENT ERROR ═══
export class StructuredEnforcementError extends Error {
  readonly machine: string;
  readonly detected: string;
  readonly correction: string;
  readonly evidenceRequired: boolean;
  readonly phase: 'A' | 'B';
  readonly tier: number;

  constructor(fields: {
    machine: string; detected: string; correction: string;
    evidenceRequired: boolean; phase: 'A' | 'B'; tier: number;
  }) {
    super(`[${fields.machine.toUpperCase()}] tier ${fields.tier}: ${fields.detected}. ${fields.correction}`);
    this.machine = fields.machine;
    this.detected = fields.detected;
    this.correction = fields.correction;
    this.evidenceRequired = fields.evidenceRequired;
    this.phase = fields.phase;
    this.tier = fields.tier;
  }
}
