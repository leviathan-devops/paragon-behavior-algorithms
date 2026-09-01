// ms-layer-loader — tests/properties.ts
// 500-run determinism: same JSON → same compiled RegExps and verdicts.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { compileGlob, loadLayer, createRegistry, registerLayer } from '../src/index.js';
import { SMOKE_TEST_GUARD_FIXTURE } from '../src/machines/machines.js';

function seededPattern(seed: number): string {
  const bases = ['node -e*', 'bun -e*', 'quick test', 'smoke*', 'echo *done*', 'python*'];
  return bases[seed % bases.length]!;
}

type Case = { name: string; run: (seed: number) => boolean };
const cases: Case[] = [
  {
    name: 'compileGlob determinism: same pattern/anchored → same source and flags',
    run(seed) {
      const p = seededPattern(seed);
      const anchored = seed % 2 === 0;
      const r1 = compileGlob(p, anchored);
      const r2 = compileGlob(p, anchored);
      return r1.source === r2.source && r1.flags === r2.flags && r1.source.includes('.*') === p.includes('*');
    },
  },
  {
    name: 'anchored flag determinism: anchored has ^ and $',
    run(seed) {
      const rAnchored = compileGlob('hello*', true);
      const rUnanchored = compileGlob('hello*', false);
      return rAnchored.source.startsWith('^') && rAnchored.source.endsWith('$') && !rUnanchored.source.startsWith('^');
    },
  },
  {
    name: 'loadLayer determinism: same fixture file → same compiled id/threshold/banks',
    run(seed) {
      const f = path.join(os.tmpdir(), `prop-ll-${seed}-${Date.now()}.json`);
      fs.writeFileSync(f, JSON.stringify(SMOKE_TEST_GUARD_FIXTURE), 'utf8');
      try {
        const a = loadLayer(f);
        const b = loadLayer(f);
        return a.id === b.id && a.threshold === b.threshold && a.banks.use.length === b.banks.use.length && a.toolMatchers.length === b.toolMatchers.length;
      } finally { try { fs.unlinkSync(f); } catch {} }
    },
  },
  {
    name: 'register idempotence: same layer registered to fresh registries → same counts',
    run(seed) {
      const f = path.join(os.tmpdir(), `prop-ll2-${seed}-${Date.now()}.json`);
      fs.writeFileSync(f, JSON.stringify(SMOKE_TEST_GUARD_FIXTURE), 'utf8');
      try {
        const l = loadLayer(f);
        const r1 = createRegistry(); registerLayer(r1, l);
        const r2 = createRegistry(); registerLayer(r2, l);
        return r1.layers.size === r2.layers.size && r1.chainRules.length === r2.chainRules.length;
      } finally { try { fs.unlinkSync(f); } catch {} }
    },
  },
];

export function runProperties(): { pass: number; fail: number; failures: string[] } {
  let pass = 0, fail = 0;
  const failures: string[] = [];
  for (let run = 0; run < 500; run++) {
    for (const c of cases) {
      let ok = false;
      try { ok = c.run(run * 1000 + cases.indexOf(c)); } catch (e) { failures.push(`${c.name} run ${run} threw: ${String(e)}`); ok = false; }
      if (ok) pass++; else { fail++; if (failures.length < 10) failures.push(`run ${run} "${c.name}"`); }
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
