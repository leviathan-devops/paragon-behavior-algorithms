// src/subagents/trident-bug-hunter/lexicon/compiled-store.ts
// THE COMPILED STORE (W4, spec §3.9's compiled-store — lines 1243-1257). The
// battery rows → W1's compiled_predicates table (the C18.4 schema, db.ts lines
// 257-268) via the DbClient PASS-THROUGH surface (prepare/exec — the documented
// query surface the spec's own tests use; there is NO dedicated battery writer
// on W1's DbClient, so the pass-through is the honest integration, never a
// schema extension and never a modification of W1's file).
//
// THE CHECK_CODE LAW: the check_code is the SERIALIZED reinstatement shape —
// { template, bindings } (the template id + the JSON-serialized bound params).
// NEVER a function string, NEVER a runtime-only closure: a fresh reader
// reinstantiates the check deterministically from the template library + the
// stored params (loadBattery). The D13 quote is mandatory on every row (the
// machine asserts only what it can quote). The write is IDEMPOTENT: INSERT OR
// REPLACE by the content-addressed id — a recompile replaces the rows in place,
// never accumulates duplicates.

import type { DbClient, Severity } from '../../../shared/knowledge-graph/db.ts';
import { SEVERITIES } from '../../../shared/knowledge-graph/db.ts';
import type { RuleCard } from './rule-card.ts';
import {
  TEMPLATE_LIBRARY, LexiconError, templateMissing,
  type CompiledPredicate, type PredicateFamily, type CheckContext,
} from './templates.ts';

/** The compiled_predicates columns (db.ts:257-268) — the write is INSERT OR
 *  REPLACE by the content-addressed predicate id (idempotent by construction). */
const COMPILED_PREDICATES_COLUMNS = [
  'id', 'family', 'template', 'bindings', 'verbatim_quote', 'anchor',
  'severity', 'check_code', 'battery_version', 'calibrated',
].join(',');

/**
 * The battery → W1's compiled_predicates table. The calibrated column is passed
 * explicitly as 'PENDING' — the column's DEFAULT (db.ts:267) — because the
 * calibration is W5's gate, never this wave's. The check_code carries the
 * reinstatement shape { template, bindings } — never a function string.
 */
export function writeBattery(db: DbClient, battery: CompiledPredicate[]): void {
  if (battery.length === 0) return;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO compiled_predicates (${COMPILED_PREDICATES_COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const p of battery) {
    const checkCode = JSON.stringify({ template: p.template, bindings: p.bindings });
    stmt.run(
      p.id,
      p.family,
      p.template,
      JSON.stringify(p.bindings),
      p.verbatimQuote,
      p.anchor,
      p.severity,
      checkCode,
      p.batteryVersion,
      'PENDING',
    );
  }
}

/**
 * The rule cards → W1's rule_cards table (db.ts:279-287), keyed by the corpus
 * hash (the cache surface the schema supports). IDEMPOTENT per corpus: the old
 * rows for the hash are deleted first, then the fresh rows insert — a recompile
 * replaces, never accumulates. The corpus_hash IS the battery_version (the
 * content hash of the corpus + the bindings).
 */
export function writeRuleCards(db: DbClient, cards: RuleCard[], corpusHash: string): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM rule_cards WHERE corpus_hash = ?').run(corpusHash);
    const ins = db.prepare(
      'INSERT INTO rule_cards (quote,anchor,classification,severity,proposed,corpus_hash) VALUES (?,?,?,?,?,?)',
    );
    for (const c of cards) {
      ins.run(c.verbatimQuote, c.anchor, c.classification, c.severity, c.proposed, corpusHash);
    }
    db.exec('COMMIT');
  } catch (e: unknown) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * A fresh reader: the stored rows → the reinstated battery. The check is
 * reinstantiated from the template library + the stored params — the machine's
 * compiled battery persists compaction-inert (a fresh agent reads the rows,
 * never the reinjected corpus). A missing template or an unparseable row is the
 * loud named error, never a silently broken check.
 */
export function loadBattery(db: DbClient, batteryVersion: string): CompiledPredicate[] {
  const rows = db.prepare(
    'SELECT id,family,template,bindings,verbatim_quote,anchor,severity,check_code,battery_version FROM compiled_predicates WHERE battery_version = ?',
  ).all(batteryVersion);
  return rows.map((row) => rehydrate(row));
}

function rehydrate(row: Record<string, unknown>): CompiledPredicate {
  let bindings: Record<string, unknown>;
  let templateId: string;
  let bound: Record<string, unknown>;
  try {
    bindings = JSON.parse(String(row['bindings'] ?? '{}')) as Record<string, unknown>;
    // THE R16 TYPE_CERTAINTY GUARD — the parsed check_code is typeof-guarded
    // before the typed read of its template/bindings fields.
    const parsed = JSON.parse(String(row['check_code'] ?? '{}')) as unknown;
    const code: {
      template?: string; bindings?: Record<string, unknown>;
    } = parsed !== undefined && parsed !== null && typeof parsed === 'object'
      ? parsed as { template?: string; bindings?: Record<string, unknown> }
      : {};
    templateId = String(code['template'] ?? row['template'] ?? '');
    bound = code['bindings'] ?? bindings;
  } catch (e: unknown) {
    // v4.4.3 R10 FIX: log the original error before rethrowing — the raw
    // parse failure's context must survive the LexiconError wrap.
    console.error(`[compiled-store] BINDINGS_UNPARSEABLE id=${String(row['id'])}: ${e instanceof Error ? e.message : String(e)}`);
    throw new LexiconError(
      'BINDINGS_UNPARSEABLE',
      `BINDINGS_UNPARSEABLE: id=${String(row['id'])} detail=${String(e)}`,
    );
  }
  const template = TEMPLATE_LIBRARY[templateId];
  if (!template) throw templateMissing(templateId);
  return {
    id: String(row['id']),
    family: predicateFamilyFrom(row['family']),
    template: templateId,
    bindings: bound,
    verbatimQuote: String(row['verbatim_quote']),
    anchor: String(row['anchor']),
    severity: severityFrom(row['severity']),
    batteryVersion: String(row['battery_version']),
    check: (ctx: CheckContext) => template.check({ ...ctx, bindings: bound }),
  };
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the stored family string is narrowed
 *  by the literal-union check (no cast at all). */
function predicateFamilyFrom(v: unknown): PredicateFamily {
  if (v === 'WIRING' || v === 'CONTRACT' || v === 'PROVENANCE' || v === 'DOMAIN' || v === 'PROCESS') {
    return v;
  }
  return 'WIRING';
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the stored severity string is narrowed
 *  by the SEVERITIES membership check (the assertion is earned by the check). */
function severityFrom(v: unknown): Severity {
  if (typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)) {
    return v as Severity;
  }
  return 'MED';
}
