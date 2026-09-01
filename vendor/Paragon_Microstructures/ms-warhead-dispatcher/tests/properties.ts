// ms-warhead-dispatcher — tests/properties.ts
// 500-run determinism: same input → same verdict, pure TS loop with fixed seeds, NO fast-check.
import { fillTemplate, resolveWarhead, validateWarhead, dispatchTea } from '../src/core/engine.js';
import type { WarheadLayer } from '../src/core/types.js';

const LAYER: WarheadLayer = {
  id: 'SMOKE_TEST_GUARD',
  enforcement: {
    tier1: 'DETECTED: {toolName}\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c {count} {correctTool}',
    tier2: 'DETECTED: {toolName}\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c {escalationCount}',
    tier3: 'DETECTED: blocked\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c {chainViolations}',
    tier4: 'DETECTED: x\nWHY THIS FIRED: y\nWHAT THIS MEANS: z\nCORRECT BEHAVIOR: a\nSELF-CHECK: b\nRESET PATH: c {pbaFamilies} {pbaTier}',
  }
};

export function runProperties(): { pass: number; fail: number; failures: string[] } {
  let pass = 0, fail = 0;
  const failures: string[] = [];
  let seed = 0x12345678;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  for (let run = 0; run < 500; run++) {
    const ctx = {
      count: Math.floor(rand()*10)+1,
      toolName: ['bash','write','edit'][Math.floor(rand()*3)],
      args: JSON.stringify({ cmd: 'x'+run }),
      chainViolations: rand()>0.5? 'ruleA' : 'none',
      pbaFamilies: rand()>0.5? 'TEST_EVASION' : 'none',
      pbaTier: Math.floor(rand()*5),
      escalationCount: Math.floor(rand()*5),
      correctTool: 'trident-container-test',
      anchor: `pta:${run}`,
    };
    const tier = (Math.floor(rand()*4)+1) as 1|2|3|4;
    const a = resolveWarhead(LAYER, tier, ctx);
    const b = resolveWarhead(LAYER, tier, ctx);
    if (a === b) pass++; else { fail++; if (failures.length<5) failures.push(`run ${run}: resolveWarhead non-deterministic tier ${tier}`); }
    const f = fillTemplate(LAYER.enforcement[`tier${tier}`], ctx);
    const g = fillTemplate(LAYER.enforcement[`tier${tier}`], ctx);
    if (f === g) pass++; else { fail++; failures.push(`fillTemplate non-deterministic`); }
    const v1 = validateWarhead(a);
    const v2 = validateWarhead(b);
    if (v1.valid === v2.valid && JSON.stringify(v1.missing)===JSON.stringify(v2.missing)) pass++; else fail++;
    const tea1 = dispatchTea(a, 'tool output '+run);
    const tea2 = dispatchTea(a, 'tool output '+run);
    if (tea1===tea2) pass++; else fail++;
  }
  return { pass, fail, failures };
}
if (import.meta.main) console.log(runProperties());
