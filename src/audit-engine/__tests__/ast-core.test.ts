import { describe, expect, it } from 'bun:test';
import { buildScopedProgram, AST_ERRORS } from '../ast/audit-ast-core.ts';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Build a small fixture project with the given .ts files. */
function makeFixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-core-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return dir;
}

describe('THE RAM-SAFE AST CORE (W1 — the S2-feeding contracts)', () => {
  it('the TypeChecker is PRESENT on a multi-file project (the >40-file dropout GONE)', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      files[`src/mod${i}.ts`] = `export function fn${i}(x: number): number { return x + ${i}; }`;
    }
    files['src/index.ts'] = 'import { fn0 } from "./mod0.js"; export const r = fn0(1);';
    const dir = makeFixture(files);
    const ctx = await buildScopedProgram(dir, { fileCap: 1000 });
    expect(ctx.ok).toBe(true);
    expect(ctx.checker !== null).toBe(true);               // THE 40-FILE DROPOUT GONE — the checker is the value
    expect(ctx.program !== null).toBe(true);
    expect(ctx.fileCount > 40).toBe(true);                 // 51 files — over the old 40 limit
    expect(ctx.constructs.length > 50).toBe(true);         // the constructs extracted
    expect(ctx.chunked).toBe(false);                        // the sync path on a 51-file target (under the cap)
  });

  it('the call graph is POPULATED on a multi-file project', async () => {
    const dir = makeFixture({
      'src/a.ts': 'export function a() { return 1; }',
      'src/b.ts': 'import { a } from "./a.js"; export function b() { return a(); }',
    });
    const ctx = await buildScopedProgram(dir, {});
    expect(ctx.ok).toBe(true);
    expect(ctx.callGraph.totalCallSites > 0).toBe(true);    // the graph populated on EVERY project size
  });

  it('the RAM guard engages the CHUNKED path on a tiny memory budget (the AST_RAM_GUARD → the chunked)', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      files[`src/m${i}.ts`] = `export function g${i}(x: number): number { return x * ${i}; }`;
    }
    files['src/index.ts'] = 'export const v = 1;';
    const dir = makeFixture(files);
    const ctx = await buildScopedProgram(dir, { memoryBudgetMb: 1 }); // 1MB — always trips the RSS guard
    expect(ctx.ok).toBe(true);
    expect(ctx.chunked).toBe(true);                         // the async path, never the freeze
    expect(ctx.checker !== null).toBe(true);                // the checker PRESENT even on the chunked path
  });

  it('the SCOPE LAW — a whole-workspace attempt is AST_SCOPE_VIOLATION', async () => {
    // The HOME dir — the whole-workspace class (the scope law fires BEFORE any walk)
    const ctx = await buildScopedProgram(os.homedir(), {});
    expect(ctx.ok).toBe(false);
    expect(ctx.namedError).toContain(AST_ERRORS.AST_SCOPE_VIOLATION);
  });

  it('the FAIL-CLOSED — an empty target is EMPTY_TARGET, never a silent pass', async () => {
    const dir = makeFixture({});                            // no source files
    const ctx = await buildScopedProgram(dir, {});
    expect(ctx.ok).toBe(false);
    expect(ctx.namedError).toContain(AST_ERRORS.EMPTY_TARGET);
    expect(ctx.checker === null).toBe(true);
  });

  it('the REAL POSITIONS — the constructs carry the real ts positions', async () => {
    const dir = makeFixture({
      'src/index.ts': 'export function hello(): string { return "world"; }',
    });
    const ctx = await buildScopedProgram(dir, {});
    expect(ctx.ok).toBe(true);
    const fn = ctx.constructs.find((c) => c.name === 'hello');
    expect(fn !== undefined).toBe(true);
    expect(fn!.line).toBeGreaterThanOrEqual(1);             // the 1-indexed ts.getLineAndCharacterOfPosition
  });

  it('the DETERMINISM — same target → identical construct rows', async () => {
    const dir = makeFixture({
      'src/index.ts': 'export function f(): number { return 42; }',
    });
    const a = await buildScopedProgram(dir, {});
    const b = await buildScopedProgram(dir, {});
    expect(JSON.stringify(a.constructs.map((c) => ({ type: c.type, name: c.name, line: c.line }))))
      .toBe(JSON.stringify(b.constructs.map((c) => ({ type: c.type, name: c.name, line: c.line }))));
  });

  it('the SCOPE EXCLUSIONS — node_modules/dist/dot-dirs are never walked', async () => {
    const dir = makeFixture({
      'src/index.ts': 'export const ok = 1;',
      'src/node_modules/evil.ts': 'export const evil = true;',
      'src/dist/bundle.ts': 'export const bundled = true;',
    });
    const ctx = await buildScopedProgram(dir, {});
    expect(ctx.ok).toBe(true);
    const evil = ctx.constructs.find((c) => c.filePath.includes('node_modules'));
    const bundled = ctx.constructs.find((c) => c.filePath.includes('dist'));
    expect(evil === undefined).toBe(true);
    expect(bundled === undefined).toBe(true);
  });
});
