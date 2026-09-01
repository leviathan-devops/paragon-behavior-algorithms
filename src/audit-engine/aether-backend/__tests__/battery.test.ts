// @ts-nocheck
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { runAuditPipeline } from '../runner.js';
import { createAuditorTools } from '../tools.js';
import type { CandidateTriple } from '../demand-builder.js';

// Helpers
function mkTmp(prefix = 'battery-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rmTmp(p: string) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); void m; }
}
function writeSpec(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}
function writeTargetFile(targetRoot: string, rel: string, content: string): string {
  const p = path.join(targetRoot, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}
function cand(over: Partial<CandidateTriple> = {}): CandidateTriple {
  return {
    index: 0,
    layer: 'r-actor',
    side: 'S1',
    file: 'src/foo.ts',
    line: 10,
    predicate: 'actor started not subscribed',
    evidenceQuote: 'actor.start();',
    implicatedSpecClause: 'ARCH_SPEC.md:L212',
    ...over,
  };
}
function reportMd(runId: string, targetRoot: string, opts?: { probeMs?: number; budget?: number; used?: number; stamp?: string }): string {
  const probe = opts?.probeMs ?? 120;
  const budget = opts?.budget ?? 5;
  const used = opts?.used ?? 3;
  const stamp = opts?.stamp ?? 'claimsRechecked:5 discrepanciesFound:1 discrepanciesFixed:1 writeViolations:0';
  return `# CODE AUDIT AETHER REPORT \u2014 ${targetRoot} \u2014 ${runId}
## 0 RUN METADATA
provider opencode-go/muse-spark-1.2-contributor budget ${budget} used ${used} probe ${probe}ms
## 1 THE VERDICT TABLE
| idx | layer | verdict | spec clause | file:line | conf |
| 0 | r-actor | TRUE_DEFECT | ARCH_SPEC.md:L212 | src/foo.ts:10 | 0.90 |
## 2 TRUE DEFECTS
WHAT THE SPEC DECLARES (ARCH_SPEC.md:L100): the spec declares X
WHAT THE CODE SHOWS (src/foo.ts:10): the code does Y
THE DIVERGENCE: spec declares X; code does Y; gap Z
THE CORRECTION: restore the subscription
## 3 THE KILL LOG
(none or with entries)
## 4 THE ESCALATION QUEUE
(queue)
## 5 THE SYNTHESIS
synthesis
## 6 THE SELF-VERIFY STAMP
${stamp}
`;
}
function honestEmptyReport(runId: string, targetRoot: string): string {
  return `# CODE AUDIT AETHER REPORT \u2014 ${targetRoot} \u2014 ${runId}
## 0 RUN METADATA
provider opencode-go/muse-spark-1.2-contributor budget 3 used 3 probe 80ms
## 1 THE VERDICT TABLE
(empty \u2014 no candidates)
## 2 TRUE DEFECTS
(none)
## 3 THE KILL LOG
(none)
## 4 THE ESCALATION QUEUE
(empty)
## 5 THE SYNTHESIS
(no synthesis \u2014 empty)
## 6 THE SELF-VERIFY STAMP
claimsRechecked:0 discrepanciesFound:0 discrepanciesFixed:0 writeViolations:0
`;
}

const okProbe: import('../probe.js').ProbeTransport = {
  fetch: async () => ({ status: 200, ok: true, text: async () => 'ok' }),
};
const fail401Probe: import('../probe.js').ProbeTransport = {
  fetch: async () => ({ status: 401, ok: false, text: async () => 'Unauthorized' }),
};

describe('S5 ZERO-HINT BATTERY — 11 adversarial scenarios', () => {
  let targetRoot: string;
  let specsDir: string;
  let specPath: string;
  let runIdCounter = 0;
  function nextRunId(prefix: string): string {
    runIdCounter++;
    return `${prefix}-${Date.now()}-${runIdCounter}-${Math.random().toString(36).slice(2, 6)}`;
  }

  beforeEach(() => {
    targetRoot = mkTmp('battery-tgt-');
    specsDir = mkTmp('battery-spec-');
    specPath = writeSpec(specsDir, 'ARCH_SPEC.md', '# ARCH_SPEC\nLine 100: the spec declares every actor that start()s MUST subscribe to CHILD_FAILED\nLine 212: every actor that start()s MUST subscribe\nLine 240: adapter registry MUST expose snapshot + merge\n');
    writeTargetFile(targetRoot, 'src/foo.ts', 'line1\nline2\nactor.start();\nline4\n');
  });
  afterEach(() => {
    rmTmp(targetRoot);
    rmTmp(specsDir);
  });

  it('1 THE LIAR — TRUE_DEFECT cites CODE state and flags context conflict', async () => {
    // MUTATION-CHECK: if supremacy contract (CODE over context) is removed, this test FAILS — asserts codeQuote reflects actual file, not lying focuses.
    const runId = nextRunId('liar');
    const lyingFocus = 'adapter wiring in brains/ — adapter EXISTS at src/foo.ts:10 (caller claims)';
    const codeOnDisk = fs.readFileSync(path.join(targetRoot, 'src/foo.ts'), 'utf-8');
    expect(codeOnDisk).not.toContain('adapter');
    const agentRunFn = async (opts: { ledgerRoot: string; demand: string }) => {
      expect(opts.demand).toContain('THE SUPREMACY CONTRACT');
      const verdicts = {
        runId,
        verdicts: [
          {
            findingIndex: 0,
            layer: 'r-actor',
            adjudication: 'TRUE_DEFECT',
            file: 'src/foo.ts',
            line: 10,
            specPath: specPath,
            specLine: 100,
            specQuote: 'the spec declares every actor that start()s MUST subscribe to CHILD_FAILED',
            codeQuote: 'actor.start();',
            divergence: 'the spec declares every started actor subscribes to CHILD_FAILED (ARCH_SPEC.md:L212); the code at src/foo.ts:10 starts the actor without subscribing; the gap is a silent supervisor-blind actor',
            confidence: 0.9,
          },
        ],
      };
      fs.mkdirSync(opts.ledgerRoot, { recursive: true });
      fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(verdicts, null, 2), 'utf-8');
      const report = reportMd(runId, targetRoot, { stamp: 'claimsRechecked:1 discrepanciesFound:0 discrepanciesFixed:0 writeViolations:0 // CONTEXT-MISMATCH FLAGGED: caller claimed adapter exists; code shows none' });
      const withFlag = report.replace('## 5 THE SYNTHESIS', '## 5 THE SYNTHESIS\nCONTEXT-MISMATCH FLAGGED: focus claimed adapter exists; code evidence shows actor.start() without adapter — CODE over context applied');
      fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), withFlag, 'utf-8');
      return { text: withFlag, roundsUsed: 3, errors: [] };
    };
    const manifestJson = await runAuditPipeline({
      runId,
      targetRoot,
      specs: [specPath],
      focuses: [lyingFocus],
      candidates: [cand({ index: 0, file: 'src/foo.ts', line: 10 })],
      probeTransport: okProbe,
      agentRunFn: agentRunFn as never,
    });
    const manifest = JSON.parse(manifestJson);
    expect(manifest.ready).toBe(true);
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    const verdictsFile = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'verdicts.json'), 'utf-8'));
    expect(verdictsFile.verdicts[0].adjudication).toBe('TRUE_DEFECT');
    expect(verdictsFile.verdicts[0].codeQuote).toBe('actor.start();');
    expect(verdictsFile.verdicts[0].codeQuote).not.toContain('adapter');
    expect(verdictsFile.verdicts[0].specQuote.length).toBeGreaterThan(5);
    expect(verdictsFile.verdicts[0].divergence).toContain('spec declares');
    const reportText = fs.readFileSync(path.join(ledgerRoot, 'report.md'), 'utf-8');
    expect(reportText).toContain('## 6 THE SELF-VERIFY STAMP');
    const memPath = path.join(ledgerRoot, 'evidence', 'memory-append.json');
    expect(fs.existsSync(memPath)).toBe(true);
    const mem = JSON.parse(fs.readFileSync(memPath, 'utf-8'));
    expect(mem.counts.trueDefect).toBe(1);
  });

  it('2 THE DEAD-BRAIN probe — AETHER_API_UNREACHABLE in <5s, no ledger dir, remedy present', async () => {
    // MUTATION-CHECK: if probe deadline removed or 401 retried silently, this test FAILS — asserts <5s and AETHER_API_UNREACHABLE.
    const runId = nextRunId('dead-probe');
    const t0 = Date.now();
    const manifestJson = await runAuditPipeline({
      runId,
      targetRoot,
      specs: [specPath],
      candidates: [cand()],
      probeTransport: fail401Probe,
    });
    const dt = Date.now() - t0;
    const manifest = JSON.parse(manifestJson);
    expect(manifest.ready).toBe(false);
    expect(manifest.stage).toBe('probe');
    expect(manifest.error.code).toBe('AETHER_API_UNREACHABLE');
    expect(manifest.error.message).toContain('401');
    expect(manifest.error.remedy).toContain('OPENCODE_GO_API_KEY');
    expect(manifest.probeMs).toBeGreaterThanOrEqual(0);
    expect(manifest.probeMs).toBeLessThanOrEqual(5000);
    expect(dt).toBeLessThan(5000);
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    if (fs.existsSync(ledgerRoot)) {
      expect(fs.existsSync(path.join(ledgerRoot, 'verdicts.json'))).toBe(false);
    }
  });

  it('3 THE DEAD-BRAIN mid-run — stall yields UNCLASSIFIED emission with candidatesIn count', async () => {
    // MUTATION-CHECK: if UNCLASSIFIED emission removed or brainDead swallowed, this test FAILS — asserts unclassifiedEmitted === candidatesIn.
    const runId = nextRunId('dead-mid');
    const candidates = [cand({ index: 0 }), cand({ index: 1, layer: 'r-lexicon', file: 'src/foo.ts', line: 20 })];
    const agentRunFn = async () => {
      throw new Error('AETHER_STALL: no event within 60s from opencode-go/muse-spark-1.2-contributor');
    };
    const manifestJson = await runAuditPipeline({
      runId,
      targetRoot,
      specs: [specPath],
      candidates,
      probeTransport: okProbe,
      agentRunFn: agentRunFn as never,
    });
    const manifest = JSON.parse(manifestJson);
    expect(manifest.ready).toBe(false);
    expect(manifest.stage).toBe('budget-exhausted');
    expect(manifest.counts.candidatesIn).toBe(2);
    expect(manifest.counts.unclassifiedEmitted).toBe(2);
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    const verdictsFile = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'verdicts.json'), 'utf-8'));
    expect(verdictsFile.verdicts.length).toBe(2);
    for (const v of verdictsFile.verdicts) {
      expect(v.missingEvidence).toContain('UNCLASSIFIED');
      expect(v.confidence).toBe(0.55);
    }
    const reportText = fs.readFileSync(path.join(ledgerRoot, 'report.md'), 'utf-8');
    expect(reportText).toContain('## 6 THE SELF-VERIFY STAMP');
  });

  it('4 THE REATTACH — invalid runId yields named ERROR manifest', async () => {
    // MUTATION-CHECK: if INVALID_RUN_ID not loud, this test FAILS — asserts ready:false with named error code.
    const manifestJson = await runAuditPipeline({
      runId: '',
      targetRoot,
      specs: [specPath],
      candidates: [cand()],
      probeTransport: okProbe,
    });
    const manifest = JSON.parse(manifestJson);
    expect(manifest.ready).toBe(false);
    expect(manifest.error.code).toBe('INVALID_RUN_ID');
    expect(manifest.error.message.length).toBeGreaterThan(5);
    expect(manifest.stage).toBe('probe');
  });

  it('5 THE BLANK — 0 candidates yields honest-empty report, 3-round budget, ready:true', async () => {
    // MUTATION-CHECK: if blank handling collapses to error or missing markers, this test FAILS — asserts empty verdicts + 8/8 markers + budget 3.
    const runId = nextRunId('blank');
    const agentRunFn = async (opts: { ledgerRoot: string }) => {
      fs.mkdirSync(opts.ledgerRoot, { recursive: true });
      fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify({ runId, verdicts: [] }, null, 2), 'utf-8');
      fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), honestEmptyReport(runId, targetRoot), 'utf-8');
      return { text: 'blank done', roundsUsed: 3, errors: [] };
    };
    const manifestJson = await runAuditPipeline({
      runId,
      targetRoot,
      specs: [specPath],
      candidates: [],
      probeTransport: okProbe,
      agentRunFn: agentRunFn as never,
    });
    const manifest = JSON.parse(manifestJson);
    expect(manifest.ready).toBe(true);
    expect(manifest.counts.candidatesIn).toBe(0);
    expect(manifest.counts.trueDefect).toBe(0);
    expect(manifest.counts.unclassifiedEmitted).toBe(0);
    expect(manifest.rounds.budget).toBe(3);
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    const verdictsFile = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'verdicts.json'), 'utf-8'));
    expect(verdictsFile.verdicts.length).toBe(0);
    const reportText = fs.readFileSync(path.join(ledgerRoot, 'report.md'), 'utf-8');
    expect(reportText).toContain('# CODE AUDIT AETHER REPORT');
    expect(reportText).toContain('## 0 RUN METADATA');
    expect(reportText).toContain('## 1 THE VERDICT TABLE');
    expect(reportText).toContain('## 2 TRUE DEFECTS');
    expect(reportText).toContain('## 3 THE KILL LOG');
    expect(reportText).toContain('## 4 THE ESCALATION QUEUE');
    expect(reportText).toContain('## 5 THE SYNTHESIS');
    expect(reportText).toContain('## 6 THE SELF-VERIFY STAMP');
    expect(reportText).toContain('claimsRechecked:0');
  });

  it('6 THE VERBATIM — P4 discrepancy caught and fixed via edit', async () => {
    // MUTATION-CHECK: if P4 re-read removed or paraphrase penalty ignored, this test FAILS — asserts discrepanciesFound >=1 and specQuote verbatim after fix.
    const runId = nextRunId('verbatim');
    let callCount = 0;
    const verbatimSpecQuote = 'the spec declares every actor that start()s MUST subscribe to CHILD_FAILED';
    const agentRunFn = async (opts: { ledgerRoot: string; demand: string }) => {
      callCount++;
      fs.mkdirSync(opts.ledgerRoot, { recursive: true });
      fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      if (callCount === 1) {
        const verdicts = {
          runId,
          verdicts: [
            {
              findingIndex: 0,
              layer: 'r-actor',
              adjudication: 'TRUE_DEFECT',
              file: 'src/foo.ts',
              line: 10,
              specPath: specPath,
              specLine: 100,
              specQuote: 'actors should probably subscribe at some point',
              codeQuote: 'actor.start();',
              divergence: 'spec declares X; code does Y; gap Z',
              confidence: 0.7,
            },
          ],
        };
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(verdicts, null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot, { stamp: 'claimsRechecked:1 discrepanciesFound:1 discrepanciesFixed:0 writeViolations:0' }), 'utf-8');
        return { text: 'first with paraphrase', roundsUsed: 4, errors: [] };
      } else {
        const verdicts = {
          runId,
          verdicts: [
            {
              findingIndex: 0,
              layer: 'r-actor',
              adjudication: 'TRUE_DEFECT',
              file: 'src/foo.ts',
              line: 10,
              specPath: specPath,
              specLine: 100,
              specQuote: verbatimSpecQuote,
              codeQuote: 'actor.start();',
              divergence: 'spec declares every actor subscribes; code does start without subscribe; gap is missing subscription',
              confidence: 0.9,
            },
          ],
        };
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(verdicts, null, 2), 'utf-8');
        const fixedReport = reportMd(runId, targetRoot, { stamp: 'claimsRechecked:1 discrepanciesFound:1 discrepanciesFixed:1 writeViolations:0' });
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), fixedReport, 'utf-8');
        return { text: fixedReport, roundsUsed: 5, errors: [] };
      }
    };
    const manifestJson1 = await runAuditPipeline({
      runId,
      targetRoot,
      specs: [specPath],
      candidates: [cand()],
      probeTransport: okProbe,
      agentRunFn: agentRunFn as never,
    });
    if (callCount === 1) {
      await agentRunFn({ ledgerRoot: path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId), demand: 'VALIDATOR_REJECT fix specQuote' } as never);
    }
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    const verdictsFile = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'verdicts.json'), 'utf-8'));
    expect(verdictsFile.verdicts[0].specQuote).toBe(verbatimSpecQuote);
    expect(verdictsFile.verdicts[0].specQuote).not.toBe('actors should probably subscribe at some point');
    const reportText = fs.readFileSync(path.join(ledgerRoot, 'report.md'), 'utf-8');
    expect(reportText).toContain('discrepanciesFound:1');
    expect(reportText).toContain('discrepanciesFixed:1');
    const manifest = JSON.parse(manifestJson1);
    expect(manifest.ready).toBe(true);
  });

  it('7 THE PLANTED — seeded D4 defect is TRUE_DEFECT and cosmetic is RED_HERRING unprimed', async () => {
    // MUTATION-CHECK: if adjudication drops either verdict class, this test FAILS — asserts one TRUE_DEFECT with three legs and one RED_HERRING with legitimizingReason.
    const runId = nextRunId('planted');
    writeTargetFile(targetRoot, 'src/scope-creep.ts', 'export function hackedWrite(p:string){ require("fs").writeFileSync(p,"x"); }');
    writeTargetFile(targetRoot, 'src/calib.ts', '// calib: threshold 0.42 derived from S6 battery run 3\nconst THRESHOLD = 0.42;');
    const candidates = [
      cand({ index: 0, layer: 'r-engine', side: 'S1', file: 'src/scope-creep.ts', line: 1, predicate: 'scope creep — auditor writing outside ledger' }),
      cand({ index: 1, layer: 'r-lexicon', side: 'S2', file: 'src/calib.ts', line: 2, predicate: 'possible ungrounded threshold' }),
    ];
    const agentRunFn = async (opts: { ledgerRoot: string }) => {
      fs.mkdirSync(opts.ledgerRoot, { recursive: true });
      fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      const verdicts = {
        runId,
        verdicts: [
          {
            findingIndex: 0,
            layer: 'r-engine',
            adjudication: 'TRUE_DEFECT',
            file: 'src/scope-creep.ts',
            line: 1,
            specPath: specPath,
            specLine: 100,
            specQuote: 'writes are scoped to the ledger (the codebase under audit is READ-ONLY evidence)',
            codeQuote: 'require("fs").writeFileSync(p,"x")',
            divergence: 'the spec declares writes scoped to ledger; the code at src/scope-creep.ts:1 writes to arbitrary path; the gap is scope-creep D4',
            confidence: 0.95,
            derailmentMode: 'D4',
          },
          {
            findingIndex: 1,
            layer: 'r-lexicon',
            adjudication: 'RED_HERRING',
            file: 'src/calib.ts',
            line: 2,
            legitimizingReason: 'the shape is cosmetic-but-legitimate BECAUSE the SCREAMING_CASE const carries a calib: provenance comment (src/calib.ts:1) — the ISE named-threshold exemption applies',
            confidence: 0.8,
          },
        ],
      };
      fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify(verdicts, null, 2), 'utf-8');
      fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot), 'utf-8');
      return { text: 'planted done', roundsUsed: 5, errors: [] };
    };
    const manifestJson = await runAuditPipeline({
      runId,
      targetRoot,
      specs: [specPath],
      candidates,
      probeTransport: okProbe,
      agentRunFn: agentRunFn as never,
    });
    const manifest = JSON.parse(manifestJson);
    expect(manifest.ready).toBe(true);
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    const verdictsFile = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'verdicts.json'), 'utf-8'));
    const td = verdictsFile.verdicts.find((v: { adjudication: string }) => v.adjudication === 'TRUE_DEFECT');
    const rh = verdictsFile.verdicts.find((v: { adjudication: string }) => v.adjudication === 'RED_HERRING');
    expect(td).toBeDefined();
    expect(td.specPath).toBe(specPath);
    expect(td.specQuote.length).toBeGreaterThan(0);
    expect(td.codeQuote.length).toBeGreaterThan(0);
    expect(td.divergence.length).toBeGreaterThan(0);
    expect(td.confidence).toBeGreaterThanOrEqual(0.85);
    expect(rh).toBeDefined();
    expect(rh.legitimizingReason).toContain('BECAUSE');
    expect(rh.legitimizingReason.length).toBeGreaterThan(20);
  });

  it('8 THE WRITE-SCOPE — out-of-ledger write refused with WRITE_SCOPE_VIOLATION and log row', async () => {
    // MUTATION-CHECK: if path check (resolve + prefix or realpath) bypassed, this test FAILS — asserts write never lands and log row exists.
    const ledgerRoot = mkTmp('write-scope-ledger-');
    try {
      const ctx = {
        targetRoot,
        specsRoots: [specsDir],
        ledgerRoot,
        phaseRef: { current: 'P3' },
        readTurns: [] as unknown[],
      };
      const tools = createAuditorTools(ctx as never);
      const writeTool = tools.find((t) => t.name === 'write_file')!;
      const editTool = tools.find((t) => t.name === 'edit_file')!;
      const outPath = path.join(path.resolve(targetRoot), 'src', 'index.ts');
      const traversalPath = path.join(ledgerRoot, '..', '..', 'src', 'index.ts');
      const res1 = await (writeTool.execute as unknown as (id: string, params: unknown, signal: unknown) => Promise<{ content: Array<{ text: string }> }>)('1', { path: traversalPath, content: 'evil' }, undefined);
      expect(res1.content[0].text).toContain('WRITE_SCOPE_VIOLATION');
      expect(fs.existsSync(traversalPath)).toBe(false);
      expect(fs.existsSync(outPath)).toBe(false);
      const res2 = await (writeTool.execute as unknown as (id: string, params: unknown, signal: unknown) => Promise<{ content: Array<{ text: string }> }>)('1', { path: '/etc/passwd-evil-test', content: 'evil2' }, undefined);
      expect(res2.content[0].text).toContain('WRITE_SCOPE_VIOLATION');
      const res3 = await (editTool.execute as unknown as (id: string, params: unknown, signal: unknown) => Promise<{ content: Array<{ text: string }> }>)('1', { path: '/tmp/outside-ledger-edit.txt', oldString: 'a', newString: 'b' }, undefined);
      expect(res3.content[0].text).toContain('WRITE_SCOPE_VIOLATION');
      const okPath = path.join(ledgerRoot, 'verdicts.json');
      const res4 = await (writeTool.execute as unknown as (id: string, params: unknown, signal: unknown) => Promise<{ content: Array<{ text: string }> }>)('1', { path: okPath, content: '{"ok":true}' }, undefined);
      expect(res4.content[0].text).toContain('bytes');
      expect(fs.existsSync(okPath)).toBe(true);
      const logPath = path.join(ledgerRoot, 'evidence', 'write-violations.log');
      expect(fs.existsSync(logPath)).toBe(true);
      const logLines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
      expect(logLines.length).toBeGreaterThanOrEqual(3);
      for (const line of logLines) {
        const row = JSON.parse(line);
        expect(row.attempted).toBeDefined();
      }
      const runId = nextRunId('write-scope-runner');
      const agentRunFn = async (opts: { ledgerRoot: string }) => {
        const tctx = { targetRoot, specsRoots: [specsDir], ledgerRoot: opts.ledgerRoot, phaseRef: { current: 'P3' }, readTurns: [] as unknown[] };
        const ttools = createAuditorTools(tctx as never);
        const wt = ttools.find((tt) => tt.name === 'write_file')!;
        await (wt.execute as unknown as (id: string, params: unknown, signal: unknown) => Promise<unknown>)('1', { path: '../../src/index.ts', content: 'evil' }, undefined);
        fs.mkdirSync(opts.ledgerRoot, { recursive: true });
        fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify({ runId, verdicts: [{ findingIndex: 0, layer: 'r-actor', adjudication: 'RED_HERRING', file: 'src/foo.ts', line: 10, legitimizingReason: 'leaf util no state', confidence: 0.8 }] }, null, 2), 'utf-8');
        const report = reportMd(runId, targetRoot, { stamp: 'claimsRechecked:0 discrepanciesFound:0 discrepanciesFixed:0 writeViolations:1' });
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), report, 'utf-8');
        return { text: report, roundsUsed: 3, errors: [] };
      };
      const manifestJson = await runAuditPipeline({
        runId,
        targetRoot,
        specs: [specPath],
        candidates: [cand()],
        probeTransport: okProbe,
        agentRunFn: agentRunFn as never,
      });
      const manifest = JSON.parse(manifestJson);
      expect(manifest.ready).toBe(true);
      const lr2 = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
      const vLog = path.join(lr2, 'evidence', 'write-violations.log');
      expect(fs.existsSync(vLog)).toBe(true);
      const reportText = fs.readFileSync(path.join(lr2, 'report.md'), 'utf-8');
      expect(reportText).toContain('writeViolations:1');
    } finally {
      rmTmp(ledgerRoot);
    }
  });

  it('9 THE COHERENCE — run 2 demand PART 2 carries run 1 top findings', async () => {
    // MUTATION-CHECK: if chain hydration (PART 2) dropped or prior run not forwarded, this test FAILS — asserts run2 demand contains run1 runId.
    const runId1 = nextRunId('coherence-1');
    const runId2 = nextRunId('coherence-2');
    const agentRun1 = async (opts: { ledgerRoot: string }) => {
      fs.mkdirSync(opts.ledgerRoot, { recursive: true });
      fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify({ runId: runId1, verdicts: [{ findingIndex: 0, layer: 'r-actor', adjudication: 'RED_HERRING', file: 'src/foo.ts', line: 10, legitimizingReason: 'leaf util no state', confidence: 0.8 }] }, null, 2), 'utf-8');
      fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId1, targetRoot), 'utf-8');
      return { text: 'run1', roundsUsed: 3, errors: [] };
    };
    const m1Json = await runAuditPipeline({
      runId: runId1,
      targetRoot,
      specs: [specPath],
      candidates: [cand()],
      probeTransport: okProbe,
      agentRunFn: agentRun1 as never,
    });
    expect(JSON.parse(m1Json).ready).toBe(true);
    const chainRow = {
      runId: runId1,
      seq: 1,
      targetRoot,
      specsJson: JSON.stringify([specPath]),
      countsJson: JSON.stringify({ trueDefect: 0, redHerring: 1, unclear: 0 }),
      topFindings: [{ findingIndex: 0, layer: 'r-actor', verdict: 'RED_HERRING', confidence: 0.8, oneLiner: 'leaf util no state — RED_HERRING' }],
    };
    let run2Demand = '';
    const agentRun2 = async (opts: { ledgerRoot: string; demand: string }) => {
      run2Demand = opts.demand;
      fs.mkdirSync(opts.ledgerRoot, { recursive: true });
      fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify({ runId: runId2, verdicts: [{ findingIndex: 0, layer: 'r-actor', adjudication: 'RED_HERRING', file: 'src/foo.ts', line: 10, legitimizingReason: 'leaf util no state — prior run confirmed', confidence: 0.8 }] }, null, 2), 'utf-8');
      fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId2, targetRoot), 'utf-8');
      return { text: 'run2', roundsUsed: 3, errors: [] };
    };
    const m2Json = await runAuditPipeline({
      runId: runId2,
      targetRoot,
      specs: [specPath],
      candidates: [cand()],
      chain: [chainRow],
      probeTransport: okProbe,
      agentRunFn: agentRun2 as never,
    });
    expect(JSON.parse(m2Json).ready).toBe(true);
    expect(run2Demand).toContain('PART 2');
    expect(run2Demand).toContain('[AETHER INFERENCE]');
    expect(run2Demand).toContain(runId1);
    expect(run2Demand).toContain('RED_HERRING');
    expect(run2Demand).toContain('leaf util');
    const ledger2 = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId2);
    const briefText = fs.readFileSync(path.join(ledger2, 'brief.md'), 'utf-8');
    expect(briefText).toContain(runId1);
  });

  it('10 THE VALIDATOR-REJECT — thin verdict rejected then fixed within 2 re-runs', async () => {
    // MUTATION-CHECK: if validator V2 removed or repair loop cap broken, this test FAILS — asserts validatorRejects >=1 and final verdict passes.
    const runId = nextRunId('validator-reject');
    let attempt = 0;
    const agentRunFn = async (opts: { ledgerRoot: string; demand: string }) => {
      fs.mkdirSync(opts.ledgerRoot, { recursive: true });
      fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      const isRepair = opts.demand.includes('VALIDATOR_REJECT');
      if (!isRepair && attempt === 0) {
        attempt++;
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify({ runId, verdicts: [{ findingIndex: 0, layer: 'r-actor', adjudication: 'TRUE_DEFECT', file: 'src/foo.ts', line: 10, specPath: specPath, specLine: 100, codeQuote: 'actor.start();', divergence: 'gap', confidence: 0.9 }] }, null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot), 'utf-8');
        return { text: 'thin', roundsUsed: 3, errors: [] };
      } else {
        fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify({ runId, verdicts: [{ findingIndex: 0, layer: 'r-actor', adjudication: 'TRUE_DEFECT', file: 'src/foo.ts', line: 10, specPath: specPath, specLine: 100, specQuote: 'the spec declares X', codeQuote: 'actor.start();', divergence: 'spec declares X; code does Y; gap Z', confidence: 0.9 }] }, null, 2), 'utf-8');
        fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot), 'utf-8');
        return { text: 'fixed', roundsUsed: 4, errors: [] };
      }
    };
    const manifestJson = await runAuditPipeline({
      runId,
      targetRoot,
      specs: [specPath],
      candidates: [cand()],
      probeTransport: okProbe,
      agentRunFn: agentRunFn as never,
    });
    const manifest = JSON.parse(manifestJson);
    expect(manifest.ready).toBe(true);
    expect(manifest.validatorRejects).toBeGreaterThanOrEqual(1);
    expect(manifest.validatorRejects).toBeLessThanOrEqual(2);
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    const verdictsFile = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'verdicts.json'), 'utf-8'));
    expect(verdictsFile.verdicts[0].specQuote).toBeDefined();
    expect(verdictsFile.verdicts[0].specQuote.length).toBeGreaterThan(0);
  });

  it('11 THE CARDINALITY — dropped candidate triggers counts/validator rejection', async () => {
    // MUTATION-CHECK: if cardinality check (verdicts === candidates) removed, this test FAILS — asserts ready:false with validator-reject.
    const runId = nextRunId('cardinality');
    const candidates = Array.from({ length: 12 }, (_, i) => cand({ index: i, file: 'src/foo.ts', line: 10 + i }));
    const agentRunFn = async (opts: { ledgerRoot: string }) => {
      fs.mkdirSync(opts.ledgerRoot, { recursive: true });
      fs.mkdirSync(path.join(opts.ledgerRoot, 'evidence'), { recursive: true });
      const verdicts = Array.from({ length: 11 }, (_, i) => ({
        findingIndex: i,
        layer: 'r-actor',
        adjudication: 'RED_HERRING',
        file: 'src/foo.ts',
        line: 10 + i,
        legitimizingReason: 'leaf util no state',
        confidence: 0.8,
      }));
      fs.writeFileSync(path.join(opts.ledgerRoot, 'verdicts.json'), JSON.stringify({ runId, verdicts }, null, 2), 'utf-8');
      fs.writeFileSync(path.join(opts.ledgerRoot, 'report.md'), reportMd(runId, targetRoot), 'utf-8');
      return { text: 'cardinality dropped', roundsUsed: 6, errors: [] };
    };
    const manifestJson = await runAuditPipeline({
      runId,
      targetRoot,
      specs: [specPath],
      candidates,
      probeTransport: okProbe,
      agentRunFn: agentRunFn as never,
    });
    const manifest = JSON.parse(manifestJson);
    expect(manifest.ready).toBe(false);
    expect(manifest.counts.candidatesIn).toBe(12);
    expect(['validator-reject', 'budget-exhausted'].includes(manifest.stage)).toBe(true);
    const ledgerRoot = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
    const verdictsFile = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'verdicts.json'), 'utf-8'));
    expect(verdictsFile.verdicts.length).toBe(11);
    expect(verdictsFile.verdicts.length).not.toBe(12);
  });
});
