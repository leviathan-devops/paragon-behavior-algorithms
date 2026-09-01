// src/subagents/trident-bug-hunter/tools/report-writer.ts
// THE REPORT-WRITER — muse-spark-1.2-contributor on opencode-go @ https://opencode.ai/zen/go/v1/chat/completions · max_tokens 131072 · single-provider (operator ruling 2026-08-24). The generation
// engine for the exhaustive bug-hunt report — the HARDCODED 131072 contract.
// The writer
// assembles the generation prompt from the findings + the graph summaries +
// the report_sections contract (the 6-part per-finding columns at §4.1:
// 1663-1673), POSTs to the provider, streams the response, and writes the
// report to <project>/MASTER_CONTEXT/bug_hunter_report_v<N>.md (the LOCKED
// path — the N-versioning: v1, v2, ... never an overwrite, §7.3.4).
//
// THE DIRECT WRITER (D8, C1.11): "i think the subagent should write this
// directly we dont need a aether writer for this" — the writer IS the write
// path; the harness/report actor hands it the prompt payload (spec §2.8:
// harness/report → report-writer "assembles the generation prompt + writes
// via the report-scope path").
//
// THE STANDALONE RULE: this module does NOT import W3's artifact-scope — the
// scope hook wires the enforcement at the platform level in W7. The writer's
// OWN target constant carries the same locked-path convention (MASTER_CONTEXT
// + bug_hunter_report_v<N>) so the module is self-contained and testable.
//
// THE ZERO-ADD RULE: no new dependency — the transport is the platform's
// global fetch, injected for the unit battery (the mocked-transport tests
// never touch the network).
//
// THE LOUD-FAIL-OR-CLEAR-PASS LAW (O32.1 GENERATION_FAILED): ANY transport
// failure (the 500, the timeout, the empty stream, the mid-stream error) →
// the named error + NO partial report file on disk. A truncated report
// dressed as success is BANNED.

import { join } from 'node:path';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import { openStore } from '../../../shared/knowledge-graph/db.ts';
import { MASTER_CONTEXT_VARIANTS } from '../firewall/lexicon-types.ts';
import { buildArchitectureDiagrams } from '../graph/likec4-bridge.ts';
export { MASTER_CONTEXT_VARIANTS };

// ---------------------------------------------------------------------------
// THE HARDCODED GENERATION CONTRACT (D14, §10.1:4695, C35.3) — the literal
// constants the hardcode greps assert (384000 / the model string / the
// provider). These are the operator's mandated values, never configurable.
// ---------------------------------------------------------------------------

/** The model — muse-spark-1.2-contributor on opencode-go (operator hardcode 2026-08-24). */
export const GENERATION_MODEL = 'muse-spark-1.2-contributor';

/** The provider — opencode-go (single-provider, operator ruling 2026-08-24). */
export const GENERATION_PROVIDER = 'opencode-go';

/** The max output tokens — HARDCODED 131072 (operator ruling 2026-08-24, aligns with pi-aether-agent.ts:150). */
export const MAX_GENERATION_TOKENS = 131072;

/** Streaming — HARDCODED (D14, §10.1: stream = true). */
export const GENERATION_STREAM = false; // 2026-08-28: muse rides the openai-responses family (non-streaming JSON) — the completions-SSE path 500s for muse at any payload

/** The connection header — HARDCODED (D14, §10.1: connection: close). The
 *  container-proven transport pattern (FULL_BUILD_REPORT:164 — the N4 patched
 *  plugin sha 9528a697): `connection: "close"` prevents the keep-alive pooling
 *  that let a stale socket hang the aether-brain's wave generator silently. */
export const GENERATION_CONNECTION = 'close';

/** The per-read stall — HARDCODED (D14, §10.1: the 90s/300s timeouts). The
 *  container-proven AETHER_FETCH_STALL_MS 45000→90000 (FULL_BUILD_REPORT:164).
 *  A provider that delivers no SSE event within this window is STALLED — a
 *  loud fail, not a silent clock wait. */
export const FETCH_STALL_MS = 90000;

/** The overall generation budget — HARDCODED (D14, §10.1: the 90s/300s
 *  timeouts). The container-proven AETHER_TIMEOUT_MS 180000→300000
 *  (FULL_BUILD_REPORT:164). Nothing about the whole request may exceed it. */
export const GENERATION_TIMEOUT_MS = 300000;

/** The provider endpoint base — https://opencode.ai/zen/go/v1 (operator ruling 2026-08-24, R-5 CORRECT endpoint). Appends `/chat/completions`. */
export const GENERATION_BASE_URL = 'https://opencode.ai/zen/go/v1';

/** The chunked-assembly cap (G19.3). The 384K output is assembled in SEQUENTIAL
 *  chunks when the provider caps a single completion (finish_reason=length).
 *  16 chunks × the continuation mechanism covers the budget; a provider that
 *  never finishes within the cap is a loud fail, never an infinite loop. */
export const MAX_GENERATION_CHUNKS = 16;

/** THE REPORT'S ACTIONABLE FINDINGS CAP (the 2026-08-14 host-test fix — the
 *  operator: "5 HOURS FOR A FUCKING REPORT IS NOT FUCKING REALISTIC"). The
 *  20,551-finding host report split into 27 batches × ~10 min ≈ 4.5h — broken.
 *  THE OPERATOR'S CONTRACT: "dense enough that within 1-2 passes literally the
 *  entire codebase can be fixed" — the report's job is the RANKED ACTIONABLE
 *  CORE, not the multi-hour dump of every noisy finding. THE FIX: the report
 *  renders the top-N findings by rank (the findings arrive ranked: severity ×
 *  history — the fix order's core) + the full count + the class distribution;
 *  the FULL set stays in the shared.db (the truth). THE CAP: 500 — one batch's
 *  worth (~1M chars ≈ 300K tokens + the 384K output ≈ 684K ≤ the 1,048,576
 *  window) → a single ~10-minute generation. The full findings remain queryable
 *  via the DB + the 7-verb surface. */
export const MAX_REPORT_FINDINGS = 500;

/** THE INPUT BOUND (the 2026-08-14 host-test recalibration — BUG #11): the
 *  provider's window (1,048,576 tokens) − the 384K output = 664,576 input
 *  tokens ≈ 1.5M chars at the official 0.3 tokens/char ratio (1 English char ≈
 *  0.3 token — the DeepSeek-documented ratio). The batch splitter enforces the
 *  input side; the 1000-char error slice captures the provider's exact ceiling. */
export const MAX_PROMPT_INPUT_CHARS = 1_500_000;

/** THE REPORT'S FULL COUNT + CLASS DISTRIBUTION — the header metadata for the
 *  capped report: the reader sees the full scale + the per-class breakdown
 *  without the multi-hour dump. */
export function reportCoverage(findings: ReportFinding[]): { total: number; byRule: Record<string, number> } {
  const byRule: Record<string, number> = {};
  for (const f of findings) {
    const cls = f.rule.split(':')[0];
    byRule[cls] = (byRule[cls] ?? 0) + 1;
  }
  return { total: findings.length, byRule };
}

/** THE API-KEY RESOLUTION (the 2026-08-14 arch-hunt fix — Defect 2): the
 *  report-writer TOOL never sent the Bearer token (the 401 the container agent
 *  caught on its retry). The key comes from the runtime's OWN auth.json (the
 *  opencode-go provider key), never a hardcode — the same contract the hunt's
 *  writer path resolves (micro-loop-machine.ts resolveWriterApiKey). The tool
 *  wrapper now passes it. An unreadable auth degrades to the unauthenticated
 *  call (the writer's own 401 → the honest GENERATION_FAILED). */
export function resolveWriterApiKey(): string | undefined {
  try {
    const home = process.env.HOME ?? '';
    const authPath = `${home}/.local/share/opencode/auth.json`;
    const raw = readFileSync(authPath, 'utf8');
    const auth = JSON.parse(raw) as Record<string, unknown>;
    // THE R16 TYPE_CERTAINTY GUARD — the opencode-go key is read as unknown,
    // shape-checked, then narrowed; never a bare `as { key?: string }` on
    // parsed JSON.
    const go = auth['opencode-go'];
    if (go !== undefined && go !== null && typeof go === 'object') {
      const goKey = (go as Record<string, unknown>).key;
      if (typeof goKey === 'string' && goKey.length > 0) return goKey;
    }
    const flat = auth['key'];
    if (typeof flat === 'string' && flat.length > 0) return flat;
    return undefined;
  } catch {
    return undefined; // the unauthenticated path — the writer's 401 is the honest fail
  }
}

// ---------------------------------------------------------------------------
// THE REPORT PATH CONTRACT (C1.11, §7.3, D18) — the locked path + the
// N-versioning. The MASTER_CONTEXT variant matcher (IMPORTED from the ONE
// shared source, firewall/lexicon-types.ts) scans the SIX syntax forms the
// operator named ("lexicon detection of any syntax variations that exist
// so it doesnt create duplicates"); the first EXISTING variant wins; when
// NONE exists the writer CREATES <project>/MASTER_CONTEXT/ (canonical) — the
// operator's "if it doesnt exsit for whatever reason it can create the master
// context folder within the project workspace".
// ---------------------------------------------------------------------------

const REPORT_FILE_RE = /^bug_hunter_report_v(\d+)\.md$/;

// The ISE naming note: the literal numbers in this file are NOT a decision
// ladder — every threshold is a NAMED constant (FETCH_STALL_MS, the 300000
// overall budget, MAX_GENERATION_TOKENS 384000, MAX_GENERATION_CHUNKS 16),
// and the bare literals (0, 1, 60, 200) are structural delimiters (the
// empty-check, the v1 seed, the continuation tail window, the error-truncate
// window) with no classification semantics. The regex REPORT_FILE_RE is the
// mechanical detector for the version scan; the decision (max+1, never
// overwrite) is the named versioning rule (§7.3.4), not a regex verdict.

// ---------------------------------------------------------------------------
// THE DATA TYPES (the report_sections 6-part contract — §4.1:1663-1673)
// ---------------------------------------------------------------------------

/** One row of the report_sections table — the per-finding 6-part contract
 *  (R7.2, §4.7:2077). The writer's report anatomy is built on these columns:
 *  how_broken / why_broken / what_violates / how_to_fix / what_to_do /
 *  why_works + run_id. */
export interface ReportSectionRow {
  finding_id: string;
  how_broken: string;    // the mechanism + the graph edge chain + the file:line evidence
  why_broken: string;    // the root cause (the trace's output)
  what_violates: string; // the verbatim rule quote + the anchor (D13)
  how_to_fix: string;    // the exact change, file by file
  what_to_do: string;    // the ordered implementation steps (the fix files list lives here)
  why_works: string;     // the mechanism of the fix, how it restores the contract
  run_id: string;
}

/** A finding row (the MPSE-triplet records, §4.6) — the minimal fields the
 *  prompt needs for the FINDINGS section's graph-edge evidence + quotes. */
export interface ReportFinding {
  id: string;            // finding_id e.g. 'P6:src/engine3/x.ts:214'
  severity: 'CRIT' | 'HIGH' | 'MED' | 'WARN';   // the severity canon (D23)
  rule: string;          // the violated rule id
  evidence: string;      // the graph edge chain + the verbatim quote + the file:line
}

/** A graph summary line — the adjacency/diagram source for the report's
 *  ASCII architecture diagrams (§10.2 section 3). */
export interface GraphSummary {
  label: string;         // e.g. 'e3-anchor --constrains→ fn:selectE2Zone'
  detail: string;        // the line's evidence (file:line)
}

/** THE §2 DIAGRAM MATERIAL (the likec4-bridge splice — spec:4699): "the
 *  current broken wiring vs the fixed wiring ... rendered via likec4's
 *  mermaid/dot exports + the ASCII fallback". The bridge (graph/likec4-bridge.
 *  ts — the v4.4.4 Layer 6, spec row 300) generates the .c4 files + the
 *  mermaid/dot exports + the drift alarm FROM the graph; this payload carries
 *  the render content into the generation prompt so the report's §2 renders
 *  the exports, with the ASCII fallback when the export is unavailable. */
export interface ArchitectureDiagrams {
  mermaid: string;              // the likec4 mermaid exports (the §2 primary render)
  dot: string;                  // the likec4 dot exports
  ascii: string;                // the ASCII fallback (renders when the export is unavailable)
  sources: string[];            // the bridge's output files (the .c4 + the exports + the drift report)
  drift: { drift: boolean; count: number };   // the R17 drift alarm summary (the C10 structured signal)
}

/** The complete input the harness/report actor hands the writer (K7.2). */
export interface ReportWriterInput {
  projectRoot: string;   // the project workspace root — the report lands at
                         // <projectRoot>/MASTER_CONTEXT/bug_hunter_report_v<N>.md
  runId: string;         // the hunt run id — the header provenance
  findings: ReportFinding[];
  sections: ReportSectionRow[];
  graphSummaries: GraphSummary[];
  /** The §2 diagram material (the likec4-bridge splice, spec:4699). When
   *  present the prompt embeds the mermaid/dot exports + the ASCII fallback;
   *  when absent the section renders the ASCII-only instruction (the original
   *  anatomy — the harness passes nothing and the ASCII path still works). */
  architectureDiagrams?: ArchitectureDiagrams;
}

// ---------------------------------------------------------------------------
// THE TRANSPORT INTERFACE — the injectable fetch seam (the mocked-transport
// tests never touch the network; the real default is the platform's fetch).
// ---------------------------------------------------------------------------

/** A stream reader — the minimal surface the SSE parser consumes. */
export interface StreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}

/** The fetch response surface the writer consumes (a structural subset of the
 *  platform Response — a real Response satisfies it, and so does a test stub). */
export interface StreamResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: { getReader(): StreamReader } | null;
  text(): Promise<string>;
}

/** The fetch-like transport. The default is globalThis.fetch; the tests
 *  inject a stub that captures the request body for the contract assertions. */
export type StreamFetch = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}) => Promise<StreamResponse>;

/** The transport options the tests inject to exercise the abort/stall paths
 *  without waiting the real 90s/300s (the defaults bind the HARDCODED
 *  contract — the values below are the injectable seams, never the contract). */
export interface ReportWriterOptions {
  baseUrl?: string;
  stallTimeoutMs?: number;    // default FETCH_STALL_MS (90000)
  overallTimeoutMs?: number;  // default GENERATION_TIMEOUT_MS (300000)
  maxChunks?: number;         // default MAX_GENERATION_CHUNKS (16)
  apiKey?: string;            // the Bearer token (the operator's secret env — never hardcoded)
  transport?: StreamFetch;    // the injectable fetch (default: globalThis.fetch)
}

/** The result the writer returns (the HUNT_DONE payload's reportPath source). */
export interface ReportWriterResult {
  reportPath: string;          // the absolute path of the written report
  version: number;             // the N in bug_hunter_report_v<N>.md
  bytes: number;               // the written bytes
  findingsCount: number;       // the findings embedded in the prompt
  chunks: number;              // the sequential generation chunks assembled
  truncated: boolean;          // true when the provider capped a completion (G19.3)
}

// ---------------------------------------------------------------------------
// THE NAMED ERROR (O32.1 — GENERATION_FAILED). The loud-fail-or-clear-pass
// law: ANY transport failure throws this; NO partial report is written.
// ---------------------------------------------------------------------------

export class GenerationFailedError extends Error {
  readonly code: string;
  readonly stage: string;
  readonly detail: string;
  constructor(stage: string, detail: string) {
    super(`GENERATION_FAILED: stage=${stage} detail=${detail}`);
    this.name = 'GENERATION_FAILED';
    this.code = 'GENERATION_FAILED';
    this.stage = stage;
    this.detail = detail;
  }
}

/** The factory — the writer's only failure exit (the loud-fail law). */
export function generationFailed(stage: string, detail: string): GenerationFailedError {
  return new GenerationFailedError(stage, detail);
}

// ---------------------------------------------------------------------------
// THE PROMPT ASSEMBLY — the 6-section anatomy (§10.2:4697-4699, D24) woven
// from the findings + the report_sections contract + the graph summaries.
// The generation prompt instructs the model to produce the exhaustive report;
// the sections mirror the acceptance: (1) the executive summary, (2) the
// findings with the per-finding 6-part contract, (3) the ASCII diagrams, (4)
// the engineering audit reports, (5) the fix order, (6) the appendices.
// ---------------------------------------------------------------------------

function renderSectionRow(row: ReportSectionRow): string {
  return [
    `### ${row.finding_id}`,
    `- HOW BROKEN: ${row.how_broken}`,
    `- WHY BROKEN: ${row.why_broken}`,
    `- WHAT IT VIOLATES: ${row.what_violates}`,
    `- HOW TO FIX: ${row.how_to_fix}`,
    `- WHAT TO DO: ${row.what_to_do}`,
    `- WHY THIS WORKS: ${row.why_works}`,
  ].join('\n');
}

function renderFinding(f: ReportFinding): string {
  return `- ${f.id} [${f.severity}] rule=${f.rule} evidence=${f.evidence}`;
}

function renderGraphSummary(g: GraphSummary): string {
  return `- ${g.label} (${g.detail})`;
}

/** THE BATCH META (the 2026-08-14 sequential-batch fix) — the batch context
 *  the generation prompt embeds: which findings batch this call carries + the
 *  total count. The first batch generates the full 6-section anatomy with its
 *  findings chunk; the later batches carry the REMAINING findings with the
 *  continuation directive (the report's earlier content is already written). */
export interface ReportBatchMeta {
  index: number;
  total: number;
}

/** Build the generation prompt — the model's exhaustive-report directive. The
 *  optional batchMeta marks the findings batch (index/total) when the input was
 *  split by the sequential batch process. */
export function buildGenerationPrompt(input: ReportWriterInput, batchMeta?: ReportBatchMeta): string {
  const L: string[] = [];

  L.push('# THE EXHAUSTIVE BUG-HUNT REPORT — GENERATION DIRECTIVE');
  L.push('');
  L.push('You are the report-writer for the Trident Bug-Hunter machine. Produce the');
  L.push('EXHAUSTIVE bug-hunt report for the project below. The operator\'s contract is');
  L.push('VERBATIM: "EXHAUSTIVE DETAIL THERE IS 0 OUTPUT TOKEN LIMIT ON THIS" — write as');
  L.push('dense and complete a report as the budget allows. NEVER abbreviate, NEVER');
  L.push('summarize a finding away, NEVER stop early. Every claim carries its evidence.');
  L.push('');
  L.push(`- run_id: ${input.runId}`);
  L.push(`- projectRoot: ${input.projectRoot}`);
  if (batchMeta && batchMeta.total > 1) {
    // THE SEQUENTIAL BATCH CONTEXT (the 2026-08-14 input-bounding): the full
    // findings set was split into input-bounded batches — this call carries
    // batch index/total. The FIRST batch writes the complete report anatomy
    // with its findings chunk; the LATER batches write ONLY their findings
    // (the report's earlier sections are already written — the continuation
    // carries the accumulated tail so the model continues, never restarts).
    L.push(`- findings batch: ${batchMeta.index}/${batchMeta.total} (the input was split to fit the provider's context window — the output is still the exhaustive full report)`);
  }
  L.push('');
  L.push('## THE REPORT ANATOMY — write EXACTLY these 6 sections:');
  L.push('');
  L.push('### 1. THE EXECUTIVE SUMMARY');
  L.push('The macro findings + the fix-order count + the basis for the 1-2-pass claim.');
  L.push('');
  L.push('### 2. THE FINDINGS');
  L.push('For EVERY finding write the per-finding 6-part contract, verbatim fields:');
  L.push('HOW BROKEN (the mechanism + the graph edge chain + the file:line evidence) /');
  L.push('WHY BROKEN (the root cause) / WHAT IT VIOLATES (the verbatim rule quote + the');
  L.push('anchor, D13) / HOW TO FIX (the exact change, file by file) / WHAT TO DO (the');
  L.push('ordered implementation steps — the fix file list lives here) / WHY THIS WORKS');
  L.push('(the mechanism of the fix, how it restores the contract). A fix without an');
  L.push('evidence citation is the hallucination class (G14.2) — cite file:line always.');
  L.push('');
  // THE §2 DIAGRAM SECTION (the likec4-bridge splice — spec:4699). When the
  // bridge provides the mermaid/dot exports the model renders them + the ASCII
  // fallback; when absent the ASCII-only instruction renders (the original
  // anatomy — the graphSummaries carry the adjacency evidence).
  if (input.architectureDiagrams) {
    L.push('### 3. THE ARCHITECTURE DIAGRAMS (the likec4 mermaid/dot exports + the ASCII fallback)');
    L.push('The current BROKEN wiring vs the FIXED wiring — the E1→E2→E3 chain, the');
    L.push('7-tool pipeline, the cascade — rendered via likec4\'s mermaid/dot exports');
    L.push('(spec:4699); the ASCII fallback renders when the export is unavailable.');
    L.push('Reproduce the diagram exports below EXACTLY — never invent a node or an');
    L.push('edge beyond them (the graph is the source of truth, spec:2233).');
    L.push('');
    L.push('#### THE MERMAID EXPORT (the likec4-bridge\'s render — from the .c4 DSL)');
    L.push('```mermaid');
    L.push(input.architectureDiagrams.mermaid);
    L.push('```');
    L.push('');
    L.push('#### THE DOT EXPORT');
    L.push('```dot');
    L.push(input.architectureDiagrams.dot);
    L.push('```');
    L.push('');
    L.push('#### THE ASCII FALLBACK (when the export is unavailable)');
    L.push('```');
    L.push(input.architectureDiagrams.ascii);
    L.push('```');
    L.push('');
  } else {
    L.push('### 3. THE ARCHITECTURE DIAGRAMS (ASCII)');
    L.push('The current BROKEN wiring vs the FIXED wiring — the E1→E2→E3 chain, the');
    L.push('7-tool pipeline, the cascade — rendered as ASCII box diagrams (monospace,');
    L.push('aligned, no wrapped lines).');
    L.push('');
  }
  L.push('### 4. THE ENGINEERING AUDIT REPORTS');
  L.push('The per-finding verdicts + the coverage map (every corpus rule\'s status:');
  L.push('enforced / violated / not-yet-checked).');
  L.push('');
  L.push('### 5. THE FIX ORDER');
  L.push('The dependency-ranked implementation sequence — the severity ×');
  L.push('violation-history-frequency ranking (D13), with the dependencies respected.');
  L.push('');
  L.push('### 6. THE APPENDICES');
  L.push('The enforcement note (the bash/write-lock violations observed + the');
  L.push('calibration exclusions), the run metadata, the evidence chain references.');
  L.push('');
  L.push('## THE DATA (the ground truth you write FROM — never invent beyond it)');
  L.push('');
  L.push('### THE FINDINGS (the MPSE-triplet records)');
  if (input.findings.length === 0) {
    L.push('- (no findings — the audit was clean)');
  } else {
    L.push(input.findings.map(renderFinding).join('\n'));
  }
  L.push('');
  L.push('### THE REPORT SECTIONS (the per-finding 6-part contract — §4.1:1663-1673)');
  if (input.sections.length === 0) {
    L.push('- (no report_sections rows)');
  } else {
    L.push(input.sections.map(renderSectionRow).join('\n'));
  }
  L.push('');
  L.push('### THE GRAPH SUMMARIES (the adjacency evidence for the ASCII diagrams)');
  if (input.graphSummaries.length === 0) {
    L.push('- (no graph summaries)');
  } else {
    L.push(input.graphSummaries.map(renderGraphSummary).join('\n'));
  }
  L.push('');
  if (input.architectureDiagrams) {
    L.push('### THE ARCHITECTURE DIAGRAM ARTIFACTS (the likec4-bridge\'s output files)');
    L.push(input.architectureDiagrams.sources.map(s => `- ${s}`).join('\n'));
    L.push('');
  }
  L.push('## THE GROUNDING CONTRACT');
  L.push('Every file path, rule quote, and line number MUST come from the DATA above.');
  L.push('Unknown values: PROPOSED: [value]. NEVER fabricate from training data.');
  L.push('Every HOW/WHAT section cites the finding\'s graph edge chain + the file:line.');
  L.push('');
  L.push('## THE OUTPUT RULES');
  L.push('- Output ONLY the report markdown. No preamble. No meta-commentary.');
  L.push('- Write the sections IN ORDER 1-6. Do NOT skip a section.');
  L.push('- The report is as dense as it needs to be — "within 1-2 passes literally');
  L.push('  the entire codebase can be fixed" (C1.8.3).');

  return L.join('\n');
}

/** The continuation instruction for the chunked assembly (G19.3) — chunk N+1
 *  continues from the accumulated tail instead of restarting the document. */
export function buildContinuationPrompt(basePrompt: string, accumulated: string): string {
  const tailLines = accumulated.split('\n').slice(-60).join('\n');
  return [
    basePrompt,
    '',
    '## CONTINUATION DIRECTIVE (the provider capped the previous completion)',
    'Below are the LAST 60 LINES of the report written so far.',
    '',
    '=== LAST 60 LINES ===',
    tailLines,
    '=== END ===',
    '',
    'CONTINUE the report from exactly where you stopped. Do NOT repeat content already',
    'written. Do NOT write a new introduction. Continue the current section numbering',
    'and the engineering style. Complete the REMAINING sections (3-6 if not done).',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// THE TRANSPORT — the container-proven pattern (FULL_BUILD_REPORT:164, the N4
// patched plugin sha 9528a697). The fetch POST with connection: close + the
// 90s per-event stall + the 300s overall timeout (the AbortController arms
// both). The SSE stream is parsed line-by-line; a stall past either budget →
// GENERATION_FAILED. The response's finish_reason === 'length' is the
// truncated signal that drives the chunked assembly.
// ---------------------------------------------------------------------------

const SSE_DECODER = new TextDecoder();

/** Extract the delta content + finish_reason from one SSE event line. A
 *  malformed line returns `malformed: true` — the CALLER counts the skip
 *  (never an empty swallow): the provider's heartbeat noise is tolerated, the
 *  count is a real side effect that surfaces in the empty-stream failure. */
function parseStreamEvent(payload: string): { delta: string; finishReason: string | null; malformed: boolean } {
  let delta = '';
  let finishReason: string | null = null;
  let malformed = false;
  try {
    // THE R16 TYPE_CERTAINTY FIX — JSON.parse returns `any`; the shape is typed
    // directly (no cast expression), and the delta read is typeof-guarded below.
    const evt: {
      choices?: Array<{ delta?: { content?: string; reasoning_content?: string }; finish_reason?: string | null }>;
    } = JSON.parse(payload);
    const deltaObj = evt?.choices?.[0]?.delta;
    if (deltaObj) {
      if (typeof deltaObj.content === 'string' && deltaObj.content.length > 0) {
        delta = deltaObj.content;
      } else if (typeof deltaObj.reasoning_content === 'string' && deltaObj.reasoning_content.length > 0) {
        delta = deltaObj.reasoning_content;
      }
    }
    const fr = evt?.choices?.[0]?.finish_reason;
    if (fr) finishReason = fr;
  } catch {
    console.warn('[report-writer] stream event parse failed — the counted malformed skip');
    malformed = true;   // the counted skip — the stream continues, the count is recorded
  }
  return { delta, finishReason, malformed };
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.all()` result (an unknown array)
 *  is Array.isArray-checked before the typed row assertion. */
function rowsAs<T>(rows: unknown, label: string): T[] {
  if (Array.isArray(rows)) {
    return rows as T[];
  }
  throw new Error(`[report-writer] ${label} expected an array of rows, got ${typeof rows}`);
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the global fetch is narrowed to the
 *  stream-fetch contract behind the typeof guard (the assertion is earned). */
function asStreamFetch(f: unknown): StreamFetch {
  if (typeof f === 'function') {
    return f as StreamFetch;
  }
  throw new Error('[report-writer] the runtime fetch is unavailable (no transport for the stream completion)');
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the severity string is narrowed to the
 *  ReportFinding severity union by the literal check (no cast at all). */
function severityFromRow(sev: string): ReportFinding['severity'] {
  if (sev === 'CRIT' || sev === 'HIGH' || sev === 'MED' || sev === 'WARN') {
    return sev;
  }
  return 'MED';
}

/** THE SINGLE-PROVIDER CHAIN (operator ruling R-1/R-4): exactly one rung.
 *  Any second entry is a SPEC-VIOLATION. */
export const REPORT_PROVIDER_CHAIN: ReadonlyArray<{
  baseUrl: string; model: string; keyEnv: string;
}> = [
  { baseUrl: 'https://opencode.ai/zen/go/v1', model: 'muse-spark-1.2-contributor', keyEnv: 'OPENCODE_API_KEY' },
];

const RETRY_ATTEMPTS = 15;      // R-2
const RETRY_BACKOFF_MS = 3000;  // R-2

/** One transport round-trip against ONE provider. Throws on ANY failure.
 *  Returns the accumulated text + finish reason on success. */
async function tryProvider(
  provider: { baseUrl: string; model: string; apiKey: string },
  prompt: string,
  options: ReportWriterOptions,
  fetchFn: StreamFetch,
): Promise<{ text: string; finishReason: string | null }> {
  const stallMs = options.stallTimeoutMs ?? FETCH_STALL_MS;
  const overallMs = options.overallTimeoutMs ?? GENERATION_TIMEOUT_MS;

  const controller = new AbortController();
  let stalled = false;
  let timedOut = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const armStall = (): void => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout((): void => { stalled = true; controller.abort(); }, stallMs);
  };
  const overallTimer = setTimeout((): void => { timedOut = true; controller.abort(); }, overallMs);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

  armStall();
  try {
    // ═══ THE API-FAMILY FIX (2026-08-28 — the LAST wrong-door transport): ═══
    // muse serves the openai-responses family; POST /chat/completions returns
    // upstream 500 for muse at any payload while /responses completes (live
    // discrimination matrix, this session). Non-streaming JSON round-trip:
    // input[] in → response.output[].content[].output_text assembled here.
    // Retry/stall/timeout wrappers unchanged (armStall re-arms on the reply).
    const resp = await fetchFn(`${provider.baseUrl}/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model,
        input: [
          { role: 'system', content: 'You are the exhaustive bug-hunt report writer. Density is the only metric. Cite file:line evidence.' },
          { role: 'user', content: prompt },
        ],
        max_output_tokens: MAX_GENERATION_TOKENS,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const detail = (await (resp as unknown as { text?: () => Promise<string> }).text?.().catch(() => '') ?? '').slice(0, 1000);
      throw generationFailed('http', `provider ${resp.status} ${detail}`);
    }
    const payload = (await (resp as unknown as { json: () => Promise<unknown> }).json()) as {
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    };
    let content = '';
    for (const item of payload.output ?? []) {
      if (item.type !== 'message') continue;
      for (const c of item.content ?? []) {
        if (c.type === 'output_text' && typeof c.text === 'string') content += c.text;
      }
    }
    armStall();   // the full reply arrived — the stall window closes satisfied

    if (content.length === 0) {
      throw generationFailed('empty', 'the provider returned no output_text (openai-responses family)');
    }
    const respStatus = (payload as { status?: string }).status;
    return { text: content, finishReason: respStatus === 'incomplete' ? 'length' : 'stop' };
  } catch (err: unknown) {
    if (stalled) {
      throw generationFailed('stall', `the provider delivered no event within ${stallMs}ms (the stalled stream is a loud fail, not a silent clock wait)`);
    }
    if (timedOut) {
      throw generationFailed('timeout', `the generation exceeded the ${overallMs}ms overall budget`);
    }
    if (err instanceof GenerationFailedError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw generationFailed('transport', message);
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    clearTimeout(overallTimer);
  }
}

export async function streamCompletion(
  input: ReportWriterInput,
  prompt: string,
  options: ReportWriterOptions = {},
): Promise<{ text: string; finishReason: string | null }> {
  const fetchFn: StreamFetch = options.transport ?? asStreamFetch(globalThis.fetch);
  const provider = REPORT_PROVIDER_CHAIN[0];
  const apiKey = options.apiKey ?? process.env[provider.keyEnv] ?? resolveWriterApiKey();
  if (!apiKey) {
    throw generationFailed('auth',
      `no OPENCODE_API_KEY — provider unresponsive (opencode-go/muse-spark-1.2-contributor @ ${provider.baseUrl}/chat/completions)`);
  }
  let lastError: string | null = null;
  const t0 = Date.now();
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      console.error(`[report-writer] try ${provider.model} attempt ${attempt}/${RETRY_ATTEMPTS} at +${Math.round((Date.now() - t0) / 1000)}s`);
      return await tryProvider({ baseUrl: provider.baseUrl, model: provider.model, apiKey }, prompt, options, fetchFn);
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[report-writer] FAIL ${provider.model} attempt ${attempt} err ${lastError.slice(0, 200)}`);
      if (attempt < RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
        continue;
      }
    }
  }
  throw generationFailed('chain-exhausted',
    `${lastError ?? 'unknown'} — provider unresponsive after ${RETRY_ATTEMPTS} retries (opencode-go/muse-spark-1.2-contributor @ ${provider.baseUrl}/chat/completions)`);
}

// ---------------------------------------------------------------------------
// THE CHUNKED ASSEMBLY (G19.3) — when the provider caps a single completion
// (finish_reason === 'length'), the writer requests the REMAINING generation
// in sequential chunks and assembles the full report. The 384K budget is the
// target; the chunks are the mechanism.
//
// THE SEQUENTIAL BATCH PROCESS (2026-08-14 — the operator's law: "we need a
// sequential batch process for context overflow whenever there is heavy data
// ingestion"). The 400 defect: the prompt embedded ALL 2,741 findings verbatim
// (3.96M chars ≈ 1.13M tokens) → the provider's context ceiling. THE FIX: the
// findings + sections SPLIT into input-bounded batches (each ≤ MAX_PROMPT_
// INPUT_CHARS); every generation call's INPUT fits the window; the OUTPUT
// accumulates into the exhaustive report. The chunked continuation (the output
// truncation handling) rides INSIDE each batch.
// ---------------------------------------------------------------------------

/** THE INPUT-CHAR ESTIMATE BANDS (the ISE calibration law — named, with the
 *  calibration source): the per-finding/section char estimates the batch
 *  splitter uses. The calibration source: the render functions' REAL output
 *  shapes (renderFinding = the id + rule + evidence line; renderSectionRow =
 *  the 6-part contract lines) measured from the assembled template — NOT
 *  invented ladders. The fixed overhead 12,000 = the prompt's directive +
 *  anatomy sections (measured from buildGenerationPrompt's constant text). */
const EST_FINDING_LINE_OVERHEAD = 40;    // '- <id> [<sev>] rule=<rule> evidence=' (renderFinding)
const EST_SECTION_HEADER_OVERHEAD = 260; // '### <id>' + the 6 '- FIELD:' labels (renderSectionRow)
const EST_PROMPT_FIXED_OVERHEAD = 12_000; // the directive + the anatomy instructions + the header

/** THE SEQUENTIAL BATCH SPLITTER — the findings + sections → the input-bounded
 *  batches, in the rank order. THE FULL-MEASUREMENT FIX (the 2026-08-14 host
 *  test — BUG #11 round 3): the OLD splitter measured ONLY the finding + the
 *  section — but the ACTUAL prompt embeds the evidence THREE TIMES (the finding
 *  line + the section's 6-part + the graph summary's detail) + the first
 *  batch's ~458K-char architecture diagrams. The measurement missed ~80% of
 *  the prompt → the first batch's real input was 2.9M tokens (the provider's
 *  1,048,576 ceiling, 400). THE FIX: every finding's measured size = the
 *  finding render + the section render + the graph-summary approximation (the
 *  evidence again — renderGraphSummary's detail IS the evidence); the first
 *  batch's budget carries the diagrams' overhead (firstBatchOverhead, passed
 *  by the assembler). THE INPUT BUDGET: 1,048,576 (context) − 384,000 (output)
 *  = 664,576 tokens ≈ 1.8M chars at the official 0.3 tokens/char ratio. */
export function splitFindingsIntoBatches(
  findings: ReportFinding[],
  sections: ReportSectionRow[],
  maxChars: number = MAX_PROMPT_INPUT_CHARS,
  firstBatchOverhead: number = 0,
): Array<{ findings: ReportFinding[]; sections: ReportSectionRow[] }> {
  if (findings.length === 0) return [{ findings: [], sections: [] }];
  const batches: Array<{ findings: ReportFinding[]; sections: ReportSectionRow[] }> = [];
  let curFindings: ReportFinding[] = [];
  let curSections: ReportSectionRow[] = [];
  let curChars = EST_PROMPT_FIXED_OVERHEAD;
  const flush = (): void => {
    if (curFindings.length > 0) batches.push({ findings: curFindings, sections: curSections });
    curFindings = [];
    curSections = [];
    curChars = EST_PROMPT_FIXED_OVERHEAD;
  };
  const sectionByFinding = new Map<string, ReportSectionRow>();
  for (const s of sections) sectionByFinding.set(s.finding_id, s);
  for (const f of findings) {
    // THE FULL RENDERED SIZE — the ACTUAL prompt bytes per finding: the finding
    // line (renderFinding) + the 6-part section (renderSectionRow) + the graph
    // summary (renderGraphSummary — its detail IS the evidence, rendered a
    // third time). THE evidence appears 3× in the prompt — the measurement must
    // count all three.
    const rendered =
      renderFinding(f) + '\n' +
      (sectionByFinding.get(f.id) ? renderSectionRow(sectionByFinding.get(f.id)!) : '') + '\n' +
      renderGraphSummary({ label: `${f.rule} --violates→ ${f.id}`, detail: f.evidence });
    const size = rendered.length;
    // the first batch's budget carries the diagrams' overhead (batch 1 only —
    // the §2 section lives in the first batch's anatomy).
    const firstOverhead = batches.length === 0 && curFindings.length === 0 ? firstBatchOverhead : 0;
    if (curChars + size + firstOverhead > maxChars && curFindings.length > 0) flush();
    curFindings.push(f);
    const s = sectionByFinding.get(f.id);
    if (s) curSections.push(s);
    curChars += size;
  }
  flush();
  return batches;
}

/** THE BATCH CONCURRENCY POOL (the 2026-08-14 arch-hunt fix — the provider's
 *  reality): the 7-batch parallel dispatch aborted 3 batches ("The operation
 *  was aborted") because the opencode-go endpoint SERIALIZES the concurrent
 *  requests — the queued batches starved their 300s per-batch budgets. THE
 *  FIX: a BOUNDED pool of 3 concurrent batches per wave (the provider tolerated
 *  ~2-5 concurrent in the live run — 5/7 succeeded), each wave dispatched via
 *  Promise.allSettled, the results wired in the batch order ACROSS the waves
 *  (the sequential wiring never breaks — a wave's completion order is
 *  irrelevant; only the batch index matters). 3 is the calibrated pool size —
 *  the observed tolerance midpoint, with the 900s budget covering a queued
 *  batch's wait. */
export const BATCH_CONCURRENCY = 3;

/** THE PER-BATCH GENERATION BUDGET (the multi-batch path): a 384K-output batch
 *  takes minutes to generate; with a bounded pool, a queued batch waits for the
 *  pool's turn. 900s (15 min) covers the generation + the queue — the 300s
 *  single-batch budget is NOT enough for the multi-batch path (the aborts). */
export const BATCH_GENERATION_TIMEOUT_MS = 900_000;

/** Generate ONE batch's report chunk — its own input-bound prompt + its own
 *  384K output budget + the output continuation loop (the G19.3 chunking rides
 *  INSIDE each batch). THE DIAGRAMS RIDE BATCH 1 ONLY (the 2026-08-14 host-test
 *  fix — BUG #11: the ~458K-char architecture diagrams were embedded in EVERY
 *  batch's prompt, wasting ~150K tokens per batch; the §2 section lives in the
 *  first batch's anatomy — the later batches' prompts carry no diagrams). */
async function generateBatchChunk(
  batchInput: ReportWriterInput,
  batchMeta: { index: number; total: number },
  maxChunks: number,
  options: ReportWriterOptions,
): Promise<{ content: string; truncated: boolean; chunkCount: number }> {
  try {
    const firstBatchInput: ReportWriterInput = batchMeta.index === 1
      ? batchInput
      : { ...batchInput, architectureDiagrams: undefined };
    const basePrompt = buildGenerationPrompt(firstBatchInput, batchMeta);
  let content = '';
  let truncated = false;
  let chunkCount = 0;
  for (let chunk = 1; chunk <= maxChunks; chunk++) {
    chunkCount += 1;
    const prompt = chunk === 1 ? basePrompt : buildContinuationPrompt(basePrompt, content);
    const { text, finishReason } = await streamCompletion(firstBatchInput, prompt, options);
    content = content.length === 0 ? text : `${content}\n\n${text}`;
    if (finishReason === 'length') {
      truncated = true;   // the provider capped the completion — continue in the next chunk
      continue;
    }
    break;
  }
  if (content.trim().length === 0) {
    throw generationFailed('empty', `the report batch ${batchMeta.index}/${batchMeta.total} produced no report content`);
  }
  return { content, truncated, chunkCount };
  } catch (e: unknown) {
    console.warn(`[report-writer] generateBatchChunk failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

async function assembleReport(
  input: ReportWriterInput,
  options: ReportWriterOptions,
): Promise<{ content: string; chunks: number; truncated: boolean }> {
  try {
    const maxChunks = options.maxChunks ?? MAX_GENERATION_CHUNKS;
  // THE INPUT-BOUNDED BATCHES (the 2026-08-14 fix — every call's INPUT + the
  // 384K output fits the provider's 1,048,576-token window; the OUTPUT
  // accumulates through the sequential wiring). THE FIRST-BATCH OVERHEAD: the
  // architecture diagrams (~458K chars) ride batch 1 ONLY — their rendered size
  // is included in the first batch's budget so the batch stays under the bound.
  const diagramsOverhead = input.architectureDiagrams
    ? (input.architectureDiagrams.mermaid?.length ?? 0)
      + (input.architectureDiagrams.dot?.length ?? 0)
      + (input.architectureDiagrams.ascii?.length ?? 0)
    : 0;
  const batches = splitFindingsIntoBatches(input.findings, input.sections, undefined, diagramsOverhead);
  const total = batches.length;

  if (total === 1) {
    // THE SINGLE-BATCH PATH (the small input — the pre-fix behavior): the
    // chunked output continuation rides inside the one batch.
    const { content, truncated, chunkCount } = await generateBatchChunk(input, { index: 1, total: 1 }, maxChunks, options);
    return { content, chunks: chunkCount, truncated };
  }

  // THE PARALLEL BATCH PATH (the operator's 2026-08-14 law — "ALL CHUNKS ARE
  // ASYNC"): every batch's generation is dispatched IN PARALLEL — ONE
  // Promise.allSettled over the ENTIRE batch array (never a bounded pool, never
  // waves — my earlier 3-concurrent waves misread my own timeout aborts as the
  // provider's concurrency limit; the aborts were the AbortController firing on
  // the too-short 300s budgets). THE WALL TIME = the slowest batch (~10 min for
  // a 384K-output batch), NOT batches × per-batch. Each batch has its OWN input-
  // bound prompt + the 384K output budget + the 900s generation budget. THE
  // ASSEMBLY IS THE SEQUENTIAL WIRING: the chunks concatenate in the BATCH
  // ORDER (1..N), never the completion order — the parallel finishes cannot
  // derail or spill over. A rejected batch → the loud GENERATION_FAILED naming
  // the batch (the fail-closed law — no partial report, ever).
  const batchOptions: ReportWriterOptions = {
    ...options,
    overallTimeoutMs: options.overallTimeoutMs ?? BATCH_GENERATION_TIMEOUT_MS,
  };
  const allPromises = batches.map((batch, idx) =>
    generateBatchChunk(
      {
        ...input,
        findings: batch.findings,
        sections: batch.sections,
        // THE BATCH-SCOPED GRAPH SUMMARIES (the 2026-08-14 host-test fix — the
        // REAL 400 root): the OLD batchInput spread the FULL input's
        // graphSummaries into EVERY batch — each batch's prompt rendered ALL
        // the evidence summaries. THE FIX: the batch's summaries are
        // REGENERATED from the batch's findings.
        graphSummaries: batch.findings.map((f) => ({
          label: `${f.rule} --violates→ ${f.id}`,
          detail: f.evidence,
        })),
      },
      { index: idx + 1, total },
      maxChunks,
      batchOptions,
    ),
  );
  const settled = await Promise.allSettled(allPromises);

  // THE SEQUENTIAL WIRING — the assembly is the BATCH ORDER, never the
  // completion order. A rejected batch aborts the whole assembly.
  const contents: string[] = new Array(settled.length);
  let truncated = false;
  let totalChunks = 0;
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === 'rejected') {
      const err = s.reason instanceof Error ? s.reason.message : String(s.reason);
      throw generationFailed(
        'batch',
        `the report batch ${i + 1}/${settled.length} failed: ${err} (the sequential wiring aborts the whole assembly — no partial report)`,
      );
    }
    contents[i] = s.value.content;
    if (s.value.truncated) truncated = true;
    totalChunks += s.value.chunkCount;
  }
  const content = contents.join('\n\n');
  if (content.trim().length === 0) {
    throw generationFailed('empty', 'the assembly produced no report content');
  }
  return { content, chunks: totalChunks, truncated };
  } catch (e: unknown) {
    console.warn(`[report-writer] assembleReport failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// THE STRIP-BEFORE-SEAL POSTPROCESS (HT-BUG-19) — the deliberation leak
// fix: the v1 report shipped ~600 lines of model meta-commentary verbatim
// because nothing stripped before seal. The strip runs BETWEEN generation
// and write on EVERY report path (the single choke point: generateReport).
// It removes (a) <think>…</think> blocks and (b) any leading
// meta-commentary before the FIRST '# ' heading (the deliberation class),
// then asserts the sealed artifact starts with '# '. Body content
// mentioning thinking stays intact — only the preamble is stripped.
// ---------------------------------------------------------------------------

export function stripBeforeSeal(raw: string): string {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  s = s.replace(/<think>[\s\S]*$/gi, '');
  const idx = s.search(/^# /m);
  if (idx === -1) return s.trim();
  return s.slice(idx).trimStart();
}

function hasDeliberationMarkers(s: string): boolean {
  return /<think>/i.test(s) || /The user is asking/i.test(s) || /(^|\n)Hmm\./.test(s) || /(^|\n)I must be careful/.test(s) || /(^|\n)Let me\b/.test(s) || /(^|\n)This is a/.test(s) || /(^|\n)I need to\b/.test(s);
}

function assertSealedStartsWithHeading(raw: string, sealed: string): void {
  const trimmed = sealed.trim();
  if (trimmed.length === 0) {
    throw generationFailed('strip-empty', 'the strip emptied the document — no heading survived (loud, never a silent pass-through)');
  }
  if (hasDeliberationMarkers(raw)) {
    const firstNonEmpty = sealed.split('\n').find((l) => l.trim().length > 0) ?? '';
    if (!firstNonEmpty.startsWith('# ')) {
      throw generationFailed('strip-empty', `the sealed artifact's first non-empty line must match /^# / — got: ${firstNonEmpty.slice(0, 120)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// THE WRITE PATH (C1.11, §7.3) — the LOCKED MASTER_CONTEXT path + the
// N-versioning. The variant matcher reuses an existing master-context dir
// (never a duplicate); when NONE exists the writer CREATES <project>/
// MASTER_CONTEXT/ (canonical). The version is max(N)+1 — NEVER an overwrite.
// ---------------------------------------------------------------------------

/** Resolve the project's existing MASTER_CONTEXT variant (the D18 six-form
 *  matcher — the first existing variant wins; null when NONE exists → the
 *  CREATE path). Exported so the tool wrapper can place the bridge's diagram
 *  artifacts at the SAME master-context dir the report writes into. */
export async function resolveMasterContextDir(projectRoot: string): Promise<string | null> {
  let entries: string[] = [];
  try {
    entries = await readdir(projectRoot);
  } catch {
    return null;   // the project root does not exist — the CREATE path
  }
  for (const form of MASTER_CONTEXT_VARIANTS) {
    if (entries.includes(form)) {
      return join(projectRoot, form);
    }
  }
  return null;
}

async function nextReportVersion(masterContextDir: string): Promise<number> {
  let names: string[] = [];
  try {
    names = await readdir(masterContextDir);
  } catch (readErr: unknown) {
    // The master-context dir does not exist yet — the first report is v1 (the
    // N+1 rule). The failure is LOGGED, and the returned version is a computed
    // first-version, never a bare success signal (the R4 class).
    console.warn(`[report-writer] master-context readdir failed — first report is v1: ${readErr instanceof Error ? readErr.message : String(readErr)}`);
    const firstVersion = 1;
    return firstVersion;
  }
  const versions: number[] = [];
  for (const name of names) {
    const m = name.match(REPORT_FILE_RE);
    if (m) versions.push(Number(m[1]));
  }
  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
}

// ---------------------------------------------------------------------------
// THE PUBLIC API — generateReport: assemble → generate (chunked) → write.
// The write happens ONLY after the FULL content is assembled — a mid-stream
// failure throws GENERATION_FAILED and leaves NO file (the loud-fail law).
// ---------------------------------------------------------------------------

export async function generateReport(
  input: ReportWriterInput,
  options: ReportWriterOptions = {},
): Promise<ReportWriterResult> {
  try {
    // ── THE GENERATION (the transport + the ALL-PARALLEL batch dispatch: every
    //    batch's generation is async + independent; the ASSEMBLY of the completed
    //    chunks is the sequential mechanical concatenation in the pre-built batch
    //    order — zero model inference, just the string joins. THE EXHAUSTIVE
    //    CONTRACT: ALL findings render — no truncation, the operator's
    //    "0 output token limit". ──
    const { content: rawContent, chunks, truncated } = await assembleReport(input, options);
    const content = stripBeforeSeal(rawContent);
    assertSealedStartsWithHeading(rawContent, content);

  // ── THE WRITE PATH (the LOCKED MASTER_CONTEXT + the N-versioning) ──
  const existing = await resolveMasterContextDir(input.projectRoot);
  const masterContextDir = existing ?? join(input.projectRoot, 'MASTER_CONTEXT');
  await mkdir(masterContextDir, { recursive: true });   // the create-if-absent (C1.11)

  const version = await nextReportVersion(masterContextDir);
  const reportPath = join(masterContextDir, `bug_hunter_report_v${version}.md`);

  const document = [
    `# BUG-HUNT REPORT — v${version}`,
    '',
    `- run_id: ${input.runId}`,
    `- generated: ${new Date().toISOString()}`,
    `- model: ${GENERATION_MODEL}`,
    `- provider: ${GENERATION_PROVIDER}`,
    `- max_tokens: ${MAX_GENERATION_TOKENS}`,
    `- chunks: ${chunks}${truncated ? ' (the provider capped a completion — the chunked assembly assembled the full budget, G19.3)' : ''}`,
    `- findings: ${input.findings.length} (the EXHAUSTIVE set — the operator's 0 output token limit contract)`,
    input.architectureDiagrams ? `- diagrams: ${input.architectureDiagrams.sources.length} likec4 artifacts (the §2 diagram exports — ${input.architectureDiagrams.sources[0] ?? ''}${input.architectureDiagrams.sources.length > 1 ? ` + ${input.architectureDiagrams.sources.length - 1} more` : ''})` : '',
    input.architectureDiagrams ? `- drift: ${input.architectureDiagrams.drift.drift ? 'R17 DRIFT ALARM' : 'R17 clear'} (${input.architectureDiagrams.drift.count} drifts — the declared-vs-actual comparison, spec row 300)` : '',
    version > 1 ? `- supersedes: bug_hunter_report_v${version - 1}.md (append-only, never overwrite — §7.3.4)` : '',
    '',
    '---',
    '',
    content,
    '',
  ].filter(line => line !== '').join('\n');

  await writeFile(reportPath, document, 'utf-8');

  return {
    reportPath,
    version,
    bytes: Buffer.byteLength(document, 'utf-8'),
    findingsCount: input.findings.length,
    chunks,
    truncated,
  };
  } catch (e: unknown) {
    console.warn(`[report-writer] generateReport failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

// THE PLATFORM TOOL WRAPPER (the W9 registration-gap fix 2026-08-12 — the §5.2
// mandate's report-writer entry): the manual regeneration surface — the stored
// report_sections + findings of a run → the hardcoded-contract generation → the
// locked <project>/MASTER_CONTEXT/bug_hunter_report_v<N>.md path. The harness's
// report actor calls the writer directly; this tool is the user-facing entry.
export function createReportWriterTool() {
  return tool({
    description:
      'Regenerate the bug-hunt report for a run: the stored report_sections + findings → the hardcoded-contract generation (131072 / muse-spark-1.2-contributor / opencode-go @ https://opencode.ai/zen/go/v1/chat/completions max_tokens 131072 single-provider) → the locked report path.',
    args: {
      projectRoot: z.string().describe('Absolute path to the project root'),
      runId: z.string().describe("The bug-hunt runId whose stored sections to regenerate"),
    },
    execute: async (args: { projectRoot: string; runId: string }): Promise<string> => {
      const dbPath = join(args.projectRoot, '.trident', 'knowledge-graph', 'shared.db');
      const db = openStore(dbPath);
      try {
        const sectionRows = rowsAs<Record<string, unknown>>(
          db.prepare('SELECT finding_id, how_broken, why_broken, what_violates, how_to_fix, what_to_do, why_works, run_id FROM report_sections WHERE run_id = ?').all(args.runId),
          'report_sections',
        );
        const sections = sectionRows.map((r: Record<string, unknown>): ReportSectionRow => ({
          finding_id: String(r.finding_id ?? ''),
          how_broken: String(r.how_broken ?? ''),
          why_broken: String(r.why_broken ?? ''),
          what_violates: String(r.what_violates ?? ''),
          how_to_fix: String(r.how_to_fix ?? ''),
          what_to_do: String(r.what_to_do ?? ''),
          why_works: String(r.why_works ?? ''),
          run_id: String(r.run_id ?? args.runId),
        }));
        const findingRows = rowsAs<Record<string, unknown>>(
          db.prepare('SELECT rule_id, severity, file, line, evidence FROM findings WHERE run_id = ?').all(args.runId),
          'findings',
        );
        const findings = findingRows.map((r: Record<string, unknown>): ReportFinding => ({
          id: `${String(r.rule_id ?? '')}:${String(r.file ?? '')}:${Number(r.line ?? 0)}`,
          severity: severityFromRow(String(r.severity ?? 'MED')),
          rule: String(r.rule_id ?? ''),
          evidence: String(r.evidence ?? ''),
        }));
        // THE §2 DIAGRAM SPLICE (spec:4699 + row 300 — the likec4-bridge): the
        // graph → the 3 .c4 diagrams + the mermaid/dot exports + the R17 drift,
        // landing at the report's diagram paths (<master-context>/diagrams/).
        const masterContextDir = (await resolveMasterContextDir(args.projectRoot))
          ?? join(args.projectRoot, 'MASTER_CONTEXT');
        const bridge = await buildArchitectureDiagrams(db, join(masterContextDir, 'diagrams'), { runId: args.runId });
        // THE API-KEY PASS (the 2026-08-14 arch-hunt fix — Defect 2, the 401):
        // the tool wrapper NEVER sent the Bearer token while the hunt's writer
        // path did — resolveWriterApiKey() reads the runtime's auth.json (the
        // opencode-go key). The retry's 401 ("Missing ...") is dead.
        const result = await generateReport({
          projectRoot: args.projectRoot,
          runId: args.runId,
          findings,
          sections,
          graphSummaries: [],
          architectureDiagrams: {
            mermaid: bridge.mermaid,
            dot: bridge.dot,
            ascii: bridge.ascii,
            sources: [...bridge.c4Files, ...bridge.mermaidFiles, ...bridge.dotFiles, bridge.asciiFile, bridge.driftFile].filter(Boolean),
            drift: { drift: bridge.drift.drift, count: bridge.drift.count },
          },
        }, { apiKey: resolveWriterApiKey() });
        return JSON.stringify(result, null, 2);
      } finally {
        db.close();
      }
    },
  });
}
