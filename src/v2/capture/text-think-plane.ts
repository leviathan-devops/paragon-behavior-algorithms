// src/v2/capture/text-think-plane.ts — THE <think> TAG FALLBACK (spec §2.2.2)
//
// Hypothesis 3 from the W6 finding: some models (Nemotron-via-NVIDIA class)
// embed thinking in TEXT parts instead of native reasoning parts. This plane
// scans text-part deltas for <think>/<thinking> blocks with a STREAMING TAG
// STATE MACHINE (bible §5.7 — the format-agnostic fallback: never assume one
// shape; the fallback is the second path into the SAME engine contract).
//
// THE STATE MACHINE (two states, streaming-safe across delta boundaries):
//   OUTSIDE — scanning for an open tag (<think> / <thinking>, case-insensitive).
//             Non-think text is DISCARDED (it is ordinary output, not thinking).
//   INSIDE  — accumulating inner text into the engine until a close tag
//             (</think> / </thinking>). Inner text is FED to the engine.
//
// THE BOUNDARY PROBLEM: a tag may straddle two deltas ("…<thi" + "nk>…").
// The machine therefore holds back a suffix of the buffer ONLY while that
// suffix is a case-insensitive PREFIX of a candidate tag — everything else is
// processed immediately. Holdback length is bounded by the longest tag minus 1
// ('<thinking' = 9 open-side, '</thinking' = 10 close-side), so the machine is
// O(delta) with a constant-size holdback window.
//
// THE NEVER-MUTATE LAW: input deltas are read-only strings; the machine owns
// its buffer. Part end (time.end) → finish() flushes any unterminated block's
// remainder, resets to OUTSIDE, and ends the engine (the final-flagged batch).

import { createBatchSink, StreamCaptureEngine, type BatchSink, type StreamBatch } from './stream-engine.js';
import { readPart, readMessageParts, type RuntimeEvent } from './reasoning-plane.js';

const OPEN_TAGS = ['<think>', '<thinking>'] as const;
const CLOSE_TAGS = ['</think>', '</thinking>'] as const;

/** Case-insensitive streaming regexes — mechanical DETECTORS only. */
const OPEN_RE = /<think(?:ing)?>/i;
const CLOSE_RE = /<\/think(?:ing)?>/i;

/**
 * Longest suffix of `buf` (≤ maxLen) that is a case-insensitive prefix of any
 * candidate tag — the ambiguous holdback window. Returns the LENGTH to keep.
 */
function holdbackLen(buf: string, tags: readonly string[], maxLen: number): number {
  if (buf.length === 0 || maxLen <= 0) return 0;
  const low = buf.toLowerCase();
  const kMax = Math.min(low.length, maxLen);
  for (let k = kMax; k >= 1; k--) {
    const suffix = low.slice(low.length - k);
    for (const tag of tags) {
      if (tag.toLowerCase().startsWith(suffix)) return k;
    }
  }
  return 0;
}

export class ThinkTagStateMachine {
  private inside = false;
  private buf = '';

  constructor(private readonly emitInner: (text: string) => void) {}

  /** Feed one incremental delta of TEXT-part content. */
  push(chunk: string): void {
    if (typeof chunk !== 'string' || chunk === '') return;
    this.buf += chunk;
    this.process();
  }

  /**
   * The part finalized: emit any held-back/unterminated inner text, reset to
   * OUTSIDE. Think blocks do not span parts — each part starts clean.
   */
  finish(): void {
    if (this.inside && this.buf !== '') this.emitInner(this.buf);
    this.reset();
  }

  reset(): void {
    this.inside = false;
    this.buf = '';
  }

  get isInThinkBlock(): boolean {
    return this.inside;
  }

  get bufferedChars(): number {
    return this.buf.length;
  }

  private process(): void {
    for (;;) {
      if (!this.inside) {
        const m = OPEN_RE.exec(this.buf);
        if (m === null) {
          // Keep only a possible partial-open-tag suffix; discard the rest
          // (outside text is not thinking — it was never going to be emitted).
          const keep = holdbackLen(this.buf, OPEN_TAGS, OPEN_TAGS[1].length - 1);
          this.buf = keep > 0 ? this.buf.slice(this.buf.length - keep) : '';
          return;
        }
        this.buf = this.buf.slice(m.index + m[0].length);
        this.inside = true;
      } else {
        const m = CLOSE_RE.exec(this.buf);
        if (m === null) {
          // Emit everything EXCEPT a possible partial-close-tag suffix.
          const keep = holdbackLen(this.buf, CLOSE_TAGS, CLOSE_TAGS[1].length - 1);
          const emitLen = this.buf.length - keep;
          if (emitLen > 0) {
            this.emitInner(this.buf.slice(0, emitLen));
            this.buf = this.buf.slice(emitLen);
          }
          return;
        }
        const inner = this.buf.slice(0, m.index);
        if (inner !== '') this.emitInner(inner);
        this.buf = this.buf.slice(m.index + m[0].length);
        this.inside = false;
      }
    }
  }
}

// ─── THE PLANE ────────────────────────────────────────────────────────────────

const thinkSink: BatchSink = createBatchSink();
export { thinkSink };

/** The text-think plane's engine — IDENTICAL contract, distinct plane label. */
export const thinkEngine = new StreamCaptureEngine({
  flushIntervalMs: 50,
  maxDeltaChars: 60,
  onBatch: (batch: StreamBatch) => thinkSink.push(batch),
});

const thinkMachine = new ThinkTagStateMachine((text: string) => {
  thinkEngine.delta(text);
});

/**
 * THE TEXT-PART FILTER → the tag state machine → the engine.
 * Same event filter discipline as the reasoning plane: non-matching types skip
 * in O(1); malformed payloads are read defensively; nothing is ever mutated.
 *
 * THE TAGLESS-REASONING CLASS (container evidence 2026-08-28, dist ed0090960):
 * the OpenAI-Responses model class (Muse Spark via Zen et al.) emits reasoning
 * as ENCRYPTED reasoning parts (metadata.reasoningEncryptedContent, text "")
 * and writes its deliberation as ORDINARY TEXT PARTS — no <think> tags at all.
 * The spec's OQ-3 ruling routes that public-reasoning channel through THIS
 * plane at reduced weight. Routing heuristic (per part):
 *   part contains a think-tag shape  → the tag state machine owns it (existing
 *     cross-part holdback semantics preserved for the tag-emitting classes);
 *   part has NO tag shape            → the text feeds the engine directly (the
 *     tagless class). A tag split across part boundaries (<thin|k>) degrades to
 *     a few raw noise chars for tag-emitting models — accepted, never observed.
 */
const THINK_TAG_SHAPE_RE = /<\/?think(?:ing)?/i;

export const thinkPlane = {
  onEvent(event: RuntimeEvent | null | undefined): void {
    if (event === null || event === undefined || event.type !== 'message.part.updated') return; // LAW 1
    const part = readPart(event); // 1.14.51: properties.part is a SINGLE object, not info.parts[]
    if (part === null || part === undefined) return;
    if (part.type === 'text' && typeof part.text === 'string' && part.text !== '') {
      thinkEngine.start(
        part.sessionID ?? '',
        part.messageID ?? '',
        part.id ?? '',
        'text-think',
        part.metadata,
      );
      if (THINK_TAG_SHAPE_RE.test(part.text)) {
        thinkMachine.push(part.text); // the tag-emitting class — the machine owns the part
      } else {
        thinkEngine.delta(part.text); // the tagless public-reasoning class (OQ-3)
      }
      if (typeof part.time?.end === 'number') {
        thinkMachine.finish(); // unterminated block → flush its remainder
        thinkEngine.end(); // the final-flagged batch
      }
    }
  },
  recentBatches: () => thinkSink.recentBatches(),
  batchCount: () => thinkSink.batchCount(),
  resetBatches: () => thinkSink.reset(),
  setConsumer: (c: ((batch: StreamBatch) => void) | null) => thinkSink.setConsumer(c),
  consumerFailures: () => thinkSink.consumerFailures,
  isActive: () => thinkEngine.isActive(),
  /** Test/diagnostic probe — the machine's current state. */
  machineState: () => ({ inside: thinkMachine.isInThinkBlock, bufferedChars: thinkMachine.bufferedChars }),
};
