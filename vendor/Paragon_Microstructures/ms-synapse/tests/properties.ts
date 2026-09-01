import { describe, it, expect } from 'bun:test';
import { FamilyNeuron, V2Synapse } from '../src/index.js';

describe('ms-synapse determinism 500 runs', () => {
  it('same sequence → same lambda across 500 runs', () => {
    for (let run = 0; run < 500; run++) {
      const n = new FamilyNeuron(0.9, 0.05, 25);
      n.accumulate(0.43, 0);
      n.accumulate(0.48, 5);
      n.accumulate(0.52, 8);
      expect(n.value()).toBeCloseTo(1.2258, 2);
      expect(n.canFire()).toBe(true);
    }
  });

  it('decay determinism 500 runs', () => {
    for (let run = 0; run < 500; run++) {
      const n = new FamilyNeuron(0.9, 0.05, 25);
      n.accumulate(0.43, 0);
      n.accumulate(0.48, 5);
      n.accumulate(0.52, 8);
      n.fire();
      n.accumulate(0, 30);
      // 1.2258 * exp(-0.05*22) ≈ 0.41
      expect(n.value()).toBeCloseTo(0.41, 1);
      expect(n.canFire()).toBe(false);
    }
  });

  it('boostBaseline + snapshot determinism 500 runs', () => {
    for (let run = 0; run < 500; run++) {
      const n = new FamilyNeuron(0.9, 0.05, 25);
      n.boostBaseline(0.2);
      n.accumulate(0.43, 0);
      const snap = n.snapshot();
      const n2 = new FamilyNeuron(0.9, 0.05, 25);
      n2.restore(snap);
      expect(n2.value()).toBe(n.value());
      n.accumulate(0.48, 5);
      n2.accumulate(0.48, 5);
      expect(n.value()).toBe(n2.value());
    }
  });

  it('V2Synapse isolation determinism 500 runs', () => {
    for (let run = 0; run < 500; run++) {
      const s = new V2Synapse({ fire: { A: 0.9, B: 0.9 }, decayAlpha: 0.05, refractorySeq: 25 });
      s.getNeuron('A').accumulate(0.43, 0);
      s.getNeuron('B').accumulate(1.0, 0);
      expect(s.getNeuron('A').value()).toBeCloseTo(0.43, 10);
      expect(s.getNeuron('B').canFire()).toBe(true);
      expect(s.canAnyFire()).toBe(true);
    }
  });
});
