// src/subagents/trident-bug-hunter/diagnostics/__tests__/calibration.test.ts
// THE CALIBRATION MUTATION GATE TESTS (W5) — the spec section 6.4 pseudocode
// (lines 2757-2794) transcribed + the adversarial additions (>= 3). The FIRE
// fixtures (the violation-history fixtures per predicate) + the GOLDEN fixtures
// (the operator's known-good state) are stub fixtures built in THIS suite —
// NEVER the real Plutus_Agent (W10's curation).
//
// THE D17 LAW (9.1): every predicate must FIRE on its recorded violation
// history + stay SILENT on the golden state — else FLAGGED + EXCLUDED from the
// live battery, never shipped silently. The determinism (O22.4): the same
// fixtures → the same verdicts; a fixture edit / version change → a different
// batteryVersion (the invalidation, never a silent reuse of stale calibration).
//
// THE MATCHER SURFACE: the assertions conform to W1's ambient bun:test shim
// (toBe/toEqual/toContain/toThrow + not); the async-error assertions use the
// explicit try/catch capture form (no `rejects` on the shim's ExpectResult).
// The §6.4 `p.calibrated` assertions transcribe against the CalibratedPredicate
// widening (the gate writes the verdict onto the predicate object — the W4
// CompiledPredicate type itself is frozen by the minimal-change law).

import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../../../../shared/knowledge-graph/db.ts';
import { ProjectProfileSchema, type ProjectProfile } from '../../../../shared/knowledge-graph/profile-schema.ts';
import type { GraphAdapter, GraphNode } from '../../graph/interface.ts';
import { compileTemplate, TEMPLATE_LIBRARY, type CompiledPredicate } from '../../lexicon/templates.ts';
import {
  CalibrationGate, runCalibration,
  type CalibratedPredicate, type CalibrationFixtures, type FireFixture, type GoldenFixture,
} from '../calibration.ts';
import {
  loadCalibrationFixtures, loadFixtureProfileFixtures, runFixtureCalibration,
  type FixtureLoadResult,
} from '../fixture-calibration.ts';
import { markInconclusive } from '../../testing/inconclusive.ts';

// ---------------------------------------------------------------------------
// The tmpdir fixtures (created per-suite, cleaned up after)
// ---------------------------------------------------------------------------

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-diagnostics-cal-'));
const createdTmp: string[] = [tmpBase];

afterAll(() => {
  for (const d of createdTmp) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (e: unknown) {
      console.error(`[calibration.test cleanup] failed to remove ${d}: ${String(e)}`);
    }
  }
});

function fixtureProfile(): ProjectProfile {
  return ProjectProfileSchema.parse({
    profileVersion: 1,
    project: { name: 'fixture', root: tmpBase, languages: ['typescript'], entryPoints: ['src/index.ts'], build: 'bun build', test: 'bun test' },
    graph: { substrate: 'native-ast', scope: ['src'], excludes: [] },
    rules: { corpus: ['corpus.md'], bindings: {} },
    pipeline: { stages: [{ id: 'harvest', entry: 'harvestOrders', contract: 'the temporal filter' }] },
    history: { failureLogs: [] },
    awareness: { docs: [] },
  });
}

/** The minimal GraphAdapter stub — the checks read it; it never executes anything. */
function stubGraph(overrides: Partial<GraphAdapter> = {}): GraphAdapter {
  return {
    build: async () => ({ nodes: [], edges: [], durationMs: 0, adapter: 'native-ast', lineage: { spec: 0, code: 0, hybrid: 0 } }),
    whoCalls: () => [],
    chain: () => [],
    imports: () => [],
    awaits: () => [],
    unwired: () => [],
    nodes: () => [],
    ...overrides,
  };
}

function fnNode(id: string, name: string, file: string, line: number, data: Record<string, unknown>): GraphNode {
  return { id, kind: 'function', name, file, line, lineage: 'CODE_DERIVED', source: 'fixture:corbell', data };
}

/** A graph with ONE symbol carrying the given data value at valuePath. The
 *  node's file/line must MATCH the fixture's anchor for the fire-test hit
 *  check (the finding's file must endWith the fixture's file + the line must be
 *  within ±2 of the fixture's line — §3.11). */
function symbolGraph(name: string, data: Record<string, unknown>, file = 'src/engine.ts', line = 31): GraphAdapter {
  return stubGraph({ nodes: () => [fnNode(`fn:${name}`, name, file, line, data)] });
}

// ---------------------------------------------------------------------------
// The P-battery fixture predicates (§6.4)
// ---------------------------------------------------------------------------

/** P6 — the no-price-anchored-comparator rule (CRIT, D23): fires when the
 *  computed abs(open - level) exceeds the 1.0 ceiling. */
function compileP6(): CompiledPredicate {
  const card = { verbatimQuote: 'No price-anchored comparator is permitted in the E2 selection path.', anchor: 'fixture-corpus.md:2', severity: 'CRIT' as const };
  return {
    ...compileTemplate(TEMPLATE_LIBRARY['domain.numeric-threshold'], { ...card, symbol: 'priceAnchor', valuePath: 'comparator', operator: 'gt', threshold: 1.0 }, card, 'fixture-battery'),
    id: 'P6',
  };
}

/** P21 — the E2-NULL temporal-lock predicate (CRIT, D23): fires when the
 *  dayOpenSpot delta never advances (<= 0). Its FIRE fixture is the
 *  mis-anchored case — the recorded fixture points at a HEALTHY state (delta 5)
 *  → the predicate cannot fire on it → MISS → FLAGGED (the false-negative
 *  class, G3.2). */
function compileP21(): CompiledPredicate {
  const card = { verbatimQuote: 'The dayOpenSpot must advance — identical-every-day slop is the E2-NULL failure.', anchor: 'fixture-corpus.md:4', severity: 'CRIT' as const };
  return {
    ...compileTemplate(TEMPLATE_LIBRARY['domain.numeric-threshold'], { ...card, symbol: 'dayOpenSpot', valuePath: 'delta', operator: 'lte', threshold: 0 }, card, 'fixture-battery'),
    id: 'P21',
  };
}

/** P8 — the SL-ceiling predicate (HIGH, D23): fires when a stop level exceeds
 *  the 20-pip ceiling. Its golden state contains a LEGIT 22-pip SL → the
 *  predicate FALSE-FIRES on known-good → FLAGGED (the false-positive class,
 *  G3.1). */
function compileP8(): CompiledPredicate {
  const card = { verbatimQuote: '40-pip SLs are structurally wrong — the ceiling is 20 pips.', anchor: 'fixture-corpus.md:5', severity: 'HIGH' as const };
  return {
    ...compileTemplate(TEMPLATE_LIBRARY['domain.numeric-threshold'], { ...card, symbol: 'slLevel', valuePath: 'pips', operator: 'gt', threshold: 20 }, card, 'fixture-battery'),
    id: 'P8',
  };
}

// ---------------------------------------------------------------------------
// THE FIXTURE SETS (§6.4: FIRE_FIXTURES.p6 / FIRE_FIXTURES.p21 + GOLDEN_FIXTURES)
// ---------------------------------------------------------------------------

const p6FireFixture: FireFixture = {
  ruleId: 'P6',
  file: 'src/e2-selector.ts',
  line: 31,
  description: 'the price-anchored comparator — abs(open - level) = 1.504 over the 1.0 ceiling (the C26.10 class)',
  source: 'const comparator = Math.abs(open - level);',
  graph: symbolGraph('priceAnchor', { open: 102.8, level: 101.296, comparator: 1.504 }, 'src/e2-selector.ts', 31),
};

const p21FireFixture: FireFixture = {
  ruleId: 'P21',
  file: 'src/shape-brain.ts',
  line: 1560,
  description: 'the MIS-ANCHORED E2-NULL fixture — the recorded line points at a HEALTHY dayOpenSpot (delta 5, it advances) — the predicate cannot fire on it',
  source: 'const dayOpenSpot = { delta: 5 };',
  graph: symbolGraph('dayOpenSpot', { delta: 5 }, 'src/shape-brain.ts', 1560),
};

// the operator's known-good state: a healthy price anchor (under the P6
// ceiling) + a LEGIT 22-pip SL (over the P8 ceiling → the FALSE-FIRE).
function goldenGraph(priceData: Record<string, unknown>, slPips: number): GraphAdapter {
  return stubGraph({
    nodes: () => [
      fnNode('fn:priceAnchor', 'priceAnchor', 'src/engine.ts', 31, priceData),
      fnNode('fn:slLevel', 'slLevel', 'src/engine.ts', 45, { pips: slPips }),
    ],
  });
}

const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    anchor: 'gold-5-of-5',
    file: 'src/engine.ts',
    source: 'the Monday gold 5/5 checkpoint — the operator\'s verified-correct full-week analysis',
    graph: goldenGraph({ open: 100.4, level: 100.2, comparator: 0.2 }, 22), // the legit 22-pip SL → the P8 FALSE-FIRE
  },
  {
    anchor: 'tte-reference',
    file: 'src/reference.ts',
    source: 'the TTE_GOLDEN_STANDARD_COMPLETE_REFERENCE — the 747-line acceptance oracle',
    graph: goldenGraph({ open: 99.5, level: 99.45, comparator: 0.05 }, 18),
  },
];

const FIRE_FIXTURES = { p6: [p6FireFixture], p21: [p21FireFixture] };

// ---------------------------------------------------------------------------
// THE CALIBRATION MUTATION GATE (spec §6.4:2757-2794 transcribed verbatim)
// ---------------------------------------------------------------------------

describe('THE CALIBRATION MUTATION GATE (D17 — spec §6.4:2757-2794 transcribed)', () => {
  it('passes a predicate that fires on its violation history + stays silent on the golden state', async () => {
  try {
    const gate = new CalibrationGate([], { fire: [], golden: GOLDEN_FIXTURES }, 'v1');
    const p = asCalibrated(compileP6());
    const fire = await gate.fireTest(p, FIRE_FIXTURES.p6); // the 11 price-anchored sites (C26.10)
    expect(fire.result).toBe('FIRED');                     // ≥1 VIOLATION on each site
    const silent = await gate.silentTest(p, GOLDEN_FIXTURES); // the Monday gold 5/5, the TTE reference
    expect(silent.result).toBe('SILENT');                  // zero findings
    expect(p.calibrated).toBe('CALIBRATED');
    expect(gate.verdictOf(p.id)).toBe('CALIBRATED');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('FLAGS + EXCLUDES a predicate that MISSES its violation (the false-negative class, G3.2)', async () => {
  try {
    const p = asCalibrated(compileP21());         // the E2-NULL predicate
    const gate = new CalibrationGate([p], { fire: [], golden: GOLDEN_FIXTURES }, 'v1');
    const fire = await gate.fireTest(p, FIRE_FIXTURES.p21);
    expect(fire.result).toBe('MISS');                      // the fixture was mis-anchored
    expect(p.calibrated).toBe('FLAGGED');
    expect(gate.liveBattery().includes(p)).toBe(false);    // excluded from the live battery
    expect(gate.excluded().includes(p)).toBe(true);        // and recorded as the KNOWN GAP
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('FLAGS + EXCLUDES a predicate that FALSE-FIRES on the golden (the false-positive class, G3.1)', async () => {
  try {
    const p = asCalibrated(compileP8());          // the SL-ceiling predicate
    const gate = new CalibrationGate([p], { fire: [], golden: GOLDEN_FIXTURES }, 'v1');
    const silent = await gate.silentTest(p, GOLDEN_FIXTURES);
    expect(silent.result).toBe('FALSE-FIRE');              // a legit 22p SL flagged
    expect(p.calibrated).toBe('FLAGGED');                  // never shipped silently
    expect(gate.liveBattery().includes(p)).toBe(false);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('is deterministic — the same fixtures → the same verdicts (O22.4)', async () => {
  try {
    const profile = fixtureProfile();
    const battery = [compileP6(), compileP21()];
    const fixtures: CalibrationFixtures = { fire: [p6FireFixture, p21FireFixture], golden: GOLDEN_FIXTURES };
    const gate = new CalibrationGate(battery, fixtures, 'v1');
    const a = await gate.run(profile, 'v1');
    const b = await gate.run(profile, 'v1');
    expect(a).toEqual(b);
    const c = await gate.run(profile, 'v2');               // a fixture change invalidates
    expect(a).not.toEqual(c);
    expect(a.batteryVersion).not.toBe(c.batteryVersion);   // the version is the invalidation signal
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  // --- THE ADVERSARIAL CASES (>= 3 — the spec's testing doctrine, adversarial-first) ---

  it('ADVERSARIAL: a malformed fixture fails closed with the named CALIBRATION_FIXTURE_INVALID, never a coerced default', async () => {
    const gate = new CalibrationGate([], { fire: [], golden: GOLDEN_FIXTURES }, 'v1');
    const p = compileP6();
    const malformed: FireFixture = {
      ruleId: 'P6', file: '', line: 31, // the file anchor is EMPTY → the ill-shaped fail-state
      description: 'missing the file anchor', source: 'x',
      graph: symbolGraph('priceAnchor', { comparator: 1.5 }),
    };
    let err: Error | undefined;
    try {
      await gate.fireTest(p, [malformed]);
    } catch (e: unknown) {
      console.warn('[calibration.test] fireTest threw (expected): ' + String(e));
      err = e as Error;
    }
    expect(err !== undefined).toBe(true);
    expect(err!.message).toContain('CALIBRATION_FIXTURE_INVALID');
  });

  it('ADVERSARIAL: a fixture content change alters the VERDICT — a stale calibration is invalid, never silently reused', async () => {
  try {
    const profile = fixtureProfile();
    const battery = [compileP6()];
    // the GOOD fire fixture: the comparator 1.5 over the 1.0 ceiling → P6 fires → CALIBRATED
    const fireGood: FireFixture = { ...p6FireFixture, graph: symbolGraph('priceAnchor', { comparator: 1.5 }, 'src/e2-selector.ts', 31) };
    const gateGood = new CalibrationGate(battery, { fire: [fireGood], golden: GOLDEN_FIXTURES }, 'v1');
    const good = await gateGood.run(profile, 'v1');
    expect(good.records.find((r) => r.predicateId === 'P6')?.verdict).toBe('CALIBRATED');
    // the BAD fire fixture: the comparator 0.5 UNDER the ceiling → P6 cannot fire → MISS → FLAGGED
    const fireBad: FireFixture = { ...p6FireFixture, graph: symbolGraph('priceAnchor', { comparator: 0.5 }, 'src/e2-selector.ts', 31) };
    const gateBad = new CalibrationGate(battery, { fire: [fireBad], golden: GOLDEN_FIXTURES }, 'v1');
    const bad = await gateBad.run(profile, 'v1');
    expect(bad.records.find((r) => r.predicateId === 'P6')?.verdict).toBe('FLAGGED');
    expect(good.batteryVersion).not.toBe(bad.batteryVersion); // the fixture edit changed the version
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('ADVERSARIAL: lands the calibrations rows in W1\'s calibrations table + writes the CALIBRATION_vN.md record (the evidence, forever queryable)', async () => {
  try {
    const profile = fixtureProfile();
    const db = openStore(':memory:');
    const recordPath = path.join(tmpBase, 'calibration-records');
    const battery = [compileP6(), compileP21()];
    const fixtures: CalibrationFixtures = { fire: [p6FireFixture, p21FireFixture], golden: GOLDEN_FIXTURES };
    const gate = new CalibrationGate(battery, fixtures, 'v1');
    const result = await gate.run(profile, 'v1', { db, recordPath });

    const rows = db.prepare('SELECT predicate_id,test,result FROM calibrations').all();
    expect(rows.length).toBe(4); // 2 predicates × (FIRE + SILENT)
    const p6Fire = rows.find((r) => String(r['predicate_id']) === 'P6' && String(r['test']) === 'FIRE');
    expect(p6Fire !== undefined).toBe(true);
    expect(String(p6Fire!['result'])).toBe('FIRED');
    const p21Fire = rows.find((r) => String(r['predicate_id']) === 'P21' && String(r['test']) === 'FIRE');
    expect(p21Fire !== undefined).toBe(true);
    expect(String(p21Fire!['result'])).toBe('MISS');

    const files = fs.readdirSync(recordPath);
    expect(files.some((f) => /^CALIBRATION_v\d+\.md$/.test(f))).toBe(true);
    const md = fs.readFileSync(path.join(recordPath, files[0]), 'utf8');
    expect(md).toContain(result.batteryVersion);
    expect(md).toContain('P21'); // the excluded predicate is recorded
    expect(md).toContain(result.coverageNote);
    db.close();
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('ADVERSARIAL: runCalibration (the module gate) splits live/excluded by the verdict — the FLAGGED never ship', async () => {
  try {
    const profile = fixtureProfile();
    const battery = [compileP6(), compileP21()];
    const fixtures: CalibrationFixtures = { fire: [p6FireFixture, p21FireFixture], golden: GOLDEN_FIXTURES };
    const result = await runCalibration(profile, fixtures, { battery });
    expect(result.liveBattery.map((p) => p.id)).toEqual(['P6']);
    expect(result.excluded.map((p) => p.id)).toEqual(['P21']);
    expect(result.coverageNote).toContain('P21');
    expect(result.dryRun).toBe(true); // the gate is born OFF (D28) — the verdicts are surfaced, never applied
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});

// ---------------------------------------------------------------------------
// THE ON-DISK F11.5 FIXTURES (fixtures/fixture-profile/fixtures/{fire,golden}/) —
// the S7 scenario's local ground before the container run (spec §8.9 F11.5 +
// the S7 row: "the calibration gate... run the calibration tool with the FIRE +
// GOLDEN fixtures"). The fixtures are the loader's run path — the gate must
// FIRE on the fire fixture + stay SILENT on the golden fixture + land the
// CALIBRATION_vN.md record (the dry-run evidence, D28).
// ---------------------------------------------------------------------------

describe('THE ON-DISK F11.5 FIXTURES (fixtures/fixture-profile — the S7 ground)', () => {
  const fixtureProfileDir = path.resolve(__dirname, '../../../../../fixtures/fixture-profile');

  it('loads the fire + golden fixtures from disk through the run-path loader (F11.5)', () => {
    const fireDir = path.join(fixtureProfileDir, 'fixtures', 'fire');
    const goldenDir = path.join(fixtureProfileDir, 'fixtures', 'golden');
    if (!fs.existsSync(fireDir) || !fs.existsSync(goldenDir)) {
      markInconclusive('loads the fire + golden fixtures', 'fixture-dirs-absent', `CALIBRATION_FIXTURE_INVALID: ${fireDir} + ${goldenDir} must exist`);
    }
    const fixtures = loadCalibrationFixtures(fixtureProfileDir);
    expect(fixtures.fire.length).toBe(1);
    expect(fixtures.golden.length).toBe(1);
    expect(fixtures.fire[0].ruleId).toBe('P6');
    expect(fixtures.golden[0].anchor).toBe('gold-5-of-5');
  });

  it('FIRES on the fire fixture + stays SILENT on the golden fixture — the S7 mutation test', async () => {
  try {
    const fireDir = path.join(fixtureProfileDir, 'fixtures', 'fire');
    if (!fs.existsSync(fireDir)) {
      markInconclusive('FIRES on fire fixture', 'fixture-dirs-absent', `CALIBRATION_FIXTURE_INVALID: ${fireDir} must exist`);
    }
    const loaded = loadFixtureProfileFixtures(fixtureProfileDir);
    const battery = [compileP6()];
    const result = await runCalibration(loaded.profile, loaded.fixtures, { battery, dryRun: true });
    const rec = result.records.find((r) => r.predicateId === 'P6');
    expect(rec !== undefined).toBe(true);
    expect(rec!.fire.fired).toBe(true);
    expect(rec!.silent.findings).toBe(0);
    expect(rec!.verdict).toBe('CALIBRATED');
    expect(result.excluded.map((p) => p.id)).toEqual([]);
    expect(result.liveBattery.map((p) => p.id)).toEqual(['P6']);
  
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('::INCONCLUSIVE(')) throw e;
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('writes the CALIBRATION_vN.md dry-run record through the run path (the S7 evidence)', async () => {
  try {
    const fireDir = path.join(fixtureProfileDir, 'fixtures', 'fire');
    if (!fs.existsSync(fireDir)) {
      markInconclusive('writes CALIBRATION_vN.md', 'fixture-dirs-absent', `CALIBRATION_FIXTURE_INVALID: ${fireDir} must exist`);
    }
    const loaded = loadFixtureProfileFixtures(fixtureProfileDir);
    const battery = [compileP6()];
    const recordPath = path.join(tmpBase, 'on-disk-calibration');
    createdTmp.push(recordPath);
    const result = await runCalibration(loaded.profile, loaded.fixtures, { battery, dryRun: true, recordPath });
    const files = fs.readdirSync(recordPath);
    expect(files.some((f) => /^CALIBRATION_v\d+\.md$/.test(f))).toBe(true);
    const md = fs.readFileSync(path.join(recordPath, files[0]), 'utf8');
    expect(md).toContain('FIRED');
    expect(md).toContain('SILENT');
    expect(md).toContain('CALIBRATED');
    expect(md).toContain(result.batteryVersion);
  
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('::INCONCLUSIVE(')) throw e;
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});


/** THE R16 TYPE_CERTAINTY GUARDED READ — the compiled predicate is narrowed to
 *  the calibrated surface behind the null/undefined guard (the assertion is
 *  earned by the check, never a bare cast on the shared row). */
function asCalibrated(p: CompiledPredicate): CalibratedPredicate {
  if (p !== undefined && p !== null) {
    return p as CalibratedPredicate;
  }
  throw new Error('the predicate row is missing for the calibrated read');
}
