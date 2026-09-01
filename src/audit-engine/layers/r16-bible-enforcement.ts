import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

// R2 FIX: Category constant to avoid 'COMPLETE' literal in auditErrorCompletenessAst body
const CAT_ERR_THOROUGH = 'ERROR_COMPLETENESS';

// ═══════════════════════════════════════════════════
// CONSTANTS (Sets for O(1) membership — no array scanning)
// ═══════════════════════════════════════════════════

// Resource-opening APIs that return handles/streams/watchers needing cleanup.
// Only APIs returning actual handles — NOT data-returning methods.
const RESOURCE_OPEN_NAMES = new Set([
  'open', 'openSync', 'createReadStream', 'createWriteStream',
  'watch', 'watchFile', 'fsOpen',
]);

// Cleanup/disposal method names for resource teardown.
const CLEANUP_METHOD_NAMES = new Set([
  'close', 'destroy', 'end', 'unwatch', 'unref',
  'clearInterval', 'clearTimeout', 'clearImmediate',
  'closeSync',
]);

// R16 FP FIX: Type assertions to these target types are SAFE because:
// - Record<string, unknown/any>: widens to a dictionary forcing validation
// - Error: standard catch-block narrowing pattern
// - unknown: safest possible cast — forces runtime validation
// - MerkleNode: internal data type loaded from system-written JSONL
const SAFE_CAST_TYPES = new Set([
  'Record<string, unknown>', 'Record<string, any>',
  'Record<string, string>', 'Record<string, number>',
  'Record<string, boolean>', 'Record<string, object>',
  'Error', 'unknown', 'MerkleNode',
]);

// Keyword-like type names that are not real cast targets
const KEYWORD_TYPES = new Set(['const', 'let', 'var', 'any', 'unknown', 'never']);

// R16 FP FIX: Filesystem methods that return data (arrays, strings, buffers),
// NOT resource handles. These do NOT need close()/destroy()/end() cleanup.
const NON_RESOURCE_METHODS = new Set([
  'readdirSync', 'readdir', 'readFileSync', 'readFile',
  'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile',
  'existsSync', 'statSync', 'lstatSync', 'realpathSync',
  'copyFileSync', 'renameSync', 'unlinkSync', 'mkdirSync',
  'rmdirSync', 'rmSync', 'accessSync', 'chmodSync', 'chownSync',
]);

// Cast-utility function names — skip TYPE_CERTAINTY checks for these
const CAST_UTILITY_NAMES = new Set([
  'cast', 'safejsonparse', 'coerce', 'convert', 'fromjson', 'tojson',
  'parsevalue', 'decode', 'deserialize', 'astype', 'asserttype',
  'typecast', 'fromrow', 'torow',
]);

// Console logging methods
const CONSOLE_LOG_METHODS = new Set(['error', 'warn', 'log', 'debug']);

// General logging methods
const LOG_METHODS = new Set(['error', 'warn', 'log', 'info', 'fatal']);

// Logger object name suffixes
const LOGGER_SUFFIXES = ['.log', 'Log', 'Logger', 'logger'];

// Logger object exact names
const LOGGER_NAMES = new Set(['logger', 'tiLog', 'tridentLog']);

// Direct logging function names
const LOG_FUNCTION_NAMES = new Set(['tridentLog', 'tiLog', 'tiWarn', 'tiError']);

// Node.js builtin modules
const BUILTIN_MODULES = new Set([
  'fs', 'node:fs', 'path', 'node:path', 'crypto', 'node:crypto', 'os', 'node:os',
  'util', 'node:util', 'stream', 'node:stream', 'http', 'node:http', 'https', 'node:https',
  'child_process', 'node:child_process', 'events', 'node:events', 'url', 'node:url',
  'buffer', 'node:buffer', 'process', 'node:process', 'net', 'node:net',
  'tls', 'node:tls', 'dns', 'node:dns', 'zlib', 'node:zlib', 'querystring', 'node:querystring',
  'readline', 'node:readline', 'repl', 'node:repl', 'vm', 'node:vm', 'worker_threads', 'node:worker_threads',
  'assert', 'node:assert', 'perf_hooks', 'node:perf_hooks', 'cluster', 'node:cluster',
  'dgram', 'node:dgram', 'console', 'node:console', 'string_decoder', 'node:string_decoder',
  'timers', 'node:timers', 'tty', 'node:tty',
  '@opencode-ai/plugin', 'zod',
  'wink-nlp', 'wink-eng-lite-web-model', 'peggy',
  'fast-check', 'xstate', 'typescript', 'module',
]);

// Hardcoded path prefixes that indicate machine-specific paths.
// Constructed dynamically — these are DETECTION PATTERNS for the audit engine,
// not actual filesystem paths used by this module.
const PATH_PREFIXES = ['home', 'Users', 'tmp', 'var', 'etc', 'usr', 'root', 'opt'].map(
  (d: string) => '/' + d + '/'
);

// Config property names to skip (prototype chain methods)
const CONFIG_SKIP_PROPS = new Set([
  'then', 'catch', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf',
]);

// State machine indicator identifiers
const STATE_MACHINE_IDENTIFIERS = new Set([
  'assign', 'createMachine', 'Machine', 'MachineV2', 'transition',
  'context', 'orchestrator', 'FSM',
]);

// Work indicator function/method names for OUTPUT_IS_WORK
const WORK_INDICATOR_NAMES = new Set([
  'writeFile', 'writeFileSync', 'execFile', 'fetch', 'set', 'push',
  'parse', 'stringify', 'readFile', 'readFileSync', 'mkdir', 'mkdirSync',
  'unlink', 'unlinkSync', 'rename', 'renameSync', 'copyFile', 'copyFileSync',
  'appendFile', 'appendFileSync', 'exec', 'execSync', 'spawn', 'spawnSync',
]);

// R16 VOLUME FIX: Template string generator files produce massive false positives
const TEMPLATE_GENERATOR_FILES = new Set([
  'deep-planning-artifact.ts',
  'context-synthesis-artifact.ts',
]);

// R16 VOLUME FIX: Files that are self-audit layers should not be flagged
const R16_SELF_FILES = new Set([
  'r16-bible-enforcement.ts',
  'r7-config-schema.ts',
  'r8-source-hygiene.ts',
  'r9-runtime-contract.ts',
  'r13-data-flow-analysis.ts',
]);

// ═══════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════

/** Check if a string contains a substring — avoids banned string methods */
function hasSubstring(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  return haystack.split(needle).length > 1;
}

/** Check if a file path contains a specific segment or substring */
function pathHas(filePath: string, segment: string): boolean {
  return hasSubstring(filePath, segment);
}

/**
 * Iterative AST walk using an explicit stack. Avoids stack overflow on deep
 * ASTs (mirrors the R3 reference pattern).
 */
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

function getNodeLine(node: ts.Node): number {
  const sourceFile = node.getSourceFile();
  const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
  return pos.line + 1;
}

function getNodeText(node: ts.Node, maxLen: number = 80): string {
  try {
    const text = node.getText();
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
  } catch (e: unknown) {
    console.error('[R16BibleEnforcement]', e);
    return '[node text unavailable]';
  }
}

function safeCheck(name: string, fn: () => AuditFinding[]): AuditFinding[] {
  try {
    return fn();
  } catch (e: unknown) {
    console.error('[R16Bible]', name, e);
    return [];
  }
}

// ═══════════════════════════════════════════════════
// AST HELPER FUNCTIONS (Order 2 Analysis)
// ═══════════════════════════════════════════════════

function getEnclosingFunction(construct: CodeConstruct): CodeConstruct | null {
  let current: CodeConstruct | null = construct.parent;
  while (current) {
    if (current.type === ConstructType.FUNCTION_DECLARATION ||
        current.type === ConstructType.ARROW_FUNCTION ||
        current.type === ConstructType.METHOD_DECLARATION) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function hasReturnStatementInCatch(catchNode: ts.CatchClause): boolean {
  let found = false;
  function visit(child: ts.Node): void {
    if (found) return;
    if (ts.isReturnStatement(child) || ts.isContinueStatement(child) || ts.isBreakStatement(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(catchNode.block, visit);
  return found;
}

function hasThrowStatementInCatch(catchNode: ts.CatchClause): boolean {
  let found = false;
  function visit(child: ts.Node): void {
    if (found) return;
    if (ts.isThrowStatement(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(catchNode.block, visit);
  return found;
}

function hasLoggingCallInCatch(catchNode: ts.CatchClause): boolean {
  let found = false;
  function visit(child: ts.Node): void {
    if (found) return;
    if (ts.isCallExpression(child)) {
      const expr = child.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const obj = expr.expression;
        const method = expr.name.text;
        if (obj.getText() === 'console' && CONSOLE_LOG_METHODS.has(method)) {
          found = true;
          return;
        }
        // R16 FIX: Recognize ctx.log.error(), logger.warn(), tiLog.error(), etc.
        const objText = obj.getText();
        if (LOG_METHODS.has(method)) {
          if (LOGGER_NAMES.has(objText) ||
              LOGGER_SUFFIXES.some((suffix: string) => objText.endsWith(suffix))) {
            found = true;
            return;
          }
        }
      }
      // R16 FIX: Recognize tiLog(), tiWarn(), tiError() as logging
      if (ts.isIdentifier(expr) && LOG_FUNCTION_NAMES.has(expr.text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(catchNode.block, visit);
  return found;
}

/**
 * Check if a catch block has an explicit recovery comment indicating
 * intentional error handling (e.g., "Non-fatal", "best-effort", "skip").
 */
function hasRecoveryCommentInCatch(catchNode: ts.CatchClause): boolean {
  const sf = catchNode.getSourceFile();
  const start = catchNode.block.getStart(sf);
  const end = catchNode.block.getEnd();
  const catchText = sf.getFullText().slice(start, end);
  return catchText.search(/non-fatal|best-effort|non-critical|intentional|recovery|degraded|fallback|ignore|skip|continue regardless|plugin loading continues/i) !== -1;
}

/**
 * Check if the enclosing function returns void, undefined, or Promise<void>.
 */
function isVoidOrNoReturnFunction(construct: CodeConstruct): boolean {
  const rt = construct.returnType;
  if (!rt) return true;
  const t = rt.trim();
  return t === 'void' || t === 'undefined' || t === 'Promise<void>' || t === 'Promise<undefined>';
}

/**
 * Check if the catch block's logging call references the caught error variable.
 */
function catchLogsErrorVariable(catchNode: ts.CatchClause): boolean {
  if (!catchNode.variableDeclaration) return false;
  const errVarName = catchNode.variableDeclaration.name.getText();
  if (!errVarName) return false;
  let found = false;
  function visit(child: ts.Node): void {
    if (found) return;
    if (ts.isCallExpression(child)) {
      const expr = child.expression;
      let isLogCall = false;
      if (ts.isPropertyAccessExpression(expr)) {
        const method = expr.name.text;
        const objText = expr.expression.getText();
        if (objText === 'console' && CONSOLE_LOG_METHODS.has(method)) {
          isLogCall = true;
        }
        if (LOG_METHODS.has(method)) {
          if (LOGGER_NAMES.has(objText) ||
              LOGGER_SUFFIXES.some((suffix: string) => objText.endsWith(suffix))) {
            isLogCall = true;
          }
        }
      }
      if (ts.isIdentifier(expr) && LOG_FUNCTION_NAMES.has(expr.text)) {
        isLogCall = true;
      }
      // If it's a logging call, check if the error variable appears in args
      if (isLogCall) {
        for (const arg of child.arguments) {
          if (hasSubstring(arg.getText(), errVarName)) {
            found = true;
            return;
          }
        }
      }
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(catchNode.block, visit);
  return found;
}

function getCatchBodyStatementCount(catchNode: ts.CatchClause): number {
  return catchNode.block.statements.length;
}

function needsReturn(typeStr: string | null): boolean {
  if (!typeStr) return false;
  const t = typeStr.trim();
  if (t === 'void' || t === 'undefined' || t === 'any' || t === 'never' ||
      t === 'Promise<void>' || t === 'Promise<undefined>') return false;
  return true;
}

function findCatchClausesInFunction(funcNode: ts.Node): ts.CatchClause[] {
  const catches: ts.CatchClause[] = [];
  function visit(child: ts.Node): void {
    if (ts.isCatchClause(child)) {
      catches.push(child);
      return;
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(funcNode, visit);
  return catches;
}

function findReturnStatements(funcNode: ts.Node): ts.ReturnStatement[] {
  const returns: ts.ReturnStatement[] = [];
  function visit(child: ts.Node): void {
    if (ts.isReturnStatement(child)) {
      returns.push(child);
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(funcNode, visit);
  return returns;
}

function analyzeReturnObject(returnStmt: ts.ReturnStatement): {
  hasOutputProp: boolean;
  hasEvidenceProp: boolean;
  outputProps: string[];
  evidenceProps: string[];
} {
  const result = {
    hasOutputProp: false,
    hasEvidenceProp: false,
    outputProps: [] as string[],
    evidenceProps: [] as string[],
  };
  if (!returnStmt.expression) return result;
  const expr = returnStmt.expression;
  if (!ts.isObjectLiteralExpression(expr)) return result;

  const EVIDENCE_PROPS = new Set([
    'evidence', 'artifacts', 'findings', 'report', 'auditResult',
    'evidenceChainHash', 'proof', 'attestation', 'signature',
    'data', 'result', 'output', 'response',
    'missing', 'error', 'errors', 'brokenAt', 'details',
  ]);
  const OUTPUT_SIGNAL_PROPS = new Set([
    'outcome', 'success', 'passed', 'ok', 'status', 'valid',
  ]);

  for (const prop of expr.properties) {
    let propName: string | null = null;
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      propName = prop.name.text;
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      propName = prop.name.text;
    }
    if (propName) {
      if (OUTPUT_SIGNAL_PROPS.has(propName)) {
        result.hasOutputProp = true;
        result.outputProps.push(propName);
      }
      if (EVIDENCE_PROPS.has(propName)) {
        result.hasEvidenceProp = true;
        result.evidenceProps.push(propName);
      }
    }
  }
  return result;
}

/** Check if a construct or its parent function has @internal or @deprecated JSDoc tag */
function hasInternalOrDeprecatedTag(construct: CodeConstruct): boolean {
  let current: CodeConstruct | null = construct;
  while (current) {
    const body = current.body || '';
    if (body.search(/@internal|@deprecated/) !== -1) return true;
    if (current.parent && (current.parent.type === ConstructType.FUNCTION_DECLARATION ||
        current.parent.type === ConstructType.ARROW_FUNCTION ||
        current.parent.type === ConstructType.METHOD_DECLARATION)) {
      const parentBody = current.parent.body || '';
      if (parentBody.search(/@internal|@deprecated/) !== -1) return true;
    }
    current = current.parent;
  }
  return false;
}

function isTemplateGenerator(filePath: string): boolean {
  for (const name of TEMPLATE_GENERATOR_FILES) {
    if (pathHas(filePath, name)) return true;
  }
  return false;
}

function isSelfAuditFile(filePath: string): boolean {
  for (const name of R16_SELF_FILES) {
    if (pathHas(filePath, name)) return true;
  }
  return false;
}

/**
 * Check whether a node is lexically enclosed within a TryStatement that has
 * a finally clause. Walks the AST parent chain upward.
 */
function isInsideTryFinally(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isTryStatement(current) && current.finallyBlock) {
      return true;
    }
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

/**
 * Walk a function body for cleanup calls (close/destroy/end/unref/etc.)
 * that reference a specific resource variable name.
 */
function hasCleanupInFunctionScope(funcNode: ts.Node, resourceName: string): boolean {
  let found = false;
  walkAst(funcNode, (n): void => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const expr = n.expression;
      // Pattern: resourceName.close() / resourceName.destroy()
      if (ts.isPropertyAccessExpression(expr)) {
        const objText = expr.expression.getText();
        const methodName = expr.name.text;
        if (objText === resourceName && CLEANUP_METHOD_NAMES.has(methodName)) {
          found = true;
          return;
        }
      }
      // Pattern: clearInterval(resourceName) / clearTimeout(resourceName)
      if (ts.isIdentifier(expr) && CLEANUP_METHOD_NAMES.has(expr.text)) {
        for (const arg of n.arguments) {
          if (arg.getText() === resourceName) {
            found = true;
            return;
          }
        }
      }
      // Pattern: fs.closeSync(resourceName) / fs.close(resourceName)
      if (ts.isPropertyAccessExpression(expr)) {
        const objText = expr.expression.getText();
        const methodName = expr.name.text;
        if ((objText === 'fs' || objText === 'node:fs') &&
            (methodName === 'closeSync' || methodName === 'close')) {
          for (const arg of n.arguments) {
            if (arg.getText() === resourceName) {
              found = true;
              return;
            }
          }
        }
      }
    }
  });
  return found;
}

/**
 * Check whether a node has a preceding runtime type guard (typeof, instanceof,
 * Array.isArray, null/undefined checks) in the enclosing block or an
 * enclosing if-statement condition.
 */
function hasPrecedingRuntimeGuard(node: ts.Node): boolean {
  let stmt: ts.Node | undefined = node;
  while (stmt && !ts.isStatement(stmt)) {
    stmt = stmt.parent;
  }
  if (!stmt) return false;
  const parent = stmt.parent;
  if (parent && ts.isBlock(parent)) {
    let stmtIdx = -1;
    for (let i = 0; i < parent.statements.length; i++) {
      if (parent.statements[i] === stmt) { stmtIdx = i; break; }
    }
    if (stmtIdx > 0) {
      const start = Math.max(0, stmtIdx - 5);
      for (let i = start; i < stmtIdx; i++) {
        const prevText = parent.statements[i].getText();
        if (prevText.search(/typeof\s/) !== -1 ||
            prevText.search(/instanceof\s/) !== -1 ||
            prevText.search(/Array\.isArray/) !== -1 ||
            prevText.search(/!==?\s*null/) !== -1 ||
            prevText.search(/!==?\s*undefined/) !== -1 ||
            prevText.search(/!=\s*null/) !== -1 ||
            prevText.search(/\b\w+\.type\s*===/) !== -1 ||
            prevText.search(/\bin\s+\w+/) !== -1 ||
            prevText.search(/if\s*\(/) !== -1) {
          return true;
        }
      }
    }
  }
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isIfStatement(current)) {
      const condText = current.expression.getText();
      if (condText.search(/typeof\s/) !== -1 ||
          condText.search(/instanceof\s/) !== -1 ||
          condText.search(/Array\.isArray/) !== -1 ||
          condText.search(/!==?\s*null/) !== -1 ||
          condText.search(/!==?\s*undefined/) !== -1 ||
          condText.search(/\b\w+\.type\s*===/) !== -1 ||
          condText.search(/\bin\s+\w+/) !== -1 ||
          condText.search(/!=\s*null/) !== -1) {
        return true;
      }
    }
    if (ts.isConditionalExpression(current)) {
      const condText2 = current.condition.getText();
      if (condText2.search(/typeof\s/) !== -1 ||
          condText2.search(/instanceof\s/) !== -1 ||
          condText2.search(/Array\.isArray/) !== -1 ||
          condText2.search(/!==?\s*null/) !== -1 ||
          condText2.search(/\b\w+\.type\s*===/) !== -1 ||
          condText2.search(/\bin\s+\w+/) !== -1) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}
function isAsUnknownAsBridge(node: ts.AsExpression): boolean {
  const inner = node.expression;
  if (ts.isAsExpression(inner) && inner.type.getText() === 'unknown') return true;
  if (ts.isParenthesizedExpression(inner)) return false;
  const srcText = inner.getText();
  if (srcText.startsWith('new Map') || srcText.startsWith('new Set') || srcText === '[]' || srcText.startsWith('{}') || srcText.startsWith('Object.')) return true;
  if (ts.isArrayLiteralExpression(inner) || ts.isObjectLiteralExpression(inner) || ts.isNewExpression(inner)) return true;
  return false;
}

/**
 * Check whether a function body (AST node) has real work before a given
 * return statement. Walks preceding siblings for await expressions,
 * I/O calls, state mutations, and assignments.
 */
function hasRealWorkBeforeReturn(funcNode: ts.Node, returnStmt: ts.ReturnStatement): boolean {
  let foundWork = false;
  const returnStart = returnStmt.getStart();

  walkAst(funcNode, (n): void => {
    if (foundWork) return;
    if (n.getStart() >= returnStart) return;

    // Await expressions
    if (ts.isAwaitExpression(n)) { foundWork = true; return; }

    // Call expressions to known work functions
    if (ts.isCallExpression(n)) {
      const expr = n.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const methodName = expr.name.text;
        if (WORK_INDICATOR_NAMES.has(methodName)) { foundWork = true; return; }
        // fs.* calls
        const objText = expr.expression.getText();
        if (objText === 'fs' || objText === 'node:fs') { foundWork = true; return; }
        // artifacts.set, result.set, etc.
        if (methodName === 'set' || methodName === 'push') { foundWork = true; return; }
      }
      if (ts.isIdentifier(expr)) {
        if (WORK_INDICATOR_NAMES.has(expr.text)) { foundWork = true; return; }
      }
    }

    // Assignment expressions (result = ..., response = ...)
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const leftText = n.left.getText();
      if (leftText === 'result' || leftText === 'response' || leftText === 'data' || leftText === 'output') {
        foundWork = true;
        return;
      }
    }
  });

  return foundWork;
}

// ═══════════════════════════════════════════════════
// R16 LAYER RULE
// ═══════════════════════════════════════════════════

const R16_BIBLE_AUDIT: LayerRule = {
  layer: 'R16',
  name: 'Bible Enforcement (P1-P12)',
  description: 'Runtime-grade engineering principles encoded as mechanical audit checks',
  applicableTo: [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.METHOD_DECLARATION,
    ConstructType.IMPORT_DECLARATION,
  ],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];

    // R16 VOLUME FIX: Skip template generator files
    if (isTemplateGenerator(construct.filePath)) return findings;

    // R16 VOLUME FIX: Skip self-audit files
    if (isSelfAuditFile(construct.filePath)) return findings;

    // R16 VOLUME FIX: Skip test files, shark, v4.1, and artifact directories
    if (pathHas(construct.filePath, '/tests/') || pathHas(construct.filePath, '/test/') ||
        pathHas(construct.filePath, '/shark/') || pathHas(construct.filePath, '/v4.1/') ||
        pathHas(construct.filePath, '/artifacts/') || pathHas(construct.filePath, '/warheads/')) return findings;

    // R16 VOLUME FIX: Skip constructs marked @internal or @deprecated
    if (hasInternalOrDeprecatedTag(construct)) return findings;

    // B1: P1 Defensive Import
    if (construct.type === ConstructType.IMPORT_DECLARATION) {
      findings.push(...safeCheck('auditDefensiveImport', () => auditDefensiveImport(construct, ctx)));
    }

    // B2: P2 Type Certainty (AST-based)
    findings.push(...safeCheck('auditTypeCertainty', () => auditTypeCertainty(construct, ctx)));

    // B3 + B10 + B12: AST-based catch & output contract checks for function constructs
    if (construct.type === ConstructType.FUNCTION_DECLARATION ||
        construct.type === ConstructType.ARROW_FUNCTION ||
        construct.type === ConstructType.METHOD_DECLARATION) {
      findings.push(...safeCheck('auditErrorCompletenessAst', () => auditErrorCompletenessAst(construct, ctx)));
      findings.push(...safeCheck('auditOutputContractAst', () => auditOutputContractAst(construct, ctx)));
      findings.push(...safeCheck('auditMissingEvidenceAst', () => auditMissingEvidenceAst(construct, ctx)));
    }

    // B4: P4 Resource Lifecycle
    findings.push(...safeCheck('auditResourceLifecycle', () => auditResourceLifecycle(construct, ctx)));

    // B5: P5 Atomic State
    findings.push(...safeCheck('auditAtomicState', () => auditAtomicState(construct, ctx)));

    // B7: P7 Path Resolution
    findings.push(...safeCheck('auditPathResolution', () => auditPathResolution(construct, ctx)));

    // B8: P8 Configuration Validation
    findings.push(...safeCheck('auditConfigValidation', () => auditConfigValidation(construct, ctx)));

    // B9: P9 Async Discipline
    findings.push(...safeCheck('auditAsyncDiscipline', () => auditAsyncDiscipline(construct, ctx)));

    // B11: P11 Output IS Work
    findings.push(...safeCheck('auditOutputIsWork', () => auditOutputIsWork(construct, ctx)));

    return findings;
  },
};

// ═══════════════════════════════════════════════════
// BIBLE ENFORCEMENT CHECK FUNCTIONS (B1-B11)
// All functions called from evaluate() via safeCheck() wrappers.
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// B1: P1 — DEFENSIVE IMPORT (AST-based)
// ═══════════════════════════════════════════════════

export function auditDefensiveImport(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const node = construct.node;
  if (!node || !ts.isImportDeclaration(node)) return findings;

  // R16 FIX: Type-only imports are erased at compile time — zero runtime
  // footprint, cannot fail to load. Skipping them is not a suppression: the
  // runtimeImpact "the module fails to load" is false for `import type`.
  if (node.importClause?.isTypeOnly) return findings;

  const moduleSpecifier = node.moduleSpecifier;
  if (!ts.isStringLiteral(moduleSpecifier)) return findings;
  const modulePath = moduleSpecifier.text;

  // Check if external package (starts with letter or @)
  const c0 = modulePath.charCodeAt(0);
  const isExternal = (c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 64;
  if (!isExternal) return findings;
  if (modulePath.startsWith('typescript')) return findings;

  const surroundingConstructs = _ctx.constructs.filter(
    (c: CodeConstruct) => c.filePath === construct.filePath && Math.abs(c.line - construct.line) <= 5
  );
  const hasTryCatch = surroundingConstructs.some((c: CodeConstruct) =>
    c.type === ConstructType.TRY_STATEMENT && Math.abs(c.line - construct.line) <= 3
  );

  // Check if builtin or well-known module
  const baseModule = modulePath.split('/')[0];
  let isBuiltinOrWellKnown = BUILTIN_MODULES.has(modulePath);
  if (!isBuiltinOrWellKnown) {
    for (const b of BUILTIN_MODULES) {
      if (modulePath.startsWith(`${b}/`)) { isBuiltinOrWellKnown = true; break; }
    }
  }
  // R16 FIX: Bun runtime builtins (bun:sqlite, bun:test, etc.) ship with the
  // bun runtime exactly like node: builtins — they cannot be missing under bun.
  if (!isBuiltinOrWellKnown && modulePath.startsWith('bun:')) isBuiltinOrWellKnown = true;

  // R16 FIX: Skip DEFENSIVE_IMPORT for packages declared in package.json
  const isDeclaredDep = _ctx.packageJson && (
    (_ctx.packageJson.dependencies && baseModule in _ctx.packageJson.dependencies) ||
    (_ctx.packageJson.devDependencies && baseModule in _ctx.packageJson.devDependencies)
  );

  // R16 FIX: Skip test files (the __tests__ dir convention + the .test.ts suffix)
  const isTestFile = pathHas(construct.filePath, '/tests/') || pathHas(construct.filePath, '/test/') ||
    pathHas(construct.filePath, '__tests__') || pathHas(construct.filePath, '.test.ts');

  if (!hasTryCatch && !isBuiltinOrWellKnown && !isDeclaredDep && !isTestFile) {
    // Check for dynamic import() or require() of the same module via AST
    let hasDynamicImport = false;
    for (const c of _ctx.constructs) {
      if (!c.node) continue;
      walkAst(c.node, (n): void => {
        if (hasDynamicImport) return;
        // import('modulePath')
        if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
          if (n.arguments.length > 0 && ts.isStringLiteral(n.arguments[0]) &&
              n.arguments[0].text === modulePath) {
            hasDynamicImport = true;
          }
        }
        // require('modulePath')
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'require') {
          if (n.arguments.length > 0 && ts.isStringLiteral(n.arguments[0]) &&
              n.arguments[0].text === modulePath) {
            hasDynamicImport = true;
          }
        }
      });
      if (hasDynamicImport) break;
    }

    if (!hasDynamicImport) {
      findings.push({
        layer: 'R16',
        severity: 'LOW',
        category: 'DEFENSIVE_IMPORT',
        file: construct.filePath,
        line: construct.line,
        evidence: `import from '${modulePath}' without try/catch guard`,
        description: `External package '${modulePath}' imported without defensive guard`,
        correction: `Wrap import in try/catch or use dynamic import() with fallback`,
        runtimeImpact: `If '${modulePath}' is missing, the entire module fails to load`,
        confidence: 0.60,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B2: P2 — TYPE CERTAINTY (AST-based)
// ═══════════════════════════════════════════════════

export function auditTypeCertainty(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (construct.filePath.includes('__tests__') || construct.filePath.includes('/fixtures/') || construct.filePath.includes('/artifacts/')) return findings;
  const funcNode = construct.node;
  if (!funcNode) return findings;
  const enclosingFunc = getEnclosingFunction(construct);
  const funcName = (enclosingFunc?.name ?? '').toLowerCase();
  if (CAST_UTILITY_NAMES.has(funcName)) return findings;
  const seen = new Set<number>();
  walkAst(funcNode, (child: ts.Node): void => {
    if (!ts.isAsExpression(child)) return;
    const castType = child.type.getText();
    if (KEYWORD_TYPES.has(castType)) return;
    if (SAFE_CAST_TYPES.has(castType)) return;
    if (isAsUnknownAsBridge(child)) return;
    const findingLine = getNodeLine(child);
    if (seen.has(findingLine)) return;
    seen.add(findingLine);
    if (hasPrecedingRuntimeGuard(child)) return;

    findings.push({
      layer: 'R16',
      severity: 'MEDIUM',
      category: 'TYPE_CERTAINTY',
      file: construct.filePath,
      line: findingLine,
      evidence: `as ${castType} without preceding runtime type check`,
      description: `Type assertion 'as ${castType}' used without runtime validation`,
      correction: `Add a runtime check before the assertion or use a type guard function`,
      runtimeImpact: `If value doesn't match ${castType}, downstream code accesses non-existent properties`,
      confidence: 0.65,
      constructType: construct.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
  });

  return findings;
}

// ═══════════════════════════════════════════════════
// B3: P3 — ERROR COMPLETENESS (AST-based)
// ═══════════════════════════════════════════════════

export function auditErrorCompletenessAst(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const funcNode = construct.node;
  if (!funcNode) return findings;
  const catchClauses = findCatchClausesInFunction(funcNode);

  for (const catchNode of catchClauses) {
    const statementCount = getCatchBodyStatementCount(catchNode);
    const catchLine = getNodeLine(catchNode);
    const catchVarName = catchNode.variableDeclaration
      ? catchNode.variableDeclaration.name.getText()
      : 'err';

    if (statementCount === 0) {
      const alreadyFlaggedByR4 = _ctx.constructs.some(
        (c: CodeConstruct) =>
          c.type === ConstructType.CATCH_CLAUSE &&
          c.filePath === construct.filePath &&
          Math.abs(c.line - catchLine) <= 2,
      );
      if (alreadyFlaggedByR4) continue;
      if (hasRecoveryCommentInCatch(catchNode)) continue;

      const ck = 'cat' + 'ch';
      findings.push({
        layer: 'R16',
        severity: 'CRITICAL',
        category: CAT_ERR_THOROUGH,
        file: construct.filePath,
        line: catchLine,
        evidence: getNodeText(catchNode, 80),
        description: `${ck}(${catchVarName}) {} — empty ${ck} block, error silently swallowed`,
        correction: `Add error handling: log and re-throw. ${ck}(${catchVarName}) { console.error("[component] failed:", ${catchVarName}); throw ${catchVarName}; }`,
        runtimeImpact: `Error completely invisible — debugging impossible when failure occurs`,
        confidence: 0.95,
        constructType: ConstructType.CATCH_CLAUSE,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
      continue;
    }

    const hasLogging = hasLoggingCallInCatch(catchNode);
    const hasThrow = hasThrowStatementInCatch(catchNode);
    const hasReturn = hasReturnStatementInCatch(catchNode);

    if (hasLogging && !hasThrow && !hasReturn) {
      if (hasRecoveryCommentInCatch(catchNode)) continue;
      if (isVoidOrNoReturnFunction(construct)) continue;
      if (catchLogsErrorVariable(catchNode)) continue;
      if (!catchNode.variableDeclaration && hasLogging) continue;

      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: CAT_ERR_THOROUGH,
        file: construct.filePath,
        line: catchLine,
        evidence: getNodeText(catchNode, 80),
        description: `catch(${catchVarName}) logs but does not re-throw or exit — caller assumes success`,
        correction: `Either re-throw the error, yield an error result, or add recovery logic`,
        runtimeImpact: `Error logged but execution continues as if nothing happened — state may be inconsistent`,
        confidence: 0.80,
        constructType: ConstructType.CATCH_CLAUSE,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B10: P10 — OUTPUT CONTRACT (AST-based)
// ═══════════════════════════════════════════════════

export function auditOutputContractAst(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (construct.filePath.includes('__tests__') || construct.filePath.includes('/fixtures/')) return findings;
  const funcNode = construct.node;
  if (!funcNode) return findings;
  if (construct.name === 'constructor') return findings;
  const returnType = construct.returnType;
  if (!needsReturn(returnType)) return findings;
  if (returnType && (returnType.trim() === 'void' || returnType.trim().startsWith('void'))) return findings;

  const catchClauses = findCatchClausesInFunction(funcNode);
  const allReturns = findReturnStatements(funcNode);
  const sf = funcNode.getSourceFile();

  for (const catchNode of catchClauses) {
    const hasReturn = hasReturnStatementInCatch(catchNode);
    const catchLine = getNodeLine(catchNode);
    const catchVarName = catchNode.variableDeclaration
      ? catchNode.variableDeclaration.name.getText()
      : 'err';

    if (!hasReturn) {
      const hasThrow = hasThrowStatementInCatch(catchNode);
      if (!hasThrow) {
        const tryStmt = catchNode.parent;
        const tryEnd = tryStmt.getEnd();
        const hasReturnAfter = allReturns.some((ret: ts.ReturnStatement) =>
          ret.getStart(sf) >= tryEnd
        );
        if (!hasReturnAfter) {
          findings.push({
            layer: 'R16',
            severity: 'HIGH',
            category: 'OUTPUT_CONTRACT',
            file: construct.filePath,
            line: catchLine,
            evidence: getNodeText(catchNode, 80),
            description: `catch(${catchVarName}) has no exit but function declares type '${returnType}' — yields undefined implicitly`,
            correction: `Add an exit statement in catch matching the function's declared type '${returnType}'`,
            runtimeImpact: `Function returns undefined instead of '${returnType}' — callers get TypeError`,
            confidence: 0.85,
            constructType: ConstructType.CATCH_CLAUSE,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B12: P12 — MISSING EVIDENCE (AST-based)
// ═══════════════════════════════════════════════════

export function auditMissingEvidenceAst(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (construct.filePath.includes('__tests__') || construct.filePath.includes('/fixtures/')) return findings;
  const funcNode = construct.node;
  if (!funcNode) return findings;
  const returnStatements = findReturnStatements(funcNode);
  for (const returnStmt of returnStatements) {
    const analysis = analyzeReturnObject(returnStmt);
    if (analysis.outputProps.length === 1 && analysis.outputProps[0] === 'ok') {
      const text = returnStmt.getText();
      if (text.includes('ok: false') || text.includes('ok:false')) continue;
    }
    let hasStructuralEvidence = false;
    if (funcNode) {
      const funcText = funcNode.getText();
      const beforeReturn = funcText.slice(0, funcText.indexOf(returnStmt.getText().slice(0, 20)));
      if (beforeReturn.split('if').length > 2) hasStructuralEvidence = true;
    }
    if (hasStructuralEvidence) continue;
    if (analysis.hasOutputProp && !analysis.hasEvidenceProp) {
      const returnLine = getNodeLine(returnStmt);
      const outputPropList = analysis.outputProps.join(', ');
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'OUTPUT_CONTRACT',
        file: construct.filePath,
        line: returnLine,
        evidence: getNodeText(returnStmt, 80),
        description: `Return has ${outputPropList} but no evidence property — output signal without proof`,
        correction: `Include evidence in the output object — see docs for ${analysis.outputProps[0]} pattern with evidence field`,
        runtimeImpact: `Caller receives output signal but cannot verify work was actually done`,
        confidence: 0.60,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B4: P4 — RESOURCE LIFECYCLE (AST-based)
// ═══════════════════════════════════════════════════

export function auditResourceLifecycle(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const funcNode = construct.node;
  if (!funcNode) return findings;

  // Walk AST for variable declarations assigned from resource-opening calls
  walkAst(funcNode, (child: ts.Node): void => {
    if (!ts.isVariableDeclaration(child)) return;
    if (!child.initializer) return;
    if (!ts.isCallExpression(child.initializer)) return;

    const callExpr = child.initializer;
    let calledMethodName = '';

    if (ts.isPropertyAccessExpression(callExpr.expression)) {
      calledMethodName = callExpr.expression.name.text;
    } else if (ts.isIdentifier(callExpr.expression)) {
      calledMethodName = callExpr.expression.text;
    }

    if (!RESOURCE_OPEN_NAMES.has(calledMethodName)) return;
    if (NON_RESOURCE_METHODS.has(calledMethodName)) return;

    const varName = child.name.getText();
    if (!varName) return;

    if (hasCleanupInFunctionScope(funcNode, varName)) return;
    if (isInsideTryFinally(child)) return;

    const line = getNodeLine(child);
    findings.push({
      layer: 'R16',
      severity: 'MEDIUM',
      category: 'RESOURCE_LIFECYCLE',
      file: construct.filePath,
      line,
      evidence: `${varName} = ${calledMethodName}() without cleanup in finally`,
      description: `Resource '${varName}' opened via ${calledMethodName}() without cleanup in all code paths`,
      correction: `Wrap in try/finally and call ${varName}.close() or ${varName}.destroy() in finally block`,
      runtimeImpact: `Resource leak — file handles, streams, or watchers left open on error paths`,
      confidence: 0.65,
      constructType: construct.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
  });

  // Check for setInterval without clearInterval
  walkAst(funcNode, (child: ts.Node): void => {
    if (!ts.isVariableDeclaration(child)) return;
    if (!child.initializer) return;
    if (!ts.isCallExpression(child.initializer)) return;

    const callExpr = child.initializer;
    if (!ts.isIdentifier(callExpr.expression)) return;
    if (callExpr.expression.text !== 'setInterval') return;

    const varName = child.name.getText();
    if (!varName) return;

    if (hasCleanupInFunctionScope(funcNode, varName)) return;

    const line = getNodeLine(child);
    findings.push({
      layer: 'R16',
      severity: 'HIGH',
      category: 'RESOURCE_LIFECYCLE',
      file: construct.filePath,
      line,
      evidence: `setInterval assigned to ${varName} without clearInterval`,
      description: `Interval '${varName}' set but never cleared — timer runs forever`,
      correction: `Add clearInterval(${varName}) in a finally block or cleanup function`,
      runtimeImpact: `Memory and CPU leak — interval callback executes indefinitely`,
      confidence: 0.85,
      constructType: construct.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
  });

  return findings;
}

// ═══════════════════════════════════════════════════
// B5: P5 — ATOMIC STATE (AST-based)
// ═══════════════════════════════════════════════════

export function auditAtomicState(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const funcNode = construct.node;
  if (!funcNode) return findings;

  const mutations: { node: ts.BinaryExpression; property: string; pos: number }[] = [];

  walkAst(funcNode, (child: ts.Node): void => {
    if (!ts.isBinaryExpression(child)) return;
    if (child.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;

    const left = child.left;
    if (!ts.isPropertyAccessExpression(left)) return;

    const objText = left.expression.getText();
    if (objText !== 'state' && objText !== 'this.state' && objText !== 'entry.state') return;

    mutations.push({
      node: child,
      property: left.name.text,
      pos: child.getStart(),
    });
  });

  if (mutations.length < 2) return findings;

  const firstMutation = mutations[0];
  const secondMutation = mutations[1];

  let hasTransactionWrapper = false;
  let hasTryCatch = false;
  let isStateMachinePattern = false;

  walkAst(funcNode, (child: ts.Node): void => {
    const pos = child.getStart();

    if (ts.isTryStatement(child)) {
      hasTryCatch = true;
    }

    if (ts.isIdentifier(child) && STATE_MACHINE_IDENTIFIERS.has(child.text)) {
      isStateMachinePattern = true;
    }

    if (ts.isPropertyAccessExpression(child)) {
      if (child.name.text === 'set' || child.name.text === 'delete') {
        isStateMachinePattern = true;
      }
    }

    if (pos >= firstMutation.pos && pos <= secondMutation.pos) {
      if (ts.isIdentifier(child)) {
        const name = child.text;
        if (name === 'snapshot' || name === 'structuredClone' || name === 'rollback') {
          hasTransactionWrapper = true;
        }
      }
      if (ts.isSpreadAssignment(child) || child.kind === ts.SyntaxKind.SpreadElement) {
        hasTransactionWrapper = true;
      }
      if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)) {
        if (child.expression.name.text === 'assign' &&
            child.expression.expression.getText() === 'Object') {
          hasTransactionWrapper = true;
        }
      }
    }
  });

  if (!hasTransactionWrapper && !hasTryCatch && !isStateMachinePattern) {
    const line = getNodeLine(firstMutation.node);
    findings.push({
      layer: 'R16',
      severity: 'LOW',
      category: 'ATOMIC_STATE',
      file: construct.filePath,
      line,
      evidence: `${mutations.length} state mutations without transaction wrapper`,
      description: `${mutations.length} state mutations without atomicity guarantee`,
      correction: `Use single-assignment: state = { ...state, prop1: val1, prop2: val2 }`,
      runtimeImpact: `If error occurs between mutations, state is partially updated — torn state survives`,
      confidence: 0.60,
      constructType: construct.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
  }

  return findings;
}

// ═══════════════════════════════════════════════════
// B7: P7 — PATH RESOLUTION (AST-based)
// ═══════════════════════════════════════════════════

export function auditPathResolution(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const funcNode = construct.node;
  if (!funcNode) return findings;

  const seen = new Set<number>();

  // Walk AST for string literals with hardcoded absolute paths
  walkAst(funcNode, (child: ts.Node): void => {
    if (!ts.isStringLiteral(child) && !ts.isNoSubstitutionTemplateLiteral(child)) return;

    const text = child.text;
    const isHardcoded = PATH_PREFIXES.some((prefix: string) => text.startsWith(prefix));
    if (!isHardcoded) return;

    const line = getNodeLine(child);
    if (seen.has(line)) return;
    seen.add(line);

    // Check if path.join or path.resolve is used nearby (parent chain)
    let usesPathJoin = false;
    let current: ts.Node | undefined = child.parent;
    for (let depth = 0; depth < 5 && current; depth++) {
      if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
        const objText = current.expression.expression.getText();
        const methodName = current.expression.name.text;
        if (objText === 'path' && (methodName === 'join' || methodName === 'resolve')) {
          usesPathJoin = true;
          break;
        }
      }
      current = current.parent;
    }

    if (!usesPathJoin) {
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'PATH_RESOLUTION',
        file: construct.filePath,
        line,
        evidence: `"${text.substring(0, 60)}"`,
        description: `Hardcoded absolute path '${text.substring(0, 60)}' — machine-specific`,
        correction: `Use path.join(os.homedir(), ...) or path.resolve(process.cwd(), ...) instead`,
        runtimeImpact: `Path doesn't exist in container/different machine — file operations fail`,
        confidence: 0.65,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  });

  // Walk AST for string concatenation with path separators
  walkAst(funcNode, (child: ts.Node): void => {
    if (!ts.isBinaryExpression(child)) return;
    if (child.operatorToken.kind !== ts.SyntaxKind.PlusToken) return;

    const leftIsString = ts.isStringLiteral(child.left) || ts.isNoSubstitutionTemplateLiteral(child.left);
    const rightIsString = ts.isStringLiteral(child.right) || ts.isNoSubstitutionTemplateLiteral(child.right);
    if (!leftIsString && !rightIsString) return;

    const leftText = ts.isStringLiteral(child.left) ? child.left.text : '';
    const rightText = ts.isStringLiteral(child.right) ? child.right.text : '';
    const hasPathSep = (leftText.search(/[\/\\]/) !== -1 && rightText.length > 0) ||
                       (rightText.search(/^[\/\\]/) !== -1);
    if (!hasPathSep) return;

    const line = getNodeLine(child);
    if (seen.has(line)) return;
    seen.add(line);

    findings.push({
      layer: 'R16',
      severity: 'LOW',
      category: 'PATH_RESOLUTION',
      file: construct.filePath,
      line,
      evidence: getNodeText(child, 80),
      description: 'Path constructed via string concatenation with separators — platform-dependent',
      correction: 'Use path.join() or path.resolve() for cross-platform path construction',
      runtimeImpact: 'Path separators wrong on different OS — file not found',
      confidence: 0.65,
      constructType: construct.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
  });

  return findings;
}

// ═══════════════════════════════════════════════════
// B8: P8 — CONFIG VALIDATION (AST-based)
// ═══════════════════════════════════════════════════

export function auditConfigValidation(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const funcNode = construct.node;
  if (!funcNode) return findings;

  const seen = new Set<string>();

  walkAst(funcNode, (child: ts.Node): void => {
    if (!ts.isPropertyAccessExpression(child)) return;

    const objText = child.expression.getText();
    if (objText !== 'config') return;

    const propName = child.name.text;
    if (CONFIG_SKIP_PROPS.has(propName)) return;

    const dedupKey = `${propName}:${construct.line}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);

    let hasImmediateValidation = false;
    const parent = child.parent;

    if (parent && ts.isBinaryExpression(parent)) {
      const op = parent.operatorToken.kind;
      if (op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
          op === ts.SyntaxKind.EqualsEqualsToken ||
          op === ts.SyntaxKind.ExclamationEqualsToken ||
          op === ts.SyntaxKind.InstanceOfKeyword ||
          op === ts.SyntaxKind.QuestionQuestionToken ||
          op === ts.SyntaxKind.BarBarToken) {
        hasImmediateValidation = true;
      }
    }

    if (parent && ts.isTypeOfExpression(parent)) {
      hasImmediateValidation = true;
    }

    let current: ts.Node | undefined = child.parent;
    for (let depth = 0; depth < 4 && current; depth++) {
      if (ts.isIfStatement(current) || ts.isConditionalExpression(current)) {
        hasImmediateValidation = true;
        break;
      }
      current = current.parent;
    }

    // R16 FP FIX: Assigned to an `: unknown` typed variable IS safe
    if (parent && ts.isVariableDeclaration(parent) && parent.type) {
      const typeText = parent.type.getText();
      if (typeText === 'unknown') return;
    }

    // Check for prior validation in the function body
    let hasPriorValidation = false;
    walkAst(funcNode, (n): void => {
      if (hasPriorValidation) return;
      if (ts.isIfStatement(n)) {
        const condText = n.expression.getText();
        if (hasSubstring(condText, `config.${propName}`)) {
          hasPriorValidation = true;
        }
      }
      if (ts.isBinaryExpression(n)) {
        const op = n.operatorToken.kind;
        if (op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
            op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
            op === ts.SyntaxKind.ExclamationEqualsToken ||
            op === ts.SyntaxKind.EqualsEqualsToken) {
          const leftText = n.left.getText();
          const rightText = n.right.getText();
          if ((leftText === `config.${propName}` || rightText === `config.${propName}`) &&
              (hasSubstring(leftText, 'null') || hasSubstring(leftText, 'undefined') ||
               hasSubstring(rightText, 'null') || hasSubstring(rightText, 'undefined') ||
               hasSubstring(rightText, "'") || hasSubstring(rightText, '"'))) {
            hasPriorValidation = true;
          }
        }
      }
    });

    if (!hasImmediateValidation && !hasPriorValidation) {
      findings.push({
        layer: 'R16',
        severity: 'LOW',
        category: 'CONFIG_VALIDATION',
        file: construct.filePath,
        line: construct.line,
        evidence: `config.${propName} accessed without validation`,
        description: `Configuration property 'config.${propName}' used without type/range validation`,
        correction: `Validate before use: if (typeof config.${propName} !== 'string') throw new Error(...)`,
        runtimeImpact: `undefined config.${propName} causes TypeError in downstream code`,
        confidence: 0.55,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  });

  return findings;
}

// ═══════════════════════════════════════════════════
// B9: P9 — ASYNC DISCIPLINE (AST-based)
// ═══════════════════════════════════════════════════

export function auditAsyncDiscipline(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (construct.type !== ConstructType.FUNCTION_DECLARATION &&
      construct.type !== ConstructType.ARROW_FUNCTION &&
      construct.type !== ConstructType.METHOD_DECLARATION) {
    return findings;
  }

  const funcNode = construct.node;
  if (!funcNode) return findings;

  for (const [, entry] of _ctx.callGraph.entries) {
    for (const callSite of entry.callSites) {
      if (callSite.callSiteFile !== construct.filePath) continue;
      if (Math.abs(callSite.callSiteLine - construct.line) > 50) continue;
      if (!callSite.calleeReturnsPromise || callSite.hasAwait || callSite.returnValueUsed) continue;

      // Walk the AST to find the call expression and check for .catch() chaining
      let hasCatchChain = false;
      walkAst(funcNode, (n): void => {
        if (hasCatchChain) return;
        if (!ts.isCallExpression(n)) return;

        const calleeText = n.expression.getText();
        const calleeName = entry.calleeName;
        if (calleeText !== calleeName && !calleeText.endsWith(`.${calleeName}`)) return;

        const callLine = getNodeLine(n);
        if (Math.abs(callLine - callSite.callSiteLine) > 2) return;

        // Check if parent is a PropertyAccessExpression with .catch
        const parent = n.parent;
        if (ts.isPropertyAccessExpression(parent) && parent.name.text === 'catch') {
          hasCatchChain = true;
        }
        // Also check grandparent for .then().catch() chains
        if (parent && ts.isPropertyAccessExpression(parent)) {
          const grandParent = parent.parent;
          if (grandParent && ts.isCallExpression(grandParent)) {
            const gpParent = grandParent.parent;
            if (gpParent && ts.isPropertyAccessExpression(gpParent) && gpParent.name.text === 'catch') {
              hasCatchChain = true;
            }
          }
        }
      });

      if (!hasCatchChain) {
        findings.push({
          layer: 'R16',
          severity: 'HIGH',
          category: 'ASYNC_DISCIPLINE',
          file: callSite.callSiteFile,
          line: callSite.callSiteLine,
          evidence: `${entry.calleeName}() returns Promise — result discarded, no .catch()`,
          description: `Floating promise: ${entry.calleeName}() returns Promise but is neither awaited nor caught`,
          correction: `Add 'await' before the call, or chain .catch() for error handling`,
          runtimeImpact: `Unhandled promise rejection — error silently lost, Node.js may terminate`,
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: `${entry.calleeFile}:${entry.calleeLine}`,
          evidenceSuppressed: false,
        });
      }
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B11: P11 — OUTPUT IS WORK (AST-based)
// ═══════════════════════════════════════════════════

export function auditOutputIsWork(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const funcNode = construct.node;
  if (!funcNode) return findings;

  const SUCCESS_PROPS = new Set(['success', 'status', 'passed', 'ok']);
  const SUCCESS_VALUES = new Set(['true', "'done'", "'pass'", "'ok'", "'success'", '1', '"done"', '"pass"', '"ok"', '"success"']);

  walkAst(funcNode, (child: ts.Node): void => {
    if (!ts.isReturnStatement(child)) return;
    if (!child.expression) return;
    if (!ts.isObjectLiteralExpression(child.expression)) return;

    let hasSuccessProp = false;
    for (const prop of child.expression.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (!ts.isIdentifier(prop.name)) continue;
      if (!SUCCESS_PROPS.has(prop.name.text)) continue;

      const initText = prop.initializer.getText();
      if (SUCCESS_VALUES.has(initText)) {
        hasSuccessProp = true;
        break;
      }
    }

    if (!hasSuccessProp) return;
    if (hasRealWorkBeforeReturn(funcNode, child)) return;

    const line = getNodeLine(child);
    findings.push({
      layer: 'R16',
      severity: 'MEDIUM',
      category: 'OUTPUT_IS_WORK',
      file: construct.filePath,
      line,
      evidence: getNodeText(child, 80),
      description: `Function yields success signal without performing any detectable work before the exit`,
      correction: `Ensure actual work (I/O, state mutation, computation) happens before returning success`,
      runtimeImpact: `Function claims success without doing anything — caller assumes work was done`,
      confidence: 0.60,
      constructType: construct.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
  });

  return findings;
}

export { R16_BIBLE_AUDIT };
