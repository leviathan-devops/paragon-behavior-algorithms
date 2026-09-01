// src/subagents/trident-bug-hunter/harness/map.ts
// THE MAP ACTOR (W7, spec §2.7:320 — "MAP (the adapter's corbell graph build →
// graph.db)") + B5 SRO REWIRE (PLAN B §2.7): MAP = build + hybrid extract
// (mechanical + semantic + merge + resolve) + typed-store. The machine skeleton
// (IDLE→RECON→MAP→SCAN→TRACE→STRIKE→REPORT→DONE|INCONCLUSIVE) is FROZEN — only
// MAP internals swap to the SRO pipeline. The legacy writeGraph + mirror stay
// (compat); the typed population is ADDITIVE and additive-only (MC-B-09 zero
// broken windows). Every edge carries evidence_quote NOT NULL (MC-B-02).

import path from 'node:path';
import fs from 'node:fs';
import * as tsImport from 'typescript';
const ts: typeof tsImport = (tsImport as unknown as { default?: typeof tsImport }).default ?? tsImport;
import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import type { DbClient } from '../../../shared/knowledge-graph/db.ts';
import { openStore, writeGraph, mirrorToMasterContext } from '../../../shared/knowledge-graph/db.ts';
import { selectAdapter, type GraphAdapter, type BuildResult } from '../graph/interface.ts';
import { extractMechanical, type TypedTriple } from '../graph/extraction/mechanical.ts';
import { mergePasses } from '../graph/extraction/merge.ts';
import { resolveEntities, type NewEntity, type ExistingCanonical } from '../graph/extraction/resolver.ts';
import { isNodeType, isPredicate } from '../../../shared/knowledge-graph/ontology.ts';

/** The MAP actor's output — the built graph surface the scan state consumes. */
export interface MapResult {
  adapter: GraphAdapter;
  buildResult: BuildResult;
  db: DbClient;
  dbPath: string;
  mirrorPath: string;
}

/** Infer the NodeType for a canonical_id produced by mechanical extraction. */
function inferKind(canonical: string): string {
  const prefix = canonical.split(':')[0] ?? '';
  if (isNodeType(prefix)) return prefix;
  if (canonical.startsWith('file:')) return 'File';
  if (canonical.startsWith('class:')) return 'Class';
  if (canonical.startsWith('fn:')) return 'Function';
  if (canonical.startsWith('method:')) return 'Function';
  if (canonical.startsWith('interface:')) return 'Interface';
  if (canonical.startsWith('module:')) return 'Module';
  return 'Function';
}

function labelOf(canonical: string): string {
  const idx = canonical.indexOf(':');
  if (idx === -1) return canonical;
  return canonical.slice(idx + 1);
}

/** Populate the typed graph tables from the hybrid extraction (B2 pipeline).
 *  Error paths FIRST: any failure logs + returns gracefully — the legacy graph
 *  (writeGraph) is the source of truth, the typed graph is additive. No empty
 *  catches, no success-without-side-effect. */
async function populateTypedGraph(db: DbClient, runId: string, root: string): Promise<void> {
  let program: tsImport.Program | null = null;
  try {
    const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
    if (!configPath) {
      console.warn(`[map:typed] no tsconfig under ${root} — typed population skipped (mechanical needs tsconfig)`);
      return;
    }
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) {
      console.warn(`[map:typed] tsconfig read failed at ${configPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')} — typed population skipped`);
      return;
    }
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
    if (!parsed.fileNames || parsed.fileNames.length === 0) {
      console.warn(`[map:typed] tsconfig ${configPath} has no fileNames — typed population skipped`);
      return;
    }
    program = ts.createProgram(parsed.fileNames, parsed.options);
  } catch (e: unknown) {
    console.warn(`[map:typed] program creation failed: ${e instanceof Error ? e.message : String(e)} — typed population skipped`);
    return;
  }

  let mechanical: TypedTriple[] = [];
  try {
    mechanical = extractMechanical(program as unknown as tsImport.Program, { root });
  } catch (e: unknown) {
    console.warn(`[map:typed] extractMechanical failed: ${e instanceof Error ? e.message : String(e)} — typed population skipped`);
    return;
  }

  if (mechanical.length === 0) {
    console.warn(`[map:typed] mechanical produced 0 triples — typed population completes with 0 edges (empty source is valid)`);
  }

  // Semantic pass: in the B5 MAP context without an LLM harness, semantic is empty.
  // The merge law still anchors: Pass A exactness + semantic empty => mechanical only.
  const semantic: TypedTriple[] = [];

  let merged: ReturnType<typeof mergePasses>;
  try {
    merged = mergePasses(mechanical as unknown as TypedTriple[], semantic as unknown as TypedTriple[]);
  } catch (e: unknown) {
    console.warn(`[map:typed] mergePasses failed: ${e instanceof Error ? e.message : String(e)} — typed population skipped`);
    return;
  }

  if (merged.length === 0) {
    // No triples to store — still success (empty typed graph is valid for empty source)
    return;
  }

  // Build NewEntity set from distinct subject/object canonicals
  const distinctIds = new Set<string>();
  for (const t of merged) {
    distinctIds.add(t.subject);
    distinctIds.add(t.object);
  }
  const newEntities: NewEntity[] = [];
  for (const id of distinctIds) {
    const kind = inferKind(id);
    const label = labelOf(id) || id;
    // find representative file/line from merged triples where this id appears
    const rep = merged.find((x) => x.subject === id || x.object === id);
    newEntities.push({
      id,
      label,
      kind,
      file: rep?.file ?? null,
      line: rep?.line ?? null,
    });
  }

  // Load existing canonicals for resolution
  let existing: ExistingCanonical[] = [];
  try {
    const rows = db.prepare('SELECT canonical_id, label, kind FROM typed_nodes WHERE superseded_run IS NULL').all() as Array<{ canonical_id: string; label: string; kind: string }>;
    existing = rows.map((r) => ({ canonical_id: r.canonical_id, label: r.label, kind: r.kind }));
  } catch (e: unknown) {
    console.warn(`[map:typed] typed_nodes read failed: ${e instanceof Error ? e.message : String(e)} — resolution proceeds with empty existing set`);
    existing = [];
  }

  // Resolve BEFORE insertion (MC-B-03 pre-insertion law)
  try {
    await resolveEntities(newEntities, existing, null, { db: db as unknown as never, runId });
  } catch (e: unknown) {
    console.warn(`[map:typed] resolveEntities failed: ${e instanceof Error ? e.message : String(e)} — continuing to node upsert (resolution is advisory)`);
    // Do not abort — resolution failure does not block typed insertion
  }

  // Upsert typed_nodes (INSERT OR IGNORE — additive, no delete)
  let nodesInserted = 0;
  for (const ne of newEntities) {
    const kind = isNodeType(ne.kind) ? ne.kind : inferKind(ne.id);
    const label = ne.label || labelOf(ne.id);
    try {
      const res = db.prepare('INSERT OR IGNORE INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?,?,?,?,?,?,NULL)').run(ne.id, kind, label, ne.file ?? null, ne.line ?? null, runId);
      const ch = (res as unknown as { changes: number }).changes ?? 0;
      nodesInserted += ch;
    } catch (e: unknown) {
      console.warn(`[map:typed] typed_nodes insert failed for ${ne.id}: ${e instanceof Error ? e.message : String(e)}`);
      // continue — one bad node must not poison the rest
    }
  }

  // Insert typed_edges (each merged triple becomes an edge)
  let edgesInserted = 0;
  for (const t of merged) {
    if (!isPredicate(t.predicate)) {
      console.warn(`[map:typed] predicate ${String(t.predicate)} not in ontology — edge skipped (${t.subject} -> ${t.object})`);
      continue;
    }
    const evidence = (t.evidence ?? '').trim().slice(0, 500);
    if (!evidence || evidence.length === 0) {
      console.warn(`[map:typed] evidence empty for ${t.subject} -[${t.predicate}]-> ${t.object} — edge skipped (MC-B-02)`);
      continue;
    }
    try {
      const res = db.prepare('INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?,?,?,?,?,?,NULL)').run(t.subject, t.object, t.predicate, evidence, t.confidence ?? 1.0, runId);
      const ch = (res as unknown as { changes: number }).changes ?? 0;
      edgesInserted += ch;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // CHECK constraint failure for unknown predicate or empty evidence is expected to be caught earlier, but handle loudly
      if (msg.includes('CHECK') || msg.includes('constraint')) {
        console.warn(`[map:typed] typed_edges CHECK failed for ${t.subject} -[${t.predicate}]-> ${t.object}: ${msg}`);
      } else {
        console.warn(`[map:typed] typed_edges insert failed for ${t.subject} -[${t.predicate}]-> ${t.object}: ${msg}`);
      }
    }
  }

  console.warn(`[map:typed] typed population done runId=${runId} nodesInserted=${nodesInserted} edgesInserted=${edgesInserted} merged=${merged.length} mechanical=${mechanical.length}`);
}

/** THE MAP ACTOR — build + persist + typed-populate + mirror. Throws ADAPTER_FAILED /
 *  GRAPH_EMPTY / MIRROR_WRITE_FAILED — the micro-loop's onError routes the
 *  fail-state INCONCLUSIVE (O3.5). */
export async function map(profile: ProjectProfile, adapterOverride?: GraphAdapter): Promise<MapResult> {
  const adapter = adapterOverride ?? selectAdapter(profile);
  const buildResult = await adapter.build(profile);
  const dbPath = path.join(profile.project.root, '.trident', 'knowledge-graph', 'shared.db');
  const db: DbClient = openStore(dbPath);
  const runId = `map-${Date.now()}-${profile.project.name.replace(/[^a-z0-9]/gi, '')}`;

  try {
    writeGraph(db, buildResult.nodes, buildResult.edges);

    // B5 SRO populate — additive, never replaces legacy graph. Failures are logged, never thrown.
    try {
      await populateTypedGraph(db, runId, path.resolve(profile.project.root));
    } catch (e: unknown) {
      console.warn(`[map] populateTypedGraph unexpected throw: ${e instanceof Error ? e.message : String(e)}`);
    }

    const mirrorPath = mirrorToMasterContext(db, profile);
    return { adapter, buildResult, db, dbPath, mirrorPath };
  } catch (e: unknown) {
    try { db.close(); } catch {}
    throw e;
  }
}
