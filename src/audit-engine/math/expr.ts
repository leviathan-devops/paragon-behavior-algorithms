// SPEC-A §2.2.1 — doctrine-30 grammar × PARAGON runtime rename table
// Rename table (header — the interop law):
//   lit  ↔ PARAGON num/bool/str · var ↔ PARAGON ref / as-built sym
//   forall.in ↔ as-built domain · exists.in ↔ as-built domain
//   setLit.xs ↔ as-built elems · card/sum/max/min.x ↔ as-built set
//   member.x/set ↔ as-built elem/set · subset.a/b ↔ as-built sub/sup
//   not.x ↔ as-built e · if.c/t/e ↔ as-built c/t/f
//   prev/eventually/globally.x ↔ as-built e · until.a/b ↔ as-built l/r
//   forall.var/exists.var ↔ as-built binder
export type Brand<T, B extends string> = T & { readonly __brand: B };
export type SlPips = Brand<number, 'SlPips'>;
export type Rr = Brand<number, 'Rr'>;
export type SetupCount = Brand<number, 'SetupCount'>;
export type ScalarValue = number | boolean | string | ReadonlySet<string | number> | ReadonlyArray<string | number | boolean>;
export type Bindings = {
  readonly profile: string;
  readonly values: Readonly<Record<string, ScalarValue>>;
};
export type MathExpr =
  | { kind: 'var'; name: string }
  | { kind: 'lit'; value: number | string | boolean }
  | { kind: 'add'; l: MathExpr; r: MathExpr }
  | { kind: 'sub'; l: MathExpr; r: MathExpr }
  | { kind: 'mul'; l: MathExpr; r: MathExpr }
  | { kind: 'div'; l: MathExpr; r: MathExpr }
  | { kind: 'mod'; l: MathExpr; r: MathExpr }
  | { kind: 'lt'; l: MathExpr; r: MathExpr }
  | { kind: 'le'; l: MathExpr; r: MathExpr }
  | { kind: 'gt'; l: MathExpr; r: MathExpr }
  | { kind: 'ge'; l: MathExpr; r: MathExpr }
  | { kind: 'eq'; l: MathExpr; r: MathExpr }
  | { kind: 'ne'; l: MathExpr; r: MathExpr }
  | { kind: 'and'; l: MathExpr; r: MathExpr }
  | { kind: 'or'; l: MathExpr; r: MathExpr }
  | { kind: 'not'; x: MathExpr }
  | { kind: 'if'; c: MathExpr; t: MathExpr; e: MathExpr }
  | { kind: 'card'; x: MathExpr }
  | { kind: 'sum'; x: MathExpr }
  | { kind: 'max'; x: MathExpr }
  | { kind: 'min'; x: MathExpr }
  | { kind: 'member'; x: MathExpr; set: MathExpr }
  | { kind: 'subset'; a: MathExpr; b: MathExpr }
  | { kind: 'setLit'; xs: readonly MathExpr[] }
  | { kind: 'forall'; var: string; in: MathExpr; body: MathExpr }
  | { kind: 'exists'; var: string; in: MathExpr; body: MathExpr }
  | { kind: 'prev'; x: MathExpr }
  | { kind: 'eventually'; x: MathExpr }
  | { kind: 'globally'; x: MathExpr }
  | { kind: 'until'; a: MathExpr; b: MathExpr };
export type ExprKind = MathExpr['kind'];
export const ALL_KINDS: ReadonlySet<ExprKind> = new Set<ExprKind>([
  'var','lit','add','sub','mul','div','mod','lt','le','gt','ge','eq','ne','and','or','not','if','card','sum','max','min','member','subset','setLit','forall','exists','prev','eventually','globally','until',
]);
export const TEMPORAL_KINDS: ReadonlySet<ExprKind> = new Set(['prev','eventually','globally','until']);
export const DEPTH_LIMIT_DEFAULT = 256;
export const DOMAIN_SIZE_LIMIT_DEFAULT = 10_000;
export function foldAdd(exprs: readonly MathExpr[]): MathExpr {
  if (exprs.length === 0) return { kind: 'lit', value: 0 };
  let acc = exprs[0]!;
  for (let i = 1; i < exprs.length; i++) acc = { kind: 'add', l: acc, r: exprs[i]! };
  return acc;
}
export function foldAnd(exprs: readonly MathExpr[]): MathExpr {
  if (exprs.length === 0) return { kind: 'lit', value: true };
  let acc = exprs[0]!;
  for (let i = 1; i < exprs.length; i++) acc = { kind: 'and', l: acc, r: exprs[i]! };
  return acc;
}
