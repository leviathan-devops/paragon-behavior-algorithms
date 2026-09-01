import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';
import * as ts from 'typescript';

/**
 * R12: Cross-Plugin Isolation — Full AST-Based Analysis
 * 
 * Walks the TypeScript AST to detect:
 * 1. Hook handler registrations (CallExpression with hook event names)
 * 2. Missing agent identity guards (Identifier/PropertyAccessExpression checks)
 * 3. Wrong agent guard fields (PropertyAccessExpression chain analysis)
 * 4. Agent name prefix mixing (Identifier/StringLiteral text analysis)
 * 5. Multiple identity check functions (FunctionDeclaration/VariableDeclaration names)
 * 
 * Zero regex. Zero string matching on code. Pure AST node walking.
 * String literals and comments are naturally excluded by AST structure —
 * no masking pass needed.
 */

// ═══════════════════════════════════════════════════════
// AST Walker (iterative — avoids stack overflow on deep ASTs)
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// Lookup Sets (Set.has replaces all string/regex matching)
// ═══════════════════════════════════════════════════════

/** Hook event names that identify a function as a hook handler */
const HOOK_EVENT_NAMES = new Set([
  'tool.execute.before',
  'tool.execute.after',
  'system.transform',
  'chat.message',
  'experimental.chat.system.transform',
]);

/** Function names that register hooks */
const HOOK_REGISTER_FUNCTIONS = new Set(['registerHook']);

/** Property access chains that register hooks */
const HOOK_REGISTER_ACCESS = new Set(['hook.register']);

/** Identifier names that indicate an agent guard is present */
const AGENT_GUARD_IDENTIFIERS = new Set(['agent', 'agentName']);

/** Correct agent guard property access patterns (both plain and optional chaining) */
const CORRECT_AGENT_FIELDS = new Set([
  'input.agent', 'input?.agent',
  'input.name', 'input?.name',
  'input.agentName', 'input?.agentName',
  'event.agent', 'event?.agent',
]);

/** Wrong agent guard property access patterns (both plain and optional chaining) */
const WRONG_AGENT_FIELDS = new Set([
  'session.agent', 'session?.agent',
  'context.agent', 'context?.agent',
  'state.agent', 'state?.agent',
  'ctx.agent', 'ctx?.agent',
]);

/** Known identity check function names */
const IDENTITY_CHECK_NAMES = new Set([
  'isTrident', 'checkAgent', 'isAgent', 'verifyAgent', 'guardAgent',
]);

// ═══════════════════════════════════════════════════════
// AST Detection Functions
// ═══════════════════════════════════════════════════════

/**
 * Detect hook handler registration via AST walking.
 * Checks for:
 * - CallExpression with callee matching hook.register or registerHook
 * - CallExpression with string literal arguments matching hook event names
 * - PropertyAccessExpression matching hook event name patterns
 * 
 * Replaces: 7 string-search checks on masked body text
 */
function detectHookHandler(node: ts.Node): boolean {
  let found = false;
  walkAst(node, (child): void => {
    if (found) return;

    if (ts.isCallExpression(child)) {
      const expr = child.expression;
      // Check callee: hook.register(...) or registerHook(...)
      if (ts.isPropertyAccessExpression(expr)) {
        const calleeText = expr.getText();
        if (HOOK_REGISTER_ACCESS.has(calleeText)) {
          found = true;
          return;
        }
      }
      if (ts.isIdentifier(expr) && HOOK_REGISTER_FUNCTIONS.has(expr.text)) {
        found = true;
        return;
      }
      // Check string literal arguments for hook event names
      for (const arg of child.arguments) {
        if (ts.isStringLiteral(arg) && HOOK_EVENT_NAMES.has(arg.text)) {
          found = true;
          return;
        }
      }
    }

    // Check property access chains matching hook event patterns
    // e.g., const handler = tool.execute.before
    if (ts.isPropertyAccessExpression(child)) {
      const text = child.getText();
      if (HOOK_EVENT_NAMES.has(text)) {
        found = true;
        return;
      }
    }
  });
  return found;
}

/**
 * Detect agent identity guard via AST Identifier and PropertyAccessExpression walking.
 * 
 * Replaces: 3 string-search checks on body text for agent guard detection
 */
function detectAgentGuard(node: ts.Node): boolean {
  let found = false;
  walkAst(node, (child): void => {
    if (found) return;
    // Check identifiers: agent, agentName
    if (ts.isIdentifier(child) && AGENT_GUARD_IDENTIFIERS.has(child.text)) {
      found = true;
      return;
    }
    // Check property access: input.agent, input?.agent, input.agentName
    if (ts.isPropertyAccessExpression(child)) {
      const text = child.getText();
      if (CORRECT_AGENT_FIELDS.has(text)) {
        found = true;
        return;
      }
    }
  });
  return found;
}

/**
 * Analyze whether agent guard uses correct or wrong field access patterns.
 * Walks PropertyAccessExpression nodes and checks against known field sets.
 * 
 * Replaces: Array.some() with string-search on body text for field validation
 */
function analyzeAgentGuardFields(node: ts.Node): { usesCorrect: boolean; usesWrong: boolean } {
  let usesCorrect = false;
  let usesWrong = false;

  walkAst(node, (child): void => {
    if (!ts.isPropertyAccessExpression(child)) return;
    const text = child.getText();

    if (CORRECT_AGENT_FIELDS.has(text)) {
      usesCorrect = true;
    }
    if (WRONG_AGENT_FIELDS.has(text)) {
      usesWrong = true;
    }
  });

  return { usesCorrect, usesWrong };
}

/**
 * Detect agent name prefix mixing (trident_ vs trident-) via AST walking.
 * Checks Identifier nodes and code-position StringLiteral nodes (function arguments,
 * property values). Standalone string expressions (documentation) are excluded.
 * 
 * Replaces: 2 string-search checks on masked body for prefix detection
 */
function detectPrefixMixing(node: ts.Node): boolean {
  let hasUnderscore = false;
  let hasHyphen = false;

  walkAst(node, (child): void => {
    // Check identifiers for trident_ prefix (trident- is invalid in JS identifiers)
    if (ts.isIdentifier(child)) {
      if (child.text.startsWith('trident_')) hasUnderscore = true;
    }
    // Check string literals in code positions (arguments, property values)
    // Exclude standalone expression statements (likely documentation/descriptions)
    if (ts.isStringLiteral(child)) {
      const parent = child.parent;
      const isCodePosition = ts.isCallExpression(parent) ||
        ts.isPropertyAssignment(parent) ||
        ts.isBinaryExpression(parent) ||
        ts.isVariableDeclaration(parent);
      if (isCodePosition) {
        if (child.text.startsWith('trident_')) hasUnderscore = true;
        if (child.text.startsWith('trident-')) hasHyphen = true;
      }
    }
  });

  return hasUnderscore && hasHyphen;
}

/**
 * Find identity check function declarations via AST walking.
 * Looks for FunctionDeclaration and VariableDeclaration with names matching
 * known identity check patterns.
 * 
 * Replaces: regex /function\s+(isTrident|checkAgent|...)/g and
 *           /const\s+(isTrident|checkAgent|...)\s*=/g with .exec() loop
 */
function findIdentityCheckFunctions(node: ts.Node): Set<string> {
  const found = new Set<string>();

  walkAst(node, (child): void => {
    // function isTrident() {} / function checkAgent() {}
    if (ts.isFunctionDeclaration(child) && child.name) {
      if (IDENTITY_CHECK_NAMES.has(child.name.text)) {
        found.add(child.name.text);
      }
    }
    // const isTrident = ... / const checkAgent = ...
    if (ts.isVariableDeclaration(child) && ts.isIdentifier(child.name)) {
      if (IDENTITY_CHECK_NAMES.has(child.name.text)) {
        found.add(child.name.text);
      }
    }
  });

  return found;
}

// ═══════════════════════════════════════════════════════
// Layer Rule
// ═══════════════════════════════════════════════════════

export const R12_CROSS_PLUGIN_ISOLATION: LayerRule = {
  layer: 'R12',
  name: 'Cross-Plugin Isolation',
  description: 'Detects missing agent guards in hook registrations and identity check inconsistencies via AST analysis',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    const node = construct.node;
    if (!node) return findings;

    // CHECK 1: Is this a hook handler? (AST CallExpression/PropertyAccessExpression walking)
    if (!detectHookHandler(node)) return findings;

    // CHECK 2: Does it have an agent guard? (AST Identifier/PropertyAccessExpression walking)
    const hasGuard = detectAgentGuard(node);
    if (!hasGuard) {
      findings.push({
        layer: 'R12',
        severity: 'CRITICAL',
        category: 'CROSS_PLUGIN_ISOLATION',
        file: construct.filePath,
        line: construct.line,
        evidence: `Hook handler "${construct.name}" has no agent guard`,
        description: `Hook handler "${construct.name}" fires for ALL agents — no identity check isolates it to this plugin`,
        correction: 'Add agent identity check at the top: if (input?.agent !== "trident" && input?.name !== "trident") return;',
        runtimeImpact: 'Hook fires for every plugin/agent — side effects leak across plugin boundaries',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // CHECK 3: Agent guard field correctness (AST PropertyAccessExpression analysis)
    if (hasGuard) {
      const { usesCorrect, usesWrong } = analyzeAgentGuardFields(node);
      if (usesWrong && !usesCorrect) {
        findings.push({
          layer: 'R12',
          severity: 'HIGH',
          category: 'CROSS_PLUGIN_ISOLATION',
          file: construct.filePath,
          line: construct.line,
          evidence: `Agent guard uses wrong field in "${construct.name}"`,
          description: 'Agent guard uses non-existent field — correct fields are input.agent, input.name, or input.agentName',
          correction: 'Use input?.agent || input?.name || input?.agentName for agent detection',
          runtimeImpact: 'Agent identity check fails — Trident never activates or always activates',
          confidence: 0.90,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    // CHECK 4: Agent name prefix mixing (AST Identifier/StringLiteral walking)
    if (detectPrefixMixing(node)) {
      findings.push({
        layer: 'R12',
        severity: 'HIGH',
        category: 'CROSS_PLUGIN_ISOLATION',
        file: construct.filePath,
        line: construct.line,
        evidence: 'Mix of underscore and hyphen in agent name prefix',
        description: 'Agent name uses both trident_ and trident- — inconsistent prefix causes identity mismatch',
        correction: 'Pick one convention: either trident- or trident_ — never mix',
        runtimeImpact: 'Identity check passes for one variant but fails for the other — inconsistent behavior',
        confidence: 0.90,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // CHECK 5: Multiple identity check functions (AST FunctionDeclaration/VariableDeclaration walking)
    const identityFunctions = findIdentityCheckFunctions(node);
    if (identityFunctions.size >= 3) {
      findings.push({
        layer: 'R12',
        severity: 'MEDIUM',
        category: 'CROSS_PLUGIN_ISOLATION',
        file: construct.filePath,
        line: construct.line,
        evidence: `${identityFunctions.size} different identity check functions: ${[...identityFunctions].join(', ')}`,
        description: 'Multiple different identity check functions — suggests copy-paste drift and potential inconsistency',
        correction: 'Consolidate to a single identity check function used everywhere',
        runtimeImpact: 'Different code paths may check identity differently — some bypass the guard',
        confidence: 0.80,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    return findings;
  },
};
