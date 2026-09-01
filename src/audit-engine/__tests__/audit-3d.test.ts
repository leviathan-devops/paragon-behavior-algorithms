import { describe, it, expect } from 'bun:test';
import { AuditEngine } from '../index.ts';
import { GraphBackedAuditClass } from '../graph-backed-audit.ts';
import type { GraphSnapshot, Audit3DEvidence } from '../types.ts';

function makeCallGraph(entries: { calleeFile: string; calleeLine: number; calleeName: string; callSites: { callSiteFile: string; callSiteLine: number }[] }[]): import('../types.ts').CallGraph {
  const map = new Map<string, import('../types.ts').CallGraphEntry>();
  for (const e of entries) {
    const key = `${e.calleeFile}:${e.calleeLine}:${e.calleeName}`;
    map.set(key, { calleeFile: e.calleeFile, calleeLine: e.calleeLine, calleeName: e.calleeName, callSites: e.callSites.map((cs) => ({ callSiteFile: cs.callSiteFile, callSiteLine: cs.callSiteLine, hasAwait: false, isInsideTry: false, isInsideCatch: false, isInsideFinally: false, returnValueUsed: false, calleeResolved: true, calleeReturnsPromise: false })) });
  }
  return { entries: map, totalCallSites: entries.reduce((s, e) => s + e.callSites.length, 0), resolvedCallSites: entries.reduce((s, e) => s + e.callSites.length, 0), coveragePercent: 100 };
}

describe('audit-3D: evidence3D per file has callers via who-calls + chain via trace + unwired + findings', () => {
  it('evidence3D on empty file path returns degraded result with empty arrays, does not throw', async () => {
    const g = new GraphBackedAuditClass(null);
    const r: Audit3DEvidence = await g.evidence3D('');
    expect(Array.isArray(r.callers)).toBe(true);
    expect(Array.isArray(r.chain)).toBe(true);
    expect(Array.isArray(r.unwired)).toBe(true);
    expect(Array.isArray(r.findings)).toBe(true);
    expect(r.callers.length).toBe(0);
    expect(r.chain.length).toBe(0);
  });

  it('evidence3D on whitespace string returns string node and empty arrays', async () => {
    const g = new GraphBackedAuditClass(null);
    const r = await g.evidence3D('   ');
    expect(typeof r.node).toBe('string');
    expect(r.callers.length).toBe(0);
    expect(r.chain.length).toBe(0);
  });

  it('evidence3D with null graph degrades gracefully', async () => {
    const g = new GraphBackedAuditClass(null);
    const r = await g.evidence3D('src/foo.ts');
    expect(r.node).toBe('src/foo.ts');
    expect(r.callers.length).toBe(0);
    expect(r.chain.length).toBe(0);
  });

  it('evidence3D with valid file + graph populates callers and chain from callGraph edges', async () => {
    const cg = makeCallGraph([
      { calleeFile: 'src/foo.ts', calleeLine: 10, calleeName: 'handleRequest', callSites: [{ callSiteFile: 'src/caller.ts', callSiteLine: 42 }] },
      { calleeFile: 'src/foo.ts', calleeLine: 20, calleeName: 'validateInput', callSites: [{ callSiteFile: 'src/caller.ts', callSiteLine: 43 }] },
    ]);
    const constructsByFile = new Map<string, import('../types.ts').CodeConstruct[]>([
      ['src/foo.ts', [
        { type: 'FUNCTION_DECLARATION' as never, name: 'handleRequest', filePath: 'src/foo.ts', line: 10, endLine: 20, body: 'function handleRequest(){}', node: null as never, isDefinition: true, isCallSite: false, isAsync: false, modifiers: [], parent: null, children: [], parameters: [], returnType: null },
      ]],
    ]);
    const g = new GraphBackedAuditClass(cg, cg, constructsByFile, []);
    const r = await g.evidence3D('src/foo.ts');
    expect(r.node).toBe('src/foo.ts:10');
    expect(r.callers.length).toBe(2);
    expect(r.chain.length).toBe(2);
    expect(r.callers.some((c) => c.filePath === 'src/caller.ts' && c.line === 42)).toBe(true);
  });

  it('evidence3D caller entries carry filePath, line, constructName', async () => {
    const cg = makeCallGraph([
      { calleeFile: 'src/bar.ts', calleeLine: 5, calleeName: 'doWork', callSites: [{ callSiteFile: 'src/app.ts', callSiteLine: 99 }] },
    ]);
    const constructsByFile = new Map<string, import('../types.ts').CodeConstruct[]>([
      ['src/bar.ts', [{ type: 'FUNCTION_DECLARATION' as never, name: 'doWork', filePath: 'src/bar.ts', line: 5, endLine: 10, body: '', node: null as never, isDefinition: true, isCallSite: false, isAsync: false, modifiers: [], parent: null, children: [], parameters: [], returnType: null }]],
    ]);
    const g = new GraphBackedAuditClass(cg, cg, constructsByFile, []);
    const r = await g.evidence3D('src/bar.ts');
    expect(r.callers.length).toBe(1);
    expect(r.callers[0].filePath).toBe('src/app.ts');
    expect(r.callers[0].line).toBe(99);
    expect(r.callers[0].constructName).toBe('doWork');
    expect(typeof r.chain[0].from).toBe('string');
    expect(typeof r.chain[0].to).toBe('string');
    expect(typeof r.chain[0].evidence).toBe('string');
  });

  it('evidence3D chain entries connect callSite to callee', async () => {
    const cg = makeCallGraph([
      { calleeFile: 'src/svc.ts', calleeLine: 15, calleeName: 'run', callSites: [{ callSiteFile: 'src/main.ts', callSiteLine: 7 }] },
    ]);
    const g = new GraphBackedAuditClass(cg, cg, new Map([['src/svc.ts', [{ type: 'FUNCTION_DECLARATION' as never, name: 'run', filePath: 'src/svc.ts', line: 15, endLine: 20, body: '', node: null as never, isDefinition: true, isCallSite: false, isAsync: false, modifiers: [], parent: null, children: [], parameters: [], returnType: null }]]]), []);
    const r = await g.evidence3D('src/svc.ts');
    expect(r.chain.length).toBe(1);
    expect(r.chain[0].from).toBe('src/main.ts:7');
    expect(r.chain[0].to).toBe('src/svc.ts:15');
  });

  it('evidence3D returns all five required fields', async () => {
    const cg = makeCallGraph([]);
    const g = new GraphBackedAuditClass(cg, cg, new Map([['src/x.ts', []]]), []);
    const r = await g.evidence3D('src/x.ts');
    expect('node' in r).toBe(true);
    expect('callers' in r).toBe(true);
    expect('chain' in r).toBe(true);
    expect('unwired' in r).toBe(true);
    expect('findings' in r).toBe(true);
    expect(typeof r.node).toBe('string');
    expect(Array.isArray(r.callers)).toBe(true);
    expect(Array.isArray(r.chain)).toBe(true);
    expect(Array.isArray(r.unwired)).toBe(true);
    expect(Array.isArray(r.findings)).toBe(true);
  });
});

describe('audit-3D: graphDrift', () => {
  it('identical graphs returns driftDetected=false', () => {
    const cg = makeCallGraph([]);
    const g = new GraphBackedAuditClass(cg);
    const snap: GraphSnapshot = { timestamp: Date.now(), nodes: ['a.ts', 'b.ts'], edges: ['a.ts->b.ts'] };
    (g as unknown as { graphSnapshot: GraphSnapshot }).graphSnapshot = snap;
    const r = g.graphDrift({ timestamp: Date.now(), nodes: ['a.ts', 'b.ts'], edges: ['a.ts->b.ts'] });
    expect(r.driftDetected).toBe(false);
    expect(r.driftedNodes.length).toBe(0);
    expect(r.message).toContain('No drift');
  });

  it('changed edges detects drift and lists driftedNodes', () => {
    const g = new GraphBackedAuditClass(null);
    (g as unknown as { graphSnapshot: GraphSnapshot }).graphSnapshot = { timestamp: Date.now(), nodes: ['a.ts', 'b.ts'], edges: ['a.ts->b.ts', 'b.ts->c.ts'] };
    const baseline: GraphSnapshot = { timestamp: Date.now() - 1000, nodes: ['a.ts', 'b.ts'], edges: ['a.ts->b.ts'] };
    const r = g.graphDrift(baseline);
    expect(r.driftDetected).toBe(true);
    expect(r.driftedNodes.length > 0).toBe(true);
    expect(r.message).toContain('Drift detected');
  });

  it('removed node lists it as drifted', () => {
    const g = new GraphBackedAuditClass(null);
    (g as unknown as { graphSnapshot: GraphSnapshot }).graphSnapshot = { timestamp: Date.now(), nodes: ['a.ts'], edges: [] };
    const baseline: GraphSnapshot = { timestamp: Date.now() - 1000, nodes: ['a.ts', 'b.ts'], edges: [] };
    const r = g.graphDrift(baseline);
    expect(r.driftDetected).toBe(true);
    expect(r.driftedNodes).toContain('b.ts');
  });

  it('null baseline does not throw', () => {
    const g = new GraphBackedAuditClass(null);
    const r = g.graphDrift(null as unknown as GraphSnapshot);
    expect(typeof r.driftDetected).toBe('boolean');
    expect(Array.isArray(r.driftedNodes)).toBe(true);
    expect(typeof r.message).toBe('string');
  });
});

describe('audit-3D: AuditEngine wiring', () => {
  it('AuditEngine exposes evidence3D and graphDrift', () => {
    const engine = new AuditEngine();
    expect(typeof (engine as unknown as { evidence3D: unknown }).evidence3D).toBe('function');
    expect(typeof (engine as unknown as { graphDrift: unknown }).graphDrift).toBe('function');
  });

  it('AuditEngine.evidence3D on arbitrary file does not throw', async () => {
    const engine = new AuditEngine();
    const r = await engine.evidence3D('src/any-file.ts');
    expect(typeof r.node).toBe('string');
    expect(Array.isArray(r.callers)).toBe(true);
  });

  it('AuditEngine.graphDrift with identical snapshot returns no drift', () => {
    const engine = new AuditEngine();
    const snap: GraphSnapshot = { timestamp: Date.now(), nodes: ['x.ts'], edges: ['x.ts->y.ts'] };
    const inner = (engine as unknown as { graphAudit: GraphBackedAuditClass }).graphAudit;
    (inner as unknown as { graphSnapshot: GraphSnapshot }).graphSnapshot = snap;
    const r = engine.graphDrift({ timestamp: Date.now(), nodes: ['x.ts'], edges: ['x.ts->y.ts'] });
    expect(r.driftDetected).toBe(false);
  });

  it('artifact report header reads TRIDENT CODE AUDIT', async () => {
    const engine = new AuditEngine();
    const tmpRoot = `/tmp/trident-3d-header-${Date.now()}`;
    const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    try {
      mkdirSync(`${tmpRoot}/src`, { recursive: true });
      writeFileSync(`${tmpRoot}/src/a.ts`, 'export function foo(): string { return "hi"; }');
      writeFileSync(`${tmpRoot}/package.json`, JSON.stringify({ name: 'hdr-test' }));
      writeFileSync(`${tmpRoot}/tsconfig.json`, JSON.stringify({ compilerOptions: { strict: true }, include: ['src'] }));
      const result = await engine.audit(tmpRoot);
      expect(result.report.includes('TRIDENT CODE REVIEW')).toBe(false);
      const emptyResult = await engine.audit('/tmp/trident-3d-empty-' + Date.now());
      expect(emptyResult.report).toContain('TRIDENT CODE AUDIT');
    } finally {
      try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    }
  });

  it('audit result carries audit3D map', async () => {
    const engine = new AuditEngine();
    const tmpRoot = `/tmp/trident-3d-map-${Date.now()}`;
    const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    try {
      mkdirSync(`${tmpRoot}/src`, { recursive: true });
      writeFileSync(`${tmpRoot}/src/b.ts`, 'export function bar(): number { return 42; }');
      writeFileSync(`${tmpRoot}/package.json`, JSON.stringify({ name: 'map-test' }));
      writeFileSync(`${tmpRoot}/tsconfig.json`, JSON.stringify({ compilerOptions: { strict: true }, include: ['src'] }));
      const result = await engine.audit(tmpRoot);
      if (result.sourceFilesScanned > 0) {
        expect(result.audit3D instanceof Map).toBe(true);
        for (const [, v] of result.audit3D!) {
          expect('node' in v).toBe(true);
          expect('callers' in v).toBe(true);
          expect('chain' in v).toBe(true);
          expect('unwired' in v).toBe(true);
          expect('findings' in v).toBe(true);
        }
      } else {
        expect(result.audit3D === undefined).toBe(true);
      }
    } finally {
      try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    }
  });
});
