import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// THE W-PB1 ENFORCER HARD-THROW TEST (the L2 spec §2.2) — THE REAL MACHINE.
// THE RED-TEAM FIX (2026-08-20): the OLD test tested a mock `makeEnforcer()`
// (a theatrical harness), NOT the real hook — the second greatest sin of the
// early-success report. THIS test imports the REAL enforceBeforeExecution from
// poseidon-enforcer-hook.ts and drives the REAL state machine against a REAL
// god-loop state.json on disk. THE CONTRACT: the EnforcerMachine (the LASME
// decider) escalates the named bands — ADVISORY (1st), LOCKED-throw (2nd),
// RESET-throw (3rd), DEGENERACY_BREAK-throw (4th+), ON_TRACK pass-through, and
// the PHASE-CHANGE event resets the derailment count.
import { enforceBeforeExecution, resetDerailmentTracker, getEnforcerState, PHASE_REQUIRED_TOOLS } from '../../hooks/poseidon-enforcer-hook.js';
import { poseidonState } from '../poseidon-state.js';

const SESSION = 'enforcer-test-session';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'enf-'));
// THE HT-BUG-5 FIX (test isolation): the state store anchors to the test's
// tmpdir — the production .trident/poseidon-state/state.json is NEVER
// polluted by this suite (the dbg-sess / s / enforcer-test-session keys
// found live on 2026-08-23 were exactly this leak).
poseidonState.setBaseDir(TMP);

function writePhase(phase: string): void {
  const dir = path.join(TMP, '.trident', 'god-loop');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ phase }, null, 2));
}

function wipePhase(): void {
  const f = path.join(TMP, '.trident', 'god-loop', 'state.json');
  try { fs.rmSync(f, { force: true }); } catch { /* the no-phase state */ }
}

beforeEach(() => {
  resetDerailmentTracker(SESSION);          // the fresh machine per test
  poseidonState.activate(SESSION);          // the enforcement precondition
  poseidonState.setTargetPath(SESSION, TMP);
  wipePhase();                              // no leftover phase from the prior test
});

afterEach(() => {
  poseidonState.deactivate(SESSION);
});

describe('THE POSEIDON ENFORCER HARD-THROW — THE REAL STATE MACHINE (W-PB1, the LASME decider)', () => {
  it('the 1st off-track miss → the ADVISORY (warn), NO throw — the tool proceeds', () => {
    writePhase('DISPATCH');                 // DISPATCH expects task/trident-poseidon + the heal tools
    const msg = enforceBeforeExecution(SESSION, 'read', TMP);   // 'read' is in the heal set for DISPATCH...
    // 'read' IS on-track (the heal set) — to force an OFF-track miss use a tool NOT in any DISPATCH set
    const offTrack = enforceBeforeExecution(SESSION, 'npm', TMP);  // npm is off-track for DISPATCH
    expect(offTrack).toContain('warn #1');
    expect(getEnforcerState(SESSION)).toBe('ADVISORY');
  });

  it('the 2nd off-track miss → THE HARD THROW (the tool call BLOCKED at tool.before)', () => {
    writePhase('DISPATCH');
    enforceBeforeExecution(SESSION, 'npm', TMP);   // miss #1 — the advisory
    expect(() => enforceBeforeExecution(SESSION, 'npm', TMP)).toThrow(/POSEIDON ENFORCER/);  // miss #2 — the THROW
    expect(getEnforcerState(SESSION)).toBe('LOCKED');
  });

  it('the 3rd off-track miss → the phase RESET to the last checkpoint + the throw', () => {
    writePhase('DISPATCH');
    enforceBeforeExecution(SESSION, 'npm', TMP);
    expect(() => enforceBeforeExecution(SESSION, 'npm', TMP)).toThrow(/POSEIDON ENFORCER/);
    expect(() => enforceBeforeExecution(SESSION, 'npm', TMP)).toThrow(/Phase reset to the last checkpoint/);
    expect(getEnforcerState(SESSION)).toBe('RESET');
  });

  it('the 4th+ miss → the DEGENERACY BREAK + the counter reset (the self-heal)', () => {
    writePhase('DISPATCH');
    enforceBeforeExecution(SESSION, 'npm', TMP);
    expect(() => enforceBeforeExecution(SESSION, 'npm', TMP)).toThrow();
    expect(() => enforceBeforeExecution(SESSION, 'npm', TMP)).toThrow();
    expect(() => enforceBeforeExecution(SESSION, 'npm', TMP)).toThrow(/DEGENERACY BREAK/);
    expect(getEnforcerState(SESSION)).toBe('DEGENERACY_BREAK');
  });

  it('the ON_TRACK pass-through — an expected tool NEVER throws', () => {
    writePhase('DISPATCH');
    expect(enforceBeforeExecution(SESSION, 'task', TMP) === null).toBe(true);          // DISPATCH expects task
    expect(enforceBeforeExecution(SESSION, 'trident-poseidon', TMP) === null).toBe(true);
    expect(enforceBeforeExecution(SESSION, 'skill', TMP) === null).toBe(true);         // the heal set
    expect(() => enforceBeforeExecution(SESSION, 'task', TMP)).not.toThrow();
  });

  it('THE PHASE-CHANGE EVENT-ADAPTIVITY — the derailment count RESETS when the god-loop advances to a new phase', () => {
    writePhase('DISPATCH');
    enforceBeforeExecution(SESSION, 'npm', TMP);   // miss #1 (count=1)
    // the god-loop phase ADVANCES (a real build event — the loop moved to VERIFY)
    writePhase('VERIFY');
    // the off-track 'npm' again — the phase CHANGED, so the count resets → this is miss #1 again (advisory, NOT the throw)
    const msg = enforceBeforeExecution(SESSION, 'npm', TMP);
    expect(msg).toContain('warn #1');        // the reset happened — not the #2 throw
    expect(getEnforcerState(SESSION)).toBe('ADVISORY');
  });

  it('THE IDLE REFUSAL — NO phase → not enforced (the machine never invents a phase)', () => {
    // run with the cwd pointed at a FRESH empty dir so the cwd-fallback finds no
    // god-loop state (the project cwd HAS a real state — the cwd-adaptive fallback
    // would classify it, which is correct behavior but not this test's intent)
    const origCwd = process.cwd();
    const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'enf-idle-'));
    process.chdir(emptyCwd);
    try {
      wipePhase();                              // the target's state.json gone
      expect(enforceBeforeExecution(SESSION, 'npm', TMP) === null).toBe(true);
      expect(getEnforcerState(SESSION)).toBe('IDLE');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('THE LEXICON IS DATA — every phase has a required-tool entry (no unenforced phase silently)', () => {
    // the W1-W7 phases the god-loop can reach
    const phases = ['INIT','AUDIT','SCORE','DECIDE','PLAN','DISPATCH','COLLECT','VERIFY','AUDIT_RECHECK','CONTAINER_TEST','PROBLEM_SOLVE'];
    for (const ph of phases) {
      const entry = PHASE_REQUIRED_TOOLS.find((e: { phase: string }) => e.phase === ph);
      expect(entry ? true : false).toBe(true);   // every phase has a lexicon entry (bun: no toBeDefined)
      expect((entry?.expectedTools.length ?? 0) > 0).toBe(true);   // the expected-tool set is non-empty
    }
  });
});
