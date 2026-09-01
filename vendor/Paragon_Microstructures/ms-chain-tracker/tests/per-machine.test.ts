// ms-chain-tracker — tests/per-machine.test.ts (per-machine behavior — firewall that never fires is theater)
import { describe, test, expect } from 'bun:test';
import { ChainTracker } from '../src/core/engine.js';
import { runProperties } from './properties.js';

describe('ms-chain-tracker per-machine', () => {
  test('evaluates prerequisite missing vs satisfied (must fire + must not fire)', () => {
    const ct = new ChainTracker();
    // must NOT fire when prerequisite present
    ct.recordCall('s1', 'trident-code-audit', {});
    expect(ct.evaluateRules('s1', 'bash', {}, [{ name: 'needs-audit', description: 'd', requires: [{ tool: 'trident-code-audit' }], violation: { layerId: 'L1' } }])).toEqual([]);
    // must fire when prerequisite missing
    const ct2 = new ChainTracker();
    const v = ct2.evaluateRules('s1', 'bash', {}, [{ name: 'needs-audit', description: 'd', requires: [{ tool: 'trident-code-audit' }], violation: { layerId: 'L1' } }]);
    expect(v[0]!.violationType).toBe('MISSING_PREREQUISITE');
  });
  test('forbidden precedent: fires on hit, suppresses on clean', () => {
    const ct = new ChainTracker(); ct.recordCall('s1', 'bash', {});
    expect(ct.evaluateRules('s1', 'ship', {}, [{ name: 'no-bash-before-ship', description: 'd', forbids: [{ tool: 'bash' }], violation: { layerId: 'L2' } }])[0]!.violationType).toBe('FORBIDDEN_PRECEDENT');
    const ct2 = new ChainTracker(); ct2.recordCall('s1', 'read', {});
    expect(ct2.evaluateRules('s1', 'ship', {}, [{ name: 'no-bash-before-ship', description: 'd', forbids: [{ tool: 'bash' }], violation: { layerId: 'L2' } }])).toEqual([]);
  });
  test('loop detection: fires on >=3 same tool same output, suppresses on varying/x2', () => {
    const ct = new ChainTracker(); for (let i=0;i<3;i++){ct.recordCall('s1','bash',{}); ct.recordResult('s1','bash',0,'same');}
    expect(ct.detectLoop('s1',10)).toBe(true);
    const ct2 = new ChainTracker(); ct2.recordCall('s1','bash',{}); ct2.recordResult('s1','bash',0,'a'); ct2.recordCall('s1','bash',{}); ct2.recordResult('s1','bash',0,'b'); ct2.recordCall('s1','bash',{}); ct2.recordResult('s1','bash',0,'c');
    expect(ct2.detectLoop('s1',10)).toBe(false);
  });
  test('500-run determinism: same input → same verdict', () => {
    const r = runProperties(); expect(r.fail).toBe(0);
  });
});
