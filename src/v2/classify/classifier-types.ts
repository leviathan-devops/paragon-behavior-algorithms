// src/v2/classify/classifier-types.ts
//
// GAP-1 CLOSED (2026-08-28): the weight-averaging `classifySignals` stub that
// lived here was DELETED — it averaged signal weights and called the average
// "confidence", which is a noise filter, not an intent classifier. The REAL
// ratio classifier (scoreSignals / confidence / classify, per the
// IntelligenceLexicon reference engine.ts) lives in
// ../lexicons/stream-predicate-lexicon.ts:154-218 and is wired into
// event-router.processBatch (primary, per-signal spec §2.7 ladder) and
// pipeline.onSignals (secondary excerpt re-verify).
//
// This module retains ONLY the modulation ladder helper used by the pipeline's
// secondary suppression gate.

/**
 * The confidence→weight modulation ladder. Confidence below 0.2 zeroes the
 * weight (the signal's own evidence window cannot sustain it); everything
 * above passes at full weight (the primary per-signal dampening already ran
 * in event-router per spec §2.7).
 */
export function modulateWeight(weight: number, confidence: number): number {
  if (confidence < 0.2) return 0;
  if (confidence < 0.7) return weight * 0.3;
  return weight * 1.0;
}
