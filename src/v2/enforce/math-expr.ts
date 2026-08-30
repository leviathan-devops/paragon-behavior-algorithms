export type MathExprKind =
  | 'add' | 'sub' | 'mul' | 'div' | 'mod'
  | 'lt' | 'le' | 'gt' | 'ge' | 'eq' | 'ne'
  | 'and' | 'or' | 'not' | 'if'
  | 'card' | 'sum' | 'max' | 'min'
  | 'member' | 'subset' | 'setLit'
  | 'forall' | 'exists'
  | 'prev' | 'eventually' | 'globally' | 'until';

export interface MathExpr {
  kind: MathExprKind;
  args: MathExpr[];
  value?: string | number;
}

export interface BindingMap {
  [name: string]: number | string | boolean | BindingMap | Array<number | string>;
}

export function expr(kind: MathExprKind, args: MathExpr[], value?: string | number): MathExpr {
  const n: MathExpr = { kind, args };
  if (value !== undefined) n.value = value;
  return n;
}

export const lit = (v: number | string): MathExpr => ({ kind: 'setLit', args: [], value: v });
export const va = (name: string): MathExpr => ({ kind: 'setLit', args: [], value: name });

function isVarLeaf(e: MathExpr): boolean {
  return e.kind === 'setLit' && e.args.length === 0 && typeof e.value === 'string';
}

function resolveVar(name: string, bindings: BindingMap): number | string | boolean | BindingMap | Array<number | string> | undefined {
  return bindings[name];
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    throw new Error(`cannot coerce string "${v}" to number`);
  }
  throw new Error(`cannot coerce ${typeof v} to number`);
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0 && v !== 'false' && v !== '0';
  return Boolean(v);
}

function evalLeaf(e: MathExpr, bindings: BindingMap): number | string | boolean {
  if (e.value === undefined) throw new Error(`setLit leaf missing value`);
  const v = e.value;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const bound = resolveVar(v, bindings);
    if (bound !== undefined) {
      if (typeof bound === 'number' || typeof bound === 'string' || typeof bound === 'boolean') return bound;
      return v;
    }
    const n = Number(v);
    if (Number.isFinite(n) && v.trim() !== '') return n;
    return v;
  }
  return v;
}

export function evalExpr(expr: MathExpr, bindings: BindingMap): number | boolean | string {
  if (!expr || typeof expr.kind !== 'string') throw new Error('invalid MathExpr: missing kind');
  const kind = expr.kind as MathExprKind;
  const args = expr.args ?? [];

  if (kind === 'setLit') {
    if (args.length === 0) return evalLeaf(expr, bindings);
    return args.length;
  }

  switch (kind) {
    case 'add': {
      if (args.length < 2) throw new Error('add requires >=2 args');
      let s = toNumber(evalExpr(args[0]!, bindings));
      for (let i = 1; i < args.length; i++) s += toNumber(evalExpr(args[i]!, bindings));
      return s;
    }
    case 'sub': {
      if (args.length < 2) throw new Error('sub requires >=2 args');
      let s = toNumber(evalExpr(args[0]!, bindings));
      for (let i = 1; i < args.length; i++) s -= toNumber(evalExpr(args[i]!, bindings));
      return s;
    }
    case 'mul': {
      if (args.length < 2) throw new Error('mul requires >=2 args');
      let s = toNumber(evalExpr(args[0]!, bindings));
      for (let i = 1; i < args.length; i++) s *= toNumber(evalExpr(args[i]!, bindings));
      return s;
    }
    case 'div': {
      if (args.length !== 2) throw new Error('div requires 2 args');
      const a = toNumber(evalExpr(args[0]!, bindings));
      const b = toNumber(evalExpr(args[1]!, bindings));
      if (b === 0) throw new Error('division by zero');
      return a / b;
    }
    case 'mod': {
      if (args.length !== 2) throw new Error('mod requires 2 args');
      const a = toNumber(evalExpr(args[0]!, bindings));
      const b = toNumber(evalExpr(args[1]!, bindings));
      if (b === 0) throw new Error('mod by zero');
      return a % b;
    }
    case 'lt': return toNumber(evalExpr(args[0]!, bindings)) < toNumber(evalExpr(args[1]!, bindings));
    case 'le': return toNumber(evalExpr(args[0]!, bindings)) <= toNumber(evalExpr(args[1]!, bindings));
    case 'gt': return toNumber(evalExpr(args[0]!, bindings)) > toNumber(evalExpr(args[1]!, bindings));
    case 'ge': return toNumber(evalExpr(args[0]!, bindings)) >= toNumber(evalExpr(args[1]!, bindings));
    case 'eq': {
      const a = evalExpr(args[0]!, bindings);
      const b = evalExpr(args[1]!, bindings);
      return a === b;
    }
    case 'ne': {
      const a = evalExpr(args[0]!, bindings);
      const b = evalExpr(args[1]!, bindings);
      return a !== b;
    }
    case 'and': {
      for (const a of args) if (!toBool(evalExpr(a, bindings))) return false;
      return true;
    }
    case 'or': {
      for (const a of args) if (toBool(evalExpr(a, bindings))) return true;
      return false;
    }
    case 'not': {
      if (args.length !== 1) throw new Error('not requires 1 arg');
      return !toBool(evalExpr(args[0]!, bindings));
    }
    case 'if': {
      if (args.length !== 3) throw new Error('if requires 3 args');
      return toBool(evalExpr(args[0]!, bindings)) ? evalExpr(args[1]!, bindings) : evalExpr(args[2]!, bindings);
    }
    case 'card': {
      if (args.length !== 1) throw new Error('card requires 1 arg');
      const v = bindings[String(args[0]!.value ?? '')];
      if (Array.isArray(v)) return v.length;
      if (v !== undefined) return 1;
      const ev = evalExpr(args[0]!, bindings);
      if (Array.isArray(ev)) return (ev as unknown[]).length;
      if (typeof ev === 'string') return ev.length;
      return 0;
    }
    case 'sum': {
      if (args.length !== 1) throw new Error('sum requires 1 arg');
      const key = String(args[0]!.value ?? '');
      const v = bindings[key];
      if (Array.isArray(v)) return (v as number[]).reduce((s, n) => s + toNumber(n), 0);
      return toNumber(evalExpr(args[0]!, bindings));
    }
    case 'max': {
      if (args.length === 0) throw new Error('max requires >=1 arg');
      let m = toNumber(evalExpr(args[0]!, bindings));
      for (let i = 1; i < args.length; i++) m = Math.max(m, toNumber(evalExpr(args[i]!, bindings)));
      return m;
    }
    case 'min': {
      if (args.length === 0) throw new Error('min requires >=1 arg');
      let m = toNumber(evalExpr(args[0]!, bindings));
      for (let i = 1; i < args.length; i++) m = Math.min(m, toNumber(evalExpr(args[i]!, bindings)));
      return m;
    }
    case 'member': {
      if (args.length !== 2) throw new Error('member requires 2 args');
      const elem = evalExpr(args[0]!, bindings);
      const key = String(args[1]!.value ?? '');
      const arr = bindings[key];
      if (Array.isArray(arr)) return (arr as unknown[]).includes(elem as unknown);
      const setStr = String(evalExpr(args[1]!, bindings));
      return setStr.includes(String(elem));
    }
    case 'subset': {
      if (args.length !== 2) throw new Error('subset requires 2 args');
      const aKey = String(args[0]!.value ?? '');
      const bKey = String(args[1]!.value ?? '');
      const a = bindings[aKey];
      const b = bindings[bKey];
      if (Array.isArray(a) && Array.isArray(b)) return (a as unknown[]).every((x) => (b as unknown[]).includes(x));
      return false;
    }
    case 'forall':
    case 'exists':
    case 'prev':
    case 'eventually':
    case 'globally':
    case 'until':
      return evalTemporal(kind, args, bindings);
    default:
      throw new Error(`unknown MathExpr kind: ${kind}`);
  }
}

function evalTemporal(kind: MathExprKind, args: MathExpr[], bindings: BindingMap): boolean {
  if (kind === 'forall' || kind === 'exists') {
    if (args.length < 2) throw new Error(`${kind} requires >=2 args`);
    const domainKey = String(args[0]!.value ?? '');
    const domain = bindings[domainKey];
    if (!Array.isArray(domain)) return kind === 'forall';
    const pred = args[1]!;
    if (kind === 'forall') {
      for (const elem of domain as unknown[]) {
        const inner: BindingMap = { ...bindings, _elem: elem as number | string | boolean };
        const r = evalExpr(pred, inner);
        if (!toBool(r)) return false;
      }
      return true;
    } else {
      for (const elem of domain as unknown[]) {
        const inner: BindingMap = { ...bindings, _elem: elem as number | string | boolean };
        const r = evalExpr(pred, inner);
        if (toBool(r)) return true;
      }
      return false;
    }
  }
  if (kind === 'prev') {
    if (args.length !== 1) throw new Error('prev requires 1 arg');
    return toBool(evalExpr(args[0]!, bindings));
  }
  if (kind === 'eventually' || kind === 'globally') {
    if (args.length !== 1) throw new Error(`${kind} requires 1 arg`);
    return toBool(evalExpr(args[0]!, bindings));
  }
  if (kind === 'until') {
    if (args.length !== 2) throw new Error('until requires 2 args');
    return toBool(evalExpr(args[1]!, bindings)) || toBool(evalExpr(args[0]!, bindings));
  }
  return false;
}
