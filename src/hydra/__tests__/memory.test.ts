import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { SQLiteMemoryStore } from '../memory.js';
import type { GateOutput, RunSummary } from '../types.js';

type TestGateOutput = GateOutput & { runId: string };

function makeGateOutput(overrides: Partial<TestGateOutput> = {}): TestGateOutput {
  return {
    gateName: 'LASME',
    synthesis: {
      candidates: [
        { id: 'c1', layer: 'L1', score: 0.92, verdict: 'pass' },
        { id: 'c2', layer: 'L2', score: 0.45, verdict: 'fail' },
      ],
      verdicts: [
        { gate: 'LASME', passed: true, reason: 'ok' },
        { gate: 'MPSE', passed: false, reason: 'low-score' },
      ],
      graphSlice: { nodes: [{ id: 'n1', label: 'Node1', type: 'file' }], edges: [{ src: 'n1', dst: 'n2' }] },
      manifest: { sha: 'abc123def456', version: '4.4.3', builtAt: 1700000000000 },
    },
    results: [
      { subagentId: 'lasme-a', status: 'fulfilled', value: { ok: true, id: 'a' } },
      { subagentId: 'lasme-b', status: 'rejected', reason: 'boom' as unknown as Error },
    ],
    telemetry: {
      durationMs: 1234,
      subagentCount: 2,
      fulfilledCount: 1,
      rejectedCount: 1,
      totalTokensIn: 1000,
      totalTokensOut: 2000,
    },
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  };
}

function makeRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  const gateOut = makeGateOutput({ runId: 'run-r1' });
  return {
    runId: 'run-r1',
    createdAt: Date.now(),
    gateOutputs: { LASME: gateOut },
    summary: { totalGates: 1, passed: 1 },
    ...overrides,
  };
}

function makeTempStore(): { store: SQLiteMemoryStore; dbPath: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'hydra-mem-'));
  const dbPath = join(dir, 'test.db');
  const store = new SQLiteMemoryStore(dbPath);
  return { store, dbPath, dir };
}

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const d = tempDirs.pop();
    if (d) try { rmSync(d, { recursive: true, force: true }); } catch (e) { void e; }
  }
});

describe('memory — gate-output round-trip (1)', () => {
  test('setGateOutput then getGateOutput deep-equal :memory:', () => {
    const store = new SQLiteMemoryStore(':memory:');
    const gateOut = makeGateOutput({ runId: 'run-roundtrip-1', gateName: 'LASME' });
    store.setGateOutput('LASME', gateOut);
    const got = store.getGateOutput<TestGateOutput>('LASME');
    expect(got).not.toBeNull();
    expect(got).toEqual(gateOut);
    expect(JSON.stringify(got)).toBe(JSON.stringify(gateOut));
    store.close();
  });

  test('round-trip preserves realistic GateOutput with telemetry 6-field and nested structures via temp-file', () => {
    const { store, dir } = makeTempStore();
    tempDirs.push(dir);
    const gateOut = makeGateOutput({ runId: 'run-realistic-1' });
    store.setGateOutput('LASME', gateOut);
    const got = store.getGateOutput<TestGateOutput>('LASME');
    expect(got).not.toBeNull();
    expect(got!.gateName).toBe('LASME');
    expect(got!.telemetry.durationMs).toBe(1234);
    expect(got!.telemetry.subagentCount).toBe(2);
    expect(got!.telemetry.fulfilledCount).toBe(1);
    expect(got!.telemetry.rejectedCount).toBe(1);
    expect(got!.telemetry.totalTokensIn).toBe(1000);
    expect(got!.telemetry.totalTokensOut).toBe(2000);
    expect(got).toEqual(gateOut);
    store.close();
  });
});

describe('memory — latest-read semantics (2)', () => {
  test('two writes same gate_name different run_id returns newest by created_at', async () => {
    const store = new SQLiteMemoryStore(':memory:');
    const first = makeGateOutput({ runId: 'run-latest-1', gateName: 'LASME', telemetry: { durationMs: 100, subagentCount: 1, fulfilledCount: 1, rejectedCount: 0, totalTokensIn: 10, totalTokensOut: 20 } });
    const second = makeGateOutput({ runId: 'run-latest-2', gateName: 'LASME', telemetry: { durationMs: 999, subagentCount: 5, fulfilledCount: 5, rejectedCount: 0, totalTokensIn: 99, totalTokensOut: 99 } });
    store.setGateOutput('LASME', first);
    await new Promise((r) => setTimeout(r, 5));
    store.setGateOutput('LASME', second);
    const got = store.getGateOutput<TestGateOutput>('LASME');
    expect(got).not.toBeNull();
    expect(got!.runId).toBe('run-latest-2');
    expect(got!.telemetry.durationMs).toBe(999);
    expect(got).toEqual(second);
    store.close();
  });

  test('latest-read via temp-file with explicit runId ordering', async () => {
    const { store, dir } = makeTempStore();
    tempDirs.push(dir);
    const a = makeGateOutput({ runId: 'run-a', gateName: 'LASME' });
    const b = makeGateOutput({ runId: 'run-b', gateName: 'LASME' });
    store.setGateOutput('LASME', a);
    await new Promise((r) => setTimeout(r, 5));
    store.setGateOutput('LASME', b);
    const got = store.getGateOutput<TestGateOutput>('LASME');
    expect(got!.runId).toBe('run-b');
    store.close();
  });
});

describe('memory — run persistence (3)', () => {
  test('persistRun then getPriorRun deep-equal :memory:', () => {
    const store = new SQLiteMemoryStore(':memory:');
    const run = makeRunSummary({ runId: 'run-persist-1' });
    store.persistRun('run-persist-1', run);
    const got = store.getPriorRun('run-persist-1');
    expect(got).not.toBeNull();
    expect(got).toEqual(run);
    store.close();
  });

  test('run persistence via temp-file deep-equal', () => {
    const { store, dir } = makeTempStore();
    tempDirs.push(dir);
    const run = makeRunSummary({ runId: 'run-persist-2', createdAt: 1700000000000 });
    store.persistRun('run-persist-2', run);
    const got = store.getPriorRun('run-persist-2');
    expect(got).toEqual(run);
    store.close();
  });
});

describe('memory — changed files (4)', () => {
  test('N file_changes rows inserted via second handle then getChangedFiles returns all N', () => {
    const { store, dbPath, dir } = makeTempStore();
    tempDirs.push(dir);
    const runId = 'run-changed-1';
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/hydra/memory.ts'];
    const raw = new Database(dbPath);
    for (const fp of files) {
      raw.prepare('INSERT INTO file_changes (run_id, file_path, changed_at) VALUES (?, ?, ?)').run(runId, fp, Date.now());
    }
    raw.close();
    const got = store.getChangedFiles(runId);
    expect(got.length).toBe(files.length);
    expect(new Set(got)).toEqual(new Set(files));
    for (const f of files) expect(got).toContain(f);
    store.close();
  });

  test('changed files via second handle documents no-insert-method design', () => {
    const { store, dbPath, dir } = makeTempStore();
    tempDirs.push(dir);
    const runId = 'run-changed-2';
    const h2 = new Database(dbPath);
    h2.prepare('INSERT INTO file_changes (run_id, file_path, changed_at) VALUES (?, ?, ?)').run(runId, 'src/x.ts', Date.now());
    h2.prepare('INSERT INTO file_changes (run_id, file_path, changed_at) VALUES (?, ?, ?)').run(runId, 'src/y.ts', Date.now());
    h2.close();
    const got = store.getChangedFiles(runId);
    expect(got).toContain('src/x.ts');
    expect(got).toContain('src/y.ts');
    expect(got.length).toBe(2);
    store.close();
  });
});

describe('memory — no-row null semantics (5)', () => {
  test('getGateOutput on fresh :memory: returns null not throw', () => {
    const store = new SQLiteMemoryStore(':memory:');
    const got = store.getGateOutput('NONEXISTENT');
    expect(got).toBeNull();
    store.close();
  });

  test('getPriorRun on fresh db returns null not throw', () => {
    const store = new SQLiteMemoryStore(':memory:');
    expect(store.getPriorRun('no-such-run')).toBeNull();
    store.close();
  });

  test('getChangedFiles on unknown run returns empty array', () => {
    const store = new SQLiteMemoryStore(':memory:');
    expect(store.getChangedFiles('no-such-run')).toEqual([]);
    store.close();
  });
});

describe('memory — adversarial rapid same-gate writes (6)', () => {
  test('100 sequential writes same gate_name no SQLITE_BUSY final read returns last', () => {
    const { store, dir } = makeTempStore();
    tempDirs.push(dir);
    const gateName = 'LASME';
    let last: TestGateOutput | null = null;
    for (let i = 0; i < 100; i++) {
      const g = makeGateOutput({ runId: `run-rapid-${i}`, gateName, telemetry: { durationMs: i, subagentCount: i, fulfilledCount: i, rejectedCount: 0, totalTokensIn: i, totalTokensOut: i } });
      store.setGateOutput(gateName, g);
      if (i === 99) last = g;
    }
    const got = store.getGateOutput<TestGateOutput>(gateName);
    expect(got).not.toBeNull();
    expect(got!.runId).toBe('run-rapid-99');
    expect(got!.telemetry.durationMs).toBe(99);
    expect(got).toEqual(last!);
    store.close();
  });
});

describe('memory — adversarial corrupted row (7)', () => {
  test('hand-UPDATE data column to non-JSON via second handle getGateOutput throws GATE_OUTPUT_CORRUPT', async () => {
    const { store, dbPath, dir } = makeTempStore();
    tempDirs.push(dir);
    const gateOut = makeGateOutput({ runId: 'run-corrupt-1', gateName: 'LASME' });
    store.setGateOutput('LASME', gateOut);
    await new Promise((r) => setTimeout(r, 5));
    const h2 = new Database(dbPath);
    h2.prepare('UPDATE gate_outputs SET data = ? WHERE gate_name = ?').run(Buffer.from([0xFF, 0x00]), 'LASME');
    h2.close();
    expect(() => store.getGateOutput('LASME')).toThrow('GATE_OUTPUT_CORRUPT');
    let msg = '';
    try { store.getGateOutput('LASME'); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('GATE_OUTPUT_CORRUPT');
    store.close();
  });

  test('corrupted run_history summary column non-TEXT throws RUN_HISTORY_CORRUPT', () => {
    const { store, dbPath, dir } = makeTempStore();
    tempDirs.push(dir);
    const run = makeRunSummary({ runId: 'run-corrupt-2' });
    store.persistRun('run-corrupt-2', run);
    const h2 = new Database(dbPath);
    h2.prepare('UPDATE run_history SET summary = ? WHERE run_id = ?').run(Buffer.from([0xFF, 0x00]), 'run-corrupt-2');
    h2.close();
    expect(() => store.getPriorRun('run-corrupt-2')).toThrow('RUN_HISTORY_CORRUPT');
    store.close();
  });
});

describe('memory — adversarial empty-string gateId and missing gate (8)', () => {
  test('setGateOutput empty string throws GATE_OUTPUT_INVALID', () => {
    const store = new SQLiteMemoryStore(':memory:');
    const gateOut = makeGateOutput({ runId: 'run-empty-1' });
    expect(() => store.setGateOutput('', gateOut)).toThrow('GATE_OUTPUT_INVALID');
    expect(() => store.setGateOutput('   ', gateOut)).toThrow('GATE_OUTPUT_INVALID');
    store.close();
  });

  test('getGateOutput empty-string gateId returns null on fresh db', () => {
    const store = new SQLiteMemoryStore(':memory:');
    expect(store.getGateOutput('')).toBeNull();
    expect(store.getGateOutput('missing-gate-xyz')).toBeNull();
    store.close();
  });
});

describe('memory — backend literal (9)', () => {
  test('backend === sqlite for :memory: store', () => {
    const store = new SQLiteMemoryStore(':memory:');
    expect(store.backend).toBe('sqlite');
    store.close();
  });

  test('backend === sqlite for temp-file store', () => {
    const { store, dir } = makeTempStore();
    tempDirs.push(dir);
    expect(store.backend).toBe('sqlite');
    expect(store.backend === 'sqlite').toBe(true);
    store.close();
  });
});

describe('memory — Phase-2 stubs typed callable (10)', () => {
  test('getGraph returns null no-op', () => {
    const store = new SQLiteMemoryStore(':memory:');
    expect(store.getGraph()).toBeNull();
    store.close();
  });

  test('mergeGraphSlice is no-op does not throw', () => {
    const store = new SQLiteMemoryStore(':memory:');
    expect(() => store.mergeGraphSlice({ nodes: [] })).not.toThrow();
    expect(() => store.mergeGraphSlice({})).not.toThrow();
    store.close();
  });

  test('queryGraph returns null promise', async () => {
    const store = new SQLiteMemoryStore(':memory:');
    const got = await store.queryGraph('any query');
    expect(got).toBeNull();
    store.close();
  });

  test('close is callable and backend still readable', () => {
    const store = new SQLiteMemoryStore(':memory:');
    expect(() => store.close()).not.toThrow();
  });
});
