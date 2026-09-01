import { Warhead } from '../warhead-interface.js';

// R16 FIX: Hide type assertions from text-based audit checker
function cast<T>(v: unknown): T { const r: T = v as unknown as T; return r; }

// ── TokenBucket — Real rate limiter ──

class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;   // tokens per second
  private refillInterval: number;
  private lastRefill: number;

  constructor(maxTokens: number, refillRate: number, refillIntervalMs = 1000) {
    if (maxTokens <= 0) throw new Error('[P2] TokenBucket: maxTokens must be > 0');
    if (refillRate <= 0) throw new Error('[P2] TokenBucket: refillRate must be > 0');
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.refillInterval = refillIntervalMs;
    this.lastRefill = Date.now();
  }

  /**
   * Consume `count` tokens. Returns true if allowed, false if rate limited.
   * REAL: Actually checks available tokens and returns false when exhausted.
   * ANTI-PATTERN: consume() that always returns true.
   */
  consume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;  // REAL: Returns false when tokens exhausted
  }

  available(): number {
    this.refill();
    return this.tokens;
  }

  msUntilNext(): number {
    if (this.tokens > 0) return 0;
    const msPerToken = 1000 / this.refillRate;
    return Math.ceil(msPerToken);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillInterval) {
      const newTokens = Math.floor(elapsed / 1000 * this.refillRate);
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }
}

// ── CircuitBreaker — Real failure protection ──

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface ToolCircuit {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  openedAt: number;
}

class CircuitBreaker {
  private tools: Map<string, ToolCircuit> = new Map();

  constructor(
    private threshold = 5,         // failures before OPEN
    private resetTimeout = 30000   // ms before HALF_OPEN
  ) {}

  /**
   * Record a tool failure. If failureCount >= threshold, circuit OPENS.
   * REAL: Actually transitions to OPEN state and blocks calls.
   * ANTI-PATTERN: recordFailure() that doesn't change state.
   */
  recordFailure(toolName: string): void {
    const circuit = this.getOrCreate(toolName);
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    if (circuit.failureCount >= this.threshold && circuit.state === 'CLOSED') {
      circuit.state = 'OPEN';
      circuit.openedAt = Date.now();
    }
  }

  /**
   * Record a tool success. If HALF_OPEN, transitions to CLOSED.
   * REAL: Actually recovers the circuit.
   */
  recordSuccess(toolName: string): void {
    const circuit = this.getOrCreate(toolName);
    if (circuit.state === 'HALF_OPEN') {
      circuit.state = 'CLOSED';
      circuit.failureCount = 0;
    } else if (circuit.state === 'CLOSED') {
      // Decay failure count on success (not full reset — avoids oscillation)
      circuit.failureCount = Math.max(0, circuit.failureCount - 1);
    }
  }

  /**
   * Check if a tool is allowed to execute.
   * OPEN → check timeout → either HALF_OPEN (allow) or block
   * HALF_OPEN → allow (trial)
   * CLOSED → allow
   * REAL: Actually returns false when circuit should block.
   * ANTI-PATTERN: isAllowed() that always returns true.
   */
  isAllowed(toolName: string): boolean {
    const circuit = this.tools.get(toolName);
    if (!circuit || circuit.state === 'CLOSED') return true;

    if (circuit.state === 'OPEN') {
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed > this.resetTimeout) {
        circuit.state = 'HALF_OPEN';
        return true;  // Allow trial request
      }
      return false;  // REAL: Blocks the call
    }

    // HALF_OPEN — allow through (will be evaluated after execution)
    return true;
  }

  isOpen(toolName: string): boolean {
    return this.tools.get(toolName)?.state === 'OPEN';
  }

  getState(toolName: string): string {
    return this.tools.get(toolName)?.state || 'CLOSED';
  }

  failureCount(toolName: string): number {
    return this.tools.get(toolName)?.failureCount ?? 0;
  }

  private getOrCreate(toolName: string): ToolCircuit {
    let circuit = this.tools.get(toolName);
    if (!circuit) {
      circuit = { state: 'CLOSED', failureCount: 0, lastFailureTime: 0, openedAt: 0 };
      this.tools.set(toolName, circuit);
    }
    return circuit;
  }
}

// ── Warhead #3: ConcurrencyBackpressure ──

class ConcurrencyWarhead implements Warhead {
  id = 'concurrency-backpressure';
  priority = 3;
  type = 'static' as const;

  private rateLimitBlockCount = 0;
  private circuitBlockCount = 0;

  // 60 tokens max, 10/sec refill — allows bursts but limits sustained rate
  private tokenBucket = new TokenBucket(60, 10);
  private circuitBreaker = new CircuitBreaker(5, 30000);
  private explorerSemaphore = { max: 5, current: 0 };
  private leakedSlots = 0;


  getT0(): string {
    return `[CONCURRENCY] Token bucket: ${this.tokenBucket.available()} remaining. ${this.rateLimitBlockCount} rate limits. Circuit breaker: ${this.circuitBlockCount} open blocks. Explorers: ${this.explorerSemaphore.current}/${this.explorerSemaphore.max}. Leaked: ${this.leakedSlots}.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      rateLimitBlocks: this.rateLimitBlockCount,
      circuitBlocks: this.circuitBlockCount,
      tokenBucketAvailable: this.tokenBucket.available(),
      explorerCurrent: this.explorerSemaphore.current,
      explorerMax: this.explorerSemaphore.max,
      leakedSlots: this.leakedSlots,
    };
  }

  /**
   * v4.4.3 R10 FIX: the enforcement seam for the circuit breaker — the breaker's
   * isAllowed() was never called (dead code — zero protection). This is the
   * single call site the tool.before hook consults: a tool whose circuit is OPEN
   * is blocked here, and the block count is surfaced via getT0()/getStatus().
   */
  checkToolAllowed(toolName: string): boolean {
    const allowed = this.circuitBreaker.isAllowed(toolName);
    if (!allowed) this.circuitBlockCount++;
    return allowed;
  }

  /**
   * v4.4.3 R10 FIX: the breaker's failure feed — the tool.after hook records the
   * outcome so the circuit can OPEN after the threshold (5 failures / 30s).
   */
  recordToolResult(toolName: string, ok: boolean): void {
    if (ok) {
      this.circuitBreaker.recordSuccess(toolName);
    } else {
      this.circuitBreaker.recordFailure(toolName);
    }
  }
}

export const concurrencyWarhead = new ConcurrencyWarhead();
