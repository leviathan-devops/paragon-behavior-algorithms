import * as fs from 'node:fs';
import * as path from 'node:path';
import { AetherAgent } from '../audit-engine/aether-backend/agent.js';
import { buildAuditorTools } from './aether-tools.js';
import { readFindingsReport, MD_FINDING_HEADER } from './aether-report-reader.js';
import type { AuditorTemplate } from './aether-templates/types.js';
import type { GraphifyMCPClient } from './graphify.js';

export interface HunterTelemetry {
  roundsUsed: number;
  toolCallsMade: number;
  toolCallNames: string[];
  errors: string[];
  fileStates: Array<{ path: string; lines: number; chars: number }>;
  text?: string;
}

export interface HunterSettlementFulfilled {
  layerId: string;
  status: 'fulfilled';
  findings: unknown;
  fileBytes: number;
  fileMtime: number;
  raw: string;
  telemetry: HunterTelemetry;
  ledgerDir: string;
  durationMs: number;
}

export interface HunterSettlementRejected {
  layerId: string;
  status: 'rejected';
  error: string;
  ledgerDir: string;
  durationMs: number;
}

export type HunterSettlement = HunterSettlementFulfilled | HunterSettlementRejected;

declare global {
  var __aetherScriptedRun: ((opts: { template: AuditorTemplate; ledgerDir: string; briefPath: string; repairPrompt?: string; attempt?: number }) => Promise<void>) | undefined;
  var __aetherLedgerSpy: ((ledger: unknown) => void) | undefined;
}

function buildBrief(template: AuditorTemplate, inputData: string): string {
  const inputBlock = inputData && inputData.trim().length > 0 ? inputData : '(no input data)';
  return template.staticPrompt + '\n\n[INPUT DATA]\nBelow is all the input data from the user that you are required to fully inference, understand, and process before proceeding with your code audit:\n' + inputBlock + '\n';
}

function resolveTargetRoot(): string {
  const cwd = process.cwd();
  try {
    const st = fs.statSync(cwd);
    if (st.isDirectory()) return cwd;
  } catch (e) { void (e as Error).message; }
  return cwd;
}

function resolveSpecsRoots(): string[] {
  const cwd = resolveTargetRoot();
  return [cwd];
}

function ensureLedgerDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'findings'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
}

export async function runLayerHunter(
  template: AuditorTemplate,
  inputData: string,
  ledgerDir: string,
  graph: GraphifyMCPClient,
  _sharedDbPath: string
): Promise<HunterSettlement> {
  const t0 = Date.now();
  const layerId = template?.layerId ?? 'unknown';
  const resolvedLedger = path.resolve(ledgerDir ?? '');
  if (!template || typeof template.layerId !== 'string' || template.layerId.trim() === '') {
    return { layerId, status: 'rejected', error: 'HUNTER_TEMPLATE_INVALID: layerId required', ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
  }
  if (!ledgerDir || typeof ledgerDir !== 'string' || ledgerDir.trim() === '') {
    return { layerId, status: 'rejected', error: 'HUNTER_LEDGER_INVALID: ledgerDir required', ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
  }
  if (!graph) {
    return { layerId, status: 'rejected', error: 'HUNTER_GRAPH_INVALID: graph required', ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
  }
  if (!template.outputSchema || typeof (template.outputSchema as { safeParse?: unknown }).safeParse !== 'function') {
    return { layerId, status: 'rejected', error: 'HUNTER_SCHEMA_INVALID: outputSchema required', ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
  }
  const targetRoot = resolveTargetRoot();
  const ledgerRoot = resolvedLedger;
  let missionTools: ReturnType<typeof buildAuditorTools>;
  try {
    missionTools = buildAuditorTools(resolvedLedger, graph, targetRoot);
  } catch (e) {
    return { layerId, status: 'rejected', error: 'HUNTER_TOOLS_FAILED: ' + String((e as Error).message ?? e).slice(0, 400), ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
  }
  try {
    ensureLedgerDir(resolvedLedger);
  } catch (e) {
    return { layerId, status: 'rejected', error: 'HUNTER_LEDGER_MKDIR_FAILED: ' + String((e as Error).message ?? e).slice(0, 400), ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
  }
  const brief = buildBrief(template, inputData ?? '');
  const briefPath = path.join(resolvedLedger, 'brief.md');
  try {
    fs.writeFileSync(briefPath, brief, 'utf-8');
  } catch (e) {
    return { layerId, status: 'rejected', error: 'HUNTER_BRIEF_WRITE_FAILED: ' + String((e as Error).message ?? e).slice(0, 400), ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
  }
  const promptFilePath = briefPath;
  const systemPrompt = `You are the ${layerId} aether bug hunter — ${template.anchorPredicate} predicate. Follow the brief exactly. Your output is findings/report.md via write_file.`;
  const specsRoots = resolveSpecsRoots();
  let agent: AetherAgent | null = null;
  try {
    agent = new AetherAgent({ ledgerId: layerId + '-' + Date.now() });
    if (typeof globalThis.__aetherLedgerSpy === 'function') {
      try { globalThis.__aetherLedgerSpy(agent.ledger); } catch (e) { void (e as Error).message; }
    }
  } catch (e) {
    return { layerId, status: 'rejected', error: 'HUNTER_AGENT_CTOR_FAILED: ' + String((e as Error).message ?? e).slice(0, 400), ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
  }
  let runResult: { text: string; lines: number; roundsUsed: number; toolCallsMade: number; toolCallNames: string[]; errors: string[]; fileStates: Array<{ path: string; lines: number; chars: number }> } | null = null;
  try {
    if (typeof globalThis.__aetherScriptedRun === 'function') {
      await globalThis.__aetherScriptedRun({ template, ledgerDir: resolvedLedger, briefPath });
      runResult = { text: '', lines: 0, roundsUsed: 1, toolCallsMade: 1, toolCallNames: [], errors: [], fileStates: [] };
    } else {
      runResult = await agent.run({ promptFilePath, systemPrompt, targetRoot, ledgerRoot, specsRoots, maxRounds: 2, tools: missionTools } as never);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reportPath = path.join(resolvedLedger, 'findings', 'report.md');
    if (!fs.existsSync(reportPath)) {
      return { layerId, status: 'rejected', error: 'HUNTER_RUN_FAILED: ' + msg.slice(0, 500), ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
    }
  }
  if (runResult && runResult.errors && runResult.errors.length > 0) {
    const hasReport = fs.existsSync(path.join(resolvedLedger, 'findings', 'report.md'));
    if (!hasReport) {
      return { layerId, status: 'rejected', error: 'HUNTER_RUN_ERROR: ' + runResult.errors[0]!.slice(0, 500), ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
    }
  }
  const reportPath = path.join(resolvedLedger, 'findings', 'report.md');
  let read: { findings: unknown; fileBytes: number; fileMtime: number; raw: string };
  let repairAttempted = false;
  let firstGrammarError: string | null = null;
  try {
    read = await readFindingsReport(reportPath, template.outputSchema as never);
  } catch (e) {
    const firstMsg = String((e as Error).message ?? e);
    if (firstMsg.includes('GRAMMAR_VIOLATION') && !repairAttempted) {
      repairAttempted = true;
      firstGrammarError = firstMsg;
      const repairPrompt = `REPAIR: your findings/report.md did not parse: ${firstMsg} — rewrite findings/report.md in the markdown finding grammar: ${MD_FINDING_HEADER} blocks with - predicate/- file/- evidence/- spec`;
      try { fs.writeFileSync(path.join(resolvedLedger, 'repair-prompt.md'), repairPrompt, 'utf-8'); } catch (ee) { void (ee as Error).message; }
      try { fs.appendFileSync(path.join(resolvedLedger, 'repair-ledger.log'), repairPrompt + '\n', 'utf-8'); } catch (ee) { void (ee as Error).message; }
      try {
        if (typeof globalThis.__aetherScriptedRun === 'function') {
          await (globalThis.__aetherScriptedRun as unknown as (opts: Record<string, unknown>) => Promise<void>)({ template, ledgerDir: resolvedLedger, briefPath, repairPrompt, attempt: 2 });
          runResult = { text: '', lines: 0, roundsUsed: 1, toolCallsMade: 1, toolCallNames: [], errors: firstGrammarError ? [firstGrammarError] : [], fileStates: runResult?.fileStates ?? [] } as never;
        } else if (agent) {
          const second = await agent.run({ promptFilePath, systemPrompt, targetRoot, ledgerRoot, specsRoots, maxRounds: 2, demand: repairPrompt, tools: missionTools } as never);
          runResult = second;
        }
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        return { layerId, status: 'rejected', error: `${firstGrammarError} | RETRY_RUN_FAILED: ${msg2.slice(0, 300)}`.slice(0, 600), ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
      }
      try {
        read = await readFindingsReport(reportPath, template.outputSchema as never);
      } catch (e2) {
        const secondMsg = String((e2 as Error).message ?? e2);
        const combined = `${firstGrammarError} | RETRY_FAILED: ${secondMsg}`;
        return { layerId, status: 'rejected', error: combined.slice(0, 600), ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
      }
    } else {
      return { layerId, status: 'rejected', error: firstMsg.slice(0, 600), ledgerDir: resolvedLedger, durationMs: Date.now() - t0 };
    }
  }
  const errs = [...(runResult?.errors ?? [])];
  if (firstGrammarError && !errs.includes(firstGrammarError)) errs.unshift(firstGrammarError);
  const telemetry: HunterTelemetry = {
    roundsUsed: (runResult?.roundsUsed ?? 0) + (repairAttempted ? 1 : 0),
    toolCallsMade: runResult?.toolCallsMade ?? 0,
    toolCallNames: (runResult as unknown as { toolCallNames?: string[] })?.toolCallNames ?? [],
    errors: errs,
    fileStates: runResult?.fileStates ?? [],
    text: runResult?.text ?? read.raw.slice(0, 2000),
  };
  return {
    layerId,
    status: 'fulfilled',
    findings: read.findings,
    fileBytes: read.fileBytes,
    fileMtime: read.fileMtime,
    raw: read.raw,
    telemetry,
    ledgerDir: resolvedLedger,
    durationMs: Date.now() - t0,
  };
}

export const __divergences = [
  'Q1-adapter: spec pseudocode new ShadowAgent(ledgerDir) + run({brief,tools,maxRounds:2}) diverged; reality: new AetherAgent({ledgerId}) + run({promptFilePath,systemPrompt,targetRoot,ledgerRoot,specsRoots,maxRounds}) — promptFilePath REQUIRED, tools not passed (agent builds its own via createAuditorTools), cwd via ledgerRoot/targetRoot not ctor param',
  'Q1-tools: buildAuditorTools output assembled per mission for validation/side-effects but NOT injected into AetherAgent (it owns createAuditorTools); external seam tools and internal spine tools are distinct layers',
  'Q1-report: spec pseudocode readFindingsReport(ledgerDir+"/findings/report.md") without schema; reality validates with template.outputSchema via zod safeParse — schema failure becomes HunterSettlement rejected',
  'Q1-rename: ShadowAgent→AetherAgent, ShadowAgentRunOptions→AetherAgentRunOptions — renames landed in A0, adapter imports the renamed surface',
];
