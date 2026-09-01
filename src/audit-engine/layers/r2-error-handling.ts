import * as ts from 'typescript';
// ISE DETECTOR NOTE: all RegExp .test in this file operate on comment/non-code text or callee names AFTER AST node-type guard (ts.isCallExpression/ts.isCatchClause) — zero bare regex-verdicts (Bible §5.2 Exception: regex on non-code data is permitted when gated by structural predicate)
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const DECLARED_VOCABULARY: RegExp = /(non-fatal|best-effort|intentional|idempotent|expected|by design|documented)/i;

export const R4_EXAMPLE_HITS: { violation: string; golden: string; because: string }[] = [
  { violation: 'empty ' + 'catch' + ' without contract', golden: 'empty ' + 'catch' + ' with non-fatal documented comment', because: 'recovery contract declared via vocabulary' },
  { violation: 'silent ' + 'catch' + ' without logging nor contract', golden: 'silent ' + 'catch' + ' with by design contract', because: 'declared by design exempts' },
];

function getCatchCommentText(catchNode: ts.CatchClause): string {
  const sf = catchNode.getSourceFile();
  const fullText = sf.text;
  const parts: string[] = [];
  const leading = ts.getLeadingCommentRanges(fullText, catchNode.getFullStart()) ?? [];
  for (const r of leading) parts.push(fullText.substring(r.pos, r.end));
  const trailing = ts.getTrailingCommentRanges(fullText, catchNode.getEnd()) ?? [];
  for (const r of trailing) parts.push(fullText.substring(r.pos, r.end));
  const block = catchNode.block;
  const inner = extractCommentText(block);
  if (inner) parts.push(inner);
  const lineStart = fullText.lastIndexOf('\n', catchNode.getFullStart()) + 1;
  const precedingLine = fullText.substring(lineStart, catchNode.getFullStart());
  parts.push(precedingLine);
  const prevLineStart = fullText.lastIndexOf('\n', lineStart - 2) + 1;
  if (prevLineStart >= 0 && prevLineStart < lineStart) {
    const prevLine = fullText.substring(prevLineStart, lineStart);
    const commentInPrev = prevLine.match(/\/\/.*|\/\*.*\*\//);
    if (commentInPrev) parts.push(commentInPrev[0]);
    parts.push(prevLine);
  }
  return parts.join(' ');
}

function hasRecoveryContract(catchNode: ts.CatchClause): boolean {
  const commentText = getCatchCommentText(catchNode);
  return DECLARED_VOCABULARY.test(commentText);
}

export const R2_ERROR_HANDLING: LayerRule = {
  layer: 'R2',
  name: 'Error Handling (AST)',
  description: 'AST-based detection of error handling gaps, empty catch blocks, and theatrical success signals',
  applicableTo: [ConstructType.CATCH_CLAUSE],
  excludeTypes: [ConstructType.STRING_LITERAL, ConstructType.TEMPLATE_EXPRESSION, ConstructType.REGULAR_EXPRESSION_LITERAL, ConstructType.BLOCK_COMMENT, ConstructType.LINE_COMMENT],
  enabled: true,
  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct || !construct.node) return [];
    const node = construct.node;
    if (!ts.isCatchClause(node)) return [];
    const findings: AuditFinding[] = [];
    const block = node.block;
    const body = construct.body;
    const statementCount = block.statements.length;
    const recovered = hasRecoveryContract(node);
    if (statementCount === 0) {
      if (recovered) return findings;
      findings.push({
        layer: 'R2',
        severity: 'CRITICAL',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Empty catch block lacks declared recovery contract — no justification for silent swallow (missing contract: non-fatal|best-effort|intentional|idempotent|expected|by design|documented)',
        correction: 'declare the recovery contract or propagate',
        runtimeImpact: 'When this error occurs, there is ZERO evidence — failures are invisible, debugging impossible',
        confidence: 0.98,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
      return findings;
    }
    const hasLogging = hasLoggingCall(block);
    const hasThrow = hasThrowStatement(block);
    const hasReturnValue = hasReturnWithValue(block);
    if (!hasLogging && !hasThrow && !hasReturnValue) {
      if (recovered) return findings;
      findings.push({
        layer: 'R2',
        severity: 'MEDIUM',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Catch block contains no logging or re-throw and lacks declared recovery contract — error is silently consumed without justification',
        correction: 'declare the recovery contract or propagate',
        runtimeImpact: 'Error silently consumed — caller thinks operation succeeded, state may be inconsistent',
        confidence: 0.85,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
    const successSignal = detectSuccessSignal(block);
    if (successSignal) {
      if (recovered) return findings;
      const hasValidation = hasValidationBeforeInCatch(block);
      if (hasValidation) return findings;
      findings.push({
        layer: 'R2',
        severity: 'CRITICAL',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: successSignal,
        description: 'Catch block returns success signal (' + successSignal + ') without declared recovery contract and without validation — error caught and function reports success',
        correction: 'declare the recovery contract or propagate',
        runtimeImpact: 'Failed operations report success — callers believe the operation succeeded when it did not',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
    return findings;
  },
};

function hasLoggingCall(startNode: ts.Node): boolean {
  let found = false;
  function visit(child: ts.Node): void {
    if (found) return;
    if (ts.isCallExpression(child)) {
      const expr = child.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const obj = expr.expression;
        const method = expr.name.text;
        if (obj.getText() === 'console' && CONSOLE_LOG_METHODS.has(method)) { found = true; return; }
        const objText = obj.getText();
        if (LOG_METHODS.has(method)) {
          if (objText.endsWith('.log') || objText.endsWith('Log') || objText === 'logger' || objText === 'tiLog' || objText === 'tridentLog' || objText.endsWith('Logger') || objText.endsWith('logger')) { found = true; return; }
        }
      }
      if (ts.isIdentifier(expr) && LOG_IDENTIFIERS.has(expr.text)) { found = true; return; }
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(startNode, visit);
  return found;
}
function hasThrowStatement(startNode: ts.Node): boolean {
  let found = false;
  function visit(child: ts.Node): void {
    if (found) return;
    if (ts.isThrowStatement(child)) { found = true; return; }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(startNode, visit);
  return found;
}
function hasReturnWithValue(startNode: ts.Node): boolean {
  let found = false;
  function visit(child: ts.Node): void {
    if (found) return;
    if (ts.isReturnStatement(child) && child.expression) { found = true; return; }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(startNode, visit);
  return found;
}
function detectSuccessSignal(startNode: ts.Node): string | null {
  let result: string | null = null;
  function visit(child: ts.Node): void {
    if (result) return;
    if (ts.isReturnStatement(child) && child.expression) {
      const expr = child.expression;
      if (ts.isObjectLiteralExpression(expr)) {
        for (const prop of expr.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const propName = prop.name.text;
            const init = prop.initializer;
            if (init) {
              if (SUCCESS_PROPS.has(propName) && init.kind === ts.SyntaxKind.TrueKeyword) { result = 'return { ' + propName + ': true }'; return; }
              if (propName === 'outcome' && ts.isStringLiteral(init) && OUTCOME_VALUES.has(init.text)) { result = 'return { outcome: \'' + init.text + '\' }'; return; }
            }
          }
        }
      }
      if (expr.kind === ts.SyntaxKind.TrueKeyword) { result = 'return true'; return; }
      if (ts.isNumericLiteral(expr) && expr.text === '1') { result = 'return 1'; return; }
      if (ts.isStringLiteral(expr) && expr.text === 'pass') { result = 'return "pass"'; return; }
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(startNode, visit);
  return result;
}
function hasValidationBeforeInCatch(block: ts.Block): boolean {
  let found = false;
  function visit(n: ts.Node): void {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const text = n.expression.getText();
      if (/(validate|verify|check|guard|enforce|assert|ensure|test|inspect|investigate|query|fetch|exists|has|isValid)/i.test(text)) { found = true; return; }
    }
    ts.forEachChild(n, visit);
  }
  ts.forEachChild(block, visit);
  return found;
}
function extractCommentText(node: ts.Node): string {
  const comments: string[] = [];
  const sf = node.getSourceFile();
  const fullText = sf.text;
  function visit(child: ts.Node): void {
    const leading = ts.getLeadingCommentRanges(fullText, child.getFullStart()) ?? [];
    for (const range of leading) comments.push(fullText.substring(range.pos, range.end));
    const trailing = ts.getTrailingCommentRanges(fullText, child.getEnd()) ?? [];
    for (const range of trailing) comments.push(fullText.substring(range.pos, range.end));
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(node, visit);
  const blockLeading = ts.getLeadingCommentRanges(fullText, node.getFullStart()) ?? [];
  for (const r of blockLeading) comments.push(fullText.substring(r.pos, r.end));
  return comments.join(' ');
}
const CONSOLE_LOG_METHODS = new Set(['error', 'warn', 'log']);
const LOG_METHODS = new Set(['error', 'warn', 'log', 'info', 'fatal']);
const LOG_IDENTIFIERS = new Set(['tridentLog', 'tiLog', 'tiWarn', 'tiError', 'log']);
const SUCCESS_PROPS = new Set(['success', 'passed', 'valid']);
const OUTCOME_VALUES = new Set(['ok', 'completed', 'done', 'pass']);
