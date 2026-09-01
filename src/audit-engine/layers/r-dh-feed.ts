// SPEC-A §2.7 R-DH-FEED (replaces R24) + SPEC-B §2.8 — hunter findings as candidates for second aether pass
// Silent without graph (isBatchBActive false → 0). Active: loads shared.db findings rows as LayerCandidate[].
// The second brief re-adjudicates these with the specs + graph neighborhood (cluster>=5 magic dead — agent judges).
import type { AnalysisContext } from '../types.ts';
import { isBatchBActive } from './activation.ts';

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

export interface HunterFindingRow {
  readonly rule_id: string;
  readonly severity: string;
  readonly file: string | null;
  readonly line: number | null;
  readonly evidence: string;
}

function resolveTargetPath(ctx: unknown): string {
  try {
    const c = ctx as Record<string, unknown>;
    if (typeof c['projectRoot'] === 'string' && (c['projectRoot'] as string).length > 0) return c['projectRoot'] as string;
  } catch (e: unknown) { console.error('[r-dh-feed] resolveTargetPath failed', e instanceof Error ? e.message : String(e)); }
  return '';
}

function extractFindingsFromGraph(graph: unknown): HunterFindingRow[] {
  if (!graph || typeof graph !== 'object') return [];
  const handle = (graph as unknown as { db?: unknown }).db;
  if (handle && typeof (handle as Record<string, unknown>)['prepare'] === 'function') {
    try {
      const db = handle as { prepare: (sql: string) => { all: (...p: unknown[]) => Record<string, unknown>[] } };
      const rows = db.prepare('SELECT rule_id, severity, file, line, evidence FROM findings LIMIT 200').all() as Record<string, unknown>[];
      const out: HunterFindingRow[] = [];
      for (const r of rows) {
        try {
          const rid = typeof r['rule_id'] === 'string' ? (r['rule_id'] as string).trim() : '';
          if (!rid) continue;
          const ev = typeof r['evidence'] === 'string' ? (r['evidence'] as string).trim() : '';
          if (!ev) continue;
          out.push({ rule_id: rid, severity: typeof r['severity'] === 'string' ? (r['severity'] as string) : 'MED', file: typeof r['file'] === 'string' ? (r['file'] as string) : null, line: typeof r['line'] === 'number' ? (r['line'] as number) : null, evidence: ev });
        } catch (err: unknown) { console.error('[r-dh-feed] row map failed', err instanceof Error ? err.message : String(err)); }
      }
      if (out.length > 0) return out;
    } catch (e: unknown) { console.error('[r-dh-feed] graph.db findings query failed', e instanceof Error ? e.message : String(e)); }
  }
  const arr = (graph as unknown as { findings?: unknown }).findings;
  if (Array.isArray(arr)) {
    const out: HunterFindingRow[] = [];
    for (const item of arr) {
      try {
        if (!item || typeof item !== 'object') continue;
        const r = item as Record<string, unknown>;
        const rid = typeof r['rule_id'] === 'string' ? (r['rule_id'] as string).trim() : (typeof r['ruleId'] === 'string' ? (r['ruleId'] as string).trim() : '');
        if (!rid) continue;
        const ev = typeof r['evidence'] === 'string' ? (r['evidence'] as string).trim() : '';
        if (!ev) continue;
        out.push({ rule_id: rid, severity: typeof r['severity'] === 'string' ? (r['severity'] as string) : 'MED', file: typeof r['file'] === 'string' ? (r['file'] as string) : (typeof r['filePath'] === 'string' ? (r['filePath'] as string) : null), line: typeof r['line'] === 'number' ? (r['line'] as number) : null, evidence: ev });
      } catch (err: unknown) { console.error('[r-dh-feed] array findings map failed', err instanceof Error ? err.message : String(err)); }
    }
    if (out.length > 0) return out;
  }
  return [];
}

function findingsFromHandle(graph: unknown): HunterFindingRow[] {
  const viaGraph = extractFindingsFromGraph(graph);
  if (viaGraph.length > 0) return viaGraph;
  return [];
}

function mapFindingToCandidate(row: HunterFindingRow): LayerCandidate | null {
  try {
    const file = row.file && row.file.trim().length > 0 ? row.file.trim() : row.rule_id;
    const line = row.line !== null && Number.isFinite(row.line) && row.line > 0 ? Math.floor(row.line) : 1;
    const evidenceQuote = row.evidence.trim().slice(0, 200);
    if (evidenceQuote.length === 0) return null;
    const lower = row.rule_id.toLowerCase();
    let predicate: LayerCandidate['predicate'] = 'violates';
    let object: LayerCandidate['object'] = 'Contract';
    if (lower.includes('lexicon') || lower.includes('pattern')) { predicate = 'violates'; object = 'Lexicon'; }
    else if (lower.includes('actor')) { predicate = 'isButWrong'; object = 'Actor'; }
    else if (lower.includes('machine') || lower.includes('state')) { predicate = 'shouldBe'; object = 'StateMachine'; }
    else if (lower.includes('engine')) { predicate = 'violates'; object = 'Engine'; }
    else if (lower.includes('adapter') || lower.includes('wiring')) { predicate = 'violates'; object = 'Adapter'; }
    return {
      subject: row.rule_id,
      predicate,
      object,
      file,
      line,
      evidenceQuote,
      implicatedSpecClause: `hunter finding ${row.rule_id} re-adjudicated against current specs+code`,
      side: 'SIDE-1',
    };
  } catch (e: unknown) { console.error('[r-dh-feed] mapFindingToCandidate failed', e instanceof Error ? e.message : String(e)); return null; }
}

export function candidates(ctx: AnalysisContext, findings: unknown): LayerCandidate[] {
  const out: LayerCandidate[] = [];
  try {
    if (!ctx || typeof ctx !== 'object') {
      console.error('[r-dh-feed] candidates: ctx null/invalid');
      return out;
    }
    const targetPath = resolveTargetPath(ctx);
    if (!targetPath) {
      console.error('[r-dh-feed] candidates: no projectRoot');
      return out;
    }
    let active = false;
    try { active = isBatchBActive(targetPath); } catch (e: unknown) { console.error('[r-dh-feed] isBatchBActive failed', e instanceof Error ? e.message : String(e)); return out; }
    if (!active) return out;
    if (findings === null || findings === undefined) {
      console.error('[r-dh-feed] candidates: findings null/undefined, silent');
      return out;
    }
    let rows: HunterFindingRow[] = [];
    if (Array.isArray(findings)) {
      if (findings.length === 0) return out;
      const first = findings[0] as unknown;
      if (first && typeof first === 'object' && typeof (first as Record<string, unknown>)['rule_id'] === 'string') {
        rows = findings as HunterFindingRow[];
      } else if (first && typeof first === 'object') {
        rows = findingsFromHandle(findings);
        if (rows.length === 0) {
          const maybeArr = findings as unknown[];
          const mapped: HunterFindingRow[] = [];
          for (const item of maybeArr) {
            try {
              if (!item || typeof item !== 'object') continue;
              const r = item as Record<string, unknown>;
              const rid = typeof r['rule_id'] === 'string' ? (r['rule_id'] as string).trim() : (typeof r['ruleId'] === 'string' ? (r['ruleId'] as string).trim() : (typeof r['subject'] === 'string' ? (r['subject'] as string).trim() : ''));
              if (!rid) continue;
              const ev = typeof r['evidence'] === 'string' ? (r['evidence'] as string).trim() : (typeof r['evidenceQuote'] === 'string' ? (r['evidenceQuote'] as string).trim() : '');
              if (!ev) continue;
              mapped.push({ rule_id: rid, severity: typeof r['severity'] === 'string' ? (r['severity'] as string) : 'MED', file: typeof r['file'] === 'string' ? (r['file'] as string) : null, line: typeof r['line'] === 'number' ? (r['line'] as number) : null, evidence: ev });
            } catch (err: unknown) { console.error('[r-dh-feed] array generic map failed', err instanceof Error ? err.message : String(err)); }
          }
          rows = mapped;
        }
      }
    } else if (typeof findings === 'object') {
      rows = findingsFromHandle(findings);
    } else {
      console.error('[r-dh-feed] candidates: findings not array/object, got', typeof findings);
      return out;
    }
    if (rows.length === 0) return out;
    for (const row of rows) {
      try {
        const c = mapFindingToCandidate(row);
        if (c) out.push(c);
      } catch (err: unknown) { console.error('[r-dh-feed] per-row failed', err instanceof Error ? err.message : String(err)); }
    }
  } catch (e: unknown) {
    console.error('[r-dh-feed] candidates top failed', e instanceof Error ? e.message : String(e));
  }
  return out;
}
