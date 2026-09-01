// src/shared/knowledge-graph/profile.test.ts
// The loader test suite — the spec cases (§3.1 lines 501-529 + the §8.x
// cross-checks at lines 4054-4066) PLUS the adversarial additions.
// The fixtures are INLINE + SELF-CONTAINED (tmpdir-created corpus/docs) — the
// tests NEVER point at the real Plutus_Agent.
// A test that cannot fail is a defect — every fixture is mutation-checked.

import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProfile } from './profile-loader.ts';

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-profile-test-'));
const createdTmp: string[] = [tmpBase];

afterAll(() => {
  for (const d of createdTmp) {
    try { fs.rmSync(d, { recursive: true, force: true }); }
    catch (e: unknown) { console.error(`[profile.test cleanup] failed to remove ${d}: ${String(e)}`); }
  }
});

/** Create a throwaway project root with the corpus + failure-log files physically present. */
function makeProject(): string {
  const root = fs.mkdtempSync(path.join(tmpBase, 'proj-'));
  createdTmp.push(root);
  fs.mkdirSync(path.join(root, 'MASTER_CONTEXT'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'MASTER_CONTEXT', 'SPEC.md'), '# the spec\n');
  fs.writeFileSync(path.join(root, 'MASTER_CONTEXT', 'FAILURE_LOG.md'), '# the log\n');
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const x = 1;\n');
  return root;
}

function writeProfile(root: string, filename: string, content: string): string {
  const p = path.join(root, filename);
  fs.writeFileSync(p, content);
  return p;
}

/** The valid Plutus-shaped fixture (matches the §8.2 profile.yaml shape): name
 * plutus-ts, substrate corbell, 8 stages (>= 7), the P1 binding. The corpus +
 * failure logs are physically created by makeProject(). Exercises: nested block
 * mappings, block scalar sequences, block multi-line map sequences (stages),
 * flow arrays, nested flow maps, dotted keys, quoted strings with colons,
 * inline + full-line comments, integers + floats + large ints. */
function validProfileYaml(root: string): string {
  return `
# the first ProjectProfile (C24) — the machine is the constant, this file is the variable.
profileVersion: 1            # frozen at W1 (D26); a field addition bumps + amends the spec

project:
  name: plutus-ts
  root: ${root}
  languages: [typescript, python]
  entryPoints:
    - src/index.ts
    - report-v452.ts
  build: "bun build src/index.ts --outdir dist --target bun --format esm --bundle"
  test: "bun test"

graph:
  substrate: corbell                    # the primary adapter (D2)
  scope: [src, identity, MASTER_CONTEXT]
  excludes: [node_modules, dist, .trident]

rules:
  corpus:                                 # the awareness set the compiler consumes
    - MASTER_CONTEXT/SPEC.md
    - MASTER_CONTEXT/FAILURE_LOG.md
  bindings:
    P1: { anchorNodeKinds: ['e3-anchor'], mustTraceTo: ['e1-zone', 'e2-projection'] }
    P4: { maxDivergence: 0.35 }
    p8.slCeiling: 20
    p15.forwardSpreads: { EUR: 1, AUD: 1.5, GBP: 2, DXY: 0.02 }
    p21.analysisPointMs: 1783317600000

pipeline:
  stages:                                     # THE 7-TOOL D5 CHAIN + the report-v452 path
    - id: harvest
      entry: "harvestOrders"
      contract: "the temporal filter: timestamp <= anchor + 60s"
    - id: zones
      entry: "buildZoneMap"
      contract: "ONE zone map, optionsData in BILLIONS, mergeLqzWithIpZones wired"
    - id: reason-step-a
      entry: "reasonStepA"
      contract: "every designation.zoneId in the zone map; rationale >= 40 chars"
    - id: shapes
      entry: "buildDayShapes"
      contract: "the per-pair dedicated chains; the E2 designation"
    - id: reason-step-b
      entry: "reasonStepB"
      contract: "the 11-token ledger + the WARN set + the E3-NEVER anchors"
    - id: setups
      entry: "buildSetups"
      contract: "the frozen snapshot; placed=true -> FROZEN_SNAPSHOT"
    - id: gate
      entry: "runGate"
      contract: "G1-G10 + A1-A7 verdicts + resetContext"
    - id: report-v452
      entry: "report-v452.ts:6-40"
      contract: "load bars -> buildChartModel [E1] -> report_v452.md"

history:
  failureLogs:
    - MASTER_CONTEXT/FAILURE_LOG.md

awareness:
  docs:
    - MASTER_CONTEXT/SPEC.md
`;
}

/** The valid fixture as JSON (the .json parse branch). */
function validProfileJson(root: string): string {
  return JSON.stringify({
    profileVersion: 1,
    project: {
      name: 'plutus-ts',
      root,
      languages: ['typescript', 'python'],
      entryPoints: ['src/index.ts'],
      build: 'bun build',
      test: 'bun test',
    },
    graph: { substrate: 'corbell', scope: ['src'], excludes: [] },
    rules: { corpus: ['MASTER_CONTEXT/SPEC.md'], bindings: { P1: { anchorNodeKinds: ['e3-anchor'] } } },
    pipeline: {
      stages: [
        { id: 'harvest', entry: 'harvestOrders', contract: 'the temporal filter' },
        { id: 'zones', entry: 'buildZoneMap', contract: 'ONE zone map' },
      ],
    },
    history: { failureLogs: [] },
    awareness: { docs: [] },
  }, null, 2);
}

describe('ProjectProfile loader', () => {
  it('accepts the valid Plutus-shaped profile fixture (spec §3.1:507-511)', () => {
    const root = makeProject();
    const p = loadProfile(writeProfile(root, 'profile.yaml', validProfileYaml(root)));
    expect(p.project.name).toBe('plutus-ts');
    expect(p.graph.substrate).toBe('corbell');
    expect(p.pipeline.stages.length).toBeGreaterThanOrEqual(7);
    expect(p.rules.bindings).toHaveProperty('P1');
  });

  it('rejects a malformed profile with the named field (spec §3.1:514-517)', () => {
    const root = makeProject();
    const p = writeProfile(root, 'malformed.yaml', validProfileYaml(root).replace('name: plutus-ts', 'name: ""'));
    expect(() => loadProfile(p)).toThrow(/PROFILE_INVALID/);
    expect(() => loadProfile(p)).toThrow(/project\.name/);
  });

  it('rejects a profile whose corpus is missing (spec §3.1:520-523)', () => {
    const root = makeProject();
    const p = writeProfile(
      root,
      'missing-corpus.yaml',
      validProfileYaml(root).replace('- MASTER_CONTEXT/SPEC.md', '- MASTER_CONTEXT/NONEXISTENT.md'),
    );
    expect(() => loadProfile(p)).toThrow(/CORPUS_MISSING/);
    expect(() => loadProfile(p)).toThrow(/MASTER_CONTEXT\/NONEXISTENT\.md/);
  });

  it('rejects a profile whose project.root is not a directory (spec §3.1:526-527)', () => {
    const root = makeProject();
    // root points at a FILE (a corpus doc), not a directory → PROFILE_INVALID
    const p = writeProfile(root, 'bad-root.yaml', validProfileYaml(root).replace(`root: ${root}`, `root: ${root}/MASTER_CONTEXT/SPEC.md`));
    expect(() => loadProfile(p)).toThrow(/PROFILE_INVALID/);
    // root points at a NONEXISTENT path → PROFILE_INVALID
    const p2 = writeProfile(root, 'bad-root-2.yaml', validProfileYaml(root).replace(`root: ${root}`, `root: ${root}/does-not-exist`));
    expect(() => loadProfile(p2)).toThrow(/PROFILE_INVALID/);
  });

  it('rejects malformed YAML syntax (adversarial — the parser fails closed)', () => {
    const root = makeProject();
    // an unbalanced flow map — outside the subset → parse error → PROFILE_INVALID
    const p = writeProfile(root, 'bad-syntax.yaml', 'project: { name: "plutus-ts"\n');
    expect(() => loadProfile(p)).toThrow(/PROFILE_INVALID/);
  });

  it('accepts a JSON-format profile (adversarial — the .json parse branch)', () => {
    const root = makeProject();
    const p = loadProfile(writeProfile(root, 'profile.json', validProfileJson(root)));
    expect(p.project.name).toBe('plutus-ts');
    expect(p.graph.substrate).toBe('corbell');
  });

  it('resolves a symlinked project root via realpath BEFORE the exists check (adversarial — spec §3.1:532)', () => {
    const real = makeProject();
    const linkRoot = path.join(tmpBase, `symlink-${Date.now()}`);
    fs.symlinkSync(real, linkRoot, 'dir');
    createdTmp.push(linkRoot);
    const p = loadProfile(writeProfile(real, 'profile.yaml', validProfileYaml(linkRoot)));
    expect(p.project.name).toBe('plutus-ts');
    expect(p.graph.substrate).toBe('corbell');
  });

  it('rejects a malformed substrate with the named field (adversarial — the §8.x cross-check, spec ~4062)', () => {
    const root = makeProject();
    const p = writeProfile(root, 'bad-substrate.yaml', validProfileYaml(root).replace('substrate: corbell', 'substrate: bogus'));
    expect(() => loadProfile(p)).toThrow(/PROFILE_INVALID.*substrate/);
  });

  it('rejects a listed-but-missing failure log with HISTORY_MISSING (the §1794 named-error contract)', () => {
    const root = makeProject();
    // the corpus keeps its present FAILURE_LOG.md (the corpus check runs FIRST);
    // only the LAST occurrence (history.failureLogs) is swapped to a missing path,
    // so the HISTORY_MISSING branch is what fires.
    const yaml = validProfileYaml(root);
    const needle = '- MASTER_CONTEXT/FAILURE_LOG.md';
    const lastIdx = yaml.lastIndexOf(needle);
    const p = writeProfile(
      root,
      'missing-log.yaml',
      yaml.slice(0, lastIdx) + '- MASTER_CONTEXT/MISSING_LOG.md' + yaml.slice(lastIdx + needle.length),
    );
    expect(() => loadProfile(p)).toThrow(/HISTORY_MISSING/);
    expect(() => loadProfile(p)).toThrow(/MASTER_CONTEXT\/MISSING_LOG\.md/);
  });

  it('rejects a nonexistent profile file (spec §3.1:467)', () => {
    expect(() => loadProfile(path.join(tmpBase, 'nope', 'missing.yaml'))).toThrow(/PROFILE_INVALID/);
    expect(() => loadProfile(path.join(tmpBase, 'nope', 'missing.yaml'))).toThrow(/profilePath/);
  });
});
