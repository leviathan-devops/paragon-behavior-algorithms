// src/subagents/trident-bug-hunter/graph/__tests__/likec4.test.ts
// THE LIKEC4 BRIDGE BATTERY (the v4.4.4 Layer 6 — spec substrate row 300 + the
// report's §2 diagram contract spec:4699). The V4.1 lie ('likec4 wired' claimed
// with zero code) is dead — every claim here is tool-result-bound: the 3 .c4
// files exist with the generated-artifact header, the mermaid/dot exports carry
// the graph's nodes + edges, the R17 drift emits the declared-vs-actual diff +
// the alarm, and the report's §2 splice embeds the exports + the ASCII fallback.
//
// The A/B scenarios: the drift MATCH (a fresh generation declares EXACTLY the
// graph's edges — clean by construction) + the drift MISMATCH (a hand-edited
// declared edge missing in the graph AND a graph edge missing in the declared
// model — both directions are drift rows). The consistency verb's node drift is
// REUSED (never duplicated — spec §3.12): the declared-stage-unwired rows ride
// `nodeDrift`.

import { describe, it, expect, afterAll } from 'bun:test';
import os from 'node:os';
import path from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { openStore, type DbClient } from '../../../../shared/knowledge-graph/db.ts';
import {
  projectGraph, sanitizeC4Id, renderC4Dsl, writeC4Diagrams, C4_LEVELS,
} from '../likec4-dsl.ts';
import { renderMermaid, renderDot, renderAscii } from '../likec4-render.ts';
import { parseDeclaredEdges, detectR17Drift } from '../likec4-drift.ts';
import { buildArchitectureDiagrams, emptyGraphDiagrams } from '../likec4-bridge.ts';
import { buildGenerationPrompt, type ArchitectureDiagrams, type ReportWriterInput } from '../../tools/report-writer.ts';

const cleaned: string[] = [];
function tmpDir(): string {
  const d = path.join(os.tmpdir(), `likec4-${Math.random().toString(36).slice(2)}`);
  cleaned.push(d);
  return d;
}

afterAll(async () => {
try {
  await Promise.allSettled(cleaned.map(d => rm(d, { recursive: true, force: true })));

} catch (e: unknown) {
  console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
  throw e;
}
});

// ---------------------------------------------------------------------------
// THE FIXTURE DBs (the graph is the source of truth — spec:2233)
// ---------------------------------------------------------------------------

/** The CLEAN fixture db: the declared stages are implemented (the consistency
 *  verb is clean) + the edges partition across the 3 levels. A fresh generation
 *  declares EXACTLY these edges — the R17 match scenario. */
function cleanDb(): DbClient {
  const db = openStore(':memory:');
  db.writeGraph(
    [
      { id: 'stage:harvest', kind: 'stage', name: 'harvest', file: null, line: null, lineage: 'SPEC_DERIVED', source: 'corpus:bible.md:10', data: { entry: 'harvestOrders' } },
      { id: 'stage:zones', kind: 'stage', name: 'zones', file: null, line: null, lineage: 'SPEC_DERIVED', source: 'corpus:bible.md:11', data: { entry: 'buildZoneMap' } },
      { id: 'fn:harvestOrders', kind: 'function', name: 'harvestOrders', file: 'src/harvest.ts', line: 17, lineage: 'CODE_DERIVED', source: 'corbell' },
      { id: 'fn:buildZoneMap', kind: 'function', name: 'buildZoneMap', file: 'src/zones.ts', line: 42, lineage: 'CODE_DERIVED', source: 'corbell' },
      { id: 'file:src/harvest.ts', kind: 'file', name: 'harvest.ts', file: 'src/harvest.ts', line: 1, lineage: 'CODE_DERIVED', source: 'corbell' },
    ],
    [
      { sourceId: 'stage:harvest', targetId: 'stage:zones', kind: 'wires', lineage: 'HYBRID' },
      { sourceId: 'fn:harvestOrders', targetId: 'fn:buildZoneMap', kind: 'calls', lineage: 'CODE_DERIVED' },
      { sourceId: 'file:src/harvest.ts', targetId: 'fn:harvestOrders', kind: 'imports', lineage: 'CODE_DERIVED' },
    ],
  );
  return db;
}

/** The DRIFT fixture db — the clean db + a declared stage with NO code
 *  implementation (stage:gate entry 'runGate') → the consistency verb fires the
 *  declared-stage-unwired node drift (the SAME language the §3.12 verb speaks).
 *  THE PER-RUN REBUILD (2026-08-13 — the writeGraph FK fix): a SECOND writeGraph
 *  call now CLEARS the graph first (the snapshot semantics), so the drift db
 *  writes the COMPLETE graph in ONE call — the cleanDb's nodes + the gate stage
 *  + the drift edge together. */
function driftDb(): DbClient {
  const db = openStore(':memory:');
  db.writeGraph(
    [
      { id: 'stage:harvest', kind: 'stage', name: 'harvest', file: null, line: null, lineage: 'SPEC_DERIVED', source: 'corpus:bible.md:10', data: { entry: 'harvestOrders' } },
      { id: 'stage:zones', kind: 'stage', name: 'zones', file: null, line: null, lineage: 'SPEC_DERIVED', source: 'corpus:bible.md:11', data: { entry: 'buildZoneMap' } },
      { id: 'stage:gate', kind: 'stage', name: 'gate', file: null, line: null, lineage: 'SPEC_DERIVED', source: 'corpus:bible.md:12', data: { entry: 'runGate' } },
      { id: 'fn:harvestOrders', kind: 'function', name: 'harvestOrders', file: 'src/harvest.ts', line: 17, lineage: 'CODE_DERIVED', source: 'corbell' },
      { id: 'fn:buildZoneMap', kind: 'function', name: 'buildZoneMap', file: 'src/zones.ts', line: 42, lineage: 'CODE_DERIVED', source: 'corbell' },
      { id: 'file:src/harvest.ts', kind: 'file', name: 'harvest.ts', file: 'src/harvest.ts', line: 1, lineage: 'CODE_DERIVED', source: 'corbell' },
    ],
    [
      { sourceId: 'stage:harvest', targetId: 'stage:zones', kind: 'wires', lineage: 'HYBRID' },
      { sourceId: 'fn:harvestOrders', targetId: 'fn:buildZoneMap', kind: 'calls', lineage: 'CODE_DERIVED' },
      { sourceId: 'file:src/harvest.ts', targetId: 'fn:harvestOrders', kind: 'imports', lineage: 'CODE_DERIVED' },
      { sourceId: 'stage:harvest', targetId: 'stage:gate', kind: 'wires', lineage: 'HYBRID' },
    ],
  );
  return db;
}

// ---------------------------------------------------------------------------
// THE C4 DSL GENERATION — the 3 .c4 files (the A/B: the C4 diagrams = 3)
// ---------------------------------------------------------------------------

describe('THE C4 DSL GENERATION (the 3 diagrams — the v4.4.4 Layer 6)', () => {
  it('writes the 3 .c4 files (system/container/component) with the generated-artifact header', async () => {
  try {
    const db = cleanDb();
    const dir = tmpDir();
    const { files, projection } = await writeC4Diagrams(db, dir);

    expect(files.length).toBe(3);
    expect(C4_LEVELS).toEqual(['system', 'container', 'component']);
    for (const level of C4_LEVELS) {
      expect(files).toContain(path.join(dir, `${level}.c4`));
      const content = await readFile(path.join(dir, `${level}.c4`), 'utf-8');
      expect(content).toContain('GENERATED ARTIFACT');
      // THE VENDOR GRAMMAR (2026-08-13 — verified against the CLI 0.40.0 in the
      // container): the specification block IS REQUIRED but appears in EXACTLY
      // ONE file (the system.c4 — the likec4 sources MERGE into one model, a
      // second specification duplicates the kinds). The container/component
      // files carry model + views only. The `id = kind 'Title'` assignment +
      // single quotes + the title-before-include view order.
      if (level === 'system') expect(content).toContain('specification {');
      else expect(content).not.toContain('specification {');
      expect(content).toContain('model {');
      expect(content).toContain('views {');
    }
    expect(projection.idMap['stage_harvest']).toBe('stage:harvest');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('projects the graph onto the levels: system = the stages, container = the functions, component = the files', async () => {
  try {
    const db = cleanDb();
    const dir = tmpDir();
    await writeC4Diagrams(db, dir);

    // THE VENDOR GRAMMAR (2026-08-13 — the deep-container test's correction):
    // `<id> = <kind> '<Title>'` — the `=` assignment + single quotes. The old
    // assertions (`system stage_harvest "harvest"`, `view of index`) encoded the
    // WRONG grammar — the vendor CLI's Langium compile rejected them. The tests
    // now assert the vendor-valid emission.
    const system = await readFile(path.join(dir, 'system.c4'), 'utf-8');
    expect(system).toContain(`stage_harvest = system 'harvest'`);
    expect(system).toContain(`stage_zones = system 'zones'`);
    expect(system).toContain(`stage_harvest -> stage_zones 'wires'`);
    expect(system).toContain(`view of stage_harvest`);

    const container = await readFile(path.join(dir, 'container.c4'), 'utf-8');
    // THE MERGE LAW (2026-08-13 — verified against the CLI 0.40.0): the likec4
    // sources merge into ONE model — an id appears ONCE across all files. The
    // `machine = system` declaration lives in system.c4 ONLY; the container
    // file declares its containers TOP-LEVEL (the nested form re-declares
    // machine → "Duplicate element name machine").
    expect(container).not.toContain(`machine = system`);
    expect(container).toContain(`fn_harvestOrders = container 'harvestOrders'`);
    expect(container).toContain(`fn_harvestOrders -> fn_buildZoneMap 'calls'`);
    expect(container).toContain(`view of fn_harvestOrders`);

    const component = await readFile(path.join(dir, 'component.c4'), 'utf-8');
    expect(component).toContain(`file_src_harvest_ts = component 'harvest.ts'`);
    expect(component).toContain(`view of file_src_harvest_ts`);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('every edge appears in EXACTLY ONE level (the drift-clean-by-construction partition)', () => {
    const { levels } = projectGraph(
      [
        { id: 'stage:harvest', kind: 'stage', name: 'harvest' },
        { id: 'fn:harvestOrders', kind: 'function', name: 'harvestOrders' },
        { id: 'file:src/harvest.ts', kind: 'file', name: 'harvest.ts' },
      ],
      [
        { sourceId: 'stage:harvest', targetId: 'fn:harvestOrders', kind: 'wires' },
      ],
    );
    const all = [...levels.system.edges, ...levels.container.edges, ...levels.component.edges];
    expect(all.length).toBe(1);            // the stage→function edge lands in the CONTAINER level (a function endpoint)
    expect(levels.container.edges.length).toBe(1);
  });

  it('an empty graph renders the honest empty .c4 (never a fabricated architecture)', async () => {
  try {
    const db = openStore(':memory:');
    const dir = tmpDir();
    const { files } = await writeC4Diagrams(db, dir);
    expect(files.length).toBe(3);
    const system = await readFile(path.join(dir, 'system.c4'), 'utf-8');
    expect(system).toContain('GENERATED ARTIFACT');
    expect(system).not.toContain('->');    // no fabricated edges
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('sanitizeC4Id turns the graph ids into valid likec4 identifiers', () => {
    expect(sanitizeC4Id('fn:buildZoneMap')).toBe('fn_buildZoneMap');
    expect(sanitizeC4Id('file:src/engine.ts')).toBe('file_src_engine_ts');
    expect(sanitizeC4Id('')).toBe('node');
  });

  it('renderC4Dsl emits the component level with the machine fallback container on a container-less graph', () => {
    const projection = projectGraph(
      [
        { id: 'file:src/a.ts', kind: 'file', name: 'a.ts' },
        { id: 'file:src/b.ts', kind: 'file', name: 'b.ts' },
      ],
      [
        { sourceId: 'file:src/a.ts', targetId: 'file:src/b.ts', kind: 'imports' },
      ],
    );
    const dsl = renderC4Dsl('component', projection);
    expect(dsl).toContain(`file_src_a_ts = component 'a.ts'`);
    expect(dsl).toContain(`file_src_a_ts -> file_src_b_ts 'imports'`);
    expect(dsl).toContain(`view of file_src_a_ts`);
  });
});

// ---------------------------------------------------------------------------
// THE RENDER EXPORTS — the mermaid/dot codegen (spec:4699) + the ASCII fallback
// ---------------------------------------------------------------------------

describe('THE RENDER EXPORTS (the likec4 CLI codegen semantics — the mermaid/dot + the ASCII fallback)', () => {
  it('the mermaid codegen carries the nodes + the directional edges (flowchart LR)', async () => {
  try {
    const db = cleanDb();
    const dir = tmpDir();
    const { projection } = await writeC4Diagrams(db, dir);
    const mermaid = renderMermaid('system', projection);
    expect(mermaid).toContain('flowchart LR');
    expect(mermaid).toContain('stage_harvest["harvest"]');
    expect(mermaid).toContain('stage_harvest -->|wires| stage_zones');
    expect(mermaid).toContain('GENERATED ARTIFACT');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the dot codegen carries the nodes + the directional edges (digraph)', async () => {
  try {
    const db = cleanDb();
    const dir = tmpDir();
    const { projection } = await writeC4Diagrams(db, dir);
    const dot = renderDot('container', projection);
    expect(dot).toContain('digraph "container"');
    expect(dot).toContain('"fn_harvestOrders" [label="harvestOrders"];');
    expect(dot).toContain('"fn_harvestOrders" -> "fn_buildZoneMap" [label="calls"];');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the ASCII fallback renders the box diagram (monospace, aligned — spec:4699)', () => {
    const projection = projectGraph(
      [
        { id: 'stage:harvest', kind: 'stage', name: 'harvest' },
        { id: 'stage:zones', kind: 'stage', name: 'zones' },
      ],
      [
        { sourceId: 'stage:harvest', targetId: 'stage:zones', kind: 'wires' },
      ],
    );
    const ascii = renderAscii(projection);
    expect(ascii).toContain('ASCII — THE ARCHITECTURE DIAGRAMS');
    expect(ascii).toContain('THE SYSTEM LEVEL');
    expect(ascii).toContain('┌');   // the box-drawing fallback
    expect(ascii).toContain('──wires──→');
  });
});

// ---------------------------------------------------------------------------
// THE R17 DRIFT — the declared-vs-actual comparison + the drift alarm
// (the SAME consistency comparison the 7-verb verb=consistency answers)
// ---------------------------------------------------------------------------

describe('THE R17 DRIFT DETECTION (declared .c4 vs actual graph_edges)', () => {
  it('the MATCH: a fresh generation declares EXACTLY the graph — drift false, count 0', async () => {
  try {
    const db = cleanDb();
    const dir = tmpDir();
    await buildArchitectureDiagrams(db, dir);
    const report = await detectR17Drift(db, dir);
    expect(report.drift).toBe(false);
    expect(report.count).toBe(0);
    expect(report.declaredEdges).toBe(3);
    expect(report.actualEdges).toBe(3);
    expect(report.rows).toEqual([]);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the MISMATCH — declared-not-in-graph: a hand-edited declared edge missing in the graph → the HIGH drift row', async () => {
  try {
    const db = cleanDb();
    const dir = tmpDir();
    await writeC4Diagrams(db, dir);
    // the hand-edited intended model: someone declared a wiring the graph never had
    await writeFile(path.join(dir, 'system.c4'), 'model {\n  system stage_harvest "harvest"\n  stage_harvest -> stage_ghost "wires"\n}\n', 'utf-8');

    const report = await detectR17Drift(db, dir);
    expect(report.drift).toBe(true);
    const row = report.rows.find(r => r.kind === 'declared-edge-missing');
    expect(row).not.toBe(undefined);
    expect(row?.from).toBe('stage:harvest');
    expect(row?.to).toBe('stage_ghost');
    expect(row?.severity).toBe('HIGH');
    expect(row?.direction).toBe('declared-not-in-graph');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the MISMATCH — graph-not-in-declared: a graph edge the committed model never declared → the MED drift row', async () => {
  try {
    const db = openStore(':memory:');
    const dir = tmpDir();
    // THE COMMITTED MODEL FIRST — the .c4 declares the 3 original edges (the
    // graph the model was committed against).
    db.writeGraph(
      [
        { id: 'stage:harvest', kind: 'stage', name: 'harvest', file: null, line: null, lineage: 'SPEC_DERIVED', source: 'corpus:bible.md:10', data: { entry: 'harvestOrders' } },
        { id: 'stage:zones', kind: 'stage', name: 'zones', file: null, line: null, lineage: 'SPEC_DERIVED', source: 'corpus:bible.md:11', data: { entry: 'buildZoneMap' } },
        { id: 'fn:harvestOrders', kind: 'function', name: 'harvestOrders', file: 'src/harvest.ts', line: 17, lineage: 'CODE_DERIVED', source: 'corbell' },
        { id: 'fn:buildZoneMap', kind: 'function', name: 'buildZoneMap', file: 'src/zones.ts', line: 42, lineage: 'CODE_DERIVED', source: 'corbell' },
        { id: 'file:src/harvest.ts', kind: 'file', name: 'harvest.ts', file: 'src/harvest.ts', line: 1, lineage: 'CODE_DERIVED', source: 'corbell' },
      ],
      [
        { sourceId: 'stage:harvest', targetId: 'stage:zones', kind: 'wires', lineage: 'HYBRID' },
        { sourceId: 'fn:harvestOrders', targetId: 'fn:buildZoneMap', kind: 'calls', lineage: 'CODE_DERIVED' },
        { sourceId: 'file:src/harvest.ts', targetId: 'fn:harvestOrders', kind: 'imports', lineage: 'CODE_DERIVED' },
      ],
    );
    await writeC4Diagrams(db, dir);
    // THE CODE GREW A WIRING AFTER THE MODEL WAS COMMITTED — the per-run rebuild
    // (the writeGraph FK fix) means the growth is a NEW writeGraph call carrying
    // the full graph + the new undeclared edge (the .c4 was committed BEFORE).
    db.writeGraph(
      [
        { id: 'stage:harvest', kind: 'stage', name: 'harvest', file: null, line: null, lineage: 'SPEC_DERIVED', source: 'corpus:bible.md:10', data: { entry: 'harvestOrders' } },
        { id: 'stage:zones', kind: 'stage', name: 'zones', file: null, line: null, lineage: 'SPEC_DERIVED', source: 'corpus:bible.md:11', data: { entry: 'buildZoneMap' } },
        { id: 'fn:harvestOrders', kind: 'function', name: 'harvestOrders', file: 'src/harvest.ts', line: 17, lineage: 'CODE_DERIVED', source: 'corbell' },
        { id: 'fn:buildZoneMap', kind: 'function', name: 'buildZoneMap', file: 'src/zones.ts', line: 42, lineage: 'CODE_DERIVED', source: 'corbell' },
        { id: 'file:src/harvest.ts', kind: 'file', name: 'harvest.ts', file: 'src/harvest.ts', line: 1, lineage: 'CODE_DERIVED', source: 'corbell' },
      ],
      [
        { sourceId: 'stage:harvest', targetId: 'stage:zones', kind: 'wires', lineage: 'HYBRID' },
        { sourceId: 'fn:harvestOrders', targetId: 'fn:buildZoneMap', kind: 'calls', lineage: 'CODE_DERIVED' },
        { sourceId: 'file:src/harvest.ts', targetId: 'fn:harvestOrders', kind: 'imports', lineage: 'CODE_DERIVED' },
        // the code grew a wiring AFTER the model was committed (the NEW edge)
        { sourceId: 'fn:buildZoneMap', targetId: 'fn:harvestOrders', kind: 'calls', lineage: 'CODE_DERIVED' },
      ],
    );

    const report = await detectR17Drift(db, dir);
    expect(report.drift).toBe(true);
    const row = report.rows.find(r => r.kind === 'undeclared-edge-drift');
    expect(row).not.toBe(undefined);
    expect(row?.from).toBe('fn:buildZoneMap');
    expect(row?.to).toBe('fn:harvestOrders');
    expect(row?.severity).toBe('MED');
    expect(row?.direction).toBe('graph-not-in-declared');
    expect(report.actualEdges).toBe(4);
    expect(report.declaredEdges).toBe(3);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it("the consistency verb's node drift REUSED — a declared stage with no code fires the declared-stage-unwired row (the §3.12 language)", async () => {
  try {
    const db = driftDb();
    const dir = tmpDir();
    await buildArchitectureDiagrams(db, dir);
    const report = await detectR17Drift(db, dir);
    expect(report.declaredStageDrift).toBe(1);
    const node = report.nodeDrift.find(n => n.specNode === 'gate');
    expect(node).not.toBe(undefined);
    expect(node?.status).toBe('DRIFT');
    expect(report.drift).toBe(true);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the drift rows file in the shared-db audits table (the audit channel — actor likec4-bridge, event R17_DRIFT)', async () => {
  try {
    const db = driftDb();
    const dir = tmpDir();
    const bridge = await buildArchitectureDiagrams(db, dir, { runId: 'run-r17-001' });
    const rows = rowsAs<{ actor: string; event: string; triplet: string }>(db.prepare("SELECT actor, event, triplet FROM audits WHERE event = 'R17_DRIFT'").all(), 'audits');
    expect(rows.length).toBe(1);
    expect(rows[0].actor).toBe('likec4-bridge');
    expect(rows[0].event).toBe('R17_DRIFT');
    const parsed: { drift: boolean; count: number } = JSON.parse(rows[0].triplet);
    expect(typeof parsed.drift).toBe('boolean');
    expect(parsed.count > 0).toBe(true);
    expect(bridge.driftFile).toContain('r17-drift.json');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('parseDeclaredEdges reads the declared relationships with their .c4 file:line anchors', () => {
    const edges = parseDeclaredEdges(
      [{ file: 'system.c4', content: 'model {\n  stage_harvest -> stage_zones "wires"\n}' }],
      { stage_harvest: 'stage:harvest', stage_zones: 'stage:zones' },
    );
    expect(edges.length).toBe(1);
    expect(edges[0].from).toBe('stage:harvest');
    expect(edges[0].to).toBe('stage:zones');
    expect(edges[0].label).toBe('wires');
    expect(edges[0].anchor).toContain('system.c4:2');
  });

  it('the empty graph → drift false (0 declared, 0 actual — the honest empty, never a phantom alarm)', async () => {
  try {
    const db = openStore(':memory:');
    const dir = tmpDir();
    await writeC4Diagrams(db, dir);
    const report = await detectR17Drift(db, dir);
    expect(report.drift).toBe(false);
    expect(report.declaredEdges).toBe(0);
    expect(report.actualEdges).toBe(0);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});

// ---------------------------------------------------------------------------
// THE REPORT INTEGRATION — the §2 THE ARCHITECTURE DIAGRAMS splice (spec:4699)
// ---------------------------------------------------------------------------

describe('THE REPORT §2 INTEGRATION (the mermaid/dot exports + the ASCII fallback)', () => {
  function sampleInput(diagrams?: ArchitectureDiagrams): ReportWriterInput {
    return {
      projectRoot: path.join(os.tmpdir(), 'project'),
      runId: 'run-test-r17',
      findings: [],
      sections: [],
      graphSummaries: [
        { label: 'stage:harvest --wires→ stage:zones', detail: 'bible.md:10' },
      ],
      architectureDiagrams: diagrams,
    };
  }

  it('the §2 splice embeds the mermaid/dot exports + the ASCII fallback when the bridge provides them', async () => {
  try {
    const db = cleanDb();
    const dir = tmpDir();
    const bridge = await buildArchitectureDiagrams(db, dir);
    const diagrams: ArchitectureDiagrams = {
      mermaid: bridge.mermaid,
      dot: bridge.dot,
      ascii: bridge.ascii,
      sources: [...bridge.c4Files, ...bridge.mermaidFiles, bridge.driftFile],
      drift: { drift: bridge.drift.drift, count: bridge.drift.count },
    };
    const prompt = buildGenerationPrompt(sampleInput(diagrams));

    expect(prompt).toContain('THE ARCHITECTURE DIAGRAMS (the likec4 mermaid/dot exports + the ASCII fallback)');
    expect(prompt).toContain('#### THE MERMAID EXPORT');
    expect(prompt).toContain('flowchart LR');
    expect(prompt).toContain('#### THE DOT EXPORT');
    expect(prompt).toContain('#### THE ASCII FALLBACK');
    expect(prompt).toContain('THE ARCHITECTURE DIAGRAM ARTIFACTS');
    expect(prompt).toContain('.c4');                 // the diagram file paths ride the prompt (the report's diagram paths)
    expect(prompt).toContain('stage_harvest -->|wires| stage_zones');   // the graph's actual edge in the export
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the ASCII-only instruction renders when no diagrams are provided (the original anatomy — the battery pin)', () => {
    const prompt = buildGenerationPrompt(sampleInput(undefined));
    expect(prompt).toContain('3. THE ARCHITECTURE DIAGRAMS (ASCII)');
    expect(prompt).not.toContain('#### THE MERMAID EXPORT');
  });

  it('the empty-graph honest render flows into the §2 (never a fabricated architecture)', () => {
    const empty = emptyGraphDiagrams();
    const diagrams: ArchitectureDiagrams = {
      mermaid: empty.mermaid,
      dot: empty.dot,
      ascii: empty.ascii,
      sources: [],
      drift: { drift: false, count: 0 },
    };
    const prompt = buildGenerationPrompt(sampleInput(diagrams));
    expect(prompt).toContain('flowchart LR');
    expect(prompt).not.toContain('stage_harvest -->|wires|');
  });
});


/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.all()` result (an unknown array)
 *  is Array.isArray-checked before the typed row assertion. */
function rowsAs<T>(rows: unknown, label: string): T[] {
  if (Array.isArray(rows)) {
    return rows as T[];
  }
  throw new Error(`[likec4.test] ${label} expected an array of rows, got ${typeof rows}`);
}
