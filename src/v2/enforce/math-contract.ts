import type { BindingMap, MathExpr } from './math-expr.js';
import { evalExpr } from './math-expr.js';
export interface MathContract { readonly id: string; readonly preconditions: readonly MathExpr[]; readonly postconditions: readonly MathExpr[]; readonly invariants: readonly MathExpr[]; readonly temporal?: readonly MathExpr[]; }
export type Checked<T> = { ok: true; value: T } | { ok: false; violated: { expr: MathExpr; bindings: BindingMap; reason: string } };
export class PreconditionRejected extends Error { readonly code='PRECONDITION_REJECTED'; constructor(public contractId:string, public clause:MathExpr, m?:string){super(m??`PreconditionRejected: ${contractId}`);this.name='PreconditionRejected';}}
export class PostconditionFailed extends Error { readonly code='POSTCONDITION_FAILED'; constructor(public contractId:string, public clause:MathExpr, m?:string){super(m??`PostconditionFailed: ${contractId}`);this.name='PostconditionFailed';}}
export class InvariantDeath extends Error { readonly code='INVARIANT_DEATH'; constructor(public contractId:string, public clause:MathExpr, m?:string){super(m??`InvariantDeath: ${contractId}`);this.name='InvariantDeath';}}
function toBool(v:unknown):boolean{if(typeof v==='boolean')return v;if(typeof v==='number')return v!==0;if(typeof v==='string')return v.length>0&&v!=='false'&&v!=='0';return Boolean(v);}
function verifyAll(clauses: readonly MathExpr[], bindings: BindingMap): Checked<boolean> {
  let failures: Array<{expr:MathExpr;reason:string}> = [];
  for (const clause of clauses) {
    let outcome: unknown;
    try { outcome = evalExpr(clause, bindings); } catch (err) { const msg=err instanceof Error?err.message:String(err); failures.push({expr:clause,reason:`eval error: ${msg}`}); continue; }
    if (!toBool(outcome)) failures.push({expr:clause,reason:`clause ${clause.kind} evaluated to falsy (${String(outcome)})`});
  }
  if (failures.length>0) { const f=failures[0]!; return { ok:false, violated:{expr:f.expr,bindings,reason:f.reason}}; }
  const computed: Checked<boolean> = { ok:true, value:failures.length===0 };
  return computed;
}
export function checkContract(contract: MathContract, stage: 'pre'|'post'|'inv', bindings: BindingMap): Checked<boolean> {
  if (!contract || typeof contract.id !== 'string') return { ok:false, violated:{expr:{kind:'setLit',args:[],value:'invalid-contract'},bindings,reason:'invalid contract: missing id'} };
  const target = stage==='pre'?contract.preconditions:stage==='post'?contract.postconditions:stage==='inv'?contract.invariants:null;
  if (target===null) return { ok:false, violated:{expr:{kind:'setLit',args:[],value:String(stage)},bindings,reason:`unknown stage: ${String(stage)}`}};
  return verifyAll(target, bindings);
}
