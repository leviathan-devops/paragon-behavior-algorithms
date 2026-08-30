// src/lasme/evidence-machine.ts — THE EVIDENCE-DEGREE LADDER MACHINE (spec §2.2, W2)
//
// THE FORK: PARAGON V1's src/machines/evidence-machine.ts (the testing-degree
// ladder) adapted to the LANDED W0 contracts (src/lasme/contracts.ts). The
// ladder: NO_EVIDENCE → UNIT_EVIDENCED → CONTAINER_EVIDENCED; the query is
// FAIL-CLOSED (an unknown/unproven scope → UNEVIDENCED, never a guess); smoke
// evidence NEVER satisfies the container tier (the smokeOnly law).
//
// THE OPERATOR'S DOCTRINE (verbatim): "VERIFIED AGAINST EMPIRICAL REAL TIME BUILD
// EVIDENCE VISIBLE IN THE CODE BASE" — the span's verdict is bound to the CURRENT
// dist's testing degree (the §2.2 F-4 evidence binding). The DIST-SCOPE: this
// machine's record is KEYED to the ADOPTED dist identity (the dist-identity
// adoption at src/index.ts — "DIST-IDENTITY ADOPTED on load", the F-10 baseline).
// A claim about a DIFFERENT dist is judged against ITS OWN record — the OLD-dist
// evidence NEVER satisfies a NEW-dist claim (the F-4-REPLAY / the zero-trust audit
// fix #5: the machine CONSUMES the adopted identity, never re-builds it).
//
// THE STRONGEST-WINS SEMANTIC (the honest-state): CONTAINER_PASS from ANY state →
// CONTAINER_EVIDENCED (the container suite is the strongest evidence). Once the
// record holds container evidence, its STATE stays CONTAINER_EVIDENCED — a
// subsequent UNIT_PASSED/SMOKE_RUN append NEVER downgrades the state (the
// container entry remains, the honest-state invariant holds). The state is
// WRITTEN by the apply (strongest-wins), never blind-named by the transition.
//
// THE STATE MACHINE vs the CONTRACTS: the landed W0 contracts define the
// MachineDefinition/TransitionSpec/StepResult/GuardResult/InvariantResult TYPES
// + the EvidenceTriad — imported, never redefined. The `step` RE-RUNNER lives
// here (the W0 contracts do not ship a step) — it mirrors the PARAGON
// state-machine.ts step under the container-strongest semantics.

import type {
  EvidenceTriad,
  GuardResult,
  InvariantResult,
  MachineDefinition,
  MachineRecordBase,
  StepResult,
  WarheadEvent,
} from './contracts';

// ── THE TESTING-DEGREE TYPE (spec §2.2 — the ladder + the fail-closed query) ──
export type TestingDegree =
  | 'NO_EVIDENCE'
  | 'UNIT_EVIDENCED'
  | 'CONTAINER_EVIDENCED' // the ladder
  | 'UNEVIDENCED'; // the FAIL-CLOSED query result

export interface EvidenceEntry {
  readonly entryId: string;
  readonly degree: 'UNIT_EVIDENCED' | 'CONTAINER_EVIDENCED';
  readonly smokeOnly: boolean; // smoke evidence NEVER satisfies the container tier
  readonly triad: EvidenceTriad; // the {Pattern, State, Evidence} binding
  readonly atSeq: number;
}

// THE RECORD — the machine's state + the evidence ring, keyed to the ADOPTED dist.
export interface EvidenceMachineRecord extends MachineRecordBase {
  readonly scope: string; // the ADOPTED dist identity (the F-10 dist-scope)
  readonly entries: readonly EvidenceEntry[]; // the ring (≤ E_RING_CAP)
}

// ── THE RING CAP + THE MACHINE ID (spec §2.2) ──
export const E_RING_CAP = 50; // the entries ≤ 50 (bounds memory on the long sessions)
export const EVIDENCE_MACHINE_ID = 'evidence';

export const evidenceStates = ['NO_EVIDENCE', 'UNIT_EVIDENCED', 'CONTAINER_EVIDENCED'] as const;
export type EvidenceState = (typeof evidenceStates)[number];

// ── THE FRESH RECORD (a session starts NO_EVIDENCE for its adopted scope) ──
export function freshEvidenceRecord(scope: string, machineId: string = EVIDENCE_MACHINE_ID): EvidenceMachineRecord {
  return { machineId, state: 'NO_EVIDENCE', seq: 0, triads: [], scope, entries: [] };
}

// ── THE RING PUSH (the merge-side cap — the oldest evicted) ──
function ringPush(entries: EvidenceEntry[]): EvidenceEntry[] {
  return entries.length > E_RING_CAP ? entries.slice(entries.length - E_RING_CAP) : entries;
}

// ── THE DEFAULT TRIAD (when the event carries no triad — never a triad-less entry) ──
function defaultTriad(record: EvidenceMachineRecord, degree: 'UNIT_EVIDENCED' | 'CONTAINER_EVIDENCED'): EvidenceTriad {
  return {
    pattern: { memberId: degree === 'CONTAINER_EVIDENCED' ? 'container-suite' : 'unit-suite', familySeverity: 'HIGH' },
    state: { machineId: EVIDENCE_MACHINE_ID, from: record.state, to: degree },
    evidence: { file: '(suite)', line: 1 },
  };
}

// ── THE STATE COMPUTATION (the strongest-wins semantic) ──
// CONTAINER_PASS → CONTAINER_EVIDENCED (the strongest). An already-container
// record is NEVER downgraded by a unit/smoke append — the container entry
// remains, so the honest-state invariant holds.
function computeState(current: EvidenceState, degree: 'UNIT_EVIDENCED' | 'CONTAINER_EVIDENCED'): EvidenceState {
  if (degree === 'CONTAINER_EVIDENCED') return 'CONTAINER_EVIDENCED';
  if (current === 'CONTAINER_EVIDENCED') return 'CONTAINER_EVIDENCED';
  return 'UNIT_EVIDENCED';
}

// ── THE APPEND (the transition effect — a new ring entry + the state + the triad) ──
function appendEntry(
  record: EvidenceMachineRecord,
  e: WarheadEvent,
  degree: 'UNIT_EVIDENCED' | 'CONTAINER_EVIDENCED',
  smokeOnly = false,
): EvidenceMachineRecord {
  const triad = e.payload['triad'] as EvidenceTriad | undefined;
  const entry: EvidenceEntry = {
    entryId: String(e.payload['entryId'] ?? `ev-${record.seq + 1}`),
    degree,
    smokeOnly,
    triad: triad ?? defaultTriad(record, degree),
    atSeq: Number(e.payload['atSeq'] ?? record.seq + 1),
  };
  const entries = ringPush([...record.entries, entry]);
  const state = computeState(record.state as EvidenceState, degree);
  return { ...record, seq: record.seq + 1, state, entries, triads: [...record.triads, entry.triad] };
}

// ── THE HONEST-STATE INVARIANT (spec §2.2 — E_STATE_MATCHES_ENTRIES) ──
// The degree-state must match the strongest entry: a container-evidenced STATE
// IMPLIES a container entry (never a state without its evidence). A
// unit-evidenced state implies a unit-or-higher entry.
export function evidenceStateMatchesEntries(record: EvidenceMachineRecord): InvariantResult {
  const s = record.state as EvidenceState;
  let ok = true;
  if (s === 'CONTAINER_EVIDENCED') {
    ok = record.entries.some((x) => x.degree === 'CONTAINER_EVIDENCED' && !x.smokeOnly);
  } else if (s === 'UNIT_EVIDENCED') {
    ok = record.entries.some((x) => x.degree === 'UNIT_EVIDENCED' || x.degree === 'CONTAINER_EVIDENCED');
  }
  return {
    ok,
    invariantId: 'E_STATE_MATCHES_ENTRIES',
    detail: ok ? s : `state '${s}' without its evidence entry`,
  };
}

// ── THE LADDER MACHINE (spec §2.2 — the transitions + the invariants) ──
export const evidenceMachine: MachineDefinition<EvidenceState, EvidenceMachineRecord> = {
  machineId: EVIDENCE_MACHINE_ID,
  states: [...evidenceStates],
  initial: 'NO_EVIDENCE',
  transitions: [
    // UNIT_PASSED: NO_EVIDENCE → UNIT_EVIDENCED (the unit battery passed).
    {
      id: 'unit',
      event: 'UNIT_PASSED',
      from: ['NO_EVIDENCE', 'UNIT_EVIDENCED'],
      to: 'UNIT_EVIDENCED',
      guard: (r) => ({ allowed: r.entries.length < E_RING_CAP * 2, reason: 'ring overflow guard' }),
      apply: (r, e) => appendEntry(r, e, 'UNIT_EVIDENCED', false),
    },
    // CONTAINER_PASS: ANY → CONTAINER_EVIDENCED (the container suite — the STRONGEST).
    {
      id: 'container',
      event: 'CONTAINER_PASS',
      from: ['NO_EVIDENCE', 'UNIT_EVIDENCED', 'CONTAINER_EVIDENCED'],
      to: 'CONTAINER_EVIDENCED',
      guard: (r) => ({ allowed: r.entries.length < E_RING_CAP * 2, reason: 'ring overflow guard' }),
      apply: (r, e) => appendEntry(r, e, 'CONTAINER_EVIDENCED', false),
    },
    // SMOKE_RUN: ANY → UNIT_EVIDENCED with smokeOnly=true (records but NEVER
    // satisfies the container tier — the smokeOnly law).
    {
      id: 'smoke',
      event: 'SMOKE_RUN',
      from: undefined,
      to: 'UNIT_EVIDENCED',
      guard: (r) => ({ allowed: r.entries.length < E_RING_CAP * 2, reason: 'ring overflow guard' }),
      apply: (r, e) => appendEntry(r, e, 'UNIT_EVIDENCED', true),
    },
  ],
  invariants: [
    // E_RING_CAP — the entries ≤ 50.
    (r) => ({ ok: r.entries.length <= E_RING_CAP, invariantId: 'E_RING_CAP', detail: `${r.entries.length}` }),
    // E_STATE_MATCHES_ENTRIES — the degree-state matches the strongest entry.
    (r) => evidenceStateMatchesEntries(r),
  ],
};

// ── THE STEP RE-RUNNER (the pure transition function — the machine's RUN) ──
// Mirrors the PARAGON state-machine.ts step. ORDER IS LOAD-BEARING: the FIRST
// matching transition (event + from-state) wins. I2: a fired transition whose
// applied record did not GROW the triads is an INVARIANT_BREACH (no observation,
// no fire). THE STATE is written by the apply (strongest-wins), so the returned
// `to` is the APPLIED state — the honest machine result, never a blind target.
export function step(
  def: MachineDefinition<EvidenceState, EvidenceMachineRecord>,
  record: EvidenceMachineRecord,
  event: WarheadEvent,
): StepResult<EvidenceState, EvidenceMachineRecord> {
  for (const t of def.transitions) {
    if (t.event !== event.type) continue;
    if (t.from !== undefined && !(t.from as readonly EvidenceState[]).includes(record.state as EvidenceState)) continue;
    const g: GuardResult = t.guard(record, event);
    if (!g.allowed) {
      return { kind: 'UNCHANGED', reason: 'GUARD_FAILED', failState: t.failState };
    }
    const applied = t.apply(record, event);
    // THE I2 LAW — no observation, no fire (the apply must append the triad).
    if (applied.triads.length <= record.triads.length) {
      return { kind: 'INVARIANT_BREACH', invariantId: 'I2_TRIAD_REQUIRED', record };
    }
    // THE HONEST-STATE — run ALL invariants on the applied record.
    if (def.invariants !== undefined) {
      for (const inv of def.invariants) {
        const r = inv(applied);
        if (!r.ok) return { kind: 'INVARIANT_BREACH', invariantId: r.invariantId, record: applied };
      }
    }
    const triad = applied.triads[applied.triads.length - 1]!;
    return { kind: 'TRANSITIONED', from: record.state as EvidenceState, to: applied.state as EvidenceState, record: applied, triad };
  }
  return { kind: 'UNCHANGED', reason: 'NO_MATCHING_TRANSITION' };
}

// ── THE INVARIANT CHECKER (the direct honest-state probe — the tests bind here) ──
export function checkInvariants(record: EvidenceMachineRecord): InvariantResult[] {
  const results: InvariantResult[] = [];
  for (const inv of evidenceMachine.invariants ?? []) results.push(inv(record));
  return results;
}

// ── THE FAIL-CLOSED QUERY (spec §2.2 — queryDegree) ──
// An unknown/unproven scope → UNEVIDENCED, never a guess. The DIST-SCOPE: the
// entries are the CURRENT dist's only — a claim about a DIFFERENT dist
// (claimScope) never satisfies this record's evidence (the F-4-REPLAY).
export function queryDegree(
  record: EvidenceMachineRecord | undefined,
  tier: 'UNIT' | 'CONTAINER',
  claimScope?: string,
): TestingDegree {
  // THE FAIL-CLOSED — an absent record is never evidence.
  if (record === undefined) return 'UNEVIDENCED';
  // THE DIST-SCOPE — a claim about a different dist never satisfies this
  // record's (old-dist) evidence.
  if (claimScope !== undefined && claimScope !== record.scope) return 'UNEVIDENCED';
  // THE FAIL-CLOSED — an unknown/unproven scope is never a guess.
  if (!record.scope) return 'UNEVIDENCED';
  if (tier === 'CONTAINER') {
    // THE SMOKE-ONLY LAW — a smokeOnly entry (or a bare container label with a
    // smoke flag) NEVER satisfies the container tier.
    const hasContainer = record.entries.some((x) => x.degree === 'CONTAINER_EVIDENCED' && !x.smokeOnly);
    return hasContainer ? 'CONTAINER_EVIDENCED' : 'UNEVIDENCED';
  }
  const hasUnit = record.entries.some((x) => x.degree === 'UNIT_EVIDENCED' || x.degree === 'CONTAINER_EVIDENCED');
  return hasUnit ? 'UNIT_EVIDENCED' : 'UNEVIDENCED';
}

// ── THE TIER SATISFACTION (spec §2.2 — satisfiesTier) ──
// CONTAINER requires a CONTAINER_EVIDENCED entry (a smoke entry NEVER satisfies
// the container tier); UNIT requires a UNIT_EVIDENCED entry or higher.
export function satisfiesTier(
  record: EvidenceMachineRecord | undefined,
  tier: 'UNIT' | 'CONTAINER',
  claimScope?: string,
): boolean {
  const d = queryDegree(record, tier, claimScope);
  return tier === 'CONTAINER' ? d === 'CONTAINER_EVIDENCED' : d !== 'UNEVIDENCED';
}
