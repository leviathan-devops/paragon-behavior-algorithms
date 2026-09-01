// ms-escalation-memory — tests/per-machine.test.ts (per-machine: must fire + must suppress)
import { describe, test, expect } from 'bun:test';
import { computeDeadline, computeSkipTier, createInitialState, onEscalate, onComplyGenuine, onComplyMinimum } from '../src/core/engine.js';
import { runProperties } from './properties.js';

describe('ms-escalation-memory per-machine', () => {
  test('deadline table 5/2/0 must fire', () => { expect(computeDeadline(0)).toBe(5); expect(computeDeadline(1)).toBe(5); expect(computeDeadline(2)).toBe(2); expect(computeDeadline(3)).toBe(0); expect(computeDeadline(10)).toBe(0); });
  test('skipTier table 0/0/2/3 must fire', () => { expect(computeSkipTier(0)).toBe(0); expect(computeSkipTier(1)).toBe(0); expect(computeSkipTier(2)).toBe(2); expect(computeSkipTier(3)).toBe(3); });
  test('genuine comply decrements, minimum keeps (must suppress floor breach)', () => {
    let s = createInitialState(); s = onEscalate(s); s = onEscalate(s); s = onEscalate(s);
    expect(s.escalationCount).toBe(3); expect(onComplyGenuine(s).escalationCount).toBe(2); expect(onComplyMinimum(s).escalationCount).toBe(3);
  });
  test('floor at 0: genuine at 0 stays 0 (suppress negative)', () => { expect(onComplyGenuine(createInitialState()).escalationCount).toBe(0); });
  test('500-run determinism', () => { const r = runProperties(); expect(r.fail).toBe(0); });
});
