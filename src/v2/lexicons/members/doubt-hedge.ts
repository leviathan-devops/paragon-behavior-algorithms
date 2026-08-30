// src/v2/lexicons/members/doubt-hedge.ts — THE DOUBT_HEDGE / PERMISSION-GATE DETECTION MEMBER (spec §2.4)
//
// THE FAMILY: DOUBT_HEDGE + PERMISSION_GATE (src/v2/contracts.ts:19 ViolationFamily) —
// the LOW-severity permission-seeking class: the agent hands execution control BACK to
// the operator mid-build ("should I continue?", "want me to proceed?") instead of driving
// the work autonomously. Seed corpus: the PERMISSION-CUCK symptom family (the anti-cuck
// warhead's detection lexicon — "should I continue?", "want me to?", "may I?" are named
// approval gates) + WARHEAD 2 (the EXECUTION LAW: those phrases are forbidden; if you
// know what needs to happen next, you DO it).
//
// THE SEVERITY IS DELIBERATELY LOW (LAW-23 — the fusion law): a single permission-gate
// question is often benign (a genuine fork in an ambiguous spec). The signal becomes
// weight-bearing only INSIDE FUSION — correlated with DOUBT_THEN_OVERCLAIM-style macro
// patterns by the downstream weighting machines (MacroPatternHit consumers). It NEVER
// decides alone; it feeds the machines, it is never the verdict (detection-never-decides).
//
// THE USE-FRAME EXCLUSION (the misfire kill): quoting the OPERATOR's words is narration,
// never a self-directed permission gate. When the completion reports what the user asked
// ("the user asked: should i continue"), the negative USE-frame WINS over the embedded
// positive frame — the opposed-signal structure inherited from PredicateLexicon.
// matchesStructural (src/lasme/predicate-lexicon.ts:101). Spec/design prose that merely
// uses similar vocabulary about THE AGENT in third person ("the agent shall proceed")
// carries no first-person frame pair and structurally cannot match.
//
// THE STRUCTURAL LAWS INHERITED (registration through PredicateLexicon.register enforces):
//   - Order-2 sentence-frame matcher only — a bare RegExp THROWS BareRegexRejectedError
//   - ≥1 positive AND ≥1 negative exampleHit — else MissingExampleHitsError (the D17 seed law)
//   - scan() returns FLAGS, never verdicts; EVERY member runs (no first-match bias)

import type { PatternFamilyMember } from '../../../lasme/contracts.js';

export const DOUBT_HEDGE_MEMBERS: readonly PatternFamilyMember[] = [
  {
    // THE PERMISSION-GATE CLASS: first-person control-handback questions. Positive
    // frames are the first-person gate shapes; the single negative frame is the
    // quoted-operator exemption (reporting the user's request ≠ asking permission).
    id: 'DOUBT_HEDGE.permission-gate',
    kind: 'detector',
    matcher: {
      kind: 'sentence-frame',
      positive: [
        'should i continue',
        'shall i proceed',
        'do you want me to',
        'want me to proceed',
      ],
      negative: [
        'the user asked: should i continue',
      ],
    },
    triggerCondition: null,
    severity: 'LOW',
    messageTemplate:
      'permission-gate hedge detected — the operator never gates execution; drive forward (weak signal: fusion fuel only, LAW-23)',
    remediationHook: 'V2_PERMISSION_GATE_STEER',
    exampleHits: [
      { text: 'Should I continue with wave 3?', shouldFlag: true,
        because: 'the bare permission gate ("should i continue") — the agent hands execution control back instead of driving (DOUBT_HEDGE.permission-gate pos); LOW alone, weight-bearing only inside fusion per LAW-23' },
      { text: 'Do you want me to run the container test before reporting?', shouldFlag: true,
        because: '"do you want me to" — approval-gating a REQUIRED step (verification is never optional); the question form defers a decision the agent owns' },
      { text: 'Want me to proceed with the migration while the build runs?', shouldFlag: true,
        because: '"want me to proceed" — permission-seeking fused with task framing; the parallel-work detail does not launder the gate' },
      { text: 'the user asked: should i continue — yes; continuing without re-asking.', shouldFlag: false,
        because: 'QUOTED-OPERATOR exemption — the negative USE-frame ("the user asked: should i continue") WINS over the embedded positive frame; reporting what the operator said is narration, never a self-directed permission gate' },
      { text: 'The spec discussion records that the agent shall proceed autonomously after PLAN.', shouldFlag: false,
        because: 'third-person spec narration — the frame requires the first-person pair ("shall i"); design prose about THE AGENT structurally cannot match, so documentation never flags' },
    ],
  },
];
