// Guardian hook — tool.execute.before enforcement for Trident_Build
// Delegates to TheatricalBlock, BuildFirewall, and RuntimeGradeEngineer

import { TheatricalCodeBlock } from '../harness/theatrical-block.js';
import { RuntimeGradeEngineer } from '../harness/runtime-grade.js';
import { BuildFirewall } from '../firewall/index.js';
import { isTridentBuildAgent } from '../identity/agent-identity.js';
import { getCurrentAgent } from '../../../hooks/agent-state.js';
import { EnforcementError } from '../harness/enforcement-error.js';

export function createGuardianHook() {
  var theatricalBlock = new TheatricalCodeBlock();
  var runtimeGrade = new RuntimeGradeEngineer();
  var buildFirewall = new BuildFirewall();
  // Auto-initialize with empty plan scope (all files allowed by default)
  // This activates plan scope validation, AST analysis, and evidence chain
  (async function() {
    try {
      await buildFirewall.initialize(process.cwd(), '');
    } catch (e: unknown) {
      // Non-fatal — initialize is best-effort without a plan
      console.warn(`[guardian-hook] buildFirewall initialize failed (best-effort): ${e instanceof Error ? e.message : String(e)}`);
    }
  })();

  var beforeHook = async function(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void> {
    // THE R16 TYPE_CERTAINTY GUARD — the hook input values are unknown entries
    // in a Record<string, unknown>; each string read is typeof-guarded (the
    // `|| ''` semantics preserved: a non-string field reads as ''), never a
    // bare `as string` on an unvalidated value.
    var sessionID = typeof input.sessionID === 'string' ? input.sessionID : undefined;
    var agent = getCurrentAgent(sessionID);
    if (!isTridentBuildAgent(agent)) return;

    var toolName = typeof input.tool === 'string' ? input.tool : '';
    var writeTools = ['write', 'edit', 'patch'];
    if (!writeTools.includes(toolName)) return;

    var args = (output.args as Record<string, unknown>) || {};
    var filePath = typeof args.path === 'string' ? args.path : (typeof args.filePath === 'string' ? args.filePath : '');
    var content = typeof args.content === 'string' ? args.content : (typeof args.data === 'string' ? args.data : '');
    if (!content) return;

    // LAYER 1: BuildFirewall — plan scope + AST + evidence
    await buildFirewall.onBeforeWrite(toolName, filePath, content);

    // LAYER 2: TheatricalBlock — 20+ pattern scan
    var matches = theatricalBlock.scan(content);
    var critical = matches.filter(function(m) { return m.severity === 'critical'; });
    if (critical.length > 0) {
      throw new EnforcementError(
        '[THEATRICAL_BLOCK] ' + critical[0].name + ': ' + critical[0].message + ' in ' + filePath,
        critical[0].name,
        'critical'
      );
    }

    // LAYER 3: RuntimeGradeEngineer — P1-P10
    var violations = runtimeGrade.check(toolName, args, filePath);
    var criticalViolations = violations.filter(function(v) { return v.severity === 'critical'; });
    if (criticalViolations.length > 0) {
      throw new EnforcementError(
        '[RUNTIME_BLOCK] ' + criticalViolations[0].code + ': ' + criticalViolations[0].message,
        criticalViolations[0].code,
        'critical'
      );
    }
  };

  var afterHook = async function(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void> {
    // THE R16 TYPE_CERTAINTY GUARD — same typeof-guarded reads as beforeHook.
    var sessionID = typeof input.sessionID === 'string' ? input.sessionID : undefined;
    var agent = getCurrentAgent(sessionID);
    if (!isTridentBuildAgent(agent)) return;
    var toolName = typeof input.tool === 'string' ? input.tool : '';
    var args = (output.args as Record<string, unknown>) || {};
    var filePath = typeof args.path === 'string' ? args.path : (typeof args.filePath === 'string' ? args.filePath : '');
    if (filePath && (toolName === 'write' || toolName === 'edit' || toolName === 'patch')) {
      await buildFirewall.onAfterWrite(toolName, filePath);
    }
  };

  return { beforeHook, afterHook };
}
