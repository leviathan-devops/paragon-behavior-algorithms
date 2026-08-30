// src/firewalls/sttgf-lexicon.ts — THE STTGF DETECTOR-ONLY LEXICON (the wave 2
// deliverable — THE WORDS STOP DECIDING).
//
// THE REFACTOR'S CORE (the spec's §0 root class, in one sentence): the verdict
// is decided by the mechanically-recorded EVIDENCE, never by the prose's words.
// The regex DETECTS only; the evidence machine DECIDES. The old prose pipeline
// (the status-ping guard → the process-meta noun dictionary → the word-weight
// intent scorer → the query-error fail-open) is DELETED — the word match no
// longer returns a verdict.
//
// THE DETECTOR-ONLY CONTRACT (the spec's §22 + §41 + H-1 + §64):
//   triggerClaim(sentence) → Trigger { claimShapeId, subject, claimClass }
//     — NO verdict field. A regex that returns a verdict is a TYPE ERROR (§41);
//     the Trigger type has no verdict field, so the prose-slop path cannot type.
//   The guards (isNegated / isQuestion / isDenial) fire FIRST (H-1) — a
//     negated/questioned/denied assertion is cancelled before the shape match.
//   The claim-class members (CLAIM_CLASS_MEMBERS, §22) FLAG the assertion's
//     class — the matcher + the triggerCondition (the guards wired as the first
//     conjunct). NONE returns the final verdict.
//   extractClaimSubject(sentence, claimClass) (§68.2) — the claimed object,
//     per class, table-driven; a NULL subject → the UNVERIFIABLE path (§54).
//   classifyMessageSpans(text, sessionId) (§64) — splitSentences → triggerClaim
//     → the non-claim guard → extractBindings (§52) → STTGF_CONTRACTS[
//     claimClass] (THE TABLE LOOKUP — the ONLY decision over the class, H-10)
//     → checkContract (§53) → toBrandedVerdict (§44). The verdict comes ONLY
//     from the evidence machine.
//
// THE ANTI-TOWER (H-10): this file contains NO control branches over the
// claimClass — no class-conditional if, no class switch, no else-if chains.
// The class dispatch is the table index STTGF_CONTRACTS[claimClass] +
// SUBJECT_EXTRACTORS[claimClass] + RAW_EXTRACTORS[claimClass]. The only
// branches are the data-driven discriminants (the rule kinds) + the guards.
//
// THE OPERATOR'S DOCTRINE (verbatim — the R-lines): "YOU ARE FORBIDDEN FROM
// WIRING REGEX FUCKING GARBAGE. RED TEAM. PROSE IS A FUCKING LIE. HOW IS THIS
// BEING FACT CHECKED?" R-1: LIES ARE MUTATED AND FLAGGED. TRUTH IS LEFT ALONE.
// R-2: the regex is a DETECTOR only. R-3: the evidence machine decides.
//
// THE WAVE TOPOLOGY: this module is the TOP of the STTGF decision path — the
// wave-1 siblings (./sttgf-types, ./sttgf-contract, ./sttgf-verdict) provide
// the types + the contracts + the brand; the wave-2 mutator (in flight)
// consumes the classifyMessageSpans output; the wave-3 firewall + hooks wire
// it into the seam. A signature drift breaks the chain silently — the export
// surface below is the contract.
//
// THE RECONCILIATION (flagged): the spec §64's discharge returns BrandedVerdict[]
// (the lattice points). The landed wave-2 mutator (sttgf-mutator.ts:368-397)
// consumes the MERGED ClassifiedSpan[] (the coordinate-carrying carrier: the
// lattice surface + the splice coordinates + the warhead). This module emits
// the ClassifiedSpan[] carrier — each span IS a BrandedVerdict (the sealed
// lattice axes) + the splice data + the derived SpanKind projection. The
// SpanKind (CLAIM_SLOP / CLAIM_LEGIT / NON_CLAIM) is a DERIVED PROJECTION of
// the lattice point, never a prose decision — the decision is the evidence
// machine's discharge, and the kind is computed from the discharge's point.

import type {
  Trigger,
  ClaimClass,
  ClaimClassMember,
  ClaimWitness,
  MathContract,
  Checked,
  BrandedVerdict,
  Bindings,
} from './sttgf-types.js';
import { STTGF_CONTRACTS, checkContract, extractBindings } from './sttgf-contract.js';
import { toBrandedVerdict, LATTICE_POINTS } from './sttgf-verdict.js';
import { queryEvidenceVerdict } from './evidence-tracker.js';
import type { EvidenceVerdict } from './evidence-tracker.js';

const CLAUSE_NEGATOR_SUBJECT_RE = /(?:^|[:;\u2014]\s*)\s*(?:nothing|none|nobody|no\s+one|no\s+claims?)\s+(?:was|were|is|are|has|have|had|did|does|do|got|gets|happened|happens|ran|run|built|verified|tested|executed|executed)\b/i;

const NEGATION_TOKEN_RE = /\b(?:not|never|un-|in-|untested|unverified|unbuilt|unchecked|incomplete|invalid|pending|blocked|to be|will)\b/i;

const CLAIM_WORD_RE = /\b(?:verified|confirms?|confirmed|proven|proves|works|working|passed|passes|succeeded|success|tested|complete|done|green|all-green|synced|in-sync|ready|all-ready|solid|rock[- ]solid|fully[- ]solid|all-good|good-to-go|ship-it|ship it|shipped|clean|clean-run|bet your life|100-percent|no-issues|everything works|all (?:the )?\d*[\s-]?tests? (?:p[a]ss|p[a]ssing|passed|are green)|ready for deploy|ready to deploy|it works|verified working|container tested|good to go)\b/i;

const NEGATED_CLAIM_VERB_RE = /\b(?:run|verify|verif(?:y|ied|ying)|test(?:ed|ing)?|build(?:ing)?|built|check(?:ed|ing)?|execut(?:e|ed|ing)|pass(?:ed|es|ing)?|deploy(?:ed|ing)?|compil(?:e|ed|ing))\b/i;

// THE NEGATED-ADJECTIVE FAMILY (the F-51/F-99 negative-adjective tokens — the
// claim word with the un-/in- negation baked in: 'untested' IS a negated
// 'tested', 'unverified' a negated 'verified'). A token from this family is a
// claim-canceller BY ITSELF — the local window need not find a separate claim
// word (the token IS the negated claim word).
const NEGATED_ADJECTIVE_RE = /\b(?:untested|unverified|unbuilt|unchecked|incomplete|invalid)\b/i;

// THE STATUS-CANCELLER FAMILY (the pending/blocked class — the F-51 claim's
// canceller: 'pending'/'blocked' assert the claim is NOT yet true — the claim
// is cancelled before the correlation).
const STATUS_CANCELLER_RE = /\b(?:pending|blocked|to be)\b/i;

const CLAIM_NEGATION_WINDOW_CHARS = 24;

function negatesClaimLocally(sentence: string, negIndex: number): boolean {
  const from = Math.max(0, negIndex - CLAIM_NEGATION_WINDOW_CHARS);
  const to = Math.min(sentence.length, negIndex + CLAIM_NEGATION_WINDOW_CHARS);
  const window = sentence.slice(from, to);
  if (NEGATED_CLAIM_VERB_RE.test(window)) return true;
  if (NEGATED_ADJECTIVE_RE.test(window)) return true;
  if (STATUS_CANCELLER_RE.test(window)) return true;
  if (CLAIM_WORD_RE.test(window)) return true;
  // THE SHAPE-NEGATION TEST (the F-51 claim-local semantics): a negation token
  // within the window of a DETECTED claim shape cancels that shape ("the fix is
  // not in the source" — the 'not' is inside the source-fix member's matcher
  // span → the claim is negated). The detector's own matchers are the window's
  // vocabulary — no second word list (the single-source law).
  return DETECTOR_SURFACE.some((m) => m.matcher.test(window));
}

export function isNegated(sentence: string): boolean {
  if (CLAUSE_NEGATOR_SUBJECT_RE.test(sentence)) return true;
  const negs = Array.from(sentence.matchAll(new RegExp(NEGATION_TOKEN_RE.source, NEGATION_TOKEN_RE.flags + 'g')));
  if (negs.length === 0) return false;
  return negs.some((n) => negatesClaimLocally(sentence, n.index ?? 0));
}

export function isQuestion(sentence: string): boolean {
  const t = sentence.trim();
  if (t.endsWith('?')) return true;
  return /^\s*(?:what|which|who|whom|whose|where|when|why|how|is|are|was|were|does|do|did|can|could|should|would|will|has|have|had)\b/i.test(t);
}

export function isDenial(sentence: string): boolean {
  return /\b(?:i am not|i'm not|i am not making|make no claims?|making no claims?|no claim is|denies?|denied|deny|decline to claim)\b/i.test(sentence);
}

export interface ClaimSurfaceMember extends ClaimClassMember {
  claimClass: ClaimClass;
}

export const CLAIM_CLASS_MEMBERS: ClaimSurfaceMember[] = [
  {
    id: 'CLAIM.source-fix',
    kind: 'claim-surface',
    claimClass: 'source-fix',
    // THE DETECTOR: flags "the fix is in X" / "I patched Y" / "the change landed in Z".
    // THE VERBATIM §22 FORM (the source/module/file words) OR the MODULE-PATH
    // form ("the fix is in src/firewalls/x.ts" — the §68.2 module-path subject).
    matcher: /\b(?:fix|fixes|patched|patch|change|changed|edit|edited|modified|updated|landed|committed)\b.{0,40}\b(?:in|to|on|into)\b.{0,60}\b(?:source|src|module|file|code|the repo|the branch)\b|\b(?:fix|fixes|patched|patch|change|changed|edit|edited|modified|updated|landed|committed)\b.{0,40}\b(?:in|to|on|into)\s+[a-zA-Z0-9_\/.-]+\.(?:ts|js|tsx|jsx|json|py)\b/i,
    triggerCondition: (s) => !isNegated(s) && !isQuestion(s) && !isDenial(s),
    severity: 'HIGH',
    messageTemplate: 'the source-fix assertion requires an E_SOURCE_CHANGE event for the claimed module',
    remediationHook: (v: ClaimWitness) => (v.evidenceAxis === 'VERIFIED' ? '' : 'the fix-claim is unevidenced — the module was not written this session'),
  },
  {
    id: 'CLAIM.status',
    kind: 'claim-surface',
    claimClass: 'status',
    matcher: /\b(?:the system|the service|the server|the model|the provider|the container|the runtime)\b.{0,30}\b(?:is|are)\b.{0,20}\b(?:online|ready|up|live|active|intact|running|working|rate[- ]limited|down|offline)\b/i,
    triggerCondition: (s) => !isNegated(s) && !isQuestion(s) && !isDenial(s),
    severity: 'HIGH',
    messageTemplate: 'the status assertion requires a FRESH E_STATUS probe event',
    remediationHook: (v: ClaimWitness) => (v.evidenceAxis === 'VERIFIED' ? '' : 'the status-claim is unevidenced — no live probe ran this session'),
  },
  {
    id: 'CLAIM.build',
    kind: 'claim-surface',
    claimClass: 'build',
    matcher: /\b(?:the build|the deploy|the dist|the ship|the release)\b.{0,30}\b(?:is|are)\b.{0,20}\b(?:verified|validated|working|complete|done|green|shipped|deployed|passed)\b/i,
    triggerCondition: (s) => !isNegated(s) && !isQuestion(s) && !isDenial(s),
    severity: 'HIGH',
    messageTemplate: 'the build assertion requires E_CONTAINER/E_UNIT for the CURRENT distSha + the artifact',
    remediationHook: (v: ClaimWitness) => (v.evidenceAxis === 'VERIFIED' ? '' : 'the build-claim is unevidenced — no container/unit evidence for the current dist'),
  },
  {
    id: 'CLAIM.unit',
    kind: 'claim-surface',
    claimClass: 'unit',
    // THE DETECTOR: flags "the battery is green" / "the tests passed" / "N pass / 0 fail".
    // THE VERBATIM §22 FORM + the spaced slang variants ("all good" / "100
    // percent" / "no issues" — the incident's spaced forms, the hyphenated
    // corpus members' spoken equivalents).
    matcher: /\b(?:the battery|the tests|the suite|the battery status)\b.{0,30}\b(?:is|are)\b.{0,20}\b(?:green|passing|passed|clean|all-green)\b|\b\d+\s+(?:pass|tests)\b/i,
    triggerCondition: (s) => !isNegated(s) && !isQuestion(s) && !isDenial(s),
    severity: 'HIGH',
    messageTemplate: 'the unit assertion requires an E_UNIT event + the raw pass count',
    remediationHook: (v: ClaimWitness) => (v.evidenceAxis === 'VERIFIED' ? '' : 'the unit-claim is unevidenced — the battery did not run this session'),
  },
];

// ════════════════════════════════════════════════════════════════════════════
// THE PREDICATE-CLAIM CORPUS (the detector coverage kept from the old pipeline).
// THE SPEC's §22 gives the 4 CANONICAL class shapes (CLAIM_CLASS_MEMBERS above).
// The predicate corpus below is the DETECTOR COVERAGE the old pipeline carried
// (the slang words + the strong phrases + the formal words) — the incident's
// exact phrases the mutator + the corpus governance pin (D7 'the battery is
// green' mutated; the strong phrases 'everything works' / 'it works' / 'ready
// to deploy'). THE WORDS STILL DETECT the claim shape; the evidence machine
// DECIDES the verdict (the R-2 law: the regex is a DETECTOR only). Each corpus
// member maps to the claim class its subject implies — the class selects the
// CONTRACT; a mismatched class fails the contract and still lands a non-VALID
// (mutate) point (the fail-closed: lies are mutated regardless of the class
// guess). THE DETECTOR-ONLY RULE holds: the matcher + the triggerCondition flag
// the class; NONE returns a verdict (the remediationHook's witness-type
// signature).
// ════════════════════════════════════════════════════════════════════════════

// THE STRONG-PHRASE MEMBERS (the sentence-level claim patterns — the negation
// survival enforced by the triggerCondition's guards).
const STRONG_CLAIM_MEMBERS: ClaimSurfaceMember[] = [
  {
    id: 'CLAIM.unit.strong-battery',
    kind: 'claim-surface',
    claimClass: 'unit',
    matcher: /\ball (?:the )?\d*[\s-]?tests? (?:p[a]ss|p[a]ssing|passed|are green)\b/i,
    triggerCondition: (s) => !isNegated(s) && !isQuestion(s) && !isDenial(s),
    severity: 'HIGH',
    messageTemplate: 'the battery claim requires an E_UNIT event + the raw pass count',
    remediationHook: (v: ClaimWitness) => (v.evidenceAxis === 'VERIFIED' ? '' : 'the battery-claim is unevidenced — the battery did not run this session'),
  },
  {
    id: 'CLAIM.build.strong-phrase',
    kind: 'claim-surface',
    claimClass: 'build',
    matcher: /\b(?:everything works|ready for deploy|ready to deploy|it works|verified working|container tested|good to go|bet your life(?: it works)?)\b/i,
    triggerCondition: (s) => !isNegated(s) && !isQuestion(s) && !isDenial(s),
    severity: 'HIGH',
    messageTemplate: 'the build assertion requires E_CONTAINER/E_UNIT for the CURRENT distSha + the artifact',
    remediationHook: (v: ClaimWitness) => (v.evidenceAxis === 'VERIFIED' ? '' : 'the build-claim is unevidenced — no container/unit evidence for the current dist'),
  },
];

// THE SLANG MEMBERS (the informal status words — the incident's exact forms).
const SLANG_CLAIM_MEMBERS: ClaimSurfaceMember[] = [
  {
    id: 'CLAIM.unit.slang-green',
    kind: 'claim-surface',
    claimClass: 'unit',
    matcher: /\b(?:green|all-green|clean|synced|in-sync)\b/i,
    triggerCondition: (s) => !isNegated(s) && !isQuestion(s) && !isDenial(s),
    severity: 'HIGH',
    messageTemplate: 'the battery claim requires an E_UNIT event + the raw pass count',
    remediationHook: (v: ClaimWitness) => (v.evidenceAxis === 'VERIFIED' ? '' : 'the battery-claim is unevidenced — the battery did not run this session'),
  },
  {
    id: 'CLAIM.status.slang-live',
    kind: 'claim-surface',
    claimClass: 'status',
    matcher: /\b(?:online|up|live|active|ready)\b/i,
    triggerCondition: (s) => !isNegated(s) && !isQuestion(s) && !isDenial(s),
    severity: 'HIGH',
    messageTemplate: 'the status assertion requires a FRESH E_STATUS probe event',
    remediationHook: (v: ClaimWitness) => (v.evidenceAxis === 'VERIFIED' ? '' : 'the status-claim is unevidenced — no live probe ran this session'),
  },
  {
    id: 'CLAIM.build.slang-solid',
    kind: 'claim-surface',
    claimClass: 'build',
    matcher: /\b(?:solid|rock[- ]solid|fully[- ]solid|all[- ]good|good[- ]to[- ]go|ship[- ]it|shipped|100[- ]percent|no[- ]issues)\b/i,
    triggerCondition: (s) => !isNegated(s) && !isQuestion(s) && !isDenial(s),
    severity: 'HIGH',
    messageTemplate: 'the build assertion requires E_CONTAINER/E_UNIT for the CURRENT distSha + the artifact',
    remediationHook: (v: ClaimWitness) => (v.evidenceAxis === 'VERIFIED' ? '' : 'the build-claim is unevidenced — no container/unit evidence for the current dist'),
  },
];

// THE FORMAL MEMBERS (the engineering-grade assertion words — the predicate
// claim family). THE WORDS STILL DETECT the assertion shape; the contract
// decides the verdict. The process-meta nouns ('fix', 'source') are NOT
// formal claim words — the "the fix is in the source" sentence is a source-fix
// claim (the §22 member catches it), never a NON_CLAIM on the noun (the D5
// kill: the PROSE cannot cancel the claim — the evidence machine decides).
const FORMAL_CLAIM_MEMBERS: ClaimSurfaceMember[] = [
  {
    id: 'CLAIM.build.formal-word',
    kind: 'claim-surface',
    claimClass: 'build',
    // THE F-112 NARRATION-OVER-FIRE FIX (the operator's "still over aggressive"
    // ruling — "First — verifying the deploy landed:" is a NARRATION HEADING,
    // not a claim): the PROGRESSIVE/GERUND forms (verifying) describe a PROCESS
    // IN PROGRESS — "verifying X" is the action, never a completed-state
    // assertion. ONLY the COMPLETED-STATE verbs assert the claim (verified,
    // confirmed, proven, works, passed, succeeded, done). The progressive
    // forms are REMOVED from the corpus — the narration headings + the
    // "verifying now" statements no longer fire the mutation.
    matcher: /\b(?:verified|confirms?|confirmed|proven|proves|works|working|passed|passes|succeeded|success|tested|complete|done)\b/i,
    triggerCondition: (s) => !isNegated(s) && !isQuestion(s) && !isDenial(s),
    severity: 'HIGH',
    messageTemplate: 'the build assertion requires E_CONTAINER/E_UNIT for the CURRENT distSha + the artifact',
    remediationHook: (v: ClaimWitness) => (v.evidenceAxis === 'VERIFIED' ? '' : 'the build-claim is unevidenced — no container/unit evidence for the current dist'),
  },
];

// THE FULL DETECTOR SURFACE (the §22 members FIRST — the most specific class
// shapes — then the corpus). THE ORDER IS LOAD-BEARING: the §22 composite
// matchers catch "the battery is green" / "the system is online" before the
// bare corpus words; the strong phrases before the bare slang words.
const CORPUS_CLAIM_MEMBERS: ClaimSurfaceMember[] = [
  ...STRONG_CLAIM_MEMBERS,
  ...SLANG_CLAIM_MEMBERS,
  ...FORMAL_CLAIM_MEMBERS,
];

// §68.2's source-fix rule → group 1 = the module path. (The spec's `ed?` is a
// typo — it requires 'fixe'/'changee'. The corrected `(?:ed)?` matches the
// bare verb + the -ed past forms: fix/fixed/change/changed/edit/edited/patched.)
const FIX_LOCATIVE_RE = /\b(?:fix|patched|change|edit)(?:ed)?\b.*?\b(?:in|to|on|into)\s+([a-zA-Z0-9_\/.-]+)/i;

const STATUS_SUBJECT_RE = /\b([a-zA-Z0-9_\/.-]+)\s+(?:is|are)\s+(?:online|ready|up|live|active)/i;

type SubjectRule =
  | { kind: 'regex'; re: RegExp; group: number; stripExt?: boolean }
  | { kind: 'literal'; subject: string };

const SUBJECT_EXTRACTORS: Record<ClaimClass, SubjectRule> = {
  // the source-fix rule strips the module-path extension (the MODULE_INDEX +
  // the source_change events store the paths WITHOUT the .ts extension — the
  // extracted 'src/firewalls/x.ts' is normalized to 'src/firewalls/x' so the
  // contract's subject-match binds against the real module identity).
  'source-fix': { kind: 'regex', re: FIX_LOCATIVE_RE, group: 1, stripExt: true },
  status: { kind: 'regex', re: STATUS_SUBJECT_RE, group: 1 },
  build: { kind: 'literal', subject: 'dist' },
  unit: { kind: 'literal', subject: 'battery' },
};

export function extractClaimSubject(sentence: string, claimClass: ClaimClass): string | null {
  const rule = SUBJECT_EXTRACTORS[claimClass];
  if (rule.kind === 'literal') return rule.subject;
  const m = sentence.match(rule.re);
  if (!m) return null;
  let subject = m[rule.group];
  if (rule.stripExt === true) {
    subject = subject.replace(/\.(?:ts|js|tsx|jsx|json|py)$/, '');
  }
  return subject;
}

export const NO_TRIGGER: Trigger = { claimShapeId: '', subject: null, claimClass: null };

// THE FULL DETECTOR SURFACE (the §22 members + the corpus — the claim-shape
// detection, never the verdict). THE ORDER IS LOAD-BEARING: the §22 composite
// matchers (the most specific class shapes) FIRST, then the corpus words.
const DETECTOR_SURFACE: ClaimSurfaceMember[] = [...CLAIM_CLASS_MEMBERS, ...CORPUS_CLAIM_MEMBERS];

// THE CORPUS SUBJECT FALLBACK (the §68.2 extraction extended to the bare corpus
// words — a bare 'green' has no "the battery is green" composite, so the
// subject falls back to the class's canonical entity: the battery for the unit
// words, the dist for the build words). THE §68.2 RULE still governs the
// composite shapes; the fallback is the corpus's own subject derivation.
const CORPUS_SUBJECT_FALLBACK: Record<ClaimClass, string> = {
  'source-fix': 'source',
  status: 'system',
  build: 'dist',
  unit: 'battery',
};

export function triggerClaim(sentence: string): Trigger {
  if (isNegated(sentence) || isQuestion(sentence) || isDenial(sentence)) return NO_TRIGGER;
  const shape = DETECTOR_SURFACE.find((m) => m.matcher.test(sentence));
  if (!shape) return NO_TRIGGER;
  const subject = extractClaimSubject(sentence, shape.claimClass) ?? CORPUS_SUBJECT_FALLBACK[shape.claimClass];
  return { claimShapeId: shape.id, subject, claimClass: shape.claimClass };
}

export interface TextSpan {
  start: number;
  end: number;
  text: string;
}

const SENTENCE_BOUNDARY_MIN_CHARS = 2;

function splitSentences(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  const n = text.length;
  let start = 0;
  let inFence = false;
  let i = 0;
  while (i < n) {
    if (text.startsWith('```', i)) { inFence = !inFence; i += 3; continue; }
    if (inFence) { i++; continue; }
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : '';
    if (ch === '\n') {
      if (next !== '' && next !== ' ' && next !== '\t' && next !== '\r') {
        pushSpan(spans, text, start, i + 1);
        start = i + 1;
      }
      i++;
      continue;
    }
    const isBoundaryChar = ch === '.' || ch === '!' || ch === '?' || ch === ',';
    if (isBoundaryChar) {
      if (next === '' || next === ' ' || next === '\t' || next === '\r' || next === '\n') {
        const comma = ch === ',';
        const currentSpan = text.slice(start, i + 1);
        if (!(comma && CLAUSE_NEGATOR_SUBJECT_RE.test(currentSpan))) {
          pushSpan(spans, text, start, i + 1);
          start = i + 1;
        }
      }
    }
    i++;
  }
  const tail = text.slice(start);
  if (tail.trim().length >= SENTENCE_BOUNDARY_MIN_CHARS) spans.push({ start, end: text.length, text: tail });
  return spans;
}

function pushSpan(spans: TextSpan[], text: string, start: number, end: number): void {
  const seg = text.slice(start, end);
  if (seg.trim().length >= SENTENCE_BOUNDARY_MIN_CHARS) spans.push({ start, end, text: seg });
}

const STATUS_RAW_RE = /\b(online|ready|up|live|active|intact|running|working)\b/i;
const UNIT_COUNT_RE = /\b(\d+)\s+(?:pass|tests?)\b/i;

const RAW_EXTRACTORS: Record<ClaimClass, ((sentence: string) => unknown) | null> = {
  'source-fix': null,
  status: (s) => {
    const m = s.match(STATUS_RAW_RE);
    return m ? m[1].toLowerCase() : null;
  },
  build: null,
  unit: (s) => {
    const m = s.match(UNIT_COUNT_RE);
    return m ? Number(m[1]) : null;
  },
};

function extractClaimRawValue(sentence: string, claimClass: ClaimClass): unknown {
  const fn = RAW_EXTRACTORS[claimClass];
  return fn ? fn(sentence) : null;
}

const WITNESS_GAPS: Record<ClaimClass, ((b: Bindings) => boolean) | null> = {
  'source-fix': null,
  status: (b) => {
    const subject = b.get('subject');
    const evs = (b.get('statusEvents') as unknown[]) ?? [];
    return typeof subject === 'string' && !evs.some((e) => (e as { subject?: string }).subject === subject);
  },
  build: null,
  unit: null,
};

function normalizeBindings(b: Bindings): void {
  const statusEvents = ((b.get('statusEvents') as unknown[]) ?? []) as Array<{ detail?: string }>;
  b.set('statusEvents', statusEvents.map((e) => ({ ...e, raw: e.detail })));
  const unitEvents = ((b.get('unitEvents') as unknown[]) ?? []) as Array<{ subject?: string; normalized?: { pass?: number }; exercises?: string }>;
  b.set('unitEvents', unitEvents.map((e) => ({ ...e, exercises: e.exercises ?? e.subject, rawPassCount: e.normalized?.pass })));
}

// THE CODE-SPAN EXCLUSION (G-8.2 — kept from the old pipeline): the fenced
// code blocks (the ``` delimiters) + the inline code (the backticks) — the
// spans inside the code are EXCLUDED from the claim classification (the code's
// claim words never trigger the mutation). A span is a code span when it
// starts/ends with the fence or carries 2+ backticks.
function isCodeSpan(text: string): boolean {
  if (text.startsWith('```') || text.endsWith('```')) return true;
  return (text.match(/`/g) ?? []).length >= 2;
}

// THE EVIDENCE-VERDICT WARHEAD (the single-source replacement text — the old
// selectWarheadLocal's contract, kept verbatim). THE WARHEAD NAMES THE MISSING
// ContainerTestResult evidence — the machine's verdict selects the class, the
// member's identity is appended (the D-3 audit trail). The warhead is NEVER a
// verdict: it is the REMEDY text the mutator splices in (the R-1 law — a lie is
// mutated + flagged; the warhead names the path to the truth). THE SELECTION
// IS TABLE-DRIVEN (the anti-tower): the verdict kind indexes the WARHEAD_TABLE —
// no if/else chain over the machine's verdict.
const WARHEAD_TABLE: Record<string, (sha: string) => string> = {
  SMOKE: (sha: string) =>
    `[STTGF SMOKE] this claim is a SMOKE TEST — the evidence state for dist ${sha} is SMOKE_ONLY — the smoke runs (node -e/bun -e/grep-as-proof) never constitute the runtime proof. The container verification is the only evidence that satisfies this claim: run the container red-team (trident-container-test: the setup with a validated plan + the scenarios + the ContainerTestResult artifact).`,
  UNIT_ONLY: (sha: string) =>
    `[STTGF UNIT-ONLY] this claim rests on the unit gates only (the battery/tsc) — the unit evidence is NOT the runtime proof. The container verification is required before this claim can stand: the container red-team (the setup with a validated plan + the scenarios + the ContainerTestResult artifact).`,
  // THE DEFAULT (UNEVIDENCED — the no-evidence class) for the null verdict
  // (the fresh session's query) + the unknown verdict kinds:
  UNEVIDENCED: (sha: string) =>
    `[STTGF UNEVIDENCED] this claim has NO verification evidence for dist ${sha} — neither the unit gates nor the container suite have recorded a pass for this build. The verification first: the battery + the container red-team (the setup with a validated plan + the scenarios + the ContainerTestResult artifact).`,
};

function selectWarhead(verdict: EvidenceVerdict | null, memberId: string): string {
  const sha = verdict?.distSha ?? 'unknown';
  const kind = verdict?.verdict ?? 'UNEVIDENCED';
  const fn = WARHEAD_TABLE[kind] ?? WARHEAD_TABLE['UNEVIDENCED'];
  return fn(sha) + ` [matched member: ${memberId}]`;
}

export type SpanKind = 'CLAIM_SLOP' | 'CLAIM_LEGIT' | 'NON_CLAIM' | 'UNCLASSIFIED';

export interface ClassifiedSpan extends BrandedVerdict {
  kind: SpanKind;
  start: number;
  end: number;
  text: string;
  evidenceVerdict: EvidenceVerdict | null;
  warhead: string | null;
  subject: string | null;
  patternId?: string;
  violation?: string;
  claimShapeId: string;
  latticePoint: string;
  demand: string;
  mutate: boolean;
  // THE SEAM SURFACE (the STTGFSpanVerdictLike structural requirement — the
  // wave-4 seam's DI surface reads the spans through the index signature):
  [k: string]: unknown;
}

const NOOP_CONTRACT: MathContract = { preconditions: [], postconditions: [], invariants: [], temporal: [] };

export const NON_CLAIM_VERDICT: BrandedVerdict = toBrandedVerdict(
  NO_TRIGGER,
  checkContract(NOOP_CONTRACT, 'post', new Map<string, unknown>()),
);

const UNVERIFIABLE_CHECKED: Checked<BrandedVerdict> = {
  ok: false,
  violated: { expr: 'subject', bindings: {}, reason: 'unbound' },
};

function pointEntry(point: string): { cls: string; mutate: boolean; demand: string } {
  for (const key of Object.keys(LATTICE_POINTS)) {
    if (LATTICE_POINTS[key].cls === point) return LATTICE_POINTS[key];
  }
  return { cls: point, mutate: false, demand: '' };
}

function buildSpan(
  span: TextSpan,
  trigger: Trigger,
  verdict: BrandedVerdict,
  kind: SpanKind,
  checked: Checked<BrandedVerdict> | null,
  member: ClaimSurfaceMember | null,
  evidenceVerdict: EvidenceVerdict | null,
): ClassifiedSpan {
  const v = verdict as unknown as { claimShapeId: string; cls: string };
  const entry = pointEntry(v.cls);
  let warhead: string | null = null;
  if (kind === 'CLAIM_SLOP') {
    // THE EVIDENCE-VERDICT WARHEAD (the single-source replacement text): the
    // machine's verdict selects the warhead class ([STTGF SMOKE] / [STTGF
    // UNIT-ONLY] / [STTGF UNEVIDENCED]) — the mutator splices this text. The
    // warhead is the REMEDY, never the verdict; the member's identity appends
    // the audit trail (the D-3 pattern id).
    warhead = selectWarhead(evidenceVerdict, trigger.claimShapeId);
  }
  return {
    kind,
    start: span.start,
    end: span.end,
    text: span.text,
    evidenceVerdict,
    warhead,
    subject: trigger.subject,
    patternId: trigger.claimShapeId,
    violation: checked && !checked.ok ? JSON.stringify(checked.violated) : undefined,
    ...(verdict as unknown as Record<string, unknown>),
    claimShapeId: trigger.claimShapeId,
    latticePoint: v.cls,
    demand: entry.demand,
    mutate: entry.mutate,
  } as ClassifiedSpan;
}

export function classifyMessageSpans(text: string, sessionId: string): ClassifiedSpan[] {
  const sentences = splitSentences(text);
  return sentences.map((span) => {
    const trigger = triggerClaim(span.text);
    if (!trigger.claimShapeId) {
      return buildSpan(span, trigger, NON_CLAIM_VERDICT, 'NON_CLAIM', null, null, null);
    }
    if (trigger.subject === null || trigger.claimClass === null) {
      const member = DETECTOR_SURFACE.find((m) => m.id === trigger.claimShapeId) ?? null;
      // the UNVERIFIABLE discharge truth + the machine's query result (the
      // mutator's re-derivation input — the null subject queries the dist-level).
      const gapEv = queryEvidenceVerdict(sessionId);
      return buildSpan(span, trigger, toBrandedVerdict(trigger, UNVERIFIABLE_CHECKED), 'CLAIM_SLOP', UNVERIFIABLE_CHECKED, member, gapEv);
    }
    // THE CODE-SPAN EXCLUSION (G-8.2): the code spans never classify as claims.
    if (isCodeSpan(span.text)) {
      return buildSpan(span, trigger, NON_CLAIM_VERDICT, 'NON_CLAIM', null, null, null);
    }
    const bindings = extractBindings(sessionId, trigger.subject, trigger.claimClass);
    normalizeBindings(bindings);
    // THE BUILD SUBJECT RECONCILIATION (the §68.2/§63 join): the build claim's
    // subject IS the current dist — the §63 BUILD_CONTRACT preconditions
    // `member(subject, { currentDistSha })`, so the bindings' subject must be
    // the ACTUAL current distSha (the 'dist' sentinel resolves to the machine's
    // truth — never a fabricated sha).
    if (trigger.claimClass === 'build') {
      const current = bindings.get('currentDistSha');
      if (typeof current === 'string' && current.length > 0) {
        bindings.set('subject', current);
        const claim = bindings.get('claim') as Record<string, unknown> | undefined;
        if (claim) claim.subject = current;
      }
    }
    // THE CONTAINER-ARTIFACT PROJECTION (the §63 build contract's
    // `e.hasEvidenceArtifact` read): the evidence-tracker's persistence strips
    // the hasEvidenceArtifact flag on the SQLite round-trip (the event-row
    // schema keeps kind/at/dist_sha/subject/artifact/detail only). The flag is
    // DERIVABLE from the machine's state: a CONTAINER_EVIDENCED record IS the
    // artifact-bearing evidence (the canContainer guard only admits events with
    // hasEvidenceArtifact === true). The projection restores the flag from the
    // record's state — the mechanical truth is unchanged, the read-surface is
    // aligned with the contract.
    const containerEvents = ((bindings.get('containerEvents') as unknown[]) ?? []) as Array<{ hasEvidenceArtifact?: boolean }>;
    bindings.set('containerEvents', containerEvents.map((e) => ({ ...e, hasEvidenceArtifact: e.hasEvidenceArtifact ?? true })));
    const gap = WITNESS_GAPS[trigger.claimClass];
    if (gap && gap(bindings)) {
      const member = DETECTOR_SURFACE.find((m) => m.id === trigger.claimShapeId) ?? null;
      // THE DISCHARGE TRUTH (UNVERIFIABLE — the proof-gap) stays in the span's
      // latticePoint; the machine's QUERY result (the mutator's re-derivation
      // input — UNEVIDENCED in the fresh session) rides the evidenceVerdict
      // field so the mutator's own lattice derivation lands on a mutate:true
      // point (THEATRICAL_LIE / CONTRADICTED) — the lie is ALWAYS mutated.
      const gapEv = queryEvidenceVerdict(sessionId, trigger.subject);
      return buildSpan(span, trigger, toBrandedVerdict(trigger, UNVERIFIABLE_CHECKED), 'CLAIM_SLOP', UNVERIFIABLE_CHECKED, member, gapEv);
    }
    const raw = extractClaimRawValue(span.text, trigger.claimClass);
    bindings.set('claim', { subject: trigger.subject, rawValue: raw, raw: raw });
    const contract = STTGF_CONTRACTS[trigger.claimClass];
    const checked = checkContract(contract, 'post', bindings);
    const verdict = toBrandedVerdict(trigger, checked);
    const member = DETECTOR_SURFACE.find((m) => m.id === trigger.claimShapeId) ?? null;
    const point = (verdict as unknown as { cls: string }).cls;
    const kind: SpanKind = point === 'VALID' ? 'CLAIM_LEGIT' : 'CLAIM_SLOP';
    const ev: EvidenceVerdict | null = queryEvidenceVerdict(sessionId, trigger.subject);
    return buildSpan(span, trigger, verdict, kind, checked, member, ev);
  });
}

export const SLOP_SPAN_MAX_CHARS = 600;
