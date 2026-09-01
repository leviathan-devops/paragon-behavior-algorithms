/**
 * Threat Modeling Engine — DP L2 Phase 2
 *
 * Implements the 6 Questions scoring system that mechanically detects code
 * threats using AST analysis. All code-body checks walk the TypeScript parse
 * tree (Order 2+) — no regex-based semantic detection on source.
 *
 * Questions:
 *   Q1 EXIST          (+35)            Does the construct exist in source?
 *   Q2 CALLED         (+15 per, +30)   Is the function/tool/class actually called?
 *   Q3 DOES-WHAT-SAYS (+10 per, +30)   Does the body implement what the spec says?
 *   Q4 MATCHES-SPEC   (+25 per, +50)   Does the code structurally match the spec?
 *   Q5 THEATRICAL     (+80 + CRIT)     Is the function theatrical/fake?
 *   Q6 COPIED         (+5 per, +15)    Are there copy-paste duplicates?
 */

import * as ts from 'typescript';
import {ConstructType, type CodeConstruct, type CallGraph} from '../audit-engine/types.ts';
import type {DiscoveryResult} from '../shared/auto-discover.ts';
import type { RequirementSection } from './deep-planning-artifact.ts';

// ============================================================================
// EXPORTED TYPES
// ============================================================================

/** A single threat finding tied to one of the 6 Questions. */
export interface ThreatFinding {
  file?: string;
  line?: number;
  description: string;
  question: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6';
}

/** A grouped threat report for one pattern (one question category). */
export interface ThreatReport {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  pattern: string;
  defeatVectors: string[];
  findings: ThreatFinding[];
}

// ============================================================================
// AST HELPERS (Order 2 analysis)
// ============================================================================

/** Collect all CallExpression identifier texts from an AST subtree via forEachChild. */
function collectCallNames(node: ts.Node): string[] {
  const names: string[] = [];
  function visit(n: ts.Node): void {
    if (ts.isCallExpression(n)) {
      const expr = n.expression;
      if (ts.isIdentifier(expr)) {
        names.push(expr.text);
      } else if (ts.isPropertyAccessExpression(expr)) {
        names.push(expr.name.text);
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return names;
}

/** Build an ordered list of AST node kind names — used for Q6 structural fingerprinting. */
function astFingerprint(node: ts.Node): string[] {
  const types: string[] = [];
  function walk(n: ts.Node): void {
    types.push(ts.SyntaxKind[n.kind]);
    ts.forEachChild(n, walk);
  }
  ts.forEachChild(node, walk);
  return types;
}

/** Jaccard similarity over two node-type sets (0..1). Empty bodies return 0. */
function fingerprintSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Check whether a return statement's expression is trivially literal (theatrical). */
function isLiteralReturn(stmt: ts.ReturnStatement): boolean {
  const expr = stmt.expression;
  if (!expr) return true;
  if (ts.isStringLiteral(expr) || ts.isNumericLiteral(expr)) return true;
  if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (expr.kind === ts.SyntaxKind.NullKeyword) return true;
  // Object literals are NOT literal returns — they may be success claims ({ valid: true })
  // These are handled by the side-effect verification check (Check 2) which properly
  // walks backwards to find preceding work. Do not classify them as literal here.
  return false;
}

function isLiteralLike(expr: ts.Expression): boolean {
  return ts.isStringLiteral(expr) || ts.isNumericLiteral(expr) ||
    expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword ||
    expr.kind === ts.SyntaxKind.NullKeyword;
}

/** Detect empty catch clauses by walking the AST. */
function hasEmptyCatch(node: ts.Node): boolean {
  let found = false;
  function visit(n: ts.Node): void {
    if (ts.isCatchClause(n) && n.block.statements.length === 0) found = true;
    ts.forEachChild(n, visit);
  }
  visit(node);
  return found;
}

/** Known non-Promise call patterns that should not be flagged as floating promises. */
const KNOWN_NON_PROMISE_PREFIXES = ['console.log', 'console.error', 'console.warn', 'console.info', 'console.debug', 'process.exit', 'require', 'import'];

/** Known Promise-returning call patterns — bare calls matching these ARE floating promises. */
const KNOWN_PROMISE_RETURNING_PREFIXES = ['fetch', 'axios', 'import(', 'setTimeout', 'setInterval', 'crypto.subtle'];

/**
 * Detect floating promises: bare CallExpression statements without await.
 *
 * Strategy:
 * - In async functions: bare calls are likely floating promises (that's why
 *   the function is async). Flag all except KNOWN_NON_PROMISE_PREFIXES.
 * - In non-async functions: only flag calls that match known Promise-returning
 *   patterns (fetch, axios, etc.). A bare writeLog() call in a sync function
 *   is NOT a floating promise.
 */
function hasFloatingPromise(node: ts.Node, isAsync: boolean): boolean {
  let found = false;
  function visit(n: ts.Node): void {
    if (ts.isExpressionStatement(n) && ts.isCallExpression(n.expression)) {
      const callText = n.expression.getText();
      if (isAsync) {
        // In async functions, bare calls are likely floating promises.
        // Exclude known non-Promise patterns (console.log, process.exit, etc.).
        if (!KNOWN_NON_PROMISE_PREFIXES.some(p => callText.startsWith(p))) {
          found = true;
        }
      } else {
        // In non-async functions, only flag known Promise-returning patterns.
        // A bare sync call (e.g. writeLog(x)) is NOT a floating promise.
        if (KNOWN_PROMISE_RETURNING_PREFIXES.some(p => callText.startsWith(p))) {
          found = true;
        }
      }
    }
    if (ts.isFunctionLike(n) && n !== node) return; // don't descend into nested functions
    ts.forEachChild(n, visit);
  }
  visit(node);
  return found;
}

// ============================================================================
// VERB → CALL PATTERN MAPPING (for Q3)
// ============================================================================

const VERB_CALL_PATTERNS: Record<string, string[]> = {
  validate: ['validate', 'assert', 'expect', 'check', 'verify', 'schema', 'isValid'],
  generate: ['generate', 'create', 'build', 'produce', 'make', 'construct'],
  parse: ['parse', 'split', 'tokenize', 'lex', 'extract'],
  write: ['write', 'save', 'store', 'persist', 'output', 'flush'],
  read: ['read', 'load', 'fetch', 'get', 'retrieve', 'open'],
  transform: ['transform', 'convert', 'map', 'reduce', 'serialize', 'deserialize'],
  analyze: ['analyze', 'examine', 'inspect', 'evaluate', 'audit', 'scan'],
  process: ['process', 'handle', 'execute', 'run', 'dispatch', 'perform'],
  verify: ['verify', 'check', 'validate', 'confirm', 'assert', 'ensure'],
  test: ['test', 'assert', 'expect', 'run', 'execute', 'describe'],
  compute: ['compute', 'calculate', 'evaluate', 'measure', 'count'],
  search: ['search', 'find', 'filter', 'query', 'match', 'lookup'],
};

const ACTION_VERBS = Object.keys(VERB_CALL_PATTERNS);

/** Extract action verbs from free-text requirement content. */
function extractVerbs(text: string): string[] {
  const lower = text.toLowerCase();
  return ACTION_VERBS.filter(v => lower.includes(v));
}

/** Check whether any actual call name matches the expected verb's call patterns. */
function verbHasMatchingCall(verb: string, callNames: string[]): boolean {
  const patterns = VERB_CALL_PATTERNS[verb];
  if (!patterns) return true; // unknown verb — don't flag
  return callNames.some(cn => patterns.some(p => cn.toLowerCase().includes(p)));
}

// ============================================================================
// Q1: EXIST  (+35)
// ============================================================================

function checkQ1Exist(constructs: CodeConstruct[], discovery: DiscoveryResult): ThreatReport | null {
  const findings: ThreatFinding[] = [];
  
  // Q1 checks DISCOVERY-LEVEL existence: verify code sections have non-trivial content
  if (discovery && discovery.codeSections) {
    for (const section of discovery.codeSections) {
      const code = (section.code || '').trim();
      // Remove comments to measure real code
      const realCode = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '')
        .trim();
      
      if (realCode.length === 0) {
        findings.push({
          file: section.filePath,
          line: section.lineStart,
          description: `Code section "${section.sectionName}" has no real code — empty after comment removal`,
          question: 'Q1',
        });
      }
    }
  }
  
  if (findings.length === 0) return null;
  return {
    severity: 'HIGH',
    score: 35,
    pattern: 'MISSING_IMPLEMENTATION',
    defeatVectors: ['Inject empty section → code exists but body is empty → allows missing implementation to pass as real'],
    findings,
  };
}

// ============================================================================
// Q2: CALLED  (+15 per uncalled, max +30)
// ============================================================================

function checkQ2Called(constructs: CodeConstruct[], callGraph: CallGraph): ThreatReport | null {
  const findings: ThreatFinding[] = [];
  const visited = new Set<string>();

  const callableConstructs = constructs.filter(c => 
    c.type === ConstructType.FUNCTION_DECLARATION ||
    c.type === ConstructType.ARROW_FUNCTION ||
    c.type === ConstructType.METHOD_DECLARATION ||
    c.type === ConstructType.CLASS_DECLARATION
  );

  for (const c of callableConstructs) {
    if (visited.has(c.name)) continue;
    visited.add(c.name);
    if (c.name === 'constructor') continue;  // constructors invoked via 'new', not direct calls

    const entry = callGraph.entries.get(c.name);
    // Also check common alias patterns (import { x as y })
    // If not found by direct name, check if any call graph entry has callers
    // that reference this construct's original name in import statements
    if (!entry || entry.callSites.length === 0) {
      // Check if the construct IS called under a different name
      // by scanning ALL call graph entries for matching file/line
      let foundViaAlias = false;
      for (const [key, value] of callGraph.entries) {
        if (key !== c.name && value.callSites.some(cs => cs.callSiteFile === c.filePath)) {
          foundViaAlias = true;
          break;
        }
      }
      if (foundViaAlias) continue; // Called via alias — not dead code
    }
    const isUncalled = !entry || entry.callSites.length === 0;

    if (isUncalled) {
      findings.push({
        file: c.filePath, line: c.line,
        description: `Construct "${c.name}" is defined but never called — dead code`,
        question: 'Q2',
      });
    }
  }

  if (findings.length === 0) return null;
  const score = Math.min(15 * findings.length, 30);
  return {
    severity: score > 25 ? 'MEDIUM' : 'LOW',
    score,
    pattern: 'DEAD_CODE',
    defeatVectors: ['Add dead export → construct defined but never called → allows dead code to accumulate undetected'],
    findings,
  };
}

// ============================================================================
// Q3: DOES-WHAT-SAYS  (+10 per mismatch, max +30) — AST body walk
// ============================================================================

function checkQ3DoesWhatSays(constructs: CodeConstruct[], sections: RequirementSection[]): ThreatReport | null {
  const findings: ThreatFinding[] = [];

  for (const section of sections) {
    if (section.type !== 'deficiency' && section.type !== 'numbered') continue;
    const verbs = extractVerbs(section.content);
    if (verbs.length === 0) continue;

    // M5 fix: Use word-boundary regex for construct matching, skip trivial names
    const matchedConstructs = constructs.filter(c => {
      if (c.name.length < 4) return false; // skip trivial names
      const escapedName = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nameRegex = new RegExp('\\b' + escapedName + '\\b', 'i');
      return nameRegex.test(section.content);
    });

    for (const c of matchedConstructs) {
      // Walk the AST body to collect all call expression names
      const callNames = collectCallNames(c.node);
      for (const verb of verbs) {
        if (!verbHasMatchingCall(verb, callNames)) {
          findings.push({
            file: c.filePath, line: c.line,
            description: `Construct "${c.name}" should "${verb}" (per requirement) but AST body has no matching call — branding illusion`,
            question: 'Q3',
          });
        }
      }
    }
  }

  if (findings.length === 0) return null;
  const score = Math.min(10 * findings.length, 30);
  return {
    severity: score > 25 ? 'MEDIUM' : 'LOW',
    score,
    pattern: 'MISMATCH_BRANDING_ILLUSION',
    defeatVectors: ['Name function after requirement → body does not implement stated capability → allows branding illusion'],
    findings,
  };
}

// ============================================================================
// Q4: MATCHES-SPEC  (+25 per missing, max +50)
// ============================================================================

/** Extract structural identifiers mentioned in requirement text. */
function extractStructuralNames(text: string): string[] {
  const names: string[] = [];
  // Match identifiers after structural keywords
  const patterns = [
    /(?:should|must|needs?|requires?)\s+(?:have|implement|define|export|provide)\s+([a-zA-Z_]\w{2,})/gi,
    /(?:should|must|needs?|requires?)\s+(?:have|implement|define|export|provide)\s+(\w{3,})\s+(?:function|method|class|interface|tool|hook)/gi,
    /`([A-Za-z_]\w{2,})`/g, // backtick-quoted names
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const name = m[1];
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

function checkQ4MatchesSpec(constructs: CodeConstruct[], sections: RequirementSection[]): ThreatReport | null {
  const findings: ThreatFinding[] = [];
  const constructNames = new Set(constructs.map(c => c.name));

  for (const section of sections) {
    // L6 fix: Only check deficiency, numbered, and part sections for spec gaps
    if (section.type !== 'deficiency' && section.type !== 'numbered' && section.type !== 'part') continue;
    const names = extractStructuralNames(section.content);
    for (const name of names) {
      if (!constructNames.has(name)) {
        findings.push({
          description: `Spec requires structure "${name}" but no matching construct found in code — SPEC_GAP`,
          question: 'Q4',
        });
      }
    }
  }

  if (findings.length === 0) return null;
  const score = Math.min(25 * findings.length, 50);
  return {
    severity: score > 25 ? 'HIGH' : 'MEDIUM',
    score,
    pattern: 'SPEC_GAP',
    defeatVectors: ['Omit required structure → partial implementation passes spec check → allows spec gaps to persist'],
    findings,
  };
}

// ============================================================================
// Q5: THEATRICAL  (+80 per finding + CRITICAL OVERRIDE) — AST analysis
// ============================================================================

/** Find theatrical returns in a node — moved outside loop to avoid closure per iteration (L4 fix). */
function findTheatricalReturns(n: ts.Node, construct: CodeConstruct, findings: ThreatFinding[]): void {
  if (ts.isReturnStatement(n) && isLiteralReturn(n)) {
    // Skip if the function body has real computation (control flow, comparisons,
    // variable assignments) that determines the return value.
    // Functions like validate() with if-conditions and type checks return literal
    // true/false as legitimate results, not theatrical claims.
    if (!hasRealComputation(construct.node)) {
      const desc = !n.expression
        ? `Construct "${construct.name}" has bare return statement — no value returned`
        : `Construct "${construct.name}" returns literal value without computation — theatrical`;
      findings.push({ file: construct.filePath, line: construct.line, description: desc, question: 'Q5' });
    }
  }
  ts.forEachChild(n, (child: ts.Node) => findTheatricalReturns(child, construct, findings));
}

/** Check if a function body has real computation (control flow, comparisons, assignments)
 *  that would justify returning a literal value. */
function hasRealComputation(node: ts.Node | undefined): boolean {
  if (!node) return false;
  let found = false;
  function visit(n: ts.Node): void {
    if (found) return;
    // Control flow statements indicate real computation
    if (ts.isIfStatement(n) || ts.isSwitchStatement(n) || ts.isForStatement(n) ||
        ts.isWhileStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) ||
        ts.isTryStatement(n)) {
      found = true;
      return;
    }
    // Binary expressions (comparisons, arithmetic) indicate real computation
    if (ts.isBinaryExpression(n) && !ts.isPropertyAccessExpression(n.parent)) {
      found = true;
      return;
    }
    // Variable assignments with non-literal values indicate real computation
    if (ts.isVariableStatement(n)) {
      for (const decl of n.declarationList.declarations) {
        if (decl.initializer && !isLiteralLike(decl.initializer) && !ts.isStringLiteral(decl.initializer)) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return found;
}

/** Known side-effect API calls that indicate real work was done. */
const SIDE_EFFECT_APIS = [
  'writeFileSync', 'writeFile', 'mkdirSync', 'mkdir',
  'execSync', 'exec', 'spawn', 'spawnSync',
  'request', 'fetch', 'axios',
  'assert', 'expect', 'require',
  'createHash', 'update',
  'push', 'set', 'delete',
  'console.log', 'console.error',
  'tridentLog',
];

/** Check if a node tree contains any side-effect API call. */
function hasSideEffectBeforeReturn(node: ts.Node): boolean {
  let found = false;
  function visit(n: ts.Node): void {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const text = n.expression.getText();
      if (SIDE_EFFECT_APIS.some(api => text.includes(api))) {
        found = true;
        return;
      }
    }
    if (ts.isExpressionStatement(n) && !ts.isReturnStatement(n)) {
      // Any non-return expression statement is a potential side effect
      if (ts.isCallExpression(n.expression) || ts.isBinaryExpression(n.expression)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return found;
}

/** Check if a return expression contains a success claim object. */
function isSuccessClaimReturn(stmt: ts.ReturnStatement): boolean {
  const expr = stmt.expression;
  if (!expr) return false;
  if (ts.isObjectLiteralExpression(expr)) {
    return expr.properties.some(p => {
      if (ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name)) {
        const name = p.name.text;
        return ['success', 'passed', 'verified', 'valid', 'completed', 'ok', 'done'].includes(name);
      }
      return false;
    });
  }
  return false;
}

function checkQ5Theatrical(constructs: CodeConstruct[]): ThreatReport | null {
  const findings: ThreatFinding[] = [];

  const fnConstructs = constructs.filter(c => 
    c.type === ConstructType.FUNCTION_DECLARATION ||
    c.type === ConstructType.ARROW_FUNCTION ||
    c.type === ConstructType.METHOD_DECLARATION
    // CLASS_DECLARATION excluded: classes are not callable — they have no
    // return statements, catch clauses, or async bodies to check.
  );

  for (const c of fnConstructs) {
    const node = c.node;

    // Check 1: Return statements with no expression or literal-only expression
    // Check 2: Return of hardcoded string instead of computed result
    findTheatricalReturns(node, c, findings);

    // Check 2: Success claims without preceding side-effects (spec Q5 algorithm)
    // Find returns with { success: true } or similar, then verify side-effects exist
    const successReturns: ts.ReturnStatement[] = [];
    function collectSuccessReturns(n: ts.Node): void {
      if (ts.isReturnStatement(n) && isSuccessClaimReturn(n)) {
        successReturns.push(n);
      }
      ts.forEachChild(n, (child: ts.Node) => collectSuccessReturns(child));
    }
    collectSuccessReturns(node);

    for (const sr of successReturns) {
      if (!hasSideEffectBeforeReturn(node)) {
        findings.push({
          file: c.filePath, line: c.line,
          description: `Construct "${c.name}" returns success claim without preceding side-effect — theatrical`,
          question: 'Q5',
        });
      }
    }

    // Check 3: Empty function bodies (only return, no real work)
    // Use specific type guards — ts.isFunctionLike returns SignatureDeclaration
    // which doesn't always have a body property.
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) &&
      node.body && ts.isBlock(node.body)
    ) {
      const realStmts = node.body.statements.filter((s: ts.Statement) =>
        !ts.isReturnStatement(s) && s.kind !== ts.SyntaxKind.EmptyStatement
      );
      if (realStmts.length === 0 && node.body.statements.length <= 1) {
        // Skip if the return expression is non-trivial (has real computation)
        const returnStmt = node.body.statements.find((s: ts.Statement): s is ts.ReturnStatement => ts.isReturnStatement(s));
        if (returnStmt && returnStmt.expression && !isLiteralReturn(returnStmt)) {
          // Return contains real computation (ternary, binary, call, property access) — not empty
          continue;
        }
        findings.push({
          file: c.filePath, line: c.line,
          description: `Construct "${c.name}" has empty function body — no real statements besides return`,
          question: 'Q5',
        });
      }
    }

    // Check 4: Empty catch clauses
    if (hasEmptyCatch(node)) {
      findings.push({
        file: c.filePath, line: c.line,
        description: `Construct "${c.name}" has empty catch block — errors silently swallowed`,
        question: 'Q5',
      });
    }

    // Check 5: Floating promises (bare Promise-returning calls without await)
    if (hasFloatingPromise(node, c.isAsync)) {
      findings.push({
        file: c.filePath, line: c.line,
        description: `Construct "${c.name}" has floating promise — async call without await`,
        question: 'Q5',
      });
    }
  }

  if (findings.length === 0) return null;
  const score = 80;  // Binary — theatrical detected = +80 flat, not per-finding
  return {
    severity: 'CRITICAL', // Q5 override — always CRITICAL regardless of score
    score,
    pattern: 'THEATRICAL_IMPLEMENTATION',
    defeatVectors: [
      'Inject theatrical evidence → no machine-generation check → allows fabricated evidence to pass as real',
      'Return success without side-effect → no preceding work detected → allows fake success claims',
    ],
    findings,
  };
}

// ============================================================================
// Q6: COPIED  (+5 per duplicate pair, max +15) — AST fingerprint
// ============================================================================

function checkQ6Copied(constructs: CodeConstruct[]): ThreatReport | null {
  const findings: ThreatFinding[] = [];
  // Only compare definition constructs (functions, methods, classes)
  const defConstructs = constructs.filter(c => 
    c.type === ConstructType.FUNCTION_DECLARATION ||
    c.type === ConstructType.ARROW_FUNCTION ||
    c.type === ConstructType.METHOD_DECLARATION ||
    c.type === ConstructType.CLASS_DECLARATION
  );
  // Cap to prevent O(n²) explosion on very large codebases — 500 constructs
  // gives 125K comparisons which completes in <1s, sufficient for duplicate detection.
  const capped = defConstructs.length > 500 ? defConstructs.slice(0, 500) : defConstructs;
  const fingerprints = capped.map(c => ({ construct: c, fp: astFingerprint(c.node) }));

  for (let i = 0; i < fingerprints.length; i++) {
    for (let j = i + 1; j < fingerprints.length; j++) {
      const a = fingerprints[i];
      const b = fingerprints[j];
      if (a.construct.name === b.construct.name) continue;
      // Only compare same-type constructs
      if (a.construct.type !== b.construct.type) continue;
      // Only compare constructs in the same directory (spec requirement)
      const dirA = a.construct.filePath.substring(0, a.construct.filePath.lastIndexOf('/'));
      const dirB = b.construct.filePath.substring(0, b.construct.filePath.lastIndexOf('/'));
      if (dirA !== dirB) continue;
      // Skip trivial bodies
      if (a.construct.body.length < 50 || b.construct.body.length < 50) continue;
      // Skip short names
      if (a.construct.name.length < 3 || b.construct.name.length < 3) continue;
      const sim = fingerprintSimilarity(a.fp, b.fp);
      if (sim > 0.7) {
        findings.push({
          file: a.construct.filePath, line: a.construct.line,
          description: `Constructs "${a.construct.name}" and "${b.construct.name}" have ${(sim * 100).toFixed(0)}% AST structural similarity — copy-paste duplicate`,
          question: 'Q6',
        });
      }
    }
  }

  if (findings.length === 0) return null;
  const score = Math.min(5 * findings.length, 15);
  return {
    severity: 'LOW',
    score,
    pattern: 'DUPLICATE_IMPLEMENTATION',
    defeatVectors: ['Copy-paste implementation → no duplicate detection → allows duplicated code to pass undetected'],
    findings,
  };
}

// ============================================================================
// MAIN EXPORT: assessThreats
// ============================================================================

/**
 * Run the 6 Questions threat modeling engine against code constructs.
 *
 * Each question produces a ThreatReport with its findings, score, and severity.
 * Q5 findings force CRITICAL severity regardless of total score.
 *
 * @param constructs  - Code constructs extracted by the code-classifier
 * @param callGraph   - AST-based call graph from the code-classifier
 * @param sections    - Parsed requirement sections from the deep-planning artifact
 * @param discovery   - Auto-discovery results containing code sections
 * @returns           Array of threat reports, one per question that found threats
 */
export function assessThreats(
  constructs: CodeConstruct[],
  callGraph: CallGraph,
  sections: RequirementSection[],
  discovery: DiscoveryResult
): ThreatReport[] {
  const reports: ThreatReport[] = [];

  // Filter to definition constructs only — the code-classifier produces ALL AST nodes
  // (string literals, call expressions, return statements, etc.) but the threat modeler
  // only needs function/method/class definitions to analyze implementation quality.
  // Without this filter, large projects produce 50K+ constructs causing O(n²) hangs in Q6.
  const definitionTypes = new Set<ConstructType>([
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.METHOD_DECLARATION,
    ConstructType.CLASS_DECLARATION,
  ]);
  const defConstructs = constructs.filter(c => definitionTypes.has(c.type));

  const q1 = checkQ1Exist(defConstructs, discovery);
  if (q1) reports.push(q1);

  const q2 = checkQ2Called(defConstructs, callGraph);
  if (q2) reports.push(q2);

  const q3 = checkQ3DoesWhatSays(defConstructs, sections);
  if (q3) reports.push(q3);

  const q4 = checkQ4MatchesSpec(defConstructs, sections);
  if (q4) reports.push(q4);

  const q5 = checkQ5Theatrical(defConstructs);
  if (q5) reports.push(q5);

  const q6 = checkQ6Copied(defConstructs);
  if (q6) reports.push(q6);

  return reports;
}
