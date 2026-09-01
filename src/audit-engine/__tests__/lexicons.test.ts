import { describe, expect, it } from 'bun:test';
import { LexiconRegistry, runBattery, dedupeFindings, LexiconFinding, AnalysisContext } from '../lexicons/audit-lexicons.ts';
import { FOUNDING_PATTERNS, r4EmptyCatch, r17FakeReturn, r8TodoMarker, r17AlwaysPass, r13TypeUnsafePass } from '../lexicons/audit-lexicon-inventory.ts';
import { CodeConstruct, ConstructType } from '../types.ts';

/** Build a CodeConstruct for the matcher tests. */
function ctxWithConstruct(partial: Partial<CodeConstruct> & { kind: ConstructType }): { construct: CodeConstruct; ctx: AnalysisContext } {
  const construct: CodeConstruct = {
    type: partial.kind,
    name: partial.name || '',
    filePath: partial.filePath || '/tmp/fixture.ts',
    line: partial.line || 1,
    endLine: partial.line || 1,
    body: partial.body || '',
    node: {} as unknown as CodeConstruct['node'],
    isDefinition: partial.isDefinition || false,
    isCallSite: partial.isCallSite || false,
    isAsync: partial.isAsync || false,
    modifiers: partial.modifiers || [],
    parent: partial.parent || null,
    children: partial.children || [],
    parameters: partial.parameters || [],
    returnType: partial.returnType || null,
  };
  return { construct, ctx: { checker: null, callGraph: { totalCallSites: 0, coveragePercent: 0 } } };
}

function run(patterns: typeof FOUNDING_PATTERNS, construct: CodeConstruct, ctx: AnalysisContext = { checker: null, callGraph: { totalCallSites: 0, coveragePercent: 0 } }): LexiconFinding[] {
  return runBattery(patterns, [construct], ctx);
}

describe('THE MASTER LEXICONS (W3 — the PatternFamily core, the L2 spec §3.3)', () => {
  it('the r2.empty-catch FIRES on the empty catch construct', () => {
    const { construct, ctx } = ctxWithConstruct({ kind: ConstructType.CATCH_CLAUSE, body: '', name: 'catch' });
    const findings = run([r4EmptyCatch], construct, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toContain('r2.empty-catch');
    expect(findings[0].evidence).toContain('catch');       // the triad's Evidence carries the node text
    expect(findings[0].line).toBeGreaterThanOrEqual(1);    // the real position
  });

  it('the r2.empty-catch SILENT on the handled catch', () => {
    const { construct, ctx } = ctxWithConstruct({
      kind: ConstructType.CATCH_CLAUSE,
      body: 'tridentLog("caught", err);',
      name: 'catch',
      children: [
        { type: ConstructType.CALL_EXPRESSION, name: 'tridentLog', filePath: '/tmp/f.ts', line: 1, endLine: 1, body: 'tridentLog(...)', node: {} as never, isDefinition: false, isCallSite: true, isAsync: false, modifiers: [], parent: null, children: [], parameters: [], returnType: null },
      ],
    });
    const findings = run([r4EmptyCatch], construct, ctx);
    expect(findings.length).toBe(0);
  });

  it('the r5.fake-return FIRES on a hardcoded success without the work', () => {
    const { construct, ctx } = ctxWithConstruct({
      kind: ConstructType.FUNCTION_DECLARATION,
      name: 'chargeCard',
      body: 'return true;',
      isDefinition: true,
    });
    const findings = run([r17FakeReturn], construct, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toContain('r5.fake-return');
    expect(findings[0].pattern).toBe('CLASSIFIED');        // the machine decided, the matcher flagged
  });

  it('the r5.always-pass FIRES on a test that cannot fail', () => {
    const { construct, ctx } = ctxWithConstruct({
      kind: ConstructType.FUNCTION_DECLARATION,
      name: 'test',
      body: 'expect(true).toBe(true);',
      isDefinition: true,
    });
    const findings = run([r17AlwaysPass], construct, ctx);
    expect(findings.length).toBe(1);
  });

  it('the r3.todo-marker: the regex DETECTS, the AST decides (comment vs string)', () => {
    const comment = ctxWithConstruct({ kind: ConstructType.FUNCTION_DECLARATION, name: 'f', body: '// TODO: fix this\nreturn 1;' });
    expect(run([r8TodoMarker], comment.construct, comment.ctx).length).toBe(1); // the marker in a comment IS a defect marker

    const string = ctxWithConstruct({ kind: ConstructType.STRING_LITERAL, name: 'TODO', body: "'TODO'" });
    expect(run([r8TodoMarker], string.construct, string.ctx).length).toBe(0);    // the marker in a string is DATA
  });

  it('the r4.type-unsafe-pass FIRES on the unguarded any parameter', () => {
    const { construct, ctx } = ctxWithConstruct({
      kind: ConstructType.FUNCTION_DECLARATION,
      name: 'f',
      body: 'function f(x: any): any { return x; }',
      parameters: [{ name: 'x', type: 'any' }],
      returnType: 'any',
      isDefinition: true,
    });
    const findings = run([r13TypeUnsafePass], construct, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toContain('r4.type-unsafe-pass');
  });

  it('the HONEST SILENT — an unbound predicate returns [] (claims nothing it cannot measure)', () => {
    const unbound = { id: 'rX.unbound', kind: 'detector' as const, matcher: () => null, triggerCondition: 'never', severity: 'LOW' as const, messageTemplate: '', exampleHits: ['x'] };
    const { construct, ctx } = ctxWithConstruct({ kind: ConstructType.FUNCTION_DECLARATION, name: 'f', body: 'return 1;' });
    expect(run([unbound], construct, ctx)).toEqual([]);
  });

  it('the DETERMINISM — same inputs → identical rows', () => {
    const { construct, ctx } = ctxWithConstruct({ kind: ConstructType.CATCH_CLAUSE, body: '', name: 'catch' });
    const a = run([r4EmptyCatch], construct, ctx);
    const b = run([r4EmptyCatch], construct, ctx);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the REGISTRATION REJECTION — a bare-regex matcher is rejected (the ISE Order-2+ law)', () => {
    const registry = new LexiconRegistry();
    expect(() => registry.register({
      id: 'rX.slop',
      kind: 'detector',
      // A unary matcher (length 1) — the Order-2+ floor rejects it
      matcher: ((node: CodeConstruct) => ({ patternId: 'rX.slop', constructRef: 'x', evidence: 'x', triggerFired: 'x', confidence: 1 })) as never,
      triggerCondition: 'x',
      severity: 'LOW',
      messageTemplate: 'x',
      exampleHits: ['x'],
    })).toThrow(/LEXICON_REGISTRATION_REJECTED/);
  });

  it('the DEDUPE — the ruleId+file+line collapse', () => {
    const f = { ruleId: 'r2.empty-catch', pattern: 'CLASSIFIED', state: 'EVIDENCED', evidence: 'x', file: '/tmp/f.ts', line: 1, severity: 'CRITICAL' as const, confidence: 1, description: 'x', correction: '', layer: 'R2' };
    const deduped = dedupeFindings([f, f, { ...f, line: 2 }]);
    expect(deduped.length).toBe(2);
  });

  it('THE BUG-3 PIN (2026-08-20 the container red-team caught it) — the r5.* theatrical lexicon is mapped to EXACTLY ONE layer (R5), never duplicated across R11 AND R5', () => {
    const { FOUNDING_LEXICON_MAP } = require('../lexicons/lexicon-dispatch.ts');
    // the same pattern must not be dispatched under TWO layers — the container
    // audit proved every fake-return/always-pass finding was doubled (R11 + R5)
    const byLayer = new Map<string, string[]>();
    for (const [layer, patterns] of Object.entries(FOUNDING_LEXICON_MAP as Record<string, { id: string }[]>)) {
      for (const p of patterns) {
        if (!byLayer.has(p.id)) byLayer.set(p.id, []);
        byLayer.get(p.id)!.push(layer);
      }
    }
    for (const [id, layers] of byLayer) {
      if (id.startsWith('r5.')) {
        expect(layers).toEqual(['R5']);
      }
    }
  });
});
