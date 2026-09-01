/**
 * checkpoint-gate.ts — THE CHECKPOINT FIREWALL (the L2 spec §2.1 — W-PB3)
 *
 * THE OPERATOR'S DIRECTIVE (verbatim): "we need a firewall that protects any
 * and all edits/writes whether tool or command based to ANY filepath that has
 * any variation of /checkpoints until the user explicitly says to save the
 * checkpoint... when i say to save the checkpoint - mandatory step 1 = load
 * the saving-checkpoints skill THEN all write/edit restrictions to the
 * checkpoints path is lifted for 15 minutes after which it auto locks again."
 *
 * THE LEXICON (the DETECTOR — mechanical, never decides): the regex detects
 * the /checkpoints path segment + the save-intent signal. THE ISE LAW NAMED
 * AT THE DETECTOR: the regex DETECTS; the state machine DECIDES the write's
 * fate. A regex that decides is the slop class.
 */
import { tridentLog } from '../utils.js';

// ── THE LEXICON (the DETECTOR — mechanical, never decides) ──
/** THE DETECTOR: any path segment matching /checkpoints/i — covers Checkpoints/,
 * checkpoints/, CHECKPOINTS/, checkpoint/, CheckPoint/ (the case-insensitive) +
 * the nested Checkpoints/subdir/ + the relative ./Checkpoints/ + the absolute
 * /home/.../Checkpoints/. THE DECISION is the state machine's gateWrite. */
export function isCheckpointPath(p: string): boolean {
  return /(^|\/)[^/]*checkpoint[^/]*(\/|$)/i.test(p);
}

/** THE DETECTOR: the operator's explicit save signal — "save the checkpoint",
 * "save checkpoint", "sync the checkpoint", "save the baseline", "checkpoint save". */
export function isSaveIntent(msg: string): boolean {
  const norm = msg.toLowerCase();
  return /save.{0,20}(checkpoint|baseline)/.test(norm)
    || /checkpoint.{0,20}save/.test(norm)
    || /sync.{0,20}checkpoint/.test(norm);   // the "sync the checkpoint" signal — the operator's sync phrasing
}

// ── THE STATE MACHINE (the DECISION layer — LOCKED/UNLOCKING/UNLOCKED) ──
export type CheckpointGateState = 'LOCKED' | 'UNLOCKING' | 'UNLOCKED';

// THE NAMED ERRORS (the loud-fail surface)
export const CHECKPOINT_GATE_ERRORS = {
  LOCKED: 'CHECKPOINT_GATE_LOCKED',               // the write while LOCKED
  SKILL_REQUIRED: 'CHECKPOINT_GATE_SKILL_REQUIRED', // the save intent but the skill not loaded
  TIMEOUT_LOCKED: 'CHECKPOINT_GATE_TIMEOUT_LOCKED', // the 15-min window expired
} as const;

export class CheckpointGate {
  private state: CheckpointGateState = 'LOCKED';
  private unlockedUntil = 0;
  private readonly UNLOCK_WINDOW_MS = 15 * 60 * 1000;  // 15 minutes — THE OPERATOR'S VALUE

  getState(): CheckpointGateState { return this.state; }

  /** THE CHAT.MESSAGE LEXICON ENTRY (the poseidon-firewall mechanics): a
   *  chat.message containing the save intent → the UNLOCKING probe. */
  onChatMessage(message: string): void {
    if (isSaveIntent(message)) {
      this.state = 'UNLOCKING';       // the operator said save — the skill is step 1
      tridentLog('INFO', 'checkpoint-gate', 'save intent detected — UNLOCKING (the skill required)');
    }
  }

  /** THE SKILL-LOAD ENTRY: skill("saving-checkpoints") loaded → UNLOCKED + the 15-min timer. */
  onSkillLoaded(name: string): void {
    if (this.state === 'UNLOCKING' && name === 'saving-checkpoints') {
      this.state = 'UNLOCKED';
      this.unlockedUntil = Date.now() + this.UNLOCK_WINDOW_MS;
      tridentLog('INFO', 'checkpoint-gate', 'saving-checkpoints skill loaded — UNLOCKED for 15 minutes');
    }
  }

  /** THE GATE — the write's fate:
   *   LOCKED    → CHECKPOINT_GATE_LOCKED (the hard throw)
   *   UNLOCKING → CHECKPOINT_GATE_SKILL_REQUIRED (step 1 named)
   *   UNLOCKED  → the 15-min check: within → ALLOW; expired → LOCKED + the throw */
  gateWrite(pathToWrite: string): void {
    if (!isCheckpointPath(pathToWrite)) return;          // not a checkpoint — pass
    if (this.state === 'UNLOCKED') {
      if (Date.now() <= this.unlockedUntil) return;       // the window — allow
      this.state = 'LOCKED';                               // the auto-lock
      throw new Error(`[${CHECKPOINT_GATE_ERRORS.TIMEOUT_LOCKED}] the 15-min window expired — the checkpoint re-locked`);
    }
    if (this.state === 'UNLOCKING') {
      throw new Error(`[${CHECKPOINT_GATE_ERRORS.SKILL_REQUIRED}] the save intent detected — step 1: load skill("saving-checkpoints") BEFORE any checkpoint write`);
    }
    throw new Error(`[${CHECKPOINT_GATE_ERRORS.LOCKED}] checkpoints are gated until the operator says "save the checkpoint" — the write is blocked`);
  }

  /** THE COMMAND-LEVEL DETECTOR — the bash command string scanned for /checkpoints writes
   *  (the indirect-write bypass closed: cp -r src Checkpoints/... even though the write
   *  tool's path is src — the /checkpoints segment in the command args is the trigger). */
  gateCommand(cmd: string): void {
    if (!cmd) return;
    const writes = /\b(cp|mv|rm|mkdir|touch|sed|cat|tee|install|ln|write|write_file|edit|patch)\b/.test(cmd);
    const checkpointRef = /checkpoint/i.test(cmd);
    if (writes && checkpointRef) {
      this.gateWrite(cmd);   // the same gate — the command is a checkpoint write
    }
  }
}

/** THE SHARED GATE INSTANCE (the singleton the hooks consume). */
export const checkpointGate = new CheckpointGate();
