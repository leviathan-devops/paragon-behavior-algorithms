// container-results-engine.test.ts — LASME classifier battery
// THE CONTRACT: existence of a JSON blob is NOT validity. The engine is
// fail-closed (INCONCLUSIVE, never PASS) on every shape/integrity miss.
// A hand-authored file without writer="trident-container-test" is fabrication.

import { describe, it, expect } from 'bun:test';
import {
  ContainerResultsEngine,
  evaluateContainerResults,
  deriveScenarioVerdict,
  CONTAINER_RESULTS_LEXICON,
} from '../container-results-engine.ts';

function validScenario(over: Record<string, unknown> = {}) {
  return {
    name: 'S1-auth',
    passToken: 'v1.3.14',
    failToken: 'Insufficient credits',
    passTokenMatch: true,
    failTokenAbsent: true,
    toolResultContext: true,
    timedOut: false,
    verdict: 'PASS',
    ...over,
  };
}

function validArtifact(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1',
    containerName: 'poseidon-p0-20260817',
    distSha: '03f837d6dc255c06a7b8f055a1d1472d2637cef9ee431c1fbde2045215b373f2',
    generatedAt: '2026-08-17T17:00:00.000Z',
    writer: 'trident-container-test',
    scenarios: [validScenario()],
    overallVerdict: 'PASS',
    ...over,
  };
}

describe('ContainerResultsEngine — LASME', () => {
  it('the lexicon has typed members (id/kind/matcher/trigger/severity/message) — no bare regex array', () => {
    expect(CONTAINER_RESULTS_LEXICON.length).toBeGreaterThanOrEqual(5);
    for (const m of CONTAINER_RESULTS_LEXICON) {
      expect(m.id.indexOf('CR-') === 0).toBe(true);
      expect(['shape', 'integrity', 'circular']).toContain(m.kind);
      expect(typeof m.match).toBe('function');
      expect(m.triggerCondition.length > 10).toBe(true);
      expect(m.messageTemplate.length > 10).toBe(true);
    }
  });

  it('a sanctioned stamped artifact EMITS valid', () => {
    const r = evaluateContainerResults(validArtifact());
    expect(r.valid).toBe(true);
    expect(r.state).toBe('EMITTED');
    expect(r.artifact?.writer).toBe('trident-container-test');
    expect(r.artifact?.overallVerdict).toBe('PASS');
  });

  it('a string JSON body of the same artifact EMITS valid', () => {
    const r = evaluateContainerResults(JSON.stringify(validArtifact()));
    expect(r.valid).toBe(true);
    expect(r.state).toBe('EMITTED');
  });

  it('empty / null / garbage is INCONCLUSIVE — never PASS', () => {
    for (const raw of [null, undefined, '', '{', '[]', 42, true]) {
      const r = evaluateContainerResults(raw);
      expect(r.valid).toBe(false);
      expect(r.state).toBe('INCONCLUSIVE');
      expect(r.artifact).toBe(null);
    }
  });

  it('a hand-authored file without the writer stamp is fabrication (CR-SHAPE-WRITER)', () => {
    const r = evaluateContainerResults(validArtifact({ writer: 'the-model' }));
    expect(r.valid).toBe(false);
    expect(r.state).toBe('INCONCLUSIVE');
    expect(r.reason).toContain('CR-SHAPE-WRITER');
  });

  it('missing writer is fabrication', () => {
    const a = validArtifact();
    delete (a as { writer?: string }).writer;
    const r = evaluateContainerResults(a);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('CR-SHAPE-WRITER');
  });

  it('empty scenarios is INCONCLUSIVE', () => {
    const r = evaluateContainerResults(validArtifact({ scenarios: [] }));
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('CR-SHAPE-SCENARIOS');
  });

  it('a scenario missing required fields is INCONCLUSIVE', () => {
    const r = evaluateContainerResults(validArtifact({
      scenarios: [{ name: 'S1', verdict: 'PASS' }],
    }));
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('CR-SHAPE-SCENARIO-FIELDS');
  });

  it('circular PASS (passTokenMatch without toolResultContext) is INCONCLUSIVE', () => {
    const r = evaluateContainerResults(validArtifact({
      scenarios: [validScenario({ toolResultContext: false })],
    }));
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('CR-CIRCULAR-PASS');
  });

  it('a timedOut scenario marked PASS is INCONCLUSIVE', () => {
    const r = evaluateContainerResults(validArtifact({
      scenarios: [validScenario({ timedOut: true })],
    }));
    expect(r.valid).toBe(false);
    expect(r.reason.indexOf('CR-TIMEOUT-PASS') !== -1 || r.reason.indexOf('CR-VERDICT-MISMATCH') !== -1).toBe(true);
  });

  it('verdict PASS without both token conditions is INCONCLUSIVE', () => {
    const r = evaluateContainerResults(validArtifact({
      scenarios: [validScenario({ failTokenAbsent: false })],
    }));
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('CR-VERDICT-MISMATCH');
  });

  it('missing containerName / short distSha is INCONCLUSIVE', () => {
    expect(evaluateContainerResults(validArtifact({ containerName: '' })).valid).toBe(false);
    expect(evaluateContainerResults(validArtifact({ distSha: 'abc' })).valid).toBe(false);
  });

  it('overallVerdict must match the derived scenario set', () => {
    const r = evaluateContainerResults(validArtifact({
      scenarios: [validScenario(), validScenario({ name: 'S2', verdict: 'FAIL', passTokenMatch: false })],
      overallVerdict: 'PASS',
    }));
    expect(r.valid).toBe(false);
    expect(r.reason.indexOf('OVERALL_VERDICT_MISMATCH') !== -1 || r.reason.indexOf('CR-VERDICT-MISMATCH') !== -1).toBe(true);
  });

  it('a FAIL overall with a FAIL scenario EMITS valid (loud fail is allowed)', () => {
    const r = evaluateContainerResults(validArtifact({
      scenarios: [validScenario({
        name: 'S-fail',
        passTokenMatch: false,
        failTokenAbsent: true,
        toolResultContext: true,
        timedOut: false,
        verdict: 'FAIL',
      })],
      overallVerdict: 'FAIL',
    }));
    expect(r.valid).toBe(true);
    expect(r.artifact?.overallVerdict).toBe('FAIL');
  });

  it('the machine fail-state is INCONCLUSIVE, never a guessed PASS', () => {
    const eng = new ContainerResultsEngine();
    const r = eng.evaluate(null);
    expect(r.state).toBe('INCONCLUSIVE');
    expect(eng.getState()).toBe('INCONCLUSIVE');
    expect(r.valid).toBe(false);
  });

  it('deriveScenarioVerdict is fail-closed', () => {
    expect(deriveScenarioVerdict({ passTokenMatch: true, failTokenAbsent: true, toolResultContext: true, timedOut: false })).toBe('PASS');
    expect(deriveScenarioVerdict({ passTokenMatch: true, failTokenAbsent: true, toolResultContext: true, timedOut: true })).toBe('INCONCLUSIVE');
    expect(deriveScenarioVerdict({ passTokenMatch: true, failTokenAbsent: true, toolResultContext: false, timedOut: false })).toBe('FAIL');
    expect(deriveScenarioVerdict({ passTokenMatch: false, failTokenAbsent: true, toolResultContext: true, timedOut: false })).toBe('FAIL');
  });
});
