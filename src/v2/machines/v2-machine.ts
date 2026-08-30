// src/v2/machines/v2-machine.ts — THE v2 EVENT-AWARE STATE MACHINE (spec §2.7, W4)
//
// THE FORK: v1's proven LASME machine core (KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/
// PARAGON_V1/src/lasme/state-machine.ts lines 17-83) vendored VERBATIM below as
// step/withTriad/loadOrFresh — the pure (record, event) → record core with the
// ORDER-LOAD-BEARING first-match-wins rule, the I2 no-triad-no-fire breach, the
// I0 to-state mismatch breach, and the fail-closed loader. NOT reinvented: the
// baseline's lasme/ never landed the generic runner (src/lasme/evidence-machine.ts
// lines 26-29 documents why its own step lives beside its machine); this module
// vendors the proven generic instead of inventing a third variant.
//
// THE STATES (spec §2.7):
//   IDLE        → no signals yet; planes keep feeding (observation is unconditional;
//                 ENFORCEMENT alone is state-gated).
//   MONITORING  → counters accumulating; nothing emitted but evidence rows.
//   PRIMED      → a macro pattern fused (PATTERN_HIT). The next ELIGIBLE enforcement
//                 surface (tool.before / messages.transform) triggers intervene.
//   INTERVENING → the directive dispatched (§2.8); REFRACTORY until the SEQ window
//                 advances ≥ REFRACTORY_SEQ_WINDOW steps (NEVER-TWICE: one
//                 intervention per episode). NO wall-clock anywhere — seq-driven only.
//
// THE EVENTS the machine responds to:
//   FIRST_SIGNAL — any first WeightedViolation arrives
//   SIGNAL       — subsequent violations arrive
//   INTERVENE    — the enforcement surface is available (tool.before or
//                  messages.transform fired)
//   SEQ_WINDOW   — enough sequence steps have passed for refractory exit
//   PATTERN_HIT  — the §2.6 macro-pattern engine fused a family verdict
//
// THE FAIL SEMANTIC (loud-fail-or-clear-pass): a fired transition whose apply did
// not grow the triads is an INVARIANT_BREACH — stepV2 THROWS it, never dresses it
// as success. A throwing guard yields kind:'INCONCLUSIVE' — we do not know whether
// the transition was legal — NEVER a default-PASS. Fail state INCONCLUSIVE, never PASS.

import type {
  EvidenceTriad,
  GuardResult,
  InvariantResult,
  MachineDefinition,
  MachineRecordBase,
  StepResult,
  WarheadEvent,
} from '../../lasme/contracts.js';
import type { EnforcementVerb, V2Level, ViolationFamily } from '../contracts.js';

// ── THE PROVEN CORE — VERBATIM FORK of PARAGON_V1 src/lasme/state-machine.ts ──
// Lines 17-83 unchanged except this attribution banner. Zero logic drift: any
// drift here would fork the machine semantics the battery already trusts.

/**
 * step — the total transition function. ORDER IS LOAD-BEARING: the FIRST matching
 * transition (event + from-state) wins; reorder changes behavior (tested).
 * I2: a fired transition whose applied record did not GROW the triads is an
 * INVARIANT_BREACH (no observation, no fire) — apply() must append the event's triad.
 */
export function step<S extends string, R extends MachineRecordBase>(
  def: MachineDefinition<S, R>,
  record: R,
  event: WarheadEvent,
): StepResult<S, R> {
  for (const t of def.transitions) {
    if (t.event !== event.type) continue;
    if (t.from !== undefined && !t.from.includes(record.state as S)) continue;
    const g: GuardResult = t.guard(record, event);
    if (!g.allowed) {
      return { kind: 'UNCHANGED', reason: 'GUARD_FAILED', failState: t.failState };
    }
    const applied = t.apply({ ...record, state: t.to } as R, event);
    if (applied.triads.length <= record.triads.length) {
      return { kind: 'INVARIANT_BREACH', invariantId: 'I2_TRIAD_REQUIRED', record };
    }
    if (applied.state !== t.to) {
      return { kind: 'INVARIANT_BREACH', invariantId: 'I0_TO_STATE_MISMATCH', record };
    }
    if (def.invariants !== undefined) {
      for (const inv of def.invariants) {
        const r = inv(applied);
        if (!r.ok) return { kind: 'INVARIANT_BREACH', invariantId: r.invariantId, record: applied };
      }
    }
    const triad = applied.triads[applied.triads.length - 1]!;
    return { kind: 'TRANSITIONED', from: record.state as S, to: t.to, record: applied, triad };
  }
  return { kind: 'UNCHANGED', reason: 'NO_MATCHING_TRANSITION' };
}

/** withTriad — the apply() helper that appends the event's triad (the I2-satisfying append). */
export function withTriad<R extends MachineRecordBase>(r: R, e: WarheadEvent): R {
  const triad = e.payload['triad'] as EvidenceTriad | undefined;
  if (triad === undefined) return r; // step() will catch this as I2 breach
  return { ...r, seq: r.seq + 1, triads: [...r.triads, triad] };
}

/**
 * loadOrFresh — the fail-closed loader: a corrupt/unreadable persisted record
 * yields a FRESH INITIAL record, NEVER a half-parsed record carrying stale state.
 */
export function loadOrFresh<S extends string, R extends MachineRecordBase>(
  def: MachineDefinition<S, R>,
  persisted: unknown,
  fresh: () => R,
): { record: R; recovered: boolean } {
  if (isValidRecord(def, persisted)) {
    return { record: persisted as R, recovered: false };
  }
  return { record: fresh(), recovered: true };
}

function isValidRecord<S extends string, R extends MachineRecordBase>(
  def: MachineDefinition<S, R>,
  p: unknown,
): boolean {
  return (
    p !== null &&
    typeof p === 'object' &&
    (p as Partial<R>).machineId === def.machineId &&
    typeof (p as Partial<R>).state === 'string' &&
    def.states.includes((p as unknown as { state: S }).state) &&
    typeof (p as Partial<R>).seq === 'number' &&
    Array.isArray((p as Partial<R>).triads)
  );
}

export function migrateV2Record(r: V2Record): V2Record {
  const rec = r as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...rec };
  let mutated = false;
  if (typeof rec.tier !== 'number') { out.tier = 0; mutated = true; }
  if (typeof rec.denialCount !== 'number') { out.denialCount = 0; mutated = true; }
  if (rec.lastComplianceVerified === undefined) { out.lastComplianceVerified = null; mutated = true; }
  if (rec.complianceDeadlineSeq === undefined) { out.complianceDeadlineSeq = null; mutated = true; }
  return mutated ? (out as unknown as V2Record) : r;
}

// ── END OF THE PROVEN CORE ────────────────────────────────────────────────

// ── THE v2 RECORD (spec §2.7 THE RECORD CONTRACT, the mission skeleton shape) ──

export type V2State = 'IDLE' | 'MONITORING' | 'PRIMED' | 'INTERVENING';

export interface V2Record extends MachineRecordBase {
  readonly sessionID: string;
  readonly level: V2Level;
  readonly counters: Partial<Record<ViolationFamily, number>>;
  readonly directives: ReadonlyArray<{ seq: number; verb: string; patternOrMember: string }>;
  readonly tier: 0 | 1 | 2 | 3 | 4;
  readonly denialCount: number;
  readonly lastComplianceVerified: boolean | null;
  readonly complianceDeadlineSeq: number | null;
}

export const V2_MACHINE_ID = 'v2-event-aware';

// THE REFRACTORY WINDOW (spec §2.7 trajectory: SEQ_WINDOW(25 advance)) — SEQ steps
// only; the injected-clock ban means NO wall-clock ever gates this machine.
export const REFRACTORY_SEQ_WINDOW = 25;
export const ESCALATION_DEADLINE_WINDOW = 5;
export const COMPLIANCE_DEBOUNCE_WINDOW = 5;

// The violation-family vocabulary (mirror of ../contracts.ts ViolationFamily —
// that file is types-only by contract, so the runtime membership list lives here).
const KNOWN_FAMILIES: readonly ViolationFamily[] = [
  'FORGERY_INTENT',
  'THEATRICAL_PLANNING',
  'DOUBT_HEDGE',
  'PERMISSION_GATE',
  'SCOPE_SHRINK',
  'TEST_EVASION',
];

// ── THE SURFACE → VERB ELIGIBILITY (spec §2.8 dims + §2.9 level dial) ──
// OFF kills everything (the kill switch); STEER gets D2 steer-inject only
// (D1 tool-prepend is the most visible verb — FULL-only); FULL unlocks both.
// An ineligible surface leaves the machine PRIMED — the next eligible surface
// intervenes later (the trajectory example's stays-PRIMED branch).
function directiveVerb(level: V2Level, surface: string): EnforcementVerb | null {
  if (level === 'FULL' && surface === 'tool.before') return 'TOOL_PREPEND';
  if ((level === 'STEER' || level === 'FULL') && surface === 'messages.transform') return 'STEER_INJECT';
  return null;
}

function surfaceOf(e: WarheadEvent): string {
  return typeof e.payload['surface'] === 'string' ? (e.payload['surface'] as string) : '';
}

// THE COUNTER SYNAPSE (spec §2.5) — the λ snapshot rides the record; only
// known-family signals bump a counter (off-vocabulary payloads still fire the
// transition and grow the triad — the observation happened either way).
function bumpCounter(r: V2Record, e: WarheadEvent): V2Record {
  const family = e.payload['family'];
  if (typeof family !== 'string' || !KNOWN_FAMILIES.includes(family as ViolationFamily)) return r;
  const known = family as ViolationFamily;
  return { ...r, counters: { ...r.counters, [known]: (r.counters[known] ?? 0) + 1 } };
}

// ── THE MACHINE DEFINITION (spec §2.7 — ORDER IS LOAD-BEARING, see rearm note) ──

export const v2MachineDefinition: MachineDefinition<V2State, V2Record> = {
  machineId: V2_MACHINE_ID,
  states: ['IDLE', 'MONITORING', 'PRIMED', 'INTERVENING'],
  initial: 'IDLE',
  transitions: [
    // REARM BEFORE ACCUMULATE — the load-bearing order decision: step() is
    // first-match-wins, and accumulate's from-list contains INTERVENING. Listed
    // after accumulate, rearm would be provably DEAD (shadowed) and a signal
    // during refractory would bounce INTERVENING→MONITORING early — breaking
    // NEVER-TWICE. Rearm first: a SIGNAL during INTERVENING stays INTERVENING
    // (refractory held, counter bumped); SIGNAL from MONITORING/PRIMED falls
    // through to accumulate. All six transitions otherwise exactly as specified.
    {
      id: 'rearm',
      event: 'SIGNAL',
      from: ['INTERVENING'],
      to: 'INTERVENING',
      guard: () => ({ allowed: true }),
      apply: (r, e) => withTriad(bumpCounter(r, e), e),
    },
    {
      id: 'observe',
      event: 'FIRST_SIGNAL',
      from: ['IDLE'],
      to: 'MONITORING',
      // THE OFF GATE (the dial matrix: OFF = all N — audit 2026-08-28): the
      // machine never lifts at OFF — the passive monitoring accrual diverged
      // from the map until this gate (the live OFF-A/B caught the T1/T2 leak).
      // The counters stay zero; a dial flip to FULL starts from a cold machine.
      guard: (r) =>
        r.level === 'OFF'
          ? { allowed: false, reason: 'kill switch: level OFF — the machine never lifts' }
          : { allowed: true }, // observation is unconditional (§2.7 state semantics)
      apply: (r, e) => withTriad(bumpCounter(r, e), e),
    },
    {
      id: 'accumulate',
      event: 'SIGNAL',
      from: ['MONITORING', 'PRIMED', 'INTERVENING'],
      to: 'MONITORING',
      // THE OFF GATE (E-04's sibling — the same audit): no accrual at OFF.
      guard: (r) =>
        r.level === 'OFF'
          ? { allowed: false, reason: 'kill switch: level OFF — no counter accrual' }
          : { allowed: true },
      apply: (r, e) => withTriad(bumpCounter(r, e), e),
    },
    {
      id: 'prime',
      event: 'PATTERN_HIT',
      from: ['MONITORING'],
      to: 'PRIMED',
      // A PATTERN_HIT without a nameable pattern/member anchor is not a fusable
      // verdict (§2.6) — the triad's PatternRef must have something to point at.
      guard: (_r, e) =>
        e.payload['patternId'] !== undefined || e.payload['memberId'] !== undefined
          ? { allowed: true }
          : { allowed: false, reason: 'PATTERN_HIT without a pattern/member anchor is not a fusable verdict' },
      apply: (r, e) => withTriad(r, e),
    },
    {
      id: 'intervene',
      event: 'INTERVENE',
      from: ['PRIMED'],
      to: 'INTERVENING',
      // §2.7 guard: level dial ≠ OFF + verb available on THIS surface. Refractory
      // is STRUCTURAL here: INTERVENE only matches from PRIMED, so an intervening
      // machine cannot double-fire (NEVER-TWICE needs no extra guard).
      guard: (r, e) => {
        if (r.level === 'OFF') return { allowed: false, reason: 'kill switch: level OFF intervenes never' };
        if (directiveVerb(r.level, surfaceOf(e)) === null) {
          return { allowed: false, reason: `no eligible verb for surface '${surfaceOf(e)}' at level ${r.level}` };
        }
        return { allowed: true };
      },
      // The directive rides the triad — no-triad-no-record. seq of the directive
      // is the post-step seq (withTriad increments r.seq by 1). NEW: sets tier=1 +
      // the compliance deadline (seq-based TimeWindowedGate anchor).
      apply: (r, e) => {
        const verb = directiveVerb(r.level, surfaceOf(e));
        if (verb === null) return r; // unreachable (guard allows only eligible surfaces) — I2 would catch a lie
        const patternOrMember =
          typeof e.payload['patternId'] === 'string'
            ? (e.payload['patternId'] as string)
            : typeof e.payload['memberId'] === 'string'
              ? (e.payload['memberId'] as string)
              : 'unknown';
        const nextSeq = r.seq + 1;
        const withDirective: V2Record = {
          ...r,
          tier: 1 as const,
          lastComplianceVerified: false,
          complianceDeadlineSeq: nextSeq + ESCALATION_DEADLINE_WINDOW,
          directives: [...r.directives, { seq: nextSeq, verb, patternOrMember }],
        };
        return withTriad(withDirective, e);
      },
    },
    {
      id: 'comply',
      event: 'COMPLIANCE_VERIFIED',
      from: ['INTERVENING'],
      to: 'MONITORING',
      // THE RECONCILIATION PATTERN (App A.4, 02_STATE:6988-7016): INTERVENING monitors
      // external compliance reality via the event, never a seq guess. Compliance-gated
      // refractory exit — tier/denialCount reset, circuit records success via pipeline.
      guard: () => ({ allowed: true }),
      apply: (r, e) => {
        const reset: V2Record = {
          ...r,
          tier: 0 as const,
          denialCount: 0,
          lastComplianceVerified: true,
          complianceDeadlineSeq: null,
        };
        return withTriad(reset, e);
      },
    },
    {
      id: 'escalate',
      event: 'COMPLIANCE_FAILED',
      from: ['INTERVENING'],
      to: 'INTERVENING',
      // D-06 debounce: single FAILED does not instantly tier++ — failure must persist
      // across the debounce seq-window. Guard = deadline passed AND tier<4 AND debounce held.
      guard: (r) => {
        if (r.complianceDeadlineSeq === null || r.complianceDeadlineSeq === undefined) {
          return { allowed: false, reason: 'escalate: no deadline set' };
        }
        if (r.tier >= 4) return { allowed: false, reason: 'escalate: already at SOLVE tier 4' };
        const deadlinePassed = r.seq >= r.complianceDeadlineSeq;
        if (!deadlinePassed) return { allowed: false, reason: `escalate: deadline not yet passed (seq ${r.seq} < deadline ${r.complianceDeadlineSeq})` };
        const debounceHeld = r.seq >= r.complianceDeadlineSeq + COMPLIANCE_DEBOUNCE_WINDOW;
        if (!debounceHeld) return { allowed: false, reason: `escalate: debounce window not yet held (seq ${r.seq} < deadline+debounce ${r.complianceDeadlineSeq + COMPLIANCE_DEBOUNCE_WINDOW})` };
        return { allowed: true };
      },
      // tier+1; denialCount++ at tier>=3; circuit records failure via pipeline layer.
      // Deadline advances to next window so the next escalation again needs persistence.
      apply: (r, e) => {
        const nextTier = Math.min(4, r.tier + 1) as V2Record['tier'];
        const nextDenial = r.tier >= 3 ? r.denialCount + 1 : r.denialCount;
        // Advance deadline for next escalation window
        const nextDeadline = r.seq + 1 + ESCALATION_DEADLINE_WINDOW;
        const escalated: V2Record = {
          ...r,
          tier: nextTier,
          denialCount: nextDenial,
          lastComplianceVerified: false,
          complianceDeadlineSeq: nextDeadline,
        };
        return withTriad(escalated, e);
      },
    },
    {
      id: 'cool',
      event: 'SEQ_WINDOW',
      from: ['INTERVENING'],
      to: 'MONITORING',
      // RE-SCOPED (CM3 fix): exits refractory ONLY when no intervention outstanding
      // (directives.length===0 or lastComplianceVerified===true). An unaddressed
      // intervention NEVER cools — the escalation chain's spine.
      guard: (r, e) => {
        const advanced = Number(e.payload['advanced']);
        if (!Number.isFinite(advanced) || advanced < REFRACTORY_SEQ_WINDOW) {
          return { allowed: false, reason: `refractory: ${String(e.payload['advanced'])} < ${REFRACTORY_SEQ_WINDOW} seq steps` };
        }
        const noOutstanding = r.directives.length === 0 || r.lastComplianceVerified === true;
        if (!noOutstanding) {
          return { allowed: false, reason: 'cool: intervention still outstanding (compliance not verified)' };
        }
        return { allowed: true };
      },
      apply: (r, e) => withTriad(r, e),
    },
  ],
};

// ── THE INITIAL RECORD ────────────────────────────────────────────────────

export function createInitialV2Record(sessionId: string, level: V2Level): V2Record {
  return {
    machineId: V2_MACHINE_ID,
    state: 'IDLE',
    seq: 0,
    triads: [],
    sessionID: sessionId,
    level,
    counters: {},
    directives: [],
    tier: 0,
    denialCount: 0,
    lastComplianceVerified: null,
    complianceDeadlineSeq: null,
  };
}

// ── THE WRAPPER (the loud-fail surface over the pure core) ───────────────

/** A fired transition that observed nothing (I2/I0/invariant) — LOUD, never success-dressed. */
export class V2InvariantBreachError extends Error {
  readonly code = 'V2_INVARIANT_BREACH';
  constructor(public readonly invariantId: string) {
    super(`V2_INVARIANT_BREACH: ${invariantId} — a fired transition must grow the triads (no observation, no fire)`);
  }
}

export type V2StepOutcome =
  | { readonly kind: 'TRANSITIONED'; readonly from: V2State; readonly to: V2State; readonly record: V2Record; readonly triad: EvidenceTriad }
  | { readonly kind: 'UNCHANGED'; readonly reason: 'NO_MATCHING_TRANSITION' | 'GUARD_FAILED'; readonly failState?: V2State }
  // A guard that THREW leaves legality UNKNOWN — reported INCONCLUSIVE, never PASS
  // (spec §2.7 invariants: "fail-state on any guard error = INCONCLUSIVE").
  | { readonly kind: 'INCONCLUSIVE'; readonly stage: 'GUARD_ERROR'; readonly detail: string };

/**
 * stepV2 — the thin wrapper: runs the PROVEN core step(), throws loudly on any
 * invariant breach (an I2/I0/invariant failure can never be returned as data and
 * consumed downstream as if healthy), and converts a throwing guard into an
 * INCONCLUSIVE outcome (fail-closed, never default-PASS).
 */
export function stepV2(record: V2Record, event: WarheadEvent): V2StepOutcome {
  let result: StepResult<V2State, V2Record>;
  try {
    result = step(v2MachineDefinition, record, event);
  } catch (err) {
    return { kind: 'INCONCLUSIVE', stage: 'GUARD_ERROR', detail: String((err as Error)?.message ?? err) };
  }
  if (result.kind === 'INVARIANT_BREACH') {
    throw new V2InvariantBreachError(result.invariantId);
  }
  if (result.kind === 'TRANSITIONED') {
    return { kind: 'TRANSITIONED', from: result.from, to: result.to, record: result.record, triad: result.triad };
  }
  return result.failState !== undefined
    ? { kind: 'UNCHANGED', reason: result.reason, failState: result.failState }
    : { kind: 'UNCHANGED', reason: result.reason };
}

// ── THE DIRECT HONEST-STATE PROBE (mirrors evidence-machine.checkInvariants) ──
export function checkV2Invariants(record: V2Record): InvariantResult[] {
  const results: InvariantResult[] = [];
  for (const inv of v2MachineDefinition.invariants ?? []) results.push(inv(record));
  return results;
}
