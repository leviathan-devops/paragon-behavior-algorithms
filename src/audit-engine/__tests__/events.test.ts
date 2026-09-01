import { describe, expect, it } from 'bun:test';
import { ReasoningCaptureEngine, reasoningPlane, cadencePlane, ingestRecentEvents, writeEvidenceRecord } from '../events/audit-events.ts';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('THE EVENT PLANES (W5 — the observation planes, the L2 spec §3.7)', () => {
  it('the capture engine\'s start/delta/end/flush (the multi-rule flush)', async () => {
    const batches: Array<{ cumulative: string }> = [];
    const engine = new ReasoningCaptureEngine({
      flushIntervalMs: 50,
      maxDeltaChars: 1000,
      onBatch: (b) => batches.push(b),
    });
    engine.start('s1', 'm1', 'p1');
    engine.delta('a');
    engine.delta('b');
    await sleep(60);                                      // the 50ms time-rule fires
    expect(batches.length >= 1).toBe(true);
    engine.end();                                         // the end-marker flush
    engine.destroy();
    expect(batches.length >= 1).toBe(true);
  });

  it('the volume rule — the maxDeltaChars exceeded → flush', () => {
    const batches: Array<{ cumulative: string }> = [];
    const engine = new ReasoningCaptureEngine({
      flushIntervalMs: 10000,   // the time rule never fires in the test
      maxDeltaChars: 5,
      onBatch: (b) => batches.push(b),
    });
    engine.start('s1', 'm1', 'p1');
    engine.delta('abcde');      // exactly 5 chars → the volume rule fires
    engine.destroy();
    expect(batches.length).toBe(1);
    expect(batches[0].cumulative).toBe('abcde');
  });

  it('the FILTER LAW — a non-matching event returns before the engine (the noise gate)', () => {
    const plane = reasoningPlane('/tmp');
    expect(plane.filter({ type: 'session.created' })).toBe(false);   // the noise gate
    expect(plane.filter({ type: 'message.updated' })).toBe(true);    // the target type
  });

  it('the READER LAW — the defensive payload access (the SDK-type-gap is a signal, never a crash)', () => {
    const plane = reasoningPlane('/tmp');
    const obs = plane.reader({ type: 'message.updated', properties: { info: { parts: [{ type: 'reasoning', text: 'deep reasoning' }] } } } as never);
    expect(obs !== null).toBe(true);
    expect(obs!.text).toContain('deep');
    // THE FORMAT-AGNOSTIC FALLBACK — the text-embedded <thinking>
    const obs2 = plane.reader({ type: 'message.updated', properties: { info: { parts: [{ type: 'text', text: 'x <thinking>embedded</thinking> y' }] } } } as never);
    expect(obs2 !== null).toBe(true);
    expect(obs2!.text).toContain('embedded');
  });

  it('the evidence discriminator — the JSONL record carries source: "<plane>"', () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'events-'));
    const file = writeEvidenceRecord(target, 'reasoning', { sessionID: 's1', text: 'x' });
    expect(fs.existsSync(file)).toBe(true);
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('"source":"reasoning"');
  });

  it('the snapshot+ingest — the audit reads the recent window', () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'events-ingest-'));
    writeEvidenceRecord(target, 'reasoning', { sessionID: 's1', text: 'deep' });
    writeEvidenceRecord(target, 'cadence', { tool: 'read' });
    writeEvidenceRecord(target, 'model', { model: 'x' });
    writeEvidenceRecord(target, 'session', { lifecycle: 'created' });
    const stats = ingestRecentEvents(target, 1_800_000);
    expect(stats.reasoningObservations >= 1).toBe(true);
    expect(stats.cadenceToolCalls >= 1).toBe(true);
    expect(stats.modelRequests >= 1).toBe(true);
    expect(stats.sessionTransitions >= 1).toBe(true);
  });
});
