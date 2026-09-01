export const AETHER_PROVIDER_ID = 'opencode-go';
export const AETHER_MODEL_ID = 'muse-spark-1.2-contributor';
export const AETHER_MODEL = `${AETHER_PROVIDER_ID}/${AETHER_MODEL_ID}`;
export const AETHER_BASE_URL = 'https://opencode.ai/zen/go/v1';

// ═══ THE KEY SEEDING — MODULE-SCOPE, BY LIFECYCLE NECESSITY ═══
// 2026-08-28 fresh-rig live finding: the step-0 probe reads OPENCODE_GO_API_KEY
// directly from env BEFORE any AetherAgent exists (the runner probes, then
// constructs the agent). Seeding inside the constructor left the probe
// keyless on every clean boot — anonymous pings are flakily tolerated
// upstream, so the mandate died pre-ledger with zero console trace. The seed
// therefore runs AT MODULE LOAD here (provider.ts is imported by probe,
// runner, agent, and the barrel alike), idempotently: an exported env var
// ALWAYS wins; the base64 constant only fills a completely unset slot.
const GO_KEY_B64 = 'c2stWkhja0RIelZ0SGpmQVQ1b3VEeGZXQTVnUjF3aTlWM1RNb2RpYkNRaDJydDV3cHRUd3pHZEVzalROQlpqd2N0aA==';
export function seedAetherProviderEnv(): void {
  if (!process.env.OPENCODE_GO_API_KEY && process.env.OPENCODE_API_KEY) {
    process.env.OPENCODE_GO_API_KEY = process.env.OPENCODE_API_KEY;
  }
  if (!process.env.OPENCODE_GO_API_KEY) {
    process.env.OPENCODE_GO_API_KEY = Buffer.from(GO_KEY_B64, 'base64').toString('utf-8');
  }
}
seedAetherProviderEnv();

export const AETHER_REASONING_EFFORT = 'xhigh' as const;
export const AETHER_TOKEN_BUDGET = 131072;
export const AETHER_RETRY_ATTEMPTS = 15;
export const AETHER_RETRY_BACKOFF_MS = 3000;
export const AETHER_STALL_MS = 60_000;

export interface ProviderChainEntry {
  readonly provider: string;
  readonly modelId: string;
  readonly goKeyIdx?: number;
}

export const PROVIDER_CHAIN: readonly ProviderChainEntry[] = [
  { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 0 },
  { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 1 },
  { provider: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID, goKeyIdx: 2 },
] as const;

export function assertSingleProviderChain(chain: readonly ProviderChainEntry[]): void {
  if (chain.length !== 3) throw new Error(`PROVIDER_CHAIN invariant violated: expected 3 rungs (goKeyIdx 0,1,2), got ${chain.length}`);
  for (const e of chain) {
    if (e.provider !== AETHER_PROVIDER_ID || e.modelId !== AETHER_MODEL_ID) throw new Error(`PROVIDER_CHAIN rung mismatch: expected ${AETHER_PROVIDER_ID}/${AETHER_MODEL_ID}, got ${e.provider}/${e.modelId}`);
  }
  const idxs = chain.map((e) => e.goKeyIdx).sort((a, b) => (a ?? -1) - (b ?? -1));
  if (idxs[0] !== 0 || idxs[1] !== 1 || idxs[2] !== 2) throw new Error(`PROVIDER_CHAIN goKeyIdx invariant violated: expected exactly {0,1,2}, got {${chain.map((e) => String(e.goKeyIdx)).join(',')}}`);
  if (new Set(idxs).size !== 3) throw new Error(`PROVIDER_CHAIN goKeyIdx duplicate: ${chain.map((e) => String(e.goKeyIdx)).join(',')}`);
}
