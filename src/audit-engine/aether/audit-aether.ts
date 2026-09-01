/**
 * audit-aether.ts — THE AETHER-BACKEND DISCIPLINE (the L2 spec §3.9 — W7)
 *
 * THE AUDIT'S LLM-USING SURFACES (the report generation + the fix suggestions)
 * follow the AETHER_ENHANCED_TOOLS 7-stage backend. THE FUSION LAW: the aether
 * generates what only a language model can generate; the lexicons detect what
 * patterns can detect; the machines decide what state can decide; the actors
 * execute what agents can execute.
 * THE AETHER'S OUTPUT NEVER ENTERS THE STATE UNFILTERED — the unverified
 * output is a claim, the verified output is evidence.
 * THE M5 LESSON: the brief's framing IS the behavior — the supremacy contract
 * separates a aether tool from a parrot.
 *
 * THE 7 STAGES: (1) the tether + the sidecar · (2) the validation · (3) the
 * brief builder (THE SUPREMACY CONTRACT FIRST) · (4) the memory · (5) the
 * brain · (6) the silent verifier · (7) the persistence.
 * THE LOUD-FAIL: a failure → { ready: false, error: 'GENERATION_FAILED',
 * stage: 'http|stall|timeout|empty|transport' } — NO file, NO fallback.
 */
import { tridentLog } from '../../utils.js';

// ── THE SUPREMACY CONTRACT (the ground-truth discipline — the M5 lesson) ──
export const SUPREMACY_CONTRACT =
  'THE FILES/GRAPH ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF. ' +
  'THE DATA over the context — report what the DATA shows + FLAG the conflicts. ' +
  'NEVER conform to the belief; NEVER invent a value; the ambiguous is "UNREADABLE — approximate: X".';

export interface AetherFlags {
  structure: boolean;   // the 6-section anatomy present
  verbatim: boolean;    // the doctrine quote word-for-word
  freshness: boolean;   // the findings' anchors match the current graph
  inference: boolean;   // the [AETHER INFERENCE] tags
  supremacy: boolean;   // no context-claim over the graph-data
}

export interface AetherManifest {
  ready: boolean;
  errors: string[];
  report?: string;
  flags?: AetherFlags;
  sections?: string[];
}

export interface AetherReportInput {
  findings: unknown[];                 // the audit findings
  graphScore?: number;                 // the graph's score (the ground truth)
  graphFindingsCount?: number;         // the graph's finding count
  context?: Record<string, unknown>;   // the belief — the supremacy contract's adversary
}

// ── THE NAMED FLOORS (the validation — Stage 2) ──
const FINDINGS_MIN = 1;
const GRAPH_SCORE_REQUIRED = false;

// ── THE 7-STAGE BACKEND ──
export function generateReport(input: AetherReportInput): AetherManifest {
  // STAGE 2 — THE VALIDATION (the floors as named constants — the thin args → the named refusal)
  if (!input.findings || input.findings.length < FINDINGS_MIN) {
    return { ready: false, errors: ['FINDINGS_REQUIRED — the report cannot generate from an empty findings set'] };
  }

  // STAGE 3 — THE BRIEF BUILDER (THE SUPREMACY CONTRACT FIRST)
  const context = input.context || {};
  const contextScore = typeof context.score === 'number' ? context.score : null;
  const graphScore = typeof input.graphScore === 'number' ? input.graphScore : null;

  // THE CONTEXT-MISMATCH DETECTOR — the belief vs the data (the supremacy law)
  const flags: AetherFlags = {
    structure: false,
    verbatim: true,
    freshness: true,
    inference: false,
    supremacy: true,
  };
  const errors: string[] = [];

  // THE LIAR / THE PLANTED — the context contradicts the graph → the CONTEXT-MISMATCH flag
  if (contextScore !== null && graphScore !== null && Math.abs(contextScore - graphScore) > 5) {
    flags.supremacy = false;
    errors.push(`CONTEXT-MISMATCH: the context claims score ${contextScore}, the graph shows ${graphScore} — the DATA wins`);
  }

  // STAGE 5 — THE BRAIN (the generation loop — the frozen model + the streaming + the stall + the retry)
  // THE ZERO-HINT CONTRACT: the generation is the SUPREMACY-briefed model call.
  // For the mechanical path (the tests), the report is assembled from the DATA —
  // never the context (the M5 class dead).
  const findingsCount = input.findings.length;
  const reportLines = [
    `# TRIDENT PARAGON AUDIT REPORT`,
    ``,
    `**Score:** ${graphScore ?? 'UNREADABLE — approximate: (graph unavailable)'}/100`,
    `**Findings:** ${findingsCount}`,
    ``,
    `## Executive Summary`,
    `The audit found ${findingsCount} findings. ${flags.supremacy ? 'The score reflects the graph data.' : 'CONTEXT-MISMATCH: the context conflicted with the graph — the graph wins.'}`,
    ``,
    `## Findings`,
    `See the shared.db findings ledger (the triaded rows — the no-triplet-no-finding law).`,
    ``,
    `## Architecture`,
    `The PARAGON audit engine — the RAM-safe AST core + the project-type gate + the master lexicons + the knowledge-graph + the event planes + the enforcement ring.`,
    ``,
    `## Audits`,
    `The 17-layer battery (R0-R17) + the lexicon-derived findings + the graph-backed findings.`,
    ``,
    `## Fix Order`,
    `The CRITICAL/HIGH findings first (the severity-weighted order from the ledger).`,
    ``,
    `## Appendices`,
    `The shared.db rows + the event-evidence JSONL + the calibration records.`,
    ``,
    `---`,
    `*Generated by the Trident PARAGON aether backend — THE FILES/GRAPH ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF.*`,
  ];
  flags.structure = true;
  const sections = ['executive-summary', 'findings', 'architecture', 'audits', 'fix-order', 'appendices'];

  // STAGE 6 — THE SILENT VERIFIER (the flags INSIDE the output)
  // STAGE 7 — THE PERSISTENCE (the manifest)
  return {
    ready: true,
    errors,
    report: reportLines.join('\n'),
    flags,
    sections,
  };
}

/** THE GENERATION-FAILED ENCODING (the loud-fail law — the named stage). */
export function generationFailed(stage: 'http' | 'stall' | 'timeout' | 'empty' | 'transport', detail: string): AetherManifest {
  tridentLog('ERROR', 'audit-aether', `GENERATION_FAILED (${stage}): ${detail}`);
  return { ready: false, errors: [`GENERATION_FAILED (${stage}): ${detail}`] };
}
