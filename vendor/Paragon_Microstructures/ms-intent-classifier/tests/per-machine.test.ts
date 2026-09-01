import { describe, it, expect } from 'bun:test';
import { classifyIntent } from '../src/index.js';
import type { LayerShape } from '../src/core/types.js';

function makeLayer(overrides: Partial<LayerShape> = {}): LayerShape {
  return {
    id: overrides.id ?? 'TEST_LAYER',
    threshold: overrides.threshold ?? 0.9,
    banks: overrides.banks ?? { descriptive: [], suggestive: [], substitute: [], use: [] },
    toolMatchers: overrides.toolMatchers ?? [{ toolName: 'bash' }],
    pbaContextBoost: overrides.pbaContextBoost,
  };
}

describe('ms-intent-classifier fusion', () => {
  it('pinned fusion 0.615 with PBA context', () => {
    const layer: LayerShape = {
      id: 'SMOKE_SUBSTITUTION',
      threshold: 0.9,
      banks: {
        descriptive: [],
        suggestive: [/bash/i, /bun test/i],
        substitute: [],
        use: [],
      },
      toolMatchers: [{ toolName: 'bash' }],
      pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 },
    };
    const toolCall = { toolName: 'bash', args: { command: 'bun test' } as Record<string, unknown> };
    const chainContext = { previousTools: [], chainViolations: ['verification-requires-audit'] };
    const pbaContext = {
      activeFamilies: ['TEST_EVASION'],
      latestSignals: [{ family: 'TEST_EVASION', confidence: 0.75, excerpt: 'let me just get this working first', seq: 1, sessionId: 's1' }],
      macroTier: 2,
    };
    const result = classifyIntent(toolCall, chainContext, pbaContext, [layer]);
    const expectedSource1 = (() => {
      const text = `${toolCall.toolName} ${JSON.stringify(toolCall.args)} ${pbaContext.latestSignals[0]!.excerpt}`;
      let pos = 0, neg = 0;
      for (const p of layer.banks.suggestive) if (text.match(p)) pos += 1;
      return pos / (pos + neg + 1);
    })();
    expect(expectedSource1).toBeCloseTo(0.6666667, 2);
    const total = expectedSource1 * 0.5 + 0.8 * 0.3 + 0.2 * 0.2;
    expect(total).toBeCloseTo(0.6133, 2);
    expect(result.confidence).toBeCloseTo(total, 2);
    expect(result.sources.toolMatch.confidence).toBeCloseTo(expectedSource1, 4);
    expect(result.sources.chainContext.confidence).toBe(0.8);
    expect(result.sources.pbaContext.confidence).toBe(0.2);
    expect(result.action).toBe('ADVISE');
  });

  it('pinned fusion 0.575 without PBA (source3=0)', () => {
    const layer: LayerShape = {
      id: 'SMOKE_SUBSTITUTION',
      threshold: 0.55,
      banks: {
        descriptive: [],
        suggestive: [/bash/i, /bun test/i],
        substitute: [],
        use: [],
      },
      toolMatchers: [{ toolName: 'bash' }],
      pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 },
    };
    const toolCall = { toolName: 'bash', args: { command: 'bun test' } as Record<string, unknown> };
    const chainContext = { previousTools: [], chainViolations: ['verification-requires-audit'] };
    const pbaContext = { activeFamilies: [], latestSignals: [], macroTier: 0 };
    const result = classifyIntent(toolCall, chainContext, pbaContext, [layer]);
    const total = result.confidence;
    expect(result.sources.pbaContext.confidence).toBe(0);
    expect(total).toBeCloseTo(0.5733, 2);
  });

  it('exact spec fusion arithmetic 0.615 vs 0.575', () => {
    const source1 = 0.67;
    const chain = 0.8;
    const pba = 0.2;
    const withPba = source1 * 0.5 + chain * 0.3 + pba * 0.2;
    const withoutPba = source1 * 0.5 + chain * 0.3 + 0 * 0.2;
    expect(withPba).toBeCloseTo(0.615, 10);
    expect(withoutPba).toBeCloseTo(0.575, 10);
    expect(withPba - withoutPba).toBeCloseTo(0.04, 10);
  });

  it('ENFORCE band >=threshold', () => {
    const layer: LayerShape = {
      id: 'ENFORCE_LAYER',
      threshold: 0.5,
      banks: { descriptive: [], suggestive: [/\bbash\b/i], substitute: [], use: [] },
      toolMatchers: [{ toolName: 'bash' }],
    };
    const toolCall = { toolName: 'bash', args: {} };
    const chainContext = { previousTools: [], chainViolations: ['x'] };
    const pbaContext = { activeFamilies: [], latestSignals: [], macroTier: 0 };
    const r = classifyIntent(toolCall, chainContext, pbaContext, [layer]);
    expect(r.action).toBe('BLOCK');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('DAMPEN band >=threshold*0.6', () => {
    const layer: LayerShape = {
      id: 'DAMPEN_LAYER',
      threshold: 0.9,
      banks: { descriptive: [], suggestive: [/\bbash\b/i], substitute: [], use: [] },
      toolMatchers: [{ toolName: 'bash' }],
    };
    const toolCall = { toolName: 'bash', args: {} };
    const chainContext = { previousTools: [], chainViolations: ['x'] };
    const pbaContext = { activeFamilies: [], latestSignals: [], macroTier: 0 };
    const r = classifyIntent(toolCall, chainContext, pbaContext, [layer]);
    expect(r.action).toBe('ADVISE');
    expect(r.confidence).toBeGreaterThanOrEqual(0.54);
    expect(r.confidence).toBeLessThan(0.9);
  });

  it('below band ALLOW', () => {
    const layer: LayerShape = {
      id: 'ALLOW_LAYER',
      threshold: 0.9,
      banks: { descriptive: [], suggestive: [], substitute: [], use: [] },
      toolMatchers: [{ toolName: 'bash' }],
    };
    const r = classifyIntent({ toolName: 'bash', args: {} }, { previousTools: [], chainViolations: [] }, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [layer]);
    expect(r.action).toBe('ALLOW');
    expect(r.layerId).toBeNull();
  });

  it('chain violation confidence 0.8 when violations exist 0.0 when none', () => {
    const layer: LayerShape = {
      id: 'L',
      threshold: 0.5,
      banks: { descriptive: [], suggestive: [/bash/i], substitute: [], use: [] },
      toolMatchers: [{ toolName: 'bash' }],
    };
    const withViol = classifyIntent({ toolName: 'bash', args: {} }, { previousTools: [], chainViolations: ['v1'] }, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [layer]);
    expect(withViol.sources.chainContext.confidence).toBe(0.8);
    const withoutViol = classifyIntent({ toolName: 'bash', args: {} }, { previousTools: [], chainViolations: [] }, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [layer]);
    expect(withoutViol.sources.chainContext.confidence).toBe(0);
    expect(withViol.confidence).toBeGreaterThan(withoutViol.confidence);
  });

  it('pba boost capped at 1.0', () => {
    const layer: LayerShape = {
      id: 'CAP_LAYER',
      threshold: 0.3,
      banks: { descriptive: [], suggestive: [/\bbash\b/i], substitute: [], use: [] },
      toolMatchers: [{ toolName: 'bash' }],
      pbaContextBoost: { families: ['A', 'B', 'C', 'D', 'E', 'F'], boostAmount: 0.3 },
    };
    const pbaContext = {
      activeFamilies: ['A', 'B', 'C', 'D', 'E', 'F'],
      latestSignals: [],
      macroTier: 0,
    };
    const r = classifyIntent({ toolName: 'bash', args: {} }, { previousTools: [], chainViolations: ['x'] }, pbaContext, [layer]);
    expect(r.sources.pbaContext.confidence).toBe(1.0);
    expect(r.sources.pbaContext.confidence).toBeLessThanOrEqual(1.0);
  });

  it('toolMatcher argPatterns filtering', () => {
    const layer: LayerShape = {
      id: 'ARG_LAYER',
      threshold: 0.3,
      banks: { descriptive: [], suggestive: [/\bbun test\b/i], substitute: [], use: [] },
      toolMatchers: [{ toolName: 'bash', argPatterns: { command: ['*test*'] } }],
    };
    const miss = classifyIntent({ toolName: 'bash', args: { command: 'echo hello' } }, { previousTools: [], chainViolations: [] }, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [layer]);
    expect(miss.action).toBe('ALLOW');
    const hit = classifyIntent({ toolName: 'bash', args: { command: 'bun test' } }, { previousTools: [], chainViolations: ['x'] }, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [layer]);
    expect(hit.action).not.toBe('ALLOW');
  });

  it('null handling throws', () => {
    expect(() => classifyIntent(null as unknown as never, { previousTools: [], chainViolations: [] }, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [])).toThrow();
    expect(() => classifyIntent({ toolName: 'bash', args: {} }, null as unknown as never, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [])).toThrow();
  });

  it('concurrent classify is pure', async () => {
    const layer = makeLayer({ threshold: 0.3, banks: { descriptive: [], suggestive: [/\ba\b/i], substitute: [], use: [] }, toolMatchers: [{ toolName: 'bash' }] });
    const results = await Promise.all([
      Promise.resolve(classifyIntent({ toolName: 'bash', args: { x: 'a' } }, { previousTools: [], chainViolations: ['x'] }, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [layer])),
      Promise.resolve(classifyIntent({ toolName: 'bash', args: { x: 'b' } }, { previousTools: [], chainViolations: ['x'] }, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [layer])),
    ]);
    expect(results[0].confidence).toBeGreaterThan(results[1].confidence);
  });
});
