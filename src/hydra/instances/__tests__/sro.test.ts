import { describe, test, expect } from 'bun:test';
import { SroSubagentOutputSchema, sroSynthesize, sroSubagentIds, sroSpecs, graphBuilderSpec, pathHunterSpec, deadCodeHunterSpec, cycleHunterSpec, createSroPreGates, createSroPostGates } from '../sro.ts';
import type { GraphifyGraph, SharedMemoryStore, SubagentSettlement } from '../../types.ts';
import type { SroSubagentOutput, SroSynthesis } from '../sro.ts';

function fakeGraph(overrides: Partial<GraphifyGraph> = {}): GraphifyGraph {
  return { nodes: [], edges: [], communities: [], godNodes: [], ...overrides };
}

function chainGraph(): GraphifyGraph {
  return {
    nodes: [
      { id: 'n-a', label: 'A', type: 'file', file: 'src/a.ts', data: {} },
      { id: 'n-b', label: 'B', type: 'file', file: 'src/b.ts', data: {} },
      { id: 'n-c', label: 'C', type: 'file', file: 'src/c.ts', data: {} },
      { id: 'n-d', label: 'D', type: 'file', file: 'src/d.ts', data: {} },
    ],
    edges: [
      { src: 'n-a', dst: 'n-b', relation: 'calls', confidence: 'EXTRACTED' },
      { src: 'n-b', dst: 'n-c', relation: 'imports', confidence: 'EXTRACTED' },
      { src: 'n-c', dst: 'n-d', relation: 'calls', confidence: 'INFERRED' },
    ],
    communities: [],
    godNodes: [],
  };
}

function makeMemory(lasmeCandidates: Array<{ file: string; line: number }> | null, mpseViolations: Array<{ file?: string; line?: number }> | null): SharedMemoryStore {
  return {
    getGateOutput<T>(gateId: string): T | null {
      if (gateId === 'LASME' && lasmeCandidates !== null) {
        return { gateName: 'LASME', synthesis: { candidates: lasmeCandidates }, results: [], telemetry: { durationMs: 100, subagentCount: 6, fulfilledCount: 6, rejectedCount: 0, totalTokensIn: 1000, totalTokensOut: 2000 } } as unknown as T;
      }
      if (gateId === 'MPSE' && mpseViolations !== null) {
        return { gateName: 'MPSE', synthesis: { violations: mpseViolations, conformanceMatrix: mpseViolations.map((v, i) => ({ contractId: `C${i}`, specPath: 'spec.md', specLine: i + 1, implementationStatus: 'violated', file: v.file, line: v.line })) }, results: [], telemetry: { durationMs: 100, subagentCount: 4, fulfilledCount: 4, rejectedCount: 0, totalTokensIn: 1000, totalTokensOut: 2000 } } as unknown as T;
      }
      return null;
    },
    setGateOutput() {},
    persistRun() {},
    getPriorRun() { return null; },
    getChangedFiles() { return []; },
    getGraph() { return null; },
    mergeGraphSlice() {},
    async queryGraph() { return null; },
    backend: 'sqlite',
  };
}

describe('sro — schema', () => {
  test('accepts empty deadCode/cycles', () => {
    const r = SroSubagentOutputSchema.safeParse({ summary: 'ok', deadCode: [], cycles: [] });
    expect(r.success).toBe(true);
  });
  test('accepts impactPaths', () => {
    const r = SroSubagentOutputSchema.safeParse({ summary: 'ok', impactPaths: [{ from: 'src/a.ts:10', to: 'src/b.ts', hops: 1, edgeTypes: ['calls'] }] });
    expect(r.success).toBe(true);
  });
  test('passthrough allows extra fields', () => {
    const r = SroSubagentOutputSchema.safeParse({ summary: 'ok', extra: 'field', deadCode: [] });
    expect(r.success).toBe(true);
  });
});

describe('sro — specs', () => {
  test('4 specs with correct ids', () => {
    expect(sroSpecs.length).toBe(4);
    expect(sroSubagentIds.length).toBe(4);
    expect(sroSpecs.map((s) => s.id).sort()).toEqual([...sroSubagentIds].sort());
    expect(sroSubagentIds).toEqual(['graph-builder', 'path-hunter', 'dead-code-hunter', 'cycle-hunter']);
  });
  test('all specs have 64000/2/60000', () => {
    for (const s of sroSpecs) {
      expect(s.maxTokens).toBe(64000);
      expect(s.maxRounds).toBe(2);
      expect(s.timeout).toBe(60000);
    }
  });
  test('all prompts embed BOTH LASME and MPSE and GRAPH LAW', () => {
    const mem = makeMemory([{ file: 'src/a.ts', line: 10 }], [{ file: 'src/a.ts', line: 10 }]);
    const g = fakeGraph();
    for (const spec of sroSpecs) {
      const prompt = spec.buildSystemPrompt({ targetRoot: '/tmp/t' }, g, mem);
      expect(prompt).toContain("getGateOutput('LASME')");
      expect(prompt).toContain("getGateOutput('MPSE')");
      expect(prompt).toContain('GRAPH TOOLS USAGE LAW');
      expect(prompt).toContain('/tmp/t');
    }
  });
  test('graphQueries per spec match roster', () => {
    expect(graphBuilderSpec.graphQueries).toContain('show all nodes and edges from the merged graph');
    expect(pathHunterSpec.graphQueries!.some((q) => q.includes('5 hops'))).toBe(true);
    expect(deadCodeHunterSpec.graphQueries!.some((q) => q.includes('in-degree 0'))).toBe(true);
    expect(cycleHunterSpec.graphQueries!.some((q) => q.includes('cycles in the import graph'))).toBe(true);
  });
});

describe('sroSynthesize — TRIPLE-CONFIRMED matrix', () => {
  test('tripleConfirmed: lasme+mpse+sro => CRITICAL', async () => {
    const mem = makeMemory([{ file: 'src/a.ts', line: 42 }], [{ file: 'src/a.ts', line: 42 }]);
    const graph = chainGraph();
    const results: SubagentSettlement<SroSubagentOutput>[] = [
      { subagentId: 'dead-code-hunter', status: 'fulfilled', value: { summary: 'none', deadCode: [] } },
      { subagentId: 'cycle-hunter', status: 'fulfilled', value: { summary: 'none', cycles: [] } },
    ];
    const syn = await sroSynthesize(results, graph, mem);
    expect(syn.correlations.length).toBe(1);
    const c = syn.correlations[0]!;
    expect(c.flaggedBy.lasme).toBe(true);
    expect(c.flaggedBy.mpse).toBe(true);
    expect(c.flaggedBy.sro).toBe(true);
    expect(c.tripleConfirmed).toBe(true);
    expect(c.recommendedSeverity).toBe('CRITICAL');
    expect(c.impactPaths.length).toBeGreaterThan(0);
    expect(syn.blastRadius[0]!.downstreamCount).toBeGreaterThan(0);
    expect(syn.blastRadius[0]!.impactPaths[0]!.from).toBe('src/a.ts:42');
  });

  test('two flags => HIGH (lasme+sro, no mpse)', async () => {
    const mem = makeMemory([{ file: 'src/a.ts', line: 10 }], []);
    const graph = chainGraph();
    const syn = await sroSynthesize([], graph, mem);
    expect(syn.correlations.length).toBe(1);
    expect(syn.correlations[0]!.flaggedBy.lasme).toBe(true);
    expect(syn.correlations[0]!.flaggedBy.mpse).toBe(false);
    expect(syn.correlations[0]!.flaggedBy.sro).toBe(true);
    expect(syn.correlations[0]!.tripleConfirmed).toBe(false);
    expect(syn.correlations[0]!.recommendedSeverity).toBe('HIGH');
  });

  test('two flags => HIGH (mpse+sro, no lasme)', async () => {
    const mem = makeMemory([], [{ file: 'src/a.ts', line: 10 }]);
    const graph = chainGraph();
    const syn = await sroSynthesize([], graph, mem);
    expect(syn.correlations[0]!.flaggedBy.lasme).toBe(false);
    expect(syn.correlations[0]!.flaggedBy.mpse).toBe(true);
    expect(syn.correlations[0]!.flaggedBy.sro).toBe(true);
    expect(syn.correlations[0]!.recommendedSeverity).toBe('HIGH');
  });

  test('one flag => MEDIUM (lasme only, no graph impact)', async () => {
    const mem = makeMemory([{ file: 'src/z.ts', line: 99 }], []);
    const graph = fakeGraph();
    const syn = await sroSynthesize([], graph, mem);
    expect(syn.correlations.length).toBe(1);
    expect(syn.correlations[0]!.flaggedBy.lasme).toBe(true);
    expect(syn.correlations[0]!.flaggedBy.sro).toBe(false);
    expect(syn.correlations[0]!.recommendedSeverity).toBe('MEDIUM');
  });

  test('lasme+mpse same site, no graph impact => HIGH (two flags, no sro)', async () => {
    const mem = makeMemory([{ file: 'src/z.ts', line: 5 }], [{ file: 'src/z.ts', line: 5 }]);
    const graph = fakeGraph();
    const syn = await sroSynthesize([], graph, mem);
    expect(syn.correlations[0]!.flaggedBy.lasme).toBe(true);
    expect(syn.correlations[0]!.flaggedBy.mpse).toBe(true);
    expect(syn.correlations[0]!.flaggedBy.sro).toBe(false);
    expect(syn.correlations[0]!.tripleConfirmed).toBe(false);
    expect(syn.correlations[0]!.recommendedSeverity).toBe('HIGH');
  });

  test('blastRadius rows carry impactPaths with hops and edgeTypes', async () => {
    const mem = makeMemory([{ file: 'src/a.ts', line: 1 }], []);
    const graph = chainGraph();
    const syn = await sroSynthesize([], graph, mem);
    const br = syn.blastRadius.find((b) => b.findingId === 'src/a.ts:1')!;
    expect(br).toBeDefined();
    expect(br.impactPaths.length).toBe(3);
    expect(br.impactPaths[0]!.hops).toBe(1);
    expect(br.impactPaths[0]!.edgeTypes).toEqual(['calls']);
    expect(br.impactPaths[1]!.hops).toBe(2);
    expect(br.downstreamCount).toBe(3);
  });

  test('empty findings => empty blastRadius and correlations', async () => {
    const mem = makeMemory([], []);
    const syn = await sroSynthesize([], fakeGraph(), mem);
    expect(syn.blastRadius.length).toBe(0);
    expect(syn.correlations.length).toBe(0);
    expect(syn.deadCode).toEqual([]);
    expect(syn.cycles).toEqual([]);
  });

  test('deadCode and cycles collected from hunter settlements', async () => {
    const mem = makeMemory([], []);
    const results: SubagentSettlement<SroSubagentOutput>[] = [
      { subagentId: 'dead-code-hunter', status: 'fulfilled', value: { summary: 'found', deadCode: [{ file: 'src/dead.ts', symbol: 'unusedFn', kind: 'Function' }] } },
      { subagentId: 'cycle-hunter', status: 'fulfilled', value: { summary: 'found', cycles: [['src/a.ts', 'src/b.ts', 'src/a.ts']] } },
      { subagentId: 'graph-builder', status: 'fulfilled', value: { summary: 'built', graphSlice: { queriedConcepts: ['a'], relevantSubgraph: '{}' } } },
    ];
    const syn = await sroSynthesize(results, fakeGraph(), mem);
    expect(syn.deadCode.length).toBe(1);
    expect(syn.cycles.length).toBe(1);
  });

  test('rejected hunter settlements => empty deadCode/cycles (valid)', async () => {
    const mem = makeMemory([], []);
    const results: SubagentSettlement<SroSubagentOutput>[] = [
      { subagentId: 'dead-code-hunter', status: 'rejected', reason: new Error('timeout') },
      { subagentId: 'cycle-hunter', status: 'rejected', reason: new Error('timeout') },
    ];
    const syn = await sroSynthesize(results, fakeGraph(), mem);
    expect(syn.deadCode).toEqual([]);
    expect(syn.cycles).toEqual([]);
  });

  test('dedupe: same file:line from lasme+mpse yields one correlation', async () => {
    const mem = makeMemory([{ file: 'src/a.ts', line: 10 }], [{ file: 'src/a.ts', line: 10 }]);
    const syn = await sroSynthesize([], fakeGraph(), mem);
    expect(syn.correlations.length).toBe(1);
    expect(syn.blastRadius.length).toBe(1);
  });

  test('concurrent synthesizes do not interfere', async () => {
    const mem1 = makeMemory([{ file: 'src/a.ts', line: 1 }], [{ file: 'src/a.ts', line: 1 }]);
    const mem2 = makeMemory([{ file: 'src/z.ts', line: 99 }], []);
    const g1 = chainGraph();
    const g2 = fakeGraph();
    const [a, b] = await Promise.all([sroSynthesize([], g1, mem1), sroSynthesize([], g2, mem2)]);
    expect(a.correlations[0]!.recommendedSeverity).toBe('CRITICAL');
    expect(b.correlations[0]!.recommendedSeverity).toBe('MEDIUM');
  });

  test('null LASME output treated as no candidates', async () => {
    const mem = makeMemory(null, [{ file: 'src/a.ts', line: 1 }]);
    const syn = await sroSynthesize([], fakeGraph(), mem);
    expect(syn.correlations.length).toBe(1);
    expect(syn.correlations[0]!.flaggedBy.lasme).toBe(false);
  });

  test('boundary: graph with 5-hop limit stops at 5', async () => {
    const nodes = Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, label: `N${i}`, type: 'file', file: `src/f${i}.ts`, data: {} }));
    const edges = Array.from({ length: 6 }, (_, i) => ({ src: `n${i}`, dst: `n${i + 1}`, relation: 'calls', confidence: 'EXTRACTED' as const }));
    const graph = fakeGraph({ nodes, edges });
    const mem = makeMemory([{ file: 'src/f0.ts', line: 1 }], []);
    const syn = await sroSynthesize([], graph, mem);
    const br = syn.blastRadius[0]!;
    expect(br.impactPaths.every((p) => p.hops <= 5)).toBe(true);
    expect(br.downstreamCount).toBe(5);
  });
});

describe('sro — gates', () => {
  test('pre gates: 3 gates', () => {
    expect(createSroPreGates().length).toBe(3);
  });
  test('post gates: 3 gates', () => {
    expect(createSroPostGates().length).toBe(3);
  });
  test('pre: missing LASME fails', async () => {
    const gates = createSroPreGates();
    const lasmeGate = gates.find((g) => g.name === 'sro-pre-lasme-complete')!;
    const mem = makeMemory(null, []);
    const input = { targetRoot: '/tmp/t', specs: ['spec.md'], memory: mem } as unknown as import('../sro.ts').SroGateInput;
    const r = await lasmeGate.check(input);
    expect(r.passed).toBe(false);
  });
  test('pre: merged graph valid passes (>=1 node, >=1 edge)', async () => {
    const gates = createSroPreGates();
    const graphGate = gates.find((g) => g.name === 'sro-pre-merged-graph-valid')!;
    const r1 = await graphGate.check({ targetRoot: '/tmp/t', graph: fakeGraph({ nodes: [{ id: 'n1', label: 'A', type: 'file', file: 'src/a.ts' }], edges: [{ src: 'n1', dst: 'n2', relation: 'calls', confidence: 'EXTRACTED' }] }) } as unknown as import('../sro.ts').SroGateInput);
    expect(r1.passed).toBe(true);
    const r2 = await graphGate.check({ targetRoot: '/tmp/t', graph: fakeGraph({ nodes: [], edges: [] }) } as unknown as import('../sro.ts').SroGateInput);
    expect(r2.passed).toBe(false);
  });
  test('post: valid synthesis passes all', async () => {
    const gates = createSroPostGates();
    const mem = makeMemory([{ file: 'src/a.ts', line: 10 }], [{ file: 'src/a.ts', line: 10 }]);
    const graph = chainGraph();
    const syn = await sroSynthesize([{ subagentId: 'dead-code-hunter', status: 'fulfilled', value: { summary: 'ok', deadCode: [] } }, { subagentId: 'cycle-hunter', status: 'fulfilled', value: { summary: 'ok', cycles: [] } }], graph, mem);
    for (const g of gates) {
      const r = await g.check(syn as SroSynthesis);
      expect(r.passed).toBe(true);
    }
  });
  test('post: deadCode not array fails', async () => {
    const gates = createSroPostGates();
    const deadGate = gates.find((g) => g.name === 'sro-post-dead-code-measured')!;
    const r = await deadGate.check({ blastRadius: [], deadCode: null as unknown as unknown[], cycles: [], correlations: [] } as SroSynthesis);
    expect(r.passed).toBe(false);
  });
  test('post: cycles not array fails', async () => {
    const gates = createSroPostGates();
    const cycGate = gates.find((g) => g.name === 'sro-post-cycles-detected')!;
    const r = await cycGate.check({ blastRadius: [], deadCode: [], cycles: null as unknown as unknown[], correlations: [] } as SroSynthesis);
    expect(r.passed).toBe(false);
  });
  test('post: missing blast entry fails', async () => {
    const gates = createSroPostGates();
    const brGate = gates.find((g) => g.name === 'sro-post-blast-radius-computed')!;
    const r = await brGate.check({ blastRadius: [], deadCode: [], cycles: [], correlations: [{ findingId: 'src/a.ts:10', flaggedBy: { lasme: true, mpse: false, sro: false }, impactPaths: [], tripleConfirmed: false, recommendedSeverity: 'MEDIUM' }] } as SroSynthesis);
    expect(r.passed).toBe(false);
  });
  test('post: empty deadCode/cycles confirmed-empty passes', async () => {
    const gates = createSroPostGates();
    const syn = { blastRadius: [], deadCode: [], cycles: [], correlations: [] } as SroSynthesis;
    for (const g of gates) {
      const r = await g.check(syn);
      expect(r.passed).toBe(true);
    }
  });
});
