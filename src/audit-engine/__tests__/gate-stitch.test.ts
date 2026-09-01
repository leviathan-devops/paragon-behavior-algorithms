import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Database } from 'bun:sqlite';
import { stitchConcurrentSections } from '../gate-stitch.ts';

function mkTmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-stitch-'));
  return d;
}
function write(p: string, c: string) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c, 'utf-8'); }

describe('gate-stitch', () => {
  let tmp: string;
  let ledgerRoot: string;
  let doc1: string;
  let doc2: string;
  let dbPath: string;
  beforeEach(() => {
    tmp = mkTmp();
    ledgerRoot = path.join(tmp, 'aether-ledger');
    fs.mkdirSync(ledgerRoot, { recursive: true });
    doc1 = path.join(ledgerRoot, 'meta-analysis.md');
    doc2 = path.join(ledgerRoot, 'findings-report.md');
    write(doc1, '# AETHER META ANALYSIS — runId test\n\n');
    write(doc2, '# AETHER FINDINGS REPORT — runId test\n\n');
    dbPath = path.join(tmp, 'shared.db');
  });
  afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e: unknown) { void (e as Error).message; } });

  test('3 sections present -> doc2 contains all 3 in canonical order LASME->MPSE->SRO', () => {
    write(path.join(ledgerRoot, 'lasme-section.md'), '## LASME\nlasme-body');
    write(path.join(ledgerRoot, 'mpse-section.md'), '## MPSE\nmpse-body');
    write(path.join(ledgerRoot, 'sro-section.md'), '## SRO\nsro-body');
    write(path.join(ledgerRoot, 'lasme-analysis.md'), 'LASME-ANALYSIS');
    write(path.join(ledgerRoot, 'mpse-analysis.md'), 'MPSE-ANALYSIS');
    write(path.join(ledgerRoot, 'sro-analysis.md'), 'SRO-ANALYSIS');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE IF NOT EXISTS typed_edges (src_canonical TEXT, dst_canonical TEXT, predicate TEXT, evidence_quote TEXT, confidence REAL, created_run TEXT, layer_id TEXT)');
    db.close();
    const r = stitchConcurrentSections(ledgerRoot, doc1, doc2, dbPath);
    expect(r.missing.length).toBe(0);
    expect(r.stitched).toEqual(['lasme-section.md', 'mpse-section.md', 'sro-section.md']);
    const doc2c = fs.readFileSync(doc2, 'utf-8');
    const iL = doc2c.indexOf('lasme-body');
    const iM = doc2c.indexOf('mpse-body');
    const iS = doc2c.indexOf('sro-body');
    expect(iL).toBeGreaterThan(-1);
    expect(iM).toBeGreaterThan(iL);
    expect(iS).toBeGreaterThan(iM);
    const doc1c = fs.readFileSync(doc1, 'utf-8');
    expect(doc1c.indexOf('LASME-ANALYSIS')).toBeGreaterThan(-1);
    expect(doc1c.indexOf('MPSE-ANALYSIS')).toBeGreaterThan(doc1c.indexOf('LASME-ANALYSIS'));
  });

  test('one missing -> missing array contains it + WARN + other 2 stitched', () => {
    write(path.join(ledgerRoot, 'lasme-section.md'), 'LASME');
    write(path.join(ledgerRoot, 'sro-section.md'), 'SRO');
    write(path.join(ledgerRoot, 'lasme-analysis.md'), 'A');
    write(path.join(ledgerRoot, 'mpse-analysis.md'), 'B');
    write(path.join(ledgerRoot, 'sro-analysis.md'), 'C');
    const r = stitchConcurrentSections(ledgerRoot, doc1, doc2, dbPath);
    expect(r.missing).toContain('mpse-section.md');
    expect(r.stitched.includes('lasme-section.md')).toBe(true);
    expect(r.stitched.includes('sro-section.md')).toBe(true);
    const doc2c = fs.readFileSync(doc2, 'utf-8');
    expect(doc2c).toContain('LASME');
    expect(doc2c).toContain('SRO');
  });

  test('empty db -> loud-empty CORRELATIONS line present', () => {
    write(path.join(ledgerRoot, 'lasme-section.md'), 'x');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE IF NOT EXISTS typed_edges (src_canonical TEXT, dst_canonical TEXT, predicate TEXT, evidence_quote TEXT, confidence REAL, created_run TEXT, layer_id TEXT)');
    db.exec('CREATE TABLE IF NOT EXISTS typed_nodes (canonical_id TEXT, kind TEXT, label TEXT, file TEXT, line INTEGER, created_run TEXT)');
    db.close();
    stitchConcurrentSections(ledgerRoot, doc1, doc2, dbPath);
    const c = fs.readFileSync(doc2, 'utf-8');
    expect(c).toContain('## CORRELATIONS');
    expect(c).toContain('No graph tags recorded this run (typed_edges empty)');
  });

  test('populated db fixture -> per-layer counts present', () => {
    write(path.join(ledgerRoot, 'lasme-section.md'), 'x');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE IF NOT EXISTS typed_nodes (canonical_id TEXT, kind TEXT, label TEXT, file TEXT, line INTEGER, created_run TEXT)');
    db.exec('CREATE TABLE IF NOT EXISTS typed_edges (src_canonical TEXT, dst_canonical TEXT, predicate TEXT, evidence_quote TEXT, confidence REAL, created_run TEXT, layer_id TEXT)');
    db.exec(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, layer_id) VALUES ('a','b','p','e',1,'run','LASME')`);
    db.exec(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, layer_id) VALUES ('c','d','p','e',1,'run','LASME')`);
    db.exec(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, layer_id) VALUES ('e','f','p','e',1,'run','MPSE')`);
    db.close();
    stitchConcurrentSections(ledgerRoot, doc1, doc2, dbPath);
    const c = fs.readFileSync(doc2, 'utf-8');
    expect(c).toContain('LASME: 2 tags');
    expect(c).toContain('MPSE: 1 tags');
  });

  test('null concurrent boundary: missing db file does not throw, writes loud-empty', () => {
    write(path.join(ledgerRoot, 'lasme-section.md'), 'x');
    const r = stitchConcurrentSections(ledgerRoot, doc1, doc2, path.join(tmp, 'nonexistent.db'));
    expect(r.correlationRows).toBe(0);
    expect(fs.readFileSync(doc2, 'utf-8')).toContain('## CORRELATIONS');
  });
});
