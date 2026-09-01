import { tridentLog } from '../utils.js';
export type ToolUsageState = 'CLEAN' | 'UNDERUSE' | 'THEATER' | 'SILENT';
export interface ToolUsageVerdict {
  pattern: string;
  state: ToolUsageState;
  evidence: {
    toolCallNames: string[];
    briefMandate: 'graph-first' | 'graph-assist' | 'spec-only';
    graphAvailable: boolean;
    reportCitesGraph: boolean;
    graphQueriesCount: number;
    gateClass: string;
  };
  infraFail?: boolean;
  message?: string;
}
export interface ToolUsageContext {
  graphQueries: string[];
  gateClass: string;
  toolCallNames: string[];
  reportText: string;
  graphAvailable: boolean;
  findingsCount: number;
  briefMandatesTagging?: boolean;
}
export interface PatternFamily {
  id: string;
  kind: string;
  matcher: (node: ToolUsageContext, ctx: ToolUsageContext) => { patternId: string; evidence: string; triggerFired: string; confidence: number } | null;
  triggerCondition: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  messageTemplate: string;
  remediationHook?: string;
  exampleHits: string[];
}
const GRAPHIFY_TOOLS = ['graphify:query', 'graphify:path', 'graphify:explain', 'query', 'path', 'explain', 'graph.query', 'graph.path'];
function citesGraphOps(reportText: string, ctx: ToolUsageContext): boolean {
  void ctx;
  if (!reportText || reportText.length === 0) return false;
  const has = /graphify[:\/]|graph\.query|graph\.path|graph\.explain|subgraph|add_tag/i.test(reportText);
  return has;
}
function hasGraphToolCall(toolCallNames: string[], ctx: ToolUsageContext): boolean {
  void ctx;
  const lower = toolCallNames.map((n) => n.toLowerCase());
  return lower.some((n) => GRAPHIFY_TOOLS.some((g) => n.includes(g.toLowerCase())));
}
function hasTagCall(toolCallNames: string[], ctx: ToolUsageContext): boolean {
  void ctx;
  return toolCallNames.some((n) => n.toLowerCase().includes('graph_tag') || n.toLowerCase().includes('graph-tag') || n === 'add_tag');
}
export const L16_PATTERN_FAMILIES: PatternFamily[] = [
  {
    id: 'MANDATE_GRAPH_FIRST',
    kind: 'tool-usage-evidence',
    matcher: (node: ToolUsageContext, ctx: ToolUsageContext) => {
      void ctx;
      const cond = node.graphQueries.length > 0 && node.gateClass === 'SRO';
      if (!cond) return null;
      const hit = !hasGraphToolCall(node.toolCallNames, node);
      if (!hit) return null;
      return { patternId: 'MANDATE_GRAPH_FIRST', evidence: `SRO gate with ${node.graphQueries.length} graphQueries but zero graphify calls toolCalls=[${node.toolCallNames.join(',')}]`, triggerFired: 'toolCallNames ∩ graphifyTools === ∅', confidence: 0.92 };
    },
    triggerCondition: 'toolCallNames ∩ graphifyTools === ∅',
    severity: 'HIGH',
    messageTemplate: 'TOOL_USAGE_UNDERUSE: SRO hunter mandated graph-first but made zero graphify calls {evidence}',
    remediationHook: 'flag TOOL_USAGE_UNDERUSE',
    exampleHits: ['SRO hunter R28-graph with graphQueries [find callers of X] but toolCallNames [] → UNDERUSE', 'SRO hunter with 2 graphQueries and no graphify:query/path → flag'],
  },
  {
    id: 'MANDATE_GRAPH_ASSIST',
    kind: 'tool-usage-evidence',
    matcher: (node: ToolUsageContext, ctx: ToolUsageContext) => {
      void ctx;
      const cond = node.graphQueries.length > 0 && node.gateClass !== 'SRO';
      if (!cond) return null;
      const noGraphCall = !hasGraphToolCall(node.toolCallNames, node);
      const lacksCitation = !citesGraphOps(node.reportText, node);
      void lacksCitation;
      const reportLacksGraphEvidence = !/graph-evidence|graph cite|\[INFERRED\]|EXTRACTED/i.test(node.reportText);
      if (!noGraphCall) return null;
      if (!reportLacksGraphEvidence && node.reportText.length > 0) return null;
      return { patternId: 'MANDATE_GRAPH_ASSIST', evidence: `non-SRO gate ${node.gateClass} with ${node.graphQueries.length} graphQueries zero graphify calls reportLacksEvidence=${reportLacksGraphEvidence}`, triggerFired: 'toolCallNames ∩ graphifyTools === ∅ AND report lacks graph-evidence citations', confidence: 0.78 };
    },
    triggerCondition: 'toolCallNames ∩ graphifyTools === ∅ AND report lacks graph-evidence citations',
    severity: 'MEDIUM',
    messageTemplate: 'TOOL_USAGE_UNDERUSE: assist gate with graphQueries but no graphify calls and no graph citations {evidence}',
    remediationHook: 'flag TOOL_USAGE_UNDERUSE',
    exampleHits: ['LASME hunter with 1 graphQuery zero calls report without graph evidence → UNDERUSE', 'MPSE hunter graphQueries=1 toolCalls=[read,grep] report no graph cite → flag'],
  },
  {
    id: 'SPEC_ONLY',
    kind: 'tool-usage-evidence',
    matcher: (node: ToolUsageContext, ctx: ToolUsageContext) => {
      void ctx;
      const cond = node.graphQueries.length === 0;
      if (!cond) return null;
      return { patternId: 'SPEC_ONLY', evidence: `spec-only hunter gate=${node.gateClass} graphQueries=0`, triggerFired: 'brief.graphQueries.length === 0', confidence: 0.95 };
    },
    triggerCondition: 'brief.graphQueries.length === 0',
    severity: 'INFO',
    messageTemplate: 'SPEC_ONLY: spec-only hunter — no graph mandate {evidence}',
    remediationHook: 'none — gate SILENT (never a false positive)',
    exampleHits: ['hunter with graphQueries=[] gate=LASME → SILENT', 'spec-only template with zero graphQueries → never flag'],
  },
  {
    id: 'GRAPH_UNAVAILABLE',
    kind: 'infra-evidence',
    matcher: (node: ToolUsageContext, ctx: ToolUsageContext) => {
      void ctx;
      const cond = node.graphAvailable === false;
      if (!cond) return null;
      return { patternId: 'GRAPH_UNAVAILABLE', evidence: `micro graph unavailable graphAvailable=false gate=${node.gateClass}`, triggerFired: 'runGraphState.microPopulated === false', confidence: 0.99 };
    },
    triggerCondition: 'runGraphState.microPopulated === false',
    severity: 'HIGH',
    messageTemplate: 'INFRA_FAIL: graphify micro-graph unavailable — not a hunter violation {evidence}',
    remediationHook: 'the INFRA loud-fail (F5) — GRAPHIFY_MICRO_FAILED',
    exampleHits: ['micro-graph extract failed graphAvailable=false → INFRA', 'MCP connect missing graphJson absent → infra fail not hunter violation'],
  },
  {
    id: 'TAG_MANDATED',
    kind: 'tool-usage-evidence',
    matcher: (node: ToolUsageContext, ctx: ToolUsageContext) => {
      void ctx;
      const cond = node.findingsCount > 0 && node.briefMandatesTagging === true;
      if (!cond) return null;
      const noTag = !hasTagCall(node.toolCallNames, node);
      if (!noTag) return null;
      return { patternId: 'TAG_MANDATED', evidence: `findings=${node.findingsCount} mandates tagging but graph_tag missing calls=[${node.toolCallNames.join(',')}]`, triggerFired: "toolCallNames excludes 'graph_tag'", confidence: 0.82 };
    },
    triggerCondition: "toolCallNames excludes 'graph_tag'",
    severity: 'MEDIUM',
    messageTemplate: 'TAG_SKIPPED: findings present but graph_tag unused {evidence}',
    remediationHook: 'flag TAG_SKIPPED',
    exampleHits: ['hunter 3 findings brief mandates tagging toolCalls=[read] no graph_tag → TAG_SKIPPED', 'findings=1 graph_tag absent → flag'],
  },
  {
    id: 'THEATER_PATTERN',
    kind: 'tool-usage-evidence',
    matcher: (node: ToolUsageContext, ctx: ToolUsageContext) => {
      void ctx;
      const cites = citesGraphOps(node.reportText, node);
      const noCall = !hasGraphToolCall(node.toolCallNames, node);
      if (!cites || !noCall) return null;
      return { patternId: 'THEATER_PATTERN', evidence: `report cites graphify ops (${node.reportText.slice(0, 120)}) but zero graphify tool calls`, triggerFired: 'report text cites graphify: ops AND toolCallNames ∩ graphifyTools === ∅', confidence: 0.97 };
    },
    triggerCondition: 'report text cites graphify: ops AND toolCallNames ∩ graphifyTools === ∅',
    severity: 'CRITICAL',
    messageTemplate: 'TOOL_USAGE_THEATER: report quoted graphify tools it never ran {evidence}',
    remediationHook: 'REJECT the settlement — TOOL_USAGE_THEATER',
    exampleHits: ['report contains "graphify:query path" but toolCallNames=[] → THEATER REJECTED', 'report cites graphify operations zero graphify calls → CRITICAL theater'],
  },
];
export function evaluateToolUsage(ctx: ToolUsageContext): ToolUsageVerdict {
  const theater = L16_PATTERN_FAMILIES.find((p) => p.id === 'THEATER_PATTERN')!.matcher(ctx, ctx);
  if (theater) {
    return {
      pattern: theater.patternId,
      state: 'THEATER',
      evidence: {
        toolCallNames: ctx.toolCallNames,
        briefMandate: ctx.graphQueries.length === 0 ? 'spec-only' : ctx.gateClass === 'SRO' ? 'graph-first' : 'graph-assist',
        graphAvailable: ctx.graphAvailable,
        reportCitesGraph: citesGraphOps(ctx.reportText, ctx),
        graphQueriesCount: ctx.graphQueries.length,
        gateClass: ctx.gateClass,
      },
      message: `TOOL_USAGE_THEATER: ${ctx.gateClass} — ${theater.evidence}`,
    };
  }
  const infra = L16_PATTERN_FAMILIES.find((p) => p.id === 'GRAPH_UNAVAILABLE')!.matcher(ctx, ctx);
  if (infra) {
    return {
      pattern: infra.patternId,
      state: 'SILENT',
      evidence: {
        toolCallNames: ctx.toolCallNames,
        briefMandate: ctx.graphQueries.length === 0 ? 'spec-only' : ctx.gateClass === 'SRO' ? 'graph-first' : 'graph-assist',
        graphAvailable: ctx.graphAvailable,
        reportCitesGraph: citesGraphOps(ctx.reportText, ctx),
        graphQueriesCount: ctx.graphQueries.length,
        gateClass: ctx.gateClass,
      },
      infraFail: true,
      message: `INFRA_FAIL: ${infra.evidence}`,
    };
  }
  const specOnly = L16_PATTERN_FAMILIES.find((p) => p.id === 'SPEC_ONLY')!.matcher(ctx, ctx);
  if (specOnly) {
    return {
      pattern: specOnly.patternId,
      state: 'SILENT',
      evidence: {
        toolCallNames: ctx.toolCallNames,
        briefMandate: 'spec-only',
        graphAvailable: ctx.graphAvailable,
        reportCitesGraph: citesGraphOps(ctx.reportText, ctx),
        graphQueriesCount: 0,
        gateClass: ctx.gateClass,
      },
      message: specOnly.evidence,
    };
  }
  const graphFirst = L16_PATTERN_FAMILIES.find((p) => p.id === 'MANDATE_GRAPH_FIRST')!.matcher(ctx, ctx);
  if (graphFirst) {
    return {
      pattern: graphFirst.patternId,
      state: 'UNDERUSE',
      evidence: {
        toolCallNames: ctx.toolCallNames,
        briefMandate: 'graph-first',
        graphAvailable: ctx.graphAvailable,
        reportCitesGraph: citesGraphOps(ctx.reportText, ctx),
        graphQueriesCount: ctx.graphQueries.length,
        gateClass: ctx.gateClass,
      },
      message: graphFirst.evidence,
    };
  }
  const tagMand = L16_PATTERN_FAMILIES.find((p) => p.id === 'TAG_MANDATED')!.matcher(ctx, ctx);
  if (tagMand) {
    return {
      pattern: tagMand.patternId,
      state: 'UNDERUSE',
      evidence: {
        toolCallNames: ctx.toolCallNames,
        briefMandate: ctx.gateClass === 'SRO' ? 'graph-first' : 'graph-assist',
        graphAvailable: ctx.graphAvailable,
        reportCitesGraph: citesGraphOps(ctx.reportText, ctx),
        graphQueriesCount: ctx.graphQueries.length,
        gateClass: ctx.gateClass,
      },
      message: tagMand.evidence,
    };
  }
  const graphAssist = L16_PATTERN_FAMILIES.find((p) => p.id === 'MANDATE_GRAPH_ASSIST')!.matcher(ctx, ctx);
  if (graphAssist) {
    return {
      pattern: graphAssist.patternId,
      state: 'UNDERUSE',
      evidence: {
        toolCallNames: ctx.toolCallNames,
        briefMandate: 'graph-assist',
        graphAvailable: ctx.graphAvailable,
        reportCitesGraph: citesGraphOps(ctx.reportText, ctx),
        graphQueriesCount: ctx.graphQueries.length,
        gateClass: ctx.gateClass,
      },
      message: graphAssist.evidence,
    };
  }
  return {
    pattern: 'CLEAN',
    state: 'CLEAN',
    evidence: {
      toolCallNames: ctx.toolCallNames,
      briefMandate: ctx.graphQueries.length === 0 ? 'spec-only' : ctx.gateClass === 'SRO' ? 'graph-first' : 'graph-assist',
      graphAvailable: ctx.graphAvailable,
      reportCitesGraph: citesGraphOps(ctx.reportText, ctx),
      graphQueriesCount: ctx.graphQueries.length,
      gateClass: ctx.gateClass,
    },
    message: 'CLEAN — tool usage matches mandate',
  };
}
export function isTheaterVerdict(v: ToolUsageVerdict): boolean { return v.state === 'THEATER'; }
export function isSilentVerdict(v: ToolUsageVerdict): boolean { return v.state === 'SILENT'; }
void tridentLog;
