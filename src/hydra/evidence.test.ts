import { describe, test, expect } from 'bun:test';
import { PipelineEvidenceCollector } from './evidence.js';

describe('PipelineEvidenceCollector', () => {
  test('log 3 events → telemetry reflects them → getEvidenceLog returns 3 → defensive copy', () => {
    const c = new PipelineEvidenceCollector('proof-pipeline');
    c.log('SUBAGENT_FULFILLED', { subagentId: 'a' });
    c.log('SUBAGENT_REJECTED', { subagentId: 'b', error: 'boom' });
    c.log('GATE_CHECK', { gate: 'g1', phase: 'pre' });

    const tel = c.getTelemetry();
    expect(tel.fulfilledCount).toBe(1);
    expect(tel.rejectedCount).toBe(1);
    expect(tel.subagentCount).toBe(2);
    expect(tel.gatesPassed).toBe(1);
    expect(tel.gatesFailed).toBe(0);
    expect(tel.totalTokensIn).toBe(0);
    expect(tel.totalTokensOut).toBe(0);
    expect(tel.totalDurationMs).toBeGreaterThanOrEqual(0);

    const log = c.getEvidenceLog();
    expect(log.length).toBe(3);
    expect(log[0].event).toBe('SUBAGENT_FULFILLED');
    expect(log[1].event).toBe('SUBAGENT_REJECTED');
    expect(log[2].event).toBe('GATE_CHECK');

    const mutated = c.getEvidenceLog();
    (mutated as unknown as unknown[]).push({ timestamp: 0, event: 'FAKE', data: {} } as never);
    expect(c.getEvidenceLog().length).toBe(3);
  });

  test('telemetry derives from entries — no parallel counters', () => {
    const c = new PipelineEvidenceCollector('derive-test');
    expect(c.getTelemetry().fulfilledCount).toBe(0);
    c.log('SUBAGENT_FULFILLED', { subagentId: 'x' });
    c.log('SUBAGENT_FULFILLED', { subagentId: 'y' });
    expect(c.getTelemetry().fulfilledCount).toBe(2);
    c.log('SUBAGENT_REJECTED', { subagentId: 'z', error: 'e' });
    const t = c.getTelemetry();
    expect(t.fulfilledCount).toBe(2);
    expect(t.rejectedCount).toBe(1);
    expect(t.subagentCount).toBe(3);
  });

  test('gatesPassed = GATE_CHECK count minus GATE_FAILED count', () => {
    const c = new PipelineEvidenceCollector('gate-test');
    c.log('GATE_CHECK', { gate: 'g1', phase: 'pre' });
    c.log('GATE_CHECK', { gate: 'g2', phase: 'pre' });
    c.log('GATE_FAILED', { gate: 'g2', reason: 'nope' });
    const t = c.getTelemetry();
    expect(t.gatesFailed).toBe(1);
    expect(t.gatesPassed).toBe(1);
  });

  test('gatesPassed can be negative if more failures than checks (no clamp — derived)', () => {
    const c = new PipelineEvidenceCollector('gate-negative');
    c.log('GATE_FAILED', { gate: 'g1', reason: 'x' });
    const t = c.getTelemetry();
    expect(t.gatesFailed).toBe(1);
    expect(t.gatesPassed).toBe(-1);
  });

  test('console.error mirror format [hydra:event]', () => {
    const c = new PipelineEvidenceCollector('mirror-test');
    const calls: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => { calls.push(String(args[0])); void args[1]; };
    try {
      c.log('PIPELINE_START', { name: 'mirror-test', at: 123 });
      expect(calls[0]).toBe('[hydra:PIPELINE_START]');
    } finally {
      console.error = orig;
    }
  });

  test('adversarial: empty log → telemetry zeros', () => {
    const c = new PipelineEvidenceCollector('empty');
    const t = c.getTelemetry();
    expect(t.fulfilledCount).toBe(0);
    expect(t.rejectedCount).toBe(0);
    expect(t.gatesFailed).toBe(0);
    expect(t.gatesPassed).toBe(0);
    expect(t.subagentCount).toBe(0);
    expect(c.getEvidenceLog()).toEqual([]);
  });

  test('adversarial: concurrent logs (Promise.all) — count integrity', async () => {
    const c = new PipelineEvidenceCollector('concurrent');
    await Promise.all([
      Promise.resolve().then(() => c.log('SUBAGENT_FULFILLED', { subagentId: 'a' })),
      Promise.resolve().then(() => c.log('SUBAGENT_FULFILLED', { subagentId: 'b' })),
      Promise.resolve().then(() => c.log('SUBAGENT_REJECTED', { subagentId: 'c', error: 'e' })),
      Promise.resolve().then(() => c.log('GATE_CHECK', { gate: 'g1', phase: 'pre' })),
    ]);
    const t = c.getTelemetry();
    expect(t.fulfilledCount).toBe(2);
    expect(t.rejectedCount).toBe(1);
    expect(t.subagentCount).toBe(3);
    expect(c.getEvidenceLog().length).toBe(4);
  });

  test('adversarial: boundary — many events', () => {
    const c = new PipelineEvidenceCollector('boundary');
    for (let i = 0; i < 100; i++) c.log('SUBAGENT_FULFILLED', { subagentId: `s${i}` });
    for (let i = 0; i < 50; i++) c.log('SUBAGENT_REJECTED', { subagentId: `r${i}`, error: 'e' });
    const t = c.getTelemetry();
    expect(t.fulfilledCount).toBe(100);
    expect(t.rejectedCount).toBe(50);
    expect(t.subagentCount).toBe(150);
    expect(c.getEvidenceLog().length).toBe(150);
  });

  test('adversarial: defensive copy — mutating entry object in returned array does not affect if re-fetched (shallow copy check)', () => {
    const c = new PipelineEvidenceCollector('defensive');
    c.log('SUBAGENT_FULFILLED', { subagentId: 'a' });
    const log1 = c.getEvidenceLog();
    const lenBefore = c.getEvidenceLog().length;
    log1.length = 0;
    expect(c.getEvidenceLog().length).toBe(lenBefore);
    expect(c.getEvidenceLog().length).toBe(1);
  });

  test('null-ish data shape — empty Record still logs', () => {
    const c = new PipelineEvidenceCollector('nullish');
    c.log('GRAPH_EXTRACT_START', {});
    expect(c.getEvidenceLog().length).toBe(1);
    expect(c.getEvidenceLog()[0].data).toEqual({});
  });

  test('totalDurationMs grows over time', async () => {
    const c = new PipelineEvidenceCollector('duration');
    const t1 = c.getTelemetry().totalDurationMs;
    await new Promise((r) => setTimeout(r, 10));
    const t2 = c.getTelemetry().totalDurationMs;
    expect(t2).toBeGreaterThanOrEqual(t1);
  });
});
