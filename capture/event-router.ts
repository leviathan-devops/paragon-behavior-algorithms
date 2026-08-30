// capture/event-router.ts — THE COMPOSITOR
//
// Wraps the platform adapter's event handler; fans out to the capture planes;
// processes each batch through the domain module's families.

import { RoleGate, readPart } from '../core/role-gate.js';
import { scoreSignals, confidence, modulateWeight, batchScan,
         ENFORCE_CONF_BAND, DAMPEN_CONF_BAND } from '../core/classifier.js';
import { V2Synapse } from '../core/synapse.js';
import type { DomainModule, WeightedViolation, PatternFamilyMember,
              CapturePlane, PlatformEvent } from '../core/types.js';

export type EventHandler = (input: unknown) => Promise<void> | void;

const SYNAPSE_SESSION_CAP = 256;
const synapses = new Map<string, V2Synapse>();
export let seqCounter = 0;

export function synapseFor(sessionID?: string): V2Synapse {
  const sid = sessionID && sessionID !== '' ? sessionID : 'default';
  let s = synapses.get(sid);
  if (!s) {
    if (synapses.size >= SYNAPSE_SESSION_CAP) {
      const oldest = synapses.keys().next().value;
      if (typeof oldest === 'string') synapses.delete(oldest);
    }
    s = new V2Synapse();
    synapses.set(sid, s);
  }
  return s;
}

// ═══ THE BATCH (the capture planes produce these) ═══
export interface StreamBatch {
  sessionID: string;
  messageID: string;
  partID: string;
  delta: string;
  cumulative: string;
  ts: number;
  plane: CapturePlane;
  final?: boolean;
}

// ═══ THE BATCH PROCESSOR ═══
export function processBatch(batch: StreamBatch, domain: DomainModule,
  onSignals: (violations: WeightedViolation[], seq: number) => void): void {
  seqCounter++;
  try {
    const text = batch.cumulative;
    let weighted: WeightedViolation[] = [];

    // The per-signal confidence ladder
    for (const member of domain.families) {
      const scored = scoreSignals(text, member);
      const conf = confidence(scored.pos, scored.neg);
      const baseWeight = 0.9;
      const modulated = modulateWeight(baseWeight, conf);
      if (modulated > 0) {
        weighted.push({
          memberId: member.id,
          family: member.id.split('.')[0],
          plane: batch.plane,
          excerpt: scored.evidence.slice(0, 200),
          anchor: { seq: seqCounter, ts: batch.ts, sessionID: batch.sessionID },
          weight: modulated,
        });
      }
    }

    // The batch-wide FI-1 scan (the paraphrase synthesis)
    const synth = batchScan(text, domain.families);
    if (synth && !weighted.some((w) => w.memberId === synth.memberId)) {
      weighted.push({
        memberId: synth.memberId,
        family: synth.family,
        plane: batch.plane,
        excerpt: synth.evidence.slice(0, 200),
        anchor: { seq: seqCounter, ts: batch.ts, sessionID: batch.sessionID },
        weight: synth.weight,
      });
    }

    // The synapse accumulate (per-session)
    const synapse = synapseFor(batch.sessionID);
    for (const w of weighted) synapse.accumulate(w, seqCounter);

    // Feed the machine
    if (onSignals) onSignals(weighted, seqCounter);
  } catch { /* the observer law */ }
}

// ═══ THE EVENT ROUTER COMPOSITOR ═══
export function createEventRouter(
  platformHandler: EventHandler,
  domain: DomainModule,
  roleGate: RoleGate,
  onSignals: (violations: WeightedViolation[], seq: number) => void,
): EventHandler {
  return async (input: unknown): Promise<void> => {
    await platformHandler(input);  // the platform handler FIRST
    const evt = (input as { event?: PlatformEvent })?.event;
    if (!evt || typeof evt.type !== 'string') return;

    roleGate.observe(evt);
    if (evt.type === 'message.part.updated' || evt.type === 'message.part.delta') {
      if (!roleGate.shouldProcess(evt)) return;
      const part = readPart(evt);
      if (part && typeof part.text === 'string' && part.text !== '') {
        processBatch({
          sessionID: part.sessionID ?? '',
          messageID: part.messageID ?? '',
          partID: part.id ?? '',
          delta: part.text,
          cumulative: part.text,
          ts: Date.now(),
          plane: part.type === 'reasoning' ? 'reasoning' : 'text-think',
        }, domain, onSignals);
      }
    }
  };
}
