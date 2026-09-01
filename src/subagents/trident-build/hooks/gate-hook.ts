// Gate hook — tool.execute.after evidence tracking for Trident_Build

import { EvidencePipeline } from '../harness/evidence-pipeline.js';
import { isTridentBuildAgent } from '../identity/agent-identity.js';
import { getCurrentAgent } from '../../../hooks/agent-state.js';
import { tridentLog } from '../../../utils.js';

export function createGateHook() {
  var evidencePipeline = new EvidencePipeline();

  return async function(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void> {
    // THE R16 TYPE_CERTAINTY GUARD — the hook input values are typeof-guarded
    // before the string assertion (the `|| ''` semantics preserved).
    var sessionID = typeof input.sessionID === 'string' ? input.sessionID : undefined;
    var agent = getCurrentAgent(sessionID);
    if (!isTridentBuildAgent(agent)) return;

    var toolName = typeof input.tool === 'string' ? input.tool : '';
    // Record every tool execution in the Merkle chain
    // Check for actual error state instead of hardcoding true
    var hasError = !!(output?.error || (output as Record<string, unknown>)?.stderr || (output as Record<string, unknown>)?.exitCode);
    evidencePipeline.record(toolName, (output?.args as Record<string, unknown>) || {}, !hasError);

    // Periodically verify chain integrity (every 10 records)
    if (evidencePipeline.getChainLength() % 10 === 0 && evidencePipeline.getChainLength() > 0) {
      var chainValid = evidencePipeline.verifyChainIntegrity();
      if (!chainValid) {
        // THE OBSERVABILITY FIX (HT-BUG-9 — 2026-08-23): the tamper line now
        // carries WHO fired it (the resolved agent + session) — a misresolve
        // (the gate firing with no build agent dispatched) is visible in one
        // log line instead of an untraceable ERROR.
        tridentLog('ERROR', 'gate', 'Evidence chain integrity FAILED — tampering detected (agent=' + (agent ?? 'unknown') + ' session=' + (sessionID ?? 'unknown') + ' chainLen=' + evidencePipeline.getChainLength() + ')');
      }
    }
  };
}
