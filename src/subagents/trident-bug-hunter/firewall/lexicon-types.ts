/**
 * lexicon-types.ts — THE T.E.B SHARED TYPES (W3, the firewall dir's contract surface)
 *
 * The Lexicon bible's engineering canon (the L2 spec §7.1:3041-3081):
 * - THE PATTERNFAMILY: the typed member {id, kind, matcher, triggerCondition, severity, messageTemplate, remediationHook}
 * - THE MPSE TRIPLET: {Pattern, State, Evidence} — no triplet = no decision = no enforcement event
 * - THE DETECTION-VS-DECISION LAW (§7.1:3059): the matcher is a mechanical DETECTOR ONLY — it classifies
 *   the input; it NEVER decides the outcome. THE DECISION is the state machine's transition.
 * - THE FAIL-STATE: BLOCKED — never a silent pass (§7.1.4:3081).
 *
 * This file defines ONLY the types. The detection logic lives in readonly.ts (the bash lockdown)
 * and artifact-scope.ts (the report scope); the decision state machines live beside their detectors.
 */

/** The classification the matchers emit — a DETECTION, never a verdict. */
export interface MatchResult {
  /** The matched family id (e.g. 'BASH_EXECUTION', 'BASH_READ', 'MASTER_CONTEXT_TARGET'). */
  pattern: string;
  /** The matched token (the first verb, the metacharacter, the resolved path segment). */
  token: string;
  /** The free-text evidence (the full command or the resolved target path). */
  evidence: string;
}

/** The context the matchers may consult (the project root, the command's environment). */
export interface LexiconContext {
  /** The project root the lexicon guards (realpath'd by the caller). */
  projectRoot?: string;
  /** The resolved master-context dir when the report-scope matcher has run. */
  resolvedMasterContextDir?: string;
}

/**
 * THE PATTERNFAMILY — the typed member per the bible §1.2 (the L2 spec §7.1:3047-3057).
 * kind: 'ALLOW' families permit the action; 'BLOCK' families deny it.
 */
export interface PatternFamily {
  id: string;
  kind: 'ALLOW' | 'BLOCK';
  /**
   * THE MECHANICAL DETECTOR — Order-2+ classification only.
   * THE REGEX IS THE MECHANICAL DETECTOR ONLY — the token/verb classification.
   * THE DECISION is the state machine below (PARSED -> ALLOW_* | BLOCKED).
   * A regex that returns a verdict would be a SLOP-SIG-2 (regex-only classifier).
   */
  matcher: (input: string, ctx: LexiconContext) => MatchResult | null;
  /** The gate that arms the matcher. */
  triggerCondition: (ctx: LexiconContext) => boolean;
  severity: 'INFO' | 'HIGH' | 'CRITICAL';
  /** The named-error text, verbatim. */
  messageTemplate: string;
  /** The recovery action (the throw, the triplet record, the log). */
  remediationHook?: (evidence: { pattern: string; state: string; evidence: string }) => void;
}

/** THE MPSE TRIPLET — the evidence record on EVERY decision (the bible §1.2, the L2 spec §7.1:3069-3077). */
export interface MPSE {
  /** The matched family id. */
  Pattern: string;
  /** The state-machine state ('PARSED', 'PARSED->ALLOW_READ', 'PARSED->BLOCKED', ...). */
  State: string;
  /** The full command or the resolved target path + the matched token. */
  Evidence: string;
}

/** THE LEXICON DECISION — the state machine's output, carrying both the interface fields and the test aliases. */
export interface LexiconDecision {
  /** The verdict — the closed union (the state machine's ALLOW_* | BLOCKED). */
  verdict: 'ALLOW_READ' | 'ALLOW_REPORT' | 'ALLOW_FIX' | 'BLOCKED';
  /** The matched family id. */
  pattern: string;
  /** The matched token. */
  token: string;
  /** The named error text (the exact message for the BLOCKs; '' for the pure ALLOWs). */
  message: string;
  /** THE MPSE TRIPLET — recorded on EVERY decision, no exceptions. */
  mPSE: MPSE;
  // THE TEST ALIASES (the spec's 6.2 pseudocode asserts these names — §6.2:2588-2594):
  /** Alias of verdict — the pseudocode asserts d.state. */
  state: LexiconDecision['verdict'];
  /** Alias of mPSE — the pseudocode asserts d.triplet.Pattern. */
  triplet: MPSE;
  /** The resolved master-context dir (the report-scope decision's create/reuse resolution). */
  resolvedDir?: string;
}

/** THE BASH LOCKDOWN DECISION — the readonly.ts contract (the L2 spec §7.2:3096-3101). */
export interface BashLockdownDecision extends LexiconDecision {
  verdict: 'ALLOW_READ' | 'BLOCKED';
}

/** THE REPORT SCOPE DECISION — the artifact-scope.ts contract (the L2 spec §7.3). */
export interface ReportScopeDecision extends LexiconDecision {
  verdict: 'ALLOW_REPORT' | 'BLOCKED';
}

/** THE EXACT BASH ERROR MESSAGE (the operator's C1.10, quoted verbatim at the spec §7.2:3103-3104). */
export const BASH_ERROR_MESSAGE: string =
  'code edits are not allowed. bash is ONLY granted for search and read capabilities.';

/** THE EXACT REPORT-SCOPE ERROR (the operator's C1.11 — a LITERAL constant, NO interpolation). */
export const REPORT_SCOPE_ERROR: string =
  'report writes are ONLY allowed to <project>/MASTER_CONTEXT/bug_hunter_report_v<N>.md';

// ---------------------------------------------------------------------------
// THE MASTER_CONTEXT VARIANTS (D18, spec §7.3:3371-3372) — THE ONE SHARED SOURCE
// ---------------------------------------------------------------------------

/** The six syntax forms of the MASTER_CONTEXT folder (D18, spec §7.3:3371-3372).
 *  THE REGEX IS THE MECHANICAL DETECTOR ONLY — the variant matching; THE
 *  DECISION is the REPORT_SCOPE_DECISION state machine (PARSED -> ALLOW_REPORT |
 *  BLOCKED). The consumers (firewall/artifact-scope.ts, tools/report-writer.ts,
 *  hooks/index.ts) IMPORT this single source — the triplication drift risk is
 *  closed (the 2026-08-12 unification): ONE definition, three imports, zero
 *  local copies. The 6 forms are the operator's named syntax variations
 *  ("lexicon detection of any syntax variations that exist so it doesnt create
 *  duplicates") — the first EXISTING variant wins, never a duplicate dir. */
export const MASTER_CONTEXT_VARIANTS: readonly string[] = [
  'MASTER_CONTEXT', 'master-context', 'master_context',
  'MasterContext', 'masterContext', 'master context',
];
