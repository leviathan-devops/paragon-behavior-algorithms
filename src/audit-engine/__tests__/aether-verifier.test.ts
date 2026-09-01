// src/audit-engine/__tests__/aether-verifier.test.ts — THE SIX CHECKS, each with
// a FAILING case (SPEC-2 §10.1 + the acceptance #6: the fire-that-never-fires is
// THEATER). The literal §10.1 battery is held in substance; the fixture anchor
// path is a DYNAMIC temp root (never a hardcoded absolute path — the R5 law).
import { describe, expect, it } from 'bun:test';
import * as os from 'os';
import * as path from 'path';

import {
  verifyAetherOutput,
  R_ANCHOR_ABSENT,
  R_COUNT_MISMATCH,
  R_SEVERITY_DRIFT,
  R_CALIBRATION_VIOLATION,
  R_UNGROUNDED_PROSE,
  R_RANK_OUT_OF_SCOPE,
} from '../aether/silent-verifier.ts';
import type { ProbedVerdict } from '../aether/silent-verifier.ts';
import type { AuditFinding } from '../types.ts';

// the dynamic fixture root — the anchor path is a temp file, resolved (not /tmp hardcoded)
const FIX = path.join(os.tmpdir(), 'aether-verifier-fixture-f.ts');

const F = (o: Partial<AuditFinding>): AuditFinding => ({ severity: 'HIGH', category: 'X', file: FIX, line: 1, evidence: 'e', description: 'd', correction: 'c', runtimeImpact: 'i', confidence: 0.9, layer: 'R1', constructType: null, callGraphRef: null, evidenceSuppressed: false, ...o });
const V = (o: Partial<ProbedVerdict>): ProbedVerdict => ({ findingIndex: 0, adjudication: 'TRUE_POSITIVE', deeperRoot: 'the root cites add', concreteFix: `${FIX}:1 change x`, consequenceRank: 1, ...o });
const anchorOk = (_f: string, _l: number) => true;         // the anchor-resolver stub (real = fs within scope)

describe('THE SILENT-VERIFIER — the six checks each REJECT their fabrication class', () => {
  it('CHECK 1 — a fix citing a NON-EXISTENT anchor is REJECTED (VERIFY_ANCHOR_ABSENT)', () => {
    const ghost = path.join(os.tmpdir(), 'ghost-does-not-exist.ts');
    const ver = V({ concreteFix: `${ghost}:999 — this file does not exist` });
    const r = verifyAetherOutput([ver], [F({})], { nodes: 1, edges: 0 }, (f) => !(f === ghost));
    expect(r.passed).toBe(false);
    expect(r.failures.some((x) => x.reason.startsWith(R_ANCHOR_ABSENT))).toBe(true);
  });
  it('CHECK 2 — a verdict COUNT mismatch (3 vs 4) is REJECTED (VERIFY_COUNT_MISMATCH)', () => {
    const r = verifyAetherOutput([V({}), V({}), V({})], [F({}), F({}), F({}), F({})], { nodes: 1, edges: 0 }, anchorOk);
    expect(r.passed).toBe(false);
    expect(r.failures.some((x) => x.reason === R_COUNT_MISMATCH)).toBe(true);
  });
  it('CHECK 3 — a SEVERITY drift (the aether upgrades HIGH→CRITICAL) is REJECTED (VERIFY_SEVERITY_DRIFT)', () => {
    // the literal §10.1 case: a clean verdict carries NO severity claim → no drift,
    // because the PROBED_VERDICT has no severity field — the verdict cannot drift.
    const clean = verifyAetherOutput([V({ adjudication: 'TRUE_POSITIVE' })], [F({ severity: 'HIGH' })], { nodes: 1, edges: 0 }, anchorOk);
    expect(clean.failures.filter((x) => x.reason.startsWith(R_SEVERITY_DRIFT)).length).toBe(0);
    // the adversarial failing case (acceptance #6): the PROSE re-decides the machine
    // severity — the root declares CRITICAL against a HIGH finding → VERIFY_SEVERITY_DRIFT
    const drift = V({ deeperRoot: 'this is a CRITICAL defect that corrupts the ledger' });
    const r = verifyAetherOutput([drift], [F({ severity: 'HIGH' })], { nodes: 1, edges: 0 }, anchorOk);
    expect(r.passed).toBe(false);
    expect(r.failures.some((x) => x.reason.startsWith(R_SEVERITY_DRIFT))).toBe(true);
  });
  it('CHECK 4 — a verdict referencing a finding OUTSIDE the calibrated set (an out-of-range index) is REJECTED (VERIFY_CALIBRATION_VIOLATION)', () => {
    const r = verifyAetherOutput([V({ findingIndex: 7 })], [F({})], { nodes: 1, edges: 0 }, anchorOk); // findingIndex out of range
    expect(r.passed).toBe(false);   // the out-of-range index → the invented/dropped finding class
    expect(r.failures.some((x) => x.reason.startsWith(R_CALIBRATION_VIOLATION))).toBe(true);
  });
  it('CHECK 4b — a DUPLICATE findingIndex (two verdicts for one finding / a dropped sibling) is REJECTED (VERIFY_CALIBRATION_VIOLATION)', () => {
    const r = verifyAetherOutput([V({ findingIndex: 0 }), V({ findingIndex: 0 })], [F({}), F({})], { nodes: 1, edges: 0 }, anchorOk);
    expect(r.passed).toBe(false);
    expect(r.failures.some((x) => x.reason.startsWith(R_CALIBRATION_VIOLATION))).toBe(true);
  });
  it('CHECK 5 — a deeper-root citing a symbol ABSENT from the source window is REJECTED (VERIFY_UNGROUNDED_PROSE)', () => {
    const ver = V({ deeperRoot: 'the mechanism ties to the mysteriousZorp function' });
    // the window for the fixture file does not contain 'mysteriousZorp' → the ungrounded-prose check
    const r = verifyAetherOutput([ver], [F({})], { nodes: 1, edges: 0 }, anchorOk, [[FIX, 'export function f() {}']]);
    expect(r.failures.some((x) => x.reason.startsWith(R_UNGROUNDED_PROSE))).toBe(true);
  });
  it('CHECK 5b — a deeper-root citing a symbol PRESENT in the window PASSES (the evidence-bound accepted)', () => {
    const ver = V({ deeperRoot: 'the failure lives in the add() path' });
    const r = verifyAetherOutput([ver], [F({})], { nodes: 1, edges: 0 }, anchorOk, [[FIX, 'export function add() {}']]);
    expect(r.passed).toBe(true);
  });
  it('CHECK 6 — a consequence-rank outside 1..4 is REJECTED (VERIFY_RANK_OUT_OF_SCOPE)', () => {
    const ver = V({ consequenceRank: 0 as never });   // 0 is outside 1..4
    const r = verifyAetherOutput([ver], [F({})], { nodes: 1, edges: 0 }, anchorOk);
    expect(r.failures.some((x) => x.reason.startsWith(R_RANK_OUT_OF_SCOPE))).toBe(true);
  });
  it('THE FABRICATION REPLAY — the ghost-anchor + the count-mismatch BOTH reject (the red-team)', () => {
    const ghost = path.join(os.tmpdir(), 'ghost-does-not-exist.ts');
    const r = verifyAetherOutput(
      [V({ concreteFix: `${ghost}:999`, deeperRoot: 'the missingZorp' })],  // the fabricated
      [F({}), F({})],                                                      // the count differs
      { nodes: 1, edges: 0 }, (f) => !(f === ghost), [[FIX, 'function f() {}']]);
    expect(r.failures.length).toBeGreaterThanOrEqual(2);   // the anchor + the count both rejected
  });
  it('THE HAPPY PATH — a fully-grounded, correctly-shaped verdict set PASSES', () => {
    const g = path.join(os.tmpdir(), 'aether-verifier-fixture-g.ts');
    const findings = [F({ severity: 'HIGH' }), F({ severity: 'LOW', file: g, line: 2 })];
    const verdicts = [
      V({ findingIndex: 0, deeperRoot: 'the run() swallows the rejection', concreteFix: `${FIX}:1 add a log`, consequenceRank: 1 }),
      V({ findingIndex: 1, deeperRoot: 'the config() lacks a guard', concreteFix: `${g}:2 add a guard`, consequenceRank: 3 }),
    ];
    const r = verifyAetherOutput(verdicts, findings, { nodes: 1, edges: 0 }, (_f, _l) => true);
    expect(r.passed).toBe(true);
    expect(r.failures.length).toBe(0);
  });
});
// THE FIRE-THAT-NEVER-FIRES IS THEATER: every check has its failing case above.
