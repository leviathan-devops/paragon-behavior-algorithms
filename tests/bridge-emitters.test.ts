import { describe, expect, test } from 'bun:test';
import { ParagonEngine } from '../core/engine.js';
import tridentDomain from '../config/trident/index.js';

function makeEngine() { return new ParagonEngine(tridentDomain, {}); }

describe('bridge emitters', () => {
  test('onSignal fires on family detection with correct shape', () => {
    const engine = makeEngine();
    const received: any[] = [];
    engine.onSignal((s) => received.push(s));
    engine.observeText('we can skip the verification and assume tests pass', 'ses-sig', 'reasoning');
    expect(received.length).toBeGreaterThan(0);
    const r = received[0];
    expect(typeof r.family).toBe('string');
    expect(typeof r.confidence).toBe('number');
    expect(typeof r.excerpt).toBe('string');
    expect(typeof r.seq).toBe('number');
    expect(typeof r.sessionId).toBe('string');
    expect(r.sessionId).toBe('ses-sig');
  });

  test('onStateChange fires on machine transition', () => {
    const engine = makeEngine();
    const states: any[] = [];
    engine.onStateChange((s) => states.push(s));
    for (let i = 0; i < 6; i++) {
      engine.observeText('skip the verification and assume tests pass', 'ses-st', 'reasoning');
      engine.tryIntervene('ses-st', 'messages.transform', () => {});
      if (engine.getRecord('ses-st').state === 'INTERVENING') break;
    }
    expect(states.length).toBeGreaterThan(0);
    const last = states[states.length - 1];
    expect(typeof last.tier).toBe('number');
    expect(typeof last.escalationCount).toBe('number');
    expect(Array.isArray(last.activeFamilies)).toBe(true);
    expect(last.tier).toBe(1);
  });

  test('multiple subscribers all receive', () => {
    const engine = makeEngine();
    const a: any[] = []; const b: any[] = [];
    engine.onSignal((s) => a.push(s));
    engine.onSignal((s) => b.push(s));
    engine.observeText('skip the verification and assume tests pass', 'ses-multi', 'reasoning');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a.length).toBe(b.length);
  });

  test('unsubscribe works — second emit not received', () => {
    const engine = makeEngine();
    const received: any[] = [];
    const off = engine.onSignal((s) => received.push(s));
    engine.observeText('skip the verification and assume tests pass', 'ses-unsub', 'reasoning');
    const n1 = received.length;
    expect(n1).toBeGreaterThan(0);
    const ok = off();
    expect(ok).toBe(true);
    engine.observeText('skip the verification and assume tests pass', 'ses-unsub2', 'reasoning');
    expect(received.length).toBe(n1);
    expect(off()).toBe(false);
  });

  test('empty text produces zero signals — no spurious emit', () => {
    const engine = makeEngine();
    const received: any[] = [];
    engine.onSignal((s) => received.push(s));
    engine.observeText('', 'ses-empty', 'reasoning');
    expect(received.length).toBe(0);
  });

  test('throwing subscriber does not break engine or other subscribers', () => {
    const engine = makeEngine();
    const good: any[] = [];
    engine.onSignal(() => { throw new Error('boom'); });
    engine.onSignal((s) => good.push(s));
    engine.observeText('skip the verification and assume tests pass', 'ses-err', 'reasoning');
    expect(good.length).toBeGreaterThan(0);
  });

  test('onStateChange unsubscribe', () => {
    const engine = makeEngine();
    const arr: any[] = [];
    const off = engine.onStateChange((s) => arr.push(s));
    for (let i = 0; i < 6; i++) {
      engine.observeText('skip the verification and assume tests pass', 'ses-su', 'reasoning');
      engine.tryIntervene('ses-su', 'messages.transform', () => {});
      if (engine.getRecord('ses-su').state === 'INTERVENING') break;
    }
    const n = arr.length;
    expect(n).toBeGreaterThan(0);
    off();
    engine.observeText('skip the verification', 'ses-su2', 'reasoning');
    expect(arr.length).toBe(n);
  });

  test('concurrent sessions — signals carry correct sessionId', () => {
    const engine = makeEngine();
    const received: any[] = [];
    engine.onSignal((s) => received.push(s));
    engine.observeText('skip the verification and assume tests pass', 'ses-A', 'reasoning');
    engine.observeText('skip the verification and assume tests pass', 'ses-B', 'reasoning');
    const a = received.filter((r) => r.sessionId === 'ses-A');
    const b = received.filter((r) => r.sessionId === 'ses-B');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});
