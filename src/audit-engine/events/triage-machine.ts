/**
 * triage-machine.ts — THE TRIAGE MACHINE (SPEC-3 §2.3 / §2.11 / §9.2 — E2)
 *
 * THE DECISION LAYER: the machine consumes the plane's NormalizedObservation + the ProcessState
 * and maps it to a SlopClass + the {Pattern, State, Evidence} triad. THE ISE LAW (the PARAGON
 * §1.8): a filter/detector NEVER returns a class — the filter narrows ("this event's type is my
 * interest"), the detector returns a boolean (claimLexiconHasMatch), and THE MACHINE DECIDES from
 * the observation's STRUCTURE + the process state (the TRIAGE_RULES decision table).
 *
 * THE TRIAD-COMPLETENESS LAW (§2.3 / §2.15): a classification without its triad is NOT a verdict
 * — the machine THROWS EVENT_TRIAD_MISSING before any block can fire on a bare assertion.
 *
 * THE INCONCLUSIVE FAIL-STATE (§9.2): a malformed/unclassifiable observation is RETURNED as
 * BENIGN-with-the-INCONCLUSIVE-triad + LOGGED — never silently passed, never a crash (the
 * OBSERVER law). THE FAIL-STATE IS INCONCLUSIVE, NEVER PASS.
 *
 * THE OVER_AUDIT RATIO is DATA (the REGISTERS import, §9.7 — never a magic literal in the
 * classifier body).
 */
import { tridentLog } from '../../utils.js';
import type {
  Classifier,
  NormalizedObservation,
  SlopClass,
  Triad,
  TriageVerdict,
} from './event-substrate.js';
import { EVENT_REGISTRY, REGISTERS, RUNTIME_EVENT_TYPES } from './event-registry.js';
import { claimLexiconHasMatch } from './enforcement-planes.js';

// THE E2 TYPE SURFACE (SPEC-3 §2.8) — defined in event-substrate.ts (the E-PB1 self-contained
// contract); re-exported here so the machine's module IS the triage type surface (§2.3).
export type { SlopClass, Triad, TriageVerdict } from './event-substrate.js';

/** THE PROCESS STATE (SPEC-3 §2.11) — the deterministic fixture the machine's preconditions read.
 *  Every field is OPTIONAL at the boundary; the machine normalizes the defaults (fail-closed:
 *  an unknown evidence chain = NO evidence, an unknown hook placement = NON-before). */
export interface ProcessState {
  /** The container-test/evidence-chain mark for THIS claim (the CLAIM_SLOP gating precondition). */
  hasContainerTestEvidence?: (obs: NormalizedObservation) => boolean;
  /** The process-level audit stats (the OVER_AUDIT feed when the observation carries none). */
  filesScanned?: number;
  findingsCount?: number;
  /** The container-proven working contracts (the DESTRUCTIVE_PLAN registry — e.g. 'teb-throw-block'). */
  workingArchitecture?: string[];
  /** The D17 golden-state FALSE-FIRE signal for a matcher (the CALIB_STALE precondition). */
  goldenStateFalseFired?: (matcherId: string) => boolean;
  /** The hook-placement probe (the TEA_NOT_TEB precondition — is this enforcement a before-hook). */
  isBeforeHook?: (obs: NormalizedObservation) => boolean;
}

/** THE NORMALIZED PROCESS STATE — every field present, the defaults fail-closed. */
type NormalizedProcessState = Required<ProcessState>;

/** THE AUDIT STATS — read from the observation's OWN metadata first (the AUDIT_DONE event carries
 *  its stats, §9.4 worked example 2), falling back to the process state. Computed, never fitted. */
function overAuditStats(obs: NormalizedObservation, state: NormalizedProcessState): { findings: number; files: number } | null {
  const md = obs.metadata as { findingsCount?: unknown; filesScanned?: unknown } | undefined;
  const findings = typeof md?.findingsCount === 'number' ? md.findingsCount : state.findingsCount;
  const files = typeof md?.filesScanned === 'number' ? md.filesScanned : state.filesScanned;
  if (typeof findings !== 'number' || typeof files !== 'number') return null;
  return { findings, files };
}

/** THE MATCHER ID — the CALIB_STALE feed (defensive extraction from the observation metadata). */
function observationMatcherId(obs: NormalizedObservation): string | undefined {
  const md = obs.metadata as { matcherId?: unknown } | undefined;
  return typeof md?.matcherId === 'string' && md.matcherId.length > 0 ? md.matcherId : undefined;
}

/**
 * THE ARCHITECTURE-CONTRADICTION DETECTOR (SPEC-3 §2.11 DESTRUCTIVE_PLAN) — the DETECTION layer,
 * never the verdict. The working-architecture registry is DATA: each container-proven contract
 * names the suggestion-shape that would BREAK it. A suggestion contradicting a registered
 * contract is detected here; THE MACHINE decides the DESTRUCTIVE_PLAN class.
 */
const ARCHITECTURE_CONTRADICTIONS: Readonly<Record<string, RegExp>> = {
  // the teb block is THROW-based (container-proven) — an output.error "fix" breaks it
  'teb-throw-block': /\boutput\.error\b/i,
  // the D17 calibration gate is the finding-quality floor — removing/bypassing it reopens the FP flood
  'd17-gate': /\b(remove|skip|disable|bypass)\b[^.]{0,40}\b(d17|calibration|golden.?state)\b/i,
  // the substrate is ONE event hook (the CUSTOM_EVENT_HOOK bible) — a second hook breaks the contract
  'one-event-hook': /\b(add|register|create)\b[^.]{0,40}\b(second|another|new)\b[^.]{0,30}\bevent hook\b/i,
};

/** contradictionChecker — TRUE when the suggestion contradicts a registered working contract. */
export function contradictionChecker(workingArchitecture: readonly string[], text: string): boolean {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (!Array.isArray(workingArchitecture) || workingArchitecture.length === 0) return false;
  for (const contract of workingArchitecture) {
    const detector = ARCHITECTURE_CONTRADICTIONS[contract];
    if (detector && detector.test(text)) return true;
  }
  return false;
}

/**
 * THE R17 THEATRICAL-RESULT DETECTOR (SPEC-3 §2.11 FAKE_RETURN) — the audit tool's OWN R17 ethic
 * applied to the tool-result: a hardcoded success / an always-pass / a substituted fake. THE
 * DETECTION layer — the machine decides the class; this returns a boolean precondition.
 */
const R5_THEATRICAL_RESULT: RegExp =
  /(\b(always.?pass(?:es|ing)?|hardcod(?:e|ed|ing)|pretend|fake[sd]?|stub(?:bed)?)\b[^.]{0,50}\b(result|response|output|test|tests|audit|check|evidence|verification|pass))|(\breturn\s*\{?\s*(success|ok|passed)\s*:\s*true\b)/i;

/** r5TheatricalLexiconHasMatch — TRUE when the result content IS the theatrical pattern. */
export function r5TheatricalLexiconHasMatch(text: string): boolean {
  return typeof text === 'string' && text.length > 0 && R5_THEATRICAL_RESULT.test(text);
}

/**
 * THE TRIAGE RULES (SPEC-3 §2.11 — THE MACHINE'S DECISION TABLE). Each slop class's PRECONDITIONS
 * checked against the observation's STRUCTURE + the process state. The six slop classes are the
 * rule keys (BENIGN is the machine's DEFAULT, never a rule — a "BENIGN rule" would be the
 * theatrical default-pass the ISE law bans).
 */
export type TriageRule = (obs: NormalizedObservation, state: NormalizedProcessState) => boolean;

export const TRIAGE_RULES: Record<Exclude<SlopClass, 'BENIGN'>, TriageRule> = {
  // CLAIM_SLOP — a message-complete carrying a theatrical claim with NO evidence-chain mark.
  // The lexicon is the DETECTOR (one precondition); the missing container-test evidence is the
  // MACHINE'S gating precondition (the gating, never the hamstring).
  CLAIM_SLOP: (obs, state) =>
    obs.type === RUNTIME_EVENT_TYPES.MESSAGE_UPDATED &&
    typeof obs.text === 'string' &&
    obs.text.length > 0 &&
    claimLexiconHasMatch(obs.text) &&
    !state.hasContainerTestEvidence(obs),
  // OVER_AUDIT — the audit's AUDIT_DONE event with findings > files × OVER_AUDIT_RATIO.
  OVER_AUDIT: (obs, state) => {
    if (obs.type !== EVENT_REGISTRY.AUDIT_DONE) return false;
    const stats = overAuditStats(obs, state);
    if (!stats || stats.files < 0) return false;
    return stats.findings > stats.files * REGISTERS.OVER_AUDIT_RATIO; // strictly > — the boundary IS benign
  },
  // DESTRUCTIVE_PLAN — the loop's plan event whose suggestion contradicts the working registry.
  DESTRUCTIVE_PLAN: (obs, state) =>
    obs.type === EVENT_REGISTRY.LOOP_PLAN &&
    contradictionChecker(state.workingArchitecture, obs.text),
  // FAKE_RETURN — a tool-result whose content IS the R17 theatrical pattern.
  FAKE_RETURN: (obs, _state) =>
    obs.type.startsWith(EVENT_REGISTRY.hypotheses.TOOL_CALL) &&
    r5TheatricalLexiconHasMatch(obs.text),
  // CALIB_STALE — the golden-state run where a matcher FALSE-FIRED on the clean core (the D17 signal).
  CALIB_STALE: (obs, state) => {
    if (obs.type !== EVENT_REGISTRY.AUDIT_GOLDEN_STATE) return false;
    const matcherId = observationMatcherId(obs);
    return matcherId !== undefined && state.goldenStateFalseFired(matcherId);
  },
  // TEA_NOT_TEB — an enforcement registered in a non-before hook (it CANNOT block).
  TEA_NOT_TEB: (obs, state) =>
    obs.type === EVENT_REGISTRY.HOOK_REGISTRATION &&
    !state.isBeforeHook(obs),
};

/**
 * THE TRIAD-COMPLETENESS GUARD (SPEC-3 §2.3 / §2.15) — the named error THROWN when a slop-class
 * verdict lacks its {Pattern, State, Evidence}. THE BLOCK ONLY FIRES WITH THE EVIDENCE RECORDED.
 * Returns the verdict for the chaining caller (classify).
 */
export function assertTriageTriad(verdict: TriageVerdict): TriageVerdict {
  if (verdict.slopClass === 'BENIGN') return verdict;
  const missing: string[] = [];
  if (typeof verdict.triad?.pattern !== 'string' || verdict.triad.pattern.length === 0) missing.push('Pattern');
  if (typeof verdict.triad?.state !== 'string' || verdict.triad.state.length === 0) missing.push('State');
  if (typeof verdict.triad?.evidence !== 'string' || verdict.triad.evidence.length === 0) missing.push('Evidence');
  if (missing.length > 0) {
    throw new Error(`EVENT_TRIAD_MISSING: a ${verdict.slopClass} classification without its {${missing.join(', ')}} is not a verdict`);
  }
  return verdict;
}

/** THE EVIDENCE EXCERPT — the observation's text bounded to the ledger-friendly 200 chars. */
function evidenceExcerpt(obs: NormalizedObservation, max = 200): string {
  return typeof obs.text === 'string' && obs.text.length > 0 ? obs.text.slice(0, max) : obs.type;
}

/**
 * THE DEFAULT TRIAGE MACHINE (SPEC-3 §9.2) — the concrete classifier. THE MACHINE DECIDES from
 * the decision table + the normalized process state; the triad is GUARDED before every return
 * (the triad-completeness law is structural, not aspirational).
 */
export class DefaultTriageMachine {
  private readonly state: NormalizedProcessState;

  constructor(state: ProcessState) {
    // THE FAIL-CLOSED DEFAULTS: an unknown evidence chain = NO evidence (a bare claim blocks);
    // an unknown hook placement = NON-before (an un-placeable enforcement blocks). The defaults
    // protect the runtime when the caller's state is partial — never a silent pass.
    this.state = {
      hasContainerTestEvidence: state.hasContainerTestEvidence ?? (() => false),
      filesScanned: state.filesScanned ?? 0,
      findingsCount: state.findingsCount ?? 0,
      workingArchitecture: state.workingArchitecture ?? [],
      goldenStateFalseFired: state.goldenStateFalseFired ?? (() => false),
      isBeforeHook: state.isBeforeHook ?? (() => false),
    };
  }

  /** THE DECIDING ENTRY (SPEC-3 §2.3): the observation → the verdict. Error paths FIRST:
   *  a malformed observation → the INCONCLUSIVE fail-state (logged, never silently passed). */
  classify(obs: NormalizedObservation): TriageVerdict {
    if (!obs || typeof obs.type !== 'string' || obs.type.length === 0) {
      // THE INCONCLUSIVE FAIL-STATE — the ambiguity is RECORDED in the triad, never passed.
      tridentLog('WARN', 'triage-machine', 'INCONCLUSIVE: a malformed observation reached the machine — flagged, never silently passed');
      return { slopClass: 'BENIGN', triad: { pattern: 'INCONCLUSIVE', state: 'INCONCLUSIVE', evidence: 'malformed observation' } };
    }
    const s = this.state;

    if (TRIAGE_RULES.CLAIM_SLOP(obs, s)) {
      return assertTriageTriad({
        slopClass: 'CLAIM_SLOP',
        triad: { pattern: 'claim-detector', state: 'CLASSIFIED', evidence: evidenceExcerpt(obs) },
        block: {
          demand: '[SSTF EVENT: CLAIM] the claim is un-evidenced — the container test is the only proof. Provide the tool-result evidence or refrain from the claim.',
          target: 'message',
        },
      });
    }
    if (TRIAGE_RULES.OVER_AUDIT(obs, s)) {
      const stats = overAuditStats(obs, s)!; // the rule already proved the stats exist
      return assertTriageTriad({
        slopClass: 'OVER_AUDIT',
        triad: {
          pattern: 'density-threshold',
          state: 'CLASSIFIED',
          evidence: `findings=${stats.findings} files=${stats.files} ratio=${(stats.files > 0 ? stats.findings / stats.files : stats.findings).toFixed(2)}`,
        },
        block: {
          demand: `[LOOP: OVER_FIRED] the audit over-fires (findings ${stats.findings} > files ${stats.files} × ${REGISTERS.OVER_AUDIT_RATIO}) — route to CALIBRATION, never DISPATCH.`,
          target: 'state',
        },
      });
    }
    if (TRIAGE_RULES.DESTRUCTIVE_PLAN(obs, s)) {
      return assertTriageTriad({
        slopClass: 'DESTRUCTIVE_PLAN',
        triad: { pattern: 'architecture-registry', state: 'CLASSIFIED', evidence: evidenceExcerpt(obs) },
        block: {
          demand: '[LOOP: CONTRADICTION] the planned wave contradicts the working architecture — the wave never boards; the remedy names the contradiction.',
          target: 'state',
        },
      });
    }
    if (TRIAGE_RULES.FAKE_RETURN(obs, s)) {
      return assertTriageTriad({
        slopClass: 'FAKE_RETURN',
        triad: { pattern: 'r17-theatrical', state: 'CLASSIFIED', evidence: evidenceExcerpt(obs) },
        block: {
          demand: '[SSTF EVENT: FAKE_RETURN] the tool-result is theatrical — recorded as flagged, never consumable as a pass.',
          target: 'tool-output',
        },
      });
    }
    if (TRIAGE_RULES.CALIB_STALE(obs, s)) {
      const matcherId = observationMatcherId(obs)!; // the rule already proved the id exists
      return assertTriageTriad({
        slopClass: 'CALIB_STALE',
        triad: { pattern: 'd17-golden-state', state: 'CLASSIFIED', evidence: `matcher=${matcherId}` },
        block: {
          demand: `[AUDIT: CALIB_STALE] matcher ${matcherId} false-fired on the clean core — the D17 re-calibration is required before the next audit.`,
          target: 'state',
        },
      });
    }
    if (TRIAGE_RULES.TEA_NOT_TEB(obs, s)) {
      return assertTriageTriad({
        slopClass: 'TEA_NOT_TEB',
        triad: { pattern: 'hook-placement', state: 'CLASSIFIED', evidence: evidenceExcerpt(obs) },
        block: {
          demand: '[HOOK: TEA_NOT_TEB] an enforcement is registered in a non-before hook — it cannot block (tea, not teb).',
          target: 'state',
        },
      });
    }
    // THE BENIGN DEFAULT — the honest majority. Recorded (the triad), never blocked.
    return {
      slopClass: 'BENIGN',
      triad: { pattern: 'benign', state: 'RETURNED', evidence: evidenceExcerpt(obs, 120) },
    };
  }

  /**
   * THE SUBSTRATE ADAPTER — the E-PB1 substrate consumes a `Classifier` ((obs) => SlopClass)
   * via `setTriageClassifier`; this machine attaches WITHOUT any E-PB1 API change (the E-PB5
   * wiring seam). The substrate builds its own ledger triad; the machine's full verdict remains
   * available via classify().
   */
  asClassifier(): Classifier {
    return (obs: NormalizedObservation) => this.classify(obs).slopClass;
  }
}
