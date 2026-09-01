import type { GraphifyNode, GraphifyEdge } from './types.js';

// SCHEMA DISCOVERY (2026-08-28, D1/D2/D3 RECONCILED bridge-side by the orchestrator after the B-2 audit):
// Real DDL: src/shared/knowledge-graph/migrations.ts:10-30 — TYPED_GRAPH_DDL enforces
//   typed_nodes.kind       CHECK (kind IN NODE_TYPES)          — ontology.ts:1
//   typed_edges.predicate  CHECK (predicate IN ALL_PREDICATES) — ontology.ts:3-10
//   typed_edges.evidence_quote CHECK (length > 0)              — satisfied by explicit:/inferred: prefixes below
// ONTOLOGY RECONCILIATION (the ontology files are outside every wave's write-set — the bridge remaps):
// D1 node fallback: spec's 'Evidence' → 'EvidenceFile' (the ontology's Evidence-class kind)
// D2 edge fallback: spec's 'references' → 'declares' (an ontology lasme predicate; 'references' does not exist)
// D3 property → 'EvidenceFile' (same Evidence-class kind; 'Evidence' is not ontology-valid)
// Insert shapes typed against the REAL DDL columns (migrations.ts:11-30), not the spec shorthand.

export const NODE_TYPE_MAP: Record<string, string> = {
  class: 'Class',
  function: 'Function',
  interface: 'Interface',
  file: 'File',
  module: 'Module',
  method: 'Function',
  property: 'EvidenceFile',
  import: 'Module',
};

export const EDGE_PREDICATE_MAP: Record<string, string> = {
  imports: 'imports',
  calls: 'calls',
  inherits: 'implements',
  uses: 'wraps',
  references: 'declares',
  returns: 'shouldBe',
};

export interface TypedNodeInsert {
  canonical_id: string;
  kind: string;
  label: string;
  file: string | null;
  line: number | null;
  created_run: string;
  superseded_run?: string | null;
}

export interface TypedEdgeInsert {
  src_canonical: string;
  dst_canonical: string;
  predicate: string;
  evidence_quote: string;
  confidence: number;
  created_run: string;
  superseded_run?: string | null;
}

function mapNodeKind(rawType: string): string {
  const key = String(rawType ?? '').toLowerCase().trim();
  return NODE_TYPE_MAP[key] ?? 'EvidenceFile';
}

function mapPredicate(rawRelation: string): string {
  const key = String(rawRelation ?? '').toLowerCase().trim();
  return EDGE_PREDICATE_MAP[key] ?? 'declares';
}

export function transformNode(gfy: GraphifyNode, runId = 'bridge-run'): TypedNodeInsert {
  if (!gfy || typeof gfy !== 'object') throw new Error('CORBELL_BRIDGE_INVALID_NODE: GraphifyNode required');
  if (typeof gfy.id !== 'string' || gfy.id.trim() === '') throw new Error('CORBELL_BRIDGE_INVALID_NODE: id must be non-empty string');
  if (typeof gfy.label !== 'string') throw new Error('CORBELL_BRIDGE_INVALID_NODE: label must be string');
  const kind = mapNodeKind(gfy.type);
  const rawData = (gfy.data ?? {}) as Record<string, unknown>;
  const lineVal = rawData['line'];
  const line = typeof lineVal === 'number' && Number.isFinite(lineVal) ? lineVal : null;
  const fileVal = gfy.file && gfy.file.trim() !== '' ? gfy.file : (typeof rawData['source_file'] === 'string' ? String(rawData['source_file']) : null);
  return {
    canonical_id: gfy.id,
    kind,
    label: gfy.label,
    file: fileVal,
    line,
    created_run: runId,
    superseded_run: null,
  };
}

export function transformEdge(gfy: GraphifyEdge, runId = 'bridge-run'): TypedEdgeInsert {
  if (!gfy || typeof gfy !== 'object') throw new Error('CORBELL_BRIDGE_INVALID_EDGE: GraphifyEdge required');
  if (typeof gfy.src !== 'string' || gfy.src.trim() === '') throw new Error('CORBELL_BRIDGE_INVALID_EDGE: src must be non-empty string');
  if (typeof gfy.dst !== 'string' || gfy.dst.trim() === '') throw new Error('CORBELL_BRIDGE_INVALID_EDGE: dst must be non-empty string');
  if (typeof gfy.relation !== 'string' || gfy.relation.trim() === '') throw new Error('CORBELL_BRIDGE_INVALID_EDGE: relation must be non-empty string');
  const predicate = mapPredicate(gfy.relation);
  const evidence_quote = gfy.confidence === 'EXTRACTED'
    ? `explicit: ${gfy.relation} in source`
    : `inferred: ${gfy.relation} by graphify resolution`;
  if (evidence_quote.length === 0) throw new Error('CORBELL_BRIDGE_EVIDENCE_EMPTY: evidence_quote must satisfy CHECK(length>0)');
  const confidence = gfy.confidence === 'EXTRACTED' ? 1.0 : 0.6;
  return {
    src_canonical: gfy.src,
    dst_canonical: gfy.dst,
    predicate,
    evidence_quote,
    confidence,
    created_run: runId,
    superseded_run: null,
  };
}

export const CorbellBridge = {
  NODE_TYPE_MAP,
  EDGE_PREDICATE_MAP,
  transformNode,
  transformEdge,
};
