// src/subagents/trident-auditor/firewall/red-team.ts
// THE ZERO-TRUST VALIDATION HELPERS (W9, R10.3, D38).
//
// THE OPERATOR'S LAW (verbatim): 'audit everything 0 trust red team styel...
// directly fix all mistakes the build agent made'. THE ZERO-TRUST PRINCIPLE:
// the build agent's prose claims (the implementations.claim column) are NEVER
// trusted — the diff (the before/after sha) is the ONLY evidence. The claim-vs-
// reality class: before_sha === after_sha is the "the build agent claimed, did
// not fix" class — a declared fix that did not actually change the file.
//
// These helpers are the MECHANICAL validation layer the conformance checker
// and the audit-machine's VERIFY actor consume. They are pure (no fs, no db) —
// the diff is the evidence, computed from the row alone.

// ---------------------------------------------------------------------------
// THE CLAIM-VS-REALITY CLASSIFICATION
// ---------------------------------------------------------------------------

/** The claim-vs-reality verdicts — the zero-trust classification of an
 *  implementations row. */
export type ClaimVsReality =
  | 'CLAIMED_BUT_NOT_FIXED'   // before_sha === after_sha — the row claims a fix, no diff exists
  | 'CHANGED';                // before_sha !== after_sha — a real diff exists

/** THE ZERO-TRUST CLASSIFIER — the diff is the only evidence (R10.3).
 *  before_sha === after_sha → the "claimed but not fixed" class. */
export function claimVsReality(beforeSha: string, afterSha: string): ClaimVsReality {
  if (beforeSha === afterSha) return 'CLAIMED_BUT_NOT_FIXED';
  return 'CHANGED';
}

/** The claimed-but-not-fixed predicate — the build agent's prose says "fixed",
 *  the sha pair says "untouched". */
export function isClaimedButNotFixed(beforeSha: string, afterSha: string): boolean {
  return beforeSha === afterSha;
}

/** A real diff predicate — the mechanical truth of a change. */
export function hasRealDiff(beforeSha: string, afterSha: string): boolean {
  return beforeSha !== afterSha;
}

// ---------------------------------------------------------------------------
// THE DIFF VERIFICATION — the sha-pair evidence strings the conformance rows
// carry (§4.8:2110-2113 — "the SHA pair is the mechanical truth").
// ---------------------------------------------------------------------------

/** Build the diff evidence for a CHANGED row — the mechanical truth string. */
export function changedEvidence(file: string, beforeSha: string, afterSha: string): string {
  return `the declared fix file changed (diff present): ${file} ${beforeSha} -> ${afterSha}`;
}

/** Build the diff evidence for the CLAIMED_BUT_NOT_FIXED class — the named
 *  zero-trust verdict the conformance checker emits. */
export function claimedButNotFixedEvidence(file: string, beforeSha: string, afterSha: string): string {
  return `the build agent claimed, did not fix: ${file} (before_sha ${beforeSha} === after_sha ${afterSha})`;
}

/** A row-level zero-trust audit: returns the evidence string describing what
 *  the diff ACTUALLY shows vs what the claim says. */
export function auditDiffRow(file: string, beforeSha: string, afterSha: string): {
  verdict: ClaimVsReality;
  evidence: string;
} {
  const v = claimVsReality(beforeSha, afterSha);
  return {
    verdict: v,
    evidence: v === 'CLAIMED_BUT_NOT_FIXED'
      ? claimedButNotFixedEvidence(file, beforeSha, afterSha)
      : changedEvidence(file, beforeSha, afterSha),
  };
}

// ---------------------------------------------------------------------------
// THE NAMED ERRORS (O32.1 CONFORMANCE_VIOLATED) — the loud-fail-or-clear-pass
// law: the verify/conform actors throw these; a silent pass is BANNED.
// ---------------------------------------------------------------------------

/** The base audit error — every audit failure NAMES its code in the message. */
export class AuditError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

/** CONFORMANCE_VIOLATED — a contract is violated (a claimed-but-not-fixed row,
 *  a battery still firing, a same-rule regression). BLOCKS the clear (D25). */
export class ConformanceViolatedError extends AuditError {
  readonly findingId: string;
  readonly detail: string;
  constructor(findingId: string, detail: string) {
    super('CONFORMANCE_VIOLATED', `CONFORMANCE_VIOLATED: finding=${findingId} detail=${detail}`);
    this.findingId = findingId;
    this.detail = detail;
  }
}

/** STATE_INCONCLUSIVE — the machine's fail-state (O3.5). An actor failure is
 *  the named error, never a silent pass. */
export class StateInconclusiveError extends AuditError {
  readonly detail: string;
  constructor(detail: string) {
    super('STATE_INCONCLUSIVE', `STATE_INCONCLUSIVE: detail=${detail}`);
    this.detail = detail;
  }
}

export function conformanceViolated(findingId: string, detail: string): ConformanceViolatedError {
  return new ConformanceViolatedError(findingId, detail);
}

export function stateInconclusive(detail: string): StateInconclusiveError {
  return new StateInconclusiveError(detail);
}
