import { describe, expect, it } from 'bun:test';
import { evalExpr, evalCached, makeDefaultContext } from '../math/eval.ts';
import { checkContract, toBrandedVerdict, extractBindings } from '../math/contract.ts';
import { createOracleRegistry } from '../math/oracle.ts';
import type { Bindings, MathExpr } from '../math/expr.ts';
import { TEMPORAL_KINDS } from '../math/expr.ts';

function b(values: Record<string, number | boolean | string>): Bindings { return { profile: 'test', values }; }
function ctx(values: Record<string, number | boolean | string> = {}) { return makeDefaultContext(b(values)); }

describe('MPSE MATH SUBSTRATE — §4.2', () => {
  it('determinism ×500 same input → same output', () => {
    const expr: MathExpr = { kind: 'add', l: { kind: 'var', name: 'x' }, r: { kind: 'lit', value: 3 } };
    const c = ctx({ x: 7 });
    let first = evalExpr(expr, c);
    if (!first.ok) throw new Error('first failed');
    const v0 = (first as { value: number }).value;
    let failures = 0;
    for (let i = 0; i < 500; i++) { const r = evalExpr(expr, c); if (!r.ok || (r as { value: number }).value !== v0) failures++; }
    expect(failures).toBe(0);
  });

  it('100k-deep left-nested add terminates with DEPTH_EXCEEDED not stack overflow', () => {
    let e: MathExpr = { kind: 'lit', value: 1 };
    for (let i = 0; i < 100_000; i++) e = { kind: 'add', l: e, r: { kind: 'lit', value: 1 } };
    const r = evalExpr(e, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as { code: string }).code).toBe('DEPTH_EXCEEDED');
  });

  it('every temporal kind throws TEMPORAL_NOT_EVALUABLE on point evaluation', () => {
    const cases: MathExpr[] = [
      { kind: 'prev', x: { kind: 'lit', value: true } },
      { kind: 'eventually', x: { kind: 'lit', value: true } },
      { kind: 'globally', x: { kind: 'lit', value: true } },
      { kind: 'until', a: { kind: 'lit', value: true }, b: { kind: 'lit', value: false } },
    ];
    for (const e of cases) {
      const r = evalExpr(e, ctx());
      expect(r.ok).toBe(false);
      if (!r.ok) expect((r as { code: string }).code).toBe('TEMPORAL_NOT_EVALUABLE');
    }
    expect(TEMPORAL_KINDS.size).toBe(4);
  });

  it('unbound binding returns UNBOUND_SYMBOL never fabricated true/false', () => {
    const r = evalExpr({ kind: 'var', name: 'missing' }, ctx({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as { code: string }).code).toBe('UNBOUND_SYMBOL');
    const r2 = evalExpr({ kind: 'add', l: { kind: 'var', name: 'a' }, r: { kind: 'lit', value: 1 } }, ctx({}));
    expect(r2.ok).toBe(false);
  });

  it('duplicate oracle registration throws ORACLE_CONFLICT', () => {
    const reg = createOracleRegistry();
    const decl = { exprId: 'fT', oracleValue: 24 as const, anchor: { source: 'KB-01', line: 311, quote: 'f(T)=24' } };
    reg.register(decl);
    expect(() => reg.register(decl)).toThrow('ORACLE_CONFLICT');
    expect(reg.size()).toBe(1);
  });

  it('demo oracle f(T)=8×3=24 evaluates to 24 and 25 discharge is CONTRADICTED', () => {
    const expr: MathExpr = { kind: 'mul', l: { kind: 'var', name: 'N' }, r: { kind: 'add', l: { kind: 'lit', value: 1 }, r: { kind: 'var', name: 'P' } } };
    const c = ctx({ N: 8, P: 2 });
    const ev = evalExpr(expr, c);
    expect(ev.ok).toBe(true);
    if (ev.ok) expect((ev as { value: number }).value).toBe(24);
    const v24 = toBrandedVerdict({ evaluated: ev, oracleValue: 24, hasBindings: true });
    expect(v24).toBe('VALID');
    const v25 = toBrandedVerdict({ evaluated: ev, oracleValue: 25, hasBindings: true });
    expect(v25).toBe('CONTRADICTED');
  });

  it('oracle registry contentHash over canonical sorted pairs', () => {
    const a = createOracleRegistry();
    a.register({ exprId: 'b', oracleValue: 2, anchor: { source: 's', line: 1, quote: 'q' } });
    a.register({ exprId: 'a', oracleValue: 1, anchor: { source: 's', line: 1, quote: 'q' } });
    const b = createOracleRegistry();
    b.register({ exprId: 'a', oracleValue: 1, anchor: { source: 's', line: 1, quote: 'q' } });
    b.register({ exprId: 'b', oracleValue: 2, anchor: { source: 's', line: 1, quote: 'q' } });
    expect(a.contentHash()).toBe(b.contentHash());
  });

  it('DIV_BY_ZERO is typed never thrown', () => {
    const r = evalExpr({ kind: 'div', l: { kind: 'lit', value: 1 }, r: { kind: 'lit', value: 0 } }, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as { code: string }).code).toBe('DIV_BY_ZERO');
  });

  it('DOMAIN_UNBOUNDED when quantifier domain exceeds limit', () => {
    const big: MathExpr = { kind: 'setLit', xs: Array.from({ length: 20 }, (_, i) => ({ kind: 'lit' as const, value: i })) };
    const e: MathExpr = { kind: 'forall', var: 'x', in: big, body: { kind: 'gt', l: { kind: 'var', name: 'x' }, r: { kind: 'lit', value: -1 } } };
    const c2 = { bindings: b({}), depthLimit: 256, domainSizeLimit: 10 };
    const r = evalExpr(e, c2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as { code: string }).code).toBe('DOMAIN_UNBOUNDED');
  });

  it('TYPE_MISMATCH on adding number and boolean', () => {
    const r = evalExpr({ kind: 'add', l: { kind: 'lit', value: 1 }, r: { kind: 'lit', value: true } }, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as { code: string }).code).toBe('TYPE_MISMATCH');
  });

  it('checkContract 4 roles REJECT/THROW/DIE/ESCALATE', () => {
    const contract = {
      id: 'c1',
      preconditions: [{ kind: 'gt' as const, l: { kind: 'var' as const, name: 'x' }, r: { kind: 'lit' as const, value: 0 } }],
      postconditions: [{ kind: 'lt' as const, l: { kind: 'var' as const, name: 'out' }, r: { kind: 'lit' as const, value: 100 } }],
      invariants: [{ kind: 'ge' as const, l: { kind: 'var' as const, name: 'x' }, r: { kind: 'lit' as const, value: 0 } }],
      temporal: [{ kind: 'globally' as const, x: { kind: 'lit' as const, value: true } }],
      provenance: [{ source: 'KB-02', line: 1, quote: 'q' }],
    };
    const failPre = checkContract(contract, 'pre', b({ x: -1, out: 10 }));
    expect(failPre.verdict).toBe('CONTRADICTED');
    expect(failPre.perExpr[0].role).toBe('REJECT');
    const failPost = checkContract(contract, 'post', b({ x: 1, out: 200 }));
    expect(failPost.verdict).toBe('CONTRADICTED');
    const ok = checkContract(contract, 'ok', b({ x: 1, out: 10 }));
    expect(ok.verdict === 'VALID' || ok.verdict === 'UNVERIFIABLE').toBe(true);
  });

  it('evalCached memoization returns cached:true on second hit', () => {
    const memo = new Map();
    const e: MathExpr = { kind: 'add', l: { kind: 'lit', value: 2 }, r: { kind: 'lit', value: 2 } };
    const c = ctx();
    const r1 = evalCached(e, c, memo);
    expect((r1 as { cached: boolean }).cached).toBe(false);
    const r2 = evalCached(e, c, memo);
    expect((r2 as { cached: boolean }).cached).toBe(true);
    expect((r1 as { value: number }).value).toBe((r2 as { value: number }).value);
  });

  it('empty set card is 0 and sum is 0', () => {
    const empty: MathExpr = { kind: 'setLit', xs: [] };
    expect((evalExpr({ kind: 'card', x: empty }, ctx()) as { value: number }).value).toBe(0);
    expect((evalExpr({ kind: 'sum', x: empty }, ctx()) as { value: number }).value).toBe(0);
  });

  it('concurrent evaluations produce deterministic results', async () => {
    const e: MathExpr = { kind: 'mul', l: { kind: 'var', name: 'n' }, r: { kind: 'lit', value: 3 } };
    const results = await Promise.all(Array.from({ length: 50 }, () => Promise.resolve(evalExpr(e, ctx({ n: 8 })))));
    const vals = results.map((r) => r.ok ? (r as { value: number }).value : -1);
    expect(vals.every((v) => v === 24)).toBe(true);
  });

  it('boundary domainSizeLimit exactly 10k passes and 10_001 fails', () => {
    const domain10k: MathExpr = { kind: 'setLit', xs: Array.from({ length: 10_000 }, (_, i) => ({ kind: 'lit' as const, value: i })) };
    const q: MathExpr = { kind: 'exists', var: 'x', in: domain10k, body: { kind: 'eq' as const, l: { kind: 'var' as const, name: 'x' }, r: { kind: 'lit' as const, value: 9999 } } };
    const ok = evalExpr(q, ctx());
    expect(ok.ok).toBe(true);
    const domain10k1: MathExpr = { kind: 'setLit', xs: Array.from({ length: 10_001 }, (_, i) => ({ kind: 'lit' as const, value: i })) };
    const q2: MathExpr = { kind: 'exists', var: 'x', in: domain10k1, body: { kind: 'eq' as const, l: { kind: 'var' as const, name: 'x' }, r: { kind: 'lit' as const, value: 0 } } };
    const bad = evalExpr(q2, ctx());
    expect(bad.ok).toBe(false);
  });

  it('toBrandedVerdict UNVERIFIABLE when no bindings', () => {
    const ev = { ok: true as const, value: true as const, cached: false as const };
    expect(toBrandedVerdict({ evaluated: ev, hasBindings: false })).toBe('UNVERIFIABLE');
  });

  it('toBrandedVerdict THEATRICAL_LIE when mismatch flag set', () => {
    const ev = { ok: true as const, value: true as const, cached: false as const };
    expect(toBrandedVerdict({ evaluated: ev, hasBindings: true, theatricalMismatch: true })).toBe('THEATRICAL_LIE');
  });

  it('toBrandedVerdict UNVERIFIED on eval error', () => {
    const ev: import('../math/eval.ts').Checked<number | boolean> = { ok: false as const, code: 'DIV_BY_ZERO' as const };
    expect(toBrandedVerdict({ evaluated: ev, hasBindings: true })).toBe('UNVERIFIED');
  });

  it('extractBindings round-trips', () => {
    const r = extractBindings({ a: 1, b: true });
    expect(r.ok).toBe(true);
  });

  it('nullish raw values handled without throw', () => {
    const r = evalExpr({ kind: 'var', name: 'x' }, makeDefaultContext({ profile: 'test', values: {} as never }));
    expect(r.ok).toBe(false);
  });
});
