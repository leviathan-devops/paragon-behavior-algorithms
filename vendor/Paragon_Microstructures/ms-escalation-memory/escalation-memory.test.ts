import { describe, test, expect } from 'bun:test';
import { computeDeadline, computeSkipTier, onEscalate, onComplyGenuine, onComplyMinimum, createInitialState } from './index.js';

describe('ms-escalation-memory', () => {
  test('deadline table 5/2/0 pinned', () => {
    expect(computeDeadline(0)).toBe(5);
    expect(computeDeadline(1)).toBe(5);
    expect(computeDeadline(2)).toBe(2);
    expect(computeDeadline(3)).toBe(0);
    expect(computeDeadline(10)).toBe(0);
  });
  test('skipTier 0/0/2/3 pinned', () => {
    expect(computeSkipTier(0)).toBe(0);
    expect(computeSkipTier(1)).toBe(0);
    expect(computeSkipTier(2)).toBe(2);
    expect(computeSkipTier(3)).toBe(3);
    expect(computeSkipTier(10)).toBe(3);
  });
  test('onEscalate increments', () => {
    let s = createInitialState();
    s = onEscalate(s);
    expect(s.escalationCount).toBe(1);
    expect(s.deadlineWindow).toBe(5);
    s = onEscalate(s);
    expect(s.escalationCount).toBe(2);
    expect(s.deadlineWindow).toBe(2);
    s = onEscalate(s);
    expect(s.escalationCount).toBe(3);
    expect(s.deadlineWindow).toBe(0);
    expect(s.skipTierLevel).toBe(3);
  });
  test('genuine comply decrements 3->2', () => {
    let s = createInitialState();
    s = onEscalate(s); s = onEscalate(s); s = onEscalate(s);
    expect(s.escalationCount).toBe(3);
    s = onComplyGenuine(s);
    expect(s.escalationCount).toBe(2);
    expect(s.deadlineWindow).toBe(2);
  });
  test('minimum comply keeps 3->3', () => {
    let s = createInitialState();
    s = onEscalate(s); s = onEscalate(s); s = onEscalate(s);
    s = onComplyMinimum(s);
    expect(s.escalationCount).toBe(3);
    expect(s.deadlineWindow).toBe(0);
  });
  test('floor at 0 genuine comply at 0 stays 0', () => {
    let s = createInitialState();
    s = onComplyGenuine(s);
    expect(s.escalationCount).toBe(0);
    s = onComplyGenuine(s);
    expect(s.escalationCount).toBe(0);
  });
  test('derived fields update on every transition', () => {
    let s = createInitialState();
    expect(s.deadlineWindow).toBe(5);
    expect(s.skipTierLevel).toBe(0);
    for (let i = 0; i < 5; i++) s = onEscalate(s);
    expect(s.deadlineWindow).toBe(0);
    expect(s.skipTierLevel).toBe(3);
    expect(s.debounceWindow).toBe(0);
  });
  test('invalid inputs throw', () => {
    expect(() => computeDeadline(-1)).toThrow();
    expect(() => computeSkipTier(NaN)).toThrow();
    expect(() => onEscalate(null as any)).toThrow();
  });
});
