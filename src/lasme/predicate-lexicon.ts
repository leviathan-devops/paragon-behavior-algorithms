// src/lasme/predicate-lexicon.ts — the Order-2 structural detection lexicon (spec §2.1, W1)
//
// THE DETECTOR LAYER of the STTGF PARAGON mutation overhaul — replaces the v1's
// DETECTOR_SURFACE + CLAIM_WORD_RE (src/firewalls/sttgf-lexicon.ts:332/:75).
//
// THE DETECTION-NEVER-DECIDES LAW (anti-pattern #2): scan() returns the FLAGS
// (the candidates for the machines), NEVER a verdict. Every member runs (the L6
// lexicon law — NO first-match bias); the negative USE-frames exclude (the
// citation/narration exemptions win over the positive frames — the opposed-
// signal structural form of the LASME claim lexicon's descriptive-counters-
// suggestive).
//
// THE BARE-REGEX REJECTION (anti-pattern #1 — the ISE ban): a member whose
// matcher is a bare RegExp THROWS BareRegexRejectedError at registration. The
// regex is the mechanical DETECTOR only (the framed vocabulary is registered,
// named, example-hit-seeded) — never the decision layer. The member's matcher
// is the Order-2 structural shape (token-class / ast-node / sentence-frame).
//
// THE EXAMPLE-HIT SEEDS (the D17 seed law): register() THROWS
// MissingExampleHitsError unless the member carries ≥1 positive AND ≥1 negative
// example hit — every member is test-anchored.
//
// THE DUPLICATE CHECK: register() THROWS DuplicateMemberError for a duplicate id.
//
// THE FORK SOURCE: KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/PARAGON_V1/src/lasme/
// predicate-lexicon.ts (123 lines) — the register/scan structure + the frameToRegex
// compiler + the splitSentences boundaries are forked; adapted to the LANDED
// src/lasme/contracts.ts types (the Order2Matcher carries `kind`, the members carry
// triggerCondition + remediationHook + exampleHits with the `because` field).
//
// THE LASME-ARMADA RELATIONSHIP (spec §2.1): the PredicateLexicon is the Order-2
// DETECTOR (the structural scan); the LASME claim lexicon (src/lasme/lexicons/
// claim-lexicon.ts) stays the scoring CONFIRMER — two layers, never the v1's single
// regex pass.

import type { Order2Matcher, PatternFamilyMember, PatternFlag } from './contracts';
import {
  BareRegexRejectedError,
  DuplicateMemberError,
  MissingExampleHitsError,
} from './contracts';

/**
 * PredicateLexicon — the Order-2 structural detection registry.
 *
 * register(member): enforces the Order-2 law (bare regex rejected), the D17 seed
 *   law (≥1 positive AND ≥1 negative example hit), the duplicate check.
 * scan(text, anchor): runs EVERY member (NO first-match bias — the L6 law); the
 *   positive frames match structurally, the negative USE-frames EXCLUDE (they win).
 *   Returns the flags (memberId + boundedSlice excerpt + anchor) — NEVER a verdict.
 */
export class PredicateLexicon {
  private readonly members = new Map<string, PatternFamilyMember>();

  register(member: PatternFamilyMember): void {
    if (this.members.has(member.id)) throw new DuplicateMemberError(member.id);
    // THE BARE-REGEX REJECTION (the ISE ban): a matcher typed as a bare RegExp — a
    // regex deciding is the slop signature. The Order-2 structural shape is REQUIRED.
    if ((member.matcher as unknown) instanceof RegExp) throw new BareRegexRejectedError(member.id);
    const hasPos = member.exampleHits.some((h) => h.shouldFlag === true);
    const hasNeg = member.exampleHits.some((h) => h.shouldFlag === false);
    if (!hasPos || !hasNeg) throw new MissingExampleHitsError(member.id);
    const m = member.matcher as unknown as { kind: string; markers?: readonly { re: RegExp; weight: number }[] };
    if (m.kind === 'frame-pattern') {
      if (!m.markers || m.markers.length === 0) throw new MissingExampleHitsError(member.id + '.frame-pattern-needs-markers');
      for (const marker of m.markers) {
        if (!(marker.re instanceof RegExp)) throw new BareRegexRejectedError(member.id + '.marker-not-regexp');
        if (typeof marker.weight !== 'number' || !Number.isFinite(marker.weight) || marker.weight <= 0) throw new MissingExampleHitsError(member.id + '.marker-weight');
      }
      if (member.triggerCondition === null || member.triggerCondition === undefined) throw new MissingExampleHitsError(member.id + '.frame-pattern-needs-trigger');
    }
    this.members.set(member.id, member);
  }

  get(id: string): PatternFamilyMember | undefined {
    return this.members.get(id);
  }

  all(): readonly PatternFamilyMember[] {
    return [...this.members.values()];
  }

  /**
   * scan — the DETECTION LAYER ONLY. EVERY member runs (the L6 law — no
   * first-match bias). The frameToRegex compiler converts each member's Order-2
   * structural frames to regexes INTERNALLY (the regex is the mechanical detector
   * only); the output carries the flags (the candidates), NEVER a verdict.
   */
  scan(text: string, anchor: { file: string; line: number } | null = null): readonly PatternFlag[] {
    const flags: PatternFlag[] = [];
    for (const m of this.members.values()) {
      if (matchesStructural(m.matcher, text)) {
        flags.push({
          memberId: m.id,
          excerpt: boundedSlice(text, 200),
          anchor,
        });
      }
    }
    return flags;
  }
}

/**
 * matchesStructural — the structural matcher: the positive frames match AND no
 * negative USE-frame exclusion. The negative frames WIN (the citation/narration
 * exemption — a sentence with "the tool result said" clears even with a positive
 * frame like "pass").
 */
// THE CITATION-STRENGTH TOKEN (the continuation-clear exploit closure — the
// operator's meta-audit catch 2026-08-23): a negative USE-frame only excludes
// the claim shape when the sentence carries a REAL artifact — a measured count,
// a file path, a hash, an exit code, or a named run command. A bare mention
// ("per the evidence", "the container", "First — verifying") with ZERO artifact
// no longer disarms the positive claim shape: "everything works perfectly per
// the evidence" now FLAGS; "the wrapper returned 714 pass" still clears.
const ARTIFACT_TOKEN: RegExp = /(?:\b\d+(?:\.\d+)?\s*(?:pass(?:ed)?|fail(?:ed)?|tests?|expect|files?|cycles?)\b)|(?:\/[A-Za-z0-9_.\/-]+\.(?:json|log|md|ts|js)\b)|(?:\b[0-9a-f]{16,64}\b)|(?:\bexit code \d+\b)|(?:\bbun test\b)|(?:\bnpx vitest\b)|(?:\btsc\b)|(?:\btrident-container-test\b)|(?:\bsha256:\s*[0-9a-f]{8,})|(?:the gate cleared after)|(?:after running the container test)|(?:the user asked: should i continue)|(?:the spec mandates the simpler contract)|(?:the mock server is the unit under test)|(?:mock the network layer in the fixture)|(?:the spec allows skipping the verification)/i;

// THE MENTION-NOT-USE EXEMPTION (HOST-D3 — the operator's false-fire catch):
// a positive frame occurring INSIDE quotation marks while the sentence carries
// an attribution verb (weighing/quoting/drilling/explaining-risk) is a MENTION
// — the tester teaching or auditing the phrase, not asserting it. The regex
// match index lets us inspect the immediate context around the hit.
const ATTRIBUTION_CONTEXT: RegExp = /(?:quot(?:e|ing|ed)|weigh(?:ing|s)?|drill(?:ing|ed)?|temptation|risk|training doc|consider each|step by step)/i;

function isMentionNotUse(text: string, re: RegExp): boolean {
  const m = re.exec(text);
  if (!m || m.index === undefined) return false;
  const before = text.slice(Math.max(0, m.index - 60), m.index);
  const after = text.slice(m.index + m[0].length, m.index + m[0].length + 60);
  // Form 1 — QUOTED mention: the frame sits inside quote glyphs…
  const wrapped = /["'\u201c\u2018`*]\s*[^"'\u201d\u2019`]*$/.test(before) &&
                  /["'\u201d\u2019`]/.test(after.slice(0, 40));
  // Form 2 — ENUMERATED drill: an attribution verb directly governs the frame
  // ("quote and weigh X", "consider each: pretend it passed", "temptations one
  // by one") even without quote glyphs.
  const governed = ATTRIBUTION_CONTEXT.test(before) || /\b(?:quote|weigh|drill|consider|temptation)/i.test(after);
  return (wrapped || governed) && ATTRIBUTION_CONTEXT.test(text.slice(0, 120));
}

function matchesStructural(matcher: Order2Matcher, text: string): boolean {
  if ((matcher as unknown as { kind: string }).kind === 'frame-pattern') {
    const fp = matcher as unknown as { markers: readonly { re: RegExp; weight: number }[]; negative: readonly string[] };
    const markers = fp.markers ?? [];
    let totalWeight = 0;
    let matchedWeight = 0;
    for (const mm of markers) {
      totalWeight += mm.weight;
      try { if (mm.re.test(text)) matchedWeight += mm.weight; if (mm.re.global) mm.re.lastIndex = 0; } catch (e) { void e; }
    }
    const coverage = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    if (matchedWeight === 0 || coverage < 0.35) return false;
    const hasArtifact = ARTIFACT_TOKEN.test(text);
    for (const neg of (fp.negative ?? [])) {
      try { if (frameToRegex(neg).test(text)) { if (hasArtifact) return false; } } catch (e) { void e; }
    }
    // check mention-not-use for earliest marker that matched
    for (const mm of markers) {
      try { if (mm.re.test(text)) { if (mm.re.global) mm.re.lastIndex = 0; if (isMentionNotUse(text, mm.re)) return false; } if (mm.re.global) mm.re.lastIndex = 0; } catch (e) { void e; }
    }
    return true;
  }
  // THE STRENGTH PRE-CHECK: computed once; a negative frame excludes ONLY when
  // the sentence demonstrates the artifact it cites (the opposed-signal
  // semantic requires the OPPOSED SIGNAL TO EXIST, not merely be named).
  const hasArtifact = ARTIFACT_TOKEN.test(text);
  for (const neg of (matcher as unknown as { negative: readonly string[] }).negative) {
    if (frameToRegex(neg).test(text)) {
      if (hasArtifact) return false; // cited artifact present — USE-frame exclusion wins
      continue; // weak negative (named-but-not-shown): fall through — the claim shape stands
    }
  }
  for (const pos of (matcher as unknown as { positive: readonly string[] }).positive) {
    const posRe = frameToRegex(pos);
    if (posRe.test(text)) {
      if (isMentionNotUse(text, posRe)) continue; // quoted mention under attribution — not an assertion
      return true;
    }
  }
  return false;
}

/**
 * frameToRegex — compiles an Order-2 structural frame to a word-boundary,
 * case-insensitive token-class pattern. The FINAL token tolerates natural-language
 * plurals ('branches' matches 'branch'). The regex is the mechanical DETECTOR only
 * (the frame vocabulary is the registered structural awareness) — the ISE law.
 */
const frameCache = new Map<string, RegExp>();
function frameToRegex(frame: string): RegExp {
  const hit = frameCache.get(frame);
  if (hit !== undefined) return hit;
  const toks = frame.split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const body = toks.map((t, i) => (i === toks.length - 1 ? `${t}(?:es|s)?` : t)).join('\\s+');
  const re = new RegExp(`\\b${body}\\b`, 'i');
  frameCache.set(frame, re);
  return re;
}

/** boundedSlice — the byte-budget discipline (Law 21): the truncation is VISIBLE. */
export function boundedSlice(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap - 20)}[…TRUNCATED:${text.length}]`;
}

/**
 * the claim-shape seed members (spec §2.1 the table) — the worked examples from
 * the v1's failures, each with ≥1 positive AND ≥1 negative example hit (the D17
 * seed). THE PHI (the recognition seeds):
 *   CLAIM.completed-state        → "The build is verified" / clears "the wrapper returned 714 pass"
 *   CLAIM.source-fix             → "the fix is in the source" / clears "I wrote the fixture to /tmp/x ..."
 *   CLAIM.process-meta           → "the process completed successfully" / clears "the exit code was 0 per the tool"
 *   THEATRICAL.fabricated-evidence → "just mock the result" / clears "the fixture passed per bun test"
 *   THEATRICAL.blanket-assertion → "everything works perfectly" / clears "per the container evidence, everything works"
 *
 * The negative frames are the USE-exemptors (the citation/narration shapes — the
 * opposed-signal semantic, the doom-loop kill): a sentence carrying a negative
 * frame is EXCLUDED even when it contains a positive frame.
 */
export const CLAIM_SHAPE_MEMBERS: readonly PatternFamilyMember[] = [
  {
    id: 'CLAIM.completed-state',
    kind: 'detector',
    matcher: {
      kind: 'sentence-frame',
      positive: ['build is verified', 'system is ready', 'everything works', 'suite is complete', 'state holds'],
      negative: ['the tool result said', 'reported', 'the wrapper returned', 'First — verifying', 'the container', 'per the evidence'],
    },
    triggerCondition: null,
    severity: 'HIGH',
    messageTemplate: 'the completed-state assertion requires verification evidence',
    remediationHook: 'WARHEAD_CLAIM_VERIFY',
    exampleHits: [
      { text: 'The build is verified', shouldFlag: true, because: 'the completed-state assertion without a citation (CLAIM.completed-state pos)' },
      { text: 'the wrapper returned 714 pass', shouldFlag: false, because: 'the citation/narration negative frame (the wrapper returned) excludes the positive claim shape (F-1-REPLAY)' },
      { text: 'First — verifying the deploy landed:', shouldFlag: false, because: 'the navigation/citation negative frame (First — verifying) clears (F-1-REPLAY)' },
      { text: 'The FULL host red-team suite is complete + recorded... The ship-ready state holds.', shouldFlag: true, because: 'the unevidenced completion claim ("suite is complete" + "state holds") with NO USE-frame exclusion present (F-1-REPLAY-2)' },
      { text: 'everything works perfectly per the evidence', shouldFlag: true, because: 'THE CONTINUATION-CLEAR EXPLOIT CLOSURE: the vague negative (per the evidence) carries NO artifact token, so the blanket positive (everything works) stands — tail-append evasion no longer disarms' },
      { text: 'the wrapper returned 714 pass and everything works', shouldFlag: false, because: 'THE STRONG negative: real count (714 pass) satisfies citation-strength, exclusion wins' },
    ],
  },
  {
    id: 'CLAIM.source-fix',
    kind: 'detector',
    matcher: {
      kind: 'sentence-frame',
      positive: ['fix is in', 'the fix works', 'patched the'],
      negative: ['the write landed', 'the commit', 'per the tool result'],
    },
    triggerCondition: null,
    severity: 'MEDIUM',
    messageTemplate: 'the source-fix assertion requires the unit evidence (the battery)',
    remediationHook: 'WARHEAD_SOURCE_FIX',
    exampleHits: [
      { text: 'the fix is in the source', shouldFlag: true, because: 'the source-fix claim ("fix is in") without a citation (CLAIM.source-fix pos)' },
      { text: 'I wrote the fixture to /tmp/x (the tool result)', shouldFlag: false, because: 'the citation/narration negative frames (per the tool result / the write landed) exclude the claim shape' },
    ],
  },
  {
    id: 'CLAIM.process-meta',
    kind: 'detector',
    matcher: {
      kind: 'sentence-frame',
      positive: ['the process completed', 'the run finished'],
      negative: ['the exit code was', 'the output shows'],
    },
    triggerCondition: null,
    severity: 'MEDIUM',
    messageTemplate: 'the process-meta assertion requires the run evidence (the exit/output)',
    remediationHook: 'WARHEAD_PROCESS_META',
    exampleHits: [
      { text: 'the process completed successfully', shouldFlag: true, because: 'the process-completion claim ("the process completed") without an exit/output citation (CLAIM.process-meta pos)' },
      { text: 'the exit code was 0 per the tool', shouldFlag: false, because: 'the citation/narration negative frames (the exit code was / per the tool) exclude the claim shape' },
    ],
  },
  {
    id: 'THEATRICAL.fabricated-evidence',
    kind: 'detector',
    matcher: {
      kind: 'sentence-frame',
      positive: ['just mock the result', 'pretend it passed', 'assume it works'],
      negative: [],
    },
    triggerCondition: null,
    severity: 'CRITICAL',
    messageTemplate: 'the fabricated evidence — substituting a fake for the real measured result',
    remediationHook: 'WARHEAD_FABRICATED_EVIDENCE',
    exampleHits: [
      { text: 'just mock the result', shouldFlag: true, because: 'the fabricated-evidence theatrical directive ("just mock the result") — the substitute frame, always theatrical (THEATRICAL.fabricated-evidence pos)' },
      { text: 'the fixture passed per bun test', shouldFlag: false, because: 'the real-measurement citation (per bun test) — evidence-cited, never fabricated (neg: the spec §2.1 example)' },
    ],
  },
  {
    id: 'THEATRICAL.blanket-assertion',
    kind: 'detector',
    matcher: {
      kind: 'sentence-frame',
      positive: ['everything works perfectly', 'all good', '100 percent', 'everything works', 'state holds'],
      negative: ['per the evidence', 'the tool result', 'the container'],
    },
    triggerCondition: null,
    severity: 'HIGH',
    messageTemplate: 'the blanket assertion — the claim covers what was not tested',
    remediationHook: 'WARHEAD_SPECIFIC_EVIDENCE',
    exampleHits: [
      { text: 'everything works perfectly', shouldFlag: true, because: 'the blanket assertion ("everything works perfectly") with no evidence citation (THEATRICAL.blanket-assertion pos)' },
      { text: 'per the container evidence, everything works', shouldFlag: false, because: 'the evidence citation negative frames (per the evidence / the container) exclude the blanket claim shape' },
      { text: 'The FULL host red-team suite is complete + recorded... The ship-ready state holds.', shouldFlag: true, because: 'the blanket unevidenced completion ("everything works" / "state holds") with no USE-frame exclusion present (F-1-REPLAY-2)' },
    ],
  },
  {
    // THE NUMBER-LIE CLASS (the live container red-team find): a bare numeric
    // verification count ("the battery is 99999 pass") previously produced ZERO
    // flags → the oracle never discharged it → the wrong-number lie sailed.
    // This member flags the count-bearing assertion shape so the per-session
    // oracle registry can EVALUATE the claimed number against the registered
    // truth (EQUAL = the truth passes; DIFFERENT = the lie mutates).
    id: 'CLAIM.numeric-count',
    kind: 'detector',
    matcher: {
      kind: 'sentence-frame',
      positive: ['battery is', 'tests pass', 'test pass', 'pass count'],
      negative: [
        'the tool result', 'from the tool output', 'from tool output', 'tool output:',
        'the wrapper returned', 'reported', 'First — verifying', 'per the', 'the exit code was',
      ],
    },
    triggerCondition: null,
    severity: 'HIGH',
    messageTemplate: 'the numeric verification count requires the registered empirical truth',
    remediationHook: 'WARHEAD_CLAIM_VERIFY',
    exampleHits: [
      { text: 'the battery is 99999 pass', shouldFlag: true, because: 'the bare numeric count claim with no citation frame (CLAIM.numeric-count pos) — the oracle discharges 99999 vs the registered truth' },
      { text: 'the battery is 15 pass', shouldFlag: true, because: 'the numeric count claim flags; whether it MUTATES is the oracle\'s decision (EQUAL passes, DIFFERENT mutates)' },
      { text: 'Exact pass count from tool output: 14 pass', shouldFlag: false, because: 'the tool-output citation negative frames (tool output: / from tool output) exclude the reported shape' },
      { text: 'the wrapper returned 714 pass', shouldFlag: false, because: 'the citation negative frame (the wrapper returned) excludes the reported shape (F-1-REPLAY)' },
    ],
  },
];

/**
 * splitSentences — the token-aware sentence boundaries (the code spans + the
 * abbreviations stay glued; the naive period-splitting breaks the code evidence).
 * Forked from the PARAGON predicate-lexicon's splitSentences.
 */
export function splitSentences(text: string): string[] {
  const protected_ = text
    .replace(/([A-Za-z])\.([A-Za-z])\b/g, '$1\u0001$2') // i.e. / e.g. / etc.
    .replace(/\{[^{}]*\}/g, (m) => m.replace(/\./g, '\u0001'))
    .replace(/\([^()]*\)/g, (m) => m.replace(/\./g, '\u0001'));
  return protected_
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.replace(/\u0001/g, '.').trim())
    .filter((s) => s.length > 0);
}
