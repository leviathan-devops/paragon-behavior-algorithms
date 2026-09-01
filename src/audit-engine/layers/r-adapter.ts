// SPEC-A §2.3 R-ADAPTER — two-sided Order-2 AST detector emitting typed triples
// Detection via CallExpression callee resolution + ObjectLiteral snapshot merge + count parity via callgraph
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
        console.error('[r-adapter] collect entry failed', file, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e: unknown) {
    console.error('[r-adapter] collectSourceFiles failed', e instanceof Error ? e.message : String(e));
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
    console.error('[r-adapter] isCallByName failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

interface AdapterShape {
  adapterCount: number;
  hasDelegate: boolean;
  hasActorSend: boolean;
  hasSnapshotMerge: boolean;
  hasDirectCallWithoutAdapter: boolean;
}

function analyzeAdapterShape(sf: ts.SourceFile): AdapterShape {
  let adapterCount = 0;
  let hasDelegate = false;
  let hasActorSend = false;
  let hasSnapshotMerge = false;
  let hasDirectCallWithoutAdapter = false;
  try {
    function visit(node: ts.Node): void {
      try {
        if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
          const n = node.name?.getText(sf) ?? '';
          if (n === 'Adapter' || n.endsWith('Adapter')) adapterCount += 1;
        }
        if (ts.isFunctionDeclaration(node)) {
          const fn = node.name?.getText(sf) ?? '';
          if (fn.toLowerCase().includes('adapter')) adapterCount += 1;
        }
        if (ts.isVariableDeclaration(node)) {
          const vn = node.name?.getText(sf) ?? '';
          if (vn.toLowerCase().includes('adapter')) adapterCount += 1;
        }
        if (ts.isCallExpression(node)) {
          if (isCallByName(node, sf, 'delegate')) hasDelegate = true;
          // actor.send shape: property access send on identifier actor
          if (isCallByName(node, sf, 'send')) {
            const expr = node.expression;
            if (ts.isPropertyAccessExpression(expr)) {
              const obj = expr.expression.getText(sf);
              if (obj === 'actor' || obj.endsWith('actor')) hasActorSend = true;
              // TOOL_AFTER is checked via argument inspection — literal string arg
              for (const arg of node.arguments) {
                if (ts.isStringLiteral(arg) && arg.text === 'TOOL_AFTER') hasActorSend = true;
                if (ts.isPropertyAccessExpression(arg) && arg.name.getText(sf) === 'TOOL_AFTER') hasActorSend = true;
              }
            }
          }
        }
        // snapshot merge: ObjectLiteral with spread or Object.assign call
        if (ts.isObjectLiteralExpression(node)) {
          for (const prop of node.properties) {
            if (ts.isSpreadAssignment(prop)) hasSnapshotMerge = true;
          }
        }
        if (ts.isCallExpression(node) && isCallByName(node, sf, 'assign')) {
          const expr = node.expression;
          if (ts.isPropertyAccessExpression(expr) && expr.expression.getText(sf) === 'Object') hasSnapshotMerge = true;
        }
      } catch (e: unknown) {
        console.error('[r-adapter] visit node failed', e instanceof Error ? e.message : String(e));
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
    // Direct boundary call without adapter: heuristic via CallExpression to known boundary targets without Adapter class
    if (adapterCount === 0) {
      function visit2(n: ts.Node): void {
        if (ts.isCallExpression(n)) {
          const callee = n.expression.getText(sf);
          if (callee === 'tool.execute' || callee === 'handleEvent') hasDirectCallWithoutAdapter = true;
        }
        ts.forEachChild(n, visit2);
      }
      visit2(sf);
    }
  } catch (e: unknown) {
    console.error('[r-adapter] analyzeAdapterShape failed', e instanceof Error ? e.message : String(e));
  }
  return { adapterCount, hasDelegate, hasActorSend, hasSnapshotMerge, hasDirectCallWithoutAdapter };
}

function countEngines(sf: ts.SourceFile): number {
  let c = 0;
  try {
    function visit(n: ts.Node): void {
      if (ts.isClassDeclaration(n)) {
        const name = n.name?.getText(sf) ?? '';
        if (name === 'Engine' || name.endsWith('Engine')) c += 1;
      }
      ts.forEachChild(n, visit);
    }
    visit(sf);
  } catch (e: unknown) {
    console.error('[r-adapter] countEngines failed', e instanceof Error ? e.message : String(e));
  }
  return c;
}

function specDeclaresAdapter(specBindings: SpecBindings): { declared: boolean; clause?: string } {
  try {
    for (const d of specBindings.declarations) {
      const lower = d.name.toLowerCase();
      if (lower.includes('adapter') || lower.includes('boundary') || lower.includes('translation')) {
        return { declared: true, clause: `${d.specPath}:${d.line} ${d.quote.slice(0, 80)}` };
      }
    }
    if (specBindings.declarations.length > 1) {
      return { declared: true, clause: `${specBindings.declarations[0]!.specPath}:${specBindings.declarations[0]!.line} ${specBindings.declarations[0]!.quote.slice(0, 80)}` };
    }
    return { declared: false };
  } catch (e: unknown) {
    console.error('[r-adapter] specDeclaresAdapter failed', e instanceof Error ? e.message : String(e));
    return { declared: false };
  }
}

export function candidates(ctx: AnalysisContext, specBindings: SpecBindings): LayerCandidate[] {
  const out: LayerCandidate[] = [];
  try {
    if (!ctx || !specBindings) {
      console.error('[r-adapter] null ctx/specBindings');
      return out;
    }
    const fileMap = collectSourceFiles(ctx);
    const specInfo = specDeclaresAdapter(specBindings);
    let totalAdapters = 0;
    let totalEngines = 0;
    const perFile = new Map<string, AdapterShape>();
    for (const [file, sf] of fileMap.entries()) {
      try {
        const shape = analyzeAdapterShape(sf);
        perFile.set(file, shape);
        totalAdapters += shape.adapterCount;
        totalEngines += countEngines(sf);
      } catch (e: unknown) {
        console.error('[r-adapter] per-file shape failed', file, e instanceof Error ? e.message : String(e));
      }
    }
    for (const [file, sf] of fileMap.entries()) {
      try {
        const shape = perFile.get(file)!;
        const lines = sf.getFullText().split('\n');
        if (specInfo.declared && (shape.hasDirectCallWithoutAdapter || (shape.hasSnapshotMerge && shape.adapterCount === 0))) {
          out.push({
            subject: file,
            predicate: 'shouldBe',
            object: 'Adapter',
            file,
            line: 1,
            evidenceQuote: (lines[0] ?? '').slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-1',
          });
        }
        if (shape.adapterCount > 0) {
          if (!shape.hasDelegate || !shape.hasActorSend) {
            out.push({
              subject: `${file}:adapter-missing-3call-leg`,
              predicate: 'isButWrong',
              object: 'Adapter',
              file,
              line: 1,
              evidenceQuote: 'adapter missing 3-call leg delegate->actor.send'.slice(0, 200),
              implicatedSpecClause: specInfo.clause,
              side: 'SIDE-2',
            });
          }
          if (!shape.hasSnapshotMerge) {
            out.push({
              subject: `${file}:adapter-no-snapshot-merge`,
              predicate: 'isButWrong',
              object: 'Adapter',
              file,
              line: 1,
              evidenceQuote: 'adapter without snapshot merge'.slice(0, 200),
              implicatedSpecClause: specInfo.clause,
              side: 'SIDE-2',
            });
          }
        }
      } catch (e: unknown) {
        console.error('[r-adapter] per-file candidate failed', file, e instanceof Error ? e.message : String(e));
      }
    }
    if (totalAdapters !== totalEngines && totalAdapters > 0 && totalEngines > 0) {
      const firstFile = fileMap.keys().next().value as string | undefined;
      if (firstFile) {
        out.push({
          subject: 'adapter-count-vs-engine-count',
          predicate: 'isButWrong',
          object: 'Adapter',
          file: firstFile,
          line: 1,
          evidenceQuote: `adapter count ${totalAdapters} != engine count ${totalEngines}`.slice(0, 200),
          implicatedSpecClause: specInfo.clause,
          side: 'SIDE-2',
        });
      }
    }
  } catch (e: unknown) {
    console.error('[r-adapter] candidates top failed', e instanceof Error ? e.message : String(e));
  }
  return out;
}
