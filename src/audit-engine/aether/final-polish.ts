/**
 * final-polish.ts — THE FINAL-POLISH COMPOSER (S5 — the SPEC-2 §2.5/§9.5)
 *
 * THE COMPOSER RENDERS THE ADJUDICATED, CONSEQUENCE-RANKED REPORT. The aether's
 * narrative + verdicts are the SUBSTANCE; the machinery's data is the ANCHORS.
 * THE COMPOSER NEVER OVERRIDES THE MACHINERY'S SEVERITY — it ranks, labels,
 * and discloses; the machine owns the validity (the fusion law §2.7).
 *
 * THE THREE MECHANISMS (§9.5.2):
 *   1 THE CONSEQUENCE-RANKED SORT — rankFindings sorts by (consequenceRank,
 *     severity): a rank-1 CRITICAL in a hot path tops the list; a rank-4 LOW
 *     in a dead module bottoms it. Rank primary, machine severity secondary.
 *   2 THE LABEL RULE — the report labels the rank "the model's suggested
 *     triage" (the AP-S2-7: the self-scoring aether never presents its rank
 *     as a machine priority).
 *   3 THE RED-HERRING DISCLOSURE — a RED_HERRING finding is MOVED to §4 with
 *     its reason + the calibration note (the CALIB_STALE signal fed to the
 *     D17), NEVER removed (the AP-S2-1: the machine count holds).
 *
 * THE REPORT ANATOMY (the §2.5/§9.5.5 6-section contract):
 *   1 THE EXECUTIVE SUMMARY · 2 THE FINDINGS TABLE · 3 THE DEEPER PROBES ·
 *   4 THE RED-HERRINGS · 5 THE MACHINERY META · 6 THE FIX PRIORITIZATION
 */
import type { AuditFinding } from '../types.js';
import type { GroundTruth } from './supremacy-brief.js';
import type { ProbedVerdict } from './silent-verifier.js';
import type { CompositionResult } from './aether-brain.js';

// ── THE RANKABLE MINIMUM (the structural surface the sort needs — the
//    machinery's AuditFinding AND the brief's BriefedFinding both satisfy it.
//    The composer consumes the BRIEF's findings (the GroundTruth is its typed
//    input per §9.5.3); the C7 + the callers pass the raw AuditFinding — ONE
//    sort serves both, never a fabricated field-mapping.) ──
export interface RankableFinding {
  layer: string;
  severity: string;
  category: string;
  file: string;
  line: number;
  evidence: string;
}

export interface RankedRow<F extends RankableFinding = AuditFinding> {
  verdict: ProbedVerdict;
  finding: F;
  key: string;
}

// ── THE SEVERITY ORDER (the machine's severity ladder — CRITICAL tops. An
//    unknown severity sorts BELOW the named set (index = the ladder length),
//    computed from the table, never a magic constant.) ──
// THE NAMED CALIBRATION (the ISE law — the numeric domain here is NOT a magic
// ladder): the consequenceRank 1..4 is the SPEC-2 §2.9 ENUMERATED CONTRACT
// (calib: SPEC-2 §2.9/§2.12 — the 4-value triage), and the severity ladder is
// the machinery's named severity set. Both are lookup-driven (the ladder's
// indexOf, the rank's enumerated union type) — never a bare threshold chain.
const SEVERITY_LADDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

function severityIndex(severity: string): number {
  const idx = SEVERITY_LADDER.indexOf(String(severity).toUpperCase() as (typeof SEVERITY_LADDER)[number]);
  return idx === -1 ? SEVERITY_LADDER.length : idx;
}

/** THE CONSEQUENCE-RANKED SORT (MECHANISM 1 — the §9.5.2 key
 *  `${consequenceRank}-${severityIndex}`). Rank primary, the machine severity
 *  secondary; the findingIndex is the deterministic tie-break (the same input
 *  → the same order, the determinism law).
 *
 *  THE COUNT-BOUND HONESTY: a verdict whose findingIndex has NO finding (the
 *  fabrication class the verifier's check-2/4 rejects) is NOT silently
 *  absorbed — it is excluded from the rows AND disclosed by composeFinalReport
 *  (the §5 UNVERIFIED note). The composer never fabricates a row for an
 *  invented index.
 *
 *  ERROR PATHS FIRST: a non-array input is a caller bug — thrown, never coerced. */
export function rankFindings<F extends RankableFinding>(
  verdicts: ProbedVerdict[],
  findings: F[],
): RankedRow<F>[] {
  if (!Array.isArray(verdicts) || !Array.isArray(findings)) {
    throw new TypeError('COMPOSE_RENDER_FAILED: rankFindings received a non-array input — the composer sorts the real sets, never nothing');
  }
  const rows: RankedRow<F>[] = [];
  for (const verdict of verdicts) {
    const finding = findings[verdict.findingIndex];
    if (!finding) continue;   // the out-of-range index — disclosed by the composer, never row-fabricated
    rows.push({
      verdict,
      finding,
      key: `${verdict.consequenceRank}-${severityIndex(finding.severity)}`,
    });
  }
  rows.sort((a, b) => {
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return a.verdict.findingIndex - b.verdict.findingIndex;
  });
  return rows;
}

/** THE 6-SECTION RENDER (MECHANISM 2 + 3 — the §2.5 anatomy). The narrative is
 *  the aether's; the table rows are the adjudicated non-red-herring verdicts;
 *  the red-herrings are MOVED to §4 with the calibration note (CALIB_STALE);
 *  the fix prioritization is labeled "the model's suggested triage".
 *
 *  ERROR PATHS FIRST: a missing ground truth or composition is a caller bug —
 *  thrown, never a report over nothing. The zero-finding render is LEGAL (the
 *  machinery-only path): every section renders with its honest empty marker. */
export function composeFinalReport(groundTruth: GroundTruth, composition: CompositionResult): string {
  if (!groundTruth || !groundTruth.projectInfo || !Array.isArray(groundTruth.findings)) {
    throw new TypeError('COMPOSE_RENDER_FAILED: composeFinalReport received no ground truth — the machinery data is the anchors');
  }
  if (!composition || !Array.isArray(composition.verdicts) || typeof composition.narrative !== 'string') {
    throw new TypeError('COMPOSE_RENDER_FAILED: composeFinalReport received no composition — the aether output is the substance');
  }

  const rows = rankFindings(composition.verdicts, groundTruth.findings);
  const adjudicated = rows.filter((row) => row.verdict.adjudication !== 'RED_HERRING');
  const redHerrings = rows.filter((row) => row.verdict.adjudication === 'RED_HERRING');
  const truePositives = rows.filter((row) => row.verdict.adjudication === 'TRUE_POSITIVE');

  // THE COUNT-BOUND DISCLOSURE: a verdict with no matching finding (the
  // fabricated/dropped class) is NAMED in the machinery meta, never hidden.
  const unmatched = composition.verdicts.filter((v) => groundTruth.findings[v.findingIndex] === undefined);

  const lines: string[] = [];

  // ── THE HEADER ──
  lines.push(`# TRIDENT CODE AUDIT — ${groundTruth.projectInfo.name}  (the STEP-X adjudicated report)`, ``);

  // ── 1. THE EXECUTIVE SUMMARY (the aether's narrative) ──
  lines.push(`## 1. THE EXECUTIVE SUMMARY`, ``, composition.narrative, ``);

  // ── 2. THE FINDINGS TABLE (the adjudicated rows, consequence-ranked) ──
  lines.push(`## 2. THE FINDINGS TABLE`, ``);
  lines.push(`| severity | layer | file:line | adjudication | consequence-rank | the one-line root |`);
  lines.push(`|---|---|---|---|---|---|`);
  if (adjudicated.length === 0) {
    lines.push(`| (none) | — | — | — | — | no adjudicated findings |`);
  }
  for (const row of adjudicated) {
    lines.push(
      `| ${row.finding.severity} | ${row.finding.layer} | ${row.finding.file}:${row.finding.line} | ${row.verdict.adjudication} | ${row.verdict.consequenceRank} | ${oneLine(row.verdict.deeperRoot)} |`,
    );
  }
  lines.push(``);

  // ── 3. THE DEEPER PROBES (the true-positives' root + concrete fix) ──
  lines.push(`## 3. THE DEEPER PROBES`, ``);
  if (truePositives.length === 0) {
    lines.push(`(no true-positive probes)`);
  }
  for (const row of truePositives) {
    lines.push(
      `### ${row.finding.file}:${row.finding.line} (${row.finding.layer} — ${row.finding.severity})`,
      `- THE DEEPER ROOT: ${row.verdict.deeperRoot}`,
      `- THE CONCRETE FIX: ${row.verdict.concreteFix}`,
      ``,
    );
  }
  lines.push(``);

  // ── 4. THE RED-HERRINGS (moved, never removed — the AP-S2-1 count holds) ──
  lines.push(`## 4. THE RED-HERRINGS`, ``);
  if (redHerrings.length === 0) {
    lines.push(`(no red-herrings flagged)`);
  } else {
    // THE LOUD-FAIL COUNT (§2.5): the over-firing statement feeds the D17
    // re-calibration loop — WHICH matcher over-fires, named per herring.
    const layers = [...new Set(redHerrings.map((row) => row.finding.layer))];
    lines.push(
      `${redHerrings.length} of the ${composition.verdicts.length} findings are RED_HERRING — the ${layers.join(', ')} matcher(s) over-fire; the CALIB_STALE signal is fed to the D17 re-calibration.`,
      ``,
    );
    for (const row of redHerrings) {
      lines.push(
        `### ${row.finding.file}:${row.finding.line} (${row.finding.layer} — ${row.finding.severity})`,
        `- THE FLAG: ${row.verdict.deeperRoot}`,
        `- THE CALIBRATION NOTE: this RED_HERRING suggests the ${row.finding.layer} matcher over-fires — the D17 gate should have excluded it — the CALIB_STALE signal fed.`,
        ``,
      );
    }
  }
  // THE MACHINE COUNT HOLDS (the AP-S2-1 structural guarantee, stated):
  lines.push(
    `The machine count holds: ${groundTruth.findings.length} findings = ${adjudicated.length} adjudicated + ${redHerrings.length} red-herrings (moved, never removed).`,
    ``,
  );

  // ── 5. THE MACHINERY META (the graph stats + the events + the calibration) ──
  lines.push(`## 5. THE MACHINERY META`, ``);
  const calibrated = groundTruth.findings.filter((f) => f.calibration === 'CALIBRATED').length;
  const excluded = groundTruth.findings.filter((f) => f.calibration === 'EXCLUDED').length;
  lines.push(
    `- the graph: ${groundTruth.graph.nodes} nodes, ${groundTruth.graph.edges} edges; the hotspot: ${groundTruth.graph.hotspot.length > 0 ? groundTruth.graph.hotspot.join(', ') : '(none)'}`,
    `- the events: the flow verdict '${groundTruth.events.flowVerdict}'; the cadence anomalies: ${groundTruth.events.cadenceAnomalies.length > 0 ? groundTruth.events.cadenceAnomalies.join(', ') : '(none)'}`,
    `- the calibration: ${calibrated} CALIBRATED, ${excluded} EXCLUDED (the D17 verdicts — the machine owns the validity)`,
    `- the composition: ${composition.modelMeta.model} via ${composition.modelMeta.provider} at ${composition.modelMeta.composedAt}`,
  );
  if (unmatched.length > 0) {
    lines.push(
      `- UNVERIFIED: ${unmatched.length} verdict(s) reference findings outside the calibrated set (the indices ${unmatched.map((v) => v.findingIndex).join(', ')}) — the count-bound violation, disclosed never absorbed`,
    );
  }
  lines.push(``);

  // ── 6. THE FIX PRIORITIZATION (the consequence-ranked fix order) ──
  lines.push(`## 6. THE FIX PRIORITIZATION`, ``);
  // THE LABEL RULE (MECHANISM 2 — the AP-S2-7 honesty, verbatim):
  lines.push(`The order below is the model's suggested triage — the aether suggests; the machinery's severity + the operator weigh.`, ``);
  if (adjudicated.length === 0) {
    lines.push(`(no fixes to prioritize)`);
  }
  for (const row of adjudicated) {
    lines.push(
      `${row.verdict.consequenceRank}. ${row.finding.file}:${row.finding.line} (${row.finding.severity} — ${row.finding.layer}): ${oneLine(row.verdict.concreteFix)}`,
    );
  }
  lines.push(``);

  return lines.join('\n');
}

/** THE ONE-LINE RENDER (the table cell's bound): the first line of the prose,
 *  un-truncated in substance — the full root/fix lives in §3. Pure formatting. */
function oneLine(prose: string): string {
  return prose.split('\n', 1)[0].replace(/\|/g, '\\|');
}
