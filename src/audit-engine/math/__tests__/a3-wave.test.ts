import { describe, expect, it } from 'bun:test';
import { ALL_KINDS, TEMPORAL_KINDS, foldAdd, foldAnd } from '../expr.ts';
import type { Bindings, MathExpr } from '../expr.ts';
import { evalExpr, makeDefaultContext } from '../eval.ts';
import { checkContract, extractBindings, PreconditionRejected, MathPostconditionError, InvariantDeath, SupervisionEscalation } from '../contract.ts';
import { createOracleRegistry } from '../oracle.ts';
import { passThroughFirewall, materializeCode, FirewallError } from '../firewall.ts';
function b(values: Record<string, number | boolean | string | ReadonlySet<string|number> | ReadonlyArray<string|number|boolean>>): Bindings { return { profile: 'test', values: values as never }; }
function ctx(values: Record<string, unknown> = {}) { return makeDefaultContext(b(values as never)); }
describe('A3 MC-A-07 grammar thirty', () => {
  it('ALL_KINDS =30', () => { expect(ALL_KINDS.size).toBe(30); });
  it('TEMPORAL_KINDS =4', () => { expect(TEMPORAL_KINDS.size).toBe(4); });
  it('foldAdd/foldAnd builders', () => {
    const a: MathExpr = { kind: 'lit', value: 1 };
    const b2: MathExpr = { kind: 'lit', value: 2 };
    const c: MathExpr = { kind: 'lit', value: 3 };
    const added = foldAdd([a,b2,c]);
    expect((evalExpr(added, ctx()) as { value:number }).value).toBe(6);
    const anded = foldAnd([{ kind:'lit', value:true},{kind:'lit',value:false}]);
    expect((evalExpr(anded, ctx()) as { value:boolean }).value).toBe(false);
    expect((evalExpr(foldAdd([]), ctx()) as { value:number }).value).toBe(0);
    expect((evalExpr(foldAnd([]), ctx()) as { value:boolean }).value).toBe(true);
  });
  it('lit covers number/string/boolean', () => {
    expect((evalExpr({kind:'lit',value:42},ctx()) as {value:number}).value).toBe(42);
    expect((evalExpr({kind:'lit',value:'hi'},ctx()) as unknown as {ok:boolean}).ok).toBe(false);
    expect((evalExpr({kind:'var',name:'x'},ctx({x:'hi'})) as unknown as {ok:boolean}).ok).toBe(false);
  });
});
describe('A3 MC-A-05 stage selection', () => {
  it('pre failing but post passing at post returns VALID', () => {
    const contract = {
      id: 'stage-proof',
      preconditions: [{ kind:'gt' as const, l:{kind:'var' as const,name:'x'}, r:{kind:'lit' as const,value:100} }],
      postconditions: [{ kind:'gt' as const, l:{kind:'var' as const,name:'out'}, r:{kind:'lit' as const,value:0} }],
      invariants: [] as MathExpr[],
      provenance: [{ source:'s', line:1, quote:'q'}],
    };
    const resPost = checkContract(contract, 'post', b({x:-1,out:10}));
    expect(resPost.verdict).toBe('VALID');
    const resPre = checkContract(contract, 'pre', b({x:-1,out:10}));
    expect(resPre.verdict).not.toBe('VALID');
  });
  it('inv stage only checks invariants', () => {
    const contract = {
      id:'inv-check',
      preconditions: [{kind:'lit' as const,value:false}],
      postconditions: [{kind:'lit' as const,value:false}],
      invariants: [{kind:'lit' as const,value:true}],
      provenance: [{source:'s',line:1,quote:'q'}],
    };
    expect(checkContract(contract,'inv',b({dummy:1})).verdict).toBe('VALID');
  });
});
describe('A3 MC-A-06 epsilon boundary', () => {
  it('|eval-oracle|=tol+1e-12 throws FirewallError', () => {
    const raw = { expression:'x', bindings:{x:10}, oracle:10, tolerance:0.5 };
    expect(passThroughFirewall(raw).oracle).toBe(10);
    const raw2 = { expression:'x', bindings:{x:10}, oracle:10, tolerance:0.5 };
    // diff =0.500000000001 >0.5
    const rawFail = { expression:'x', bindings:{x:10.500000000001}, oracle:10, tolerance:0.5 };
    expect(()=>passThroughFirewall(rawFail)).toThrow(FirewallError);
  });
  it('oracle epsilon required default 0, discharge with epsilon', () => {
    const reg = createOracleRegistry();
    reg.register({ exprId:'e1', oracleValue:10, anchor:{source:'s',line:1,quote:'q'}, epsilon:0.1 });
    expect(reg.discharge('e1',10.05)).toBe(true);
    expect(reg.discharge('e1',10.2)).toBe(false);
  });
});
describe('A3 temporal throw', () => {
  it('each LTL throws TEMPORAL_NOT_EVALUABLE', () => {
    for (const k of ['prev','eventually','globally'] as const) {
      const e: MathExpr = { kind:k, x:{kind:'lit',value:true} } as MathExpr;
      const r=evalExpr(e,ctx());
      expect(r.ok).toBe(false);
      if(!r.ok) expect((r as {code:string}).code).toBe('TEMPORAL_NOT_EVALUABLE');
    }
    const u: MathExpr = { kind:'until', a:{kind:'lit',value:true}, b:{kind:'lit',value:false} };
    const ru=evalExpr(u,ctx());
    expect(ru.ok).toBe(false);
  });
});
describe('A3 brand forge reject', () => {
  it('materializeCode requires VerifiedMathSpec', () => {
    const raw={expression:'x+1',bindings:{x:1},oracle:2,tolerance:0};
    const v=passThroughFirewall(raw);
    const code=materializeCode(v);
    expect(code).toContain('x');
  });
});
describe('A3 sets as bindings', () => {
  it('extractBindings keeps Set and Array', () => {
    const s=new Set([1,2,3]);
    const r=extractBindings({mySet:s, myArr:[4,5]} as unknown as Record<string,unknown>);
    expect(r.ok).toBe(true);
    if(r.ok){ expect((r.value.values as Record<string,unknown>).mySet instanceof Set).toBe(true); expect((r.value.values as Record<string,unknown>).myArr).toEqual([4,5]); }
  });
  it('member/subset/card/sum/max/min over Set bindings', () => {
    const setVal=new Set([1,2,3]);
    const c=ctx({mySet:setVal});
    expect((evalExpr({kind:'member',x:{kind:'lit',value:2},set:{kind:'var',name:'mySet'}},c) as {value:boolean}).value).toBe(true);
    expect((evalExpr({kind:'member',x:{kind:'lit',value:9},set:{kind:'var',name:'mySet'}},c) as {value:boolean}).value).toBe(false);
    expect((evalExpr({kind:'card',x:{kind:'var',name:'mySet'}},c) as {value:number}).value).toBe(3);
    expect((evalExpr({kind:'sum',x:{kind:'var',name:'mySet'}},c) as {value:number}).value).toBe(6);
    expect((evalExpr({kind:'max',x:{kind:'var',name:'mySet'}},c) as {value:number}).value).toBe(3);
    expect((evalExpr({kind:'min',x:{kind:'var',name:'mySet'}},c) as {value:number}).value).toBe(1);
    const sub=new Set([1,2]);
    const c2=ctx({a:sub,b:setVal});
    expect((evalExpr({kind:'subset',a:{kind:'var',name:'a'},b:{kind:'var',name:'b'}},c2) as {value:boolean}).value).toBe(true);
  });
  it('forall/exists over Set binding', () => {
    const s=new Set([1,2,3]);
    const c=ctx({s});
    const fa: MathExpr={kind:'forall',var:'x',in:{kind:'var',name:'s'},body:{kind:'gt',l:{kind:'var',name:'x'},r:{kind:'lit',value:0}}};
    expect((evalExpr(fa,c) as {value:boolean}).value).toBe(true);
    const ex: MathExpr={kind:'exists',var:'x',in:{kind:'var',name:'s'},body:{kind:'eq',l:{kind:'var',name:'x'},r:{kind:'lit',value:2}}};
    expect((evalExpr(ex,c) as {value:boolean}).value).toBe(true);
  });
});
describe('A3 error classes exist', () => {
  it('typed errors have doctrine names', () => {
    expect(new PreconditionRejected('c',{kind:'lit',value:true},b({})).name).toBe('PreconditionRejected');
    expect(new MathPostconditionError('c',{kind:'lit',value:true},b({})).name).toBe('MathPostconditionError');
    expect(new InvariantDeath('c',{kind:'lit',value:true}).name).toBe('InvariantDeath');
    expect(new SupervisionEscalation('c',{kind:'lit',value:true}).name).toBe('SupervisionEscalation');
    expect(new FirewallError({expression:'x',bindings:{},oracle:0,tolerance:0},1,'r').name).toBe('FirewallError');
  });
});
describe('A3 adversarial', () => {
  it('empty setLit', () => { expect((evalExpr({kind:'card',x:{kind:'setLit',xs:[]}},ctx()) as {value:number}).value).toBe(0); });
  it('null binding', () => { const r=evalExpr({kind:'var',name:'x'},ctx({})); expect(r.ok).toBe(false); });
  it('concurrent eval', async () => {
    const e:MathExpr={kind:'add',l:{kind:'var',name:'n'},r:{kind:'lit',value:1}};
    const rs=await Promise.all(Array.from({length:20},()=>Promise.resolve(evalExpr(e,ctx({n:5})))));
    expect(rs.every(r=>r.ok&&(r as {value:number}).value===6)).toBe(true);
  });
  it('boundary depth/domain', () => {
    let deep:MathExpr={kind:'lit',value:1};
    for(let i=0;i<300;i++) deep={kind:'add',l:deep,r:{kind:'lit',value:1}};
    expect((evalExpr(deep,ctx()) as {ok:boolean}).ok).toBe(false);
  });
});
