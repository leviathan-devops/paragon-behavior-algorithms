/**
 * step-x-orchestrator.ts — THE STEP-X ORCHESTRATOR (S1 — the SPEC-2 §2.1/§9.1)
 *
 * THE JUDGMENT-PASS INSERTION: the ONLY component that knows the full Step-X
 * flow order — the health gate → the supremacy brief → the brain's compose →
 * the final polish → the silent-verifier → the store → the emission. IT NEVER
 * JUDGES: it sequences, gates, and collects. The aether (S2) composes, the
 * machines decide, the verifier (S6) checks (the fusion law, §2.7).
 *
 * THE FAIL-CLOSED HEALTH GATE (§9.1.2 MECHANISM 1): the aether runs ONLY when
 * the machinery is healthy — the findings present (the D17-calibrated set),
 * the graph stats bound, the event stats bound, the project context bound,
 * and the brain bound to a real model surface. ANY absence → the Step-X does
 * NOT run; the result is ran=false + the report header "STEP-X SKIPPED" (THE
 * LOUD-FAIL LAW — never a silent skip, AP-S2-3).
 *
 * THE S-PB4 RECONCILE (the boundary copies RETIRED — the canonical surfaces
 * landed and are CONSUMED, never re-implemented):
 *  - The S2 brain surface (AetherBrief/CompositionResult/AetherBrain) is
 *    IMPORTED from aether-brain.ts (the S-PB2 owner) and RE-EXPORTED here so
 *    the batteries keep ONE import path — the orchestrator's own boundary
 *    copies (the former :94/:99/:105) are REMOVED.
 *  - The S5 6-section render is IMPORTED as composeFinalReport from
 *    final-polish.ts (the S-PB2 owner) — the inline composeAdjudicatedReport
 *    stand-in (the former :273) is REMOVED. The orchestrator-specific
 *    verification-section integration (appendVerificationSection) STAYS.
 *  - ProbedVerdict is imported from silent-verifier.ts (the S-PB1 owner) and
 *    aether-brain.ts re-exports the identical surface (verified: one type).
 *  - The aether_verdicts DDL (§10.4) is APPLIED into the shared.db by db.ts
 *    (the S-PB4 additive migration); the store handle is injected via
 *    options.store (the audit() wiring binds the real shared-db handle).
 *  - index.ts audit() wires runStepX after the ringScan, before the W7
 *    aetherReport; the machinery-only path is wrapped by markStepSkipped
 *    (the un-erasable 'STEP-X SKIPPED' header, §10.6-4).
 *  - THE HEALTH GATE IS FAIL-CLOSED OVER THE BRAIN (§9.1.2 precondition 4):
 *    an ABSENT brain surface is BRAIN_UNAVAILABLE — the Step-X skips loudly,
 *    never hangs, never composes over a stub.
 */
import * as fs from 'fs';
import * as path from 'path';

import type { AuditEngine } from '../index.js';
import type { AuditFinding } from '../types.js';
import { composeFinalReport } from './final-polish.js';
import type { AetherBrief, CompositionResult, AetherBrain } from './aether-brain.js';
import {
  buildSupremacyBrief,
  readWindowWithinScope,
  SOURCE_WINDOW_LINES,
  UNREADABLE_FILE_ABSENT,
} from './supremacy-brief.js';
import type { GroundTruth, SourceWindowFinder, SupremacyMachinery } from './supremacy-brief.js';
import { verifyAetherOutput } from './silent-verifier.js';
import type { ProbedVerdict, VerifierResult } from './silent-verifier.js';
import {
  persistVerdicts,
  unverifiedFindingIndexes,
  verificationCountBoundFailed,
  STORE_WRITE_FAILED,
} from './aether-store.js';
import type { AetherStoreDb } from './aether-store.js';

// ── THE CONSUMED CONTRACTS (re-exported so the S-PB4 wiring + the batteries
//    import the Step-X surface from ONE module — the orchestrator is the
//    pipeline's entry point) ──
export { readWindowWithinScope } from './supremacy-brief.js';
export type { ProbedVerdict, VerifierResult } from './silent-verifier.js';
export type { GroundTruth } from './supremacy-brief.js';
export type { AetherStoreDb, StoredVerdict } from './aether-store.js';
export type { AetherBrief, CompositionResult, AetherBrain } from './aether-brain.js';

// ── THE NAMED ERRORS / REASONS (SPEC-2 §2.9/§2.16 — the loud-fail surface) ──
export const STEP_X_SKIPPED_PREFIX = 'STEP_X_SKIPPED_';
export const AETHER_COMPOSE_FAILED = 'AETHER_COMPOSE_FAILED';
export const BRIEF_READ_FAILED = 'BRIEF_READ_FAILED';
export const COMPOSE_RENDER_FAILED = 'COMPOSE_RENDER_FAILED';

// ── S1 THE ORCHESTRATOR CONTRACT (SPEC-2 §2.9/§9.1.3 — verbatim) ──
export interface StepXInput {
  targetPath: string;
  functionality: {
    findings: AuditFinding[];          // the D17-calibrated findings (the ONLY set judged)
    graphStats: { nodes: number; edges: number };
    eventStats: { reasoningObservations: number; cadenceToolCalls: number; flowVerdict: string };
    projectContext: { shape: string; isPlugin: boolean };
  };
  engine: AuditEngine;                 // the verifier's re-check surface
}

export interface StepXResult {
  ran: boolean;
  skippedReason?: string;              // the loud-fail reason when ran=false
  verdicts: ProbedVerdict[];           // the per-finding adjudicated verdicts
  report: string;                      // the adjudicated + ranked final report
  verifiedBy: string[];                // the silent-verifier's pass markers
}

// ── S2 THE BRAIN SURFACE (SPEC-2 §2.2/§9.2.3) — IMPORTED from aether-brain.ts
//    (the canonical owner) + RE-EXPORTED above. THE BRAIN IS A COMPOSER, NEVER
//    A JUDGE: no filesystem, no tools, no state — brief → prose. ──

// ── THE STEP-X OPTIONS (the injected surfaces — a missing store handle is an
//    HONEST "not persisted" note in the report, never a fake write) ──
export interface StepXOptions {
  store?: AetherStoreDb;
  runId?: string;
}

// ── THE HEALTH GATE VERDICTS (§9.1.2 MECHANISM 1) ──
export enum StepXHealth {
  HEALTHY = 'HEALTHY',
  MACHINERY_INCOMPLETE = 'MACHINERY_INCOMPLETE',
  TARGET_UNSCOPED = 'TARGET_UNSCOPED',
  BRAIN_UNAVAILABLE = 'BRAIN_UNAVAILABLE',
}

/** THE FAIL-CLOSED HEALTH GATE (§9.1.2). THE FOUR PRECONDITIONS:
 *  (1) the findings array present + every finding well-formed (the array IS the
 *      D17-calibrated product — the empty array is the legitimate empty-target,
 *      a health pass; the brain then refuses the thin brief, loudly);
 *  (2) the D17 ran — the findings carry the machinery's shape (layer/severity/
 *      file/line/evidence), never a partial dump;
 *  (3) the graph connected — the graph stats bound + numeric;
 *  (4) the brain bound to a real model surface — REQUIRED, never a stub; an
 *      ABSENT surface is BRAIN_UNAVAILABLE (the S-PB4 fail-closed gate).
 *  THE ORDER (the §9.1.7 C7 is the authority): the MACHINERY check dominates —
 *  evaluateHealth({ functionality: {} }) is MACHINERY_INCOMPLETE even without
 *  a targetPath; TARGET_UNSCOPED names a PRESENT-but-empty scope root. */
export function evaluateHealth(input: StepXInput, brain?: AetherBrain): StepXHealth {
  if (!input || typeof input !== 'object') return StepXHealth.MACHINERY_INCOMPLETE;
  const fn = input.functionality;
  if (!fn || typeof fn !== 'object') return StepXHealth.MACHINERY_INCOMPLETE;

  // (1) + (2) — the findings: a real array of well-formed D17-calibrated findings.
  if (!Array.isArray(fn.findings)) return StepXHealth.MACHINERY_INCOMPLETE;
  for (const finding of fn.findings) {
    if (
      !finding ||
      typeof finding.layer !== 'string' ||
      typeof finding.severity !== 'string' ||
      typeof finding.file !== 'string' ||
      !Number.isFinite(finding.line) ||
      typeof finding.evidence !== 'string'
    ) {
      return StepXHealth.MACHINERY_INCOMPLETE;
    }
  }

  // (3) — the graph connected: the stats bound + numeric.
  const graph = fn.graphStats;
  if (!graph || !Number.isFinite(graph.nodes) || !Number.isFinite(graph.edges)) {
    return StepXHealth.MACHINERY_INCOMPLETE;
  }

  // the events ingested: the flow verdict + the counters bound.
  const events = fn.eventStats;
  if (
    !events ||
    typeof events.flowVerdict !== 'string' ||
    events.flowVerdict.length === 0 ||
    !Number.isFinite(events.reasoningObservations) ||
    !Number.isFinite(events.cadenceToolCalls)
  ) {
    return StepXHealth.MACHINERY_INCOMPLETE;
  }

  // the project context bound.
  const context = fn.projectContext;
  if (!context || typeof context.shape !== 'string' || typeof context.isPlugin !== 'boolean') {
    return StepXHealth.MACHINERY_INCOMPLETE;
  }

  // THE SCOPE GATE: a present-but-empty root is unscopable (an absent root on a
  // full machinery input is the caller's defect — still named, never silent).
  if (typeof input.targetPath !== 'string' || input.targetPath.trim().length === 0) {
    return StepXHealth.TARGET_UNSCOPED;
  }

  // (4) — the brain bound to a real model surface (REQUIRED — the S-PB4
  // fail-closed gate: an absent surface is BRAIN_UNAVAILABLE, never a silent
  // pass; the audit wires the NAMED model config or skips loudly, never hangs).
  if (brain === undefined || !brain || typeof brain.compose !== 'function') {
    return StepXHealth.BRAIN_UNAVAILABLE;
  }

  return StepXHealth.HEALTHY;
}

/** THE SCOPED ANCHOR RESOLVER (§9.1.6 — the verifier's re-check surface).
 *  Resolves file WITHIN the resolved targetPath (the scope law — the same
 *  prefix rule as the supremacy brief's reader), then verifies the cited line
 *  exists. ANY resolution failure → false: an unresolvable anchor IS absent,
 *  which the verifier rejects LOUDLY downstream (VERIFY_ANCHOR_ABSENT) — the
 *  catch below can never hide a fabrication, it can only reject one. */
export function anchorExistsWithinScope(targetPath: string, file: string, line: number): boolean {
  try {
    const root = path.resolve(targetPath);
    const abs = path.resolve(root, file);
    if (abs !== root && !abs.startsWith(root + path.sep)) return false;
    if (!Number.isInteger(line) || line < 1) return false;
    const content = fs.readFileSync(abs, 'utf8');
    return line <= content.split('\n').length;
  } catch {
    // THE HONEST-ABSENT MAPPING: a read failure (missing file, permissions) means
    // the anchor cannot be PROVEN to exist → absent → the verifier rejects the
    // claim. This path never swallows a success; it only hardens the rejection.
    return false;
  }
}

// ── THE STATE MACHINE (§13 — the loud-fail-or-clear-pass driver) ──
export type StepXState =
  | 'IDLE'
  | 'HEALTH_GATING'
  | 'BRIEFING'
  | 'COMPOSING'
  | 'POLISHING'
  | 'VERIFYING'
  | 'STORING'
  | 'EMITTED'
  | 'SKIPPED'
  | 'FAILED';

export interface StepXMachineRecord {
  state: StepXState;
  pattern: string;
  evidence: string;
}

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function windowKey(file: string, line: number): string {
  return `${file}${line}`;
}

/** THE SKIPPED REPORT (the loud-fail — §2.1: the machinery-only path with the
 *  un-erasable "STEP-X SKIPPED" header, §10.6-4 the skip-evasion). */
function skippedReport(input: StepXInput, reason: string, health: StepXHealth): string {
  const findings = input?.functionality?.findings;
  const count = Array.isArray(findings) ? findings.length : 0;
  return [
    `# TRIDENT CODE AUDIT — STEP-X SKIPPED`,
    ``,
    `## STEP-X SKIPPED: the aether judgment pass did NOT run (${reason})`,
    ``,
    `THE LOUD-FAIL (SPEC-2 §2.1/§9.1.2, the AP-S2-3): the aether NEVER runs on`,
    `unverified machinery. This is the MACHINERY-ONLY report — the findings below`,
    `are the raw machinery output WITHOUT the judgment pass (no adjudication, no`,
    `deeper probes, no consequence triage).`,
    ``,
    `- the health-gate verdict: ${health}`,
    `- the reason: ${reason}`,
    `- the findings carried (un-adjudicated): ${count}`,
    `- the graph: ${input?.functionality?.graphStats ? `${input.functionality.graphStats.nodes} nodes / ${input.functionality.graphStats.edges} edges` : 'absent'}`,
    `- the events flow verdict: ${input?.functionality?.eventStats?.flowVerdict ?? 'absent'}`,
  ].join('\n');
}

/** THE SKIP MARKER (§11.1 — the audit() pipeline's machinery-only path, the
 *  un-erasable 'STEP-X SKIPPED' header, §10.6-4 the skip-evasion: the machinery
 *  writes it, the agent cannot erase it). Wraps the ALREADY-RENDERED machinery
 *  report — the orchestrator's own skippedReport covers the gate-internal skip;
 *  THIS marks the W1-W6 report at the pipeline's report-emission point. */
export function markStepSkipped(machineryReport: string, reason?: string): string {
  const why = typeof reason === 'string' && reason.length > 0 ? reason : `${STEP_X_SKIPPED_PREFIX}UNKNOWN`;
  return [
    `# TRIDENT CODE AUDIT — STEP-X SKIPPED`,
    ``,
    `## STEP-X SKIPPED: the aether judgment pass did NOT run (${why})`,
    ``,
    `THE LOUD-FAIL (SPEC-2 §2.1/§9.1.2, the AP-S2-3): the aether NEVER runs on`,
    `unverified machinery or an absent model surface. The report below is the`,
    `MACHINERY-ONLY output WITHOUT the judgment pass (no adjudication, no deeper`,
    `probes, no consequence triage). THE HEADER IS UN-ERASABLE (§10.6-4).`,
    ``,
    `---`,
    ``,
    machineryReport,
  ].join('\n');
}

/** THE VERIFICATION SECTION (the AP-S2-4: every aether claim carries its
 *  verified/UNVERIFIED marker — the honest remainder, never hidden). */
function appendVerificationSection(
  report: string,
  verdicts: ProbedVerdict[],
  verification: VerifierResult,
): string {
  const unverified = unverifiedFindingIndexes(verification);
  const countBroken = verificationCountBoundFailed(verification);
  const lines: string[] = [];
  lines.push(``);
  lines.push(`## THE SILENT-VERIFIER RE-CHECK (the machinery's verdict on the aether's claims)`);
  lines.push(``);
  lines.push(`- the checks run: 6 (anchor / count / severity / calibration / evidence / rank)`);
  lines.push(`- the verifier verdict: ${verification.passed ? 'PASSED' : `REJECTED — ${verification.failures.length} failure(s)`}`);
  for (const failure of verification.failures) {
    lines.push(`- THE FAILURE: ${failure.reason} (the claim: ${failure.claim})`);
  }
  if (countBroken) {
    lines.push(`- THE COUNT-BOUND FAILED: the 1:1 finding↔verdict bijection is unproven — EVERY claim is UNVERIFIED (never a partial trust on a broken map)`);
  }
  for (const verdict of verdicts) {
    const failures = verification.failures.filter((f) => f.claim.startsWith(`finding ${verdict.findingIndex} `) || f.claim.startsWith(`finding ${verdict.findingIndex}:`));
    const isVerified = !countBroken && !unverified.has(verdict.findingIndex);
    if (isVerified) {
      lines.push(`- finding ${verdict.findingIndex}: VERIFIED`);
    } else {
      const reasons = failures.map((f) => f.reason).join('; ') || 'the count-bound failure taints the set';
      lines.push(`- finding ${verdict.findingIndex}: UNVERIFIED — ${reasons}`);
    }
  }
  return report + '\n' + lines.join('\n');
}

export class StepXMachine {
  private state: StepXState = 'IDLE';
  private readonly records: StepXMachineRecord[] = [];

  private transitionTo(next: StepXState, evidence: string): void {
    this.records.push({ state: next, pattern: `${this.state}->${next}`, evidence: evidence.slice(0, 150) });
    this.state = next;
  }

  get current(): StepXState {
    return this.state;
  }

  audit(): StepXMachineRecord[] {
    return [...this.records];
  }

  /** THE DRIVE (§13 — the fail-closed chain. EVERY fail-state is LOUD: the
   *  SKIPPED carries the header; the FAILED propagates the named error; the
   *  store failure degrades the persistence, never the report.) */
  async drive(input: StepXInput, brain: AetherBrain | undefined, options: StepXOptions = {}): Promise<StepXResult> {
    const findingCount = Array.isArray(input?.functionality?.findings) ? input.functionality.findings.length : 'absent';
    this.transitionTo('HEALTH_GATING', `targetPath=${input?.targetPath ?? 'absent'} findings=${findingCount}`);

    const health = evaluateHealth(input, brain);
    if (health !== StepXHealth.HEALTHY || brain === undefined) {
      const reason = `${STEP_X_SKIPPED_PREFIX}${health}`;
      this.transitionTo('SKIPPED', reason);
      return {
        ran: false,
        skippedReason: reason,
        verdicts: [],
        report: skippedReport(input, reason, health),
        verifiedBy: [],
      };
    }

    const findings = input.functionality.findings;

    // ── BRIEFING (the S3 ground-truth assembly — the machinery reads the
    //    windows, NEVER the model. The finder is pre-read so the brief's sync
    //    SourceWindowFinder contract holds over the async fs reads.) ──
    this.transitionTo('BRIEFING', `windows=${findings.length}`);
    let groundTruth: GroundTruth;
    let windowTable: Array<[string, string]>;
    try {
      const windows = new Map<string, string>();
      for (const finding of findings) {
        const key = windowKey(finding.file, finding.line);
        if (!windows.has(key)) {
          windows.set(key, await readWindowWithinScope(input.targetPath, finding.file, finding.line, SOURCE_WINDOW_LINES));
        }
      }
      const finder: SourceWindowFinder = {
        sourceWindow: (file: string, line: number) => windows.get(windowKey(file, line)) ?? UNREADABLE_FILE_ABSENT,
      };
      const machinery: SupremacyMachinery = { targetPath: input.targetPath, ...input.functionality };
      // THE FR-11 BRIDGE BINDING: the injected store handle (the shared.db) feeds
      // the bug-hunter query verbs — the hotspot/callGraphRef are REAL graph data
      // when bound, honest defaults when not. A bridge failure degrades inside the
      // brief builder (never breaks the briefing transition).
      groundTruth = buildSupremacyBrief(machinery, finder, options.store ? { graphDb: options.store } : {});
      // The evidence-bound (check-5) window table: ONLY the real windows — an
      // UNREADABLE marker is excluded so the verifier HONESTLY SKIPS the check
      // (never a fake pass, never a fabricated rejection over a marker string).
      windowTable = [];
      for (const finding of findings) {
        const text = windows.get(windowKey(finding.file, finding.line));
        if (text !== undefined && !text.startsWith('UNREADABLE')) {
          windowTable.push([finding.file, text]);
        }
      }
    } catch (err) {
      const detail = errorDetail(err);
      this.transitionTo('FAILED', `${BRIEF_READ_FAILED} — ${detail}`);
      throw new Error(`${BRIEF_READ_FAILED} — the supremacy brief could not be assembled: ${detail}`);
    }

    // ── COMPOSING (the S2 brain — the ONLY model surface. A rejection/stall/
    //    empty/malformed output is AETHER_COMPOSE_FAILED — NO fake report.) ──
    this.transitionTo('COMPOSING', `findings=${findings.length}`);
    let composition: CompositionResult;
    try {
      composition = await brain.compose({ groundTruth, findings });
    } catch (err) {
      const detail = errorDetail(err);
      this.transitionTo('FAILED', `${AETHER_COMPOSE_FAILED} — ${detail}`);
      if (detail.includes(AETHER_COMPOSE_FAILED)) throw err;   // the brain's own loud-fail, never re-wrapped
      throw new Error(`${AETHER_COMPOSE_FAILED} — the brain's composition rejected: ${detail}`);
    }
    if (!composition || !Array.isArray(composition.verdicts) || typeof composition.narrative !== 'string') {
      this.transitionTo('FAILED', `${AETHER_COMPOSE_FAILED} — the malformed composition shape`);
      throw new Error(`${AETHER_COMPOSE_FAILED} — the brain returned a malformed composition (the verdicts array + the narrative are required)`);
    }

    // ── POLISHING (the 6-section adjudicated render — the CANONICAL S5
    //    composeFinalReport from final-polish.ts; the inline stand-in is gone) ──
    this.transitionTo('POLISHING', `verdicts=${composition.verdicts.length}`);
    let report: string;
    try {
      report = composeFinalReport(groundTruth, composition);
    } catch (err) {
      const detail = errorDetail(err);
      this.transitionTo('FAILED', `${COMPOSE_RENDER_FAILED} — ${detail}`);
      throw new Error(`${COMPOSE_RENDER_FAILED} — the adjudicated report could not be rendered: ${detail}`);
    }

    // ── VERIFYING (the S6 six checks over EVERY claim — per-claim degrade,
    //    never a whole-report deletion) ──
    this.transitionTo('VERIFYING', `claims=${composition.verdicts.length}`);
    const verification = verifyAetherOutput(
      composition.verdicts,
      findings,
      input.functionality.graphStats,
      (file, line) => anchorExistsWithinScope(input.targetPath, file, line),
      windowTable,
    );
    const unverified = unverifiedFindingIndexes(verification);
    const countBroken = verificationCountBoundFailed(verification);
    const verifiedBy = composition.verdicts
      .filter((v) => !countBroken && !unverified.has(v.findingIndex))
      .map((v) => `silent-verifier:finding-${v.findingIndex}`);
    report = appendVerificationSection(report, composition.verdicts, verification);

    // ── STORING (the S7 persistence — the injected handle; the audit() wiring
    //    binds the real shared-db handle whose aether_verdicts DDL is applied
    //    by db.ts. A store failure is the honest remainder: the report still
    //    emits, marked "not persisted" — §2.16 the STORE_WRITE_FAILED row.) ──
    this.transitionTo('STORING', `store=${options.store ? 'bound' : 'absent'}`);
    const runId = options.runId ?? `audit-${Date.now()}`;
    if (options.store) {
      try {
        const written = await persistVerdicts(options.store, runId, composition.verdicts, verification);
        report += `\n\n> THE PERSISTENCE: ${written} aether_verdicts row(s) persisted under run_id ${runId} (the compaction-inert adjudication history).\n`;
      } catch (err) {
        const detail = errorDetail(err);
        console.error(`[step-x] ${STORE_WRITE_FAILED}: the verdicts were NOT persisted — ${detail}`);
        report += `\n\n> ${STORE_WRITE_FAILED} — the verdicts are NOT PERSISTED (the in-memory StepXResult holds them; the report above is intact): ${detail}\n`;
      }
    } else {
      report += `\n\n> THE PERSISTENCE: NOT PERSISTED — no store handle bound (the caller did not wire the shared.db handle); the in-memory StepXResult is the only copy.\n`;
    }

    this.transitionTo('EMITTED', `verdicts=${composition.verdicts.length} verified=${verifiedBy.length}`);
    return { ran: true, verdicts: composition.verdicts, report, verifiedBy };
  }
}

/** THE STEP-X ENTRY (§2.1/§9.1.3 — the pipeline insertion point. Each call
 *  drives a FRESH StepXMachine — the run's triad-log never leaks across runs.) */
export async function runStepX(input: StepXInput, brain: AetherBrain | undefined, options: StepXOptions = {}): Promise<StepXResult> {
  const machine = new StepXMachine();
  return machine.drive(input, brain, options);
}
