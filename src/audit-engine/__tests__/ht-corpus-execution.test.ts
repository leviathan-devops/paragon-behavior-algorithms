// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { allSpecs } from '../../../tests/fixtures/ht-bugs/index.ts';
import { runRuntimeCorpus } from '../runtime/runtime-verification.ts';

describe('HT-CORPUS EXECUTION — full 23-spec corpus via runRuntimeCorpus', () => {
  it('runs the FULL 23-spec corpus — paste summary; expect >=20 passed; failures reported not suppressed', async () => {
    expect(allSpecs.length).toBe(23);
    const summary = await runRuntimeCorpus(allSpecs as any, { concurrency: 5 });
    const summaryText = `CORPUS SUMMARY: total=${summary.total} passed=${summary.passed} failed=${summary.failed}\n` +
      summary.results.map(r => `  ${r.scenarioId} ${r.htuBugRef} passed=${r.passed} math=${r.mathVerdict} ok=${r.observation.ok} detail=${r.observation.detail.slice(0, 120)}`).join('\n');
    console.log(summaryText);
    for (const r of summary.results) {
      if (!r.passed) {
        console.log(`FAIL: ${r.scenarioId} ${r.htuBugRef} detail=${r.observation.detail} math=${r.mathVerdict}`);
      }
    }
    expect(summary.total).toBe(23);
    expect(summary.results.length).toBe(23);
    // ZERO-TRUST TIGHTENING (2026-08-24 audit): the claim is 23/23 passed with
    // MATH_VALID on EVERY spec — ≥20 + verdict-enum-only let up to 3 specs fail
    // silently while the test stayed green (the exact weakened-check class).
    expect(summary.passed).toBe(23);
    expect(summary.failed).toBe(0);
    for (const r of summary.results) {
      expect(typeof r.scenarioId).toBe('string');
      expect(typeof r.htuBugRef).toBe('string');
      expect(r.passed).toBe(true);
      expect(r.observation && typeof r.observation.detail === 'string').toBe(true);
      expect(r.mathVerdict).toBe('MATH_VALID');
    }
    if (summary.failed > 0) {
      console.log(`CORPUS FAILURES (${summary.failed}): not suppressed — real findings to report`);
      for (const f of summary.results.filter(r => !r.passed)) {
        console.log(`  FAILED ${f.scenarioId}: ${f.observation.detail}`);
      }
    }
    expect(Object.keys(summary.byBugRef).length >= 10).toBe(true);
  });
});
