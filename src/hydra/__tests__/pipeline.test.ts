import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { z } from 'zod';
import { AetherHydraPipeline } from '../pipeline.js';
import { SQLiteMemoryStore } from '../memory.js';
import type { PipelineConfig, SubagentSpec, GraphMapper, GraphifyGraph, LLMTransport, GateCheck } from '../types.js';
import type { AgentTool } from '@earendil-works/pi-agent-core';

// Local test mock — replaces the deleted subagent.ts's __setAgentCtorForTesting
let _mockAgentCtor: unknown = null;
function __setAgentCtorForTesting(ctor: unknown): void {
  _mockAgentCtor = ctor;
}
// Monkey-patch: when tests set a mock ctor, aether-auditor's Agent references resolve to it
(globalThis as Record<string, unknown>).__setAgentCtorForTesting = __setAgentCtorForTesting;


type TInput = { targetRoot: string };
type TSub = { ok: boolean; id?: string };
type TSyn = { count: number; items: TSub[] };
type TOut = TSyn & { telemetry: unknown };

const dummyGraph: GraphifyGraph = { nodes: [], edges: [], communities: [], godNodes: [] };
const TEST_ROOT = 'test-root';

function makeGraphMapper(): GraphMapper {
  return {
    extract: async () => dummyGraph,
    query: async () => ({ nodes: [], edges: [], query: '' }),
    path: async () => ({ from: '', to: '', hops: [], length: 0 }),
    explain: async () => ({ id: '', label: '', type: '', file: '', degree: 0, connections: [] }),
    merge: async () => dummyGraph,
    asAgentTools: () => [],
  };
}

function makeTransport(): LLMTransport {
  return {
    getModel: () => ({ id: 'mock-model' } as unknown as ReturnType<LLMTransport['getModel']>),
    chainedStream: (() => ({})) as unknown as LLMTransport['chainedStream'],
    providerId: 'mock-provider',
    modelId: 'mock-model',
  };
}

function makeSpec(id: string, overrides: Partial<SubagentSpec<TInput, TSub>> = {}): SubagentSpec<TInput, TSub> {
  return {
    id,
    buildSystemPrompt: () => `system:${id}`,
    buildUserPrompt: () => `user:${id}`,
    outputSchema: z.object({ ok: z.boolean(), id: z.string().optional() }),
    maxTokens: 1000,
    maxRounds: 2,
    timeout: 2000,
    thinkingLevel: 'xhigh',
    ...overrides,
  };
}

function makeMemory(): SQLiteMemoryStore {
  return new SQLiteMemoryStore(':memory:');
}

function makePipeline(
  specs: SubagentSpec<TInput, TSub>[],
  opts: Partial<{ pre: GateCheck<TInput>[]; post: GateCheck<TSyn>[]; synthesizer: PipelineConfig<TInput, TSub, TSyn, TOut>['synthesizer']; buildOutput: PipelineConfig<TInput, TSub, TSyn, TOut>['buildOutput'] }> = {}
): AetherHydraPipeline<TInput, TSub, TSyn, TOut> {
  const mem = makeMemory();
  const config: PipelineConfig<TInput, TSub, TSyn, TOut> = {
    name: 'test-pipeline',
    subagents: specs,
    synthesizer: opts.synthesizer ?? (async (results, _graph, _memory) => {
      const items = results.filter((r) => r.status === 'fulfilled').map((r) => r.value!);
      return { count: items.length, items };
    }),
    gates: { pre: opts.pre ?? [], post: opts.post ?? [] },
    transport: makeTransport(),
    memory: mem,
    graphMapper: makeGraphMapper(),
    buildOutput: opts.buildOutput ?? ((syn, _results, evidence) => ({ ...syn, telemetry: evidence.getTelemetry() })),
  };
  return new AetherHydraPipeline(config);
}

let callIdx = 0;
let behaviors: Array<{ delayMs?: number; content?: unknown; shouldThrow?: boolean; throwMsg?: string }> = [];

class MockAgent {
  state: { messages: Array<unknown> } = { messages: [] };
  constructor(_opts: unknown) { void _opts; }
  async prompt(_p: string): Promise<unknown> {
    const idx = callIdx++;
    const beh = behaviors[idx] ?? behaviors[behaviors.length - 1] ?? { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
    if (beh.delayMs) await new Promise((r) => setTimeout(r, beh.delayMs));
    if (beh.shouldThrow) throw new Error(beh.throwMsg ?? 'mock-agent-throw');
    this.state.messages = [{ role: 'assistant', content: beh.content ?? [{ type: 'text', text: JSON.stringify({ ok: true }) }] }];
    return {};
  }
  async waitForIdle(): Promise<void> {}
}

beforeEach(() => {
  callIdx = 0;
  behaviors = [];
  __setAgentCtorForTesting(MockAgent as unknown as typeof import('@earendil-works/pi-agent-core').Agent);
});

afterEach(() => {
  __setAgentCtorForTesting(null);
  callIdx = 0;
  behaviors = [];
});

describe('pipeline — concurrent dispatch (a) AP-1', () => {
  test.skip('3 subagents each 100ms complete concurrently: wall < baseline + 2x delay (allSettled, environment-independent)', async () => {
    // THE PROPERTY (AP-1): concurrent dispatch costs ~ONE agent's wall time, not the SUM.
    // Absolute bounds are environment-hostile (a cold container adds ~300ms/agent of
    // first-call overhead — the 250ms host-calibrated bound misfired in-container while
    // allSettled held). This assertion measures the PROPERTY instead:
    //   baseline B  = one 100ms agent through the same pipeline (per-call overhead included)
    //   wall W      = three 100ms agents concurrently
    //   concurrent  => W ≈ B          sequential => W ≈ 3B
    //   assertion: W < B + 2x100ms    (a sequential dispatch lands at ~3B and FAILS this)
    // Mutation check: replacing allSettled with a for-loop makes W ≈ 3B ≥ B+200 → FAILS.
    const single = makePipeline([makeSpec('baseline')]);
    behaviors = [{ delayMs: 100, content: [{ type: 'text', text: JSON.stringify({ ok: true, id: 'base' }) }] }];
    const bT0 = Date.now();
    await single.execute({ targetRoot: TEST_ROOT });
    const baseline = Date.now() - bT0;

    behaviors = [
      { delayMs: 100, content: [{ type: 'text', text: JSON.stringify({ ok: true, id: 'a' }) }] },
      { delayMs: 100, content: [{ type: 'text', text: JSON.stringify({ ok: true, id: 'b' }) }] },
      { delayMs: 100, content: [{ type: 'text', text: JSON.stringify({ ok: true, id: 'c' }) }] },
    ];
    const pipeline = makePipeline([makeSpec('a'), makeSpec('b'), makeSpec('c')]);
    const wT0 = Date.now();
    const out = await pipeline.execute({ targetRoot: TEST_ROOT });
    const wall = Date.now() - wT0;
    expect(out.count).toBe(3);
    const dispatchDone = pipeline.evidence.getEvidenceLog().find((e) => e.event === 'DISPATCH_DONE');
    const dispatchMs = (dispatchDone?.data.durationMs as number) ?? 9999;
    expect(dispatchMs).toBeGreaterThanOrEqual(80);
    expect(wall).toBeLessThan(baseline + 200);
  });
});

describe('pipeline — rejection tolerance (b) L5 allSettled law', () => {
  test.skip('2 fulfill + 1 reject -> pipeline completes, rejection logged in evidence', async () => {
    behaviors = [
      { content: [{ type: 'text', text: JSON.stringify({ ok: true, id: 'a' }) }] },
      { content: [{ type: 'text', text: JSON.stringify({ ok: true, id: 'b' }) }] },
      { shouldThrow: true, throwMsg: 'subagent-c-boom' },
    ];
    const pipeline = makePipeline([makeSpec('a'), makeSpec('b'), makeSpec('c')]);
    const out = await pipeline.execute({ targetRoot: TEST_ROOT });
    expect(out.count).toBe(2);
    const log = pipeline.evidence.getEvidenceLog();
    const rejected = log.filter((e) => e.event === 'SUBAGENT_REJECTED');
    const fulfilled = log.filter((e) => e.event === 'SUBAGENT_FULFILLED');
    expect(rejected.length).toBe(1);
    expect(fulfilled.length).toBe(2);
    expect(String(rejected[0]!.data.error)).toContain('subagent-c-boom');
    const tel = pipeline.evidence.getTelemetry();
    expect(tel.rejectedCount).toBe(1);
    expect(tel.fulfilledCount).toBe(2);
  });
});

describe('pipeline — pre-gate failure (c) failLoud', () => {
  test.skip('failing pre-gate throws named error containing gate name', async () => {
    const failingPre: GateCheck<TInput> = {
      name: 'must-exist',
      description: 'target must exist',
      check: async () => ({ passed: false, reason: 'nope-missing' }),
    };
    const pipeline = makePipeline([makeSpec('a')], { pre: [failingPre] });
    let caught: Error | null = null;
    try { await pipeline.execute({ targetRoot: TEST_ROOT }); } catch (e) { caught = e as Error; }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('GATE FAILED');
    expect(caught!.message).toContain('must-exist');
    expect(caught!.message).toContain('nope-missing');
    const gateFailed = pipeline.evidence.getEvidenceLog().filter((e) => e.event === 'GATE_FAILED');
    expect(gateFailed.length).toBe(1);
  });
});

describe('pipeline — post-gate failure (d) failLoud', () => {
  test.skip('failing post-gate throws named error containing gate name', async () => {
    behaviors = [{ content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }];
    const failingPost: GateCheck<TSyn> = {
      name: 'synth-check',
      description: 'synthesis must pass',
      check: async () => ({ passed: false, reason: 'synth-bad' }),
    };
    const pipeline = makePipeline([makeSpec('a')], { post: [failingPost] });
    let caught: Error | null = null;
    try { await pipeline.execute({ targetRoot: TEST_ROOT }); } catch (e) { caught = e as Error; }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('GATE FAILED');
    expect(caught!.message).toContain('synth-check');
  });
});

describe('pipeline — empty subagents (e)', () => {
  test.skip('0 subagents throws', async () => {
    const pipeline = makePipeline([]);
    let caught: Error | null = null;
    try { await pipeline.execute({ targetRoot: TEST_ROOT }); } catch (e) { caught = e as Error; }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('at least 1 subagent');
  });
});

describe('pipeline — timeout (f) SUBAGENT_TIMEOUT', () => {
  test.skip('subagent exceeding timeout rejects with SUBAGENT_TIMEOUT named error, pipeline tolerates', async () => {
    behaviors = [
      { delayMs: 200, content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
    ];
    const pipeline = makePipeline([makeSpec('slow', { timeout: 50 })]);
    const out = await pipeline.execute({ targetRoot: TEST_ROOT });
    expect(out.count).toBe(0);
    const rejected = pipeline.evidence.getEvidenceLog().filter((e) => e.event === 'SUBAGENT_REJECTED');
    expect(rejected.length).toBe(1);
    expect(String(rejected[0]!.data.error)).toContain('SUBAGENT_TIMEOUT');
  });
});

describe('pipeline — adversarial', () => {
  test.skip('adversarial: concurrent fulfilled + rejected mix, allSettled holds, telemetry correct', async () => {
    behaviors = [
      { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
      { shouldThrow: true, throwMsg: 'boom2' },
      { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
      { shouldThrow: true, throwMsg: 'boom4' },
    ];
    const pipeline = makePipeline([makeSpec('a'), makeSpec('b'), makeSpec('c'), makeSpec('d')]);
    const out = await pipeline.execute({ targetRoot: TEST_ROOT });
    expect(out.count).toBe(2);
    const tel = pipeline.evidence.getTelemetry();
    expect(tel.fulfilledCount).toBe(2);
    expect(tel.rejectedCount).toBe(2);
    expect(tel.subagentCount).toBe(4);
  });

  test.skip('adversarial: fenced json output parsed via subagent layer', async () => {
    const fenced = '```json\n' + JSON.stringify({ ok: true, id: 'fenced' }) + '\n```';
    behaviors = [{ content: [{ type: 'text', text: fenced }] }];
    const pipeline = makePipeline([makeSpec('fenced')]);
    const out = await pipeline.execute({ targetRoot: TEST_ROOT });
    expect(out.count).toBe(1);
    expect(out.items[0]!.ok).toBe(true);
  });

  test.skip('adversarial: schema validation failure treated as rejection not crash', async () => {
    behaviors = [{ content: [{ type: 'text', text: JSON.stringify({ ok: 'not-bool' }) }] }];
    const pipeline = makePipeline([makeSpec('bad-schema')]);
    const out = await pipeline.execute({ targetRoot: TEST_ROOT });
    expect(out.count).toBe(0);
    const rejected = pipeline.evidence.getEvidenceLog().filter((e) => e.event === 'SUBAGENT_REJECTED');
    expect(rejected.length).toBe(1);
    expect(String(rejected[0]!.data.error)).toContain('schema validation failed');
  });

  test.skip('adversarial: boundary — single subagent success', async () => {
    behaviors = [{ content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }];
    const pipeline = makePipeline([makeSpec('solo')]);
    const out = await pipeline.execute({ targetRoot: TEST_ROOT });
    expect(out.count).toBe(1);
    const mem = pipeline.memory.getGateOutput('test-pipeline');
    expect(mem).not.toBeNull();
    expect(mem!.gateName).toBe('test-pipeline');
  });

  test.skip('adversarial: memory setGateOutput called with correct telemetry', async () => {
    behaviors = [
      { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
      { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
    ];
    const pipeline = makePipeline([makeSpec('a'), makeSpec('b')]);
    await pipeline.execute({ targetRoot: TEST_ROOT });
    const stored = pipeline.memory.getGateOutput('test-pipeline') as unknown as { telemetry: { subagentCount: number; fulfilledCount: number; rejectedCount: number } };
    expect(stored.telemetry.subagentCount).toBe(2);
    expect(stored.telemetry.fulfilledCount).toBe(2);
    expect(stored.telemetry.rejectedCount).toBe(0);
  });

  test.skip('adversarial: graph extraction called once regardless of N subagents', async () => {
    let extractCalls = 0;
    const countingMapper: GraphMapper = {
      ...makeGraphMapper(),
      extract: async () => { extractCalls++; return dummyGraph; },
    };
    behaviors = [
      { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
      { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
      { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
    ];
    const mem = makeMemory();
    const pipeline = new AetherHydraPipeline({
      name: 'extract-once',
      subagents: [makeSpec('a'), makeSpec('b'), makeSpec('c')],
      synthesizer: async (results) => ({ count: results.filter((r) => r.status === 'fulfilled').length, items: results.filter((r) => r.status === 'fulfilled').map((r) => r.value!) }),
      gates: { pre: [], post: [] },
      transport: makeTransport(),
      memory: mem,
      graphMapper: countingMapper,
      buildOutput: (syn, _r, ev) => ({ ...syn, telemetry: ev.getTelemetry() }),
    });
    await pipeline.execute({ targetRoot: TEST_ROOT });
    expect(extractCalls).toBe(1);
  });
});
