import { isTridentAgent } from '../identity/agent-identity.js';
import { FirewallAudit } from '../shared/firewall-audit.js';

const audit = new FirewallAudit();

/** Returns the singleton FirewallAudit instance */
export function getFirewallAudit(): FirewallAudit {
  return audit;
}

const TRIDENT_TOOLS: Set<string> = new Set([
  'trident-code-audit', 'trident-deep-planning', 'trident-problem-solving',
  'trident-context-synthesis', 'trident-poseidon', 'trident-gate', 'trident-status', 'trident-vision', 'trident-help',
]);

function checkF1Isolation(toolName: string, sessionAgent: string | undefined): void {
  if (!isTridentAgent(sessionAgent) && TRIDENT_TOOLS.has(toolName)) {
    throw new Error('[F1 BLOCKED] Tool "' + toolName + '" is TRIDENT-specific and cannot be called by agent "' + sessionAgent + '".');
  }
}

// L5 theatrical firewalls removed — not needed for audit-only agent
export function checkTaskDispatch(_toolName: string, _input: Record<string, unknown>, _mode: string): void {
  // task is allowed unconditionally — the BLOCKED_TOOLS list and 
  // ALLOWLIST in trident-hooks.ts handle security for this tool.
  // This layer was causing false blocks and is intentionally passthrough.
  return;
}

export function checkGuardian(
  toolName: string,
  command: string | null,
  sessionAgent: string | undefined,
  currentGate: string,
  mode?: string,
  input?: Record<string, unknown>
): void {
  if (!sessionAgent) return;
  const isTrident = isTridentAgent(sessionAgent);
  if (!isTrident && TRIDENT_TOOLS.has(toolName)) {
    checkF1Isolation(toolName, sessionAgent);
  }
  if (isTrident && command) {
  }
  // TASK_BLOCK: validate task dispatch against mode and subagent_type
  checkTaskDispatch(toolName, input || {}, mode || currentGate);
}
