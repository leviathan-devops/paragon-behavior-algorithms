// src/subagents/trident-bug-hunter/harness/strike.ts
// THE STRIKE ACTOR (W7, spec §2.7:320 — "STRIKE (dedupe/prioritize → the fix
// order)"). The micro-loop's FIFTH state: the triage pass — dedupe the
// identical-triplet findings (ruleId+file+line), rank by the D13 severity ×
// history-frequency (K21.3), and emit the FIX ORDER the report's section-5
// consumes.
//
// THE DEDUPE (K4.3): the same rule at the same file:line IS one finding — the
// within-run duplicates collapse (the first occurrence wins).
// THE RANK (D13, K21.3): severityScore × the bounded history-frequency (1..3)
// — the violation-history weight measured across the profile's failureLogs.
// THE RANKING SURFACE: W5's engine ALREADY implements the deterministic D13
// rank (rankFindings — the bounded frequency + the severity canon, with the
// loud HISTORY_LOG_UNREADABLE on an unreadable log). THE STRIKE ACTOR REUSES
// THAT SURFACE — it never re-derives the frequency (a second divergent formula
// would be the degraded-duality risk). The trace relevance matrix (D12) is the
// deterministic tie-break over the engine's base order.
//
// THE FIX ORDER (the report's section-5 + the build agent's worklist): the
// ranked finding ids — the dependency-ranked implementation sequence the
// report + the fix-scope consume. Every value computed from the data, never
// fitted to an oracle.

import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import type { NormalizedFinding } from '../diagnostics/findings-store.ts';
import { dedupe, rankFindings, severityScore } from '../diagnostics/engine.ts';
import { findingIdOf, type TraceRow } from './trace.ts';

/** The STRIKE actor's output — the deduped + ranked findings + the fix order. */
export interface StrikeResult {
  findings: NormalizedFinding[];
  fixOrder: string[];
}

/** THE STRIKE ACTOR — dedupe + rank (D13) + the fix order. Deterministic:
 *  the same findings + the same profile + the same traces → the same order. */
export function strike(
  findings: NormalizedFinding[],
  profile: ProjectProfile,
  traces: TraceRow[] = [],
): StrikeResult {
  // THE IDENTICAL-TRIPLET COLLAPSE (K4.3) — the within-run duplicates die first.
  const deduped = dedupe(findings);

  // THE D13 RANK (K21.3) — the engine's deterministic severity × the bounded
  // history-frequency order (the HISTORY_LOG_UNREADABLE propagates — a loud
  // fail, never a silent frequency of 1).
  const ranked = rankFindings(deduped, profile);

  // THE D12 TIE-BREAK — the trace relevance matrix over the engine's base
  // order: a same-score pair leads by the higher total relevance, then the
  // higher severity, then the stable id (the deterministic final fallback).
  const traceByFinding = new Map<string, TraceRow>();
  for (const t of traces) traceByFinding.set(t.findingId, t);

  const relevanceOf = (f: NormalizedFinding): number => {
    const t = traceByFinding.get(findingIdOf(f));
    if (!t) return 0;
    return Object.values(t.relevance).reduce((s, v) => s + v, 0);
  };

  const ordered = [...ranked].sort((a, b) => {
    const ra = relevanceOf(a);
    const rb = relevanceOf(b);
    if (ra !== rb) return rb - ra;
    const sa = severityScore(a.severity);
    const sb = severityScore(b.severity);
    if (sa !== sb) return sb - sa;
    return findingIdOf(a) < findingIdOf(b) ? -1 : 1;
  });

  // THE FIX ORDER — the ranked finding ids (the report's section-5 worklist).
  const fixOrder = ordered.map((f) => findingIdOf(f));

  return { findings: ordered, fixOrder };
}
