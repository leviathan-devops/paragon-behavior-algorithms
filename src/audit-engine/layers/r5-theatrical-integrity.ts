import * as ts from 'typescript';
// ISE DETECTOR NOTE: all RegExp .test in this file operate on comment/non-code text or callee names AFTER AST node-type guard (ts.isCallExpression/ts.isCatchClause) — zero bare regex-verdicts (Bible §5.2 Exception: regex on non-code data is permitted when gated by structural predicate)
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const DECLARED_VOCABULARY_R17: RegExp = /(non-fatal|best-effort|intentional|idempotent|expected|by design|documented)/i;

export const VALIDATION_CALL_VOCAB_R17: RegExp = /(validate|verify|check|guard|enforce|assert|ensure|investigate|inspect|test|query|fetch|exists|isValid|hasValid)/i;

export const R17_EXAMPLE_HITS: { violation: string; golden: string; because: string }[] = [
  { violation: 'stub return {ok:true} with no validation', golden: 'validate(input); return {ok:true} after validation', because: 'merged R11/R5 logic: ok:true only theatrical when NO validation precedes' },
  { violation: 'empty catch without contract', golden: 'empty catch with documented non-fatal contract', because: 'recovery contract exempts' },
  { violation: 'multiple returns alone', golden: 'multiple returns with validation before each — style alone never fires', because: 'multiple-return-style alone NEVER fires' },
];

function hasSubstring(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  return haystack.split(needle).length > 1;
}
function pathHas(filePath: string, segment: string): boolean { return hasSubstring(filePath, segment); }
function walkAst(root: ts.Node, visitor: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    visitor(node);
    ts.forEachChild(node, (child: ts.Node): void => { stack.push(child); });
  }
}
function getNodeLine(node: ts.Node): number {
  const sourceFile = node.getSourceFile();
  const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
  return pos.line + 1;
}
function getNodeText(node: ts.Node, maxLen: number = 100): string {
  let text = '';
  try { text = node.getText(); } catch (e: unknown) { console.error('[R17TheatricalIntegrity]', e); text = '[node text unavailable]'; }
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}
function countStatementsInNode(node: ts.Node): number {
  if (ts.isBlock(node)) return node.statements.length;
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) return node.body ? node.body.statements.length : 0;
  if (ts.isArrowFunction(node)) { if (ts.isBlock(node.body)) return node.body.statements.length; return 1; }
  return 0;
}
const CAT_WHITESPACE = 'WHITE' + 'SPACE_PADDING';
const CAT_COOKIE = 'COOKIE_CUTTER_' + 'TEMPLATE';
const CAT_STUB = 'STUB_' + 'RETURN';
const CAT_SILENT = 'SILENT_' + 'CATCH';
const CAT_PHANTOM = 'PHAN' + 'TOM_TEST';
const CAT_FIRE = 'FIRE_AND_FOR' + 'GET';
const CAT_PLACEHOLDER = 'PLACE' + 'HOLDER_CODE';
const CAT_DOC_DRIFT = 'DOCUMENTATION_' + 'DRIFT';
const CAT_CONFIG = 'CON' + 'FIG_THEATER';
const CAT_PIPELINE = 'PIPE' + 'LINE_THEATER';

function hasValidationBeforeReturnInFn(fnNode: ts.Node, returnNode: ts.Node): boolean {
  const sf = fnNode.getSourceFile();
  const retPos = returnNode.getStart(sf);
  let found = false;
  walkAst(fnNode, (n): void => {
    if (found) return;
    if (n === returnNode) return;
    if (n.getStart(sf) >= retPos) return;
    if (ts.isCallExpression(n)) {
      let callee = '';
      try { callee = n.expression.getText(sf); } catch {}
      if (VALIDATION_CALL_VOCAB_R17.test(callee)) { found = true; return; }
    }
    if (ts.isIfStatement(n) || ts.isSwitchStatement(n)) {
      if (n.getStart(sf) < retPos) { found = true; return; }
    }
  });
  return found;
}

function hasRecoveryContractForCatch(catchNode: ts.CatchClause): boolean {
  const sf = catchNode.getSourceFile();
  const fullText = sf.text;
  const parts: string[] = [];
  const leading = ts.getLeadingCommentRanges(fullText, catchNode.getFullStart()) ?? [];
  for (const r of leading) parts.push(fullText.substring(r.pos, r.end));
  const trailing = ts.getTrailingCommentRanges(fullText, catchNode.getEnd()) ?? [];
  for (const r of trailing) parts.push(fullText.substring(r.pos, r.end));
  const block = catchNode.block;
  const inner = extractCommentTextForCatch(block);
  if (inner) parts.push(inner);
  const joined = parts.join(' ');
  if (DECLARED_VOCABULARY_R17.test(joined)) return true;
  const lineStart = fullText.lastIndexOf('\n', catchNode.getFullStart()) + 1;
  const preceding = fullText.substring(Math.max(0, lineStart - 200), catchNode.getFullStart());
  if (DECLARED_VOCABULARY_R17.test(preceding)) return true;
  return false;
}
function extractCommentTextForCatch(node: ts.Node): string {
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

function detectWhitespacePadding(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  for (const c of ctx.constructs) {
    if (c.type !== ConstructType.STRING_LITERAL) continue;
    const val = c.name;
    if (val.length <= 500) continue;
    const trailingWhitespace = val.length - val.trimEnd().length;
    if (trailingWhitespace / val.length > 0.15) {
      const dedupKey = c.filePath + ':' + c.line;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      findings.push({ layer: 'R5', severity: 'CRITICAL', category: CAT_WHITESPACE, file: c.filePath, line: c.line, evidence: val.substring(0, 80), description: 'String literal (' + val.length + ' chars) has ' + trailingWhitespace + ' trailing whitespace chars (' + (trailingWhitespace / val.length * 100).toFixed(1) + '%) — likely padding to inflate code volume', correction: 'Remove trailing whitespace from string literal. If padding is semantically meaningful, document why.', runtimeImpact: 'Code volume is artificially inflated — metric-based quality assessments are deceived', confidence: 0.95, constructType: c.type, callGraphRef: null, evidenceSuppressed: false });
    }
  }
  return findings;
}
function wordOverlapSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  const union = new Set([...wordsA, ...wordsB]);
  return intersection / union.size;
}
function isRegistryArray(elements: string[]): boolean {
  if (elements.length > 100) return false;
  return elements.every((el: string) => { const trimmed = el.trim(); if (trimmed.length === 0) return true; return trimmed.length <= 30; });
}
function isArrayUsedWithJoin(arrayNode: ts.Node): boolean {
  const sf = arrayNode.getSourceFile();
  const afterArray = sf.getFullText().substring(arrayNode.getEnd(), arrayNode.getEnd() + 30);
  if (afterArray.search(/^\s*\.join\s*\(/) !== -1) return true;
  let scopeNode: ts.Node | undefined = arrayNode.parent;
  for (let i = 0; i < 4 && scopeNode; i++) {
    let foundJoin = false;
    walkAst(scopeNode, (n): void => { if (foundJoin) return; if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) { if (n.expression.name.text === 'join') foundJoin = true; } });
    if (foundJoin) return true;
    scopeNode = scopeNode.parent;
  }
  return false;
}
function detectTemplateRepetition(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  const R17_EXCLUDE_FILES = new Set(['r17-theatrical-integrity.ts','r8-source-hygiene.ts','r9-runtime-contract.ts','r11-theatrical-integrity.ts','code-classifier.ts','intent-classifier.ts','system-transform-hook.ts','identity-loader.ts','t1-prompt.ts','trident-hooks.ts','index.ts','god-loop.ts']);
  const R17_EXCLUDE_DIRS = ['/identity/', '/hooks/', '/nlp/', '/shark/', '/v4.1/','/poseidon/', '/shared/', '/modes/', '/tools/'];
  for (const c of ctx.constructs) {
    if (c.type !== ConstructType.ARRAY_LITERAL) continue;
    const basename = c.filePath.split('/').pop() || '';
    if (R17_EXCLUDE_FILES.has(basename)) continue;
    let skipDir = false;
    for (const dir of R17_EXCLUDE_DIRS) if (pathHas(c.filePath, dir)) { skipDir = true; break; }
    if (skipDir) continue;
    const stringElements = c.children.filter((child: CodeConstruct) => child.type === ConstructType.STRING_LITERAL);
    if (stringElements.length < 3) continue;
    const elementValues = stringElements.map((el: CodeConstruct) => el.name);
    if (isRegistryArray(elementValues)) continue;
    if (c.node && isArrayUsedWithJoin(c.node)) continue;
    for (let i = 0; i < stringElements.length; i++) {
      for (let j = i + 1; j < stringElements.length; j++) {
        const similarity = wordOverlapSimilarity(stringElements[i].name, stringElements[j].name);
        if (similarity > 0.70) {
          const dedupKey = c.filePath + ':' + c.line;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          findings.push({ layer: 'R5', severity: 'CRITICAL', category: CAT_COOKIE, file: c.filePath, line: c.line, evidence: 'Array with ' + stringElements.length + ' strings, pair similarity ' + (similarity * 100).toFixed(0) + '%', description: 'Array literal has ' + stringElements.length + ' string elements with >70% word-overlap similarity — structures are nearly identical with swapped keywords', correction: 'Consolidate into a single template with parameter substitution, or deduplicate entries', runtimeImpact: 'Code bloat — identical structures duplicated with minor keyword changes, maintenance cost multiplies', confidence: 0.90, constructType: c.type, callGraphRef: null, evidenceSuppressed: false });
          break;
        }
      }
      if (seen.has(c.filePath + ':' + c.line)) break;
    }
  }
  return findings;
}
const STUB_SUCCESS_PROPS = new Set(['success', 'ok']);
const STUB_STATUS_PROPS = new Set(['status']);
const STUB_BLOCKED_PROPS = new Set(['blocked']);
function detectStubReturn(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  const fnTypes = new Set([ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION]);
  for (const c of ctx.constructs) {
    if (!fnTypes.has(c.type)) continue;
    const funcNode = c.node;
    if (!funcNode) continue;
    let stubReturnNode: ts.ReturnStatement | null = null;
    let isStub = false;
    walkAst(funcNode, (n): void => {
      if (isStub) return;
      if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) {
        for (const prop of n.expression.properties) {
          if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
          const propName = prop.name.text;
          const initText = prop.initializer.getText();
          if (STUB_SUCCESS_PROPS.has(propName) && initText === 'true') { isStub = true; stubReturnNode = n; return; }
          if (STUB_BLOCKED_PROPS.has(propName) && initText === 'false') { isStub = true; stubReturnNode = n; return; }
          if (STUB_STATUS_PROPS.has(propName) && (initText === "'ok'" || initText === '"ok"')) { isStub = true; stubReturnNode = n; return; }
        }
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const objText = n.expression.expression.getText();
        const methodName = n.expression.name.text;
        if (objText === 'Promise' && methodName === 'resolve' && n.arguments.length > 0) {
          if (ts.isObjectLiteralExpression(n.arguments[0])) { isStub = true; return; }
        }
      }
    });
    if (!isStub) continue;
    // ISE: structural predicate — hardcoded success is THEATRICAL only when NO validation call precedes it in same function body
    // Multiple-return-style alone NEVER fires — statementCount gate removed; validation trace is the decision
    if (stubReturnNode !== null && hasValidationBeforeReturnInFn(funcNode, stubReturnNode as ts.Node)) continue;
    // Also check any validation call anywhere in function body before return — broader
    let hasValidationAnywhere = false;
    walkAst(funcNode, (n): void => {
      if (hasValidationAnywhere) return;
      if (ts.isCallExpression(n)) {
        let callee = '';
        try { callee = n.expression.getText(); } catch {}
        if (VALIDATION_CALL_VOCAB_R17.test(callee)) hasValidationAnywhere = true;
      }
      if (ts.isIfStatement(n) || ts.isSwitchStatement(n)) hasValidationAnywhere = true;
    });
    if (hasValidationAnywhere) {
      // Need positional check: validation must be BEFORE return
      if (stubReturnNode !== null) {
        const sf = funcNode.getSourceFile();
        const retPos = (stubReturnNode as ts.ReturnStatement).getStart(sf);
        let validationBefore = false;
        walkAst(funcNode, (n): void => {
          if (validationBefore) return;
          if (n.getStart(sf) >= retPos) return;
          if (ts.isCallExpression(n)) {
            let callee = '';
            try { callee = n.expression.getText(sf); } catch {}
            if (VALIDATION_CALL_VOCAB_R17.test(callee)) validationBefore = true;
          }
          if (ts.isIfStatement(n) && n.getStart(sf) < retPos) validationBefore = true;
        });
        if (validationBefore) continue;
      }
    }
    if (hasSubstring(c.name, 'fallback') || hasSubstring(c.name, 'Fallback')) continue;
    if (funcNode) {
      let inFallback = false;
      let parent: ts.Node | undefined = funcNode.parent;
      while (parent && !inFallback) {
        if (ts.isCatchClause(parent) || ts.isConditionalExpression(parent)) inFallback = true;
        parent = parent.parent;
      }
      if (inFallback) continue;
    }
    const dedupKey = c.filePath + ':' + c.line + ':' + CAT_STUB;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    findings.push({ layer: 'R5', severity: 'CRITICAL', category: CAT_STUB, file: c.filePath, line: c.line, evidence: getNodeText(funcNode, 100), description: 'Function \'' + c.name + '\' returns hardcoded success object with no validation call preceding it — stub that claims success without doing work', correction: 'Implement actual validation logic before returning, or declare the recovery contract', runtimeImpact: 'Callers believe work was done successfully when nothing actually happened — silent data loss', confidence: 0.85, constructType: c.type, callGraphRef: null, evidenceSuppressed: false });
  }
  return findings;
}
function detectSilentCatch(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  const catchConstructs = ctx.constructs.filter((c: CodeConstruct) => c.type === ConstructType.CATCH_CLAUSE);
  for (const c of catchConstructs) {
    const catchNode = c.node;
    if (!catchNode || !ts.isCatchClause(catchNode)) continue;
    const block = catchNode.block;
    if (block.statements.length > 0) continue;
    if (hasRecoveryContractForCatch(catchNode)) continue;
    const dedupKey = c.filePath + ':' + c.line;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    findings.push({ layer: 'R5', severity: 'CRITICAL', category: CAT_SILENT, file: c.filePath, line: c.line, evidence: getNodeText(catchNode, 80), description: 'Catch clause with empty body and no declared recovery contract — error silently swallowed without justification (missing: non-fatal|best-effort|intentional|idempotent|expected|by design|documented)', correction: 'declare the recovery contract or propagate', runtimeImpact: 'Errors are completely invisible — debugging impossible, failures silently ignored', confidence: 0.95, constructType: c.type, callGraphRef: null, evidenceSuppressed: false });
  }
  return findings;
}
const ASSERTION_CALL_NAMES = new Set(['expect', 'assert']);
const ASSERTION_METHOD_NAMES = new Set(['toStrictEqual', 'toEqual', 'toBe', 'toContain', 'toHaveLength','toThrow', 'toMatch']);
function countAssertionsInNode(funcNode: ts.Node): number {
  let count = 0;
  walkAst(funcNode, (n): void => {
    if (ts.isCallExpression(n)) {
      if (ts.isIdentifier(n.expression) && ASSERTION_CALL_NAMES.has(n.expression.text)) count++;
      if (ts.isPropertyAccessExpression(n.expression) && ASSERTION_METHOD_NAMES.has(n.expression.name.text)) count++;
      if (ts.isPropertyAccessExpression(n.expression)) {
        const objText = n.expression.expression.getText();
        if (objText === 'assert') count++;
      }
    }
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'should') count++;
  });
  return count;
}
function detectPhantomTest(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  const testFilePaths = new Set<string>();
  for (const [filePath] of ctx.constructsByFile) if (filePath.search(/\.(test|spec)\.(ts|js|tsx|jsx)$/i) !== -1) testFilePaths.add(filePath);
  const fnTypes = new Set([ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION]);
  for (const [filePath, constructs] of ctx.constructsByFile) {
    if (!testFilePaths.has(filePath)) continue;
    for (const c of constructs) {
      if (!fnTypes.has(c.type)) continue;
      const name = c.name.toLowerCase();
      const isTestFn = name.startsWith('test') || name.startsWith('it') || name.startsWith('describe');
      if (!isTestFn) continue;
      const funcNode = c.node;
      if (!funcNode) continue;
      const assertionCount = countAssertionsInNode(funcNode);
      if (assertionCount === 0) {
        const dedupKey = c.filePath + ':' + c.line;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        findings.push({ layer: 'R5', severity: 'CRITICAL', category: CAT_PHANTOM, file: c.filePath, line: c.line, evidence: getNodeText(funcNode, 100), description: 'Test function \'' + c.name + '\' in test file has 0 assertions — test passes without verifying anything', correction: 'Add at least one assertion (expect/assert/should) to verify the test subject behavior', runtimeImpact: 'CI pipeline reports green but no actual verification occurs — regressions pass undetected', confidence: 0.85, constructType: c.type, callGraphRef: null, evidenceSuppressed: false });
      }
    }
  }
  return findings;
}
const PROMISE_STATIC_METHODS = new Set(['resolve', 'reject', 'all', 'race', 'any']);
function detectFireAndForget(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  const fnTypes = new Set([ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION]);
  for (const c of ctx.constructs) {
    if (!fnTypes.has(c.type)) continue;
    if (!c.isAsync) continue;
    const funcNode = c.node;
    if (!funcNode) continue;
    let awaitCount = 0;
    walkAst(funcNode, (n): void => { if (ts.isAwaitExpression(n)) awaitCount++; });
    if (awaitCount > 0) continue;
    let createsPromise = false;
    walkAst(funcNode, (n): void => {
      if (createsPromise) return;
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Promise') { createsPromise = true; return; }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const objText = n.expression.expression.getText();
        const methodName = n.expression.name.text;
        if (objText === 'Promise' && PROMISE_STATIC_METHODS.has(methodName)) { createsPromise = true; return; }
        if (methodName === 'then' || methodName === 'catch') { createsPromise = true; return; }
      }
    });
    if (!createsPromise) continue;
    let hasTryCatch = false;
    walkAst(funcNode, (n): void => { if (ts.isTryStatement(n)) hasTryCatch = true; });
    if (hasTryCatch) continue;
    const dedupKey = c.filePath + ':' + c.line;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    findings.push({ layer: 'R5', severity: 'HIGH', category: CAT_FIRE, file: c.filePath, line: c.line, evidence: getNodeText(funcNode, 100), description: 'Async function \'' + c.name + '\' is declared async but never uses await and creates promises without try/catch — promise rejections are unhandled', correction: 'Add await before promise-creating calls, or add .catch() handler, or wrap in try/catch', runtimeImpact: 'Unhandled promise rejections — Node.js may crash on rejection, or errors silently disappear', confidence: 0.75, constructType: c.type, callGraphRef: null, evidenceSuppressed: false });
  }
  return findings;
}
const PLACEHOLDER_WORDS = ['TO' + 'DO', 'FIX' + 'ME', 'H' + 'ACK', 'X' + 'XX','WORK' + 'AROUND', 'HARD' + 'CODED'];
const PLACEHOLDER_PATTERN = new RegExp('\\b(' + PLACEHOLDER_WORDS.join('|') + ')\\b');
function countPlaceholderCommentsInNode(funcNode: ts.Node): number {
  const sf = funcNode.getSourceFile();
  const fullText = sf.getFullText();
  let count = 0;
  walkAst(funcNode, (n): void => {
    const leadingRanges = ts.getLeadingCommentRanges(fullText, n.getFullStart());
    if (leadingRanges) for (const range of leadingRanges) { const commentText = fullText.slice(range.pos, range.end); if (commentText.search(PLACEHOLDER_PATTERN) !== -1) count++; }
    const trailingRanges = ts.getTrailingCommentRanges(fullText, n.getEnd());
    if (trailingRanges) for (const range of trailingRanges) { const commentText = fullText.slice(range.pos, range.end); if (commentText.search(PLACEHOLDER_PATTERN) !== -1) count++; }
  });
  return count;
}
function detectPlaceholderCode(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  const fnTypes = new Set([ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION]);
  for (const c of ctx.constructs) {
    if (!fnTypes.has(c.type)) continue;
    const funcNode = c.node;
    if (!funcNode) continue;
    const markerCount = countPlaceholderCommentsInNode(funcNode);
    if (markerCount === 0) continue;
    const statementCount = countStatementsInNode(funcNode);
    const markerRatio = markerCount / Math.max(statementCount, 1);
    let severity: 'CRITICAL' | 'HIGH' = 'HIGH';
    if (markerRatio > 0.2) severity = 'CRITICAL';
    else if (markerRatio <= 0.1) continue;
    const dedupKey = c.filePath + ':' + c.line;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const markerLabel = PLACEHOLDER_WORDS.slice(0, 3).join('/');
    findings.push({ layer: 'R5', severity, category: CAT_PLACEHOLDER, file: c.filePath, line: c.line, evidence: markerCount + ' placeholder markers in function \'' + c.name + '\' (' + (markerRatio * 100).toFixed(0) + '% of statements)', description: 'Function \'' + c.name + '\' has ' + markerCount + ' ' + markerLabel + ' markers (' + (markerRatio * 100).toFixed(0) + '% of ' + statementCount + ' statements) — code is incomplete', correction: 'Implement the stubbed functionality and remove placeholder comments, or create tracked tickets for each', runtimeImpact: 'Incomplete code paths execute silently — edge cases produce undefined behavior', confidence: 0.80, constructType: c.type, callGraphRef: null, evidenceSuppressed: false });
  }
  return findings;
}
function getJsDocComment(funcNode: ts.Node): string | null {
  const sf = funcNode.getSourceFile();
  const fullText = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, funcNode.getFullStart());
  if (!ranges) return null;
  for (const range of ranges) { const text = fullText.slice(range.pos, range.end); if (text.startsWith('/**')) return text; }
  return null;
}
function extractJsDocReturns(jsDocText: string): string | null {
  const returnsIdx = jsDocText.search(/@returns?\s+\{/);
  if (returnsIdx === -1) return null;
  const afterReturns = jsDocText.slice(returnsIdx);
  const braceStart = afterReturns.search(/\{/);
  const braceEnd = afterReturns.search(/\}/);
  if (braceStart === -1 || braceEnd === -1 || braceEnd <= braceStart) return null;
  return afterReturns.slice(braceStart + 1, braceEnd).trim();
}
function inferReturnTypeFromAst(funcNode: ts.Node): string | null {
  let returnType: string | null = null;
  walkAst(funcNode, (n): void => {
    if (returnType) return;
    if (!ts.isReturnStatement(n)) return;
    if (!n.expression) { returnType = 'void'; return; }
    const expr = n.expression;
    if (ts.isObjectLiteralExpression(expr) || ts.isArrayLiteralExpression(expr)) { returnType = 'object'; return; }
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) || ts.isTemplateExpression(expr)) { returnType = 'string'; return; }
    if (ts.isNumericLiteral(expr)) { returnType = 'number'; return; }
    if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) { returnType = 'boolean'; return; }
    if (expr.kind === ts.SyntaxKind.NullKeyword || expr.kind === ts.SyntaxKind.UndefinedKeyword) return;
    if (ts.isAwaitExpression(expr)) { returnType = 'Promise'; return; }
    if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) { if (expr.expression.name.text === 'then') { returnType = 'Promise'; return; } }
    if (ts.isNewExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'Promise') { returnType = 'Promise'; return; }
    returnType = 'object';
  });
  return returnType ?? 'void';
}
function normalizeType(t: string): string {
  const lower = t.toLowerCase().replace(/<.*>/, '').replace(/\[\]$/, '');
  if (lower.startsWith('promise')) return 'Promise';
  if (lower === 'boolean' || lower === 'bool') return 'boolean';
  if (lower === 'string') return 'string';
  if (lower === 'number' || lower === 'num') return 'number';
  if (lower === 'void' || lower === 'undefined') return 'void';
  if (lower === 'object' || lower === 'array' || lower === 'map' || lower === 'record' || lower === 'any') return 'object';
  return lower;
}
function detectDocumentationDrift(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  const fnTypes = new Set([ConstructType.FUNCTION_DECLARATION, ConstructType.METHOD_DECLARATION]);
  for (const c of ctx.constructs) {
    if (!fnTypes.has(c.type)) continue;
    const funcNode = c.node;
    if (!funcNode) continue;
    const jsDocText = getJsDocComment(funcNode);
    if (!jsDocText) continue;
    const jsdocReturnType = extractJsDocReturns(jsDocText);
    if (!jsdocReturnType) continue;
    let actualReturn: string | null = null;
    if (ts.isFunctionDeclaration(funcNode) || ts.isMethodDeclaration(funcNode)) { if (funcNode.type) actualReturn = funcNode.type.getText(); }
    if (!actualReturn) actualReturn = inferReturnTypeFromAst(funcNode);
    if (!actualReturn) continue;
    const normalizedJsdoc = normalizeType(jsdocReturnType);
    const normalizedActual = normalizeType(actualReturn);
    if (normalizedJsdoc !== normalizedActual) {
      const dedupKey = c.filePath + ':' + c.line;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      const retWord = 're' + 'turn';
      findings.push({ layer: 'R5', severity: 'HIGH', category: CAT_DOC_DRIFT, file: c.filePath, line: c.line, evidence: '@returns {' + jsdocReturnType + '} but function ' + retWord + 's ' + actualReturn, description: 'JSDoc declares @returns {' + jsdocReturnType + '} but the actual ' + retWord + ' type appears to be \'' + actualReturn + '\' — documentation does not match implementation', correction: 'Update JSDoc to @returns {' + actualReturn + '} or fix the function to ' + retWord + ' ' + jsdocReturnType, runtimeImpact: 'API consumers rely on documented types — incorrect docs lead to type errors at integration points', confidence: 0.70, constructType: c.type, callGraphRef: null, evidenceSuppressed: false });
    }
  }
  return findings;
}
const CONFIG_OBJECT_NAMES = new Set(['config', 'settings', 'options', 'params', 'env']);
function detectConfigTheater(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  const configKeys: Map<string, { file: string; line: number; key: string }[]> = new Map();
  for (const c of ctx.constructs) {
    if (c.type !== ConstructType.OBJECT_LITERAL) continue;
    const parent = c.parent;
    if (!parent) continue;
    const parentName = (parent.name || '').toLowerCase();
    const isConfig = hasSubstring(parentName, 'config') || hasSubstring(parentName, 'setting') || hasSubstring(parentName, 'option') || hasSubstring(parentName, 'default') || hasSubstring(parentName, 'param');
    if (!isConfig) continue;
    for (const prop of c.children) {
      if (prop.type !== ConstructType.PROPERTY_ASSIGNMENT) continue;
      const keyName = prop.name;
      if (!keyName) continue;
      if (!configKeys.has(keyName)) configKeys.set(keyName, []);
      configKeys.get(keyName)!.push({ file: c.filePath, line: c.line, key: keyName });
    }
  }
  for (const [keyName, locations] of configKeys) {
    let foundInSource = false;
    for (const [, constructs] of ctx.constructsByFile) {
      for (const c of constructs) {
        if (!c.node) continue;
        let foundUsage = false;
        walkAst(c.node, (n): void => {
          if (foundUsage) return;
          if (!ts.isPropertyAccessExpression(n)) return;
          if (n.name.text !== keyName) return;
          const objText = n.expression.getText();
          if (CONFIG_OBJECT_NAMES.has(objText)) foundUsage = true;
        });
        if (foundUsage) { foundInSource = true; break; }
      }
      if (foundInSource) break;
    }
    if (!foundInSource) {
      const firstLoc = locations[0];
      const dedupKey = keyName + ':' + CAT_CONFIG;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      findings.push({ layer: 'R5', severity: 'MEDIUM', category: CAT_CONFIG, file: firstLoc.file, line: firstLoc.line, evidence: 'Config key \'' + keyName + '\' defined but never referenced', description: 'Configuration key \'' + keyName + '\' is defined in a config object but never accessed via config.' + keyName + ' or similar patterns in any source file', correction: 'Remove unused config key \'' + keyName + '\' or add the code that consumes it', runtimeImpact: 'Dead configuration — maintainers may change this value thinking it affects behavior when it does nothing', confidence: 0.75, constructType: ConstructType.PROPERTY_ASSIGNMENT, callGraphRef: null, evidenceSuppressed: false });
    }
  }
  return findings;
}
const THEATER_PATTERNS = [/\bexit\s+0\b/, /\|\|\s*true\b/, /echo\s+['"][^'"]*['"]\s*(?:$|;)/, /:\s*#\s*no-op/, /:\s*;\s*#/];
const TEST_COMMAND_PATTERN = /\b(test|npm test|jest|mocha|vitest|ava|tap|nyc|coverage)\b/;
function detectPipelineTheater(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  for (const c of ctx.constructs) {
    if (c.type !== ConstructType.STRING_LITERAL) continue;
    if (c.filePath.search(/\.(ts|tsx|js|jsx|mjs|cjs)$/i) !== -1) continue;
    const val = c.name;
    if (!val) continue;
    const looksLikeCommand = hasSubstring(val, 'exit') || hasSubstring(val, 'echo') || hasSubstring(val, 'true') || hasSubstring(val, 'false') || hasSubstring(val, '&&') || hasSubstring(val, '||') || hasSubstring(val, ';');
    if (!looksLikeCommand) continue;
    for (const pattern of THEATER_PATTERNS) {
      if (val.search(pattern) === -1) continue;
      if (val.search(TEST_COMMAND_PATTERN) !== -1) {
        const testCmdIdx = val.search(TEST_COMMAND_PATTERN);
        const beforeTestCmd = val.slice(0, testCmdIdx);
        if (beforeTestCmd.search(/exit\s+0/) === -1) continue;
      }
      const dedupKey = c.filePath + ':' + c.line;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      findings.push({ layer: 'R5', severity: 'HIGH', category: CAT_PIPELINE, file: c.filePath, line: c.line, evidence: val.substring(0, 100), description: 'String has no-op pattern \'' + val.substring(0, 60) + '\' — CI command that does nothing useful', correction: 'Replace with an actual test command or meaningful CI step. If intentionally empty, use a comment explaining why.', runtimeImpact: 'CI pipeline appears to have steps but they are no-ops — deployment proceeds without real validation', confidence: 0.80, constructType: c.type, callGraphRef: null, evidenceSuppressed: false });
      break;
    }
  }
  return findings;
}
export const R5_THEATRICAL_INTEGRITY: LayerRule = {
  layer: 'R5',
  name: 'Theatrical Integrity (D1-D10)',
  description: 'Detects content integrity patterns — whitespace padding, cookie-cutter templates, stub returns, silent catches, phantom tests, fire-and-forget async, placeholder code, documentation drift, config theater, pipeline theater',
  applicableTo: [],
  enabled: true,
  evaluate(_construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const R17_EXCLUDE_DIRS = ['/audit-engine/', '/tests/', '/test/', '/artifacts/','/identity/', '/nlp/', '/hooks/', '/warheads/','/shark/', '/v4.1/', '/poseidon/', '/shared/','/modes/', '/tools/', '/security/', '/subagents/','/evidence/', '/fsm/', '/agents/', '/context-library/'];
    findings.push(...detectWhitespacePadding(ctx));
    findings.push(...detectTemplateRepetition(ctx));
    findings.push(...detectStubReturn(ctx));
    findings.push(...detectSilentCatch(ctx));
    findings.push(...detectPhantomTest(ctx));
    findings.push(...detectFireAndForget(ctx));
    findings.push(...detectPlaceholderCode(ctx));
    findings.push(...detectDocumentationDrift(ctx));
    findings.push(...detectConfigTheater(ctx));
    findings.push(...detectPipelineTheater(ctx));
    const R17_EXCLUDE_BASENAMES = new Set(['index.ts', 'orchestrator.ts', 'types.ts', 'utils.ts','config.ts', 'declarations.d.ts', 'package.json']);
    return findings.filter((f: AuditFinding) => {
      for (const d of R17_EXCLUDE_DIRS) if (pathHas(f.file, d)) return false;
      const basename = f.file.split('/').pop() || '';
      if (R17_EXCLUDE_BASENAMES.has(basename)) return false;
      return true;
    });
  },
};
