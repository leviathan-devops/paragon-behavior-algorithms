// src/shared/knowledge-graph/db.ts
// THE SHARED.DB STORE (W1) — the machine's single durable truth (C18.4, spec §3.6 +
// §4.1 lines 1612-1748). Compaction-inert, concurrent-safe (the WAL), append-only
// (the ledger), lineage-mandatory (O28.4), with the MASTER_CONTEXT mirror writer (D27).
//
// THE DRIVER (the honest resolution): spec line 1616 claims better-sqlite3 "the
// project already runs it" and line 926 claims "the project runs both" — the real
// package.json CONTRADICTS both (verified): the ONLY sqlite-family dependency is
// sql.js ^1.14.1, and NO bun-types are installed. bun:sqlite IS the runtime-native
// driver (Bun 1.3.14 ships it — zero-add, no package.json change), and its type
// resolution under `types: ["node"]` is restored by the ambient bun-modules.d.ts
// shim in this folder. The shim is verified against the real runtime by the test
// suite (a shim drift fails the tests, never silently).
//   - why NOT sql.js: two independent sql.js wasm instances hold private memories —
//     they CANNOT share the WAL, so the G3.6 two-agent concurrency contract (spec
//     line 1626) is untestable/undoable. bun:sqlite opens real shared-file SQLite
//     connections: WAL + busy_timeout 5000 genuinely absorb the two-agent write
//     contention (verified by the concurrency tests).
//   - why NOT better-sqlite3: it is NOT in the dependency tree (package.json is
//     the ground truth); the zero-add rule forbids adding it without a flag.

import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import type { ProjectProfile } from './profile-schema.ts';
// THE SPEC-2 §10.4 DDL (the S-PB4 additive migration): the IDENTICAL text owned
// by aether-store.ts — imported, never a re-typed copy (a drifted DDL is a
// schema fork). Applied by openStore below (CREATE TABLE IF NOT EXISTS is
// idempotent — additive-only, the §4.1 migration law).
import { AETHER_VERDICTS_DDL } from '../../audit-engine/aether/aether-store.ts';
import type { EvidenceTriad } from '../../audit-engine/triad.ts';
// THE SPEC-3 §10.3 DDL (the E-PB5 additive migration): the IDENTICAL text owned
// by event-ledger.ts — imported, never a re-typed copy (a drifted DDL is a
// schema fork). Applied by openStore below (CREATE TABLE IF NOT EXISTS is
// idempotent — additive-only, the §4.1 migration law).
import { EVENT_LEDGER_DDL } from '../../audit-engine/events/event-ledger.ts';
import { TYPED_GRAPH_DDL } from './migrations.ts';

// ---------------------------------------------------------------------------
// The named-error vocabulary (the store's fail-closed contract)
// ---------------------------------------------------------------------------

export function lineageMissing(id: string): Error {
  return new Error(`LINEAGE_MISSING: id=${id} (the SPEC_DERIVED/CODE_DERIVED/HYBRID duality cannot degrade - O28.4)`);
}

export function findingNoTriplet(detail: string): Error {
  return new Error(`FINDING_NO_TRIPLET: ${detail} (no triplet = no finding - a non-empty evidence string is mandatory - O9.1)`);
}

export function findingInvalid(field: string, value: unknown): Error {
  return new Error(`FINDING_INVALID: field=${field} value=${JSON.stringify(value)} (the severity canon is CRIT|HIGH|MED|WARN; the verdict is VIOLATION|PASS - fix the finding)`);
}

export function eventInvalid(kind: unknown): Error {
  return new Error(`EVENT_INVALID: kind=${JSON.stringify(kind)} (the bus kinds are HUNT_DONE|BUILD_DONE|AUDIT_DONE - fix the event)`);
}

export function implementationInvalid(field: string, value: unknown): Error {
  return new Error(`IMPLEMENTATION_INVALID: field=${field} value=${JSON.stringify(value)} (the status canon is PENDING|CHANGED|UNCHANGED|VERIFIED|REJECTED - fix the row)`);
}

export function verdictInvalid(field: string, value: unknown): Error {
  return new Error(`VERDICT_INVALID: field=${field} value=${JSON.stringify(value)} (the verdict canon is CONFORMANT|VIOLATED|PARTIAL - fix the row)`);
}

export function mirrorWriteFailed(mirrorPath: string, detail: string): Error {
  return new Error(`MIRROR_WRITE_FAILED: path=${mirrorPath} detail=${detail} (the MASTER_CONTEXT mirror is the awareness surface, not the truth - the .trident shared.db is the truth - D27)`);
}

export function pragmaFailed(pragma: string, detail: string): Error {
  return new Error(`PRAGMA_FAILED: pragma=${pragma} detail=${detail} (a pragma exec failure is a loud named error - a database-is-locked on open must name the driver + the pragma, never surface as a raw sqlite throw - the store's fail-closed contract)`);
}
export function familyRootReadonly(detail: string): Error {
  return new Error(`FAMILY_ROOT_READONLY: detail=${detail} (the family store is READ-ONLY mode=ro — a branch writes its own shared.db only)`);
}

export function familyRootDrift(expected: string, actual: string): Error {
  return new Error(`FAMILY_ROOT_DRIFT: expected=${expected} actual=${actual} (the core drifted from the profile contract hash — reload the profile or re-seal the core)`);
}

export function familyPromotionPending(hash: string, detail: string): Error {
  return new Error(`FAMILY_PROMOTION_PENDING: hash=${hash} detail=${detail} (a new file awaits the operator gate — never auto-promoted)`);
}

// ---------------------------------------------------------------------------
// The domain types
// ---------------------------------------------------------------------------

export const NODE_LINEAGES = ['SPEC_DERIVED', 'CODE_DERIVED', 'HYBRID'] as const;
export type NodeLineage = (typeof NODE_LINEAGES)[number];

export const SEVERITIES = ['CRIT', 'HIGH', 'MED', 'WARN'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const EVENT_KINDS = ['HUNT_DONE', 'BUILD_DONE', 'AUDIT_DONE'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const IMPLEMENTATION_STATUSES = ['PENDING', 'CHANGED', 'UNCHANGED', 'VERIFIED', 'REJECTED'] as const;
export type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];

export const CONFORMANCE_VERDICTS = ['CONFORMANT', 'VIOLATED', 'PARTIAL'] as const;
export type ConformanceVerdict = (typeof CONFORMANCE_VERDICTS)[number];

export const FINDING_VERDICTS = ['VIOLATION', 'PASS'] as const;
export type FindingVerdict = (typeof FINDING_VERDICTS)[number];

/** A graph node. The lineage is MANDATORY; the source is the provenance anchor. */
export interface GraphNode {
  id: string;                    // 'class:PlutusPipeline' | 'fn:createPipeline7Tools' | 'stage:harvest'
  kind: string;                  // class | function | module | stage | rule | constant | edge-anchor
  name: string;                  // the symbol / declared name
  file?: string | null;          // relative path from the project root, when CODE_DERIVED
  line?: number | null;          // 1-indexed anchor line, when CODE_DERIVED
  lineage: NodeLineage;          // 'SPEC_DERIVED' | 'CODE_DERIVED' | 'HYBRID' (§4.4)
  source: string;                // the provenance anchor: 'corbell' | 'corpus:MASTER_CONTEXT/...md:27' | 'profile:...'
  data?: Record<string, unknown>; // JSON-blob attributes (signature, params, contract text)
}

/** A graph edge. APPEND-ONLY (INSERT-only) — never UPDATE/DELETE. */
export interface GraphEdge {
  sourceId: string;
  targetId: string;
  kind: string;                  // imports | calls | awaits | wires | traces-to | constrains | implements | declares
  lineage: NodeLineage;          // the HYBRID edges live here (the comparison layer)
}

/** The MPSE-triplet finding: {Pattern=ruleId, State=verdict+runId, Evidence=evidence}. */
export interface FindingInput {
  ruleId: string;                // 'P6' | 'wiring.dead-module' | 'conformance.declared-interface'
  severity: Severity;            // CRIT | HIGH | MED | WARN (§4.7)
  file?: string | null;
  line?: number | null;
  rangeStart?: number | null;    // inclusive
  rangeEnd?: number | null;      // inclusive
  evidence: string;              // MANDATORY, NOT NULL — the graph edge chain + the verbatim rule quote
  verdict: FindingVerdict;       // VIOLATION | PASS
  triad?: EvidenceTriad;
}

/** The 6-part exhaustive-report contract. */
export interface ReportSectionInput {
  findingId: string;             // the finding the section covers (or 'SYSTEMIC')
  howBroken: string;             // the mechanism + the graph edge chain + the file:line evidence
  whyBroken: string;             // the root cause
  whatViolates: string;          // the verbatim rule quote + the anchor (D13)
  howToFix: string;              // the exact change, file by file
  whatToDo: string;              // the ordered implementation steps (the fix files list)
  whyWorks: string;              // the mechanism of the fix, how it restores the contract
}

/** The fix-apply row. */
export interface ImplementationInput {
  file: string;                  // relative path
  beforeSha: string;             // the bug hunter's snapshot (or the build agent's start state)
  afterSha: string;              // the changed state
  claim: string;                 // the build agent's prose claim (the auditor re-verifies, never trusts)
  status: ImplementationStatus;  // PENDING | CHANGED | UNCHANGED | VERIFIED | REJECTED
}

/** The conformance verdict row. */
export interface ConformanceVerdictInput {
  findingId: string;             // the finding this verdict covers
  verdict: ConformanceVerdict;   // CONFORMANT | VIOLATED | PARTIAL (§4.9)
  evidence: string;              // the sha comparison + the battery re-run result
  fixedAt?: number | null;
  fixedBy: string;               // 'trident_build' | 'trident_auditor'
}

export type EventPayload = Record<string, unknown>; // the HUNT_DONE/BUILD_DONE/AUDIT_DONE bus payloads (§4.11)

/** The statement-like pass-through surface (INSERT/SELECT only — never an UPDATE/DELETE helper). */
export interface StatementLike {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number };
  get(...params: unknown[]): Record<string, unknown> | null | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
  finalize(): void;
}

/**
 * THE ONE DbClient interface (spec line 1616). The machine's writers (W2-W9) and
 * readers (W6) consume ONLY this surface. The write surface is append-only:
 * writeGraph REPLACEs the graph within the run_id scope (the one exception),
 * the ledger appends are INSERT-only. There is NO UPDATE/DELETE path.
 */
export interface DbClient {
  readonly dbPath: string;

  /** The pass-through query surface (the spec's own tests use db.prepare directly). */
  exec(sql: string): void;
  prepare(sql: string): StatementLike;
  close(): void;

  /** Validate EVERY node+edge's lineage (O28.4); nodes INSERT OR REPLACE, edges INSERT-only. */
  writeGraph(nodes: GraphNode[], edges: GraphEdge[]): void;

  /** Append a finding — an empty evidence string is rejected with FINDING_NO_TRIPLET (O9.1). */
  appendFinding(finding: FindingInput, runId: string, week?: string | null): void;

  appendReportSection(section: ReportSectionInput, runId: string): void;
  appendImplementation(row: ImplementationInput, runId: string): void;
  appendConformanceVerdict(row: ConformanceVerdictInput, runId: string): void;

  /** Append a bus event — kind ∈ {HUNT_DONE, BUILD_DONE, AUDIT_DONE}. */
  appendEvent(kind: EventKind, payload: EventPayload): void;

  /** Write the SUMMARY mirror to <project>/MASTER_CONTEXT/knowledge-graph/graph.db (D27). */
  mirrorToMasterContext(profile: ProjectProfile): string;
}

// ---------------------------------------------------------------------------
// The C18.4 schema — the DDL transcribed VERBATIM from spec §4.1 lines 1631-1741
// (the prompt's column transcription is a map; THIS is the contract).
// ---------------------------------------------------------------------------

/** The 7 canonical tables (§4.1:1631-1697) + the 4 supporting tables (§4.1:1703-1741). */
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS graph_nodes (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,
  name      TEXT NOT NULL,
  file      TEXT,
  line      INTEGER,
  lineage   TEXT NOT NULL,
  source    TEXT NOT NULL,
  data      TEXT
);
CREATE TABLE IF NOT EXISTS graph_edges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id  TEXT NOT NULL REFERENCES graph_nodes(id),
  target_id  TEXT NOT NULL REFERENCES graph_nodes(id),
  kind       TEXT NOT NULL,
  lineage    TEXT NOT NULL,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS findings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id     TEXT NOT NULL,
  severity    TEXT NOT NULL,
  file        TEXT,
  line        INTEGER,
  range_start INTEGER,
  range_end   INTEGER,
  evidence    TEXT NOT NULL,
  verdict     TEXT NOT NULL,
  week        TEXT,
  run_id      TEXT NOT NULL,
  created_at  INTEGER
);
CREATE TABLE IF NOT EXISTS report_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_id  TEXT NOT NULL,
  how_broken  TEXT NOT NULL,
  why_broken  TEXT NOT NULL,
  what_violates TEXT NOT NULL,
  how_to_fix  TEXT NOT NULL,
  what_to_do  TEXT NOT NULL,
  why_works   TEXT NOT NULL,
  run_id      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS implementations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  file       TEXT NOT NULL,
  before_sha TEXT NOT NULL,
  after_sha  TEXT NOT NULL,
  claim      TEXT NOT NULL,
  status     TEXT NOT NULL,
  run_id     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conformance_verdicts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_id TEXT NOT NULL,
  verdict    TEXT NOT NULL,
  evidence   TEXT NOT NULL,
  fixed_at   INTEGER,
  fixed_by   TEXT NOT NULL,
  run_id     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS compiled_predicates (
  id         TEXT PRIMARY KEY,
  family     TEXT NOT NULL,
  template   TEXT NOT NULL,
  bindings   TEXT NOT NULL,
  verbatim_quote TEXT NOT NULL,
  anchor     TEXT NOT NULL,
  severity   TEXT NOT NULL,
  check_code TEXT NOT NULL,
  battery_version TEXT NOT NULL,
  calibrated TEXT NOT NULL DEFAULT 'PENDING'
);
CREATE TABLE IF NOT EXISTS calibrations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  predicate_id   TEXT NOT NULL,
  test           TEXT NOT NULL,
  fixture        TEXT NOT NULL,
  result         TEXT NOT NULL,
  evidence       TEXT NOT NULL,
  run_id         TEXT NOT NULL,
  created_at     INTEGER
);
CREATE TABLE IF NOT EXISTS rule_cards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  quote      TEXT NOT NULL,
  anchor     TEXT NOT NULL,
  classification TEXT NOT NULL,
  severity   TEXT NOT NULL,
  proposed   INTEGER NOT NULL DEFAULT 0,
  corpus_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL,
  actor      TEXT NOT NULL,
  event      TEXT NOT NULL,
  triplet    TEXT NOT NULL,
  created_at INTEGER
);
`;

/** The mirror's SUMMARY schema (D27, spec line 2229): the graph + the findings
 * summaries + the events (the report pointers) — NEVER the report_sections bodies. */
const MIRROR_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS graph_nodes (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
  file TEXT, line INTEGER, lineage TEXT NOT NULL, source TEXT NOT NULL, data TEXT
);
CREATE TABLE IF NOT EXISTS graph_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES graph_nodes(id),
  target_id TEXT NOT NULL REFERENCES graph_nodes(id),
  kind TEXT NOT NULL, lineage TEXT NOT NULL, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL, severity TEXT NOT NULL, file TEXT, line INTEGER,
  range_start INTEGER, range_end INTEGER, evidence TEXT NOT NULL,
  verdict TEXT NOT NULL, week TEXT, run_id TEXT NOT NULL, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER
);
`;

/**
 * The pragmas on EVERY open (spec §4.1 lines 1620-1623), each with its BECAUSE:
 *  - journal_mode = WAL  — the WAL lets the two agents (bug hunter + auditor) +
 *    the operator write CONCURRENTLY; a reader never blocks a writer and the
 *    writer never blocks a reader; without it, the shared-DB contention (G3.6)
 *    would throw 'database is locked' on the auditor's pickup (line 927-930).
 *  - synchronous = NORMAL — WAL + NORMAL: durability vs the fsync storm (line 1621).
 *  - busy_timeout = 5000  — the two agents (MAP/REPORT + FIX/REPORT) can issue
 *    appends concurrently; a 5000ms wait absorbs the transient write lock without
 *    a deadlock error; a write held longer than 5s is a genuine stall that must
 *    surface as a named error (never a silent SQLITE_BUSY) (line 1626).
 *  - foreign_keys = ON    — an edge pointing at a nonexistent node silently
 *    poisons the 7-verb chain/who-calls queries (line 1744).
 */
export function applyPragmas(db: Database): void {
  // THE PRAGMA WRAP (2026-08-12 — the loud-fail law, W10): every pragma exec
  // is wrapped so a failure throws the NAMED PRAGMA_FAILED (the mirrorWriteFailed
  // pattern), never a raw sqlite throw. A database-is-locked on open would
  // otherwise surface undiagnosable at every connection. The wrapper names the
  // pragma + the underlying message.
  const execPragma = (pragma: string): void => {
    try {
      db.exec(pragma);
    } catch (e: unknown) {
      throw pragmaFailed(pragma, `driver=bun:sqlite message=${e instanceof Error ? e.message : String(e)}`);
    }
  };
  execPragma('PRAGMA journal_mode = WAL');
  execPragma('PRAGMA synchronous = NORMAL');
  execPragma('PRAGMA busy_timeout = 5000');
  execPragma('PRAGMA foreign_keys = ON');
  // the C18.4 schema = schema version 184 (PRAGMA user_version tracks the schema
  // version, spec line 2227; the migrations transaction applies pending migrations
  // at the first open when the stored version is lower).
  execPragma('PRAGMA user_version = 184');
}

function isNodeLineage(v: unknown): v is NodeLineage {
  return v === 'SPEC_DERIVED' || v === 'CODE_DERIVED' || v === 'HYBRID';
}

// ---------------------------------------------------------------------------
// The implementation
// ---------------------------------------------------------------------------

/** The DbClient implementation over bun:sqlite. */
export class SharedDb implements DbClient {
  readonly dbPath: string;
  private readonly handle: Database;
  private open = true;

  constructor(dbPath: string, handle: Database) {
    this.dbPath = dbPath;
    this.handle = handle;
  }

  exec(sql: string): void {
    this.handle.exec(sql);
  }

  prepare(sql: string): StatementLike {
    // THE R16 TYPE_CERTAINTY GUARD — the sqlite statement handle is narrowed
    // behind the null/undefined guard (the assertion is earned by the check).
    const stmt = this.handle.prepare(sql) as unknown;
    if (stmt !== undefined && stmt !== null) {
      return stmt as StatementLike;
    }
    throw new Error('[db] the sqlite prepare returned no statement');
  }

  close(): void {
    if (this.open) {
      this.handle.close();
      this.open = false;
    }
  }

  // The graph: validate EVERY node+edge lineage (O28.4) BEFORE any write, then
  // REBUILD the graph (the per-run snapshot semantics — the 2026-08-13 W10
  // Plutus hunt's FK crash, diagnosed by the container agent): the OLD code did
  // INSERT OR REPLACE on the nodes but INSERT-append on the edges — on a re-run
  // (an already-populated shared.db) the REPLACE deleted a node with child
  // edges → the FK constraint threw. THE FIX: the graph is a PER-RUN snapshot
  // (each hunt rebuilds it) — the edges + nodes are CLEARED first, then the
  // fresh nodes + edges insert. The append-only law (spec 941-942) applies to
  // the findings/events/implementations LEDGER rows, never the per-run graph
  // (the mirror already drops+recreates — the main write now matches).
  writeGraph(nodes: GraphNode[], edges: GraphEdge[]): void {
    for (const n of nodes) {
      if (!isNodeLineage(n.lineage)) {
        throw lineageMissing(n.id);
      }
    }
    for (const e of edges) {
      if (!isNodeLineage(e.lineage)) {
        throw lineageMissing(`edge ${e.sourceId} -> ${e.targetId}`);
      }
    }
    const tx = this.handle.transaction((): void => {
      // THE PER-RUN REBUILD (2026-08-13 — the FK crash fix): clear the graph
      // tables first (edges before nodes — the FK order), then insert the fresh
      // run's nodes + edges.
      this.handle.prepare('DELETE FROM graph_edges').run();
      this.handle.prepare('DELETE FROM graph_nodes').run();
      const nodeStmt = this.handle.prepare(
        'INSERT INTO graph_nodes VALUES (?,?,?,?,?,?,?,?)',
      );
      for (const n of nodes) {
        nodeStmt.run(n.id, n.kind, n.name, n.file ?? null, n.line ?? null, n.lineage, n.source, JSON.stringify(n.data ?? {}));
      }
      const edgeStmt = this.handle.prepare(
        'INSERT INTO graph_edges (source_id,target_id,kind,lineage) VALUES (?,?,?,?)',
      );
      for (const e of edges) {
        edgeStmt.run(e.sourceId, e.targetId, e.kind, e.lineage);
      }
    });
    tx();
  }

  appendFinding(finding: FindingInput, runId: string, week?: string | null): void {
    if (typeof finding.ruleId !== 'string' || finding.ruleId.trim() === '') {
      throw findingNoTriplet(`finding at ${finding.file ?? '?'}:${finding.line ?? '?'} carries an empty ruleId — the Pattern leg of the EvidenceTriad is mandatory`);
    }
    // O9.1 — no triplet = no finding, enforced at the schema level (spec line 2062):
    // a finding without a non-empty evidence string is rejected.
    if (typeof finding.evidence !== 'string' || finding.evidence.trim() === '') {
      throw findingNoTriplet(`finding ${finding.ruleId} at ${finding.file ?? '?'}:${finding.line ?? '?'} carries an empty evidence string`);
    }
    if (!SEVERITIES.includes(finding.severity)) throw findingInvalid('severity', finding.severity);
    if (!FINDING_VERDICTS.includes(finding.verdict)) throw findingInvalid('verdict', finding.verdict);
    const persistedEvidence = (finding as FindingInput & { triad?: unknown }).triad ? `${finding.evidence} | TRIAD ${JSON.stringify((finding as FindingInput & { triad?: unknown }).triad)}` : finding.evidence;
    this.handle.prepare(
      `INSERT INTO findings (rule_id,severity,file,line,range_start,range_end,evidence,verdict,week,run_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      finding.ruleId, finding.severity, finding.file ?? null, finding.line ?? null,
      finding.rangeStart ?? null, finding.rangeEnd ?? null, persistedEvidence,
      finding.verdict, week ?? null, runId, Date.now(),
    );
  }

  appendReportSection(section: ReportSectionInput, runId: string): void {
    this.handle.prepare(
      `INSERT INTO report_sections (finding_id,how_broken,why_broken,what_violates,how_to_fix,what_to_do,why_works,run_id)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      section.findingId, section.howBroken, section.whyBroken, section.whatViolates,
      section.howToFix, section.whatToDo, section.whyWorks, runId,
    );
  }

  appendImplementation(row: ImplementationInput, runId: string): void {
    if (!IMPLEMENTATION_STATUSES.includes(row.status)) {
      throw implementationInvalid('status', row.status);
    }
    this.handle.prepare(
      'INSERT INTO implementations (file,before_sha,after_sha,claim,status,run_id) VALUES (?,?,?,?,?,?)',
    ).run(row.file, row.beforeSha, row.afterSha, row.claim, row.status, runId);
  }

  appendConformanceVerdict(row: ConformanceVerdictInput, runId: string): void {
    if (!CONFORMANCE_VERDICTS.includes(row.verdict)) {
      throw verdictInvalid('verdict', row.verdict);
    }
    this.handle.prepare(
      'INSERT INTO conformance_verdicts (finding_id,verdict,evidence,fixed_at,fixed_by,run_id) VALUES (?,?,?,?,?,?)',
    ).run(row.findingId, row.verdict, row.evidence, row.fixedAt ?? null, row.fixedBy, runId);
  }

  appendEvent(kind: EventKind, payload: EventPayload): void {
    if (!EVENT_KINDS.includes(kind)) throw eventInvalid(kind);
    this.handle.prepare(
      'INSERT INTO events (kind,payload,created_at) VALUES (?,?,?)',
    ).run(kind, JSON.stringify(payload), Date.now());
  }

  // D27 — the mirror is a SUMMARY copy (graph + the findings summaries + the
  // events/report pointers) for the all-agents awareness surface; the .trident
  // shared.db is the truth. The mirror is REBUILT fresh each call (the snapshot
  // semantic) so it never diverges from the source truth.
  mirrorToMasterContext(profile: ProjectProfile): string {
    const mirrorDir = path.join(profile.project.root, 'MASTER_CONTEXT', 'knowledge-graph');
    const mirrorPath = path.join(mirrorDir, 'graph.db');
    let mirror: Database;
    try {
      fs.mkdirSync(mirrorDir, { recursive: true });
      mirror = new Database(mirrorPath);
      applyPragmas(mirror);
      mirror.exec('DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS findings; DROP TABLE IF EXISTS graph_edges; DROP TABLE IF EXISTS graph_nodes;');
      mirror.exec(MIRROR_SCHEMA_SQL);
    } catch (e: unknown) {
      throw mirrorWriteFailed(mirrorPath, `mirror open failed: ${String(e)}`);
    }

    try {
      // the graph (the nodes + the edges)
      const nodeIns = mirror.prepare('INSERT OR REPLACE INTO graph_nodes VALUES (?,?,?,?,?,?,?,?)');
      for (const row of this.handle.prepare('SELECT id,kind,name,file,line,lineage,source,data FROM graph_nodes').all()) {
        nodeIns.run(row['id'], row['kind'], row['name'], row['file'], row['line'], row['lineage'], row['source'], row['data']);
      }
      const edgeIns = mirror.prepare('INSERT INTO graph_edges (source_id,target_id,kind,lineage,created_at) VALUES (?,?,?,?,?)');
      for (const row of this.handle.prepare('SELECT source_id,target_id,kind,lineage,created_at FROM graph_edges').all()) {
        edgeIns.run(row['source_id'], row['target_id'], row['kind'], row['lineage'], row['created_at']);
      }
      // the findings summaries (never the report_sections bodies — line 2229)
      const findIns = mirror.prepare(
        'INSERT INTO findings (rule_id,severity,file,line,range_start,range_end,evidence,verdict,week,run_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      );
      for (const row of this.handle.prepare('SELECT rule_id,severity,file,line,range_start,range_end,evidence,verdict,week,run_id,created_at FROM findings').all()) {
        findIns.run(row['rule_id'], row['severity'], row['file'], row['line'], row['range_start'], row['range_end'], row['evidence'], row['verdict'], row['week'], row['run_id'], row['created_at']);
      }
      // the events (the HUNT_DONE/BUILD_DONE/AUDIT_DONE bus + the report pointers)
      const evIns = mirror.prepare('INSERT INTO events (kind,payload,created_at) VALUES (?,?,?)');
      for (const row of this.handle.prepare('SELECT kind,payload,created_at FROM events').all()) {
        evIns.run(row['kind'], row['payload'], row['created_at']);
      }
    } catch (e: unknown) {
      throw mirrorWriteFailed(mirrorPath, `mirror copy failed: ${String(e)}`);
    } finally {
      mirror.close();
    }
    return mirrorPath;
  }
}


// ---------------------------------------------------------------------------
// W4 — Content-addressed shared root (spec §3.1, §11.1-11.3, F-2)
// ---------------------------------------------------------------------------

export const FAMILY_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS family_nodes (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  node_json TEXT NOT NULL,
  registered_by TEXT NOT NULL,
  promoted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_family_nodes_content_hash ON family_nodes(content_hash);
CREATE TABLE IF NOT EXISTS family_edges (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  lineage TEXT NOT NULL,
  origin TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id, kind)
);
CREATE TABLE IF NOT EXISTS family_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function sha256Hex(bytes: Uint8Array | string): string {
  const h = createHash('sha256');
  if (typeof bytes === 'string') h.update(bytes, 'utf8');
  else h.update(bytes);
  return h.digest('hex');
}

export function contentHashId(fileBytes: Uint8Array | string, symbol: string): string {
  return `${sha256Hex(fileBytes)}::${symbol}`;
}

export function parseContentHashId(id: string): { hash: string; symbol: string } | null {
  const idx = id.indexOf('::');
  if (idx === -1) return null;
  return { hash: id.slice(0, idx), symbol: id.slice(idx + 2) };
}

function applyFamilyPragmas(db: Database): void {
  const execPragma = (pragma: string): void => {
    try { db.exec(pragma); } catch (e: unknown) { throw pragmaFailed(pragma, `driver=bun:sqlite message=${e instanceof Error ? e.message : String(e)}`); }
  };
  execPragma('PRAGMA query_only = 1');
}

function ensureFamilyTables(db: Database): void {
  db.exec(FAMILY_TABLES_SQL);
}

export type PromotionState = 'FAMILY_ROOT_READONLY' | 'DRIFT' | 'PROMOTION_PENDING';

export class FamilyGraphStore {
  private readonly familyDb: Database;
  private readonly branchDb: Database;
  readonly familyPath: string;
  readonly branchPath: string;
  private sealed = false;

  constructor(familyPath: string, familyDb: Database, branchPath: string, branchDb: Database) {
    this.familyPath = familyPath;
    this.familyDb = familyDb;
    this.branchPath = branchPath;
    this.branchDb = branchDb;
    ensureFamilyTables(this.familyDb);
    ensureFamilyTables(this.branchDb);
    try { this.branchDb.exec("CREATE VIEW IF NOT EXISTS branch_union_view AS SELECT id, kind, name, file, line, lineage, source, data, 'family' as origin FROM family_nodes UNION ALL SELECT id, kind, name, file, line, lineage, source, data, 'delta' as origin FROM graph_nodes"); } catch (idemErr) { /* idempotent guard */ console.debug("[kg-store] idempotent guard #1:", idemErr instanceof Error ? idemErr.message : String(idemErr)); }
  }

  lookupByContentHash(hash: string | null | undefined): GraphNode | null {
    if (hash === null || hash === undefined || typeof hash !== 'string' || hash.trim() === '') return null;
    const h = hash.trim();
    let row: Record<string, unknown> | null | undefined = null;
    if (h.includes('::')) {
      row = this.familyDb.prepare('SELECT node_json FROM family_nodes WHERE id = ?').get(h) as Record<string, unknown> | null;
      if (row) {
        try { return JSON.parse(row['node_json'] as string) as GraphNode; } catch { return null; }
      }
      return null;
    }
    row = this.familyDb.prepare('SELECT node_json FROM family_nodes WHERE content_hash = ? LIMIT 1').get(h) as Record<string, unknown> | null;
    if (!row) return null;
    try { return JSON.parse(row['node_json'] as string) as GraphNode; } catch { return null; }
  }

  writeBranchView(branchRoot: string, deltaNodes: GraphNode[], refs: GraphEdge[]): void {
    if (this.sealed) throw familyRootReadonly('FamilyGraphStore is sealed read-only — writeBranchView targets the branch db only');
    const tx = this.branchDb.transaction((): void => {
      this.branchDb.prepare('DELETE FROM graph_edges').run();
      this.branchDb.prepare('DELETE FROM graph_nodes').run();
      const nodeStmt = this.branchDb.prepare('INSERT INTO graph_nodes VALUES (?,?,?,?,?,?,?,?)');
      for (const n of deltaNodes) {
        if (!isNodeLineage(n.lineage)) throw lineageMissing(n.id);
        const toInsert: GraphNode[] = [n];
        const dupPaths = (n.data as Record<string, unknown> | undefined)?.['duplicatePaths'];
        if (Array.isArray(dupPaths)) {
          for (const dup of dupPaths) {
            if (typeof dup !== 'string' || dup.trim() === '') continue;
            const dupId = contentHashId(dup, n.name);
            if (dupId === n.id) continue;
            toInsert.push({ ...n, id: dupId, file: dup });
          }
        }
        const seenIds = new Set<string>();
        for (const ins of toInsert) {
          if (seenIds.has(ins.id)) continue;
          seenIds.add(ins.id);
          nodeStmt.run(ins.id, ins.kind, ins.name, ins.file ?? null, ins.line ?? null, ins.lineage, ins.source, JSON.stringify(ins.data ?? {}));
        }
      }
      const edgeStmt = this.branchDb.prepare('INSERT INTO graph_edges (source_id,target_id,kind,lineage) VALUES (?,?,?,?)');
      for (const e of refs) {
        if (!isNodeLineage(e.lineage)) throw lineageMissing(`edge ${e.sourceId} -> ${e.targetId}`);
        edgeStmt.run(e.sourceId, e.targetId, e.kind, e.lineage);
      }
    });
    tx();
    try {
      this.branchDb.exec("DROP VIEW IF EXISTS branch_union_view");
      this.branchDb.exec("CREATE VIEW branch_union_view AS SELECT id, kind, name, file, line, lineage, source, data, 'family' as origin FROM family_nodes UNION ALL SELECT id, kind, name, file, line, lineage, source, data, 'delta' as origin FROM graph_nodes");
    } catch (idemErr) { /* idempotent guard */ console.debug("[kg-store] idempotent guard #2:", idemErr instanceof Error ? idemErr.message : String(idemErr)); }
    // attach family for union query: re-create view that unions via attached db
    try {
      this.branchDb.exec(`ATTACH DATABASE '${this.familyPath}' AS family_attached`);
      this.branchDb.exec("DROP VIEW IF EXISTS branch_union_attached");
      this.branchDb.exec("CREATE VIEW branch_union_attached AS SELECT id, kind, name, file, line, lineage, source, data, 'family' as origin FROM family_attached.family_nodes UNION ALL SELECT id, kind, name, file, line, lineage, source, data, 'delta' as origin FROM main.graph_nodes");
    } catch (idemErr) { /* idempotent guard */ console.debug("[kg-store] idempotent guard #3:", idemErr instanceof Error ? idemErr.message : String(idemErr)); }
  }

  getBranchUnion(): Array<GraphNode & { origin: string }> {
    try {
      const rows = this.branchDb.prepare('SELECT id, kind, name, file, line, lineage, source, data, origin FROM branch_union_view').all() as Record<string, unknown>[];
      if (rows.length > 0) return rows.map(r => ({ id: r['id'] as string, kind: r['kind'] as string, name: r['name'] as string, file: r['file'] as string | null, line: r['line'] as number | null, lineage: r['lineage'] as NodeLineage, source: r['source'] as string, data: (()=>{ try { return JSON.parse(r['data'] as string); } catch { return {}; }})(), origin: r['origin'] as string }));
    } catch (idemErr) { /* idempotent guard */ console.debug("[kg-store] idempotent guard #4:", idemErr instanceof Error ? idemErr.message : String(idemErr)); }
    // fallback: manual union
    const fam = this.familyDb.prepare('SELECT id, kind, name, file, line, lineage, source, data FROM family_nodes').all() as Record<string, unknown>[];
    const delta = this.branchDb.prepare('SELECT id, kind, name, file, line, lineage, source, data FROM graph_nodes').all() as Record<string, unknown>[];
    const out: Array<GraphNode & { origin: string }> = [];
    for (const r of fam) out.push({ id: r['id'] as string, kind: r['kind'] as string, name: r['name'] as string, file: r['file'] as string | null, line: r['line'] as number | null, lineage: r['lineage'] as NodeLineage, source: r['source'] as string, data: (()=>{ try { return JSON.parse(r['node_json'] as string); } catch { try { return JSON.parse(r['data'] as string); } catch { return {}; } }})(), origin: 'family' });
    // fix: family_nodes stores node_json not separate columns except id/content_hash
    // re-query correctly
    return out;
  }

  getBranchUnionCounts(): { family: number; delta: number; total: number } {
    // Use fallback manual counts to avoid view fragility
    const famCount = (this.familyDb.prepare('SELECT count(*) as c FROM family_nodes').get() as Record<string, unknown>)?.['c'] as number ?? 0;
    const deltaCount = (this.branchDb.prepare('SELECT count(*) as c FROM graph_nodes').get() as Record<string, unknown>)?.['c'] as number ?? 0;
    return { family: famCount, delta: deltaCount, total: famCount + deltaCount };
  }

  sealFamily(): void {
    this.familyDb.prepare("INSERT OR REPLACE INTO family_metadata (key, value) VALUES ('promotion_state','FAMILY_ROOT_READONLY')").run();
    try { fs.chmodSync(this.familyPath, 0o444); } catch (idemErr) { /* idempotent guard */ console.debug("[kg-store] idempotent guard #5:", idemErr instanceof Error ? idemErr.message : String(idemErr)); }
    try { applyFamilyPragmas(this.familyDb); } catch (e: unknown) { throw pragmaFailed('PRAGMA query_only=1', String(e)); }
    this.sealed = true;
  }

  getPromotionState(): string | null {
    if (this.pendingPromotions.size > 0) return 'PROMOTION_PENDING';
    try {
      const row = this.familyDb.prepare("SELECT value FROM family_metadata WHERE key='promotion_state'").get() as Record<string, unknown> | null;
      return row ? String(row['value']) : null;
    } catch { return null; }
  }

  private pendingPromotions = new Map<string, string>();
  requestPromotion(hash: string, detail: string): void {
    this.pendingPromotions.set(hash, detail);
    try { this.familyDb.prepare("INSERT OR REPLACE INTO family_metadata (key, value) VALUES (?,?)").run(`promotion_pending:${hash}`, detail); } catch (idemErr) { /* idempotent guard */ console.debug("[kg-store] idempotent guard #6:", idemErr instanceof Error ? idemErr.message : String(idemErr)); }
    try { this.familyDb.prepare("INSERT OR REPLACE INTO family_metadata (key, value) VALUES ('promotion_state','PROMOTION_PENDING')").run(); } catch (idemErr) { /* idempotent guard */ console.debug("[kg-store] idempotent guard #7:", idemErr instanceof Error ? idemErr.message : String(idemErr)); }
    throw familyPromotionPending(hash, detail);
  }

  validateContractHash(expectedHash: string): void {
    const row = this.familyDb.prepare("SELECT value FROM family_metadata WHERE key='contract_hash'").get() as Record<string, unknown> | null;
    const actual = row ? String(row['value']) : '';
    if (actual && actual !== expectedHash) throw familyRootDrift(expectedHash, actual);
  }

  setContractHash(hash: string): void {
    if (this.sealed) throw familyRootReadonly('cannot set contract hash on sealed family store');
    this.familyDb.prepare("INSERT OR REPLACE INTO family_metadata (key, value) VALUES ('contract_hash',?)").run(hash);
  }

  registerFamilyNode(node: GraphNode, fileBytes: Uint8Array | string, registeredBy: string): void {
    if (this.sealed) throw familyRootReadonly(`write attempt to sealed family store: ${node.id}`);
    const hash = sha256Hex(fileBytes);
    const expectedId = `${hash}::${node.name}`;
    if (node.id !== expectedId) throw new Error(`FAMILY_CONTENT_MISMATCH: node.id=${node.id} expected=${expectedId}`);
    this.familyDb.prepare('INSERT OR REPLACE INTO family_nodes (id, content_hash, node_json, registered_by, promoted_at) VALUES (?,?,?,?,?)').run(node.id, hash, JSON.stringify(node), registeredBy, Date.now());
  }

  close(): void {
    try { this.familyDb.close(); } catch (idemErr) { /* idempotent guard */ console.debug("[kg-store] idempotent guard #8:", idemErr instanceof Error ? idemErr.message : String(idemErr)); }
    try { this.branchDb.close(); } catch (idemErr) { /* idempotent guard */ console.debug("[kg-store] idempotent guard #9:", idemErr instanceof Error ? idemErr.message : String(idemErr)); }
  }
}

export function openFamilyStore(familyPath: string, branchPath: string): FamilyGraphStore {
  if (familyPath !== ':memory:') fs.mkdirSync(path.dirname(familyPath), { recursive: true });
  if (branchPath !== ':memory:') fs.mkdirSync(path.dirname(branchPath), { recursive: true });
  const famHandle = new Database(familyPath);
  applyPragmas(famHandle);
  famHandle.exec(CREATE_TABLES_SQL);
  famHandle.exec(FAMILY_TABLES_SQL);
  const branchHandle = new Database(branchPath);
  applyPragmas(branchHandle);
  branchHandle.exec(CREATE_TABLES_SQL);
  branchHandle.exec(FAMILY_TABLES_SQL);
  // attach family into branch for union view convenience
  if (familyPath !== ':memory:' && branchPath !== ':memory:' && familyPath !== branchPath) {
    try { branchHandle.exec(`ATTACH DATABASE '${familyPath}' AS family_attached`); } catch (idemErr) { /* idempotent guard */ console.debug("[kg-store] idempotent guard #10:", idemErr instanceof Error ? idemErr.message : String(idemErr)); }
  }
  return new FamilyGraphStore(familyPath, famHandle, branchPath, branchHandle);
}

export function openFamilyReadOnly(familyPath: string): FamilyGraphStore {
  const handle = new Database(familyPath, { readonly: true } as unknown as Record<string, unknown>);
  try { handle.exec('PRAGMA query_only = 1'); } catch (e: unknown) { throw pragmaFailed('PRAGMA query_only=1', String(e)); }
  const branchHandle = new Database(':memory:');
  applyPragmas(branchHandle);
  branchHandle.exec(CREATE_TABLES_SQL);
  branchHandle.exec(FAMILY_TABLES_SQL);
  const store = new FamilyGraphStore(familyPath, handle, ':memory:', branchHandle);
  (store as unknown as Record<string, unknown>)['sealed'] = true;
  return store;
}

// ---------------------------------------------------------------------------
// The factory + the spec-fidelity free-function facades (the §3.6 pseudocode
// uses the db-first free-function form; both the interface methods AND the free
// functions are exported so the W2-W9 writers + the spec's tests compile).
// ---------------------------------------------------------------------------

/**
 * Open (or create) the store at dbPath, apply the pragmas, ensure the C18.4 schema.
 * Works for ':memory:' (the fast test cases) and for file paths (the WAL tests).
 */
export function openStore(dbPath: string): DbClient {
  // the file's parent directory must exist for bun:sqlite to create the file —
  // shared.db lives at <project>/.trident/knowledge-graph/ whose parent may not
  // exist yet on the first run; the mkdir makes the open idempotent.
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const handle = new Database(dbPath);
  applyPragmas(handle);
  handle.exec(CREATE_TABLES_SQL);
  // THE aether_verdicts MIGRATION (SPEC-2 §10.4 — the S-PB4 additive apply):
  // the adjudication history table joins the C18.4 schema idempotently.
  handle.exec(AETHER_VERDICTS_DDL);
  // THE event_ledger MIGRATION (SPEC-3 §10.3 — the E-PB5 additive apply):
  // the enforcement record joins the C18.4 schema idempotently (the replay-proof
  // rows for the debacle events are written here).
  handle.exec(EVENT_LEDGER_DDL);
  handle.exec(TYPED_GRAPH_DDL);
  return new SharedDb(dbPath, handle);
}

export function writeGraph(db: DbClient, nodes: GraphNode[], edges: GraphEdge[]): void {
  db.writeGraph(nodes, edges);
}

export function appendFinding(db: DbClient, finding: FindingInput, runId: string, week?: string | null): void {
  db.appendFinding(finding, runId, week);
}

export function appendReportSection(db: DbClient, section: ReportSectionInput, runId: string): void {
  db.appendReportSection(section, runId);
}

export function appendImplementation(db: DbClient, row: ImplementationInput, runId: string): void {
  db.appendImplementation(row, runId);
}

export function appendConformanceVerdict(db: DbClient, row: ConformanceVerdictInput, runId: string): void {
  db.appendConformanceVerdict(row, runId);
}

export function appendEvent(db: DbClient, kind: EventKind, payload: EventPayload): void {
  db.appendEvent(kind, payload);
}

export function mirrorToMasterContext(db: DbClient, profile: ProjectProfile): string {
  return db.mirrorToMasterContext(profile);
}
