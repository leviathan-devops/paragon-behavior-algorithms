export type RawMathSpec = {
  readonly expression: string;
  readonly bindings: Readonly<Record<string, number>>;
  readonly oracle: number;
  readonly tolerance: number;
};
const __verified: unique symbol = Symbol('__verified');
export type VerifiedMathSpec = {
  readonly expression: string;
  readonly bindings: Readonly<Record<string, number>>;
  readonly oracle: number;
  readonly tolerance: number;
  readonly [__verified]: true;
};
export class FirewallError extends Error {
  constructor(
    public readonly spec: RawMathSpec,
    public readonly evaluated: number,
    public readonly reason: string,
  ) {
    super(`FIREWALL: ${reason}\n  Expression: ${spec.expression}\n  Bindings: ${JSON.stringify(spec.bindings)}\n  Oracle: ${spec.oracle}\n  Evaluated: ${evaluated}\n  Tolerance: ${spec.tolerance}`);
    this.name = 'FirewallError';
  }
}
import { InvariantDeath } from './contract.ts';
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_EXPR_RE = /^[A-Za-z0-9_+\-*/().,\s]+$/;
const ALLOWED_FNS = new Set(['min','max','abs','floor','ceil','round']);
function evaluateExpression(expression: string, bindings: Record<string, number>): number {
  for (const k of Object.keys(bindings)) {
    if (!IDENT_RE.test(k)) throw new Error(`Invalid identifier: ${k}`);
  }
  if (!SAFE_EXPR_RE.test(expression)) throw new Error(`Expression contains disallowed tokens: ${expression}`);
  let expr = expression;
  const keys = Object.keys(bindings).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`\\b${k}\\b`, 'g');
    expr = expr.replace(re, String(bindings[k]));
  }
  const fnCalls = expr.match(/[A-Za-z_][A-Za-z0-9_]*(?=\s*\()/g) ?? [];
  for (const fn of fnCalls) {
    if (!ALLOWED_FNS.has(fn)) throw new Error(`Disallowed function: ${fn}`);
  }
  const result = Function(`"use strict"; return (${expr});`)() as number;
  if (!Number.isFinite(result)) throw new InvariantDeath('firewall-eval-invariant', { kind: 'lit', value: result } as unknown as import('./expr.ts').MathExpr);
  return result;
}
export function passThroughFirewall(raw: RawMathSpec): VerifiedMathSpec {
  let evaluated: number;
  try {
    evaluated = evaluateExpression(raw.expression, raw.bindings as Record<string, number>);
  } catch (e: unknown) {
    if (e instanceof InvariantDeath) throw new FirewallError(raw, Number.NaN, `InvariantDeath DIE stage: ${e.message}`);
    throw e;
  }
  const diff = Math.abs(evaluated - raw.oracle);
  if (diff > raw.tolerance) throw new FirewallError(raw, evaluated, 'Oracle mismatch');
  return { ...raw, [__verified]: true as unknown as true } as VerifiedMathSpec;
}
export function assertFirewallInvariant(raw: RawMathSpec): void {
  try {
    evaluateExpression(raw.expression, raw.bindings as Record<string, number>);
  } catch (e: unknown) {
    if (e instanceof InvariantDeath) throw e;
    throw new InvariantDeath('firewall-invariant', { kind: 'lit', value: 0 } as unknown as import('./expr.ts').MathExpr);
  }
}
export function materializeCode(spec: VerifiedMathSpec): string {
  const bindingLines = Object.entries(spec.bindings).map(([k, v]) => `const ${k} = ${v};`).join('\n');
  return [`// Auto-generated from verified math spec.`,`// Expression: ${spec.expression}`,`// Oracle: ${spec.oracle}`,`// Tolerance: ${spec.tolerance}`,bindingLines,`export const result = ${spec.expression};`].join('\n');
}
