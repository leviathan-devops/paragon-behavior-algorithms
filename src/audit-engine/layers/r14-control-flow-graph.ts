import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

/**
 * R14 Control Flow Graph — pure TypeScript AST analysis.
 *
 * Every detection walks the compiler AST structurally:
 *   - Empty catch blocks: TryStatement nodes whose CatchClause block has no statements.
 *   - Constant conditions: IfStatement nodes whose expression is a boolean literal
 *     (or its negation) — the AST naturally excludes compound || / && conditions.
 *   - State-machine transitions: variable/property/call patterns resolved via AST.
 *   - Unreachable code: block-level statement analysis — any statement following an
 *     unconditional exit (return/throw/break/continue) within the same Block or
 *     CaseClause can never execute.
 *   - Missing return paths: functions with an explicit non-void return type whose
 *     body falls off the end through a plain tail statement.
 *
 * No source-text scanning, brace matching, or position regex is performed.
 */

// ─── Core AST Helpers ──────────────────────────────────────────────────────────

/** 1-based line number for an AST node within its source file. */
function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** Safe getText that returns a fallback on synthetic/unparseable nodes. */
function safeText(node: ts.Node, sf: ts.SourceFile, fallback: string): string {
  try {
    return node.getText(sf);
  } catch (e: unknown) {
    console.error('[R14ControlFlowGraph]', e instanceof Error ? e.message : String(e));
    return fallback;
  }
}

// ─── Empty Catch Detection ─────────────────────────────────────────────────────

/**
 * Detect empty catch blocks via AST. A TryStatement whose CatchClause block has
 * zero statements swallows errors silently. Replaces the old brace-matching
 * try-block extractor and catch-body slicer.
 */
function collectEmptyCatchBlocks(root: ts.Node, sf: ts.SourceFile): { line: number }[] {
  const result: { line: number }[] = [];
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (ts.isTryStatement(n) && n.catchClause) {
      if (n.catchClause.block.statements.length === 0) {
        result.push({ line: lineOf(sf, n.catchClause) });
      }
    }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return result;
}

// ─── Constant-Condition Detection ──────────────────────────────────────────────

/**
 * Determine whether an if-condition is a constant boolean literal.
 * Returns 'true' for `if (true)` / `if (!false)`, 'false' for `if (false)` /
 * `if (!true)`, or null for any dynamic condition. Compound conditions (||, &&)
 * are BinaryExpression nodes and therefore never match here.
 */
function constantConditionKind(expr: ts.Expression): 'true' | 'false' | null {
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return 'true';
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return 'false';
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken) {
    if (expr.operand.kind === ts.SyntaxKind.FalseKeyword) return 'true'; // !false
    if (expr.operand.kind === ts.SyntaxKind.TrueKeyword) return 'false'; // !true
  }
  return null;
}

/** Collect IfStatement nodes whose condition is a constant boolean. */
function collectConstantConditions(
  root: ts.Node,
  sf: ts.SourceFile,
): { line: number; kind: 'true' | 'false'; text: string }[] {
  const result: { line: number; kind: 'true' | 'false'; text: string }[] = [];
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (ts.isIfStatement(n)) {
      const kind = constantConditionKind(n.expression);
      if (kind !== null) {
        result.push({ line: lineOf(sf, n), kind, text: safeText(n.expression, sf, 'condition') });
      }
    }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return result;
}

// ─── State Machine Analysis ────────────────────────────────────────────────────

/** Detect whether the construct declares or constructs a state machine. */
function hasStateMachine(root: ts.Node, sf: ts.SourceFile): boolean {
  let found = false;
  const stack: ts.Node[] = [root];
  while (stack.length > 0 && !found) {
    const n = stack.pop()!;
    // const x: StateMachine = ...
    if (ts.isVariableDeclaration(n) && n.type && ts.isTypeReferenceNode(n.type)) {
      if (safeText(n.type.typeName, sf, '') === 'StateMachine') { found = true; break; }
    }
    // const x = createStateMachine(...) / new StateMachine(...)
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const init = n.initializer;
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'createStateMachine') {
        found = true; break;
      }
      if (ts.isNewExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === 'StateMachine') {
        found = true; break;
      }
    }
    // { states: { ... } }
    if (ts.isPropertyAssignment(n) && ts.isObjectLiteralExpression(n.initializer)) {
      if (safeText(n.name, sf, '') === 'states') { found = true; break; }
    }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return found;
}

const TRANSITION_DEF_KEYS = new Set('transition|on|event'.split('|'));

/** Collect transition names DEFINED in the construct (transition:/on:/event: 'NAME'). */
function collectDefinedTransitions(root: ts.Node, sf: ts.SourceFile): Set<string> {
  const defined = new Set<string>();
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (ts.isPropertyAssignment(n) && ts.isStringLiteral(n.initializer)) {
      const keyName = safeText(n.name, sf, '');
      if (TRANSITION_DEF_KEYS.has(keyName)) {
        defined.add(n.initializer.text);
      }
    }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return defined;
}

/** Collect transition names USED via .send('NAME') calls. */
function collectUsedTransitions(root: ts.Node): Set<string> {
  const used = new Set<string>();
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'send'
    ) {
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        used.add(arg.text);
      }
    }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return used;
}

// ─── Unreachable Code (block-level statement analysis) ─────────────────────────

/** True if a statement unconditionally transfers control flow out of its block. */
function isExitStatement(stmt: ts.Statement): boolean {
  return (
    ts.isReturnStatement(stmt) ||
    ts.isThrowStatement(stmt) ||
    ts.isBreakStatement(stmt) ||
    ts.isContinueStatement(stmt)
  );
}

/**
 * Detect unreachable code via block-level statement analysis. For every Block and
 * CaseClause, scan its statement list; the first non-hoisted statement that follows
 * an unconditional exit (return/throw/break/continue) within the same block can never
 * execute. Function declarations are skipped as the "first unreachable" statement
 * because they are hoisted. This replaces the regex return-position scanner and the
 * text-based conditional / multi-line heuristics.
 */
function collectUnreachableCode(root: ts.Node, sf: ts.SourceFile): { line: number; text: string }[] {
  const result: { line: number; text: string }[] = [];
  const seen = new Set<number>();

  function scanStatements(statements: ts.NodeArray<ts.Statement>): void {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!isExitStatement(stmt)) continue;
      for (let j = i + 1; j < statements.length; j++) {
        const next = statements[j];
        if (ts.isFunctionDeclaration(next)) continue; // hoisted — not dead code
        const line = lineOf(sf, next);
        if (seen.has(line)) break;
        seen.add(line);
        const full = safeText(next, sf, 'statement');
        const text = full.length > 60 ? full.substring(0, 60) : full;
        result.push({ line, text });
        break;
      }
    }
  }

  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (ts.isBlock(n)) scanStatements(n.statements);
    if (ts.isCaseClause(n)) scanStatements(n.statements);
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return result;
}

// ─── Missing Return Path Detection ─────────────────────────────────────────────

/** True if a return-type annotation denotes no value (void / undefined / never). */
function isVoidReturnType(typeNode: ts.TypeNode, sf: ts.SourceFile): boolean {
  if (typeNode.kind === ts.SyntaxKind.VoidKeyword) return true;
  const text = safeText(typeNode, sf, '');
  return text === 'void' || text === 'undefined' || text === 'never' || text === 'Promise<void>';
}

/**
 * Detect missing return paths conservatively. For a function with an explicit
 * non-void return type whose body block ends in a "plain" statement (expression or
 * variable declaration) rather than an exit or branching construct, control falls off
 * the end without returning a value. Branching tails (if/switch/try/loop/block) are
 * skipped to avoid false positives — they may return on every path.
 */
function collectMissingReturns(root: ts.Node, sf: ts.SourceFile): { line: number; name: string }[] {
  const result: { line: number; name: string }[] = [];

  function checkFunction(
    fn: ts.FunctionDeclaration | ts.MethodDeclaration,
    name: string,
  ): void {
    const typeNode = fn.type;
    if (!typeNode) return;
    if (isVoidReturnType(typeNode, sf)) return;
    const body = fn.body;
    if (!body || !ts.isBlock(body)) return;
    const stmts = body.statements;
    if (stmts.length === 0) {
      result.push({ line: lineOf(sf, fn), name });
      return;
    }
    const last = stmts[stmts.length - 1];
    if (ts.isExpressionStatement(last) || ts.isVariableStatement(last)) {
      result.push({ line: lineOf(sf, last), name });
    }
  }

  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (ts.isFunctionDeclaration(n) && n.name) {
      checkFunction(n, safeText(n.name, sf, 'function'));
    } else if (ts.isMethodDeclaration(n) && n.name) {
      checkFunction(n, safeText(n.name, sf, 'method'));
    }
    ts.forEachChild(n, (c: ts.Node) => stack.push(c));
  }
  return result;
}

// ─── Layer Rule ────────────────────────────────────────────────────────────────

export const R14_CONTROL_FLOW_GRAPH: LayerRule = {
  layer: 'R14',
  name: 'Control Flow Graph',
  description: 'Determines path reachability, identifies dead error handlers and unreachable state transitions',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION, ConstructType.TRY_STATEMENT, ConstructType.CATCH_CLAUSE],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    const node = construct.node;
    if (!node) return findings;
    const sf = node.getSourceFile();
    if (!sf) return findings;

    // ── Detection 1: Empty catch blocks ──
    for (const ec of collectEmptyCatchBlocks(node, sf)) {
      findings.push({
        layer: 'R14',
        severity: 'MEDIUM',
        category: 'CONTROL_FLOW',
        file: construct.filePath,
        line: ec.line,
        evidence: 'empty catch block',
        description: 'Empty catch block — error swallowed with no handling',
        correction: 'Add error logging, recovery, or re-throw: console.error("[Context] failed:", err);',
        runtimeImpact: 'Errors silently consumed — no evidence of failure, debugging impossible',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // ── Detection 2: Constant-boolean conditions ──
    for (const cc of collectConstantConditions(node, sf)) {
      if (cc.kind === 'true') {
        findings.push({
          layer: 'R14',
          severity: 'MEDIUM',
          category: 'CONTROL_FLOW',
          file: construct.filePath,
          line: cc.line,
          evidence: `if (${cc.text})`,
          description: `Always-true condition: "if (${cc.text})" — else branch is unreachable dead code`,
          correction: 'Remove the condition if it is always true, or fix the logic if the condition should be dynamic',
          runtimeImpact: 'Dead code in else branch — developer thinks both paths are tested but only one executes',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      } else {
        findings.push({
          layer: 'R14',
          severity: 'MEDIUM',
          category: 'CONTROL_FLOW',
          file: construct.filePath,
          line: cc.line,
          evidence: `if (${cc.text})`,
          description: `Always-false condition: "if (${cc.text})" — if branch is unreachable dead code`,
          correction: 'Remove the condition if it is always false, or fix the logic if the condition should be dynamic',
          runtimeImpact: 'Dead code in if branch — developer thinks both paths are tested but only else executes',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    // ── Detection 3: Unreachable state-machine transitions ──
    if (hasStateMachine(node, sf)) {
      const defined = collectDefinedTransitions(node, sf);
      const used = collectUsedTransitions(node);
      for (const trans of defined) {
        if (!used.has(trans)) {
          findings.push({
            layer: 'R14',
            severity: 'HIGH',
            category: 'CONTROL_FLOW',
            file: construct.filePath,
            line: construct.line,
            evidence: `transition "${trans}" defined but never triggered`,
            description: `State machine transition "${trans}" is defined but no code path triggers it — unreachable transition`,
            correction: `Add .send("${trans}") call or remove the transition if unused`,
            runtimeImpact: 'Unreachable transition — state machine can never reach the target state, logic is incomplete',
            confidence: 0.75,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }

    // ── Detection 4: Unreachable code after exit points ──
    for (const ur of collectUnreachableCode(node, sf)) {
      findings.push({
        layer: 'R14',
        severity: 'HIGH',
        category: 'CONTROL_FLOW',
        file: construct.filePath,
        line: ur.line,
        evidence: `code after exit: "${ur.text}"`,
        description: 'Unreachable code after exit point — code will never execute',
        correction: 'Remove the unreachable code or fix the control flow',
        runtimeImpact: 'Dead code — developer thinks this code runs but it never executes',
        confidence: 0.90,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // ── Detection 5: Missing return paths ──
    for (const mr of collectMissingReturns(node, sf)) {
      findings.push({
        layer: 'R14',
        severity: 'MEDIUM',
        category: 'CONTROL_FLOW',
        file: construct.filePath,
        line: mr.line,
        evidence: `function "${mr.name}" may not return a value`,
        description: `Function '${mr.name}' has a non-void return type but a code path falls off the end without returning`,
        correction: 'Add an explicit return on every code path, or annotate the return type as void',
        runtimeImpact: 'Caller receives undefined where a value is expected — downstream property access may throw',
        confidence: 0.70,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    return findings;
  },
};
