import { enforceIdentity, setIdentityLoaded, type IdentityViolation } from '../identity/identity-enforcer.js';
import { tridentLog } from '../utils.js';

/**
 * Identity Enforcer Hook
 * 
 * Wraps the identity enforcement check for integration into the existing
 * tool.execute.before hook chain.
 */

/**
 * Integration point: call this at the START of toolBeforeHook.
 * Returns true if the tool execution should proceed, false if it should be blocked.
 * Throws an Error with the violation details if a BLOCK-level violation is found.
 */
export function checkIdentityBeforeTool(
  agentName: string | undefined,
  toolName: string,
  sessionId: string,
): boolean {
  const result = enforceIdentity(agentName, toolName);
  
  if (!result.granted) {
    const reasons = result.violations
      .filter((v: IdentityViolation) => v.severity === 'BLOCK')
      .map((v: IdentityViolation) => `[${v.rule}] ${v.reason}`)
      .join('; ');
    if (reasons) {
      throw new Error(`[TRIDENT IDENTITY BLOCK] ${reasons}`);
    }
  }
  
  // Log warnings but allow execution
  const warnings = result.violations.filter((v: IdentityViolation) => v.severity === 'WARN');
  for (const w of warnings) {
    tridentLog('WARN', 'identity-enforcer-hook', `[${w.rule}] ${w.reason}`);
  }
  
  return result.granted;
}

/**
 * Called when identity is successfully injected into the system prompt.
 * Updates the identity enforcer's state.
 */
export function notifyIdentityLoaded(version?: string): void {
  setIdentityLoaded(true, version);
}
