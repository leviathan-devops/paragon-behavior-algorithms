import { tridentLog } from '../utils.js';

const ALLOWED_TOOLS = new Set([
  'trident-auditor-audit',
  'trident-status',
  'trident-help',
  'trident-gate',
  'trident-code-audit',
  'trident-deep-planning',
  'trident-problem-solving',
  'trident-context-synthesis',
  'trident-ship-package',
  'trident-poseidon',
  'build-status',
  // THE BUG-HUNTER MACHINE TOOLS (the W7 registration — the merge port from the
  // v4.4.3 payload): 'bug-hunt' carries NO trident- prefix so the prefix rule
  // does NOT cover it — the S2 container run proved the DENIED without these
  // entries. 'trident-bug-hunter-query' is prefix-covered but admitted explicitly
  // (belt + suspenders — the machine's surface is a UNIT, never a partial).
  'trident-bug-hunter-hunt',
  'trident-bug-hunter-query',
  'trident-graph-logic',
  // THE AUDITOR'S WRITE SURFACE (2026-08-13 — the S6 runtime gap, proven in the
  // suite container plutus-bh-suite-20260813): 'fix-apply' + 'build-done' are
  // REGISTERED as bare-name tools (trident-tools.ts:2773/2774) — the 'trident-'
  // prefix rule does NOT cover them, so the platform's allowlist DENIED the
  // auditor's own fix path at runtime (the agent observed "fix-apply is NOT on
  // the allowlist despite being a trident-* tool" — it is not trident-*, it is
  // bare 'fix-apply'). The audit loop's fix half therefore could not land. THE
  // FIX: the machine's write surface is admitted explicitly, as a UNIT.
  'trident-auditor-fix-apply',
  'trident-auditor-build-done',
  // trident-vision REMOVED — replaced by zai-vision_* and visual-cortex_* MCP tools
]);

const ALLOWED_EXTERNAL_TOOLS = new Set([
  'read',
  'glob',
  'grep',
  'webfetch',
  'question',
  'task',
  'task_status', // ADD 2026-08-12 — the runtime's native background-task poll (the task tool's completion/result channel)
  'todowrite',
  'checkpoint',
  'skill',
  // THE BATCH TOOL (2026-08-10 — the operator: "WHY IS THIS NOT IN YOUR
  // FUCKING ALLOWLIST"): the runtime's native parallel-dispatch tool (the
  // wave manager's batch form dispatches through it — the canonical subtask
  // path). It was NEVER admitted to the plugin's allowlist — the wave
  // dispatch deadlocked on the missing admission. 016_batch.md documents it:
  // tool_calls array (max 25), parallel execution, partial failures.
  // THE BATCH ADMISSION REMOVED (2026-08-15 — the wave-line batch-tool stripped).
  // Hive Mind Plugin (2.2-hotfix) — underscore names only, matching actual plugin registration
  'hive_context',
  'hive_status',
  'hive_remember',
  'hive_scan',
  'hive_forget',
  'hive_purge',
  'hive_restore',
  'hive_trash_list',
  'hive_trash_status',
  'memread_session',
  'memlink_parent',
]);

// Prefix-based allowlist — any tool starting with these prefixes is auto-allowed.
// This future-proofs against tool name changes within known namespaces.
const ALLOWED_TOOL_PREFIXES = [
  'trident-',
  'reasoning-bus_',
  'visual-cortex_',
  'zai-vision_',
  'pdf-reader_',
  'vc-browser_',
  'vc-fetch_',
  'hive_',
  'memread_',
  'memlink_',
];

// R10 FIX: Exported so the AST call-graph engine can trace invocation from trident-hooks.ts
export function isToolAllowed(toolName: string): boolean {
  if (!toolName || typeof toolName !== 'string') return false;
  const lower = toolName.toLowerCase();
  if (ALLOWED_TOOLS.has(lower)) return true;
  if (ALLOWED_EXTERNAL_TOOLS.has(lower)) return true;
  for (const prefix of ALLOWED_TOOL_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  tridentLog('WARN', 'tool-allowlist', `DENIED tool: ${toolName} (not in allowlist)`);
  return false;
}

export { ALLOWED_TOOLS, ALLOWED_EXTERNAL_TOOLS };
