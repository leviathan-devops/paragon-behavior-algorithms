// ═══ PI AUDIT TOOLS — read + grep for the Step-X aether agent ═══
// READ is pi's native harness tool (verbatim). GREP is a scoped ripgrep
// wrapper: searches ONLY within the audited project root (the scope law —
// the agent investigates the target, never the host filesystem).
import { execFile } from 'node:child_process';
import { Type } from '@earendil-works/pi-ai';
import { createReadTool, type AgentTool } from '@earendil-works/pi-agent-core';

export { createReadTool };

const GREP_SCHEMA = Type.Object({
  pattern: Type.String({ description: 'The regex pattern to search for.' }),
  glob: Type.Optional(Type.String({ description: 'Optional file glob filter, e.g. "*.ts".' })),
});

/** THE SCOPED GREP TOOL — ripgrep -n within targetRoot (fallback: grep -rn).
 *  Read-only investigation; never mutates anything. Results are line-anchored
 *  so the adjudicator can cite file:line evidence per its verdict blocks. */
export function createGrepTool(targetRoot: string): AgentTool {
  return {
    name: 'grep',
    label: 'grep',
    description: 'Search the audited project for a regex pattern. Returns line-anchored matches (file:line:text). Scope is LOCKED to the project root.',
    parameters: GREP_SCHEMA as never,
    execute: async (_toolCallId: string, params: unknown, signal: AbortSignal | undefined) => {
      const p = (params ?? {}) as { pattern?: string; glob?: string };
      if (!p.pattern || p.pattern.length === 0) {
        return { content: [{ type: 'text' as const, text: 'GREP_INVALID: empty pattern' }], details: null };
      }
      const run = (cmd: string, args: string[]): Promise<string> =>
        new Promise((resolve) => {
          execFile(cmd, args, { timeout: 15_000, maxBuffer: 4_000_000, signal }, (err, stdout) => {
            resolve(err && !stdout ? `SEARCH_FAILED: ${String(err.message).slice(0, 160)}` : stdout);
          });
        });
      const args = ['-n', '--max-count', '40', p.pattern, targetRoot];
      if (p.glob) args.splice(1, 0, '--glob', p.glob);
      let out = await run('rg', args);
      if (out.startsWith('SEARCH_FAILED') || out.length === 0) {
        out = await run('grep', ['-rn', '-E', p.pattern, targetRoot].concat(p.glob ? [`--include=${p.glob}`] : []));
      }
      const trimmed = out.length > 8000 ? out.slice(0, 8000) + '\n…(truncated)' : out;
      return { content: [{ type: 'text' as const, text: trimmed || '(no matches)' }], details: null };
    },
  } as unknown as AgentTool;
}
