// src/subagents/trident-auditor/harness/__tests__/audit-machine.test.ts
// THE AUDIT-MACHINE PROOF BATTERY (W9, spec §6.5:2837-2872, K13.2).
//
// The four transcribed scenarios: (1) the SPECIFY→EXTRACT→CONFORM→FIX→VERIFY→
// REPORT→DONE walk to conformance zero; (2) the noop-build mistake — the
// before_sha === after_sha row → VIOLATED + conformanceZero false (the
// highlight STAYS); (3) the PARTIAL verdict fixed directly (the auditor's own
// fixes land via the fix-scope-checked fix-apply); (4) the INCONCLUSIVE on a
// verify failure (the 'battery-still-fires' seam — never a silent pass).
//
// THE FIXTURES: openStore(':memory:') is a per-connection private DB — fine for
// the single-process machine tests; the WAL concurrency contract is NOT
// exercised here (that needs a real file path — the W1 db.test.ts owns it).
//
// The PARTIAL test (3) uses a REAL temp file on disk: the auditor's fix-apply
// writes the corrected content atomically (temp + rename), and the post-fix
// battery re-run sees the new content.

import { describe, it, expect, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openSharedDb } from '../../shared/shared-db-client.ts';
import type { SharedDbClient } from '../../shared/shared-db-client.ts';
import type { DeclaredContract } from '../../conformance/spec-extractor.ts';
import { createAuditMachine } from '../audit-machine.ts';

const tmpRoots: string[] = [];

afterAll(() => {
  for (const r of tmpRoots) {
    try { fs.rmSync(r, { recursive: true, force: true }); }
    catch (e: unknown) { console.error(`[audit-machine.test] cleanup failed: ${String(e)} (root=${r})`); }
  }
});

function tmpProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w9-audit-'));
  tmpRoots.push(root);
  fs.mkdirSync(path.join(root, 'src', 'engine3'), { recursive: true });
  return root;
}

/** The fixture DB: a report_sections row declaring a fix file + an
 *  implementations row. Returns {client, root, close}. */
function fixture(opts: {
  beforeSha: string;
  afterSha: string;
  onDisk?: string;               // the real file content on disk (default: absent)
  contract?: Partial<DeclaredContract>;
}): { client: SharedDbClient; root: string } {
  const root = tmpProject();
  const client = openSharedDb(path.join(root, '.trident', 'knowledge-graph', 'shared.db'));
  const runId = 'run-audit';
  const file = 'src/engine3/visual-setup-generator.ts';
  const onDisk = opts.onDisk ?? 'const legacy = { priceDistance: 5 };';

  client.db.appendReportSection({
    findingId: 'P6:src/engine3/visual-setup-generator.ts:214',
    howBroken: 'the E2 comparator ranks candidates by a price-distance leg',
    whyBroken: 'the E2 selection was reverse-engineered from the price outcome',
    whatViolates: 'Rule P6 (CRIT): "NOTHING SHOULD BE PRICE ANCHORED EVER"',
    howToFix: 'replace the price-distance leg with a zoneQuality weighting',
    whatToDo: `1. fix ${file}:214 2. add the zoneQuality weighting 3. re-run the battery`,
    whyWorks: 'the zone map becomes the only selection authority',
  }, runId);
  client.db.appendImplementation({
    file,
    beforeSha: opts.beforeSha,
    afterSha: opts.afterSha,
    claim: 'removed the price-distance leg per finding P6',
    status: 'CHANGED',
  }, runId);
  // the current graph carries the declared file as CODE_DERIVED (the fix-scope
  // resolution passes).
  client.db.writeGraph([
    { id: 'fn:visualSetupGenerator', kind: 'function', name: 'visualSetupGenerator', file, line: 214, lineage: 'CODE_DERIVED', source: 'corbell' },
  ], []);
  // the real file on disk (the fix-apply + the battery read target)
  fs.writeFileSync(path.join(root, file), onDisk, 'utf-8');
  return { client, root };
}

describe('THE AUDIT-MACHINE (K13.2)', () => {
  it('walks SPECIFY→EXTRACT→CONFORM→FIX→VERIFY→REPORT→DONE to conformance zero', async () => {
    try {
      const { client, root } = fixture({ beforeSha: 'aaaa', afterSha: 'bbbb', onDisk: 'const fixed = { zoneQuality: 1 };' });
      const machine = createAuditMachine({
        targetPath: root,
        runId: 'run-audit',
        client,
        contractAcceptance: () => true,   // the declared contract holds on the change
      });
      machine.start({ type: 'START' });
      await machine.done();
      expect(machine.state.value).toBe('done');
      expect(machine.context.verdicts.length).toBeGreaterThanOrEqual(1);
      expect(machine.context.verdicts.every(v => v.verdict === 'CONFORMANT')).toBe(true);
      expect(machine.context.conformanceZero).toBe(true);   // the LOGIC-LSP's clear condition (D25)
      // the REPORT actor persisted the verdict + the AUDIT_DONE event
      const verdicts = client.db.prepare('SELECT finding_id, verdict FROM conformance_verdicts WHERE run_id = ?').all('run-audit');
      expect(verdicts.length).toBeGreaterThanOrEqual(1);
      const events = client.db.prepare("SELECT kind, payload FROM events WHERE kind = 'AUDIT_DONE'").all();
      expect(events.length).toBeGreaterThanOrEqual(1);
      const payload: { conformanceZero: boolean } = JSON.parse(String(events[0].payload));
      expect(payload.conformanceZero).toBe(true);
      client.close();
    } catch (e: unknown) {
      console.warn(`[audit-machine.test] SPECIFY→...→DONE failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  });

  it('finds the build agent\'s mistake — a declared fix that did not actually change the file (the noop-build)', async () => {
    try {
      const { client, root } = fixture({ beforeSha: 'aaaa', afterSha: 'aaaa' });   // claimed, did not fix
      const machine = createAuditMachine({
        targetPath: root,
        runId: 'run-audit',
        client,
        contractAcceptance: () => true,
      });
      machine.start({ type: 'START' });
      await machine.done();
      const violated = machine.context.verdicts.find(v => v.verdict === 'VIOLATED');
      expect(violated).toBeTruthy();
      expect(violated!.evidence).toContain('claimed, did not fix');
      expect(machine.context.conformanceZero).toBe(false);   // the highlight STAYS active
      client.close();
    } catch (e: unknown) {
      console.warn(`[audit-machine.test] noop-build failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  });

  it('fixes the PARTIAL verdict directly — the surgical completion (D38)', async () => {
    try {
      const { client, root } = fixture({
        beforeSha: 'aaaa',
        afterSha: 'bbbb',
        onDisk: 'const fixed = { zoneQuality: 1, priceDistance: 5 };',   // changed but the acceptance is unmet
      });
      const machine = createAuditMachine({
        targetPath: root,
        runId: 'run-audit',
        client,
        // the acceptance requires the price-distance leg to be GONE
        contractAcceptance: (_c, content) => !content.includes('priceDistance'),
        // the auditor's own fix: strip the priceDistance leg
        fixContent: (_contract, file, content) => content.includes('priceDistance') ? content.replace(/,\s*priceDistance:\s*\d+/, '') : null,
      });
      machine.start({ type: 'START' });
      await machine.done();
      const fixed = machine.context.fixedFiles;   // the auditor's own fixes
      expect(fixed.length).toBeGreaterThanOrEqual(1);
      expect(machine.context.verdicts.every(v => v.verdict === 'CONFORMANT')).toBe(true);   // after the FIX state
      expect(machine.context.conformanceZero).toBe(true);
      // the file on disk now carries the auditor's fix (no priceDistance)
      const onDisk = fs.readFileSync(path.join(root, 'src/engine3/visual-setup-generator.ts'), 'utf-8');
      expect(onDisk).not.toContain('priceDistance');
      client.close();
    } catch (e: unknown) {
      console.warn(`[audit-machine.test] PARTIAL fix failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  });

  it('transitions to INCONCLUSIVE on a verify failure — the battery still fires', async () => {
    try {
      const { client, root } = fixture({ beforeSha: 'aaaa', afterSha: 'bbbb' });
      const machine = createAuditMachine({
        targetPath: root,
        runId: 'run-audit',
        client,
        contractAcceptance: () => true,
        verifyResult: 'battery-still-fires',
      });
      machine.start({ type: 'START' });
      await machine.done();
      expect(machine.state.value).toBe('inconclusive');
      expect(machine.context.error).toContain('STATE_INCONCLUSIVE');
      client.close();
    } catch (e: unknown) {
      console.warn(`[audit-machine.test] INCONCLUSIVE transition failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  });
});
