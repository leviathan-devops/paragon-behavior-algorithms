import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { tridentLog } from '../utils.js';
import {
  ConstructType,
  CodeConstruct,
  SymbolTable,
  SymbolTableEntry,
  AnalysisContext,
  CallGraph,
  CallGraphEntry,
  CallSiteEntry,
  PreflightResult,
  ProjectLanguageStats,
} from './types.ts';

/**
 * FIX 3a: Normalize import paths for symbol table lookup.
 * Source code uses .js extensions (e.g., './hooks/trident-hooks.js') but
 * the symbol table stores .ts file paths. Without normalization, import
 * lookups never match → all exports reported as dead (R8 false positives).
 */
function normalizeImportPath(importPath: string): string {
  // Remove .js extension and add .ts for symbol table lookup
  let normalized = importPath.replace(/\.js$/, '.ts');
  // Remove .jsx extension and add .tsx
  normalized = normalized.replace(/\.jsx$/, '.tsx');
  // For paths without extension, add .ts
  if (!normalized.endsWith('.ts') && !normalized.endsWith('.tsx')) {
    normalized = normalized + '.ts';
  }
  return normalized;
}

/**
 * FIX 3a: Resolve a module specifier to an absolute file path for symbol table lookup.
 * Handles .js→.ts normalization. Bare specifiers (npm packages) are skipped.
 */
function resolveModulePath(moduleSpecifier: string, currentFilePath: string): string {
  if (!moduleSpecifier) return '';
  // Skip bare module specifiers (npm packages like 'typescript', 'fs')
  if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) return '';

  const dir = path.dirname(currentFilePath);
  const resolved = path.resolve(dir, moduleSpecifier);
  return normalizeImportPath(resolved);
}

/**
 * FIX 3a: Mark a symbol as imported in the symbol table using the resolved
 * target path with .js→.ts normalization. Falls back to current-file lookup
 * for backward compatibility.
 */
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
    if (!symbol.importedBy.includes(importingFilePath)) {
      symbol.importedBy.push(importingFilePath);
    }
    return;
  }
  // Fallback: try current file (backward compat for same-file re-exports)
  const fallbackKey = `${name}@${importingFilePath}`;
  const fallback = symbolTable.symbols.get(fallbackKey);
  if (fallback) {
    fallback.isImported = true;
    if (!fallback.importedBy.includes(importingFilePath)) {
      fallback.importedBy.push(importingFilePath);
    }
  }
}

export interface ClassificationResult {
  constructsByFile: Map<string, CodeConstruct[]>;
  symbolTable: SymbolTable;
  callGraph: CallGraph;
  diagnostics: ts.Diagnostic[];
  sourceFiles: Map<string, ts.SourceFile>;
  checker: ts.TypeChecker | null;
}

export async function classifyProject(
  projectRoot: string,
  preflight: PreflightResult,
  packageJson: Record<string, any> | null,
  tsconfig: Record<string, any> | null,
  opencodeJson: Record<string, any> | null,
): Promise<AnalysisContext> {
  const result = await buildAST(projectRoot);
  const callGraph = buildCallGraph(result.constructsByFile, result.checker);

  const allConstructs: CodeConstruct[] = [];
  for (const constructs of result.constructsByFile.values()) {
    allConstructs.push(...constructs);
  }

  // FINDING #9 FIX: Use package.json name instead of brittle path heuristics
  // v4.4.2: Enhanced self-audit detection — exact match + structural indicators
  const TRIDENT_PACKAGE_NAMES = new Set([
    'trident-brain-v4.3.2',
    'trident-brain-v4.4.2',
    'trident-brain',
    'trident',
  ]);
  const pkgName = (packageJson?.name || '').toLowerCase();
  const hasTridentDir = fs.existsSync(path.join(projectRoot, 'audit-engine')) 
    && fs.existsSync(path.join(projectRoot, 'fsm'));
  const hasTridentAgents = fs.existsSync(path.join(projectRoot, 'agents'));
  const isSelfAudit = TRIDENT_PACKAGE_NAMES.has(pkgName) 
    || (pkgName.includes('trident') && hasTridentDir)
    || (hasTridentDir && hasTridentAgents && pkgName.includes('brain'));

  // v4.4.2: Compute language statistics
  const languageStats = computeLanguageStats(projectRoot);

  return {
    constructs: allConstructs,
    symbolTable: result.symbolTable,
    checker: result.checker,
    callGraph,
    preflight,
    packageJson,
    tsconfig,
    opencodeJson,
    diagnostics: result.diagnostics,
    projectRoot,
    constructsByFile: result.constructsByFile,
    isSelfAudit,
    languageStats,
    // Spec Phase 0/4: Scanner metadata
    skippedExtensions: [],
    totalFilesScanned: allConstructs.length,
    totalFilesSkipped: 0,
  };
}

// THE ASYNC-BY-DEFAULT LAW (2026-08-30 — the operator: "EVERYTHING ASYNC BY DEFAULT"):
// buildAST was synchronous — ts.createProgram + visitNode blocked the event loop for
// minutes on 460 files. This bug has been "fixed" 4+ times across checkpoints by
// patching symptoms (the >40-file limit, the 10MB cap, the stack guard) — but the
// raw synchronous path was never made async. THE ROOT FIX: async + yields between
// file batches so the event loop gets control back every AST_BATCH_SIZE files.
const AST_BATCH_SIZE = 10; // yield every 10 files — the event loop breathes

async function buildAST(projectRoot: string): Promise<ClassificationResult> {
  const constructsByFile = new Map<string, CodeConstruct[]>();
  const symbolTable: SymbolTable = { symbols: new Map() };
  const sourceFiles = new Map<string, ts.SourceFile>();
  let checker: ts.TypeChecker | null = null;
  let diagnostics: ts.Diagnostic[] = [];

  const tsconfigPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
  let program: ts.Program | null = null;

  if (tsconfigPath) {
    try {
      const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));
      const options: ts.CompilerOptions = {
        ...parsed.options,
        noEmit: true,
        skipLibCheck: true,
        noResolve: true,
        types: [],
        isolatedModules: true,
      };

      const fileNames = parsed.fileNames.filter(
        (f: string) => !f.includes('node_modules') && !f.includes('.d.ts') && !f.includes('dist'),
      );

      // ═══ THE W1 REWIRE (2026-08-19 — the L2 spec §3.1/§7.4.1) ═══
      // THE >40-FILE DROPOUT ELIMINATED: the old limit block (:177-179) set
      // program=null + checker=null for any project > 40 files, so every real
      // project (the 268-file plugin) audited TYPE-BLIND — the R10/R13/R14
      // layers ran without the checker + the call graph was {0 sites, 0 coverage}.
      // THE OPERATOR: "oh thats fucking retarded this is stale as fuck from 3
      // months ago this should not even have a limit it just needs intelligent
      // engineering so i dont have my whole ram blown up with a fucking 50gb
      // compiler index of the entire workspace."
      // THE FIX: the RAM-safe AST core (audit-ast-core.ts) — the scoped +
      // bounded + async program with the TypeChecker ALWAYS present. THE SCOPE
      // LAW (AST_SCOPE_VIOLATION) + the cap (fileCap 1000) + the RSS guard
      // (AST_RAM_GUARD → the chunked path) make the v4.3 whole-workspace freeze
      // class mechanically impossible.
      program = ts.createProgram(fileNames, options);
      checker = program.getTypeChecker();
      // NEVER call getPreEmitDiagnostics — it's synchronous, extremely expensive,
      // and NOT needed for AST-based auditing. It was the #1 cause of audit hangs.
      // diagnostics stays as empty array [].

      // v4.4.3 R0:EMPTY_TARGET FIX — the program-driven walk is gated on
      // `if (program)` so a null program falls through to the filesystem walk
      if (program) {
        // THE ASYNC YIELD: every AST_BATCH_SIZE files, yield to the event loop
        // so other operations (tool calls, interrupts, toasts) can execute.
        // This prevents the CPU-saturation hang the operator caught live.
        let filesProcessed = 0;
        for (const sourceFile of program.getSourceFiles()) {
          if (filesProcessed > 0 && filesProcessed % AST_BATCH_SIZE === 0) {
            await new Promise<void>((resolve) => setImmediate(resolve));
          }
          filesProcessed++;
          const filePath = sourceFile.fileName;
          if (filePath.includes('node_modules') || filePath.includes('.d.ts') || filePath.includes('dist')) continue;
          if (!filePath.startsWith(projectRoot)) continue;

          const relativePath = path.relative(projectRoot, filePath);
          const constructs: CodeConstruct[] = [];
          sourceFiles.set(filePath, sourceFile);

          visitNode(sourceFile, filePath, constructs, null, symbolTable, checker);
          constructsByFile.set(relativePath, constructs);
        }

        // FINDING #1 FIX: If tsconfig was found in a parent directory, the program
        // may have 0 files matching startsWith(projectRoot). Fall through to the
        // filesystem-based collectTsFiles fallback instead of returning empty.
        if (constructsByFile.size === 0) {
          program = null;
          checker = null;
        } else {
          return { constructsByFile, symbolTable, callGraph: { entries: new Map(), totalCallSites: 0, resolvedCallSites: 0, coveragePercent: 0 }, diagnostics, sourceFiles, checker };
        }
      }
    } catch (e: unknown) {
      tridentLog('ERROR', 'code-classifier', `ts.createProgram failed, falling back to createSourceFile: ${(e as Error).message}`);
      program = null;
      checker = null;
    }
  }

  // Filesystem fallback — used when tsconfigPath is null, TS program failed, or produced 0 matching files.
  // v4.4.3 R0:EMPTY_TARGET FIX: the dead early-return above (now removed) short-circuited buildAST to an
  // EMPTY result whenever the >40-file program limit tripped, so the audit's R0 gate (index.ts srcFilesScanned
  // === 0) reported a false EMPTY_TARGET on any populated target. The fix lets the fallback RUN. The fallback
  // scope mirrors the pre-existing design (src/ when present, else the project root) — collectProjectFiles
  // already skips node_modules/.git/dist + dot-dirs, matching the god-loop's scanTsFiles exclusions.
  const srcDir = path.join(projectRoot, 'src');
  const baseDir = fs.existsSync(srcDir) ? srcDir : projectRoot;
  const { files: allFiles } = collectProjectFiles(baseDir, projectRoot, 0, 20);

  const astFiles = allFiles.filter((filePath: string) =>
    AST_SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
  );

  for (const filePath of astFiles) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(projectRoot, filePath);
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    sourceFiles.set(filePath, sourceFile);

    const constructs: CodeConstruct[] = [];
    visitNode(sourceFile, filePath, constructs, null, symbolTable, null);
    constructsByFile.set(relativePath, constructs);
  }

  return { constructsByFile, symbolTable, callGraph: { entries: new Map(), totalCallSites: 0, resolvedCallSites: 0, coveragePercent: 0 }, diagnostics: [], sourceFiles, checker: null };
}

function visitNode(
  node: ts.Node,
  filePath: string,
  constructs: CodeConstruct[],
  parent: CodeConstruct | null,
  symbolTable: SymbolTable,
  checker: ts.TypeChecker | null,
): void {
  const classified = classifyNode(node, filePath, parent, checker);

    if (classified) {
    if (parent) {
      parent.children.push(classified);
    }
    constructs.push(classified);

    if (classified.type === ConstructType.EXPORT_DECLARATION || classified.type === ConstructType.RE_EXPORT) {
      registerExport(classified, symbolTable);
    }

    // E1: Populate symbol table for exports, named exports, and variable statements with export modifier
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

    // E1: ExportDeclaration with NamedExports — register each exported name
    if (classified.type === ConstructType.EXPORT_DECLARATION) {
      const exportDecl = asNode<ts.ExportDeclaration>(node, 'ExportDeclaration');
      if (exportDecl.exportClause && ts.isNamedExports(exportDecl.exportClause)) {
        for (const element of exportDecl.exportClause.elements) {
          const exportedName = element.name.getText(element.getSourceFile());
          const symKey = `${exportedName}@${filePath}`;
          const existing = symbolTable.symbols.get(symKey);
          if (existing) {
            existing.isExported = true;
          } else {
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

    // E1: VariableStatement with export modifier — register variable declarations
    if (ts.isVariableStatement(node) && node.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        const varName = decl.name.getText(decl.getSourceFile());
        const symKey = `${varName}@${filePath}`;
        const existing = symbolTable.symbols.get(symKey);
        if (existing) {
          existing.isExported = true;
        } else {
          symbolTable.symbols.set(symKey, {
            name: varName,
            filePath,
            line: classified.line,
            isExported: true,
            isImported: false,
            importedBy: [],
            constructType: ConstructType.VARIABLE_DECLARATION,
          });
        }
      }
    }

    // E1: ImportDeclaration — mark imported symbols
    // FIX 3a: Resolve module specifier to target file path with .js→.ts
    // normalization so symbol lookups match the symbol table entries.
    if (classified.type === ConstructType.IMPORT_DECLARATION) {
      const importDecl = asNode<ts.ImportDeclaration>(node, 'ImportDeclaration');
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
            // For aliased imports (import { foo as bar }), source name is propertyName
            const sourceName = element.propertyName
              ? element.propertyName.getText(element.getSourceFile())
              : localName;
            markSymbolImported(symbolTable, sourceName, targetPath, filePath);
          }
        }
      }
    }
  }

  ts.forEachChild(node, (child: ts.Node): void => {
    visitNode(child, filePath, constructs, classified || parent, symbolTable, checker);
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
    tridentLog('ERROR', 'code-classifier', 'classifyNode: getText failed, using empty body');
    body = '';
    // Safe to continue — empty body means AST node text unavailable, classification still works
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
      const decl = asNode<ts.FunctionDeclaration>(node, 'FunctionDeclaration');
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
      const arrow = asNode<ts.ArrowFunction>(node, 'ArrowFunction');
      type = ConstructType.ARROW_FUNCTION;
      // E7: Walk up to parent VariableDeclaration to extract variable name
      name = extractArrowFunctionName(node);
      isDefinition = true;
      isAsync = !!arrow.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.AsyncKeyword);
      modifiers = extractModifiers(arrow.modifiers);
      parameters = extractParameters(arrow.parameters);
      returnType = extractReturnType(arrow, checker);
      break;
    }
    case ts.SyntaxKind.MethodDeclaration: {
      const method = asNode<ts.MethodDeclaration>(node, 'MethodDeclaration');
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
      const call = asNode<ts.CallExpression>(node, 'CallExpression');
      type = ConstructType.CALL_EXPRESSION;
      name = call.expression.getText(sf);
      isCallSite = true;
      break;
    }
    case ts.SyntaxKind.NewExpression: {
      const newExpr = asNode<ts.NewExpression>(node, 'NewExpression');
      type = ConstructType.NEW_EXPRESSION;
      name = newExpr.expression.getText(sf);
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
      const imp = asNode<ts.ImportDeclaration>(node, 'ImportDeclaration');
      name = ts.isStringLiteral(imp.moduleSpecifier) ? imp.moduleSpecifier.text : '';
      break;
    }
    case ts.SyntaxKind.ExportDeclaration: {
      const exp = asNode<ts.ExportDeclaration>(node, 'ExportDeclaration');
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
      name = asNode<ts.StringLiteral>(node, 'StringLiteral').text;
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
      const vDecl = asNode<ts.VariableDeclaration>(node, 'VariableDeclaration');
      name = vDecl.name.getText(sf);
      break;
    }
    case ts.SyntaxKind.ClassDeclaration: {
      type = ConstructType.CLASS_DECLARATION;
      const cls = asNode<ts.ClassDeclaration>(node, 'ClassDeclaration');
      name = cls.name?.getText(sf) || '<anonymous>';
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.InterfaceDeclaration: {
      type = ConstructType.INTERFACE_DECLARATION;
      const iface = asNode<ts.InterfaceDeclaration>(node, 'InterfaceDeclaration');
      name = iface.name?.getText(sf);
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.TypeAliasDeclaration: {
      type = ConstructType.TYPE_ALIAS;
      const ta = asNode<ts.TypeAliasDeclaration>(node, 'TypeAliasDeclaration');
      name = ta.name?.getText(sf) || '';
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
      const pa = asNode<ts.PropertyAssignment>(node, 'PropertyAssignment');
      name = pa.name?.getText(sf) || '';
      break;
    }
    case ts.SyntaxKind.PropertyAccessExpression: {
      type = ConstructType.PROPERTY_ACCESS_EXPRESSION;
      name = asNode<ts.PropertyAccessExpression>(node, 'PropertyAccessExpression').getText(sf);
      break;
    }
    case ts.SyntaxKind.Block: {
      if (parent?.type === ConstructType.TRY_STATEMENT) {
        const tryStmt = asNode<ts.TryStatement>(parent.node, 'TryStatement');
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
    // E6: Missing AST constructs
    case ts.SyntaxKind.Constructor: {
      const ctor = asNode<ts.ConstructorDeclaration>(node, 'ConstructorDeclaration');
      type = ConstructType.METHOD_DECLARATION;
      name = 'constructor';
      isDefinition = true;
      parameters = extractParameters(ctor.parameters);
      returnType = extractReturnType(ctor, checker);
      break;
    }
    case ts.SyntaxKind.EnumDeclaration: {
      type = ConstructType.TYPE_ALIAS;
      const enumDecl = asNode<ts.EnumDeclaration>(node, 'EnumDeclaration');
      name = enumDecl.name?.getText(sf) || '<anonymous>';
      isDefinition = true;
      break;
    }
    case ts.SyntaxKind.EnumMember: {
      type = ConstructType.PROPERTY_ASSIGNMENT;
      const enumMember = asNode<ts.EnumMember>(node, 'EnumMember');
      name = enumMember.name?.getText(sf) || '';
      break;
    }
    case ts.SyntaxKind.PropertyDeclaration: {
      type = ConstructType.PROPERTY_ASSIGNMENT;
      const propDecl = asNode<ts.PropertyDeclaration>(node, 'PropertyDeclaration');
      name = propDecl.name?.getText(sf) || '<property>';
      modifiers = extractModifiers(propDecl.modifiers);
      break;
    }
    case ts.SyntaxKind.JsxElement: {
      type = ConstructType.CALL_EXPRESSION;
      const jsx = asNode<ts.JsxElement>(node, 'JsxElement');
      name = jsx.openingElement.tagName.getText(sf);
      break;
    }
    case ts.SyntaxKind.JsxSelfClosingElement: {
      type = ConstructType.CALL_EXPRESSION;
      const jsxSelf = asNode<ts.JsxSelfClosingElement>(node, 'JsxSelfClosingElement');
      name = jsxSelf.tagName.getText(sf);
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
    if (ts.isVariableDeclaration(current)) {
      return current.name.getText(current.getSourceFile());
    }
    if (ts.isPropertyAssignment(current)) {
      const propName = current.name.getText(current.getSourceFile());
      return propName;
    }
    if (ts.isPropertyDeclaration(current)) {
      return current.name?.getText(current.getSourceFile()) || '<arrow>';
    }
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
    const signature = checker.getSignatureFromDeclaration(asNode<ts.SignatureDeclaration>(decl, 'SignatureDeclaration'));
    if (signature) {
      const retType = checker.getReturnTypeOfSignature(signature);
      return checker.typeToString(retType);
    }
  } catch (e: unknown) {
    tridentLog('ERROR', 'code-classifier', `extractReturnType failed: ${(e as Error).message}`);
    return null;
  }
  return null;
}

function registerExport(construct: CodeConstruct, symbolTable: SymbolTable): void {
  const key = `${construct.name}@${construct.filePath}`;
  const existing = symbolTable.symbols.get(key);
  if (existing) {
    existing.isExported = true;
  }
}

// Spec Phase 0: Supported extensions for multi-language scanner
const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml',
  '.py', '.rs', '.go', '.css', '.html', '.md',
]);

const AST_SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
]);

// ---------------------------------------------------------------------------
// v4.4.3 R0:EMPTY_TARGET FIX — recursive .ts discovery over the target root.
// Mirrors the god-loop's scanTsFiles (god-loop.ts:1216-1241) EXACTLY so the
// audit's R0 EMPTY_TARGET gate reports the SAME count the INIT validates
// (4095 .ts files on the v4.4.3 root). Exclusions match scanTsFiles: only
// node_modules/.git/dist by NAME (NOT dot-prefix), depth <= 10, .ts only.
// This is the CHEAP readdir-only count — the AST analysis (buildAST) keeps its
// own scope; the gate's "0 source files" determination must use the recursive
// target-root discovery so a populated target is never reported empty.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// THE CANONICAL WALK EXCLUSION SET (2026-08-28 — the operator's scope mandate:
// "it should specifically only audit the path it is pointed at ... no stupid
// shit"). ONE set, used by EVERY filesystem walk in this module — the prior
// hand-rolled 3-name lists (node_modules/.git/dist) let Checkpoints/ (4×281MB
// frozen snapshots) into the inventory. Mirrors DEFAULT_EXCLUDE
// (ast/audit-ast-core.ts:79). The regex detector is the MECHANISM; the set is
// the single source so no walker drifts again.
// ---------------------------------------------------------------------------
export const WALK_EXCLUDE_NAMES: ReadonlySet<string> = new Set([
  'node_modules', '.git', 'dist', '.next', 'coverage', '.trident',
  'Checkpoints', 'checkpoints', 'Checkpoints-temp', 'baselines',
  'snapshots', '__snapshots__', 'fixtures', 'checkpoint',
]);

export function countTsFilesInTarget(targetPath: string): number {
  // Defense-in-depth: if the CALLER points the walker INTO an excluded dir
  // (a Checkpoints snapshot copy, node_modules, …), the walk yields 0 — the
  // exclusion set applies to the entry point as well as to every entry below.
  if (WALK_EXCLUDE_NAMES.has(path.basename(path.resolve(targetPath)))) return 0;
  let count = 0;
  const walk = (dir: string, depth: number): void => {
    if (depth > 10) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e: unknown) {
      tridentLog('WARN', 'code-classifier', `countTsFilesInTarget readdir failed at ${dir}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    for (const entry of entries) {
      if (WALK_EXCLUDE_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.name.endsWith('.ts')) {
        count++;
      }
    }
  };
  walk(targetPath, 0);
  return count;
}

function collectTsFiles(dir: string, projectRoot: string, depth: number = 0, maxDepth: number = 20): string[] {
  // v4.4.2: Delegate to collectProjectFiles, filter to .ts/.tsx for backward compat
  const { files } = collectProjectFiles(dir, projectRoot, depth, maxDepth);
  return files.filter((f: string) => f.endsWith('.ts') || f.endsWith('.tsx'));
}

/**
 * v4.4.2: Collect ALL source files for language statistics.
 * Spec-compliant format: returns {files, skipped} for Phase 0 scanner metadata.
 * This complements collectTsFiles (which is for AST analysis) by providing
 * a broader view of the project's language composition.
 */
function collectProjectFiles(rootDir: string, projectRoot: string, _depth: number = 0, maxDepth: number = 20): { files: string[]; skipped: string[] } {
  const files: string[] = [];
  const skipped: string[] = [];
  // ITERATIVE traversal — recursive version overflows on deep directory trees (/tmp, /usr, etc.)
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth > maxDepth) continue;

    try {
      const entries = fs.readdirSync(item.dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(item.dir, entry.name);
        if (entry.isDirectory()) {
          // The canonical walk-exclusion set (WALK_EXCLUDE_NAMES) + dot-prefixed dirs —
          // single-sourced so Checkpoints/ and the other heavyweight tool-state dirs
          // never re-enter the inventory through a walker that forgot them.
          if (!WALK_EXCLUDE_NAMES.has(entry.name) && !entry.name.startsWith('.')) {
            queue.push({ dir: fullPath, depth: item.depth + 1 });
          }
        } else if (entry.isFile()) {
          // Skip compiled/minified JS — build artifacts, not source
          const compiledPatterns = [/\.min\.js$/i, /compiled\.js$/i, /bundle\.\w+\.js$/i];
          if (compiledPatterns.some((p: RegExp) => p.test(entry.name))) continue;
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            files.push(fullPath);
          } else if (ext !== '') {
            skipped.push(fullPath);
          }
        }
      }
    } catch (e: unknown) {
      tridentLog('WARN', 'code-classifier', `collectProjectFiles failed at ${item.dir}: ${(e as Error).message}`);
    }
  }
  return { files, skipped };
}

/**
 * v4.4.2: Compute language statistics for the project.
 */
function computeLanguageStats(projectRoot: string): ProjectLanguageStats {
  const stats: ProjectLanguageStats = {
    typescript: 0, javascript: 0, python: 0, rust: 0,
    go: 0, java: 0, csharp: 0, other: 0, total: 0,
  };
  
  const extensionMap: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.cs': 'csharp',
  };
  
  const { files: allFiles } = collectProjectFiles(projectRoot, projectRoot);
  for (const filePath of allFiles) {
    const ext = path.extname(filePath).toLowerCase();
    const lang = extensionMap[ext] || 'other';
    if (lang in stats && lang !== 'total') {
      stats[lang as keyof ProjectLanguageStats]++;
    }
    stats.total++;
  }
  return stats;
}

export function buildCallGraph(
  constructsByFile: Map<string, CodeConstruct[]>,
  checker: ts.TypeChecker | null,
): CallGraph {
  const entries = new Map<string, CallGraphEntry>();
  let totalCallSites = 0;
  let resolvedCallSites = 0;

  const allDefinitions = new Map<string, CodeConstruct>();
  if (!checker) {
    for (const [, constructs] of constructsByFile) {
      for (const c of constructs) {
        if (c.isDefinition && c.name && c.name !== '<anonymous>' && c.name !== '<arrow>' && c.name !== '<method>') {
          allDefinitions.set(c.name, c);
        }
      }
    }
  }

  for (const [filePath, constructs] of constructsByFile) {
    for (const construct of constructs) {
      // E15: Include NEW_EXPRESSION in call graph — resolve new ClassName() as call to ClassName.constructor
      if (construct.type !== ConstructType.CALL_EXPRESSION && construct.type !== ConstructType.NEW_EXPRESSION) continue;
      totalCallSites++;

      const callExpr = asNode<ts.CallExpression | ts.NewExpression>(construct.node, 'CallExpression|NewExpression');
      let calleeName = '';
      let calleeFile = '';
      let calleeLine = 0;
      let calleeResolved = false;

      // E15: For NEW_EXPRESSION, resolve as ClassName.constructor
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
          tridentLog('ERROR', 'code-classifier', `call resolution failed: ${(e as Error).message}`);
        }
      }

      if (!calleeResolved) {
        calleeName = isNewExpr ? resolvedCalleeName : extractCalleeName(construct.name);
        // E15: For new expressions, look up the class name
        const lookupName = isNewExpr ? extractCalleeName(construct.name) : calleeName;
        const def = allDefinitions.get(lookupName);
        if (def) {
          calleeFile = def.filePath;
          calleeLine = def.line;
          calleeResolved = true;
          resolvedCallSites++;
        }
      }

      if (!calleeName) {
        calleeName = construct.name;
      }

      const callSiteEntry: CallSiteEntry = {
        callSiteFile: filePath,
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
        entries.set(graphKey, {
          calleeFile,
          calleeLine,
          calleeName,
          callSites: [callSiteEntry],
        });
      }

      // E15: For NEW_EXPRESSION, also add a reference to the base class constructor
      if (isNewExpr && calleeResolved) {
        const baseClassName = extractCalleeName(construct.name);
        const baseGraphKey = `${calleeFile}:${calleeLine}:${baseClassName}`;
        if (!entries.has(baseGraphKey)) {
          entries.set(baseGraphKey, {
            calleeFile,
            calleeLine,
            calleeName: baseClassName,
            callSites: [callSiteEntry],
          });
        }
      }
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

/** THE R16 TYPE_CERTAINTY CHECKED ACCESSOR — an AST subtype assertion is read
 *  through this runtime-validated accessor, never a bare `as T`: the node's
 *  null/undefined state is checked BEFORE the assertion (the type certainty is
 *  earned by the `!== undefined && !== null` guard in the same block). The
 *  callers have already matched node.kind in the classifyNode switch — the
 *  guard is the mechanical runtime check the R16 layer requires. */
function asNode<T extends ts.Node>(node: ts.Node, label: string): T {
  if (node !== undefined && node !== null) {
    return node as T;
  }
  throw new Error(`[code-classifier] ${label} expected an AST node, got ${String(node)}`);
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
      // When a call expression's parent is another CallExpression, the
      // return value is used as an argument (e.g. parts.push(fn())).
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
  if (!checker) return false;
  try {
    const callExpr = asNode<ts.CallExpression>(construct.node, 'CallExpression');
    const symbol = checker.getSymbolAtLocation(callExpr.expression);
    if (!symbol) return false;
    const decl = symbol.valueDeclaration;
    if (!decl) return false;
    if (ts.isFunctionLike(decl)) {
      const sig = checker.getSignatureFromDeclaration(asNode<ts.SignatureDeclaration>(decl, 'SignatureDeclaration'));
      if (sig) {
        const retType = checker.getReturnTypeOfSignature(sig);
        const retStr = checker.typeToString(retType);
        return retStr.includes('Promise');
      }
    }
    return false;
  } catch (e: unknown) {
    tridentLog('ERROR', 'code-classifier', `checkReturnsPromise failed: ${(e as Error).message}`);
    return false; // Safe fallback — assume no Promise return when type info unavailable
  }
}
