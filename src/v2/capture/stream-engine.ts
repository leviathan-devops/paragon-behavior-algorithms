// src/v2/capture/stream-engine.ts — THE V2 STREAM CAPTURE ENGINE (spec §2.2.0)
//
// The accumulator class behind every v2 capture plane. Fork of the HIVE 4.0
// proven ReasoningCaptureEngine contract (REASONING_TOKEN_CAPTURE_WIRING.md §4,
// bible §2.1) adapted to v2: the batch carries a `plane` discriminator so the
// corpus ledger can compare yields per plane/model/provider.
//
// THE CONTRACT:
//   start(sessionID, messageID, partID, plane, metadata?) — open a capture ctx
//   delta(text)                — append the incremental text
//   end()                      — the part finalized → the final-flagged batch
//   flush(force?)              — exposed for DETERMINISTIC TESTING: the battery
//                                drives flush rules manually (zero timers).
//
// THE FLUSH RULES (bible §2.1 decision #2 — any ONE fires the batch):
//   1. ≥ flushIntervalMs elapsed since the last flush (the timer, default 50ms)
//   2. ≥ maxDeltaChars new chars accumulated (default 60)
//   3. the part's end-marker (end() → the final:true batch)
//
// THE FOUR LOAD-BEARING DECISIONS (bible §2.1, held verbatim):
//   1. INCREMENTAL CONTRACT — start/delta/end, never onComplete. The consumer
//      reacts DURING the stream.
//   2. MULTI-RULE FLUSH — time OR volume OR final-marker.
//   3. NON-AWAITED onBatch — fire-and-forget; the hook phase never blocks on
//      the consumer (the 50ms sync-budget law).
//   4. THE NEVER-MUTATE LAW — the engine accumulates its OWN buffers
//      (`chain`/`pending`); the input parts are READ-ONLY. The observer law
//      (bible §5.4): a capture plane that mutates the stream is a corruption.
//
// DETERMINISM: `flushIntervalMs: 0` disables the wall-clock timer entirely —
// the battery constructs engines this way and drives flush(force) manually.
// No assertion in the battery ever reads a clock.
//
// ERROR-PATH LAW (R4): every swallow site is COUNTED, never silent — the
// tick/consumer failure counters are observable state.

export type CapturePlane = 'reasoning' | 'text-think';

export interface StreamBatch {
  sessionID: string;
  messageID: string;
  partID: string;
  delta: string; // text since the last flush
  cumulative: string; // the FULL chain so far (our own copy)
  tokenApprox: number; // chars/4 — the same heuristic the gate uses
  ts: number; // epoch-ms
  final?: boolean; // true on the part's end-marker flush
  plane: CapturePlane; // the source discriminator (which plane captured this)
}

export interface EngineOpts {
  flushIntervalMs?: number; // default 50 — BECAUSE: the bible's proven cadence
  maxDeltaChars?: number; // default 60 — BECAUSE: the bible's proven volume rule
  onBatch: (batch: StreamBatch) => void; // non-awaited — the hook phase never blocks
}

interface CaptureContext {
  sessionID: string;
  messageID: string;
  partID: string;
  plane: CapturePlane;
  metadata?: unknown; // stored for the downstream lexicon wave; NOT on the batch (contract fidelity, spec §2.2.0)
}

const DEFAULT_FLUSH_INTERVAL_MS = 50;
const DEFAULT_MAX_DELTA_CHARS = 60;

export class StreamCaptureEngine {
  private chain = ''; // cumulative — OUR copy (the NEVER-MUTATE law)
  private pending = ''; // since the last flush
  private ctx: CaptureContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ended = false; // latch: post-end flushes emit NOTHING (no ghost batches)
  private tickFailures = 0; // R4: counted swallows — the timer tick's error path

  constructor(private readonly opts: EngineOpts) {}

  /**
   * Open a capture context.
   *
   * CONTINUATION SEMANTICS (the runtime truth, WIRING §3): message.updated
   * fires REPEATEDLY for the same part as its text streams in — part.text is
   * the INCREMENTAL delta. A start() for the SAME live partID therefore
   * CONTINUES the chain (cumulative = the FULL chain, the contract at WIRING
   * §4 line 104); a NEW partID (or a start after end()) opens FRESH buffers.
   */
  start(sessionID: string, messageID: string, partID: string, plane: CapturePlane, metadata?: unknown): void {
    const continuing =
      this.ctx !== null && !this.ended && this.ctx.partID === partID && this.ctx.plane === plane;
    if (!continuing) {
      this.chain = '';
      this.pending = '';
      this.ended = false;
    }
    this.ctx = { sessionID, messageID, partID, plane, metadata };
    if (this.timer === null) {
      const ms = this.opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
      if (ms > 0) {
        this.timer = setInterval(() => {
          try {
            this.flush();
          } catch {
            // the timer tick never breaks the stream loop (C-28 pattern); COUNTED
            this.tickFailures += 1;
          }
        }, ms);
        // Never hold the host process alive for a capture timer.
        const t = this.timer as unknown as { unref?: () => void };
        if (typeof t.unref === 'function') t.unref();
      }
    }
  }

  /** Append the incremental text. Fires the volume rule when the threshold is met. */
  delta(text: string): void {
    if (this.ctx === null || this.ended) return;
    if (typeof text !== 'string' || text === '') return;
    this.chain += text; // string concat = OUR immutable copy; the input is never touched
    this.pending += text;
    if (this.pending.length >= (this.opts.maxDeltaChars ?? DEFAULT_MAX_DELTA_CHARS)) this.flush();
  }

  /** The part finalized → the final-flagged batch + the timer cleared. */
  end(): void {
    if (this.ctx === null || this.ended) return;
    this.ended = true;
    this.emit(true);
    this.pending = '';
    this.stopTimer();
  }

  /**
   * Manual flush — the deterministic test driver AND the timer's body.
   * force=false: emit only when pending is non-empty (the timer-tick semantics).
   * force=true:  emit even with empty pending (the battery's manual crank);
   *              a post-end forced flush is a no-op (the ended latch).
   */
  flush(force = false): void {
    if (this.ctx === null || this.ended) return;
    if (!force && this.pending === '') return;
    this.emit(false);
    this.pending = '';
  }

  /** True between start() and end() — the plane-health probe. */
  isActive(): boolean {
    return this.ctx !== null && !this.ended;
  }

  /** Counted timer-tick failures (R4 — the swallow sites are never silent). */
  get failures(): number {
    return this.tickFailures;
  }

  private emit(final: boolean): void {
    if (this.ctx === null) return;
    const batch: StreamBatch = {
      sessionID: this.ctx.sessionID,
      messageID: this.ctx.messageID,
      partID: this.ctx.partID,
      delta: this.pending,
      cumulative: this.chain,
      tokenApprox: this.chain.length / 4,
      ts: Date.now(),
      plane: this.ctx.plane,
    };
    if (final) batch.final = true;
    this.opts.onBatch(batch);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// ─── THE BATCH SINK — the bounded observation buffer shared by the planes ────
// The engine emits; the sink COLLECTS (bible §2.1 decision #3: onBatch is
// non-awaited). The ring is the v2 corpus feed seam: the lexicon wave (W3+)
// consumes recentBatches() or registers a push-consumer via setConsumer().
// Default behavior without a consumer: bounded retention, zero loss-up-to-cap,
// zero blocking — the observation plane stays passive. Consumer errors are
// COUNTED (R4), never silently dropped.

const BATCH_SINK_CAP = 256;

export interface BatchSink {
  push(batch: StreamBatch): void;
  recentBatches(): StreamBatch[];
  batchCount(): number;
  setConsumer(consumer: ((batch: StreamBatch) => void) | null): void;
  reset(): void;
  readonly consumerFailures: number; // R4: counted consumer swallows
}

export function createBatchSink(): BatchSink {
  const ring: StreamBatch[] = [];
  let consumer: ((batch: StreamBatch) => void) | null = null;
  let consumerFailures = 0;
  return {
    push(batch: StreamBatch): void {
      ring.push(batch);
      if (ring.length > BATCH_SINK_CAP) ring.shift();
      try {
        if (consumer !== null) consumer(batch); // a consumer error never breaks the plane
      } catch {
        consumerFailures += 1; // COUNTED — the observer loop never breaks
      }
    },
    recentBatches(): StreamBatch[] {
      return [...ring];
    },
    batchCount(): number {
      return ring.length;
    },
    setConsumer(c: ((batch: StreamBatch) => void) | null): void {
      consumer = c;
    },
    reset(): void {
      ring.length = 0;
    },
    get consumerFailures(): number {
      return consumerFailures;
    },
  };
}
