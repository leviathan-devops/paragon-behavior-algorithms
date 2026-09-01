import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

// ---------------------------------------------------------------------------
// AST Helpers
// ---------------------------------------------------------------------------

/** Identifiers commonly used for config objects in plugin source. */
const CONFIG_IDENTIFIERS = new Set(['config', 'cfg', 'settings', 'options', 'pluginConfig']);

/**
 * Iterative AST walk using an explicit stack — mirrors the R13/R3 pattern.
 */
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

/**
 * Checks whether a config property access is protected by optional chaining,
 * a nullish coalescing default, or a preceding type guard / if-check.
 */
function hasConfigAccessGuard(node: ts.PropertyAccessExpression): boolean {
  // Optional chaining: config?.port
  if (node.questionDotToken) return true;

  const parent = node.parent;

  // Nullish coalescing or logical OR default: config.port ?? 3000
  if (
    ts.isBinaryExpression(parent) &&
    (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      parent.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
    parent.left === node
  ) {
    return true;
  }

  // Element access with default: config['port'] ?? 3000 — handled by parent chain
  // Inside conditional: if (config.port !== undefined)
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isIfStatement(p)) return true;
    if (ts.isConditionalExpression(p)) return true;
    if (ts.isFunctionLike(p) || ts.isSourceFile(p)) break;
    p = p.parent;
  }

  return false;
}

/**
 * Uses the TypeChecker to determine whether a config-typed identifier has
 * an explicit type annotation (interface, type alias, or inline object type).
 * Returns true if the type is `any`, implicitly typed, or unresolvable.
 */
function isUntypedConfigIdentifier(node: ts.Identifier, checker: ts.TypeChecker | null): boolean {
  if (!checker) return false; // Cannot determine — do not report
  try {
    const type = checker.getTypeAtLocation(node);
    // Explicit any
    if ((type.flags & ts.TypeFlags.Any) !== 0) return true;
    // Check if the symbol has a type annotation on its declaration
    const symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.declarations && symbol.declarations.length > 0) {
      const decl = symbol.declarations[0];
      if (ts.isVariableDeclaration(decl) && !decl.type) {
        // No explicit type annotation — check if inferred type is an anonymous object
        const typeStr = checker.typeToString(type);
        // Anonymous object types are printed as { prop: type; ... } — no named type
        if (typeStr.startsWith('{')) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Layer Rule
// ---------------------------------------------------------------------------

export const R7_CONFIG_SCHEMA: LayerRule = {
  layer: 'R7',
  name: 'Config Schema',
  description: 'Validates opencode.json structure and AST-based config access safety for plugin deployment',
  applicableTo: [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.METHOD_DECLARATION,
    ConstructType.PROPERTY_ACCESS_EXPRESSION,
    ConstructType.VARIABLE_DECLARATION,
    ConstructType.CALL_EXPRESSION,
  ],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    const findings: AuditFinding[] = [];

    // ===================================================================
    // PHASE 1: opencode.json structural validation (existing)
    // ===================================================================

    const config = ctx.opencodeJson;
    if (config) {
      const agentKeys = config.agent ? Object.keys(config.agent) : [];
      if (agentKeys.length === 0) {
        findings.push({
          layer: 'R7',
          severity: 'HIGH',
          category: 'CONFIG_SCHEMA',
          file: 'opencode.json',
          line: 0,
          evidence: 'No agent block in opencode.json',
          description: 'Missing agent definition block — plugin will not register an agent',
          correction: 'Add an "agent" block with at least one agent definition',
          runtimeImpact: 'Plugin loads but no agent appears in TUI agent selector',
          confidence: 0.95,
          constructType: null,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }

      for (const agentKey of agentKeys) {
        const agent = config.agent[agentKey];
        if (!agent) continue;

        if (!agent.permission) {
          findings.push({
            layer: 'R7',
            severity: 'HIGH',
            category: 'CONFIG_SCHEMA',
            file: 'opencode.json',
            line: 0,
            evidence: `Agent "${agentKey}" missing permission block`,
            description: `Missing permission block for agent "${agentKey}" — may default to deny-all`,
            correction: 'Add a permission block: "permission": { "task": "allow" }',
            runtimeImpact: 'Agent may not be able to execute any tasks',
            confidence: 0.95,
            constructType: null,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }

      const hookEntries = config.hooks ? Object.entries(config.hooks) : [];
      for (const [hookKey, hookVal] of hookEntries) {
        if (typeof hookVal === 'object' && hookVal !== null) {
          const hookObj = hookVal as Record<string, any>;
          if (hookObj.plugin) {
            const pluginPath = String(hookObj.plugin);
            if (!pluginPath.startsWith('file://')) {
              findings.push({
                layer: 'R7',
                severity: 'HIGH',
                category: 'CONFIG_SCHEMA',
                file: 'opencode.json',
                line: 0,
                evidence: `Hook "${hookKey}" plugin path: ${pluginPath}`,
                description: `Plugin path not using file:// URI — may fail to resolve in container`,
                correction: 'Change plugin path to use file:// URI format',
                runtimeImpact: 'Plugin fails to load — hook never fires',
                confidence: 0.90,
                constructType: null,
                callGraphRef: null,
                evidenceSuppressed: false,
              });
            }
          }
        }
      }

      if (!config.$schema) {
        findings.push({
          layer: 'R7',
          severity: 'MEDIUM',
          category: 'CONFIG_SCHEMA',
          file: 'opencode.json',
          line: 0,
          evidence: 'No $schema field',
          description: 'Missing $schema — no IDE validation for config structure',
          correction: 'Add "$schema" field pointing to opencode JSON schema',
          runtimeImpact: 'Config errors not caught by IDE — silent misconfiguration',
          confidence: 0.85,
          constructType: null,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    // ===================================================================
    // PHASE 2: AST-based config access safety analysis
    // ===================================================================

    if (!construct || !construct.node) return findings;
    const node = construct.node;
    const sf = node.getSourceFile();
    if (!sf) return findings;

    const checker = ctx.checker ?? null;
    const seenAccessKeys = new Set<string>();

    try {
      walkAst(node, (child: ts.Node): void => {
        // ── Detection A: Unguarded config property access ──
        // Matches: config.port, cfg.timeout, settings.mode, options.retries
        if (
          ts.isPropertyAccessExpression(child) &&
          ts.isIdentifier(child.expression) &&
          CONFIG_IDENTIFIERS.has(child.expression.text)
        ) {
          const propName = child.name.text;
          const dedupKey = `${construct.filePath}:${getLineNumber(sf, child)}:${child.expression.text}.${propName}`;
          if (seenAccessKeys.has(dedupKey)) return;
          seenAccessKeys.add(dedupKey);

          if (!hasConfigAccessGuard(child)) {
            findings.push({
              layer: 'R7',
              severity: 'MEDIUM',
              category: 'CONFIG_SCHEMA',
              file: construct.filePath,
              line: getLineNumber(sf, child),
              evidence: `${child.expression.text}.${propName} accessed without optional chaining or default`,
              description: `Config property "${propName}" accessed without guard — crashes if config key is missing or config object is undefined`,
              correction: `Use optional chaining: ${child.expression.text}?.${propName} ?? defaultValue, or validate config shape before access`,
              runtimeImpact: `Undefined config property causes TypeError at runtime — plugin crashes on missing config key`,
              confidence: 0.80,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }

        // ── Detection B: Untyped config variable declaration ──
        // Matches: const config = JSON.parse(...) without type annotation
        if (
          ts.isVariableDeclaration(child) &&
          ts.isIdentifier(child.name) &&
          CONFIG_IDENTIFIERS.has(child.name.text) &&
          !child.type
        ) {
          if (isUntypedConfigIdentifier(child.name, checker)) {
            findings.push({
              layer: 'R7',
              severity: 'MEDIUM',
              category: 'CONFIG_SCHEMA',
              file: construct.filePath,
              line: getLineNumber(sf, child),
              evidence: `${child.name.text} declared without explicit type annotation`,
              description: `Config variable "${child.name.text}" has no type annotation — property access is unchecked at compile time`,
              correction: `Define a config interface and annotate: const ${child.name.text}: PluginConfig = ...`,
              runtimeImpact: 'Config shape errors are not caught at compile time — invalid property access reaches runtime',
              confidence: 0.75,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }

        // ── Detection C: process.env access used as config without default ──
        // Matches: process.env.PLUGIN_PORT without ?? fallback
        if (
          ts.isPropertyAccessExpression(child) &&
          ts.isPropertyAccessExpression(child.expression) &&
          ts.isIdentifier(child.expression.expression) &&
          child.expression.expression.text === 'process' &&
          ts.isIdentifier(child.expression.name) &&
          child.expression.name.text === 'env'
        ) {
          const envVar = child.name.text;
          const dedupKey = `${construct.filePath}:${getLineNumber(sf, child)}:env.${envVar}`;
          if (seenAccessKeys.has(dedupKey)) return;
          seenAccessKeys.add(dedupKey);

          const parent = child.parent;
          const hasDefault =
            (ts.isBinaryExpression(parent) &&
              (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
                parent.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
              parent.left === child) ||
            (ts.isPrefixUnaryExpression(parent) &&
              parent.operator === ts.SyntaxKind.ExclamationToken);

          // Check for if-guard ancestor
          let inGuard = false;
          let p: ts.Node | undefined = child.parent;
          while (p && p !== node) {
            if (ts.isIfStatement(p) || ts.isConditionalExpression(p)) {
              inGuard = true;
              break;
            }
            p = p.parent;
          }

          if (!hasDefault && !inGuard) {
            findings.push({
              layer: 'R7',
              severity: 'MEDIUM',
              category: 'CONFIG_SCHEMA',
              file: construct.filePath,
              line: getLineNumber(sf, child),
              evidence: `process.env.${envVar} used as config without default or guard`,
              description: `Environment variable process.env.${envVar} used for configuration without fallback — undefined if not set`,
              correction: `Add default: process.env.${envVar} ?? 'defaultValue' or guard: if (!process.env.${envVar}) throw new Error('${envVar} required')`,
              runtimeImpact: `process.env.${envVar} is undefined when not set — downstream config-dependent code crashes`,
              confidence: 0.82,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }
      });
    } catch (e: unknown) {
      // Non-fatal — AST traversal error on one construct should not crash the audit
      console.warn('[r7-config-schema] AST traversal error: ' + (e instanceof Error ? e.message : String(e)));
    }

    return findings;
  },
};
