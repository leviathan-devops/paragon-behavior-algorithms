// src/v2/counters/macro-patterns.ts — THE CROSS-SIGNAL FUSION DETECTORS (spec §2.6)
// Each pattern requires ≥2 independent evidence items or explicit external
// correlation (ledger/cadence) — LAW-23: no single signal fires alone.
// Pure functions — no IO, no side effects.

import type { MacroPatternHit, WeightedViolation } from '../contracts.js';

export interface PatternWindow {
  readonly seqSpan: number;
  readonly signals: ReadonlyArray<WeightedViolation>;
}

export interface CadenceWindow {
  testToolCallsInWindow(sessionID: string): number;
}

export interface V1LedgerView {
  lastDeliveredWithin(k: number): boolean;
}

export interface MacroPattern {
  readonly patternId: MacroPatternHit['patternId'];
  detect(w: PatternWindow, ledger: V1LedgerView, cadence?: CadenceWindow): boolean;
}

export const MACRO_PATTERNS: ReadonlyArray<MacroPattern> = [
  {
    patternId: 'DOUBT_THEN_OVERCLAIM',
    detect: (w) => {
      // THE SPEC §2.6 ORDERING CLAUSE (meta-audit deviation fix): the
      // non-hedge overclaim signal must occur AFTER the LAST doubt signal —
      // co-presence alone was the deviation.
      const hedges = w.signals.filter(s => s.family === 'DOUBT_HEDGE');
      if (hedges.length === 0) return false;
      const lastHedgeSeq = Math.max(...hedges.map(s => s.anchor.seq));
      return w.signals.some(s => s.family !== 'DOUBT_HEDGE'
                  && s.anchor.seq > lastHedgeSeq);
    },
  },
  {
    patternId: 'FORGERY_AFTER_WARHEAD',
    detect: (w, ledger) => ledger.lastDeliveredWithin(8) && w.signals.some(s => s.family === 'FORGERY_INTENT'),
  },
  {
    patternId: 'ESCALATING_INSISTENCE',
    detect: (w) => {
      const bySeq = [...w.signals].sort((a, b) => a.anchor.seq - b.anchor.seq);
      if (bySeq.length < 3) return false;
      let count = 0; let prevWeight = 0;
      for (const s of bySeq) { if (s.weight > prevWeight) { count++; prevWeight = s.weight; } }
      return count >= 3;
    },
  },
  {
    patternId: 'TEST_EVASION',
    detect: (w, _ledger, cadence) => {
      if (!cadence) return false;
      const mentions = w.signals.filter(s => /test|verify|battery/i.test(s.excerpt)).length;
      return mentions >= 3 && cadence.testToolCallsInWindow('') === 0;
    },
  },
];

export function detectPatterns(
  w: PatternWindow,
  ledger: V1LedgerView,
  cadence?: CadenceWindow,
): MacroPatternHit[] {
  return MACRO_PATTERNS
    .filter(p => p.detect(w, ledger, cadence))
    .map(p => ({ patternId: p.patternId, evidence: w.signals.slice(0, 5), windowSeq: w.seqSpan }));
}
