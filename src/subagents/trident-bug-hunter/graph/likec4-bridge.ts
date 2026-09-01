// src/subagents/trident-bug-hunter/graph/likec4-bridge.ts
// THE LIKEC4 BRIDGE (the v4.4.4 Layer 6, spec substrate row 300 — the module
// the failure log's V4.1 class claimed 'wired' with ZERO code). This is the
// substance: the 3 C4 diagrams + the R17 drift detection + the report's §2
// render material, generated FROM the machine's graph.
//
// THE COMPOSITION (the four parts):
//   (a) THE C4 DSL GENERATION — writeC4Diagrams (graph/likec4-dsl.ts) → the 3
//       .c4 files (system/container/component) + the c4-id-map.json — the
//       generated artifacts the Langium LSP compiles (never a data-model peer,
//       spec:2233/2502/3027).
//   (b) THE R17 DRIFT — detectR17Drift (graph/likec4-drift.ts) → the declared
//       (.c4) vs actual (graph_edges) diff + the drift alarm — the SAME
//       consistency comparison the 7-verb verb=consistency answers (§3.12).
//   (c) THE RENDER EXPORTS — renderMermaid/renderDot/renderAscii
//       (graph/likec4-render.ts) → the report's §2 material (spec:4699: "the
//       current broken wiring vs the fixed wiring — the E1→E2→E3 chain, the
//       7-tool pipeline, the cascade — rendered via likec4's mermaid/dot
//       exports + the ASCII fallback").
//   (d) THE LIKEC4 LSP'S ROLE — honored by the .c4 emission (the hand-written
//       DSL the LSP compiles); the LSP never parses code (row 300). The CLI
//       (`npx @likec4/cli`) is NOT in the venv — the binary-absence is honored
//       (the direct mermaid/dot generation), never a phantom wiring.
//
// THE OUTPUT FILES land at the report's diagram paths (<master-context>/
// diagrams/) — the report-writer's §2 renders them (the tools/report-writer.ts
// splice). The graph stays the source of truth — every file carries the
// generated-artifact header; none is registered into the query surface.

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DbClient } from '../../../shared/knowledge-graph/db.ts';
import { C4_LEVELS, writeC4Diagrams, renderC4IdMap, type C4Projection } from './likec4-dsl.ts';
import { renderMermaid, renderDot, renderAscii } from './likec4-render.ts';
import { detectR17Drift, fileDriftReport, type R17DriftReport } from './likec4-drift.ts';

/** The complete bridge result — the output files + the §2 render material. */
export interface C4BridgeResult {
  c4Files: string[];        // the 3 .c4 files (system/container/component)
  mermaidFiles: string[];   // the 3 .mmd exports
  dotFiles: string[];       // the 3 .dot exports
  asciiFile: string;        // the ASCII fallback
  idMapFile: string;        // the sanitized→original id manifest
  driftFile: string;        // the R17 drift report JSON
  drift: R17DriftReport;    // the R17 drift alarm (the structured signal)
  mermaid: string;          // the report §2 mermaid content (all 3 levels)
  dot: string;              // the report §2 dot content (all 3 levels)
  ascii: string;            // the report §2 ASCII fallback content (all 3 levels)
}

/** THE BRIDGE — generate the 3 .c4 diagrams + the render exports + the R17
 *  drift from the graph. Writes the artifacts into outputDir (the report's
 *  diagram paths) and returns the composed §2 material. */
export async function buildArchitectureDiagrams(
  db: DbClient,
  outputDir: string,
  opts: { runId?: string } = {},
): Promise<C4BridgeResult> {
  try {
    const { files: c4Files, projection } = await writeC4Diagrams(db, outputDir);
    const idMapFile = join(outputDir, 'c4-id-map.json');
    await writeFile(idMapFile, renderC4IdMap(projection), 'utf-8');

  const mermaidFiles: string[] = [];
  const dotFiles: string[] = [];
  const mermaidSections: string[] = [];
  const dotSections: string[] = [];
  for (const level of C4_LEVELS) {
    const mermaid = renderMermaid(level, projection);
    const dot = renderDot(level, projection);
    const mPath = join(outputDir, `${level}.mmd`);
    const dPath = join(outputDir, `${level}.dot`);
    await writeFile(mPath, mermaid, 'utf-8');
    await writeFile(dPath, dot, 'utf-8');
    mermaidFiles.push(mPath);
    dotFiles.push(dPath);
    mermaidSections.push(`## THE ${level.toUpperCase()} DIAGRAM\n\n${mermaid}`);
    dotSections.push(`## THE ${level.toUpperCase()} DIAGRAM\n\n${dot}`);
  }

  const ascii = renderAscii(projection);
  const asciiFile = join(outputDir, 'architecture-ascii.txt');
  await writeFile(asciiFile, ascii, 'utf-8');

  const drift = await detectR17Drift(db, outputDir);
  const driftFile = join(outputDir, 'r17-drift.json');
  await writeFile(driftFile, `${JSON.stringify(drift, null, 2)}\n`, 'utf-8');
  if (opts.runId) fileDriftReport(db, opts.runId, drift);

  return {
    c4Files,
    mermaidFiles,
    dotFiles,
    asciiFile,
    idMapFile,
    driftFile,
    drift,
    mermaid: mermaidSections.join('\n\n'),
    dot: dotSections.join('\n\n'),
    ascii,
  };
  } catch (e: unknown) {
    console.warn(`[likec4-bridge] buildArchitectureDiagrams failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

/** The empty-graph note (the honest render when the graph holds no nodes). */
export function emptyGraphDiagrams(): C4BridgeResult {
  const empty: C4Projection = {
    levels: {
      system: { nodes: [], edges: [] },
      container: { nodes: [], edges: [] },
      component: { nodes: [], edges: [] },
    },
    idMap: {},
  };
  const mermaid = C4_LEVELS.map(level => `## THE ${level.toUpperCase()} DIAGRAM\n\nflowchart LR`).join('\n\n');
  const dot = C4_LEVELS.map(level => `digraph "${level}" {\n  rankdir=LR;\n}`).join('\n\n');
  const ascii = 'ASCII — THE ARCHITECTURE DIAGRAMS (the likec4 export unavailable → the ASCII fallback, spec:4699)\n\n(the graph is empty — no architecture to render)';
  return {
    c4Files: [],
    mermaidFiles: [],
    dotFiles: [],
    asciiFile: '',
    idMapFile: '',
    driftFile: '',
    drift: { drift: false, count: 0, declaredEdges: 0, actualEdges: 0, declaredStageDrift: 0, rows: [], nodeDrift: [] },
    mermaid,
    dot,
    ascii,
  };
}
