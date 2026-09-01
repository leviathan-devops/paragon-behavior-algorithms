/**
 * event-sentinels.test.ts — THE SENTINEL-FLEET BATTERY (SPEC-3 §2.7 / §2.12 / §13.1)
 *
 * THE ONE-BARRAGE LAW under test: each sentinel accumulates the triage machine's triads + fires
 * ONE composed barrage at its threshold, then resets; the refractory window + the ledger dedupe
 * prevent the cascade-double-fire (AP-E-7). THE THRESHOLDS ARE DATA — the battery asserts the
 * fleet's configs against the REGISTERS (event-registry.ts), never against literals.
 *
 * EVERY test is mutation-checked: each assertion FAILS if the mechanism is wrong (the count
 * reset removed, the refractory check dropped, the threshold off-by-one, the demand marker
 * missing). The battery imports the REAL exports (AP-2) — no mocks of the machinery under test.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  EventSentinel,
  STRUCTURAL_VIOLATION_THRESHOLD,
  buildSentinelFleet,
  sentinelFor,
  type SentinelBarrage,
  type SentinelConfig,
} from '../events/event-sentinels.ts';
import { EventLedger } from '../events/event-ledger.ts';
import { REGISTERS } from '../events/event-registry.ts';
import { resetEventFirewalls, deliveryLog, deliverySurface, BLOCK_MARKERS } from '../events/event-firewalls.ts';
import type { SlopClass, Triad } from '../events/event-substrate.ts';

/** THE DETERMINISTIC CLOCK — a controllable now() so the refractory window is testable
 *  without sleeping (the battery drives the time, never the wall clock). */
const makeClock = (start = 1_000_000_000_000) => {
  let now = start;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
};

/** THE TRIAD FACTORY — a complete {Pattern, State, Evidence} (the sentinel's only signal). */
const makeTriad = (evidence: string): Triad => ({ pattern: 'claim-detector', state: 'CLASSIFIED', evidence });

/** THE VALID CONFIG — derived from the registers (the data, never a fitted literal). */
const claimConfig = (): SentinelConfig => ({
  windowMs: REGISTERS.CLAIM_REFRACTORY_MS,
  threshold: REGISTERS.CLAIM_THRESHOLD,
  refractoryMs: REGISTERS.CLAIM_REFRACTORY_MS,
});

describe('THE EVENT SENTINEL (§2.12 — the accumulator mechanics)', () => {
  beforeEach(() => {
    resetEventFirewalls();
  });

  it('FIRES ONE BARRAGE at the threshold — the composed demand lands on the append-only surface', () => {
    const clock = makeClock();
    const s = new EventSentinel('CLAIM_SLOP', claimConfig(), `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, { now: clock.now });
    expect(s.accumulate(makeTriad('claim 1')).fired).toBe(false);
    expect(s.accumulate(makeTriad('claim 2')).fired).toBe(false);
    const third = s.accumulate(makeTriad('claim 3'));
    expect(third.fired).toBe(true);
    expect(third.barrage?.delivered).toBe(true);
    expect(third.barrage?.slopClass).toBe('CLAIM_SLOP');
    expect(third.barrage?.demand).toContain('[SSTF EVENT: CLAIM]');
    expect(deliverySurface().some((d) => d.includes('[SSTF EVENT: CLAIM]'))).toBe(true);
    expect(s.barrages().length).toBe(1); // ONE barrage — never a spam
    expect(s.pendingCount()).toBe(0); // the reset
  });

  it('BELOW THE THRESHOLD: no barrage fires (threshold − 1 is SILENT — the off-by-one mutation check)', () => {
    const clock = makeClock();
    const s = new EventSentinel('CLAIM_SLOP', claimConfig(), `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, { now: clock.now });
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD - 1; i++) {
      expect(s.accumulate(makeTriad(`claim ${i}`)).fired).toBe(false);
    }
    expect(s.pendingCount()).toBe(REGISTERS.CLAIM_THRESHOLD - 1);
    expect(s.barrages().length).toBe(0);
    expect(deliverySurface().length).toBe(0);
  });

  it('THE REFRACTORY WINDOW: the second episode inside the window does NOT re-fire (AP-E-7)', () => {
    const clock = makeClock();
    const s = new EventSentinel('CLAIM_SLOP', claimConfig(), `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, { now: clock.now });
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD; i++) s.accumulate(makeTriad(`first ${i}`));
    expect(s.barrages().length).toBe(1);
    // THE SECOND PASS inside the refractory window — the threshold reached again, NO re-fire.
    clock.advance(1); // still inside the 5-min refractory
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD; i++) {
      expect(s.accumulate(makeTriad(`second ${i}`)).fired).toBe(false);
    }
    expect(s.barrages().length).toBe(1); // ONE barrage per episode
    expect(deliveryLog().length).toBe(1);
  });

  it('THE NEXT EPISODE: after the refractory elapses, the sentinel fires EXACTLY ONE more barrage', () => {
    const clock = makeClock();
    const s = new EventSentinel('CLAIM_SLOP', claimConfig(), `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, { now: clock.now });
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD; i++) s.accumulate(makeTriad(`first ${i}`));
    clock.advance(REGISTERS.CLAIM_REFRACTORY_MS + 1); // the refractory elapsed
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD - 1; i++) {
      expect(s.accumulate(makeTriad(`second ${i}`)).fired).toBe(false);
    }
    const last = s.accumulate(makeTriad('second final'));
    expect(last.fired).toBe(true); // the next episode's ONE barrage
    expect(s.barrages().length).toBe(2);
    expect(s.pendingCount()).toBe(0); // reset again
  });

  it('THE REFRACTORY BOUNDARY: at exactly refractoryMs the window has NOT elapsed (the strict > mutation check)', () => {
    const clock = makeClock();
    const s = new EventSentinel('CLAIM_SLOP', claimConfig(), `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, { now: clock.now });
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD; i++) s.accumulate(makeTriad(`first ${i}`));
    clock.advance(REGISTERS.CLAIM_REFRACTORY_MS); // exactly at the boundary — still refractory (strict >)
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD; i++) {
      expect(s.accumulate(makeTriad(`second ${i}`)).fired).toBe(false);
    }
    expect(s.barrages().length).toBe(1);
    clock.advance(1); // one ms past — the deferred barrage now fires on the next accumulation
    expect(s.accumulate(makeTriad('past the boundary')).fired).toBe(true);
    expect(s.barrages().length).toBe(2);
  });

  it('THE LEDGER DEDUPE: a block already recorded for the class inside the refractory suppresses the barrage', () => {
    const clock = makeClock();
    const ledger = new EventLedger();
    // the firewall already delivered this episode's block (the ledger row with the block action).
    // The ledger is the WALL-CLOCK delivery record (recent() windows by Date.now()) — the
    // pre-existing row is written at the real now, exactly as the runtime's firewall records it.
    ledger.record(
      { sessionID: 's1', type: 'message.updated', text: 'the claim', at: Date.now() },
      { slopClass: 'CLAIM_SLOP', triad: makeTriad('the firewall block') },
      { kind: 'block', demand: `${BLOCK_MARKERS.CLAIM_SLOP} already delivered` },
    );
    const s = new EventSentinel('CLAIM_SLOP', claimConfig(), `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, { now: clock.now, ledger });
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD; i++) {
      expect(s.accumulate(makeTriad(`claim ${i}`)).fired).toBe(false); // the dedupe holds
    }
    expect(s.barrages().length).toBe(0); // ONE demand per episode — the cascade-double-fire prevented
  });

  it('THE BARRAGE IS RECORDED IN THE LEDGER when one is bound (the episode record, the dedupe source)', () => {
    const clock = makeClock();
    const ledger = new EventLedger();
    const s = new EventSentinel('OVER_AUDIT', { windowMs: REGISTERS.CLAIM_REFRACTORY_MS, threshold: REGISTERS.OVER_AUDIT_THRESHOLD, refractoryMs: REGISTERS.CLAIM_REFRACTORY_MS }, `${BLOCK_MARKERS.OVER_AUDIT} the test demand`, { now: clock.now, ledger });
    for (let i = 0; i < REGISTERS.OVER_AUDIT_THRESHOLD; i++) s.accumulate(makeTriad(`over ${i}`));
    expect(s.barrages().length).toBe(1);
    const rows = ledger.recent('OVER_AUDIT');
    expect(rows.length).toBe(1);
    expect(rows[0].action?.kind).toBe('inject');
  });

  it('THE PRIMED STATE (§9.7): isPrimed is threshold ∧ refractory — a reader, never a side effect', () => {
    const clock = makeClock();
    const s = new EventSentinel('CLAIM_SLOP', claimConfig(), `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, { now: clock.now });
    expect(s.isPrimed()).toBe(false);
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD - 1; i++) s.accumulate(makeTriad(`c${i}`));
    expect(s.isPrimed()).toBe(false); // below the threshold
    s.accumulate(makeTriad('the threshold'));
    expect(s.isPrimed()).toBe(false); // fired + reset → no longer primed
    expect(s.pendingCount()).toBe(0);
  });

  it('THE onBarrage SINK overrides the default delivery (the E-PB5 wiring seam) + a sink failure is recorded, never thrown', () => {
    const clock = makeClock();
    const seen: SentinelBarrage[] = [];
    const s = new EventSentinel('CLAIM_SLOP', claimConfig(), `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, { now: clock.now, onBarrage: (b) => { seen.push(b); } });
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD; i++) s.accumulate(makeTriad(`c${i}`));
    expect(seen.length).toBe(1);
    expect(deliverySurface().length).toBe(0); // the default fireBlock did NOT run — the sink owns the delivery

    const failing = new EventSentinel('CLAIM_SLOP', claimConfig(), `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, {
      now: clock.now,
      onBarrage: () => { throw new Error('sink exploded'); },
    });
    let result;
    for (let i = 0; i < REGISTERS.CLAIM_THRESHOLD; i++) result = failing.accumulate(makeTriad(`f${i}`));
    expect(result!.fired).toBe(true);
    expect(result!.barrage?.delivered).toBe(false); // the loud record — the failure is visible, never hidden
  });

  it('ERROR PATHS FIRST: the invalid class/config/demand/triad are NAMED throws', () => {
    const cfg = claimConfig();
    expect(() => new EventSentinel('BENIGN', cfg, 'x')).toThrow('EVENT_SENTINEL_CLASS_INVALID');
    expect(() => new EventSentinel('CLAIM_SLOP', null as never, 'x')).toThrow('EVENT_SENTINEL_CONFIG_INVALID');
    expect(() => new EventSentinel('CLAIM_SLOP', { ...cfg, windowMs: 0 }, 'x')).toThrow('EVENT_SENTINEL_CONFIG_INVALID');
    expect(() => new EventSentinel('CLAIM_SLOP', { ...cfg, threshold: 0 }, 'x')).toThrow('EVENT_SENTINEL_CONFIG_INVALID');
    expect(() => new EventSentinel('CLAIM_SLOP', { ...cfg, threshold: 2.5 }, 'x')).toThrow('EVENT_SENTINEL_CONFIG_INVALID');
    expect(() => new EventSentinel('CLAIM_SLOP', { ...cfg, refractoryMs: -1 }, 'x')).toThrow('EVENT_SENTINEL_CONFIG_INVALID');
    expect(() => new EventSentinel('CLAIM_SLOP', cfg, '')).toThrow('EVENT_SENTINEL_DEMAND_INVALID');
    expect(() => new EventSentinel('CLAIM_SLOP', cfg, 'a demand with no marker')).toThrow('EVENT_SENTINEL_MARKER_MISMATCH');
    const s = new EventSentinel('CLAIM_SLOP', cfg, `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, { now: makeClock().now });
    expect(() => s.accumulate({ pattern: '', state: 'CLASSIFIED', evidence: 'x' })).toThrow('EVENT_TRIAD_MISSING');
    expect(() => s.accumulate(null as never)).toThrow('EVENT_TRIAD_MISSING');
  });

  it('ADVERSARIAL: a sustained flood inside the refractory fires ONCE; the buffer is bounded (memory hygiene)', () => {
    const clock = makeClock();
    const s = new EventSentinel('CLAIM_SLOP', claimConfig(), `${BLOCK_MARKERS.CLAIM_SLOP} the test demand`, { now: clock.now });
    const flood = REGISTERS.CLAIM_THRESHOLD * 10; // a claim-spam burst — the exact attack the sentinel watches
    let fires = 0;
    for (let i = 0; i < flood; i++) if (s.accumulate(makeTriad(`flood ${i}`)).fired) fires++;
    expect(fires).toBe(1); // the ONE-barrage law under the flood
    expect(s.pending().length).toBeLessThanOrEqual(Math.max(REGISTERS.CLAIM_THRESHOLD * 4, 16));
  });

  it('ADVERSARIAL: the interleaved episodes — fire, refractory-blocked accumulation, refractory elapse, deferred fire', () => {
    const clock = makeClock();
    const s = new EventSentinel('CALIB_STALE', { windowMs: REGISTERS.CLAIM_REFRACTORY_MS, threshold: REGISTERS.CALIB_STALE_THRESHOLD, refractoryMs: REGISTERS.CLAIM_REFRACTORY_MS }, `${BLOCK_MARKERS.CALIB_STALE} the test demand`, { now: clock.now });
    s.accumulate(makeTriad('m1'));
    expect(s.accumulate(makeTriad('m2')).fired).toBe(true); // threshold 2 → the first barrage
    clock.advance(1000);
    s.accumulate(makeTriad('m3'));
    s.accumulate(makeTriad('m4'));
    s.accumulate(makeTriad('m5')); // past the threshold inside the refractory — held
    expect(s.barrages().length).toBe(1);
    clock.advance(REGISTERS.CLAIM_REFRACTORY_MS); // the refractory elapses (count already ≥ threshold)
    expect(s.accumulate(makeTriad('m6')).fired).toBe(true); // the deferred barrage lands ONCE
    expect(s.barrages().length).toBe(2);
  });
});

describe('THE SENTINEL FLEET (§13.1 — the five sentinels, the thresholds as REGISTER data)', () => {
  beforeEach(() => {
    resetEventFirewalls();
  });

  it('buildSentinelFleet returns EXACTLY the five slop-class sentinels (never a BENIGN watcher)', () => {
    const fleet = buildSentinelFleet({ now: makeClock().now });
    expect(fleet.length).toBe(5);
    const classes = fleet.map((s) => s.slopClass).sort();
    expect(classes).toEqual((['CALIB_STALE', 'CLAIM_SLOP', 'DESTRUCTIVE_PLAN', 'OVER_AUDIT', 'TEA_NOT_TEB'] as SlopClass[]).sort());
    expect(fleet.every((s) => s.slopClass !== 'BENIGN')).toBe(true);
  });

  it('THE THRESHOLDS ARE DATA: every fleet config reads the REGISTERS (the §9.7 register law)', () => {
    const fleet = buildSentinelFleet({ now: makeClock().now });
    const byClass = (k: SlopClass) => sentinelFor(fleet, k)!.config();
    expect(byClass('CLAIM_SLOP').threshold).toBe(REGISTERS.CLAIM_THRESHOLD);
    expect(byClass('OVER_AUDIT').threshold).toBe(REGISTERS.OVER_AUDIT_THRESHOLD);
    expect(byClass('CALIB_STALE').threshold).toBe(REGISTERS.CALIB_STALE_THRESHOLD);
    // the structural-violation classes fire on the FIRST signal (§2.7) — the named constant
    // (the documented REGISTERS gap; the E-PB5 wave adds the two registers)
    expect(byClass('DESTRUCTIVE_PLAN').threshold).toBe(STRUCTURAL_VIOLATION_THRESHOLD);
    expect(byClass('TEA_NOT_TEB').threshold).toBe(STRUCTURAL_VIOLATION_THRESHOLD);
    for (const s of fleet) {
      expect(s.config().windowMs).toBe(REGISTERS.CLAIM_REFRACTORY_MS);
      expect(s.config().refractoryMs).toBe(REGISTERS.CLAIM_REFRACTORY_MS);
    }
  });

  it('EACH FLEET SENTINEL fires ONE barrage at its register threshold (the per-class sweep)', () => {
    const clock = makeClock();
    const fleet = buildSentinelFleet({ now: clock.now });
    for (const s of fleet) {
      const { threshold } = s.config();
      for (let i = 0; i < threshold - 1; i++) expect(s.accumulate(makeTriad(`${s.slopClass} ${i}`)).fired).toBe(false);
      expect(s.accumulate(makeTriad(`${s.slopClass} final`)).fired).toBe(true);
      expect(s.barrages().length).toBe(1);
      expect(s.barrages()[0].demand).toContain(BLOCK_MARKERS[s.slopClass as Exclude<SlopClass, 'BENIGN'>]);
    }
    // the whole fleet fired exactly five barrages — one per class, never a cascade
    expect(fleet.reduce((n, s) => n + s.barrages().length, 0)).toBe(5);
  });

  it('THE DESTRUCTIVE-PLAN SENTINEL fires on the FIRST contradiction (threshold 1 — a single destructive plan IS the episode)', () => {
    const fleet = buildSentinelFleet({ now: makeClock().now });
    const d = sentinelFor(fleet, 'DESTRUCTIVE_PLAN')!;
    const result = d.accumulate({ pattern: 'architecture-registry', state: 'CLASSIFIED', evidence: 'add output.error to chainBeforeHook' });
    expect(result.fired).toBe(true);
    expect(result.barrage?.demand).toContain('[LOOP: CONTRADICTION]');
  });

  it('sentinelFor returns undefined for an unwatched class (BENIGN is never watched)', () => {
    const fleet = buildSentinelFleet();
    expect(sentinelFor(fleet, 'BENIGN')).toBe(undefined);
    expect(sentinelFor(fleet, 'CLAIM_SLOP')?.slopClass).toBe('CLAIM_SLOP');
  });
});
