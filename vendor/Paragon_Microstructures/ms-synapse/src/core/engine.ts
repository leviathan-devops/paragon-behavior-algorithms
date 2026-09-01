import type { V2Thresholds, NeuronSnapshot } from './types.js';

export class FamilyNeuron {
  private lambda: number = 0;
  private primed: boolean = false;
  private lastAccumSeq: number = 0;
  private lastFireSeq: number = -1e9;
  private currentSeq: number = 0;
  private readonly threshold: number;
  private readonly decayAlpha: number;
  private readonly refractorySeq: number;

  constructor(threshold: number, decayAlpha = 0.05, refractorySeq = 25) {
    if (!Number.isFinite(threshold)) throw new TypeError('threshold must be finite');
    if (!Number.isFinite(decayAlpha) || decayAlpha < 0) throw new TypeError('decayAlpha must be finite >=0');
    if (!Number.isFinite(refractorySeq) || refractorySeq < 0) throw new TypeError('refractorySeq must be finite >=0');
    this.threshold = threshold;
    this.decayAlpha = decayAlpha;
    this.refractorySeq = refractorySeq;
  }

  accumulate(weight: number, atSeq: number): void {
    if (!Number.isFinite(weight)) throw new TypeError('weight must be finite');
    if (!Number.isFinite(atSeq)) throw new TypeError('atSeq must be finite');
    if (weight < 0) throw new RangeError('weight must be >=0');
    const delta = atSeq - this.lastAccumSeq;
    if (delta < 0) throw new RangeError(`atSeq must be >= lastAccumSeq (${this.lastAccumSeq}), got ${atSeq}`);
    if (this.primed || this.lambda !== 0) {
      this.lambda = this.lambda * Math.exp(-this.decayAlpha * delta) + weight;
    } else {
      if (delta === 0) {
        this.lambda = weight;
      } else {
        this.lambda = this.lambda * Math.exp(-this.decayAlpha * delta) + weight;
      }
    }
    this.primed = true;
    this.lastAccumSeq = atSeq;
    this.currentSeq = atSeq;
  }

  canFire(): boolean {
    if (!this.primed) return false;
    if (this.lambda < this.threshold) return false;
    if (this.currentSeq - this.lastFireSeq < this.refractorySeq) return false;
    return true;
  }

  fire(): void {
    if (!this.canFire()) {
      throw new Error(`cannot fire: primed=${this.primed} lambda=${this.lambda} threshold=${this.threshold} seq=${this.currentSeq} lastFire=${this.lastFireSeq}`);
    }
    this.lastFireSeq = this.currentSeq;
  }

  value(): number {
    return this.lambda;
  }

  boostBaseline(amount: number): void {
    if (!Number.isFinite(amount)) throw new TypeError('amount must be finite');
    if (amount < 0) throw new RangeError('amount must be >=0');
    this.lambda += amount;
    this.primed = true;
  }

  restore(snapshot: NeuronSnapshot): void {
    if (!snapshot || typeof snapshot !== 'object') throw new TypeError('snapshot required');
    if (!Number.isFinite(snapshot.lambda)) throw new TypeError('snapshot.lambda must be finite');
    if (typeof snapshot.primed !== 'boolean') throw new TypeError('snapshot.primed must be boolean');
    if (!Number.isFinite(snapshot.lastAccumSeq)) throw new TypeError('snapshot.lastAccumSeq must be finite');
    if (!Number.isFinite(snapshot.lastFireSeq)) throw new TypeError('snapshot.lastFireSeq must be finite');
    if (!Number.isFinite(snapshot.currentSeq)) throw new TypeError('snapshot.currentSeq must be finite');
    this.lambda = snapshot.lambda;
    this.primed = snapshot.primed;
    this.lastAccumSeq = snapshot.lastAccumSeq;
    this.lastFireSeq = snapshot.lastFireSeq;
    this.currentSeq = snapshot.currentSeq;
  }

  snapshot(): NeuronSnapshot {
    return {
      lambda: this.lambda,
      primed: this.primed,
      lastAccumSeq: this.lastAccumSeq,
      lastFireSeq: this.lastFireSeq,
      currentSeq: this.currentSeq,
    };
  }

  getThreshold(): number {
    return this.threshold;
  }
}

export class V2Synapse {
  private neurons: Map<string, FamilyNeuron> = new Map();
  private readonly thresholds: V2Thresholds;

  constructor(thresholds: V2Thresholds) {
    if (!thresholds || typeof thresholds !== 'object') throw new TypeError('thresholds required');
    if (!thresholds.fire || typeof thresholds.fire !== 'object') throw new TypeError('thresholds.fire required');
    if (!Number.isFinite(thresholds.decayAlpha)) throw new TypeError('thresholds.decayAlpha must be finite');
    if (!Number.isFinite(thresholds.refractorySeq)) throw new TypeError('thresholds.refractorySeq must be finite');
    this.thresholds = thresholds;
    for (const [family, thr] of Object.entries(thresholds.fire)) {
      if (!Number.isFinite(thr)) throw new TypeError(`threshold for ${family} must be finite`);
      this.neurons.set(family, new FamilyNeuron(thr, thresholds.decayAlpha, thresholds.refractorySeq));
    }
  }

  private ensureNeuron(family: string): FamilyNeuron {
    let n = this.neurons.get(family);
    if (!n) {
      const thr = this.thresholds.fire[family];
      if (thr === undefined) throw new Error(`no threshold for family ${family}`);
      n = new FamilyNeuron(thr, this.thresholds.decayAlpha, this.thresholds.refractorySeq);
      this.neurons.set(family, n);
    }
    return n;
  }

  accumulate(violation: { familyId?: string; weight: number; family?: string }, seq: number): void {
    if (!violation || typeof violation !== 'object') throw new TypeError('violation required');
    if (!Number.isFinite(seq)) throw new TypeError('seq must be finite');
    const family = (violation as unknown as Record<string, unknown>).familyId as string ?? (violation as unknown as Record<string, unknown>).family as string ?? 'default';
    if (typeof family !== 'string' || family.length === 0) throw new TypeError('violation must have familyId or family');
    const weight = violation.weight;
    if (!Number.isFinite(weight)) throw new TypeError('violation.weight must be finite');
    const neuron = this.ensureNeuron(family);
    neuron.accumulate(weight, seq);
  }

  canAnyFire(): boolean {
    for (const n of this.neurons.values()) {
      if (n.canFire()) return true;
    }
    return false;
  }

  getNeuron(family: string): FamilyNeuron {
    if (typeof family !== 'string' || family.length === 0) throw new TypeError('family required');
    return this.ensureNeuron(family);
  }

  snapshot(): Record<string, NeuronSnapshot> {
    const out: Record<string, NeuronSnapshot> = {};
    for (const [k, n] of this.neurons.entries()) {
      out[k] = n.snapshot();
    }
    return out;
  }

  restore(snap: Record<string, NeuronSnapshot>): void {
    if (!snap || typeof snap !== 'object') throw new TypeError('snapshot required');
    for (const [k, v] of Object.entries(snap)) {
      const n = this.ensureNeuron(k);
      n.restore(v);
    }
  }
}
