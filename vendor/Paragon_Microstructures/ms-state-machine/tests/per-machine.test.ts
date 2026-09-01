// ms-state-machine — tests/per-machine.test.ts
// Per-machine behavior: every transition MUST have a case that fires + a case that no-ops.
import { describe, test, expect } from 'bun:test';
import { step } from '../src/core/engine.js';
import { createInitialRecord } from '../src/core/types.js';
import type { BehaviorRecord } from '../src/core/types.js';
import { runProperties } from './properties.js';

describe('per-machine: state-machine', () => {
  test('properties determinism 500 runs', () => {
    const r = runProperties();
    expect(r.fail).toBe(0);
  });
  test('rearm fires: TOOL_SIGNAL @ INTERVENING stays INTERVENING', () => {
    const r = createInitialRecord({ state: 'INTERVENING', seq: 10, tier: 1, directives: [{seq:1,verb:'INTERVENE',patternOrMember:'x'}] });
    const n = step(r, 'TOOL_SIGNAL');
    expect(n.state).toBe('INTERVENING');
  });
  test('rearm no-op: TOOL_SIGNAL @ IDLE stays IDLE', () => {
    const r = createInitialRecord({ state: 'IDLE' });
    const n = step(r, 'TOOL_SIGNAL');
    expect(n.state).toBe('IDLE');
  });
  test('observe fires: FIRST_TOOL_SIGNAL @ IDLE → MONITORING', () => {
    const r = createInitialRecord({ state: 'IDLE' });
    expect(step(r, 'FIRST_TOOL_SIGNAL').state).toBe('MONITORING');
  });
  test('prime fires: CHAIN_PATTERN_HIT @ MONITORING with anchor → PRIMED', () => {
    const r = createInitialRecord({ state: 'MONITORING' });
    expect(step(r, 'CHAIN_PATTERN_HIT', { patternId: 'p' }).state).toBe('PRIMED');
  });
  test('prime no-op: CHAIN_PATTERN_HIT without anchor stays MONITORING', () => {
    const r = createInitialRecord({ state: 'MONITORING' });
    expect(step(r, 'CHAIN_PATTERN_HIT').state).toBe('MONITORING');
  });
  test('intervene fires: INTERVENE @ PRIMED → INTERVENING', () => {
    const r = createInitialRecord({ state: 'PRIMED', escalationCount: 0 });
    expect(step(r, 'INTERVENE', { patternId: 'p' }).state).toBe('INTERVENING');
  });
  test('comply fires: COMPLIANCE_VERIFIED @ INTERVENING → MONITORING', () => {
    const r = createInitialRecord({ state: 'INTERVENING', tier: 2, seq: 5, directives: [{seq:1,verb:'INTERVENE',patternOrMember:'x'}] });
    expect(step(r, 'COMPLIANCE_VERIFIED', { isGenuine: true }).state).toBe('MONITORING');
  });
  test('escalate fires: COMPLIANCE_FAILED @ INTERVENING stays INTERVENING tier++', () => {
    const r = createInitialRecord({ state: 'INTERVENING', tier: 1, seq: 10, escalationCount: 0, complianceDeadlineSeq: 5, directives: [{seq:1,verb:'INTERVENE',patternOrMember:'x'}] });
    const n = step(r, 'COMPLIANCE_FAILED');
    expect(n.state).toBe('INTERVENING');
    expect(n.tier).toBe(2);
  });
  test('cool fires: SEQ_WINDOW @ INTERVENING advanced>=25 + verified → MONITORING', () => {
    const r = createInitialRecord({ state: 'INTERVENING', seq: 30, lastComplianceVerified: true, directives: [{seq:1,verb:'INTERVENE',patternOrMember:'x'}] });
    expect(step(r, 'SEQ_WINDOW', { advanced: 25 }).state).toBe('MONITORING');
  });
  test('cool no-op: SEQ_WINDOW advanced<25 stays INTERVENING', () => {
    const r = createInitialRecord({ state: 'INTERVENING', seq: 30, lastComplianceVerified: true, directives: [{seq:1,verb:'INTERVENE',patternOrMember:'x'}] });
    expect(step(r, 'SEQ_WINDOW', { advanced: 10 }).state).toBe('INTERVENING');
  });
});
