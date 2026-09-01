import { describe, expect, it } from 'bun:test';
import { generateReport, generationFailed, SUPREMACY_CONTRACT } from '../aether/audit-aether.ts';

describe('THE AETHER BACKEND (W7 — the supremacy + the loud-fail, the L2 spec §3.9)', () => {
  it('THE LIAR — the context contradicts the graph; the report reports the GRAPH + flags the conflict', () => {
    const report = generateReport({
      findings: [{ id: 'f1' }],
      graphScore: 23,
      context: { score: 100 },   // the lie — the belief
    });
    expect(report.ready).toBe(true);
    expect(report.errors.some((e) => e.includes('CONTEXT-MISMATCH'))).toBe(true);  // the supremacy — the data over the belief
    expect(report.report).toContain('23');  // the GRAPH's score, never the context's 100
  });

  it('THE BLANK — the thin args → the named refusal (never a generation)', () => {
    const blank = generateReport({ findings: [] as unknown[] });
    expect(blank.ready).toBe(false);
    expect(blank.errors.some((e) => e.includes('FINDINGS_REQUIRED'))).toBe(true);
  });

  it('THE COHERENCE — the 6-section anatomy present (the structure flag)', () => {
    const report = generateReport({ findings: [{ id: 'f1' }], graphScore: 80 });
    expect(report.flags?.structure).toBe(true);
    for (const section of ['executive-summary', 'findings', 'architecture', 'audits', 'fix-order', 'appendices']) {
      expect(report.sections?.includes(section)).toBe(true);
    }
  });

  it('THE VERBATIM — the doctrine quote word-for-word (the supremacy contract)', () => {
    const report = generateReport({ findings: [{ id: 'f1' }], graphScore: 80 });
    expect(report.report).toContain('THE FILES/GRAPH ARE THE ONLY GROUND TRUTH');
    expect(report.report).toContain('THE CONTEXT ARGS ARE BELIEF');
  });

  it('THE LOUD-FAIL — a generation failure → the ready:false manifest, the named stage', () => {
    const failed = generationFailed('http', 'the provider rejected the request');
    expect(failed.ready).toBe(false);
    expect(failed.errors.some((e) => e.includes('GENERATION_FAILED (http)'))).toBe(true);
    expect(failed.report === undefined).toBe(true);   // NO partial report file
  });

  it('THE SUPREMACY CONTRACT is the exact quoted text (the M5 lesson)', () => {
    expect(SUPREMACY_CONTRACT).toContain('THE FILES/GRAPH ARE THE ONLY GROUND TRUTH');
    expect(SUPREMACY_CONTRACT).toContain('NEVER conform to the belief');
  });
});
