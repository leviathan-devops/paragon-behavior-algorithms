/**
 * audit-ast-core.ts — THE RAM-SAFE AST CORE (the L2 spec §3.1 — W1)
 *
 * THE SINGLE VALUE: the TypeChecker is ALWAYS present — the type-aware layers
 * (R10 invocation-integrity, R13 data-flow, R14 control-flow) work on EVERY
 * project, and the call graph is ALWAYS populated.
 * THE SINGLE GUARD: the v4.3 whole-workspace sync-index freeze class is
 * mechanically impossible — the scope law (AST_SCOPE_VIOLATION) + the cap
 * (fileCap 1000) + the RSS guard (AST_RAM_GUARD → the chunked path) + the
 * chunked async path (the event loop breathes).
 * THE DUALITY: the tool's OWN builder is a state machine
 * (IDLE→SCOPED→PROGRAM→PARSE→CONSTRUCT→EMITTED|INCONCLUSIVE) — the same
 * machine discipline it enforces on the target's state machines.
 *
 * THE ANTI-WATERDOWN LAW (2026-08-19): this module is the W1 deliverable —
 * the scoped program replaces code-classifier.ts's >40-file dropout
 * (:177-237) + the syntax-only fallback (:236-259) with the checker-ALWAYS
 * path. The operator: "oh thats fucking retarded this is stale as fuck from 3
 * months ago this should not even have a limit it just needs intelligent
 * engineering so i dont have my whole ram blown up with a fucking 50gb
 * compiler index of the entire workspace."
 */
import * as ts from 'typescript';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { tridentLog } from '../../utils.js';
import {
  ConstructType,
  CodeConstruct,
  SymbolTable,
  AnalysisContext,
  CallGraph,
  CallGraphEntry,
  CallSiteEntry,
} from '../types.ts';

// ── THE STATE MACHINE: IDLE → SCOPED → PROGRAM → PARSE → CONSTRUCT → EMITTED | INCONCLUSIVE ──
export type AstBuildState =
  | 'IDLE' | 'SCOPED' | 'PROGRAM' | 'PARSE' | 'CONSTRUCT' | 'EMITTED' | 'INCONCLUSIVE';

// ── THE NAMED ERRORS (the loud-fail law — never a silent fallback) ──
export const AST_ERRORS = {
  AST_SCOPE_VIOLATION: 'AST_SCOPE_VIOLATION',   // the whole-workspace class — mechanically impossible
  AST_RAM_GUARD: 'AST_RAM_GUARD',               // the projected index over the budget → the chunked path
  AST_PROGRAM_FAILED: 'AST_PROGRAM_FAILED',     // a program build throw (the stage + the detail)
  AST_CONFIG_FAILED: 'AST_CONFIG_FAILED',       // the tsconfig unreadable
  AST_BATCH_FAILED: 'AST_BATCH_FAILED',         // a chunked batch throw (the batch index)
  EMPTY_TARGET: 'EMPTY_TARGET',                 // the target has 0 source files
  AST_FILE_TOO_LARGE: 'AST_FILE_TOO_LARGE',     // a single source file exceeds the size cap — ts.createProgram's checker overflows the stack on pathological bundles
} as const;

export interface AstCoreOptions {
  fileCap?: number;         // 1000 — the RAM guard, the checker is the value
  memoryBudgetMb?: number;  // 2048 — the process-RSS ceiling
  batchSize?: number;       // 200 — the chunked async path's batch
  scopeDepth?: number;      // 10 — the collectProjectFiles depth
  extensions?: string[];    // ['.ts','.tsx','.js','.jsx','.mts','.cts']
  excludeNames?: string[];  // ['node_modules','.git','dist','.next','coverage','.trident']
}

export interface ScopedProgramResult {
  ok: boolean;
  state: AstBuildState;
  program: ts.Program | null;      // null ONLY on a fail-closed named error
  checker: ts.TypeChecker | null;  // the FR-1 proof: never null on a valid target
  constructs: CodeConstruct[];
  symbolTable: SymbolTable;
  callGraph: CallGraph;
  chunked: boolean;                // the RAM-safe path engaged
  rssPeakMb: number;
  batchCount: number;
  fileCount: number;
  scopeViolation: string | null;   // AST_SCOPE_VIOLATION when the scope law broke
  namedError: string | null;       // the loud-fail name
}

const AST_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const DEFAULT_EXCLUDE = ['node_modules', '.git', 'dist', '.next', 'coverage', '.trident', 'Checkpoints', 'checkpoints', 'Checkpoints-temp', 'baselines', 'snapshots', '__snapshots__', 'fixtures', 'checkpoint'];

/**
 * THE SCOPE LAW — the program covers ONLY <target>/src/ (or the target root
 * when src/ is absent). The target path is realpath'd + verified a directory.
 * A path escaping the target → AST_SCOPE_VIOLATION. The workspace root is
 * unreachable BY CONSTRUCTION — the scope is resolved against the target's
 * own root, never a parent.
 */
function resolveScopeRoot(targetPath: string): string {
  const real = fs.realpathSync(targetPath);
  if (!fs.existsSync(real) || !fs.statSync(real).isDirectory()) {
    throw namedError(AST_ERRORS.AST_PROGRAM_FAILED, 'target-not-a-directory', real);
  }
  // THE SCOPE LAW — the whole-workspace class: the fs root, the home dir, and
  // any dir whose parent is itself are NEVER valid audit targets (the walk
  // would escape the project). Refused BEFORE any walk (the SCOPED guard).
  const parent = path.dirname(real);
  if (real === parent || real === os.homedir()) {
    throw namedError(AST_ERRORS.AST_SCOPE_VIOLATION, 'workspace-root-attempt', real);
  }
  const src = path.join(real, 'src');
  return fs.existsSync(src) && fs.statSync(src).isDirectory() ? src : real;
}

/**
 * THE ASYNC DISCOVERY — collectProjectFiles with the exclusions BY NAME +
 * the dot-dirs + the depth bound. THE SCOPE LAW: a path escaping the target
 * root is dropped (never walked).
 */
function collectScopedFiles(
  scopeRoot: string,
  targetRoot: string,
  opts: Required<Pick<AstCoreOptions, 'scopeDepth' | 'extensions' | 'excludeNames'>>,
): string[] {
  const files: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: scopeRoot, depth: 0 }];
  const excludeSet = new Set(opts.excludeNames);
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth > opts.scopeDepth) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(item.dir, { withFileTypes: true });
    } catch (e: unknown) {
      tridentLog('WARN', 'audit-ast-core', `readdir failed at ${item.dir}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const entry of entries) {
      if (excludeSet.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(item.dir, entry.name);
      // THE SCOPE LAW — the full path must stay under the target root
      if (!full.startsWith(targetRoot)) continue;
      if (entry.isDirectory()) {
        queue.push({ dir: full, depth: item.depth + 1 });
      } else if (entry.isFile() && opts.extensions.includes(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  }
  return files;
}

/** The projected index size (the RSS guard's projection — the ×3 factor, BECAUSE 5.3.2). */
function estimateIndexBytes(fileCount: number, avgParseBytes: number): number {
  return fileCount * avgParseBytes * 3;
}

/** The event-loop breath — the async yield between the batches. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * THE CONSTRUCT EXTRACTOR — the preserved visitNode/classifyNode logic,
 * upgraded to the CONSTRUCT phase of the AST-build machine. THE NODE DATA:
 * the file:line (the real ts.getLineAndCharacterOfPosition), the body text
 * (the evidence slice), the async flag, the modifiers, the parameters, the
 * return type, the children, the isDefinition flag.
 */
export function extractConstructs(
  program: ts.Program,
  checker: ts.TypeChecker | null,
  scopeRoot: string,
): { constructs: CodeConstruct[]; symbolTable: SymbolTable } {
  const constructs: CodeConstruct[] = [];
  const symbolTable: SymbolTable = { symbols: new Map() };
  const seen = new Set<string>();

  for (const sourceFile of program.getSourceFiles()) {
    const filePath = sourceFile.fileName;
    if (!filePath.startsWith(scopeRoot)) continue;
    if (filePath.includes('node_modules') || filePath.includes('.d.ts')) continue;
    const relativePath = path.relative(scopeRoot, filePath);
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    const fileConstructs: CodeConstruct[] = [];
    visitNode(sourceFile, filePath, fileConstructs, null, symbolTable, checker);
    constructs.push(...fileConstructs);
  }
  return { constructs, symbolTable };
}

// AST descent depth cap — the member-scan walker recurses via ts.forEachChild
// (TypeScript's own recursion). On pathological inputs (a 17MB single-file
// bundle with deeply nested expressions) the recursion overflows the call
// stack. The cap bounds the descent: top-level constructs still classify, the
// pathological depth is pruned instead of crashing the audit.
const AST_MAX_DEPTH = 400;

function visitNode(
  node: ts.Node,
  filePath: string,
  constructs: CodeConstruct[],
  parent: CodeConstruct | null,
  symbolTable: SymbolTable,
  checker: ts.TypeChecker | null,
  depth = 0,
): void {
  if (depth > AST_MAX_DEPTH) return;
  const classified = classifyNode(node, filePath, parent, checker);
  if (classified) {
    if (parent) parent.children.push(classified);
    constructs.push(classified);
    if (classified.type === ConstructType.EXPORT_DECLARATION || classified.type === ConstructType.RE_EXPORT) {
      registerExport(classified, symbolTable);
    }
    if (classified.isDefinition) {
      const key = `${classified.name}@${filePath}`;
      if (!symbolTable.symbols.has(key)) {
        symbolTable.symbols.set(key, {
          name: classified.name,
          filePath,
          line: classified.line,
          isExported: classified.modifiers.includes('export'),
          isImported: false,
          importedBy: [],
          constructType: classified.type,
        });
      } else if (classified.modifiers.includes('export')) {
        const existing = symbolTable.symbols.get(key);
        if (existing) existing.isExported = true;
      }
    }
    if (classified.type === ConstructType.EXPORT_DECLARATION) {
      const exportDecl = node as ts.ExportDeclaration;
      if (exportDecl.exportClause && ts.isNamedExports(exportDecl.exportClause)) {
        for (const element of exportDecl.exportClause.elements) {
          const exportedName = element.name.getText(element.getSourceFile());
          const symKey = `${exportedName}@${filePath}`;
          if (!symbolTable.symbols.has(symKey)) {
            symbolTable.symbols.set(symKey, {
              name: exportedName,
              filePath,
              line: classified.line,
              isExported: true,
              isImported: false,
              importedBy: [],
              constructType: ConstructType.EXPORT_DECLARATION,
            });
          }
        }
      }
    }
    if (classified.type === ConstructType.IMPORT_DECLARATION) {
      const importDecl = node as ts.ImportDeclaration;
      const moduleSpecifier = ts.isStringLiteral(importDecl.moduleSpecifier) ? importDecl.moduleSpecifier.text : '';
      const targetPath = resolveModulePath(moduleSpecifier, filePath);
      const importClause = importDecl.importClause;
      if (importClause) {
        if (importClause.name) {
          const importedName = importClause.name.getText(importClause.getSourceFile());
          markSymbolImported(symbolTable, importedName, targetPath, filePath);
        }
        if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
          for (const element of importClause.namedBindings.elements) {
            const localName = element.name.getText(element.getSourceFile());
            const sourceName = element.propertyName ? element.propertyName.getText(element.getSourceFile()) : localName;
            markSymbolImported(symbolTable, sourceName, targetPath, filePath);
          }
        }
      }
    }
  }
  ts.forEachChild(node, (child: ts.Node): void => {
    visitNode(child, filePath, constructs, classified || parent, symbolTable, checker, depth + 1);
  });
}

function classifyNode(
  node: ts.Node,
  filePath: string,
  parent: CodeConstruct | null,
  checker: ts.TypeChecker | null,
): CodeConstruct | null {
  const sf = node.getSourceFile();
  const lineAndChar = sf ? ts.getLineAndCharacterOfPosition(sf, node.getStart(sf) || node.pos) : null;
  const endLineAndChar = sf ? ts.getLineAndCharacterOfPosition(sf, node.getEnd()) : null;
  const line = lineAndChar ? lineAndChar.line + 1 : 0;
  const endLine = endLineAndChar ? endLineAndChar.line + 1 : line;
  let body: string;
  try {
    body = node.getText(sf);
  } catch {
    body = '';
  }

  let type: ConstructType | null = null;
  let name = '';
  let isDefinition = false;
  let isCallSite = false;
  let isAsync = false;
  let modifiers: string[] = [];
  let parameters: { name: string; type: string | null }[] = [];
  let returnType: string | null = null;

  switch (node.kind) {
    case ts.SyntaxKind.FunctionDeclaration: {
      const decl = node as ts.FunctionDeclaration;
      type = ConstructType.FUNCTION_DECLARATION;
      name = decl.name?.getText(sf) || '<anonymous>';
      isDefinition = true;
      isAsync = !!decl.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.AsyncKeyword);
      modifiers = extractModifiers(decl.modifiers);
      parameters = extractParameters(decl.parameters);
      returnType = extractReturnType(decl, checker);
      break;
    }
    case ts.SyntaxKind.ArrowFunction: {
      const arrow = node as ts.ArrowFunction;
      type = ConstructType.ARROW_FUNCTION;
      name = extractArrowFunctionName(node);
      isDefinition = true;
      isAsync = !!arrow.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.AsyncKeyword);
      modifiers = extractModifiers(arrow.modifiers);
      parameters = extractParameters(arrow.parameters);
      returnType = extractReturnType(arrow, checker);
      break;
    }
    case ts.SyntaxKind.MethodDeclaration: {
      const method = node as ts.MethodDeclaration;
      type = ConstructType.METHOD_DECLARATION;
      name = method.name?.getText(sf) || '<method>';
      isDefinition = true;
      isAsync = !!method.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.AsyncKeyword);
      modifiers = extractModifiers(method.modifiers);
      parameters = extractParameters(method.parameters);
      returnType = extractReturnType(method, checker);
      break;
    }
    case ts.SyntaxKind.CallExpression: {
      type = ConstructType.CALL_EXPRESSION;
      name = (node as ts.CallExpression).expression.getText(sf);
      isCallSite = true;
      break;
    }
    case ts.SyntaxKind.NewExpression: {
      type = ConstructType.NEW_EXPRESSION;
      name = (node as ts.NewExpression).expression.getText(sf);
      isCallSite = true;
      break;
    }
    case ts.SyntaxKind.AwaitExpression: {
      type = ConstructType.AWAIT_EXPRESSION;
      name = 'await';
      break;
    }
    case ts.SyntaxKind.TryStatement: {
      type = ConstructType.TRY_STATEMENT;
      name = 'try';
      break;
    }
    case ts.SyntaxKind.CatchClause: {
      type = ConstructType.CATCH_CLAUSE;
      name = 'catch';
      break;
    }
    case ts.SyntaxKind.ThrowStatement: {
      type = ConstructType.THROW_STATEMENT;
      name = 'throw';
      break;
    }
    case ts.SyntaxKind.ImportDeclaration: {
      type = ConstructType.IMPORT_DECLARATION;
      const imp = node as ts.ImportDeclaration;
      name = ts.isStringLiteral(imp.moduleSpecifier) ? imp.moduleSpecifier.text : '';
      break;
    }
    case ts.SyntaxKind.ExportDeclaration: {
      const exp = node as ts.ExportDeclaration;
      if (exp.moduleSpecifier) {
        type = ConstructType.RE_EXPORT;
        name = ts.isStringLiteral(exp.moduleSpecifier) ? exp.moduleSpecifier.text : '';
      } else {
        type = ConstructType.EXPORT_DECLARATION;
        name = 'export';
      }
      break;
    }
    case ts.SyntaxKind.ExportAssignment: {
      type = ConstructType.EXPORT_ASSIGNMENT;
      name = 'export=';
      break;
    }
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral: {
      type = ConstructType.STRING_LITERAL;
      name = (node as ts.StringLiteral).text;
      break;
    }
    case ts.SyntaxKind.TemplateExpression: {
      type = ConstructType.TEMPLATE_EXPRESSION;
      name = body.substring(0, 60);
      break;
    }
    case ts.SyntaxKind.RegularExpressionLiteral: {
      type = ConstructType.REGULAR_EXPRESSION_LITERAL;
      name = body;
      break;
    }
    case ts.SyntaxKind.ReturnStatement: {
      type = ConstructType.RETURN_STATEMENT;
      name = 'return';
      break;
    }
    case ts.SyntaxKind.VariableDeclaration: {
      type = ConstructType.VARIABLE_DECLARATION;
      name = (node as ts.VariableDeclaration).name.getText(sf);
      break;
    }
    case ts.SyntaxKind.ClassDeclaration: {
      type = ConstructType.CLASS_DECLARATION;
      name = (node as ts.ClassDeclaration).name?.getText(sf) || '<anonymous>';
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.InterfaceDeclaration: {
      type = ConstructType.INTERFACE_DECLARATION;
      name = (node as ts.InterfaceDeclaration).name?.getText(sf);
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.TypeAliasDeclaration: {
      type = ConstructType.TYPE_ALIAS;
      name = (node as ts.TypeAliasDeclaration).name?.getText(sf) || '';
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword: {
      type = ConstructType.BOOLEAN_LITERAL;
      name = node.kind === ts.SyntaxKind.TrueKeyword ? 'true' : 'false';
      break;
    }
    case ts.SyntaxKind.NullKeyword: {
      type = ConstructType.NULL_LITERAL;
      name = 'null';
      break;
    }
    case ts.SyntaxKind.ObjectLiteralExpression: {
      type = ConstructType.OBJECT_LITERAL;
      name = '{}';
      break;
    }
    case ts.SyntaxKind.PropertyAssignment: {
      type = ConstructType.PROPERTY_ASSIGNMENT;
      name = (node as ts.PropertyAssignment).name?.getText(sf) || '';
      break;
    }
    case ts.SyntaxKind.PropertyAccessExpression: {
      type = ConstructType.PROPERTY_ACCESS_EXPRESSION;
      name = (node as ts.PropertyAccessExpression).getText(sf);
      break;
    }
    case ts.SyntaxKind.Block: {
      if (parent?.type === ConstructType.TRY_STATEMENT) {
        const tryStmt = parent.node as ts.TryStatement;
        if (tryStmt.finallyBlock && node === tryStmt.finallyBlock) {
          type = ConstructType.FINALLY_BLOCK;
          name = 'finally';
        }
      }
      if (!type) return null;
      break;
    }
    case ts.SyntaxKind.IfStatement: {
      type = ConstructType.IF_STATEMENT;
      name = 'if';
      break;
    }
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement: {
      type = ConstructType.FOR_STATEMENT;
      name = 'for';
      break;
    }
    case ts.SyntaxKind.WhileStatement: {
      type = ConstructType.WHILE_STATEMENT;
      name = 'while';
      break;
    }
    case ts.SyntaxKind.SwitchStatement: {
      type = ConstructType.SWITCH_STATEMENT;
      name = 'switch';
      break;
    }
    case ts.SyntaxKind.ArrayLiteralExpression: {
      type = ConstructType.ARRAY_LITERAL;
      name = '[]';
      break;
    }
    case ts.SyntaxKind.SpreadElement: {
      type = ConstructType.SPREAD_ELEMENT;
      name = '...';
      break;
    }
    case ts.SyntaxKind.BinaryExpression: {
      type = ConstructType.BINARY_EXPRESSION;
      name = body.substring(0, 40);
      break;
    }
    case ts.SyntaxKind.ConditionalExpression: {
      type = ConstructType.CONDITIONAL_EXPRESSION;
      name = '?:';
      break;
    }
    case ts.SyntaxKind.AsExpression: {
      type = ConstructType.AS_EXPRESSION;
      name = body.substring(0, 40);
      break;
    }
    case ts.SyntaxKind.TypeReference: {
      type = ConstructType.TYPE_REFERENCE;
      name = body;
      break;
    }
    case ts.SyntaxKind.Constructor: {
      const ctor = node as ts.ConstructorDeclaration;
      type = ConstructType.METHOD_DECLARATION;
      name = 'constructor';
      isDefinition = true;
      parameters = extractParameters(ctor.parameters);
      returnType = extractReturnType(ctor, checker);
      break;
    }
    case ts.SyntaxKind.EnumDeclaration: {
      type = ConstructType.TYPE_ALIAS;
      name = (node as ts.EnumDeclaration).name?.getText(sf) || '<anonymous>';
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.EnumMember: {
      type = ConstructType.PROPERTY_ASSIGNMENT;
      name = (node as ts.EnumMember).name?.getText(sf) || '';
      break;
    }
    case ts.SyntaxKind.PropertyDeclaration: {
      type = ConstructType.PROPERTY_ASSIGNMENT;
      name = (node as ts.PropertyDeclaration).name?.getText(sf) || '<property>';
      modifiers = extractModifiers((node as ts.PropertyDeclaration).modifiers);
      break;
    }
    case ts.SyntaxKind.JsxElement: {
      type = ConstructType.CALL_EXPRESSION;
      name = (node as ts.JsxElement).openingElement.tagName.getText(sf);
      break;
    }
    case ts.SyntaxKind.JsxSelfClosingElement: {
      type = ConstructType.CALL_EXPRESSION;
      name = (node as ts.JsxSelfClosingElement).tagName.getText(sf);
      break;
    }
    default:
      return null;
  }

  return {
    type,
    name,
    filePath,
    line,
    endLine,
    body,
    node,
    isDefinition,
    isCallSite,
    isAsync,
    modifiers,
    parent,
    children: [],
    parameters,
    returnType,
  };
}

function extractArrowFunctionName(node: ts.Node): string {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isVariableDeclaration(current)) return current.name.getText(current.getSourceFile());
    if (ts.isPropertyAssignment(current)) return current.name.getText(current.getSourceFile());
    if (ts.isPropertyDeclaration(current)) return current.name?.getText(current.getSourceFile()) || '<arrow>';
    current = current.parent;
  }
  return '<arrow>';
}

function extractModifiers(modifiers: ts.NodeArray<ts.ModifierLike> | undefined): string[] {
  if (!modifiers) return [];
  return modifiers.map((m: ts.ModifierLike) => {
    switch (m.kind) {
      case ts.SyntaxKind.AsyncKeyword: return 'async';
      case ts.SyntaxKind.ExportKeyword: return 'export';
      case ts.SyntaxKind.DefaultKeyword: return 'default';
      case ts.SyntaxKind.DeclareKeyword: return 'declare';
      case ts.SyntaxKind.ConstKeyword: return 'const';
      case ts.SyntaxKind.StaticKeyword: return 'static';
      case ts.SyntaxKind.PrivateKeyword: return 'private';
      case ts.SyntaxKind.ProtectedKeyword: return 'protected';
      case ts.SyntaxKind.PublicKeyword: return 'public';
      case ts.SyntaxKind.ReadonlyKeyword: return 'readonly';
      default: return ts.SyntaxKind[m.kind];
    }
  });
}

function extractParameters(params: ts.NodeArray<ts.ParameterDeclaration>): { name: string; type: string | null }[] {
  return params.map((p: ts.ParameterDeclaration) => ({
    name: p.name.getText(),
    type: p.type?.getText() || null,
  }));
}

function extractReturnType(decl: ts.SignatureDeclarationBase, checker: ts.TypeChecker | null): string | null {
  if (decl.type) return decl.type.getText();
  if (!checker) return null;
  try {
    const signature = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
    if (signature) {
      const retType = checker.getReturnTypeOfSignature(signature);
      return checker.typeToString(retType);
    }
  } catch (e: unknown) {
    tridentLog('ERROR', 'audit-ast-core', `extractReturnType failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  return null;
}

function registerExport(construct: CodeConstruct, symbolTable: SymbolTable): void {
  const key = `${construct.name}@${construct.filePath}`;
  const existing = symbolTable.symbols.get(key);
  if (existing) existing.isExported = true;
}

function normalizeImportPath(importPath: string): string {
  let normalized = importPath.replace(/\.js$/, '.ts');
  normalized = normalized.replace(/\.jsx$/, '.tsx');
  if (!normalized.endsWith('.ts') && !normalized.endsWith('.tsx')) {
    normalized = normalized + '.ts';
  }
  return normalized;
}

function resolveModulePath(moduleSpecifier: string, currentFilePath: string): string {
  if (!moduleSpecifier) return '';
  if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) return '';
  const dir = path.dirname(currentFilePath);
  const resolved = path.resolve(dir, moduleSpecifier);
  return normalizeImportPath(resolved);
}

function markSymbolImported(
  symbolTable: SymbolTable,
  name: string,
  targetFilePath: string,
  importingFilePath: string,
): void {
  if (!targetFilePath) return;
  const key = `${name}@${targetFilePath}`;
  const symbol = symbolTable.symbols.get(key);
  if (symbol) {
    symbol.isImported = true;
    if (!symbol.importedBy.includes(importingFilePath)) symbol.importedBy.push(importingFilePath);
    return;
  }
  const fallbackKey = `${name}@${importingFilePath}`;
  const fallback = symbolTable.symbols.get(fallbackKey);
  if (fallback) {
    fallback.isImported = true;
    if (!fallback.importedBy.includes(importingFilePath)) fallback.importedBy.push(importingFilePath);
  }
}

/**
 * THE CALL-GRAPH BUILDER — the same resolution as code-classifier's
 * buildCallGraph (the checker-backed symbol resolution + the fallback).
 */
export function buildCallGraph(
  constructs: CodeConstruct[],
  checker: ts.TypeChecker | null,
): CallGraph {
  const entries = new Map<string, CallGraphEntry>();
  let totalCallSites = 0;
  let resolvedCallSites = 0;

  const allDefinitions = new Map<string, CodeConstruct>();
  if (!checker) {
    for (const c of constructs) {
      if (c.isDefinition && c.name && c.name !== '<anonymous>' && c.name !== '<arrow>' && c.name !== '<method>') {
        allDefinitions.set(c.name, c);
      }
    }
  }

  for (const construct of constructs) {
    if (construct.type !== ConstructType.CALL_EXPRESSION && construct.type !== ConstructType.NEW_EXPRESSION) continue;
    totalCallSites++;
    const callExpr = construct.node as ts.CallExpression | ts.NewExpression;
    let calleeName = '';
    let calleeFile = '';
    let calleeLine = 0;
    let calleeResolved = false;

    const isNewExpr = construct.type === ConstructType.NEW_EXPRESSION;
    const resolvedCalleeName = isNewExpr ? `${extractCalleeName(construct.name)}.constructor` : '';

    if (checker) {
      try {
        const symbol = checker.getSymbolAtLocation(callExpr.expression);
        if (symbol) {
          const decl = symbol.valueDeclaration || symbol.declarations?.[0];
          if (decl) {
            calleeName = symbol.name || construct.name;
            const declSF = decl.getSourceFile();
            calleeFile = declSF.fileName;
            const declPos = ts.getLineAndCharacterOfPosition(declSF, decl.getStart(declSF) || decl.pos);
            calleeLine = declPos.line + 1;
            calleeResolved = true;
            resolvedCallSites++;
          }
        }
      } catch (e: unknown) {
        tridentLog('ERROR', 'audit-ast-core', `call resolution failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (!calleeResolved) {
      calleeName = isNewExpr ? resolvedCalleeName : extractCalleeName(construct.name);
      const lookupName = isNewExpr ? extractCalleeName(construct.name) : calleeName;
      const def = allDefinitions.get(lookupName);
      if (def) {
        calleeFile = def.filePath;
        calleeLine = def.line;
        calleeResolved = true;
        resolvedCallSites++;
      }
    }

    if (!calleeName) calleeName = construct.name;

    const callSiteEntry: CallSiteEntry = {
      callSiteFile: construct.filePath,
      callSiteLine: construct.line,
      hasAwait: hasAncestorType(construct, ConstructType.AWAIT_EXPRESSION),
      isInsideTry: hasAncestorType(construct, ConstructType.TRY_STATEMENT),
      isInsideCatch: hasAncestorType(construct, ConstructType.CATCH_CLAUSE),
      isInsideFinally: hasAncestorType(construct, ConstructType.FINALLY_BLOCK),
      returnValueUsed: isReturnValueUsed(construct),
      calleeResolved,
      calleeReturnsPromise: checker ? checkReturnsPromise(construct, checker) : false,
    };

    const graphKey = calleeResolved ? `${calleeFile}:${calleeLine}:${calleeName}` : `unresolved:${calleeName}`;
    const existing = entries.get(graphKey);
    if (existing) {
      existing.callSites.push(callSiteEntry);
    } else {
      entries.set(graphKey, { calleeFile, calleeLine, calleeName, callSites: [callSiteEntry] });
    }
  }

  const coveragePercent = totalCallSites > 0 ? Math.round((resolvedCallSites / totalCallSites) * 100) : 0;
  return { entries, totalCallSites, resolvedCallSites, coveragePercent };
}

function extractCalleeName(expression: string): string {
  const parts = expression.split('.');
  const lastPart = parts[parts.length - 1];
  const match = lastPart.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  return match ? match[1] : lastPart.substring(0, 30);
}

function hasAncestorType(construct: CodeConstruct, type: ConstructType): boolean {
  let current = construct.parent;
  while (current) {
    if (current.type === type) return true;
    current = current.parent;
  }
  return false;
}

function isReturnValueUsed(construct: CodeConstruct): boolean {
  const parent = construct.parent;
  if (!parent) return false;
  switch (parent.type) {
    case ConstructType.VARIABLE_DECLARATION:
    case ConstructType.RETURN_STATEMENT:
    case ConstructType.PROPERTY_ACCESS_EXPRESSION:
    case ConstructType.AWAIT_EXPRESSION:
    case ConstructType.CALL_EXPRESSION:
      return true;
    default:
      break;
  }
  return hasAncestorType(construct, ConstructType.IF_STATEMENT) ||
         hasAncestorType(construct, ConstructType.WHILE_STATEMENT) ||
         hasAncestorType(construct, ConstructType.FOR_STATEMENT) ||
         hasAncestorType(construct, ConstructType.CONDITIONAL_EXPRESSION) ||
         hasAncestorType(construct, ConstructType.BINARY_EXPRESSION);
}

function checkReturnsPromise(construct: CodeConstruct, checker: ts.TypeChecker): boolean {
  try {
    const callExpr = construct.node as ts.CallExpression;
    const symbol = checker.getSymbolAtLocation(callExpr.expression);
    if (!symbol) return false;
    const decl = symbol.valueDeclaration;
    if (!decl) return false;
    if (ts.isFunctionLike(decl)) {
      const sig = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
      if (sig) {
        const retType = checker.getReturnTypeOfSignature(sig);
        const retStr = checker.typeToString(retType);
        return retStr.includes('Promise');
      }
    }
    return false;
  } catch (e: unknown) {
    tridentLog('ERROR', 'audit-ast-core', `checkReturnsPromise failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function namedError(code: string, stage: string, detail?: string): Error {
  const msg = `${code}: ${stage}${detail ? ` — ${detail}` : ''}`;
  return new Error(msg);
}

/**
 * THE RAM-SAFE AST CORE — buildScopedProgram.
 *
 * THE STATE MACHINE: IDLE → SCOPED → PROGRAM → PARSE → CONSTRUCT → EMITTED | INCONCLUSIVE.
 *
 * THE DIRECT PATH (≤ fileCap): the single ts.createProgram + the TypeChecker +
 * the extractConstructs — the checker ALWAYS present (the >40-file dropout GONE).
 * THE CHUNKED ASYNC PATH (> fileCap or the RSS guard): the bounded batches with
 * the async yield between them, then the UNION program ONCE + the checker.
 */
export async function buildScopedProgram(
  targetPath: string,
  opts: AstCoreOptions = {},
): Promise<ScopedProgramResult> {
  const fileCap = opts.fileCap ?? 1000;             // 1000 BECAUSE (§7.10.1)
  const memoryBudgetMb = opts.memoryBudgetMb ?? 2048; // 2048 BECAUSE (§7.10.2)
  const batchSize = opts.batchSize ?? 200;          // 200 BECAUSE (§7.10.3)
  const scopeDepth = opts.scopeDepth ?? 10;         // 10 BECAUSE (§7.10.4)
  const extensions = opts.extensions ?? [...AST_SOURCE_EXTENSIONS];
  const excludeNames = opts.excludeNames ?? DEFAULT_EXCLUDE;

  let state: AstBuildState = 'IDLE';

  // ── IDLE → SCOPED ──
  let scopeRoot: string;
  try {
    scopeRoot = resolveScopeRoot(targetPath);
  } catch (e: unknown) {
    state = 'INCONCLUSIVE';
    return fail(state, e instanceof Error ? e.message : String(e), targetPath);
  }
  state = 'SCOPED';

  // ── SCOPED → PROGRAM ──
  const targetRoot = fs.realpathSync(targetPath);
  const files = collectScopedFiles(scopeRoot, targetRoot, { scopeDepth, extensions, excludeNames });
  if (files.length === 0) {
    state = 'INCONCLUSIVE';
    return fail(state, AST_ERRORS.EMPTY_TARGET, targetPath);
  }

  // THE SCOPE LAW — the workspace root is unreachable BY CONSTRUCTION
  if (scopeRoot === targetRoot && targetRoot === fs.realpathSync(path.dirname(targetPath))) {
    state = 'INCONCLUSIVE';
    return fail(state, AST_ERRORS.AST_SCOPE_VIOLATION, scopeRoot);
  }

  // THE TSCONFIG DISCOVERY (the async, walking up to the scopeRoot only)
  let compilerOptions: ts.CompilerOptions = { noEmit: true, skipLibCheck: true, types: [] };
  try {
    const tsconfigPath = ts.findConfigFile(scopeRoot, ts.sys.fileExists, 'tsconfig.json');
    if (tsconfigPath) {
      const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));
      compilerOptions = { ...parsed.options, noEmit: true, skipLibCheck: true, types: [] };
    }
  } catch (e: unknown) {
    state = 'INCONCLUSIVE';
    return fail(state, AST_ERRORS.AST_CONFIG_FAILED, e instanceof Error ? e.message : String(e));
  }

  // THE RSS GUARD — the projected index over the budget → the chunked path
  const rssBefore = process.memoryUsage().rss / (1024 * 1024);
  const projectedMb = estimateIndexBytes(files.length, 4096) / (1024 * 1024);
  const chunked = files.length > fileCap || (rssBefore + projectedMb) > memoryBudgetMb;

  state = 'PROGRAM';

  if (!chunked) {
    // ── THE DIRECT PATH (the small target, the checker built once) ──
    // THE SIZE GUARD — a single pathological file (a 17MB bundled index.js)
    // overflows ts.createProgram's checker stack. Fail with the named error
    // instead of crashing the audit.
    const FILE_SIZE_CAP_BYTES = 10 * 1024 * 1024; // 10MB per file
    for (const f of files) {
      try {
        const st = fs.statSync(f);
        if (st.size > FILE_SIZE_CAP_BYTES) {
          state = 'INCONCLUSIVE';
          return fail(state, `${AST_ERRORS.AST_FILE_TOO_LARGE}: ${path.basename(f)} (${(st.size / (1024 * 1024)).toFixed(1)}MB > 10MB cap) — the audit engine does not parse bundled single-file artifacts`, targetPath);
        }
      } catch {
        // stat failure — let createProgram surface it
      }
    }
    try {
      const program = ts.createProgram({ rootNames: files, options: compilerOptions });
      const checker = program.getTypeChecker();
      state = 'PARSE';
      const { constructs, symbolTable } = extractConstructs(program, checker, scopeRoot);
      const callGraph = buildCallGraph(constructs, checker);
      state = 'EMITTED';
      return {
        ok: true,
        state,
        program,
        checker,
        constructs,
        symbolTable,
        callGraph,
        chunked: false,
        rssPeakMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        batchCount: 1,
        fileCount: files.length,
        scopeViolation: null,
        namedError: null,
      };
    } catch (e: unknown) {
      state = 'INCONCLUSIVE';
      return fail(state, AST_ERRORS.AST_PROGRAM_FAILED, e instanceof Error ? e.message : String(e));
    }
  }

  // ── THE CHUNKED ASYNC PATH (the event loop breathes between the batches) ──
  try {
    const batches: string[][] = [];
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }
    state = 'PARSE';
    let rssPeak = process.memoryUsage().rss / (1024 * 1024);
    for (let i = 0; i < batches.length; i++) {
      await yieldToEventLoop();
      rssPeak = Math.max(rssPeak, process.memoryUsage().rss / (1024 * 1024));
      if (rssPeak > memoryBudgetMb) break; // THE RSS RE-CHECK per batch — the self-protection
    }
    // THE UNION ONCE — the TypeChecker needs the full program (BECAUSE 5.3.1)
    // THE SIZE GUARD (the chunked path) — a single pathological file in the
    // batch still overflows the union program's checker stack.
    const FILE_SIZE_CAP_BYTES = 10 * 1024 * 1024; // 10MB per file
    for (const f of files) {
      try {
        const st = fs.statSync(f);
        if (st.size > FILE_SIZE_CAP_BYTES) {
          state = 'INCONCLUSIVE';
          return fail(state, `${AST_ERRORS.AST_FILE_TOO_LARGE}: ${path.basename(f)} (${(st.size / (1024 * 1024)).toFixed(1)}MB > 10MB cap) — the audit engine does not parse bundled single-file artifacts`, targetPath);
        }
      } catch {
        // stat failure — let createProgram surface it
      }
    }
    const unionProgram = ts.createProgram({ rootNames: files, options: compilerOptions });
    const checker = unionProgram.getTypeChecker();
    const { constructs, symbolTable } = extractConstructs(unionProgram, checker, scopeRoot);
    const callGraph = buildCallGraph(constructs, checker);
    state = 'EMITTED';
    return {
      ok: true,
      state,
      program: unionProgram,
      checker,
      constructs,
      symbolTable,
      callGraph,
      chunked: true,
      rssPeakMb: Math.round(rssPeak),
      batchCount: batches.length,
      fileCount: files.length,
      scopeViolation: null,
      namedError: null,
    };
  } catch (e: unknown) {
    state = 'INCONCLUSIVE';
    return fail(state, AST_ERRORS.AST_BATCH_FAILED, e instanceof Error ? e.message : String(e));
  }
}

function fail(state: AstBuildState, namedErrorCode: string, detail: string): ScopedProgramResult {
  return {
    ok: false,
    state,
    program: null,
    checker: null,
    constructs: [],
    symbolTable: { symbols: new Map() },
    callGraph: { entries: new Map(), totalCallSites: 0, resolvedCallSites: 0, coveragePercent: 0 },
    chunked: false,
    rssPeakMb: 0,
    batchCount: 0,
    fileCount: 0,
    scopeViolation: namedErrorCode === AST_ERRORS.AST_SCOPE_VIOLATION ? namedErrorCode : null,
    namedError: namedErrorCode,
  };
}
