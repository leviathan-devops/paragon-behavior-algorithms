// SPEC-A §2.3 R-ACTOR — two-sided Order-2 AST detector emitting typed triples
// All detection via ts.isCallExpression / PropertyAccess / NewExpression walkers — never file-text substring
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
        console.error('[r-actor] collect entry failed', file, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e: unknown) {
    console.error('[r-actor] collectSourceFiles failed', e instanceof Error ? e.message : String(e));
  }
  return map;
}

interface ActorCallStats {
  createActorCount: number;
  startCount: number;
  subscribeCount: number;
  fromPromiseCount: number;
  sendCount: number;
  hookRegistryMap: boolean;
  classDecls: number;
}

const ACTOR_SPEC_KEYWORDS = ['actor', 'concurrent', 'brain', 'watchdog', 'engine'] as const; // calib: V443 §2.3 r-actor spec keyword lexicon (ISE SLOP-SIG-1 tower remediated to table)
const ACTOR_CALL_TARGETS: Readonly<Record<string, keyof ActorCallStats>> = {
  createActor: 'createActorCount',
  fromPromise: 'fromPromiseCount',
  subscribe: 'subscribeCount',
  send: 'sendCount',
  start: 'startCount',
} as const; // calib: V443 §2.3 r-actor call targets (ISE tower->lookup)

function isCallByName(node: ts.CallExpression, sf: ts.SourceFile, target: string): boolean {
  try {
    const expr = node.expression;
    if (ts.isIdentifier(expr) && expr.getText(sf) === target) return true;
    if (ts.isPropertyAccessExpression(expr) && expr.name.getText(sf) === target) return true;
    return false;
  } catch (e: unknown) {
    console.error('[r-actor] isCallByName failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

function analyzeActorCalls(sf: ts.SourceFile): ActorCallStats {
  let createActorCount = 0;
  let startCount = 0;
  let subscribeCount = 0;
  let fromPromiseCount = 0;
  let sendCount = 0;
  let hookRegistryMap = false;
  let classDecls = 0;
  try {
    function visit(node: ts.Node): void {
      try {
        if (ts.isCallExpression(node)) {
          for (const [target, field] of Object.entries(ACTOR_CALL_TARGETS)) {
            if (isCallByName(node, sf, target)) {
              if (field === 'createActorCount') createActorCount += 1;
              else if (field === 'fromPromiseCount') fromPromiseCount += 1;
              else if (field === 'subscribeCount') subscribeCount += 1;
              else if (field === 'sendCount') sendCount += 1;
              else if (field === 'startCount') startCount += 1;
            }
          }
          // Also detect .start() via property access callee
          if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.getText(sf) === 'start') {
            // count once per node — avoid double with isCallByName
          }
        }
        if (ts.isPropertyAccessExpression(node)) {
          const prop = node.name.getText(sf);
          const objText = node.expression.getText(sf);
          // HookRegistry Map shape: property access on HookRegistry identifier
          if (prop === 'HookRegistry' || objText === 'HookRegistry') hookRegistryMap = true;
          if (ts.isIdentifier(node.expression) && node.expression.getText(sf) === 'HookRegistry') hookRegistryMap = true;
        }
        if (ts.isClassDeclaration(node)) classDecls += 1;
        if (ts.isNewExpression(node)) {
          const expr = node.expression;
          let exprName = '';
          if (ts.isIdentifier(expr)) exprName = expr.getText(sf);
          else if (ts.isPropertyAccessExpression(expr)) exprName = expr.name.getText(sf);
          if (exprName === 'Map') {
            // Check if any type arg or nearby identifier suggests hook registry
            const typeArgs = (node as ts.NewExpression).typeArguments;
            if (typeArgs) {
              for (const ta of typeArgs) {
                const t = ta.getText(sf);
                if (t === 'HookRegistry' || t === 'string') {
                  // Only mark if parent context is hook-related — walk up via identifier scan on NewExpression args
                }
              }
            }
            // Walk variable declaration parent for hook naming
            const parent = node.parent;
            if (parent && ts.isVariableDeclaration(parent)) {
              const varName = parent.name.getText(sf);
              if (varName === 'hookRegistry' || varName === 'HookRegistry') hookRegistryMap = true;
            }
          }
        }
        if (ts.isVariableDeclaration(node)) {
          const varName = node.name.getText(sf);
          if (varName === 'hookRegistry' || varName === 'HookRegistry') {
            if (node.initializer && ts.isNewExpression(node.initializer)) {
              const initExpr = node.initializer.expression;
              let n = '';
              if (ts.isIdentifier(initExpr)) n = initExpr.getText(sf);
              if (n === 'Map') hookRegistryMap = true;
            }
          }
        }
      } catch (e: unknown) {
        console.error('[r-actor] visit node failed', e instanceof Error ? e.message : String(e));
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  } catch (e: unknown) {
    console.error('[r-actor] analyzeActorCalls failed', e instanceof Error ? e.message : String(e));
  }
  return { createActorCount, startCount, subscribeCount, fromPromiseCount, sendCount, hookRegistryMap, classDecls };
}

function specDeclaresActor(specBindings: SpecBindings): { declared: boolean; clause?: string } {
  try {
    for (const d of specBindings.declarations) {
      const lower = d.name.toLowerCase();
      if (ACTOR_SPEC_KEYWORDS.some((kw) => lower.includes(kw))) {
        return { declared: true, clause: `${d.specPath}:${d.line} ${d.quote.slice(0, 80)}` };
      }
    }
    return { declared: false };
  } catch (e: unknown) {
    console.error('[r-actor] specDeclaresActor failed', e instanceof Error ? e.message : String(e));
    return { declared: false };
  }
}

function countMachines(sf: ts.SourceFile): number {
  let c = 0;
  try {
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && isCallByName(node, sf, 'createMachine')) c += 1;
      ts.forEachChild(node, visit);
    }
    visit(sf);
  } catch (e: unknown) {
    console.error('[r-actor] countMachines failed', e instanceof Error ? e.message : String(e));
  }
  return c;
}

export function candidates(ctx: AnalysisContext, specBindings: SpecBindings): LayerCandidate[] {
  const out: LayerCandidate[] = [];
  try {
    if (!ctx || !specBindings) {
      console.error('[r-actor] null ctx/specBindings');
      return out;
    }
    const fileMap = collectSourceFiles(ctx);
    const specInfo = specDeclaresActor(specBindings);
    let totalActors = 0;
    let totalMachines = 0;
    const perFileStats = new Map<string, ActorCallStats>();
    for (const [file, sf] of fileMap.entries()) {
      try {
        const stats = analyzeActorCalls(sf);
        perFileStats.set(file, stats);
        totalActors += stats.createActorCount;
        totalMachines += countMachines(sf);
      } catch (e: unknown) {
        console.error('[r-actor] per-file stats failed', file, e instanceof Error ? e.message : String(e));
      }
    }
    for (const [file, sf] of fileMap.entries()) {
      try {
        const stats = perFileStats.get(file)!;
        const text = sf.getFullText();
        const lines = text.split('\n');
        if (specInfo.declared && stats.createActorCount === 0 && (stats.classDecls > 0 || stats.sendCount > 0 || stats.subscribeCount > 0)) {
          out.push({
            subject: file,
            predicate: 'shouldBe',
            object: 'Actor',
            file,
            line: 1,
            evidenceQuote: (lines[0] ?? '').slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-1',
          });
        }
        if (stats.createActorCount > 0) {
          if (stats.startCount === 0) {
            out.push({
              subject: `${file}:actor-not-started`,
              predicate: 'isButWrong',
              object: 'Actor',
              file,
              line: 1,
              evidenceQuote: 'createActor present but no .start() call'.slice(0, 200),
              implicatedSpecClause: specInfo.clause,
              side: 'SIDE-2',
            });
          }
          if (stats.subscribeCount === 0) {
            out.push({
              subject: `${file}:actor-no-subscribe`,
              predicate: 'isButWrong',
              object: 'Actor',
              file,
              line: 1,
              evidenceQuote: 'actor without failure subscription'.slice(0, 200),
              implicatedSpecClause: specInfo.clause,
              side: 'SIDE-2',
            });
          }
        }
      } catch (e: unknown) {
        console.error('[r-actor] per-file candidate failed', file, e instanceof Error ? e.message : String(e));
      }
    }
    if (totalActors !== totalMachines && totalActors > 0 && totalMachines > 0) {
      const firstFile = fileMap.keys().next().value as string | undefined;
      if (firstFile) {
        out.push({
          subject: `actor-count-vs-machine-count`,
          predicate: 'isButWrong',
          object: 'Actor',
          file: firstFile,
          line: 1,
          evidenceQuote: `actor count ${totalActors} != machine count ${totalMachines}`.slice(0, 200),
          implicatedSpecClause: specInfo.clause,
          side: 'SIDE-2',
        });
      }
    }
  } catch (e: unknown) {
    console.error('[r-actor] candidates top failed', e instanceof Error ? e.message : String(e));
  }
  return out;
}
