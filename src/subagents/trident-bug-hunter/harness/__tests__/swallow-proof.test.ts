import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GraphAdapter, GraphNode } from '../../graph/interface.ts';
import type { ReportWriterInput, ReportWriterResult } from '../../tools/report-writer.ts';
import { createMicroLoop } from '../micro-loop-machine.ts';

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-swallow-'));
const createdTmp: string[] = [tmpBase];

afterAll(() => {
  for (const d of createdTmp) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e: unknown) { console.warn(String(e)); }
  }
});

function makeFixture(name: string, corpusContent: string, bindings: Record<string, unknown>): { dir: string; profilePath: string } {
  const dir = path.join(tmpBase, name);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true }, include: ['src'] }, null, 2));
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), `export function deadThing(): number { return 42; }\nexport function runMain(): void { console.log('main'); }\nrunMain();\n`);
  const corpusFile = path.join(dir, 'corpus.md');
  fs.writeFileSync(corpusFile, corpusContent, 'utf8');
  const profile = {
    profileVersion: 1,
    project: { name: 'fixture-swallow', root: dir, languages: ['typescript'], entryPoints: ['src/index.ts'], build: 'bun build src/index.ts', test: 'bun test' },
    graph: { substrate: 'native-ast', scope: ['src'], excludes: [] },
    rules: { corpus: [corpusFile], bindings },
    pipeline: { stages: [{ id: 'harvest', entry: 'runMain', contract: 'the main entry runs' }] },
    history: { failureLogs: [] },
    awareness: { docs: [] },
  };
  const profilePath = path.join(dir, 'profile.json');
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  return { dir, profilePath };
}

function fixtureWriter(): (input: ReportWriterInput) => Promise<ReportWriterResult> {
  return async (input: ReportWriterInput) => {
    const masterDir = path.join(input.projectRoot, 'MASTER_CONTEXT');
    fs.mkdirSync(masterDir, { recursive: true });
    const reportPath = path.join(masterDir, `bug_hunter_report_v1.md`);
    const content = `# BUG-HUNT REPORT — v1\n\n- run_id: ${input.runId}\n- findings: ${input.findings.length}\n`;
    fs.writeFileSync(reportPath, content, 'utf8');
    return { reportPath, version: 1, bytes: Buffer.byteLength(content), findingsCount: input.findings.length, chunks: 1, truncated: false };
  };
}

describe('HUNT_NO_COVERAGE swallow-proof (HT-BUG-18 / W0 verification)', () => {
  it('battery 0 → INCONCLUSIVE with HUNT_NO_COVERAGE (never done+0)', async () => {
    const corpus = `# Empty corpus\n\nNo quoted rules here — battery compiles zero.\n`;
    const { dir, profilePath } = makeFixture('battery-zero', corpus, {});
    const machine = createMicroLoop({ targetPath: dir, profilePath, reportWriter: fixtureWriter() });
    machine.start({ type: 'START' });
    await machine.done();
    expect(machine.state.value).toBe('inconclusive');
    expect(machine.context.error ?? '').toContain('HUNT_NO_COVERAGE');
    expect(machine.context.error ?? '').toContain('state=inconclusive');
    expect(machine.context.findings.length).toBe(0);
    expect(machine.context.reportPath).toBe(null);
    const snap = machine.getSnapshot();
    expect(snap.state).toBe('inconclusive');
    expect(snap.result.state).toBe('inconclusive');
  });

  it('methodsScanned 0 via empty graph → INCONCLUSIVE with HUNT_NO_COVERAGE', async () => {
    const corpus = `# Fixture Corpus\n\n> Wiring: every exported function must be wired to a caller.\n`;
    const bindings = {
      declaredPredicates: {
        'P-dead': { template: 'wiring.no-dead-module', verbatimQuote: 'Wiring: every exported function must be wired to a caller.', anchor: 'corpus.md:3', severity: 'HIGH' },
      },
    };
    const { dir, profilePath } = makeFixture('methods-zero', corpus, bindings);
    const emptyGraphAdapter: GraphAdapter = {
      build: async () => ({ nodes: [], edges: [], durationMs: 1, adapter: 'native-ast' as const, lineage: { spec: 0, code: 0, hybrid: 0 } }),
      whoCalls: () => [],
      chain: () => [],
      imports: () => [],
      awaits: () => [],
      unwired: () => [],
      nodes: () => [] as GraphNode[],
    };
    const machine = createMicroLoop({ targetPath: dir, profilePath, adapter: emptyGraphAdapter, reportWriter: fixtureWriter() });
    machine.start({ type: 'START' });
    await machine.done();
    expect(machine.state.value).toBe('inconclusive');
    expect(machine.context.error ?? '').toContain('HUNT_NO_COVERAGE');
  });
});
