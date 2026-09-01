import { tridentLog } from '../utils.js';
import { LayerConfig, CONTEXT_SYNTHESIS_LAYERS } from '../types.js';
import {
  contextSynthesisEngine,
  ContextSynthesisEngine,
  CollectedContext,
  ScoredItem,
  CompressedContext,
  InjectableOutput,
} from './context-synthesis-engine.js';

export class ContextSynthesisModule {
  private layers: LayerConfig[];
  private engine: ContextSynthesisEngine;
  private readonly TOKEN_BUDGET = 2000;

  constructor() {
    this.layers = CONTEXT_SYNTHESIS_LAYERS;
    this.engine = contextSynthesisEngine;
  }

  getLayerConfig(layer: number): LayerConfig | undefined {
    return this.layers.find((l: LayerConfig) => l.number === layer);
  }

  buildLayer1Template(): string {
    return `# CONTEXT SYNTHESIS — LAYER 1: CONTEXT COLLECTION

## Session Info
- **Session ID:** [Session ID]
- **Current Gate:** [PLAN/BUILD/TEST/VERIFY/AUDIT/DELIVERY]
- **Active Task:** [What agent is working on]

## T1: Session Context
**Method:** Kraken brain state API
**Status:** [Available/Unavailable]

| State | Value |
|-------|-------|
| Current Gate | [Gate] |
| Active Task | [Task] |
| Blockers | [List] |

## T2: Knowledge Context
**Method:** hermes_remember, hive_context, kraken_hive_search
**Status:** [Available/Unavailable]

## T3: File Context
**Method:** Read active files
**Status:** [Available/Unavailable]

## T4: Tool Context
**Method:** Recent commands
**Status:** [Available/Unavailable]

## Collection Summary
| Source | Status | Content Size |
|--------|--------|--------------|
| T1: Session | [OK/FAIL] | [Tokens] |
| T2: Knowledge | [OK/FAIL] | [Tokens] |
| T3: Files | [OK/FAIL] | [Tokens] |
| T4: Tools | [OK/FAIL] | [Tokens] |

---
**Layer:** 1/4 | **Token Budget:** ${this.TOKEN_BUDGET}
**Thinking:** "${this.getLayerConfig(1)?.thinking}"
`;
  }

  buildLayer2Template(): string {
    return `# CONTEXT SYNTHESIS — LAYER 2: RELEVANCE SCORING

## Scoring Formula
**Score = (Urgency x 0.6) + (Importance x 0.4)**

## Scored Items
| Source | Name | Urgency | Importance | Final Score | Rank |
|--------|------|---------|------------|-------------|------|

---
**Layer:** 2/4 | **Token Budget:** ${this.TOKEN_BUDGET}
**Thinking:** "${this.getLayerConfig(2)?.thinking}"
`;
  }

  buildLayer3Template(): string {
    return `# CONTEXT SYNTHESIS — LAYER 3: COMPRESSION

## Token Budget Allocation
| Category | Budget | Used | Remaining |
|----------|--------|------|-----------|
| **Total** | **2000** | **[N]** | **[N]** |

---
**Layer:** 3/4 | **Token Budget:** ${this.TOKEN_BUDGET}
**Thinking:** "${this.getLayerConfig(3)?.thinking}"
`;
  }

  buildLayer4Template(): string {
    return `# CONTEXT SYNTHESIS — LAYER 4: INJECTION FORMAT

## Injection Structure (T0-Ready)

---
**Layer:** 4/4 | **Token Budget:** ${this.TOKEN_BUDGET}
**Thinking:** "${this.getLayerConfig(4)?.thinking}"
`;
  }

  validateLayerContent(layer: number, content: string): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const lines = content.split('\n');
    const headings: string[] = [];
    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)/);
      if (headingMatch) headings.push(headingMatch[1].toLowerCase().trim());
    }
    const allContent = content.toLowerCase();
    switch (layer) {
      case 1: {
        const hasSession = headings.some((h: string) => h.includes('session') || h.includes('context'));
        const hasT1 = headings.some((h: string) => /t1|t2|t3|t4/.test(h));
        const hasCollection = headings.some((h: string) => h.includes('collection') || h.includes('collect') || h.includes('summary'));
        if (!hasSession && !allContent.includes('session')) missing.push('Session section (## Session / Context Info heading)');
        if (!hasT1 && !/(t1|t2|t3|t4)/.test(content)) missing.push('Context Sources section (## T1-T4 headings)');
        if (!hasCollection && !allContent.includes('collection')) missing.push('Collection Summary section (## Collection Summary heading)');
        break;
      }
      case 2: {
        const hasScoring = headings.some((h: string) => h.includes('score') || h.includes('scoring') || h.includes('relevance'));
        const hasUrgency = headings.some((h: string) => h.includes('urgency') || h.includes('priority') || h.includes('rank'));
        const hasImportance = headings.some((h: string) => h.includes('importance') || h.includes('weight') || h.includes('factor'));
        if (!hasScoring && !allContent.includes('score')) missing.push('Scoring section (## Scoring / Relevance heading)');
        if (!hasUrgency && !allContent.includes('urgency')) missing.push('Urgency section (## Urgency / Priority heading)');
        if (!hasImportance && !allContent.includes('importance')) missing.push('Importance section (## Importance heading)');
        break;
      }
      case 3: {
        const hasCompression = headings.some((h: string) => h.includes('compress') || h.includes('token') || h.includes('budget'));
        const hasDedup = headings.some((h: string) => h.includes('deduplicat') || h.includes('merge') || h.includes('summar'));
        if (!hasCompression && !allContent.includes('compress')) missing.push('Compression section (## Compression / Token Budget heading)');
        if (!hasDedup && !/(deduplicat|merge|summar)/.test(allContent)) missing.push('Deduplication section (## Deduplication / Merging heading)');
        break;
      }
      case 4: {
        const hasInjection = headings.some((h: string) => h.includes('inject') || h.includes('t0') || h.includes('format'));
        const hasConfig = headings.some((h: string) => h.includes('config') || h.includes('opencode') || h.includes('structure'));
        if (!hasInjection && !allContent.includes('inject')) missing.push('Injection Format section (## Injection Format heading)');
        if (!hasConfig && !allContent.includes('config')) missing.push('Config section (## Config / opencode.json heading)');
        break;
      }
    }
    return { valid: missing.length === 0, missing };
  }

  buildExplorerDispatchTemplate(targetPaths: string[], maxAgents: number): string {
    const agents = targetPaths.slice(0, maxAgents);
    let template = `# Trident Explorer Dispatch Plan\n\n`;
    template += `**Subagents to dispatch:** ${agents.length}\n\n`;
    template += `| # | Target Path | Agent Role |\n`;
    template += `|---|-------------|------------|\n`;
    for (let i = 0; i < agents.length; i++) {
      template += `| ${i + 1} | \`${agents[i]}\` | trident_explore:${i + 1} |\n`;
    }
    template += `\n## Dispatch Instructions\n\n`;
    template += `Each subagent receives:\n`;
    template += `- \`targetPath\`: absolute path to explore\n`;
    template += `- \`contextMode\`: \`T2\` (bible-style knowledge gathering)\n`;
    template += `- \`maxDepth\`: 3 (directory recursion)\n`;
    template += `- \`outputFormat\`: structured markdown with code blocks\n\n`;
    template += `## Expected Artifacts\n\n`;
    template += `- \`explore-{n}-report.md\`: per-agent exploration findings\n`;
    template += `- \`explore-summary.md\`: consolidated summary of all agent reports\n`;
    tridentLog('INFO', 'context-synthesis', `Explorer dispatch: ${maxAgents} subagents for ${targetPaths.length} paths`);
    return template;
  }

  getEngine(): ContextSynthesisEngine {
    return this.engine;
  }

  getHelpText(): string {
    return `## TRIDENT CONTEXT SYNTHESIS v4

**CORE PRINCIPLE:** "Trident synthesizes context for precise agent execution."

**4-LAYER CONTEXT MANAGEMENT:**

| Layer | Name | Thinking |
|-------|------|----------|
| 1 | CONTEXT COLLECTION | "What context exists?" (T1-T4) |
| 2 | RELEVANCE SCORING | "What matters most?" (urgency x importance) |
| 3 | COMPRESSION | "How to compress under 2K tokens?" |
| 4 | INJECTION FORMAT | "T0-ready format for agent injection" |

**TOKEN BUDGET:** 2000 tokens max per injection
**SOURCES:** T1 (Session), T2 (Knowledge), T3 (Files), T4 (Tools)`;
  }
}

export const contextSynthesisModule = new ContextSynthesisModule();
