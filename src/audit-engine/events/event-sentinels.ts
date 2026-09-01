/**
 * event-sentinels.ts — THE EVENT SENTINEL FLEET (SPEC-3 §2.7 / §2.12 / §13.1 — E7 fleet)
 *
 * THE PARAGON L5 SENTINEL FLEET, adapted to the event stream. Each sentinel is a long-running
 * event-side watch that aggregates the ENFORCEMENT signals (the triage machine's triads — the
 * evidence, never a bare count) over a window and fires ONE composed barrage at the threshold.
 *
 * THE ONE-BARRAGE LAW (§2.12 — the accumulator mechanics, implemented VERBATIM): the sentinel
 * accumulates the triads; at the threshold ∧ the refractory window elapsed ∧ the PRIMED state,
 * it fires ONE composed enforcement demand, then RESETS (count = 0, lastBarrageAt = now). THE
 * SENTINEL NEVER FIRES REPEATEDLY — one barrage per episode.
 *
 * THE CASCADE-DOUBLE-FIRE GUARD (AP-E-7, §4.2/§10.5): the sentinel's barrage IS the enforcement
 * demand — the firewall records the block, the sentinel delivers the demand ONCE. THE REFRACTORY
 * WINDOW + THE LEDGER DEDUPE (the optional dedupe probe reading the EventLedger) prevent a
 * second delivery for the same episode.
 *
 * THE THRESHOLDS ARE DATA (§9.7 — the versioned registers): CLAIM/OVER_AUDIT/CALIB_STALE read
 * from REGISTERS (event-registry.ts); the window + the refractory read from the named 5-minute
 * register. A literal ladder in the sentinel body is the ISE slop-signature — BANNED.
 *
 * ERROR PATHS FIRST: an invalid class/config/demand, an empty triad, a BENIGN sentinel — all
 * NAMED throws. A delivery failure is loud-logged + recorded (delivered: false), never silently
 * swallowed, never thrown into the caller's loop (the OBSERVER law applied to the fleet).
 */
import { tridentLog } from '../../utils.js';
import type { EventLedger } from './event-ledger.js';
import type { EnforcerAction, SlopClass, Triad, TriageVerdict } from './event-substrate.js';
import { REGISTERS } from './event-registry.js';
import {
  BLOCK_MARKERS,
  DEFAULT_BLOCK_TARGET,
  calibStaleDemand,
  claimDemand,
  contradictionDemand,
  fireBlock,
  overAuditDemand,
  teaNotTebDemand,
} from './event-firewalls.js';

// ── THE CONTRACTS (SPEC-3 §13.1) ──

/** THE SENTINEL CONFIG (§2.12/§13.1): the aggregation window, the fire threshold, the
 *  refractory window — ALL DATA, sourced from the registers at fleet construction. */
export interface SentinelConfig {
  windowMs: number;
  threshold: number;
  refractoryMs: number;
}

/** THE SENTINEL BARRAGE — the ONE composed enforcement demand per episode. delivered:false is
 *  the loud record of a failed delivery (the failure is recorded, never hidden). */
export interface SentinelBarrage {
  at: number;
  slopClass: SlopClass;
  demand: string;
  count: number; // the accumulated triads that composed this barrage
  triad: Triad; // the firing triad (the evidence — no triad, no barrage)
  delivered: boolean;
}

/** THE ACCUMULATE RESULT — the observable state after each triad (the decision surface). */
export interface AccumulateResult {
  fired: boolean;
  count: number;
  primed: boolean;
  barrage?: SentinelBarrage;
}

/** THE SENTINEL OPTIONS — the injectable seams (the clock for the deterministic battery, the
 *  ledger dedupe probe for the AP-E-7 guard, the barrage sink for the E-PB5 delivery wiring). */
export interface SentinelOptions {
  now?: () => number;
  ledger?: EventLedger;
  onBarrage?: (barrage: SentinelBarrage) => void;
}

const SLOP_CLASSES: ReadonlySet<SlopClass> = new Set([
  'CLAIM_SLOP',
  'OVER_AUDIT',
  'DESTRUCTIVE_PLAN',
  'FAKE_RETURN',
  'CALIB_STALE',
  'TEA_NOT_TEB',
]);

/** THE EVIDENCE RETENTION BOUND — the buffer keeps the last max(threshold×4, 16) triads so a
 *  sustained violation flood never grows the sentinel unboundedly. The COUNT (the fire logic)
 *  is unaffected — the bound is memory hygiene only (§2.12's count logic is verbatim). */
function retentionBound(threshold: number): number {
  return Math.max(threshold * 4, 16);
}

// ── THE EVENT SENTINEL (§2.12 — the accumulator mechanics, verbatim) ──

export class EventSentinel {
  private count = 0;
  private lastBarrageAt = 0;
  private readonly triadBuffer: Array<{ triad: Triad; at: number }> = [];
  private readonly barrageLog: SentinelBarrage[] = [];
  private readonly windowMs: number;
  private readonly threshold: number;
  private readonly refractoryMs: number;
  private readonly clock: () => number;
  private readonly ledger?: EventLedger;
  private readonly onBarrage?: (barrage: SentinelBarrage) => void;

  constructor(
    readonly slopClass: SlopClass,
    config: SentinelConfig,
    private readonly demand: string,
    opts: SentinelOptions = {},
  ) {
    // ERROR PATHS FIRST — the named throws (no silent misconfiguration).
    if (!SLOP_CLASSES.has(slopClass)) {
      throw new Error(`EVENT_SENTINEL_CLASS_INVALID: a sentinel watches a slop class, never "${String(slopClass)}" (BENIGN is returned, never watched)`);
    }
    if (!config || typeof config !== 'object') {
      throw new Error('EVENT_SENTINEL_CONFIG_INVALID: the sentinel requires a SentinelConfig { windowMs, threshold, refractoryMs }');
    }
    // THE CONFIG BOUNDS — mechanical validity checks (positive window, integer threshold ≥ 1,
    // non-negative refractory), NOT calibration decisions: the thresholds themselves are the
    // REGISTERS data (§9.7); these guards only reject a physically meaningless config (the ISE
    // law — bounds guards are the detection layer, the fleet table is the decision data).
    if (!Number.isFinite(config.windowMs) || config.windowMs <= 0) {
      throw new Error('EVENT_SENTINEL_CONFIG_INVALID: windowMs must be a finite positive number');
    }
    if (!Number.isFinite(config.threshold) || config.threshold < 1 || !Number.isInteger(config.threshold)) {
      throw new Error('EVENT_SENTINEL_CONFIG_INVALID: threshold must be a positive integer — a fractional threshold is a magic-ladder smell');
    }
    if (!Number.isFinite(config.refractoryMs) || config.refractoryMs < 0) {
      throw new Error('EVENT_SENTINEL_CONFIG_INVALID: refractoryMs must be a finite non-negative number');
    }
    if (typeof demand !== 'string' || demand.length === 0) {
      throw new Error('EVENT_SENTINEL_DEMAND_INVALID: the barrage demand must be non-empty — a contentless barrage is a contentless mutation');
    }
    const marker = BLOCK_MARKERS[slopClass as Exclude<SlopClass, 'BENIGN'>];
    if (!demand.includes(marker)) {
      // THE MARKER LAW (the fireBlock law applied at construction): the barrage demand must
      // carry the class's bound marker, or the E-PB5 container pass-token cannot attribute it.
      throw new Error(`EVENT_SENTINEL_MARKER_MISMATCH: the ${slopClass} barrage demand must carry ${marker}`);
    }
    this.windowMs = config.windowMs;
    this.threshold = config.threshold;
    this.refractoryMs = config.refractoryMs;
    this.clock = opts.now ?? (() => Date.now());
    this.ledger = opts.ledger;
    this.onBarrage = opts.onBarrage;
  }

  /** THE CONFIG READER — the thresholds as constructed (the battery asserts them against the
   *  REGISTERS data, never against literals). */
  config(): SentinelConfig {
    return { windowMs: this.windowMs, threshold: this.threshold, refractoryMs: this.refractoryMs };
  }

  /** THE CURRENT COUNT — the accumulated triads since the last barrage. */
  pendingCount(): number {
    return this.count;
  }

  /** THE PRIMED STATE (§9.7 SENTINEL_PRIMED): the accumulated triads ≥ threshold ∧ the
   *  refractory elapsed. A reader — never a side effect. */
  isPrimed(at?: number): boolean {
    const now = at ?? this.clock();
    return this.count >= this.threshold && now - this.lastBarrageAt > this.refractoryMs;
  }

  /** THE LEDGER-DEDUPE PROBE (AP-E-7): TRUE when the ledger already carries a block/inject
   *  delivery for this class within the refractory window — the episode's demand was already
   *  delivered; a second barrage would be the cascade-double-fire. The ledger's recent() owns
   *  the window (the ledger is the wall-clock delivery record); the probe adds no second clock. */
  private alreadyDelivered(): boolean {
    if (!this.ledger) return false;
    return this.ledger
      .recent(this.slopClass, this.refractoryMs)
      .some((r) => r.action?.kind === 'block' || r.action?.kind === 'inject');
  }

  /**
   * THE ACCUMULATE (§2.12 — verbatim): the triage machine's triads feed the sentinel (the
   * evidence, never a bare count). At the threshold ∧ the refractory window ∧ NOT already
   * delivered (the ledger dedupe), the sentinel fires ONE composed barrage, then resets.
   * ERROR PATH FIRST: an empty triad is EVENT_TRIAD_MISSING (no triad, no barrage).
   */
  accumulate(triad: Triad, at?: number): AccumulateResult {
    if (!triad || typeof triad.pattern !== 'string' || triad.pattern.length === 0
      || typeof triad.state !== 'string' || triad.state.length === 0
      || typeof triad.evidence !== 'string' || triad.evidence.length === 0) {
      throw new Error('EVENT_TRIAD_MISSING: a sentinel cannot accumulate a bare count — the {Pattern, State, Evidence} triad is the signal');
    }
    const now = at ?? this.clock();
    this.triadBuffer.push({ triad, at: now });
    const bound = retentionBound(this.threshold);
    if (this.triadBuffer.length > bound) this.triadBuffer.splice(0, this.triadBuffer.length - bound);

    this.count++;
    // THE ONE-BARRAGE LAW (§2.12): threshold ∧ refractory ∧ not-already-delivered → fire ONCE, reset.
    if (this.count >= this.threshold && now - this.lastBarrageAt > this.refractoryMs && !this.alreadyDelivered()) {
      const barrage = this.fireBarrage(triad, now);
      this.count = 0;
      this.lastBarrageAt = now;
      return { fired: true, count: this.count, primed: false, barrage };
    }
    return { fired: false, count: this.count, primed: this.isPrimed(now) };
  }

  /** THE ONE BARRAGE — compose + deliver the ONE enforcement demand via the inject/block
   *  channel (§2.12). The default delivery is the E-PB3 fireBlock (the append-never-delete
   *  surface); an injected onBarrage sink overrides it (the E-PB5 wiring seam). A delivery
   *  failure is loud-logged + recorded (delivered: false) — never silently swallowed. */
  private fireBarrage(triad: Triad, now: number): SentinelBarrage {
    const barrage: SentinelBarrage = {
      at: now,
      slopClass: this.slopClass,
      demand: this.demand,
      count: this.count,
      triad,
      delivered: false,
    };
    const verdict: TriageVerdict = {
      slopClass: this.slopClass,
      triad,
      block: { demand: this.demand, target: DEFAULT_BLOCK_TARGET[this.slopClass as Exclude<SlopClass, 'BENIGN'>] },
    };
    const action: EnforcerAction = { kind: 'inject', demand: this.demand };
    try {
      if (this.onBarrage) {
        this.onBarrage(barrage);
      } else {
        fireBlock(this.demand, verdict);
      }
      barrage.delivered = true;
      // THE LEDGER RECORD (AP-E-7): the barrage is recorded so the dedupe probe prevents the
      // second delivery for the same episode.
      if (this.ledger) {
        this.ledger.record(
          { sessionID: '', type: `sentinel.${this.slopClass}`, text: this.demand, at: now },
          verdict,
          action,
        );
      }
      tridentLog('WARN', 'event-sentinels', `EVENT_SENTINEL_BARRAGE ${BLOCK_MARKERS[this.slopClass as Exclude<SlopClass, 'BENIGN'>]} (one barrage per episode — count ${barrage.count}, threshold ${this.threshold})`);
    } catch (e: unknown) {
      // THE LOUD RECORD — the delivery failed; the barrage is recorded as NOT delivered and
      // the failure is logged. The sentinel never throws into the caller's loop.
      tridentLog('ERROR', 'event-sentinels', `sentinel ${this.slopClass} barrage delivery FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.barrageLog.push(barrage);
    return barrage;
  }

  /** THE BARRAGE HISTORY — the append-only record (the one-barrage proof for the battery). */
  barrages(): SentinelBarrage[] {
    return [...this.barrageLog];
  }

  /** THE PENDING EVIDENCE — the accumulated triads within the aggregation window (the evidence
   *  view; the fire logic is the count, per §2.12 verbatim). */
  pending(at?: number): Triad[] {
    const now = at ?? this.clock();
    const cutoff = now - this.windowMs;
    return this.triadBuffer.filter((t) => t.at >= cutoff).map((t) => t.triad);
  }
}

// ── THE FLEET (SPEC-3 §13.1 — the five sentinels, the thresholds as REGISTER data) ──

/**
 * THE STRUCTURAL-VIOLATION THRESHOLD — the DESTRUCTIVE_PLAN + TEA_NOT_TEB sentinels fire on the
 * FIRST signal (§2.7: ≥1 — a single destructive plan or a single non-before enforcement IS the
  * episode; there is no "burst" of a legitimate contradiction). E-PB5 UPDATE: the two named
  * registers now EXIST in REGISTERS (event-registry.ts — DESTRUCTIVE_PLAN_THRESHOLD /
  * TEA_NOT_TEB_THRESHOLD, both = 1 per §2.7); this constant RE-POINTS at the register (the
  * register-law: thresholds are DATA, never a local literal).
  */
export const STRUCTURAL_VIOLATION_THRESHOLD = REGISTERS.DESTRUCTIVE_PLAN_THRESHOLD;

/** THE FLEET TABLE (§13.1 — the five sentinels as DATA): each row binds the class, the register
 *  threshold, and the E-PB3 demand constructor. THE WINDOW + THE REFRACTORY read the named
 *  5-minute register (§9.7 CLAIM_REFRACTORY_MS — the ONE-barrage-per-episode window). */
const FLEET_TABLE: ReadonlyArray<{
  klass: Exclude<SlopClass, 'BENIGN'>;
  threshold: number;
  demand: () => string;
}> = [
  { klass: 'CLAIM_SLOP', threshold: REGISTERS.CLAIM_THRESHOLD, demand: claimDemand },
  { klass: 'OVER_AUDIT', threshold: REGISTERS.OVER_AUDIT_THRESHOLD, demand: overAuditDemand },
  { klass: 'DESTRUCTIVE_PLAN', threshold: REGISTERS.DESTRUCTIVE_PLAN_THRESHOLD, demand: contradictionDemand },
  { klass: 'CALIB_STALE', threshold: REGISTERS.CALIB_STALE_THRESHOLD, demand: () => calibStaleDemand() },
  { klass: 'TEA_NOT_TEB', threshold: REGISTERS.TEA_NOT_TEB_THRESHOLD, demand: teaNotTebDemand },
];

/** THE FLEET OPTIONS — the shared seams for all five sentinels. */
export interface SentinelFleetOptions extends SentinelOptions {}

/**
 * BUILD THE SENTINEL FLEET (§13.1): the five sentinels, each watching its slop class, each with
 * the register thresholds (the conservative start — "not so aggressive it blocks legit build
 * functions"; the live data calibrates them). THE WINDOW/REFRACTORY are the 5-minute register.
 */
export function buildSentinelFleet(opts: SentinelFleetOptions = {}): EventSentinel[] {
  return FLEET_TABLE.map(
    (row) =>
      new EventSentinel(
        row.klass,
        {
          windowMs: REGISTERS.CLAIM_REFRACTORY_MS,
          threshold: row.threshold,
          refractoryMs: REGISTERS.CLAIM_REFRACTORY_MS,
        },
        row.demand(),
        opts,
      ),
  );
}

/** THE FLEET LOOKUP — the sentinel watching a class (the observer-enforcer merge's feed). */
export function sentinelFor(fleet: readonly EventSentinel[], klass: SlopClass): EventSentinel | undefined {
  return fleet.find((s) => s.slopClass === klass);
}
