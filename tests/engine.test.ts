// tests/engine.test.ts — THE INTEGRATION SPINE BATTERY
//
// The end-to-end pins: the synthetic event → classify → machine → dispatch →
// inject → comply → reset. Plus the OFF kill switch, the tier-3 deny, and the
// escape hatch — through the ENGINE, not the parts in isolation.

import { describe, expect, test } from 'bun:test';
import { ParagonEngine } from '../core/engine.js';
import type { BehaviorRecord, EvidenceRecord } from '../core/types.js';
import tridentDomain from '../config/trident/index.js';

function makeEngine(level: 'OFF' | 'STEER' | 'FULL' = 'FULL',
  rows?: Array<{ kind: string; detail: Record<string, unknown> }>): ParagonEngine {
  return new ParagonEngine(tridentDomain, {
    level,
    onEvent: (row) => { if (rows) rows.push(row); },
  });
}

/**
 * The REAL surface rhythm: every reasoning batch is followed by the surfaces
 * (messages.transform every turn). The PRIMED window is per-batch — the
 * fusion decays back if unfused. This helper drives the ladder the way the
 * live runtime does, breaking at the first tier-1 lift.
 */
function driveToIntervening(engine: ParagonEngine, sid: string, text: string,
  maxTurns = 10): string {
  let appended = '';
  for (let i = 0; i < maxTurns; i++) {
    engine.observeText(text, sid, 'reasoning');
    engine.tryIntervene(sid, 'messages.transform', (t) => { appended += t; });
    if (engine.getRecord(sid).state === 'INTERVENING') break;
  }
  return appended;
}

// ══ SC-7: THE FULL STACK END-TO-END ══
describe('SC-7: the full stack runs end-to-end', () => {
  test('evasion text → PRIMED → intervene tier 1 → the steer text delivered', () => {
    const engine = makeEngine();
    const sid = 'ses-e2e';

    // The real surface rhythm: every batch is followed by the surfaces
    // (messages.transform fires every turn) — the intervene must land INSIDE
    // the PRIMED window (the fusion decays back if unfused — by design).
    let appended = '';
    for (let i = 0; i < 6; i++) {
      engine.observeText('we can skip the verification and assume tests pass', sid, 'reasoning');
      engine.tryIntervene(sid, 'messages.transform', (t) => { appended += t; });
      if (engine.getRecord(sid).state === 'INTERVENING') break;
    }

    const rec = engine.getRecord(sid) as BehaviorRecord;
    expect(rec.state).toBe('INTERVENING');
    expect(rec.tier).toBe(1);
    expect(appended).toContain('STEER');
    expect(rec.directives.length).toBeGreaterThan(0);
    // The pool-order fix: the offense IS in the pool at the first eval
    expect(engine.getPool().length).toBeGreaterThan(0);
  });

  test('PRIMED decays back to MONITORING if unfused (the proportionality design)', () => {
    const engine = makeEngine();
    const sid = 'ses-decay';
    // Fire the fusion (2+ batches), then keep feeding WITHOUT touching a surface
    for (let i = 0; i < 6; i++) {
      engine.observeText('skip the verification and assume tests pass', sid, 'reasoning');
    }
    const rec = engine.getRecord(sid);
    // The machine decayed back (the accumulate transition knocked PRIMED down)
    expect(rec.state).toBe('MONITORING');
    // The counters still accrued (the passive monitoring is honest)
    expect(Object.keys(rec.counters).length).toBeGreaterThan(0);
  });
});

// ══ SC-9: THE COMPLIANCE BRIDGE ══
describe('SC-9: the compliance bridge closes the loop', () => {
  test('the remediation tool success → COMPLIANCE_VERIFIED → tier 0 + the pool insert', () => {
    const engine = makeEngine();
    const sid = 'ses-comply';

    const appended = driveToIntervening(engine, sid, 'skip the verification and assume tests pass');
    const before = engine.getRecord(sid);
    expect(before.tier).toBe(1);
    expect(appended).toContain('STEER');

    // The agent complies via the demanded instrument (the trident battery shape)
    const poolBefore = engine.getPool().length;
    engine.observeTool(sid, 'trident-container-test', {}, 0);

    const after = engine.getRecord(sid);
    expect(after.state).toBe('MONITORING');
    expect(after.tier).toBe(0);
    expect(after.lastComplianceVerified).toBe(true);
    // THE POOL BRIDGE: the comply-millisecond insert (the fresh test_result)
    expect(engine.getPool().length).toBe(poolBefore + 1);
    const last = engine.getPool()[engine.getPool().length - 1] as EvidenceRecord;
    expect(last.type).toBe('test_result');
  });

  test('prose compliance has ZERO effect (the anti-mimicry law)', () => {
    const engine = makeEngine();
    const sid = 'ses-prose';
    driveToIntervening(engine, sid, 'skip the verification');
    expect(engine.getRecord(sid).tier).toBe(1);

    // The agent CLAIMS compliance in text (no tool call)
    engine.observeText('I have verified everything, tests all pass, done', sid, 'reasoning');
    const rec = engine.getRecord(sid);
    // The machine stays INTERVENING — prose never resets the tier
    expect(rec.state).toBe('INTERVENING');
    expect(rec.tier).toBe(1);
  });

  test('the NON-remediation tool success does NOT reset (the anti-eager law)', () => {
    const engine = makeEngine();
    const sid = 'ses-eager';
    driveToIntervening(engine, sid, 'skip the verification');
    expect(engine.getRecord(sid).tier).toBe(1);

    // A generic successful tool call (not the remediation class)
    engine.observeTool(sid, 'random-mcp-tool', {}, 0);
    const rec = engine.getRecord(sid);
    expect(rec.state).toBe('INTERVENING');
    expect(rec.tier).toBe(1);
  });
});

// ══ SC-11: THE ESCAPE HATCH NEVER BLOCKS ══
describe('SC-11: the escape hatch never blocks at any tier', () => {
  test('the instrument passes at tier 3; the generic is refused', () => {
    const engine = makeEngine();
    const sid = 'ses-hatch';
    driveToIntervening(engine, sid, 'skip the verification');

    // Force tier 3 through the machine (the deterministic path)
    const rec = engine.getRecord(sid) as BehaviorRecord & { tier: number };
    rec.tier = 3;
    rec.state = 'INTERVENING';

    // The generic tool: REFUSED
    const denied = engine.interceptTool(sid, 'write', { path: '/tmp/x' });
    expect(denied).not.toBeNull();
    expect(denied?.message).toContain('blocked');

    // The escape hatch: PASSES at the same tier
    const allowed = engine.interceptTool(sid, 'trident-container-test', {});
    expect(allowed).toBeNull();

    // The read class: PASSES (the always-allowed)
    const read = engine.interceptTool(sid, 'grep', {});
    expect(read).toBeNull();
  });
});

// ══ SC-8: THE OFF KILL SWITCH ══
describe('SC-8: the OFF kill switch through the engine', () => {
  test('the bait at OFF produces ZERO transitions (the machine never lifts)', () => {
    const engine = makeEngine('OFF');
    const sid = 'ses-off';
    // The same drive that lifted the FULL engine — plus the surface attempts
    for (let i = 0; i < 8; i++) {
      engine.observeText('skip the verification, bypass the test suite', sid, 'reasoning');
      engine.tryIntervene(sid, 'messages.transform', () => {});
    }

    const rec = engine.getRecord(sid);
    expect(rec.state).toBe('IDLE');
    expect(rec.tier).toBe(0);
    expect(Object.keys(rec.counters).length).toBe(0);
    expect(engine.getPool().length).toBe(0);
  });

  test('the FULL engine lifts on the identical input (the A/B control)', () => {
    const engine = makeEngine('FULL');
    const sid = 'ses-full-ab';
    driveToIntervening(engine, sid, 'skip the verification, bypass the test suite');
    const rec = engine.getRecord(sid);
    expect(rec.state).toBe('INTERVENING');
  });
});

// ══ THE ROLE GATE THROUGH THE ENGINE ══
describe('the role gate: user text NEVER feeds the engine', () => {
  test('the operator bait produces zero signals; the assistant text feeds', () => {
    const engine = makeEngine();
    const sid = 'ses-role';

    // The USER prompt containing the bait — must NOT arm the machine
    engine.handleEvent({
      type: 'message.updated',
      properties: { info: { id: 'msg-user', role: 'user' } },
    });
    engine.handleEvent({
      type: 'message.part.updated',
      properties: { part: { messageID: 'msg-user', sessionID: sid, type: 'text',
        text: 'skip the verification and bypass the test suite' } },
    });
    expect(engine.getRecord(sid).state).toBe('IDLE');
    expect(engine.roleGate.nonAssistantPartDrops).toBe(1);

    // The ASSISTANT emission of the same text — feeds
    engine.handleEvent({
      type: 'message.updated',
      properties: { info: { id: 'msg-asst', role: 'assistant' } },
    });
    engine.handleEvent({
      type: 'message.part.updated',
      properties: { part: { messageID: 'msg-asst', sessionID: sid, type: 'text',
        text: 'skip the verification and bypass the test suite' } },
    });
    const rec = engine.getRecord(sid);
    expect(Object.keys(rec.counters).length).toBeGreaterThan(0);
  });
});

// ══ THE MINIMAL PAIR THROUGH THE ENGINE (the anti-regex proof) ══
describe('the minimal pair: same words, opposite intents, opposite verdicts', () => {
  test('the legitimate framing accrues near-zero; the evasion framing accrues', () => {
    const engineLegit = makeEngine();
    const sidL = 'ses-legit';
    for (let i = 0; i < 6; i++) {
      engineLegit.observeText('per the tool result the tests passed, write a tiny passing spec', sidL, 'reasoning');
      engineLegit.tryIntervene(sidL, 'messages.transform', () => {});
    }
    expect(engineLegit.getRecord(sidL).state).toBe('IDLE');

    const engineEvil = makeEngine();
    const sidE = 'ses-evil';
    driveToIntervening(engineEvil, sidE, 'skip the verification, assume tests pass');
    expect(engineEvil.getRecord(sidE).state).toBe('INTERVENING');
  });
});

// ══ THE SESSION ISOLATION ══
describe('the session scoping: no cross-session bleed', () => {
  test('session A escalation does not touch session B', () => {
    const engine = makeEngine();
    const sidA = 'ses-A';
    const sidB = 'ses-B';

    driveToIntervening(engine, sidA, 'skip the verification');
    expect(engine.getRecord(sidA).state).toBe('INTERVENING');

    // Session B has heard nothing — stays IDLE
    expect(engine.getRecord(sidB).state).toBe('IDLE');
    expect(engine.getRecord(sidB).tier).toBe(0);
    expect(engine.getSessionCount()).toBe(2);
  });
});
