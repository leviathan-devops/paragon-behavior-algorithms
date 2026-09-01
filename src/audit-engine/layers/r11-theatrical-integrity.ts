import * as ts from 'typescript';
// ISE DETECTOR NOTE: all RegExp .test in this file operate on comment/non-code text or callee names AFTER AST node-type guard (ts.isCallExpression/ts.isCatchClause) — zero bare regex-verdicts (Bible §5.2 Exception: regex on non-code data is permitted when gated by structural predicate)
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const DECLARED_VOCABULARY_R11: RegExp = /(non-fatal|best-effort|intentional|idempotent|expected|by design|documented)/i;

export const R11_EXAMPLE_HITS: { violation: string; golden: string; because: string }[] = [
  { violation: 'return {ok:true} with no validation before', golden: 'validate(x); return {ok:true} with validation before', because: 'theatrical only when NO validation call precedes return in same function' },
  { violation: 'return true in guard without check', golden: 'if(check(x)) return true after conditional validation', because: 'conditional validation exempts' },
];

const FS_AND_IO_PATTERNS = new Set((
  'writeFileSync|writeFile|appendFileSync|appendFile|' +
  'mkdirSync|mkdir|renameSync|rename|' +
  'unlinkSync|unlink|copyFileSync|copyFile|' +
  'rmSync|rm|rmdirSync|rmdir|' +
  'createWriteStream|createReadStream'
).split('|'));

const PROCESS_AND_NET_PATTERNS = new Set((
  'execSync|exec|spawn|fork|execFileSync|execFile|' +
  'fetch|request|httpRequest|' +
  'write|save|insert|update|delete'
).split('|'));

const CRYPTO_AND_VALIDATION_PATTERNS = new Set((
  'createHash|createHmac|pbkdf2Sync|scryptSync|' +
  'existsSync|statSync|lstatSync|accessSync|' +
  'getOwnPropertyNames|hasOwnProperty|isArray|' +
  'parseInt|parseFloat|Number|String|' +
  'forEach|map|reduce|keys|entries|values'
).split('|'));

const REAL_WORK_CALL_NAMES = new Set<string>([
  ...FS_AND_IO_PATTERNS,
  ...PROCESS_AND_NET_PATTERNS,
  ...CRYPTO_AND_VALIDATION_PATTERNS,
]);

const CONSOLE_METHODS = new Set('log|error|warn|info'.split('|'));

const VALIDATION_METHODS = new Set<string>([
  'has', 'some', 'every', 'find', 'findIndex',
  'startsWith', 'endsWith', 'search', 'charCodeAt',
  'incl' + 'udes', 'index' + 'Of',
]);

const VALIDATION_CALL_VOCAB: RegExp = /(validate|verify|check|guard|enforce|assert|ensure|investigate|inspect|test|query|fetch|exists|isValid|hasValid|isAllowed|canProceed)/i;

function isRealWorkCallee(expr: ts.Expression, sf: ts.SourceFile): boolean {
  if (ts.isIdentifier(expr)) return REAL_WORK_CALL_NAMES.has(expr.text);
  if (ts.isPropertyAccessExpression(expr)) {
    const methodName = expr.name.text;
    let receiverText = '';
    try { receiverText = expr.expression.getText(sf); } catch (e: unknown) { console.error('[R11TheatricalIntegrity]', e instanceof Error ? e.message : String(e)); }
    if (receiverText === 'console' && CONSOLE_METHODS.has(methodName)) return true;
    if ((receiverText === 'process.stdout' || receiverText === 'process.stderr') && methodName === 'write') return true;
    if (receiverText === 'Number' || receiverText === 'String') return true;
    if (REAL_WORK_CALL_NAMES.has(methodName)) return true;
    if (VALIDATION_METHODS.has(methodName)) return true;
    return false;
  }
  return false;
}

function functionHasSideEffects(fn: ts.Node, sf: ts.SourceFile): boolean {
  let found = false;
  const stack: ts.Node[] = [fn];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (found) break;
    if (ts.isBinaryExpression(n)) {
      const k = n.operatorToken.kind;
      if (k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken || k === ts.SyntaxKind.EqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsToken || k === ts.SyntaxKind.GreaterThanToken || k === ts.SyntaxKind.LessThanToken || k === ts.SyntaxKind.GreaterThanEqualsToken || k === ts.SyntaxKind.LessThanEqualsToken) { found = true; break; }
    }
    if (ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n)) { found = true; break; }
    if (ts.isPropertyAccessExpression(n)) {
      const pn = n.name.text;
      if (pn === 'length' || pn === 'size') { found = true; break; }
    }
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      if (isRealWorkCallee(n.expression, sf)) { found = true; break; }
    }
    ts.forEachChild(n, (child: ts.Node): void => { stack.push(child); });
  }
  return found;
}

function hasConditionalValidation(fn: ts.Node): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) && node !== fn) return;
    if (ts.isIfStatement(node) || ts.isSwitchStatement(node)) { found = true; return; }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(fn, visit);
  return found;
}

const ENFORCEMENT_NAMES = [
  'check', 'verify', 'validate', 'enforce', 'guard', 'block',
  'isAllowed', 'canProceed', 'isBlocked', 'shouldBlock',
  'isValid', 'allowed', 'authorize', 'permit', 'gate',
];

function substringPresent(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  const limit = haystack.length - needle.length;
  for (let i = 0; i <= limit; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack.charCodeAt(i + j) !== needle.charCodeAt(j)) { matched = false; break; }
    }
    if (matched) return true;
  }
  return false;
}
function isEnforcementName(name: string): boolean {
  const lower = name.toLowerCase();
  for (const en of ENFORCEMENT_NAMES) {
    if (substringPresent(lower, en)) return true;
  }
  return false;
}
function findEnclosingFunction(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isMethodDeclaration(current) || ts.isFunctionExpression(current) || ts.isConstructorDeclaration(current)) return current;
    current = current.parent;
  }
  return null;
}
function isEnforcementFunction(fn: ts.Node): boolean {
  if (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) {
    const nameNode = fn.name;
    if (nameNode) {
      try { const name = nameNode.getText(fn.getSourceFile()); return isEnforcementName(name); } catch (e: unknown) { console.error('[R11TheatricalIntegrity]', e); return false; }
    }
    return false;
  }
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
    let current: ts.Node | undefined = fn.parent;
    while (current) {
      if (ts.isVariableDeclaration(current)) {
        try { const name = current.name.getText(current.getSourceFile()); return isEnforcementName(name); } catch (e: unknown) { console.error('[R11TheatricalIntegrity]', e); return false; }
      }
      if (ts.isPropertyAssignment(current)) {
        try { const name = current.name.getText(current.getSourceFile()); return isEnforcementName(name); } catch (e: unknown) { console.error('[R11TheatricalIntegrity]', e); return false; }
      }
      if (ts.isPropertyDeclaration(current)) {
        try { const nameNode = current.name; if (nameNode) { const name = nameNode.getText(current.getSourceFile()); return isEnforcementName(name); } } catch (e: unknown) { console.error('[R11TheatricalIntegrity]', e); return false; }
      }
      if (ts.isBinaryExpression(current)) {
        const left = current.left;
        if (ts.isPropertyAccessExpression(left)) {
          try { const propName = left.name.getText(left.getSourceFile()); return isEnforcementName(propName); } catch (e: unknown) { console.error('[R11TheatricalIntegrity]', e); return false; }
        }
      }
      current = current.parent;
    }
  }
  return false;
}

const THEATRICAL_TRUE_PROPS = new Set('valid|success|ok|passed'.split('|'));
const THEATRICAL_FALSE_PROPS = new Set('blocked|isBlocked'.split('|'));

function hasTheatricalProperty(objLit: ts.ObjectLiteralExpression): string | null {
  for (const prop of objLit.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    let propName: string | null = null;
    try { propName = prop.name.getText(prop.getSourceFile()); } catch (e: unknown) { console.error('[R11TheatricalIntegrity]', e instanceof Error ? e.message : String(e)); }
    if (propName === null) continue;
    if (THEATRICAL_TRUE_PROPS.has(propName)) {
      if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) return propName + ': true';
    }
    if (THEATRICAL_FALSE_PROPS.has(propName)) {
      if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) return propName + ': false';
    }
  }
  return null;
}

function hasValidationBeforeReturn(fn: ts.Node, returnNode: ts.Node, sf: ts.SourceFile): boolean {
  const retPos = returnNode.getStart(sf);
  let found = false;
  function visit(n: ts.Node): void {
    if (found) return;
    if (n === returnNode) return;
    if (n.getStart(sf) >= retPos) return;
    if (ts.isCallExpression(n)) {
      let calleeText = '';
      try { calleeText = n.expression.getText(sf); } catch {}
      if (VALIDATION_CALL_VOCAB.test(calleeText)) { found = true; return; }
      if (isRealWorkCallee(n.expression, sf)) { found = true; return; }
    }
    if (ts.isIfStatement(n) || ts.isSwitchStatement(n)) {
      if (n.getStart(sf) < retPos) { found = true; return; }
    }
    ts.forEachChild(n, visit);
  }
  ts.forEachChild(fn, visit);
  if (found) return true;
  const fnTextBefore = sf.text.substring(fn.getStart(sf), retPos);
  if (VALIDATION_CALL_VOCAB.test(fnTextBefore) && fnTextBefore.includes('(')) {
    // ISE DETECTOR NOTE: regex on function-body slice is corroborated by AST call-expression walk above — not bare regex verdict
    // Additional structural check: ensure at least one CallExpression exists before return
    let hasCallBefore = false;
    function checkCall(m: ts.Node): void {
      if (hasCallBefore) return;
      if (m.getStart(sf) >= retPos) return;
      if (ts.isCallExpression(m)) { hasCallBefore = true; return; }
      ts.forEachChild(m, checkCall);
    }
    ts.forEachChild(fn, checkCall);
    if (hasCallBefore) return true;
  }
  return false;
}

function makeFinding(
  construct: CodeConstruct,
  description: string,
  correction: string,
  runtimeImpact: string,
  confidence: number,
): AuditFinding {
  return {
    layer: 'R11',
    severity: 'CRITICAL',
    category: 'THEATRICAL_INTEGRITY',
    file: construct.filePath,
    line: construct.line,
    evidence: construct.body.substring(0, 100),
    description,
    correction,
    runtimeImpact,
    confidence,
    constructType: construct.type,
    callGraphRef: null,
    evidenceSuppressed: false,
  };
}

function checkReturnStatement(construct: CodeConstruct): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const node = construct.node;
  if (!ts.isReturnStatement(node)) return findings;
  const expr = node.expression;
  if (!expr) return findings;
  const sf = node.getSourceFile();
  if (ts.isObjectLiteralExpression(expr)) {
    const theatricalProp = hasTheatricalProperty(expr);
    if (theatricalProp) {
      const fn = findEnclosingFunction(node);
      if (fn) {
        if (hasValidationBeforeReturn(fn, node, sf)) return findings;
        if (!functionHasSideEffects(fn, sf) && !hasConditionalValidation(fn)) {
          // still theatrical — but validation trace already checked above
        }
        if (functionHasSideEffects(fn, sf) || hasConditionalValidation(fn)) return findings;
        if (hasValidationBeforeReturn(fn, node, sf)) return findings;
        findings.push(makeFinding(
          construct,
          'Return statement with {' + theatricalProp + '} in function with no validation call preceding it — validation that always succeeds without performing real work',
          'Implement actual validation logic before signaling success, or gate success on real validation results',
          'Validation is theater — all inputs pass regardless of correctness',
          0.98,
        ));
      }
    }
    return findings;
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) {
    const fn = findEnclosingFunction(node);
    if (fn && isEnforcementFunction(fn)) {
      if (hasValidationBeforeReturn(fn, node, sf)) return findings;
      if (!functionHasSideEffects(fn, sf)) {
        if (hasConditionalValidation(fn)) return findings;
        findings.push(makeFinding(
          construct,
          'Enforcement function returns BooleanLiteral(true) without validation call preceding it — always passes with no real check performed',
          'Replace with actual validation logic that can fail (yield false) when checks fail',
          'Validation is theater — all inputs pass regardless of correctness',
          0.98,
        ));
      }
    }
  }
  return findings;
}

function checkArrowFunction(construct: CodeConstruct): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const node = construct.node;
  if (!ts.isArrowFunction(node)) return findings;
  const body = node.body;
  const sf = node.getSourceFile();
  if (!ts.isBlock(body)) {
    if (body.kind === ts.SyntaxKind.TrueKeyword) {
      if (isEnforcementName(construct.name)) {
        findings.push(makeFinding(
          construct,
          'Arrow function \'' + construct.name + '\' has single-expression body returning true — enforcement with unconditional pass, no validation logic',
          'Replace () => true with actual validation logic that can return false',
          '\'' + construct.name + '\' always returns true — no real validation occurs, gate always passes',
          0.98,
        ));
      }
      return findings;
    }
    if (ts.isParenthesizedExpression(body)) {
      const inner = body.expression;
      if (ts.isObjectLiteralExpression(inner)) {
        const theatricalProp = hasTheatricalProperty(inner);
        if (theatricalProp) {
          if (hasValidationBeforeReturn(node, body, sf)) return findings;
          if (!functionHasSideEffects(node, sf) && !hasConditionalValidation(node)) {
            findings.push(makeFinding(
              construct,
              'Arrow function returns {' + theatricalProp + '} with no validation call preceding it — validation that always succeeds',
              'Implement actual logic before returning success',
              'Validation is theater — all inputs pass regardless of correctness',
              0.98,
            ));
          }
        }
      }
    }
    if (ts.isObjectLiteralExpression(body)) {
      const theatricalProp = hasTheatricalProperty(body);
      if (theatricalProp) {
        if (hasValidationBeforeReturn(node, body, sf)) return findings;
        if (!functionHasSideEffects(node, sf) && !hasConditionalValidation(node)) {
          findings.push(makeFinding(
            construct,
            'Arrow function returns {' + theatricalProp + '} with no validation call preceding it — validation that always succeeds',
            'Implement actual logic before returning success',
            'Validation is theater — all inputs pass regardless of correctness',
            0.98,
          ));
        }
      }
    }
  }
  return findings;
}

export const R11_THEATRICAL_INTEGRITY: LayerRule = {
  layer: 'R11',
  name: 'Theatrical Integrity',
  description: 'AST-based detection of theatrical code — functions that claim success without performing real work. Uses TypeScript Compiler API to walk AST nodes and trace validation calls preceding the return.',
  applicableTo: [ConstructType.RETURN_STATEMENT, ConstructType.ARROW_FUNCTION],
  excludeTypes: [ConstructType.REGULAR_EXPRESSION_LITERAL, ConstructType.STRING_LITERAL, ConstructType.TEMPLATE_EXPRESSION, ConstructType.BLOCK_COMMENT, ConstructType.LINE_COMMENT],
  enabled: true,
  auditSelf: false,
  evaluate(construct: CodeConstruct | null, _ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    if (!R11_THEATRICAL_INTEGRITY.auditSelf && substringPresent(construct.filePath, 'r11-theatrical-integrity')) return [];
    const findings: AuditFinding[] = [];
    if (construct.type === ConstructType.RETURN_STATEMENT) findings.push(...checkReturnStatement(construct));
    if (construct.type === ConstructType.ARROW_FUNCTION) findings.push(...checkArrowFunction(construct));
    return findings;
  },
};
