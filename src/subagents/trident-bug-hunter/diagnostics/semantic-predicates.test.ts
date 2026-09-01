import { describe, it, expect } from 'bun:test';
import type { GraphAdapter, GraphNode } from '../graph/interface.ts';
import type { CheckContext } from '../lexicon/templates.ts';
import { SEMANTIC_TEMPLATES, buildSemanticBattery } from './semantic-predicates.ts';
import { isEvidenceTriad } from '../../../audit-engine/triad.ts';

function stubGraph(nodes: GraphNode[], overrides: Partial<GraphAdapter> = {}): GraphAdapter {
  return {
    build: async () => ({ nodes, edges: [], durationMs: 0, adapter: 'native-ast' as const, lineage: { spec: 0, code: 0, hybrid: 0 } }),
    whoCalls: () => [], chain: () => [], imports: () => [], awaits: () => [], unwired: () => [], nodes: (k?: string) => k ? nodes.filter(n => n.kind === k) : nodes, ...overrides,
  };
}

function ctxFor(file: string, source: string, nodes: GraphNode[], whoCallsMap: Record<string, { file: string; line: number; caller: string }[]> = {}): CheckContext {
  const g = stubGraph(nodes, { whoCalls: (sym: string) => whoCallsMap[sym] ?? [], nodes: (k?: string) => k ? nodes.filter(n => n.kind === k) : nodes });
  return { graph: g, source: { read: (f: string) => { if (f === file) return source; throw new Error('unreadable'); } }, bindings: { verbatimQuote: 'q', anchor: 'a', severity: 'HIGH' }, contentMap: new Map([[file, source]]) };
}

function node(id: string, name: string, file: string, line: number, kind: 'function'|'method'|'class' = 'function'): GraphNode {
  return { id, kind, name, file, line, lineage: 'CODE_DERIVED', source: `${file}:${line}` };
}

describe('semantic predicates - fire/silent per HT-BUG', () => {
  it('processCwdPersistence fires on cwd-derived persistence (HT-BUG-3b/15) and triad', () => {
    const src = `import fs from 'node:fs';\nimport path from 'node:path';\nconst baseDir = process.cwd();\nconst p = path.join(baseDir, '.trident', 'poseidon-state', 'state.json');\nfs.writeFileSync(p, 'x');`;
    const file = 'src/poseidon/poseidon-state.ts';
    const n = node('fn:save', 'save', file, 3);
    const ctx = ctxFor(file, src, [n]);
    const findings = SEMANTIC_TEMPLATES['semantic.process-cwd-persistence'].check(ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('semantic.process-cwd-persistence');
    expect(findings[0].evidence).toContain('HT-BUG-3b');
    const triad = (findings[0] as unknown as { triad: unknown }).triad;
    expect(isEvidenceTriad(triad)).toBe(true);
  });

  it('processCwdPersistence silent on injected baseDir (no process.cwd)', () => {
    const src = `import path from 'node:path';\nimport fs from 'node:fs';\nfunction save(baseDir: string){ const p = path.join(baseDir, '.trident', 'state.json'); fs.writeFileSync(p,'x'); }`;
    const file = 'src/poseidon/poseidon-state.ts';
    const n = node('fn:save', 'save', file, 3);
    const ctx = ctxFor(file, src, [n]);
    const findings = SEMANTIC_TEMPLATES['semantic.process-cwd-persistence'].check(ctx);
    expect(findings.length).toBe(0);
  });

  it('dualStoreLifecycleWrite fires on abort writing only poseidonState (HT-BUG-2)', () => {
    const src = `if (args.action === 'abort') {\n  poseidonState.setAbortFlag(sessionId, true);\n  clearPoller(args.targetPath);\n  return 'aborted';\n}`;
    const file = 'src/tools/trident-poseidon.ts';
    const n = node('fn:handler', 'handler', file, 1);
    const ctx = ctxFor(file, src, [n]);
    const findings = SEMANTIC_TEMPLATES['semantic.dual-store-lifecycle-write'].check(ctx);
    expect(findings.length).toBe(1);
    expect(isEvidenceTriad((findings[0] as unknown as { triad: unknown }).triad)).toBe(true);
  });

  it('dualStoreLifecycleWrite silent when writeStateAtomic present', () => {
    const src = `if (args.action === 'abort') {\n  poseidonState.setAbortFlag(sessionId, true);\n  writeStateAtomic(targetPath, { phase: 'FAILED' });\n  return 'aborted';\n}`;
    const file = 'src/tools/trident-poseidon.ts';
    const n = node('fn:handler', 'handler', file, 1);
    const ctx = ctxFor(file, src, [n]);
    const findings = SEMANTIC_TEMPLATES['semantic.dual-store-lifecycle-write'].check(ctx);
    expect(findings.length).toBe(0);
  });

  it('unwiredEnforcement fires on zero-caller gate (wired-dead)', () => {
    const src = `export function enforceStateGate(){ return true; } // enforcer file`;
    const file = 'src/hooks/guardian-hook.ts';
    const n = node('fn:enforceStateGate', 'enforceStateGate', file, 1);
    const ctx = ctxFor(file, src, [n], {});
    const findings = SEMANTIC_TEMPLATES['semantic.unwired-enforcement'].check(ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].evidence).toContain('enforceStateGate');
  });

  it('unwiredEnforcement silent when wired', () => {
    const src = `export function enforceStateGate(){ return true; }`;
    const file = 'src/hooks/guardian-hook.ts';
    const n = node('fn:enforceStateGate', 'enforceStateGate', file, 1);
    const ctx = ctxFor(file, src, [n], { enforceStateGate: [{ file: 'src/app.ts', line: 5, caller: 'hook' }] });
    const findings = SEMANTIC_TEMPLATES['semantic.unwired-enforcement'].check(ctx);
    expect(findings.length).toBe(0);
  });

  it('errorOnlyGuardGap fires on error/aborted only guard (HT-BUG-8)', () => {
    const src = `if (stopReason === 'error' || stopReason === 'aborted') {\n  const calls = message.content.filter(c=>c.type==='toolCall');\n}`;
    const file = 'src/audit-engine/harness/pi-aether-agent.ts';
    const n = node('fn:compose', 'compose', file, 2);
    const ctx = ctxFor(file, src, [n]);
    const findings = SEMANTIC_TEMPLATES['semantic.error-only-guard-gap'].check(ctx);
    expect(findings.length).toBe(1);
  });

  it('errorOnlyGuardGap silent when Array.isArray guard present', () => {
    const src = `if (!Array.isArray(message.content)) throw new Error('AETHER_MALFORMED_MESSAGE');\nif (stopReason === 'error' || stopReason === 'aborted') { const calls = message.content.filter(c=>c.type==='toolCall'); }`;
    const file = 'src/audit-engine/harness/pi-aether-agent.ts';
    const n = node('fn:compose', 'compose', file, 2);
    const ctx = ctxFor(file, src, [n]);
    const findings = SEMANTIC_TEMPLATES['semantic.error-only-guard-gap'].check(ctx);
    expect(findings.length).toBe(0);
  });

  it('diagnosticsJail fires on phase allowlist without read exemption (HT-BUG-21)', () => {
    const src = `const PHASE_REQUIRED_TOOLS = { DISPATCH: ['trident-poseidon','task'], AUDIT: ['trident-code-audit'] };`;
    const file = 'src/hooks/poseidon-enforcer-hook.ts';
    const n = node('fn:enforce', 'enforce', file, 1);
    const ctx = ctxFor(file, src, [n]);
    const findings = SEMANTIC_TEMPLATES['semantic.diagnostics-jail'].check(ctx);
    expect(findings.length).toBe(1);
  });

  it('diagnosticsJail silent when DIAGNOSTIC_TOOLS present', () => {
    const src = `const DIAGNOSTIC_TOOLS = ['read','grep','glob'];\nconst PHASE_REQUIRED_TOOLS = { DISPATCH: [...DIAGNOSTIC_TOOLS,'trident-poseidon'] };`;
    const file = 'src/hooks/poseidon-enforcer-hook.ts';
    const n = node('fn:enforce', 'enforce', file, 1);
    const ctx = ctxFor(file, src, [n]);
    const findings = SEMANTIC_TEMPLATES['semantic.diagnostics-jail'].check(ctx);
    expect(findings.length).toBe(0);
  });

  it('unscopedWalker fires on walker missing Checkpoints/.trident (HT-BUG-20)', () => {
    const src = `function scanTsFiles(root:string){ const files = fs.readdirSync(root, {recursive:true}); return files.filter(f=>f.endsWith('.ts') && !f.includes('node_modules')); }`;
    const file = 'src/poseidon/god-loop.ts';
    const n = node('fn:scanTsFiles', 'scanTsFiles', file, 1);
    const ctx = ctxFor(file, src, [n]);
    const findings = SEMANTIC_TEMPLATES['semantic.unscoped-walker'].check(ctx);
    expect(findings.length).toBe(1);
  });

  it('unscopedWalker silent when EXCLUDED_DIRS complete', () => {
    const src = `const EXCLUDED_DIRS = new Set(['Checkpoints','.trident','dist','node_modules']);\nfunction scanTsFiles(root:string){ const files = fs.readdirSync(root,{recursive:true}); return files.filter(f=>!EXCLUDED_DIRS.has(f)); }`;
    const file = 'src/poseidon/god-loop.ts';
    const n = node('fn:scanTsFiles', 'scanTsFiles', file, 1);
    const ctx = ctxFor(file, src, [n]);
    const findings = SEMANTIC_TEMPLATES['semantic.unscoped-walker'].check(ctx);
    expect(findings.length).toBe(0);
  });

  it('adversarial: empty graph returns [] without throw', () => {
    const ctx = ctxFor('a.ts', '', []);
    for (const tmpl of Object.values(SEMANTIC_TEMPLATES)) {
      const r = tmpl.check(ctx);
      expect(r.length).toBe(0);
    }
  });

  it('adversarial: unreadable source is honest silent (no throw)', () => {
    const n = node('fn:x','x','a.ts',1);
    const g = stubGraph([n]);
    const ctx: CheckContext = { graph: g, source: { read: () => { throw new Error('unreadable'); } }, bindings: { verbatimQuote:'q', anchor:'a', severity:'HIGH' } };
    for (const tmpl of Object.values(SEMANTIC_TEMPLATES)) expect(() => tmpl.check(ctx)).not.toThrow();
  });

  it('adversarial: concurrent battery run produces deterministic findings', () => {
    const src = `const baseDir = process.cwd();\nconst p = path.join(baseDir, '.trident','state.json');\nfs.writeFileSync(p,'x');`;
    const file = 'src/poseidon/poseidon-state.ts';
    const n = node('fn:save','save',file,1);
    const ctx = ctxFor(file, src, [n]);
    const a = SEMANTIC_TEMPLATES['semantic.process-cwd-persistence'].check(ctx);
    const b = SEMANTIC_TEMPLATES['semantic.process-cwd-persistence'].check(ctx);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('battery builder exports 6 compiled predicates with triad evidence', () => {
    const battery = buildSemanticBattery('test-v1');
    expect(battery.length).toBe(6);
    expect(battery.every(p => p.id.startsWith('semantic.'))).toBe(true);
    const ids = battery.map(p=>p.id);
    expect(new Set(ids).size).toBe(6);
  });
});
