import { describe, it, expect } from 'bun:test';
import { FamilyNeuron, V2Synapse } from '../src/index.js';

describe('ms-synapse FamilyNeuron lifecycle', () => {
  it('full spec lifecycle 0.43 -> 0.82 -> 1.23 firing at threshold 0.9', () => {
    const n = new FamilyNeuron(0.9, 0.05, 25);
    n.accumulate(0.43, 0);
    expect(n.value()).toBeCloseTo(0.43, 10);
    expect(n.canFire()).toBe(false);

    n.accumulate(0.48, 5);
    const expected5 = 0.43 * Math.exp(-0.05 * 5) + 0.48;
    expect(n.value()).toBeCloseTo(expected5, 10);
    expect(n.value()).toBeCloseTo(0.8149, 2);
    expect(n.canFire()).toBe(false);

    n.accumulate(0.52, 8);
    const expected8 = expected5 * Math.exp(-0.05 * 3) + 0.52;
    expect(n.value()).toBeCloseTo(expected8, 10);
    expect(n.value()).toBeCloseTo(1.2258, 2);
    expect(n.canFire()).toBe(true);
    n.fire();
    expect(n.canFire()).toBe(false);
  });

  it('decay to 0.41 at t30 after firing', () => {
    const n = new FamilyNeuron(0.9, 0.05, 25);
    n.accumulate(0.43, 0);
    n.accumulate(0.48, 5);
    n.accumulate(0.52, 8);
    n.fire();
    n.accumulate(0, 30);
    const expected = 1.2258 * Math.exp(-0.05 * 22);
    expect(n.value()).toBeCloseTo(expected, 2);
    expect(n.value()).toBeCloseTo(0.41, 1);
    expect(n.canFire()).toBe(false);
  });

  it('refractory blocks second fire within 25 seq', () => {
    const n = new FamilyNeuron(0.5, 0.05, 25);
    n.accumulate(0.6, 0);
    expect(n.canFire()).toBe(true);
    n.fire();
    n.accumulate(0.6, 10);
    expect(n.canFire()).toBe(false);
    n.accumulate(0.6, 30);
    expect(n.canFire()).toBe(true);
  });

  it('boostBaseline reduces required signals from 3 to 2', () => {
    const n1 = new FamilyNeuron(0.9, 0.05, 25);
    n1.accumulate(0.43, 0);
    n1.accumulate(0.48, 5);
    expect(n1.canFire()).toBe(false);

    const n2 = new FamilyNeuron(0.9, 0.05, 25);
    n2.boostBaseline(0.2);
    expect(n2.value()).toBeCloseTo(0.2, 10);
    n2.accumulate(0.43, 0);
    expect(n2.value()).toBeCloseTo(0.63, 10);
    n2.accumulate(0.48, 5);
    const v = 0.63 * Math.exp(-0.05 * 5) + 0.48;
    expect(n2.value()).toBeCloseTo(v, 10);
    expect(n2.canFire()).toBe(true);
  });

  it('snapshot restore round-trip', () => {
    const n = new FamilyNeuron(0.9, 0.05, 25);
    n.accumulate(0.43, 0);
    n.accumulate(0.48, 5);
    const snap = n.snapshot();
    const n2 = new FamilyNeuron(0.9, 0.05, 25);
    n2.restore(snap);
    expect(n2.value()).toBeCloseTo(n.value(), 10);
    expect(n2.canFire()).toBe(n.canFire());
    n2.accumulate(0.52, 8);
    expect(n2.canFire()).toBe(true);
  });

  it('empty null handling throws on invalid weight', () => {
    const n = new FamilyNeuron(0.9);
    expect(() => n.accumulate(NaN, 0)).toThrow();
    expect(() => n.accumulate(0.5, NaN)).toThrow();
    expect(() => n.accumulate(-1, 0)).toThrow();
  });

  it('concurrent neurons isolated', () => {
    const s = new V2Synapse({ fire: { A: 0.9, B: 0.9 }, decayAlpha: 0.05, refractorySeq: 25 });
    s.getNeuron('A').accumulate(0.43, 0);
    s.getNeuron('B').accumulate(1.0, 0);
    expect(s.getNeuron('A').value()).toBeCloseTo(0.43, 10);
    expect(s.getNeuron('B').value()).toBeCloseTo(1.0, 10);
    expect(s.getNeuron('B').canFire()).toBe(true);
    expect(s.getNeuron('A').canFire()).toBe(false);
    expect(s.canAnyFire()).toBe(true);
  });

  it('V2Synapse snapshot restore', () => {
    const s = new V2Synapse({ fire: { X: 0.9 }, decayAlpha: 0.05, refractorySeq: 25 });
    s.getNeuron('X').accumulate(0.5, 0);
    const snap = s.snapshot();
    const s2 = new V2Synapse({ fire: { X: 0.9 }, decayAlpha: 0.05, refractorySeq: 25 });
    s2.restore(snap);
    expect(s2.getNeuron('X').value()).toBeCloseTo(0.5, 10);
  });

  it('boundary: atSeq must be >= lastAccumSeq', () => {
    const n = new FamilyNeuron(0.9);
    n.accumulate(0.5, 5);
    expect(() => n.accumulate(0.5, 3)).toThrow();
  });
});
