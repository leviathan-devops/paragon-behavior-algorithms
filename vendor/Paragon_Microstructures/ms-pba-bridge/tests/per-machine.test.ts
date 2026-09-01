// ms-pba-bridge — tests/per-machine.test.ts (per-machine: must fire + must suppress)
import { describe, test, expect } from 'bun:test';
import { PbaBridgeImpl, correlateEscalation } from '../src/core/engine.js';
import { runProperties } from './properties.js';

describe('ms-pba-bridge per-machine', () => {
  test('stores and retrieves signals (must fire)', () => {
    const b = new PbaBridgeImpl(); b.onPbaSignal({ family: 'TEST_EVASION', confidence: 0.8, excerpt: 'skip', seq: 1, sessionId: 's1' });
    expect(b.getRecentSignals('s1',10)[0]!.family).toBe('TEST_EVASION');
  });
  test('standalone suppresses: no signals → empty/0 (must suppress)', () => {
    const b = new PbaBridgeImpl(); expect(b.getRecentSignals('nosess',10)).toEqual([]); expect(b.getMacroTier('nosess')).toBe(0); expect(b.getLayersToPrearm('TEST_EVASION')).toEqual([]);
  });
  test('getLayersToPrearm fires only on matching family', () => {
    const b = new PbaBridgeImpl(); b.registerLayer({ layerId: 'L1', pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 } });
    b.registerLayer({ layerId: 'L2', pbaContextBoost: { families: ['OTHER'], boostAmount: 0.3 } });
    expect(b.getLayersToPrearm('TEST_EVASION')).toEqual([{ layerId: 'L1', boostAmount: 0.2 }]);
    expect(b.getLayersToPrearm('UNKNOWN')).toEqual([]);
  });
  test('correlateEscalation pin table (MASTER MS-05)', () => {
    expect(correlateEscalation(0,0)).toBe(0); expect(correlateEscalation(0,1)).toBe(0); expect(correlateEscalation(0,2)).toBe(1); expect(correlateEscalation(0,3)).toBe(2); expect(correlateEscalation(0,4)).toBe(2);
  });
  test('500-run determinism', () => { const r = runProperties(); expect(r.fail).toBe(0); });
});
