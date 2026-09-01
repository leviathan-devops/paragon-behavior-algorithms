// SPEC-A §2.3 R-ENGINE — two-sided Order-2 AST detector emitting typed triples
// Detection via ClassDeclaration / CallExpression / PropertyAccess walkers — never file-text substring
import * as ts from 'typescript';
import type { AnalysisContext } from '../types.ts';
import type { SpecBindings } from '../input/spec-bindings.ts';

export interface LayerCandidate {
  readonly subject: string;
  readonly predicate: 'shouldBe' | 'isButWrong' | 'violates' | 'wraps' | 'declares';
  readonly object: 'Lexicon' | 'Actor' | 'StateMachine' | 'Engine' | 'Adapter' | 'Contract';
  readonly file: string;
  readonly line: number;
  readonly evidenceQuote: string;
  readonly implicatedSpecClause?: string;
  readonly side: 'SIDE-1' | 'SIDE-2';
}

function collectSourceFiles(ctx: AnalysisContext): Map<string, ts.SourceFile> {
  const map = new Map<string, ts.SourceFile>();
  try {
    for (const [file, constructs] of ctx.constructsByFile.entries()) {
      if (constructs.length === 0) continue;
      try { map.set(file, constructs[0]!.node.getSourceFile()); } catch (e: unknown) {
        console.error('[r-engine] collect entry failed', file, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e: unknown) {
    console.error('[r-engine] collectSourceFiles failed', e instanceof Error ? e.message : String(e));
  }
  return map;
}

interface EngineShape {
  hasClass: boolean;
  isPlainClass: boolean;
  hasCreateProgram: boolean;
  hasTryCatch: boolean;
  hasEvidenceWrite: boolean;
  hasDegrade: boolean;
  containerWithMethods: boolean;
  supervisorWithoutBudget: boolean;
}

function isCallByName(node: ts.CallExpression, sf: ts.SourceFile, target: string): boolean {
  try {
    const expr = node.expression;
    if (ts.isIdentifier(expr) && expr.getText(sf) === target) return true;
    if (ts.isPropertyAccessExpression(expr) && expr.name.getText(sf) === target) return true;
    return false;
  } catch (e: unknown) {
    console.error('[r-engine] isCallByName failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

function analyzeEngineShape(sf: ts.SourceFile): EngineShape {
  let hasClass = false;
  let isPlainClass = false;
  let hasCreateProgram = false;
  let hasTryCatch = false;
  let hasEvidenceWrite = false;
  let hasDegrade = false;
  let containerWithMethods = false;
  let supervisorWithoutBudget = false;
  try {
    function visit(node: ts.Node): void {
      try {
        if (ts.isCallExpression(node)) {
          if (isCallByName(node, sf, 'createProgram')) hasCreateProgram = true;
          // evidence writes: look for .writeFile / .appendFile / writeFileSync call expressions
          if (isCallByName(node, sf, 'writeFile') || isCallByName(node, sf, 'writeFileSync') || isCallByName(node, sf, 'appendFile')) {
            hasEvidenceWrite = true;
          }
          if (isCallByName(node, sf, 'degrade')) hasDegrade = true;
        }
        if (ts.isPropertyAccessExpression(node)) {
          const prop = node.name.getText(sf);
          if (prop === 'writeFile' || prop === 'writeFileSync') hasEvidenceWrite = true;
          if (prop === 'degrade') hasDegrade = true;
        }
        if (ts.isClassDeclaration(node)) {
          hasClass = true;
          const heritage = node.heritageClauses;
          if (!heritage || heritage.length === 0) isPlainClass = true;
          else {
            const types: string[] = [];
            for (const clause of heritage) {
              for (const t of clause.types) types.push(t.getText(sf));
            }
            const extendsFramework = types.some((c) => c === 'Plugin' || c === 'Framework' || c === 'Base');
            if (!extendsFramework) isPlainClass = true;
          }
          let methodCount = 0;
          for (const m of node.members) {
            if (ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m)) methodCount += 1;
          }
          const className = node.name?.getText(sf) ?? '';
          if (className === 'Container' && methodCount > 0) containerWithMethods = true;
          if (className === 'Supervisor') {
            let hasBudget = false;
            for (const m of node.members) {
              const txt = m.getText(sf).slice(0, 200);
              // Check via AST: identifier named budget or WAL
              if (ts.isPropertyDeclaration(m) || ts.isMethodDeclaration(m)) {
                const n = (m.name?.getText(sf) ?? '');
                if (n === 'budget' || n === 'WAL' || n === 'wal') hasBudget = true;
              }
              void txt;
            }
            // Also walk constructor params for budget identifier
            function walkForBudget(n: ts.Node): void {
              if (ts.isIdentifier(n) && (n.getText(sf) === 'budget' || n.getText(sf) === 'WAL')) hasBudget = true;
              ts.forEachChild(n, walkForBudget);
            }
            walkForBudget(node);
            if (!hasBudget) supervisorWithoutBudget = true;
          }
        }
        if (ts.isTryStatement(node)) {
          hasTryCatch = true;
          // Check catch clause for degrade identifier
          const catchClause = node.catchClause;
          if (catchClause) {
            function walkCatch(n: ts.Node): void {
              if (ts.isIdentifier(n) && n.getText(sf) === 'degrade') hasDegrade = true;
              if (ts.isCallExpression(n) && isCallByName(n, sf, 'degrade')) hasDegrade = true;
              ts.forEachChild(n, walkCatch);
            }
            walkCatch(catchClause);
          }
        }
      } catch (e: unknown) {
        console.error('[r-engine] visit node failed', e instanceof Error ? e.message : String(e));
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  } catch (e: unknown) {
    console.error('[r-engine] analyzeEngineShape failed', e instanceof Error ? e.message : String(e));
  }
  return { hasClass, isPlainClass, hasCreateProgram, hasTryCatch, hasEvidenceWrite, hasDegrade, containerWithMethods, supervisorWithoutBudget };
}

function specDeclaresEngine(specBindings: SpecBindings): { declared: boolean; clause?: string } {
  try {
    for (const d of specBindings.declarations) {
      const lower = d.name.toLowerCase();
      if (lower.includes('engine') || lower.includes('heavy') || lower.includes('analysis') || lower.includes('computation')) {
        return { declared: true, clause: `${d.specPath}:${d.line} ${d.quote.slice(0, 80)}` };
      }
    }
    if (specBindings.declarations.length > 0) {
      return { declared: true, clause: `${specBindings.declarations[0]!.specPath}:${specBindings.declarations[0]!.line} ${specBindings.declarations[0]!.quote.slice(0, 80)}` };
    }
    return { declared: false };
  } catch (e: unknown) {
    console.error('[r-engine] specDeclaresEngine failed', e instanceof Error ? e.message : String(e));
    return { declared: false };
  }
}

function hasHookHandlerHeavyWork(sf: ts.SourceFile): boolean {
  try {
    let hasHookHandler = false;
    let hasHeavyCall = false;
    let hasClassEngine = false;
    function visit(n: ts.Node): void {
      if (ts.isCallExpression(n)) {
        const expr = n.expression;
        if (ts.isPropertyAccessExpression(expr)) {
          const prop = expr.name.getText(sf);
          if (prop === 'execute' || prop === 'before' || prop === 'after') {
            // tool.execute.before shape — check qualifier
            const qualifier = expr.expression.getText(sf);
            if (qualifier === 'tool' || qualifier.endsWith('.tool')) hasHookHandler = true;
          }
        }
        if (isCallByName(n, sf, 'createProgram') || isCallByName(n, sf, 'analyze') || isCallByName(n, sf, 'parse')) hasHeavyCall = true;
      }
      if (ts.isClassDeclaration(n)) {
        const cname = n.name?.getText(sf) ?? '';
        if (cname === 'Engine' || cname === 'AnalysisEngine') hasClassEngine = true;
      }
      ts.forEachChild(n, visit);
    }
    visit(sf);
    return hasHookHandler && hasHeavyCall && !hasClassEngine;
  } catch (e: unknown) {
    console.error('[r-engine] hasHookHandlerHeavyWork failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

export function candidates(ctx: AnalysisContext, specBindings: SpecBindings): LayerCandidate[] {
  const out: LayerCandidate[] = [];
  try {
    if (!ctx || !specBindings) {
      console.error('[r-engine] null ctx/specBindings');
      return out;
    }
    const fileMap = collectSourceFiles(ctx);
    const specInfo = specDeclaresEngine(specBindings);
    for (const [file, sf] of fileMap.entries()) {
      try {
        const shape = analyzeEngineShape(sf);
        const lines = sf.getFullText().split('\n');
        const heavyInHook = hasHookHandlerHeavyWork(sf);
        if (specInfo.declared && heavyInHook && !shape.hasClass) {
          out.push({
            subject: file,
            predicate: 'shouldBe',
            object: 'Engine',
            file,
            line: 1,
            evidenceQuote: (lines[0] ?? '').slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-1',
          });
        }
        if (specInfo.declared && shape.hasEvidenceWrite && !shape.hasClass) {
          out.push({
            subject: `${file}:engine-write-without-class`,
            predicate: 'shouldBe',
            object: 'Engine',
            file,
            line: 1,
            evidenceQuote: 'evidence write without Engine class'.slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-1',
          });
        }
        if (shape.hasClass && !shape.isPlainClass) {
          out.push({
            subject: `${file}:engine-not-plain-class`,
            predicate: 'isButWrong',
            object: 'Engine',
            file,
            line: 1,
            evidenceQuote: 'engine not a plain class'.slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-2',
          });
        }
        if (shape.hasClass && !shape.hasCreateProgram) {
          out.push({
            subject: `${file}:engine-no-createProgram`,
            predicate: 'isButWrong',
            object: 'Engine',
            file,
            line: 1,
            evidenceQuote: 'engine without createProgram'.slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-2',
          });
        }
        if (shape.hasClass && !shape.hasEvidenceWrite) {
          out.push({
            subject: `${file}:engine-no-evidence-write`,
            predicate: 'isButWrong',
            object: 'Engine',
            file,
            line: 1,
            evidenceQuote: 'engine with no evidence-file writes'.slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-2',
          });
        }
        if (shape.hasClass && !shape.hasDegrade && !shape.hasTryCatch) {
          out.push({
            subject: `${file}:engine-no-degrade`,
            predicate: 'isButWrong',
            object: 'Engine',
            file,
            line: 1,
            evidenceQuote: 'engine without try/catch degrade'.slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-2',
          });
        }
        if (shape.containerWithMethods) {
          out.push({
            subject: `${file}:container-with-methods`,
            predicate: 'violates',
            object: 'Engine',
            file,
            line: 1,
            evidenceQuote: 'container with methods violates zero-methods law'.slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-2',
          });
        }
        if (shape.supervisorWithoutBudget) {
          out.push({
            subject: `${file}:supervisor-no-budget`,
            predicate: 'isButWrong',
            object: 'Engine',
            file,
            line: 1,
            evidenceQuote: 'supervisor without budget/WAL'.slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-2',
          });
        }
      } catch (e: unknown) {
        console.error('[r-engine] per-file failed', file, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e: unknown) {
    console.error('[r-engine] candidates top failed', e instanceof Error ? e.message : String(e));
  }
  return out;
}
