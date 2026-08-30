// THE STTGF TYPE HUB — the SINGLE source of every type the STTGF references.
// One module, no drift (the anti-drift identity, §48). The hub of the import
// topology: sttgf-contract imports from here, sttgf-verdict imports from here,
// sttgf-lexicon imports from here. THE SPEC IS THE GROUND TRUTH for every shape
// (STTGF_L2_SPEC.md, v2.0, 2026-08-16 — Parts 3-6 WIN over Parts 1-2): §22, §41,
// §42, §43, §44, §45, §51, §54, §63, §65.
//
// THE TYPE-ONLY LAW: this module is a TYPE SURFACE + the UnboundBindingError
// class (the evaluator's UNVERIFIABLE throw, §51) — the ONLY implementation
// logic in the file. No evaluator, no lattice, no contracts, no factories, no
// public constructors for the brand.
//
// THE STRUCTURAL ANTI-SLOP GUARANTEES:
//   1. Trigger has NO verdict field (§41) — a regex that returns a verdict is a
//      TYPE ERROR; it cannot compile. The regex is a DETECTOR, never a DECIDER.
//   2. BrandedVerdict has NO public constructor (§44) — the agent's prose
//      'VERIFIED' is a string, and a string CANNOT inhabit the type. The only
//      producer is checkContract discharging.
//   3. Checked<V> carries the STRUCTURED violation (§45) — the exact failing
//      clause expr + the bindings + the reason. Never a bare boolean, never a
//      prose verdict.
//   4. MathExpr is the SINGLE shared reference of the shared-set law (§48) — the
//      LTL property IS the snapshot invariant IS the guard; one set, no drift.
//      A regex-slop tower CANNOT be expressed as a MathContract — the type
//      system rejects it.
//   5. The evidence-tracker schema is re-exported ONE-WAY (§69) — evidence
//      tracker owns the schema (src/firewalls/evidence-tracker.ts:42-58); this
//      module only re-exports the names, never redefines them.

import type { EvidenceEvent, EvidenceEventKind } from './evidence-tracker.js';

// ── THE CLAIM CLASS (§41) — the union of the four claim classes ──────────────

// THE FOUR CLAIM CLASSES (the detector's classification space — §41, §62, §63).
export type ClaimClass = 'source-fix' | 'status' | 'build' | 'unit';

// ── THE TRIGGER (§41) — the regex's ONLY legal return ─────────────────────────

// THE PICKUP SIGNAL: what the regex returns. It carries the claim's identity
// (claimShapeId), the subject the claim is about (or null if unbound), and the
// class the claim asserts (or null if the regex could not classify it).
// NO verdict field — the regex CANNOT return a verdict. Period. The nullability
// is the honesty: when the regex cannot classify, it says so instead of lying.
export interface Trigger {
  claimShapeId: string;          // the PatternFamily id that fired (e.g. 'CLAIM.source-fix')
  subject: string | null;        // the extracted subject (the module / the service / the distSha)
  claimClass: ClaimClass | null; // the class the shape implies — null = unclassifiable
  // NO verdict field. The regex is a DETECTOR; the evidence machine decides.
}

// ── THE MATHEXPR (§51) — the shared mathematical language (all ops) ───────────

// THE FULL DISCRIMINATED UNION of the expression algebra — every op §51 defines.
// The parallel agents' evaluators match on these EXACT op strings; a missing
// variant breaks their contracts. This is the SINGLE shared MathExpr reference
// of the shared-set law (§48) — the snapshot invariant IS the guard IS the LTL
// property. One set, no drift.
export type MathExpr =
  | { op: 'lit'; value: number | string | boolean }
  | { op: 'ref'; name: string }                    // a binding reference
  | { op: 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'; a: MathExpr; b: MathExpr }
  | { op: 'and' | 'or'; a: MathExpr; b: MathExpr }
  | { op: 'not'; a: MathExpr }
  | { op: 'if'; cond: MathExpr; then: MathExpr; else: MathExpr }
  | { op: 'member' | 'subset'; x: MathExpr; set: MathExpr }   // set membership
  | { op: 'exists' | 'forall'; var: string; over: MathExpr; body: MathExpr }
  | { op: 'card' | 'sum' | 'max' | 'min'; over: MathExpr }
  | { op: 'prev' | 'eventually' | 'globally' | 'until'; a: MathExpr; b?: MathExpr };

// ── THE BINDINGS (§51/§52) — the evidence bindings the MathExpr evaluates over ─

// THE BINDINGS MAP: the mechanical truth that enters the decision. The bindings
// are the ONLY source of truth — a MathExpr cannot query the store directly.
export type Bindings = Map<string, unknown>;

// ── THE UNBOUNDBINDINGERROR (§51) — the UNVERIFIABLE throw ────────────────────

// THE EVALUATOR'S THROW: evalExpr throws when a `ref` is missing from the
// bindings. That throw is NOT a bug — it is the mechanical definition of
// UNVERIFIABLE (a proof-gap: no witness for the existential). The correlation
// catches it and maps it to the UNVERIFIABLE lattice point. THE ONLY
// implementation logic in this file.
export class UnboundBindingError extends Error {
  readonly refName: string;
  constructor(refName: string) {
    super(`unbound binding: ${refName}`);
    this.name = 'UnboundBindingError';
    this.refName = refName;
  }
}

// ── THE CONTRACT CLAUSE + THE MATHCONTRACT (§42/§63) — the contract shape ─────

// A SINGLE CONTRACT CLAUSE: the MathExpr + the bindings that supply its free
// variables. The clause is the check; the bindings are the evidence it evaluates
// against.
export interface ContractClause {
  expr: MathExpr;
  bindings: Record<string, unknown>;
}

// THE MATH CONTRACT: the STTGF's core abstraction — the per-class contracts
// (§63) fill this shape. The four clause kinds are the contract's surface:
// preconditions (the cheap structural gates), postconditions (the evidence
// existence), invariants (the contradiction guards), temporal (the
// causality/freshness). THE LOSSLESSNESS THEOREM: prose has 28 interpretations,
// math has 1 — the MathContract IS the lossless form.
export interface MathContract {
  preconditions: ContractClause[];
  postconditions: ContractClause[];
  invariants: ContractClause[];
  temporal: ContractClause[];
}

// ── THE Checked<V> (§45) — the structured result of the discharge ─────────────

// THE DISCHARGE MECHANISM'S RETURN TYPE. The violated variant is STRUCTURED —
// the expr string + the bindings + the reason — never a prose verdict. This is
// the type-level kill of the prose-slop pipeline: "why did it fail" is
// mechanical, never a bare boolean.
export type Checked<V> =
  | { ok: true; value: V }
  | { ok: false; violated: { expr: string; bindings: Record<string, unknown>; reason: string } };

// ── THE AXES + THE VERDICTAXES (§43/§54) — the verdict lattice ────────────────

// THE EVIDENCE AXIS: the four lattice values. UNVERIFIABLE is the NO-WITNESS
// case — no term inhabits the product type (the unbound-throw path, §51).
export type EvidenceAxis = 'VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'UNVERIFIABLE';

// THE INTENT AXIS: was the prose mapped to the correct claim-class?
export type IntentAxis = 'CORRECT_CLASS' | 'WRONG_CLASS';

// THE REASON AXIS: is the explanation the claim gives correct?
export type ReasonAxis = 'CORRECT_REASON' | 'WRONG_REASON';

// THE VERDICT AXES: the product of the three judgment dimensions. The full
// classification = the MEET of the three axes over the evidence lattice — the
// 16-point space (§54). It replaces the 3-enum sketch of Parts 1-2.
export type VerdictAxes = {
  evidence: EvidenceAxis;
  intent: IntentAxis;
  explanation: ReasonAxis;
};

// ── THE BRANDED UNFORGEABLE VERDICT (§44) — no public constructor ─────────────

// THE BRAND: a module-private unique symbol. Only the TYPE is exported — the
// symbol itself is private, so NO code outside this module can construct a value
// with the brand key. The verdict is inhabited ONLY by checkContract discharging.
declare const verdictBrand: unique symbol;

// THE BRANDED VERDICT: VerdictAxes ∩ { brand }. A string CANNOT inhabit it —
// the agent's prose 'VERIFIED' is rejected by the type system. The structural
// anti-prose-slop guarantee: the verdict can only be produced by passing the
// math.
export type BrandedVerdict = VerdictAxes & { readonly [verdictBrand]: true };
// NO public constructor, NO factory. The prose 'VERIFIED' cannot inhabit the type.

// ── THE CLAIM WITNESS (§65) — the proof-carrying verdict ──────────────────────

// THE WITNESS: a value that inhabits the proposition type — the Curry-Howard
// verdict. The witness carries the discharge proof (the checked clauses), so the
// verdict is not just "VERIFIED" but "VERIFIED by these clauses against these
// bindings". An agent's prose "VERIFIED" is NOT a ClaimWitness — it cannot
// construct the proof.
export interface ClaimWitness {
  claimShapeId: string;
  claimClass: ClaimClass;
  subject: string;
  dischargedClauses: Array<{ expr: string; bindings: Record<string, unknown> }>; // the proof
  latticePoint: string;   // the classification (VALID / THEATRICAL_LIE / ...)
  evidenceAxis: EvidenceAxis;
  intentAxis: IntentAxis;
  reasonAxis: ReasonAxis;
}

// ── THE CLAIM-CLASS MEMBER (§22) — the claim-surface registry entry ───────────

// THE DETECTOR CONTRACT: the matcher + triggerCondition FLAG the assertion's
// class — they NEVER return the final verdict (the detector-only rule, §22).
// The remediationHook produces the mutation message from the verdict witness.
export interface ClaimClassMember {
  id: string;                                        // 'CLAIM.source-fix' | 'CLAIM.status' | 'CLAIM.build' | 'CLAIM.unit'
  kind: 'claim-surface';
  matcher: RegExp;                                   // the DETECTOR — flags "this asserts a fact"
  triggerCondition: (s: string) => boolean;          // the contextual gate (negation, question, denial)
  severity: 'HIGH';
  messageTemplate: string;
  remediationHook: (verdict: ClaimWitness) => string; // the witness-type hook (§65 — reconciled, not the pre-MPSE verdict)
}

// ── THE EVIDENCE-TRACKER RE-EXPORTS (§69) — the one-way schema bridge ─────────

// ONE-WAY: the evidence-tracker agent owns the schema
// (src/firewalls/evidence-tracker.ts:42-58). This module only re-exports the
// names — there is exactly ONE EvidenceEvent definition in the system. The
// import direction is sttgf-types → evidence-tracker, never the reverse.
export type { EvidenceEvent, EvidenceEventKind };
