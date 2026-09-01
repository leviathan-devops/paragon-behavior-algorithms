import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';
export const SAFE_ASYNC_DEFAULTS = ['tridentLog', 'debugLog', 'console.log', 'console.error', 'console.warn'] as const;
const SAFE_ASYNC_PATTERN = /^(fireAndForget|void\B)/;
function hasSafeAsyncTag(node: ts.Node): boolean {
  const tags = ts.getJSDocTags(node);
  for (const t of tags) if (t.tagName.text === 'safe-async') return true;
  const jsDoc = (node as unknown as { jsDoc?: ts.JSDoc[] }).jsDoc;
  if (jsDoc) {
    for (const doc of jsDoc) {
      if (doc.tags) for (const tag of doc.tags) if (tag.tagName.text === 'safe-async') return true;
      const c = typeof doc.comment === 'string' ? doc.comment : '';
      if (c.includes('@safe-async')) return true;
    }
  }
  return false;
}
const safeAsyncCache = new WeakMap<AnalysisContext, Set<string>>();
function getSafeAsyncSet(ctx: AnalysisContext): Set<string> {
  const cached = safeAsyncCache.get(ctx);
  if (cached) return cached;
  const set = new Set<string>(SAFE_ASYNC_DEFAULTS as unknown as string[]);
  for (const c of ctx.constructs) {
    if (!c.node || !c.name) continue;
    if (SAFE_ASYNC_PATTERN.test(c.name)) set.add(c.name);
    try { if (hasSafeAsyncTag(c.node)) set.add(c.name); } catch {}
  }
  safeAsyncCache.set(ctx, set);
  return set;
}
function walkAst(root: ts.Node, visitor: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    visitor(node);
    ts.forEachChild(node, (child: ts.Node): void => { stack.push(child); });
  }
}
function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile)).line + 1;
}
function isInsideTryStatement(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isTryStatement(current)) return true;
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}
function isPromiseType(node: ts.Node, checker: ts.TypeChecker | null): boolean {
  if (!checker) return false;
  try {
    const type = checker.getTypeAtLocation(node);
    if (type.symbol && type.symbol.name === 'Promise') return true;
    if (type.aliasSymbol && type.aliasSymbol.name === 'Promise') return true;
    if (type.isUnion() || type.isIntersection()) {
      for (const t of type.types) {
        if (t.symbol && t.symbol.name === 'Promise') return true;
        if (t.aliasSymbol && t.aliasSymbol.name === 'Promise') return true;
      }
    }
    const thenProp = type.getProperty('then');
    if (thenProp) {
      const thenType = checker.getTypeOfSymbolAtLocation(thenProp, node);
      const thenSigs = thenType.getCallSignatures();
      if (thenSigs.length > 0) return true;
    }
    return false;
  } catch { return false; }
}
function functionBodyHasTryStatement(funcNode: ts.Node): boolean {
  let startNode: ts.Node | undefined;
  if (ts.isFunctionDeclaration(funcNode) || ts.isArrowFunction(funcNode) || ts.isMethodDeclaration(funcNode)) startNode = funcNode.body;
  else startNode = funcNode;
  if (!startNode) return false;
  if (!ts.isBlock(startNode) && !ts.isTryStatement(startNode)) return false;
  const stack: ts.Node[] = [startNode];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (ts.isTryStatement(n)) return true;
    ts.forEachChild(n, (child: ts.Node): void => { if (ts.isFunctionLike(child)) return; stack.push(child); });
  }
  return false;
}
function isEmptyFunctionBody(node: ts.Node): boolean {
  if (ts.isArrowFunction(node)) {
    const body = node.body;
    if (ts.isBlock(body)) return body.statements.length === 0;
    if (ts.isIdentifier(body)) return body.text === 'undefined';
    if (body.kind === ts.SyntaxKind.NullKeyword) return true;
    return false;
  }
  if (ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
    const fbody = node.body;
    if (fbody && ts.isBlock(fbody)) return fbody.statements.length === 0;
    return false;
  }
  return false;
}
function isSameFile(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.endsWith(b) || b.endsWith(a)) return true;
  const ba = a.split('/').pop() || a;
  const bb = b.split('/').pop() || b;
  return ba === bb;
}
function callGraphAnalysis(construct: CodeConstruct, ctx: AnalysisContext, findings: AuditFinding[]): void {
  const safeSet = getSafeAsyncSet(ctx);
  for (const [, entry] of ctx.callGraph.entries) {
    if (!isSameFile(entry.calleeFile, construct.filePath)) continue;
    if (Math.abs(entry.calleeLine - construct.line) > 5) continue;
    if (safeSet.has(entry.calleeName) || safeSet.has(entry.calleeName.split('.').pop()!)) continue;
    for (const callSite of entry.callSites) {
      if (callSite.calleeReturnsPromise && !callSite.hasAwait && !callSite.isInsideTry) {
        const alreadyReported = findings.some((f: AuditFinding) => f.file === callSite.callSiteFile && f.line === callSite.callSiteLine);
        if (alreadyReported) continue;
        findings.push({
          layer: 'R3', severity: 'HIGH', category: 'ASYNC_CORRECTNESS', file: callSite.callSiteFile, line: callSite.callSiteLine,
          evidence: `${entry.calleeName}() returns Promise but is called without await outside try`,
          description: `Async function '${entry.calleeName}' returns Promise but is called without await — caller continues before completion`,
          correction: `Add 'await' before ${entry.calleeName}() or handle the returned Promise with .then().catch()`,
          runtimeImpact: `Caller continues execution before ${entry.calleeName}() completes — may process stale state, set flags too early`,
          confidence: callSite.calleeResolved ? 0.90 : 0.70, constructType: construct.type, callGraphRef: `${entry.calleeFile}:${entry.calleeLine}`, evidenceSuppressed: false,
        });
      }
    }
  }
  for (const [, entry] of ctx.callGraph.entries) {
    if (safeSet.has(entry.calleeName) || safeSet.has(entry.calleeName.split('.').pop()!)) continue;
    for (const callSite of entry.callSites) {
      if (!isSameFile(callSite.callSiteFile, construct.filePath)) continue;
      const lineDiff = Math.abs(callSite.callSiteLine - construct.line);
      if (lineDiff <= 0 || lineDiff > construct.endLine - construct.line) continue;
      if (callSite.calleeReturnsPromise && !callSite.hasAwait && !callSite.returnValueUsed && !callSite.isInsideTry) {
        const alreadyReported = findings.some((f: AuditFinding) => f.file === callSite.callSiteFile && f.line === callSite.callSiteLine && f.category === 'ASYNC_CORRECTNESS');
        if (alreadyReported) continue;
        findings.push({
          layer: 'R3', severity: 'MEDIUM', category: 'ASYNC_CORRECTNESS', file: callSite.callSiteFile, line: callSite.callSiteLine,
          evidence: `${entry.calleeName}() returns Promise but result is discarded`,
          description: `Async call '${entry.calleeName}' result not used — fire-and-forget pattern`,
          correction: `Await the result or handle with .then().catch()`,
          runtimeImpact: 'Async operation may fail silently — no error handling, no completion check',
          confidence: 0.75, constructType: construct.type, callGraphRef: `${entry.calleeFile}:${entry.calleeLine}`, evidenceSuppressed: false,
        });
      }
    }
  }
}
export const R3_ASYNC_CORRECTNESS: LayerRule = {
  layer: 'R3',
  name: 'Async Correctness',
  description: 'Detects async/await patterns that silently fail at runtime using TypeScript AST analysis',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION],
  requireAsync: true,
  enabled: true,
  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    if (construct.filePath.includes('__tests__') || construct.filePath.includes('/fixtures/') || construct.filePath.includes('/artifacts/')) return [];
    const findings: AuditFinding[] = [];
    const node = construct.node;
    const checker = ctx.checker ?? null;
    if (!node) { callGraphAnalysis(construct, ctx, findings); return findings; }
    const sourceFile = node.getSourceFile();
    if (!sourceFile) { callGraphAnalysis(construct, ctx, findings); return findings; }
    try {
      const bodyText = node.getText(sourceFile);
      if (bodyText.includes('expectRejects') || bodyText.includes('.rejects') || bodyText.includes('expect(')) { /* test boundary — skip await-without-try if boundary present */ }
      else {
      const hasTry = functionBodyHasTryStatement(node);
      let hasAnyAwait = false;
      let firstUnprotectedAwaitNode: ts.AwaitExpression | null = null;
      let unprotectedAwaitLine = construct.line;
      {
        let walkRoot: ts.Node | undefined;
        if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) walkRoot = node.body;
        else walkRoot = node;
        if (walkRoot) {
          const awaitStack: ts.Node[] = [walkRoot];
          while (awaitStack.length > 0) {
            const n = awaitStack.pop()!;
            if (ts.isAwaitExpression(n)) {
              const awaitTextInner = n.getText(sourceFile);
              if (awaitTextInner.includes('Promise.resolve') || awaitTextInner.includes('Promise.all')) { /* non-rejectable — skip */ } else {
                hasAnyAwait = true;
                if (!hasTry && !firstUnprotectedAwaitNode) { firstUnprotectedAwaitNode = n; unprotectedAwaitLine = getLineNumber(sourceFile, n); }
              }
            }
            ts.forEachChild(n, (child: ts.Node): void => { if (ts.isFunctionLike(child)) return; awaitStack.push(child); });
          }
        }
      }
      if (hasAnyAwait && !hasTry && firstUnprotectedAwaitNode) {
        const awaitText = firstUnprotectedAwaitNode.getText(sourceFile);
        findings.push({
          layer: 'R3', severity: 'HIGH', category: 'ASYNC_CORRECTNESS', file: construct.filePath, line: unprotectedAwaitLine,
          evidence: awaitText, description: `Async function '${construct.name}' contains await expressions but has no try/catch — rejected promises will be unhandled`,
          correction: `Wrap await calls in try/catch, or chain .catch() on the promise`,
          runtimeImpact: `Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed`,
          confidence: 0.85, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
        });
      }
      walkAst(node, (child: ts.Node): void => {
        if (!ts.isCallExpression(child)) return;
        const expr = child.expression;
        if (!ts.isPropertyAccessExpression(expr)) return;
        const methodName = expr.name.text;
        if (methodName === 'then') {
          const parent = child.parent;
          const isChainedWithCatch = ts.isPropertyAccessExpression(parent) && parent.name.text === 'catch';
          const isIntermediateThen = ts.isPropertyAccessExpression(parent) && parent.name.text === 'then';
          if (!isChainedWithCatch && !isIntermediateThen) {
            const receiverText = expr.expression.getText(sourceFile);
            findings.push({
              layer: 'R3', severity: 'HIGH', category: 'ASYNC_CORRECTNESS', file: construct.filePath, line: getLineNumber(sourceFile, child),
              evidence: `${receiverText}.then(...) without .catch()`, description: `.then() without .catch() — promise rejection will be unhandled`,
              correction: `Chain .catch() after .then(), or use async/await with try/catch`,
              runtimeImpact: `If the promise rejects, the rejection is unhandled — may crash process or silently fail`,
              confidence: 0.90, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
            });
          }
          if (child.arguments.length > 0 && isEmptyFunctionBody(child.arguments[0])) {
            findings.push({
              layer: 'R3', severity: 'MEDIUM', category: 'ASYNC_CORRECTNESS', file: construct.filePath, line: getLineNumber(sourceFile, child),
              evidence: child.getText(sourceFile), description: 'Empty .then() callback — async result silently discarded',
              correction: 'Handle the async result properly — await it or add meaningful .then()/.catch() handlers',
              runtimeImpact: 'Async result silently discarded — errors never caught, completion never verified',
              confidence: 0.95, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
            });
          }
        }
        if (methodName === 'catch') {
          if (child.arguments.length > 0 && isEmptyFunctionBody(child.arguments[0])) {
            findings.push({
              layer: 'R3', severity: 'MEDIUM', category: 'ASYNC_CORRECTNESS', file: construct.filePath, line: getLineNumber(sourceFile, child),
              evidence: child.getText(sourceFile), description: 'Empty .catch() callback — errors silently discarded',
              correction: 'Add error handling in .catch() or use try/catch with await',
              runtimeImpact: 'Rejection silently consumed — error evidence lost',
              confidence: 0.95, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
            });
          }
        }
      });
      walkAst(node, (child: ts.Node): void => {
        if (!ts.isVoidExpression(child)) return;
        const operand = child.expression;
        if (!operand) return;
        if (isPromiseType(operand, checker)) {
          findings.push({
            layer: 'R3', severity: 'MEDIUM', category: 'ASYNC_CORRECTNESS', file: construct.filePath, line: getLineNumber(sourceFile, child),
            evidence: child.getText(sourceFile), description: 'void operator applied to Promise — explicitly discarding promise, errors will be unhandled',
            correction: 'Await the promise with try/catch, or chain .then().catch() instead of void',
            runtimeImpact: 'Promise rejection is explicitly discarded — errors lost, no crash protection',
            confidence: 0.90, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
          });
        }
      });
      const safeSet = getSafeAsyncSet(ctx);
      walkAst(node, (child: ts.Node): void => {
        if (!ts.isCallExpression(child)) return;
        if (!checker) return;
        if (!isPromiseType(child, checker)) return;
        const parent = child.parent;
        if (ts.isAwaitExpression(parent)) return;
        if (ts.isReturnStatement(parent)) return;
        if (ts.isPropertyAccessExpression(parent)) return;
        if (ts.isVoidExpression(parent)) return;
        if (ts.isVariableDeclaration(parent)) return;
        if (ts.isBinaryExpression(parent)) return;
        if (ts.isCallExpression(parent)) return;
        if (ts.isConditionalExpression(parent)) return;
        if (ts.isArrayLiteralExpression(parent)) return;
        if (ts.isNewExpression(parent)) return;
        if (ts.isExpressionStatement(parent)) {
          const calleeText = child.expression.getText(sourceFile);
          const baseName = ts.isPropertyAccessExpression(child.expression) ? child.expression.name.text : ts.isIdentifier(child.expression) ? child.expression.text : calleeText;
          if (safeSet.has(calleeText) || safeSet.has(baseName)) return;
          const callLine = getLineNumber(sourceFile, child);
          const dup = findings.some((f: AuditFinding) => f.line === callLine && f.file === construct.filePath && f.category === 'ASYNC_CORRECTNESS');
          if (dup) return;
          findings.push({
            layer: 'R3', severity: 'MEDIUM', category: 'ASYNC_CORRECTNESS', file: construct.filePath, line: callLine,
            evidence: `${calleeText}() returns Promise but result is not awaited or handled`,
            description: `Floating promise — '${calleeText}' returns a Promise but result is discarded`,
            correction: `declare @safe-async or await/catch: add 'await' before the call, or handle with .then().catch(), or annotate callee with @safe-async`,
            runtimeImpact: 'Async operation may fail silently — no error handling, no completion check',
            confidence: 0.80, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
          });
        }
      });
      }
      callGraphAnalysis(construct, ctx, findings);
    } catch (e: unknown) { console.error('[R3AsyncCorrectness]', e); }
    return findings;
  },
};
