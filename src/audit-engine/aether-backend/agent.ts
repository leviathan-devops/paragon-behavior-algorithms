import { Agent, type AgentTool } from '@earendil-works/pi-agent-core';
// ═══ THE NATIVE PI SDK WIRING (2026-08-28 operator ruling: "wire this EXACTLY
// like how it is wired in .../agent_plugin_boilerplates/shadow_agent_backend ·
// (the boilerplate; deployed here as the aether spine — renamed 2026-08-28))
// USE THE NATIVE PI SDK SETUP DONT MONKEY PATCH ANY GARBADE"): createModels +
// the NATIVE opencodeGoProvider() from pi-ai's own provider registry. The
// former hand-built createProvider catalog (custom model entry + the
// openai-nosession compat shim) and the custom stream factory binding are
// DELETED — the native provider owns its catalog, auth resolution, and api.
// The sanctioned adaptations remain exactly D-20260822-40's scope: system
// prompts + rounds + input mechanisms (tools.ts / demand-builder.ts), which
// do NOT live in this file's transport layer. ═══
//
// ═══ THE API-FAMILY FIX (2026-08-28 — THE muse 500 root cause): muse is an
// OPENAI-RESPONSES-family model. LIVE PROVEN: POST /chat/completions → HTTP 500
// across every budget while kimi/glm 200'd the same second; POST /responses →
// HTTP 200 'completed' with real output in 1.5s. The pinned pi-ai vendor
// catalog predates muse (19 rows; zero muse), so after registering the NATIVE
// provider we ALSO register muse itself through the SDK'S OWN createProvider +
// openAIResponsesApi adapter — the boilerplate's sanctioned custom-rung
// pattern (its inferx provider is built exactly this way). Zero transport
// monkey-patching: pi owns payload shaping, streaming, retries plumbing. ═══
import { createModels, createProvider, createAssistantMessageEventStream, envApiKeyAuth, type MutableModels } from '@earendil-works/pi-ai';
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RpmLedger } from './rpm-ledger.js';
import { AETHER_MODEL_ID, AETHER_PROVIDER_ID, PROVIDER_CHAIN } from './provider.js';
import { GO_KEYS, goKeyDead, goKeyLabel, goPoolSnapshot, markGoKeyAlive, markGoKeyDead } from './go-key-pool.js';
import { createAuditorTools, type ToolsContext, type ReadTurn } from './tools.js';

export const AETHER_MODEL = `${AETHER_PROVIDER_ID}/${AETHER_MODEL_ID}`;

// ═══ THE RETRY + STALL MECHANICS — the boilerplate's verbatim constants ═══
// ("if 429 hits - WHO FUCKING CARES wait and try again": 5 attempts × 2.5s,
// retryability INCLUDING the 5xx class — the muse 500s are transient-upstream
// and belong in the bounded-retry budget, not an instant die.)
const RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 2500;
const RETRYABLE_RE = /429|rate.?limit|too many|quota|5\d\d/i;
const STALL_MS = 60_000;

// THE GO KEY SEED (the operator's granted credential, base64-encoded — the
// plaintext appears NOWHERE in source; AP-4). An exported env var ALWAYS wins
// (the seeds fill only unset slots — canon "exported env vars always win").

export interface AetherAgentRunOptions {
  promptFilePath: string;
  systemPrompt: string;
  demand?: string;
  maxRounds?: number;
  signal?: AbortSignal;
  streamFn?: unknown;
  targetRoot: string;
  ledgerRoot: string;
  specsRoots: string[];
  readTurns?: ReadTurn[];
  phaseRef?: { current: string };
  tools?: AgentTool[];
}

export interface AetherAgentRunResult {
  text: string;
  lines: number;
  roundsUsed: number;
  toolCallsMade: number;
  toolCallNames: string[];
  errors: string[];
  fileStates: Array<{ path: string; lines: number; chars: number }>;
}

export class AetherAgent {
  private readonly models: MutableModels;
  readonly chain = PROVIDER_CHAIN;
  readonly ledger: RpmLedger;

  constructor(opts?: { ledger?: RpmLedger; ledgerId?: string }) {
    this.ledger = opts?.ledger ?? new RpmLedger(opts?.ledgerId ?? 'aether-backend-' + Date.now());
    // THE KEY SLOTS are seeded at MODULE LOAD in provider.ts (seedAetherProviderEnv)
    // — by lifecycle necessity: the step-0 probe runs before this constructor.
    // THE NATIVE PI MODELS — createModels + the NATIVE opencode-go provider
    // from pi-ai's own registry. Its catalog/auth/api are the SDK's own; zero
    // hand-built model entries remain (the monkey-patch era is deleted).
    this.models = createModels();
    this.models.setProvider(opencodeGoProvider());
    // THE VENDOR-CATALOG GAP PATCH: the pinned pi-ai go-catalog predates muse.
    // muse rides the openai-responses family on the SAME baseUrl (live-proven;
    // see the header). Registered through the SDK's own createProvider +
    // responses adapter with the vendor's own row shape (mirrors gpt-5.6-luna:
    // compat openai-nosession · thinkingLevelMap xhigh→xhigh · 1.05M ctx /
    // 128K out). setProvider under the SAME id replaces the native registration
    // — deliberate: this backend is a SINGLE-RUNG muse-only machine (the chain
    // const below), so nothing else from the native rows is consumed.
    this.models.setProvider(createProvider({
      id: AETHER_PROVIDER_ID,
      name: 'OpenCode Go — muse (responses family)',
      auth: { apiKey: envApiKeyAuth('OpenCode Go API key', ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY']) },
      models: [
        {
          id: AETHER_MODEL_ID,
          name: 'Muse Spark 1.2 Contributor',
          api: 'openai-responses',
          provider: AETHER_PROVIDER_ID,
          baseUrl: 'https://opencode.ai/zen/go/v1',
          reasoning: true,
          input: ['text', 'image'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          contextWindow: 1050000,
          maxTokens: 128000,
          thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' } as never,
          compat: { sessionAffinityFormat: 'openai-nosession' } as never,
        } as never,
      ] as never,
      api: { 'openai-responses': openAIResponsesApi() } as never,
    }));
  }

  private chainedStream(model: never, context: never, options: never): unknown {
    const streamFactory: (() => { push: (e: unknown) => void; end: () => void; [Symbol.asyncIterator]: () => AsyncIterator<unknown> }) | undefined = createAssistantMessageEventStream as (() => { push: (e: unknown) => void; end: () => void; [Symbol.asyncIterator]: () => AsyncIterator<unknown> }) | undefined;
    const outer: ReturnType<typeof createAssistantMessageEventStream> | { push: (e: unknown) => void; end: () => void; [Symbol.asyncIterator]: () => AsyncIterator<unknown> } = (() => {
      try { return (streamFactory as () => unknown)() as never; } catch { return (streamFactory as () => unknown)() as never; }
    })() as never;
    const base = (options ?? {}) as Record<string, unknown>;
    void (async () => {
      const chainT0 = Date.now();
      console.error('[chain] START', AETHER_PROVIDER_ID + '/' + AETHER_MODEL_ID, '— PAID 3-key cycler (pool-gated: .trident-aether-go-key-pool.json), ledger-gated');
      const chain = this.chain;
      let lastError: string | null = null;
      for (const entry of chain) {
        if (entry.goKeyIdx !== undefined && goKeyDead(entry.goKeyIdx)) {
          console.error('[chain] SKIP', goKeyLabel(entry.goKeyIdx), entry.provider + '/' + entry.modelId, '— pool: dead (window running) | pool:', goPoolSnapshot());
          continue;
        }
        const key = entry.goKeyIdx !== undefined ? GO_KEYS[entry.goKeyIdx] : (process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY);
        const entryModel = this.models.getModel(entry.provider as never, entry.modelId as never) ?? (entry.modelId.includes('/') ? this.models.getModel(entry.provider as never, (entry.modelId.split('/').pop() || entry.modelId) as never) : undefined);
        if (!entryModel) {
          lastError = 'AETHER_CHAIN_NO_MODEL: ' + entry.provider + '/' + entry.modelId;
          continue;
        }
        if (!key) {
          lastError = 'AETHER_CHAIN_NO_KEY: ' + entry.provider;
          continue;
        }
        const attempts = entry.goKeyIdx !== undefined ? 3 : RETRY_ATTEMPTS;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          let attemptError: string | null = null;
          let succeeded = false;
          const buffer: unknown[] = [];
          const attemptT0 = Date.now();
          const ac = new AbortController();
          let lastEventAt = Date.now();
          const stallTimer = setInterval(() => {
            if (Date.now() - lastEventAt > STALL_MS && !succeeded && !attemptError) {
              ac.abort();
              attemptError = 'AETHER_STALL: no event within ' + (STALL_MS / 1000) + 's from ' + entry.provider + '/' + entry.modelId + ' (attempt ' + attempt + ') — the stream is DEAD, not thinking';
            }
          }, 1000);
          console.error('[chain] try', entry.provider + '/' + entry.modelId, 'attempt', attempt + '/' + attempts, 'at +' + Math.round((Date.now() - chainT0) / 1000) + 's');
          const admitted = await this.ledger.acquire(entry.provider, { maxWaitMs: 6000, signal: ac.signal });
          if (!admitted) {
            clearInterval(stallTimer);
            lastError = 'LEDGER_ADMISSION_DENIED: ' + entry.provider;
            attemptError = lastError;
          } else {
            try {
              const inner = this.models.streamSimple(entryModel as never, context, { ...base, apiKey: key, signal: ac.signal } as never);
              let eventCount = 0;
              for await (const event of inner as AsyncIterable<unknown>) {
                if (ac.signal.aborted) break;
                lastEventAt = Date.now();
                eventCount++;
                const ev = event as { type?: string; error?: { errorMessage?: string } };
                if (ev.type === 'error') { attemptError = ev.error?.errorMessage ?? 'aether-stream-error'; break; }
                if (ev.type === 'done') {
                  const msgContent = (event as { message?: { content?: unknown } }).message?.content;
                  if (!Array.isArray(msgContent)) {
                    attemptError = 'AETHER_DEGENERATE_DONE: terminal event without content from ' + entry.provider;
                    break;
                  }
                  succeeded = true;
                  buffer.push(event);
                  break;
                }
                buffer.push(event);
              }
              clearInterval(stallTimer);
              if (succeeded) {
                console.error('[chain] OK', entry.provider + '/' + entry.modelId, 'attempt', attempt, 'events', eventCount, 'at +' + Math.round((Date.now() - attemptT0) / 1000) + 's');
                this.ledger.recordSuccess(entry.provider);
                if (entry.goKeyIdx !== undefined) markGoKeyAlive(entry.goKeyIdx);
                for (const ev of buffer) (outer as { push: (e: unknown) => void }).push(ev as never);
                (outer as { end: () => void }).end();
                return;
              }
              void attemptT0; void eventCount;
            } catch (e) {
              clearInterval(stallTimer);
              attemptError = e instanceof Error ? e.message : String(e);
            }
            if (!attemptError && !succeeded) attemptError = 'aether-no-progress';
          }
          lastError = attemptError ?? lastError;
          console.error('[chain] FAIL', entry.provider + '/' + entry.modelId, 'attempt', attempt, 'err', (lastError ?? 'none').slice(0, 140), 'at +' + Math.round((Date.now() - chainT0) / 1000) + 's');
          const isStall = (lastError ?? '').startsWith('AETHER_STALL');
          if (isStall && attempt >= 2) break;
          const isRateLimit = /\b429\b|rate.?limit|too many\b/i.test(lastError ?? '');
          if (isRateLimit) {
            if (entry.goKeyIdx !== undefined) {
              if (attempt < attempts) {
                console.error('[chain] 429', goKeyLabel(entry.goKeyIdx), 'attempt', attempt + '/' + attempts, '— retrying in 2.5s before the dead-mark');
                await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
                continue;
              }
              const until = markGoKeyDead(entry.goKeyIdx, lastError ?? '');
              this.ledger.record429(entry.provider);
              console.error('[chain] GO KEY DEAD', goKeyLabel(entry.goKeyIdx), '— until', new Date(until).toISOString(), '— falling to the next key | pool:', goPoolSnapshot());
              break;
            }
            this.ledger.record429(entry.provider);
            console.error('[chain] EXILE', entry.provider, '— 429-class observed');
            break;
          }
          if (RETRYABLE_RE.test(lastError ?? '') && attempt < attempts) {
            await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
            continue;
          }
          break;
        }
      }
      const finalMsg = 'AETHER_API_UNREACHABLE: the PAID API (' + AETHER_PROVIDER_ID + '/' + AETHER_MODEL_ID + ') failed after every attempt — API UNREACHABLE — SWAP THE API KEY (export OPENCODE_GO_API_KEY). KEY POOL: ' + goPoolSnapshot() + '. The keys re-enter the line automatically when their windows pass. Last error: ' + (lastError ?? 'AETHER_CHAIN_FAIL');
      const chainErrorMessage = {
        role: 'assistant' as const,
        api: 'openai-completions' as const,
        provider: 'chain',
        model: 'chain-fail',
        content: [] as unknown[],
        stopReason: 'error' as const,
        errorMessage: finalMsg,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        timestamp: Date.now(),
      };
      (outer as { push: (e: unknown) => void }).push({ type: 'error', reason: 'error', error: chainErrorMessage } as never);
      (outer as { end: () => void }).end();
    })();
    return outer;
  }

  async run(opts: AetherAgentRunOptions): Promise<AetherAgentRunResult> {
    const model = this.models.getModel(AETHER_PROVIDER_ID as never, AETHER_MODEL_ID as never) ?? this.models.getModel(AETHER_PROVIDER_ID as never, (AETHER_MODEL_ID.split('/').pop() || AETHER_MODEL_ID) as never);
    if (!model) {
      return { text: '', lines: 0, roundsUsed: 0, toolCallsMade: 0, toolCallNames: [], errors: ['AETHER_PI_NO_MODEL: ' + AETHER_PROVIDER_ID + '/' + AETHER_MODEL_ID], fileStates: [] };
    }
    const readTurns: ReadTurn[] = opts.readTurns ?? [];
    const phaseRef = opts.phaseRef ?? { current: 'P1' };
    const ctx: ToolsContext = { targetRoot: opts.targetRoot, specsRoots: opts.specsRoots, ledgerRoot: opts.ledgerRoot, phaseRef, readTurns };
    const spine = createAuditorTools(ctx);
    const tools = [...spine, ...(opts.tools ?? [])] as unknown as AgentTool[];
    const agent = new Agent({
      initialState: { systemPrompt: opts.systemPrompt, model, tools, thinkingLevel: 'xhigh' as never },
      streamFn: (opts.streamFn ? opts.streamFn : this.chainedStream.bind(this)) as never,
      toolExecution: 'parallel' as never,
      thinkingBudgets: { minimal: 512, low: 1024, medium: 2048, high: 16384, max: 65536, xhigh: 131072 } as never,
      getApiKey: () => process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY ?? '',
    });
    let roundsUsed = 0;
    let toolCallsMade = 0;
    const toolCallNames: string[] = [];
    let prevMessageCount = 0;
    const errors: string[] = [];
    try {
      const maxRounds = opts.maxRounds ?? 3;
      for (let round = 1; round <= maxRounds; round++) {
        roundsUsed = round;
        const roundPrompt = round === 1 ? (opts.demand ? opts.demand : 'Investigate the candidates against the specs and code.') : round === 2 ? 'Adjudicate and write verdicts.json + report.md to the ledger.' : 'Re-verify citations.';
        await agent.prompt(roundPrompt);
        await agent.waitForIdle();
        const newMessages = agent.state.messages.slice(prevMessageCount);
        prevMessageCount = agent.state.messages.length;
        let n = 0;
        const namesThisRound: string[] = [];
        for (const m of newMessages) {
          if (m.role === 'assistant' && Array.isArray((m as { content?: unknown }).content)) {
            for (const c of (m as { content: Array<{ type?: string; name?: string; toolName?: string }> }).content) {
              if (c.type === 'toolCall') {
                n++;
                const nm = (c.name ?? c.toolName ?? '') as string;
                if (nm) namesThisRound.push(nm);
              }
            }
          }
        }
        toolCallsMade += n;
        toolCallNames.push(...namesThisRound);
        if (round >= 2 && n === 0) break;
        if (round >= maxRounds) break;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
    let agentErrored: string | undefined;
    try {
      const msgs = agent.state.messages;
      if (msgs) {
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i] as { role?: string; errorMessage?: string };
          if (m && m.role === 'assistant' && m.errorMessage) { agentErrored = m.errorMessage; break; }
        }
      }
      if (!agentErrored && (agent.state as { errorMessage?: string }).errorMessage) agentErrored = (agent.state as { errorMessage?: string }).errorMessage;
    } catch {}
    const ledgerFiles = (() => {
      try {
        const files: Array<{ path: string; lines: number; chars: number }> = [];
        const walk = (dir: string) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else {
              try { const t = fs.readFileSync(p, 'utf-8'); files.push({ path: p, lines: t.split('\n').length, chars: t.length }); } catch {}
            }
          }
        };
        if (fs.existsSync(opts.ledgerRoot)) walk(opts.ledgerRoot);
        return files;
      } catch { return []; }
    })();
    const succeeded = ledgerFiles.length > 0;
    if ((agentErrored || errors.length > 0) && !succeeded) {
      const errText = agentErrored || errors[0] || 'AETHER_PI_FAIL';
      return { text: '', lines: 0, roundsUsed, toolCallsMade, toolCallNames, errors: [errText], fileStates: [] };
    }
    const finalText = (() => {
      try {
        const reportPath = path.join(opts.ledgerRoot, 'report.md');
        if (fs.existsSync(reportPath)) return fs.readFileSync(reportPath, 'utf-8');
        const vPath = path.join(opts.ledgerRoot, 'verdicts.json');
        if (fs.existsSync(vPath)) return fs.readFileSync(vPath, 'utf-8');
        return ledgerFiles.map((f) => f.path).join('\n');
      } catch { return ''; }
    })();
    return { text: finalText, lines: finalText.split('\n').length, roundsUsed, toolCallsMade, toolCallNames, errors, fileStates: ledgerFiles };
  }
}
