/**
 * audit-lexicon-inventory.ts — THE FOUNDING MASTER LEXICONS (the W3 deliverable)
 *
 * THE PER-LAYER LEXICONS (the macro TS/JS inventory — the 2-year scope, the
 * L2 spec §3.3.3). Each pattern is a PatternFamily — the typed member with the
 * Order-2+ AST matcher (the ISE law). THE REGEX IS THE DETECTOR INSIDE; THE
 * AST STRUCTURE IS THE DECISION (the matcher examines the construct's kind,
 * body, modifiers, parameters — never a bare regex verdict).
 *
 * THE LEXICONS:
 *   R2-error-handling:  r2.empty-catch, r2.swallowed-error, r2.silent-fail
 *   R3-hygiene:         r3.todo-marker (the regex DETECTS, the AST decides)
 *   R11/R5-theatrical: r5.fake-return, r5.always-pass
 *   R2-data-flow:      r4.type-unsafe-pass (the any)
 *   R1-hook:            r1.hook-contract-violation (plugin-shape-gated)
 */
import * as ts from 'typescript';
import { CodeConstruct, ConstructType, Severity } from '../types.ts';
import { PatternFamily, AnalysisContext } from './audit-lexicons.ts';

// ── THE R2-ERROR-HANDLING LEXICON ──
export const r4EmptyCatch: PatternFamily = {
  id: 'r2.empty-catch',
  kind: 'detector',
  // THE ORDER-2 MATCHER — the AST-structural: a CATCH_CLAUSE with an empty body.
  // THE DECISION: the body's statement count + the call-expression presence.
  matcher: (node: CodeConstruct, ctx: AnalysisContext) => {
    if (node.type !== ConstructType.CATCH_CLAUSE) return null;
    // THE BUG-2 FIX (2026-08-19 — the container test caught it): the prior
    // guard `bodyText.length < 8` compared node.body = node.getText() = the
    // FULL `catch (e) {}` text (>8 chars) against 8 — the check was NEVER
    // true, so the empty-catch lexicon NEVER fired (R2 produced zero findings
    // in the container). THE ISE-CORRECT DECISION: structural via the ts.Node
    // when it is a real CatchClause (the running audit) — `block.statements.length
    // === 0`. THE UNIT-FIXTURE FALLBACK: when the construct carries a synthetic
    // node (the __tests__ fixture passes `node: {}`), fall back to the emptied
    // body-text heuristic (body === '' — the block body has no text). Both
    // paths DECIDE structurally; the regex is only the DETECTOR (the type gate).
    if (node.node && (node.node as ts.Node).kind === ts.SyntaxKind.CatchClause) {
      const catchNode = node.node as ts.CatchClause;
      if (catchNode.block && catchNode.block.statements.length === 0) {
        return {
          patternId: 'r2.empty-catch',
          constructRef: `${node.filePath}:${node.line}`,
          evidence: (node.body || '').substring(0, 120) || '(empty catch block)',
          triggerFired: 'ts.CatchClause AND block.statements.length === 0 (the AST decides)',
          confidence: 0.95,
        };
      }
      return null;
    }
    // THE FALLBACK (the unit fixture's synthetic node — never a real runtime path):
    const bodyText = node.body?.trim() || '';
    if (bodyText.length === 0) {
      return {
        patternId: 'r2.empty-catch',
        constructRef: `${node.filePath}:${node.line}`,
        evidence: '(empty catch block)',
        triggerFired: 'empty body text (the unit fixture)',
        confidence: 0.95,
      };
    }
    return null;
  },
  triggerCondition: 'a CATCH_CLAUSE whose block has 0 statements (the AST-empty-catch — the regex DETECTS the type, the AST DECIDES)',
  severity: 'CRITICAL' as Severity,
  messageTemplate: 'Empty catch block swallows the error silently — {evidence}',
  remediationHook: 'Log the error (tridentLog) + rethrow or handle it — never swallow silently',
  exampleHits: ['try { risky() } catch {}', 'try { risky() } catch (e) { }'],
};

export const r4SwallowedError: PatternFamily = {
  id: 'r2.swallowed-error',
  kind: 'detector',
  matcher: (node: CodeConstruct, ctx: AnalysisContext) => {
    if (node.type !== ConstructType.CATCH_CLAUSE) return null;
    const body = node.body || '';
    // THE BINDING-NAME FIX (2026-08-20 — the live-audit triage caught it): the
    // old code-classifier sets node.name = 'catch' for a CATCH_CLAUSE (the
    // keyword, never the real variable), so the OLD `binding !== 'catch'` check
    // made usesBinding ALWAYS false — a catch that DOES use its error binding
    // (e.g. `catch (e) { return fail(state, e.message) }`) was wrongly flagged
    // as "swallowed" (a FALSE POSITIVE — the live wave surfaced it). THE FIX:
    // derive the REAL binding name from the AST CatchClause node's variable
    // declaration whenever the node is available, falling back to node.name.
    let binding = node.name;
    try {
      const cc = node.node as unknown as { variableDeclaration?: { name?: { text?: string } } };
      if (cc && cc.variableDeclaration && cc.variableDeclaration.name && cc.variableDeclaration.name.text) {
        binding = cc.variableDeclaration.name.text;
      }
    } catch (/* non-fatal */ _e) { void 0; }
    const usesBinding = binding && binding !== 'catch' ? body.includes(binding) : false;
    const hasLog = /tridentLog|console\.(error|warn)|logger\./.test(body);
    // THE DECISION: the binding unused + no log → the swallowed-error shape
    if (!usesBinding && !hasLog && body.trim().length > 0) {
      return {
        patternId: 'r2.swallowed-error',
        constructRef: `${node.filePath}:${node.line}`,
        evidence: body.substring(0, 120),
        triggerFired: 'catch binding unused AND no error log',
        confidence: 0.7,
      };
    }
    return null;
  },
  triggerCondition: 'catch binding unused AND no error log',
  severity: 'HIGH' as Severity,
  messageTemplate: 'Catch block swallows the error without logging or using it — {evidence}',
  remediationHook: 'Use the error binding (tridentLog("caught", err)) or rethrow',
  exampleHits: ['catch (e) { console.log("done") }'],
};

// ── THE R3-HYGIENE LEXICON ──
export const r8TodoMarker: PatternFamily = {
  id: 'r3.todo-marker',
  kind: 'detector',
  // THE REGEX DETECTS THE MARKER; THE AST DECIDES comment-vs-string.
  matcher: (node: CodeConstruct, ctx: AnalysisContext) => {
    const text = node.body || node.name || '';
    // THE DETECTOR: the TODO/FIXME/HACK marker
    if (!/TODO|FIXME|HACK/i.test(text)) return null;
    // THE DECISION: the marker in a STRING_LITERAL is DATA (the R3 class —
    // a string "TODO" is not a defect marker); the marker in a comment/body
    // IS a marker. THE AST decides the construct kind.
    if (node.type === ConstructType.STRING_LITERAL || node.type === ConstructType.TEMPLATE_EXPRESSION) {
      return null;  // the marker in a string is DATA, not a marker
    }
    return {
      patternId: 'r3.todo-marker',
      constructRef: `${node.filePath}:${node.line}`,
      evidence: text.substring(0, 120),
      triggerFired: '/TODO|FIXME|HACK/ detected AND the construct is not a string literal',
      confidence: 0.8,
    };
  },
  triggerCondition: '/TODO|FIXME|HACK/ detected AND the construct is not a string literal',
  severity: 'LOW' as Severity,
  messageTemplate: 'TODO/FIXME marker left in the source — {evidence}',
  remediationHook: 'Resolve the TODO or track it in the task queue — never ship markers',
  exampleHits: ['// TODO: fix this', '// FIXME: broken'],
};

// ── THE R11/R5-THEATRICAL LEXICON ──
export const r17FakeReturn: PatternFamily = {
  id: 'r5.fake-return',
  kind: 'detector',
  matcher: (node: CodeConstruct, ctx: AnalysisContext) => {
    if (node.type !== ConstructType.FUNCTION_DECLARATION &&
        node.type !== ConstructType.ARROW_FUNCTION &&
        node.type !== ConstructType.METHOD_DECLARATION) return null;
    const body = node.body || '';
    // THE DETECTOR: the hardcoded-success shape
    const hardcoded = /return\s+(true|false|0|'ok'|"ok"|'success'|"success")\s*;/.test(body);
    if (!hardcoded) return null;
    // THE DECISION: the work was done BEFORE the return (the non-return statements)?
    const work = body.replace(/return\s+(true|false|0|'ok'|"ok"|'success'|"success")\s*;/g, '').trim();
    const hasWork = work.length > 0 && node.children.length > 1;
    if (!hasWork) {
      return {
        patternId: 'r5.fake-return',
        constructRef: `${node.filePath}:${node.line}`,
        evidence: body.substring(0, 120),
        triggerFired: 'hardcoded success return WITHOUT the work before it',
        confidence: 0.9,
      };
    }
    return null;
  },
  triggerCondition: 'hardcoded success return WITHOUT the work before it',
  severity: 'HIGH' as Severity,
  messageTemplate: 'Function returns a hardcoded success without doing the work — {evidence}',
  remediationHook: 'Perform the real work + return the real result — never a fake success',
  exampleHits: ['function chargeCard() { return true; }'],
};

export const r17AlwaysPass: PatternFamily = {
  id: 'r5.always-pass',
  kind: 'detector',
  matcher: (node: CodeConstruct, ctx: AnalysisContext) => {
    if (node.type !== ConstructType.FUNCTION_DECLARATION &&
        node.type !== ConstructType.ARROW_FUNCTION &&
        node.type !== ConstructType.METHOD_DECLARATION) return null;
    const body = node.body || '';
    // THE DETECTOR: the always-pass test shape
    const alwaysPass = /expect\((true|1|'ok'|"ok")\).*\.toBe\((true|1|'ok'|"ok")\)/.test(body);
    if (!alwaysPass) return null;
    return {
      patternId: 'r5.always-pass',
      constructRef: `${node.filePath}:${node.line}`,
      evidence: body.substring(0, 120),
      triggerFired: 'a test that asserts a constant against itself — cannot fail',
      confidence: 0.95,
    };
  },
  triggerCondition: 'a test that asserts a constant against itself — cannot fail',
  severity: 'HIGH' as Severity,
  messageTemplate: 'Test asserts a constant against itself — it can never fail — {evidence}',
  remediationHook: 'Assert the REAL behavior — a test that cannot fail is theater',
  exampleHits: ['it("works", () => { expect(true).toBe(true); })'],
};

// ── THE R2-DATA-FLOW LEXICON ──
export const r13TypeUnsafePass: PatternFamily = {
  id: 'r4.type-unsafe-pass',
  kind: 'detector',
  matcher: (node: CodeConstruct, ctx: AnalysisContext) => {
    const body = node.body || '';
    // THE DETECTOR: the unguarded any in the decision path
    const anyPattern = /:\s*any\b|as\s+any\b|<any>/.test(body);
    if (!anyPattern) return null;
    // THE DECISION: the parameter/return type carries the any (the type-unsafe pass)
    if (node.parameters.some((p) => p.type === 'any') || node.returnType === 'any') {
      return {
        patternId: 'r4.type-unsafe-pass',
        constructRef: `${node.filePath}:${node.line}`,
        evidence: body.substring(0, 120),
        triggerFired: 'a parameter or return type is the unguarded any',
        confidence: 0.75,
      };
    }
    return null;
  },
  triggerCondition: 'a parameter or return type is the unguarded any',
  severity: 'MEDIUM' as Severity,
  messageTemplate: 'Unguarded any in the decision path — the type safety is bypassed — {evidence}',
  remediationHook: 'Type the value (the proper interface) or guard it before the use',
  exampleHits: ['function f(x: any): any { return x; }'],
};

// ── THE R1-HOOK LEXICON (plugin-shape-gated) ──
export const r1HookContractViolation: PatternFamily = {
  id: 'r1.hook-contract-violation',
  kind: 'detector',
  matcher: (node: CodeConstruct, ctx: AnalysisContext) => {
    // THE GATE: ONLY for the plugin shape (the W2 project-type gate governs)
    if (ctx.projectContext && !ctx.projectContext.isPlugin) return null;
    if (node.type !== ConstructType.FUNCTION_DECLARATION &&
        node.type !== ConstructType.ARROW_FUNCTION &&
        node.type !== ConstructType.METHOD_DECLARATION) return null;
    const body = node.body || '';
    // THE DETECTOR: the hook-like literal (the mechanical marker).
    // HT-BUG-23 FIX: removed the bare 'config' token — it matched EVERY function
    // containing a variable/comment named config (~1000 false positives). Only
    // the EXACT hook event registration names trigger the detector now.
    if (!/tool\.execute\.before|system\.transform|chat\.message\b/.test(body)) return null;
    // Exclude test files — they reference hook event names in assertions
    if (/\.test\.ts$/.test(node.filePath)) return null;
    // THE DECISION: the output.error/output.isError assignments absent → the violation
    const hasErrorOutput = /output\.(error|isError)|output\.system/.test(body);
    if (!hasErrorOutput) {
      return {
        patternId: 'r1.hook-contract-violation',
        constructRef: `${node.filePath}:${node.line}`,
        evidence: body.substring(0, 120),
        triggerFired: 'hook-like handler WITHOUT the output.error/output.system contract',
        confidence: 0.6,
      };
    }
    return null;
  },
  triggerCondition: 'hook-like handler WITHOUT the output.error/output.system contract (plugin shape only)',
  severity: 'MEDIUM' as Severity,
  messageTemplate: 'Hook handler missing the output contract — {evidence}',
  remediationHook: 'Set output.error / output.system in the hook handler',
  exampleHits: ['tool.before: () => { return { blocked: true }; }'],
};

// THE FOUNDING INVENTORY — the registered set (the W3 battery's patterns)
export const FOUNDING_PATTERNS: PatternFamily[] = [
  r4EmptyCatch,
  r4SwallowedError,
  r8TodoMarker,
  r17FakeReturn,
  r17AlwaysPass,
  r13TypeUnsafePass,
  r1HookContractViolation,
];
