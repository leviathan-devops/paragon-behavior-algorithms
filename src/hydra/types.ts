import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { Api, Model } from '@earendil-works/pi-ai';
import type * as z from 'zod';

/**
 * Spec 2 §2.1 — PipelineConfig
 * The universal pipeline configuration. 4 generic type params exactly as specced:
 * TInput, TSubResult, TSynthesis, TOutput.
 */
export interface PipelineConfig<TInput, TSubResult, TSynthesis, TOutput> {
  readonly name: string;
  readonly subagents: SubagentSpec<TInput, TSubResult>[];
  readonly synthesizer: (
    results: SubagentSettlement<TSubResult>[],
    graph: GraphifyGraph,
    memory: SharedMemoryStore,
  ) => Promise<TSynthesis>;
  readonly gates: {
    readonly pre: GateCheck<TInput>[];
    readonly post: GateCheck<TSynthesis>[];
  };
  readonly transport: LLMTransport;
  readonly memory: SharedMemoryStore;
  readonly graphMapper: GraphMapper;
  readonly buildOutput: (
    synthesis: TSynthesis,
    results: SubagentSettlement<TSubResult>[],
    evidence: EvidenceCollector,
  ) => TOutput;
  readonly graphScope?: string[];
  readonly graphExclude?: string[];
}

/**
 * Spec 2 §2.2 — SubagentSpec
 * Generic over TInput and TSubResult. Carries function-typed prompt builders
 * and a zod schema for output validation.
 */
export interface SubagentSpec<TInput, TSubResult> {
  readonly id: string;
  buildSystemPrompt(input: TInput, graph: GraphifyGraph, memory: SharedMemoryStore): string;
  buildUserPrompt(input: TInput): string;
  readonly outputSchema: z.ZodSchema<TSubResult>;
  readonly graphQueries?: string[];
  readonly additionalTools?: AgentTool[];
  readonly maxTokens: number;
  readonly maxRounds: number;
  readonly timeout: number;
  readonly thinkingLevel?: 'medium' | 'high' | 'xhigh' | 'max';
}

/**
 * Spec 2 §2.2 — SubagentSettlement
 * The allSettled wrapper — one rejection does not kill the batch.
 */
export interface SubagentSettlement<T> {
  readonly subagentId: string;
  readonly status: 'fulfilled' | 'rejected';
  readonly value?: T;
  readonly reason?: Error;
}

/**
 * Spec 2 §2.5 — GateCheck
 * Fail-closed gate — returns GateResult; pipeline throws loudly on !passed.
 */
export interface GateCheck<T> {
  readonly name: string;
  readonly description: string;
  check(target: T): Promise<GateResult>;
}

/**
 * Spec 2 §2.5 — GateResult
 */
export interface GateResult {
  readonly passed: boolean;
  readonly reason?: string;
  readonly evidence?: Record<string, unknown>;
}

/**
 * Spec 2 §2.4 — SharedMemoryStore
 * Cross-pipeline and cross-run memory. Backend literal union as specced.
 */
export interface SharedMemoryStore {
  setGateOutput(gateId: string, data: GateOutput): void;
  getGateOutput<T extends GateOutput>(gateId: string): T | null;
  persistRun(runId: string, data: RunSummary): void;
  getPriorRun(runId: string): RunSummary | null;
  getChangedFiles(sinceRunId: string): string[];
  getGraph(): unknown | null;
  mergeGraphSlice(slice: object): void;
  queryGraph(query: string): Promise<unknown>;
  readonly backend: 'sqlite' | 'tencentdb';
}

/**
 * Spec 2 §2.3 — GraphMapper
 * Graphify integration — extraction is tree-sitter (no LLM).
 */
export interface GraphMapper {
  extract(
    targetRoot: string,
    opts?: {
      codeOnly?: boolean;
      scope?: string[];
      exclude?: string[];
    },
  ): Promise<GraphifyGraph>;
  query(graph: GraphifyGraph, question: string): Promise<Subgraph>;
  path(graph: GraphifyGraph, from: string, to: string): Promise<Path>;
  explain(graph: GraphifyGraph, concept: string): Promise<NodeDetail>;
  merge(slices: object[]): Promise<GraphifyGraph>;
  asAgentTools(graph: GraphifyGraph): AgentTool[];
}

/**
 * Spec 2 §2.3 — GraphifyGraph
 */
export interface GraphifyGraph {
  readonly nodes: GraphifyNode[];
  readonly edges: GraphifyEdge[];
  readonly communities: Community[];
  readonly godNodes: string[];
}

/**
 * Spec 2 §2.3 — GraphifyNode
 */
export interface GraphifyNode {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly file: string;
  readonly data?: Record<string, unknown>;
}

/**
 * Spec 2 §2.3 — GraphifyEdge
 * confidence is the literal union EXTRACTED | INFERRED as specced.
 */
export interface GraphifyEdge {
  readonly src: string;
  readonly dst: string;
  readonly relation: string;
  readonly confidence: 'EXTRACTED' | 'INFERRED';
}

/**
 * Spec 2 §2.3 — Community
 * A detected community within the knowledge graph.
 */
export interface Community {
  readonly id: string;
  readonly label: string;
  readonly members: string[];
  readonly size: number;
}

/**
 * Spec 2 §2.3 — NodeDetail
 * Returned by GraphMapper.explain — connections, community, degree.
 */
export interface NodeDetail {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly file: string;
  readonly degree: number;
  readonly community?: string;
  readonly connections: string[];
  readonly data?: Record<string, unknown>;
}

/**
 * Spec 2 §2.3 — Path
 * Returned by GraphMapper.path — shortest path between two concepts.
 */
export interface Path {
  readonly from: string;
  readonly to: string;
  readonly hops: readonly string[];
  readonly length: number;
}

/**
 * Spec 2 §2.3 — Subgraph
 * Returned by GraphMapper.query — a scoped slice of the graph.
 */
export interface Subgraph {
  readonly nodes: GraphifyNode[];
  readonly edges: GraphifyEdge[];
  readonly query: string;
}

/**
 * Spec 2 §2.6 — EvidenceCollector
 */
export interface EvidenceCollector {
  log(event: string, data: Record<string, unknown>): void;
  getTelemetry(): PipelineTelemetry;
  getEvidenceLog(): EvidenceEntry[];
}

/**
 * Spec 2 §2.6 — EvidenceEntry
 */
export interface EvidenceEntry {
  readonly timestamp: number;
  readonly event: string;
  readonly data: Record<string, unknown>;
}

/**
 * Spec 2 §2.6 — PipelineTelemetry
 */
export interface PipelineTelemetry {
  readonly totalDurationMs: number;
  readonly subagentCount: number;
  readonly fulfilledCount: number;
  readonly rejectedCount: number;
  readonly totalTokensIn: number;
  readonly totalTokensOut: number;
  readonly gatesPassed: number;
  readonly gatesFailed: number;
}

/**
 * Spec 2 §2.7 — LLMTransport
 * Wraps the aether agent backend's chainedStream (retry + stall + done-verifier).
 */
export interface LLMTransport {
  getModel(): Model<Api>;
  chainedStream(model: unknown, context: unknown, options: unknown): unknown;
  readonly providerId: string;
  readonly modelId: string;
}

/**
 * Spec 2 §2.4 — GateOutput
 * Persisted per-gate via SharedMemoryStore.setGateOutput.
 * telemetry is the 6-field shape {durationMs, subagentCount, fulfilledCount, rejectedCount, totalTokensIn, totalTokensOut}.
 */
export interface GateOutput {
  readonly gateName: string;
  readonly synthesis: unknown;
  readonly results: SubagentSettlement<unknown>[];
  readonly telemetry: {
    readonly durationMs: number;
    readonly subagentCount: number;
    readonly fulfilledCount: number;
    readonly rejectedCount: number;
    readonly totalTokensIn: number;
    readonly totalTokensOut: number;
  };
}

/**
 * Spec 2 §2.4 — RunSummary
 * Persisted per-run via SharedMemoryStore.persistRun.
 */
export interface RunSummary {
  readonly runId: string;
  readonly createdAt: number;
  readonly gateOutputs: Record<string, GateOutput>;
  readonly summary?: Record<string, unknown>;
}
