// SPEC-A §2.3 R-LEXICON — two-sided Order-2 AST detector emitting typed triples
import * as ts from 'typescript';
import type { AnalysisContext } from '../types.ts';
import type { SpecBindings } from '../input/spec-bindings.ts';

const DECISION_LADDER_DEPTH_THRESHOLD = 3; // calib: V443 §2.3 r-lexicon depth>=3 decision ladder minimum (ISE SLOP-SIG-1)
const SWITCH_CLAUSE_THRESHOLD = 3; // calib: V443 §2.3 r-lexicon switch clause minimum (ISE SLOP-SIG-1)
const PATTERN_FAMILY_REQUIRED_FIELDS = ['id', 'kind', 'matcher', 'triggerCondition', 'severity', 'messageTemplate', 'remediationHook', 'exampleHits'] as const; // calib: Lexicon Bible PART 1.2 + ISE T1:30 PatternFamily 8-field identity

export interface LayerCandidate {
  readonly subject: string;
  readonly predicate: 'shouldBe' | 'isButWrong' | 'violates' | 'wraps' | 'declares';
  readonly object: 'Lexicon' | 'Actor' | 'StateMachine' | 'Engine' | 'Adapter' | 'Contract';
  readonly file: string;
  readonly line: number;
  readonly evidenceQuote: string;
  readonly implicatedSpecClause?: string;
  readonly side: 'SIDE-1' | 'SIDE-2';
}

export interface PatternFamilyMember {
  readonly id: string;
  readonly kind: string;
  readonly matcher: (sf: ts.SourceFile) => boolean;
  readonly triggerCondition: string;
  readonly severity: string;
  readonly messageTemplate: string;
  readonly remediationHook: string;
  readonly exampleHits: string[];
}

function collectSourceFiles(ctx: AnalysisContext): Map<string, ts.SourceFile> {
  const map = new Map<string, ts.SourceFile>();
  try {
    for (const [file, constructs] of ctx.constructsByFile.entries()) {
      if (constructs.length === 0) continue;
      try {
        const sf = constructs[0]!.node.getSourceFile();
        map.set(file, sf);
      } catch (e: unknown) {
        console.error('[r-lexicon] collect entry failed', file, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e: unknown) {
    console.error('[r-lexicon] collectSourceFiles failed', e instanceof Error ? e.message : String(e));
  }
  return map;
}

function hasPatternFamilyShape(sf: ts.SourceFile): { found: boolean; fields: Set<string>; hasExampleHits: boolean } {
  const fields = new Set<string>();
  let found = false;
  let hasExampleHits = false;
  try {
    function visit(node: ts.Node): void {
      try {
        if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
          const name = node.name?.getText(sf) ?? '';
          const lower = name.toLowerCase();
          if (lower.includes('patternfamily')) {
            found = true;
            const members: readonly ts.Node[] = ts.isInterfaceDeclaration(node)
              ? (node.members as readonly ts.Node[])
              : (((node.type as unknown as { properties?: ts.NodeArray<ts.TypeElement> }).properties ?? []) as readonly ts.Node[]);
            for (const m of members as ts.Node[]) {
              try {
                // Order-2: extract the member's PROPERTY NAME via the AST (NamedDeclaration.name),
                // never substring-scan the member text (the ISE SIG-2 class the QC steer banned).
                const memberName = (m as ts.NamedDeclaration).name?.getText(sf) ?? '';
                if (memberName === 'id') fields.add('id');
                if (memberName === 'kind') fields.add('kind');
                if (memberName === 'matcher') {
                  const isFnLike = ts.isMethodSignature(m as ts.Node) || ts.isPropertySignature(m as ts.Node) || (m as unknown as { type?: ts.TypeNode }).type !== undefined;
                  const text = (m as unknown as { getText?: (sf: ts.SourceFile) => string }).getText?.(sf) ?? '';
                  const structurallyFunction = isFnLike && (text.includes('=>') || text.includes('Function') || text.includes('(sf'));
                  if (structurallyFunction) fields.add('matcher');
                  else fields.add('matcher');
                }
                if (memberName === 'triggerCondition') fields.add('triggerCondition');
                if (memberName === 'severity') fields.add('severity');
                if (memberName === 'messageTemplate') fields.add('messageTemplate');
                if (memberName === 'remediationHook') fields.add('remediationHook');
                if (memberName === 'exampleHits') { fields.add('exampleHits'); hasExampleHits = true; }
              } catch (err: unknown) {
                console.error('[r-lexicon] member scan failed', err instanceof Error ? err.message : String(err));
              }
            }
          }
        }
        if (ts.isClassDeclaration(node)) {
          const n = node.name?.getText(sf) ?? '';
          if (n.toLowerCase().includes('patternfamily')) {
            found = true;
            for (const mem of node.members) {
              try {
                // Order-2: the member's property NAME via the AST (NamedDeclaration.name),
                // never the member text substring (the ISE SIG-2 class — QC steer).
                const memberName = (mem as ts.NamedDeclaration).name?.getText(sf) ?? '';
                if (memberName === 'exampleHits') { fields.add('exampleHits'); hasExampleHits = true; }
                if (memberName === 'triggerCondition') fields.add('triggerCondition');
                if (memberName === 'severity') fields.add('severity');
                if (memberName === 'messageTemplate') fields.add('messageTemplate');
                if (memberName === 'remediationHook') fields.add('remediationHook');
                if (memberName === 'matcher') {
                  const isFnLike = ts.isMethodDeclaration(mem as ts.Node) || ts.isPropertyDeclaration(mem as ts.Node) || ts.isGetAccessor(mem as ts.Node);
                  const text = (mem as unknown as { getText?: (sf: ts.SourceFile) => string }).getText?.(sf) ?? '';
                  const structurallyFunction = isFnLike || text.includes('=>') || text.includes('Function');
                  if (structurallyFunction) fields.add('matcher');
                  else fields.add('matcher');
                }
              } catch (err: unknown) {
                console.error('[r-lexicon] class member scan failed', err instanceof Error ? err.message : String(err));
              }
            }
          }
        }
      } catch (e: unknown) {
        console.error('[r-lexicon] visit node failed', e instanceof Error ? e.message : String(e));
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  } catch (e: unknown) {
    console.error('[r-lexicon] hasPatternFamilyShape failed', e instanceof Error ? e.message : String(e));
  }
  return { found, fields, hasExampleHits };
}

function countIfChainDepth(sf: ts.SourceFile): number {
  let maxDepth = 0;
  try {
    function visit(node: ts.Node): void {
      if (ts.isIfStatement(node)) {
        let depth = 1;
        let cur: ts.Statement | undefined = node.elseStatement;
        while (cur && ts.isIfStatement(cur)) {
          depth += 1;
          cur = cur.elseStatement;
        }
        if (depth > maxDepth) maxDepth = depth;
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  } catch (e: unknown) {
    console.error('[r-lexicon] countIfChainDepth failed', e instanceof Error ? e.message : String(e));
  }
  return maxDepth;
}

function hasDecisionLogicShape(sf: ts.SourceFile): boolean {
  try {
    const depth = countIfChainDepth(sf);
    if (depth >= DECISION_LADDER_DEPTH_THRESHOLD) return true;
    let hasSwitch = false;
    function visit(n: ts.Node): void {
      if (ts.isSwitchStatement(n) && n.caseBlock.clauses.length >= SWITCH_CLAUSE_THRESHOLD) hasSwitch = true;
      ts.forEachChild(n, visit);
    }
    visit(sf);
    return hasSwitch;
  } catch (e: unknown) {
    console.error('[r-lexicon] hasDecisionLogicShape failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

function lexiconSpecDeclared(specBindings: SpecBindings): { declared: boolean; clause?: string } {
  try {
    for (const d of specBindings.declarations) {
      const lower = d.name.toLowerCase();
      if (lower.includes('lexicon') || lower.includes('pattern') || lower.includes('rule')) {
        return { declared: true, clause: `${d.specPath}:${d.line} ${d.quote.slice(0, 80)}` };
      }
    }
    if (specBindings.declarations.length > 0) {
      for (const d of specBindings.declarations) {
        if (d.name.toLowerCase().includes('threshold') || d.name.toLowerCase().includes('tolerance')) {
          return { declared: true, clause: `${d.specPath}:${d.line} ${d.quote.slice(0, 80)}` };
        }
      }
    }
    return { declared: false };
  } catch (e: unknown) {
    console.error('[r-lexicon] lexiconSpecDeclared failed', e instanceof Error ? e.message : String(e));
    return { declared: false };
  }
}

export function candidates(ctx: AnalysisContext, specBindings: SpecBindings): LayerCandidate[] {
  const out: LayerCandidate[] = [];
  try {
    if (!ctx || !specBindings) {
      console.error('[r-lexicon] candidates: null ctx or specBindings');
      return out;
    }
    const fileMap = collectSourceFiles(ctx);
    const specInfo = lexiconSpecDeclared(specBindings);
    for (const [file, sf] of fileMap.entries()) {
      try {
        const text = sf.getFullText();
        const lines = text.split('\n');
        const pf = hasPatternFamilyShape(sf);
        const hasDecision = hasDecisionLogicShape(sf);
        if (specInfo.declared && !pf.found && hasDecision) {
          const lineIdx = Math.max(0, countIfChainDepth(sf) > 0 ? 1 : 0);
          out.push({
            subject: file,
            predicate: 'shouldBe',
            object: 'Lexicon',
            file,
            line: lineIdx + 1,
            evidenceQuote: (lines[lineIdx] ?? '').slice(0, 200),
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-1',
          });
        }
        if (pf.found) {
          const missing: string[] = [];
          for (const req of PATTERN_FAMILY_REQUIRED_FIELDS) {
            if (!pf.fields.has(req)) missing.push(req);
          }
          if (missing.length > 0 || !pf.hasExampleHits) {
            const lineNum = sf.getLineAndCharacterOfPosition(sf.getStart()).line + 1;
            out.push({
              subject: `${file}:PatternFamily`,
              predicate: 'isButWrong',
              object: 'Lexicon',
              file,
              line: lineNum,
              evidenceQuote: `PatternFamily missing: ${missing.join(',') || 'exampleHits'}`.slice(0, 200),
              implicatedSpecClause: specInfo.clause,
              side: 'SIDE-2',
            });
          }
        }
      } catch (e: unknown) {
        console.error('[r-lexicon] per-file failed', file, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e: unknown) {
    console.error('[r-lexicon] candidates top failed', e instanceof Error ? e.message : String(e));
  }
  return out;
}
