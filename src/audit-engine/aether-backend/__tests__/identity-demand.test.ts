import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'bun:test';
import { THE_CODE_AUDITOR_PROMPT, THE_ADJUDICATION_RUBRIC, CALIBRATION_SHOTS } from '../identity.js';
import { buildAuditDemand, buildBrief, briefParts, computeConfidence } from '../demand-builder.js';
import type { CandidateTriple } from '../demand-builder.js';

const TGT = path.join(os.tmpdir(), 'tgt');
const SPEC = path.join(os.tmpdir(), 'spec-ARCH_SPEC.md');

function cand(over: Partial<CandidateTriple> = {}): CandidateTriple {
  return { index: 0, layer: 'r-actor', side: 'S1', file: 'src/foo.ts', line: 10, predicate: 'actor started not subscribed', evidenceQuote: 'actor.start();', implicatedSpecClause: 'ARCH_SPEC.md:L212', ...over };
}

describe('identity — THE_CODE_AUDITOR_PROMPT', () => {
  it('contains the five supremacy clauses verbatim', () => {
    expect(THE_CODE_AUDITOR_PROMPT).toContain('THE CODE AND THE SPECS ARE THE ONLY GROUND TRUTH. EVERYTHING ELSE IS BELIEF.');
    expect(THE_CODE_AUDITOR_PROMPT).toContain('1. CODE over context');
    expect(THE_CODE_AUDITOR_PROMPT).toContain('2. EXACT-VALUE DISCIPLINE');
    expect(THE_CODE_AUDITOR_PROMPT).toContain('3. CONTEXT-MISMATCH FLAGGING');
    expect(THE_CODE_AUDITOR_PROMPT).toContain('4. PRIOR RUNS ARE HISTORY');
  });
  it('contains identity header', () => {
    expect(THE_CODE_AUDITOR_PROMPT).toContain('IDENTITY: THE CODE AUDITOR');
    expect(THE_CODE_AUDITOR_PROMPT).toContain('READ-ONLY EVIDENCE');
  });
  it('references all four downstream contracts', () => {
    expect(THE_CODE_AUDITOR_PROMPT).toContain('THE RUBRIC');
    expect(THE_CODE_AUDITOR_PROMPT).toContain('THE WRITE LAW');
    expect(THE_CODE_AUDITOR_PROMPT).toContain('THE REPORT CONTRACT');
    expect(THE_CODE_AUDITOR_PROMPT).toContain('THE PHASES');
  });
  it('is stable — length check', () => {
    expect(THE_CODE_AUDITOR_PROMPT.length).toBeGreaterThan(400);
  });
});

describe('identity — THE_ADJUDICATION_RUBRIC', () => {
  it('contains all 5 laws', () => {
    expect(THE_ADJUDICATION_RUBRIC).toContain('LAW 1');
    expect(THE_ADJUDICATION_RUBRIC).toContain('LAW 2');
    expect(THE_ADJUDICATION_RUBRIC).toContain('LAW 3');
    expect(THE_ADJUDICATION_RUBRIC).toContain('LAW 4');
    expect(THE_ADJUDICATION_RUBRIC).toContain('LAW 5');
  });
  it('LAW 1 requires three legs', () => {
    expect(THE_ADJUDICATION_RUBRIC).toContain('(a) the SPEC clause');
    expect(THE_ADJUDICATION_RUBRIC).toContain('(b) the CODE evidence');
    expect(THE_ADJUDICATION_RUBRIC).toContain('(c) THE DIVERGENCE');
  });
  it('LAW 4 lists all 5 hard bans', () => {
    expect(THE_ADJUDICATION_RUBRIC).toContain('invent a file:line');
    expect(THE_ADJUDICATION_RUBRIC).toContain('cite a spec clause not in THIS run');
    expect(THE_ADJUDICATION_RUBRIC).toContain('conform to the caller');
    expect(THE_ADJUDICATION_RUBRIC).toContain('write outside the ledger');
    expect(THE_ADJUDICATION_RUBRIC).toContain('emit a verdict for a candidate P1 never evidenced');
  });
  it('LAW 5 confidence floor is 0.55 with arithmetic', () => {
    expect(THE_ADJUDICATION_RUBRIC).toContain('0.55');
    expect(THE_ADJUDICATION_RUBRIC).toContain('0.85');
    expect(THE_ADJUDICATION_RUBRIC).toContain('+0.05');
    expect(THE_ADJUDICATION_RUBRIC).toContain('0.15');
  });
});

describe('identity — CALIBRATION_SHOTS', () => {
  it('has exactly 3 shots one per verdict class', () => {
    expect(CALIBRATION_SHOTS.length).toBe(3);
    const verdicts = CALIBRATION_SHOTS.map((s) => s.verdict).sort();
    expect(verdicts).toEqual(['RED_HERRING', 'TRUE_DEFECT', 'UNCLEAR'].sort());
  });
  it('each shot has title and body with file:line anchors', () => {
    for (const shot of CALIBRATION_SHOTS) {
      expect(shot.title.length).toBeGreaterThan(5);
      expect(shot.body.length).toBeGreaterThan(50);
      expect(shot.body).toMatch(/\w+\/\w+\.\w+:\d+/);
    }
  });
  it('TRUE_DEFECT shot has three legs + divergence', () => {
    const td = CALIBRATION_SHOTS.find((s) => s.verdict === 'TRUE_DEFECT')!;
    expect(td.body).toContain('specQuote');
    expect(td.body).toContain('codeQuote');
    expect(td.body).toContain('divergence');
  });
  it('RED_HERRING shot has legitimizingReason', () => {
    const rh = CALIBRATION_SHOTS.find((s) => s.verdict === 'RED_HERRING')!;
    expect(rh.body).toContain('legitimizingReason');
    expect(rh.body).toContain('BECAUSE');
  });
  it('UNCLEAR shot has missingEvidence', () => {
    const uc = CALIBRATION_SHOTS.find((s) => s.verdict === 'UNCLEAR')!;
    expect(uc.body).toContain('missingEvidence');
    expect(uc.body).toContain('cannot adjudicate');
  });
});

describe('computeConfidence — Law 5 as CODE', () => {
  it('base 0.85 with all legs quoted no modifiers', () => {
    const r = computeConfidence({ allLegsQuoted: true });
    expect(r.confidence).toBe(0.85);
    expect(r.verdict).toBe('TRUE_DEFECT');
  });
  it('+0.05 per D-mode', () => {
    const r = computeConfidence({ allLegsQuoted: true, derailmentMode: 'D2' });
    expect(r.confidence).toBe(0.9);
  });
  it('-0.15 for paraphrased leg', () => {
    const r = computeConfidence({ allLegsQuoted: true, anyLegParaphrased: true });
    expect(r.confidence).toBe(0.7);
  });
  it('both modifiers: 0.85 +0.05 -0.15 = 0.75', () => {
    const r = computeConfidence({ allLegsQuoted: true, derailmentMode: 'D4', anyLegParaphrased: true });
    expect(r.confidence).toBe(0.75);
  });
  it('paraphrased still TRUE_DEFECT when above floor', () => {
    const r = computeConfidence({ allLegsQuoted: true, anyLegParaphrased: true });
    expect(r.confidence).toBe(0.7);
    expect(r.verdict).toBe('TRUE_DEFECT');
  });
  it('not all legs quoted yields UNCLEAR', () => {
    const r = computeConfidence({ allLegsQuoted: false, anyLegParaphrased: true });
    expect(r.verdict).toBe('UNCLEAR');
  });
  it('not all legs quoted without paraphrase also UNCLEAR', () => {
    const r = computeConfidence({ allLegsQuoted: false });
    expect(r.verdict).toBe('UNCLEAR');
    expect(r.reason).toContain('not all three legs');
  });
  it('confidence never exceeds 1.0', () => {
    const r = computeConfidence({ allLegsQuoted: true, derailmentMode: 'D1' });
    expect(r.confidence).toBeLessThanOrEqual(1.0);
  });
  it('empty derailmentMode string treated as no modifier', () => {
    const r = computeConfidence({ allLegsQuoted: true, derailmentMode: '' });
    expect(r.confidence).toBe(0.85);
  });
  it('concurrent pure no shared state', () => {
    const a = computeConfidence({ allLegsQuoted: true });
    const b = computeConfidence({ allLegsQuoted: true, derailmentMode: 'D1', anyLegParaphrased: true });
    expect(a.confidence).toBe(0.85);
    expect(b.confidence).toBe(0.75);
  });
});

describe('buildAuditDemand — interfaces and validation', () => {
  it('happy path builds AuditDemand with budgetRounds', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [cand()], focuses: ['adapter wiring in brains/'] });
    expect(d.runId).toBe('audit-1');
    expect(d.budgetRounds).toBe(5);
    expect(d.focuses.length).toBe(1);
  });
  it('chain defaults to empty', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [] });
    expect(d.chain.length).toBe(0);
    expect(d.budgetRounds).toBe(3);
  });
  it('focuses defaults to empty', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [] });
    expect(d.focuses.length).toBe(0);
  });
  it('budgetRounds pins: 4->5 12->6 80->14', () => {
    const mk = (n: number) => buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: Array.from({ length: n }, (_, i) => cand({ index: i })) });
    expect(mk(4).budgetRounds).toBe(5);
    expect(mk(12).budgetRounds).toBe(6);
    expect(mk(80).budgetRounds).toBe(14);
  });
  it('empty specs throws MC-S-02', () => {
    expect(() => buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [], candidates: [] })).toThrow();
  });
  it('empty runId throws', () => {
    expect(() => buildAuditDemand({ runId: '', targetRoot: TGT, specs: [SPEC], candidates: [] })).toThrow();
  });
  it('empty targetRoot throws', () => {
    expect(() => buildAuditDemand({ runId: 'audit-1', targetRoot: '', specs: [SPEC], candidates: [] })).toThrow();
  });
  it('null candidates throws', () => {
    expect(() => buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: null as unknown as CandidateTriple[] })).toThrow();
  });
  it('candidate missing required fields throws', () => {
    expect(() => buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [{ index: 0 } as unknown as CandidateTriple] })).toThrow();
  });
  it('spec with empty string throws', () => {
    expect(() => buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [''], candidates: [] })).toThrow();
  });
  it('concurrent independent builds do not share state', () => {
    const a = buildAuditDemand({ runId: 'audit-a', targetRoot: TGT, specs: [SPEC], candidates: [cand({ index: 0 })] });
    const b = buildAuditDemand({ runId: 'audit-b', targetRoot: TGT, specs: [SPEC], candidates: [] });
    expect(a.runId).toBe('audit-a');
    expect(b.candidates.length).toBe(0);
    expect(a.candidates.length).toBe(1);
  });
  it('boundary 0 candidates honest-empty', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [] });
    expect(d.candidates.length).toBe(0);
    expect(d.budgetRounds).toBe(3);
  });
  it('boundary single spec', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [cand()] });
    expect(d.specs.length).toBe(1);
  });
});

describe('buildBrief — five-part order structural', () => {
  it('produces exactly 5 parts in spec order', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [cand()] });
    const brief = buildBrief(d);
    const parts = briefParts(brief);
    expect(parts.length).toBe(5);
    expect(parts[0]).toContain('PART 1');
    expect(parts[0]).toContain('THE CODE AND THE SPECS ARE THE ONLY GROUND TRUTH');
    expect(parts[1]).toContain('PART 2');
    expect(parts[1]).toContain('[AETHER INFERENCE]');
    expect(parts[2]).toContain('PART 3');
    expect(parts[2]).toContain('THE SPECS INGEST');
    expect(parts[3]).toContain('PART 4');
    expect(parts[3]).toContain('THE CANDIDATES');
    expect(parts[4]).toContain('PART 5');
    expect(parts[4]).toContain('THE FOCUSES');
  });
  it('mutation: swapping parts would fail order assertion — order is structural', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [cand()] });
    const brief = buildBrief(d);
    const parts = briefParts(brief);
    expect(parts[0]).toContain('PART 1');
    expect(parts[0]).not.toContain('PART 2');
    expect(parts[1]).toContain('PART 2');
    expect(parts[1]).not.toContain('PART 3');
    expect(parts[2]).toContain('PART 3');
    expect(parts[2]).not.toContain('PART 1');
  });
  it('empty-candidates still composes valid brief honest-empty', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [] });
    const brief = buildBrief(d);
    const parts = briefParts(brief);
    expect(parts.length).toBe(5);
    expect(parts[3]).toContain('honest-empty');
    expect(brief.length).toBeGreaterThan(500);
  });
  it('specs ingest carries spec path and content or fallback', () => {
    const tmpSpec = path.join(os.tmpdir(), `spec-brief-${Date.now()}.md`);
    fs.writeFileSync(tmpSpec, '# Hello spec\nThis is the spec content for the brief.', 'utf-8');
    try {
      const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [tmpSpec], candidates: [] });
      const brief = buildBrief(d);
      const parts = briefParts(brief);
      expect(parts[2]).toContain(tmpSpec);
      expect(parts[2]).toContain('Hello spec');
    } finally { fs.unlinkSync(tmpSpec); }
  });
  it('candidates part carries each candidate verbatim', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [cand({ index: 0, layer: 'r-lexicon', file: 'src/x.ts', line: 42, predicate: 'regex-only matcher' }), cand({ index: 1, layer: 'r-actor', file: 'src/y.ts', line: 7 })] });
    const brief = buildBrief(d);
    const parts = briefParts(brief);
    expect(parts[3]).toContain('CANDIDATE 0');
    expect(parts[3]).toContain('CANDIDATE 1');
    expect(parts[3]).toContain('r-lexicon');
    expect(parts[3]).toContain('src/x.ts:42');
  });
  it('chain appears in PART 2', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [], chain: [{ runId: 'audit-0', seq: 1, targetRoot: TGT, countsJson: '{"trueDefect":2}', topFindings: [{ findingIndex: 0, layer: 'r-actor', verdict: 'TRUE_DEFECT', confidence: 0.9, oneLiner: 'actor blind' }] }] });
    const brief = buildBrief(d);
    const parts = briefParts(brief);
    expect(parts[1]).toContain('audit-0');
    expect(parts[1]).toContain('actor blind');
  });
  it('focuses appear in PART 5', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [], focuses: ['adapter wiring in brains/'] });
    const brief = buildBrief(d);
    const parts = briefParts(brief);
    expect(parts[4]).toContain('adapter wiring');
  });
  it('report contract and rubric are in PART 5', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [] });
    const brief = buildBrief(d);
    const parts = briefParts(brief);
    expect(parts[4]).toContain('REPORT CONTRACT');
    expect(parts[4]).toContain('LAW 1');
  });
  it('null demand throws', () => {
    expect(() => buildBrief(null as unknown as never)).toThrow();
  });
  it('empty specs throws MC-S-02', () => {
    expect(() => buildBrief({ runId: 'audit-1', targetRoot: TGT, specs: [], focuses: [], candidates: [], chain: [], budgetRounds: 3 } as never)).toThrow();
  });
  it('brief is deterministic', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: [cand()] });
    expect(buildBrief(d)).toBe(buildBrief(d));
  });
  it('concurrent briefs are independent', () => {
    const a = buildAuditDemand({ runId: 'audit-a', targetRoot: TGT, specs: [SPEC], candidates: [cand({ index: 0 })] });
    const b = buildAuditDemand({ runId: 'audit-b', targetRoot: TGT, specs: [SPEC], candidates: [] });
    const ba = buildBrief(a);
    const bb = buildBrief(b);
    expect(ba).toContain('CANDIDATE 0');
    expect(bb).toContain('honest-empty');
    expect(ba).not.toContain('honest-empty');
  });
  it('large candidate set 80 still composes', () => {
    const d = buildAuditDemand({ runId: 'audit-1', targetRoot: TGT, specs: [SPEC], candidates: Array.from({ length: 80 }, (_, i) => cand({ index: i })) });
    const brief = buildBrief(d);
    const parts = briefParts(brief);
    expect(parts[3]).toContain('CANDIDATE 79');
    expect(d.budgetRounds).toBe(14);
  });
});
