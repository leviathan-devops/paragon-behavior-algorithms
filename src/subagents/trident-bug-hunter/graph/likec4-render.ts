// src/subagents/trident-bug-hunter/graph/likec4-render.ts
// THE RENDER EXPORTS (the likec4 CLI's codegen semantics — the report's §2
// "rendered via likec4's mermaid/dot exports + the ASCII fallback", spec:4699).
//
// THE BINARY-ABSENCE HONORED (ZERO-ADD — no new repo dependency): the likec4
// CLI (`npx @likec4/cli codegen mermaid`) is NOT in the container venv; the
// bridge generates the mermaid/dot DIRECTLY per the vendor's codegen semantics
// (the C4 DSL → the flowchart/digraph transformation). The likec4 CLI's own
// compilation is the container-level verification — the direct generation here
// is the report-time render the report's §2 consumes (spec:2502 — "the likec4
// CLI's `codegen mermaid` invocation is a report-time call, not a persistent
// service"). The ASCII fallback renders when the export is unavailable (the
// spec:4699 contract) — the same box-diagram form the report's ASCII section
// demands (monospace, aligned, no wrapped lines).

import type { C4Level, C4Projection } from './likec4-dsl.ts';

const BOX_WIDTH = 26;

function pad(s: string, width: number): string {
  if (s.length > width) return `${s.slice(0, width - 1)}…`;
  return s + ' '.repeat(width - s.length);
}

// ---------------------------------------------------------------------------
// THE MERMAID CODEGEN (the vendor's `codegen mermaid` semantics — flowchart LR)
// ---------------------------------------------------------------------------

/** Render one C4 level as a mermaid flowchart (the likec4 codegen semantics). */
export function renderMermaid(level: C4Level, projection: C4Projection): string {
  const { nodes, edges } = projection.levels[level];
  const L: string[] = [];
  L.push('%% GENERATED ARTIFACT — the likec4 mermaid codegen semantics (the likec4-bridge, graph/likec4-render.ts)');
  L.push('flowchart LR');
  for (const n of nodes) L.push(`  ${n.id}["${n.name}"]`);
  for (const e of edges) L.push(`  ${e.from} -->|${e.label}| ${e.to}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// THE DOT CODEGEN (the vendor's codegen dot semantics — the digraph form)
// ---------------------------------------------------------------------------

/** Render one C4 level as a DOT digraph (the likec4 dot codegen semantics). */
export function renderDot(level: C4Level, projection: C4Projection): string {
  const { nodes, edges } = projection.levels[level];
  const L: string[] = [];
  L.push('// GENERATED ARTIFACT — the likec4 dot codegen semantics (graph/likec4-render.ts)');
  L.push(`digraph "${level}" {`);
  L.push('  rankdir=LR;');
  for (const n of nodes) L.push(`  "${n.id}" [label="${n.name}"];`);
  for (const e of edges) L.push(`  "${e.from}" -> "${e.to}" [label="${e.label}"];`);
  L.push('}');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// THE ASCII FALLBACK (spec:4699 — the box diagram that renders when the export
// is unavailable: monospace, aligned, no wrapped lines)
// ---------------------------------------------------------------------------

/** One edge's 3-line aligned box row (two boxes + the centered arrow). */
function asciiEdgeRow(from: string, label: string, to: string): string[] {
  const gap = 4;
  const arrow = `──${label}──→`;
  const middlePad = gap + (arrow.length > 16 ? 0 : 16 - arrow.length);
  return [
    `┌${'─'.repeat(BOX_WIDTH)}┐${' '.repeat(gap)}┌${'─'.repeat(BOX_WIDTH)}┐`,
    `│${pad(from, BOX_WIDTH)}│${' '.repeat(middlePad)}${arrow}${' '.repeat(gap)}│${pad(to, BOX_WIDTH)}│`,
    `└${'─'.repeat(BOX_WIDTH)}┘${' '.repeat(gap)}└${'─'.repeat(BOX_WIDTH)}┘`,
  ];
}

/** The ASCII fallback for ONE C4 level (the node legend + the edge box rows). */
function renderAsciiLevel(level: C4Level, projection: C4Projection): string {
  const { nodes, edges } = projection.levels[level];
  const L: string[] = [];
  L.push(`THE ${level.toUpperCase()} LEVEL`);
  L.push('');
  if (nodes.length === 0) {
    L.push('  (no nodes at this level — the graph is empty)');
  } else {
    L.push('  THE NODES:');
    for (const n of nodes) L.push(`    [${n.id}]  ${n.name}`);
    L.push('');
    L.push('  THE EDGES (the wiring — monospace, aligned):');
    for (const e of edges) {
      L.push(...asciiEdgeRow(e.from, e.label, e.to));
    }
  }
  return L.join('\n');
}

/** The full ASCII fallback for all 3 levels (the report's §2 fallback render). */
export function renderAscii(projection: C4Projection): string {
  const L: string[] = [];
  L.push('ASCII — THE ARCHITECTURE DIAGRAMS (the likec4 export unavailable → the ASCII fallback, spec:4699)');
  L.push('');
  const LEVELS: C4Level[] = ['system', 'container', 'component'];
  for (const level of LEVELS) {
    L.push(renderAsciiLevel(level, projection));
    L.push('');
  }
  return L.join('\n').replace(/\n+$/, '\n');
}
