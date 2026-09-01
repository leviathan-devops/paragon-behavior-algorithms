// ═══ RPM LEDGER — THE WAVE-AWARE RATE BUDGET (2026-08-21 — the operator's
// hybrid directive: "now that you have this data how can we take the best of
// both so that there IS a wave-aware RPM tracker that can feed into the
// option 2 so its not blind retrying an obviously RPM model?") ═══
//
// THE 27-MINUTE AUTOPSY THAT MOTIVATES THIS (wave-seven-wave-live-1787278456238,
// /tmp/trident-engine.log): all 7 agents' first LLM calls fired in ONE 40ms
// window → a shared-key nvidia 429 storm (41× "429 no body" + 10× tenant 429)
// → each agent's PERMANENT brokenRungs exile → 178 of 191 calls rode the
// openrouter :free rung (median 8s, p90 81s, max 451s) instead of nvidia's
// 3s median → b1's sequential ~27-call chain summed to 1596s = THE WALL.
// The measured demand was 191 calls / 26 min ≈ 7.3 calls/min against a 40
// RPM bucket — 18% utilization. The failure was CLUSTERING + PERMANENT
// EXILE, never capacity.
//
// THE DESIGN — a PASSIVE SHARED LEDGER, not an active coordinator:
//   - NO assignment protocol, NO round-boundary barriers, NO cross-agent
//     messaging. Every agent's chainedStream stays the decision-maker; the
//     ledger only makes each decision smarter and SHARED:
//       1. TOKEN BUCKET per profiled provider (nvidia: 40 tokens, continuous
//          refill 40/60s) — an attempt without a predicted token is SKIPPED
//          before any request is burned ("not blind retrying an obviously
//          RPM'd model").
//       2. SHARED TTL EXILE — one agent's observed 429 exiles the rung for
//          EVERY agent on the wave for EXILE_MS (45s < one 60s reset window);
//          expiry re-admits automatically (the half-open breaker — option 2's
//          "once the transient limit subsides the provider is slotted back").
//       3. OBSERVATION RINGS — the last successes/429s per provider for the
//          snapshot() observability feed ("where are the logs" — 2026-08-21).
//   - SCOPING = the fork story: a wave dispatches ONE shared ledger into all
//     its AetherAgents (wave-aware); a solo AetherAgent with no injected
//     ledger constructs its OWN private one (identical code path, solo
//     scope). The class is provider-agnostic: RPM_PROFILES maps provider id →
//     {capacity, refillPerSec}; UNPROFILED providers are unlimited (zero
//     behavior change) — forking this into a new project is ONE table entry.

/** THE PROVIDER PROFILES — the ONLY place a provider's rate shape is declared.
 *  THE OPERATOR'S MEASURED TABLE (2026-08-21): nvidia 40 RPM · zen (opencode)
 *  200 RPM · openrouter 20 RPM · inferx 20 RPM. The first RPM cycle starts
 *  when a provider takes its FIRST request (lazy bucket init at full capacity)
 *  — providers are async and NEVER cycle in lockstep. Fork recipe: add one
 *  entry. */
export interface ProviderRpmProfile {
  /** Bucket capacity in requests (the burst size). */
  capacity: number;
  /** Continuous refill rate in requests/second (capacity / window). */
  refillPerSec: number;
}

export const RPM_PROFILES: Record<string, ProviderRpmProfile> = {
  nvidia: { capacity: 40, refillPerSec: 40 / 60 },
  opencode: { capacity: 200, refillPerSec: 200 / 60 },
  openrouter: { capacity: 20, refillPerSec: 20 / 60 },
  inferx: { capacity: 20, refillPerSec: 20 / 60 },
};

/** THE EXILE WINDOW (the shared TTL — the half-open breaker). 45s sits INSIDE
 *  nvidia's 60s reset so a rung exiled at t=0 is re-probed by its next call
 *  within one reset window, never carried for a whole wave (the 27-min bug's
 *  permanent brokenRungs Set is dead). */
export const EXILE_MS = 45_000;

/** THE ADMISSION VERDICT — 'ok' = attempt allowed; 'exiled' = a recent 429
 *  (shared TTL active); 'dry' = bucket empty but no exile (transient burst —
 *  acquire() may WAIT briefly for refill instead of fleeing to a slow rung:
 *  nvidia's 3s median beats openrouter's 8s/451s tail whenever a token is
 *  seconds away). */
export type Admission = 'ok' | 'exiled' | 'dry';

interface BucketState {
  tokens: number;
  lastTs: number;
}

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

export interface LedgerSnapshot {
  id: string;
  now: number;
  providers: LedgerSnapshotEntry[];
}

export interface RpmLedgerOptions {
  /** THE INJECTABLE CLOCK (deterministic tests — no real-time sleeps). */
  clock?: () => number;
  /** THE INJECTABLE SLEEP (tests advance the fake clock instead of waiting). */
  sleepFn?: (ms: number) => Promise<void>;
}

export class RpmLedger {
  readonly id: string;
  private readonly clock: () => number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly buckets = new Map<string, BucketState>();
  private readonly ringSuccess = new Map<string, number[]>();
  private readonly ring429 = new Map<string, number[]>();
  private readonly exiledUntil = new Map<string, number>();

  constructor(id: string, opts?: RpmLedgerOptions) {
    this.id = id;
    this.clock = opts?.clock ?? Date.now;
    this.sleepFn = opts?.sleepFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  }

  private profile(provider: string): ProviderRpmProfile | null {
    return RPM_PROFILES[provider] ?? null;
  }

  /** THE CONTINUOUS REFILL — lazy: touched on every read/write, tokens grow
   *  at refillPerSec since lastTs, capped at capacity. */
  private refilledTokens(provider: string, now: number): number | null {
    const prof = this.profile(provider);
    if (!prof) return null; // unlimited — no bucket
    let b = this.buckets.get(provider);
    if (!b) { b = { tokens: prof.capacity, lastTs: now }; this.buckets.set(provider, b); }
    if (now > b.lastTs) {
      b.tokens = Math.min(prof.capacity, b.tokens + ((now - b.lastTs) / 1000) * prof.refillPerSec);
      b.lastTs = now;
    }
    return b.tokens;
  }

  /** THE ADMISSION CHECK — pure, synchronous, no side effects. The chain asks
   *  this BEFORE any request: 'exiled'/'dry' → skip the rung WITHOUT burning
   *  a single request or retry-second on a known-limited provider. */
  admission(provider: string, now: number = this.clock()): Admission {
    const until = this.exiledUntil.get(provider);
    if (until !== undefined && until > now) return 'exiled';
    const tokens = this.refilledTokens(provider, now);
    if (tokens !== null && tokens < 1) return 'dry';
    return 'ok';
  }

  /** THE ACQUIRE — consume 1 token (profiled providers) before ONE LLM request.
   *  'ok' → consume + true. 'exiled' → false IMMEDIATELY (never wait out a
   *  shared exile — another rung serves the call). 'dry' → poll for refill up
   *  to maxWaitMs (default 6000ms — riding nvidia's continuous refill beats
   *  falling to the free-tier tail); on expiry → false. Unlimited providers →
   *  instantly true, nothing consumed. */
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
      // dry — wait for the continuous refill
      if (now - t0 >= maxWaitMs) return false;
      await this.sleepFn(Math.min(250, maxWaitMs - (now - t0)));
    }
  }

  /** THE SHARED EXILE — ONE agent's observed 429 exiles the provider for the
   *  WHOLE wave for EXILE_MS. This is the hybrid's core win: no other agent
   *  blind-retries a rung that a sibling just proved limited, and the rung
   *  returns automatically when the window rolls (option 2's re-slotting,
   *  zero coordination). */
  record429(provider: string, now: number = this.clock()): void {
    this.push(this.ring429of(provider), now);
    this.exiledUntil.set(provider, now + EXILE_MS);
  }

  recordSuccess(provider: string, now: number = this.clock()): void {
    this.push(this.ringSuccessOf(provider), now);
  }

  /** THE OBSERVABILITY FEED — the per-provider state for the logs (the
   *  "[chain] try/SKIP" lines carry it) + the wave-end summary. */
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

  // ── internals ──

  private attemptsRing = new Map<string, number[]>();
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
