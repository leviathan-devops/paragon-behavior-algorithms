// src/subagents/trident-bug-hunter/graph/__tests__/native-ast-adapter.test.ts
// THE NATIVE-AST SUITE (W2, spec §3.5:881) — the tsc Program pass against a
// real fixture TS project: the classes + the methods + the imports + the calls
// + the awaits asserted (spec §3.5:881: "the fixture TS project → the graph
// (the classes + the imports + the calls asserted); the excluded-dir filter
// asserted"). The fixture is generated in a temp dir at test time — self-
// contained, zero committed fixture files.
//
// THE FALLBACK'S PLACE (honest): the native-ast adapter is the LAST RESORT —
// never the default. This suite proves the fallback works when it is the only
// substrate available (e.g. the corbell binary absent, per the G11.2 note).

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { minimalProfile } from './graph.test.ts';
import { NativeAstAdapter } from '../native-ast-adapter.ts';
import type { ProjectProfile } from '../../../../shared/knowledge-graph/profile-schema.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-native-ast-fixture-'));
let profile: ProjectProfile;

beforeAll(() => {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'excluded'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
    include: ['src'],
  }));
  fs.writeFileSync(path.join(root, 'src', 'helper.ts'), 'export function helper(): void {}\n');
  fs.writeFileSync(
    path.join(root, 'src', 'a.ts'),
    [
      "import { helper } from './helper';",
      'export class A {',
      '  go(): void { helper(); }',
      '}',
      'export async function run(): Promise<void> { await helper(); }',
      '',
    ].join('\n'),
  );
  // the excluded file must NOT appear in the graph
  fs.writeFileSync(path.join(root, 'src', 'excluded', 'ex.ts'), 'export function exFunc(): void {}\n');
  profile = minimalProfile('native-ast', root);
});

afterAll(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e: unknown) { console.error(`[native-ast test cleanup] ${String(e)}`); }
});

describe('NativeAstAdapter — the tsc Program pass on the fixture (spec §3.5:881)', () => {
  it('extracts the classes + the methods + the functions', async () => {
  try {
    const adapter = new NativeAstAdapter(profile);
    const result = await adapter.build(profile);
    expect(result.adapter).toBe('native-ast');
    expect(result.nodes.some((n) => n.id === 'class:A' && n.kind === 'class')).toBe(true);
    expect(result.nodes.some((n) => n.id === 'method:A.go' && n.kind === 'method')).toBe(true);
    expect(result.nodes.some((n) => n.id === 'fn:run' && n.kind === 'function')).toBe(true);
    expect(result.nodes.some((n) => n.id === 'fn:helper' && n.kind === 'function')).toBe(true);
    // every node is CODE_DERIVED with the file:line source anchor
    for (const n of result.nodes) {
      expect(n.lineage).toBe('CODE_DERIVED');
      expect(n.source).toContain('.ts:');
    }
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('extracts the imports edge', async () => {
  try {
    const adapter = new NativeAstAdapter(profile);
    const result = await adapter.build(profile);
    const imp = result.edges.find((e) => e.kind === 'imports');
    expect(imp !== undefined).toBe(true);
    expect(imp!.sourceId).toBe('file:src/a.ts');
    expect(imp!.targetId).toBe('file:src/helper.ts');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('extracts the calls edge and the awaits edge', async () => {
  try {
    const adapter = new NativeAstAdapter(profile);
    const result = await adapter.build(profile);
    const call = result.edges.find((e) => e.kind === 'calls');
    expect(call !== undefined).toBe(true);
    expect(call!.sourceId).toBe('method:A.go');
    expect(call!.targetId).toBe('fn:helper');
    const awaitEdge = result.edges.find((e) => e.kind === 'awaits');
    expect(awaitEdge !== undefined).toBe(true);
    expect(awaitEdge!.sourceId).toBe('fn:run');
    expect(awaitEdge!.targetId).toBe('fn:helper');
    expect(awaitEdge!.line).toBeGreaterThanOrEqual(1);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('filters the excluded dirs (spec §3.5:881)', async () => {
  try {
    // a profile whose excludes cover the excluded fixture dir
    const p = minimalProfile('native-ast', root);
    const filtered = { ...p, graph: { ...p.graph, excludes: ['src/excluded'] } };
    const adapter = new NativeAstAdapter(filtered);
    const result = await adapter.build(filtered);
    expect(result.nodes.some((n) => n.id === 'fn:exFunc')).toBe(false);
    expect(result.nodes.some((n) => n.id === 'file:src/excluded/ex.ts')).toBe(false);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the query verbs serve the built graph', async () => {
  try {
    const adapter = new NativeAstAdapter(profile);
    await adapter.build(profile);
    const sites = adapter.whoCalls('helper');
    expect(sites.length).toBe(2); // A.go (calls) + run (awaits)
    expect(sites.some((s) => s.caller === 'method:A.go')).toBe(true);
    expect(sites.some((s) => s.caller === 'fn:run')).toBe(true);
    expect(adapter.chain('run').some((s) => s.to === 'fn:helper')).toBe(true);
    expect(adapter.imports('src/a.ts').length).toBe(1);
    expect(adapter.awaits('run').length).toBe(1);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the query verbs throw ADAPTER_FAILED before a build', () => {
    const adapter = new NativeAstAdapter(profile);
    expect(() => adapter.whoCalls('x')).toThrow(/ADAPTER_FAILED/);
  });
});

describe('NativeAstAdapter — the adversarial cases', () => {
  it('throws GRAPH_EMPTY on a project with no declarations', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-native-ast-empty-'));
    try {
      fs.writeFileSync(path.join(empty, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext', skipLibCheck: true },
        include: ['src'],
      }));
      fs.mkdirSync(path.join(empty, 'src'), { recursive: true });
      const p = minimalProfile('native-ast', empty);
      const adapter = new NativeAstAdapter(p);
      let msg = '';
      try { await adapter.build(p); } catch (e: unknown) { console.warn('[native-ast-adapter.test] build threw (expected): ' + String(e)); msg = String(e); }
      expect(msg).toContain('GRAPH_EMPTY');
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('throws ADAPTER_FAILED when no tsconfig exists', async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-native-ast-bare-'));
    try {
      const p = minimalProfile('native-ast', bare);
      const adapter = new NativeAstAdapter(p);
      let msg = '';
      try { await adapter.build(p); } catch (e: unknown) { console.warn('[native-ast-adapter.test] build threw (expected): ' + String(e)); msg = String(e); }
      expect(msg).toContain('ADAPTER_FAILED');
      expect(msg).toContain('tsconfig');
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  it('skips node_modules + the compiler lib files (the project tree only)', async () => {
  try {
    const adapter = new NativeAstAdapter(profile);
    const result = await adapter.build(profile);
    for (const n of result.nodes) {
      expect(n.id.startsWith('fn:Object') || n.id.startsWith('fn:Promise') || n.id.startsWith('fn:Array')).toBe(false);
      expect(n.file === undefined || !String(n.file).includes('node_modules')).toBe(true);
    }
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});
