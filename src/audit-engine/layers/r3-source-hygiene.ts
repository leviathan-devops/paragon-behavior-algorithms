import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R8_TODO_MARKERS: readonly string[] = ['TODO', 'FIXME', 'HACK'] as const;
export const R8_CLOSURE_TERMS: readonly string[] = ['closed', 'resolved', 'done', 'wontfix', 'by design', 'intentional'] as const;
export const R8_VIOLATION_EXAMPLES: readonly string[] = ['// TODO: fix this', '// FIXME: broken logic', '// HACK: workaround - remove'] as const;
export const R8_GOLDEN_FIXTURES: readonly string[] = ['const TODO_STRING = "TODO is just data"', '// TODO: legacy pattern - closed (wontfix - intentional list)'] as const;

function walkAst(root: ts.Node, visitor: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    visitor(node);
    ts.forEachChild(node, (child: ts.Node): void => { stack.push(child); });
  }
}

function splitIntoWords(text: string): string[] {
  const words: string[] = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isAlpha = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
    if (!isAlpha) { if (cur.length > 0) { words.push(cur); cur = ''; } continue; }
    const isUpper = ch >= 'A' && ch <= 'Z';
    if (isUpper && cur.length > 0) {
      const prevIsUpper = cur[cur.length - 1] >= 'A' && cur[cur.length - 1] <= 'Z';
      const nextIsLower = i + 1 < text.length && text[i + 1] >= 'a' && text[i + 1] <= 'z';
      if ((prevIsUpper && nextIsLower) || !prevIsUpper) { words.push(cur); cur = ch; } else { cur += ch; }
    } else { cur += ch; }
  }
  if (cur.length > 0) words.push(cur);
  return words;
}

function commentHasMarker(commentText: string): string | null {
  const lower = commentText.toLowerCase();
  const words = splitIntoWords(commentText).map((w) => w.toLowerCase());
  const wordSet = new Set(words);
  for (const m of R8_TODO_MARKERS) {
    const ml = m.toLowerCase();
    if (wordSet.has(ml) || lower.includes(ml)) {
      if (words.some((w) => w.toLowerCase() === ml)) return m;
      if (lower.indexOf(ml) !== -1) {
        const idx = lower.indexOf(ml);
        const before = idx === 0 || !/[a-z]/i.test(commentText[idx - 1]);
        const after = idx + ml.length >= commentText.length || !/[a-z]/i.test(commentText[idx + ml.length]);
        if (before && after) return m;
      }
    }
  }
  return null;
}

function commentIsClosed(commentText: string): boolean {
  const lower = commentText.toLowerCase();
  for (const term of R8_CLOSURE_TERMS) {
    if (lower.includes(term.toLowerCase())) return true;
  }
  return false;
}

function stripCommentDelimiters(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('//')) return t.slice(2).trim();
  if (t.startsWith('/*')) return t.slice(2, t.endsWith('*/') ? -2 : undefined).trim().replace(/^\*+\s?/, '');
  return t;
}

interface CommentRange { text: string; line: number; filePath: string; }

function collectCommentRanges(sourceFile: ts.SourceFile, filePath: string): CommentRange[] {
  const fullText = sourceFile.getFullText();
  const ranges: CommentRange[] = [];
  const seen = new Set<string>();
  function addRanges(pos: number, end: number, kind: string): void {
    const key = `${pos}:${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    const raw = fullText.slice(pos, end);
    const line = ts.getLineAndCharacterOfPosition(sourceFile, pos).line + 1;
    ranges.push({ text: raw, line, filePath });
  }
  walkAst(sourceFile, (node): void => {
    const leading = ts.getLeadingCommentRanges(fullText, node.getFullStart());
    if (leading) for (const r of leading) addRanges(r.pos, r.end, 'leading');
    const trailing = ts.getTrailingCommentRanges(fullText, node.getEnd());
    if (trailing) for (const r of trailing) addRanges(r.pos, r.end, 'trailing');
  });
  const fileLeading = ts.getLeadingCommentRanges(fullText, 0);
  if (fileLeading) for (const r of fileLeading) addRanges(r.pos, r.end, 'file');
  const synthetic = (sourceFile as unknown as { statements: ts.Node[] });
  if (synthetic.statements && synthetic.statements.length === 0) {
    const allLeading = ts.getLeadingCommentRanges(fullText, 0);
    if (allLeading) for (const r of allLeading) addRanges(r.pos, r.end, 'synthetic');
  }
  return ranges;
}

function findMarkerFindings(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();
  for (const [relPath] of ctx.constructsByFile) {
    const absPath = path.isAbsolute(relPath) ? relPath : path.join(ctx.projectRoot, relPath);
    if (!fs.existsSync(absPath)) continue;
    if (relPath.includes('node_modules') || relPath.includes('dist') || relPath.includes('.git')) continue;
    if (relPath.endsWith('.d.ts')) continue;
    if (relPath.endsWith('r8-source-hygiene.ts')) continue;
    let content: string;
    try { content = fs.readFileSync(absPath, 'utf-8'); } catch { continue; }
    const sf = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true);
    const comments = collectCommentRanges(sf, relPath);
    for (const c of comments) {
      const stripped = stripCommentDelimiters(c.text);
      const marker = commentHasMarker(stripped);
      if (!marker) continue;
      if (commentIsClosed(stripped)) continue;
      const key = `${c.filePath}:${c.line}:${marker}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        layer: 'R3',
        severity: 'LOW',
        category: 'SOURCE_HYGIENE',
        file: c.filePath,
        line: c.line,
        evidence: stripped.slice(0, 120),
        description: `Unresolved ${marker} marker left in comment — "${stripped.slice(0, 60)}"`,
        correction: `Resolve the ${marker} or annotate with closure term (${R8_CLOSURE_TERMS.join('|')}) if intentional`,
        runtimeImpact: 'Unresolved TODO markers indicate incomplete work shipped to production',
        confidence: 0.80,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
        triad: {
          pattern: { memberId: 'r3.todo-marker', familySeverity: 'LOW' },
          state: { machineId: 'r8-comment-state-machine', from: 'PARSED', to: 'CLASSIFIED' },
          evidence: { file: c.filePath, line: c.line },
        },
      });
    }
  }
  return findings;
}

export const R3_SOURCE_HYGIENE: LayerRule = {
  layer: 'R3',
  name: 'Source Hygiene',
  description: 'Detects dead exports, duplicate entries, typos, and unresolved TODO/FIXME/HACK comment markers via AST comment-node analysis (FORENSIC_AUDIT §2.5)',
  applicableTo: [],
  enabled: true,
  evaluate(_construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const deadExports = findDeadExports(ctx);
    for (const entry of deadExports) {
      findings.push({
        layer: 'R3',
        severity: 'MEDIUM',
        category: 'SOURCE_HYGIENE',
        file: entry.filePath,
        line: entry.line,
        evidence: `export ${entry.name} — never imported anywhere`,
        description: `Export "${entry.name}" is defined but never imported by any file in the project`,
        correction: `Remove the export or add an import if it should be used`,
        runtimeImpact: 'Dead exports increase bundle size and maintenance burden',
        confidence: 0.80,
        constructType: entry.constructType,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
    const typos = findTypos(ctx);
    for (const typo of typos) {
      findings.push({
        layer: 'R3',
        severity: 'LOW',
        category: 'SOURCE_HYGIENE',
        file: typo.file,
        line: typo.line,
        evidence: typo.word,
        description: `Possible typo: "${typo.word}" — did you mean "${typo.suggestion}"?`,
        correction: `Fix spelling: ${typo.word} → ${typo.suggestion}`,
        runtimeImpact: 'Typos in identifiers or strings reduce code readability',
        confidence: 0.95,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
    const markers = findMarkerFindings(ctx);
    for (const m of markers) findings.push(m);
    return findings;
  },
};

interface DeadExport { name: string; filePath: string; line: number; constructType: ConstructType | null; }

function findDeadExports(ctx: AnalysisContext): DeadExport[] {
  const dead: DeadExport[] = [];
  if (!ctx.checker) return dead;
  const entryPointFiles = new Set<string>();
  for (const [relPath] of ctx.constructsByFile) { if (relPath.endsWith('index.ts') || relPath.endsWith('index.js')) entryPointFiles.add(relPath); }
  const pkg = ctx.packageJson;
  if (pkg && typeof pkg === 'object') {
    const entryFields = ['main', 'module', 'types', 'typings', 'source'];
    for (const field of entryFields) {
      const entry = pkg[field];
      if (typeof entry === 'string' && entry.length > 0) {
        const normalized = entry.replace(/^\.\//, '').replace(/\.(js|mjs|cjs)$/, '.ts');
        entryPointFiles.add(normalized);
        entryPointFiles.add(entry.replace(/^\.\//, ''));
      }
    }
    if (typeof pkg.exports === 'string') entryPointFiles.add(pkg.exports.replace(/^\.\//, ''));
    else if (pkg.exports && typeof pkg.exports === 'object') {
      const rootExport = pkg.exports['.'];
      if (typeof rootExport === 'string') entryPointFiles.add(rootExport.replace(/^\.\//, ''));
      else if (rootExport && typeof rootExport === 'object') { for (const condEntry of Object.values(rootExport)) { if (typeof condEntry === 'string') entryPointFiles.add(condEntry.replace(/^\.\//, '').replace(/\.(js|mjs|cjs)$/, '.ts')); } }
    }
  }
  for (const [_key, symbol] of ctx.symbolTable.symbols) {
    if (!symbol.isExported) continue;
    if (symbol.importedBy.length > 0) continue;
    if (entryPointFiles.has(symbol.filePath)) continue;
    if (symbol.filePath.endsWith('.d.ts')) continue;
    if (symbol.constructType === ConstructType.INTERFACE_DECLARATION || symbol.constructType === ConstructType.TYPE_ALIAS) continue;
    if (symbol.constructType === ConstructType.RE_EXPORT) continue;
    dead.push({ name: symbol.name, filePath: symbol.filePath, line: symbol.line, constructType: symbol.constructType });
  }
  return dead;
}

interface TypoMatch { word: string; suggestion: string; file: string; line: number; }

function splitTextWords(text: string): string[] {
  const words: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isUpper = ch >= 'A' && ch <= 'Z';
    const isLower = ch >= 'a' && ch <= 'z';
    const isAlpha = isUpper || isLower;
    if (!isAlpha) { if (current.length > 0) { words.push(current); current = ''; } continue; }
    if (isUpper && current.length > 0) {
      const prevIsUpper = current.length > 0 && current[current.length - 1] >= 'A' && current[current.length - 1] <= 'Z';
      const nextIsLower = i + 1 < text.length && text[i + 1] >= 'a' && text[i + 1] <= 'z';
      if (prevIsUpper && nextIsLower) { words.push(current); current = ch; } else if (!prevIsUpper) { words.push(current); current = ch; } else { current += ch; }
    } else { current += ch; }
  }
  if (current.length > 0) words.push(current);
  return words;
}

function textHasTypo(text: string, typo: string, caseSensitive: boolean): boolean {
  const words = splitTextWords(text);
  const target = caseSensitive ? typo : typo.toLowerCase();
  for (const word of words) { const candidate = caseSensitive ? word : word.toLowerCase(); if (candidate === target) return true; }
  return false;
}

const KNOWN_TYPOS: Record<string, string> = {
  'Spawnned': 'Spawned', 'Recieve': 'Receive', 'Occured': 'Occurred', 'Artifcats': 'Artifacts', ' occured': ' occurred', ' recieved': ' received',
  'recieve': 'receive', 'occured': 'occurred', 'seperate': 'separate', 'definately': 'definitely', 'accomodate': 'accommodate', 'occassion': 'occasion', 'neccessary': 'necessary', 'succesful': 'successful', 'sucessful': 'successful', 'succeded': 'succeeded', 'reccomend': 'recommend', 'refrence': 'reference', 'enviroment': 'environment', 'performace': 'performance', 'initalize': 'initialize', 'existance': 'existence', 'persistant': 'persistent', 'reliabe': 'reliable', 'dependancy': 'dependency', 'dependancies': 'dependencies', 'arguement': 'argument', 'commited': 'committed', 'containes': 'contains', 'containter': 'container', 'destory': 'destroy', 'exeuction': 'execution', 'hander': 'handler', 'implentation': 'implementation', 'intialize': 'initialize', 'mananger': 'manager', 'messsage': 'message', 'paramater': 'parameter', 'paramters': 'parameters', 'proccess': 'process', 'resove': 'resolve', 'retrun': 'return', 'runime': 'runtime', 'snaphot': 'snapshot', 'statment': 'statement', 'syncronize': 'synchronize', 'syncronous': 'synchronous', 'asyncronous': 'asynchronous', 'threshhold': 'threshold', 'treshold': 'threshold', 'validaton': 'validation', 'verison': 'version', 'visiblity': 'visibility', 'volunteerily': 'voluntarily', 'wierd': 'weird', 'writeable': 'writable', 'acheive': 'achieve', 'befor': 'before', 'calender': 'calendar', 'collegue': 'colleague', 'concious': 'conscious', 'entre': 'enter', 'excecute': 'execute', 'gaurd': 'guard', 'ignroe': 'ignore', 'knowlege': 'knowledge', 'langauge': 'language', 'libary': 'library', 'maintenence': 'maintenance', 'noticable': 'noticeable', 'prefered': 'preferred', 'publically': 'publicly', 'realy': 'really', 'recuring': 'recurring', 'refered': 'referred', 'rember': 'remember', 'repitition': 'repetition', 'reponse': 'response', 'resrouce': 'resource', 'scedule': 'schedule', 'seperately': 'separately', 'sieze': 'seize', 'stoped': 'stopped', 'strucutre': 'structure', 'supress': 'suppress', 'targetted': 'targeted', 'untill': 'until', 'wich': 'which',
};

function findTypos(ctx: AnalysisContext): TypoMatch[] {
  const results: TypoMatch[] = [];
  const identifierTypes = new Set([ConstructType.FUNCTION_DECLARATION, ConstructType.METHOD_DECLARATION, ConstructType.CLASS_DECLARATION, ConstructType.VARIABLE_DECLARATION, ConstructType.PROPERTY_ASSIGNMENT, ConstructType.EXPORT_DECLARATION, ConstructType.EXPORT_ASSIGNMENT, ConstructType.RE_EXPORT, ConstructType.PROPERTY_ACCESS_EXPRESSION]);
  const seen = new Set<string>();
  for (const [relPath, constructs] of ctx.constructsByFile) {
    if (relPath.endsWith('r8-source-hygiene.ts') || relPath.endsWith('r8-source-hygiene')) continue;
    for (const construct of constructs) {
      if (identifierTypes.has(construct.type)) {
        if (construct.type === ConstructType.PROPERTY_ACCESS_EXPRESSION && construct.name.length > 40) continue;
        for (const [typo, correction] of Object.entries(KNOWN_TYPOS)) {
          if (textHasTypo(construct.name, typo.trim(), true)) {
            const key = `${construct.filePath}:${construct.line}:${typo.trim()}`;
            if (seen.has(key)) continue; seen.add(key);
            results.push({ word: typo.trim(), suggestion: correction, file: construct.filePath, line: construct.line });
          }
        }
      }
      if (construct.type === ConstructType.STRING_LITERAL) {
        const textValue = construct.name;
        for (const [typo, correction] of Object.entries(KNOWN_TYPOS)) {
          if (textHasTypo(textValue, typo.trim(), false)) {
            const key = `${construct.filePath}:${construct.line}:str:${typo.trim()}`;
            if (seen.has(key)) continue; seen.add(key);
            results.push({ word: typo.trim(), suggestion: correction, file: construct.filePath, line: construct.line });
          }
        }
      }
      if (construct.type === ConstructType.TEMPLATE_EXPRESSION) {
        const bodyText = construct.body;
        for (const [typo, correction] of Object.entries(KNOWN_TYPOS)) {
          if (textHasTypo(bodyText, typo.trim(), false)) {
            const key = `${construct.filePath}:${construct.line}:tmpl:${typo.trim()}`;
            if (seen.has(key)) continue; seen.add(key);
            results.push({ word: typo.trim(), suggestion: correction, file: construct.filePath, line: construct.line });
          }
        }
      }
    }
  }
  return results;
}
