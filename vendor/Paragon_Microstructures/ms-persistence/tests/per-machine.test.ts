import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Persistence } from '../src/index.js';

function tmpDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'pta-persist-test-')); }

describe('ms-persistence — per-machine', () => {
  let dir: string; let p: Persistence;
  beforeEach(() => { dir = tmpDir(); p = new Persistence(dir); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  test('persist/load round-trip for state', () => {
    const rec = { state: 'MONITORING', tier: 1, seq: 42 };
    p.persistState('sid-1', rec);
    expect(p.loadState('sid-1')).toEqual(rec);
  });
  test('synapse round-trip', () => {
    const snap = { SMOKE: { lambda: 1.23, primed: true } };
    p.persistSynapse('sid-1', snap);
    expect(p.loadSynapse('sid-1')).toEqual(snap);
  });
  test('atomicity no .tmp residue after success', () => {
    p.persistState('sid-1', { x: 1 });
    const files = fs.readdirSync(dir);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
    expect(files.includes('pta-state-sid-1.json')).toBe(true);
  });
  test('corrupt JSON returns null fail-closed', () => {
    fs.writeFileSync(path.join(dir, 'pta-state-bad.json'), '{ corrupt json [');
    expect(p.loadState('bad')).toBeNull();
  });
  test('corrupt synapse returns null', () => {
    fs.writeFileSync(path.join(dir, 'pta-synapse-bad2.json'), 'not json');
    expect(p.loadSynapse('bad2')).toBeNull();
  });
  test('missing file returns null', () => {
    expect(p.loadState('nonexistent')).toBeNull();
    expect(p.loadSynapse('nonexistent')).toBeNull();
  });
  test('ledger append produces one valid JSON line per event', () => {
    p.appendLedger({ type: 'enforce', sessionId: 's1', timestamp: Date.now() });
    p.appendLedger({ type: 'enforce', sessionId: 's1', timestamp: Date.now() });
    const events = p.readLedger();
    expect(events.length).toBe(2);
    expect(events[0].type).toBe('enforce');
  });
  test('ledger append-only proof earlier lines unchanged after later appends', () => {
    p.appendLedger({ type: 'first', timestamp: 1000 });
    const first = fs.readFileSync(path.join(dir, 'pta-ledger.jsonl'), 'utf8');
    p.appendLedger({ type: 'second', timestamp: 2000 });
    const second = fs.readFileSync(path.join(dir, 'pta-ledger.jsonl'), 'utf8');
    expect(second.startsWith(first)).toBe(true);
    const lines = second.trim().split('\n');
    expect(JSON.parse(lines[0]).type).toBe('first');
    expect(JSON.parse(lines[1]).type).toBe('second');
  });
  test('stateDir isolation two sids never collide', () => {
    p.persistState('sid-A', { v: 'A' });
    p.persistState('sid-B', { v: 'B' });
    expect((p.loadState('sid-A') as { v: string }).v).toBe('A');
    expect((p.loadState('sid-B') as { v: string }).v).toBe('B');
  });
  test('persistState throws on empty sid', () => {
    expect(() => p.persistState('', {})).toThrow();
  });
  test('appendLedger throws on null event', () => {
    expect(() => p.appendLedger(null as unknown as { type: string; timestamp: number })).toThrow();
  });
  test('chain persist/load round-trip', () => {
    p.persistChain('sid-1', [{ tool: 'bash', at: 123 }]);
    expect(p.loadChain('sid-1')).toEqual([{ tool: 'bash', at: 123 }]);
  });
  test('empty ledger returns empty array', () => {
    expect(p.readLedger()).toEqual([]);
  });
});
