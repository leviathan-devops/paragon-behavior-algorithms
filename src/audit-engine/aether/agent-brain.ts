// ═══ AGENT BRAIN — THE STEP-X COMPOSE VIA THE REAL PI AETHER AGENT ═══
// THE SINGLE-PROVIDER FORM (2026-08-24): compose(brief) writes the findings brief to
// disk, runs THE REAL AetherAgent (pi SDK, single-provider opencode-go/muse-spark-1.2-contributor
// at https://opencode.ai/zen/go/v1/chat/completions, RPM ledger, read+grep+report-write tools,
// xhigh reasoning, 15×3s retry, your round loop), reads the judgment.md back, and parses it
// through parseProbeResult — whose verdicts then face the silent-verifier unchanged. NO null path:
// the backend is always constructible (single seeded key).
//
// THE FILE IS THE DELIVERABLE (the boilerplate's A2 law): the model edits/
// writes its judgment INTO judgment.md via report-write; this adapter reads
// THAT file — never the chat stream.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'path';

import { AETHER_COMPOSE_FAILED } from './deeper-probe.js';
import { parseProbeResult } from './deeper-probe.js';
import { RpmLedger } from './rpm-ledger.js';
import { AetherAgent } from '../harness/pi-aether-agent.js';
import type { ProbedVerdict } from './silent-verifier.js';
import type { CompositionResult, AetherBrain, AetherBrief } from './aether-brain.js';

/** THE ADJUDICATOR SYSTEM PROMPT — the identity + discipline (the W-laws
 *  adapted to investigation/judgment; ~10% weight per the boilerplate §7). */
const ADJUDICATOR_SYSTEM_PROMPT = [
  'You are a CODE-AUDIT ADJUDICATOR. The deterministic machinery has produced findings; your job is the JUDGMENT PASS: verify each finding against the real code and produce the adjudicated verdict document.',
  'THE SUPREMACY CONTRACT: the files/graph are the only ground truth. Verify every claim by reading/grepping the actual source. Never invent a file/line. If the evidence is ambiguous, say so in the verdict.',
  'BATCH LAW: batch all greps and all reads per turn. Investigate FIRST (round 1), judge SECOND (round 2 via report_write). Never drip one tool call per turn.',
  'EVIDENCE LAWS: cite file:line for every claim. deeper_root ≤200 chars of mechanism prose. concrete_fix ≤300 chars with the exact change. consequence_rank 1=fix-first (hot path/data integrity) … 4=cosmetic.',
  'RED_HERRING means the finding is noise (e.g., a marker string that is data, a matcher over-fire) — say WHY in the root.',
  'THE FILE IS THE ONLY DELIVERABLE: your judgment exists as the report_write document, nowhere else. Never emit the full judgment as chat text.',
].join('\n');

export interface AgentBrainOptions {
  /** The audited project root — greps/reads are scoped here. */
  targetPath: string;
  /** ONE shared ledger per audit run (wave-aware scoping). */
  ledger?: RpmLedger;
}

/** THE BRAIN FACTORY — always constructible (the seeded keys), no null path. */
export function createAgentAetherBrain(opts: AgentBrainOptions): AetherBrain & { describe(): string } {
  const runRoot = opts.targetPath;
  return {
    describe(): string {
      return 'pi-aether-agent: opencode-go/muse-spark-1.2-contributor (single-provider, xhigh reasoning, 15×3s, RPM-ledgered)';
    },
    async compose(brief: AetherBrief): Promise<CompositionResult> {
      // ── STAGE 0 — THE THIN-BRIEF VALIDATION (unchanged loud refusal) ──
      if (!brief || !Array.isArray(brief.findings) || brief.findings.length < 1) {
        throw new Error(`${AETHER_COMPOSE_FAILED}: no findings to probe — the aether cannot judge nothing`);
      }

      // ── THE BRIEF FILE (the ground truth the agent investigates) ──
      const runId = `stepx-${Date.now()}`;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stepx-run-'));
      const briefPath = path.join(tmpDir, 'brief.md');
      const judgmentPath = path.join(tmpDir, 'judgment.md');

      const lines: string[] = [];
      lines.push(`# THE STEP-X ADJUDICATION BRIEF`);
      lines.push(``);
      lines.push(`Target: ${brief.groundTruth.targetPath}`);
      lines.push(`Graph: ${brief.groundTruth.graph.nodes} nodes / ${brief.groundTruth.graph.edges} edges · hotspot: ${JSON.stringify(brief.groundTruth.graph.hotspot.slice(0, 10))}`);
      lines.push(`Events flow verdict: ${brief.groundTruth.events.flowVerdict}`);
      lines.push(`Findings to adjudicate: ${brief.findings.length}`);
      lines.push(`Judgment output path (report_write target): ${judgmentPath}`);
      lines.push(``);
      for (const f of brief.groundTruth.findings) {
        lines.push(`---`);
        lines.push(`### FINDING ${f.index}`);
        lines.push(`- layer: ${f.layer} | severity: ${f.severity} | category: ${f.category}`);
        lines.push(`- location: ${f.file}:${f.line}`);
        lines.push(`- calibration: ${f.calibration}${f.callGraphRef ? ` | graph anchor: ${f.callGraphRef}` : ''}`);
        lines.push(`- evidence: ${f.evidence}`);
        lines.push(`- SOURCE WINDOW:`);
        lines.push('```');
        for (const wl of f.sourceWindow.split('\n')) lines.push(wl);
        lines.push('```');
      }
      lines.push(`---`);
      lines.push(``);
      lines.push(`## THE JUDGMENT CONTRACT (report_write MUST emit this structure)`);
      lines.push(``);
      lines.push(`# STEP-X JUDGMENT`);
      lines.push(`## 1. THE EXECUTIVE SUMMARY`);
      lines.push(`<the consequence-ranked verdict prose>`);
      lines.push(`## 2. THE FINDING BLOCKS`);
      lines.push(`### FINDING 0`);
      lines.push(`ADJUDICATION: TRUE_POSITIVE | RED_HERRING | UNCLEAR`);
      lines.push(`DEEPER ROOT: <≤200-char mechanism prose>`);
      lines.push(`CONCRETE FIX: <≤300-char remediation with file:line>`);
      lines.push(`CONSEQUENCE RANK: 1|2|3|4`);
      lines.push(`(one block per finding index, ALL indices covered)`);
      lines.push(`## 3. THE RED-HERRINGS`);
      lines.push(`<each RED_HERRING with its calibration note>`);
      fs.writeFileSync(briefPath, lines.join('\n'), 'utf-8');

      // ── THE REAL AETHER AGENT RUN (your machinery, unmodified) ──
      const agent = new AetherAgent({
        targetRoot: brief.groundTruth.targetPath,
        judgmentPath,
        ledger: opts.ledger,
      });
      const result = await agent.run({
        promptFilePath: briefPath,
        systemPrompt: ADJUDICATOR_SYSTEM_PROMPT,
        demand: `Adjudicate the ${brief.findings.length} findings in this brief against the real code at ${runRoot}. The judgment contract and every finding's data are in ${briefPath}.`,
        targetRoot: brief.groundTruth.targetPath,
        judgmentPath,
      });

      // ── THE LOUD FAIL (your A2 law): errored AND nothing written ──
      if (result.errors.length > 0 && !fs.existsSync(judgmentPath)) {
        throw new Error(`${AETHER_COMPOSE_FAILED}: ${result.errors[0]}`);
      }
      if (!fs.existsSync(judgmentPath)) {
        throw new Error(`${AETHER_COMPOSE_FAILED}: the agent wrote no judgment — NO fake report`);
      }

      // ── THE PARSE BACK (the judgment.md → the verdicts + the narrative).
      // parseProbeResult keys off the ### FINDING n blocks the agent wrote
      // INTO the file — a written artifact, not streamed prose. ──
      const judgment = fs.readFileSync(judgmentPath, 'utf-8');
      const parsed = parseProbeResult(judgment, brief.groundTruth.findings);

      const execMatch = judgment.match(/## 1\. THE EXECUTIVE SUMMARY\s*\n([\s\S]*?)(?=\n## 2\.|$)/);
      const narrative = (execMatch?.[1] ?? '').trim();
      if (!narrative) {
        throw new Error(`${AETHER_COMPOSE_FAILED}: the judgment carried no executive summary — NO fake narrative`);
      }

      return {
        verdicts: parsed,
        narrative,
        modelMeta: {
          model: 'opencode-go/muse-spark-1.2-contributor',
          provider: 'opencode-go',
          composedAt: Date.now(),
        },
      };
    },
  };
}
