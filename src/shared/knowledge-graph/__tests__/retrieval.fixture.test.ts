import { describe, it, expect, afterAll, beforeAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { ensureTypedGraphSchema } from '../migrations.ts';
import { QueryEngine } from '../query-engine.ts';

const FIX_NODES: Array<{ canonical_id: string; kind: string; label: string; file: string | null; line: number | null; created_run: string; superseded_run: string | null }> = [
  { canonical_id: 'file:src/auth/service.ts', kind: 'File', label: 'service.ts', file: 'src/auth/service.ts', line: 1, created_run: 'run1', superseded_run: null },
  { canonical_id: 'class:AuthService', kind: 'Class', label: 'AuthService', file: 'src/auth/service.ts', line: 10, created_run: 'run1', superseded_run: null },
  { canonical_id: 'iface:AuthPort', kind: 'Interface', label: 'AuthPort', file: 'src/auth/port.ts', line: 5, created_run: 'run1', superseded_run: null },
  { canonical_id: 'fn:login', kind: 'Function', label: 'login', file: 'src/auth/service.ts', line: 40, created_run: 'run1', superseded_run: null },
  { canonical_id: 'module:auth', kind: 'Module', label: 'auth', file: null, line: null, created_run: 'run1', superseded_run: null },
  { canonical_id: 'gate:auth-gate', kind: 'Gate', label: 'auth-gate', file: null, line: null, created_run: 'run1', superseded_run: null },
  { canonical_id: 'file:src/auth/old.ts', kind: 'File', label: 'old.ts', file: 'src/auth/old.ts', line: 1, created_run: 'run0', superseded_run: 'run1' },
];

const FIX_EDGES: Array<{ src_canonical: string; dst_canonical: string; predicate: string; evidence_quote: string; confidence: number; created_run: string; superseded_run: string | null }> = [
  { src_canonical: 'file:src/auth/service.ts', dst_canonical: 'class:AuthService', predicate: 'declares', evidence_quote: 'class AuthService implements AuthPort', confidence: 0.99, created_run: 'run1', superseded_run: null },
  { src_canonical: 'class:AuthService', dst_canonical: 'iface:AuthPort', predicate: 'implements', evidence_quote: 'AuthService implements AuthPort', confidence: 0.98, created_run: 'run1', superseded_run: null },
  { src_canonical: 'iface:AuthPort', dst_canonical: 'gate:auth-gate', predicate: 'triggers', evidence_quote: 'AuthPort triggers gate auth-gate', confidence: 0.97, created_run: 'run1', superseded_run: null },
  { src_canonical: 'fn:login', dst_canonical: 'iface:AuthPort', predicate: 'calls', evidence_quote: 'login calls AuthPort', confidence: 0.96, created_run: 'run1', superseded_run: null },
  { src_canonical: 'module:auth', dst_canonical: 'file:src/auth/service.ts', predicate: 'imports', evidence_quote: 'module auth imports service.ts', confidence: 0.95, created_run: 'run1', superseded_run: null },
  { src_canonical: 'class:AuthService', dst_canonical: 'module:auth', predicate: 'derived_from', evidence_quote: 'AuthService derived_from auth module', confidence: 0.94, created_run: 'run1', superseded_run: null },
  { src_canonical: 'file:src/auth/old.ts', dst_canonical: 'class:AuthService', predicate: 'declares', evidence_quote: 'old file declares AuthService prior', confidence: 0.80, created_run: 'run0', superseded_run: 'run1' },
];

function seedDb(): Database {
  const db = new Database(':memory:');
  ensureTypedGraphSchema(db as unknown as { exec(sql: string): unknown });
  const nIns = db.prepare('INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)');
  for (const n of FIX_NODES) nIns.run(n.canonical_id, n.kind, n.label, n.file, n.line, n.created_run, n.superseded_run);
  const eIns = db.prepare('INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)');
  for (const e of FIX_EDGES) eIns.run(e.src_canonical, e.dst_canonical, e.predicate, e.evidence_quote, e.confidence, e.created_run, e.superseded_run);
  return db;
}

describe('retrieval.fixture (B-4) — five retrieval families on known fixture', () => {
  let db: Database;
  let qe: QueryEngine;
  beforeAll(() => {
    db = seedDb();
    qe = new QueryEngine(db);
  });
  afterAll(() => {
    try { db.close(); } catch (err: unknown) { console.error(`[retrieval.fixture cleanup] ${err instanceof Error ? err.message : String(err)}`); }
  });

  it('F1 exact-match/entity lookup by canonical_id returns seeded row verbatim', () => {
    const expected = FIX_NODES.find((n) => n.canonical_id === 'class:AuthService')!;
    const got = qe.entity('class:AuthService');
    expect(got).not.toBeNull();
    // # mut-check: entity must return verbatim seeded fields or FAIL
    expect(got!.canonical_id).toBe(expected.canonical_id);
    expect(got!.kind).toBe(expected.kind);
    expect(got!.label).toBe(expected.label);
    expect(got!.file).toBe(expected.file);
    expect(got!.line).toBe(expected.line);
    expect(got!.created_run).toBe(expected.created_run);
    expect(got!.superseded_run).toBe(expected.superseded_run);
  });

  it('F1 entity lookup trims + entityLive returns live row; missing returns null', () => {
    // # mut-check: trim+live semantics must be exact or FAIL
    const trimmed = qe.entity('  class:AuthService  ');
    expect(trimmed?.canonical_id).toBe('class:AuthService');
    expect(qe.entity('ghost:missing')).toBeNull();
    expect(qe.entityLive('class:AuthService')?.superseded_run).toBeNull();
  });

  it('F2 equivalence/family retrieval — sibling set equality via temporal filtered by created_run', () => {
    const run1Expected = FIX_NODES.filter((n) => n.created_run === 'run1' && n.superseded_run === null).map((n) => n.canonical_id).sort();
    const got = qe.temporal({ createdRun: 'run1', liveOnly: true });
    const gotIds = got.nodes.map((n) => n.canonical_id).sort();
    // # mut-check: equivalence set must be exact equality as sets or FAIL
    expect(gotIds).toEqual(run1Expected);
    const kinds = new Set(got.nodes.map((n) => n.kind));
    expect(kinds.size >= 4).toBe(true);
  });

  it('F3 temporal-live vs superseded — liveOnly filter returns only superseded_run IS NULL; superseded visible when queried', () => {
    const live = qe.temporal({ liveOnly: true });
    // # mut-check: liveOnly must exclude superseded rows or FAIL
    expect(live.nodes.every((n) => n.superseded_run === null)).toBe(true);
    expect(live.edges.every((e) => e.superseded_run === null)).toBe(true);
    expect(live.nodes.find((n) => n.canonical_id === 'file:src/auth/old.ts')).toBeUndefined();
    const supersededNodes = qe.temporal({ supersededRun: 'run1' });
    // # mut-check: superseded node visible ONLY when filtering for it or FAIL
    expect(supersededNodes.nodes.some((n) => n.canonical_id === 'file:src/auth/old.ts')).toBe(true);
    expect(supersededNodes.nodes.find((n) => n.canonical_id === 'file:src/auth/old.ts')?.superseded_run).toBe('run1');
    const supersededEdges = qe.temporal({ supersededRun: 'run1' });
    expect(supersededEdges.edges.some((e) => e.src_canonical === 'file:src/auth/old.ts')).toBe(true);
  });

  it('F3 entityLive hides superseded, entity shows it', () => {
    // # mut-check: entityLive must hide superseded while entity shows or FAIL
    expect(qe.entityLive('file:src/auth/old.ts')).toBeNull();
    expect(qe.entity('file:src/auth/old.ts')?.superseded_run).toBe('run1');
  });

  it('F4 path within clampDepth bounds — depth-1 hop found', () => {
    const edges = qe.path('file:src/auth/service.ts', 'class:AuthService', { maxDepth: 1 });
    // # mut-check: single-hop path must return exactly one edge or FAIL
    expect(edges.length).toBe(1);
    expect(edges[0].src_canonical).toBe('file:src/auth/service.ts');
    expect(edges[0].dst_canonical).toBe('class:AuthService');
    expect(edges[0].evidence_quote.length > 0).toBe(true);
  });

  it('F4 path multi-hop within bounds and clampDepth enforcement', () => {
    const multi = qe.path('file:src/auth/service.ts', 'gate:auth-gate', { maxDepth: 5 });
    // # mut-check: multi-hop path depth must be ≤ requested maxDepth or FAIL
    expect(multi.length >= 2).toBe(true);
    expect(multi.length <= 5).toBe(true);
    expect(multi[multi.length - 1].dst_canonical).toBe('gate:auth-gate');
    // # mut-check: depth beyond 64 must throw/clamp per API contract or FAIL
    expect(() => qe.path('file:src/auth/service.ts', 'class:AuthService', { maxDepth: 65 })).toThrow(/PATH_BOUNDED/);
    expect(() => qe.path('file:src/auth/service.ts', 'class:AuthService', { maxDepth: 0 })).toThrow(/PATH_BOUNDED/);
    const clampedDefault = qe.path('file:src/auth/service.ts', 'class:AuthService');
    expect(clampedDefault.length).toBe(1);
  });

  it('F5 community() returns typed shape with componentId + members', () => {
    const coms = qe.community();
    // # mut-check: community must return typed shape with componentId/members or FAIL
    expect(Array.isArray(coms)).toBe(true);
    expect(coms.length >= 1).toBe(true);
    for (const c of coms) {
      expect(typeof c.componentId).toBe('number');
      expect(Array.isArray(c.members)).toBe(true);
      expect(c.members.length >= 1).toBe(true);
    }
    const allMembers = coms.flatMap((c) => c.members).sort();
    const liveNodeIds = FIX_NODES.filter((n) => n.superseded_run === null).map((n) => n.canonical_id).sort();
    expect(new Set(allMembers).size).toBe(liveNodeIds.length);
    for (const id of liveNodeIds) expect(allMembers).toContain(id);
  });

  it('F5 vector() fallback returns typed shape with canonical_id+score and respects topK', async () => {
    const res = await qe.vector('AuthService', { topK: 2 });
    // # mut-check: vector must return shape {canonical_id, score} ranked or FAIL
    expect(Array.isArray(res)).toBe(true);
    expect(res.length >= 1).toBe(true);
    expect(res.length <= 2).toBe(true);
    for (const r of res) {
      expect(typeof r.canonical_id).toBe('string');
      expect(typeof r.score).toBe('number');
      expect(r.canonical_id.length > 0).toBe(true);
    }
    expect(res.some((r) => r.canonical_id.includes('AuthService') || r.canonical_id.includes('auth'))).toBe(true);
    // # mut-check: invalid topK must throw or FAIL
    await expect(qe.vector('x', { topK: 0 } as unknown as { topK: number })).rejects.toThrow(/VECTOR_INVALID/);
    await expect(qe.vector('   ')).rejects.toThrow(/VECTOR_INVALID/);
  });

  it('adversarial: evidence-empty edge MUST be refused by DB CHECK', () => {
    expect(() => db.prepare('INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)').run('file:src/auth/service.ts', 'class:AuthService', 'calls', '', 1, 'run1', null)).toThrow(/constraint/i);
    // # mut-check: empty evidence must be rejected with constraint error or FAIL
    expect(() => db.prepare('INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)').run('file:src/auth/service.ts', 'class:AuthService', 'calls', '', 1, 'run1', null)).toThrow(/constraint/i);
  });

  it('adversarial: unknown predicate MUST be refused by DB CHECK', () => {
    // # mut-check: unknown predicate must be rejected with constraint error or FAIL
    expect(() => db.prepare('INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)').run('file:src/auth/service.ts', 'class:AuthService', 'unknown_predicate_xyz', 'some evidence', 1, 'run1', null)).toThrow(/constraint/i);
  });

  it('adversarial: unknown kind MUST be refused by DB CHECK', () => {
    // # mut-check: unknown kind must be rejected or FAIL
    expect(() => db.prepare('INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?,?,?,?,?,?,?)').run('x:1', 'NotAKind', 'x', null, null, 'run1', null)).toThrow(/constraint/i);
  });

  it('adversarial: empty canonical_id entity() throws', () => {
    // # mut-check: empty id must throw ENTITY_INVALID or FAIL
    expect(() => qe.entity('')).toThrow(/ENTITY_INVALID/);
    expect(() => qe.entityLive('   ')).toThrow(/ENTITY_INVALID/);
  });

  it('adversarial: path with empty from/to and boundary clampDepth', () => {
    expect(() => qe.path('', 'class:AuthService')).toThrow(/PATH_INVALID/);
    expect(() => qe.path('file:src/auth/service.ts', '')).toThrow(/PATH_INVALID/);
    expect(() => qe.path('file:src/auth/service.ts', 'class:AuthService', { maxDepth: -1 })).toThrow(/PATH_BOUNDED/);
    expect(() => qe.path('file:src/auth/service.ts', 'class:AuthService', { maxDepth: NaN })).toThrow(/PATH_BOUNDED/);
  });
});
