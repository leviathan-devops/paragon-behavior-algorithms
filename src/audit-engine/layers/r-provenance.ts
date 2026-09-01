// SPEC-A §2.7 R-PROVENANCE + SPEC-B §2.8 — spec→code trace verification over graph edges BFS <=64
// Silent without graph (isBatchBActive false → 0). Active: every spec clause cited by first pass → path verify via QueryEngine.path (bounded 64) → TRACE_GAP candidates feed second pass.
import type { AnalysisContext } from '../types.ts';
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
const PATH_DEPTH_MAX = 64;
function resolveTargetPath(ctx: unknown): string {
  try {
    const c = ctx as Record<string, unknown>;
    if (typeof c['projectRoot'] === 'string' && (c['projectRoot'] as string).length > 0) return c['projectRoot'] as string;
  } catch (e: unknown) { console.error('[r-provenance] resolveTargetPath failed', e instanceof Error ? e.message : String(e)); }
  return '';
}
function normalizeSpecClauses(input: unknown): string[] {
  if (input === null || input === undefined) return [];
  if (typeof input === 'string') { const t = input.trim(); return t.length > 0 ? [t] : []; }
  if (Array.isArray(input)) {
    const out: string[] = [];
    for (const item of input) {
      try {
        if (typeof item === 'string' && item.trim().length > 0) out.push(item.trim());
        else if (item && typeof item === 'object') {
          const r = item as Record<string, unknown>;
          if (typeof r['implicatedSpecClause'] === 'string' && (r['implicatedSpecClause'] as string).trim().length > 0) out.push((r['implicatedSpecClause'] as string).trim());
          else if (typeof r['clause'] === 'string' && (r['clause'] as string).trim().length > 0) out.push((r['clause'] as string).trim());
          else if (typeof r['specPath'] === 'string' && typeof r['line'] === 'number') out.push(`${r['specPath'] as string}:${r['line'] as number}`);
          else if (typeof r['quote'] === 'string' && (r['quote'] as string).trim().length > 0) out.push((r['quote'] as string).trim().slice(0, 200));
        }
      } catch (err: unknown) { console.error('[r-provenance] normalize item failed', err instanceof Error ? err.message : String(err)); }
    }
    return [...new Set(out)];
  }
  if (typeof input === 'object') {
    const r = input as Record<string, unknown>;
    if (Array.isArray(r['declarations'])) {
      const out: string[] = [];
      for (const d of r['declarations'] as unknown[]) {
        try {
          if (!d || typeof d !== 'object') continue;
          const dd = d as Record<string, unknown>;
          if (typeof dd['specPath'] === 'string' && typeof dd['line'] === 'number') out.push(`${dd['specPath'] as string}:${dd['line'] as number}`);
          else if (typeof dd['quote'] === 'string') out.push((dd['quote'] as string).trim().slice(0, 200));
        } catch (err: unknown) { console.error('[r-provenance] normalize declarations failed', err instanceof Error ? err.message : String(err)); }
      }
      return [...new Set(out)];
    }
  }
  return [];
}
function specClauseToNodeId(clause: string): string {
  const t = clause.trim();
  if (t.includes('SpecClause:') || t.startsWith('SpecClause')) return t;
  if (t.includes('.md:') || t.includes('.json:')) {
    const hash = t.slice(0, 64).replace(/[^a-zA-Z0-9]/g, '_');
    return `SpecClause:${hash}`;
  }
  return `SpecClause:${t.slice(0, 80).replace(/[^a-zA-Z0-9]/g, '_')}`;
}
function extractCandidateGraph(input: unknown): QueryEngine | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj['path'] === 'function' && typeof obj['temporal'] === 'function') return obj as unknown as QueryEngine;
  if (obj['graph'] && typeof (obj['graph'] as Record<string, unknown>)['path'] === 'function') return obj['graph'] as unknown as QueryEngine;
  return null;
}
function getLiveNodes(graph: QueryEngine): TypedNodeRow[] {
  try {
    const res = (graph as unknown as { temporal: (f: unknown) => { nodes: TypedNodeRow[]; edges: TypedEdgeRow[] } }).temporal({ liveOnly: true });
    if (res && Array.isArray(res.nodes)) return res.nodes;
  } catch (e: unknown) { console.error('[r-provenance] temporal failed', e instanceof Error ? e.message : String(e)); }
  return [];
}
export function candidates(ctx: AnalysisContext, specClauses: unknown): LayerCandidate[] {
  const out: LayerCandidate[] = [];
  try {
    if (!ctx || typeof ctx !== 'object') { console.error('[r-provenance] candidates: ctx null/invalid'); return out; }
    const targetPath = resolveTargetPath(ctx);
    if (!targetPath) { console.error('[r-provenance] candidates: no projectRoot'); return out; }
    let active = false;
    try { active = isBatchBActive(targetPath); } catch (e: unknown) { console.error('[r-provenance] isBatchBActive failed', e instanceof Error ? e.message : String(e)); return out; }
    if (!active) return out;
    let graph: QueryEngine | null = null;
    let clausesRaw: unknown = specClauses;
    const maybeGraph = extractCandidateGraph(specClauses);
    if (maybeGraph) {
      graph = maybeGraph;
      const obj = specClauses as Record<string, unknown>;
      clausesRaw = obj['specClauses'] ?? obj['clauses'] ?? obj['candidates'] ?? obj['declarations'] ?? [];
    } else if (specClauses && typeof specClauses === 'object' && typeof (specClauses as Record<string, unknown>)['path'] === 'function') {
      graph = specClauses as unknown as QueryEngine;
      clausesRaw = [];
    } else {
      const maybeGraph2 = extractCandidateGraph(ctx);
      if (maybeGraph2) graph = maybeGraph2;
    }
    const clauses = normalizeSpecClauses(clausesRaw);
    const effectiveClauses = clauses.length > 0 ? clauses : ((): string[] => {
      if (!graph) return [];
      const nodes = getLiveNodes(graph);
      const specNodes = nodes.filter((n) => n.kind === 'SpecClause');
      if (specNodes.length === 0) return [];
      return specNodes.map((n) => n.canonical_id);
    })();
    if (effectiveClauses.length === 0) return out;
    if (!graph) {
      for (const clause of effectiveClauses.slice(0, 10)) {
        try {
          const nodeId = specClauseToNodeId(clause);
          out.push({
            subject: nodeId,
            predicate: 'violates',
            object: 'Contract',
            file: clause.includes(':') ? clause.split(':')[0]! : nodeId,
            line: (() => { const m = clause.match(/:(\d+)\b/); return m ? parseInt(m[1]!, 10) : 1; })(),
            evidenceQuote: `TRACE_GAP: spec clause ${clause.slice(0,120)} has no graph handle to verify (no GraphEngine) — unverifiable`.slice(0, 200),
            implicatedSpecClause: clause,
            side: 'SIDE-1',
          });
        } catch (err: unknown) { console.error('[r-provenance] no-graph fallback per-clause failed', err instanceof Error ? err.message : String(err)); }
      }
      return out;
    }
    const nodes = getLiveNodes(graph);
    const nodeIds = new Set(nodes.map((n) => n.canonical_id));
    void nodeIds;
    const hasAnyCodeNode = nodes.some((n) => ['Class','Function','Module','Engine','Adapter','Contract','Threshold','File'].includes(n.kind));
    for (const clause of effectiveClauses) {
      try {
        const fromId = specClauseToNodeId(clause);
        const fileForClause = clause.includes('.md') || clause.includes('.json') ? (clause.split(':')[0] ?? clause) : fromId;
        const lineForClause = (() => { const m = clause.match(/:(\d+)\b/); return m ? parseInt(m[1]!, 10) : 1; })();
        let pathFound = false;
        let pathError: string | null = null;
        if (hasAnyCodeNode) {
          for (const target of nodes) {
            try {
              if (target.kind === 'SpecClause') continue;
              if (!['Class','Function','Module','Engine','Adapter','Contract','File','Lexicon','Actor','StateMachine'].includes(target.kind)) continue;
              const targetId = target.canonical_id;
              try {
                const edges = (graph as unknown as { path: (a: string, b: string, o: unknown) => TypedEdgeRow[] }).path(fromId, targetId, { maxDepth: PATH_DEPTH_MAX });
                if (Array.isArray(edges) && edges.length > 0) { pathFound = true; break; }
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.includes('PATH_BOUNDED')) { pathError = msg; break; }
                pathError = msg;
              }
              try {
                const alt = (graph as unknown as { path: (a: string, b: string, o: unknown) => TypedEdgeRow[] }).path(clause, targetId, { maxDepth: PATH_DEPTH_MAX });
                if (Array.isArray(alt) && alt.length > 0) { pathFound = true; break; }
              } catch (e2: unknown) { console.error('[r-provenance] alt path failed', e2 instanceof Error ? e2.message : String(e2)); }
            } catch (err: unknown) { console.error('[r-provenance] per-target path failed', err instanceof Error ? err.message : String(err)); }
          }
          if (!pathFound) {
            try {
              const edgesNoTarget = (graph as unknown as { path: (a: string, b: string, o: unknown) => TypedEdgeRow[] }).path(fromId, fromId, { maxDepth: PATH_DEPTH_MAX });
              void edgesNoTarget;
            } catch (e2: unknown) { console.error('[r-provenance] self path check failed', e2 instanceof Error ? e2.message : String(e2)); }
          }
        }
        if (!pathFound) {
          if (pathError && pathError.includes('PATH_BOUNDED')) throw new Error(`PATH_BOUNDED: ${pathError}`);
          out.push({
            subject: fromId,
            predicate: 'violates',
            object: 'Contract',
            file: fileForClause.slice(0, 200),
            line: lineForClause,
            evidenceQuote: `TRACE_GAP: spec clause ${clause.slice(0,100)} -> code: no path <=${PATH_DEPTH_MAX} over typed_edges (BFS bounded) — the provenance trace is missing`.slice(0, 200),
            implicatedSpecClause: clause,
            side: 'SIDE-1',
          });
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('PATH_BOUNDED')) throw err;
        console.error('[r-provenance] per-clause failed', clause.slice(0, 80), err instanceof Error ? err.message : String(err));
      }
    }
  } catch (e: unknown) { console.error('[r-provenance] candidates top failed', e instanceof Error ? e.message : String(e)); }
  return out;
}
