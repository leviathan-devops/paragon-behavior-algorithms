import { describe, expect, it } from 'bun:test';
import { CalibrationGate, needsRecalibration, CalibrationStaleError } from '../lexicons/audit-calibration.ts';
import { r4EmptyCatch, r17FakeReturn, r8TodoMarker } from '../lexicons/audit-lexicon-inventory.ts';

describe('THE D17 CALIBRATION GATE (W3 — the mutation gate, the L2 spec §3.5)', () => {
  it('the FIRE test passes on the recorded violations (FIRED)', async () => {
    const gate = new CalibrationGate('v1', { dryRun: true });
    const fire = await gate.fireTest(r4EmptyCatch, ['try { risky() } catch {}', 'try { risky() } catch (e) { }']);
    expect(fire.result).toBe('FIRED');
  });

  it('the SILENT test passes on the golden state (SILENT)', async () => {
    const gate = new CalibrationGate('v1', { dryRun: true });
    const silent = await gate.silentTest(r4EmptyCatch, ['try { risky() } catch (e) { tridentLog("caught", e); }']);
    expect(silent.result).toBe('SILENT');
    expect(gate.verdictOf(r4EmptyCatch.id)).toBe('CALIBRATED');
  });

  it('a MISS — the mutant undetected → FLAGGED + EXCLUDED', async () => {
    const gate = new CalibrationGate('v1', { dryRun: true });
    // r17FakeReturn with a fixture that does NOT contain a hardcoded return → MISS
    const miss = await gate.fireTest(r17FakeReturn, ['function f() { return compute(); }']);
    expect(miss.result).toBe('MISS');
    expect(gate.verdictOf(r17FakeReturn.id)).toBe('FLAGGED');
    expect(gate.excludedPatterns()).toContain(r17FakeReturn.id);
  });

  // THE GOLDEN-STATE SILENT (the R8 comment-vs-string rule — the 2026-08-20 anti-FP fix).
  // The R8 TODO-marker regex DETECTS the marker; the STRING_LITERAL construct is DATA,
  // never a defect. A string "TODO" must stay SILENT — the r8 matcher's AST decides.
  it('the R8 marker-in-string stays SILENT (the string is DATA, not a marker — the golden state)', async () => {
    const gate = new CalibrationGate('v1', { dryRun: true });
    const silent = await gate.silentTest(r8TodoMarker, ['const s = "TODO is just a string"']);
    expect(silent.result).toBe('SILENT');
    expect(gate.verdictOf(r8TodoMarker.id)).toBe('CALIBRATED');
  });

  // THE R8 marker-in-a-COMMENT FIRES (the comment is a real marker — the matcher's FIRE case).
  it('the R8 marker-in-a-comment FIRES (the comment is a real marker)', async () => {
    const gate = new CalibrationGate('v1', { dryRun: true });
    const fire = await gate.fireTest(r8TodoMarker, ['// TODO: fix this', '// FIXME: broken']);
    expect(fire.result).toBe('FIRED');
    expect(fire.firedCount).toBe(2);
  });

  it('the STALE-VERSION rejection (O22.4) — a battery-version change invalidates the calibration', () => {
    expect(needsRecalibration('v1', 'v2')).toBe(true);
    expect(needsRecalibration('v1', 'v1')).toBe(false);
    expect(needsRecalibration(undefined, 'v1')).toBe(true);
  });

  it('the DRY-RUN default — never auto-arms', () => {
    const gate = new CalibrationGate('v1');
    expect(gate.isDryRun()).toBe(true);
  });
});
