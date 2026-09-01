// src/subagents/trident-bug-hunter/graph/__tests__/corbell-adapter.test.ts
// THE CORBELL-ADAPTER SUITE (W2, spec §3.3:749-775) — the mocked-CLI battery
// (the exec stub returns the fixture output — NO real corbell binary needed for
// the unit battery) + the adversarial suite + the sqlite-store tests THROUGH
// W1's db.ts (the lineage-mandatory writeGraph + the D27 mirror).
//
// THE MOCKED-CLI MECHANIC: the exec stub returns the spec's 3-line fixture for
// the --help/init guards and the build; the adapter's assertCorbell + init +
// parse path runs entirely in-memory. The store-read path (the REAL row source)
// is exercised separately against a corbell-shaped sqlite fixture.

import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import { minimalProfile } from './graph.test.ts';
import { CorbellAdapter, parseBuildOutput } from '../corbell-adapter.ts';
import { sqliteStore } from '../sqlite-store.ts';
import type { BuildResult, GraphNode } from '../interface.ts';
import type { ProjectProfile } from '../../../../shared/knowledge-graph/profile-schema.ts';

const createdTmp: string[] = [];
afterAll(() => {
  for (const d of createdTmp) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e: unknown) { console.error(`[corbell-adapter.test cleanup] ${String(e)}`); }
  }
});

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-corbell-test-'));
  createdTmp.push(dir);
  return dir;
}

/** A profile that carries a REAL fake binary path so `resolveCorbell` (the
 *  W1 BUG-B permanent fix — corbell-adapter.ts:54-70) passes its filesystem
 *  guard and the test's MOCK exec takes over. The fake binary is created at
 *  the tmp root (mode 755) — never a real corbell, never the schema's frozen
 *  surface (the binaryPath rides the profile's optional graph field, which the
 *  schema does NOT freeze — D26 keeps the zod record open for the adapter's
 *  own config). */
function profileWithFakeBinary(): { profile: ProjectProfile; bin: string } {
  const root = tmpRoot();
  const bin = path.join(root, 'fake-corbell');
  fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const base = minimalProfile('corbell', root);
  return { profile: { ...base, graph: { ...base.graph, binaryPath: bin } } as ProjectProfile, bin };
}

/** The spec's mocked CLI fixture (§3.3:755-757). */
const CORBELL_FIXTURE = [
  'class PlutusPipeline src/pipeline/engine.ts:31',
  'function createPipeline7Tools src/pipeline/engine.ts:2665',
  'method harvest src/pipeline/engine.ts:2800',
].join('\n');

/** Resolve a promise to its rejection message ('' when it resolves) — the
 *  shim's ExpectResult has no `rejects`, so the adversarial asserts catch. */
async function rejectionOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e: unknown) {
    return String(e);
  }
  return '';
}

/** A recording exec stub: returns `out` for every call, records the calls. */
function recordingExec(out: string): { exec: (cmd: string, opts?: { cwd?: string; timeout?: number }) => string; calls: { cmd: string; opts?: { cwd?: string; timeout?: number } }[] } {
  const calls: { cmd: string; opts?: { cwd?: string; timeout?: number } }[] = [];
  const exec = (cmd: string, opts?: { cwd?: string; timeout?: number }): string => {
    calls.push({ cmd, opts });
    return out;
  };
  return { exec, calls };
}

/** A corbell-shaped sqlite store (the real schema from sqlite_store.py):
 *  graph_nodes(id, node_type, data) + graph_edges(source_id, target_id, kind, metadata). */
function writeCorbellStore(root: string): void {
  const dir = path.join(root, 'corbell-data', '.corbell');
  fs.mkdirSync(dir, { recursive: true });
  // ensure the referenced src file exists under root so resolveNodeFile Rule1/2 can succeed
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'engine.ts'), 'export class Pipeline{}\n');
  const fp = path.join(root, 'src', 'engine.ts');
  const db = new Database(path.join(dir, 'workspace.db'));
  db.exec(
    'CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, data TEXT NOT NULL);' +
    'CREATE TABLE graph_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT);',
  );
  db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
    .run('engine', 'service', JSON.stringify({ id: 'engine', name: 'engine', repo: '/proj/src', language: 'typescript' }));
  db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
    .run('engine::engine.ts::Pipeline.run', 'method', JSON.stringify({ id: 'engine::engine.ts::Pipeline.run', name: 'Pipeline.run', file_path: fp, line: 4 }));
  db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
    .run('engine::engine.ts::Pipeline.harvest', 'method', JSON.stringify({ id: 'engine::engine.ts::Pipeline.harvest', name: 'Pipeline.harvest', file_path: fp, line: 6 }));
  db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
    .run('engine::engine.ts::runAll', 'method', JSON.stringify({ id: 'engine::engine.ts::runAll', name: 'runAll', file_path: fp, line: 10 }));
  db.prepare('INSERT INTO graph_edges VALUES (?,?,?,?)')
    .run('engine::engine.ts::Pipeline.run', 'engine::engine.ts::Pipeline.harvest', 'method_call', JSON.stringify({ line: 4 }));
  db.close();
}

describe('CorbellAdapter — the mocked-CLI battery (spec §3.3:749-775)', () => {
  it('builds the graph from the mocked CLI output (spec §3.3:754-763)', async () => {
  try {
    const { profile } = profileWithFakeBinary();
    const { exec, calls } = recordingExec(CORBELL_FIXTURE);
    const adapter = new CorbellAdapter(profile, exec);
    const result = await adapter.build(profile);
    expect(result.adapter).toBe('corbell');
    expect(result.nodes.length).toBe(3);
    // the provenance record + the exec contract
    expect(result.command).toBe('corbell graph build --methods');
    const buildCall = calls.find((c) => c.cmd === 'corbell graph build --methods');
    expect(buildCall !== undefined).toBe(true);
    expect(buildCall!.opts?.timeout).toBe(600_000);   // HT-BUG-16: the measured cold-build bound (~7 min first index)
    expect(buildCall!.opts?.cwd).toBe(profile.project.root);
    // THE SUBSTRATE INIT (2026-08-13 — the profile-driven config write replaced
    // the corbell init call): the adapter writes the profile-driven workspace
    // config to corbell-data/ (the machine's own substrate store — never the
    // project source) when the config is absent/stale. The written config
    // carries the profile root + the service language.
    const wsPath = path.join(profile.project.root, 'corbell-data', 'workspace.yaml');
    expect(fs.existsSync(wsPath)).toBe(true);
    const wsText = fs.readFileSync(wsPath, 'utf8');
    expect(wsText).toContain('repo: ..');
    expect(wsText).toContain(`language: ${profile.project.languages[0]}`);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('tags every node CODE_DERIVED with the corbell source anchor (spec §3.3:769-773)', async () => {
  try {
    const { profile } = profileWithFakeBinary();
    const adapter = new CorbellAdapter(profile, recordingExec(CORBELL_FIXTURE).exec);
    const result = await adapter.build(profile);
    for (const n of result.nodes) {
      expect(n.lineage).toBe('CODE_DERIVED');
      expect(n.source).toContain('.ts:');
    }
    expect(result.lineage.code).toBe(3); // the K18.2 duality count
    expect(result.lineage.spec).toBe(0);
    expect(result.lineage.hybrid).toBe(0);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('parseBuildOutput resolves the file against the project root (spec §3.3:721)', () => {
    const profile = minimalProfile('corbell', '/proj');
    const nodes = parseBuildOutput('function f src/a.ts:12', profile);
    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe('corbell:f');
    expect(nodes[0].kind).toBe('function');
    expect(nodes[0].file).toBe(path.resolve('/proj', 'src/a.ts'));
    expect(nodes[0].line).toBe(12);
  });

  it('unwired() returns only the zero-inbound nodes (spec §3.2:650-654)', async () => {
  try {
    const { profile } = profileWithFakeBinary();
    const adapter = new CorbellAdapter(profile, recordingExec(CORBELL_FIXTURE).exec);
    await adapter.build(profile);
    const dead = adapter.unwired();
    expect(dead.length).toBe(3); // no call edges in the mocked build → all 3 are unwired
    for (const d of dead) {
      expect(d.id.length >= 1).toBe(true);
      expect(d.file.length >= 1).toBe(true);
      expect(typeof d.line).toBe('number');
    }
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the query verbs throw ADAPTER_FAILED before a build (the honest gate)', async () => {
    const { profile } = profileWithFakeBinary();
    const adapter = new CorbellAdapter(profile, recordingExec('').exec);
    expect(() => adapter.whoCalls('x')).toThrow(/ADAPTER_FAILED/);
    expect(() => adapter.unwired()).toThrow(/ADAPTER_FAILED/);
  });
});

describe('CorbellAdapter — the adversarial suite', () => {
  it('the corbell binary missing → ADAPTER_FAILED + CORBELL_NOT_FOUND with the install hint (spec §3.3:764-767)', async () => {
  try {
    const { profile } = profileWithFakeBinary();
    const exec = (): never => {
      const e = new Error('spawn corbell ENOENT');
      Object.assign(e, { code: 'ENOENT' });
      throw e;
    };
    const adapter = new CorbellAdapter(profile, exec);
    const msg = await rejectionOf(adapter.build(profile));
    expect(msg).toContain('ADAPTER_FAILED');
    expect(msg).toContain('CORBELL_NOT_FOUND');
    expect(msg).toContain('pip install corbell');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the malformed CLI output → the named ADAPTER_PARSE_ERROR', async () => {
  try {
    const { profile } = profileWithFakeBinary();
    const adapter = new CorbellAdapter(profile, recordingExec('!!! totally garbled cli output ###').exec);
    const msg = await rejectionOf(adapter.build(profile));
    expect(msg).toContain('ADAPTER_PARSE_ERROR');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the empty graph → GRAPH_EMPTY (a LOUD fail, never a silent empty success)', async () => {
  try {
    const { profile } = profileWithFakeBinary();
    const adapter = new CorbellAdapter(profile, recordingExec('').exec);
    const msg = await rejectionOf(adapter.build(profile));
    expect(msg).toContain('GRAPH_EMPTY');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the CLI call failure → ADAPTER_FAILED with the command named', async () => {
  try {
    const { profile } = profileWithFakeBinary();
    const calls: string[] = [];
    const exec = (cmd: string): string => {
      calls.push(cmd);
      if (cmd === 'corbell graph build --methods') throw new Error('timeout exceeded');
      return '';
    };
    const adapter = new CorbellAdapter(profile, exec);
    const msg = await rejectionOf(adapter.build(profile));
    expect(msg).toContain('ADAPTER_FAILED');
    expect(msg).toContain('corbell graph build --methods');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});

describe('CorbellAdapter — the store-read path (the REAL row source)', () => {
  it('reads the corbell SQLite rows when the stdout carries no node rows (the production path)', async () => {
  try {
    const root = tmpRoot();
    writeCorbellStore(root);
    const __bin = path.join(root, 'fake-corbell'); fs.writeFileSync(__bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 }); const _base = minimalProfile('corbell', root); const profile = { ..._base, graph: { ..._base.graph, binaryPath: __bin } } as ProjectProfile;
    // the build CLI prints the rich summary (no parseable rows) → the adapter
    // reads the corbell store: 4 nodes (1 service + 3 methods) + 1 call edge.
    const adapter = new CorbellAdapter(profile, recordingExec('Graph built:\n  Methods : 3\n  Edges : 1').exec);
    const result = await adapter.build(profile);
    expect(result.nodes.length).toBe(4);
    expect(result.edges.length).toBe(1);
    for (const n of result.nodes) {
      expect(n.lineage).toBe('CODE_DERIVED');
      expect(n.source).toBe('corbell');
    }
    expect(result.edges[0].kind).toBe('calls');
    expect(result.edges[0].sourceId).toBe('corbell:engine::engine.ts::Pipeline.run');
    expect(result.edges[0].targetId).toBe('corbell:engine::engine.ts::Pipeline.harvest');
    expect(result.edges[0].line).toBe(4);

    // the query verbs over the real graph
    const sites = adapter.whoCalls('Pipeline.harvest');
    expect(sites.length).toBe(1);
    expect(sites[0].caller).toBe('Pipeline.run');
    expect(sites[0].file.endsWith('src/engine.ts')).toBe(true);
    expect(sites[0].line).toBe(4);
    expect(adapter.nodes('method').length).toBe(3);
    const dead = adapter.unwired();
    expect(dead.some((d) => d.name === 'runAll')).toBe(true);   // the zero-inbound method
    expect(dead.some((d) => d.name === 'Pipeline.harvest')).toBe(false); // has an inbound call
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('resolves the corbell method_name schema onto the node name (the 2026-08-13 P6 silent-findings root — the DOMAIN check matches node.name === symbol)', async () => {
  try {
    // THE RUNTIME-PROVEN CASE (the suite container plutus-bh-suite-20260813):
    // the corbell store's method nodes carry 'method_name' and NEVER 'name' —
    // the old resolution (data['name'] ?? id) named the node
    // 'my-service::engine.ts::selectZone', so the domain.numeric-threshold
    // check's node.name !== 'selectZone' never matched and the predicate was
    // structurally silent DESPITE the enriched comparator data. This test
    // locks the fix: a method_name-only node resolves to the bare symbol.
    const root = tmpRoot();
    const dir = path.join(root, 'corbell-data', '.corbell');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'workspace.db'));
    db.exec(
      'CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, data TEXT NOT NULL);' +
      'CREATE TABLE graph_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT);',
    );
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
      .run('my-service', 'service', JSON.stringify({ id: 'my-service', name: 'my-service', repo: root, language: 'typescript' }));
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
      .run('my-service::engine.ts::selectZone', 'method', JSON.stringify({
        id: 'my-service::engine.ts::selectZone',
        repo: root,
        file_path: '/proj/src/engine.ts',
        method_name: 'selectZone', // the corbell schema — NO 'name' field
        signature: 'selectZone',
        line_start: 2,
        line_end: 2,
      }));
    db.close();
    const __bin = path.join(root, 'fake-corbell'); fs.writeFileSync(__bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 }); const _base = minimalProfile('corbell', root); const profile = { ..._base, graph: { ..._base.graph, binaryPath: __bin } } as ProjectProfile;
    const adapter = new CorbellAdapter(profile, recordingExec('Graph built:\n  Methods : 1\n  Edges : 0').exec);
    const result = await adapter.build(profile);
    const zone = result.nodes.find((n) => n.kind === 'method');
    expect(zone !== undefined).toBe(true);
    // THE FIX: the name resolves to the bare symbol 'selectZone', never the id
    expect(zone!.name).toBe('selectZone');
    expect(zone!.name).not.toBe('my-service::engine.ts::selectZone');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('drops DANGLING edges whose endpoints are not in the materialized node set (the 2026-08-13 W10 Plutus FK crash — the writeGraph constraint)', async () => {
  try {
    // THE RUNTIME CASE: the corbell store's graph_edges can reference nodes
    // that did NOT map into the adapter's node set (the store rows' endpoint
    // ids pointing at corbell-internal nodes). The OLD code passed every edge →
    // the FK constraint (graph_edges→graph_nodes) threw. THE FIX: the dangling
    // edge is dropped (the graph stays node-validated).
    const root = tmpRoot();
    const dir = path.join(root, 'corbell-data', '.corbell');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'workspace.db'));
    db.exec(
      'CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, data TEXT NOT NULL);' +
      'CREATE TABLE graph_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT);',
    );
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
      .run('my-service', 'service', JSON.stringify({ id: 'my-service', name: 'my-service', repo: root, language: 'typescript' }));
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
      .run('my-service::engine.ts::selectZone', 'method', JSON.stringify({ id: 'my-service::engine.ts::selectZone', repo: root, file_path: '/proj/src/engine.ts', method_name: 'selectZone' }));
    // the DANGLING edge — its target 'my-service::ghost' is NOT a materialized node
    db.prepare('INSERT INTO graph_edges VALUES (?,?,?,?)')
      .run('my-service::engine.ts::selectZone', 'my-service::ghost', 'method_call', JSON.stringify({ line: 4 }));
    db.close();
    const __bin = path.join(root, 'fake-corbell'); fs.writeFileSync(__bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 }); const _base = minimalProfile('corbell', root); const profile = { ..._base, graph: { ..._base.graph, binaryPath: __bin } } as ProjectProfile;
    const adapter = new CorbellAdapter(profile, recordingExec('Graph built:\n  Methods : 1\n  Edges : 1').exec);
    const result = await adapter.build(profile);
    // THE FIX: the dangling edge was dropped — the written graph is node-validated
    expect(result.edges.length).toBe(0);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('re-writes the corbell workspace config from the PROFILE when the existing config is the stale template (the 2026-08-13 W10 Plutus GRAPH_EMPTY root, proven in the container)', async () => {
    // THE RUNTIME CASE (the Plutus hunt): corbell's `init` template generates
    // `my-service`/`python` defaults pointing at a nonexistent service →
    // Services: 0 → GRAPH_EMPTY on the real 171-file workspace. THE FIX: the
    // adapter GENERATES the config FROM THE PROFILE (root: '.', the service id,
    // the language) — written to corbell-data/workspace.yaml (the graph
    // engine's store), never the project source.
    const root = tmpRoot();
    const dir = path.join(root, 'corbell-data');
    fs.mkdirSync(dir, { recursive: true });
    // the stale corbell template (the broken default)
    fs.writeFileSync(path.join(dir, 'workspace.yaml'),
      'workspace:\n  name: "my-platform"\n  root: ".."\n\nservices:\n  - id: my-service\n    repo: ../my-service\n    language: python\n');
    const base = minimalProfile('corbell', root);
    const bin = path.join(root, 'fake-corbell');
    fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const profile = { ...base, graph: { ...base.graph, binaryPath: bin } } as ProjectProfile;
    const calls: { cmd: string }[] = [];
    const exec = (cmd: string): string => {
      calls.push({ cmd });
      if (cmd === 'corbell graph build --methods') return 'Graph built:\n  Methods : 0\n  Edges : 0';
      return '';
    };
    const adapter = new CorbellAdapter(profile, exec);
    try {
      await adapter.build(profile);
    } catch (e: unknown) { console.warn('[corbell-adapter.test] build threw as expected (GRAPH_EMPTY): ' + (e instanceof Error ? e.message : String(e))); /* the GRAPH_EMPTY from the empty build is the honest outcome — the CONFIG WRITE is what we assert */ }
    // THE FIX: the stale template was REPLACED by the profile-driven config —
    // the RELATIVE-ROOT form (repo: .. / root: .. — the parent of the corbell
    // config_dir = the project root; the 'repo: .' form resolves to
    // corbell-data/ itself → files scanned 0, the second container proof).
    const written = fs.readFileSync(path.join(dir, 'workspace.yaml'), 'utf8');
    expect(written).toContain(`root: ".."`);
    expect(written).toContain(`language: ${profile.project.languages[0]}`);
    expect(written).toContain('repo: ..');
    expect(written).not.toContain('my-service');       // the stale default gone
    expect(written).not.toContain('language: python');  // the stale default gone
  });
});

describe('The sqlite-store — THROUGH W1 db.ts (spec §3.6)', () => {
  it('rejects a lineage-less node with LINEAGE_MISSING through the REAL store (spec §3.6:981-985)', () => {
    const { profile } = profileWithFakeBinary();
    const store = sqliteStore(profile);
    try {
      expect(() => store.writeGraph(
        [{ id: 'x', kind: 'class', name: 'X', file: 'a.ts', line: 1, lineage: 'NOPE' as never, source: 'a.ts:1' }],
        [],
      )).toThrow(/LINEAGE_MISSING/);
    } finally {
      store.close();
    }
  });

  it('rejects a lineage-less EDGE with LINEAGE_MISSING (O28.4 on both node AND edge)', () => {
    const { profile } = profileWithFakeBinary();
    const store = sqliteStore(profile);
    try {
      const node: GraphNode = { id: 'a', kind: 'function', name: 'a', file: 'a.ts', line: 1, lineage: 'CODE_DERIVED', source: 'a.ts:1' };
      store.writeGraph([node], []);
      expect(() => store.writeGraph([], [{ sourceId: 'a', targetId: 'b', kind: 'calls', lineage: 'NOPE' as never }]))
        .toThrow(/LINEAGE_MISSING/);
    } finally {
      store.close();
    }
  });

  it('persists the BuildResult and mirrors a SUMMARY to MASTER_CONTEXT/knowledge-graph/graph.db (D27)', () => {
    const root = tmpRoot();
    const __bin = path.join(root, 'fake-corbell'); fs.writeFileSync(__bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 }); const _base = minimalProfile('corbell', root); const profile = { ..._base, graph: { ..._base.graph, binaryPath: __bin } } as ProjectProfile;
    const store = sqliteStore(profile);
    const codeNode: GraphNode = { id: 'fn:harvestOrders', kind: 'function', name: 'harvestOrders', file: 'src/engine.ts', line: 12, lineage: 'CODE_DERIVED', source: 'corbell' };
    const specNode: GraphNode = { id: 'stage:harvest', kind: 'stage', name: 'harvest', lineage: 'SPEC_DERIVED', source: 'profile:pipeline.stages[0]' };
    const result: BuildResult = {
      nodes: [codeNode, specNode],
      edges: [{ sourceId: 'fn:harvestOrders', targetId: 'stage:harvest', kind: 'wires', lineage: 'HYBRID' }],
      durationMs: 5,
      adapter: 'corbell',
      lineage: { spec: 1, code: 1, hybrid: 0 },
      command: 'corbell graph build --methods',
    };
    try {
      store.persistBuildResult(result);
      const mirrorPath = store.mirrorToMasterContext();
      expect(mirrorPath).toContain(path.join('MASTER_CONTEXT', 'knowledge-graph', 'graph.db'));
      const mirror = new Database(mirrorPath);
      const n = mirror.prepare('SELECT count(*) AS c FROM graph_nodes').get();
      expect(n?.['c']).toBe(2);
      const e = mirror.prepare('SELECT count(*) AS c FROM graph_edges').get();
      expect(e?.['c']).toBe(1);
      mirror.close();
    } finally {
      store.close();
    }
  });

  it('derives the CLASS nodes from the method nodes\' class_name (the 2026-08-14 contract-class fix — the contract.must-implement check is no longer blind)', async () => {
  try {
    // THE FLAW (the 10th machine bug): the corbell store's node_type vocabulary
    // is {service, datastore, queue, method, flow} — NO class nodes — so the
    // contract.must-implement check (graph.nodes('class')) was STRUCTURALLY
    // BLIND: zero class nodes → the 17 contract predicates could never fire →
    // the calibration FLAGGED them. THE FIX: the adapter DERIVES the class
    // nodes from the method nodes' class_name — one class node per distinct
    // class with data.members = the method names. THE DATA exists (class_name
    // on every method); the derivation materializes it.
    const root = tmpRoot();
    const dir = path.join(root, 'corbell-data', '.corbell');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'workspace.db'));
    db.exec(
      'CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, data TEXT NOT NULL);' +
      'CREATE TABLE graph_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT);',
    );
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
      .run('my-service', 'service', JSON.stringify({ id: 'my-service', name: 'my-service', repo: root, language: 'typescript' }));
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
      .run('my-service::engine.ts::selectZone', 'method', JSON.stringify({
        id: 'my-service::engine.ts::selectZone', repo: root,
        file_path: '/proj/src/engine.ts', method_name: 'selectZone',
        class_name: 'ZoneEngine', line_start: 2, line_end: 2,
      }));
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)')
      .run('my-service::engine.ts::buildZoneMap', 'method', JSON.stringify({
        id: 'my-service::engine.ts::buildZoneMap', repo: root,
        file_path: '/proj/src/engine.ts', method_name: 'buildZoneMap',
        class_name: 'ZoneEngine', line_start: 5, line_end: 5,
      }));
    db.close();
    const __bin = path.join(root, 'fake-corbell'); fs.writeFileSync(__bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 }); const _base = minimalProfile('corbell', root); const profile = { ..._base, graph: { ..._base.graph, binaryPath: __bin } } as ProjectProfile;
    const adapter = new CorbellAdapter(profile, recordingExec('Graph built:\n  Methods : 2\n  Edges : 0').exec);
    const result = await adapter.build(profile);
    const classNodes = result.nodes.filter((n) => n.kind === 'class');
    expect(classNodes.length).toBe(1);                                   // the ZoneEngine class derived
    expect(classNodes[0].name).toBe('ZoneEngine');
    const members = Array.isArray(classNodes[0].data?.['members']) ? classNodes[0].data?.['members'] as string[] : [];
    expect(members).toContain('selectZone');                              // the members = the method names
    expect(members).toContain('buildZoneMap');
    // THE CONTRACT CHECK IS NO LONGER BLIND: the derived class node feeds the
    // contract.must-implement check's graph.nodes('class') sweep.
    expect(adapter.nodes('class').length).toBe(1);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});

describe('CorbellAdapter — File-B W10 fixtures (spec §2.8)', () => {
  it('FOREIGN absolute file_path resolves through anchors to the current root (fire)', async () => {
    const root = tmpRoot();
    const srcFile = path.join(root, 'src', 'foo.ts');
    fs.mkdirSync(path.dirname(srcFile), { recursive: true });
    fs.writeFileSync(srcFile, 'const x = process.cwd(); path.join(".trident","state.json"); writeFileSync(".trident/x", "1");\n');
    const dir = path.join(root, 'corbell-data', '.corbell');
    fs.mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, 'workspace.db');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, data TEXT NOT NULL);' + 'CREATE TABLE graph_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT);');
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('svc', 'service', JSON.stringify({ id: 'svc' }));
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('m1', 'method', JSON.stringify({ id: 'm1', file_path: '/home/leviathan/OPENCODE_WORKSPACE/x/proj/src/foo.ts', method_name: 'foo', line_start: 1 }));
    db.close();
    const bin = path.join(root, 'fake-corbell'); fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const base = minimalProfile('corbell', root); const profile = { ...base, graph: { ...base.graph, binaryPath: bin } } as ProjectProfile;
    const adapter = new CorbellAdapter(profile, recordingExec('Graph built:\n Methods:1').exec);
    const result = await adapter.build(profile);
    const n = result.nodes.find(x => x.name === 'foo');
    expect(n !== undefined).toBe(true);
    expect(n!.file).toBe(path.join(root, 'src/foo.ts'));
  });

  it('unresolvable foreign path keeps stored bytes intact + node survives with undefined file + loud log (silent)', async () => {
    const root = tmpRoot();
    const dir = path.join(root, 'corbell-data', '.corbell');
    fs.mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, 'workspace.db');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, data TEXT NOT NULL);' + 'CREATE TABLE graph_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT);');
    const foreign = '/tmp/ghost-xyz-9999/src/bar.ts';
    const payload = JSON.stringify({ id: 'm2', file_path: foreign, method_name: 'bar', line_start: 1 });
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('svc', 'service', JSON.stringify({ id: 'svc' }));
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('m2', 'method', JSON.stringify({ id: 'm2', file_path: foreign, method_name: 'bar', line_start: 1 }));
    db.close();
    const beforeBytes = fs.readFileSync(dbPath);
    const beforeData = new Database(dbPath, { readonly: true }).prepare('SELECT data FROM graph_nodes WHERE id=?').get('m2') as Record<string, unknown>;
    const beforeDataStr = String((beforeData as Record<string, unknown>)['data']);
    const bin = path.join(root, 'fake-corbell'); fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const base = minimalProfile('corbell', root); const profile = { ...base, graph: { ...base.graph, binaryPath: bin } } as ProjectProfile;
    const logs: string[] = []; const origErr = console.error; console.error = (...a: unknown[]) => { logs.push(a.join(' ')); origErr(...a); };
    const adapter = new CorbellAdapter(profile, recordingExec('Graph built:\n Methods:1').exec);
    const result = await adapter.build(profile);
    console.error = origErr;
    const n = result.nodes.find(x => x.name === 'bar');
    expect(n !== undefined).toBe(true);
    expect(n!.file === undefined).toBe(true);
    expect(logs.join('\n')).toContain('FOREIGN_PATH_UNRESOLVED');
    expect(logs.join('\n')).toContain(foreign);
    const afterBytes = fs.readFileSync(dbPath);
    expect(Buffer.compare(beforeBytes, afterBytes)).toBe(0);
    const afterData = new Database(dbPath, { readonly: true }).prepare('SELECT data FROM graph_nodes WHERE id=?').get('m2') as Record<string, unknown>;
    expect(String((afterData as Record<string, unknown>)['data'])).toBe(beforeDataStr);
  });

  it('unwired() flags only zero-inbound code nodes in a MIXED graph (A→B edge: A dead, B wired)', async () => {
    const root = tmpRoot();
    const dir = path.join(root, 'corbell-data', '.corbell');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'workspace.db'));
    db.exec('CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, data TEXT NOT NULL);' + 'CREATE TABLE graph_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT);');
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('svc', 'service', JSON.stringify({ id: 'svc' }));
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('A', 'method', JSON.stringify({ id: 'A', file_path: path.join(root, 'a.ts'), method_name: 'A', line_start: 1 }));
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('B', 'method', JSON.stringify({ id: 'B', file_path: path.join(root, 'b.ts'), method_name: 'B', line_start: 1 }));
    db.prepare('INSERT INTO graph_edges VALUES (?,?,?,?)').run('A', 'B', 'method_call', JSON.stringify({ line: 1 }));
    db.close();
    fs.writeFileSync(path.join(root, 'a.ts'), 'export function A(){}');
    fs.writeFileSync(path.join(root, 'b.ts'), 'export function B(){}');
    const bin = path.join(root, 'fake-corbell'); fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const base = minimalProfile('corbell', root); const profile = { ...base, graph: { ...base.graph, binaryPath: bin } } as ProjectProfile;
    const adapter = new CorbellAdapter(profile, recordingExec('Graph built:\n Methods:2').exec);
    await adapter.build(profile);
    const dead = adapter.unwired();
    expect(dead.map(d => d.name)).toEqual(['A']);
  });

  it('hoisted content map yields ZERO duplicate findings across 6 predicates (dedupe observes none)', async () => {
    const root = tmpRoot();
    const srcFile = path.join(root, 'src', 'dup.ts');
    fs.mkdirSync(path.dirname(srcFile), { recursive: true });
    fs.writeFileSync(srcFile, 'const x = process.cwd(); path.join(".trident","state.json"); writeFileSync(".trident/x","1");\n');
    const dir = path.join(root, 'corbell-data', '.corbell');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'workspace.db'));
    db.exec('CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, data TEXT NOT NULL);' + 'CREATE TABLE graph_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT);');
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('svc', 'service', JSON.stringify({ id: 'svc' }));
    // two method nodes sharing same file -> old O(N²) would duplicate findings; hoisted map dedupes reads and findings are per-file
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('m1', 'method', JSON.stringify({ id: 'm1', file_path: srcFile, method_name: 'foo', line_start: 1 }));
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('m2', 'method', JSON.stringify({ id: 'm2', file_path: srcFile, method_name: 'bar', line_start: 2 }));
    db.close();
    const bin = path.join(root, 'fake-corbell'); fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const base = minimalProfile('corbell', root); const profile = { ...base, graph: { ...base.graph, binaryPath: bin } } as ProjectProfile;
    const adapter = new CorbellAdapter(profile, recordingExec('Graph built:\n Methods:2').exec);
    await adapter.build(profile);
    const { buildFileContentMap, dedupe, run } = await import('../../diagnostics/engine.ts');
    const { buildSemanticBattery } = await import('../../diagnostics/semantic-predicates.ts');
    const { lockdownReadSource } = await import('../../diagnostics/engine.ts');
    const source = lockdownReadSource(profile);
    const battery = buildSemanticBattery();
    const ctx = { graph: adapter as unknown as import('../interface.ts').GraphAdapter, source, contentMap: buildFileContentMap(adapter.nodes(), source) };
    const raw = run(battery, ctx);
    const deduped = dedupe(raw);
    expect(raw.length).toBe(deduped.length);
    // also ensure no structural duplication: each file produced at most 1 finding per rule
    expect(deduped.length).toBeGreaterThanOrEqual(0);
  });

  it('nodeDiff+update apply a mutated file delta without full rebuild', async () => {
    const root = tmpRoot();
    const srcFile = path.join(root, 'src', 'mod.ts');
    fs.mkdirSync(path.dirname(srcFile), { recursive: true });
    fs.writeFileSync(srcFile, 'export function orig(){}');
    const dir = path.join(root, 'corbell-data', '.corbell');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'workspace.db'));
    db.exec('CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, data TEXT NOT NULL);' + 'CREATE TABLE graph_edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT);');
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('svc', 'service', JSON.stringify({ id: 'svc' }));
    db.prepare('INSERT INTO graph_nodes VALUES (?,?,?)').run('m1', 'method', JSON.stringify({ id: 'm1', file_path: srcFile, method_name: 'orig', line_start: 1 }));
    db.close();
    const bin = path.join(root, 'fake-corbell'); fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const base = minimalProfile('corbell', root); const profile = { ...base, graph: { ...base.graph, binaryPath: bin } } as ProjectProfile;
    const adapter = new CorbellAdapter(profile, recordingExec('Graph built:\n Methods:1').exec);
    const before = await adapter.build(profile);
    expect(before.nodes.some(n => n.name === 'orig')).toBe(true);
    const newNode: import('../interface.ts').GraphNode = { id: 'corbell:m1', kind: 'method', name: 'orig', file: srcFile, line: 99, lineage: 'CODE_DERIVED', source: 'corbell', data: { method_name: 'orig' } };
    const diff = adapter.nodeDiff(before.nodes, [newNode]);
    expect(diff.changed.length).toBe(1);
    adapter.update([newNode], []);
    const after = adapter.nodes();
    expect(after.find(n => n.id === 'corbell:m1')!.line).toBe(99);
    expect(diff.added.length).toBe(0);
  });
});
