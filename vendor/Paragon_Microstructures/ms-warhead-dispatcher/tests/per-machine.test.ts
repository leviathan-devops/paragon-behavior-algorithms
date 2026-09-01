// ms-warhead-dispatcher — tests/per-machine.test.ts
import { describe, test, expect } from 'bun:test';
import { resolveWarhead, fillTemplate, dispatchTea, blockAtTeb, dispatchDirective, validateWarhead, StructuredEnforcementError } from '../src/core/engine.js';
import type { WarheadLayer, PlatformAdapter } from '../src/core/types.js';
import { runProperties } from './properties.js';
import { TIER_TO_SURFACE, REQUIRED_SECTIONS } from '../src/machines/warheads.js';

const SIX = 'DETECTED: x\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c';
const LAYER: WarheadLayer = {
  id: 'SMOKE_TEST_GUARD',
  enforcement: {
    tier1: 'DETECTED: {toolName}\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c tier1 {count}',
    tier2: 'DETECTED: {toolName}\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c tier2 {count}',
    tier3: 'DETECTED: blocked\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c',
    tier4: 'DETECTED: x\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c tier4 {escalationCount}',
  }
};

describe('per-machine: warhead-dispatcher', () => {
  test('properties determinism 500 runs', () => {
    const r = runProperties();
    expect(r.fail).toBe(0);
  });
  test('tier1 resolves via fillTemplate', () => {
    const b = resolveWarhead(LAYER, 1, { count: 1, toolName: 'bash' });
    expect(b).toContain('DETECTED');
    expect(b).toContain('tier1 1');
  });
  test('tier-to-surface map 1->TEA 2->TEA 3->TEB 4->GATE', () => {
    expect(TIER_TO_SURFACE[1]).toBe('TEA');
    expect(TIER_TO_SURFACE[2]).toBe('TEA');
    expect(TIER_TO_SURFACE[3]).toBe('TEB');
    expect(TIER_TO_SURFACE[4]).toBe('GATE');
  });
  test('blockAtTeb tier3 throws with machine pta', () => {
    const b = resolveWarhead(LAYER, 3, {});
    expect(() => blockAtTeb(b, LAYER.id)).toThrow();
    try { blockAtTeb(b, LAYER.id); } catch (e: any) { expect(e.machine).toBe('pta'); expect(e.tier).toBe(3); }
  });
  test('dispatchDirective tier4 prepends [PTA GATE]', () => {
    const b = resolveWarhead(LAYER, 4, { escalationCount: 2 });
    let inj: any = null;
    dispatchDirective(b, { inject(m){ inj=m; } } as PlatformAdapter);
    expect(inj.content.startsWith('[PTA GATE] ')).toBe(true);
  });
  test('validateWarhead missing sections detected', () => {
    expect(validateWarhead(SIX).valid).toBe(true);
    expect(validateWarhead('hello').missing.length).toBe(6);
    expect(validateWarhead(REQUIRED_SECTIONS.join(' ')).valid).toBe(true);
  });
  test('dispatchTea preserves tool output verbatim', () => {
    const b = resolveWarhead(LAYER, 1, { count: 7 });
    const out = dispatchTea(b, 'my output');
    expect(out).toBe('my output\n\n' + b);
  });
});
