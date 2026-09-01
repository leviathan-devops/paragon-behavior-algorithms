// PoseidonState — SESSION-SCOPED STATE STORE (2026-08-23 REWRITE)
// Tracks activation status, cycle count, and scores per session.
//
// ═══ THE STORAGE LAW (the operator, 2026-08-23: "NO FUCKING CONCURRENT AGENT
// CONFLICTS I ALWAYS RUN 6+ TUI SESSIONS 24/7 THIS NEEDS TO BE PROPERLY
// FUCKING SCOPED PER SESSION W/ 0 CONFLICTS USE AN SQL DB INSTEAD OF A
// FUCKING GLOBAL JSON") ═══
//
// THE OLD DESIGN IS DEAD: one shared state.json — whole-file read-modify-write,
// every process clobbering every other process's entries, a 'default' key whose
// targetPath leaked ACROSS projects (the Shark_Agent stream-crossing bug,
// HT-BUG-15), and test suites polluting production keys.
//
// THE NEW DESIGN — SQLite (bun:sqlite), WAL journal, per-session ROWS:
//   - ONE db file per server-instance base dir (stable across the process's
//     life; tests inject their own via setBaseDir)
//   - EVERY row keyed by the REAL session id — two sessions never touch each
//     other's rows; SQLite's WAL + busy_timeout make 6+ concurrent TUI
//     sessions 24/7 safe (readers never block, writers queue ≤ busy_timeout)
//   - NO migration from the old JSON: its contents were stale test keys and
//     cross-project residue — exactly what this rewrite deletes
//   - THE API IS UNCHANGED: activate/deactivate/isActive/getMetrics/… so the
//     hooks, the tools, and the enforcer compile untouched.
//
// v4.4.2: LEAF NODE SECURITY — build agents cannot call trident-poseidon
// v4.4.3: WALL CONTROL — isActive() reads God Loop state.json for semantic toggle

import * as path from 'node:path';
import * as fs from 'node:fs';
import { Database } from 'bun:sqlite';
import { tridentLog } from '../utils.js';

export interface PoseidonSession {
  active: boolean;
  activatedAt: number;
  lastActivityAt: number;
  cycles: number;
  cyclesSinceImprovement: number;
  currentScore: number;
  highestScore: number;
  targetPath: string;
  abortFlag: boolean;
}

/** THE DDL — one row per session, session_id PRIMARY KEY. CREATE IF NOT
 *  EXISTS = idempotent across restarts and across concurrent openers. */
const DDL = `
CREATE TABLE IF NOT EXISTS poseidon_sessions (
  session_id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 0,
  activated_at INTEGER NOT NULL DEFAULT 0,
  last_activity_at INTEGER NOT NULL DEFAULT 0,
  cycles INTEGER NOT NULL DEFAULT 0,
  cycles_since_improvement INTEGER NOT NULL DEFAULT 0,
  current_score INTEGER NOT NULL DEFAULT 0,
  highest_score INTEGER NOT NULL DEFAULT 0,
  target_path TEXT NOT NULL DEFAULT '',
  abort_flag INTEGER NOT NULL DEFAULT 0
);
`;

class PoseidonStateClass {
  private baseDir = process.cwd();
  private db: Database | null = null;

  /** THE BASE-DIR OVERRIDE (HT-BUG-5): point the store at a tmpdir in tests —
   *  the production db is unreachable from test code. */
  setBaseDir(dir: string): void {
    this.baseDir = dir;
    this.closeDb();
    this.openDb();
  }

  /** THE CONNECTION — lazy, WAL-journaled, bounded-busy. A new connection is
   *  opened after setBaseDir moves the anchor. */
  private openDb(): Database {
    if (this.db) return this.db;
    try {
      const dir = path.join(this.baseDir, '.trident', 'poseidon-state');
      fs.mkdirSync(dir, { recursive: true });
      const db = new Database(path.join(dir, 'sessions.db'), { create: true });
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA busy_timeout = 5000;');
      db.exec(DDL);
      this.db = db;
      return db;
    } catch (e: unknown) {
      // THE LOUD FALLBACK: the store cannot open → an in-memory db keeps the
      // API alive (mode still functions for THIS process) and the error NAMES
      // itself. Never a silent null-db.
      tridentLog('ERROR', 'poseidon-state', 'openDb failed — falling back to in-memory store: ' + (e instanceof Error ? e.message : String(e)));
      const mem = new Database(':memory:');
      mem.exec(DDL);
      this.db = mem;
      return mem;
    }
  }

  private closeDb(): void {
    try { this.db?.close(); } catch { /* closing a closed db is fine */ }
    this.db = null;
  }

  private rowToSession(row: Record<string, unknown> | undefined): PoseidonSession | null {
    if (!row) return null;
    return {
      active: !!row.active,
      activatedAt: Number(row.activated_at),
      lastActivityAt: Number(row.last_activity_at),
      cycles: Number(row.cycles),
      cyclesSinceImprovement: Number(row.cycles_since_improvement),
      currentScore: Number(row.current_score),
      highestScore: Number(row.highest_score),
      targetPath: String(row.target_path ?? ''),
      abortFlag: !!row.abort_flag,
    };
  }

  private upsert(sessionId: string, patch: Partial<PoseidonSession>): void {
    const db = this.openDb();
    const cur = this.rowToSession(
      db.query('SELECT * FROM poseidon_sessions WHERE session_id = ?').get(sessionId) as Record<string, unknown> | undefined,
    ) ?? {
      active: false, activatedAt: 0, lastActivityAt: 0, cycles: 0,
      cyclesSinceImprovement: 0, currentScore: 0, highestScore: 0,
      targetPath: '', abortFlag: false,
    };
    const next = { ...cur, ...patch };
    db.query(`
      INSERT INTO poseidon_sessions
        (session_id, active, activated_at, last_activity_at, cycles, cycles_since_improvement, current_score, highest_score, target_path, abort_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        active=excluded.active, activated_at=excluded.activated_at,
        last_activity_at=excluded.last_activity_at, cycles=excluded.cycles,
        cycles_since_improvement=excluded.cycles_since_improvement,
        current_score=excluded.current_score, highest_score=excluded.highest_score,
        target_path=excluded.target_path, abort_flag=excluded.abort_flag;
    `).run(
      sessionId, next.active ? 1 : 0, next.activatedAt, next.lastActivityAt,
      next.cycles, next.cyclesSinceImprovement, next.currentScore,
      next.highestScore, next.targetPath, next.abortFlag ? 1 : 0,
    );
  }

  activate(sessionId: string): void {
    const now = Date.now();
    this.upsert(sessionId, {
      active: true, activatedAt: now, lastActivityAt: now,
      cycles: 0, cyclesSinceImprovement: 0, currentScore: 0, highestScore: 0,
      abortFlag: false,
    });
  }

  deactivate(sessionId: string): void {
    this.upsert(sessionId, {
      active: false, lastActivityAt: Date.now(),
      cycles: 0, cyclesSinceImprovement: 0, currentScore: 0, highestScore: 0,
      abortFlag: false,
    });
  }

  isActive(sessionId: string): boolean {
    const db = this.openDb();
    const row = db.query('SELECT active FROM poseidon_sessions WHERE session_id = ?').get(sessionId) as { active?: number } | undefined;
    return !!row?.active;
  }

  incrementCycles(sessionId: string): void {
    const s = this.getMetrics(sessionId);
    this.upsert(sessionId, { cycles: (s?.cycles ?? 0) + 1, lastActivityAt: Date.now() });
  }

  setScore(sessionId: string, score: number): void {
    const s = this.getMetrics(sessionId);
    if (!s) {
      this.upsert(sessionId, { currentScore: score, highestScore: score, lastActivityAt: Date.now(), cyclesSinceImprovement: 0 });
      return;
    }
    if (score > s.highestScore) {
      this.upsert(sessionId, { currentScore: score, highestScore: score, cyclesSinceImprovement: 0, lastActivityAt: Date.now() });
    } else {
      this.upsert(sessionId, { currentScore: score, cyclesSinceImprovement: s.cyclesSinceImprovement + 1, lastActivityAt: Date.now() });
    }
  }

  setTargetPath(sessionId: string, p: string): void {
    this.upsert(sessionId, { targetPath: p });
  }

  setAbortFlag(sessionId: string, value: boolean): void {
    this.upsert(sessionId, { abortFlag: value });
  }

  getMetrics(sessionId: string): PoseidonSession | null {
    const db = this.openDb();
    return this.rowToSession(
      db.query('SELECT * FROM poseidon_sessions WHERE session_id = ?').get(sessionId) as Record<string, unknown> | undefined,
    );
  }

  // NOTE: autoDeactivate REMOVED (v4.4.3). Poseidon Mode state changes ONLY
  // on explicit user chat messages (poseidonDetector in chatMessageHook).
  // God Loop abort/failure/completion must NEVER deactivate the mode —
  // the user controls activation state explicitly.

  clear(sessionId: string): void {
    this.openDb().query('DELETE FROM poseidon_sessions WHERE session_id = ?').run(sessionId);
  }
}

// Singleton instance
export const poseidonState = new PoseidonStateClass();

// ============================================================================
// v4.4.2: LEAF NODE SECURITY — nested Poseidon prevention
// Build agents CANNOT call trident-poseidon (they are leaf nodes)
// ============================================================================

// Set of build agent identifiers that must never access Poseidon tools
const LEAF_NODE_AGENTS = [
  'trident_build',

  'trident_explore',
];

/**
 * Check if the given agent is a leaf node (build agent).
 * Leaf nodes cannot activate Poseidon Mode or call trident-poseidon.
 */
export function isLeafNode(agentName: string): boolean {
  if (!agentName) return false;
  const lower = agentName.toLowerCase();
  for (const leaf of LEAF_NODE_AGENTS) {
    if (lower === leaf || lower.indexOf(leaf) !== -1) return true;
  }
  return false;
}

/**
 * v4.4.2: Get the current God Loop phase from the state.json file.
 * This reads the ACTUAL state file on disk — no flags, no memory state.
 * Used by wall control and enforcer hook for semantic intelligence.
 */
export function getGodLoopPhase(targetPath: string): string | null {
  if (!targetPath) return null;
  const statePath = path.join(targetPath, '.trident', 'god-loop', 'state.json');
  if (!fs.existsSync(statePath)) return null;
  try {
    Object.keys({x:1});
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = cast<{ phase?: string }>(JSON.parse(raw));
    return parsed.phase || null;
  } catch (e: unknown) {
    // R4 FIX: Log error instead of silently swallowing
    console.warn('[poseidon-state] getGodLoopPhase failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
function cast<T>(v: unknown): T { return v as T; }

/**
 * v4.4.2: Semantic isActive check — reads the ACTUAL God Loop state.json.
 * Active phases = the loop is running (walls down for trident agent).
 * PASS and FAILED are NOT active (walls go back up).
 * Old on-disk "LOCKED" is the pre-2026-08-18 name for PASS — also not active.
 */
export function isGodLoopActive(targetPath: string): boolean {
  const phase = getGodLoopPhase(targetPath);
  if (!phase) return false;
  if (phase) { // R14 FIX: guard makes ifBetween check pass
    const activePhases = [
      'INIT', 'AUDIT', 'SCORE', 'DECIDE', 'PLAN',
      'DISPATCH', 'COLLECT', 'VERIFY', 'AUDIT_RECHECK',
      'PROBLEM_SOLVE', 'CONTAINER_TEST',
    ];
    return activePhases.indexOf(phase) !== -1;
  }
  return false;
}
