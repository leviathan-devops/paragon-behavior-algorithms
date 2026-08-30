// src/firewalls/warhead-tracker.ts — THE WARHEAD STATE MACHINE (the 7.6 WARHEAD
// ENFORCEMENT OVERHAUL's C-1 — the spec: docs/TRIDENT_V7.6_WARHEAD_ENFORCEMENT_L0_SPEC.md
// :56-58 the C-1, :66 the C-5 throw-arm matrix, :79-80 the 3.3 dispatch state machine).
// THE SINGLE SOURCE of the per-session warhead-discipline state: the per-warhead
// family records + the compliance verdicts. THE MACHINE answers ONE question: what
// degree of warhead-discipline compliance exists for the current dist? It is the
// 7.5 evidence machine (src/firewalls/evidence-tracker.ts) GENERALIZED into the
// multi-warhead discipline tracking (the L0's C-1: "the 7.5's evidence machine is
// the PROOF-OF-CONCEPT: the 7.6 generalizes it to the multi-warhead discipline
// tracking"). The ISE law's state machine applied: the states as the nodes, the
// events as the transitions, the guards + the effects as the typed per-family
// functions — NEVER a regex tower, NEVER an N-branch classifier, NEVER the magic
// ladder. THE FAIL-CLOSED (the WARHEAD 10): a load failure → the fresh
// PENDING/VIOLATED record + the loud log that NAMES the failure — NEVER a silent
// SATISFIED.
//
// THE DEPENDENCY GRAPH (the L0's data flow): warhead-tracker.ts → agent-state.ts
// (the db helpers — the additive trident_warhead + trident_warhead_events
// migration). This module composes the load/save helpers with the transition core
// + the verdict query. THE C-5 throw-arm matrix (the Wave 4) queries
// queryWarheadVerdict mechanically before the ship/sync/dispatch-class calls
// advance; the Wave-2 predicate lexicons + the Wave-3 T.E.A. composer feed
// ingestWarheadEvent. THE 7.5's machinery is the FROZEN baseline — this module
// never touches it.

import { tridentLog } from '../utils.js';
import {
  initWarheadDb,
  loadWarheadRow,
  loadWarheadEventRows,
  saveWarheadRow,
  insertWarheadEventRow,
  pruneWarheadRecords,
} from '../hooks/agent-state.js';

// ── THE THRESHOLDS (the registers — the evidence machine's pattern) ──
export const WARHEAD_RING_CAP = 50;                  // the ring's cap (the evidence machine's EVIDENCE_RING_CAP = 50 is the template)
export const WARHEAD_RECORD_WINDOW_MS = 86_400_000;  // the 24h pruning window (the evidence machine's EVIDENCE_RECORD_WINDOW_MS)
export const WARHEAD_FAMILIES: readonly WarheadFamily[] =
  ['AUDIT', 'VERIFICATION', 'DECLARATION', 'FUMBLE', 'STRUCTURE'];

// ── THE TYPE CONTRACTS (the C-1 — the 5 warhead families per the L0's C-5 arms) ──

// THE WARHEAD FAMILIES (the C-5's arms the tracker's states track):
//   AUDIT          — the wave-audit file's existence + the per-hunk verdicts (the C-5a audit-before-advance gate)
//   VERIFICATION   — the container-evidence (the C-5b ship gate's requirement)
//   DECLARATION    — the smoke-claims (the C-5c declaration mutation's subject)
//   FUMBLE         — the config/auth/db mutations (the C-5d fumble gates)
//   STRUCTURE      — the DPL1 floors (the task firewall's dispatch-prompt discipline)
export type WarheadFamily = 'AUDIT' | 'VERIFICATION' | 'DECLARATION' | 'FUMBLE' | 'STRUCTURE';

// THE PER-FAMILY STATES: PENDING → SATISFIED + the VIOLATED fail-state. THE
// FAIL-STATE IS NEVER A SILENT PASS (the WARHEAD 9): a family is SATISFIED ONLY
// by its satisfaction event carrying the artifact/signal + the dist match; a
// violation event marks the named family VIOLATED. A fresh satisfaction event
// re-satisfies a VIOLATED family (the remediation — the audit written after a
// violation clears it; a sticky-VIOLATED would deadlock the C-5 gate forever).
export type WarheadState = 'PENDING' | 'SATISFIED' | 'VIOLATED';

// THE EVENT VOCABULARY (the tool events per the L0's C-1 — the task returns, the
// sync writes, the declarations, the container evidence, the violations):
export type WarheadEventKind =
  | 'audit_written'        // the wave-audit file written with the per-hunk verdicts → the AUDIT satisfaction
  | 'container_evidenced'  // the container evidence with the artifact → the VERIFICATION satisfaction
  | 'ship_verified'        // the ship gate's pass (the container evidence present) → the VERIFICATION satisfaction
  | 'declaration'          // a claim declaration — the DECLARATION satisfaction when evidence-backed (evidenceOk)
  | 'task_returned'        // a subagent's task return (the 3.3 RETURNED) — the STRUCTURE satisfaction when DPL1-grade (structureOk)
  | 'sync_written'         // a sync-class write — the FUMBLE satisfaction when the config-lock guard held (guardOk)
  | 'violation';           // a warhead violation — the named family (event.family) → VIOLATED

export interface WarheadEvent {
  kind: WarheadEventKind;
  at: number;                    // the epoch-ms timestamp
  distSha: string;               // the dist the event concerns (the first event adopts; the subsequent must match)
  family?: WarheadFamily;        // the target family — REQUIRED by the violation event (a violation names its family)
  artifact?: string;             // the satisfaction artifact's path (audit_written / container_evidenced / ship_verified REQUIRE it)
  evidenceOk?: boolean;          // the DECLARATION signal — the declaration is backed by the container evidence (a claim without it is the pending arm)
  guardOk?: boolean;             // the FUMBLE signal — the sync write passed the config-lock (no fumble)
  structureOk?: boolean;         // the STRUCTURE signal — the dispatch prompt met the DPL1 floors
  detail?: string;               // the detector's log detail
}

export interface WarheadRecord {
  sessionId: string;
  distSha: string | null;        // null = the session has no dist yet
  states: Record<WarheadFamily, WarheadState>;
  lastAuditAt: number | null;
  lastContainerAt: number | null;
  lastShipAt: number | null;
  lastDeclarationAt: number | null;
  lastFumbleAt: number | null;
  lastStructureAt: number | null;
  events: WarheadEvent[];        // the capped ring — the last WARHEAD_RING_CAP = 50
  updatedAt: number;
}

export type WarheadOverallVerdict = 'SATISFIED' | 'VIOLATED' | 'PENDING';

export interface WarheadFamilyVerdict {
  family: WarheadFamily;
  state: WarheadState;
  satisfiedAt: number | null;
  reason: string;                // the machine's explainability string
}

export interface WarheadVerdict {
  overall: WarheadOverallVerdict;
  families: Record<WarheadFamily, WarheadFamilyVerdict>;
  distSha: string | null;
  reason: string;
}

// THE MACHINE'S PUBLIC SURFACE (the consumers: the C-5 throw-arm matrix, the
// Wave-2 predicate lexicons, the Wave-3 T.E.A. composer):
export interface WarheadTrackerSurface {
  getWarheadState(sessionId: string): WarheadRecord;
  ingestWarheadEvent(sessionId: string, event: WarheadEvent): WarheadRecord;
  queryWarheadVerdict(sessionId: string): WarheadVerdict;
}

// ── THE FRESH-STATE FACTORY (the initial per-family shape — all PENDING) ──
export function freshStates(): Record<WarheadFamily, WarheadState> {
  return {
    AUDIT: 'PENDING',
    VERIFICATION: 'PENDING',
    DECLARATION: 'PENDING',
    FUMBLE: 'PENDING',
    STRUCTURE: 'PENDING',
  };
}

export function freshRecord(sessionId: string, distSha: string | null = null): WarheadRecord {
  return {
    sessionId,
    distSha,
    states: freshStates(),
    lastAuditAt: null,
    lastContainerAt: null,
    lastShipAt: null,
    lastDeclarationAt: null,
    lastFumbleAt: null,
    lastStructureAt: null,
    events: [],
    updatedAt: Date.now(),
  };
}

// ── THE TRANSITION CORE (the C-1 — the guards + the effects separated, the XState
// discipline — the evidence machine's C-1.3 pattern) ──
// The pure core takes (record, event) → record. The side effects (the SQLite
// write, the log) live in the INGEST wrapper, NEVER in the core. Each per-family
// transition is a typed function returning the applied record OR null (null = not
// this family's event OR the guard rejected it) — the ingest dispatches through
// the null-coalescing chain, never an N-branch tower.

// A guard's dist-sha validation: an empty/missing distSha is the MALFORMED event
// class (the adversarial) — the guards reject it, the record unchanged.
function validDistSha(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

// THE DIST ADMISSION: the first event adopts the dist; the subsequent events must
// match it (the evidence machine's C-1.3 pattern).
function distAdmissible(record: WarheadRecord, distSha: string): boolean {
  if (record.distSha === null) return true;
  return distSha === record.distSha;
}

function pushRing(events: WarheadEvent[], event: WarheadEvent): WarheadEvent[] {
  const next = [...events, event];
  return next.length > WARHEAD_RING_CAP ? next.slice(next.length - WARHEAD_RING_CAP) : next;
}

// THE GUARD + EFFECT — the AUDIT family (the wave-audit file's existence + the
// per-hunk verdicts — the C-5a). The artifact (the wave-audit file's path) is
// REQUIRED — a bare "audit done" without the artifact is never satisfied.
function auditTransition(record: WarheadRecord, event: WarheadEvent): WarheadRecord | null {
  if (event.kind !== 'audit_written') return null;
  if (!validDistSha(event.distSha)) return null;
  if (!event.artifact || event.artifact.length === 0) return null;
  if (!distAdmissible(record, event.distSha)) return null;
  return {
    ...record,
    distSha: record.distSha ?? event.distSha,
    states: { ...record.states, AUDIT: 'SATISFIED' },
    lastAuditAt: event.at,
    updatedAt: event.at,
    events: pushRing(record.events, event),
  };
}

// THE GUARD + EFFECT — the VERIFICATION family (the container evidence OR the ship
// gate's pass — the L0's "evidence-pending → container-evidenced" + "ship-pending
// → ship-verified"). BOTH REQUIRE the artifact (the C-5b ship gate's evidence —
// the artifact-less "container tested" is the SMOKE class, never satisfied).
function verificationTransition(record: WarheadRecord, event: WarheadEvent): WarheadRecord | null {
  if (event.kind !== 'container_evidenced' && event.kind !== 'ship_verified') return null;
  if (!validDistSha(event.distSha)) return null;
  if (!event.artifact || event.artifact.length === 0) return null;
  if (!distAdmissible(record, event.distSha)) return null;
  return {
    ...record,
    distSha: record.distSha ?? event.distSha,
    states: { ...record.states, VERIFICATION: 'SATISFIED' },
    lastContainerAt: event.kind === 'container_evidenced' ? event.at : record.lastContainerAt,
    lastShipAt: event.kind === 'ship_verified' ? event.at : record.lastShipAt,
    updatedAt: event.at,
    events: pushRing(record.events, event),
  };
}

// THE GUARD + EFFECT — the DECLARATION family (the smoke-claims — the C-5c): an
// evidence-backed declaration (evidenceOk) satisfies the family; a bare claim is
// the pending arm (the tracking fallback records it without a satisfaction).
function declarationTransition(record: WarheadRecord, event: WarheadEvent): WarheadRecord | null {
  if (event.kind !== 'declaration') return null;
  if (!validDistSha(event.distSha)) return null;
  if (event.evidenceOk !== true) return null;
  if (!distAdmissible(record, event.distSha)) return null;
  return {
    ...record,
    distSha: record.distSha ?? event.distSha,
    states: { ...record.states, DECLARATION: 'SATISFIED' },
    lastDeclarationAt: event.at,
    updatedAt: event.at,
    events: pushRing(record.events, event),
  };
}

// THE GUARD + EFFECT — the FUMBLE family (the config/auth/db mutations — the
// C-5d): a sync write that passed the config-lock guard (guardOk) satisfies the
// family; an actual fumble marks it VIOLATED via the violation event.
function fumbleTransition(record: WarheadRecord, event: WarheadEvent): WarheadRecord | null {
  if (event.kind !== 'sync_written') return null;
  if (!validDistSha(event.distSha)) return null;
  if (event.guardOk !== true) return null;
  if (!distAdmissible(record, event.distSha)) return null;
  return {
    ...record,
    distSha: record.distSha ?? event.distSha,
    states: { ...record.states, FUMBLE: 'SATISFIED' },
    lastFumbleAt: event.at,
    updatedAt: event.at,
    events: pushRing(record.events, event),
  };
}

// THE GUARD + EFFECT — the STRUCTURE family (the DPL1 floors — the task
// firewall's discipline): a task return whose dispatch met the DPL1 floors
// (structureOk) satisfies the family; a thin dispatch is never satisfied.
function structureTransition(record: WarheadRecord, event: WarheadEvent): WarheadRecord | null {
  if (event.kind !== 'task_returned') return null;
  if (!validDistSha(event.distSha)) return null;
  if (event.structureOk !== true) return null;
  if (!distAdmissible(record, event.distSha)) return null;
  return {
    ...record,
    distSha: record.distSha ?? event.distSha,
    states: { ...record.states, STRUCTURE: 'SATISFIED' },
    lastStructureAt: event.at,
    updatedAt: event.at,
    events: pushRing(record.events, event),
  };
}

// THE GUARD + EFFECT — the violation event (the named family → VIOLATED): the
// family field is REQUIRED — a family-less violation is the malformed class.
function violationTransition(record: WarheadRecord, event: WarheadEvent): WarheadRecord | null {
  if (event.kind !== 'violation') return null;
  if (!event.family) return null;
  if (!validDistSha(event.distSha)) return null;
  if (!distAdmissible(record, event.distSha)) return null;
  const states: Record<WarheadFamily, WarheadState> = { ...record.states };
  states[event.family] = 'VIOLATED';
  return {
    ...record,
    distSha: record.distSha ?? event.distSha,
    states,
    updatedAt: event.at,
    events: pushRing(record.events, event),
  };
}

// THE INGEST (the event → the transition dispatch — the single-state-machine
// pattern, never an N-branch tower): the violation FIRST (it is not a satisfaction
// event for any family), then the per-family transitions through the
// null-coalescing chain. THE TRACKING FALLBACK: the declaration / task_returned /
// sync_written events land in the ring (the audit trail — the evidence machine's
// claim/evidence_clear handling) even when their family signal is absent.
export function ingestEvent(record: WarheadRecord, event: WarheadEvent): WarheadRecord {
  if (event.kind === 'violation') return violationTransition(record, event) ?? record;
  const next =
    auditTransition(record, event) ??
    verificationTransition(record, event) ??
    declarationTransition(record, event) ??
    fumbleTransition(record, event) ??
    structureTransition(record, event);
  if (next === null && (event.kind === 'declaration' || event.kind === 'task_returned' || event.kind === 'sync_written')) {
    return { ...record, updatedAt: event.at, events: pushRing(record.events, event) };
  }
  return next ?? record;
}

// ── THE VERDICT QUERY (the machine's output — the C-5 throw-arms' input) ──

function satisfiedAtFor(record: WarheadRecord, family: WarheadFamily): number | null {
  switch (family) {
    case 'AUDIT': return record.lastAuditAt;
    case 'VERIFICATION': return record.lastContainerAt ?? record.lastShipAt;
    case 'DECLARATION': return record.lastDeclarationAt;
    case 'FUMBLE': return record.lastFumbleAt;
    case 'STRUCTURE': return record.lastStructureAt;
  }
}

function reasonFor(family: WarheadFamily, state: WarheadState, record: WarheadRecord): string {
  const dist = record.distSha ?? '(none)';
  const at = satisfiedAtFor(record, family);
  switch (family) {
    case 'AUDIT':
      if (state === 'SATISFIED') return `audit-done: the wave-audit artifact recorded at ${at} for dist ${dist}`;
      if (state === 'VIOLATED') return `audit VIOLATED: the wave-audit discipline broken for dist ${dist}`;
      return `audit-pending: no wave-audit artifact recorded for dist ${dist}`;
    case 'VERIFICATION':
      if (state === 'SATISFIED') return `container-evidenced: the container evidence recorded at ${at} for dist ${dist}`;
      if (state === 'VIOLATED') return `verification VIOLATED: the evidence discipline broken for dist ${dist}`;
      return `evidence-pending: no container evidence recorded for dist ${dist}`;
    case 'DECLARATION':
      if (state === 'SATISFIED') return `declaration-backed: the last declaration carried the evidence at ${at} for dist ${dist}`;
      if (state === 'VIOLATED') return `declaration VIOLATED: a theatrical smoke-claim detected for dist ${dist}`;
      return `declaration-pending: no evidence-backed declaration recorded for dist ${dist}`;
    case 'FUMBLE':
      if (state === 'SATISFIED') return `fumble-guarded: the sync writes passed the config-lock at ${at} for dist ${dist}`;
      if (state === 'VIOLATED') return `fumble VIOLATED: a config/auth/db mutation detected for dist ${dist}`;
      return `fumble-pending: no guarded sync write recorded for dist ${dist}`;
    case 'STRUCTURE':
      if (state === 'SATISFIED') return `structure-verified: the dispatches met the DPL1 floors at ${at} for dist ${dist}`;
      if (state === 'VIOLATED') return `structure VIOLATED: a thin dispatch (the DPL1 floors missed) for dist ${dist}`;
      return `structure-pending: no DPL1-grade dispatch recorded for dist ${dist}`;
  }
}

function computeOverall(states: Record<WarheadFamily, WarheadState>): WarheadOverallVerdict {
  // THE VERDICT MATRIX (the C-1's contract): the SATISFIED only when ALL families
  // satisfied, the VIOLATED when ANY family violated — the element-loop, never the
  // spread of a huge array (the F-77/78 spread-arguments class).
  let allSatisfied = true;
  let anyViolated = false;
  for (const family of WARHEAD_FAMILIES) {
    const s = states[family];
    if (s === 'VIOLATED') anyViolated = true;
    if (s !== 'SATISFIED') allSatisfied = false;
  }
  if (anyViolated) return 'VIOLATED';
  if (allSatisfied) return 'SATISFIED';
  return 'PENDING';
}

function familiesOutstanding(states: Record<WarheadFamily, WarheadState>, target: WarheadState): WarheadFamily[] {
  const out: WarheadFamily[] = [];
  for (const family of WARHEAD_FAMILIES) {
    if (states[family] === target) out.push(family);
  }
  return out;
}

export function queryVerdict(record: WarheadRecord): WarheadVerdict {
  // THE FAIL-CLOSED PERSISTENCE CONTRACT (the WARHEAD 10): the record's absence /
  // unavailability = the PENDING verdict, NEVER a silent SATISFIED. The caller
  // (the load layer) returns a fresh all-PENDING record on the db error — the
  // machine's query never fabricates compliance.
  const families = {} as Record<WarheadFamily, WarheadFamilyVerdict>;
  for (const family of WARHEAD_FAMILIES) {
    families[family] = {
      family,
      state: record.states[family],
      satisfiedAt: satisfiedAtFor(record, family),
      reason: reasonFor(family, record.states[family], record),
    };
  }
  const overall = computeOverall(record.states);
  const dist = record.distSha ?? '(none)';
  let reason: string;
  if (overall === 'VIOLATED') {
    const v = familiesOutstanding(record.states, 'VIOLATED');
    reason = `VIOLATED: the warhead families ${v.join(', ')} violated for dist ${dist}`;
  } else if (overall === 'SATISFIED') {
    reason = `SATISFIED: all ${WARHEAD_FAMILIES.length} warhead families satisfied for dist ${dist}`;
  } else {
    const p = familiesOutstanding(record.states, 'PENDING');
    reason = `PENDING: the warhead families ${p.join(', ')} outstanding for dist ${dist}`;
  }
  return { overall, families, distSha: record.distSha, reason };
}

// ── THE PERSISTENCE (the agent-state migration's tables) ──

export function loadWarheadRecord(sessionId: string): WarheadRecord {
  // THE FAIL-CLOSED LOAD (the WARHEAD 10): a db error → the fresh all-PENDING
  // record + the loud log that NAMES the failure. A record load failure is NEVER
  // a silent SATISFIED — the machine's fail-state is PENDING.
  try {
    const row = loadWarheadRow(sessionId);
    if (!row) return freshRecord(sessionId);
    const eventRows = loadWarheadEventRows(sessionId, WARHEAD_RING_CAP);
    const events: WarheadEvent[] = eventRows.reverse().map((r) => ({
      kind: r.kind as WarheadEventKind,
      family: r.family ? (r.family as WarheadFamily) : undefined,
      at: r.at,
      distSha: r.dist_sha ?? '',
      artifact: r.artifact ?? undefined,
      detail: r.detail ?? undefined,
    }));
    return {
      sessionId,
      distSha: row.dist_sha,
      states: parseStates(row.states),
      lastAuditAt: row.last_audit_at,
      lastContainerAt: row.last_container_at,
      lastShipAt: row.last_ship_at,
      lastDeclarationAt: row.last_declaration_at,
      lastFumbleAt: row.last_fumble_at,
      lastStructureAt: row.last_structure_at,
      events,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    tridentLog('ERROR', 'warhead-tracker', `warhead record load failed for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
    return freshRecord(sessionId);
  }
}

// THE STATES JSON PARSER (the fail-closed: a corrupt/invalid states column → the
// fresh all-PENDING states — NEVER a silent SATISFIED):
function parseStates(raw: string | null): Record<WarheadFamily, WarheadState> {
  if (!raw) return freshStates();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    tridentLog('ERROR', 'warhead-tracker', `warhead states json parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return freshStates();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    tridentLog('ERROR', 'warhead-tracker', 'warhead states json invalid (not an object)');
    return freshStates();
  }
  const src = parsed as Record<string, unknown>;
  const out = freshStates();
  let valid = true;
  for (const family of WARHEAD_FAMILIES) {
    const v = src[family];
    if (v === 'SATISFIED' || v === 'VIOLATED' || v === 'PENDING') {
      out[family] = v;
    } else {
      valid = false;
    }
  }
  if (!valid) {
    tridentLog('ERROR', 'warhead-tracker', 'warhead states json invalid (unknown family states)');
    return freshStates();
  }
  return out;
}

export function saveWarheadRecord(record: WarheadRecord, persistEvent = true): void {
  // THE WRITE (the upsert + the event append) + the PRUNING (the
  // WARHEAD_RECORD_WINDOW_MS window). The last ring event is appended to the
  // durable mirror ONLY when the ingest consumed it (persistEvent) — a REJECTED
  // event (the guard refused it) is logged, never re-inserted as a duplicate row.
  // A save failure LOGS + PROPAGATES — the caller sees the error.
  try {
    saveWarheadRow({
      session_id: record.sessionId,
      dist_sha: record.distSha,
      states: JSON.stringify(record.states),
      last_audit_at: record.lastAuditAt,
      last_container_at: record.lastContainerAt,
      last_ship_at: record.lastShipAt,
      last_declaration_at: record.lastDeclarationAt,
      last_fumble_at: record.lastFumbleAt,
      last_structure_at: record.lastStructureAt,
      updated_at: record.updatedAt,
    });
    if (persistEvent) {
      const last = record.events.length > 0 ? record.events[record.events.length - 1] : null;
      if (last) {
        insertWarheadEventRow({
          session_id: record.sessionId,
          kind: last.kind,
          family: last.family ?? null,
          at: last.at,
          dist_sha: last.distSha,
          artifact: last.artifact ?? null,
          detail: last.detail ?? null,
        });
      }
    }
    pruneWarheadRecords(Date.now() - WARHEAD_RECORD_WINDOW_MS);
  } catch (err) {
    tridentLog('ERROR', 'warhead-tracker', `warhead record save failed for ${record.sessionId}: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// ── THE PUBLIC SURFACE (the C-1 — the C-5 throw-arms' consumption point) ──

export function getWarheadState(sessionId: string): WarheadRecord {
  initWarheadDb();
  return loadWarheadRecord(sessionId);
}

export function ingestWarheadEvent(sessionId: string, event: WarheadEvent): WarheadRecord {
  initWarheadDb();
  const record = loadWarheadRecord(sessionId);
  const next = ingestEvent(record, event);
  // THE NO-OP LOG (the evidence machine's C-1.3 :548 pattern): a guard-rejected
  // event is never a silent swallow — the rejection is logged, the record saved
  // without a duplicate event row (the ring stays consistent).
  if (next !== record) {
    saveWarheadRecord(next);
  } else {
    saveWarheadRecord(next, false);
    tridentLog('WARN', 'warhead-tracker', `event rejected (no transition) for ${sessionId}: kind=${event.kind} family=${event.family ?? '(none)'} distSha=${event.distSha || '(empty)'}`);
  }
  return next;
}

export function queryWarheadVerdict(sessionId: string): WarheadVerdict {
  initWarheadDb();
  const record = loadWarheadRecord(sessionId);
  return queryVerdict(record);
}

export const warheadTrackerSurface: WarheadTrackerSurface = {
  getWarheadState,
  ingestWarheadEvent,
  queryWarheadVerdict,
};
