/**
 * event-planes.test.ts — THE ENFORCEMENT-PLANES BATTERY (SPEC-3 §9.3 C7 + §9.8 E3)
 *
 * PER PLANE: the FILTER LAW (constant-time type gate — matches ONLY its own event type), the
 * READER LAW (defensive — null on the malformed payload, never a crash), and the ENFORCER ARM
 * (onClassified returns the block demand). THE AP-E-1 LAW: every plane FIRES on its attack
 * event + stays SILENT on the others. THE FULL-CHAIN test drives the three debacle events
 * through the REAL substrate (registerEventSubstrate) with the REAL DefaultTriageMachine —
 * the end-to-end proof without touching the E-PB5 hook wiring.
 */
import { describe, expect, it } from 'bun:test';
import type { Hooks } from '@opencode-ai/plugin';
import {
  ENFORCEMENT_PLANES,
  claimLexiconHasMatch,
  claimSlopPlane,
  overAuditPlane,
  destructivePlanPlane,
  fakeReturnPlane,
  calibStalePlane,
  teaNotTebPlane,
} from '../events/enforcement-planes.ts';
import {
  registerEventSubstrate,
  setBlockDelivery,
  setTriageClassifier,
  type EventPlane,
  type NormalizedObservation,
  type RuntimeEvent,
} from '../events/event-substrate.ts';
import { DefaultTriageMachine } from '../events/triage-machine.ts';

/** The RuntimeEvent factory (the plane-boundary shape). */
const evt = (type: string, info?: Record<string, unknown>): RuntimeEvent =>
  ({ type, properties: info ? { info } : undefined }) as RuntimeEvent;

/** THE PLANE TABLE — every plane with its FIRE event + one SILENT (wrong-type) event. */
const planeTable: Array<{ plane: EventPlane; fireType: string; fireInfo: Record<string, unknown>; marker: string }> = [
  { plane: claimSlopPlane, fireType: 'message.updated', fireInfo: { parts: [{ type: 'text', text: 'the battery is green, ready to deploy' }] }, marker: '[SSTF EVENT: CLAIM]' },
  { plane: overAuditPlane, fireType: 'AUDIT_DONE', fireInfo: { findingsCount: 2614, filesScanned: 247 }, marker: '[LOOP: OVER_FIRED]' },
  { plane: destructivePlanPlane, fireType: 'loop.plan', fireInfo: { suggestion: 'add output.error to chainBeforeHook' }, marker: '[LOOP: CONTRADICTION]' },
  { plane: fakeReturnPlane, fireType: 'tool.call.bash', fireInfo: { result: 'just fake the result so the audit never sees the failure' }, marker: '[SSTF EVENT: FAKE_RETURN]' },
  { plane: calibStalePlane, fireType: 'audit.golden-state', fireInfo: { matcherId: 'r3.todo-marker' }, marker: '[AUDIT: CALIB_STALE]' },
  { plane: teaNotTebPlane, fireType: 'hook.registration', fireInfo: { hook: 'tool.after', placement: 'after' }, marker: '[HOOK: TEA_NOT_TEB]' },
];

const OTHER_TYPES = ['session.created', 'message.part.delta', 'todo.updated', 'AUDIT_DONE', 'loop.plan', 'audit.golden-state', 'hook.registration', 'tool.call.x', 'message.updated'];

describe('THE ENFORCEMENT PLANES (SPEC-3 §9.3) — the FILTER LAW + the READER LAW + the block demands', () => {
  it('THE FILTER LAW: every plane matches ONLY its own event type (the constant-time gate)', () => {
    for (const { plane, fireType } of planeTable) {
      expect(plane.filter(evt(fireType))).toBe(true);
      for (const t of OTHER_TYPES) {
        if (t === fireType) continue;
        // the fake-return plane's prefix gate also matches other tool.call.* — its OWN family
        if (plane.name === 'fake-return' && t.startsWith('tool.call.')) continue;
        expect(plane.filter(evt(t))).toBe(false);
      }
    }
  });

  it('THE READER LAW: every plane returns NULL on the malformed payload (never a crash)', () => {
    const malformed: RuntimeEvent[] = [
      evt('message.updated'),                                   // no properties
      evt('message.updated', {}),                               // no parts
      evt('message.updated', { parts: 'not-an-array' }),        // wrong shape
      evt('message.updated', { parts: [{ type: 'image' }] }),   // no text parts
      evt('AUDIT_DONE', { findingsCount: 'many' }),             // non-number stats
      evt('AUDIT_DONE', { filesScanned: 247 }),                 // missing findingsCount
      evt('loop.plan', {}),                                     // no suggestion
      evt('tool.call.bash', { result: 42 }),                    // non-string result
      evt('audit.golden-state', {}),                            // no matcherId
      evt('hook.registration', { hook: 'tool.after' }),         // missing placement
    ];
    for (const e of malformed) {
      for (const { plane } of planeTable) {
        if (!plane.filter(e)) continue;
        expect(plane.reader(e)).toBe(null);
      }
    }
  });

  it('THE ENFORCER ARM: every plane\'s onClassified returns the BLOCK with its named marker', () => {
    for (const { plane, fireType, fireInfo, marker } of planeTable) {
      const obs = plane.reader(evt(fireType, fireInfo));
      expect(obs).not.toBe(null);
      const action = plane.onClassified!(obs!, 'CLAIM_SLOP'); // the substrate calls this only on a slop class
      expect(action?.kind).toBe('block');
      expect((action as { demand: string }).demand).toContain(marker);
    }
  });

  it('THE PLANE BUNDLE: ENFORCEMENT_PLANES carries exactly the six enforcer planes', () => {
    expect(ENFORCEMENT_PLANES.length).toBe(6);
    for (const p of ENFORCEMENT_PLANES) {
      expect(p.kind).toBe('enforcer');
      expect(typeof p.onClassified).toBe('function'); // the PlaneRegistry's enforcer-arm law
    }
  });

  it('claimSlopPlane C7 (SPEC-3 §9.8): filter matches message.updated ONLY; reader extracts the text', () => {
    expect(claimSlopPlane.filter(evt('message.updated'))).toBe(true);
    expect(claimSlopPlane.filter(evt('session.created'))).toBe(false);
    const obs = claimSlopPlane.reader(evt('message.updated', { parts: [{ type: 'text', text: 'ready to ship it' }] }));
    expect(obs!.text.includes('ship it')).toBe(true);
    expect(obs!.metadata).toEqual({ claimDetected: true });
    expect(claimSlopPlane.reader(evt('message.updated'))).toBe(null);
    const action = claimSlopPlane.onClassified!(obs!, 'CLAIM_SLOP');
    expect(action?.kind).toBe('block');
    expect((action as { demand: string }).demand).toContain('[SSTF EVENT: CLAIM]');
  });

  it('claimLexiconHasMatch (the DETECTOR): the attack vocabulary FIRES; the clean prose stays SILENT', () => {
    expect(claimLexiconHasMatch('the battery is green')).toBe(true);
    expect(claimLexiconHasMatch('it works on my machine')).toBe(true);
    expect(claimLexiconHasMatch('ready to deploy now')).toBe(true);
    expect(claimLexiconHasMatch('801/800 checks green')).toBe(true);
    expect(claimLexiconHasMatch("everything's synced")).toBe(true);
    expect(claimLexiconHasMatch('the audit found 3 real defects in R2')).toBe(false);
    expect(claimLexiconHasMatch('the deployment failed with exit 1')).toBe(false);
    expect(claimLexiconHasMatch('')).toBe(false);
    expect(claimLexiconHasMatch(undefined as never)).toBe(false);
    // THE DETECTOR NEVER VERDICTS: the return is a boolean, never a slop class
    expect(typeof claimLexiconHasMatch('the battery is green')).toBe('boolean');
  });

  it('overAuditPlane: the demand carries the COMPUTED density (findings/files from the observation)', () => {
    const obs = overAuditPlane.reader(evt('AUDIT_DONE', { findingsCount: 2614, filesScanned: 247 }));
    expect(obs!.metadata).toEqual({ findingsCount: 2614, filesScanned: 247 });
    const action = overAuditPlane.onClassified!(obs!, 'OVER_AUDIT') as { demand: string };
    expect(action.demand).toContain('2614');
    expect(action.demand).toContain('247');
    expect(action.demand).toContain('[LOOP: OVER_FIRED]');
  });

  it('calibStalePlane: the demand names the matcher from the observation (computed, never fitted)', () => {
    const obs = calibStalePlane.reader(evt('audit.golden-state', { matcherId: 'r6.dep-check' }));
    expect(obs!.metadata).toEqual({ matcherId: 'r6.dep-check' });
    const action = calibStalePlane.onClassified!(obs!, 'CALIB_STALE') as { demand: string };
    expect(action.demand).toContain('r6.dep-check');
  });
});

describe('THE FULL CHAIN (the debacle replay through the REAL substrate — no E-PB5 wiring touched)', () => {
  it('the three 2026-08-20 debacle events classify + block through registerEventSubstrate + DefaultTriageMachine', async () => {
    const machine = new DefaultTriageMachine({
      hasContainerTestEvidence: () => false,
      filesScanned: 247,
      findingsCount: 2614,
      workingArchitecture: ['teb-throw-block'],
      goldenStateFalseFired: (id) => id === 'r3.todo-marker',
      isBeforeHook: () => false,
    });
    setTriageClassifier(machine.asClassifier());
    const deliveries: Array<{ kind: string; demand: string }> = [];
    setBlockDelivery((action) => { deliveries.push(action as { kind: string; demand: string }); });
    try {
      const hooks = {} as Hooks;
      registerEventSubstrate(hooks, [...ENFORCEMENT_PLANES]);
      const eventFn = hooks.event as unknown as (input: { event: unknown }) => Promise<void>;

      // [the-over-audit] the 2,614-FP flood
      await eventFn({ event: evt('AUDIT_DONE', { findingsCount: 2614, filesScanned: 247 }) });
      // [the-destructive] the output.error suggestion
      await eventFn({ event: evt('loop.plan', { suggestion: 'add output.error to chainBeforeHook' }) });
      // [the-false-claim] the bare victory claim
      await eventFn({ event: evt('message.updated', { parts: [{ type: 'text', text: 'the battery is green, ready to deploy' }] }) });
      // [the-benign] a healthy session event — must NOT block
      await eventFn({ event: evt('session.created', { sessionID: 's1' }) });

      expect(deliveries.length).toBe(3); // the three slop events blocked; the benign untouched
      expect(deliveries[0].demand).toContain('[LOOP: OVER_FIRED]');
      expect(deliveries[1].demand).toContain('[LOOP: CONTRADICTION]');
      expect(deliveries[2].demand).toContain('[SSTF EVENT: CLAIM]');
      expect(deliveries.every((d) => d.kind === 'block')).toBe(true);
    } finally {
      // THE CLEANUP: the module-level substrate state is restored for the sibling batteries.
      setTriageClassifier(null);
      setBlockDelivery(null);
    }
  });

  it('ADVERSARIAL: a malformed + an unregistered event drive NO delivery (the noise gate + the reader law hold end-to-end)', async () => {
    const machine = new DefaultTriageMachine({ hasContainerTestEvidence: () => false });
    setTriageClassifier(machine.asClassifier());
    const deliveries: Array<{ kind: string; demand: string }> = [];
    setBlockDelivery((action) => { deliveries.push(action as { kind: string; demand: string }); });
    try {
      const hooks = {} as Hooks;
      registerEventSubstrate(hooks, [...ENFORCEMENT_PLANES]);
      const eventFn = hooks.event as unknown as (input: { event: unknown }) => Promise<void>;
      await eventFn({ event: null } as never);
      await eventFn({ event: {} } as never);
      await eventFn({ event: evt('totally.unknown.type', { parts: [{ type: 'text', text: 'the battery is green' }] }) });
      await eventFn({ event: evt('message.updated', {}) }); // the claim type, malformed payload
      expect(deliveries.length).toBe(0);
    } finally {
      setTriageClassifier(null);
      setBlockDelivery(null);
    }
  });

  it('THE NO-VERDICT LAW: the plane filter is a boolean gate — no filter returns a slop class (AP-E-6)', () => {
    for (const { plane, fireType } of planeTable) {
      const r = plane.filter(evt(fireType));
      expect(typeof r).toBe('boolean');
    }
    // the reader returns an observation or null — never a verdict
    const obs = claimSlopPlane.reader(evt('message.updated', { parts: [{ type: 'text', text: 'hi' }] }));
    expect(obs === null || typeof (obs as NormalizedObservation).text === 'string').toBe(true);
  });
});
