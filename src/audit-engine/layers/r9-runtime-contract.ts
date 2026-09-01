import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType, Severity } from '../types.ts';

const severityOrder: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

/**
 * Collapses findings that share the same file:line:category, keeping the most
 * severe representation. This prevents the same AST node (e.g. an `as any`
 * expression that is both an explicit `any` cast AND a cast from an any source)
 * from producing duplicate report entries.
 */
function deduplicateFindings(findings: AuditFinding[]): AuditFinding[] {
  const grouped = new Map<string, AuditFinding>();
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.category}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, f);
    } else if (severityOrder[f.severity] > severityOrder[existing.severity]) {
      grouped.set(key, f);
    }
  }
  return Array.from(grouped.values());
}

/**
 * Depth-first AST walk over the subtree rooted at `root`. Mirrors the proven
 * pattern from R13: an explicit stack with ts.forEachChild traversal so every
 * descendant node is visited exactly once.
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

function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** True when the checker-derived type of `node` carries the Any flag. */
function isAnyType(node: ts.Node, checker: ts.TypeChecker | null): boolean {
  if (!checker) return false;
  try {
    const type = checker.getTypeAtLocation(node);
    return (type.flags & ts.TypeFlags.Any) !== 0;
  } catch {
    return false; // TypeChecker unavailable — assume not any, analysis degrades gracefully
  }
}

/** Human-readable type string for evidence, or 'unknown' when unavailable. */
function getTypeText(node: ts.Node, checker: ts.TypeChecker | null): string {
  if (!checker) return 'unknown';
  try {
    const type = checker.getTypeAtLocation(node);
    return checker.typeToString(type);
  } catch {
    return 'unknown';
  }
}

/** Resolves the inferred return type of a function-like declaration via the checker. */
function getFunctionReturnType(
  node: ts.SignatureDeclaration,
  checker: ts.TypeChecker | null,
): ts.Type | null {
  if (!checker) return null;
  try {
    const signature = checker.getSignatureFromDeclaration(node);
    if (!signature) return null;
    return checker.getReturnTypeOfSignature(signature);
  } catch {
    return null;
  }
}

/** True when the node (or any ancestor up to the source file) is exported. */
function isExportedNode(node: ts.Node): boolean {
  if (ts.canHaveModifiers(node)) {
    const modifiers = ts.getModifiers(node);
    if (modifiers && modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      return true;
    }
  }
  // Arrow functions assigned to exported consts: walk the parent chain.
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isExportAssignment(current) || ts.isExportDeclaration(current)) {
      return true;
    }
    if (ts.canHaveModifiers(current)) {
      const modifiers = ts.getModifiers(current);
      if (modifiers && modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

/** True when a type-node annotation is the `any` keyword. */
function isAnyKeyword(typeNode: ts.TypeNode | undefined): boolean {
  return !!typeNode && typeNode.kind === ts.SyntaxKind.AnyKeyword;
}

/**
 * Walks a function body to determine whether `paramName` is narrowed by a
 * runtime type guard (typeof / instanceof / in) before use. This is the
 * AST-native replacement for the regex guard-detection in R13.
 */
function functionBodyHasTypeGuard(
  body: ts.Block | ts.Expression | undefined,
  paramName: string,
): boolean {
  if (!body) return false;
  let found = false;
  function visit(n: ts.Node): void {
    if (found) return;
    // typeof paramName
    if (ts.isTypeOfExpression(n) && n.expression.getText() === paramName) {
      found = true;
      return;
    }
    // paramName instanceof X   |   paramName in obj
    if (ts.isBinaryExpression(n)) {
      if (
        (n.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword ||
          n.operatorToken.kind === ts.SyntaxKind.InKeyword) &&
        n.left.getText() === paramName
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(body);
  return found;
}

export const R9_RUNTIME_CONTRACT: LayerRule = {
  layer: 'R9',
  name: 'Runtime Contract',
  description:
    'AST-based runtime-contract violations: `as any` casts, casts from any-typed sources, ' +
    'untyped catch bindings, unguarded `any` parameters on exported APIs, `any`/missing return ' +
    'types on exported functions, and direct eval() calls',
  applicableTo: [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.METHOD_DECLARATION,
    ConstructType.CALL_EXPRESSION,
    ConstructType.AS_EXPRESSION,
    ConstructType.CATCH_CLAUSE,
    ConstructType.TRY_STATEMENT,
    ConstructType.VARIABLE_DECLARATION,
  ],
  excludeTypes: [ConstructType.BLOCK_COMMENT, ConstructType.LINE_COMMENT],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    try {
      if (!construct) return [];
      const node = construct.node;
      if (!node) return [];

      const sourceFile = node.getSourceFile();
      if (!sourceFile) return [];

      const checker = ctx.checker;
      const findings: AuditFinding[] = [];

      walkAst(node, (child: ts.Node): void => {
        if (ts.isAsExpression(child)) {
          const target = child.type;
          const evidenceText = child.getText(sourceFile);
          if (isAnyKeyword(target)) {
            findings.push({
              layer: 'R9',
              severity: 'HIGH',
              category: 'RUNTIME_CONTRACT',
              file: construct.filePath,
              line: getLineNumber(sourceFile, child),
              evidence: evidenceText,
              description: `Explicit \`as any\` cast discards compile-time type safety`,
              correction: 'Provide a concrete target type, or narrow the value with a type guard before casting',
              runtimeImpact: 'Untyped value flows unchecked — downstream property/method access may throw at runtime',
              confidence: 0.95,
              constructType: ConstructType.AS_EXPRESSION,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          } else if (isAnyType(child.expression, checker)) {
            if (construct.filePath.includes('/artifacts/') || construct.filePath.includes('artifact')) return;
            const srcText = child.expression.getText(sourceFile);
            const paramMatch = srcText.match(/^(\w+)/);
            const guardName = paramMatch ? paramMatch[1] : '';
            let hasGuard = false;
            if (guardName) {
              const block = (node as unknown as { body?: ts.Block }).body;
              if (block) hasGuard = functionBodyHasTypeGuard(block as ts.Block, guardName);
              if (!hasGuard) {
                const fullText = sourceFile.getFullText().slice(Math.max(0, child.getStart(sourceFile) - 500), child.getStart(sourceFile));
                if (fullText.includes(`typeof ${guardName}`) || fullText.includes(`${guardName} instanceof`) || fullText.includes(`Array.isArray(${guardName})`) || fullText.includes(`${guardName} in `)) hasGuard = true;
              }
            }
            if (hasGuard) return;
            const sourceType = getTypeText(child.expression, checker);
            findings.push({
              layer: 'R9',
              severity: 'MEDIUM',
              category: 'RUNTIME_CONTRACT',
              file: construct.filePath,
              line: getLineNumber(sourceFile, child),
              evidence: evidenceText,
              description: `Cast from \`${sourceType}\` (any) to a concrete type without runtime validation`,
              correction: `Validate the value before casting (typeof/instanceof guard) or fix the upstream \`any\` source`,
              runtimeImpact: 'An any-typed source may not match the target shape at runtime — type assertion is unchecked',
              confidence: 0.85,
              constructType: ConstructType.AS_EXPRESSION,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }

        // ---------------------------------------------------------------
        // Target 3: CatchClause — untyped catch binding
        // ---------------------------------------------------------------
        if (ts.isCatchClause(child)) {
          const binding = child.variableDeclaration;
          if (binding) {
            const typeNode = binding.type;
            if (!typeNode || isAnyKeyword(typeNode)) {
              const varName = binding.name.getText(sourceFile) || 'catch';
              findings.push({
                layer: 'R9',
                severity: 'MEDIUM',
                category: 'RUNTIME_CONTRACT',
                file: construct.filePath,
                line: getLineNumber(sourceFile, child),
                evidence: child.getText(sourceFile),
                description:
                  `Catch binding "${varName}" is untyped — defaults to \`any\`/unknown without a runtime narrow`,
                correction:
                  'Annotate the catch variable as `unknown` and narrow with `e instanceof Error`',
                runtimeImpact:
                  'Error objects of unexpected shape are accessed without narrowing — `.message`/`.code` may be undefined',
                confidence: 0.80,
                constructType: ConstructType.CATCH_CLAUSE,
                callGraphRef: null,
                evidenceSuppressed: false,
              });
            }
          }
        }

        // ---------------------------------------------------------------
        // Targets 4 & 5: exported functions — any params / any return
        // ---------------------------------------------------------------
        const isFunctionLike =
          ts.isFunctionDeclaration(child) ||
          ts.isMethodDeclaration(child) ||
          ts.isArrowFunction(child);

        if (isFunctionLike && isExportedNode(child)) {
          // Resolve a human-readable function name.
          let fnName = '<anonymous>';
          if (ts.isArrowFunction(child)) {
            if (child.parent && ts.isVariableDeclaration(child.parent)) {
              fnName = child.parent.name.getText(sourceFile);
            } else {
              fnName = '<arrow>';
            }
          } else {
            fnName = child.name?.getText(sourceFile) || '<anonymous>';
          }

          for (const param of child.parameters) {
            if (construct.filePath.includes('/artifacts/') || construct.filePath.includes('artifact') || construct.filePath.includes('__tests__')) continue;
            const paramTypeNode = param.type;
            const explicitlyAny = isAnyKeyword(paramTypeNode);
            const implicitlyAny = !paramTypeNode && isAnyType(param, checker);
            if (explicitlyAny || implicitlyAny) {
              const pName = param.name.getText(sourceFile) || '<param>';
              const parentText = child.getText(sourceFile).slice(0, 200);
              if (parentText.includes('.sort(') || parentText.includes('.replace(') || parentText.includes('.forEach(') || parentText.includes('.map(')) continue;
              const guarded = functionBodyHasTypeGuard(child.body, pName);
              if (!guarded) {
                findings.push({
                  layer: 'R9',
                  severity: 'HIGH',
                  category: 'RUNTIME_CONTRACT',
                  file: construct.filePath,
                  line: getLineNumber(sourceFile, param),
                  evidence:
                    `${pName}: ${paramTypeNode ? paramTypeNode.getText(sourceFile) : '(implicit any)'}`,
                  description:
                    `Exported function "${fnName}" accepts parameter "${pName}" typed \`any\` without a runtime type guard`,
                  correction:
                    `Add a type guard for "${pName}" (typeof/instanceof) or declare a concrete parameter type`,
                  runtimeImpact:
                    'Public API accepts unstructured input — property access on callers\' data may throw at runtime',
                  confidence: 0.85,
                  constructType: construct.type,
                  callGraphRef: null,
                  evidenceSuppressed: false,
                });
              }
            }
          }

          // Target 5: any / missing return type on exported function.
          const retTypeNode = child.type;
          let returnTypeAny = false;
          if (isAnyKeyword(retTypeNode)) {
            returnTypeAny = true; // explicit `: any`
          } else if (!retTypeNode) {
            // No annotation — inspect the checker-inferred return type.
            const inferred = getFunctionReturnType(child, checker);
            if (inferred && (inferred.flags & ts.TypeFlags.Any) !== 0) {
              returnTypeAny = true;
            }
          }
          if (returnTypeAny) {
            findings.push({
              layer: 'R9',
              severity: 'HIGH',
              category: 'RUNTIME_CONTRACT',
              file: construct.filePath,
              line: getLineNumber(sourceFile, child),
              evidence: retTypeNode
                ? `: ${retTypeNode.getText(sourceFile)}`
                : '(no return type annotation — inferred any)',
              description: `Exported function "${fnName}" has an \`any\`/missing return type`,
              correction: 'Declare an explicit, concrete return type annotation',
              runtimeImpact:
                'Callers of the public API receive an untyped value — downstream usage is unchecked at compile time',
              confidence: 0.85,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }

        // ---------------------------------------------------------------
        // Target 6: direct eval() call
        // ---------------------------------------------------------------
        if (ts.isCallExpression(child)) {
          const callee = child.expression;
          if (ts.isIdentifier(callee) && callee.text === 'eval') {
            findings.push({
              layer: 'R9',
              severity: 'CRITICAL',
              category: 'RUNTIME_CONTRACT',
              file: construct.filePath,
              line: getLineNumber(sourceFile, child),
              evidence: child.getText(sourceFile),
              description: `Direct \`eval()\` call executes arbitrary strings as code`,
              correction:
                'Replace with a safe parser (JSON.parse, or the Function constructor with input sanitization) or remove dynamic evaluation',
              runtimeImpact: 'Arbitrary code execution — primary vector for code injection',
              confidence: 1.0,
              constructType: ConstructType.CALL_EXPRESSION,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }
      });

      return deduplicateFindings(findings);
    } catch (e: unknown) {
      console.error('[R9RuntimeContract]', e);
      return [];
    }
  },
};
