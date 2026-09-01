import { describe, it, expect } from 'bun:test';
import { classifyIntent } from '../src/index.js';
import type { LayerShape } from '../src/core/types.js';

const LAYERS: LayerShape[] = [
  { id: 'SMOKE', threshold: 0.9, banks: { descriptive: [], suggestive: [/bash/i, /bun test/i], substitute: [], use: [] }, toolMatchers: [{ toolName: 'bash' }], pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 } },
  { id: 'LOW', threshold: 0.3, banks: { descriptive: [], suggestive: [/\bbash\b/i], substitute: [], use: [] }, toolMatchers: [{ toolName: 'bash' }] },
];

describe('ms-intent-classifier determinism 500 runs', () => {
  it('same input → same intent 500 runs', () => {
    for (let run = 0; run < 500; run++) {
      const toolCall = { toolName: 'bash', args: { command: 'bun test' } as Record<string, unknown> };
      const chain = { previousTools: [], chainViolations: ['x'] };
      const pba = { activeFamilies: ['TEST_EVASION'], latestSignals: [{ family: 'TEST_EVASION', confidence: 0.75, excerpt: 'let me just get this working', seq: 1, sessionId: 's1' }], macroTier: 2 };
      const a = classifyIntent(toolCall, chain, pba, LAYERS);
      const b = classifyIntent(toolCall, chain, pba, LAYERS);
      expect(a.action).toBe(b.action);
      expect(a.confidence).toBe(b.confidence);
      expect(a.layerId).toBe(b.layerId);
      expect(JSON.stringify(a.sources)).toBe(JSON.stringify(b.sources));
    }
  });

  it('fusion arithmetic stable 500 runs', () => {
    for (let run = 0; run < 500; run++) {
      const s1 = 0.67, chain = 0.8, pba = 0.2;
      const withPba = s1 * 0.5 + chain * 0.3 + pba * 0.2;
      const without = s1 * 0.5 + chain * 0.3;
      expect(withPba).toBeCloseTo(0.615, 10);
      expect(without).toBeCloseTo(0.575, 10);
    }
  });

  it('ALLOW vs BLOCK boundary stable 500 runs', () => {
    for (let run = 0; run < 500; run++) {
      const allow = classifyIntent({ toolName: 'bash', args: {} }, { previousTools: [], chainViolations: [] }, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [{ id: 'ALLOW', threshold: 0.9, banks: { descriptive: [], suggestive: [], substitute: [], use: [] }, toolMatchers: [{ toolName: 'bash' }] }]);
      expect(allow.action).toBe('ALLOW');
      const block = classifyIntent({ toolName: 'bash', args: {} }, { previousTools: [], chainViolations: ['x'] }, { activeFamilies: [], latestSignals: [], macroTier: 0 }, [{ id: 'BLOCK', threshold: 0.5, banks: { descriptive: [], suggestive: [/\bbash\b/i], substitute: [], use: [] }, toolMatchers: [{ toolName: 'bash' }] }]);
      expect(block.action).toBe('BLOCK');
    }
  });
});
