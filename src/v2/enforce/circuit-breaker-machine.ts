export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreakerMachine {
  private readonly threshold: number;
  private readonly timeoutMs: number;
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime: number | null = null;

  constructor(threshold = 3, timeoutMs = 0) {
    if (!Number.isFinite(threshold) || !Number.isInteger(threshold) || threshold < 1) {
      this.threshold = 3;
    } else {
      this.threshold = threshold;
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
      this.timeoutMs = 0;
    } else {
      this.timeoutMs = Math.floor(timeoutMs);
    }
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
    this.lastFailureTime = null;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold && this.state !== 'open') {
      this.state = 'open';
    }
  }

  allowRequest(toolName?: string): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'half-open') return true;
    if (this.timeoutMs > 0 && this.lastFailureTime !== null) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.timeoutMs) {
        this.state = 'half-open';
        return true;
      }
    }
    if (typeof toolName === 'string' && toolName.toLowerCase().includes('trident-problem-solving')) return true;
    return false;
  }

  isSolveMandateActive(): boolean {
    return this.state === 'open';
  }

  allowMandateRequest(toolName?: string): boolean {
    return this.allowRequest(toolName);
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }
}
