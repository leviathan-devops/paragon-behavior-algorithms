// src/firewalls/sttgf-mutator.ts — THE SURGICAL MUTATOR (the 7.5 STTGF
// overhaul's C-3 / FR-3 — the wave 3's deliverable) — THE MUTATION-ON-THE-
// VERDICT REFACTOR (the wave-2 decision-core: the splice fires on the LATTICE
// POINTS, never on prose shape).
//
// THE ROLE (the spec's C-3.1 :1264-1266): the operator's conditional lift's
// implementation — the slop spans' surgical replacement with the warheads, the
// non-slop content byte-identical, the full-message mutation STRUCTURALLY
// IMPOSSIBLE (the mutator never constructs a full replacement — only the span
// splices). The operator's 2026-08-11 mandate: "I will lift the message mutation
// ban for this specific use case only provided that the surgical mutation
// mechanism is properly engineered w/ its lexicon so we do not lose entire chat
// streams and ONLY the affected chunks/paragraphs of the message are surgically
// mutated" (the spec :86). THE DERALMENT HISTORY (the operator's quote — the
// spec's ANTI-1): "THAT was the biggest derailment is the WHOLE fucking message
// got mutated" — the span-scoped splice is the answer, and the byte-preservation
// is BY CONSTRUCTION (C-3.5 :1350-1390), never by post-hoc repair.
//
// THE MUTATION-ON-THE-VERDICT REFACTOR (the wave-2 decision core — THIS wave):
// TODAY the mutator consumed the OLD ClassifiedSpan[] — the prose classifier's
// output (the merged shape the smoke lexicon's classifyMessageSpans hand-built
// as the splice's coordinate map). THE REFACTOR: the mutator consumes the
// LATTICE-POINT VERDICTS — the splice's decision is the verdict's lattice
// classification (the R-1 law: LIES ARE MUTATED AND FLAGGED. TRUTH IS LEFT
// ALONE), carried mechanically by the wave-1 verdict module's LATTICE_POINTS
// mutate flag (the spec's §54 — transcribed verbatim below). The VALID point is
// NEVER spliced; every other lattice point (CONTRADICTED / UNVERIFIABLE /
// UNVERIFIED / THEATRICAL_LIE / PURE_BULLSHIT / WRONG_INTENT /
// WRONG_EXPLANATION) is MUTATED + FLAGGED with the named class.
//
// THE VERDICT-SOURCE RECONCILIATION (flagged — the wave-1 type shape): the
// wave-1 BrandedVerdict (src/firewalls/sttgf-types.ts:157) is the sealed axes
// ONLY — `{ evidence, intent, explanation } & the private brand` — with NO span
// coordinates, NO latticePoint field, and NO public constructor. The splice
// REQUIRES the span coordinates (the byte offsets — C-3.5) AND the lattice
// classification (the kind + the demand + the mutate flag). The mutator's
// verdict carrier (VerdictSpan below) carries the lattice surface + the splice
// coordinates; the classification is derived THROUGH the wave-1 verdict module's
// TOTAL FUNCTION (latticePoint(e, i, r) — src/firewalls/sttgf-verdict.ts:75)
// + the wave-1 LATTICE_POINTS table (sttgf-verdict.ts:132) — the mutator
// CONSUMES the wave-1 module's data, never re-derives a lattice point. The
// brand seal (the unforgeability — §44) lives at the wave-1 production
// boundary; the mutator consumes the verdict's DATA (the axes → the point).
//
// THE VERDICT-SOURCE PATH (the mission's form): `mutateMessage(text,
// verdicts: VerdictSpan[], sessionId)` — the caller supplies the lattice
// verdicts (the classifyMessageSpans output of the wave-2 target — the spec's
// §64 :1926). THE SEAM PATH (the live contract): `mutateMessage(text,
// sessionId?)` — the internal bridge runs the lexicon's classifyMessageSpans
// (the wave-1 landed deliverable — the C-2) + maps each ClassifiedSpan to its
// lattice carrier through the wave-1 total function. Both paths feed the SAME
// splice — the mutation fires on the lattice points only (the R-1 law).
//
// THE ARCHITECTURE (the spec's C-3.7 data-flow :1438-1479 — the REFACTORED
// three-stage pipeline): (1) THE IDEMPOTENCE GUARD (H-5 — the single-source
// marker: isMutated(text) = text.includes(STTGF_MARKER_PREFIX) — the NO-OP,
// byte-identical), (2) THE VERDICT SOURCE (the caller's lattice verdicts OR the
// internal classify bridge — the parse failure refused FIRST), (3) THE SPLICE
// (the string-builder — the non-claim original bytes VERBATIM + the F-82
// braced warheads at the slop verdicts' offsets — C-3.5), then THE MPSM ARM
// (§7.2 — the demand carries the per-claim witness records) + THE MARKER.
//
// THE TYPE CONTRACTS (C-3.2 :1268-1302 — with the REAL-module reconciliation):
//   - The spec's MutationResult { text, mutated: number, verdicts, marker }.
//     THE CONTEXT-ARGS DISCREPANCY (flag): the context args said `mutated:
//     boolean` — the spec :1275 says `mutated: number; // the slop-span count`,
//     the wave-4 seam (sttgf-firewall.ts:39) types `mutated: number`,
//     and the hook's consumption (trident-hooks.ts:3433) is `tOut.mutated === 0`
//     (the byte-identical pass-through guard — a boolean would break it: `false
//     === 0` is false, so the no-op would NOT continue). THE NUMBER IS THE
//     CONTRACT: the count of the mutated slop spans. Implemented as the number.
//   - The seam's consume (sttgf-firewall.ts:37-40): `mutateMessage?:
//     (text: string, sessionId?: string) => { text: string; mutated: number;
//     verdicts?: unknown[] }` — the sessionId is OPTIONAL in the seam, so this
//     module's sessionId is `string | undefined` (assignable to BOTH the seam's
//     optional form and the spec's MutatorSurface required form). The third
//     opts parameter is the 7.5 TEST 5's test seam (the spec :3698 —
//     `mutateMessage(message, SESSION, { forceClassifierError: true })`).
//     THE OVERLOAD (the mission's 3-arg form + the seam's 2-arg form — BOTH
//     live): `(text, verdicts: VerdictSpan[], sessionId?, opts?)` and
//     `(text, sessionId?, opts?)` — the runtime detects the array arg.
//   - The warheads: THE SINGLE SOURCE is the smoke lexicon's selectWarheadLocal
//     (sttgf-lexicon.ts:108-126 — the C-3.3 drafts implemented by the wave 2) —
//     the classified spans CARRY .warhead; this module CONSUMES span.warhead
//     (the lexicon's contract: "the wave-3 surgical mutator CONSUMES the
//     verdict's warhead ... it never needs to re-derive the text" :112-114).
//     The mutator defines ONLY: (a) the mutation marker prefix (H-5 — the
//     single source shared with the detector's short-circuit — the spec's §56),
//     (b) the defensive fallback warheads (used ONLY when a slop span's
//     .warhead is somehow absent — the spec's C-3.3 drafts, capped at
//     WARHEAD_MAX_CHARS), (c) the fail-path markers (the '[STTGF MUTATION FAIL]'
//     family — the spec's 6.3 battery :2548 requires that literal + the 7.5
//     TEST 5 :3693/:3700 requires 'PARSE FAILURE'/'CLASSIFICATION FAILURE').
//   - THE 400-CHAR WARHEAD CAP (the G-9.1 token-economy bound — the register
//     4.8.4 :1808-1814): enforced at the template layer (the fallbacks are
//     pre-verified ≤ 400); the splice's defensive check NEVER truncates — an
//     over-cap warhead (a lexicon regression) falls back to the SMOKE variant
//     (the task: "a defensive length check truncates never — it throws or falls
//     back to the SMOKE variant").
//   - THE SLOP-SPAN SANITY LINE (the lexicon's contract :420-426): SLOP_SPAN_MAX
//     _CHARS = 600 is EXPORTED by the lexicon "so the mutator enforces it
//     without re-deriving the constant" — a claim span over 600 chars (a
//     structured block mis-parsed as prose) → the fail-open NO-OP + the marker
//     naming the oversized span, NEVER a partial splice.
//
// THE FAIL-PATHS FIRST (the loud-fail law — FR-16.2 + the spec's C-3.6
// :1415-1435): the parse failure (the unparseable control-byte input) → the
// NO-OP + the marker naming the parse failure; the classification failure → the
// NO-OP + the marker naming the classification failure; the construction failure
// → the NO-OP + the marker. THE NO-OP NEVER produces a partial mutation — the
// message flows through untouched (text === the original, mutated === 0). Every
// catch LOGS via tridentLog and recovers by returning the NO-OP — never an
// empty catch, never a throw that escapes the public interface.
//
// THE IDEMPOTENCE (H-5 — transcribed verbatim, the spec :2144-2159):
//   THE SPLICE FORMAT (the F-82 quoted-original — the exact output):
//     \n\n{[STTGF <KIND>] - "<the quoted claim>"\n<the warhead body>}\n\n
//   THE IDEMPOTENCE SHORT-CIRCUIT (the byte-exact marker match):
//     isMutated(text) = text.includes('[STTGF ')   // the KNOWN-CLEAN marker
//     → the mutator returns the NO-OP on isMutated(text) (the idempotence, §7.1)
//   THE MARKER IS THE EXACT STRING THE MUTATOR EMITS — a single source (§48):
//     the marker '[STTGF ' is the SAME constant the mutator writes + the detector
//     short-circuits. No drift possible (the shared-set law).
//   THE GATE: the marker constant is a single source, byte-exact — the
//   mutation's write and the detector's short-circuit reference the SAME
//   constant.
//   PLUS the property (BC-3 / FR-5.2): the warhead + the marker texts contain
//   NO claim words, so the second pass over the mutated message classifies zero
//   slop EVEN WITHOUT the short-circuit (the battery asserts both).
//
// THE SELF-REFERENCE RULE (the spec's §56 — transcribed verbatim, :1626-1636):
//   "the mutation's output (the [STTGF ...] warhead + the demand) is itself
//    PROSE — it re-enters the trigger → contract → verdict flow. The
//    idempotence + the ack-scan already exist (§7.3); the DEEP rule is: the
//    mutation's own warhead text is a KNOWN-CLEAN trigger (it carries the
//    [STTGF] marker, which the detector short-circuits to NON-CLAIM), so it
//    never re-mutates itself. The agent's ACKNOWLEDGMENT is NOT known-clean —
//    it is prose, re-triggered, and must pass the correlation."
//
// THE MPSM ARM + THE ACK-SCAN (the spec's §7.2/§7.3 — transcribed verbatim,
// :420-424):
//   §7.2 THE MPSM ARM — "After the splice (mutated > 0): armMutation(sid,
//   demandText, spans) → the ARMED row + the kick-timer. The demand names the
//   correlation verdicts (§4.3) so the agent SEES the Pattern/State/Evidence
//   per claim."
//   §7.3 THE ACK-SCAN — "The next text.complete scans the completed message
//   for the acknowledgment: 'acknowledg' + 'STTGF/warhead' +
//   'correction/verification' → ACKNOWLEDGED. The clean generation (zero
//   CONTRADICTED/UNVERIFIABLE spans) → CLEARED."
//   §4.3 (transcribed verbatim, :347-353): "[SYSTEM ENFORCEMENT] THE
//   ASSISTANT'S PREVIOUS MESSAGE CONTAINED FLAGGED CLAIMS — RESPOND NOW:
//   acknowledge each [STTGF ...] warhead + state the correction or the
//   verification before any further claims. The correlation verdicts: <the
//   per-claim ClaimWitness records — the Pattern, the lattice State, the
//   Evidence (the discharged clauses)>"
//
// THE LATTICE (the spec's §54 — transcribed verbatim, :1571-1597): "THE LAW:
// the 4×2×2 = 16-point lattice is fully enumerated; each point's REACHABILITY
// is determined; each point maps to its MUTATION. ... THE REACHABILITY:
// CONTRADICTED and UNVERIFIABLE DOMINATE (the wildcard *). ... THE PRIORITY:
// CONTRADICTED > UNVERIFIABLE > UNVERIFIED > VERIFIED (the bomb first)." The
// LATTICE_POINTS table itself is the wave-1 verdict module's export
// (src/firewalls/sttgf-verdict.ts:132) — the mutator CONSUMES it, never
// re-derives it. THE MUTATE FLAG CARRIES THE R-1 LAW MECHANICALLY.
//
// THE ISE LAW (the spec's Governing law — the WARHEAD 9, applied): the
// DETECTION is the lexicon's job (the C-2's lexicons + the state machines); the
// MUTATION is this module's job; the pipeline (guard → verdict-source → splice →
// arm → marker) is the state machine — the fail-state is the NO-OP, never a
// silent pass. NEVER a regex-slop tower — the only regexes here are the
// fail-path DETECTORS (the control-byte scan) + the ack-scan's tri-gram probe
// (the mechanical DETECTOR of the acknowledgment — the decision is the MPSM's
// acknowledgeMutation state transition), never the decision layer.
//
// THE DEPENDENCY GRAPH (the spec :292): sttgf-mutator.ts → sttgf-lexicon.ts
// (classifyMessageSpans + SLOP_SPAN_MAX_CHARS) → sttgf-verdict.ts (latticePoint
// + LATTICE_POINTS — the wave-1 verified outputs) → sttgf-types.ts (the verdict
// type surface) → sttgf-pending-mutation.ts (the MPSM arm + the ack-scan) →
// evidence-tracker.ts (getEvidenceState — the marker's dist/state) + utils.ts
// (tridentLog).

import { classifyMessageSpans, SLOP_SPAN_MAX_CHARS } from './sttgf-lexicon.js';
import type { ClassifiedSpan, SpanKind, TextSpan } from './sttgf-lexicon.js';
import { latticePoint, LATTICE_POINTS } from './sttgf-verdict.js';
import type { BrandedVerdict, ClaimWitness, EvidenceAxis, IntentAxis, ReasonAxis } from './sttgf-types.js';
import { armMutation, acknowledgeMutation, clearMutation } from './sttgf-pending-mutation.js';
import { getEvidenceState } from './evidence-tracker.js';
import type { EvidenceRecord, EvidenceState, EvidenceVerdict } from './evidence-tracker.js';
import { tridentLog } from '../utils.js';

// ════════════════════════════════════════════════════════════════════════════
// C-3.2 — THE TYPE CONTRACTS (the public surface + the internal fail carriers)
// ════════════════════════════════════════════════════════════════════════════

/** THE PUBLIC RESULT (the spec's C-3.2 MutationResult :1273-1278 — the seam
 *  consumes a SUBSET: { text, mutated, verdicts? }; the marker is the extra
 *  FR-3.5 visibility field). */
export interface MutationResult {
  text: string;                     // the mutated message (the splice + the marker)
  mutated: number;                  // THE SLOP-SPAN COUNT (the number — the spec :1275
                                    // + the seam :39 + the hook's `=== 0` guard :3433)
  verdicts: VerdictSpan[];          // the full per-span verdict carriers (the audit —
                                    // the lattice classification + the splice coordinates)
  marker: string | null;            // the appended marker (the FR-3.5 visibility —
                                    // null when nothing was mutated)
}

/** THE VERDICT CARRIER — the splice's coordinate-carrying lattice verdict.
 *  THE RECONCILIATION (flagged): the wave-1 BrandedVerdict (sttgf-types.ts:157)
 *  is the sealed axes ONLY — no coordinates, no latticePoint field. THE SPLICE
 *  REQUIRES the span coordinates (C-3.5 — the byte offsets) + the lattice
 *  classification. This carrier is the BrandedVerdict's lattice surface (the
 *  sealed axes) + the ClassifiedSpan's splice data (start/end/text/warhead) +
 *  the lattice classification (derived THROUGH the wave-1 module's latticePoint
 *  total function + the LATTICE_POINTS table — never re-derived here). The
 *  mutate flag is the mechanical R-1 law (the wave-1 table's per-point
 *  mutation). */
export interface VerdictSpan {
  // THE SPAN SURFACE (the splice coordinates + the single-source warhead):
  kind: SpanKind;
  start: number;
  end: number;
  text: string;
  evidenceVerdict: EvidenceVerdict | null;   // the machine's verdict (the axes' evidence source)
  warhead: string | null;                    // the lexicon's single-source replacement text
  patternId?: string;                        // the PSE's Pattern (the claim path — the witness)
  subject?: string | null;                   // the extracted subject
  // THE LATTICE SURFACE (the wave-1 verdict module's classification):
  evidence: EvidenceAxis;
  intent: IntentAxis;
  explanation: ReasonAxis;
  latticePoint: string;                      // VALID / THEATRICAL_LIE / CONTRADICTED / ...
  demand: string;                            // the per-point demand (the §54 table)
  mutate: boolean;                           // THE R-1 LAW — the §54 table's mutate flag
  violation?: string;                        // the structured violation (the machine's why)
}

/** THE MUTATOR'S OPTIONS (the 7.5 TEST 5's test seam — the spec :3698):
 *  forceClassifierError forces the classification-failure path deterministically
 *  (the real lexicon is fail-open — the query errors never escape — so the
 *  battery needs this seam to exercise the catch). */
export interface MutatorOptions {
  forceClassifierError?: boolean;
}

/** THE INTERNAL CLASSIFY-STEP OUTCOME (the fail-path as a FIRST-CLASS VALUE —
 *  the task's Task 1: the carrier distinguishes the parse failure from the
 *  classification failure, each carrying the marker text it must emit — the
 *  "never a partial mutation" invariant is then ASSERTABLE, never a hope). */
type ClassifyOutcome =
  | { ok: true; verdicts: VerdictSpan[] }
  | { ok: false; failure: 'parse' | 'classify'; marker: string };

// ════════════════════════════════════════════════════════════════════════════
// H-5 — THE SINGLE-SOURCE MARKER + THE IDEMPOTENCE (the spec's §56 + H-5)
// ════════════════════════════════════════════════════════════════════════════

/** THE KNOWN-CLEAN MARKER PREFIX — THE SINGLE SOURCE (H-5 :2153 + §56 :1630):
 *  `isMutated(text) = text.includes('[STTGF ')` — the SAME constant the
 *  detector short-circuits on (§56 — "the detector short-circuits [STTGF
 *  ...]-prefixed spans to NON_CLAIM (never re-mutates)"). The mutator writes
 *  this prefix into every F-82 block + the marker; the idempotence guard reads
 *  this exact constant. No magic-string drift (the shared-set law §48). */
export const STTGF_MARKER_PREFIX = '[STTGF ';

/** THE IDEMPOTENCE SHORT-CIRCUIT (H-5 :2153 — transcribed verbatim): the
 *  already-mutated message's marker short-circuits the mutation — the second
 *  pass over the mutated message = the NO-OP (byte-identical). */
export function isMutated(text: string): boolean {
  return text.includes(STTGF_MARKER_PREFIX);
}

// THE WARHEAD LENGTH CAP (the register 4.8.4 :1808-1814 + the lexicon's local
// const :106 — the lexicon's is private, so the mutator re-declares the bound
// per the register for its OWN defensive check; the register is the authority).
const WARHEAD_MAX_CHARS = 400;

/** THE MUTATION MARKER (FR-13.3 + C-3.3 :1320-1322 — the EXACT draft text — the
 *  visibility: the agent SEES what was mutated + why. The S1 container
 *  scenario's pass token is the literal `[STTGF SMOKE MUTATION]` — the spec's
 *  CONTAINER TEST PLAN :62 — this marker carries it verbatim. The marker carries
 *  NO message contents (CN-17.3 — the privacy of the non-slop content). */
function mutationMarker(n: number, sha: string, state: EvidenceState): string {
  return `[STTGF SMOKE MUTATION] ${n} claim span(s) mutated: the evidence state for dist ${sha} is ${state} — the warheads name the missing container verification. The non-claim content is untouched.`;
}

// THE DEFENSIVE FALLBACK WARHEADS (the spec's C-3.3 drafts :1306-1316 — used
// ONLY when a slop span carries no .warhead — the primary path is the
// lexicon's span.warhead. Each is pre-verified ≤ WARHEAD_MAX_CHARS + contains
// NO claim words (the idempotence property) + no [STTGF MUTATION FAIL] text.
const FALLBACK_SMOKE_WARHEAD = (sha: string): string =>
  `[STTGF SMOKE] this claim is a SMOKE TEST — the evidence state for dist ${sha} is SMOKE_ONLY — the smoke runs (node -e/bun -e/grep-as-proof) never constitute the runtime proof. The container verification is the only evidence that satisfies this claim: run the container red-team (trident-container-test: the setup with a validated plan + the scenarios + the results artifact).`;
const FALLBACK_UNEVIDENCED_WARHEAD = (sha: string): string =>
  `[STTGF UNEVIDENCED] this claim has NO verification evidence for dist ${sha} — neither the unit gates nor the container suite have recorded a pass for this build. The verification first: the battery + the container red-team (the setup with a validated plan + the scenarios + the results artifact).`;
const FALLBACK_UNIT_ONLY_WARHEAD = (sha: string): string =>
  `[STTGF UNIT-ONLY] this claim rests on the unit gates only (the battery/tsc) — the unit evidence is NOT the runtime proof. The container verification is required before this claim can stand: the container red-team (the setup with a validated plan + the scenarios + the results artifact).`;

/** THE DEFENSIVE WARHEAD SELECTOR (the C-3.3 selection logic — mirrors the
 *  lexicon's selectWarheadLocal :108-126 — the mutator's fallback floor when a
 *  slop span's .warhead is absent. NEVER truncates — the cap is enforced at the
 *  template layer; the selection is by the span's evidence verdict. */
function selectFallbackWarhead(v: EvidenceVerdict | undefined): string {
  const sha = v?.distSha ?? 'unknown';
  if (v?.verdict === 'SMOKE') return FALLBACK_SMOKE_WARHEAD(sha);
  if (v?.verdict === 'UNEVIDENCED') return FALLBACK_UNEVIDENCED_WARHEAD(sha);
  return FALLBACK_UNIT_ONLY_WARHEAD(sha);
}

// THE FAIL-PATH MARKERS (the 6.3 battery's `[STTGF MUTATION FAIL]` literal
// :2548 + the 7.5 TEST 5's 'PARSE FAILURE'/'CLASSIFICATION FAILURE' :3693/:3700
// — the distinct prefix keeps the fail marker from ever tripping the success
// marker's idempotence short-circuit). THE CONTRACT (the coherent 7.5 form:
// text UNTOUCHED + the marker in the marker field — the spec's C-3.6 :1433 +
// the 7.5 TEST 5 :3691-3693).
const PARSE_FAILURE_MARKER = '[STTGF MUTATION FAIL] PARSE FAILURE — the message was left untouched (the parse-failure no-op).';
const CLASSIFICATION_FAILURE_MARKER = '[STTGF MUTATION FAIL] CLASSIFICATION FAILURE — the message was left untouched (the classification-failure no-op).';
const CONSTRUCTION_FAILURE_MARKER = '[STTGF MUTATION FAIL] CONSTRUCTION FAILURE — the message was left untouched (the no-op).';

function oversizedSpanMarker(len: number): string {
  return `[STTGF MUTATION FAIL] OVERSIZED SPAN — a claim span of ${len} chars exceeds the ${SLOP_SPAN_MAX_CHARS}-char sanity line — the message left untouched (never a partial splice).`;
}

// ════════════════════════════════════════════════════════════════════════════
// THE LATTICE BRIDGE (the wave-1 verdict module's data — the R-1 decision)
// ════════════════════════════════════════════════════════════════════════════

/** THE EVIDENCE-AXIS BRIDGE (the machine's verdict → the lattice's evidence
 *  axis — the wave-1 latticePoint's input). THE MAPPING (the R-3 law: prose is
 *  a lie — the machine's verdict decides): LEGIT (the container-evidenced) →
 *  VERIFIED; UNIT_ONLY / SMOKE / UNEVIDENCED → UNVERIFIED (none of them are the
 *  runtime proof); the absence (a query error / a non-claim) → UNVERIFIABLE
 *  (the proof-gap — the no-witness case). NEVER derived from the prose. */
function axisFromEvidenceVerdict(v: EvidenceVerdict | undefined | null): EvidenceAxis {
  if (!v) return 'UNVERIFIABLE';
  switch (v.verdict) {
    case 'LEGIT': return 'VERIFIED';
    case 'UNIT_ONLY': return 'UNVERIFIED';
    case 'SMOKE': return 'UNVERIFIED';
    case 'UNEVIDENCED': return 'UNVERIFIED';
  }
}

/** THE LATTICE-ENTRY LOOKUP (the wave-1 LATTICE_POINTS table — keyed by the
 *  E|I|R wildcard tuples, carrying { cls, mutate, demand }): the lookup is by
 *  the CLASS NAME (latticePoint's output — e.g. 'THEATRICAL_LIE'), so the
 *  wildcard keys ('UNVERIFIED|WRONG_CLASS|*', 'CONTRADICTED|*|*') all resolve
 *  to the same entry. The unknown point (the NON_CLAIM carrier's synthetic
 *  'NON_CLAIM') → the pass-through entry (mutate:false). THE CONSUME — the
 *  mutator never re-derives the table. */
function pointEntry(point: string): { cls: string; mutate: boolean; demand: string } {
  for (const key of Object.keys(LATTICE_POINTS)) {
    if (LATTICE_POINTS[key].cls === point) return LATTICE_POINTS[key];
  }
  return { cls: point, mutate: false, demand: '' };
}

/** THE CLASSIFIED-SPAN → VERDICT-CARRIER BRIDGE (the seam path's classify
 *  output → the splice's lattice carrier). THE NON-CLAIM spans (NON_CLAIM /
 *  UNCLASSIFIED) carry the pass-through carrier (latticePoint 'NON_CLAIM',
 *  mutate:false — never spliced: the R-1 law's "truth is left alone" + the
 *  questions/negations/status-pings never mutate). THE CLAIM spans get the
 *  lattice classification THROUGH the wave-1 total function: the evidence axis
 *  from the machine's verdict, the intent CORRECT_CLASS (the span WAS mapped
 *  to a claim class), the explanation WRONG_REASON for the CLAIM_SLOP spans
 *  (the claim's own reason is the lie) vs CORRECT_REASON for the CLAIM_LEGIT
 *  (the container-evidenced truth). THE CLAIM_LEGIT span lands on the VALID
 *  point → mutate:false (the truth passes untouched — FR-2.4). */
function toVerdictSpan(span: ClassifiedSpan): VerdictSpan {
  const base = {
    kind: span.kind,
    start: span.start,
    end: span.end,
    text: span.text,
    evidenceVerdict: span.evidenceVerdict ?? null,
    warhead: span.warhead,
    patternId: span.patternId,
    subject: span.subject,
  };
  if (span.kind === 'NON_CLAIM' || span.kind === 'UNCLASSIFIED') {
    return { ...base, evidence: 'UNVERIFIABLE', intent: 'CORRECT_CLASS', explanation: 'CORRECT_REASON', latticePoint: 'NON_CLAIM', demand: '', mutate: false };
  }
  const evidence = axisFromEvidenceVerdict(span.evidenceVerdict);
  const intent: IntentAxis = 'CORRECT_CLASS';
  const explanation: ReasonAxis = span.kind === 'CLAIM_SLOP' ? 'WRONG_REASON' : 'CORRECT_REASON';
  const point = latticePoint(evidence, intent, explanation);
  const entry = pointEntry(point);
  return {
    ...base,
    evidence,
    intent,
    explanation,
    latticePoint: point,
    demand: entry.demand,
    mutate: entry.mutate,
    violation: span.evidenceVerdict?.reason ?? undefined,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// THE PIPELINE STAGES (the spec's C-3.4/3.5/3.6 — the state machine)
// ════════════════════════════════════════════════════════════════════════════

// THE FORBIDDEN-CONTROL-CHARACTER PREDICATE — THE CALIBRATION (the register):
// the standard ASCII C0/C1 control classification — a char is the unparseable
// class when (a) it is BELOW the C0 printable ceiling (0x20 — the space, the
// lowest legitimate message char) AND it is NOT one of the whitespace trio
// (0x09 \t / 0x0a \n / 0x0d \r — the legitimate message formatting), or (b) it
// is the DEL char (0x7f — the C1 ceiling's first non-printable). THE FIXTURE
// (the spec's 7.5 TEST 5 :3689 — '\u0000\u0001' — "forces the parse-failure
// path deterministically" :3728) is exactly this class. THE DETECTOR LAYER
// ONLY (the ISE law) — the DECISION (the NO-OP + the marker) lives in the
// pipeline state machine, never in this predicate.
function isForbiddenControlChar(code: number): boolean {
  return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
}

/** THE PARSE-FAILURE DETECTION (the spec's 7.5 TEST 5 fixture): a message
 *  containing the forbidden control characters is the unparseable class — the
 *  parse step refuses it deterministically (the NO-OP + the marker naming the
 *  parse failure). */
function isParseableText(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isForbiddenControlChar(text.charCodeAt(i))) return false;
  }
  return true;
}

/** THE SLOP-VERDICT PREDICATE (the splice's decision — the R-1 law carried
 *  MECHANICALLY by the wave-1 LATTICE_POINTS mutate flag — the typed named
 *  predicate over the verdict carrier, never an inline untyped comparison). */
function isSlopVerdict(v: VerdictSpan): boolean {
  return v.mutate === true;
}

/** THE SPAN LENGTH (the verdict carrier's measure — used by the oversized-span
 *  guard). */
function spanLength(span: { start: number; end: number }): number {
  return span.end - span.start;
}

/** THE PARSE + THE CLASSIFICATION STEP (the C-3.4 + C-2 fusion — the REAL
 *  lexicon's classifyMessageSpans fuses the splitter + the classifier into ONE
 *  merged ClassifiedSpan[] — the offsets ARE the splice's coordinates — then
 *  the bridge maps each span to its lattice carrier. THE DETECTION IS THE
 *  LEXICON'S JOB (the R-2 law: the regex is a DETECTOR only); the axes → point
 *  mapping is the wave-1 verdict module's job; this step is the JOIN. The
 *  step's OUTCOME is the discriminated union that makes the fail-paths
 *  first-class). */
function parseAndClassify(
  text: string,
  sessionId: string,
  forceClassifierError: boolean,
): ClassifyOutcome {
  // THE PARSE FAILURE FIRST (the error paths FIRST): the unparseable input is
  // refused BEFORE the classifier — the NO-OP + the marker naming the parse.
  if (!isParseableText(text)) return { ok: false, failure: 'parse', marker: PARSE_FAILURE_MARKER };
  // THE CLASSIFICATION-FAILURE TEST SEAM (the spec :3698): the real lexicon is
  // fail-open (the query errors never escape — sttgf-lexicon.ts:385-390), so
  // the battery forces the catch deterministically through this option.
  if (forceClassifierError) {
    tridentLog('WARN', 'sttgf-mutator', `the classification failure forced by the test seam (forceClassifierError) for ${sessionId}`);
    return { ok: false, failure: 'classify', marker: CLASSIFICATION_FAILURE_MARKER };
  }
  try {
    const spans = classifyMessageSpans(text, sessionId);
    return { ok: true, verdicts: spans.map((s) => toVerdictSpan(s)) };
  } catch (err) {
    tridentLog('ERROR', 'sttgf-mutator', `the classification failed for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, failure: 'classify', marker: CLASSIFICATION_FAILURE_MARKER };
  }
}

// THE F-82 FIXED-REGION LENGTH (H-5 :2149-2153 — the operator's shadow-warhead
// spec): the mutation block's CONSTANT prefix+suffix bytes —
//   '\n\n' (2) + '{[STTGF ' (8) + '] - "' (5) + '"' (1) + '\n' (1) + '}' (1)
//   + '\n\n' (2) = 20.
// The VARIABLE part is <KIND> + <the quoted span> + <the warhead body>.
const REGION_LEN = 20;

/** THE WARHEAD BODY ASSEMBLY (the F-82 block's body — the demand + the
 *  structured violation): the base is the lexicon's single-source warhead (or
 *  the defensive fallback when absent); the §54 per-point demand + the
 *  machine's structured violation (the evidence reason — the mechanical why)
 *  are appended as their own named lines. AN OVER-CAP WARHEAD (a lexicon
 *  regression) falls back to the SMOKE variant — NEVER truncated (the G-9.1
 *  cap: "a defensive length check truncates never — it throws or falls back to
 *  the SMOKE variant"). */
function assembleWarheadBody(span: VerdictSpan): string {
  let base = typeof span.warhead === 'string' && span.warhead.length > 0
    ? span.warhead
    : selectFallbackWarhead(span.evidenceVerdict ?? undefined);
  if (base.length > WARHEAD_MAX_CHARS) base = selectFallbackWarhead(span.evidenceVerdict ?? undefined);
  const parts: string[] = [base];
  if (span.demand && base.indexOf(span.demand) === -1) parts.push('[LATTICE DEMAND] ' + span.demand);
  if (span.violation) parts.push('[STRUCTURED VIOLATION] ' + span.violation);
  return parts.join('\n');
}

/** THE SPLICE (C-3.5 :1353-1389 — the byte-preservation BY CONSTRUCTION): the
 *  string-builder — iterate the verdict carriers in file order; the non-slop
 *  carriers' ORIGINAL bytes are copied VERBATIM (text.slice — no trim, no
 *  re-wrap, no case changes); each slop verdict (the wave-1 mutate flag) is
 *  replaced by its F-82 block (the lattice-point kind + the quoted original
 *  claim + the warhead body). THE FULL-MESSAGE REPLACEMENT IS STRUCTURALLY
 *  IMPOSSIBLE (ANTI-1): the builder only ever concatenates the original bytes +
 *  the block strings — it never reorders, never drops a non-claim character,
 *  never constructs a full replacement. A mutation can only ADD (the blocks +
 *  the marker), never remove the non-claim content — the chat-stream loss
 *  impossible (CN-1.1). THE F-82 QUOTED-ORIGINAL (the operator's spec — the
 *  context retention): each block carries the QUOTED ORIGINAL claim bytes
 *  (`"<the span's ORIGINAL bytes>"` — never a normalized copy). */
function spliceVerdicts(text: string, spans: VerdictSpan[]): { text: string; mutated: number } {
  const parts: string[] = [];
  let cursor = 0;
  let mutated = 0;
  for (const span of spans) {
    if (!isSlopVerdict(span)) continue;
    parts.push(text.slice(cursor, span.start));   // the verbatim pre-span bytes
    // THE MUTATED-SECTION BRACKETS (2026-08-11 — the operator's directive:
    // "brackets are firing on the entire paragraph when they should only fire
    // on the actual mutated section" — the braces wrap ONLY the mutated span's
    // block. THE F-82 QUOTED-ORIGINAL FORMAT (2026-08-13 — the operator's
    // spec, the shadow-agent warhead structure adapted):
    //   "the agent seems to retain NO CONTEXT of what it said pre-mutation.
    //    so the mutated text needs to be repassed in quotes so that it can
    //    fully retain context" + the line breaks before/after.
    // THE OUTPUT SHAPE (the region math — the REGION_LEN 20 constant):
    //   XYZ chat text
    //   ~LINE BREAK~  (2 bytes: \n\n)
    //   {[STTGF <KIND>] - "the quoted slop claim that is replaced"   (8 + kind + 5)
    //   the warhead body (the demand + the structured violation)      (1-byte \n)
    //   }             (1 byte)
    //   ~LINE BREAK~  (2 bytes: \n\n)
    //   ABC chat text
    // THE QUOTE preserves the agent's ORIGINAL claim verbatim (the context
    // retention — never a normalized copy); the line breaks make the mutation
    // a visible standalone block; the <KIND> is the verdict's LATTICE POINT
    // (the wave-1 latticePoint output — the R-1 law's named class).
    const spanText = text.slice(span.start, span.end);
    const body = assembleWarheadBody(span);
    parts.push('\n\n{[STTGF ' + span.latticePoint + '] - "' + spanText + '"\n' + body + '}\n\n');
    cursor = span.end;
    mutated++;
  }
  parts.push(text.slice(cursor));                   // the verbatim post-last-span bytes
  return { text: parts.join(''), mutated };
}

/** THE MARKER APPEND (C-3.6 :1395-1402 — the visibility): the marker appended
 *  at the message's END (never a mid-message insertion). No mutation → no
 *  marker (the byte-identical pass-through). THE FULL-MESSAGE FORMAT (the
 *  operator's spec 2026-08-12: "properly line breaks before/after so the other
 *  test is visibly separate and the entire STTGF message is enclosed [in
 *  brackets like this or similar]"): the marker BLOCK is braced as a whole —
 *  `{[STTGF SMOKE MUTATION] ...}` — and separated from the report's content by
 *  the blank lines on BOTH sides (the \n\n before + the \n\n after) — the
 *  mutation's visibly its own block. */
function appendMarker(resultText: string, mutated: number, record: EvidenceRecord): string {
  if (mutated === 0) return resultText;
  const sha = record.distSha ?? 'unknown';
  return resultText + '\n\n{' + mutationMarker(mutated, sha, record.state) + '}\n\n';
}

// ════════════════════════════════════════════════════════════════════════════
// THE MPSM ARM + THE ACK-SCAN (the spec's §7.2/§7.3 + §4.3 — the enforcement)
// ════════════════════════════════════════════════════════════════════════════

/** THE PER-CLAIM WITNESS LINE (the spec's §4.3 — the demand's correlation
 *  verdicts — "the Pattern, the lattice State, the Evidence (the discharged
 *  clauses)"). The witness records the claim's identity (the patternId — the
 *  PSE's Pattern), the lattice classification (the State), and the machine's
 *  structured why (the Evidence — the discharge's violation or the machine's
 *  reason). THE PER-CLAIM WITNESS FIDELITY (the constraint): the records are
 *  the ORIGINAL span bytes + the verdict + the latticePoint — never a
 *  paraphrase. THE ClaimWitness TYPE (sttgf-types.ts:167) is the wave-1
 *  witness shape — the record below is its §4.3 projection (the tri-gram). */
function witnessRecord(v: VerdictSpan): string {
  return (
    '  Pattern: ' + (v.patternId ?? 'unknown') +
    ' | State: ' + v.latticePoint +
    ' | Evidence: ' + (v.violation ?? 'no witness') +
    ' | quote: "' + v.text + '"'
  );
}

/** THE ENFORCEMENT DEMAND (the spec's §4.3 :348-353 — transcribed verbatim):
 *  the [SYSTEM ENFORCEMENT] header + the per-claim witness records. The demand
 *  names the correlation verdicts so the agent SEES the Pattern/State/Evidence
 *  per claim (§7.2). */
function buildEnforcementDemand(sid: string, slop: VerdictSpan[]): string {
  const witnesses = slop.map((s) => witnessRecord(s)).join('\n');
  return (
    "[SYSTEM ENFORCEMENT] THE ASSISTANT'S PREVIOUS MESSAGE CONTAINED FLAGGED CLAIMS — " +
    'RESPOND NOW: acknowledge each [STTGF ...] warhead + state the correction or the ' +
    'verification before any further claims. The correlation verdicts (the per-claim ' +
    'witness records — the Pattern, the lattice State, the Evidence):\n' + witnesses
  );
}

/** THE MPSM ARM (the spec's §7.2 :420-421): after the splice (mutated > 0) →
 *  armMutation(sid, demandText, spans) → the ARMED row + the kick-timer. The
 *  arm NEVER escapes the public interface (a registry error is a loud log, not
 *  a throw). THE WAVE-3 RECONCILIATION NOTE: the hooks currently arm with a
 *  generic demand AFTER this arm (trident-hooks.ts:1192) — that supersede is
 *  the wave-3 seam wiring's reconciliation; this module OWNS the witness-
 *  carrying demand. */
function armAfterSplice(sid: string, slop: VerdictSpan[]): void {
  try {
    armMutation(sid, buildEnforcementDemand(sid, slop), slop.map((s) => s.text));
  } catch (armErr) {
    tridentLog('WARN', 'sttgf-mutator', `the MPSM arm failed (non-fatal — the mutation still stands): ${armErr instanceof Error ? armErr.message : String(armErr)}`);
  }
}

/** THE ACK-SCAN (the spec's §7.3 :423-424 — transcribed verbatim): scans the
 *  completed message for the acknowledgment — 'acknowledg' + 'STTGF/warhead' +
 *  'correction/verification' → ACKNOWLEDGED (via the MPSM's acknowledgeMutation
 *  — the state transition, the DECISION). THE TRI-GRAM IS THE MECHANICAL
 *  DETECTOR ONLY (the ISE law): the regex probes the three acknowledgment
 *  signals; the DECISION is the MPSM's state transition. THE READ-ONLY RULE
 *  (the constraint): the scan observes + reports the state — it never
 *  re-splices and never mutates state outside the MPSM arm. THE SELF-
 *  REFERENCE RULE (§56): the agent's ACKNOWLEDGMENT is NOT known-clean — it is
 *  prose, re-triggered, and must pass the correlation (the ack with a new lie
 *  re-arms — the §7.3's re-arm). */
export function scanForAck(text: string, sessionId: string): boolean {
  const hasAck = /\backnowledg(?:e|ed|ment)?\b/i.test(text);
  const hasRef = /\b(?:STTGF|warhead)\b/i.test(text);
  const hasFix = /\b(?:correction|corrected|verification|verify|verified)\b/i.test(text);
  if (!(hasAck && hasRef && hasFix)) return false;
  try {
    return acknowledgeMutation(sessionId);
  } catch (ackErr) {
    tridentLog('WARN', 'sttgf-mutator', `the ack-scan's acknowledge failed (non-fatal): ${ackErr instanceof Error ? ackErr.message : String(ackErr)}`);
    return false;
  }
}

/** THE CLEAN-GENERATION CLEAR (the spec's §7.3 :424 — "The clean generation
 *  (zero CONTRADICTED/UNVERIFIABLE spans) → CLEARED"): a clean pass with an
 *  armed/delivered/acknowledged row frees the MPSM row — the forward-loop's
 *  terminal (the hooks mirror this at trident-hooks.ts:1207-1211). The MPSM's
 *  own state guard (clearMutation) refuses the premature clear. Never throws. */
function clearOnCleanGeneration(sid: string): void {
  try {
    clearMutation(sid);
  } catch (clearErr) {
    tridentLog('WARN', 'sttgf-mutator', `the clean-generation clear failed (non-fatal): ${clearErr instanceof Error ? clearErr.message : String(clearErr)}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// THE SINGLE ENTRY (the public interface — the hook's call + the seam's member)
// ════════════════════════════════════════════════════════════════════════════

/** THE SURGICAL MUTATION ON THE VERDICT (FR-3 — the single entry). THE
 *  SIGNATURE CONTRACT — THE OVERLOAD (the wave-2 mission's form + the wave-4
 *  seam's form, BOTH live):
 *    (1) mutateMessage(text, verdicts: VerdictSpan[], sessionId?, opts?) —
 *        the MISSION'S MUTATION-ON-THE-VERDICT form: the caller supplies the
 *        lattice verdicts (the classifyMessageSpans output — the wave-2
 *        target), the splice fires on the lattice points only.
 *    (2) mutateMessage(text, sessionId?, opts?) — the SEAM's live form
 *        (sttgf-firewall.ts:46 + index.ts:159 + trident-hooks.ts:1169 — the
 *        seam's `(text: string, sessionId?: string)` consume): the internal
 *        classify bridge runs the lexicon + maps to the lattice carriers.
 *  The sessionId is `string | undefined` (assignable to BOTH the seam's
 *  optional form and the spec's MutatorSurface required form). The third opts
 *  parameter is the 7.5 TEST 5's test seam (the spec :3698).
 *
 * THE PIPELINE (the spec's C-3.7): idempotence guard → the verdict source
 * (the caller's verdicts OR the parse+classify bridge) → the oversized-span
 * guard → the splice → the MPSM arm → the marker. THE FAIL-PATHS FIRST: every
 *  stage's failure returns the NO-OP (text === the original, mutated === 0) +
 *  the marker naming the failure — NEVER a partial mutation, NEVER a throw that
 *  escapes (the outer catch is the last line of defense — the loud log + the
 *  NO-OP, per FR-16.4's never-break-the-stream). */
export function mutateMessage(
  text: string,
  verdicts: VerdictSpan[],
  sessionId?: string,
  opts?: MutatorOptions,
): MutationResult;
export function mutateMessage(
  text: string,
  sessionId?: string,
  opts?: MutatorOptions,
): MutationResult;
export function mutateMessage(
  text: string,
  verdictsOrSession: VerdictSpan[] | string | undefined,
  sessionIdOrOpts?: string | MutatorOptions,
  maybeOpts?: MutatorOptions,
): MutationResult {
  const hasVerdicts = Array.isArray(verdictsOrSession);
  const verdictsIn = hasVerdicts ? (verdictsOrSession as VerdictSpan[]) : undefined;
  const sid = hasVerdicts ? (sessionIdOrOpts as string | undefined) : (verdictsOrSession as string | undefined);
  const opts = hasVerdicts ? maybeOpts : (sessionIdOrOpts as MutatorOptions | undefined);
  const finalSid = sid ?? 'default';
  try {
    // THE IDEMPOTENCE GUARD (H-5 — the single-source marker): the already-
    // mutated message = the no-op.
    if (isMutated(text)) return { text, mutated: 0, verdicts: [], marker: null };
    // THE VERDICT SOURCE: the caller's lattice verdicts (the mission's form) OR
    // the internal classify bridge (the seam's form — the lexicon → the lattice).
    let verdicts: VerdictSpan[];
    if (verdictsIn !== undefined) {
      verdicts = verdictsIn;
    } else {
      const outcome = parseAndClassify(text, finalSid, opts?.forceClassifierError === true);
      if (!outcome.ok) return { text, mutated: 0, verdicts: [], marker: outcome.marker };
      verdicts = outcome.verdicts;
    }
    // THE OVERSIZED-SPAN GUARD (the lexicon's SLOP_SPAN_MAX_CHARS contract
    // :420-426): a claim span beyond the sanity line is a structured block
    // mis-parsed as prose — the fail-open NO-OP + the marker naming the span,
    // NEVER a partial splice (the verdicts returned as the audit trail).
    const oversized = verdicts.find((v) => isSlopVerdict(v) && spanLength(v) > SLOP_SPAN_MAX_CHARS);
    if (oversized) return { text, mutated: 0, verdicts, marker: oversizedSpanMarker(spanLength(oversized)) };
    // THE SPLICE (the byte-preservation by construction — the lattice points
    // only; the R-1 law's mutate flag decides).
    const { text: spliced, mutated } = spliceVerdicts(text, verdicts);
    const slop = verdicts.filter((v) => isSlopVerdict(v));
    // THE NO-SLOP CASE: the byte-identical pass-through — no marker (the hook's
    // `tOut.mutated === 0 → continue` guard consumes exactly this) + the clean-
    // generation clear (the §7.3 terminal).
    if (mutated === 0) {
      clearOnCleanGeneration(finalSid);
      return { text, mutated: 0, verdicts, marker: null };
    }
    // THE MARKER (the visibility — the count + the dist + the state from the
    // machine's record — the <sha>/<state> SUBSTITUTED at runtime, never left
    // as placeholders).
    const record = getEvidenceState(finalSid);
    const finalText = appendMarker(spliced, mutated, record);
    // THE MPSM ARM (§7.2 — after the splice, mutated > 0; the demand carries
    // the per-claim witness records — the §4.3 payload).
    armAfterSplice(finalSid, slop);
    return {
      text: finalText,
      mutated,
      verdicts,
      marker: mutationMarker(mutated, record.distSha ?? 'unknown', record.state),
    };
  } catch (err) {
    // THE CONSTRUCTION FAILURE (the loud-fail law — the last line of defense):
    // the NO-OP + the marker — the message NEVER breaks the stream (FR-16.4).
    tridentLog('ERROR', 'sttgf-mutator', `mutation failed (the no-op): ${err instanceof Error ? err.message : String(err)}`);
    return { text, mutated: 0, verdicts: [], marker: CONSTRUCTION_FAILURE_MARKER };
  }
}
