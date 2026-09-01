// route-after-verify.test.ts — CONTAINER_TEST entry after a real wave
// THE CONTRACT: SCORE_TARGET=96 no longer exclusive-gates CONTAINER_TEST.
// A scored wave (score > 0, cycle >= 1) enters ONCE until a LASME-PASS
// artifact exists. PASS still requires score >= 96 AND that artifact.
// A 70-score wave with an existing PASS artifact must NOT re-enter.

import { describe, it, expect } from 'bun:test';
import {
  routeAfterVerify,
  SCORE_TARGET,
  isEmptyWave,
  findingWeight,
  isActionableFinding,
  isNonActionableWave,
  CONFIDENCE_FLOOR,
  SUPPRESSED_WEIGHT_FACTOR,
  normalizeGodLoopPhase,
  isTerminalPhase,
} from '../god-loop.ts';

describe('routeAfterVerify — wave-then-test path', () => {
  it('score >= 96 always routes to CONTAINER_TEST even with a PASS artifact', () => {
    expect(routeAfterVerify(96, 3, true)).toBe('CONTAINER_TEST');
    expect(routeAfterVerify(100, 1, false)).toBe('CONTAINER_TEST');
    expect(SCORE_TARGET).toBe(96);
  });

  it('a scored wave without a PASS artifact enters CONTAINER_TEST once', () => {
    expect(routeAfterVerify(70, 1, false)).toBe('CONTAINER_TEST');
    expect(routeAfterVerify(1, 2, false)).toBe('CONTAINER_TEST');
  });

  it('a scored wave WITH a PASS artifact keeps scoring (AUDIT_RECHECK)', () => {
    expect(routeAfterVerify(70, 1, true)).toBe('AUDIT_RECHECK');
    expect(routeAfterVerify(95, 4, true)).toBe('AUDIT_RECHECK');
  });

  it('score 0 never enters CONTAINER_TEST (no wave progress)', () => {
    expect(routeAfterVerify(0, 0, false)).toBe('AUDIT_RECHECK');
    expect(routeAfterVerify(0, 5, false)).toBe('AUDIT_RECHECK');
    expect(routeAfterVerify(0, 1, true)).toBe('AUDIT_RECHECK');
  });

  it('cycle 0 (pre-wave) never enters CONTAINER_TEST below the target', () => {
    expect(routeAfterVerify(50, 0, false)).toBe('AUDIT_RECHECK');
  });

  it('adversarial: negative / NaN score is not a wave (AUDIT_RECHECK)', () => {
    expect(routeAfterVerify(-1, 2, false)).toBe('AUDIT_RECHECK');
    expect(routeAfterVerify(Number.NaN, 2, false)).toBe('AUDIT_RECHECK');
  });
});

describe('isEmptyWave — COLLECT must not hang on zero agents', () => {
  it('null / undefined / agentCount 0 / empty agents[] are empty', () => {
    expect(isEmptyWave(null)).toBe(true);
    expect(isEmptyWave(undefined)).toBe(true);
    expect(isEmptyWave({ agentCount: 0, agents: [] })).toBe(true);
    expect(isEmptyWave({ agentCount: 0 })).toBe(true);
    expect(isEmptyWave({ agents: [] })).toBe(true);
  });

  it('a wave with agents is not empty', () => {
    expect(isEmptyWave({ agentCount: 1, agents: [{ id: 'a' }] })).toBe(false);
    expect(isEmptyWave({ agentCount: 5, agents: [{}, {}, {}, {}, {}] })).toBe(false);
  });

  it('adversarial: agentCount missing but agents present is not empty', () => {
    expect(isEmptyWave({ agents: [{ id: 'only' }] })).toBe(false);
  });
});

describe('findingWeight — checker artifacts do not pin the score at 88', () => {
  it('HIGH at full confidence is 3; CRITICAL is 10; MEDIUM is 1; LOW is 0.3', () => {
    expect(findingWeight({ severity: 'HIGH', confidence: 0.9 })).toBe(3);
    expect(findingWeight({ severity: 'CRITICAL', confidence: 0.98 })).toBe(10);
    expect(findingWeight({ severity: 'MEDIUM', confidence: 0.8 })).toBe(1);
    expect(findingWeight({ severity: 'LOW', confidence: 0.8 })).toBe(0.3);
  });

  it('confidence below CONFIDENCE_FLOOR is 0 even if HIGH', () => {
    expect(CONFIDENCE_FLOOR).toBe(0.30);
    expect(findingWeight({ severity: 'HIGH', confidence: 0.075 })).toBe(0);
    expect(findingWeight({ severity: 'HIGH', confidence: 0.29 })).toBe(0);
    expect(findingWeight({ severity: 'HIGH', confidence: 0.30 })).toBe(3);
  });

  it('evidenceSuppressed multiplies by SUPPRESSED_WEIGHT_FACTOR (0.1)', () => {
    expect(SUPPRESSED_WEIGHT_FACTOR).toBe(0.1);
    expect(findingWeight({ severity: 'HIGH', confidence: 0.75, evidenceSuppressed: true })).toBe(0.3);
    expect(findingWeight({ severity: 'CRITICAL', confidence: 0.95, evidenceSuppressed: true })).toBe(1);
    // 3 * 0.1 is 0.30000000000000004 before the milli-round — the helper must not leak IEEE noise.
  });

  it('live-fixture R6 pair (conf 0.075 + suppressed) is 0+0 — remainingWeight no longer 6', () => {
    const a = { severity: 'HIGH', confidence: 0.075, evidenceSuppressed: true };
    const b = { severity: 'HIGH', confidence: 0.075, evidenceSuppressed: true };
    expect(findingWeight(a) + findingWeight(b)).toBe(0);
    expect(isActionableFinding(a)).toBe(false);
    expect(isActionableFinding(b)).toBe(false);
  });

  it('adversarial: null / missing severity still returns a number, never throws', () => {
    expect(findingWeight(null)).toBe(0);
    expect(findingWeight(undefined)).toBe(0);
    expect(findingWeight({})).toBe(1);
    expect(isActionableFinding(null)).toBe(false);
  });
});

describe('isNonActionableWave — COLLECT must not wait for npm-ls-node:http', () => {
  it('empty wave is NOT this class (isEmptyWave owns that bounce)', () => {
    expect(isNonActionableWave(null)).toBe(false);
    expect(isNonActionableWave({ agentCount: 0, agents: [] })).toBe(false);
  });

  it('wave whose every finding is below the floor is non-actionable', () => {
    expect(isNonActionableWave({
      agentCount: 1,
      agents: [{ findings: [
        { severity: 'HIGH', confidence: 0.075, evidenceSuppressed: true },
        { severity: 'HIGH', confidence: 0.075, evidenceSuppressed: true },
      ] }],
    })).toBe(true);
  });

  it('wave with one live HIGH is actionable', () => {
    expect(isNonActionableWave({
      agentCount: 1,
      agents: [{ findings: [
        { severity: 'HIGH', confidence: 0.075, evidenceSuppressed: true },
        { severity: 'HIGH', confidence: 0.9, evidenceSuppressed: false },
      ] }],
    })).toBe(false);
  });

  it('adversarial: agents present but no findings[] is NOT non-actionable (unknown work)', () => {
    expect(isNonActionableWave({ agentCount: 1, agents: [{ findings: [] }] })).toBe(false);
    expect(isNonActionableWave({ agentCount: 1, agents: [{}] })).toBe(false);
  });
});

describe('normalizeGodLoopPhase — LOCKED is the old name for PASS', () => {
  it('on-disk LOCKED loads as PASS', () => {
    expect(normalizeGodLoopPhase('LOCKED')).toBe('PASS');
  });

  it('PASS and FAILED stay themselves', () => {
    expect(normalizeGodLoopPhase('PASS')).toBe('PASS');
    expect(normalizeGodLoopPhase('FAILED')).toBe('FAILED');
  });

  it('unknown / empty is INIT, never LOCKED', () => {
    expect(normalizeGodLoopPhase(undefined)).toBe('INIT');
    expect(normalizeGodLoopPhase('')).toBe('INIT');
    expect(normalizeGodLoopPhase('BOGUS')).toBe('INIT');
  });

  it('isTerminalPhase is true for PASS, FAILED, and the old LOCKED alias', () => {
    expect(isTerminalPhase('PASS')).toBe(true);
    expect(isTerminalPhase('FAILED')).toBe(true);
    expect(isTerminalPhase('LOCKED')).toBe(true);
    expect(isTerminalPhase('DISPATCH')).toBe(false);
    expect(isTerminalPhase('CONTAINER_TEST')).toBe(false);
  });
});
