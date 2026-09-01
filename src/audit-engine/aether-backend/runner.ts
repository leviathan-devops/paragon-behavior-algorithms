import * as fs from 'node:fs';
import * as path from 'node:path';
import { probeProvider, AETHER_API_UNREACHABLE, type ProbeTransport } from './probe.js';
import { PhaseController, budgetRounds } from './phase-controller.js';
import { buildAuditDemand, buildBrief, type CandidateTriple, type ChainRow } from './demand-builder.js';
import { THE_CODE_AUDITOR_PROMPT } from './identity.js';
import { validateVerdicts } from './report/validator.js';
import { checkReportMarkers } from './report/markers.js';
import { writeManifest, type RunManifest } from './report/manifest.js';
import type { VerdictsFile } from './report/verdicts.js';

export interface RunAuditInput {
  readonly runId: string;
  readonly targetRoot: string;
  readonly specs: readonly string[];
  readonly focuses?: readonly string[];
  readonly candidates: readonly CandidateTriple[];
  readonly chain?: readonly ChainRow[];
  readonly probeTransport?: ProbeTransport;
  readonly apiKey?: string;
  readonly agentRunFn?: (opts: { promptFilePath: string; systemPrompt: string; demand: string; maxRounds: number; targetRoot: string; ledgerRoot: string; specsRoots: string[] }) => Promise<{ text: string; roundsUsed: number; errors: string[] }>;
  readonly wallClockStart?: number;
}

function ledgerRootFor(targetRoot: string, runId: string): string {
  return path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', runId);
}

function specsRootsFor(specs: readonly string[]): string[] {
  const roots: string[] = [];
  for (const s of specs) {
    try {
      const abs = path.resolve(s);
      const st = fs.statSync(abs);
      roots.push(st.isFile() ? path.dirname(abs) : abs);
    } catch (err) {
      const _msg = err instanceof Error ? err.message : String(err);
      void _msg;
      roots.push(path.dirname(path.resolve(s)));
    }
  }
  return [...new Set(roots)];
}

function countsFromVerdicts(verdicts: readonly { adjudication: string }[]): { trueDefect: number; redHerring: number; unclear: number } {
  let td = 0, rh = 0, uc = 0;
  for (const v of verdicts) {
    if (v.adjudication === 'TRUE_DEFECT') td++;
    else if (v.adjudication === 'RED_HERRING') rh++;
    else if (v.adjudication === 'UNCLEAR') uc++;
  }
  return { trueDefect: td, redHerring: rh, unclear: uc };
}

function buildUnclassifiedVerdicts(candidates: readonly CandidateTriple[]): VerdictsFile {
  return {
    runId: 'unclassified',
    verdicts: candidates.map((c) => ({
      findingIndex: c.index,
      layer: c.layer,
      adjudication: 'UNCLEAR' as const,
      file: c.file,
      line: c.line,
      missingEvidence: `UNCLASSIFIED — brain-dead/budget-exhausted: candidate never adjudicated (layer=${c.layer} predicate=${c.predicate ?? '—'})`,
      confidence: 0.55,
    })),
  };
}

function writeReadTurnsEvidence(ledgerRoot: string, runId: string, p0Turns: readonly { path: string; phase: string; bytes?: number; lines?: number; at?: number }[], agentTurns: readonly { path: string; phase: string; linesRead: number; atMs: number }[]): void {
  try {
    const evidenceDir = path.join(ledgerRoot, 'evidence');
    fs.mkdirSync(evidenceDir, { recursive: true });
    const projectedAgent = agentTurns.map((t) => ({ path: t.path, phase: t.phase, lines: t.linesRead, at: t.atMs }));
    const turns: Array<{ path: string; phase: string; bytes?: number; lines?: number; at?: number }> = [...p0Turns, ...projectedAgent];
    fs.writeFileSync(path.join(evidenceDir, 'read-turns.json'), JSON.stringify({ runId, turns }, null, 2), 'utf-8');
  } catch (err: unknown) {
    const _m = err instanceof Error ? err.message : String(err);
    void _m;
  }
}

function toManifestJson(m: RunManifest): string {
  return JSON.stringify(m);
}

export async function runAuditPipeline(input: RunAuditInput): Promise<string> {
  const t0 = input.wallClockStart ?? Date.now();
  const runId = input.runId;
  const targetRoot = input.targetRoot;
  const specs = [...input.specs];
  const candidates = [...input.candidates];
  const focuses = input.focuses ? [...input.focuses] : [];
  const chain = input.chain ? [...input.chain] : [];
  const budget = budgetRounds(candidates.length);

  if (!runId || typeof runId !== 'string' || runId.trim().length === 0) {
    const m: RunManifest = { runId: runId || 'unknown', ready: false, stage: 'probe', error: { code: 'INVALID_RUN_ID', message: 'runId must be non-empty', remedy: 'Provide a valid runId' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: 0 }, rounds: { used: 0, budget }, wallClockMs: Date.now() - t0, probeMs: 0, phaseLog: [], validatorRejects: 0 };
    return toManifestJson(m);
  }

  const probeResult = await probeProvider({ transport: input.probeTransport, apiKey: input.apiKey }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, probeMs: 0, code: AETHER_API_UNREACHABLE, status: 0, message: msg.slice(0, 300), remedy: 'Check OPENCODE_GO_API_KEY + opencode-go reachability. The audit did not start. No candidates were scanned (0 minutes wasted).' } as const;
  });

  if (!probeResult.ok) {
    const m: RunManifest = {
      runId,
      ready: false,
      stage: 'probe',
      error: { code: probeResult.code, message: probeResult.message, remedy: probeResult.remedy },
      provider: 'opencode-go/muse-spark-1.2-contributor',
      counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: 0 },
      rounds: { used: 0, budget },
      wallClockMs: Date.now() - t0,
      probeMs: probeResult.probeMs,
      phaseLog: [],
      validatorRejects: 0,
    };
    return toManifestJson(m);
  }

  const probeMs = probeResult.probeMs;
  const ledgerRoot = ledgerRootFor(targetRoot, runId);
  const controller = new PhaseController(candidates.length);

  try {
    controller.probePass();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const m: RunManifest = { runId, ready: false, stage: 'probe', error: { code: 'REATTACH_GATE_FAIL', message: msg.slice(0, 300), remedy: 'Check audit-ledger reattach gate' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: candidates.length }, rounds: { used: 0, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects: 0 };
    try { fs.mkdirSync(ledgerRoot, { recursive: true }); writeManifest(ledgerRoot, m); } catch (err: unknown) { const _m = err instanceof Error ? err.message : String(err); void _m; }
    return toManifestJson(m);
  }

  try {
    fs.mkdirSync(ledgerRoot, { recursive: true });
    fs.mkdirSync(path.join(ledgerRoot, 'evidence'), { recursive: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const m: RunManifest = { runId, ready: false, stage: 'probe', error: { code: 'LEDGER_MKDIR_FAIL', message: msg.slice(0, 300), remedy: 'Check targetRoot writable' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: 0 }, rounds: { used: 0, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects: 0 };
    return toManifestJson(m);
  }

  try {
    controller.reconDone();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const m: RunManifest = { runId, ready: false, stage: 'recon', error: { code: 'RECON_FAIL', message: msg.slice(0, 300), remedy: 'Check phase controller RECON transition' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: candidates.length }, rounds: { used: controller.rounds, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects: 0 };
    try { writeManifest(ledgerRoot, m); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    return toManifestJson(m);
  }

  try {
    controller.evidencingDone();
    controller.adjudicatingDone();
    controller.reportingDone();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const m: RunManifest = { runId, ready: false, stage: 'evidencing', error: { code: 'PHASE_TRANSITION_FAIL', message: msg.slice(0, 300), remedy: 'Check phase ordering' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: candidates.length }, rounds: { used: controller.rounds, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects: 0 };
    try { writeManifest(ledgerRoot, m); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    return toManifestJson(m);
  }

  let demand: ReturnType<typeof buildAuditDemand>;
  try {
    demand = buildAuditDemand({ runId, targetRoot, specs, candidates, focuses, chain });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const m: RunManifest = { runId, ready: false, stage: 'reporting', error: { code: 'DEMAND_BUILD_FAIL', message: msg.slice(0, 300), remedy: 'Check specs/candidates validity' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: candidates.length }, rounds: { used: controller.rounds, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects: 0 };
    try { writeManifest(ledgerRoot, m); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    return toManifestJson(m);
  }

  let brief: string;
  try {
    brief = buildBrief(demand);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const m: RunManifest = { runId, ready: false, stage: 'reporting', error: { code: 'BRIEF_BUILD_FAIL', message: msg.slice(0, 300), remedy: 'Check demand validity' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: candidates.length }, rounds: { used: controller.rounds, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects: 0 };
    try { writeManifest(ledgerRoot, m); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    return toManifestJson(m);
  }

  const promptFilePath = path.join(ledgerRoot, 'brief.md');
  try {
    fs.writeFileSync(promptFilePath, brief, 'utf-8');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const m: RunManifest = { runId, ready: false, stage: 'reporting', error: { code: 'BRIEF_WRITE_FAIL', message: msg.slice(0, 300), remedy: 'Check ledger writable' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: candidates.length }, rounds: { used: controller.rounds, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects: 0 };
    try { writeManifest(ledgerRoot, m); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    return toManifestJson(m);
  }

  const specsRoots = specsRootsFor(specs);
  const p0SpecTurns: Array<{ path: string; phase: string; bytes?: number; lines?: number; at?: number }> = [];
  try {
    for (const s of specs) {
      const abs = path.resolve(s);
      try {
        const st = fs.statSync(abs);
        if (st.isFile()) {
          let lines = 0;
          try { const raw = fs.readFileSync(abs, 'utf-8'); lines = raw.split('\n').length; } catch { lines = 0; }
          p0SpecTurns.push({ path: abs, phase: 'P0', bytes: st.size, lines, at: Date.now() });
        } else {
          p0SpecTurns.push({ path: abs, phase: 'P0', at: Date.now() });
        }
      } catch {
        p0SpecTurns.push({ path: abs, phase: 'P0', at: Date.now() });
      }
    }
  } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
  const agentReadTurns: Array<{ path: string; phase: string; linesRead: number; atMs: number }> = [];
  let roundsUsed = controller.rounds;
  const agentErrors: string[] = [];
  let brainDead = false;

  const runAgentOnce = async (maxRounds: number, extraPrompt?: string): Promise<void> => {
    const demandForRun = extraPrompt ? brief + '\n\n--- REPAIR CONTEXT ---\n' + extraPrompt : brief;
    if (input.agentRunFn) {
      try {
        const res = await input.agentRunFn({ promptFilePath, systemPrompt: THE_CODE_AUDITOR_PROMPT, demand: demandForRun, maxRounds, targetRoot, ledgerRoot, specsRoots });
        roundsUsed = Math.max(roundsUsed, res.roundsUsed);
        if (res.errors.length > 0) agentErrors.push(...res.errors);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        agentErrors.push(msg);
        brainDead = true;
      }
      } else {
      try {
        const mod = await import('./agent.js');
        const AgentCtor = (mod as unknown as { AetherAgent: new () => { run: (opts: unknown) => Promise<{ roundsUsed: number; errors: string[]; fileStates: unknown[] }> } }).AetherAgent;
        const agent = new AgentCtor();
        const res = await agent.run({ promptFilePath, systemPrompt: THE_CODE_AUDITOR_PROMPT, demand: demandForRun, maxRounds, targetRoot, ledgerRoot, specsRoots, readTurns: agentReadTurns as never, phaseRef: { current: 'P1' } as never } as never);
        roundsUsed = Math.max(roundsUsed, res.roundsUsed);
        if (res.errors.length > 0) agentErrors.push(...res.errors);
        if ((res.fileStates as unknown[]).length === 0 && res.errors.length > 0) brainDead = true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        agentErrors.push(msg);
        brainDead = true;
      }
    }
  };

  await runAgentOnce(budget);

  const hasVerdictsBefore = (() => { try { return fs.existsSync(path.join(ledgerRoot, 'verdicts.json')); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); return false; } })();
  if (controller.isExhausted() && !brainDead) {
    if (!hasVerdictsBefore) brainDead = true;
  }

  if (brainDead || (agentErrors.length > 0 && !hasVerdictsBefore)) {
    controller.budgetExhausted();
    const unclassified = buildUnclassifiedVerdicts(candidates);
    try {
      const outPath = path.join(ledgerRoot, 'verdicts.json');
      fs.writeFileSync(outPath, JSON.stringify({ runId, verdicts: unclassified.verdicts }, null, 2), 'utf-8');
      const reportPath = path.join(ledgerRoot, 'report.md');
      if (!fs.existsSync(reportPath)) {
        const reportContent = `# CODE AUDIT AETHER REPORT \u2014 ${targetRoot} \u2014 ${runId}\n## 0 RUN METADATA\nprovider opencode-go/muse-spark-1.2-contributor budget ${budget} used ${roundsUsed} probe ${probeMs}ms\n## 1 THE VERDICT TABLE\n(brain-dead \u2014 all candidates UNCLASSIFIED)\n## 2 TRUE DEFECTS\n(none \u2014 UNCLASSIFIED emission)\n## 3 THE KILL LOG\n(none)\n## 4 THE ESCALATION QUEUE\n${unclassified.verdicts.map((v) => `- ${v.file}:${v.line} UNCLASSIFIED \u2014 ${v.missingEvidence}`).join('\n')}\n## 5 THE SYNTHESIS\n(brain-dead \u2014 no synthesis)\n## 6 THE SELF-VERIFY STAMP\nclaimsRechecked:0 discrepanciesFound:0 discrepanciesFixed:0 writeViolations:0\n`;
        fs.writeFileSync(reportPath, reportContent, 'utf-8');
      }
    } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    const m: RunManifest = { runId, ready: false, stage: 'budget-exhausted', error: { code: 'BUDGET_EXHAUSTED', message: agentErrors[0] ? agentErrors[0].slice(0, 300) : 'brain-dead \u2014 no artifacts produced', remedy: 'Check provider stall/budget; candidates emitted as UNCLASSIFIED' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: candidates.length }, rounds: { used: roundsUsed, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects: 0 };
    try { writeManifest(ledgerRoot, m); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    try { fs.writeFileSync(path.join(ledgerRoot, 'evidence', 'memory-append.json'), JSON.stringify({ runId, seq: Date.now(), counts: m.counts }, null, 2), 'utf-8'); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    writeReadTurnsEvidence(ledgerRoot, runId, p0SpecTurns, agentReadTurns);
    return toManifestJson(m);
  }

  let validatorRejects = 0;
  let verdictsFile: VerdictsFile | null = null;
  let lastRejections: string[] = [];

  for (let attempt = 0; attempt <= 2; attempt++) {
    const rawPath = path.join(ledgerRoot, 'verdicts.json');
    let raw: string;
    try {
      raw = fs.readFileSync(rawPath, 'utf-8');
    } catch (err: unknown) {
      void (err instanceof Error ? err.message : String(err));
      lastRejections = ['verdicts.json missing'];
      if (attempt < 2) {
        await runAgentOnce(budget - roundsUsed + 1, `VALIDATOR_REJECT attempt ${attempt + 1}: verdicts.json missing \u2014 write it now`);
        validatorRejects++;
        continue;
      }
      break;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e: unknown) {
      lastRejections = [`JSON parse fail: ${e instanceof Error ? e.message : String(e)}`];
      if (attempt < 2) {
        await runAgentOnce(1, `VALIDATOR_REJECT attempt ${attempt + 1}: ${lastRejections.join('; ')} \u2014 fix the JSON`);
        validatorRejects++;
        continue;
      }
      break;
    }
    const file = parsed as VerdictsFile;
    if (!(file as unknown as Record<string, unknown>).verdicts) (file as unknown as Record<string, unknown>).verdicts = [];
    const res = validateVerdicts(file, { candidatesCount: candidates.length, targetRoot, specs });
    if (res.ok) {
      verdictsFile = file;
      break;
    }
    lastRejections = res.rejections;
    if (attempt < 2) {
      validatorRejects++;
      await runAgentOnce(1, `VALIDATOR_REJECT attempt ${attempt + 1}: ${res.rejections.join('; ')} \u2014 fix verdicts.json now`);
      continue;
    }
  }

  if (!verdictsFile) {
    controller.validatorReject();
    const unclassified = buildUnclassifiedVerdicts(candidates);
    try {
      const outPath = path.join(ledgerRoot, 'verdicts.json');
      const exists = (() => { try { return fs.existsSync(outPath); } catch { return false; } })();
      if (!exists || lastRejections.length > 0) {
        void exists;
        fs.writeFileSync(outPath, JSON.stringify({ runId, verdicts: unclassified.verdicts }, null, 2), 'utf-8');
      }
    } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    const m: RunManifest = { runId, ready: false, stage: 'validator-reject', error: { code: 'VALIDATOR_REJECT', message: lastRejections.slice(0, 3).join('; ').slice(0, 300), remedy: 'Fix verdicts.json to satisfy V1-V8; rejections were fed back twice' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: 0 }, rounds: { used: roundsUsed, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects };
    try { writeManifest(ledgerRoot, m); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    writeReadTurnsEvidence(ledgerRoot, runId, p0SpecTurns, agentReadTurns);
    return toManifestJson(m);
  }

  const reportPath = path.join(ledgerRoot, 'report.md');
  let reportText = '';
  try {
    reportText = fs.readFileSync(reportPath, 'utf-8');
  } catch (err: unknown) {
    void (err instanceof Error ? err.message : String(err));
    const m: RunManifest = { runId, ready: false, stage: 'validator-reject', error: { code: 'REPORT_MISSING', message: 'report.md missing after P3', remedy: 'Ensure report.md with 8 markers is written' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: 0 }, rounds: { used: roundsUsed, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects };
    try { writeManifest(ledgerRoot, m); } catch (e2: unknown) { void (e2 instanceof Error ? e2.message : String(e2)); }
    return toManifestJson(m);
  }

  const markerRes = checkReportMarkers(reportText);
  if (!markerRes.ok) {
    const m: RunManifest = { runId, ready: false, stage: 'validator-reject', error: { code: 'REPORT_MARKERS_FAIL', message: `markers ${markerRes.found}/8 missing: ${markerRes.missing.join(', ')}`.slice(0, 300), remedy: 'Fix report.md to carry all 8 markers in order' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: 0 }, rounds: { used: roundsUsed, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects };
    try { writeManifest(ledgerRoot, m); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    return toManifestJson(m);
  }

  const { trueDefect, redHerring, unclear } = countsFromVerdicts(verdictsFile.verdicts as readonly { adjudication: string }[]);
  const countsReconcile = trueDefect + redHerring + unclear === candidates.length;
  if (!countsReconcile) {
    const m: RunManifest = { runId, ready: false, stage: 'validator-reject', error: { code: 'COUNTS_MISMATCH', message: `counts ${trueDefect}+${redHerring}+${unclear}=${trueDefect + redHerring + unclear} != candidatesIn ${candidates.length}`, remedy: 'Fix verdicts to reconcile counts' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect, redHerring, unclear, unclassifiedEmitted: 0 }, rounds: { used: roundsUsed, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects };
    try { writeManifest(ledgerRoot, m); } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
    return toManifestJson(m);
  }

  try {
    controller.verifyingDone();
    controller.done();
  } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }

  try {
    fs.writeFileSync(path.join(ledgerRoot, 'evidence', 'memory-append.json'), JSON.stringify({ runId, targetRoot, specs, counts: { trueDefect, redHerring, unclear, unclassifiedEmitted: 0 }, at: Date.now() }, null, 2), 'utf-8');
  } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }
  writeReadTurnsEvidence(ledgerRoot, runId, p0SpecTurns, agentReadTurns);

  try {
    const chainFile = path.join(path.resolve(targetRoot), '.trident', 'audit-ledger', 'chain.json');
    let chainArr: unknown[] = [];
    try { const _r = fs.readFileSync(chainFile, 'utf-8'); chainArr = JSON.parse(_r); if (!Array.isArray(chainArr)) chainArr = []; } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); chainArr = []; }
    (chainArr as unknown[]).push({ runId, targetRoot, specs, counts: { trueDefect, redHerring, unclear }, at: Date.now() });
    fs.mkdirSync(path.dirname(chainFile), { recursive: true });
    fs.writeFileSync(chainFile, JSON.stringify((chainArr as unknown[]).slice(-20), null, 2), 'utf-8');
  } catch (err: unknown) { void (err instanceof Error ? err.message : String(err)); }

  const manifest: RunManifest = { runId, ready: true, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect, redHerring, unclear, unclassifiedEmitted: 0 }, rounds: { used: roundsUsed, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects };
  try { writeManifest(ledgerRoot, manifest); } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const fail: RunManifest = { runId, ready: false, stage: 'verifying', error: { code: 'MANIFEST_WRITE_FAIL', message: msg.slice(0, 300), remedy: 'Check ledger writable' }, provider: 'opencode-go/muse-spark-1.2-contributor', counts: { candidatesIn: candidates.length, trueDefect, redHerring, unclear, unclassifiedEmitted: 0 }, rounds: { used: roundsUsed, budget }, wallClockMs: Date.now() - t0, probeMs, phaseLog: controller.log, validatorRejects };
    return toManifestJson(fail);
  }
  return toManifestJson(manifest);
}

export function ledgerPath(targetRoot: string, runId: string): string {
  return ledgerRootFor(targetRoot, runId);
}
