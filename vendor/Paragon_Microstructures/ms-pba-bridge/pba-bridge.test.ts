import { describe, test, expect } from 'bun:test';
import { PbaBridgeImpl, correlateEscalation } from './index.js';

describe('ms-pba-bridge', () => {
  test('signal stored and retrievable', () => {
    const b = new PbaBridgeImpl();
    b.onPbaSignal({ family: 'TEST_EVASION', confidence: 0.8, excerpt: 'skip', seq: 1, sessionId: 's1' });
    expect(b.getRecentSignals('s1', 10).length).toBe(1);
    expect(b.getRecentSignals('s1', 10)[0]!.family).toBe('TEST_EVASION');
  });
  test('ring buffer evicts past 20', () => {
    const b = new PbaBridgeImpl();
    for (let i = 0; i < 21; i++) b.onPbaSignal({ family: 'F', confidence: 0.5, excerpt: `e${i}`, seq: i, sessionId: 's1' });
    const sigs = b.getRecentSignals('s1', 30);
    expect(sigs.length).toBe(20);
    expect(sigs[0]!.seq).toBe(1);
    expect(sigs[19]!.seq).toBe(20);
  });
  test('active families tracked from onPbaStateChange', () => {
    const b = new PbaBridgeImpl();
    b.onPbaStateChange({ tier: 2, escalationCount: 1, activeFamilies: ['TEST_EVASION'], lastWarheadBody: null, sessionId: 's1' } as any);
    expect(b.getActiveFamilies('s1')).toEqual(['TEST_EVASION']);
  });
  test('macroTier tracked', () => {
    const b = new PbaBridgeImpl();
    b.onPbaStateChange({ tier: 3, escalationCount: 2, activeFamilies: [], lastWarheadBody: null, sessionId: 's1' } as any);
    expect(b.getMacroTier('s1')).toBe(3);
  });
  test('getLayersToPrearm returns matching layers with boostAmount', () => {
    const b = new PbaBridgeImpl();
    b.registerLayer({ layerId: 'L1', pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 } });
    b.registerLayer({ layerId: 'L2', pbaContextBoost: { families: ['OTHER'], boostAmount: 0.3 } });
    const targets = b.getLayersToPrearm('TEST_EVASION');
    expect(targets.length).toBe(1);
    expect(targets[0]!.layerId).toBe('L1');
    expect(targets[0]!.boostAmount).toBe(0.2);
  });
  test('correlateEscalation pin table', () => {
    expect(correlateEscalation(0, 0)).toBe(0);
    expect(correlateEscalation(0, 1)).toBe(0);
    expect(correlateEscalation(0, 2)).toBe(1);
    expect(correlateEscalation(0, 3)).toBe(2);
    expect(correlateEscalation(0, 4)).toBe(2);
    expect(correlateEscalation(1, 3)).toBe(2);
    expect(correlateEscalation(3, 1)).toBe(3);
  });
  test('standalone mode no signals -> empty/0 no throw', () => {
    const b = new PbaBridgeImpl();
    expect(b.getRecentSignals('nosession', 10)).toEqual([]);
    expect(b.getActiveFamilies('nosession')).toEqual([]);
    expect(b.getMacroTier('nosession')).toBe(0);
    expect(b.getLayersToPrearm('TEST_EVASION')).toEqual([]);
  });
  test('session isolation', () => {
    const b = new PbaBridgeImpl();
    b.onPbaSignal({ family: 'A', confidence: 1, excerpt: 'x', seq: 1, sessionId: 's1' });
    b.onPbaSignal({ family: 'B', confidence: 1, excerpt: 'y', seq: 2, sessionId: 's2' });
    expect(b.getRecentSignals('s1', 10)[0]!.family).toBe('A');
    expect(b.getRecentSignals('s2', 10)[0]!.family).toBe('B');
  });
  test('getRecentSignals limit respected', () => {
    const b = new PbaBridgeImpl();
    for (let i = 0; i < 5; i++) b.onPbaSignal({ family: 'F', confidence: 0.5, excerpt: 'e', seq: i, sessionId: 's1' });
    expect(b.getRecentSignals('s1', 2).length).toBe(2);
    expect(b.getRecentSignals('s1', 2)[0]!.seq).toBe(3);
  });
});
