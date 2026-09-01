import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { QueryEngine } from '../../../shared/knowledge-graph/query-engine.ts';
import { ensureTypedGraphSchema } from '../../../shared/knowledge-graph/migrations.ts';
import { verifyClaim } from './verify.ts';
import { classifyFact } from './update.ts';

function makeDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;');
  ensureTypedGraphSchema(db as unknown as { exec(sql: string): unknown });
  return db;
}

function seedVerify(db: Database): QueryEngine {
  db.prepare("INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES ('Function:alpha','Function','alpha','src/a.ts',1,'run1',NULL)").run();
  db.prepare("INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES ('Function:beta','Function','beta','src/b.ts',2,'run1',NULL)").run();
  db.prepare("INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES ('Function:gamma','Function','gamma','src/c.ts',3,'run1',NULL)").run();
  db.prepare("INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES ('Class:Omega','Class','Omega','src/o.ts',4,'run1',NULL)").run();
  db.prepare("INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES ('Function:alpha','Function:beta','calls','alpha calls beta at src/a.ts:1',1.0,'run1',NULL)").run();
  db.prepare("INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES ('Function:beta','Function:gamma','imports','beta imports gamma at src/b.ts:2',1.0,'run1',NULL)").run();
  db.prepare("INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES ('Class:Omega','Function:alpha','caused','Omega caused alpha at src/o.ts:4',1.0,'run1',NULL)").run();
  return new QueryEngine(db);
}

// ---- VERIFY TESTS ----

describe('L7 verifyClaim — path-cited + adjacency + TRACE_GAP', () => {
  it('hallucinated claim with empty pathNodes REFUSED (L7 pathless refusal)', () => {
    const db = makeDb();
    const engine = seedVerify(db);
    const result = verifyClaim({ subject: 'Function:alpha', predicate: 'caused', object: 'Function:beta', pathNodes: [] }, engine);
    expect(result.verdict).toBe('REFUSED');
    expect(result.reason).toMatch(/REFUSED/);
    expect(result.path.length).toBe(0);
    db.close();
  });

  it('hallucinated claim with nonexistent nodes TRACE_GAP named missing', () => {
    const db = makeDb();
    const engine = seedVerify(db);
    const result = verifyClaim({ subject: 'Function:ghost', predicate: 'calls', object: 'Function:phantom' }, engine);
    expect(['REFUSED','TRACE_GAP']).toContain(result.verdict);
    expect(result.gaps.length).toBe(1);
    expect(result.gaps[0].meaning).toMatch(/TRACE_GAP/);
    expect(result.gaps[0].closed).toBe(false);
    db.close();
  });

  it('adjacency-not-causation: calls edge claimed as caused REFUSED with adjacencyViolation', () => {
    const db = makeDb();
    const engine = seedVerify(db);
    const result = verifyClaim({ subject: 'Function:alpha', predicate: 'caused', object: 'Function:beta' }, engine);
    expect(result.verdict).toBe('REFUSED');
    expect(result.adjacencyViolation).toBe(true);
    expect(result.reason).toMatch(/adjacency is NOT causation/);
    expect(result.gaps[0].meaning).toMatch(/predicate families/);
    db.close();
  });

  it('valid caused path ACCEPTED', () => {
    const db = makeDb();
    const engine = seedVerify(db);
    const result = verifyClaim({ subject: 'Class:Omega', predicate: 'caused', object: 'Function:alpha' }, engine);
    expect(result.verdict).toBe('ACCEPTED');
    expect(result.path.length).toBe(1);
    expect(result.path[0].predicate).toBe('caused');
    db.close();
  });

  it('valid calls path ACCEPTED', () => {
    const db = makeDb();
    const engine = seedVerify(db);
    const result = verifyClaim({ subject: 'Function:alpha', predicate: 'calls', object: 'Function:beta' }, engine);
    expect(result.verdict).toBe('ACCEPTED');
    expect(result.path[0].predicate).toBe('calls');
    db.close();
  });

  it('missing predicate edge TRACE_GAP with named structure', () => {
    const db = makeDb();
    const engine = seedVerify(db);
    const result = verifyClaim({ subject: 'Function:alpha', predicate: 'implements', object: 'Function:gamma' }, engine);
    expect(result.verdict).toBe('TRACE_GAP');
    expect(result.gaps[0].meaning).toMatch(/missing/);
    db.close();
  });

  it('inference-flagged claim preserves isInference', () => {
    const db = makeDb();
    const engine = seedVerify(db);
    const result = verifyClaim({ subject: 'Class:Omega', predicate: 'caused', object: 'Function:alpha', isInference: true }, engine);
    expect(result.verdict).toBe('ACCEPTED');
    expect(result.isInference).toBe(true);
    db.close();
  });

  it('null claim throws VerifyError (error path FIRST)', () => {
    const db = makeDb();
    const engine = seedVerify(db);
    expect(() => verifyClaim(null as unknown as object, engine)).toThrow(/VERIFY_CLAIM_INVALID/);
    db.close();
  });

  it('null graph throws VerifyError', () => {
    expect(() => verifyClaim({ subject: 'a', predicate: 'calls', object: 'b' }, null as unknown as object)).toThrow(/VERIFY_GRAPH_INVALID/);
  });

  it('empty subject REFUSED adversarial', () => {
    const db = makeDb();
    const engine = seedVerify(db);
    const result = verifyClaim({ subject: '', predicate: 'calls', object: 'Function:beta' }, engine);
    expect(result.verdict).toBe('REFUSED');
    db.close();
  });

  it('unknown predicate REFUSED adversarial', () => {
    const db = makeDb();
    const engine = seedVerify(db);
    const result = verifyClaim({ subject: 'Function:alpha', predicate: 'teleports', object: 'Function:beta' }, engine);
    expect(result.verdict).toBe('REFUSED');
    db.close();
  });

  it('concurrent verifyClaim consistent (adversarial)', async () => {
    const db = makeDb();
    const engine = seedVerify(db);
    const claims = [
      { subject: 'Function:alpha', predicate: 'calls', object: 'Function:beta' },
      { subject: 'Class:Omega', predicate: 'caused', object: 'Function:alpha' },
      { subject: 'Function:alpha', predicate: 'caused', object: 'Function:beta' },
    ];
    const results = await Promise.all(claims.map((c) => Promise.resolve(verifyClaim(c, engine))));
    expect(results[0].verdict).toBe('ACCEPTED');
    expect(results[1].verdict).toBe('ACCEPTED');
    expect(results[2].verdict).toBe('REFUSED');
    db.close();
  });
});

// ---- UPDATE TESTS ----

describe('L8 classifyFact — five-way + no-delete + compounding', () => {
  it('new fact inserted', () => {
    const db = makeDb();
    const fact = { subject: 'Function:alpha', predicate: 'caused', object: 'Function:beta', evidence: 'alpha caused beta at src/a.ts:1' };
    const r = classifyFact(fact, db);
    expect(r.verdict).toBe('new');
    expect(r.insertedId).toBeDefined();
    const rows = db.prepare('SELECT count(*) as c FROM graph_facts').get() as Record<string, unknown>;
    expect(rows['c']).toBe(1);
    db.close();
  });

  it('duplicate exact match returns duplicate with 0 new rows', () => {
    const db = makeDb();
    const fact = { subject: 'Function:alpha', predicate: 'caused', object: 'Function:beta', evidence: 'alpha caused beta' };
    classifyFact(fact, db);
    const countBefore = (db.prepare('SELECT count(*) as c FROM graph_facts').get() as Record<string, unknown>)['c'] as number;
    const r2 = classifyFact(fact, db);
    expect(r2.verdict).toBe('duplicate');
    const countAfter = (db.prepare('SELECT count(*) as c FROM graph_facts').get() as Record<string, unknown>)['c'] as number;
    expect(countAfter).toBe(countBefore);
    db.close();
  });

  it('contradiction flagged-not-overwritten both versions preserved', () => {
    const db = makeDb();
    const f1 = { subject: 'Function:alpha', predicate: 'caused', object: 'Function:beta', evidence: 'alpha caused beta v1' };
    const r1 = classifyFact(f1, db);
    expect(r1.verdict).toBe('new');
    const f2 = { subject: 'Function:alpha', predicate: 'caused', object: 'Function:gamma', evidence: 'alpha caused gamma v2' };
    const r2 = classifyFact(f2, db);
    expect(r2.verdict).toBe('contradiction');
    expect(r2.contradictionRecord).toBeDefined();
    expect(r2.contradictionRecord!.evidence.length).toBe(2);
    const rows = db.prepare('SELECT id, superseded_at FROM graph_facts WHERE subject=?').all('Function:alpha') as Array<{ superseded_at: number | null }>;
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.superseded_at === null)).toBe(true);
    db.close();
  });

  it('superseded fact keeps history — row never deleted, superseded_at set (MC-B-04 no-delete)', () => {
    const db = makeDb();
    const f1 = { subject: 'Function:beta', predicate: 'calls', object: 'Function:gamma', evidence: 'beta calls gamma' };
    classifyFact(f1, db);
    const id1 = (db.prepare('SELECT id FROM graph_facts WHERE subject=?').get('Function:beta') as Record<string, unknown>)['id'] as number;
    const f2 = { subject: 'Function:beta', predicate: 'imports', object: 'Function:gamma', evidence: 'beta imports gamma instead' };
    const r2 = classifyFact(f2, db);
    expect(r2.verdict).toBe('update');
    expect(r2.superseded).toBe(true);
    const oldRow = db.prepare('SELECT superseded_at FROM graph_facts WHERE id=?').get(id1) as Record<string, unknown>;
    expect(oldRow['superseded_at']).not.toBe(null);
    const allRows = db.prepare('SELECT count(*) as c FROM graph_facts WHERE subject=?').get('Function:beta') as Record<string, unknown>;
    expect(allRows['c']).toBe(2);
    db.close();
  });

  it('compounding proof MC-B-05: run2 re-extraction of run1 resolved set = 0 new duplicates', () => {
    const db = makeDb();
    const facts = [
      { subject: 'Function:alpha', predicate: 'caused', object: 'Function:beta', evidence: 'a caused b', created_run: 'run1' },
      { subject: 'Function:beta', predicate: 'calls', object: 'Function:gamma', evidence: 'b calls g', created_run: 'run1' },
    ];
    for (const f of facts) classifyFact(f, db);
    const countAfterRun1 = (db.prepare('SELECT count(*) as c FROM graph_facts').get() as Record<string, unknown>)['c'] as number;
    expect(countAfterRun1).toBe(2);
    let newDupes = 0;
    for (const f of facts) {
      const r = classifyFact({ ...f, created_run: 'run2' }, db);
      if (r.verdict === 'new') newDupes++;
      expect(r.verdict).toBe('duplicate');
    }
    expect(newDupes).toBe(0);
    const countAfterRun2 = (db.prepare('SELECT count(*) as c FROM graph_facts').get() as Record<string, unknown>)['c'] as number;
    expect(countAfterRun2).toBe(2);
    db.close();
  });

  it('uncertain when predicate not in ontology', () => {
    const db = makeDb();
    const r = classifyFact({ subject: 'a', predicate: 'teleports', object: 'b', evidence: 'a teleports b' }, db);
    expect(r.verdict).toBe('uncertain');
    db.close();
  });

  it('uncertain when evidence empty adversarial', () => {
    const db = makeDb();
    const r = classifyFact({ subject: 'a', predicate: 'calls', object: 'b', evidence: '' }, db);
    expect(r.verdict).toBe('uncertain');
    db.close();
  });

  it('null fact throws UpdateError', () => {
    const db = makeDb();
    expect(() => classifyFact(null as unknown as object, db)).toThrow(/UPDATE_FACT_INVALID/);
    db.close();
  });

  it('null graph throws UpdateError', () => {
    expect(() => classifyFact({ subject: 'a', predicate: 'calls', object: 'b', evidence: 'e' }, null as unknown as object)).toThrow(/UPDATE_GRAPH_INVALID/);
  });

  it('empty subject uncertain adversarial', () => {
    const db = makeDb();
    const r = classifyFact({ subject: '', predicate: 'calls', object: 'b', evidence: 'e' }, db);
    expect(r.verdict).toBe('uncertain');
    db.close();
  });

  it('concurrent classifyFact same fact consistent — only one new, rest duplicate', async () => {
    const db = makeDb();
    const fact = { subject: 'Function:conc', predicate: 'calls', object: 'Function:target', evidence: 'conc calls target' };
    const r1 = classifyFact(fact, db);
    expect(r1.verdict).toBe('new');
    const results = await Promise.all([0, 1, 2].map(() => Promise.resolve(classifyFact(fact, db))));
    expect(results.every((r) => r.verdict === 'duplicate')).toBe(true);
    const c = (db.prepare('SELECT count(*) as c FROM graph_facts WHERE subject=?').get('Function:conc') as Record<string, unknown>)['c'] as number;
    expect(c).toBe(1);
    db.close();
  });

  it('boundary: large evidence + confidence 0 still classified', () => {
    const db = makeDb();
    const bigEvidence = 'x'.repeat(5000);
    const r = classifyFact({ subject: 'Function:big', predicate: 'calls', object: 'Function:target', evidence: bigEvidence, confidence: 0 }, db);
    expect(r.verdict).toBe('new');
    db.close();
  });
});
