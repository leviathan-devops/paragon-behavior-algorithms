/**
 * event-substrate.ts — THE EVENT-OBSERVATION SUBSTRATE (SPEC-3 §2.1 / §9.1 — E1)
 *
 * THE ONE-HOOK-MANY-PLANES: a SINGLE `event` hook is registered. EVERY plane (the W5 observation
 * + the SPEC-3 enforcement) is a filter over that hook. THE THREE LAWS (the CUSTOM_EVENT_HOOK
 * bible — the source authority, SPEC-3 §7):
 *
 *   LAW 1 — THE FILTER LAW (the constant-time gate): each plane's `filter(event)` returns FIRST
 *            on a type mismatch. A non-matching event is ignored in constant time.
 *   LAW 2 — THE READER LAW (the defensive payload): each plane's `reader(event)` accesses the
 *            payload via optional-chaining + shape guards — a malformed event → null, never a crash.
 *   LAW 3 — THE OBSERVER LAW (observation-only by default) + THE ENFORCER ENGAGEMENT: the plane
 *            READS the event + acts on its own copy — never mutating the runtime's event, never
 *            throwing into the platform's loop by default. When the triage classifies a slop
 *            class, the enforcer's block is the ONE sanctioned mutation (the append).
 *
 * E-PB1 (this wave): the substrate + the plane registry + the routing + the ledger + the measured
 * registry. THE TRIAGE MACHINE (E-PB2) is NOT yet built — this E-PB1 substrate exposes an
 * INJECTABLE classifier entry point (`setTriageClassifier`) so the enforcer arm is testable NOW
 * + the real `DefaultTriageMachine` (E-PB2) wires in WITHOUT changing this API. THE ENFORCEMENT
 * DELIVERY (E-PB3's fireBlock) is likewise an injectable channel — E-PB1's tests capture the
 * append; the real delivery wires at E-PB5.
 */
import type { Hooks } from '@opencode-ai/plugin';
import { tridentLog } from '../../utils.js';
import { checkRegistryType } from './event-registry.js';

// ── THE CONTRACTS (SPEC-3 §2.8 — the E1 type surface) ──

/** THE RUNTIME EVENT — the shape the substrate routes. THE FILTER runs on this. */
export interface RuntimeEvent {
  type: string;
  properties?: { info?: Record<string, unknown> };
  [key: string]: unknown;
}

/** THE NORMALIZED OBSERVATION — the plane's reader output (the defensive extraction). */
export interface NormalizedObservation {
  sessionID: string;
  type: string;
  text: string;
  at: number;
  metadata?: unknown;
}

/** THE SLOP-CLASS LEXICON (SPEC-3 §2.3) — the triage's verdict vocabulary. Defined here so
 *  E-PB1's EventPlane contract is self-contained; E-PB2's TriageMachine imports it from here. */
export type SlopClass =
  | 'CLAIM_SLOP'
  | 'OVER_AUDIT'
  | 'DESTRUCTIVE_PLAN'
  | 'FAKE_RETURN'
  | 'CALIB_STALE'
  | 'TEA_NOT_TEB'
  | 'BENIGN';

/** THE ENFORCER ACTION (SPEC-3 §2.1) — the block/return/inject surfaced by the enforcer arm. */
export type EnforcerAction =
  | { kind: 'block'; demand: string }
  | { kind: 'return'; reason: string }
  | { kind: 'inject'; demand: string };

/** THE EVENT PLANE (SPEC-3 §2.8): the FILTER (constant-time type gate) + the READER (defensive)
 *  + the OBSERVER evidence arm + the ENFORCER onClassified arm. */
export interface EventPlane {
  name: string; // 'reasoning' | 'cadence' | 'session' | 'claim-slop' | 'over-audit' | ...
  kind: 'observer' | 'enforcer'; // observer = evidence; enforcer = block
  filter: (event: RuntimeEvent) => boolean; // THE FILTER LAW — constant-time
  reader: (event: RuntimeEvent) => NormalizedObservation | null; // THE READER LAW — defensive
  onClassified?: (obs: NormalizedObservation, klass: SlopClass) => EnforcerAction | null; // THE ENFORCER
  evidence?: (obs: NormalizedObservation) => void; // THE OBSERVER arm
}

/** THE CLASSIFIER — the triage decision entry (E-PB2 wires the real machine). */
export type Classifier = (obs: NormalizedObservation) => SlopClass;

/** THE TRIAD (SPEC-3 §2.3) — the {Pattern, State, Evidence} evidence unit. */
export interface Triad {
  pattern: string;
  state: string;
  evidence: string;
}

/** THE TRIAGE VERDICT (SPEC-3 §2.3) — the classification + its triad (+ the optional block). */
export interface TriageVerdict {
  slopClass: SlopClass;
  triad: Triad;
  block?: { demand: string; target: 'message' | 'tool-output' | 'state' };
}

/** THE BLOCK-DELIVERY CHANNEL — the sanctioned mutation (the demand/flag appended). E-PB3/E-PB5
 *  wire the real delivery; E-PB1's tests capture the append. */
export type BlockDelivery = (action: EnforcerAction, verdict: TriageVerdict) => void;

// ── THE STATE — the injectable classifier + the delivery channel (the E-PB2/E-PB3 seams) ──

let activeClassifier: Classifier | null = null;

/** INJECT THE TRIAGE CLASSIFIER (E-PB2 wires the `DefaultTriageMachine` here). The default is
 *  null → an enforcer observation with no classifier is classified BENIGN + logged (never a
 *  silent drop; the registry-gap is explicit, the OBSERVER law holds — the runtime never breaks). */
export function setTriageClassifier(classifier: Classifier | null): void {
  activeClassifier = classifier;
  tridentLog('INFO', 'event-substrate', `triage classifier ${classifier ? 'attached' : 'detached'}`);
}

let activeDelivery: BlockDelivery | null = null;

/** INJECT THE BLOCK-DELIVERY CHANNEL (E-PB3/E-PB5 wire the real fireBlock here). The default
 *  is null → a block is logged but NOT delivered (never thrown into the platform's loop). */
export function setBlockDelivery(delivery: BlockDelivery | null): void {
  activeDelivery = delivery;
}

// ── THE PLANE REGISTRY (SPEC-3 §9.1 — the planes are DATA) ──

export class PlaneRegistry {
  private planes: EventPlane[] = [];

  register(p: EventPlane): void {
    if (!p || typeof p.name !== 'string' || !p.name) {
      throw new Error('EVENT_PLANE_INVALID: a plane requires a name');
    }
    if (p.kind !== 'observer' && p.kind !== 'enforcer') {
      // THE AP-E-1 law: the plane kind is 'observer' OR 'enforcer' — no hybrid.
      throw new Error('EVENT_PLANE_KIND_INVALID: the plane kind must be "observer" | "enforcer"');
    }
    if (p.kind === 'observer' && typeof p.evidence !== 'function') {
      throw new Error('EVENT_PLANE_OBSERVER_EVIDENCE_MISSING: an observer plane needs an evidence arm');
    }
    if (p.kind === 'enforcer' && typeof p.onClassified !== 'function') {
      throw new Error('EVENT_PLANE_ENFORCER_ARM_MISSING: an enforcer plane needs an onClassified arm');
    }
    this.planes.push(p);
  }

  all(): EventPlane[] {
    return [...this.planes];
  }
}

// ── THE SUBSTRATE CORE (the one-hook-many-planes routing + the three laws) ──

/** ROUTE ONE OBSERVATION THROUGH ONE ENFORCER PLANE — the decision + the block. Returns the
 *  verdict so the caller (registerEventSubstrate) records it in the ledger. Error paths FIRST:
 *  a missing triad → EVENT_TRIAD_MISSING; a noisy/unregistered type → the registry-gap log. */
function routeEnforcer(plane: EventPlane, obs: NormalizedObservation): TriageVerdict | null {
  if (activeClassifier) {
    const klass = activeClassifier(obs);
    const verdict: TriageVerdict = {
      slopClass: klass,
      triad: {
        pattern: 'classifier',
        state: 'CLASSIFIED',
        evidence: obs.text.slice(0, 200) || obs.type,
      },
    };
    if (klass !== 'BENIGN') {
      // THE TRIAD-COMPLETENESS: a slop class without its {Pattern, State, Evidence} triad is NOT
      // a verdict — EVENT_TRIAD_MISSING THROWS before the block (SPEC-3 §2.15 / §9.2).
      if (!verdict.triad.pattern || !verdict.triad.state) {
        throw new Error('EVENT_TRIAD_MISSING: a slop-class without its evidence triad is not a verdict');
      }
    }
    return verdict;
  }
  // NO CLASSIFIER (E-PB2 not yet wired): an enforcer observation cannot decide — classified
  // BENIGN + the gap logged (a definitive no-silent-drop; the OBSERVER law holds).
  tridentLog('WARN', 'event-substrate', `no triage classifier attached — enforcer plane ${plane.name} observed (${obs.type}) is classified BENIGN (the E-PB2 wire pending)`);
  return { slopClass: 'BENIGN', triad: { pattern: 'no-classifier', state: 'RETURNED', evidence: obs.type } };
}

/** THE ONE REGISTRATION — the event hook fires for EVERY runtime event; the planes filter. */
export function registerEventSubstrate(hooks: Hooks, planes: EventPlane[]): void {
  if (!hooks) throw new Error('EVENT_SUBSTRATE_NO_HOOKS: a Hooks object is required');
  const registry = new PlaneRegistry();
  for (const p of planes) registry.register(p);

  // THE ONE-HOOK LAW: this registration is the ONLY event hook the substrate owns. A second
  // call REPLACES the hook (the single-library contract) — verified by the battery's hookSetCount.
  hooks.event = async (input: unknown) => {
    // THE NOISE GATE (SPEC-3 §9.1): an untyped event is nothing — ignored, never a crash.
    const evt = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const evtObj = evt.event && typeof evt.event === 'object' ? (evt.event as Record<string, unknown>) : evt;
    const type = typeof (evtObj as { type?: unknown }).type === 'string' ? (evtObj as { type: string }).type : '';
    if (!type) return;

    // THE REGISTRY-GAP LAW (§16.2): the substrate NEVER filters on a type NOT in the registry —
    // an unregistered type is ignored (the FILTER law) + logged as the registry gap.
    const gap = checkRegistryType(type);
    if (!gap.registered) {
      if (gap.hypothesis) {
        tridentLog('WARN', 'event-substrate', `REGISTRY_GAP: unobserved event type "${type}" (the LIVING-DOC — the E-PB5 probe confirms or removes it)`);
      }
      return;
    }

    const runtimeEvent = evtObj as unknown as RuntimeEvent;
    for (const plane of registry.all()) {
      try {
        // THE FILTER LAW — return FIRST on a non-matching type (the constant-time gate).
        if (!plane.filter(runtimeEvent)) continue;
        // THE READER LAW — the defensive extraction; null → nothing observed (never a crash).
        const obs = plane.reader(runtimeEvent);
        if (!obs) continue;
        // THE OBSERVER ARM — record + continue (the evidence, never a decision).
        if (plane.kind === 'observer') {
          plane.evidence!(obs);
          continue;
        }
        // THE ENFORCER ARM — the triage decides → the block fires (the decision, never the filter).
        const verdict = routeEnforcer(plane, obs);
        if (!verdict) continue;
        if (verdict.slopClass === 'BENIGN') continue; // the benign observation — recorded, no block
        const action = plane.onClassified!(obs, verdict.slopClass);
        if (action?.kind === 'block' || action?.kind === 'inject') {
          if (activeDelivery) {
            activeDelivery(action, verdict); // the sanctioned ON-EVENT append
          } else {
            // THE OBSERVER-LAW default: no delivery channel → log the intended block, never throw.
            tridentLog('WARN', 'event-substrate', `[${action.kind === 'block' ? 'BLOCK' : 'INJECT'}] ${action.demand} (no delivery channel attached — E-PB5 wires it)`);
          }
        }
      } catch (e: unknown) {
        // THE OBSERVER LAW — a plane failure NEVER breaks the platform's loop; it is logged.
        tridentLog('WARN', 'event-substrate', `plane ${plane.name} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };
}
