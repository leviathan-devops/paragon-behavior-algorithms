// src/audit-engine/__tests__/aether-store.test.ts — THE AETHER-STORE BATTERY
// (SPEC-2 §9.7.7 + §9.10 S7 C7 + §10.4). THE DRIVER IS THE REAL bun:sqlite
// in-memory Database (never a mock) — the §10.4 schema is applied VERBATIM
// via the store's own exported DDL, so the battery proves the REAL table
// contract (the CHECK constraints fire on the wrong rows).
import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

import {
  persistVerdicts,
  readVerdicts,
  ensureAetherVerdictsSchema,
  unverifiedFindingIndexes,
  verificationCountBoundFailed,
  STORE_WRITE_FAILED,
  STORE_READ_FAILED,
} from '../aether/aether-store.ts';
import type { AetherStoreDb } from '../aether/aether-store.ts';
import type { ProbedVerdict, VerifierResult } from '../aether/silent-verifier.ts';

const V = (o: Partial<ProbedVerdict>): ProbedVerdict => ({
  findingIndex: 0,
  adjudication: 'TRUE_POSITIVE',
  deeperRoot: 'the catch binding swallows the rejection',
  concreteFix: 'src/bad.ts:1 — log + rethrow',
  consequenceRank: 1,
  ...o,
});

const PASS = (failures: VerifierResult['failures'] = []): VerifierResult => ({
  passed: failures.length === 0,
  failures,
});

const newDb = (): AetherStoreDb => new Database(':memory:') as unknown as AetherStoreDb;

// THE ASYNC REJECTION ASSERTION (the bun:test ambient shim carries no .rejects —
// the try/catch captures the LOUD error and the marker is asserted on its text;
// a path that does NOT throw leaves the message empty and the test FAILS).
const expectRejects = async (fn: () => Promise<unknown>, marker: string): Promise<void> => {
  let message = '';
  try {
    await fn();
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  expect(message.includes(marker)).toBe(true);
};

describe('THE AETHER STORE — the §10.4 persistence + the verified-flag truth (SPEC-2 §9.7.7)', () => {
  it('THE PERSISTENCE — the rows survive the run + the 1:1 finding_index map matches (the count-bound stored)', async () => {
    const db = newDb();
    const verdicts = [V({ findingIndex: 0 }), V({ findingIndex: 1, adjudication: 'RED_HERRING', consequenceRank: 4 }), V({ findingIndex: 2, adjudication: 'UNCLEAR', consequenceRank: 2 }), V({ findingIndex: 3 })];
    const written = await persistVerdicts(db, 'audit-run-1', verdicts, PASS());
    expect(written).toBe(4);

    const rows = await readVerdicts(db, 'audit-run-1');
    expect(rows.length).toBe(4);
    expect(rows.map((r) => r.finding_index).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(rows.every((r) => r.run_id === 'audit-run-1')).toBe(true);
    expect(rows.every((r) => r.verified === 1)).toBe(true);
    expect(rows[1].adjudication).toBe('RED_HERRING');
    expect(rows[2].consequence_rank).toBe(2);
  });

  it('THE VERIFIED FLAG — a verifier-passed verdict stores 1; an UNVERIFIED stores 0 (the per-claim truth)', async () => {
    const db = newDb();
    const verdicts = [V({ findingIndex: 0 }), V({ findingIndex: 1 }), V({ findingIndex: 2 })];
    const verification: VerifierResult = {
      passed: false,
      failures: [{ claim: 'finding 1 cites src/ghost.ts:999', reason: 'VERIFY_ANCHOR_ABSENT — the fix cites src/ghost.ts:999, which does not exist' }],
    };
    await persistVerdicts(db, 'audit-run-2', verdicts, verification);

    const rows = await readVerdicts(db, 'audit-run-2');
    expect(rows.filter((r) => r.verified === 1).map((r) => r.finding_index).sort()).toEqual([0, 2]);
    expect(rows.filter((r) => r.verified === 0).map((r) => r.finding_index)).toEqual([1]);
    // THE HONESTY (the §9.7.7 C7): a stored verified=1 row is NEVER in the unverified set
    const unverified = unverifiedFindingIndexes(verification);
    expect(rows.every((r) => (r.verified === 1 ? !unverified.has(r.finding_index) : true))).toBe(true);
  });

  it('THE COUNT-BOUND TAINT — a VERIFY_COUNT_MISMATCH failure stores EVERY row verified=0 (the bijection unproven, never a partial trust)', async () => {
    const db = newDb();
    const verdicts = [V({ findingIndex: 0 }), V({ findingIndex: 1 }), V({ findingIndex: 2 })];
    const verification: VerifierResult = {
      passed: false,
      failures: [{ claim: 'verdict count 3 vs finding count 4', reason: 'VERIFY_COUNT_MISMATCH' }],
    };
    await persistVerdicts(db, 'audit-run-3', verdicts, verification);

    const rows = await readVerdicts(db, 'audit-run-3');
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.verified === 0)).toBe(true);   // NEVER an unverified verdict stored as verified
  });

  it('THE EMPTY SET — zero verdicts writes zero rows + reads back empty (the legitimate empty-target, never an error)', async () => {
    const db = newDb();
    const written = await persistVerdicts(db, 'audit-run-4', [], PASS());
    expect(written).toBe(0);
    const rows = await readVerdicts(db, 'audit-run-4');
    expect(rows.length).toBe(0);
  });

  it('THE MALFORMED VERDICT — a rank outside 1..4 is REFUSED before ANY row lands (the storage-side honesty)', async () => {
    const db = newDb();
    const bad = V({ findingIndex: 0, consequenceRank: 9 as never });
    await expectRejects(() => persistVerdicts(db, 'audit-run-5', [V({ findingIndex: 0 }), bad], PASS()), STORE_WRITE_FAILED);
    const rows = await readVerdicts(db, 'audit-run-5');
    expect(rows.length).toBe(0);   // validate-before-insert: no half-written batch
  });

  it('THE NEGATIVE INDEX — a finding_index < 0 is REFUSED (the CHECK bound enforced store-side)', async () => {
    const db = newDb();
    await expectRejects(() => persistVerdicts(db, 'audit-run-6', [V({ findingIndex: -1 })], PASS()), STORE_WRITE_FAILED);
  });

  it('THE BAD ADJUDICATION — a value outside the 3-class set is REFUSED', async () => {
    const db = newDb();
    await expectRejects(() => persistVerdicts(db, 'audit-run-7', [V({ adjudication: 'MAYBE' as never })], PASS()), STORE_WRITE_FAILED);
  });

  it('THE EMPTY RUN-ID — the write + the read both REFUSE it (an unkeyed row is un-rehydratable)', async () => {
    const db = newDb();
    await expectRejects(() => persistVerdicts(db, '', [V({})], PASS()), STORE_WRITE_FAILED);
    await expectRejects(() => readVerdicts(db, '  '), STORE_READ_FAILED);
  });

  it('THE ABSENT HANDLE — a malformed db handle is a LOUD refusal, never a silent no-op', async () => {
    await expectRejects(() => persistVerdicts({} as AetherStoreDb, 'audit-run-8', [V({})], PASS()), STORE_WRITE_FAILED);
    await expectRejects(() => readVerdicts(null as unknown as AetherStoreDb, 'audit-run-8'), STORE_READ_FAILED);
  });

  it('THE APPEND-ONLY REHYDRATION — two runs coexist; the read is scoped by run_id (the compaction-inert history)', async () => {
    const db = newDb();
    await persistVerdicts(db, 'audit-run-9a', [V({ findingIndex: 0 })], PASS());
    await persistVerdicts(db, 'audit-run-9b', [V({ findingIndex: 0 }), V({ findingIndex: 1 })], PASS());

    const a = await readVerdicts(db, 'audit-run-9a');
    const b = await readVerdicts(db, 'audit-run-9b');
    expect(a.length).toBe(1);
    expect(b.length).toBe(2);
    expect(a[0].id).not.toBe(b[0].id);   // the atomic seq — no silent dupes
  });

  it('THE DDL IS ADDITIVE + IDEMPOTENT — the schema application twice never fails (the S-PB4 migration contract)', () => {
    const db = newDb();
    ensureAetherVerdictsSchema(db);
    ensureAetherVerdictsSchema(db);   // CREATE TABLE IF NOT EXISTS — the second application is a no-op
    const tables = db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name='aether_verdicts'`).all();
    expect(tables.length).toBe(1);
  });

  it('THE SCHEMA CHECK FIRES — a direct insert violating the rank CHECK is rejected by the REAL table (the §10.4 constraints are live)', () => {
    const db = newDb();
    ensureAetherVerdictsSchema(db);
    let threw = false;
    try {
      db.prepare(`INSERT INTO aether_verdicts (run_id, finding_index, adjudication, deeper_root, concrete_fix, consequence_rank, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('audit-run-10', 0, 'TRUE_POSITIVE', 'r', 'f', 7, 0, 1);
    } catch {
      threw = true;   // the CHECK (consequence_rank BETWEEN 1 AND 4) fired
    }
    expect(threw).toBe(true);
  });

  it('THE HELPERS — the unverified-index parse + the count-bound detection are computed from the failure list', () => {
    const verification: VerifierResult = {
      passed: false,
      failures: [
        { claim: 'finding 3 cites x:1', reason: 'VERIFY_ANCHOR_ABSENT — x' },
        { claim: 'finding 3 prose declares LOW', reason: 'VERIFY_SEVERITY_DRIFT — y' },
        { claim: 'verdict count 2 vs finding count 4', reason: 'VERIFY_COUNT_MISMATCH' },
      ],
    };
    const indexes = unverifiedFindingIndexes(verification);
    expect(indexes.has(3)).toBe(true);
    expect(indexes.has(0)).toBe(false);
    expect(verificationCountBoundFailed(verification)).toBe(true);
    expect(verificationCountBoundFailed(PASS())).toBe(false);
  });
});
