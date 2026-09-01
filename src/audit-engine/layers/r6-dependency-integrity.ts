import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

// ---------------------------------------------------------------------------
// AST Helpers (iterative walk — mirrors R3 pattern)
// ---------------------------------------------------------------------------

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
  return ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile)).line + 1;
}

// ---------------------------------------------------------------------------
// Structural Dependency Sets (Set.has() — zero Array lookups)
// ---------------------------------------------------------------------------

const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'child_process', 'crypto', 'stream', 'http', 'https',
  'net', 'url', 'util', 'events', 'buffer', 'assert', 'cluster', 'dgram',
  'dns', 'domain', 'inspector', 'perf_hooks', 'punycode', 'querystring',
  'readline', 'repl', 'tls', 'tty', 'v8', 'vm', 'worker_threads', 'zlib',
  'module', 'console', 'process', 'timers', 'timers/promises', 'node:test',
]);

const BUNDLED_PREFIXES = ['zod', '@ai-sdk'];

/** Check whether a module specifier refers to a Node.js builtin. */
function isNodeBuiltin(moduleSpecifier: string): boolean {
  const baseModule = moduleSpecifier.split('/')[0];
  return NODE_BUILTINS.has(baseModule) || baseModule === 'node';
}

/** Check whether a module specifier refers to a bundled (pre-packaged) module. */
function isBundledModule(moduleSpecifier: string): boolean {
  return BUNDLED_PREFIXES.some(prefix => moduleSpecifier.startsWith(prefix));
}

/** Check whether a module specifier is a local/relative import. */
function isLocalImport(moduleSpecifier: string): boolean {
  return moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/');
}

/** Check whether a module specifier is an opencode plugin import. */
function isOpencodePlugin(moduleSpecifier: string): boolean {
  return moduleSpecifier.startsWith('@opencode-ai');
}

/** Check whether a module specifier uses the node: prefix for builtins. */
function isNodePrefixed(moduleSpecifier: string): boolean {
  return moduleSpecifier.startsWith('node:');
}

/** Check whether a module specifier uses the bun: prefix for Bun runtime
 *  builtins (bun:sqlite, bun:test, bun:ffi, ... — the Bun runtime ships them
 *  natively; they resolve at runtime and can NEVER be package.json
 *  dependencies — the same class as node: builtins). */
function isBunPrefixed(moduleSpecifier: string): boolean {
  return moduleSpecifier.startsWith('bun:');
}

// ---------------------------------------------------------------------------
// Structural Import Analysis via AST
// ---------------------------------------------------------------------------

/**
 * Extract the module specifier string from an ImportDeclaration AST node.
 * Returns null if the node is not a valid ImportDeclaration.
 */
function getModuleSpecifierFromNode(node: ts.Node): string | null {
  if (!ts.isImportDeclaration(node)) return null;
  const specifier = node.moduleSpecifier;
  if (ts.isStringLiteral(specifier)) {
    return specifier.text;
  }
  return null;
}

/**
 * Extract imported symbol names from an ImportDeclaration.
 * Handles: default imports, named imports, namespace imports.
 */
function getImportedNames(node: ts.Node): string[] {
  if (!ts.isImportDeclaration(node)) return [];
  const clause = node.importClause;
  if (!clause) return [];

  const names: string[] = [];

  // Default import: import foo from 'bar'
  if (clause.name) {
    names.push(clause.name.text);
  }

  // Named bindings: import { a, b as c } from 'bar'
  if (clause.namedBindings) {
    if (ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        names.push(element.name.text);
      }
    }
    // Namespace import: import * as ns from 'bar'
    if (ts.isNamespaceImport(clause.namedBindings)) {
      names.push(clause.namedBindings.name.text);
    }
  }

  return names;
}

/**
 * Count references to a symbol name in a source file, excluding the
 * import declaration line itself. Used for unused import detection.
 */
function countSymbolReferences(
  sourceFile: ts.SourceFile,
  symbolName: string,
  importLine: number,
): number {
  let count = 0;
  walkAst(sourceFile, (node): void => {
    if (ts.isIdentifier(node) && node.text === symbolName) {
      const line = getLineNumber(sourceFile, node);
      if (line !== importLine) {
        count++;
      }
    }
  });
  return count;
}

/**
 * Use the TypeChecker to verify that an import declaration resolves
 * to a valid module symbol. Returns true if resolution succeeds or
 * the checker is unavailable (non-fatal).
 */
function verifyImportResolution(
  node: ts.Node,
  checker: ts.TypeChecker | null,
): { resolved: boolean; symbolName: string | null } {
  if (!checker) return { resolved: true, symbolName: null };
  if (!ts.isImportDeclaration(node)) return { resolved: true, symbolName: null };

  try {
    const symbol = checker.getSymbolAtLocation(node.moduleSpecifier);
    if (!symbol) {
      return { resolved: false, symbolName: null };
    }
    return { resolved: true, symbolName: symbol.name };
  } catch {
    // TypeChecker may fail on dynamic imports or malformed ASTs
    return { resolved: true, symbolName: null };
  }
}

// ---------------------------------------------------------------------------
// Layer Rule
// ---------------------------------------------------------------------------

export const R6_DEPENDENCY_INTEGRITY: LayerRule = {
  layer: 'R6',
  name: 'Dependency Integrity',
  description: 'Detects import issues, ESM/CJS conflicts, and missing dependencies via AST structural analysis',
  applicableTo: [ConstructType.IMPORT_DECLARATION, ConstructType.CALL_EXPRESSION],
  excludeTypes: [ConstructType.TEMPLATE_EXPRESSION, ConstructType.STRING_LITERAL],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];

    // -----------------------------------------------------------------
    // IMPORT_DECLARATION analysis
    // -----------------------------------------------------------------
    if (construct.type === ConstructType.IMPORT_DECLARATION) {
      const node = construct.node;

      // Prefer AST-derived module specifier; fall back to construct.name
      const moduleSpecifier = (node && getModuleSpecifierFromNode(node)) || construct.name;
      if (!moduleSpecifier) return findings;

      // CHECK 1: .ts extension import without allowImportingTsExtensions
      if (moduleSpecifier.endsWith('.ts') && ctx.tsconfig) {
        const allowTs = ctx.tsconfig.compilerOptions?.allowImportingTsExtensions;
        if (!allowTs) {
          findings.push({
            layer: 'R6',
            severity: 'MEDIUM',
            category: 'DEPENDENCY_INTEGRITY',
            file: construct.filePath,
            line: construct.line,
            evidence: `import from '${moduleSpecifier}'`,
            description: `.ts extension import without allowImportingTsExtensions in tsconfig`,
            correction: 'Set "allowImportingTsExtensions": true in tsconfig.json compilerOptions',
            runtimeImpact: 'tsc will error on build — blocks deployment pipeline',
            confidence: 0.90,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }

      // CHECK 2: Missing dependency in package.json
      // Structural: Set.has() lookups on pre-built dependency sets
      if (!isLocalImport(moduleSpecifier) &&
          !isOpencodePlugin(moduleSpecifier) &&
          !isNodePrefixed(moduleSpecifier) &&
          !isBunPrefixed(moduleSpecifier)) {

        const baseModule = moduleSpecifier.split('/')[0];
        const builtin = isNodeBuiltin(moduleSpecifier) || isBunPrefixed(moduleSpecifier);
        const bundled = isBundledModule(moduleSpecifier);

        if (!builtin && !bundled && ctx.packageJson) {
          const deps = Object.keys(ctx.packageJson.dependencies || {});
          const devDeps = Object.keys(ctx.packageJson.devDependencies || {});
          const depSet = new Set([...deps, ...devDeps]);

          if (!depSet.has(baseModule) && !depSet.has(moduleSpecifier)) {
            findings.push({
              layer: 'R6',
              severity: 'HIGH',
              category: 'DEPENDENCY_INTEGRITY',
              file: construct.filePath,
              line: construct.line,
              evidence: `import '${moduleSpecifier}'`,
              description: `Module "${moduleSpecifier}" imported but not in package.json dependencies`,
              correction: `Add "${baseModule}" to package.json dependencies or use a bundled alternative`,
              runtimeImpact: 'Import resolution fails at runtime — module not found error',
              confidence: 0.85,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }
      }



      // CHECK 4: Unused import detection (scoped: exclude type-only + fixtures)
      if (node && ts.isImportDeclaration(node)) {
        if (node.importClause?.isTypeOnly) { /* type-only imports erased at compile — not dead */ } else if (construct.filePath.includes('__tests__') || construct.filePath.includes('/fixtures/')) { /* fixture/test excluded */ } else {
        const sourceFile = node.getSourceFile();
        if (sourceFile) {
          const importedNames = getImportedNames(node);
          const importLine = construct.line;

          for (const name of importedNames) {
            if (name.length < 2) continue;
            const refCount = countSymbolReferences(sourceFile, name, importLine);
            if (refCount === 0) {
              findings.push({
                layer: 'R6',
                severity: 'LOW',
                category: 'DEPENDENCY_INTEGRITY',
                file: construct.filePath,
                line: importLine,
                evidence: `import { ${name} } from '${moduleSpecifier}' — zero references outside import`,
                description: `Imported symbol "${name}" is never referenced in ${construct.filePath} — dead import`,
                correction: `Remove unused import "${name}" to reduce bundle size and improve clarity`,
                runtimeImpact: 'Unused imports increase bundle size and may pull in unnecessary side effects',
                confidence: 0.80,
                constructType: construct.type,
                callGraphRef: null,
                evidenceSuppressed: false,
              });
            }
          }
        }
        }
      }
    }

    // -----------------------------------------------------------------
    // CALL_EXPRESSION: require() detection (CJS in ESM)
    // Structural: AST CallExpression with Identifier 'require'
    // -----------------------------------------------------------------
    if (construct.type === ConstructType.CALL_EXPRESSION && construct.name === 'require') {
      // Verify via AST that this is actually a require() call, not a
      // method named require on some object
      let isBareRequire = true;
      const node = construct.node;
      if (node && ts.isCallExpression(node)) {
        const expr = node.expression;
        // If the callee is a PropertyAccessExpression (obj.require()), it's not a bare require
        if (ts.isPropertyAccessExpression(expr)) {
          isBareRequire = false;
        }
      }

      if (isBareRequire) {
        findings.push({
          layer: 'R6',
          severity: 'HIGH',
          category: 'DEPENDENCY_INTEGRITY',
          file: construct.filePath,
          line: construct.line,
          evidence: construct.body.slice(0, 60),
          description: 'require() call found — CJS import in ESM module breaks bundling',
          correction: 'Replace require() with ES import statement',
          runtimeImpact: 'esbuild may not bundle CJS require correctly — runtime import error',
          confidence: 0.95,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    return findings;
  },
};
