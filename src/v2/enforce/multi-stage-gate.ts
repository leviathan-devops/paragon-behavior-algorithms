import type { EvidenceRecord } from './evidence-record.js';
import type { GateResult } from './gate-criteria.js';
import type { GateEngine } from './gate-engine.js';

export interface StageDefinition {
  name: string;
  gateId: string;
  requiredTypes?: EvidenceRecord['type'][];
  minCount?: number;
}

export interface MultiStageGateResult {
  passed: boolean;
  stageResults: GateResult[];
}

export class MultiStageGate {
  private readonly engine: GateEngine;
  private readonly stages: StageDefinition[];

  constructor(engine: GateEngine, stages: StageDefinition[]) {
    if (!engine || typeof engine.evaluate !== 'function') {
      throw new Error('MultiStageGate: engine is required and must implement evaluate');
    }
    if (!Array.isArray(stages)) {
      throw new Error('MultiStageGate: stages must be an array');
    }
    if (stages.length === 0) {
      throw new Error('MultiStageGate: at least one stage is required');
    }
    for (const s of stages) {
      if (!s || typeof s.name !== 'string' || s.name.length === 0) {
        throw new Error('MultiStageGate: each stage requires a non-empty name');
      }
      if (!s.gateId || typeof s.gateId !== 'string' || s.gateId.length === 0) {
        throw new Error(`MultiStageGate: stage "${s.name}" requires a non-empty gateId`);
      }
    }
    this.engine = engine;
    this.stages = [...stages];
  }

  async evaluate(evidence: EvidenceRecord[]): Promise<MultiStageGateResult> {
    const safeEvidence: EvidenceRecord[] = Array.isArray(evidence) ? evidence : [];
    const stageResults: GateResult[] = [];
    for (const stage of this.stages) {
      let result: GateResult;
      try {
        result = await this.engine.evaluate(stage.gateId, safeEvidence);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result = {
          gateId: stage.gateId,
          verdict: 'ERROR',
          evidenceEvaluated: safeEvidence.length,
          evidencePassed: 0,
          evidenceFailed: safeEvidence.length,
          criteriaResults: [{ criteria: 'engine-error', passed: false, detail: msg }],
          timestamp: Date.now(),
          durationMs: 0,
        };
      }
      stageResults.push(result);
      if (result.verdict !== 'PASS') {
        return { passed: false, stageResults };
      }
    }
    return { passed: true, stageResults };
  }

  getStages(): StageDefinition[] {
    return [...this.stages];
  }
}
