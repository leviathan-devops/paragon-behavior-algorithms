// src/subagents/trident-bug-hunter/tools/bug-hunt.ts
// THE BUG-HUNT ENTRY TOOL (W7, spec §5.2:2375-2381 — K7.1). The user-facing
// call that turns the micro-loop into a run: {targetPath, profilePath, model?,
// provider?, maxTokens?} → {runId, findingsCount, reportPath, state}. THE S2
// container scenario hits THIS tool ("run bug-hunt with targetPath=/workspace/
// fixture-profile, profilePath=.../profile.yaml" → the pass token
// bug_hunter_report_v1.md) — the tool result MUST carry the report path for the
// pass-token match (spec §6.7 S2).
//
// THE FAIL-CLOSED LAW (O3.5): the named errors propagate into the tool result's
// error field (PROFILE_INVALID / CORPUS_MISSING / ADAPTER_FAILED ... — never an
// uncaught throw, never a silent pass). The machine's INCONCLUSIVE is a RESULT
// (the fail-state), not an exception — the tool returns it as state: 'inconclusive'
// with the named error so the caller (the main agent) sees exactly why.
//
// THE ZOD RULE (trident-tools.ts:53-56 — "they replace zod .min() which crashes
// the opencode SDK's resolveTools"): NO .min()/.max() refinements. The schema
// uses the plain describe/default forms the existing tools use; the runtime
// validation is the loadProfile fail-closed loader + the machine's named errors.

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import {createMicroLoop} from '../harness/micro-loop-machine.ts';
import { acquireHuntLock, releaseHuntLock } from '../harness/hunt-lock.ts';

/** The tool's arg surface (spec §5.2:2375-2381 — the FULL surface exposed). */
export interface BugHuntArgs {
  targetPath: string;
  profilePath: string;
  model?: string;
  provider?: string;
  maxTokens?: number;
}

/** The tool's result — the run's outcome (the S2 pass token rides reportPath). */
export interface BugHuntResult {
  runId: string;
  state: 'done' | 'inconclusive';
  findingsCount: number;
  reportPath: string | null;
  fixOrder: string[];
  error: string | null;
}

/** Run the micro-loop to completion and return the result — fail-closed. */
export async function spawnBugHunterLoop(args: BugHuntArgs): Promise<BugHuntResult> {
  acquireHuntLock(args.targetPath);
  const machine = createMicroLoop({
    targetPath: args.targetPath,
    profilePath: args.profilePath,
  });
  try {
    machine.start({ type: 'START' });
    await machine.done();
    const { result } = machine.getSnapshot();
    return {
      runId: result.runId,
      state: result.state,
      findingsCount: result.findingsCount,
      reportPath: result.reportPath,
      fixOrder: result.fixOrder,
      error: result.error,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      runId: `hunt-failed-${Date.now()}`,
      state: 'inconclusive',
      findingsCount: 0,
      reportPath: null,
      fixOrder: [],
      error: message,
    };
  } finally {
    releaseHuntLock(args.targetPath);
  }
}

/** THE TOOL CREATOR — the trident-tools.ts registration consumes this. */
export function createBugHuntTool() {
  return tool({
    description:
      'Run a Graph Logic derailment hunt — populate the typed code graph, run L6 traversal + L7 verified tracing, produce grounded findings. The audit pipeline\'s first-class graph phase.',
    args: {
      targetPath: z.string().describe('Absolute path to the project root to hunt'),
      profilePath: z.string().describe('Absolute path to the project profile.yaml (the zod-validated contract)'),
      model: z.string().optional().describe('The report generation model (default: Muse Spark 1.2 Contributor on OpenCode Zen)'),
      provider: z.string().optional().describe('The report generation provider (default: OpenCode Go)'),
      maxTokens: z.number().optional().describe('The report generation token budget (default: the hardcoded 384000)'),
    },
    execute: async (args: BugHuntArgs): Promise<string> => {
      try {
        const result = await spawnBugHunterLoop(args);
        return JSON.stringify(result, null, 2);
      } catch (e: unknown) {
        console.warn(`[bug-hunt] failed: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
    },
  });
}
