import { describe, it, expect } from 'bun:test';
import { scoreSignals, confidence, classifyBand, batchScan } from '../src/index.js';
import type { FourBankFamily } from '../src/core/types.js';

const FAMILIES: FourBankFamily[] = [
  { descriptive: [/for the container test/i], suggestive: [/quick check/i], substitute: [/instead of the container/i], use: [/trident-container-test/i], id: 'A' },
  { descriptive: [], suggestive: [], substitute: [/forgo the validation step/i], use: [], id: 'B' },
  { descriptive: [], suggestive: [/\bquick check\b/i], substitute: [], use: [] },
  { descriptive: [/a/i], suggestive: [/b/i], substitute: [/c/i], use: [/d/i] },
];

const TEXTS = [
  'quick check before the container test',
  'forgo the validation step',
  'quick check trident-container-test',
  'b c',
  'a b',
  '',
  'hello world',
];

describe('ms-ratio-classifier determinism 500 runs', () => {
  it('same input → same verdict across 500 runs', () => {
    for (let run = 0; run < 500; run++) {
      for (const family of FAMILIES) {
        for (const text of TEXTS) {
          const a = scoreSignals(text, family);
          const b = scoreSignals(text, family);
          expect(a.pos).toBe(b.pos);
          expect(a.neg).toBe(b.neg);
          expect(a.evidence).toBe(b.evidence);
          const ca = confidence(a.pos, a.neg);
          const cb = confidence(b.pos, b.neg);
          expect(ca).toBe(cb);
          expect(classifyBand(ca)).toBe(classifyBand(cb));
        }
      }
    }
  });

  it('batchScan determinism 500 runs', () => {
    for (let run = 0; run < 500; run++) {
      for (const text of TEXTS) {
        const a = batchScan(text, FAMILIES);
        const b = batchScan(text, FAMILIES);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    }
  });

  it('pinned values stable across 500 runs', () => {
    for (let run = 0; run < 500; run++) {
      const f: FourBankFamily = { descriptive: [], suggestive: [], substitute: [/forgo the validation step/i], use: [] };
      const r = scoreSignals('forgo the validation step', f);
      expect(r.pos).toBe(2);
      expect(confidence(r.pos, r.neg)).toBeCloseTo(0.6666667, 4);
      expect(classifyBand(confidence(r.pos, r.neg))).toBe('ENFORCE');
    }
  });
});
