// SPEC-A §2.7 R-GRAPH + SPEC-B §2.8 — wiring-conformance layer (replaces R23)
// ONE shared DB handle law: caller owns the QueryEngine, this layer never opens per-call.
// Silent without graph (isBatchBActive false → 0 candidates, count unchanged).
// Emits LayerCandidate[] for the second aether brief; triads at emission (machineId r-graph), L7 stamp in caller.
import type { AnalysisContext } from '../types.ts';
import type { SpecBindings } from '../input/spec-bindings.ts';
import { isBatchBActive } from './activation.ts';
import type { QueryEngine, TypedEdgeRow, TypedNodeRow } from '../../shared/knowledge-graph/query-engine.ts';

export interface LayerCandidate {
  readonly subject: string;
  readonly predicate: 'shouldBe' | 'isButWrong' | 'violates' | 'wraps' | 'declares';
  readonly object: 'Lexicon' | 'Actor' | 'StateMachine' | 'Engine' | 'Adapter' | 'Contract';
  readonly file: string;
  readonly line: number;
  readonly evidenceQuote: string;
  readonly implicatedSpecClause?: string;
  readonly side: 'SIDE-1' | 'SIDE-2';
}

function resolveTargetPath(ctx: unknown): string {
  try {
    const c = ctx as Record<string, unknown>;
    if (typeof c['projectRoot'] === 'string' && (c['projectRoot'] as string).length > 0) return c['projectRoot'] as string;
    if (c['projectRoot'] && typeof (c['projectRoot'] as Record<string, unknown>)['projectRoot'] === 'string') return (c['projectRoot'] as Record<string, unknown>)['projectRoot'] as string;
  } catch (e: unknown) { console.error('[r-graph] resolveTargetPath failed', e instanceof Error ? e.message : String(e)); }
  return '';
}

function safeTemporalLiveNodes(graph: QueryEngine): { nodes: TypedNodeRow[]; edges: TypedEdgeRow[] } {
  try {
    const res = (graph as unknown as { temporal: (f: unknown) => { nodes: TypedNodeRow[]; edges: TypedEdgeRow[] } }).temporal({ liveOnly: true });
    if (res && Array.isArray(res.nodes) && Array.isArray(res.edges)) return res;
  } catch (e: unknown) { console.error('[r-graph] temporal failed', e instanceof Error ? e.message : String(e)); }
  return { nodes: [], edges: [] };
}

function buildInboundMap(edges: TypedEdgeRow[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  try {
    for (const e of edges) {
      try {
        if (!e.dst_canonical || !e.predicate) continue;
        if (!m.has(e.dst_canonical)) m.set(e.dst_canonical, new Set());
        m.get(e.dst_canonical)!.add(e.predicate);
      } catch (err: unknown) { console.error('[r-graph] inbound map entry failed', err instanceof Error ? err.message : String(err)); }
    }
  } catch (e: unknown) { console.error('[r-graph] buildInboundMap failed', e instanceof Error ? e.message : String(e)); }
  return m;
}

function buildOutboundMap(edges: TypedEdgeRow[]): Map<string, TypedEdgeRow[]> {
  const m = new Map<string, TypedEdgeRow[]>();
  try {
    for (const e of edges) {
      try {
        if (!e.src_canonical) continue;
        if (!m.has(e.src_canonical)) m.set(e.src_canonical, []);
        m.get(e.src_canonical)!.push(e);
      } catch (err: unknown) { console.error('[r-graph] outbound map entry failed', err instanceof Error ? err.message : String(err)); }
    }
  } catch (e: unknown) { console.error('[r-graph] buildOutboundMap failed', e instanceof Error ? e.message : String(e)); }
  return m;
}

export function candidates(ctx: AnalysisContext, graph: unknown): LayerCandidate[] {
  const out: LayerCandidate[] = [];
  try {
    if (!ctx || typeof ctx !== 'object') {
      console.error('[r-graph] candidates: ctx null/invalid');
      return out;
    }
    const targetPath = resolveTargetPath(ctx);
    if (!targetPath) {
      console.error('[r-graph] candidates: no projectRoot, silent');
      return out;
    }
    let active = false;
    try { active = isBatchBActive(targetPath); } catch (e: unknown) { console.error('[r-graph] isBatchBActive failed', e instanceof Error ? e.message : String(e)); return out; }
    if (!active) return out;
    if (!graph || typeof graph !== 'object' || typeof (graph as Record<string, unknown>)['temporal'] !== 'function') {
      console.error('[r-graph] candidates: graph handle invalid (expected QueryEngine)');
      return out;
    }
    const engine = graph as QueryEngine;
    const { nodes, edges } = safeTemporalLiveNodes(engine);
    if (nodes.length === 0 && edges.length === 0) return out;
    const inbound = buildInboundMap(edges);
    const outbound = buildOutboundMap(edges);

    try {
      for (const n of nodes) {
        try {
          if (!n.canonical_id || !n.kind) continue;
          const isExportLike = n.kind === 'Module' || n.kind === 'File' || n.kind === 'Class' || n.kind === 'Function' || n.kind === 'Interface';
          if (!isExportLike) continue;
          const hasInbound = inbound.has(n.canonical_id);
          const hasOutExport = (outbound.get(n.canonical_id) ?? []).some((ed) => ed.predicate === 'exports');
          const isUnwiredCandidate = hasOutExport && !hasInbound;
          const isNoImporter = !hasInbound && (n.kind === 'Class' || n.kind === 'Function' || n.kind === 'Interface');
          if (isUnwiredCandidate || isNoImporter) {
            const inboundPreds = inbound.get(n.canonical_id);
            if (!inboundPreds || !inboundPreds.has('imports')) {
              let confirmedUnwired = true;
              try {
                const probe = (engine as unknown as { path: (a: string, b: string, o: unknown) => TypedEdgeRow[] }).path ?? null;
                if (probe) {
                  void probe;
                }
              } catch (err: unknown) { console.error('[r-graph] path probe failed', err instanceof Error ? err.message : String(err)); }
              if (confirmedUnwired) {
                out.push({
                  subject: n.canonical_id,
                  predicate: 'violates',
                  object: 'Adapter',
                  file: n.file ?? n.canonical_id,
                  line: n.line ?? 1,
                  evidenceQuote: `unwired export: ${n.kind} ${n.canonical_id} has no inbound imports edge (wiring parity)`.slice(0, 200),
                  implicatedSpecClause: 'SPEC-A §2.7 wiring parity: every export must have an importer',
                  side: 'SIDE-1',
                });
              }
            }
          }
        } catch (err: unknown) { console.error('[r-graph] per-node failed', n.canonical_id, err instanceof Error ? err.message : String(err)); }
      }
    } catch (e: unknown) { console.error('[r-graph] unwired scan failed', e instanceof Error ? e.message : String(e)); }

    try {
      const adapterNodes = nodes.filter((n) => n.kind === 'Adapter');
      const machineNodes = new Set(nodes.filter((n) => n.kind === 'Machine').map((n) => n.canonical_id));
      const engineNodes = new Set(nodes.filter((n) => n.kind === 'Engine').map((n) => n.canonical_id));
      for (const a of adapterNodes) {
        try {
          const outs = outbound.get(a.canonical_id) ?? [];
          const hasCallsToMachine = outs.some((ed) => (ed.predicate === 'calls' || ed.predicate === 'wraps') && (machineNodes.has(ed.dst_canonical) || engineNodes.has(ed.dst_canonical)));
          const hasImportsEdge = outs.some((ed) => ed.predicate === 'imports');
          if (!hasCallsToMachine) {
            out.push({
              subject: a.canonical_id,
              predicate: 'shouldBe',
              object: 'Adapter',
              file: a.file ?? a.canonical_id,
              line: a.line ?? 1,
              evidenceQuote: `adapter ${a.canonical_id} has no calls/wraps edge to Machine/Engine (adapter-to-machine wiring parity)`.slice(0, 200),
              implicatedSpecClause: 'SPEC-A §2.7 adapter↔machine wiring parity',
              side: 'SIDE-1',
            });
          }
          if (!hasImportsEdge && outs.length === 0) {
            out.push({
              subject: a.canonical_id,
              predicate: 'isButWrong',
              object: 'Adapter',
              file: a.file ?? a.canonical_id,
              line: a.line ?? 1,
              evidenceQuote: `adapter ${a.canonical_id} has zero outbound typed edges (dead adapter)`.slice(0, 200),
              implicatedSpecClause: 'SPEC-A §2.7 wiring: adapters must carry at least one wiring predicate',
              side: 'SIDE-2',
            });
          }
        } catch (err: unknown) { console.error('[r-graph] adapter parity per-node failed', a.canonical_id, err instanceof Error ? err.message : String(err)); }
      }
    } catch (e: unknown) { console.error('[r-graph] adapter parity scan failed', e instanceof Error ? e.message : String(e)); }

    if (out.length === 0 && nodes.length > 0) {
      try {
        const anyNode = nodes[0];
        const hasAnyWiring = edges.some((ed) => ['calls', 'imports', 'awaits', 'exports', 'unwired'].includes(ed.predicate));
        if (!hasAnyWiring) {
          out.push({
            subject: anyNode.canonical_id,
            predicate: 'violates',
            object: 'Contract',
            file: anyNode.file ?? anyNode.canonical_id,
            line: anyNode.line ?? 1,
            evidenceQuote: `graph at ${targetPath} has typed nodes but zero wiring predicates (calls/imports/awaits/exports/unwired) — wiring-conformance gap`.slice(0, 200),
            implicatedSpecClause: 'SPEC-B §2.9 MC-B-01 graph.vocab.closed: wiring predicates must be present',
            side: 'SIDE-1',
          });
        }
      } catch (e: unknown) { console.error('[r-graph] fallback wiring gap failed', e instanceof Error ? e.message : String(e)); }
    }
  } catch (e: unknown) {
    console.error('[r-graph] candidates top failed', e instanceof Error ? e.message : String(e));
  }
  return out;
}
