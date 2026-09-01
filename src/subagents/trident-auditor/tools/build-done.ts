// src/subagents/trident-auditor/tools/build-done.ts
// THE BUILD_DONE PRODUCER (W9, spec §5.5:2448 — the step-4 seam the S6 loop
// skipped: "The build agent writes the `implementations` rows → {kind:
// 'BUILD_DONE'}").
//
// THE SEAM: the audit's entry gates are BOTH halves of that sentence.
// activeRunId() throws AUDIT_NO_RUN on an absent BUILD_DONE event
// (tools/audit.ts:41 — "no BUILD_DONE event in the events table"), and the
// EXTRACT actor reads the implementations rows the flow never writes
// (audit-machine.ts:295-297) — a declared contract with no implementation row
// is VIOLATED by the conformance battery (checker.ts:177-185). The hunt side
// emits HUNT_DONE and stops; without THIS producer the build→audit link is
// unprovable and S6 has no runtime proof.
//
// THE MECHANISM: each supplied fix is applied through fix-apply (the atomic
// temp+rename write + the REAL before/after sha pair — the mechanical truth,
// R10.3, spec §4.12:2218 "fix-apply | implementations | the surgical write's
// before/after sha"). The fix-scope lock rides every write: a fix targeting a
// file the report never declared throws FIX_SCOPE_BLOCKED and the write NEVER
// lands (the auditor's own fail-closed contract, fix-scope.ts). The recorded
// implementations rows + the BUILD_DONE event {runId, implementations:
// [{file, beforeSha, afterSha, claim}]} are the §4.11:2189 payload shape.
//
// THE RUNID THREADING: the runId is an INPUT — the caller MUST thread the
// HUNT_DONE runId (a mismatch silently breaks the §5.5 Hydra flow). The
// buildDone step never invents a runId.

import type { SharedDbClient } from '../shared/shared-db-client.ts';
import { openProjectSharedDb } from '../shared/shared-db-client.ts';
import { extractDeclaredContracts } from '../conformance/spec-extractor.ts';
import { fixApply } from './fix-apply.ts';
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';

/** A build-agent fix application — the fix-apply input + the claim. */
export interface BuildFixInput {
  file: string;       // the project-root-relative path of the declared fix file
  content: string;    // the build agent's post-fix content
  claim: string;      // the build agent's prose claim (the auditor re-verifies, never trusts)
}

export interface BuildDoneInput {
  targetPath: string;
  runId: string;      // MUST equal the HUNT_DONE runId — the §5.5 Hydra threading
  fixes: BuildFixInput[];
}

/** The §4.11:2189 implementations entry — the event payload shape. */
export interface BuildDoneImplementation {
  file: string;
  beforeSha: string;
  afterSha: string;
  claim: string;
}

export interface BuildDoneResult {
  runId: string;
  implementations: BuildDoneImplementation[];
  /** The appended BUILD_DONE event's row id (the events-table anchor). */
  eventId: number;
}

/** THE BUILD_DONE PRODUCER — apply the build agent's declared fixes through
 *  fix-apply (the real sha pair — never fabricated), record the implementations
 *  rows (status CHANGED), append the BUILD_DONE event. Repeats the machine's
 *  own FIX-actor pattern (audit-machine.ts:346-359) — the declared-files
 *  fix-scope lock rides every write. A zero-fix run (a clean hunt) appends
 *  BUILD_DONE with implementations: [] — the audit then runs to conformance
 *  zero with verdicts: [] (the §4.11 clean-hunt variant). */
export function buildDone(input: BuildDoneInput): BuildDoneResult {
  const client: SharedDbClient = openProjectSharedDb(input.targetPath);
  try {
    // THE SPECIFY READ — the same declared-contracts read the audit's SPECIFY
    // actor uses (spec-extractor.ts:76); the union of the declared fix files is
    // the fix-scope allowlist the build agent's writes are locked to.
    const contracts = extractDeclaredContracts(client, input.runId);
    const declaredFiles = [...new Set(contracts.flatMap(c => c.files))];

    const implementations: BuildDoneImplementation[] = [];
    for (const fix of input.fixes) {
      // fix-apply throws FIX_SCOPE_BLOCKED on an undeclared/stale target — the
      // write NEVER lands outside the report's declared fix files. The before/
      // after sha pair is computed from the REAL fixture state at apply time.
      const res = fixApply(
        { file: fix.file, content: fix.content, reason: input.runId },
        { declaredFiles, projectRoot: input.targetPath },
      );
      client.appendImplementation({
        file: res.file,
        beforeSha: res.beforeSha,
        afterSha: res.afterSha,
        claim: fix.claim,
        status: 'CHANGED',
      }, input.runId);
      implementations.push({
        file: res.file,
        beforeSha: res.beforeSha,
        afterSha: res.afterSha,
        claim: fix.claim,
      });
    }

    // THE §4.11:2189 BUILD_DONE PAYLOAD — {runId, implementations[{file,
    // beforeSha, afterSha, claim}]} — the spec's exact event shape.
    client.appendEvent('BUILD_DONE', { runId: input.runId, implementations });

    const buildDoneEvents = client.events().filter(e => e.kind === 'BUILD_DONE');
    const eventId = buildDoneEvents[buildDoneEvents.length - 1]?.id ?? -1;
    return { runId: input.runId, implementations, eventId };
  } finally {
    client.close();
  }
}

// THE PLATFORM TOOL WRAPPER — the S6 container scenario's BUILD_DONE producer
// (the §5.5 step-4 surface the container operator drives before the audit).
export function createBuildDoneTool() {
  return tool({
    description:
      'The BUILD_DONE producer (the §5.5 step-4 seam): apply the build agent\'s declared fixes through fix-apply (the REAL before/after sha pair), write the implementations rows, append the BUILD_DONE event {runId, implementations:[{file, beforeSha, afterSha, claim}]}. The runId MUST equal the HUNT_DONE runId.',
    args: {
      targetPath: z.string().describe('Absolute path to the project root to build'),
      runId: z.string().describe("The bug-hunt runId (MUST equal the HUNT_DONE event's runId)"),
      fixes: z.array(z.object({
        file: z.string().describe('The declared fix file (project-root-relative — MUST be in the report\'s declared fix files)'),
        content: z.string().describe('The build agent\'s post-fix content'),
        claim: z.string().describe('The build agent\'s prose claim (the auditor re-verifies, never trusts)'),
      })).describe('The build agent\'s fix applications'),
    },
    execute: async (args: BuildDoneInput): Promise<string> => {
      const result = buildDone(args);
      return JSON.stringify(result, null, 2);
    },
  });
}
