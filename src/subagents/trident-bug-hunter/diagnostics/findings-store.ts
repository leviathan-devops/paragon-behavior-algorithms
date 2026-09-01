// src/subagents/trident-bug-hunter/diagnostics/findings-store.ts
// THE APPEND-ONLY FINDINGS WRAPPER (W5, spec §3.10:1333 — the K4.3 store).
// The machine's single findings surface: the thin adapter over W1's
// appendFinding (db.ts:170), with the runId + week scoping, the MPSE evidence
// MANDATORY at the write boundary (O9.1 — a finding without a non-empty
// evidence string is rejected with FINDING_NO_TRIPLET), and the query surface
// for W6's violations verb + the LOGIC-LSP. The evidence law is enforced
// EXACTLY ONCE, here — an evidence-less finding is a loud named error naming
// the offending ruleId + the landed/remaining counts, NEVER a silent skip,
// never a half-swallowed batch.
//
// THE SHAPE (NormalizedFinding): the engine's normalized row — the W1
// FindingInput (db.ts:102) with the optional file/line/rangeStart/rangeEnd
// coerced to the deterministic string/number form the engine's dedupe + rank
// consume. The runId + the week NEVER ride the finding — they scope the append
// (appendFinding(finding, runId, week)), so the row set under a run is a pure
// function of the run's inputs (the determinism law K21.2: no timestamp or
// wall-clock value enters the findings the machine compares).
//
// THE ZERO-ADD RULE: this module imports ONLY W1's db.ts + the node/bun
// builtins — no new dependency, no package.json change.

import type { DbClient, FindingInput, FindingVerdict, Severity } from '../../../shared/knowledge-graph/db.ts';
import { SEVERITIES } from '../../../shared/knowledge-graph/db.ts';
import { findingNoTriplet } from '../../../shared/knowledge-graph/db.ts';

// ---------------------------------------------------------------------------
// The normalized finding row — the engine's + the query surface's shape
// ---------------------------------------------------------------------------

/** The engine's normalized finding — the W1 FindingInput with the optional
 *  coordinates coerced to the deterministic form (file/line/rangeStart/
 *  rangeEnd are non-null; the evidence is non-empty by construction — the
 *  write boundary enforces the MPSE law). The runId/week scope the APPEND,
 *  never the row. */
export interface NormalizedFinding {
  ruleId: string;
  severity: Severity;
  file: string;
  line: number;
  rangeStart: number;
  rangeEnd: number;
  evidence: string;
  verdict: FindingVerdict;
}

/** NormalizedFinding → the W1 FindingInput shape (the store's contract). */
export function toFindingInput(f: NormalizedFinding): FindingInput {
  return {
    ruleId: f.ruleId,
    severity: f.severity,
    file: f.file,
    line: f.line,
    rangeStart: f.rangeStart,
    rangeEnd: f.rangeEnd,
    evidence: f.evidence,
    verdict: f.verdict,
  };
}

// ---------------------------------------------------------------------------
// THE WRITE SURFACE — the single evidence boundary
// ---------------------------------------------------------------------------

/**
 * Append ONE finding through W1's appendFinding, runId-scoped. The MPSE law
 * is enforced HERE first (a richer error naming the ruleId), then W1's own
 * appendFinding validates again at the schema (db.ts:416) — the two-layer
 * check keeps the write boundary the machine's single evidence gate.
 */
export function append(db: DbClient, finding: FindingInput, runId: string, week?: string | null): void {
  if (typeof finding.evidence !== 'string' || finding.evidence.trim() === '') {
    throw findingNoTriplet(
      `finding ${finding.ruleId} at ${finding.file ?? '?'}:${finding.line ?? '?'} carries an empty evidence string`,
    );
  }
  db.appendFinding(finding, runId, week);
}

export interface AppendFindingsResult {
  runId: string;
  week: string | null;
  appended: number;
}

/**
 * Append the run's findings in ORDER through W1's appendFinding — the runId +
 * the week scoping, the atomic-reportable rejection: an evidence-less finding
 * at index i throws FINDING_NO_TRIPLET naming the ruleId AND the landed/
 * remaining counts (landed=i, remaining=N-i of N) — the caller sees exactly
 * how far the batch got, never a swallowed row.
 */
export function appendFindings(
  db: DbClient,
  findings: NormalizedFinding[],
  runId: string,
  week?: string | null,
): AppendFindingsResult {
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    if (typeof f.evidence !== 'string' || f.evidence.trim() === '') {
      throw findingNoTriplet(
        `finding ${f.ruleId} at ${f.file}:${f.line} carries an empty evidence string (landed=${i} remaining=${findings.length - i} of ${findings.length})`,
      );
    }
    db.appendFinding(toFindingInput(f), runId, week);
  }
  return { runId, week: week ?? null, appended: findings.length };
}

// ---------------------------------------------------------------------------
// THE READ SURFACE — the ledger queries
// ---------------------------------------------------------------------------

export interface QueryFindingsOptions {
  runId?: string;
  week?: string | null;
  ruleId?: string;
}

/**
 * The read surface for W6's violations verb + the LOGIC-LSP. Filters by
 * runId / week / ruleId; returns the rows DEDUPED (ruleId+file+line, the first
 * ledger row wins) in the append order (the INSERT id ASC — the ledger order).
 * An empty filter set returns the whole ledger — the caller scopes explicitly.
 */
export function queryFindings(
  db: DbClient,
  opts: QueryFindingsOptions = {},
): NormalizedFinding[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.runId) {
    clauses.push('run_id = ?');
    params.push(opts.runId);
  }
  if (opts.week) {
    clauses.push('week = ?');
    params.push(opts.week);
  }
  if (opts.ruleId) {
    clauses.push('rule_id = ?');
    params.push(opts.ruleId);
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(
    `SELECT run_id,rule_id,severity,file,line,range_start,range_end,evidence,verdict FROM findings${where} ORDER BY id ASC`,
  ).all(...params);

  const seen = new Set<string>();
  const out: NormalizedFinding[] = [];
  for (const row of rows) {
    const ruleId = String(row['rule_id']);
    const file = row['file'] == null ? '' : String(row['file']);
    const line = row['line'] == null ? 0 : Number(row['line']);
    // the K4.3 dedupe is RUN-SCOPED: (runId+ruleId+file+line) — the engine
    // dedupes within a run at the write; two runs reporting the same violation
    // at the same place are DIFFERENT ledger events (distinct runIds +
    // evidence) and are never collapsed here.
    const key = `${String(row['run_id'])}|${ruleId}|${file}|${line}`;
    if (seen.has(key)) continue; // the within-run duplicate (ruleId+file+line) — the first ledger row wins
    seen.add(key);
    out.push({
      ruleId,
      severity: severityFromRow(row['severity']),
      file,
      line,
      rangeStart: row['range_start'] == null ? line : Number(row['range_start']),
      rangeEnd: row['range_end'] == null ? line : Number(row['range_end']),
      evidence: String(row['evidence']),
      verdict: verdictFromRow(row['verdict']),
    });
  }
  return out;
}


/** THE R16 TYPE_CERTAINTY GUARDED READ — the stored severity is narrowed by the
 *  SEVERITIES membership check. */
function severityFromRow(v: unknown): Severity {
  if (typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)) {
    return v as Severity;
  }
  return 'MED';
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the stored verdict is narrowed by the
 *  literal-union check. */
function verdictFromRow(v: unknown): FindingVerdict {
  if (v === 'VIOLATION' || v === 'PASS') {
    return v;
  }
  return 'PASS';
}
