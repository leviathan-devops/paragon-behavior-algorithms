// ms-persistence — tests/properties.ts
// 500-run determinism: same sid/record → same persisted load; append is ordered.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Persistence } from '../src/index.js';

function tmpDir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'prop-ps-')); }

type Case = { name: string; run: (seed: number) => boolean };
const cases: Case[] = [
  {
    name: 'persist/load state determinism',
    run(seed) {
      const dir = tmpDir();
      try {
        const p = new Persistence(dir);
        const sid = 'sid-' + (seed % 100);
        const rec = { seed, val: seed * 2, arr: [seed, seed + 1] };
        p.persistState(sid, rec);
        const a = p.loadState(sid) as typeof rec;
        const b = p.loadState(sid) as typeof rec;
        return JSON.stringify(a) === JSON.stringify(b) && a.val === seed * 2;
      } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
    },
  },
  {
    name: 'synapse round-trip determinism',
    run(seed) {
      const dir = tmpDir();
      try {
        const p = new Persistence(dir);
        const snap = { fam: { lambda: seed * 0.01, primed: seed % 2 === 0 } };
        p.persistSynapse('s' + seed, snap);
        const a = p.loadSynapse('s' + seed);
        const b = p.loadSynapse('s' + seed);
        return JSON.stringify(a) === JSON.stringify(b);
      } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
    },
  },
  {
    name: 'ledger append order determinism',
    run(seed) {
      const dir = tmpDir();
      try {
        const p = new Persistence(dir);
        p.appendLedger({ type: 'a', timestamp: seed });
        p.appendLedger({ type: 'b', timestamp: seed + 1 });
        const evts = p.readLedger();
        return evts.length === 2 && evts[0].type === 'a' && evts[1].type === 'b';
      } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
    },
  },
  {
    name: 'sid isolation determinism',
    run(seed) {
      const dir = tmpDir();
      try {
        const p = new Persistence(dir);
        p.persistState('A', { v: seed });
        p.persistState('B', { v: seed + 1 });
        const a = p.loadState('A') as { v: number };
        const b = p.loadState('B') as { v: number };
        return a.v === seed && b.v === seed + 1;
      } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
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
