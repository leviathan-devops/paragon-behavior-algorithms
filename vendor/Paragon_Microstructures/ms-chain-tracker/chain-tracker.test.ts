import { describe, test, expect } from 'bun:test';
import { ChainTracker } from './index.js';

describe('ms-chain-tracker', () => {
  test('prerequisite satisfied -> no violation', () => {
    const ct = new ChainTracker();
    ct.recordCall('s1', 'trident-code-audit', {});
    const v = ct.evaluateRules('s1', 'bash', {}, [{ name: 'needs-audit', description: 'd', requires: [{ tool: 'trident-code-audit' }], violation: { layerId: 'L1' } }]);
    expect(v.length).toBe(0);
  });
  test('prerequisite missing -> MISSING_PREREQUISITE with ruleName+layerId', () => {
    const ct = new ChainTracker();
    const v = ct.evaluateRules('s1', 'bash', {}, [{ name: 'needs-audit', description: 'd', requires: [{ tool: 'trident-code-audit' }], violation: { layerId: 'L1' } }]);
    expect(v.length).toBe(1);
    expect(v[0]!.violationType).toBe('MISSING_PREREQUISITE');
    expect(v[0]!.ruleName).toBe('needs-audit');
    expect(v[0]!.layerId).toBe('L1');
  });
  test('forbidden precedent hit -> FORBIDDEN_PRECEDENT', () => {
    const ct = new ChainTracker();
    ct.recordCall('s1', 'bash', {});
    const v = ct.evaluateRules('s1', 'ship', {}, [{ name: 'no-bash-before-ship', description: 'd', forbids: [{ tool: 'bash' }], violation: { layerId: 'L2' } }]);
    expect(v[0]!.violationType).toBe('FORBIDDEN_PRECEDENT');
  });
  test('forbidden precedent clean -> no violation', () => {
    const ct = new ChainTracker();
    ct.recordCall('s1', 'read', {});
    const v = ct.evaluateRules('s1', 'ship', {}, [{ name: 'no-bash-before-ship', description: 'd', forbids: [{ tool: 'bash' }], violation: { layerId: 'L2' } }]);
    expect(v.length).toBe(0);
  });
  test('loop detection same tool x3 same output -> true', () => {
    const ct = new ChainTracker();
    for (let i = 0; i < 3; i++) { ct.recordCall('s1', 'bash', {}); ct.recordResult('s1', 'bash', 0, 'same'); }
    expect(ct.detectLoop('s1', 10)).toBe(true);
  });
  test('loop detection x3 varying outputs -> false', () => {
    const ct = new ChainTracker();
    ct.recordCall('s1', 'bash', {}); ct.recordResult('s1', 'bash', 0, 'a');
    ct.recordCall('s1', 'bash', {}); ct.recordResult('s1', 'bash', 0, 'b');
    ct.recordCall('s1', 'bash', {}); ct.recordResult('s1', 'bash', 0, 'c');
    expect(ct.detectLoop('s1', 10)).toBe(false);
  });
  test('loop detection x2 same output -> false', () => {
    const ct = new ChainTracker();
    ct.recordCall('s1', 'bash', {}); ct.recordResult('s1', 'bash', 0, 'same');
    ct.recordCall('s1', 'bash', {}); ct.recordResult('s1', 'bash', 0, 'same');
    expect(ct.detectLoop('s1', 10)).toBe(false);
  });
  test('window edge: loop outside window -> false', () => {
    const ct = new ChainTracker();
    for (let i = 0; i < 3; i++) { ct.recordCall('s1', 'bash', {}); ct.recordResult('s1', 'bash', 0, 'same'); }
    for (let i = 0; i < 10; i++) { ct.recordCall('s1', `tool-a-${i}`, {}); }
    expect(ct.detectLoop('s1', 10)).toBe(false);
  });
  test('history cap at 100 evicts first', () => {
    const ct = new ChainTracker();
    for (let i = 0; i < 101; i++) ct.recordCall('s1', `tool-${i}`, {});
    expect(ct._getHistoryLength('s1')).toBe(100);
    expect(ct._getHistory('s1')[0]!.tool).toBe('tool-1');
    expect(ct.wasCalled('s1', 'tool-0')).toBe(false);
    expect(ct.wasCalled('s1', 'tool-100')).toBe(true);
  });
  test('output capping at 500 chars', () => {
    const ct = new ChainTracker();
    ct.recordCall('s1', 'bash', {});
    ct.recordResult('s1', 'bash', 0, 'x'.repeat(1000));
    expect(ct._getHistory('s1')[0]!.output!.length).toBe(500);
  });
  test('wasCalled with RegExp', () => {
    const ct = new ChainTracker();
    ct.recordCall('s1', 'trident-code-audit', {});
    expect(ct.wasCalled('s1', /trident-.*/)).toBe(true);
    expect(ct.wasCalled('s1', /nomatch/)).toBe(false);
  });
  test('withinMs expiry vs session-default', () => {
    const ct = new ChainTracker();
    ct.recordCall('s1', 'bash', {});
    expect(ct.wasCalled('s1', 'bash')).toBe(true);
    expect(ct.wasCalled('s1', 'bash', 1)).toBe(true);
    // manipulate time: set first call old
    const h = (ct as unknown as { sessions: Map<string, { at: number; tool: string }[]> }).sessions.get('s1')!;
    h[0]!.at = Date.now() - 10000;
    expect(ct.wasCalled('s1', 'bash', 100)).toBe(false);
    expect(ct.wasCalled('s1', 'bash')).toBe(true);
  });
  test('recordResult attaches to most recent unresolved', () => {
    const ct = new ChainTracker();
    ct.recordCall('s1', 'bash', { id: 1 });
    ct.recordCall('s1', 'bash', { id: 2 });
    ct.recordResult('s1', 'bash', 0, 'result2');
    const hist = ct._getHistory('s1');
    expect(hist[1]!.output).toBe('result2');
    expect(hist[0]!.output).toBeUndefined();
    ct.recordResult('s1', 'bash', 0, 'result1');
    expect(ct._getHistory('s1')[0]!.output).toBe('result1');
  });
  test('empty session queries return clean', () => {
    const ct = new ChainTracker();
    expect(ct.wasCalled('empty', 'bash')).toBe(false);
    expect(ct.recentTools('empty', 5)).toEqual([]);
    expect(ct.detectLoop('empty')).toBe(false);
    expect(ct.evaluateRules('empty', 'bash', {}, [])).toEqual([]);
  });
});
