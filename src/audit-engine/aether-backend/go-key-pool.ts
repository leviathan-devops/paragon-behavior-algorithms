// ═══ GO KEY POOL — THE AETHER BACKEND'S OPENCODE-GO KEY CYCLER (2026-08-30) ═══
// THE WHOLE MACHINE: 3 keys, one deadUntil timestamp each, skip the dead ones.
// State = .trident-aether-go-key-pool.json in the GLOBAL tmp (os.tmpdir() —
// every session on this machine shares one pool; a key a sibling session proved
// rate-limited is skipped by everyone until its window passes). deadUntil is
// DATA: the timeout is parsed from the error the key itself returned (5h/day/
// week/month windows; unknown → re-probe in 1h) and the key simply re-enters
// the line when Date.now() passes it. No timers, no cron, no maintenance. A
// stray success clears a stale timeout (markGoKeyAlive).
// AP-4: the file carries INDEXES, never keys; the logs carry go-1/go-2/go-3.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const GO_KEYS = [
  'sk-ZHckDHzVtHjfAT5ouDxfWA5gR1wi9V3TModibCQh2rt5wptTwzGdEsjTNBZjwcth',
  'sk-9BsmoeL3bz03P5TAwqUDI9BNutDLkISB7paI2OjBSKPenC3KkMKiBP7sVDmkqTWk',
  'sk-lkZjcgry9o53V0QcACvfCYWWEDtLOADJkPu63VoqQFCXxWL8N4IyrKutJLcqYUkb',
];

export function goKeyLabel(idx: number): string {
  return 'go-' + (idx + 1);
}

export function goPoolFile(): string {
  if (process.env.TRIDENT_GO_POOL_FILE) return process.env.TRIDENT_GO_POOL_FILE;
  if (process.env.BUN_TEST) return path.join(os.tmpdir(), 'trident-test-go-key-pool.json');
  return path.join(os.tmpdir(), '.trident-aether-go-key-pool.json');
}

function readDeadUntil(): number[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(goPoolFile(), 'utf-8')) as { deadUntil?: number[] };
    if (!Array.isArray(parsed.deadUntil)) return [0, 0, 0];
    const arr = parsed.deadUntil;
    return GO_KEYS.map((_, i) => (typeof arr[i] === 'number' ? (arr[i] as number) : 0));
  } catch {
    return [0, 0, 0];
  }
}

function writeDeadUntil(d: number[]): void {
  const tmp = goPoolFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ deadUntil: d }));
  fs.renameSync(tmp, goPoolFile());
}

export function goKeyDead(idx: number, now: number = Date.now()): boolean {
  return (readDeadUntil()[idx] ?? 0) > now;
}

// THE TIMEOUT, parsed from the error the key itself returned. (THE ISE NOTE:
// this regex ladder is a MECHANICAL DETECTOR over a free-text error body, not
// a decision system — the provider's window name arrives as prose and there
// is nothing structural to match on. The decision is the comparison in
// goKeyDead — timestamp > now. A PatternFamily/AST here would be ceremony.)
export function parseGoWindowMs(err: string): number {
  const resetIn = err.match(/resets? in\s*(\d+)\s*hr(?:\s*(\d+)\s*min)?/i);
  if (resetIn) return (Number(resetIn[1]) * 60 + Number(resetIn[2] ?? '0')) * 60_000;
  if (/5\s*-?\s*hour|hourly/i.test(err)) return 5 * 3_600_000;
  if (/day|daily/i.test(err)) return 24 * 3_600_000;
  if (/week/i.test(err)) return 7 * 24 * 3_600_000;
  if (/month/i.test(err)) return 30 * 24 * 3_600_000;
  return 3_600_000;
}

export function markGoKeyDead(idx: number, err: string, now: number = Date.now()): number {
  const until = now + parseGoWindowMs(err);
  const d = readDeadUntil();
  d[idx] = until;
  writeDeadUntil(d);
  return until;
}

export function markGoKeyAlive(idx: number, now: number = Date.now()): boolean {
  const d = readDeadUntil();
  if (!d[idx] || d[idx] <= now) return false;
  d[idx] = 0;
  writeDeadUntil(d);
  return true;
}

export function goPoolSnapshot(now: number = Date.now()): string {
  return GO_KEYS.map((_, i) => {
    const until = readDeadUntil()[i] ?? 0;
    return until > now
      ? goKeyLabel(i) + ' dead until ' + new Date(until).toISOString()
      : goKeyLabel(i) + ' ok';
  }).join(' · ');
}
