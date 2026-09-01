import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { Type } from '@earendil-works/pi-ai';
import { createReadTool, type AgentTool } from '@earendil-works/pi-agent-core';

export const READ_FILE_MAX_LINES = 320;
export const GREP_MAX_RESULTS = 120;
export const WRITE_SCOPE_VIOLATION = 'WRITE_SCOPE_VIOLATION';

export interface ReadTurn {
  readonly path: string;
  readonly phase: string;
  readonly offset: number;
  readonly linesRead: number;
  readonly atMs: number;
  readonly eof: boolean;
}

export interface ToolsContext {
  targetRoot: string;
  specsRoots: string[];
  ledgerRoot: string;
  phaseRef: { current: string };
  readTurns: ReadTurn[];
}

function ledgerRootResolved(ctx: ToolsContext): string {
  return path.resolve(ctx.ledgerRoot);
}

function isWithinLedger(resolvedPath: string, ledgerRoot: string): boolean {
  const root = path.resolve(ledgerRoot);
  if (resolvedPath === root) return true;
  return resolvedPath.startsWith(root + path.sep);
}

function resolveForWrite(p: string, ledgerRoot: string): { resolved: string; allowed: boolean } {
  const resolved = path.resolve(p);
  let realResolved: string = resolved;
  try {
    realResolved = fs.realpathSync(resolved);
  } catch {
    try {
      const dir = path.dirname(resolved);
      const realDir = fs.realpathSync(dir);
      realResolved = path.join(realDir, path.basename(resolved));
    } catch {
      realResolved = resolved;
    }
  }
  let rootReal: string;
  try { rootReal = fs.realpathSync(ledgerRoot); } catch { rootReal = path.resolve(ledgerRoot); }
  const allowed = isWithinLedger(realResolved, rootReal);
  if (!allowed) {
    const lowerReal = realResolved.toLowerCase();
    const lowerRoot = rootReal.toLowerCase();
    if (lowerReal === lowerRoot || lowerReal.startsWith(lowerRoot + path.sep)) {
      return { resolved: realResolved, allowed: false };
    }
  }
  return { resolved: realResolved, allowed };
}

function enforceWriteScope(inputPath: string, ctx: ToolsContext): { allowed: boolean; resolved: string; errorText?: string } {
  const ledgerRoot = ledgerRootResolved(ctx);
  const cwdEff = process.cwd();
  const absInput = path.isAbsolute(inputPath) ? inputPath : path.resolve(cwdEff, inputPath);
  const check = resolveForWrite(absInput, ledgerRoot);
  if (check.allowed) return { allowed: true, resolved: check.resolved };
  const detail = `attempted ${check.resolved} — writes are scoped to ${ledgerRoot} (the codebase under audit is READ-ONLY evidence)`;
  try {
    const logPath = path.join(ledgerRoot, 'evidence', 'write-violations.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify({ at: Date.now(), code: WRITE_SCOPE_VIOLATION, attempted: check.resolved, ledgerRoot }) + '\n', 'utf-8');
  } catch {}
  return { allowed: false, resolved: check.resolved, errorText: detail };
}

function isAllowedReadPath(p: string, ctx: ToolsContext): boolean {
  const resolved = path.resolve(p);
  const target = path.resolve(ctx.targetRoot);
  if (resolved === target || resolved.startsWith(target + path.sep)) return true;
  for (const s of ctx.specsRoots) {
    const sr = path.resolve(s);
    try {
      const stat = fs.statSync(sr);
      if (stat.isFile()) {
        if (resolved === sr) return true;
      } else {
        if (resolved === sr || resolved.startsWith(sr + path.sep)) return true;
      }
    } catch {
      if (resolved === sr || resolved.startsWith(sr + path.sep)) return true;
    }
  }
  return false;
}

export function createAuditorTools(ctx: ToolsContext): AgentTool[] {
  const tools: AgentTool[] = [];
  const readNative = createReadTool() as unknown as { execute: (id: string, params: unknown, signal: AbortSignal | undefined, onUpdate: unknown, context: unknown) => Promise<unknown> };
  void readNative;
  const readTool: AgentTool = {
    name: 'read_file',
    label: 'read_file',
    description: 'Read a file window (≤320 lines). Roots: target + specs. Scoped mechanically.',
    parameters: Type.Object({
      path: Type.String({ description: 'Absolute or target/specs-relative path' }),
      offset: Type.Optional(Type.Number({ description: '0-indexed line offset' })),
      limit: Type.Optional(Type.Number({ description: 'Lines to read, ≤320' })),
    }) as never,
    execute: async (_id: string, params: unknown, signal: AbortSignal | undefined) => {
      const p = params as { path?: string; offset?: number; limit?: number };
      const inputPath = p.path ?? '';
      const offset = p.offset ?? 0;
      const limit = p.limit ?? READ_FILE_MAX_LINES;
      if (limit > READ_FILE_MAX_LINES) {
        return { content: [{ type: 'text' as const, text: `READ_FILE_CAP_EXCEEDED: limit ${limit} > ${READ_FILE_MAX_LINES}` }], details: null };
      }
      const resolvedTry = path.resolve(inputPath);
      const isAbs = path.isAbsolute(inputPath);
      let candidate = isAbs ? resolvedTry : path.resolve(ctx.targetRoot, inputPath);
      let finalPath = candidate;
      let allowed = isAllowedReadPath(candidate, ctx);
      if (!allowed && !isAbs) {
        for (const s of ctx.specsRoots) {
          const alt = path.resolve(path.dirname(s), inputPath);
          if (isAllowedReadPath(alt, ctx)) { finalPath = alt; allowed = true; break; }
          const alt2 = path.resolve(s, inputPath);
          if (isAllowedReadPath(alt2, ctx)) { finalPath = alt2; allowed = true; break; }
        }
        if (!allowed) {
          const specFileDirect = path.resolve(inputPath);
          if (ctx.specsRoots.includes(specFileDirect) || ctx.specsRoots.some((r) => specFileDirect.startsWith(path.resolve(r) + path.sep))) {
            finalPath = specFileDirect; allowed = true;
          }
        }
      }
      if (!isAbs && !allowed) {
        const absResolved = path.resolve(inputPath);
        if (isAllowedReadPath(absResolved, ctx)) { finalPath = absResolved; allowed = true; }
      }
      if (!allowed) {
        return { content: [{ type: 'text' as const, text: `SCOPE_VIOLATION: read_file path outside target+specs roots: ${inputPath}` }], details: null };
      }
      try {
        const text = fs.readFileSync(finalPath, 'utf-8');
        const lines = text.split('\n');
        const totalLines = lines.length;
        const start = Math.max(0, offset);
        const end = Math.min(totalLines, start + limit);
        const slice = lines.slice(start, end);
        const eof = end >= totalLines;
        ctx.readTurns.push({ path: finalPath, phase: ctx.phaseRef.current, offset: start, linesRead: slice.length, atMs: Date.now(), eof });
        const truncated = end < totalLines;
        return { content: [{ type: 'text' as const, text: slice.join('\n') }], details: { path: finalPath, lines: slice, totalLines, truncated } as unknown as null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text' as const, text: `ENOENT: ${finalPath} — ${msg.slice(0, 200)}` }], details: null };
      }
      void signal;
    },
  } as unknown as AgentTool;

  const grepTool: AgentTool = {
    name: 'grep',
    label: 'grep',
    description: 'Scoped grep within target|specs (≤120 results).',
    parameters: Type.Object({
      pattern: Type.String({ description: 'Regex pattern' }),
      glob: Type.Optional(Type.String()),
      root: Type.Optional(Type.String({ description: 'target or specs' })),
      maxResults: Type.Optional(Type.Number()),
    }) as never,
    execute: async (_id: string, params: unknown, signal: AbortSignal | undefined) => {
      const p = params as { pattern?: string; glob?: string; root?: string; maxResults?: number };
      if (!p.pattern) return { content: [{ type: 'text' as const, text: 'GREP_INVALID: empty pattern' }], details: null };
      const maxResults = Math.min(p.maxResults ?? GREP_MAX_RESULTS, GREP_MAX_RESULTS);
      const roots: string[] = [];
      if (!p.root || p.root === 'target') roots.push(ctx.targetRoot);
      if (!p.root || p.root === 'specs') roots.push(...ctx.specsRoots);
      const effRoots = roots.length ? roots : [ctx.targetRoot];
      const runRg = (cmd: string, args: string[]): Promise<string> => new Promise((resolve) => {
        execFile(cmd, args, { timeout: 15_000, maxBuffer: 4_000_000, signal }, (err, stdout) => {
          resolve(err && !stdout ? `SEARCH_FAILED: ${String((err as Error).message).slice(0, 160)}` : stdout);
        });
      });
      let combined = '';
      for (const r of effRoots) {
        const args = ['-n', '--max-count', String(maxResults), p.pattern, r];
        if (p.glob) args.splice(1, 0, '--glob', p.glob);
        let out = await runRg('rg', args);
        if (out.startsWith('SEARCH_FAILED') || out.length === 0) {
          out = await runRg('grep', ['-rn', '-E', p.pattern, r].concat(p.glob ? [`--include=${p.glob}`] : []));
        }
        if (out && !out.startsWith('SEARCH_FAILED')) combined += out + (out.endsWith('\n') ? '' : '\n');
        if (combined.split('\n').length >= maxResults) break;
      }
      const lines = combined.split('\n').filter(Boolean).slice(0, maxResults);
      const trimmed = lines.join('\n').slice(0, 8000);
      return { content: [{ type: 'text' as const, text: trimmed || '(no matches)' }], details: null };
    },
  } as unknown as AgentTool;

  const statTool: AgentTool = {
    name: 'stat',
    label: 'stat',
    description: 'Stat a path (exists/size/mtime/isFile).',
    parameters: Type.Object({ path: Type.String() }) as never,
    execute: async (_id: string, params: unknown) => {
      const p = params as { path?: string };
      const target = p.path ?? '';
      const resolved = path.isAbsolute(target) ? path.resolve(target) : path.resolve(ctx.targetRoot, target);
      try {
        const st = fs.statSync(resolved);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ exists: true, sizeBytes: st.size, mtimeMs: st.mtimeMs, isFile: st.isFile() }) }], details: null };
      } catch {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ exists: false, sizeBytes: 0, mtimeMs: 0, isFile: false }) }], details: null };
      }
    },
  } as unknown as AgentTool;

  const writeFileTool: AgentTool = {
    name: 'write_file',
    label: 'write_file',
    description: 'Write a file — SCOPE-LOCKED to the audit ledger only.',
    parameters: Type.Object({ path: Type.String(), content: Type.String() }) as never,
    execute: async (_id: string, params: unknown) => {
      const p = params as { path?: string; content?: string };
      const inputPath = p.path ?? '';
      const content = p.content ?? '';
      const check = enforceWriteScope(inputPath, ctx);
      if (!check.allowed) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: WRITE_SCOPE_VIOLATION, detail: check.errorText, recorded: true }) }], details: null };
      }
      try {
        fs.mkdirSync(path.dirname(check.resolved), { recursive: true });
        fs.writeFileSync(check.resolved, content, 'utf-8');
        return { content: [{ type: 'text' as const, text: JSON.stringify({ path: check.resolved, bytes: Buffer.byteLength(content, 'utf-8') }) }], details: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text' as const, text: `WRITE_FAILED: ${msg.slice(0, 300)}` }], details: null };
      }
    },
  } as unknown as AgentTool;

  const editFileTool: AgentTool = {
    name: 'edit_file',
    label: 'edit_file',
    description: 'Edit a ledger file via oldString→newString — ledger-scoped.',
    parameters: Type.Object({ path: Type.String(), oldString: Type.String(), newString: Type.String() }) as never,
    execute: async (_id: string, params: unknown) => {
      const p = params as { path?: string; oldString?: string; newString?: string };
      const inputPath = p.path ?? '';
      const oldString = p.oldString ?? '';
      const newString = p.newString ?? '';
      const check = enforceWriteScope(inputPath, ctx);
      if (!check.allowed) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: WRITE_SCOPE_VIOLATION, detail: check.errorText, recorded: true }) }], details: null };
      }
      try {
        const cur = fs.readFileSync(check.resolved, 'utf-8');
        if (!cur.includes(oldString)) {
          return { content: [{ type: 'text' as const, text: `EDIT_FAILED: oldString not found in ${check.resolved}` }], details: null };
        }
        const next = cur.replace(oldString, newString);
        fs.writeFileSync(check.resolved, next, 'utf-8');
        return { content: [{ type: 'text' as const, text: JSON.stringify({ path: check.resolved, applied: true }) }], details: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text' as const, text: `EDIT_FAILED: ${msg.slice(0, 300)}` }], details: null };
      }
    },
  } as unknown as AgentTool;

  tools.push(readTool, grepTool, statTool, writeFileTool, editFileTool);
  return tools;
}

export function isWriteScopeViolationResult(text: string): boolean {
  return text.includes(WRITE_SCOPE_VIOLATION);
}
