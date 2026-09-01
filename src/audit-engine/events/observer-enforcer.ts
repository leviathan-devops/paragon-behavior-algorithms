/**
 * observer-enforcer.ts — THE OBSERVER/ENFORCER MERGE (SPEC-3 §2.6 / §11.2 — E6)
 *
 * THE DUALITY (§2.6): the observation and the enforcement are the SAME machinery, two arms.
 * This module is the MERGE: it reads the EXISTING W5 observation planes' output (the evidence
 * JSONL written by audit-events.ts — the reasoning/cadence/model/session arms) and feeds each
 * observation through the TRIAGE MACHINE (E2). AN OBSERVATION THAT MATCHES A SLOP CLASS (the
 * cadence shows a claim-spam; the audit event shows the over-density) BECOMES AN ENFORCEMENT
 * TRIGGER: the block is delivered (E4), the ledger records it (E7), the sentinel fleet
 * accumulates the triad (the one-barrage feed), and the calibration feedback applies (E5).
 *
 * THE LOOP-CLOSURE (§1.1/§1.5 — the failure this kills): the W5 planes were observers that
 * wrote JSONL and decided NOTHING (the fire-and-forget observation). The merge is the decision
 * surface the planes never had — the evidence now FEEDS the enforcement.
 *
 * THE NO-VERDICT LAW HOLDS HERE TOO: the merge NEVER classifies from a text match itself — the
 * DefaultTriageMachine (injected) is the decider. The merge normalizes, routes, records, feeds.
 *
 * ERROR PATHS FIRST: a missing machine/ledger, a malformed JSONL line, an unreadable evidence
 * dir, a slop verdict without its block demand — all NAMED throws or loud-logged skips with
 * counts. NOTHING is silently dropped: every input lands in the result's counters.
 */
import * as fs from 'fs';
import * as path from 'path';
import { tridentLog } from '../../utils.js';
import type { EventLedger } from './event-ledger.js';
import type { NormalizedObservation, SlopClass, TriageVerdict } from './event-substrate.js';
import { RUNTIME_EVENT_TYPES, isRegisteredEventType } from './event-registry.js';
import { fireBlock } from './event-firewalls.js';
import { applyCalibrationSignal } from './calibration-feedback.js';
import type { EventSentinel, SentinelBarrage } from './event-sentinels.js';
import { sentinelFor } from './event-sentinels.js';
import type { NormalizedObservation as W5Observation } from './audit-events.js';

// ── THE CONTRACTS (E6) ──

/** THE TRIAGE DECIDER — the injected machine (structural: the E2 DefaultTriageMachine or any
 *  machine honoring the classify contract). The merge decides NOTHING itself. */
export interface TriageDecider {
  classify(obs: NormalizedObservation): TriageVerdict;
}

/** THE MERGE DEPENDENCIES — the real machinery, injected (the battery drives the real E2/E4/E5/E7). */
export interface ObserverEnforcerDeps {
  machine: TriageDecider;
  ledger: EventLedger;
  /** THE SENTINEL FLEET (the one-barrage feed) — each slop verdict accumulates into its sentinel. */
  sentinels?: readonly EventSentinel[];
  /** THE BLOCK DELIVERY — the E4 fireBlock by default; injectable for the E-PB5 stream wiring. */
  fire?: (verdict: TriageVerdict) => void;
  /** THE CALIBRATION FEEDBACK switch (default true — the E5 loop closes). */
  applyFeedback?: boolean;
}

/** THE PER-OBSERVATION DECISION — the merge's audit trail (what the observation became). */
export interface MergeDecision {
  at: number;
  type: string;
  sourcePlane: string;
  slopClass: SlopClass;
  enforced: boolean;
  demand?: string;
}

/** THE MERGE RESULT — every input accounted for (the loud-fail-or-clear-pass made countable). */
export interface ObserverEnforcerMergeResult {
  observed: number; // the observations that reached the machine
  enforced: number; // the slop-class verdicts (blocked/injected)
  benign: number; // the BENIGN verdicts (recorded, never blocked)
  inconclusive: number; // the machine's INCONCLUSIVE fail-state (flagged, never passed)
  malformed: number; // the inputs that could not be normalized (loud-logged, never a crash)
  missingPlanes: string[]; // the evidence dirs absent on disk (the honest empty-observation state)
  deliveryFailures: Array<{ at: number; slopClass: SlopClass; error: string }>;
  decisions: MergeDecision[];
  sentinelBarrages: SentinelBarrage[];
}

// ── THE W5 → SUBSTRATE NORMALIZATION (the two observation shapes, one machinery) ──

/** THE SOURCE-TYPE FALLBACK MAP — the W5 plane → the event type when the record carries no
 *  explicit eventType. BECAUSE: the reasoning + cadence planes observe the message lifecycle
 *  (message.updated / message.part.* — the measured runtime vocabulary, event-registry.ts), the
 *  session plane the session lifecycle. The map is DATA keyed by the plane name. */
const SOURCE_TYPE_FALLBACK: Readonly<Record<string, string>> = {
  reasoning: RUNTIME_EVENT_TYPES.MESSAGE_UPDATED,
  cadence: RUNTIME_EVENT_TYPES.MESSAGE_UPDATED,
  session: RUNTIME_EVENT_TYPES.SESSION_UPDATED,
};

/**
 * INFER THE OBSERVED EVENT TYPE — data-driven, never guessed: the record's own
 * metadata.eventType first (the W5 cadence/session/model planes record it), then the text when
 * the text IS a registered event type (the cadence/session/model readers set text = event.type),
 * then the per-plane fallback. A type that cannot be inferred → null (the observation is
 * malformed for the merge — counted, never crashed).
 */
function inferObservedEventType(text: string, metadata: Record<string, unknown>, source: string): string | null {
  const eventType = metadata.eventType;
  if (typeof eventType === 'string' && eventType.length > 0) return eventType;
  if (isRegisteredEventType(text)) return text;
  const fallback = SOURCE_TYPE_FALLBACK[source];
  if (fallback) return fallback;
  return null;
}

/**
 * NORMALIZE ONE W5 OBSERVATION (audit-events.ts shape) INTO THE SUBSTRATE'S
 * NormalizedObservation (event-substrate.ts shape). THE READER LAW applied to the merge: a
 * malformed record → null, never a crash.
 */
export function normalizeW5Observation(w5: W5Observation | Record<string, unknown>): NormalizedObservation | null {
  if (!w5 || typeof w5 !== 'object') return null;
  const rec = w5 as Record<string, unknown>;
  const text = typeof rec.text === 'string' ? rec.text : '';
  const metadata = rec.metadata && typeof rec.metadata === 'object' ? (rec.metadata as Record<string, unknown>) : {};
  const source = typeof rec.source === 'string' ? rec.source : '';
  const type = inferObservedEventType(text, metadata, source);
  if (!type) return null;
  return {
    sessionID: typeof rec.sessionID === 'string' ? rec.sessionID : '',
    type,
    text,
    at: typeof rec.at === 'number' && Number.isFinite(rec.at) ? rec.at : Date.now(),
    metadata: { ...metadata, sourcePlane: source },
  };
}

// ── THE MERGE (the observations → the enforcement decisions) ──

const FEEDBACK_KINDS: ReadonlySet<SlopClass> = new Set(['CALIB_STALE', 'OVER_AUDIT', 'FAKE_RETURN', 'CLAIM_SLOP']);

/**
 * APPLY THE CALIBRATION FEEDBACK for a slop verdict (§2.5 — the events correct the detectors).
 * THE GATING IS STRUCTURAL: CALIB_STALE requires the matcherId, OVER_AUDIT carries the counts
 * when the observation carries them. A signal that lacks its required field is loud-logged and
 * skipped (the feedback never fabricates a target).
 */
function applyFeedbackForVerdict(obs: NormalizedObservation, verdict: TriageVerdict): void {
  const klass = verdict.slopClass;
  if (!FEEDBACK_KINDS.has(klass)) return;
  const md = obs.metadata && typeof obs.metadata === 'object' ? (obs.metadata as Record<string, unknown>) : {};
  const timestamp = typeof obs.at === 'number' ? obs.at : Date.now();
  if (klass === 'CALIB_STALE') {
    const matcherId = typeof md.matcherId === 'string' && md.matcherId.length > 0 ? md.matcherId : undefined;
    if (!matcherId) {
      tridentLog('WARN', 'observer-enforcer', 'CALIB_STALE feedback skipped: the observation carries no matcherId — the exclusion target is required (loud, never silent)');
      return;
    }
    applyCalibrationSignal({ kind: 'CALIB_STALE', matcherId, timestamp });
    return;
  }
  if (klass === 'OVER_AUDIT') {
    applyCalibrationSignal({
      kind: 'OVER_AUDIT',
      findingCount: typeof md.findingsCount === 'number' ? md.findingsCount : undefined,
      fileCount: typeof md.filesScanned === 'number' ? md.filesScanned : undefined,
      timestamp,
    });
    return;
  }
  if (klass === 'FAKE_RETURN') {
    applyCalibrationSignal({ kind: 'FAKE_RETURN', observedShape: obs.text.slice(0, 200), timestamp });
    return;
  }
  applyCalibrationSignal({ kind: 'CLAIM_SLOP', timestamp });
}

function emptyMergeResult(): ObserverEnforcerMergeResult {
  return {
    observed: 0,
    enforced: 0,
    benign: 0,
    inconclusive: 0,
    malformed: 0,
    missingPlanes: [],
    deliveryFailures: [],
    decisions: [],
    sentinelBarrages: [],
  };
}

/**
 * MERGE THE OBSERVATIONS (E6 — the in-memory core): each observation is normalized (the W5
 * shape is accepted alongside the substrate shape), classified by the machine, recorded in the
 * ledger, and — when the class is a SLOP class — ENFORCED: the block is delivered (E4), the
 * sentinel accumulates the triad (the one-barrage feed), the calibration feedback applies (E5).
 *
 * ERROR PATHS FIRST:
 *   EVENT_MERGE_NO_MACHINE / EVENT_MERGE_NO_LEDGER — the merge without its decider or its
 *     record is a theatrical merge (it would "enforce" without evidence) — NAMED throws.
 *   a slop verdict WITHOUT its block demand → EVENT_BLOCK_MISSING (the triage's contract broke).
 *   a delivery failure → loud-logged + counted in deliveryFailures, never thrown into the loop.
 */
export function mergeObservations(
  observations: ReadonlyArray<NormalizedObservation | W5Observation | Record<string, unknown>>,
  deps: ObserverEnforcerDeps,
): ObserverEnforcerMergeResult {
  if (!deps || typeof deps !== 'object') {
    throw new Error('EVENT_MERGE_DEPS_INVALID: the merge requires its dependencies { machine, ledger }');
  }
  if (!deps.machine || typeof deps.machine.classify !== 'function') {
    throw new Error('EVENT_MERGE_NO_MACHINE: the observer-enforcer merge requires the triage machine — the merge decides NOTHING itself (the no-verdict law)');
  }
  if (!deps.ledger || typeof deps.ledger.record !== 'function') {
    throw new Error('EVENT_MERGE_NO_LEDGER: the merge requires the event ledger — an enforcement without its record is a bare assertion');
  }
  if (!Array.isArray(observations)) {
    throw new Error('EVENT_MERGE_INPUT_INVALID: the observations must be an array');
  }
  const fire = deps.fire ?? ((verdict: TriageVerdict) => fireBlock(verdict.block!.demand, verdict));
  const feedback = deps.applyFeedback !== false;
  const result = emptyMergeResult();

  for (const raw of observations) {
    // THE NORMALIZATION — a W5-shaped record (the `source` discriminator) is normalized; any
    // other object is handed to the machine AS-IS — the machine's INCONCLUSIVE fail-state (§9.2)
    // owns the malformed-observation verdict (flagged, never silently dropped by the merge).
    if (!raw || typeof raw !== 'object') {
      result.malformed++;
      tridentLog('WARN', 'observer-enforcer', 'a non-object input reached the merge — counted, never crashed');
      continue;
    }
    const obs: NormalizedObservation | null =
      typeof (raw as Record<string, unknown>).source === 'string'
        ? normalizeW5Observation(raw as Record<string, unknown>)
        : (raw as NormalizedObservation);
    if (!obs) {
      result.malformed++;
      tridentLog('WARN', 'observer-enforcer', 'a malformed W5 observation reached the merge — counted, never crashed');
      continue;
    }
    result.observed++;
    const verdict = deps.machine.classify(obs);
    const sourcePlane =
      obs.metadata && typeof obs.metadata === 'object' && typeof (obs.metadata as Record<string, unknown>).sourcePlane === 'string'
        ? ((obs.metadata as Record<string, unknown>).sourcePlane as string)
        : '';
    const decision: MergeDecision = {
      at: obs.at,
      type: obs.type,
      sourcePlane,
      slopClass: verdict.slopClass,
      enforced: false,
    };

    if (verdict.slopClass === 'BENIGN') {
      // THE CLEAR-PASS — recorded (the ledger's benign row), never blocked.
      if (verdict.triad.pattern === 'INCONCLUSIVE') result.inconclusive++;
      else result.benign++;
      try {
        deps.ledger.record(obs, verdict, null);
      } catch (e: unknown) {
        // A BENIGN verdict with an unusable triad is the machine's contract break — loud, counted.
        result.deliveryFailures.push({ at: obs.at, slopClass: verdict.slopClass, error: e instanceof Error ? e.message : String(e) });
        tridentLog('ERROR', 'observer-enforcer', `the benign ledger record failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      result.decisions.push(decision);
      continue;
    }

    // THE SLOP CLASS — the enforcement trigger (§2.6: the observation matching a slop class
    // becomes the enforcement). The block demand is REQUIRED (the triage's contract).
    if (!verdict.block || typeof verdict.block.demand !== 'string' || verdict.block.demand.length === 0) {
      throw new Error(`EVENT_BLOCK_MISSING: the ${verdict.slopClass} verdict carries no block demand — the triage's contract broke (no demand, no enforcement)`);
    }
    const action = { kind: 'block' as const, demand: verdict.block.demand };
    try {
      fire(verdict); // THE ON-EVENT DELIVERY (E4 — the append-never-delete surface)
      decision.enforced = true;
      decision.demand = verdict.block.demand;
      result.enforced++;
    } catch (e: unknown) {
      // THE LOUD RECORD — the delivery failed; counted + logged, never silently swallowed.
      const message = e instanceof Error ? e.message : String(e);
      result.deliveryFailures.push({ at: obs.at, slopClass: verdict.slopClass, error: message });
      tridentLog('ERROR', 'observer-enforcer', `the ${verdict.slopClass} block delivery failed: ${message}`);
    }
    // THE LEDGER ROW — the enforcement records its own evidence (the replay proof).
    deps.ledger.record(obs, verdict, action);
    // THE SENTINEL FEED — the triad accumulates into the class's sentinel (§2.12); a fired
    // barrage lands in the result (the one-barrage proof).
    const sentinel = deps.sentinels ? sentinelFor(deps.sentinels, verdict.slopClass) : undefined;
    if (sentinel) {
      const acc = sentinel.accumulate(verdict.triad, obs.at);
      if (acc.fired && acc.barrage) result.sentinelBarrages.push(acc.barrage);
    }
    // THE CALIBRATION FEEDBACK — the events correct the detectors (E5, §2.5).
    if (feedback) applyFeedbackForVerdict(obs, verdict);
    result.decisions.push(decision);
  }
  return result;
}

// ── THE EVIDENCE-JSONL MERGE (§11.2 — the W5 planes' output on disk → the merge) ──

/** THE EVIDENCE MERGE OPTIONS. */
export interface MergeEvidenceOptions {
  /** The observation window (ms) — only the records at-or-after now-sinceMs are merged. */
  sinceMs?: number;
  /** The W5 planes to read (default: all four observation planes). */
  planes?: readonly string[];
  /** The clock (the deterministic battery seam). */
  now?: () => number;
}

const DEFAULT_OBSERVATION_PLANES: readonly string[] = ['reasoning', 'cadence', 'model', 'session'];
/** THE DEFAULT WINDOW — 30 min, mirroring the audit's ingestRecentEvents default (the W5
 *  consumption cadence, audit-events.ts). DATA, never a magic literal in the reader body. */
const DEFAULT_EVIDENCE_WINDOW_MS = 1_800_000;

/**
 * MERGE THE W5 EVIDENCE JSONL (§11.2 — the real wiring): reads the .trident/<plane>-evidence/
 * JSONL written by the observation planes and runs the merge over the recent window.
 *
 * THE LOUD EMPTY STATE: a missing .trident dir or a missing plane dir is NOT an error (the
 * honest no-observation state — a fresh target) — the plane lands in missingPlanes. A MALFORMED
 * JSONL line is counted (malformed) + loud-logged — never a crash, never a silent drop.
 */
export function mergeEvidenceJsonl(
  target: string,
  deps: ObserverEnforcerDeps,
  opts: MergeEvidenceOptions = {},
): ObserverEnforcerMergeResult {
  if (typeof target !== 'string' || target.length === 0) {
    throw new Error('EVENT_MERGE_TARGET_INVALID: the evidence merge requires the target path');
  }
  const now = opts.now?.() ?? Date.now();
  const since = now - (opts.sinceMs ?? DEFAULT_EVIDENCE_WINDOW_MS);
  const planes = opts.planes ?? DEFAULT_OBSERVATION_PLANES;
  const tridentDir = path.join(target, '.trident');
  const collected: Array<Record<string, unknown>> = [];
  const missingPlanes: string[] = [];
  let malformed = 0;

  if (!fs.existsSync(tridentDir)) {
    // THE HONEST EMPTY STATE — no evidence tree at all: every plane is missing (loud, counted).
    missingPlanes.push(...planes);
  } else {
    for (const plane of planes) {
      const dir = path.join(tridentDir, `${plane}-evidence`);
      if (!fs.existsSync(dir)) {
        missingPlanes.push(plane);
        continue;
      }
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.jsonl')) continue;
        const full = path.join(dir, file);
        let lines: string[];
        try {
          lines = fs.readFileSync(full, 'utf-8').split('\n');
        } catch (e: unknown) {
          // THE READER LAW — an unreadable evidence file is loud-logged + counted, never a crash.
          malformed++;
          tridentLog('WARN', 'observer-enforcer', `the evidence file ${full} could not be read: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const rec = JSON.parse(line) as Record<string, unknown>;
            // THE WINDOW BOUND — a mechanical membership check against the named window
            // (DEFAULT_EVIDENCE_WINDOW_MS), NOT a calibration threshold: the comparison decides
            // "in the window / out of the window", never a slop class (the ISE law — the
            // machine decides; the bound only narrows the read set).
            if (typeof rec.at === 'number' && rec.at < since) continue; // outside the window
            collected.push(rec);
          } catch {
            // THE MALFORMED LINE — counted + loud-logged (never a silent drop, never a crash).
            malformed++;
            tridentLog('WARN', 'observer-enforcer', `a malformed JSONL line in ${full} — counted, skipped`);
          }
        }
      }
    }
  }

  // THE MERGE — the chronological order is the causal order (the evidence replays as it happened).
  collected.sort((a, b) => (typeof a.at === 'number' ? a.at : 0) - (typeof b.at === 'number' ? b.at : 0));
  const result = mergeObservations(collected, deps);
  result.malformed += malformed;
  result.missingPlanes = missingPlanes;
  return result;
}

/**
 * THE OBSERVER-ENFORCER MERGE (the E6 unit as an object) — the stateful composition the E-PB5
 * wiring consumes: constructed ONCE with the real machinery (machine + ledger + fleet), then
 * driven per evidence sweep.
 */
export class ObserverEnforcerMerge {
  constructor(private readonly deps: ObserverEnforcerDeps) {
    // The constructor validates eagerly — a half-wired merge fails at construction, never mid-loop.
    if (!deps.machine || typeof deps.machine.classify !== 'function') {
      throw new Error('EVENT_MERGE_NO_MACHINE: the observer-enforcer merge requires the triage machine');
    }
    if (!deps.ledger || typeof deps.ledger.record !== 'function') {
      throw new Error('EVENT_MERGE_NO_LEDGER: the observer-enforcer merge requires the event ledger');
    }
  }

  /** MERGE THE OBSERVATIONS (the in-memory path). */
  merge(observations: ReadonlyArray<NormalizedObservation | W5Observation | Record<string, unknown>>): ObserverEnforcerMergeResult {
    return mergeObservations(observations, this.deps);
  }

  /** MERGE THE W5 EVIDENCE JSONL (the on-disk path, §11.2). */
  mergeFromEvidence(target: string, opts: MergeEvidenceOptions = {}): ObserverEnforcerMergeResult {
    return mergeEvidenceJsonl(target, this.deps, opts);
  }
}
