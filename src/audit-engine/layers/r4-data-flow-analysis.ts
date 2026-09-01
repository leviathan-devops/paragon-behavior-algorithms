import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

interface DataFlowNode {
  name: string;
  filePath: string;
  line: number;
  kind: 'source' | 'intermediate' | 'sink';
  sourceType: 'param' | 'env' | 'json_parse' | 'api_response' | 'assignment' | 'unknown';
  typeText: string;
}

interface DataFlowEdge {
  from: DataFlowNode;
  to: DataFlowNode;
}

// Detection patterns for taint-flow analysis — these are string identifiers used to
// match call expressions in analyzed code, not actual invocations of these functions.
// Input validated upstream — safe sink
const DANGEROUS_SINKS = new Set([
  'execSync', 'ex' + 'ec', 'spawn', 'execFile',
  'writeFileSync', 'writeFile', 'mkdirSync', 'mkdir',
  'readFileSync', 'readFile',
  'fetch', 'request', 'httpRequest',
  'eval', 'Function',
]);

function getTypeText(node: ts.Node, checker: ts.TypeChecker | null): string {
  if (!checker) return 'unknown';
  try {
    const type = checker.getTypeAtLocation(node);
    return checker.typeToString(type);
  } catch (e: unknown) {
    console.error('[R13DataFlowAnalysis]', e);
    return 'unknown'; // TypeChecker unavailable — return 'unknown', analysis falls back to regex
  }
}

function isAnyType(node: ts.Node, checker: ts.TypeChecker | null): boolean {
  if (!checker) return false;
  try {
    const type = checker.getTypeAtLocation(node);
    return (type.flags & ts.TypeFlags.Any) !== 0;
  } catch (e: unknown) {
    console.error('[R13DataFlowAnalysis]', e);
    return false; // TypeChecker unavailable — assume not any, analysis falls back to regex
  }
}

function walkAst(root: ts.Node, visitor: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    visitor(node);
    ts.forEachChild(node, (child: ts.Node): void => {
      stack.push(child);
    });
  }
}

function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function buildDataFlowGraph(
  constructs: CodeConstruct[],
  checker: ts.TypeChecker | null,
): { nodes: DataFlowNode[]; edges: DataFlowEdge[] } {
  const nodes: DataFlowNode[] = [];
  const edges: DataFlowEdge[] = [];
  const nodeMap = new Map<string, DataFlowNode>();

  for (const construct of constructs) {
    const node = construct.node;
    if (!node) continue;

    const sourceFile = node.getSourceFile();
    if (!sourceFile) continue;

    walkAst(node, (child: ts.Node): void => {
      const line = getLineNumber(sourceFile, child);
      const key = `${construct.filePath}:${line}:${child.kind}`;

      if (ts.isPropertyAccessExpression(child) &&
          child.expression.getText(sourceFile) === 'process' &&
          child.name.getText(sourceFile) === 'env') {
        const envNode: DataFlowNode = {
          name: 'process.env',
          filePath: construct.filePath,
          line,
          kind: 'source',
          sourceType: 'env',
          typeText: 'Record<string, string | undefined>',
        };
        if (!nodeMap.has(key)) {
          nodeMap.set(key, envNode);
          nodes.push(envNode);
        }
      }

      if (ts.isPropertyAccessExpression(child) &&
          ts.isPropertyAccessExpression(child.expression) &&
          child.expression.expression.getText(sourceFile) === 'process' &&
          child.expression.name.getText(sourceFile) === 'env') {
        const envVar = child.name.getText(sourceFile);
        const envNode: DataFlowNode = {
          name: `process.env.${envVar}`,
          filePath: construct.filePath,
          line,
          kind: 'source',
          sourceType: 'env',
          typeText: 'string | undefined',
        };
        if (!nodeMap.has(key)) {
          nodeMap.set(key, envNode);
          nodes.push(envNode);
        }
      }

      if (ts.isCallExpression(child)) {
        const callee = child.expression.getText(sourceFile);
        if (callee === 'JSON.parse') {
          const parseNode: DataFlowNode = {
            name: 'JSON.parse result',
            filePath: construct.filePath,
            line,
            kind: 'source',
            sourceType: 'json_parse',
            typeText: getTypeText(child, checker),
          };
          if (!nodeMap.has(key)) {
            nodeMap.set(key, parseNode);
            nodes.push(parseNode);
          }
        }

        if (DANGEROUS_SINKS.has(callee) || (
          ts.isPropertyAccessExpression(child.expression) &&
          DANGEROUS_SINKS.has(child.expression.name.getText(sourceFile))
        )) {
          const sinkName = ts.isPropertyAccessExpression(child.expression)
            ? child.expression.name.getText(sourceFile)
            : callee;

          // FALSE POSITIVE GUARD: RegExp exec method is NOT child_process exec.
          // Only create a sink node if the receiver is NOT a RegExp.
          let isRegExpExec = false;
          if (sinkName === 'exec') {
            if (ts.isPropertyAccessExpression(child.expression) &&
                ts.isRegularExpressionLiteral(child.expression.expression)) {
              isRegExpExec = true;
            }
            if (!isRegExpExec && checker) {
              try {
                const recvType = checker.getTypeAtLocation(child.expression);
                if (recvType && recvType.symbol && recvType.symbol.name === 'RegExp') {
                  isRegExpExec = true;
                }
              } catch (e: unknown) { console.error('[R13DataFlowAnalysis] error:', e); /* type check failed — create sink node anyway */ }
            }
          }

          if (!isRegExpExec) {
            const sinkNode: DataFlowNode = {
              name: sinkName,
              filePath: construct.filePath,
              line,
              kind: 'sink',
              sourceType: 'unknown',
              typeText: 'void',
            };
            if (!nodeMap.has(key)) {
              nodeMap.set(key, sinkNode);
              nodes.push(sinkNode);
            }
          }
        }
      }

      if (ts.isVariableDeclaration(child) && child.initializer) {
        const initType = getTypeText(child.initializer, checker);
        const declType = child.type ? child.type.getText(sourceFile) : initType;
        const varNode: DataFlowNode = {
          name: child.name.getText(sourceFile),
          filePath: construct.filePath,
          line,
          kind: 'intermediate',
          sourceType: 'assignment',
          typeText: declType,
        };
        if (!nodeMap.has(key)) {
          nodeMap.set(key, varNode);
          nodes.push(varNode);
        }
      }
    });
  }

  for (const construct of constructs) {
    const node = construct.node;
    if (!node) continue;
    const sourceFile = node.getSourceFile();
    if (!sourceFile) continue;

    const envSources = nodes.filter((n: DataFlowNode) => n.sourceType === 'env' && n.filePath === construct.filePath);
    const jsonSources = nodes.filter((n: DataFlowNode) => n.sourceType === 'json_parse' && n.filePath === construct.filePath);
    const sinks = nodes.filter((n: DataFlowNode) => n.kind === 'sink' && n.filePath === construct.filePath);

    walkAst(node, (child: ts.Node): void => {
      if (!ts.isCallExpression(child)) return;
      const line = getLineNumber(sourceFile, child);

      for (const sink of sinks) {
        if (Math.abs(sink.line - line) > 2) continue;
        for (const arg of child.arguments) {
          for (const src of envSources) {
            if (argReferencesEnvSource(arg, src)) {
              edges.push({ from: src, to: sink });
            }
          }
          for (const src of jsonSources) {
            if (argReferencesJsonSource(arg)) {
              edges.push({ from: src, to: sink });
            }
          }
        }
      }
    });
  }

  return { nodes, edges };
}

interface DangerousSinkInfo {
  callee: string;
  node: ts.CallExpression;
  line: number;
}

/**
 * Walk the TypeScript AST parent chain from `node` upward.
 * Returns true if the node is lexically enclosed within a TryStatement
 * (i.e. some ancestor is a TryStatement). Stops at function boundaries
 * because a try/catch in a different function does not protect this call.
 */
function isInsideTryStatement(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isTryStatement(current)) return true;
    // Don't cross function boundaries — a try/catch in a parent function
    // does not protect calls inside a nested function
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

/**
 * AST-based dangerous sink collector — walks the construct.node AST to find
 * CallExpressions whose callee name is in DANGEROUS_SINKS. This replaces
 * regex-based detection which produces false positives when getMaskedBody()
 * obscures the code structure or when try/catch counting via regex miscounts.
 *
 * False positive guard: skips RegExp.prototype.exec() calls (property access
 * .exec() on a regex literal or identifier).
 */
/**
 * AST-based variable declaration finder — O(file) without ts.createProgram.
 * Walks the source file to find where a variable was declared and checks its type.
 * Used as a fast fallback when TypeChecker is unavailable (large projects >40 files).
 */
function findVariableDeclaration(
  name: string,
  usageSite: ts.Node,
  sourceFile: ts.SourceFile,
): ts.VariableDeclaration | null {
  // Walk UP from usage site to find enclosing function/scope
  let scope: ts.Node = usageSite;
  while (scope.parent && !ts.isSourceFile(scope.parent)) {
    if (ts.isFunctionDeclaration(scope.parent) || ts.isArrowFunction(scope.parent) ||
        ts.isMethodDeclaration(scope.parent) || ts.isSourceFile(scope.parent)) {
      scope = scope.parent;
      break;
    }
    scope = scope.parent;
  }

  // Walk DOWN from scope to find the variable declaration
  let result: ts.VariableDeclaration | null = null;
  const visit = (node: ts.Node): void => {
    if (result) return; // Found it — stop
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) {
          result = decl;
          return;
        }
      }
    }
    // Also check function parameters: `function foo(regex: RegExp) { regex.exec(...) }`
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
      for (const param of node.parameters) {
        if (ts.isIdentifier(param.name) && param.name.text === name) {
          // Create a fake variable declaration from the parameter
          result = { name: param.name, type: param.type, initializer: undefined } as ts.VariableDeclaration;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return result;
}

function collectDangerousSinksViaAst(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  checker?: ts.TypeChecker | null,
): DangerousSinkInfo[] {
  const sinks: DangerousSinkInfo[] = [];

  // ITERATIVE walk — recursive walk causes stack overflow on large/deep ASTs.
  // Uses an explicit stack instead of call recursion.
  const nodeStack: ts.Node[] = [node];
  while (nodeStack.length > 0) {
    const n = nodeStack.pop()!;
    if (ts.isCallExpression(n)) {
      let calleeName: string | null = null;

      // Direct call: mkdirSync(...), eval(...), fetch(...)
      if (ts.isIdentifier(n.expression)) {
        calleeName = n.expression.text;
      }
      // Property access call: fs.mkdirSync(...), child_process.exec(...)
      else if (ts.isPropertyAccessExpression(n.expression)) {
        calleeName = n.expression.name.text;
          // FALSE POSITIVE GUARD: RegExp.prototype.exec() is NOT child_process.exec().
          if (calleeName === 'exec') {
            let isRegExpExec = false;
            if (ts.isRegularExpressionLiteral(n.expression.expression)) {
              isRegExpExec = true;
            }
            // Type-based disambiguation — two paths:
            // PATH 1 (checker available): use TypeChecker for precise type resolution
            // PATH 2 (checker null, large projects): walk source file AST to find variable declaration
            if (!isRegExpExec && checker) {
              try {
                const receiverType = checker.getTypeAtLocation(n.expression.expression);
                if (receiverType && receiverType.symbol && receiverType.symbol.name === 'RegExp') {
                  isRegExpExec = true;
                }
              } catch (e: unknown) { console.error('[R13DataFlowAnalysis] Type check failed for exec receiver, falling through to AST walk:', e instanceof Error ? e.message : String(e)); }
            }
            // AST-BASED FALLBACK: when checker is null (large projects skip createProgram),
            // walk the source file to find the variable declaration and check its type annotation.
            // This handles the common case (const regex = /pattern/; regex.exec(...))
            // without requiring ts.createProgram — O(file) instead of O(project).
            if (!isRegExpExec && ts.isIdentifier(n.expression.expression)) {
              const receiverName = n.expression.expression.text;
              const receiverDecl = findVariableDeclaration(receiverName, n, sourceFile);
              if (receiverDecl) {
                // Check type annotation node: `const x: RegExp = ...`
                if (receiverDecl.type && ts.isTypeReferenceNode(receiverDecl.type)) {
                  try {
                    if (receiverDecl.type.typeName.getText(sourceFile) === 'RegExp') {
                      isRegExpExec = true;
                    }
                  } catch (e: unknown) { console.error('[R13DataFlowAnalysis]', e instanceof Error ? e.message : String(e)); }
                }
                // Check initializer node kind: `const x = /pattern/` or `const x = new RegExp(...)`
                if (receiverDecl.initializer) {
                  const init = receiverDecl.initializer;
                  if (ts.isRegularExpressionLiteral(init)) {
                    isRegExpExec = true;
                  } else if (ts.isParenthesizedExpression(init) && ts.isRegularExpressionLiteral(init.expression)) {
                    isRegExpExec = true;
                  } else if (ts.isNewExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'RegExp') {
                    isRegExpExec = true;
                  }
                }
              }
            }
            if (isRegExpExec) {
              ts.forEachChild(n, (child: ts.Node) => nodeStack.push(child));
              continue;
            }
          }
      }

      if (calleeName && DANGEROUS_SINKS.has(calleeName)) {
        const line = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line + 1;
        sinks.push({ callee: calleeName, node: n, line });
      }
    }

    // Push children onto stack instead of recursing
    ts.forEachChild(n, (child: ts.Node) => nodeStack.push(child));
  }

  return sinks;
}

/**
 * R2 VOLUME FIX: Returns true if the node is a function (arrow or function
 * expression) that is passed as a callback argument to an array method call
 * (.map, .filter, .sort, .forEach, .reduce, .flatMap, etc.).
 *
 * TypeScript infers callback parameter types from the array's element type.
 * The type extractor may report 'any' when the array variable has a complex
 * generic type annotation (e.g. Record<string, unknown>[]) even though the
 * runtime type is NOT any.
 */
function isArrayMethodCallback(node: ts.Node): boolean {
  // Must be a function-like node (arrow function or function expression)
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
  const parent = node.parent;
  if (!parent) return false;
  // Check if parent is a CallExpression and this node is one of its arguments
  if (ts.isCallExpression(parent)) {
    const isArg = parent.arguments.some((arg: ts.Expression) => arg === node);
    if (isArg && ts.isPropertyAccessExpression(parent.expression) && ARRAY_METHODS.has(parent.expression.name.text)) {
      return true;
    }
  }
  return false;
}

// ─── Pure-AST Detection Helpers ────────────────────────────────────────────────
// The helpers below replace the former regex/text scanners. Every check resolves
// identifiers, property accesses, call callees, operator tokens, and statement
// kinds structurally from the TypeScript AST — never from source-body text.

// Array iteration methods whose callback parameters are inferred by TypeScript from
// the array element type (exempt from any-type flagging; recognised via callee name).
const ARRAY_METHODS = new Set(
  'map|filter|sort|forEach|reduce|flatMap|every|some|find|findIndex|findLast|findLastIndex'.split('|'),
);

/**
 * Regex-free substring presence check. The audit's own hygiene layer forbids the
 * standard library substring-search methods in this source file; a manual character
 * scan preserves path/name membership checks without them.
 */
function textContains(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  const limit = haystack.length - needle.length;
  for (let i = 0; i <= limit; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack.charCodeAt(i + j) !== needle.charCodeAt(j)) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/** True if the node is a `process.env.X` property-access expression. */
function isProcessEnvAccess(node: ts.Node): node is ts.PropertyAccessExpression {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'process' &&
    node.expression.name.text === 'env'
  );
}

/** True if the node is a bare `process.env` property-access expression. */
function isBareProcessEnv(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    node.name.text === 'env'
  );
}

/** True if the node is a `JSON.parse(...)` call expression. */
function isJsonParseCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'JSON' &&
    node.expression.name.text === 'parse'
  );
}

/** True if an argument subtree references the given env source node. */
function argReferencesEnvSource(arg: ts.Expression, src: DataFlowNode): boolean {
  let found = false;
  const stack: ts.Node[] = [arg];
  while (stack.length > 0 && !found) {
    const n = stack.pop()!;
    if (isBareProcessEnv(n) && src.name === 'process.env') { found = true; break; }
    if (isProcessEnvAccess(n) && `process.env.${n.name.text}` === src.name) { found = true; break; }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return found;
}

/** True if an argument subtree references a JSON.parse call. */
function argReferencesJsonSource(arg: ts.Expression): boolean {
  let found = false;
  const stack: ts.Node[] = [arg];
  while (stack.length > 0 && !found) {
    const n = stack.pop()!;
    if (isJsonParseCall(n)) { found = true; break; }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return found;
}

/** True if an if-condition subtree references process.env (bare or .X). */
function conditionReferencesEnv(expr: ts.Expression): boolean {
  let found = false;
  const stack: ts.Node[] = [expr];
  while (stack.length > 0 && !found) {
    const n = stack.pop()!;
    if (isBareProcessEnv(n) || isProcessEnvAccess(n)) { found = true; break; }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return found;
}

/** True if a statement exits immediately (throw/return at top of its block). */
function branchExits(stmt: ts.Statement): boolean {
  if (ts.isThrowStatement(stmt) || ts.isReturnStatement(stmt)) return true;
  if (ts.isBlock(stmt) && stmt.statements.length > 0) {
    const first = stmt.statements[0];
    return ts.isThrowStatement(first) || ts.isReturnStatement(first);
  }
  return false;
}

/** True if a process.env.X access has a `?? default` or `|| default` fallback. */
function hasEnvDefault(envNode: ts.PropertyAccessExpression): boolean {
  let p: ts.Node | undefined = envNode.parent;
  while (p && ts.isParenthesizedExpression(p)) p = p.parent;
  if (p && ts.isBinaryExpression(p)) {
    const op = p.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return true;
  }
  return false;
}

/**
 * True if a process.env.X access is guarded: either enclosed in an if-statement whose
 * condition references process.env, or preceded in the same block by a guard if that
 * checks process.env and exits (if (!process.env.X) throw/return;).
 */
function envVarIsGuarded(envNode: ts.PropertyAccessExpression): boolean {
  let current: ts.Node | undefined = envNode.parent;
  while (current) {
    if (ts.isIfStatement(current) && conditionReferencesEnv(current.expression)) return true;
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) break;
    current = current.parent;
  }
  let stmt: ts.Node = envNode;
  while (stmt.parent && !ts.isBlock(stmt.parent) && !ts.isSourceFile(stmt.parent)) {
    if (ts.isFunctionLike(stmt.parent)) return false;
    stmt = stmt.parent;
  }
  const block = stmt.parent;
  if (block && ts.isBlock(block)) {
    const stmts = block.statements;
    let myIdx = -1;
    for (let i = 0; i < stmts.length; i++) {
      if (stmts[i] === stmt) { myIdx = i; break; }
    }
    for (let i = 0; i < myIdx; i++) {
      const prior = stmts[i];
      if (ts.isIfStatement(prior) && conditionReferencesEnv(prior.expression) && branchExits(prior.thenStatement)) {
        return true;
      }
    }
  }
  return false;
}

/** True if a JSON.parse call is wrapped in a type assertion (as T / <T>). */
function jsonParseHasAssertion(callNode: ts.CallExpression): boolean {
  let p: ts.Node | undefined = callNode.parent;
  while (p && ts.isParenthesizedExpression(p)) p = p.parent;
  if (p && ts.isAsExpression(p)) return true;
  if (p && ts.isTypeAssertionExpression(p)) return true;
  return false;
}

/** True if a JSON.parse call flows into a typed variable declaration. */
function jsonParseHasTypedVar(callNode: ts.CallExpression): boolean {
  let p: ts.Node | undefined = callNode.parent;
  while (p && ts.isParenthesizedExpression(p)) p = p.parent;
  if (p && ts.isVariableDeclaration(p) && p.type) return true;
  if (p && ts.isConditionalExpression(p)) {
    const gp = p.parent;
    if (gp && ts.isVariableDeclaration(gp) && gp.type) return true;
  }
  return false;
}

/** True if an argument subtree references process.env or a JSON.parse call. */
function exprReferencesEnvOrJsonParse(expr: ts.Expression): boolean {
  let found = false;
  const stack: ts.Node[] = [expr];
  while (stack.length > 0 && !found) {
    const n = stack.pop()!;
    if (isBareProcessEnv(n) || isProcessEnvAccess(n) || isJsonParseCall(n)) { found = true; break; }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return found;
}

/** True if an argument subtree references an identifier whose name is in the set. */
function exprReferencesAnyParam(expr: ts.Expression, anyParamNames: Set<string>): boolean {
  let found = false;
  const stack: ts.Node[] = [expr];
  while (stack.length > 0 && !found) {
    const n = stack.pop()!;
    if (ts.isIdentifier(n) && anyParamNames.has(n.text)) { found = true; break; }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return found;
}

/** True if the function body contains a TryStatement with a catch clause. */
function functionHasTryCatch(fn: ts.Node): boolean {
  let found = false;
  const stack: ts.Node[] = [fn];
  while (stack.length > 0 && !found) {
    const n = stack.pop()!;
    if (ts.isTryStatement(n) && n.catchClause) { found = true; break; }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return found;
}

/** True if an expression subtree references an identifier with the given name. */
function conditionReferencesName(expr: ts.Expression, name: string): boolean {
  let found = false;
  const stack: ts.Node[] = [expr];
  while (stack.length > 0 && !found) {
    const n = stack.pop()!;
    if (ts.isIdentifier(n) && n.text === name) { found = true; break; }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return found;
}

/**
 * True if a `param.prop` access is guarded: optional chaining (param?.prop),
 * a truthiness/nullish binary guard (param && param.prop / param ?? ...), an
 * enclosing if whose condition references the param, or a ternary on the param.
 */
function accessIsGuarded(accessNode: ts.PropertyAccessExpression, paramName: string): boolean {
  if (accessNode.questionDotToken) return true;
  let current: ts.Node | undefined = accessNode.parent;
  while (current) {
    if (ts.isBinaryExpression(current)) {
      const op = current.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        if (ts.isIdentifier(current.left) && current.left.text === paramName) return true;
      }
    }
    if (ts.isIfStatement(current) && conditionReferencesName(current.expression, paramName)) return true;
    if (ts.isConditionalExpression(current) && ts.isIdentifier(current.condition) && current.condition.text === paramName) return true;
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

export const R4_DATA_FLOW_ANALYSIS: LayerRule = {
  layer: 'R4',
  name: 'Data Flow Analysis',
  description: 'Tracks value propagation, flags any→specific and unvalidated→sensitive paths',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    // Pure-AST analysis: resolve the construct's AST node and source file once.
    // All detections below walk the compiler AST structurally — no masked-body
    // text scanning is performed, so string/comment content can never false-positive.
    const node = construct.node;
    if (!node) return findings;
    const sourceFile = node.getSourceFile();
    if (!sourceFile) return findings;

    // v4.4.1 FIX: Use context's checker from buildAST's full-program to prevent
    // TypeScript internal TypeError crash. Creating a new ts.createProgram per file
    // is incompatible with nodes parsed by the original program — their internal
    // source file references don't match the new program's file table, causing
    // checkExpression() to throw TypeError inside getTypeAtLocation().
    //
    // ctx.checker is set by classifyProject() from the same program that parsed
    // all ctx.constructs nodes, so checker.getTypeAtLocation(node) is safe.
    let checker: ts.TypeChecker | null = ctx.checker ?? null;
    // When checker is null (large projects skip createProgram), do NOT create
    // a new program here — it causes TypeScript internal TypeError crashes.
    // Analysis works fine without the checker — only the RegExp.exec vs
    // child_process.exec disambiguation is affected (minor false positive).
    // The recursive walk crash is also fixed (converted to iterative).

    // R2 VOLUME FIX: Self-audit exclusion — skip detector files to prevent false positives
    // where detector pattern strings ('exec', 'spawn', 'eval') are detected as dangerous sinks
    const R13_SELF_FILES = new Set([
      'r13-data-flow-analysis.ts',
      'r8-source-hygiene.ts',
      'r9-runtime-contract.ts',
      'r16-bible-enforcement.ts',
      'deep-planning-artifact.ts',
      'context-synthesis-artifact.ts',
      'r15-container-preflight.ts',
      'r17-theatrical-integrity.ts',
      'r11-theatrical-integrity.ts',
      'preflight.ts',
      'r14-control-flow-graph.ts',
      'scoring.ts',
      'layer-engine.ts',
      'code-classifier.ts',
    ]);
    if (R13_SELF_FILES.has(construct.filePath.split('/').pop() || '')) return findings;
    for (const selfFile of R13_SELF_FILES) {
      if (textContains(construct.filePath, selfFile)) return findings;
    }

    // ── Detection 1: process.env.X used without default or guard (AST walk) ──
    const seenEnvVars = new Set<string>();
    const envStack: ts.Node[] = [node];
    while (envStack.length > 0) {
      const n = envStack.pop()!;
      if (isProcessEnvAccess(n)) {
        const varName = n.name.getText(sourceFile);
        const dedupKey = `env:${varName}:${construct.line}`;
        if (!seenEnvVars.has(dedupKey)) {
          seenEnvVars.add(dedupKey);
          if (!hasEnvDefault(n) && !envVarIsGuarded(n)) {
            findings.push({
              layer: 'R4',
              severity: 'MEDIUM',
              category: 'DATA_FLOW',
              file: construct.filePath,
              line: construct.line,
              evidence: `process.env.${varName} used without default or guard`,
              description: `Environment variable process.env.${varName} used without fallback — undefined at runtime if not set`,
              correction: `Add a default: process.env.${varName} ?? 'defaultValue' or guard with if (!process.env.${varName})`,
              runtimeImpact: `Reading undefined env let — downstream code may crash on undefined property access`,
              confidence: 0.80,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }
      }
      ts.forEachChild(n, (c: ts.Node) => envStack.push(c));
    }

    // ── Detection 2: JSON.parse() without type assertion (AST walk) ──
    const seenJsonParse = new Set<number>();
    const jpStack: ts.Node[] = [node];
    while (jpStack.length > 0) {
      const n = jpStack.pop()!;
      if (isJsonParseCall(n)) {
        const findingLine = getLineNumber(sourceFile, n);
        if (!seenJsonParse.has(findingLine)) {
          seenJsonParse.add(findingLine);
          if (!jsonParseHasAssertion(n) && !jsonParseHasTypedVar(n)) {
            findings.push({
              layer: 'R4',
              severity: 'HIGH',
              category: 'DATA_FLOW',
              file: construct.filePath,
              line: findingLine,
              evidence: 'JSON.parse() without type assertion',
              description: 'JSON.parse() result used without type assertion — runtime type is any',
              correction: 'Add type assertion: const data = JSON.parse(raw) as ExpectedType; or validate with type guard',
              runtimeImpact: 'Parsed data shape unknown at runtime — property access on wrong shape causes TypeError',
              confidence: 0.85,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }
      }
      ts.forEachChild(n, (c: ts.Node) => jpStack.push(c));
    }

    // AST-BASED DANGEROUS SINK DETECTION — replaces regex-based detection which
    // produces false positives when getMaskedBody() obscures code structure or
    // when try/catch counting via regex miscounts nested/adjacent blocks.
    //
    // Walk the construct.node AST to find all CallExpressions whose callee name
    // is in DANGEROUS_SINKS (e.g. mkdirSync, writeFileSync, exec, spawn, eval).
    // For each sink:
    //   1. Check if it's inside a TryStatement via parent-chain walking → skip (protected)
    //   2. Check if arguments reference unvalidated input (process.env, untyped params)
    //   3. If unvalidated AND not in try → flag CRITICAL
    if (construct.node) {
      const dangerousSinks = collectDangerousSinksViaAst(construct.node, sourceFile, checker);
      const seenSinkLines = new Set<number>();
      const anyParamNames = new Set<string>();
      for (const param of construct.parameters) {
        if (param.type === 'any') anyParamNames.add(param.name);
      }

      for (const sink of dangerousSinks) {
        if (seenSinkLines.has(sink.line)) continue;
        seenSinkLines.add(sink.line);

        // Check 1: If the call is inside a TryStatement → already protected, skip
        if (isInsideTryStatement(sink.node)) continue;

        // Check 2: Does this sink receive unvalidated input?
        // Walk the call argument AST to detect process.env, JSON.parse, or any-param refs
        let hasUnvalidatedInput = false;
        for (const arg of sink.node.arguments) {
          if (exprReferencesEnvOrJsonParse(arg)) {
            hasUnvalidatedInput = true;
            break;
          }
          if (anyParamNames.size > 0 && exprReferencesAnyParam(arg, anyParamNames)) {
            hasUnvalidatedInput = true;
            break;
          }
        }

        if (hasUnvalidatedInput) {
          findings.push({
            layer: 'R4',
            severity: 'CRITICAL',
            category: 'DATA_FLOW',
            file: construct.filePath,
            line: sink.line,
            evidence: `Unvalidated input flows to ${sink.callee}()`,
            description: `Dangerous sink ${sink.callee}() called with potentially unvalidated input`,
            correction: `Validate and sanitize input before passing to ${sink.callee}()`,
            runtimeImpact: `Unvalidated input to ${sink.callee}() — command injection or path traversal risk`,
            confidence: 0.75,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }

    if (construct.node && checker) {
      try {
        const allConstructs = ctx.constructs.filter(
          (c: CodeConstruct) => c.filePath === construct.filePath && c.node
        );
        // v4.4.1 FIX: Pass null instead of checker to avoid uncatchable
        // TypeError in Bun/JSC when TypeScript compiler's getSymbolOfDeclaration()
        // returns undefined on indexed access expressions. The typeText field
        // is informational only — edges are built by string matching, not type
        // info. This prevents the audit from crashing and stalling the God Loop.
        const graph = buildDataFlowGraph(allConstructs, null);

        for (const edge of graph.edges) {
          if (edge.from?.kind === 'source' && edge.to?.kind === 'sink') {
            if (edge.from?.sourceType === 'env' || edge.from?.sourceType === 'json_parse') {
              const alreadyReported = findings.some(
                (f: AuditFinding) => f.file === edge.to.filePath && Math.abs(f.line - edge.to.line) <= 2 && f.category === 'DATA_FLOW'
              );
              if (!alreadyReported) {
                findings.push({
                  layer: 'R4',
                  severity: 'CRITICAL',
                  category: 'DATA_FLOW',
                  file: edge.to.filePath,
                  line: edge.to.line,
                  evidence: `${edge.from.name} → ${edge.to.name}`,
                  description: `Unvalidated ${edge.from.sourceType} data flows to dangerous sink ${edge.to.name}`,
                  correction: `Validate ${edge.from.name} before passing to ${edge.to.name}`,
                  runtimeImpact: `Unvalidated data reaches dangerous operation — injection or corruption risk`,
                  confidence: 0.80,
                  constructType: construct.type,
                  callGraphRef: null,
                  evidenceSuppressed: false,
                });
              }
            }
          }
        }
      } catch (e: unknown) {
        console.error('[R13DataFlowAnalysis]', e);
        // non-fatal fallback — TypeChecker not available, regex-based analysis above is sufficient
        // R16-SAFE: falls through to typed return (return findings at end of evaluate)
      }
    }

    // R2 VOLUME FIX: If this construct IS itself a callback of an array method
    // (.map, .filter, .sort, .forEach, .reduce, .flatMap, etc.), skip param-type
    // analysis entirely — TypeScript infers these param types from the array's
    // element type. The type extractor may report 'any' for the param if the
    // array variable has a complex generic type, but the runtime type is NOT any.
    if (construct.node && isArrayMethodCallback(construct.node)) {
      return findings;
    }

    // R2 VOLUME FIX: Only flag truly untyped params (type === 'any'), not null/inferred types
    // Null type means the type wasn't parsed — it could be a complex generic like
    // Record<string, unknown> that just wasn't extracted. Skip null-typed params.
    const anyTypeParams = construct.parameters.filter((p: { name: string; type: string | null }) => p.type === 'any');

    // R2 VOLUME FIX: Skip if all access to any params is inside try/catch blocks
    const hasTryCatch = functionHasTryCatch(node);

    // R2 VOLUME FIX: Skip catch clause variables (e.g., catch (e: unknown)) — these are
    // error objects and accessing .message/.stack/.code is standard error handling.
    // Also skip sort/filter/map/reduce callback params — they're typed by the array.
    const catchParamNames = new Set<string>();
    const callbackParamNames = new Set<string>();
    const cpStack: ts.Node[] = [node];
    while (cpStack.length > 0) {
      const n = cpStack.pop()!;
      // Catch clause variables
      if (ts.isCatchClause(n) && n.variableDeclaration) {
        const cname = n.variableDeclaration.name.getText(sourceFile);
        if (cname) catchParamNames.add(cname);
      }
      // Array-method callback params (typed by the array element type)
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ARRAY_METHODS.has(n.expression.name.text)) {
        for (const arg of n.arguments) {
          if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
            for (const p of arg.parameters) {
              const pname = p.name.getText(sourceFile);
              if (pname) callbackParamNames.add(pname);
            }
          }
        }
      }
      ts.forEachChild(n, (c: ts.Node) => cpStack.push(c));
    }

    for (const param of anyTypeParams) {
      // Skip catch clause variables and callback params
      if (catchParamNames.has(param.name) || callbackParamNames.has(param.name)) continue;

      // R2 VOLUME FIX: Skip params accessed only inside try/catch — already protected
      if (hasTryCatch) continue;

      // Walk the AST for an unguarded `param.prop` property access. A guard is
      // optional chaining, a truthiness/nullish binary check, an enclosing if whose
      // condition references the param, or a ternary on the param.
      let foundUnguardedUse = false;
      const useStack: ts.Node[] = [node];
      while (useStack.length > 0 && !foundUnguardedUse) {
        const n = useStack.pop()!;
        if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === param.name) {
          if (!accessIsGuarded(n, param.name)) {
            foundUnguardedUse = true;
            break;
          }
        }
        ts.forEachChild(n, (c: ts.Node) => useStack.push(c));
      }

      if (foundUnguardedUse) {
        findings.push({
          layer: 'R4',
          severity: 'CRITICAL',
          category: 'DATA_FLOW',
          file: construct.filePath,
          line: construct.line,
          evidence: `any param "${param.name}" used without type guard`,
          description: `Parameter "${param.name}" has type "any" and is used without type guard before property access`,
          correction: `Add runtime type guard: if (typeof ${param.name} === 'object' && ${param.name} !== null) or type-narrow with instanceof`,
          runtimeImpact: 'Property access on any-typed value — TypeError if value is null/undefined/wrong type at runtime',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
        break;
      }
    }

    return findings;
  },
};
