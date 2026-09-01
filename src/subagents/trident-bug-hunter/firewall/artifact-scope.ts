/**
 * artifact-scope.ts — THE REPORT_SCOPE_LEXICON (W3, the T.E.B enforcement layer)
 *
 * The bug hunter's write/edit tool.before hooks (the L2 spec §7.3:3315-3471).
 * The input: the target path. The decision: ALLOW_REPORT | BLOCKED.
 * The report writes are mechanically locked to <project>/MASTER_CONTEXT/bug_hunter_report_v<N>.md
 * — the operator's C1.11: 'no writes or edits aside from this folder + the bug_hunter_report_vN
 * ~ block everything else but allow this. mandate this naming conventions explicitly.'
 *
 * THE DATA FLOW (§7.3:3321-3352): RESOLVE -> DETECT -> VERSION -> DECIDE -> ACT.
 * THE MASTER_CONTEXT VARIANT MATCHER (D18, §7.3:3371-3382): the six syntax forms are scanned
 * against the project root; the FIRST EXISTING variant wins — never a duplicate dir created.
 * THE FAIL-STATE: BLOCKED — never a silent pass.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { LexiconContext, MPSE, ReportScopeDecision } from './lexicon-types.js';
import { REPORT_SCOPE_ERROR } from './lexicon-types.js';
import { MASTER_CONTEXT_VARIANTS } from './lexicon-types.js';
export { MASTER_CONTEXT_VARIANTS };

/**
 * THE MASTER_CONTEXT VARIANTS (D18, §7.3:3371-3372) — the six syntax forms,
 * IMPORTED from the ONE shared source (lexicon-types.ts). THE REGEX IS THE
 * MECHANICAL DETECTOR ONLY — the variant matching; THE DECISION is the
 * REPORT_SCOPE_DECISION state machine below (PARSED -> ALLOW_REPORT | BLOCKED).
 */

/** THE REPORT FILENAME PATTERN — the EXACT naming convention (the operator's C1.11 mandate). */
const REPORT_FILENAME_RE = /^bug_hunter_report_v(\d+)\.md$/;

/** The realpath of the project root, resolved once per classify call. */
async function resolveProjectRoot(projectRoot: string): Promise<string> {
  try {
    return await fs.realpath(projectRoot);
  } catch {
    return path.resolve(projectRoot);
  }
}

/** The existing MASTER_CONTEXT variant in the project root — the FIRST existing wins (never a duplicate). */
async function findExistingVariant(projectRootReal: string): Promise<string | null> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(projectRootReal);
  } catch (e: unknown) {
    console.warn(`[artifact-scope] MASTER_CONTEXT variant scan readdir failed at ${projectRootReal}: ${e instanceof Error ? e.message : String(e)}`);
    entries = [];
  }
  for (const variant of MASTER_CONTEXT_VARIANTS) {
    if (entries.includes(variant)) {
      const full = path.join(projectRootReal, variant);
      try {
        const st = await fs.stat(full);
        if (st.isDirectory()) return full;
      } catch (e: unknown) {
        // the entry vanished between the readdir and the stat — try the next variant
        console.warn(`[artifact-scope] variant stat failed for ${full}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return null;
}

/** The resolved master-context dir: the existing variant, else the canonical name (the CREATE path). */
async function resolveMasterContextDir(projectRootReal: string): Promise<string> {
  try {
    const existing = await findExistingVariant(projectRootReal);
    return existing ?? path.join(projectRootReal, 'MASTER_CONTEXT');
  } catch (e: unknown) {
    console.warn(`[artifact-scope] resolveMasterContextDir failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

/**
 * THE REPORT_SCOPE_LEXICON — the classify entry.
 *
 * THE STATE MACHINE (the DECISION layer, §7.3:3430-3449):
 *   PARSED --(the target's normalized parent != the master dir)----------------> BLOCKED
 *   PARSED --(the target's real parent escapes the master realpath)-----------> BLOCKED
 *   PARSED --(filename not bug_hunter_report_v<N>.md)-------------------------> BLOCKED
 *   PARSED --(explicit overwrite of an EXISTING report)-----------------------> BLOCKED
 *   PARSED --(target inside the dir + the exact filename + new N)-------------> ALLOW_REPORT
 *
 * THE .. TRAVERSAL GUARD (§7.3:3389-3404): the normalized target parent must EQUAL the
 * normalized master-context dir — a '..' traversal resolves elsewhere and BLOCKS.
 * THE SYMLINK ESCAPE: the realpath of the target's parent (or its nearest existing ancestor)
 * must stay inside the master dir's realpath — a link pointing outside resolves outside -> BLOCKED.
 */
export async function classify(
  input: { target: string },
  projectRoot: string,
  _ctx?: LexiconContext,
): Promise<ReportScopeDecision> {
  const projectRootReal = await resolveProjectRoot(projectRoot);
  const masterDir = await resolveMasterContextDir(projectRootReal);

  // THE NORMALIZED CONTAINMENT — the target's parent, normalized, must equal the master dir.
  // THE REGEX IS THE MECHANICAL DETECTOR ONLY — the path-normalization comparison; THE DECISION
  // is the REPORT_SCOPE_DECISION state machine (PARSED -> ALLOW_REPORT | BLOCKED).
  const targetNorm = path.normalize(path.resolve(input.target));
  const targetParentNorm = path.normalize(path.dirname(targetNorm));
  const masterNorm = path.normalize(masterDir);
  const base = path.basename(targetNorm);

  if (targetParentNorm !== masterNorm) {
    return blocked('REPORT_SCOPE_BLOCKED', base, input.target);
  }

  // THE SYMLINK-ESCAPE RESOLUTION — the parent's realpath must stay inside the master realpath
  // (when the master dir exists; a non-existent master dir cannot contain a symlink — the
  // normalized containment above is then the only gate, and the CREATE path proceeds).
  const parentReal = await fs.realpath(path.dirname(targetNorm)).catch((e) => {
    console.warn(`[artifact-scope] parent realpath failed (the CREATE path): ${e instanceof Error ? e.message : String(e)}`);
    return null;
  });
  if (parentReal !== null) {
    let masterReal = masterNorm;
    try {
      masterReal = await fs.realpath(masterNorm);
    } catch (e: unknown) {
      // the master dir does not exist yet — the CREATE path
      console.warn(`[artifact-scope] master dir realpath failed (the CREATE path): ${e instanceof Error ? e.message : String(e)}`);
    }
    if (parentReal !== masterReal && !parentReal.startsWith(masterReal + path.sep)) {
      return blocked('REPORT_SCOPE_BLOCKED', base, input.target);
    }
  }

  // THE FILENAME DETECTOR — the EXACT naming convention.
  const nameMatch = REPORT_FILENAME_RE.exec(base);
  if (nameMatch === null) {
    return blocked('REPORT_SCOPE_BLOCKED', base, input.target);
  }

  // THE VERSIONING STEP (§7.3:3409-3413) — an explicit overwrite of an EXISTING report is BLOCKED.
  try {
    await fs.stat(input.target);
    // The target EXISTS -> the explicit overwrite is BLOCKED (the N-versioning: v1 exists -> v2 allowed).
    return blocked('REPORT_SCOPE_BLOCKED', base, input.target);
  } catch (e: unknown) {
    // The target does NOT exist -> the CREATE path — ALLOW_REPORT.
    console.warn(`[artifact-scope] target stat failed (the CREATE path): ${e instanceof Error ? e.message : String(e)}`);
  }

  return allowed('MASTER_CONTEXT_TARGET', base, input.target, masterNorm);
}

/** THE ALLOW construction — the decision + the MPSE triplet (no triplet = no decision). */
function allowed(
  pattern: string, token: string, target: string, resolvedDir: string,
): ReportScopeDecision {
  const mPSE: MPSE = {
    Pattern: pattern,
    State: 'PARSED->ALLOW_REPORT',
    Evidence: target,
  };
  return {
    verdict: 'ALLOW_REPORT', state: 'ALLOW_REPORT', pattern, token, message: '', mPSE, triplet: mPSE,
    resolvedDir,
  };
}

/** THE BLOCK construction — the decision + the EXACT literal error (a CONSTANT, no interpolation). */
function blocked(pattern: string, token: string, target: string): ReportScopeDecision {
  const mPSE: MPSE = { Pattern: pattern, State: 'PARSED->BLOCKED', Evidence: target };
  return {
    verdict: 'BLOCKED', state: 'BLOCKED', pattern, token, message: REPORT_SCOPE_ERROR, mPSE, triplet: mPSE,
  };
}

/** THE HOOK — the tool.before entry: the BLOCK throws BEFORE the write (no write path at all). */
export async function enforceReportScope(
  input: { target: string },
  projectRoot: string,
  _ctx?: LexiconContext,
): Promise<ReportScopeDecision> {
  try {
    const decision = await classify(input, projectRoot);
    if (decision.verdict === 'BLOCKED') {
      throw new Error(REPORT_SCOPE_ERROR);
    }
    return decision;
  } catch (e: unknown) {
    console.warn(`[artifact-scope] enforceReportScope failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
