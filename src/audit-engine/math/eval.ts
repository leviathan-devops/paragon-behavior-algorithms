import type { Bindings, ExprKind, MathExpr } from './expr.ts';
import { DEPTH_LIMIT_DEFAULT, DOMAIN_SIZE_LIMIT_DEFAULT, TEMPORAL_KINDS } from './expr.ts';
export type EvalOk<T> = { ok: true; value: T; cached: boolean };
export type EvalErr =
  | { ok: false; code: 'UNBOUND_SYMBOL'; symbol: string }
  | { ok: false; code: 'TYPE_MISMATCH'; at: ExprKind; expected: string; got: string }
  | { ok: false; code: 'DIV_BY_ZERO' }
  | { ok: false; code: 'DOMAIN_UNBOUNDED'; binder: string }
  | { ok: false; code: 'TEMPORAL_NOT_EVALUABLE'; at: ExprKind }
  | { ok: false; code: 'DEPTH_EXCEEDED'; depth: number };
export type Checked<T> = EvalOk<T> | EvalErr;
export interface EvalContext {
  bindings: Bindings;
  depthLimit: number;
  domainSizeLimit: number;
}
export function makeDefaultContext(bindings: Bindings): EvalContext {
  return { bindings, depthLimit: DEPTH_LIMIT_DEFAULT, domainSizeLimit: DOMAIN_SIZE_LIMIT_DEFAULT };
}
function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
function canonicalExpr(e: MathExpr): string {
  return canonicalJson(e);
}
type ScalarOrSet = number | boolean | string | ReadonlyArray<number | string | boolean> | ReadonlySet<string | number>;
function isNumber(v: unknown): v is number { return typeof v === 'number'; }
function isBoolean(v: unknown): v is boolean { return typeof v === 'boolean'; }
function typeOf(v: unknown): string {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'string') return 'string';
  if (Array.isArray(v)) return 'set';
  if (v instanceof Set) return 'set';
  return typeof v;
}
function toArraySet(v: unknown): (string | number | boolean)[] | null {
  if (Array.isArray(v)) return v as (string | number | boolean)[];
  if (v instanceof Set) return [...(v as Set<string | number>)] as (string | number | boolean)[];
  return null;
}
function getField<T>(obj: unknown, primary: string, legacy: string[]): T | undefined {
  const r = obj as Record<string, unknown>;
  if (r[primary] !== undefined) return r[primary] as T;
  for (const k of legacy) if (r[k] !== undefined) return r[k] as T;
  return undefined;
}
function evalInternal(e: MathExpr, ctx: EvalContext, depth: number): Checked<ScalarOrSet> {
  if (depth > ctx.depthLimit) return { ok: false, code: 'DEPTH_EXCEEDED', depth };
  const kind = (e as { kind: string }).kind as ExprKind;
  if (TEMPORAL_KINDS.has(kind)) return { ok: false, code: 'TEMPORAL_NOT_EVALUABLE', at: kind };
  if (kind === 'var' || (e as unknown as { kind: string }).kind === 'sym') {
    const name = (e as unknown as { name?: string }).name ?? '';
    const v = ctx.bindings.values[name];
    if (v === undefined) return { ok: false, code: 'UNBOUND_SYMBOL', symbol: name };
    if (v instanceof Set) return { ok: true, value: [...v] as unknown as ScalarOrSet, cached: false };
    return { ok: true, value: v as ScalarOrSet, cached: false };
  }
  if (kind === 'lit' || (e as unknown as { kind: string }).kind === 'num' || (e as unknown as { kind: string }).kind === 'bool') {
    const v = (e as unknown as { value?: unknown }).value as ScalarOrSet;
    return { ok: true, value: v as ScalarOrSet, cached: false };
  }
  switch (kind as string) {
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
    case 'mod': {
      const l = evalInternal(getField<MathExpr>(e, 'l', [])!, ctx, depth + 1);
      if (!l.ok) return l;
      const r = evalInternal(getField<MathExpr>(e, 'r', [])!, ctx, depth + 1);
      if (!r.ok) return r;
      if (!isNumber(l.value) || !isNumber(r.value)) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'number', got: `${typeOf(l.value)}/${typeOf(r.value)}` };
      if ((kind === 'div' || kind === 'mod') && r.value === 0) return { ok: false, code: 'DIV_BY_ZERO' };
      let out = 0;
      if (kind === 'add') out = (l.value as number) + (r.value as number);
      else if (kind === 'sub') out = (l.value as number) - (r.value as number);
      else if (kind === 'mul') out = (l.value as number) * (r.value as number);
      else if (kind === 'div') out = (l.value as number) / (r.value as number);
      else out = (l.value as number) % (r.value as number);
      return { ok: true, value: out, cached: false };
    }
    case 'lt':
    case 'le':
    case 'gt':
    case 'ge':
    case 'eq':
    case 'ne': {
      const l = evalInternal(getField<MathExpr>(e, 'l', [])!, ctx, depth + 1);
      if (!l.ok) return l;
      const r = evalInternal(getField<MathExpr>(e, 'r', [])!, ctx, depth + 1);
      if (!r.ok) return r;
      const lv = l.value; const rv = r.value;
      let res = false;
      if (kind === 'eq') res = lv === rv;
      else if (kind === 'ne') res = lv !== rv;
      else {
        if (!isNumber(lv) || !isNumber(rv)) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'number', got: `${typeOf(lv)}/${typeOf(rv)}` };
        if (kind === 'lt') res = (lv as number) < (rv as number);
        else if (kind === 'le') res = (lv as number) <= (rv as number);
        else if (kind === 'gt') res = (lv as number) > (rv as number);
        else res = (lv as number) >= (rv as number);
      }
      return { ok: true, value: res, cached: false };
    }
    case 'and':
    case 'or': {
      const l = evalInternal(getField<MathExpr>(e, 'l', [])!, ctx, depth + 1);
      if (!l.ok) return l;
      const r = evalInternal(getField<MathExpr>(e, 'r', [])!, ctx, depth + 1);
      if (!r.ok) return r;
      if (!isBoolean(l.value) || !isBoolean(r.value)) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'boolean', got: `${typeOf(l.value)}/${typeOf(r.value)}` };
      return { ok: true, value: kind === 'and' ? (l.value as boolean) && (r.value as boolean) : (l.value as boolean) || (r.value as boolean), cached: false };
    }
    case 'not': {
      const inner = getField<MathExpr>(e, 'x', ['e'])!;
      const v = evalInternal(inner, ctx, depth + 1);
      if (!v.ok) return v;
      if (!isBoolean(v.value)) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'boolean', got: typeOf(v.value) };
      return { ok: true, value: !(v.value as boolean), cached: false };
    }
    case 'if': {
      const cExpr = getField<MathExpr>(e, 'c', [])!;
      const c = evalInternal(cExpr, ctx, depth + 1);
      if (!c.ok) return c;
      if (!isBoolean(c.value)) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'boolean', got: typeOf(c.value) };
      const branch = c.value ? getField<MathExpr>(e, 't', [])! : getField<MathExpr>(e, 'e', ['f'])!;
      return evalInternal(branch, ctx, depth + 1);
    }
    case 'setLit': {
      const elems = getField<readonly MathExpr[]>(e, 'xs', ['elems'])!;
      const out: (string | number | boolean)[] = [];
      for (const el of elems) {
        const v = evalInternal(el, ctx, depth + 1);
        if (!v.ok) return v;
        const val = v.value;
        if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') out.push(val as string | number | boolean);
        else return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'scalar', got: typeOf(val) };
      }
      return { ok: true, value: out, cached: false };
    }
    case 'card': {
      const inner = getField<MathExpr>(e, 'x', ['set'])!;
      const s = evalInternal(inner, ctx, depth + 1);
      if (!s.ok) return s;
      const arr = toArraySet(s.value);
      if (arr === null) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'set', got: typeOf(s.value) };
      return { ok: true, value: arr.length, cached: false };
    }
    case 'sum': {
      const inner = getField<MathExpr>(e, 'x', ['set'])!;
      const s = evalInternal(inner, ctx, depth + 1);
      if (!s.ok) return s;
      const arr = toArraySet(s.value);
      if (arr === null) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'set', got: typeOf(s.value) };
      let sum = 0;
      for (const v of arr) { if (typeof v !== 'number') return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'number set', got: typeOf(v) }; sum += v; }
      return { ok: true, value: sum, cached: false };
    }
    case 'max': {
      const inner = getField<MathExpr>(e, 'x', ['set'])!;
      const s = evalInternal(inner, ctx, depth + 1);
      if (!s.ok) return s;
      const arr = toArraySet(s.value);
      if (arr === null) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'set', got: typeOf(s.value) };
      if (arr.length === 0) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'non-empty set', got: 'empty' };
      let mx: number | null = null;
      for (const v of arr) { if (typeof v !== 'number') return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'number set', got: typeOf(v) }; if (mx === null || v > mx) mx = v; }
      return { ok: true, value: mx as number, cached: false };
    }
    case 'min': {
      const inner = getField<MathExpr>(e, 'x', ['set'])!;
      const s = evalInternal(inner, ctx, depth + 1);
      if (!s.ok) return s;
      const arr = toArraySet(s.value);
      if (arr === null) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'set', got: typeOf(s.value) };
      if (arr.length === 0) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'non-empty set', got: 'empty' };
      let mn: number | null = null;
      for (const v of arr) { if (typeof v !== 'number') return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'number set', got: typeOf(v) }; if (mn === null || v < mn) mn = v; }
      return { ok: true, value: mn as number, cached: false };
    }
    case 'member': {
      const elem = getField<MathExpr>(e, 'x', ['elem'])!;
      const setExpr = getField<MathExpr>(e, 'set', [])!;
      const el = evalInternal(elem, ctx, depth + 1);
      if (!el.ok) return el;
      const s = evalInternal(setExpr, ctx, depth + 1);
      if (!s.ok) return s;
      const arr = toArraySet(s.value);
      if (arr === null) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'set', got: typeOf(s.value) };
      return { ok: true, value: arr.includes(el.value as never), cached: false };
    }
    case 'subset': {
      const aExpr = getField<MathExpr>(e, 'a', ['sub'])!;
      const bExpr = getField<MathExpr>(e, 'b', ['sup'])!;
      const sub = evalInternal(aExpr, ctx, depth + 1);
      if (!sub.ok) return sub;
      const sup = evalInternal(bExpr, ctx, depth + 1);
      if (!sup.ok) return sup;
      const aSub = toArraySet(sub.value);
      const aSup = toArraySet(sup.value);
      if (aSub === null || aSup === null) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'set', got: `${typeOf(sub.value)}/${typeOf(sup.value)}` };
      const supSet = new Set(aSup as (string | number)[]);
      const all = aSub.every((v) => supSet.has(v as string | number));
      return { ok: true, value: all, cached: false };
    }
    case 'forall':
    case 'exists': {
      const domainExpr = getField<MathExpr>(e, 'in', ['domain'])!;
      const binder = getField<string>(e, 'var', ['binder'])!;
      const body = getField<MathExpr>(e, 'body', [])!;
      const d = evalInternal(domainExpr, ctx, depth + 1);
      if (!d.ok) return d;
      const arr = toArraySet(d.value);
      if (arr === null) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'set', got: typeOf(d.value) };
      if (arr.length > ctx.domainSizeLimit) return { ok: false, code: 'DOMAIN_UNBOUNDED', binder };
      if (kind === 'forall') {
        for (const v of arr) {
          const childBindings: Bindings = { profile: ctx.bindings.profile, values: { ...ctx.bindings.values, [binder]: v as never } };
          const childCtx: EvalContext = { ...ctx, bindings: childBindings };
          const r = evalInternal(body, childCtx, depth + 1);
          if (!r.ok) return r;
          if (!isBoolean(r.value)) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'boolean', got: typeOf(r.value) };
          if (r.value === false) return { ok: true, value: false, cached: false };
        }
        return { ok: true, value: true, cached: false };
      } else {
        for (const v of arr) {
          const childBindings: Bindings = { profile: ctx.bindings.profile, values: { ...ctx.bindings.values, [binder]: v as never } };
          const childCtx: EvalContext = { ...ctx, bindings: childBindings };
          const r = evalInternal(body, childCtx, depth + 1);
          if (!r.ok) return r;
          if (!isBoolean(r.value)) return { ok: false, code: 'TYPE_MISMATCH', at: kind, expected: 'boolean', got: typeOf(r.value) };
          if (r.value === true) return { ok: true, value: true, cached: false };
        }
        return { ok: true, value: false, cached: false };
      }
    }
    case 'prev':
    case 'eventually':
    case 'globally':
    case 'until':
      return { ok: false, code: 'TEMPORAL_NOT_EVALUABLE', at: kind };
    default:
      return { ok: false, code: 'TYPE_MISMATCH', at: (e as MathExpr).kind, expected: 'known kind', got: 'unknown' };
  }
}
export function evalExpr(e: MathExpr, ctx: EvalContext): Checked<number | boolean> {
  const inner = evalInternal(e as MathExpr, ctx, 0);
  if (!inner.ok) return inner as EvalErr;
  const v = inner.value;
  if (typeof v === 'number' || typeof v === 'boolean') return { ok: true, value: v, cached: false };
  return { ok: false, code: 'TYPE_MISMATCH', at: (e as MathExpr).kind, expected: 'number|boolean', got: typeOf(v) };
}
export function evalCached(e: MathExpr, ctx: EvalContext, memo: Map<string, Checked<number | boolean>>): Checked<number | boolean> {
  const key = canonicalExpr(e);
  const hit = memo.get(key);
  if (hit !== undefined) return { ...(hit as EvalOk<number | boolean>), cached: true } as Checked<number | boolean>;
  const res = evalExpr(e, ctx);
  memo.set(key, res);
  return res;
}
