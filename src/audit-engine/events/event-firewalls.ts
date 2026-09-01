/**
 * event-firewalls.ts — THE EVENT FIREWALLS (SPEC-3 §2.4 / §2.8 E4 / §9.8 E4)
 *
 * THE BLOCK MECHANISM (the ON-EVENT act): when the triage classifies a SLOP-CLASS, the
 * plane's block action is the ONE sanctioned mutation — the enforcement demand is APPENDED
 * to the caller's visible surface (the message / the tool-output / the loop-result), NEVER
 * a deletion of the agent's content (THE AUTONOMY LAW, §2.4: "the gate appends a demand,
 * NEVER erases the agent's content"; §10.5 #3: a deletion is a THEATRICAL block).
 *
 * THE LOUD-FAIL-OR-CLEAR-PASS (WARHEAD 10, §2.4): every event is BLOCKED (the named class
 * + the demand) or RETURNED (benign + recorded). There is NO silent skip: a block on a
 * BENIGN verdict, an empty demand, a missing triad, or a class/marker mismatch is a LOUD
 * named throw — never a dropped block.
 *
 * THE MARKERS ARE DATA (SPEC-3 §2.4 — the class → marker binding), imported by the E-PB2
 * triage's block constructors and asserted by the E-PB5 container pass tokens.
 *
 * E-PB3 (this wave): the delivery channel is the append-only visible-surface buffer + the
 * injectable sink. E-PB5 wires the sink to the real message/tool-output stream — the
 * buffer is the deterministic, testable core; the sink seam means E-PB5 changes NOTHING here.
 */
import type { EnforcerAction, SlopClass, TriageVerdict } from './event-substrate.js';
import { tridentLog } from '../../utils.js';

// ── THE MARKER BINDING (SPEC-3 §2.4 — the class → marker table as DATA) ──

/** THE BLOCK MARKERS — the exact strings the E-PB5 container pass-tokens assert IN THE
 *  CAPTURED PANE. BECAUSE: each marker names the enforcing subsystem + the class, so a
 *  marker in the stream is attributable to exactly one slop class (the audit's evidence). */
export const BLOCK_MARKERS: Record<Exclude<SlopClass, 'BENIGN'>, string> = {
  CLAIM_SLOP: '[SSTF EVENT: CLAIM]',         // §2.4: appended to the message/tool-output the agent sees
  OVER_AUDIT: '[LOOP: OVER_FIRED]',          // §2.4: injected into the loop's DECIDE result → CALIBRATION
  DESTRUCTIVE_PLAN: '[LOOP: CONTRADICTION]', // §2.4: the wave is not dispatched
  FAKE_RETURN: '[SSTF EVENT: FAKE_RETURN]',  // §2.4: the tool-result flagged, never consumable as a pass
  CALIB_STALE: '[AUDIT: CALIB_STALE]',       // §2.4: feeds the D17 recalibration (E5)
  TEA_NOT_TEB: '[HOOK: TEA_NOT_TEB]',        // §2.4: blocks the non-before registration
} as const;

/** THE DEFAULT BLOCK TARGETS (SPEC-3 §10.1 sketch lines 881-886 — the triage's block.target
 *  per class; used when a verdict carries no explicit block target). BECAUSE: the message
 *  surface is where the agent reads (CLAIM_SLOP), the tool-output is where the fake pass
 *  would be consumed (FAKE_RETURN), and the loop/audit state is where the routing signals
 *  land (OVER_AUDIT/DESTRUCTIVE_PLAN/CALIB_STALE/TEA_NOT_TEB — the C7: the over-audit block
 *  targets 'state'). */
export const DEFAULT_BLOCK_TARGET: Record<Exclude<SlopClass, 'BENIGN'>, 'message' | 'tool-output' | 'state'> = {
  CLAIM_SLOP: 'message',
  OVER_AUDIT: 'state',
  DESTRUCTIVE_PLAN: 'state',
  FAKE_RETURN: 'tool-output',
  CALIB_STALE: 'state',
  TEA_NOT_TEB: 'state',
} as const;

// ── THE DEMAND CONSTRUCTORS (SPEC-3 §2.8 E4 — the six demands the triage's blocks carry) ──

/** CLAIM_SLOP — the bare theatrical claim with no tool-result evidence on record. */
export function claimDemand(): string {
  return `${BLOCK_MARKERS.CLAIM_SLOP} the claim is un-evidenced — the container test is the only proof; the next response MUST address this demand`;
}

/** OVER_AUDIT — findings > files × the OVER_AUDIT_RATIO register; the loop routes to
 *  CALIBRATION, never DISPATCH. */
export function overAuditDemand(): string {
  return `${BLOCK_MARKERS.OVER_AUDIT} the audit over-fires — route to CALIBRATION, never DISPATCH`;
}

/** DESTRUCTIVE_PLAN — the wave suggestion contradicts the working-architecture registry. */
export function contradictionDemand(): string {
  return `${BLOCK_MARKERS.DESTRUCTIVE_PLAN} the planned wave contradicts the working architecture — the wave is NOT dispatched`;
}

/** FAKE_RETURN — the tool-result matches the R17 theatrical shape (a hardcoded success). */
export function fakeReturnDemand(): string {
  return `${BLOCK_MARKERS.FAKE_RETURN} the tool-result is theatrical — it is flagged, never consumable as a pass`;
}

/** CALIB_STALE — a matcher false-fired on the clean core; the D17 re-calibration feeds. */
export function calibStaleDemand(matcherId?: string): string {
  const target = typeof matcherId === 'string' && matcherId.length > 0 ? matcherId : 'UNKNOWN_MATCHER';
  return `${BLOCK_MARKERS.CALIB_STALE} the matcher ${target} false-fired on the clean core — the D17 re-calibration is required before the next audit`;
}

/** TEA_NOT_TEB — an enforcement registered in a non-before hook CANNOT block (tea, not teb). */
export function teaNotTebDemand(): string {
  return `${BLOCK_MARKERS.TEA_NOT_TEB} an enforcement is registered in a non-before hook — it cannot block (tea, not teb); the registration is blocked`;
}

// ── THE DELIVERY CHANNEL (the append-never-delete visible surface) ──

/** THE BLOCK-DELIVERY RECORD — the append proof. surfaceAfter MUST equal surfaceBefore +
 *  appended.length: the append-only law made measurable (a deletion would shrink the
 *  surface and falsify the record). */
export interface BlockDeliveryRecord {
  at: number;
  slopClass: SlopClass;
  marker: string;
  demand: string;
  target: 'message' | 'tool-output' | 'state';
  appended: string;      // the exact text appended to the visible surface
  surfaceBefore: number; // the surface length BEFORE the append
  surfaceAfter: number;  // the surface length AFTER — the append-only proof
}

/** THE DELIVERY SINK — the E-PB5 seam: the real message/tool-output/loop-result stream
 *  consumes each appended demand. The default is the append-only buffer below. */
export type DeliverySink = (record: BlockDeliveryRecord) => void;

/** THE VISIBLE SURFACE — the append-only delivery buffer (E-PB3). E-PB5 replaces the
 *  consumer via setDeliverySink; this buffer remains the deterministic record. There is
 *  NO delete/truncate API by construction — the only mutation is push. */
const visibleSurface: string[] = [];
const deliveryRecords: BlockDeliveryRecord[] = [];
let activeSink: DeliverySink | null = null;

/** INJECT THE DELIVERY SINK (E-PB5 wires the real stream here). null restores the default
 *  buffer-only delivery. */
export function setDeliverySink(sink: DeliverySink | null): void {
  activeSink = sink;
}

/** THE SURFACE READER — the appended demands, in order (the append-only proof for tests
 *  + the E-PB5 drain). Returns a copy; the buffer itself is never exposed for mutation. */
export function deliverySurface(): string[] {
  return [...visibleSurface];
}

/** THE RECORD READER — the full delivery records (the surfaceBefore/After proofs). */
export function deliveryLog(): BlockDeliveryRecord[] {
  return [...deliveryRecords];
}

/** THE RESET — the test/lifecycle hook (returns the cleared count). NOT a runtime path:
 *  the runtime surface is append-only for the process's life. */
export function resetEventFirewalls(): number {
  const n = deliveryRecords.length;
  visibleSurface.length = 0;
  deliveryRecords.length = 0;
  activeSink = null;
  return n;
}

// ── THE FIREWALL (E4 — the ON-EVENT block) ──

/**
 * FIRE THE BLOCK — the ONE sanctioned mutation: the demand APPENDED to the visible surface.
 *
 * ERROR PATHS FIRST (the loud-fail law — every failure is a NAMED throw, never a skip):
 *   EVENT_BLOCK_EMPTY_DEMAND   — a block with no demand text is a contentless mutation
 *   EVENT_TRIAD_MISSING        — a slop-class block without its {Pattern, State, Evidence}
 *                                triad is a bare assertion (SPEC-3 §2.3 — no triad, no block)
 *   EVENT_BLOCK_BENIGN         — a block on a BENIGN verdict is a false positive firing;
 *                                benign events are RETURNED, never blocked (no silent skip:
 *                                the misuse LOUD-fails)
 *   EVENT_BLOCK_MARKER_MISMATCH — the demand's marker must be the class's bound marker; a
 *                                mismatch means the triage/demand wiring drifted
 *
 * THE AUTONOMY LAW: the ONLY mutation is the append. The agent's prior content is never
 * read for modification, never deleted, never replaced.
 */
export function fireBlock(demand: string, verdict: TriageVerdict): BlockDeliveryRecord {
  if (typeof demand !== 'string' || demand.length === 0) {
    throw new Error('EVENT_BLOCK_EMPTY_DEMAND: a block with no demand text is a contentless mutation');
  }
  if (!verdict || typeof verdict !== 'object') {
    throw new Error('EVENT_TRIAD_MISSING: a block without its verdict is a bare assertion — no triad, no block');
  }
  const triad = verdict.triad;
  if (!triad || !triad.pattern || !triad.state || !triad.evidence) {
    throw new Error('EVENT_TRIAD_MISSING: a slop-class block without its {Pattern, State, Evidence} triad is a bare assertion — no triad, no block');
  }
  const klass = verdict.slopClass;
  if (klass === 'BENIGN') {
    // THE LOUD-FAIL: a benign event is RETURNED + recorded — blocking it is the false-positive
    // defect class (SPEC-3 §10.5 #2). The misuse THROWS; it never silently blocks.
    throw new Error('EVENT_BLOCK_BENIGN: a BENIGN verdict is RETURNED, never blocked — the benign-block is a false positive');
  }
  const marker = BLOCK_MARKERS[klass];
  if (!marker) {
    throw new Error(`EVENT_BLOCK_CLASS_UNKNOWN: the slop class "${String(klass)}" has no marker binding — the registry is the single source`);
  }
  if (!demand.includes(marker)) {
    throw new Error(`EVENT_BLOCK_MARKER_MISMATCH: the ${klass} block must carry ${marker} — the demand was "${demand.slice(0, 120)}"`);
  }

  // THE SANCTIONED MUTATION — the append (the autonomy law: append-only, never a deletion).
  const target = verdict.block?.target ?? DEFAULT_BLOCK_TARGET[klass];
  const surfaceBefore = visibleSurface.reduce((n, s) => n + s.length, 0);
  visibleSurface.push(demand);
  const surfaceAfter = surfaceBefore + demand.length;
  const record: BlockDeliveryRecord = {
    at: Date.now(),
    slopClass: klass,
    marker,
    demand,
    target,
    appended: demand,
    surfaceBefore,
    surfaceAfter,
  };
  deliveryRecords.push(record);
  // THE EVIDENCE: the block is logged with its marker (EVENT_SLOP_BLOCKED, SPEC-3 §9.5) —
  // the ledger row is the substrate's write (the caller records; the firewall delivers).
  tridentLog('INFO', 'event-firewalls', `EVENT_SLOP_BLOCKED ${marker} → ${target}: ${demand.slice(0, 200)}`);
  if (activeSink) {
    // THE E-PB5 SINK — the real stream delivery. A sink failure is loud-logged, never
    // thrown back into the platform's loop (the OBSERVER law), and the buffer record
    // above is already the durable truth.
    try {
      activeSink(record);
    } catch (e: unknown) {
      tridentLog('ERROR', 'event-firewalls', `delivery sink failed for ${marker}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return record;
}

/** THE SUBSTRATE ADAPTER — wires fireBlock into the E-PB1 substrate's injectable
 *  BlockDelivery seam (`setBlockDelivery`) WITHOUT modifying event-substrate.ts. Only
 *  block/inject actions deliver; a 'return' action is the clear-pass (recorded, no block). */
export function substrateBlockDelivery(action: EnforcerAction, verdict: TriageVerdict): void {
  if (action && (action.kind === 'block' || action.kind === 'inject')) {
    fireBlock(action.demand, verdict);
  }
}
