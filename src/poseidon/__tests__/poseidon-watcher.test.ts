// poseidon-watcher.test.ts — E4 silence contract (T-WATCHER-E4)
// THE CONTRACT (header of poseidon-watcher.ts + NEXT_STEPS Step 1):
//   ACTIVITY = a NEW hash-distinct tool call only.
//   A re-read of already-seen hashes is NOT activity.
//   First poll of already-seen (historical) hashes must NOT set lastActivityAt = Date.now().
//   After silenceThresholdMs with no new hash → SILENT.
//   DEFAULT_SILENCE_THRESHOLD_MS stays 5 minutes — never lowered for a demo kick.
//
// These tests are written FIRST (TDD). They must FAIL on the live hole
// (rows.length > 0 → Date.now(); verdict treats lastActivityAt > 0 as ACTIVE).

import { describe, it, expect } from 'bun:test';
import {
  isNewToolCall,
  computeE4Verdict,
  DEFAULT_SILENCE_THRESHOLD_MS,
  type WatcherToolCall,
} from '../poseidon-watcher.ts';

const FIVE_MIN = 5 * 60 * 1000;

describe('DEFAULT_SILENCE_THRESHOLD_MS — never lowered for theater', () => {
  it('is exactly 5 minutes', () => {
    expect(DEFAULT_SILENCE_THRESHOLD_MS).toBe(FIVE_MIN);
    expect(DEFAULT_SILENCE_THRESHOLD_MS).toBeGreaterThanOrEqual(FIVE_MIN);
  });
});

describe('isNewToolCall — hash-distinct only', () => {
  it('first sighting of a name+hash is new; the identical pair is not', () => {
    const seen = new Map<string, number>();
    const a: WatcherToolCall = { name: 'task', outputHash: 'assistant|120', at: 1_000 };
    const again: WatcherToolCall = { name: 'task', outputHash: 'assistant|120', at: 2_000 };
    expect(isNewToolCall(seen, a)).toBe(true);
    expect(isNewToolCall(seen, again)).toBe(false);
  });

  it('a different outputHash of the same tool name is new', () => {
    const seen = new Map<string, number>();
    expect(isNewToolCall(seen, { name: 'task', outputHash: 'assistant|120', at: 1 })).toBe(true);
    expect(isNewToolCall(seen, { name: 'task', outputHash: 'assistant|999', at: 2 })).toBe(true);
  });

  it('adversarial: empty name + empty hash still keys; second sighting is not new', () => {
    const seen = new Map<string, number>();
    expect(isNewToolCall(seen, { name: '', outputHash: '', at: 0 })).toBe(true);
    expect(isNewToolCall(seen, { name: '', outputHash: '', at: 1 })).toBe(false);
  });
});

describe('computeE4Verdict — old hashes are SILENT after the threshold', () => {
  const now = 1_700_000_000_000;
  const sessionCreated = now - 60 * 60 * 1000; // session started an hour ago

  it('historical rows already seeded (no new hash) past the threshold → SILENT', () => {
    const v = computeE4Verdict({
      hasNewCall: false,
      lastNewCallAt: 0,
      sessionCreated,
      now,
      silenceThresholdMs: FIVE_MIN,
      primed: true,
    });
    expect(v.verdict).toBe('SILENT');
    expect(v.lastActivityAt).not.toBe(now);
    expect(v.silenceMs).toBeGreaterThanOrEqual(FIVE_MIN);
  });

  it('a NEW hash-distinct task call → ACTIVE and stamps lastActivityAt = now', () => {
    const v = computeE4Verdict({
      hasNewCall: true,
      lastNewCallAt: 0,
      sessionCreated,
      now,
      silenceThresholdMs: FIVE_MIN,
      primed: true,
    });
    expect(v.verdict).toBe('ACTIVE');
    expect(v.lastActivityAt).toBe(now);
    expect(v.silenceMs).toBe(0);
  });

  it('repeat of the same hashes after the threshold → SILENT (clock not refreshed)', () => {
    const lastNew = now - FIVE_MIN - 1;
    const v = computeE4Verdict({
      hasNewCall: false,
      lastNewCallAt: lastNew,
      sessionCreated,
      now,
      silenceThresholdMs: FIVE_MIN,
      primed: true,
    });
    expect(v.verdict).toBe('SILENT');
    expect(v.lastActivityAt).toBe(lastNew);
    expect(v.lastActivityAt).not.toBe(now);
  });

  it('first poll of already-seen historical hashes does NOT treat rows as now → SILENT when session is old', () => {
    // primed=false is the first poll: seed only, do not refresh the clock.
    const v = computeE4Verdict({
      hasNewCall: true, // isNewToolCall would return true on an empty seen map
      lastNewCallAt: 0,
      sessionCreated,
      now,
      silenceThresholdMs: FIVE_MIN,
      primed: false,
    });
    expect(v.verdict).toBe('SILENT');
    expect(v.lastActivityAt).not.toBe(now);
  });

  it('a brand-new session (created just now, no new call after prime) stays ACTIVE until the threshold', () => {
    const v = computeE4Verdict({
      hasNewCall: false,
      lastNewCallAt: 0,
      sessionCreated: now - 1_000,
      now,
      silenceThresholdMs: FIVE_MIN,
      primed: true,
    });
    expect(v.verdict).toBe('ACTIVE');
    expect(v.silenceMs < FIVE_MIN).toBe(true);
  });

  it('adversarial: lastActivityAt > 0 from leftover rows is NOT itself a reason to be ACTIVE', () => {
    // This is the live hole: `(hasNewCall || snap.lastActivityAt > 0) ? ACTIVE`.
    // A leftover lastActivityAt with no new call, past the threshold, must be SILENT.
    const leftover = now - FIVE_MIN - 5_000;
    const v = computeE4Verdict({
      hasNewCall: false,
      lastNewCallAt: leftover,
      sessionCreated,
      now,
      silenceThresholdMs: FIVE_MIN,
      primed: true,
    });
    expect(v.verdict).toBe('SILENT');
  });

  it('adversarial: zero sessionCreated + no new call + primed → SILENT (fail closed, never Date.now() activity)', () => {
    const v = computeE4Verdict({
      hasNewCall: false,
      lastNewCallAt: 0,
      sessionCreated: 0,
      now,
      silenceThresholdMs: FIVE_MIN,
      primed: true,
    });
    expect(v.verdict).toBe('SILENT');
    expect(v.lastActivityAt).not.toBe(now);
  });
});
