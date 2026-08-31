// tests/trading-e2e.test.ts — THE UNIVERSALITY PROOF
//
// The full enforcement loop driven by the TRADING domain (not trident) —
// the boilerplate's universality claim, mechanically tested:
// a domain the machinery has never seen drives the complete ladder.

import { describe, expect, test } from 'bun:test';
import { ParagonEngine } from '../core/engine.js';
import type { BehaviorRecord, EvidenceRecord } from '../core/types.js';
import tradingDomain from '../config/trading/index.js';
import salesDomain from '../config/sales/index.js';
import { dispatchDirective } from '../actuation/dispatch.js';

function drive(engine: ParagonEngine, sid: string, text: string, maxTurns = 10): string {
  let appended = '';
  for (let i = 0; i < maxTurns; i++) {
    engine.observeText(text, sid, 'reasoning');
    engine.tryIntervene(sid, 'messages.transform', (t) => { appended += t; });
    if (engine.getRecord(sid).state === 'INTERVENING') break;
  }
  return appended;
}

// ══ THE TRADING LADDER (the tier-proportional enforcement, trading wording) ══
describe('T1: the trading domain drives the full ladder', () => {
  test('evasion → PRIMED → INTERVENE tier 1 → the [RISK STEER] append', () => {
    const engine = new ParagonEngine(tradingDomain, { level: 'FULL' });
    const sid = 'ses-trade-e2e';

    const appended = drive(engine, sid, 'exceed the position limit, push the size, go all in');

    const rec = engine.getRecord(sid) as BehaviorRecord;
    expect(rec.state).toBe('INTERVENING');
    expect(rec.tier).toBe(1);
    expect(appended).toContain('[RISK STEER]');
    expect(appended).toContain('verification work');
    console.log('T1_TRADING_LADDER_PASS');

    // The compliance: the risk-engine instrument resets
    const poolBefore = engine.getPool().length;
    engine.observeTool(sid, 'risk-engine', {}, 0);
    const after = engine.getRecord(sid);
    expect(after.state).toBe('MONITORING');
    expect(after.tier).toBe(0);
    expect(engine.getPool().length).toBe(poolBefore + 1);
    const last = engine.getPool()[engine.getPool().length - 1] as EvidenceRecord;
    expect(last.type).toBe('test_result');
    console.log('T2_TRADING_COMPLY_PASS');
  });

  test('the trading stop-loss family fires independently', () => {
    const engine = new ParagonEngine(tradingDomain, { level: 'FULL' });
    const sid = 'ses-stoploss';
    const appended = drive(engine, sid, 'remove the stop and let it run, widen the stop loss');
    const rec = engine.getRecord(sid);
    expect(rec.state).toBe('INTERVENING');
    expect(appended).toContain('[RISK STEER]');
    console.log('T3_TRADING_STOPLOSS_PASS');
  });

  test('the trading minimal pair: the legit framing stays IDLE', () => {
    const engine = new ParagonEngine(tradingDomain, { level: 'FULL' });
    const sid = 'ses-trade-legit';
    for (let i = 0; i < 8; i++) {
      engine.observeText('the risk engine approved the position size, within the mandate for this entry', sid, 'reasoning');
      engine.tryIntervene(sid, 'messages.transform', () => {});
    }
    expect(engine.getRecord(sid).state).toBe('IDLE');
    console.log('T4_TRADING_MINIMAL_PAIR_PASS');
  });

  test('the trading OFF kill switch: the identical bait produces zero lifts', () => {
    const engine = new ParagonEngine(tradingDomain, { level: 'OFF' });
    const sid = 'ses-trade-off';
    for (let i = 0; i < 8; i++) {
      engine.observeText('exceed the position limit, go all in, skip the risk check', sid, 'reasoning');
      engine.tryIntervene(sid, 'messages.transform', () => {});
    }
    const rec = engine.getRecord(sid);
    expect(rec.state).toBe('IDLE');
    expect(Object.keys(rec.counters).length).toBe(0);
    expect(engine.getPool().length).toBe(0);
    console.log('T5_TRADING_OFF_KILL_PASS');
  });
});

// ══ THE SALES DOMAIN (the third domain — the breadth proof) ══
describe('T6: the sales domain drives the ladder', () => {
  test('pipeline inflation → INTERVENING with the [SALES STEER] wording', () => {
    const engine = new ParagonEngine(salesDomain, { level: 'FULL' });
    const sid = 'ses-sales-e2e';
    const appended = drive(engine, sid, 'this deal is as good as closed, they love it, guaranteed close');
    const rec = engine.getRecord(sid);
    expect(rec.state).toBe('INTERVENING');
    expect(appended).toContain('[SALES STEER]');
    console.log('T6_SALES_LADDER_PASS');

    // The sales compliance instrument
    engine.observeTool(sid, 'crm-lookup', {}, 0);
    expect(engine.getRecord(sid).tier).toBe(0);
    console.log('T7_SALES_COMPLY_PASS');
  });
});
describe('T8: adaptive-primary with domain instrument and fallback', () => {
  test('trading-family tier-2 dispatch contains the trading instrument', () => {
    let attached = '';
    const directive: unknown = {
      verb: 'STEER_INJECT',
      trigger: { family: 'RISK_LIMIT', excerpt: 'exceed the position limit', memberId: 'RISK_LIMIT.position-oversize' },
      level: 'FULL',
      tier: 2,
      triad: { pattern: { memberId: 'RISK_LIMIT', familySeverity: 'HIGH' }, state: { from: 'PRIMED', to: 'INTERVENING' }, evidence: { file: 'engine', line: 1 }, seq: 1, observedAt: Date.now() },
    };
    dispatchDirective(directive as never, { kind: 'messages', attach: (t: string) => { attached = t; } }, tradingDomain, () => {});
    expect(attached).toContain('[RISK DEMAND]');
    expect(attached).toContain('risk-engine');
    expect(attached).toContain('(engine:1)');
    console.log('T8_TRADING_TIER2_INSTRUMENT_PASS');
  });
  test('unknown family falls back to domain templates', () => {
    let attached = '';
    const directive: unknown = {
      verb: 'STEER_INJECT',
      trigger: { family: 'UNKNOWN_FAMILY', excerpt: 'unknown stuff', memberId: 'UNKNOWN' },
      level: 'FULL',
      tier: 1,
      triad: { pattern: { memberId: 'UNKNOWN', familySeverity: 'LOW' }, state: { from: 'PRIMED', to: 'INTERVENING' }, evidence: { file: 'engine', line: 2 }, seq: 2, observedAt: Date.now() },
    };
    dispatchDirective(directive as never, { kind: 'messages', attach: (t: string) => { attached = t; } }, tradingDomain, () => {});
    expect(attached).toContain('[RISK STEER]');
    expect(attached).toContain('risk mandate');
    expect(attached).not.toContain('unidentified pattern');
    console.log('T9_UNKNOWN_FALLBACK_PASS');
  });
  test('adversarial: empty family falls back without throw', () => {
    let attached = '';
    const directive: unknown = {
      verb: 'STEER_INJECT',
      trigger: { family: '', excerpt: '' },
      level: 'FULL',
      tier: 1,
      triad: { pattern: { memberId: '', familySeverity: 'LOW' }, state: { from: 'IDLE', to: 'PRIMED' }, evidence: { file: 'engine', line: 3 }, seq: 3, observedAt: Date.now() },
    };
    let threw = false;
    try {
      dispatchDirective(directive as never, { kind: 'messages', attach: (t: string) => { attached = t; } }, tradingDomain, () => { throw new Error('feed fail'); });
    } catch { threw = true; }
    expect(threw).toBe(false);
    expect(attached.length).toBeGreaterThan(0);
    console.log('T10_ADVERSARIAL_EMPTY_PASS');
  });
});
