// src/subagents/trident-bug-hunter/harness/scan.ts
// THE SCAN ACTOR (W7, spec §2.7:320 — "SCAN (the compiler: corpus → battery;
// the engine: battery × graph+source → findings)"). The micro-loop's THIRD
// state: compile the corpus into the predicate battery (W4) + run the battery
// over the graph + source (W5) → the runId-scoped findings.
//
// THE DETERMINISM LAW (K21.2): the engine is pure over the reads — the same
// battery + the same graph + the same source bytes ALWAYS produce the same
// findings. THE FAIL-CLOSED LAW: an empty graph is ENGINE_GRAPH_EMPTY (a loud
// fail); an EMPTY BATTERY is the valid honest zero (a clean project) — the two
// states are distinguished by measurement, never conflated (spec §3.10).
//
// THE CORPUS-PATH RESOLUTION (the W7 integration seam): the loader validates
// the corpus entries against the project root but the profile keeps the RAW
// relative entries; the compiler's batteryVersion + the rule-card extractor
// read the paths directly. The scan actor NORMALIZES the entries to absolute
// paths (resolved against the profile root) BEFORE the compile — a relative
// corpus entry compiled against the process CWD would be the CORPUS_UNREADABLE
// false-fail. Every value computed from the data, never fitted to an oracle.

import path from 'node:path';
import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import type { DbClient } from '../../../shared/knowledge-graph/db.ts';
import type { GraphAdapter } from '../graph/interface.ts';
import type { CompiledPredicate } from '../lexicon/templates.ts';
import { compileBattery } from '../lexicon/compiler.ts';
import { runBattery, type RunSummary } from '../diagnostics/engine.ts';
import { runCalibration } from '../diagnostics/calibration.ts';

/** The SCAN actor's output — the compiled battery + the run summary. */
export interface ScanResult {
  battery: CompiledPredicate[];
  batteryVersion: string;
  run: RunSummary;
}

/** Resolve the profile's corpus entries to absolute paths (the W7 seam). */
export function resolveCorpusPaths(profile: ProjectProfile): ProjectProfile {
  const corpus = profile.rules.corpus.map((entry) =>
    path.isAbsolute(entry) ? entry : path.resolve(profile.project.root, entry),
  );
  return {
    ...profile,
    rules: { ...profile.rules, corpus },
  };
}

/** THE SCAN ACTOR — compile + run. Throws the engine's named errors
 *  (ENGINE_GRAPH_EMPTY / FINDING_CHECK_FAILED / FINDING_NO_TRIPLET /
 *  D13_VIOLATION / TEMPLATE_BINDING_INVALID ...) — the micro-loop's onError
 *  routes the fail-state INCONCLUSIVE (O3.5). */
export async function scan(
  profile: ProjectProfile,
  adapter: GraphAdapter,
  runId: string,
  db?: DbClient,
): Promise<ScanResult> {
  try {
    // THE CORPUS-PATH NORMALIZATION (the integration seam — see the header).
    const normalized = resolveCorpusPaths(profile);

    // THE COMPILER — the corpus + the templates + the bindings → the battery
    // (hash-cached against W1's compiled_predicates table when a db is present).
    const { battery, batteryVersion } = await compileBattery(normalized, db);

    // THE COVERAGE GATE (HT-BUG-16 — 2026-08-23: a hunt over 17,500 methods
    // returned 'clean' because the corpus compiled zero matchable cards). An
    // empty battery on a non-trivial target is INCONCLUSIVE, never a clean
    // pass — the false-clean class dies here at the scan boundary.
    if (battery.length === 0) {
      throw new Error(
        'HUNT_NO_COVERAGE: rulesCompiled=0 — the rule battery compiled zero actionable predicates. ' +
        'The corpus must contain machine-matchable rules (not prose contracts). state=inconclusive.',
      );
    }

    const methodsScanned = adapter.nodes().length;
    if (methodsScanned === 0) {
      throw new Error(
        'HUNT_NO_COVERAGE: methodsScanned=0 — the graph reported zero methods. ' +
        'No methods to scan is inconclusive, never a clean pass. state=inconclusive.',
      );
    }

    // THE D17 CALIBRATION GATE (spec §3.11 / FR-12 — born dryRun, FLAGGED→EXCLUDED).
    // The gate runs BEFORE the engine so FLAGGED predicates never ship; born-dryRun
    // means the gate defaults OFF and the live flip is the operator's curation — here
    // the wiring defaults dryRun:true so the records + coverageNote are computed + surfaced
    // but the FLAGGED exclusion is observable via liveBattery. If fixtures are absent
    // (no fire+golden), the gate no-ops as honest [].
    let liveBattery = battery;
    try {
      const bindingsAny = (normalized as unknown as { rules?: { bindings?: Record<string, unknown> } }).rules?.bindings ?? {};
      const rawFixtures = (bindingsAny as Record<string, unknown>).calibrationFixtures as unknown;
      const fixtures = rawFixtures && typeof rawFixtures === 'object' && Array.isArray((rawFixtures as Record<string, unknown>).fire) && Array.isArray((rawFixtures as Record<string, unknown>).golden)
        ? rawFixtures as { fire: import('../diagnostics/calibration.ts').FireFixture[]; golden: import('../diagnostics/calibration.ts').GoldenFixture[] }
        : { fire: [] as import('../diagnostics/calibration.ts').FireFixture[], golden: [] as import('../diagnostics/calibration.ts').GoldenFixture[] };
      const hasFixtures = fixtures.fire.length > 0 || fixtures.golden.length > 0;
      if (hasFixtures) {
        const cal = await runCalibration(normalized, fixtures, { battery, dryRun: true });
        if (cal.excluded.length > 0) {
          liveBattery = cal.liveBattery;
          console.warn(`[scan] D17 calibration: ${cal.excluded.length} FLAGGED → EXCLUDED; ${cal.coverageNote}`);
        }
      }
    } catch (calErr: unknown) {
      console.warn(`[scan] D17 calibration gate failed (non-fatal, battery unchanged): ${calErr instanceof Error ? calErr.message : String(calErr)}`);
    }

    // SWEEP-BLIND REFUSAL (zero-trust 2026-08-24): if the semantic layer could
    // not read ANY graph file, its silence is UNMEASURABLE — a clean pass here
    // is false (the T2 class). Loud named inconclusive, never dispatch.
    // THE ENGINE — the battery × the graph + the lockdown source → the findings.
    // The db append is runId-scoped through W5's findings-store (the append-only
    // ledger, the MPSE evidence mandatory at the write boundary).
    const run = runBattery(liveBattery, adapter, normalized, runId, db);

    return { battery, batteryVersion, run };
  } catch (e: unknown) {
    console.warn(`[scan] failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
