// Backward-compatibility stub for problem-solving-state-machine.ts
// Original was deleted in Phase 1 (replaced by XState fsm/problem-solving-machine.ts)

// Exported interfaces for backward compatibility with problem-solving.ts
export interface AssumptionState {
  hypothesis: string;
  reasoningChain: string[];
  confirmCriteria: string[];
  disproveCriteria: string[];
}

export interface ActionState {
  exactCommands: string[];
  predictedOutputs: string[];
  environmentState: string;
}

export interface ObservationState {
  rawEvidence: string;
  expectedVsActual: Array<{ expected: string; actual: string }>;
  logsChecked: string[];
}

export interface GapState {
  rootCause: string;
  contributingFactors: string[];
  evidenceStrength: number;
}

export interface MetaState {
  correctActions: string[];
  wrongAssumptions: string[];
  patternMatch: string;
}

export interface VerificationState {
  passed: boolean;
  evidence: string;
  remainingIssues: string[];
}

export class ProblemSolvingStateMachine {
  private iteration = 0;

  getIteration(): number { return this.iteration; }

  newIteration(): void {
    this.iteration++;
  }

  getLayerConfig(layer: number): { name: string; description: string } | null {
    const configs: Record<number, { name: string; description: string }> = {
      1: { name: 'ASSUMPTION', description: 'What do I assume?' },
      2: { name: 'ACTION', description: 'What action with prediction?' },
      3: { name: 'OBSERVATION', description: 'What actually happened?' },
      4: { name: 'GAP ANALYSIS', description: 'What does the gap tell me?' },
      5: { name: 'META-REFLECTION', description: 'What should I have done?' },
      6: { name: 'VERIFICATION', description: 'Does the fix work?' },
    };
    return configs[layer] || null;
  }

  validateLayerContent(layer: number, input: string): { valid: boolean; missing: string[]; evidence: string } {
    return { valid: input.length > 0, missing: [], evidence: `Layer ${layer} content: ${input.length} characters of problem-solving input present (any non-empty input satisfies the validation contract)` };
  }
}

export const problemSolvingStateMachine = new ProblemSolvingStateMachine();
