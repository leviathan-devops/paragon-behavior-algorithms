// src/subagents/trident-bug-hunter/lexicon/rule-card.ts
// THE RULE-CARD EXTRACTOR (W4, spec §3.8 lines 1137-1208). The corpus docs →
// the rule cards: the verbatim quotes + the file:line anchors + the
// classifications + the severities, with the D13 law applied MECHANICALLY (K3.2).
// This is the boundary where the prose becomes structured — a rule that cannot
// be quoted is PROPOSED (the operator curates), never silently classified.
//
// THE DETECTOR-vs-DECISION LAW (the ISE law): the regexes below are the
// mechanical DETECTION layer ONLY (the quote markers, the soft-voice lexicon,
// the classification keyword lexicons — they NAME a candidate, they never decide).
// The DECISION layer is the keyword-family VOTE (a deterministic count + argmax)
// + the deterministic severity rating — the classification is a lexicon + an
// algorithm over it, never a regex tower that decides on a single match.
//
// THE DETERMINISM LAW (K20.3): the extraction is a pure function of the corpus
// bytes — the same corpus text ALWAYS produces the same cards in the same order
// (content-addressed, no nondeterminism, no timestamps).

import fs from 'node:fs';
import { SEVERITIES, type Severity } from '../../../shared/knowledge-graph/db.ts';
import { LexiconError } from './templates.ts';

// ---------------------------------------------------------------------------
// The typed shape (spec §3.8 lines 1145-1151)
// ---------------------------------------------------------------------------

export type Classification = 'ARCH' | 'LOGIC' | 'PROCESS' | 'DOMAIN';

export interface RuleCard {
  verbatimQuote: string;              // the exact corpus words — the D13 core (never synthesized)
  anchor: string;                     // '<file>:<line>' — the 1-indexed provenance (matches /\.md:\d+$/)
  classification: Classification;     // ARCH | LOGIC | PROCESS | DOMAIN (the keyword-family vote)
  severity: Severity;                 // CRIT | HIGH | MED | WARN — the db.ts SEVERITIES canon (db.ts:66)
  proposed: 0 | 1;                    // the D13 flag — 1 when the voice is ambiguous / the rule is unquotable (K3.2)
}

// ---------------------------------------------------------------------------
// The named-error vocabulary (O32.1) — the fail-closed corpus contract
// ---------------------------------------------------------------------------

export function corpusUnreadable(corpusPath: string, detail: string): LexiconError {
  return new LexiconError(
    'CORPUS_UNREADABLE',
    `CORPUS_UNREADABLE: path=${corpusPath} detail=${detail} (a corpus path that cannot be read is a loud named error, never a silent skip)`,
  );
}

export function corpusEmpty(): LexiconError {
  return new LexiconError(
    'CORPUS_EMPTY',
    `CORPUS_EMPTY: the corpus path list is empty — the profile's rules.corpus is min(1); a compile with zero corpus paths is a profile error, never an empty battery`,
  );
}

// ---------------------------------------------------------------------------
// THE DETECTOR LEXICON (the regex is the detector ONLY — the decision is the
// keyword-family vote + the severity rating below, never a single match)
// ---------------------------------------------------------------------------

/** The blockquote marker — the spec's '>' quote marker (§3.8:1158). */
const BLOCKQUOTE = /^\s*>\s?/;

/** The quoted-passage marker — the "...(verbatim)" / '"..."' patterns (§3.8:1161). */
const QUOTED_PASSAGE = /["“][^"”]{3,}["”]/;

/** The imperative/emotional rule markers — a directive line IS a card (§3.8:1162). */
const RULE_SHAPE = /(^|\W)(NEVER|MUST|FUCKING|ALWAYS|ABSOLUTELY|BANNED|FORBIDDEN|MANDATORY)(\W|$)/i;

/** The soft-voice lexicon — the ambiguous-voice paragraphs get the PROPOSED flag
 *  (G11.4, §3.8:1163). A modal/hedge means the operator curates, never a silent class. */
const SOFT_VOICE = /(^|\W)(may|might|could|should|perhaps|probably|maybe|consider|suggests?|possibly|ideally|eventually)(\W|$)/i;

/** A conditional hedge — 'if X then Y'-style tentative rules. */
const CONDITIONAL_HEDGE = /\bif\b[^\n]{0,60}\b(then|it would|we can|one could|may|might)\b/i;

/** The classification keyword lexicons — VERBATIM from the spec §3.8:1169-1172.
 *  The counts feed the argmax vote below; a term is a DETECTOR hit, never a decision. */
const ARCH_TERMS = /architecture|pipeline|stage|module|layer|wiring|chain/gi;
const LOGIC_TERMS = /anchor|derive|compare|provenance|cascade|divergence|compute|inject/gi;
const PROCESS_TERMS = /audit|gate|verify|test|document|quote|evidence|harness/gi;
const DOMAIN_TERMS = /zone|liquidity|SL|TP|RRR|pip|mitigation|pressure|entry/gi;

// ---------------------------------------------------------------------------
// The deterministic decisions over the detector hits
// ---------------------------------------------------------------------------

function countMatches(re: RegExp, text: string): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

/** The classification vote (spec §3.8:1167-1175): count the family terms, argmax
 *  wins; the tie / the zero-score → PROCESS with the ambiguous flag (the PROPOSED
 *  mark rides out of here — never a silent classification). */
function classify(quote: string): { classification: Classification; ambiguous: boolean } {
  const scores: Record<Classification, number> = {
    ARCH: countMatches(ARCH_TERMS, quote),
    LOGIC: countMatches(LOGIC_TERMS, quote),
    PROCESS: countMatches(PROCESS_TERMS, quote),
    DOMAIN: countMatches(DOMAIN_TERMS, quote),
  };
  const max = Math.max(...Object.values(scores));
  // THE R16 TYPE_CERTAINTY FIX — the winner keys are read from the KNOWN union
  // (the typed constant, no cast on an unvalidated string[]), then filtered.
  const CLASSIFICATIONS: Classification[] = ['ARCH', 'LOGIC', 'PROCESS', 'DOMAIN'];
  const winners = CLASSIFICATIONS.filter((k) => scores[k] === max && scores[k] > 0);
  if (winners.length === 1) return { classification: winners[0], ambiguous: false };
  // the tie → PROCESS with the proposed flag (spec §3.8:1175); the zero-score
  // (an unclassifiable rule-shaped line) is ALSO ambiguous — surfaced, never classified
  return { classification: 'PROCESS', ambiguous: true };
}

/** THE CALIBRATED SEVERITY BANDS (the ISE law — name the calibration): the
 *  severity canon is the db.ts SEVERITIES constant (db.ts:66); the banding is
 *  the deterministic rule-strength rating — the CRIT/HIGH/MED markers mirror
 *  the operator's own marker vocabulary (the spec's NEVER/MUST/FUCKING/
 *  absolutely, §3.8:1162). Every band maps to the canon; nothing escapes it. */
function rate(text: string): Severity {
  if (/(^|\W)(NEVER|FUCKING|ABSOLUTELY|MANDATORY)(\W|$)/i.test(text)) return 'CRIT';
  if (/(^|\W)(MUST|ALWAYS|BANNED|FORBIDDEN|CRITICAL)(\W|$)/i.test(text)) return 'HIGH';
  if (/(^|\W)(SHOULD|SHALL|REQUIRE|REQUIRES|REQUIRED|ENSURE)(\W|$)/i.test(text)) return 'MED';
  return 'WARN';
}

/** The ambiguous-voice detector — the PROPOSED flag's decision (K3.2). */
function voiceAmbiguous(text: string): boolean {
  return SOFT_VOICE.test(text) || CONDITIONAL_HEDGE.test(text);
}

// ---------------------------------------------------------------------------
// THE DECLARED-METADATA READER (2026-08-13 — the P6 silent-findings root, proven
// at runtime in the suite container plutus-bh-suite-20260813): the corpus's
// explicit 'classification: DOMAIN' / 'severity: HIGH' lines (the operator's
// CURATED declaration — the D13 class: the operator's words are the truth) were
// ignored by the extraction; the keyword vote on the quote ("price anchored" →
// the LOGIC term 'anchor') misclassified the card as LOGIC, selectTemplate then
// picked provenance.traces-to-source (whose bindings do not exist), and the
// domain.numeric-threshold predicate NEVER compiled — the P6 check was
// structurally absent despite the profile's correct bindings + the enriched
// graph data. THE FIX: the lines immediately following a rule line are scanned
// for the declared metadata; the DECLARED classification/severity OVERRIDE the
// vote (the operator's curated declaration wins over the mechanical estimate).
// The vote remains the fallback for undeclared rules — never a removal.
// ---------------------------------------------------------------------------

const DECLARED_CLASSIFICATION = /^\s*classification\s*[:=]\s*(ARCH|LOGIC|PROCESS|DOMAIN)\b/i;
const DECLARED_SEVERITY = /^\s*severity\s*[:=]\s*(CRIT|HIGH|MED|WARN)\b/i;

/** Scan up to META_SCAN_WINDOW following lines (a rule's contiguous metadata
 *  block — the blank line or the next rule line ends the scan) for the declared
 *  classification/severity. Returns the declared values or null (undeclared). */
function readDeclaredMeta(lines: string[], start: number): { classification?: Classification; severity?: Severity } {
  const meta: { classification?: Classification; severity?: Severity } = {};
  for (let i = start; i < lines.length && i < start + META_SCAN_WINDOW; i++) {
    const line = lines[i];
    if (line.trim() === '') break;                       // the blank line ends the metadata block
    if (isRuleShaped(line) || isQuotedPassage(line) || isBlockquote(line)) break; // the next rule line ends it
    const cm = line.match(DECLARED_CLASSIFICATION);
    if (cm && !meta.classification && isClassification(cm[1])) meta.classification = cm[1];
    const sm = line.match(DECLARED_SEVERITY);
    if (sm && !meta.severity && isSeverity(sm[1])) meta.severity = sm[1];
  }
  return meta;
}

const META_SCAN_WINDOW = 4;

/** THE R16 TYPE_CERTAINTY GUARD — the classification string is narrowed by the
 *  literal-union check (no cast at all — the comparison narrows the unknown). */
function isClassification(v: string): v is Classification {
  return v === 'ARCH' || v === 'LOGIC' || v === 'PROCESS' || v === 'DOMAIN';
}

/** THE R16 TYPE_CERTAINTY GUARD — the severity string is narrowed by the
 *  SEVERITIES membership check (the assertion is earned by the validation). */
function isSeverity(v: string): v is Severity {
  return (SEVERITIES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// The line scans (the deterministic mapping over the corpus text)
// ---------------------------------------------------------------------------

function isBlockquote(line: string): boolean {
  return BLOCKQUOTE.test(line);
}

function isQuotedPassage(line: string): boolean {
  return QUOTED_PASSAGE.test(line);
}

function isRuleShaped(line: string): boolean {
  return RULE_SHAPE.test(line);
}

/** Collect the contiguous blockquote block — the quote-collection STOPS at a
 *  blank line (a section boundary) or at a non-blockquote line (§3.8 failure
 *  modes). The quote is the marker-stripped content — the corpus's exact words. */
function collectBlockquote(lines: string[], start: number): { text: string } {
  const collected: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') break;          // the blank line ends the blockquote
    const m = line.match(/^\s*>\s?/);
    if (!m) break;                          // a non-blockquote line ends the blockquote
    collected.push(line.slice(m[0].length));
    i++;
  }
  return { text: collected.join(' ').trim() };
}

/** The inline quoted passage — the inner text between the quote marks. */
function extractInlineQuote(line: string): string {
  const m = line.match(/["“]([^"”]+)["”]/);
  return m ? m[1].trim() : line.trim();
}

/** Build a card from a quote-shaped line — the D13 flag rides out of here:
 *  1 when the voice is ambiguous OR the quote is empty (the unquotable rule) —
 *  the operator curates, never silently classified (K3.2). The DECLARED
 *  classification/severity (the corpus's explicit metadata — the operator's
 *  curated declaration) OVERRIDE the vote when present (2026-08-13 — the P6
 *  silent-findings root: the vote misclassifies 'price anchored' as LOGIC; the
 *  corpus's declared DOMAIN must win). */
function makeCard(quote: string, anchor: string, sourceLine: string, declared?: { classification?: Classification; severity?: Severity }): RuleCard {
  const { classification: voted, ambiguous } = classify(quote);
  const proposed: 0 | 1 = ambiguous || quote.trim().length === 0 || voiceAmbiguous(quote) ? 1 : 0;
  return {
    verbatimQuote: quote,
    anchor,
    classification: declared?.classification ?? voted,
    severity: declared?.severity ?? rate(quote),
    proposed,
  };
}

// ---------------------------------------------------------------------------
// THE EXTRACTOR (spec §3.8:1153-1165)
// ---------------------------------------------------------------------------

/**
 * The corpus docs → the rule cards. Deterministic: the same corpus text always
 * produces the same cards in the same order. Error paths FIRST: an unreadable
 * corpus path throws the loud CORPUS_UNREADABLE naming the path; the empty
 * corpus list throws CORPUS_EMPTY — never a silent skip, never an empty success.
 */
export function extractRuleCards(corpusPaths: string[]): RuleCard[] {
  if (corpusPaths.length === 0) throw corpusEmpty();
  const cards: RuleCard[] = [];
  for (const file of corpusPaths) {
    const lines = readLinesOrThrow(file);
    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;                            // 1-indexed — the anchor is the line the rule was READ from
      const anchor = `${file}:${lineNo}`;
      const line = lines[i];
      if (isBlockquote(line)) {
        const collected = collectBlockquote(lines, i);
        cards.push(makeCard(collected.text, anchor, line, readDeclaredMeta(lines, i + 1)));
      } else if (isQuotedPassage(line)) {
        cards.push(makeCard(extractInlineQuote(line), anchor, line, readDeclaredMeta(lines, i + 1)));
      } else if (isRuleShaped(line)) {
        cards.push(makeCard(line.trim(), anchor, line, readDeclaredMeta(lines, i + 1)));
      }
    }
  }
  return cards;
}

function readLinesOrThrow(file: string): string[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e: unknown) {
    throw corpusUnreadable(file, String(e));
  }
  return text.split('\n');
}
