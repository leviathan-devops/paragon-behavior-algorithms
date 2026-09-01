// ═══ PI AETHER AGENT — THE STEP-X JUDGMENT HARNESS ═══
// PORTED from KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/shadow_agent_backend/
// (the boilerplate; deployed here as the aether spine — renamed 2026-08-28)
// src/aether-agent.ts (the operator's production aether-agent backend —
// dist-of-record 2d34c183 lineage, live-proven in container ct-ledger-forge).
//
// THE OPERATOR'S DIRECTIVES (2026-08-22, verbatim):
//   "this is just a aether agent... ALL you need to do is ADAPT it for your
//    use case" · "DO NOT REPLACE THE ENTIRE THING WITH DEGENERATE GARBAGE"
//   "we want high reasoning, read + grep tools"
//
// WHAT IS PRESERVED VERBATIM (the ~80%):
//   - createModels() + nvidia/opencode/openrouter providers + the custom
//     inferx provider (createProvider + openAICompletionsApi, FULL Model shape)
//   - chainedStream: the per-call retry+fallback chain with the ledger-gated
//     skips (with the anyOk all-gates-open escape), 5×2.5s retries,
//     429→shared-exile+immediate-fall, stall→retry-once-then-fall,
//     event-aware watchdog, loud end
//   - THE v2 SYNC (2026-08-23, from the pressure-tested boilerplate v2):
//     the DONE VERIFIER (a done without a content array = DEGENERATE → the
//     next rung — the HT-BUG-8 fix), the FULL-SHAPE chain-exhausted error
//     (stopReason:'error' + content:[] so pi's loop guard catches it), the
//     ZEN-FIRST chain order + the 5-KEY ZEN POOL (round-robin, advance on
//     429 before any fall), the SKIP lines carrying the ledger snapshot,
//     toolExecution 'parallel' (the batch law), MAX_ROUNDS=3
//   - base64 key seeding (exported env wins), STALL_MS=60_000, EXILE via ledger
//   - THE ROUND LOOP: MAX_ROUNDS=3, MIN_MANDATORY_ROUNDS=2, model-decides stop
//
// WHAT IS ADAPTED (the ~20% — the audit use case):
//   - TOOLS: read + grep + report-write (edit STRIPPED — the deliverable is a
//     judgment .md written via report-write, force-path-pinned; ANTI_PATTERN #5)
//   - REASONING: thinkingLevel 'high' (the operator: "REASONING EFFORT HIGH OR
//     MAX" for the code-audit judgment pass), budgets {high:16384, max:65536}
//   - SYSTEM PROMPT + ROUND PROMPTS: the adjudicator contract (investigate →
//     report-write the judgment → verify micro-loop) replacing polish wording
//   - validateFinalText → validateJudgmentMd (the judgment.md section markers)
import { GO_KEYS, goKeyDead, goKeyLabel, goPoolSnapshot, markGoKeyAlive, markGoKeyDead } from '../aether-backend/go-key-pool.js';
import { Agent, type AgentTool } from '@earendil-works/pi-agent-core';
import {
  createAssistantMessageEventStream,
  createModels,
  createProvider,
  envApiKeyAuth,
  type MutableModels,
  type Provider,
} from '@earendil-works/pi-ai';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { RpmLedger } from '../aether/rpm-ledger.js';
import { createReadTool, createGrepTool } from '../harness/pi-audit-tools.js';
import { createReportWriteTool } from '../aether/pi-report-write-tool.js';
import * as fs from 'node:fs';

/** THE PRIMARY MODEL — single-provider opencode-go muse-spark slug (operator hardcode 2026-08-24). */
export const AETHER_MODEL = 'opencode-go/muse-spark-1.2-contributor';
export const AETHER_BASE_URL = 'https://opencode.ai/zen/go/v1';
export const AETHER_PROVIDER_ID = 'opencode-go';

const STALL_MS = 60_000;
const GO_RUNG_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 2500;
const RETRYABLE_RE = /429|rate.?limit|too many|quota|5\d\d/i;

/** THE ROUNDS (the checkpoint's decision tree + the v2 tuning — the operator:
 *  "1 forced revision loop and 2 optional... a cap to break degeneracy, not
 *  rounds forced"; the v2 measured MAX_ROUNDS=3 covers the audit loop: R1
 *  investigate + R2 the judgment write mandatory, R3 optional re-verify — the
 *  model decides via the zero-tool-call clean stop). */
const MAX_ROUNDS = 3;
const MIN_MANDATORY_ROUNDS = 2;

// THE SINGLE KEY (opencode-go — operator hardcode 2026-08-24: ONLY muse-spark
// on opencode-go, no fallback pool). Base64-encoded seed — env ALWAYS wins.
const OPENCODE_GO_KEY_B64 = 'c2stWkhja0RIelZ0SGpmQVQ1b3VEeGZXQTVnUjF3aTlWM1RNb2RpYkNRaDJydDV3cHRUd3pHZEVzalROQlpqd2N0aA==';

export interface ChainEntry {
  provider: string;
  modelId: string;
  /** THE GO KEY INDEX (the v5 pool wiring, ported 2026-08-30): 0/1/2 — each
   *  rung IS one embedded key; the pool decides dead/alive per key. */
  goKeyIdx: number;
}

export interface AetherAgentRunOptions {
  /** The brief file on disk — the findings/source-windows/contract document. */
  promptFilePath: string;
  /** The adjudicator identity + discipline. */
  systemPrompt: string;
  /** The round-1 demand (the investigation instruction). */
  demand?: string;
  maxRounds?: number;
  signal?: AbortSignal;
  /** THE TEST SEAM (the pi streamFn option, verbatim) — scripted streams. */
  streamFn?: unknown;
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

export interface StepXAgentOptions {
  /** The directory greps are SCOPED to (the audited project root). */
  targetRoot?: string;
  /** The judgment output path (report-write is force-pinned here). */
  judgmentPath: string;
  ledgerOpts?: { id: string };
}

/** ═══ THE AETHER AGENT ═══ ONE CLASS, THE PI SDK VERBATIM. */
export class AetherAgent {
  private readonly models: MutableModels;
  readonly chain: ChainEntry[];
  readonly ledger: import('../aether/rpm-ledger.js').RpmLedger;

  constructor(opts?: StepXAgentOptions & { ledger?: import('../aether/rpm-ledger.js').RpmLedger }) {
    this.ledger = opts?.ledger ?? new RpmLedger(opts?.ledgerOpts?.id ?? 'aether-stepx-' + Date.now());
    // THE 3-KEY CHAIN (the v5 pool wiring, ported 2026-08-30 — the operator:
    // "copy exactly how the fallback chain was wired in wave-manager-generate-
    // SHIP-APPROVED-v5"): each rung IS one embedded key (goKeyIdx 0/1/2); the
    // pool gates dead keys, a 429 dead-marks the key with its OWN parsed
    // window and the chain falls to the next key. Env key stays a fallback.
    if (!process.env.OPENCODE_API_KEY) process.env.OPENCODE_API_KEY = Buffer.from(OPENCODE_GO_KEY_B64, 'base64').toString('utf-8');

    this.models = createModels();
    this.models.setProvider(this.opencodeGoProvider());

    this.chain = [
      { provider: AETHER_PROVIDER_ID, modelId: 'muse-spark-1.2-contributor', goKeyIdx: 0 },
      { provider: AETHER_PROVIDER_ID, modelId: 'muse-spark-1.2-contributor', goKeyIdx: 1 },
      { provider: AETHER_PROVIDER_ID, modelId: 'muse-spark-1.2-contributor', goKeyIdx: 2 },
    ];
    void opts;
  }

  private opencodeGoProvider(): ReturnType<typeof createProvider> {
    // THE API-FAMILY FIX (2026-08-28): muse is an openai-responses-family
    // model on the same baseUrl — /chat/completions 500s for muse upstream
    // (live-proven; /responses completes). Flipped the entry's api family +
    // adapter accordingly; retry mechanics untouched.
    return createProvider({
      id: AETHER_PROVIDER_ID,
      name: 'OpenCode Go',
      baseUrl: AETHER_BASE_URL,
      auth: { apiKey: envApiKeyAuth('OpenCode Go API key', ['OPENCODE_API_KEY']) },
      models: [
        {
          id: 'muse-spark-1.2-contributor',
          name: 'Muse Spark 1.2 Contributor',
          api: 'openai-responses',
          provider: AETHER_PROVIDER_ID,
          baseUrl: AETHER_BASE_URL,
          reasoning: true,
          input: ['text', 'image'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          contextWindow: 1050000,
          maxTokens: 128000,
          thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' } as never,
          compat: { sessionAffinityFormat: 'openai-nosession' } as never,
        } as never,
      ] as never,
      api: openAIResponsesApi(),
    });
  }

  /** THE SINGLE-PROVIDER RETRY CHAIN — 15 retries × 3s on opencode-go/muse-spark-1.2-contributor.
   *  No fallback, no pool — operator hardcode 2026-08-24. After 15 consecutive
   *  failures the step loud-fails "provider unresponsive" (isolated — rest of tool works).
   *  Resets count after each successful generation (per-call loop). Endpoint:
   *  https://opencode.ai/zen/go/v1/chat/completions, slug opencode-go/muse-spark-1.2-contributor. */
  private chainedStream(model: never, context: never, options: never): ReturnType<typeof createAssistantMessageEventStream> {
    const outer = createAssistantMessageEventStream();
    const base = (options ?? {}) as Record<string, unknown>;
    const chainT0 = Date.now();
    console.error('[chain] START — PAID 3-key cycler (pool-gated, v5 wiring) opencode-go/muse-spark-1.2-contributor @ ' + AETHER_BASE_URL + '/responses [openai-responses family], xhigh');
    void (async () => {
      let lastError: string | null = null;
      // THE POOL-GATED KEY CHAIN (the v5 shadow-agent wiring, ported verbatim-
      // adapted 2026-08-30): for each key entry — skip dead keys (zero requests),
      // 3 attempts × 2.5s on a 429 (a transient burst is absorbed), then
      // dead-mark the key with its OWN parsed window and fall to the next key.
      // Success heals the key's stale timeout. The entryModel resolves once.
      const entryModel = this.models.getModel('muse-spark-1.2-contributor' as never, 'muse-spark-1.2-contributor' as never)
        ?? this.models.getModel(AETHER_PROVIDER_ID as never, 'muse-spark-1.2-contributor' as never);
      if (!entryModel) {
        lastError = 'AETHER_CHAIN_NO_MODEL: ' + AETHER_PROVIDER_ID + '/muse-spark-1.2-contributor';
      }
      for (const entry of this.chain) {
        if (lastError === 'AETHER_CHAIN_NO_MODEL') break;
        // THE POOL GATE — a key whose global deadUntil is still running is
        // SKIPPED: zero requests burned; self-heals when Date.now() passes it.
        if (goKeyDead(entry.goKeyIdx)) {
          console.error('[chain] SKIP', goKeyLabel(entry.goKeyIdx), entry.provider + '/' + entry.modelId, '— pool: dead (window running) | pool:', goPoolSnapshot());
          continue;
        }
        const key = GO_KEYS[entry.goKeyIdx];
        const attempts = GO_RUNG_ATTEMPTS; // THE GO RUNG RETRY CAP (the v5 law: 3 × 2.5s, then dead-mark + next key)
        for (let attempt = 1; attempt <= attempts; attempt++) {
          let attemptError: string | null = null;
          let succeeded = false;
          const buffer: unknown[] = [];
          const attemptT0 = Date.now();
          console.error('[chain] try', goKeyLabel(entry.goKeyIdx), entry.provider + '/' + entry.modelId, 'attempt', attempt + '/' + attempts, 'at +' + Math.round((Date.now() - chainT0) / 1000) + 's');
          const ac = new AbortController();
          let lastEventAt = Date.now();
          const stallTimer = setInterval(() => {
            if (Date.now() - lastEventAt > STALL_MS && !succeeded && !attemptError) {
              ac.abort();
              attemptError = 'AETHER_STALL: no event within ' + (STALL_MS / 1000) + 's from ' + entry.provider + '/' + entry.modelId + ' (attempt ' + attempt + ')';
            }
          }, 1000);
          const admitted = await this.ledger.acquire(entry.provider, { maxWaitMs: 6000, signal: ac.signal });
          if (!admitted) {
            clearInterval(stallTimer);
            lastError = 'LEDGER_ADMISSION_DENIED: ' + entry.provider;
            attemptError = lastError;
            console.error('[chain] SKIP', entry.provider + '/' + entry.modelId, '— acquire denied, will retry after backoff');
          } else {
            try {
              const inner = this.models.streamSimple(entryModel as never, context, {
                ...base,
                apiKey: key,
                signal: ac.signal,
              } as never);
              let eventCount = 0;
              for await (const event of inner) {
                if (ac.signal.aborted) break;
                lastEventAt = Date.now();
                eventCount++;
                if (eventCount === 1 || eventCount % 25 === 0) {
                  console.error('[chain]', entry.provider + '/' + entry.modelId, 'attempt', attempt, 'event', eventCount, (event as { type?: string }).type, 'at +' + Math.round((Date.now() - attemptT0) / 1000) + 's');
                }
                const ev = event as { type?: string; error?: { errorMessage?: string } };
                if (ev.type === 'error') { attemptError = ev.error?.errorMessage ?? 'aether-stream-error'; break; }
                if (ev.type === 'done') {
                  const msgContent = (event as { message?: { content?: unknown } }).message?.content;
                  if (!Array.isArray(msgContent)) {
                    attemptError = 'AETHER_DEGENERATE_DONE: terminal event without content from ' + entry.provider;
                    console.error('[chain] DEGENERATE-DONE', entry.provider + '/' + entry.modelId, '— will retry');
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
                console.error('[chain] OK', goKeyLabel(entry.goKeyIdx), entry.provider + '/' + entry.modelId, 'attempt', attempt, 'events', eventCount, 'at +' + Math.round((Date.now() - attemptT0) / 1000) + 's');
                this.ledger.recordSuccess(entry.provider);
                // THE HEAL-BACK (the v5 law): a success through a go key clears
                // its stale timeout — the key proved itself alive.
                markGoKeyAlive(entry.goKeyIdx);
                for (const ev of buffer) outer.push(ev as never);
                outer.end();
                return;
              }
              // no success — log fail; attemptError already set or synthesize
              console.error('[chain] FAIL', goKeyLabel(entry.goKeyIdx), entry.provider + '/' + entry.modelId, 'attempt', attempt, 'err', (attemptError ?? 'none')?.slice(0, 200));
            } catch (e) {
              clearInterval(stallTimer);
              attemptError = e instanceof Error ? e.message : String(e);
              console.error('[chain] THROW', goKeyLabel(entry.goKeyIdx), entry.provider + '/' + entry.modelId, 'attempt', attempt, 'err', attemptError.slice(0, 200));
            }
            if (!attemptError && !succeeded) attemptError = 'aether-no-progress';
          }
          lastError = attemptError ?? lastError;
          const isStall = (lastError ?? '').startsWith('AETHER_STALL');
          const isRateLimit = /\b429\b|rate.?limit|too many|quota/i.test(lastError ?? '');
          // THE STALL FALL: a dead connection retries ONCE then falls to the
          // next key (the provider isn't limited; the attempt was slow).
          if (isStall && attempt >= 2) break;
          if (isRateLimit) {
            // THE GO KEY SEQUENCE (the v5 law): 429 → retry the SAME key after
            // 2.5s up to the 3-attempt cap (a transient burst is absorbed);
            // still 429 on the last attempt → document the key's OWN window
            // into the global pool and break — the next chain entry IS the
            // next key. NO provider-level exile on the go path (the ledger
            // exile would poison the sibling keys' admission).
            if (attempt < attempts) {
              console.error('[chain] 429', goKeyLabel(entry.goKeyIdx), 'attempt', attempt + '/' + attempts, '— retrying in 2.5s before the dead-mark');
              await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
              continue;
            }
            const until = markGoKeyDead(entry.goKeyIdx, lastError ?? '');
            console.error('[chain] GO KEY DEAD', goKeyLabel(entry.goKeyIdx), '— until', new Date(until).toISOString(), '— falling to the next key | pool:', goPoolSnapshot());
            break;
          }
          if (RETRYABLE_RE.test(lastError ?? '') && attempt < attempts) {
            await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
            continue;
          }
          break; // non-retryable or exhausted → next key
        }
      }
      // THE LOUD FAIL — every key exhausted: the error carries the FULL pool
      // snapshot; the keys re-enter the line automatically when their windows pass.
      const finalMsg = lastError
        ? lastError + ' — the PAID API (opencode-go/muse-spark-1.2-contributor) failed on every key. KEY POOL: ' + goPoolSnapshot() + '. The keys re-enter the line automatically when their windows pass.'
        : 'AETHER_CHAIN_FAIL — provider unresponsive. KEY POOL: ' + goPoolSnapshot();
      console.error('[chain] LOUD FAIL — all keys exhausted:', finalMsg.slice(0, 300));
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
      outer.push({ type: 'error', reason: 'error', error: chainErrorMessage } as never);
      outer.end();
    })();
    return outer;
  }

  /** THE TOOLS — read (pi native) + grep (scoped ripgrep) + report-write
   *  (force-pinned judgment writer). The EDIT TOOL IS STRIPPED per the
   *  operator's ruling: the agent investigates and writes its judgment, it
   *  does not modify anything. */
  private buildTools(targetRoot: string, judgmentPath: string): AgentTool[] {
    const readNative = createReadTool();
    const grepNative = createGrepTool(targetRoot);
    const writeNative = createReportWriteTool(judgmentPath);
    // The harness tools carry their own context resolution; expose them to the
    // plain Agent surface as AgentTools (the harness resolves context itself).
    return [readNative as unknown as AgentTool, grepNative, writeNative];
  }

  /** THE RUN — spawn the headless pi Agent + adjudicate the brief.
   *  R1 investigation · R2 report-write (+micro-loop ≤3) · R3/R4 optional. */
  async run(opts: AetherAgentRunOptions & { targetRoot: string; judgmentPath: string }): Promise<AetherAgentRunResult> {
    const promptFilePath = opts.promptFilePath;
    const model = this.models.getModel(AETHER_PROVIDER_ID as never, 'muse-spark-1.2-contributor' as never)
      ?? this.models.getModel(AETHER_PROVIDER_ID as never, (AETHER_MODEL.split('/').pop() || AETHER_MODEL) as never);
    if (!model) {
      return {
        text: '', lines: 0, roundsUsed: 0, toolCallsMade: 0, toolCallNames: [],
        errors: ['AETHER_PI_NO_MODEL: ' + AETHER_PROVIDER_ID + '/' + AETHER_MODEL + ' not in the pi ' + AETHER_PROVIDER_ID + ' provider catalog — provider unresponsive'],
        fileStates: [],
      };
    }

    const spine = this.buildTools(opts.targetRoot, opts.judgmentPath);
    const tools = [...spine, ...(opts.tools ?? [])] as unknown as AgentTool[];
    const agent = new Agent({
      initialState: {
        systemPrompt: opts.systemPrompt,
        model,
        tools,
        // THE REASONING (operator 2026-08-24: "reasoning effort xhigh") — hardcoded xhigh
        // for the code-audit judgment pass on opencode-go/muse-spark-1.2-contributor
        // at https://opencode.ai/zen/go/v1/chat/completions.
        thinkingLevel: 'xhigh' as never,
      },
      streamFn: (opts.streamFn ? opts.streamFn : this.chainedStream.bind(this)) as never,
      toolExecution: 'parallel' as never,
      thinkingBudgets: { minimal: 512, low: 1024, medium: 2048, high: 16384, max: 65536, xhigh: 131072 } as never,
      getApiKey: () => process.env.OPENCODE_API_KEY,
    });

    let roundsUsed = 0;
    let toolCallsMade = 0;
    const toolCallNames: string[] = [];
    let prevMessageCount = 0;
    const errors: string[] = [];
    const runStart = Date.now();

    // THE ROUND PROMPTS (adapted to the adjudicator contract — your loop kept:
    // R1/R2 mandatory, R3/R4 optional model-decides, micro-loop ≤3 in R2+).
    const roundPrompt = (round: number): string => {
      switch (round) {
        case 1:
          return 'ROUND 1 — INVESTIGATION (mandatory, no writes). For EVERY finding in the brief: batch your greps and reads against the source windows, verify each claim against the real code, and note the evidence for or against. Plan nothing else. Do NOT call report_write yet.';
        case 2:
          return 'ROUND 2 — THE JUDGMENT WRITE (mandatory, ONE report_write call). From your R1 evidence: fire report_write ONCE carrying the COMPLETE judgment document per its CONTRACT — executive summary first, then EVERY FINDING block (exact grammar), then red-herrings. Missing findings = failed round.';
        case 3:
          return 'ROUND 3 — OPTIONAL RE-VERIFY. Read your judgment file against your R1 evidence. Solid = zero tool calls (DONE). Defects = ONE corrected report_write call, then re-verify up to 3 loops.';
        default:
          return 'ROUND 4 — FINAL RE-VERIFY (optional). Same contract as ROUND 3. Clean = DONE.';
      }
    };
    const effectiveRound = (round: number): string =>
      round === 1 && opts.demand ? opts.demand + '\n\n' + roundPrompt(round) : roundPrompt(round);

    try {
      const maxRounds = opts.maxRounds ?? MAX_ROUNDS;
    for (let round = 1; round <= maxRounds; round++) {
        roundsUsed = round;
        console.error('[aether-agent] ROUND', round + '/' + MAX_ROUNDS, 'START', Math.round((Date.now() - runStart) / 1000) + 's');
        await agent.prompt(effectiveRound(round));
        await agent.waitForIdle();

        const newMessages = agent.state.messages.slice(prevMessageCount);
        prevMessageCount = agent.state.messages.length;
        const { roundToolCalls, roundToolNames } = (() => {
          let n = 0;
          const names: string[] = [];
          for (const m of newMessages) {
            if (m.role === 'assistant' && Array.isArray((m as { content?: unknown }).content)) {
              for (const c of (m as { content: Array<{ type?: string; name?: string; toolName?: string }> }).content) {
                if (c.type === 'toolCall') {
                  n++;
                  const nm = (c.name ?? c.toolName ?? '') as string;
                  if (nm) names.push(nm);
                }
              }
            }
          }
          return { roundToolCalls: n, roundToolNames: names };
        })();
        toolCallsMade += roundToolCalls;
        toolCallNames.push(...roundToolNames);

        // THE DECISION TREE (preserved verbatim): R1/R2 mandatory, R3/R4 only
        // while the model keeps calling tools; a clean round stops early.
        const judgmentExists = (() => { try { return fs.readFileSync(opts.judgmentPath, 'utf-8').trim().length > 0; } catch { return false; } })();
        if (judgmentExists && round >= MIN_MANDATORY_ROUNDS && round < maxRounds) break;
        if (round >= MIN_MANDATORY_ROUNDS && roundToolCalls === 0) break;
        if (round >= maxRounds) break;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }

    // THE FILE-DELIVERABLE CHECK (your A2 loud-fail law, adapted): the agent
    // wrote the judgment AND it has content → success. Errored AND never wrote
    // → LOUD fail manifest.
    const wroteJudgment = (() => {
      try { return fs.readFileSync(opts.judgmentPath, 'utf-8').includes('### FINDING'); } catch { return false; }
    })();
    const judgmentHasContent = (() => {
      try { return fs.readFileSync(opts.judgmentPath, 'utf-8').trim().length > 0; } catch { return false; }
    })();
    const succeeded = wroteJudgment && judgmentHasContent;

    let agentErrored: string | undefined;
    try {
      const msgs = agent.state.messages;
      if (msgs && typeof msgs.length === 'number') {
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m && m.role === 'assistant' && (m as { errorMessage?: string }).errorMessage) {
            agentErrored = (m as { errorMessage?: string }).errorMessage;
            break;
          }
        }
      }
      if (!agentErrored && agent.state.errorMessage) agentErrored = agent.state.errorMessage;
    } catch { /* fall through */ }
    if ((agentErrored || errors.length > 0) && !succeeded) {
      const errText = agentErrored || errors[0] || 'AETHER_PI_FAIL';
      return {
        text: '', lines: 0, roundsUsed, toolCallsMade, toolCallNames,
        errors: [errText],
        fileStates: [],
      };
    }

    const finalText = fs.readFileSync(opts.judgmentPath, 'utf-8');
    return {
      text: finalText,
      lines: finalText.split('\n').length,
      roundsUsed,
      toolCallsMade,
      toolCallNames,
      errors,
      fileStates: [{ path: opts.judgmentPath, lines: finalText.split('\n').length, chars: finalText.length }],
    };
  }
}
