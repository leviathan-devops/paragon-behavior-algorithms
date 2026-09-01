// poseidon-poller.test.ts — T-POLLER
// After runLoop returns on a model boundary, one interval per targetPath.
// SILENT → kickAwake fire-and-forget. clear on next start / terminal / maxKicks.
// Do not await session.prompt (Bug F).

import { describe, it, expect } from 'bun:test';
import {
  isModelBoundaryPhase,
  MODEL_BOUNDARY_PHASES,
  clearPoseidonPoller,
  startPoseidonPoller,
  hasPoseidonPoller,
} from '../poseidon-poller.ts';

describe('isModelBoundaryPhase', () => {
  it('DISPATCH / VERIFY / CONTAINER_TEST / PROBLEM_SOLVE are boundaries', () => {
    expect(MODEL_BOUNDARY_PHASES).toEqual(['DISPATCH', 'VERIFY', 'CONTAINER_TEST', 'PROBLEM_SOLVE']);
    expect(isModelBoundaryPhase('DISPATCH')).toBe(true);
    expect(isModelBoundaryPhase('VERIFY')).toBe(true);
    expect(isModelBoundaryPhase('CONTAINER_TEST')).toBe(true);
    expect(isModelBoundaryPhase('PROBLEM_SOLVE')).toBe(true);
  });

  it('mechanical + terminal phases are not poller phases', () => {
    expect(isModelBoundaryPhase('INIT')).toBe(false);
    expect(isModelBoundaryPhase('SCORE')).toBe(false);
    expect(isModelBoundaryPhase('COLLECT')).toBe(false);
    expect(isModelBoundaryPhase('PASS')).toBe(false);
    expect(isModelBoundaryPhase('LOCKED')).toBe(false); // old alias, still not a poller phase
    expect(isModelBoundaryPhase('FAILED')).toBe(false);
  });
});

describe('startPoseidonPoller / clearPoseidonPoller', () => {
  it('one handle per targetPath; second start replaces the first', () => {
    const pathA = '/tmp/poseidon-poller-a';
    clearPoseidonPoller(pathA);
    const watcher = { poll: () => ({ verdict: 'ACTIVE' as const }) };
    const kick = { kickAwake: async () => ({ kicked: true, attempt: 1, escalated: false, detail: 'KICK_POSTED_ASYNC' }) };
    startPoseidonPoller({ targetPath: pathA, watcher, kick, intervalMs: 60_000 });
    expect(hasPoseidonPoller(pathA)).toBe(true);
    startPoseidonPoller({ targetPath: pathA, watcher, kick, intervalMs: 60_000 });
    expect(hasPoseidonPoller(pathA)).toBe(true);
    clearPoseidonPoller(pathA);
    expect(hasPoseidonPoller(pathA)).toBe(false);
  });

  it('SILENT tick fires kickAwake without the caller awaiting session.prompt', async () => {
    const pathB = '/tmp/poseidon-poller-b';
    clearPoseidonPoller(pathB);
    let kicks = 0;
    const watcher = { poll: () => ({ verdict: 'SILENT' as const }) };
    const kick = {
      kickAwake: async () => {
        kicks += 1;
        return { kicked: true, attempt: kicks, escalated: kicks >= 3, detail: 'KICK_POSTED_ASYNC' };
      },
    };
    startPoseidonPoller({ targetPath: pathB, watcher, kick, intervalMs: 20 });
    await new Promise((r) => setTimeout(r, 70));
    expect(kicks > 0).toBe(true);
    clearPoseidonPoller(pathB);
  });

  it('maxKicks / escalated tick clears the handle', async () => {
    const pathC = '/tmp/poseidon-poller-c';
    clearPoseidonPoller(pathC);
    const watcher = { poll: () => ({ verdict: 'SILENT' as const }) };
    const kick = {
      kickAwake: async () => ({ kicked: true, attempt: 3, escalated: true, detail: 'KICK_POSTED_ASYNC' }),
    };
    startPoseidonPoller({ targetPath: pathC, watcher, kick, intervalMs: 20 });
    await new Promise((r) => setTimeout(r, 70));
    expect(hasPoseidonPoller(pathC)).toBe(false);
    clearPoseidonPoller(pathC);
  });

  it('adversarial: ACTIVE ticks never kick', async () => {
    const pathD = '/tmp/poseidon-poller-d';
    clearPoseidonPoller(pathD);
    let kicks = 0;
    const watcher = { poll: () => ({ verdict: 'ACTIVE' as const }) };
    const kick = {
      kickAwake: async () => {
        kicks += 1;
        return { kicked: true, attempt: 1, escalated: false, detail: 'KICK_POSTED_ASYNC' };
      },
    };
    startPoseidonPoller({ targetPath: pathD, watcher, kick, intervalMs: 20 });
    await new Promise((r) => setTimeout(r, 70));
    expect(kicks).toBe(0);
    clearPoseidonPoller(pathD);
  });
});
