// tests/paragon.test.ts — THE DOMAIN-FIXTURE BATTERY
//
// Loads each reference domain and runs the same pin structure:
// the family exampleHits, the behavioral checks, the templates, the minimal pair.

import { describe, expect, test } from 'bun:test';
import { classify, scoreSignals, confidence } from '../core/classifier.js';
import { V2Synapse } from '../core/synapse.js';
import { step, createInitialRecord } from '../core/machine.js';
import { GateEngine } from '../core/gate-engine.js';
import { ComplianceCollector } from '../core/collector.js';
import { RoleGate } from '../core/role-gate.js';
import { CircuitBreaker } from '../core/circuit.js';
import type { PatternFamilyMember, DomainModule, BehavioralState } from '../core/types.js';

import tridentDomain from '../config/trident/index.js';
import tradingDomain from '../config/trading/index.js';
import salesDomain from '../config/sales/index.js';

const ALL_DOMAINS: DomainModule[] = [tridentDomain, tradingDomain, salesDomain];

// ═══ THE CLASSIFIER PINS (the ratio math) ═══
describe('THE RATIO CLASSIFIER (the core intelligence)', () => {
  test('confidence(2,0) = 2/3', () => { expect(confidence(2, 0)).toBeCloseTo(2 / 3); });
  test('confidence(1,1) = 1/3', () => { expect(confidence(1, 1)).toBeCloseTo(1 / 3); });
  test('confidence(0,3) = 0', () => { expect(confidence(0, 3)).toBe(0); });
  test('confidence is bounded [0,1)', () => {
    expect(confidence(5, 0)).toBeLessThan(1);
    expect(confidence(4, 0)).toBeGreaterThan(confidence(2, 0));
  });
});

// ═══ THE DOMAIN-FIXTURE PINS (per domain) ═══
for (const domain of ALL_DOMAINS) {
  describe(`DOMAIN: ${domain.name}`, () => {
    // The family exampleHits
    for (const member of domain.families) {
      for (const hit of member.exampleHits) {
        test(`${member.id}: "${hit.text.slice(0, 40)}" → ${hit.shouldFlag ? 'FIRE' : 'SILENT'}`, () => {
          const result = classify({ text: hit.text }, domain.families);
          if (hit.shouldFlag) {
            expect(result.confidence).toBeGreaterThan(0);
          } else {
            expect(result.action).toBe('allow');
          }
        });
      }
    }

    // The templates render with the domain name
    test('STEER template renders with the family signals and the anchor', () => {
      const text = domain.templates.steer('TEST_FAMILY', 'test:1');
      expect(text.length).toBeGreaterThan(20);
      expect(text).toContain('TEST_FAMILY');
      expect(text).toContain('test:1');
    });

    test('DEMAND template renders', () => {
      const text = domain.templates.demand('TEST', 'test:1');
      expect(text).toContain('not satisfied');
    });

    test('MANDATE template renders', () => {
      const text = domain.templates.mandate(3);
      expect(text).toContain('tier 3');
      expect(text).toContain('blocked');
    });

    // The minimal pair (the anti-regex proof)
    test('MINIMAL PAIR: same intent domain, different verdicts', () => {
      const evasion = classify({ text: domain.testFixtures.evasionText }, domain.families);
      const legitimate = classify({ text: domain.testFixtures.legitimateText }, domain.families);
      expect(evasion.confidence).toBeGreaterThan(legitimate.confidence);
    });

    // The compliance has the escape hatches
    test('compliance defines escape hatches', () => {
      expect(domain.compliance.escapeHatches.length).toBeGreaterThan(0);
      expect(domain.compliance.remediationTools.length).toBeGreaterThan(0);
    });
  });
}

// ═══ THE MACHINE PINS (the state lattice) ═══
describe('THE STATE MACHINE', () => {
  test('IDLE → MONITORING on FIRST_SIGNAL', () => {
    const rec = createInitialRecord('test', 'FULL');
    const result = step(rec, {
      type: 'FIRST_SIGNAL', payload: { family: 'TEST' },
      triad: { pattern: { memberId: 't' }, state: { from: 'IDLE', to: 'MONITORING' },
               evidence: { file: 'f', line: 1 }, seq: 1, observedAt: Date.now() },
    });
    expect(result.kind).toBe('TRANSITIONED');
    if (result.kind === 'TRANSITIONED') expect(result.record.state).toBe('MONITORING');
  });

  test('IDLE → stays IDLE at OFF (the kill switch)', () => {
    const rec = createInitialRecord('test', 'OFF');
    const result = step(rec, {
      type: 'FIRST_SIGNAL', payload: { family: 'TEST' },
      triad: { pattern: { memberId: 't' }, state: { from: 'IDLE', to: 'MONITORING' },
               evidence: { file: 'f', line: 1 }, seq: 1, observedAt: Date.now() },
    });
    expect(result.kind).toBe('UNCHANGED');
  });

  test('MONITORING → PRIMED on PATTERN_HIT', () => {
    let rec = createInitialRecord('test', 'FULL');
    rec = { ...rec, state: 'MONITORING' };
    const result = step(rec, {
      type: 'PATTERN_HIT', payload: { patternId: 'TEST_PATTERN' },
      triad: { pattern: { memberId: 'p' }, state: { from: 'MONITORING', to: 'PRIMED' },
               evidence: { file: 'f', line: 1 }, seq: 1, observedAt: Date.now() },
    });
    expect(result.kind).toBe('TRANSITIONED');
    if (result.kind === 'TRANSITIONED') expect(result.record.state).toBe('PRIMED');
  });

  test('INTERVENING → MONITORING on COMPLIANCE_VERIFIED (tier reset)', () => {
    let rec = createInitialRecord('test', 'FULL');
    rec = { ...rec, state: 'INTERVENING', tier: 3, lastComplianceVerified: false };
    const result = step(rec, {
      type: 'COMPLIANCE_VERIFIED', payload: { verified: true },
      triad: { pattern: { memberId: 'c' }, state: { from: 'INTERVENING', to: 'MONITORING' },
               evidence: { file: 'f', line: 1 }, seq: 1, observedAt: Date.now() },
    });
    expect(result.kind).toBe('TRANSITIONED');
    if (result.kind === 'TRANSITIONED') {
      expect(result.record.state).toBe('MONITORING');
      expect(result.record.tier).toBe(0);
    }
  });
});

// ═══ THE ROLE GATE PINS ═══
describe('THE ROLE GATE', () => {
  test('user parts are dropped', () => {
    const gate = new RoleGate();
    gate.observe({ type: 'message.updated', properties: { info: { id: 'msg1', role: 'user' } } });
    expect(gate.roleFor({
      type: 'message.part.updated',
      properties: { part: { messageID: 'msg1', type: 'text', text: 'test' } },
    })).toBe('user');
    expect(gate.shouldProcess({
      type: 'message.part.updated',
      properties: { part: { messageID: 'msg1', type: 'text', text: 'test' } },
    })).toBe(false);
  });

  test('assistant parts pass', () => {
    const gate = new RoleGate();
    gate.observe({ type: 'message.updated', properties: { info: { id: 'msg2', role: 'assistant' } } });
    expect(gate.shouldProcess({
      type: 'message.part.updated',
      properties: { part: { messageID: 'msg2', type: 'text', text: 'test' } },
    })).toBe(true);
  });

  test('unknown role is dropped (fail-closed)', () => {
    const gate = new RoleGate();
    expect(gate.shouldProcess({
      type: 'message.part.updated',
      properties: { part: { messageID: 'unknown', type: 'text', text: 'test' } },
    })).toBe(false);
  });
});

// ═══ THE GATE ENGINE PINS (the fresh-subset) ═══
describe('THE GATE ENGINE', () => {
  test('empty evidence → INCONCLUSIVE', async () => {
    const engine = new GateEngine();
    engine.registerGate({ gateId: 'test', description: 'd',
      minEvidenceCount: 1, requiredEvidenceTypes: ['audit_log'], ttlMs: 300000 });
    const result = await engine.evaluate('test', []);
    expect(result.verdict).not.toBe('PASS');
  });

  test('fresh evidence → PASS', async () => {
    const engine = new GateEngine();
    engine.registerGate({ gateId: 'test', description: 'd',
      minEvidenceCount: 1, requiredEvidenceTypes: ['audit_log'], ttlMs: 300000 });
    const ev = { id: '1', gateId: 'test', operationId: 'op', type: 'audit_log' as const,
      data: {}, signature: 'sig', timestamp: Date.now(), verified: true };
    const result = await engine.evaluate('test', [ev]);
    expect(result.verdict).toBe('PASS');
  });

  test('stale evidence excluded from evaluation', async () => {
    const engine = new GateEngine();
    engine.registerGate({ gateId: 'test', description: 'd',
      minEvidenceCount: 1, requiredEvidenceTypes: [], ttlMs: 1000 });
    const stale = { id: '1', gateId: 'test', operationId: 'op', type: 'audit_log' as const,
      data: {}, signature: 'sig', timestamp: Date.now() - 100000, verified: false };
    const result = await engine.evaluate('test', [stale]);
    expect(result.evidenceEvaluated).toBe(0);
    expect(result.verdict).not.toBe('PASS');
  });
});

// ═══ THE COLLECTOR PINS ═══
describe('THE COMPLIANCE COLLECTOR', () => {
  test('recordOffense produces an audit_log', async () => {
    const collector = new ComplianceCollector();
    const rec = await collector.recordOffense({ memberId: 'test', family: 'TEST' }, 1);
    expect(rec.type).toBe('audit_log');
    expect(collector.getRecords().length).toBe(1);
  });

  test('measureCompliance detects verified', async () => {
    const collector = new ComplianceCollector();
    const entry = await collector.measureCompliance(
      { toolClass: 'test', toolPattern: /test/ },
      [{ tool: 'test', args: {}, exitCode: 0 }],
    );
    expect(entry.complianceVerified).toBe(true);
    expect(entry.evidence.type).toBe('test_result');
  });
});

// ═══ THE CIRCUIT BREAKER PINS ═══
describe('THE CIRCUIT BREAKER', () => {
  test('opens after threshold failures', () => {
    const cb = new CircuitBreaker(3);
    cb.recordFailure(); cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');
  });

  test('escape hatch passes when open', () => {
    const cb = new CircuitBreaker(1);
    cb.setEscapeHatches(['test-instrument']);
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');
    expect(cb.allowRequest('test-instrument')).toBe(true);
    expect(cb.allowRequest('generic-tool')).toBe(false);
  });

  test('closes on success', () => {
    const cb = new CircuitBreaker(1);
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.getState()).toBe('CLOSED');
  });
});

// ═══ THE SYNAPSE PINS ═══
describe('THE SYNAPSE', () => {
  test('accumulate + canFire at threshold', () => {
    const synapse = new V2Synapse({ fire: { TEST: 1.0 }, decayAlpha: 0.05, refractorySeq: 25 });
    const violation = { memberId: 'm', family: 'TEST', plane: 'reasoning' as const,
      excerpt: 'e', anchor: { seq: 1, ts: Date.now(), sessionID: 's' }, weight: 1.2 };
    synapse.accumulate(violation, 1);
    expect(synapse.canAnyFire(2)).toBe(true);
  });
});
