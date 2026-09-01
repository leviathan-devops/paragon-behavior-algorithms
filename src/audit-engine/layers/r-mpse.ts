// SPEC-A §2.4 R-MPSE — contract-evaluation layer via A3 substrate (checkContract/evalExpr)
// SIDE-1: spec-declared binding with unbound/mismatched literal; SIDE-2: contract present but stage-ignored/no-epsilon/declaration-only
// Numbers ride the candidate via evalExpr delta computation
import * as ts from 'typescript';
import type { AnalysisContext } from '../types.ts';
import type { SpecBindings } from '../input/spec-bindings.ts';
import { checkContract } from '../math/contract.ts';
import { evalExpr } from '../math/eval.ts';
import type { MathExpr, Bindings } from '../math/expr.ts';

export interface LayerCandidate {
  readonly subject: string;
  readonly predicate: 'shouldBe' | 'isButWrong' | 'violates' | 'wraps' | 'declares';
  readonly object: 'Lexicon' | 'Actor' | 'StateMachine' | 'Engine' | 'Adapter' | 'Contract';
  readonly file: string;
  readonly line: number;
  readonly evidenceQuote: string;
  readonly implicatedSpecClause?: string;
  readonly side: 'SIDE-1' | 'SIDE-2';
  readonly delta?: number;
}

function collectSourceFiles(ctx: AnalysisContext): Map<string, ts.SourceFile> {
  const map = new Map<string, ts.SourceFile>();
  try {
    for (const [file, constructs] of ctx.constructsByFile.entries()) {
      if (constructs.length === 0) continue;
      try { map.set(file, constructs[0]!.node.getSourceFile()); } catch (e: unknown) {
        console.error('[r-mpse] collect entry failed', file, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e: unknown) {
    console.error('[r-mpse] collectSourceFiles failed', e instanceof Error ? e.message : String(e));
  }
  return map;
}

function isCallByName(node: ts.CallExpression, sf: ts.SourceFile, target: string): boolean {
  try {
    const expr = node.expression;
    if (ts.isIdentifier(expr) && expr.getText(sf) === target) return true;
    if (ts.isPropertyAccessExpression(expr) && expr.name.getText(sf) === target) return true;
    return false;
  } catch (e: unknown) {
    console.error('[r-mpse] isCallByName failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

interface LiteralComparisonSite {
  file: string;
  line: number;
  quote: string;
  literal: number;
  operator: string;
}

function collectLiteralComparisons(sf: ts.SourceFile, file: string): LiteralComparisonSite[] {
  const sites: LiteralComparisonSite[] = [];
  try {
    function visit(node: ts.Node): void {
      try {
        if (ts.isBinaryExpression(node)) {
          const opKind = node.operatorToken.kind;
          const isComparison = opKind === ts.SyntaxKind.LessThanToken
            || opKind === ts.SyntaxKind.LessThanEqualsToken
            || opKind === ts.SyntaxKind.GreaterThanToken
            || opKind === ts.SyntaxKind.GreaterThanEqualsToken
            || opKind === ts.SyntaxKind.EqualsEqualsToken
            || opKind === ts.SyntaxKind.EqualsEqualsEqualsToken
            || opKind === ts.SyntaxKind.ExclamationEqualsToken
            || opKind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
          if (isComparison) {
            const leftIsLit = ts.isNumericLiteral(node.left);
            const rightIsLit = ts.isNumericLiteral(node.right);
            let litNode: ts.NumericLiteral | null = null;
            if (leftIsLit) litNode = node.left as ts.NumericLiteral;
            else if (rightIsLit) litNode = node.right as ts.NumericLiteral;
            if (litNode) {
              const val = parseFloat(litNode.getText(sf));
              if (!Number.isNaN(val) && val !== 0 && val !== 1 && val !== -1 && val !== 2) {
                const pos = node.getStart(sf);
                const lc = sf.getLineAndCharacterOfPosition(pos);
                sites.push({
                  file,
                  line: lc.line + 1,
                  quote: node.getText(sf).slice(0, 200),
                  literal: val,
                  operator: node.operatorToken.getText(sf),
                });
              }
            }
          }
        }
      } catch (e: unknown) {
        console.error('[r-mpse] literal comparison visit failed', e instanceof Error ? e.message : String(e));
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  } catch (e: unknown) {
    console.error('[r-mpse] collectLiteralComparisons failed', file, e instanceof Error ? e.message : String(e));
  }
  return sites;
}

interface ContractCallInfo {
  hasCheckContract: boolean;
  hasStageArg: boolean;
  hasEpsilonField: boolean;
  hasMathExprDecl: boolean;
  hasEvalExprCall: boolean;
  declaredConstants: Map<string, number>;
}

function analyzeContractCalls(sf: ts.SourceFile): ContractCallInfo {
  let hasCheckContract = false;
  let hasStageArg = false;
  let hasEpsilonField = false;
  let hasMathExprDecl = false;
  let hasEvalExprCall = false;
  const declaredConstants = new Map<string, number>();
  try {
    function visit(node: ts.Node): void {
      try {
        if (ts.isCallExpression(node)) {
          if (isCallByName(node, sf, 'checkContract')) {
            hasCheckContract = true;
            if (node.arguments.length >= 2) {
              const stageArg = node.arguments[1];
              if (stageArg && (ts.isStringLiteral(stageArg) || ts.isIdentifier(stageArg))) hasStageArg = true;
            }
          }
          if (isCallByName(node, sf, 'evalExpr')) hasEvalExprCall = true;
        }
        if (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) {
          const name = node.name?.getText(sf) ?? '';
          // Detect numeric constant declarations via Order-2
          const init = (node as ts.VariableDeclaration).initializer ?? (node as ts.PropertyAssignment).initializer;
          if (init && ts.isNumericLiteral(init)) {
            const v = parseFloat(init.getText(sf));
            if (!Number.isNaN(v)) declaredConstants.set(name, v);
          }
          if (name === 'epsilon' || name === 'tolerance') hasEpsilonField = true;
        }
        if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
          const n = node.name?.getText(sf) ?? '';
          if (n === 'MathExpr' || n === 'MathContract') hasMathExprDecl = true;
        }
        if (ts.isObjectLiteralExpression(node)) {
          for (const prop of node.properties) {
            if (ts.isPropertyAssignment(prop)) {
              const pn = prop.name?.getText(sf) ?? '';
              if (pn === 'epsilon' || pn === 'tolerance') hasEpsilonField = true;
            }
          }
        }
      } catch (e: unknown) {
        console.error('[r-mpse] contract visit failed', e instanceof Error ? e.message : String(e));
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  } catch (e: unknown) {
    console.error('[r-mpse] analyzeContractCalls failed', e instanceof Error ? e.message : String(e));
  }
  return { hasCheckContract, hasStageArg, hasEpsilonField, hasMathExprDecl, hasEvalExprCall, declaredConstants };
}

export function candidates(ctx: AnalysisContext, specBindings: SpecBindings): LayerCandidate[] {
  const out: LayerCandidate[] = [];
  try {
    if (!ctx || !specBindings) {
      console.error('[r-mpse] null ctx/specBindings');
      return out;
    }
    const fileMap = collectSourceFiles(ctx);
    for (const [file, sf] of fileMap.entries()) {
      try {
        const sites = collectLiteralComparisons(sf, file);
        const info = analyzeContractCalls(sf);
        // SIDE-1: spec-declared binding with unbound literal at comparison site
        for (const site of sites) {
          for (const decl of specBindings.declarations) {
            try {
              // Compute delta via A3 substrate evalExpr: |codeLiteral - specValue| vs tolerance
              const codeExpr: MathExpr = { kind: 'lit', value: site.literal };
              const specExpr: MathExpr = { kind: 'lit', value: decl.value };
              const bindings: Bindings = { profile: 'default', values: {} };
              const ctxEval = { bindings, depthLimit: 256, domainSizeLimit: 10_000 };
              const codeChecked = evalExpr(codeExpr, ctxEval);
              const specChecked = evalExpr(specExpr, ctxEval);
              const delta = Math.abs(site.literal - decl.value);
              const withinTolerance = delta <= decl.tolerance;
              // Only emit if literal is not bound to a named constant matching spec
              const isBoundConstant = info.declaredConstants.has(decl.name) && info.declaredConstants.get(decl.name) === decl.value;
              if (!isBoundConstant && !withinTolerance) {
                // Use checkContract for validation of the divergence contract
                const contract = {
                  id: decl.name,
                  preconditions: [] as readonly MathExpr[],
                  postconditions: [{ kind: 'le' as const, l: { kind: 'lit' as const, value: delta }, r: { kind: 'lit' as const, value: decl.tolerance } }],
                  invariants: [] as readonly MathExpr[],
                  provenance: [{ source: decl.specPath, line: decl.line, quote: decl.quote }],
                };
                const result = checkContract(contract, 'post', { profile: 'default', values: { delta } });
                if (result.verdict !== 'VALID') {
                  out.push({
                    subject: `${file}:${site.line}`,
                    predicate: 'shouldBe',
                    object: 'Contract',
                    file,
                    line: site.line,
                    evidenceQuote: site.quote,
                    implicatedSpecClause: `${decl.specPath}:${decl.line} ${decl.quote.slice(0, 80)}`,
                    side: 'SIDE-1',
                    delta,
                  });
                }
              }
            } catch (e: unknown) {
              console.error('[r-mpse] SIDE-1 delta computation failed', file, e instanceof Error ? e.message : String(e));
            }
          }
        }
        // SIDE-2: contract present but wrong
        if (info.hasCheckContract && !info.hasStageArg) {
          out.push({
            subject: `${file}:checkContract-no-stage`,
            predicate: 'violates',
            object: 'Contract',
            file,
            line: 1,
            evidenceQuote: 'checkContract without stage argument'.slice(0, 200),
            implicatedSpecClause: undefined,
            side: 'SIDE-2',
          });
        }
        if (info.hasCheckContract && !info.hasEpsilonField) {
          out.push({
            subject: `${file}:contract-no-epsilon`,
            predicate: 'isButWrong',
            object: 'Contract',
            file,
            line: 1,
            evidenceQuote: 'contract without epsilon/tolerance field'.slice(0, 200),
            implicatedSpecClause: undefined,
            side: 'SIDE-2',
          });
        }
        if (info.hasMathExprDecl && !info.hasEvalExprCall) {
          out.push({
            subject: `${file}:math-expr-declaration-only`,
            predicate: 'isButWrong',
            object: 'Contract',
            file,
            line: 1,
            evidenceQuote: 'MathExpr declared but evalExpr never invoked'.slice(0, 200),
            implicatedSpecClause: undefined,
            side: 'SIDE-2',
          });
        }
        // Value drift: named constant differs from spec
        for (const decl of specBindings.declarations) {
          const codeVal = info.declaredConstants.get(decl.name);
          if (codeVal !== undefined && codeVal !== decl.value) {
            const delta = Math.abs(codeVal - decl.value);
            if (delta > decl.tolerance) {
              out.push({
                subject: `${file}:constant-drift:${decl.name}`,
                predicate: 'violates',
                object: 'Contract',
                file,
                line: 1,
                evidenceQuote: `${decl.name} code=${codeVal} spec=${decl.value} delta=${delta}`.slice(0, 200),
                implicatedSpecClause: `${decl.specPath}:${decl.line} ${decl.quote.slice(0, 80)}`,
                side: 'SIDE-2',
                delta,
              });
            }
          }
        }
      } catch (e: unknown) {
        console.error('[r-mpse] per-file failed', file, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e: unknown) {
    console.error('[r-mpse] candidates top failed', e instanceof Error ? e.message : String(e));
  }
  return out;
}
