import { describe, expect, it } from 'bun:test';
import { runRuntimeScenario, runRuntimeCorpus } from '../runtime/runtime-verification.ts';
import type { RuntimeVerificationSpec, RuntimeObservation } from '../runtime/runtime-verification.ts';

function spec(overrides: Partial<RuntimeVerificationSpec> & { mathSpec?: Partial<RuntimeVerificationSpec['mathSpec']> } = {}): RuntimeVerificationSpec {
  const base: RuntimeVerificationSpec = {
    scenarioId: 'SCN-001',
    description: 'base scenario',
    setup: async () => {},
    action: async () => ({ ok: true, detail: 'ok', data: { v: 10 } }),
    assertion: (obs: RuntimeObservation) => obs.ok === true,
    mathSpec: { expression: 'v == 10', bindings: { v: 10 }, expected: 10, tolerance: 0 },
    htuBugRef: 'HT-BUG-22',
    mechanism: 'black-box',
  };
  if (overrides.mathSpec) {
    return { ...base, ...overrides, mathSpec: { ...base.mathSpec, ...overrides.mathSpec } } as RuntimeVerificationSpec;
  }
  return { ...base, ...overrides } as RuntimeVerificationSpec;
}

const expectRejects = async (fn: () => Promise<unknown>, marker: RegExp): Promise<void> => {
  let message = '';
  try { await fn(); } catch (err) { message = err instanceof Error ? err.message : String(err); }
  expect(marker.test(message)).toBe(true);
};

describe('RUNTIME BEHAVIORAL LAYER — structural validation', () => {
  it('rejects missing scenarioId', async () => {
    const s = spec({ scenarioId: '' as unknown as string });
    await expectRejects(() => runRuntimeScenario(s as unknown as RuntimeVerificationSpec), /SPEC_MALFORMED:scenarioId/);
  });
  it('rejects missing setup', async () => {
    const s = spec({ setup: undefined as unknown as RuntimeVerificationSpec['setup'] });
    await expectRejects(() => runRuntimeScenario(s), /SPEC_MALFORMED:setup/);
  });
  it('rejects missing action', async () => {
    const s = spec({ action: undefined as unknown as RuntimeVerificationSpec['action'] });
    await expectRejects(() => runRuntimeScenario(s), /SPEC_MALFORMED:action/);
  });
  it('rejects missing assertion', async () => {
    const s = spec({ assertion: undefined as unknown as RuntimeVerificationSpec['assertion'] });
    await expectRejects(() => runRuntimeScenario(s), /SPEC_MALFORMED:assertion/);
  });
  it('rejects incomplete mathSpec', async () => {
    const s = spec({ mathSpec: { expression: '' } as unknown as RuntimeVerificationSpec['mathSpec'] });
    await expectRejects(() => runRuntimeScenario(s), /SPEC_MALFORMED:mathSpec.expression/);
    const s2 = spec();
    (s2.mathSpec as unknown as Record<string, unknown>).tolerance = NaN;
    await expectRejects(() => runRuntimeScenario(s2), /SPEC_MALFORMED:mathSpec.tolerance/);
  });
  it('rejects missing htuBugRef', async () => {
    const s = spec({ htuBugRef: '' as unknown as string });
    await expectRejects(() => runRuntimeScenario(s), /SPEC_MALFORMED:htuBugRef/);
  });
});

describe('RUNTIME BEHAVIORAL LAYER — passing scenario end-to-end', () => {
  it('passes when assertion true and math valid', async () => {
    const s = spec();
    const r = await runRuntimeScenario(s);
    expect(r.passed).toBe(true);
    expect(r.mathVerdict).toBe('MATH_VALID');
    expect(r.observation.ok).toBe(true);
    expect(r.scenarioId).toBe('SCN-001');
    expect(r.htuBugRef).toBe('HT-BUG-22');
  });
  it('numeric tolerance within tolerance passes', async () => {
    const s = spec({ mathSpec: { expression: 'v == 10', bindings: { v: 10.0004 }, expected: 10, tolerance: 0.001 } });
    s.action = async () => ({ ok: true, detail: 'ok', data: { v: 10.0004 } });
    s.assertion = () => true;
    const r = await runRuntimeScenario(s);
    expect(r.mathVerdict).toBe('MATH_VALID');
    expect(r.passed).toBe(true);
  });
});

describe('RUNTIME BEHAVIORAL LAYER — failing-scenario capture', () => {
  it('fails when assertion returns false', async () => {
    const s = spec();
    s.assertion = () => false;
    const r = await runRuntimeScenario(s);
    expect(r.passed).toBe(false);
    expect(r.mathVerdict).toBe('MATH_VALID');
  });
  it('assertion throwing is captured not crashed', async () => {
    const s = spec();
    s.assertion = () => { throw new Error('assert boom'); };
    const r = await runRuntimeScenario(s);
    expect(r.passed).toBe(false);
    expect(r.observation.detail).toContain('assertion threw');
  });
});

describe('RUNTIME BEHAVIORAL LAYER — math-mismatch two-key agreement', () => {
  it('assertion true + math contradicted → FAILED (red-first two-key)', async () => {
    const s = spec({ mathSpec: { expression: 'v == 10', bindings: { v: 5 }, expected: 10, tolerance: 0 } });
    s.action = async () => ({ ok: true, detail: 'ok', data: { v: 5 } });
    s.assertion = () => true;
    const r = await runRuntimeScenario(s);
    expect(r.mathVerdict).toBe('MATH_CONTRADICTED');
    expect(r.passed).toBe(false);
  });
  it('assertion false + math valid → FAILED', async () => {
    const s = spec();
    s.assertion = () => false;
    const r = await runRuntimeScenario(s);
    expect(r.mathVerdict).toBe('MATH_VALID');
    expect(r.passed).toBe(false);
  });
  it('boolean mismatch → contradicted', async () => {
    const s = spec({ mathSpec: { expression: 'flag == true', bindings: { flag: false }, expected: true, tolerance: 0 } });
    s.action = async () => ({ ok: true, detail: 'ok', data: { flag: false } });
    s.assertion = () => true;
    const r = await runRuntimeScenario(s);
    expect(r.mathVerdict).toBe('MATH_CONTRADICTED');
    expect(r.passed).toBe(false);
  });
  it('string mismatch → contradicted', async () => {
    const s = spec({ mathSpec: { expression: 's == hello', bindings: { s: 'world' }, expected: 'hello', tolerance: 0 } });
    s.action = async () => ({ ok: true, detail: 'ok', data: { s: 'world' } });
    s.assertion = () => true;
    const r = await runRuntimeScenario(s);
    expect(r.mathVerdict).toBe('MATH_CONTRADICTED');
    expect(r.passed).toBe(false);
  });
});

describe('RUNTIME BEHAVIORAL LAYER — throwing-action capture', () => {
  it('action throwing is captured not crashed', async () => {
    const s = spec();
    s.action = async () => { throw new Error('action boom'); };
    const r = await runRuntimeScenario(s);
    expect(r.passed).toBe(false);
    expect(r.observation.ok).toBe(false);
    expect(r.observation.detail).toContain('action threw');
    expect(r.mathVerdict !== undefined).toBe(true);
  });
  it('setup throwing prevents action and is captured', async () => {
    let actionRan = false;
    const s = spec();
    s.setup = async () => { throw new Error('setup boom'); };
    s.action = async () => { actionRan = true; return { ok: true, detail: 'ok' }; };
    const r = await runRuntimeScenario(s);
    expect(r.passed).toBe(false);
    expect(r.observation.detail).toContain('setup failed');
    expect(actionRan).toBe(false);
  });
  it('malformed observation is captured', async () => {
    const s = spec();
    s.action = async () => ({ ok: true, detail: 'ok' } as unknown as RuntimeObservation);
    // Actually valid; test malformed by returning missing detail
    s.action = async () => ({ ok: true } as unknown as RuntimeObservation);
    const r = await runRuntimeScenario(s);
    expect(r.passed).toBe(false);
    expect(r.observation.detail).toContain('malformed observation');
  });
});

describe('RUNTIME BEHAVIORAL LAYER — concurrency safety 10 parallel', () => {
  it('10 specs parallel allSettled style', async () => {
    const specs: RuntimeVerificationSpec[] = Array.from({ length: 10 }, (_, i) => spec({
      scenarioId: `SCN-${i}`,
      htuBugRef: i % 2 === 0 ? 'HT-BUG-22' : 'HT-BUG-23',
      description: `parallel ${i}`,
    }));
    specs[3].action = async () => { throw new Error('boom3'); };
    specs[7].assertion = () => false;
    const summary = await runRuntimeCorpus(specs, { concurrency: 5 });
    expect(summary.total).toBe(10);
    expect(summary.results.length).toBe(10);
    expect(summary.failed).toBe(2);
    expect(summary.passed).toBe(8);
    expect(Object.keys(summary.byBugRef).length).toBe(2);
    expect(summary.byBugRef['HT-BUG-22'].length).toBe(5);
    expect(summary.byBugRef['HT-BUG-23'].length).toBe(5);
  });
  it('one spec rejection never kills batch (SPEC_MALFORMED captured)', async () => {
    const good = spec({ scenarioId: 'GOOD', htuBugRef: 'HT-BUG-22' });
    const bad = { scenarioId: '', description: 'bad', setup: async () => {}, action: async () => ({ ok: true, detail: 'x' }), assertion: () => true, mathSpec: { expression: 'x', bindings: {}, expected: 1, tolerance: 0 }, htuBugRef: 'HT-BUG-23' } as unknown as RuntimeVerificationSpec;
    const summary = await runRuntimeCorpus([good, bad, good], { concurrency: 10 });
    expect(summary.total).toBe(3);
    expect(summary.results.length).toBe(3);
    expect(summary.failed).toBe(1);
    expect(summary.results.find((r) => r.scenarioId === 'GOOD')?.passed).toBe(true);
  });
  it('concurrency 1 serial still correct', async () => {
    const specs = Array.from({ length: 4 }, (_, i) => spec({ scenarioId: `S-${i}` }));
    const summary = await runRuntimeCorpus(specs, { concurrency: 1 });
    expect(summary.passed).toBe(4);
    expect(summary.failed).toBe(0);
  });
});
