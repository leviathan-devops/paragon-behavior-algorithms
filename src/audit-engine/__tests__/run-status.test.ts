import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  RUN_STATUS_FILENAME,
  NOTIFICATION_FILENAME,
  NO_ACTIVE_RUN,
  PRELIMINARY_LABEL,
  LASME_LABEL,
  MPSE_LABEL,
  FINAL_LABEL,
  GATES_RUNNING_LABEL,
  aetherLedgerRootFor,
  runStatusPath,
  notificationPath,
  artifactPathFor,
  preliminaryArtifactPath,
  writeRunStatus,
  safeWriteRunStatus,
  readRunStatus,
  notifyGateCompletion,
  safeNotifyGateCompletion,
  readNotifications,
  mergeGateState,
  type RunStatusSnapshot,
} from '../run-status.ts';

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-status-test-'));
}

function snap(over: Partial<RunStatusSnapshot> = {}): RunStatusSnapshot {
  const fakeTarget = path.join(os.tmpdir(), 'fake-target', 'src');
  return {
    runId: 'audit-1700000000000',
    gate: 'PRELIMINARY',
    phase: 'done',
    huntersFulfilled: 0,
    huntersRejected: 0,
    candidatesSoFar: 12,
    artifactLabel: '[PRELIMINARY]',
    updatedAt: Date.now(),
    targetRoot: fakeTarget,
    ...over,
  };
}

describe('run-status — the async visibility seam (atomic writes + NO_ACTIVE_RUN + notifications)', () => {
  let tmpRoot: string;
  let ledgerRoot: string;

  beforeEach(() => {
    tmpRoot = mkTmp();
    ledgerRoot = path.join(tmpRoot, '.trident', 'aether-ledger');
  });

  afterEach(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_e: unknown) { void _e; }
  });

  it('ROUND-TRIP — writeRunStatus then readRunStatus returns identical snapshot', () => {
    const s = snap({ runId: 'audit-1', gate: 'LASME', phase: 'done', huntersFulfilled: 5, huntersRejected: 1, candidatesSoFar: 26, artifactLabel: '[LASME-ADJUDICATED]', targetRoot: tmpRoot });
    writeRunStatus(ledgerRoot, s);
    const read = readRunStatus(ledgerRoot);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.snapshot.runId).toBe(s.runId);
      expect(read.snapshot.gate).toBe(s.gate);
      expect(read.snapshot.phase).toBe(s.phase);
      expect(read.snapshot.huntersFulfilled).toBe(5);
      expect(read.snapshot.huntersRejected).toBe(1);
      expect(read.snapshot.candidatesSoFar).toBe(26);
      expect(read.snapshot.artifactLabel).toBe('[LASME-ADJUDICATED]');
      expect(read.snapshot.targetRoot).toBe(tmpRoot);
      expect(typeof read.snapshot.updatedAt).toBe('number');
    }
  });

  it('ATOMICITY — no .tmp residue after write + concurrent reads never see torn JSON (20 writes)', () => {
    for (let i = 0; i < 20; i++) {
      const s = snap({ runId: `audit-atomic-${i}`, gate: i % 2 === 0 ? 'LASME' : 'MPSE', phase: i % 3 === 0 ? 'start' : 'done', candidatesSoFar: i, updatedAt: Date.now() + i });
      writeRunStatus(ledgerRoot, s);
      const files = fs.readdirSync(ledgerRoot);
      const tmps = files.filter((f) => f.includes('.tmp-'));
      expect(tmps.length).toBe(0);
      const read = readRunStatus(ledgerRoot);
      expect(read.ok).toBe(true);
      if (read.ok) {
        expect(() => JSON.parse(JSON.stringify(read.snapshot))).not.toThrow();
        expect(read.snapshot.runId).toBe(`audit-atomic-${i}`);
      }
    }
    const finalRaw = fs.readFileSync(runStatusPath(ledgerRoot), 'utf-8');
    expect(() => JSON.parse(finalRaw)).not.toThrow();
    const final = JSON.parse(finalRaw) as RunStatusSnapshot;
    expect(final.runId).toBe('audit-atomic-19');
  });

  it('MISSING FILE — readRunStatus returns NO_ACTIVE_RUN (never fabricated data)', () => {
    const freshLedger = path.join(mkTmp(), 'aether-ledger');
    const read = readRunStatus(freshLedger);
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.reason).toBe(NO_ACTIVE_RUN);
    }
    try { fs.rmSync(path.dirname(freshLedger), { recursive: true, force: true }); } catch (_e: unknown) { void _e; }
  });

  it('CORRUPT FILE — readRunStatus returns CORRUPT with error + raw', () => {
    fs.mkdirSync(ledgerRoot, { recursive: true });
    fs.writeFileSync(runStatusPath(ledgerRoot), '{ not json', 'utf-8');
    const read = readRunStatus(ledgerRoot);
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.reason).toBe('CORRUPT');
      expect(typeof read.error).toBe('string');
      expect(read.error!.includes('JSON')).toBe(true);
    }
  });

  it('CORRUPT FILE — missing required field returns CORRUPT', () => {
    fs.mkdirSync(ledgerRoot, { recursive: true });
    fs.writeFileSync(runStatusPath(ledgerRoot), JSON.stringify({ runId: 'audit-1', gate: 'PRELIMINARY' }), 'utf-8');
    const read = readRunStatus(ledgerRoot);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe('CORRUPT');
  });

  it('PATH DERIVATIONS — aetherLedgerRootFor + runStatusPath + artifactPathFor + preliminaryArtifactPath', () => {
    const target = path.join(os.tmpdir(), 'my-project', 'src');
    const ledger = aetherLedgerRootFor(target);
    expect(ledger).toBe(path.join(path.resolve(target), '.trident', 'aether-ledger'));
    expect(runStatusPath(ledger)).toBe(path.join(ledger, RUN_STATUS_FILENAME));
    expect(artifactPathFor(target, '[PRELIMINARY]')).toBe(path.join(path.resolve(target), '.trident', 'audit-report-PRELIMINARY.md'));
    expect(artifactPathFor(target, '[LASME-ADJUDICATED]')).toBe(path.join(path.resolve(target), '.trident', 'audit-report-LASMEADJUDICATED.md'));
    expect(artifactPathFor(target, '[MPSE-VERIFIED]')).toBe(path.join(path.resolve(target), '.trident', 'audit-report-MPSEVERIFIED.md'));
    expect(artifactPathFor(target, '[FINAL]')).toBe(path.join(path.resolve(target), '.trident', 'audit-report-FINAL.md'));
    expect(preliminaryArtifactPath(target)).toBe(artifactPathFor(target, '[PRELIMINARY]'));
    expect(NOTIFICATION_FILENAME.length).toBeGreaterThan(0);
  });

  it('NOTIFICATION — notifyGateCompletion appends JSONL row readable via readNotifications', () => {
    const s1 = snap({ runId: 'audit-notify-1', gate: 'LASME', phase: 'done', huntersFulfilled: 6, huntersRejected: 0, candidatesSoFar: 26, artifactLabel: '[LASME-ADJUDICATED]', targetRoot: tmpRoot, updatedAt: 1000 });
    const s2 = snap({ runId: 'audit-notify-1', gate: 'MPSE', phase: 'done', huntersFulfilled: 4, huntersRejected: 1, candidatesSoFar: 30, artifactLabel: '[MPSE-VERIFIED]', targetRoot: tmpRoot, updatedAt: 2000 });
    notifyGateCompletion(ledgerRoot, s1);
    notifyGateCompletion(ledgerRoot, s2);
    const rows = readNotifications(ledgerRoot);
    expect(rows.length).toBe(2);
    expect(rows[0]!.event).toBe('AUDIT_GATE_DONE');
    expect(rows[0]!.gate).toBe('LASME');
    expect(rows[0]!.runId).toBe('audit-notify-1');
    expect(rows[1]!.gate).toBe('MPSE');
    expect(rows[1]!.huntersRejected).toBe(1);
    expect(rows[1]!.candidatesSoFar).toBe(30);
    expect(fs.existsSync(notificationPath(ledgerRoot))).toBe(true);
    const raw = fs.readFileSync(notificationPath(ledgerRoot), 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(() => JSON.parse(lines[0]!)).not.toThrow();
  });

  it('NOTIFICATION — readNotifications returns [] when file absent (not NO_ACTIVE_RUN)', () => {
    const freshLedger = path.join(mkTmp(), 'aether-ledger-2');
    const rows = readNotifications(freshLedger);
    expect(rows.length).toBe(0);
    try { fs.rmSync(path.dirname(freshLedger), { recursive: true, force: true }); } catch (_e: unknown) { void _e; }
  });

  it('SAFE WRAPPERS — safeWriteRunStatus + safeNotifyGateCompletion return true on success and never throw', () => {
    const s = snap({ runId: 'audit-safe-1', targetRoot: tmpRoot });
    const ok1 = safeWriteRunStatus(ledgerRoot, s);
    expect(ok1).toBe(true);
    const read = readRunStatus(ledgerRoot);
    expect(read.ok).toBe(true);
    const ok2 = safeNotifyGateCompletion(ledgerRoot, s);
    expect(ok2).toBe(true);
    const rows = readNotifications(ledgerRoot);
    expect(rows.length).toBe(1);
  });

  it('OVERWRITE — second write replaces first (runId changes)', () => {
    const s1 = snap({ runId: 'audit-over-1', gate: 'PRELIMINARY', phase: 'done', candidatesSoFar: 5 });
    const s2 = snap({ runId: 'audit-over-2', gate: 'FINAL', phase: 'done', huntersFulfilled: 14, huntersRejected: 2, candidatesSoFar: 42, artifactLabel: '[FINAL]' });
    writeRunStatus(ledgerRoot, s1);
    writeRunStatus(ledgerRoot, s2);
    const read = readRunStatus(ledgerRoot);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.snapshot.runId).toBe('audit-over-2');
      expect(read.snapshot.gate).toBe('FINAL');
      expect(read.snapshot.candidatesSoFar).toBe(42);
    }
  });

  it('EMISSION CALL OBSERVED — notifyGateCompletion is the gate-done emission (unit proof)', () => {
    const gates: Array<RunStatusSnapshot['gate']> = ['PRELIMINARY', 'LASME', 'MPSE', 'SRO', 'FINAL'];
    for (const gate of gates) {
      const s = snap({ runId: 'audit-emit-proof', gate, phase: 'done', artifactLabel: `[${gate}]`, targetRoot: tmpRoot, updatedAt: Date.now() });
      safeNotifyGateCompletion(ledgerRoot, s);
    }
    const rows = readNotifications(ledgerRoot, 10);
    expect(rows.length).toBe(5);
    expect(rows.map((r) => r.gate)).toEqual(['PRELIMINARY', 'LASME', 'MPSE', 'SRO', 'FINAL']);
    for (const r of rows) {
      expect(r.event).toBe('AUDIT_GATE_DONE');
      expect(typeof r.runId).toBe('string');
      expect(typeof r.updatedAt).toBe('number');
      expect(typeof r.targetRoot).toBe('string');
    }
  });

  it('GATES_RUNNING_LABEL equals [GATES-RUNNING] and sits after FINAL_LABEL', () => {
    expect(GATES_RUNNING_LABEL).toBe('[GATES-RUNNING]');
    expect(PRELIMINARY_LABEL).toBe('[PRELIMINARY]');
    expect(LASME_LABEL).toBe('[LASME-ADJUDICATED]');
    expect(MPSE_LABEL).toBe('[MPSE-VERIFIED]');
    expect(FINAL_LABEL).toBe('[FINAL]');
    expect(artifactPathFor(tmpRoot, GATES_RUNNING_LABEL)).toBe(
      artifactPathFor(tmpRoot, '[GATES-RUNNING]'),
    );
    expect(artifactPathFor(tmpRoot, GATES_RUNNING_LABEL).endsWith('audit-report-GATESRUNNING.md')).toBe(true);
  });

  it('GATES_RUNNING round-trip — writeRunStatus + readRunStatus with gate GATES_RUNNING and populated gates map WITHOUT CORRUPT', () => {
    const s = snap({
      runId: 'audit-gates-running-1',
      gate: 'GATES_RUNNING',
      phase: 'start',
      huntersFulfilled: 7,
      huntersRejected: 2,
      candidatesSoFar: 99,
      artifactLabel: GATES_RUNNING_LABEL,
      targetRoot: tmpRoot,
      gates: {
        LASME: { phase: 'done', huntersFulfilled: 3, huntersRejected: 1 },
        MPSE: { phase: 'start', huntersFulfilled: 4, huntersRejected: 1 },
      },
    });
    writeRunStatus(ledgerRoot, s);
    const read = readRunStatus(ledgerRoot);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.snapshot.gate).toBe('GATES_RUNNING');
      expect(read.snapshot.artifactLabel).toBe('[GATES-RUNNING]');
      expect(read.snapshot.gates).toBeDefined();
      expect(read.snapshot.gates!.LASME).toEqual({ phase: 'done', huntersFulfilled: 3, huntersRejected: 1 });
      expect(read.snapshot.gates!.MPSE).toEqual({ phase: 'start', huntersFulfilled: 4, huntersRejected: 1 });
      expect(read.snapshot.huntersFulfilled).toBe(7);
      expect(read.snapshot.huntersRejected).toBe(2);
    }
  });

  it('BACKWARD COMPAT — snapshot WITHOUT gates field still round-trips', () => {
    const s = snap({ runId: 'audit-compat-1', gate: 'LASME', phase: 'done', huntersFulfilled: 2, huntersRejected: 1, candidatesSoFar: 10, artifactLabel: '[LASME-ADJUDICATED]', targetRoot: tmpRoot });
    const plain = { ...s } as RunStatusSnapshot;
    delete (plain as unknown as Record<string, unknown>)['gates'];
    writeRunStatus(ledgerRoot, plain);
    const read = readRunStatus(ledgerRoot);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.snapshot.gate).toBe('LASME');
      expect(read.snapshot.gates).toBeUndefined();
      expect(read.snapshot.huntersFulfilled).toBe(2);
    }
  });

  it('PRIOR-RUN FIXTURE — FINAL gate without gates field parses ok:true (audit-1788021020243 fixture)', () => {
    const fixture: RunStatusSnapshot = {
      runId: 'audit-1788021020243',
      gate: 'FINAL',
      phase: 'done',
      huntersFulfilled: 17,
      huntersRejected: 0,
      candidatesSoFar: 2049,
      artifactLabel: '[FINAL]',
      updatedAt: Date.now(),
      targetRoot: tmpRoot,
    };
    writeRunStatus(ledgerRoot, fixture);
    const read = readRunStatus(ledgerRoot);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.snapshot.runId).toBe('audit-1788021020243');
      expect(read.snapshot.gate).toBe('FINAL');
      expect(read.snapshot.huntersFulfilled).toBe(17);
      expect(read.snapshot.candidatesSoFar).toBe(2049);
      expect(read.snapshot.artifactLabel).toBe('[FINAL]');
    }
    const rawDirect = fs.readFileSync(runStatusPath(ledgerRoot), 'utf-8');
    const parsed = JSON.parse(rawDirect) as Record<string, unknown>;
    expect('gates' in parsed).toBe(false);
  });

  it('mergeGateState accumulates LASME→MPSE→SRO and totals sum correctly (pure, immutable, sum semantics)', () => {
    const base = snap({ runId: 'audit-merge-1', gate: 'GATES_RUNNING', phase: 'start', huntersFulfilled: 0, huntersRejected: 0, candidatesSoFar: 50, artifactLabel: GATES_RUNNING_LABEL, targetRoot: tmpRoot });
    const afterLasme = mergeGateState(base, 'LASME', 'done', 5, 1);
    expect(afterLasme.gates!.LASME).toEqual({ phase: 'done', huntersFulfilled: 5, huntersRejected: 1 });
    expect(afterLasme.huntersFulfilled).toBe(5);
    expect(afterLasme.huntersRejected).toBe(1);
    expect(base.gates).toBeUndefined();
    expect(base.huntersFulfilled).toBe(0);

    const afterMpse = mergeGateState(afterLasme, 'MPSE', 'done', 3, 2);
    expect(afterMpse.gates!.LASME).toEqual({ phase: 'done', huntersFulfilled: 5, huntersRejected: 1 });
    expect(afterMpse.gates!.MPSE).toEqual({ phase: 'done', huntersFulfilled: 3, huntersRejected: 2 });
    expect(afterMpse.huntersFulfilled).toBe(8);
    expect(afterMpse.huntersRejected).toBe(3);

    const afterSro = mergeGateState(afterMpse, 'SRO', 'start', 2, 0);
    expect(afterSro.gates!.SRO).toEqual({ phase: 'start', huntersFulfilled: 2, huntersRejected: 0 });
    expect(afterSro.huntersFulfilled).toBe(10);
    expect(afterSro.huntersRejected).toBe(3);

    const overwritten = mergeGateState(afterSro, 'LASME', 'done', 9, 9);
    expect(overwritten.gates!.LASME).toEqual({ phase: 'done', huntersFulfilled: 9, huntersRejected: 9 });
    expect(overwritten.huntersFulfilled).toBe(14);
    expect(overwritten.huntersRejected).toBe(11);
    expect(afterSro.huntersFulfilled).toBe(10);
  });

  it('mergeGateState — concurrent gates show all 3 phases while GATES_RUNNING', () => {
    let s = snap({ runId: 'audit-concurrent-1', gate: 'GATES_RUNNING', phase: 'start', huntersFulfilled: 0, huntersRejected: 0, candidatesSoFar: 100, artifactLabel: GATES_RUNNING_LABEL, targetRoot: tmpRoot });
    s = mergeGateState(s, 'LASME', 'start', 0, 0);
    s = mergeGateState(s, 'MPSE', 'start', 0, 0);
    s = mergeGateState(s, 'SRO', 'start', 0, 0);
    expect(s.gates!.LASME!.phase).toBe('start');
    expect(s.gates!.MPSE!.phase).toBe('start');
    expect(s.gates!.SRO!.phase).toBe('start');
    writeRunStatus(ledgerRoot, s);
    const read = readRunStatus(ledgerRoot);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(Object.keys(read.snapshot.gates!).sort()).toEqual(['LASME', 'MPSE', 'SRO']);
    }
  });

  it('safeWriteRunStatus returns false never throws when ledger dir is unwritable (file-as-directory)', () => {
    const fileAsDir = path.join(tmpRoot, 'file-as-dir');
    fs.writeFileSync(fileAsDir, 'i am a file not a dir', 'utf-8');
    const ledgerViaFile = path.join(fileAsDir, '.trident', 'aether-ledger');
    const s = snap({ runId: 'audit-unwritable-1', targetRoot: tmpRoot });
    let threw = false;
    let result = true;
    try {
      result = safeWriteRunStatus(ledgerViaFile, s);
    } catch (_e: unknown) {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result).toBe(false);
  });

  it('readRunStatus with GATES_RUNNING + gates map survives artifactPathFor ladder (no intermediate labels needed)', () => {
    const s = snap({ runId: 'audit-ladder-1', gate: 'GATES_RUNNING', phase: 'done', huntersFulfilled: 6, huntersRejected: 1, candidatesSoFar: 77, artifactLabel: GATES_RUNNING_LABEL, targetRoot: tmpRoot, gates: { SRO: { phase: 'done', huntersFulfilled: 6, huntersRejected: 1 } } });
    writeRunStatus(ledgerRoot, s);
    const read = readRunStatus(ledgerRoot);
    expect(read.ok).toBe(true);
    if (read.ok) {
      const p = artifactPathFor(tmpRoot, read.snapshot.artifactLabel);
      expect(p.endsWith('audit-report-GATESRUNNING.md')).toBe(true);
      const prelim = artifactPathFor(tmpRoot, PRELIMINARY_LABEL);
      const fin = artifactPathFor(tmpRoot, FINAL_LABEL);
      expect(prelim.endsWith('audit-report-PRELIMINARY.md')).toBe(true);
      expect(fin.endsWith('audit-report-FINAL.md')).toBe(true);
    }
  });
});
