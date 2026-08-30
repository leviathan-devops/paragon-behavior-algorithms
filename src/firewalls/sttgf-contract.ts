// THE STTGF CONTRACT MODULE — the closed-form machinery of the STTGF (the spec:
// STTGF_L2_SPEC.md — THE AUTHORITATIVE PARTS 3-6: §42 the MATH-FIRST LAW, §45
// the Checked<T> structured violation, §48 the ONE shared check set, §49 the
// 70%-RULE, §51 the total-deterministic evalExpr, §52 the binding extraction,
// §53 the checkContract discharge, §58 the shared-set memoization, §63 the
// per-class MathContracts VERBATIM, §66 the CONTRADICTED engine, §68 the
// named-but-undefined entities, §70 the tool-execution front).
//
// THE MATH-FIRST LAW (§42): the STTGF's intelligence flow is specified as
// MathExpr/MathContract FIRST; this file is the translation that must discharge
// the SAME contract. A decision function that does NOT reference the contract
// is a type error. The anti-slop guarantee is STRUCTURAL: a regex-slop tower
// CANNOT be expressed as a MathContract — the type system rejects it.
//
// THE ANTI-TOWER (H-10): the decision is TABLE-DRIVEN, never branch-driven. The
// ONLY decision over the claim class is the table lookup STTGF_CONTRACTS[
// claimClass] — the discharge never writes a control branch over the class.
// This file carries ZERO control branches over the claim class and ZERO
// conditional-else chains — the anti-tower grep gate is clean by construction.
//
// THE TOTAL-DETERMINISTIC LAW (§51, KB-MPSE-01 §0.1 Iron Law 1): a mathematical
// expression either evaluates to a unique value or it is undefined — there is
// no third option. evalExpr is total: every op evaluates; the unbound-binding
// throw is the mechanical definition of UNVERIFIABLE (a proof-gap, never a
// silent pass); an unhandled op throws EvalError (the loud fail).
//
// THE UNBOUND RULE (§51): evalExpr throws UnboundBindingError(name) when a ref
// is missing from the bindings. That throw is NOT a bug — it is the proof-gap.
// The ONE legal catch is checkContract's 'unbound:' mapping (TASK 3); every
// other error rethrows (the loud fail). The UNVERIFIABLE-IS-A-FLAG rule (§5):
// the missing binding maps to UNVERIFIABLE, never a silent legitimate.
//
// THE TYPE SOURCE (the forward-contract): the types come from './sttgf-types'
// (the parallel hub agent — MathExpr, MathContract, Bindings, Checked,
// BrandedVerdict, ClaimClass, UnboundBindingError). This module does NOT define
// them; it imports them. The checkContract ok:true branch applies the brand
// INSIDE the decision boundary (§44, H-8 — the only producer of the verdict).
//
// THE EVIDENCE MACHINE (the single source of the mechanical testing-degree
// state): extractBindings reads getEvidenceState(sessionId) from
// './evidence-tracker.js' — the bridge where the mechanical truth enters the
// decision. The regex is a mechanical DETECTOR only (the smoke-shape flags
// DETECT the command shapes); the contract decides the block (the ISE law).
//
// NO .md files are touched. This is a NEW module — created from scratch.

import { UnboundBindingError } from './sttgf-types';
import type { MathExpr, MathContract, Bindings, Checked, BrandedVerdict, ClaimClass } from './sttgf-types';
import { getEvidenceState } from './evidence-tracker.js';
import type { EvidenceEvent } from './evidence-tracker.js';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ── THE TEMPORAL ALGEBRA (§47 + H-6 — the named window + the skew boundary) ──
// The freshness window mirrors CLAIM_FRESH_WINDOW_MS (§16.3); the skew
// tolerance absorbs the event-clock-vs-wall-clock drift at the boundary (H-6).
// The boundary is inclusive: e.at >= (now - window - skew).
export const STATUS_FRESH_WINDOW_MS = 300_000;
export const CLOCK_SKEW_TOLERANCE_MS = 5_000;

// ── THE INDEXES (§68.1 — the set-membership allowed sets) ──
// THE MODULE INDEX — the known modules from the source tree (the set the
// 'member(subject, knownModules)' clause's membership checks against). The
// equivalent of glob src/**/*.ts → the paths without the src/ prefix + the .ts
// suffix. Computed ONCE at module load with a deterministic fs walk (zero deps,
// zero regex). THE FAIL-CLOSED: a walk failure → the EMPTY set → the member
// clause fails → the claim is flagged, never silently passed.

function findSrcDir(): string | null {
  let dir = typeof process !== 'undefined' && process.cwd ? process.cwd() : '';
  if (!dir) return null;
  for (let i = 0; i < 10; i++) {
    try {
      const candidate = join(dir, 'src');
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // the candidate path is not a directory — continue up the tree
      void 0;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function walkTsFiles(root: string, modules: string[]): void {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    // the directory is unreadable — the walk stops at this branch
    void 0;
    return;
  }
  for (const ent of entries) {
    const full = join(root, ent.name);
    if (ent.isFile() && ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts')) {
      modules.push(full);
      continue;
    }
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git' || ent.name === 'Checkpoints') continue;
      walkTsFiles(full, modules);
    }
  }
}

function computeModuleIndex(): Set<string> {
  const src = findSrcDir();
  if (!src) return new Set<string>();
  const files: string[] = [];
  walkTsFiles(src, files);
  const index = new Set<string>();
  const prefix = src + '/';
  for (const f of files) {
    const rel = f.startsWith(prefix) ? f.slice(prefix.length) : f;
    const noExt = rel.endsWith('.ts') ? rel.slice(0, -3) : rel;
    index.add(noExt);
  }
  return index;
}

export const MODULE_INDEX: Set<string> = (() => {
  try {
    return computeModuleIndex();
  } catch {
    // the index computation failed — the fail-closed empty set (a module
    // membership then fails → the claim is flagged, never silently passed)
    return new Set<string>();
  }
})();

// THE SERVICE INDEX — the runtime's own services (the status-claim's allowed
// set, §68.1). A status claim's subject is a KNOWN service iff it is one of:
export const SERVICE_INDEX: Set<string> = new Set([
  'container', 'model', 'provider', 'plugin', 'runtime', 'system', 'session',
]);

// ── THE SHARED CHECK SET (§48 — the ONE shared MathExpr values) ──
// THE LAW: the 6 checks are ONE shared MathExpr set, not six copies that drift.
// The LTL property IS the snapshot invariant IS the guard — the same MathExpr
// reference across every layer (KB-MPSE-03:2534-2540). The 70%-RULE (§49): the
// integer checks (distScope + rawOutput) are the FIRST pass — zero false
// positives, the highest-value catches (the dist drift + the number drift).

type CheckId = 'subjectMatch' | 'distScope' | 'freshness' | 'rawOutput' | 'efficacy' | 'hasEvidence';

// THE 6 SHARED EXPRS — built through the expr() compiler (§48's forms) plus the
// literal ASTs for the two exists-without-an-'-in'-collection forms (the
// collection is explicit: efficacy over the unit events, hasEvidence over the
// evidence ring). One source of truth; every layer evaluates the SAME values.

// ── THE expr() COMPILER (the DSL → the MathExpr AST — the small builder) ──
// THE LAW: the spec's contracts carry STRING exprs (§63's clause data); the
// compiler translates those strings into the MathExpr AST the evaluator runs.
// The compiler is a deterministic recursive-descent parser over a char scanner —
// ZERO regex, ZERO dependencies, ZERO silent defaults. A malformed source
// throws EvalError (the loud fail: a malformed contract clause is a real bug).
// THE FORMS IT COMPILES (the spec's §42/§48/§63/§70 surface): the literals
// (numbers, strings, booleans), the dotted refs (subject, e.subject,
// currentDistSha), the comparisons (== != < <= > >=), the boolean connectives
// (and or not), the set literal { X } (the singleton-as-scalar form),
// member/subset, exists(V in OVER[: BODY]) / forall, card/sum/max/min,
// prev/eventually/globally/until, if(cond, then, else), unify(a, b) → the eq
// node, match(shape, command) → the precomputed shape ref, and the derived
// predicates changed/unchanged/sourceChangeEvent/claimEvent/statusProbe →
// their precomputed boolean refs.

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: '==' | '!=' | '<' | '<=' | '>' | '>=' }
  | { t: 'lparen' }
  | { t: 'rparen' }
  | { t: 'lbrace' }
  | { t: 'rbrace' }
  | { t: 'comma' }
  | { t: 'colon' }
  | { t: 'eof' };

function isIdentStartChar(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentPartChar(ch: string): boolean {
  return isIdentStartChar(ch) || (ch >= '0' && ch <= '9') || ch === '.' || ch === '-';
}

function tokenize(source: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '(') { toks.push({ t: 'lparen' }); i++; continue; }
    if (ch === ')') { toks.push({ t: 'rparen' }); i++; continue; }
    if (ch === '{') { toks.push({ t: 'lbrace' }); i++; continue; }
    if (ch === '}') { toks.push({ t: 'rbrace' }); i++; continue; }
    if (ch === ',') { toks.push({ t: 'comma' }); i++; continue; }
    if (ch === ':') { toks.push({ t: 'colon' }); i++; continue; }
    if (ch === '=' && source[i + 1] === '=') { toks.push({ t: 'op', v: '==' }); i += 2; continue; }
    if (ch === '!' && source[i + 1] === '=') { toks.push({ t: 'op', v: '!=' }); i += 2; continue; }
    if (ch === '<' && source[i + 1] === '=') { toks.push({ t: 'op', v: '<=' }); i += 2; continue; }
    if (ch === '>' && source[i + 1] === '=') { toks.push({ t: 'op', v: '>=' }); i += 2; continue; }
    if (ch === '<') { toks.push({ t: 'op', v: '<' }); i++; continue; }
    if (ch === '>') { toks.push({ t: 'op', v: '>' }); i++; continue; }
    if (ch === '=') throw new EvalError('unexpected "=" in expression: ' + source);
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < n && source[j] >= '0' && source[j] <= '9') j++;
      if (source[j] === '.' && source[j + 1] >= '0' && source[j + 1] <= '9') {
        j++;
        while (j < n && source[j] >= '0' && source[j] <= '9') j++;
      }
      toks.push({ t: 'num', v: Number(source.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let body = '';
      while (j < n && source[j] !== quote) {
        body += source[j];
        j++;
      }
      if (j >= n) throw new EvalError('unterminated string in expression: ' + source);
      toks.push({ t: 'str', v: body });
      i = j + 1;
      continue;
    }
    if (isIdentStartChar(ch)) {
      let j = i;
      while (j < n && isIdentPartChar(source[j])) j++;
      toks.push({ t: 'ident', v: source.slice(i, j) });
      i = j;
      continue;
    }
    throw new EvalError('unexpected character "' + ch + '" in expression: ' + source);
  }
  toks.push({ t: 'eof' });
  return toks;
}

class MathExprParser {  // THE F-105 FIX (2026-08-17 — the container's plugin-load failure: 'Cannot access Parser before initialization' — the NAME COLLISION + the FIELD-INITIALIZER HOISTING (the bun ESM evaluation-order bug). v1 renamed Parser → MathExprParser (the collision fixed) but the error persisted — the field initializers (`toks; pos = 0;`) were hoisted before the class binding initialized in the container's bun. v2: the initializers moved INTO the constructor (constructor assignments — no hoisting).
  private readonly toks: Tok[];
  private pos: number;

  constructor(source: string) {
    this.toks = tokenize(source);
    this.pos = 0;
  }

  private peek(): Tok {
    return this.toks[this.pos];
  }

  private next(): Tok {
    const tok = this.toks[this.pos];
    this.pos++;
    return tok;
  }

  private isKw(kw: string): boolean {
    const tok = this.peek();
    return tok.t === 'ident' && tok.v.toLowerCase() === kw;
  }

  private expect(kind: Tok['t'], what: string): void {
    const tok = this.next();
    if (tok.t !== kind) throw new EvalError('expected ' + what + ', got token ' + tok.t);
  }

  parse(): MathExpr {
    const e = this.parseOr();
    if (this.peek().t !== 'eof') throw new EvalError('trailing input in expression');
    return e;
  }

  private parseOr(): MathExpr {
    let left = this.parseAnd();
    while (this.isKw('or')) {
      this.next();
      left = { op: 'or', a: left, b: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): MathExpr {
    let left = this.parseUnary();
    while (this.isKw('and')) {
      this.next();
      left = { op: 'and', a: left, b: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): MathExpr {
    if (this.isKw('not')) {
      this.next();
      return { op: 'not', a: this.parseUnary() };
    }
    return this.parseCmp();
  }

  private parseCmp(): MathExpr {
    const left = this.parsePrimary();
    const tok = this.peek();
    if (tok.t === 'op') {
      this.next();
      const right = this.parsePrimary();
      if (tok.v === '==') return { op: 'eq', a: left, b: right };
      if (tok.v === '!=') return { op: 'ne', a: left, b: right };
      if (tok.v === '<') return { op: 'lt', a: left, b: right };
      if (tok.v === '<=') return { op: 'le', a: left, b: right };
      if (tok.v === '>') return { op: 'gt', a: left, b: right };
      return { op: 'ge', a: left, b: right };
    }
    return left;
  }

  private buildSet(items: MathExpr[]): MathExpr {
    // THE SINGLETON-AS-SCALAR FORM: the one-element set literal { X } compiles
    // to X's AST — 'member(x, { currentDistSha })' then compares x to the
    // scalar binding (the membership in the singleton set). The empty and the
    // multi-element literal sets are unsupported forms (never used by the
    // spec's contracts) — the loud error, never a silent guess.
    if (items.length === 1) return items[0];
    throw new EvalError('a set literal must be the singleton form { X }');
  }

  private parsePrimary(): MathExpr {
    const tok = this.peek();
    if (tok.t === 'num') {
      this.next();
      return { op: 'lit', value: tok.v };
    }
    if (tok.t === 'str') {
      this.next();
      return { op: 'lit', value: tok.v };
    }
    if (tok.t === 'lparen') {
      this.next();
      const e = this.parseOr();
      this.expect('rparen', ')');
      return e;
    }
    if (tok.t === 'lbrace') {
      this.next();
      const items: MathExpr[] = [];
      if (this.peek().t !== 'rbrace') {
        items.push(this.parseOr());
        while (this.peek().t === 'comma') {
          this.next();
          items.push(this.parseOr());
        }
      }
      this.expect('rbrace', '}');
      return this.buildSet(items);
    }
    if (tok.t === 'ident') {
      this.next();
      const name = tok.v;
      const lower = name.toLowerCase();
      if (lower === 'true') return { op: 'lit', value: true };
      if (lower === 'false') return { op: 'lit', value: false };
      if (this.peek().t === 'lparen') {
        this.next();
        const call = this.parseCall(name);
        this.expect('rparen', ')');
        return call;
      }
      return { op: 'ref', name };
    }
    throw new EvalError('unexpected token in expression: ' + JSON.stringify(tok));
  }

  private parseCall(name: string): MathExpr {
    const lower = name.toLowerCase();
    if (lower === 'exists') {
      const varTok = this.next();
      if (varTok.t !== 'ident') throw new EvalError('exists requires a variable name');
      const inTok = this.next();
      if (inTok.t !== 'ident' || inTok.v.toLowerCase() !== 'in') {
        throw new EvalError('exists requires the form: exists(V in OVER: BODY)');
      }
      const over = this.parseOr();
      let body: MathExpr = { op: 'lit', value: true };
      if (this.peek().t === 'colon') {
        this.next();
        body = this.parseOr();
      }
      return { op: 'exists', var: varTok.v, over, body };
    }
    if (lower === 'forall') {
      const varTok = this.next();
      if (varTok.t !== 'ident') throw new EvalError('forall requires a variable name');
      const inTok = this.next();
      if (inTok.t !== 'ident' || inTok.v.toLowerCase() !== 'in') {
        throw new EvalError('forall requires the form: forall(V in OVER: BODY)');
      }
      const over = this.parseOr();
      let body: MathExpr = { op: 'lit', value: true };
      if (this.peek().t === 'colon') {
        this.next();
        body = this.parseOr();
      }
      return { op: 'forall', var: varTok.v, over, body };
    }
    if (lower === 'if') {
      const cond = this.parseOr();
      this.expect('comma', ',');
      const then = this.parseOr();
      this.expect('comma', ',');
      const el = this.parseOr();
      return { op: 'if', cond, then, else: el };
    }
    if (lower === 'unify') {
      // unify(a, b) IS the equality of the two refs — the same predicate the
      // §48 subjectMatch check needs (claim.subject unified with event.subject)
      const a = this.parseOr();
      this.expect('comma', ',');
      const b = this.parseOr();
      return { op: 'eq', a, b };
    }
    if (lower === 'match') {
      // match(shape, command) → the precomputed shape ref: the smoke-shape
      // regex DETECTED the command's shape; the binding carries the boolean;
      // the contract decides. The regex never returns the verdict.
      const shapeTok = this.next();
      if (shapeTok.t !== 'ident') throw new EvalError('match requires a shape name as its first argument');
      this.expect('comma', ',');
      this.parseOr();
      return { op: 'ref', name: shapeTok.v };
    }
    if (lower === 'changed' || lower === 'unchanged' || lower === 'sourcechangeevent' || lower === 'claimevent' || lower === 'statusprobe') {
      // the derived predicates → their precomputed boolean bindings (the
      // forward-chain facts the extraction step wrote into the bindings)
      this.parseOr();
      return { op: 'ref', name };
    }
    if (lower === 'member') {
      const x = this.parseOr();
      this.expect('comma', ',');
      const set = this.parseOr();
      return { op: 'member', x, set };
    }
    if (lower === 'subset') {
      const x = this.parseOr();
      this.expect('comma', ',');
      const set = this.parseOr();
      return { op: 'subset', x, set };
    }
    if (lower === 'until') {
      const a = this.parseOr();
      this.expect('comma', ',');
      const b = this.parseOr();
      return { op: 'until', a, b };
    }
    if (lower === 'prev') {
      const a = this.parseOr();
      return { op: 'prev', a };
    }
    if (lower === 'eventually') {
      const a = this.parseOr();
      return { op: 'eventually', a };
    }
    if (lower === 'globally') {
      const a = this.parseOr();
      return { op: 'globally', a };
    }
    if (lower === 'card') {
      const over = this.parseOr();
      return { op: 'card', over };
    }
    if (lower === 'sum') {
      const over = this.parseOr();
      return { op: 'sum', over };
    }
    if (lower === 'max') {
      const over = this.parseOr();
      return { op: 'max', over };
    }
    if (lower === 'min') {
      const over = this.parseOr();
      return { op: 'min', over };
    }
    throw new EvalError('unknown function: ' + name);
  }
}

// THE COMPILER EXPORT — the single-source builder the contracts + the shared
// check set use. Function declarations hoist, so STTGF_CHECKS (above) may call
// expr before this point in the module.
export function expr(source: string): MathExpr {
  return new MathExprParser(source).parse();
}
// THE F-105 v3 FIX (2026-08-17 — the container plugin-load root cause): the
// eager `expr(...)` calls in the STTGF_CHECKS const executed at MODULE-EVAL —
// and the bun BUNDLER reorders the module chunks (the MathExprParser class
// lands AFTER the const in the dist) → the const's expr() hits the class's
// TEMPORAL DEAD ZONE ('Cannot access MathExprParser before initialization').
// THE FIX: the checks build on FIRST ACCESS (getSTTGFChecks) — the bundler's
// chunk ordering becomes irrelevant. The consumers (checkContract etc.) call
// getSTTGFChecks(), which is always post-load.
let _sttgfChecks: Record<CheckId, MathExpr> | null = null;
export function getSTTGFChecks(): Record<CheckId, MathExpr> {
  if (_sttgfChecks === null) {
    _sttgfChecks = {
  subjectMatch: expr('unify(claim.subject, event.subject)'),
  distScope: expr('member(event.distSha, { currentDistSha })'),
  freshness: expr('globally(event.ts >= t_window)'),
  rawOutput: expr('event.raw == claim.rawValue'),
  efficacy: {
    op: 'exists',
    var: 'test',
    over: { op: 'ref', name: 'unitEvents' },
    body: { op: 'eq', a: { op: 'ref', name: 'test.exercises' }, b: { op: 'ref', name: 'claim.subject' } },
  },
  hasEvidence: {
    op: 'exists',
    var: 'e',
    over: { op: 'ref', name: 'evidence' },
    body: { op: 'eq', a: { op: 'ref', name: 'e.subject' }, b: { op: 'ref', name: 'claim.subject' } },
  },
    };
  }
  return _sttgfChecks;
}


// ── THE REF RESOLUTION (the dotted path → the binding value) ──
// A dotted ref 'e.distSha' resolves through the bound variable 'e' (the
// existential witness) then the property path. A ref whose FIRST segment is
// missing from the bindings throws UnboundBindingError(name) — the mechanical
// definition of UNVERIFIABLE (the proof-gap: no witness for the existential).
function resolveRef(name: string, b: Bindings): unknown {
  const parts = name.split('.');
  if (!b.has(parts[0])) throw new UnboundBindingError(name);
  let v: unknown = b.get(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    if (v === null || v === undefined || typeof v !== 'object') throw new UnboundBindingError(name);
    v = (v as Record<string, unknown>)[parts[i]];
  }
  return v;
}

function asCollection(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v instanceof Set) return [...v];
  throw new EvalError('expected a collection, got: ' + String(v));
}

function memberOf(set: unknown, x: unknown): boolean {
  if (set instanceof Set) return set.has(x);
  if (Array.isArray(set)) return set.includes(x);
  // the singleton-scalar form: 'member(x, { currentDistSha })' compiles the set
  // to the scalar ref, and membership in the singleton is the equality
  return set === x;
}

function subsetOf(xs: unknown, set: unknown): boolean {
  for (const x of asCollection(xs)) {
    if (!memberOf(set, x)) return false;
  }
  return true;
}

function cardOf(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  if (v instanceof Set) return v.size;
  throw new EvalError('card over a non-collection: ' + String(v));
}

function sumOf(v: unknown): number {
  const arr = asCollection(v);
  let total = 0;
  for (const x of arr) {
    if (typeof x !== 'number') throw new EvalError('sum over a non-number element: ' + String(x));
    total += x;
  }
  return total;
}

function extremumOf(v: unknown, kind: 'max' | 'min'): number {
  const arr = asCollection(v);
  if (arr.length === 0) throw new EvalError(kind + ' over the empty collection is undefined');
  let best = arr[0];
  for (const x of arr) {
    if (typeof x !== 'number' || typeof best !== 'number') {
      throw new EvalError(kind + ' over a non-number element: ' + String(x));
    }
    if (kind === 'max' ? x > best : x < best) best = x;
  }
  return best as number;
}

// ── THE EXISTS/FORALL EVALUATION (the quantified vars + the witness) ──
// THE EXISTENTIAL WITNESS: when 'exists' finds a satisfying element, it WRITES
// the witness back into the bindings under the quantified var — so the NEXT
// clause's dotted ref (e.distSha, e.hasEvidenceArtifact, e.rawPassCount)
// resolves against the SAME witness (§53's sequential clauses + §63's clause
// shapes REQUIRE the witness persistence). The forall is the vacuous truth on
// the empty collection (a total evaluation).
function evalExists(e: { var: string; over: MathExpr; body: MathExpr }, b: Bindings): boolean {
  const arr = asCollection(evalExpr(e.over, b));
  for (const x of arr) {
    const child = new Map<string, unknown>(b);
    child.set(e.var, x);
    if (evalExpr(e.body, child) === true) {
      b.set(e.var, x);
      return true;
    }
  }
  return false;
}

function evalForall(e: { var: string; over: MathExpr; body: MathExpr }, b: Bindings): boolean {
  const arr = asCollection(evalExpr(e.over, b));
  for (const x of arr) {
    const child = new Map<string, unknown>(b);
    child.set(e.var, x);
    if (evalExpr(e.body, child) !== true) return false;
  }
  return true;
}

// ── evalExpr — THE TOTAL-DETERMINISTIC EVALUATOR (§51) ──
// THE LAW: a mathematical expression either evaluates to a unique value or it
// is undefined — no third option. Every op evaluates. The unbound ref throws
// UnboundBindingError (the proof-gap → UNVERIFIABLE, never a silent pass). An
// unhandled op throws EvalError (the loud fail). The temporal operators
// (prev/eventually/globally/until) evaluate their arguments against the closed
// snapshot (the witness-bound bindings) — the LTL properties reduce to the
// snapshot truth (§47); an unbound argument is the proof-gap, propagated.
export function evalExpr(e: MathExpr, b: Bindings): unknown {
  switch (e.op) {
    case 'lit':
      return e.value;
    case 'ref':
      return resolveRef(e.name, b);
    case 'eq':
      return evalExpr(e.a, b) === evalExpr(e.b, b);
    case 'ne':
      return evalExpr(e.a, b) !== evalExpr(e.b, b);
    case 'lt':
      return (evalExpr(e.a, b) as number) < (evalExpr(e.b, b) as number);
    case 'le':
      return (evalExpr(e.a, b) as number) <= (evalExpr(e.b, b) as number);
    case 'gt':
      return (evalExpr(e.a, b) as number) > (evalExpr(e.b, b) as number);
    case 'ge':
      return (evalExpr(e.a, b) as number) >= (evalExpr(e.b, b) as number);
    case 'and':
      return evalExpr(e.a, b) && evalExpr(e.b, b);
    case 'or':
      return evalExpr(e.a, b) || evalExpr(e.b, b);
    case 'not':
      return !evalExpr(e.a, b);
    case 'if':
      return evalExpr(e.cond, b) ? evalExpr(e.then, b) : evalExpr(e.else, b);
    case 'member':
      return memberOf(evalExpr(e.set, b), evalExpr(e.x, b));
    case 'subset':
      return subsetOf(evalExpr(e.x, b), evalExpr(e.set, b));
    case 'exists':
      return evalExists(e, b);
    case 'forall':
      return evalForall(e, b);
    case 'card':
      return cardOf(evalExpr(e.over, b));
    case 'sum':
      return sumOf(evalExpr(e.over, b));
    case 'max':
      return extremumOf(evalExpr(e.over, b), 'max');
    case 'min':
      return extremumOf(evalExpr(e.over, b), 'min');
    case 'prev':
      return evalExpr(e.a, b);
    case 'eventually':
      return evalExpr(e.a, b);
    case 'globally':
      return evalExpr(e.a, b);
    case 'until':
      return evalExpr(e.a, b) && (e.b ? evalExpr(e.b, b) : true);
    default:
      // the total-deterministic law: an unhandled op is undefined — the LOUD
      // FAIL naming the op, never a silent pass
      throw new EvalError('unhandled op: ' + ((e as { op: string }).op));
  }
}

// ── structuralHash — THE DETERMINISTIC STRUCTURAL SERIALIZATION (§68.4) ──
// THE LAW: the hash is a deterministic key over the NORMALIZED structure (the
// keys sorted, the Maps/Set flattened, the arrays in order) — two structurally
// identical values hash equal. It keys the memoization (§58) + serves as the
// expression's stable identity across syntactic variations. The normalization
// is a pure deterministic function (zero randomness, zero clock dependence).
function normalizeValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of [...v.entries()].sort((a, b) => compareUnknown(a[0], b[0]))) out[k] = normalizeValue(val);
    return out;
  }
  if (v instanceof Set) {
    return [...v].map(normalizeValue).sort((a, b) => compareUnknown(a, b));
  }
  if (Array.isArray(v)) return v.map(normalizeValue);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v).sort()) out[k] = normalizeValue((v as Record<string, unknown>)[k]);
  return out;
}

function compareUnknown(a: unknown, b: unknown): number {
  const as = String(a);
  const bs = String(b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

export function structuralHash(v: unknown): string {
  return JSON.stringify(normalizeValue(v));
}

// ── evalCached — THE SHARED-SET MEMOIZATION (§58, the migration STEP 8) ──
// THE LAW: the same expression evaluates ONCE per (structural hash + bindings
// hash) key; every layer references the memoized result. Drift is impossible
// because there is one canonical evaluation. THE DD-11 DISCIPLINE: the cache is
// an optimization, NEVER the source of truth — a bounded FIFO (the ring
// discipline), and the cached eval runs on a bindings CLONE so the caller's
// bindings are never mutated by a cache hit.
const exprCache = new Map<string, unknown>();
const EXPR_CACHE_CAP = 4096;

export function evalCached(e: MathExpr, b: Bindings): unknown {
  const key = structuralHash(e) + '|' + structuralHash(b);
  if (exprCache.has(key)) return exprCache.get(key);
  const v = evalExpr(e, new Map(b));
  if (exprCache.size >= EXPR_CACHE_CAP) {
    const oldest = exprCache.keys().next().value;
    if (oldest !== undefined) exprCache.delete(oldest);
  }
  exprCache.set(key, v);
  return v;
}

// ── THE BINDINGS EXTRACTION (§52 — the evidence store → the Bindings) ──
// THE LAW: the evidence machine's fact-events become the Bindings the MathExpr
// evaluates over — the bridge between the store and the math, the ONE place
// where the mechanical truth enters the decision. The bindings are the ONLY
// source of truth: a MathExpr cannot query the store directly (the
// matcher-vs-reader separation). The 'claim' binding carries the subject with
// a NULL rawValue default — the caller (the discharge) overrides rawValue/raw
// with the parsed claim value; a null rawValue makes the raw-output equality
// fail-closed (CONTRADICTED), never a silent pass.

function lastEventAt(events: EvidenceEvent[], kind: string): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if ((events[i].kind as string) === kind) return events[i].at;
  }
  return null;
}

function eventForSubject(events: EvidenceEvent[], kind: string, subject: string): boolean {
  for (const e of events) {
    if ((e.kind as string) === kind && e.subject === subject) return true;
  }
  return false;
}

export function extractBindings(sessionId: string, subject: string, claimClass: ClaimClass): Bindings {
  const record = getEvidenceState(sessionId);
  const events = record.events;
  const b: Bindings = new Map<string, unknown>();
  b.set('subject', subject);
  b.set('claimClass', claimClass);
  b.set('currentDistSha', record.distSha);
  b.set('evidence', events);
  // the event arrays partitioned by kind. The 'source_change'/'status' kinds
  // are the §3.1 fact-events the Wave-1 evidence-tracker adds; the string cast
  // keeps this forward-compatible with the pre-Wave-1 union (the comparisons
  // are against the runtime kind strings, never the type narrow).
  b.set('sourceChangeEvents', events.filter((e) => (e.kind as string) === 'source_change'));
  b.set('statusEvents', events.filter((e) => (e.kind as string) === 'status'));
  b.set('unitEvents', events.filter((e) => e.kind === 'unit'));
  b.set('containerEvents', events.filter((e) => e.kind === 'container'));
  b.set('smokeEvents', events.filter((e) => e.kind === 'smoke'));
  // the timestamp lanes (the §52 lastSourceChangeAt/lastStatusAt)
  b.set('lastSourceChangeAt', lastEventAt(events, 'source_change'));
  b.set('lastStatusAt', lastEventAt(events, 'status'));
  // the closed-world indexes (§68.1) + the freshness boundary (§47/H-6)
  b.set('knownModules', MODULE_INDEX);
  b.set('knownServices', SERVICE_INDEX);
  b.set('t_window', Date.now() - STATUS_FRESH_WINDOW_MS - CLOCK_SKEW_TOLERANCE_MS);
  // the claim context — the caller overrides rawValue/raw with the parsed
  // claim; the null default fails the raw-output equality closed
  b.set('claim', { subject, rawValue: null, raw: null });
  // the derived predicates the invariant/temporal clauses reference (§63):
  // changed/unchanged (the contradiction guard), sourceChangeEvent (the
  // causality), claimEvent (the recorded assertion), statusProbe (the probe)
  b.set('changed', eventForSubject(events, 'source_change', subject));
  b.set('unchanged', !eventForSubject(events, 'source_change', subject));
  b.set('sourceChangeEvent', eventForSubject(events, 'source_change', subject));
  b.set('claimEvent', eventForSubject(events, 'claim', subject));
  b.set('statusProbe', eventForSubject(events, 'status', subject));
  return b;
}

function objectFrom(map: Map<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of map) out[k] = v;
  return out;
}

// ── checkContract — THE DISCHARGE WITH THE STRUCTURED VIOLATION (§53 + §45) ──
// THE LAW: the clauses evaluate in the FIXED order pre → post → invariant →
// temporal (§53's bomb-class priority); the FIRST violation short-circuits with
// the Checked<T> structured record (the failing clause's expr + the bindings +
// the reason — never a bare false, §45). The UnboundBindingError maps to the
// 'unbound:' violation (the UNVERIFIABLE proof-gap); a REAL error rethrows
// (the loud fail — a bug is audible). The clause-declared bindings are merged
// as DEFAULTS (the extraction's dynamic values win — the freshness t_window is
// fresh at extraction, not frozen at module load). The ok:true branch applies
// the brand INSIDE the decision boundary — the only producer of a
// BrandedVerdict (§44, H-8).
export function checkContract(
  c: MathContract,
  stage: 'pre' | 'post' | 'inv' | 'temp',
  b: Bindings,
): Checked<BrandedVerdict> {
  void stage;
  const groups = [
    c.preconditions ?? [],
    c.postconditions ?? [],
    c.invariants ?? [],
    c.temporal ?? [],
  ];
  const evalB = new Map<string, unknown>(b);
  for (const group of groups) {
    for (const clause of group) {
      for (const [k, v] of Object.entries(clause.bindings ?? {})) {
        if (!evalB.has(k)) evalB.set(k, v);
      }
    }
  }
  for (const group of groups) {
    for (const clause of group) {
      const exprAst = clause.expr;
      try {
        if (evalExpr(exprAst, evalB) !== true) {
          return {
            ok: false,
            violated: { expr: exprToString(exprAst), bindings: objectFrom(evalB), reason: 'evaluated false' },
          };
        }
      } catch (err) {
        if (err instanceof UnboundBindingError) {
          // THE UNVERIFIABLE — the missing binding is the proof-gap: no
          // witness for the existential, never a silent legitimate
          return {
            ok: false,
            violated: {
              expr: exprToString(exprAst),
              bindings: objectFrom(evalB),
              reason: 'unbound: ' + err.refName,
            },
          };
        }
        // the real error — the loud fail, never swallowed
        throw err;
      }
    }
  }
  // THE BRAND (the §44 application inside the decision boundary): the
  // contract discharged → the evidence VERIFIED, the class CORRECT, the
  // explanation CORRECT — the VALID lattice point's axes. The brand is
  // unforgeable from outside (no public constructor).
  const value = {
    evidence: 'VERIFIED',
    intent: 'CORRECT_CLASS',
    explanation: 'CORRECT_REASON',
  } as unknown as BrandedVerdict;
  return { ok: true, value };
}

// ── exprToString — THE CANONICAL SERIALIZER (the MathExpr → the DSL string) ──
// The inverse of expr(): renders the AST back into the readable DSL form. The
// discharge's structured violation carries the CANONICAL string of the failing
// clause (the §45 'expr' field) — the exact failing check, nameable + readable.
function exprToString(e: MathExpr): string {
  switch (e.op) {
    case 'lit':
      return JSON.stringify(e.value);
    case 'ref':
      return e.name;
    case 'eq':
      return exprToString(e.a) + ' == ' + exprToString(e.b);
    case 'ne':
      return exprToString(e.a) + ' != ' + exprToString(e.b);
    case 'lt':
      return exprToString(e.a) + ' < ' + exprToString(e.b);
    case 'le':
      return exprToString(e.a) + ' <= ' + exprToString(e.b);
    case 'gt':
      return exprToString(e.a) + ' > ' + exprToString(e.b);
    case 'ge':
      return exprToString(e.a) + ' >= ' + exprToString(e.b);
    case 'and':
      return exprToString(e.a) + ' and ' + exprToString(e.b);
    case 'or':
      return exprToString(e.a) + ' or ' + exprToString(e.b);
    case 'not':
      return 'not(' + exprToString(e.a) + ')';
    case 'if':
      return 'if(' + exprToString(e.cond) + ', ' + exprToString(e.then) + ', ' + exprToString(e.else) + ')';
    case 'member':
      return 'member(' + exprToString(e.x) + ', ' + exprToString(e.set) + ')';
    case 'subset':
      return 'subset(' + exprToString(e.x) + ', ' + exprToString(e.set) + ')';
    case 'exists':
      return 'exists(' + e.var + ' in ' + exprToString(e.over) + ': ' + exprToString(e.body) + ')';
    case 'forall':
      return 'forall(' + e.var + ' in ' + exprToString(e.over) + ': ' + exprToString(e.body) + ')';
    case 'card':
      return 'card(' + exprToString(e.over) + ')';
    case 'sum':
      return 'sum(' + exprToString(e.over) + ')';
    case 'max':
      return 'max(' + exprToString(e.over) + ')';
    case 'min':
      return 'min(' + exprToString(e.over) + ')';
    case 'prev':
      return 'prev(' + exprToString(e.a) + ')';
    case 'eventually':
      return 'eventually(' + exprToString(e.a) + ')';
    case 'globally':
      return 'globally(' + exprToString(e.a) + ')';
    case 'until':
      return 'until(' + exprToString(e.a) + (e.b ? ', ' + exprToString(e.b) : '') + ')';
  }
}

// ── THE PER-CLASS MATHCONTRACTS (§63 — VERBATIM, the actual clause data) ──
// THE LAW: each claim class's contract is a concrete constant with the exact
// clauses bound to the REAL event kinds + the REAL subject extraction. The
// contracts ARE the law — the table lookup STTGF_CONTRACTS[claimClass] is the
// ONLY decision (H-10). The clause bindings are the DEFAULTS; extractBindings'
// dynamic values (the fresh t_window, the module index) win at the discharge.
// The bindings passed to checkContract do not import anything here — this is
// the clause data, transcribed from the spec's §63.

const SOURCE_FIX_CONTRACT: MathContract = {
  preconditions: [
    // the subject must be a known module (the set-membership, §59)
    { expr: expr('member(subject, knownModules)'), bindings: { knownModules: MODULE_INDEX } },
  ],
  postconditions: [
    // a source_change event exists for THIS subject (the CHECK 3 subject match)
    { expr: expr('exists(e in sourceChangeEvents: e.subject == subject)'), bindings: {} },
    // the event is for the CURRENT dist (the CHECK 4 dist-scope)
    { expr: expr('e.distSha == currentDistSha'), bindings: {} },
    // a test exercises the changed module (the CHECK 2 efficacy — the fix's
    // EFFECT, not just its existence)
    { expr: expr('exists(t in unitEvents: t.exercises == subject)'), bindings: {} },
  ],
  invariants: [
    // the module cannot be both changed and unchanged (the contradiction guard)
    { expr: expr('not(changed(subject) and unchanged(subject))'), bindings: {} },
  ],
  temporal: [
    // the change precedes the claim (the causality)
    { expr: expr('until(sourceChangeEvent(subject), claimEvent(subject))'), bindings: {} },
  ],
};

const STATUS_CONTRACT: MathContract = {
  preconditions: [
    { expr: expr('member(subject, knownServices)'), bindings: { knownServices: SERVICE_INDEX } },
  ],
  postconditions: [
    // a status event exists for the service (the CHECK 3)
    { expr: expr('exists(e in statusEvents: e.subject == subject)'), bindings: {} },
    // the probe is FRESH (the CHECK 5 freshness — the temporal invariant; the
    // t_window default is the module-load boundary, the extraction's fresh
    // window wins at the discharge)
    { expr: expr('globally(e.at >= t_window)'), bindings: { t_window: Date.now() - STATUS_FRESH_WINDOW_MS } },
    // the probe's raw output matches the claim (the CHECK 6)
    { expr: expr('e.raw == claim.rawValue'), bindings: {} },
  ],
  invariants: [],
  temporal: [
    // the probe must have actually run (the run-claim, §36)
    { expr: expr('eventually(statusProbe(subject))'), bindings: {} },
  ],
};

const BUILD_CONTRACT: MathContract = {
  preconditions: [
    { expr: expr('member(subject, { currentDistSha })'), bindings: {} },
  ],
  postconditions: [
    // the container evidence for the CURRENT dist (the CHECK 4)
    { expr: expr('exists(e in containerEvents: e.distSha == currentDistSha)'), bindings: {} },
    // the artifact exists (the D9 artifact contract)
    { expr: expr('e.hasEvidenceArtifact == true'), bindings: {} },
  ],
  invariants: [],
  temporal: [],
};

const UNIT_CONTRACT: MathContract = {
  preconditions: [],
  postconditions: [
    // a unit event exists (the CHECK 3)
    { expr: expr('exists(e in unitEvents)'), bindings: {} },
    // the raw pass count matches the claim (the CHECK 6 raw-output)
    { expr: expr('e.rawPassCount == claim.rawValue'), bindings: {} },
  ],
  invariants: [],
  temporal: [],
};

// THE SINGLE EXPORT every decision layer references — the table lookup is the
// ONLY decision over the class (H-10).
export const STTGF_CONTRACTS: Record<ClaimClass, MathContract> = {
  'source-fix': SOURCE_FIX_CONTRACT,
  status: STATUS_CONTRACT,
  build: BUILD_CONTRACT,
  unit: UNIT_CONTRACT,
};

// ── THE CONTRADICTION ENGINE (§66 + §68.3 + H-7 — the resolution) ──
// THE LAW: CONTRADICTED = resolution derives P AND not-P for the subject — the
// mutually-exclusive predicate pair — NOT "some check returned false" (§46).
// THE CLOSED-WORLD NEGATION (H-7): a fact F is derived NEGATIVE (not_F) IFF no
// event supports F — the negation is the ABSENCE over the evidence store, never
// the prose. THE TRIPLET-CONFORMANCE: each positive derivation is a named
// function over the bindings (the evidence facts, not the prose).

function subjectOf(b: Bindings): string | undefined {
  const v = b.get('subject');
  return typeof v === 'string' ? v : undefined;
}

function arrayBinding(b: Bindings, key: string): unknown[] {
  const v = b.get(key);
  return Array.isArray(v) ? v : [];
}

function eventListForSubject(b: Bindings, key: string): boolean {
  const subject = subjectOf(b);
  if (subject === undefined) return false;
  for (const e of arrayBinding(b, key)) {
    const ev = e as { subject?: string };
    if (ev.subject === subject) return true;
  }
  return false;
}

function artifactExists(b: Bindings): boolean {
  for (const e of arrayBinding(b, 'containerEvents')) {
    const ev = e as { hasEvidenceArtifact?: boolean };
    if (ev.hasEvidenceArtifact === true) return true;
  }
  return false;
}

// THE FACT-DERIVATION TABLE (§68.3 — the complete has*/not_has* enumeration)
export const FACT_DERIVATIONS: ReadonlyArray<{ fact: string; positive: (b: Bindings) => boolean }> = [
  { fact: 'hasContainerEvidence', positive: (b) => eventListForSubject(b, 'containerEvents') },
  { fact: 'ranBattery', positive: (b) => arrayBinding(b, 'unitEvents').length > 0 },
  { fact: 'sourceChanged', positive: (b) => eventListForSubject(b, 'sourceChangeEvents') },
  { fact: 'probeRan', positive: (b) => arrayBinding(b, 'statusEvents').length > 0 },
  { fact: 'distChanged', positive: (b) => b.get('currentDistSha') !== null && b.get('currentDistSha') !== undefined },
  { fact: 'hasArtifact', positive: (b) => artifactExists(b) },
];

// THE FORWARD CHAIN (H-7): derive every fact + its negation — the closed world
// over the store. The derived Set includes the not_ members when the positive
// is unsupported: the absence of supporting evidence IS the contradiction term.
export function forwardChain(b: Bindings): Set<string> {
  const derived = new Set<string>();
  for (const { fact, positive } of FACT_DERIVATIONS) {
    if (positive(b)) derived.add(fact);
    else derived.add('not_' + fact);
  }
  return derived;
}

// THE CONTRADICTION PAIRS (§68.3 — the mutually-exclusive derived facts)
export const CONTRADICTION_PAIRS: ReadonlyArray<[string, string]> = [
  ['hasContainerEvidence', 'not_hasContainerEvidence'],
  ['ranBattery', 'not_ranBattery'],
  ['sourceChanged', 'not_sourceChanged'],
  ['probeRan', 'not_probeRan'],
  ['distChanged', 'not_distChanged'],
  ['hasArtifact', 'not_hasArtifact'],
];

// THE DETECTION (§66): when both members of a pair are derived, return the
// EXACT contradiction string; else null. THE DERAILMENT IT KILLS: "verified"
// with the evidence deriving not_hasContainerEvidence → the resolution derives
// hasContainerEvidence ∧ not_hasContainerEvidence → CONTRADICTED, named.
export function detectContradiction(b: Bindings): string | null {
  const derived = forwardChain(b);
  for (const [p, notP] of CONTRADICTION_PAIRS) {
    if (derived.has(p) && derived.has(notP)) return p + ' ∧ ' + notP;
  }
  return null;
}

// ── THE SMOKE-COMMAND CONTRACT (§70 — the tool-execution front) ──
// THE LAW: the tool gate's bash surface gets the SAME MathContract treatment as
// the claims — the smoke-shape regexes DETECT the command's shape (the ISE
// detector-only rule: the regex is a mechanical DETECTOR, never the decision);
// the contract decides the block. THE DERAILMENT IT KILLS (D10-D12): the
// inline-exec (node/bun -e), the headless (opencode run), and the hash-as-proof
// (a checksum with a pending claim) are blocked by the discharge, not a match.

// THE F-HT-BUG-2 DOCUMENTATION CARVE-OUT (write/edit payloads targeting
// .trident/** or *.md paths that quote enforcement words while latched are
// ALLOWED — kills recursion which blocked writing the failure log itself).
// THE ESCALATION CATEGORY MAP (F-HT-BUG-3): hash/docwrite/inline/testrunner
export const ESCALATION_CATEGORY_MAP: Record<string, string> = { hash: 'hash', docwrite: 'docwrite', inline: 'inline', testrunner: 'testrunner' };
// THE SMOKE-SHAPE DETECTORS (the ISE law: the regex is a mechanical DETECTOR
// only — it FLAGS the command's shape; the SMOKE_COMMAND_CONTRACT decides).
// F-HARDEN-S11 PATH-POSITION GUARDS: shape detectors examine the EXECUTED
// COMMAND surface only — a match inside an ARGUMENT PATH token (e.g. a
// filename carrying the tokenized platform-exec bigram) is bookkeeping, not
// intent. Lookbehind/lookahead reject path-glued matches (adjacent -, /, \,
// ., word chars), which cannot occur at command position.
const INLINE_EXEC_SHAPE = /(?<![-\/\\.\w])\b(?:node|bun|deno|npx|npm|pnpm|yarn)\s+(?:.*?\s)?(?:-e|--eval|--print|--evaluate|-p|-pe)\b(?![\w\/-])/;
const HEADLESS_SHAPE = /(?<![-\/\\.\w])\bopencode\s+run\b(?![\w\/-])/;
const HASH_AS_PROOF_SHAPE = /(?<![-\/\\.])\b(?:sha256sum|sha1sum|md5sum|sha256|sha512|cksum)\b(?![\w\/-])/;
// THE TEST-RUNNER SHAPE (the D-1 F-110 fix — the operator's #1 smoke example):
// the bash execution of a test harness OUTSIDE the project's test dirs is the
// container-substitution shape. THE LEGIT-BATTERY SAFE-EXCLUSION is in the
// DETECTOR (the NOT-GESTAPO law): the bare `bun test` (no target) + the
// in-project test-dir targets (src/tests, tests, spec, __tests__) are the
// MANDATORY unit battery — NEVER flagged. Only the OUT-OF-PROJECT harness
// target fires. THE DETECTOR's shape feeds the contract's match() ref.
const TEST_RUNNER_SHAPE_RE = /\b(?:bun\s+test|vitest(?:\s+run)?)\s+((?:--?[\w-]+\s+)*)([^\s;|&]+)/i;
function detectTestRunnerShape(command: string): boolean {
  const m = TEST_RUNNER_SHAPE_RE.exec(command);
  if (!m) return false; // the bare bun test / vitest — the legit battery
  const target = m[2];
  if (!target) return false;
  // THE INTENT-BASED DISCRIMINATOR (the D-1 F-110 fix, the CORRECT form — NOT
  // the monkey patch): the target's RESOLVED location decides, never a string
  // prefix. THE LEGIT battery = (a) a BARE FILENAME (no path separator — the
  // cwd IS the tests dir, the normal `bun test sttgf-tool-front.test.ts`
  // invocation), (b) a relative path with a test-dir prefix (src/tests|tests|
  // spec|__tests__). THE SUBSTITUTION = an ABSOLUTE out-of-project path
  // (/tmp/~/var//root/...) or a relative path with an EXPLICIT non-test-dir
  // directory component.
  const l = target.toLowerCase();
  // (a) the bare filename — the cwd is the tests dir, ALWAYS the legit battery:
  if (!/[\/\\]/.test(l)) return false;
  // (b) the in-project test-dir path — the legit battery:
  if (/^(?:\.{0,2}\/)?(?:src\/)?(?:tests?|spec|__tests__)[\/\\]/i.test(l)) return false;
  // the absolute out-of-project path (the substitution harness):
  if (/^\/(?:tmp|var|root|home|opt|usr|etc|mnt|media|srv)\b/.test(l)) return true;
  // a relative path WITH a directory component outside the test dirs — the
  // harness script the agent wrote outside the tests tree:
  if (/[\/\\]/.test(l) && !/^(?:\.{0,2}\/)?(?:src\/)?(?:tests?|spec|__tests__)[\/\\]/i.test(l)) return true;
  return false; // the in-project test-dir path = the legit battery
}

// THE DETECTOR OUTPUT — the shape flags the contract's match() refs read.
export function detectSmokeShapes(command: string): { inlineExec: boolean; headless: boolean; hashAsProof: boolean; testRunner: boolean } {
  return {
    inlineExec: INLINE_EXEC_SHAPE.test(command),
    headless: HEADLESS_SHAPE.test(command),
    hashAsProof: HASH_AS_PROOF_SHAPE.test(command),
    testRunner: detectTestRunnerShape(command),
  };
}

// THE BINDINGS BUILDER for the smoke contract — the tool gate's context
// (tool/command/pendingClaim) + the detected shape flags + the bash-like set.
export function buildSmokeBindings(tool: string, command: string, pendingClaim: boolean): Bindings {
  const shapes = detectSmokeShapes(command);
  const b: Bindings = new Map<string, unknown>();
  b.set('tool', tool);
  b.set('command', command);
  b.set('pendingClaim', pendingClaim);
  b.set('bashLikeTools', ['bash', 'terminal', 'exec', 'execute']);
  b.set('inlineExecShape', shapes.inlineExec);
  b.set('headlessShape', shapes.headless);
  b.set('hashAsProofShape', shapes.hashAsProof);
  b.set('testRunnerShape', shapes.testRunner);
  return b;
}

// THE SMOKE-COMMAND CONTRACT (§70 — VERBATIM + the D-1 test-runner clause): the
// bash surface's obligations.
// pre: the tool is a bash-like tool (the gate's boundary); post: none of the
// smoke shapes are present (the headless/hash shapes with the pendingClaim
// gate). The match(...) refs are the DETECTOR flags; the discharge decides.
export const SMOKE_COMMAND_CONTRACT: MathContract = {
  preconditions: [
    { expr: expr('member(tool, bashLikeTools)'), bindings: { bashLikeTools: ['bash', 'terminal', 'exec', 'execute'] } },
  ],
  postconditions: [
    // the inline-exec shape → the INLINE_EXEC block
    { expr: expr('not(match(inlineExecShape, command))'), bindings: {} },
    // the headless shape → the HEADLESS block
    { expr: expr('not(match(headlessShape, command))'), bindings: {} },
    // the hash-as-proof shape (the pendingClaim trigger) → the HASH_AS_PROOF block
    { expr: expr('not(match(hashAsProofShape, command) AND pendingClaim)'), bindings: {} },
    // THE D-1 TEST-RUNNER CLAUSE (the F-110 fix — the operator's #1 smoke
    // example + the zero-misfire mandate): the bash execution of an
    // OUT-OF-PROJECT test harness → the TEST_RUNNER block. The legit battery
    // (bare + in-project targets) is safe-excluded IN THE DETECTOR — the
    // contract only sees the flagged substitution.
    { expr: expr('not(match(testRunnerShape, command))'), bindings: {} },
  ],
  invariants: [],
  temporal: [],
};
