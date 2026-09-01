import * as z from 'zod';
import type { GateCheck, GateResult, GraphifyGraph, SharedMemoryStore, SubagentSettlement, SubagentSpec } from '../types.js';

export interface SroGateInput {
  readonly targetRoot: string;
  readonly specs?: string[];
  readonly specPaths?: string[];
}

export const SroSubagentOutputSchema = z.object({
  summary: z.string().min(1).optional(),
  deadCode: z.array(z.object({ file: z.string(), symbol: z.string().optional(), kind: z.string().optional(), reason: z.string().optional() }).passthrough()).optional(),
  cycles: z.array(z.array(z.string())).optional(),
  impactPaths: z.array(z.object({ from: z.string(), to: z.string(), hops: z.number().int().nonnegative(), edgeTypes: z.array(z.string()) })).optional(),
  graphSlice: z.object({ queriedConcepts: z.array(z.string()), relevantSubgraph: z.string() }).optional(),
}).passthrough();

export type SroSubagentOutput = z.infer<typeof SroSubagentOutputSchema>;

export interface CrossPhaseCorrelation {
  readonly findingId: string;
  readonly flaggedBy: { readonly lasme: boolean; readonly mpse: boolean; readonly sro: boolean };
  readonly impactPaths: ReadonlyArray<{ readonly from: string; readonly to: string; readonly hops: number; readonly edgeTypes: readonly string[] }>;
  readonly tripleConfirmed: boolean;
  readonly recommendedSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface BlastRadiusRow {
  readonly findingId: string;
  readonly impactPaths: ReadonlyArray<{ readonly from: string; readonly to: string; readonly hops: number; readonly edgeTypes: readonly string[] }>;
  readonly downstreamCount: number;
}

export interface SroSynthesis {
  readonly blastRadius: BlastRadiusRow[];
  readonly deadCode: unknown[];
  readonly cycles: unknown[];
  readonly correlations: CrossPhaseCorrelation[];
}

interface LasmeGateOutputShape {
  readonly gateName: string;
  readonly synthesis: { readonly candidates?: Array<{ readonly file: string; readonly line: number; readonly subject?: string; readonly layer?: string; readonly predicate?: string; readonly object?: string }> ; readonly [k: string]: unknown };
  readonly [k: string]: unknown;
}

interface MpseGateOutputShape {
  readonly gateName: string;
  readonly synthesis: { readonly violations?: Array<{ readonly file?: string; readonly line?: number; readonly contractId?: string; readonly specPath?: string }>; readonly conformanceMatrix?: unknown[]; readonly [k: string]: unknown };
  readonly [k: string]: unknown;
}

const GRAPH_TOOLS_USAGE_LAW = `GRAPH TOOLS USAGE LAW:

You have access to graphify tools: graphify:query, graphify:path,
graphify:explain, graphify:subgraph. These query a knowledge graph
of the codebase built by tree-sitter AST parsing.

RULES:
1. ALWAYS query the graph BEFORE reading files directly. The graph
   gives you the structural overview; file reads give you the details.
2. Every edge in the graph carries a confidence tag:
   - EXTRACTED = the relationship is explicit in the source code
   - INFERRED = graphify derived it from resolution
   When citing evidence, prefer EXTRACTED edges. Flag INFERRED edges
   with [INFERRED] in your evidence field.
3. Use graphify:path to trace connections between concepts you find.
   This reveals impact chains that file reading alone cannot show.
4. Use graphify:subgraph with depth=3 around any finding to understand
   its blast radius (what it affects downstream).
5. The graph shows the FOREST. File reads show the TREES. Use both.
6. NEVER fabricate a graph node or edge. If the graph doesn't show a
   connection, report "no graph connection found" — never invent one.
7. Community labels in the graph show detected subsystems. Use these
   to understand architectural boundaries.
8. God nodes (highest degree) are potential single points of failure.
   Flag findings that involve god nodes with severity +1.`;

function formatCrossGateContext(memory: SharedMemoryStore): string {
  try {
    const lasmeOutput = memory.getGateOutput('LASME') as LasmeGateOutputShape | null;
    const mpseOutput = memory.getGateOutput('MPSE') as MpseGateOutputShape | null;
    const lasmeCandidates = (lasmeOutput?.synthesis as Record<string, unknown>)?.['candidates'] ?? [];
    const mpseViolations = (mpseOutput?.synthesis as Record<string, unknown>)?.['violations'] ?? (mpseOutput?.synthesis as Record<string, unknown>)?.['conformanceMatrix'] ?? [];
    return `LASME findings (const lasmeOutput = memory.getGateOutput('LASME')):\n${JSON.stringify(lasmeCandidates, null, 2)}\n\nMPSE findings (const mpseOutput = memory.getGateOutput('MPSE')):\n${JSON.stringify(mpseViolations, null, 2)}`;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Cross-gate context unavailable: ${msg}`;
  }
}

function buildSroOutputContract(): string {
  return `OUTPUT CONTRACT (byte-explicit — your response MUST be valid JSON matching this zod schema):

\`\`\`json
{
  "summary": "string (required, 1+ chars)",
  "deadCode": [{"file": "string", "symbol": "string (optional)", "kind": "string (optional)"}],
  "cycles": [["string (node id)", "..."]],
  "impactPaths": [{"from": "string (file:line)", "to": "string", "hops": "number", "edgeTypes": ["string"]}],
  "graphSlice": {"queriedConcepts": ["string"], "relevantSubgraph": "string"}
}
\`\`\`

Rules:
- summary is required context for the gate
- deadCode: exports with no importers, functions with no callers — empty array is VALID when genuinely empty (measured, never assumed)
- cycles: circular dependency chains — empty array is VALID when genuinely absent
- impactPaths: for path-hunter, the blast radius within 5 hops per finding
- graphSlice: for graph-builder, the transformed slice via corbell-bridge (transformNode/transformEdge)
- Return ONLY the JSON object, no surrounding prose or markdown fences.`;
}

export const graphBuilderSpec: SubagentSpec<SroGateInput, SroSubagentOutput> = {
  id: 'graph-builder',
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
  graphQueries: ['show all nodes and edges from the merged graph'],
  outputSchema: SroSubagentOutputSchema,
  buildSystemPrompt(input: SroGateInput, _graph: GraphifyGraph, memory: SharedMemoryStore): string {
    const lasmeOutput = memory.getGateOutput('LASME');
    const mpseOutput = memory.getGateOutput('MPSE');
    const crossGate = formatCrossGateContext(memory);
    return `You are the GRAPH-BUILDER — GRAPH TOOLS USAGE LAW applies — specialized SRO graph intelligence agent.

YOUR MISSION: Populate the corbell typed graph from merged micro-graph slices. The bridge transform itself lives in corbell-bridge.ts (transformNode/transformEdge); your prompt directs the mapping + verification. Map graphify nodes (class/function/interface/file) to corbell kinds (Class/Function/Interface/File via NODE_TYPE_MAP) and graphify edges (imports/calls/inherits/uses) to corbell predicates (imports/calls/implements/wraps via EDGE_PREDICATE_MAP). Preserve evidence_quote per bridge contract: EXTRACTED -> "explicit: {relation} in source", INFERRED -> "inferred: {relation} by graphify resolution".

TARGET: ${input.targetRoot}

CROSS-PHASE INTELLIGENCE (you MUST embed BOTH gates — const lasmeOutput = memory.getGateOutput('LASME'); const mpseOutput = memory.getGateOutput('MPSE') — cross-phase intelligence is the POINT of SRO):
${crossGate}

LASME raw: ${lasmeOutput !== null && lasmeOutput !== undefined ? JSON.stringify((lasmeOutput as unknown as LasmeGateOutputShape).synthesis) : 'No LASME output'}
MPSE raw: ${mpseOutput !== null && mpseOutput !== undefined ? JSON.stringify((mpseOutput as unknown as MpseGateOutputShape).synthesis) : 'No MPSE output'}

${GRAPH_TOOLS_USAGE_LAW}

GRAPH QUERIES FOR THIS AGENT (run these first):
- "show all nodes and edges from the merged graph"

THEN VERIFY WITH BRIDGE CONTRACT:
- For each graphify node, call transformNode(node) shape: {canonical_id, kind, label, file, line, created_run}
- For each graphify edge, call transformEdge(edge) shape: {src_canonical, dst_canonical, predicate, evidence_quote, confidence}
- Verify CHECK constraints: evidence_quote length > 0, kind in 16-type ontology, predicate in 20-type set

${buildSroOutputContract()}`;
  },
  buildUserPrompt(input: SroGateInput): string {
    return `Build corbell typed graph for ${input.targetRoot}. Transform merged graph slices via corbell-bridge transformNode/transformEdge. Return graphSlice + summary as JSON.`;
  },
};

export const pathHunterSpec: SubagentSpec<SroGateInput, SroSubagentOutput> = {
  id: 'path-hunter',
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
  graphQueries: ['path from {finding.file}:{finding.line} to all callers within 5 hops'],
  outputSchema: SroSubagentOutputSchema,
  buildSystemPrompt(input: SroGateInput, _graph: GraphifyGraph, memory: SharedMemoryStore): string {
    const lasmeOutput = memory.getGateOutput('LASME');
    const mpseOutput = memory.getGateOutput('MPSE');
    const crossGate = formatCrossGateContext(memory);
    return `You are the PATH-HUNTER — GRAPH TOOLS USAGE LAW applies — specialized SRO blast-radius agent.

YOUR MISSION: For each finding from LASME + MPSE (graphify:path blast radius within 5 hops), trace impact paths downstream. For every file:line flagged by either gate, query the graph for all reachable nodes within 5 hops and report from/to/hops/edgeTypes.

TARGET: ${input.targetRoot}

CROSS-PHASE INTELLIGENCE (const lasmeOutput = memory.getGateOutput('LASME'); const mpseOutput = memory.getGateOutput('MPSE')):
${crossGate}

LASME raw: ${lasmeOutput !== null && lasmeOutput !== undefined ? JSON.stringify((lasmeOutput as unknown as LasmeGateOutputShape).synthesis) : 'No LASME output'}
MPSE raw: ${mpseOutput !== null && mpseOutput !== undefined ? JSON.stringify((mpseOutput as unknown as MpseGateOutputShape).synthesis) : 'No MPSE output'}

${GRAPH_TOOLS_USAGE_LAW}

GRAPH QUERIES FOR THIS AGENT (run these first — one per finding):
- "path from {finding.file}:{finding.line} to all callers within 5 hops"
- Use graphify:path for each finding site to trace downstream impact
- Use graphify:subgraph depth=3 around each finding for blast radius

THEN VERIFY WITH FILE READS:
- Confirm each downstream node exists in the codebase
- Report impactPaths: [{from: "file:line", to, hops, edgeTypes}]

${buildSroOutputContract()}`;
  },
  buildUserPrompt(input: SroGateInput): string {
    return `Hunt blast-radius paths for ${input.targetRoot}. For each LASME+MPSE finding, trace graphify:path within 5 hops downstream. Return impactPaths + summary as JSON.`;
  },
};

export const deadCodeHunterSpec: SubagentSpec<SroGateInput, SroSubagentOutput> = {
  id: 'dead-code-hunter',
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
  graphQueries: ['find nodes with in-degree 0 that are exported', 'show functions not in any call chain'],
  outputSchema: SroSubagentOutputSchema,
  buildSystemPrompt(input: SroGateInput, _graph: GraphifyGraph, memory: SharedMemoryStore): string {
    const lasmeOutput = memory.getGateOutput('LASME');
    const mpseOutput = memory.getGateOutput('MPSE');
    const crossGate = formatCrossGateContext(memory);
    return `You are the DEAD-CODE-HUNTER — GRAPH TOOLS USAGE LAW applies — specialized SRO dead-code agent.

YOUR MISSION: Find exports with no importers, functions with no callers, modules with no consumers — measured, never assumed: empty list is a VALID result when genuinely empty. Do not invent dead code; an empty result must be explicitly confirmed-empty.

TARGET: ${input.targetRoot}

CROSS-PHASE INTELLIGENCE (const lasmeOutput = memory.getGateOutput('LASME'); const mpseOutput = memory.getGateOutput('MPSE')):
${crossGate}

LASME raw: ${lasmeOutput !== null && lasmeOutput !== undefined ? JSON.stringify((lasmeOutput as unknown as LasmeGateOutputShape).synthesis) : 'No LASME output'}
MPSE raw: ${mpseOutput !== null && mpseOutput !== undefined ? JSON.stringify((mpseOutput as unknown as MpseGateOutputShape).synthesis) : 'No MPSE output'}

${GRAPH_TOOLS_USAGE_LAW}

GRAPH QUERIES FOR THIS AGENT (run these first):
- "find nodes with in-degree 0 that are exported"
- "show functions not in any call chain"

THEN VERIFY WITH FILE READS:
- Confirm each candidate has no importers/callers by grepping the codebase
- Empty result IS valid — return [] when genuinely empty, never fabricate entries

${buildSroOutputContract()}`;
  },
  buildUserPrompt(input: SroGateInput): string {
    return `Hunt dead code for ${input.targetRoot}. Find exports with no importers, functions with no callers. Measured — empty list is valid when genuinely empty. Return deadCode + summary as JSON.`;
  },
};

export const cycleHunterSpec: SubagentSpec<SroGateInput, SroSubagentOutput> = {
  id: 'cycle-hunter',
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
  graphQueries: ['find cycles in the import graph', 'show circular dependency chains'],
  outputSchema: SroSubagentOutputSchema,
  buildSystemPrompt(input: SroGateInput, _graph: GraphifyGraph, memory: SharedMemoryStore): string {
    const lasmeOutput = memory.getGateOutput('LASME');
    const mpseOutput = memory.getGateOutput('MPSE');
    const crossGate = formatCrossGateContext(memory);
    return `You are the CYCLE-HUNTER — GRAPH TOOLS USAGE LAW applies — specialized SRO cycle detection agent.

YOUR MISSION: Find circular dependency chains in the import graph. Report each cycle as an ordered list of module/file ids forming the loop.

TARGET: ${input.targetRoot}

CROSS-PHASE INTELLIGENCE (const lasmeOutput = memory.getGateOutput('LASME'); const mpseOutput = memory.getGateOutput('MPSE')):
${crossGate}

LASME raw: ${lasmeOutput !== null && lasmeOutput !== undefined ? JSON.stringify((lasmeOutput as unknown as LasmeGateOutputShape).synthesis) : 'No LASME output'}
MPSE raw: ${mpseOutput !== null && mpseOutput !== undefined ? JSON.stringify((mpseOutput as unknown as MpseGateOutputShape).synthesis) : 'No MPSE output'}

${GRAPH_TOOLS_USAGE_LAW}

GRAPH QUERIES FOR THIS AGENT (run these first):
- "find cycles in the import graph"
- "show circular dependency chains"

THEN VERIFY WITH FILE READS:
- Confirm each edge in the reported cycle exists as an import statement
- Empty result IS valid — return [] when no cycles found, never fabricate a cycle

${buildSroOutputContract()}`;
  },
  buildUserPrompt(input: SroGateInput): string {
    return `Hunt import cycles for ${input.targetRoot}. Find circular dependency chains in the import graph. Return cycles + summary as JSON.`;
  },
};

export const sroSubagentIds: string[] = ['graph-builder', 'path-hunter', 'dead-code-hunter', 'cycle-hunter'];

export const sroSpecs: SubagentSpec<SroGateInput, SroSubagentOutput>[] = [graphBuilderSpec, pathHunterSpec, deadCodeHunterSpec, cycleHunterSpec];

function computeBlastRadius(allFindings: Array<{ file: string; line: number; id: string }>, graph: GraphifyGraph): BlastRadiusRow[] {
  const rows: BlastRadiusRow[] = [];
  try {
    const edges = graph.edges ?? [];
    const nodes = graph.nodes ?? [];
    const fileToNodeIds = new Map<string, string[]>();
    for (const n of nodes) {
      const f = (n as { file?: string }).file;
      if (typeof f === 'string' && f.length > 0) {
        const arr = fileToNodeIds.get(f) ?? [];
        arr.push(n.id);
        fileToNodeIds.set(f, arr);
      }
    }
    const adj = new Map<string, Array<{ dst: string; relation: string }>>();
    for (const e of edges) {
      const list = adj.get(e.src) ?? [];
      list.push({ dst: e.dst, relation: e.relation });
      adj.set(e.src, list);
    }
    for (const finding of allFindings) {
      const startIds = fileToNodeIds.get(finding.file) ?? [];
      if (startIds.length === 0) {
        rows.push({ findingId: finding.id, impactPaths: [], downstreamCount: 0 });
        continue;
      }
      const visited = new Set<string>(startIds);
      const queue: Array<{ id: string; hops: number; path: string[] }> = startIds.map((id) => ({ id, hops: 0, path: [] }));
      const impactPaths: Array<{ from: string; to: string; hops: number; edgeTypes: string[] }> = [];
      let idx = 0;
      while (idx < queue.length) {
        const cur = queue[idx]!;
        idx++;
        if (cur.hops >= 5) continue;
        const outs = adj.get(cur.id) ?? [];
        for (const edge of outs) {
          if (visited.has(edge.dst)) continue;
          visited.add(edge.dst);
          const newHops = cur.hops + 1;
          const newPath = [...cur.path, edge.relation];
          impactPaths.push({ from: `${finding.file}:${finding.line}`, to: edge.dst, hops: newHops, edgeTypes: [...newPath] });
          queue.push({ id: edge.dst, hops: newHops, path: newPath });
        }
      }
      rows.push({ findingId: finding.id, impactPaths, downstreamCount: impactPaths.length });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`SRO_BLAST_RADIUS_FAILED: ${msg}`);
  }
  return rows;
}

export async function sroSynthesize(
  results: SubagentSettlement<SroSubagentOutput>[],
  graph: GraphifyGraph,
  memory: SharedMemoryStore,
): Promise<SroSynthesis> {
  let lasmeCandidates: Array<{ file: string; line: number }> = [];
  let mpseViolations: Array<{ file?: string; line?: number }> = [];
  try {
    const lasmeOutput = memory.getGateOutput('LASME') as LasmeGateOutputShape | null;
    if (lasmeOutput !== null && lasmeOutput !== undefined) {
      const synth = lasmeOutput.synthesis as Record<string, unknown>;
      const raw = (synth?.['candidates'] as unknown[]) ?? [];
      if (Array.isArray(raw)) {
        lasmeCandidates = raw
          .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
          .filter((c) => typeof c['file'] === 'string' && typeof c['line'] === 'number')
          .map((c) => ({ file: c['file'] as string, line: c['line'] as number }));
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`SRO_SYNTHESIZE_LASME_READ_FAILED: ${msg}`);
  }
  try {
    const mpseOutput = memory.getGateOutput('MPSE') as MpseGateOutputShape | null;
    if (mpseOutput !== null && mpseOutput !== undefined) {
      const synth = mpseOutput.synthesis as Record<string, unknown>;
      const rawViolations = (synth?.['violations'] as unknown[]) ?? (synth?.['conformanceMatrix'] as unknown[] ?? []).filter((r: unknown) => typeof r === 'object' && r !== null && (r as Record<string, unknown>)['implementationStatus'] === 'violated');
      if (Array.isArray(rawViolations)) {
        mpseViolations = rawViolations
          .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
          .map((c) => ({ file: typeof c['file'] === 'string' ? c['file'] as string : undefined, line: typeof c['line'] === 'number' ? c['line'] as number : undefined }));
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`SRO_SYNTHESIZE_MPSE_READ_FAILED: ${msg}`);
  }

  const allFindings: Array<{ file: string; line: number; id: string }> = [];
  for (const c of lasmeCandidates) {
    allFindings.push({ file: c.file, line: c.line, id: `${c.file}:${c.line}` });
  }
  for (const v of mpseViolations) {
    if (typeof v.file === 'string' && typeof v.line === 'number') {
      const id = `${v.file}:${v.line}`;
      if (!allFindings.some((f) => f.id === id)) allFindings.push({ file: v.file, line: v.line, id });
    }
  }

  const dedupedFindings = (() => {
    const seen = new Set<string>();
    const out: typeof allFindings = [];
    for (const f of allFindings) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
    return out;
  })();

  const blastRadius = computeBlastRadius(dedupedFindings, graph);

  const correlations: CrossPhaseCorrelation[] = [];
  for (const finding of dedupedFindings) {
    const flaggedByLasme = lasmeCandidates.some((c) => c.file === finding.file && c.line === finding.line);
    const flaggedByMpse = mpseViolations.some((v) => v.file === finding.file && v.line === finding.line);
    const hasGraphImpact = (blastRadius.find((b) => b.findingId === finding.id)?.downstreamCount ?? 0) > 0;
    const triple = flaggedByLasme && flaggedByMpse && hasGraphImpact;
    const twoFlags = (flaggedByLasme ? 1 : 0) + (flaggedByMpse ? 1 : 0) + (hasGraphImpact ? 1 : 0);
    let recommendedSeverity: CrossPhaseCorrelation['recommendedSeverity'];
    if (triple) recommendedSeverity = 'CRITICAL';
    else if (twoFlags >= 2) recommendedSeverity = 'HIGH';
    else if (twoFlags === 1) recommendedSeverity = 'MEDIUM';
    else recommendedSeverity = 'LOW';
    const impactEntry = blastRadius.find((b) => b.findingId === finding.id);
    const impactPaths = impactEntry?.impactPaths ?? [];
    correlations.push({
      findingId: finding.id,
      flaggedBy: { lasme: flaggedByLasme, mpse: flaggedByMpse, sro: hasGraphImpact },
      impactPaths,
      tripleConfirmed: triple,
      recommendedSeverity,
    });
  }

  let deadCode: unknown[] = [];
  let cycles: unknown[] = [];
  try {
    const dc = results.find((r) => r.subagentId === 'dead-code-hunter');
    if (dc !== undefined && dc.status === 'fulfilled' && dc.value !== undefined && dc.value !== null) {
      const v = dc.value as unknown as Record<string, unknown>;
      if (Array.isArray(v)) deadCode = v;
      else if (Array.isArray(v['deadCode'])) deadCode = v['deadCode'] as unknown[];
      else if (Array.isArray(v['dead_code'])) deadCode = v['dead_code'] as unknown[];
      else deadCode = [];
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`SRO_SYNTHESIZE_DEADCODE_FAILED: ${msg}`);
  }
  try {
    const cy = results.find((r) => r.subagentId === 'cycle-hunter');
    if (cy !== undefined && cy.status === 'fulfilled' && cy.value !== undefined && cy.value !== null) {
      const v = cy.value as unknown as Record<string, unknown>;
      if (Array.isArray(v)) cycles = v;
      else if (Array.isArray(v['cycles'])) cycles = v['cycles'] as unknown[];
      else if (Array.isArray(v['cycle'])) cycles = v['cycle'] as unknown[];
      else cycles = [];
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`SRO_SYNTHESIZE_CYCLES_FAILED: ${msg}`);
  }

  return { blastRadius, deadCode, cycles, correlations };
}

export function createSroPreGates(): GateCheck<SroGateInput>[] {
  const lasmeComplete: GateCheck<SroGateInput> = {
    name: 'sro-pre-lasme-complete',
    description: 'LASME gate complete in shared memory',
    check: async (target: SroGateInput): Promise<GateResult> => {
      try {
        const mem = (target as unknown as { memory?: SharedMemoryStore }).memory;
        if (mem !== undefined && mem !== null && typeof mem.getGateOutput === 'function') {
          const out = mem.getGateOutput('LASME');
          if (out !== null && out !== undefined) return { passed: true };
          return { passed: false, reason: 'SRO_PRE_LASME_MISSING: LASME gate output not found — run LASME before SRO' };
        }
        return { passed: false, reason: 'SRO_PRE_LASME_MISSING: no memory handle on input — cannot verify LASME complete' };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { passed: false, reason: `SRO_PRE_LASME_ERROR: ${msg}` };
      }
    },
  };
  const mpseComplete: GateCheck<SroGateInput> = {
    name: 'sro-pre-mpse-complete',
    description: 'MPSE gate complete in shared memory',
    check: async (target: SroGateInput): Promise<GateResult> => {
      try {
        const mem = (target as unknown as { memory?: SharedMemoryStore }).memory;
        if (mem !== undefined && mem !== null && typeof mem.getGateOutput === 'function') {
          const out = mem.getGateOutput('MPSE');
          if (out !== null && out !== undefined) return { passed: true };
          return { passed: false, reason: 'SRO_PRE_MPSE_MISSING: MPSE gate output not found — run MPSE before SRO' };
        }
        return { passed: false, reason: 'SRO_PRE_MPSE_MISSING: no memory handle on input — cannot verify MPSE complete' };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { passed: false, reason: `SRO_PRE_MPSE_ERROR: ${msg}` };
      }
    },
  };
  const mergedGraphValid: GateCheck<SroGateInput> = {
    name: 'sro-pre-merged-graph-valid',
    description: 'merged graph valid (>=1 node, >=1 edge)',
    check: async (target: SroGateInput): Promise<GateResult> => {
      try {
        const mem = (target as unknown as { memory?: SharedMemoryStore }).memory;
        const graphFromTarget = (target as unknown as { graph?: GraphifyGraph }).graph;
        let graph: GraphifyGraph | null = null;
        if (mem !== undefined && mem !== null && typeof mem.getGraph === 'function') {
          try {
            const g = mem.getGraph() as GraphifyGraph | null;
            if (g !== null && g !== undefined) graph = g;
          } catch (e2: unknown) {
            const m2 = e2 instanceof Error ? e2.message : String(e2);
            return { passed: false, reason: `SRO_PRE_GRAPH_READ_FAILED: ${m2}` };
          }
        }
        if (graph === null && graphFromTarget !== undefined && graphFromTarget !== null) graph = graphFromTarget;
        if (graph === null || graph === undefined) return { passed: false, reason: 'SRO_PRE_GRAPH_MISSING: merged graph not found in memory or input' };
        const nodes = (graph as GraphifyGraph).nodes;
        const edges = (graph as GraphifyGraph).edges;
        if (!Array.isArray(nodes) || nodes.length < 1) return { passed: false, reason: 'SRO_PRE_GRAPH_NO_NODES: merged graph has 0 nodes — need >=1' };
        if (!Array.isArray(edges) || edges.length < 1) return { passed: false, reason: 'SRO_PRE_GRAPH_NO_EDGES: merged graph has 0 edges — need >=1' };
        if (nodes.some((n: unknown) => typeof (n as Record<string, unknown>)['id'] !== 'string')) return { passed: false, reason: 'SRO_PRE_GRAPH_BAD_NODE: node missing id' };
        if (edges.some((e: unknown) => typeof (e as Record<string, unknown>)['src'] !== 'string' || typeof (e as Record<string, unknown>)['dst'] !== 'string')) return { passed: false, reason: 'SRO_PRE_GRAPH_BAD_EDGE: edge missing src/dst' };
        return { passed: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { passed: false, reason: `SRO_PRE_GRAPH_ERROR: ${msg}` };
      }
    },
  };
  return [lasmeComplete, mpseComplete, mergedGraphValid];
}

export function createSroPostGates(): GateCheck<SroSynthesis>[] {
  const blastRadiusPresent: GateCheck<SroSynthesis> = {
    name: 'sro-post-blast-radius-computed',
    description: 'every finding has a blast-radius entry',
    check: async (synthesis: SroSynthesis): Promise<GateResult> => {
      try {
        if (synthesis === null || synthesis === undefined || !Array.isArray(synthesis.blastRadius)) return { passed: false, reason: 'SRO_POST_BLAST_RADIUS_MISSING: blastRadius is not an array' };
        if (!Array.isArray(synthesis.correlations)) return { passed: false, reason: 'SRO_POST_CORRELATIONS_MISSING: correlations is not an array' };
        for (const corr of synthesis.correlations) {
          const br = synthesis.blastRadius.find((b) => b.findingId === corr.findingId);
          if (br === undefined) return { passed: false, reason: `SRO_POST_BLAST_RADIUS_GAP: no blast-radius entry for ${corr.findingId}` };
          if (!Array.isArray(br.impactPaths)) return { passed: false, reason: `SRO_POST_IMPACT_PATHS_MISSING: ${corr.findingId} impactPaths not array` };
          if (typeof br.downstreamCount !== 'number') return { passed: false, reason: `SRO_POST_DOWNSTREAM_COUNT_MISSING: ${corr.findingId}` };
          if (br.downstreamCount !== br.impactPaths.length) return { passed: false, reason: `SRO_POST_DOWNSTREAM_MISMATCH: ${corr.findingId} downstreamCount ${br.downstreamCount} != impactPaths.length ${br.impactPaths.length}` };
          if (corr.impactPaths.length !== br.impactPaths.length) return { passed: false, reason: `SRO_POST_CORRELATION_PATHS_MISMATCH: ${corr.findingId}` };
        }
        if (synthesis.correlations.length > 0 && synthesis.blastRadius.length < synthesis.correlations.length) return { passed: false, reason: 'SRO_POST_BLAST_RADIUS_INCOMPLETE: fewer blast entries than correlations' };
        return { passed: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { passed: false, reason: `SRO_POST_BLAST_RADIUS_ERROR: ${msg}` };
      }
    },
  };
  const deadCodeListPresent: GateCheck<SroSynthesis> = {
    name: 'sro-post-dead-code-measured',
    description: 'dead-code list present-or-confirmed-empty (measured, not assumed)',
    check: async (synthesis: SroSynthesis): Promise<GateResult> => {
      try {
        if (synthesis === null || synthesis === undefined) return { passed: false, reason: 'SRO_POST_DEADCODE_NULL: synthesis is null' };
        if (!Array.isArray(synthesis.deadCode)) return { passed: false, reason: 'SRO_POST_DEADCODE_MISSING: deadCode is not an array — must be present or confirmed-empty []' };
        for (let i = 0; i < synthesis.deadCode.length; i++) {
          const entry = synthesis.deadCode[i] as Record<string, unknown>;
          if (entry === null || typeof entry !== 'object') return { passed: false, reason: `SRO_POST_DEADCODE_BAD_ENTRY[${i}]: not an object` };
        }
        if (synthesis.deadCode.length === 0) {
          if (synthesis.blastRadius === undefined) return { passed: false, reason: 'SRO_POST_DEADCODE_EMPTY_UNCONFIRMED: blastRadius missing so empty not confirmed' };
        }
        return { passed: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { passed: false, reason: `SRO_POST_DEADCODE_ERROR: ${msg}` };
      }
    },
  };
  const cyclesCompleted: GateCheck<SroSynthesis> = {
    name: 'sro-post-cycles-detected',
    description: 'cycle detection completed (found or confirmed absent)',
    check: async (synthesis: SroSynthesis): Promise<GateResult> => {
      try {
        if (synthesis === null || synthesis === undefined) return { passed: false, reason: 'SRO_POST_CYCLES_NULL: synthesis is null' };
        if (!Array.isArray(synthesis.cycles)) return { passed: false, reason: 'SRO_POST_CYCLES_MISSING: cycles is not an array — must be present or confirmed-absent []' };
        for (let i = 0; i < synthesis.cycles.length; i++) {
          const cyc = synthesis.cycles[i] as unknown;
          if (!Array.isArray(cyc)) return { passed: false, reason: `SRO_POST_CYCLES_BAD_ENTRY[${i}]: not an array` };
          if ((cyc as unknown[]).length < 2) return { passed: false, reason: `SRO_POST_CYCLES_TOO_SHORT[${i}]: cycle must have >=2 nodes` };
        }
        if (synthesis.cycles.length === 0) {
          if (synthesis.blastRadius === undefined) return { passed: false, reason: 'SRO_POST_CYCLES_EMPTY_UNCONFIRMED: blastRadius missing so empty not confirmed' };
        }
        return { passed: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { passed: false, reason: `SRO_POST_CYCLES_ERROR: ${msg}` };
      }
    },
  };
  return [blastRadiusPresent, deadCodeListPresent, cyclesCompleted];
}


