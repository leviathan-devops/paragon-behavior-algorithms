import { describe, test, expect } from 'bun:test';
import { NODE_TYPE_MAP, EDGE_PREDICATE_MAP, transformNode, transformEdge, CorbellBridge } from '../corbell-bridge.js';
import { TYPED_GRAPH_DDL } from '../../shared/knowledge-graph/migrations.js';
import type { GraphifyNode, GraphifyEdge } from '../types.js';

function node(over: Partial<GraphifyNode> = {}): GraphifyNode {
  return { id: 'n1', label: 'Foo', type: 'class', file: 'src/foo.ts', data: { line: 10 }, ...over };
}
function edge(over: Partial<GraphifyEdge> = {}): GraphifyEdge {
  return { src: 'a', dst: 'b', relation: 'calls', confidence: 'EXTRACTED', ...over };
}

describe('NODE_TYPE_MAP', () => {
  test('known mappings', () => {
    expect(NODE_TYPE_MAP['class']).toBe('Class');
    expect(NODE_TYPE_MAP['function']).toBe('Function');
    expect(NODE_TYPE_MAP['interface']).toBe('Interface');
    expect(NODE_TYPE_MAP['file']).toBe('File');
    expect(NODE_TYPE_MAP['module']).toBe('Module');
    expect(NODE_TYPE_MAP['method']).toBe('Function');
    expect(NODE_TYPE_MAP['property']).toBe('EvidenceFile');
    expect(NODE_TYPE_MAP['import']).toBe('Module');
  });
  test('unknown type fallback not dropped (ontology-valid EvidenceFile)', () => {
    const out = transformNode(node({ type: 'weird-thing' }));
    expect(out.kind).toBe('EvidenceFile');
    expect(out.canonical_id).toBe('n1');
  });
  test('unknown type case-insensitive', () => {
    expect(transformNode(node({ type: 'CLASS' })).kind).toBe('Class');
  });
});

describe('EDGE_PREDICATE_MAP', () => {
  test('known mappings', () => {
    expect(EDGE_PREDICATE_MAP['imports']).toBe('imports');
    expect(EDGE_PREDICATE_MAP['calls']).toBe('calls');
    expect(EDGE_PREDICATE_MAP['inherits']).toBe('implements');
    expect(EDGE_PREDICATE_MAP['uses']).toBe('wraps');
    expect(EDGE_PREDICATE_MAP['references']).toBe('declares');
    expect(EDGE_PREDICATE_MAP['returns']).toBe('shouldBe');
  });
  test('unknown predicate fallback ontology-valid (declares)', () => {
    const out = transformEdge(edge({ relation: 'magic-links', confidence: 'EXTRACTED' }));
    expect(out.predicate).toBe('declares');
  });
});

describe('transformEdge evidence_quote CHECK', () => {
  test('EXTRACTED starts explicit: and length>0', () => {
    const out = transformEdge(edge({ relation: 'calls', confidence: 'EXTRACTED' }));
    expect(out.evidence_quote.startsWith('explicit:')).toBe(true);
    expect(out.evidence_quote.length).toBeGreaterThan(0);
    expect(out.evidence_quote).toContain('calls');
  });
  test('INFERRED starts inferred: and length>0', () => {
    const out = transformEdge(edge({ relation: 'calls', confidence: 'INFERRED' }));
    expect(out.evidence_quote.startsWith('inferred:')).toBe(true);
    expect(out.evidence_quote.length).toBeGreaterThan(0);
    expect(out.evidence_quote).toContain('calls');
  });
  test('both satisfy CHECK(length>0)', () => {
    for (const c of ['EXTRACTED', 'INFERRED'] as const) {
      const out = transformEdge(edge({ confidence: c }));
      expect(out.evidence_quote.length).toBeGreaterThan(0);
    }
  });
});

describe('transformNode identity preservation', () => {
  test('carries id/label/file', () => {
    const out = transformNode(node({ id: 'x', label: 'MyClass', file: 'src/x.ts' }));
    expect(out.canonical_id).toBe('x');
    expect(out.label).toBe('MyClass');
    expect(out.file).toBe('src/x.ts');
  });
});

describe('adversarial', () => {
  test('empty node type does not throw, maps to EvidenceFile', () => {
    const out = transformNode(node({ type: '' }));
    expect(out.kind).toBe('EvidenceFile');
  });
  test('LIVE CHECK-CONSTRAINT PROOF: transformed inserts satisfy the real TYPED_GRAPH_DDL', () => {
    // The fix's reason to exist: every bridge output must INSERT cleanly into a DB built
    // from the real migrations.ts DDL (kind/predicate CHECKs + evidence_quote length>0).
    const { Database } = require('bun:sqlite') as { Database: new (path: string, opts?: unknown) => { exec(sql: string): unknown; prepare(sql: string): { run(...args: unknown[]): unknown; all(...args: unknown[]): unknown } } };
    const db = new Database(':memory:');
    db.exec(TYPED_GRAPH_DDL);
    // adversarial shapes: unknown node type + unknown predicate + both confidence classes
    const n = transformNode(node({ type: 'weird-thing' }), 'proof-run');
    db.prepare('INSERT INTO typed_nodes (canonical_id,kind,label,file,line,created_run) VALUES (?,?,?,?,?,?)')
      .run(n.canonical_id, n.kind, n.label, n.file, n.line, n.created_run);
    const eX = transformEdge(edge({ relation: 'magic-links', confidence: 'EXTRACTED' }), 'proof-run');
    const eI = transformEdge(edge({ relation: 'calls', confidence: 'INFERRED' }), 'proof-run');
    db.prepare('INSERT INTO typed_edges (src_canonical,dst_canonical,predicate,evidence_quote,confidence,created_run) VALUES (?,?,?,?,?,?)')
      .run(eX.src_canonical, eX.dst_canonical, eX.predicate, eX.evidence_quote, eX.confidence, eX.created_run);
    db.prepare('INSERT INTO typed_edges (src_canonical,dst_canonical,predicate,evidence_quote,confidence,created_run) VALUES (?,?,?,?,?,?)')
      .run(eI.src_canonical, eI.dst_canonical, eI.predicate, eI.evidence_quote, eI.confidence, eI.created_run);
    const kinds = (db.prepare('SELECT kind FROM typed_nodes').all() as Array<{ kind: string }>).map(r => r.kind);
    expect(kinds).toContain('EvidenceFile');
    const preds = (db.prepare('SELECT predicate, evidence_quote FROM typed_edges').all() as Array<{ predicate: string; evidence_quote: string }>);
    expect(preds.map(p => p.predicate).sort()).toEqual(['calls', 'declares']);
    for (const p of preds) expect(p.evidence_quote.length).toBeGreaterThan(0);
  });
  test('null node throws named error', () => {
    expect(() => transformNode(null as unknown as GraphifyNode)).toThrow('CORBELL_BRIDGE_INVALID_NODE');
  });
  test('empty relation throws', () => {
    expect(() => transformEdge(edge({ relation: '' }))).toThrow('CORBELL_BRIDGE_INVALID_EDGE');
  });
  test('null edge throws', () => {
    expect(() => transformEdge(null as unknown as GraphifyEdge)).toThrow('CORBELL_BRIDGE_INVALID_EDGE');
  });
  test('CorbellBridge assembly exports', () => {
    expect(CorbellBridge.NODE_TYPE_MAP).toBe(NODE_TYPE_MAP);
    expect(CorbellBridge.EDGE_PREDICATE_MAP).toBe(EDGE_PREDICATE_MAP);
    expect(typeof CorbellBridge.transformNode).toBe('function');
    expect(typeof CorbellBridge.transformEdge).toBe('function');
  });
  test('boundary empty file falls back to null or data source_file', () => {
    const out = transformNode(node({ file: '', data: { source_file: 'src/fallback.ts' } }));
    expect(out.file).toBe('src/fallback.ts');
  });
});
