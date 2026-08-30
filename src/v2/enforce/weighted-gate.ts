import type { EvidenceRecord } from './evidence-record.js';

export interface WeightedCriterion {
  name: string;
  weight: number;
  test: (evidence: EvidenceRecord[]) => boolean;
}

export interface WeightedGateDetail {
  name: string;
  weight: number;
  matched: boolean;
}

export interface WeightedGateResult {
  passed: boolean;
  score: number;
  details: WeightedGateDetail[];
}

export class WeightedGate {
  private readonly criteria: WeightedCriterion[];
  private readonly threshold: number;

  constructor(criteria: WeightedCriterion[], threshold = 0.7) {
    if (!Array.isArray(criteria)) {
      throw new Error('WeightedGate: criteria must be an array');
    }
    if (criteria.length === 0) {
      throw new Error('WeightedGate: at least one criterion is required');
    }
    if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error('WeightedGate: threshold must be a finite number in [0,1]');
    }
    for (const c of criteria) {
      if (!c || typeof c.name !== 'string' || c.name.length === 0) {
        throw new Error('WeightedGate: each criterion requires a non-empty name');
      }
      if (typeof c.weight !== 'number' || !Number.isFinite(c.weight) || c.weight < 0) {
        throw new Error(`WeightedGate: criterion "${c.name}" weight must be a finite non-negative number`);
      }
      if (typeof c.test !== 'function') {
        throw new Error(`WeightedGate: criterion "${c.name}" test must be a function`);
      }
    }
    const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
    if (totalWeight <= 0) {
      throw new Error('WeightedGate: total weight must be > 0');
    }
    this.criteria = [...criteria];
    this.threshold = threshold;
  }

  evaluate(evidence: EvidenceRecord[]): WeightedGateResult {
    const safeEvidence: EvidenceRecord[] = Array.isArray(evidence) ? evidence : [];
    const details: WeightedGateDetail[] = [];
    let matchedWeight = 0;
    const totalWeight = this.criteria.reduce((s, c) => s + c.weight, 0);

    for (const c of this.criteria) {
      let matched = false;
      try {
        matched = c.test(safeEvidence) === true;
      } catch {
        matched = false;
      }
      details.push({ name: c.name, weight: c.weight, matched });
      if (matched) matchedWeight += c.weight;
    }

    const score = totalWeight === 0 ? 0 : matchedWeight / totalWeight;
    const passed = score >= this.threshold;
    return { passed, score, details };
  }

  getThreshold(): number {
    return this.threshold;
  }

  getCriteria(): WeightedCriterion[] {
    return [...this.criteria];
  }
}
