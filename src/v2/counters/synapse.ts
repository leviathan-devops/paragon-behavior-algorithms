// src/v2/counters/synapse.ts — THE COUNTER SYNAPSE (spec §2.5)
// Per-family decay accumulator: A_λ = λ·e^(−α·Δseq) + w
// Pure math — no IO, no wall-clock, seq-driven only.
// Thresholds are VERSIONED DATA (thr-v2 register), never literals in logic.

import type { ViolationFamily, WeightedViolation } from '../contracts.js';

export interface V2Thresholds {
  readonly fire: Record<ViolationFamily, number>;
  readonly decayAlpha: number;
  readonly refractorySeq: number;
}

export const THR_V2_DEFAULTS: V2Thresholds = {
  fire: {
    FORGERY_INTENT: 0.9,
    THEATRICAL_PLANNING: 1.4,
    DOUBT_HEDGE: 1.8,
    PERMISSION_GATE: 1.8,
    SCOPE_SHRINK: 1.6,
    TEST_EVASION: 1.2,
  },
  decayAlpha: 0.05,
  refractorySeq: 25,
};

export class FamilyNeuron {
  private lambda = 0;
  private primed = false;
  private lastFireSeq = -1;

  constructor(readonly family: ViolationFamily, private thresholds: V2Thresholds) {}

  accumulate(w: WeightedViolation, atSeq: number): void {
    const delta = this.lastFireSeq === -1 ? 0 : Math.max(0, atSeq - this.lastFireSeq);
    this.lambda = this.lambda * Math.exp(-this.thresholds.decayAlpha * delta) + w.weight;
    if (!this.primed) this.primed = true;
    if (this.lambda >= this.thresholds.fire[this.family]) { /* threshold crossed — canFire checks */ }
  }

  canFire(atSeq: number): boolean {
    if (!this.primed || this.lambda < this.thresholds.fire[this.family]) return false;
    if (this.lastFireSeq !== -1 && atSeq - this.lastFireSeq < this.thresholds.refractorySeq) return false;
    return true;
  }

  fire(atSeq: number): { family: ViolationFamily; lambda: number } {
    if (!this.canFire(atSeq)) throw new Error(`SYNAPSE_INVARIANT: ${this.family} cannot fire at seq ${atSeq} (λ=${this.lambda})`);
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

const ALL_FAMILIES: ViolationFamily[] = ['FORGERY_INTENT','THEATRICAL_PLANNING','DOUBT_HEDGE','PERMISSION_GATE','SCOPE_SHRINK','TEST_EVASION'];

export class V2Synapse {
  private readonly neurons = new Map<ViolationFamily, FamilyNeuron>();

  constructor(thresholds: V2Thresholds = THR_V2_DEFAULTS) {
    for (const f of ALL_FAMILIES) this.neurons.set(f, new FamilyNeuron(f, thresholds));
  }

  accumulate(w: WeightedViolation, atSeq: number): void {
    const n = this.neurons.get(w.family);
    if (n) n.accumulate(w, atSeq);
  }

  canAnyFire(atSeq: number): boolean {
    for (const n of this.neurons.values()) if (n.canFire(atSeq)) return true;
    return false;
  }

  getNeuron(family: ViolationFamily): FamilyNeuron | undefined { return this.neurons.get(family); }

  // ═══ THE SNAPSHOT CONTRACT (spec §2.5 — counters/synapse-state.json restart
  // recovery; HT-BUG-4's amnesia class applies to λ curves exactly as it did to
  // the machine record).
  snapshot(): Record<string, { lambda: number; primed: boolean }> {
    const out: Record<string, { lambda: number; primed: boolean }> = {};
    for (const [family, n] of this.neurons) {
      out[family] = { lambda: n.value, primed: n.isPrimed };
    }
    return out;
  }

  restore(snap: Record<string, { lambda?: number; primed?: boolean }>): void {
    for (const [family, st] of Object.entries(snap)) {
      this.neurons.get(family as ViolationFamily)?.restore(st.lambda ?? 0, st.primed ?? false);
    }
  }
}
