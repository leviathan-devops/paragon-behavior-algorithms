/**
 * audit-graph.ts — THE KNOWLEDGE-GRAPH INTEGRATION (the L2 spec §3.6 — W4)
 *
 * THE DEAD GRAPH BECOMES THE AUDIT'S MEMORY. The measured defect:
 * graph-backed-audit.ts is instantiated with `new GraphBackedAuditClass(null)`
 * (audit-engine/index.ts constructor) → evidence3D/graphDrift ALWAYS hit the
 * "graph unavailable — shared.db not connected" fallback. THE FIX: the audit
 * opens <target>/.trident/knowledge-graph/shared.db (the C18.4 schema), the
 * graph builds from the W1 constructs (the CODE_DERIVED nodes + the call
 * edges), the query verbs (whoCalls/chain/unwired) return real data, the
 * audit history persists (compaction-inert).
 * THE LINEAGE DUALITY (O28.4): every node/edge carries SPEC_DERIVED |
 * CODE_DERIVED | HYBRID — the store REJECTS a lineage-less node.
 * THE FAIL-CLOSED: a connection failure → GRAPH_DB_FAILED, never the silent
 * "graph unavailable".
 */
import * as fs from 'fs';
import * as path from 'path';
import { openStore, writeGraph, appendFinding, DbClient, GraphNode, GraphEdge, FindingInput } from '../../shared/knowledge-graph/db.ts';
import { CodeConstruct, ConstructType, AuditFinding } from '../types.ts';
import { tridentLog } from '../../utils.js';

// ── THE NAMED ERRORS (the loud-fail law) ──
export const GRAPH_ERRORS = {
  GRAPH_DB_FAILED: 'GRAPH_DB_FAILED',       // the db connection failure — never the silent fallback
  FINDING_NO_TRIPLET: 'FINDING_NO_TRIPLET', // the evidence-less finding — the two-layer throw
  LINEAGE_MISSING: 'LINEAGE_MISSING',       // the lineage-less node — the O28.4 duality
} as const;

export interface GraphStats {
  nodes: number;
  edges: number;
  chunked: boolean;
  checkerPresent: boolean;
}

export interface CallSiteInfo {
  callerFile: string;
  callerLine: number;
  calleeName: string;
}

export interface ChainStep {
  nodeId: string;
  name: string;
  file: string;
  line: number;
  depth: number;
}

export interface DeadNode {
  nodeId: string;
  name: string;
  file: string;
  line: number;
}

// THE NAMED CONSTANTS (the ISE magic-ladder discipline — the thresholds are
// named members with the BECAUSE anchors, never a bare ladder):
export const CHAIN_MAX_DEPTH = 64;   // the bounded BFS (BECAUSE §3.6.4 — the deepest real chain < 40 hops)

/**
 * THE PARAGON GRAPH — the audit's memory (the shared.db live).
 * THE CONNECTION: <target>/.trident/knowledge-graph/shared.db — the C18.4
 * schema + the PRAGMAS (WAL/NORMAL/busy_timeout/foreign_keys/user_version)
 * handled by the shared openStore.
 */
export class AuditGraph {
  private db: DbClient | null = null;
  private readonly target: string;
  private readonly dbPath: string;

  constructor(target: string) {
    this.target = target;
    this.dbPath = path.join(target, '.trident', 'knowledge-graph', 'shared.db');
  }

  /** THE LIVE CONNECTION — opened lazily; a failure → GRAPH_DB_FAILED (loud). */
  connect(): DbClient {
    if (this.db) return this.db;
    try {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      this.db = openStore(this.dbPath);
      return this.db;
    } catch (e: unknown) {
      tridentLog('ERROR', 'audit-graph', `GRAPH_DB_FAILED: ${e instanceof Error ? e.message : String(e)}`);
      throw new Error(`${GRAPH_ERRORS.GRAPH_DB_FAILED}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** THE GRAPH BUILD — the W1 constructs → the nodes/edges (the lineage dual) → the per-run rebuild. */
  build(constructs: CodeConstruct[], callGraph: { totalCallSites: number; entries: Map<string, { calleeName: string; calleeFile: string; calleeLine: number; callSites: { callSiteFile: string; callSiteLine: number }[] }> }): GraphStats {
    const db = this.connect();

    // THE NODE MATERIALIZATION (the CODE_DERIVED nodes from the constructs)
    const nodes: GraphNode[] = [];
    const nodeIdSet = new Set<string>();
    for (const c of constructs) {
      const relFile = path.relative(this.target, c.filePath);
      const id = `${constructKind(c.type)}:${c.name || '<anon>'}:${relFile}:${c.line}`;
      if (nodeIdSet.has(id)) continue;
      nodeIdSet.add(id);
      nodes.push({
        id,
        kind: constructKind(c.type),
        name: c.name || '<anon>',
        file: relFile,
        line: c.line,
        lineage: 'CODE_DERIVED',              // the O28.4 duality — the CODE source
        source: 'ast',
        data: { type: c.type, async: c.isAsync, exported: c.modifiers.includes('export') },
      });
    }

    // THE EDGE MATERIALIZATION (the calls edges — the dangling-edge filter)
    const edges: GraphEdge[] = [];
    for (const [, entry] of callGraph.entries) {
      const relCalleeFile = path.relative(this.target, entry.calleeFile || this.target);
      const targetId = `${'function'}:${entry.calleeName}:${relCalleeFile}:${entry.calleeLine}`;
      for (const site of entry.callSites) {
        const relCallerFile = path.relative(this.target, site.callSiteFile);
        const sourceId = `${'function'}:${entry.calleeName}:${relCallerFile}:${site.callSiteLine}`;
        // THE DANGLING-EDGE FILTER (the W10 BUG-4 fix): only the endpoint-present edges
        if (nodeIdSet.has(sourceId) && nodeIdSet.has(targetId)) {
          edges.push({
            sourceId,
            targetId,
            kind: 'calls',
            lineage: 'CODE_DERIVED',
          });
        }
      }
    }

    // THE PER-RUN REBUILD (the W10 BUG-2 fix — the graph is a per-run SNAPSHOT)
    writeGraph(db, nodes, edges);

    tridentLog('INFO', 'audit-graph', `GRAPH_BUILT: ${nodes.length} nodes / ${edges.length} edges`);
    return { nodes: nodes.length, edges: edges.length, chunked: false, checkerPresent: true };
  }

  /** THE WHO-CALLS VERB — the caller chains for a symbol. */
  whoCalls(symbol: string): CallSiteInfo[] {
    const db = this.connect();
    try {
      const nodesStmt = db.prepare('SELECT id, name, file, line FROM graph_nodes WHERE name = ?');
      const edgesStmt = db.prepare('SELECT source_id FROM graph_edges WHERE target_id = ? AND kind = ?');
      const nodeStmt = db.prepare('SELECT name, file, line FROM graph_nodes WHERE id = ?');
      const nodes = nodesStmt.all(symbol) as Array<{ id: string; name: string; file: string; line: number }>;
      const result: CallSiteInfo[] = [];
      for (const node of nodes) {
        const edges = edgesStmt.all(node.id, 'calls') as Array<{ source_id: string }>;
        for (const edge of edges) {
          const caller = nodeStmt.all(edge.source_id) as Array<{ name: string; file: string; line: number }>;
          if (caller.length > 0) {
            result.push({ callerFile: caller[0].file, callerLine: caller[0].line, calleeName: symbol });
          }
        }
      }
      return result;
    } catch (e: unknown) {
      tridentLog('WARN', 'audit-graph', `whoCalls failed for ${symbol}: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }

  /** THE CHAIN VERB — the bounded BFS (MAX_DEPTH 64). */
  chain(symbol: string, maxDepth: number = CHAIN_MAX_DEPTH): ChainStep[] {
    const db = this.connect();
    const steps: ChainStep[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [];
    try {
      const startStmt = db.prepare('SELECT id, name, file, line FROM graph_nodes WHERE name = ?');
      const nodeStmt = db.prepare('SELECT name, file, line FROM graph_nodes WHERE id = ?');
      const edgeStmt = db.prepare('SELECT target_id FROM graph_edges WHERE source_id = ? AND kind = ?');
      const startNodes = startStmt.all(symbol) as Array<{ id: string; name: string; file: string; line: number }>;
      for (const n of startNodes) queue.push({ id: n.id, depth: 0 });
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.depth > maxDepth || visited.has(current.id)) continue;
        visited.add(current.id);
        const node = nodeStmt.all(current.id) as Array<{ name: string; file: string; line: number }>;
        if (node.length > 0) {
          steps.push({ nodeId: current.id, name: node[0].name, file: node[0].file, line: node[0].line, depth: current.depth });
        }
        const edges = edgeStmt.all(current.id, 'calls') as Array<{ target_id: string }>;
        for (const edge of edges) queue.push({ id: edge.target_id, depth: current.depth + 1 });
      }
      return steps;
    } catch (e: unknown) {
      tridentLog('WARN', 'audit-graph', `chain failed for ${symbol}: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }

  /** THE UNWIRED VERB — the 0-inbound-caller exports (the dead-export class). */
  unwired(): DeadNode[] {
    const db = this.connect();
    const dead: DeadNode[] = [];
    try {
      const nodeStmt = db.prepare('SELECT id, name, file, line FROM graph_nodes WHERE kind = ? OR kind = ?');
      const countStmt = db.prepare('SELECT COUNT(*) as c FROM graph_edges WHERE target_id = ? AND kind = ?');
      const nodes = nodeStmt.all('function', 'export') as Array<{ id: string; name: string; file: string; line: number }>;
      for (const node of nodes) {
        const inbound = countStmt.all(node.id, 'calls') as Array<{ c: number }>;
        if (inbound.length === 0 || inbound[0].c === 0) {
          dead.push({ nodeId: node.id, name: node.name, file: node.file, line: node.line });
        }
      }
      return dead;
    } catch (e: unknown) {
      tridentLog('WARN', 'audit-graph', `unwired failed: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }

  /** THE TRIAD-GATED LEDGER APPEND — a finding without the evidence → FINDING_NO_TRIPLET. */
  appendFinding(finding: AuditFinding, runId: string): void {
    if (!finding.evidence || finding.evidence.length < 1) {
      throw new Error(`${GRAPH_ERRORS.FINDING_NO_TRIPLET}: the finding at ${finding.file}:${finding.line} has no evidence — the no-triplet-no-finding law`);
    }
    const db = this.connect();
    const input: FindingInput = {
      ruleId: finding.category || finding.layer,
      severity: mapSeverity(finding.severity),
      file: finding.file,
      line: finding.line,
      rangeStart: 0,
      rangeEnd: 0,
      evidence: finding.evidence,
      verdict: 'VIOLATION',
      triad: finding.triad,
    };
    appendFinding(db, input, runId);
  }

  /** THE AUDIT-DONE EVENT — the run's lifecycle row. */
  appendEvent(kind: 'AUDIT_DONE' | 'HUNT_DONE', payload: Record<string, unknown>): void {
    const db = this.connect();
    try {
      db.appendEvent(kind, payload);
    } catch (e: unknown) {
      tridentLog('WARN', 'audit-graph', `appendEvent failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** THE NODE COUNT — the graph stats for the audit result. */
  nodeCount(): number {
    try {
      const db = this.connect();
      const rows = db.prepare('SELECT COUNT(*) as c FROM graph_nodes').all() as Array<{ c: number }>;
      return rows.length > 0 ? rows[0].c : 0;
    } catch {
      return 0;
    }
  }
}

function constructKind(type: ConstructType): string {
  switch (type) {
    case ConstructType.FUNCTION_DECLARATION:
    case ConstructType.ARROW_FUNCTION:
    case ConstructType.METHOD_DECLARATION: return 'function';
    case ConstructType.CLASS_DECLARATION: return 'class';
    case ConstructType.INTERFACE_DECLARATION: return 'interface';
    case ConstructType.EXPORT_DECLARATION:
    case ConstructType.RE_EXPORT: return 'export';
    default: return 'module';
  }
}

/** THE SEVERITY MAP — the audit's CRITICAL/HIGH/MEDIUM/LOW → the shared db's CRIT/HIGH/MED/WARN. */
function mapSeverity(severity: string): 'CRIT' | 'HIGH' | 'MED' | 'WARN' {
  switch (severity) {
    case 'CRITICAL': return 'CRIT';
    case 'HIGH': return 'HIGH';
    case 'MEDIUM': return 'MED';
    default: return 'WARN';
  }
}
