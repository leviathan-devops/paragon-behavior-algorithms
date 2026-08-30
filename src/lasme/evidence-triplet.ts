// src/lasme/evidence-triplet.ts — THE EVIDENCE-TRIPLET BINDING (spec §2.8, W5)
//
// THE EVIDENCE TRIPLET = the {Pattern, State, Evidence: file:line} binding carried
// on EVERY span classification. THE TERMINOLOGY (the operator's correction):
// these are "evidence triplets" — the binding of the pattern, the state, and the
// evidence anchor — a distinct concern from the pattern-match infrastructure. This
// file implements the EvidenceTriad CONSTRUCTION + the no-triad-no-record law +
// the toTriad adapter + the batch binding + the warhead embedding (the anchor).
//
// THE LANDED CONTRACT (spec §2.8 — forked from contracts.ts, NEVER redefined):
//   EvidenceTriad { pattern{memberId,familySeverity}, state{machineId,from,to},
//                   evidence{file,line} } — imported from src/lasme/contracts.ts.
//   The Severity, the PatternFlag, the DischargeResult, the TestingDegree are
//   the landed types this module ADAPTS — never re-forked.
//
// THE NO-TRIAD-NO-RECORD LAW (the DM-L1 law, spec §2.8 + anti-pattern #6): EVERY
// span classification carries its triad; a span WITHOUT its complete triad (missing
// the Pattern / the State / the Evidence anchor) → DISCARDED. toTriad returns null
// for an incomplete input; tripletsFor drops the triadless spans — a classification
// is NEVER recorded without its triad.
//
// THE BINDING CHAIN (spec §2.8 — the triplet sources):
//   1. The Pattern: the predicate-lexicon member's id + familySeverity.
//   2. The State:   the evidence ladder's transition (stateFrom(degree) → degree,
//                   e.g. evidence-machine NO_EVIDENCE → UNEVIDENCED — the
//                   fail-closed query result).
//   3. The Evidence: the file:line anchor of the empirical check's source OR the
//                   artifact's location (e.g. .trident/container-test-results.json:1).
//
// THE WARHEAD EMBEDDING (spec §2.7 + §2.8): the triad makes the warhead precise —
// the warhead NAMES the evidence gap with the file:line anchor. warheadGapForTriad
// renders the evidenceGap string from the triad carrying the anchor; the caller
// (the W6 wiring, or the test) feeds it into the existing warhead-generator's
// directive (the adapts-into, never a fork of warhead-generator/templates/quality-gate).
//
// THE F-6-REPLAY (spec §4): a theatrical span's warhead names the evidence gap with
// the file:line anchor — the precision steering directive.

import type { EvidenceTriad, PatternFlag, Severity } from './contracts.js';
import type { TestingDegree } from './evidence-machine.js';
import { EVIDENCE_MACHINE_ID } from './evidence-machine.js';
import type { DischargeResult } from './oracle.js';

// ── THE ADAPTER'S FLAG INPUT (the PatternFlag + the family severity) ────────
// The lexicon's PatternFlag carries the memberId + the bounded excerpt + the
// anchor (the detection layer). The familySeverity lives on the registered
// member — the adapter resolves it via severityFor(), or reads it directly when
// the caller supplies it (the task's worked example inlines the severity).
export interface TriadFlag {
  readonly memberId: string;
  readonly excerpt?: string;
  readonly anchor?: { file: string; line: number } | null;
  readonly severity?: Severity;
}

// ── THE BATCH BINDING SPAN (the classification input for tripletsFor) ───────
export interface TripletSpan {
  /** the adapter input — the flag that flagged + the resolved severity lens. */
  readonly flag: TriadFlag;
  /** the evidence ladder's queried degree (the fail-closed outcome). */
  readonly degree: TestingDegree;
  /** the oracle discharges for the flagged members. */
  readonly discharges: readonly DischargeResult[];
  /** an explicit evidence anchor override (the empirical check's source). */
  readonly evidenceAnchor?: { file: string; line: number } | null;
}

// ── THE ADAPTER OPTIONS ─────────────────────────────────────────────────────
export interface ToTriadOptions {
  /** the predicate-lexicon severity lookup (memberId → Severity). When the flag
   *  carries an explicit severity, it wins; this is the resolver for the
   *  severity-less flags. */
  readonly severityFor?: (memberId: string) => Severity | undefined;
  /** the evidence machine's id override (default 'evidence' — the landed
   *  EVIDENCE_MACHINE_ID). */
  readonly machineId?: string;
  /** the explicit evidence anchor override (wins over the flag.anchor). */
  readonly evidenceAnchor?: { file: string; line: number } | null;
  /** the machine's PRIOR state override (default derived from the degree via
   *  stateFrom). */
  readonly priorState?: string;
}

// ── THE EVIDENCE-ANCHOR FAIL-CLOSED DEFAULTS (spec §2.8) ────────────────────
// The UNEVIDENCED fail-closed query's evidence anchor: the absent container
// artifact is the WHERE of the gap. The unit-evidenced anchor: the tracked
// evidence record. Both are the empirical-check anchors the warhead cites.
export const FAIL_CLOSED_ANCHOR: Readonly<{ file: string; line: number }> = {
  file: '.trident/container-test-results.json',
  line: 1,
};
export const UNIT_ANCHOR: Readonly<{ file: string; line: number }> = {
  file: 'evidence-tracker.ts',
  line: 524,
};

// ── THE STATE PRIOR DERIVATION (the machine transition's `from`, spec §2.8) ─
// The State is the evidence ladder's transition: the degree (the query outcome)
// is the `to`; the `from` is the complementary prior state the query represents.
//   UNEVIDENCED (the fail-closed)      → from NO_EVIDENCE (the absence of evidence)
//   UNIT_EVIDENCED                     → from NO_EVIDENCE (the unit battery landed)
//   CONTAINER_EVIDENCED (the strongest)→ from UNIT_EVIDENCED (the strongest came
//                                        after a unit tier — never a blind jump)
export function stateFrom(degree: TestingDegree): string {
  switch (degree) {
    case 'NO_EVIDENCE':
      return 'NO_EVIDENCE';
    case 'UNEVIDENCED':
      return 'NO_EVIDENCE';
    case 'UNIT_EVIDENCED':
      return 'NO_EVIDENCE';
    case 'CONTAINER_EVIDENCED':
      return 'UNIT_EVIDENCED';
  }
}

// ── THE EVIDENCE-ANCHOR RESOLUTION (the WHERE of the gap, spec §2.8) ────────
// The evidence anchor precedence: (1) an EXPLICIT null zeroes the anchor — the
// span has NO evidence anchor → the no-triad-no-record discards it (never a
// default pretending the evidence exists); (2) an explicit {file,line} override;
// (3) the flag's own anchor (the empirical check's source); (4) the degree-driven
// fail-closed default (the absent artifact / the tracked record) — used ONLY when
// no explicit anchor and no flag anchor are provided (the pure binding).
export function resolveEvidenceAnchor(
  flag: TriadFlag,
  degree: TestingDegree,
  explicit?: { file: string; line: number } | null,
): { file: string; line: number } | null {
  // THE NO-TRIAD-NO-RECORD — an EXPLICIT null evidence anchor is a genuine
  // absence: the span is never recorded without its triad, never defaulted.
  if (explicit === null) return null;
  if (explicit !== undefined) return explicit;
  if (flag.anchor !== undefined && flag.anchor !== null) return flag.anchor;
  if (degree === 'CONTAINER_EVIDENCED') return { file: UNIT_ANCHOR.file, line: UNIT_ANCHOR.line };
  if (degree === 'UNIT_EVIDENCED') return { file: UNIT_ANCHOR.file, line: UNIT_ANCHOR.line };
  // the NO_EVIDENCE / UNEVIDENCED fail-closed → the absent artifact is the gap
  return { file: FAIL_CLOSED_ANCHOR.file, line: FAIL_CLOSED_ANCHOR.line };
}

// ── THE RESOLVED SEVERITY (the Pattern's familySeverity, spec §2.8) ─────────
function resolveSeverity(flag: TriadFlag, severityFor?: (memberId: string) => Severity | undefined): Severity | undefined {
  if (flag.severity !== undefined) return flag.severity;
  if (severityFor !== undefined) {
    const s = severityFor(flag.memberId);
    if (s !== undefined) return s;
  }
  return undefined;
}

// ── THETO-TRIAD ADAPTER (THE SINGLE CONSTRUCTION PATH — spec §2.8) ──────────
// THE NO-TRIAD-NO-RECORD LAW: returns null (the span DISCARDED) when the input
// cannot produce a COMPLETE triad — a missing Pattern (no memberId), a missing
// State (an invalid degree), or a missing Evidence (no anchor resolvable). A
// classification is NEVER recorded without its complete triad (the DM-L1 law).
export function toTriad(
  flag: TriadFlag,
  degree: TestingDegree,
  discharges: readonly DischargeResult[],
  opts: ToTriadOptions = {},
): EvidenceTriad | null {
  // THE NO-TRIAD-NO-RECORD — the Pattern member must be named (a trialless
  // span, even when the words look theatrical, is DISCARDED — spec §5 #6).
  if (flag === undefined || flag === null || typeof flag.memberId !== 'string' || flag.memberId.length === 0) {
    return null;
  }
  // the familySeverity must resolve (the Pattern's severity — the missing
  // severity is an incomplete Pattern → DISCARDED).
  const severity = resolveSeverity(flag, opts.severityFor);
  if (severity === undefined) return null;

  // THE NO-TRIAD-NO-RECORD — the State's `to` (the degree) must be a valid
  // evidence-ladder value (the complete State → else DISCARDED).
  const to = degree;
  const validDegrees: readonly TestingDegree[] = [
    'NO_EVIDENCE',
    'UNIT_EVIDENCED',
    'CONTAINER_EVIDENCED',
    'UNEVIDENCED',
  ];
  if (!validDegrees.includes(to)) return null;

  // THE NO-TRIAD-NO-RECORD — the Evidence anchor must resolve (the complete
  // Evidence — else DISCARDED).
  const anchor = resolveEvidenceAnchor(flag, degree, opts.evidenceAnchor);
  if (anchor === null) return null;

  const machineId = opts.machineId ?? EVIDENCE_MACHINE_ID;
  const from = opts.priorState ?? stateFrom(degree);

  return {
    pattern: { memberId: flag.memberId, familySeverity: severity },
    state: { machineId, from, to },
    evidence: { file: anchor.file, line: anchor.line },
  };
}

// ── THE BATCH BINDING (spec §2.8 — tripletsFor) ─────────────────────────────
// THE NO-TRIAD-NO-RECORD, batch form: every span carries its triad; a span
// WITHOUT a complete triad is DISCARDED (dropped from the output). The records
// array is the empirical record — a triadless span NEVER enters it.
export function tripletsFor(
  spans: readonly TripletSpan[],
  opts: ToTriadOptions = {},
): readonly EvidenceTriad[] {
  const bound: EvidenceTriad[] = [];
  for (const span of spans) {
    const triad = toTriad(span.flag, span.degree, span.discharges, {
      ...opts,
      // the span's OWN explicit anchor wins (an explicit `null` on the span is a
      // genuine no-anchor → the no-triad-no-record discards it, never shadowed by
      // the shared opts default).
      evidenceAnchor: span.evidenceAnchor !== undefined ? span.evidenceAnchor : opts.evidenceAnchor,
    });
    if (triad !== null) bound.push(triad);
  }
  return bound;
}

// ── THE WARHEAD EMBEDDING (spec §2.7 + §2.8 — the precision steering) ───────
// THE TRIAD MAKES THE WARHEAD PRECISE: the rendered guidance NAMES the evidence
// gap with the file:line anchor — "the claim 'The build is verified' is
// THEATRICAL_LIE — the evidence state is UNEVIDENCED (... at
// .trident/container-test-results.json:1)". warheadGapForTriad renders the
// evidenceGap string (the {evidenceGap} template slot) FROM the triad's state +
// evidence anchor — the anchor flows into the warhead the existing
// warhead-generator renders (the adapts-into, never a fork).
export function warheadGapForTriad(triad: EvidenceTriad): string {
  return `${triad.state.to} — no evidence at ${triad.evidence.file}:${triad.evidence.line}`;
}

// ── THE DIRECTIVE FACTORY (the embedding convenience — the W5 integration
//    surface the W6 wiring + the F-6-REPLAY test consume). It builds the
//    warhead-generator's WarheadDirective.input shape with the triad embedded in
//    the evidenceGap — the anchor REQUIRED by the precision-steering directive.
export interface TriadWarheadDirective {
  readonly patternId: string;
  readonly triggerQuote: string;
  readonly targetAction: string;
  readonly evidenceGap: string;
  readonly actorContext: {
    readonly intent: string;
    readonly evidenceSnapshot: string;
    readonly behaviorCount: number;
  };
}

export function warheadForTriad(
  triad: EvidenceTriad,
  input: {
    readonly triggerQuote: string;
    readonly targetAction: string;
    readonly intent: string;
    readonly behaviorCount?: number;
  },
): TriadWarheadDirective {
  return {
    patternId: triad.pattern.memberId,
    triggerQuote: input.triggerQuote,
    targetAction: input.targetAction,
    evidenceGap: warheadGapForTriad(triad),
    actorContext: {
      intent: input.intent,
      evidenceSnapshot: `degree=${triad.state.to} anchor=${triad.evidence.file}:${triad.evidence.line}`,
      behaviorCount: input.behaviorCount ?? 1,
    },
  };
}
