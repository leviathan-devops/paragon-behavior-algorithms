import { Database } from 'bun:sqlite';
import type { DbClient } from './db.ts';

export interface TypedNodeRow {
  id: number;
  canonical_id: string;
  kind: string;
  label: string;
  file: string | null;
  line: number | null;
  created_run: string;
  superseded_run: string | null;
}

export interface TypedEdgeRow {
  id: number;
  src_canonical: string;
  dst_canonical: string;
  predicate: string;
  evidence_quote: string;
  confidence: number;
  created_run: string;
  superseded_run: string | null;
}

export interface ResolutionRow {
  alias: string;
  canonical_id: string;
  verdict: string;
  reasoning: string;
  created_run: string;
}

export interface GraphFactRow {
  id: number;
  subject: string;
  predicate: string;
  object: string;
  evidence: string;
  confidence: number;
  created_at: number;
  superseded_at: number | null;
}

export interface VectorProvider {
  search(query: string, opts?: { topK?: number }): Promise<Array<{ canonical_id: string; score: number }>>;
}

export interface PathOptions {
  maxDepth?: number;
  predicateFilter?: string[];
  liveOnly?: boolean;
}

export interface CommunityResult {
  componentId: number;
  members: string[];
}

export interface TemporalFilter {
  createdRun?: string;
  supersededRun?: string | null;
  liveOnly?: boolean;
}

const PATH_DEPTH_DEFAULT = 16;
const PATH_DEPTH_MIN = 1;
const PATH_DEPTH_MAX = 64;
const VECTOR_TOPK_DEFAULT = 10;
const VECTOR_TOPK_MIN = 1;
const VECTOR_TOPK_MAX = 100;
function clampDepth(d: number | undefined): number {
  if (d === undefined || d === null) return PATH_DEPTH_DEFAULT;
  if (!Number.isFinite(d)) throw new Error(`PATH_BOUNDED: maxDepth must be finite, got ${String(d)}`);
  const n = Math.floor(d);
  if (n < PATH_DEPTH_MIN) throw new Error(`PATH_BOUNDED: maxDepth must be >=${PATH_DEPTH_MIN}, got ${n}`);
  if (n > PATH_DEPTH_MAX) throw new Error(`PATH_BOUNDED: maxDepth ${n} exceeds max ${PATH_DEPTH_MAX} (MC-B-06)`);
  return n;
}

function dbHandle(db: Database | DbClient): Database {
  if (db instanceof Database) return db;
  const maybe = db as unknown as { handle?: Database };
  if (maybe.handle instanceof Database) return maybe.handle;
  const anyDb = db as unknown as { prepare: (sql: string) => unknown; exec: (sql: string) => unknown };
  if (typeof anyDb.prepare === 'function' && typeof anyDb.exec === 'function') {
    return db as unknown as Database;
  }
  throw new Error('QUERY_ENGINE_BAD_HANDLE: expected Database or DbClient');
}

export class QueryEngine {
  private readonly db: Database;
  private readonly vectorProvider: VectorProvider | null;

  constructor(db: Database | DbClient, vectorProvider?: VectorProvider | null) {
    this.db = dbHandle(db);
    this.vectorProvider = vectorProvider ?? null;
  }

  entity(canonicalId: string): TypedNodeRow | null {
    if (typeof canonicalId !== 'string' || canonicalId.trim().length === 0) {
      throw new Error('ENTITY_INVALID: canonicalId must be non-empty string');
    }
    try {
      const row = this.db.prepare('SELECT id, canonical_id, kind, label, file, line, created_run, superseded_run FROM typed_nodes WHERE canonical_id = ? LIMIT 1').get(canonicalId.trim()) as TypedNodeRow | null | undefined;
      return row ?? null;
    } catch (e: unknown) {
      throw new Error(`ENTITY_QUERY_FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  entityLive(canonicalId: string): TypedNodeRow | null {
    if (typeof canonicalId !== 'string' || canonicalId.trim().length === 0) {
      throw new Error('ENTITY_INVALID: canonicalId must be non-empty string');
    }
    try {
      const row = this.db.prepare('SELECT id, canonical_id, kind, label, file, line, created_run, superseded_run FROM typed_nodes WHERE canonical_id = ? AND superseded_run IS NULL LIMIT 1').get(canonicalId.trim()) as TypedNodeRow | null | undefined;
      return row ?? null;
    } catch (e: unknown) {
      throw new Error(`ENTITY_QUERY_FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  path(from: string, to: string, opts?: PathOptions): TypedEdgeRow[] {
    if (typeof from !== 'string' || from.trim().length === 0) throw new Error('PATH_INVALID: from must be non-empty string');
    if (typeof to !== 'string' || to.trim().length === 0) throw new Error('PATH_INVALID: to must be non-empty string');
    const maxDepth = clampDepth(opts?.maxDepth);
    const liveOnly = opts?.liveOnly !== false;
    const predicateFilter = opts?.predicateFilter;
    if (predicateFilter !== undefined && !Array.isArray(predicateFilter)) throw new Error('PATH_INVALID: predicateFilter must be array');
    try {
      const liveClause = liveOnly ? 'AND superseded_run IS NULL' : '';
      const predClause = predicateFilter && predicateFilter.length > 0 ? `AND predicate IN (${predicateFilter.map(() => '?').join(',')})` : '';
      const baseParams: unknown[] = [from.trim()];
      if (predicateFilter && predicateFilter.length > 0) baseParams.push(...predicateFilter);
      const sql = `
        WITH RECURSIVE search(src, dst, predicate, evidence_quote, confidence, created_run, superseded_run, depth, path) AS (
          SELECT src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run, 1 as depth, src_canonical || '->' || dst_canonical as path
          FROM typed_edges WHERE src_canonical = ? ${predClause} ${liveClause}
          UNION ALL
          SELECT e.src_canonical, e.dst_canonical, e.predicate, e.evidence_quote, e.confidence, e.created_run, e.superseded_run, s.depth + 1, s.path || '->' || e.dst_canonical
          FROM typed_edges e JOIN search s ON e.src_canonical = s.dst
          WHERE s.depth < ? AND e.superseded_run IS NULL AND instr(',' || s.path || ',', ',' || e.dst_canonical || ',') = 0 ${predClause.replace('predicate', 'e.predicate')}
        )
        SELECT src as src_canonical, dst as dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run FROM search WHERE dst = ? ORDER BY depth ASC LIMIT 1
      `;
      const params: unknown[] = [...baseParams, maxDepth, to.trim()];
      if (predicateFilter && predicateFilter.length > 0) {
        params.splice(baseParams.length, 0, ...predicateFilter);
      }
      const row = this.db.prepare(sql).get(...params) as Record<string, unknown> | null | undefined;
      if (!row) return [];
      const pathStr = (this.db.prepare(`WITH RECURSIVE search(src,dst,predicate,evidence_quote,confidence,created_run,superseded_run,depth,path) AS (
          SELECT src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run, 1, src_canonical || '->' || dst_canonical FROM typed_edges WHERE src_canonical = ? ${predClause} ${liveClause}
          UNION ALL
          SELECT e.src_canonical, e.dst_canonical, e.predicate, e.evidence_quote, e.confidence, e.created_run, e.superseded_run, s.depth+1, s.path || '->' || e.dst_canonical FROM typed_edges e JOIN search s ON e.src_canonical=s.dst WHERE s.depth < ? AND instr(','||s.path||',',','||e.dst_canonical||',')=0 ${predClause.replace('predicate','e.predicate')} ${liveOnly ? 'AND e.superseded_run IS NULL' : ''}
        ) SELECT path FROM search WHERE dst=? ORDER BY depth ASC LIMIT 1`).get(...params) as Record<string, unknown> | null | undefined);
      void pathStr;
      const full = this.buildPathEdges(from.trim(), to.trim(), maxDepth, liveOnly, predicateFilter);
      return full;
    } catch (e: unknown) {
      if (e instanceof Error && e.message.startsWith('PATH_')) throw e;
      throw new Error(`PATH_QUERY_FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private buildPathEdges(from: string, to: string, maxDepth: number, liveOnly: boolean, predicateFilter?: string[]): TypedEdgeRow[] {
    const liveClause = liveOnly ? 'AND superseded_run IS NULL' : '';
    const predList = predicateFilter && predicateFilter.length > 0 ? predicateFilter : null;
    const visited = new Set<string>();
    const queue: Array<{ node: string; path: TypedEdgeRow[] }> = [{ node: from, path: [] }];
    visited.add(from);
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur.path.length > maxDepth) continue;
      if (cur.node === to && cur.path.length > 0) return cur.path;
      const sql = `SELECT id, src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run FROM typed_edges WHERE src_canonical = ? ${liveClause} ${predList ? `AND predicate IN (${predList.map(() => '?').join(',')})` : ''}`;
      const params: unknown[] = [cur.node, ...(predList ?? [])];
      let edges: TypedEdgeRow[] = [];
      try {
        const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
        // THE ROW MAPPER (the ISE discipline — a runtime shape check, not a
        // blind cast): each SQL row is validated for the typed-edge required
        // fields before the typed shape is built. A malformed row yields a
        // LOUD ROW_SHAPE error, never a silent undefined-field propagation.
        edges = rows.map((r) => {
          if (typeof r.id !== 'number' || typeof r.src_canonical !== 'string' || typeof r.dst_canonical !== 'string' || typeof r.predicate !== 'string') {
            throw new Error(`EDGE_ROW_SHAPE: the typed_edges row ${JSON.stringify(r).slice(0, 120)} is missing id/src_canonical/dst_canonical/predicate`);
          }
          return {
            id: r.id,
            src_canonical: r.src_canonical,
            dst_canonical: r.dst_canonical,
            predicate: r.predicate,
            evidence_quote: typeof r.evidence_quote === 'string' ? r.evidence_quote : null,
            confidence: typeof r.confidence === 'number' ? r.confidence : 1,
            created_run: typeof r.created_run === 'string' ? r.created_run : '',
            superseded_run: typeof r.superseded_run === 'string' ? r.superseded_run : null,
          } as TypedEdgeRow;
        });
      } catch (e: unknown) {
        throw new Error(`PATH_QUERY_FAILED: ${e instanceof Error ? e.message : String(e)}`);
      }
      for (const e of edges) {
        if (visited.has(e.dst_canonical) && e.dst_canonical !== to) continue;
        if (cur.path.length + 1 > maxDepth) continue;
        if (e.dst_canonical === to) return [...cur.path, e];
        if (!visited.has(e.dst_canonical)) {
          visited.add(e.dst_canonical);
          queue.push({ node: e.dst_canonical, path: [...cur.path, e] });
        }
      }
    }
    return [];
  }

  community(): CommunityResult[] {
    try {
      const edges = this.db.prepare('SELECT src_canonical, dst_canonical FROM typed_edges WHERE superseded_run IS NULL').all() as Array<{ src_canonical: string; dst_canonical: string }>;
      const nodes = this.db.prepare('SELECT canonical_id FROM typed_nodes WHERE superseded_run IS NULL').all() as Array<{ canonical_id: string }>;
      const adj = new Map<string, Set<string>>();
      for (const n of nodes) adj.set(n.canonical_id, new Set());
      for (const e of edges) {
        if (!adj.has(e.src_canonical)) adj.set(e.src_canonical, new Set());
        if (!adj.has(e.dst_canonical)) adj.set(e.dst_canonical, new Set());
        adj.get(e.src_canonical)!.add(e.dst_canonical);
        adj.get(e.dst_canonical)!.add(e.src_canonical);
      }
      const visited = new Set<string>();
      const components: CommunityResult[] = [];
      let cid = 0;
      for (const node of adj.keys()) {
        if (visited.has(node)) continue;
        const members: string[] = [];
        const q: string[] = [node];
        visited.add(node);
        let qi = 0;
        while (qi < q.length) {
          const cur = q[qi++];
          members.push(cur);
          const neigh = adj.get(cur);
          if (!neigh) continue;
          for (const nb of neigh) {
            if (!visited.has(nb)) {
              visited.add(nb);
              q.push(nb);
            }
          }
        }
        components.push({ componentId: cid++, members: members.sort() });
      }
      return components.sort((a, b) => a.componentId - b.componentId);
    } catch (e: unknown) {
      throw new Error(`COMMUNITY_QUERY_FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  temporal(filter: TemporalFilter): { nodes: TypedNodeRow[]; edges: TypedEdgeRow[] } {
    if (!filter || typeof filter !== 'object') throw new Error('TEMPORAL_INVALID: filter must be object');
    try {
      let nodeSql = 'SELECT id, canonical_id, kind, label, file, line, created_run, superseded_run FROM typed_nodes WHERE 1=1';
      const nodeParams: unknown[] = [];
      if (filter.createdRun !== undefined) {
        if (typeof filter.createdRun !== 'string' || filter.createdRun.trim().length === 0) throw new Error('TEMPORAL_INVALID: createdRun must be non-empty string');
        nodeSql += ' AND created_run = ?';
        nodeParams.push(filter.createdRun.trim());
      }
      if (filter.liveOnly) nodeSql += ' AND superseded_run IS NULL';
      else if (filter.supersededRun !== undefined) {
        if (filter.supersededRun === null) nodeSql += ' AND superseded_run IS NULL';
        else {
          if (typeof filter.supersededRun !== 'string') throw new Error('TEMPORAL_INVALID: supersededRun must be string or null');
          nodeSql += ' AND superseded_run = ?';
          nodeParams.push(filter.supersededRun);
        }
      }
      const nodeRows = this.db.prepare(nodeSql).all(...nodeParams) as Record<string, unknown>[];
      // THE NODE ROW MAPPER (the ISE discipline — a runtime shape check, not a
      // blind cast): each typed_nodes row is validated for the required fields.
      const nodes = nodeRows.map((r) => {
        if (typeof r.id !== 'number' || typeof r.canonical_id !== 'string' || typeof r.kind !== 'string' || typeof r.label !== 'string') {
          throw new Error(`NODE_ROW_SHAPE: the typed_nodes row ${JSON.stringify(r).slice(0, 120)} is missing id/canonical_id/kind/label`);
        }
        return {
          id: r.id,
          canonical_id: r.canonical_id,
          kind: r.kind,
          label: r.label,
          file: typeof r.file === 'string' ? r.file : null,
          line: typeof r.line === 'number' ? r.line : null,
          created_run: typeof r.created_run === 'string' ? r.created_run : '',
          superseded_run: typeof r.superseded_run === 'string' ? r.superseded_run : null,
        } as TypedNodeRow;
      });
      let edgeSql = 'SELECT id, src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run FROM typed_edges WHERE 1=1';
      const edgeParams: unknown[] = [];
      if (filter.createdRun !== undefined) {
        edgeSql += ' AND created_run = ?';
        edgeParams.push(filter.createdRun!.trim());
      }
      if (filter.liveOnly) edgeSql += ' AND superseded_run IS NULL';
      else if (filter.supersededRun !== undefined) {
        if (filter.supersededRun === null) edgeSql += ' AND superseded_run IS NULL';
        else {
          edgeSql += ' AND superseded_run = ?';
          edgeParams.push(filter.supersededRun);
        }
      }
      const edgeRows = this.db.prepare(edgeSql).all(...edgeParams) as Record<string, unknown>[];
      // THE EDGE ROW MAPPER (the ISE discipline — a runtime shape check, not a
      // blind cast): each typed_edges row is validated for the required fields.
      const edges = edgeRows.map((r) => {
        if (typeof r.id !== 'number' || typeof r.src_canonical !== 'string' || typeof r.dst_canonical !== 'string' || typeof r.predicate !== 'string') {
          throw new Error(`EDGE_ROW_SHAPE: the typed_edges row ${JSON.stringify(r).slice(0, 120)} is missing id/src_canonical/dst_canonical/predicate`);
        }
        return {
          id: r.id,
          src_canonical: r.src_canonical,
          dst_canonical: r.dst_canonical,
          predicate: r.predicate,
          evidence_quote: typeof r.evidence_quote === 'string' ? r.evidence_quote : null,
          confidence: typeof r.confidence === 'number' ? r.confidence : 1,
          created_run: typeof r.created_run === 'string' ? r.created_run : '',
          superseded_run: typeof r.superseded_run === 'string' ? r.superseded_run : null,
        } as TypedEdgeRow;
      });
      return { nodes, edges };
    } catch (e: unknown) {
      if (e instanceof Error && e.message.startsWith('TEMPORAL_')) throw e;
      throw new Error(`TEMPORAL_QUERY_FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async vector(query: string, opts?: { topK?: number }): Promise<Array<{ canonical_id: string; score: number }>> {
    if (typeof query !== 'string' || query.trim().length === 0) throw new Error('VECTOR_INVALID: query must be non-empty string');
    const topK = opts?.topK ?? VECTOR_TOPK_DEFAULT;
    if (!Number.isInteger(topK) || topK < VECTOR_TOPK_MIN || topK > VECTOR_TOPK_MAX) throw new Error(`VECTOR_INVALID: topK must be integer ${VECTOR_TOPK_MIN}..${VECTOR_TOPK_MAX}`);
    if (this.vectorProvider) {
      try {
        return await this.vectorProvider.search(query.trim(), { topK });
      } catch (e: unknown) {
        throw new Error(`VECTOR_PROVIDER_FAILED: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    try {
      const like = `%${query.trim()}%`;
      const rows = this.db.prepare('SELECT canonical_id, label FROM typed_nodes WHERE superseded_run IS NULL AND (label LIKE ? OR canonical_id LIKE ? OR kind LIKE ?) LIMIT ?').all(like, like, like, topK) as Array<{ canonical_id: string; label: string }>;
      return rows.map((r, i) => ({ canonical_id: r.canonical_id, score: 1 - i * 0.05 }));
    } catch (e: unknown) {
      throw new Error(`VECTOR_QUERY_FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
