import { describe, test, expect } from 'bun:test';
import { resolveWarhead, fillTemplate, dispatchTea, blockAtTeb, dispatchDirective, validateWarhead, StructuredEnforcementError } from './index.js';
import type { WarheadLayer, PlatformAdapter } from './types.js';

const SIX = `DETECTED: x\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c`;
const LAYER: WarheadLayer = {
  id: 'SMOKE_TEST_GUARD',
  enforcement: {
    tier1: `DETECTED: {toolName} {args}\nWHY THIS FIRED: {pbaFamilies} tier {pbaTier}\nWHAT THIS MEANS: mean\nCORRECT BEHAVIOR: use {correctTool}\nSELF-CHECK: check\nRESET PATH: reset {anchor} count {count} violations {chainViolations} esc {escalationCount}`,
    tier2: `DETECTED: {toolName}\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c tier2 {count}`,
    tier3: `DETECTED: blocked\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c`,
    tier4: `DETECTED: x\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c tier4 {escalationCount}`,
  }
};

describe('ms-warhead-dispatcher', () => {
  test('fillTemplate substitutes all 9 fields', () => {
    const tpl = '{count} {toolName} {args} {chainViolations} {pbaFamilies} {pbaTier} {escalationCount} {correctTool} {anchor}';
    const out = fillTemplate(tpl, { count: 7, toolName: 'bash', args: '{"cmd":"x"}', chainViolations: 'ruleA', pbaFamilies: 'TEST_EVASION', pbaTier: 2, escalationCount: 3, correctTool: 'trident-code-audit', anchor: 'pta:SMOKE:123' });
    expect(out).toBe('7 bash {"cmd":"x"} ruleA TEST_EVASION 2 3 trident-code-audit pta:SMOKE:123');
  });
  test('resolveWarhead returns BODY ONLY no delivery side effect', () => {
    const body = resolveWarhead(LAYER, 1, { toolName: 'bash', args: '{}', count: 1 });
    expect(body).toContain('DETECTED');
    expect(body).not.toContain('[PTA GATE]');
  });
  test('tier1 maps to dispatchTea append preserves tool output', () => {
    const body = resolveWarhead(LAYER, 1, { toolName: 'bash', count: 1 });
    const out = dispatchTea(body, 'tool output verbatim');
    expect(out.startsWith('tool output verbatim')).toBe(true);
    expect(out).toContain(body);
    expect(out).toBe('tool output verbatim\n\n' + body);
  });
  test('tier2 maps to dispatchTea', () => {
    const body = resolveWarhead(LAYER, 2, { count: 2 });
    const out = dispatchTea(body, 'result');
    expect(out).toBe('result\n\n' + body);
  });
  test('tier3 blockAtTeb throws StructuredEnforcementError with machine pta tier3', () => {
    const body = resolveWarhead(LAYER, 3, {});
    let caught: any;
    try { blockAtTeb(body, LAYER.id); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(StructuredEnforcementError);
    expect(caught.machine).toBe('pta');
    expect(caught.tier).toBe(3);
    expect(caught.evidenceRequired).toBe(true);
    expect(caught.correction).toBe(body);
    expect(caught.detected).toContain('SMOKE_TEST_GUARD');
  });
  test('tier4 dispatchDirective prepends [PTA GATE] and injects chat.message', () => {
    const body = resolveWarhead(LAYER, 4, { escalationCount: 5 });
    let injected: any = null;
    const adapter: PlatformAdapter = { inject(m) { injected = m; } };
    dispatchDirective(body, adapter);
    expect(injected.type).toBe('chat.message');
    expect(injected.content.startsWith('[PTA GATE] ')).toBe(true);
    expect(injected.content).toBe('[PTA GATE] ' + body);
  });
  test('validateWarhead passes 6-section body', () => {
    const res = validateWarhead(SIX);
    expect(res.valid).toBe(true);
    expect(res.missing.length).toBe(0);
  });
  test('validateWarhead flags missing each section individually', () => {
    const sections = ['DETECTED','WHY THIS FIRED','WHAT THIS MEANS','CORRECT BEHAVIOR','SELF-CHECK','RESET PATH'];
    for (const sec of sections) {
      const body = sections.filter(s=>s!==sec).join('\n');
      const res = validateWarhead(body);
      expect(res.valid).toBe(false);
      expect(res.missing).toContain(sec);
      expect(res.missing.length).toBe(1);
    }
  });
  test('validateWarhead missing all flags 6', () => {
    const res = validateWarhead('hello world');
    expect(res.missing.length).toBe(6);
  });
  test('tier-to-surface mapping table 1->TEA 2->TEA 3->TEB-throw 4->[PTA GATE]', () => {
    const b1 = resolveWarhead(LAYER, 1, {});
    const b2 = resolveWarhead(LAYER, 2, {});
    const b3 = resolveWarhead(LAYER, 3, {});
    const b4 = resolveWarhead(LAYER, 4, {});
    const tea1 = dispatchTea(b1, 'out');
    expect(tea1).toContain(b1);
    const tea2 = dispatchTea(b2, 'out');
    expect(tea2).toContain(b2);
    expect(() => blockAtTeb(b3, LAYER.id)).toThrow();
    let inj: any = null;
    dispatchDirective(b4, { inject(m){ inj=m; }});
    expect(inj.content.startsWith('[PTA GATE] ')).toBe(true);
  });
  test('empty tool call context still fills defaults', () => {
    const out = fillTemplate('count {count} tool {toolName}', {});
    expect(out).toBe('count 1 tool unknown');
  });
  test('concurrent fillTemplate purity', () => {
    const t = '{count} {toolName}';
    expect(fillTemplate(t, { count: 1, toolName: 'a' })).toBe('1 a');
    expect(fillTemplate(t, { count: 1, toolName: 'a' })).toBe('1 a');
  });
});
