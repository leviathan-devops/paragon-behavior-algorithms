// src/lasme/contracts.ts — the PARAGON-aligned shared contracts (spec §2, W0)
//
// THE FORK: EvidenceTriad, Order2Matcher, PatternFamilyMember, MachineDefinition,
// WarheadEvent, ProvenanceAnchor, evidence-triplet binding — the single source
// EVERY other wave imports. The bare-regex rejection, the example-hit seeds,
// the no-triad-no-record, the machine invariants are the load-bearing laws.
// Source: KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/PARAGON_V1/src/lasme/contracts.ts (160 lines)
//         + src/math/oracle.ts (the OracleDeclaration + discharge)
//         + src/math/anchor.ts (the ProvenanceAnchor)
// Spec: STTGF_MUTATION_PARAGON_OVERHAUL_L2_SPEC.md §2.1-2.8, W0

export type BrandedVerdict = { verdict: string; basis: string; [key: string]: unknown };
export type MathExpr = string | { op: string; args: MathExpr[] };

// ── the warhead surface (spec §4.3.1; v2.0 boilerplate README:60-94) ──

export interface WarheadEvent {
  readonly type: string;
  readonly sessionId: string;
  readonly agentOrigin: boolean;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly receivedAtSeq: number;
}

// ── THE EVIDENCE TRIPLET (spec §2.8; evidence triplets, NOT MPSE match infra) ──

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface EvidenceTriad {
  readonly pattern: PatternRef;
  readonly state: StateRef;
  readonly evidence: EvidenceRef;
}
export interface PatternRef {
  readonly memberId: string;
  readonly familySeverity: Severity;
}
export interface StateRef {
  readonly machineId: string;
  readonly from: string;
  readonly to: string;
}
export interface EvidenceRef {
  readonly graphNodeId?: string;
  readonly file: string;
  readonly line: number;
}

export interface WarheadRecord {
  readonly eventId: string;
  readonly triad: EvidenceTriad;
  readonly verdict: WarheadVerdict;
}
export type WarheadVerdict = 'FIRED' | 'SUPPRESSED' | 'DROPPED_INCONCLUSIVE' | 'ESCALATED';

// ── the PatternFamily member (spec §4.3.3) ────────────────────────────

export type Order2Kind = 'token-class' | 'ast-node' | 'sentence-frame' | 'frame-pattern';

export interface FramePatternMarker {
  readonly re: RegExp;
  readonly weight: number;
}

export interface SentenceFrameMatcher {
  readonly kind: 'sentence-frame';
  readonly positive: readonly string[];
  readonly negative: readonly string[];
}

export interface FramePatternMatcher {
  readonly kind: 'frame-pattern';
  readonly markers: readonly FramePatternMarker[];
  readonly negative: readonly string[];
}

export type Order2Matcher = SentenceFrameMatcher | FramePatternMatcher;

export interface ExampleHit {
  readonly text: string;
  readonly shouldFlag: boolean;
  readonly because: string;
}

export type PatternGroup = 'verb-frame' | 'claim-signal' | 'command-classifier' | 'trigger-lexicon';

export interface PatternFamily {
  readonly group: PatternGroup;
  readonly descriptive: readonly RegExp[];
  readonly suggestive: readonly RegExp[];
  readonly substitute?: readonly RegExp[];
  readonly use?: readonly RegExp[];
}

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

export interface PatternFamilyMember {
  readonly id: string;
  readonly kind: 'detector';
  readonly matcher: Order2Matcher;
  readonly triggerCondition: MathExpr | null;
  readonly severity: Severity;
  readonly messageTemplate: string;
  readonly remediationHook: string;
  readonly exampleHits: readonly ExampleHit[];
  readonly group?: PatternGroup;
  readonly descriptive?: readonly RegExp[];
  readonly suggestive?: readonly RegExp[];
  readonly substitute?: readonly RegExp[];
  readonly use?: readonly RegExp[];
}

export interface PatternFlag {
  readonly memberId: string;
  readonly excerpt: string;
  readonly anchor: { file: string; line: number } | null;
}

// ── the ProvenanceAnchor (the oracle's anchor — spec §2.4) ─────────

export interface ProvenanceAnchor {
  readonly file: string;
  readonly line: number;
  readonly content?: string;
}

// ── the OracleDeclaration (the PARAGON OracleRegistry — spec §2.4) ──

export interface OracleDeclaration {
  readonly exprId: string;
  readonly oracleValue: number | boolean | readonly (string | number)[];
  readonly anchor: ProvenanceAnchor;
  readonly unit?: string;
  readonly epsilon?: number;
}

// ── the machine core (spec §4.3.4) ────────────────────────────────────

export interface MachineRecordBase {
  readonly machineId: string;
  readonly state: string;
  readonly seq: number;
  readonly triads: readonly EvidenceTriad[];
}

export interface TransitionSpec<S extends string, R extends MachineRecordBase> {
  readonly id: string;
  readonly event: string;
  readonly from?: readonly S[];
  readonly to: S;
  readonly guard: (r: R, e: WarheadEvent) => GuardResult;
  readonly apply: (r: R, e: WarheadEvent) => R;
  readonly failState?: S;
}

export interface GuardResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface MachineDefinition<S extends string, R extends MachineRecordBase> {
  readonly machineId: string;
  readonly states: readonly S[];
  readonly initial: S;
  readonly transitions: readonly TransitionSpec<S, R>[];
  readonly invariants?: readonly ((r: R) => InvariantResult)[];
}

export interface InvariantResult {
  readonly ok: boolean;
  readonly invariantId: string;
  readonly detail?: string;
}

export type StepResult<S extends string, R extends MachineRecordBase> =
  | { kind: 'TRANSITIONED'; from: S; to: S; record: R; triad: EvidenceTriad }
  | { kind: 'UNCHANGED'; reason: 'NO_MATCHING_TRANSITION' | 'GUARD_FAILED'; failState?: S }
  | { kind: 'INVARIANT_BREACH'; invariantId: string; record: R };

// ── throw-arms (spec §4.3.5) ──────────────────────────────────────────

export interface ThrowArm {
  readonly id: string;
  readonly classifier: PatternFamilyMember['id'];
  readonly gate: (e: WarheadEvent, record: MachineRecordBase) => ArmDecision;
  readonly escapeHatchTools: readonly string[];
  readonly escalation: { readonly at: number; readonly remedy: string };
}

export type ArmDecision =
  | { kind: 'BLOCK'; code: string; remedy: string }
  | { kind: 'DEMAND'; code: string; remedy: string }
  | { kind: 'ALLOW' };

// ── the audit registry (spec §4.3.6) ─────────────────────────────────

export type AuditStatus =
  | 'DISPATCHED' | 'WORKING' | 'RETURNED' | 'AUDITED' | 'ADVANCED' | 'ADVANCE_BLOCKED';

export interface WorkEntry {
  readonly entryId: string;
  readonly taskSignature: string;
  readonly status: AuditStatus;
  readonly returnedAtSeq?: number;
  readonly auditTriad?: EvidenceTriad;
}

export class AdvanceBlockedError extends Error {
  readonly code = 'ADVANCE_BLOCKED';
  constructor(public readonly entryId: string) {
    super(`ADVANCE_BLOCKED: ${entryId} RETURNED without audit — the audit-before-advance law`);
  }
}

// ── the Order-2 law (spec §2.1 — the detection-never-decides) ─────

export class BareRegexRejectedError extends Error {
  readonly code = 'BARE_REGEX_REJECTED';
  constructor(public readonly memberId: string) {
    super(`BARE_REGEX_REJECTED: ${memberId} — matchers are Order-2 structural; a bare regex deciding is the ISE ban`);
  }
}
export class DuplicateMemberError extends Error {
  readonly code = 'DUPLICATE_MEMBER';
  constructor(public readonly memberId: string) {
    super(`DUPLICATE_MEMBER: ${memberId} already registered`);
  }
}
export class MissingExampleHitsError extends Error {
  readonly code = 'MISSING_EXAMPLE_HITS';
  constructor(public readonly memberId: string) {
    super(`MISSING_EXAMPLE_HITS: ${memberId} needs ≥1 positive AND ≥1 negative hit (the D17 seed)`);
  }
}
