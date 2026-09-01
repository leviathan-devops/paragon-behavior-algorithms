import { Database } from 'bun:sqlite';
import { isPredicate } from '../../../shared/knowledge-graph/ontology.ts';
import type { GraphFactRow } from '../../../shared/knowledge-graph/query-engine.ts';

export class UpdateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

export interface FactInput {
  subject: string;
  predicate: string;
  object: string;
  evidence: string;
  confidence?: number;
  created_run?: string;
  created_at?: number;
}

export type FactVerdict = 'new' | 'duplicate' | 'contradiction' | 'update' | 'uncertain';

export interface ContradictionRecord {
  previous: GraphFactRow;
  incoming: FactInput;
  evidence: string[];
  flaggedAt: number;
}

export interface ClassifyResult {
  verdict: FactVerdict;
  reason: string;
  existing?: GraphFactRow;
  contradictionRecord?: ContradictionRecord;
  superseded?: boolean;
  insertedId?: number;
  supersededId?: number;
}

function getDbHandle(db: unknown): Database {
  if (db instanceof Database) return db;
  const maybe = db as Record<string, unknown>;
  if (maybe && typeof maybe === 'object') {
    if ((maybe as { handle?: unknown }).handle instanceof Database) return (maybe as { handle: Database }).handle;
    if ((maybe as { db?: unknown }).db instanceof Database) return (maybe as { db: Database }).db;
    const anyDb = maybe as { prepare?: unknown; exec?: unknown };
    if (typeof anyDb.prepare === 'function' && typeof anyDb.exec === 'function') return db as unknown as Database;
  }
  throw new UpdateError('UPDATE_GRAPH_INVALID', 'UPDATE_GRAPH_INVALID: graph must be Database or QueryEngine with underlying Database handle');
}

export function classifyFact(fact: unknown, graph: unknown): ClassifyResult {
  if (!fact || typeof fact !== 'object') {
    throw new UpdateError('UPDATE_FACT_INVALID', 'UPDATE_FACT_INVALID: fact must be object with subject/predicate/object/evidence');
  }
  const f = fact as Partial<FactInput>;
  const subject = typeof f.subject === 'string' ? f.subject.trim() : '';
  const predicate = typeof f.predicate === 'string' ? f.predicate.trim() : '';
  const object = typeof f.object === 'string' ? f.object.trim() : '';
  const evidence = typeof f.evidence === 'string' ? f.evidence.trim() : '';
  const confidence = typeof f.confidence === 'number' && Number.isFinite(f.confidence) ? f.confidence : 1.0;
  const createdRun = typeof f.created_run === 'string' ? f.created_run.trim() : `run-${Date.now()}`;
  const createdAt = typeof f.created_at === 'number' && Number.isFinite(f.created_at) ? Math.floor(f.created_at) : Date.now();

  if (!subject || !predicate || !object) {
    return {
      verdict: 'uncertain',
      reason: 'UNCERTAIN: missing subject/predicate/object — insufficient structure to classify',
    };
  }
  if (!evidence || evidence.length === 0) {
    return {
      verdict: 'uncertain',
      reason: 'UNCERTAIN: evidence empty — insufficient to classify (MC-B-02 evidence mandatory)',
    };
  }
  if (!isPredicate(predicate)) {
    return {
      verdict: 'uncertain',
      reason: `UNCERTAIN: predicate '${predicate}' not in closed vocab — cannot classify reliably`,
    };
  }

  let db: Database;
  try {
    db = getDbHandle(graph);
  } catch (e: unknown) {
    if (e instanceof UpdateError) throw e;
    throw new UpdateError('UPDATE_GRAPH_INVALID', `UPDATE_GRAPH_INVALID: ${e instanceof Error ? e.message : String(e)}`);
  }

  let liveRows: GraphFactRow[] = [];
  try {
    const rows = db.prepare('SELECT id, subject, predicate, object, evidence, confidence, created_at, superseded_at FROM graph_facts WHERE subject = ? ORDER BY created_at DESC').all(subject) as unknown as GraphFactRow[];
    liveRows = rows;
  } catch (e: unknown) {
    throw new UpdateError('UPDATE_QUERY_FAILED', `UPDATE_QUERY_FAILED: failed to query graph_facts for subject='${subject}': ${e instanceof Error ? e.message : String(e)}`);
  }

  const liveOnly = liveRows.filter((r) => r.superseded_at === null);

  const exactDup = liveOnly.find((r) => r.predicate === predicate && r.object === object && r.evidence === evidence);
  if (exactDup) {
    return {
      verdict: 'duplicate',
      reason: `DUPLICATE: exact match exists id=${exactDup.id} subject=${subject} predicate=${predicate} object=${object} — no new graph mutation (MC-B-05 compounding)`,
      existing: exactDup,
      superseded: false,
    };
  }

  const contradiction = liveOnly.find((r) => r.predicate === predicate && (r.object !== object || r.evidence !== evidence));
  if (contradiction) {
    let insertedId: number | undefined;
    try {
      const res = db.prepare('INSERT INTO graph_facts (subject, predicate, object, evidence, confidence, created_at, superseded_at) VALUES (?,?,?,?,?,?,NULL)').run(subject, predicate, object, evidence, confidence, createdAt) as unknown as { lastInsertRowid: number | bigint };
      insertedId = Number(res.lastInsertRowid);
    } catch (e: unknown) {
      throw new UpdateError('UPDATE_INSERT_FAILED', `UPDATE_INSERT_FAILED: contradiction insert failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    const flaggedAt = Date.now();
    let inserted: GraphFactRow | undefined;
    try {
      inserted = db.prepare('SELECT id, subject, predicate, object, evidence, confidence, created_at, superseded_at FROM graph_facts WHERE id = ?').get(insertedId) as GraphFactRow | undefined;
    } catch (e: unknown) {
      throw new UpdateError('UPDATE_QUERY_FAILED', `UPDATE_QUERY_FAILED: failed to read inserted contradiction row: ${e instanceof Error ? e.message : String(e)}`);
    }
    void inserted;
    return {
      verdict: 'contradiction',
      reason: `CONTRADICTION: same subject/predicate different object/evidence — both versions preserved (previous id=${contradiction.id} object='${contradiction.object}' vs incoming object='${object}') — FLAGGED, never silently overwritten (Z-B2)`,
      existing: contradiction,
      contradictionRecord: {
        previous: contradiction,
        incoming: { subject, predicate, object, evidence, confidence, created_run: createdRun, created_at: createdAt },
        evidence: [contradiction.evidence, evidence],
        flaggedAt,
      },
      superseded: false,
      insertedId,
    };
  }

  const updateCandidate = liveOnly.find((r) => r.subject === subject && r.predicate !== predicate);
  if (updateCandidate) {
    const supersededAt = Date.now();
    let insertedId: number | undefined;
    try {
      const tx = db.transaction(() => {
        db.prepare('UPDATE graph_facts SET superseded_at = ? WHERE id = ?').run(supersededAt, updateCandidate.id);
        const res = db.prepare('INSERT INTO graph_facts (subject, predicate, object, evidence, confidence, created_at, superseded_at) VALUES (?,?,?,?,?,?,NULL)').run(subject, predicate, object, evidence, confidence, createdAt) as unknown as { lastInsertRowid: number | bigint };
        insertedId = Number(res.lastInsertRowid);
      });
      tx();
    } catch (e: unknown) {
      throw new UpdateError('UPDATE_SUPERSEDE_FAILED', `UPDATE_SUPERSEDE_FAILED: update transaction failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const stillExists = db.prepare('SELECT id, superseded_at FROM graph_facts WHERE id = ?').get(updateCandidate.id) as GraphFactRow | undefined;
      if (!stillExists) {
        throw new UpdateError('UPDATE_NO_DELETE_VIOLATION', 'UPDATE_NO_DELETE_VIOLATION: superseded row missing — no-delete invariant violated (MC-B-04)');
      }
      if (stillExists.superseded_at === null || stillExists.superseded_at === undefined) {
        throw new UpdateError('UPDATE_NO_DELETE_VIOLATION', 'UPDATE_NO_DELETE_VIOLATION: superseded_at not set — row must remain with timestamp');
      }
    } catch (e: unknown) {
      if (e instanceof UpdateError) throw e;
      throw new UpdateError('UPDATE_VERIFY_FAILED', `UPDATE_VERIFY_FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
    return {
      verdict: 'update',
      reason: `UPDATE: same subject different predicate — previous id=${updateCandidate.id} predicate='${updateCandidate.predicate}' superseded_at=${supersededAt} (row preserved, never deleted — MC-B-04)`,
      existing: updateCandidate,
      superseded: true,
      insertedId,
      supersededId: updateCandidate.id,
    };
  }

  if (liveOnly.length === 0) {
    let insertedId: number | undefined;
    try {
      const res = db.prepare('INSERT INTO graph_facts (subject, predicate, object, evidence, confidence, created_at, superseded_at) VALUES (?,?,?,?,?,?,NULL)').run(subject, predicate, object, evidence, confidence, createdAt) as unknown as { lastInsertRowid: number | bigint };
      insertedId = Number(res.lastInsertRowid);
    } catch (e: unknown) {
      throw new UpdateError('UPDATE_INSERT_FAILED', `UPDATE_INSERT_FAILED: new fact insert failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return {
      verdict: 'new',
      reason: `NEW: no existing fact for subject='${subject}' — inserted id=${insertedId}`,
      superseded: false,
      insertedId,
    };
  }

  return {
    verdict: 'uncertain',
    reason: `UNCERTAIN: subject='${subject}' has ${liveOnly.length} live facts but classification ambiguous — insufficient structure`,
    existing: liveOnly[0],
  };
}
