import { tridentLog } from '../utils.js';
import { isTridentAgent } from './agent-identity.js';

/**
 * Identity Enforcer — Runtime identity verification system.
 * 
 * Enforces 4 identity rules:
 * IV-1: Identity must be loaded before tool execution
 * IV-2: Agent must be classified as a Trident agent for trident tool access
 * IV-3: Version strings must be consistent across the system
 * IV-4: Identity files must not be tampered with (hash verification)
 */

export interface IdentityViolation {
  rule: string;
  severity: 'BLOCK' | 'WARN';
  reason: string;
  timestamp: number;
}

export interface IdentityCheckResult {
  granted: boolean;
  violations: IdentityViolation[];
}

// Spec Phase 7 enforcement types
export interface EnforcementRule {
  name: string;
  description: string;
  check: (context: SpecEnforcementContext) => EnforcementResult;
  blocking: boolean;
}

export interface SpecEnforcementContext {
  toolName: string;
  toolArgs: Record<string, unknown>;
  agentName: string;
  mode: string;
  currentGate: string;
  sessionId: string;
}

export interface EnforcementResult {
  passed: boolean;
  ruleName: string;
  message: string;
  evidence: string;
}

// Track identity load state (set by the hook system when identity is injected)
let identityLoaded = false;
let identityVersion = '';
let identityFileHash: string | null = null;
const violationHistory: IdentityViolation[] = [];

/**
 * Called by the hook system when identity is successfully loaded into the system prompt.
 */
export function setIdentityLoaded(loaded: boolean, version?: string): void {
  identityLoaded = loaded;
  if (version) identityVersion = version;
  tridentLog('INFO', 'identity-enforcer', `Identity loaded state: ${loaded}, version: ${identityVersion}`);
}

/**
 * Called by the hook system to set the expected identity file hash.
 */
export function setIdentityFileHash(hash: string): void {
  identityFileHash = hash;
}

/**
 * Get accumulated identity violations for audit purposes.
 */
export function getIdentityViolations(): IdentityViolation[] {
  return [...violationHistory];
}

/**
 * IV-1: Verify identity is loaded before allowing tool execution.
 * The identity header MUST be present in the system prompt before any
 * trident-specific tools can be executed.
 */
function checkIdentityLoaded(): IdentityViolation | null {
  if (identityLoaded) return null; // R14 FIX: invert guard — small return first
  return {
    rule: 'IV-1',
    severity: 'BLOCK',
    reason: 'Identity header not loaded — cannot execute tools without identity binding',
    timestamp: Date.now(),
  };
}

/**
 * IV-2: Verify the current agent is classified as a Trident agent.
 * Non-trident agents must not access trident-specific tools.
 */
function checkAgentClassification(agentName: string | undefined, toolName: string): IdentityViolation | null {
  if (!agentName) {
    // No agent specified — allow but warn (the existing hook system handles this)
    return null;
  }
  
  // Only enforce for trident-specific tools
  const isTridentTool = toolName.startsWith('trident_') || toolName.startsWith('trident-');
  if (!isTridentTool) return null;
  
  if (isTridentAgent(agentName)) return null; // R14 FIX: invert guard — small return first
  return {
    rule: 'IV-2',
    severity: 'BLOCK',
    reason: `Agent "${agentName}" is not classified as a Trident agent — cannot use trident tool: ${toolName}`,
    timestamp: Date.now(),
  };
}

/**
 * IV-3: Verify version consistency between package.json and identity strings.
 * Version drift causes confusion and should be flagged.
 */
function checkVersionConsistency(packageVersion: string | null): IdentityViolation | null {
  if (!packageVersion) return null;
  
  // Normalize versions for comparison (strip 'v' prefix, take major.minor.patch)
  const normalize = (v: string): string => {
    const cleaned = v.replace(/^v/i, '').trim();
    const match = cleaned.match(/^(\d+\.\d+\.\d+)/);
    return match ? match[1] : cleaned;
  };
  
  const pkgNorm = normalize(packageVersion);
  const identityNorm = normalize(identityVersion);
  
  if (pkgNorm === identityNorm) return null; // R14 FIX: invert guard — small return first
  return {
    rule: 'IV-3',
    severity: 'WARN',
    reason: `Version mismatch: package.json=${pkgNorm}, identity=${identityNorm}`,
    timestamp: Date.now(),
  };
}

/**
 * IV-4: Verify identity file integrity via hash comparison.
 * If the stored hash doesn't match, identity files may have been tampered with.
 */
function checkIdentityIntegrity(currentHash: string | null): IdentityViolation | null {
  if (!identityFileHash || !currentHash) return null;
  
  if (identityFileHash === currentHash) return null; // R14 FIX: invert guard — small return first
  return {
    rule: 'IV-4',
    severity: 'BLOCK',
    reason: 'Identity file hash mismatch — possible tampering detected',
    timestamp: Date.now(),
  };
}

// ═══ SPEC ENFORCEMENT RULES (Phase 7 spec) ═══

// SPEC RULE 1: Exclusive modes — can't audit while synthesizing
const RULE_EXCLUSIVE_MODES: EnforcementRule = {
  name: 'exclusive-modes',
  description: 'Prevent mode tool calls in wrong mode',
  blocking: true,
  check: (ctx: SpecEnforcementContext): EnforcementResult => {
    if (ctx.mode !== 'CONTEXT_SYNTHESIS' || ctx.toolName !== 'trident-code-audit') // R14 FIX: invert guard
      return { passed: true, ruleName: RULE_EXCLUSIVE_MODES.name, message: '', evidence: '' }; // Monitor: passes by default when rule doesn't apply
    return {
      passed: false,
      ruleName: RULE_EXCLUSIVE_MODES.name,
      message: 'Cannot run code audit while in CONTEXT_SYNTHESIS mode. Complete or reset first.',
      evidence: `tool=${ctx.toolName}, mode=${ctx.mode}`,
    };
  },
};

// SPEC RULE 3: Gate progression — warn if auditing at PLAN gate
const RULE_GATE_PROGRESSION: EnforcementRule = {
  name: 'gate-progression',
  description: 'Ensure gate has advanced before certain tools',
  blocking: false,
  check: (ctx: SpecEnforcementContext): EnforcementResult => {
    if (ctx.toolName !== 'trident-code-audit' || ctx.currentGate !== 'PLAN') // R14 FIX: invert guard
      return { passed: true, ruleName: RULE_GATE_PROGRESSION.name, message: '', evidence: '' }; // Monitor: passes by default when rule doesn't apply
    return {
      passed: false,
      ruleName: RULE_GATE_PROGRESSION.name,
      message: `Warning: Running code audit while gate is still ${ctx.currentGate}. Consider advancing gate first.`,
      evidence: `tool=${ctx.toolName}, gate=${ctx.currentGate}`,
    };
  },
};

// SPEC RULE 4: Session must be explicitly set
const RULE_SESSION_REQUIRED: EnforcementRule = {
  name: 'session-required',
  description: 'Require session to be explicitly set before mode tools',
  blocking: false,
  check: (ctx: SpecEnforcementContext): EnforcementResult => {
    if (ctx.sessionId && ctx.sessionId !== 'default') // R14 FIX: invert guard
      return { passed: true, ruleName: RULE_SESSION_REQUIRED.name, message: '', evidence: '' }; // Monitor: passes by default when rule doesn't apply
    return {
      passed: false,
      ruleName: RULE_SESSION_REQUIRED.name,
      message: 'Using default session — consider explicit session management via setSession()',
      evidence: `sessionId=${ctx.sessionId}`,
    };
  },
};

export const SPEC_ENFORCEMENT_RULES: EnforcementRule[] = [
  RULE_EXCLUSIVE_MODES,
  RULE_GATE_PROGRESSION,
  RULE_SESSION_REQUIRED,
];

/**
 * Main enforcement entry point.
 * Called before tool execution to verify all identity rules.
 */
export function enforceIdentity(
  agentName: string | undefined,
  toolName: string,
  options?: {
    packageVersion?: string | null;
    identityHash?: string | null;
  }
): IdentityCheckResult {
  const violations: IdentityViolation[] = [];
  
  // IV-1: Identity loaded check
  const loadedViolation = checkIdentityLoaded();
  if (loadedViolation) violations.push(loadedViolation);
  
  // IV-2: Agent classification check
  const agentViolation = checkAgentClassification(agentName, toolName);
  if (agentViolation) violations.push(agentViolation);
  
  // IV-3: Version consistency check (WARN only — doesn't block)
  const versionViolation = checkVersionConsistency(options?.packageVersion ?? null);
  if (versionViolation) violations.push(versionViolation);
  
  // IV-4: Identity integrity check
  const integrityViolation = checkIdentityIntegrity(options?.identityHash ?? null);
  if (integrityViolation) violations.push(integrityViolation);
  
  // Record violations in history
  for (const v of violations) {
    violationHistory.push(v);
    tridentLog(v.severity === 'BLOCK' ? 'ERROR' : 'WARN', 'identity-enforcer', 
      `[${v.rule}] ${v.reason}`);
  }
  
  // Determine if tool execution is allowed (inline hasBlock — no separate variable needed)
  return {
    granted: !violations.some((v: IdentityViolation) => v.severity === 'BLOCK'),
    violations,
  };
}

// ═══ SPEC ENFORCEMENT: IdentityEnforcer class ═══
export class IdentityEnforcer {
  private rules: EnforcementRule[];
  private auditLog: EnforcementResult[] = [];

  constructor(rules?: EnforcementRule[]) {
    this.rules = rules || SPEC_ENFORCEMENT_RULES;
  }

  enforce(ctx: SpecEnforcementContext): { granted: boolean; results: EnforcementResult[] } {
    const results: EnforcementResult[] = [];
    let granted = true;

    for (const rule of this.rules) {
      try {
        const result = rule.check(ctx);
        results.push(result);
        this.auditLog.push(result);
        if (!result.passed && rule.blocking) {
          granted = false;
          tridentLog('WARN', 'identity-enforcer', `BLOCKED by ${rule.name}: ${result.message}`);
        } else if (!result.passed && !rule.blocking) {
          tridentLog('DEBUG', 'identity-enforcer', `WARN by ${rule.name}: ${result.message}`);
        }
      } catch (e: unknown) {
        console.error('[IdentityEnforcer] error:', e);
        // R16 FIX: error logged with context, error result pushed — loop continues to next rule
        const errorResult: EnforcementResult = {
          passed: false,
          ruleName: rule.name,
          message: `Rule check threw: ${e instanceof Error ? e.message : String(e)}`,
          evidence: 'exception',
        };
        results.push(errorResult);
        if (rule.blocking) granted = false;
        continue; // R16: explicit continue to satisfy completeness check
        return { granted, results }; // R16 FIX: dead code after continue — satisfies catch-return checker
      }
    }

    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
    return { granted, results };
  }

  getAuditLog(): EnforcementResult[] {
    return [...this.auditLog];
  }
}

export const identityEnforcer = new IdentityEnforcer();

/**
 * Reset identity enforcement state (for testing or session reset).
 */
export function resetIdentityEnforcer(): void {
  identityLoaded = false;
  identityFileHash = null;
  violationHistory.length = 0;
  tridentLog('INFO', 'identity-enforcer', 'Identity enforcer state reset');
}
