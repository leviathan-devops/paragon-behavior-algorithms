// src/subagents/trident-auditor/conformance/__tests__/conformance.test.ts
// THE CONFORMANCE TERNARY BATTERY (W9, spec §4.8:2125-2135, D38).
//
// The declared-vs-implemented diff runner's proof cases: the claimed-but-not-
// fixed (before_sha === after_sha → VIOLATED), the partial change (→ PARTIAL),
// the verified change (→ CONFORMANT), the no-new-same-rule-violations check
// (the battery re-run on the changed files). Plus the adversarial: the missing
// implementation row, the multi-file strictest-verdict-wins, the file-changed-
// but-rule-still-fires, the conformanceZero aggregation, the persistence
// through the shared DB (the append + the W1 verdict canon).

import { describe, it, expect } from 'bun:test';
import type { DeclaredContract } from '../spec-extractor.ts';
import { runConformance, persistVerdicts } from '../checker.ts';
import type { ImplementationRow } from '../../shared/shared-db-client.ts';
import { openStore } from '../../../../shared/knowledge-graph/db.ts';
import { openSharedDb } from '../../shared/shared-db-client.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// THE FIXTURES
// ---------------------------------------------------------------------------

const CONTRACT: DeclaredContract = {
  findingId: 'P6:src/engine3/visual-setup-generator.ts:214',
  files: ['src/engine3/visual-setup-generator.ts'],
  contract: 'Rule P6 (CRIT): "NOTHING SHOULD BE PRICE ANCHORED EVER"',
  acceptance: 'zoneQuality weighting',
};

const CONTRACT_MULTI: DeclaredContract = {
  findingId: 'P1:src/mdve/shape-brain.ts:31',
  files: ['src/mdve/shape-brain.ts', 'src/mdve/reasoning-chain.ts'],
  contract: 'the E1/E2 provenance chain',
  acceptance: 'tracesTo present',
};

function impl(over: Partial<ImplementationRow>): ImplementationRow {
  return {
    file: 'src/engine3/visual-setup-generator.ts',
    before_sha: 'aaaa',
    after_sha: 'bbbb',
    claim: 'removed the price-distance leg',
    status: 'CHANGED',
    run_id: 'run-test',
    ...over,
  };
}

describe('THE CONFORMANCE TERNARY (§4.8, D38)', () => {
  it('the claimed-but-not-fixed class — before_sha === after_sha → VIOLATED (the zero-trust core)', () => {
    const res = runConformance([CONTRACT], [impl({ before_sha: 'aaaa', after_sha: 'aaaa' })]);
    expect(res.verdicts[0].verdict).toBe('VIOLATED');
    expect(res.verdicts[0].evidence).toContain('claimed, did not fix');
    expect(res.verdicts[0].evidence).toContain('before_sha');
    expect(res.conformanceZero).toBe(false);   // the highlight STAYS active (D25)
  });

  it('a partial change — the file changed but the contract is only partially satisfied → PARTIAL', () => {
    const res = runConformance([CONTRACT], [impl({ before_sha: 'aaaa', after_sha: 'bbbb' })], {
      contractAcceptance: () => false,   // the acceptance probe fails → PARTIAL
    });
    expect(res.verdicts[0].verdict).toBe('PARTIAL');
    expect(res.verdicts[0].evidence).toContain('partially satisfied');
    expect(res.conformanceZero).toBe(false);
  });

  it('a verified change — the file changed + the contract holds + no regressions → CONFORMANT', () => {
    const res = runConformance([CONTRACT], [impl({ before_sha: 'aaaa', after_sha: 'bbbb' })], {
      contractAcceptance: () => true,
    });
    expect(res.verdicts[0].verdict).toBe('CONFORMANT');
    expect(res.verdicts[0].evidence).toContain('bbbb');
    expect(res.conformanceZero).toBe(true);
  });

  it('the no-new-same-rule-violations check — a rule still firing on the changed file → VIOLATED', () => {
    const res = runConformance([CONTRACT], [impl({ before_sha: 'aaaa', after_sha: 'bbbb' })], {
      contractAcceptance: () => true,
      ruleFireCheck: () => ['P6'],   // the battery re-run still fires P6 on the changed file
    });
    expect(res.verdicts[0].verdict).toBe('VIOLATED');
    expect(res.verdicts[0].evidence).toContain('still fire');
    expect(res.conformanceZero).toBe(false);
  });

  it('a changed file with the rule SILENT + the contract held → CONFORMANT (the adversarial pass)', () => {
    const res = runConformance([CONTRACT], [impl({ before_sha: 'aaaa', after_sha: 'bbbb' })], {
      contractAcceptance: () => true,
      ruleFireCheck: () => [],
    });
    expect(res.verdicts[0].verdict).toBe('CONFORMANT');
    expect(res.conformanceZero).toBe(true);
  });

  it('a declared contract with NO implementation row → VIOLATED (the declared fix is absent)', () => {
    const res = runConformance([CONTRACT], []);
    expect(res.verdicts[0].verdict).toBe('VIOLATED');
    expect(res.verdicts[0].evidence).toContain('NO implementation row');
    expect(res.conformanceZero).toBe(false);
  });

  it('a multi-file fix: the strictest verdict wins — one VIOLATED file blocks the clear', () => {
    const res = runConformance([CONTRACT_MULTI], [
      impl({ file: 'src/mdve/shape-brain.ts', before_sha: 'aaaa', after_sha: 'bbbb' }),
      impl({ file: 'src/mdve/reasoning-chain.ts', before_sha: 'cccc', after_sha: 'cccc' }),   // claimed-but-not-fixed
    ]);
    expect(res.verdicts[0].verdict).toBe('VIOLATED');
    expect(res.conformanceZero).toBe(false);
  });

  it('a multi-file fix all CONFORMANT → the contract is CONFORMANT', () => {
    const res = runConformance([CONTRACT_MULTI], [
      impl({ file: 'src/mdve/shape-brain.ts', before_sha: 'aaaa', after_sha: 'bbbb' }),
      impl({ file: 'src/mdve/reasoning-chain.ts', before_sha: 'cccc', after_sha: 'dddd' }),
    ], { contractAcceptance: () => true });
    expect(res.verdicts[0].verdict).toBe('CONFORMANT');
    expect(res.conformanceZero).toBe(true);
  });

  it('an empty contract set → conformanceZero true (a clean audit is a valid outcome)', () => {
    const res = runConformance([], []);
    expect(res.verdicts.length).toBe(0);
    expect(res.conformanceZero).toBe(true);
  });

  it('the conformanceZero aggregation — one VIOLATED among many → false', () => {
    const res = runConformance(
      [CONTRACT, CONTRACT_MULTI],
      [
        impl({ before_sha: 'aaaa', after_sha: 'bbbb' }),
        impl({ file: 'src/mdve/shape-brain.ts', before_sha: 'aaaa', after_sha: 'bbbb' }),
        impl({ file: 'src/mdve/reasoning-chain.ts', before_sha: 'cccc', after_sha: 'cccc' }),
      ],
      { contractAcceptance: () => true },
    );
    expect(res.conformanceZero).toBe(false);
  });

  it('the persisted verdicts land through the shared DB + the W1 verdict canon (the ternary survives the store)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w9-conform-'));
    const dbPath = path.join(dir, 'shared.db');
    const client = openSharedDb(dbPath);
    try {
      const res = runConformance([CONTRACT], [impl({ before_sha: 'aaaa', after_sha: 'bbbb' })], {
        contractAcceptance: () => true,
      });
      const persisted = persistVerdicts(client, 'run-test', verdictRows(res.verdicts));
      expect(persisted.conformanceZero).toBe(true);
      const rows = client.db.prepare('SELECT finding_id, verdict, evidence FROM conformance_verdicts WHERE run_id = ?').all('run-test');
      expect(rows.length).toBe(1);
      expect(rows[0].verdict).toBe('CONFORMANT');
      // the persist wrote through W1's store — the openStore can re-read it
      const store = openStore(dbPath);
      const storeRows = store.prepare('SELECT verdict FROM conformance_verdicts').all();
      expect(storeRows.length).toBe(1);
      expect(storeRows[0].verdict).toBe('CONFORMANT');
      store.close();
    } finally {
      client.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});


/** THE R16 TYPE_CERTAINTY GUARDED READ — the conformance verdict rows are
 *  narrowed behind the Array.isArray check (the assertion is earned by the
 *  runtime validation, never a bare cast on the runner's result). */
function verdictRows(rows: unknown): Array<{
  findingId: string; verdict: 'CONFORMANT' | 'VIOLATED' | 'PARTIAL'; evidence: string; fixedBy: 'trident_build' | 'trident_auditor';
}> {
  if (Array.isArray(rows)) {
    return rows as Array<{
      findingId: string; verdict: 'CONFORMANT' | 'VIOLATED' | 'PARTIAL'; evidence: string; fixedBy: 'trident_build' | 'trident_auditor';
    }>;
  }
  throw new Error('[conformance.test] the verdict rows must be an array');
}
