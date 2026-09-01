// src/subagents/trident-bug-hunter/harness/__tests__/machine.test.ts
// THE MICRO-LOOP MACHINE TESTS (W7, K13.1, spec §6.5:2798-2834 — the C7 test
// pseudocode transcribed). THE four 6.5 scenarios:
//   (1) the happy walk — IDLE→RECON→MAP→SCAN→TRACE→STRIKE→REPORT→DONE with the
//       findings + the report path (2801-2808);
//   (2) the INCONCLUSIVE fail-state on a nonexistent profile — the named
//       /PROFILE_INVALID|CORPUS_MISSING/ (2810-2815);
//   (3) the empty-corpus honest zero — DONE + findings 0 + the report still
//       lands (2818-2824);
//   (4) the adapter failure — the corbell binary missing → the named
//       /ADAPTER_FAILED/ (2827-2832).
// PLUS the adversarial additions (the 6.5 "never a silent pass" spirit): the
// failing report-writer → INCONCLUSIVE with the named GENERATION_FAILED.
//
// THE FIXTURES: real tmpdir projects (NEVER the real Plutus_Agent — the W10
// curation). The graph is built by the NATIVE-AST adapter (a real tsconfig +
// a real src tree — the corbell binary is absent in the unit battery by
// design); the battery fires via the profile's declaredPredicates bindings
// (the W4 compileDeclared path). The report-writer is the injected seam (the
// deterministic writer writes the real MASTER_CONTEXT file — never a network
// call in the unit battery).
//
// THE MATCHER SURFACE: the assertions conform to W1's ambient bun:test shim
// (bun-modules.d.ts — toBe/toEqual/toContain/toThrow + not). The regex
// assertions use the explicit test() capture form (the shim has no toMatch).

import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GraphAdapter, GraphNode } from '../../graph/interface.ts';
import type { ReportWriterInput, ReportWriterResult } from '../../tools/report-writer.ts';
import { createMicroLoop } from '../micro-loop-machine.ts';

// ---------------------------------------------------------------------------
// THE FIXTURE FACTORY — a real native-ast project (tsconfig + src + corpus)
// ---------------------------------------------------------------------------

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-machine-'));
const createdTmp: string[] = [tmpBase];

afterAll(() => {
  for (const d of createdTmp) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (e: unknown) {
      console.error(`[machine.test cleanup] failed to remove ${d}: ${String(e)}`);
    }
  }
});

/** Create a fixture project dir: tsconfig + src/index.ts + the corpus. The src
 *  carries the dead function the wiring predicate fires on. */
function makeFixture(name: string): string {
  const dir = path.join(tmpBase, name);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true },
    include: ['src'],
  }, null, 2));
  // THE DIRTY SOURCE: `deadThing` is never called — the wiring.no-dead-module
  // predicate (declaredPredicates) fires on it via the native-ast unwired().
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), `
export function deadThing(): number {
  return 42;
}
export function runMain(): void {
  console.log('main');
}
runMain();
`);
  return dir;
}

const HAPPY_CORPUS = `# Fixture Corpus

The machine's rules live here as verbatim quotes.

> Wiring: every exported function must be wired to a caller.
> Process: the declared stages must gate on outputs, not logic.
`;

const EMPTY_CORPUS = `# Fixture Corpus

This corpus contains no quoted rules — the battery compiles to zero
predicates. The run must report the honest zero, never a fake clean.
`;

function writeProfile(dir: string, opts: { emptyCorpus?: boolean } = {}): string {
  const corpusFile = opts.emptyCorpus ? 'corpus-empty.md' : 'corpus.md';
  fs.writeFileSync(path.join(dir, corpusFile), opts.emptyCorpus ? EMPTY_CORPUS : HAPPY_CORPUS);
  const profile = {
    profileVersion: 1,
    project: {
      name: 'fixture',
      root: dir,
      languages: ['typescript'],
      entryPoints: ['src/index.ts'],
      build: 'bun build src/index.ts',
      test: 'bun test',
    },
    graph: { substrate: 'native-ast', scope: ['src'], excludes: [] },
    rules: {
      corpus: [path.join(dir, corpusFile)],
      bindings: opts.emptyCorpus ? {} : {
        declaredPredicates: {
          'P-dead': {
            template: 'wiring.no-dead-module',
            verbatimQuote: 'Wiring: every exported function must be wired to a caller.',
            anchor: 'corpus.md:5',
            severity: 'HIGH',
          },
        },
      },
    },
    pipeline: {
      stages: [{ id: 'harvest', entry: 'runMain', contract: 'the main entry runs' }],
    },
    history: { failureLogs: [] },
    awareness: { docs: [] },
  };
  const profilePath = path.join(dir, 'profile.json');
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  return profilePath;
}

/** THE DETERMINISTIC REPORT WRITER SEAM — writes the real MASTER_CONTEXT
 *  report (the LOCKED path, N-versioning) — never a network call. */
function fixtureWriter(): (input: ReportWriterInput) => Promise<ReportWriterResult> {
  return async (input: ReportWriterInput) => {
    const masterDir = path.join(input.projectRoot, 'MASTER_CONTEXT');
    fs.mkdirSync(masterDir, { recursive: true });
    const existing = fs.readdirSync(masterDir)
      .filter((n) => /^bug_hunter_report_v\d+\.md$/.test(n))
      .map((n) => Number(n.match(/v(\d+)/)?.[1] ?? 0));
    const version = existing.length === 0 ? 1 : Math.max(...existing) + 1;
    const reportPath = path.join(masterDir, `bug_hunter_report_v${version}.md`);
    const content = `# BUG-HUNT REPORT — v${version}\n\n- run_id: ${input.runId}\n- findings: ${input.findings.length}\n`;
    fs.writeFileSync(reportPath, content, 'utf-8');
    return {
      reportPath,
      version,
      bytes: Buffer.byteLength(content),
      findingsCount: input.findings.length,
      chunks: 1,
      truncated: false,
    };
  };
}

/** THE ADAPTER-FAILURE STUB — build() throws the named ADAPTER_FAILED (the
 *  corbell-binary-missing class, spec §6.5:2827). */
function failingAdapter(): GraphAdapter {
  const empty: GraphNode[] = [];
  return {
    build: async () => {
      throw new Error('ADAPTER_FAILED: command=corbell --help detail=CORBELL_NOT_FOUND - the corbell binary is missing');
    },
    whoCalls: () => [],
    chain: () => [],
    imports: () => [],
    awaits: () => [],
    unwired: () => [],
    nodes: () => empty,
  };
}

// ---------------------------------------------------------------------------
// THE 6.5 SCENARIOS
// ---------------------------------------------------------------------------

describe('THE BUG-HUNTER MICRO-LOOP (K13.1)', () => {
  it('walks IDLE→RECON→MAP→SCAN→TRACE→STRIKE→REPORT→DONE on the happy path', async () => {
  try {
    const dir = makeFixture('happy');
    const profilePath = writeProfile(dir);
    const machine = createMicroLoop({ targetPath: dir, profilePath, reportWriter: fixtureWriter() });
    machine.start({ type: 'START' });
    await machine.done();
    expect(machine.state.value).toBe('done');
    expect(machine.context.findings.length).toBeGreaterThanOrEqual(1);
    expect(/bug_hunter_report_v\d+\.md/.test(machine.context.reportPath ?? '')).toBe(true);
    // the intended-behavior summary landed (the data-derived counts)
    expect(machine.context.intendedBehavior?.stages).toBe(1);
    expect(machine.context.intendedBehavior?.corpusCount).toBe(1);
    // the fix order landed (the strike's worklist)
    expect(machine.context.fixOrder.length).toBeGreaterThanOrEqual(1);
    // the HUNT_DONE event row landed in the shared db (the side effect)
    const dbPath = path.join(dir, '.trident', 'knowledge-graph', 'shared.db');
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(machine.context.error).toBe(null);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('transitions to INCONCLUSIVE on an actor failure — never a silent pass (K6.2)', async () => {
  try {
    const dir = makeFixture('inconclusive');
    const machine = createMicroLoop({ targetPath: dir, profilePath: '/nonexistent/profile.yaml', reportWriter: fixtureWriter() });
    machine.start({ type: 'START' });
    await machine.done();
    expect(machine.state.value).toBe('inconclusive');        // the fail-state (O3.5)
    expect(/PROFILE_INVALID|CORPUS_MISSING/.test(machine.context.error ?? '')).toBe(true);  // the NAMED error
    // the fail-state carries NO report path (no side effect without success)
    expect(machine.context.reportPath).toBe(null);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('handles the empty corpus — the battery compiles to zero predicates but the run still reports', async () => {
  try {
    const dir = makeFixture('empty-corpus');
    const profilePath = writeProfile(dir, { emptyCorpus: true });
    const machine = createMicroLoop({ targetPath: dir, profilePath, reportWriter: fixtureWriter() });
    machine.start({ type: 'START' });
    await machine.done();
    expect(machine.state.value).toBe('done');
    expect(machine.context.findings.length).toBe(0);         // zero findings is a VALID outcome (a clean project)
    expect(/\.md$/.test(machine.context.reportPath ?? '')).toBe(true); // the report still lands (the honest empty report)
    expect(machine.context.error).toBe(null);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('handles the adapter failure — the corbell binary missing → the named ADAPTER_FAILED', async () => {
  try {
    const dir = makeFixture('adapter-fail');
    const profilePath = writeProfile(dir);
    const machine = createMicroLoop({ targetPath: dir, profilePath, adapter: failingAdapter(), reportWriter: fixtureWriter() });
    machine.start({ type: 'START' });
    await machine.done();
    expect(machine.state.value).toBe('inconclusive');
    expect(/ADAPTER_FAILED/.test(machine.context.error ?? '')).toBe(true);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('transitions to INCONCLUSIVE on a report-writer failure — the side effect never lands (never a silent pass)', async () => {
  try {
    const dir = makeFixture('report-fail');
    const profilePath = writeProfile(dir);
    const machine = createMicroLoop({
      targetPath: dir,
      profilePath,
      reportWriter: async () => {
        throw new Error('GENERATION_FAILED: stage=transport detail=the provider returned 500');
      },
    });
    machine.start({ type: 'START' });
    await machine.done();
    expect(machine.state.value).toBe('inconclusive');
    expect(/GENERATION_FAILED/.test(machine.context.error ?? '')).toBe(true);
    expect(machine.context.reportPath).toBe(null);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});
