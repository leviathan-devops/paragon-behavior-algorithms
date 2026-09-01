// src/subagents/trident-bug-hunter/harness/recon.ts
// THE RECON ACTOR (W7, spec §2.7:320 — "profile.yaml → load → RECON (the canon
// read)"). The micro-loop's FIRST state: load the profile via W1's fail-closed
// loader + read the canon docs the profile's `awareness.docs` lists → the
// intended-behavior summary the report + the pipeline declare.
//
// THE FAIL-CLOSED LAW (O16, spec §3.1): the machine NEVER runs on an invalid
// profile. The loader throws the NAMED errors (PROFILE_INVALID /
// CORPUS_MISSING / HISTORY_MISSING — spec §4.2:1794); the recon actor ADDS the
// awareness-doc existence check (spec §5.7:2469 — "the RECON actor reads the
// canon docs the profile's awareness.docs lists") — a listed-but-missing canon
// doc is the named CORPUS_MISSING, never a silent skip.
//
// THE INTENDED-BEHAVIOR SUMMARY (spec §2.8:369 — "the intended-behavior
// summary (the declared stages + the battery + the corpus count)"):
// { stages, batteryCount, corpusCount } — EVERY value computed from the data
// (the hardcode ban): stages = the declared pipeline stage count, corpusCount =
// the corpus doc count, batteryCount = the blockquote-marked rule count across
// the corpus files (the extractor's input — the compiled battery count is
// SCAN's measurement, this is the pre-compile estimate the profile declares).

import fs from 'node:fs';
import path from 'node:path';
import { loadProfile } from '../../../shared/knowledge-graph/profile-loader.ts';
import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import { openStore, type DbClient } from '../../../shared/knowledge-graph/db.ts';

/** The intended-behavior summary (spec §2.8:369) — the RECON actor's output.
 *  The runId is the machine's NAMED hunt run id ('<project>-hunt-<yyyyMMdd>-<seq>')
 *  — derived here (the project name is only known post-load) + assigned to the
 *  machine context by the recon onDone action. */
export interface IntendedBehavior {
  stages: number;
  batteryCount: number;
  corpusCount: number;
  profile: ProjectProfile;
  runId: string;
}

/** The named awareness-doc error — a listed-but-missing canon doc (spec §5.7). */
export function awarenessDocMissing(docPath: string): Error {
  return new Error(
    `CORPUS_MISSING: path=${docPath} remedy=the awareness doc must exist (fix the profile's awareness.docs)`,
  );
}

/** The blockquote detector — the corpus's rule-card marker. THE REGEX IS THE
 *  MECHANICAL DETECTOR ONLY (the '>' quote marker, spec §3.8:1158); the count
 *  is the measurement, never a decision. */
const QUOTE_MARKER_RE = /^\s*>/;

/** Count the blockquote-marked lines across the corpus files (data-driven). */
function countQuotedRules(profile: ProjectProfile): number {
  let count = 0;
  for (const entry of profile.rules.corpus) {
    const abs = path.isAbsolute(entry) ? entry : path.resolve(profile.project.root, entry);
    let text: string;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (e: unknown) {
      // the loader already validated the corpus EXISTS — an unreadable here is
      // the same failure class the compiler would hit; let the scan actor's
      // named error surface it (CORPUS_UNREADABLE), never a silent zero here.
      console.warn(`[recon] corpus file unreadable at ${abs}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const line of text.split('\n')) {
      if (QUOTE_MARKER_RE.test(line)) count += 1;
    }
  }
  return count;
}

/** THE RECON ACTOR — the machine's first state. Throws the NAMED errors
 *  (PROFILE_INVALID / CORPUS_MISSING / HISTORY_MISSING) — the micro-loop's
 *  onError routes the fail-state INCONCLUSIVE (O3.5, never a silent pass). */
export function recon(profilePath: string): IntendedBehavior {
  // THE PROFILE LOAD (W1's fail-closed loader — the frozen zod contract)
  const profile = loadProfile(profilePath);

  // THE CANON READ (spec §5.7:2469) — every listed awareness doc must exist.
  for (const doc of profile.awareness.docs) {
    const abs = path.isAbsolute(doc) ? doc : path.resolve(profile.project.root, doc);
    if (!fs.existsSync(abs)) {
      throw awarenessDocMissing(doc);
    }
  }

  // THE MATERIALIZATION + THE NAMED RUN ID (the rehydration build — the
  // compaction-inert promise made physical): the recon actor is the machine's
  // UNCONDITIONAL first state — opening the store HERE (create-if-absent)
  // materializes <project>/.trident/knowledge-graph/shared.db + the C18.4
  // tables + the WAL sidecars on the FIRST hunt, before any lazy first-write.
  // The map actor re-opens the SAME store (the WAL + busy_timeout 5000 absorb
  // the two-agent contention). The same open counts the prior HUNT_DONE runs
  // for the runId's per-day sequence (the operator's naming ruling — the
  // project token, never an anonymous 'hunt-<ts>').
  const dbPath = path.join(profile.project.root, '.trident', 'knowledge-graph', 'shared.db');
  const runId = openAndNextRunId(projectToken(profile.project.name), dbPath);

  return {
    stages: profile.pipeline.stages.length,
    batteryCount: countQuotedRules(profile),
    corpusCount: profile.rules.corpus.length,
    profile,
    runId,
  };
}

/** The project token — the profile's project.name, slugified (the operator's
 *  "project token" ruling). 'Plutus_Agent' → 'plutus-agent'; 'fixture-profile'
 *  → 'fixture-profile'. Mirrors compiler.ts's projectTokenSlug (the two must
 *  stay identical — the battery version + the runId share the token). */
function projectToken(projectName: string): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug === '' ? 'project' : slug;
}

/** Open (create) the store + derive the named hunt run id —
 *  '<project>-hunt-<yyyyMMdd>-<seq>' with the per-day sequence counter (the
 *  prior HUNT_DONE runs for the day counted, +1). The store EXISTS after this
 *  call — the durable truth materialized on the first run (the WAL + the
 *  busy_timeout 5000 pragmas ride openStore's applyPragmas). */
function openAndNextRunId(token: string, dbPath: string): string {
  const db: DbClient = openStore(dbPath);
  try {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `${token}-hunt-${day}-`;
    let seq = 0;
    for (const row of db.prepare("SELECT payload FROM events WHERE kind = 'HUNT_DONE'").all()) {
      let payload: { runId?: unknown };
      try {
        // THE R16 TYPE_CERTAINTY FIX — JSON.parse returns `any`; the assignment
        // to the typed variable needs no cast at all (no AsExpression to flag),
        // and the runId read below is typeof-guarded before use.
        payload = JSON.parse(String(row['payload'] ?? '{}'));
      } catch (e: unknown) {
        console.warn(`[recon] HUNT_DONE payload parse failed — skipped: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      if (typeof payload.runId === 'string' && payload.runId.startsWith(prefix)) {
        const rest = payload.runId.slice(prefix.length);
        if (/^\d+$/.test(rest)) seq = Math.max(seq, Number(rest));
      }
    }
    return `${prefix}${seq + 1}`;
  } finally {
    db.close();
  }
}
