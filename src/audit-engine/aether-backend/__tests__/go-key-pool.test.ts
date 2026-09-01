import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const TEST_POOL = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aether-gopool-')), 'pool.json');
process.env.TRIDENT_GO_POOL_FILE = TEST_POOL;

import {
  GO_KEYS,
  goKeyDead,
  goPoolFile,
  goPoolSnapshot,
  markGoKeyAlive,
  markGoKeyDead,
  parseGoWindowMs,
  goKeyLabel,
} from '../go-key-pool.js';
import { PROVIDER_CHAIN, assertSingleProviderChain, AETHER_PROVIDER_ID, AETHER_MODEL_ID } from '../provider.js';

const H = 3_600_000;
const DAY = 24 * H;
const T0 = 1_750_000_000_000;

const state = (): number[] => JSON.parse(fs.readFileSync(TEST_POOL, 'utf-8')).deadUntil;

beforeEach(() => { try { fs.unlinkSync(TEST_POOL); } catch (e) { void e; } });
afterEach(() => { try { fs.unlinkSync(TEST_POOL + '.tmp'); } catch (e) { void e; } });

describe('go-key-pool — parseGoWindowMs', () => {
  test('Resets in 14hr 37min → 14*60+37 minutes in ms (precise signal wins)', () => {
    const live = 'Weekly usage limit reached. Resets in 14hr 37min. To continue...';
    expect(parseGoWindowMs(live)).toBe((14 * 60 + 37) * 60_000);
  });
  test('Resets in 2hr → 120min', () => {
    expect(parseGoWindowMs('Resets in 2hr')).toBe(2 * 3_600_000);
  });
  test('Resets in 14hr 37min inside GoUsageLimitError JSON', () => {
    const live = '429: {"type":"GoUsageLimitError","message":"Weekly usage limit reached. Resets in 14hr 37min. To continue using this model now, enable usage from your available balance."}';
    expect(parseGoWindowMs(live)).toBe((14 * 60 + 37) * 60_000);
  });
  test('hourly / 5-hour keyword → 5h', () => {
    expect(parseGoWindowMs('Rate limit exceeded: free-models 5-hour high balance')).toBe(5 * H);
    expect(parseGoWindowMs('5-hour limit')).toBe(5 * H);
    expect(parseGoWindowMs('hourly quota')).toBe(5 * H);
  });
  test('daily / weekly / monthly keywords', () => {
    expect(parseGoWindowMs('daily limit exceeded')).toBe(DAY);
    expect(parseGoWindowMs('weekly rate limit')).toBe(7 * DAY);
    expect(parseGoWindowMs('monthly quota exhausted')).toBe(30 * DAY);
  });
  test('unknown → 1h probe', () => {
    expect(parseGoWindowMs('429 too many requests')).toBe(H);
    expect(parseGoWindowMs('resets in 45 min')).toBe(H);
    expect(parseGoWindowMs('some random error')).toBe(H);
  });
  test('empty string → 1h', () => {
    expect(parseGoWindowMs('')).toBe(H);
  });
});

describe('go-key-pool — dead/alive round-trip', () => {
  test('fresh/absent state: every key alive', () => {
    expect(goKeyDead(0, T0)).toBe(false);
    expect(goKeyDead(1, T0)).toBe(false);
    expect(goKeyDead(2, T0)).toBe(false);
  });
  test('marked key dead until window passes then alive (self-heal)', () => {
    markGoKeyDead(0, 'Rate limit exceeded: 5-hour window', T0);
    expect(goKeyDead(0, T0 + 1000)).toBe(true);
    expect(goKeyDead(0, T0 + 5 * H - 1000)).toBe(true);
    expect(goKeyDead(0, T0 + 5 * H + 1000)).toBe(false);
  });
  test('mixed state: dead keys isolated, alive untouched', () => {
    markGoKeyDead(0, 'weekly limit', T0);
    markGoKeyDead(2, 'monthly limit', T0);
    expect(goKeyDead(0, T0)).toBe(true);
    expect(goKeyDead(1, T0)).toBe(false);
    expect(goKeyDead(2, T0)).toBe(true);
  });
  test('each key has its own timeout (no cross-talk)', () => {
    markGoKeyDead(1, 'daily limit', T0);
    expect(goKeyDead(0, T0)).toBe(false);
    expect(goKeyDead(2, T0)).toBe(false);
    expect(goKeyDead(1, T0 + DAY + 1)).toBe(false);
  });
  test('markGoKeyAlive clears stale timeout, returns true; alive key returns false no write', () => {
    markGoKeyDead(1, 'daily limit', T0);
    expect(markGoKeyAlive(1, T0 + 1000)).toBe(true);
    expect(goKeyDead(1, T0 + 1000)).toBe(false);
    try { fs.unlinkSync(TEST_POOL); } catch (e) { void e; }
    expect(markGoKeyAlive(2, T0)).toBe(false);
    expect(fs.existsSync(TEST_POOL)).toBe(false);
    markGoKeyDead(2, 'daily limit', T0);
    expect(fs.existsSync(TEST_POOL)).toBe(true);
    try { fs.unlinkSync(TEST_POOL); } catch (e) { void e; }
    expect(markGoKeyAlive(2, T0)).toBe(false);
  });
  test('concurrent marks produce coherent state (last write wins, no corruption)', () => {
    markGoKeyDead(0, 'daily limit', T0);
    markGoKeyDead(1, 'weekly limit', T0);
    markGoKeyDead(2, 'monthly limit', T0);
    const s = state();
    expect(s.length).toBe(3);
    expect(s[0]).toBeGreaterThan(T0);
    expect(s[1]).toBeGreaterThan(T0);
    expect(s[2]).toBeGreaterThan(T0);
  });
});

describe('go-key-pool — persistence and AP-4', () => {
  test('state survives read (file is the memory)', () => {
    markGoKeyDead(0, '5-hour window', T0);
    const before = state();
    expect(goKeyDead(0, T0 + 1000)).toBe(true);
    expect(state()).toEqual(before);
  });
  test('corrupt file → all alive, never throw', () => {
    fs.writeFileSync(TEST_POOL, '{ broken json!!!');
    expect(goKeyDead(0, T0)).toBe(false);
    expect(goKeyDead(1, T0)).toBe(false);
    expect(goPoolSnapshot(T0)).toContain('go-1 ok');
  });
  test('wrong shape (deadUntil not array) → all alive', () => {
    fs.writeFileSync(TEST_POOL, '{"deadUntil": "nope"}');
    expect(goKeyDead(1, T0)).toBe(false);
  });
  test('no full key material in pool file — EVER (AP-4)', () => {
    markGoKeyDead(0, 'weekly limit', T0);
    const raw = fs.readFileSync(TEST_POOL, 'utf-8');
    for (const key of GO_KEYS) expect(raw.includes(key.slice(6, 20))).toBe(false);
    expect(raw).toBe(JSON.stringify({ deadUntil: state() }));
  });
  test('logs carry indexes not keys (goKeyLabel)', () => {
    expect(goKeyLabel(0)).toBe('go-1');
    expect(goKeyLabel(1)).toBe('go-2');
    expect(goKeyLabel(2)).toBe('go-3');
  });
  test('goPoolSnapshot format and no key leakage', () => {
    markGoKeyDead(0, '5-hour window', T0);
    const snap = goPoolSnapshot(T0);
    expect(snap).toContain('go-1 dead until');
    expect(snap).toContain('go-2 ok');
    expect(snap).toContain('go-3 ok');
    expect(snap.split(' · ').length).toBe(3);
    expect(snap.includes(GO_KEYS[0].slice(0, 10))).toBe(false);
  });
  test('empty deadUntil array → all alive via map fallback', () => {
    fs.writeFileSync(TEST_POOL, JSON.stringify({ deadUntil: [] }));
    expect(goKeyDead(0, T0)).toBe(false);
  });
  test('null value at index → alive', () => {
    fs.writeFileSync(TEST_POOL, JSON.stringify({ deadUntil: [null, null, null] }));
    expect(goKeyDead(0, T0)).toBe(false);
  });
});

describe('go-key-pool — BUN_TEST isolation and env override', () => {
  test('goPoolFile respects TRIDENT_GO_POOL_FILE override', () => {
    expect(goPoolFile()).toBe(TEST_POOL);
  });
  test('BUN_TEST isolation: without override, pool is trident-test-go-key-pool.json', () => {
    const saved = process.env.TRIDENT_GO_POOL_FILE;
    delete process.env.TRIDENT_GO_POOL_FILE;
    process.env.BUN_TEST = '1';
    const f = goPoolFile();
    expect(f).toBe(path.join(os.tmpdir(), 'trident-test-go-key-pool.json'));
    if (saved) process.env.TRIDENT_GO_POOL_FILE = saved;
    else process.env.TRIDENT_GO_POOL_FILE = TEST_POOL;
  });
  test('production pool file is .trident-aether-go-key-pool.json', () => {
    const saved = process.env.TRIDENT_GO_POOL_FILE;
    const savedBun = process.env.BUN_TEST;
    delete process.env.TRIDENT_GO_POOL_FILE;
    delete process.env.BUN_TEST;
    const f = goPoolFile();
    expect(f).toBe(path.join(os.tmpdir(), '.trident-aether-go-key-pool.json'));
    process.env.TRIDENT_GO_POOL_FILE = saved ?? TEST_POOL;
    if (savedBun) process.env.BUN_TEST = savedBun;
  });
});

describe('PROVIDER_CHAIN — the 3-rung one-logical-rung law', () => {
  test('PROVIDER_CHAIN has exactly 3 rungs goKeyIdx {0,1,2} sharing provider+model', () => {
    expect(PROVIDER_CHAIN.length).toBe(3);
    expect(PROVIDER_CHAIN.map((e) => e.goKeyIdx)).toEqual([0, 1, 2]);
    expect(PROVIDER_CHAIN.every((e) => e.provider === AETHER_PROVIDER_ID)).toBe(true);
    expect(PROVIDER_CHAIN.every((e) => e.modelId === AETHER_MODEL_ID)).toBe(true);
  });
  test('assertSingleProviderChain passes on the canonical chain', () => {
    expect(() => assertSingleProviderChain(PROVIDER_CHAIN)).not.toThrow();
  });
  test('assert throws on 2-rung chain', () => {
    expect(() => assertSingleProviderChain([{ provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 0 }, { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 1 }])).toThrow();
  });
  test('assert throws on empty chain', () => {
    expect(() => assertSingleProviderChain([])).toThrow();
  });
  test('assert throws on duplicate goKeyIdx', () => {
    expect(() => assertSingleProviderChain([
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 0 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 0 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 2 },
    ])).toThrow();
  });
  test('assert throws on wrong provider', () => {
    expect(() => assertSingleProviderChain([
      { provider: 'nvidia', modelId: AETHER_MODEL_ID, goKeyIdx: 0 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 1 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 2 },
    ])).toThrow();
  });
  test('assert throws on wrong modelId', () => {
    expect(() => assertSingleProviderChain([
      { provider: AETHER_PROVIDER_ID, modelId: 'wrong', goKeyIdx: 0 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 1 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 2 },
    ])).toThrow();
  });
  test('assert throws on gap in goKeyIdx set (missing 1)', () => {
    expect(() => assertSingleProviderChain([
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 0 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 0 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 2 },
    ])).toThrow();
    expect(() => assertSingleProviderChain([
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 0 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 2 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 2 },
    ])).toThrow();
  });
  test('assert throws on undefined goKeyIdx', () => {
    expect(() => assertSingleProviderChain([
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 1 },
      { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 2 },
    ])).toThrow();
  });
});
