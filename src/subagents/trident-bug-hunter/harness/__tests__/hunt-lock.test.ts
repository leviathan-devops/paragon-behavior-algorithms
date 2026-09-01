import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireHuntLock, releaseHuntLock, STALE_LOCK_TTL_MS, huntLockPath } from '../hunt-lock.ts';
import { spawnBugHunterLoop } from '../../tools/bug-hunt.ts';

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-lock-'));
const createdTmp: string[] = [tmpBase];

afterAll(() => {
  for (const d of createdTmp) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e: unknown) { console.warn(String(e)); }
  }
});

function tmpDir(name: string): string {
  const dir = path.join(tmpBase, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('HUNT SINGLETON LOCKFILE (HT-BUG-18)', () => {
  it('concurrent refusal: second acquire throws HUNT_ALREADY_RUNNING naming holder pid + acquiredAt', () => {
    const dir = tmpDir('concurrent');
    const first = acquireHuntLock(dir);
    expect(first.pid).toBe(process.pid);
    expect(typeof first.acquiredAt).toBe('string');
    let threw = '';
    try {
      acquireHuntLock(dir);
    } catch (e: unknown) {
      threw = e instanceof Error ? e.message : String(e);
    }
    expect(threw).toContain('HUNT_ALREADY_RUNNING');
    expect(threw).toContain(`pid=${first.pid}`);
    expect(threw).toContain(first.acquiredAt);
    const lockPath = huntLockPath(dir);
    expect(fs.existsSync(lockPath)).toBe(true);
    const raw = fs.readFileSync(lockPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(typeof parsed.pid).toBe('number');
    expect(typeof parsed.acquiredAt).toBe('string');
    expect(typeof parsed.hostname).toBe('string');
    releaseHuntLock(dir);
    expect(fs.existsSync(lockPath)).toBe(false);
    const second = acquireHuntLock(dir);
    expect(second.pid).toBe(process.pid);
    releaseHuntLock(dir);
  });

  it('stale recovery: dead pid lock auto-recovers', () => {
    const dir = tmpDir('stale-dead');
    const lockPath = huntLockPath(dir);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const deadPid = 999999;
    const payload = { pid: deadPid, acquiredAt: new Date().toISOString(), hostname: 'test-host' };
    fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), 'utf8');
    const acquired = acquireHuntLock(dir);
    expect(acquired.pid).toBe(process.pid);
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Record<string, unknown>;
    expect(parsed.pid).toBe(process.pid);
    expect(parsed.pid).not.toBe(deadPid);
    releaseHuntLock(dir);
  });

  it('stale recovery: age > TTL auto-recovers even when pid alive', () => {
    const dir = tmpDir('stale-ttl');
    const lockPath = huntLockPath(dir);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const oldAt = new Date(Date.now() - STALE_LOCK_TTL_MS - 1000).toISOString();
    const payload = { pid: process.pid, acquiredAt: oldAt, hostname: 'test-host' };
    fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), 'utf8');
    const acquired = acquireHuntLock(dir);
    expect(acquired.pid).toBe(process.pid);
    const fresh = Date.parse(acquired.acquiredAt);
    expect((Date.now() - fresh) < 5000).toBe(true);
    releaseHuntLock(dir);
  });

  it('STALE_LOCK_TTL_MS is 30min', () => {
    expect(STALE_LOCK_TTL_MS).toBe(30 * 60 * 1000);
  });

  it('release in finally: spawnBugHunterLoop releases lock on inconclusive terminal', async () => {
    const dir = tmpDir('finally-release');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true }, include: ['src'] }, null, 2));
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), `export function x(): void {}\n`);
    const corpusFile = path.join(dir, 'corpus.md');
    fs.writeFileSync(corpusFile, `# Empty\n\nNo rules.\n`, 'utf8');
    const profile = {
      profileVersion: 1,
      project: { name: 'fixture-lock', root: dir, languages: ['typescript'], entryPoints: ['src/index.ts'], build: 'bun build src/index.ts', test: 'bun test' },
      graph: { substrate: 'native-ast', scope: ['src'], excludes: [] },
      rules: { corpus: [corpusFile], bindings: {} },
      pipeline: { stages: [{ id: 'harvest', entry: 'x', contract: 'x runs' }] },
      history: { failureLogs: [] },
      awareness: { docs: [] },
    };
    const profilePath = path.join(dir, 'profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    const result = await spawnBugHunterLoop({ targetPath: dir, profilePath });
    expect(result.state).toBe('inconclusive');
    expect(result.error ?? '').toContain('HUNT_NO_COVERAGE');
    const lockPath = huntLockPath(dir);
    expect(fs.existsSync(lockPath)).toBe(false);
    const second = await spawnBugHunterLoop({ targetPath: dir, profilePath });
    expect(second.state).toBe('inconclusive');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('second concurrent hunt via spawnBugHunterLoop throws HUNT_ALREADY_RUNNING', async () => {
    const dir = tmpDir('concurrent-loop');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true }, include: ['src'] }, null, 2));
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), `export function x(): void {}\n`);
    const corpusFile = path.join(dir, 'corpus.md');
    fs.writeFileSync(corpusFile, `# Corpus\n\n> Wiring: every exported function must be wired.\n`, 'utf8');
    const holder = acquireHuntLock(dir);
    let threw = '';
    try {
      const profile = {
        profileVersion: 1,
        project: { name: 'fixture-concurrent', root: dir, languages: ['typescript'], entryPoints: ['src/index.ts'], build: 'bun build src/index.ts', test: 'bun test' },
        graph: { substrate: 'native-ast', scope: ['src'], excludes: [] },
        rules: { corpus: [corpusFile], bindings: { declaredPredicates: { 'P-dead': { template: 'wiring.no-dead-module', verbatimQuote: 'Wiring: every exported function must be wired.', anchor: 'corpus.md:3', severity: 'HIGH' } } } },
        pipeline: { stages: [{ id: 'harvest', entry: 'x', contract: 'x runs' }] },
        history: { failureLogs: [] },
        awareness: { docs: [] },
      };
      const profilePath = path.join(dir, 'profile.json');
      fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
      await spawnBugHunterLoop({ targetPath: dir, profilePath });
    } catch (e: unknown) {
      threw = e instanceof Error ? e.message : String(e);
    }
    expect(threw).toContain('HUNT_ALREADY_RUNNING');
    expect(threw).toContain(`pid=${holder.pid}`);
    releaseHuntLock(dir);
  });
});
