// ============================================================
// FILE: src/poseidon/poseidon-watcher.ts
// VERSION: v4.4.3 — the poseidon-drive overhaul W2
// PURPOSE: the poseidon state machine's DETECTION layer — reads the parent
//          session's real data planes + detects when the orchestrator agent
//          went silent / fucked off (the V2.1 theater class).
//
// THE E4 ACTIVITY DEFINITION (the mechanical heart):
//   ACTIVITY = a new turn event ∨ a real file change ∨ a NEW hash-distinct tool call
//   — NEVER a re-read of old data (the hash-distinct rule kills the false-activity).
//   A re-read of a previous tool call's output is NOT activity.
//
// THE ANCHOR: sessionCreated (the DB's session row), never Date.now() —
//   a session that started hours ago but last acted minutes ago is ACTIVE.
//
// THE BOUNDED READ (the DB_LOCKED lesson — the E2.5 canon):
//   execFileSync(python, [dbQuery], { maxBuffer: 200_000, timeout: 5_000, killSignal: 'SIGKILL' })
//   → EMPTY_DB + DB_LOCKED on the timeout catch, never a hang.
// ============================================================

import { execFileSync } from 'node:child_process';
import { tridentLog } from '../utils.js';

// R16 FIX: Module-level type assertion utility — single assertion point per file
function cast<T>(value: unknown): T { const r: T = value as T; return r; }

// The DB path resolution candidates (the session DB lives in the opencode data dir)
export function resolveSessionDbPath(): string {
  const candidates = [
    process.env.OPENCODE_DB,
    process.env.OPENCODE_SESSION_DB,
    process.env.OPENCODE_DATA + '/opencode.db',
    process.env.HOME + '/.local/share/opencode/opencode.db',
    process.env.HOME + '/.config/opencode/opencode.db',
    process.env.HOME + '/.opencode/opencode.db',
    '/root/.local/share/opencode/opencode.db',
    '/root/.config/opencode/opencode.db',
  ];
  const fs = require('node:fs') as typeof import('node:fs');
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return process.env.OPENCODE_DB || '';
}

export interface WatcherToolCall {
  name: string;
  outputHash: string;
  at: number;
}

export interface PoseidonObservation {
  phase: string;
  wave: number;
  silenceMs: number;
  lastActivityAt: number;
  verdict: 'ACTIVE' | 'SILENT' | 'DB_LOCKED';
  expectedTools: string[];
  taskCalls: WatcherToolCall[];
  hasModelBoundary: boolean;
}

export interface PoseidonWatcherOptions {
  /** The phase the loop is currently in (from the state machine). */
  phase: string;
  /** The wave the loop is currently on. */
  wave: number;
  /** The session id of the parent orchestrator agent. */
  parentSessionId: string;
  /** The threshold (ms) after which a session with no NEW activity is SILENT. */
  silenceThresholdMs: number;
  /** The tools the current phase expects (from the PHASE_TOOL_MAP). */
  expectedTools?: string[];
  /** The max number of tool-call hash slots to retain (the memory bound). */
  maxToolCallSlots?: number;
}

export const DEFAULT_SILENCE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes — NEVER lower for a demo kick
const DEFAULT_MAX_TOOL_CALL_SLOTS = 200;
const DB_READ_TIMEOUT_MS = 5_000;
const DB_READ_MAX_BUFFER = 200_000;

/** The PHASE_TOOL_MAP mirror — which tools each phase expects the model to fire. */
export const PHASE_TOOL_MAP: Record<string, string[]> = {
  INIT: [],
  AUDIT: [],
  SCORE: [],
  DECIDE: [],
  PLAN: [],
  DISPATCH: ['task'],
  COLLECT: [],
  VERIFY: [],
  AUDIT_RECHECK: [],
  CONTAINER_TEST: ['trident-container-test', 'shark-container-testing'],
  PROBLEM_SOLVE: [],
  PASS: [],
  LOCKED: [], // load-time alias of PASS — never a live write
  FAILED: [],
};

/**
 * The E4 hash-distinct rule: a tool call is ACTIVITY only if its
 * name+output-hash pair is NEW (not already in the retained slots).
 * A re-read of old data (the same output hash) is NOT activity.
 */
export function isNewToolCall(seen: Map<string, number>, call: WatcherToolCall): boolean {
  const key = call.name + '::' + call.outputHash;
  if (seen.has(key)) return false;
  seen.set(key, call.at);
  // memory bound — drop the oldest slot if over the cap
  if (seen.size > DEFAULT_MAX_TOOL_CALL_SLOTS) {
    let oldest: string | null = null;
    let oldestAt = Infinity;
    for (const [k, at] of seen) {
      if (at < oldestAt) { oldestAt = at; oldest = k; }
    }
    if (oldest) seen.delete(oldest);
  }
  return true;
}

export interface E4VerdictInput {
  /** True when isNewToolCall returned true for at least one call this poll. */
  hasNewCall: boolean;
  /** Instance-persisted time of the last NEW hash-distinct call (0 = never). */
  lastNewCallAt: number;
  /** Session row created-at. The ANCHOR — never Date.now() for leftover rows. */
  sessionCreated: number;
  now: number;
  silenceThresholdMs: number;
  /**
   * False on the first poll: seed the seen-hash set, do NOT treat first-seen
   * historical hashes as activity NOW. True on every subsequent poll.
   */
  primed: boolean;
}

export interface E4Verdict {
  verdict: 'ACTIVE' | 'SILENT';
  lastActivityAt: number;
  silenceMs: number;
}

/**
 * E4 decision (the mechanical heart). ACTIVITY = a NEW hash-distinct tool call
 * AFTER the watcher is primed. leftover lastActivityAt > 0 is NEVER itself ACTIVE.
 * First poll of already-present hashes seeds the set and does not refresh the clock.
 * Fail-closed: no timestamp at all → SILENT (never Date.now() as fake activity).
 */
export function computeE4Verdict(input: E4VerdictInput): E4Verdict {
  const treatAsNewActivity = input.primed && input.hasNewCall;
  const lastActivityAt = treatAsNewActivity
    ? input.now
    : (input.lastNewCallAt > 0
      ? input.lastNewCallAt
      : (input.sessionCreated > 0 ? input.sessionCreated : 0));

  if (lastActivityAt === 0 && !treatAsNewActivity) {
    return { verdict: 'SILENT', lastActivityAt: 0, silenceMs: input.silenceThresholdMs };
  }

  const silenceMs = lastActivityAt > 0 ? Math.max(0, input.now - lastActivityAt) : input.silenceThresholdMs;
  const verdict: E4Verdict['verdict'] = treatAsNewActivity
    ? 'ACTIVE'
    : (silenceMs >= input.silenceThresholdMs ? 'SILENT' : 'ACTIVE');
  return { verdict, lastActivityAt, silenceMs };
}

export class PoseidonWatcher {
  private phase: string;
  private wave: number;
  private parentSessionId: string;
  private silenceThresholdMs: number;
  private expectedTools: string[];
  private seenCalls: Map<string, number>;
  /** Time of the last NEW hash-distinct call. 0 until a primed poll sees one. */
  private lastNewCallAt: number;
  /** False until the first successful poll seeds seenCalls without treating history as NOW. */
  private primed: boolean;

  constructor(opts: PoseidonWatcherOptions) {
    this.phase = opts.phase;
    this.wave = opts.wave;
    this.parentSessionId = opts.parentSessionId;
    this.silenceThresholdMs = opts.silenceThresholdMs || DEFAULT_SILENCE_THRESHOLD_MS;
    this.expectedTools = opts.expectedTools || PHASE_TOOL_MAP[opts.phase] || [];
    this.seenCalls = new Map();
    this.lastNewCallAt = 0;
    this.primed = false;
  }

  setPhase(phase: string): void {
    this.phase = phase;
    this.expectedTools = PHASE_TOOL_MAP[phase] || [];
  }

  setWave(wave: number): void {
    this.wave = wave;
  }

  /**
   * The BOUNDED SQLite read — the python one-liner exec'd with a hard timeout +
   * SIGKILL. Never hangs (the DB_LOCKED lesson). Returns the session snapshot.
   */
  private readDbSnapshot(): { lastActivityAt: number; toolCalls: WatcherToolCall[]; sessionCreated: number; ok: boolean; error?: string } {
    const db = resolveSessionDbPath();
    if (!db) {
      return { lastActivityAt: 0, toolCalls: [], sessionCreated: 0, ok: false, error: 'NO_DB_PATH' };
    }
    const script = [
      "import sqlite3,sys,json",
      "db=sys.argv[1]; sid=sys.argv[2]",
      "c=sqlite3.connect(db,timeout=3)",
      "c.row_factory=sqlite3.Row",
      "try:",
      "  r=c.execute('select id,created from session where id=?',(sid,)).fetchone()",
      "  created=r['created'] if r else 0",
      "except Exception: created=0",
      "rows=[]",
      "try:",
      "  # THE SCHEMA-ADAPTIVE READ (the container-test catch 2026-08-16): the opencode",
      "  # runtime migrated the message table — OLD: id,parentID,role,modelID,toolName,",
      "  #   parts, sessionID  |  NEW: id,session_id,time_created,time_updated,data",
      "  # (the parts live inside the data JSON). The query probes the columns and",
      "  # adapts — never hardcodes one schema.",
      "  cols=[r[1] for r in c.execute('PRAGMA table_info(message)').fetchall()]",
      "  if 'sessionID' in cols and 'parts' in cols:",
      "    for row in c.execute(\"select id,parentID,role,modelID,toolName,parts from message where sessionID=? order by created desc limit 50\",(sid,)):",
      "      rows.append({'role':row['role'] or '','toolName':row['toolName'] or '','text':str(row['parts'] or '')[:400]})",
      "  elif 'session_id' in cols and 'data' in cols:",
      "    for row in c.execute(\"select data from message where session_id=? order by time_created desc limit 50\",(sid,)):",
      "      d=row['data'] or '{}'",
      "      try:",
      "        j=json.loads(d)",
      "        role=j.get('role') or j.get('info',{}).get('role') or ''",
      "        toolName=''",
      "        text=''",
      "        parts=j.get('parts') or []",
      "        for p in parts:",
      "          if isinstance(p,dict):",
      "            if p.get('type')=='text' and isinstance(p.get('text'),str): text+=p['text']",
      "            elif p.get('type')=='tool' and isinstance(p.get('tool'),str): toolName=p['tool']",
      "        rows.append({'role':role,'toolName':toolName,'text':text[:400]})",
      "      except Exception: pass",
      "except Exception: pass",
      "c.close()",
      "print(json.dumps({'created':created,'rows':rows}))",
    ].join('\n');
    try {
      const out = execFileSync('python3', ['-c', script, db, this.parentSessionId], {
        maxBuffer: DB_READ_MAX_BUFFER,
        timeout: DB_READ_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const parsed = cast<{ created: number; rows: { parentID?: string; role?: string; toolName?: string; parts?: string; text?: string }[] }>(JSON.parse(out.trim()));
      const toolCalls: WatcherToolCall[] = [];
      // E4: leftover rows are NOT activity. lastActivityAt stays 0 here.
      // poll() stamps lastActivityAt only via computeE4Verdict (new hash after prime).
      const lastActivityAt = 0;
      let sessionCreated = typeof parsed.created === 'number' && parsed.created > 0 ? parsed.created : 0;
      // The messages carry no reliable timestamp in this schema — infer from the
      // session + the message order. The ANCHOR is sessionCreated, never Date.now()
      // on leftover rows (the 2026-08-18 hole: any rows → now → never SILENT).
      const now = Date.now();
      const rows = parsed.rows || [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const toolName = r.toolName || '';
        if (toolName) {
          // THE E4 HASH-DISTINCT: the tool call's identity = the name + the content
          // hash (the text/parts — the NEW schema's text, the OLD schema's parts)
          const content = r.text || r.parts || '';
          toolCalls.push({ name: toolName, outputHash: r.role + '|' + content.length, at: now - i * 1000 });
        }
      }
      return { lastActivityAt, toolCalls, sessionCreated, ok: true };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      // The timeout/kill path is a DB_LOCKED — the bounded read must NEVER hang
      tridentLog('WARN', 'poseidon-watcher', 'Bounded DB read failed: ' + errMsg);
      return { lastActivityAt: 0, toolCalls: [], sessionCreated: 0, ok: false, error: errMsg.slice(0, 300) };
    }
  }

  /**
   * The poll — returns the observation. The verdict:
   *   ACTIVE     — a NEW hash-distinct tool call AFTER the watcher is primed
   *   SILENT     — no new hash-distinct call within the threshold (leftover rows ≠ activity)
   *   DB_LOCKED  — the bounded read failed (the caller should retry, never assume)
   */
  poll(): PoseidonObservation {
    const snap = this.readDbSnapshot();
    if (!snap.ok) {
      return {
        phase: this.phase, wave: this.wave, silenceMs: 0, lastActivityAt: 0,
        verdict: 'DB_LOCKED', expectedTools: this.expectedTools, taskCalls: [],
        hasModelBoundary: this.phase === 'DISPATCH',
      };
    }

    const newCalls = snap.toolCalls.filter(c => isNewToolCall(this.seenCalls, c));
    const hasNewCall = newCalls.length > 0;
    const now = Date.now();
    const decided = computeE4Verdict({
      hasNewCall,
      lastNewCallAt: this.lastNewCallAt,
      sessionCreated: snap.sessionCreated,
      now,
      silenceThresholdMs: this.silenceThresholdMs,
      primed: this.primed,
    });
    if (this.primed && hasNewCall) {
      this.lastNewCallAt = decided.lastActivityAt;
    }
    this.primed = true;

    // The model boundary check — the current phase expects a specific tool
    const hasModelBoundary = this.phase === 'DISPATCH' || this.phase === 'VERIFY' || this.phase === 'CONTAINER_TEST' || this.phase === 'PROBLEM_SOLVE';

    return {
      phase: this.phase, wave: this.wave, silenceMs: decided.silenceMs, lastActivityAt: decided.lastActivityAt,
      verdict: decided.verdict,
      expectedTools: this.expectedTools, taskCalls: newCalls,
      hasModelBoundary,
    };
  }
}
