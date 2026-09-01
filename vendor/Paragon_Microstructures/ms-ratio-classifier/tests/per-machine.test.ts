import { describe, it, expect } from 'bun:test';
import { scoreSignals, confidence, classifyBand, batchScan } from '../src/index.js';
import type { FourBankFamily } from '../src/core/types.js';

function makeFamily(overrides: Partial<FourBankFamily> = {}): FourBankFamily {
  return {
    descriptive: overrides.descriptive ?? [],
    suggestive: overrides.suggestive ?? [],
    substitute: overrides.substitute ?? [],
    use: overrides.use ?? [],
    id: overrides.id,
  };
}

describe('ms-ratio-classifier', () => {
  it('empty text returns 0 pos 0 neg', () => {
    const f = makeFamily({ suggestive: [/test/i] });
    const r = scoreSignals('', f);
    expect(r.pos).toBe(0);
    expect(r.neg).toBe(0);
    expect(r.evidence).toBe('');
    expect(confidence(r.pos, r.neg)).toBe(0);
    expect(classifyBand(confidence(r.pos, r.neg))).toBe('SUPPRESS');
  });

  it('null text coerced to empty without throw', () => {
    const f = makeFamily({ suggestive: [/test/i] });
    const r = scoreSignals(null as unknown as string, f);
    expect(r.pos).toBe(0);
  });

  it('null family throws', () => {
    expect(() => scoreSignals('hello', null as unknown as FourBankFamily)).toThrow();
  });

  it('minimal pair same words opposite verdicts', () => {
    const family: FourBankFamily = {
      descriptive: [/before the container test/i, /legitimate pre-check/i],
      suggestive: [/quick check/i],
      substitute: [/instead of the container test/i],
      use: [/trident-container-test/i],
    };
    const textSuppress = 'quick check before the container test and legitimate pre-check';
    const r1 = scoreSignals(textSuppress, family);
    const c1 = confidence(r1.pos, r1.neg);
    expect(r1.pos).toBe(1);
    expect(r1.neg).toBe(2);
    expect(c1).toBeCloseTo(0.25, 5);
    expect(classifyBand(c1)).toBe('SUPPRESS');

    const textFire = 'quick check instead of the container test';
    const r2 = scoreSignals(textFire, family);
    const c2 = confidence(r2.pos, r2.neg);
    expect(r2.pos).toBe(3);
    expect(r2.neg).toBe(0);
    expect(c2).toBeCloseTo(0.75, 5);
    expect(classifyBand(c2)).toBe('ENFORCE');
  });

  it('FI-1 paraphrase catch forgo the validation step hits substitute at 0.67', () => {
    const family: FourBankFamily = {
      descriptive: [],
      suggestive: [],
      substitute: [/forgo the validation step/i],
      use: [],
      id: 'TEST_EVASION',
    };
    const r = scoreSignals('forgo the validation step', family);
    expect(r.pos).toBe(2);
    expect(r.neg).toBe(0);
    const conf = confidence(r.pos, r.neg);
    expect(conf).toBeCloseTo(0.6666667, 4);
    expect(classifyBand(conf)).toBe('ENFORCE');
    const violation = batchScan('forgo the validation step', [family]);
    expect(violation).not.toBeNull();
    expect(violation!.confidence).toBeCloseTo(0.6666667, 4);
    expect(violation!.weight).toBeCloseTo(1.3333333, 4);
  });

  it('use-bank short-circuit returns pos 0 regardless of suggestive hits', () => {
    const family: FourBankFamily = {
      descriptive: [],
      suggestive: [/quick check/i, /\bverify\b/i],
      substitute: [/instead of/i],
      use: [/trident-container-test/i, /the sanctioned path/i],
    };
    const text = 'quick check verify instead of trident-container-test';
    const r = scoreSignals(text, family);
    expect(r.pos).toBe(0);
    expect(r.neg).toBe(3);
    expect(classifyBand(confidence(r.pos, r.neg))).toBe('SUPPRESS');
    const v = batchScan(text, [family]);
    expect(v).toBeNull();
  });

  it('use-bank short-circuit even with word-bound suggestive +2', () => {
    const family: FourBankFamily = {
      descriptive: [],
      suggestive: [/\bquick check\b/i],
      substitute: [],
      use: [/trident-container-test/i],
    };
    const r = scoreSignals('quick check trident-container-test', family);
    expect(r.pos).toBe(0);
    expect(r.neg).toBe(3);
  });

  it('suggestive word-bound counts +2 vs +1', () => {
    const familyBound: FourBankFamily = { descriptive: [], suggestive: [/\bquick check\b/i], substitute: [], use: [] };
    const familyUnbound: FourBankFamily = { descriptive: [], suggestive: [/quick check/i], substitute: [], use: [] };
    const rBound = scoreSignals('quick check', familyBound);
    const rUnbound = scoreSignals('quick check', familyUnbound);
    expect(rBound.pos).toBe(2);
    expect(rUnbound.pos).toBe(1);
    expect(confidence(rBound.pos, rBound.neg)).toBeCloseTo(0.6666667, 4);
    expect(confidence(rUnbound.pos, rUnbound.neg)).toBeCloseTo(0.5, 4);
  });

  it('band boundaries exact thresholds', () => {
    expect(classifyBand(0.5)).toBe('ENFORCE');
    expect(classifyBand(0.5000001)).toBe('ENFORCE');
    expect(classifyBand(0.3)).toBe('DAMPEN');
    expect(classifyBand(0.4999)).toBe('DAMPEN');
    expect(classifyBand(0.29)).toBe('SUPPRESS');
    expect(classifyBand(0.0)).toBe('SUPPRESS');
  });

  it('confidence 0.5 from pos2 neg1', () => {
    const c = confidence(2, 1);
    expect(c).toBeCloseTo(0.5, 10);
    expect(classifyBand(c)).toBe('ENFORCE');
  });

  it('confidence 0.3 from pos3 neg6', () => {
    const c = confidence(3, 6);
    expect(c).toBeCloseTo(0.3, 10);
    expect(classifyBand(c)).toBe('DAMPEN');
  });

  it('batchScan requires pos>0 conf>=0.5 pos>neg', () => {
    const f1: FourBankFamily = { descriptive: [/legit/i], suggestive: [/quick/i], substitute: [], use: [] };
    expect(batchScan('quick legit', [f1])).toBeNull();
    const f2: FourBankFamily = { descriptive: [], suggestive: [/quick/i], substitute: [], use: [] };
    const v2 = batchScan('quick', [f2]);
    expect(v2).not.toBeNull();
    expect(v2!.pos).toBe(1);
    expect(v2!.confidence).toBeCloseTo(0.5, 5);
  });

  it('concurrent scoring is stateless', async () => {
    const family: FourBankFamily = { descriptive: [/a/i], suggestive: [/b/i], substitute: [/c/i], use: [/d/i] };
    const results = await Promise.all([
      Promise.resolve(scoreSignals('b', family)),
      Promise.resolve(scoreSignals('b c', family)),
      Promise.resolve(scoreSignals('a b', family)),
      Promise.resolve(scoreSignals('d b c', family)),
    ]);
    expect(results[0].pos).toBe(1);
    expect(results[1].pos).toBe(3);
    expect(results[2].pos).toBe(1);
    expect(results[3].pos).toBe(0);
  });

  it('boundary: invalid pattern type throws', () => {
    const bad = { descriptive: ['not regex' as unknown as RegExp], suggestive: [], substitute: [], use: [] };
    expect(() => scoreSignals('test', bad as FourBankFamily)).toThrow();
  });

  it('descriptive neg+1 and substitute pos+2 arithmetic', () => {
    const f: FourBankFamily = {
      descriptive: [/desc1/i, /desc2/i],
      suggestive: [],
      substitute: [/sub1/i, /sub2/i],
      use: [],
    };
    const r = scoreSignals('desc1 desc2 sub1', f);
    expect(r.neg).toBe(2);
    expect(r.pos).toBe(2);
    expect(confidence(r.pos, r.neg)).toBeCloseTo(0.4, 5);
    expect(classifyBand(confidence(r.pos, r.neg))).toBe('DAMPEN');
  });
});
