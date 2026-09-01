// src/subagents/trident-bug-hunter/graph/likec4-dsl.ts
// THE C4 DSL GENERATION (the v4.4.4 Layer 6, spec substrate row 300 — the
// likec4-bridge). The machine's flat graph → the 3 likec4 DSL diagrams
// (system/container/component) in the .c4 language the Langium LSP compiles.
//
// THE RENDERING DOCTRINE (spec:2233/2502/3027 — quoted): "generated artifacts
// from the graph, not a data-model peer — they are renderings". The shared.db
// graph_nodes/graph_edges are the SOURCE OF TRUTH; the .c4 files are a
// PROJECTION — never registered into the query surface, never written back into
// the graph store. The likec4 LSP compiles the HAND-WRITTEN DSL (the intended
// model); it does NOT parse code (row 300). This module EMITS the DSL; the LSP
// compilation is the container-level verification (the likec4 CLI is NOT in the
// repo venv — the ZERO-ADD law, no new dependency; the binary-absence is
// honored, never a phantom wiring).
//
// THE PROJECTION (the flat table → the 3 C4 levels — a documented rendering
// decision):
//   - system elements:    kind 'stage' | 'module'
//   - container elements: kind 'class' | 'function' | 'method'
//   - component elements: kind 'file' | 'rule'
//   - the edges partition by level (each edge appears in EXACTLY ONE level so
//     the fresh generation is drift-clean by construction — the declared edge
//     set == the graph edge set, the R17 match scenario):
//       1. either endpoint is a component-kind node  → the component level
//       2. else either endpoint is a container-kind node → the container level
//       3. else → the system level
//   - an edge's EXTERNAL endpoint (a node outside the level's own kinds) is
//     declared as a top-level element in that level's model so every `->`
//     reference resolves (valid likec4 — never a dangling id).
//
// THE ID MAPPING: the graph ids ('fn:buildZoneMap') are not valid likec4
// identifiers (the ':' '/'), so they are SANITIZED (`fn_buildZoneMap`) and the
// bijection rides a companion manifest `c4-id-map.json` (a generated artifact
// alongside the .c4 files) — the R17 drift parser (graph/likec4-drift.ts)
// resolves the declared ids back to the graph ids through it.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DbClient } from '../../../shared/knowledge-graph/db.ts';

export const C4_LEVELS = ['system', 'container', 'component'] as const;
export type C4Level = (typeof C4_LEVELS)[number];

/** The C4 level of each graph node kind — the projection's first half. */
const KIND_TO_LEVEL: Record<string, C4Level> = {
  stage: 'system', module: 'system',
  class: 'container', function: 'container', method: 'container',
  file: 'component', rule: 'component',
};

/** One projected element (the node at a C4 level). */
export interface C4Node {
  id: string;          // the sanitized DSL id
  name: string;        // the display name (the graph node name)
  originalId: string;  // the graph node id
  kind: string;        // the graph node kind
}

/** One projected relationship (the edge at a C4 level). */
export interface C4Edge {
  from: string;        // the sanitized endpoint ids
  to: string;
  label: string;       // the edge kind (imports/calls/awaits/wires/...)
}

export interface C4LevelProjection {
  nodes: C4Node[];
  edges: C4Edge[];
}

/** The full projection — the 3 levels + the sanitized→original id map. */
export interface C4Projection {
  levels: Record<C4Level, C4LevelProjection>;
  idMap: Record<string, string>;   // sanitized → original graph node id
}

/** The graph rows the projection consumes (a structural subset of the tables). */
export interface GraphRowInput {
  id: string;
  kind: string;
  name: string;
}
export interface GraphEdgeRowInput {
  sourceId: string;
  targetId: string;
  kind: string;
}

/** Sanitize a graph id into a valid likec4 identifier (the ':'/'/' → '_'). */
export function sanitizeC4Id(id: string): string {
  const s = id.replace(/[^A-Za-z0-9_]/g, '_');
  return s.length === 0 ? 'node' : s;
}

/** The projection's second half — each edge lands in EXACTLY ONE level. */
function edgeLevel(fromKind: string, toKind: string): C4Level {
  const fl = KIND_TO_LEVEL[fromKind] ?? 'component';
  const tl = KIND_TO_LEVEL[toKind] ?? 'component';
  if (fl === 'component' || tl === 'component') return 'component';
  if (fl === 'container' || tl === 'container') return 'container';
  return 'system';
}

/** Project the flat graph onto the 3 C4 levels (the rendering doctrine). */
export function projectGraph(nodes: GraphRowInput[], edges: GraphEdgeRowInput[]): C4Projection {
  const levels: Record<C4Level, C4LevelProjection> = {
    system: { nodes: [], edges: [] },
    container: { nodes: [], edges: [] },
    component: { nodes: [], edges: [] },
  };
  const idMap: Record<string, string> = {};
  const byId = new Map<string, { kind: string }>();
  for (const n of nodes) {
    byId.set(n.id, { kind: n.kind });
    const level = KIND_TO_LEVEL[n.kind] ?? 'component';
    const sid = sanitizeC4Id(n.id);
    idMap[sid] = n.id;
    levels[level].nodes.push({ id: sid, name: n.name, originalId: n.id, kind: n.kind });
  }
  for (const e of edges) {
    const from = byId.get(e.sourceId);
    const to = byId.get(e.targetId);
    if (!from || !to) continue;   // a dangling edge is never projected (the graph's own invariant)
    const level = edgeLevel(from.kind, to.kind);
    levels[level].edges.push({
      from: sanitizeC4Id(e.sourceId),
      to: sanitizeC4Id(e.targetId),
      label: e.kind,
    });
  }
  return { levels, idMap };
}

// ---------------------------------------------------------------------------
// THE GENERATED-ARTIFACT HEADER (the rendering doctrine — spec:2233/2502/3027)
// ---------------------------------------------------------------------------

const GENERATED_HEADER = [
  '// GENERATED ARTIFACT — a rendering of the shared.db graph, NEVER a data-model',
  '// peer (spec:2233/2502/3027 — "generated artifacts from the graph, not a data-',
  '// model peer — they are renderings"). The graph_nodes/graph_edges are the',
  '// SOURCE OF TRUTH; this .c4 file is a projection. Generated by the likec4-',
  '// bridge (graph/likec4-bridge.ts), the v4.4.4 Layer 6 (spec row 300).',
  '// Hand-editable — the INTENDED model the likec4 LSP (Langium) compiles; the',
  '// R17 drift (graph/likec4-drift.ts) diffs THIS declared model against the',
  '// live graph_edges. The id mapping rides c4-id-map.json.',
].join('\n');

// ---------------------------------------------------------------------------
// THE DSL EMISSION (the .c4 language — specification + model + views)
//
// THE VENDOR-GRAMMAR CORRECTION (2026-08-13 — the deep-container test caught it:
// the generated .c4 FAILED the vendor CLI's Langium compile with named errors:
// "Duplicate element kind 'system'/'container'/'component'" + "Could not resolve
// reference to Element named 'index'" + the OpenBlock/CloseBlock token errors).
// THE ROOT CAUSES, per the vendor's official docs (likec4.dev/dsl):
//   (1) system/container/component are BUILT-IN kinds — the `specification`
//       block re-declaring them IS the duplicate; the specification block is for
//       CUSTOM kinds only (actor/service/etc.). The machine uses ONLY built-ins →
//       the specification block is REMOVED.
//   (2) the element syntax is `<id> = <kind> '<Title>'` — the `=` assignment +
//       single quotes (the docs' "also possible with '=' and the name goes first:
//       cloud = service"). The old `system machine "The Machine"` form (no =,
//       double quotes) tripped the tokenizer.
//   (3) `view of <element-id>` — the view references the DECLARED element id
//       (the system id), NEVER a literal 'index' (the 'index' name does not
//       exist in the model — the "Could not resolve reference" error).
// THE EMISSION now follows the vendor grammar exactly.
// ---------------------------------------------------------------------------

/** THE VENDOR-VERIFIED SPECIFICATION — the element kinds MUST be declared in
 *  the specification block (the likec4 CLI 0.40.0's Langium: "Could not resolve
 *  reference to ElementKind named 'system'" when absent — verified in the
 *  container 2026-08-13). CRITICAL: the likec4 docs say "All sources are merged
 *  into a single model" — the specification block must appear in EXACTLY ONE
 *  file, else the merged model carries DUPLICATE kind declarations (the
 *  "Duplicate element kind 'system'" Langium error, also verified in the
 *  container). THE EMISSION: the specification rides the system.c4 file ONLY;
 *  the container/component files carry model + views without it. */
const SPECIFICATION = [
  'specification {',
  '  element system',
  '  element container',
  '  element component',
  '}',
].join('\n');

/** The component-level model groups the components under their containers. */
function componentGroups(projection: C4Projection): Array<{ id: string; name: string; components: C4Node[] }> {
  const comp = projection.levels.component;
  const containers: Array<{ id: string; name: string; components: C4Node[] }> = projection.levels.container.nodes.map(n => ({ id: n.id, name: n.name, components: [] }));
  const containerById = new Map(containers.map(c => [c.id, c]));
  const compById = new Map(comp.nodes.map(n => [n.id, n]));
  const attached = new Set<string>();
  const attach = (compNode: C4Node, containerId: string): void => {
    if (attached.has(compNode.id)) return;
    attached.add(compNode.id);
    containerById.get(containerId)?.components.push(compNode);
  };
  for (const e of comp.edges) {
    const a = compById.get(e.from);
    const b = compById.get(e.to);
    if (a && containerById.has(e.to)) attach(a, e.to);
    else if (b && containerById.has(e.from)) attach(b, e.from);
  }
  if (containers.length === 0) {
    // no container nodes in the graph — the honest fallback container holds the
    // components so the component view has a parent (valid likec4).
    return [{ id: 'machine_components', name: 'The Machine', components: comp.nodes }];
  }
  const unattached = comp.nodes.filter(n => !attached.has(n.id));
  if (unattached.length > 0) {
    containers.push({ id: 'machine', name: 'The Machine (unattached)', components: unattached });
  }
  return containers;
}

/** Render ONE .c4 diagram file (system/container/component) from the projection.
 *  THE SPECIFICATION IN ONE FILE ONLY (2026-08-13 — the vendor-merge law): the
 *  likec4 sources MERGE into one model, so the specification block (the kind
 *  declarations) must appear in EXACTLY ONE file — the system.c4 (the first
 *  level). The container/component files carry model + views only; a second
 *  specification would duplicate the kinds in the merged model ("Duplicate
 *  element kind", verified against the CLI 0.40.0). */
export function renderC4Dsl(level: C4Level, projection: C4Projection): string {
  const { nodes, edges } = projection.levels[level];
  const L: string[] = [];
  L.push(GENERATED_HEADER);
  L.push('');
  if (level === 'system') {
    L.push(SPECIFICATION);
    L.push('');
  }
  L.push('model {');

  // THE ELEMENT ASSIGNMENT — the vendor grammar (VERIFIED against the CLI 0.40.0
  // in the container 2026-08-13): `<id> = <kind> '<Title>'` — the `=` assignment
  // + single quotes + the specification-declared kinds. The old
  // `system machine "The Machine"` form (no =, double quotes) tripped the
  // tokenizer ("Expecting token of type 'OpenBlock' but found `machine`").
  const titleOf = (n: C4Node): string => n.name && n.name !== n.id ? n.name : n.id;

  // THE EXTERNAL ENDPOINTS — every edge endpoint outside the level's own node
  // set is declared as a top-level element so each `->` reference resolves
  // (valid likec4 — never a dangling id, the vendor's "Could not resolve
  // reference" class).
  const declaredIds = new Set(nodes.map(n => n.id));
  if (level === 'component') {
    for (const g of componentGroups(projection)) declaredIds.add(g.id);
  }
  const externalIds = new Set<string>();
  for (const e of edges) {
    if (!declaredIds.has(e.from)) externalIds.add(e.from);
    if (!declaredIds.has(e.to)) externalIds.add(e.to);
  }
  for (const ext of externalIds) {
    const original = projection.idMap[ext] ?? ext;
    const kind = KIND_TO_LEVEL[original.split(':')[0]] ?? 'component';
    const kw = kind === 'system' ? 'system' : kind === 'container' ? 'container' : 'component';
    L.push(`  ${ext} = ${kw} '${ext}'`);
  }

  if (level === 'system') {
    // THE SYSTEM LEVEL: the machine wrapper (the single declaration — the merge
    // law: an id appears ONCE across all files) + the system nodes.
    L.push(`  machine = system 'The Machine'`);
    for (const n of nodes) L.push(`  ${n.id} = system '${titleOf(n)}'`);
  } else if (level === 'container') {
    // THE CONTAINER LEVEL: the container nodes TOP-LEVEL (never nested under
    // machine — the nested form re-declares machine in this file + the merged
    // model duplicates it: "Duplicate element name machine", verified against
    // the CLI 0.40.0). machine itself lives in system.c4 ONLY.
    for (const n of nodes) L.push(`  ${n.id} = container '${titleOf(n)}'`);
  } else {
    // THE COMPONENT LEVEL: the components TOP-LEVEL (the same merge law).
    const groups = componentGroups(projection);
    for (const g of groups) {
      for (const c of g.components) L.push(`  ${c.id} = component '${titleOf(c)}'`);
    }
  }

  // THE RELATIONSHIPS — the vendor grammar: `<from> -> <to> '<label>'`.
  for (const e of edges) L.push(`  ${e.from} -> ${e.to} '${e.label}'`);

  L.push('}');
  L.push('');
  L.push('views {');
  // THE VIEW ORDER (2026-08-13 — verified against the CLI 0.40.0): the `title`
  // must precede the `include` (the "Expecting token of type 'CloseBlock' but
  // found `title`" error when include comes first).
  if (level === 'system') {
    // THE VIEW REFERENCES THE DECLARED SYSTEM ID — the first system node (or the
    // machine fallback) is the view's anchor, NEVER a literal 'index'.
    const anchor = nodes.length > 0 ? nodes[0].id : 'machine';
    L.push(`  view of ${anchor} {`);
    L.push(`    title 'The machine — the system context'`);
    L.push('    include *');
    L.push('  }');
  } else if (level === 'container') {
    // THE CONTAINER VIEW: each container node's own view (the id declared in
    // this file — the top-level declaration).
    for (const n of nodes) {
      L.push(`  view of ${n.id} {`);
      L.push(`    title '${titleOf(n)} — the container view'`);
      L.push('    include *');
      L.push('  }');
    }
    if (nodes.length === 0) {
      L.push(`  view of machine {`);
      L.push(`    title 'The Machine — the container view'`);
      L.push('    include *');
      L.push('  }');
    }
  } else {
    const groups = componentGroups(projection);
    for (const g of groups) {
      for (const c of g.components) {
        L.push(`  view of ${c.id} {`);
        L.push(`    title '${titleOf(c)} — the component view'`);
        L.push('    include *');
        L.push('  }');
      }
    }
  }
  L.push('}');
  L.push('');
  return L.join('\n');
}

/** The c4-id-map.json manifest content (the sanitized→original bijection). */
export function renderC4IdMap(projection: C4Projection): string {
  return `${JSON.stringify(projection.idMap, null, 2)}\n`;
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.all()` result (an unknown array)
 *  is Array.isArray-checked before the typed row assertion. */
function rowsAs<T>(rows: unknown, label: string): T[] {
  if (Array.isArray(rows)) {
    return rows as T[];
  }
  throw new Error(`[likec4-dsl] ${label} expected an array of rows, got ${typeof rows}`);
}

/** Read the graph rows + write the 3 .c4 files + the id-map manifest. The
 *  graph is the source of truth; the files are the renderings (spec:2233). */
export async function writeC4Diagrams(
  db: DbClient,
  outputDir: string,
): Promise<{ files: string[]; projection: C4Projection }> {
  try {
    const nodeRows = rowsAs<{ id: string; kind: string; name: string }>(db.prepare('SELECT id, kind, name FROM graph_nodes').all(), 'nodeRows');
    const edgeRows = rowsAs<{ source_id: string; target_id: string; kind: string }>(db.prepare('SELECT source_id, target_id, kind FROM graph_edges').all(), 'edgeRows');
    const projection = projectGraph(
      nodeRows.map(n => ({ id: n.id, kind: n.kind, name: n.name })),
      edgeRows.map(e => ({ sourceId: e.source_id, targetId: e.target_id, kind: e.kind })),
    );
    await mkdir(outputDir, { recursive: true });
    const files: string[] = [];
    for (const level of C4_LEVELS) {
      const p = join(outputDir, `${level}.c4`);
      await writeFile(p, renderC4Dsl(level, projection), 'utf-8');
      files.push(p);
    }
    const mapPath = join(outputDir, 'c4-id-map.json');
    await writeFile(mapPath, renderC4IdMap(projection), 'utf-8');
    return { files, projection };
  } catch (e: unknown) {
    console.warn(`[likec4-dsl] writeC4Diagrams failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
