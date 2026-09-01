import * as fs from 'node:fs';
import * as path from 'node:path';
import { THE_CODE_AUDITOR_PROMPT, THE_ADJUDICATION_RUBRIC, CALIBRATION_SHOTS } from './identity.js';
import { budgetRounds } from './phase-controller.js';

export interface CandidateTriple {
  readonly index: number;
  readonly layer: string;
  readonly side: string;
  readonly file: string;
  readonly line: number;
  readonly predicate?: string;
  readonly evidenceQuote?: string;
  readonly implicatedSpecClause?: string;
  readonly subject?: string;
  readonly object?: string;
}

export interface ChainRow {
  readonly runId: string;
  readonly seq: number;
  readonly targetRoot?: string;
  readonly specsJson?: string;
  readonly countsJson?: string;
  readonly topFindings?: readonly {
    readonly findingIndex: number;
    readonly layer: string;
    readonly verdict: string;
    readonly confidence: number;
    readonly oneLiner: string;
  }[];
}

export interface AuditDemand {
  readonly runId: string;
  readonly targetRoot: string;
  readonly specs: readonly string[];
  readonly focuses: readonly string[];
  readonly candidates: readonly CandidateTriple[];
  readonly chain: readonly ChainRow[];
  readonly budgetRounds: number;
}

export interface BuildAuditDemandInput {
  readonly runId: string;
  readonly targetRoot: string;
  readonly specs: readonly string[];
  readonly focuses?: readonly string[];
  readonly candidates: readonly CandidateTriple[];
  readonly chain?: readonly ChainRow[];
}

export function computeConfidence(opts: {
  readonly allLegsQuoted: boolean;
  readonly derailmentMode?: string;
  readonly anyLegParaphrased?: boolean;
}): { confidence: number; verdict: 'TRUE_DEFECT' | 'UNCLEAR'; reason?: string } {
  let c = 0.85;
  if (opts.derailmentMode) c += 0.05;
  if (opts.anyLegParaphrased) c -= 0.15;
  c = Math.round(c * 100) / 100;
  if (c < 0.55) return { confidence: c, verdict: 'UNCLEAR', reason: `confidence ${c.toFixed(2)} < 0.55 — not emittable; missing verbatim leg or excessive paraphrase` };
  if (c > 1.0) c = 1.0;
  if (!opts.allLegsQuoted) return { confidence: c, verdict: 'UNCLEAR', reason: 'not all three legs quoted — cannot emit TRUE_DEFECT' };
  return { confidence: c, verdict: 'TRUE_DEFECT' };
}

export function buildAuditDemand(input: BuildAuditDemandInput): AuditDemand {
  if (!input.runId || typeof input.runId !== 'string' || input.runId.trim().length === 0) {
    throw new Error('BuildAuditDemandInput.runId must be a non-empty string');
  }
  if (!input.targetRoot || typeof input.targetRoot !== 'string' || input.targetRoot.trim().length === 0) {
    throw new Error('BuildAuditDemandInput.targetRoot must be a non-empty string');
  }
  if (!Array.isArray(input.specs) || input.specs.length === 0) {
    throw new Error('BuildAuditDemandInput.specs must be a non-empty array (>=1 spec required — MC-S-02)');
  }
  for (const s of input.specs) {
    if (typeof s !== 'string' || s.trim().length === 0) throw new Error(`spec entry must be a non-empty string, got: ${JSON.stringify(s)}`);
  }
  if (!Array.isArray(input.candidates)) throw new Error('BuildAuditDemandInput.candidates must be an array');
  for (const c of input.candidates) {
    if (typeof c.index !== 'number' || typeof c.file !== 'string' || typeof c.line !== 'number' || typeof c.layer !== 'string') {
      throw new Error(`candidate missing required fields (index/file/line/layer): ${JSON.stringify(c)}`);
    }
  }
  const focuses = input.focuses ?? [];
  for (const f of focuses) {
    if (typeof f !== 'string') throw new Error(`focus must be a string, got: ${JSON.stringify(f)}`);
  }
  const chain = input.chain ?? [];
  const rounds = budgetRounds(input.candidates.length);
  return {
    runId: input.runId,
    targetRoot: input.targetRoot,
    specs: [...input.specs],
    focuses: [...focuses],
    candidates: [...input.candidates],
    chain: [...chain],
    budgetRounds: rounds,
  };
}

function buildPart1Supremacy(): string {
  return ['# PART 1 — THE SUPREMACY CONTRACT (frozen, §2.4.1 — verbatim)', '', THE_CODE_AUDITOR_PROMPT].join('\n');
}

function buildPart2Inference(chain: readonly ChainRow[]): string {
  const lines: string[] = ['# PART 2 — [AETHER INFERENCE] (memory chain, §2.9)', ''];
  if (chain.length === 0) {
    lines.push('(no prior runs — this is the first audit on this target; proceed from the specs + candidates alone)');
  } else {
    const recent = chain.slice(-5);
    lines.push(`Last ${recent.length} runs (hydrated silently — history, not truth):`);
    for (const row of recent) {
      lines.push(`  run ${row.runId} (seq=${row.seq}) target=${row.targetRoot ?? '—'} counts=${row.countsJson ?? '—'}`);
      if (row.topFindings && row.topFindings.length > 0) {
        const top = [...row.topFindings].sort((a, b) => b.confidence - a.confidence).slice(0, 3);
        for (const f of top) lines.push(`    #${f.findingIndex} ${f.layer} ${f.verdict} conf=${f.confidence} — ${f.oneLiner}`);
      }
    }
    lines.push('');
    lines.push('Contradiction flags: where the current candidates disagree with a prior verdict, verify against CURRENT files — prior runs are history (supremacy clause 4).');
  }
  return lines.join('\n');
}

function buildPart3Specs(specs: readonly string[]): string {
  const lines: string[] = ['# PART 3 — THE SPECS INGEST (mandatory input — every spec fully read by end of P0)', ''];
  for (const specPath of specs) {
    lines.push(`## SPEC: ${specPath}`);
    let text: string | null = null;
    try {
      const abs = path.isAbsolute(specPath) ? specPath : path.resolve(specPath);
      if (fs.existsSync(abs)) {
        const raw = fs.readFileSync(abs, 'utf-8');
        const split = raw.split('\n');
        if (split.length > 2500) {
          lines.push(`(windowed at 2500L/pass — ${split.length} lines total; the agent ALSO re-reads via read_file for depth)`);
          lines.push(split.slice(0, 2500).join('\n'));
          lines.push(`... (${split.length - 2500} more lines — read via read_file windows)`);
        } else {
          lines.push(raw);
        }
        text = raw;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`(read error: ${msg.slice(0, 120)} — agent MUST read via read_file at P0)`);
    }
    if (text === null && lines[lines.length - 1] === `## SPEC: ${specPath}`) {
      lines.push(`(spec file not readable at build time — the agent MUST read it via read_file at P0; path: ${specPath})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function buildPart4Candidates(candidates: readonly CandidateTriple[]): string {
  const lines: string[] = ['# PART 4 — THE CANDIDATES (per layer, mechanical triples — verbatim from detectors)', ''];
  if (candidates.length === 0) {
    lines.push('(no candidates — the honest-empty case: P0+P3+P4 = 3 rounds; the report still lands with an empty §1 table)');
  } else {
    for (const c of candidates) {
      lines.push(`CANDIDATE ${c.index} | ${c.layer} | ${c.side} | ${c.file}:${c.line}`);
      if (c.predicate) lines.push(`  predicate: ${c.predicate}`);
      else if (c.subject || c.object) lines.push(`  triple: ${c.subject ?? '—'} — ${c.predicate ?? '—'} — ${c.object ?? '—'}`);
      if (c.evidenceQuote) lines.push(`  evidence window (±40L excerpt): ${c.evidenceQuote.slice(0, 600)}`);
      if (c.implicatedSpecClause) lines.push(`  implicated spec clause (HINT — verify by reading): ${c.implicatedSpecClause}`);
      lines.push('  (the implicating clause is a HINT, not truth — rubric Law 1(a) requires the agent to verify the clause by reading it)');
      lines.push('');
    }
  }
  return lines.join('\n');
}

function buildPart5FocusesAndContract(focuses: readonly string[]): string {
  const lines: string[] = ['# PART 5 — THE FOCUSES + THE REPORT CONTRACT (§2.6)', ''];
  if (focuses.length > 0) {
    lines.push('## FOCUSES (auditor attention hints — not exhaustive)');
    for (const f of focuses) lines.push(`  - ${f}`);
    lines.push('');
  } else {
    lines.push('## FOCUSES: (none — audit the full candidate set against the specs)');
    lines.push('');
  }
  lines.push('## REPORT CONTRACT (P3 — the agent writes BOTH files in ONE batched round)');
  lines.push('  ledger: <target>/.trident/audit-ledger/<runId>/{verdicts.json, report.md, manifest.json, evidence/}');
  lines.push('  verdicts.json — THE MACHINE LEG (schema per §2.6.1; validator §2.6.2 V1-V8):');
  lines.push('    { runId, verdicts: [{ findingIndex, layer, adjudication: TRUE_DEFECT|RED_HERRING|UNCLEAR,');
  lines.push('      file, line, specPath?, specLine?, specQuote?, codeQuote?, divergence?,');
  lines.push('      legitimizingReason?, missingEvidence?, confidence: 0.55..1.0, derailmentMode? }] }');
  lines.push('  report.md — THE HUMAN DELIVERABLE (8 markers, §2.6.3):');
  lines.push('    ## 0 RUN METADATA  ## 1 THE VERDICT TABLE  ## 2 TRUE DEFECTS');
  lines.push('    ## 3 THE KILL LOG  ## 4 THE ESCALATION QUEUE  ## 5 THE SYNTHESIS');
  lines.push('    ## 6 THE SELF-VERIFY STAMP  (claimsRechecked, discrepanciesFound, discrepanciesFixed, writeViolations)');
  lines.push('  Rubric + shots:');
  lines.push(THE_ADJUDICATION_RUBRIC);
  lines.push('');
  for (const shot of CALIBRATION_SHOTS) {
    lines.push(`  ${shot.title}`);
    lines.push(shot.body);
    lines.push('');
  }
  return lines.join('\n');
}

export function buildBrief(demand: AuditDemand): string {
  if (!demand || typeof demand.runId !== 'string' || !Array.isArray(demand.specs) || !Array.isArray(demand.candidates)) {
    throw new Error('buildBrief: demand must be a valid AuditDemand (runId/specs/candidates required)');
  }
  if (demand.specs.length === 0) throw new Error('buildBrief: demand.specs must be non-empty (MC-S-02)');
  const parts: string[] = [];
  parts.push(buildPart1Supremacy());
  parts.push(buildPart2Inference(demand.chain));
  parts.push(buildPart3Specs(demand.specs));
  parts.push(buildPart4Candidates(demand.candidates));
  parts.push(buildPart5FocusesAndContract(demand.focuses));
  return parts.join('\n\n---\n\n');
}

export function briefParts(brief: string): string[] {
  return brief.split('\n\n---\n\n');
}
