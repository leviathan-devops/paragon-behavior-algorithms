/**
 * aether-store.ts — THE AETHER STORE (S7 — the SPEC-2 §2.8/§9.7)
 *
 * THE VERDICT-PERSISTENCE SURFACE: writes the adjudicated verdicts to the
 * shared.db `aether_verdicts` table (the §10.4 schema) so the Step-X's
 * judgments are COMPACTION-INERT — the audit history survives restarts; the
 * DB is the truth, the report the rendering. THE ONLY component that touches
 * the persistence channel.
 *
 * THE VERIFIED-FLAG TRUTH (§9.7.2 MECHANISM 2): a verdict the silent-verifier
 * REJECTED is stored with verified=0 — the UNVERIFIED remainder persists WITH
 * the verified, never hidden, and THE STORE NEVER writes an unverified verdict
 * as verified (AP-S2-4). When the verifier's COUNT-BOUND failed, the 1:1
 * finding↔verdict bijection is unproven — NO verdict in that set can honestly
 * be called verified, so the whole set stores verified=0.
 *
 * THE S-PB3 BOUNDARY (the operator's doctrine): db.ts is FROZEN this wave —
 * the aether_verdicts DDL application into the shared.db is S-PB4. The store
 * therefore targets an INJECTED handle (the shared-db handle passed in, or a
 * real in-memory bun:sqlite handle in the battery). The DDL below is the §10.4
 * schema VERBATIM, additive-only (CREATE TABLE IF NOT EXISTS), exported so the
 * S-PB4 wiring applies the identical text into db.ts — never a drifted copy.
 *
 * THE SIGNATURE DEVIATION (documented, never silent): the §9.7.3 sketch is
 * persistVerdicts(targetPath, verdicts, verification), but the §10.4 schema's
 * join key is run_id and readVerdicts(runId) rehydrates BY run — a
 * targetPath-keyed write could never be read back by run_id. The store is
 * keyed on run_id end-to-end (the §16 "audit-<ts>" run key) and takes the db
 * handle as the first arg (the injected-handle law above).
 */
import { R_COUNT_MISMATCH } from './silent-verifier.js';
import type { ProbedVerdict, VerifierResult } from './silent-verifier.js';

// ── THE NAMED ERRORS (the loud-fail surface — SPEC-2 §2.16) ──
export const STORE_WRITE_FAILED = 'STORE_WRITE_FAILED';
export const STORE_READ_FAILED = 'STORE_READ_FAILED';

// ── THE aether_verdicts SCHEMA (SPEC-2 §10.4 — VERBATIM. The audit history is
//    compaction-inert: the verdicts persist across runs. Additive-only.) ──
export const AETHER_VERDICTS_DDL = `CREATE TABLE IF NOT EXISTS aether_verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  finding_index INTEGER NOT NULL,
  adjudication TEXT NOT NULL CHECK (adjudication IN ('TRUE_POSITIVE','RED_HERRING','UNCLEAR')),
  deeper_root TEXT NOT NULL,
  concrete_fix TEXT NOT NULL,
  consequence_rank INTEGER NOT NULL CHECK (consequence_rank BETWEEN 1 AND 4),
  verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  CHECK (finding_index >= 0)
);`;

// ── THE STORE HANDLE (the minimal structural surface of the C18.4 shared.db —
//    bun:sqlite's Database satisfies it: exec for the DDL, prepare().run() for
//    the inserts, query().all() for the rehydration. Typed, never any.) ──
export interface AetherStoreDb {
  exec(sql: string): unknown;
  prepare(sql: string): { run(...params: unknown[]): unknown };
  query(sql: string): { all(...params: unknown[]): Array<Record<string, unknown>> };
}

// ── THE STORED ROW (§9.7.3 — the rehydrated verdict, the schema's column
//    names preserved 1:1 so the row IS the table, never a renamed mirror) ──
export interface StoredVerdict {
  id: number;
  run_id: string;
  finding_index: number;
  adjudication: 'TRUE_POSITIVE' | 'RED_HERRING' | 'UNCLEAR';
  deeper_root: string;
  concrete_fix: string;
  consequence_rank: number;
  verified: number;
}

const ADJUDICATIONS = ['TRUE_POSITIVE', 'RED_HERRING', 'UNCLEAR'] as const;

/** THE ADDITIVE SCHEMA APPLICATION — CREATE TABLE IF NOT EXISTS is idempotent;
 *  safe to run on every persist/read (the S-PB4 wave moves this into db.ts's
 *  migration chain; this wave applies it on the injected handle). */
export function ensureAetherVerdictsSchema(db: AetherStoreDb): void {
  db.exec(AETHER_VERDICTS_DDL);
}

/** THE PER-CLAIM UNVERIFIED SET — parses the silent-verifier's failure claims.
 *  THE CONTRACT DEPENDENCY (named, never hidden): the verifier tags every
 *  per-claim failure `finding ${findingIndex} ...` (silent-verifier.ts — the
 *  claimTag). The regex below is the mechanical DETECTOR of that tag (the ISE
 *  law: detection only); the DECISION is the store's verified-flag predicate.
 *  The whole-set failures (the count-bound) carry no finding tag — they are
 *  handled by verificationCountBoundFailed below. */
export function unverifiedFindingIndexes(verification: VerifierResult): Set<number> {
  const out = new Set<number>();
  for (const failure of verification.failures) {
    const match = /^finding (\d+)/.exec(failure.claim);
    if (match) out.add(Number(match[1]));
  }
  return out;
}

/** THE COUNT-BOUND TRUTH — when the verdict count != the finding count, the
 *  1:1 bijection is unproven for EVERY row (a drop or an invention hides
 *  somewhere in the set). The honest flag: the whole set stores verified=0. */
export function verificationCountBoundFailed(verification: VerifierResult): boolean {
  return verification.failures.some((f) => f.reason.startsWith(R_COUNT_MISMATCH));
}

function assertUsableDb(db: AetherStoreDb, op: string): void {
  if (
    !db ||
    typeof db.exec !== 'function' ||
    typeof db.prepare !== 'function' ||
    typeof db.query !== 'function'
  ) {
    throw new Error(`${op} — the store handle is absent or malformed (the shared.db handle must be injected; the aether_verdicts DDL wiring is S-PB4)`);
  }
}

function assertRunId(runId: string, op: string): void {
  if (typeof runId !== 'string' || runId.trim().length === 0) {
    throw new Error(`${op} — the run_id is empty; a verdict row without its run key is un-rehydratable (the compaction-inert law)`);
  }
}

/** THE ROW VALIDATION (the storage-side honesty — the store refuses a malformed
 *  verdict BEFORE any insert, so a bad batch never lands half-written). */
function assertVerdictShape(verdict: ProbedVerdict, position: number): void {
  const tag = `verdict[${position}]`;
  if (!verdict || typeof verdict !== 'object') {
    throw new Error(`${STORE_WRITE_FAILED} — ${tag} is not an object`);
  }
  if (!Number.isInteger(verdict.findingIndex) || verdict.findingIndex < 0) {
    throw new Error(`${STORE_WRITE_FAILED} — ${tag}.finding_index ${String(verdict.findingIndex)} violates CHECK (finding_index >= 0)`);
  }
  if (!ADJUDICATIONS.includes(verdict.adjudication)) {
    throw new Error(`${STORE_WRITE_FAILED} — ${tag}.adjudication ${String(verdict.adjudication)} is outside TRUE_POSITIVE/RED_HERRING/UNCLEAR`);
  }
  if (typeof verdict.deeperRoot !== 'string' || typeof verdict.concreteFix !== 'string') {
    throw new Error(`${STORE_WRITE_FAILED} — ${tag} root/fix must be the verifier-gated prose strings`);
  }
  if (!Number.isInteger(verdict.consequenceRank) || verdict.consequenceRank < 1 || verdict.consequenceRank > 4) {
    throw new Error(`${STORE_WRITE_FAILED} — ${tag}.consequence_rank ${String(verdict.consequenceRank)} violates CHECK (consequence_rank BETWEEN 1 AND 4)`);
  }
}

/** THE VERDICT-ROW WRITE (§9.7.2 MECHANISM 1 — the 1:1 bound persisted).
 *  ERROR PATHS FIRST: a malformed handle/run-id/verdict throws STORE_WRITE_FAILED
 *  BEFORE any row lands; a mid-batch driver failure throws naming the rows
 *  already written (the loud-fail, never a silent partial dressed as full).
 *  RETURNS the rows written (the side effect precedes the claim). */
export async function persistVerdicts(
  db: AetherStoreDb,
  runId: string,
  verdicts: ProbedVerdict[],
  verification: VerifierResult,
): Promise<number> {
  assertUsableDb(db, STORE_WRITE_FAILED);
  assertRunId(runId, STORE_WRITE_FAILED);
  if (!Array.isArray(verdicts)) {
    throw new Error(`${STORE_WRITE_FAILED} — the verdicts are not an array (got ${typeof verdicts})`);
  }
  if (!verification || !Array.isArray(verification.failures)) {
    throw new Error(`${STORE_WRITE_FAILED} — the VerifierResult is absent; the store never guesses the verified flag`);
  }
  verdicts.forEach(assertVerdictShape);

  ensureAetherVerdictsSchema(db);

  const unverified = unverifiedFindingIndexes(verification);
  const countBroken = verificationCountBoundFailed(verification);
  const createdAt = Date.now();

  const insert = db.prepare(
    `INSERT INTO aether_verdicts (run_id, finding_index, adjudication, deeper_root, concrete_fix, consequence_rank, verified, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let written = 0;
  try {
    for (const verdict of verdicts) {
      // THE VERIFIED-FLAG TRUTH: 1 ONLY when the count-bound held AND no failure
      // names this claim. NEVER an unverified verdict stored as verified.
      const verified = !countBroken && !unverified.has(verdict.findingIndex) ? 1 : 0;
      insert.run(
        runId,
        verdict.findingIndex,
        verdict.adjudication,
        verdict.deeperRoot,
        verdict.concreteFix,
        verdict.consequenceRank,
        verified,
        createdAt,
      );
      written += 1;
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[aether-store] ${STORE_WRITE_FAILED}: the insert failed after ${written} row(s) — ${detail}`);
    throw new Error(`${STORE_WRITE_FAILED} — the aether_verdicts insert failed after ${written} row(s): ${detail}`);
  }
  return written;
}

/** THE REHYDRATION (§9.7.2 MECHANISM 3 — the compaction-inert memory). Returns
 *  the prior run's rows ordered by finding_index. ERROR PATHS FIRST: a missing
 *  handle/run-id throws STORE_READ_FAILED; a driver failure logs + throws —
 *  never a silent empty set dressed as "no history". */
export async function readVerdicts(db: AetherStoreDb, runId: string): Promise<StoredVerdict[]> {
  assertUsableDb(db, STORE_READ_FAILED);
  assertRunId(runId, STORE_READ_FAILED);

  ensureAetherVerdictsSchema(db);

  let rows: Array<Record<string, unknown>>;
  try {
    rows = db
      .query(
        `SELECT id, run_id, finding_index, adjudication, deeper_root, concrete_fix, consequence_rank, verified
         FROM aether_verdicts WHERE run_id = ? ORDER BY finding_index ASC, id ASC`,
      )
      .all(runId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[aether-store] ${STORE_READ_FAILED}: the rehydration failed — ${detail}`);
    throw new Error(`${STORE_READ_FAILED} — the aether_verdicts read failed: ${detail}`);
  }

  return rows.map((row) => ({
    id: Number(row.id),
    run_id: String(row.run_id),
    finding_index: Number(row.finding_index),
    adjudication: String(row.adjudication) as StoredVerdict['adjudication'],
    deeper_root: String(row.deeper_root),
    concrete_fix: String(row.concrete_fix),
    consequence_rank: Number(row.consequence_rank),
    verified: Number(row.verified),
  }));
}
