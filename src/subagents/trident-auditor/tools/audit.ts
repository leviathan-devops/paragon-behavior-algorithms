// src/subagents/trident-auditor/tools/audit.ts
// THE AUDIT ENTRY (W9, K8.9, spec §5.2:2386-2388).
//
// THE ENTRY {targetPath, runId}: opens the shared DB, starts the audit-machine
// (SPECIFY reads the shared DB instantly — the no-reinjection law, C1.9: "the
// auditor can pick up where the bug hunter left off"), runs it to DONE |
// INCONCLUSIVE, and returns the enforcement result. The runId defaults to the
// latest BUILD_DONE event's runId (the passive-subscriber pickup) when omitted.
//
// THE RESULT CARRIES the conformanceZero — the LOGIC-LSP's clear condition
// (D25): the highlight clears ONLY when the auditor's verified verdicts are
// zero. A VIOLATED verdict keeps the highlight active.

import type { AuditMachineOptions, AuditMachineResult } from '../harness/audit-machine.ts';
import { createAuditMachine } from '../harness/audit-machine.ts';
import { openProjectSharedDb, type SharedDbClient } from '../shared/shared-db-client.ts';
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';

export interface AuditInput {
  targetPath: string;
  runId?: string;           // omitted → the latest BUILD_DONE event's runId
}

export interface AuditResult {
  state: 'done' | 'inconclusive';
  runId: string;
  verdicts: AuditMachineResult['verdicts'];
  conformanceZero: boolean;
  fixedFiles: string[];
  fixErrors: AuditMachineResult['fixErrors'];
  error: string | null;
}

/** Resolve the active runId from the events bus — the latest BUILD_DONE event
 *  (the passive-subscriber pickup, §4.11). A missing BUILD_DONE is the loud
 *  named error — the audit never runs on an absent report. */
export function activeRunId(client: SharedDbClient): string {
  const events = client.events();
  const buildDone = [...events].reverse().find(e => e.kind === 'BUILD_DONE');
  if (!buildDone) {
    throw new Error('AUDIT_NO_RUN: no BUILD_DONE event in the events table — the audit requires a completed build agent run');
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(buildDone.payload) as Record<string, unknown>;
  } catch (parseErr: unknown) {
    // v4.4.3 R10 FIX: log the original parse error before rethrowing — the
    // wrapped error keeps the JSON failure's context (cause) plus the log trace.
    console.error(`[audit] BUILD_DONE payload parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
    throw new Error(
      `AUDIT_NO_RUN: the BUILD_DONE payload is not valid JSON: ${buildDone.payload}`,
      { cause: parseErr instanceof Error ? parseErr : new Error(String(parseErr)) },
    );
  }
  if (typeof payload.runId !== 'string' || payload.runId.length === 0) {
    throw new Error('AUDIT_NO_RUN: the BUILD_DONE payload carries no runId');
  }
  return payload.runId;
}

/** THE AUDIT ENTRY — the audit-machine's launch surface. */
export async function audit(input: AuditInput, machineOptions: Partial<AuditMachineOptions> = {}): Promise<AuditResult> {
  const client = openProjectSharedDb(input.targetPath);
  try {
    const runId = input.runId ?? activeRunId(client);
    const options: AuditMachineOptions = {
      targetPath: input.targetPath,
      runId,
      client,
      ...machineOptions,
    };
    const machine = createAuditMachine(options);
    machine.start({ type: 'START' });
    await machine.done();
    const snapshot = machine.getSnapshot();
    const result = snapshot.result;
    return {
      state: snapshot.state,
      runId,
      verdicts: result.verdicts,
      conformanceZero: result.conformanceZero,
      fixedFiles: result.fixedFiles,
      fixErrors: result.fixErrors,
      error: result.error,
    };
  } finally {
    client.close();
  }
}

// THE PLATFORM TOOL WRAPPER (the W9 registration-gap fix 2026-08-12 — the §5.2
// mandate's trident-audit entry): the S6 container scenario's tool. The creator
// wraps the raw audit() — the SAME fail-closed machine, the tool surface. The
// agent configs granted 'trident-audit' at registration time but the tool was
// UNREACHABLE without this entry in the platform tool map — the gap fixed.
export function createAuditTool() {
  return tool({
    description:
      'Run the zero-trust audit machine: SPECIFY the declared contracts from the shared DB, EXTRACT the actual diff, CONFORM (CONFORMANT/VIOLATED/PARTIAL), FIX the PARTIAL verdicts via fix-apply, VERIFY the battery + the build, REPORT the verdicts + the AUDIT_DONE event.',
    args: {
      targetPath: z.string().describe('Absolute path to the project root to audit'),
      runId: z.string().optional().describe("The bug-hunt runId (default: the latest BUILD_DONE event's runId)"),
    },
    execute: async (args: AuditInput): Promise<string> => {
      try {
        const result = await audit(args);
        return JSON.stringify(result, null, 2);
      } catch (e: unknown) {
        console.warn(`[trident-audit] failed: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
    },
  });
}
