import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// BECAUSE: graph builds ran minutes-long; 30min absorbs 10x without blocking legit hunts
export const STALE_LOCK_TTL_MS = 30 * 60 * 1000;

export interface HuntLockPayload {
  pid: number;
  acquiredAt: string;
  hostname: string;
}

function lockPathFor(targetPath: string): string {
  return path.join(targetPath, '.trident', 'hunt.lock');
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    console.warn(`[hunt-lock] isPidAlive unknown code for pid=${pid}: ${String(e)}`);
    return false;
  }
}

function isStale(payload: HuntLockPayload): boolean {
  const age = Date.now() - Date.parse(payload.acquiredAt);
  if (Number.isNaN(age)) return true;
  if (age > STALE_LOCK_TTL_MS) return true;
  if (!isPidAlive(payload.pid)) return true;
  return false;
}

function readPayload(lockPath: string): HuntLockPayload | null {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<HuntLockPayload>;
    if (typeof parsed.pid !== 'number' || typeof parsed.acquiredAt !== 'string') return null;
    return parsed as HuntLockPayload;
  } catch (e: unknown) {
    console.warn(`[hunt-lock] readPayload failed for ${lockPath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function acquireHuntLock(targetPath: string): HuntLockPayload {
  const lockPath = lockPathFor(targetPath);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const payload: HuntLockPayload = {
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    hostname: os.hostname(),
  };
  try {
    fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), { flag: 'wx' });
    return payload;
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') throw e;
    const existing = readPayload(lockPath);
    if (existing && isStale(existing)) {
      try {
        fs.unlinkSync(lockPath);
      } catch (err: unknown) {
        console.warn(`[hunt-lock] stale unlink failed for ${lockPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
      try {
        fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), { flag: 'wx' });
        return payload;
      } catch (e2: unknown) {
        const code2 = (e2 as NodeJS.ErrnoException).code;
        if (code2 === 'EEXIST') {
          const holder2 = readPayload(lockPath);
          const holderPid = holder2?.pid ?? '?';
          const holderAt = holder2?.acquiredAt ?? '?';
          throw new Error(`HUNT_ALREADY_RUNNING: pid=${holderPid} acquiredAt=${holderAt} holds ${lockPath} — wait for it to finish or delete the stale lock.`);
        }
        throw e2;
      }
    }
    const holderPid = existing?.pid ?? '?';
    const holderAt = existing?.acquiredAt ?? '?';
    throw new Error(`HUNT_ALREADY_RUNNING: pid=${holderPid} acquiredAt=${holderAt} holds ${lockPath} — wait for it to finish or delete the stale lock.`);
  }
}

export function releaseHuntLock(targetPath: string): void {
  const lockPath = lockPathFor(targetPath);
  try {
    const existing = readPayload(lockPath);
    if (existing && existing.pid !== process.pid) return;
    fs.unlinkSync(lockPath);
  } catch (e: unknown) {
    console.warn(`[hunt-lock] release failed for ${lockPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function huntLockPath(targetPath: string): string {
  return lockPathFor(targetPath);
}
