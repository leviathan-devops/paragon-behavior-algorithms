/**
 * calibration-feedback.ts — THE CALIBRATION FEEDBACK (SPEC-3 §2.5 / §2.8 E5 / §9.8 E5)
 *
 * THE CLOSED LOOP — the events correct the detectors. The event substrate is the audit
 * tool's SENSE ORGANS: a CALIB_STALE event (a matcher firing on the clean core) is the
 * LIVE signal that a matcher over-fires. THE FEEDBACK (SPEC-3 §2.5):
 *
 *   CALIB_STALE  → the audit's CalibrationGate FLAGS + EXCLUDES the matcher — the REAL
 *                  state change through the gate's own D17 exclusion mechanism
 *                  (CalibrationGate.excludeMatcher), NEVER a stub. The next audit on this
 *                  gate runs clean of the over-firing matcher.
 *   OVER_AUDIT   → the audit result's findingsQuality is set 'OVER_FIRED'; the loop's
 *                  DECIDE routes to CALIBRATION (the loop consumption is the E-PB5 wiring;
 *                  the state here is the deterministic source it reads).
 *   FAKE_RETURN  → the observed theatrical shape is appended to the R17 exampleHit growth
 *                  queue (the mutation corpus grows; the lexicon-table write is the E-PB4
 *                  handoff — DOCUMENTED, never silently extended).
 *   CLAIM_SLOP   → the claim-state tracker records the frequency (the sentinel feed).
 *
 * THE LOUD-FAIL LAW (AP-E-4): an unknown signal kind, a missing matcherId, a malformed
 * timestamp — all NAMED throws. NO silent skip.
 *
 * THE GATE BINDING: E-PB5 wires the audit's LIVE gate via bindCalibrationGate; until then
 * the module's shared gate is the deterministic default (a CALIB_STALE with NO gate bound
 * still FLAGs + EXCLUDEs on the shared gate — the feedback NEVER no-ops).
 */
import { CalibrationGate } from '../lexicons/audit-calibration.ts';
import { REGISTERS } from './event-registry.js';
import { tridentLog } from '../../utils.js';

// ── THE CONTRACT (SPEC-3 §2.5 / §2.8 — E5) ──

/** THE CALIBRATION SIGNAL — the event-side feed into the audit's calibration machinery. */
export interface CalibrationSignal {
  kind: 'CALIB_STALE' | 'OVER_AUDIT' | 'FAKE_RETURN' | 'CLAIM_SLOP';
  matcherId?: string;   // the CALIB_STALE target
  findingCount?: number;
  fileCount?: number;
  timestamp: number;
  /** The observed theatrical shape (the FAKE_RETURN corpus entry). */
  observedShape?: string;
}

/** THE FINDINGS QUALITY (SPEC-3 §2.5) — the audit result's over-fire verdict. */
export type FindingsQuality = 'CALIBRATED' | 'OVER_FIRED';

/** THE FEEDBACK STATE — the deterministic, readable record of every applied signal. */
export interface CalibrationFeedbackState {
  findingsQuality: FindingsQuality;
  /** The event-driven matcher exclusions (the CALIB_STALE applications). */
  excludedMatchers: Array<{ matcherId: string; at: number; gate: 'bound' | 'shared' }>;
  /** The claim-frequency track (the CLAIM-SENTINEL feed, E-PB4-ready). */
  claimSignalTimes: number[];
  /** The R17 exampleHit growth queue (the FAKE_RETURN corpus — the E-PB4 lexicon handoff). */
  r17CorpusGrowth: Array<{ shape: string; at: number }>;
  /** The append-only signal record (the replay proof). */
  signals: CalibrationSignal[];
}

// ── THE STATE + THE GATE BINDING ──

const state: CalibrationFeedbackState = {
  findingsQuality: 'CALIBRATED',
  excludedMatchers: [],
  claimSignalTimes: [],
  r17CorpusGrowth: [],
  signals: [],
};

/** THE SHARED DEFAULT GATE — the deterministic target when no live gate is bound. The
 *  exclusion is REAL on this gate (the same CalibrationGate the audit runs). */
let sharedGate: CalibrationGate | null = null;
/** THE BOUND GATE — the audit's live CalibrationGate (E-PB5 wires it). */
let boundGate: CalibrationGate | null = null;

/** BIND THE AUDIT'S LIVE GATE (the E-PB5 seam). null reverts to the shared default. */
export function bindCalibrationGate(gate: CalibrationGate | null): void {
  boundGate = gate;
  tridentLog('INFO', 'calibration-feedback', `calibration gate ${gate ? 'bound (the audit live gate)' : 'unbound (the shared default)'}`);
}

/** THE ACTIVE GATE — the bound gate if present, else the shared default (created once). */
export function activeCalibrationGate(): CalibrationGate {
  if (boundGate) return boundGate;
  if (!sharedGate) sharedGate = new CalibrationGate();
  return sharedGate;
}

/** THE STATE READER — a structural copy (the append-only arrays are never handed out). */
export function getCalibrationFeedbackState(): CalibrationFeedbackState {
  return {
    findingsQuality: state.findingsQuality,
    excludedMatchers: [...state.excludedMatchers],
    claimSignalTimes: [...state.claimSignalTimes],
    r17CorpusGrowth: [...state.r17CorpusGrowth],
    signals: [...state.signals],
  };
}

/** THE RESET — the test/lifecycle hook. The shared gate is rebuilt so no exclusion leaks
 *  across suites; the bound gate is UNBOUND (the caller re-binds its own fixture). */
export function resetCalibrationFeedback(): void {
  state.findingsQuality = 'CALIBRATED';
  state.excludedMatchers = [];
  state.claimSignalTimes = [];
  state.r17CorpusGrowth = [];
  state.signals = [];
  sharedGate = null;
  boundGate = null;
}

// ── THE FEEDBACK (E5 — the loop-closing application) ──

const VALID_KINDS: ReadonlySet<CalibrationSignal['kind']> = new Set(['CALIB_STALE', 'OVER_AUDIT', 'FAKE_RETURN', 'CLAIM_SLOP']);

/**
 * APPLY THE CALIBRATION SIGNAL — the events correct the detectors.
 *
 * ERROR PATHS FIRST (the loud-fail law — no silent skip):
 *   CALIB_SIGNAL_INVALID      — a null/non-object signal
 *   CALIB_SIGNAL_KIND_UNKNOWN — a kind outside the E5 contract
 *   CALIB_SIGNAL_NO_TIMESTAMP — a non-numeric timestamp
 *   CALIB_SIGNAL_NO_MATCHER   — a CALIB_STALE without its matcherId (the exclusion target)
 *
 * THE SIDE EFFECTS PRECEDE THE RETURN: every path mutates the real state (the gate's
 * FLAGGED + EXCLUDED sets / the findingsQuality / the trackers) and appends the signal
 * record BEFORE returning the applied summary.
 */
export function applyCalibrationSignal(signal: CalibrationSignal): { applied: CalibrationSignal['kind']; detail: string } {
  if (!signal || typeof signal !== 'object') {
    throw new Error('CALIB_SIGNAL_INVALID: the calibration signal must be an object — a null signal is a loud fail, never a skip');
  }
  if (!VALID_KINDS.has(signal.kind)) {
    throw new Error(`CALIB_SIGNAL_KIND_UNKNOWN: "${String(signal.kind)}" is outside the E5 contract (CALIB_STALE | OVER_AUDIT | FAKE_RETURN | CLAIM_SLOP)`);
  }
  if (typeof signal.timestamp !== 'number' || !Number.isFinite(signal.timestamp)) {
    throw new Error('CALIB_SIGNAL_NO_TIMESTAMP: the signal requires a finite numeric timestamp');
  }

  let detail: string;
  switch (signal.kind) {
    case 'CALIB_STALE': {
      if (typeof signal.matcherId !== 'string' || signal.matcherId.length === 0) {
        throw new Error('CALIB_SIGNAL_NO_MATCHER: a CALIB_STALE signal without its matcherId cannot exclude — the exclusion target is required');
      }
      // THE REAL STATE CHANGE — the gate's OWN D17 exclusion mechanism (FLAGGED + EXCLUDED).
      // A "feedback" that did not mutate the gate would be THEATRICAL (AP-E-1).
      const gate = activeCalibrationGate();
      gate.excludeMatcher(signal.matcherId, `CALIB_STALE event at ${signal.timestamp}`);
      state.excludedMatchers.push({ matcherId: signal.matcherId, at: signal.timestamp, gate: boundGate ? 'bound' : 'shared' });
      detail = `matcher ${signal.matcherId} FLAGGED + EXCLUDED on the ${boundGate ? 'bound' : 'shared'} gate`;
      tridentLog('WARN', 'calibration-feedback', `[AUDIT: CALIB_STALE] ${detail}`);
      break;
    }
    case 'OVER_AUDIT': {
      // THE FINDINGS-QUALITY VERDICT — the audit result's over-fire mark. The ratio is
      // recomputed from the signal's own counts against the REGISTERS bar (the data,
      // never a literal ladder) for the record's evidence; the APPLICATION is the
      // triage's verdict's authority (the NO-VERDICT law — the feedback never re-decides).
      const ratio = typeof signal.findingCount === 'number' && typeof signal.fileCount === 'number' && signal.fileCount > 0
        ? signal.findingCount / signal.fileCount
        : null;
      state.findingsQuality = 'OVER_FIRED';
      detail = `findingsQuality=OVER_FIRED${ratio !== null ? ` (ratio ${ratio.toFixed(2)} vs the ${REGISTERS.OVER_AUDIT_RATIO} bar)` : ''} — the loop routes to CALIBRATION`;
      tridentLog('WARN', 'calibration-feedback', `[LOOP: OVER_FIRED] ${detail}`);
      break;
    }
    case 'FAKE_RETURN': {
      // THE R17 CORPUS GROWTH — the observed theatrical shape is queued as a new
      // exampleHit candidate (the lexicon-table write is the E-PB4 handoff; the queue
      // here is the durable, deterministic record).
      const shape = typeof signal.observedShape === 'string' && signal.observedShape.length > 0 ? signal.observedShape : 'UNSPECIFIED_SHAPE';
      state.r17CorpusGrowth.push({ shape, at: signal.timestamp });
      detail = `the R17 exampleHit growth queue += "${shape.slice(0, 80)}"`;
      tridentLog('INFO', 'calibration-feedback', `[SSTF EVENT: FAKE_RETURN] ${detail}`);
      break;
    }
    case 'CLAIM_SLOP': {
      // THE CLAIM-STATE TRACKER — the frequency record (the CLAIM-SENTINEL feed, E-PB4).
      state.claimSignalTimes.push(signal.timestamp);
      detail = `the claim-state tracker records the frequency (${state.claimSignalTimes.length} in the record)`;
      tridentLog('INFO', 'calibration-feedback', `[SSTF EVENT: CLAIM] ${detail}`);
      break;
    }
  }

  // THE APPEND-ONLY SIGNAL RECORD — the replay proof (every applied signal, in order).
  state.signals.push({ ...signal });
  return { applied: signal.kind, detail: detail! };
}
