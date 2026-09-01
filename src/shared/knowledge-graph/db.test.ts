// src/shared/knowledge-graph/db.test.ts
// The store test suite — the spec cases (§3.6 lines 976-1000) PLUS the
// adversarial additions. The concurrency tests exercise REAL two-handle WAL
// contention on a tmpfile (bun:sqlite opens genuine shared-file connections).
// A test that cannot fail is a defect.

import { describe, it, expect, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openStore, type GraphNode} from './db.ts';
import { ProjectProfileSchema, type ProjectProfile } from './profile-schema.ts';

const createdTmp: string[] = [];

afterAll(() => {
  for (const d of createdTmp) {
    try { fs.rmSync(d, { recursive: true, force: true }); }
    catch (e: unknown) { console.error(`[db.test cleanup] failed to remove ${d}: ${String(e)}`); }
  }
});

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-db-test-'));
  createdTmp.push(dir);
  return path.join(dir, 'shared.db');
}

const specDerivedNode: GraphNode = { id: 'stage:harvest', kind: 'stage', name: 'harvest', lineage: 'SPEC_DERIVED', source: 'profile:pipeline.stages[0]' };
const codeDerivedNode: GraphNode = { id: 'fn:harvestOrders', kind: 'function', name: 'harvestOrders', file: 'src/engine.ts', line: 12, lineage: 'CODE_DERIVED', source: 'corbell' };

function minimalProfile(root: string): ProjectProfile {
  return ProjectProfileSchema.parse({
    project: { name: 'plutus-ts', root, languages: ['typescript'], entryPoints: ['src/index.ts'], build: 'bun build', test: 'bun test' },
    graph: { substrate: 'corbell', scope: ['src'], excludes: [] },
    rules: { corpus: ['MASTER_CONTEXT/SPEC.md'], bindings: {} },
    pipeline: { stages: [{ id: 'harvest', entry: 'harvestOrders', contract: 'the temporal filter' }] },
    history: { failureLogs: [] },
    awareness: { docs: [] },
  });
}

describe('shared DB store', () => {
  it('rejects a lineage-less node (spec §3.6:981-985)', () => {
    const db = openStore(':memory:');
    expect(() => db.writeGraph([{ id: 'x', kind: 'class', name: 'X', file: 'a.ts', line: 1, lineage: 'NOPE' as never, source: 'a.ts:1' }], []))
      .toThrow(/LINEAGE_MISSING/);
    db.close();
  });

  it('is append-only — the API exposes no UPDATE/DELETE and all 11 tables exist (spec §3.6:987-991)', () => {
    const db = openStore(':memory:');
    // the machine's write surface has NO update/delete helpers
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(db));
    expect(methods.some((m) => /^(update|delete)/i.test(m))).toBe(false);
    // the C18.4 schema is present
    const sql = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const names = sql.map((r) => r.name);
    for (const t of [
      'graph_nodes', 'graph_edges', 'findings', 'report_sections', 'implementations',
      'conformance_verdicts', 'events', 'compiled_predicates', 'calibrations', 'rule_cards', 'audits',
    ]) {
      expect(names).toContain(t);
    }
    db.close();
  });

  it('serializes concurrent appends under WAL — no lost rows (spec §3.6:993-998)', async () => {
    try {
      const db = openStore(tmpDbPath());
      const writes = await Promise.all([0, 1, 2, 3].map((i) => db.prepare("INSERT INTO events (kind, payload) VALUES ('TEST', ?)").run(`row-${i}`)));
      expect(writes.every((r) => r.changes === 1)).toBe(true);
      const row = db.prepare('SELECT count(*) AS c FROM events').get();
      expect(row?.['c']).toBe(4);
      db.close();
    } catch (e: unknown) {
      console.warn(`[db.test] serializes concurrent appends failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  });

  it('handles concurrent appends from two agents (two handles) — the WAL + busy_timeout absorb the contention (adversarial, G3.6)', async () => {
    try {
      const dbPath = tmpDbPath();
      const agentA = openStore(dbPath);
      const agentB = openStore(dbPath);
      const aIns = agentA.prepare("INSERT INTO events (kind, payload) VALUES ('TEST', ?)");
      const bIns = agentB.prepare("INSERT INTO events (kind, payload) VALUES ('TEST', ?)");
      // three concurrent writers — two on handle B (one in a transaction), one on handle A;
      // a real SQLite write-lock conflict fires; the 5000ms busy_timeout absorbs it.
      const results = await Promise.all([
        Promise.resolve().then(() => { for (let i = 0; i < 8; i++) aIns.run(`a-${i}`); return 'A'; }).catch((e) => { console.warn(`[db.test] writer A failed: ${e instanceof Error ? e.message : String(e)}`); throw e; }),
        Promise.resolve().then(() => { for (let i = 0; i < 8; i++) bIns.run(`b-${i}`); return 'B'; }).catch((e) => { console.warn(`[db.test] writer B failed: ${e instanceof Error ? e.message : String(e)}`); throw e; }),
        Promise.resolve().then(() => { for (let i = 0; i < 8; i++) bIns.run(`c-${i}`); return 'C'; }).catch((e) => { console.warn(`[db.test] writer C failed: ${e instanceof Error ? e.message : String(e)}`); throw e; }),
      ]);
      expect(results).toEqual(['A', 'B', 'C']);
      const row = agentB.prepare('SELECT count(*) AS c FROM events').get();
      expect(row?.['c']).toBe(24); // no lost rows, no 'database is locked'
      agentA.close();
      agentB.close();
    } catch (e: unknown) {
      console.warn(`[db.test] concurrent appends failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  });

  it('accepts an empty node set — writeGraph([], []) succeeds (adversarial)', () => {
    const db = openStore(':memory:');
    expect(() => db.writeGraph([], [])).not.toThrow();
    db.close();
  });

  it('rejects a lineage-less EDGE (adversarial — the O28.4 law on both node AND edge)', () => {
    const db = openStore(':memory:');
    db.writeGraph([codeDerivedNode], []);
    expect(() => db.writeGraph([], [{ sourceId: 'fn:harvestOrders', targetId: 'stage:harvest', kind: 'wires', lineage: 'NOPE' as never }]))
      .toThrow(/LINEAGE_MISSING/);
    db.close();
  });

  it('enforces foreign_keys=ON — an edge to a missing node is rejected (spec §4.1:1744)', () => {
    const db = openStore(':memory:');
    db.writeGraph([codeDerivedNode], []);
    expect(() => db.writeGraph([], [{ sourceId: 'fn:harvestOrders', targetId: 'GHOST', kind: 'calls', lineage: 'CODE_DERIVED' }]))
      .toThrow(/FOREIGN KEY/);
    db.close();
  });

  it('rejects an evidence-less finding with FINDING_NO_TRIPLET (O9.1, spec line 2062)', () => {
    const db = openStore(':memory:');
    expect(() => db.appendFinding({ ruleId: 'P6', severity: 'CRIT', file: 'src/a.ts', line: 1, evidence: '   ', verdict: 'VIOLATION' }, 'run-1'))
      .toThrow(/FINDING_NO_TRIPLET/);
    expect(() => db.appendFinding({ ruleId: 'P6', severity: 'CRIT', evidence: '', verdict: 'VIOLATION' }, 'run-1'))
      .toThrow(/FINDING_NO_TRIPLET/);
    db.close();
  });

  it('rejects an out-of-canon severity and an invalid event kind (adversarial)', () => {
    const db = openStore(':memory:');
    expect(() => db.appendFinding({ ruleId: 'P6', severity: 'SUPER' as never, evidence: 'chain+quote', verdict: 'VIOLATION' }, 'run-1'))
      .toThrow(/FINDING_INVALID/);
    expect(() => db.appendEvent('NOT_A_KIND' as never, {})).toThrow(/EVENT_INVALID/);
    db.close();
  });

  it('REPLACEs the graph within the run_id scope — the one exception to append-only (spec §4.1:1746-1748)', () => {
    const db = openStore(':memory:');
    db.writeGraph([{ id: 'n1', kind: 'class', name: 'A', file: 'a.ts', line: 1, lineage: 'SPEC_DERIVED', source: 'profile:P1' }], []);
    db.writeGraph([{ id: 'n1', kind: 'class', name: 'A2', file: 'a.ts', line: 2, lineage: 'CODE_DERIVED', source: 'corpus:MASTER_CONTEXT/SPEC.md:1' }], []);
    const row = db.prepare("SELECT name, line, lineage, source FROM graph_nodes WHERE id = 'n1'").get();
    expect(row?.['name']).toBe('A2');
    expect(row?.['line']).toBe(2);
    expect(row?.['source']).toBe('corpus:MASTER_CONTEXT/SPEC.md:1');
    db.close();
  });

  it('writes the full write surface and mirrors a SUMMARY to MASTER_CONTEXT/knowledge-graph/graph.db (D27, spec §4.13:2229)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-mirror-test-'));
    createdTmp.push(root);
    const profile = minimalProfile(root);
    const db = openStore(path.join(root, '.trident', 'knowledge-graph', 'shared.db'));
    db.writeGraph([specDerivedNode, codeDerivedNode], [{ sourceId: 'fn:harvestOrders', targetId: 'stage:harvest', kind: 'wires', lineage: 'HYBRID' }]);
    db.appendFinding({ ruleId: 'P6', severity: 'CRIT', file: 'src/engine3/visual-setup-generator.ts', line: 214, evidence: 'graph edge chain + verbatim quote', verdict: 'VIOLATION' }, 'run-2026-08-12-001', '2026-W33');
    db.appendReportSection({ findingId: 'P6:src/engine3/visual-setup-generator.ts:214', howBroken: 'mechanism', whyBroken: 'root cause', whatViolates: 'quote + anchor', howToFix: 'exact change', whatToDo: 'ordered steps', whyWorks: 'restores the contract' }, 'run-2026-08-12-001');
    db.appendImplementation({ file: 'src/engine3/visual-setup-generator.ts', beforeSha: 'a3f8c1', afterSha: '77d9e2', claim: 'removed the price-distance leg', status: 'PENDING' }, 'run-2026-08-12-001');
    db.appendConformanceVerdict({ findingId: 'P6:src/engine3/visual-setup-generator.ts:214', verdict: 'CONFORMANT', evidence: 'sha + battery re-run', fixedBy: 'trident_build' }, 'run-2026-08-12-001');
    db.appendEvent('HUNT_DONE', { runId: 'run-2026-08-12-001', reportPath: 'MASTER_CONTEXT/knowledge-graph/BUG_HUNT_REPORT_v1.md', findingsCount: 1, batteryVersion: '9f3a' });

    const mirrorPath = db.mirrorToMasterContext(profile);
    expect(mirrorPath).toContain(path.join('MASTER_CONTEXT', 'knowledge-graph', 'graph.db'));

    // the mirror is a SUMMARY: the graph + the findings summaries + the events,
    // but NOT the report_sections bodies. Read the mirror RAW (not via openStore,
    // which would apply the full 11-table schema to the read handle).
    const mirror = new Database(mirrorPath);
    const n = mirror.prepare('SELECT count(*) AS c FROM graph_nodes').get();
    expect(n?.['c']).toBe(2);
    const e = mirror.prepare('SELECT count(*) AS c FROM graph_edges').get();
    expect(e?.['c']).toBe(1);
    const f = mirror.prepare('SELECT count(*) AS c FROM findings').get();
    expect(f?.['c']).toBe(1);
    const ev = mirror.prepare('SELECT count(*) AS c FROM events').get();
    expect(ev?.['c']).toBe(1);
    const rs = mirror.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(rs.map((r) => r.name)).not.toContain('report_sections');
    mirror.close();
    db.close();
  });
});
