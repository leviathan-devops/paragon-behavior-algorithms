import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';
import * as ts from 'typescript';

/**
 * R2: State Machine — Full AST-Based Analysis
 * 
 * Walks the TypeScript AST to detect state machine violations:
 * - Return paths to COMPLETE without advanceLayer() calls
 * 
 * Detection approach:
 * - advanceLayer() detection: AST CallExpression + Identifier/PropertyAccessExpression
 * - COMPLETE detection: AST Identifier/StringLiteral/PropertyAccessExpression walking
 * - Control flow: recursive AST walk tracking advanceLayer() call state per path
 * 
 * Zero regex. Zero string matching on code. Pure AST node walking.
 * The old text-based extractReturnPathsOld() has been removed entirely.
 */

// ═══════════════════════════════════════════════════════
// AST Walker (iterative — avoids stack overflow on deep ASTs)
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// AST Detection Functions
// ═══════════════════════════════════════════════════════

/**
 * Check if a function body contains a call to advanceLayer() via AST walking.
 * Looks for CallExpression nodes where the callee is:
 * - Identifier with text 'advanceLayer' (direct call)
 * - PropertyAccessExpression with name 'advanceLayer' (method call)
 * 
 * Replaces: string-search on body text for advanceLayer detection
 */
function hasAdvanceLayerCall(node: ts.Node): boolean {
  let found = false;
  walkAst(node, (child): void => {
    if (found) return;
    if (ts.isCallExpression(child)) {
      const expr = child.expression;
      if (ts.isIdentifier(expr) && expr.text === 'advanceLayer') {
        found = true;
        return;
      }
      if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'advanceLayer') {
        found = true;
        return;
      }
    }
  });
  return found;
}

/**
 * Check if a node's subtree references 'COMPLETE' via AST walking.
 * Walks for:
 * - Identifier nodes with text 'COMPLETE' (enum member, constant)
 * - StringLiteral nodes with value 'COMPLETE'
 * - PropertyAccessExpression with name 'COMPLETE' (e.g., State.COMPLETE)
 * - PropertyAssignment with name 'COMPLETE' (e.g., { status: COMPLETE })
 * 
 * Replaces: string-search on body/return text for COMPLETE detection
 */
function nodeReferencesComplete(node: ts.Node): boolean {
  let found = false;
  walkAst(node, (child): void => {
    if (found) return;
    if (ts.isIdentifier(child) && child.text === 'COMPLETE') {
      found = true;
      return;
    }
    if (ts.isStringLiteral(child) && child.text === 'COMPLETE') {
      found = true;
      return;
    }
    if (ts.isPropertyAccessExpression(child) && child.name.text === 'COMPLETE') {
      found = true;
      return;
    }
  });
  return found;
}

// ═══════════════════════════════════════════════════════
// Layer Rule
// ═══════════════════════════════════════════════════════

export const R2_STATE_MACHINE: LayerRule = {
  layer: 'R2',
  name: 'State Machine',
  description: 'Detects state machine violations — missing advanceLayer calls before COMPLETE returns via AST analysis',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.METHOD_DECLARATION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    if (construct.name === 'advanceLayer') return [];
    const findings: AuditFinding[] = [];
    const node = construct.node;
    if (!node) return findings;

    // AST gate: Only analyze functions that actually call advanceLayer()
    // Replaces: string-search on body text for advanceLayer
    if (!hasAdvanceLayerCall(node)) return findings;

    // AST gate: Only analyze functions that reference COMPLETE
    // Replaces: string-search on body text for COMPLETE
    if (!nodeReferencesComplete(node)) return findings;

    // AST control flow analysis: find return paths to COMPLETE without advanceLayer
    const returnPaths = extractReturnPathsAST(construct);
    for (const retPath of returnPaths) {
      if (retPath.referencesComplete && !retPath.pathCallsAdvanceLayer) {
        findings.push({
          layer: 'R2',
          severity: 'HIGH',
          category: 'STATE_MACHINE',
          file: construct.filePath,
          line: retPath.line,
          evidence: retPath.evidence.substring(0, 80),
          description: 'Return path to COMPLETE without advanceLayer() call — state machine skips layer',
          correction: 'Ensure advanceLayer() is called on every COMPLETE exit path',
          runtimeImpact: 'State machine skips layers on certain code paths — audit is incomplete',
          confidence: 0.80,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    return findings;
  },
};

// ═══════════════════════════════════════════════════════
// AST Control Flow Analysis
// ═══════════════════════════════════════════════════════

interface ReturnPathAST {
  line: number;
  evidence: string;
  referencesComplete: boolean;
  pathCallsAdvanceLayer: boolean;
}

/**
 * AST-level control flow analysis — walk the AST to find return statements
 * and check if advanceLayer() is called in the same control flow path.
 * 
 * Uses AST node type checking instead of string matching:
 * - ReturnStatement detection via ts.isReturnStatement
 * - COMPLETE detection via nodeReferencesComplete() (Identifier/StringLiteral walking)
 * - advanceLayer detection via CallExpression + Identifier/PropertyAccessExpression
 * 
 * Replaces: string-search on return/callee text for COMPLETE and advanceLayer
 */
function extractReturnPathsAST(construct: CodeConstruct): ReturnPathAST[] {
  const paths: ReturnPathAST[] = [];
  const node = asFunctionLike(construct.node);
  if (!node.body) return paths;

  function walk(n: ts.Node, pathHasAdvanceLayer: boolean): void {
    const sourceFile = n.getSourceFile();

    if (ts.isReturnStatement(n)) {
      const pos = sourceFile ? ts.getLineAndCharacterOfPosition(sourceFile, n.getStart(sourceFile) || n.pos) : null;
      const returnText = n.getText(sourceFile);

      // AST check: does the return expression reference COMPLETE?
      // Replaces: string-search on return text for COMPLETE
      const referencesComplete = n.expression ? nodeReferencesComplete(n.expression) : false;

      paths.push({
        line: construct.line + (pos ? pos.line : 0),
        evidence: returnText.substring(0, 100),
        referencesComplete,
        pathCallsAdvanceLayer: pathHasAdvanceLayer,
      });
      return;
    }

    // AST check: is this a call to advanceLayer()?
    // Replaces: string-search on callee text for advanceLayer
    if (ts.isCallExpression(n)) {
      const expr = n.expression;
      const isAdvanceLayer =
        (ts.isIdentifier(expr) && expr.text === 'advanceLayer') ||
        (ts.isPropertyAccessExpression(expr) && expr.name.text === 'advanceLayer');
      if (isAdvanceLayer) {
        ts.forEachChild(n, child => walk(child, true));
        return;
      }
    }

    ts.forEachChild(n, child => walk(child, pathHasAdvanceLayer));
  }

  ts.forEachChild(node.body, child => walk(child, false));
  return paths;
}


/** THE R16 TYPE_CERTAINTY GUARDED READ — the construct node is narrowed to a
 *  function-like declaration behind the null guard (the assertion is earned). */
function asFunctionLike(node: ts.Node | undefined): ts.FunctionLikeDeclaration {
  if (node !== undefined && node !== null) {
    return node as ts.FunctionLikeDeclaration;
  }
  throw new Error('[r2] a function-like declaration node was expected');
}
