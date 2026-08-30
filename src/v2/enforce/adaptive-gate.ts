/**
 * AdaptiveGate — threshold adaptation from pass-rate history.
 *
 * Doctrine anchor: 02_STATE Appendix C (02_STATE:8234-8268) — AdaptiveGate
 * with constructor(initialThreshold, adaptationRate, windowSize),
 * recordEvaluation(passed) and threshold adjustment toward an 80% target.
 *
 * RE-SCOPED PER PLAN SM2 (V2_CORRECTED_OVERHAUL_PLAN.md §3.5 / §1.3 SM2):
 * The doctrine's AdaptiveGate adapts a generic pass-rate threshold from history.
 * The superseded spec mis-scoped it as the OFF/STEER/FULL dial (which already
 * exists in shared-state.ts). Per the corrected plan SM2, this gate is
 * re-scoped to compliance-deadline adaptation: the threshold here adapts the
 * compliance-deadline window sizing. The mechanism is identical — threshold
 * moves toward the 80% compliance target — but the *interpretation* is the
 * deadline calibration, not the global level dial. The header documents the
 * re-scope verbatim per the plan so future waves (W3/W5 consumers) read the
 * correct semantics.
 *
 * Escalation mapping (plan §3.5): demand depends on steer-fired, deny depends
 * on demand-fired, lock depends on 3 denials — the DependencyGateChain encodes
 * those prerequisites; this gate tunes how quickly the deadline tightens.
 */

export class AdaptiveGate {
  private threshold: number;
  private readonly adaptationRate: number;
  private readonly windowSize: number;
  private readonly history: boolean[] = [];

  private static readonly TARGET_RATE = 0.8;

  constructor(initialThreshold: number, adaptationRate: number, windowSize: number) {
    if (typeof initialThreshold !== 'number' || !Number.isFinite(initialThreshold) || initialThreshold < 0 || initialThreshold > 1) {
      throw new Error('AdaptiveGate: initialThreshold must be a finite number in [0,1]');
    }
    if (typeof adaptationRate !== 'number' || !Number.isFinite(adaptationRate) || adaptationRate <= 0 || adaptationRate > 1) {
      throw new Error('AdaptiveGate: adaptationRate must be a finite number in (0,1]');
    }
    if (typeof windowSize !== 'number' || !Number.isFinite(windowSize) || !Number.isInteger(windowSize) || windowSize < 1) {
      throw new Error('AdaptiveGate: windowSize must be a positive integer');
    }
    this.threshold = initialThreshold;
    this.adaptationRate = adaptationRate;
    this.windowSize = windowSize;
  }

  recordEvaluation(passed: boolean): void {
    if (typeof passed !== 'boolean') {
      throw new Error('AdaptiveGate: passed must be a boolean');
    }
    this.history.push(passed);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }
    if (this.history.length < this.windowSize) return;

    const passCount = this.history.filter(Boolean).length;
    const passRate = passCount / this.history.length;
    const target = AdaptiveGate.TARGET_RATE;

    if (passRate > target) {
      this.threshold = Math.min(1, this.threshold + this.adaptationRate * (passRate - target));
    } else if (passRate < target) {
      this.threshold = Math.max(0, this.threshold - this.adaptationRate * (target - passRate));
    }
  }

  getThreshold(): number {
    return this.threshold;
  }

  getHistory(): readonly boolean[] {
    return [...this.history];
  }

  getAdaptationRate(): number {
    return this.adaptationRate;
  }

  getWindowSize(): number {
    return this.windowSize;
  }

  reset(): void {
    this.history.length = 0;
  }
}
