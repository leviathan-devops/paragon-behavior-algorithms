// ms-state-machine — tests/properties.ts
// 500-run determinism: same input → same verdict, pure TS loop with fixed seeds, NO fast-check.
import { step } from '../src/core/engine.js';
import { createInitialRecord } from '../src/core/types.js';
import type { BehaviorRecord } from '../src/core/types.js';

function clone(r: BehaviorRecord): BehaviorRecord {
  return { ...r, counters: { ...r.counters }, directives: [...r.directives] };
}

export function runProperties(): { pass: number; fail: number; failures: string[] } {
  let pass = 0, fail = 0;
  const failures: string[] = [];
  // Fixed seed PRNG (mulberry32) — deterministic, no external dep
  let seed = 0x9e3779b9;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  const events = ['TOOL_SIGNAL','FIRST_TOOL_SIGNAL','CHAIN_PATTERN_HIT','INTERVENE','COMPLIANCE_VERIFIED','COMPLIANCE_FAILED','SEQ_WINDOW'] as const;
  const states = ['IDLE','MONITORING','PRIMED','INTERVENING'] as const;

  for (let run = 0; run < 500; run++) {
    const state = pick([...states]);
    const tier = pick([0,1,2,3,4] as const);
    const esc = Math.floor(rand()*5);
    const seq = Math.floor(rand()*50);
    const rec: BehaviorRecord = createInitialRecord({ state, tier, escalationCount: esc, seq, denialCount: Math.floor(rand()*3), lastComplianceVerified: pick([true,false,null]), complianceDeadlineSeq: rand()>0.5? seq+5 : null, directives: rand()>0.5? [{seq:1,verb:'INTERVENE',patternOrMember:'x'}]: [] });
    const ev = pick([...events]);
    const payload: any = {};
    if (rand()>0.5) payload.patternId = 'p'+run;
    if (rand()>0.5) payload.isGenuine = rand()>0.5;
    if (rand()>0.5) payload.advanced = Math.floor(rand()*40);
    if (rand()>0.3) payload.family = 'FAM';

    const a = step(clone(rec), ev, { ...payload });
    const b = step(clone(rec), ev, { ...payload });
    if (JSON.stringify(a) === JSON.stringify(b)) pass++;
    else { fail++; if (failures.length<5) failures.push(`run ${run}: determinism broken for ${ev} @ ${state}`); }
  }
  // Also: sequential stability — 10 random steps twice must match
  for (let run = 0; run < 100; run++) {
    let r1 = createInitialRecord();
    let r2 = createInitialRecord();
    for (let s = 0; s < 10; s++) {
      const ev = pick([...events]);
      const p: any = rand()>0.5? {patternId:'x'} : {};
      r1 = step(r1, ev, p);
      r2 = step(r2, ev, p);
    }
    if (JSON.stringify(r1) === JSON.stringify(r2)) pass++;
    else { fail++; if (failures.length<5) failures.push(`seq run ${run}: sequence determinism broken`); }
  }
  return { pass, fail, failures };
}

if (import.meta.main) console.log(runProperties());
