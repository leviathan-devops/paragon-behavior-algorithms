// Backward-compatibility stub for deep-planning-state-machine.ts
// Original was deleted in Phase 1 (replaced by XState fsm/deep-planning-machine.ts)
// This file provides the same API for existing consumers

export interface Layer1Result {
  principles: Array<{ name: string; statement: string; constraints: string[]; successCriteria: string[] }>;
  openQuestions: string[];
}

export interface Layer2Result {
  components: Array<{ name: string; description: string; dependencies: string[]; failureModes: string[]; verificationSteps: string[] }>;
  sequencing: string[];
  dependencyGraph: Record<string, string[]>;
}

export interface Layer3Result {
  contextLibrary: string;
  manifest: Record<string, unknown>;
}

export interface LayerGateResult {
  passed: boolean;
  missing: string[];
  guidance: string;
}

export class DeepPlanningStateMachine {
  private principles: Layer1Result['principles'] = [];
  private components: Layer2Result['components'] = [];
  private contextLibrary = '';

  validateLayerContent(layer: number, input: string): { valid: boolean; missing: string[]; evidence: string } {
    switch (layer) {
      case 1: {
        const lines = input.split('\n').filter((l: string) => l.trim().length > 0);
        return { valid: lines.length >= 3, missing: lines.length < 3 ? ['Need >= 3 principles'] : [], evidence: `Layer 1 first-principles: parsed ${lines.length} non-empty principle lines (minimum 3 required for a complete principles set)` };
      }
      case 2: {
        const hasComponents = input.includes('component') || input.includes('Component');
        return { valid: hasComponents, missing: hasComponents ? [] : ['Need component definitions'], evidence: `Layer 2 workflow: keyword 'component' ${hasComponents ? 'detected' : 'not detected'} in input (component definitions are required for the detailed workflow)` };
      }
      case 3: {
        return { valid: input.length > 0, missing: input.length === 0 ? ['Context library is empty'] : [], evidence: `Layer 3 context library: ${input.length} characters of context content present (any non-empty context library passes)` };
      }
      default:
        return { valid: false, missing: ['Unknown layer'], evidence: `Layer ${layer} is not a recognized deep-planning layer (only layers 1, 2, and 3 are valid)` };
    }
  }

  executeLayer1(requirements: string, architecture: string): Layer1Result {
    return { principles: [], openQuestions: [] };
  }

  executeLayer2(result: Layer1Result): Layer2Result {
    return { components: [], sequencing: [], dependencyGraph: {} };
  }

  executeLayer3(result: Layer2Result): Layer3Result {
    return { contextLibrary: '', manifest: {} };
  }

  runPipeline(requirements: string, architecture: string): { layer1: Layer1Result; layer2: Layer2Result; layer3: Layer3Result } {
    const layer1 = this.executeLayer1(requirements, architecture);
    const layer2 = this.executeLayer2(layer1);
    const layer3 = this.executeLayer3(layer2);
    return { layer1, layer2, layer3 };
  }
}

export const deepPlanningStateMachine = new DeepPlanningStateMachine();
