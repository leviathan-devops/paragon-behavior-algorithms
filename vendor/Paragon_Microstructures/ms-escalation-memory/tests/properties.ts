// ms-escalation-memory — tests/properties.ts — 500-run determinism
import { computeDeadline, computeSkipTier, createInitialState, onEscalate, onComplyGenuine, onComplyMinimum } from '../src/core/engine.js';

function lcg(seed: number): () => number { let s = seed >>> 0; return () => (s = (1664525 * s + 1013904223) >>> 0) / 0x100000000; }

export function runProperties(): { pass: number; fail: number; failures: string[] } {
  let pass = 0, fail = 0;
  const failures: string[] = [];
  for (let run = 0; run < 500; run++) {
    const seed = 0x9e3779b9 ^ (run * 0xc2b2ae35);
    const rnd = lcg(seed);

    // Pure table functions are deterministic
    const cnt = Math.floor(rnd() * 10);
    const d1 = computeDeadline(cnt); const d2 = computeDeadline(cnt);
    const s1 = computeSkipTier(cnt); const s2 = computeSkipTier(cnt);
    if (d1 !== d2 || s1 !== s2) { fail++; if (failures.length < 10) failures.push(`run ${run}: table not deterministic cnt=${cnt}`); }
    else pass++;

    // Transition determinism: same sequence of escalate/comply yields same end state
    const seq = Array.from({ length: 6 }, () => (rnd() < 0.5 ? 'esc' : (rnd() < 0.5 ? 'genuine' : 'minimum')));
    const replay = (ops: string[]) => {
      let st = createInitialState();
      for (const op of ops) {
        if (op === 'esc') st = onEscalate(st);
        else if (op === 'genuine') st = onComplyGenuine(st);
        else st = onComplyMinimum(st);
      }
      return st;
    };
    const a = replay(seq); const b = replay(seq);
    if (a.escalationCount !== b.escalationCount || a.deadlineWindow !== b.deadlineWindow || a.skipTierLevel !== b.skipTierLevel || a.debounceWindow !== b.debounceWindow) {
      fail++; if (failures.length < 10) failures.push(`run ${run}: transition not deterministic seq=${seq.join(',')}`);
    } else pass++;

    // Floor property: genuine at 0 stays 0
    const at0 = createInitialState();
    const after = onComplyGenuine(at0);
    if (after.escalationCount !== 0) { fail++; if (failures.length < 10) failures.push(`run ${run}: floor violated`); }
    else pass++;
  }
  return { pass, fail, failures };
}

if (import.meta.main) console.log(runProperties());
