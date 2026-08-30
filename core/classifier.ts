// core/classifier.ts — THE RATIO CLASSIFIER (the intelligence layer)
//
// THE LAW: a regex hit INITIATES; the sentence context DECIDES.
// confidence = pos/(pos+neg+1) across 4 opposed signal banks.
// The same surface words in different intents produce different verdicts.
//
// Source: the IntelligenceLexicon-Edition-v1.0 reference + the trident v4.4.2
// implementation (proven live: FI-1 caught mid-stream, the conf:0 suppression,
// the minimal-pair verdicts).

import type { FourBankFamily, PatternFamilyMember, ClassifierInput, ClassifierResult } from './types.js';

// ═══ THE SIGNAL SCORING (the 4-bank scan) ═══

export function scoreSignals(text: string, family: FourBankFamily):
  { pos: number; neg: number; evidence: string } {
  let pos = 0;
  let neg = 0;
  let evidence = '';

  // BANK 1: descriptive — context that makes the claim plausible (suppresses)
  for (const re of family.descriptive) {
    const m = text.match(re);
    if (m) { neg += 1; evidence = evidence || m[0]; }
    if (re.global) re.lastIndex = 0;
  }

  // BANK 2: suggestive — the claim/violation signals themselves
  for (const re of family.suggestive) {
    const m = text.match(re);
    if (m) { pos += re.source.includes('\\b') ? 2 : 1; evidence = evidence || m[0]; }
    if (re.global) re.lastIndex = 0;
  }

  // BANK 3: substitute — the paraphrase class (strong positive)
  if (family.substitute) {
    for (const re of family.substitute) {
      const m = text.match(re);
      if (m) { pos += 2; evidence = evidence || m[0]; }
      if (re.global) re.lastIndex = 0;
    }
  }

  // BANK 4: use — the legitimate-use exemptors (strong negative)
  if (family.use) {
    for (const re of family.use) {
      if (re.test(text)) { neg += 3; }
      if (re.global) re.lastIndex = 0;
    }
  }

  return { pos, neg, evidence };
}

// ═══ THE CONFIDENCE FORMULA ═══

export function confidence(pos: number, neg: number): number {
  return pos / (pos + neg + 1);
}

// ═══ THE CLASSIFIER (the aggregate scan) ═══
// Scans all families; finds the best match by pos; produces the result.

export function classify(input: ClassifierInput,
  families: readonly PatternFamilyMember[]): ClassifierResult {
  let bestPos = 0;
  let bestNeg = 0;
  let bestEvidence = '';
  const matched: string[] = [];

  for (const f of families) {
    const s = scoreSignals(input.text, f);
    if (s.pos > 0) {
      const g = f.group ?? f.id;
      if (!matched.includes(g)) matched.push(g);
    }
    if (s.pos > bestPos || (s.pos === bestPos && s.neg > bestNeg)) {
      bestPos = s.pos;
      bestNeg = s.neg;
      bestEvidence = s.evidence;
    }
  }

  const conf = confidence(bestPos, bestNeg);
  const shouldBlock = bestPos > 0 && bestPos > bestNeg;
  return {
    intent: shouldBlock ? 'flagged' : 'none',
    confidence: conf,
    action: shouldBlock ? 'block' : 'allow',
    matchedFamilies: matched,
    evidence: bestEvidence,
  };
}

// ═══ THE CONFIDENCE LADDER (the modulation bands) ═══
// Calibration: spec §2.5 + OQ-2 — campaign-calibrated.

export const ENFORCE_CONF_BAND = 0.5;   // above = pass at full credit
export const DAMPEN_CONF_BAND = 0.3;   // above = dampened; below = suppressed
export const DAMPEN_FACTOR = 0.5;
export const SYNTH_WEIGHT_GAIN = 2;

export function modulateWeight(weight: number, conf: number): number {
  if (conf >= ENFORCE_CONF_BAND) return weight * conf;
  if (conf >= DAMPEN_CONF_BAND) return weight * conf * DAMPEN_FACTOR;
  return 0;  // suppressed
}

// ═══ THE FI-1 BATCH-WIDE SCAN (the paraphrase synthesis) ═══
// Scans every registered member against the full batch text; a member with
// pos > 0, conf ≥ ENFORCE, pos > neg SYNTHESIZES a violation even when the
// legacy matcher missed — the paraphrase class fires here.

export function batchScan(text: string,
  families: readonly PatternFamilyMember[]): {
  memberId: string;
  family: string;
  weight: number;
  evidence: string;
} | null {
  let best: { memberId: string; family: string; pos: number; neg: number; evidence: string } | null = null;

  for (const member of families) {
    const scored = scoreSignals(text, member);
    if (scored.pos > 0 && (!best || scored.pos > best.pos)) {
      best = {
        memberId: member.id,
        family: member.id.split('.')[0],
        pos: scored.pos,
        neg: scored.neg,
        evidence: scored.evidence,
      };
    }
  }

  if (best !== null) {
    const conf = confidence(best.pos, best.neg);
    if (conf >= ENFORCE_CONF_BAND && best.pos > best.neg) {
      return {
        memberId: best.memberId,
        family: best.family,
        weight: conf * SYNTH_WEIGHT_GAIN,
        evidence: best.evidence,
      };
    }
  }
  return null;
}
