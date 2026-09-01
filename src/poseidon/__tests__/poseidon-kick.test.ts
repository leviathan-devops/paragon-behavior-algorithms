// poseidon-kick.test.ts — T-KICK-COPY
// Per-phase one action. No "human should continue."
// DISPATCH → task() then loop
// VERIFY → write wave-N.md VERDICT:+coverage then loop
// CONTAINER_TEST → send+check+results on this container/dist then loop
// PROBLEM_SOLVE → write problem-solve-<cycle>.md then loop

import { describe, it, expect } from 'bun:test';
import { buildKickMessage } from '../poseidon-kick.ts';

describe('buildKickMessage — per-phase one action', () => {
  it('DISPATCH names task() then loop', () => {
    const m = buildKickMessage({ phase: 'DISPATCH', wave: 2, attempt: 1, escalated: false, cycle: 3 });
    expect(m.includes('[POSEIDON ENFORCER]')).toBe(true);
    expect(m.includes('task()')).toBe(true);
    expect(m.includes('trident-poseidon action=loop')).toBe(true);
    expect(m.toLowerCase().includes('human should continue')).toBe(false);
  });

  it('VERIFY names wave-N.md VERDICT:+coverage then loop', () => {
    const m = buildKickMessage({ phase: 'VERIFY', wave: 4, attempt: 1, escalated: false, cycle: 5 });
    expect(m.includes('wave-4.md')).toBe(true);
    expect(m.includes('VERDICT:')).toBe(true);
    expect(m.includes('coverage')).toBe(true);
    expect(m.includes('trident-poseidon action=loop')).toBe(true);
  });

  it('CONTAINER_TEST names send+check+results on this container/dist', () => {
    const m = buildKickMessage({ phase: 'CONTAINER_TEST', wave: 1, attempt: 1, escalated: false, cycle: 2 });
    expect(m.includes('send')).toBe(true);
    expect(m.includes('check')).toBe(true);
    expect(m.includes('results')).toBe(true);
    expect(m.includes('this container')).toBe(true);
    expect(m.includes('trident-poseidon action=loop')).toBe(true);
  });

  it('PROBLEM_SOLVE names problem-solve-<cycle>.md then loop', () => {
    const m = buildKickMessage({ phase: 'PROBLEM_SOLVE', wave: 1, attempt: 2, escalated: false, cycle: 7 });
    expect(m.includes('problem-solve-7.md')).toBe(true);
    expect(m.includes('trident-poseidon action=loop')).toBe(true);
  });

  it('escalation names kick number and does not ask a human', () => {
    const m = buildKickMessage({ phase: 'DISPATCH', wave: 1, attempt: 3, escalated: true, cycle: 1 });
    expect(m.includes('ESCALATION')).toBe(true);
    expect(m.includes('kick #3')).toBe(true);
    expect(m.toLowerCase().includes('human should')).toBe(false);
  });

  it('adversarial: unknown phase still has ENFORCER + loop, never human-continue', () => {
    const m = buildKickMessage({ phase: 'COLLECT', wave: 0, attempt: 1, escalated: false, cycle: 0 });
    expect(m.includes('[POSEIDON ENFORCER]')).toBe(true);
    expect(m.includes('trident-poseidon action=loop')).toBe(true);
    expect(m.toLowerCase().includes('human should continue')).toBe(false);
  });
});
