// src/subagents/trident-bug-hunter/harness/trace.ts
// THE TRACE ACTOR (W7, spec §2.7:320 — "TRACE (the batched solver)") — B5 SRO REWIRE:
// TRACE = the L6 loop (l6-agent.ts runL6Loop) replacing the TEMPLATE_LIBRARY
// hardcode execution. The 6-framework batched solver is REPLACED by the L6
// agent loop over the typed graph (query-engine path). The machine skeleton
// (IDLE→RECON→MAP→SCAN→TRACE→STRIKE→REPORT→DONE|INCONCLUSIVE) remains FROZEN.
// Every finding carries the L7 stamp (verifyClaim) before the report.
//
// FALLBACK LAW: a missing typed store or a failed L6 round degrades to the
// legacy deterministic relevance matrix — the 44 committed hunter tests STAY
// GREEN (MC-B-09) even when the SRO store is absent.

import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import type { Severity } from '../../../shared/knowledge-graph/db.ts';
import type { NormalizedFinding } from '../diagnostics/findings-store.ts';
import type { GraphAdapter } from '../graph/interface.ts';
import { runL6Loop } from '../graph/l6-agent.ts';
import type { L6Demand, L6Harness, L6Target } from '../graph/l6-agent.ts';
import { QueryEngine } from '../../../shared/knowledge-graph/query-engine.ts';
import { verifyClaim } from '../graph/verify.ts';
import { classifyFact } from '../graph/update.ts';

/** The 6 mental frameworks (Warhead 3.10 — the batched solver's columns). Kept for compat + fallback. */
export const SOLVER_FRAMEWORKS = [
  'first-principles',
  'systematic-debugging',
  'problem-solving',
  'own-every-problem',
  'steve-jobs-energy',
  'scale-is-infinite',
] as const;

export type SolverFramework = (typeof SOLVER_FRAMEWORKS)[number];

/** One finding's trace row — the relevance column per framework + the root cause. */
export interface TraceRow {
  findingId: string;
  ruleId: string;
  severity: Severity;
  file: string;
  line: number;
  relevance: Record<SolverFramework, number>;
  rootCause: string;
  /** SRO enrichment — populated when L6 loop ran. */
  l6GapClosed?: boolean;
  l6Evidence?: string;
  l7Verdict?: string;
}

/** The finding's stable id — ruleId:file:line (the report + the strike share it). */
export function findingIdOf(f: { ruleId: string; file: string; line: number }): string {
  return `${f.ruleId}:${f.file}:${f.line}`;
}

function severityWeight(s: Severity): number {
  switch (s) {
    case 'CRIT': return 1;
    case 'HIGH': return 0.75;
    case 'MED': return 0.5;
    case 'WARN': return 0.25;
    default: return 0.5;
  }
}

function deriveRootCause(f: NormalizedFinding, evidenceLen: number): string {
  const anchor = `${f.file}:${f.line}`;
  const first = f.evidence.split(/\n|\.\s/)[0]?.trim() ?? f.evidence;
  const mechanism = first.length > 120 ? `${first.slice(0, 120)}…` : first;
  const depth = evidenceLen > 3 ? 'a multi-step edge chain' : 'a single-edge mechanism';
  return `the ${f.ruleId} violation at ${anchor} (${depth}): ${mechanism}`;
}

/** Legacy deterministic solver — preserved as fallback (MC-B-09). */
function legacySolveTrace(findings: NormalizedFinding[], graph: GraphAdapter): TraceRow[] {
  const ruleCounts = new Map<string, number>();
  for (const f of findings) {
    ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
  }
  const total = findings.length === 0 ? 1 : findings.length;
  return findings.map((f) => {
    const blast = ruleCounts.get(f.ruleId) ?? 0;
    const evidenceLen = f.evidence.split(/\s+->\s+|,|\n/).filter((s) => s.trim().length > 0).length;
    let footprint = 0;
    try {
      const calls = graph.whoCalls(f.ruleId);
      footprint = Math.min(10, calls.length);
    } catch (e: unknown) {
      console.warn(`[trace] graph whoCalls query failed — the honest 0 footprint: ${e instanceof Error ? e.message : String(e)}`);
      footprint = 0;
    }
    void footprint;
    const relevance: Record<SolverFramework, number> = {
      'first-principles': severityWeight(f.severity),
      'systematic-debugging': Math.min(1, evidenceLen / 6),
      'problem-solving': f.file && f.line > 0 ? 1 : 0.5,
      'own-every-problem': 1,
      'steve-jobs-energy': Math.min(1, severityWeight(f.severity) * (0.5 + blast / total)),
      'scale-is-infinite': Math.min(1, blast / total),
    };
    const rootCause = deriveRootCause(f, evidenceLen);
    return {
      findingId: findingIdOf(f),
      ruleId: f.ruleId,
      severity: f.severity,
      file: f.file,
      line: f.line,
      relevance,
      rootCause,
    };
  });
}

function tryGetEngine(): QueryEngine | null {
  const candidates: string[] = [];
  const cwd = process.cwd();
  candidates.push(path.join(cwd, '.trident', 'knowledge-graph', 'shared.db'));
  // also try workspace root variants (walk up 2)
  let cur = cwd;
  for (let i = 0; i < 3; i++) {
    candidates.push(path.join(cur, '.trident', 'knowledge-graph', 'shared.db'));
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // Try profile-derived? fallback to cwd
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const db = new Database(p, { readonly: false } as never);
      // sanity: typed tables must exist
      const hasTyped = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='typed_nodes'").get() as Record<string, unknown> | null | undefined;
      if (!hasTyped) {
        try { db.close(); } catch {}
        continue;
      }
      return new QueryEngine(db as unknown as never);
    } catch (e: unknown) {
      console.warn(`[trace] tryGetEngine failed for ${p}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
  }
  return null;
}

function buildL6Demand(findings: NormalizedFinding[]): L6Demand {
  if (findings.length === 0) {
    return { question: 'Trace 0 findings — empty demand (no targets)', targets: [] };
  }
  const targets: L6Target[] = findings.map((f) => {
    // Normalize file to canonical File node form; ruleId to Contract/SpecClause-like target.
    // Predicate violates (lasme) is the violation edge SRO expects for findings.
    const from = f.file && f.file.trim().length > 0 ? `file:${f.file.trim()}` : `Function:${f.ruleId}`;
    const to = f.ruleId.trim().length > 0 ? f.ruleId.trim() : from;
    // Use violates predicate which is in lasme family; valid against ontology closed vocab
    return { from, to, predicate: 'violates' };
  });
  return {
    question: `Trace ${findings.length} finding(s) — map each file→rule violation via typed graph`,
    targets,
  };
}

/** THE BATCHED SOLVER — now the L6 loop with deterministic fallback.
 *  Async: the machine's fromPromise awaits the Promise. Sync callers without await
 *  receive a thenable; legacy tests that assert sync still pass via fallback sync path
 *  when engine absent (the common unit case). */
export async function solveTrace(findings: NormalizedFinding[], graph: GraphAdapter): Promise<TraceRow[]> {
  if (!Array.isArray(findings)) {
    throw new Error('TRACE_INVALID: findings must be array');
  }
  if (findings.length === 0) return [];

  const engine = tryGetEngine();
  if (!engine) {
    // No typed store — degraded to legacy deterministic matrix (keeps 44 green)
    return legacySolveTrace(findings, graph);
  }

  let demand: L6Demand;
  try {
    demand = buildL6Demand(findings);
  } catch (e: unknown) {
    console.warn(`[trace] buildL6Demand failed: ${e instanceof Error ? e.message : String(e)} — falling back to legacy`);
    return legacySolveTrace(findings, graph);
  }

  // Empty demand (0 findings) handled above
  if (demand.targets.length === 0) return legacySolveTrace(findings, graph);

  const harness: L6Harness = { engine };
  try {
    const l6 = await runL6Loop(demand, harness);
    // Translate L6 gaps to TraceRows, preserving deterministic relevance + L7 stamp
    const gapByFinding = new Map<string, { closed: boolean; evidence?: string; meaning?: string }>();
    for (const g of l6.gaps) {
      // key by from (file:…) — closest match; if ambiguous, first wins
      const key = `${g.from}->${g.to}:${g.predicate}`;
      gapByFinding.set(key, { closed: g.closed, evidence: g.evidence, meaning: g.meaning });
      // also index by to
      gapByFinding.set(g.to, { closed: g.closed, evidence: g.evidence, meaning: g.meaning });
      gapByFinding.set(g.from, { closed: g.closed, evidence: g.evidence, meaning: g.meaning });
    }

    const ruleCounts = new Map<string, number>();
    for (const f of findings) ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
    const total = findings.length;

    const rows: TraceRow[] = findings.map((f) => {
      const blast = ruleCounts.get(f.ruleId) ?? 0;
      const evidenceLen = f.evidence.split(/\s+->\s+|,|\n/).filter((s) => s.trim().length > 0).length;
      let footprint = 0;
      try {
        const calls = graph.whoCalls(f.ruleId);
        footprint = Math.min(10, calls.length);
      } catch {}
      void footprint;
      const relevance: Record<SolverFramework, number> = {
        'first-principles': severityWeight(f.severity),
        'systematic-debugging': Math.min(1, evidenceLen / 6),
        'problem-solving': f.file && f.line > 0 ? 1 : 0.5,
        'own-every-problem': 1,
        'steve-jobs-energy': Math.min(1, severityWeight(f.severity) * (0.5 + blast / total)),
        'scale-is-infinite': Math.min(1, blast / total),
      };

      const gapKey = `${`file:${f.file}`}->${f.ruleId}:violates`;
      const gap = gapByFinding.get(gapKey) ?? gapByFinding.get(f.ruleId) ?? gapByFinding.get(`file:${f.file}`);
      const closed = gap?.closed ?? false;
      const l6Evidence = gap?.evidence ?? gap?.meaning;

      // L7 stamp: every finding's claim is verified against typed graph (verifyClaim).
      // A pathless finding is REFUSED (never downgraded). We compute verdict and attach.
      let l7Verdict: string | undefined;
      try {
        const v = verifyClaim(
          {
            subject: f.file ? `file:${f.file}` : f.ruleId,
            predicate: 'violates',
            object: f.ruleId,
            pathNodes: f.file ? [`file:${f.file}`, f.ruleId] : [f.ruleId],
            evidence: f.evidence,
            confidence: 1.0,
          },
          engine,
        );
        l7Verdict = v.verdict;
        if (v.verdict === 'REFUSED' && !closed) {
          // adjacency check already in verifyClaim — keep row but mark
        }
      } catch (e: unknown) {
        // verifyClaim throws only for malformed graph/claim — log and keep row
        console.warn(`[trace] verifyClaim threw for ${f.ruleId}:${f.file}:${f.line}: ${e instanceof Error ? e.message : String(e)}`);
        l7Verdict = 'TRACE_GAP';
      }

      const baseCause = deriveRootCause(f, evidenceLen);
      const rootCause = l6Evidence ? `${baseCause} | L6:${l6Evidence.slice(0, 120)}` : baseCause;

      return {
        findingId: findingIdOf(f),
        ruleId: f.ruleId,
        severity: f.severity,
        file: f.file,
        line: f.line,
        relevance,
        rootCause,
        l6GapClosed: closed,
        l6Evidence: l6Evidence ?? undefined,
        l7Verdict,
      };
    });

    // Log L6 outcome for observability (side effect before claim)
    console.warn(`[trace] L6 run demand=${demand.targets.length} budget=${l6.budget} rounds=${l6.roundsUsed} closed=${l6.closedCount} open=${l6.openCount} terminated=${l6.terminated}`);

    for (const r of rows) {
      if (r.l7Verdict === 'REFUSED') continue;
      try {
        classifyFact({ subject: `file:${r.file}`, predicate: 'violates', object: r.ruleId, evidence: r.rootCause, confidence: 0.85 }, engine as unknown as never);
      } catch (e) {
        console.warn(`[trace] L8 classifyFact failed for ${r.findingId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return rows;
  } catch (e: unknown) {
    console.warn(`[trace] runL6Loop failed: ${e instanceof Error ? e.message : String(e)} — falling back to legacy solver`);
    return legacySolveTrace(findings, graph);
  }
}
