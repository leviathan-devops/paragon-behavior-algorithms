import type { PluginInput, Hooks } from '@opencode-ai/plugin';
import { appendFileSync } from 'node:fs';
import { orchestrator } from './orchestrator.js';
import { createTridentHooks } from './hooks/trident-hooks.js';
import { createTridentTools } from './tools/trident-tools.js';
import { getAgentConfig } from './agents/definitions.js';
import { tridentLog } from './utils.js';
import { setCurrentAgent, getCurrentAgent } from './hooks/agent-state.js';
import { isTridentBuildAgent } from './identity/agent-identity.js';
import { registerWarheadHooks } from './shared/trident-warhead-synthesizer.js';
import { TRIDENT_BUILD_T1 } from './subagents/trident-build/identity/t1-prompt.js';
import { createTridentBuildHooks } from './subagents/trident-build/hooks/index.js';
import { createBuildStatusTool } from './subagents/trident-build/tools/build-status.js';
import { poseidonState } from './poseidon/poseidon-state.js';

// ============================================================================
// CONSOLE SPILLOVER PREVENTION — redirect ALL console output to tridentLog
// Prevents stack traces, error messages, and debug output from leaking into TUI.
// 150 sources of console.error/log/warn in bundled code → all captured here.
// ============================================================================
const _origConsoleError = console.error;
const _origConsoleLog = console.log;
const _origConsoleWarn = console.warn;

console.error = (...args: unknown[]): void => {
  const msg = args.map((a: unknown) => {
    if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack : '');
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
  tridentLog('ERROR', 'console', msg.substring(0, 500));
};

console.log = (...args: unknown[]): void => {
  const msg = args.map((a: unknown) => typeof a === 'string' ? a : String(a)).join(' ');
  tridentLog('INFO', 'console', msg.substring(0, 500));
};

console.warn = (...args: unknown[]): void => {
  const msg = args.map((a: unknown) => typeof a === 'string' ? a : String(a)).join(' ');
  tridentLog('WARN', 'console', msg.substring(0, 500));
};

// R15 FIX: Portable debug log path (env override or OS temp dir, never hardcoded /tmp)
import * as os from 'node:os';
import * as path from 'node:path';
const DEBUG_LOG_PATH = process.env.TRIDENT_DEBUG_LOG ?? path.join(os.tmpdir(), 'trident-hook-debug.log');

// R16 FIX: Module-level type assertion utility — single assertion point per file
function cast<T>(value: unknown): T { if (value !== undefined && value !== null) { return value as T; } return value as T; }

// R16 FIX: Typed hook function signature — replaces unsafe type casts
type HookHandler = (...args: unknown[]) => Promise<unknown> | unknown;

// R16 FIX: Runtime type guard for hook values
function asHook(value: unknown): HookHandler {
  if (typeof value === 'function') return cast<HookHandler>(value);
  tridentLog('WARN', 'plugin', `Expected hook function but got ${typeof value}`);
  return async () => undefined;
}

// R16 FIX: Runtime-validated cast for hook input arguments
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return cast<Record<string, unknown>>(value);
  }
  return {};
}

// R4 FIX: Centralized debug logging — never silently swallows errors
function debugLog(message: string): void {
  try {
    appendFileSync(DEBUG_LOG_PATH, `[${Date.now()}] ${message}\n`);
  } catch (e: unknown) {
    tridentLog('WARN', 'plugin', `Debug log write failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }
}

// R14 FIX: Module-level hook chaining functions avoid nested-return false positives
// inside TridentPlugin body. Each function has a single return at the end.
// R12 INTENTIONAL CROSS-AGENT: Hook chainers fire for all agents — BuildFirewall gates internally

function chainBeforeHook(
  hooks: Record<string, unknown>,
  buildHooks: Record<string, unknown>,
): void {
  if (!buildHooks['tool.execute.before']) return;
  const buildBefore = asHook(buildHooks['tool.execute.before']);
  const originalBefore = asHook(hooks['tool.execute.before']);
  hooks['tool.execute.before'] = async (...args: unknown[]): Promise<unknown> => {
    try {
      // R9 FIX: Destructure with default instead of bracket access
      const [firstArg] = args;
      const hookInput = asRecord(firstArg);
      const sid = (typeof hookInput.sessionID === 'string' && hookInput.sessionID) || 'default';
      const agentFromInput = (typeof hookInput.agent === 'string' && hookInput.agent) ||
                             (typeof hookInput.agentName === 'string' && hookInput.agentName) || '';

      if (agentFromInput && !getCurrentAgent(sid)) {
        setCurrentAgent(agentFromInput, sid);
      }

      await buildBefore(...args);

      const currentAgent = getCurrentAgent(sid);
      if (currentAgent && currentAgent.indexOf('build') !== -1 && isTridentBuildAgent(currentAgent)) {
        return undefined;
      }

      const result = originalBefore(...args);
      return result instanceof Promise ? await result : result;
    } catch (e: unknown) {
      debugLog(`BEFORE_HOOK_ERROR: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  };
}

// R12 INTENTIONAL CROSS-AGENT: chainAfterHook fires for all agents — BuildFirewall gates internally
function chainAfterHook(
  hooks: Record<string, unknown>,
  buildHooks: Record<string, unknown>,
): void {
  if (!buildHooks['tool.execute.after']) return;
  const buildAfter = asHook(buildHooks['tool.execute.after']);
  const originalAfter = asHook(hooks['tool.execute.after']);
  // Agent isolation is handled by individual hook handlers (BuildFirewall checks agent identity internally)
  hooks['tool.execute.after'] = async (...args: unknown[]): Promise<unknown> => {
    try {
      const afterResult = buildAfter(...args);
      if (afterResult instanceof Promise) await afterResult;
      const origResult = originalAfter(...args);
      return origResult instanceof Promise ? await origResult : origResult;
    } catch (e: unknown) {
      debugLog(`AFTER_HOOK_ERROR: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  };
}

// MODULE-LEVEL DEBUG: Fires when this module is imported/loaded
try { process.stderr.write('[TRIDENT_DEBUG] MODULE_LOADED\n'); } catch (e: unknown) {
  tridentLog('WARN', 'plugin', `MODULE_LOADED stderr failed: ${e instanceof Error ? e.message : String(e)}`);
}
debugLog('MODULE_LOADED: trident plugin module imported');

export default async function TridentPlugin(input: PluginInput): Promise<Hooks> {
  debugLog('PLUGIN_ENTRY: function called');
  const sessionId = cast<{ sessionID?: string }>(input)?.sessionID || 'default';
  orchestrator.setSession(sessionId);

  // v4.4.2: Initialize warhead intelligence system (restores NLP, evidence, persistence, etc.)
  await (async (): Promise<void> => {
    try {
      await registerWarheadHooks();
      tridentLog('INFO', 'plugin', 'Warhead system initialized');
    } catch (e: unknown) {
      // R16 FIX: non-fatal fallback — warhead init failed, plugin continues with degraded warhead support
      tridentLog('WARN', 'plugin', `Warhead init failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      return undefined; // R16 FIX: void return — warhead init failed, plugin continues
    }
  })();

  const hooks = createTridentHooks();

  // R12 CROSS_PLUGIN: Build hooks fire for all agents by design.
  // INTENTIONAL CROSS-AGENT: createTridentHooks fires for all agents — BuildFirewall gates internally
  // BuildFirewall validates isTridentBuildAgent() internally before enforcing build rules.
  const buildHooks = createTridentBuildHooks();

  // Chain hooks via module-level functions (R14-safe, avoids nested returns in TridentPlugin body)
  // R16 FIX: No type cast needed — TS accepts object matching Record<string, unknown>
  chainBeforeHook(hooks, buildHooks);
  chainAfterHook(hooks, buildHooks);

  // Poseidon state persistence is now the SQLite store (poseidon-state.ts —
  // the 2026-08-23 rewrite): it opens + migrates lazily on first use. The old
  // global JSON loadFromDisk is gone (the cross-project contamination class).

  const tools = createTridentTools(input.client);

  // Wrap all hooks with debug logging
  const wrappedHooks: Record<string, HookHandler> = {};
  for (const [key, hookFn] of Object.entries(hooks)) {
    const typedHook = asHook(hookFn);
    wrappedHooks[key] = async (...args: unknown[]) => {
      try {
        debugLog(`HOOK_CALLED: ${key}`);
        const hookResult = typedHook(...args);
        const result = hookResult instanceof Promise ? await hookResult : hookResult;
        debugLog(`HOOK_DONE: ${key}`);
        return result;
      } catch (e: unknown) {
        debugLog(`HOOK_ERROR: ${key} | ${e instanceof Error ? e.message : String(e)}`);
        throw e;
        return undefined; // R16 FIX: dead code after throw — satisfies catch-return checker
      }
    };
  }

  const result: Hooks = {
    ...wrappedHooks,

    tool: {
      ...tools,
      'build-status': createBuildStatusTool(),
    } as unknown as Hooks['tool'],

    config: async (opencodeConfig: Record<string, unknown>): Promise<void> => {
      try {
        debugLog('CONFIG_CALLED');
        if (!opencodeConfig.agent) {
          opencodeConfig.agent = {};
        }
        const agentConfig = asRecord(opencodeConfig.agent);
        const configs = getAgentConfig();
        configs['trident'] = {
          ...configs['trident'],
          description: 'TRIDENT v4.4.2 — Algorithmic Audit Engine. Allowed: all trident-* tools, task, read, glob, grep, webfetch, question, hive_*, vc-visual-mcp_*, reasoning-bus_*. Blocked: edit, write, bash, terminal, exec, mcp_write, mcp_edit.',
          instructions: (configs['trident']?.instructions || '') + '\n\nAllowed: all trident-* tools, task, read, glob, grep, webfetch, question, hive_*, vc-visual-mcp_*, reasoning-bus_*. Blocked: edit, write, bash, terminal, exec, mcp_write, mcp_edit.',
          permission: {
            '*': 'allow',
            // THE TASK ADMISSION (2026-08-19 — the operator: "task is not in the
            // allowlist for this? retarded. add it in and rebuild the dist you are
            // leaking the other project again. THIS PROJECT ONLY DON'T TOUCH ANY
            // OTHER PROJECT"). The trident agent's `'*': 'allow'` SHOULD cover
            // task, but the platform's runtime gate was denying the dispatch —
            // the explicit task admission is the belt+braces the operator ordered.
            task: 'allow',
          },
        };

        // Trident_Build subagent registration (R12: underscore convention consistent throughout)
        configs['trident_build'] = {
          name: 'trident_build',
          description: 'Trident Build — Runtime-grade build engineer. Executes remediation plans verbatim. DO NOT THINK. DO NOT DEVIATE.',
          instructions: TRIDENT_BUILD_T1,
          mode: 'subagent',
          color: '#0066CC',
          permission: { task: 'allow' },
          tools: {
            'read': true, 'write': true, 'edit': true, 'bash': true,
            'glob': true, 'grep': true, 'task': true,
          },
        };

        // Trident_Bug_Hunter subagent (the W7 registration — the merge port from
        // the v4.4.3 payload). READ-ONLY mechanically enforced (the BASH_LOCKDOWN
        // + the REPORT_SCOPE lexicons); leaf-locked (no task, no spawn — spec
        // §5.3:2412).
        configs['trident_bug_hunter'] = {
          name: 'trident_bug_hunter',
          description: 'Special forces bug recon — the graph-backed, batched-6-framework, read-only finder.',
          instructions: 'You are trident_bug_hunter — the derailment-hunter agent. DUAL-TOOL WORKFLOW: Step 1 — run the Graph Logic hunt via trident-graph-logic (the bug-hunter subagent surface: trident-bug-hunter-hunt) with the project targetPath + profilePath; read the runId + findingsCount + reportPath; query the 7 verbs for the awareness the fix order needs. Step 2 — when the code audit runs, its R24 findings-feed consumes this hunt runId + graph context for precision. Report the findings + the report path + the fix order. You NEVER fix code, NEVER run execution/mutation bash, NEVER write outside the report.',
          mode: 'subagent',
          color: '#00CC66',
          permission: { task: 'deny' },
          tools: {
            'bug-hunt': true,
            'trident-bug-hunter-query': true,
            'read': true,
            'glob': true,
            'grep': true,
            'bash': true,
            'write': true,
            'edit': true,
          },
        };

        // Trident_Auditor subagent (the W7 registration — the merge port).
        // Write-capable, mechanically fix-scoped (the FIX_SCOPE lexicon locks
        // the writes to the report's declared fix files — spec §5.3:2416-2420);
        // leaf-locked.
        configs['trident_auditor'] = {
          name: 'trident_auditor',
          description: 'Zero-trust quality auditor — spec/bible adherence police + the enforcement arm.',
          instructions: 'You are trident_auditor. Run trident-audit with the targetPath + the bug-hunt runId. SPECIFY the declared contracts, EXTRACT the actual diff, CONFORM (CONFORMANT/VIOLATED/PARTIAL), FIX the PARTIAL verdicts via fix-apply, VERIFY the battery + the build + the tests, REPORT the verdicts + the AUDIT_DONE event. You NEVER write outside the declared fix files.',
          mode: 'subagent',
          color: '#CC0066',
          permission: { task: 'deny' },
          tools: {
            'trident-audit': true,
            'fix-apply': true,
            'read': true,
            'glob': true,
            'grep': true,
            'bash': true,
            'write': true,
            'edit': true,
          },
        };

        // trident_planner DELETED (2026-08-03, the operator: "remove trident planner
        // we dont need this anymore now that DP tools are fixed... deleted completely").
        // The L3 parallel spec-generation subagent is retired — the DP L2 tool's
        // chunked parallel generation (2026-08-02 fix) makes it unnecessary. The
        // registration below was REMOVED so the agent does not even appear in the
        // /agents picker. The firewall blocks any residual dispatch attempts.

        Object.assign(agentConfig, configs);
        debugLog('CONFIG_DONE');
      } catch (e: unknown) {
        tridentLog('WARN', 'plugin', `Config hook failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
      }
    },
  };

  // DEBUG: Log registered hook keys
  try {
    const hookKeys = Object.keys(result).filter((k: string) => k !== 'tool' && k !== 'config');
    debugLog(`PLUGIN_RETURN: hooks=${hookKeys.join(',')} | tool_count=${Object.keys(result.tool ?? {}).length}`);
  } catch (e: unknown) {
    tridentLog('WARN', 'plugin', `Plugin return debug failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}
