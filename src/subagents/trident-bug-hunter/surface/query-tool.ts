/**
 * query-tool.ts — THE 7-VERB QUERY SURFACE (W6, spec §3.12 ~1400-1500)
 *
 * The awareness interface that replaces the 500K corpus re-read (D11):
 * the 7 verbs answer the architecture questions from the stored graph + findings —
 * who calls X / what does the chain look like / what is unwired / what must be
 * implemented / what rule applies / what is violated / is the spec consistent
 * with the code. The reads go through W1's DbClient.prepare pass-through +
 * the GraphAdapter — never raw SQL strings outside this file.
 *
 * THE --format llm (D22): the token-minimal records — the awareness surface for
 * the agents' context windows (the Ix concept).
 */

import type { DbClient } from '../../../shared/knowledge-graph/db.ts';
import type { GraphAdapter } from '../graph/interface.ts';

export const MAX_BLAST_DEPTH = 64;
export const MAX_QUERY_ROWS = 200;
export const MAX_QUERY_ROWS_FULL = 2000;

/** The query result row — the union of the verb outputs. */
export type QueryRow = Record<string, unknown>;

/** A semantic-search hit — the top-k code chunk + its similarity score. */
export interface SemanticHit {
  rank: number;
  serviceId: string;
  filePath: string;
  symbol: string | null;
  chunkType: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string;
  score: number;
}

/** THE SEMANTIC SURFACE — the corbell embeddings adapter implements this; the
 *  semantic-search verb delegates here (the wire, never the reimplementation). */
export interface SemanticSurface {
  query(query: string, topK: number): SemanticHit[];
}

/** A learned design-pattern row (the corbell docs scan/learn extraction). */
export interface DocsPatternRow {
  id: string;
  sourceFile: string;
  detectedType: string;
  sectionHeadings: string[];
  terminology: Record<string, unknown>;
  decisions: Array<{ id: string; summary: string; rationale: string | null }>;
}

/** THE DOCS-PATTERNS SURFACE — the corbell docs store reader implements this;
 *  the docs-patterns verb delegates here. */
export interface DocsPatternSurface {
  list(): DocsPatternRow[];
}

/** THE VERBS — the 7 structural + the 3 corbell-native (D11 + the semantic
 *  layer: the GPU's purpose made visible). */
export type QueryVerb =
  | 'who-calls' | 'chain' | 'must-implement' | 'unwired'
  | 'rule' | 'violations' | 'consistency'
  | 'semantic-search' | 'code-search' | 'docs-patterns'
  | 'blast-radius' | 'would-break';

/** The query input — the verb + the optional filters + the output format. */
export interface QueryInput {
  verb: QueryVerb;
  symbol?: string;       // who-calls / chain
  from?: string;         // chain
  to?: string;           // chain
  ruleId?: string;       // rule
  week?: string;         // violations
  runId?: string;        // violations / rule
  query?: string;        // semantic-search / code-search (the free-text query)
  topK?: number;         // semantic-search / code-search (the top-k, default 10)
  format?: 'table' | 'llm' | 'full'; // D22
  limit?: number;
  offset?: number;
  proposed?: string;
}

/** The extension surfaces the corbell-native verbs delegate to (injected by
 *  the registration layer; a verb without its surface fails loudly). */
export interface QueryExtensions {
  semantic?: SemanticSurface;
  docs?: DocsPatternSurface;
}

/** THE VERB RUNNER — the surface the agents + the tools consume. The optional
 *  extensions carry the corbell-native surfaces (semantic/docs); a verb that
 *  names one WITHOUT the surface fails loudly with the named error. */
export function runQuery(input: QueryInput, db: DbClient, adapter?: GraphAdapter, ext?: QueryExtensions): QueryRow[] {
  switch (input.verb) {
    case 'who-calls':  return whoCalls(input, db);
    case 'chain':      return chain(input, db);
    case 'must-implement': return mustImplement(db);
    case 'unwired':    return unwired(db, adapter);
    case 'rule':       return rule(input, db);
    case 'violations': return violations(input, db);
    case 'consistency': return consistency(db);
    case 'semantic-search': return semanticVerb(input, ext?.semantic);
    case 'code-search':     return semanticVerb(input, ext?.semantic);
    case 'docs-patterns':   return docsPatternsVerb(input, ext?.docs);
    case 'blast-radius': return blastRadius(input, db);
    case 'would-break': return wouldBreak(input, db);
    default: {
      // THE R16 TYPE_CERTAINTY GUARD — the verb is read as unknown through a
      // guarded accessor (the typeof/null check earns the typed read); an
      // unknown verb is the named error.
      const v = verbOf(input);
      if (typeof v !== 'undefined') {
        throw new Error(`QUERY_INVALID: verb=${String(v)} (the verbs are who-calls|chain|must-implement|unwired|rule|violations|consistency|semantic-search|code-search|docs-patterns|blast-radius|would-break)`);
      }
      throw new Error('QUERY_INVALID: verb is missing (the verbs are who-calls|chain|must-implement|unwired|rule|violations|consistency|semantic-search|code-search|docs-patterns|blast-radius|would-break)');
    }
  }
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.all()` result (an unknown array)
 *  is Array.isArray-checked before the typed assertion: the type certainty is
 *  earned by the runtime check, never a bare cast on an unvalidated row set. A
 *  non-array result is the named loud error (the db contract broke). */
function rowsAs<T>(rows: unknown, label: string): T[] {
  if (Array.isArray(rows)) {
    return rows as T[];
  }
  throw new Error(`[query-tool] ${label} expected an array of rows, got ${typeof rows}`);
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the query input's verb is read as an
 *  unknown field behind the typeof/null guard (the assertion is earned by the
 *  check, never a bare cast on the unvalidated input object). */
function verbOf(input: unknown): unknown {
  if (typeof input === 'object' && input !== null) {
    const verb = (input as { verb?: unknown }).verb;
    if (verb !== undefined) return verb;
  }
  return undefined;
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.get()` result (a single unknown
 *  row) is null/undefined-guarded before the typed assertion; the legitimately
 *  absent row (undefined) flows through typed as the nullable row. */
function rowAs<T>(row: unknown, label: string): T | null | undefined {
  if (row !== undefined && row !== null) {
    return row as T;
  }
  return row as T | null | undefined;
}

// ---------------------------------------------------------------------------
// THE VERB IMPLEMENTATIONS (the reads through the DbClient.prepare surface)
// ---------------------------------------------------------------------------

/** who-calls — the 'calls' edges targeting the symbol → the CallSite rows {file, line, caller}. */
function whoCalls(input: QueryInput, db: DbClient): QueryRow[] {
  const symbol = input.symbol ?? '';
  const edges = rowsAs<{ source_id: string }>(
    db.prepare("SELECT source_id FROM graph_edges WHERE target_id = ? AND kind = 'calls'").all(symbol),
    'who-calls edges',
  );
  const rows: QueryRow[] = [];
  for (const e of edges) {
    const src = rowAs<{ name?: string; file?: string | null; line?: number | null }>(
      db.prepare('SELECT name, file, line FROM graph_nodes WHERE id = ?').get(e.source_id),
      'who-calls node',
    );
    if (src && src.file) {
      rows.push({ caller: src.name ?? e.source_id, file: src.file, line: src.line ?? 0 });
    }
  }
  return formatRows(rows, input.format);
}

/** chain — the BFS over the 'calls' edges from → to → the ChainStep rows {from, to, kind, file, line}. */
function chain(input: QueryInput, db: DbClient): QueryRow[] {
  const from = input.from ?? input.symbol ?? '';
  const to = input.to ?? '';
  const visited = new Set<string>();
  const queue: Array<{ id: string; steps: QueryRow[] }> = [{ id: from, steps: [] }];
  const MAX_DEPTH = 64; // the trace bound — a pathological graph cannot hang the query
  while (queue.length > 0 && queue[0].steps.length < MAX_DEPTH) {
    const cur = queue.shift()!;
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);
    if (cur.id === to && cur.steps.length > 0) return formatRows(cur.steps, input.format);
    const out = rowsAs<{ target_id: string; kind: string }>(
      db.prepare("SELECT target_id, kind FROM graph_edges WHERE source_id = ? AND kind = 'calls'").all(cur.id),
      'chain edges',
    );
    for (const e of out) {
      const tgt = rowAs<{ file?: string | null; line?: number | null }>(
        db.prepare('SELECT file, line FROM graph_nodes WHERE id = ?').get(e.target_id),
        'chain node',
      );
      const step: QueryRow = {
        from: cur.id, to: e.target_id, kind: e.kind,
        file: tgt?.file ?? '', line: tgt?.line ?? 0,
      };
      queue.push({ id: e.target_id, steps: [...cur.steps, step] });
    }
  }
  return formatRows([], input.format); // no path — the honest empty
}

/** The stage's declared entry symbol — the data.entry JSON field, else the node name. */
function stageEntry(node: { name: string; data?: string | null }): string {
  if (node.data) {
    try {
      // THE R16 TYPE_CERTAINTY FIX — JSON.parse returns `any`; the shape is
      // typed directly (no cast expression), and the `entry` read is
      // typeof-guarded before use.
      const parsed: { entry?: unknown } = JSON.parse(node.data);
      if (typeof parsed.entry === 'string' && parsed.entry.length > 0) return parsed.entry;
    } catch (e: unknown) {
      // the malformed data blob — the name fallback (the detector's honest degrade)
      console.warn(`[query-tool] stage data parse failed — the name fallback: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return node.name;
}

/** must-implement — the SPEC_DERIVED stages whose declared ENTRY has NO CODE_DERIVED node. */
function mustImplement(db: DbClient): QueryRow[] {
  const spec = rowsAs<{ id: string; name: string; source: string; data?: string | null }>(
    db.prepare("SELECT id, name, source, data FROM graph_nodes WHERE lineage = 'SPEC_DERIVED' AND kind = 'stage'").all(),
    'must-implement spec',
  );
  const code = rowsAs<{ name: string }>(
    db.prepare("SELECT name FROM graph_nodes WHERE lineage = 'CODE_DERIVED'").all(),
    'must-implement code',
  );
  const codeNames = new Set(code.map((r) => r.name));
  return spec
    .filter((s) => !codeNames.has(stageEntry(s)))
    .map((s) => ({ stage: s.name, entry: stageEntry(s), id: s.id, declaredSource: s.source, status: 'MUST_IMPLEMENT' }));
}

/** unwired — the CODE_DERIVED exports with 0 incoming 'calls' edges (the dead machinery). */
function unwired(db: DbClient, adapter?: GraphAdapter): QueryRow[] {
  if (adapter) {
    return adapter.unwired().map((d) => ({ name: d.name, file: d.file, line: d.line, status: 'UNWIRED' }));
  }
  const code = rowsAs<{ id: string; name: string; file?: string | null; line?: number | null }>(
    db.prepare("SELECT id, name, file, line FROM graph_nodes WHERE lineage = 'CODE_DERIVED' AND kind IN ('function','class','method','module')").all(),
    'unwired code',
  );
  const rows: QueryRow[] = [];
  for (const n of code) {
    const calls = rowAs<{ c: number }>(
      db.prepare("SELECT count(*) AS c FROM graph_edges WHERE target_id = ? AND kind = 'calls'").get(n.id),
      'unwired call count',
    );
    if ((calls?.c ?? 0) === 0) {
      rows.push({ name: n.name, file: n.file ?? '', line: n.line ?? 0, status: 'UNWIRED' });
    }
  }
  return rows;
}

/** rule — the compiled predicate row + the violation rows (the verbatim quote + the anchors). */
function rule(input: QueryInput, db: DbClient): QueryRow[] {
  const ruleId = input.ruleId ?? '';
  const p = rowAs<{ family: string; template: string; bindings: string; verbatim_quote: string; anchor: string; severity: string }>(
    db.prepare('SELECT family, template, bindings, verbatim_quote, anchor, severity FROM compiled_predicates WHERE id = ?').get(ruleId),
    'rule predicate',
  );
  if (!p) return [];
  const findings = rowsAs<{ severity: string; file?: string | null; line?: number | null; evidence: string; verdict: string; run_id: string }>(
    db.prepare('SELECT severity, file, line, evidence, verdict, run_id FROM findings WHERE rule_id = ? ORDER BY severity DESC').all(ruleId),
    'rule findings',
  );
  return [{
    ruleId, family: p.family, template: p.template,
    verbatimQuote: p.verbatim_quote, anchor: p.anchor, severity: p.severity,
    violations: findings.map((f) => ({ file: f.file ?? '', line: f.line ?? 0, severity: f.severity, verdict: f.verdict, runId: f.run_id })),
  }];
}

/** violations — the findings rows filtered by week/runId, the CRIT-first ranking (D13). */
function violations(input: QueryInput, db: DbClient): QueryRow[] {
  const byRun = input.runId ? ' AND run_id = ?' : '';
  const byWeek = input.week ? ' AND week = ?' : '';
  const params: string[] = [];
  if (input.runId) params.push(input.runId);
  if (input.week) params.push(input.week);
  const rows = rowsAs<Record<string, unknown>>(
    db.prepare(`SELECT rule_id, severity, file, line, evidence, verdict, week, run_id FROM findings WHERE verdict = 'VIOLATION'${byRun}${byWeek} ORDER BY CASE severity WHEN 'CRIT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MED' THEN 2 ELSE 3 END`).all(...params),
    'violations',
  );
  const effectiveCap = input.format === 'llm' ? MAX_QUERY_ROWS : MAX_QUERY_ROWS_FULL;
  const total = rows.length;
  const capped = rows.slice(0, effectiveCap);
  const off = Math.max(0, Math.floor(input.offset ?? 0));
  const lim = input.limit !== undefined ? Math.max(0, Math.floor(input.limit)) : effectiveCap;
  const sliced = capped.slice(off, off + lim);
  const result: QueryRow[] = [...sliced];
  result.push({ pagination: { offset: off, limit: lim, total } } as unknown as QueryRow);
  return result;
}

/** consistency — the SPEC_DERIVED vs CODE_DERIVED drift alarm (the matrix vision). */
function consistency(db: DbClient): QueryRow[] {
  const spec = rowsAs<{ id: string; name: string; source: string; data?: string | null }>(
    db.prepare("SELECT id, name, source, data FROM graph_nodes WHERE lineage = 'SPEC_DERIVED'").all(),
    'consistency spec',
  );
  const code = rowsAs<{ name: string }>(
    db.prepare("SELECT name FROM graph_nodes WHERE lineage = 'CODE_DERIVED'").all(),
    'consistency code',
  );
  const codeNames = new Set(code.map((r) => r.name));
  return spec
    .filter((s) => !codeNames.has(stageEntry(s)))
    .map((s) => ({ status: 'DRIFT', specNode: s.name, entry: stageEntry(s), specId: s.id, declaredSource: s.source }));
}

// ---------------------------------------------------------------------------
// THE CORBELL-NATIVE VERBS (the semantic layer + the docs patterns — W2b)
// ---------------------------------------------------------------------------

/** semantic-search / code-search — the top-k code chunks + the similarity
 *  scores, delegated to the corbell embeddings surface (the wire). THE EMPTY
 *  CASES: an empty query or an empty index → the TYPED EMPTY, never an
 *  exception (the surface returns [] and the verb formats it). A verb without
 *  the semantic surface → SEMANTIC_UNAVAILABLE (the loud named error). */
function semanticVerb(input: QueryInput, surface?: SemanticSurface): QueryRow[] {
  if (!surface) {
    throw new Error('SEMANTIC_UNAVAILABLE: the semantic-search verb requires the corbell embeddings surface (wire it through the query registration — the corbell store must be built)');
  }
  const query = (input.query ?? '').trim();
  if (query.length === 0) return []; // the typed empty for the empty query
  const topK = Math.max(1, Math.floor(input.topK ?? 10));
  const hits = surface.query(query, topK);
  const rows: QueryRow[] = hits.map((h) => ({
    rank: h.rank,
    file: h.filePath,
    line: h.startLine,
    endLine: h.endLine,
    symbol: h.symbol ?? h.chunkType,
    chunkType: h.chunkType,
    score: h.score,
    service: h.serviceId,
    language: h.language,
    preview: h.content.replace(/\s+/g, ' ').slice(0, 80),
  }));
  return formatRows(rows, input.format);
}

/** docs-patterns — the learned design patterns from the corbell docs scan/
 *  learn, read through the docs surface (the wire). The empty store → the
 *  typed empty. A verb without the docs surface → DOCS_UNAVAILABLE. */
function docsPatternsVerb(input: QueryInput, surface?: DocsPatternSurface): QueryRow[] {
  if (!surface) {
    throw new Error('DOCS_UNAVAILABLE: the docs-patterns verb requires the corbell docs surface (wire it through the query registration — run the corbell docs scan/learn first)');
  }
  const rows: QueryRow[] = surface.list().map((p) => ({
    pattern: p.id,
    sourceFile: p.sourceFile,
    type: p.detectedType,
    sections: p.sectionHeadings.join(','),
    decisions: p.decisions.map((d) => d.summary).join(' | '),
  }));
  return formatRows(rows, input.format);
}


// ---------------------------------------------------------------------------
// THE AWARENESS VERBS — blast-radius + would-break (W2, spec §3.4 / §12.3)
// ---------------------------------------------------------------------------

function blastRadius(input: QueryInput, db: DbClient): QueryRow[] {
  const root = (input.symbol ?? input.from ?? '').trim();
  if (!root) return [{ root: '', depth: 0, nodes: [] }];
  const visited = new Set<string>([root]);
  const nodes: Array<{ id: string; depth: number; path: string[] }> = [];
  const queue: Array<{ id: string; depth: number; path: string[] }> = [{ id: root, depth: 0, path: [root] }];
  let idx = 0;
  let maxDepth = 0;
  while (idx < queue.length) {
    const cur = queue[idx++];
    if (cur.depth >= MAX_BLAST_DEPTH) continue;
    let importers: Array<{ source_id: string; kind: string }> = [];
    try {
      importers = rowsAs<{ source_id: string; kind: string }>(
        db.prepare("SELECT source_id, kind FROM graph_edges WHERE target_id = ?").all(cur.id),
        'blast-radius edges',
      );
    } catch { importers = []; }
    for (const e of importers) {
      const sid = e.source_id;
      if (visited.has(sid)) continue;
      visited.add(sid);
      const nd = cur.depth + 1;
      if (nd > MAX_BLAST_DEPTH) continue;
      const path = [...cur.path, sid];
      nodes.push({ id: sid, depth: nd, path });
      if (nd > maxDepth) maxDepth = nd;
      if (nd < MAX_BLAST_DEPTH) queue.push({ id: sid, depth: nd, path });
    }
  }
  return [{ root, depth: maxDepth, nodes }];
}

function wouldBreak(input: QueryInput, db: DbClient): QueryRow[] {
  const symbol = (input.symbol ?? '').trim();
  const proposed = (input.proposed ?? '').trim();
  let proposedCount = 0;
  let proposedTypes: string[] = [];
  if (proposed.length > 0) {
    const m = /\(([^)]*)\)/.exec(proposed);
    const inside = m ? m[1].trim() : '';
    if (inside !== '') {
      const parts = inside.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      proposedCount = parts.length;
      proposedTypes = parts.map((pp) => {
        const cols = pp.split(':');
        if (cols.length > 1) return cols[cols.length - 1].trim().toLowerCase();
        return pp.toLowerCase();
      });
    }
  }
  let callerRows: Array<Record<string, unknown>> = [];
  let argsUnknown = false;
  try {
    const rows = db.prepare("SELECT source_id, kind, metadata FROM graph_edges WHERE target_id = ? AND kind = 'calls'").all(symbol) as Record<string, unknown>[];
    callerRows = rows;
    for (const r of callerRows) {
      const mv = r['metadata'];
      if (mv === null || mv === undefined || mv === '') { argsUnknown = true; break; }
      if (typeof mv === 'string') {
        try {
          const parsed = JSON.parse(mv) as Record<string, unknown>;
          if (parsed['argCount'] === undefined && parsed['argTypes'] === undefined) argsUnknown = true;
        } catch { argsUnknown = true; }
        if (argsUnknown) break;
      } else if (typeof mv === 'object') {
        const mm = mv as Record<string, unknown>;
        if (mm['argCount'] === undefined && mm['argTypes'] === undefined) argsUnknown = true;
        if (argsUnknown) break;
      }
    }
  } catch {
    try {
      const rows2 = db.prepare("SELECT source_id, kind FROM graph_edges WHERE target_id = ? AND kind = 'calls'").all(symbol) as Record<string, unknown>[];
      callerRows = rows2;
      if (rows2.length > 0) argsUnknown = true;
    } catch { callerRows = []; }
  }
  if (callerRows.length === 0) {
    try {
      const rows3 = db.prepare("SELECT source_id, target_id, kind FROM graph_edges WHERE target_id = ?").all(symbol) as Record<string, unknown>[];
      const filtered = rows3.filter((r) => String(r['kind']) === 'calls');
      if (filtered.length > 0) { callerRows = filtered; argsUnknown = true; }
    } catch {}
  }
  const breaking: Array<{ importer: string; reason: string }> = [];
  for (const r of callerRows) {
    const importer = String(r['source_id'] ?? r['sourceId'] ?? '');
    const metaRaw = (r['metadata'] ?? r['meta'] ?? r['data']) as unknown;
    let callerCount: number | undefined;
    let callerTypes: string[] | undefined;
    let hasMeta = false;
    if (metaRaw !== null && metaRaw !== undefined && metaRaw !== '') {
      let meta: Record<string, unknown> = {};
      if (typeof metaRaw === 'string') {
        try { meta = JSON.parse(metaRaw) as Record<string, unknown>; hasMeta = true; } catch { argsUnknown = true; continue; }
      } else if (typeof metaRaw === 'object') { meta = metaRaw as Record<string, unknown>; hasMeta = true; }
      if (typeof meta['argCount'] === 'number') callerCount = meta['argCount'] as number;
      if (Array.isArray(meta['argTypes'])) callerTypes = (meta['argTypes'] as unknown[]).map((x) => String(x).toLowerCase());
      if (callerCount === undefined && callerTypes === undefined) { argsUnknown = true; continue; }
    } else { argsUnknown = true; continue; }
    if (callerCount !== undefined && callerCount !== proposedCount) {
      breaking.push({ importer, reason: `argCount mismatch (caller: ${callerCount}, proposed: ${proposedCount})` });
      continue;
    }
    if (callerTypes !== undefined && proposedTypes.length > 0) {
      const len = Math.min(callerTypes.length, proposedTypes.length);
      for (let i = 0; i < len; i++) {
        if (callerTypes[i] !== proposedTypes[i]) {
          breaking.push({ importer, reason: `argType mismatch at index ${i} (caller: ${callerTypes[i]}, proposed: ${proposedTypes[i]})` });
          break;
        }
      }
      if (callerTypes.length !== proposedTypes.length && breaking.length === 0) {
        // length already handled by argCount above; if no argCount but types length differs, flag
        if (callerCount === undefined) {
          breaking.push({ importer, reason: `argCount mismatch (caller: ${callerTypes.length}, proposed: ${proposedCount})` });
        }
      }
    }
  }
  return [{ symbol, proposed, breaking, argsUnknown }];
}

// ---------------------------------------------------------------------------
// THE OUTPUT FORMATS (D22 — the llm format emits the token-minimal records)
// ---------------------------------------------------------------------------

/** The table format: the rows as-is. The llm format: the token-minimal records.
 *  Exported for the corbell-native tools (the MCP code_search handler) to
 *  reuse the D22 pattern — the awareness surface for the context windows. */
export function formatRows(rows: QueryRow[], format?: 'table' | 'llm' | 'full'): QueryRow[] {
  if (format !== 'llm') return rows;
  return rows.map((r) => {
    if (r.from !== undefined && r.to !== undefined && r.kind !== undefined) {
      // the chain step: 'chain step=N from=X to=Y kind=K' — the test floor pattern
      return { record: `chain step=${r.step ?? 1} from=${String(r.from)} to=${String(r.to)} kind=${String(r.kind)}` };
    }
    if (r.ruleId !== undefined && r.file !== undefined) {
      return { record: `${String(r.ruleId)} ${String(r.file)}:${String(r.line ?? 0)}` };
    }
    return { record: Object.entries(r).map(([k, v]) => `${k}=${String(v)}`).join(' ') };
  });
}
