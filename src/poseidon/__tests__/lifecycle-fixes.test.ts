// ═══ THE LIFECYCLE + LIVENESS BATTERY (the 2026-08-23 fix wave) ═══
// Each test pins one HT-BUG fix — the mutation law: the test FAILS if the fix
// is reverted.
//   HT-BUG-2: abort writes the TERMINAL phase to the enforcer's source of truth
//   HT-BUG-6: a terminal phase is fresh-startable (resetToInit)
//   HT-BUG-1+7: the enforcer's liveness contract (unowned + stale → stand down)
//   HT-BUG-3a: the detector's OFF-signal proximity gate
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { godLoopOrchestrator } from '../god-loop.js';
import { enforceBeforeExecution, resetDerailmentTracker } from '../../hooks/poseidon-enforcer-hook.js';
import { poseidonState } from '../poseidon-state.js';
import { PoseidonDetector } from '../../warheads/nlp-pipeline/poseidon-detector.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-'));
const STATE_DIR = path.join(TMP, '.trident', 'god-loop');
const STATE_PATH = path.join(STATE_DIR, 'state.json');

function writeState(phase: string, ageMs = 0): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const state = {
    phase, cycle: 0, wave: 0, score: 0, highestScore: 0,
    targetPath: '', snapshotHash: '', preAuditFindings: [], postAuditFindings: [],
    waveManifest: null, stalledSince: 0, lastWaveResult: 'PENDING',
    sessionStart: Date.now(), evidenceRootHash: '',
    phaseRepeatCount: 0, problemSolveCount: 0,
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  if (ageMs > 0) {
    const old = new Date(Date.now() - ageMs);
    fs.utimesSync(STATE_PATH, old, old);
  }
}

function readPhase(): string {
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')).phase;
}

describe('HT-BUG-2 — markAborted writes the terminal phase', () => {
  it('a DISPATCH state becomes FAILED after markAborted', () => {
    writeState('DISPATCH');
    godLoopOrchestrator.markAborted(TMP);
    expect(readPhase()).toBe('FAILED');
  });
  it('a PASS state is never clobbered by markAborted', () => {
    writeState('PASS');
    godLoopOrchestrator.markAborted(TMP);
    expect(readPhase()).toBe('PASS');
  });
  it('a missing state file is a no-op (no crash)', () => {
    fs.rmSync(STATE_PATH, { force: true });
    godLoopOrchestrator.markAborted(TMP);
    expect(fs.existsSync(STATE_PATH)).toBe(false);
  });
});

describe('HT-BUG-6 — resetToInit makes terminals fresh-startable', () => {
  it('FAILED re-inits to INIT', () => {
    writeState('FAILED');
    godLoopOrchestrator.resetToInit(TMP);
    expect(readPhase()).toBe('INIT');
  });
  it('PASS re-inits to INIT', () => {
    writeState('PASS');
    godLoopOrchestrator.resetToInit(TMP);
    expect(readPhase()).toBe('INIT');
  });
});

describe('HT-BUG-1+7 — the enforcer liveness contract', () => {
  const SESSION = 'lifecycle-test-session';
  beforeEach(() => {
    resetDerailmentTracker(SESSION);
    poseidonState.setBaseDir(TMP);
    poseidonState.activate(SESSION);
    poseidonState.setTargetPath(SESSION, path.join(os.tmpdir(), 'unrelated-' + SESSION));
  });
  afterEach(() => {
    poseidonState.deactivate(SESSION);
  });

  it('an UNOWNED + STALE (>10min) state stands down — bash proceeds', () => {
    writeState('DISPATCH', /* stale by */ 11 * 60_000);
    // the tool call carries targetPath=TMP (the agent is working in that dir)
    // but this session's metrics bind a DIFFERENT path — unowned + stale
    const verdict = enforceBeforeExecution(SESSION, 'bash', TMP);
    expect(verdict === null || verdict === undefined).toBe(true);   // no advisory, no throw — the corpse never enforces
  });

  it('an UNOWNED but FRESH state still enforces (a second agent touching an active loop)', () => {
    writeState('DISPATCH');   // fresh mtime
    let threw = false;
    try {
      // miss #1 advisory, miss #2 throws — drive two calls
      enforceBeforeExecution(SESSION, 'bash', TMP);
      enforceBeforeExecution(SESSION, 'bash', TMP);
    } catch { threw = true; }
    expect(threw).toBe(true);   // the fresh active loop constrains foreign sessions
  });
});

describe('HT-BUG-3a — the detector proximity gate', () => {
  const detector = new PoseidonDetector();
  it('diagnostic prose with FAR-FROM-poseidon OFF verbs does NOT deactivate', () => {
    // the phantom-deactivation class: engineering prose mentioning abort/block
    // MORE THAN SIGNAL_PROXIMITY chars after the single "poseidon" mention
    // must not flip the mode
    const text = 'poseidon: investigating the full dispatch boundary of this build cycle carefully today. The abort handler never wrote its terminal marker and bash stayed blocked.';
    expect(detector.detect(text).action).not.toBe('deactivate');
  });
  it('"stop poseidon" still deactivates (the verb adjacent to the name)', () => {
    expect(detector.detect('stop poseidon now').action).toBe('deactivate');
  });
  it('"poseidon mode activate" still activates', () => {
    expect(detector.detect('poseidon mode activate').action).toBe('activate');
  });
});
