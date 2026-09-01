// ms-compliance-collector — tests/properties.ts
// Property-based determinism: same input → same verdict, 500 runs, fixed seeds, no fast-check.

import { ComplianceCollector, verifySignature } from '../src/index.js';

type Case = { name: string; run: (seed: number) => boolean };

function seededString(seed: number, len: number): string {
  let s = '';
  let x = seed >>> 0;
  for (let i = 0; i < len; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    s += String.fromCharCode(97 + (x % 26));
  }
  return s;
}

const cases: Case[] = [
  {
    name: 'measureCompliance determinism: same tool/args/exit/output → same boolean and signature',
    run(seed) {
      const tool = seededString(seed, 4);
      const output = seededString(seed + 1, 8);
      const c1 = new ComplianceCollector();
      const c2 = new ComplianceCollector();
      const v1 = c1.measureCompliance(tool, { x: seed }, 0, output);
      const v2 = c2.measureCompliance(tool, { x: seed }, 0, output);
      const r1 = c1.getRecords()[0];
      const r2 = c2.getRecords()[0];
      return v1 === v2 && r1.signature === r2.signature && verifySignature(r1) && verifySignature(r2);
    },
  },
  {
    name: 'verifySignature tamper detection determinism',
    run(seed) {
      const c = new ComplianceCollector();
      c.measureCompliance('tool-' + seed, { n: seed }, 0, 'out-' + seed);
      const rec = c.getRecords()[0];
      const ok = verifySignature(rec);
      const tampered = { ...rec, output: rec.output + 'x' };
      const bad = verifySignature(tampered);
      return ok === true && bad === false;
    },
  },
  {
    name: 'clear determinism: after clear getRecords empty',
    run(seed) {
      const c = new ComplianceCollector();
      c.measureCompliance('t' + seed, {}, 0, 'o');
      c.recordOffense('L' + seed, { v: seed });
      c.clear();
      return c.getRecords().length === 0 && c.getOffenses().length === 0;
    },
  },
  {
    name: 'exitCode determinism: 0→true non-0→false',
    run(seed) {
      const code = seed % 4;
      const c = new ComplianceCollector();
      const v = c.measureCompliance('tool', {}, code, 'out');
      return v === (code === 0);
    },
  },
];

export function runProperties(): { pass: number; fail: number; failures: string[] } {
  let pass = 0, fail = 0;
  const failures: string[] = [];
  for (let run = 0; run < 500; run++) {
    for (const c of cases) {
      let ok = false;
      try { ok = c.run(run * 1000 + cases.indexOf(c)); } catch (e) { ok = false; failures.push(`${c.name} run ${run} threw: ${String(e)}`); }
      if (ok) pass++; else { fail++; if (failures.length < 10) failures.push(`run ${run} case "${c.name}" failed`); }
    }
  }
  return { pass, fail, failures };
}

if (import.meta.main) {
  const r = runProperties();
  console.log(`properties: pass=${r.pass} fail=${r.fail}`);
  if (r.failures.length) console.log(r.failures.join('\n'));
  if (r.fail !== 0) process.exit(1);
}

// --- bun:test harness so bun test actually executes the 500-run suite ---
import { describe, test as bunTest, expect as bunExpect } from 'bun:test';
const _r = runProperties();
describe('properties 500-run determinism', () => {
  bunTest('same input → same verdict for 500 seeds', () => {
    if (_r.fail > 0) console.log(_r.failures.slice(0, 10).join('\n'));
    bunExpect(_r.fail).toBe(0);
    bunExpect(_r.pass).toBeGreaterThan(0);
  });
});
