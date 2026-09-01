// src/subagents/trident-bug-hunter/harness/report.ts
// THE REPORT ACTOR (W7, spec §2.7:320 — "REPORT (the report_sections + the
// report file + {event: HUNT_DONE}) → the LOGIC-LSP state updated"). The
// micro-loop's SIXTH state: assemble the report_sections rows (the 6-part
// per-finding contract, spec §4.1:1663-1673), append them through W1's store,
// generate the report via the W8 report-writer (the LOCKED MASTER_CONTEXT
// path), append the HUNT_DONE event (the Hydra bus, §4.11), and refresh the
// LOGIC-LSP state (W6's loadStateFromFindings).
//
// THE SIDE-EFFECTS-PRECEDE-CLAIMS LAW: the report FILE must exist + the
// HUNT_DONE event row must land BEFORE the machine reports success — the
// report actor returns the result only after both side effects committed.
//
// THE REPORT-WRITER CONTRACT (W8): the writer is CALLED, never re-implemented
// (the wire-don't-build law). The writer's generateReport owns the generation
// (the hardcoded 384K contract) + the N-versioned write path. The 6.5 tests
// assert only the report PATH on context.reportPath (/bug_hunter_report_v\d+
// .md/) — the report's contents are the writer's contract, not this actor's.
//
// THE FAIL-CLOSED LAW: an empty-findings run is the VALID honest zero — the
// report STILL lands (the honest empty report, spec §6.5:2818-2824); a writer
// failure is the named GENERATION_FAILED → INCONCLUSIVE (O3.5).

import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import type { DbClient, ReportSectionInput } from '../../../shared/knowledge-graph/db.ts';
import { appendReportSection, appendEvent } from '../../../shared/knowledge-graph/db.ts';
import type { NormalizedFinding } from '../diagnostics/findings-store.ts';
import type { ReportSectionRow, ReportWriterInput, ReportWriterResult } from '../tools/report-writer.ts';
import { loadStateFromFindings, type DiagnosticsServer } from '../surface/lsp-injector.ts';
import { findingIdOf, type TraceRow } from './trace.ts';

/** The report-writer seam — the W8 generateReport (the default) or a test
 *  transport. The REAL machine calls generateReport with the project's
 *  transport; the tests inject a deterministic writer (the mocked-transport
 *  tests never touch the network — the W8 unit battery's own pattern). */
export type ReportWriter = (input: ReportWriterInput) => Promise<ReportWriterResult>;

/** The REPORT actor's input — everything the report needs to land. */
export interface ReportActorInput {
  profile: ProjectProfile;
  runId: string;
  findings: NormalizedFinding[];
  traces: TraceRow[];
  fixOrder: string[];
  batteryVersion: string;
  db: DbClient;
  writer: ReportWriter;
  server: DiagnosticsServer;
}

/** The REPORT actor's output — the landed report + the event. */
export interface ReportResult {
  reportPath: string;
  writerResult: ReportWriterResult;
  sectionsAppended: number;
}

/** Assemble the per-finding 6-part report_sections row (spec §4.1:1663-1673).
 *  Every column is DERIVED from the data — the finding's evidence + the trace's
 *  root cause + the rule quote + the fix target — never fabricated prose. The
 *  STORE row is the camelCase ReportSectionInput (W1's appendReportSection);
 *  the WRITER row is the snake_case ReportSectionRow (W8's contract). Both are
 *  built here so the writer's prompt carries the same 6-part truth. */
export function sectionFromFinding(
  f: NormalizedFinding,
  trace?: TraceRow,
): ReportSectionInput {
  const anchor = `${f.file}:${f.line}`;
  const mechanism = trace?.rootCause ?? `the ${f.ruleId} violation at ${anchor}`;
  return {
    findingId: findingIdOf(f),
    howBroken: mechanism,
    whyBroken: trace?.rootCause ?? `the ${f.ruleId} predicate fired on the evidence at ${anchor}`,
    whatViolates: f.evidence,
    howToFix: `resolve the ${f.ruleId} violation at ${anchor}`,
    whatToDo: `1. fix ${f.file}:${f.line} per the evidence; 2. re-run the battery to confirm the ${f.ruleId} predicate is silent`,
    whyWorks: `removing the violation restores the ${f.ruleId} contract (the predicate re-check passes on the corrected state)`,
  };
}

/** The store row (camelCase) → the writer row (snake_case — the W8 contract). */
export function toWriterSection(s: ReportSectionInput): ReportSectionRow {
  return {
    finding_id: s.findingId,
    how_broken: s.howBroken,
    why_broken: s.whyBroken,
    what_violates: s.whatViolates,
    how_to_fix: s.howToFix,
    what_to_do: s.whatToDo,
    why_works: s.whyWorks,
    run_id: '',
  };
}

/** THE REPORT ACTOR — the report rows + the writer + the HUNT_DONE event +
 *  the LOGIC-LSP refresh. The side effects commit BEFORE the return (the
 *  side-effects-precede-claims law). */
export async function report(input: ReportActorInput): Promise<ReportResult> {
  try {
    // 1. THE REPORT_SECTIONS ROWS (the 6-part contract) — one row per finding,
    //    the empty set for the honest-zero run (a clean project still reports).
    const sections: ReportSectionInput[] = [];
    for (const f of input.findings) {
      const trace = input.traces.find((t) => t.findingId === findingIdOf(f));
      sections.push(sectionFromFinding(f, trace));
    }
    for (const s of sections) {
      appendReportSection(input.db, s, input.runId);
    }

  // 2. THE WRITER CALL (W8 — the generation + the LOCKED path write).
  const writerResult = await input.writer({
    projectRoot: input.profile.project.root,
    runId: input.runId,
    findings: input.findings.map((f) => ({
      id: findingIdOf(f),
      severity: f.severity,
      rule: f.ruleId,
      evidence: f.evidence,
    })),
    sections: sections.map(toWriterSection).map((s) => ({ ...s, run_id: input.runId })),
    graphSummaries: input.findings.map((f) => ({
      label: `${f.ruleId} --violates→ ${f.file}:${f.line}`,
      detail: f.evidence,
    })),
  });

  // 2.5 THE THINKING STRIP (HT-BUG-19 — report v1 shipped ~600 lines of model
  //     deliberation prose inside the sealed artifact). After the writer writes
  //     the file, read it back and strip ALL meta-commentary: <think> blocks,
  //     everything before the first '# '-prefixed heading line. Then write back.
  try {
    const fsMod = await import('node:fs');
    const raw = fsMod.readFileSync(writerResult.reportPath, 'utf-8');
    let stripped = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
    const titleMatch = stripped.match(/^# .*$/m);
    if (titleMatch && titleMatch.index !== undefined && titleMatch.index > 0) {
      stripped = stripped.substring(titleMatch.index);
    }
    if (stripped !== raw) {
      fsMod.writeFileSync(writerResult.reportPath, stripped, 'utf-8');
      console.log('[report] thinking-strip applied — removed', raw.length - stripped.length, 'chars of meta-commentary');
    }
  } catch (stripErr: unknown) {
    console.warn('[report] thinking-strip failed (non-fatal):', stripErr instanceof Error ? stripErr.message : String(stripErr));
  }

  // 3. THE HUNT_DONE EVENT (the Hydra bus, spec §4.11:1692-1697 + §2.8:381 —
  //    the payload {runId, reportPath, findingsCount, batteryVersion}).
  appendEvent(input.db, 'HUNT_DONE', {
    runId: input.runId,
    reportPath: writerResult.reportPath,
    findingsCount: writerResult.findingsCount,
    batteryVersion: input.batteryVersion,
    fixOrder: input.fixOrder,
  });

  // 4. THE LOGIC-LSP REFRESH (W6 — the findings state the tool.after injector
  //    publishes; the run's violations become the file-scoped diagnostics).
  loadStateFromFindings(input.db, input.runId, input.server);

  return {
    reportPath: writerResult.reportPath,
    writerResult,
    sectionsAppended: sections.length,
  };
  } catch (e: unknown) {
    console.warn(`[report] failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
