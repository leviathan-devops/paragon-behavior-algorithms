import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { countTsFilesInTarget, WALK_EXCLUDE_NAMES } from '../code-classifier.js';
import { validateAuditTarget } from '../index.js';

// ═══ THE SCOPE-MANDATE SUITE (2026-08-28 — the operator's directive) ═══
// "this should not be global auditing the entire workspace it should specifically
//  only audit the path it is pointed at and must mandated a proper src path target
//  so it audits a codebase and doesnt have any stupid shit"
// Every test here is mutation-checked: the assertion FAILS if a walker re-learns
// to crawl Checkpoints/ or if the mandate stops refusing workspace roots.

describe('WALK_EXCLUDE_NAMES — the canonical walk exclusion set', () => {
  test('carries every heavyweight tool-state dir (Checkpoints first among them)', () => {
    for (const name of ['Checkpoints', 'checkpoints', 'node_modules', 'dist', '.git', '.trident', 'snapshots', 'baselines']) {
      expect(WALK_EXCLUDE_NAMES.has(name)).toBe(true);
    }
  });
});

describe('countTsFilesInTarget — scoped counting', () => {
  let fixtureRoot = '';
  beforeAll(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-fixture-'));
    fs.mkdirSync(path.join(fixtureRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, 'Checkpoints', 'snap-1', 'src'), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'src', 'live.ts'), 'export const live = 1;\n');
    fs.writeFileSync(path.join(fixtureRoot, 'src', 'also-live.ts'), 'export const alsoLive = 2;\n');
    fs.writeFileSync(path.join(fixtureRoot, 'Checkpoints', 'snap-1', 'src', 'dead.ts'), 'export const dead = 3;\n');
    fs.writeFileSync(path.join(fixtureRoot, 'Checkpoints', 'snap-1', 'src', 'dead2.ts'), 'export const dead2 = 4;\n');
    fs.writeFileSync(path.join(fixtureRoot, 'node_modules', 'pkg', 'dep.ts'), 'export const dep = 5;\n');
  });
  afterAll(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test('counts ONLY live source — Checkpoints + node_modules excluded', () => {
    expect(countTsFilesInTarget(fixtureRoot)).toBe(2);
  });

  test('MUTATION CHECK: a walker that re-learns Checkpoints would count 4 and FAIL this suite', () => {
    // documents the failure mode this test pins: 2 live + 2 checkpoint copies
    const checkpointCopies = countTsFilesInTarget(path.join(fixtureRoot, 'Checkpoints'));
    expect(checkpointCopies).toBe(0); // walking INTO a Checkpoints dir also yields 0 — the set applies at every depth
  });
});

describe('validateAuditTarget — the src-root mandate (ONE target at a time)', () => {
  let fixtureRoot = '';
  beforeAll(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mandate-fixture-'));
    // a WORKSPACE: root holding a Checkpoints/ snapshot + a real project beside it
    fs.mkdirSync(path.join(fixtureRoot, 'Checkpoints', 'snap-1', 'src', 'deep'), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, 'real-project', 'src'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'real-project', 'src', 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(fixtureRoot, 'Checkpoints', 'snap-1', 'src', 'frozen.ts'), 'export const frozen = 1;\n');
    fs.writeFileSync(path.join(fixtureRoot, 'Checkpoints', 'snap-1', 'src', 'deep', 'nested.ts'), 'export const nested = 1;\n');
  });
  afterAll(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test('REFUSES a workspace root with TARGET_MUST_BE_SRC_ROOT + the workspace remedy', () => {
    let msg = '';
    try { validateAuditTarget(fixtureRoot); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
    expect(msg).toContain('TARGET_MUST_BE_SRC_ROOT');
    expect(msg).toContain('WORKSPACE');
  });

  test('REFUSES a project root with the pointed-at-src remedy (Found <root>/src — point there)', () => {
    let msg = '';
    try { validateAuditTarget(path.join(fixtureRoot, 'real-project')); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
    expect(msg).toContain('TARGET_MUST_BE_SRC_ROOT');
    expect(msg).toContain(path.join('real-project', 'src'));
  });

  test('ACCEPTS a live project src/ root — the ONE-target contract', () => {
    expect(() => validateAuditTarget(path.join(fixtureRoot, 'real-project', 'src'))).not.toThrow();
  });

  test('ACCEPTS a Checkpoint snapshot src/ — frozen codebases are legitimate deliberate targets', () => {
    expect(() => validateAuditTarget(path.join(fixtureRoot, 'Checkpoints', 'snap-1', 'src'))).not.toThrow();
  });

  test('REFUSES a Checkpoints/ CONTAINER dir (not a src root) — but the remedy is the src law, not a snapshot ban', () => {
    let msg = '';
    try { validateAuditTarget(path.join(fixtureRoot, 'Checkpoints')); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
    expect(msg).toContain('TARGET_MUST_BE_SRC_ROOT');
    expect(msg).not.toContain('never a live audit target');
  });

  test('REFUSES a nonexistent path with TARGET_NOT_FOUND', () => {
    let msg = '';
    try { validateAuditTarget(path.join(fixtureRoot, 'nope')); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
    expect(msg).toContain('TARGET_NOT_FOUND');
  });

  test('REFUSES a file target with TARGET_NOT_A_DIRECTORY', () => {
    const f = path.join(fixtureRoot, 'real-project', 'src', 'a.ts');
    let msg = '';
    try { validateAuditTarget(f); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
    expect(msg).toContain('TARGET_NOT_A_DIRECTORY');
  });
});
