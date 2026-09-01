/**
 * Warhead interface — EVERY warhead implements this.
 *
 * WHY: Forces every warhead to provide:
 *   getT0() — returns REAL runtime counters (not hardcoded text)
 *   getStatus() — for evidence logging and debugging
 *
 * ANTI-PATTERN: A warhead that only has getT0() returning hardcoded text
 * but no real enforcement logic is THEATRICAL.
 */
export interface Warhead {
  /** Unique identifier, e.g. 'runtime-grade-intelligence' */
  id: string;
  /** Registration priority (lower = registered first) */
  priority: number;
  /** static = fixed T0, dynamic = T0 changes with state */
  type: 'static' | 'dynamic';

  /**
   * Optional async initialization.
   * Called once when the warhead is registered.
   * Use for: loading data, initializing connections, warming caches.
   * ANTI-PATTERN: init() that does nothing or only logs.
   */
  init?(): Promise<void>;

  /**
   * Get the T0 injectable string — injected into system prompt.
   * MUST return REAL runtime counters, not hardcoded text.
   *
   * ANTI-PATTERN: Returning a string like "[P1-P10 ENFORCEMENT] Active"
   * when no enforcement code has ever been triggered.
   * The counters MUST come from actual class properties that are
   * incremented in real hook handlers.
   */
  getT0(): string;

  /**
   * Get runtime status for evidence logging.
   * Returns real numbers: violation counts, scan counts, blocks, etc.
   */
  getStatus(): Record<string, number | string>;
}
