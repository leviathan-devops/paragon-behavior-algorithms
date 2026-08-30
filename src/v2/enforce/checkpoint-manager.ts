import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { EvidenceRecord } from './evidence-record.js';

export interface TransitionEntry {
  from: string;
  to: string;
  event: string;
  seq?: number;
  timestamp?: number;
  [k: string]: unknown;
}

export interface CheckpointRecord {
  checkpointId: string;
  machineId: string;
  sessionId: string;
  stateValue: unknown;
  context: Record<string, unknown>;
  history: TransitionEntry[];
  evidenceBuffer: EvidenceRecord[];
  createdAt: number;
  checksum: string;
  version: number;
}

export const CheckpointSchema = z.object({
  checkpointId: z.string().min(1),
  machineId: z.string().min(1),
  sessionId: z.string().min(1),
  stateValue: z.unknown(),
  context: z.record(z.string(), z.unknown()),
  history: z.array(z.unknown()),
  evidenceBuffer: z.array(z.unknown()),
  createdAt: z.number(),
  checksum: z.string().min(1),
  version: z.number().int().min(1),
});

function computeChecksum(rec: Omit<CheckpointRecord, 'checksum'> & { checksum?: string }): string {
  const payload = JSON.stringify({
    checkpointId: rec.checkpointId,
    machineId: rec.machineId,
    sessionId: rec.sessionId,
    stateValue: rec.stateValue,
    context: rec.context,
    history: rec.history,
    evidenceBuffer: rec.evidenceBuffer,
    createdAt: rec.createdAt,
    version: rec.version,
  });
  return createHash('sha256').update(payload).digest('hex');
}

type BunDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] };
  close(): void;
};

function openDb(dbPath: string): BunDatabase {
  try {
    const { Database } = require('bun:sqlite') as { Database: new (path: string) => BunDatabase };
    const db = new Database(dbPath);
    try { db.exec('PRAGMA journal_mode=WAL'); } catch (e) { console.error(`[CheckpointManager] WAL pragma failed: ${e instanceof Error ? e.message : String(e)}`); }
    try { db.exec('PRAGMA busy_timeout=5000'); } catch (e) { console.error(`[CheckpointManager] busy_timeout pragma failed: ${e instanceof Error ? e.message : String(e)}`); }
    try { db.exec('PRAGMA synchronous=NORMAL'); } catch (e) { console.error(`[CheckpointManager] sync pragma failed: ${e instanceof Error ? e.message : String(e)}`); }
    db.exec(`CREATE TABLE IF NOT EXISTS checkpoints (
      checkpointId TEXT PRIMARY KEY,
      machineId TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      stateValue TEXT NOT NULL,
      context TEXT NOT NULL,
      history TEXT NOT NULL,
      evidenceBuffer TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      version INTEGER NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(sessionId, createdAt DESC)`);
    return db;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[CheckpointManager] bun:sqlite open failed: ${msg}`);
    throw e;
  }
}

export class CheckpointManager {
  private dbPath: string;
  private machineId: string;
  private sessionId: string;
  private db: BunDatabase | null = null;
  private verificationFailures = 0;
  public readonly autoCheckpoint = false as const;

  constructor(opts: { dbPath: string; machineId?: string; sessionId?: string }) {
    if (!opts || !opts.dbPath) throw new Error('CheckpointManager: dbPath is required');
    this.dbPath = opts.dbPath;
    this.machineId = opts.machineId ?? 'v2-escalation';
    this.sessionId = opts.sessionId ?? 'default';
  }

  private ensureDb(): BunDatabase {
    if (this.db) return this.db;
    this.db = openDb(this.dbPath);
    return this.db;
  }

  save(
    stateValue: unknown,
    context: Record<string, unknown>,
    history: TransitionEntry[],
    evidence: EvidenceRecord[],
  ): CheckpointRecord {
    if (context === null || context === undefined || typeof context !== 'object' || Array.isArray(context)) {
      throw new Error('CheckpointManager.save: context must be a Record<string,unknown>');
    }
    const safeHistory: TransitionEntry[] = Array.isArray(history) ? history : [];
    const safeEvidence: EvidenceRecord[] = Array.isArray(evidence) ? evidence : [];
    const safeContext: Record<string, unknown> = context as Record<string, unknown>;
    const rec: CheckpointRecord = {
      checkpointId: crypto.randomUUID(),
      machineId: this.machineId,
      sessionId: this.sessionId,
      stateValue,
      context: safeContext,
      history: safeHistory,
      evidenceBuffer: safeEvidence,
      createdAt: Date.now(),
      checksum: '',
      version: 1,
    };
    rec.checksum = computeChecksum(rec);
    let db: BunDatabase;
    try {
      db = this.ensureDb();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[CheckpointManager] save ensureDb failed: ${msg}`);
      throw e;
    }
    try {
      const stmt = db.prepare(`INSERT INTO checkpoints (checkpointId,machineId,sessionId,stateValue,context,history,evidenceBuffer,createdAt,checksum,version) VALUES (?,?,?,?,?,?,?,?,?,?)`);
      stmt.run(
        rec.checkpointId,
        rec.machineId,
        rec.sessionId,
        JSON.stringify(rec.stateValue),
        JSON.stringify(rec.context),
        JSON.stringify(rec.history),
        JSON.stringify(rec.evidenceBuffer),
        rec.createdAt,
        rec.checksum,
        rec.version,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[CheckpointManager] save insert failed: ${msg}`);
      throw e;
    }
    return rec;
  }

  loadLatest(sessionId?: string): CheckpointRecord | null {
    const sid = sessionId ?? this.sessionId;
    let db: BunDatabase;
    try {
      db = this.ensureDb();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[CheckpointManager] loadLatest ensureDb failed: ${msg}`);
      return null;
    }
    try {
      const row = db.prepare(`SELECT * FROM checkpoints WHERE sessionId=? ORDER BY createdAt DESC LIMIT 1`).get(sid) as Record<string, unknown> | undefined;
      if (!row) return null;
      let parsed: CheckpointRecord;
      try {
        parsed = {
          checkpointId: row.checkpointId as string,
          machineId: row.machineId as string,
          sessionId: row.sessionId as string,
          stateValue: JSON.parse(row.stateValue as string),
          context: JSON.parse(row.context as string),
          history: JSON.parse(row.history as string),
          evidenceBuffer: JSON.parse(row.evidenceBuffer as string),
          createdAt: row.createdAt as number,
          checksum: row.checksum as string,
          version: row.version as number,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[CheckpointManager] loadLatest JSON parse failed: ${msg}`);
        this.verificationFailures++;
        return null;
      }
      const parsed2 = CheckpointSchema.safeParse(parsed);
      if (!parsed2.success) {
        console.error(`[CheckpointManager] loadLatest schema validation failed: ${parsed2.error.message}`);
        this.verificationFailures++;
        return null;
      }
      const expected = computeChecksum(parsed);
      if (expected !== parsed.checksum) {
        console.error(`[CheckpointManager] loadLatest checksum mismatch`);
        this.verificationFailures++;
        return null;
      }
      return parsed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[CheckpointManager] loadLatest failed: ${msg}`);
      this.verificationFailures++;
      return null;
    }
  }

  verify(checkpoint: CheckpointRecord): boolean {
    if (!checkpoint || typeof checkpoint.checksum !== 'string') return false;
    try {
      const expected = computeChecksum(checkpoint);
      return expected === checkpoint.checksum;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[CheckpointManager] verify failed: ${msg}`);
      return false;
    }
  }

  getVerificationFailures(): number {
    return this.verificationFailures;
  }

  close(): void {
    if (this.db) {
      try { this.db.close(); } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[CheckpointManager] close failed: ${msg}`);
      }
      this.db = null;
    }
  }
}

export function createCheckpointManager(opts: { dbPath: string; machineId?: string; sessionId?: string }): CheckpointManager {
  return new CheckpointManager(opts);
}
