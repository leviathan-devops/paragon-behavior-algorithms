import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R1_HOOK_EVENTS: readonly string[] = ['tool.execute.before', 'tool.execute.after', 'system.transform', 'chat.message', 'experimental.chat.system.transform'] as const;
export const R1_HOOK_EVENT_SET: ReadonlySet<string> = new Set(R1_HOOK_EVENTS);
export const R1_HOOK_REGISTER_IDENTIFIERS: readonly string[] = ['registerHook', 'registerEventSubstrate'] as const;
export const R1_HOOK_REGISTER_ACCESS: readonly string[] = ['hook.register'] as const;
export const R1_OUTPUT_CONTRACT_TERMS: readonly string[] = ['output.error', 'output.isError', 'output.system'] as const;
export const R1_VIOLATION_EXAMPLES: readonly string[] = ['tool.execute.before handler without output.error'] as const;
export const R1_GOLDEN_FIXTURES: readonly string[] = ['function plainConfigFn(config) { return config; }'] as const;

function walkAst(root: ts.Node, visitor: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) { const node = stack.pop()!; visitor(node); ts.forEachChild(node, (child: ts.Node): void => { stack.push(child); }); }
}

function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile)).line + 1;
}

const TOOL_EXECUTE_BEFORE_EVENTS = new Set(['tool.execute.before', 'toolExecuteBefore', 'tool.execute']);
const TOOL_EXECUTE_AFTER_EVENTS = new Set(['tool.execute.after', 'toolExecuteAfter']);
const SYSTEM_TRANSFORM_EVENTS = new Set(['system.transform', 'systemTransform', 'chat.system.transform', 'experimental.chat.system.transform']);

const CORRECT_AGENT_PATTERNS = new Set(['input.agent', 'input.name', 'input.agentName', 'event.agent', 'ctx.agentName']);
const WRONG_AGENT_PATTERNS = new Set(['session.agent', 'context.agent', 'state.agent']);

function collectStringLiterals(root: ts.Node): Set<string> {
  const literals = new Set<string>();
  walkAst(root, (node): void => { if (ts.isStringLiteral(node)) literals.add(node.text); if (ts.isNoSubstitutionTemplateLiteral(node)) literals.add(node.text); });
  return literals;
}

function collectPropertyAccessChains(root: ts.Node, sourceFile: ts.SourceFile): Set<string> {
  const chains = new Set<string>();
  walkAst(root, (node): void => { if (ts.isPropertyAccessExpression(node)) { const raw = node.getText(sourceFile); const normalized = raw.replace(/\?/g, ''); chains.add(normalized); chains.add(node.name.text); } });
  return chains;
}

function collectAssignmentTargets(root: ts.Node, sourceFile: ts.SourceFile): Set<string> {
  const targets = new Set<string>();
  walkAst(root, (node): void => {
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      const isAssignment = op === ts.SyntaxKind.EqualsToken || op === ts.SyntaxKind.PlusEqualsToken || op === ts.SyntaxKind.MinusEqualsToken;
      if (isAssignment) { const leftText = node.left.getText(sourceFile).replace(/\?/g, ''); targets.add(leftText); }
    }
  });
  return targets;
}

function collectAgentReferences(root: ts.Node, sourceFile: ts.SourceFile): Set<string> {
  const refs = new Set<string>();
  walkAst(root, (node): void => {
    if (ts.isPropertyAccessExpression(node)) { const normalized = node.getText(sourceFile).replace(/\?/g, ''); refs.add(normalized); refs.add(node.name.text); }
    if (ts.isIdentifier(node)) refs.add(node.text);
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) { const argText = node.argumentExpression.text; refs.add(argText); const objText = node.expression.getText(sourceFile).replace(/\?/g, ''); refs.add(`${objText}.${argText}`); }
  });
  return refs;
}

function referencesHookEvent(literals: Set<string>, eventSet: Set<string>): boolean {
  for (const lit of literals) if (eventSet.has(lit)) return true;
  return false;
}

function isToolExecuteBeforeHandler(literals: Set<string>): boolean {
  const hasBefore = referencesHookEvent(literals, TOOL_EXECUTE_BEFORE_EVENTS);
  const hasAfter = referencesHookEvent(literals, TOOL_EXECUTE_AFTER_EVENTS);
  if (hasBefore && hasAfter) return false;
  if (hasBefore) return true;
  if (literals.has('tool.execute') && !hasAfter && !literals.has('tool.execute.before')) return true;
  return false;
}

function hasCorrectAgentPattern(refs: Set<string>): boolean { for (const ref of refs) if (CORRECT_AGENT_PATTERNS.has(ref)) return true; return false; }
function hasWrongAgentPattern(refs: Set<string>): boolean { for (const ref of refs) if (WRONG_AGENT_PATTERNS.has(ref)) return true; return false; }
function hasAgentReference(refs: Set<string>): boolean { return refs.has('agent') || refs.has('agentName'); }

function validateHandlerSignature(node: ts.Node, checker: ts.TypeChecker | null, construct: CodeConstruct, findings: AuditFinding[], sourceFile: ts.SourceFile): void {
  if (!checker) return;
  let funcNode: ts.SignatureDeclaration | null = null;
  if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) funcNode = node;
  if (!funcNode) return;
  try {
    const type = checker.getTypeAtLocation(funcNode);
    const signatures = type.getCallSignatures();
    if (signatures.length === 0) return;
    const sig = signatures[0];
    const params = sig.getParameters();
    if (params.length === 0) {
      findings.push({ layer: 'R1', severity: 'MEDIUM', category: 'HOOK_CONTRACT', file: construct.filePath, line: construct.line, evidence: funcNode.getText(sourceFile).slice(0, 120), description: 'Hook handler function has zero parameters — cannot access input or output objects', correction: 'Add (input, output) parameters to the hook handler signature', runtimeImpact: 'Handler cannot read event input or write output — hook is effectively a no-op', confidence: 0.80, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false });
    }
  } catch (e: unknown) { console.error('[R1HookContract] TypeChecker signature validation failed:', e); }
}

const hookRegistryCache = new Map<string, Map<string, Set<string>>>();
const hookRegistryFileCache = new Map<string, number>();

function addToRegistry(registry: Map<string, Set<string>>, handler: string, event: string): void {
  if (!registry.has(handler)) registry.set(handler, new Set<string>());
  registry.get(handler)!.add(event);
}

function buildHookRegistry(ctx: AnalysisContext): Map<string, Set<string>> {
  const cacheKey = ctx.projectRoot;
  const fileCount = ctx.constructsByFile.size;
  const cachedCount = hookRegistryFileCache.get(cacheKey);
  if (cachedCount === fileCount && hookRegistryCache.has(cacheKey)) return hookRegistryCache.get(cacheKey)!;
  const registry = new Map<string, Set<string>>();
  const eventSet = R1_HOOK_EVENT_SET as Set<string>;
  for (const [_relPath, constructs] of ctx.constructsByFile) {
    for (const construct of constructs) {
      const node = construct.node;
      if (!node) continue;
      if (construct.type === ConstructType.PROPERTY_ASSIGNMENT) {
        let propName: string | null = null;
        let handlerName: string | null = null;
        try {
          const pa = node as ts.PropertyAssignment;
          if (pa.name) {
            const nameNode = pa.name;
            if (ts.isStringLiteral(nameNode) || ts.isNoSubstitutionTemplateLiteral(nameNode)) propName = (nameNode as ts.StringLiteral).text;
            else if (ts.isIdentifier(nameNode)) propName = nameNode.text;
            else propName = nameNode.getText((node as ts.Node).getSourceFile());
            if (propName) {
              const stripped = propName.replace(/^['"]|['"]$/g, '');
              const eventKey = eventSet.has(stripped) ? stripped : eventSet.has(propName) ? propName : null;
              if (eventKey) {
                const init = (pa as ts.PropertyAssignment).initializer;
                if (init) {
                  if (ts.isIdentifier(init)) handlerName = init.text;
                  else if (ts.isPropertyAccessExpression(init)) handlerName = init.name.text;
                  else {
                    const t = init.getText((node as ts.Node).getSourceFile()).trim();
                    const m = t.match(/^([A-Za-z_$][\w$]*)/);
                    if (m) handlerName = m[1];
                  }
                  if (handlerName) addToRegistry(registry, handlerName, eventKey);
                }
              }
            }
          }
        } catch { void 0; }
        if (!propName) {
          const body = construct.body || '';
          for (const ev of eventSet) { if (body.includes(ev)) { const m = body.match(/:\s*([A-Za-z_$][\w$]*)\s*[,}]?/); if (m) addToRegistry(registry, m[1], ev); } }
        }
      }
      if (construct.type === ConstructType.CALL_EXPRESSION) {
        try {
          const callNode = node as ts.CallExpression;
          const args = callNode.arguments;
          for (const arg of args) {
            if (ts.isStringLiteral(arg) && eventSet.has(arg.text)) {
              for (const a2 of args) {
                if (a2 !== arg && ts.isIdentifier(a2)) addToRegistry(registry, a2.text, arg.text);
                if (a2 !== arg && ts.isPropertyAccessExpression(a2)) addToRegistry(registry, a2.name.text, arg.text);
              }
            }
          }
          const exprText = callNode.expression.getText((node as ts.Node).getSourceFile()).replace(/\?/g, '');
          const calleeIsHookRegister = (R1_HOOK_REGISTER_IDENTIFIERS as readonly string[]).some((id) => exprText === id || exprText.endsWith(`.${id}`)) || (R1_HOOK_REGISTER_ACCESS as readonly string[]).includes(exprText);
          if (calleeIsHookRegister) {
            for (const arg of args) { if (ts.isIdentifier(arg)) addToRegistry(registry, arg.text, 'tool.execute.before'); }
          }
        } catch { void 0; }
      }
    }
  }
  if (registry.size === 0) {
    try {
      const hooksDir = path.join(ctx.projectRoot, 'src', 'hooks');
      if (fs.existsSync(hooksDir)) {
        const files = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.ts'));
        for (const f of files) {
          const full = path.join(hooksDir, f);
          const content = fs.readFileSync(full, 'utf-8');
          const sf = ts.createSourceFile(full, content, ts.ScriptTarget.Latest, true);
          walkAst(sf, (n): void => {
            if (ts.isPropertyAssignment(n)) {
              let propName: string | null = null;
              try {
                const nameNode = n.name;
                if (ts.isStringLiteral(nameNode)) propName = nameNode.text;
                else if (ts.isIdentifier(nameNode)) propName = nameNode.text;
                else propName = nameNode.getText(sf);
              } catch { void 0; }
              if (propName) {
                const stripped = propName.replace(/^['"]|['"]$/g, '');
                const eventKey = eventSet.has(stripped) ? stripped : eventSet.has(propName) ? propName : null;
                if (eventKey) {
                  const init = n.initializer;
                  if (init && ts.isIdentifier(init)) addToRegistry(registry, init.text, eventKey);
                }
              }
            }
          });
        }
      }
    } catch { void 0; }
  }
  hookRegistryCache.set(cacheKey, registry);
  hookRegistryFileCache.set(cacheKey, fileCount);
  return registry;
}

function getHandlerIdentifier(construct: CodeConstruct): string {
  if (construct.name && construct.name !== '<arrow>' && construct.name !== '<anonymous>' && construct.name !== '<method>') return construct.name;
  return construct.name || '';
}

export const R1_HOOK_CONTRACT: LayerRule = {
  layer: 'R1',
  name: 'Hook Contract',
  description: 'Validates hook handlers implement correct input/output contracts via HOOK REGISTRY structural analysis (FORENSIC_AUDIT §2.2: registry IS the decision input — non-registered functions never fire)',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION],
  requireHasBody: true,
  enabled: true,
  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    const node = construct.node;
    if (!node) return findings;
    const sourceFile = node.getSourceFile();
    if (!sourceFile) return findings;
    const registry = buildHookRegistry(ctx);
    const handlerId = getHandlerIdentifier(construct);
    const isRegistered = registry.has(handlerId);
    const registeredEvents = isRegistered ? registry.get(handlerId)! : null;
    if (!isRegistered) {
      if (registry.size > 0) return findings;
      const stringLiterals = collectStringLiterals(node);
      let mentionsHookEvent = false;
      for (const ev of R1_HOOK_EVENT_SET) if (stringLiterals.has(ev)) mentionsHookEvent = true;
      if (!mentionsHookEvent) return findings;
    }
    const stringLiterals = collectStringLiterals(node);
    const propertyChains = collectPropertyAccessChains(node, sourceFile);
    const assignmentTargets = collectAssignmentTargets(node, sourceFile);
    const agentRefs = collectAgentReferences(node, sourceFile);
    const hasToolBeforeEvent = registeredEvents ? [...registeredEvents].some((ev) => TOOL_EXECUTE_BEFORE_EVENTS.has(ev) || ev === 'tool.execute.before') : isToolExecuteBeforeHandler(stringLiterals);
    const hasSystemEvent = registeredEvents ? [...registeredEvents].some((ev) => SYSTEM_TRANSFORM_EVENTS.has(ev)) : referencesHookEvent(stringLiterals, SYSTEM_TRANSFORM_EVENTS);
    if (hasToolBeforeEvent) {
      const hasOutputErrorAssignment = assignmentTargets.has('output.error') || propertyChains.has('output.error');
      const hasOutputIsErrorAssignment = assignmentTargets.has('output.isError') || propertyChains.has('output.isError');
      if (!hasOutputErrorAssignment || !hasOutputIsErrorAssignment) {
        findings.push({ layer: 'R1', severity: 'CRITICAL', category: 'HOOK_CONTRACT', file: construct.filePath, line: construct.line, evidence: construct.body.slice(0, 150), description: 'tool.execute.before handler lacks output.error + output.isError — tool blocking cannot work', correction: 'Add: output.error = "[BLOCK] message"; output.isError = true; in the blocking path', runtimeImpact: 'Tool block is declared but never enforced — all tools pass through unblocked', confidence: 0.85, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false, triad: { pattern: { memberId: 'r1.hook-contract-violation', familySeverity: 'CRITICAL' }, state: { machineId: 'r1-hook-registry', from: 'REGISTERED', to: 'VIOLATED' }, evidence: { file: construct.filePath, line: construct.line } } });
      }
      const hasAgentGuard = hasCorrectAgentPattern(agentRefs) || agentRefs.has('input.agent') || agentRefs.has('input.name') || agentRefs.has('input.agentName');
      if (!hasAgentGuard) {
        findings.push({ layer: 'R1', severity: 'HIGH', category: 'HOOK_CONTRACT', file: construct.filePath, line: construct.line, evidence: construct.body.slice(0, 150), description: 'tool.execute.before handler lacks agent identity check — block applies to ALL agents, not just Trident', correction: 'Add agent check: if (input?.agent !== "trident" && input?.name !== "trident") return;', runtimeImpact: 'Tool block fires for every agent — non-Trident agents lose access to bash/write/edit', confidence: 0.90, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false, triad: { pattern: { memberId: 'r1.missing-agent-guard', familySeverity: 'HIGH' }, state: { machineId: 'r1-hook-registry', from: 'REGISTERED', to: 'VIOLATED' }, evidence: { file: construct.filePath, line: construct.line } } });
      }
    }
    if (hasSystemEvent) {
      const hasOutputSystem = propertyChains.has('output.system') || propertyChains.has('output.system.push') || assignmentTargets.has('output.system');
      if (!hasOutputSystem) {
        findings.push({ layer: 'R1', severity: 'CRITICAL', category: 'HOOK_CONTRACT', file: construct.filePath, line: construct.line, evidence: construct.body.slice(0, 150), description: 'system.transform handler lacks output.system injection — agent identity never injected', correction: 'Add: output.system.push(agentInstructions); or output.system = [agentInstructions];', runtimeImpact: 'Agent has no identity — model behaves as generic assistant, not Trident', confidence: 0.85, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false, triad: { pattern: { memberId: 'r1.missing-system-output', familySeverity: 'CRITICAL' }, state: { machineId: 'r1-hook-registry', from: 'REGISTERED', to: 'VIOLATED' }, evidence: { file: construct.filePath, line: construct.line } } });
      }
    }
    if (hasAgentReference(agentRefs)) {
      const correct = hasCorrectAgentPattern(agentRefs);
      const wrong = hasWrongAgentPattern(agentRefs);
      if (wrong && !correct) {
        findings.push({ layer: 'R1', severity: 'HIGH', category: 'HOOK_CONTRACT', file: construct.filePath, line: construct.line, evidence: construct.body.slice(0, 150), description: 'Agent guard uses wrong field — correct fields are input.agent, input.name, or input.agentName', correction: 'Use input?.agent || input?.name || input?.agentName for agent detection', runtimeImpact: 'Agent identity check fails — Trident never activates or always activates', confidence: 0.90, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false, triad: { pattern: { memberId: 'r1.wrong-agent-field', familySeverity: 'HIGH' }, state: { machineId: 'r1-hook-registry', from: 'REGISTERED', to: 'VIOLATED' }, evidence: { file: construct.filePath, line: construct.line } } });
      }
    }
    validateHandlerSignature(node, ctx.checker ?? null, construct, findings, sourceFile);
    return findings;
  },
};
