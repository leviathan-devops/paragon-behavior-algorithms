// ms-evidence-gates — tests/per-machine.test.ts
import { describe, test, expect } from 'bun:test';
import { evaluateCompliance, createEvidenceRecord, computeSignature, isGenuineCompliance } from '../src/core/engine.js';
import type { ToolEvidenceRecord } from '../src/core/types.js';
import { runProperties } from './properties.js';
import { FIVE_CRITERIA, FRESHNESS_WINDOW_MS } from '../src/machines/gates.js';

const DEMANDED = 'trident-container-test';

describe('per-machine: evidence-gates', () => {
  test('properties determinism 500 runs', () => {
    const r = runProperties();
    expect(r.fail).toBe(0);
  });
  test('gate fires: valid evidence → PASS (all 5 criteria)', () => {
    const ev = createEvidenceRecord(DEMANDED, {}, 0, 'artifact results.json PASS detailed output exceeding fifty chars', Date.now());
    const res = evaluateCompliance(DEMANDED, [ev]);
    expect(res.verdict).toBe('PASS');
  });
  test('gate passes escape: stale evidence → FAIL', () => {
    const ev = createEvidenceRecord(DEMANDED, {}, 0, 'artifact PASS', Date.now() - 600000);
    const res = evaluateCompliance(DEMANDED, [ev], 300000);
    expect(res.verdict).toBe('FAIL');
  });
  test('gate allows wrong tool → FAIL (no matching pool)', () => {
    const ev = createEvidenceRecord('bash', {}, 0, 'artifact PASS', Date.now());
    expect(evaluateCompliance(DEMANDED, [ev]).verdict).toBe('FAIL');
  });
  test('five criteria declared in machines config', () => {
    expect(FIVE_CRITERIA.length).toBe(5);
    expect(FRESHNESS_WINDOW_MS).toBe(300000);
  });
  test('signature determinism: same record same hash', () => {
    const ev = createEvidenceRecord(DEMANDED, { a: 1 }, 0, 'artifact PASS', 1234567890);
    expect(computeSignature(ev)).toBe(computeSignature(ev));
  });
  test('genuine vs minimum: exitCode 0 + artifact = genuine', () => {
    const genuine = createEvidenceRecord(DEMANDED, {}, 0, 'artifact results.json PASS detailed exceeding fifty chars', Date.now());
    expect(isGenuineCompliance(genuine)).toBe(true);
    const min = createEvidenceRecord(DEMANDED, {}, 0, 'ok', Date.now());
    expect(isGenuineCompliance(min)).toBe(false);
  });
});
