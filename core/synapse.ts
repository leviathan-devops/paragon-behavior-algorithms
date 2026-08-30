// core/synapse.ts — THE PER-SESSION ACCUMULATOR
//
// A_λ = λ·e^(−α·Δseq) + w  per family, with refractory.
// The fire threshold is per-family (from the domain module's thresholds).
// The refractory prevents rapid-fire from a single burst.

import type { WeightedViolation } from './types.js';

export interface SynapseThresholds {
  readonly fire: Record<string, number>;  // per-family fire threshold
  readonly decayAlpha: number;             // default 0.05
  readonly refractorySeq: number;          // default 25
}

export const DEFAULT_SYNAPSE_THRESHOLDS: SynapseThresholds = {
  fire: {},
  decayAlpha: 0.05,
  refractorySeq: 25,
};

export class FamilyNeuron {
  private lambda = 0;
  private primed = false;
  private lastFireSeq = -1;

  constructor(readonly family: string, private thresholds: SynapseThresholds) {}

  accumulate(w: WeightedViolation, atSeq: number): void {
    const delta = this.lastFireSeq === -1 ? 0 : Math.max(0, atSeq - this.lastFireSeq);
    this.lambda = this.lambda * Math.exp(-this.thresholds.decayAlpha * delta) + w.weight;
    if (!this.primed) this.primed = true;
  }

  canFire(atSeq: number): boolean {
    const threshold = this.thresholds.fire[this.family] ?? 1.0;
    if (!this.primed || this.lambda < threshold) return false;
    if (this.lastFireSeq !== -1 && atSeq - this.lastFireSeq < this.thresholds.refractorySeq) return false;
    return true;
  }

  fire(atSeq: number): { family: string; lambda: number } {
    if (!this.canFire(atSeq)) {
      throw new Error(`SYNAPSE_INVARIANT: ${this.family} cannot fire at seq ${atSeq} (λ=${this.lambda})`);
    }
    const result = { family: this.family, lambda: this.lambda };
    this.lastFireSeq = atSeq;
    return result;
  }

  get value(): number { return this.lambda; }
  get isPrimed(): boolean { return this.primed; }

  restore(lambda: number, primed: boolean): void {
    this.lambda = lambda;
    this.primed = primed;
  }
}

export class V2Synapse {
  private readonly neurons = new Map<string, FamilyNeuron>();

  constructor(thresholds: SynapseThresholds = DEFAULT_SYNAPSE_THRESHOLDS) {
    // Neurons are created lazily per family (the domain defines the families)
    this.thresholds = thresholds;
  }

  private readonly thresholds: SynapseThresholds;

  private neuronFor(family: string): FamilyNeuron {
    let n = this.neurons.get(family);
    if (!n) {
      n = new FamilyNeuron(family, this.thresholds);
      this.neurons.set(family, n);
    }
    return n;
  }

  accumulate(w: WeightedViolation, atSeq: number): void {
    this.neuronFor(w.family).accumulate(w, atSeq);
  }

  canAnyFire(atSeq: number): boolean {
    for (const n of this.neurons.values()) if (n.canFire(atSeq)) return true;
    return false;
  }

  getNeuron(family: string): FamilyNeuron | undefined { return this.neurons.get(family); }

  snapshot(): Record<string, { lambda: number; primed: boolean }> {
    const out: Record<string, { lambda: number; primed: boolean }> = {};
    for (const [family, n] of this.neurons) {
      out[family] = { lambda: n.value, primed: n.isPrimed };
    }
    return out;
  }

  restore(snap: Record<string, { lambda?: number; primed?: boolean }>): void {
    for (const [family, st] of Object.entries(snap)) {
      this.neuronFor(family).restore(st.lambda ?? 0, st.primed ?? false);
    }
  }
}
