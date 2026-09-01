import { NODE_TYPES, ALL_PREDICATES } from './ontology.ts';

function sqlList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(',');
}

const NODE_KINDS_SQL = sqlList(NODE_TYPES);
const PREDICATES_SQL = sqlList(ALL_PREDICATES);

export const TYPED_GRAPH_DDL = `
CREATE TABLE IF NOT EXISTS typed_nodes (
  id INTEGER PRIMARY KEY,
  canonical_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (${NODE_KINDS_SQL})),
  label TEXT NOT NULL,
  file TEXT,
  line INTEGER,
  created_run TEXT NOT NULL,
  superseded_run TEXT
);
CREATE TABLE IF NOT EXISTS typed_edges (
  id INTEGER PRIMARY KEY,
  src_canonical TEXT NOT NULL,
  dst_canonical TEXT NOT NULL,
  predicate TEXT NOT NULL CHECK (predicate IN (${PREDICATES_SQL})),
  evidence_quote TEXT NOT NULL CHECK (length(evidence_quote) > 0),
  confidence REAL NOT NULL DEFAULT 1.0,
  created_run TEXT NOT NULL,
  superseded_run TEXT
);
CREATE TABLE IF NOT EXISTS resolutions (
  alias TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('same','related','unrelated')),
  reasoning TEXT NOT NULL,
  created_run TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS graph_facts (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  evidence TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at INTEGER NOT NULL,
  superseded_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tn_canonical ON typed_nodes(canonical_id);
CREATE INDEX IF NOT EXISTS idx_tn_kind ON typed_nodes(kind);
CREATE INDEX IF NOT EXISTS idx_te_src ON typed_edges(src_canonical);
CREATE INDEX IF NOT EXISTS idx_te_dst ON typed_edges(dst_canonical);
CREATE INDEX IF NOT EXISTS idx_te_pred ON typed_edges(predicate);
CREATE INDEX IF NOT EXISTS idx_res_canonical ON resolutions(canonical_id);
CREATE INDEX IF NOT EXISTS idx_gf_subject ON graph_facts(subject);
`;

export interface TypedGraphDb {
  exec(sql: string): unknown;
}

export function ensureTypedGraphSchema(db: TypedGraphDb): void {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('TYPED_MIGRATION_FAILED: db handle missing exec');
  }
  try {
    db.exec(TYPED_GRAPH_DDL);
  } catch (e: unknown) {
    throw new Error(`TYPED_MIGRATION_FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}
