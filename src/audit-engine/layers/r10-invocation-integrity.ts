import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const FRAMEWORK_INVOKED = ['isRunning', 'isError', 'isGuard', 'isAction', 'guard', 'action', 'cond', 'onTransition', 'onEntry', 'onExit', 'handleEvent', 'onEvent'] as const;

function isFrameworkInvokedByName(name: string): boolean {
  if ((FRAMEWORK_INVOKED as readonly string[]).includes(name)) return true;
  if (name.startsWith('on') && name.length > 2 && /[A-Z]/.test(name[2])) return true;
  if (name.startsWith('handle') && name.length > 6) return true;
  return false;
}

function hasDecoratorDispatch(fnName: string, ctx: AnalysisContext): boolean {
  for (const c of ctx.constructs) {
    if (!c.node) continue;
    let found = false;
    walkAst(c.node, (child: ts.Node): void => {
      if (found) return;
      if (ts.isDecorator(child) && child.getText().includes(fnName)) found = true;
    });
    if (found) return true;
  }
  return false;
}

function isFrameworkInvoked(fnName: string, ctx: AnalysisContext): boolean {
  if (isFrameworkInvokedByName(fnName)) return true;
  if (hasDecoratorDispatch(fnName, ctx)) return true;
  return false;
}

function isTestOnly(fnName: string, ctx: AnalysisContext): boolean {
  let hasAny = false;
  let allTest = true;
  for (const [, entry] of ctx.callGraph.entries) {
    if (entry.calleeName === fnName || entry.calleeName.endsWith('.' + fnName)) {
      for (const cs of entry.callSites) {
        hasAny = true;
        const f = cs.callSiteFile;
        const isTestFile = f.includes('.test.') || f.endsWith('.test.ts') || f.includes('__tests__') || f.endsWith('.spec.ts');
        if (!isTestFile) allTest = false;
      }
    }
  }
  if (!hasAny) {
    for (const c of ctx.constructs) {
      if (!c.node) continue;
      const src = c.node.getSourceFile()?.fileName ?? c.filePath;
      if (!src.includes('.test.') && !src.includes('__tests__')) continue;
      let found = false;
      walkAst(c.node, (child: ts.Node): void => {
        if (found) return;
        if (ts.isIdentifier(child) && child.text === fnName) found = true;
      });
      if (found) { hasAny = true; }
    }
    if (!hasAny) return false;
    return true;
  }
  return allTest;
}

function hasDynamicAccess(fnName: string, ctx: AnalysisContext): boolean {
  for (const c of ctx.constructs) {
    if (!c.node) continue;
    let found = false;
    walkAst(c.node, (child: ts.Node): void => {
      if (found) return;
      if (ts.isElementAccessExpression(child)) {
        const arg = child.argumentExpression;
        if (ts.isStringLiteral(arg) && arg.text === fnName) found = true;
        if (ts.isNoSubstitutionTemplateLiteral(arg) && arg.text === fnName) found = true;
      }
      if (ts.isPropertyAssignment(child) && ts.isStringLiteral(child.name) && child.name.text === fnName) found = true;
      if (ts.isPropertyAccessExpression(child) && child.name.text === fnName) {
        const parent = child.parent;
        if (ts.isElementAccessExpression(parent)) { }
      }
    });
    if (found) return true;
  }
  return false;
}

function walkAst(root: ts.Node, visitor: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    visitor(current);
    ts.forEachChild(current, (child: ts.Node): void => { stack.push(child); });
  }
}

function walkFunctionScope(body: ts.Block, visitor: (node: ts.Node) => void): void {
  function visit(node: ts.Node): void {
    visitor(node);
    if (node !== body && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node))) return;
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(body, visit);
}

function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getFunctionBody(node: ts.Node): ts.Block | null {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) return node.body ?? null;
  if (ts.isArrowFunction(node)) return ts.isBlock(node.body) ? node.body : null;
  return null;
}

function isVoidOrUndefinedReturnType(node: ts.Node, checker: ts.TypeChecker | null, fallback: string | null): boolean {
  let typeNode: ts.TypeNode | null = null;
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) typeNode = node.type ?? null;
  if (typeNode) {
    if (typeNode.kind === ts.SyntaxKind.VoidKeyword) return true;
    if (typeNode.kind === ts.SyntaxKind.UndefinedKeyword) return true;
    if (typeNode.kind === ts.SyntaxKind.NeverKeyword) return true;
    if (ts.isUnionTypeNode(typeNode)) {
      const allNoValue = typeNode.types.every((t: ts.TypeNode) => t.kind === ts.SyntaxKind.VoidKeyword || t.kind === ts.SyntaxKind.UndefinedKeyword || t.kind === ts.SyntaxKind.NeverKeyword);
      if (allNoValue) return true;
    }
    if (ts.isTypeReferenceNode(typeNode) && typeNode.typeName.getText().toLowerCase() === 'promise') {
      const targs = typeNode.typeArguments;
      if (targs && targs.length === 1) {
        const inner = targs[0];
        if (inner.kind === ts.SyntaxKind.VoidKeyword || inner.kind === ts.SyntaxKind.UndefinedKeyword || inner.kind === ts.SyntaxKind.NeverKeyword) return true;
      }
    }
  }
  if (checker) {
    try {
      const sig = checker.getSignatureFromDeclaration(asSignature(node));
      if (sig) {
        const retType = checker.getReturnTypeOfSignature(sig);
        const typeStr = checker.typeToString(retType);
        if (typeStr === 'void' || typeStr === 'undefined' || typeStr === 'never') return true;
        if (typeStr === 'Promise<void>' || typeStr === 'Promise<undefined>' || typeStr === 'Promise<never>') return true;
        return false;
      }
    } catch (e: unknown) { console.warn('[r10-invocation-integrity] TypeChecker failed: ' + (e instanceof Error ? e.message : String(e))); }
  }
  if (fallback) {
    const rt = fallback.trim();
    if (rt === 'void' || rt === 'undefined' || rt === 'never') return true;
    if (rt === 'Promise<void>' || rt === 'Promise<undefined>' || rt === 'Promise<never>') return true;
    return false;
  }
  return true;
}

const CONSOLE_METHODS = new Set(['log', 'error', 'warn', 'info', 'debug']);
const LOGGING_METHODS = new Set(['error', 'warn', 'log', 'info', 'debug', 'fatal']);

function isLoggingCallExpression(call: ts.CallExpression): boolean {
  const expr = call.expression;
  if (!ts.isPropertyAccessExpression(expr)) return false;
  const methodName = expr.name.text;
  if (ts.isIdentifier(expr.expression) && expr.expression.text === 'console') return CONSOLE_METHODS.has(methodName);
  if (LOGGING_METHODS.has(methodName)) return true;
  return false;
}

const ENFORCEMENT_KEYWORDS = ['check', 'verify', 'validate', 'enforce', 'guard', 'gate', 'block', 'isallowed', 'canproceed', 'isblocked', 'shouldblock', 'authorize', 'permit', 'reject', 'filter', 'sanitize', 'transform', 'restrict', 'require', 'assert', 'ensure', 'confirm', 'authenticate', 'allow', 'deny'];

function hasSubstring(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  if (needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) { if (haystack[i + j] !== needle[j]) { matched = false; break; } }
    if (matched) return true;
  }
  return false;
}

function isEnforcementFunction(name: string, node?: ts.Node | null, checker?: ts.TypeChecker | null): boolean {
  if (node && checker) {
    try {
      const sig = checker.getSignatureFromDeclaration(asSignature(node));
      if (sig) {
        const retType = checker.getReturnTypeOfSignature(sig);
        if ((retType.flags & ts.TypeFlags.BooleanLike) !== 0) return true;
        const resultProps = retType.getProperties();
        for (const prop of resultProps) if (prop.name === 'valid' || prop.name === 'allowed' || prop.name === 'ok' || prop.name === 'passed') return true;
      }
    } catch (e: unknown) { console.warn('[r10-invocation-integrity] TypeChecker unavailable — falling through to name heuristic: ' + (e instanceof Error ? e.message : String(e))); }
  }
  const lower = name.toLowerCase();
  return ENFORCEMENT_KEYWORDS.some((kw: string) => hasSubstring(lower, kw));
}

interface CallSiteInfo { file: string; line: number; returnValueUsed: boolean; }

function findCallSites(fnName: string, ctx: AnalysisContext): CallSiteInfo[] {
  const sites: CallSiteInfo[] = [];
  for (const [, entry] of ctx.callGraph.entries) {
    if (entry.calleeName === fnName || entry.calleeName.endsWith('.' + fnName)) {
      for (const cs of entry.callSites) sites.push({ file: cs.callSiteFile, line: cs.callSiteLine, returnValueUsed: cs.returnValueUsed });
    }
  }
  return sites;
}

function isInvokedIndirectly(fnName: string, construct: CodeConstruct, ctx: AnalysisContext): boolean {
  if (isCalledViaThis(fnName, ctx)) return true;
  if (isXStateGuardReference(fnName, construct, ctx)) return true;
  if (isHookOrEventHandler(fnName, ctx)) return true;
  return false;
}

function isCalledViaThis(fnName: string, ctx: AnalysisContext): boolean {
  for (const c of ctx.constructs) {
    if (!c.node) continue;
    let found = false;
    walkAst(c.node, (child: ts.Node): void => {
      if (found) return;
      if (ts.isPropertyAccessExpression(child) && child.name.text === fnName && child.expression.kind === ts.SyntaxKind.ThisKeyword) found = true;
    });
    if (found) return true;
  }
  return false;
}

function isXStateGuardReference(fnName: string, construct: CodeConstruct, ctx: AnalysisContext): boolean {
  for (const c of ctx.constructs) {
    if (!c.node) continue;
    let found = false;
    const sf = c.node.getSourceFile();
    walkAst(c.node, (child: ts.Node): void => {
      if (found) return;
      if (ts.isPropertyAssignment(child)) {
        const propName = child.name.getText(sf);
        if ((propName === 'guard' || propName === 'cond') && ts.isIdentifier(child.initializer) && child.initializer.text === fnName) found = true;
      }
    });
    if (found) return true;
  }
  const parentNode = construct.parent?.node;
  if (parentNode) {
    const parentSf = parentNode.getSourceFile();
    let hasXStateKey = false;
    walkAst(parentNode, (child: ts.Node): void => {
      if (hasXStateKey) return;
      if (ts.isPropertyAssignment(child)) {
        const name = child.name.getText(parentSf);
        if (name === 'guard' || name === 'cond' || name === 'always' || name === 'target') hasXStateKey = true;
      }
    });
    if (hasXStateKey) return true;
  }
  return false;
}

function isHookOrEventHandler(fnName: string, ctx: AnalysisContext): boolean {
  for (const c of ctx.constructs) {
    if (!c.node) continue;
    let found = false;
    walkAst(c.node, (child: ts.Node): void => {
      if (found) return;
      if (ts.isPropertyAssignment(child)) {
        if ((ts.isStringLiteral(child.name) || ts.isNoSubstitutionTemplateLiteral(child.name)) && ts.isIdentifier(child.initializer) && child.initializer.text === fnName) found = true;
      }
      if (ts.isCallExpression(child)) {
        const args = child.arguments;
        if (ts.isPropertyAccessExpression(child.expression) && args.length >= 2 && ts.isStringLiteral(args[0]) && ts.isIdentifier(args[1]) && args[1].text === fnName) found = true;
      }
    });
    if (found) return true;
  }
  return false;
}

function detectDeadEnforcementFunction(construct: CodeConstruct, ctx: AnalysisContext): AuditFinding[] {
  const fnName = construct.name;
  if (!isEnforcementFunction(fnName, construct.node, ctx.checker)) return [];
  if (construct.type === ConstructType.ARROW_FUNCTION) {
    const parentType = construct.parent?.type;
    if (parentType && parentType !== ConstructType.VARIABLE_DECLARATION && parentType !== ConstructType.PROPERTY_ASSIGNMENT) return [];
  }
  const callSites = findCallSites(fnName, ctx);
  const modifierSet = new Set(construct.modifiers);
  const isExported = modifierSet.has('export');
  const isPrivate = modifierSet.has('private') || modifierSet.has('protected');
  const callGraphSize = ctx.callGraph.entries.size;
  const callGraphReliable = callGraphSize >= 50;
  if (isPrivate) return [];
  if (isFrameworkInvoked(fnName, ctx)) return [];
  if (isTestOnly(fnName, ctx)) return [];
  if (hasDynamicAccess(fnName, ctx)) return [];
  if (callSites.length === 0 && !isExported && isInvokedIndirectly(fnName, construct, ctx)) return [];
  if (callSites.length === 0 && !isExported) {
    const confidence = callGraphReliable ? 0.98 : 0.50;
    return [{
      layer: 'R10', severity: callGraphReliable ? 'CRITICAL' : 'MEDIUM', category: 'INVOCATION_INTEGRITY', file: construct.filePath, line: construct.line,
      evidence: 'Function ' + fnName + ' has 0 call sites and is not exported (call graph: ' + callGraphSize + ' entries)',
      description: 'Enforcement function "' + fnName + '" is never called — dead code that provides no protection',
      correction: 'Add calls to ' + fnName + '() at enforcement points, or remove if unused',
      runtimeImpact: 'Enforcement exists in source but never executes — provides zero runtime protection',
      confidence, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
    }];
  }
  if (callSites.length > 0 && callGraphReliable) {
    const allDiscarded = callSites.every((cs: CallSiteInfo) => !cs.returnValueUsed);
    const returnsVoidOrUndefined = isVoidOrUndefinedReturnType(construct.node, ctx.checker, construct.returnType);
    if (allDiscarded && !returnsVoidOrUndefined) {
      return [{
        layer: 'R10', severity: 'HIGH', category: 'INVOCATION_INTEGRITY', file: construct.filePath, line: construct.line,
        evidence: fnName + '() called ' + callSites.length + ' times — return value discarded at every call site',
        description: 'Enforcement function "' + fnName + '" returns a value but it is never checked — result ignored',
        correction: 'Capture and check the return value: const result = ' + fnName + '(); if (!result.valid) ...',
        runtimeImpact: 'Enforcement function runs but its verdict is ignored — same as not running it',
        confidence: 0.85, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
      }];
    }
  }
  return [];
}

function detectReturnTypeViolations(construct: CodeConstruct, ctx: AnalysisContext, node: ts.Node): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const checker = ctx.checker;
  const fnBody = getFunctionBody(node);
  if (!fnBody) return findings;
  const returnsVoidOrUndefined = isVoidOrUndefinedReturnType(node, checker, construct.returnType);
  if (returnsVoidOrUndefined) return findings;
  const returnStatements: ts.ReturnStatement[] = [];
  walkFunctionScope(fnBody, (child: ts.Node): void => { if (ts.isReturnStatement(child)) returnStatements.push(child); });
  const sf = node.getSourceFile();
  if (returnStatements.length === 0) {
    findings.push({
      layer: 'R10', severity: 'HIGH', category: 'INVOCATION_INTEGRITY', file: construct.filePath, line: construct.line,
      evidence: 'Function ' + construct.name + ' has non-void return type but no ReturnStatement in body',
      description: 'Function "' + construct.name + '" declares a non-void return type but never returns a value',
      correction: 'Add a return statement with the appropriate value',
      runtimeImpact: 'Function returns undefined implicitly despite declaring a value return type',
      confidence: 0.90, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
    });
    return findings;
  }
  for (const ret of returnStatements) {
    if (!ret.expression) {
      findings.push({
        layer: 'R10', severity: 'HIGH', category: 'INVOCATION_INTEGRITY', file: construct.filePath, line: getLineNumber(sf, ret),
        evidence: 'ReturnStatement with no expression in non-void function ' + construct.name,
        description: 'Function "' + construct.name + '" returns undefined via bare return despite non-void return type',
        correction: 'Return the expected value instead of a bare return;',
        runtimeImpact: 'Callers receive undefined instead of the expected typed value',
        confidence: 0.88, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
      });
    }
  }

  return findings;
}

function detectCatchBlockViolations(construct: CodeConstruct, node: ts.Node): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const fnBody = getFunctionBody(node);
  if (!fnBody) return findings;
  const sf = node.getSourceFile();
  walkFunctionScope(fnBody, (child: ts.Node): void => {
    if (!ts.isCatchClause(child)) return;
    const catchBlock = child.block;
    if (catchBlock.statements.length === 0) {
      findings.push({
        layer: 'R10', severity: 'HIGH', category: 'INVOCATION_INTEGRITY', file: construct.filePath, line: getLineNumber(sf, child),
        evidence: 'CatchClause with empty block (0 statements)', description: 'Empty catch block silently swallows errors',
        correction: 'Add error handling: log, rethrow, or handle the caught error',
        runtimeImpact: 'Errors are silently swallowed — failures become invisible',
        confidence: 0.92, constructType: ConstructType.CATCH_CLAUSE, callGraphRef: null, evidenceSuppressed: false,
      });
      return;
    }
    const throwStatements: ts.ThrowStatement[] = [];
    let hasLoggingCall = false;
    for (const stmt of catchBlock.statements) {
      walkAst(stmt, (inner: ts.Node): void => {
        if (ts.isThrowStatement(inner)) throwStatements.push(inner);
        if (ts.isCallExpression(inner) && isLoggingCallExpression(inner)) hasLoggingCall = true;
      });
    }
    if (throwStatements.length > 0 && !hasLoggingCall) {
      const hasNewErrorThrow = throwStatements.some((t: ts.ThrowStatement) => t.expression && ts.isNewExpression(t.expression));
      if (hasNewErrorThrow) {
        findings.push({
          layer: 'R10', severity: 'MEDIUM', category: 'INVOCATION_INTEGRITY', file: construct.filePath, line: getLineNumber(sf, child),
          evidence: 'CatchClause throws new error without logging original context',
          description: 'Error is caught and replaced with a new throw — original context is lost',
          correction: 'Log the original error before rethrowing, or rethrow the caught error directly',
          runtimeImpact: 'Original error context is lost — debugging becomes harder',
          confidence: 0.70, constructType: ConstructType.CATCH_CLAUSE, callGraphRef: null, evidenceSuppressed: false,
        });
      }
    }
  });
  return findings;
}

function asSignature(node: ts.Node): ts.SignatureDeclaration {
  if (node !== undefined && node !== null) return node as ts.SignatureDeclaration;
  throw new Error('[r10] a signature declaration node was expected');
}
export const R10_INVOCATION_INTEGRITY: LayerRule = {
  layer: 'R10',
  name: 'Invocation Integrity',
  description: 'Detects dead enforcement functions, empty catch blocks, inconsistent return types, missing returns, swallowed errors, and discarded return values via TypeScript AST analysis',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.METHOD_DECLARATION, ConstructType.ARROW_FUNCTION],
  enabled: true,
  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    if (!construct.isDefinition) return [];
    try {
      const findings: AuditFinding[] = [];
      const deadCodeFindings = detectDeadEnforcementFunction(construct, ctx);
      findings.push(...deadCodeFindings);
      const node = construct.node;
      if (!node) return findings;
      const returnTypeFindings = detectReturnTypeViolations(construct, ctx, node);
      findings.push(...returnTypeFindings);
      const catchFindings = detectCatchBlockViolations(construct, node);
      findings.push(...catchFindings);
      return findings;
    } catch (e: unknown) { console.error('[R10InvocationIntegrity]', e); return []; }
  },
};
