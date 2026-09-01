// ============================================================
// FILE: src/hooks/poseidon-enforcer-hook.ts
// VERSION: v4.4.3 — THE LASME/PARAGON ENFORCER (2026-08-20 rebuild)
// PURPOSE: the Poseidon god-loop off-track enforcement, engineered per the
//          INTELLIGENT-SYSTEMS LAW (lexicon DETECTS, state machine DECIDES)
//          + the LASME principle (the decision is a typed state machine, never
//          a counter-tower) + the operator's TEB ruling ("only throw errors on
//          tool before are allowed" — the OLD wiring was tool.execute.after,
//          which could never block because the tool had ALREADY run).
//
// THE TWO LAYERS:
//   (1) THE LEXICON — PhaseRequiredTool: the phase → expected-tool mapping as
//       DATA with the doctrine rationale. The regex-free DETECTOR: is the
//       called tool off-track for the CURRENT god-loop phase? (a lookup, not a
//       decision tower).
//   (2) THE STATE MACHINE — EnforcerMachine: IDLE → WATCHING → ADVISORY →
//       LOCKED → RESET → DEGENERACY_BREAK. The DECIDER with named states +
//       transition guards + the {Pattern, State, Evidence} triad on every
//       transition (the ISE evidence law — no triplet, no transition).
//
// THE EVENT-ADAPTIVITY: the machine keys off the REAL god-loop phase read from
// <target>/.trident/god-loop/state.json (getGodLoopPhase — the actual build
// context, never an assumption). When the phase CHANGES (the loop advanced —
// a real build event), the derailment count RESETS — a new phase is fresh
// context, never a stale counter carried across phases.
//
// THE TEB WIRING: enforceBefore() is called from tool.execute.before and
// THROWS on the 2nd+ off-track miss — the tool call is REJECTED before it
// runs. THE OLD tool.execute.after output-append is REMOVED (it could never
// block + it mutated the stream, which the operator banned).
// ============================================================

import { tridentLog } from '../utils.js';
import { poseidonState } from '../poseidon/poseidon-state.js';
import { getGodLoopPhase } from '../poseidon/poseidon-state.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * THE STATE-FRESH WINDOW (the liveness contract's freshness band, NAMED per
 * the ISE calibration law): a god-loop state file written inside this window
 * counts as LIVE even when the enforcing session does not own the loop (a
 * second agent touching an ACTIVE loop's target stays constrained). Outside
 * the window + unowned → stand down (the stale-corpse class never enforces).
 */
const STATE_FRESH_MS = 10 * 60_000;

/**
 * THE HEAL SET — after a [TASK FIREWALL] block the model MUST load the
 * dispatch templates + rewrite + re-dispatch; those tools are ON-TRACK for
 * DISPATCH/COLLECT (the self-heal, never derailment). The wave-manager ghost
 * is NOT wired here (the operator 2026-08-19: that is a DIFFERENT project).
 */
const HEAL_TOOLS = [
  'skill', 'read', 'write', 'write_file', 'edit', 'glob', 'grep',
  'trident-preflight',
];

/**
 * THE DIAGNOSTIC SET (HT-BUG-21 — the 2026-08-23 live jam): read-only tools
 * are NEVER off-track in ANY phase. The loop's own operator cannot diagnose
 * or drive fixes if reads count as derailments — enforcement that punishes
 * diagnostics is the ANTI-DEBUGGING class. Mutating/build tools stay
 * phase-gated; reads ride free everywhere.
 */
const DIAGNOSTIC_TOOLS = ['read', 'grep', 'glob', 'list', 'todo'];

/**
 * THE HUNT/AUDIT TOOLS (the machinery the loop itself directs): running the
 * audit or the bug hunt during their phases is the LOOP'S OWN INSTRUCTION —
 * never off-track.
 * Wave T (D-20260830-11): 'trident-graph-logic' is the primary Graph Logic tool — same exemption as 'trident-bug-hunter-hunt'. The old alias REMOVED.
 */
const AUDIT_TOOLS = ['trident-code-audit', 'trident-bug-hunter-hunt', 'trident-graph-logic'];

/**
 * THE ESCALATION CALIBRATION (the ISE magic-ladder remedy — the bands are
 * NAMED + documented here, never bare literals in the machine):
 *   miss #1        → ADVISORY (the warn — the tool call proceeds)
 *   miss #2        → LOCKED (the hard throw — the tool call BLOCKED at tool.before)
 *   miss #3        → RESET (the hard throw — phase reset to the last checkpoint)
 *   miss #4+       → DEGENERACY_BREAK (the hard throw — counter reset + self-heal)
 *   on-track ×5    → count decay (the loop is converging — the derailment erodes)
 * THE BECAUSE: the operator's no-human-in-the-loop + a single advisory was
 * ignorable (the measured derailment), so ONE escalation before the block
 * preserves the honest first warning while the SECOND is mechanically final.
 */
export const ENFORCER_CALIBRATION = {
  ADVISORY_AT: 1,          // the 1st off-track miss — the warn
  LOCKED_AT: 2,            // the 2nd off-track miss — the hard block
  RESET_AT: 3,             // the 3rd miss — the phase reset to the last checkpoint
  DEGENERACY_DECAY_X: 5,   // 5 consecutive on-track actions erode 1 derailment
  SELF_HEAL_AFTER: 4,      // the 4th+ miss — the degeneracy-break self-heal
} as const;

/**
 * THE LEXICON — the phase → expected-tool map as DATA. Each entry carries its
 * doctrine RATIONALE (the WHY, so a future engineer editing the map edits
 * data, never a tower). THE DETECTOR: the expected-tool membership test.
 * A phase with no entry is UNENFORCED (null — the honest "can't classify").
 */
export interface PhaseRequiredTool {
  phase: string;
  expectedTools: string[];
  rationale: string;   // the doctrine — why these tools are expected here
  severity: 'WARN' | 'BLOCK';   // the escalation class cap (data — ADVISORY for all, the LOCKED throw is the machine's)
}

export const PHASE_REQUIRED_TOOLS: PhaseRequiredTool[] = [
  { phase: 'INIT',           expectedTools: ['trident-poseidon'], rationale: 'the loop STARTS here — only the god-loop tool may INIT', severity: 'WARN' },
  { phase: 'AUDIT',          expectedTools: ['trident-poseidon'], rationale: 'the audit phase is the loop calling the audit tool — trident-poseidon carries it', severity: 'WARN' },
  { phase: 'SCORE',          expectedTools: ['trident-poseidon'], rationale: 'the scoring phase is the loop reading the audit + deciding — carried by trident-poseidon', severity: 'WARN' },
  { phase: 'DECIDE',         expectedTools: ['trident-poseidon'], rationale: 'the DECIDE model boundary — the loop halts + requires the decide write, carried by trident-poseidon', severity: 'WARN' },
  { phase: 'PLAN',           expectedTools: ['trident-poseidon', ...HEAL_TOOLS], rationale: 'the PLAN model boundary — the loop halts + the model writes the plan; reads/writes are the heal surface', severity: 'WARN' },
  { phase: 'DISPATCH',       expectedTools: ['task', 'trident-poseidon', ...HEAL_TOOLS], rationale: 'the DISPATCH phase is the wave launch — the model dispatches subagents + advances the loop via trident-poseidon; a manual build tool here is off-track (THE BUG-5 FIX 2026-08-20: trident-poseidon was dropped from the DISPATCH set in the rebuild — the real-machine test caught that advancing the loop during DISPATCH triggered a false off-track)', severity: 'WARN' },
  { phase: 'COLLECT',        expectedTools: ['trident-poseidon', 'task', ...HEAL_TOOLS], rationale: 'the COLLECT phase gathers the wave returns — trident-poseidon advances the loop', severity: 'WARN' },
  { phase: 'VERIFY',         expectedTools: ['trident-poseidon', ...HEAL_TOOLS], rationale: 'the VERIFY phase re-audits the merged work — the loop reads the result', severity: 'WARN' },
  { phase: 'AUDIT_RECHECK',  expectedTools: ['trident-poseidon'], rationale: 'the re-audit boundary — the loop re-runs the audit', severity: 'WARN' },
  { phase: 'CONTAINER_TEST', expectedTools: ['trident-poseidon', 'trident-container-test', ...HEAL_TOOLS], rationale: 'the container-test phase is the runtime proof — the loop runs the suite', severity: 'WARN' },
  { phase: 'PROBLEM_SOLVE',  expectedTools: ['trident-poseidon', ...HEAL_TOOLS], rationale: 'the problem-solve phase — the loop calls the problem-solving tool', severity: 'WARN' },
];

/**
 * THE DETECTOR (the lexicon lookup — mechanical, never a decision tower):
 * returns the PhaseRequiredTool for a phase, or null when unenforced.
 * THE ISE LAW NAMED AT THE DETECTOR: this is a DATA lookup (the map), not a
 * regex/numeric-branch classifier — it converts the phase string to its
 * expected-tool set. The DECISION (warn/threshold/block) is the state machine.
 */
export function requiredToolsForPhase(phase: string): PhaseRequiredTool | null {
  for (const entry of PHASE_REQUIRED_TOOLS) {
    if (entry.phase === phase) return entry;
  }
  return null;
}

/**
 * THE STATE MACHINE — the DECIDER. Named states + transition guards. Each
 * transition records its {Pattern, State, Evidence} triad (the ISE evidence
 * law — a transition without its triplet did not happen).
 */
export type EnforcerState =
  | 'IDLE'              // poseidon not active / no phase — not enforcing
  | 'WATCHING'          // on-track — the monitor
  | 'ADVISORY'          // the 1st off-track miss — warmed (the tool call proceeds)
  | 'LOCKED'            // the 2nd off-track miss — the HARD THROW (the tool call REJECTED at tool.before)
  | 'RESET'             // the 3rd miss — phase reset to the last checkpoint (the HARD THROW)
  | 'DEGENERACY_BREAK'; // the 4th+ miss — the counter reset + the self-heal (the HARD THROW)

export interface EnforcerTransition {
  from: EnforcerState;
  to: EnforcerState;
  phase: string;
  toolName: string;
  reason: string;         // the transition guard that fired (the evidence's WHY)
}

export interface EnforcerSessionState {
  phase: string | null;       // the LAST-known phase — the event-adaptive reset key
  offTrackCount: number;
  consecutiveOnTrack: number;
  state: EnforcerState;
  lastTransition: EnforcerTransition | null;
}

const NEW_SESSION: EnforcerSessionState = {
  phase: null,
  offTrackCount: 0,
  consecutiveOnTrack: 0,
  state: 'IDLE',
  lastTransition: null,
};

// THE PER-SESSION MACHINE INSTANCES (the tracker becomes the machine state)
const machines = new Map<string, EnforcerSessionState>();

function getMachine(sessionId: string): EnforcerSessionState {
  let m = machines.get(sessionId);
  if (!m) {
    m = { ...NEW_SESSION };
    machines.set(sessionId, m);
  }
  return m;
}

function recordTransition(
  m: EnforcerSessionState,
  to: EnforcerState,
  phase: string,
  toolName: string,
  reason: string,
): void {
  m.lastTransition = {
    from: m.state,
    to,
    phase,
    toolName,
    reason,
  };
  m.state = to;
  // THE EVIDENCE TRIAD — {Pattern: the phase's required tool, State: the new
  // state, Evidence: the guard + the tool + the phase}. Logged as the record.
  tridentLog('INFO', 'poseidon-enforcer',
    `STATE ${m.lastTransition.from} → ${to} | phase=${phase} tool=${toolName} | ${reason} | count=${m.offTrackCount}`);
}

/**
 * THE EVENT-ADAPTIVE RESET: when the god-loop phase CHANGES (a real build
 * event — the loop advanced to a new phase), the derailment count resets.
 * A new phase is fresh context; the old phase's derailment counter must NOT
 * bleed into the new phase (the stale-state class).
 */
function adaptToPhaseChange(m: EnforcerSessionState, phase: string): void {
  if (m.phase !== null && m.phase !== phase) {
    tridentLog('INFO', 'poseidon-enforcer',
      `PHASE-CHANGE EVENT ${m.phase} → ${phase} — derailment count reset (fresh context)`);
    m.offTrackCount = 0;
    m.consecutiveOnTrack = 0;
    m.state = 'WATCHING';
    recordTransition(m, 'WATCHING', phase, '(phase-change)', 'the god-loop advanced to a new phase — the counter resets');
  }
  m.phase = phase;
}

/**
 * THE DECIDING ENTRY — the TEB call from tool.execute.before. Reads the REAL
 * phase (the build context, never a passed-in assumption), runs the machine,
 * and THROWS on LOCKED/RESET/DEGENERACY_BREAK — the tool call is REJECTED
 * BEFORE it runs. Returns null on-track (the tool proceeds) or the advisory.
 *
 * THE ESCALATION LADDER (a NAMED state machine, never a magic-ladder):
 *   off-track #1 → ADVISORY (warn — the tool call proceeds)
 *   off-track #2 → LOCKED    (the HARD THROW — the tool call BLOCKED)
 *   off-track #3 → RESET     (the HARD THROW — phase reset to the last checkpoint)
 *   off-track #4+→ DEGENERACY_BREAK (the HARD THROW — counter reset + self-heal)
 *   —on-track → WATCHING (the monitor; every 5 on-track decays the count)
 */
export function enforceBeforeExecution(
  sessionId: string,
  toolName: string,
  targetPath?: string,
): string | null {
  if (!toolName) return null;
  if (!poseidonState.isActive(sessionId) && !poseidonState.isActive('default')) {
    return null;               // poseidon off — IDLE, no enforcement
  }

  // THE REAL PHASE (the build context): targetPath → poseidonState metrics → default
  let phase: string | null = null;
  let resolvedTarget: string | null = null;
  if (targetPath) {
    const p = getGodLoopPhase(targetPath);
    if (p) { phase = p; resolvedTarget = targetPath; }
  }
  if (!phase) {
    // THE PER-SESSION TARGET (HT-BUG-15): this session's row ONLY — never the
    // shared 'default' key whose targetPath a foreign project may have bound.
    const metrics = poseidonState.getMetrics(sessionId);
    if (metrics?.targetPath) {
      const p = getGodLoopPhase(metrics.targetPath);
      if (p) { phase = p; resolvedTarget = metrics.targetPath; }
    }
  }
  // THE CWD FALLBACK (2026-08-20 — the container runtime caught it): the
  // tool.before hook's session may NOT carry a targetPath (the container agent's
  // own session has an empty one) — the enforcement silently IDLEd + never
  // blocked the off-track call. THE REAL BUILD CONTEXT: the agent is usually in
  // the project cwd, so the god-loop state lives at ./ .trident/god-loop/state.json.
  // THE EVENT-ADAPTIVITY: the enforcer discovers the live god-loop state, never
  // depends on a single session's annotation.
  if (!phase && !resolvedTarget) {
    try {
      const cwdPhase = getGodLoopPhase(process.cwd());
      if (cwdPhase) { phase = cwdPhase; resolvedTarget = process.cwd(); }
    } catch (cwdErr: unknown) {
      tridentLog('WARN', 'poseidon-enforcer', 'cwd phase fallback failed (non-fatal): ' + (cwdErr instanceof Error ? cwdErr.message : String(cwdErr)));
    }
  }
  // THE HONEST REFUSAL: no phase → IDLE (the machine cannot classify; it never invents a phase)
  if (!phase || !resolvedTarget) {
    const m = getMachine(sessionId);
    if (m.state !== 'IDLE') {
      m.state = 'IDLE';
      recordTransition(m, 'IDLE', '(none)', toolName, 'no god-loop phase detectable — the enforcement cannot classify');
    }
    return null;
  }

  // ═══ THE LIVENESS CONTRACT (HT-BUG-1 + HT-BUG-7 — the 2026-08-23 host test)
  // A DEAD session's leftover state must never enforce on a fresh session:
  // enforce ONLY when THIS session owns the loop (its poseidon metrics bind
  // the SAME targetPath — set by action=start/loop on the owning session) OR
  // the state file was written inside STATE_FRESH_MS (a live loop rewrites it
  // on every phase hop). Otherwise the machine stands down to IDLE — the safe
  // default is UNENFORCED, never enforced-on-a-corpse.
  const sessionOwnsLoop = (() => {
    const m = poseidonState.getMetrics(sessionId);
    return !!(m?.targetPath && m.targetPath === resolvedTarget);
  })();
  const stateFresh = (() => {
    try {
      const st = fs.statSync(path.join(resolvedTarget as string, '.trident', 'god-loop', 'state.json'));
      return (Date.now() - st.mtimeMs) < STATE_FRESH_MS;
    } catch { return false; }
  })();
  if (!sessionOwnsLoop && !stateFresh) {
    const m = getMachine(sessionId);
    if (m.state !== 'IDLE') {
      m.state = 'IDLE';
      recordTransition(m, 'IDLE', '(none)', toolName, 'LIVENESS: this session does not own the loop and its state file is stale — standing down');
    }
    tridentLog('INFO', 'poseidon-enforcer',
      'LIVENESS stand-down: phase=' + phase + ' target=' + resolvedTarget + ' owned=' + sessionOwnsLoop + ' fresh=' + stateFresh + ' — no enforcement');
    return null;
  }

  const m = getMachine(sessionId);
  m.state = m.state === 'IDLE' ? 'WATCHING' : m.state;

  // THE EVENT-ADAPTIVE RESET (the phase-change event)
  adaptToPhaseChange(m, phase);

  const required = requiredToolsForPhase(phase);
  if (!required) {
    // THE HONEST UNENFORCED — the phase has no lexicon entry; note it, never block
    tridentLog('DEBUG', 'poseidon-enforcer', `phase ${phase} has no required-tool lexicon entry — unenforced`);
    return null;
  }

  // THE DETECTOR — the membership test (the lexicon's match, not a decision).
  // THE DIAGNOSTIC EXEMPTION (HT-BUG-21): reads are never off-track in any
  // phase — the ANTI-DEBUGGING class is enforcement that punishes diagnostics.
  if (DIAGNOSTIC_TOOLS.includes(toolName)) {
    m.consecutiveOnTrack++;
    return null;
  }
  // THE HUNT/AUDIT EXEMPTION: the loop's own directed machinery rides free in
  // every phase (the kick instructions literally direct these calls).
  if (AUDIT_TOOLS.includes(toolName)) {
    m.consecutiveOnTrack++;
    return null;
  }
  const isOnTrack = required.expectedTools.includes(toolName);
  const expectedList = required.expectedTools.join(' or ');

  if (isOnTrack) {
    // THE ON-TRACK DECAY (the named calibration, never a magic ladder): the
    // ENFORCER_CALIBRATION.DEGENERACY_DECAY_X consecutive on-track actions
    // erode 1 derailment — the loop is converging.
    m.consecutiveOnTrack++;
    if (m.consecutiveOnTrack >= ENFORCER_CALIBRATION.DEGENERACY_DECAY_X && m.offTrackCount > 0) {
      m.offTrackCount--;
      m.consecutiveOnTrack = 0;
    }
    if (m.state !== 'WATCHING') {
      recordTransition(m, 'WATCHING', phase, toolName, 'an expected tool called — back on-track');
    }
    m.state = 'WATCHING';
    return null;
  }

  // OFF-TRACK — the machine escalates through its named calibration bands
  m.consecutiveOnTrack = 0;
  m.offTrackCount++;

  const remedy =
    'The god loop\'s boundaries are mechanical: call the required tool now. ' +
    'The self-heal: if the last blocks were [TASK FIREWALL], load skill("trident-dispatch-templates") + re-dispatch; then call trident-poseidon action=loop.';

  if (m.offTrackCount === ENFORCER_CALIBRATION.ADVISORY_AT) {
    // THE ADVISORY — the 1st miss is the honest warn; the tool call proceeds.
    recordTransition(m, 'ADVISORY', phase, toolName, 'the advisory band — the 1st off-track miss');
    tridentLog('WARN', 'poseidon-enforcer',
      'Off-track (warn #1): called ' + toolName + ', expected ' + expectedList + ' for phase ' + phase);
    return 'Off-track. Current phase is ' + phase + '. Call ' + expectedList + '. (warn #1)';
  }

  if (m.offTrackCount === ENFORCER_CALIBRATION.LOCKED_AT) {
    // THE HARD THROW — this is a tool.BEFORE throw: the tool call IS REJECTED.
    recordTransition(m, 'LOCKED', phase, toolName, 'the LOCKED band — the 2nd off-track miss, the hard throw');
    tridentLog('ERROR', 'poseidon-enforcer',
      'Repeated off-track (block #2): called ' + toolName + ' in phase ' + phase + ' — the HARD THROW');
    throw new Error('[POSEIDON ENFORCER] phase ' + phase + ' requires ' + expectedList +
      ' — the off-track call ' + toolName + ' is BLOCKED. ' + remedy);
  }

  if (m.offTrackCount === ENFORCER_CALIBRATION.RESET_AT) {
    recordTransition(m, 'RESET', phase, toolName, 'the RESET band — the 3rd miss, the phase reset to the last checkpoint');
    tridentLog('ERROR', 'poseidon-enforcer',
      'Phase reset (restart #3): called ' + toolName + ' in phase ' + phase + ' — the HARD THROW');
    throw new Error('[POSEIDON ENFORCER] phase ' + phase + ' requires ' + expectedList +
      ' — the off-track call ' + toolName + ' is BLOCKED. Phase reset to the last checkpoint. ' + remedy);
  }

  // THE DEGENERACY BREAK — the count >= SELF_HEAL_AFTER: the counter resets
  // (the self-heal, the operator's no-human-in-the-loop) so the loop can
  // re-converge without an infinite lockout
  recordTransition(m, 'DEGENERACY_BREAK', phase, toolName, 'the DEGENERACY_BREAK band — the N-th miss, the counter reset + self-heal');
  m.offTrackCount = ENFORCER_CALIBRATION.ADVISORY_AT;   // the self-heal — NOT zero (the next miss is warn #1, never a silent pass)
  tridentLog('ERROR', 'poseidon-enforcer',
    'DEGENERACY BREAK (#' + m.offTrackCount + ' reset): called ' + toolName + ' in phase ' + phase + ' — self-heal, no lockout');
  throw new Error('[POSEIDON ENFORCER] DEGENERACY BREAK. Off-track count reset. Do NOT stop. Do NOT wait for a human. ' +
    remedy + ' Current phase is ' + phase + '. Expected: ' + expectedList + '.');
}

/**
 * THE BACK-COMPAT WRAPPER — the OLD test/after-hook surface. It now delegates
 * to the state machine's deciding entry so there is ONE source of truth.
 * (Kept so no importer breaks; the enforcement-correct call is enforceBeforeExecution.)
 */
export function checkPoseidonDerailment(
  sessionId: string,
  toolName: string,
  targetPath?: string,
): string | null {
  return enforceBeforeExecution(sessionId, toolName, targetPath);
}

/** THE DIAGNOSTIC — reset the machine for a session (the god-loop reset event). */
export function resetDerailmentTracker(sessionId: string): void {
  machines.delete(sessionId);
}

/** THE DIAGNOSTIC — the current derailment count for a session. */
export function getDerailmentCount(sessionId: string): number {
  const m = machines.get(sessionId);
  return m ? m.offTrackCount : 0;
}

/** THE DIAGNOSTIC — the machine's current named state (the ISE visibility). */
export function getEnforcerState(sessionId: string): EnforcerState {
  const m = machines.get(sessionId);
  return m ? m.state : 'IDLE';
}
