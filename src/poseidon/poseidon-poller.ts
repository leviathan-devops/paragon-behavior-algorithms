// ============================================================
// FILE: src/poseidon/poseidon-poller.ts
// VERSION: v4.4.3 — the poseidon-drive overhaul T-POLLER
// PURPOSE: after runLoop RETURNS at a model boundary, one process-local
//          interval per targetPath polls the watcher. SILENT → kickAwake
//          fire-and-forget. Never await parent session.prompt (Bug F).
//
// THE HOLE THIS KILLS: kick only ran INSIDE runLoop. After DISPATCH /
// VERIFY / CONTAINER_TEST / PROBLEM_SOLVE return, nothing polled — HITL.
// ============================================================

import { tridentLog } from '../utils.js';

export const MODEL_BOUNDARY_PHASES = ['DISPATCH', 'VERIFY', 'CONTAINER_TEST', 'PROBLEM_SOLVE'] as const;
export type ModelBoundaryPhase = typeof MODEL_BOUNDARY_PHASES[number];

export const DEFAULT_POLLER_INTERVAL_MS = 30_000;

export function isModelBoundaryPhase(phase: string): phase is ModelBoundaryPhase {
  return (MODEL_BOUNDARY_PHASES as readonly string[]).includes(phase);
}

export interface PollerWatcher {
  poll: () => { verdict: 'ACTIVE' | 'SILENT' | 'DB_LOCKED' };
}

export interface PollerKick {
  kickAwake: () => Promise<{ kicked: boolean; attempt: number; escalated: boolean; detail: string }>;
}

export interface StartPollerArgs {
  targetPath: string;
  watcher: PollerWatcher;
  kick: PollerKick;
  intervalMs?: number;
}

const handles = new Map<string, ReturnType<typeof setInterval>>();

export function hasPoseidonPoller(targetPath: string): boolean {
  return handles.has(targetPath);
}

export function clearPoseidonPoller(targetPath: string): void {
  const h = handles.get(targetPath);
  if (h) {
    clearInterval(h);
    handles.delete(targetPath);
    tridentLog('INFO', 'poseidon-poller', 'cleared poller for ' + targetPath);
  }
}

export function clearAllPoseidonPollers(): void {
  for (const path of [...handles.keys()]) clearPoseidonPoller(path);
}

/**
 * One interval per targetPath. A second start on the same path replaces the first.
 * Tick: watcher.poll(); SILENT → kickAwake() WITHOUT awaiting the parent prompt.
 * Escalated kick (maxKicks) clears the handle.
 */
export function startPoseidonPoller(args: StartPollerArgs): void {
  const intervalMs = args.intervalMs && args.intervalMs > 0 ? args.intervalMs : DEFAULT_POLLER_INTERVAL_MS;
  clearPoseidonPoller(args.targetPath);
  const handle = setInterval(() => {
    let verdict: 'ACTIVE' | 'SILENT' | 'DB_LOCKED' = 'DB_LOCKED';
    try {
      verdict = args.watcher.poll().verdict;
    } catch (e) {
      tridentLog('WARN', 'poseidon-poller', 'poll threw: ' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    if (verdict !== 'SILENT') return;
    // Fire-and-forget. NEVER await session.prompt on the parent (Bug F deadlock).
    const posted = args.kick.kickAwake();
    if (posted && typeof posted.then === 'function') {
      posted.then((r) => {
        tridentLog('WARN', 'poseidon-poller', 'kick at ' + args.targetPath + ': ' + JSON.stringify(r));
        if (r && r.escalated) clearPoseidonPoller(args.targetPath);
      }).catch((e: unknown) => {
        tridentLog('ERROR', 'poseidon-poller', 'kick async failed: ' + (e instanceof Error ? e.message : String(e)));
      });
    }
  }, intervalMs);
  // Do not keep the process alive solely for the poller.
  if (typeof handle.unref === 'function') handle.unref();
  handles.set(args.targetPath, handle);
  tridentLog('INFO', 'poseidon-poller', 'started poller for ' + args.targetPath + ' intervalMs=' + intervalMs);
}
