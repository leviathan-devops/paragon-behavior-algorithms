// src/audit-engine/__tests__/aether-polish.test.ts — THE FINAL-POLISH BATTERY
// (SPEC-2 §9.5.7 C7 + the §2.5 anatomy). The composer is PURE MACHINERY — no
// model call exists in S5 — so the battery asserts the render against the real
// exports: the consequence-ranked sort, the red-herring disclosure (moved,
// never removed — the machine count holds), the label rule, the CALIB_STALE
// note. THE FIRE-THAT-NEVER-FIRES IS THEATER: the adversarial cases are below.
import { describe, expect, it } from 'bun:test';
import * as os from 'os';
import * as path from 'path';

import { rankFindings, composeFinalReport } from '../aether/final-polish.ts';
import type { CompositionResult } from '../aether/aether-brain.ts';
import type { ProbedVerdict } from '../aether/silent-verifier.ts';
import type { BriefedFinding, GroundTruth } from '../aether/supremacy-brief.ts';
import type { AuditFinding } from '../types.ts';

// ── THE FIXTURES (the dynamic temp root — the R5 law; computed constructors) ──
const FIX_ROOT = path.join(os.tmpdir(), 'aether-polish-fixture-rt');

const F = (o: Partial<AuditFinding>): AuditFinding => ({ severity: 'HIGH', category: 'X', file: 'src/f.ts', line: 1, evidence: 'e', description: 'd', correction: 'c', runtimeImpact: 'i', confidence: 0.9, layer: 'R1', constructType: null, callGraphRef: null, evidenceSuppressed: false, ...o });

const BF = (o: Partial<BriefedFinding>): BriefedFinding => ({
  index: 0, layer: 'R2', severity: 'HIGH', category: 'silent-catch',
  file: 'src/bad.ts', line: 1, evidence: 'e',
  sourceWindow: 'export function run() { return 1; }',
  calibration: 'CALIBRATED', callGraphRef: null, ...o,
});

const GT = (findings: BriefedFinding[]): GroundTruth => ({
  targetPath: FIX_ROOT,
  projectInfo: { name: 'rt', shape: 'library', isPlugin: false, srcPath: path.join(FIX_ROOT, 'src') },
  findings,
  graph: { nodes: 3, edges: 0, hotspot: [] },
  events: { flowVerdict: 'CLEAR', cadenceAnomalies: [] },
});

const V = (o: Partial<ProbedVerdict>): ProbedVerdict => ({ findingIndex: 0, adjudication: 'TRUE_POSITIVE', deeperRoot: 'the run() swallows the rejection', concreteFix: 'src/f.ts:1 log the error', consequenceRank: 1, ...o });

const COMP = (verdicts: ProbedVerdict[], narrative = 'the adjudicated summary'): CompositionResult => ({
  verdicts,
  narrative,
  modelMeta: { model: 'probe-fast (probes) + narrative-strong (narrative)', provider: 'mock-provider', composedAt: 1755800000000 },
});

describe('THE FINAL-POLISH COMPOSER — the §9.5.7 C7 (the consequence-ranked, adjudicated report)', () => {
  // ── THE CONSEQUENCE-RANKED SORT ──
  it('the consequence-ranked sort: a rank-1 CRITICAL before a rank-4 LOW', () => {
    const findings = [F({ severity: 'LOW' }), F({ severity: 'CRITICAL' })];
    const verdicts = [V({ findingIndex: 0, consequenceRank: 4 }), V({ findingIndex: 1, consequenceRank: 1 })];
    const rows = rankFindings(verdicts, findings);
    expect(rows[0].key < rows[rows.length - 1].key).toBe(true);
    expect(rows[0].finding.severity).toBe('CRITICAL');
    expect(rows[rows.length - 1].finding.severity).toBe('LOW');
  });

  it('the sort key is (rank, severity): two rank-2 findings order by their machine severity', () => {
    const findings = [F({ severity: 'LOW' }), F({ severity: 'CRITICAL' })];
    const verdicts = [V({ findingIndex: 0, consequenceRank: 2 }), V({ findingIndex: 1, consequenceRank: 2 })];
    const rows = rankFindings(verdicts, findings);
    const keyForRank2Critical = rows.find((r) => r.finding.severity === 'CRITICAL')?.key ?? '';
    const keyForRank2Low = rows.find((r) => r.finding.severity === 'LOW')?.key ?? '';
    expect(keyForRank2Critical < keyForRank2Low).toBe(true);
    expect(rows[0].finding.severity).toBe('CRITICAL');   // the machine severity breaks the rank tie
  });

  it('the sort ADVERSARIAL: an unknown severity sorts BELOW the named set; the findingIndex breaks the exact-key tie deterministically', () => {
    const findings = [F({ severity: 'LOW' }), F({ severity: 'BIZARRE' as never }), F({ severity: 'LOW', line: 9 })];
    const verdicts = [V({ findingIndex: 0, consequenceRank: 2 }), V({ findingIndex: 1, consequenceRank: 2 }), V({ findingIndex: 2, consequenceRank: 2 })];
    const rows = rankFindings(verdicts, findings);
    expect(rows[rows.length - 1].finding.severity).toBe('BIZARRE');
    expect(rows[0].verdict.findingIndex).toBe(0);        // the deterministic tie-break
    expect(rows[1].verdict.findingIndex).toBe(2);
  });

  it('the sort ADVERSARIAL: a non-array input is a LOUD failure, never coerced', () => {
    expect(() => rankFindings(null as never, [])).toThrow(/COMPOSE_RENDER_FAILED/);
    expect(() => rankFindings([], null as never)).toThrow(/COMPOSE_RENDER_FAILED/);
  });

  // ── THE 6-SECTION ANATOMY ──
  it('the report renders the EXACT 6-section anatomy (the §2.5 contract)', () => {
    const briefed = [BF({ index: 0 })];
    const report = composeFinalReport(GT(briefed), COMP([V({ findingIndex: 0 })]));
    expect(report.includes('## 1. THE EXECUTIVE SUMMARY')).toBe(true);
    expect(report.includes('## 2. THE FINDINGS TABLE')).toBe(true);
    expect(report.includes('## 3. THE DEEPER PROBES')).toBe(true);
    expect(report.includes('## 4. THE RED-HERRINGS')).toBe(true);
    expect(report.includes('## 5. THE MACHINERY META')).toBe(true);
    expect(report.includes('## 6. THE FIX PRIORITIZATION')).toBe(true);
    expect(report.includes('the adjudicated summary')).toBe(true);   // the aether's narrative is the substance
  });

  // ── THE RED-HERRING DISCLOSURE ──
  it('the red-herring disclosure: a RED_HERRING finding is MOVED to §4, never removed — the machine count holds', () => {
    const briefed = [BF({ index: 0 }), BF({ index: 1, layer: 'R3', file: 'src/data.ts', line: 3 })];
    const findings = briefed;
    const verdicts = [
      V({ findingIndex: 0, adjudication: 'TRUE_POSITIVE' }),
      V({ findingIndex: 1, adjudication: 'RED_HERRING', deeperRoot: 'the string TODO is DATA', consequenceRank: 4 }),
    ];
    const report = composeFinalReport(GT(findings), COMP(verdicts));
    expect(report.includes('## 4. THE RED-HERRINGS')).toBe(true);
    // the machine count holds: every finding renders exactly once (adjudicated OR red-herring)
    const rows = rankFindings(verdicts, findings);
    const excludingRedHerrings = rows.filter((r) => r.verdict.adjudication !== 'RED_HERRING');
    const redHerrings = rows.filter((r) => r.verdict.adjudication === 'RED_HERRING');
    expect(findings.length).toBe(excludingRedHerrings.length + redHerrings.length);
    // the herring's row is in §4, NOT in the §2 table: the section-4 substring carries its anchor
    const section4 = report.slice(report.indexOf('## 4. THE RED-HERRINGS'));
    expect(section4.includes('src/data.ts:3')).toBe(true);
    const section2 = report.slice(report.indexOf('## 2. THE FINDINGS TABLE'), report.indexOf('## 3. THE DEEPER PROBES'));
    expect(section2.includes('src/data.ts:3')).toBe(false);            // moved, never duplicated
    // the loud-fail count is stated (the calibration feedback loop is explicit)
    expect(report.includes(`1 of the ${verdicts.length} findings are RED_HERRING`)).toBe(true);
  });

  // ── THE LABEL RULE ──
  it('the label rule: the report labels the rank "the model\'s suggested triage" (the AP-S2-7 honesty)', () => {
    const briefed = [BF({ index: 0 })];
    const report = composeFinalReport(GT(briefed), COMP([V({ findingIndex: 0 })]));
    expect(report.includes('the model\'s suggested triage')).toBe(true);
  });

  // ── THE CALIBRATION NOTE ──
  it('the calibration note: the red-herring section states the over-firing matcher (the CALIB_STALE signal)', () => {
    const briefed = [BF({ index: 0, layer: 'R3' })];
    const report = composeFinalReport(GT(briefed), COMP([V({ findingIndex: 0, adjudication: 'RED_HERRING' })]));
    expect(report.includes('CALIB_STALE')).toBe(true);
    expect(report.includes('the R3 matcher over-fires')).toBe(true);
  });

  // ── THE ADVERSARIAL RENDERS ──
  it('the zero-finding render: every section renders with its honest empty marker (no crash, no fabrication)', () => {
    const report = composeFinalReport(GT([]), COMP([], 'the empty-audit summary'));
    expect(report.includes('## 1. THE EXECUTIVE SUMMARY')).toBe(true);
    expect(report.includes('## 4. THE RED-HERRINGS')).toBe(true);
    expect(report.includes('(no red-herrings flagged)')).toBe(true);
    expect(report.includes('(no fixes to prioritize)')).toBe(true);
    expect(report.includes('(no true-positive probes)')).toBe(true);
  });

  it('the count-bound disclosure: a verdict referencing a NONEXISTENT finding is DISCLOSED as UNVERIFIED, never silently absorbed', () => {
    const briefed = [BF({ index: 0 })];
    const verdicts = [V({ findingIndex: 0 }), V({ findingIndex: 99 })];   // the fabricated index
    const report = composeFinalReport(GT(briefed), COMP(verdicts));
    expect(report.includes('UNVERIFIED')).toBe(true);
    expect(report.includes('99')).toBe(true);                              // the invented index is NAMED
    // and no row was fabricated for it: the §2 table carries only the real finding
    const section2 = report.slice(report.indexOf('## 2. THE FINDINGS TABLE'), report.indexOf('## 3. THE DEEPER PROBES'));
    expect((section2.match(/src\/bad\.ts:1/g) ?? []).length).toBe(1);
  });

  it('the UNCLEAR adjudication stays in the findings table (the honest third — never probed as true-positive, never moved as herring)', () => {
    const briefed = [BF({ index: 0 })];
    const report = composeFinalReport(GT(briefed), COMP([V({ findingIndex: 0, adjudication: 'UNCLEAR' })]));
    const section2 = report.slice(report.indexOf('## 2. THE FINDINGS TABLE'), report.indexOf('## 3. THE DEEPER PROBES'));
    expect(section2.includes('UNCLEAR')).toBe(true);
    const section3 = report.slice(report.indexOf('## 3. THE DEEPER PROBES'), report.indexOf('## 4. THE RED-HERRINGS'));
    expect(section3.includes('(no true-positive probes)')).toBe(true);
    const section4 = report.slice(report.indexOf('## 4. THE RED-HERRINGS'), report.indexOf('## 5. THE MACHINERY META'));
    expect(section4.includes('(no red-herrings flagged)')).toBe(true);
  });

  it('the composer ADVERSARIAL: a missing ground truth or composition is a LOUD failure, never a report over nothing', () => {
    expect(() => composeFinalReport(null as never, COMP([]))).toThrow(/COMPOSE_RENDER_FAILED/);
    expect(() => composeFinalReport(GT([]), null as never)).toThrow(/COMPOSE_RENDER_FAILED/);
  });

  // ── THE FIX PRIORITIZATION ORDER (the happy-path confirmation, last) ──
  it('the §6 fix order is the consequence-ranked sort: the rank-1 fix lands BEFORE the rank-4 fix', () => {
    const briefed = [
      BF({ index: 0, file: 'src/cold.ts', line: 9, severity: 'LOW' }),
      BF({ index: 1, file: 'src/hot.ts', line: 2, severity: 'CRITICAL' }),
    ];
    const verdicts = [
      V({ findingIndex: 0, consequenceRank: 4, concreteFix: 'src/cold.ts:9 the cosmetic tidy' }),
      V({ findingIndex: 1, consequenceRank: 1, concreteFix: 'src/hot.ts:2 the critical guard' }),
    ];
    const report = composeFinalReport(GT(briefed), COMP(verdicts));
    const section6 = report.slice(report.indexOf('## 6. THE FIX PRIORITIZATION'));
    const hotPos = section6.indexOf('src/hot.ts:2');
    const coldPos = section6.indexOf('src/cold.ts:9');
    expect(hotPos).toBeGreaterThanOrEqual(0);
    expect(coldPos).toBeGreaterThanOrEqual(0);
    expect(hotPos < coldPos).toBe(true);
  });
});
