import { describe, expect, it } from 'bun:test';
import { detectProjectShape } from '../context/audit-project-context.ts';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Build a fixture project with the given files. */
function makeFixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projctx-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return dir;
}

describe('THE PROJECT-TYPE GATE (W2 — the score-cap fix, the L2 spec §3.2)', () => {
  it('the PLUGIN shape — the @opencode-ai/plugin import → UNGATED, no gated layers', async () => {
    const dir = makeFixture({
      'package.json': JSON.stringify({ name: 'my-plugin', main: 'dist/index.js' }),
      'src/index.ts': 'import { plugin } from "@opencode-ai/plugin"; export default plugin;',
    });
    const ctx = await detectProjectShape(dir);
    expect(ctx.shape).toBe('plugin');
    expect(ctx.isPlugin).toBe(true);
    expect(ctx.gateVerdict).toBe('UNGATED');
    expect(ctx.gatedLayers).toEqual([]);
  });

  it('the LIBRARY shape — no plugin import + a library entry → GATED, the plugin layers excluded', async () => {
    const dir = makeFixture({
      'package.json': JSON.stringify({ name: 'payment-dirty', exports: './dist/index.js' }),
      'src/index.ts': 'export function chargeCard(amount: number): boolean { return amount > 0; }',
    });
    const ctx = await detectProjectShape(dir);
    expect(ctx.shape).toBe('library');
    expect(ctx.isPlugin).toBe(false);
    expect(ctx.gateVerdict).toBe('GATED');
    expect(ctx.gatedLayers).toContain('R1');      // the plugin-specific layer gated
    expect(ctx.gatedLayers).toContain('R15');
    expect(ctx.gatedLayers).toContain('R16');
  });

  it('the APP shape — a main entry + no library exports → GATED', async () => {
    const dir = makeFixture({
      'package.json': JSON.stringify({ name: 'my-app', main: 'dist/index.js' }),
      'src/index.ts': 'export const app = "server";',
    });
    const ctx = await detectProjectShape(dir);
    expect(ctx.shape).toBe('app');
    expect(ctx.gateVerdict).toBe('GATED');
    expect(ctx.gatedLayers).toContain('R1');
  });

  it('the MONOREPO shape — the packages/ dir or the workspaces field → GATED', async () => {
    const dir = makeFixture({
      'package.json': JSON.stringify({ name: 'mono', workspaces: ['packages/*'] }),
      'packages/a/package.json': JSON.stringify({ name: 'a' }),
    });
    const ctx = await detectProjectShape(dir);
    expect(ctx.shape).toBe('monorepo');
    expect(ctx.gateVerdict).toBe('GATED');
  });

  it('the INDETERMINATE shape — nothing decisive → the conservative default (gated OFF)', async () => {
    const dir = makeFixture({
      'src/index.ts': 'export const x = 1;',
    });
    const ctx = await detectProjectShape(dir);
    expect(ctx.shape).toBe('indeterminate');
    expect(ctx.gateVerdict).toBe('INDETERMINATE');
    expect(ctx.gatedLayers).toContain('R1');      // the conservative gate-off
  });

  it('the scoreWeights preserve the audit\'s 15/8/3/1 base table', async () => {
    const dir = makeFixture({
      'package.json': JSON.stringify({ name: 'lib', exports: './dist/index.js' }),
      'src/index.ts': 'export const x = 1;',
    });
    const ctx = await detectProjectShape(dir);
    expect(ctx.scoreWeights.CRITICAL).toBe(15);
    expect(ctx.scoreWeights.HIGH).toBe(8);
    expect(ctx.scoreWeights.MEDIUM).toBe(3);
    expect(ctx.scoreWeights.LOW).toBe(1);
  });
});
