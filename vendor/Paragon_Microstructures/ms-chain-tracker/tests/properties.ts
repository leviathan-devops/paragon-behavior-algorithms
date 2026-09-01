// ms-chain-tracker — tests/properties.ts — 500-run determinism: same input → same verdict
// Pure TS loop with fixed seeds, NO fast-check dependency.
import { ChainTracker } from '../src/core/engine.js';

function seededCalls(seed: number, n: number): Array<{ tool: string; output: string }> {
  // Deterministic pseudo-random via LCG seeded by seed+index
  const tools = ['bash', 'read', 'write', 'trident-code-audit'];
  const outs = ['a', 'b', 'same', 'x'.repeat(10)];
  const out: Array<{ tool: string; output: string }> = [];
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (1664525 * s + 1013904223) >>> 0;
    out.push({ tool: tools[s % tools.length]!, output: outs[(s >>> 4) % outs.length]! });
  }
  return out;
}

export function runProperties(): { pass: number; fail: number; failures: string[] } {
  let pass = 0, fail = 0;
  const failures: string[] = [];
  for (let run = 0; run < 500; run++) {
    const seed = 0x9e3779b9 ^ (run * 0x85ebca6b);
    const calls = seededCalls(seed, 12);

    // Two trackers with identical sequences must produce identical verdicts
    const a = new ChainTracker(); const b = new ChainTracker();
    for (const c of calls) { a.recordCall('s1', c.tool, {}); b.recordCall('s1', c.tool, {}); a.recordResult('s1', c.tool, 0, c.output); b.recordResult('s1', c.tool, 0, c.output); }
    const loopA = a.detectLoop('s1', 10); const loopB = b.detectLoop('s1', 10);
    const rules: any[] = [{ name: 'needs-audit', description: 'd', requires: [{ tool: 'trident-code-audit' }], violation: { layerId: 'L1' } }];
    // deterministic rule eval: both trackers share same wasCalled state
    const vA = a.evaluateRules('s1', 'bash', {}, rules); const vB = b.evaluateRules('s1', 'bash', {}, rules);
    const sameLoop = loopA === loopB;
    const sameViol = JSON.stringify(vA) === JSON.stringify(vB);
    if (sameLoop && sameViol) pass++;
    else { fail++; if (failures.length < 10) failures.push(`run ${run}: loop ${loopA}≠${loopB} or viol ${JSON.stringify(vA)}≠${JSON.stringify(vB)}`); }

    // Idempotence check: re-evaluate without mutation yields same
    const vA2 = a.evaluateRules('s1', 'bash', {}, rules);
    if (JSON.stringify(vA) !== JSON.stringify(vA2)) { fail++; if (failures.length < 10) failures.push(`run ${run}: non-idempotent evaluateRules`); }
    else pass++;
  }
  return { pass, fail, failures };
}

if (import.meta.main) console.log(runProperties());
