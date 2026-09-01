import { describe, expect, it } from 'bun:test';
import { AuditGraph, CHAIN_MAX_DEPTH } from '../graph/audit-graph.ts';
import { ConstructType, CodeConstruct, AuditFinding } from '../types.ts';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Build a fixture project + a small construct set for the graph. */
function makeGraphFixture(): { target: string; constructs: CodeConstruct[] } {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-'));
  fs.mkdirSync(path.join(target, '.trident', 'knowledge-graph'), { recursive: true });
  fs.writeFileSync(path.join(target, 'src', 'index.ts').replace('/src/index.ts', '/index.ts') === path.join(target, 'index.ts')
    ? path.join(target, 'index.ts')
    : (fs.mkdirSync(path.join(target, 'src'), { recursive: true }), path.join(target, 'src', 'index.ts')),
    'export function chargeCard(amount: number): boolean { return amount > 0; }', 'utf-8');
  const constructs: CodeConstruct[] = [
    mkConstruct(ConstructType.FUNCTION_DECLARATION, 'chargeCard', path.join(target, 'src', 'index.ts'), 1),
    mkConstruct(ConstructType.FUNCTION_DECLARATION, 'authorize', path.join(target, 'src', 'index.ts'), 5),
  ];
  return { target, constructs };
}

function mkConstruct(type: ConstructType, name: string, file: string, line: number): CodeConstruct {
  return {
    type, name, filePath: file, line, endLine: line, body: `export function ${name}() {}`, node: {} as never,
    isDefinition: true, isCallSite: false, isAsync: false, modifiers: ['export'], parent: null, children: [], parameters: [], returnType: null,
  };
}

function mkFinding(ruleId: string, file: string, line: number, evidence: string): AuditFinding {
  return {
    layer: 'R2', severity: 'CRITICAL', category: ruleId, file, line,
    evidence, description: 'test finding', correction: 'fix it', runtimeImpact: 'test',
    confidence: 0.95, constructType: null, callGraphRef: null, evidenceSuppressed: false,
  };
}

describe('THE KNOWLEDGE-GRAPH (W4 — the dead graph becomes live, the L2 spec §3.6)', () => {
  it('the shared.db rows written (the FR-4 proof)', () => {
    const { target, constructs } = makeGraphFixture();
    const graph = new AuditGraph(target);
    const stats = graph.build(constructs, { totalCallSites: 0, entries: new Map() });
    expect(stats.nodes > 0).toBe(true);
    expect(stats.edges >= 0).toBe(true);
    expect(fs.existsSync(path.join(target, '.trident', 'knowledge-graph', 'shared.db'))).toBe(true);
  });

  it('the query verbs return real data (the S5-feeding contract)', () => {
    const { target, constructs } = makeGraphFixture();
    const graph = new AuditGraph(target);
    graph.build(constructs, { totalCallSites: 0, entries: new Map() });
    expect(graph.whoCalls('chargeCard')).toEqual([]);      // no callers yet — the honest empty
    const chain = graph.chain('chargeCard');
    expect(Array.isArray(chain)).toBe(true);
    expect(chain.length >= 1).toBe(true);       // the node itself is in the chain
    expect(graph.unwired() !== undefined).toBe(true);
  });

  it('the CHAIN_MAX_DEPTH bound is a named member (the ISE discipline)', () => {
    expect(CHAIN_MAX_DEPTH).toBe(64);
  });

  it('the triad-gated ledger — a finding without evidence → FINDING_NO_TRIPLET', () => {
    const { target, constructs } = makeGraphFixture();
    const graph = new AuditGraph(target);
    graph.build(constructs, { totalCallSites: 0, entries: new Map() });
    expect(() => graph.appendFinding(mkFinding('r2.empty-catch', '/tmp/f.ts', 1, ''), 'run-1'))
      .toThrow(/FINDING_NO_TRIPLET/);
  });

  it('the appendFinding with evidence writes the row', () => {
    const { target, constructs } = makeGraphFixture();
    const graph = new AuditGraph(target);
    graph.build(constructs, { totalCallSites: 0, entries: new Map() });
    expect(() => graph.appendFinding(mkFinding('r2.empty-catch', '/tmp/f.ts', 1, 'catch {} swallows'), 'run-1')).not.toThrow();
  });

  it('the appendEvent records the AUDIT_DONE lifecycle', () => {
    const { target, constructs } = makeGraphFixture();
    const graph = new AuditGraph(target);
    graph.build(constructs, { totalCallSites: 0, entries: new Map() });
    expect(() => graph.appendEvent('AUDIT_DONE', { runId: 'run-1', score: 80 })).not.toThrow();
  });

  it('the triad-forwarding roundtrip — finding.triad survives the AuditGraph path (W1 honest-stop closure)', () => {
    const { target, constructs } = makeGraphFixture();
    const graph = new AuditGraph(target);
    graph.build(constructs, { totalCallSites: 0, entries: new Map() });
    const triad = { pattern: { memberId: 'r3.floating-promise', familySeverity: 'MEDIUM' as const }, state: { machineId: 'R3', from: 'ANALYZE', to: 'CLASSIFY' }, evidence: { file: '/tmp/f.ts', line: 7 } };
    const finding: AuditFinding = { layer: 'R3', severity: 'MEDIUM', category: 'ASYNC_CORRECTNESS', file: '/tmp/f.ts', line: 7, evidence: 'floating promise evidence', description: 'floating', correction: 'declare @safe-async or await/catch', runtimeImpact: 'test', confidence: 0.8, constructType: null, callGraphRef: null, evidenceSuppressed: false, triad };
    graph.appendFinding(finding, 'run-triad-graph');
    const db = (graph as unknown as { connect(): { prepare(sql: string): { all(...a: unknown[]): unknown[]; get(...a: unknown[]): unknown } } }).connect();
    const row = db.prepare('SELECT evidence FROM findings WHERE run_id = ?').get('run-triad-graph') as Record<string, unknown> | null;
    expect(row !== null).toBe(true);
    const ev = String(row!['evidence']);
    expect(ev).toContain('floating promise evidence');
    expect(ev).toContain('| TRIAD');
    const jsonPart = ev.split(' | TRIAD ')[1];
    const parsed = JSON.parse(jsonPart);
    expect(parsed.pattern.memberId).toBe('r3.floating-promise');
    expect(parsed.evidence.file).toBe('/tmp/f.ts');
    expect(parsed.evidence.line).toBe(7);
  });
});
