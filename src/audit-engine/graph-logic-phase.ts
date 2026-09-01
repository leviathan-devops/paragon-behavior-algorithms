import path from 'node:path';
import { tridentLog } from '../utils.js';
import { map } from '../subagents/trident-bug-hunter/harness/map.ts';
import { solveTrace } from '../subagents/trident-bug-hunter/harness/trace.ts';
import { Database } from 'bun:sqlite';
import { TYPED_GRAPH_DDL } from '../shared/knowledge-graph/migrations.js';
import type { ProjectProfile } from '../shared/knowledge-graph/profile-schema.ts';

export interface GraphLogicResult {
  graphPopulated: boolean;
  nodesCount: number;
  edgesCount: number;
  hunterFindings: number;
  durationMs: number;
  error?: string;
}

function countRows(db: Database | import('../shared/knowledge-graph/db.ts').DbClient): { nodes: number; edges: number } {
  try {
    db.exec(TYPED_GRAPH_DDL);
  } catch (e) { void (e as Error).message; }
  // The DbClient surface is .prepare() (db.ts:192) — the earlier .query() call
  // threw on every run and the catch swallowed it into a 0/0 count (the false
  // GRAPH_LOGIC_EMPTY class caught live in Wave X).
  let nodes = 0, edges = 0;
  try {
    const client = db as unknown as { prepare(sql: string): { get(...p: unknown[]): unknown } };
    const r = client.prepare('SELECT COUNT(*) as c FROM typed_nodes WHERE superseded_run IS NULL').get() as { c: number } | null;
    nodes = r?.c ?? 0;
  } catch (e) {
    tridentLog('ERROR', 'graph-logic', `typed_nodes count failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const client = db as unknown as { prepare(sql: string): { get(...p: unknown[]): unknown } };
    const r = client.prepare('SELECT COUNT(*) as c FROM typed_edges WHERE superseded_run IS NULL').get() as { c: number } | null;
    edges = r?.c ?? 0;
  } catch (e) {
    tridentLog('ERROR', 'graph-logic', `typed_edges count failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { nodes, edges };
}

export async function runGraphLogicPhase(targetPath: string, runId: string): Promise<GraphLogicResult> {
  const t0 = Date.now();
  try {
    const resolved = path.resolve(targetPath);
    // THE FULL PROFILE (the zod contract — profile-schema.ts). The previous
    // partial-object cast hid the required graph/project/pipeline sections and
    // the adapter blew up on profile.graph.substrate (Wave X live catch). The
    // substrate is corbell: the primary graph adapter — loud-fail, no fallback
    // (AP-G6). rules.corpus is min(1) per the frozen schema; the corpus feeds
    // the SCAN stage (spec anchors), not the typed populate — the audit target
    // may not ship a spec doc, so the entry names the convention path.
    const profile: ProjectProfile = {
      profileVersion: 1,
      project: {
        name: path.basename(resolved),
        root: resolved,
        languages: ['typescript'],
        entryPoints: ['src/index.ts', 'src/mod1.ts'],
        build: 'bun run build',
        test: 'bun test',
      },
      graph: {
        substrate: 'corbell',
        scope: ['src'],
        excludes: ['Checkpoints', 'node_modules', 'corbell-data', '.trident', 'dist', 'docs', 'MASTER_CONTEXT', 'Context_Management'],
        rebuild: true,
      },
      rules: {
        corpus: ['MASTER_CONTEXT/spec.md'],
        bindings: {},
      },
      pipeline: {
        stages: [{
          id: 'graph-logic',
          entry: 'runGraphLogicPhase',
          contract: 'Populate the typed graph mechanically from the target source tree; every edge carries evidence_quote (MC-B-02).',
        }],
      },
      history: { failureLogs: [] },
      awareness: { docs: [] },
    } as ProjectProfile;
    const mapResult = await map(profile);
    const db = mapResult.db;
    const { nodes, edges } = countRows(db as unknown as Database);
    if (nodes === 0 && edges === 0) {
      tridentLog('ERROR', 'graph-logic', `graph-logic populated 0 nodes/edges for ${resolved} — GRAPH_LOGIC_FAILED`);
      try { (db as unknown as Database).close(); } catch (e) { void (e as Error).message; }
      const durationMs = Date.now() - t0;
      return { graphPopulated: false, nodesCount: 0, edgesCount: 0, hunterFindings: 0, durationMs, error: 'GRAPH_LOGIC_EMPTY: typed population produced 0 nodes+edges' };
    }
    let hunterFindings = 0;
    try {
      const traceRows = await solveTrace([], mapResult.adapter);
      hunterFindings = traceRows.length;
    } catch (e) {
      tridentLog('WARN', 'graph-logic', `solveTrace probe failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    const durationMs = Date.now() - t0;
    tridentLog('INFO', 'graph-logic', `graph-logic done nodes=${nodes} edges=${edges} duration=${durationMs}ms`);
    try { (db as unknown as Database).close(); } catch (e) { void (e as Error).message; }
    return { graphPopulated: true, nodesCount: nodes, edgesCount: edges, hunterFindings, durationMs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('ERROR', 'graph-logic', `graph-logic FAILED: ${msg}`);
    const durationMs = Date.now() - t0;
    return { graphPopulated: false, nodesCount: 0, edgesCount: 0, hunterFindings: 0, durationMs, error: msg };
  }
}
