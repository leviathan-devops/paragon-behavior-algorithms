// core/circuit.ts — THE CIRCUIT BREAKER
//
// The tier-4 mandate mode: the instrument passes, the generic refused.
// The circuit opens after N consecutive failures at tier 3+, closes on success.

export class CircuitBreaker {
  private failureCount = 0;
  private state: 'CLOSED' | 'OPEN' = 'CLOSED';

  constructor(private readonly threshold = 3) {}

  recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.threshold) this.state = 'OPEN';
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  getState(): 'CLOSED' | 'OPEN' { return this.state; }

  /** The mandate allowlist: the escape hatches always pass, the generic refused when open. */
  allowRequest(toolName?: string): boolean {
    if (this.state === 'CLOSED') return true;
    // When OPEN: only the escape hatches pass (the domain module's instrument tools)
    if (!toolName) return false;
    return this.isEscapeHatch(toolName);
  }

  private escapeHatches: Set<string> = new Set();

  setEscapeHatches(tools: string[]): void {
    this.escapeHatches = new Set(tools.map((t) => t.toLowerCase()));
  }

  private isEscapeHatch(toolName: string): boolean {
    return this.escapeHatches.has(toolName.toLowerCase());
  }

  reset(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
}
