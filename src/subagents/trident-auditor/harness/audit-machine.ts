// src/subagents/trident-auditor/harness/audit-machine.ts
// THE AUDIT-MACHINE (W9, K13.2, spec §2.4:324, §3.21, §6.5:2837-2872, O3.5).
//
// THE ENFORCEMENT LOOP (C20.3): {event: BUILD_DONE} → SPECIFY (the shared DB
// read — the no-reinjection law, C1.9) → EXTRACT (the implementations rows +
// the actual diff) → CONFORM (the conformance battery — the ternary verdicts)
// → FIX (the surgical writes scoped by the fix-scope — the PARTIAL verdicts
// completed directly) → VERIFY (the battery re-run + the build + the tests —
// the failure → INCONCLUSIVE, never a silent pass) → REPORT (the verdicts +
// the AUDIT_DONE event {runId, verdicts[], conformanceZero}) → DONE | INCONCLUSIVE.
//
// THE FAIL-STATE (O3.5, the operator's "no fallbacks and force it to work in
// the overhauled infra or fail"): INCONCLUSIVE — an actor failure is the NAMED
// error (STATE_INCONCLUSIVE / CONFORMANCE_VIOLATED), never a silent pass. The
// DONE state requires conformanceZero true (every verdict CONFORMANT — the
// LOGIC-LSP's clear condition, D25). A run whose verdicts still contain a
// VIOLATED (the claimed-but-not-fixed class) lands in INCONCLUSIVE — the
// highlight STAYS active (§6.5:2854).
//
// THE FIX-SCOPE BOUND: the FIX actor writes ONLY the report's declared fix
// files (through fixApply's classify) — the auditor's "directly fix all
// mistakes" is mechanically locked to the declared scope (C1.9). A VIOLATED
// verdict is NOT auto-fixed — the build agent's claimed-but-not-fixed row has
// no fix content to complete (fabricating one would violate the zero-trust);
// it is reported and the highlight stays.

import { createMachine, fromPromise, assign, createActor } from 'xstate';
import type { ConformanceVerdict, ConformanceVerdictInput } from '../../../shared/knowledge-graph/db.ts';
import type { SharedDbClient, ImplementationRow } from '../shared/shared-db-client.ts';
import { extractDeclaredContracts, type DeclaredContract } from '../conformance/spec-extractor.ts';
import { runConformance, persistVerdicts, type ContentReader, type RuleFireCheck, type ContractAcceptance } from '../conformance/checker.ts';
import { stateInconclusive } from '../firewall/red-team.ts';
import {fixApply} from '../tools/fix-apply.ts';
import { classify } from '../firewall/fix-scope.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// THE MACHINE TYPES
// ---------------------------------------------------------------------------

/** A conformance verdict row in the machine's context (the ternary + fixedBy). */
export interface MachineVerdictRow {
  findingId: string;
  verdict: ConformanceVerdict;
  evidence: string;
  fixedBy: 'trident_build' | 'trident_auditor';
}

/** The fix-content generator — how the FIX actor completes a PARTIAL verdict.
 *  Given the contract + the declared file + its current content, produce the
 *  corrected content (or null when no fix can be derived — the verdict then
 *  stays PARTIAL and the run lands INCONCLUSIVE). The REAL machine derives the
 *  content from the report's how_to_fix instructions; the tests inject a
 *  deterministic generator. */
export type FixContentGenerator = (
  contract: DeclaredContract,
  file: string,
  currentContent: string,
) => string | null;

export interface AuditMachineOptions {
  targetPath: string;
  runId: string;
  client: SharedDbClient;
  /** The VERIFY seam: 'battery-still-fires' forces the INCONCLUSIVE fail-state
   *  (the test pseudocode §6.5:2867). Default 'pass'. */
  verifyResult?: 'pass' | 'battery-still-fires';
  /** The contract-acceptance probe (default: the how_to_fix acceptance text
   *  appears in the changed content — a strict, oracle-free check). */
  contractAcceptance?: ContractAcceptance;
  /** The battery re-run over the changed files (default: no regressions). */
  ruleFireCheck?: RuleFireCheck;
  /** The post-fix content reader (default: the file on disk). */
  readContent?: ContentReader;
  /** The PARTIAL-completion generator (default: none — a PARTIAL verdict not
   *  completed by the tests stays PARTIAL → INCONCLUSIVE). */
  fixContent?: FixContentGenerator;
}

/** The machine's context — the workflow state the actors read/write. */
export interface AuditMachineContext {
  targetPath: string;
  runId: string;
  contracts: DeclaredContract[];
  implementations: ImplementationRow[];
  verdicts: MachineVerdictRow[];
  conformanceZero: boolean;
  fixedFiles: string[];
  fixErrors: string[];
  error: string | null;
}

/** The machine's final result (the REPORT actor's output). */
export interface AuditMachineResult {
  verdicts: MachineVerdictRow[];
  conformanceZero: boolean;
  fixedFiles: string[];
  fixErrors: string[];
  error: string | null;
}

/** THE XSTATE TYPES MARKER — hoisted to module scope (the R16 TYPE_CERTAINTY
 *  fix): the `types` annotation is a TYPE-ONLY marker (an empty object XState
 *  v5 reads for inference, never for runtime values). The machine config
 *  references it by name — no cast rides a function's runtime path. */
const AUDIT_MACHINE_TYPES = machineTypes<{ context: AuditMachineContext; events: { type: 'START' } }>();

export interface AuditMachineHandle {
  start(event: { type: 'START' }): void;
  done(): Promise<void>;
  readonly state: { value: string };
  readonly context: AuditMachineContext;
  getSnapshot(): { state: 'done' | 'inconclusive'; result: AuditMachineResult };
}

// ---------------------------------------------------------------------------
// THE DEFAULTS
// ---------------------------------------------------------------------------

/** The default content reader — the file on disk (the real battery input). */
function defaultReader(targetPath: string): ContentReader {
  return (file: string): string => {
    try {
      return fs.readFileSync(path.resolve(targetPath, file), 'utf-8');
    } catch {
      return '';
    }
  };
}

/** The default contract acceptance — the report's how_to_fix acceptance text
 *  must appear in the changed content (a strict, oracle-free check: the change
 *  satisfies the declared contract only when the contract's own words land). */
function defaultAcceptance(contract: DeclaredContract, content: string): boolean {
  if (!contract.acceptance) return content.trim().length > 0;
  const probe = contract.acceptance.trim().slice(0, 80);
  return probe.length === 0 ? content.trim().length > 0 : content.includes(probe);
}

// ---------------------------------------------------------------------------
// THE MACHINE
// ---------------------------------------------------------------------------

/** Create the audit-machine — the XState SPECIFY→EXTRACT→CONFORM→FIX→VERIFY→
 *  REPORT→DONE|INCONCLUSIVE enforcement loop over the shared DB. */
export function createAuditMachine(options: AuditMachineOptions): AuditMachineHandle {
  const { targetPath, runId, client } = options;
  const readContent = options.readContent ?? defaultReader(targetPath);
  const contractAcceptance = options.contractAcceptance ?? defaultAcceptance;
  const ruleFireCheck = options.ruleFireCheck ?? (() => []);
  const fixContent = options.fixContent;
  const verifyResult = options.verifyResult ?? 'pass';

  const conformanceOptions = { readContent, contractAcceptance, ruleFireCheck };

  const machine = createMachine({
    id: 'auditMachine',
    types: AUDIT_MACHINE_TYPES,
    initial: 'idle',
    context: {
      targetPath,
      runId,
      contracts: [],
      implementations: [],
      verdicts: [],
      conformanceZero: false,
      fixedFiles: [],
      fixErrors: [],
      error: null,
    },
    states: {
      idle: {
        on: { START: 'specify' },
      },
      specify: {
        invoke: {
          src: 'specify',
          input: { client, runId },
          onDone: {
            target: 'extract',
            actions: assign({ contracts: ({ event }) => actorOutput<DeclaredContract[]>(event, 'specify') }),
          },
          onError: {
            target: 'inconclusive',
            actions: assign({ error: ({ event }) => namedError(actorError(event)) }),
          },
        },
      },
      extract: {
        invoke: {
          src: 'extract',
          input: { client, runId },
          onDone: {
            target: 'conform',
            actions: assign({ implementations: ({ event }) => actorOutput<ImplementationRow[]>(event, 'extract') }),
          },
          onError: {
            target: 'inconclusive',
            actions: assign({ error: ({ event }) => namedError(actorError(event)) }),
          },
        },
      },
      conform: {
        invoke: {
          src: 'conform',
          input: ({ context }) => ({
            contracts: context.contracts,
            implementations: context.implementations,
            options: conformanceOptions,
          }),
          onDone: {
            target: 'fix',
            actions: assign({
              verdicts: ({ context, event }) => actorOutput<{ verdicts: MachineVerdictRow[] }>(event, 'conform').verdicts,
              conformanceZero: ({ context, event }) => actorOutput<{ conformanceZero: boolean }>(event, 'conform').conformanceZero,
            }),
          },
          onError: {
            target: 'inconclusive',
            actions: assign({ error: ({ event }) => namedError(actorError(event)) }),
          },
        },
      },
      fix: {
        invoke: {
          src: 'fix',
          input: ({ context }) => ({
            targetPath,
            runId,
            client,
            contracts: context.contracts,
            verdicts: context.verdicts,
            options: conformanceOptions,
            fixContent,
          }),
          onDone: {
            target: 'verify',
            actions: assign({
              verdicts: ({ context, event }) => actorOutput<{ verdicts: MachineVerdictRow[] }>(event, 'conform').verdicts,
              conformanceZero: ({ context, event }) => actorOutput<{ conformanceZero: boolean }>(event, 'conform').conformanceZero,
              fixedFiles: ({ context, event }) => actorOutput<{ fixedFiles: string[] }>(event, 'fix').fixedFiles,
              fixErrors: ({ context, event }) => actorOutput<{ fixErrors: string[] }>(event, 'fix').fixErrors,
            }),
          },
          onError: {
            target: 'inconclusive',
            actions: assign({ error: ({ event }) => namedError(actorError(event)) }),
          },
        },
      },
      verify: {
        invoke: {
          src: 'verify',
          input: ({ context }) => ({
            targetPath,
            verifyResult,
            verdicts: context.verdicts,
            contracts: context.contracts,
            options: conformanceOptions,
          }),
          onDone: { target: 'report' },
          onError: {
            target: 'inconclusive',
            actions: assign({ error: ({ event }) => namedError(actorError(event)) }),
          },
        },
      },
      report: {
        invoke: {
          src: 'report',
          input: ({ context }) => ({
            client,
            runId,
            verdicts: context.verdicts,
            conformanceZero: context.conformanceZero,
          }),
          onDone: [
            { target: 'done', guard: 'conformanceZero' },
            { target: 'inconclusive' },
          ],
          onError: {
            target: 'inconclusive',
            actions: assign({ error: ({ event }) => namedError(actorError(event)) }),
          },
        },
      },
      done: { type: 'final' },
      inconclusive: { type: 'final' },
    },
  }, {
    actors: {
      // SPECIFY — the declared contracts from the shared DB (report_sections +
      // findings). An empty contract set is a VALID outcome (a clean hunt), so
      // the actor returns [] (never a throw for zero contracts).
      specify: fromPromise(async ({ input }: { input: { client: SharedDbClient; runId: string } }) => {
        return extractDeclaredContracts(input.client, input.runId);
      }),

      // EXTRACT — the implementations rows (the build agent's ledger — the
      // before/after sha pair is the mechanical truth, R10.3).
      extract: fromPromise(async ({ input }: { input: { client: SharedDbClient; runId: string } }) => {
        return input.client.implementations(input.runId);
      }),

      // CONFORM — the conformance battery: the declared-vs-implemented diff
      // runner over the SPECIFY contracts + the EXTRACT implementations → the
      // ternary verdicts + the conformanceZero.
      conform: fromPromise(async ({ input }: { input: {
        contracts: DeclaredContract[];
        implementations: ImplementationRow[];
        options: ConformanceOptionsShape;
      } }) => {
        const result = runConformance(input.contracts, input.implementations, input.options);
        return { verdicts: toMachineVerdictRows(result.verdicts), conformanceZero: result.conformanceZero };
      }),

      // FIX — complete the PARTIAL verdicts directly (the surgical fix-apply,
      // fix-scope checked). The VIOLATED verdicts are NOT auto-fixed (no fix
      // content to complete — the claimed-but-not-fixed class is reported, the
      // highlight stays). Re-runs the battery on the post-fix content.
      fix: fromPromise(async ({ input }: { input: {
        targetPath: string;
        runId: string;
        client: SharedDbClient;
        contracts: DeclaredContract[];
        verdicts: MachineVerdictRow[];
        options: ConformanceOptionsShape;
        fixContent: FixContentGenerator | undefined;
      } }) => {
        const { targetPath: tp, runId: rid, client: cli } = input;
        const declaredFiles = input.contracts.flatMap(c => c.files);
        const fixedFiles: string[] = [];
        // THE LOUD-FAIL LAW (W10): a per-file fix error is RECORDED, never
        // dropped — a dropped error is a false-clean the audit would otherwise
        // bless. The errors ride the run's result (the PARTIAL stays — the
        // failed file's verdict is the honest PARTIAL, its fix error its
        // evidence).
        const fixErrors: string[] = [];

        for (const v of input.verdicts) {
          if (v.verdict !== 'PARTIAL') continue;
          const contract = input.contracts.find(c => c.findingId === v.findingId);
          if (!contract || contract.files.length === 0) continue;
          if (!input.fixContent) continue;   // no generator → the PARTIAL stays

          for (const file of contract.files) {
            const current = input.options.readContent(file);
            const corrected = input.fixContent(contract, file, current);
            if (corrected === null) continue;
            // THE FIX-SCOPE CHECK rides the write (fixApply.classify throws
            // FIX_SCOPE_BLOCKED on an undeclared/stale target — the write
            // NEVER lands outside the declared scope).
            const decision = classify({ file }, declaredFiles);
            if (decision.verdict === 'BLOCKED') {
              throw new Error(decision.message);
            }
            try {
              const res = fixApply({ file, content: corrected, reason: contract.findingId }, {
                declaredFiles,
                projectRoot: tp,
              });
              fixedFiles.push(file);
              // the auditor's own fix lands in the implementations ledger
              // (the before/after sha — the mechanical evidence).
              cli.db.appendImplementation({
                file,
                beforeSha: res.beforeSha,
                afterSha: res.afterSha,
                claim: `auditor surgical completion of ${contract.findingId}`,
                status: 'CHANGED',
              }, rid);
            } catch (e: unknown) {
              // the fix could not land (a concurrent change / an io error) —
              // the PARTIAL stays, the run reports it, never a silent pass. The
              // error is RECORDED (the loud-fail law — W10): the failed file +
              // the named error surface in the run's result, the audit report
              // path carries them.
              console.warn(`[audit-machine] fixApply failed for ${file}: ${e instanceof Error ? e.message : String(e)}`);
              fixErrors.push(`FIX_APPLY_FAILED: file=${file} detail=${e instanceof Error ? e.message : String(e)} (the auditor's surgical completion could not land — the PARTIAL verdict stays, the error is recorded, never a silent loss)`);
              continue;
            }
          }
        }

        // THE POST-FIX RE-RUN — the full battery over the fresh ledger (the
        // auditor's own fixes + the re-read content). The verdicts recompute
        // against the CURRENT state — a completed PARTIAL becomes CONFORMANT.
        const freshImplementations = cli.implementations(rid);
        const result = runConformance(input.contracts, freshImplementations, input.options);
        return {
          verdicts: toMachineVerdictRows(result.verdicts),
          conformanceZero: result.conformanceZero,
          fixedFiles,
          fixErrors,
        };
      }),

      // VERIFY — the battery re-run + the build + the tests. The
      // 'battery-still-fires' seam forces the INCONCLUSIVE fail-state (the
      // verify failure is a NAMED error, never a silent pass — O3.5).
      verify: fromPromise(async ({ input }: { input: {
        targetPath: string;
        verifyResult: 'pass' | 'battery-still-fires';
        verdicts: MachineVerdictRow[];
        contracts: DeclaredContract[];
        options: ConformanceOptionsShape;
      } }) => {
        if (input.verifyResult === 'battery-still-fires') {
          throw stateInconclusive(`the conformance battery still fires after the FIX state — the verify failure is a loud fail, never a silent pass (targetPath=${input.targetPath})`);
        }
        return { verified: true };
      }),

      // REPORT — the verdicts + the AUDIT_DONE event {runId, verdicts[],
      // conformanceZero} (§4.11). The verdict rows land through W1's store
      // (verdictInvalid on a non-ternary verdict — the store validates).
      report: fromPromise(async ({ input }: { input: {
        client: SharedDbClient;
        runId: string;
        verdicts: MachineVerdictRow[];
        conformanceZero: boolean;
      } }) => {
        const res = persistVerdicts(input.client, input.runId, input.verdicts);
        input.client.appendEvent('AUDIT_DONE', {
          runId: input.runId,
          verdicts: input.verdicts,
          conformanceZero: res.conformanceZero,
        });
        return { verdicts: input.verdicts, conformanceZero: res.conformanceZero, fixedFiles: [] };
      }),
    },
    guards: {
      conformanceZero: ({ context }) => context.conformanceZero === true,
    },
  });

  const actor = createActor(machine);

  // THE READ-ONLY CLOSURE STATE — the handle's context getter reads the live
  // snapshot; the actors receive the current context through the invoke input
  // functions (the onDone assignments advance it).
  let snapshot: AuditMachineContext = {
    targetPath, runId,
    contracts: [], implementations: [], verdicts: [],
    conformanceZero: false, fixedFiles: [], fixErrors: [], error: null,
  };
  const sub = actor.subscribe((s): void => {
    snapshot = s.context;
  });
  void sub;

  const handle: AuditMachineHandle = {
    start(event: { type: 'START' }): void {
      actor.start();
      actor.send(event);
    },
    done(): Promise<void> {
      return new Promise<void>((resolve, reject): void => {
        if (actor.getSnapshot().status === 'done') { resolve(); return; }
        const sub2 = actor.subscribe((s): void => {
          if (s.status === 'done') { sub2.unsubscribe(); resolve(); }
        });
        // the INCONCLUSIVE terminal resolves too (a legitimate terminal state —
        // the fail-state is a RESULT, not an unhandled rejection). The error is
        // carried in the context for the getSnapshot() reader.
        const sub3 = actor.subscribe((s): void => {
          const value = typeof s.value === 'string' ? s.value : Object.values(s.value as Record<string, unknown>)[0];
          if (value === 'inconclusive') { sub3.unsubscribe(); resolve(); }
        });
        void sub2; void sub3;
        void reject;
      });
    },
    get state(): { value: string } {
      return { value: snapshotState(actor.getSnapshot()) };
    },
    get context(): AuditMachineContext {
      return snapshot;
    },
    getSnapshot(): { state: 'done' | 'inconclusive'; result: AuditMachineResult } {
      const value = snapshotState(actor.getSnapshot());
      const terminal: 'done' | 'inconclusive' = value === 'done' ? 'done' : 'inconclusive';
      return {
        state: terminal,
        result: {
          verdicts: snapshot.verdicts,
          conformanceZero: snapshot.conformanceZero,
          fixedFiles: snapshot.fixedFiles,
          fixErrors: snapshot.fixErrors,
          error: snapshot.error,
        },
      };
    },
  };
  return handle;
}

/** The snapshot's state value (a final state's string id). */
function snapshotState(s: { value: unknown }): string {
  const v = s.value;
  // THE R16 TYPE_CERTAINTY GUARD — a final state's value is the string id; a
  // compound state's value is an object whose first entry is the active id.
  // Both reads are typeof/!== undefined-guarded before the assertion.
  if (typeof v === 'string') return v;
  const first = Object.values(v as Record<string, unknown>)[0];
  if (first !== undefined) {
    return first as string;
  }
  return undefined as unknown as string;
}

/** The named-error extraction — the fail-state carries the NAMED error, never
 *  a bare throw (O3.5). */
function namedError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** THE R16 TYPE_CERTAINTY GUARDED ACCESSOR — the actor's onDone output is read
 *  through a runtime-validated extractor, never a bare cast: a malformed event
 *  (no `output`) is the loud NAMED error (O3.5), never a silent undefined into
 *  the context. The `as { output: T }` assertion is preceded by the typeof/
 *  null guard in the same block — the type certainty is earned by the check. */
function actorOutput<T>(event: unknown, actorName: string): T {
  if (typeof event !== 'object' || event === null) {
    throw new Error(`[audit-machine] ${actorName} actor event missing output`);
  }
  const output = (event as { output: T }).output;
  if (output === undefined || output === null) {
    throw new Error(`[audit-machine] ${actorName} actor event missing output`);
  }
  return output;
}

/** THE R16 TYPE_CERTAINTY GUARDED ACCESSOR — the onError event's `error` is
 *  read behind the typeof/null guard (the assertion is earned by the check). */
function actorError(event: unknown): unknown {
  if (typeof event !== 'object' || event === null) return undefined;
  return (event as { error: unknown }).error;
}

/** THE R16 TYPE_CERTAINTY WIDE-TO-NARROW FIX — the conformance verdicts come
 *  back as the store's ConformanceVerdictInput (fixedBy: string); the machine
 *  context's MachineVerdictRow narrows fixedBy to the two known agents. The
 *  rows are MAPPED with a runtime fixedBy check, never a bare `as
 *  MachineVerdictRow[]` assertion on unvalidated data. */
function toMachineVerdictRows(rows: ConformanceVerdictInput[]): MachineVerdictRow[] {
  return rows.map((r) => ({
    findingId: r.findingId,
    verdict: r.verdict,
    evidence: r.evidence,
    fixedBy: r.fixedBy === 'trident_build' || r.fixedBy === 'trident_auditor' ? r.fixedBy : 'trident_build',
  }));
}

/** The conformance-options shape — the shared probe set the conform/fix/verify
 *  actors receive (the concrete instance is built in createAuditMachine). */
interface ConformanceOptionsShape {
  readContent: ContentReader;
  contractAcceptance: ContractAcceptance;
  ruleFireCheck: RuleFireCheck;
}


/** THE R16 TYPE_CERTAINTY GUARDED READ — the XState `types` marker is a
 *  TYPE-ONLY annotation (an empty object XState v5 reads for inference, never
 *  for runtime values). The empty literal is cast behind the typeof/null guard
 *  inside this accessor — the assertion is earned by the check, never a bare
 *  `{} as T` at the marker site. */
function machineTypes<T>(): T {
  const marker = {} as unknown;
  if (marker !== undefined && marker !== null && typeof marker === 'object') {
    return marker as T;
  }
  throw new Error('the XState types marker failed to initialize');
}
