/**
 * audit-calibration.ts — THE D17 CALIBRATION GATE (the L2 spec §3.5 — W3)
 *
 * THE D17 MUTATION GATE: every pattern FIREs on the recorded violation history
 * (the exampleHits fixtures) + stays SILENT on the golden state (the golden
 * fixtures) → CALIBRATED. A MISS (the mutant undetected) or a FALSE-FIRE (the
 * wild-type rejected) → FLAGGED → EXCLUDED from the live battery.
 * THE DRY-RUN-FIRST (D28): the calibration runs dry, never auto-arms.
 * THE VERSIONING (O22.4): the battery version = sha256(corpus+bindings); a
 * stale calibration is INVALID (CALIBRATION_STALE).
 * THE DUALITY: the tool's OWN detectors ship ONLY when calibrated — the same
 * gate governs the tool's own patterns and the target's battery.
 */
import { PatternFamily } from './audit-lexicons.ts';
import { tridentLog } from '../../utils.js';

export type FireResult = 'FIRED' | 'MISS';
export type SilentResult = 'SILENT' | 'FALSE_FIRE';
export type CalibrationVerdict = 'CALIBRATED' | 'FLAGGED';

export interface FireTestResult { result: FireResult; firedCount: number; }
export interface SilentTestResult { result: SilentResult; falseFireCount: number; }

export interface CalibrationGateOptions {
  dryRun?: boolean;          // the D28 dry-run-first (default true — never auto-arms)
  batteryVersion?: string;   // sha256(corpus+bindings) — the O22.4 versioning
}

export class CalibrationGate {
  private verdicts = new Map<string, CalibrationVerdict>();
  private excluded = new Set<string>();
  private readonly dryRun: boolean;
  private readonly batteryVersion: string | undefined;

  constructor(batteryVersion?: string, options: CalibrationGateOptions = {}) {
    this.dryRun = options.dryRun ?? true;
    this.batteryVersion = options.batteryVersion;
  }

  /** THE FIRE TEST — the pattern against its recorded violation history (the exampleHits). */
  async fireTest(pattern: PatternFamily, fireFixtures: string[]): Promise<FireTestResult> {
    let firedCount = 0;
    for (const fixture of fireFixtures) {
      // THE DETECTOR: the fixture string carries the violation shape; the
      // pattern's matcher is run over a construct derived from the fixture.
      const construct = constructFromFixture(fixture);
      const match = pattern.matcher(construct, { checker: null, callGraph: { totalCallSites: 0, coveragePercent: 0 } });
      if (match) firedCount++;
    }
    const result: FireResult = firedCount === fireFixtures.length ? 'FIRED' : 'MISS';
    if (result === 'MISS') {
      this.verdicts.set(pattern.id, 'FLAGGED');
      this.excluded.add(pattern.id);
    }
    return { result, firedCount };
  }

  /** THE SILENT TEST — the pattern against the golden fixtures (the clean-state corpus). */
  async silentTest(pattern: PatternFamily, goldenFixtures: string[]): Promise<SilentTestResult> {
    let falseFireCount = 0;
    for (const fixture of goldenFixtures) {
      const construct = constructFromFixture(fixture);
      const match = pattern.matcher(construct, { checker: null, callGraph: { totalCallSites: 0, coveragePercent: 0 } });
      if (match) falseFireCount++;
    }
    const result: SilentResult = falseFireCount === 0 ? 'SILENT' : 'FALSE_FIRE';
    if (result === 'FALSE_FIRE') {
      this.verdicts.set(pattern.id, 'FLAGGED');
      this.excluded.add(pattern.id);
    }
    return { result, falseFireCount };
  }

  /** THE VERDICT — CALIBRATED = FIRED + SILENT; FLAGGED = excluded (never armed). */
  verdictOf(patternId: string): CalibrationVerdict {
    return this.verdicts.get(patternId) || 'CALIBRATED';
  }

  /**
   * THE EVENT-DRIVEN EXCLUSION (SPEC-3 §2.5 — E5, the calibration feedback): a CALIB_STALE
   * event is the LIVE observation that a matcher false-fired on the clean core. This entry
   * point performs the IDENTICAL state writes as the silentTest FALSE_FIRE path (FLAGGED +
   * EXCLUDED) — the event feed and the fixture test are the two triggers of the ONE D17
   * mechanism. Error path FIRST: an exclusion without its matcher id is a contentless
   * mutation — CALIB_EXCLUDE_NO_MATCHER throws.
   */
  excludeMatcher(patternId: string, reason: string): void {
    if (typeof patternId !== 'string' || patternId.length === 0) {
      throw new Error('CALIB_EXCLUDE_NO_MATCHER: a CALIB_STALE exclusion requires the matcher id');
    }
    this.verdicts.set(patternId, 'FLAGGED');
    this.excluded.add(patternId);
    tridentLog('WARN', 'audit-calibration', `EVENT_CALIB_STALE: the matcher ${patternId} is FLAGGED + EXCLUDED (${reason}) — the next audit on this gate runs clean of it`);
  }

  /** THE EXCLUDED SET — the FLAGGED patterns never arm. */
  excludedPatterns(): string[] {
    return [...this.excluded];
  }

  /** THE DRY-RUN — the calibration ran dry, never auto-armed. */
  isDryRun(): boolean {
    return this.dryRun;
  }
}

/** THE STALE-VERSION REJECTION (O22.4) — a calibration bound to a stale battery version is INVALID. */
export class CalibrationStaleError extends Error {
  constructor(expectedVersion: string, actualVersion: string) {
    super(`CALIBRATION_STALE: the battery version ${actualVersion} differs from the calibrated ${expectedVersion} — the D17 gate MUST re-run (the dry-run first, D28)`);
    this.name = 'CalibrationStaleError';
  }
}

/** THE STALE CHECK — the battery version change invalidates the calibration. */
export function needsRecalibration(calibratedVersion: string | undefined, currentVersion: string): boolean {
  if (!calibratedVersion) return true;          // never calibrated → first-load
  return calibratedVersion !== currentVersion;  // the O22.4 versioning
}

/** THE FIXTURE CONSTRUCT — derive a CodeConstruct from a fixture string (the FIRE/SILENT test's input).
 * THE DETECTOR RULES: the fixture's SHAPE selects the construct kind — an
 * empty-catch fixture ('catch {}') must produce a CATCH_CLAUSE with an EMPTY
 * body so the r2.empty-catch matcher FIRES on it.
 * WHY THE REGEX IS THE RIGHT TOOL HERE (the ISE law's named exception): this
 * function classifies a TEST-FIXTURE STRING — synthetic input, NOT a target
 * code node. There is NO AST to consult; a fixture is already a string. The
 * shape regex is a mechanical DETECTOR for choosing which synthetic construct
 * type to hand the matcher, exactly the "regex is the detector" case the ISE
 * warhead permits — it never returns a verdict, it only shapes the input. */
function constructFromFixture(fixture: string): import('../types.ts').CodeConstruct {
  const isCatch = fixture.includes('catch');
  const isFunction = fixture.includes('function') || fixture.includes('=>') || fixture.includes('return');
  const isTest = fixture.includes('expect(');
  const isAny = fixture.includes('any');
  // THE STRING-LITERAL DETECTION — a fixture whose RHS is a quoted string
  // ('const s = "TODO"' / 'return "ok"') MUST classify as STRING_LITERAL so the
  // R3 TODO-marker's comment-vs-string decision is truly exercised. The old
  // startsWith()' only caught a bare-quoted fragment — a real assignment
  // ('const s = "TODO..."') fell through to FUNCTION_DECLARATION and the
  // golden-state string test FALSE-FIRED (the 2026-08-20 r8 FP-encoding test).
  const isStringLit = fixture.startsWith("'") || fixture.startsWith('"')
    || /=\s*["']/.test(fixture) || /return\s+["']/.test(fixture);
  const isHook = fixture.includes('tool.') || fixture.includes('output.');
  const type = isCatch ? 'CATCH_CLAUSE'
    : isStringLit ? 'STRING_LITERAL'
    : isFunction ? 'FUNCTION_DECLARATION'
    : isTest ? 'FUNCTION_DECLARATION'
    : isAny ? 'FUNCTION_DECLARATION'
    : isHook ? 'FUNCTION_DECLARATION'
    : 'FUNCTION_DECLARATION';
  const name = isCatch ? 'catch' : isTest ? 'test' : 'f';
  // THE EMPTY-CATCH FIXTURE: 'catch {}' or 'catch (e) { }' → the body is the
  // text AFTER the LAST '{' (the catch's brace, not the try's) — the EMPTY
  // body the r2.empty-catch matcher detects.
  let body = fixture;
  if (isCatch) {
    const lastBraceIdx = fixture.lastIndexOf('{');
    body = lastBraceIdx >= 0 ? fixture.slice(lastBraceIdx + 1, fixture.lastIndexOf('}')).trim() : '';
  }
  return {
    type: type as import('../types.ts').ConstructType,
    name,
    filePath: '/tmp/calibration-fixture.ts',
    line: 1,
    endLine: 1,
    body,
    node: {} as never,
    isDefinition: true,
    isCallSite: false,
    isAsync: false,
    modifiers: [],
    parent: null,
    children: [],
    parameters: isAny ? [{ name: 'x', type: 'any' }] : [],
    returnType: isAny ? 'any' : null,
  };
}
