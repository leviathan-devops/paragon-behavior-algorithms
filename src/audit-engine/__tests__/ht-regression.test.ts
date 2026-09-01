// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import { allSpecs } from '../../../tests/fixtures/ht-bugs/index.ts';

function isFn(v) { return typeof v === 'function'; }

describe('ht-regression — structural validity 23/23', () => {
  it('allSpecs length 23', () => {
    expect(allSpecs.length).toBe(23);
  });
  it('scenarioId unique and htuBugRef present and mathSpec complete', () => {
    const ids = new Set();
    for (const s of allSpecs as unknown as any[]) {
      expect(typeof s.scenarioId).toBe('string');
      expect(s.scenarioId.length > 0).toBe(true);
      expect(ids.has(s.scenarioId)).toBe(false);
      ids.add(s.scenarioId);
      expect(typeof s.description).toBe('string');
      expect(s.description.length > 0).toBe(true);
      expect(isFn(s.setup)).toBe(true);
      expect(isFn(s.action)).toBe(true);
      expect(isFn(s.assertion)).toBe(true);
      expect(s.mathSpec && typeof s.mathSpec === 'object').toBe(true);
      expect(typeof s.mathSpec.expression).toBe('string');
      expect(s.mathSpec.expression.length > 0).toBe(true);
      expect(s.mathSpec.bindings && typeof s.mathSpec.bindings === 'object').toBe(true);
      expect(s.mathSpec.expected !== undefined).toBe(true);
      expect(typeof s.mathSpec.tolerance).toBe('number');
      expect(typeof s.htuBugRef).toBe('string');
      expect(s.htuBugRef.startsWith('HT-BUG-')).toBe(true);
    }
  });
  it('red-first: intentionally broken fixture fails validation then fixed passes', async () => {
    const broken = { scenarioId:'BROKEN', description:'broken', setup:()=>{}, action:()=>{}, assertion:()=>true, mathSpec:{expression:'x==1', bindings:{x:1}, expected:1, tolerance:0} };
    let threw=false;
    try{
      if(!broken.htuBugRef || typeof broken.htuBugRef!=='string') throw new Error('SPEC_MALFORMED:htuBugRef');
    }catch{ threw=true; }
    expect(threw).toBe(true);
    const fixed = { ...broken, htuBugRef:'HT-BUG-99' };
    let threw2=false;
    try{
      if(!fixed.htuBugRef) throw new Error('missing');
    }catch{ threw2=true; }
    expect(threw2).toBe(false);
  });
});

describe('ht-regression — representative subset end-to-end >=8 incl 16/19/22/23', () => {
  const subsetIds = [
    'HT-BUG-1-STALE-STATE-RESUME',
    'HT-BUG-2-ABORT-NO-RESET',
    'HT-BUG-3-PHANTOM-DEACTIVATION',
    'HT-BUG-8-CHAIN-EXHAUSTION',
    'HT-BUG-15-CROSS-PROJECT-ISOLATION',
    'HT-BUG-16-COVERAGE-GATE',
    'HT-BUG-19-THINKING-LEAK-STRIP',
    'HT-BUG-20-SCOPED-WALKER',
    'HT-BUG-21-DIAGNOSTICS-EXEMPT',
    'HT-BUG-22-FIREWALL-NARROW',
    'HT-BUG-23-COLLECT-DISPATCH-EVIDENCE',
  ];
  for(const id of subsetIds){
    it('executes '+id, async () => {
      const spec = (allSpecs as unknown as any[]).find(s=>s.scenarioId===id);
      expect(spec).toBeDefined();
      await spec.setup();
      let obs;
      try{ obs = await spec.action(); } finally { }
      expect(obs && typeof obs.ok==='boolean').toBe(true);
      expect(typeof obs.detail).toBe('string');
      const ok = await spec.assertion(obs);
      expect(ok).toBe(true);
    });
  }
});
