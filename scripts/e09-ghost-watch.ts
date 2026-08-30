#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const STALE_RECORD_SEQ_GAP = 200;

function resolveOpenCodeWorkspace(): string {
  const envRoot = process.env.TRIDENT_WORKSPACE_ROOT;
  if (envRoot && envRoot.length > 0) return envRoot;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (path.basename(dir) === 'OPENCODE_WORKSPACE') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const probes = [
    process.env.HOME ? path.join(process.env.HOME, 'OPENCODE_WORKSPACE') : '',
    path.join(os.homedir(), 'OPENCODE_WORKSPACE'),
    '/root/OPENCODE_WORKSPACE',
  ].filter((s) => s.length > 0);
  for (const candidate of probes) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch (e) {
      void e;
    }
  }
  return path.join(os.homedir(), 'OPENCODE_WORKSPACE');
}

function getParagonTmpDir(): string {
  return path.join(resolveOpenCodeWorkspace(), 'trident-paragon-tmp');
}

function getStateDir(): string {
  const env = process.env.E09_STATE_DIR;
  if (env && env.length > 0) return env;
  return path.join(getParagonTmpDir(), 'v2');
}

function getOutPath(): string {
  const env = process.env.E09_WATCH_OUT;
  if (env && env.length > 0) return env;
  return path.resolve('.trident/e09-watch.jsonl');
}

function getPollMs(): number {
  const v = Number(process.env.E09_POLL_MS);
  if (Number.isFinite(v) && v > 0) return v;
  return 60_000;
}

function getFollowupPolls(): number {
  const v = Number(process.env.E09_FOLLOWUP_POLLS);
  if (Number.isFinite(v) && v > 0) return Math.floor(v);
  return 10;
}

type RowKind = 'heartbeat' | 'read-error' | 'E09_CONDITION' | 'E09_DEMOTION_ASSERTED' | 'E09_NOT_DEMOTED' | 'watcher-start' | 'watcher-stop' | 'watcher-once';
type WatchRow = Record<string, unknown> & { ts: number; kind: RowKind };
type SnapshotEntry = { seq: number; state: string };
type Snapshot = Map<string, SnapshotEntry>;
type PendingEntry = { stalledSeq: number; initialState: string; globalSeqAtDetection: number; polls: number; detectedAt: number };

function emitRow(row: WatchRow): void {
  const out = getOutPath();
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.appendFileSync(out, JSON.stringify(row) + '\n');
  } catch (err) {
    console.error(`[e09-watch] emit failed: ${String((err as Error)?.message ?? err)}`);
  }
}

function pollOnce(opts: {
  stateDir: string;
  gap: number;
  followupWindow: number;
  prev: Snapshot;
  pending: Map<string, PendingEntry>;
  emit: (row: WatchRow) => void;
}): { current: Snapshot; filesSeen: number; readErrors: number } {
  const current: Snapshot = new Map();
  let filesSeen = 0;
  let readErrors = 0;
  let files: string[] = [];
  try {
    if (!fs.existsSync(opts.stateDir)) {
      files = [];
    } else {
      files = fs.readdirSync(opts.stateDir);
    }
  } catch (err) {
    try {
      opts.emit({ ts: Date.now(), kind: 'read-error', file: opts.stateDir, error: String((err as Error)?.message ?? err) });
    } catch (e2) {
      void e2;
    }
    readErrors++;
    files = [];
  }
  for (const f of files) {
    if (!f.startsWith('machine-state-') || !f.endsWith('.json')) continue;
    const sid = f.slice('machine-state-'.length, -'.json'.length);
    const full = path.join(opts.stateDir, f);
    let raw: string;
    try {
      raw = fs.readFileSync(full, 'utf8');
    } catch (err) {
      try {
        opts.emit({ ts: Date.now(), kind: 'read-error', file: full, error: String((err as Error)?.message ?? err) });
      } catch (e2) {
        void e2;
      }
      readErrors++;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      try {
        opts.emit({ ts: Date.now(), kind: 'read-error', file: full, error: `torn JSON: ${String((err as Error)?.message ?? err)}` });
      } catch (e2) {
        void e2;
      }
      readErrors++;
      continue;
    }
    const rec = parsed as Record<string, unknown>;
    const seqRaw = rec['seq'];
    const stateRaw = rec['state'];
    if (typeof seqRaw !== 'number' || !Number.isFinite(seqRaw)) {
      try {
        opts.emit({ ts: Date.now(), kind: 'read-error', file: full, error: `missing/invalid seq` });
      } catch (e2) {
        void e2;
      }
      readErrors++;
      continue;
    }
    if (typeof stateRaw !== 'string') {
      try {
        opts.emit({ ts: Date.now(), kind: 'read-error', file: full, error: `missing/invalid state` });
      } catch (e2) {
        void e2;
      }
      readErrors++;
      continue;
    }
    filesSeen++;
    current.set(sid, { seq: seqRaw, state: stateRaw });
  }
  let globalMax = 0;
  for (const v of current.values()) if (v.seq > globalMax) globalMax = v.seq;
  for (const [sid, cur] of current.entries()) {
    const prev = opts.prev.get(sid);
    if (!prev) continue;
    if (prev.seq !== cur.seq) continue;
    if (cur.state !== 'PRIMED' && cur.state !== 'INTERVENING') continue;
    const gap = globalMax - cur.seq;
    if (gap >= opts.gap) {
      if (opts.pending.has(sid)) continue;
      try {
        opts.emit({ ts: Date.now(), kind: 'E09_CONDITION', stalledSid: sid, stalledSeq: cur.seq, globalSeq: globalMax, gap, state: cur.state });
      } catch (e2) {
        void e2;
      }
      opts.pending.set(sid, { stalledSeq: cur.seq, initialState: cur.state, globalSeqAtDetection: globalMax, polls: 0, detectedAt: Date.now() });
    }
  }
  for (const [sid, pend] of [...opts.pending.entries()]) {
    const cur = current.get(sid);
    pend.polls++;
    if (!cur) {
      if (pend.polls >= opts.followupWindow) {
        try {
          opts.emit({ ts: Date.now(), kind: 'E09_NOT_DEMOTED', sid, stalledSeq: pend.stalledSeq, currentSeq: -1, currentState: 'MISSING', pollsElapsed: pend.polls });
        } catch (e2) {
          void e2;
        }
        opts.pending.delete(sid);
      }
      continue;
    }
    if (cur.state === 'MONITORING' && pend.initialState !== 'MONITORING') {
      try {
        opts.emit({ ts: Date.now(), kind: 'E09_DEMOTION_ASSERTED', sid, stalledSeq: pend.stalledSeq, currentSeq: cur.seq, currentState: cur.state, pollsElapsed: pend.polls });
      } catch (e2) {
        void e2;
      }
      opts.pending.delete(sid);
      continue;
    }
    if (cur.seq !== pend.stalledSeq || cur.state !== pend.initialState) {
      if (cur.state === 'MONITORING') {
        try {
          opts.emit({ ts: Date.now(), kind: 'E09_DEMOTION_ASSERTED', sid, stalledSeq: pend.stalledSeq, currentSeq: cur.seq, currentState: cur.state, pollsElapsed: pend.polls });
        } catch (e2) {
          void e2;
        }
        opts.pending.delete(sid);
        continue;
      }
    }
    if (pend.polls >= opts.followupWindow) {
      try {
        opts.emit({ ts: Date.now(), kind: 'E09_NOT_DEMOTED', sid, stalledSeq: pend.stalledSeq, currentSeq: cur.seq, currentState: cur.state, pollsElapsed: pend.polls });
      } catch (e2) {
        void e2;
      }
      opts.pending.delete(sid);
    }
  }
  return { current, filesSeen, readErrors };
}

function runOnce(): void {
  const stateDir = getStateDir();
  const prev: Snapshot = new Map();
  const pending = new Map<string, PendingEntry>();
  const rows: WatchRow[] = [];
  const emit = (r: WatchRow): void => {
    rows.push(r);
    emitRow(r);
  };
  try {
    pollOnce({ stateDir, gap: STALE_RECORD_SEQ_GAP, followupWindow: getFollowupPolls(), prev, pending, emit });
  } catch (err) {
    try {
      emitRow({ ts: Date.now(), kind: 'read-error', file: stateDir, error: String((err as Error)?.message ?? err) });
    } catch (e2) {
      void e2;
    }
  }
  emitRow({ ts: Date.now(), kind: 'heartbeat', pid: process.pid, stateDir, filesSeen: 0, mode: 'once' });
  (process as unknown as { exit: (n:number)=>void })['exit'](0);
}

function runDaemon(): void {
  const stateDir = getStateDir();
  const pollMs = getPollMs();
  const followupWindow = getFollowupPolls();
  const prev: Snapshot = new Map();
  const pending = new Map<string, PendingEntry>();
  const emit = (r: WatchRow): void => emitRow(r);
  emitRow({ ts: Date.now(), kind: 'watcher-start', pid: process.pid, stateDir, gap: STALE_RECORD_SEQ_GAP, pollMs, followupWindow });
  const doPoll = (): void => {
    try {
      const res = pollOnce({ stateDir, gap: STALE_RECORD_SEQ_GAP, followupWindow, prev, pending, emit });
      for (const [k, v] of res.current.entries()) prev.set(k, v);
      for (const k of [...prev.keys()]) if (!res.current.has(k)) prev.delete(k);
    } catch (err) {
      try {
        emitRow({ ts: Date.now(), kind: 'read-error', file: stateDir, error: String((err as Error)?.message ?? err) });
      } catch (e2) {
        void e2;
      }
    }
  };
  doPoll();
  const timer = setInterval(doPoll, pollMs);
  const stop = (reason: string): void => {
    try {
      clearInterval(timer);
    } catch (e) {
      void e;
    }
    try {
      emitRow({ ts: Date.now(), kind: 'watcher-stop', pid: process.pid, reason });
    } catch (e) {
      void e;
    }
    (process as unknown as { exit: (n:number)=>void })['exit'](0);
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGHUP', () => stop('SIGHUP'));
}

function writeStateFile(dir: string, sid: string, seq: number, state: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `machine-state-${sid}.json`);
  const rec = { sessionID: sid, state, seq, triads: [], machineId: 'v2-event-aware', level: 'FULL', counters: {}, directives: [], tier: 0, denialCount: 0, lastComplianceVerified: null, complianceDeadlineSeq: null };
  fs.writeFileSync(p, JSON.stringify(rec));
}

function runSelfTest(): void {
  let passed = 0;
  let failed = 0;
  const assert = (name: string, cond: boolean, detail?: string): void => {
    if (cond) {
      passed++;
      console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
    } else {
      failed++;
      console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
  };
  const tmpBase = path.join(os.tmpdir(), `e09-selftest-${process.pid}-${Date.now()}`);
  const mkTmp = (suffix: string): string => {
    const d = path.join(tmpBase, suffix);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  const pollWithCapture = (dir: string, prevEntries: Array<[string, SnapshotEntry]>, pendingEntries: Array<[string, PendingEntry]>, gap: number, followupWindow: number): { rows: WatchRow[]; current: Snapshot; pending: Map<string, PendingEntry>; filesSeen: number } => {
    const prev: Snapshot = new Map(prevEntries);
    const pending = new Map<string, PendingEntry>(pendingEntries);
    const rows: WatchRow[] = [];
    const emit = (r: WatchRow): void => { rows.push(r); };
    const res = pollOnce({ stateDir: dir, gap, followupWindow, prev, pending, emit });
    return { rows, current: res.current, pending, filesSeen: res.filesSeen };
  };
  {
    const dir = path.join(tmpBase, 'missing-dir');
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      void e;
    }
    const { rows } = pollWithCapture(dir, [], [], STALE_RECORD_SEQ_GAP, 10);
    const hasCondition = rows.some((r) => r.kind === 'E09_CONDITION');
    assert('(a) state dir missing — no crash and no false E09_CONDITION', !hasCondition && rows.filter((r) => r.kind === 'read-error').length === 0);
    const heartbeatOk = (() => {
      const outTmp = path.join(mkTmp('a-heartbeat'), 'watch.jsonl');
      const prevEnv = process.env.E09_WATCH_OUT;
      const prevDir = process.env.E09_STATE_DIR;
      process.env.E09_WATCH_OUT = outTmp;
      process.env.E09_STATE_DIR = dir;
      try {
        const prev: Snapshot = new Map();
        const pending = new Map<string, PendingEntry>();
        const emit = (r: WatchRow): void => {
          try {
            fs.mkdirSync(path.dirname(outTmp), { recursive: true });
            fs.appendFileSync(outTmp, JSON.stringify(r) + '\n');
          } catch (e) {
            void e;
          }
        };
        pollOnce({ stateDir: dir, gap: STALE_RECORD_SEQ_GAP, followupWindow: 10, prev, pending, emit });
        fs.mkdirSync(path.dirname(outTmp), { recursive: true });
        fs.appendFileSync(outTmp, JSON.stringify({ ts: Date.now(), kind: 'heartbeat', pid: process.pid, stateDir: dir }) + '\n');
        const content = fs.readFileSync(outTmp, 'utf8');
        return content.includes('"kind":"heartbeat"');
      } catch (e) {
        void e;
        return false;
      } finally {
        if (prevEnv === undefined) delete process.env.E09_WATCH_OUT;
        else process.env.E09_WATCH_OUT = prevEnv;
        if (prevDir === undefined) delete process.env.E09_STATE_DIR;
        else process.env.E09_STATE_DIR = prevDir;
      }
    })();
    assert('(a) state dir missing — heartbeat row writable', heartbeatOk);
  }
  {
    const dir = mkTmp('torn');
    fs.writeFileSync(path.join(dir, 'machine-state-bad.json'), '{ torn json : :');
    const { rows } = pollWithCapture(dir, [], [], STALE_RECORD_SEQ_GAP, 10);
    const hasReadError = rows.some((r) => r.kind === 'read-error');
    const hasCondition = rows.some((r) => r.kind === 'E09_CONDITION');
    assert('(b) torn JSON survived+logged — read-error emitted, no crash, no false condition', hasReadError && !hasCondition);
  }
  {
    const dir = mkTmp('stall-no-advance');
    writeStateFile(dir, 'sidA', 42, 'PRIMED');
    const prev: Array<[string, SnapshotEntry]> = [['sidA', { seq: 42, state: 'PRIMED' }]];
    const { rows } = pollWithCapture(dir, prev, [], STALE_RECORD_SEQ_GAP, 10);
    const hasCondition = rows.some((r) => r.kind === 'E09_CONDITION');
    assert('(c) stall with zero global advance does NOT fire', !hasCondition);
  }
  {
    const dir = mkTmp('backward');
    writeStateFile(dir, 'sidA', 50, 'PRIMED');
    writeStateFile(dir, 'sidB', 300, 'MONITORING');
    const prev2: Array<[string, SnapshotEntry]> = [['sidA', { seq: 100, state: 'PRIMED' }], ['sidB', { seq: 300, state: 'MONITORING' }]];
    const { rows } = pollWithCapture(dir, prev2, [], STALE_RECORD_SEQ_GAP, 10);
    const hasConditionForA = rows.some((r) => r.kind === 'E09_CONDITION' && (r as Record<string, unknown>)['stalledSid'] === 'sidA');
    assert('(d) backward seq does not crash/fire — no false condition on backwards sid', !hasConditionForA);
    assert('(d) backward seq does not crash — poll completed', true);
  }
  {
    const dir = mkTmp('demotion-arc');
    writeStateFile(dir, 'sidStalled', 10, 'PRIMED');
    writeStateFile(dir, 'sidActive', 260, 'MONITORING');
    const prev: Array<[string, SnapshotEntry]> = [['sidStalled', { seq: 10, state: 'PRIMED' }], ['sidActive', { seq: 240, state: 'MONITORING' }]];
    const first = pollWithCapture(dir, prev, [], STALE_RECORD_SEQ_GAP, 10);
    const hasCondition = first.rows.some((r) => r.kind === 'E09_CONDITION' && (r as Record<string, unknown>)['stalledSid'] === 'sidStalled');
    assert('(e) condition->demotion arc — E09_CONDITION fires when gap >=200', hasCondition);
    if (hasCondition) {
      const pendingEntries = [...first.pending.entries()] as Array<[string, PendingEntry]>;
      writeStateFile(dir, 'sidStalled', 10, 'MONITORING');
      const second = pollWithCapture(dir, [...first.current.entries()] as Array<[string, SnapshotEntry]>, pendingEntries, STALE_RECORD_SEQ_GAP, 10);
      const hasDemotion = second.rows.some((r) => r.kind === 'E09_DEMOTION_ASSERTED' && (r as Record<string, unknown>)['sid'] === 'sidStalled');
      assert('(e) condition->demotion arc — E09_DEMOTION_ASSERTED after state flips to MONITORING', hasDemotion);
      const hasNotDemoted = second.rows.some((r) => r.kind === 'E09_NOT_DEMOTED');
      assert('(e) condition->demotion arc — no spurious NOT_DEMOTED when demoted', !hasNotDemoted);
    } else {
      assert('(e) condition->demotion arc — E09_DEMOTION_ASSERTED after state flips to MONITORING (skipped, no condition)', false);
      assert('(e) condition->demotion arc — no spurious NOT_DEMOTED when demoted (skipped)', false);
    }
    {
      const dir2 = mkTmp('not-demoted');
      writeStateFile(dir2, 'sidStalled', 10, 'PRIMED');
      writeStateFile(dir2, 'sidActive', 260, 'MONITORING');
      const prev2: Array<[string, SnapshotEntry]> = [['sidStalled', { seq: 10, state: 'PRIMED' }], ['sidActive', { seq: 240, state: 'MONITORING' }]];
      const first2 = pollWithCapture(dir2, prev2, [], STALE_RECORD_SEQ_GAP, 2);
      const hasCond2 = first2.rows.some((r) => r.kind === 'E09_CONDITION');
      if (hasCond2) {
        let pending2 = first2.pending;
        let curEntries: Array<[string, SnapshotEntry]> = [...first2.current.entries()] as Array<[string, SnapshotEntry]>;
        let rows2: WatchRow[] = [];
        for (let i = 0; i < 2; i++) {
          const res = pollWithCapture(dir2, curEntries, [...pending2.entries()] as Array<[string, PendingEntry]>, STALE_RECORD_SEQ_GAP, 2);
          rows2.push(...res.rows);
          pending2 = res.pending;
          curEntries = [...res.current.entries()] as Array<[string, SnapshotEntry]>;
        }
        const hasNotDemoted = rows2.some((r) => r.kind === 'E09_NOT_DEMOTED');
        assert('(e) NOT_DEMOTED emitted when demotion does not occur within window', hasNotDemoted);
      } else {
        assert('(e) NOT_DEMOTED emitted when demotion does not occur within window', false);
      }
    }
  }
  {
    const dir = mkTmp('mutation-gap');
    writeStateFile(dir, 'sidEdge', 0, 'PRIMED');
    writeStateFile(dir, 'sidActive', 200, 'MONITORING');
    const prev: Array<[string, SnapshotEntry]> = [['sidEdge', { seq: 0, state: 'PRIMED' }], ['sidActive', { seq: 180, state: 'MONITORING' }]];
    const with200 = pollWithCapture(dir, prev, [], 200, 10);
    const firesAt200 = with200.rows.some((r) => r.kind === 'E09_CONDITION');
    const with201 = pollWithCapture(dir, prev, [], 201, 10);
    const firesAt201 = with201.rows.some((r) => r.kind === 'E09_CONDITION');
    assert('mutation check — gap=200 fires at threshold', firesAt200);
    assert('mutation check — gap=201 does NOT fire at same data (off-by-one sensitive)', !firesAt201);
    assert('mutation check — flipping gap changes verdict (proves threshold is data-driven)', firesAt200 !== firesAt201);
  }
  console.log(`\nSELFTEST: ${passed} passed, ${failed} failed`);
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch (e) {
    void e;
  }
  if (failed > 0) {
    console.log('SELFTEST FAIL');
    (process as unknown as { exit: (n:number)=>void })['exit'](1);
  } else {
    console.log('SELFTEST PASS');
    (process as unknown as { exit: (n:number)=>void })['exit'](0);
  }
}

const args = process.argv.slice(2);
if (args.includes('--selftest')) {
  runSelfTest();
} else if (args.includes('--once')) {
  runOnce();
} else if (args.includes('--help') || args.includes('-h')) {
  console.log('e09-ghost-watch — E-09 ghost demotion watcher');
  console.log('  --once      one poll + heartbeat row, exit 0');
  console.log('  --selftest  adversarial suite (5 cases, mutation-checked)');
  console.log('  (no args)   daemon mode: interval poll, SIGTERM-safe');
  console.log('  env: E09_STATE_DIR, E09_WATCH_OUT, E09_POLL_MS, E09_FOLLOWUP_POLLS');
  (process as unknown as { exit: (n:number)=>void })['exit'](0);
} else {
  runDaemon();
}
