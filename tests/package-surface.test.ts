// tests/package-surface.test.ts — THE EXPORT SURFACE + THE ADVERSARIAL SWEEP
//
// S4: the package resolves end-to-end (every export is live).
// A1: the hostile input sweep — the engine must survive garbage without
// throwing and without lifting.

import { describe, expect, test } from 'bun:test';
import { ParagonEngine, OpenCodeAdapter, tridentDomain, tradingDomain,
         salesDomain } from '../index.js';
import type { BehaviorRecord } from '../core/types.js';

describe('S4: the export surface resolves', () => {
  test('every public export is live', () => {
    expect(typeof ParagonEngine).toBe('function');
    expect(typeof OpenCodeAdapter).toBe('function');
    expect(tridentDomain.name).toBe('trident');
    expect(tradingDomain.name).toBe('trading');
    expect(salesDomain.name).toBe('sales');
    console.log('HAS_ENGINE: true');
    console.log('HAS_OPENCODE_ADAPTER: true');
  });

  test('the trading engine drives the ladder through the package import', () => {
    const engine = new ParagonEngine(tradingDomain, { level: 'FULL' });
    const sid = 'ses-surface';
    let injected = '';
    for (let i = 0; i < 10; i++) {
      engine.observeText('exceed the position limit, push the size', sid, 'reasoning');
      engine.tryIntervene(sid, 'messages.transform', (t) => { injected += t; });
      if ((engine.getRecord(sid) as BehaviorRecord).state === 'INTERVENING') break;
    }
    const rec = engine.getRecord(sid);
    expect(rec.state).toBe('INTERVENING');
    expect(rec.tier).toBe(1);
    expect(injected).toContain('[RISK STEER]');
    console.log('TRADING_LADDER: INTERVENING tier 1');
    console.log(`HEAD: ${injected.slice(0, 30)}`);
  });

  test('the opencode adapter binds the engine surfaces', () => {
    const engine = new ParagonEngine(tradingDomain, { level: 'FULL' });
    const adapter = new OpenCodeAdapter(engine);
    const hooks = adapter.buildHooks();
    expect(typeof hooks.event).toBe('function');
    expect(typeof hooks['messages.transform']).toBe('function');
    expect(typeof hooks['tool.execute.before']).toBe('function');
    expect(typeof hooks['tool.execute.after']).toBe('function');
    // The normalizeEvent surface
    expect(adapter.normalizeEvent({ type: 'message.updated', properties: {} })).not.toBeNull();
    expect(adapter.normalizeEvent(null)).toBeNull();
  });
});

describe('A1: the hostile input sweep', () => {
  test('garbage input neither throws nor lifts the machine', () => {
    const engine = new ParagonEngine(tradingDomain, { level: 'FULL' });

    // The empty string
    engine.observeText('', 'ses-adv-empty', 'reasoning');
    expect(engine.getRecord('ses-adv-empty').state).toBe('IDLE');

    // The regex-special-chars-only text
    engine.observeText('.*+?[]{}()|^$\\\\'.repeat(50), 'ses-adv-regex', 'reasoning');
    expect(engine.getRecord('ses-adv-regex').state).toBe('IDLE');

    // The 100KB text
    engine.observeText('a'.repeat(100_000), 'ses-adv-big', 'reasoning');
    expect(engine.getRecord('ses-adv-big').state).toBe('IDLE');

    // The emoji-only string
    engine.observeText('🚀🔥💥'.repeat(100), 'ses-adv-emoji', 'reasoning');
    expect(engine.getRecord('ses-adv-emoji').state).toBe('IDLE');

    // The surfaces on garbage sessions: no throw
    engine.tryIntervene('ses-adv-empty', 'messages.transform', () => {});
    engine.interceptTool('ses-adv-regex', 'write', {});
    engine.observeTool('ses-adv-big', 'risk-engine', {}, 0);

    console.log('ADVERSARIAL_SURVIVED');
  });

  test('the OFF engine survives the same garbage without any state', () => {
    const engine = new ParagonEngine(tradingDomain, { level: 'OFF' });
    engine.observeText('exceed the position limit', 'ses-adv-off', 'reasoning');
    engine.observeText('', 'ses-adv-off2', 'reasoning');
    engine.tryIntervene('ses-adv-off', 'messages.transform', () => {});
    expect(engine.getRecord('ses-adv-off').state).toBe('IDLE');
    expect(engine.getRecord('ses-adv-off').counters).toEqual({});
  });
});
