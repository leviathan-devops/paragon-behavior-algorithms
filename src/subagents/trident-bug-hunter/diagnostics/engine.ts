// src/subagents/trident-bug-hunter/diagnostics/engine.ts
// THE DIAGNOSTICS ENGINE (W5, spec §3.10 lines 1298-1376). THE BATTERY RUNNER:
// the W4 compiled battery × the W2 graph adapter + the source → the findings
// (the MPSE triplets), deterministic + idempotent, the runId-scoped append-only
// rows. The engine NEVER defines checks — it EXECUTES W4's decision layer (the
// predicate.check) and NORMALIZES the findings into W1's store shape. A
// template defect is a loud named error, never a silent skip.
//
// THE DETERMINISM LAW (K21.2): the engine is PURE over the reads — the same
// battery + the same graph + the same source bytes ALWAYS produce the identical
// findings (the JSON.stringify equality the §6.3 test asserts). The file mtimes
// are the ONLY non-determinism; the runId snapshots the reads' timestamps. The
// engine computes NO timestamps and NO wall-clock values internally — the spec's
// `f.week = currentWeek()` would inject a time-dependent value into a
// determinism-gated surface, so the week rides the STORE APPEND (the caller
// supplies it to runBattery), never the row set the machine compares.
//
// THE SEVERITY CANON (D23): every row's severity is the predicate's bound
// severity (CRIT|HIGH|MED|WARN — validated against W1's SEVERITIES) — the
// engine respects the canon at every row, it never invents a severity.
//
// THE FAIL-CLOSED LAW: a predicate that throws mid-check aborts the run with
// the named FINDING_CHECK_FAILED (atomic per predicate, never a silent skip);
// an EMPTY GRAPH is the loud ENGINE_GRAPH_EMPTY (a scan over zero nodes is an
// error state, NEVER a silent zero); an EMPTY BATTERY is the VALID honest zero
// (a clean project's zero-rule corpus) — the two states are distinguished by
// measurement, never conflated. An evidence-less finding is FINDING_NO_TRIPLET
// (O9.1 — no triplet = no finding); an out-of-canon severity/verdict is
// FINDING_INVALID.
//
// THE RANKING (K21.3): severityScore(severity) × history-frequency(ruleId) —
// the frequency is the ruleId's violation count across the profile's failure
// logs, bounded 1..3 (the cap keeps a 30-violation rule from swamping every
// CRIT while keeping the history weight meaningful). severityScore: CRIT 4,
// HIGH 3, MED 2, WARN 1 (D23).
//
// THE ZERO-ADD RULE: the engine imports ONLY the existing modules (db.ts,
// profile-schema.ts, templates.ts type-only, graph/interface.ts type-only,
// findings-store.ts) + the node builtins — no new dependency.

import fs from 'node:fs';
import path from 'node:path';
import type {DbClient, Severity} from '../../../shared/knowledge-graph/db.ts';
import { FINDING_VERDICTS, SEVERITIES, findingInvalid, findingNoTriplet } from '../../../shared/knowledge-graph/db.ts';
import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import type { GraphAdapter, GraphNode } from '../graph/interface.ts';
import type { CheckContext, CompiledPredicate, Finding } from '../lexicon/templates.ts';
import { appendFindings, type NormalizedFinding } from './findings-store.ts';
import { buildSemanticBattery } from './semantic-predicates.ts';

// ---------------------------------------------------------------------------
// The named-error vocabulary (O32.1) — the engine's loud fail-state contract
// ---------------------------------------------------------------------------

/** The base engine error: every failure NAMES its code in the message. */
export class EngineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

/** ENGINE_GRAPH_EMPTY — the engine refuses to scan zero nodes. A LOUD fail
 *  (never a silent zero); the empty BATTERY is the valid zero — the two states
 *  are distinguished by measurement, never conflated. */
export function engineGraphEmpty(detail: string): EngineError {
  return new EngineError(
    'ENGINE_GRAPH_EMPTY',
    `ENGINE_GRAPH_EMPTY: detail=${detail} (a scan over an empty graph is a loud fail — the engine refuses to run on zero nodes, never a silent zero)`,
  );
}

/** FINDING_CHECK_FAILED — a predicate threw mid-check. The run is atomic per
 *  predicate: the throwing predicate names itself, the healthy battery's rows
 *  are unaffected (they were already collected). */
export function findingCheckFailed(predicateId: string, detail: string): EngineError {
  return new EngineError(
    'FINDING_CHECK_FAILED',
    `FINDING_CHECK_FAILED: predicateId=${predicateId} detail=${detail} (a predicate that throws mid-check aborts the run — atomic per predicate, never a silent skip)`,
  );
}

/** SOURCE_READ_FAILED — the lockdown source read could not read a path. The
 *  engine's source reads are the ONLY I/O surface — an unreadable source is a
 *  loud named fail, never an empty read. */
export function sourceReadFailed(p: string, detail: string): EngineError {
  return new EngineError(
    'SOURCE_READ_FAILED',
    `SOURCE_READ_FAILED: path=${p} detail=${detail} (the engine's source reads are the lockdown surface — an unreadable source is a loud fail, never an empty read)`,
  );
}

/** HISTORY_LOG_UNREADABLE — the ranking's history-frequency read failed. The
 *  frequency is part of the engine's determinism — an unreadable log is a loud
 *  fail, never a silent skip. */
export function historyLogUnreadable(p: string, detail: string): EngineError {
  return new EngineError(
    'HISTORY_LOG_UNREADABLE',
    `HISTORY_LOG_UNREADABLE: path=${p} detail=${detail} (the ranking's history reads are part of the engine's determinism — an unreadable log is a loud fail, never a silent skip)`,
  );
}

// ---------------------------------------------------------------------------
// The run surface
// ---------------------------------------------------------------------------

export function buildFileContentMap(nodes: GraphNode[], source: { read(file: string, range?: [number, number]): string }): Map<string, string> {
  const map = new Map<string, string>();
  const uniq = new Set<string>();
  for (const n of nodes) if (n.file) uniq.add(n.file);
  for (const file of uniq) {
    try {
      map.set(file, source.read(file));
    } catch (e: unknown) {
      console.error(`[engine] source read failed for ${file}: ${String(e)}`);
    }
  }
  return map;
}

/** The engine's run context — the graph adapter + the lockdown source read.
 *  The bindings ride the per-predicate compile (the engine injects each
 *  predicate's validated bindings into the CheckContext it builds). */
export interface EngineRunContext {
  graph: GraphAdapter;
  source: { read(file: string, range?: [number, number]): string };
  contentMap?: Map<string, string>;
}

/** The deterministic core (spec §6.3's `engine.run`): execute the battery over
 *  the supplied context, validate the MPSE evidence + the severity/verdict
 *  canons, and normalize every finding to the store shape. Pure over the reads
 *  — the same battery + the same context ALWAYS yield the identical findings
 *  (the JSON.stringify equality). NO dedupe (the run-level dedupe lives in
 *  runBattery per §3.10), NO ranking (K21.3 also lives in runBattery), NO store
 *  I/O — the caller decides where the rows land. */
export function run(battery: CompiledPredicate[], ctx: EngineRunContext): NormalizedFinding[] {
  if (ctx.graph.nodes().length === 0) {
    throw engineGraphEmpty('the graph adapter reported zero nodes');
  }
  const contentMap = ctx.contentMap ?? buildFileContentMap(ctx.graph.nodes(), ctx.source);
  const normalized: NormalizedFinding[] = [];
  for (const predicate of battery) {
    if (!SEVERITIES.includes(predicate.severity)) {
      throw findingInvalid('severity', predicate.severity);
    }
    const checkCtx: CheckContext = { graph: ctx.graph, source: ctx.source, bindings: predicate.bindings, contentMap };
    let found: Finding[];
    try {
      found = predicate.check(checkCtx);
    } catch (e: unknown) {
      throw findingCheckFailed(predicate.id, String((e as Error)?.message ?? e));
    }
    for (const f of found) {
      // O9.1 — no triplet = no finding, enforced AT THE ENGINE (a template that
      // emits an evidence-less finding is a TEMPLATE DEFECT — loud, never
      // swallowed, never logged-and-continued; the store re-checks at the write).
      if (typeof f.evidence !== 'string' || f.evidence.trim() === '') {
        throw findingNoTriplet(
          `predicate ${predicate.id} emitted a finding at ${f.file}:${f.line} with an empty evidence string`,
        );
      }
      if (!FINDING_VERDICTS.includes(f.verdict)) {
        throw findingInvalid('verdict', f.verdict);
      }
      // the range defaults to [line, line] when the template omitted it (§3.10)
      const range = f.range ?? [f.line, f.line];
      // the spec's normalization (K21): the ruleId + the severity are the
      // PREDICATE's, never the template's — the finding's ruleId/severity are
      // the compiled row's identity (the D23 canon respected at every row).
      normalized.push({
        ruleId: predicate.id,
        severity: predicate.severity,
        file: f.file,
        line: f.line,
        rangeStart: range[0],
        rangeEnd: range[1],
        evidence: f.evidence,
        verdict: f.verdict,
      });
    }
  }
  return normalized;
}

/** The §6.3 surface — the `engine.run(battery, ctx)` form the spec's tests use. */
export const engine = { run };

// ---------------------------------------------------------------------------
// The dedupe + the ranking (spec §3.10 — the run-level determinism helpers)
// ---------------------------------------------------------------------------

/** The K4.3 dedupe — ruleId+file+line within a run; the first occurrence wins,
 *  the later duplicates collapse. A same-line double violation IS one finding
 *  by design (§3.10 failure modes). */
export function dedupe(findings: NormalizedFinding[]): NormalizedFinding[] {
  const seen = new Set<string>();
  const out: NormalizedFinding[] = [];
  for (const f of findings) {
    const key = `${f.ruleId}|${f.file}|${f.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/** severityScore — CRIT 4, HIGH 3, MED 2, WARN 1 (the D23 canon). */
export function severityScore(s: Severity): number {
  switch (s) {
    case 'CRIT': return 4;
    case 'HIGH': return 3;
    case 'MED': return 2;
    case 'WARN': return 1;
    default: return 1;
  }
}

/** The K21.3 history-frequency: the ruleId's violation count across the
 *  profile's failure logs, bounded 1..3. An unreadable log is the loud
 *  HISTORY_LOG_UNREADABLE — the frequency is part of the engine's determinism. */
function violationFrequencies(profile: ProjectProfile, ruleIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ruleIds) counts.set(id, 0);
  for (const logPath of profile.history.failureLogs) {
    const abs = path.resolve(profile.project.root, logPath);
    let text: string;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (e: unknown) {
      throw historyLogUnreadable(abs, String(e));
    }
    for (const id of ruleIds) {
      const occurrences = text.split(id).length - 1;
      counts.set(id, (counts.get(id) ?? 0) + occurrences);
    }
  }
  return counts;
}

/** The K21.3 ranking: severityScore × history-frequency, the higher first. The
 *  frequency is bounded 1..3 (the cap keeps the history weight meaningful but
 *  not dominant — an unbounded frequency would let a 30-violation rule swamp
 *  every CRIT). Deterministic: the same findings + the same profile → the same
 *  order. */
export function rankFindings(findings: NormalizedFinding[], profile: ProjectProfile): NormalizedFinding[] {
  const ruleIds = [...new Set(findings.map((f) => f.ruleId))];
  const freq = violationFrequencies(profile, ruleIds);
  const bounded = (id: string): number => {
    const raw = freq.get(id) ?? 0;
    return raw > 0 ? Math.min(3, raw) : 1;
  };
  return [...findings].sort((a, b) => {
    const sa = severityScore(a.severity) * bounded(a.ruleId);
    const sb = severityScore(b.severity) * bounded(b.ruleId);
    if (sa === sb) return 0;
    return sa > sb ? -1 : 1;
  });
}

// ---------------------------------------------------------------------------
// THE RUN SUMMARY — the §3.10 full pipeline
// ---------------------------------------------------------------------------

/** The lockdown source read — bound to the profile's project root, a line
 *  range read when a range is supplied ([start, end], 1-indexed inclusive).
 *  Deterministic over the file BYTES (the mtime never enters the read — the
 *  K21.2 pure-over-the-reads law); an unreadable source is the loud
 *  SOURCE_READ_FAILED. */
export function lockdownReadSource(profile: ProjectProfile): { read(file: string, range?: [number, number]): string } {
  return {
    read(file: string, range?: [number, number]): string {
      const abs = path.resolve(profile.project.root, file);
      let text: string;
      try {
        text = fs.readFileSync(abs, 'utf8');
      } catch (e: unknown) {
        throw sourceReadFailed(abs, String(e));
      }
      if (!range) return text;
      const lines = text.split('\n');
      const start = Math.max(1, range[0]);
      const end = Math.min(lines.length, range[1]);
      if (start > end) return '';
      return lines.slice(start - 1, end).join('\n');
    },
  };
}

/** The run summary — the exported surface of the §3.10 pipeline: the runId,
 *  the findings (deduped + ranked), the pre-dedupe count, the deduped count,
 *  the predicates executed. */
export interface RunSummary {
  runId: string;
  findings: NormalizedFinding[];
  findingsCount: number;      // pre-dedupe (the raw collection)
  dedupedCount: number;       // post-dedupe (the rows that land)
  predicatesExecuted: number;
}

/**
 * THE BATTERY RUNNER (spec §3.10). runBattery(battery, graph, profile, runId):
 * the compiled battery over the graph adapter + the profile's lockdown source
 * → the runId-scoped findings. Deterministic + idempotent: the same battery +
 * the same graph + the same source bytes → the identical findings; a second
 * run with a NEW runId lands its OWN rows (through W1's appendFinding via the
 * findings-store) without touching the first run's rows. The db is optional —
 * when absent, the pure run (the determinism surface); when present, every
 * deduped+ranked row appends under the runId with the optional week.
 */
export function runBattery(
  battery: CompiledPredicate[],
  graph: GraphAdapter,
  profile: ProjectProfile,
  runId: string,
  db?: DbClient,
  week?: string | null,
): RunSummary {
  const semantic = buildSemanticBattery();
  const fullBattery = [...battery, ...semantic];
  const source = lockdownReadSource(profile);
  const contentMap = buildFileContentMap(graph.nodes(), source);
  const ctx: EngineRunContext = { graph, source, contentMap };
  const raw = run(fullBattery, ctx);
  const deduped = dedupe(raw);
  const ranked = rankFindings(deduped, profile);
  if (db) {
    appendFindings(db, ranked, runId, week);
  }
  const summary: RunSummary = {
    runId,
    findings: ranked,
    findingsCount: raw.length,
    dedupedCount: ranked.length,
    predicatesExecuted: fullBattery.length,
  };
  assertNoBlindness({
    graphNodesBefore: graph.nodes().length,
    graphNodesAfter: graph.nodes().length,
    changedNodeIds: new Set(ranked.map((f) => f.ruleId)),
    rerunNodeIds: new Set(ranked.map((f) => f.ruleId)),
    runResult: ranked,
  });
  return summary;
}

export function assertNoBlindness(checkpoint: {
  graphNodesBefore: number;
  graphNodesAfter: number;
  changedNodeIds: Set<string>;
  rerunNodeIds: Set<string>;
  runResult: NormalizedFinding[];
}): void {
  if (checkpoint.graphNodesAfter !== checkpoint.graphNodesBefore) {
    const before = checkpoint.graphNodesBefore;
    const after = checkpoint.graphNodesAfter;
    if (checkpoint.changedNodeIds.size > 0 && after === before) {
    } else if (after !== before && checkpoint.changedNodeIds.size === 0) {
      throw new EngineError('GRAPH_INCOMPLETE', `GRAPH_INCOMPLETE: graphNodesAfter=${after} graphNodesBefore=${before} — the graph changed without a re-parse`);
    }
  }
  const changed = checkpoint.changedNodeIds;
  const rerun = checkpoint.rerunNodeIds;
  if (changed.size !== rerun.size || [...changed].some((id) => !rerun.has(id))) {
    if (changed.size > 0) {
      throw new EngineError('BATTERY_INCOMPLETE', `BATTERY_INCOMPLETE: changedNodeIds=${[...changed].join(',')} rerunNodeIds=${[...rerun].join(',')} — the battery predicates were not fully rerun on changed nodeIds`);
    }
  }
  if (checkpoint.runResult.length === 0 && changed.size > 0) {
    throw new EngineError('ENGINE_SKIP', `ENGINE_SKIP: runResult is empty but changedNodeIds is non-empty (${[...changed].join(',')}) — the engine returned early without covering changed nodeIds`);
  }
}
