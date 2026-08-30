// src/v2/capture/event-router.ts — THE EVENT-ROUTER COMPOSITOR (spec §2.1)
//
// THE ONE INTEGRATION POINT: opencode delivers the raw event stream through a
// single `event` hook key. v1 already registers `'event': sessionHook`. v2 does
// NOT register a competing hook (HOOK_OWNERSHIP would throw) — it WRAPS:
//
//   // src/hooks/trident-hooks.ts — THE ONLY v1-FILE TOUCH (3 lines):
//   'event': sessionHook,          becomes:   'event': v2EventRouter(sessionHook),
//
// THE ORDER CONTRACT: the v1 handler runs FIRST — zero behavioral change to
// the existing system. v1's own belt handles its errors (spec §2.1 line 129:
// "never throws (v1's own belt)") — the router does NOT swallow v1's throws.
// The v2 fan-out runs SECOND, each plane individually try/caught: a poisoned
// event or a broken plane can NEVER contaminate v1's dispatch (the errors run
// downstream of it) and can never break the router itself.
//
// THE PERFORMANCE BELT (spec §2.1): each filter is O(1) on non-matching types
// (the LAW-1 type check is every plane's first statement); no heavy work runs
// inside the event-hook phase — everything heavy happens in the engines'
// flush callbacks.
//
// ERROR-PATH LAW (R4): swallowed plane failures are COUNTED in routerHealth,
// never silent.

import { cadencePlane } from './tool-cadence-plane.js';
import { thinkPlane, thinkSink } from './text-think-plane.js';
import { reasonPlane, reasonSink, readPart, MessageRoleGate, type RuntimeEvent } from './reasoning-plane.js';
import { writeEvidence } from '../evidence/ledger-writer.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ViolationFamily } from '../contracts.js';
import { PARAGON_TMP_DIR } from '../contracts.js';
import { writePlaneHealth } from '../evidence/ledger-writer.js';
import { StreamPredicateLexicon } from '../lexicons/stream-predicate-lexicon.js';
import { FORGERY_MEMBERS } from '../lexicons/members/forgery-intent.js';
import { THEATRICAL_MEMBERS } from '../lexicons/members/theatrical-planning.js';
import { DOUBT_HEDGE_MEMBERS } from '../lexicons/members/doubt-hedge.js';
import { SCOPE_SHRINK_MEMBERS } from '../lexicons/members/scope-shrink.js';
import { PERMISSION_GATE_MEMBERS } from '../lexicons/members/permission-gate.js';
import { TEST_EVASION_MEMBERS } from '../lexicons/members/test-evasion.js';
import { V2Synapse, THR_V2_DEFAULTS } from '../counters/synapse.js';
import type { V2Synapse as V2SynapseType } from '../counters/synapse.js';
import { callOnSignals } from '../shared-state.js';
import { getV2EnforcementLevel, setV2EnforcementLevel } from '../shared-state.js';
import type { EnforcementDirective, V2Level } from '../contracts.js';
import { scoreSignals as lexScoreSignals, confidence as lexConfidence } from '../lexicons/stream-predicate-lexicon.js';
import { recordBehavioralText, recordBehavioralTool, getBehavioralSignals } from '../behavioral/checks.js';

// THE EVENT-TYPE DISCOVERY PROBE (the bible §2A.2 log-first method): every
// DISTINCT event.type seen by the router lands here once. This is the ground
// truth for which observables the runtime ACTUALLY emits vs what we guessed.
const discoveredTypes = new Set<string>();
function discoverEventType(type: string): void {
  if (discoveredTypes.has(type)) return;
  discoveredTypes.add(type);
  try {
    const dir = path.join(PARAGON_TMP_DIR, 'discovery');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'event-taxonomy.jsonl'), JSON.stringify({ type, at: Date.now() }) + '\n');
  } catch { /* non-fatal */ }
}

// ─── THE INTELLIGENCE PIPELINE (spec §2.4-§2.8 — wired end-to-end) ──────────
// capture batches → lexicon scan → synapse accumulation → pattern detection.
// The enforcement router consumes the PRIMED state at the next eligible surface.
// THE PRODUCTION REGISTRATION BOOTSTRAP (the operator's 2026-08-23 catch #2:
// the member modules were imported by TESTS ONLY — the live lexicon scanned
// with zero members, so every batch returned signals:0 forever). Registration
// happens ONCE at module init; duplicate registration throws (the write-once
// law), which module init guarantees against.
const streamLexicon = new StreamPredicateLexicon();
for (const member of [...FORGERY_MEMBERS, ...THEATRICAL_MEMBERS, ...DOUBT_HEDGE_MEMBERS, ...SCOPE_SHRINK_MEMBERS, ...PERMISSION_GATE_MEMBERS, ...TEST_EVASION_MEMBERS]) {
  streamLexicon.register(member);
}

// ═══ SESSION-SCOPED SYNAPSES (the spillover fix, 2026-08-28) ═══
// The previous single v2SynapseInstance accumulated EVERY session's signals
// into ONE λ state: session A's TEST_EVASION curve armed session B's machine
// (the operator's reasoning-token-spillover class, observed live). Synapses
// are now PER-SESSION, oldest-evicted at the cap.
const SYNAPSE_SESSION_CAP = 256;
const synapses = new Map<string, V2Synapse>();
export function synapseFor(sessionID: string | undefined): V2Synapse {
  const sid = sessionID && sessionID !== '' ? sessionID : 'default';
  let s = synapses.get(sid);
  if (s === undefined) {
    if (synapses.size >= SYNAPSE_SESSION_CAP) {
      const oldest = synapses.keys().next().value;
      if (typeof oldest === 'string') synapses.delete(oldest);
    }
    s = new V2Synapse(THR_V2_DEFAULTS);
    synapses.set(sid, s);
  }
  return s;
}
/** Accessor — the pipeline's per-session snapshot/restore path (+ legacy callers). */
export function getV2Synapse(sessionID?: string): V2Synapse { return synapseFor(sessionID); }
/** The live session registry — the pipeline's init-time restore walks this. */
export function knownSynapseSessions(): string[] { return [...synapses.keys()]; }
let seqCounter = 0;
// The ratio classifier's response bands. conf ≥ ENFORCE passes at full credit,
// conf ≥ DAMPEN passes dampened, below DAMPEN the signal's own evidence window
// cannot sustain it → suppressed + evidence row. SYNTH_WEIGHT_GAIN is the §2.5
// pass-band weight formula (weight = confidence × 2) for batch-synthesized
// violations. OQ-2: 0.5 is the campaign-calibrated enforce threshold.
const ENFORCE_CONF_BAND = 0.5;
const DAMPEN_CONF_BAND = 0.3;
const DAMPEN_FACTOR = 0.5;
const SYNTH_WEIGHT_GAIN = 2;

// THE PLANE-AVAILABILITY CONTRACT (spec §2.3): per-plane delivered counts,
// flushed to evidence/plane-health.json every 25th batch — the availability
// telemetry the meta-audit found defined-but-never-called.
const planeCounts: Record<string, { delivered: number; lastAt: number }> = {};
function noteDelivery(plane: string, batchSeq: number): void {
  const c = (planeCounts[plane] ??= { delivered: 0, lastAt: 0 });
  c.delivered += 1;
  c.lastAt = Date.now();
  if (batchSeq % 25 === 0) {
    try { writePlaneHealth(planeCounts); } catch { /* observer law */ }
  }
}

// THE LEVEL DIAL lives in ../integrate/pipeline.ts (the brain owns its level);
// these re-exports keep the historical import path stable.
export { getV2EnforcementLevel, setV2EnforcementLevel };

function processBatch(plane: string, batch: { cumulative: string; delta: string; ts: number; sessionID?: string }): void {
  seqCounter++;
  try {
    const signals = streamLexicon.scan(
      { cumulative: batch.cumulative, delta: batch.delta },
      { seq: seqCounter, ts: batch.ts, sessionID: batch.sessionID ?? '' },
    );
    let weighted = signals.map(
      (s) => ({ ...s, family: s.memberId.split('.')[0] as ViolationFamily, weight: (s as unknown as { weight: number }).weight ?? 0.9 }) as import('../contracts.js').WeightedViolation,
    );
    // ── CLASSIFIER WIRING (spec §2.7 — THE RATIO CLASSIFIER, GAP-1 closed) ──
    // Per-signal family scoring: the signal's OWN member banks score the batch
    // text; confidence = pos/(pos+neg+1) modulates the weight (≥0.5 full,
    // 0.3-0.5 dampened ×conf×0.5, <0.3 suppressed + evidence row). Descriptive/
    // use hits in the text SUPPRESS — the sentence context decides, not the regex.
    try {
      const suppressedRows: Record<string, unknown>[] = [];
      weighted = weighted.flatMap((s: import('../contracts.js').WeightedViolation) => {
        const member = streamLexicon.get(s.memberId);
        if (!member) return [s];
        const scored = lexScoreSignals(batch.cumulative, member);
        const conf = lexConfidence(scored.pos, scored.neg);
        if (conf >= ENFORCE_CONF_BAND) return [{ ...s, weight: s.weight * conf }];
        if (conf >= DAMPEN_CONF_BAND) return [{ ...s, weight: s.weight * conf * DAMPEN_FACTOR }];
        suppressedRows.push({ kind: 'v2-signal-suppressed', memberId: s.memberId, conf, evidence: scored.evidence, seq: seqCounter });
        return [];
      }) as import('../contracts.js').WeightedViolation[];
      for (const row of suppressedRows) { try { writeEvidence('enforcement', row); } catch { /* observer law */ } }
    } catch { /* classifier best-effort: unmodulated weights pass through */ }
    // ── BATCH-WIDE INTENT SCAN (the FI-1 leg) ────────────────────────────────
    // The lexicon's legacy matcher gates WHICH signals exist — and paraphrases
    // ('forgo the validation step') match none of its frames. The 4-bank ratio
    // scan over the registered members catches them: a member scoring pos>0
    // with conf≥0.5 and pos>neg SYNTHESIZES a violation even when the lexicon
    // scan produced none (weight = conf×2 per spec §2.5's pass band).
    try {
      let best: { id: string; pos: number; neg: number; evidence: string } | null = null;
      for (const member of streamLexicon.all()) {
        const scored = lexScoreSignals(batch.cumulative, member);
        if (scored.pos > 0 && (best === null || scored.pos > best.pos)) {
          best = { id: member.id, pos: scored.pos, neg: scored.neg, evidence: scored.evidence };
        }
      }
      if (best !== null) {
        const conf = lexConfidence(best.pos, best.neg);
        const alreadySignaled = weighted.some((s) => s.memberId === best!.id);
        if (conf >= ENFORCE_CONF_BAND && best.pos > best.neg && !alreadySignaled) {
          const family = best.id.split('.')[0] as import('../contracts.js').ViolationFamily;
          weighted = [...weighted, {
            memberId: best.id,
            family,
            weight: conf * SYNTH_WEIGHT_GAIN,
            excerpt: (best.evidence || batch.cumulative).slice(0, 200),
            anchor: { seq: seqCounter, ts: batch.ts, sessionID: batch.sessionID ?? '' },
            plane: 'reasoning' as const,
          } as import('../contracts.js').WeightedViolation];
        }
      }
    } catch { /* intent scan best-effort — lexicon signals still stand */ }
    // ── BEHAVIORAL WIRING (GAP-2 closed): the batch feeds the tracker, the
    // tracker evaluates through runBehavioralChecks — checks fire on the
    // claim/evidence gap, ghosted paths, narration anomalies, unverified completions.
    if (batch.sessionID) recordBehavioralText(batch.sessionID, batch.cumulative, seqCounter);
    let behavioral: import('../contracts.js').WeightedViolation[] = [];
    try { behavioral = getBehavioralSignals(weighted, batch.sessionID, seqCounter) as import('../contracts.js').WeightedViolation[]; } catch { /* best-effort */ }
    // SESSION-SCOPED accumulation: this session's λ curves only — never another
    // session's (the spillover fix).
    const sessionSynapse = synapseFor(batch.sessionID);
    for (const w of weighted) {
      sessionSynapse.accumulate(w, seqCounter);
    }
    for (const b of behavioral) {
      sessionSynapse.accumulate(b, seqCounter);
    }
    const allWeighted = [...weighted, ...behavioral];
    // THE BRAIN CONSUMPTION LEG (the operator's 2026-08-23 catch: synapse state
    // was accumulated but NEVER read — machine/router were orphaned modules).
    // onSignals drives stepV2 transitions + macro fusion + directive arming.
    callOnSignals(allWeighted.length ? allWeighted : weighted, seqCounter);
    writeEvidence(plane as import('../contracts.js').V2Plane, { batch: batch.cumulative.substring(0, 200), signals: signals.length });
  } catch { /* the observer law */ }
}

// Wire each sink: evidence first, THEN intelligence pipeline
reasonSink.setConsumer((batch) => {
  writeEvidence('reasoning', batch);
  noteDelivery('reasoning', batch.ts);
  processBatch('reasoning', batch);
});
thinkSink.setConsumer((batch) => {
  writeEvidence('text-think', batch);
  noteDelivery('text-think', batch.ts);
  processBatch('text-think', batch);
});

export type EventHandler = (input: unknown) => Promise<void> | void;

interface RouterHealth {
  reasonPlaneFailures: number;
  thinkPlaneFailures: number;
  cadencePlaneFailures: number;
  nonAssistantPartDrops: number; // the role gate — user/unknown parts never feed the watchdog
}

const routerHealth: RouterHealth = {
  reasonPlaneFailures: 0,
  thinkPlaneFailures: 0,
  cadencePlaneFailures: 0,
  nonAssistantPartDrops: 0,
};

// THE ROLE GATE (see MessageRoleGate): the operator-speech firewall.
const roleGate = new MessageRoleGate();

/** The counted-swallow probe — R4 observability for the router's catch sites. */
export function getRouterHealth(): Readonly<RouterHealth> {
  return { ...routerHealth };
}

export function resetRouterHealth(): void {
  routerHealth.reasonPlaneFailures = 0;
  routerHealth.thinkPlaneFailures = 0;
  routerHealth.cadencePlaneFailures = 0;
}

/**
 * Wrap the v1 session hook into the v2 compositor. The returned handler is a
 * drop-in replacement for the `event` hook key.
 */
export function v2EventRouter(v1SessionHook: EventHandler): EventHandler {
  return async (input: unknown): Promise<void> => {
    await v1SessionHook(input); // v1 FIRST — zero behavioral change to the existing system

    const evt = (input as { event?: RuntimeEvent } | null | undefined)?.event;
    if (!evt || typeof evt.type !== 'string') return; // O(1) skip — not an event envelope
    discoverEventType(evt.type); // the log-first probe — every distinct type recorded once

    // THE ROLE GATE (the operator-speech firewall): message.updated envelopes
    // build the messageID→role cache; part-bearing events must resolve to an
    // ASSISTANT message or they are dropped COUNTED. The operator typing bait
    // ('skip the tests') in a prompt must never arm the machine — observed live
    // 2026-08-28 when user-prompt text triggered the FI-1 path + the behavioral
    // claim tracker against a dead model.
    roleGate.observe(evt);
    if (evt.type === 'message.part.updated' || evt.type === 'message.part.delta') {
      if (roleGate.roleFor(evt) !== 'assistant') {
        routerHealth.nonAssistantPartDrops += 1; // COUNTED, never silent (R4)
        return;
      }
    }

    // v2 SECOND — the fan-out filters. Each plane is individually guarded: a
    // failure lands in ITS counter, the sibling planes still run, and nothing
    // ever propagates back into v1's already-completed dispatch.
    try {
      reasonPlane.onEvent(evt);
    } catch {
      routerHealth.reasonPlaneFailures += 1; // COUNTED, never silent (R4)
    }
    try {
      thinkPlane.onEvent(evt);
    } catch {
      routerHealth.thinkPlaneFailures += 1; // COUNTED, never silent (R4)
    }
    try {
      cadencePlane.onEvent(evt);
      // GAP-2 feed: the completed tool part also accrues the behavioral counters
      // (toolCalls/results; verificationCalls when bash carries a verify shape).
      const toolPart = readPart(evt);
      if (toolPart !== null && toolPart.type === 'tool' && typeof toolPart.tool === 'string' && typeof toolPart.sessionID === 'string' && toolPart.sessionID !== '') {
        recordBehavioralTool(toolPart.sessionID, toolPart.tool, typeof toolPart.commandText === 'string' ? toolPart.commandText : undefined);
      }
    } catch {
      routerHealth.cadencePlaneFailures += 1; // COUNTED, never silent (R4)
    }
  };
}
