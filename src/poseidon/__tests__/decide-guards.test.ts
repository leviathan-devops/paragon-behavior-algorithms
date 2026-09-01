// src/poseidon/__tests__/decide-guards.test.ts — THE SPEC-3 §13.2 DECIDE GUARDS
// (the E-PB5 additive insertions in god-loop.ts phaseDecide). THE FIRE-THAT-NEVER-
// FIRES IS THEATER: each guard has its FIRE case + its SILENT case + the
// additive-only proof (a clean state routes EXACTLY as before the guards landed).
import { describe, expect, it } from 'bun:test';

import { GodLoopOrchestrator } from '../god-loop.js';
import type { GodLoopState, PhaseResult } from '../god-loop.js';
import { applyCalibrationSignal, resetCalibrationFeedback } from '../../audit-engine/events/calibration-feedback.js';
import { AuditFinding } from '../../audit-engine/types.js';

const F = (o: Partial<AuditFinding>): AuditFinding => ({
  severity: 'HIGH', category: 'X', file: '/tmp/g.ts', line: 1, evidence: 'e',
  description: 'd', correction: 'c', runtimeImpact: 'i', confidence: 0.9, layer: 'R1',
  constructType: null, callGraphRef: null, evidenceSuppressed: false, ...o,
});

function makeState(overrides: Partial<GodLoopState> = {}): GodLoopState {
  return {
    phase: 'DECIDE', cycle: 1, wave: 0, score: 10, highestScore: 10,
    targetPath: '/tmp/ct-fix', snapshotHash: 'h', preAuditFindings: [], postAuditFindings: [],
    waveManifest: null, stalledSince: 0, lastWaveResult: 'PENDING', sessionStart: Date.now(),
    evidenceRootHash: 'e', phaseRepeatCount: 0, problemSolveCount: 0, ...overrides,
  };
}

function decide(state: GodLoopState): PhaseResult {
  const loop = new GodLoopOrchestrator('/tmp/ct-fix');
  // THE PRIVATE-METHOD DRIVE: phaseDecide is the guard insertion point; the
  // cast is the test seam (the same pattern route-after-verify.test.ts uses
  // for the phase internals).
  return (loop as unknown as { phaseDecide(s: GodLoopState): PhaseResult }).phaseDecide(state);
}

describe('THE SPEC-3 §13.2 DECIDE GUARDS — the FP-consumption gate + the destructive-plan gate', () => {
  it('OVER_FIRED FIRES: an over-fired audit NEVER dispatches — routed to PROBLEM_SOLVE with the [LOOP: OVER_FIRED] demand', () => {
    resetCalibrationFeedback();
    // the event substrate's feedback state carries the OVER_AUDIT verdict (the E-PB3 write)
    applyCalibrationSignal({ kind: 'OVER_AUDIT', findingCount: 2614, fileCount: 247, timestamp: Date.now() });
    const r = decide(makeState());
    expect(r.nextPhase).toBe('PROBLEM_SOLVE');
    expect(r.instructions).toContain('[LOOP: OVER_FIRED]');
    expect(r.requiresModelAction).toBe(true);
    resetCalibrationFeedback();
  });

  it('CLEAN FEEDBACK SILENTS: without an over-fired verdict, DECIDE routes exactly as before (additive-only)', () => {
    resetCalibrationFeedback();
    const r = decide(makeState({ score: 10, stalledSince: 0 }));
    // THE ADDITIVE-ONLY PROOF: a clean state takes the PRE-GUARD route
    // (score>0 ∧ cycle≥1 ∧ no LASME → CONTAINER_TEST, the wave-then-test path)
    // and carries NO guard marker — the guards never fired.
    expect(r.nextPhase).toBe('CONTAINER_TEST');
    expect(r.instructions).not.toContain('[LOOP: OVER_FIRED]');
  });

  it('CONTRADICTION FIRES: a suggested fix contradicting the working architecture never boards', () => {
    resetCalibrationFeedback();
    const state = makeState({
      postAuditFindings: [F({ correction: 'add output.error to chainBeforeHook instead of throwing' })],
    });
    const r = decide(state);
    expect(r.nextPhase).toBe('PROBLEM_SOLVE');
    expect(r.instructions).toContain('[LOOP: CONTRADICTION]');
  });

  it('BENIGN CORRECTIONS SILENT: normal fixes take the pre-guard route (the zero-misfire mandate)', () => {
    resetCalibrationFeedback();
    const state = makeState({
      postAuditFindings: [F({ correction: 'wrap the catch body with tridentLog + rethrow' })],
    });
    const r = decide(state);
    expect(r.nextPhase).toBe('CONTAINER_TEST');   // the pre-guard route, untouched
    expect(r.instructions).not.toContain('[LOOP: CONTRADICTION]');
  });

  it('GUARD ORDER: OVER_FIRED dominates — both signals present → the FP gate wins (scoring never reached)', () => {
    resetCalibrationFeedback();
    applyCalibrationSignal({ kind: 'OVER_AUDIT', findingCount: 2614, fileCount: 247, timestamp: Date.now() });
    const state = makeState({
      postAuditFindings: [F({ correction: 'add output.error to chainBeforeHook' })],
    });
    const r = decide(state);
    expect(r.nextPhase).toBe('PROBLEM_SOLVE');
    expect(r.instructions).toContain('[LOOP: OVER_FIRED]');
    resetCalibrationFeedback();
  });
});
