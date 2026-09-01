// src/subagents/trident-bug-hunter/tools/__tests__/corbell-native.test.ts
// THE CORBELL-NATIVE TOOLS BATTERY (the W2b MCP bridge + UI + docs patterns).
// The vendor-shaped store fixtures (graph_nodes/graph_edges + embedding_chunks)
// keep the battery hermetic — the MCP handlers read what the vendor writes, the
// UI reachability uses an injected probe, the docs patterns read a JSON store.
//
// THE ADVERSARIAL MANDATE: unknown tool, missing service, empty store, down UI,
// missing workspace, missing patterns store — every path has its failure test.

import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import {
  CORBELL_MCP_TOOLS,
  runMcpTool,
  resolveMcpServeCommand,
  formatSemanticRows,
} from '../mcp-bridge.ts';
import {
  resolveUiLaunchCommand,
  checkUiReachable,
  CORBELL_UI_DEFAULT_PORT,
  type UiProbe,
} from '../ui-server.ts';
import {
  extractDocsPatterns,
  readDocsPatterns,
  createDocsPatterns,
  parseLearnSummary,
  docsPatternsStorePath,
} from '../docs-patterns.ts';
import type { ExecFn } from '../../graph/corbell-adapter.ts';

const createdTmp: string[] = [];
afterAll(() => {
  for (const d of createdTmp) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e: unknown) { console.error(`[corbell-native.test cleanup] ${String(e)}`); }
  }
});

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-native-test-'));
  createdTmp.push(dir);
  return dir;
}

/** A corbell-shaped workspace + graph store (graph_nodes/graph_edges). */
function writeGraphStore(root: string): void {
  fs.mkdirSync(path.join(root, 'corbell-data', '.corbell'), { recursive: true });
  fs.writeFileSync(path.join(root, 'corbell-data', 'workspace.yaml'), 'version: "1"\nservices: []\n', 'utf8');
  const db = new Database(path.join(root, 'corbell-data', '.corbell', 'workspace.db'));
  db.exec(
    'CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, data TEXT NOT NULL);' +
    'CREATE TABLE graph_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT);',
  );
  db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
    .run('payments', 'service', JSON.stringify({ id: 'payments', name: 'payments', language: 'typescript', service_type: 'api', repo: 'svc/payments', tags: ['core'] }));
  db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
    .run('auth', 'service', JSON.stringify({ id: 'auth', name: 'auth', language: 'go', service_type: 'api', repo: 'svc/auth', tags: [] }));
  db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
    .run('payments::engine.ts::Pipeline.run', 'method', JSON.stringify({ id: 'payments::engine.ts::Pipeline.run', method_name: 'Pipeline.run', file_path: 'svc/payments/engine.ts', line_start: 4, service_id: 'payments' }));
  db.prepare('INSERT INTO graph_edges VALUES (?,?,?,?)')
    .run('payments', 'auth', 'http_call', JSON.stringify({}));
  db.close();
}

/** An embedding-chunks fixture (for the code_search handler). */
function writeEmbeddingStore(root: string): void {
  const db = new Database(path.join(root, 'corbell-data', '.corbell', 'workspace.db'));
  db.exec(
    'CREATE TABLE IF NOT EXISTS embedding_chunks (id TEXT PRIMARY KEY, service_id TEXT NOT NULL, repo TEXT NOT NULL, file_path TEXT NOT NULL, start_line INTEGER, end_line INTEGER, content TEXT NOT NULL, language TEXT NOT NULL, chunk_type TEXT NOT NULL, symbol TEXT, embedding BLOB);',
  );
  const blob = new Uint8Array(Float32Array.from([1, 0, 0]).buffer);
  db.prepare('INSERT INTO embedding_chunks (id, service_id, repo, file_path, start_line, end_line, content, language, chunk_type, symbol, embedding) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run('c1', 'payments', '/proj', 'svc/payments/engine.ts', 1, 5, 'class Pipeline', 'typescript', 'block', 'Pipeline', blob);
  db.close();
}

function recordingExec(out: string): { exec: ExecFn; calls: string[] } {
  const calls: string[] = [];
  const exec: ExecFn = (cmd: string) => { calls.push(cmd); return out; };
  return { exec, calls };
}

describe('CORBELL_MCP_TOOLS — the 4-tool catalog (the vendor contract, server.py:40-104)', () => {
  it('exposes the EXACT 4 vendor tool names (no partial, no renamed)', () => {
    const names = CORBELL_MCP_TOOLS.map((t) => t.name).sort();
    expect(names.join(',')).toBe('code_search,get_architecture_context,graph_query,list_services');
  });
  it('graph_query requires service_id + defaults include_dependencies/include_methods', () => {
    const gq = CORBELL_MCP_TOOLS.find((t) => t.name === 'graph_query')!;
    expect(gq.inputSchema['service_id'].required).toBe(true);
    expect(gq.inputSchema['include_dependencies'].default).toBe(true);
    expect(gq.inputSchema['include_methods'].default).toBe(false);
  });
  it('code_search + get_architecture_context carry the vendor input shapes', () => {
    const cs = CORBELL_MCP_TOOLS.find((t) => t.name === 'code_search')!;
    expect(cs.inputSchema['query'].required).toBe(true);
    expect(cs.inputSchema['top_k'].default).toBe(10);
    const ctx = CORBELL_MCP_TOOLS.find((t) => t.name === 'get_architecture_context')!;
    expect(ctx.inputSchema['feature_description'].required).toBe(true);
    expect(ctx.inputSchema['top_k_services'].default).toBe(10);
  });
});

describe('runMcpTool — the machine MCP surface over the vendor store', () => {
  it('list_services returns the vendor text contract (the summary lines)', () => {
    const root = tmpRoot();
    writeGraphStore(root);
    const out = runMcpTool('list_services', { projectRoot: root });
    expect(out).toContain('## Services (2 total)');
    expect(out).toContain('**payments**');
    expect(out).toContain('**auth**');
    expect(out).toContain('deps: 1'); // payments → auth http_call
  });

  it('graph_query returns the service detail + the dependencies (include_dependencies default)', () => {
    const root = tmpRoot();
    writeGraphStore(root);
    const out = runMcpTool('graph_query', { projectRoot: root }, { service_id: 'payments' });
    expect(out).toContain('Service: payments (payments)');
    expect(out).toContain('Language: typescript');
    expect(out).toContain('Dependencies:');
    expect(out).toContain('\u2192 auth [http_call]');
  });

  it('graph_query with include_methods lists the methods', () => {
    const root = tmpRoot();
    writeGraphStore(root);
    const out = runMcpTool('graph_query', { projectRoot: root }, { service_id: 'payments', include_methods: true });
    expect(out).toContain('Methods (1 total)');
    expect(out).toContain('Pipeline.run');
  });

  it('an unknown service → the vendor-shaped "Error: Service ... not found" text', () => {
    const root = tmpRoot();
    writeGraphStore(root);
    const out = runMcpTool('graph_query', { projectRoot: root }, { service_id: 'nope' });
    expect(out).toContain("Error: Service 'nope' not found");
  });

  it('code_search returns the ranked chunks with the similarity scores', () => {
    const root = tmpRoot();
    writeGraphStore(root);
    writeEmbeddingStore(root);
    const out = runMcpTool('code_search', { projectRoot: root, encode: () => [[1, 0, 0]] }, { query: 'pipeline', top_k: 5 });
    expect(out).toContain('## Code Search Results for: pipeline');
    expect(out).toContain('svc/payments/engine.ts::Pipeline');
    expect(out).toContain('score=1');
  });

  it('an unknown tool → the named "Error: unknown MCP tool" text (never a throw)', () => {
    const root = tmpRoot();
    const out = runMcpTool('spec_generate', { projectRoot: root }, {});
    expect(out).toContain('unknown MCP tool');
    expect(out).toContain('graph_query');
  });

  it('a missing store → the recover-never-swallow text (the vendor contract)', () => {
    const root = tmpRoot();
    const out = runMcpTool('list_services', { projectRoot: root });
    expect(out).toBe('No services found. Run `corbell graph build` first.');
  });
});

describe('resolveMcpServeCommand — the vendor mcp serve launch (Task 3)', () => {
  it('resolves the stdio command when the workspace exists', () => {
    const root = tmpRoot();
    writeGraphStore(root);
    const launch = resolveMcpServeCommand({ projectRoot: root }, { bin: '/fake/corbell' });
    expect(launch.command).toBe('/fake/corbell mcp serve');
    expect(launch.transport).toBe('stdio');
  });
  it('resolves the SSE command with the port', () => {
    const root = tmpRoot();
    writeGraphStore(root);
    const launch = resolveMcpServeCommand({ projectRoot: root }, { bin: '/fake/corbell', transport: 'sse', port: 9000 });
    expect(launch.command).toContain('--transport sse');
    expect(launch.command).toContain('--port 9000');
  });
  it('a missing workspace → the named MCP_WORKSPACE_MISSING', () => {
    const root = tmpRoot();
    let threw = '';
    try { resolveMcpServeCommand({ projectRoot: root }, { bin: '/fake/corbell' }); } catch (e: unknown) { console.warn('[corbell-native.test] resolveMcpServeCommand threw (expected): ' + String(e)); threw = String(e); }
    expect(threw).toContain('MCP_WORKSPACE_MISSING');
  });
});

describe('the UI wiring (Task 4) — the reachability is the ONLY evidence', () => {
  it('resolveUiLaunchCommand targets the vendor port 7433 + --no-browser', () => {
    const root = tmpRoot();
    writeGraphStore(root);
    const launch = resolveUiLaunchCommand({ projectRoot: root }, { bin: '/fake/corbell' });
    expect(launch.port).toBe(CORBELL_UI_DEFAULT_PORT);
    expect(launch.command).toContain('--port 7433');
    expect(launch.command).toContain('--no-browser');
    expect(launch.url).toBe('http://localhost:7433');
  });
  it('a missing workspace → the named UI_WORKSPACE_MISSING (the launch fails loudly)', () => {
    const root = tmpRoot();
    let threw = '';
    try { resolveUiLaunchCommand({ projectRoot: root }, { bin: '/fake/corbell' }); } catch (e: unknown) { console.warn('[corbell-native.test] resolveUiLaunchCommand threw (expected): ' + String(e)); threw = String(e); }
    expect(threw).toContain('UI_WORKSPACE_MISSING');
  });
  it('the reachability check: a responding server → reachable:true', async () => {
  try {
    const probe: UiProbe = async () => ({ status: 200 });
    const r = await checkUiReachable({ projectRoot: tmpRoot() }, { port: 9999, probe });
    expect(r.reachable).toBe(true);
    expect(r.status).toBe(200);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
  it('the reachability check: a DOWN server → reachable:false (never a fabricated green)', async () => {
  try {
    const probe: UiProbe = async () => { throw new Error('ECONNREFUSED'); };
    const r = await checkUiReachable({ projectRoot: tmpRoot() }, { port: 9999, probe });
    expect(r.reachable).toBe(false);
    expect(r.status).toBe(null);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
  it('the reachability check: a 500 → reachable:false (the server responded but is broken)', async () => {
  try {
    const probe: UiProbe = async () => ({ status: 500 });
    const r = await checkUiReachable({ projectRoot: tmpRoot() }, { port: 9999, probe });
    expect(r.reachable).toBe(false);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});

describe('the docs patterns (Task 5) — the vendor store read + the extraction wire', () => {
  it('readDocsPatterns parses the vendor doc_patterns.json into the typed rows', () => {
    const root = tmpRoot();
    const storePath = docsPatternsStorePath(root);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify([{
      id: 'pat-1',
      source_file: '/proj/DESIGN.md',
      detected_type: 'design_doc',
      section_headings: ['Decision', 'Context'],
      frontmatter_fields: [],
      terminology: { zones: 'zone-anchored' },
      decisions: [{ id: 'd1', summary: 'zone-anchored selection', rationale: 'no price anchors', source_file: '/proj/DESIGN.md', services_mentioned: [] }],
      format_example: '',
    }]), 'utf8');
    const rows = readDocsPatterns(root);
    expect(rows.length).toBe(1);
    expect(rows[0].sourceFile).toBe('/proj/DESIGN.md');
    expect(rows[0].detectedType).toBe('design_doc');
    expect(rows[0].decisions[0].summary).toBe('zone-anchored selection');
  });
  it('a missing patterns store → the TYPED EMPTY (never a fabricated row)', () => {
    const root = tmpRoot();
    expect(readDocsPatterns(root).length).toBe(0);
  });
  it('an unparseable patterns store → the TYPED EMPTY (the defensive read)', () => {
    const root = tmpRoot();
    const storePath = docsPatternsStorePath(root);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, '{ not json', 'utf8');
    expect(readDocsPatterns(root).length).toBe(0);
  });
  it('createDocsPatterns surfaces the list (the query verb wire)', () => {
    const root = tmpRoot();
    const surface = createDocsPatterns({ projectRoot: root });
    expect(typeof surface.list).toBe('function');
    expect(surface.list().length).toBe(0);
  });
  it('parseLearnSummary reads the vendor summary', () => {
    expect(parseLearnSummary('\u2713 Learned 3 doc patterns from 2 docs.')).toBe(3);
    expect(parseLearnSummary('no patterns')).toBe(0);
  });
  it('extractDocsPatterns runs scan + learn + returns the summaries', () => {
    const root = tmpRoot();
    writeGraphStore(root); // the workspace.yaml exists
    const { exec, calls } = recordingExec('\u2713 Learned 2 doc patterns from 1 docs.');
    const result = extractDocsPatterns({ projectRoot: root }, { exec, bin: '/fake/corbell' });
    expect(calls.some((c) => c.includes('docs scan'))).toBe(true);
    expect(calls.some((c) => c.includes('docs learn --no-llm'))).toBe(true);
    expect(result.patternCount).toBe(2);
    expect(result.storePath).toBe(docsPatternsStorePath(root));
  });
  it('a missing workspace → the named DOCS_PATTERNS_WORKSPACE_MISSING (error first)', () => {
    const root = tmpRoot();
    const { exec } = recordingExec('');
    let threw = '';
    try { extractDocsPatterns({ projectRoot: root }, { exec, bin: '/fake/corbell' }); } catch (e: unknown) { console.warn('[corbell-native.test] extractDocsPatterns threw (expected): ' + String(e)); threw = String(e); }
    expect(threw).toContain('DOCS_PATTERNS_WORKSPACE_MISSING');
  });
  it('the scan failure → the named DOCS_PATTERNS_SCAN_FAILED (never a swallowed pass)', () => {
    const root = tmpRoot();
    writeGraphStore(root);
    const exec: ExecFn = (cmd: string): string => {
      if (cmd.includes('docs scan')) throw new Error('scan crashed');
      return '';
    };
    let threw = '';
    try { extractDocsPatterns({ projectRoot: root }, { exec, bin: '/fake/corbell' }); } catch (e: unknown) { console.warn('[corbell-native.test] extractDocsPatterns threw (expected): ' + String(e)); threw = String(e); }
    expect(threw).toContain('DOCS_PATTERNS_SCAN_FAILED');
  });
});

describe('formatSemanticRows — the D22 llm records (the awareness surface)', () => {
  it('the llm format emits the token-minimal records', () => {
    const rows = formatSemanticRows([{ rank: 1, filePath: 'a.ts', startLine: 3, symbol: 'f', score: 0.9, serviceId: 'svc' }], 'llm');
    expect(String(rows[0]['record'])).toContain('rank=1');
    expect(String(rows[0]['record'])).toContain('file=a.ts');
    expect(String(rows[0]['record'])).toContain('score=0.9');
  });
  it('the table format passes the rows through', () => {
    const rows = formatSemanticRows([{ rank: 1, filePath: 'a.ts', startLine: 3, symbol: 'f', score: 0.9, serviceId: 'svc' }], 'table');
    expect(rows[0]['file']).toBe('a.ts');
  });
});
