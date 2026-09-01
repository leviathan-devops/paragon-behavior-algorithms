// src/subagents/trident-auditor/shared/shared-db-client.ts
// THE SHARED.DB READER/WRITER (W9, D16, spec §2.3:276, §4.12:2217).
//
// THE ONLY BRIDGE TO THE BUG HUNTER (D16 — "shared db between the 2...
// intentionally separated so we dont pollute architecture"). The auditor's
// entire view of the bug hunter is THIS client: it reads the report_sections +
// findings (the SPECIFY source), the implementations (the EXTRACT source), the
// graph_nodes (the fix-scope's current-graph resolution), and the events (the
// BUILD_DONE pickup); it writes the conformance_verdicts + the AUDIT_DONE
// event. NO other import from the trident-bug-hunter package (the ONLY
// cross-package TYPE import in the whole auditor is the fix-scope's MPSE shape).
//
// THE LAYERING: this client is a THIN FACADE over W1's DbClient (db.ts) — it
// calls THROUGH `openStore` / `appendConformanceVerdict` / `appendEvent`,
// never around them, never a new driver (the zero-add rule). The store's
// fail-closed named errors (verdictInvalid, eventInvalid, ...) guard every
// write: an invalid verdict/kind/status is REJECTED by the store, never
// silently accepted.

import * as path from 'node:path';
import type { DbClient, ConformanceVerdictInput, EventKind, GraphNode, ImplementationInput } from '../../../shared/knowledge-graph/db.ts';
import { openStore } from '../../../shared/knowledge-graph/db.ts';
export type { ImplementationInput } from '../../../shared/knowledge-graph/db.ts';

// ---------------------------------------------------------------------------
// THE ROW SHAPES the client reads (the table columns transcribed — the SQL
// source of truth is db.ts's CREATE_TABLES_SQL, spec §4.1:1631-1741).
// ---------------------------------------------------------------------------

/** A report_sections row — the per-finding 6-part contract (§4.7:2077). The
 *  what_to_do column carries the declared fix files list (the fix-scope source). */
export interface ReportSectionRow {
  finding_id: string;
  how_broken: string;
  why_broken: string;
  what_violates: string;
  how_to_fix: string;
  what_to_do: string;
  why_works: string;
  run_id: string;
}

/** A findings row — the MPSE-triplet records (the verdicts for the run). */
export interface FindingRow {
  rule_id: string;
  severity: string;
  file: string | null;
  line: number | null;
  evidence: string;
  verdict: string;
  run_id: string;
}

/** An implementations row — the build agent's ledger (the auditor's EXTRACT
 *  source). The before/after sha pair is the mechanical truth; the claim is
 *  the prose the auditor never trusts (R10.3). */
export interface ImplementationRow {
  file: string;
  before_sha: string;
  after_sha: string;
  claim: string;
  status: string;
  run_id: string;
}

/** An events row — the HUNT_DONE/BUILD_DONE/AUDIT_DONE bus. */
export interface EventRow {
  kind: string;
  payload: string;
  id: number;
}

// ---------------------------------------------------------------------------
// THE CLIENT — the auditor's shared-DB surface
// ---------------------------------------------------------------------------

export interface SharedDbClient {
  readonly db: DbClient;
  readonly dbPath: string;

  // THE READS (the SPECIFY/EXTRACT/fix-scope sources)
  reportSections(runId: string): ReportSectionRow[];
  findings(runId: string): FindingRow[];
  implementations(runId: string): ImplementationRow[];
  graphNodes(): GraphNode[];
  events(): EventRow[];

  // THE WRITES — THROUGH W1 (the store's named-error validation guards every
  // write; an invalid verdict/kind/status is rejected, never silently accepted)
  appendConformanceVerdict(row: ConformanceVerdictInput, runId: string): void;
  appendImplementation(row: ImplementationInput, runId: string): void;
  appendEvent(kind: EventKind, payload: Record<string, unknown>): void;

  close(): void;
}

/** Open the shared.db at dbPath (W1's openStore — the WAL + the C18.4 schema +
 *  the fail-closed named errors) and wrap it in the auditor's read/write client. */
export function openSharedDb(dbPath: string): SharedDbClient {
  const db: DbClient = openStore(dbPath);
  return {
    db,
    dbPath,
    reportSections(runId: string): ReportSectionRow[] {
      return rowsAs<ReportSectionRow>(
        db.prepare(
          'SELECT finding_id, how_broken, why_broken, what_violates, how_to_fix, what_to_do, why_works, run_id FROM report_sections WHERE run_id = ?',
        ).all(runId),
        'reportSections',
      );
    },
    findings(runId: string): FindingRow[] {
      return rowsAs<FindingRow>(
        db.prepare(
          'SELECT rule_id, severity, file, line, evidence, verdict, run_id FROM findings WHERE run_id = ?',
        ).all(runId),
        'findings',
      );
    },
    implementations(runId: string): ImplementationRow[] {
      return rowsAs<ImplementationRow>(
        db.prepare(
          'SELECT file, before_sha, after_sha, claim, status, run_id FROM implementations WHERE run_id = ?',
        ).all(runId),
        'implementations',
      );
    },
    graphNodes(): GraphNode[] {
      return rowsAs<GraphNode>(db.prepare('SELECT id, kind, name, file, line, lineage, source, data FROM graph_nodes').all(), 'graphNodes');
    },
    events(): EventRow[] {
      return rowsAs<EventRow>(db.prepare('SELECT kind, payload, id FROM events').all(), 'events');
    },
    appendConformanceVerdict(row: ConformanceVerdictInput, runId: string): void {
      db.appendConformanceVerdict(row, runId);   // THROUGH W1 — verdictInvalid on a bad verdict
    },
    appendImplementation(row: ImplementationInput, runId: string): void {
      db.appendImplementation(row, runId);       // THROUGH W1 — implementationInvalid on a bad status
    },
    appendEvent(kind: EventKind, payload: Record<string, unknown>): void {
      db.appendEvent(kind, payload);             // THROUGH W1 — eventInvalid on a bad kind
    },
    close(): void {
      db.close();
    },
  };
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a better-sqlite3 `.all()` result (an
 *  unknown array) is Array.isArray-checked before the typed row assertion: the
 *  type certainty is earned by the runtime check, never a bare cast on an
 *  unvalidated row set. A non-array result is the named loud error. */
function rowsAs<T>(rows: unknown, label: string): T[] {
  if (Array.isArray(rows)) {
    return rows as T[];
  }
  throw new Error(`[shared-db-client] ${label} expected an array of rows, got ${typeof rows}`);
}

/** The store path for a project — <project>/.trident/knowledge-graph/shared.db
 *  (the machine's ONE durable truth, spec §1.3:119). */
export function sharedDbPath(projectRoot: string): string {
  return path.join(projectRoot, '.trident', 'knowledge-graph', 'shared.db');
}

/** Open the shared client for a project root (the convenience facade). */
export function openProjectSharedDb(projectRoot: string): SharedDbClient {
  return openSharedDb(sharedDbPath(projectRoot));
}
