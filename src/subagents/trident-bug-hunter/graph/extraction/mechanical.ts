import * as tsImport from 'typescript';
const ts: typeof tsImport = (tsImport as unknown as { default?: typeof tsImport }).default ?? tsImport;
import path from 'node:path';
import fs from 'node:fs';
import { PREDICATE_SET, isPredicate, type Predicate } from '../../../../shared/knowledge-graph/ontology.ts';

export interface TypedTriple {
  subject: string;
  predicate: Predicate;
  object: string;
  evidence: string;
  confidence: number;
  file: string;
  line: number;
  subjectKind?: string;
  objectKind?: string;
}

export class MechanicalExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MECHANICAL_EXTRACTION_FAILED';
  }
}

function lineOf(sf: tsImport.SourceFile, node: tsImport.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function evidenceQuoteForNode(sf: tsImport.SourceFile, node: tsImport.Node): string {
  const line = lineOf(sf, node);
  try {
    const text = sf.getFullText();
    const lines = text.split('\n');
    const raw = lines[line - 1] ?? node.getText(sf);
    const trimmed = raw.trim();
    if (trimmed.length > 0) return trimmed.slice(0, 500);
    return node.getText(sf).trim().slice(0, 500) || `${sf.fileName}:${line}`;
  } catch (e: unknown) {
    throw new MechanicalExtractionError(`evidence extraction failed at ${sf.fileName}:${line} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

function isExcluded(abs: string, root: string, excludes: string[]): boolean {
  for (const ex of excludes) {
    const exAbs = path.isAbsolute(ex) ? path.resolve(ex) : path.resolve(root, ex);
    if (abs === exAbs || abs.startsWith(exAbs + path.sep)) return true;
  }
  return false;
}

function toCanonicalFile(rel: string): string {
  return `file:${rel}`;
}

function toClassCanonical(name: string): string { return `class:${name}`; }
function toFnCanonical(name: string): string { return `fn:${name}`; }
function toMethodCanonical(cls: string, method: string): string { return `method:${cls}.${method}`; }
function toInterfaceCanonical(name: string): string { return `interface:${name}`; }
function toModuleCanonical(rel: string): string { return `module:${rel}`; }

export interface ExtractMechanicalOptions {
  root?: string;
  excludes?: string[];
  createdRun?: string;
}

export function extractMechanical(program: tsImport.Program, opts: ExtractMechanicalOptions = {}): TypedTriple[] {
  if (!program || typeof program.getSourceFiles !== 'function') {
    throw new MechanicalExtractionError('MECHANICAL_EXTRACTION_FAILED: program is null/undefined or missing getSourceFiles');
  }
  const checker = program.getTypeChecker();
  void checker;

  const sourceFiles = program.getSourceFiles();
  if (!Array.isArray(sourceFiles)) {
    throw new MechanicalExtractionError('MECHANICAL_EXTRACTION_FAILED: program.getSourceFiles returned non-array');
  }

  let root = opts.root ? path.resolve(opts.root) : '';
  if (!root) {
    try {
      const first = sourceFiles.find((sf) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules'));
      if (first) root = path.dirname(path.resolve(first.fileName));
    } catch (e: unknown) {
      throw new MechanicalExtractionError(`MECHANICAL_EXTRACTION_FAILED: cannot resolve root — ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!root) root = process.cwd();
  }

  const excludes = opts.excludes ?? [];
  const triples: TypedTriple[] = [];

  const pushTriple = (subject: string, predicate: Predicate, object: string, evidence: string, file: string, line: number): void => {
    if (!isPredicate(predicate)) {
      throw new MechanicalExtractionError(`MECHANICAL_EXTRACTION_FAILED: predicate ${String(predicate)} not in closed ontology vocabulary`);
    }
    if (!evidence || evidence.trim().length === 0) {
      throw new MechanicalExtractionError(`MECHANICAL_EXTRACTION_FAILED: evidence_quote is mandatory — empty evidence for ${subject} -[${predicate}]-> ${object} at ${file}:${line} (MC-B-02)`);
    }
    triples.push({ subject, predicate, object, evidence: evidence.trim().slice(0, 500), confidence: 1.0, file, line });
  };

  for (const sf of sourceFiles) {
    const abs = path.resolve(sf.fileName);
    if (sf.isDeclarationFile) continue;
    if (abs.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (abs.includes(`${path.sep}.trident${path.sep}`)) continue;
    if (abs.includes(`${path.sep}dist${path.sep}`)) continue;
    if (isExcluded(abs, root, excludes)) continue;
    if (!abs.startsWith(root + path.sep) && abs !== path.join(root, path.basename(abs))) {
      if (root !== process.cwd() && !abs.startsWith(root)) continue;
    }

    const rel = path.relative(root, abs) || path.basename(abs);
    const relPosix = rel.split(path.sep).join(path.posix.sep);
    const fileCanon = toCanonicalFile(relPosix);
    const moduleCanon = toModuleCanonical(relPosix);

    for (const stmt of sf.statements) {
      if (ts.isClassDeclaration(stmt) && stmt.name) {
        const clsName = stmt.name.text;
        const clsLine = lineOf(sf, stmt);
        const clsEvidence = evidenceQuoteForNode(sf, stmt);
        pushTriple(fileCanon, 'declares', toClassCanonical(clsName), clsEvidence, relPosix, clsLine);
        for (const member of stmt.members) {
          if ((ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member) || ts.isConstructorDeclaration(member)) && member.name && ts.isIdentifier(member.name)) {
            const mName = member.name.text;
            const mLine = lineOf(sf, member);
            const mEvidence = evidenceQuoteForNode(sf, member);
            const methodCanon = toMethodCanonical(clsName, mName);
            pushTriple(toClassCanonical(clsName), 'declares', methodCanon, mEvidence, relPosix, mLine);
          }
        }
      }
      if (ts.isInterfaceDeclaration(stmt) && stmt.name) {
        const ifaceName = stmt.name.text;
        const ifaceLine = lineOf(sf, stmt);
        const ifaceEvidence = evidenceQuoteForNode(sf, stmt);
        pushTriple(fileCanon, 'declares', toInterfaceCanonical(ifaceName), ifaceEvidence, relPosix, ifaceLine);
      }
      if (ts.isFunctionDeclaration(stmt) && stmt.name) {
        const fnName = stmt.name.text;
        const fnLine = lineOf(sf, stmt);
        const fnEvidence = evidenceQuoteForNode(sf, stmt);
        pushTriple(fileCanon, 'declares', toFnCanonical(fnName), fnEvidence, relPosix, fnLine);
      }
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            const fnName = decl.name.text;
            const fnLine = lineOf(sf, decl);
            const fnEvidence = evidenceQuoteForNode(sf, stmt);
            pushTriple(fileCanon, 'declares', toFnCanonical(fnName), fnEvidence, relPosix, fnLine);
          }
        }
      }
      if (ts.isModuleDeclaration(stmt) && stmt.name && ts.isIdentifier(stmt.name)) {
        const modName = stmt.name.text;
        const modLine = lineOf(sf, stmt);
        const modEvidence = evidenceQuoteForNode(sf, stmt);
        pushTriple(fileCanon, 'declares', toModuleCanonical(modName), modEvidence, relPosix, modLine);
      }
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const target = stmt.moduleSpecifier.text;
        let targetRel = target;
        if (target.startsWith('.')) {
          targetRel = path.posix.normalize(path.posix.join(path.posix.dirname(relPosix), target));
          if (!targetRel.endsWith('.ts') && !targetRel.endsWith('.tsx') && !targetRel.endsWith('.js')) {
            targetRel = `${targetRel}.ts`;
          }
        }
        const targetCanon = `file:${targetRel}`;
        const impLine = lineOf(sf, stmt);
        const impEvidence = evidenceQuoteForNode(sf, stmt);
        pushTriple(fileCanon, 'imports', targetCanon, impEvidence, relPosix, impLine);
      }
      if (ts.isExportDeclaration(stmt)) {
        const expLine = lineOf(sf, stmt);
        const expEvidence = evidenceQuoteForNode(sf, stmt);
        if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
          const target = stmt.moduleSpecifier.text;
          const targetRel = target.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(relPosix), target)) : target;
          pushTriple(fileCanon, 'exports', `file:${targetRel}`, expEvidence, relPosix, expLine);
        } else {
          pushTriple(fileCanon, 'exports', moduleCanon, expEvidence, relPosix, expLine);
        }
      }
    }

    let currentClass: string | null = null;
    let currentFnId: string | null = null;
    const visit = (node: tsImport.Node, parent: tsImport.Node | undefined): void => {
      const prevClass = currentClass;
      const prevFn = currentFnId;
      try {
        if (ts.isClassDeclaration(node) && node.name) currentClass = node.name.text;
        if (ts.isFunctionDeclaration(node) && node.name) currentFnId = `fn:${node.name.text}`;
        if ((ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isConstructorDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
          currentFnId = currentClass ? `method:${currentClass}.${node.name.text}` : `fn:${node.name.text}`;
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
          currentFnId = `fn:${node.name.text}`;
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const callee = node.expression.text;
          const inAwait = parent !== undefined && ts.isAwaitExpression(parent);
          const callerId = currentFnId ?? fileCanon;
          const pred: Predicate = inAwait ? 'awaits' : 'calls';
          const callLine = lineOf(sf, node);
          const callEvidence = evidenceQuoteForNode(sf, node);
          pushTriple(callerId, pred, `fn:${callee}`, callEvidence, relPosix, callLine);
        }
      } catch (e: unknown) {
        if (e instanceof MechanicalExtractionError) throw e;
        throw new MechanicalExtractionError(`walk failed at ${relPosix}:${lineOf(sf, node)} — ${e instanceof Error ? e.message : String(e)}`);
      }
      ts.forEachChild(node, (child) => visit(child, node));
      currentClass = prevClass;
      currentFnId = prevFn;
    };
    try {
      visit(sf, undefined);
    } catch (e: unknown) {
      if (e instanceof MechanicalExtractionError) throw e;
      throw new MechanicalExtractionError(`mechanical walk failed for ${relPosix} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (triples.length === 0) {
    void fs;
  }

  return triples;
}

export function extractMechanicalFromProgram(program: tsImport.Program, opts?: ExtractMechanicalOptions): TypedTriple[] {
  return extractMechanical(program, opts);
}
