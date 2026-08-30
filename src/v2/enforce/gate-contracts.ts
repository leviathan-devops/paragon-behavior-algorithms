import type { MathContract } from './math-contract.js';
import { expr, lit, va } from './math-expr.js';
import type { MathExpr } from './math-expr.js';

function gte(a: MathExpr, b: MathExpr): MathExpr { return expr('ge', [a, b]); }
function lt(a: MathExpr, b: MathExpr): MathExpr { return expr('lt', [a, b]); }
function eq(a: MathExpr, b: MathExpr): MathExpr { return expr('eq', [a, b]); }
function and(...args: MathExpr[]): MathExpr { return expr('and', args); }
function or(...args: MathExpr[]): MathExpr { return expr('or', args); }

export const STEER_CONTRACT: MathContract = {
  id: 'v2-escalation-STEER',
  preconditions: [
    gte(va('signalCount'), lit(1)),
    gte(va('tier'), lit(0)),
    lt(va('tier'), lit(1)),
  ],
  postconditions: [
    eq(va('tier'), lit(1)),
    gte(va('directiveCount'), lit(1)),
  ],
  invariants: [
    gte(va('tier'), lit(0)),
    lt(va('tier'), lit(5)),
  ],
};

export const DEMAND_CONTRACT: MathContract = {
  id: 'v2-escalation-DEMAND',
  preconditions: [
    gte(va('tier'), lit(1)),
    lt(va('tier'), lit(2)),
    eq(va('complianceVerified'), lit(0)),
    gte(va('seqSinceSteer'), lit(5)),
  ],
  postconditions: [
    eq(va('tier'), lit(2)),
    gte(va('deadlineSeq'), lit(1)),
  ],
  invariants: [
    gte(va('tier'), lit(1)),
    lt(va('tier'), lit(5)),
  ],
};

export const DENY_CONTRACT: MathContract = {
  id: 'v2-escalation-DENY',
  preconditions: [
    gte(va('tier'), lit(2)),
    lt(va('tier'), lit(3)),
    eq(va('complianceVerified'), lit(0)),
    gte(va('seqSinceDemand'), lit(5)),
  ],
  postconditions: [
    eq(va('tier'), lit(3)),
    gte(va('denialCount'), lit(1)),
  ],
  invariants: [
    gte(va('denialCount'), lit(0)),
    lt(va('tier'), lit(5)),
  ],
};

export const LOCK_CONTRACT: MathContract = {
  id: 'v2-escalation-LOCK',
  preconditions: [
    gte(va('denialCount'), lit(3)),
    gte(va('tier'), lit(3)),
    eq(va('complianceVerified'), lit(0)),
  ],
  postconditions: [
    eq(va('tier'), lit(4)),
    eq(va('circuitState'), lit(1)),
  ],
  invariants: [
    gte(va('tier'), lit(0)),
    gte(va('denialCount'), lit(0)),
  ],
  temporal: [
    expr('globally', [gte(va('tier'), lit(0))]),
  ],
};

export const GATE_CONTRACTS: readonly MathContract[] = [
  STEER_CONTRACT,
  DEMAND_CONTRACT,
  DENY_CONTRACT,
  LOCK_CONTRACT,
] as const;
