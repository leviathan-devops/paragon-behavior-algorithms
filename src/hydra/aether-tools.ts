import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { createGraphifyTools, GraphifyMCPClient } from './graphify.js';
import { isPredicate, isNodeType } from '../shared/knowledge-graph/ontology.js';
import { kindForLayer } from '../shared/knowledge-graph/kind-for-layer.js';

export const READ_CAP = 320;
export const GREP_CAP = 120;
export const GRAPH_TOOL_VIOLATION = 'GRAPH_TOOL_VIOLATION';
export const META_DOC_REWRITE_REFUSED = 'META_DOC_REWRITE_REFUSED';
export const WRITE_SCOPE_VIOLATION = 'WRITE_SCOPE_VIOLATION';
export const GRAPH_TAG_INVALID_PREDICATE = 'GRAPH_TAG_INVALID_PREDICATE';
export const GRAPH_TAG_INVALID_KIND = 'GRAPH_TAG_INVALID_KIND';
export const READ_SCOPE_VIOLATION = 'READ_SCOPE_VIOLATION';

function logViolation(ledgerDir: string, attempted: string, code: string): void {
  try {
    const logPath = path.join(ledgerDir, 'evidence', 'write-violations.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify({ at: Date.now(), code, attempted, ledgerDir }) + '\n', 'utf-8');
  } catch (e) {
    throw new Error(`VIOLATION_LOG_WRITE_FAILED: ${(e as Error).message} — ledgerDir=${ledgerDir} attempted=${attempted} code=${code} remedy: ensure ledgerDir writable and evidence dir creatable`);
  }
}

function realResolve(p: string): string {
  const resolved = path.resolve(p);
  try { return fs.realpathSync(resolved); } catch (_e) {
    void (_e as Error).message;
    try {
      const dir = path.dirname(resolved);
      const realDir = fs.realpathSync(dir);
      return path.join(realDir, path.basename(resolved));
    } catch (_e2) { void (_e2 as Error).message; return resolved; }
  }
}

function isWithinRoot(realPath: string, realRoot: string): boolean {
  if (realPath === realRoot) return true;
  return realPath.startsWith(realRoot + path.sep);
}

function resolveLedgerRoot(ledgerDir: string): string {
  const r = path.resolve(ledgerDir);
  try { return fs.realpathSync(r); } catch (_e) { void (_e as Error).message; return r; }
}

export function makeCappedReadTool(cap: number, targetRoot?: string): AgentTool {
  return {
    name: 'read',
    label: 'read',
    description: `Read file window capped at ${cap} lines`,
    parameters: Type.Object({
      path: Type.String({ description: 'file path' }),
      offset: Type.Optional(Type.Number({ description: 'offset' })),
      limit: Type.Optional(Type.Number({ description: 'limit' })),
    }) as never,
    execute: async (_id: string, params: unknown) => {
      const p = params as { path?: string; offset?: number; limit?: number };
      const filePath = p.path ?? '';
      const offset = p.offset ?? 0;
      const limit = p.limit ?? cap;
      if (typeof limit === 'number' && limit > cap) {
        return { content: [{ type: 'text' as const, text: `READ_CAP_EXCEEDED: ${limit} > ${cap}` }], details: null };
      }
      if (!filePath || typeof filePath !== 'string') {
        return { content: [{ type: 'text' as const, text: 'READ_INVALID: path required' }], details: null };
      }
      if (targetRoot) {
        try {
          const rootReal = realResolve(path.resolve(targetRoot));
          const resolved = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(targetRoot, filePath);
          const realFile = realResolve(resolved);
          if (!isWithinRoot(realFile, rootReal) && realFile !== rootReal) {
            return { content: [{ type: 'text' as const, text: `${READ_SCOPE_VIOLATION}: read outside targetRoot ${filePath} -> ${realFile} not in ${rootReal}` }], details: null };
          }
        } catch (e) {
          void (e as Error).message;
        }
      }
      try {
        const effectivePath = targetRoot && !path.isAbsolute(filePath) ? path.resolve(targetRoot, filePath) : filePath;
        const text = fs.readFileSync(effectivePath, 'utf-8');
        const lines = text.split('\n');
        const start = Math.max(0, offset);
        const end = Math.min(lines.length, start + limit);
        return { content: [{ type: 'text' as const, text: lines.slice(start, end).join('\n') }], details: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: 'text' as const, text: `READ_FAILED: ${msg.slice(0, 300)}` }], details: null };
      }
    },
  } as unknown as AgentTool;
}

export function makeCappedGrepTool(cap: number, targetRoot?: string): AgentTool {
  return {
    name: 'grep',
    label: 'grep',
    description: `Grep capped at ${cap} results`,
    parameters: Type.Object({
      pattern: Type.String({ description: 'regex' }),
      glob: Type.Optional(Type.String()),
      root: Type.Optional(Type.String()),
      maxResults: Type.Optional(Type.Number()),
    }) as never,
    execute: async (_id: string, params: unknown) => {
      const p = params as { pattern?: string; glob?: string; root?: string; maxResults?: number };
      if (!p.pattern || p.pattern.trim() === '') return { content: [{ type: 'text' as const, text: 'GREP_INVALID: empty pattern' }], details: null };
      if (targetRoot) {
        try {
          const rootReal = realResolve(path.resolve(targetRoot));
          const requested = p.root ? (path.isAbsolute(p.root) ? path.resolve(p.root) : path.resolve(targetRoot, p.root)) : rootReal;
          const reqReal = realResolve(requested);
          if (!isWithinRoot(reqReal, rootReal) && reqReal !== rootReal) {
            return { content: [{ type: 'text' as const, text: `${READ_SCOPE_VIOLATION}: grep root outside targetRoot ${p.root ?? '(default)'} -> ${reqReal} not in ${rootReal}` }], details: null };
          }
        } catch (e) { void (e as Error).message; }
      }
      const maxResults = Math.min(p.maxResults ?? cap, cap);
      const roots = p.root ? [p.root] : [targetRoot ? targetRoot : process.cwd()];
      const runRg = (cmd: string, args: string[]): Promise<string> => new Promise((resolve) => {
        execFile(cmd, args, { timeout: 10_000, maxBuffer: 2_000_000 }, (err, stdout) => {
          resolve(err && !stdout ? `SEARCH_FAILED: ${String((err as Error).message).slice(0, 160)}` : stdout);
        });
      });
      let combined = '';
      for (const r of roots) {
        const effectiveRoot = targetRoot && !path.isAbsolute(r) ? path.resolve(targetRoot, r) : r;
        const args = ['-n', '--max-count', String(maxResults), p.pattern, effectiveRoot];
        if (p.glob) args.splice(1, 0, '--glob', p.glob);
        let out = await runRg('rg', args);
        if (out.startsWith('SEARCH_FAILED') || out.length === 0) {
          out = await runRg('grep', ['-rn', '-E', p.pattern, effectiveRoot].concat(p.glob ? [`--include=${p.glob}`] : []));
        }
        if (out && !out.startsWith('SEARCH_FAILED')) combined += out + (out.endsWith('\n') ? '' : '\n');
        if (combined.split('\n').length >= maxResults) break;
      }
      const lines = combined.split('\n').filter(Boolean).slice(0, maxResults);
      return { content: [{ type: 'text' as const, text: lines.join('\n').slice(0, 8000) || '(no matches)' }], details: null };
    },
  } as unknown as AgentTool;
}

function enforcePinned(attemptedPath: string | undefined, pinned: string, ledgerDir: string): { allowed: boolean; resolved: string; errorText?: string } {
  const ledgerReal = resolveLedgerRoot(ledgerDir);
  const pinnedResolved = path.resolve(pinned);
  const pinnedReal = realResolve(pinnedResolved);
  if (!isWithinRoot(pinnedReal, ledgerReal) && pinnedReal !== ledgerReal) {
    logViolation(ledgerDir, pinnedReal, GRAPH_TOOL_VIOLATION);
    return { allowed: false, resolved: pinnedReal, errorText: `${GRAPH_TOOL_VIOLATION}: pinned target outside ledger` };
  }
  if (attemptedPath !== undefined && attemptedPath !== null && String(attemptedPath).trim() !== '') {
    const attemptedResolved = path.resolve(String(attemptedPath));
    const attemptedReal = realResolve(attemptedResolved);
    if (attemptedReal !== pinnedReal) {
      logViolation(ledgerDir, attemptedReal, GRAPH_TOOL_VIOLATION);
      return { allowed: false, resolved: attemptedReal, errorText: `${GRAPH_TOOL_VIOLATION}: path ${attemptedReal} != pinned ${pinnedReal}` };
    }
    if (!isWithinRoot(attemptedReal, ledgerReal) && attemptedReal !== ledgerReal) {
      logViolation(ledgerDir, attemptedReal, GRAPH_TOOL_VIOLATION);
      return { allowed: false, resolved: attemptedReal, errorText: `${GRAPH_TOOL_VIOLATION}: traversal/symlink/prefix violation` };
    }
  }
  return { allowed: true, resolved: pinnedReal };
}

export function makeForceBoundWriteTool(name: string, pinnedPath: string): AgentTool {
  const effLedger = pinnedPath.includes('/findings/') ? path.dirname(path.dirname(pinnedPath)) : path.dirname(pinnedPath);
  return {
    name,
    label: name,
    description: `Force-bound write to ${pinnedPath}`,
    parameters: Type.Object({
      content: Type.String({ description: 'content' }),
      path: Type.Optional(Type.String({ description: 'must equal pinned target if provided' })),
    }) as never,
    execute: async (_id: string, params: unknown) => {
      const p = params as { content?: string; path?: string };
      const content = p.content ?? '';
      const check = enforcePinned(p.path, pinnedPath, effLedger);
      if (!check.allowed) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: GRAPH_TOOL_VIOLATION, detail: check.errorText, recorded: true }) }], details: null };
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
}

export function makeForceBoundEditTool(name: string, pinnedPath: string): AgentTool {
  const effLedger = pinnedPath.includes('/findings/') ? path.dirname(path.dirname(pinnedPath)) : path.dirname(pinnedPath);
  return {
    name,
    label: name,
    description: `Force-bound edit to ${pinnedPath}`,
    parameters: Type.Object({
      oldString: Type.String({ description: 'old' }),
      newString: Type.String({ description: 'new' }),
      path: Type.Optional(Type.String()),
    }) as never,
    execute: async (_id: string, params: unknown) => {
      const p = params as { oldString?: string; newString?: string; path?: string };
      const check = enforcePinned(p.path, pinnedPath, effLedger);
      if (!check.allowed) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: GRAPH_TOOL_VIOLATION, detail: check.errorText, recorded: true }) }], details: null };
      }
      try {
        const cur = fs.readFileSync(check.resolved, 'utf-8');
        const oldString = p.oldString ?? '';
        const newString = p.newString ?? '';
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
}



export function makeGraphTagTool(graph: unknown, ledgerDir: string): AgentTool {
  const layerId = path.basename(path.resolve(ledgerDir));
  return {
    name: 'graph_tag',
    label: 'graph_tag',
    description: 'Tag a finding into the shared graph via ontology predicates',
    parameters: Type.Object({
      findingSubject: Type.String({ description: 'subject' }),
      findingFile: Type.String({ description: 'file' }),
      findingLine: Type.Number({ description: 'line' }),
      predicate: Type.String({ description: 'ontology predicate' }),
      evidence: Type.String({ description: 'evidence' }),
      severity: Type.Optional(Type.String()),
    }) as never,
    execute: async (_id: string, params: unknown) => {
      const p = params as { findingSubject?: string; findingFile?: string; findingLine?: number; predicate?: string; evidence?: string; severity?: string };
      const predicate = String(p.predicate ?? '').trim();
      if (!isPredicate(predicate)) {
        throw new Error(`${GRAPH_TAG_INVALID_PREDICATE}: ${predicate} not in ontology`);
      }
      const kind = kindForLayer(layerId);
      if (!isNodeType(kind)) {
        throw new Error(`${GRAPH_TAG_INVALID_KIND}: ${kind}`);
      }
      const file = String(p.findingFile ?? 'unknown');
      const line = typeof p.findingLine === 'number' ? p.findingLine : 0;
      const subject = String(p.findingSubject ?? 'finding');
      const evidence = String(p.evidence ?? '');
      const canonical_id = `${layerId}:${file}:${line}`;
      const evidence_quote = evidence.startsWith('[INFERRED]') ? evidence : `explicit: ${evidence || 'no evidence'}`;
      if (evidence_quote.length === 0) throw new Error('GRAPH_TAG_EVIDENCE_EMPTY');
      const codeNodeId = `${file}:${line}:code`;
      const client = graph as GraphifyMCPClient;
      if (!client || typeof (client as unknown as { callTool?: unknown }).callTool !== 'function') {
        throw new Error(`GRAPH_TAG_MCP_UNAVAILABLE: graph client missing callTool — ledgerDir=${ledgerDir} remedy: pass a GraphifyMCPClient`);
      }
      await client.callTool('add_tag', {
        canonical_id,
        codeNodeId,
        kind,
        label: subject,
        file,
        line,
        predicate,
        evidence_quote,
        created_run: layerId,
        src_canonical: codeNodeId,
        dst_canonical: canonical_id,
        confidence: 1.0,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tagged: true, canonical_id, predicate, kind }) }], details: null };
    },
  } as unknown as AgentTool;
}

export function buildAuditorTools(ledgerDir: string, graph: GraphifyMCPClient, targetRoot?: string): AgentTool[] {
  if (!ledgerDir || typeof ledgerDir !== 'string' || ledgerDir.trim() === '') throw new Error('AUDITOR_TOOLS_INVALID: ledgerDir required');
  if (!graph) throw new Error('AUDITOR_TOOLS_INVALID: graph required');
  const effRoot = targetRoot ? path.resolve(targetRoot) : undefined;
  const reportPath = path.join(path.resolve(ledgerDir), 'findings', 'report.md');
  return [
    ...createGraphifyTools(graph),
    makeCappedReadTool(READ_CAP, effRoot),
    makeCappedGrepTool(GREP_CAP, effRoot),
    makeForceBoundWriteTool('write_findings', reportPath),
    makeForceBoundEditTool('edit', reportPath),
    makeGraphTagTool(graph, ledgerDir),
  ];
}

export function buildMetaTools(doc1Path: string, doc2Path: string, graph: GraphifyMCPClient): AgentTool[] {
  if (!doc1Path || !doc2Path) throw new Error('META_TOOLS_INVALID: doc paths required');
  if (!graph) throw new Error('META_TOOLS_INVALID: graph required');
  const ledgerRoot = path.dirname(path.resolve(doc1Path));
  const uncappedRead: AgentTool = {
    name: 'read',
    label: 'read',
    description: 'Uncapped read within ledger tree',
    parameters: Type.Object({ path: Type.String(), offset: Type.Optional(Type.Number()), limit: Type.Optional(Type.Number()) }) as never,
    execute: async (_id: string, params: unknown) => {
      const p = params as { path?: string; offset?: number; limit?: number };
      const fp = p.path ?? '';
      const resolved = path.resolve(fp);
      const rootReal = realResolve(ledgerRoot);
      const fileReal = realResolve(resolved);
      if (!isWithinRoot(fileReal, rootReal) && fileReal !== rootReal) {
        return { content: [{ type: 'text' as const, text: `SCOPE_VIOLATION: read outside ledger ${fp}` }], details: null };
      }
      try {
        const text = fs.readFileSync(fileReal, 'utf-8');
        const lines = text.split('\n');
        const start = Math.max(0, p.offset ?? 0);
        const lim = p.limit ?? lines.length;
        return { content: [{ type: 'text' as const, text: lines.slice(start, start + lim).join('\n') }], details: null };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `READ_FAILED: ${String((e as Error).message).slice(0, 200)}` }], details: null };
      }
    },
  } as unknown as AgentTool;
  const writeMetaDoc: AgentTool = {
    name: 'write_meta_doc',
    label: 'write_meta_doc',
    description: 'Append-only write to meta docs',
    parameters: Type.Object({ path: Type.String(), content: Type.String(), overwrite: Type.Optional(Type.Boolean()) }) as never,
    execute: async (_id: string, params: unknown) => {
      const p = params as { path?: string; content?: string; overwrite?: boolean };
      const target = p.path ?? doc1Path;
      const resolved = path.resolve(target);
      const allowed1 = path.resolve(doc1Path);
      const allowed2 = path.resolve(doc2Path);
      if (resolved !== allowed1 && resolved !== allowed2) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: META_DOC_REWRITE_REFUSED, detail: `target ${resolved} not in [${allowed1}, ${allowed2}]` }) }], details: null };
      }
      if (p.overwrite === true) {
        throw new Error(META_DOC_REWRITE_REFUSED);
      }
      const existing = fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf-8') : '';
      void existing.length;
      try {
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.appendFileSync(resolved, p.content ?? '', 'utf-8');
        return { content: [{ type: 'text' as const, text: JSON.stringify({ appended: true, path: resolved }) }], details: null };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `WRITE_FAILED: ${String((e as Error).message).slice(0, 200)}` }], details: null };
      }
    },
  } as unknown as AgentTool;
  const editBound = makeForceBoundEditTool('edit', doc1Path);
  const childrenStatus: AgentTool = {
    name: 'children_status',
    label: 'children_status',
    description: 'Read roster manifest telemetry',
    parameters: Type.Object({}) as never,
    execute: async () => {
      const candidates = [
        path.join(ledgerRoot, 'roster.json'),
        path.join(ledgerRoot, 'manifest.json'),
        path.join(path.dirname(ledgerRoot), 'roster.json'),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          try {
            const txt = fs.readFileSync(cand, 'utf-8');
            const data = JSON.parse(txt);
            return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], details: null };
          } catch (e) {
            return { content: [{ type: 'text' as const, text: `ROSTER_READ_FAILED: ${String((e as Error).message).slice(0, 200)}` }], details: null };
          }
        }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify([]) }], details: null };
    },
  } as unknown as AgentTool;
  return [...createGraphifyTools(graph), uncappedRead, writeMetaDoc, editBound, childrenStatus];
}
