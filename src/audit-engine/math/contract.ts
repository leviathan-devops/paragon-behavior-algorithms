import type { Bindings, MathExpr } from './expr.ts';
import { evalExpr, type Checked, type EvalContext } from './eval.ts';
export interface ProvenanceAnchor {
  readonly source: string;
  readonly line: number;
  readonly quote: string;
}
export type ContractRole = 'REJECT' | 'THROW' | 'DIE' | 'ESCALATE';
export type Stage = 'pre' | 'post' | 'inv' | 'temporal';
export class PreconditionRejected extends Error {
  constructor(public readonly contractId: string, public readonly expr: MathExpr, public readonly bindings: Bindings) {
    super(`PreconditionRejected: ${contractId} precondition failed`);
    this.name = 'PreconditionRejected';
  }
}
export class MathPostconditionError extends Error {
  constructor(public readonly contractId: string, public readonly expr: MathExpr, public readonly bindings: Bindings) {
    super(`MathPostconditionError: ${contractId} postcondition failed`);
    this.name = 'MathPostconditionError';
  }
}
export class InvariantDeath extends Error {
  constructor(public readonly contractId: string, public readonly expr: MathExpr) {
    super(`InvariantDeath: ${contractId} invariant violated`);
    this.name = 'InvariantDeath';
  }
}
export class SupervisionEscalation extends Error {
  constructor(public readonly contractId: string, public readonly expr: MathExpr) {
    super(`SupervisionEscalation: ${contractId} temporal violation`);
    this.name = 'SupervisionEscalation';
  }
}
export interface MathContract {
  readonly id: string;
  readonly preconditions: readonly MathExpr[];
  readonly postconditions: readonly MathExpr[];
  readonly invariants: readonly MathExpr[];
  readonly temporal?: readonly MathExpr[];
  readonly provenance: readonly ProvenanceAnchor[];
}
export type BrandedVerdict = 'VALID' | 'THEATRICAL_LIE' | 'CONTRADICTED' | 'UNVERIFIED' | 'UNVERIFIABLE';
export interface DischargeInputs {
  readonly evaluated: Checked<number | boolean>;
  readonly oracleValue?: number | boolean | readonly (string | number)[];
  readonly hasBindings: boolean;
  readonly theatricalMismatch?: boolean;
}
export function toBrandedVerdict(input: DischargeInputs): BrandedVerdict {
  if (input.theatricalMismatch === true) return 'THEATRICAL_LIE';
  if (!input.hasBindings) return 'UNVERIFIABLE';
  if (!input.evaluated.ok) {
    if (input.evaluated.code === 'TEMPORAL_NOT_EVALUABLE' || input.evaluated.code === 'DOMAIN_UNBOUNDED') return 'UNVERIFIABLE';
    return 'UNVERIFIED';
  }
  if (input.oracleValue !== undefined) {
    const ev = input.evaluated.value;
    const ov: unknown = input.oracleValue;
    if (Array.isArray(ov) && Array.isArray(ev)) return JSON.stringify(ev) === JSON.stringify(ov) ? 'VALID' : 'CONTRADICTED';
    return ev === ov ? 'VALID' : 'CONTRADICTED';
  }
  return input.evaluated.value === true ? 'VALID' : 'CONTRADICTED';
}
export type ContractCheckResult = {
  readonly contractId: string;
  readonly stage: string;
  readonly verdict: BrandedVerdict;
  readonly perExpr: readonly { exprId: string; role: ContractRole; checked: Checked<number | boolean> }[];
};
function canonicalExprId(e: MathExpr): string {
  return JSON.stringify(e);
}
function bindingsHasValues(b: Bindings): boolean {
  return Object.keys(b.values).length > 0;
}
export function extractBindings(raw: Record<string, unknown>): Checked<Bindings> {
  try {
    const values: Record<string, ScalarValue> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') values[k] = v;
      else if (v instanceof Set) values[k] = v as unknown as ScalarValue;
      else if (Array.isArray(v)) values[k] = [...v] as unknown as ScalarValue;
      else if (v !== null && v !== undefined) values[k] = v as ScalarValue;
    }
    return { ok: true, value: { profile: 'default', values }, cached: false };
  } catch (e: unknown) {
    return { ok: false, code: 'TYPE_MISMATCH', at: 'var', expected: 'bindings', got: String(e) };
  }
}
type ScalarValue = number | boolean | string | ReadonlySet<string | number> | ReadonlyArray<string | number | boolean>;
export function checkContract(contract: MathContract, stage: Stage | string, bindings: Bindings): ContractCheckResult {
  const ctx: EvalContext = { bindings, depthLimit: 256, domainSizeLimit: 10_000 };
  const perExpr: { exprId: string; role: ContractRole; checked: Checked<number | boolean> }[] = [];
  let overall: BrandedVerdict = 'VALID';
  const hasBindings = bindingsHasValues(bindings);
  const eff: Stage = (stage === 'pre' || stage === 'post' || stage === 'inv' || stage === 'temporal') ? stage as Stage : 'inv';
  const stageExprs: readonly MathExpr[] =
    eff === 'pre' ? contract.preconditions :
    eff === 'post' ? contract.postconditions :
    eff === 'inv' ? contract.invariants :
    (contract.temporal ?? []);
  const role: ContractRole =
    eff === 'pre' ? 'REJECT' :
    eff === 'post' ? 'THROW' :
    eff === 'inv' ? 'DIE' : 'ESCALATE';
  for (const expr of stageExprs) {
    const checked = evalExpr(expr, ctx);
    perExpr.push({ exprId: canonicalExprId(expr), role, checked });
    const verdict = toBrandedVerdict({ evaluated: checked, hasBindings });
    if (role === 'ESCALATE' && !checked.ok && (checked as { code: string }).code === 'TEMPORAL_NOT_EVALUABLE') {
      throw new SupervisionEscalation(contract.id, expr);
    }
    if (verdict !== 'VALID') {
      overall = verdict;
      return { contractId: contract.id, stage, verdict: overall, perExpr };
    }
  }
  return { contractId: contract.id, stage, verdict: overall, perExpr };
}
