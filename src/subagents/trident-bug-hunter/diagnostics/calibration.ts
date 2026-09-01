// src/subagents/trident-bug-hunter/diagnostics/calibration.ts
// THE CALIBRATION MUTATION GATE (W5, spec §3.11 lines 1380-1427 + SECTION 9
// lines 4088-4687). D17 — every compiled predicate must FIRE on the profile's
// recorded violation history AND stay SILENT on the operator's golden state.
// A predicate failing EITHER test is FLAGGED + excluded from the live battery —
// never shipped silently, never a silent pass ('no fallbacks and force it to
// work in the overhauled infra or fail'). A predicate that cannot be trusted
// does not run.
//
// THE VERDICT VOCABULARY: CALIBRATED | FLAGGED — the spec §9.4's literal words
// (the 2x2 verdict matrix, spec:4301-4316: FIRE+SILENT → CALIBRATED, anything
// else → FLAGGED with the failing side NAMED). The naming drift (the code's
// former PASSED vocabulary vs §9.4's CALIBRATED) is RESOLVED 2026-08-12 — the
// PASSED vocabulary is retired from the verdict sites. The FLAGGED subset is
// the KNOWN GAP — excluded from liveBattery() with the coverage note as its
// permanent record (K26.3). The PENDING third state (below) is the live gate's
// TEST-PROGRESS marker (a side not yet tested), NEVER a record verdict — the
// record verdict is the spec's closed 2x2.
//
// THE MUTATION-TEST SEMANTICS (9.1): the FIRE set is the MUTANT — the code
// state known to violate the rule; the predicate is PROVEN when it DETECTS the
// mutant (fires on its own recorded violation) AND accepts the wild-type
// (silent on the golden). A predicate that never fires is dead weight (G3.2 —
// the false-negative class); one that fires everywhere is noise (G3.1 — the
// false-positive class). The calibration is the battery's own test suite.
//
// THE DETERMINISM LAW (O22.4): the same battery + the same fixtures + the same
// fixture version ALWAYS produce the same verdicts. batteryVersion =
// sha256(corpus + bindings + fixturesHash) — a fixture edit or a version change
// alters the version, so a stale calibration is INVALID, never silently reused.
// The calibratedAt is the SESSION's timestamp (set at gate construction), never
// a per-run value — the same session re-runs byte-identically (the §6.4
// determinism toEqual).
//
// THE MALFORMED-FIXTURE FAIL-STATE: an ill-shaped fixture (an empty ruleId /
// file / line, a missing graph or source) is the loud named
// CALIBRATION_FIXTURE_INVALID — never a coerced default.
//
// THE DRY-RUN FIRST (D28): the gate is born OFF (dryRun defaults true) — the
// verdicts are computed + surfaced, never applied; the live flip is the
// operator's curation act (the 9.5 protocol, W7's boot gate consumes the
// flipped evidence). This wave computes the records; the boot gate applies them.
//
// THE RECORDS (K26/O22/D17): the W1 calibrations table rows (predicate_id /
// test FIRE|SILENT / fixture / result FIRED|SILENT|FALSE-FIRE|MISS / evidence /
// run_id) + the CALIBRATION_vN.md versioned record (append-only across
// sessions — a re-calibration writes a NEW file, the old evidence is never
// mutated in place).
//
// THE ZERO-ADD RULE: the gate imports ONLY the existing modules (db.ts,
// profile-schema.ts, templates.ts, compiler.ts, engine.ts) + the node builtins.

import fs from 'node:fs';
import path from 'node:path';
import type { DbClient } from '../../../shared/knowledge-graph/db.ts';
import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import type { GraphAdapter } from '../graph/interface.ts';
import type { CompiledPredicate } from '../lexicon/templates.ts';
import { sha256 } from '../lexicon/templates.ts';
import { compile } from '../lexicon/compiler.ts';
import { run, type EngineRunContext } from './engine.ts';
import type { NormalizedFinding } from './findings-store.ts';

// ---------------------------------------------------------------------------
// The fixture shapes (the violation-history + the golden state)
// ---------------------------------------------------------------------------

/** A FIRE fixture — a RECORDED violation instance from the profile's failure
 *  logs (C26): the predicate's ruleId, the file/line anchor, the violation's
 *  story, the file's bytes (the source the read returns), and the graph built
 *  around the fixture's code state (the MUTANT the predicate must detect). */
export interface FireFixture {
  ruleId: string;
  file: string;
  line: number;
  description: string;
  source: string;
  graph: GraphAdapter;
}

/** A GOLDEN fixture — the operator's known-good state (D28): the anchor (the
 *  operator's naming — the gold 5/5, the TTE reference), the file anchor, the
 *  file's bytes, and the graph of the healthy code (the wild-type the predicate
 *  must accept with ZERO findings). */
export interface GoldenFixture {
  anchor: string;
  file: string;
  source: string;
  graph: GraphAdapter;
}

export interface CalibrationFixtures {
  fire: FireFixture[];
  golden: GoldenFixture[];
}

// ---------------------------------------------------------------------------
// The named-error vocabulary (O32.1) — the malformed-fixture fail-state
// ---------------------------------------------------------------------------

/** The base calibration error: every failure NAMES its code in the message. */
export class CalibrationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

/** CALIBRATION_FIXTURE_INVALID — an unreadable / ill-shaped fixture. The
 *  loud named fail-state: never a coerced default, never a silent skip. */
export function calibrationFixtureInvalid(detail: string): CalibrationError {
  return new CalibrationError(
    'CALIBRATION_FIXTURE_INVALID',
    `CALIBRATION_FIXTURE_INVALID: detail=${detail} (a malformed fixture is a loud named error, never a coerced default)`,
  );
}

// ---------------------------------------------------------------------------
// The calibration types (spec §9.4 — the CALIBRATED | FLAGGED vocabulary)
// ---------------------------------------------------------------------------

export interface FireTestResult {
  result: 'FIRED' | 'MISS';
  fixtureAnchor: string;
  evidence: string;
}

export interface SilentTestResult {
  result: 'SILENT' | 'FALSE-FIRE';
  goldenFixture: string;
  findings: number;
  evidence: string;
}

export interface CalibrationRecord {
  predicateId: string;
  fire: { fixtureAnchor: string; fired: boolean; evidence: string };
  silent: { goldenFixture: string; findings: number; evidence: string };
  verdict: 'CALIBRATED' | 'FLAGGED';
  failedTest?: 'FIRE' | 'SILENT' | 'BOTH';
  reason?: string;
  calibratedAt: number;
}

export interface CalibrationResult {
  records: CalibrationRecord[];
  liveBattery: CompiledPredicate[];    // the CALIBRATED subset — the ONLY predicates the scans run
  excluded: CompiledPredicate[];       // the FLAGGED subset — the KNOWN GAP inventory
  batteryVersion: string;              // sha256(corpus + bindings + fixturesHash) — O22.4
  coverageNote: string;                // the exclusions' permanent record (K26.3)
  dryRun: boolean;
}

/** The predicate + its live calibration state — the §6.4 `p.calibrated` surface
 *  the gate writes as each test lands (the CompiledPredicate type itself is
 *  W4's, frozen by the minimal-change law — the calibration state rides the
 *  widening, never a W4 edit). */
export type CalibratedPredicate = CompiledPredicate & { calibrated?: 'CALIBRATED' | 'FLAGGED' | 'PENDING' };

// ---------------------------------------------------------------------------
// THE CALIBRATION GATE
// ---------------------------------------------------------------------------

/**
 * THE MUTATION GATE (D17). One gate = one calibration session over a battery +
 * a fixture set + a fixture version. fireTest + silentTest drive the per-predicate
 * verdicts interactively (the §6.4 surface); run() computes the full session
 * (all predicates, both tests) + the records + the live/excluded split + the
 * battery version, and lands the evidence when a db / recordPath is supplied.
 */
export class CalibrationGate {
  private readonly fireByPred = new Map<string, FireTestResult>();
  private readonly silentByPred = new Map<string, SilentTestResult>();
  private readonly verdicts = new Map<string, 'CALIBRATED' | 'FLAGGED'>();
  /** The session's timestamp — FIXED at construction so a session re-runs
   *  byte-identically (the O22.4 determinism: the §6.4 toEqual between two
   *  runs of the same session). */
  readonly calibratedAt: number;

  constructor(
    private readonly battery: CompiledPredicate[],
    private readonly fixtures: CalibrationFixtures,
    private readonly fixtureVersion: string,
    readonly dryRun: boolean = true, // the calibration is born OFF (D28) — the live flip is the operator's curation
  ) {
    this.calibratedAt = Date.now();
  }

  /** THE FIRE TEST (9.1a) — the predicate MUST produce a VIOLATION on its own
   *  recorded violation-history fixture(s): ≥1 hit → FIRED, else MISS. The hit
   *  is the finding whose ruleId is the predicate's, whose verdict is
   *  VIOLATION, and whose file/line land within ±2 of the fixture's anchor. */
  async fireTest(p: CompiledPredicate, fireFixtures: FireFixture[]): Promise<FireTestResult> {
    const result = this.computeFireTest(p, fireFixtures);
    this.fireByPred.set(p.id, result);
    this.mark(p);
    return result;
  }

  /** THE SILENT TEST (9.1b) — the predicate MUST produce ZERO findings on the
   *  operator's golden state: zero → SILENT, ANY → FALSE-FIRE (the false
   *  positive on known-good — the golden state is the absolute line, one
   *  FALSE-FIRE is as FLAGGED as ten). */
  async silentTest(p: CompiledPredicate, goldenFixtures: GoldenFixture[]): Promise<SilentTestResult> {
    const result = this.computeSilentTest(p, goldenFixtures);
    this.silentByPred.set(p.id, result);
    this.mark(p);
    return result;
  }

  /** The per-predicate verdict — CALIBRATED (both green) | FLAGGED (either red) |
   *  PENDING (one side not yet tested — the live gate's test-progress marker,
   *  never a record verdict; the record verdict is the spec's closed 2x2). A red
   *  FIRE or a red SILENT flags immediately (the operator's 'no fallbacks' law). */
  verdictOf(predicateId: string): 'CALIBRATED' | 'FLAGGED' | 'PENDING' {
    return this.verdicts.get(predicateId) ?? 'PENDING';
  }

  /** The LIVE battery — ONLY the CALIBRATED predicates. The FLAGGED are excluded,
   *  never shipped (the exclusion is the fail-state, never a silent pass). */
  liveBattery(): CompiledPredicate[] {
    return this.battery.filter((p) => this.verdictOf(p.id) === 'CALIBRATED');
  }

  /** The EXCLUDED subset — the FLAGGED predicates, the KNOWN GAP inventory. */
  excluded(): CompiledPredicate[] {
    return this.battery.filter((p) => this.verdictOf(p.id) === 'FLAGGED');
  }

  /** The battery version (O22.4) — sha256(corpus + bindings + fixturesHash).
   *  The corpus + bindings hashes derive from the COMPILED battery (the
   *  anchors + the quotes + the bound params — the same content the compiler
   *  hashed at K20.3); the fixturesHash covers the fixture set + the fixture
   *  VERSION, so a fixture edit OR a version change invalidates the version. */
  batteryVersion(fixtureVersion: string = this.fixtureVersion): string {
    const corpusHash = sha256(this.battery.map((p) => `${p.anchor}\n${p.verbatimQuote}`).join('\n'));
    const bindingsHash = sha256(this.battery.map((p) => JSON.stringify(p.bindings)).join('\n'));
    const fixturesHash = sha256(`${this.serializeFixtures()}|${fixtureVersion}`);
    return sha256(`${corpusHash}|${bindingsHash}|${fixturesHash}`);
  }

  /** The deterministic fixture serialization — the O22.4 invalidation input.
   *  A fixture's observable state is its file/line/source AND its graph's
   *  NODES (an adapter's enumerable JSON is lossy — its methods vanish, so a
   *  graph-data change would escape a naive JSON.stringify). The nodes are
   *  materialized HERE, so a comparator-data edit alters the fixturesHash → the
   *  batteryVersion → the stale calibration is invalidated, never reused. */
  private serializeFixtures(): string {
    const graphOf = (graph: GraphAdapter): unknown => ({
      nodes: graph.nodes().map((n) => ({
        id: n.id, kind: n.kind, name: n.name,
        file: n.file ?? null, line: n.line ?? null, lineage: n.lineage, source: n.source,
        data: n.data ?? null,
      })),
    });
    return JSON.stringify({
      fire: this.fixtures.fire.map((f) => ({
        ruleId: f.ruleId, file: f.file, line: f.line, description: f.description, source: f.source,
        graph: graphOf(f.graph),
      })),
      golden: this.fixtures.golden.map((g) => ({
        anchor: g.anchor, file: g.file, source: g.source, graph: graphOf(g.graph),
      })),
    });
  }

  /**
   * THE FULL CALIBRATION SESSION (§9.4). Computes every predicate's FIRE +
   * SILENT verdicts, the records, the live/excluded split, the battery version
   * and the coverage note; writes the W1 calibrations rows + the
   * CALIBRATION_vN.md record when a db / recordPath is supplied. Deterministic:
   * the same session (battery + fixtures + version) → the same result; a
   * version change → a different batteryVersion (the invalidation signal).
   */
  async run(
    profile: ProjectProfile,
    fixtureVersion: string = this.fixtureVersion,
    write?: { db?: DbClient; recordPath?: string },
  ): Promise<CalibrationResult> {
    const records: CalibrationRecord[] = [];
    for (const p of this.battery) {
      const fireFixtures = this.fixtures.fire.filter((f) => f.ruleId === p.id);
      const fire = this.computeFireTest(p, fireFixtures);
      this.fireByPred.set(p.id, fire);
      const silent = this.computeSilentTest(p, this.fixtures.golden);
      this.silentByPred.set(p.id, silent);
      this.mark(p);
      const verdict = this.verdictOf(p.id);
      // both tests have run above — the verdict is CALIBRATED|FLAGGED by the mark
      // invariant; a PENDING here is a gate bug, surfaced LOUDLY (a calibration
      // row is never written from a half-tested predicate).
      if (verdict === 'PENDING') {
        throw new CalibrationError(
          'CALIBRATION_PENDING',
          `CALIBRATION_PENDING: predicate ${p.id} reached the record stage without a completed fire+silent verdict — a calibration row is never written from a half-tested predicate`,
        );
      }
      const failedTest: CalibrationRecord['failedTest'] = verdict === 'CALIBRATED'
        ? undefined
        : fire.result === 'MISS'
          ? (silent.result === 'FALSE-FIRE' ? 'BOTH' : 'FIRE')
          : 'SILENT';
      const reason = failedTest === 'FIRE'
        ? 'the predicate never fires on its own trigger fixture — the logic is dead'
        : failedTest === 'SILENT'
          ? `the predicate fires on the golden state — false positives on known-good`
          : failedTest === 'BOTH'
            ? 'both the fire and the silent tests fail — the predicate is incoherent'
            : undefined;
      records.push({
        predicateId: p.id,
        fire: {
          fixtureAnchor: fireFixtures.map((f) => `${f.file}:${f.line}`).join(',') || 'NONE',
          fired: fire.result === 'FIRED',
          evidence: fire.evidence,
        },
        silent: {
          goldenFixture: this.fixtures.golden.map((g) => g.anchor).join(','),
          findings: silent.findings,
          evidence: silent.evidence,
        },
        verdict,
        failedTest,
        reason,
        calibratedAt: this.calibratedAt,
      });
    }

    const liveBattery = this.battery.filter((p) => this.verdictOf(p.id) === 'CALIBRATED');
    const excluded = this.battery.filter((p) => this.verdictOf(p.id) === 'FLAGGED');
    const coverageNote = excluded.length === 0
      ? 'all predicates calibrated — zero exclusions'
      : excluded.map((p) => `${p.id}: ${records.find((r) => r.predicateId === p.id)?.reason ?? 'FLAGGED'}`).join('\n');
    const version = this.batteryVersion(fixtureVersion);

    if (write) {
      const recordPath = write.recordPath ?? path.join(profile.project.root, '.trident', 'bug-hunter');
      if (write.db) {
        this.writeCalibrationRows(write.db, records, fixtureVersion);
      }
      this.writeCalibrationRecord(recordPath, { version, records, excluded, coverageNote });
    }

    return { records, liveBattery, excluded, batteryVersion: version, coverageNote, dryRun: this.dryRun };
  }

  // -------------------------------------------------------------------------
  // The private mechanics
  // -------------------------------------------------------------------------

  /** Run ONE predicate against a fixture's state THROUGH THE ENGINE — the
   *  calibration tests the predicate the exact way the live battery runs it
   *  (the engine's normalization: ruleId = predicate.id, severity =
   *  predicate.severity, the evidence validation). The source read returns the
   *  fixture's bytes. */
  private runCheck(p: CompiledPredicate, graph: GraphAdapter, source: string): NormalizedFinding[] {
    const ctx: EngineRunContext = { graph, source: { read: () => source } };
    return run([p], ctx);
  }

  private computeFireTest(p: CompiledPredicate, fireFixtures: FireFixture[]): FireTestResult {
    const matching = fireFixtures.filter((f) => f.ruleId === p.id);
    if (matching.length === 0) {
      return {
        result: 'MISS',
        fixtureAnchor: 'NONE',
        evidence: `no fire fixtures matched predicate ${p.id} — the predicate has no recorded violation history to prove against`,
      };
    }
    const hits: string[] = [];
    const misses: string[] = [];
    for (const fixture of matching) {
      this.validateFireFixture(fixture);
      const findings = this.runCheck(p, fixture.graph, fixture.source);
      const hit = findings.some(
        (f) => f.ruleId === p.id
          && f.verdict === 'VIOLATION'
          && f.file.endsWith(fixture.file)
          && f.line >= fixture.line - 2
          && f.line <= fixture.line + 2,
      );
      (hit ? hits : misses).push(`${fixture.file}:${fixture.line}`);
    }
    const fired = hits.length > 0;
    const evidence = fired
      ? `fired on ${hits.length}/${matching.length} fire fixtures (${hits.map((h) => `${h}:HIT`).join(', ')})${misses.length > 0 ? `; missed ${misses.map((m) => `${m}:MISS`).join(', ')}` : ''}`
      : `ZERO fire fixtures triggered — ${matching.length} candidates checked (${matching.map((m) => `${m.file}:${m.line}`).join(', ')})`;
    return {
      result: fired ? 'FIRED' : 'MISS',
      fixtureAnchor: matching.map((f) => `${f.file}:${f.line}`).join(','),
      evidence,
    };
  }

  private computeSilentTest(p: CompiledPredicate, goldenFixtures: GoldenFixture[]): SilentTestResult {
    const offending: string[] = [];
    for (const g of goldenFixtures) {
      this.validateGoldenFixture(g);
      const findings = this.runCheck(p, g.graph, g.source);
      for (const f of findings) {
        if (f.ruleId === p.id) {
          offending.push(`${g.anchor}:${f.severity} — ${f.evidence.slice(0, 200)}`);
        }
      }
    }
    return {
      result: offending.length === 0 ? 'SILENT' : 'FALSE-FIRE',
      goldenFixture: goldenFixtures.map((g) => g.anchor).join(','),
      findings: offending.length,
      evidence: offending.join('\n'),
    };
  }

  private validateFireFixture(f: FireFixture): void {
    if (typeof f.ruleId !== 'string' || f.ruleId.trim() === '') {
      throw calibrationFixtureInvalid('a fire fixture carries an empty ruleId');
    }
    if (typeof f.file !== 'string' || f.file.trim() === '') {
      throw calibrationFixtureInvalid(`fire fixture ${f.ruleId} carries an empty file anchor`);
    }
    if (typeof f.line !== 'number' || !Number.isFinite(f.line)) {
      throw calibrationFixtureInvalid(`fire fixture ${f.ruleId} carries an invalid line anchor`);
    }
    if (!f.graph || typeof (f.graph as GraphAdapter).nodes !== 'function') {
      throw calibrationFixtureInvalid(`fire fixture ${f.ruleId} carries no graph`);
    }
    if (typeof f.source !== 'string') {
      throw calibrationFixtureInvalid(`fire fixture ${f.ruleId} carries no source read`);
    }
  }

  private validateGoldenFixture(g: GoldenFixture): void {
    if (typeof g.anchor !== 'string' || g.anchor.trim() === '') {
      throw calibrationFixtureInvalid('a golden fixture carries an empty anchor');
    }
    if (typeof g.file !== 'string' || g.file.trim() === '') {
      throw calibrationFixtureInvalid(`golden fixture ${g.anchor} carries an empty file anchor`);
    }
    if (!g.graph || typeof (g.graph as GraphAdapter).nodes !== 'function') {
      throw calibrationFixtureInvalid(`golden fixture ${g.anchor} carries no graph`);
    }
    if (typeof g.source !== 'string') {
      throw calibrationFixtureInvalid(`golden fixture ${g.anchor} carries no source read`);
    }
  }

  /** The verdict update as each test lands: a red FIRE or a red SILENT flags
    *  immediately; both green → CALIBRATED; one green + the other untested →
    *  PENDING (the test-progress marker, never a record verdict). The verdict
    *  also rides the predicate object (§6.4's `p.calibrated`). */
  private mark(p: CompiledPredicate): void {
    const fire = this.fireByPred.get(p.id);
    const silent = this.silentByPred.get(p.id);
    let verdict: 'CALIBRATED' | 'FLAGGED' | undefined;
    if (fire && fire.result === 'MISS') verdict = 'FLAGGED';
    else if (silent && silent.result === 'FALSE-FIRE') verdict = 'FLAGGED';
    else if (fire && silent) verdict = 'CALIBRATED';
    if (verdict) {
      this.verdicts.set(p.id, verdict);
      markCalibrated(p, verdict);
    } else {
      markCalibrated(p, 'PENDING');
    }
  }

  /** The W1 calibrations rows — predicate_id / test FIRE|SILENT / fixture /
   *  result FIRED|SILENT|FALSE-FIRE|MISS / evidence / run_id (the shared-db
   *  contract, §9.6 + §9.9). The run_id is the session's (`calibration-<version>`)
   *  — the calibration evidence is queryable per session, forever. */
  private writeCalibrationRows(db: DbClient, records: CalibrationRecord[], fixtureVersion: string): void {
    const ins = db.prepare(
      'INSERT INTO calibrations (predicate_id,test,fixture,result,evidence,run_id,created_at) VALUES (?,?,?,?,?,?,?)',
    );
    const runId = `calibration-${fixtureVersion}`;
    for (const r of records) {
      ins.run(r.predicateId, 'FIRE', r.fire.fixtureAnchor, r.fire.fired ? 'FIRED' : 'MISS', r.fire.evidence, runId, Date.now());
      ins.run(r.predicateId, 'SILENT', r.silent.goldenFixture, r.silent.findings === 0 ? 'SILENT' : 'FALSE-FIRE', r.silent.evidence, runId, Date.now());
    }
  }

  /** The CALIBRATION_vN.md versioned record — APPEND-ONLY across sessions: the
   *  N scans the existing records and increments, so a re-calibration writes a
   *  NEW file and the old evidence is never mutated in place (§9.6). Carries the
   *  batteryVersion, the dryRun state, the records table, the excludedIds + the
   *  coverage note — the evidence W10's audit consumes. */
  private writeCalibrationRecord(
    recordPath: string,
    data: { version: string; records: CalibrationRecord[]; excluded: CompiledPredicate[]; coverageNote: string },
  ): void {
    fs.mkdirSync(recordPath, { recursive: true });
    const existing = fs.readdirSync(recordPath).filter((f) => /^CALIBRATION_v\d+\.md$/.test(f)).length;
    const n = existing + 1;
    const file = path.join(recordPath, `CALIBRATION_v${n}.md`);
    const rows = data.records
      .map((r) => `| ${r.predicateId} | ${r.verdict} | ${r.failedTest ?? '-'} | ${r.fire.fired ? 'FIRED' : 'MISS'} | ${r.silent.findings === 0 ? 'SILENT' : 'FALSE-FIRE'} |`)
      .join('\n');
    const excludedIds = data.excluded.map((p) => p.id);
    const body = [
      `# CALIBRATION_v${n}`,
      '',
      `- batteryVersion: ${data.version}`,
      `- dryRun: ${this.dryRun}`,
      `- calibratedAt: ${this.calibratedAt}`,
      `- excludedIds: ${JSON.stringify(excludedIds)}`,
      '',
      '## Records',
      '',
      '| predicateId | verdict | failedTest | fire | silent |',
      '|---|---|---|---|---|',
      rows,
      '',
      '## Coverage note',
      '',
      data.coverageNote,
      '',
      '```jsonc',
      JSON.stringify(
        {
          batteryVersion: data.version,
          dryRun: this.dryRun,
          calibratedAt: this.calibratedAt,
          excludedIds,
          records: data.records,
          coverageNote: data.coverageNote,
        },
        null,
        2,
      ),
      '```',
      '',
    ].join('\n');
    fs.writeFileSync(file, body);
  }
}

// ---------------------------------------------------------------------------
// THE MODULE-LEVEL API (the mission's runCalibration(profile, fixtures))
// ---------------------------------------------------------------------------

export interface RunCalibrationOptions {
  battery?: CompiledPredicate[];
  fixtureVersion?: string;
  db?: DbClient;
  recordPath?: string;
  dryRun?: boolean;
}

/**
 * runCalibration(profile, fixtures) — the one-shot full gate. The battery is
 * the supplied one, or compiled from the profile when absent (the compiler's
 * compile path). Writes the records when db / recordPath are supplied.
 */
export async function runCalibration(
  profile: ProjectProfile,
  fixtures: CalibrationFixtures,
  opts: RunCalibrationOptions = {},
): Promise<CalibrationResult> {
  try {
    const fixtureVersion = opts.fixtureVersion ?? 'v1';
    const battery = opts.battery ?? (await compile(profile));
    const gate = new CalibrationGate(battery, fixtures, fixtureVersion, opts.dryRun ?? true);
    return gate.run(profile, fixtureVersion, opts.db || opts.recordPath ? { db: opts.db, recordPath: opts.recordPath } : undefined);
  } catch (e: unknown) {
    console.warn(`[calibration] runCalibration failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}


/** THE R16 TYPE_CERTAINTY GUARDED WRITE — the predicate's calibrated marker is
 *  set through a null-guarded accessor (the assertion is earned by the check,
 *  never a bare `as CalibratedPredicate` on the shared battery row). */
function markCalibrated(p: CompiledPredicate, verdict: 'CALIBRATED' | 'FLAGGED' | 'PENDING'): void {
  if (p !== undefined && p !== null) {
    (p as CalibratedPredicate).calibrated = verdict;
    return;
  }
  throw calibrationFixtureInvalid('the predicate row is missing for the calibrated mark');
}
