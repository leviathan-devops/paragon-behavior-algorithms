// ms-evidence-gates — tests/properties.ts
// 500-run determinism: same input → same verdict, pure TS loop with fixed seeds, NO fast-check.
import { evaluateCompliance, createEvidenceRecord, computeSignature } from '../src/core/engine.js';
import type { ToolEvidenceRecord } from '../src/core/types.js';

export function runProperties(): { pass: number; fail: number; failures: string[] } {
  let pass = 0, fail = 0;
  const failures: string[] = [];
  let seed = 0x87654321;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const tools = ['trident-container-test','bash','write','read','trident-code-audit'];
  for (let run = 0; run < 500; run++) {
    const demanded = tools[Math.floor(rand()*tools.length)];
    const pool: ToolEvidenceRecord[] = [];
    const n = Math.floor(rand()*5);
    for (let i=0;i<n;i++) {
      const tool = tools[Math.floor(rand()*tools.length)];
      const exit = rand()>0.3?0:1;
      const out = rand()>0.5? 'artifact results.json PASS detailed output exceeding fifty chars' : 'ok';
      const ts = Date.now() - Math.floor(rand()*600000);
      const rec = createEvidenceRecord(tool, {}, exit, out, ts);
      // occasionally tamper
      if (rand()<0.1) (rec as any).signature = 'tampered';
      pool.push(rec);
    }
    const windowMs = 300000;
    const a = evaluateCompliance(demanded, pool, windowMs);
    const b = evaluateCompliance(demanded, JSON.parse(JSON.stringify(pool)), windowMs);
    if (a.verdict===b.verdict && JSON.stringify(a.criteria)===JSON.stringify(b.criteria)) pass++;
    else { fail++; if (failures.length<5) failures.push(`run ${run}: non-deterministic verdict ${a.verdict} vs ${b.verdict}`); }
    // signature determinism
    if (pool.length>0) {
      const rec = pool[0];
      const s1 = computeSignature(rec);
      const s2 = computeSignature(rec);
      if (s1===s2) pass++; else fail++;
    } else pass++;
  }
  return { pass, fail, failures };
}
if (import.meta.main) console.log(runProperties());
