import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { runAuditPipeline } from '../runner.js';
import { budgetRounds } from '../phase-controller.js';
import { REPORT_MARKERS } from '../report/markers.js';
import type { CandidateTriple } from '../demand-builder.js';

function mkTmp(prefix = 'ledger-'): string { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function rmTmp(p: string) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e: unknown) { void (e instanceof Error ? e.message : String(e)); } }
function writeSpec(dir: string, name: string, content: string): string { const p = path.join(dir, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content, 'utf-8'); return p; }
function writeTargetFile(targetRoot: string, rel: string, content: string): string { const p = path.join(targetRoot, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content, 'utf-8'); return p; }
function cand(over: Partial<CandidateTriple> = {}): CandidateTriple {
  return { index: 0, layer: 'r-actor', side: 'S1', file: 'src/foo.ts', line: 10, predicate: 'actor started not subscribed', evidenceQuote: 'actor.start();', implicatedSpecClause: 'ARCH_SPEC.md:L100', ...over };
}
function reportMd(runId: string, targetRoot: string, opts?: { probeMs?: number; budget?: number; used?: number; stamp?: string }): string {
  const probe = opts?.probeMs ?? 120;
  const budget = opts?.budget ?? 6;
  const used = opts?.used ?? 4;
  const stamp = opts?.stamp ?? 'claimsRechecked:12 discrepanciesFound:1 discrepanciesFixed:1 writeViolations:0';
  return `# CODE AUDIT AETHER REPORT \u2014 ${targetRoot} \u2014 ${runId}
## 0 RUN METADATA
provider opencode-go/muse-spark-1.2-contributor budget ${budget} used ${used} probe ${probe}ms
## 1 THE VERDICT TABLE
| idx | layer | verdict | spec clause | file:line | conf |
| 0 | r-actor | TRUE_DEFECT | ARCH_SPEC.md:L100 | src/module-0.ts:10 | 0.90 |
## 2 TRUE DEFECTS
WHAT THE SPEC DECLARES (ARCH_SPEC.md:L100): the spec declares X
WHAT THE CODE SHOWS (src/module-0.ts:10): the code does Y
THE DIVERGENCE: spec declares X; code does Y; gap Z
THE CORRECTION: restore
## 3 THE KILL LOG
(none)
## 4 THE ESCALATION QUEUE
(queue)
## 5 THE SYNTHESIS
synthesis
## 6 THE SELF-VERIFY STAMP
${stamp}
`;
}

const okProbe: import('../probe.js').ProbeTransport = { fetch: async () => ({ status: 200, ok: true, text: async () => 'ok' }) };

function makeCandidates(specPath: string): CandidateTriple[] {
  const defs: Array<{ layer: string; side: string; file: string; line: number }> = [
    { layer: 'r-actor', side: 'S1', file: 'src/module-0.ts', line: 10 },
    { layer: 'r-actor', side: 'S2', file: 'src/module-1.ts', line: 20 },
    { layer: 'r-actor', side: 'S1', file: 'src/module-2.ts', line: 30 },
    { layer: 'r-lexicon', side: 'S1', file: 'src/module-3.ts', line: 40 },
    { layer: 'r-lexicon', side: 'S2', file: 'src/module-4.ts', line: 50 },
    { layer: 'r-state-machine', side: 'S1', file: 'src/module-5.ts', line: 60 },
    { layer: 'r-state-machine', side: 'S2', file: 'src/module-6.ts', line: 70 },
    { layer: 'r-engine', side: 'S1', file: 'src/module-7.ts', line: 80 },
    { layer: 'r-engine', side: 'S2', file: 'src/module-8.ts', line: 90 },
    { layer: 'r-adapter', side: 'S1', file: 'src/module-9.ts', line: 100 },
    { layer: 'r-mpse', side: 'S1', file: 'src/module-10.ts', line: 110 },
    { layer: 'r-mpse', side: 'S2', file: 'src/module-11.ts', line: 120 },
  ];
  return defs.map((d, i) => cand({ index: i, layer: d.layer, side: d.side, file: d.file, line: d.line, predicate: `predicate ${d.layer} ${i}`, evidenceQuote: `evidenceQuote window for ${d.file}:${d.line} — code snippet ${i}`, implicatedSpecClause: `${specPath}:L${100 + i}` }));
}

function makeVerdictsCorrected(runId: string, specPath: string) {
  const tdQuote = 'the spec declares every actor that start()s MUST subscribe to CHILD_FAILED';
  return {
    runId,
    verdicts: [
      { findingIndex: 0, layer: 'r-actor', adjudication: 'TRUE_DEFECT' as const, file: 'src/module-0.ts', line: 10, specPath, specLine: 100, specQuote: tdQuote, codeQuote: 'actor.start(); // module-0', divergence: 'spec declares every started actor subscribes to CHILD_FAILED (ARCH_SPEC.md:L100); code at src/module-0.ts:10 starts without subscribing; gap is silent supervisor-blind actor', confidence: 0.92 },
      { findingIndex: 1, layer: 'r-actor', adjudication: 'TRUE_DEFECT' as const, file: 'src/module-1.ts', line: 20, specPath, specLine: 101, specQuote: tdQuote, codeQuote: 'actor.start(); // module-1', divergence: 'spec declares MUST subscribe; code at src/module-1.ts:20 violates; gap D1', confidence: 0.9 },
      { findingIndex: 2, layer: 'r-actor', adjudication: 'TRUE_DEFECT' as const, file: 'src/module-2.ts', line: 30, specPath, specLine: 102, specQuote: 'adapter registry MUST expose snapshot + merge', codeQuote: 'registry.init(); // module-2', divergence: 'spec declares adapter registry MUST expose snapshot+merge; code at src/module-2.ts:30 omits merge; gap adapter incomplete', confidence: 0.88 },
      { findingIndex: 3, layer: 'r-lexicon', adjudication: 'TRUE_DEFECT' as const, file: 'src/module-3.ts', line: 40, specPath, specLine: 103, specQuote: 'writes are scoped to the ledger (codebase under audit is READ-ONLY evidence)', codeQuote: 'fs.writeFileSync(p,x); // module-3', divergence: 'spec declares writes scoped to ledger; code at src/module-3.ts:40 writes outside; gap D4', confidence: 0.95 },
      { findingIndex: 4, layer: 'r-lexicon', adjudication: 'TRUE_DEFECT' as const, file: 'src/module-4.ts', line: 50, specPath, specLine: 104, specQuote: 'thresholds MUST carry provenance comment', codeQuote: 'const T=0.77; // module-4', divergence: 'spec declares thresholds MUST carry provenance; code at src/module-4.ts:50 bare numeric; gap lexicon', confidence: 0.87 },
      { findingIndex: 5, layer: 'r-state-machine', adjudication: 'RED_HERRING' as const, file: 'src/module-5.ts', line: 60, legitimizingReason: 'cosmetic-but-legitimate BECAUSE state machine transition is guarded by explicit phase check — not a defect', confidence: 0.8 },
      { findingIndex: 6, layer: 'r-state-machine', adjudication: 'RED_HERRING' as const, file: 'src/module-6.ts', line: 70, legitimizingReason: 'shape is legitimate BECAUSE the SM handler carries exhaustive switch with default throw — covered', confidence: 0.82 },
      { findingIndex: 7, layer: 'r-engine', adjudication: 'RED_HERRING' as const, file: 'src/module-7.ts', line: 80, legitimizingReason: 'legitimate BECAUSE engine call is behind feature flag with fallback — not a gap', confidence: 0.79 },
      { findingIndex: 8, layer: 'r-engine', adjudication: 'RED_HERRING' as const, file: 'src/module-8.ts', line: 90, legitimizingReason: 'legitimate BECAUSE engine adapter delegates to canonical impl — no divergence', confidence: 0.81 },
      { findingIndex: 9, layer: 'r-adapter', adjudication: 'RED_HERRING' as const, file: 'src/module-9.ts', line: 100, legitimizingReason: 'legitimate BECAUSE adapter wiring matches spec snapshot+merge contract — verified via read', confidence: 0.85 },
      { findingIndex: 10, layer: 'r-mpse', adjudication: 'RED_HERRING' as const, file: 'src/module-10.ts', line: 110, legitimizingReason: 'legitimate BECAUSE MPSE triplet present with pattern+state+evidence — no missing leg', confidence: 0.83 },
      { findingIndex: 11, layer: 'r-mpse', adjudication: 'UNCLEAR' as const, file: 'src/module-11.ts', line: 120, missingEvidence: 'UNCLEAR — conflicting evidence: MPSE leg paraphrased vs verbatim, cannot resolve without deeper read', confidence: 0.6 },
    ],
  };
}
function makeVerdictsDefective(runId: string, specPath: string) {
  const v = makeVerdictsCorrected(runId, specPath) as unknown as { runId: string; verdicts: Record<string, unknown>[] };
  // intentionally drop specQuote from first TRUE_DEFECT to trigger V2
  delete (v.verdicts[0] as Record<string, unknown>).specQuote;
  return v;
}

describe('S-3 LEDGER ARTIFACTS — aether.verdict.integrity + S-4 budget pins', () => {
  let targetRoot: string;
  let specsDir: string;
  let specPath: string;
  let runIdCounter = 0;
  function nextRunId(prefix: string): string { runIdCounter++; return `${prefix}-${Date.now()}-${runIdCounter}-${Math.random().toString(36).slice(2, 6)}`; }

  beforeEach(() => {
    targetRoot = mkTmp('ledger-tgt-');
    specsDir = mkTmp('ledger-spec-');
    specPath = writeSpec(specsDir, 'ARCH_SPEC.md', '# ARCH_SPEC\nLine 100: the spec declares every actor that start()s MUST subscribe to CHILD_FAILED\nLine 101: the spec declares every actor that start()s MUST subscribe to CHILD_FAILED (repeat)\nLine 102: adapter registry MUST expose snapshot + merge\nLine 103: writes are scoped to the ledger (the codebase under audit is READ-ONLY evidence)\nLine 104: thresholds MUST carry provenance comment\nLine 105: state machine transitions guarded\nLine 106: engine invariants\n');
    const cands = makeCandidates(specPath);
    for (const c of cands) writeTargetFile(targetRoot, c.file, `// ${c.file}:${c.line}\nline2\n${c.evidenceQuote}\nline4\n`);
  });
  afterEach(() => { rmTmp(targetRoot); rmTmp(specsDir); });

  it('S-4 budgetRounds pins 5/6/14 and boundaries', () => {
    expect(budgetRounds(4)).toBe(5);
    expect(budgetRounds(12)).toBe(6);
    expect(budgetRounds(80)).toBe(14);
    expect(budgetRounds(0)).toBe(3);
    expect(budgetRounds(-1)).toBe(3);
    expect(budgetRounds(1)).toBe(5);
    expect(budgetRounds(8)).toBe(5);
    expect(budgetRounds(9)).toBe(6);
  });

  it('happy path with 12 candidates + repair loop produces 3 artifact classes on disk', async () => {
    const runId = nextRunId('ledger-happy');
    const candidates = makeCandidates(specPath);
    const repairTranscript: string[] = [];
    const agentRunFn = async (opts: { ledgerRoot: string; demand: string }) => {
      const isRepair = opts.demand.includes('VALIDATOR_REJECT');
      if (isRepair) repairTranscript.push(opts.demand);
      fs.mkdirSync(opts.ledgerRoot, { recursive: true });
      fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      if (!isRepair) {
        const defective = makeVerdictsDefective(runId, specPath);
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(defective, null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot, { budget: budgetRounds(candidates.length), used: 4, stamp: 'claimsRechecked:12 discrepanciesFound:1 discrepanciesFixed:0 writeViolations:0' }), 'utf-8');
        return { text: 'defective first', roundsUsed: 4, errors: [] as string[] };
      } else {
        const corrected = makeVerdictsCorrected(runId, specPath);
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(corrected, null, 2), 'utf-8');
        const fixedReport = reportMd(runId, targetRoot, { budget: budgetRounds(candidates.length), used: 5, stamp: 'claimsRechecked:12 discrepanciesFound:1 discrepanciesFixed:1 writeViolations:0' });
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), fixedReport, 'utf-8');
        return { text: fixedReport, roundsUsed: 5, errors: [] as string[] };
      }
    };
    const manifestJson = await runAuditPipeline({ runId, targetRoot, specs: [specPath], candidates, probeTransport: okProbe, agentRunFn: agentRunFn as never });
    const manifest = JSON.parse(manifestJson);
    expect(manifest.ready).toBe(true);
    expect(typeof manifest.ready).toBe('boolean');
    expect(manifest.wallClockMs).toBeGreaterThanOrEqual(0);
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    expect(fs.existsSync(path.join(ledgerRoot, 'verdicts.json'))).toBe(true);
    expect(fs.existsSync(path.join(ledgerRoot, 'report.md'))).toBe(true);
    expect(fs.existsSync(path.join(ledgerRoot, 'manifest.json'))).toBe(true);
    const verdictsFile = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'verdicts.json'), 'utf-8'));
    expect(verdictsFile.verdicts.length).toBe(12);
    const tds = verdictsFile.verdicts.filter((v: { adjudication: string }) => v.adjudication === 'TRUE_DEFECT');
    expect(tds.length).toBe(5);
    for (const v of tds) {
      expect(typeof v.specPath).toBe('string'); expect(v.specPath.length > 0).toBe(true);
      expect(typeof v.specQuote).toBe('string'); expect(v.specQuote.length > 0).toBe(true);
      expect(typeof v.divergence).toBe('string'); expect(v.divergence.length > 0).toBe(true);
      expect(typeof v.codeQuote).toBe('string'); expect(v.codeQuote.length > 0).toBe(true);
      expect(typeof v.confidence).toBe('number');
    }
    const reportText = fs.readFileSync(path.join(ledgerRoot, 'report.md'), 'utf-8');
    let markerHits = 0; for (const m of REPORT_MARKERS) if (reportText.includes(m)) markerHits++;
    expect(markerHits).toBe(8);
    expect(markerHits).toBe(REPORT_MARKERS.length);
    // manifest reconcile: candidatesIn == td+rh+uc (+unclassified when not ready)
    expect(manifest.counts.candidatesIn).toBe(12);
    expect(manifest.counts.candidatesIn).toBe(manifest.counts.trueDefect + manifest.counts.redHerring + manifest.counts.unclear + manifest.counts.unclassifiedEmitted);
    expect(manifest.counts.trueDefect).toBe(5); expect(manifest.counts.redHerring).toBe(6); expect(manifest.counts.unclear).toBe(1);
    expect(manifest.counts.unclassifiedEmitted).toBe(0);
    expect(manifest.rounds.used).toBeLessThanOrEqual(manifest.rounds.budget);
    expect(manifest.rounds.budget).toBe(budgetRounds(12));
    expect(manifest.validatorRejects).toBeGreaterThanOrEqual(1);
    expect(manifest.validatorRejects).toBeLessThanOrEqual(2);
    expect(repairTranscript.length).toBeGreaterThanOrEqual(1);
    expect(repairTranscript[0]).toContain('VALIDATOR_REJECT');
    expect(repairTranscript[0]).toContain('specQuote');
    expect(Array.isArray(manifest.phaseLog)).toBe(true);
  });

  it('TRUE_DEFECT rows each carry specPath+specQuote+divergence+codeQuote+specLine (integrity contract)', async () => {
    const runId = nextRunId('ledger-td-schema');
    const candidates = makeCandidates(specPath);
    const agentRunFn = async (opts: { ledgerRoot: string; demand: string }) => {
      const isRepair = opts.demand.includes('VALIDATOR_REJECT');
      fs.mkdirSync(opts.ledgerRoot, { recursive: true }); fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      const payload = isRepair ? makeVerdictsCorrected(runId, specPath) : makeVerdictsDefective(runId, specPath);
      // on non-repair we still need defective to exercise loop — but this test also exercises loop
      if (!isRepair) {
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(payload, null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot, { budget: budgetRounds(candidates.length), used: 4 }), 'utf-8');
        return { text: 'defective', roundsUsed: 4, errors: [] as string[] };
      } else {
        const c = makeVerdictsCorrected(runId, specPath);
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(c, null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot, { budget: budgetRounds(candidates.length), used: 5, stamp: 'claimsRechecked:12 discrepanciesFound:1 discrepanciesFixed:1 writeViolations:0' }), 'utf-8');
        return { text: 'corrected', roundsUsed: 5, errors: [] as string[] };
      }
    };
    const manifestJson = await runAuditPipeline({ runId, targetRoot, specs: [specPath], candidates, probeTransport: okProbe, agentRunFn: agentRunFn as never });
    const manifest = JSON.parse(manifestJson); expect(manifest.ready).toBe(true);
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    const vf = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'verdicts.json'), 'utf-8'));
    const tds = vf.verdicts.filter((v: { adjudication: string }) => v.adjudication === 'TRUE_DEFECT');
    expect(tds.length).toBe(5);
    for (const v of tds) {
      expect(v.specPath).toBe(specPath);
      expect(typeof v.specQuote).toBe('string'); expect(v.specQuote.length > 5).toBe(true);
      expect(typeof v.divergence).toBe('string'); expect(v.divergence.length > 10).toBe(true);
      expect(typeof v.codeQuote).toBe('string'); expect(v.codeQuote.length > 3).toBe(true);
      expect(typeof v.specLine).toBe('number'); expect(v.specLine).toBeGreaterThanOrEqual(1);
      expect(v.confidence).toBeGreaterThanOrEqual(0.55); expect(v.confidence).toBeLessThanOrEqual(1.0);
    }
  });

  it('report.md contains all 8 canonical markers counted literally in order', async () => {
    const runId = nextRunId('ledger-markers');
    const candidates = makeCandidates(specPath);
    const agentRunFn = async (opts: { ledgerRoot: string; demand: string }) => {
      const isRepair = opts.demand.includes('VALIDATOR_REJECT');
      fs.mkdirSync(opts.ledgerRoot, { recursive: true }); fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      if (!isRepair) {
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(makeVerdictsDefective(runId, specPath), null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot), 'utf-8');
        return { text: 'defective', roundsUsed: 4, errors: [] as string[] };
      } else {
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(makeVerdictsCorrected(runId, specPath), null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot, { stamp: 'claimsRechecked:12 discrepanciesFound:1 discrepanciesFixed:1 writeViolations:0' }), 'utf-8');
        return { text: 'ok', roundsUsed: 5, errors: [] as string[] };
      }
    };
    const manifestJson = await runAuditPipeline({ runId, targetRoot, specs: [specPath], candidates, probeTransport: okProbe, agentRunFn: agentRunFn as never });
    expect(JSON.parse(manifestJson).ready).toBe(true);
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    const text = fs.readFileSync(path.join(ledgerRoot, 'report.md'), 'utf-8');
    const hits = REPORT_MARKERS.filter(m => text.includes(m));
    expect(hits.length).toBe(8);
    expect(hits.length).toBe(REPORT_MARKERS.length);
    // order check: each marker appears after previous
    let lastIdx = -1;
    for (const m of REPORT_MARKERS) { const idx = text.indexOf(m); expect(idx > lastIdx).toBe(true); lastIdx = idx; }
    // literal count via regex from markers.ts must also be 8 — import canonical check indirectly by re-reading file length
    expect(REPORT_MARKERS.length).toBe(8);
  });

  it('manifest counts reconcile and rounds/wallClock/ready invariants', async () => {
    const runId = nextRunId('ledger-manifest');
    const candidates = makeCandidates(specPath);
    const agentRunFn = async (opts: { ledgerRoot: string; demand: string }) => {
      const isRepair = opts.demand.includes('VALIDATOR_REJECT');
      fs.mkdirSync(opts.ledgerRoot, { recursive: true }); fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      const payload = isRepair ? makeVerdictsCorrected(runId, specPath) : makeVerdictsDefective(runId, specPath);
      // first defective triggers repair
      if (!isRepair) {
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(payload, null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot), 'utf-8');
        return { text: 'defective', roundsUsed: 4, errors: [] as string[] };
      } else {
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(payload, null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot, { stamp: 'claimsRechecked:12 discrepanciesFound:1 discrepanciesFixed:1 writeViolations:0' }), 'utf-8');
        return { text: 'corrected', roundsUsed: 5, errors: [] as string[] };
      }
    };
    const manifestJson = await runAuditPipeline({ runId, targetRoot, specs: [specPath], candidates, probeTransport: okProbe, agentRunFn: agentRunFn as never });
    const m = JSON.parse(manifestJson);
    expect(typeof m.ready).toBe('boolean'); expect(m.ready).toBe(true);
    expect(m.wallClockMs).toBeGreaterThanOrEqual(0);
    expect(m.rounds.used).toBeLessThanOrEqual(m.rounds.budget);
    expect(m.rounds.budget).toBe(budgetRounds(candidates.length));
    expect(m.rounds.budget).toBe(6);
    expect(m.counts.candidatesIn).toBe(12);
    expect(m.counts.candidatesIn).toBe(m.counts.trueDefect + m.counts.redHerring + m.counts.unclear + m.counts.unclassifiedEmitted);
    expect(m.counts.unclassifiedEmitted).toBe(0);
    // when ready, no error stage leaking
    expect(m.error === undefined).toBe(true);
  });

  it('repair loop exercised: validatorRejects 1-2 and VALIDATOR_REJECT demand transcript visible', async () => {
    const runId = nextRunId('ledger-repair');
    const candidates = makeCandidates(specPath);
    const demands: string[] = [];
    const agentRunFn = async (opts: { ledgerRoot: string; demand: string }) => {
      demands.push(opts.demand);
      const isRepair = opts.demand.includes('VALIDATOR_REJECT');
      fs.mkdirSync(opts.ledgerRoot, { recursive: true }); fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      if (!isRepair) {
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(makeVerdictsDefective(runId, specPath), null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot), 'utf-8');
        return { text: 'defective', roundsUsed: 4, errors: [] as string[] };
      } else {
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(makeVerdictsCorrected(runId, specPath), null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot, { stamp: 'claimsRechecked:12 discrepanciesFound:1 discrepanciesFixed:1 writeViolations:0' }), 'utf-8');
        return { text: 'corrected', roundsUsed: 5, errors: [] as string[] };
      }
    };
    const manifestJson = await runAuditPipeline({ runId, targetRoot, specs: [specPath], candidates, probeTransport: okProbe, agentRunFn: agentRunFn as never });
    const m = JSON.parse(manifestJson);
    expect(m.ready).toBe(true);
    expect(m.validatorRejects).toBeGreaterThanOrEqual(1);
    expect(m.validatorRejects).toBeLessThanOrEqual(2);
    const repairDemands = demands.filter(d => d.includes('VALIDATOR_REJECT'));
    expect(repairDemands.length).toBeGreaterThanOrEqual(1);
    expect(repairDemands[0]).toContain('specQuote');
    expect(Array.isArray(m.phaseLog)).toBe(true);
    // phaseLog should contain at least PROBING/RECON/etc entries
    expect(m.phaseLog.length > 0).toBe(true);
  });

  it('UNCLEAR row present and UNCLASSIFIED emission law when not ready', async () => {
    // happy path already has 1 UNCLEAR — verify it
    const runId = nextRunId('ledger-unclear-happy');
    const candidates = makeCandidates(specPath);
    const agentRunFnHappy = async (opts: { ledgerRoot: string; demand: string }) => {
      const isRepair = opts.demand.includes('VALIDATOR_REJECT');
      fs.mkdirSync(opts.ledgerRoot, { recursive: true }); fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      if (!isRepair) {
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(makeVerdictsDefective(runId, specPath), null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot), 'utf-8');
        return { text: 'defective', roundsUsed: 4, errors: [] as string[] };
      } else {
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(makeVerdictsCorrected(runId, specPath), null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot, { stamp: 'claimsRechecked:12 discrepanciesFound:1 discrepanciesFixed:1 writeViolations:0' }), 'utf-8');
        return { text: 'corrected', roundsUsed: 5, errors: [] as string[] };
      }
    };
    const happyJson = await runAuditPipeline({ runId, targetRoot, specs: [specPath], candidates, probeTransport: okProbe, agentRunFn: agentRunFnHappy as never });
    const happy = JSON.parse(happyJson); expect(happy.ready).toBe(true); expect(happy.counts.unclear).toBe(1);
    const ledgerHappy = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    const vfHappy = JSON.parse(fs.readFileSync(path.join(ledgerHappy, 'verdicts.json'), 'utf-8'));
    const unclearRows = vfHappy.verdicts.filter((v: { adjudication: string }) => v.adjudication === 'UNCLEAR');
    expect(unclearRows.length).toBe(1);
    expect(unclearRows[0].missingEvidence.length > 5).toBe(true);

    // not-ready law: unclassifiedEmitted === candidatesIn
    const runId2 = nextRunId('ledger-unclass');
    const smallCands = [cand({ index: 0, file: 'src/module-0.ts', line: 10 }), cand({ index: 1, layer: 'r-lexicon', file: 'src/module-1.ts', line: 20, evidenceQuote: 'x' })];
    // ensure files exist for smallCands
    for (const c of smallCands) writeTargetFile(targetRoot, c.file, `// ${c.file}\n${c.evidenceQuote}\n`);
    const stallFn = async () => { throw new Error('AETHER_STALL: no event within 60s from opencode-go/muse-spark-1.2-contributor'); };
    const notReadyJson = await runAuditPipeline({ runId: runId2, targetRoot, specs: [specPath], candidates: smallCands, probeTransport: okProbe, agentRunFn: stallFn as never });
    const notReady = JSON.parse(notReadyJson);
    expect(notReady.ready).toBe(false);
    expect(notReady.counts.candidatesIn).toBe(2);
    expect(notReady.counts.unclassifiedEmitted).toBe(2);
    expect(notReady.counts.unclassifiedEmitted).toBe(notReady.counts.candidatesIn);
    const ledger2 = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId2);
    const vf2 = JSON.parse(fs.readFileSync(path.join(ledger2, 'verdicts.json'), 'utf-8'));
    expect(vf2.verdicts.length).toBe(2);
    for (const v of vf2.verdicts) expect(v.missingEvidence).toContain('UNCLASSIFIED');
  });
});
