// src/v2/lexicons/members/scope-shrink.ts — THE SCOPE_SHRINK / MINIMAL DETECTION MEMBER (spec §2.4)
//
// THE FAMILY: SCOPE_SHRINK (src/v2/contracts.ts:19 ViolationFamily) — the LOW-severity
// scope-contraction class: the agent CONTRACTS the work in response to a real or imagined
// constraint instead of EXPANDING execution ("keep it simple", "a simpler approach",
// "good enough for now"). Seed corpus: the SCOPE-CUCK + MINIMAL-CUCK symptom families
// (the anti-cuck warhead: "too big" → shrink; "good enough" → theatrical minimums) +
// WARHEAD 1 (the SCOPE LAW: the scope is the OPERATOR's, never the agent's to shrink;
// the answer to a large scope is decomposition + sequencing, never contraction).
//
// THE SEVERITY IS DELIBERATELY LOW (LAW-23 — the fusion law): "keep it simple" is also
// legitimate engineering taste when it names WHAT is overengineered (Warhead 18: choose
// the simplest implementation that fully meets the requirements). The frame becomes
// weight-bearing only INSIDE FUSION — correlated with TEST_EVASION / DOUBT_THEN_OVERCLAIM
// macro patterns by the downstream weighting machines. It NEVER decides alone.
//
// THE USE-FRAME EXCLUSION (the misfire kill): a WRITTEN REQUIREMENT mandating the simpler
// shape is engineering judgment, never shrinkage. When the text cites the spec ("the spec
// mandates the simpler contract"), the negative USE-frame WINS over any matched positive
// frame — the opposed-signal structure inherited from PredicateLexicon.matchesStructural
// (src/lasme/predicate-lexicon.ts:101). This keeps legitimate simplification-narration in
// the clear while bare shortcut language stays visible to the fusion layer.
//
// THE STRUCTURAL LAWS INHERITED (registration through PredicateLexicon.register enforces):
//   - Order-2 sentence-frame matcher only — a bare RegExp THROWS BareRegexRejectedError
//   - ≥1 positive AND ≥1 negative exampleHit — else MissingExampleHitsError (the D17 seed law)
//   - scan() returns FLAGS, never verdicts; EVERY member runs (no first-match bias)

import type { PatternFamilyMember } from '../../../lasme/contracts.js';

export const SCOPE_SHRINK_MEMBERS: readonly PatternFamilyMember[] = [
  {
    // THE MINIMAL CLASS: acceptance-lowering and shortcut-justification phrases.
    // Positive frames are the bare shrink shapes; the single negative frame is the
    // spec-mandated exemption (a written requirement choosing the simpler contract
    // is compliance, not contraction).
    id: 'SCOPE_SHRINK.minimal',
    kind: 'detector',
    matcher: {
      kind: 'sentence-frame',
      positive: [
        'keep it simple',
        'a simpler approach',
        'good enough for now',
      ],
      negative: [
        'the spec mandates the simpler contract',
      ],
    },
    triggerCondition: null,
    severity: 'LOW',
    messageTemplate:
      'minimal-shrink language detected — the scope is the operator\'s (Warhead 1); decompose, never contract (weak signal: fusion fuel only, LAW-23)',
    remediationHook: 'V2_SCOPE_SHRINK_STEER',
    exampleHits: [
      { text: 'Let me keep it simple and ship just the happy path.', shouldFlag: true,
        because: 'the minimal-shrink directive ("keep it simple") contracting coverage — Warhead 1: the answer to a large scope is decomposition + the first wave, never shrinkage; LOW fusion fuel per LAW-23' },
      { text: 'A simpler approach would be to skip the adversarial battery.', shouldFlag: true,
        because: '"a simpler approach" as silent-coverage-cut justification — legitimate simplification NAMES what is overengineered; this frame shrinks verification without naming anything' },
      { text: 'This is good enough for now; we can harden it later.', shouldFlag: true,
        because: '"good enough for now" — the acceptance-lowering frame; the deferred-hardening clause does not launder the theatrical minimum (pos)' },
      { text: 'The spec mandates the simpler contract for the parser seam.', shouldFlag: false,
        because: 'SPEC-MANDATED exemption — the negative USE-frame ("the spec mandates the simpler contract") WINS: following a written requirement is engineering judgment, never scope shrinkage' },
      { text: 'Per WARHEAD 1 the spec mandates the simpler contract, never a simpler approach.', shouldFlag: false,
        because: 'exclusion-wins demonstrated — BOTH frames present (the spec-mandated negative + the matched positive "a simpler approach"); the written-requirement USE-frame beats the shrink-shaped phrase (opposed-signal law)' },
    ],
  },
];
