import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runMetaLayer, PREDICATE_MAP } from '../aether-meta.js';
import type { AuditorTemplate } from '../aether-templates/types.js';
import { SubagentOutputSchema } from '../aether-templates/types.js';
import type { GraphifyMCPClient } from '../graphify.js';
import { buildMetaTools, META_DOC_REWRITE_REFUSED } from '../aether-tools.js';
import { isPredicate } from '../../shared/knowledge-graph/ontology.js';
import { Database } from 'bun:sqlite';

function tmpDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aether-meta-')); }
function mockGraph(): GraphifyMCPClient {
  return { callTool: async () => 'ok', listTools: async () => [], connect: async () => {}, disconnect: async () => {}, isConnected: () => true } as unknown as GraphifyMCPClient;
}
function makeTemplate(id: string, num: number): AuditorTemplate {
  return { layerId: id, anchorPredicate: id, layerNumber: num, staticPrompt: `IDENTITY ${id} hunter`, outputSchema: SubagentOutputSchema, graphQueries: ['q'] };
}
function validReportFor(id: string, num: number): string {
  return JSON.stringify({ candidates: [{ layer: id, predicate: 'violates', subject: `subj-${num}`, object: 'obj', file: `src/${id}.ts`, line: num, evidence: `evidence for ${id}` }], summary: `summary ${id}` });
}

describe('aether-meta — stitch byte-compare in layerNumber order', () => {
  let dir: string;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { void (e as Error).message; }
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = undefined;
  });

  test('stitch byte-compare: 3 fixtures → doc2 sections in layerNumber order verbatim', async () => {
    const ledgerRoot = path.join(dir, 'ledger');
    const doc1 = path.join(dir, 'meta-analysis.md');
    const doc2 = path.join(dir, 'findings-report.md');
    const roster = [makeTemplate('R20-c', 20), makeTemplate('R18-a', 18), makeTemplate('R19-b', 19)];
    const fixtures: Record<string, string> = {
      'R18-a': validReportFor('R18-a', 18),
      'R19-b': validReportFor('R19-b', 19),
      'R20-c': validReportFor('R20-c', 20),
    };
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      if (template.layerId.endsWith('-meta')) return;
      const content = fixtures[template.layerId] ?? validReportFor(template.layerId, template.layerNumber);
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), content, 'utf-8');
    };
    const result = await runMetaLayer('LASME', roster, () => 'input', ledgerRoot, mockGraph(), path.join(dir, 'shared.db'), doc1, doc2);
    expect(result.docSectionsWritten).toBe(3);
    const doc2Text = fs.readFileSync(doc2, 'utf-8');
    const idx18 = doc2Text.indexOf('## R18 — R18-a');
    const idx19 = doc2Text.indexOf('## R19 — R19-b');
    const idx20 = doc2Text.indexOf('## R20 — R20-c');
    expect(idx18).toBeGreaterThan(-1);
    expect(idx19).toBeGreaterThan(-1);
    expect(idx20).toBeGreaterThan(-1);
    expect(idx18).toBeLessThan(idx19);
    expect(idx19).toBeLessThan(idx20);
    for (const id of ['R18-a', 'R19-b', 'R20-c']) {
      expect(doc2Text).toContain(fixtures[id]!);
    }
    const rosterManifest = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'roster.json'), 'utf-8'));
    expect(rosterManifest.length).toBe(3);
  });

  test('rejected hunter gets [REJECTED: error] section, not silently dropped (AP-3)', async () => {
    const ledgerRoot = path.join(dir, 'ledger2');
    const doc1 = path.join(dir, 'meta2.md');
    const doc2 = path.join(dir, 'findings2.md');
    const roster = [makeTemplate('R18-ok', 18), makeTemplate('R19-bad', 19)];
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      if (template.layerId.endsWith('-meta')) return;
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      if (template.layerId === 'R19-bad') return;
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), validReportFor(template.layerId, template.layerNumber), 'utf-8');
    };
    const result = await runMetaLayer('LASME', roster, () => 'x', ledgerRoot, mockGraph(), '', doc1, doc2);
    const doc2Text = fs.readFileSync(doc2, 'utf-8');
    expect(doc2Text).toContain('## R18 — R18-ok');
    expect(doc2Text).toContain('## R19 — R19-bad [REJECTED:');
    expect(result.roster.filter((r) => r.status === 'rejected').length).toBe(1);
    expect(result.roster.filter((r) => r.status === 'fulfilled').length).toBe(1);
  });

  test('append-only: second gate appends to doc2, first gate content preserved', async () => {
    const ledgerRoot = path.join(dir, 'ledger3');
    const doc1 = path.join(dir, 'meta3.md');
    const doc2 = path.join(dir, 'findings3.md');
    fs.writeFileSync(doc2, '# HEADER\n\n', 'utf-8');
    fs.writeFileSync(doc1, '# META HEADER\n\n', 'utf-8');
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      if (template.layerId.endsWith('-meta')) return;
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), validReportFor(template.layerId, template.layerNumber), 'utf-8');
    };
    await runMetaLayer('LASME', [makeTemplate('R18-a', 18)], () => 'a', ledgerRoot, mockGraph(), '', doc1, doc2);
    const afterFirst = fs.readFileSync(doc2, 'utf-8');
    await runMetaLayer('MPSE', [makeTemplate('R24-d', 24)], () => 'b', ledgerRoot, mockGraph(), '', doc1, doc2);
    const afterSecond = fs.readFileSync(doc2, 'utf-8');
    expect(afterSecond).toContain('# HEADER');
    expect(afterSecond).toContain('## R18 — R18-a');
    expect(afterSecond).toContain('## R24 — R24-d');
    expect(afterSecond.indexOf('## R18 —')).toBeLessThan(afterSecond.indexOf('## R24 —'));
    expect(afterSecond.length).toBeGreaterThan(afterFirst.length);
  });

  test('META_DOC_REWRITE_REFUSED fired on overwrite attempt (AP-5)', async () => {
    const ledgerRoot = path.join(dir, 'ledger4');
    const doc1 = path.join(ledgerRoot, 'meta.md');
    const doc2 = path.join(ledgerRoot, 'findings.md');
    fs.mkdirSync(ledgerRoot, { recursive: true });
    fs.writeFileSync(doc1, 'existing', 'utf-8');
    fs.writeFileSync(doc2, 'existing', 'utf-8');
    const g = mockGraph();
    const tools = buildMetaTools(doc1, doc2, g);
    const w = tools.find((t) => t.name === 'write_meta_doc')!;
    let threw = false;
    let msg = '';
    try { await (w as unknown as { execute: (a: string, b: unknown) => Promise<{ content: Array<{ text: string }> }> }).execute('t', { path: doc1, content: 'new', overwrite: true }); } catch (e) { threw = true; msg = String((e as Error).message ?? e); }
    expect(threw).toBe(true);
    expect(msg).toContain(META_DOC_REWRITE_REFUSED);
  });

  test('adversarial: empty roster → META_ROSTER_INVALID', async () => {
    let err: Error | null = null;
    try { await runMetaLayer('LASME', [], () => 'x', path.join(dir, 'ledger5'), mockGraph(), '', path.join(dir, 'd1.md'), path.join(dir, 'd2.md')); } catch (e) { err = e as Error; }
    expect(err).not.toBeNull();
    expect(err!.message).toContain('META_ROSTER_INVALID');
  });

  test('concurrent hunters via meta: allSettled isolates one failure', async () => {
    const ledgerRoot = path.join(dir, 'ledger6');
    const doc1 = path.join(dir, 'meta6.md');
    const doc2 = path.join(dir, 'findings6.md');
    const roster = [makeTemplate('R18-x', 18), makeTemplate('R19-y', 19), makeTemplate('R20-z', 20)];
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      if (template.layerId.endsWith('-meta')) return;
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      if (template.layerId === 'R19-y') return;
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), validReportFor(template.layerId, template.layerNumber), 'utf-8');
    };
    const result = await runMetaLayer('LASME', roster, () => 'x', ledgerRoot, mockGraph(), '', doc1, doc2);
    expect(result.roster.length).toBe(3);
    expect(result.roster.filter((r) => r.status === 'fulfilled').length).toBe(2);
    expect(result.roster.filter((r) => r.status === 'rejected').length).toBe(1);
    const doc2Text = fs.readFileSync(doc2, 'utf-8');
    expect(doc2Text).toContain('[REJECTED:');
  });
});

describe('aether-meta — WO-1/2/3 tagging seam', () => {
  let dir: string;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { void (e as Error).message; }
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = undefined;
  });

  test('PREDICATE_MAP: all mapped values are ontology-valid', () => {
    for (const [k, v] of Object.entries(PREDICATE_MAP)) {
      expect(isPredicate(v)).toBe(true);
    }
  });

  test('PREDICATE_MAP: covers the 11 failing families from tag-failures.log', () => {
    const families = ['lexicon.threshold', 'actor.orphan', 'state-machine.missing-terminal', 'engine.silentDegrade', 'adapter.delegation-parity', 'mpse.threshold', 'contract.violated', 'graph-structure.anomaly', 'impact-path.blast-radius', 'dead-code.export', 'cycles.import'];
    for (const fam of families) {
      const mapped = PREDICATE_MAP[fam];
      expect(mapped).toBeDefined();
      expect(isPredicate(mapped!)).toBe(true);
    }
  });

  test('PREDICATE_MAP: preserves expected semantic mappings', () => {
    expect(PREDICATE_MAP['lexicon.threshold']).toBe('violates');
    expect(PREDICATE_MAP['actor.orphan']).toBe('violates');
    expect(PREDICATE_MAP['state-machine.missing-terminal']).toBe('violates');
    expect(PREDICATE_MAP['engine.silentDegrade']).toBe('violates');
    expect(PREDICATE_MAP['adapter.delegation-parity']).toBe('wraps');
    expect(PREDICATE_MAP['mpse.threshold']).toBe('unguarded_threshold');
    expect(PREDICATE_MAP['contract.violated']).toBe('contradicts_oracle');
    expect(PREDICATE_MAP['provenance.trace-gap']).toBe('derived_from');
    expect(PREDICATE_MAP['graph-structure.anomaly']).toBe('flagged_by');
    expect(PREDICATE_MAP['impact-path.blast-radius']).toBe('caused');
    expect(PREDICATE_MAP['dead-code.export']).toBe('unwired');
    expect(PREDICATE_MAP['cycles.import']).toBe('calls');
  });

  test('writeRunnerTag via runMetaLayer: mapped predicates INSERT typed_edges (temp db)', async () => {
    const ledgerRoot = path.join(dir, 'ledger-tag');
    const doc1 = path.join(dir, 'meta-tag.md');
    const doc2 = path.join(dir, 'findings-tag.md');
    const dbPath = path.join(dir, 'shared-tag.db');
    const roster = [makeTemplate('R18-lasme-lexicon', 18)];
    const candidates = [
      { layer: 'R18-lasme-lexicon', predicate: 'lexicon.threshold', file: 'src/a.ts', line: 10, evidence: 'lex evidence', subject: 'lex-subj', object: 'Contract' },
      { layer: 'R18-lasme-lexicon', predicate: 'actor.orphan', file: 'src/b.ts', line: 20, evidence: 'actor evidence', subject: 'actor-subj', object: 'Contract' },
      { layer: 'R18-lasme-lexicon', predicate: 'mpse.threshold', file: 'src/c.ts', line: 30, evidence: 'mpse evidence', subject: 'mpse-subj', object: 'Contract' },
      { layer: 'R18-lasme-lexicon', predicate: 'dead-code.export', file: 'src/d.ts', line: 40, evidence: 'dead evidence', subject: 'dead-subj', object: 'Contract' },
      { layer: 'R18-lasme-lexicon', predicate: 'cycles.import', file: 'src/e.ts', line: 50, evidence: 'cycle evidence', subject: 'cycle-subj', object: 'Contract' },
    ];
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      if (template.layerId.endsWith('-meta')) return;
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), JSON.stringify({ candidates, summary: 'mapped' }), 'utf-8');
    };
    const result = await runMetaLayer('LASME', roster, () => 'input', ledgerRoot, mockGraph(), dbPath, doc1, doc2);
    expect(result.roster[0]!.tagsWritten).toBe(5);
    const db = new Database(dbPath);
    const rows = (db as unknown as { prepare: (s: string) => { all: () => Array<{ predicate: string; evidence_quote: string }> } }).prepare('SELECT predicate, evidence_quote FROM typed_edges').all();
    expect(rows.length).toBe(5);
    const preds = rows.map((r) => r.predicate);
    for (const p of preds) expect(isPredicate(p)).toBe(true);
    const lexRow = rows.find((r) => r.predicate === 'violates');
    expect(lexRow).toBeDefined();
    expect(lexRow!.evidence_quote).toContain('[original-predicate:lexicon.threshold]');
  });

  test('unknown predicate still fails loud: TAG_FAILED logged and tagsWritten 0', async () => {
    const ledgerRoot = path.join(dir, 'ledger-unknown');
    const doc1 = path.join(dir, 'meta-unknown.md');
    const doc2 = path.join(dir, 'findings-unknown.md');
    const dbPath = path.join(dir, 'shared-unknown.db');
    const roster = [makeTemplate('R99-unknown-test', 99)];
    const candidates = [{ layer: 'R99-unknown-test', predicate: 'totally.unknown.predicate', file: 'src/x.ts', line: 1, evidence: 'ev', subject: 's', object: 'Contract' }];
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      if (template.layerId.endsWith('-meta')) return;
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), JSON.stringify({ candidates, summary: 'unknown' }), 'utf-8');
    };
    const result = await runMetaLayer('LASME', roster, () => 'input', ledgerRoot, mockGraph(), dbPath, doc1, doc2);
    expect(result.roster[0]!.tagsWritten).toBe(0);
    const logPath = path.join(ledgerRoot, 'tag-failures.log');
    expect(fs.existsSync(logPath)).toBe(true);
    const logText = fs.readFileSync(logPath, 'utf-8');
    expect(logText).toContain('GRAPH_TAG_INVALID_PREDICATE');
    expect(logText).toContain('totally.unknown.predicate');
  });

  test('WAL pragma executes on open: journal_mode is wal', async () => {
    const ledgerRoot = path.join(dir, 'ledger-wal');
    const doc1 = path.join(dir, 'meta-wal.md');
    const doc2 = path.join(dir, 'findings-wal.md');
    const dbPath = path.join(dir, 'shared-wal.db');
    const roster = [makeTemplate('R18-wal-test', 18)];
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      if (template.layerId.endsWith('-meta')) return;
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), JSON.stringify({ candidates: [{ layer: 'R18-wal-test', predicate: 'violates', file: 'src/wal.ts', line: 1, evidence: 'wal-ev', subject: 'wal-subj', object: 'Contract' }], summary: 'wal' }), 'utf-8');
    };
    await runMetaLayer('LASME', roster, () => 'input', ledgerRoot, mockGraph(), dbPath, doc1, doc2);
    const db = new Database(dbPath);
    const modeRow = (db as unknown as { prepare: (s: string) => { get: () => { journal_mode: string } } }).prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(modeRow.journal_mode.toLowerCase()).toBe('wal');
    const timeoutRow = (db as unknown as { prepare: (s: string) => { get: () => { busy_timeout: number } } }).prepare('PRAGMA busy_timeout').get() as { busy_timeout: number } | undefined;
    void timeoutRow;
  });

  test('per-gate roster files written + merged roster.json contains all entries', async () => {
    const ledgerRoot = path.join(dir, 'ledger-roster');
    const doc1a = path.join(dir, 'meta-roster-a.md');
    const doc2a = path.join(dir, 'findings-roster-a.md');
    const doc1b = path.join(dir, 'meta-roster-b.md');
    const doc2b = path.join(dir, 'findings-roster-b.md');
    const doc1c = path.join(dir, 'meta-roster-c.md');
    const doc2c = path.join(dir, 'findings-roster-c.md');
    const mk = (id: string, n: number) => makeTemplate(id, n);
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      if (template.layerId.endsWith('-meta')) return;
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), validReportFor(template.layerId, template.layerNumber), 'utf-8');
    };
    await runMetaLayer('LASME', [mk('R18-lasme-a', 18)], () => 'a', ledgerRoot, mockGraph(), '', doc1a, doc2a);
    expect(fs.existsSync(path.join(ledgerRoot, 'roster-lasme.json'))).toBe(true);
    await runMetaLayer('MPSE', [mk('R24-mpse-a', 24)], () => 'b', ledgerRoot, mockGraph(), '', doc1b, doc2b);
    expect(fs.existsSync(path.join(ledgerRoot, 'roster-mpse.json'))).toBe(true);
    await runMetaLayer('SRO', [mk('R28-sro-a', 28)], () => 'c', ledgerRoot, mockGraph(), '', doc1c, doc2c);
    expect(fs.existsSync(path.join(ledgerRoot, 'roster-sro.json'))).toBe(true);
    const merged = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'roster.json'), 'utf-8')) as Array<{ layerId: string }>;
    expect(merged.length).toBe(3);
    expect(merged.map((e) => e.layerId).sort()).toEqual(['R18-lasme-a', 'R24-mpse-a', 'R28-sro-a'].sort());
    const lasmeOnly = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'roster-lasme.json'), 'utf-8')) as Array<{ layerId: string }>;
    expect(lasmeOnly.length).toBe(1);
    expect(lasmeOnly[0]!.layerId).toBe('R18-lasme-a');
  });

  test('3 concurrent writeRunnerTag calls on one temp db complete without SQLITE_BUSY', async () => {
    const ledgerRoot = path.join(dir, 'ledger-concurrent');
    const dbPath = path.join(dir, 'shared-concurrent.db');
    const gates: Array<'LASME' | 'MPSE' | 'SRO'> = ['LASME', 'MPSE', 'SRO'];
    const rosters: AuditorTemplate[][] = [
      [makeTemplate('R18-conc-a', 18)],
      [makeTemplate('R24-conc-b', 24)],
      [makeTemplate('R28-conc-c', 28)],
    ];
    const candidateSets = [
      [{ layer: 'R18-conc-a', predicate: 'lexicon.threshold', file: 'src/conc-a.ts', line: 1, evidence: 'ev-a', subject: 'subj-a', object: 'Contract' }],
      [{ layer: 'R24-conc-b', predicate: 'contract.violated', file: 'src/conc-b.ts', line: 2, evidence: 'ev-b', subject: 'subj-b', object: 'Contract' }],
      [{ layer: 'R28-conc-c', predicate: 'cycles.import', file: 'src/conc-c.ts', line: 3, evidence: 'ev-c', subject: 'subj-c', object: 'Contract' }],
    ];
    const templateToCands = new Map<string, unknown[]>();
    for (let gi = 0; gi < rosters.length; gi++) {
      for (let ti = 0; ti < rosters[gi]!.length; ti++) {
        templateToCands.set(rosters[gi]![ti]!.layerId, candidateSets[gi]!);
      }
    }
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      if (template.layerId.endsWith('-meta')) return;
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      const cands = templateToCands.get(template.layerId) ?? [];
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), JSON.stringify({ candidates: cands, summary: 'concurrent' }), 'utf-8');
    };
    const docs = gates.map((_, i) => ({ doc1: path.join(dir, `meta-conc-${i}.md`), doc2: path.join(dir, `findings-conc-${i}.md`) }));
    const promises = gates.map((gate, i) => runMetaLayer(gate, rosters[i]!, () => 'conc-input', ledgerRoot, mockGraph(), dbPath, docs[i]!.doc1, docs[i]!.doc2));
    const results = await Promise.all(promises);
    for (const r of results) {
      expect(r.roster[0]!.status).toBe('fulfilled');
      expect(r.roster[0]!.tagsWritten).toBe(1);
    }
    const db = new Database(dbPath);
    const count = (db as unknown as { prepare: (s: string) => { get: () => { c: number } } }).prepare('SELECT COUNT(*) as c FROM typed_edges').get().c;
    expect(count).toBe(3);
  });

  test('adversarial: empty/bogus predicate fails loud via roster path', async () => {
    const ledgerRoot = path.join(dir, 'ledger-adv-empty');
    const doc1 = path.join(dir, 'meta-adv-empty.md');
    const doc2 = path.join(dir, 'findings-adv-empty.md');
    const dbPath = path.join(dir, 'shared-adv-empty.db');
    const roster = [makeTemplate('R18-adv', 18)];
    const candidates = [
      { layer: 'R18-adv', predicate: '', file: 'src/adv.ts', line: 1, evidence: 'ev', subject: 's', object: 'Contract' },
      { layer: 'R18-adv', predicate: 'bogus.nonexistent', file: 'src/adv2.ts', line: 2, evidence: 'ev2', subject: 's2', object: 'Contract' },
    ];
    (globalThis as unknown as Record<string, unknown>).__aetherScriptedRun = async ({ ledgerDir, template }: { ledgerDir: string; template: AuditorTemplate }) => {
      if (template.layerId.endsWith('-meta')) return;
      fs.mkdirSync(path.join(ledgerDir, 'findings'), { recursive: true });
      fs.writeFileSync(path.join(ledgerDir, 'findings', 'report.md'), JSON.stringify({ candidates, summary: 'adv' }), 'utf-8');
    };
    const result = await runMetaLayer('LASME', roster, () => 'x', ledgerRoot, mockGraph(), dbPath, doc1, doc2);
    expect(result.roster[0]!.tagsWritten).toBe(0);
    const logText = fs.readFileSync(path.join(ledgerRoot, 'tag-failures.log'), 'utf-8');
    expect(logText).toContain('GRAPH_TAG_INVALID_PREDICATE');
  });
});
