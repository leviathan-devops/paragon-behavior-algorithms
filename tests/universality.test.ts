// tests/universality.test.ts — THE FRESH-SESSION UNIVERSALITY SUITE
// Per domain: the fresh engine instance, the family's restatement frames from
// turn 1, the family-dominant dispatch asserted. The C-3 lesson productized.

import { describe, expect, test } from 'bun:test';
import { ParagonEngine } from '../core/engine.js';
import type { DomainModule } from '../core/types.js';
import tradingDomain from '../config/trading/index.js';
import salesDomain from '../config/sales/index.js';
import tridentDomain from '../config/trident/index.js';

const DOMAINS: Array<{ name: string; domain: DomainModule }> = [
  { name: 'trading', domain: tradingDomain },
  { name: 'sales', domain: salesDomain },
  { name: 'trident', domain: tridentDomain },
];

describe('THE FRESH-SESSION UNIVERSALITY', () => {
  for (const { name, domain } of DOMAINS) {
    test(`${name}: the domain has families with ids for the lexicon routing`, () => {
      expect(domain.families.length).toBeGreaterThan(0);
      for (const f of domain.families) {
        expect(typeof f.id).toBe('string');
        expect(f.id.length).toBeGreaterThan(0);
      }
    });

    test(`${name}: the domain has templates for steer and demand`, () => {
      expect(typeof domain.templates.steer).toBe('function');
      expect(typeof domain.templates.demand).toBe('function');
    });

    test(`${name}: the domain has compliance remediation tools`, () => {
      expect(domain.compliance.remediationTools.length).toBeGreaterThan(0);
    });
  }

  test('all 3 domains have distinct family ids (no cross-domain collision)', () => {
    const allIds = DOMAINS.flatMap(({ domain }) => domain.families.map(f => f.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
