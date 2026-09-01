// ms-pba-bridge — tests/properties.ts — 500-run determinism
import { PbaBridgeImpl, correlateEscalation } from '../src/core/engine.js';

function lcg(seed: number): () => number { let s = seed >>> 0; return () => (s = (1664525 * s + 1013904223) >>> 0) / 0x100000000; }

export function runProperties(): { pass: number; fail: number; failures: string[] } {
  let pass = 0, fail = 0;
  const failures: string[] = [];
  for (let run = 0; run < 500; run++) {
    const seed = 0x9e3779b9 ^ (run * 0x9e3779b1);
    const rnd = lcg(seed);

    // correlateEscalation is pure: same inputs → same output
    const pta = Math.floor(rnd() * 5); const pba = Math.floor(rnd() * 5);
    const c1 = correlateEscalation(pta, pba); const c2 = correlateEscalation(pta, pba);
    if (c1 !== c2) { fail++; if (failures.length < 10) failures.push(`run ${run}: correlate not deterministic ${c1}≠${c2}`); }
    else pass++;

    // Bridge determinism: same signal sequence → same getRecentSignals / getLayersToPrearm
    const a = new PbaBridgeImpl(); const b = new PbaBridgeImpl();
    const families = ['TEST_EVASION', 'FORGERY_INTENT', 'OTHER'];
    const fa = families[Math.floor(rnd() * families.length)]!;
    a.registerLayer({ layerId: 'L1', pbaContextBoost: { families: [fa], boostAmount: 0.2 } });
    b.registerLayer({ layerId: 'L1', pbaContextBoost: { families: [fa], boostAmount: 0.2 } });
    for (let i = 0; i < 8; i++) {
      const f = families[Math.floor(rnd() * families.length)]!;
      const sig: any = { family: f, confidence: rnd(), excerpt: `e${run}-${i}`, seq: i, sessionId: 's1' };
      a.onPbaSignal(sig); b.onPbaSignal(sig);
    }
    const ra = a.getRecentSignals('s1', 5); const rb = b.getRecentSignals('s1', 5);
    const pa = a.getLayersToPrearm(fa); const pb = b.getLayersToPrearm(fa);
    const same = JSON.stringify(ra) === JSON.stringify(rb) && JSON.stringify(pa) === JSON.stringify(pb);
    if (same) pass++; else { fail++; if (failures.length < 10) failures.push(`run ${run}: bridge not deterministic ra=${JSON.stringify(ra).slice(0,120)}`); }

    // Standalone determinism: no signals → always same empty
    const empty = new PbaBridgeImpl();
    if (empty.getRecentSignals('nosess', 10).length !== 0 || empty.getMacroTier('nosess') !== 0) {
      fail++; if (failures.length < 10) failures.push(`run ${run}: standalone not empty`);
    } else pass++;
  }
  return { pass, fail, failures };
}

if (import.meta.main) console.log(runProperties());
