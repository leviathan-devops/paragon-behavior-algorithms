import { isPredicate, PREDICATES } from '../../../shared/knowledge-graph/ontology.ts';
import type { TypedEdgeRow } from '../../../shared/knowledge-graph/query-engine.ts';
import type { QueryEngine } from '../../../shared/knowledge-graph/query-engine.ts';
import type { TraceGap } from './l6-agent.ts';

export class VerifyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

export interface VerifyClaim {
  subject: string;
  predicate: string;
  object: string;
  pathNodes?: string[];
  evidence?: string;
  confidence?: number;
  isInference?: boolean;
}

export type VerifyVerdict = 'ACCEPTED' | 'REFUSED' | 'TRACE_GAP';

export interface VerifyResult {
  verdict: VerifyVerdict;
  reason: string;
  path: TypedEdgeRow[];
  gaps: TraceGap[];
  confidence: number;
  isInference: boolean;
  adjacencyViolation?: boolean;
}

const FAMILY_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [family, preds] of Object.entries(PREDICATES)) {
    for (const p of preds as readonly string[]) m[p] = family;
  }
  return m;
})();

function getFamily(predicate: string): string | undefined {
  return FAMILY_MAP[predicate];
}

function isValidEngine(engine: unknown): engine is QueryEngine {
  return !!engine && typeof engine === 'object' && typeof (engine as Record<string, unknown>).path === 'function' && typeof (engine as Record<string, unknown>).entity === 'function';
}

export function verifyClaim(claim: unknown, graph: unknown): VerifyResult {
  if (!isValidEngine(graph)) {
    throw new VerifyError('VERIFY_GRAPH_INVALID', 'VERIFY_GRAPH_INVALID: graph must be QueryEngine with entity() and path()');
  }
  const engine = graph as QueryEngine;
  if (!claim || typeof claim !== 'object') {
    throw new VerifyError('VERIFY_CLAIM_INVALID', 'VERIFY_CLAIM_INVALID: claim must be object with subject/predicate/object');
  }
  const c = claim as Partial<VerifyClaim>;
  const subject = typeof c.subject === 'string' ? c.subject.trim() : '';
  const predicate = typeof c.predicate === 'string' ? c.predicate.trim() : '';
  const object = typeof c.object === 'string' ? c.object.trim() : '';
  const confidence = typeof c.confidence === 'number' && Number.isFinite(c.confidence) ? c.confidence : 1.0;
  const isInference = c.isInference === true;

  if (!subject || !predicate || !object) {
    return {
      verdict: 'REFUSED',
      reason: 'REFUSED: claim missing subject/predicate/object — pathless claim REFUSED (MC-B-08, L7 law)',
      path: [],
      gaps: [{ from: subject || '?', to: object || '?', predicate: predicate || '?', closed: false, meaning: 'TRACE_GAP: missing subject/predicate/object — named missing structure: the claim has no node-path' }],
      confidence,
      isInference,
    };
  }

  if (!isPredicate(predicate)) {
    return {
      verdict: 'REFUSED',
      reason: `REFUSED: predicate '${predicate}' not in ontology closed vocab — schema-lock rejection`,
      path: [],
      gaps: [{ from: subject, to: object, predicate, closed: false, meaning: `TRACE_GAP: predicate '${predicate}' not in ontology — named missing structure` }],
      confidence,
      isInference,
    };
  }

  const pathNodes = Array.isArray(c.pathNodes) ? (c.pathNodes as unknown[]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((s) => s.trim()) : undefined;
  if (c.pathNodes !== undefined) {
    if (!Array.isArray(c.pathNodes)) {
      throw new VerifyError('VERIFY_CLAIM_INVALID', 'VERIFY_CLAIM_INVALID: pathNodes must be array if provided');
    }
    if (pathNodes !== undefined && pathNodes.length === 0) {
      return {
        verdict: 'REFUSED',
        reason: 'REFUSED: claim cites empty pathNodes — pathless claim REFUSED (L7: a claim without a node-path is REFUSED, never downgraded)',
        path: [],
        gaps: [{ from: subject, to: object, predicate, closed: false, meaning: 'TRACE_GAP: empty pathNodes — named missing structure: no nodes cited' }],
        confidence,
        isInference,
      };
    }
  } else {
    if (pathNodes === undefined) {
      // still need at least subject/object as nodes — if both missing already handled; but claim without explicit pathNodes is considered pathless if graph path empty
    }
  }

  const allNodes: string[] = [subject, object];
  if (pathNodes) allNodes.push(...pathNodes);
  for (const canonical of allNodes) {
    try {
      const node = engine.entity(canonical);
      if (!node) {
        return {
          verdict: 'TRACE_GAP',
          reason: `TRACE_GAP: node '${canonical}' not in typed_nodes — named missing structure`,
          path: [],
          gaps: [{ from: canonical, to: object, predicate, closed: false, meaning: `TRACE_GAP: missing node '${canonical}' — the graph cannot answer, named missing structure is '${canonical}'` }],
          confidence,
          isInference: isInference || false,
        };
      }
    } catch (e: unknown) {
      throw new VerifyError('VERIFY_ENTITY_FAILED', `VERIFY_ENTITY_FAILED: entity lookup failed for '${canonical}': ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const claimedFamily = getFamily(predicate);

  let exactPath: TypedEdgeRow[] = [];
  try {
    exactPath = engine.path(subject, object, { predicateFilter: [predicate], maxDepth: 16 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('PATH_BOUNDED')) throw e;
    throw new VerifyError('VERIFY_PATH_FAILED', `VERIFY_PATH_FAILED: engine.path failed for ${subject}->${object} predicate=${predicate}: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (exactPath.length > 0) {
    for (const edge of exactPath) {
      if (!edge.evidence_quote || edge.evidence_quote.trim().length === 0) {
        return {
          verdict: 'REFUSED',
          reason: `REFUSED: edge ${edge.src_canonical}->${edge.dst_canonical} predicate=${edge.predicate} has empty evidence_quote — evidence mandatory (MC-B-02)`,
          path: [],
          gaps: [{ from: subject, to: object, predicate, closed: false, meaning: `TRACE_GAP: edge evidence missing for ${edge.src_canonical}->${edge.dst_canonical}` }],
          confidence,
          isInference,
        };
      }
    }
    const flagged = isInference ? ' INFERENCE_FLAGGED' : '';
    return {
      verdict: 'ACCEPTED',
      reason: `ACCEPTED: path validates against typed_edges (${exactPath.length} hop(s)) predicate=${predicate} family=${claimedFamily}${flagged} confidence=${confidence}`,
      path: exactPath,
      gaps: [],
      confidence,
      isInference,
    };
  }

  let fallbackPath: TypedEdgeRow[] = [];
  try {
    fallbackPath = engine.path(subject, object, { maxDepth: 16 });
  } catch (e: unknown) {
    throw new VerifyError('VERIFY_PATH_FAILED', `VERIFY_PATH_FAILED: fallback path failed for ${subject}->${object}: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (fallbackPath.length > 0) {
    const actualFamilies = new Set(fallbackPath.map((e) => getFamily(e.predicate) ?? 'unknown'));
    const actualPreds = fallbackPath.map((e) => e.predicate).join('/');
    const isAdjacencyViolation = claimedFamily === 'sro' && actualFamilies.has('wiring');
    if (isAdjacencyViolation) {
      return {
        verdict: 'REFUSED',
        reason: `REFUSED: adjacency is NOT causation — claimed predicate '${predicate}' family=${claimedFamily} but graph path uses predicate(s) '${actualPreds}' family=${[...actualFamilies].join(',')} — a '${fallbackPath[0].predicate}' edge is never presented as '${predicate}' (L7 law)`,
        path: [],
        gaps: [{ from: subject, to: object, predicate, closed: false, meaning: `TRACE_GAP: adjacency-not-causation — path exists via '${actualPreds}' (${[...actualFamilies].join(',')}) but not via '${predicate}' (${claimedFamily}) — the predicate families carry the distinction` }],
        confidence,
        isInference,
        adjacencyViolation: true,
      };
    }
    return {
      verdict: 'TRACE_GAP',
      reason: `TRACE_GAP: no path for predicate '${predicate}' from '${subject}' to '${object}' — alternative path via '${actualPreds}' exists but predicate mismatch, named missing structure is predicate '${predicate}'`,
      path: [],
      gaps: [{ from: subject, to: object, predicate, closed: false, meaning: `TRACE_GAP: missing predicate '${predicate}' edge from '${subject}' to '${object}' — graph has '${actualPreds}' but not '${predicate}'` }],
      confidence,
      isInference,
      adjacencyViolation: false,
    };
  }

  return {
    verdict: 'TRACE_GAP',
    reason: `TRACE_GAP: no path from '${subject}' to '${object}' for predicate '${predicate}' — the graph cannot answer, missing structure is the edge '${predicate}' from '${subject}' to '${object}'`,
    path: [],
    gaps: [{ from: subject, to: object, predicate, closed: false, meaning: `TRACE_GAP: empty path for declared relation '${predicate}' from '${subject}' to '${object}' — the graph cannot answer, the missing structure is named (MC-B-08)` }],
    confidence,
    isInference,
  };
}
