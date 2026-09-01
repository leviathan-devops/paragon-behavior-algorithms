import { describe, test, expect } from 'bun:test';
import * as z from 'zod';
import { MpseSubagentOutputSchema, mpseSynthesize, contractCheckerSpec, oracleCheckerSpec, stageCheckerSpec, provenanceCheckerSpec, mpseSpecs, mpseSubagentIds, createMpsePreGates, createMpsePostGates } from '../mpse.js';
import type { GraphifyGraph, SharedMemoryStore, SubagentSettlement } from '../../types.js';
import type { MpseSubagentOutput, MpseSynthesis } from '../mpse.js';

function makeMemory(lasmeCandidates: Array<{ file: string; line: number }> | null): SharedMemoryStore {
  return {
    getGateOutput<T>(gateId: string): T | null {
      if (gateId === 'LASME' && lasmeCandidates !== null) {
        return {
          gateName: 'LASME',
          synthesis: { candidates: lasmeCandidates },
          results: [],
          telemetry: { durationMs: 100, subagentCount: 6, fulfilledCount: 6, rejectedCount: 0, totalTokensIn: 1000, totalTokensOut: 2000 },
        } as unknown as T;
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

const emptyGraph = { nodes: [], edges: [], communities: [], godNodes: [] } as unknown as GraphifyGraph;

describe('mpse — schema', () => {
  test('valid conformant entry passes', () => {
    const parsed = MpseSubagentOutputSchema.safeParse({
      conformances: [{ contractId: 'C1', specPath: 'spec.md', specLine: 10, specQuote: 'must do X', implementationStatus: 'conformant', file: 'src/a.ts', line: 5, evidence: 'code' }],
      summary: 'one conformant',
    });
    expect(parsed.success).toBe(true);
  });
  test('empty conformances with summary passes', () => {
    const parsed = MpseSubagentOutputSchema.safeParse({ conformances: [], summary: 'no contracts' });
    expect(parsed.success).toBe(true);
  });
  test('missing summary fails', () => {
    const parsed = MpseSubagentOutputSchema.safeParse({ conformances: [] });
    expect(parsed.success).toBe(false);
  });
  test('invalid status fails', () => {
    const parsed = MpseSubagentOutputSchema.safeParse({
      conformances: [{ contractId: 'C1', specPath: 's.md', specLine: 1, specQuote: 'q', implementationStatus: 'unknown' }],
      summary: 'x',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('mpse — specs', () => {
  test('4 specs with correct ids', () => {
    expect(mpseSpecs.length).toBe(4);
    expect(mpseSubagentIds.length).toBe(4);
    expect(mpseSpecs.map((s) => s.id)).toEqual(['contract-checker', 'oracle-checker', 'stage-checker', 'provenance-checker']);
  });
  test('all specs have 64000/2/60000', () => {
    for (const s of mpseSpecs) {
      expect(s.maxTokens).toBe(64000);
      expect(s.maxRounds).toBe(2);
      expect(s.timeout).toBe(60000);
    }
  });
  test('all prompts embed LASME and GRAPH TOOLS USAGE LAW', () => {
    const mem = makeMemory([{ file: 'src/a.ts', line: 42 }]);
    for (const spec of mpseSpecs) {
      const prompt = spec.buildSystemPrompt({ targetRoot: '/tmp/t', specs: ['spec.md'] }, emptyGraph, mem);
      expect(prompt).toContain("getGateOutput('LASME')");
      expect(prompt).toContain('GRAPH TOOLS USAGE LAW');
      expect(prompt).toContain('/tmp/t');
    }
  });
  test('graphQueries per spec', () => {
    expect(contractCheckerSpec.graphQueries).toContain('trace contract.checkContract() call chains');
    expect(oracleCheckerSpec.graphQueries!.some((q) => q.includes('Math.abs'))).toBe(true);
    expect(stageCheckerSpec.graphQueries!.some((q) => q.includes('pre/post'))).toBe(true);
    expect(provenanceCheckerSpec.graphQueries!.some((q) => q.includes('spec clause'))).toBe(true);
  });
});

describe('mpseSynthesize — happy + adversarial', () => {
  test('lasmeShapeFound true when file+line matches', async () => {
    const mem = makeMemory([{ file: 'src/a.ts', line: 10 }, { file: 'src/b.ts', line: 20 }]);
    const results: SubagentSettlement<MpseSubagentOutput>[] = [
      { subagentId: 'contract-checker', status: 'fulfilled', value: { conformances: [
        { contractId: 'C1', specPath: 'spec.md', specLine: 1, specQuote: 'q1', implementationStatus: 'conformant', file: 'src/a.ts', line: 10, evidence: 'ev' },
        { contractId: 'C2', specPath: 'spec.md', specLine: 2, specQuote: 'q2', implementationStatus: 'violated', file: 'src/c.ts', line: 99, evidence: 'ev2' },
        { contractId: 'C3', specPath: 'spec.md', specLine: 3, specQuote: 'q3', implementationStatus: 'unimplemented' },
      ], summary: '3 contracts' } },
    ];
    const syn = await mpseSynthesize(results, emptyGraph, mem);
    expect(syn.conformanceMatrix.length).toBe(3);
    expect(syn.conformanceMatrix[0]!.lasmeShapeFound).toBe(true);
    expect(syn.conformanceMatrix[1]!.lasmeShapeFound).toBe(false);
    expect(syn.conformanceMatrix[2]!.lasmeShapeFound).toBe(false);
    expect(syn.violations.length).toBe(1);
    expect(syn.violations[0]!.contractId).toBe('C2');
    expect(syn.traceGaps.length).toBe(1);
    expect(syn.traceGaps[0]!.contractId).toBe('C3');
    expect(syn.conformanceMatrix.every((r) => r.verificationAgent === 'contract-checker')).toBe(true);
  });

  test('file-only mismatch does not count as lasmeShapeFound (needs file+line)', async () => {
    const mem = makeMemory([{ file: 'src/a.ts', line: 10 }]);
    const results: SubagentSettlement<MpseSubagentOutput>[] = [
      { subagentId: 'oracle-checker', status: 'fulfilled', value: { conformances: [
        { contractId: 'C1', specPath: 'spec.md', specLine: 5, specQuote: 'q', implementationStatus: 'conformant', file: 'src/a.ts', line: 99 },
      ], summary: 'one' } },
    ];
    const syn = await mpseSynthesize(results, emptyGraph, mem);
    expect(syn.conformanceMatrix[0]!.lasmeShapeFound).toBe(false);
  });

  test('empty results → empty matrix', async () => {
    const mem = makeMemory([]);
    const syn = await mpseSynthesize([], emptyGraph, mem);
    expect(syn.conformanceMatrix.length).toBe(0);
    expect(syn.violations.length).toBe(0);
    expect(syn.traceGaps.length).toBe(0);
  });

  test('null LASME output → lasmeShapeFound always false', async () => {
    const mem = makeMemory(null);
    const results: SubagentSettlement<MpseSubagentOutput>[] = [
      { subagentId: 'stage-checker', status: 'fulfilled', value: { conformances: [
        { contractId: 'C1', specPath: 'spec.md', specLine: 1, specQuote: 'q', implementationStatus: 'conformant', file: 'src/x.ts', line: 1 },
      ], summary: 's' } },
    ];
    const syn = await mpseSynthesize(results, emptyGraph, mem);
    expect(syn.conformanceMatrix[0]!.lasmeShapeFound).toBe(false);
  });

  test('rejected settlement skipped', async () => {
    const mem = makeMemory([]);
    const results: SubagentSettlement<MpseSubagentOutput>[] = [
      { subagentId: 'contract-checker', status: 'rejected', reason: new Error('timeout') },
      { subagentId: 'provenance-checker', status: 'fulfilled', value: { conformances: [
        { contractId: 'C9', specPath: 'spec.md', specLine: 9, specQuote: 'q', implementationStatus: 'conformant', file: 'src/y.ts', line: 2 },
      ], summary: 'one' } },
    ];
    const syn = await mpseSynthesize(results, emptyGraph, mem);
    expect(syn.conformanceMatrix.length).toBe(1);
    expect(syn.conformanceMatrix[0]!.verificationAgent).toBe('provenance-checker');
  });

  test('multiple agents produce multiple rows with correct verificationAgent', async () => {
    const mem = makeMemory([]);
    const results: SubagentSettlement<MpseSubagentOutput>[] = [
      { subagentId: 'contract-checker', status: 'fulfilled', value: { conformances: [{ contractId: 'C1', specPath: 's.md', specLine: 1, specQuote: 'q', implementationStatus: 'conformant' }], summary: 'a' } },
      { subagentId: 'oracle-checker', status: 'fulfilled', value: { conformances: [{ contractId: 'C2', specPath: 's.md', specLine: 2, specQuote: 'q', implementationStatus: 'violated' }], summary: 'b' } },
    ];
    const syn = await mpseSynthesize(results, emptyGraph, mem);
    expect(syn.conformanceMatrix.length).toBe(2);
    expect(syn.conformanceMatrix.map((r) => r.verificationAgent).sort()).toEqual(['contract-checker', 'oracle-checker']);
    expect(syn.violations.length).toBe(1);
  });

  test('concurrent synthesizes do not interfere', async () => {
    const mem = makeMemory([{ file: 'src/a.ts', line: 1 }]);
    const r1: SubagentSettlement<MpseSubagentOutput>[] = [
      { subagentId: 'contract-checker', status: 'fulfilled', value: { conformances: [{ contractId: 'C1', specPath: 's.md', specLine: 1, specQuote: 'q', implementationStatus: 'conformant', file: 'src/a.ts', line: 1 }], summary: 's' } },
    ];
    const r2: SubagentSettlement<MpseSubagentOutput>[] = [
      { subagentId: 'oracle-checker', status: 'fulfilled', value: { conformances: [{ contractId: 'C2', specPath: 's.md', specLine: 2, specQuote: 'q', implementationStatus: 'violated', file: 'src/b.ts', line: 2 }], summary: 's' } },
    ];
    const [a, b] = await Promise.all([mpseSynthesize(r1, emptyGraph, mem), mpseSynthesize(r2, emptyGraph, mem)]);
    expect(a.conformanceMatrix[0]!.lasmeShapeFound).toBe(true);
    expect(b.conformanceMatrix[0]!.lasmeShapeFound).toBe(false);
  });
});

describe('mpse — gates', () => {
  test('pre gates: spec empty fails, non-empty passes', async () => {
    const gates = createMpsePreGates();
    expect(gates.length).toBe(2);
    const specGate = gates.find((g) => g.name === 'mpse-pre-spec-contracts-parse')!;
    const r1 = await specGate.check({ targetRoot: '/tmp/t', specs: [] });
    expect(r1.passed).toBe(false);
    const r2 = await specGate.check({ targetRoot: '/tmp/t', specs: ['spec.md'] });
    expect(r2.passed).toBe(true);
    const r3 = await specGate.check({ targetRoot: '/tmp/t', specs: [''] });
    expect(r3.passed).toBe(false);
  });
  test('post gates: empty matrix fails, valid passes', async () => {
    const gates = createMpsePostGates();
    expect(gates.length).toBe(2);
    const compGate = gates.find((g) => g.name === 'mpse-post-conformance-complete')!;
    const r1 = await compGate.check({ conformanceMatrix: [], violations: [], traceGaps: [] } as MpseSynthesis);
    expect(r1.passed).toBe(false);
    const r2 = await compGate.check({ conformanceMatrix: [{ contractId: 'C1', specPath: 's.md', specLine: 1, implementationStatus: 'conformant', verificationAgent: 'contract-checker', lasmeShapeFound: false }], violations: [], traceGaps: [] } as MpseSynthesis);
    expect(r2.passed).toBe(true);
  });
  test('post traceGaps gate: gap missing specPath fails', async () => {
    const gates = createMpsePostGates();
    const gapGate = gates.find((g) => g.name === 'mpse-post-trace-gaps-named')!;
    const bad = { conformanceMatrix: [{ contractId: 'C1', specPath: 's.md', specLine: 1, implementationStatus: 'unimplemented', verificationAgent: 'a', lasmeShapeFound: false }], violations: [], traceGaps: [{ contractId: 'C1', specPath: '', specLine: 0, implementationStatus: 'unimplemented', verificationAgent: 'a', lasmeShapeFound: false }] } as unknown as MpseSynthesis;
    const r1 = await gapGate.check(bad);
    expect(r1.passed).toBe(false);
    const good = { conformanceMatrix: [{ contractId: 'C1', specPath: 's.md', specLine: 5, implementationStatus: 'unimplemented', verificationAgent: 'a', lasmeShapeFound: false }], violations: [], traceGaps: [{ contractId: 'C1', specPath: 's.md', specLine: 5, implementationStatus: 'unimplemented', verificationAgent: 'a', lasmeShapeFound: false }] } as MpseSynthesis;
    const r2 = await gapGate.check(good);
    expect(r2.passed).toBe(true);
  });
  test('post gaps empty passes', async () => {
    const gates = createMpsePostGates();
    const gapGate = gates.find((g) => g.name === 'mpse-post-trace-gaps-named')!;
    const r = await gapGate.check({ conformanceMatrix: [{ contractId: 'C1', specPath: 's.md', specLine: 1, implementationStatus: 'conformant', verificationAgent: 'a', lasmeShapeFound: false }], violations: [], traceGaps: [] } as MpseSynthesis);
    expect(r.passed).toBe(true);
  });
});
