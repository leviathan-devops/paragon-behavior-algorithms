// SPEC-A §2.3 R-STATE-MACHINE — two-sided Order-2 AST detector emitting typed triples
// Conformance checks walk the createMachine call's AST config object literal — never file-text substring
import * as ts from 'typescript';
import type { AnalysisContext } from '../types.ts';
import type { SpecBindings } from '../input/spec-bindings.ts';

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

function collectSourceFiles(ctx: AnalysisContext): Map<string, ts.SourceFile> {
  const map = new Map<string, ts.SourceFile>();
  try {
    for (const [file, constructs] of ctx.constructsByFile.entries()) {
      if (constructs.length === 0) continue;
      try {
        const sf = constructs[0]!.node.getSourceFile();
        map.set(file, sf);
      } catch (e: unknown) {
        console.error('[r-state-machine] collect entry failed', file, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e: unknown) {
    console.error('[r-state-machine] collectSourceFiles failed', e instanceof Error ? e.message : String(e));
  }
  return map;
}

interface MachineConfigAnalysis {
  hasTypes: boolean;
  hasFinal: boolean;
  hasInconclusive: boolean;
  hasLadder: boolean;
}

function getSetupTypesInfo(sf: ts.SourceFile): boolean {
  try {
    let hasSetupWithTypes = false;
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        let calleeName = '';
        if (ts.isIdentifier(callee)) calleeName = callee.getText(sf);
        else if (ts.isPropertyAccessExpression(callee)) calleeName = callee.name.getText(sf);
        if (calleeName === 'setup') {
          const arg = node.arguments[0];
          if (arg && ts.isObjectLiteralExpression(arg)) {
            for (const prop of arg.properties) {
              if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
                const propName = prop.name?.getText(sf) ?? '';
                if (propName === 'types') hasSetupWithTypes = true;
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
    return hasSetupWithTypes;
  } catch (e: unknown) {
    console.error('[r-state-machine] getSetupTypesInfo failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

function analyzeMachineConfig(call: ts.CallExpression, sf: ts.SourceFile, hasSetupTypes: boolean): MachineConfigAnalysis {
  let hasTypes = hasSetupTypes;
  let hasFinal = false;
  let hasInconclusive = false;
  let hasLadder = false;
  const ladderStates = new Set<string>();
  try {
    const arg = call.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) {
      return { hasTypes, hasFinal, hasInconclusive, hasLadder };
    }
    // Walk the config object literal's properties via Order-2
    for (const prop of arg.properties) {
      try {
        if (!ts.isPropertyAssignment(prop)) continue;
        const propName = prop.name?.getText(sf) ?? '';
        // states: { ... }
        if (propName === 'states' && ts.isObjectLiteralExpression(prop.initializer)) {
          for (const stateProp of prop.initializer.properties) {
            try {
              if (!ts.isPropertyAssignment(stateProp)) continue;
              const stateName = stateProp.name?.getText(sf).replace(/['"]/g, '') ?? '';
              // Ladder states as literal state keys in states object
              if (stateName === 'INFORM' || stateName === 'WARN' || stateName === 'BLOCK' || stateName === 'REVERT' || stateName === 'ESCALATE') {
                ladderStates.add(stateName);
              }
              if (stateName === 'INCONCLUSIVE') hasInconclusive = true;
              if (ts.isObjectLiteralExpression(stateProp.initializer)) {
                for (const inner of stateProp.initializer.properties) {
                  if (!ts.isPropertyAssignment(inner)) continue;
                  const innerName = inner.name?.getText(sf) ?? '';
                  if (innerName === 'type' && ts.isStringLiteral(inner.initializer)) {
                    if (inner.initializer.text === 'final') hasFinal = true;
                  }
                }
              }
            } catch (e: unknown) {
              console.error('[r-state-machine] state prop analysis failed', e instanceof Error ? e.message : String(e));
            }
          }
        }
        // Check for INCONCLUSIVE as a state key or type value anywhere in config
        if (propName === 'type' && ts.isStringLiteral(prop.initializer) && prop.initializer.text === 'final') {
          hasFinal = true;
        }
      } catch (e: unknown) {
        console.error('[r-state-machine] config prop analysis failed', e instanceof Error ? e.message : String(e));
      }
    }
    // Also check if the call is chained from setup: setup(...).createMachine
    const callee = call.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const obj = callee.expression;
      if (ts.isCallExpression(obj)) {
        const objCallee = obj.expression;
        let objName = '';
        if (ts.isIdentifier(objCallee)) objName = objCallee.getText(sf);
        else if (ts.isPropertyAccessExpression(objCallee)) objName = objCallee.name.getText(sf);
        if (objName === 'setup') {
          const setupArg = obj.arguments[0];
          if (setupArg && ts.isObjectLiteralExpression(setupArg)) {
            for (const p of setupArg.properties) {
              if (ts.isPropertyAssignment(p) && (p.name?.getText(sf) ?? '') === 'types') hasTypes = true;
            }
          }
        }
      }
    }
    // Check for INCONCLUSIVE appearing as a state name via walking all string literals in config
    function walkForInconclusive(node: ts.Node): void {
      if (ts.isPropertyAssignment(node)) {
        const n = node.name?.getText(sf).replace(/['"]/g, '') ?? '';
        if (n === 'INCONCLUSIVE') hasInconclusive = true;
      }
      if (ts.isStringLiteral(node) && node.text === 'INCONCLUSIVE') hasInconclusive = true;
      ts.forEachChild(node, walkForInconclusive);
    }
    if (arg) walkForInconclusive(arg);
    hasLadder = ladderStates.size >= 3;
  } catch (e: unknown) {
    console.error('[r-state-machine] analyzeMachineConfig failed', e instanceof Error ? e.message : String(e));
  }
  return { hasTypes, hasFinal, hasInconclusive, hasLadder };
}

function hasScatteredBooleanFlags(sf: ts.SourceFile): boolean {
  try {
    let flagCount = 0;
    function visit(node: ts.Node): void {
      if (ts.isVariableDeclaration(node)) {
        const nameNode = node.name;
        if (ts.isIdentifier(nameNode)) {
          const id = nameNode.getText(sf);
          if (id === 'isBuilding' || id === 'isTesting' || id === 'isDeploying' || id === 'idle') flagCount += 1;
        }
      }
      if (ts.isIfStatement(node)) {
        const cond = node.expression;
        // Order-2: check if condition is identifier or property access matching flag names
        if (ts.isIdentifier(cond)) {
          const id = cond.getText(sf);
          if (id === 'idle' || id === 'isBuilding' || id === 'isTesting') flagCount += 1;
        } else if (ts.isPropertyAccessExpression(cond)) {
          const prop = cond.name.getText(sf);
          if (prop === 'idle' || prop === 'building' || prop === 'testing') flagCount += 1;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
    return flagCount >= 2;
  } catch (e: unknown) {
    console.error('[r-state-machine] hasScatteredBooleanFlags failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

function specDeclaresMachine(specBindings: SpecBindings): { declared: boolean; clause?: string } {
  try {
    for (const d of specBindings.declarations) {
      const lower = d.name.toLowerCase();
      if (lower.includes('state') || lower.includes('machine') || lower.includes('gate') || lower.includes('workflow')) {
        return { declared: true, clause: `${d.specPath}:${d.line} ${d.quote.slice(0, 80)}` };
      }
    }
    if (specBindings.declarations.length > 2) {
      return { declared: true, clause: `${specBindings.declarations[0]!.specPath}:${specBindings.declarations[0]!.line} ${specBindings.declarations[0]!.quote.slice(0, 80)}` };
    }
    return { declared: false };
  } catch (e: unknown) {
    console.error('[r-state-machine] specDeclaresMachine failed', e instanceof Error ? e.message : String(e));
    return { declared: false };
  }
}

function isMachineCall(node: ts.CallExpression, sf: ts.SourceFile): boolean {
  try {
    const expr = node.expression;
    if (ts.isIdentifier(expr) && expr.getText(sf) === 'createMachine') return true;
    if (ts.isPropertyAccessExpression(expr) && expr.name.getText(sf) === 'createMachine') return true;
    return false;
  } catch (e: unknown) {
    console.error('[r-state-machine] isMachineCall failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

export function candidates(ctx: AnalysisContext, specBindings: SpecBindings): LayerCandidate[] {
  const out: LayerCandidate[] = [];
  try {
    if (!ctx || !specBindings) {
      console.error('[r-state-machine] null ctx/specBindings');
      return out;
    }
    const fileMap = collectSourceFiles(ctx);
    const specInfo = specDeclaresMachine(specBindings);
    for (const [file, sf] of fileMap.entries()) {
      try {
        const hasSetupTypes = getSetupTypesInfo(sf);
        const machines: Array<{ node: ts.CallExpression; line: number; quote: string; analysis: MachineConfigAnalysis }> = [];
        function visit(node: ts.Node): void {
          if (ts.isCallExpression(node) && isMachineCall(node, sf)) {
            const pos = node.getStart(sf);
            const lc = sf.getLineAndCharacterOfPosition(pos);
            const quote = node.getText(sf).slice(0, 200);
            const analysis = analyzeMachineConfig(node, sf, hasSetupTypes);
            machines.push({ node, line: lc.line + 1, quote, analysis });
          }
          ts.forEachChild(node, visit);
        }
        visit(sf);
        const hasFlags = hasScatteredBooleanFlags(sf);
        if (specInfo.declared && machines.length === 0 && hasFlags) {
          const line = sf.getLineAndCharacterOfPosition(0).line + 1;
          const quote = sf.getFullText().split('\n')[0]?.slice(0, 200) ?? '';
          out.push({
            subject: file,
            predicate: 'shouldBe',
            object: 'StateMachine',
            file,
            line,
            evidenceQuote: quote,
            implicatedSpecClause: specInfo.clause,
            side: 'SIDE-1',
          });
        }
        for (const m of machines) {
          const violations: string[] = [];
          if (!m.analysis.hasTypes) violations.push('untyped-no-setup-types');
          if (!m.analysis.hasFinal) violations.push('no-final-state');
          if (!m.analysis.hasInconclusive) violations.push('missing-INCONCLUSIVE');
          if (!m.analysis.hasLadder) violations.push('ladder-absent');
          if (violations.length > 0) {
            out.push({
              subject: `${file}:machine@${m.line}`,
              predicate: 'isButWrong',
              object: 'StateMachine',
              file,
              line: m.line,
              evidenceQuote: m.quote,
              implicatedSpecClause: specInfo.clause,
              side: 'SIDE-2',
            });
          }
        }
      } catch (e: unknown) {
        console.error('[r-state-machine] per-file failed', file, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e: unknown) {
    console.error('[r-state-machine] candidates top failed', e instanceof Error ? e.message : String(e));
  }
  return out;
}
