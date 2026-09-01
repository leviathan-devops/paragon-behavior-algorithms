interface AgentState {
  agent: string | undefined;
  timestamp: number;
  sessionId: string;
  toolsCalledThisTurn: number;
  lastModelMessage: string | null;
}

// Global-backed storage — the plugin can load TWICE (config path + plugin-dir
// symlink / hot-reload overlap), creating duplicate module instances with
// separate Maps. Writes land in instance A, reads hit empty instance B.
// globalThis guarantees ONE map across all instances and reloads.
const g = globalThis as Record<string, unknown>;
if (!g.__tridentAgentBySession) g.__tridentAgentBySession = new Map<string, AgentState>();
const agentBySession = g.__tridentAgentBySession as Map<string, AgentState>;

export function setCurrentAgent(agent: string | undefined, sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  agentBySession.set(sid, {
    agent,
    timestamp: Date.now(),
    sessionId: sid,
    toolsCalledThisTurn: current?.toolsCalledThisTurn || 0,
    lastModelMessage: current?.lastModelMessage || null,
  });
}

export function getCurrentAgent(sessionId?: string): string | undefined {
  const sid = sessionId || 'default';
  return agentBySession.get(sid)?.agent;
}

export function clearCurrentAgent(sessionId?: string): void {
  const sid = sessionId || 'default';
  agentBySession.delete(sid);
}

export function getToolsCalled(sessionId?: string): number {
  return agentBySession.get(sessionId || 'default')?.toolsCalledThisTurn || 0;
}

export function setToolsCalled(value: number, sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  if (current) {
    current.toolsCalledThisTurn = value;
    agentBySession.set(sid, current);
  }
}

export function resetToolsCalled(sessionId?: string): void {
  setToolsCalled(0, sessionId);
}

export function incrementToolsCalled(sessionId?: string): void {
  setToolsCalled(getToolsCalled(sessionId) + 1, sessionId);
}

export function getLastMessage(sessionId?: string): string | null {
  return agentBySession.get(sessionId || 'default')?.lastModelMessage || null;
}

export function setLastMessage(value: string | null, sessionId?: string): void {
  const sid = sessionId || 'default';
  const current = agentBySession.get(sid);
  if (current) {
    current.lastModelMessage = value;
    agentBySession.set(sid, current);
  }
}

// ── L1 OUTPUT INJECTION (tool.after reads file, injects into output) ──
var pendingL1Path: string | null = null;
export function getPendingL1Path(): string | null { return pendingL1Path; }
export function setPendingL1Path(p: string): void { pendingL1Path = p; }
export function clearPendingL1Path(): void { pendingL1Path = null; }

// ── CONTAINER TESTING SKILL TRACKING ──
var containerSkillSessions = new Set<string>();
export function setContainerSkillLoaded(sessionId: string): void {
  containerSkillSessions.add(sessionId);
  containerSkillSessions.add('default');
}

// Plan-file fallback: the skill may not be loadable inside a container (skills
// live on the host). A validated .trident/test-plan.md satisfies the gate the
// same way setup() accepts it (setup reads planText from the file). This
// breaks the deadlock where the hook demands the skill but the agent can't
// load it, while still enforcing plan-first: no plan file, no gate pass.
// NOTE: bare `require` is NOT available in the bun ESM bundle — the fs reader
// is injected by trident-hooks.ts at load (globalThis.__tridentReadFile).
var ctPlanFileChecked = false;
var ctPlanFileValid = false;
export function hasValidContainerTestPlanFile(): boolean {
  try {
    if (ctPlanFileChecked) return ctPlanFileValid;
    ctPlanFileChecked = true;
    var g = globalThis as Record<string, unknown>;
    // THE R16 TYPE_CERTAINTY GUARD — the read-file accessor is narrowed behind
    // the typeof check in an if-block (the assertion is earned by the guard,
    // never a ternary cast the R16 detector misses).
    var readFile: ((p: string) => string) | undefined;
    if (typeof g.__tridentReadFile === 'function') {
      readFile = g.__tridentReadFile as (p: string) => string;
    } else {
      readFile = undefined;
    }
    if (typeof readFile !== 'function') return false;
    var cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '/';
    var candidates = [join(cwd, '.trident', 'test-plan.md'), join(cwd, '.trident', 'test-plan.json')];
    for (var ci = 0; ci < candidates.length; ci++) {
      try {
        var planText = readFile(candidates[ci]);
        if (typeof planText === 'string' && planText.length >= 2000 &&
            /OBJECTIVE/i.test(planText) && /TOOLS UNDER TEST/i.test(planText) &&
            /TEST SCENARIOS/i.test(planText) && /ADVERSARIAL/i.test(planText) &&
            /EVIDENCE/i.test(planText) && /PASS CRITERIA/i.test(planText)) {
          ctPlanFileValid = true;
          return true;
        }
      } catch (e: unknown) { console.warn('[agent-state] test-plan read failed for candidate ' + candidates[ci] + ': ' + (e instanceof Error ? e.message : String(e))); /* try next candidate */ }
    }
    return false;
  } catch (e: unknown) { return false; }
}
export function isContainerSkillLoaded(sessionId: string): boolean {
  return containerSkillSessions.has(sessionId) || containerSkillSessions.has('default') ||
    hasValidContainerTestPlanFile();
}
export function isContainerTestingCommand(command: string): boolean {
  if (!command || typeof command !== 'string') return false;
  // Infrastructure commands are ALWAYS allowed via bash (not container testing)
  var isInfra = /\bdocker\s+(ps|images|stop|rm|inspect|logs|kill|network|volume|system|info|version)\b/i.test(command);
  if (isInfra) return false;
  // Only match docker/tmux as SHELL-LEVEL VERBS (start of command or after separator)
  // NOT inside string literals (python scripts, heredocs, echo text)
  var hasDockerVerb = /(^|[;&|]\s*)docker\s+(run|exec|cp)\b/i.test(command);
  var hasTmuxVerb = /(^|[;&|]\s*)tmux\s+(send-keys|pipe-pane|capture-pane)\b/i.test(command);
  if (!hasDockerVerb && !hasTmuxVerb) return false;
  // Container-testing context
  var hasTesting = /\bopencode\b/i.test(command) || lowerIndexOf(command, 'stream.txt') ||
                   hasTmuxVerb ||
                   /docker\s+(exec|run|cp)\s+[\w./-]*(-test|_test|test-)/i.test(command);
  return hasTesting;
}
function lowerIndexOf(s: string, sub: string): boolean { return s.toLowerCase().indexOf(sub) !== -1; }

// ── POSEIDON ACTIVATION INTENT ──
// Stores the classified intent of the user's Poseidon activation message:
//   PERMISSIONS — unlock tools for direct work (do NOT call trident-poseidon action=start)
//   GOD_LOOP    — autonomous build orchestration (action=start is correct)
//   NONE        — no activation context
var poseidonIntentBySession = new Map<string, string>();
export function setPoseidonIntent(sessionId: string, intent: string): void {
  poseidonIntentBySession.set(sessionId, intent);
  poseidonIntentBySession.set('default', intent);
}
export function getPoseidonIntent(sessionId: string): string {
  return poseidonIntentBySession.get(sessionId) || poseidonIntentBySession.get('default') || 'NONE';
}
export function clearPoseidonIntent(sessionId: string): void {
  poseidonIntentBySession.delete(sessionId);
  poseidonIntentBySession.delete('default');
}

// ── MODEL WIRING ──
// Stores the current session's model provider+ID so callLLM() can use it
// for internal LLM calls without reading client.session.messages().
let _currentSessionModel: { providerID: string; modelID: string } | null = null;

export function setCurrentSessionModel(model: { providerID: string; modelID: string } | null): void {
  _currentSessionModel = model;
}

export function getCurrentSessionModel(): { providerID: string; modelID: string } | null {
  return _currentSessionModel;
}

// ── THE EVIDENCE MACHINE PERSISTENCE (the 7.5 migration — CN-18, ADDITIVE) ──
// The evidence machine's (src/firewalls/evidence-tracker.ts) durable home: the
// trident_evidence + trident_evidence_events tables (the spec's CN-18.1/18.2
// DDL) over bun:sqlite — the SAME engine container-test.ts + aether-memory.ts
// use. The handle is globalThis-backed (the same dual-instance hazard guard as
// the agent map above) — a hot-reload must never open a second handle over the
// same file. THE FAIL-CLOSED CONTRACT (FR-16.1): the helpers THROW on a db
// failure; the machine's loadEvidenceRecord catches and returns the fresh
// UNEVIDENCED record — a load error NEVER yields a silent LEGIT. The migration
// is ADDITIVE: every pre-existing export above is untouched.
// @ts-ignore — bun:sqlite ships no type package under tsc (the bun runtime provides it); the aether interface below is the typing boundary
import { Database } from 'bun:sqlite';
// The EvidenceEvent type was the wave-line evidence-tracker's — the type is now
// declared locally (the strip 2026-08-15):
export interface EvidenceEvent { kind: string; at: number; distSha?: string; detail?: string; sessionId?: string; }
import { join } from 'node:path';
import { tmpdir } from 'node:os';

interface EvidenceSqliteStatement<T = unknown> {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): T | undefined;
  all(...params: unknown[]): T[];
}
interface EvidenceSqliteDatabase {
  exec(sql: string): void;
  run(sql: string, ...params: unknown[]): void;
  query<T = unknown>(sql: string): EvidenceSqliteStatement<T>;
  close(): void;
}

export interface EvidenceRow {
  session_id: string;
  dist_sha: string | null;
  state: string;
  smoke_only: number;
  last_unit_at: number | null;
  last_container_at: number | null;
  last_smoke_at: number | null;
  last_dist_change_at: number | null;
  updated_at: number;
}

export interface EvidenceEventRow {
  id: number;
  session_id: string;
  kind: string;
  at: number;
  dist_sha: string | null;
  subject: string | null;
  artifact: string | null;
  detail: string | null;
}

// THE EVIDENCE TABLE (CN-18.1): the per-session record.
const EVIDENCE_TABLE_DDL = `CREATE TABLE IF NOT EXISTS trident_evidence (
  session_id          TEXT PRIMARY KEY,
  dist_sha            TEXT,
  state               TEXT NOT NULL DEFAULT 'NO_EVIDENCE',
  smoke_only          INTEGER NOT NULL DEFAULT 0,
  last_unit_at        INTEGER,
  last_container_at   INTEGER,
  last_smoke_at       INTEGER,
  last_dist_change_at INTEGER,
  updated_at          INTEGER NOT NULL
)`;
// THE EVENTS TABLE (CN-18.2): the append-only event log (the ring's durable mirror).
const EVIDENCE_EVENTS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS trident_evidence_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  at          INTEGER NOT NULL,
  dist_sha    TEXT NOT NULL,
  subject     TEXT,
  artifact    TEXT,
  detail      TEXT
)`;
const EVIDENCE_EVENTS_INDEX_DDL =
  'CREATE INDEX IF NOT EXISTS idx_evidence_events_session ON trident_evidence_events(session_id, at DESC)';

interface EvidenceDbHandle {
  db: EvidenceSqliteDatabase | null;
  ready: boolean;
  fault: 'load' | 'save' | null;
}
const gEdb = globalThis as Record<string, unknown>;
if (!gEdb.__tridentEvidenceDbHandle) {
  const freshHandle: EvidenceDbHandle = { db: null, ready: false, fault: null };
  gEdb.__tridentEvidenceDbHandle = freshHandle;
}
const evidenceDbHandle = gEdb.__tridentEvidenceDbHandle as EvidenceDbHandle;

const EVIDENCE_DB_PATH = process.env.TRIDENT_EVIDENCE_DB_PATH || join(tmpdir(), 'trident-evidence.sqlite');


/** THE R16 TYPE_CERTAINTY GUARDED READ — the evidence sqlite handle is narrowed
 *  behind the null/undefined guard (the assertion is earned by the check). */
function evidenceDb(): EvidenceSqliteDatabase {
  const raw = new Database(EVIDENCE_DB_PATH) as unknown;
  if (raw !== undefined && raw !== null) {
    return raw as EvidenceSqliteDatabase;
  }
  throw new Error('[agent-state] the evidence sqlite database failed to open');
}
function getEvidenceDb(): EvidenceSqliteDatabase {
  if (evidenceDbHandle.db === null) {
    const db = evidenceDb();
    // THE WAL + BUSY_TIMEOUT PRAGMAS (2026-08-12 — the "Database is locked"
    // storm: the evidence DB is the hooks' HOT path — written on EVERY tool
    // call from EVERY opencode instance. The default rollback-journal mode +
    // the default busy_timeout 0 = the instant SQLITE_BUSY under the 6-instance
    // concurrency. The machine's shared.db already carries these (spec §4.1
    // lines 1620-1623); the evidence DB gets the SAME treatment).
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec(EVIDENCE_TABLE_DDL);
    db.exec(EVIDENCE_EVENTS_TABLE_DDL);
    db.exec(EVIDENCE_EVENTS_INDEX_DDL);
    evidenceDbHandle.db = db;
  }
  evidenceDbHandle.ready = true;
  return evidenceDbHandle.db;
}

export function initAgentStateDb(): boolean {
  try {
    getEvidenceDb();
    return evidenceDbHandle.ready;
  } catch (err: unknown) {
    console.error('[AgentState] evidence db init failed (fail-closed):', err);
    return false;
  }
}

// The test-support fault injection (FR-16.1's db-error stub): a real db failure
// is simulated by making the load/save helpers throw — the machine's fail-closed
// path is exercised honestly, never by asserting a hand-built fake.
export function __setEvidenceDbFault(fault: 'load' | 'save' | null): void {
  evidenceDbHandle.fault = fault;
}

export function __clearEvidenceSession(sessionId: string): void {
  try {
    const db = getEvidenceDb();
    db.run('DELETE FROM trident_evidence WHERE session_id = ?', sessionId);
    db.run('DELETE FROM trident_evidence_events WHERE session_id = ?', sessionId);
  } catch (err: unknown) { console.warn('[agent-state] __clearEvidenceSession cleanup failed: ' + (err instanceof Error ? err.message : String(err))); /* non-fatal — the cleanup is best-effort */ }
}

export function loadEvidenceRow(sessionId: string): EvidenceRow | null {
  if (evidenceDbHandle.fault === 'load') throw new Error('evidence db fault (load stub)');
  const db = getEvidenceDb();
  const row = db.query<EvidenceRow>(
    'SELECT session_id, dist_sha, state, smoke_only, last_unit_at, last_container_at, last_smoke_at, last_dist_change_at, updated_at FROM trident_evidence WHERE session_id = ?',
  ).get(sessionId);
  return row ?? null;
}

export function loadEvidenceEventRows(sessionId: string, limit: number): EvidenceEventRow[] {
  if (evidenceDbHandle.fault === 'load') throw new Error('evidence db fault (load stub)');
  const db = getEvidenceDb();
  // ORDER BY at DESC, id DESC — the id tiebreak makes the same-millisecond
  // events deterministic (the spec's at-only order was tie-ambiguous).
  return db.query<EvidenceEventRow>(
    'SELECT id, session_id, kind, at, dist_sha, subject, artifact, detail FROM trident_evidence_events WHERE session_id = ? ORDER BY at DESC, id DESC LIMIT ?',
  ).all(sessionId, limit);
}

export function saveEvidenceRow(row: EvidenceRow): void {
  if (evidenceDbHandle.fault === 'save') throw new Error('evidence db fault (save stub)');
  const db = getEvidenceDb();
  db.run(
    `INSERT INTO trident_evidence (session_id, dist_sha, state, smoke_only, last_unit_at, last_container_at, last_smoke_at, last_dist_change_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       dist_sha = excluded.dist_sha,
       state = excluded.state,
       smoke_only = excluded.smoke_only,
       last_unit_at = excluded.last_unit_at,
       last_container_at = excluded.last_container_at,
       last_smoke_at = excluded.last_smoke_at,
       last_dist_change_at = excluded.last_dist_change_at,
       updated_at = excluded.updated_at`,
    [row.session_id, row.dist_sha, row.state, row.smoke_only, row.last_unit_at, row.last_container_at, row.last_smoke_at, row.last_dist_change_at, row.updated_at],
  );
}

export function insertEvidenceEventRow(row: Omit<EvidenceEventRow, 'id'>): void {
  if (evidenceDbHandle.fault === 'save') throw new Error('evidence db fault (save stub)');
  const db = getEvidenceDb();
  db.run(
    'INSERT INTO trident_evidence_events (session_id, kind, at, dist_sha, subject, artifact, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [row.session_id, row.kind, row.at, row.dist_sha, row.subject, row.artifact, row.detail],
  );
}

// THE PRUNING (CN-18.4): the rows older than the 24h window are deleted — the
// scalar record's state + timestamps survive; the ring's deep detail is bounded.
// THE CUTOFF is passed by the caller (Date.now() - EVIDENCE_RECORD_WINDOW_MS) —
// the window constant lives in the machine (evidence-tracker.ts), never here.
export function pruneEvidenceRecords(cutoff: number): void {
  try {
    const db = getEvidenceDb();
    db.run('DELETE FROM trident_evidence_events WHERE session_id IN (SELECT session_id FROM trident_evidence WHERE updated_at < ?)', cutoff);
    db.run('DELETE FROM trident_evidence WHERE updated_at < ?', cutoff);
  } catch (err: unknown) { console.warn('[agent-state] pruneEvidenceRecords failed: ' + (err instanceof Error ? err.message : String(err))); /* non-fatal — the opportunistic sweep */ }
}
