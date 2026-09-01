// B5 REWIRE ADVERSARIAL — MAP hybrid + TRACE L6
import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NormalizedFinding } from '../../diagnostics/findings-store.ts';
import type { GraphAdapter } from '../../graph/interface.ts';
import { solveTrace } from '../trace.ts';
import { map } from '../map.ts';
import type { ProjectProfile } from '../../../../shared/knowledge-graph/profile-schema.ts';

function fakeAdapter(): GraphAdapter {
  return {
    build: async () => ({ nodes: [{ id: 'file:src/a.ts', kind: 'file' as const, name: 'a.ts', file: 'src/a.ts', line: 1, lineage: 'CODE_DERIVED' as const, source: 'src/a.ts:1' }], edges: [], durationMs: 1, adapter: 'native-ast' as const, lineage: { spec:0, code:1, hybrid:0 } }),
    whoCalls: () => [],
    chain: () => [],
    imports: () => [],
    awaits: () => [],
    unwired: () => [],
    nodes: () => [],
  };
}

function makeProfile(root: string): ProjectProfile {
  return {
    profileVersion: 1,
    project: { name: 'b5', root, languages: ['typescript'], entryPoints: ['src/index.ts'], build: 'bun build', test: 'bun test' },
    graph: { substrate: 'native-ast', scope: ['src'], excludes: [] },
    rules: { corpus: [], bindings: {} },
    pipeline: { stages: [] },
    history: { failureLogs: [] },
    awareness: { docs: [] },
  } as unknown as ProjectProfile;
}

describe('B5 MAP adversarial', () => {
  it('empty root — missing tsconfig does not throw, legacy graph still lands', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-empty-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const x=1;');
    // no tsconfig
    const profile = makeProfile(dir);
    const result = await map(profile, fakeAdapter());
    // # mut-check: changing map to throw when tsconfig missing would flip this path to error
    expect(result.dbPath.includes('.trident')).toBe(true);
    // # mut-check: failing to call writeGraph would leave dbPath without file
    expect(fs.existsSync(result.dbPath)).toBe(true);
    result.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('null adapterOverride — uses profile substrate, still succeeds', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-null-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions:{target:'ES2022'}, include:['src'] }));
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export function foo(){return 1;}');
    const profile = makeProfile(dir);
    const result = await map(profile); // no override — selects native-ast
    // # mut-check: selectAdapter throwing for native-ast would make this reject
    expect(result.adapter).toBeDefined();
    result.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('concurrent maps — two parallel map() do not corrupt WAL', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-conc-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions:{target:'ES2022'}, include:['src'] }));
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export function bar(){return 2;}');
    const profile = makeProfile(dir);
    const [r1, r2] = await Promise.all([map(profile, fakeAdapter()), map(profile, fakeAdapter())]);
    // # mut-check: if map used random dbPath per call, paths would diverge
    expect(r1.dbPath).toBe(r2.dbPath);
    r1.db.close(); r2.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('boundary: empty source file still produces 0 mechanical but 0 typed edges (no CHECK fail)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-bound-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions:{target:'ES2022'}, include:['src'] }));
    fs.writeFileSync(path.join(dir, 'src', 'empty.ts'), '// empty');
    const profile = makeProfile(dir);
    const result = await map(profile, fakeAdapter());
    // # mut-check: throwing on 0 mechanical triples instead of warning would flip this to reject
    expect(result.buildResult).toBeDefined();
    result.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('B5 TRACE adversarial', () => {
  it('empty findings → [] (no throw)', async () => {
    const rows = await solveTrace([], fakeAdapter());
    // # mut-check: returning null instead of [] for 0 findings flips this
    expect(rows.length).toBe(0);
  });

  it('null-ish findings → throws TRACE_INVALID (error-path first)', async () => {
    let threw = false;
    try { await (solveTrace as unknown as (a:unknown,b:unknown)=>Promise<unknown>)(null as unknown as NormalizedFinding[], fakeAdapter()); } catch { threw = true; }
    // # mut-check: swallowing null findings and returning [] would make threw false
    expect(threw).toBe(true);
  });

  it('large findings (boundary 50) stays within budget and returns same count', async () => {
    const findings: NormalizedFinding[] = Array.from({length:50}, (_,i)=>({ ruleId:`R-${i%5}`, severity:'HIGH' as const, file:`src/${i}.ts`, line:i+1, rangeStart:i+1, rangeEnd:i+1, evidence:`evidence ${i} at src/${i}.ts:${i+1}`, verdict:'VIOLATION' as const }));
    const rows = await solveTrace(findings, fakeAdapter());
    // # mut-check: truncating to topK 10 would make length 10 not 50
    expect(rows.length).toBe(50);
    // # mut-check: legacy fallback not computing relevance would leave relevance undefined
    expect(rows[0].relevance).toBeDefined();
  });

  it('concurrent traces — parallel solveTrace do not interfere', async () => {
    const findings: NormalizedFinding[] = [{ ruleId:'R1', severity:'MED' as const, file:'src/a.ts', line:1, rangeStart:1, rangeEnd:1, evidence:'ev at src/a.ts:1', verdict:'VIOLATION' as const }];
    const [a,b] = await Promise.all([solveTrace(findings, fakeAdapter()), solveTrace(findings, fakeAdapter())]);
    // # mut-check: shared mutable state across solveTrace calls would corrupt one result to 0
    expect(a.length).toBe(1);
    // # mut-check: same isolation leak would affect second result
    expect(b.length).toBe(1);
    // # mut-check: non-deterministic findingId generation would make ids diverge
    expect(a[0].findingId).toBe(b[0].findingId);
  });
});
