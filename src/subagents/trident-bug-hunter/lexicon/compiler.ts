// src/subagents/trident-bug-hunter/lexicon/compiler.ts
// THE LEXICON COMPILER (W4, spec §3.9 lines 1212-1294). The corpus + the
// templates + the bindings → the compiled predicate battery. The compilation is
// DETERMINISTIC + CACHED by the corpus hash (K20.3): batteryVersion =
// sha256(corpus contents + the bindings). The compile is PROJECT-AGNOSTIC (O3.1):
// it consumes the profile's corpus paths + the bindings ONLY — no project
// content, no Plutus strings, no P-number literals (the Plutus corpus P1-P22 is
// W10's instantiation, never W4's content).
//
// THE FAIL-CLOSED LAW: an unreadable corpus / an unparseable card → the loud
// NAMED error (O32.1), never a silent empty battery; the EMPTY corpus (a clean
// project's zero-rule corpus) is the valid HONEST zero battery — the two states
// are distinguished by measurement, never conflated.
// THE A3 HOSTILE-CORPUS LAW: the fake 'run everything' rule compiles as DATA —
// the template library supplies the check, the hostile text fills only the
// bindings, so a check that could execute the fake command is structurally
// impossible (the check signature is a pure graph/source read).

import fs from 'node:fs';
import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import type { DbClient, Severity } from '../../../shared/knowledge-graph/db.ts';
import { SEVERITIES } from '../../../shared/knowledge-graph/db.ts';
import {
  TEMPLATE_LIBRARY, compileTemplate, LexiconError, sha256,
  type CompiledPredicate, type PredicateTemplate,
} from './templates.ts';
import { extractRuleCards, corpusUnreadable, type RuleCard } from './rule-card.ts';
import { writeBattery, writeRuleCards, loadBattery } from './compiled-store.ts';

// ---------------------------------------------------------------------------
// The corpus hash + the battery version (K20.3) — the cache key the determinism
// depends on. CONTENT-based (the spec §3.9 failure modes: a file's mtime change
// without a content change must NOT poison the cache) — the corpus bytes + the
// bindings JSON are the only inputs. The spec's formula, verbatim:
// batteryVersion = sha256(corpus contents + the bindings) (spec §3.9:1241).
// THE OPERATOR'S NAMING RULING (2026-08-13 — the rehydration build, V3.1 dead):
// the raw sha256 was the anonymous class the operator rejected ("everything
// needs to be properly named with a project token so i can tell what this is
// not some random hash vals"). The sha256 SURVIVES as the fingerprint (the
// determinism core, K20.3 — the first 12 hex chars); the NAMED prefix (the
// project token + the battery name + the version) is a presentation layer over
// the same content hash — a one-byte corpus edit changes the fingerprint, so
// the cache invalidates EXACTLY as before. The name derives ONLY from the
// profile + the corpus content — never a timestamp, never an fs order — so the
// same corpus + the same bindings ALWAYS yield the SAME named version string.
// ---------------------------------------------------------------------------

/** The project token — the profile's project.name, slugified (the operator's
 *  "project token" ruling). 'Plutus_Agent' → 'plutus-agent'; 'fixture-profile'
 *  → 'fixture-profile'. */
export function projectTokenSlug(projectName: string): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug === '' ? 'project' : slug;
}

/** The battery name — the corpus's FIRST rule card (the extraction is
 *  deterministic: the same corpus bytes → the same first card): the
 *  classification + the anchor's file stem form the human-readable slug
 *  (the example's spirit 'p6-price-anchor' — the project + the rule identity). */
function batteryName(profile: ProjectProfile): string {
  const cards = extractRuleCards(profile.rules.corpus);
  if (cards.length === 0) return 'rules';
  const first = cards[0];
  const stem = first.anchor.split('/').pop()?.split('.')[0] ?? 'rules';
  return `${first.classification.toLowerCase()}-${stem}`;
}

/** The corpus + the bindings → the NAMED battery version. The same corpus
 *  ALWAYS yields the same version; a corpus edit (even one byte) invalidates
 *  the battery (the fingerprint changes). The named shape:
 *  '<project>-<battery-name>-battery-v<N> (fingerprint: <hash12>)' — the
 *  example 'plutus-p6-price-anchor-battery-v1 (fingerprint: 5577e7ba)'. */
export function batteryVersion(profile: ProjectProfile): string {
  const corpusText = profile.rules.corpus
    .map((p) => {
      let text: string;
      try {
        text = fs.readFileSync(p, 'utf8');
      } catch (e: unknown) {
        throw corpusUnreadable(p, String(e));
      }
      return `${p}\n${text}`;
    })
    .join('\n');
  const hash = sha256(`${corpusText}\n${JSON.stringify(profile.rules.bindings)}`);
  return `${projectTokenSlug(profile.project.name)}-${batteryName(profile)}-battery-v1 (fingerprint: ${hash.slice(0, 12)})`;
}

// ---------------------------------------------------------------------------
// The template selection (spec §3.9:1228 — the family by the classification)
// ---------------------------------------------------------------------------

/** The classification → template mapping (the deterministic default selection).
 *  The profile's bindings for the selected template fill the parameters. */
export function selectTemplate(card: RuleCard): PredicateTemplate {
  switch (card.classification) {
    case 'ARCH': return TEMPLATE_LIBRARY['contract.must-implement'];
    case 'LOGIC': return TEMPLATE_LIBRARY['provenance.traces-to-source'];
    case 'PROCESS': return TEMPLATE_LIBRARY['process.gates-measure-outputs-not-logic'];
    case 'DOMAIN': return TEMPLATE_LIBRARY['domain.numeric-threshold'];
    default: return TEMPLATE_LIBRARY['process.gates-measure-outputs-not-logic'];
  }
}

// ---------------------------------------------------------------------------
// The pure compile core — the corpus cards + the declared bindings → the battery
// ---------------------------------------------------------------------------

/** The D13 mechanical gate + the card→predicate binding (spec §3.9:1229-1231):
 *  a quote-less card throws D13_VIOLATION (doctrine is QUOTED, never synthesized);
 *  the profile's bindings for the template id + the card's D13 data fill the
 *  template's zod schema (an invalid binding → the loud TEMPLATE_BINDING error). */
function compileCards(cards: RuleCard[], profile: ProjectProfile, version: string): CompiledPredicate[] {
  const battery: CompiledPredicate[] = [];
  for (const card of cards) {
    if (!card.verbatimQuote || card.verbatimQuote.trim() === '') {
      throw new LexiconError(
        'D13_VIOLATION',
        `D13_VIOLATION: card anchor=${card.anchor} — doctrine is QUOTED, never synthesized; the remedy: record the verbatim rule text or curate the PROPOSED card`,
      );
    }
    const template = selectTemplate(card);
    const bindings = {
      ...(profile.rules.bindings[template.id] ?? {}),
      verbatimQuote: card.verbatimQuote,
      anchor: card.anchor,
      severity: card.severity,
    };
    battery.push(compileTemplate(template, bindings, card, version));
  }
  return battery;
}

/** The declared-predicate path (spec §3.9:1233-1235) — the profile's direct
 *  bindings (the P1-P22 class) compile OUTSIDE the corpus extraction. Every
 *  declared predicate carries the D13 quote + the anchor + the severity. */
function compileDeclared(profile: ProjectProfile, version: string): CompiledPredicate[] {
  const declared = profile.rules.bindings['declaredPredicates'];
  if (!declared || typeof declared !== 'object') return [];
  const battery: CompiledPredicate[] = [];
  for (const [ruleId, raw] of Object.entries(declared as Record<string, unknown>)) {
    const binding = (raw ?? {}) as Record<string, unknown>;
    const templateId = String(binding['template'] ?? '');
    const template = TEMPLATE_LIBRARY[templateId];
    if (!template) {
      throw new LexiconError(
        'TEMPLATE_UNKNOWN',
        `TEMPLATE_UNKNOWN: declaredPredicate ${ruleId} names template '${templateId}' which is not in the library`,
      );
    }
    const verbatimQuote = String(binding['verbatimQuote'] ?? '');
    if (!verbatimQuote || verbatimQuote.trim() === '') {
      throw new LexiconError(
        'D13_VIOLATION',
        `D13_VIOLATION: declaredPredicate ${ruleId} lacks a verbatim quote — doctrine is QUOTED, never synthesized`,
      );
    }
    const anchor = String(binding['anchor'] ?? `${ruleId}`);
    const severity = severityFromBinding(binding['severity']);
    battery.push(compileTemplate(template, binding, { verbatimQuote, anchor, severity }, version));
  }
  return battery;
}

// ---------------------------------------------------------------------------
// THE COMPILE API
// ---------------------------------------------------------------------------

/** The primary compile: the corpus + the templates + the bindings → the
 *  compiled battery. DETERMINISTIC (K20.3) — the same corpus always produces
 *  the same ids + the same version; a corpus edit invalidates the battery. */
export async function compile(profile: ProjectProfile): Promise<CompiledPredicate[]> {
  const version = batteryVersion(profile);
  const cards = extractRuleCards(profile.rules.corpus);
  return [...compileCards(cards, profile, version), ...compileDeclared(profile, version)];
}

export interface CompileResult {
  battery: CompiledPredicate[];
  batteryVersion: string;
  fromCache: boolean;
}

/** The cached + persisted compile (spec §3.9:1220-1238): the corpus-hash cache
 *  lookup against W1's compiled_predicates table (the battery_version is the
 *  cache key the schema supports — db.ts:257-268); on a miss the battery is
 *  compiled + persisted (the rule cards under the corpus_hash + the battery rows
 *  INSERT OR REPLACE). A corpus edit changes the hash → a cache miss → re-compile. */
export async function compileBattery(profile: ProjectProfile, db?: DbClient): Promise<CompileResult> {
  const version = batteryVersion(profile);
  if (db) {
    const row = db.prepare('SELECT COUNT(*) AS c FROM compiled_predicates WHERE battery_version = ?').get(version);
    if (Number(row?.['c'] ?? 0) > 0) {
      return { battery: loadBattery(db, version), batteryVersion: version, fromCache: true };
    }
  }
  const cards = extractRuleCards(profile.rules.corpus);
  const battery = [...compileCards(cards, profile, version), ...compileDeclared(profile, version)];
  if (db) {
    writeRuleCards(db, cards, version);
    writeBattery(db, battery);
  }
  return { battery, batteryVersion: version, fromCache: false };
}


/** THE R16 TYPE_CERTAINTY GUARDED READ — the severity binding is narrowed by
 *  the SEVERITIES membership check (the assertion is earned by the validation). */
function severityFromBinding(v: unknown): Severity {
  if (typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)) {
    return v as Severity;
  }
  return 'HIGH';
}
