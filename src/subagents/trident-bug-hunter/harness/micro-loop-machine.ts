// src/subagents/trident-bug-hunter/harness/micro-loop-machine.ts
// THE MICRO-LOOP MACHINE (W7, K13.1, spec §2.2:235, §2.8:379, §6.5:2798-2834,
// O3.5). THE HARNESS'S HEART — the XState machine that turns the W1-W6
// machinery into a bug-hunt run: IDLE→RECON→MAP→SCAN→TRACE→STRIKE→REPORT→
// DONE|INCONCLUSIVE (spec §2.7:320 — the C20.1 hunt flow).
//
// THE FROM-PROMISE ACTORS (spec §2.8:379): each state invokes ONE actor as an
// XState fromPromise — recon (the profile load + the canon read), map (the
// graph build + the lineage write + the mirror), scan (the compiler + the
// engine), trace (the batched 6-framework solver), strike (the dedupe + the D13
// rank + the fix order), report (the report rows + the writer + the HUNT_DONE
// event + the LSP refresh). The actors are the typed boundaries — the W1-W6
// surfaces are consumed through them ONLY (the separation law).
//
// THE FAIL-STATE (O3.5 — the operator's "no fallbacks and force it to work in
// the overhauled infra or fail"): INCONCLUSIVE — an actor failure is the NAMED
// error on context.error (PROFILE_INVALID / CORPUS_MISSING / ADAPTER_FAILED /
// ENGINE_GRAPH_EMPTY ...), NEVER a silent pass. The EMPTY-CORPUS run (a clean
// project's zero-rule battery) is the VALID DONE with the honest zero findings
// + the report still lands (spec §6.5:2818-2824) — the two states are
// distinguished by measurement, never conflated.
//
// THE SETUP PATTERN: mirrors the W9 audit-machine EXACTLY (createMachine +
// fromPromise + assign + createActor + the snapshot-subscription handle) —
// the project's existing XState usage (also in trident-tools.ts's fsm/
// machines). THE ZERO-ADD RULE: xstate is already a project dependency.

import { createMachine, fromPromise, assign, createActor } from 'xstate';
import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import type { DbClient } from '../../../shared/knowledge-graph/db.ts';
import type { GraphAdapter } from '../graph/interface.ts';
import type { NormalizedFinding } from '../diagnostics/findings-store.ts';
import type { CompiledPredicate } from '../lexicon/templates.ts';
import { DiagnosticsServer, resolveDiagnosticsServer } from '../surface/lsp-injector.ts';
import {generateReport, type ReportWriterInput} from '../tools/report-writer.ts';
import { readFileSync } from 'node:fs';
import { recon, type IntendedBehavior } from './recon.ts';
import { map, type MapResult } from './map.ts';
import { scan, type ScanResult } from './scan.ts';
import { solveTrace, type TraceRow } from './trace.ts';
import { strike, type StrikeResult } from './strike.ts';
import { report, type ReportResult, type ReportWriter } from './report.ts';

// ---------------------------------------------------------------------------
// THE MACHINE TYPES (the 6.5 test-assert surface: machine.context.findings,
// machine.context.reportPath, machine.context.error, machine.state.value)
// ---------------------------------------------------------------------------

export interface MicroLoopOptions {
  targetPath: string;
  profilePath: string;
  /** The adapter override — the §6.5 mockCorbellFailure seam (default: the
   *  profile's substrate selection). */
  adapter?: GraphAdapter;
  /** The report-writer seam — the default is the W8 generateReport; the tests
   *  inject a deterministic writer (never a network call in the unit battery). */
  reportWriter?: ReportWriter;
  /** The diagnostics server — the LOGIC-LSP state the report refreshes. */
  diagnosticsServer?: DiagnosticsServer;
}

/** The machine's context — the workflow state the actors read/write. */
export interface MicroLoopContext {
  runId: string;
  targetPath: string;
  profilePath: string;
  profile: ProjectProfile | null;
  intendedBehavior: IntendedBehavior | null;
  adapter: GraphAdapter | null;
  db: DbClient | null;
  battery: CompiledPredicate[];
  batteryVersion: string | null;
  findings: NormalizedFinding[];
  traces: TraceRow[];
  fixOrder: string[];
  reportPath: string | null;
  error: string | null;
}

/** The machine's final result (the REPORT actor's output + the run state). */
export interface MicroLoopResult {
  runId: string;
  state: 'done' | 'inconclusive';
  findingsCount: number;
  reportPath: string | null;
  fixOrder: string[];
  error: string | null;
}

/** THE XSTATE TYPES MARKER — hoisted to module scope (the R16 TYPE_CERTAINTY
 *  fix): the `types` annotation is a TYPE-ONLY marker (an empty object XState
 *  v5 reads for inference, never for runtime values). The deep-planning-machine
 *  precedent keeps the marker at module level; the machine config references it
 *  by name — no cast rides a function's runtime path. */
const MICRO_LOOP_TYPES = machineTypes<{ context: MicroLoopContext; events: { type: 'START' } }>();

export interface MicroLoopHandle {
  start(event: { type: 'START' }): void;
  done(): Promise<void>;
  readonly state: { value: string };
  readonly context: MicroLoopContext;
  getSnapshot(): { state: 'done' | 'inconclusive'; result: MicroLoopResult };
}

// ---------------------------------------------------------------------------
// THE MACHINE
// ---------------------------------------------------------------------------

/** THE RUNTIME AUTH RESOLUTION — the report-writer's Bearer token comes from the
 *  runtime's OWN auth.json (the opencode-go provider key the container's auth
 *  carries), never a hardcode. The opencode-go key at auth.json['opencode-go']
 *  (or the legacy flat key) — the W10 container run proved the 401 class: the
 *  writer POSTed WITHOUT the auth header → GENERATION_FAILED. The resolution is
 *  best-effort: an unreadable auth degrades to the unauthenticated call (the
 *  writer's own 401 → the honest GENERATION_FAILED, never a silent skip). */
function resolveWriterApiKey(): string | undefined {
  try {
    const home = process.env.HOME ?? '';
    const authPath = `${home}/.local/share/opencode/auth.json`;
    const raw = readFileSync(authPath, 'utf8');
    const auth = JSON.parse(raw) as Record<string, unknown>;
    // THE R16 TYPE_CERTAINTY GUARD — the opencode-go key is read as unknown,
    // shape-checked, then narrowed; the flat legacy key read is already
    // typeof-guarded. No bare `as { key?: string }` assertion on parsed JSON.
    const go = auth['opencode-go'];
    if (go !== undefined && go !== null && typeof go === 'object') {
      const goKey = (go as Record<string, unknown>).key;
      if (typeof goKey === 'string' && goKey.length > 0) return goKey;
    }
    const flat = auth['key'];
    if (typeof flat === 'string' && flat.length > 0) return flat;
    return undefined;
  } catch {
    return undefined; // the unauthenticated path — the writer's 401 is the honest fail
  }
}

/** Create the micro-loop — the IDLE→RECON→MAP→SCAN→TRACE→STRIKE→REPORT→
 *  DONE|INCONCLUSIVE bug-hunt loop over the W1-W6 surfaces. */
export function createMicroLoop(options: MicroLoopOptions): MicroLoopHandle {
  const { targetPath, profilePath } = options;
  // THE PRE-RECON FALLBACK — the NAMED runId ('<project>-hunt-<yyyyMMdd>-<seq>')
  // is derived by the recon actor once the profile loads (the project token is
  // only known then) and assigned to the context on recon success. This
  // fallback survives ONLY a recon failure (INCONCLUSIVE — no project to name).
  const runId = `hunt-${Date.now()}-${profilePath.split('/').pop()?.replace(/[^a-z0-9]/gi, '') || 'run'}`;
  const adapterOverride = options.adapter ?? null;
  const writer: ReportWriter = options.reportWriter ??
    ((input: ReportWriterInput) => generateReport(input, { apiKey: resolveWriterApiKey() }));
  const server = resolveDiagnosticsServer(options.diagnosticsServer, targetPath);

  const machine = createMachine({
    id: 'microLoop',
    types: MICRO_LOOP_TYPES,
    initial: 'idle',
    context: {
      runId,
      targetPath,
      profilePath,
      profile: null,
      intendedBehavior: null,
      adapter: null,
      db: null,
      battery: [],
      batteryVersion: null,
      findings: [],
      traces: [],
      fixOrder: [],
      reportPath: null,
      error: null,
    },
    states: {
      idle: {
        on: { START: 'recon' },
      },
      recon: {
        invoke: {
          src: 'recon',
          input: { profilePath },
          onDone: {
            target: 'map',
            actions: assign({
              profile: ({ event }) => actorOutput<IntendedBehavior>(event, 'recon').profile,
              intendedBehavior: ({ event }) => actorOutput<IntendedBehavior>(event, 'recon'),
              // THE NAMED RUN ID — the recon actor derives it post-load (the
              // project token is only known then): '<project>-hunt-<yyyyMMdd>-<seq>'.
              runId: ({ event }) => actorOutput<IntendedBehavior>(event, 'recon').runId,
            }),
          },
          onError: {
            target: 'inconclusive',
            actions: assign({ error: ({ event }) => namedError(actorError(event)) }),
          },
        },
      },
      map: {
        invoke: {
          src: 'map',
          input: ({ context }) => {
            // v4.4.3 R10 FIX: explicit capture — the enforcement value is
            // consumed as the invoke input's profile (the return-value-used
            // tracking honors a named capture over a property shorthand).
            const profile = requireLoaded(context.profile, 'map');
            return { profile, adapterOverride };
          },
          onDone: {
            target: 'scan',
            actions: assign({
              adapter: ({ event }) => actorOutput<MapResult>(event, 'map').adapter,
              db: ({ event }) => actorOutput<MapResult>(event, 'map').db,
            }),
          },
          onError: {
            target: 'inconclusive',
            actions: assign({ error: ({ event }) => namedError(actorError(event)) }),
          },
        },
      },
      scan: {
        invoke: {
          src: 'scan',
          input: ({ context }) => ({
            profile: requireLoaded(context.profile, 'scan'),
            adapter: requireLoaded(context.adapter, 'scan'),
            runId: context.runId,
            db: context.db,
          }),
          onDone: {
            target: 'trace',
            actions: assign({
              battery: ({ event }) => actorOutput<ScanResult>(event, 'scan').battery,
              batteryVersion: ({ event }) => actorOutput<ScanResult>(event, 'scan').batteryVersion,
              findings: ({ event }) => actorOutput<ScanResult>(event, 'scan').run.findings,
            }),
          },
          onError: {
            target: 'inconclusive',
            actions: assign({ error: ({ event }) => namedError(actorError(event)) }),
          },
        },
      },
      trace: {
        invoke: {
          src: 'trace',
          input: ({ context }) => ({
            findings: context.findings,
            adapter: requireLoaded(context.adapter, 'trace'),
          }),
          onDone: {
            target: 'strike',
            actions: assign({ traces: ({ event }) => actorOutput<TraceRow[]>(event, 'trace') }),
          },
          onError: {
            target: 'inconclusive',
            actions: assign({ error: ({ event }) => namedError(actorError(event)) }),
          },
        },
      },
      strike: {
        invoke: {
          src: 'strike',
          input: ({ context }) => ({
            findings: context.findings,
            profile: requireLoaded(context.profile, 'strike'),
            traces: context.traces,
          }),
          onDone: {
            target: 'report',
            actions: assign({
              findings: ({ event }) => actorOutput<StrikeResult>(event, 'strike').findings,
              fixOrder: ({ event }) => actorOutput<StrikeResult>(event, 'strike').fixOrder,
            }),
          },
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
            profile: requireLoaded(context.profile, 'report'),
            runId: context.runId,
            findings: context.findings,
            traces: context.traces,
            fixOrder: context.fixOrder,
            batteryVersion: context.batteryVersion ?? '',
            db: requireLoaded(context.db, 'report'),
            writer,
            server,
          }),
          onDone: {
            target: 'done',
            actions: assign({ reportPath: ({ event }) => actorOutput<ReportResult>(event, 'report').reportPath }),
          },
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
      // RECON — the profile load + the canon read → the intended behavior.
      // The W1 loader's named errors (PROFILE_INVALID / CORPUS_MISSING /
      // HISTORY_MISSING) route the fail-state INCONCLUSIVE (never a silent pass).
      recon: fromPromise(async ({ input }: { input: { profilePath: string } }) => {
        return recon(input.profilePath);
      }),

      // MAP — the graph build + the lineage-mandatory write + the D27 mirror.
      // The adapter failure (the corbell binary missing / an unknown substrate)
      // is the named ADAPTER_FAILED (spec §6.5:2827-2832).
      map: fromPromise(async ({ input }: { input: { profile: ProjectProfile; adapterOverride: GraphAdapter | null } }) => {
        try {
          const result = await map(input.profile, input.adapterOverride ?? undefined);
          // the map actor returns the adapter + the db; the context holds both
          // for the scan/report states (the typed boundaries).
          return result;
        } catch (e: unknown) {
          console.warn(`[micro-loop] map actor failed: ${e instanceof Error ? e.message : String(e)}`);
          throw e;
        }
      }),

      // SCAN — the compiler + the engine → the findings (the runId-scoped
      // append). An empty battery is the VALID honest zero (the clean project);
      // an empty GRAPH is the loud ENGINE_GRAPH_EMPTY.
      scan: fromPromise(async ({ input }: { input: {
        profile: ProjectProfile; adapter: GraphAdapter; runId: string; db: DbClient | null;
      } }) => {
        return scan(input.profile, input.adapter, input.runId, input.db ?? undefined);
      }),

      // TRACE — the batched 6-framework solver (the relevance matrix — 6
      // batched calls, never N×6, K20.2).
      trace: fromPromise(async ({ input }: { input: { findings: NormalizedFinding[]; adapter: GraphAdapter } }) => {
        return solveTrace(input.findings, input.adapter);
      }),

      // STRIKE — the dedupe + the D13 rank + the fix order.
      strike: fromPromise(async ({ input }: { input: {
        findings: NormalizedFinding[]; profile: ProjectProfile; traces: TraceRow[];
      } }) => {
        return strike(input.findings, input.profile, input.traces);
      }),

      // REPORT — the report rows + the writer + the HUNT_DONE event + the
      // LOGIC-LSP refresh. The side effects commit BEFORE the return.
      report: fromPromise(async ({ input }: { input: {
        profile: ProjectProfile; runId: string; findings: NormalizedFinding[];
        traces: TraceRow[]; fixOrder: string[]; batteryVersion: string;
        db: DbClient; writer: ReportWriter; server: DiagnosticsServer;
      } }) => {
        return report(input);
      }),
    },
  });

  const actor = createActor(machine);

  // THE READ-ONLY CLOSURE STATE — the handle's context getter reads the live
  // snapshot; the actors receive the current context through the invoke input
  // functions (the onDone assignments advance it).
  let snapshot: MicroLoopContext = {
    runId, targetPath, profilePath,
    profile: null, intendedBehavior: null, adapter: null, db: null,
    battery: [], batteryVersion: null, findings: [], traces: [],
    fixOrder: [], reportPath: null, error: null,
  };
  const sub = actor.subscribe((s): void => {
    // the snapshot context is typed through the machine's types marker —
    // the `as unknown as MicroLoopContext` double-cast removed (the R16
    // TYPE_CERTAINTY fix: the typed accessor replaces the bare assertion).
    snapshot = s.context;
  });  void sub;

  const handle: MicroLoopHandle = {
    start(event: { type: 'START' }): void {
      actor.start();
      actor.send(event);
    },
    done(): Promise<void> {
      return new Promise<void>((resolve): void => {
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
      });
    },
    get state(): { value: string } {
      return { value: snapshotState(actor.getSnapshot()) };
    },
    get context(): MicroLoopContext {
      return snapshot;
    },
    getSnapshot(): { state: 'done' | 'inconclusive'; result: MicroLoopResult } {
      const value = snapshotState(actor.getSnapshot());
      const terminal: 'done' | 'inconclusive' = value === 'done' ? 'done' : 'inconclusive';
      return {
        state: terminal,
        result: {
          runId: snapshot.runId,
          state: terminal,
          findingsCount: snapshot.findings.length,
          reportPath: snapshot.reportPath,
          fixOrder: snapshot.fixOrder,
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
  // Both reads are typeof/!== undefined-guarded before the assertion — the
  // type certainty is earned by the check, never a bare cast on unknown.
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
    throw new Error(`[micro-loop] ${actorName} actor event missing output`);
  }
  const output = (event as { output: T }).output;
  if (output === undefined || output === null) {
    throw new Error(`[micro-loop] ${actorName} actor event missing output`);
  }
  return output;
}

/** THE R16 TYPE_CERTAINTY GUARDED ACCESSOR — the onError event's `error` is
 *  read behind the typeof/null guard (the assertion is earned by the check). */
function actorError(event: unknown): unknown {
  if (typeof event !== 'object' || event === null) return undefined;
  return (event as { error: unknown }).error;
}

/** THE R16 TYPE_CERTAINTY BOUNDARY GUARD — a nullable context field is read at
 *  the invoke-input boundary behind the null/undefined check: a state that
 *  reached its actor without its predecessor's output is the loud NAMED error
 *  (the machine's state order is trusted, the value is verified), never a bare
 *  `as T` assertion that could carry null into the actor. */
function requireLoaded<T>(value: T | null | undefined, stage: string): T {
  if (value === undefined || value === null) {
    throw new Error(`[micro-loop] ${stage} reached before its dependency loaded`);
  }
  return value;
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
