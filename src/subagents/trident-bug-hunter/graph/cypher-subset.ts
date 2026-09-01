import { NODE_TYPES, ALL_PREDICATES, isNodeType, isPredicate } from '../../../shared/knowledge-graph/ontology.ts';

export const PATH_DEPTH_DEFAULT = 16;
export const PATH_DEPTH_MAX = 64;
export const PATH_DEPTH_MIN = 1;

export class SchemaRejectedError extends Error {
  readonly code = 'SCHEMA_REJECTED';
  readonly schema: { nodeTypes: readonly string[]; predicates: readonly string[] };
  readonly badLabel?: string;
  readonly badRelation?: string;
  constructor(message: string, opts: { badLabel?: string; badRelation?: string }) {
    super(message);
    this.name = 'SCHEMA_REJECTED';
    this.badLabel = opts.badLabel;
    this.badRelation = opts.badRelation;
    this.schema = { nodeTypes: NODE_TYPES, predicates: ALL_PREDICATES };
  }
}

export class CypherParseError extends Error {
  readonly code = 'CYPHER_PARSE_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'CYPHER_PARSE_ERROR';
  }
}

export interface CompiledPlan {
  sql: string;
  meaning: string;
  labels: string[];
  relations: string[];
  maxDepth: number;
  rawQuery: string;
  isPathQuery: boolean;
  whereClause?: string;
  returnClause?: string;
}

function clampDepth(d: number | undefined): number {
  if (d === undefined || d === null) return PATH_DEPTH_DEFAULT;
  if (!Number.isFinite(d)) throw new CypherParseError(`CYPHER_PARSE_ERROR: maxDepth must be finite, got ${String(d)}`);
  const n = Math.floor(d);
  if (n < PATH_DEPTH_MIN) throw new CypherParseError(`CYPHER_PARSE_ERROR: maxDepth must be >=${PATH_DEPTH_MIN}, got ${n}`);
  if (n > PATH_DEPTH_MAX) throw new CypherParseError(`CYPHER_PARSE_ERROR: maxDepth ${n} exceeds max ${PATH_DEPTH_MAX} (MC-B-06)`);
  return n;
}

function extractLabels(query: string): string[] {
  const labels: string[] = [];
  const nodeRe = /\(\s*\w*\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(query)) !== null) {
    const lbl = m[1];
    if (lbl && !labels.includes(lbl)) labels.push(lbl);
  }
  return labels;
}

function extractRelations(query: string): string[] {
  const rels: string[] = [];
  const relRe = /\[\s*\w*\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:\*[^\]]*)?\]/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(query)) !== null) {
    const rel = m[1];
    if (rel && !rels.includes(rel)) rels.push(rel);
  }
  return rels;
}

function extractDepth(query: string): number | undefined {
  const depthRe = /\*\s*(\d+)?\s*\.\.\s*(\d+)/;
  const m = query.match(depthRe);
  if (m) {
    const upper = m[2] ? parseInt(m[2], 10) : undefined;
    return upper;
  }
  const starSingleRe = /\*\s*(\d+)\b/;
  const m2 = query.match(starSingleRe);
  if (m2) {
    return parseInt(m2[1], 10);
  }
  if (query.includes('*')) {
    return undefined;
  }
  return 1;
}

function extractWhere(query: string): string | undefined {
  const whereRe = /\bWHERE\b([\s\S]*?)(?:\bRETURN\b|$)/i;
  const m = query.match(whereRe);
  if (m && m[1] && m[1].trim().length > 0) return m[1].trim();
  return undefined;
}

function extractReturn(query: string): string | undefined {
  const retRe = /\bRETURN\b([\s\S]*)$/i;
  const m = query.match(retRe);
  if (m && m[1] && m[1].trim().length > 0) return m[1].trim();
  return undefined;
}

function buildMeaning(labels: string[], relations: string[], maxDepth: number, whereClause: string | undefined, returnClause: string | undefined, isPath: boolean): string {
  const labelPart = labels.length > 0 ? labels.join(' and ') : 'nodes';
  const relPart = relations.length > 0 ? relations.join('/') : 'edges';
  const depthPart = maxDepth === 1 ? 'single hop' : `paths of depth 1..${maxDepth}`;
  const wherePart = whereClause ? ` where ${whereClause}` : '';
  const returnPart = returnClause ? ` return ${returnClause}` : '';
  const causalHint = isPath ? ' (path query preferred for causal question — the SRO shouldBe→caused distinction)' : '';
  return `Find ${depthPart} from ${labelPart} via ${relPart} relations${wherePart}${returnPart}${causalHint}`.trim();
}

function buildCTESql(relations: string[], maxDepth: number, whereClause: string | undefined): string {
  const predList = relations.length > 0 ? relations.map((r) => `'${r}'`).join(', ') : null;
  const predFilter = predList ? `AND predicate IN (${predList})` : '';
  const predFilterE = predList ? `AND e.predicate IN (${predList})` : '';
  const whereSql = whereClause ? ` -- WHERE: ${whereClause.replace(/'/g, "''")}` : '';
  return `WITH RECURSIVE search(src, dst, predicate, evidence_quote, confidence, created_run, superseded_run, depth, path) AS (
  SELECT src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run, 1 as depth, src_canonical || '->' || dst_canonical as path
  FROM typed_edges WHERE 1=1 ${predFilter} AND superseded_run IS NULL${whereSql}
  UNION ALL
  SELECT e.src_canonical, e.dst_canonical, e.predicate, e.evidence_quote, e.confidence, e.created_run, e.superseded_run, s.depth + 1, s.path || '->' || e.dst_canonical
  FROM typed_edges e JOIN search s ON e.src_canonical = s.dst
  WHERE s.depth < ${maxDepth} AND e.superseded_run IS NULL ${predFilterE} AND instr(',' || s.path || ',', ',' || e.dst_canonical || ',') = 0
)
SELECT src as src_canonical, dst as dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run, depth, path FROM search ORDER BY depth ASC LIMIT 1`;
}

export function parseSubsetQuery(query: unknown): CompiledPlan {
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new CypherParseError('CYPHER_PARSE_ERROR: query must be non-empty string');
  }
  const raw = query.trim();
  if (!raw.toUpperCase().includes('MATCH')) {
    throw new CypherParseError('CYPHER_PARSE_ERROR: query must contain MATCH clause (subset grammar: MATCH (a:Label)-[r:REL*1..16]->(b:Label) WHERE ... RETURN ...)');
  }

  const labels = extractLabels(raw);
  const relations = extractRelations(raw);

  for (const lbl of labels) {
    if (!isNodeType(lbl)) {
      throw new SchemaRejectedError(
        `SCHEMA_REJECTED: label '${lbl}' not in ontology. Allowed NodeTypes: ${NODE_TYPES.join(', ')} (mechanical schema-lock at the translator — Z-B1)`,
        { badLabel: lbl }
      );
    }
  }

  for (const rel of relations) {
    if (!isPredicate(rel)) {
      throw new SchemaRejectedError(
        `SCHEMA_REJECTED: relation '${rel}' not in ontology. Allowed predicates: ${ALL_PREDICATES.join(', ')} (mechanical schema-lock — PREDICATES lasme/mpse/sro/wiring)`,
        { badRelation: rel }
      );
    }
  }

  const rawDepth = extractDepth(raw);
  const maxDepth = clampDepth(rawDepth);
  const whereClause = extractWhere(raw);
  const returnClause = extractReturn(raw);
  const isPathQuery = raw.includes('*') || relations.some((r) => ['caused', 'derived_from', 'calls', 'imports', 'declares', 'implements'].includes(r));

  const sql = buildCTESql(relations, maxDepth, whereClause);
  const meaning = buildMeaning(labels, relations, maxDepth, whereClause, returnClause, isPathQuery);

  return {
    sql,
    meaning,
    labels,
    relations,
    maxDepth,
    rawQuery: raw,
    isPathQuery,
    whereClause,
    returnClause,
  };
}

export type TemplateFamily = 'WIRING' | 'CONTRACT' | 'PROVENANCE' | 'DOMAIN' | 'PROCESS';

export interface TemplateMapping {
  templateId: string;
  family: TemplateFamily;
  typedQuery: string;
  method: 'path' | 'entity' | 'community' | 'temporal' | 'vector';
  predicate: string;
  meaning: string;
  exampleCypher: string;
  compiledPlan: CompiledPlan;
}

function compileOrThrow(cypher: string): CompiledPlan {
  try {
    return parseSubsetQuery(cypher);
  } catch (e: unknown) {
    throw new Error(`TEMPLATE_MAPPING_FAILED: cypher=${cypher} error=${e instanceof Error ? e.message : String(e)}`);
  }
}

export const TEMPLATE_QUERY_MAP: Record<string, TemplateMapping> = {
  'wiring.no-dead-module': {
    templateId: 'wiring.no-dead-module',
    family: 'WIRING',
    typedQuery: 'unwired-exports path — find nodes with zero inbound callers via typed_edges predicate=unwired or absence of calls/imports inbound',
    method: 'path',
    predicate: 'unwired',
    meaning: 'Detect dead modules: entities with no incoming calls/imports edges (the unwired predicate family)',
    exampleCypher: 'MATCH (a:Module)-[r:unwired]->(b:File) RETURN a,b',
    compiledPlan: compileOrThrow('MATCH (a:Module)-[r:unwired]->(b:File) RETURN a,b'),
  },
  'wiring.every-export-has-an-importer': {
    templateId: 'wiring.every-export-has-an-importer',
    family: 'WIRING',
    typedQuery: 'export→importer path — every exported Class/Function/Interface must have an inbound imports edge from a Module/File',
    method: 'path',
    predicate: 'imports',
    meaning: 'Every export must have an importer: trace imports predicate from File/Module to the exported node',
    exampleCypher: 'MATCH (a:File)-[r:imports*1..16]->(b:Function) RETURN a,b',
    compiledPlan: compileOrThrow('MATCH (a:File)-[r:imports*1..16]->(b:Function) RETURN a,b'),
  },
  'contract.must-implement': {
    templateId: 'contract.must-implement',
    family: 'CONTRACT',
    typedQuery: 'SpecClause→implementation path via implements/declares — walk every hop from spec clause to its enforcement site (the SHOULD-BE query)',
    method: 'path',
    predicate: 'implements',
    meaning: 'Contract fulfillment: SpecClause declares/implements path to Class/Function/Interface/Contract must exist',
    exampleCypher: 'MATCH (a:SpecClause)-[r:implements*1..16]->(b:Class) RETURN a,b',
    compiledPlan: compileOrThrow('MATCH (a:SpecClause)-[r:implements*1..16]->(b:Class) RETURN a,b'),
  },
  'provenance.traces-to-source': {
    templateId: 'provenance.traces-to-source',
    family: 'PROVENANCE',
    typedQuery: 'provenance chain via derived_from/caused/flagged_by with temporal filter — every target must trace to source',
    method: 'path',
    predicate: 'derived_from',
    meaning: 'Provenance: every target entity must have a derived_from/caused path to its source with temporal run scoping',
    exampleCypher: 'MATCH (a:EvidenceFile)-[r:derived_from*1..16]->(b:Function) RETURN a,b',
    compiledPlan: compileOrThrow('MATCH (a:EvidenceFile)-[r:derived_from*1..16]->(b:Function) RETURN a,b'),
  },
  'provenance.quoted-not-synthesized': {
    templateId: 'provenance.quoted-not-synthesized',
    family: 'PROVENANCE',
    typedQuery: 'evidenceQUOTE temporal verification — the verbatim quote must be present in typed_edges evidence_quote and graph_facts evidence',
    method: 'temporal',
    predicate: 'grounded_through',
    meaning: 'Evidence honesty: the quoted text must be grounded through typed_edges evidence_quote (never synthesized)',
    exampleCypher: 'MATCH (a:EvidenceFile)-[r:grounded_through]->(b:Lexicon) RETURN a,b',
    compiledPlan: compileOrThrow('MATCH (a:EvidenceFile)-[r:grounded_through]->(b:Lexicon) RETURN a,b'),
  },
  'domain.numeric-threshold': {
    templateId: 'domain.numeric-threshold',
    family: 'DOMAIN',
    typedQuery: 'numeric threshold via MPSE predicate family: evaluates_to / contradicts_oracle / unguarded_threshold with community detection for recurring derailment shapes',
    method: 'community',
    predicate: 'evaluates_to',
    meaning: 'Numeric thresholds: Threshold/Contract entities evaluated via MPSE predicates; community finds recurring threshold drift shapes',
    exampleCypher: 'MATCH (a:Threshold)-[r:evaluates_to*1..16]->(b:Contract) RETURN a,b',
    compiledPlan: compileOrThrow('MATCH (a:Threshold)-[r:evaluates_to*1..16]->(b:Contract) RETURN a,b'),
  },
  'process.gates-measure-outputs-not-logic': {
    templateId: 'process.gates-measure-outputs-not-logic',
    family: 'PROCESS',
    typedQuery: 'Gate-node paths via shouldBe/triggers/wraps over Gate/Engine/Machine — the declared stage sequence must be wired in the graph',
    method: 'path',
    predicate: 'shouldBe',
    meaning: 'Process gates: Gate nodes connected via shouldBe/triggers predicates to Engine/Machine — the declared pipeline order must have path edges',
    exampleCypher: 'MATCH (a:Gate)-[r:shouldBe*1..16]->(b:Engine) RETURN a,b',
    compiledPlan: compileOrThrow('MATCH (a:Gate)-[r:shouldBe*1..16]->(b:Engine) RETURN a,b'),
  },
};

export function listTemplateMappings(): TemplateMapping[] {
  return Object.values(TEMPLATE_QUERY_MAP);
}

export function getTemplateMapping(templateId: string): TemplateMapping {
  const m = TEMPLATE_QUERY_MAP[templateId];
  if (!m) throw new CypherParseError(`CYPHER_PARSE_ERROR: unknown templateId ${templateId}`);
  return m;
}
