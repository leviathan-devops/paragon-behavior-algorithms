// src/subagents/trident-bug-hunter/graph/likec4-drift.ts
// THE R17 DRIFT DETECTION (spec substrate row 300 — "the 3 C4 diagrams + the
// drift detection"). The DECLARED architecture (the committed .c4 files — the
// intended model the likec4 LSP compiles) vs the ACTUAL architecture (the live
// shared.db graph_edges). Every divergence is a drift row + the drift alarm.
//
// THE SAME CONSISTENCY LANGUAGE (spec §3.12, surface/query-tool.ts): the 7-verb
// `verb=consistency` compares SPEC_DERIVED vs CODE_DERIVED and emits the
// `declared-stage-unwired` drift alarm. This module REUSES that verb (the node
// drift rides `nodeDrift`) and ADDS the edge-level comparison (the declared
// .c4 relationships vs the graph_edges) — so the visualization layer and the
// audit layer answer the SAME comparison and never contradict each other. The
// consistency comparison is NEVER duplicated (spec §3.12 — one source).
//
// THE BOTH-DIRECTIONS RULE: a declared edge missing in the graph (the intended
// model lost a wiring) AND a graph edge missing in the declaration (the code
// grew a wiring the model never declared) are BOTH drift rows — the loud-fail
// honesty: neither direction is hidden.
//
// THE DRIFT ALARM (C10 — the structured signal, never a prose guess): the
// report carries `drift: boolean` + the per-row kind/direction/severity — the
// marked JSON field the tests assert.
//
// THE FILING CHANNEL: the drift rows land in the shared-db `audits` table (the
// audit-log channel — run_id + actor 'likec4-bridge' + event 'R17_DRIFT' + the
// JSON triplet) AND the drift report JSON artifact at the report's diagram
// paths. NOTE (the honest divergence from the "events table" channel): the
// events table's kind canon is FROZEN to HUNT_DONE|BUILD_DONE|AUDIT_DONE
// (db.ts appendEvent throws EVENT_INVALID on a new kind — the C18.4 schema,
// user_version 184) — a new drift kind would BREAK the canon, so the drift
// files in the audits table + the artifact, never the events table.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DbClient } from '../../../shared/knowledge-graph/db.ts';
import { runQuery } from '../surface/query-tool.ts';

/** One declared relationship extracted from the committed .c4 files. */
export interface DeclaredEdge {
  from: string;    // the graph node id (resolved through the id-map)
  to: string;
  label: string;   // the DSL relationship label (the edge kind)
  anchor: string;  // the .c4 file:line provenance
}

export type R17DriftDirection = 'declared-not-in-graph' | 'graph-not-in-declared';

/** One drift row — the pair + the direction + the severity (the C10 contract). */
export interface R17DriftRow {
  kind: 'declared-edge-missing' | 'undeclared-edge-drift';
  direction: R17DriftDirection;
  from: string;
  to: string;
  label: string;
  anchor: string;
  severity: 'HIGH' | 'MED';
}

/** The R17 drift report — the structured alarm (drift: boolean + the rows). */
export interface R17DriftReport {
  drift: boolean;
  count: number;
  declaredEdges: number;
  actualEdges: number;
  declaredStageDrift: number;   // the query-tool consistency verb's row count (reused, never duplicated)
  rows: R17DriftRow[];
  nodeDrift: Array<Record<string, unknown>>;   // the consistency verb's rows (the SAME comparison)
}

/** The relationship-line detector — the `a -> b 'label'` DSL form (the vendor
 *  grammar: single quotes; the legacy double-quote form is accepted for the
 *  hand-edited files). The regex is the mechanical DETECTOR only (the ISE law);
 *  the decision (declared-vs-actual diff) is the comparison below, never a
 *  regex verdict. */
const EDGE_RE = /^([^\s]+)\s*->\s*([^\s]+)(?:\s+["']([^"']*)["'])?\s*$/;

/** Parse the declared `->` relationships from the committed .c4 files. The
 *  views block + the header comments never contain a relationship. */
export function parseDeclaredEdges(
  files: Array<{ file: string; content: string }>,
  idMap: Record<string, string>,
): DeclaredEdge[] {
  const edges: DeclaredEdge[] = [];
  for (const f of files) {
    const lines = f.content.split('\n');
    let inViews = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('views')) { inViews = true; continue; }
      if (inViews || line.startsWith('//')) continue;
      const m = line.match(EDGE_RE);
      if (!m) continue;
      edges.push({
        from: idMap[m[1]] ?? m[1],   // the sanitized id → the graph id (the hand-edited case falls through)
        to: idMap[m[2]] ?? m[2],
        label: m[3] ?? '',
        anchor: `${f.file}:${i + 1}`,
      });
    }
  }
  return edges;
}

/** THE R17 DRIFT — the declared (.c4) vs the actual (graph_edges) + the
 *  consistency verb's node drift. Both directions are drift rows. */
export async function detectR17Drift(db: DbClient, c4Dir: string): Promise<R17DriftReport> {
  let declared: DeclaredEdge[] = [];
  try {
    const names = await readdir(c4Dir);
    const c4Names = names.filter(n => n.endsWith('.c4'));
    const idMap: Record<string, string> = {};
    if (names.includes('c4-id-map.json')) {
      Object.assign(idMap, JSON.parse(await readFile(join(c4Dir, 'c4-id-map.json'), 'utf-8')));
    }
    const files: Array<{ file: string; content: string }> = [];
    for (const n of c4Names) {
      files.push({ file: join(c4Dir, n), content: await readFile(join(c4Dir, n), 'utf-8') });
    }
    declared = parseDeclaredEdges(files, idMap);
  } catch (e: unknown) {
    console.warn(`[likec4-drift] c4 model read failed — the honest zero-declared: ${e instanceof Error ? e.message : String(e)}`);
    declared = [];   // the committed model absent → the honest zero-declared (the drift is then the graph's own surplus)
  }

  const actual = rowsAs<{ source_id: string; target_id: string; kind: string }>(db.prepare('SELECT source_id, target_id, kind FROM graph_edges').all(), 'drift edges');

  const declaredPairs = new Set(declared.map(d => `${d.from}->${d.to}`));
  const actualPairs = new Set(actual.map(e => `${e.source_id}->${e.target_id}`));

  const rows: R17DriftRow[] = [];
  for (const d of declared) {
    if (!actualPairs.has(`${d.from}->${d.to}`)) {
      rows.push({
        kind: 'declared-edge-missing',
        direction: 'declared-not-in-graph',
        from: d.from, to: d.to, label: d.label,
        anchor: d.anchor,
        severity: 'HIGH',
      });
    }
  }
  for (const e of actual) {
    if (!declaredPairs.has(`${e.source_id}->${e.target_id}`)) {
      rows.push({
        kind: 'undeclared-edge-drift',
        direction: 'graph-not-in-declared',
        from: e.source_id, to: e.target_id, label: e.kind,
        anchor: `graph_edges:${e.source_id}->${e.target_id}`,
        severity: 'MED',
      });
    }
  }

  const nodeDrift = runQuery({ verb: 'consistency' }, db);   // the REUSED 7-verb comparison (§3.12)
  return {
    drift: rows.length > 0 || nodeDrift.length > 0,
    count: rows.length + nodeDrift.length,
    declaredEdges: declared.length,
    actualEdges: actual.length,
    declaredStageDrift: nodeDrift.length,
    rows,
    nodeDrift,
  };
}

/** File the drift rows in the shared-db audits table (the audit-log channel —
 *  the events canon is frozen, so the drift files here + the JSON artifact). */
export function fileDriftReport(db: DbClient, runId: string, report: R17DriftReport): void {
  db.prepare(
    'INSERT INTO audits (run_id, actor, event, triplet, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(runId, 'likec4-bridge', 'R17_DRIFT', JSON.stringify(report), Date.now());
}


/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.all()` result (an unknown array)
 *  is Array.isArray-checked before the typed row assertion. */
function rowsAs<T>(rows: unknown, label: string): T[] {
  if (Array.isArray(rows)) {
    return rows as T[];
  }
  throw new Error(`[likec4-drift] ${label} expected an array of rows, got ${typeof rows}`);
}
