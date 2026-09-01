import { describe, test, expect } from 'bun:test';
import { step } from './index.js';
import { createInitialRecord } from './types.js';
import type { BehaviorRecord } from './types.js';

function intervening(tier: 0|1|2|3|4 = 1, esc = 0): BehaviorRecord {
  return createInitialRecord({ state: 'INTERVENING', tier, escalationCount: esc, seq: 10, directives: [{ seq: 5, verb: 'INTERVENE', patternOrMember: 'x' }], lastComplianceVerified: false, complianceDeadlineSeq: 20 });
}

describe('ms-state-machine', () => {
  test('observe IDLE->MONITORING on FIRST_TOOL_SIGNAL', () => {
    const r = createInitialRecord();
    const n = step(r, 'FIRST_TOOL_SIGNAL');
    expect(n.state).toBe('MONITORING');
    expect(n.seq).toBe(1);
  });
  test('accumulate MONITORING stays MONITORING on TOOL_SIGNAL', () => {
    const r = createInitialRecord({ state: 'MONITORING', seq: 5 });
    const n = step(r, 'TOOL_SIGNAL');
    expect(n.state).toBe('MONITORING');
    expect(n.seq).toBe(6);
  });
  test('rearm-first: TOOL_SIGNAL while INTERVENING stays INTERVENING not MONITORING', () => {
    const r = intervening(1,0);
    const n = step(r, 'TOOL_SIGNAL');
    expect(n.state).toBe('INTERVENING');
    expect(n.seq).toBe(11);
  });
  test('prime MONITORING->PRIMED requires patternId', () => {
    const r = createInitialRecord({ state: 'MONITORING', seq: 2 });
    const noAnchor = step(r, 'CHAIN_PATTERN_HIT');
    expect(noAnchor.state).toBe('MONITORING');
    const withAnchor = step(r, 'CHAIN_PATTERN_HIT', { patternId: 'p1' });
    expect(withAnchor.state).toBe('PRIMED');
    const withMember = step(r, 'CHAIN_PATTERN_HIT', { memberId: 'm1' });
    expect(withMember.state).toBe('PRIMED');
  });
  test('intervene PRIMED->INTERVENING sets tier skipTier and deadline', () => {
    const r = createInitialRecord({ state: 'PRIMED', seq: 9, escalationCount: 0 });
    const n = step(r, 'INTERVENE', { patternId: 'SMOKE' });
    expect(n.state).toBe('INTERVENING');
    expect(n.tier).toBe(1);
    expect(n.complianceDeadlineSeq).toBe(n.seq + 5);
    expect(n.directives.length).toBe(1);
  });
  test('intervene skipTier esc>=2 ->2', () => {
    const r = createInitialRecord({ state: 'PRIMED', seq: 0, escalationCount: 2 });
    const n = step(r, 'INTERVENE', { patternId: 'p' });
    expect(n.tier).toBe(2);
  });
  test('intervene skipTier esc>=3 ->3', () => {
    const r = createInitialRecord({ state: 'PRIMED', seq: 0, escalationCount: 3 });
    const n = step(r, 'INTERVENE', { patternId: 'p' });
    expect(n.tier).toBe(3);
  });
  test('comply genuine decrements esc', () => {
    const r = intervening(2,2);
    const n = step(r, 'COMPLIANCE_VERIFIED', { isGenuine: true });
    expect(n.state).toBe('MONITORING');
    expect(n.tier).toBe(0);
    expect(n.escalationCount).toBe(1);
    expect(n.lastComplianceVerified).toBe(true);
    expect(n.complianceDeadlineSeq).toBeNull();
  });
  test('comply minimum does not decrement esc probation deadline', () => {
    const r = intervening(2,2);
    const n = step(r, 'COMPLIANCE_VERIFIED', { isGenuine: false });
    expect(n.escalationCount).toBe(2);
    expect(n.complianceDeadlineSeq).not.toBeNull();
  });
  test('escalate tier progression 1->2->3->4', () => {
    let r = intervening(1,0);
    r.complianceDeadlineSeq = 5;
    r.seq = 10;
    r = step(r, 'COMPLIANCE_FAILED');
    expect(r.tier).toBe(2);
    r.complianceDeadlineSeq = 5;
    r.seq = 10;
    r = step(r, 'COMPLIANCE_FAILED');
    expect(r.tier).toBe(3);
    r.complianceDeadlineSeq = 5;
    r.seq = 10;
    r = step(r, 'COMPLIANCE_FAILED');
    expect(r.tier).toBe(4);
    const before = r.tier;
    r = step(r, 'COMPLIANCE_FAILED');
    expect(r.tier).toBe(before);
  });
  test('escalate denial++ at tier>=3 esc++ at tier>=2', () => {
    let r = intervening(3,1);
    r.complianceDeadlineSeq = 1;
    r.seq = 10;
    const n = step(r, 'COMPLIANCE_FAILED');
    expect(n.denialCount).toBe(1);
    expect(n.escalationCount).toBe(2);
  });
  test('cool requires 25 seq and compliance verified', () => {
    const r = createInitialRecord({ state: 'INTERVENING', seq: 30, directives: [{ seq:1, verb:'INTERVENE', patternOrMember:'x'}], lastComplianceVerified: false });
    const blocked1 = step(r, 'SEQ_WINDOW', { advanced: 24 });
    expect(blocked1.state).toBe('INTERVENING');
    const blocked2 = step(r, 'SEQ_WINDOW', { advanced: 25 });
    expect(blocked2.state).toBe('INTERVENING');
    const ok = createInitialRecord({ state: 'INTERVENING', seq: 30, directives: [{ seq:1, verb:'INTERVENE', patternOrMember:'x'}], lastComplianceVerified: true });
    const cooled = step(ok, 'SEQ_WINDOW', { advanced: 25 });
    expect(cooled.state).toBe('MONITORING');
    const emptyDirectives = createInitialRecord({ state: 'INTERVENING', seq: 30, directives: [], lastComplianceVerified: false });
    const cooled2 = step(emptyDirectives, 'SEQ_WINDOW', { advanced: 25 });
    expect(cooled2.state).toBe('MONITORING');
  });
  test('invalid transition no-op', () => {
    const r = createInitialRecord({ state: 'MONITORING', seq: 5 });
    const n = step(r, 'COMPLIANCE_VERIFIED');
    expect(n.state).toBe('MONITORING');
    expect(n.seq).toBe(5);
    const r2 = createInitialRecord({ state: 'IDLE', seq: 0 });
    const n2 = step(r2, 'INTERVENE');
    expect(n2.state).toBe('IDLE');
  });
  test('concurrent step purity same input same output', () => {
    const r = createInitialRecord({ state: 'MONITORING', seq: 0 });
    const a = step(r, 'CHAIN_PATTERN_HIT', { patternId: 'p' });
    const b = step(r, 'CHAIN_PATTERN_HIT', { patternId: 'p' });
    expect(a).toEqual(b);
    expect(r.state).toBe('MONITORING');
  });
  test('empty payload does not throw', () => {
    const r = createInitialRecord();
    expect(() => step(r, 'FIRST_TOOL_SIGNAL', undefined)).not.toThrow();
    expect(() => step(intervening(), 'TOOL_SIGNAL', {})).not.toThrow();
  });
});
