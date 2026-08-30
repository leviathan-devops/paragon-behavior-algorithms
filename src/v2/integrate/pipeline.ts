// src/v2/integrate/pipeline.ts — THE BRAIN CONSUMPTION LEG (spec §2.4-§2.8)
//
// THE GAP THIS FILE CLOSES (found by the operator 2026-08-23): capture → lexicon
// → synapse was wired, but NOTHING consumed the synapse state — stepV2,
// dispatchDirective and detectPatterns were orphaned modules (unit-green, live-
// dead: the exact mock-split class). This module is the LIVE consumer:
//
//   processBatch(signals) ──► synapse.accumulate ──► onSignals(weighted):
//       ├─ stepV2(FIRST_SIGNAL | SIGNAL)          IDLE→MONITORING (+counters)
//       ├─ detectPatterns(window, ledger, cadence) ──► stepV2(PATTERN_HIT)
//       │                                              MONITORING→PRIMED
//       └─ maybeCool(seq)                            INTERVENING→MONITORING
//            at refractory exit
//   enforcement surfaces (tool.before / messages.transform) ──► tryIntervene():
//       stepV2(INTERVENE) PRIMED→INTERVENING ──► dispatchDirective(...) ──►
//       TOOL_PREPEND (FULL, deny-with-reason) | STEER_INJECT (STEER/FULL,
//       F-69-style in-band append) ──► D3 evidence feed row.
//
// THE PERSISTENCE LAW: the V2Record survives restarts (machine-state.json under
// PARAGON_TMP_DIR/v2/) via loadOrFresh — corrupt state yields FRESH, never
// half-parsed. THE OBSERVER LAW: every transition/breach lands in the
// interventions ledger; an IO failure never breaks the caller.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { EvidenceTriad, Severity, WarheadEvent } from '../../lasme/contracts.js';
import {
  createInitialV2Record,
  loadOrFresh,
  migrateV2Record,
  REFRACTORY_SEQ_WINDOW,
  COMPLIANCE_DEBOUNCE_WINDOW,
  stepV2,
  v2MachineDefinition,
  V2_MACHINE_ID,
  type V2Record,
  type V2State,
} from '../machines/v2-machine.js';
import {
  detectPatterns,
  type CadenceWindow,
  type PatternWindow,
  type V1LedgerView,
} from '../counters/macro-patterns.js';
import { dispatchDirective } from '../enforcement/router.js';
import { getV2Synapse } from '../capture/event-router.js';
import { writeEvidence } from '../evidence/ledger-writer.js';
import {
  PARAGON_TMP_DIR,
  type EnforcementDirective,
  type EnforcementVerb,
  type MacroPatternHit,
  type V2Level,
  type ViolationFamily,
  type WeightedViolation,
} from '../contracts.js';
import { V2ComplianceCollector } from '../enforce/compliance-collector.js';
import { CheckpointManager } from '../enforce/checkpoint-manager.js';
import { CircuitBreakerMachine } from '../enforce/circuit-breaker-machine.js';
import { GateEngine } from '../enforce/gate-engine.js';
import { MultiStageGate } from '../enforce/multi-stage-gate.js';
import { WeightedGate } from '../enforce/weighted-gate.js';
import { StateInspector } from '../enforce/state-inspector.js';
import { V2_TIER_PRESETS } from '../enforce/gate-criteria.js';
import { latchDecay } from '../../firewalls/sttgf-firewall.js';
import type { EvidenceRecord } from '../enforce/evidence-record.js';

// ── THE LEVEL DIAL (owned by shared-state.ts; pipeline consumes it) ────────
import { getV2EnforcementLevel, setV2EnforcementLevel as setSharedEnforcementLevel, registerOnSignals, TRIDENT_V2_PROBE_VERBOSE } from '../shared-state.js';
export { getV2EnforcementLevel };
export const STALE_RECORD_SEQ_GAP = 200;

// F-HARDEN-S13: evidence-pool snapshot for gate-eval verdicts - answers WHY a
// verdict fired (pool-empty? stale-by-TTL? type-gap?) instead of leaving
// INCONCLUSIVE unexplained. Consumed by steer-tier investigation (S13).
function gatePoolSnapshot(evidence: EvidenceRecord[], now = Date.now()): Record<string, unknown> {
  let audit = 0, testResult = 0, fresh = 0;
  let oldest = Number.MAX_SAFE_INTEGER, newest = 0;
  for (const r of evidence) {
    if (r.type === 'audit_log') audit++;
    if (r.type === 'test_result') testResult++;
    const age = now - (r.timestamp || 0);
    if (age >= 0 && age <= 300000) fresh++;
    if ((r.timestamp || 0) < oldest) oldest = r.timestamp || 0;
    if ((r.timestamp || 0) > newest) newest = r.timestamp || 0;
  }
  return { total: evidence.length, audit, testResult, freshIn5m: fresh, oldestTs: evidence.length ? oldest : null, newestTs: evidence.length ? newest : null };
}

let cachedDistIdentity: string | null = null;
export function resolveDistIdentity(): string {
  if (cachedDistIdentity !== null) return cachedDistIdentity;
  const env = String((process.env as Record<string, string | undefined>).TRIDENT_DEPLOYED_SHA ?? '').trim();
  if (env) { cachedDistIdentity = env; return cachedDistIdentity; }
  const g = globalThis as Record<string, unknown>;
  if (typeof g.__tridentDistIdentity === 'string' && (g.__tridentDistIdentity as string).length > 0) { cachedDistIdentity = g.__tridentDistIdentity as string; return cachedDistIdentity; }
  try {
    const p = path.join(process.cwd(), 'dist', 'index.js');
    if (fs.existsSync(p)) { cachedDistIdentity = createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16); return cachedDistIdentity; }
  } catch {}
  cachedDistIdentity = '';
  return cachedDistIdentity;
}
export function __clearDistIdentityCacheForTests(): void { cachedDistIdentity = null; }

export function setV2EnforcementLevel(level: V2Level): void {
  setSharedEnforcementLevel(level);
  for (const [sid, r] of records) {
    if (r.level !== level) {
      records.set(sid, { ...r, level });
      persist(r);
    }
  }
  writeEvidence('enforcement', { kind: 'v2-level-set', level });
}

// ── WAVE 5 ENFORCE MACHINERY SINGLETONS (W2/W3/W4) ─────────────────────
export const v2ComplianceCollector = new V2ComplianceCollector(`v2-compliance-${Date.now()}`);
export const checkpointManager = new CheckpointManager({
  dbPath: path.join(PARAGON_TMP_DIR, 'v2', 'v2-escalation.db'),
  machineId: V2_MACHINE_ID,
  sessionId: 'runtime',
});
export const circuitBreaker = new CircuitBreakerMachine(3, 0);
export const gateEngine = new GateEngine();
export const multiStageGate = new MultiStageGate(gateEngine, [
  { name: 'steer', gateId: 'v2-steer' },
  { name: 'demand', gateId: 'v2-demand' },
  { name: 'deny', gateId: 'v2-deny' },
]);
export const weightedGate = new WeightedGate([
  { name: 'signal', weight: 1, test: (ev) => ev.some((r) => r.type === 'audit_log') },
  { name: 'compliance', weight: 2, test: (ev) => ev.some((r) => r.type === 'test_result' && (r.data as Record<string, unknown>).verified === true) },
], 0.5);
export const stateInspector = new StateInspector();

// Register tier gates (doctrine GateCriteria shape)
// F-HARDEN-S8: canonical presets sourced from gate-criteria.ts (single source of truth).
// NOTE (zero-trust): preset values verified EQUIVALENT to these literals — steering-tier
// INCONCLUSIVE persistence is NOT criteria-valued (evidence-pool state at eval time is the
// suspect); Wave-D instruments the pool to isolate the true mechanism.
try {
  for (const g of Object.values(V2_TIER_PRESETS)) {
    gateEngine.registerGate(g as Parameters<typeof gateEngine.registerGate>[0]);
  }
} catch { /* idempotent on hot reload */ }

// StateInspector registration deferred until records map exists (see below after records definition)

// ── PERSISTENCE ──────────────────────────────────────────────────────────────
const STATE_DIR = path.join(PARAGON_TMP_DIR, 'v2');
const SYNAPSE_STATE_PATH = path.join(PARAGON_TMP_DIR, 'counters', 'synapse-state.json');
// SESSION-SCOPED machine state (the spillover fix, 2026-08-28): one file PER
// SESSION — v2/machine-state-<sid>.json. The legacy single machine-state.json
// is read ONLY by its own recorded sessionID (legacy restore), never by a
// sibling session.
function machineStatePath(sid: string): string {
  const safe = sid.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'runtime';
  return path.join(STATE_DIR, `machine-state-${safe}.json`);
}
const LEGACY_MACHINE_STATE_PATH = path.join(STATE_DIR, 'machine-state.json');

// ═══ THE SYNAPSE SNAPSHOT (spec §2.5 — the λ decay curves' restart recovery),
// SESSION-SCOPED (the spillover fix, 2026-08-28): one file PER SESSION —
// counters/synapse-state-<sid>.json — so session A's curves never restore into
// session B's synapse and concurrent persists never clobber a sibling session.
// Same atomic tmp+rename discipline as persist().
function synapseStatePath(sid: string): string {
  const safe = sid.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'default';
  return path.join(PARAGON_TMP_DIR, 'counters', `synapse-state-${safe}.json`);
}
function persistSynapse(sid: string): void {
  try {
    const target = synapseStatePath(sid);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const snap = { sessionID: sid, snapshot: getV2Synapse(sid).snapshot(), bootId, savedAt: Date.now() };
    const tmp = target + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(snap));
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error('[v2-pipeline] synapse snapshot failed:', err instanceof Error ? err.message : err);
  }
}

function restoreSynapse(): void {
  try {
    const dir = path.join(PARAGON_TMP_DIR, 'counters');
    let restored = 0;
    let files: string[] = [];
    try { files = fs.readdirSync(dir).filter((f) => f.startsWith('synapse-state-') && f.endsWith('.json')); } catch { /* absent dir: fresh curves */ }
    for (const f of files) {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as { sessionID?: string; snapshot?: Record<string, { lambda?: number; primed?: boolean }> };
        const sid = typeof parsed.sessionID === 'string' && parsed.sessionID !== '' ? parsed.sessionID : f.slice('synapse-state-'.length, -'.json'.length);
        if (parsed.snapshot) { getV2Synapse(sid).restore(parsed.snapshot); restored += 1; }
      } catch { /* one corrupt session file never blocks the rest */ }
    }
    // LEGACY single-file snapshot (pre-session-scoping): restores into the
    // 'default' session only — never into a live session's curves.
    try {
      const legacy = JSON.parse(fs.readFileSync(SYNAPSE_STATE_PATH, 'utf-8')) as { snapshot?: Record<string, { lambda?: number; primed?: boolean }> };
      if (legacy.snapshot && !files.includes('synapse-state-default.json')) { getV2Synapse('default').restore(legacy.snapshot); restored += 1; }
    } catch { /* legacy file absent — fine */ }
    if (restored > 0) writeEvidence('enforcement', { kind: 'v2-synapse-restored', sessions: restored });
  } catch { /* first boot / absent file: fresh curves are correct */ }
}

// THE ATOMIC PERSIST (HT-BUG-4 fix leg 1): writeFileSync TRUNCATES the target
// before writing — a concurrent boot-time reader in another opencode process
// reads PARTIAL JSON, JSON.parse throws, and loadInitial's catch silently
// returns a FRESH record: the restart-amnesia mechanism. tmp-file + rename is
// POSIX-atomic — readers see either the OLD complete file or the NEW one.
let bootId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
function persist(record: V2Record): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const target = machineStatePath(record.sessionID);
    const tmp = target + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify({ ...record, savedAt: Date.now(), bootId }));
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error('[v2-pipeline] persist failed:', err instanceof Error ? err.message : err);
  }
}

// THE BOOT TRACE (HT-BUG-4 fix leg 2): every load outcome lands in the ledger —
// attempted / file-existed / parse-verdict / validation-verdict / pid+bootId.
// The silent catch was the amnesia's blind spot: fresh-starts were INVISIBLE,
// so the atSeq-reset symptom had no failing-leg evidence. One boot now prints
// exactly which leg failed (missing file vs partial-read vs invalid record).
function loadInitial(sid: string): V2Record {
  const trace: Record<string, unknown> = { kind: 'v2-boot-trace', pid: process.pid, bootId, sessionID: sid };
  // THE CANDIDATE FILES: this session's own file first; the legacy single-file
  // snapshot second — but ONLY if its record belongs to THIS session (the
  // spillover fix: a sibling session's machine state never arms this one).
  const candidates: Array<{ p: string; legacy: boolean }> = [
    { p: machineStatePath(sid), legacy: false },
    { p: LEGACY_MACHINE_STATE_PATH, legacy: true },
  ];
  try {
    let existed = false;
    let size = -1;
    let usedPath = '';
    let usedLegacy = false;
    for (const c of candidates) {
      try {
        size = fs.statSync(c.p).size;
        existed = true;
        usedPath = c.p;
        usedLegacy = c.legacy;
        break;
      } catch { /* ENOENT — try the next candidate */ }
    }
    trace.fileExisted = existed;
    trace.fileSize = size;
    if (!existed) {
      writeEvidence('enforcement', { ...trace, verdict: 'FIRST_BOOT_FRESH' });
      return createInitialV2Record('runtime', getV2EnforcementLevel());
    }
    const raw = fs.readFileSync(usedPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      // THE PARTIAL-READ SIGNATURE (the race this fix kills): log the head bytes
      trace.parseError = String((parseErr as Error)?.message ?? parseErr);
      trace.rawHead = raw.slice(0, 80);
      writeEvidence('enforcement', { ...trace, verdict: 'PARSE_FAIL_FRESH' });
      return createInitialV2Record('runtime', getV2EnforcementLevel());
    }
    const asRecord = parsed as Record<string, unknown> | null;
    const recordedSid = typeof asRecord?.['sessionID'] === 'string' ? (asRecord['sessionID'] as string) : '';
    if (usedLegacy && recordedSid !== sid) {
      // The legacy file holds a DIFFERENT session's brain — spillover refused.
      trace.legacyRefused = recordedSid;
      writeEvidence('enforcement', { ...trace, verdict: 'LEGACY_FOREIGN_SESSION_FRESH' });
      return createInitialV2Record('runtime', getV2EnforcementLevel());
    }
    const res = loadOrFresh(v2MachineDefinition, parsed, () =>
      createInitialV2Record('runtime', getV2EnforcementLevel()),
    );
    if (!res.recovered) {
      // Migrate old persisted records missing Wave 5 tier fields (backward compat)
      const maybeMigrated = migrateV2Record(res.record as unknown as V2Record);
      if (maybeMigrated !== res.record) {
        (res as unknown as { record: V2Record }).record = maybeMigrated;
      }
    }
    if (res.recovered) {
      trace.validationVerdict = 'INVALID_RECORD_FRESH';
      writeEvidence('enforcement', { ...trace, kind2: 'v2-machine-recovered-fresh' });
    } else {
      trace.validationVerdict = 'RESUMED';
      trace.resumedState = res.record.state;
      trace.resumedSeq = res.record.seq;
      writeEvidence('enforcement', trace);
    }
    return res.record.level === getV2EnforcementLevel()
      ? res.record
      : { ...res.record, level: getV2EnforcementLevel() };
  } catch (err) {
    // THE LAST-RESORT CATCH IS NO LONGER SILENT:
    writeEvidence('enforcement', { ...trace, verdict: 'LOAD_THROW_FRESH', error: String((err as Error)?.message ?? err) });
    return createInitialV2Record('runtime', getV2EnforcementLevel());
  }
}

// THE PER-SESSION RECORD STORE (the spec-fidelity deviation fix): ONE brain
// per session — cross-session hosts no longer share refractory/counters.
// 'runtime' remains the default key for signals lacking a session anchor.
const records = new Map<string, V2Record>();

function recordFor(sid: string): V2Record {
  let r = records.get(sid);
  if (!r) {
    r = loadInitial(sid);
    if (r.sessionID !== sid) r = { ...r, sessionID: sid };
    records.set(sid, r);
  }
  return r;
}

function setRecord(sid: string, r: V2Record): void {
  records.set(sid, r);
}

function demoteStaleGhosts(primarySid: string): void {
  const primary = records.get(primarySid) as V2Record | undefined;
  const nowSeq = seqNow();
  const primarySeq = primary ? primary.seq : nowSeq;
  for (const [rsid, rrec] of [...records.entries()]) {
    if (rsid === primarySid) continue;
    const st = (rrec as V2Record).state;
    if (st !== 'PRIMED' && st !== 'INTERVENING') continue;
    const recSeq = (rrec as V2Record).seq;
    const gap = nowSeq - recSeq;
    if (gap > STALE_RECORD_SEQ_GAP) {
      writeEvidence('enforcement', { kind: 'v2-ghost-demoted', sid: rsid, recSeq, gap });
      const demoted = { ...(rrec as V2Record), state: 'MONITORING' as V2State };
      records.set(rsid, demoted);
      try { persist(demoted); } catch {}
    }
  }
  void primarySeq;
}

// Persist escalation state via CheckpointManager at stable tier boundaries (W3)
// autoCheckpoint:false — manual 4-arg save only.
const historyBySession = new Map<string, Array<{ from: string; to: string; event: string; seq: number; timestamp: number }>>();
function checkpointAtStableBoundary(sid: string, rec: V2Record, evidence: EvidenceRecord[]): void {
  try {
    const hist = historyBySession.get(sid) ?? [];
    // Stable boundaries: MONITORING after comply/cool, or INTERVENING after intervene/escalate
    const isStable = rec.state === 'MONITORING' || (rec.state === 'INTERVENING' && rec.tier >= 1);
    if (!isStable) return;
    checkpointManager.save(rec.state, rec as unknown as Record<string, unknown>, hist as unknown as Array<{ from: string; to: string; event: string; seq?: number; timestamp?: number }>, evidence);
    writeEvidence('enforcement', { kind: 'v2-checkpoint', sid, tier: rec.tier, state: rec.state, histLen: hist.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[v2-pipeline] checkpointAtStableBoundary failed: ${msg}`);
    writeEvidence('enforcement', { kind: 'v2-checkpoint-error', error: msg });
  }
}

// Register StateInspector now that records exists
try {
  stateInspector.register('v2-machine', {
    getSnapshot: () => {
      const r = records.get('runtime');
      if (!r) return { value: 'no-record', context: {} };
      return { value: r.state, context: { tier: (r as V2Record).tier, denialCount: (r as V2Record).denialCount, lastComplianceVerified: (r as V2Record).lastComplianceVerified, complianceDeadlineSeq: (r as V2Record).complianceDeadlineSeq, circuit: circuitBreaker.getState(), level: r.level } };
    },
  });
} catch { /* idempotent */ }

// ── THE SIGNAL WINDOW + EXTERNAL VIEWS ───────────────────────────────────────
const SIGNAL_WINDOW_CAP = 50;
const signalWindow: WeightedViolation[] = [];
let lastInterventionSeq = -1;
let lastDemandSeq = -1; // FORGERY_AFTER_WARHEAD's anchor — noteV1Delivery() sets it
// THE E-05 REDISPATCH TRACKER: the last tier actually dispatched per session —
// the tier-escalation redispatch fires when the record's tier exceeds this.
const lastDispatchedTier = new Map<string, number>();

const ledgerView: V1LedgerView = {
  lastDeliveredWithin(k: number): boolean {
    return lastDemandSeq >= 0 && seqNow() - lastDemandSeq <= k;
  },
};

const cadenceView: CadenceWindow = {
  testToolCallsInWindow(sessionID: string): number {
    try {
      // Lazy import avoids the tool-cadence ↔ pipeline init-order coupling.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../capture/tool-cadence-plane.js') as {
        cadencePlane: { testToolCallsInWindow(sessionID?: string): number };
      };
      return mod.cadencePlane.testToolCallsInWindow(sessionID || undefined);
    } catch {
      return 0;
    }
  },
};

function seqNow(): number {
  let mx = 0;
  for (const r of records.values()) if (r.seq > mx) mx = r.seq;
  return mx;
}

// ── TRIAD FACTORY (the no-triad-no-record law — every fired transition grows) ─
const FAMILY_SEVERITY: Record<ViolationFamily, Severity> = {
  FORGERY_INTENT: 'CRITICAL',
  THEATRICAL_PLANNING: 'HIGH',
  TEST_EVASION: 'HIGH',
  PERMISSION_GATE: 'MEDIUM',
  DOUBT_HEDGE: 'LOW',
  SCOPE_SHRINK: 'LOW',
};

function triadFor(from: string, to: string, memberId: string, family: ViolationFamily, line: number): EvidenceTriad {
  return {
    pattern: { memberId, familySeverity: FAMILY_SEVERITY[family] },
    state: { machineId: V2_MACHINE_ID, from, to },
    evidence: { file: 'src/v2/integrate/pipeline.ts', line },
  };
}

// ── THE STEP HELPER (loud on breach; every outcome observed in the ledger) ───
restoreSynapse();

let feedCounter = 0;
function feed(sid: string, eventType: string, payload: Record<string, unknown>): boolean {
  const rec = recordFor(sid);
  const event: WarheadEvent = {
    type: eventType,
    sessionId: rec.sessionID,
    agentOrigin: true,
    payload,
    receivedAtSeq: rec.seq,
  };
  feedCounter += 1;
  let outcome: ReturnType<typeof stepV2>;
  try {
    outcome = stepV2(rec, event);
  } catch (err) {
    // V2InvariantBreachError — LOUD in the ledger, never success-dressed.
    writeEvidence('enforcement', {
      kind: 'v2-invariant-breach',
      event: eventType,
      detail: String((err as Error)?.message ?? err),
      atSeq: rec.seq,
    });
    return false;
  }
  if (outcome.kind === 'TRANSITIONED') {
    setRecord(sid, outcome.record);
    // History for checkpoint manager
    try {
      const h = historyBySession.get(sid) ?? [];
      h.push({ from: outcome.from, to: outcome.to, event: eventType, seq: outcome.record.seq, timestamp: Date.now() });
      if (h.length > 100) h.splice(0, h.length - 100);
      historyBySession.set(sid, h);
    } catch { /* non-fatal */ }
    // Circuit breaker sync for escalation/compliance transitions
    try {
      if (eventType === 'COMPLIANCE_VERIFIED') circuitBreaker.recordSuccess();
      if (eventType === 'COMPLIANCE_FAILED') circuitBreaker.recordFailure();
      if (outcome.record.tier === 4 && outcome.record.denialCount >= 3) {
        // SOLVE tier maps to mandate-mode circuit open — ensure open if not already
        if (circuitBreaker.getState() !== 'open') {
          for (let i = circuitBreaker.getFailureCount(); i < 3; i++) circuitBreaker.recordFailure();
        }
      }
    } catch { /* non-fatal */ }
    writeEvidence('enforcement', {
      kind: 'v2-machine-transition',
      event: eventType,
      from: outcome.from,
      to: outcome.to,
      atSeq: outcome.record.seq,
      tier: (outcome.record as V2Record).tier,
      denialCount: (outcome.record as V2Record).denialCount,
      counters: outcome.record.counters,
    });
    persist(outcome.record);
    // Checkpoint at stable tier boundaries (W3) — 4-arg save
    try {
      const evidenceSnap = v2ComplianceCollector.getRecords();
      checkpointAtStableBoundary(sid, outcome.record, evidenceSnap);
    } catch { /* non-fatal */ }
    return true;
  }
  if (outcome.kind === 'INCONCLUSIVE') {
    writeEvidence('enforcement', {
      kind: 'v2-guard-inconclusive',
      event: eventType,
      stage: outcome.stage,
      detail: outcome.detail,
      atSeq: rec.seq,
    });
    return false;
  }
  // UNCHANGED — a legal non-transition (guard refused / no match). Observed at
  // debug verbosity only when it matters (PRIMED blocked by ineligible surface).
  if (eventType === 'INTERVENE') {
    writeEvidence('enforcement', {
      kind: 'v2-intervene-blocked',
      reason: outcome.reason,
      failState: outcome.failState,
      atSeq: rec.seq,
    });
  }
  return false;
}

// ── PUBLIC API 1 — THE BATCH CONSUMPTION (event-router.processBatch calls) ───
export function onSignals(weighted: ReadonlyArray<WeightedViolation>, seq: number): void {
  // HT-BUG-5 FIX (the starvation gap): cool-down runs on EVERY batch tick —
  // signal-less honest stretches MUST still be able to exit refractory.
  for (const sid of sessionKeys()) maybeCoolFor(sid, seq);
  if (weighted.length === 0) return;
  // ── CLASSIFIER NOTE (GAP-1 closed) ─────────────────────────────────────────
  // Confidence modulation lives ONLY in event-router.processBatch (spec §2.7 —
  // the per-signal spec ladder + the batch-wide FI-1 intent scan). Signals
  // arriving here are already confidence-gated upstream: lexicon survivors
  // passed the ≥DAMPEN band, synthetic intent violations carry ≥ENFORCE
  // confidence. A re-classification over 200-char excerpts is structurally
  // unsound (behavioral excerpts like 'file-ghosting missing=…' score zero in
  // the text banks and would kill legitimate signals at the last hop) — this
  // leg intentionally does none.
  const modulated: WeightedViolation[] = [...weighted] as WeightedViolation[];
  // GAP-2 note: behavioral signals are evaluated ONCE in event-router's
  // processBatch (the batch text + tool metadata live there) and arrive here
  // inside `weighted`. A second evaluation at the same seq would double-feed
  // the machine — this leg intentionally has none.

  const sid = modulated[0]?.anchor.sessionID || 'runtime';
  // push modulated signals into window (behavioral arrives pre-merged inside modulated)
  const windowSignals: WeightedViolation[] = modulated;
  for (const s of windowSignals) {
    const rec = recordFor(sid);
    const isFirst = rec.state === 'IDLE';
    feed(
      sid,
      isFirst ? 'FIRST_SIGNAL' : 'SIGNAL',
      {
        family: s.family,
        memberId: s.memberId,
        weight: s.weight,
        excerpt: s.excerpt.substring(0, 120),
        triad: triadFor(rec.state, 'MONITORING', s.memberId, s.family, 200),
      },
    );
    signalWindow.push(s);
  }
  if (signalWindow.length > SIGNAL_WINDOW_CAP) {
    signalWindow.splice(0, signalWindow.length - SIGNAL_WINDOW_CAP);
  }
  persistSynapse(sid); // spec §2.5: per-session counter snapshots on every fire-bearing batch

  // THE MACRO FUSION (§2.6) over the rolling window — ≥2 independent items per hit.
  const oldest = signalWindow[0]?.anchor.seq ?? seq;
  const window: PatternWindow = { seqSpan: Math.max(0, seq - oldest), signals: signalWindow };
  const hits: MacroPatternHit[] = detectPatterns(window, ledgerView, cadenceView);
  for (const hit of hits) {
    const rec = recordFor(sid);
    const primed = feed(sid, 'PATTERN_HIT', {
      patternId: hit.patternId,
      windowSeq: hit.windowSeq,
      triad: triadFor(rec.state, 'PRIMED', hit.patternId, hit.evidence[0]?.family ?? 'THEATRICAL_PLANNING', 232),
    });
    // ═══ GAP-5: D4 ADVISORY at FULL — the pattern-time advisory surface ═══
    if (primed && getV2EnforcementLevel() === 'FULL') {
      dispatchDirective(
        { verb: 'ADVISORY', trigger: hit, level: 'FULL',
          triad: triadFor('MONITORING', 'PRIMED', hit.patternId, hit.evidence[0]?.family ?? 'THEATRICAL_PLANNING', 245) },
        { kind: 'advisory', attach: (txt) => writeEvidence('enforcement', { kind: 'v2-advisory', text: txt }) },
        (ev) => writeEvidence('enforcement', { kind: 'v1-feed', v1kind: ev.kind, detail: ev.detail, distSha: (ev as unknown as {distSha?:string}).distSha || resolveDistIdentity() }),
      );
    }
    if (primed) {
      writeEvidence('enforcement', {
        kind: 'v2-pattern-hit',
        patternId: hit.patternId,
        windowSize: signalWindow.length,
        windowSeq: hit.windowSeq,
      });
    }
  }
  // (cool-down for every session already evaluated at the top of onSignals —
  //  the HT-BUG-5 starvation fix; a trailing call here would double-fire.)
}

// THE SHARED-STATE REGISTRATION — event-router calls callOnSignals which
// routes here. No circular import: shared-state is a neutral leaf module.
registerOnSignals(onSignals);

function sessionKeys(): string[] {
  const keys = new Set<string>(['runtime']);
  for (const k of records.keys()) keys.add(k);
  return [...keys];
}

function maybeCoolFor(sid: string, seq: number): void {
  const r = recordFor(sid);
  if (TRIDENT_V2_PROBE_VERBOSE || seq % 25 === 0) {
    try {
      writeEvidence('enforcement', { kind: 'v2-tick-probe', sid, state: r.state, lcv: (r as V2Record).lastComplianceVerified, deadline: (r as V2Record).complianceDeadlineSeq, seq, debounce: COMPLIANCE_DEBOUNCE_WINDOW });
    } catch { /* observer law */ }
  }
  if (r.state !== 'INTERVENING') return;
  // ═══ THE ESCALATION TICK (the BREAK-1 fix — 2026-08-26) ═══
  // The corrected-plan §4 mandates the deadline-driven escalation: when the
  // machine is INTERVENING with an OUTSTANDING directive and the compliance
  // deadline has PASSED without lastComplianceVerified, fire COMPLIANCE_FAILED
  // (the escalate transition → tier++ → denialCount++ at tier≥3) — NOT the cool.
  // This was the F-ROOT-CAUSE-1 BREAK 1: the escalation events had zero live
  // callers. The cool (SEQ_WINDOW) now fires ONLY when compliant or no
  // outstanding directive (the compliance-gated refractory from the §4 surgery).
  const rr = r as V2Record;
  const deadline = rr.complianceDeadlineSeq;
  if (rr.lastComplianceVerified === false && deadline !== null && deadline !== undefined) {
    // The deadline is SEQ-BASED (the v2 no-wall-clock law): the escalate guard
    // requires seq >= deadline + debounce. Fire the COMPLIANCE_FAILED when the
    // current seq has advanced past the deadline+debounce window.
    if (seq >= deadline + COMPLIANCE_DEBOUNCE_WINDOW) {
      const escalated = feed(sid, 'COMPLIANCE_FAILED', {
        verified: false,
        triad: triadFor('INTERVENING', 'INTERVENING', 'compliance-failed', 'THEATRICAL_PLANNING', 300),
      });
      if (escalated) {
        writeEvidence('enforcement', { kind: 'v2-escalate-tick', sid, tier: (recordFor(sid) as V2Record).tier, denialCount: (recordFor(sid) as V2Record).denialCount, deadline, seq });
        return; // the escalate transition advanced the deadline; do NOT cool the same tick
      }
    }
    return; // the deadline has not yet passed — the outstanding intervention NEVER cools (the spine)
  }
  // ── THE COMPLIANCE-GATED COOL (the re-scoped §4 semantics) ──
  // Only reached when lastComplianceVerified is true or null (no outstanding
  // directive) — an unaddressed intervention NEVER cools.
  const lastDirective = r.directives[r.directives.length - 1];
  const anchor = lastDirective ? lastDirective.seq : lastInterventionSeq;
  if (anchor < 0) return;
  const advanced = seq - anchor;
  if (advanced >= REFRACTORY_SEQ_WINDOW) {
    feed(sid, 'SEQ_WINDOW', {
      advanced,
      triad: triadFor('INTERVENING', 'MONITORING', 'refractory-exit', 'THEATRICAL_PLANNING', 262),
    });
  }
}

// ── PUBLIC API 2 — THE ENFORCEMENT SURFACES (the hooks call this) ────────────
export interface V2DirectiveSurfaceSpec {
  readonly kind: 'tool-before' | 'messages';
  readonly attach: (text: string) => void;
}

function currentTrigger(): WeightedViolation {
  // The newest priming evidence wins: scan the window tail for the freshest
  // signal; a pattern hit recorded in directives points back at its family mix.
  return signalWindow[signalWindow.length - 1]!;
}

function distShaNow(): string {
  return resolveDistIdentity();
}

export function tryIntervene(surfaceKind: 'tool.before' | 'messages.transform', attach: (text: string) => void, sessionId?: string, toolName?: string): void {
  // THE DISPATCH FIX (F-R5-1, 2026-08-26): the session-key mismatch — the machine
  // PRIMES under the REAL session key (event-router feeds batch.sessionID) but the
  // surface queries 'runtime' (the messages.transform hook has no sessionID), so
  // recordFor('runtime') returns a non-PRIMED record and the dispatch NEVER fires.
  // FIX: resolve the ACTIVE (PRIMED/INTERVENING) record from the records map when
  // the requested sid is unknown or non-PRIMED — search all live session records.
  const sid = sessionId || 'runtime';
  // Circuit SOLVE tier mandates remediation — mandate-mode gate (not block-all): only escape-hatch + problem-solving pass
  if (surfaceKind === 'tool.before' && !circuitBreaker.allowRequest(toolName)) {
    // In SOLVE mandate, generic tools are refused; escape-hatch + trident-problem-solving are never blocked (hook allowlist + circuit mandate check)
    writeEvidence('enforcement', { kind: 'v2-circuit-block', sid, circuit: circuitBreaker.getState(), surface: surfaceKind });
    return;
  }
  // F-R6-2 (round-6 live): the escalation tick ran with the PRE-resolution key,
  // so when the surface only knows 'runtime', the deadline tick checked the WRONG
  // record and never escalated the real INTERVENING session. Tick AFTER resolving.
  let rec = recordFor(sid);
  let activeSid = sid;
  if (rec.state !== 'PRIMED') {
    let bestSid: string | null = null;
    let bestRec: V2Record | null = null;
    for (const [rsid, rrec] of records.entries()) {
      if (rrec.state === 'PRIMED' || rrec.state === 'INTERVENING') {
        if (!bestRec || (rrec as V2Record).seq > (bestRec as V2Record).seq) { bestSid = rsid; bestRec = rrec as V2Record; }
      }
    }
    if (bestSid && bestRec) {
      writeEvidence('enforcement', { kind: 'v2-dispatch-session-resolved', fromSid: sid, toSid: bestSid, state: bestRec.state });
      rec = bestRec;
      activeSid = bestSid;
    }
  }
  try { demoteStaleGhosts(activeSid); } catch {}
  if (rec.state !== 'PRIMED' && rec.state !== 'INTERVENING') {
    // THE DROP WITNESS (audit wave-1787924354199, P0-5/HUNK-3): every eligible-
    // surface call that resolves to a non-escalated record is NAMED here — the
    // silent early-return was how the steer delivery failed invisibly.
    writeEvidence('enforcement', { kind: 'v2-intervene-drop', sid, activeSid, state: rec.state, surface: surfaceKind });
    return;
  }
  writeEvidence('enforcement', { kind: 'v2-intervene-enter', sid: activeSid, state: rec.state, surface: surfaceKind, tier: rec.tier });
  // THE ESCALATION TICK on the RESOLVED record — fires COMPLIANCE_FAILED when the
  // outstanding directive's deadline+debounce has passed without compliance.
  maybeCoolFor(activeSid, seqNow());
  // Re-read: the tick may have escalated the tier (COMPLIANCE_FAILED tier++).
  rec = recordFor(activeSid) as V2Record;

  // ═══ THE TIER-ESCALATION REDISPATCH (E-05 closed — audit wave-1787924354199
  // + the live tier-2 catch): the escalate transition climbs the tier
  // silently — the INTERVENE event matches only from PRIMED, so once
  // INTERVENING, no new directive ever dispatches and the model NEVER SEES the
  // escalation. FIX: when the record's tier exceeds the last tier actually
  // dispatched to THIS session, re-dispatch the directive at the new tier (the
  // [V2 DEMAND] wording) to the current surface — once per tier, tracked
  // per-session. ═══
  if (rec.state === 'INTERVENING' && rec.tier > (lastDispatchedTier.get(activeSid) ?? 0)) {
    const triggerNow = currentTrigger();
    const fallbackTrigger = {
      memberId: triggerNow?.memberId ?? rec.directives[rec.directives.length - 1]?.patternOrMember ?? 'unknown',
      family: triggerNow?.family ?? 'THEATRICAL_PLANNING',
      plane: 'reasoning' as const,
      excerpt: triggerNow?.excerpt ?? 'tier escalation redispatch',
      anchor: { seq: rec.seq, ts: Date.now(), sessionID: activeSid },
      weight: 0.9,
    };
    const verb = surfaceKind === 'tool.before' ? 'TOOL_PREPEND' : 'STEER_INJECT';
    const directive: EnforcementDirective = {
      verb: verb as EnforcementVerb,
      trigger: (triggerNow ?? fallbackTrigger) as WeightedViolation,
      level: rec.level,
      tier: rec.tier,
      triad: triadFor('INTERVENING', 'INTERVENING', fallbackTrigger.memberId, fallbackTrigger.family, 318),
    };
    dispatchDirective(
      directive,
      { kind: surfaceKind === 'tool.before' ? 'tool-before' : 'messages', attach },
      (ev) => writeEvidence('enforcement', { kind: 'v1-feed', v1kind: ev.kind, detail: ev.detail, distSha: ev.distSha || resolveDistIdentity() }),
    );
    lastDispatchedTier.set(activeSid, rec.tier);
    writeEvidence('enforcement', { kind: 'v2-demand-redispatch', sid: activeSid, tier: rec.tier, surface: surfaceKind });
    return;
  }

  // ── THE POOL-ORDER FIX (audit wave-1787924354199, HUNK-1/2/4): the offense is
  // enqueued FIRST and the gate evaluates the pool AFTER it resolves — the old
  // order sampled evidence before the offense landed, so every fresh-boot
  // intervene observed pool {total:0} → INCONCLUSIVE telemetry. Errors are
  // COUNTED to the ledger (R4), never swallowed silently. The gate verdict
  // remains OBSERVATORY (non-PASS never blocks the steer dispatch).
  const gateId = rec.tier === 0 ? 'v2-steer' : rec.tier === 1 ? 'v2-demand' : 'v2-deny';
  try {
    const runGateEval = () => {
      const evidence = v2ComplianceCollector.getRecords();
      gateEngine.evaluate(gateId, evidence).then((res) => {
        writeEvidence('enforcement', { kind: 'v2-gate-eval-intervene', gateId, verdict: res.verdict, tier: rec.tier, pool: gatePoolSnapshot(evidence) });
        // Feed gate verdict into weighted gate scoring for tier-selection input
        try { weightedGate.evaluate(evidence); } catch { /* non-fatal */ }
        try { multiStageGate.evaluate(evidence).catch(() => {}); } catch { /* non-fatal */ }
      }).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        writeEvidence('enforcement', { kind: 'v2-gate-eval-error', gateId, error: msg });
      });
    };
    const sigAny = currentTrigger() as unknown as Record<string, unknown> | null;
    if (sigAny) {
      v2ComplianceCollector.recordOffense(sigAny as unknown as Parameters<typeof v2ComplianceCollector.recordOffense>[0], rec.seq)
        .then(() => runGateEval())
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          writeEvidence('enforcement', { kind: 'v2-offense-error', gateId, error: msg });
          runGateEval();
        });
    } else {
      runGateEval();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeEvidence('enforcement', { kind: 'v2-gate-eval-error', gateId, error: msg });
  }

  const trigger = currentTrigger();
  const ok = feed(activeSid, 'INTERVENE', {
    surface: surfaceKind,
    memberId: trigger?.memberId ?? 'unknown',
    triad: triadFor('PRIMED', 'INTERVENING', trigger?.memberId ?? 'unknown', trigger?.family ?? 'THEATRICAL_PLANNING', 305),
  });
  const postRec = recordFor(activeSid);
  if (!ok || (postRec.state as V2State) !== 'INTERVENING') return;

  lastInterventionSeq = postRec.seq;

  const verb: EnforcementVerb =
    (postRec.directives[postRec.directives.length - 1]?.verb as EnforcementVerb | undefined) ??
    (surfaceKind === 'tool.before' ? 'TOOL_PREPEND' : 'STEER_INJECT');

  const directive: EnforcementDirective = {
    verb,
    trigger,
    level: postRec.level,
    tier: postRec.tier,
    triad: triadFor('PRIMED', 'INTERVENING', trigger?.memberId ?? 'unknown', trigger?.family ?? 'THEATRICAL_PLANNING', 320),
  };

  dispatchDirective(
    directive,
    { kind: surfaceKind === 'tool.before' ? 'tool-before' : 'messages', attach },
    (ev) => {
      // D3 — the v1 evidence feed leg: every dispatched directive lands in the
      // shared interventions ledger with the dist identity attached.
      lastDemandSeq = seqNow();
      writeEvidence('enforcement', { kind: 'v1-feed', v1kind: ev.kind, detail: ev.detail, distSha: ev.distSha || resolveDistIdentity() });
    },
  );
  // THE E-05 TRACKER BASELINE: the tier-1 dispatch sets the last-dispatched
  // tier — the escalation redispatch fires only when the tier climbs past it.
  lastDispatchedTier.set(sid, postRec.tier);
}

/** The v1 demand-delivery path calls this — arms FORGERY_AFTER_WARHEAD fusion. */
export function noteV1Delivery(): void {
  lastDemandSeq = seqNow();
}

// ── WAVE 5 COMPLIANCE + GATE SURFACES (W2/W3/W4) ───────────────────────
/** Gate evaluation feeding the INTERVENE escalation — strategies' verdicts. */
export async function evaluateGateForIntervene(gateId: string): Promise<import('../enforce/gate-criteria.js').GateResult> {
  const evidence = v2ComplianceCollector.getRecords();
  try {
    const res = await gateEngine.evaluate(gateId, evidence);
    writeEvidence('enforcement', { kind: 'v2-gate-eval', gateId, verdict: res.verdict, evidenceEvaluated: res.evidenceEvaluated, pool: gatePoolSnapshot(evidence) });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeEvidence('enforcement', { kind: 'v2-gate-eval-error', gateId, error: msg });
    return { gateId, verdict: 'ERROR', evidenceEvaluated: 0, evidencePassed: 0, evidenceFailed: 0, criteriaResults: [{ criteria: 'internal-error', passed: false, detail: msg }], timestamp: Date.now(), durationMs: 0 };
  }
}

/** Feed tool-layer observations into the compliance collector (W3). */
export async function recordToolObservation(tool: string, args: Record<string, unknown>, exitCode?: number): Promise<EvidenceRecord | null> {
  try {
    const rec = await v2ComplianceCollector.measureCompliance(
      { toolClass: tool, toolPattern: new RegExp(tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) },
      [{ tool, args, exitCode }],
    );
    return rec as unknown as EvidenceRecord;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[v2-pipeline] recordToolObservation failed: ${msg}`);
    return null;
  }
}

/** Compliance verified — fires COMPLIANCE_VERIFIED, resets tier via machine. */
// THE RESOLVER (F-R6-1's sibling fix): the compliance/solve surfaces face the
// SAME key-mismatch as tryIntervene — the machine lives under the REAL session
// key while the surface may only know 'runtime'. Resolve once, feed the record
// that actually holds the escalation state.
function resolveActiveSid(sid: string): string {
  const rec = recordFor(sid) as V2Record | undefined;
  if (rec && (rec.state === 'PRIMED' || rec.state === 'INTERVENING')) {
    try { demoteStaleGhosts(sid); } catch {}
    return sid;
  }
  let bestSid: string | null = null;
  let bestSeq = -1;
  for (const [rsid, rrec] of records.entries()) {
    if (rrec.state === 'PRIMED' || rrec.state === 'INTERVENING') {
      const s = (rrec as V2Record).seq;
      if (s > bestSeq) { bestSeq = s; bestSid = rsid; }
    }
  }
  if (bestSid) {
    try { demoteStaleGhosts(bestSid); } catch {}
    return bestSid;
  }
  return sid;
}

export function handleComplianceVerified(sessionId?: string): boolean {
  const sid = resolveActiveSid(sessionId || 'runtime');
  // Ensure compliance collector has a verified compliance record (tool-layer)
  // The caller should have fed the actual tool observation; we just trigger the machine.
  const ok = feed(sid, 'COMPLIANCE_VERIFIED', {
    verified: true,
    triad: triadFor('INTERVENING', 'MONITORING', 'compliance-verified', 'THEATRICAL_PLANNING', 900),
  });
  if (ok) {
    // Circuit records success already via feed; ensure checkpoint
    writeEvidence('enforcement', { kind: 'v2-comply', sid, tier: (recordFor(sid) as V2Record).tier });
    // ── THE POOL BRIDGE (audit wave-1787924354199, E1 — the severed edge): the
    // compliance event MUST land in the EvidenceRecord pool the steer/demand/deny
    // gates read, or v2-steer evaluates INCONCLUSIVE total:0 forever (42 ledger
    // rows vs pool 0 was the two-sink disconnect). Lands a fresh verified
    // test_result inside the gates' 300s freshness window. Errors COUNTED (R4).
    try {
      v2ComplianceCollector.measureCompliance(
        { toolClass: 'trident-problem-solving', toolPattern: /trident-problem-solving/ },
        [{ tool: 'trident-problem-solving', args: { sid }, exitCode: 0 }],
      ).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        writeEvidence('enforcement', { kind: 'v2-pool-bridge-error', sid, error: msg });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeEvidence('enforcement', { kind: 'v2-pool-bridge-error', sid, error: msg });
    }
    // F-HARDEN-S15: cross-layer bridge — v2 compliance decays the STTGF claim
    // latch so the two enforcement planes share a single trust state.
    try { latchDecay('evidence', sid); } catch { /* best-effort */ }
  }
  return ok;
}

/** Compliance failed — fires COMPLIANCE_FAILED, escalates tier with debounce. */
export function handleComplianceFailed(sessionId?: string): boolean {
  const sid = resolveActiveSid(sessionId || 'runtime');
  const ok = feed(sid, 'COMPLIANCE_FAILED', {
    verified: false,
    triad: triadFor('INTERVENING', 'INTERVENING', 'compliance-failed', 'THEATRICAL_PLANNING', 901),
  });
  if (ok) {
    writeEvidence('enforcement', { kind: 'v2-escalate', sid, tier: (recordFor(sid) as V2Record).tier, denialCount: (recordFor(sid) as V2Record).denialCount });
    // Check for SOLVE tier -> mandate-mode circuit open (visibility alert, never paralysis)
    const rec = recordFor(sid) as V2Record;
    if (rec.tier === 4 || rec.denialCount >= 3) {
      writeEvidence('enforcement', { kind: 'v2-solve-mandate', sid, circuit: circuitBreaker.getState() });
    }
  }
  return ok;
}

/** Check if mandate-mode circuit blocks non-escape tools (SOLVE tier). Generic refused, problem-solving allowed. */
export function isCircuitOpen(toolName?: string): boolean {
  return !circuitBreaker.allowRequest(toolName);
}

export function isSolveMandateActive(): boolean {
  return circuitBreaker.isSolveMandateActive();
}

// ── THE HONEST-STATE PROBE (tests + container diagnostics) ───────────────────
export function v2PipelineHealth(): {
  state: V2State;
  seq: number;
  level: V2Level;
  counters: Partial<Record<ViolationFamily, number>>;
  windowSize: number;
  directives: number;
  feedCounter: number;
    sessions: number;
  tier: number;
  denialCount: number;
  lastComplianceVerified: boolean | null;
  complianceDeadlineSeq: number | null;
  circuit: string;
} {
  const r = records.get('runtime') ?? (() => { const x = loadInitial('runtime'); records.set('runtime', x); return x; })();
  const rr = r as V2Record;
  return {
    state: r.state as V2State,
    seq: r.seq,
    level: r.level,
    counters: r.counters,
    windowSize: signalWindow.length,
    directives: r.directives.length,
    feedCounter,
    sessions: records.size,
    tier: rr.tier,
    denialCount: rr.denialCount,
    lastComplianceVerified: rr.lastComplianceVerified,
    complianceDeadlineSeq: rr.complianceDeadlineSeq,
    circuit: circuitBreaker.getState(),
  };
}

export function getV2Record(sessionId?: string): V2Record | undefined {
  const sid = sessionId || 'runtime';
  return records.get(sid) as V2Record | undefined;
}

export function __seedRecordForTests(sid: string, rec: V2Record): void { records.set(sid, rec); }
export function __getRecordsForTests(): Map<string, V2Record> { return records; }
export function __exposedResolveActiveSidForTests(sid: string): string { return resolveActiveSid(sid); }

/** Test hook — reset all in-memory state to fresh (never called in production). */
export function __resetPipelineForTests(level: V2Level = 'STEER'): void {
  setSharedEnforcementLevel(level);
  records.clear();
  const r = createInitialV2Record('runtime', level);
  records.set('runtime', r);
  signalWindow.length = 0;
  lastInterventionSeq = -1;
  lastDemandSeq = -1;
  feedCounter = 0;
  historyBySession.clear();
  v2ComplianceCollector.clear();
  circuitBreaker.recordSuccess();
  // Reset gate engine state but keep registrations
  // (gateEngine.reset would clear gates; we keep them)
}
