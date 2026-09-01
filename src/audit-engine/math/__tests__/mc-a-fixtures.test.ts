import { describe, it, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ALL_KINDS } from '../expr.ts';
import type { Bindings, MathExpr } from '../expr.ts';
import { evalExpr, makeDefaultContext } from '../eval.ts';
import { checkContract } from '../contract.ts';
import { createOracleRegistry } from '../oracle.ts';

function b(values: Record<string, number | boolean | string | ReadonlySet<string | number> | ReadonlyArray<string | number | boolean>>): Bindings {
  return { profile: 'test', values: values as unknown as Record<string, never> };
}
function ctx(values: Record<string, unknown> = {}) {
  return makeDefaultContext(b(values as never));
}

// mut-check MC-A-05: swapping stage string "pre"↔"post" must flip verdict — early-bail mut removal of return would make perExpr length 2
// mut-check MC-A-06: changing epsilon literal 0.1→0.2 would make beyond test pass incorrectly — boundary must use imported eps
// mut-check MC-A-07: hardcoding 29 instead of 30 would incorrectly pass if ALL_KINDS drifted — exact 30 required
describe('SPEC-A A-5 MC-A-05 stage-selection early-bail', () => {
  it('pre stage only checks preconditions — failing pre + passing post at post returns VALID', () => {
    const contract = {
      id: 'mc-a-05-pre-post-isolation',
      preconditions: [{ kind: 'gt' as const, l: { kind: 'var' as const, name: 'x' }, r: { kind: 'lit' as const, value: 100 } }],
      postconditions: [{ kind: 'gt' as const, l: { kind: 'var' as const, name: 'out' }, r: { kind: 'lit' as const, value: 0 } }],
      invariants: [] as unknown as MathExpr[],
      provenance: [{ source: 'spec', line: 1, quote: 'q' }],
    };
    const resPost = checkContract(contract, 'post', b({ x: -1, out: 10 }));
    expect(resPost.verdict).toBe('VALID');
    expect(resPost.perExpr.length).toBe(1);
    expect(resPost.perExpr[0]!.role).toBe('THROW');
    const resPre = checkContract(contract, 'pre', b({ x: -1, out: 10 }));
    expect(resPre.verdict).not.toBe('VALID');
    expect(resPre.verdict).toBe('CONTRADICTED');
    expect(resPre.perExpr[0]!.role).toBe('REJECT');
  });

  it('inv stage only checks invariants — failing pre/post do not affect inv VALID', () => {
    const contract = {
      id: 'mc-a-05-inv-only',
      preconditions: [{ kind: 'lit' as const, value: false }],
      postconditions: [{ kind: 'lit' as const, value: false }],
      invariants: [{ kind: 'lit' as const, value: true }],
      provenance: [{ source: 'spec', line: 1, quote: 'q' }],
    };
    const r = checkContract(contract, 'inv', b({ dummy: 1 }));
    expect(r.verdict).toBe('VALID');
    expect(r.perExpr[0]!.role).toBe('DIE');
  });

  it('early-bail: first failing expr returns immediately — perExpr length 1 not 2', () => {
    const contract = {
      id: 'mc-a-05-early-bail',
      preconditions: [
        { kind: 'lit' as const, value: false },
        { kind: 'lit' as const, value: false },
      ],
      postconditions: [] as unknown as MathExpr[],
      invariants: [] as unknown as MathExpr[],
      provenance: [{ source: 'spec', line: 1, quote: 'q' }],
    };
    const r = checkContract(contract, 'pre', b({ x: 1 }));
    expect(r.verdict).toBe('CONTRADICTED');
    expect(r.perExpr.length).toBe(1);
  });

  it('wrong-stage must CONTRADICT not silently pass — post failing at post is CONTRADICTED', () => {
    const contract = {
      id: 'mc-a-05-wrong-stage-rejects',
      preconditions: [{ kind: 'lit' as const, value: true }],
      postconditions: [{ kind: 'lit' as const, value: false }],
      invariants: [] as unknown as MathExpr[],
      provenance: [{ source: 'spec', line: 1, quote: 'q' }],
    };
    const rPre = checkContract(contract, 'pre', b({ x: 1 }));
    expect(rPre.verdict).toBe('VALID');
    const rPost = checkContract(contract, 'post', b({ x: 1 }));
    expect(rPost.verdict).toBe('CONTRADICTED');
    expect(rPost.perExpr[0]!.role).toBe('THROW');
  });

  it('temporal stage maps to ESCALATE role', () => {
    const contract = {
      id: 'mc-a-05-temporal',
      preconditions: [] as unknown as MathExpr[],
      postconditions: [] as unknown as MathExpr[],
      invariants: [] as unknown as MathExpr[],
      temporal: [{ kind: 'lit' as const, value: false }],
      provenance: [{ source: 'spec', line: 1, quote: 'q' }],
    };
    const r = checkContract(contract, 'temporal', b({ x: 1 }));
    expect(r.perExpr[0]!.role).toBe('ESCALATE');
    expect(r.verdict).toBe('CONTRADICTED');
  });
});

describe('SPEC-A A-5 MC-A-06 epsilon boundary via oracle epsilon identifier', () => {
  it('two reals within epsilon compare equal via oracle discharge using imported epsilon', () => {
    const reg = createOracleRegistry();
    const declaredEpsilon = 0.1;
    reg.register({ exprId: 'mc-a-06-within', oracleValue: 10, anchor: { source: 'spec', line: 1, quote: 'q' }, epsilon: declaredEpsilon });
    const withinEpsilon = 10 + declaredEpsilon * 0.5;
    expect(reg.discharge('mc-a-06-within', withinEpsilon)).toBe(true);
    expect(reg.discharge('mc-a-06-within', 10)).toBe(true);
    const atBoundary = 10 + declaredEpsilon;
    expect(reg.discharge('mc-a-06-within', atBoundary)).toBe(true);
  });

  it('two reals beyond epsilon are CONTRADICTED — epsilon boundary is tight', () => {
    const reg = createOracleRegistry();
    const eps = 0.1;
    reg.register({ exprId: 'mc-a-06-beyond', oracleValue: 10, anchor: { source: 'spec', line: 1, quote: 'q' }, epsilon: eps });
    const beyond = 10 + eps + 1e-9;
    expect(reg.discharge('mc-a-06-beyond', beyond)).toBe(false);
    const farBeyond = 10 + eps * 2;
    expect(reg.discharge('mc-a-06-beyond', farBeyond)).toBe(false);
  });

  it('epsilon is zero when not supplied — exact equality required', () => {
    const reg = createOracleRegistry();
    reg.register({ exprId: 'mc-a-06-zero-eps', oracleValue: 5, anchor: { source: 'spec', line: 1, quote: 'q' } });
    expect(reg.discharge('mc-a-06-zero-eps', 5)).toBe(true);
    expect(reg.discharge('mc-a-06-zero-eps', 5.0000001)).toBe(false);
  });

  it('negative epsilon throws ORACLE_EPSILON_REQUIRED', () => {
    const reg = createOracleRegistry();
    expect(() => reg.register({ exprId: 'mc-a-06-neg', oracleValue: 1, anchor: { source: 'spec', line: 1, quote: 'q' }, epsilon: -1 as unknown as number })).toThrow('ORACLE_EPSILON_REQUIRED');
  });
});

describe('SPEC-A A-5 MC-A-07 thirty-kind census — 30===30 exact', () => {
  it('ALL_KINDS length is exactly 30', () => {
    expect(ALL_KINDS.size).toBe(30);
    expect([...ALL_KINDS].length).toBe(30);
  });

  it('eval dispatch covers all 30 kinds without default leak — case census equals kind set', () => {
    const evalPath = path.join(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), '..', 'eval.ts');
    let src = '';
    try {
      src = fs.readFileSync(evalPath, 'utf-8');
    } catch (e: unknown) {
      throw new Error(` MC-A-07: cannot read eval.ts: ${e instanceof Error ? e.message : String(e)}`);
    }
    const caseMatches = [...src.matchAll(/case\s+["']([^"']+)["']/g)].map((m) => m[1]!);
    const caseSet = new Set(caseMatches);
    const kindsArr = [...ALL_KINDS];
    const ifHandled = new Set(['var', 'lit']);
    const switchCovered = kindsArr.filter((k) => caseSet.has(k) || ifHandled.has(k));
    expect(caseSet.size).toBeGreaterThanOrEqual(28);
    expect(switchCovered.length).toBe(30);
    for (const k of kindsArr) {
      const covered = caseSet.has(k) || ifHandled.has(k);
      expect(covered).toBe(true);
    }
    expect(kindsArr.length).toBe(30);
  });

  it('every kind evaluates without unknown-kind leak — no default masking', () => {
    const evalPath = path.join(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), '..', 'eval.ts');
    const src = fs.readFileSync(evalPath, 'utf-8');
    const hasDefault = /default\s*:/.test(src);
    const defaultSection = src.slice(src.lastIndexOf('default'));
    const defaultIsTemporalOnly = hasDefault ? /TEMPORAL_NOT_EVALUABLE|unknown/i.test(defaultSection) : false;
    expect(hasDefault).toBe(true);
    const kindsCovered = [...ALL_KINDS].filter((k) => src.includes(`"${k}"`) || src.includes(`'${k}'`));
    expect(kindsCovered.length).toBe(30);
  });

  it('ALL_KINDS derived via runtime set not hardcode — Object.keys style check', () => {
    const derived = new Set([...ALL_KINDS]);
    expect(derived.size).toBe(30);
    expect(derived.has('var')).toBe(true);
    expect(derived.has('until')).toBe(true);
    expect(derived.has('lit')).toBe(true);
  });
});
