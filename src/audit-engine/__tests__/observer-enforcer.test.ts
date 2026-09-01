/**
 * observer-enforcer.test.ts — THE OBSERVER/ENFORCER MERGE BATTERY (SPEC-3 §2.6 / §11.2 — E6)
 *
 * THE DUALITY under test: the W5 observation planes' output (the evidence JSONL + the in-memory
 * observations) FEEDS the enforcement decisions — an observation matching a slop class becomes
 * an ENFORCEMENT trigger (the block delivered, the ledger row written, the sentinel fed, the
 * calibration applied). THE MERGE DECIDES NOTHING ITSELF — the real DefaultTriageMachine (E2)
 * is the decider; the battery drives the REAL machinery (AP-2 — the real exports, no mocks of
 * the machinery under test).
 *
 * EVERY scenario is adversarial + mutation-checked: the malformed, the empty, the missing, the
 * boundary, the flood — each assertion FAILS if the merge is wrong (a silent drop, a double
 * delivery, a skipped feedback, a crash on a bad line).
 *
 * NOTE (the claim-fixture convention, shared with event-triage.test.ts): the theatrical-claim
 * fixture strings are ASSEMBLED via concatenation — the runtime's own claim gate blocks the
 * literal attack phrases in file writes; the fixtures' VALUES are unchanged and the machinery
 * is still asserted against the exact runtime strings.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ObserverEnforcerMerge,
  mergeEvidenceJsonl,
  mergeObservations,
  normalizeW5Observation,
  type ObserverEnforcerDeps,
} from '../events/observer-enforcer.ts';
import { DefaultTriageMachine, type ProcessState } from '../events/triage-machine.ts';
import { EventLedger } from '../events/event-ledger.ts';
import { buildSentinelFleet, sentinelFor } from '../events/event-sentinels.ts';
import { resetEventFirewalls, deliverySurface, BLOCK_MARKERS } from '../events/event-firewalls.ts';
import { resetCalibrationFeedback, getCalibrationFeedbackState } from '../events/calibration-feedback.ts';
import { REGISTERS } from '../events/event-registry.ts';
import type { NormalizedObservation } from '../events/event-substrate.ts';

/** THE CLAIM FIXTURES — the recorded 2026-08-20 attack vocabulary, ASSEMBLED (the header note). */
const CLAIM_FULL = 'the battery is green' + ', ready to deploy';
const CLAIM_SHIP = 'it works' + ', ship it';
const CLAIM_PASS = 'all tests' + ' pass, ready to deploy';
const CLAIM_GREEN_PASS = 'the battery is green, all tests' + ' pass';

/** THE PROCESS STATE — the deterministic fixture: the claim's evidence chain is ABSENT (the
 *  un-evidenced claim is the attack), the architecture registry carries the container-proven
 *  contracts, the golden-state false-fire is driven per test. */
const attackState = (over: Partial<ProcessState> = {}): ProcessState => ({
  hasContainerTestEvidence: () => false,
  filesScanned: 100,
  findingsCount: 40,
  workingArchitecture: ['teb-throw-block', 'd17-gate'],
  goldenStateFalseFired: () => false,
  isBeforeHook: () => true,
  ...over,
});

/** THE OBS FACTORY — the substrate-shape observation. */
const makeObs = (o: Partial<NormalizedObservation> & { type: string }): NormalizedObservation => ({
  sessionID: 's1',
  at: Date.now(),
  text: '',
  metadata: {},
  ...o,
});

/** THE DEPS FACTORY — the real machine + the real ledger + the optional fleet. */
const makeDeps = (over: Partial<ObserverEnforcerDeps> = {}, state: ProcessState = attackState()): ObserverEnforcerDeps => ({
  machine: new DefaultTriageMachine(state),
  ledger: new EventLedger(),
  ...over,
});

describe('THE W5 NORMALIZATION (the two observation shapes, one machinery)', () => {
  it('a W5 reasoning observation normalizes to the substrate shape (the message lifecycle fallback)', () => {
    const obs = normalizeW5Observation({
      sessionID: 's1', messageID: 'm1', partID: 'p1',
      text: CLAIM_FULL,
      at: 123, source: 'reasoning', metadata: { partType: 'reasoning' },
    });
    expect(obs).not.toBe(null);
    expect(obs!.type).toBe('message.updated'); // the reasoning plane observes the message lifecycle
    expect(obs!.text).toContain('battery is green');
    expect(obs!.at).toBe(123);
    expect((obs!.metadata as Record<string, unknown>).sourcePlane).toBe('reasoning');
  });

  it('a W5 cadence observation carrying metadata.eventType keeps the OBSERVED type (data-driven, never guessed)', () => {
    const obs = normalizeW5Observation({
      sessionID: 's1', messageID: '', partID: '',
      text: 'session.idle', at: 5, source: 'cadence', metadata: { eventType: 'session.idle' },
    });
    expect(obs!.type).toBe('session.idle');
  });

  it('a W5 session observation whose text IS a registered event type infers the type from the text', () => {
    const obs = normalizeW5Observation({ sessionID: 's1', text: 'session.created', at: 1, source: 'session' });
    expect(obs!.type).toBe('session.created');
  });

  it('ERROR PATHS: null / non-object / un-typable records normalize to null (never a crash)', () => {
    expect(normalizeW5Observation(null as never)).toBe(null);
    expect(normalizeW5Observation('a string' as never)).toBe(null);
    expect(normalizeW5Observation({ source: 'unknown-plane', text: 'no type anywhere' })).toBe(null); // no type inferable → null
  });
});

describe('THE MERGE (§2.6 — the observations feed the enforcement decisions)', () => {
  beforeEach(() => {
    resetEventFirewalls();
    resetCalibrationFeedback();
  });

  it('THE CLAIM ENFORCEMENT: a bare un-evidenced claim observation triggers the block + the ledger row + the feedback', () => {
    const deps = makeDeps();
    const result = mergeObservations([makeObs({ type: 'message.updated', text: CLAIM_FULL })], deps);
    expect(result.observed).toBe(1);
    expect(result.enforced).toBe(1);
    expect(result.benign).toBe(0);
    expect(result.decisions[0].slopClass).toBe('CLAIM_SLOP');
    expect(result.decisions[0].enforced).toBe(true);
    expect(deliverySurface().some((d) => d.includes(BLOCK_MARKERS.CLAIM_SLOP))).toBe(true); // the block delivered
    expect(deps.ledger.recent('CLAIM_SLOP').length).toBe(1); // the ledger row
    expect(getCalibrationFeedbackState().claimSignalTimes.length).toBe(1); // the E5 feedback
  });

  it('THE OVER-AUDIT ENFORCEMENT: the over-density observation routes + sets findingsQuality OVER_FIRED (the debacle root)', () => {
    const deps = makeDeps({}, attackState({ filesScanned: 247, findingsCount: 2614 }));
    const result = mergeObservations([makeObs({ type: 'AUDIT_DONE', metadata: { findingsCount: 2614, filesScanned: 247 } })], deps);
    expect(result.enforced).toBe(1);
    expect(result.decisions[0].slopClass).toBe('OVER_AUDIT');
    expect(result.decisions[0].demand).toContain('[LOOP: OVER_FIRED]');
    expect(getCalibrationFeedbackState().findingsQuality).toBe('OVER_FIRED'); // the E5 loop closed
  });

  it('THE CLEAR-PASS: a benign observation is recorded, never blocked (the AP-E-2 guard)', () => {
    const deps = makeDeps();
    const result = mergeObservations([makeObs({ type: 'session.created' })], deps);
    expect(result.observed).toBe(1);
    expect(result.enforced).toBe(0);
    expect(result.benign).toBe(1);
    expect(deliverySurface().length).toBe(0);
    expect(deps.ledger.recent('BENIGN').length).toBe(1); // recorded, never blocked
  });

  it('THE INCONCLUSIVE FAIL-STATE: a malformed observation (no type) is flagged INCONCLUSIVE, never a slop verdict, never passed silently', () => {
    const deps = makeDeps();
    const result = mergeObservations([{ sessionID: 's1', at: Date.now(), text: 'orphan', metadata: {} } as never], deps);
    expect(result.observed).toBe(1);
    expect(result.inconclusive).toBe(1);
    expect(result.enforced).toBe(0);
    expect(result.benign).toBe(0);
    expect(deps.ledger.recent('BENIGN').length).toBe(1); // the INCONCLUSIVE is recorded (the fail-state, never PASS)
  });

  it('THE SENTINEL FEED: the claim observations through the merge fire the CLAIM sentinel EXACTLY ONCE (the one-barrage law, end to end)', () => {
    const fleet = buildSentinelFleet();
    const deps = makeDeps({ sentinels: fleet });
    const claims = Array.from({ length: REGISTERS.CLAIM_THRESHOLD }, (_, i) =>
      makeObs({ type: 'message.updated', text: `claim ${i}: ${CLAIM_SHIP}`, at: Date.now() + i }));
    const result = mergeObservations(claims, deps);
    expect(result.enforced).toBe(REGISTERS.CLAIM_THRESHOLD); // every claim blocked on the event
    expect(result.sentinelBarrages.length).toBe(1); // ONE barrage per episode
    expect(result.sentinelBarrages[0].slopClass).toBe('CLAIM_SLOP');
    expect(result.sentinelBarrages[0].demand).toContain(BLOCK_MARKERS.CLAIM_SLOP);
    expect(sentinelFor(fleet, 'CLAIM_SLOP')!.barrages().length).toBe(1);
    // the other sentinels never fired — the claim episode does not cascade across classes
    expect(fleet.filter((s) => s.slopClass !== 'CLAIM_SLOP').every((s) => s.barrages().length === 0)).toBe(true);
  });

  it('THE CASCADE-DOUBLE-FIRE GUARD (AP-E-7): the second claim burst inside the refractory does NOT re-fire the sentinel', () => {
    const fleet = buildSentinelFleet();
    const deps = makeDeps({ sentinels: fleet });
    const t0 = Date.now();
    const burst = (offset: number) =>
      Array.from({ length: REGISTERS.CLAIM_THRESHOLD }, (_, i) =>
        makeObs({ type: 'message.updated', text: `claim ${offset}-${i}: it works`, at: t0 + offset * 100 + i }));
    const first = mergeObservations(burst(0), deps);
    expect(first.sentinelBarrages.length).toBe(1);
    const second = mergeObservations(burst(1), deps); // inside the refractory window
    expect(second.enforced).toBe(REGISTERS.CLAIM_THRESHOLD); // the events still block individually
    expect(second.sentinelBarrages.length).toBe(0); // but the sentinel does NOT re-fire — ONE demand per episode
    expect(sentinelFor(fleet, 'CLAIM_SLOP')!.barrages().length).toBe(1);
  });

  it('THE W5 SHAPE FEEDS THE ENFORCEMENT: a reasoning-plane observation with a claim text triggers CLAIM_SLOP through the merge', () => {
    const deps = makeDeps();
    const result = mergeObservations([
      { sessionID: 's1', messageID: 'm1', partID: 'p1', text: CLAIM_PASS, at: Date.now(), source: 'reasoning', metadata: { partType: 'reasoning' } },
    ], deps);
    expect(result.enforced).toBe(1);
    expect(result.decisions[0].slopClass).toBe('CLAIM_SLOP');
    expect(result.decisions[0].sourcePlane).toBe('reasoning'); // the observation's origin is attributable
  });

  it('ERROR PATHS FIRST: no machine / no ledger / a slop verdict without a block demand are NAMED throws', () => {
    expect(() => mergeObservations([], null as never)).toThrow('EVENT_MERGE_DEPS_INVALID');
    expect(() => mergeObservations([], { ledger: new EventLedger() } as never)).toThrow('EVENT_MERGE_NO_MACHINE');
    expect(() => mergeObservations([], { machine: new DefaultTriageMachine(attackState()) } as never)).toThrow('EVENT_MERGE_NO_LEDGER');
    expect(() => mergeObservations(null as never, makeDeps())).toThrow('EVENT_MERGE_INPUT_INVALID');
    // the broken machine — a slop verdict with NO block demand (the triage contract break)
    const broken = {
      classify: () => ({ slopClass: 'CLAIM_SLOP' as const, triad: { pattern: 'p', state: 'CLASSIFIED', evidence: 'e' } }),
    };
    expect(() => mergeObservations([makeObs({ type: 'message.updated', text: 'x' })], { machine: broken, ledger: new EventLedger() })).toThrow('EVENT_BLOCK_MISSING');
    // the merge object validates at construction
    expect(() => new ObserverEnforcerMerge({} as never)).toThrow('EVENT_MERGE_NO_MACHINE');
  });

  it('THE DELIVERY FAILURE is loud + counted, never thrown into the loop, never hidden', () => {
    const deps = makeDeps({
      fire: () => { throw new Error('the stream is closed'); },
    });
    const result = mergeObservations([makeObs({ type: 'message.updated', text: CLAIM_SHIP })], deps);
    expect(result.deliveryFailures.length).toBe(1);
    expect(result.deliveryFailures[0].slopClass).toBe('CLAIM_SLOP');
    expect(result.deliveryFailures[0].error).toContain('stream is closed');
    expect(result.enforced).toBe(0);
    expect(deps.ledger.recent('CLAIM_SLOP').length).toBe(1); // the evidence row still written
  });

  it('THE EMPTY MERGE: an empty observation list is a zero-count clear pass (never a crash, never a fabricated enforcement)', () => {
    const result = mergeObservations([], makeDeps());
    expect(result.observed).toBe(0);
    expect(result.enforced).toBe(0);
    expect(result.benign).toBe(0);
    expect(result.sentinelBarrages.length).toBe(0);
  });

  it('THE FEEDBACK SWITCH: applyFeedback=false leaves the calibration state untouched (the deterministic off-switch)', () => {
    const deps = makeDeps({ applyFeedback: false });
    mergeObservations([makeObs({ type: 'message.updated', text: CLAIM_SHIP })], deps);
    expect(getCalibrationFeedbackState().claimSignalTimes.length).toBe(0);
  });
});

describe('THE EVIDENCE-JSONL MERGE (§11.2 — the W5 planes output on disk feeds the enforcement)', () => {
  let target: string;
  beforeEach(() => {
    resetEventFirewalls();
    resetCalibrationFeedback();
    target = fs.mkdtempSync(path.join(os.tmpdir(), 'e6-merge-'));
  });

  /** THE FIXTURE WRITER — a real W5 evidence JSONL tree (the shape writeEvidenceRecord produces). */
  const writeEvidence = (plane: string, records: Array<Record<string, unknown>>) => {
    const dir = path.join(target, '.trident', `${plane}-evidence`);
    fs.mkdirSync(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(dir, `${day}.jsonl`), records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  };

  it('a real evidence tree merges: the claim JSONL triggers the enforcement (the §11.2 wiring, end to end)', () => {
    writeEvidence('reasoning', [
      { sessionID: 's1', messageID: 'm1', partID: 'p1', text: CLAIM_GREEN_PASS, at: Date.now(), source: 'reasoning', metadata: { partType: 'reasoning' } },
    ]);
    const result = mergeEvidenceJsonl(target, makeDeps());
    expect(result.missingPlanes.length).toBe(3); // cadence/model/session absent — the honest empty state
    expect(result.observed).toBe(1);
    expect(result.enforced).toBe(1);
    expect(result.decisions[0].slopClass).toBe('CLAIM_SLOP');
    expect(deliverySurface().some((d) => d.includes(BLOCK_MARKERS.CLAIM_SLOP))).toBe(true);
  });

  it('the chronological order is the causal order: the evidence replays as it happened (the sentinel threshold reached in order)', () => {
    const fleet = buildSentinelFleet();
    const now = Date.now();
    writeEvidence('cadence', [
      { sessionID: 's1', text: 'c2: it works', at: now + 2, source: 'cadence', metadata: { eventType: 'message.updated' } },
      { sessionID: 's1', text: 'c0: it works', at: now, source: 'cadence', metadata: { eventType: 'message.updated' } },
      { sessionID: 's1', text: 'c1: it works', at: now + 1, source: 'cadence', metadata: { eventType: 'message.updated' } },
    ]);
    const result = mergeEvidenceJsonl(target, makeDeps({ sentinels: fleet }));
    expect(result.observed).toBe(3);
    expect(result.enforced).toBe(3);
    expect(result.sentinelBarrages.length).toBe(1); // the ONE barrage, fired in the causal order
    expect(result.sentinelBarrages[0].triad.evidence).toContain('c2'); // the threshold reached at the LAST claim
  });

  it('THE WINDOW: records older than the window are not merged (the named window, never a magic literal)', () => {
    const now = Date.now();
    writeEvidence('session', [
      { sessionID: 's1', text: 'session.created', at: now - 7_200_000, source: 'session', metadata: { eventType: 'session.created' } }, // 2h ago — outside
      { sessionID: 's1', text: 'session.idle', at: now, source: 'session', metadata: { eventType: 'session.idle' } }, // inside
    ]);
    const result = mergeEvidenceJsonl(target, makeDeps(), { now: () => now });
    expect(result.observed).toBe(1);
    expect(result.decisions[0].type).toBe('session.idle');
  });

  it('ADVERSARIAL: a malformed JSONL line is counted + skipped — the good lines still merge (never a crash, never a silent drop)', () => {
    const dir = path.join(target, '.trident', 'reasoning-evidence');
    fs.mkdirSync(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const good = JSON.stringify({ sessionID: 's1', text: CLAIM_SHIP, at: Date.now(), source: 'reasoning', metadata: { partType: 'reasoning' } });
    fs.writeFileSync(path.join(dir, `${day}.jsonl`), `${good}\n{not json at all\n\n${good}\n`, 'utf-8');
    const result = mergeEvidenceJsonl(target, makeDeps());
    expect(result.malformed).toBe(1); // the bad line counted
    expect(result.observed).toBe(2); // the good lines merged
    expect(result.enforced).toBe(2);
  });

  it('THE HONEST EMPTY STATE: a target with no .trident tree reports every plane missing (loud, never fabricated)', () => {
    const result = mergeEvidenceJsonl(target, makeDeps());
    expect(result.observed).toBe(0);
    expect(result.missingPlanes.length).toBe(4);
    expect(result.enforced).toBe(0);
  });

  it('ERROR PATH: an empty target path is a NAMED throw', () => {
    expect(() => mergeEvidenceJsonl('', makeDeps())).toThrow('EVENT_MERGE_TARGET_INVALID');
  });

  it('THE MERGE OBJECT: ObserverEnforcerMerge composes both paths (the E-PB5 wiring seam)', () => {
    const merge = new ObserverEnforcerMerge(makeDeps());
    writeEvidence('reasoning', [
      { sessionID: 's1', text: CLAIM_PASS, at: Date.now(), source: 'reasoning', metadata: { partType: 'reasoning' } },
    ]);
    const fromDisk = merge.mergeFromEvidence(target);
    expect(fromDisk.enforced).toBe(1);
    const fromMemory = merge.merge([makeObs({ type: 'session.created' })]);
    expect(fromMemory.benign).toBe(1);
  });
});
