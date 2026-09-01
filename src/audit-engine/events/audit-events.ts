/**
 * audit-events.ts — THE EVENT-AWARE OBSERVATION PLANES (the L2 spec §3.7 — W5)
 *
 * THE THESIS: the named-hook surface is the easy-mode subset of a single
 * underlying `event` hook — a typed firehose carrying EVERY runtime event.
 * THE AUDIT'S CONSUMPTION: the snapshot+ingest FIRST (the audit reads the
 * recent event history before the static parse — deterministic,
 * container-testable). THE DUALITY: the tool's own machinery is watched by
 * the same planes it ships (the sentinel-fleet layer).
 *
 * THE THREE LAWS:
 *   1. THE FILTER LAW — `if (event.type !== X) return` FIRST (the constant-time noise gate)
 *   2. THE READER LAW — the payload accessed defensively (optional-chaining + shape guards)
 *   3. THE OBSERVER LAW — the hook is observation-only (never mutates, never blocks, never throws)
 *
 * THE FOUR PLANES (the one-hook-many-planes):
 *   reasoning (message.updated) · cadence (tool.call.*) · model (model.request.*) · session (session.*)
 */
import * as fs from 'fs';
import * as path from 'path';
import { tridentLog } from '../../utils.js';

// THE LOCAL CAST (the R14/R16 style-safe helper — no import cycle).
function cast<T>(v: unknown): T { return v as T; }

// ── THE CAPTURE ENGINE (the start/delta/end/flush class) ──
export interface CaptureBatch {
  sessionID: string;
  messageID: string;
  partID: string;
  cumulative: string;
  at: number;
  source: string;
  metadata?: unknown;
}

export interface CaptureEngineOptions {
  flushIntervalMs?: number;   // 50 — the multi-rule flush's time rule
  maxDeltaChars?: number;     // 1000 — the multi-rule flush's volume rule
  onBatch?: (batch: CaptureBatch) => void;   // the non-awaited consumer
}

/** THE REASONING CAPTURE ENGINE — the incremental accumulation (never onComplete). */
export class ReasoningCaptureEngine {
  private sessionID = '';
  private messageID = '';
  private partID = '';
  private buffer = '';
  private lastFlushAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushIntervalMs: number;
  private readonly maxDeltaChars: number;
  private readonly onBatch?: (batch: CaptureBatch) => void;
  private destroyed = false;

  constructor(opts: CaptureEngineOptions = {}) {
    this.flushIntervalMs = opts.flushIntervalMs ?? 50;   // 50ms BECAUSE (§3.7.4)
    this.maxDeltaChars = opts.maxDeltaChars ?? 1000;     // 1000 chars BECAUSE (§3.7.4)
    this.onBatch = opts.onBatch;
  }

  /** THE CONTEXT-RESET LAW — start() clears the previous context. */
  start(sessionID: string, messageID: string, partID: string, metadata?: unknown): void {
    if (this.destroyed) return;
    this.sessionID = sessionID;
    this.messageID = messageID;
    this.partID = partID;
    this.buffer = '';
    this.lastFlushAt = Date.now();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.flushIntervalMs);
  }

  /** THE DELTA — the incremental accumulation (the input read-only). */
  delta(text: string): void {
    if (this.destroyed || !text) return;
    this.buffer += text;
    // THE VOLUME RULE — the maxDeltaChars exceeded → flush
    if (this.buffer.length >= this.maxDeltaChars) this.flush();
  }

  /** THE MULTI-RULE FLUSH — time ≥ interval OR volume ≥ max OR the end-marker. */
  flush(): void {
    if (this.destroyed) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.buffer) return;
    const batch: CaptureBatch = {
      sessionID: this.sessionID,
      messageID: this.messageID,
      partID: this.partID,
      cumulative: this.buffer,
      at: Date.now(),
      source: 'reasoning',
    };
    const cb = this.onBatch;
    if (cb) {
      // THE NON-AWAITED ONBATCH — the hook never blocks (the 50ms sync-budget law)
      try { cb(batch); } catch (e: unknown) {
        tridentLog('ERROR', 'audit-events', `onBatch failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.buffer = '';
    this.lastFlushAt = Date.now();
  }

  /** THE END-MARKER — finalizes the final partial (the part's time.end). */
  end(): void {
    this.flush();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.buffer = '';
  }
}

// ── THE EVIDENCE WRITER (the JSONL with the source discriminator) ──
export function writeEvidenceRecord(target: string, plane: string, record: Record<string, unknown>): string {
  const dir = path.join(target, '.trident', `${plane}-evidence`);
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `${day}.jsonl`);
  const line = JSON.stringify({ ...record, source: plane, at: Date.now() });
  fs.appendFileSync(file, line + '\n', 'utf-8');
  return file;
}

// ── THE PLANES (the one-hook-many-planes law) ──
export interface RuntimeEvent {
  type: string;
  properties?: {
    info?: {
      sessionID?: string;
      messageID?: string;
      partID?: string;
      parts?: Array<{
        type?: string;
        text?: string;
        time?: { end?: number };
      }>;
    };
  };
  [key: string]: unknown;
}

export interface NormalizedObservation {
  sessionID: string;
  messageID: string;
  partID: string;
  text: string;
  at: number;
  source: string;
  metadata?: unknown;
}

export interface ObservationPlane {
  name: string;                              // 'reasoning' | 'cadence' | 'model' | 'session'
  filter: (event: RuntimeEvent) => boolean;  // the FILTER LAW — the constant-time noise gate FIRST
  reader: (event: RuntimeEvent) => NormalizedObservation | null;  // the READER LAW — the defensive payload access
  engine?: ReasoningCaptureEngine;           // the start/delta/end/flush class
  evidence: (obs: NormalizedObservation) => void;   // the JSONL with source: "<plane>"
}

/** THE REASONING PLANE — message.updated → the reasoning parts (or the embedded <thinking> fallback). */
export function reasoningPlane(target: string): ObservationPlane {
  const engine = new ReasoningCaptureEngine({
    onBatch: (batch) => {
      writeEvidenceRecord(target, 'reasoning', {
        sessionID: batch.sessionID,
        messageID: batch.messageID,
        partID: batch.partID,
        plane: 'reasoning',
        eventType: 'message.updated',
        partType: 'reasoning',
        text: batch.cumulative,
      });
    },
  });
  return {
    name: 'reasoning',
    // THE FILTER LAW — return FIRST on a non-matching type.
    // THE RUNTIME-VOCABULARY CALIBRATION (2026-08-20 — the live container
    // measured: the runtime emits message.part.delta / message.part.updated /
    // message.updated, NOT a model.request stream). The reasoning plane observes
    // the message-part lifecycle where the reasoning text streams.
    filter: (event) =>
      typeof event.type === 'string' &&
      (event.type === 'message.updated' || event.type === 'message.part.updated' || event.type === 'message.part.delta'),
    // THE READER LAW — the defensive payload access (the SDK-type-gap is a signal, never a crash)
    // THE SHAPE CALIBRATION (WO-HT-10, measured 2026-08-23: READER-NULL x801 on
    // message.part.delta / message.updated — the info.parts[] shape is NOT what
    // this runtime delivers). The reader now walks EVERY plausible carrier:
    //   a) properties.info.parts[] (the original shape)
    //   b) properties.part (the singular part object on part.updated/delta)
    //   c) properties.delta (the raw delta string on part.delta)
    //   d) properties.text
    reader: (event) => {
      try {
        const props = (event?.properties ?? {}) as Record<string, unknown>;
        // (a) the parts-array shape
        const parts = props.info ? (cast<Record<string, unknown>>(props.info).parts as unknown) : undefined;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            const p = part as Record<string, unknown>;
            if (p?.type === 'reasoning' && typeof p.text === 'string') {
              return {
                sessionID: String(cast<Record<string, unknown>>(props.info ?? {}).sessionID ?? ''),
                messageID: String(cast<Record<string, unknown>>(props.info ?? {}).messageID ?? ''),
                partID: String(cast<Record<string, unknown>>(props.info ?? {}).partID ?? ''),
                text: p.text,
                at: Date.now(),
                source: 'reasoning',
                metadata: { partType: 'reasoning' },
              };
            }
            // THE FORMAT-AGNOSTIC FALLBACK: the text-embedded <thinking>/<think> blocks
            if (p?.type === 'text' && typeof p.text === 'string') {
              const m = String(p.text).match(/<thinking>([\s\S]*?)<\/thinking>|<think>([\s\S]*?)<\/think>/);
              if (m) {
                return {
                  sessionID: String(cast<Record<string, unknown>>(props.info ?? {}).sessionID ?? ''),
                  messageID: String(cast<Record<string, unknown>>(props.info ?? {}).messageID ?? ''),
                  partID: String(cast<Record<string, unknown>>(props.info ?? {}).partID ?? ''),
                  text: m[1] || m[2] || '',
                  at: Date.now(),
                  source: 'reasoning',
                  metadata: { partType: 'text', embedded: true },
                };
              }
            }
          }
        }
        // (b) the SINGULAR part object (message.part.updated / message.part.delta carry
        //     properties.part — the measured runtime shape, not info.parts[])
        const part = props.part as Record<string, unknown> | undefined;
        if (part && typeof part === 'object') {
          const ptype = String(part.type ?? '');
          const ptext = typeof part.text === 'string' ? part.text : '';
          if (ptype === 'reasoning' && ptext) {
            return {
              sessionID: String(props.sessionID ?? ''),
              messageID: String(props.messageID ?? ''),
              partID: String(props.partID ?? ''),
              text: ptext,
              at: Date.now(),
              source: 'reasoning',
              metadata: { partType: 'reasoning', shape: 'singular-part' },
            };
          }
          if (ptext) {
            const m = ptext.match(/<thinking>([\s\S]*?)<\/thinking>|<think>([\s\S]*?)<\/think>/);
            if (m) {
              return {
                sessionID: String(props.sessionID ?? ''),
                messageID: String(props.messageID ?? ''),
                partID: String(props.partID ?? ''),
                text: m[1] || m[2] || '',
                at: Date.now(),
                source: 'reasoning',
                metadata: { partType: 'text', embedded: true, shape: 'singular-part' },
              };
            }
          }
        }
        // (c) the RAW DELTA string (message.part.delta streams field deltas)
        if (typeof props.delta === 'string' && props.delta.length > 0) {
          return {
            sessionID: String(props.sessionID ?? ''),
            messageID: String(props.messageID ?? ''),
            partID: String(props.partID ?? ''),
            text: props.delta,
            at: Date.now(),
            source: 'reasoning',
            metadata: { shape: 'raw-delta' },
          };
        }
        // (d) the bare text property
        if (typeof props.text === 'string' && props.text.length > 0) {
          return {
            sessionID: String(props.sessionID ?? ''),
            messageID: String(props.messageID ?? ''),
            partID: String(props.partID ?? ''),
            text: props.text,
            at: Date.now(),
            source: 'reasoning',
            metadata: { shape: 'bare-text' },
          };
        }
        return null;
      } catch {
        return null;  // the observer never throws into the loop
      }
    },
    engine,
    evidence: (obs) => writeEvidenceRecord(target, 'reasoning', { ...obs }),
  };
}

/** THE CADENCE PLANE — tool.call.* → the tool-call cadence. */
export function cadencePlane(target: string): ObservationPlane {
  return {
    name: 'cadence',
    // THE FILTER — the tool-call cadence. THE RUNTIME-VOCABULARY CALIBRATION:
    // the live container emits message.updated (not tool.call.*) for its tool
    // transitions — the cadence plane ALSO observes the message-update stream
    // (the tool-result transitions are message.updated events in this runtime).
    filter: (event) =>
      typeof event.type === 'string' &&
      (event.type.startsWith('tool.call.') || event.type === 'message.updated' || event.type === 'message.part.updated'),
    reader: (event) => {
      try {
        return {
          sessionID: event?.properties?.info?.sessionID || '',
          messageID: event?.properties?.info?.messageID || '',
          partID: event?.properties?.info?.partID || '',
          text: event.type,
          at: Date.now(),
          source: 'cadence',
          metadata: { eventType: event.type },
        };
      } catch {
        return null;
      }
    },
    evidence: (obs) => writeEvidenceRecord(target, 'cadence', { ...obs }),
  };
}

/** THE MODEL PLANE — model.request.* → the provider telemetry. */
export function modelPlane(target: string): ObservationPlane {
  return {
    name: 'model',
    filter: (event) => typeof event.type === 'string' && event.type.startsWith('model.request.'),
    reader: (event) => {
      try {
        return {
          sessionID: event?.properties?.info?.sessionID || '',
          messageID: event?.properties?.info?.messageID || '',
          partID: event?.properties?.info?.partID || '',
          text: event.type,
          at: Date.now(),
          source: 'model',
          metadata: { eventType: event.type },
        };
      } catch {
        return null;
      }
    },
    evidence: (obs) => writeEvidenceRecord(target, 'model', { ...obs }),
  };
}

/** THE SESSION PLANE — session.* → the lifecycle. */
export function sessionPlane(target: string): ObservationPlane {
  return {
    name: 'session',
    filter: (event) => typeof event.type === 'string' && event.type.startsWith('session.'),
    reader: (event) => {
      try {
        return {
          sessionID: event?.properties?.info?.sessionID || '',
          messageID: '',
          partID: '',
          text: event.type,
          at: Date.now(),
          source: 'session',
          metadata: { eventType: event.type },
        };
      } catch {
        return null;
      }
    },
    evidence: (obs) => writeEvidenceRecord(target, 'session', { ...obs }),
  };
}

/** THE ONE-HOOK-MANY-PLANES — the multi-filter chain over ONE registration. */
export function registerPlanes(target: string): ObservationPlane[] {
  return [reasoningPlane(target), cadencePlane(target), modelPlane(target), sessionPlane(target)];
}

// ── THE RUNTIME DISPATCH (2026-08-20 — THE W5 DEAD-BUNDLE FIX) ──
// THE DEFECT: registerPlanes + writeEvidenceRecord were only called by the unit
// tests — nothing CALLED them from the runtime, so the capture machinery was
// tree-shaken out of the deployed dist (writeEvidenceRecord:0 in the bundle)
// and NO <plane>-evidence/ JSONL was ever produced. THE FIX: a persistent
// in-memory plane registry + dispatchRuntimeEvent(event), wired into the
// plugin's `event` hook (trident-hooks sessionHook). Each runtime event is
// routed through the planes' FILTER (the constant-time gate) → READER (the
// defensive extraction) → EVIDENCE (the JSONL write with the source disc).
// THE OBSERVER LAW: the dispatch never throws into the event loop.
const planeRegistry = new Map<string, ObservationPlane[]>();

/** THE REGISTRY — register (or refresh) the planes for a target. */
export function ensurePlanesRegistered(target: string): ObservationPlane[] {
  if (!target) return [];
  const existing = planeRegistry.get(target);
  if (existing) return existing;
  const planes = registerPlanes(target);
  planeRegistry.set(target, planes);
  return planes;
}

/** THE DISPATCH — route ONE runtime event through every registered plane. */
export function dispatchRuntimeEvent(target: string, event: unknown): void {
  try {
    if (!target || !event) return;
    const evt = (typeof event === 'object' && event !== null ? event : {}) as Record<string, unknown>;
    const type = typeof (evt as { type?: unknown }).type === 'string' ? (evt as { type: string }).type : '';
    if (!type) return;
    const planes = planeRegistry.get(target) || ensurePlanesRegistered(target);
    for (const plane of planes) {
      try {
        // THE FILTER LAW — return FIRST on a non-matching type (the constant-time gate)
        const typedEvent = evt as unknown as RuntimeEvent;
        if (!plane.filter(typedEvent)) continue;
        // THE READER LAW — the defensive extraction; null → nothing observed.
        // THE READER-NULL PROBE (WO-HT-10 — 2026-08-23): a filtered-in event
        // whose reader extracts null is the FEED-DEATH signature (the host
        // session showed events flowing + zero evidence landing). Every null
        // increments a named counter; every 200th emits a WARN naming the
        // plane + the event type — the failing leg prints itself.
        const obs = plane.reader(typedEvent);
        if (!obs) {
          readerNullCounts.set(plane.name, (readerNullCounts.get(plane.name) ?? 0) + 1);
          const n = readerNullCounts.get(plane.name) ?? 0;
          // THE FIRST-NULL PAYLOAD SAMPLER (WO-HT-10): the FIRST null per
          // plane:type logs a truncated payload — one sample line per unknown
          // shape, never spam. The remaining nulls count silently (the xN WARN
          // every 200th keeps the volume signal).
          const sampleKey = plane.name + ':' + type;
          if (!readerNullSamples.has(sampleKey)) {
            readerNullSamples.add(sampleKey);
            tridentLog('WARN', 'audit-events', `READER-NULL SAMPLE plane=${plane.name} type=${type} payload=${JSON.stringify(evt).substring(0, 400)}`);
          }
          if (n % 200 === 1) {
            tridentLog('WARN', 'audit-events', `READER-NULL x${n} plane=${plane.name} lastEventType=${type} target=${target} — the filter matched but the reader extracted nothing (shape gap candidate)`);
          }
          continue;
        }
        // THE EVIDENCE — the JSONL with the source discriminator
        if (plane.engine && plane.engine.start && typeof plane.engine.start === 'function') {
          // the capture engine path (the start/delta/end/flush class) — observed
          // without awaiting (the non-awaited onBatch consumer)
        }
        plane.evidence(obs);
      } catch (planeErr: unknown) {
        tridentLog('WARN', 'audit-events', `plane ${plane.name} dispatch failed (the observer never breaks the loop): ${planeErr instanceof Error ? planeErr.message : String(planeErr)}`);
      }
    }
  } catch (dispatchErr: unknown) {
    tridentLog('WARN', 'audit-events', `dispatchRuntimeEvent failed: ${dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr)}`);
  }
}

/** THE READER-NULL COUNTERS (WO-HT-10 observability) — per-plane counts of
 *  filter-matched events whose readers extracted nothing. Exported for the
 *  ingest/snapshot surface so the feed-death leg is diagnosable from data. */
const readerNullCounts = new Map<string, number>();
const readerNullSamples = new Set<string>();
export function getReaderNullCounts(): Record<string, number> {
  return Object.fromEntries(readerNullCounts);
}

// ── THE SNAPSHOT+INGEST (the audit's consumption — the deterministic, container-testable path) ──
export interface EventStats {
  reasoningObservations: number;
  cadenceToolCalls: number;
  modelRequests: number;
  sessionTransitions: number;
  flowVerdict: 'FLOW_OK' | 'FLOW_DEGRADED' | 'FLOW_STALLED';
  cadenceAnomalies: string[];
}

/** THE INGEST — reads the recent plane evidence JSONL (the last `sinceMs` window). */
export function ingestRecentEvents(target: string, sinceMs = 1_800_000): EventStats {
  const stats: EventStats = {
    reasoningObservations: 0,
    cadenceToolCalls: 0,
    modelRequests: 0,
    sessionTransitions: 0,
    flowVerdict: 'FLOW_OK',
    cadenceAnomalies: [],
  };
  const since = Date.now() - sinceMs;
  const tridentDir = path.join(target, '.trident');
  if (!fs.existsSync(tridentDir)) return stats;
  for (const plane of ['reasoning', 'cadence', 'model', 'session']) {
    const dir = path.join(tridentDir, `${plane}-evidence`);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.jsonl')) continue;
      const full = path.join(dir, file);
      try {
        const lines = fs.readFileSync(full, 'utf-8').split('\n').filter((l) => l.trim());
        for (const line of lines) {
          try {
            const rec = JSON.parse(line) as { at?: number; source?: string };
            if (!rec.at || rec.at < since) continue;
            if (rec.source === 'reasoning') stats.reasoningObservations++;
            if (rec.source === 'cadence') stats.cadenceToolCalls++;
            if (rec.source === 'model') stats.modelRequests++;
            if (rec.source === 'session') stats.sessionTransitions++;
          } catch {
            // the malformed line is skipped — the ingest never crashes
          }
        }
      } catch (e: unknown) {
        tridentLog('WARN', 'audit-events', `ingest failed for ${full}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  // THE FLOW VERDICT — the cadence anomalies surface (the flow classifier)
  if (stats.cadenceToolCalls > 200) {
    stats.flowVerdict = 'FLOW_DEGRADED';
    stats.cadenceAnomalies.push('CADENCE_GAP: the tool-call volume exceeds 200 in the window');
  }
  return stats;
}
