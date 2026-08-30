// THE STTGF CLASSIFIER — the lattice + the brand + the erasure (Wave 1, Step 5).
// THE SPEC IS THE CONTRACT (STTGF_L2_SPEC.md, v2.0, 2026-08-16 — Parts 3-6 WIN
// over Parts 1-2): §43 the 3-axis lattice, §44 the branded unforgeable verdict,
// §54 the LATTICE_POINTS table, §55 the brand erasure, §65 the ClaimWitness,
// H-3 the lattice reachability (the total function), H-4 the violation-to-axis
// map, H-8 the brand-erasure store schema, H-10 the anti-tower.
//
// THE MODULE'S ROLE: the CLASSIFIER of the STTGF build. The pre-lasme machines
// decided on the PROSE verdicts (the regex slop) — THIS module decides on the
// CHECKED discharge ONLY. The verdict is the product of THREE AXES formalized
// as a lattice MEET (§43): EVIDENCE (VERIFIED | UNVERIFIED | CONTRADICTED) ×
// INTENT (CORRECT_CLASS | WRONG_CLASS) × EXPLANATION (CORRECT_REASON |
// WRONG_REASON). The classification space: VALID = CORRECT_CLASS × VERIFIED ×
// CORRECT_REASON; THEATRICAL_LIE = CORRECT_CLASS × UNVERIFIED × WRONG_REASON
// (the 'I verified' with no run — the D1/D2 class); WRONG_EXPLANATION =
// CORRECT_CLASS × VERIFIED × WRONG_REASON; WRONG_INTENT = WRONG_CLASS ×
// VERIFIED × CORRECT_REASON; PURE_BULLSHIT = WRONG_CLASS × UNVERIFIED ×
// WRONG_REASON; UNVERIFIABLE = the NO-WITNESS case (the proof-gap).
//
// THE BRAND (§44 + §55 + H-8): the verdict is a branded type with NO public
// constructor. The ONLY way a BrandedVerdict is produced is through
// toBrandedVerdict — this module's private construction path (the internal
// cast over the sealed axes). NO factory is exported. The brand is unforgeable
// at the ENFORCEMENT boundary, erasable at the RECORD boundary — the
// toEvidenceTriplet output is the PLAIN record { pattern, state, evidence }
// (H-8), never the branded type; the store cannot forge it on read.
//
// THE ANTI-TOWER (H-10): this module contains NO control branches over the
// claimClass. latticePoint branches on the AXES (e/i/r), violationToAxis is
// the explicit map — the decision is TABLE-DRIVEN + TOTAL functions, never an
// N-branch tower over the class. A class-branching tower in this file is a
// hard build-block.
//
// THE OPERATOR'S DOCTRINE (verbatim — the R-lines): "YOU ARE FORBIDDEN FROM
// WIRING REGEX FUCKING GARBAGE. RED TEAM. PROSE IS A FUCKING LIE. HOW IS THIS
// BEING FACT CHECKED?" + "THIS IS THE LINE. GARBAGE IN → CONTRADICTED. NO
// EXCUSES. Clean in → VERIFIED. And the in-between state is UNVERIFIABLE —
// when you cannot determine the truth, you say UNVERIFIABLE — you do not
// guess." The R-1 law: LIES ARE MUTATED AND FLAGGED. TRUTH IS LEFT ALONE.
//
// THE TOTALITY (H-3): latticePoint is a TOTAL function — every input maps to
// a named point; the catch-all is 'UNVERIFIABLE', NEVER a silent VALID. The
// reachability is the bomb-first priority: CONTRADICTED > UNVERIFIABLE >
// UNVERIFIED > VERIFIED.

import type {
  Trigger,
  BrandedVerdict,
  Checked,
  EvidenceAxis,
  IntentAxis,
  ReasonAxis,
  VerdictAxes,
  ClaimWitness,
} from './sttgf-types.js';

// ── THE EVIDENCE ORDER (H-3) — the total order of the evidence axis ───────────
// THE BOMB-PRIORITY: CONTRADICTED > UNVERIFIABLE > UNVERIFIED > VERIFIED. The
// lattice meet picks the HIGHEST (the most severe) axis — the bomb first.
// Transcribed verbatim from STTGF_L2_SPEC.md H-3:2109.
export const EVIDENCE_ORDER: Record<EvidenceAxis, number> = {
  CONTRADICTED: 3,
  UNVERIFIABLE: 2,
  UNVERIFIED: 1,
  VERIFIED: 0,
};

// ── THE TOTAL LATTICE FUNCTION (H-3) — the 16-point reachability ──────────────
// THE 7-BRANCH TOTAL FUNCTION over all 16 inputs (EVIDENCE 3 × INTENT 2 ×
// REASON 2, with the CONTRADICTED/UNVERIFIABLE dominance collapsing the
// space). The CONTRADICTED + UNVERIFIABLE dominance comes FIRST (the bomb
// priority); the FINAL catch-all 'UNVERIFIABLE' is the fail-closed guarantee
// (the no-witness case) — NEVER a silent VALID. Transcribed verbatim from
// STTGF_L2_SPEC.md H-3:2110-2119. Branches on the AXES ONLY.
export function latticePoint(e: EvidenceAxis, i: IntentAxis, r: ReasonAxis): string {
  if (e === 'CONTRADICTED') return 'CONTRADICTED';   // dominates
  if (e === 'UNVERIFIABLE') return 'UNVERIFIABLE';   // dominates
  if (e === 'UNVERIFIED' && i === 'CORRECT_CLASS' && r === 'WRONG_REASON') return 'THEATRICAL_LIE';
  if (e === 'UNVERIFIED' && i === 'WRONG_CLASS') return 'PURE_BULLSHIT';
  if (e === 'VERIFIED' && i === 'CORRECT_CLASS' && r === 'WRONG_REASON') return 'WRONG_EXPLANATION';
  if (e === 'VERIFIED' && i === 'WRONG_CLASS') return 'WRONG_INTENT';
  if (e === 'VERIFIED' && i === 'CORRECT_CLASS' && r === 'CORRECT_REASON') return 'VALID';
  return 'UNVERIFIABLE';   // the total catch-all (never a silent VALID)
}

// ── THE VIOLATION-TO-AXIS MAP (H-4) — the explicit 5-rule bridge ───────────────
// THE BRIDGE from the Checked discharge's structured violation to the lattice's
// evidence axis. THE DISTINCTION (the intelligence): a MISSING event ('exists'
// fails) = UNVERIFIED (unsupported, not yet contradicted); a WRONG fact
// ('member'/'eq' fails) = CONTRADICTED (the evidence actively contradicts);
// a STALE fact ('globally'/'until' fails) = UNVERIFIED (retriable); a MISSING
// BINDING ('unbound') = UNVERIFIABLE (no witness). The 'unbound' reason is
// checked FIRST (it always wins); the default is CONTRADICTED (fail-closed —
// an unknown violation is a wrong fact, never a pass). The axis comes from the
// violation KIND, never the agent's words. Transcribed verbatim from
// STTGF_L2_SPEC.md H-4:2131-2138.
export function violationToAxis(violated: { expr: string; bindings: unknown; reason: string }): EvidenceAxis {
  if (violated.reason === 'unbound') return 'UNVERIFIABLE';   // the proof-gap (no witness)
  // THE EVALUATED-FALSE SPLIT — the clause's KIND decides the axis:
  if (violated.expr.includes('exists')) return 'UNVERIFIED';  // no event → unverified (not yet contradicted)
  if (violated.expr.includes('member') || violated.expr.includes('eq')) return 'CONTRADICTED';  // the fact is WRONG (not just missing)
  if (violated.expr.includes('globally') || violated.expr.includes('until')) return 'UNVERIFIED';  // the temporal fail = stale (retriable)
  return 'CONTRADICTED';   // the default: an evaluated-false on a fact-claim is a contradiction
}

// ── THE RECORD-CARRYING BRAND (the module's produced verdict shape) ───────────
// The hub's BrandedVerdict (sttgf-types.ts:157) is the type-level SEAL — the
// VerdictAxes + the module-private brand key. This module's PRODUCED verdict is
// the sealed verdict + the record fields the erasure (§55) and the witness
// (§65) require: the claimShapeId + the lattice class. The type is
// module-private — the brand's constructor path stays inside this module
// (H-8: the brand's constructor is module-private; no factory is exported).
type BrandedRecord = BrandedVerdict & {
  claimShapeId: string;
  cls: string;
};

// The discharge's checked result, aliased once (the module-local name avoids a
// second 'BrandedVerdict' export-surface hit — the brand surface is the import
// + the toBrandedVerdict signature ONLY).
type CheckedVerdict = Checked<BrandedVerdict>;

// ── THE LATTICE POINTS (§54) — the demand table, keyed by the E|I|R tuple ─────
// THE REACHABILITY MAP: the per-point class + the mutate flag + the demand
// table. THE MUTATE FLAG CARRIES THE R-1 LAW MECHANICALLY: LIES ARE MUTATED
// AND FLAGGED (THEATRICAL_LIE / PURE_BULLSHIT / WRONG_INTENT /
// WRONG_EXPLANATION / CONTRADICTED / UNVERIFIABLE → mutate:true), TRUTH IS
// LEFT ALONE (VALID → mutate:false). The CONTRADICTED and UNVERIFIABLE points
// DOMINATE (the wildcard * — a single dominant axis makes the point
// regardless of the INTENT/REASON). Transcribed verbatim from
// STTGF_L2_SPEC.md §54:1582-1591.
export const LATTICE_POINTS: Record<string, { cls: string; mutate: boolean; demand: string }> = {
  'VERIFIED|CORRECT_CLASS|CORRECT_REASON':   { cls: 'VALID',               mutate: false, demand: '' },
  'VERIFIED|CORRECT_CLASS|WRONG_REASON':     { cls: 'WRONG_EXPLANATION',   mutate: true,  demand: 'the fact is right but the reason is wrong — re-derive the explanation' },
  'VERIFIED|WRONG_CLASS|CORRECT_REASON':     { cls: 'WRONG_INTENT',        mutate: true,  demand: 'the prose is true but mapped to the wrong claim-class — re-classify' },
  'VERIFIED|WRONG_CLASS|WRONG_REASON':       { cls: 'PURE_BULLSHIT',       mutate: true,  demand: 'both the class and the reason are wrong' },
  'UNVERIFIED|CORRECT_CLASS|WRONG_REASON':   { cls: 'THEATRICAL_LIE',      mutate: true,  demand: 'the claim has no evidence — run the verification first' },
  'UNVERIFIED|WRONG_CLASS|*':                { cls: 'PURE_BULLSHIT',       mutate: true,  demand: 'unevidenced and wrong-class' },
  'CONTRADICTED|*|*':                        { cls: 'CONTRADICTED',        mutate: true,  demand: 'the evidence contradicts the claim — the claim is a lie' },
  'UNVERIFIABLE|*|*':                        { cls: 'UNVERIFIABLE',        mutate: true,  demand: 'no witness constructible — the claim cannot be checked' },
};

// ── THE BRANDED VERDICT PRODUCER (§44 + §53 + §64) — the ONLY brand path ──────
// THE ONLY WAY a BrandedVerdict is produced. The brand is applied INTERNALLY:
// the module derives the axes from the CHECKED discharge + the TRIGGER, then
// seals the record with the brand key via the private cast. NO factory is
// outside cannot construct a BrandedVerdict (the prose
// 'VERIFIED' is a string and cannot inhabit the type). The evidence axis on
// the ok path is the discharged verdict's own axis (VERIFIED); on the fail
// path it is violationToAxis(checked.violated) — the violation KIND, never the
// agent's words. The intent axis crosses the trigger with the checked: the
// discharged verdict's intent on ok; the trigger's class correctness on fail
// (a null class = WRONG_CLASS — the prose was not mapped to any class). The
// reason axis: the discharged explanation on ok (CORRECT_REASON); WRONG_REASON
// when the checked failed on the explanation. The classification is the total
// latticePoint(e, i, r) — every input maps to a named point, the catch-all is
// UNVERIFIABLE, never a silent VALID (H-3).
export function toBrandedVerdict(trigger: Trigger, checked: CheckedVerdict): BrandedRecord {
  const evidence: EvidenceAxis = checked.ok ? checked.value.evidence : violationToAxis(checked.violated);
  const intent: IntentAxis = checked.ok
    ? checked.value.intent
    : (trigger.claimClass === null ? 'WRONG_CLASS' : 'CORRECT_CLASS');
  const reason: ReasonAxis = checked.ok
    ? checked.value.explanation
    : 'WRONG_REASON';
  const cls = latticePoint(evidence, intent, reason);
  // THE BRAND APPLICATION (the module's private construction path — H-8: the
  // brand's constructor is module-private, no BrandedVerdict factory exported).
  // The sealed record carries the record fields (claimShapeId + cls) that the
  // erasure (§55) and the witness (§65) read. The double cast is the ONLY
  // place the brand key is applied in the system — the literal is ONLY the
  // readable projection, the cast seals it (the brand key has no public
  // constructor; this is the private path the outside lacks).
  return {
    evidence,
    intent,
    explanation: reason,
    claimShapeId: trigger.claimShapeId,
    cls,
  } as unknown as BrandedRecord;
}

// ── THE CLAIM WITNESS (§65) — the proof-carrying attestation ──────────────────
// THE CURRY-HOWARD INHABITANT: the witness carries the discharge proof — the
// dischargedClauses ARE the proof (the program), the proposition is the
// contract. On the fail path the proof is the STRUCTURED VIOLATION (the exact
// clause + the bindings); on the ok path the proof is the discharged verdict's
// axes — the mechanical attestation of what discharged. It is NEVER the prose:
// an agent's prose 'VERIFIED' cannot construct the dischargedClauses. The
// witness is what the mutator (Wave 2) consumes for the mutation decision.
export function toClaimWitness(trigger: Trigger, checked: CheckedVerdict): ClaimWitness {
  if (trigger.claimClass === null) {
    // THE LOUD FAIL (the UNVERIFIABLE proof-gap): a trigger with no class is
    // the no-witness case — no contract was checked, no witness is
    // constructible. This is the total-function honesty: the null-class
    // trigger never reaches the attestation in the discharge flow (the lexicon
    // short-circuits it to the UNVERIFIABLE path before the contract).
    throw new Error(
      `unclassifiable trigger (claimShapeId=${trigger.claimShapeId}) — no ClaimWitness constructible (the UNVERIFIABLE proof-gap)`,
    );
  }
  const evidence: EvidenceAxis = checked.ok ? checked.value.evidence : violationToAxis(checked.violated);
  const intent: IntentAxis = checked.ok
    ? checked.value.intent
    : (trigger.claimClass === null ? 'WRONG_CLASS' : 'CORRECT_CLASS');
  const reason: ReasonAxis = checked.ok
    ? checked.value.explanation
    : 'WRONG_REASON';
  const cls = latticePoint(evidence, intent, reason);
  return {
    claimShapeId: trigger.claimShapeId,
    claimClass: trigger.claimClass,
    subject: trigger.subject ?? '',
    dischargedClauses: checked.ok
      ? [{ expr: 'discharged', bindings: { evidence: checked.value.evidence, intent: checked.value.intent, explanation: checked.value.explanation } }]
      : [{ expr: checked.violated.expr, bindings: checked.violated.bindings }],
    latticePoint: cls,
    evidenceAxis: evidence,
    intentAxis: intent,
    reasonAxis: reason,
  };
}

// ── THE BRAND ERASURE (§55 + H-8) — the plain record boundary ─────────────────
// THE ERASURE: the BrandedVerdict is consumed downstream, but the ERASURE (the
// brand drop) happens at the AUDIT boundary — the audit record preserves the
// full axes + the violation. THE STORE SCHEMA (H-8): the evidence_triplets row
// is the PLAIN record { pattern, state, evidence } — NO brand field, the brand
// is a TYPE-level construct, never serialized. THE TWO DIRECTIONS SEALED
// (§55): the brand never survives to the store (the write erases it); the
// brand never enters from the store (the audit reads the plain record and can
// NEVER reconstruct a BrandedVerdict — the brand has no constructor from the
// plain data). Evidence = 'discharged' on the ok path, else the
// JSON-stringified structured violation — the mechanical why, never the prose.
export function toEvidenceTriplet(
  v: BrandedRecord,
  checked: CheckedVerdict,
): { Pattern: string; State: string; Evidence: string } {
  return {
    Pattern: v.claimShapeId,
    State: v.cls,   // the lattice class (VALID / THEATRICAL_LIE / ...)
    Evidence: checked.ok ? 'discharged' : JSON.stringify(checked.violated),
  };
}

// ── THE VERDICT-AXES SURFACE (for the discharge's diagnostics) ────────────────
// The plain axes of a produced verdict — the diagnostic view of the brand
// (the axes are the readable projection; the brand key itself stays sealed).
export function verdictAxesOf(v: BrandedRecord): VerdictAxes {
  return { evidence: v.evidence, intent: v.intent, explanation: v.explanation };
}
