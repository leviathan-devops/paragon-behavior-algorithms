import { describe, test, expect } from 'bun:test';
import {
  LayerCandidateSchema,
  SubagentOutputSchema,
  lasmeSynthesize,
  lasmeSubagentIds,
  lasmeSpecs,
  rLexiconSpec,
  rActorSpec,
  rStateMachineSpec,
  rEngineSpec,
  rAdapterSpec,
  rMpseSpec,
  lasmePreGates,
  lasmePostGates,
} from '../lasme.ts';
import type { SubagentSettlement, GraphifyGraph, SharedMemoryStore } from '../../types.ts';
import type { SubagentOutput, LayerCandidate } from '../lasme.ts';

function fakeGraph(): GraphifyGraph {
  return { nodes: [], edges: [], communities: [], godNodes: [] };
}
function fakeMemory(): SharedMemoryStore {
  return {
    setGateOutput: () => {},
    getGateOutput: () => null,
    persistRun: () => {},
    getPriorRun: () => null,
    getChangedFiles: () => [],
    getGraph: () => null,
    mergeGraphSlice: () => {},
    queryGraph: async () => null,
    backend: 'sqlite',
  };
}

function cand(overrides: Partial<LayerCandidate> & { file: string; line: number; layer: string; predicate: string; object: string }): LayerCandidate {
  return {
    subject: 'TestSubject',
    evidence: 'verbatim evidence quote',
    severity: 'MEDIUM',
    confidence: 0.7,
    ...overrides,
  } as LayerCandidate;
}

describe('lasme zod schemas', () => {
  test('LayerCandidateSchema accepts valid candidate', () => {
    const r = LayerCandidateSchema.safeParse({ layer: 'r-lexicon', predicate: 'lexicon.table', subject: 'Foo', object: 'bar', file: '/a/b.ts', line: 10, evidence: 'evidence here' });
    expect(r.success).toBe(true);
  });
  test('LayerCandidateSchema rejects missing evidence', () => {
    const r = LayerCandidateSchema.safeParse({ layer: 'r-lexicon', predicate: 'lexicon.table', subject: 'Foo', object: 'bar', file: '/a/b.ts', line: 10, evidence: '' });
    expect(r.success).toBe(false);
  });
  test('SubagentOutputSchema accepts valid output', () => {
    const r = SubagentOutputSchema.safeParse({ candidates: [], graphSlice: { queriedConcepts: ['foo'], relevantSubgraph: '{}' }, summary: 'none' });
    expect(r.success).toBe(true);
  });
  test('SubagentOutputSchema rejects missing graphSlice', () => {
    const r = SubagentOutputSchema.safeParse({ candidates: [], summary: 'none' } as unknown as Record<string, unknown>);
    expect(r.success).toBe(false);
  });
});

describe('lasmeSubagentIds', () => {
  test('exports 6 distinct ids', () => {
    expect(lasmeSubagentIds.length).toBe(6);
    expect(new Set(lasmeSubagentIds).size).toBe(6);
  });
  test('lasmeSpecs length matches ids', () => {
    expect(lasmeSpecs.length).toBe(6);
    expect(lasmeSpecs.map((s) => s.id).sort()).toEqual([...lasmeSubagentIds].sort());
  });
  test('each spec has maxTokens 64000 maxRounds 2 timeout 60000', () => {
    for (const s of lasmeSpecs) {
      expect(s.maxTokens).toBe(64000);
      expect(s.maxRounds).toBe(2);
      expect(s.timeout).toBe(60000);
    }
  });
  test('each spec graphQueries non-empty', () => {
    for (const s of lasmeSpecs) {
      expect((s.graphQueries ?? []).length).toBeGreaterThan(0);
    }
  });
});

describe('GRAPH TOOLS USAGE LAW in prompts', () => {
  test('all 6 specs contain the law verbatim', () => {
    for (const s of lasmeSpecs) {
      const prompt = s.buildSystemPrompt({ targetPath: '/tmp/test' }, fakeGraph(), fakeMemory());
      expect(prompt).toContain('GRAPH TOOLS USAGE LAW');
    }
  });
  test('direct spec references also contain law', () => {
    for (const s of [rLexiconSpec, rActorSpec, rStateMachineSpec, rEngineSpec, rAdapterSpec, rMpseSpec]) {
      const p = s.buildSystemPrompt({ targetPath: '/tmp/x' }, fakeGraph(), fakeMemory());
      expect(p).toContain('GRAPH TOOLS USAGE LAW');
    }
  });
});

describe('lasmeSynthesize', () => {
  test('empty results -> empty candidates', async () => {
    const res = await lasmeSynthesize([], fakeGraph(), fakeMemory());
    expect(res.candidates.length).toBe(0);
    expect(res.graphSlice).toBeDefined();
  });
  test('rejected settlements are ignored', async () => {
    const fulfilled: SubagentSettlement<SubagentOutput> = {
      subagentId: 'r-lexicon',
      status: 'fulfilled',
      value: { candidates: [cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'obj1', file: '/a.ts', line: 1 })], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: 'one' },
    };
    const rejected: SubagentSettlement<SubagentOutput> = { subagentId: 'r-actor', status: 'rejected', reason: new Error('fail') };
    const res = await lasmeSynthesize([fulfilled, rejected], fakeGraph(), fakeMemory());
    expect(res.candidates.length).toBe(1);
  });
  test('dedupe kills exact duplicate file:line:predicate:object', async () => {
    const c1 = cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'obj1', file: '/a.ts', line: 10 });
    const c2 = cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'obj1', file: '/a.ts', line: 10 });
    const r: SubagentSettlement<SubagentOutput> = { subagentId: 'r-lexicon', status: 'fulfilled', value: { candidates: [c1, c2], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const res = await lasmeSynthesize([r], fakeGraph(), fakeMemory());
    expect(res.candidates.length).toBe(1);
  });
  test('dedupe keeps different predicates at same file:line', async () => {
    const c1 = cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'obj1', file: '/a.ts', line: 10 });
    const c2 = cand({ layer: 'r-mpse', predicate: 'mpse.threshold', object: 'obj1', file: '/a.ts', line: 10 });
    const r1: SubagentSettlement<SubagentOutput> = { subagentId: 'r-lexicon', status: 'fulfilled', value: { candidates: [c1], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const r2: SubagentSettlement<SubagentOutput> = { subagentId: 'r-mpse', status: 'fulfilled', value: { candidates: [c2], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const res = await lasmeSynthesize([r1, r2], fakeGraph(), fakeMemory());
    expect(res.candidates.length).toBe(2);
  });
  test('cross-reference boost at same site: confidence+0.1 and crossReferencedBy', async () => {
    const c1 = cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'objA', file: '/a.ts', line: 42, confidence: 0.7 });
    const c2 = cand({ layer: 'r-mpse', predicate: 'mpse.threshold', object: 'objB', file: '/a.ts', line: 42, confidence: 0.6 });
    const r1: SubagentSettlement<SubagentOutput> = { subagentId: 'r-lexicon', status: 'fulfilled', value: { candidates: [c1], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const r2: SubagentSettlement<SubagentOutput> = { subagentId: 'r-mpse', status: 'fulfilled', value: { candidates: [c2], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const res = await lasmeSynthesize([r1, r2], fakeGraph(), fakeMemory());
    expect(res.candidates.length).toBe(2);
    for (const c of res.candidates) {
      expect(c.crossReferenced).toBe(true);
      expect(c.crossReferencedBy).toBeDefined();
      expect(c.crossReferencedBy!.length).toBe(1);
    }
    const lex = res.candidates.find((c) => c.layer === 'r-lexicon')!;
    expect(lex.confidence).toBeCloseTo(0.8);
    expect(lex.crossReferencedBy).toEqual(['r-mpse']);
    const mpse = res.candidates.find((c) => c.layer === 'r-mpse')!;
    expect(mpse.confidence).toBeCloseTo(0.7);
    expect(mpse.crossReferencedBy).toEqual(['r-lexicon']);
  });
  test('confidence boost caps at 1.0', async () => {
    const c1 = cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'objA', file: '/a.ts', line: 5, confidence: 0.95 });
    const c2 = cand({ layer: 'r-actor', predicate: 'actor.unsubscribed', object: 'objB', file: '/a.ts', line: 5, confidence: 0.95 });
    const r1: SubagentSettlement<SubagentOutput> = { subagentId: 'r-lexicon', status: 'fulfilled', value: { candidates: [c1], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const r2: SubagentSettlement<SubagentOutput> = { subagentId: 'r-actor', status: 'fulfilled', value: { candidates: [c2], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const res = await lasmeSynthesize([r1, r2], fakeGraph(), fakeMemory());
    for (const c of res.candidates) expect(c.confidence).toBe(1.0);
  });
  test('single candidate at site is not cross-referenced', async () => {
    const c1 = cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'objA', file: '/a.ts', line: 99, confidence: 0.5 });
    const r1: SubagentSettlement<SubagentOutput> = { subagentId: 'r-lexicon', status: 'fulfilled', value: { candidates: [c1], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const res = await lasmeSynthesize([r1], fakeGraph(), fakeMemory());
    expect(res.candidates[0].crossReferenced).toBeUndefined();
  });
  test('ranked by severity*confidence descending', async () => {
    const low = cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'o1', file: '/a.ts', line: 1, severity: 'LOW', confidence: 0.9 });
    const crit = cand({ layer: 'r-actor', predicate: 'actor.unsubscribed', object: 'o2', file: '/b.ts', line: 1, severity: 'CRITICAL', confidence: 0.9 });
    const med = cand({ layer: 'r-engine', predicate: 'engine.unguardedWrite', object: 'o3', file: '/c.ts', line: 1, severity: 'MEDIUM', confidence: 0.9 });
    const r: SubagentSettlement<SubagentOutput> = { subagentId: 'r-lexicon', status: 'fulfilled', value: { candidates: [low, med, crit], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const res = await lasmeSynthesize([r], fakeGraph(), fakeMemory());
    expect(res.candidates[0].severity).toBe('CRITICAL');
    expect(res.candidates[1].severity).toBe('MEDIUM');
    expect(res.candidates[2].severity).toBe('LOW');
  });
  test('concurrent synthesizer calls do not interfere', async () => {
    const c = cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'obj', file: '/a.ts', line: 1 });
    const r: SubagentSettlement<SubagentOutput> = { subagentId: 'r-lexicon', status: 'fulfilled', value: { candidates: [c], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const [a, b] = await Promise.all([lasmeSynthesize([r], fakeGraph(), fakeMemory()), lasmeSynthesize([r], fakeGraph(), fakeMemory())]);
    expect(a.candidates.length).toBe(1);
    expect(b.candidates.length).toBe(1);
  });
  test('null value in fulfilled settlement is handled', async () => {
    const r: SubagentSettlement<SubagentOutput> = { subagentId: 'r-lexicon', status: 'fulfilled', value: undefined };
    const res = await lasmeSynthesize([r], fakeGraph(), fakeMemory());
    expect(res.candidates.length).toBe(0);
  });
  test('boundary: confidence exactly 1.0 does not exceed', async () => {
    const c1 = cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'o1', file: '/x.ts', line: 1, confidence: 1.0 });
    const c2 = cand({ layer: 'r-engine', predicate: 'engine.unguardedWrite', object: 'o2', file: '/x.ts', line: 1, confidence: 1.0 });
    const r1: SubagentSettlement<SubagentOutput> = { subagentId: 'r-lexicon', status: 'fulfilled', value: { candidates: [c1], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const r2: SubagentSettlement<SubagentOutput> = { subagentId: 'r-engine', status: 'fulfilled', value: { candidates: [c2], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: '' } };
    const res = await lasmeSynthesize([r1, r2], fakeGraph(), fakeMemory());
    for (const c of res.candidates) expect(c.confidence).toBe(1.0);
  });
});

describe('lasmePreGates / lasmePostGates', () => {
  test('pre-gates return 2 gates', () => {
    expect(lasmePreGates().length).toBe(2);
  });
  test('post-gates return 2 gates', () => {
    expect(lasmePostGates().length).toBe(2);
  });
  test('post-gate passes on valid candidates', async () => {
    const gates = lasmePostGates();
    const target = { candidates: [cand({ layer: 'r-lexicon', predicate: 'lexicon.table', object: 'obj', file: '/a.ts', line: 1 })], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' } };
    for (const g of gates) {
      const r = await g.check(target as unknown as import('../lasme.ts').LasmeSynthesis);
      expect(r.passed).toBe(true);
    }
  });
  test('post-gate fails when evidence missing', async () => {
    const gates = lasmePostGates();
    const bad = { candidates: [{ layer: 'r-lexicon', predicate: 'x', subject: 's', object: 'o', file: '/a.ts', line: 1, evidence: '' }], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' } };
    const r = await gates[0].check(bad as unknown as import('../lasme.ts').LasmeSynthesis);
    expect(r.passed).toBe(false);
  });
  test('post-gate empty candidates passes', async () => {
    const gates = lasmePostGates();
    const target = { candidates: [], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' } };
    for (const g of gates) {
      const r = await g.check(target as unknown as import('../lasme.ts').LasmeSynthesis);
      expect(r.passed).toBe(true);
    }
  });
});
