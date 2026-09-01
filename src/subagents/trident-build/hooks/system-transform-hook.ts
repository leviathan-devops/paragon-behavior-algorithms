// System transform hook — identity injection for Trident_Build

import { isTridentBuildAgent } from '../identity/agent-identity.js';
import { getCurrentAgent } from '../../../hooks/agent-state.js';

export function createSystemTransformHook() {
  return async function(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void> {
    var sessionID = typeof input.sessionID === 'string' ? input.sessionID : undefined;
    var agent = getCurrentAgent(sessionID);
    if (!isTridentBuildAgent(agent)) return;

    // The system.transform hook uses output.system: string[], not output.content
    var content = Array.isArray(output.system) ? output.system : undefined;
    if (!content || !Array.isArray(content)) return;

    // Check if identity already injected
    if (content.some(function(s: string) { return s.indexOf('Trident_Build') !== -1; })) return;

    // Inject T1 prompt (prepend to beginning of system array)
    content.unshift('\n[TRIDENT_BUILD v4.4] You are Trident_Build, a runtime-grade build engineer.\n' +
      'Execute ONLY the remediation plan provided. Do NOT think. Do NOT deviate.\n');
  };
}
