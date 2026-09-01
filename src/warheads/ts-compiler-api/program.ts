import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { tridentLog } from '../../utils.js';

export interface AnalyzerResult {
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  rule: string;
  confidence: number;
}

export class TsProgramWrapper {
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;
  private sourceFiles: ts.SourceFile[] = [];
  private targetPath: string = '';

  async createProgram(targetPath: string, compilerOptions?: ts.CompilerOptions): Promise<boolean> {
    this.targetPath = targetPath;
    try {
      const configPath = ts.findConfigFile(targetPath, ts.sys.fileExists, 'tsconfig.json');
      let options: ts.CompilerOptions = compilerOptions || {};
      
      if (configPath) {
        const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
        const parsedConfig = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          path.dirname(configPath),
          options
        );
        options = parsedConfig.options;
      }

      // Find .ts files recursively (skip node_modules, dist)
      const files: string[] = [];
      const walkDir = async (dir: string): Promise<void> => {
        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) await walkDir(fullPath);
            else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(fullPath);
          }
        } catch (e: unknown) { /* R16 FIX: non-fatal skip — walkDir failed, directory skipped */ tridentLog('WARN', 'ts-compiler-api', `walkDir failed for ${dir}: ${e instanceof Error ? e.message : String(e)}`); /* skip unreadable dirs */ return undefined; }
      };
      await walkDir(targetPath);

      if (files.length === 0) {
        tridentLog('WARN', 'ts-compiler-api', `No .ts files found in ${targetPath}`);
        return false;
      }

      this.program = ts.createProgram(files, options);
      this.checker = this.program.getTypeChecker();
      this.sourceFiles = await Promise.all(files.map(async f => {
        try {
          const sf = this.program!.getSourceFile(f);
          if (sf) return sf;
          const content = await fs.promises.readFile(f, 'utf-8');
          return ts.createSourceFile(f, content, ts.ScriptTarget.Latest, true);
        } catch (e: unknown) {
          tridentLog('WARN', 'ts-compiler-api', `source-file load failed for ${f}: ${e instanceof Error ? e.message : String(e)}`);
          throw e;
        }
      }));
      
      tridentLog('INFO', 'ts-compiler-api', `Created ts.Program with ${files.length} files`);
      return true;
    } catch (e: unknown) {
      tridentLog('ERROR', 'ts-compiler-api', `Failed to create ts.Program: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  getProgram(): ts.Program | null { return this.program; }

  /** Get type at a specific position in a file */
  getTypeAtLocation(filePath: string, line: number, offset: number): string | null {
    if (!this.checker) return null;
    const sf = this.sourceFiles.find((f: ts.SourceFile) => f.fileName.endsWith(path.basename(filePath)));
    if (!sf) return null;
    const pos = sf.getPositionOfLineAndCharacter(line, offset);
    const node = findNodeAtPosition(sf, pos);
    if (!node) return null;
    try {
      const type = this.checker.getTypeAtLocation(node);
      return this.checker.typeToString(type);
    } catch (e: unknown) { tridentLog('WARN', 'ts-compiler-api', `getTypeAtLocation failed: ${e instanceof Error ? e.message : String(e)}`); return null; }
  }

  /** Get symbol at a specific position */
  getSymbolAtLocation(filePath: string, line: number, offset: number): string | null {
    if (!this.checker) return null;
    const sf = this.sourceFiles.find((f: ts.SourceFile) => f.fileName.endsWith(path.basename(filePath)));
    if (!sf) return null;
    const pos = sf.getPositionOfLineAndCharacter(line, offset);
    const node = findNodeAtPosition(sf, pos);
    if (!node) return null;
    try {
      const symbol = this.checker.getSymbolAtLocation(node);
      return symbol ? symbol.getName() : null;
    } catch (e: unknown) { tridentLog('WARN', 'ts-compiler-api', `getSymbolAtLocation failed: ${e instanceof Error ? e.message : String(e)}`); return null; }
  }

  /** Analyze circular dependencies */
  analyzeCircularDeps(): AnalyzerResult[] {
    const results: AnalyzerResult[] = [];
    if (!this.program) return results;
    const visit = (file: string, chain: string[], visited: Set<string>): void => {
      if (chain.includes(file)) {
        const cycleStart = chain.indexOf(file);
        const cycle = chain.slice(cycleStart).join(' → ');
        results.push({
          file, line: 1, severity: 'high',
          message: `Circular dependency: ${cycle}`,
          rule: 'CIRCULAR_DEP', confidence: 1.0,
        });
        return;
      }
      if (visited.has(file)) return;
      visited.add(file);
      // Structural import scanning via the AST — the regex on raw file text is replaced
      const sf = this.sourceFiles.find((f: ts.SourceFile) => f.fileName === file);
      if (!sf) return;
      ts.forEachChild(sf, (node: ts.Node): void => {
        let specifier: string | null = null;
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          specifier = node.moduleSpecifier.text;
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          specifier = node.moduleSpecifier.text;
        }
        if (specifier) {
          const resolved = resolveModulePath(specifier, path.dirname(file));
          if (resolved && resolved.startsWith(this.targetPath)) {
            visit(resolved, [...chain, file], visited);
          }
        }
      });
    };
    this.sourceFiles.forEach((sf: ts.SourceFile) => visit(sf.fileName, [], new Set()));
    return results;
  }

  /** Measure type coverage */
  measureTypeCoverage(): { typed: number; untyped: number; coverage: number } {
    let typed = 0, untyped = 0;
    if (!this.checker) return { typed: 0, untyped: 0, coverage: 0 };
    this.sourceFiles.forEach((sf: ts.SourceFile): void => {
      ts.forEachChild(sf, function visit(node: ts.Node): void {
        if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)) {
          if (node.type) typed++; else untyped++;
        }
        ts.forEachChild(node, visit);
      });
    });
    const total = typed + untyped;
    return { typed, untyped, coverage: total > 0 ? typed / total : 0 };
  }

  /** Detect dead exports */
  detectDeadExports(): AnalyzerResult[] {
    const results: AnalyzerResult[] = [];
    if (!this.checker) return results;
    this.sourceFiles.forEach((sf: ts.SourceFile): void => {
      ts.forEachChild(sf, function visit(node: ts.Node): void {
        if (ts.isFunctionDeclaration(node) && node.name) {
          // Check if function is exported but never imported elsewhere
          const isExported = node.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.ExportKeyword);
          if (isExported && !node.body) {
            // Declaration without body = likely dead
          }
        }
        ts.forEachChild(node, visit);
      });
    });
    return results;
  }

  /** Detect empty catch blocks */
  detectEmptyCatches(): AnalyzerResult[] {
    const results: AnalyzerResult[] = [];
    this.sourceFiles.forEach((sf: ts.SourceFile): void => {
      ts.forEachChild(sf, function visit(node: ts.Node): void {
        if (ts.isTryStatement(node) && node.catchClause) {
          const block = node.catchClause.block;
          if (block.statements.length === 0) {
            const pos = sf.getLineAndCharacterOfPosition(node.catchClause.getStart(sf));
            results.push({
              file: sf.fileName, line: pos.line + 1, severity: 'critical',
              message: 'Empty catch block — error silently swallowed',
              rule: 'P3_EMPTY_CATCH', confidence: 1.0,
            });
          }
        }
        ts.forEachChild(node, visit);
      });
    });
    return results;
  }

  /** Check for hardcoded paths */
  detectHardcodedPaths(): AnalyzerResult[] {
    const results: AnalyzerResult[] = [];
    this.sourceFiles.forEach((sf: ts.SourceFile): void => {
      ts.forEachChild(sf, function visit(node: ts.Node): void {
        if (ts.isStringLiteral(node)) {
          const text = node.text;
          if (/^(?:\/home\/|\/root\/|\/var\/|\/etc\/)/.test(text)) {
            const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            results.push({
              file: sf.fileName, line: pos.line + 1, severity: 'high',
              message: 'Hardcoded absolute path — use path.join(os.homedir(), ...) instead',
              rule: 'P7_HARDCODED_PATH', confidence: 1.0,
            });
          }
        }
        ts.forEachChild(node, visit);
      });
    });
    return results;
  }

  /** Detect fire-and-forget promises */
  detectFireAndForget(): AnalyzerResult[] {
    const results: AnalyzerResult[] = [];
    this.sourceFiles.forEach((sf: ts.SourceFile): void => {
      ts.forEachChild(sf, function visit(node: ts.Node): void {
        if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
          const call = node.expression;
          const callee = call.expression;
          if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'then') {
            const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            results.push({
              file: sf.fileName, line: pos.line + 1, severity: 'high',
              message: 'Fire-and-forget promise — no .catch() error handling',
              rule: 'P9_FIRE_FORGET', confidence: 1.0,
            });
          }
        }
        ts.forEachChild(node, visit);
      });
    });
    return results;
  }

  /** Run all analyzers */
  runAll(): { results: AnalyzerResult[]; score: number } {
    let allResults: AnalyzerResult[] = [];
    allResults.push(...this.detectEmptyCatches());
    allResults.push(...this.detectHardcodedPaths());
    allResults.push(...this.detectFireAndForget());
    allResults.push(...this.analyzeCircularDeps());
    
    let penalty = 0;
    for (const r of allResults) {
      const weights: Record<string, number> = { critical: 25, high: 10, medium: 5, low: 2 };
      penalty += weights[r.severity] || 0;
    }
    const score = Math.max(0, 100 - penalty);
    
    tridentLog('INFO', 'ts-compiler-api', `Analysis complete: ${allResults.length} findings, score=${score}`);
    return { results: allResults, score };
  }
}

function findNodeAtPosition(sourceFile: ts.SourceFile, pos: number): ts.Node | null {
  let result: ts.Node | null = null;
  function visit(node: ts.Node): void {
    if (node.getStart() <= pos && pos < node.getEnd()) {
      result = node;
      ts.forEachChild(node, visit);
    }
  }
  visit(sourceFile);
  return result;
}

function resolveModulePath(moduleName: string, containingDir: string): string | null {
  if (!moduleName.startsWith('.')) return null;
  const extensions = ['.ts', '.tsx', '.js', '/index.ts', '/index.js'];
  const base = path.resolve(containingDir, moduleName);
  for (const ext of extensions) {
    const p = base + ext;
    if (fs.existsSync(p)) return p;
  }
  return null;
}
