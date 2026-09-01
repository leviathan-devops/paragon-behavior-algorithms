import { describe, expect, it, beforeEach } from 'bun:test';
import {
  applyCalibrationSignal,
  bindCalibrationGate,
  activeCalibrationGate,
  getCalibrationFeedbackState,
  resetCalibrationFeedback,
  type CalibrationSignal,
} from '../events/calibration-feedback.ts';
import { CalibrationGate } from '../lexicons/audit-calibration.ts';

// THE BATTERY GATE IS bash scripts/preflight.sh (tsc 0 + the live-src run) — verified by the
// preflight run, never by an in-file assertion. Every scenario below is MUTATION-CHECKED:
// the CALIB_STALE exclusion asserts the gate's state BEFORE (empty) and AFTER (excluded) —
// a feedback that did not mutate the gate fails the AFTER assertion; the loud-fail paths
// assert the named error AND that no state mutated.

beforeEach(() => {
  resetCalibrationFeedback();
});

function sig(partial: Partial<CalibrationSignal> & { kind: CalibrationSignal['kind'] }): CalibrationSignal {
  return { timestamp: Date.now(), ...partial };
}

describe('THE CALIBRATION FEEDBACK (SPEC-3 §9.8 E5 — the C7 + the adversarial corpus)', () => {
  // ── THE C7: the CALIB_STALE signal FLAGS + EXCLUDES the matcher (the REAL state change) ──
  it("E5-C7: CALIB_STALE FLAGS + EXCLUDES the matcher in the audit's CalibrationGate (never a stub)", () => {
    const gate = new CalibrationGate();
    bindCalibrationGate(gate);
    // the BEFORE state — the matcher is armed (the mutation check: the AFTER must differ)
    expect(gate.excludedPatterns()).toEqual([]);
    expect(gate.verdictOf('r3.todo-marker')).toBe('CALIBRATED');
    applyCalibrationSignal(sig({ kind: 'CALIB_STALE', matcherId: 'r3.todo-marker' }));
    // the AFTER state — FLAGGED + EXCLUDED (the D17 mechanism's own state writes)
    expect(gate.excludedPatterns()).toContain('r3.todo-marker');
    expect(gate.verdictOf('r3.todo-marker')).toBe('FLAGGED');
    // the feedback state records the application on the BOUND gate
    const fb = getCalibrationFeedbackState();
    expect(fb.excludedMatchers.length).toBe(1);
    expect(fb.excludedMatchers[0].matcherId).toBe('r3.todo-marker');
    expect(fb.excludedMatchers[0].gate).toBe('bound');
    expect(typeof fb.excludedMatchers[0].at).toBe('number');
  });

  it('E5: a CALIB_STALE with NO gate bound still FLAGs + EXCLUDEs on the shared default gate (the feedback NEVER no-ops)', () => {
    applyCalibrationSignal(sig({ kind: 'CALIB_STALE', matcherId: 'r2.empty-catch' }));
    const gate = activeCalibrationGate();
    expect(gate.excludedPatterns()).toContain('r2.empty-catch');
    expect(getCalibrationFeedbackState().excludedMatchers[0].gate).toBe('shared');
  });

  it('E5: TWO CALIB_STALE signals grow the exclusion set monotonically (the next audit runs clean of BOTH)', () => {
    const gate = new CalibrationGate();
    bindCalibrationGate(gate);
    applyCalibrationSignal(sig({ kind: 'CALIB_STALE', matcherId: 'r3.todo-marker' }));
    applyCalibrationSignal(sig({ kind: 'CALIB_STALE', matcherId: 'r6.path-resolution' }));
    expect(gate.excludedPatterns()).toContain('r3.todo-marker');
    expect(gate.excludedPatterns()).toContain('r6.path-resolution');
    expect(gate.excludedPatterns().length).toBe(2);
  });

  // ── THE C7: the OVER_AUDIT sets the findingsQuality = OVER_FIRED ──
  it('E5-C7: the OVER_AUDIT signal sets the findingsQuality = OVER_FIRED', () => {
    expect(getCalibrationFeedbackState().findingsQuality).toBe('CALIBRATED'); // the BEFORE
    const out = applyCalibrationSignal(sig({ kind: 'OVER_AUDIT', findingCount: 2614, fileCount: 247 }));
    expect(getCalibrationFeedbackState().findingsQuality).toBe('OVER_FIRED'); // the AFTER
    expect(out.applied).toBe('OVER_AUDIT');
    expect(out.detail).toContain('OVER_FIRED');
  });

  it('E5-BOUNDARY: the OVER_AUDIT detail recomputes the ratio from the signal counts (the data, never a literal)', () => {
    const out = applyCalibrationSignal(sig({ kind: 'OVER_AUDIT', findingCount: 2614, fileCount: 247 }));
    expect(out.detail).toContain((2614 / 247).toFixed(2)); // the computed ratio, not a fitted string
  });

  it('E5-BOUNDARY: an OVER_AUDIT without counts still applies (the triage verdict is the authority) with no ratio', () => {
    const out = applyCalibrationSignal(sig({ kind: 'OVER_AUDIT' }));
    expect(getCalibrationFeedbackState().findingsQuality).toBe('OVER_FIRED');
    expect(out.detail).not.toContain('ratio');
  });

  // ── THE FAKE_RETURN / CLAIM_SLOP feedback arms ──
  it('E5: the FAKE_RETURN signal appends the observed shape to the R5 corpus-growth queue', () => {
    const theatricalShape = 'a tool-result body whose green claim carried no run id';
    applyCalibrationSignal(sig({ kind: 'FAKE_RETURN', observedShape: theatricalShape }));
    const fb = getCalibrationFeedbackState();
    expect(fb.r17CorpusGrowth.length).toBe(1);
    expect(fb.r17CorpusGrowth[0].shape).toBe(theatricalShape);
  });

  it('E5: the CLAIM_SLOP signal records the claim frequency (the sentinel feed)', () => {
    const t1 = Date.now();
    applyCalibrationSignal(sig({ kind: 'CLAIM_SLOP', timestamp: t1 }));
    applyCalibrationSignal(sig({ kind: 'CLAIM_SLOP', timestamp: t1 + 1000 }));
    expect(getCalibrationFeedbackState().claimSignalTimes).toEqual([t1, t1 + 1000]);
  });

  // ── THE LOUD-FAIL LAW (AP-E-4 — no silent skip) ──
  it('E5-ADV: a null signal LOUD-FAILS (CALIB_SIGNAL_INVALID)', () => {
    expect(() => applyCalibrationSignal(null as unknown as CalibrationSignal)).toThrow('CALIB_SIGNAL_INVALID');
    expect(getCalibrationFeedbackState().signals.length).toBe(0);
  });

  it('E5-ADV: an unknown kind LOUD-FAILS (CALIB_SIGNAL_KIND_UNKNOWN) — never coerced to a no-op', () => {
    expect(() => applyCalibrationSignal(sig({ kind: 'WAT' as never }))).toThrow('CALIB_SIGNAL_KIND_UNKNOWN');
    expect(getCalibrationFeedbackState().signals.length).toBe(0);
  });

  it('E5-ADV: a CALIB_STALE without its matcherId LOUD-FAILS (CALIB_SIGNAL_NO_MATCHER) — the gate is untouched', () => {
    const gate = new CalibrationGate();
    bindCalibrationGate(gate);
    expect(() => applyCalibrationSignal(sig({ kind: 'CALIB_STALE' }))).toThrow('CALIB_SIGNAL_NO_MATCHER');
    expect(gate.excludedPatterns()).toEqual([]); // no partial mutation
  });

  it('E5-ADV: a non-numeric timestamp LOUD-FAILS (CALIB_SIGNAL_NO_TIMESTAMP)', () => {
    expect(() => applyCalibrationSignal(sig({ kind: 'OVER_AUDIT', timestamp: Number.NaN }))).toThrow('CALIB_SIGNAL_NO_TIMESTAMP');
    expect(getCalibrationFeedbackState().findingsQuality).toBe('CALIBRATED'); // no partial mutation
  });

  // ── THE APPEND-ONLY SIGNAL RECORD (the replay proof) ──
  it('E5: every applied signal is recorded append-only, in order (the replay proof)', () => {
    applyCalibrationSignal(sig({ kind: 'CLAIM_SLOP' }));
    applyCalibrationSignal(sig({ kind: 'CALIB_STALE', matcherId: 'r1.output-contract' }));
    applyCalibrationSignal(sig({ kind: 'OVER_AUDIT', findingCount: 10, fileCount: 1 }));
    const kinds = getCalibrationFeedbackState().signals.map((s) => s.kind);
    expect(kinds).toEqual(['CLAIM_SLOP', 'CALIB_STALE', 'OVER_AUDIT']);
  });

  // ── THE GATE REBIND (the E-PB5 seam): rebinding swaps the exclusion target ──
  it('E5-BOUNDARY: rebinding the gate moves the exclusions to the newly bound gate', () => {
    const first = new CalibrationGate();
    const second = new CalibrationGate();
    bindCalibrationGate(first);
    applyCalibrationSignal(sig({ kind: 'CALIB_STALE', matcherId: 'm-a' }));
    bindCalibrationGate(second);
    applyCalibrationSignal(sig({ kind: 'CALIB_STALE', matcherId: 'm-b' }));
    expect(first.excludedPatterns()).toEqual(['m-a']);
    expect(second.excludedPatterns()).toEqual(['m-b']);
  });
});
