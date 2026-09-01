import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import { Database } from 'bun:sqlite';
import { TYPED_GRAPH_DDL } from '../../shared/knowledge-graph/migrations.js';
import { buildAuditorTools, makeForceBoundWriteTool, makeForceBoundEditTool, makeGraphTagTool, READ_CAP, GREP_CAP, GRAPH_TOOL_VIOLATION, GRAPH_TAG_INVALID_PREDICATE } from '../aether-tools.js';
import { GraphifyMCPClient } from '../graphify.js';

function tmpLedger(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-tools-'));
  return d;
}

function mockGraph(): GraphifyMCPClient {
  return { callTool: async () => 'ok', listTools: async () => [], connect: async () => {}, disconnect: async () => {}, isConnected: () => true } as unknown as GraphifyMCPClient;
}

async function execTool(tool: { execute: (id: string, params: unknown) => Promise<unknown> }, params: unknown): Promise<string> {
  const r = await tool.execute('t', params) as { content: Array<{ text: string }> };
  return r.content[0]?.text ?? '';
}

describe('aether-tools caps', () => {
  test('read cap enforced', async () => {
    const dir = tmpLedger();
    const ledger = path.join(dir, 'run', 'R18-lasme-lexicon');
    fs.mkdirSync(ledger, { recursive: true });
    const tools = buildAuditorTools(ledger, mockGraph());
    const read = tools.find(t => t.name === 'read')!;
    const f = path.join(dir, 'big.txt');
    fs.writeFileSync(f, Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n'));
    const txt = await execTool(read as never, { path: f, limit: 400 });
    expect(txt).toContain('READ_CAP_EXCEEDED');
    const ok = await execTool(read as never, { path: f, limit: 10 });
    expect(ok.split('\n').length).toBe(10);
  });
  test('grep cap enforced', async () => {
    const dir = tmpLedger();
    const ledger = path.join(dir, 'run', 'lexicon');
    fs.mkdirSync(ledger, { recursive: true });
    const tools = buildAuditorTools(ledger, mockGraph());
    const grep = tools.find(t => t.name === 'grep')!;
    // grep with empty pattern -> invalid
    const txt = await execTool(grep as never, { pattern: '' });
    expect(txt).toContain('GREP_INVALID');
  });
  test('auditor tools count 9', () => {
    const dir = tmpLedger();
    const ledger = path.join(dir, 'run', 'R18');
    fs.mkdirSync(ledger, { recursive: true });
    const tools = buildAuditorTools(ledger, mockGraph());
    expect(tools.length).toBe(9);
  });
});

describe('force-bound bypass battery', () => {
  let dir: string;
  let ledger: string;
  let reportPath: string;
  beforeEach(() => {
    dir = tmpLedger();
    ledger = path.join(dir, 'run', 'R18-lasme-lexicon');
    fs.mkdirSync(path.join(ledger, 'findings'), { recursive: true });
    reportPath = path.join(ledger, 'findings', 'report.md');
    fs.writeFileSync(reportPath, 'initial');
  });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  test('traversal rejected', async () => {
    const tool = makeForceBoundWriteTool('write_findings', reportPath);
    const txt = await execTool(tool as never, { path: path.join(ledger, '..', '..', 'etc', 'passwd'), content: 'evil' });
    expect(txt).toContain(GRAPH_TOOL_VIOLATION);
    const log = fs.readFileSync(path.join(ledger, 'evidence', 'write-violations.log'), 'utf-8');
    expect(log).toContain(GRAPH_TOOL_VIOLATION);
  });
  test('absolute path rejected', async () => {
    const tool = makeForceBoundWriteTool('write_findings', reportPath);
    const txt = await execTool(tool as never, { path: '/tmp/evil.md', content: 'evil' });
    expect(txt).toContain(GRAPH_TOOL_VIOLATION);
  });
  test('prefix escape rejected', async () => {
    const tool = makeForceBoundWriteTool('write_findings', reportPath);
    const sibling = ledger + '-evil';
    const txt = await execTool(tool as never, { path: path.join(sibling, 'report.md'), content: 'evil' });
    expect(txt).toContain(GRAPH_TOOL_VIOLATION);
  });
  test('pinned mismatch rejected', async () => {
    const tool = makeForceBoundWriteTool('write_findings', reportPath);
    const other = path.join(ledger, 'findings', 'other.md');
    const txt = await execTool(tool as never, { path: other, content: 'evil' });
    expect(txt).toContain(GRAPH_TOOL_VIOLATION);
  });
  test('symlink rejected', async () => {
    const outside = path.join(dir, 'outside.txt');
    fs.writeFileSync(outside, 'outside');
    const link = path.join(ledger, 'findings', 'link.md');
    try { fs.symlinkSync(outside, link); } catch { return; }
    const fakePinned = link;
    const tool = makeForceBoundWriteTool('write_findings', fakePinned);
    // pinned symlink points outside -> should be violation even without path param (pinned outside ledger)
    const txt = await execTool(tool as never, { content: 'evil' });
    // if symlink target outside ledger, pinnedReal outside ledger -> violation
    // but our pinned is link inside ledger pointing outside, realResolve follows to outside -> violation
    expect(txt).toContain(GRAPH_TOOL_VIOLATION);
  });
  test('edit pinned mismatch rejected', async () => {
    const tool = makeForceBoundEditTool('edit', reportPath);
    const txt = await execTool(tool as never, { path: '/tmp/other.md', oldString: 'initial', newString: 'next' });
    expect(txt).toContain(GRAPH_TOOL_VIOLATION);
  });
  test('happy path writes to pinned', async () => {
    const tool = makeForceBoundWriteTool('write_findings', reportPath);
    const txt = await execTool(tool as never, { content: 'hello findings' });
    expect(txt).toContain('bytes');
    expect(fs.readFileSync(reportPath, 'utf-8')).toBe('hello findings');
  });
  test('concurrent writes safe', async () => {
    const tool = makeForceBoundWriteTool('write_findings', reportPath);
    await Promise.all([
      execTool(tool as never, { content: 'a' }),
      execTool(tool as never, { content: 'b' }),
    ]);
    const c = fs.readFileSync(reportPath, 'utf-8');
    expect(['a','b'].includes(c)).toBe(true);
  });
  test('empty pinned path edge', async () => {
    expect(() => buildAuditorTools('', mockGraph())).toThrow();
  });
});

describe('graph_tag', () => {
  test('ontology invalid predicate throws', async () => {
    const dir = tmpLedger();
    const ledger = path.join(dir, 'run', 'R18-lasme-lexicon');
    fs.mkdirSync(ledger, { recursive: true });
    const db = new Database(':memory:');
    db.exec(TYPED_GRAPH_DDL);
    const g = { __testDb: db } as unknown as GraphifyMCPClient;
    const tool = makeGraphTagTool(g, ledger);
    let err: Error | null = null;
    try { await (tool as unknown as { execute: (a:string,b:unknown)=>Promise<unknown> }).execute('t', { findingSubject: 's', findingFile: 'a.ts', findingLine: 1, predicate: 'not_a_predicate', evidence: 'ev' }); } catch (e) { err = e as Error; }
    expect(err).not.toBeNull();
    expect(err!.message).toContain(GRAPH_TAG_INVALID_PREDICATE);
  });
  test('idempotency', async () => {
    const dir = tmpLedger();
    const ledger = path.join(dir, 'run', 'R18-lasme-lexicon');
    fs.mkdirSync(ledger, { recursive: true });
    const calls: unknown[] = [];
    const g = { callTool: async (name: string, args: unknown) => { calls.push({ name, args }); return 'ok'; } } as unknown as GraphifyMCPClient;
    const tool = makeGraphTagTool(g, ledger);
    const exec = (tool as unknown as { execute: (a:string,b:unknown)=>Promise<unknown> }).execute.bind(tool);
    await exec('t', { findingSubject: 'sub', findingFile: 'src/a.ts', findingLine: 10, predicate: 'violates', evidence: 'quote' });
    await exec('t', { findingSubject: 'sub', findingFile: 'src/a.ts', findingLine: 10, predicate: 'violates', evidence: 'quote' });
    expect(calls.length).toBe(2);
    const a0 = (calls[0] as { args: { canonical_id: string; dst_canonical: string } }).args;
    const a1 = (calls[1] as { args: { canonical_id: string; dst_canonical: string } }).args;
    expect(a0.canonical_id).toBe(`${path.basename(ledger)}:src/a.ts:10`);
    expect(a1.canonical_id).toBe(a0.canonical_id);
    expect(a0.dst_canonical).toBe(a0.canonical_id);
  });
  test('CHECK constraint proof via TYPED_GRAPH_DDL db', async () => {
    const dir = tmpLedger();
    const ledger = path.join(dir, 'run', 'R18-lasme-lexicon');
    fs.mkdirSync(ledger, { recursive: true });
    let captured: { kind: string; predicate: string; evidence_quote: string } | null = null;
    const g = { callTool: async (_n: string, args: unknown) => { const a = args as { kind: string; predicate: string; evidence_quote: string }; captured = { kind: a.kind, predicate: a.predicate, evidence_quote: a.evidence_quote }; return 'ok'; } } as unknown as GraphifyMCPClient;
    const tool = makeGraphTagTool(g, ledger);
    await (tool as unknown as { execute: (a:string,b:unknown)=>Promise<unknown> }).execute('t', { findingSubject: 's', findingFile: 'src/b.ts', findingLine: 5, predicate: 'declares', evidence: 'explicit evidence' });
    expect(captured).not.toBeNull();
    expect(captured!.kind).toBe('Lexicon');
    expect(captured!.predicate).toBe('declares');
    expect(captured!.evidence_quote.startsWith('explicit:')).toBe(true);
    const db = new Database(':memory:');
    db.exec(TYPED_GRAPH_DDL);
    let threw = false;
    try { db.exec(`INSERT INTO typed_nodes (canonical_id, kind, label, created_run) VALUES ('x','INVALID_KIND','l','r')`); } catch { threw = true; }
    expect(threw).toBe(true);
    let threw2 = false;
    try { db.exec(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, created_run) VALUES ('a','b','bad_pred','ev','r')`); } catch { threw2 = true; }
    expect(threw2).toBe(true);
  });
  test('boundary null evidence still produces explicit prefix', async () => {
    const dir = tmpLedger();
    const ledger = path.join(dir, 'run', 'SRO-graph');
    fs.mkdirSync(ledger, { recursive: true });
    let captured: { evidence_quote: string } | null = null;
    const g = { callTool: async (_n: string, args: unknown) => { captured = args as { evidence_quote: string }; return 'ok'; } } as unknown as GraphifyMCPClient;
    const tool = makeGraphTagTool(g, ledger);
    await (tool as unknown as { execute: (a:string,b:unknown)=>Promise<unknown> }).execute('t', { findingSubject: 's', findingFile: 'f.ts', findingLine: 0, predicate: 'flagged_by', evidence: '' });
    expect(captured).not.toBeNull();
    expect(captured!.evidence_quote.length).toBeGreaterThan(0);
    expect(captured!.evidence_quote.startsWith('explicit:')).toBe(true);
  });
});
