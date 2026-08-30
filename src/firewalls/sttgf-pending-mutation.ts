// src/firewalls/sttgf-pending-mutation.ts — the MPSM (the Mutation-Pending
// State Machine) — the F-69 (the F-64's delivery-redesign, the operator's
// 2026-08-12 directive — the spec: docs/TRIDENT_STTGF_MUTATION_ENFORCEMENT_STATE_MACHINE_SPEC.md).
// THE INNOVATION: the enforcement demand's delivery rides the data flow the
// agent is already in (the messages.transform's in-band append — the DEFAULT,
// the zero latency) with the out-of-band kick (the session.prompt at the
// loop-completion — the smart-detection's timer) as the certainty-fallback.
// THE QUEUE IS DEAD — the session.prompt's prompt-queue was the F-64's failure
// (the "QUEUED" purgatory — the BUG-10's stuck-drain — observed live 2026-08-12
// in host-sim-mspq86wm).
//
// THE STATE MACHINE (the ISE law — the mechanical transitions, never the LLM):
//   IDLE → ARMED → DELIVERED → ACKNOWLEDGED → CLEARED
//   fail-states: SUPERSEDED (the new arm), EXPIRED (the TTL), ORPHANED (the
//   session-death). The registry's an in-memory Map — NO SQL (the transient
//   state's the process-lifetime; the crash-recovery by construction — the next
//   claim-scan re-arms; the durable records live in the evidence machine).
//
// THE INVARIANTS: one row per session (the supersede); the delivery's once-only
// (the take consumes + the kick's state-guard + the timer's single-shot); the
// clearing's mechanical (the ack-scan's match); the TTL's the fail-safe (the
// dead demand can never re-kick — the no-derailment).

import { tridentLog } from '../utils.js';

export type MutationState =
  | 'ARMED' | 'DELIVERED' | 'ACKNOWLEDGED'
  | 'SUPERSEDED' | 'EXPIRED' | 'ORPHANED';

export interface PendingMutation {
  sessionId: string;
  demandText: string;          // the [SYSTEM ENFORCEMENT] demand
  flaggedSpans: string[];      // the mutated spans' evidence
  state: MutationState;
  deliveredVia: 'transform' | 'kick' | null;
  at: number;
  deliveredAt: number | null;
  acknowledgedAt: number | null;
}

// THE TTL (the fail-safe — the stale demand can never re-kick):
export const MUTATION_TTL_MS = 5 * 60 * 1000;
// THE KICK WINDOW (the smart-detection: the loop's next-message window — a
// continuing loop transforms the next message within milliseconds of the arm;
// the window's expiry with the row still ARMED = the loop's DONE = the kick).
// THE ENV OVERRIDE (the container-test acceleration + the unit tests — the
// same pattern as the wave-cron's interval): the window's read dynamically at
// each arm — the tests shorten it without touching the production default.
export function resolveKickWindowMs(): number {
  const env = parseInt(process.env.TRIDENT_KICK_WINDOW_MS ?? '', 10);
  return Number.isFinite(env) && env > 0 ? env : KICK_WINDOW_MS;
}
export const KICK_WINDOW_MS = 5000;

const registry = new Map<string, PendingMutation>();
// THE KICK-TIMERS (per session — the single-shot; the take cancels):
const kickTimers = new Map<string, ReturnType<typeof setTimeout>>();
// THE KICK CALLBACK (injected by the hooks — the session.prompt's delivery):
let kickSender: ((sessionId: string, demandText: string) => Promise<void>) | null = null;

export function setKickSender(
  fn: ((sessionId: string, demandText: string) => Promise<void>) | null,
): void {
  kickSender = fn;
}

export function getKickSender(): ((sessionId: string, demandText: string) => Promise<void>) | null {
  return kickSender;
}

// THE SETTER (the text.complete's arm — the F-69's STEP 1):
export function armMutation(sessionId: string, demandText: string, spans: string[]): void {
  if (!sessionId) return;
  // THE SUPERSEDE — the one-row-per-session invariant (the chain converges):
  const existing = registry.get(sessionId);
  if (existing && existing.state === 'ARMED' || existing && existing.state === 'DELIVERED') {
    existing.state = 'SUPERSEDED';
    tridentLog('DEBUG', 'sttgf-pending', 'the prior mutation for ' + sessionId + ' SUPERSEDED by the new arm');
  }
  const row: PendingMutation = {
    sessionId,
    demandText,
    flaggedSpans: spans,
    state: 'ARMED',
    deliveredVia: null,
    at: Date.now(),
    deliveredAt: null,
    acknowledgedAt: null,
  };
  // THE DUAL-KEY WRITE (the F-70 — the red-team's live finding 2026-08-12):
  // the messages.transform's input carries sessionID=NONE (the runtime reality)
  // → its take falls back to the 'default' key — the arm's single-key (the real
  // sid) left the transform's take MISSING → the in-band path never fired → the
  // kick became the sole delivery. The dual-key (the same pattern as the
  // poseidon-state + the agent-state): the row lives under the real sid AND
  // 'default' — the transform's fallback resolves. The same row reference —
  // the dedupe + the supersede hold on both keys.
  registry.set(sessionId, row);
  if (sessionId !== 'default') registry.set('default', row);
  scheduleKick(sessionId);
  tridentLog('DEBUG', 'sttgf-pending', 'mutation ARMED for ' + sessionId + ' (spans ' + spans.length + ', kick-window ' + resolveKickWindowMs() + 'ms)');
}

// THE KICK-TIMER (the smart-detection — the loop-completion's proxy):
function scheduleKick(sessionId: string): void {
  cancelKickTimer(sessionId);
  const timer = setTimeout(() => {
    kickTimers.delete(sessionId);
    const row = registry.get(sessionId);
    if (!row || row.state !== 'ARMED') return;   // the transform consumed — no kick
    void (async () => {
      try {
        const sender = kickSender;
        if (!sender) {
          tridentLog('WARN', 'sttgf-pending', 'the kick-window expired for ' + sessionId + ' but the kick-sender is unset — the mutation stays ARMED (the TTL is the fail-safe)');
          return;
        }
        // THE ROW-IDENTITY RE-CHECK (the F-71 — the red-team's live finding
        // 2026-08-12): the supersede-chain's stale kick — the first arm's timer
        // fired for the SUPERSEDED mutation (the row's replaced by the new arm
        // mid-send) → the stale demand's delivered AFTER the supersede. The
        // fix: the send re-verifies the registry's row IS the captured row —
        // the supersede (a new row) aborts the stale kick:
        if (registry.get(sessionId) !== row) {
          tridentLog('DEBUG', 'sttgf-pending', 'the stale kick for ' + sessionId + ' aborted (the row was SUPERSEDED mid-send)');
          return;
        }
        row.state = 'DELIVERED';
        row.deliveredVia = 'kick';
        row.deliveredAt = Date.now();
        await sender(sessionId, row.demandText);
        tridentLog('INFO', 'sttgf-pending', 'the enforcement demand KICKED into the session ' + sessionId + ' (the loop-completion detected)');
      } catch (kickErr) {
        // THE NO-DERAILMENT: the kick's failure's non-fatal — the mutation
        // stands (the row's DELIVERED-via-kick — the ack-scan still clears it
        // if the agent responds; the TTL's the fail-safe):
        tridentLog('WARN', 'sttgf-pending', 'the kick failed (non-fatal): ' + (kickErr instanceof Error ? kickErr.message : String(kickErr)));
      }
    })();
  }, resolveKickWindowMs());
  try {
    (timer as unknown as { unref?: () => void }).unref?.();
  } catch (uErr) { /* non-fatal */ }
  kickTimers.set(sessionId, timer);
}

function cancelKickTimer(sessionId: string): void {
  const t = kickTimers.get(sessionId);
  if (t) {
    clearTimeout(t);
    kickTimers.delete(sessionId);
  }
}

// THE TRANSFORM's TAKE (the F-69's delivery — the in-band, the consume):
export function takeMutation(sessionId: string): PendingMutation | null {
  const row = registry.get(sessionId);
  if (!row || row.state !== 'ARMED') return null;
  row.state = 'DELIVERED';
  row.deliveredVia = 'transform';
  row.deliveredAt = Date.now();
  cancelKickTimer(sessionId);
  tridentLog('INFO', 'sttgf-pending', 'the enforcement demand DELIVERED via the transform into ' + sessionId + "'s next message (the in-band — the zero latency)");
  return row;
}

// THE NON-CONSUMING READ (the kick's expiry-check + the ack-scan's lookup):
export function peekMutation(sessionId: string): PendingMutation | null {
  return registry.get(sessionId) ?? null;
}

// THE ACK-SCAN's MATCH (the F-69's STEP 3 — the ACKNOWLEDGED → the forward-loop):
export function acknowledgeMutation(sessionId: string, at?: number): boolean {
  const row = registry.get(sessionId);
  if (!row) return false;
  if (row.state !== 'DELIVERED' && row.state !== 'ACKNOWLEDGED') return false;
  // THE FORWARD-LOOP v2 (2026-08-13 — the operator's catch: the ack alone
  // CLEARED → the agent acknowledged + STOPPED — no forward-motion to fix the
  // flags + continue. THE FIX: the acknowledgment marks the ACKNOWLEDGED state
  // ONLY — the row PERSISTS — the demand re-delivers until the NEXT completion
  // classifies ZERO slop-spans (the clean generation — the hooks' clearMutation).
  // The ack is a checkpoint, never the terminal.)
  row.state = 'ACKNOWLEDGED';
  row.acknowledgedAt = at ?? Date.now();
  cancelKickTimer(sessionId);
  tridentLog('INFO', 'sttgf-pending', 'the mutation for ' + sessionId + ' ACKNOWLEDGED (the forward-loop holds — the clean generation clears)');
  return true;
}

// THE CLEAN-GENERATION CLEAR (2026-08-13 — the forward-loop's terminal): the
// hooks' mutation-scan calls this when the completed message classifies ZERO
// slop-spans — the clean generation achieved — the row's freed, the loop's done.
export function clearMutation(sessionId: string): boolean {
  const row = registry.get(sessionId);
  if (!row) return false;
  if (row.state !== 'ACKNOWLEDGED' && row.state !== 'DELIVERED') return false;
  cancelKickTimer(sessionId);
  registry.delete(sessionId);
  if (sessionId !== 'default') registry.delete('default');
  tridentLog('INFO', 'sttgf-pending', 'the mutation for ' + sessionId + ' CLEARED (the clean generation — zero slop-spans)');
  return true;
}

// THE TTL SWEEPER (the fail-safe — the dead demand's reaping):
export function expireStale(now?: number): number {
  const n = now ?? Date.now();
  let reaped = 0;
  for (const [sid, row] of registry) {
    if (sid === 'default') continue;   // the 'default' copy's reaped via its real key
    if (row.state !== 'ARMED' && row.state !== 'DELIVERED') continue;
    if (n - row.at > MUTATION_TTL_MS) {
      row.state = 'EXPIRED';
      cancelKickTimer(sid);
      registry.delete(sid);
      if (sid !== 'default') registry.delete('default');
      reaped++;
      tridentLog('INFO', 'sttgf-pending', 'the stale mutation for ' + sid + ' EXPIRED + reaped (the TTL ' + MUTATION_TTL_MS + 'ms)');
    }
  }
  return reaped;
}

// THE SESSION-DEATH (the orphan-reaping — the no-pollution):
export function reapSession(sessionId: string): void {
  const row = registry.get(sessionId);
  if (row) {
    row.state = 'ORPHANED';
    cancelKickTimer(sessionId);
    registry.delete(sessionId);
    if (sessionId !== 'default') registry.delete('default');
    tridentLog('INFO', 'sttgf-pending', 'the mutation for ' + sessionId + ' ORPHANED + reaped (the session-death)');
  }
}

export function clearRegistry(): void {
  for (const t of kickTimers.values()) clearTimeout(t);
  kickTimers.clear();
  registry.clear();
}

export function registrySize(): number {
  // THE UNIQUE-ROW COUNT (the F-70's dual-key: the 'default' copy holds the
  // SAME row reference — the observability must not double-count):
  return new Set(registry.values()).size;
}

export function getRegistryDump(): Array<{ sessionId: string; state: MutationState; deliveredVia: PendingMutation['deliveredVia']; at: number }> {
  // THE UNIQUE-ROW DUMP (the F-70's dual-key — the 'default' aliases skipped;
  // the real-sid keys are the canonical rows):
  const out: Array<{ sessionId: string; state: MutationState; deliveredVia: PendingMutation['deliveredVia']; at: number }> = [];
  for (const [sid, row] of registry) {
    if (sid === 'default') continue;
    out.push({ sessionId: sid, state: row.state, deliveredVia: row.deliveredVia, at: row.at });
  }
  return out;
}
