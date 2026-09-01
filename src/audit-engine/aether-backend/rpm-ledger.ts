export interface ProviderRpmProfile {
  capacity: number;
  refillPerSec: number;
}

export const RPM_PROFILES: Record<string, ProviderRpmProfile> = {
  nvidia: { capacity: 40, refillPerSec: 40 / 60 },
  opencode: { capacity: 200, refillPerSec: 200 / 60 },
  openrouter: { capacity: 20, refillPerSec: 20 / 60 },
  inferx: { capacity: 20, refillPerSec: 20 / 60 },
};

export const EXILE_MS = 45_000;
export type Admission = 'ok' | 'exiled' | 'dry';
interface BucketState { tokens: number; lastTs: number; }
const RING_CAP = 200;
const RING_WINDOW_MS = 120_000;

export interface LedgerSnapshotEntry {
  provider: string;
  admission: Admission;
  tokensLeft: number;
  capacity: number | null;
  successCount120s: number;
  count429_120s: number;
  exiledForMs: number;
}
export interface LedgerSnapshot { id: string; now: number; providers: LedgerSnapshotEntry[]; }
export interface RpmLedgerOptions { clock?: () => number; sleepFn?: (ms: number) => Promise<void>; }

export class RpmLedger {
  readonly id: string;
  private readonly clock: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly buckets = new Map<string, BucketState>();
  private readonly ringSuccess = new Map<string, number[]>();
  private readonly ring429 = new Map<string, number[]>();
  private readonly exiledUntil = new Map<string, number>();
  private attemptsRing = new Map<string, number[]>();
  constructor(id: string, opts?: RpmLedgerOptions) {
    this.id = id;
    this.clock = opts?.clock ?? Date.now;
    this.sleepFn = opts?.sleepFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  }
  private profile(provider: string): ProviderRpmProfile | null {
    return RPM_PROFILES[provider] ?? null;
  }
  private refilledTokens(provider: string, now: number): number | null {
    const prof = this.profile(provider);
    if (!prof) return null;
    let b = this.buckets.get(provider);
    if (!b) { b = { tokens: prof.capacity, lastTs: now }; this.buckets.set(provider, b); }
    if (now > b.lastTs) {
      b.tokens = Math.min(prof.capacity, b.tokens + ((now - b.lastTs) / 1000) * prof.refillPerSec);
      b.lastTs = now;
    }
    return b.tokens;
  }
  admission(provider: string, now: number = this.clock()): Admission {
    const until = this.exiledUntil.get(provider);
    if (until !== undefined && until > now) return 'exiled';
    const tokens = this.refilledTokens(provider, now);
    if (tokens !== null && tokens < 1) return 'dry';
    return 'ok';
  }
  async acquire(provider: string, opts?: { maxWaitMs?: number; signal?: AbortSignal }): Promise<boolean> {
    const maxWaitMs = opts?.maxWaitMs ?? 6000;
    const t0 = this.clock();
    for (;;) {
      const now = this.clock();
      if (opts?.signal?.aborted) return false;
      const adm = this.admission(provider, now);
      if (adm === 'ok') {
        const tokens = this.refilledTokens(provider, now);
        if (tokens !== null) {
          const b = this.buckets.get(provider);
          if (b) b.tokens = Math.max(0, b.tokens - 1);
        }
        this.push(this.ringAttemptOf(provider), now);
        return true;
      }
      if (adm === 'exiled') return false;
      if (now - t0 >= maxWaitMs) return false;
      await this.sleepFn(Math.min(250, maxWaitMs - (now - t0)));
    }
  }
  record429(provider: string, now: number = this.clock()): void {
    this.push(this.ring429of(provider), now);
    this.exiledUntil.set(provider, now + EXILE_MS);
  }
  recordSuccess(provider: string, now: number = this.clock()): void {
    this.push(this.ringSuccessOf(provider), now);
  }
  snapshot(now: number = this.clock()): LedgerSnapshot {
    const providers = new Set<string>([
      ...Object.keys(RPM_PROFILES),
      ...this.attemptsRing.keys(),
      ...this.ringSuccess.keys(),
      ...this.ring429.keys(),
      ...this.exiledUntil.keys(),
    ]);
    return {
      id: this.id,
      now,
      providers: [...providers].map((p) => {
        const tokens = this.refilledTokens(p, now);
        const until = this.exiledUntil.get(p);
        return {
          provider: p,
          admission: this.admission(p, now),
          tokensLeft: tokens === null ? Infinity : Math.floor(tokens),
          capacity: this.profile(p)?.capacity ?? null,
          successCount120s: this.inWindow(this.ringSuccess.get(p) ?? [], now),
          count429_120s: this.inWindow(this.ring429.get(p) ?? [], now),
          exiledForMs: until !== undefined && until > now ? until - now : 0,
        };
      }),
    };
  }
  private ringAttemptOf(p: string): number[] {
    let r = this.attemptsRing.get(p);
    if (!r) { r = []; this.attemptsRing.set(p, r); }
    return r;
  }
  private ringSuccessOf(p: string): number[] {
    let r = this.ringSuccess.get(p);
    if (!r) { r = []; this.ringSuccess.set(p, r); }
    return r;
  }
  private ring429of(p: string): number[] {
    let r = this.ring429.get(p);
    if (!r) { r = []; this.ring429.set(p, r); }
    return r;
  }
  private push(ring: number[], ts: number): void {
    ring.push(ts);
    if (ring.length > RING_CAP) ring.splice(0, ring.length - RING_CAP);
  }
  private inWindow(ring: number[], now: number): number {
    return ring.filter((ts) => now - ts <= RING_WINDOW_MS).length;
  }
}
