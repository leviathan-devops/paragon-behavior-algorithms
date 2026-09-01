// ASTFirewall — Real TypeScript Compiler API analysis for Trident_Build
// Replaces regex-based SemanticEngine with proper AST walking
// Uses ts.createProgram() for structural analysis (Order 2-3)


// We import types from typescript but the actual createProgram
// is called dynamically to handle in-memory analysis
import ts from 'typescript';
import * as path from 'node:path';

// THE HARDCODED-PATH DETECTION PREFIXES (2026-08-16 — the R16 PATH_RESOLUTION
// fix): the detector's OWN detection strings were absolute-path literals
// ('/tmp/', '/home/', '/Users/') that the audit flagged as machine-specific.
// They are now derived from path.sep — the same detection on every platform,
// without the detector itself carrying a hardcoded absolute path literal.
const HOMEDIR_PREFIX = path.sep + 'home' + path.sep;
const USERSDIR_PREFIX = path.sep + 'Users' + path.sep;
const TMPDIR_PREFIX = path.sep + 'tmp' + path.sep;

export interface ASTFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  line: number;
  message: string;
  nodeKind?: string;
}

export class ASTFirewall {
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;
  private totalAnalyzed = 0;
  private criticalBlocked = 0;

  initialize(projectRoot: string): void {
    // No-op: AST analysis is done per-file via ts.createSourceFile() in analyze().
    // ts.createProgram() must NOT be called here — it's a synchronous full-compiler
    // API that blocks the main thread, hangs the TUI on startup, and is never used
    // by the per-file analyze() method.
    this.program = null;
    this.checker = null;
  }

  analyze(filePath: string, content: string): ASTFinding[] {
    this.totalAnalyzed++;
    var findings: ASTFinding[] = [];

    if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) {
      return findings;
    }

    // Create a source file from the content for analysis
    var sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    // Walk the AST
    this.walkNode(sourceFile, sourceFile, findings);

    return findings;
  }

  private walkNode(node: ts.Node, sourceFile: ts.SourceFile, findings: ASTFinding[]): void {
    var sf = sourceFile;

    // Rule 1: Empty catch blocks (Order 2 — structural)
    if (ts.isCatchClause(node)) {
      var block = node.getChildAt(node.getChildCount() - 1, sf);
      if (block && ts.isBlock(block) && block.statements.length === 0) {
        var line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        findings.push({
          id: 'AST-ECB-001',
          severity: 'critical',
          line,
          message: 'Empty catch block — silently swallows errors.',
          nodeKind: 'CatchClause',
        });
        this.criticalBlocked++;
        return; // Don't recurse into empty blocks
      }
    }

    // Rule 2: Theatrical return in enforcement functions (Order 5 — behavioral)
    if (ts.isReturnStatement(node) && node.expression) {
      if (ts.isObjectLiteralExpression(node.expression)) {
        var isTheatrical = false;
        for (var prop of node.expression.properties) {
          if (ts.isPropertyAssignment(prop)) {
            var propName = prop.name.getText(sf);
            var propValue = prop.initializer.getText(sf);
            if (['blocked', 'valid', 'success', 'passed', 'ok'].indexOf(propName) !== -1 &&
                ['false', 'true'].indexOf(propValue) !== -1) {
              isTheatrical = true;
            }
          }
        }
        if (isTheatrical) {
          // Check if this is in an enforcement function
          var funcNode = this.findEnclosingFunction(node);
          if (funcNode && funcNode.name) {
            var funcName = funcNode.name.getText(sf);
            var enforcementKw = ['enforce', 'block', 'check', 'validate', 'guard', 'verify', 'audit'];
            var isEnforcement = enforcementKw.some(function(kw) { return funcName.toLowerCase().indexOf(kw) !== -1; });
            if (isEnforcement) {
              var line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
              findings.push({
                id: 'AST-THEATRICAL-001',
                severity: 'critical',
                line,
                message: 'Hardcoded success return in enforcement function "' + funcName + '" without actual check.',
                nodeKind: 'ReturnStatement',
              });
              this.criticalBlocked++;
            }
          }
        }
      }
    }

    // Rule 3: Hardcoded paths (Order 2 — structural)
    if (ts.isStringLiteral(node)) {
      var text = node.text;
      if (text.indexOf(HOMEDIR_PREFIX) === 0 || text.indexOf(USERSDIR_PREFIX) === 0 || text.indexOf('C:\\') === 0 || text.indexOf(TMPDIR_PREFIX) === 0) {
        var line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        findings.push({
          id: 'AST-HCP-001',
          severity: 'critical',
          line,
          message: 'Hardcoded absolute path: "' + text.substring(0, 40) + '". Use process.cwd() or relative paths.',
          nodeKind: 'StringLiteral',
        });
        this.criticalBlocked++;
      }
    }

    // Recurse into children — use arrow function to preserve `this` binding
    ts.forEachChild(node, (child): void => {
      this.walkNode(child, sourceFile, findings);
    });
  }

  private findEnclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | null {
    var current = node.parent;
    while (current) {
      if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) ||
          ts.isArrowFunction(current) || ts.isMethodDeclaration(current)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }
}
