/**
 * artifact-scope.test.ts — THE REPORT_SCOPE PROOF-CASE BATTERY (W3)
 *
 * The L2 spec §6.2:2613-2660 transcribed: the variant reuse, the canonical creation, the
 * N-versioning, the codebase-path block list, the symlink escape — plus the adversarial
 * extensions (the .. traversal, the escape, the wrong filename, the outside-project path).
 * The fixtures are temp directories under /tmp, created + cleaned in the test lifecycle —
 * never the real project paths.
 */

import { describe, it, expect, afterAll } from 'bun:test';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { classify, enforceReportScope, MASTER_CONTEXT_VARIANTS } from '../artifact-scope.js';
import { REPORT_SCOPE_ERROR } from '../lexicon-types.js';

const WRITE_ERROR = REPORT_SCOPE_ERROR; // the LITERAL template — the tests assert the untouched constant

const tmpRoots: string[] = [];

/** A fresh temp project root per test, registered for the afterAll cleanup. */
async function tmpProject(): Promise<string> {
try {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'w3-ascope-'));
  tmpRoots.push(root);
  return root;

} catch (e: unknown) {
  console.warn('tmpProject failed: ' + (e instanceof Error ? e.message : String(e)));
  throw e;
}
}

describe('REPORT_SCOPE_LEXICON', () => {
  afterAll(async () => {
  try {
    for (const r of tmpRoots) {
      await fs.rm(r, { recursive: true, force: true }).catch((e) => { console.warn(`[artifact-scope.test] cleanup rm failed: ${e instanceof Error ? e.message : String(e)}`); });
    }
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('reuses the existing MASTER_CONTEXT variant (case/syntax-insensitive) — never a duplicate', async () => {
  try {
    const root = await tmpProject();
    await fs.mkdir(path.join(root, 'master_context')); // a non-canonical variant EXISTS
    const d = await classify({ target: path.join(root, 'master_context', 'bug_hunter_report_v1.md') }, root);
    expect(d.state).toBe('ALLOW_REPORT');
    expect(d.resolvedDir).toBe(await fs.realpath(path.join(root, 'master_context'))); // the EXISTING variant, never a new dir
    expect(d.triplet.Pattern).toBe('MASTER_CONTEXT_TARGET');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('creates the canonical MASTER_CONTEXT when NO variant exists', async () => {
  try {
    const root = await tmpProject();
    const d = await classify({ target: path.join(root, 'MASTER_CONTEXT', 'bug_hunter_report_v1.md') }, root);
    expect(d.state).toBe('ALLOW_REPORT');
    expect(d.resolvedDir).toBe(path.join(await fs.realpath(root), 'MASTER_CONTEXT')); // the canonical name
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('versions the filename — v1 -> v2, never an overwrite', async () => {
  try {
    const root = await tmpProject();
    await fs.mkdir(path.join(root, 'MASTER_CONTEXT'));
    const v1 = path.join(root, 'MASTER_CONTEXT', 'bug_hunter_report_v1.md');
    await fs.writeFile(v1, 'x');
    const v2 = await classify({ target: path.join(root, 'MASTER_CONTEXT', 'bug_hunter_report_v2.md') }, root);
    expect(v2.state).toBe('ALLOW_REPORT');
    const block = await classify({ target: v1 }, root);
    expect(block.state).toBe('BLOCKED'); // an explicit overwrite of an EXISTING report
    expect(block.message).toBe(WRITE_ERROR);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('blocks every codebase path — the operator\'s "cannot let me just fix it"', async () => {
  try {
    const root = await tmpProject();
    await fs.mkdir(path.join(root, 'MASTER_CONTEXT'));
    for (const target of [
      path.join(root, 'src', 'engine.ts'), // the source
      path.join(root, 'dist', 'index.js'), // the build
      path.join(root, '..', '..', 'src', 'x.ts'), // the .. traversal
      path.join(root, 'MASTER_CONTEXT', '..', 'src', 'y.ts'), // the escape
      path.join(root, 'MASTER_CONTEXT', 'notes.md'), // the wrong filename (not bug_hunter_report_vN.md)
      path.join('/tmp', 'outside-w3', 'z.md'), // outside the project
    ]) {
      const d = await classify({ target }, root);
      expect(d.state).toBe('BLOCKED');
      expect(d.message).toBe(WRITE_ERROR); // the named error (R4.2)
      expect(d.triplet.Pattern).toBe('REPORT_SCOPE_BLOCKED');
    }
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('blocks a symlink escape — the realpath resolution (G22.3)', async () => {
  try {
    const root = await tmpProject();
    await fs.mkdir(path.join(root, 'MASTER_CONTEXT'));
    await fs.symlink('/etc', path.join(root, 'MASTER_CONTEXT', 'escape'));
    const d = await classify({ target: path.join(root, 'MASTER_CONTEXT', 'escape', 'passwd') }, root);
    expect(d.state).toBe('BLOCKED'); // the resolved target leaves the master-context dir
    expect(d.message).toBe(WRITE_ERROR);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('blocks a target whose parent does not exist at all (the unresolvable path -> fail-closed)', async () => {
  try {
    const root = await tmpProject();
    const d = await classify({ target: path.join(root, 'NO_SUCH_DIR', 'bug_hunter_report_v1.md') }, root);
    expect(d.state).toBe('BLOCKED');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the enforce hook THROWS the exact literal error on a blocked write', async () => {
    const root = await tmpProject();
    await fs.mkdir(path.join(root, 'MASTER_CONTEXT'));
    let threw = false;
    try {
      await enforceReportScope({ target: path.join(root, 'src', 'x.ts') }, root);
    } catch (e: unknown) {
      console.warn('[artifact-scope.test] enforceReportScope threw (expected): ' + String(e));
      threw = true;
      expect((e as Error).message).toBe(WRITE_ERROR);
    }
    expect(threw).toBe(true);
  });

  it('the variant list is the frozen six-form set (D18)', () => {
    expect(MASTER_CONTEXT_VARIANTS).toEqual([
      'MASTER_CONTEXT', 'master-context', 'master_context', 'MasterContext', 'masterContext', 'master context',
    ]);
  });
});
