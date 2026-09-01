import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import { TYPED_GRAPH_DDL } from '../shared/knowledge-graph/migrations.js';
import type { GateOutput, RunSummary, SharedMemoryStore } from './types.js';

export class SQLiteMemoryStore implements SharedMemoryStore {
  readonly backend = 'sqlite' as const;
  private readonly db: Database;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    }
    this.db = new Database(dbPath, { create: true } as unknown as Record<string, unknown>);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gate_outputs (
        gate_name TEXT NOT NULL,
        run_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (gate_name, run_id)
      );
      CREATE TABLE IF NOT EXISTS run_history (
        run_id TEXT PRIMARY KEY,
        summary TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS file_changes (
        run_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        changed_at INTEGER NOT NULL,
        PRIMARY KEY (run_id, file_path)
      );
    `);
  }

  setGateOutput(gateId: string, data: GateOutput): void {
    if (typeof gateId !== 'string' || gateId.trim() === '') {
      throw new Error(`GATE_OUTPUT_INVALID: gateId must be non-empty string got=${JSON.stringify(gateId)}`);
    }
    if (data === null || data === undefined || typeof data !== 'object') {
      throw new Error(`GATE_OUTPUT_INVALID: data must be object got=${JSON.stringify(data)}`);
    }
    const runId = (data as unknown as { runId?: string }).runId
      ?? (data as unknown as { run_id?: string }).run_id
      ?? data.gateName
      ?? gateId;
    const serialized = JSON.stringify(data);
    this.db.prepare(
      `INSERT OR REPLACE INTO gate_outputs (gate_name, run_id, data, created_at) VALUES (?, ?, ?, ?)`,
    ).run(gateId, runId, serialized, Date.now());
  }

  getGateOutput<T extends GateOutput>(gateId: string): T | null {
    const row = this.db.query(
      `SELECT data FROM gate_outputs WHERE gate_name = ? ORDER BY created_at DESC LIMIT 1`,
    ).get(gateId) as Record<string, unknown> | null | undefined;
    if (row === null || row === undefined) return null;
    if (typeof row['data'] !== 'string') {
      throw new Error(`GATE_OUTPUT_CORRUPT: expected data TEXT got=${JSON.stringify(row['data'])}`);
    }
    return JSON.parse(row['data'] as string) as T;
  }

  persistRun(runId: string, data: RunSummary): void {
    if (typeof runId !== 'string' || runId.trim() === '') {
      throw new Error(`RUN_HISTORY_INVALID: runId must be non-empty string got=${JSON.stringify(runId)}`);
    }
    if (data === null || data === undefined || typeof data !== 'object') {
      throw new Error(`RUN_HISTORY_INVALID: data must be object got=${JSON.stringify(data)}`);
    }
    const serialized = JSON.stringify(data);
    this.db.prepare(
      `INSERT OR REPLACE INTO run_history (run_id, summary, created_at) VALUES (?, ?, ?)`,
    ).run(runId, serialized, Date.now());
  }

  getPriorRun(runId: string): RunSummary | null {
    const row = this.db.query(
      `SELECT summary FROM run_history WHERE run_id = ?`,
    ).get(runId) as Record<string, unknown> | null | undefined;
    if (row === null || row === undefined) return null;
    if (typeof row['summary'] !== 'string') {
      throw new Error(`RUN_HISTORY_CORRUPT: expected summary TEXT got=${JSON.stringify(row['summary'])}`);
    }
    return JSON.parse(row['summary'] as string) as RunSummary;
  }

  getChangedFiles(sinceRunId: string): string[] {
    const rows = this.db.query(
      `SELECT file_path FROM file_changes WHERE run_id = ?`,
    ).all(sinceRunId) as Record<string, unknown>[];
    if (!Array.isArray(rows)) {
      throw new Error(`FILE_CHANGES_CORRUPT: expected array got=${JSON.stringify(rows)}`);
    }
    const out: string[] = [];
    for (const r of rows) {
      if (typeof r['file_path'] !== 'string') {
        throw new Error(`FILE_CHANGES_CORRUPT: expected file_path TEXT got=${JSON.stringify(r['file_path'])}`);
      }
      out.push(r['file_path'] as string);
    }
    return out;
  }

  getGraph(): unknown | null {
    try {
      this.db.exec(TYPED_GRAPH_DDL);
    } catch {}
    let nodes: unknown[] = [];
    let edges: unknown[] = [];
    try {
      const nRows = this.db.query('SELECT canonical_id, kind, label, file, line FROM typed_nodes WHERE superseded_run IS NULL').all() as Array<Record<string, unknown>>;
      nodes = nRows.map((r) => ({ id: String(r['canonical_id']), label: String(r['label'] ?? r['canonical_id']), type: String(r['kind']), file: String(r['file'] ?? ''), data: { line: r['line'] } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (String(msg).includes('no such table')) return null;
      throw e;
    }
    try {
      const eRows = this.db.query('SELECT src_canonical, dst_canonical, predicate, confidence FROM typed_edges WHERE superseded_run IS NULL').all() as Array<Record<string, unknown>>;
      edges = eRows.map((r) => ({ src: String(r['src_canonical']), dst: String(r['dst_canonical']), relation: String(r['predicate']), confidence: 'EXTRACTED' as const }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (String(msg).includes('no such table')) return null;
      throw e;
    }
    if (nodes.length === 0 && edges.length === 0) return null;
    return { nodes, edges, communities: [], godNodes: [] };
  }

  /**
   * Phase-1 stub: no-op — graph slices are merged by graphify's GraphMapper.merge.
   * Phase-2 upgrade: transform the slice into typed_nodes/typed_edges rows
   * (INSERT OR REPLACE into typed_nodes, INSERT into typed_edges with lineage
   * validation) inside a transaction, mirroring db.ts writeGraph semantics.
   */
  mergeGraphSlice(_slice: object): void {
    return;
  }

  /**
   * Phase-1 stub: returns null — the corbell query path is not yet wired.
   * Phase-2 upgrade: query the corbell graph (typed_nodes/typed_edges) via
   * prepared statements with confidence filtering (EXTRACTED vs INFERRED)
   * and return a Subgraph — the async surface anticipates graphify MCP calls.
   */
  async queryGraph(_query: string): Promise<unknown> {
    return null;
  }

  close(): void {
    this.db.close();
  }
}
