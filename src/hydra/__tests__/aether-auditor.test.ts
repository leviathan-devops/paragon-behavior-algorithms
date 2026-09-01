import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import { runLayerHunter } from '../aether-auditor.js';
import type { AuditorTemplate } from '../aether-templates/types.js';
import { SubagentOutputSchema } from '../aether-templates/types.js';
import type { GraphifyMCPClient } from '../graphify.js';

function tmpDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aether-aud-')); }
function mockGraph(): GraphifyMCPClient {
  return { callTool: async () => 'ok', listTools: async () => [], connect: async () => {}, disconnect: async () => {}, isConnected: () => true } as unknown as GraphifyMCPClient;
}
function makeTemplate(overrides: Partial<AuditorTemplate> = {}): AuditorTemplate {
  return {
    layerId: 'R18-test-lexicon',
    anchorPredicate: 'lexicon',
    layerNumber: 18,
    staticPrompt: 'IDENTITY: lexicon hunter\nHUNT MANDATE: hunt lexicons\nGRAPH TOOLS USAGE LAW: query first\nFINDINGS-FILE CONTRACT: write json\n[INPUT DATA]',
    outputSchema: SubagentOutputSchema,
    graphQueries: ['q1'],
    ...overrides,
  };
}
function validReport(): string {
  return JSON.stringify({ candidates: [{ layer: 'R18-test-lexicon', predicate: 'violates', subject: 's', object: 'o', file: 'src/a.ts', line: 1, evidence: 'quote here' }], summary: 'found 1' });
}

describe('aether-auditor — scripted agent writes report, reader validates', () => {
  let dir: string;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { void (e as Error).message; }
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = undefined;
    (globalThis as unknown as Record<string, unknown>).__aetherLedgerSpy = undefined;
  });

  test('fulfilled: scripted run writes report.md → seam reads + validates via zod', async () => {
    const ledger = path.join(dir, 'R18-test-lexicon');
    const template = makeTemplate();
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir }: { ledgerDir: string }) => {
      const rp = path.join(ledgerDir, 'findings', 'report.md');
      fs.mkdirSync(path.dirname(rp), { recursive: true });
      fs.writeFileSync(rp, validReport(), 'utf-8');
    };
    const res = await runLayerHunter(template, 'input data: targetRoot=/tmp target', ledger, mockGraph(), path.join(dir, 'shared.db'));
    expect(res.status).toBe('fulfilled');
    if (res.status === 'fulfilled') {
      expect(res.fileBytes).toBeGreaterThan(0);
      expect(res.fileMtime).toBeGreaterThan(0);
      const f = res.findings as { candidates: unknown[]; summary: string };
      expect(f.candidates.length).toBe(1);
      expect(res.telemetry.roundsUsed).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(path.join(ledger, 'brief.md'))).toBe(true);
      const brief = fs.readFileSync(path.join(ledger, 'brief.md'), 'utf-8');
      expect(brief).toContain('[INPUT DATA]');
      expect(brief).toContain('input data:');
    }
  });

  test('report lands as fenced json → reader validates (hardened parser)', async () => {
    const ledger = path.join(dir, 'R18-fenced');
    const template = makeTemplate({ layerId: 'R18-fenced', layerNumber: 18 });
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir }: { ledgerDir: string }) => {
      const rp = path.join(ledgerDir, 'findings', 'report.md');
      fs.mkdirSync(path.dirname(rp), { recursive: true });
      fs.writeFileSync(rp, '```json\n' + validReport() + '\n```', 'utf-8');
    };
    const res = await runLayerHunter(template, 'x', ledger, mockGraph(), '');
    expect(res.status).toBe('fulfilled');
  });

  test('RPM admission spy: ledger.acquire observed via spy hook', async () => {
    const ledger = path.join(dir, 'R18-spy');
    const template = makeTemplate({ layerId: 'R18-spy', layerNumber: 18 });
    let spyCalled = false;
    (globalThis as unknown as Record<string, unknown>).__aetherLedgerSpy = (ledgerObj: unknown) => {
      const l = ledgerObj as { acquire?: unknown };
      expect(typeof l.acquire).toBe('function');
      spyCalled = true;
    };
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir }: { ledgerDir: string }) => {
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), validReport(), 'utf-8');
    };
    const res = await runLayerHunter(template, 'spy input', ledger, mockGraph(), '');
    expect(spyCalled).toBe(true);
    expect(res.status).toBe('fulfilled');
  });

  test('rejected: missing report file → HUNTER_NO_REPORT', async () => {
    const ledger = path.join(dir, 'R18-noreport');
    const template = makeTemplate({ layerId: 'R18-noreport', layerNumber: 18 });
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async () => {};
    const res = await runLayerHunter(template, 'x', ledger, mockGraph(), '');
    expect(res.status).toBe('rejected');
    if (res.status === 'rejected') expect(res.error).toContain('HUNTER_NO_REPORT');
  });

  test('rejected: invalid schema → REPORT_SCHEMA_FAILED', async () => {
    const ledger = path.join(dir, 'R18-badschema');
    const template = makeTemplate({ layerId: 'R18-badschema', layerNumber: 18 });
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir }: { ledgerDir: string }) => {
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), JSON.stringify({ candidates: [{ layer: 'x' }], summary: 'bad' }), 'utf-8');
    };
    const res = await runLayerHunter(template, 'x', ledger, mockGraph(), '');
    expect(res.status).toBe('rejected');
    if (res.status === 'rejected') expect(res.error).toContain('REPORT_SCHEMA_FAILED');
  });

  test('error path first: null template → rejected not throw (L5)', async () => {
    const res = await runLayerHunter(null as unknown as AuditorTemplate, 'x', path.join(dir, 'x'), mockGraph(), '');
    expect(res.status).toBe('rejected');
  });

  test('error path: empty ledgerDir → rejected', async () => {
    const res = await runLayerHunter(makeTemplate(), 'x', '', mockGraph(), '');
    expect(res.status).toBe('rejected');
  });

  test('concurrent hunters: Promise.allSettled isolates failures (L5)', async () => {
    const t1 = makeTemplate({ layerId: 'R18-c1', layerNumber: 18 });
    const t2 = makeTemplate({ layerId: 'R19-c2', layerNumber: 19 });
    const t3 = makeTemplate({ layerId: 'R20-c3', layerNumber: 20 });
    let callN = 0;
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      callN++;
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      if (template.layerId === 'R19-c2') {
        return;
      }
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), validReport(), 'utf-8');
    };
    const results = await Promise.allSettled([
      runLayerHunter(t1, 'a', path.join(dir, 'R18-c1'), mockGraph(), ''),
      runLayerHunter(t2, 'b', path.join(dir, 'R19-c2'), mockGraph(), ''),
      runLayerHunter(t3, 'c', path.join(dir, 'R20-c3'), mockGraph(), ''),
    ]);
    const settlements = results.map((r) => r.status === 'fulfilled' ? r.value : null);
    expect(settlements[0]!.status).toBe('fulfilled');
    expect(settlements[1]!.status).toBe('rejected');
    expect(settlements[2]!.status).toBe('fulfilled');
    expect(callN).toBe(3);
  });

  test('adversarial: empty inputData still builds brief and succeeds', async () => {
    const ledger = path.join(dir, 'R18-empty');
    const template = makeTemplate({ layerId: 'R18-empty', layerNumber: 18 });
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir }: { ledgerDir: string }) => {
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), validReport(), 'utf-8');
    };
    const res = await runLayerHunter(template, '', ledger, mockGraph(), '');
    expect(res.status).toBe('fulfilled');
  });

  test('boundary: report with zero candidates still valid', async () => {
    const ledger = path.join(dir, 'R18-zero');
    const template = makeTemplate({ layerId: 'R18-zero', layerNumber: 18 });
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir }: { ledgerDir: string }) => {
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), JSON.stringify({ candidates: [], summary: 'no findings' }), 'utf-8');
    };
    const res = await runLayerHunter(template, 'x', ledger, mockGraph(), '');
    expect(res.status).toBe('fulfilled');
    if (res.status === 'fulfilled') expect((res.findings as { candidates: unknown[] }).candidates.length).toBe(0);
  });
});
