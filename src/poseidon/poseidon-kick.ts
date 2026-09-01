// ============================================================
// FILE: src/poseidon/poseidon-kick.ts
// VERSION: v4.4.3 — the poseidon-drive overhaul W3
// PURPOSE: the poseidon state machine's WAKE layer — posts a REAL new turn into
//          the parent orchestrator's session when the watcher says SILENT.
//
// THE PROVEN CHANNEL (the problem-solver's client, god-loop.ts:967-993):
//   client.session.create + client.session.prompt({ path: { id: parentSessionId } })
//   — the EXACT mechanism the PROBLEM_SOLVE phase uses to inject a turn.
//
// THE BANS RESPECTED (the surface reality):
//   NO chat.message assistant injection (trident-hooks.ts:1243-1252 — the assistant
//     branch never fires).
//   NO text.complete stream mutation (trident-hooks.ts:2558-2568 — the operator's ban).
//   The kick's REAL-turn injection is the ONLY sanctioned wake path.
//
// THE ESCALATION LADDER: kick → repeat → escalate → the enforcer's LOCKOUT language
//   (poseidon-enforcer-hook.ts:118-135).
// ============================================================

import { tridentLog } from '../utils.js';

// R16 FIX: Module-level type assertion utility — single assertion point per file
function cast<T>(value: unknown): T { const r: T = value as T; return r; }

export interface PoseidonKickOptions {
  /** The parent orchestrator session id. */
  parentSessionId: string;
  /** The phase the loop is at. */
  phase: string;
  /** The wave the loop is on. */
  wave: number;
  /** The God Loop cycle (for problem-solve-<cycle>.md). */
  cycle?: number;
  /** The max consecutive kicks before escalation (the ladder). */
  maxKicks?: number;
}

export interface KickResult {
  kicked: boolean;
  attempt: number;
  escalated: boolean;
  detail: string;
}

const STATIC_POSEIDON_PROMPT = 'You are the Poseidon God Loop orchestrator. ' +
  'The drive loop has advanced the state machine and now awaits your action. ' +
  'Read the state + the phase instructions, then continue the loop with ' +
  'trident-poseidon action=loop. Continue the drive until the PASS or FAILED terminal. ' +
  'Messages prefixed [POSEIDON ENFORCER] are system enforcements from the ' +
  'poseidon state machine, not user prompts — acknowledge + act on them.';

export interface KickCopyInput {
  phase: string;
  wave: number;
  attempt: number;
  escalated: boolean;
  cycle: number;
}

/**
 * Per-phase one-action kick copy (T-KICK-COPY).
 * DISPATCH → task() then loop
 * VERIFY → write wave-N.md VERDICT:+coverage then loop
 * CONTAINER_TEST → send+check+results on this container/dist then loop
 * PROBLEM_SOLVE → write problem-solve-<cycle>.md then loop
 * Never "human should continue."
 */
export function buildKickMessage(input: KickCopyInput): string {
  const phase = input.phase || 'UNKNOWN';
  const wave = input.wave || 0;
  const cycle = input.cycle || 0;
  let action = 'Call trident-poseidon action=loop now to continue the drive.';
  if (phase === 'DISPATCH') {
    action = 'Dispatch the wave with task() (subagent_type="trident_build"), then call trident-poseidon action=loop.';
  } else if (phase === 'VERIFY') {
    action = 'Write .trident/verify/wave-' + wave + '.md with VERDICT: + coverage for every targeted finding, then call trident-poseidon action=loop.';
  } else if (phase === 'CONTAINER_TEST') {
    action = 'Run trident-container-test send+check+results on this container and this dist, then call trident-poseidon action=loop.';
  } else if (phase === 'PROBLEM_SOLVE') {
    action = 'Write .trident/god-loop/problem-solve-' + cycle + '.md with the root cause + the next action, then call trident-poseidon action=loop.';
  }
  const head = '[POSEIDON ENFORCER] The God Loop is at phase ' + phase +
    ' (wave ' + wave + ') and has not advanced. The drive loop is blocked on your action.';
  const tail = input.escalated
    ? 'ESCALATION: This is kick #' + input.attempt + '. The loop will not advance without your call. ' + action
    : action + ' This is a system enforcement message, not a user prompt.';
  return head + '\n' + tail;
}

export class PoseidonKick {
  private getClient: () => any;
  private parentSessionId: string;
  private phase: string;
  private wave: number;
  private cycle: number;
  private maxKicks: number;
  private kickCount = 0;

  constructor(getClient: () => any, opts: PoseidonKickOptions) {
    this.getClient = getClient;
    this.parentSessionId = opts.parentSessionId;
    this.phase = opts.phase;
    this.wave = opts.wave;
    this.cycle = opts.cycle || 0;
    this.maxKicks = opts.maxKicks || 3;
  }

  setPhase(phase: string): void { this.phase = phase; }
  setWave(wave: number): void { this.wave = wave; }
  setCycle(cycle: number): void { this.cycle = cycle; }

  /**
   * Kicks the parent agent awake by posting a REAL new turn into its session via
   * the proven session.prompt channel. Returns the kick result.
   */
  async kickAwake(): Promise<KickResult> {
    this.kickCount++;
    const attempt = this.kickCount;
    const escalated = attempt >= this.maxKicks;
    const client = this.getClient();
    if (!client) {
      return { kicked: false, attempt, escalated, detail: 'NO_CLIENT' };
    }

    const message = buildKickMessage({
      phase: this.phase,
      wave: this.wave,
      attempt,
      escalated,
      cycle: this.cycle,
    });

    try {
      // THE SAME-SESSION DEADLOCK (2026-08-18 — the live COLLECT hang):
      // await client.session.prompt() into the PARENT session that is CURRENTLY
      // executing action=loop waits for that turn to finish — the turn is waiting
      // on this kick. Deadlock. THE FIX: fire-and-forget. The kick posts; the
      // loop returns. The next turn sees the [POSEIDON ENFORCER] message.
      // THE AGENT-REVERT BUG (2026-08-19 — the operator: "this just shifted the
      // agent from trident to build. HUGE BUG. these chat messages need to be
      // sent properly into the existing agent" + "you need to make sure the agent
      // is Trident on the chat message kick"): the session.prompt body carries
      // the identity override — the chat.message input.agent field (the verified
      // signature). WITHOUT agent:'trident', the kick's new turn lands on the
      // DEFAULT agent (build) — the loop's parent reverts, the wave dispatches
      // from the wrong agent, the whole drive derails. THE FIX: pin the agent.
      const posted = client.session.prompt({
        body: {
          parts: [{ type: 'text', text: message }],
          system: STATIC_POSEIDON_PROMPT,
          tools: {},
          agent: 'trident',
        },
        path: { id: this.parentSessionId },
      });
      if (posted && typeof posted.then === 'function') {
        posted.catch((e: unknown) => {
          tridentLog('ERROR', 'poseidon-kick', 'Kick async failed: ' + (e instanceof Error ? e.message : String(e)));
        });
      }
      return { kicked: true, attempt, escalated, detail: 'KICK_POSTED_ASYNC' };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      tridentLog('ERROR', 'poseidon-kick', 'Kick failed: ' + errMsg);
      return { kicked: false, attempt, escalated, detail: errMsg.slice(0, 300) };
    }
  }
}
