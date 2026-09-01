// src/subagents/trident-auditor/harness/__tests__/fixture-loop.test.ts
// THE FIXTURE-LOOP PROOF (W9, spec §5.5:2441-2452 — the S6 seam closed).
//
// THE FULL LOOP AS ONE EXECUTABLE ASSERTION: the hunt's artifact (the
// report_sections + findings + the real file on disk + the HUNT_DONE event) →
// the BUILD_DONE producer (the implementations rows + the BUILD_DONE event,
// §4.11:2189) → the audit (SPECIFY→EXTRACT→CONFORM→FIX→VERIFY→REPORT) → the
// verdicts + the AUDIT_DONE event (§4.11:2190). The S6 scenario (the embedded
// container plan) was SKIPPED because this seam produced neither the
// implementations rows nor the BUILD_DONE event — the audit's entry gates are
// both halves of §5.5 step-4 (activeRunId throws AUDIT_NO_RUN on an absent
// BUILD_DONE; EXTRACT reads implementations rows nobody wrote → the battery
// VIOLATES every declared contract). This test IS the regression guard: the
// loop dies loudly if the implementations path or the audit run is removed.
//
// THE HARNESS STYLE: a REAL temp project + a REAL shared.db at the store path
// (.trident/knowledge-graph/shared.db — shared-db-client.ts:137-139) + a real
// file on disk — the audit's fix-apply reads/writes real content, the SHAs are
// mechanically computed, never fabricated. The runId is threaded from the
// HUNT_DONE events row — never a hardcoded string.

import { describe, it, expect, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openSharedDb } from '../../shared/shared-db-client.ts';
import type { SharedDbClient } from '../../shared/shared-db-client.ts';
import { buildDone } from '../../tools/build-done.ts';
import { audit, activeRunId } from '../../tools/audit.ts';

const tmpRoots: string[] = [];

afterAll(() => {
  for (const r of tmpRoots) {
    try { fs.rmSync(r, { recursive: true, force: true }); }
    catch (e: unknown) { console.error(`[fixture-loop.test] cleanup failed: ${String(e)} (root=${r})`); }
  }
});

function tmpProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w9-fixture-loop-'));
  tmpRoots.push(root);
  fs.mkdirSync(path.join(root, 'src', 'engine3'), { recursive: true });
  return root;
}

/** THE HUNT ARTIFACT — the S2 result: the report_sections (the declared
 *  contract with the declared fix file + the checkable acceptance), the
 *  findings row, the real file on disk, the HUNT_DONE event (the §4.11:2188
 *  payload). The how_to_fix doubles as the contract-acceptance probe the
 *  machine's default acceptance checks (audit-machine.ts:127-131). */
function seedHunt(root: string): { client: SharedDbClient; runId: string; file: string } {
  const client = openSharedDb(path.join(root, '.trident', 'knowledge-graph', 'shared.db'));
  const runId = 'run-hunt-loop';
  const file = 'src/engine3/visual-setup-generator.ts';

  client.db.appendReportSection({
    findingId: 'P6:src/engine3/visual-setup-generator.ts:214',
    howBroken: 'the E2 comparator ranks candidates by a price-distance leg',
    whyBroken: 'the E2 selection was reverse-engineered from the price outcome',
    whatViolates: 'Rule P6 (CRIT): "NOTHING SHOULD BE PRICE ANCHORED EVER"',
    howToFix: 'zoneQuality weighting replaces the price-distance leg',
    whatToDo: '1. fix src/engine3/visual-setup-generator.ts:214 2. apply the zoneQuality weighting 3. re-run the battery',
    whyWorks: 'the zone map becomes the only selection authority',
  }, runId);
  client.db.appendFinding({
    ruleId: 'P6',
    severity: 'CRIT',
    file,
    line: 214,
    evidence: 'the E2 comparator ranks candidates by a price-distance leg (graph edge chain: fn:visualSetupGenerator -> P6)',
    verdict: 'VIOLATION',
  }, runId);
  fs.writeFileSync(path.join(root, file), 'const legacy = { priceDistance: 5 };', 'utf-8');
  client.db.appendEvent('HUNT_DONE', {
    runId,
    reportPath: 'MASTER_CONTEXT/bug_hunter_report_v1.md',
    findingsCount: 1,
    batteryVersion: 'fixture-battery-v1',
  });
  return { client, runId, file };
}

/** THE BUILD STEP (the §5.5 step-4 seam) — buildDone applies the fix through
 *  fix-apply (the real before/after sha pair), writes the implementations rows,
 *  appends the BUILD_DONE event. The fix content carries the how_to_fix
 *  acceptance so the audit's default contract acceptance holds mechanically. */
function buildFixture(root: string, runId: string, file: string, content: string): void {
  buildDone({
    targetPath: root,
    runId,
    fixes: [{
      file,
      content,
      claim: 'replaced the price-distance leg per finding P6',
    }],
  });
}

describe('THE FIXTURE LOOP (the §5.5 Hydra flow — hunt → build → audit)', () => {
  it('runs the full hunt→build→audit loop to conformance zero', async () => {
  try {
    const root = tmpProject();
    const { client, runId, file } = seedHunt(root);

    // THE RUNID THREADING — read from the HUNT_DONE row, never hardcoded.
    const huntEvents = client.db.prepare("SELECT kind, payload FROM events WHERE kind = 'HUNT_DONE'").all();
    expect(huntEvents.length).toBe(1);
    const huntPayload: { runId: string } = JSON.parse(String(huntEvents[0].payload));
    const huntRunId = huntPayload.runId;
    expect(huntRunId).toBe(runId);

    // THE BUILD (the implementations path) — the real SHAs from fix-apply.
    buildFixture(root, runId, file, 'const fixed = { zoneQuality: 1 }; // zoneQuality weighting replaces the price-distance leg');

    const implRows = client.db.prepare('SELECT file, before_sha, after_sha, claim, status, run_id FROM implementations WHERE run_id = ?').all(runId);
    expect(implRows.length).toBe(1);
    expect(String(implRows[0].file)).toBe(file);
    expect(String(implRows[0].status)).toBe('CHANGED');
    expect(String(implRows[0].before_sha)).not.toBe(String(implRows[0].after_sha));  // a REAL change
    expect(String(implRows[0].before_sha)).not.toBe('');                              // a REAL sha, never fabricated

    const buildEvents = client.db.prepare("SELECT kind, payload FROM events WHERE kind = 'BUILD_DONE'").all();
    expect(buildEvents.length).toBe(1);
    const buildPayload: { runId: string; implementations: Array<Record<string, string>> } = JSON.parse(String(buildEvents[0].payload));
    expect(buildPayload.runId).toBe(runId);                        // runId === the HUNT_DONE runId
    expect(buildPayload.implementations.length).toBe(1);
    expect(Object.keys(buildPayload.implementations[0]).sort()).toEqual(['afterSha', 'beforeSha', 'claim', 'file']);  // §4.11:2189
    expect(buildPayload.implementations[0].beforeSha).toBe(String(implRows[0].before_sha));

    // THE AUDIT — the S6 prompt: audit with the hunt's runId.
    const result = await audit({ targetPath: root, runId });
    expect(result.state).toBe('done');                             // the machine ran to DONE
    expect(result.conformanceZero).toBe(true);                     // THE S6 PASS TOKEN — conformanceZero":true
    expect(result.verdicts.length).toBe(1);
    expect(result.verdicts[0].verdict).toBe('CONFORMANT');

    // THE AUDIT_DONE EVENT — the §4.11:2190 payload {runId, verdicts[], conformanceZero}.
    const auditEvents = client.db.prepare("SELECT kind, payload FROM events WHERE kind = 'AUDIT_DONE'").all();
    expect(auditEvents.length).toBe(1);
    const auditPayload: { runId: string; verdicts: unknown[]; conformanceZero: boolean } = JSON.parse(String(auditEvents[0].payload));
    expect(auditPayload.runId).toBe(runId);
    expect(auditPayload.conformanceZero).toBe(true);
    expect(Array.isArray(auditPayload.verdicts)).toBe(true);

    // the conformance_verdicts rows — all CONFORMANT (the S6 evidence read).
    const verdictRows = client.db.prepare('SELECT finding_id, verdict FROM conformance_verdicts WHERE run_id = ?').all(runId);
    expect(verdictRows.length).toBe(1);
    expect(String(verdictRows[0].verdict)).toBe('CONFORMANT');
    client.close();
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('throws AUDIT_NO_RUN when no BUILD_DONE event exists — the audit never runs on an absent report', () => {
    const root = tmpProject();
    const { client } = seedHunt(root);
    // no buildDone called — the hunt stopped at HUNT_DONE, the S6 gap.
    expect(() => activeRunId(client)).toThrow('AUDIT_NO_RUN');
    client.close();
  });

  it('catches the deliberate build-agent mistake — a noop implementation is VIOLATED, never a silent pass', async () => {
  try {
    const root = tmpProject();
    const { client, runId, file } = seedHunt(root);

    // THE DELIBERATE MISTAKE (the S6's build-agent mistake row): the agent
    // CLAIMS a fix but applies a noop — fix-apply rewrites the identical
    // content → before_sha === after_sha → CLAIMED_BUT_NOT_FIXED.
    buildFixture(root, runId, file, 'const legacy = { priceDistance: 5 };');

    const result = await audit({ targetPath: root, runId });
    expect(result.state).toBe('inconclusive');                  // the loud fail — never a silent pass
    expect(result.conformanceZero).toBe(false);                 // the highlight STAYS active (D25)
    expect(result.verdicts.some(v => v.verdict === 'VIOLATED')).toBe(true);   // the S6 FAIL token

    const verdictRows = client.db.prepare('SELECT finding_id, verdict FROM conformance_verdicts WHERE run_id = ?').all(runId);
    expect(verdictRows.some(r => String(r.verdict) === 'VIOLATED')).toBe(true);
    client.close();
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('picks up the active runId passively — audit() without a runId resolves the latest BUILD_DONE', async () => {
  try {
    const root = tmpProject();
    const { client, runId, file } = seedHunt(root);
    buildFixture(root, runId, file, 'const fixed = { zoneQuality: 1 }; // zoneQuality weighting replaces the price-distance leg');

    // the runId is OMITTED — the passive-subscriber pickup (§4.11, audit.ts:59).
    const result = await audit({ targetPath: root });
    expect(result.runId).toBe(runId);                            // resolved from the BUILD_DONE event
    expect(result.conformanceZero).toBe(true);
    client.close();
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});
