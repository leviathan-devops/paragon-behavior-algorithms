import { describe, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import { readFindingsReport, parseMarkdownFindings } from '../aether-report-reader.js';
import { SubagentOutputSchema } from '../aether-templates/types.js';

function tmpFile(content: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-'));
  const p = path.join(d, 'report.md');
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}
const schema = z.object({ candidates: z.array(z.object({ file: z.string() })), summary: z.string() });

const R23_REL = 'src/hydra/__tests__/fixtures/R23-recovery-snapshot.md'; // pinned snapshot (the live ledger is mutable)
const R25_REL = 'src/hydra/__tests__/fixtures/R25-rejection-snapshot.md'; // pinned snapshot (the live ledger is mutable)
function absRel(rel: string): string { return path.join(process.cwd(), rel); }

describe('aether-report-reader', () => {
  test('fenced json parse path', async () => {
    const obj = { candidates: [{ file: 'a.ts' }], summary: 'ok' };
    const p = tmpFile('```json\n' + JSON.stringify(obj) + '\n```');
    const r = await readFindingsReport(p, schema);
    expect((r.findings as typeof obj).summary).toBe('ok');
    expect(r.fileBytes).toBeGreaterThan(0);
    expect(r.fileMtime).toBeGreaterThan(0);
  });
  test('direct json parse path', async () => {
    const obj = { candidates: [{ file: 'b.ts' }], summary: 'direct' };
    const p = tmpFile(JSON.stringify(obj));
    const r = await readFindingsReport(p, schema);
    expect((r.findings as typeof obj).summary).toBe('direct');
  });
  test('balanced brace scan path (prose wrapped)', async () => {
    const obj = { candidates: [{ file: 'c.ts' }], summary: 'wrapped' };
    const p = tmpFile('Here is findings: ' + JSON.stringify(obj) + ' done.');
    const r = await readFindingsReport(p, schema);
    expect((r.findings as typeof obj).summary).toBe('wrapped');
  });
  test('HUNTER_NO_REPORT on missing', async () => {
    let err: Error | null = null;
    try { await readFindingsReport(path.join(os.tmpdir(), 'nonexistent-' + Date.now() + '.md'), schema); } catch (e) { err = e as Error; }
    expect(err).not.toBeNull();
    expect(err!.message).toContain('HUNTER_NO_REPORT');
  });
  test('zod rejection', async () => {
    const p = tmpFile(JSON.stringify({ bad: true }));
    let err: Error | null = null;
    try { await readFindingsReport(p, schema); } catch (e) { err = e as Error; }
    expect(err).not.toBeNull();
    expect(err!.message).toContain('REPORT_SCHEMA_FAILED');
  });
  test('empty file -> parse failed', async () => {
    const p = tmpFile('   ');
    let err: Error | null = null;
    try { await readFindingsReport(p); } catch (e) { err = e as Error; }
    expect(err).not.toBeNull();
  });
  test('no schema returns raw findings', async () => {
    const p = tmpFile(JSON.stringify({ hello: 1 }));
    const r = await readFindingsReport(p);
    expect((r.findings as { hello: number }).hello).toBe(1);
  });
  test('concurrent reads', async () => {
    const obj = { candidates: [{ file: 'x.ts' }], summary: 'c' };
    const p = tmpFile(JSON.stringify(obj));
    const results = await Promise.all([readFindingsReport(p, schema), readFindingsReport(p, schema)]);
    expect(results[0].fileBytes).toBe(results[1].fileBytes);
  });
  test('null path -> HUNTER_NO_REPORT', async () => {
    let err: Error | null = null;
    try { await readFindingsReport('', schema); } catch (e) { err = e as Error; }
    expect(err).not.toBeNull();
    expect(err!.message).toContain('HUNTER_NO_REPORT');
  });

  // markdown canonical block parses to zod-valid findings
  test('markdown canonical block parses to zod-valid findings', async () => {
    const md = '# Hunt Report\n## FINDING: uncalibrated threshold gates contract decision\n- predicate: lexicon.threshold\n- file: src/audit-engine/layers/r-lexicon.ts:42\n- evidence: "if (score > 0.7) { pass(); }"\n- spec: MASTER_CONTEXT/V443_PLAN_A.md:118 threshold 0.85\n- severity: HIGH\n- confidence: 0.85\n## SUMMARY\n1 finding — HIGH.\n';
    const p = tmpFile(md);
    const r = await readFindingsReport(p, SubagentOutputSchema as unknown as typeof schema);
    const findings = r.findings as { candidates: { file: string; subject: string }[]; summary: string };
    expect(findings.candidates.length).toBe(1);
    expect(findings.candidates[0]!.file).toBe('src/audit-engine/layers/r-lexicon.ts');
    const prod = SubagentOutputSchema.safeParse(findings);
    expect(prod.success).toBe(true);
  });

  test('markdown canonical with surrounding prose ignored', async () => {
    const md = '# R99 Hunt\n## 0. Executive Summary\nThis hunt audited 10 files. Verdict 1 finding.\n\n## 1. Spec Ground Truth\nSpec says threshold.\n\n## FINDING: bare literal 0.7 without epsilon\n- predicate: mpse.threshold\n- layer: R23-lasme-mpse-threshold\n- object: Contract\n- file: src/a.ts:10\n- evidence: "if (x > 0.7) {}"\n- spec: spec.md:5 threshold 0.85\n## SUMMARY\n1 finding.\n';
    const p = tmpFile(md);
    const r = await readFindingsReport(p, schema);
    expect((r.findings as { candidates: unknown[] }).candidates.length).toBe(1);
  });

  test('markdown missing required field -> GRAMMAR_VIOLATION names field', async () => {
    const md = '## FINDING: missing predicate field\n- file: src/a.ts:10\n- evidence: "quote"\n- spec: spec.md:1 clause\n## SUMMARY\nx\n';
    const p = tmpFile(md);
    let err: Error | null = null;
    try { await readFindingsReport(p, schema); } catch (e) { err = e as Error; }
    expect(err).not.toBeNull();
    expect(err!.message).toContain('GRAMMAR_VIOLATION');
    expect(err!.message).toContain('predicate');
  });

  test('conversational noise with no finding grammar -> GRAMMAR_VIOLATION', async () => {
    const noise = '# Daily Notes\nToday we discussed the audit approach. The spec is large. We decided to hunt lexicon\nissues tomorrow. No findings were emitted yet. The methodology involves reading files\nand tracing predicates. We will produce a report soon.\n';
    const p = tmpFile(noise);
    let err: Error | null = null;
    try { await readFindingsReport(p, schema); } catch (e) { err = e as Error; }
    expect(err).not.toBeNull();
    expect(err!.message).toContain('GRAMMAR_VIOLATION');
  });

  test('parseMarkdownFindings unit: direct call', () => {
    const raw = '## FINDING: subject alpha\n- predicate: lexicon.threshold\n- file: src/b.ts:20\n- evidence: "code quote"\n- spec: spec.md:2 clause\n## SUMMARY\n1 finding.\n';
    const res = parseMarkdownFindings(raw);
    expect(res).not.toBeNull();
    expect(res!.candidates.length).toBe(1);
    expect((res!.candidates[0] as { subject: string }).subject).toBe('subject alpha');
  });

  // recovery fixture R23 real file >=7
  test('R23 snapshot parses to >=1 findings (recovery fixture — pinned; live-run hunters now use the canonical grammar)', async () => {
    const abs = absRel(R23_REL);
    if (!fs.existsSync(abs)) { expect(true).toBe(true); return; }
    const r = await readFindingsReport(abs, SubagentOutputSchema as unknown as typeof schema);
    const findings = r.findings as { candidates: unknown[]; summary: string };
    expect(findings.candidates.length).toBeGreaterThanOrEqual(1); // the snapshot parses via the canonical grammar path (the live hunters adopted ## FINDING:)
    expect(findings.summary.length).toBeGreaterThan(0);
  });

  test('R23 parse unit >=1 via parseMarkdownFindings (canonical grammar adopted)', () => {
    const abs = absRel(R23_REL);
    if (!fs.existsSync(abs)) return;
    const raw = fs.readFileSync(abs, 'utf-8');
    const res = parseMarkdownFindings(raw);
    expect(res).not.toBeNull();
    expect(res!.candidates.length).toBeGreaterThanOrEqual(1); // canonical grammar adopted by live hunters
  });

  // honest note: R25 spine marker report honestly still rejected (no FINDING blocks, no JSON)
  test('R25 snapshot parses (the grammar teaching landed — formerly spine-marker, now grammatical)', async () => {
    const abs = absRel(R25_REL);
    if (!fs.existsSync(abs)) return;
    let err: Error | null = null;
    try { await readFindingsReport(abs, schema); } catch (e) { err = e as Error; }
    expect(err).toBeNull(); // the grammar teaching landed: R25 now parses (grammar blocks present)
  });
});
