import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { poseidonState, isLeafNode } from '../poseidon/poseidon-state.js';
import { tridentLog } from '../utils.js';
import { godLoopOrchestrator, isTerminalPhase } from '../poseidon/god-loop.js';
import { PoseidonWatcher } from '../poseidon/poseidon-watcher.js';
import { PoseidonKick } from '../poseidon/poseidon-kick.js';
import {
  startPoseidonPoller,
  clearPoseidonPoller,
  isModelBoundaryPhase,
} from '../poseidon/poseidon-poller.js';

// R16 FIX: Module-level type assertion utility — single assertion point per file
function cast<T>(value: unknown): T { if (value !== undefined && value !== null) { return value as T; } return value as T; }

// The client reference — the opencode runtime injects the client into the tool context;
// the kick's getClient() resolves it lazily.
let clientRef: any = null;
export function setPoseidonClientRef(c: any): void { clientRef = c; }

export const tridentPoseidonTool = tool({
  description: 'POSEIDON MODE: God Orchestrator for quality-enforced build execution. Dispatches work to Trident_Build subagent, audits output, loops until 96%+ runtime grade. AUTO-LOCKS on completion. ALL POSEIDON OUTPUT MUST BE DISPLAYED TO THE USER — THE USER MUST SEE EVERY CYCLE PLAN, SCORE, AND NEXT STEP.',

  args: {
    targetPath: z.string().describe('Absolute path to the project root to build/audit'),
    action: z.enum(['start', 'loop', 'status', 'abort', 'deactivate', 'revoke'])
      .default('start')
      .describe('start=INIT only (new cycle), loop=drive the God Loop to the next model boundary (DISPATCH) or terminal, status=show current state, abort=cancel running loop, deactivate=exit Poseidon Mode, revoke=full reset'),
    maxCycles: z.number().min(1).max(200).default(50)
      .describe('Maximum loop iterations (safeguard against infinite loops)'),
  },

  execute: async (args: { targetPath: string; action: 'start' | 'loop' | 'status' | 'abort' | 'deactivate' | 'revoke'; maxCycles: number }, ctx?: unknown) => {
    const rawCtx = cast<Record<string, unknown>>(ctx);
    const sessionId = (typeof rawCtx?.sessionId === 'string' ? rawCtx.sessionId : '') || (typeof rawCtx?.sessionID === 'string' ? rawCtx.sessionID : '') || 'default';
    const agentName = (typeof rawCtx?.agent === 'string' ? rawCtx.agent : '') || (typeof rawCtx?.agentName === 'string' ? rawCtx.agentName : '') || '';

    // LEAF NODE SECURITY: Build agents CANNOT call trident-poseidon
    if (isLeafNode(agentName)) {
      return '## POSEIDON MODE: ACCESS DENIED\n\n' +
        'Build agents (leaf nodes) cannot call trident-poseidon.\n' +
        'This is a safety guardrail to prevent nested Poseidon execution.\n' +
        '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output.**';
    }

    // LOCK CHECK: Poseidon Mode must be active for start/loop actions.
    // Status/abort/deactivate/revoke are always allowed.
    // Session ID fix: check BOTH the tool's session AND 'default' because the chat hook
    // may store activation under a different session ID than the tool context provides.
    if (args.action === 'start' || args.action === 'loop') {
      const isActive = poseidonState.isActive(sessionId) || poseidonState.isActive('default');
      if (!isActive) {
        return '## POSEIDON MODE: INACTIVE\n\n' +
          'Poseidon Mode is not active. The user must explicitly activate it by ' +
          'saying something like "Poseidon Mode Activate" or "enable poseidon mode" ' +
          'in the chat.\n\n' +
          'Detected session: ' + sessionId + '\n' +
          '\n\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
      }
    }

    const displayFooter = '\n\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';

    try {
      // STATUS action — read God Loop state from disk
      if (args.action === 'status') {
        const status = godLoopOrchestrator.getStatus(args.targetPath);
        const metrics = poseidonState.getMetrics(sessionId);
        return `## POSEIDON MODE — STATUS

### God Loop State
- Phase: ${status.phase}
- Cycle: ${status.cycle}
- Score: ${status.score}/100
- Wave: ${status.wave}
- Stalled: ${status.stalledSince} cycles

### Session State
- Active: ${metrics?.active || false}
- Highest Score: ${metrics?.highestScore || 0}/100
- Target: ${metrics?.targetPath || args.targetPath}
${displayFooter}`;
      }

      // ABORT action — stops the God LOOP only. Does NOT deactivate Poseidon Mode.
      // Mode state is controlled exclusively by user chat messages (poseidonDetector).
      if (args.action === 'abort') {
        poseidonState.setAbortFlag(sessionId, true);
        clearPoseidonPoller(args.targetPath);
        // THE HT-BUG-2 FIX (2026-08-23): abort writes the TERMINAL phase to
        // .trident/god-loop/state.json — the enforcer's ONLY source of truth —
        // so enforcement stands down on the next read. The old handler set an
        // in-memory abortFlag the enforcer never read: the dead loop's phase
        // kept blocking tools ("State saved for recovery" + continued blocks).
        godLoopOrchestrator.markAborted(args.targetPath);
        return '## POSEIDON GOD LOOP: ABORTED\n\nGod Loop aborted. State marked FAILED (terminal) — enforcement stands down.\n\nPoseidon Mode remains ACTIVE (tools unlocked). Mode changes only via user chat ("poseidon deactivate").' + displayFooter;
      }

      // DEACTIVATE action — REMOVED as a tool action. Mode state changes ONLY
      // via explicit user chat messages. Returns guidance instead of mutating state.
      if (args.action === 'deactivate') {
        return '## POSEIDON MODE: STATE UNCHANGED\n\n' +
          'Tool-based deactivation was removed. Poseidon Mode activates/deactivates ONLY on explicit user chat messages.\n\n' +
          'To deactivate, the USER must say: "poseidon deactivate" or "deactivate poseidon".\n' +
          'The agent cannot and should not change mode state. Continue your task.' + displayFooter;
      }

      // REVOKE action — full reset is also a mode state change → user-chat only.
      if (args.action === 'revoke') {
        return '## POSEIDON MODE: STATE UNCHANGED\n\n' +
          'Tool-based revoke was removed. Poseidon Mode state changes ONLY on explicit user chat messages.\n\n' +
          'To reset, the USER must say "poseidon deactivate" then re-activate as needed.' + displayFooter;
      }

      // START action — INIT ONLY (the W1 action-design guard).
      // A running cycle must NOT be re-advanced by start — the loop has a dedicated driver.
      if (args.action === 'start') {
        poseidonState.setTargetPath(sessionId, args.targetPath);
        const status = godLoopOrchestrator.getStatus(args.targetPath);
        if (status.phase !== 'INIT') {
          // THE HT-BUG-6 FIX (2026-08-23): a TERMINAL phase (PASS/FAILED) is
          // fresh-startable — re-init the cycle instead of refusing forever.
          if (isTerminalPhase(status.phase)) {
            godLoopOrchestrator.resetToInit(args.targetPath);
          } else {
            return '## POSEIDON MODE: ALREADY RUNNING\n\n' +
              'The God Loop is at phase ' + status.phase + ' (cycle ' + status.cycle + ', score ' + status.score + '/100).\n' +
              'action=start is for INIT only. Use trident-poseidon action=loop to drive the loop forward.\n' +
              'The driver returns at DISPATCH (dispatch the wave) or the terminal.' + displayFooter;
          }
        }
        // Fall through to the single-phase advance (fresh INIT)
      }

      // LOOP action — the DRIVER (the W1 action-design core).
      // Drives the mechanical phases (requiresModelAction:false) forward IN ONE CALL,
      // returning ONLY at DISPATCH (the model must dispatch the wave's agents) or the
      // terminal (PASS/FAILED). This is the V2.1 theater's mechanical kill: the loop
      // is no longer hostage to the model's voluntary per-phase re-invocations.
      if (args.action === 'loop') {
        poseidonState.setTargetPath(sessionId, args.targetPath);
        // T-POLLER: one handle per targetPath. A new loop entry replaces the old timer.
        clearPoseidonPoller(args.targetPath);

        // W4 wiring — the watcher + the kick attached to the orchestrator
        const watcher = new PoseidonWatcher({
          phase: godLoopOrchestrator.getStatus(args.targetPath).phase,
          wave: godLoopOrchestrator.getStatus(args.targetPath).wave,
          parentSessionId: sessionId,
          silenceThresholdMs: 5 * 60 * 1000,
        });
        const kick = new PoseidonKick(() => {
          // Resolve the client lazily: the trident-tools registry wires it via setClientGetter
          const status = godLoopOrchestrator.getStatus(args.targetPath);
          void status;
          return clientRef;
        }, {
          parentSessionId: sessionId,
          phase: watcher['phase'],
          wave: watcher['wave'],
          maxKicks: 3,
        });
        godLoopOrchestrator.setPoseidonPolicing(watcher, kick);

        const loopResult = await godLoopOrchestrator.runLoop(args.targetPath, sessionId, args.maxCycles);
        poseidonState.setScore(sessionId, loopResult.score);
        poseidonState.incrementCycles(sessionId);

        // THE PHASE-SYNC FIX (the container-test catch 2026-08-16): the watcher + the
        // kick were constructed with the PRE-loop status (the phase at the tool entry).
        // After the loop advances, the enforcement's phase must reflect the CURRENT
        // state — otherwise the kick says "at phase DISPATCH" while the loop is at
        // COLLECT (the stale-phase bug observed live). Sync both from the loop result.
        watcher.setPhase(loopResult.nextPhase);
        watcher.setWave(loopResult.wave);
        kick.setPhase(loopResult.nextPhase);
        kick.setWave(loopResult.wave);
        kick.setCycle(loopResult.cycle);

        // T-POLLER (hole 2): after runLoop RETURNS at a model boundary, poll
        // the parent session. SILENT → kickAwake fire-and-forget. Never await
        // parent session.prompt (Bug F). Terminal phases clear and do not start.
        if (isTerminalPhase(loopResult.nextPhase)) {
          clearPoseidonPoller(args.targetPath);
        } else if (isModelBoundaryPhase(loopResult.nextPhase)) {
          startPoseidonPoller({
            targetPath: args.targetPath,
            watcher,
            kick,
          });
        }

        const stateDir = path.join(args.targetPath, '.trident', 'god-loop');
        const shortLine = `🔄 POSEIDON DRIVE: Cycle ${loopResult.cycle} | Score: ${loopResult.score}/100 | Wave: ${loopResult.wave} | Phase: ${loopResult.phase} → ${loopResult.nextPhase}`;

        if (isTerminalPhase(loopResult.nextPhase)) {
          return shortLine + '\n\n' + loopResult.instructions.substring(0, 500) + '\n\nGod Loop ended (' + loopResult.nextPhase + '). Poseidon Mode remains ACTIVE — mode changes only via user chat ("poseidon deactivate").';
        }

        if (loopResult.requiresModelAction) {
          // DISPATCH boundary — full plan on disk, short instruction returned
          const dispatchPath = path.join(stateDir, 'wave-' + loopResult.wave + '-dispatch.md');
          try {
            fs.mkdirSync(stateDir, { recursive: true });
            fs.writeFileSync(dispatchPath, loopResult.instructions, 'utf-8');
          } catch (e: unknown) {
            tridentLog('WARN', 'trident-poseidon', 'Failed to write dispatch plan: ' + (e instanceof Error ? e.message : String(e)));
          }
          var agentCount = (loopResult.instructions.match(/Agent \d+:/g) || []).length;
          if (agentCount === 0) agentCount = 5; // fallback
          return shortLine + '\n\n' +
            '⚡ DISPATCH REQUIRED: ' + agentCount + ' build agents ready.\n' +
            'Full dispatch plan: ' + dispatchPath + '\n' +
            'Read the plan file, then dispatch ALL ' + agentCount + ' agents using subagent_type="trident_build".\n' +
            'After ALL agents return, call trident-poseidon action=loop to COLLECT + VERIFY + re-audit + score.\n' +
            'DO NOT WAIT. DO NOT ASK. DISPATCH NOW.';
        }

        // Non-dispatch non-terminal return (maxCycles guard) — show the phase details
        const detailPath = path.join(stateDir, 'phase-' + loopResult.phase + '-details.md');
        try { fs.writeFileSync(detailPath, loopResult.instructions, 'utf-8'); } catch (e: unknown) { tridentLog('WARN', 'trident-poseidon', 'Failed to write phase details: ' + (e instanceof Error ? e.message : String(e))); }
        return shortLine + '\n\n' + 'Loop halted at ' + loopResult.phase + ' (maxCycles guard). Details: ' + detailPath + '\n→ Call trident-poseidon action=loop to continue.';
      }

      // START / single-phase advance — the INIT-only path
      // The 13-phase state machine runs ONE phase per call (fresh cycles).
      poseidonState.setTargetPath(sessionId, args.targetPath);

      tridentLog('INFO', 'trident-poseidon', 'Poseidon Mode phase advance for: ' + args.targetPath + ' (action=' + args.action + ')');

      const result = await godLoopOrchestrator.runPhase(args.targetPath, sessionId);

      // Update session metrics
      poseidonState.setScore(sessionId, result.score);
      poseidonState.incrementCycles(sessionId);

      // ── BUILD VISIBLE OUTPUT ──
      // The tool returns a SHORT summary that is ALWAYS visible in the TUI.
      // Full instructions are written to disk for the model to read separately.
      // This prevents long outputs from being collapsed/truncated by the TUI.

      const stateDir = path.join(args.targetPath, '.trident', 'god-loop');
      const shortLine = `🔄 POSEIDON CYCLE ${result.cycle} | Score: ${result.score}/100 | Wave: ${result.wave} | Phase: ${result.phase} → ${result.nextPhase}`;

      // Check for terminal states — the LOOP ends, but the MODE stays active.
      // Mode deactivation happens ONLY via explicit user chat message.
      if (isTerminalPhase(result.nextPhase)) {
        // Terminal states are short enough to show inline
        return shortLine + '\n\n' + result.instructions.substring(0, 500) + '\n\nGod Loop ended (' + result.nextPhase + '). Poseidon Mode remains ACTIVE — mode changes only via user chat ("poseidon deactivate").';
      }

      // DISPATCH phase — full specs written to disk, short instruction returned
      if (result.requiresModelAction) {
        // Write full dispatch instructions to disk
        const dispatchPath = path.join(stateDir, 'wave-' + result.wave + '-dispatch.md');
        try {
          fs.mkdirSync(stateDir, { recursive: true });
          fs.writeFileSync(dispatchPath, result.instructions, 'utf-8');
        } catch (e: unknown) {
          tridentLog('WARN', 'trident-poseidon', 'Failed to write dispatch plan: ' + (e instanceof Error ? e.message : String(e)));
        }

        // Count agents from the wave manifest in state
        var agentCount = (result.instructions.match(/Agent \d+:/g) || []).length;
        if (agentCount === 0) agentCount = 5; // fallback

        // Return SHORT visible instruction
        return shortLine + '\n\n' +
          '⚡ DISPATCH REQUIRED: ' + agentCount + ' build agents ready.\n' +
          'Full dispatch plan: ' + dispatchPath + '\n' +
          'Read the plan file, then dispatch ALL ' + agentCount + ' agents using subagent_type="trident_build".\n' +
          'After ALL agents return, call trident-poseidon action=loop to COLLECT results.\n' +
          'DO NOT WAIT. DO NOT ASK. DISPATCH NOW.';
      }

      // All other phases — check if output is short enough for inline display
      if (result.instructions.length <= 1500) {
        // Short enough to show inline
        return shortLine + '\n\n' + result.instructions + '\n\n→ Call trident-poseidon action=loop to advance.';
      }

      // Long output — write to disk, return summary
      const detailPath = path.join(stateDir, 'phase-' + result.phase + '-details.md');
      try {
        fs.writeFileSync(detailPath, result.instructions, 'utf-8');
      } catch (e: unknown) {
        tridentLog('WARN', 'trident-poseidon', 'Failed to write phase details: ' + (e instanceof Error ? e.message : String(e)));
      }

      return shortLine + '\n\n' +
        'Phase details: ' + detailPath + '\n' +
        '→ Call trident-poseidon action=loop to advance to ' + result.nextPhase + '.';

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      tridentLog('ERROR', 'trident-poseidon', '[POSEIDON-ERR] ' + errMsg);
      return '## POSEIDON MODE — ERROR\n\n' +
        'Phase execution failed: ' + errMsg + '\n\n' +
        'The God Loop state has been saved. Use `trident-poseidon action=status` to inspect.\n' +
        'Use `trident-poseidon action=abort` to reset.' + displayFooter;
    }
  },
});
