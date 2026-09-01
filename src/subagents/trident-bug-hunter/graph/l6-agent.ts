import { parseSubsetQuery } from './cypher-subset.ts';
import type { CompiledPlan } from './cypher-subset.ts';
import { TEMPLATE_QUERY_MAP } from './cypher-subset.ts';
import type { QueryEngine, TypedEdgeRow } from '../../../shared/knowledge-graph/query-engine.ts';
import { isNodeType } from '../../../shared/knowledge-graph/ontology.ts';

export class L6AgentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

export interface L6Target {
  from: string;
  to: string;
  predicate: string;
  fromLabel?: string;
  toLabel?: string;
}

export interface L6Demand {
  question: string;
  targets: L6Target[];
  context?: string;
}

export interface L6Harness {
  engine: QueryEngine;
}

export interface TraceGap {
  from: string;
  to: string;
  predicate: string;
  closed: boolean;
  roundClosed?: number;
  evidence?: string;
  meaning?: string;
}

export interface L6Result {
  subgraph: TypedEdgeRow[];
  gaps: TraceGap[];
  roundsUsed: number;
  budget: number;
  closedCount: number;
  openCount: number;
  terminated: 'CONVERGED' | 'BUDGET_EXHAUSTED';
  meanings: string[];
  plans: CompiledPlan[];
}

export function computeRoundBudget(targetCount: unknown): number {
  if (typeof targetCount !== 'number' || !Number.isFinite(targetCount) || targetCount < 0) {
    throw new L6AgentError('L6_BUDGET_INVALID', `L6_BUDGET_INVALID: targetCount must be finite >=0, got ${String(targetCount)}`);
  }
  const t = Math.floor(targetCount);
  return 2 + Math.ceil(t / 6) + 2;
}

function inferLabel(canonicalId: string): string {
  const maybe = canonicalId.split(':')[0];
  if (maybe && isNodeType(maybe)) return maybe;
  if (maybe && maybe.length > 0 && /^[A-Z][A-Za-z0-9]*$/.test(maybe)) {
    if (isNodeType(maybe)) return maybe;
  }
  return 'Function';
}

function buildCypherForTarget(target: L6Target, depth: number): string {
  const fl = target.fromLabel && isNodeType(target.fromLabel) ? target.fromLabel : inferLabel(target.from);
  const tl = target.toLabel && isNodeType(target.toLabel) ? target.toLabel : inferLabel(target.to);
  const d = Math.max(1, Math.min(64, Math.floor(depth)));
  const depthStr = d === 1 ? '' : `*1..${d}`;
  return `MATCH (a:${fl})-[r:${target.predicate}${depthStr}]->(b:${tl}) WHERE a.canonical_id='${target.from}' AND b.canonical_id='${target.to}' RETURN a,b`;
}

function dedupeEdges(edges: TypedEdgeRow[]): TypedEdgeRow[] {
  const seen = new Set<string>();
  const out: TypedEdgeRow[] = [];
  for (const e of edges) {
    const key = `${e.src_canonical}->${e.dst_canonical}:${e.predicate}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

export async function runL6Loop(demand: unknown, harness: unknown): Promise<L6Result> {
  if (!demand || typeof demand !== 'object') {
    throw new L6AgentError('L6_DEMAND_INVALID', 'L6_DEMAND_INVALID: demand must be object with question and targets');
  }
  const d = demand as Partial<L6Demand>;
  if (typeof d.question !== 'string' || d.question.trim().length === 0) {
    throw new L6AgentError('L6_DEMAND_INVALID', 'L6_DEMAND_INVALID: demand.question must be non-empty string');
  }
  if (!Array.isArray(d.targets)) {
    throw new L6AgentError('L6_DEMAND_INVALID', 'L6_DEMAND_INVALID: demand.targets must be array');
  }
  for (let i = 0; i < d.targets.length; i++) {
    const t = d.targets[i] as unknown;
    if (!t || typeof t !== 'object') throw new L6AgentError('L6_DEMAND_INVALID', `L6_DEMAND_INVALID: targets[${i}] must be object`);
    const tt = t as Record<string, unknown>;
    if (typeof tt['from'] !== 'string' || (tt['from'] as string).trim().length === 0) throw new L6AgentError('L6_DEMAND_INVALID', `L6_DEMAND_INVALID: targets[${i}].from must be non-empty string`);
    if (typeof tt['to'] !== 'string' || (tt['to'] as string).trim().length === 0) throw new L6AgentError('L6_DEMAND_INVALID', `L6_DEMAND_INVALID: targets[${i}].to must be non-empty string`);
    if (typeof tt['predicate'] !== 'string' || (tt['predicate'] as string).trim().length === 0) throw new L6AgentError('L6_DEMAND_INVALID', `L6_DEMAND_INVALID: targets[${i}].predicate must be non-empty string`);
  }

  if (!harness || typeof harness !== 'object') {
    throw new L6AgentError('L6_HARNESS_INVALID', 'L6_HARNESS_INVALID: harness must be object with engine');
  }
  const h = harness as Partial<L6Harness>;
  if (!h.engine || typeof h.engine !== 'object' || typeof (h.engine as unknown as Record<string, unknown>).path !== 'function') {
    throw new L6AgentError('L6_HARNESS_INVALID', 'L6_HARNESS_INVALID: harness.engine must be QueryEngine with path() method');
  }
  const engine = h.engine as QueryEngine;

  const targets = d.targets as L6Target[];
  const budget = computeRoundBudget(targets.length);

  const gaps: TraceGap[] = targets.map((t) => ({
    from: t.from.trim(),
    to: t.to.trim(),
    predicate: t.predicate.trim(),
    closed: false,
  }));

  const subgraph: TypedEdgeRow[] = [];
  const meanings: string[] = [];
  const plans: CompiledPlan[] = [];

  const tryCloseGap = (gap: TraceGap, depth: number): { closed: boolean; edges: TypedEdgeRow[]; plan?: CompiledPlan; meaning?: string } => {
    const cypher = buildCypherForTarget(gap, depth);
    let plan: CompiledPlan | undefined;
    try {
      plan = parseSubsetQuery(cypher);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new L6AgentError('L6_QUERY_REJECTED', `L6_QUERY_REJECTED: plan parse failed for ${gap.from}->${gap.to} predicate=${gap.predicate}: ${msg}`);
    }

    try {
      const edges = engine.path(gap.from, gap.to, { predicateFilter: [gap.predicate], maxDepth: plan.maxDepth });
      if (edges.length > 0) return { closed: true, edges, plan, meaning: plan.meaning };
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('PATH_BOUNDED')) throw e;
      throw new L6AgentError('L6_PATH_FAILED', `L6_PATH_FAILED: engine.path failed for ${gap.from}->${gap.to}: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const fallbackEdges = engine.path(gap.from, gap.to, { maxDepth: plan.maxDepth });
      if (fallbackEdges.length > 0) {
        const hasAlternativeRel = fallbackEdges.some((ed) => ed.predicate !== gap.predicate);
        if (hasAlternativeRel) {
          return { closed: true, edges: fallbackEdges, plan, meaning: `${plan.meaning} — TRACE_GAP closed via alternative predicate path (${fallbackEdges.map((ed) => ed.predicate).join('/')})` };
        }
        if (fallbackEdges.length > 0) return { closed: true, edges: fallbackEdges, plan, meaning: plan.meaning };
      }
    } catch (e: unknown) {
      throw new L6AgentError('L6_PATH_FAILED', `L6_PATH_FAILED: fallback path failed for ${gap.from}->${gap.to}: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { closed: false, edges: [], plan, meaning: plan.meaning };
  };

  let roundsUsed = 0;
  for (let round = 1; round <= budget; round++) {
    roundsUsed = round;
    let anyOpen = false;
    let anyClosedThisRound = false;

    for (const gap of gaps) {
      if (gap.closed) continue;
      anyOpen = true;
      let result: { closed: boolean; edges: TypedEdgeRow[]; plan?: CompiledPlan; meaning?: string };
      try {
        result = tryCloseGap(gap, 16);
      } catch (e: unknown) {
        if (e instanceof L6AgentError) throw e;
        throw new L6AgentError('L6_ROUND_FAILED', `L6_ROUND_FAILED: round ${round} gap ${gap.from}->${gap.to} error: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (result.plan) plans.push(result.plan);
      if (result.meaning) meanings.push(result.meaning);
      if (result.closed) {
        gap.closed = true;
        gap.roundClosed = round;
        gap.evidence = result.edges.map((ed) => `${ed.src_canonical} -[${ed.predicate}]-> ${ed.dst_canonical} evidence:${ed.evidence_quote.slice(0, 80)}`).join('; ');
        gap.meaning = result.meaning;
        for (const ed of result.edges) subgraph.push(ed);
        anyClosedThisRound = true;
      } else {
        if (result.plan) {
          gap.meaning = result.meaning;
          gap.evidence = `TRACE_GAP: empty path for declared relation ${gap.predicate} from ${gap.from} to ${gap.to} — the graph cannot answer, the missing structure is named (MC-B-08)`;
        }
      }
    }

    if (!anyOpen) break;
    if (!anyClosedThisRound) {
      break;
    }
    const stillOpen = gaps.filter((g) => !g.closed).length;
    if (stillOpen === 0) break;
  }

  if (roundsUsed === 0) roundsUsed = Math.min(1, budget);

  const closedCount = gaps.filter((g) => g.closed).length;
  const openCount = gaps.filter((g) => !g.closed).length;
  const terminated: 'CONVERGED' | 'BUDGET_EXHAUSTED' = openCount === 0 ? 'CONVERGED' : 'BUDGET_EXHAUSTED';

  return {
    subgraph: dedupeEdges(subgraph),
    gaps,
    roundsUsed,
    budget,
    closedCount,
    openCount,
    terminated,
    meanings,
    plans,
  };
}

export function getTemplateQuery(templateId: string): { cypher: string; plan: CompiledPlan; method: string } {
  const m = TEMPLATE_QUERY_MAP[templateId];
  if (!m) throw new L6AgentError('L6_TEMPLATE_UNKNOWN', `L6_TEMPLATE_UNKNOWN: templateId=${templateId}`);
  return { cypher: m.exampleCypher, plan: m.compiledPlan, method: m.method };
}

export const L6_BUDGET_PINS: Record<number, number> = {
  6: 5,
  24: 8,
};
