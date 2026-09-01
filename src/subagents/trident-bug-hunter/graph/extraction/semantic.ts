import { PREDICATE_SET, isPredicate, type Predicate } from '../../../../shared/knowledge-graph/ontology.ts';

export interface SemanticTriple {
  subject: string;
  predicate: Predicate;
  object: string;
  evidence: string;
  confidence: number;
  file: string;
  line: number;
  subjectType?: string;
  objectType?: string;
}

export interface SemanticParseError extends Error {
  code: string;
}

export class SemanticEvidenceMissingError extends Error {
  code = 'SEMANTIC_EVIDENCE_MISSING';
  constructor(detail: string) {
    super(`SEMANTIC_EVIDENCE_MISSING: ${detail} (MC-B-02 — evidence is mandatory)`);
    this.name = 'SEMANTIC_EVIDENCE_MISSING';
  }
}

export class SemanticPredicateInvalidError extends Error {
  code = 'SEMANTIC_PREDICATE_INVALID';
  constructor(predicate: string) {
    super(`SEMANTIC_PREDICATE_INVALID: predicate=${predicate} not in closed ontology vocabulary (MC-B-01)`);
    this.name = 'SEMANTIC_PREDICATE_INVALID';
  }
}

export class SemanticParseFailedError extends Error {
  code = 'SEMANTIC_PARSE_FAILED';
  constructor(detail: string) {
    super(`SEMANTIC_PARSE_FAILED: ${detail}`);
    this.name = 'SEMANTIC_PARSE_FAILED';
  }
}

export interface Prompt1DemandOptions {
  files: string[];
  contracts?: string[];
  specClauses?: string[];
  knownEntities?: string[];
  runId?: string;
  ontologyHint?: string;
}

const C1_C15_SHAPES = [
  'C1: Engine — stateful rule executor with evaluate() and threshold gates',
  'C2: Adapter — boundary translator (imports external, exports internal)',
  'C3: Container — lifecycle owner (holds Engine/Adapter instances)',
  'C4: Lexicon — pattern family with matcher + severity (the detection canon)',
  'C5: Contract — spec clause with shall/must invariant',
  'C6: Threshold — numeric bound with oracle value + tolerance',
  'C7: Gate — boolean guard before phase transition',
  'C8: Machine — state machine with explicit transitions',
  'C9: Actor — role that triggers state transitions',
  'C10: EvidenceFile — provenance anchor for a triple',
  'C11: SpecClause — atomic spec sentence with file:line anchor',
  'C12: Module — file-level cohesion unit',
  'C13: Interface — structural contract (declares shape)',
  'C14: Class — behavior capsule with methods',
  'C15: Function — pure or effectful unit with signature',
];

const PREDICATE_FAMILIES_DOC = [
  'lasme: declares, implements, triggers, violates, shouldBe, wraps',
  'mpse: evaluates_to, contradicts_oracle, grounded_through, unguarded_threshold',
  'sro: caused, derived_from, resolved_to, superseded_by, flagged_by',
  'wiring: calls, imports, awaits, exports, unwired',
].join(' | ');

export function buildPrompt1Demand(opts: Prompt1DemandOptions): string {
  if (!opts || !Array.isArray(opts.files) || opts.files.length === 0) {
    throw new SemanticParseFailedError('buildPrompt1Demand requires non-empty files array');
  }
  for (const f of opts.files) {
    if (typeof f !== 'string' || f.trim().length === 0) {
      throw new SemanticParseFailedError(`buildPrompt1Demand: file entry must be non-empty string, got ${JSON.stringify(f)}`);
    }
  }
  const files = opts.files.map((f) => f.trim()).join('\n- ');
  const contracts = (opts.contracts ?? []).map((c) => `- ${c.trim()}`).join('\n') || '- (no additional contracts — use C1-C15 defaults)';
  const clauses = (opts.specClauses ?? []).map((c) => `- ${c.trim()}`).join('\n') || '- (bind any spec clause you cite to a SpecClause node)';
  const known = (opts.knownEntities ?? []).join(', ') || '(none — fresh extraction)';
  const runId = opts.runId ?? `run-${Date.now()}`;

  return `# SRO PROMPT 1 — SEMANTIC EXTRACTION (B2, SRO Mode 3 Synergized)

You are the SRO semantic extractor. Your input is the file batch below + the C1-C15 contract shapes + the typed ontology. You emit ONLY typed triples.

## TASK
- Role-type each class/function/interface against the C1-C15 shapes (this class IS an Engine by role — not just a Class by syntax).
- Bind every spec-cited invariant to a SpecClause node + declares/implements edge.
- Emit relationship triples with evidence quotes + confidence ∈ [0,1]. Evidence is MANDATORY — every triple carries the verbatim code line or spec quote (MC-B-02).
- Vocabulary is CLOSED — predicate MUST be one of the 20 ontology predicates (MC-B-01). Free-form relations are violations and will be REJECTED at insert.
- Output JSON shape: { "entities": [{ "name": string, "kind": NodeType, "file": string, "line": number, "role": string, "specClause"?: string }], "relations": [{ "subject": string, "predicate": Predicate, "object": string, "evidence": string, "confidence": number, "file": string, "line": number }] }
- Evidence = the exact source line (code) or spec clause text — never empty, never "n/a", never omitted.
- Confidence: 1.0 = verbatim match, 0.8-0.9 = inferred role, <0.7 = uncertain (flag as uncertain, do NOT suppress).

## CLOSED VOCABULARY (ontology.ts)
${PREDICATE_FAMILIES_DOC}
Node types: File, Class, Function, Interface, Module, Machine, Actor, Engine, Adapter, Container, Lexicon, Contract, Threshold, Gate, EvidenceFile, SpecClause

## C1-C15 CONTRACT SHAPES (role typing canon from PLAN A §2.3 detector tables)
${C1_C15_SHAPES.map((s) => `- ${s}`).join('\n')}

## FILE BATCH (runId=${runId})
- ${files}

## KNOWN ENTITIES (existing canonicals — reuse ids when exact match, else propose new)
${known}

## SPEC CLAUSES / CONTRACTS TO BIND
Contracts:
${contracts}
SpecClause anchors:
${clauses}

## OUTPUT CONTRACT — STRICT JSON ONLY
Return a single JSON object with keys "entities" and "relations". No prose before/after. Every relation MUST have non-empty evidence and a predicate from the closed list. A missing evidence or out-of-vocab predicate = REJECTED triple (the insert enforces NOT NULL + CHECK — your bad edge will be REJECTED at the boundary, not silently dropped).

## RESOLUTION NOTE
You do NOT resolve aliasing — that is Prompt 2's job pre-insertion (MC-B-03). Emit the surface forms as observed; the resolver canonicalizes before insert.

## EVIDENCE LAW
The evidence field is NOT optional (SRO article's law + MC-B-02). A triple without evidence = hallucination vector and will be REJECTED by typed_edges.evidence_quote NOT NULL CHECK(length>0).
`;
}

export interface SemanticParseInput {
  entity: string;
  entity_type: string;
  relations: Array<{ predicate: string; object: string; evidence: string; confidence: number; file?: string; line?: number }>;
}

export interface SemanticParseResult {
  triples: SemanticTriple[];
  entities: Array<{ name: string; kind: string; file?: string; line?: number }>;
}

export function parseSemanticTriples(jsonText: string): SemanticTriple[] {
  return parseSemanticPayload(jsonText).triples;
}

export function parseSemanticPayload(jsonText: string): SemanticParseResult {
  if (typeof jsonText !== 'string' || jsonText.trim().length === 0) {
    throw new SemanticParseFailedError('parseSemanticTriples: jsonText is empty or not a string');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e: unknown) {
    throw new SemanticParseFailedError(`invalid JSON — ${e instanceof Error ? e.message : String(e)}`);
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new SemanticParseFailedError('parsed payload must be an object');
  }
  const obj = parsed as Record<string, unknown>;

  const entitiesRaw: unknown[] = Array.isArray(obj.entities) ? obj.entities as unknown[] : [];
  const relationsRaw: unknown[] = Array.isArray(obj.relations) ? obj.relations as unknown[] : Array.isArray(obj.triples) ? obj.triples as unknown[] : [];

  const entities: Array<{ name: string; kind: string; file?: string; line?: number }> = [];
  for (const e of entitiesRaw) {
    if (!e || typeof e !== 'object') continue;
    const rec = e as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : typeof rec.label === 'string' ? String(rec.label).trim() : '';
    if (!name) continue;
    entities.push({ name, kind: typeof rec.kind === 'string' ? rec.kind : typeof rec.entity_type === 'string' ? String(rec.entity_type) : 'Class', file: typeof rec.file === 'string' ? rec.file : undefined, line: typeof rec.line === 'number' ? rec.line : undefined });
  }

  const triples: SemanticTriple[] = [];

  const pushRelation = (subject: string, rel: Record<string, unknown>): void => {
    const predicate = typeof rel.predicate === 'string' ? rel.predicate.trim() : '';
    const object = typeof rel.object === 'string' ? rel.object.trim() : typeof rel.target === 'string' ? String(rel.target).trim() : typeof rel.dst === 'string' ? String(rel.dst).trim() : '';
    const evidence = typeof rel.evidence === 'string' ? rel.evidence : typeof rel.evidence_quote === 'string' ? String(rel.evidence_quote) : '';
    const confidenceRaw = rel.confidence;
    const confidence = typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw) ? confidenceRaw : 0.8;
    const file = typeof rel.file === 'string' ? rel.file : typeof rel.evidence_file === 'string' ? String(rel.evidence_file) : '';
    const line = typeof rel.line === 'number' && Number.isFinite(rel.line) ? rel.line : 0;

    if (!predicate) throw new SemanticParseFailedError(`relation missing predicate for subject=${subject} object=${object}`);
    if (!isPredicate(predicate)) throw new SemanticPredicateInvalidError(predicate);
    if (!object) throw new SemanticParseFailedError(`relation missing object for subject=${subject} predicate=${predicate}`);
    if (!evidence || evidence.trim().length === 0) throw new SemanticEvidenceMissingError(`predicate=${predicate} subject=${subject} object=${object} at ${file}:${line} — evidence is mandatory`);
    if (confidence < 0 || confidence > 1) throw new SemanticParseFailedError(`confidence out of range [0,1]: ${String(confidence)} for ${subject} -[${predicate}]-> ${object}`);
    if (!subject || subject.trim().length === 0) throw new SemanticParseFailedError(`relation missing subject for predicate=${predicate}`);

    triples.push({ subject: subject.trim(), predicate: predicate as Predicate, object: object.trim(), evidence: evidence.trim().slice(0, 500), confidence, file, line, subjectType: undefined, objectType: undefined });
  };

  if (relationsRaw.length > 0 && entitiesRaw.length === 0 && (obj as Record<string, unknown>).relations === undefined && (obj as Record<string, unknown>).entities === undefined) {
    // legacy array-of-relations shape already handled — this branch is for top-level array
  }

  // Primary: top-level relations array (Prompt-1 shape: {entities, relations})
  if (relationsRaw.length > 0) {
    for (const r of relationsRaw) {
      if (!r || typeof r !== 'object') throw new SemanticParseFailedError(`relation entry must be object, got ${typeof r}`);
      const rec = r as Record<string, unknown>;
      const subject = typeof rec.subject === 'string' ? rec.subject.trim() : typeof rec.src === 'string' ? String(rec.src).trim() : '';
      if (!subject) throw new SemanticParseFailedError(`relation missing subject: ${JSON.stringify(r).slice(0, 200)}`);
      pushRelation(subject, rec);
    }
    return { triples, entities };
  }

  // Alternate: per-entity relations embedding { entity, entity_type, relations: [...] }
  // The spec shape: entity/entity_type/relations[{predicate,object,evidence,confidence}]
  if (Array.isArray(obj.entities) || Array.isArray((obj as Record<string, unknown>).items)) {
    const items: unknown[] = Array.isArray(obj.entities) ? obj.entities as unknown[] : Array.isArray((obj as Record<string, unknown>).items) ? (obj as Record<string, unknown>).items as unknown[] : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const entity = typeof rec.entity === 'string' ? rec.entity.trim() : typeof rec.name === 'string' ? String(rec.name).trim() : typeof rec.subject === 'string' ? String(rec.subject).trim() : '';
      const rels: unknown = rec.relations;
      if (!entity || !Array.isArray(rels)) continue;
      for (const rel of rels as unknown[]) {
        if (!rel || typeof rel !== 'object') throw new SemanticParseFailedError(`per-entity relation must be object for entity=${entity}`);
        pushRelation(entity, rel as Record<string, unknown>);
      }
    }
  }

  if (triples.length === 0 && entities.length === 0) {
    const keys = Object.keys(obj).join(',');
    throw new SemanticParseFailedError(`payload has no entities or relations — keys: [${keys}]`);
  }

  return { triples, entities };
}

export function buildSemanticDemand(opts: Prompt1DemandOptions): string {
  return buildPrompt1Demand(opts);
}
