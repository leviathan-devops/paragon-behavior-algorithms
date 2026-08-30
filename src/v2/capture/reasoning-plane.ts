// src/v2/capture/reasoning-plane.ts — THE NATIVE-PART PATH (spec §2.2.1)
//
// THE RECIPE AUTHORITY (R7): REASONING_TOKEN_CAPTURE_WIRING(1).md — the
// CORRECTED 1.14.51 recipe. The old doc's `message.updated` + `info.parts`
// path was WRONG — that path is empty on this runtime. THE CORRECT READ:
//   event.type === 'message.part.updated'
//   event.properties.part → { type: "reasoning", text: string, ... }
//
// THE NEVER-MUTATE LAW: this plane only READS the parts; the engine stores its
// own copies. The runtime's reasoning text is never mutated.
//
// THIS FILE ALSO HOSTS THE CAPTURE-LOCAL EVENT VOCABULARY (RuntimeEvent /
// RuntimeMessagePart): src/v2/contracts.ts is types-only, and capture planes
// are the only consumers of these shapes — so the vocabulary lives at its first
// consumer, imported by the other planes. No cycles: planes never import the router.

import { createBatchSink, StreamCaptureEngine, type BatchSink, type CapturePlane, type StreamBatch } from './stream-engine.js';

// ─── THE RUNTIME EVENT VOCABULARY (the defensive reader bridge) ──────────────

export interface RuntimeEvent {
  type: string;
  properties?: unknown;
}

export interface RuntimeMessagePart {
  type?: string;
  sessionID?: string;
  messageID?: string;
  id?: string;
  text?: string;
  metadata?: unknown;
  time?: { end?: number };
  tool?: string;
  [key: string]: unknown;
}

/**
 * THE PART READER for message.part.updated (1.14.51 shape).
 * Returns event.properties.part as a single part object (or null).
 */
export function readPart(event: RuntimeEvent | null | undefined): RuntimeMessagePart | null {
  if (event === null || event === undefined) return null;
  const props = event.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== 'object') return null;
  const part = props['part'];
  if (part !== null && typeof part === 'object') return part as RuntimeMessagePart;
  return null;
}

// ── THE MESSAGE ROLE GATE (the operator-speech firewall, 2026-08-28) ─────────
// The watchdog watches THE MODEL — never the operator. User-authored message
// parts must NEVER feed the lexicon/behavioral planes: the operator typing
// 'skip the tests' inside a prompt must not arm the machine. The contamination
// class was OBSERVED in the overhaul container session: user-prompt bait text
// triggered the FI-1 path and the behavioral claim tracker, fabricating
// scenario verdicts against a DEAD model (Not Found / DEGRADED turns).
//
// THE MECHANISM: role lives on the MESSAGE record (message.updated →
// properties.info.role), not on the part. This gate caches messageID → role
// from message.updated envelopes (bounded, oldest-evicted) and answers
// roleFor(partEvent). FAIL-CLOSED: a part whose message role is unknown is
// DROPPED — unattributed text never reaches the watchdog.
const ROLE_CACHE_CAP = 512;

export class MessageRoleGate {
  private readonly roles = new Map<string, string>();

  /** Feed EVERY event — message.updated envelopes build the role cache. */
  observe(event: RuntimeEvent | null | undefined): void {
    if (event === null || event === undefined || event.type !== 'message.updated') return;
    const props = event.properties as Record<string, unknown> | undefined;
    const info = props !== undefined && typeof props['info'] === 'object' && props['info'] !== null
      ? (props['info'] as Record<string, unknown>)
      : undefined;
    if (info === undefined) return;
    const id = typeof info['id'] === 'string' ? info['id'] : '';
    const role = typeof info['role'] === 'string' ? info['role'] : '';
    if (id === '' || role === '') return;
    if (this.roles.size >= ROLE_CACHE_CAP && !this.roles.has(id)) {
      const oldest = this.roles.keys().next().value;
      if (typeof oldest === 'string') this.roles.delete(oldest);
    }
    this.roles.set(id, role);
  }

  /**
   * The role for a part-bearing event: 'assistant' | 'user' | '' (unknown →
   * the caller must fail-closed). Checks the envelope's own info.role first
   * (defensive — some runtimes inline it), then the message.updated cache.
   */
  roleFor(event: RuntimeEvent | null | undefined): string {
    if (event === null || event === undefined) return '';
    const props = event.properties as Record<string, unknown> | undefined;
    if (props !== undefined && typeof props['info'] === 'object' && props['info'] !== null) {
      const info = props['info'] as Record<string, unknown>;
      if (typeof info['role'] === 'string' && info['role'] !== '') return info['role'];
    }
    const part = readPart(event);
    const mid = typeof part?.messageID === 'string' ? part.messageID : '';
    if (mid === '') return '';
    return this.roles.get(mid) ?? '';
  }
}

/** Legacy parts-array reader — kept for the text-think fallback path only. */
export function readMessageParts(event: RuntimeEvent | null | undefined): RuntimeMessagePart[] {
  if (event === null || event === undefined) return [];
  const evt = event as {
    properties?: { info?: { parts?: RuntimeMessagePart[] } };
    info?: { parts?: RuntimeMessagePart[] };
  };
  const primary = evt.properties?.info?.parts;
  if (Array.isArray(primary)) return primary;
  const fallback = evt.info?.parts;
  if (Array.isArray(fallback)) return fallback;
  return [];
}

// ─── THE PLANE ────────────────────────────────────────────────────────────────

const reasonSink: BatchSink = createBatchSink();
export { reasonSink };

export const reasonEngine = new StreamCaptureEngine({
  flushIntervalMs: 50,
  maxDeltaChars: 60,
  onBatch: (batch: StreamBatch) => reasonSink.push(batch),
});

function planeApi(engine: StreamCaptureEngine, sink: BatchSink) {
  return {
    recentBatches: sink.recentBatches,
    batchCount: sink.batchCount,
    resetBatches: sink.reset,
    setConsumer: sink.setConsumer,
    consumerFailures: () => sink.consumerFailures,
    isActive: () => engine.isActive(),
  };
}

/**
 * THE MESSAGE.PART.UPDATED FILTER → the reasoning-part read → start/delta/end.
 * Filter: event.type === 'message.part.updated' (NOT message.updated — that is
 * message metadata and carries NO parts on 1.14.51).
 * Payload: properties.part (SINGLE object, not an array).
 */
export const reasonPlane = {
  onEvent(event: RuntimeEvent | null | undefined): void {
    if (event === null || event === undefined || event.type !== 'message.part.updated') return;
    const part = readPart(event);
    if (part === null || part.type !== 'reasoning') return;
    if (typeof part.text === 'string' && part.text !== '') {
      reasonEngine.start(
        part.sessionID ?? '',
        part.messageID ?? '',
        part.id ?? '',
        'reasoning',
        part.metadata,
      );
      reasonEngine.delta(part.text);
      if (typeof part.time?.end === 'number') reasonEngine.end();
    }
  },
  ...planeApi(reasonEngine, reasonSink),
};

export type { BatchSink, CapturePlane, StreamBatch };
