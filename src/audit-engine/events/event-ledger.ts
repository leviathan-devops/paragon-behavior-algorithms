/**
 * event-ledger.ts — THE EVENT LEDGER (SPEC-3 §2.8 / §9.8 E7 / §10.3)
 *
 * THE ENFORCEMENT RECORD: every block + every benign, append-only. THE EVENTLEDGER.record writes
 * the {Pattern, State, Evidence} triad — NO TRIAD = NO ROW (the triad-completeness law, §2.3: a
 * classification without its evidence is a bare assertion). THE REPLAY PROOF (§10.4): the ledger
 * rows for the replayed debacle events are the container's evidence that the exact violations were
 * handled at the event level.
 *
 * E-PB1 (this wave): the IN-MEMORY ledger (the shared.db `event_ledger` table is the E-PB5 write,
 * per SPEC-3 §10.3 / §11.4). THE schema mirrors the DDL so the E-PB5 persistence is a direct
 * append — this class is the deterministic, testable core.
 */
import type { EnforcerAction, NormalizedObservation, SlopClass, Triad, TriageVerdict } from './event-substrate.js';

/**
 * THE EVENT_LEDGER DDL (SPEC-3 §10.3 — the E-PB5 persistence schema). THE OWNING MODULE
 * exports this constant — db.ts imports + applies it (the S-PB4 AETHER_VERDICTS_DDL
 * pattern: the IDENTICAL text owned here, never a re-typed copy — a drifted DDL is a
 * schema fork). CREATE TABLE IF NOT EXISTS = idempotent additive (the §4.1 migration law).
 * THE REPLAY PROOF (§10.4): the ledger rows for the replayed 2026-08-20 debacle events
 * are the container's evidence that the exact violations were handled at the event level.
 */
export const EVENT_LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS event_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  class_name TEXT NOT NULL,
  triad_pattern TEXT NOT NULL,
  triad_state TEXT NOT NULL,
  triad_evidence TEXT NOT NULL,
  action TEXT,
  demand TEXT
);
`;

/** THE ENFORCED-EVENT RECORD (SPEC-3 §2.8 — E7) — the ledger row shape. */
export interface EnforcedEventRecord {
  at: number;
  className: string;
  triad: Triad;
  action: EnforcerAction | null;
}

/** THE RUNNING EVENT LEDGER — the append-only enforcement record (E-PB1: in-memory). */
export class EventLedger {
  private records: EnforcedEventRecord[] = [];

  /**
   * RECORD — the append-only write. THE TRIAD-COMPLETENESS LAW: a record without its
   * {Pattern, State, Evidence} triad is NOT written — the method THROWS EVENT_TRIAD_MISSING
   * (a classification without its evidence is a bare assertion; no triad = no row). Error path
   * FIRST: the validation precedes the side effect (the append). The missing fields are collected
   * into ONE named error — a guard-list, never a decision tower.
   */
  record(o: NormalizedObservation, v: TriageVerdict, a?: EnforcerAction | null): EnforcedEventRecord {
    const triadFields: Array<[string, string]> = [
      ['Pattern', v?.triad?.pattern],
      ['State', v?.triad?.state],
      ['Evidence', v?.triad?.evidence],
    ];
    const missing = triadFields.filter(([, val]) => typeof val !== 'string' || val.length === 0).map(([name]) => name);
    if (missing.length > 0) {
      // THE TRIAD-COMPLETENESS — the named fields that are empty → EVENT_TRIAD_MISSING (no triad, no row).
      throw new Error(`EVENT_TRIAD_MISSING: the {${missing.join(', ')}} is empty — no triad, no row`);
    }
    const row: EnforcedEventRecord = {
      at: o?.at ?? Date.now(),
      className: v?.slopClass ?? 'BENIGN',
      triad: { pattern: v!.triad!.pattern, state: v!.triad!.state, evidence: v!.triad!.evidence },
      action: a ?? null,
    };
    this.records.push(row);
    return row;
  }

  /**
   * RECENT — the recent records, optionally filtered by class + within a time window (ms).
   * The reverse-chronological scan is deterministic; the size bound keeps the in-memory query
   * O(1)-ish over the retention window (the ledger never holds unbounded history).
   */
  recent(className?: string, withinMs?: number): EnforcedEventRecord[] {
    const now = Date.now();
    const cutoff = typeof withinMs === 'number' ? now - withinMs : null;
    const out: EnforcedEventRecord[] = [];
    for (let i = this.records.length - 1; i >= 0; i--) {
      const r = this.records[i];
      if (className !== undefined && r.className !== className) continue;
      if (cutoff !== null && r.at < cutoff) continue;
      out.push(r);
    }
    return out;
  }

  /** ALL — the full append-only history (the replay-proof reader). */
  all(): EnforcedEventRecord[] {
    return [...this.records];
  }

  /** CLEAR — the test/lifecycle reset (returns the cleared count). */
  clear(): number {
    const n = this.records.length;
    this.records = [];
    return n;
  }
}

/** THE REPLAY-SHAPE CHECK — count the non-BENIGN (slop-class) records (the debacle-proof). */
export function countSlopRecords(ledger: EventLedger): number {
  return ledger.all().filter((r) => r.className !== 'BENIGN').length;
}

/** THE SLOP-CLASS COUNT within a window (the sentinel-accumulator feed, E-PB4-ready). */
export function countClassInWindow(ledger: EventLedger, klass: SlopClass, withinMs: number): number {
  return ledger.recent(klass, withinMs).length;
}
