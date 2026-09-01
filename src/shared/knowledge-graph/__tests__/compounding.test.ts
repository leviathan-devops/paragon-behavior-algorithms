import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTypedGraphSchema } from '../migrations.ts';
import { QueryEngine } from '../query-engine.ts';

const RUN1 = 'run1';
const RUN2 = 'run2';

const NODES_RUN1: Array<{ canonical_id: string; kind: string; label: string; created_run: string; superseded_run: string | null }> = [
  { canonical_id: 'file:src/core.ts', kind: 'File', label: 'core.ts', created_run: RUN1, superseded_run: null },
  { canonical_id: 'class:Core', kind: 'Class', label: 'Core', created_run: RUN1, superseded_run: null },
  { canonical_id: 'fn:execute', kind: 'Function', label: 'execute', created_run: RUN1, superseded_run: null },
  { canonical_id: 'module:core', kind: 'Module', label: 'core', created_run: RUN1, superseded_run: null },
];

const EDGES_RUN1: Array<{ src: string; dst: string; predicate: string; evidence: string }> = [
  { src: 'file:src/core.ts', dst: 'class:Core', predicate: 'declares', evidence: 'file core.ts declares class Core' },
  { src: 'class:Core', dst: 'fn:execute', predicate: 'declares', evidence: 'Core declares fn execute' },
  { src: 'fn:execute', dst: 'module:core', predicate: 'calls', evidence: 'execute calls module core' },
];

function seedRun(db: Database, createdRun: string, nodes: typeof NODES_RUN1, edges: typeof EDGES_RUN1): void {
  const nIns = db.prepare('INSERT OR IGNORE INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)');
  for (const n of nodes) {
    const existing = db.prepare('SELECT canonical_id FROM typed_nodes WHERE canonical_id = ?').get(n.canonical_id) as Record<string, unknown> | undefined;
    if (!existing) nIns.run(n.canonical_id, n.kind, n.label, null, null, createdRun, null);
  }
  const eIns = db.prepare('INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)');
  for (const e of edges) {
    const dup = db.prepare('SELECT id FROM typed_edges WHERE src_canonical=? AND dst_canonical=? AND predicate=? AND evidence_quote=? AND superseded_run IS NULL').get(e.src, e.dst, e.predicate, e.evidence) as Record<string, unknown> | undefined;
    if (!dup) eIns.run(e.src, e.dst, e.predicate, e.evidence, 1, createdRun, null);
  }
}

function supersedeNode(db: Database, canonicalId: string, supersededRun: string): void {
  const row = db.prepare('SELECT id, canonical_id, kind, label, file, line, created_run FROM typed_nodes WHERE canonical_id=? AND superseded_run IS NULL').get(canonicalId) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`supersedeNode: no live row for ${canonicalId}`);
  db.prepare('UPDATE typed_nodes SET superseded_run=? WHERE id=?').run(supersededRun, row['id']);
  db.prepare('INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)').run(row['canonical_id'], row['kind'], row['label'], row['file'], row['line'], supersededRun, null);
  const edges = db.prepare('SELECT id, src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run FROM typed_edges WHERE (src_canonical=? OR dst_canonical=?) AND superseded_run IS NULL').all(canonicalId, canonicalId) as Array<Record<string, unknown>>;
  for (const ed of edges) {
    db.prepare('UPDATE typed_edges SET superseded_run=? WHERE id=?').run(supersededRun, ed['id']);
    db.prepare('INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)').run(ed['src_canonical'], ed['dst_canonical'], ed['predicate'], ed['evidence_quote'], ed['confidence'], supersededRun, null);
  }
}

describe('graph.compound.dedupe (B-7) — run-1 then run-2 compounding', () => {
  let db: Database;
  let qe: QueryEngine;
  let tmpDir: string;
  let uniqueTriples: number;
  let supersededRowsBefore: number;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-compound-'));
    db = new Database(':memory:');
    ensureTypedGraphSchema(db as unknown as { exec(sql: string): unknown });
    seedRun(db, RUN1, NODES_RUN1, EDGES_RUN1);
    uniqueTriples = EDGES_RUN1.length;
    const liveNodes1 = (db.prepare('SELECT count(*) as c FROM typed_nodes WHERE superseded_run IS NULL').get() as Record<string, unknown>)['c'] as number;
    expect(liveNodes1).toBe(NODES_RUN1.length);
    seedRun(db, RUN2, NODES_RUN1, EDGES_RUN1);
    supersedeNode(db, 'class:Core', RUN2);
    qe = new QueryEngine(db);
    const sup = (db.prepare('SELECT count(*) as c FROM typed_nodes WHERE superseded_run IS NOT NULL').get() as Record<string, unknown>)['c'] as number;
    supersededRowsBefore = sup;
  });

  afterAll(() => {
    try { db.close(); } catch (err: unknown) { console.error(`[compounding cleanup db] ${err instanceof Error ? err.message : String(err)}`); }
    try { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (err: unknown) { console.error(`[compounding cleanup tmp] ${err instanceof Error ? err.message : String(err)}`); }
  });

  it('(a) duplicate-count for run1-resolved entities == 0 new distinct rows (canon-id stable)', () => {
    const distinctNodes = (db.prepare('SELECT count(DISTINCT canonical_id) as c FROM typed_nodes').get() as Record<string, unknown>)['c'] as number;
    // # mut-check: duplicate re-insert of same canon-ids must not create new distinct rows or FAIL
    expect(distinctNodes).toBe(NODES_RUN1.length);
    const liveDistinct = (db.prepare('SELECT count(DISTINCT canonical_id) as c FROM typed_nodes WHERE superseded_run IS NULL').get() as Record<string, unknown>)['c'] as number;
    expect(liveDistinct).toBe(NODES_RUN1.length);
    const dupes = distinctNodes - NODES_RUN1.length;
    // # mut-check: dupes must be 0 or FAIL
    expect(dupes).toBe(0);
  });

  it('(b) supersede-not-delete upheld — conflicting update leaves superseded row PRESENT with original evidence intact', () => {
    const supersededRows = db.prepare('SELECT canonical_id, kind, label, created_run, superseded_run FROM typed_nodes WHERE canonical_id=? AND superseded_run IS NOT NULL').all('class:Core') as Array<Record<string, unknown>>;
    // # mut-check: superseded row must be PRESENT with original evidence intact or FAIL
    expect(supersededRows.length >= 1).toBe(true);
    const orig = supersededRows.find((r) => r['created_run'] === RUN1);
    expect(orig).toBeDefined();
    expect(orig!['superseded_run']).toBe(RUN2);
    expect(orig!['kind']).toBe('Class');
    expect(orig!['label']).toBe('Core');
    const liveRow = db.prepare('SELECT canonical_id FROM typed_nodes WHERE canonical_id=? AND superseded_run IS NULL').get('class:Core') as Record<string, unknown> | undefined;
    expect(liveRow?.['canonical_id']).toBe('class:Core');
    const qeSup = qe.temporal({ supersededRun: RUN2 });
    expect(qeSup.nodes.some((n) => n.canonical_id === 'class:Core' && n.superseded_run === RUN2)).toBe(true);
  });

  it('(c) totals reconcile: total_rows == unique_triples + superseded_rows (nodes)', () => {
    const totalNodes = (db.prepare('SELECT count(*) as c FROM typed_nodes').get() as Record<string, unknown>)['c'] as number;
    const uniqueNodes = NODES_RUN1.length;
    const supersededNodes = (db.prepare('SELECT count(*) as c FROM typed_nodes WHERE superseded_run IS NOT NULL').get() as Record<string, unknown>)['c'] as number;
    // # mut-check: totals must reconcile total == unique + superseded or FAIL
    expect(totalNodes).toBe(uniqueNodes + supersededNodes);
    expect(supersededNodes >= 1).toBe(true);
  });

  it('(c) totals reconcile edges — superseded edge preserved', () => {
    const totalEdges = (db.prepare('SELECT count(*) as c FROM typed_edges').get() as Record<string, unknown>)['c'] as number;
    const supersededEdges = (db.prepare('SELECT count(*) as c FROM typed_edges WHERE superseded_run IS NOT NULL').get() as Record<string, unknown>)['c'] as number;
    const liveEdgesCount = (db.prepare('SELECT count(*) as c FROM typed_edges WHERE superseded_run IS NULL').get() as Record<string, unknown>)['c'] as number;
    // # mut-check: edge totals reconcile or FAIL
    expect(totalEdges).toBe(uniqueTriples + supersededEdges);
    expect(supersededEdges >= 1).toBe(true);
    expect(liveEdgesCount).toBe(uniqueTriples);
    const liveEdges = qe.temporal({ liveOnly: true }).edges;
    expect(liveEdges.length).toBe(uniqueTriples);
  });

  it('adversarial: evidence-empty and unknown predicate rejected in compound db', () => {
    // # mut-check: schema rejects must hold in compound db or FAIL
    expect(() => db.prepare('INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)').run('class:Core', 'fn:execute', 'calls', '', 1, RUN2, null)).toThrow(/constraint/i);
    expect(() => db.prepare('INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)').run('class:Core', 'fn:execute', 'bad_pred', 'ev', 1, RUN2, null)).toThrow(/constraint/i);
  });

  it('adversarial: path liveOnly excludes superseded edges; null/empty rejected', () => {
    expect(() => qe.path('', 'module:core')).toThrow(/PATH_INVALID/);
    const livePath = qe.path('file:src/core.ts', 'fn:execute', { liveOnly: true, maxDepth: 5 });
    expect(livePath.length >= 1).toBe(true);
    expect(livePath.every((e) => e.superseded_run === null)).toBe(true);
  });

  it('adversarial: concurrent temporal reads consistent', async () => {
    const results = await Promise.all([0, 1, 2].map(() => Promise.resolve(qe.temporal({ liveOnly: true }))));
    // # mut-check: concurrent temporal reads must be consistent or FAIL
    expect(results.every((r) => r.nodes.length === results[0].nodes.length)).toBe(true);
  });
});
