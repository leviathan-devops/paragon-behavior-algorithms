import type { EvidenceCollector, EvidenceEntry, PipelineTelemetry } from './types.js';

/**
 * PipelineEvidenceCollector — Spec 2 §2.10 + §2.6 (Plan A wave A-1, desk a1-evidence)
 *
 * Implements EvidenceCollector per Spec 2 §2.10 EXACTLY.
 * Single source of truth: telemetry derives from entries at call time (L6 loud-evidence).
 * Every log() mirrors to the durable engine log via console.error matching
 * aether-backend runner.ts engine-log conventions.
 *
 * Pipeline events (documented for consumers — universal, no audit-specific required names):
 * PIPELINE_START, GATE_CHECK, GATE_FAILED, GRAPH_EXTRACT_START, GRAPH_EXTRACT_DONE,
 * DISPATCH_START, DISPATCH_DONE, SUBAGENT_FULFILLED, SUBAGENT_REJECTED,
 * SUBAGENT_COMPLETE, SUBAGENT_TIMEOUT, SYNTHESIZE_START, SYNTHESIZE_DONE,
 * MCP_CONNECT, MCP_DISCONNECT, PIPELINE_DONE
 */
export class PipelineEvidenceCollector implements EvidenceCollector {
  private entries: EvidenceEntry[] = [];
  private startTime: number;
  private readonly pipelineName: string;

  constructor(pipelineName: string) {
    this.pipelineName = pipelineName;
    this.startTime = Date.now();
    this.entries = [];
    void this.pipelineName;
  }

  log(event: string, data: Record<string, unknown>): void {
    this.entries.push({ timestamp: Date.now(), event, data });
    console.error(`[hydra:${event}]`, JSON.stringify(data));
  }

  getTelemetry(): PipelineTelemetry {
    const rejectedCount = this.entries.filter((e) => e.event === 'SUBAGENT_REJECTED').length;
    const fulfilledCount = this.entries.filter((e) => e.event === 'SUBAGENT_FULFILLED').length;
    const gatesFailed = this.entries.filter((e) => e.event === 'GATE_FAILED').length;
    const gateCheckCount = this.entries.filter((e) => e.event === 'GATE_CHECK').length;
    const gatesPassed = gateCheckCount - gatesFailed;
    return {
      totalDurationMs: Date.now() - this.startTime,
      subagentCount: fulfilledCount + rejectedCount,
      fulfilledCount,
      rejectedCount,
      totalTokensIn: 0, // populated by the transport (Spec 2 §2.10)
      totalTokensOut: 0, // populated by the transport (Spec 2 §2.10)
      gatesPassed,
      gatesFailed,
    };
  }

  getEvidenceLog(): EvidenceEntry[] {
    return [...this.entries];
  }
}

export type { EvidenceCollector, EvidenceEntry, PipelineTelemetry };
