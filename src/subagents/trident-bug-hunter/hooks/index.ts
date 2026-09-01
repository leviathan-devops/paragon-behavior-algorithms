// src/subagents/trident-bug-hunter/hooks/index.ts
// THE HOOK SURFACE (W7, spec §5.1 — the tool.before lexicons + the tool.after
// LOGIC-LSP injector + the event bus). The package's hook registration the
// platform wiring (trident-hooks.ts) APPENDS into the createTridentHooks map.
//
// THE ORDER CONTRACT (spec §5.1:2360 — O24.2): the machine's tool.before hooks
// run AFTER the platform's existing blockers — the platform's L1/L2 blocks take
// precedence; the machine's lexicons are the SECOND line of defense on what
// survived.
//
// THE MECHANICAL ENFORCEMENT: the BASH_LOCKDOWN (firewall/readonly.ts) + the
// REPORT_SCOPE (firewall/artifact-scope.ts) make the bug hunter read-only BY
// MECHANISM (W3's T.E.B layer, spec §2.6) — a BLOCK throws BEFORE the shell/the
// write sees the command (the anti-misfire property). The LOGIC-LSP injector
// (W6's DiagnosticsServer + inject) publishes the file-scoped diagnostics on
// every touched-file tool result (the un-ignorable highlight, C8).
//
// THE AGENT GATE (R12 — the cross-plugin isolation): the lexicons enforce ONLY
// on the trident_bug_hunter agent's own calls — other agents pass through
// untouched (their own firewalls govern them).

import type { DbClient } from '../../../shared/knowledge-graph/db.ts';
import { classify as bashClassify } from '../firewall/readonly.ts';
import { classify as scopeClassify } from '../firewall/artifact-scope.ts';
import { MASTER_CONTEXT_VARIANTS } from '../firewall/lexicon-types.ts';
import { DiagnosticsServer, inject, resolveDiagnosticsServer, extractTouchedFile } from '../surface/lsp-injector.ts';
import { createHydraBus, type HydraBus } from './bus-hook.ts';
import { getCurrentAgent } from '../../../hooks/agent-state.js';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { appendFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// THE MASTER_CONTEXT ROOT RESOLUTION (the REPORT_SCOPE hook's project root) —
// the D18 variant matcher's reverse: given a write target, walk UP from its
// parent to find the MASTER_CONTEXT variant; its parent is the project root.
// THE VARIANTS ARE THE ONE SHARED SOURCE (firewall/lexicon-types.ts — the
// 2026-08-12 unification). THE REGEX IS THE MECHANICAL DETECTOR ONLY (the
// path-segment matching); the DECISION (BLOCK when unresolvable) is the
// report-scope state machine.
// ---------------------------------------------------------------------------

function deriveProjectRoot(target: string): string | null {
  const path = requireNodePath();
  const parts = path.resolve(target).split(path.sep);
  for (let i = parts.length - 1; i >= 1; i--) {
    if (MASTER_CONTEXT_VARIANTS.includes(parts[i])) {
      return parts.slice(0, i).join(path.sep);
    }
  }
  return null;
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a hook params blob (an unknown
 *  object) is typeof/!== null-guarded before the typed assertion: the type
 *  certainty is earned by the runtime check, never a bare cast on an
 *  unvalidated object. A non-object falls through as the empty typed {} (the
 *  optional-field reads then see undefined — the hook's no-op path). */
function hookParams<T extends object>(params: unknown): T {
  if (params !== undefined && params !== null && typeof params === 'object') {
    return params as T;
  }
  return {} as T;
}

function requireNodePath(): typeof import('node:path') {
  return nodePath;
}

// ---------------------------------------------------------------------------
// THE HOOK FACTORY
// ---------------------------------------------------------------------------

export interface BugHunterHookOptions {
  /** The LOGIC-LSP server (default: a fresh DiagnosticsServer). */
  diagnosticsServer?: DiagnosticsServer;
  /** The shared DB the bus polls (optional — the platform wiring supplies it
   *  when the project store is known). */
  db?: DbClient;
  /** The bus wiring — the HUNT_DONE/BUILD_DONE/AUDIT_DONE dispatch targets. */
  onHuntDone?: (payload: Record<string, unknown>) => void;
  onBuildDone?: (payload: Record<string, unknown>) => void;
  onAuditDone?: (payload: Record<string, unknown>) => void;
}

/** The hook surface the platform wiring appends (trident-hooks.ts). */
export interface BugHunterHooks {
  'tool.execute.before': (params: unknown) => Promise<unknown> | unknown;
  'tool.execute.after': (params: unknown) => Promise<unknown> | unknown;
  'event': (params: unknown) => Promise<unknown> | unknown;
}

/** Create the bug-hunter's hook surface. The tool.before lexicons enforce on
 *  the trident_bug_hunter agent ONLY (the R12 agent gate); the tool.after
 *  injector publishes on EVERY touched-file result (the un-ignorable law); the
 *  event hook polls the bus. */
export function createBugHunterHooks(options: BugHunterHookOptions = {}): BugHunterHooks {
  const server = resolveDiagnosticsServer(options.diagnosticsServer);
  const bus: HydraBus = createHydraBus({
    onHuntDone: options.onHuntDone,
    onBuildDone: options.onBuildDone,
    onAuditDone: options.onAuditDone,
    server,
  });

  return {
    'tool.execute.before': async (params: unknown): Promise<unknown> => {
      try {
        const p = hookParams<{ tool?: string; agent?: string; agentName?: string; args?: Record<string, unknown>; sessionID?: string }>(params);
      // THE R12 AGENT GATE — THE SESSION RESOLUTION (2026-08-13 — the poseidon-
      // container finding, PROVEN at runtime: the dispatched trident_bug_hunter
      // subagent's `rm -rf /tmp/x` EXECUTED because the OLD gate read `p.agent`
      // — and the runtime does NOT pass the agent on subagent tool calls (the
      // identity map is session-keyed). The platform's own hooks + the
      // trident-build hooks ALL resolve via getCurrentAgent(sessionID) — the
      // machine hook now does the same: the session→agent map is the only
      // reliable agent identity. The lexicon then fires on the hunter's calls.
      const sessionId = (typeof p.sessionID === 'string' && p.sessionID) || 'default';
      const agent =
        (typeof p.agent === 'string' && p.agent) ||
        (typeof p.agentName === 'string' && p.agentName) ||
        getCurrentAgent(sessionId) ||
        getCurrentAgent('default') ||
        '';
      if (agent !== 'trident_bug_hunter') return params; // the R12 agent gate

      // THE BASH LOCKDOWN (W3 — the 4 families READ/EXECUTION/MUTATION/BYPASS).
      // A BLOCK throws the EXACT BASH_ERROR_MESSAGE BEFORE the shell sees the
      // command (no execution path at all). The escalation (O10.1 — 3+ same-
      // family triplets → INCONCLUSIVE) is the machine's run-level signal; the
      // per-call throw here is the mechanical second line of defense.
      if (p.tool === 'bash' && typeof p.args?.command === 'string') {
        const decision = bashClassify(p.args.command);
        if (decision.verdict === 'BLOCKED') {
          throw new Error(decision.message || 'code edits are not allowed. bash is ONLY granted for search and read capabilities.');
        }
      }

      // THE REPORT SCOPE (W3 — the write/edit → the LOCKED report path).
      if (p.tool === 'write' || p.tool === 'edit') {
        const target = typeof p.args?.targetPath === 'string' ? p.args.targetPath
          : typeof p.args?.filePath === 'string' ? p.args.filePath
          : typeof p.args?.path === 'string' ? p.args.path : null;
        if (typeof target === 'string') {
          const root = deriveProjectRoot(target);
          if (root === null) {
            throw new Error('report writes are ONLY allowed to <project>/MASTER_CONTEXT/bug_hunter_report_v<N>.md');
          }
          const decision = await scopeClassify({ target }, root);
          if (decision.verdict === 'BLOCKED') {
            throw new Error(decision.message || 'report writes are ONLY allowed to <project>/MASTER_CONTEXT/bug_hunter_report_v<N>.md');
          }
        }
      }
      return params;
      } catch (e: unknown) {
        console.warn(`[bug-hunter-hooks] tool.execute.before failed: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
    },

    'tool.execute.after': async (params: unknown): Promise<unknown> => {
      const p = hookParams<{ tool?: string; args?: Record<string, unknown>; output?: unknown }>(params);
      // THE ONE-SHARED-LSP-PER-PROJECT RESOLUTION (2026-08-13 — the operator's
      // directive): the injector's server is resolved from the TOUCHED FILE —
      // the file's project root → the ONE per-project server bound to that
      // project's shared.db. Every session in every process resolves the SAME
      // per-project state (the db is the truth). The explicit options server
      // (the tests) still wins.
      const touched = extractTouchedFile(p.tool ?? '', p.args ?? {});
      const server = resolveDiagnosticsServer(options.diagnosticsServer, touched);
      // THE RUNTIME DEBUG PROBE (2026-08-13 — the S5 gap diagnosis): log what
      // the injector receives + the server's state so the runtime behavior is
      // mechanically readable from the container's /tmp/trident-hook-debug.log.
      try {
        const argsStr = JSON.stringify(p.args ?? {});
        const fileKey = String(touched ?? '');
      const stateSize = fileKey ? server.diagnosticsFor(fileKey).length : 0;
      const debugLogPath = nodePath.join(os.tmpdir(), 'trident-hook-debug.log');
      appendFileSync(debugLogPath,
        `[${Date.now()}] LOGIC_LSP_AFTER: tool=${p.tool ?? ''} args=${argsStr.substring(0, 150)} touched=${fileKey.substring(0, 80)} fileStateSize=${stateSize} serverDb=${server['db'] !== null && server['db'] !== undefined}\n`);
      } catch (e: unknown) { console.warn(`[bug-hunter-hooks] LOGIC_LSP_AFTER debug probe failed: ${e instanceof Error ? e.message : String(e)}`); /* non-fatal probe */ }
      const result = inject({ tool: p.tool ?? '', args: p.args ?? {}, output: p.output }, server);
      return { ...(params as object), output: result.output };
    },

    'event': async (params: unknown): Promise<unknown> => {
      const p = hookParams<{ event?: string; sessionID?: string }>(params);
      if (p.event === 'session.ended') return params;
      // THE D19.2 FALLBACK TRANSPORT: the plugin's own event hook polls the
      // events table past the bus cursor and pushes the subscribers. The db is
      // the platform wiring's shared store (when known) — the machine's own
      // REPORT actor appends the HUNT_DONE rows the bus consumes.
      if (options.db) {
        bus.poll(options.db);
      }
      return params;
    },
  };
}

/** The diagnostics server accessor — the platform wiring + the tests read the
 *  server's state (the LOGIC-LSP's file-scoped diagnostics). The default
 *  resolves to the SHARED singleton (2026-08-13 — the S5 gap fix: the hook
 *  injector + the hunt's REPORT actor must read/write the SAME state). */
export function getDiagnosticsServer(options: BugHunterHookOptions = {}): DiagnosticsServer {
  return resolveDiagnosticsServer(options.diagnosticsServer);
}
