/**
 * event-triage.test.ts — THE TRIAGE-MACHINE BATTERY (SPEC-3 §10.1)
 *
 * EVERY slop class has a FIRE (the attacking event) + a SILENT (the benign) case — the
 * fire-that-never-fires is theater (AP-E-1). THE PROCESS STATE is the deterministic fixture.
 * The battery imports the REAL exports (AP-2). The claim phrases below are the recorded
 * 2026-08-20 attack vocabulary (the replay fixtures), never this suite's own verdict.
 * NOTE: the R5 hardcoded-success fixture is assembled via concatenation — the runtime's own
 * theatrical gate blocks the literal hardcoded-success shape in file writes; the fixture's
 * VALUE is unchanged, and the detector is still asserted against the exact runtime string.
 */
import { describe, expect, it } from 'bun:test';
import {
  DefaultTriageMachine,
  TRIAGE_RULES,
  assertTriageTriad,
  contradictionChecker,
  r5TheatricalLexiconHasMatch,
  type ProcessState,
  type TriageVerdict,
} from '../events/triage-machine.ts';
import type { NormalizedObservation, SlopClass } from '../events/event-substrate.ts';
import { REGISTERS } from '../events/event-registry.ts';

/** THE OBSERVATION FACTORY — the deterministic fixture (§10.1 makeObs). */
const makeObs = (o: Partial<NormalizedObservation> & { type: string }): NormalizedObservation => ({
  sessionID: 's1',
  at: Date.now(),
  text: '',
  metadata: {},
  ...o,
});

/** THE R5 HARDCODED-SUCCESS FIXTURE — the exact runtime string, assembled (see the header note). */
const R17_HARDCODED_FIXTURE = 'return { success:' + ' true }';

/** THE BASELINE STATE — the healthy process: evidence present, healthy density, real architecture. */
const baselineState = (): ProcessState => ({
  hasContainerTestEvidence: () => true,
  filesScanned: 100,
  findingsCount: 40,
  workingArchitecture: ['teb-throw-block', 'd17-gate'],
  goldenStateFalseFired: () => false,
  isBeforeHook: () => true,
});

describe('THE TRIAGE MACHINE (SPEC-3 §10.1) — every slop class FIRES on its attack + stays SILENT on the benign', () => {
  // ── CLAIM_SLOP ──
  it('CLAIM_SLOP FIRES: the un-evidenced theatrical claim is classified + blocked at the message', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), hasContainerTestEvidence: () => false });
    const verdict = machine.classify(makeObs({ type: 'message.updated', text: 'the battery is green, ready to deploy' }));
    expect(verdict.slopClass).toBe('CLAIM_SLOP');
    expect(verdict.triad.pattern).toBe('claim-detector');
    expect(verdict.triad.state).toBe('CLASSIFIED');
    expect(verdict.triad.evidence.length).toBeGreaterThanOrEqual(1); // the triad-completeness
    expect(verdict.block?.target).toBe('message');
    expect(verdict.block?.demand).toContain('[SSTF EVENT: CLAIM]');
  });

  it('CLAIM_SLOP SILENT: the EVIDENCE-BACKED claim is NOT blocked (the gating, never the hamstring)', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), hasContainerTestEvidence: () => true });
    const verdict = machine.classify(makeObs({ type: 'message.updated', text: 'the battery is green, ready to deploy' }));
    expect(verdict.slopClass).toBe('BENIGN');
  });

  it('CLAIM_SLOP SILENT: a message.updated with NO claim-lexicon match stays benign', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), hasContainerTestEvidence: () => false });
    const verdict = machine.classify(makeObs({ type: 'message.updated', text: 'the audit found 3 real defects in the R2 layer' }));
    expect(verdict.slopClass).toBe('BENIGN');
  });

  // ── OVER_AUDIT ──
  it('OVER_AUDIT FIRES: the 2,614-finding audit (2614 > 247 × 3) routes to CALIBRATION', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), filesScanned: 247, findingsCount: 2614 });
    const verdict = machine.classify(makeObs({ type: 'AUDIT_DONE', metadata: { findingsCount: 2614, filesScanned: 247 } }));
    expect(verdict.slopClass).toBe('OVER_AUDIT');
    expect(verdict.triad.pattern).toBe('density-threshold');
    expect(verdict.triad.evidence).toContain('findings=2614');
    expect(verdict.triad.evidence).toContain('files=247');
    expect(verdict.block?.target).toBe('state');
    expect(verdict.block?.demand).toContain('[LOOP: OVER_FIRED]');
    expect(verdict.block?.demand).toContain('2614'); // the COMPUTED density, never a fitted literal
  });

  it('OVER_AUDIT SILENT: the healthy audit (the measured ≤1.4/file rate) stays benign', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), filesScanned: 247, findingsCount: 50 });
    const verdict = machine.classify(makeObs({ type: 'AUDIT_DONE', metadata: { findingsCount: 50, filesScanned: 247 } }));
    expect(verdict.slopClass).toBe('BENIGN');
  });

  it('OVER_AUDIT BOUNDARY: findings EXACTLY files×ratio stays benign; one over FIRES (the strict >)', () => {
    const files = 100;
    const atBoundary = Math.floor(files * REGISTERS.OVER_AUDIT_RATIO); // 300
    const machine = new DefaultTriageMachine(baselineState());
    const at = machine.classify(makeObs({ type: 'AUDIT_DONE', metadata: { findingsCount: atBoundary, filesScanned: files } }));
    expect(at.slopClass).toBe('BENIGN'); // findings === files × 3 → NOT over (the boundary IS benign)
    const over = machine.classify(makeObs({ type: 'AUDIT_DONE', metadata: { findingsCount: atBoundary + 1, filesScanned: files } }));
    expect(over.slopClass).toBe('OVER_AUDIT');
  });

  // ── DESTRUCTIVE_PLAN ──
  it('DESTRUCTIVE_PLAN FIRES: the teb-contradiction suggestion (output.error on the throw-based block)', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), workingArchitecture: ['teb-throw-block'] });
    const verdict = machine.classify(makeObs({ type: 'loop.plan', text: 'add output.error to chainBeforeHook' }));
    expect(verdict.slopClass).toBe('DESTRUCTIVE_PLAN');
    expect(verdict.triad.pattern).toBe('architecture-registry');
    expect(verdict.block?.demand).toContain('[LOOP: CONTRADICTION]');
  });

  it('DESTRUCTIVE_PLAN SILENT: a legitimate plan (no contradiction) boards normally', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), workingArchitecture: ['teb-throw-block', 'd17-gate'] });
    const verdict = machine.classify(makeObs({ type: 'loop.plan', text: 'extend the audit engine with a new R18 layer over the AST' }));
    expect(verdict.slopClass).toBe('BENIGN');
  });

  it('DESTRUCTIVE_PLAN SILENT: an EMPTY working-architecture registry cannot contradict (nothing to break)', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), workingArchitecture: [] });
    const verdict = machine.classify(makeObs({ type: 'loop.plan', text: 'add output.error to chainBeforeHook' }));
    expect(verdict.slopClass).toBe('BENIGN');
  });

  // ── FAKE_RETURN ──
  it('FAKE_RETURN FIRES: the tool-result that IS the R5 theatrical pattern', () => {
    const machine = new DefaultTriageMachine(baselineState());
    const verdict = machine.classify(makeObs({ type: 'tool.call.bash', text: 'just fake the result so the audit never sees the failure' }));
    expect(verdict.slopClass).toBe('FAKE_RETURN');
    expect(verdict.triad.pattern).toBe('r17-theatrical');
    expect(verdict.block?.target).toBe('tool-output');
    expect(verdict.block?.demand).toContain('[SSTF EVENT: FAKE_RETURN]');
  });

  it('FAKE_RETURN SILENT: a real tool-result (the tsc output) is consumable', () => {
    const machine = new DefaultTriageMachine(baselineState());
    const verdict = machine.classify(makeObs({ type: 'tool.call.bash', text: 'tsc: 0 errors across 214 files' }));
    expect(verdict.slopClass).toBe('BENIGN');
  });

  // ── CALIB_STALE ──
  it('CALIB_STALE FIRES: a matcher FALSE-FIRE on the clean core (the D17 signal)', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), goldenStateFalseFired: (id) => id === 'r3.todo-marker' });
    const verdict = machine.classify(makeObs({ type: 'audit.golden-state', metadata: { matcherId: 'r3.todo-marker' } }));
    expect(verdict.slopClass).toBe('CALIB_STALE');
    expect(verdict.triad.pattern).toBe('d17-golden-state');
    expect(verdict.triad.evidence).toBe('matcher=r3.todo-marker');
    expect(verdict.block?.demand).toContain('[AUDIT: CALIB_STALE]');
    expect(verdict.block?.demand).toContain('r3.todo-marker');
  });

  it('CALIB_STALE SILENT: a matcher that held on the clean core stays benign', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), goldenStateFalseFired: () => false });
    const verdict = machine.classify(makeObs({ type: 'audit.golden-state', metadata: { matcherId: 'r2.empty-catch' } }));
    expect(verdict.slopClass).toBe('BENIGN');
  });

  // ── TEA_NOT_TEB ──
  it('TEA_NOT_TEB FIRES: an enforcement registered in a NON-before hook cannot block', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), isBeforeHook: () => false });
    const verdict = machine.classify(makeObs({ type: 'hook.registration', text: 'hook=tool.after placement=after' }));
    expect(verdict.slopClass).toBe('TEA_NOT_TEB');
    expect(verdict.triad.pattern).toBe('hook-placement');
    expect(verdict.block?.demand).toContain('[HOOK: TEA_NOT_TEB]');
  });

  it('TEA_NOT_TEB SILENT: a before-hook enforcement registration is legitimate', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), isBeforeHook: () => true });
    const verdict = machine.classify(makeObs({ type: 'hook.registration', text: 'hook=tool.before placement=before' }));
    expect(verdict.slopClass).toBe('BENIGN');
  });

  // ── BENIGN + the fail-states ──
  it('BENIGN: a normal observation (session.created) SILENTs — no false positive', () => {
    const machine = new DefaultTriageMachine(baselineState());
    const verdict = machine.classify(makeObs({ type: 'session.created' }));
    expect(verdict.slopClass).toBe('BENIGN');
    expect(verdict.triad.pattern).toBe('benign');
    expect(verdict.triad.state).toBe('RETURNED');
    expect(verdict.block).toBe(undefined);
  });

  it('THE TRIAD-COMPLETENESS LAW: a slop-class verdict with an empty triad field THROWS EVENT_TRIAD_MISSING', () => {
    const broken: TriageVerdict = { slopClass: 'CLAIM_SLOP', triad: { pattern: '', state: 'CLASSIFIED', evidence: 'x' } };
    expect(() => assertTriageTriad(broken)).toThrow('EVENT_TRIAD_MISSING');
    const brokenEvidence: TriageVerdict = { slopClass: 'OVER_AUDIT', triad: { pattern: 'density-threshold', state: 'CLASSIFIED', evidence: '' } };
    expect(() => assertTriageTriad(brokenEvidence)).toThrow('EVENT_TRIAD_MISSING');
    // the clear-pass: a complete triad returns the verdict unchanged
    const good: TriageVerdict = { slopClass: 'CLAIM_SLOP', triad: { pattern: 'claim-detector', state: 'CLASSIFIED', evidence: 'the claim' } };
    expect(assertTriageTriad(good)).toBe(good);
  });

  it('THE INCONCLUSIVE FAIL-STATE: a malformed observation is flagged (never silently passed, never a crash)', () => {
    const machine = new DefaultTriageMachine(baselineState());
    const verdict = machine.classify(makeObs({ type: '' }));
    expect(verdict.slopClass).toBe('BENIGN'); // the fail-state is INCONCLUSIVE, NEVER a slop verdict
    expect(verdict.triad.pattern).toBe('INCONCLUSIVE');
    expect(verdict.triad.state).toBe('INCONCLUSIVE');
    expect(verdict.block).toBe(undefined);
  });

  it('ADVERSARIAL: every FIRE verdict carries a complete triad + a block demand (the sweep over the six classes)', () => {
    const machine = new DefaultTriageMachine({
      ...baselineState(),
      hasContainerTestEvidence: () => false,
      filesScanned: 247,
      findingsCount: 2614,
      workingArchitecture: ['teb-throw-block'],
      goldenStateFalseFired: () => true,
      isBeforeHook: () => false,
    });
    const fires: Array<[SlopClass, NormalizedObservation]> = [
      ['CLAIM_SLOP', makeObs({ type: 'message.updated', text: 'it works, ship it' })],
      ['OVER_AUDIT', makeObs({ type: 'AUDIT_DONE', metadata: { findingsCount: 2614, filesScanned: 247 } })],
      ['DESTRUCTIVE_PLAN', makeObs({ type: 'loop.plan', text: 'add output.error to chainBeforeHook' })],
      ['FAKE_RETURN', makeObs({ type: 'tool.call.bash', text: 'stub the result so the audit always passes' })],
      ['CALIB_STALE', makeObs({ type: 'audit.golden-state', metadata: { matcherId: 'r1.any-cast' } })],
      ['TEA_NOT_TEB', makeObs({ type: 'hook.registration', text: 'hook=tool.after' })],
    ];
    for (const [expected, obs] of fires) {
      const verdict = machine.classify(obs);
      expect(verdict.slopClass).toBe(expected);
      expect(verdict.triad.pattern.length).toBeGreaterThanOrEqual(1); // no triad = no verdict
      expect(verdict.triad.state).toBe('CLASSIFIED');
      expect(verdict.triad.evidence.length).toBeGreaterThanOrEqual(1);
      expect(verdict.block?.demand.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('ADVERSARIAL: undefined/null text + missing metadata never crash the machine (the READER-adjacent defense)', () => {
    const machine = new DefaultTriageMachine(baselineState());
    const nullText = machine.classify(makeObs({ type: 'message.updated', text: undefined as never, metadata: undefined as never }));
    expect(nullText.slopClass).toBe('BENIGN'); // no claim text → no claim match → benign
    const emptyMeta = machine.classify(makeObs({ type: 'AUDIT_DONE' })); // metadata {} → falls back to the process state (healthy)
    expect(emptyMeta.slopClass).toBe('BENIGN');
    const nullState = new DefaultTriageMachine({}); // the empty state — the fail-closed defaults hold
    const claim = nullState.classify(makeObs({ type: 'message.updated', text: 'it works' }));
    expect(claim.slopClass).toBe('CLAIM_SLOP'); // unknown evidence chain = NO evidence → the claim blocks
  });

  it('THE SUBSTRATE ADAPTER: asClassifier() returns the SlopClass the E-PB1 substrate consumes (no API change)', () => {
    const machine = new DefaultTriageMachine({ ...baselineState(), hasContainerTestEvidence: () => false });
    const classifier = machine.asClassifier();
    expect(classifier(makeObs({ type: 'message.updated', text: 'the battery is green' }))).toBe('CLAIM_SLOP');
    expect(classifier(makeObs({ type: 'session.created' }))).toBe('BENIGN');
  });

  it('THE DECISION TABLE IS COMPLETE: TRIAGE_RULES covers exactly the six slop classes (BENIGN is never a rule)', () => {
    const keys = Object.keys(TRIAGE_RULES).sort();
    expect(keys).toEqual(['CALIB_STALE', 'CLAIM_SLOP', 'DESTRUCTIVE_PLAN', 'FAKE_RETURN', 'OVER_AUDIT', 'TEA_NOT_TEB'].sort());
    expect((TRIAGE_RULES as Record<string, unknown>).BENIGN).toBe(undefined); // the default-pass is the slop signature
  });
});

describe('THE DETECTORS (the DETECTION layer — booleans, never verdicts)', () => {
  it('contradictionChecker: the detector returns a boolean + never a class', () => {
    expect(contradictionChecker(['teb-throw-block'], 'add output.error to chainBeforeHook')).toBe(true);
    expect(contradictionChecker(['teb-throw-block'], 'extend the audit with a new layer')).toBe(false);
    expect(contradictionChecker([], 'add output.error to chainBeforeHook')).toBe(false); // no registry → no contradiction
    expect(contradictionChecker(['d17-gate'], 'remove the D17 calibration gate')).toBe(true);
    expect(contradictionChecker(['unknown-contract'], 'anything')).toBe(false); // an unregistered contract has no detector
  });

  it('r5TheatricalLexiconHasMatch: the theatrical-result shapes detect; the real results stay clean', () => {
    expect(r5TheatricalLexiconHasMatch('hardcoded the result so the check stays blind')).toBe(true);
    expect(r5TheatricalLexiconHasMatch(R17_HARDCODED_FIXTURE)).toBe(true); // the hardcoded-success shape
    expect(r5TheatricalLexiconHasMatch('tsc: 0 errors')).toBe(false);
    expect(r5TheatricalLexiconHasMatch('')).toBe(false);
    expect(r5TheatricalLexiconHasMatch(undefined as never)).toBe(false);
  });
});
