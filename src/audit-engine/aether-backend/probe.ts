import { AETHER_BASE_URL, AETHER_MODEL_ID } from './provider.js';
import { GO_KEYS, goKeyDead, goKeyLabel, goPoolSnapshot, markGoKeyAlive, markGoKeyDead, parseGoWindowMs } from './go-key-pool.js';

export const PROBE_DEADLINE_MS = 5000;
export const AETHER_API_UNREACHABLE = 'AETHER_API_UNREACHABLE';

export interface ProbeSuccess { ok: true; probeMs: number; status: number; }
export interface ProbeFailure { ok: false; probeMs: number; code: typeof AETHER_API_UNREACHABLE; status: number; message: string; remedy: string; }
export type ProbeResult = ProbeSuccess | ProbeFailure;

export interface ProbeTransport {
  fetch(url: string, init: RequestInit): Promise<{ status: number; ok: boolean; text(): Promise<string> }>;
}

function defaultTransport(): ProbeTransport {
  return {
    fetch: (url: string, init: RequestInit) => fetch(url, init) as Promise<{ status: number; ok: boolean; text(): Promise<string> }>,
  };
}

export async function probeProvider(opts?: { transport?: ProbeTransport; apiKey?: string; baseUrl?: string; deadlineMs?: number; signal?: AbortSignal }): Promise<ProbeResult> {
  const t0 = Date.now();
  const baseUrl = opts?.baseUrl ?? AETHER_BASE_URL;
  const deadlineMs = opts?.deadlineMs ?? PROBE_DEADLINE_MS;
  const transport = opts?.transport ?? defaultTransport();
  // THE POOL-AWARE KEY LINE (2026-08-30 — the container-test live finding: the
  // probe resolved only the env-seeded key (go-1); a quota-dead go-1 429'd the
  // probe and the GATES never fired even when go-2/go-3 were alive. The probe
  // now rotates the SAME pool the chain consumes: skip dead windows, probe the
  // first alive key, and on success heal that key's stale window. An explicit
  // opts.apiKey (the test seam) still wins over the pool.)
  const candidates: Array<{ key: string; idx: number | null; label: string }> = [];
  if (opts?.apiKey) {
    candidates.push({ key: opts.apiKey, idx: null, label: 'explicit' });
  } else {
    for (let i = 0; i < GO_KEYS.length; i++) {
      if (!goKeyDead(i)) candidates.push({ key: GO_KEYS[i], idx: i, label: goKeyLabel(i) });
    }
    if (candidates.length === 0) {
      const envKey = process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY ?? '';
      if (envKey) candidates.push({ key: envKey, idx: null, label: 'env-fallback' });
    }
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      probeMs: 0,
      code: AETHER_API_UNREACHABLE,
      status: 0,
      message: `API unreachable: opencode-go/${AETHER_MODEL_ID} — every GO key is in a dead window. KEY POOL: ${goPoolSnapshot()}`,
      remedy: 'The keys re-enter the line automatically when their windows pass. No candidates were scanned (0 minutes wasted).',
    };
  }
  const url = `${baseUrl.replace(/\/$/, '')}/responses`;
  let lastStatus = 0;
  let lastDetail = '';
  let lastErr = '';
  for (const candidate of candidates) {
    const attemptT0 = Date.now();
    const timeoutSignal = AbortSignal.timeout(deadlineMs);
    const combined = opts?.signal ? AbortSignal.any([timeoutSignal, opts.signal]) : timeoutSignal;
    try {
      console.error('[probe] try', candidate.label, 'at +' + Math.round((attemptT0 - t0) / 1000) + 's');
      const res = await transport.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(candidate.key ? { Authorization: `Bearer ${candidate.key}` } : {}),
        },
        body: JSON.stringify({ model: AETHER_MODEL_ID, input: 'ping', max_output_tokens: 16 }),
        signal: combined,
      });
      const probeMs = Date.now() - t0;
      if (res.ok) {
        // THE HOST LIVE CATCH (2026-08-31, RT-1 runId audit-1788159333948): a
        // response that arrives AFTER the deadline was treated as a TERMINAL
        // probe failure — but a response IS reachability (the key answered).
        // The old code aborted the whole audit on a slow-but-working key while
        // the next alive key sat untried in the pool. Reachability is the
        // probe's contract; latency is the chain's concern. Log the slow win,
        // heal the key's stale window, return ok.
        if (probeMs > deadlineMs) {
          console.error('[probe] SLOW-OK', candidate.label, 'answered after', (Date.now() - attemptT0) + 'ms (over the ' + deadlineMs + 'ms budget) — reachability proven, proceeding');
        }
        if (candidate.idx !== null) markGoKeyAlive(candidate.idx);
        console.error('[probe] OK', candidate.label, 'in', (Date.now() - attemptT0) + 'ms');
        return { ok: true, probeMs, status: res.status };
      }
      lastStatus = res.status;
      lastDetail = await res.text().catch(() => '');
      console.error('[probe] FAIL', candidate.label, res.status, lastDetail.slice(0, 120));
      // THE POOL LEARNS (host live catch, 2026-08-31): the probe was the only
      // cold-start consumer and it recorded NOTHING from a failure — the pool
      // file was never written, so every audit re-probed the key the chain
      // already knows is quota-dead. A 429-class body carries the reset
      // window: mark the key dead with the SAME parsed window the chain
      // writes, so the next run's probe (and chain) skip it at zero cost.
      if (candidate.idx !== null) {
        const isRateLimit = res.status === 429 || /\b429\b|rate.?limit|quota|too many/i.test(lastDetail);
        if (isRateLimit) {
          const until = markGoKeyDead(candidate.idx, lastDetail || `status ${res.status}`);
          console.error('[probe] KEY DEAD', candidate.label, '— until', new Date(until).toISOString(), '| pool:', goPoolSnapshot());
        }
      }
    } catch (e) {
      const probeMs = Date.now() - t0;
      lastErr = e instanceof Error ? e.message : String(e);
      lastStatus = 0;
      const isTimeout = lastErr.toLowerCase().includes('timeout') || lastErr.toLowerCase().includes('abort') || probeMs >= deadlineMs;
      lastDetail = isTimeout ? `timeout after ${deadlineMs}ms` : lastErr.slice(0, 200);
      console.error('[probe] FAIL', candidate.label, lastDetail.slice(0, 120));
      // THE DEAD-MARK on transport failure too (the same learner law): a
      // timed-out probe is a dead-or-stalled key — the 1h fallback window
      // (the pool's documented unknown-error default) makes the next run
      // probe the NEXT key first instead of re-burning the deadline.
      if (candidate.idx !== null) {
        const errBody = isTimeout ? 'resets in 1 hr' : lastErr;
        const until = markGoKeyDead(candidate.idx, errBody);
        console.error('[probe] KEY DEAD', candidate.label, '— until', new Date(until).toISOString(), '(window ' + Math.round(parseGoWindowMs(errBody) / 60000) + 'min) | pool:', goPoolSnapshot());
      }
    }
  }
  const probeMs = Date.now() - t0;
  return {
    ok: false,
    probeMs,
    code: AETHER_API_UNREACHABLE,
    status: lastStatus,
    message: `API unreachable: opencode-go/${AETHER_MODEL_ID} — probed ${candidates.length} key(s), last ${lastStatus || 'no-status'} ${lastDetail.slice(0, 160)}`,
    remedy: `KEY POOL: ${goPoolSnapshot()} — the keys re-enter the line automatically when their windows pass. To force a specific key: export OPENCODE_GO_API_KEY. The audit did not start. No candidates were scanned (0 minutes wasted).`,
  };
}

export function probeManifestOnFailure(result: ProbeFailure, runId: string): Record<string, unknown> {
  return { runId, ready: false, stage: 'probe', error: { code: result.code, message: result.message, remedy: result.remedy }, probeMs: result.probeMs };
}
