import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType, Severity } from '../types.ts';

// ---------------------------------------------------------------------------
// AST Helpers (iterative walk — mirrors R3 pattern)
// ---------------------------------------------------------------------------

function walkAstUp(node: ts.Node, visitor: (n: ts.Node) => boolean | void): void {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    const stop = visitor(current);
    if (stop === true) break;
    current = current.parent;
  }
}

// ---------------------------------------------------------------------------
// Structural Path Analysis (zero regex)
// ---------------------------------------------------------------------------

function isAlphaChar(c: string): boolean {
  if (c.length === 0) return false;
  const code = c.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isDigitChar(c: string): boolean {
  if (c.length === 0) return false;
  const code = c.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isUnixHomePath(value: string): boolean {
  const segments = value.split('/');
  if (segments.length < 3) return false;
  if (segments[0] !== '') return false;
  if (segments[1] !== 'home') return false;
  if (segments[2].length === 0) return false;
  return isAlphaChar(segments[2].charAt(0));
}

function isMacUsersPath(value: string): boolean {
  const segments = value.split('/');
  if (segments.length < 3) return false;
  if (segments[0] !== '') return false;
  if (segments[1] !== 'Users') return false;
  if (segments[2].length === 0) return false;
  return isAlphaChar(segments[2].charAt(0));
}

function isWindowsUsersPath(value: string): boolean {
  const normalized = value.split('\\\\').join('\\');
  const segments = normalized.split('\\');
  if (segments.length < 2) return false;
  const drive = segments[0];
  if (drive.length !== 2) return false;
  if (drive.charAt(1) !== ':') return false;
  if (!isAlphaChar(drive.charAt(0))) return false;
  return segments[1] === 'Users';
}

function hostHasPort(value: string, host: string): boolean {
  const prefix = host + ':';
  const idx = value.search(prefix);
  if (idx === -1) return false;

  const afterColon = value.slice(idx + prefix.length);
  let digitCount = 0;
  for (let i = 0; i < afterColon.length; i++) {
    if (isDigitChar(afterColon.charAt(i))) {
      digitCount++;
      if (digitCount >= 4) return true;
    } else {
      break;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Structural Pattern Registry
// ---------------------------------------------------------------------------

interface PathPattern {
  id: string;
  description: string;
  detector: (value: string) => boolean;
}

const PATH_PATTERNS: PathPattern[] = [
  { id: 'unix-home', description: 'unix home-directory', detector: isUnixHomePath },
  { id: 'mac-users', description: 'macOS Users-directory', detector: isMacUsersPath },
  { id: 'win-users', description: 'Windows Users-directory', detector: isWindowsUsersPath },
  { id: 'localhost', description: 'localhost', detector: (v) => hostHasPort(v, 'localhost') },
  { id: 'loopback', description: '127.0.0.1', detector: (v) => hostHasPort(v, '127.0.0.1') },
  { id: 'anyaddr', description: '0.0.0.0', detector: (v) => hostHasPort(v, '0.0.0.0') },
];

// ---------------------------------------------------------------------------
// AST Context Validation
// ---------------------------------------------------------------------------

function isInExecutableAstContext(node: ts.Node): boolean {
  let result = false;
  walkAstUp(node, (parent) => {
    if (ts.isImportDeclaration(parent)) {
      result = false;
      return true;
    }
    if (ts.isTypeNode(parent)) {
      result = false;
      return true;
    }
    if (ts.isVariableDeclaration(parent)) { result = true; return true; }
    if (ts.isBinaryExpression(parent)) { result = true; return true; }
    if (ts.isCallExpression(parent)) { result = true; return true; }
    if (ts.isReturnStatement(parent)) { result = true; return true; }
    if (ts.isPropertyAssignment(parent)) { result = true; return true; }
    if (ts.isTemplateExpression(parent)) { result = true; return true; }
    if (ts.isNewExpression(parent)) { result = true; return true; }
    if (ts.isConditionalExpression(parent)) { result = true; return true; }
    if (ts.isArrayLiteralExpression(parent)) { result = true; return true; }
    return false;
  });
  return result;
}

function isInsideComment(node: ts.Node): boolean {
  let found = false;
  walkAstUp(node, (parent) => {
    const kind = parent.kind;
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia ||
        kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      found = true;
      return true;
    }
    return false;
  });
  return found;
}

// ---------------------------------------------------------------------------
// Finding Deduplication
// ---------------------------------------------------------------------------

function deduplicateFindings(findings: AuditFinding[]): AuditFinding[] {
  const grouped = new Map<string, AuditFinding>();
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.category}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, f);
    } else {
      const severityOrder: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      if (severityOrder[f.severity] > severityOrder[existing.severity]) {
        grouped.set(key, f);
      }
    }
  }
  return Array.from(grouped.values());
}

// ---------------------------------------------------------------------------
// Layer Rule
// ---------------------------------------------------------------------------

export const R5_CONTAINER_DEPLOY: LayerRule = {
  layer: 'R5',
  name: 'Container Deploy',
  description: 'Detects hardcoded paths and container-incompatible patterns via AST structural analysis',
  applicableTo: [ConstructType.STRING_LITERAL],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) {
      return [];
    }
    const findings: AuditFinding[] = [];

    const node = construct.node;

    // Phase 1: AST context validation
    if (node) {
      if (isInsideComment(node)) {
        return findings;
      }

      let isInImport = false;
      walkAstUp(node, (parent) => {
        if (ts.isImportDeclaration(parent)) {
          isInImport = true;
          return true;
        }
        return false;
      });
      if (isInImport) {
        return findings;
      }
    } else {
      const parent = construct.parent;
      if (parent && (parent.type === ConstructType.IMPORT_DECLARATION ||
                     parent.type === ConstructType.LINE_COMMENT ||
                     parent.type === ConstructType.BLOCK_COMMENT)) {
        return findings;
      }
    }

    const value = construct.name;

    // Phase 2: Determine executable context
    let isInExecutable: boolean;
    if (node) {
      isInExecutable = isInExecutableAstContext(node);
    } else {
      const parent = construct.parent;
      isInExecutable = !!parent && (
        parent.type === ConstructType.VARIABLE_DECLARATION ||
        parent.type === ConstructType.BINARY_EXPRESSION ||
        parent.type === ConstructType.CALL_EXPRESSION ||
        parent.type === ConstructType.RETURN_STATEMENT
      );
    }

    if (!isInExecutable) {
      return findings;
    }

    // Phase 3: Structural path pattern detection (zero regex)
    if (isUnixHomePath(value)) {
      const segments = value.split('/');
      const hasWorkspaceRef = segments.some(s => s === 'OPENCODE_WORKSPACE');
      if (!hasWorkspaceRef) {
        findings.push({
          layer: 'R5',
          severity: 'HIGH',
          category: 'CONTAINER_DEPLOY',
          file: construct.filePath,
          line: construct.line,
          evidence: value,
          description: `Hardcoded home-directory path in executable code: "${value}" — will break in container`,
          correction: 'Use path.resolve(process.env.HOME, ...) or relative paths',
          runtimeImpact: 'Path does not exist in container — file operations fail silently or throw',
          confidence: 0.80,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
      return deduplicateFindings(findings);
    }

    for (const pattern of PATH_PATTERNS) {
      if (pattern.id === 'unix-home') continue;

      if (pattern.detector(value)) {
        findings.push({
          layer: 'R5',
          severity: 'HIGH',
          category: 'CONTAINER_DEPLOY',
          file: construct.filePath,
          line: construct.line,
          evidence: value,
          description: `Hardcoded ${pattern.description} path in executable code: "${value}" — will break in container`,
          correction: 'Use environment variables or relative paths for container-compatible code',
          runtimeImpact: 'Hardcoded local path does not exist in container — file operations fail',
          confidence: 0.80,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
        break;
      }
    }

    return deduplicateFindings(findings);
  },
};
