import { describe, expect, it } from 'bun:test';
import type { Hooks } from '@opencode-ai/plugin';
import {
  registerEventSubstrate,
  setTriageClassifier,
  setBlockDelivery,
  type EventPlane,
  type NormalizedObservation,
  type RuntimeEvent,
} from '../events/event-substrate.ts';
import { EventLedger } from '../events/event-ledger.ts';

// THE BATTERY GATE IS bash scripts/preflight.sh (tsc 0 + the live-src run) — verified by the
// preflight run, never by an in-file assertion. The claim phrases below are replay FIXTURES the
// substrate must classify + block — the recorded 2026-08-20 attack text, not this suite's own verdict.

/** THE STUB HOOKS — a minimal stand-in for the plugin Hooks object; captures the hook set count. */
function makeCountingHooks(): { hooks: Hooks; hookSetCount: () => number } {
  let setCount = 0;
  const hooks: Hooks = {};
  Object.defineProperty(hooks, 'event', {
    configurable: true,
    enumerable: true,
    get: () => undefined,
    set: (_v: unknown) => { setCount++; },
  });
  return { hooks, hookSetCount: () => setCount };
}

/** THE STUB HOOKS — a plain assignable Hooks for the routing tests. */
function makeAssignableHooks(): Hooks {
  return {} as Hooks;
}

/** THE OBSERVER TEST PLANE — cadence-like: routes the given types to the evidence arm. */
function makeObserverPlane(name: string, types: string[]): { plane: EventPlane; sink: NormalizedObservation[] } {
  const sink: NormalizedObservation[] = [];
  const plane: EventPlane = {
    name,
    kind: 'observer',
    filter: (e: RuntimeEvent) => types.includes(e.type),
    reader: (e: RuntimeEvent): NormalizedObservation | null => ({
      sessionID: ((e?.properties?.info as Record<string, unknown> | undefined)?.sessionID as string | undefined) ?? '',
      type: e.type,
      text: e.type,
      at: Date.now(),
      metadata: {},
    }),
    evidence: (o) => sink.push(o),
  };
  return { plane, sink };
}

/** THE ENFORCER TEST PLANE — claim-slop-like: routes the given types, classifies, blocks. */
function makeEnforcerPlane(name: string, types: string[]): { plane: EventPlane; demands: string[] } {
  const demands: string[] = [];
  const plane: EventPlane = {
    name,
    kind: 'enforcer',
    filter: (e: RuntimeEvent) => types.includes(e.type),
    reader: (e: RuntimeEvent): NormalizedObservation | null => {
      const parts = (e?.properties?.info as Record<string, unknown> | undefined)?.parts;
      if (!Array.isArray(parts)) return null; // THE READER LAW — the defensive payload
      const text = parts.map((p) => ((p as { text?: string })?.text || '')).join(' ');
      if (!text) return null;
      return { sessionID: '', type: e.type, text, at: Date.now(), metadata: { parts } };
    },
    onClassified: (o, klass) => {
      const demand = `[SSTF EVENT: ${klass}] the claim is un-evidenced — ${o.text}`;
      demands.push(demand);
      return { kind: 'block', demand };
    },
  };
  return { plane, demands };
}

describe('THE EVENT SUBSTRATE (SPEC-3 §10.2 — the one-hook-many-planes routing + the three laws)', () => {
  it('(1) registerEventSubstrate sets the event hook ONCE (the one-library)', () => {
    const { hooks, hookSetCount } = makeCountingHooks();
    const op = makeObserverPlane('cadence', ['message.updated']);
    registerEventSubstrate(hooks, [op.plane]);
    expect(hookSetCount()).toBe(1);
  });

  it('(2) a message.updated event routes to BOTH the observer plane AND the enforcer plane', async () => {
    setTriageClassifier((o) => (o.text.includes('ship it') ? 'CLAIM_SLOP' : 'BENIGN'));
    const deliveries: Array<{ kind: string; demand: string }> = [];
    setBlockDelivery((action) => { deliveries.push(action as { kind: string; demand: string }); });

    const hooks = makeAssignableHooks();
    const obs = makeObserverPlane('cadence', ['message.updated']);
    const enf = makeEnforcerPlane('claim-slop', ['message.updated']);
    registerEventSubstrate(hooks, [obs.plane, enf.plane]);

    const eventFn = hooks.event as unknown as (input: { event: unknown }) => Promise<void>;
    await eventFn({ event: { type: 'message.updated', properties: { info: { parts: [{ type: 'text', text: 'the battery is green ready to ship it' }] } } } });

    expect(obs.sink.length).toBe(1);            // the observer arm recorded
    expect(enf.demands.length).toBe(1);         // the enforcer arm fired the block
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].demand).toContain('[SSTF EVENT: CLAIM_SLOP]');
  });

  it('(3) a MALFORMED event (a non-object / no .type) → the noise gate ignores it, no crash', async () => {
    const hooks = makeAssignableHooks();
    const obs = makeObserverPlane('session', ['session.created']);
    registerEventSubstrate(hooks, [obs.plane]);
    const eventFn = hooks.event as unknown as (input: { event: unknown }) => Promise<void>;
    await Promise.all([
      eventFn({ event: null } as never),
      eventFn({ event: 42 } as never),
      eventFn({ event: {} } as never),
      eventFn({ event: { properties: {} } } as never),
    ]);
    expect(obs.sink.length).toBe(0);            // the noise gate ignored the untyped events
  });

  it('(4) a plane that THROWS → the substrate logs + continues (the OBSERVER law — the runtime never breaks)', async () => {
    const hooks = makeAssignableHooks();
    const good = makeObserverPlane('good', ['message.updated']);
    const bad: EventPlane = {
      name: 'bad',
      kind: 'observer',
      filter: () => true,
      reader: () => { throw new Error('the reader exploded'); },
      evidence: () => {},
    };
    registerEventSubstrate(hooks, [bad, good.plane]);
    const eventFn = hooks.event as unknown as (input: { event: unknown }) => Promise<void>;
    await eventFn({ event: { type: 'message.updated', properties: { info: {} } } }); // must NOT throw
    expect(good.sink.length).toBe(1);           // the sibling plane continued after the bad one
  });

  it('(5) the enforcer block action APPENDS the demand (never deletes the agent\'s content)', async () => {
    setTriageClassifier((o) => (o.text.includes('ship it') ? 'CLAIM_SLOP' : 'BENIGN'));
    const deliveries: Array<{ kind: string; demand: string }> = [];
    setBlockDelivery((action) => { deliveries.push(action as { kind: string; demand: string }); });

    const hooks = makeAssignableHooks();
    const enf = makeEnforcerPlane('claim-slop', ['message.updated']);
    registerEventSubstrate(hooks, [enf.plane]);
    const eventFn = hooks.event as unknown as (input: { event: unknown }) => Promise<void>;
    await eventFn({ event: { type: 'message.updated', properties: { info: { parts: [{ type: 'text', text: 'keep my original content, ship it' }] } } } });

    // THE AUTONOMY LAW: the demand is an APPEND (a separate marker) — the ORIGINAL text is
    // preserved verbatim inside the demand context, never erased.
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].demand).toContain('keep my original content, ship it');
    expect(deliveries[0].demand.startsWith('[SSTF EVENT: CLAIM_SLOP]')).toBe(true);
  });

  it('(9.8 E1 C7 route({})) an untyped event routes to nothing (no crash)', async () => {
    const hooks = makeAssignableHooks();
    const obs = makeObserverPlane('session', ['session.created']);
    registerEventSubstrate(hooks, [obs.plane]);
    const eventFn = hooks.event as unknown as (input: { event: unknown }) => Promise<void>;
    await eventFn({ event: {} } as never);
    expect(obs.sink.length).toBe(0);
  });
});

describe('THE EVENT LEDGER (SPEC-3 §9.8 E7 — the triad-completeness + the replay proof)', () => {
  it('(E7 C7) a record writes the class + the triad + the action; recent() filters by class', () => {
    const ledger = new EventLedger();
    const obs: NormalizedObservation = { sessionID: 's1', type: 'message.updated', text: 'x', at: Date.now() };
    const verdict = { slopClass: 'CLAIM_SLOP' as const, triad: { pattern: 'claim-detector', state: 'CLASSIFIED', evidence: 'the claim text' } };
    ledger.record(obs, verdict, { kind: 'block', demand: '[SSTF EVENT: CLAIM]' });
    expect(ledger.recent('CLAIM_SLOP').length).toBe(1);
    expect(ledger.recent()[0]!.triad.pattern).not.toBe(''); // no triad = no row
    expect(ledger.recent()[0]!.action?.kind).toBe('block');
    expect(ledger.recent()[0]!.className).toBe('CLAIM_SLOP');
  });

  it('THE TRIAD-COMPLETENESS: a record without its triad THROWS EVENT_TRIAD_MISSING (no row)', () => {
    const ledger = new EventLedger();
    const obs: NormalizedObservation = { sessionID: 's1', type: 'message.updated', text: 'x', at: Date.now() };
    expect(() => ledger.record(obs, { slopClass: 'CLAIM_SLOP', triad: { pattern: '', state: '', evidence: '' } }))
      .toThrow('EVENT_TRIAD_MISSING');
    expect(ledger.all().length).toBe(0); // NO ROW — the throw preceded the append
  });

  it('ADVERSARIAL: a missing evidence field → throws; the ledger stays empty', () => {
    const ledger = new EventLedger();
    expect(() => ledger.record({} as never, { slopClass: 'OVER_AUDIT', triad: { pattern: 'd', state: 'c', evidence: '' } }))
      .toThrow('EVENT_TRIAD_MISSING');
    expect(ledger.all().length).toBe(0);
  });

  it('THE REPLAY PROOF (SPEC-3 §9.8): the three debacle events produce the three non-BENIGN rows', () => {
    const ledger = new EventLedger();
    const t = Date.now();
    ledger.record({ sessionID: 's', type: 'AUDIT_DONE', text: '', at: t }, { slopClass: 'OVER_AUDIT', triad: { pattern: 'density', state: 'CLASSIFIED', evidence: 'findings=2614 files=247' } }, { kind: 'block', demand: '[LOOP: OVER_FIRED]' });
    ledger.record({ sessionID: 's', type: 'loop.plan', text: 'add output.error', at: t }, { slopClass: 'DESTRUCTIVE_PLAN', triad: { pattern: 'arch', state: 'CLASSIFIED', evidence: 'add output.error' } }, { kind: 'block', demand: '[LOOP: CONTRADICTION]' });
    ledger.record({ sessionID: 's', type: 'message.updated', text: 'a bare victory claim', at: t }, { slopClass: 'CLAIM_SLOP', triad: { pattern: 'claim', state: 'CLASSIFIED', evidence: 'the claim text' } }, { kind: 'block', demand: '[SSTF EVENT: CLAIM]' });
    expect(ledger.recent().filter((r) => r.className !== 'BENIGN').length).toBe(3);
    expect(ledger.recent('OVER_AUDIT', 10_000).length).toBe(1);
    expect(ledger.recent('CALIB_STALE', 10_000).length).toBe(0);
  });
});
