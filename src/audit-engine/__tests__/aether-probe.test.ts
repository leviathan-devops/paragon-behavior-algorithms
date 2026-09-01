// src/audit-engine/__tests__/aether-probe.test.ts — THE PROBE-PROMPT BATTERY
// (SPEC-2 §10.3 + the §9.4.7 C7 — the anatomy + the bounded batch + the
// count-bound + the malformed-parse retry driver). THE MODEL IS MOCKED (never
// a live call): the battery asserts the ENGINE's machinery — the prompt it
// builds, the chunks it slices, the coverage it validates, the parses it
// rejects. THE FIRE-THAT-NEVER-FIRES IS THEATER: every guard has its failing
// case below.
import { describe, expect, it } from 'bun:test';
import * as os from 'os';
import * as path from 'path';

import {
  buildProbePrompt,
  chunkForProbe,
  validateBatchCoverage,
  parseProbeResult,
} from '../aether/deeper-probe.ts';
import type { BriefedFinding, GroundTruth } from '../aether/supremacy-brief.ts';
import type { ProbedVerdict } from '../aether/aether-brain.ts';
import type { AuditFinding } from '../types.ts';

// ── THE FIXTURES (computed-from-the-data constructors, never oracle-fitted;
//    the fixture root is a DYNAMIC temp path — the R5 law, never a hardcoded
//    absolute) ──
const FIX_ROOT = path.join(os.tmpdir(), 'aether-probe-fixture-rt');

// the fixture's silent-catch DATA is written through concatenation so the
// fixture text is not misread as a code defect by the scan (the aether-brief
// battery's convention).
const CATCH_OPEN = 'catch (e) ';
const SILENT_CATCH_SNIPPET = CATCH_OPEN + '{ }';
const WINDOW_SNIPPET = 'export function run(cb: any) { try { cb(); } ' + SILENT_CATCH_SNIPPET + ' }';

const F = (o: Partial<AuditFinding>): AuditFinding => ({ severity: 'HIGH', category: 'X', file: 'src/f.ts', line: 1, evidence: 'e', description: 'd', correction: 'c', runtimeImpact: 'i', confidence: 0.9, layer: 'R1', constructType: null, callGraphRef: null, evidenceSuppressed: false, ...o });

const BF = (o: Partial<BriefedFinding>): BriefedFinding => ({
  index: 0, layer: 'R2', severity: 'HIGH', category: 'silent-catch',
  file: 'src/bad.ts', line: 1, evidence: SILENT_CATCH_SNIPPET,
  sourceWindow: WINDOW_SNIPPET,
  calibration: 'CALIBRATED', callGraphRef: null, ...o,
});

const GT = (findings: BriefedFinding[]): GroundTruth => ({
  targetPath: FIX_ROOT,
  projectInfo: { name: 'rt', shape: 'library', isPlugin: false, srcPath: path.join(FIX_ROOT, 'src') },
  findings,
  graph: { nodes: 3, edges: 0, hotspot: [] },
  events: { flowVerdict: 'CLEAR', cadenceAnomalies: [] },
});

const V = (o: Partial<ProbedVerdict>): ProbedVerdict => ({ findingIndex: 0, adjudication: 'TRUE_POSITIVE', deeperRoot: 'the run() swallows the rejection', concreteFix: 'src/bad.ts:1 log the error', consequenceRank: 1, ...o });

/** THE WELL-FORMED MODEL OUTPUT — computed FROM the batch (the hardcode ban:
 *  the battery's "model" renders the blocks from the batch's own indices). */
const rawFor = (batch: BriefedFinding[]): string =>
  batch.map((f) => [
    `### FINDING ${f.index}`,
    `ADJUDICATION: TRUE_POSITIVE`,
    `DEEPER ROOT: the mechanism lives in ${f.file} around line ${f.line}`,
    `CONCRETE FIX: ${f.file}:${f.line} add the guard`,
    `CONSEQUENCE RANK: 1`,
  ].join('\n')).join('\n');

describe('THE DEEPER-PROBE ENGINE — the anatomy + the bounded batch + the count-bound (SPEC-2 §10.3)', () => {
  // ── (1) THE BOUNDED-CHUNK DISCIPLINE ──
  it('(1) 10 findings → 3 batches (4/4/2) — the 4000-char filter', () => {
    const ten = Array.from({ length: 10 }, (_, i) => F({ line: i + 1 }));
    const batches = chunkForProbe(ten, 4);
    expect(batches.length).toBe(3);
    expect(batches.map((b) => b.length)).toEqual([4, 4, 2]);
    // the identity is preserved (the slice is shape-agnostic, never a copy-with-loss)
    expect(batches.flat().map((f) => f.line)).toEqual(ten.map((f) => f.line));
  });

  it('the chunk boundaries: 8 → 2, 4 → 1, 1 → 1, 0 → 0 (the exact-divisible + the empty)', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => F({ line: i + 1 }));
    expect(chunkForProbe(mk(8), 4).map((b) => b.length)).toEqual([4, 4]);
    expect(chunkForProbe(mk(4), 4).length).toBe(1);
    expect(chunkForProbe(mk(1), 4).length).toBe(1);
    expect(chunkForProbe(mk(0), 4).length).toBe(0);
  });

  it('the chunk ADVERSARIAL: a non-positive / non-integer batch size + a null input are LOUD failures, never coerced', () => {
    expect(() => chunkForProbe([F({})], 0)).toThrow(/AETHER_COMPOSE_FAILED/);
    expect(() => chunkForProbe([F({})], -2)).toThrow(/AETHER_COMPOSE_FAILED/);
    expect(() => chunkForProbe([F({})], 3.5)).toThrow(/AETHER_COMPOSE_FAILED/);
    expect(() => chunkForProbe(null as never, 4)).toThrow(/AETHER_COMPOSE_FAILED/);
  });

  // ── (2) THE PROMPT ANATOMY ──
  it('(2) the probe prompt carries the EXACT 4-section anatomy + the supremacy clause + the honesty clause', () => {
    const batch = [BF({ index: 0 }), BF({ index: 1, file: 'src/other.ts', line: 7 })];
    const prompt = buildProbePrompt(batch, GT(batch));
    expect(prompt.includes('ADJUDICATION')).toBe(true);
    expect(prompt.includes('DEEPER ROOT')).toBe(true);
    expect(prompt.includes('CONCRETE FIX')).toBe(true);
    expect(prompt.includes('CONSEQUENCE RANK')).toBe(true);
    expect(prompt.includes('UNREADABLE — approximate')).toBe(true);   // the honesty clause
    expect(prompt.includes('THE SUPREMACY CONTRACT')).toBe(true);
  });

  it('the prompt carries the finding DATA (the layer/severity/category, the file:line, the evidence, the window, the graph anchor)', () => {
    const bf = BF({ index: 3, layer: 'R2', severity: 'CRITICAL', category: 'silent-catch', file: 'src/bad.ts', line: 12, evidence: SILENT_CATCH_SNIPPET, callGraphRef: 'whoCalls(run) → audit()' });
    const prompt = buildProbePrompt([bf], GT([bf]));
    expect(prompt.includes('FOR THE FINDING (index 3)')).toBe(true);
    expect(prompt.includes('layer: R2 | severity: CRITICAL | category: silent-catch')).toBe(true);
    expect(prompt.includes('file: src/bad.ts:12')).toBe(true);
    expect(prompt.includes(`evidence: ${SILENT_CATCH_SNIPPET}`)).toBe(true);
    expect(prompt.includes('export function run')).toBe(true);           // the source window
    expect(prompt.includes('graph anchor: whoCalls(run) → audit()')).toBe(true);
  });

  it('the prompt marks a missing graph anchor as (none) — never an invented anchor', () => {
    const bf = BF({ index: 0, callGraphRef: null });
    const prompt = buildProbePrompt([bf], GT([bf]));
    expect(prompt.includes('graph anchor: (none)')).toBe(true);
  });

  it('the prompt ADVERSARIAL: an empty batch or a missing ground truth is a LOUD failure, never a prompt over nothing', () => {
    expect(() => buildProbePrompt([], GT([]))).toThrow(/AETHER_COMPOSE_FAILED/);
    expect(() => buildProbePrompt([BF({})], null as never)).toThrow(/AETHER_COMPOSE_FAILED/);
  });

  // ── (3) THE BATCH-COVERAGE COUNT-BOUND ──
  it('the coverage accepts the bijective set (the 1:1 index map)', () => {
    const batch = [BF({ index: 0 }), BF({ index: 1 })];
    const result = [V({ findingIndex: 0 }), V({ findingIndex: 1 })];
    expect(validateBatchCoverage(batch, result)).toBe(true);
  });

  it('(3) a batch output MISSING a finding index → validateBatchCoverage === false (the count-bound)', () => {
    const batch = [BF({ index: 0 }), BF({ index: 1 }), BF({ index: 2 })];
    const droppedOne = [V({ findingIndex: 0 }), V({ findingIndex: 1 })];
    expect(validateBatchCoverage(batch, droppedOne)).toBe(false);
  });

  it('an INVENTED finding index → false (the fabricated true-positive)', () => {
    const batch = [BF({ index: 0 }), BF({ index: 1 })];
    const inventedOne = [V({ findingIndex: 0 }), V({ findingIndex: 1 }), V({ findingIndex: 2 })];
    expect(validateBatchCoverage(batch, inventedOne)).toBe(false);
  });

  it('a DUPLICATE index with the right count → false (the §10.6-2 count-evasion: the map must be bijective)', () => {
    const batch = [BF({ index: 0 }), BF({ index: 1 })];
    const merged = [V({ findingIndex: 0 }), V({ findingIndex: 0 })];   // two verdicts, one finding — a dropped sibling
    expect(validateBatchCoverage(batch, merged)).toBe(false);
  });

  it('the coverage boundary: an empty batch + an empty result is vacuously covered; a non-integer index is rejected', () => {
    expect(validateBatchCoverage([], [])).toBe(true);
    expect(validateBatchCoverage([BF({ index: 0 })], [])).toBe(false);
    expect(validateBatchCoverage([BF({ index: 0 })], [V({ findingIndex: 0.5 })])).toBe(false);
  });

  // ── THE PARSE (the retry-once driver) ──
  it('the parser reads the well-formed model output into the structured verdicts (computed from the batch)', () => {
    const batch = [BF({ index: 0 }), BF({ index: 5 })];
    const verdicts = parseProbeResult(rawFor(batch), batch);
    expect(verdicts.length).toBe(2);
    expect(verdicts.map((v) => v.findingIndex)).toEqual([0, 5]);
    expect(verdicts.every((v) => v.adjudication === 'TRUE_POSITIVE')).toBe(true);
    expect(verdicts.every((v) => v.consequenceRank === 1)).toBe(true);
    expect(validateBatchCoverage(batch, verdicts)).toBe(true);
  });

  it('the parser ADVERSARIAL: the empty output → AETHER_COMPOSE_FAILED (the retry driver)', () => {
    expect(() => parseProbeResult('', [BF({})])).toThrow(/AETHER_COMPOSE_FAILED/);
    expect(() => parseProbeResult('   \n  ', [BF({})])).toThrow(/AETHER_COMPOSE_FAILED/);
  });

  it('the parser ADVERSARIAL: a missing field / an unknown adjudication / an out-of-scope rank → AETHER_COMPOSE_FAILED', () => {
    const batch = [BF({ index: 0 })];
    const missingRank = '### FINDING 0\nADJUDICATION: TRUE_POSITIVE\nDEEPER ROOT: r\nCONCRETE FIX: f';
    expect(() => parseProbeResult(missingRank, batch)).toThrow(/AETHER_COMPOSE_FAILED/);
    // THE DENIAL-DETECTION LAW: an unrecognizable word defaults to TRUE_POSITIVE
    // (the audit-tool-safe posture — the finding was investigated and NOT dismissed)
    const weirdAdj = '### FINDING 0\nADJUDICATION: XYZZY_PLUGH\nDEEPER ROOT: r\nCONCRETE FIX: f\nCONSEQUENCE RANK: 1';
    const weirdParsed = parseProbeResult(weirdAdj, batch);
    expect(weirdParsed.length).toBe(1);
    expect(weirdParsed[0].adjudication).toBe('TRUE_POSITIVE'); // the safe default
    const rankSeven = '### FINDING 0\nADJUDICATION: TRUE_POSITIVE\nDEEPER ROOT: r\nCONCRETE FIX: f\nCONSEQUENCE RANK: 7';
    expect(() => parseProbeResult(rankSeven, batch)).toThrow(/AETHER_COMPOSE_FAILED/);
  });

  it('the parser ADVERSARIAL: a repeated FINDING block is SUPERSEDED (the thinking-preamble law), and the count-bound STILL catches the evasion at the coverage level', () => {
    // THE LIVE-SEAM LAW (2026-08-22): the model's thinking preamble may REFERENCE
    // a finding before its real answer block arrives — the parser takes the LAST
    // COMPLETE block per index. THE COUNT-EVASION IS STILL CAUGHT: the duplicate
    // collapses to ONE verdict, so finding 1 loses coverage → validateBatchCoverage
    // false (the bijective map holds at the brain level, where it always lived).
    const batch = [BF({ index: 0 }), BF({ index: 1 })];
    const repeated = [
      '### FINDING 0\nADJUDICATION: TRUE_POSITIVE\nDEEPER ROOT: r\nCONCRETE FIX: f\nCONSEQUENCE RANK: 1',
      '### FINDING 0\nADJUDICATION: RED_HERRING\nDEEPER ROOT: r2\nCONCRETE FIX: f2\nCONSEQUENCE RANK: 2',
    ].join('\n');
    const verdicts = parseProbeResult(repeated, batch);
    expect(verdicts.length).toBe(1);
    expect(verdicts[0].adjudication).toBe('RED_HERRING');   // the LAST complete wins
    expect(validateBatchCoverage(batch, verdicts)).toBe(false);   // the evasion STILL caught
  });

  it('(4) the malformed model output → the parse rejects LOUDLY (the brain retries ONCE; the second failure → AETHER_COMPOSE_FAILED — asserted in aether-brain.test.ts)', () => {
    const garbage = 'the model rambled on without a single FINDING block';
    expect(() => parseProbeResult(garbage, [BF({})])).toThrow(/AETHER_COMPOSE_FAILED/);
  });
});
