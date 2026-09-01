// src/subagents/trident-bug-hunter/graph/__tests__/ix-adapter.test.ts
// THE IX-ADAPTER SUITE (W2, spec §3.4:828-846) — the wired-adapter battery over
// the MOCKED CLI (the exec stub returns the fixture llm output — NO real ix
// binary / ArangoDB needed for the unit battery) + the adversarial suite. The
// spec's parsing test (the `caller=main file=src/index.ts:12` shape, spec
// §3.4:833-839) is the happy path; the malformed / empty / boundary / line-ending
// / exec-failure cases are the mutation-checked remainder — a parse that throws
// on a G7.6 edge-case record is the regression this suite kills.
//
// THE MOCKED-CLI MECHANIC: the exec stub dispatches per command string (docker
// start / map / callers / trace / depends / inventory) and returns the fixture
// output — the adapter's build + query path runs entirely in-memory.
//
// THE MATCHER CONSTRAINT: the bun:test type shim (bun-modules.d.ts) declares a
// LIMITED ExpectMatchers — toMatchObject/toHaveLength are NOT in it, so every
// shape assertion is spelled field-by-field (the project convention).

import { describe, it, expect } from 'bun:test';
import os from 'node:os';
import path from 'node:path';
import { minimalProfile } from './graph.test.ts';
import {
  IxAdapter, parseLlmCallSites, parseLlmTrace, parseLlmDepends, parseLlmInventory,
  IX_LANGUAGES, isIxLanguage,
} from '../ix-adapter.ts';
import type { ProjectProfile } from '../../../../shared/knowledge-graph/profile-schema.ts';

type ExecFn = (cmd: string, opts?: { cwd?: string; timeout?: number }) => string;

/** A per-command recording exec stub: returns each handler's output for the
 *  matching command, throws for any unexpected command (a missed wiring call is
 *  a loud test failure, never a silent skip). */
function stubExec(handlers: Record<string, string | (() => string)>): { exec: ExecFn; calls: { cmd: string; opts?: { cwd?: string; timeout?: number } }[] } {
  const calls: { cmd: string; opts?: { cwd?: string; timeout?: number } }[] = [];
  const exec: ExecFn = (cmd, opts) => {
    calls.push({ cmd, opts });
    const h = handlers[cmd];
    if (h === undefined) throw new Error(`unexpected command: ${cmd}`);
    return typeof h === 'function' ? h() : h;
  };
  return { exec, calls };
}

/** The spec §3.4:833-835 callers fixture. */
const CALLERS_FIXTURE = [
  'caller=main file=src/index.ts:12',
  'caller=harvest file=src/pipeline/engine.ts:2800',
].join('\n');

/** The build-time `ix map . --format json` fixture. */
const MAP_JSON = JSON.stringify({
  nodes: [
    { id: 'engine', kind: 'function', name: 'engine', file: 'src/engine.ts', line: 12 },
    { id: 'harvest', kind: 'method', name: 'harvest', file: 'src/engine.ts', line: 2800 },
    { id: 'main', kind: 'function', name: 'main', file: 'src/index.ts', line: 1 },
  ],
  edges: [
    { sourceId: 'main', targetId: 'engine', kind: 'calls', line: 12 },
  ],
});

/** The standard build handlers (docker start no-op + the map JSON). */
function buildHandlers(mapJson: string = MAP_JSON): Record<string, string> {
  return {
    'ix docker start': '',
    'ix map . --format json': mapJson,
  };
}

function ixProfile(): ProjectProfile {
  return minimalProfile('ix', path.join(os.tmpdir(), `kg-ix-${Math.random().toString(36).slice(2)}`));
}

async function buildAdapter(handlers: Record<string, string | (() => string)>): Promise<{ adapter: IxAdapter; profile: ProjectProfile; calls: { cmd: string; opts?: { cwd?: string; timeout?: number } }[] }> {
try {
  const profile = ixProfile();
  const { exec, calls } = stubExec(handlers);
  const adapter = new IxAdapter(profile, exec);
  await adapter.build(profile);
  return { adapter, profile, calls };

} catch (e: unknown) {
  console.warn('buildAdapter failed: ' + (e instanceof Error ? e.message : String(e)));
  throw e;
}
}

describe('IxAdapter — the llm-format parsing battery (spec §3.4:828-846)', () => {
  it('parses the --format llm callers output (spec §3.4:833-839)', () => {
    const { exec } = stubExec({ 'ix callers createPipeline7Tools --format llm': CALLERS_FIXTURE });
    const adapter = new IxAdapter(ixProfile(), exec);
    const sites = adapter.whoCalls('createPipeline7Tools');
    expect(sites.length).toBe(2);
    expect(sites[0].caller).toBe('main');
    expect(sites[0].file).toBe('src/index.ts');
    expect(sites[0].line).toBe(12);
    expect(sites[1].caller).toBe('harvest');
    expect(sites[1].file).toBe('src/pipeline/engine.ts');
    expect(sites[1].line).toBe(2800);
  });

  it('whoCalls shells the real CLI with the llm format + the 30s timeout', () => {
    const profile = ixProfile();
    const { exec, calls } = stubExec({ 'ix callers runAll --format llm': CALLERS_FIXTURE });
    const adapter = new IxAdapter(profile, exec);
    adapter.whoCalls('runAll');
    const call = calls.find((c) => c.cmd === 'ix callers runAll --format llm');
    expect(call !== undefined).toBe(true);
    expect(call!.opts?.timeout).toBe(30_000);
    expect(call!.opts?.cwd).toBe(profile.project.root);
  });

  it('is never selected unless the profile asks for ix (spec §3.4:841-844)', () => {
    const profile = minimalProfile('corbell');
    expect(() => new IxAdapter(profile, execFn(''))).toThrow(/ADAPTER_FAILED/);
    expect(() => new IxAdapter(profile, execFn(''))).toThrow(/NOT_CONFIGURED/);
  });

  it('the exec failure on whoCalls → the named ADAPTER_FAILED with the command', () => {
    const exec: ExecFn = () => { throw new Error('timeout exceeded'); };
    const adapter = new IxAdapter(ixProfile(), exec);
    let msg = '';
    try { adapter.whoCalls('x'); } catch (e: unknown) { console.warn('[ix-adapter.test] whoCalls threw (expected): ' + String(e)); msg = String(e); }
    expect(msg).toContain('ADAPTER_FAILED');
    expect(msg).toContain('ix callers x --format llm');
  });
});

describe('IxAdapter — the build battery', () => {
  it('builds the graph from the mocked map JSON: ix:-prefixed ids + CODE_DERIVED', async () => {
  try {
    const profile = ixProfile();
    const { exec, calls } = stubExec(buildHandlers());
    const adapter = new IxAdapter(profile, exec);
    const result = await adapter.build(profile);
    expect(result.adapter).toBe('ix');
    expect(result.nodes.length).toBe(3);
    expect(result.edges.length).toBe(1);
    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['ix:engine', 'ix:harvest', 'ix:main']);
    for (const n of result.nodes) {
      expect(n.lineage).toBe('CODE_DERIVED');
      expect(n.source).toBe('ix');
    }
    expect(result.edges[0].sourceId).toBe('ix:main');
    expect(result.edges[0].targetId).toBe('ix:engine');
    // the provenance + the exec contract
    expect(result.command).toBe('ix map . --format json');
    const docker = calls.find((c) => c.cmd === 'ix docker start');
    expect(docker !== undefined).toBe(true);
    expect(docker!.opts?.timeout).toBe(120_000);
    const mapCall = calls.find((c) => c.cmd === 'ix map . --format json');
    expect(mapCall!.opts?.timeout).toBe(120_000);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the backend down → ADAPTER_FAILED on the ix docker start ensure (spec §3.4:848)', async () => {
    const handlers = { 'ix docker start': () => { throw new Error('daemon not running'); } };
    const profile = ixProfile();
    const { exec } = stubExec(handlers);
    const adapter = new IxAdapter(profile, exec);
    let msg = '';
    try { await adapter.build(profile); } catch (e: unknown) { console.warn('[ix-adapter.test] build threw (expected): ' + String(e)); msg = String(e); }
    expect(msg).toContain('ADAPTER_FAILED');
    expect(msg).toContain('ix docker start');
    expect(msg).toContain('ArangoDB');
  });

  it('the map CLI failure → ADAPTER_FAILED with the command named', async () => {
    const handlers = { 'ix docker start': '', 'ix map . --format json': () => { throw new Error('spawn ix ENOENT'); } };
    const profile = ixProfile();
    const { exec } = stubExec(handlers);
    const adapter = new IxAdapter(profile, exec);
    let msg = '';
    try { await adapter.build(profile); } catch (e: unknown) { console.warn('[ix-adapter.test] build threw (expected): ' + String(e)); msg = String(e); }
    expect(msg).toContain('ADAPTER_FAILED');
    expect(msg).toContain('ix map . --format json');
  });

  it('the unparseable map JSON → the named ADAPTER_PARSE_ERROR', async () => {
    const handlers = { 'ix docker start': '', 'ix map . --format json': '!!! not json ###' };
    const profile = ixProfile();
    const { exec } = stubExec(handlers);
    const adapter = new IxAdapter(profile, exec);
    let msg = '';
    try { await adapter.build(profile); } catch (e: unknown) { console.warn('[ix-adapter.test] build threw (expected): ' + String(e)); msg = String(e); }
    expect(msg).toContain('ADAPTER_PARSE_ERROR');
  });

  it('the zero-node map → GRAPH_EMPTY (a LOUD fail, never a silent empty success)', async () => {
    const handlers = { 'ix docker start': '', 'ix map . --format json': JSON.stringify({ nodes: [], edges: [] }) };
    const profile = ixProfile();
    const { exec } = stubExec(handlers);
    const adapter = new IxAdapter(profile, exec);
    let msg = '';
    try { await adapter.build(profile); } catch (e: unknown) { console.warn('[ix-adapter.test] build threw (expected): ' + String(e)); msg = String(e); }
    expect(msg).toContain('GRAPH_EMPTY');
  });
});

describe('IxAdapter — the query verbs over the built graph', () => {
  it('chain parses the from/to/kind/file trace records via `ix trace`', async () => {
  try {
    const handlers = {
      ...buildHandlers(),
      'ix trace engine --format llm': 'from=main to=engine kind=calls file=src/index.ts:12\nfrom=engine to=harvest kind=calls file=src/engine.ts:2800',
    };
    const { adapter } = await buildAdapter(handlers);
    const steps = adapter.chain('engine');
    expect(steps.length).toBe(2);
    expect(steps[0].from).toBe('main');
    expect(steps[0].to).toBe('engine');
    expect(steps[0].kind).toBe('calls');
    expect(steps[0].file).toBe('src/index.ts');
    expect(steps[0].line).toBe(12);
    expect(steps[1].to).toBe('harvest');
    expect(steps[1].line).toBe(2800);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('chain shells `ix trace <id> --format llm` with the 30s timeout', async () => {
  try {
    const profile = ixProfile();
    const { exec, calls } = stubExec({ ...buildHandlers(), 'ix trace engine --format llm': 'from=a to=b kind=calls file=f.ts:1' });
    const adapter = new IxAdapter(profile, exec);
    await adapter.build(profile);
    adapter.chain('engine');
    const call = calls.find((c) => c.cmd === 'ix trace engine --format llm');
    expect(call !== undefined).toBe(true);
    expect(call!.opts?.timeout).toBe(30_000);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('imports parses the from/to/file depends records via `ix depends`', async () => {
  try {
    const handlers = {
      ...buildHandlers(),
      'ix depends engine --format llm': 'from=main to=engine file=src/index.ts:12\nfrom=engine to=harvest file=src/engine.ts:2800',
    };
    const { adapter } = await buildAdapter(handlers);
    const edges = adapter.imports('engine');
    expect(edges.length).toBe(2);
    expect(edges[0].from).toBe('main');
    expect(edges[0].to).toBe('engine');
    expect(edges[0].file).toBe('src/index.ts');
    expect(edges[0].line).toBe(12);
    expect(edges[1].to).toBe('harvest');
    expect(edges[1].line).toBe(2800);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the query verbs throw ADAPTER_FAILED before a build (the honest gate)', async () => {
    const { exec } = stubExec({ 'ix trace x --format llm': '' });
    const adapter = new IxAdapter(ixProfile(), exec);
    expect(() => adapter.chain('x')).toThrow(/ADAPTER_FAILED/);
    expect(() => adapter.imports('x')).toThrow(/ADAPTER_FAILED/);
    expect(() => adapter.unwired()).toThrow(/ADAPTER_FAILED/);
  });

  it('nodes() execs `ix inventory --format llm` + prefixes ix: + merges with the cache', async () => {
  try {
    const handlers = {
      ...buildHandlers(),
      'ix inventory --format llm': 'id=newtool name=newtool kind=function file=src/new.ts:42 lang=typescript',
    };
    const { adapter, calls } = await buildAdapter(handlers);
    const nodes = adapter.nodes();
    // the inventory row + the 3 build-time map rows (dedup by ix: id)
    expect(nodes.length).toBe(4);
    const newTool = nodes.find((n) => n.id === 'ix:newtool');
    expect(newTool !== undefined).toBe(true);
    expect(newTool!.kind).toBe('function');
    expect(newTool!.file).toBe('src/new.ts');
    expect(newTool!.line).toBe(42);
    expect(newTool!.data?.['language']).toBe('typescript');
    const inventoryCall = calls.find((c) => c.cmd === 'ix inventory --format llm');
    expect(inventoryCall !== undefined).toBe(true);
    expect(inventoryCall!.opts?.timeout).toBe(30_000);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('nodes() kind filter applies over the merged rows', async () => {
  try {
    const handlers = {
      ...buildHandlers(),
      'ix inventory --format llm': 'name=extra kind=file file=src/extra.ts:7',
    };
    const { adapter } = await buildAdapter(handlers);
    const files = adapter.nodes('file');
    expect(files.length).toBe(1);
    expect(files[0].id).toBe('ix:extra');
    const functions = adapter.nodes('function');
    expect(functions.length).toBe(2);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('nodes() returns [] before a build', () => {
    const { exec } = stubExec({ 'ix docker start': '' });
    const adapter = new IxAdapter(ixProfile(), exec);
    expect(adapter.nodes()).toEqual([]);
  });

  it('the inventory exec failure → ADAPTER_FAILED (a LOUD fail, never a silent cache answer)', async () => {
    const handlers = {
      ...buildHandlers(),
      'ix inventory --format llm': () => { throw new Error('backend down'); },
    };
    const { adapter } = await buildAdapter(handlers);
    let msg = '';
    try { adapter.nodes(); } catch (e: unknown) { console.warn('[ix-adapter.test] nodes threw (expected): ' + String(e)); msg = String(e); }
    expect(msg).toContain('ADAPTER_FAILED');
    expect(msg).toContain('ix inventory --format llm');
  });

  it('the shape-churn recovery: an inventory output with zero parseable rows falls back to the build-time cache', async () => {
  try {
    const handlers = { ...buildHandlers(), 'ix inventory --format llm': 'G7.6-alpha-churn garbage line' };
    const { adapter } = await buildAdapter(handlers);
    const nodes = adapter.nodes();
    expect(nodes.length).toBe(3); // the map rows survive the churned inventory
    expect(nodes.some((n) => n.id === 'ix:engine')).toBe(true);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});

describe('parseLlmCallSites — the adversarial parsing battery (spec §3.4:833)', () => {
  it('the empty output returns []', () => {
    expect(parseLlmCallSites('')).toEqual([]);
    expect(parseLlmCallSites('\n\n')).toEqual([]);
  });

  it('a malformed-only output returns [] WITHOUT throwing (G7.6 — never a throw on the parse path)', () => {
    expect(parseLlmCallSites('!!! garbled alpha-churn output ###\nno key=value here')).toEqual([]);
  });

  it('skips the malformed lines and keeps the well-formed ones (the alpha churn defense)', () => {
    const sites = parseLlmCallSites('caller=main file=src/index.ts:12\nG7.6-drift line\ncaller=b file=src/b.ts:200\n');
    expect(sites.length).toBe(2);
    expect(sites[0].caller).toBe('main');
    expect(sites[1].caller).toBe('b');
  });

  it('handles the CRLF line endings + multiple records + the multi-digit line numbers (the boundary)', () => {
    const sites = parseLlmCallSites('caller=a file=a.ts:1\r\ncaller=long file=src/very/long/path.ts:1234\r\n');
    expect(sites.length).toBe(2);
    expect(sites[1].caller).toBe('long');
    expect(sites[1].file).toBe('src/very/long/path.ts');
    expect(sites[1].line).toBe(1234);
  });

  it('extracts the record from a line carrying trailing noise', () => {
    const sites = parseLlmCallSites('caller=main file=src/index.ts:12 some trailing annotation');
    expect(sites.length).toBe(1);
    expect(sites[0].caller).toBe('main');
    expect(sites[0].file).toBe('src/index.ts');
    expect(sites[0].line).toBe(12);
  });
});

describe('parseLlmTrace / parseLlmDepends / parseLlmInventory — the adversarial parsing battery', () => {
  it('parseLlmTrace: the well-formed + the skipped malformed (never a throw)', () => {
    const steps = parseLlmTrace('from=main to=engine kind=calls file=src/index.ts:12\nG7.6-drift line\n');
    expect(steps.length).toBe(1);
    expect(steps[0].from).toBe('main');
    expect(steps[0].to).toBe('engine');
    expect(steps[0].kind).toBe('calls');
    expect(steps[0].file).toBe('src/index.ts');
    expect(steps[0].line).toBe(12);
  });

  it('parseLlmTrace: the empty + malformed-only outputs return []', () => {
    expect(parseLlmTrace('')).toEqual([]);
    expect(parseLlmTrace('no records here')).toEqual([]);
  });

  it('parseLlmDepends: the well-formed + the skipped malformed (never a throw)', () => {
    const edges = parseLlmDepends('from=main to=engine file=src/index.ts:12\n!!! drift ###\n');
    expect(edges.length).toBe(1);
    expect(edges[0].from).toBe('main');
    expect(edges[0].to).toBe('engine');
    expect(edges[0].file).toBe('src/index.ts');
    expect(edges[0].line).toBe(12);
  });

  it('parseLlmInventory: the well-formed record → ix:-prefixed GraphNode + the enum-validated lang', () => {
    const nodes = parseLlmInventory('id=fn:runAll name=runAll kind=function file=src/engine.ts:31 lang=typescript');
    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe('ix:fn:runAll');
    expect(nodes[0].kind).toBe('function');
    expect(nodes[0].name).toBe('runAll');
    expect(nodes[0].file).toBe('src/engine.ts');
    expect(nodes[0].line).toBe(31);
    expect(nodes[0].lineage).toBe('CODE_DERIVED');
    expect(nodes[0].source).toBe('src/engine.ts:31');
    expect(nodes[0].data?.['language']).toBe('typescript');
  });

  it('parseLlmInventory: a record without a file anchor is skipped, never thrown', () => {
    expect(parseLlmInventory('id=orphan name=orphan kind=class')).toEqual([]);
  });

  it('parseLlmInventory: an unknown kind token normalizes to file (the union has no catch-all)', () => {
    const nodes = parseLlmInventory('name=x kind=wizard file=x.ts:3');
    expect(nodes[0].kind).toBe('file');
  });

  it('parseLlmInventory: an unknown lang token is carried + DEBUG-logged, never thrown (the enum guard catches the drift)', () => {
    const nodes = parseLlmInventory('name=x file=x.ts:3 lang=klingon');
    expect(nodes.length).toBe(1);
    expect(nodes[0].data?.['language']).toBe('klingon');
  });

  it('parseLlmInventory: the empty + malformed-only outputs return []', () => {
    expect(parseLlmInventory('')).toEqual([]);
    expect(parseLlmInventory('!!! garbage ###')).toEqual([]);
  });
});

describe('THE 34-ENTRY LANGUAGE ENUM (spec §2.5:301 — "26+ (the 34-entry enum)")', () => {
  it('carries exactly 34 typed entries', () => {
    expect(IX_LANGUAGES.length).toBe(34);
    expect(new Set(IX_LANGUAGES).size).toBe(34); // no duplicates — the exhaustive contract
  });

  it('covers the profile languages the machine selects on (typescript first)', () => {
    expect(IX_LANGUAGES[0]).toBe('typescript');
    expect(IX_LANGUAGES).toContain('python');
    expect(IX_LANGUAGES).toContain('rust');
    expect(IX_LANGUAGES).toContain('go');
    expect(IX_LANGUAGES).toContain('java');
  });

  it('isIxLanguage validates against the enum (known → true, unknown → false)', () => {
    expect(isIxLanguage('typescript')).toBe(true);
    expect(isIxLanguage('csharp')).toBe(true);
    expect(isIxLanguage('cobol')).toBe(false);
    expect(isIxLanguage('')).toBe(false);
  });
});


/** THE R16 TYPE_CERTAINTY GUARDED READ — the mock exec is narrowed to the
 *  ExecFn contract behind the typeof guard. */
function execFn(body: string): ExecFn {
  const fn = (() => body);
  if (typeof fn === 'function') {
    return fn as ExecFn;
  }
  throw new Error('the exec mock must be a function');
}
