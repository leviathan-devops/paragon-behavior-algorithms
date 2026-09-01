import {orchestrator} from '../orchestrator.js';
import { LayerConfig, DEEP_PLANNING_LAYERS, WHY_EXPLANATIONS, HOW_EXPLANATIONS } from '../types.js';
import {
  deepPlanningStateMachine,
  DeepPlanningStateMachine,
  Layer1Result,
  Layer2Result,
  Layer3Result,
  LayerGateResult,
} from './deep-planning-state-machine.js';

export interface DeepPlanningArtifact {
  layer: number;
  name: string;
  content: string;
  requirements: string[];
  thinking: string;
}

export class DeepPlanningModule {
  private layers: LayerConfig[];
  private stateMachine: DeepPlanningStateMachine;

  constructor() {
    this.layers = DEEP_PLANNING_LAYERS;
    this.stateMachine = deepPlanningStateMachine;
  }

  getLayerConfig(layer: number): LayerConfig | undefined {
    return this.layers.find((l: LayerConfig) => l.number === layer);
  }

  getCurrentLayerThinking(): string {
    const layer = orchestrator.getState().currentLayer;
    const config = this.getLayerConfig(layer);
    return config?.thinking || 'Unknown';
  }

  buildLayer1Template(): string {
    return `# LAYER 1: INITIAL PLAN

## Surface Understanding
[What's being asked, explained in MY OWN WORDS - not echoing the prompt]

## First Principles
[3+ non-negotiable truths that govern this domain]

1. [Principle 1]
2. [Principle 2]
3. [Principle 3]

## Constraints
[3+ limits - what MUST be true]

- [Constraint 1]
- [Constraint 2]
- [Constraint 3]

## Success Criteria
[How we know we've succeeded - measurable outcomes]

## Open Questions
[2+ things we don't yet know - honest acknowledgment]

## Direction
[Initial approach based on first principles]
`;
  }

  buildLayer2Template(): string {
    return `# LAYER 2: DETAILED WORKFLOW

## Components (5+)
[Break the problem into 5+ distinct components]

1. [Component 1]
2. [Component 2]
3. [Component 3]
4. [Component 4]
5. [Component 5]

## Sequencing
[What must come BEFORE what - critical path]

## Dependencies
[What relies on what]

## Failure Modes (3+)
[3+ ways this could fail]

1. [Failure mode 1]
2. [Failure mode 2]
3. [Failure mode 3]

## Verification Strategy
[How to verify EACH component works]
`;
  }

  buildLayer3Template(): string {
    return `# LAYER 3: SELF-CONTAINED CONTEXT LIBRARY

## Architecture
[How everything fits together - diagram + explanation]

## Interfaces
[What talks to what - precise contracts]

## State Management
[What persists, how, where]

## Error Handling
[What can go wrong at each layer]

## Testing Strategy
[How we know it works]

## Mental Model
[The simplest way to think about this entire system]
`;
  }

  /**
   * Generate artifact for the given layer.
   * @public — Available for external consumers to retrieve layer artifacts.
   */
  generateArtifact(layer: number, userContent: string): string {
    const config = this.getLayerConfig(layer);
    if (!config) return 'Error: invalid layer';

    let content = '';
    switch (layer) {
      case 1:
        content = this.mergeLayer1Content(userContent);
        break;
      case 2:
        content = this.mergeLayer2Content(userContent);
        break;
      case 3:
        content = this.mergeLayer3Content(userContent);
        break;
    }

    orchestrator.getState().artifacts.set(`layer${layer}`, content);
    return content;
  }

  private mergeLayer1Content(userContent: string): string {
    return `# LAYER 1: INITIAL PLAN

${userContent}

---

**Thinking:** "${this.getCurrentLayerThinking()}"
**Gate:** MUST have 3+ first principles, surface understanding, constraints, success criteria, open questions
`;
  }

  private mergeLayer2Content(userContent: string): string {
    return `# LAYER 2: DETAILED WORKFLOW

${userContent}

---

**Thinking:** "${this.getCurrentLayerThinking()}"
**Gate:** MUST have 5+ components, sequencing, dependencies, 3+ failure modes, verification
`;
  }

  private mergeLayer3Content(userContent: string): string {
    return `# LAYER 3: SELF-CONTAINED CONTEXT LIBRARY

${userContent}

---

**Thinking:** "${this.getCurrentLayerThinking()}"
**Gate:** MUST have architecture, interfaces, state management, error handling - injectable to another agent
`;
  }

  getWhyExplanation(layer: number): string {
    return WHY_EXPLANATIONS[`LAYER_${layer}`] || '';
  }

  getHowExplanation(layer: number): string {
    return HOW_EXPLANATIONS[`LAYER_${layer}`] || '';
  }

  validateLayerContent(layer: number, content: string): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const lines = content.split('\n');
    const nonEmpty = lines.filter((l: string) => l.trim().length > 10);
    const headings: string[] = [];
    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)/);
      if (headingMatch) headings.push(headingMatch[1].toLowerCase().trim());
    }
    switch (layer) {
      case 1: {
        // Aligned with generateLayer1Prompt() artifact headings:
        // ## 1. Problem Statement, ## 2. Core Insight, ## 3. Scope,
        // ## 4. User Profile, ## 5. Architecture Overview, ## 9. Success Criteria
        const hasProblem = headings.some((h: string) => h.includes('problem statement') || h.includes('problem'));
        const hasInsight = headings.some((h: string) => h.includes('core insight') || h.includes('insight'));
        const hasScope = headings.some((h: string) => h.includes('scope'));
        const hasUserProfile = headings.some((h: string) => h.includes('user profile') || h.includes('user'));
        const hasArchitecture = headings.some((h: string) => h.includes('architecture overview') || h.includes('architecture'));
        const hasCriteria = headings.some((h: string) => h.includes('success criteria') || h.includes('criteria'));
        if (!hasProblem) missing.push('Problem Statement section (## Problem Statement heading)');
        if (!hasInsight) missing.push('Core Insight section (## Core Insight heading)');
        if (!hasScope) missing.push('Scope section (## Scope heading)');
        if (!hasUserProfile) missing.push('User Profile section (## User Profile heading)');
        if (!hasArchitecture) missing.push('Architecture section (## Architecture Overview heading)');
        if (!hasCriteria) missing.push('Success Criteria section (## Success Criteria heading)');
        if (nonEmpty.length < 5) missing.push('Minimum content: 5+ substantive lines');
        break;
      }
      case 2: {
        // Aligned with generateBuildSpecArtifact() artifact headings:
        // ## Overview, ## Requirements Summary, ## Phase 1-7,
        // ## Dependency Table, ## Build Chain, ## Ship Gate
        const hasPhases = headings.some((h: string) => h.includes('phase 1') || h.includes('phase 2') || h.includes('phase') || h.includes('dynamic build phases') || h.includes('existing code'));
        const hasOverview = headings.some((h: string) => h.includes('overview'));
        const hasBuildChain = headings.some((h: string) => h.includes('build chain') || h.includes('verification') || h.includes('build'));
        const hasDependency = headings.some((h: string) => h.includes('dependenc') || h.includes('dependency table'));
        const hasShipGate = headings.some((h: string) => h.includes('ship gate'));
        if (!hasPhases) missing.push('Phased implementation section (## Phase 1..N heading)');
        if (!hasOverview) missing.push('Overview section (## Overview heading)');
        if (!hasBuildChain) missing.push('Build Chain section (## Build Chain heading)');
        if (!hasDependency) missing.push('Dependency Table section (## Dependency Table heading)');
        if (!hasShipGate) missing.push('Ship Gate section (## Ship Gate heading)');
        break;
      }
      case 3: {
        // Aligned with generateContextLibraryManifest() artifact headings:
        // ## File Structure, 01_ARCHITECTURE.md, Error Handling, 07_CONTAINER_TESTING.md
        const hasFileStructure = headings.some((h: string) => h.includes('file structure') || h.includes('00_index'));
        const hasArchitecture = headings.some((h: string) => h.includes('architecture') || h.includes('01_architecture'));
        const hasError = headings.some((h: string) => h.includes('error handling') || h.includes('error') || h.includes('exception'));
        const hasTesting = headings.some((h: string) => h.includes('testing') || h.includes('container testing') || h.includes('07_container_testing'));
        if (!hasFileStructure) missing.push('File Structure section (## File Structure heading)');
        if (!hasArchitecture) missing.push('Architecture section (## Architecture / 01_ARCHITECTURE heading)');
        if (!hasError) missing.push('Error Handling section (## Error Handling heading)');
        if (!hasTesting) missing.push('Testing section (## Testing / Container Testing heading)');
        if (nonEmpty.length < 3) missing.push('Minimum content: 3+ substantive lines');
        break;
      }
      default:
        return { valid: false, missing: ['Unknown layer: ' + layer] };
    }
    return { valid: missing.length === 0, missing };
  }

  getStateMachine(): DeepPlanningStateMachine {
    return this.stateMachine;
  }
}

export const deepPlanningModule = new DeepPlanningModule();
