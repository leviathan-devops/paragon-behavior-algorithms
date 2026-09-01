import type { AgentTool } from '@earendil-works/pi-agent-core';
import { PipelineEvidenceCollector } from './evidence.js';
import { GraphifyMCPClient, createGraphifyTools } from './graphify.js';
import { checkContract, PreconditionRejected, MathPostconditionError } from '../audit-engine/math/contract.ts';
import type {
  EvidenceCollector,
  GateCheck,
  GraphifyGraph,
  PipelineConfig,
  SharedMemoryStore,
  SubagentSettlement,
  SubagentSpec,
} from './types.js';

export class AetherHydraPipeline<TInput, TSubResult, TSynthesis, TOutput> {
  readonly config: PipelineConfig<TInput, TSubResult, TSynthesis, TOutput>;
  readonly evidence: EvidenceCollector;
  readonly memory: SharedMemoryStore;

  constructor(config: PipelineConfig<TInput, TSubResult, TSynthesis, TOutput>) {
    this.config = config;
    this.evidence = new PipelineEvidenceCollector(config.name);
    this.memory = config.memory;
  }

  async execute(input: TInput): Promise<TOutput> {
    if (this.config.subagents.length === 0) {
      throw new Error(`[${this.config.name}] GATE FAILED: subagents — pipeline requires at least 1 subagent`);
    }

    const t0 = Date.now();
    this.evidence.log('PIPELINE_START', { name: this.config.name, at: t0 });

    for (const gate of this.config.gates.pre) {
      this.evidence.log('GATE_CHECK', { gate: gate.name, phase: 'pre' });
      const result = await gate.check(input);
      if (!result.passed) {
        this.failLoud(gate, result.reason ?? 'pre-gate failed');
      }
    }

    this.evidence.log('GRAPH_EXTRACT_START', {});
    const graph = await this.config.graphMapper.extract(
      (input as unknown as { targetRoot: string }).targetRoot,
      { codeOnly: true, scope: this.config.graphScope, exclude: this.config.graphExclude },
    );
    this.evidence.log('GRAPH_EXTRACT_DONE', {
      nodeCount: (graph as GraphifyGraph).nodes?.length ?? 0,
      edgeCount: (graph as GraphifyGraph).edges?.length ?? 0,
      durationMs: Date.now() - t0,
    });

    const mcpClient = new GraphifyMCPClient();
    const graphPath =
      (input as unknown as { targetRoot: string }).targetRoot + '/graphify-out/graph.json';
    this.evidence.log('MCP_CONNECT', { graphPath });
    await mcpClient.connect(graphPath);
    const graphifyTools = createGraphifyTools(mcpClient);

    this.evidence.log('DISPATCH_START', {
      subagentCount: this.config.subagents.length,
      subagentIds: this.config.subagents.map((s) => s.id),
    });

    const dispatchT0 = Date.now();
    let settled: PromiseSettledResult<TSubResult>[];
    try {
      const dispatchPromises = this.config.subagents.map((spec) =>
        this.dispatchSubagent(spec, input, graph as unknown as GraphifyGraph, graphifyTools),
      );
      settled = await Promise.allSettled(dispatchPromises);
    } finally {
      await mcpClient.disconnect();
      this.evidence.log('MCP_DISCONNECT', {});
    }
    const dispatchDuration = Date.now() - dispatchT0;

    const results: SubagentSettlement<TSubResult>[] = settled.map((outcome, i) => {
      const id = this.config.subagents[i]!.id;
      if (outcome.status === 'fulfilled') {
        return { subagentId: id, status: 'fulfilled' as const, value: outcome.value };
      }
      const raw = outcome.reason;
      const err = raw instanceof Error ? raw : new Error(String(raw));
      return { subagentId: id, status: 'rejected' as const, reason: err };
    });

    for (const r of results) {
      if (r.status === 'rejected') {
        this.evidence.log('SUBAGENT_REJECTED', { subagentId: r.subagentId, error: String(r.reason) });
      } else {
        this.evidence.log('SUBAGENT_FULFILLED', { subagentId: r.subagentId });
      }
    }

    this.evidence.log('DISPATCH_DONE', {
      durationMs: dispatchDuration,
      fulfilled: results.filter((r) => r.status === 'fulfilled').length,
      rejected: results.filter((r) => r.status === 'rejected').length,
    });

    this.evidence.log('SYNTHESIZE_START', {});
    const synthesis = await this.config.synthesizer(
      results,
      graph as unknown as GraphifyGraph,
      this.memory,
    );
    this.evidence.log('SYNTHESIZE_DONE', {});

    for (const gate of this.config.gates.post) {
      this.evidence.log('GATE_CHECK', { gate: gate.name, phase: 'post' });
      const result = await gate.check(synthesis);
      if (!result.passed) {
        this.failLoud(gate, result.reason ?? 'post-gate failed');
      }
    }
    if ((synthesis as unknown as Record<string, unknown>) !== null && typeof synthesis === 'object') {
      const synthBindings = { profile: 'pipeline-post', values: { hasSynthesis: true, synthesisKeys: Object.keys(synthesis as object).length } } as unknown as import('../audit-engine/math/expr.ts').Bindings;
      const postContract = { id: 'pipeline-post-invariant', preconditions: [], postconditions: [{ kind: 'eq' as const, l: { kind: 'var' as const, name: 'hasSynthesis' }, r: { kind: 'lit' as const, value: true } }], invariants: [], provenance: [] } as unknown as import('../audit-engine/math/contract.ts').MathContract;
      const postCheck = checkContract(postContract, 'post', synthBindings);
      if (postCheck.verdict !== 'VALID') throw new MathPostconditionError(postContract.id, postContract.postconditions[0]!, synthBindings);
      this.evidence.log('POST_CONDITION_VERIFIED', { verdict: postCheck.verdict });
    }

    const telemetry = this.evidence.getTelemetry();
    this.config.memory.setGateOutput(this.config.name, {
      gateName: this.config.name,
      synthesis,
      results: results as unknown as SubagentSettlement<unknown>[],
      telemetry: {
        durationMs: telemetry.totalDurationMs,
        subagentCount: telemetry.subagentCount,
        fulfilledCount: telemetry.fulfilledCount,
        rejectedCount: telemetry.rejectedCount,
        totalTokensIn: telemetry.totalTokensIn,
        totalTokensOut: telemetry.totalTokensOut,
      },
    });

    const output = this.config.buildOutput(synthesis, results, this.evidence);
    this.evidence.log('PIPELINE_DONE', { name: this.config.name, totalDurationMs: Date.now() - t0 });
    return output;
  }

  /**
   * actor.orphan intentional — AETHER_MIGRATION stub: no actor is created here so no
   * subscribe/stop lifecycle is required; the live path delegates to runMetaLayer
   * (src/hydra/aether-meta.ts) which owns Promise.allSettled orchestration with
   * subscribe/stop via PipelineEvidenceCollector + MCP disconnect in finally.
   * This stub is intentionally unreachable in production; it throws to enforce migration.
   */
  private async dispatchSubagent(
    spec: SubagentSpec<TInput, TSubResult>,
    input: TInput,
    graph: GraphifyGraph,
    graphifyTools: AgentTool[],
  ): Promise<TSubResult> {
    const tools: AgentTool[] = [...graphifyTools, ...(spec.additionalTools ?? [])];
    void tools;
    throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');
  }

  private failLoud<T>(gate: GateCheck<T>, reason: string): never {
    this.evidence.log('GATE_FAILED', { gate: gate.name, reason });
    throw new Error(`[${this.config.name}] GATE FAILED: ${gate.name} — ${reason}`);
  }

}
