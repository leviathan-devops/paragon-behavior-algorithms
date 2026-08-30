// core/machine.ts — THE STATE LATTICE
//
// IDLE → MONITORING → PRIMED → INTERVENING, tier 0-4, the 8 transitions.
// The OFF gates: observe and accumulate refuse at level OFF (the kill switch).
// The rearm transition is FIRST (the load-bearing order: rearm shadows
// accumulate for INTERVENING, preserving the NEVER-TWICE structural).

import type { BehaviorRecord, BehaviorState, DialLevel } from './types.js';

// ═══ THE CONSTANTS (the calibration) ═══
export const REFRACTORY_SEQ_WINDOW = 25;
export const ESCALATION_DEADLINE_WINDOW = 5;
export const COMPLIANCE_DEBOUNCE_WINDOW = 5;

// ═══ THE TRANSITION RESULT ═══
export type TransitionOutcome =
  | { kind: 'TRANSITIONED'; record: BehaviorRecord }
  | { kind: 'UNCHANGED'; record: BehaviorRecord; reason?: string }
  | { kind: 'INCONCLUSIVE'; record: BehaviorRecord; stage: string; detail: string };

// ═══ THE EVENT PAYLOAD ═══
export interface MachineEvent {
  type: 'FIRST_SIGNAL' | 'SIGNAL' | 'PATTERN_HIT' | 'INTERVENE' |
        'COMPLIANCE_VERIFIED' | 'COMPLIANCE_FAILED' | 'SEQ_WINDOW';
  payload: Record<string, unknown>;
  triad: { pattern: { memberId: string }; state: { from: string; to: string };
           evidence: { file: string; line: number }; seq: number; observedAt: number };
}

// ═══ THE SURFACE HELPER ═══
export type SurfaceKind = 'tool-before' | 'messages.transform' | 'advisory';

function surfaceOfEvent(event: MachineEvent): SurfaceKind | null {
  const s = event.payload['surface'];
  return typeof s === 'string' ? (s as SurfaceKind) : null;
}

function verbForSurface(level: DialLevel, surface: SurfaceKind | null): string | null {
  const verbs = verbsForLevel(level);
  if (!verbs.has('STEER_INJECT') && !verbs.has('TOOL_PREPEND')) return null;
  switch (surface) {
    case 'tool-before': return verbs.has('TOOL_PREPEND') ? 'TOOL_PREPEND' : null;
    case 'messages.transform': return verbs.has('STEER_INJECT') ? 'STEER_INJECT' : null;
    default: return null;
  }
}

function verbsForLevel(level: DialLevel): Set<string> {
  switch (level) {
    case 'OFF': return new Set<string>();
    case 'STEER': return new Set<string>(['STEER_INJECT', 'EVIDENCE_FEED']);
    case 'FULL': return new Set<string>(['TOOL_PREPEND', 'STEER_INJECT', 'EVIDENCE_FEED', 'ADVISORY']);
  }
}

// ═══ THE INVARIANT ERRORS ═══
export class MachineInvariantError extends Error {
  constructor(message: string) { super(message); this.name = 'MachineInvariantError'; }
}

// ═══ THE TRANSITIONS (ordered: REARM FIRST — the load-bearing order) ═══

interface TransitionDef {
  id: string;
  event: string;
  from: string[];
  to: string;
  guard: (record: BehaviorRecord, event: MachineEvent) =>
    { allowed: true } | { allowed: false; reason: string };
  apply: (record: BehaviorRecord, event: MachineEvent) => BehaviorRecord;
}

function withTriad(r: BehaviorRecord, e: MachineEvent): BehaviorRecord {
  return { ...r, seq: r.seq + 1 };
}

function bumpCounter(r: BehaviorRecord, e: MachineEvent): BehaviorRecord {
  const family = typeof e.payload['family'] === 'string' ? e.payload['family'] : 'unknown';
  const counters = { ...r.counters };
  counters[family] = (counters[family] ?? 0) + 1;
  return { ...r, counters };
}

const TRANSITIONS: TransitionDef[] = [
  // ── 1. REARM (must be FIRST — shadows accumulate for INTERVENING) ──
  {
    id: 'rearm', event: 'SIGNAL', from: ['INTERVENING'], to: 'INTERVENING',
    guard: () => ({ allowed: true }),
    apply: (r, e) => withTriad(bumpCounter(r, e), e),
  },
  // ── 2. OBSERVE (the first lift — OFF-gated) ──
  {
    id: 'observe', event: 'FIRST_SIGNAL', from: ['IDLE'], to: 'MONITORING',
    guard: (r) => r.level === 'OFF'
      ? { allowed: false, reason: 'kill switch: level OFF — the machine never lifts' }
      : { allowed: true },
    apply: (r, e) => withTriad(bumpCounter(r, e), e),
  },
  // ── 3. ACCUMULATE (the accrual — OFF-gated) ──
  {
    id: 'accumulate', event: 'SIGNAL',
    from: ['MONITORING', 'PRIMED', 'INTERVENING'], to: 'MONITORING',
    guard: (r) => r.level === 'OFF'
      ? { allowed: false, reason: 'kill switch: level OFF — no counter accrual' }
      : { allowed: true },
    apply: (r, e) => withTriad(bumpCounter(r, e), e),
  },
  // ── 4. PRIME (the intervention authorization) ──
  {
    id: 'prime', event: 'PATTERN_HIT', from: ['MONITORING'], to: 'PRIMED',
    guard: (_r, e) =>
      e.payload['patternId'] !== undefined || e.payload['memberId'] !== undefined
        ? { allowed: true }
        : { allowed: false, reason: 'PATTERN_HIT without a pattern/member anchor' },
    apply: (r, e) => withTriad(r, e),
  },
  // ── 5. INTERVENE (the tier-1 entry) ──
  {
    id: 'intervene', event: 'INTERVENE', from: ['PRIMED'], to: 'INTERVENING',
    guard: (r, e) => {
      if (r.level === 'OFF') return { allowed: false, reason: 'kill switch: OFF intervenes never' };
      if (verbForSurface(r.level, surfaceOfEvent(e)) === null) {
        return { allowed: false, reason: `no eligible verb for surface '${surfaceOfEvent(e)}' at level ${r.level}` };
      }
      return { allowed: true };
    },
    apply: (r, e) => {
      const verb = verbForSurface(r.level, surfaceOfEvent(e));
      if (verb === null) return r;
      const nextSeq = r.seq + 1;
      return withTriad({
        ...r,
        tier: 1 as const,
        lastComplianceVerified: false,
        complianceDeadlineSeq: nextSeq + ESCALATION_DEADLINE_WINDOW,
        directives: [...r.directives, { seq: nextSeq, verb, patternOrMember:
          typeof e.payload['patternId'] === 'string' ? e.payload['patternId'] :
          typeof e.payload['memberId'] === 'string' ? e.payload['memberId'] : 'unknown' }],
      }, e);
    },
  },
  // ── 6. COMPLY (the reset) ──
  {
    id: 'comply', event: 'COMPLIANCE_VERIFIED', from: ['INTERVENING'], to: 'MONITORING',
    guard: () => ({ allowed: true }),
    apply: (r, e) => withTriad({
      ...r,
      tier: 0 as const,
      denialCount: 0,
      lastComplianceVerified: true,
      complianceDeadlineSeq: null,
    }, e),
  },
  // ── 7. ESCALATE (the tier climb) ──
  {
    id: 'escalate', event: 'COMPLIANCE_FAILED', from: ['INTERVENING'], to: 'INTERVENING',
    guard: (r) => {
      if (r.complianceDeadlineSeq === null || r.complianceDeadlineSeq === undefined) {
        return { allowed: false, reason: 'escalate: no deadline set' };
      }
      if (r.tier >= 4) return { allowed: false, reason: 'escalate: already at SOLVE tier 4' };
      if (r.seq < r.complianceDeadlineSeq) {
        return { allowed: false, reason: `escalate: deadline not passed (seq ${r.seq} < ${r.complianceDeadlineSeq})` };
      }
      if (r.seq < r.complianceDeadlineSeq + COMPLIANCE_DEBOUNCE_WINDOW) {
        return { allowed: false, reason: `escalate: debounce not held` };
      }
      return { allowed: true };
    },
    apply: (r, e) => withTriad({
      ...r,
      tier: Math.min(4, r.tier + 1) as BehaviorRecord['tier'],
      denialCount: r.tier >= 3 ? r.denialCount + 1 : r.denialCount,
      lastComplianceVerified: false,
      complianceDeadlineSeq: r.seq + 1 + ESCALATION_DEADLINE_WINDOW,
    }, e),
  },
  // ── 8. COOL (the refractory exit) ──
  {
    id: 'cool', event: 'SEQ_WINDOW', from: ['INTERVENING'], to: 'MONITORING',
    guard: (r) => {
      const lastDirective = r.directives[r.directives.length - 1];
      const anchor = lastDirective ? lastDirective.seq : -1;
      if (anchor < 0) return { allowed: false, reason: 'cool: no directive anchor' };
      if (r.seq - anchor < REFRACTORY_SEQ_WINDOW) {
        return { allowed: false, reason: `cool: refractory not met (${r.seq - anchor} < ${REFRACTORY_SEQ_WINDOW})` };
      }
      return { allowed: true };
    },
    apply: (r, e) => withTriad({ ...r, tier: 0 as const }, e),
  },
];

// ═══ THE STEP FUNCTION (first-match-wins, the transition driver) ═══

export function step(record: BehaviorRecord, event: MachineEvent): TransitionOutcome {
  for (const t of TRANSITIONS) {
    if (t.event !== event.type) continue;
    if (!t.from.includes(record.state)) continue;
    const guardResult = t.guard(record, event);
    if (!guardResult.allowed) continue;  // try the next transition
    const newRecord = t.apply(record, event);
    // THE STATE SET (the caller's responsibility — the apply handles the mutations,
    // the step handles the state transition): state := t.to after the apply.
    // This is the standard state-machine pattern — the transition declares the
    // target state, the apply produces the mutations, the step applies both.
    return { kind: 'TRANSITIONED', record: { ...newRecord, state: t.to as BehaviorState } };
  }
  return { kind: 'UNCHANGED', record, reason: `no transition matches event=${event.type} from=${record.state}` };
}

// ═══ THE INITIAL RECORD ═══

export function createInitialRecord(sessionID: string, level: DialLevel): BehaviorRecord {
  return {
    sessionID,
    level,
    counters: {},
    directives: [],
    tier: 0,
    denialCount: 0,
    lastComplianceVerified: null,
    complianceDeadlineSeq: null,
    seq: 0,
    state: 'IDLE',
  };
}
