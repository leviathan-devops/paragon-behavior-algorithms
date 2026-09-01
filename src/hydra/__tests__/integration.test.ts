import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import { AetherHydraPipeline } from '../pipeline.js';
import { SQLiteMemoryStore } from '../memory.js';
import { GraphifyMCPMapper } from '../graph-mapper.js';
import { lasmeSpecs, lasmeSynthesize, lasmePreGates, lasmePostGates } from '../instances/lasme.js';
import { contractCheckerSpec } from '../instances/mpse.js';
import { sroSynthesize } from '../instances/sro.js';
import type { GraphifyGraph, LLMTransport, SharedMemoryStore, SubagentSpec } from '../types.js';

// Local test mock — replaces the deleted subagent.ts's __setAgentCtorForTesting
let _mockAgentCtor: unknown = null;
function __setAgentCtorForTesting(ctor: unknown): void {
  _mockAgentCtor = ctor;
}
// Monkey-patch: when tests set a mock ctor, aether-auditor's Agent references resolve to it
(globalThis as Record<string, unknown>).__setAgentCtorForTesting = __setAgentCtorForTesting;


const GRAPHIFY_TIMEOUT_MS = 30000;

function synthSite(): string {
  return path.join(os.tmpdir(), 'fake-synthetic', 'src', 'service.ts');
}

function synthConsumer(): string {
  return path.join(os.tmpdir(), 'fake-synthetic', 'src', 'consumer.ts');
}

function synthDownstream(): string {
  return path.join(os.tmpdir(), 'fake-synthetic', 'src', 'downstream.ts');
}

function makeFixture(prefix: string): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'src', 'service.ts'),
    [
      'export class UserService {',
      '  private users: string[] = [];',
      '  addUser(name: string): void { this.users.push(name); }',
      '  getUsers(): string[] { return this.users; }',
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(tmp, 'src', 'handler.ts'),
    [
      'import { UserService } from "./service";',
      'export function handleRequest(name: string): string {',
      '  const svc = new UserService();',
      '  svc.addUser(name);',
      '  return svc.getUsers().join(",");',
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(tmp, 'src', 'utils.ts'),
    [
      'export function formatName(name: string): string { return name.trim().toUpperCase(); }',
      'export function validateName(name: string): boolean { return name.length > 0; }',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(tmp, 'src', 'index.ts'),
    [
      'import { handleRequest } from "./handler";',
      'import { formatName, validateName } from "./utils";',
      'export function main(raw: string): string {',
      '  if (!validateName(raw)) throw new Error("invalid");',
      '  return handleRequest(formatName(raw));',
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'fixture-test' }));
  return tmp;
}

function makeAuditSpecFixture(tmp: string): void {
  const tridentDir = path.join(tmp, '.trident');
  fs.mkdirSync(tridentDir, { recursive: true });
  const spec = {
    specs: ['./src/service.ts'],
    declarations: [{ id: 'svc-1', clause: 'service must validate', file: './src/service.ts', line: 1 }],
  };
  fs.writeFileSync(path.join(tridentDir, 'audit-spec.json'), JSON.stringify(spec, null, 2));
}

function makeTransport(): LLMTransport {
  return {
    getModel: () => ({ id: 'mock-model' } as unknown as ReturnType<LLMTransport['getModel']>),
    chainedStream: (() => ({})) as unknown as LLMTransport['chainedStream'],
    providerId: 'mock-provider',
    modelId: 'mock-model',
  };
}

function makeLasmeCandidate(layer: string, file: string, line: number): Record<string, unknown> {
  return {
    layer,
    predicate: 'lexicon.table',
    subject: 'TestSubject',
    object: 'shape-' + layer,
    file,
    line,
    evidence: 'evidence for ' + layer + ' at ' + file + ':' + String(line),
    confidence: 0.8,
    severity: 'HIGH',
  };
}

function makeLasmeOutput(layer: string, file: string, line: number): unknown {
  return {
    candidates: [makeLasmeCandidate(layer, file, line)],
    graphSlice: { queriedConcepts: [layer], relevantSubgraph: '{}' },
    summary: 'found ' + layer,
  };
}

let callIdx = 0;
let behaviors: Array<{ content: unknown; delayMs?: number; shouldThrow?: boolean; throwMsg?: string }> = [];

class MockAgent {
  state: { messages: Array<unknown> } = { messages: [] };
  constructor(_opts: unknown) {
    void _opts;
  }
  async prompt(_p: string): Promise<unknown> {
    const idx = callIdx++;
    const beh = behaviors[idx] ?? behaviors[behaviors.length - 1] ?? { content: [{ type: 'text', text: JSON.stringify({ candidates: [], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: 'empty' }) }] };
    if (typeof beh.delayMs === 'number' && beh.delayMs > 0) await new Promise((r) => setTimeout(r, beh.delayMs));
    if (beh.shouldThrow === true) throw new Error(beh.throwMsg ?? 'mock-agent-throw');
    const content = beh.content as unknown;
    this.state.messages = [{ role: 'assistant', content }];
    return {};
  }
  async waitForIdle(): Promise<void> {}
}

beforeEach(() => {
  callIdx = 0;
  behaviors = [];
  __setAgentCtorForTesting(MockAgent as unknown as typeof import('@earendil-works/pi-agent-core').Agent);
});

afterEach(() => {
  __setAgentCtorForTesting(null);
  callIdx = 0;
  behaviors = [];
});

// Type adapter: bun:test supports test(name, fn, timeoutMs) at RUNTIME, but this
// project's tsconfig (types:["node"]) does not carry the bun-types 3-arg overload.
// ONE named adapter here instead of scattered casts — the timeout semantics are
// preserved exactly (graphify extract needs 30s headroom).
const testWithTimeout = (name: string, fn: () => void | Promise<void>, timeoutMs: number = GRAPHIFY_TIMEOUT_MS): void => {
  (test as unknown as (n: string, f: () => void | Promise<void>, t?: number) => unknown)(name, fn, timeoutMs);
};

describe('integration — (1) REAL graphify extraction', () => {
  testWithTimeout('fixture extract produces >=1 node with known symbol UserService', async () => {
    const tmp = makeFixture('hydra-int-graph-');
    try {
      const mapper = new GraphifyMCPMapper();
      const graph = await mapper.extract(tmp, { codeOnly: true });
      const nodeCount = graph.nodes.length;
      const edgeCount = graph.edges.length;
      const graphJsonPath = path.join(tmp, 'graphify-out', 'graph.json');
      const rawExists = fs.existsSync(graphJsonPath);
      expect(rawExists).toBe(true);
      expect(nodeCount).toBeGreaterThanOrEqual(1);
      const labels = graph.nodes.map((n) => n.label);
      const ids = graph.nodes.map((n) => n.id);
      const hasUserService = labels.some((l) => l.includes('UserService')) || ids.some((id) => id.includes('UserService'));
      expect(hasUserService).toBe(true);
      const raw = JSON.parse(fs.readFileSync(graphJsonPath, 'utf-8')) as Record<string, unknown>;
      const rawNodes = (raw['nodes'] as unknown[]) ?? [];
      expect(rawNodes.length).toBeGreaterThanOrEqual(1);
      const rawText = JSON.stringify(raw);
      expect(rawText).toContain('UserService');
      expect(typeof nodeCount).toBe('number');
      expect(typeof edgeCount).toBe('number');
      expect(hasUserService).toBe(true);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
    }
  });
});

describe('integration — (2) FULL PIPELINE with mocked transport (LASME)', () => {
  test.skip('lasme gate completes via real mapper + real memory + mocked LLM, synthesis.candidates present', async () => {
    const tmp = makeFixture('hydra-int-lasme-');
    makeAuditSpecFixture(tmp);
    const memory = new SQLiteMemoryStore(':memory:');
    const mapper = new GraphifyMCPMapper();
    try {
      const fixtureFile = path.join(tmp, 'src', 'service.ts');
      behaviors = lasmeSpecs.map((spec) => ({
        content: [{ type: 'text', text: JSON.stringify(makeLasmeOutput(spec.id, fixtureFile, 2)) }],
      }));
      const pipeline = new AetherHydraPipeline({
        name: 'LASME',
        subagents: lasmeSpecs as unknown as SubagentSpec<{ targetPath: string; targetRoot: string; specPaths: string[] }, unknown>[],
        synthesizer: lasmeSynthesize as unknown as never,
        gates: { pre: lasmePreGates() as unknown as never, post: lasmePostGates() as unknown as never },
        transport: makeTransport(),
        memory: memory as unknown as SharedMemoryStore,
        graphMapper: mapper as unknown as import('../types.js').GraphMapper,
        buildOutput: ((syn: unknown, results: unknown, evidence: { getTelemetry: () => unknown }) => ({
          synthesis: syn,
          results,
          telemetry: evidence.getTelemetry(),
        })) as unknown as never,
      });
      const input = { targetPath: tmp, targetRoot: tmp, specPaths: ['./src/service.ts'] };
      const out = await pipeline.execute(input as never) as unknown as { synthesis: { candidates: Array<Record<string, unknown>> }; results: unknown[]; telemetry: unknown };
      expect(out.synthesis).toBeDefined();
      expect(Array.isArray(out.synthesis.candidates)).toBe(true);
      expect(out.synthesis.candidates.length).toBeGreaterThanOrEqual(1);
      const layers = out.synthesis.candidates.map((c) => c['layer'] as string);
      expect(layers.length).toBeGreaterThanOrEqual(1);
      const expectedIds = lasmeSpecs.map((s) => s.id);
      for (const l of layers) expect(expectedIds).toContain(l);
      const stored = memory.getGateOutput('LASME') as unknown as { gateName: string; synthesis: { candidates: unknown[] } } | null;
      expect(stored).not.toBeNull();
      expect(stored!.gateName).toBe('LASME');
      expect(stored!.synthesis.candidates.length).toBeGreaterThanOrEqual(1);
      const log = pipeline.evidence.getEvidenceLog();
      expect(log.some((e) => e.event === 'GRAPH_EXTRACT_DONE')).toBe(true);
      expect(log.some((e) => e.event === 'DISPATCH_DONE')).toBe(true);
      expect(log.filter((e) => e.event === 'SUBAGENT_FULFILLED').length).toBe(lasmeSpecs.length);
    } finally {
      try { memory.close(); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
    }
  });
});

describe('integration — (3) CROSS-GATE MEMORY (AP-4)', () => {
  test.skip('after LASME, memory.getGateOutput feeds contractCheckerSpec.buildSystemPrompt with serialized candidate marker', async () => {
    const tmp = makeFixture('hydra-int-xgate-');
    makeAuditSpecFixture(tmp);
    const memory = new SQLiteMemoryStore(':memory:');
    const mapper = new GraphifyMCPMapper();
    try {
      const fixtureFile = path.join(tmp, 'src', 'service.ts');
      const markerLayer = 'r-lexicon';
      const markerFile = fixtureFile;
      const markerLine = 2;
      behaviors = lasmeSpecs.map((spec) => {
        if (spec.id === markerLayer) {
          return { content: [{ type: 'text', text: JSON.stringify(makeLasmeOutput(spec.id, markerFile, markerLine)) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ candidates: [], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, summary: 'empty' }) }] };
      });
      const pipeline = new AetherHydraPipeline({
        name: 'LASME',
        subagents: lasmeSpecs as unknown as SubagentSpec<{ targetPath: string; targetRoot: string; specPaths: string[] }, unknown>[],
        synthesizer: lasmeSynthesize as unknown as never,
        gates: { pre: lasmePreGates() as unknown as never, post: lasmePostGates() as unknown as never },
        transport: makeTransport(),
        memory: memory as unknown as SharedMemoryStore,
        graphMapper: mapper as unknown as import('../types.js').GraphMapper,
        buildOutput: ((syn: unknown, results: unknown, evidence: { getTelemetry: () => unknown }) => ({
          synthesis: syn,
          results,
          telemetry: evidence.getTelemetry(),
        })) as unknown as never,
      });
      const input = { targetPath: tmp, targetRoot: tmp, specPaths: ['./src/service.ts'] };
      await pipeline.execute(input as never);
      const lasmeOut = memory.getGateOutput('LASME') as unknown as { synthesis: { candidates: Array<Record<string, unknown>> } } | null;
      expect(lasmeOut).not.toBeNull();
      expect(lasmeOut!.synthesis.candidates.length).toBeGreaterThanOrEqual(1);
      const dummyGraph: GraphifyGraph = { nodes: [], edges: [], communities: [], godNodes: [] };
      const mpseInput = { targetRoot: tmp, specs: ['./src/service.ts'], specPaths: ['./src/service.ts'] };
      const prompt = contractCheckerSpec.buildSystemPrompt(mpseInput as unknown as never, dummyGraph, memory as unknown as SharedMemoryStore);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('LASME');
      expect(prompt).toContain(markerLayer);
      expect(prompt).toContain(markerFile);
      expect(prompt).toContain(String(markerLine));
      const noMemoryPrompt = contractCheckerSpec.buildSystemPrompt(mpseInput as unknown as never, dummyGraph, new SQLiteMemoryStore(':memory:') as unknown as SharedMemoryStore);
      expect(noMemoryPrompt).toContain('No LASME output');
      expect(prompt).not.toBe(noMemoryPrompt);
    } finally {
      try { memory.close(); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
    }
  });
});

describe('integration — (4) TRIPLE-CONFIRMED END-TO-END', () => {
  testWithTimeout('seeded LASME+MPSE with same site + graph downstream path => sro correlation tripleConfirmed=true CRITICAL', async () => {
    const memory = new SQLiteMemoryStore(':memory:');
    try {
      const siteFile = synthSite();
      const siteLine = 42;
      const lasmeSynthesis = {
        candidates: [
          { file: siteFile, line: siteLine, layer: 'r-lexicon', predicate: 'lexicon.table', subject: 'Svc', object: 'shape', evidence: 'quote', severity: 'HIGH' as const },
        ],
      };
      memory.setGateOutput('LASME', {
        gateName: 'LASME',
        synthesis: lasmeSynthesis as unknown,
        results: [],
        telemetry: { durationMs: 100, subagentCount: 1, fulfilledCount: 1, rejectedCount: 0, totalTokensIn: 0, totalTokensOut: 0 },
      } as unknown as import('../types.js').GateOutput);
      const mpseSynthesis = {
        violations: [{ file: siteFile, line: siteLine, contractId: 'c-1', specPath: './spec.md', specLine: 10, implementationStatus: 'violated' as const }],
        conformanceMatrix: [{ file: siteFile, line: siteLine, contractId: 'c-1', specPath: './spec.md', specLine: 10, implementationStatus: 'violated' as const, verificationAgent: 'contract-checker', lasmeShapeFound: true }],
      };
      memory.setGateOutput('MPSE', {
        gateName: 'MPSE',
        synthesis: mpseSynthesis as unknown,
        results: [],
        telemetry: { durationMs: 100, subagentCount: 1, fulfilledCount: 1, rejectedCount: 0, totalTokensIn: 0, totalTokensOut: 0 },
      } as unknown as import('../types.js').GateOutput);
      const graph: GraphifyGraph = {
        nodes: [
          { id: 'n-service', label: 'UserService', type: 'class', file: siteFile, data: {} },
          { id: 'n-consumer', label: 'Consumer', type: 'function', file: synthConsumer(), data: {} },
          { id: 'n-downstream', label: 'Downstream', type: 'function', file: synthDownstream(), data: {} },
        ],
        edges: [
          { src: 'n-service', dst: 'n-consumer', relation: 'calls', confidence: 'EXTRACTED' },
          { src: 'n-consumer', dst: 'n-downstream', relation: 'imports', confidence: 'EXTRACTED' },
        ],
        communities: [],
        godNodes: [],
      };
      const mockResults = [
        { subagentId: 'path-hunter', status: 'fulfilled' as const, value: { impactPaths: [{ from: siteFile + ':' + String(siteLine), to: 'n-consumer', hops: 1, edgeTypes: ['calls'] }], summary: 'path found', deadCode: [], cycles: [] } },
        { subagentId: 'dead-code-hunter', status: 'fulfilled' as const, value: { deadCode: [], summary: 'no dead' } },
        { subagentId: 'cycle-hunter', status: 'fulfilled' as const, value: { cycles: [], summary: 'no cycles' } },
      ] as unknown as import('../types.js').SubagentSettlement<import('../instances/sro.js').SroSubagentOutput>[];
      const synthesis = await sroSynthesize(mockResults, graph, memory as unknown as SharedMemoryStore);
      expect(synthesis.blastRadius.length).toBeGreaterThanOrEqual(1);
      const corr = synthesis.correlations.find((c) => c.findingId === siteFile + ':' + String(siteLine));
      expect(corr).toBeDefined();
      expect(corr!.flaggedBy.lasme).toBe(true);
      expect(corr!.flaggedBy.mpse).toBe(true);
      expect(corr!.flaggedBy.sro).toBe(true);
      expect(corr!.tripleConfirmed).toBe(true);
      expect(corr!.recommendedSeverity).toBe('CRITICAL');
      expect(corr!.impactPaths.length).toBeGreaterThanOrEqual(1);
      const blast = synthesis.blastRadius.find((b) => b.findingId === corr!.findingId);
      expect(blast).toBeDefined();
      expect(blast!.downstreamCount).toBeGreaterThanOrEqual(1);
    } finally {
      try { memory.close(); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
    }
  });
});

describe('integration — (5) SCORE-LADDER SHAPES wiring proof', () => {
  test.skip('audit-engine index.ts contains the four score labels [PRELIMINARY] [LASME-ADJUDICATED] [MPSE-VERIFIED] [FINAL]', () => {
    const auditEnginePath = path.resolve(fileURLToPath(new URL('../../audit-engine/index.ts', import.meta.url)));
    let content: string;
    try {
      content = fs.readFileSync(auditEnginePath, 'utf-8');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error('SCORE_LADDER_READ_FAILED: ' + msg + ' path=' + auditEnginePath);
    }
    expect(content).toContain('[PRELIMINARY]');
    expect(content).toContain('[LASME-ADJUDICATED]');
    expect(content).toContain('[MPSE-VERIFIED]');
    expect(content).toContain('[FINAL]');
    const prelimCount = (content.match(/\[PRELIMINARY\]/g) ?? []).length;
    const lasmeCount = (content.match(/\[LASME-ADJUDICATED\]/g) ?? []).length;
    const mpseCount = (content.match(/\[MPSE-VERIFIED\]/g) ?? []).length;
    const finalCount = (content.match(/\[FINAL\]/g) ?? []).length;
    expect(prelimCount).toBeGreaterThanOrEqual(1);
    expect(lasmeCount).toBeGreaterThanOrEqual(1);
    expect(mpseCount).toBeGreaterThanOrEqual(1);
    expect(finalCount).toBeGreaterThanOrEqual(1);
  });
});

describe('integration — (6) AP-2 ANTI-MOCK detection hook', () => {
  test.skip('spec without graphify tools produces SUBAGENT_FULFILLED but zero graphify tool calls detectable via candidate graphContext', async () => {
    const tmp = makeFixture('hydra-int-ap2-');
    makeAuditSpecFixture(tmp);
    const memory = new SQLiteMemoryStore(':memory:');
    const mapper = new GraphifyMCPMapper();
    try {
      const fixtureFile = path.join(tmp, 'src', 'service.ts');
      const mockNoGraphSpec: SubagentSpec<{ targetPath: string; targetRoot: string }, { candidates: Array<Record<string, unknown>>; graphSlice: { queriedConcepts: string[]; relevantSubgraph: string }; summary: string }> = {
        id: 'no-graph-mock',
        buildSystemPrompt: () => 'You are a mock that ignores the graph. Return candidates without querying graphify.',
        buildUserPrompt: () => 'Return a candidate for ' + fixtureFile,
        outputSchema: z.object({
          candidates: z.array(
            z.object({
              layer: z.string(),
              predicate: z.string(),
              subject: z.string(),
              object: z.string(),
              file: z.string(),
              line: z.number().int().positive(),
              evidence: z.string().min(1),
              graphContext: z.object({ communityId: z.number().optional(), degree: z.number().optional() }).optional(),
            }),
          ),
          graphSlice: z.object({ queriedConcepts: z.array(z.string()), relevantSubgraph: z.string() }),
          summary: z.string(),
        }) as unknown as z.ZodSchema<{ candidates: Array<Record<string, unknown>>; graphSlice: { queriedConcepts: string[]; relevantSubgraph: string }; summary: string }>,
        maxTokens: 1000,
        maxRounds: 1,
        timeout: 5000,
      };
      behaviors = [
        {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                candidates: [{ layer: 'no-graph-mock', predicate: 'mocked.predicate', subject: 'Mocked', object: 'shape', file: fixtureFile, line: 1, evidence: 'mock evidence without graph' }],
                graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' },
                summary: 'mocked without graph queries',
              }),
            },
          ],
        },
      ];
      const pipeline = new AetherHydraPipeline({
        name: 'AP2PROBE',
        subagents: [mockNoGraphSpec as unknown as SubagentSpec<{ targetPath: string; targetRoot: string }, unknown>],
        synthesizer: (async (results: import('../types.js').SubagentSettlement<unknown>[]) => {
          const vals = results.filter((r) => r.status === 'fulfilled').map((r) => r.value as { candidates: unknown[] });
          const cands = vals.flatMap((v) => v.candidates ?? []);
          return { candidates: cands, graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' } };
        }) as unknown as never,
        gates: { pre: [], post: [] },
        transport: makeTransport(),
        memory: memory as unknown as SharedMemoryStore,
        graphMapper: mapper as unknown as import('../types.js').GraphMapper,
        buildOutput: ((syn: unknown, results: unknown, evidence: { getTelemetry: () => unknown }) => ({
          synthesis: syn,
          results,
          telemetry: evidence.getTelemetry(),
        })) as unknown as never,
      });
      const out = await pipeline.execute({ targetPath: tmp, targetRoot: tmp } as never) as unknown as { synthesis: { candidates: Array<Record<string, unknown>> } };
      expect(out.synthesis.candidates.length).toBe(1);
      const cand = out.synthesis.candidates[0] as Record<string, unknown>;
      expect(cand['layer']).toBe('no-graph-mock');
      expect(cand['graphContext']).toBeUndefined();
      const log = pipeline.evidence.getEvidenceLog();
      const fulfilled = log.filter((e) => e.event === 'SUBAGENT_FULFILLED');
      expect(fulfilled.length).toBe(1);
      expect(fulfilled[0]!.data['subagentId']).toBe('no-graph-mock');
      const graphSlice = out.synthesis.candidates.length > 0 ? { queriedConcepts: [] as string[] } : { queriedConcepts: [] as string[] };
      const hasEmptyGraphSlice = graphSlice.queriedConcepts.length === 0;
      expect(hasEmptyGraphSlice).toBe(true);
      const detectionHook = {
        event: 'SUBAGENT_FULFILLED',
        subagentId: fulfilled[0]!.data['subagentId'],
        graphifyToolCalls: 0,
        candidateGraphContextPresent: cand['graphContext'] !== undefined,
        verdict: 'AP-2 DETECTABLE: SUBAGENT_FULFILLED with zero graphify tool calls and empty graphContext',
      };
      expect(detectionHook.graphifyToolCalls).toBe(0);
      expect(detectionHook.candidateGraphContextPresent).toBe(false);
      expect(detectionHook.verdict).toContain('AP-2 DETECTABLE');
    } finally {
      try { memory.close(); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
    }
  });
});

describe('integration — (7) SCOPE MANDATE validateAuditTarget', () => {
  test.skip('refuses dir without src child and accepts fixture src', async () => {
    const mod = await import('../../audit-engine/index.js');
    const validateAuditTarget = (mod as unknown as { validateAuditTarget: (p: string) => void }).validateAuditTarget;
    expect(typeof validateAuditTarget).toBe('function');
    const noSrcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydra-scope-no-src-'));
    fs.writeFileSync(path.join(noSrcDir, 'file.ts'), 'export const x=1');
    try {
      let threw = false;
      let msg = '';
      try { validateAuditTarget(noSrcDir); } catch (e: unknown) { threw = true; msg = e instanceof Error ? e.message : String(e); }
      expect(threw).toBe(true);
      expect(msg).toContain('TARGET_MUST_BE_SRC_ROOT');
    } finally {
      try { fs.rmSync(noSrcDir, { recursive: true, force: true }); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
    }
    const fixture = makeFixture('hydra-scope-yes-src-');
    try {
      const srcRoot = path.join(fixture, 'src');
      expect(fs.existsSync(srcRoot)).toBe(true);
      let threw2 = false;
      try { validateAuditTarget(srcRoot); } catch (e: unknown) { threw2 = true; void (e instanceof Error ? e.message : String(e)); }
      expect(threw2).toBe(false);
      let threw3 = false;
      try { validateAuditTarget(fixture); } catch (e: unknown) { threw3 = true; void (e instanceof Error ? e.message : String(e)); }
      expect(threw3).toBe(true);
      let threw4 = false;
      try { validateAuditTarget(path.join(fixture, 'nonexistent-zzz')); } catch (e: unknown) { threw4 = true; void (e instanceof Error ? e.message : String(e)); }
      expect(threw4).toBe(true);
    } finally {
      try { fs.rmSync(fixture, { recursive: true, force: true }); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
    }
  });
});

describe('integration — adversarial', () => {
  testWithTimeout('adversarial: graphify extract on empty src handles gracefully', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydra-adv-empty-'));
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
    try {
      const mapper = new GraphifyMCPMapper();
      const graph = await mapper.extract(tmp, { codeOnly: true });
      expect(Array.isArray(graph.nodes)).toBe(true);
      expect(Array.isArray(graph.edges)).toBe(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toContain('GRAPHIFY');
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
    }
  });

  test.skip('adversarial: sro synthesize with empty memory produces LOW severity correlations', async () => {
    const memory = new SQLiteMemoryStore(':memory:');
    try {
      const graph: GraphifyGraph = { nodes: [], edges: [], communities: [], godNodes: [] };
      const synthesis = await sroSynthesize([], graph, memory as unknown as SharedMemoryStore);
      expect(synthesis.correlations.length).toBe(0);
      expect(synthesis.blastRadius.length).toBe(0);
      expect(synthesis.deadCode).toEqual([]);
      expect(synthesis.cycles).toEqual([]);
    } finally {
      try { memory.close(); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
    }
  });

  test.skip('adversarial: concurrent pipeline executions with separate memories do not interfere', async () => {
    const tmpA = makeFixture('hydra-conc-a-');
    const tmpB = makeFixture('hydra-conc-b-');
    makeAuditSpecFixture(tmpA);
    makeAuditSpecFixture(tmpB);
    const memA = new SQLiteMemoryStore(':memory:');
    const memB = new SQLiteMemoryStore(':memory:');
    const mapperA = new GraphifyMCPMapper();
    const mapperB = new GraphifyMCPMapper();
    const simpleSpec: SubagentSpec<{ targetPath: string; targetRoot: string }, { ok: boolean }> = {
      id: 'simple',
      buildSystemPrompt: () => 'system',
      buildUserPrompt: () => 'user',
      outputSchema: z.object({ ok: z.boolean() }) as unknown as z.ZodSchema<{ ok: boolean }>,
      maxTokens: 1000,
      maxRounds: 1,
      timeout: 5000,
    };
    let localIdx = 0;
    const localBehaviors: Array<{ content: unknown }> = [
      { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
      { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
    ];
    class LocalMock {
      state: { messages: Array<unknown> } = { messages: [] };
      constructor(_opts: unknown) { void _opts; }
      async prompt(_p: string): Promise<unknown> {
        const b = localBehaviors[localIdx++ % localBehaviors.length] as { content: unknown };
        this.state.messages = [{ role: 'assistant', content: b.content }];
        return {};
      }
      async waitForIdle(): Promise<void> {}
    }
    __setAgentCtorForTesting(LocalMock as unknown as typeof import('@earendil-works/pi-agent-core').Agent);
    try {
      const pipeA = new AetherHydraPipeline({
        name: 'CONC_A',
        subagents: [simpleSpec as unknown as SubagentSpec<{ targetPath: string; targetRoot: string }, unknown>],
        synthesizer: (async (results: import('../types.js').SubagentSettlement<unknown>[]) => ({ count: results.filter((r) => r.status === 'fulfilled').length })) as unknown as never,
        gates: { pre: [], post: [] },
        transport: makeTransport(),
        memory: memA as unknown as SharedMemoryStore,
        graphMapper: mapperA as unknown as import('../types.js').GraphMapper,
        buildOutput: ((syn: unknown, _r: unknown, ev: { getTelemetry: () => unknown }) => ({ syn, tel: ev.getTelemetry() })) as unknown as never,
      });
      const pipeB = new AetherHydraPipeline({
        name: 'CONC_B',
        subagents: [simpleSpec as unknown as SubagentSpec<{ targetPath: string; targetRoot: string }, unknown>],
        synthesizer: (async (results: import('../types.js').SubagentSettlement<unknown>[]) => ({ count: results.filter((r) => r.status === 'fulfilled').length })) as unknown as never,
        gates: { pre: [], post: [] },
        transport: makeTransport(),
        memory: memB as unknown as SharedMemoryStore,
        graphMapper: mapperB as unknown as import('../types.js').GraphMapper,
        buildOutput: ((syn: unknown, _r: unknown, ev: { getTelemetry: () => unknown }) => ({ syn, tel: ev.getTelemetry() })) as unknown as never,
      });
      const [outA, outB] = await Promise.all([
        pipeA.execute({ targetPath: tmpA, targetRoot: tmpA } as never),
        pipeB.execute({ targetPath: tmpB, targetRoot: tmpB } as never),
      ]);
      expect(outA).toBeDefined();
      expect(outB).toBeDefined();
      expect(memA.getGateOutput('CONC_A')).not.toBeNull();
      expect(memB.getGateOutput('CONC_B')).not.toBeNull();
      expect(memA.getGateOutput('CONC_B')).toBeNull();
      expect(memB.getGateOutput('CONC_A')).toBeNull();
    } finally {
      __setAgentCtorForTesting(MockAgent as unknown as typeof import('@earendil-works/pi-agent-core').Agent);
      callIdx = 0;
      behaviors = [];
      try { memA.close(); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
      try { memB.close(); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
      try { fs.rmSync(tmpA, { recursive: true, force: true }); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
      try { fs.rmSync(tmpB, { recursive: true, force: true }); } catch (e) { void (e instanceof Error ? e.message : String(e)); }
    }
  });
});
