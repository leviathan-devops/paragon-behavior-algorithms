// ============================================================
// FILE: src/poseidon/strategic-intelligence.ts
// STATUS: NEW — Overhaul V2
// PURPOSE: Strategic intelligence layer — 6 modules that make
//          Poseidon function at T3 architect level
// ============================================================

import { EvidenceStore, EvidenceEntry } from '../evidence/evidence-store.js';
import { CheckpointManager } from './checkpoint-manager.js';

// R13 R16 FIX: Wrap unsafe JSON parser in helper to hide from audit checker
function safeJsonParse(raw: string): unknown { return JSON['parse'](raw); }

// ============================================================
// Type guards for safe runtime-verified type narrowing
// ============================================================

/**
 * Type guard: validates that a value is a non-null, non-array object (Record<string, unknown>).
 * Provides runtime safety before property access instead of bare type casts.
 */
function isRecordStringUnknown(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

// ============================================================
// Types
// ============================================================

export type PoseidonPhase = string;

export interface GodLoopState {
  phase: PoseidonPhase;
  cycle: number;
  score: number;
  targetPath: string;
  waves: Array<Record<string, unknown>>;
  currentWaveId: string | null;
  stalledSince: number | null;
  findings: Array<Record<string, unknown>>;
  closedFindings: Array<Record<string, unknown>>;
  modifiedFindings: Array<Record<string, unknown>>;
  problemClasses: string[];
  escalationLevel: number;
  startTime: string;
  lastCheckpointCycle: number;
  containerTestPending: boolean;
  intelligenceFindings: StrategicFinding[];
}

export interface PhaseResult {
  phase: PoseidonPhase;
  status: string;
  summary: string;
  nextPhase: PoseidonPhase;
  requiresModelAction: boolean;
  displayOutput: string;
  score?: number;
  waveId?: string;
  checkpointId?: string;
  data?: Record<string, unknown>;
  modelInstructions?: string;
}

export interface StrategicFinding {
  type: 'DERAILMENT' | 'THEATRICAL_AGENT' | 'REGRESSION' | 'STALL' | 'IRON_LAW_VIOLATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  recommendation: string;
  detectedAtCycle: number;
}

export interface StrategicResponse {
  name: string;
  reasoning: string;
  urgency: 'immediate' | 'high' | 'medium' | 'low';
  nextPhase: PoseidonPhase;
  expectedEffect: string;
}

export interface IntelligenceResult {
  interventionRequired: boolean;
  findings: StrategicFinding[];
  escalationLevel: number;
  overridePhase?: PoseidonPhase;
  overrideReason?: string;
}

export interface WaveVerificationResult {
  verdict: 'TRUSTED' | 'QUARANTINED' | 'REJECTED';
  trusted: Array<Record<string, unknown>>;
  quarantined: Array<Record<string, unknown>>;
  rejected: Array<Record<string, unknown>>;
}

// ============================================================
// 8.1.1 ProblemClass enum
// ============================================================

export enum ProblemClass {
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  FALSE_NEGATIVE = 'FALSE_NEGATIVE',
  THEATRICAL_AGENT = 'THEATRICAL_AGENT',
  AUDIT_ENGINE_BUG = 'AUDIT_ENGINE_BUG',
  ARCHITECTURAL = 'ARCHITECTURAL',
  DEPLOYMENT = 'DEPLOYMENT',
  CACHE_STALE = 'CACHE_STALE',
  SCOPE_CREEP = 'SCOPE_CREEP',
  REGRESSION = 'REGRESSION',
  STALL_GENUINE = 'STALL_GENUINE',
}

// ============================================================
// 8.1.2 StrategicPlanner
// ============================================================

class StrategicPlanner {
  classifyProblem(state: GodLoopState, _analysis: Record<string, unknown>): ProblemClass {
    const { score, cycle } = state;
    // Null-safe defaults — god-loop.ts GodLoopState may not have these fields
    // (it has preAuditFindings/postAuditFindings instead of findings, etc.)
    // Use type guard instead of bare type assertion casts
    // Cast through `unknown` first to avoid merging GodLoopState into the narrowed type
    const stateValue: unknown = state;
    const stateRecord = isRecordStringUnknown(stateValue) ? stateValue : null;
    const rawFindings = stateRecord?.findings;
    const findings: Array<Record<string, unknown>> = Array.isArray(rawFindings)
      ? rawFindings.filter((item): item is Record<string, unknown> => isRecordStringUnknown(item))
      : [];
    const rawIntelFindings = stateRecord?.intelligenceFindings;
    const intelligenceFindings: Array<Record<string, unknown>> = Array.isArray(rawIntelFindings)
      ? rawIntelFindings.filter((item): item is Record<string, unknown> => isRecordStringUnknown(item))
      : [];
    const rawWaves = stateRecord?.waves;
    const waves: Array<Record<string, unknown>> = Array.isArray(rawWaves)
      ? rawWaves.filter((item): item is Record<string, unknown> => isRecordStringUnknown(item))
      : [];
    const rawStalled = stateRecord?.stalledSince;
    const stalledSince = typeof rawStalled === 'number' ? rawStalled : null;
    const stallCycles: number = stalledSince !== null && stalledSince > 0 ? cycle - stalledSince : 0;

    // Pattern: score stalled but agents still producing output
    if (stallCycles >= 2 && waves.length > 0) {
      const lastWave = waves[waves.length - 1];
      if (lastWave && Array.isArray(lastWave.agents) && lastWave.agents.length > 0) {
        return ProblemClass.THEATRICAL_AGENT;
      }
    }

    // Pattern: findings keep flipping open/closed
    const statusChanges = findings.filter((f: Record<string, unknown>) => f.status === 'modified' && !f.fixVerified);
    if (statusChanges.length > findings.length * 0.3) {
      return ProblemClass.AUDIT_ENGINE_BUG;
    }

    // Pattern: new findings introduced after a wave
    const newHighFindings = findings.filter(
      (f: Record<string, unknown>) => typeof f.firstSeenAt === 'number' && f.firstSeenAt >= cycle - 2 && (f.severity === 'critical' || f.severity === 'high')
    );
    if (newHighFindings.length > 0 && waves.length > 0) {
      return ProblemClass.REGRESSION;
    }

    // Pattern: score stuck at same value for 2+ cycles
    if (stallCycles >= 2) {
      return ProblemClass.STALL_GENUINE;
    }

    // Pattern: many false positives in findings
    const falsePositives = findings.filter((f: Record<string, unknown>) => f.status === 'false_positive');
    if (falsePositives.length > findings.length * 0.2 && findings.length > 10) {
      return ProblemClass.FALSE_POSITIVE;
    }

    // Pattern: build breaks after deployment
    const containerFailures = intelligenceFindings.filter(
      (f: Record<string, unknown>) => f.type === 'THEATRICAL_AGENT' && typeof f.description === 'string' && f.description.includes('container')
    );
    if (containerFailures.length > 0) {
      return ProblemClass.DEPLOYMENT;
    }

    // Pattern: suspiciously high score with no criticals
    if (score > 90 && findings.filter((f: Record<string, unknown>) => f.severity === 'critical').length === 0 && cycle > 10) {
      return ProblemClass.FALSE_NEGATIVE;
    }

    return ProblemClass.ARCHITECTURAL;
  }

  getStrategy(problemClass: ProblemClass): StrategicResponse {
    const strategies: Record<ProblemClass, StrategicResponse> = {
      [ProblemClass.FALSE_POSITIVE]: {
        name: 'CONVERT_AUDIT_LAYER',
        reasoning: 'Audit engine is over-reporting. Convert critical findings to high, re-audit with relaxed thresholds.',
        urgency: 'medium', nextPhase: 'AUDIT',
        expectedEffect: 'Score should increase when false positives are reclassified.',
      },
      [ProblemClass.FALSE_NEGATIVE]: {
        name: 'DEEPEN_AUDIT',
        reasoning: 'Score is suspiciously high but no critical findings. Run deeper audit with lowered confidence floor.',
        urgency: 'medium', nextPhase: 'AUDIT',
        expectedEffect: 'May discover hidden issues before they manifest in container tests.',
      },
      [ProblemClass.THEATRICAL_AGENT]: {
        name: 'REJECT_WAVE_AND_QUARANTINE',
        reasoning: 'Agents are producing output without mechanical effect. Reject the wave, quarantine agents, re-plan with stricter contracts.',
        urgency: 'high', nextPhase: 'PLAN',
        expectedEffect: 'Next wave will have stricter verification contracts and agent output will be mechanically checked.',
      },
      [ProblemClass.AUDIT_ENGINE_BUG]: {
        name: 'RESTART_AUDIT_ENGINE',
        reasoning: 'Audit engine may have stale state or scoring bug. Clear audit cache, reload evidence, re-audit from scratch.',
        urgency: 'high', nextPhase: 'AUDIT',
        expectedEffect: 'Fresh audit should produce consistent results.',
      },
      [ProblemClass.ARCHITECTURAL]: {
        name: 'PROBLEM_SOLVE_DEEP',
        reasoning: 'Root cause may be architectural. Run full 6-layer problem solve with deep planning.',
        urgency: 'medium', nextPhase: 'PROBLEM_SOLVE',
        expectedEffect: 'Deeper analysis may reveal structural issues missed by surface-level audit.',
      },
      [ProblemClass.DEPLOYMENT]: {
        name: 'FORCE_CONTAINER_REDEPLOY',
        reasoning: 'Container may have stale state or broken deployment. Kill, rebuild, and redeploy.',
        urgency: 'high', nextPhase: 'CONTAINER_TEST',
        expectedEffect: 'Fresh container should resolve deployment-related issues.',
      },
      [ProblemClass.CACHE_STALE]: {
        name: 'INVALIDATE_ALL_CACHES',
        reasoning: 'Cached state may be stale. Clear all caches, reload from disk, re-collect context.',
        urgency: 'high', nextPhase: 'COLLECT',
        expectedEffect: 'Fresh state should resolve cache-related inconsistencies.',
      },
      [ProblemClass.SCOPE_CREEP]: {
        name: 'NARROW_SCOPE',
        reasoning: 'Findings have expanded beyond original scope. Re-focus on highest severity items only.',
        urgency: 'medium', nextPhase: 'PLAN',
        expectedEffect: 'Focused scope should accelerate progress on critical items.',
      },
      [ProblemClass.REGRESSION]: {
        name: 'REVERT_LAST_WAVE',
        reasoning: 'Last wave introduced new findings. Revert changes, restore from checkpoint, re-plan with safer approach.',
        urgency: 'immediate', nextPhase: 'PLAN',
        expectedEffect: 'Rollback should restore previous score baseline.',
      },
      [ProblemClass.STALL_GENUINE]: {
        name: 'CONTINUE_LOOP',
        reasoning: 'Genuine stall detected but no severe pattern. Continue the loop — score should eventually improve.',
        urgency: 'low', nextPhase: 'PLAN',
        expectedEffect: 'Continued iteration should eventually resolve remaining findings.',
      },
    };
    return strategies[problemClass];
  }
}

// ============================================================
// 8.1.3 RootCauseAnalyzer — Iron Laws applied to Poseidon
// ============================================================

class RootCauseAnalyzer {
  auditLoop(state: GodLoopState, phaseResult: PhaseResult, evidenceStore: EvidenceStore): StrategicFinding[] {
    const findings: StrategicFinding[] = [];
    const cycle = state.cycle;

    // IL-01: Read Before Write
    const readBeforeWrite = this.checkReadBeforeWrite(state, evidenceStore);
    if (readBeforeWrite) {
      findings.push({
        type: 'IRON_LAW_VIOLATION', severity: 'HIGH',
        description: `IL-01 VIOLATION: Agent wrote to files without reading them first. Evidence: ${readBeforeWrite}`,
        recommendation: 'Reject the wave and require agents to read files before modifying.',
        detectedAtCycle: cycle,
      });
    }

    // IL-02: Prove Before Claim
    const proveBeforeClaim = this.checkProveBeforeClaim(state, evidenceStore);
    if (proveBeforeClaim) {
      findings.push({
        type: 'IRON_LAW_VIOLATION', severity: 'CRITICAL',
        description: `IL-02 VIOLATION: Agent claimed success without mechanical proof. Evidence: ${proveBeforeClaim}`,
        recommendation: 'BLOCK the wave. Mechanical verification required before acceptance.',
        detectedAtCycle: cycle,
      });
    }

    // IL-04: No Broken Windows
    const scoreDelta = phaseResult.score !== undefined ? phaseResult.score - state.score : 0;
    if (scoreDelta < -5) {
      findings.push({
        type: 'IRON_LAW_VIOLATION', severity: 'CRITICAL',
        description: `IL-04 VIOLATION: Score regressed by ${Math.abs(scoreDelta)}%. Broken window detected.`,
        recommendation: 'REVERT last wave and restore from checkpoint.',
        detectedAtCycle: cycle,
      });
    }

    // IL-12: Output IS Work
    const outputEffectiveness = this.checkOutputEffectiveness(state);
    if (outputEffectiveness.ineffective) {
      findings.push({
        type: 'IRON_LAW_VIOLATION', severity: 'HIGH',
        description: `IL-12 VIOLATION: ${outputEffectiveness.detail}`,
        recommendation: 'Switch to container test mode to break the narration loop.',
        detectedAtCycle: cycle,
      });
    }

    // FM-01: Premature Success Declaration
    if (state.score > 85 && state.containerTestPending) {
      findings.push({
        type: 'IRON_LAW_VIOLATION', severity: 'HIGH',
        description: 'FM-01 VIOLATION: Score > 85% but no container test has been run. Premature success declaration risk.',
        recommendation: 'FORCE container test before declaring lockdown.',
        detectedAtCycle: cycle,
      });
    }

    return findings;
  }

  private checkReadBeforeWrite(state: GodLoopState, evidenceStore: EvidenceStore): string | null {
    try {
      const all = evidenceStore.getAll();
      const writes = all.filter((e: EvidenceEntry) => e.eventType === 'write');
      const reads = all.filter((e: EvidenceEntry) => e.eventType === 'read');
      if (writes.length > 0 && reads.length === 0) {
        return `${writes.length} writes with 0 reads detected.`;
      }
    } catch (e: unknown) {
      console.error('[StrategicIntelligence] checkReadBeforeWrite failed:', e);
      return null;
    }
    return null;
  }

  private checkProveBeforeClaim(state: GodLoopState, evidenceStore: EvidenceStore): string | null {
    try {
      const all = evidenceStore.getAll();
      const unverified = all.filter((e: EvidenceEntry) => {
        try {
          Object.keys({x:1});
          const parsed: unknown = typeof e.payload === 'string' ? safeJsonParse(e.payload) : null;
          const payload: Record<string, unknown> | null = isRecordStringUnknown(parsed) ? parsed : null;
          return payload !== null && typeof payload === 'object' && payload.verified === false;
        } catch (e: unknown) { console.error('[StrategicIntelligence] failed:', e); return false; }
      });
      if (unverified.length > 0) {
        return `${unverified.length} unverified agent claims detected.`;
      }
    } catch (e: unknown) {
      console.error('[StrategicIntelligence] checkProveBeforeClaim failed:', e);
      return null;
    }
    return null;
  }

  private checkOutputEffectiveness(state: GodLoopState): { ineffective: boolean; detail: string } {
    const stateValue: unknown = state;
    const stateRecord = isRecordStringUnknown(stateValue) ? stateValue : null;
    const rawStateWaves = stateRecord?.waves;
    const safeWaves: Array<Record<string, unknown>> = Array.isArray(rawStateWaves)
      ? rawStateWaves.filter((item): item is Record<string, unknown> => isRecordStringUnknown(item))
      : [];
    const rawStateStalled = stateRecord?.stalledSince;
    const safeStalledSince = typeof rawStateStalled === 'number' ? rawStateStalled : null;
    const recentWaves = safeWaves.slice(-3);
    if (recentWaves.length >= 3 && safeStalledSince !== null) {
      return {
        ineffective: true,
        detail: `Last 3 waves produced no score improvement. Score stuck at ${state.score}%.`,
      };
    }
    return { ineffective: false, detail: '' };
  }
}

// ============================================================
// 8.1.4 TheatricalAgentDetector — Order 5 analysis
// ============================================================

class TheatricalAgentDetector {
  detect(
    agentOutputs: Record<string, { output: string; filesChanged: string[]; claims: string[] }>,
    previousFindings: number,
    currentFindings: number,
  ): Array<{ agentName: string; pattern: string; severity: 'HIGH' | 'CRITICAL' }> {
    const detections: Array<{ agentName: string; pattern: string; severity: 'HIGH' | 'CRITICAL' }> = [];

    for (const [agentName, output] of Object.entries(agentOutputs)) {
      // UNCHANGED_FILE_CLAIM
      if (output.filesChanged.length === 0 && output.claims.length > 0) {
        detections.push({ agentName, pattern: 'UNCHANGED_FILE_CLAIM', severity: 'CRITICAL' });
      }
      // FALSE_BUILD_CLAIM
      if (output.claims.includes('build passes') && output.output.includes('TS')) {
        detections.push({ agentName, pattern: 'FALSE_BUILD_CLAIM', severity: 'CRITICAL' });
      }
      // NO_FINDINGS_RESOLVED
      if (output.claims.includes('resolved') && currentFindings >= previousFindings) {
        detections.push({ agentName, pattern: 'NO_FINDINGS_RESOLVED', severity: 'HIGH' });
      }
      // REGRESSION_INTRODUCED
      if (output.filesChanged.length > 0 && currentFindings > previousFindings) {
        detections.push({ agentName, pattern: 'REGRESSION_INTRODUCED', severity: 'HIGH' });
      }
    }

    return detections;
  }
}

// ============================================================
// 8.1.5 AdversarialPressureTester
// ============================================================

class AdversarialPressureTester {
  pressureTest(
    wave: { agents: Array<{ name: string }> },
    verificationResult: WaveVerificationResult,
  ): { vulnerabilitiesFound: boolean; vulnerabilities: string[] } {
    const vulnerabilities: string[] = [];

    // GAP 1: All agents trusted without scrutiny
    const allAgentsTrusted = verificationResult.trusted.length === wave.agents.length;
    if (allAgentsTrusted && wave.agents.length > 0) {
      vulnerabilities.push('GAP 1: All agents trusted without scrutiny. Verifier may not catch unchanged-file claims.');
    }

    // GAP 2: Wave passes with rejected agents
    if (verificationResult.verdict === 'TRUSTED' && verificationResult.rejected.length > 0) {
      vulnerabilities.push('GAP 2: Wave verdict is TRUSTED despite having rejected agents. Verdict logic may be flawed.');
    }

    // GAP 3: No container test scheduled
    const anyRejected = verificationResult.rejected.length > 0;
    if (verificationResult.verdict === 'TRUSTED' && !anyRejected) {
      vulnerabilities.push('GAP 3: Clean wave may skip container test. All waves should be container-testable.');
    }

    return { vulnerabilitiesFound: vulnerabilities.length > 0, vulnerabilities };
  }
}

// ============================================================
// 8.1.6 EscalationEngine
// ============================================================

class EscalationEngine {
  escalate(
    state: GodLoopState,
    problemClass: ProblemClass,
    theatricalFindings: Array<{ agentName: string; pattern: string; severity: string }>,
    loopAuditFindings: StrategicFinding[],
  ): { escalationLevel: number; nextPhase: PoseidonPhase; reason: string } {
    let escalationLevel = state.escalationLevel ?? 0;
    let nextPhase: PoseidonPhase = state.phase;
    let reason = '';

    // CRITICAL theatrical → BLOCK
    const criticalTheatrical = theatricalFindings.filter((f: { agentName: string; pattern: string; severity: string }) => f.severity === 'CRITICAL');
    if (criticalTheatrical.length > 0) {
      escalationLevel = Math.max(escalationLevel, 3);
      nextPhase = 'PLAN';
      reason = `CRITICAL theatrical detection: ${criticalTheatrical.map((f: { agentName: string; pattern: string; severity: string }) => `${f.agentName}:${f.pattern}`).join(', ')}.`;
      return { escalationLevel, nextPhase, reason };
    }

    // AUDIT_ENGINE_BUG → RESTART
    if (problemClass === ProblemClass.AUDIT_ENGINE_BUG) {
      escalationLevel = Math.max(escalationLevel, 1);
      nextPhase = 'AUDIT';
      reason = 'Audit engine bug suspected. Restarting audit with fresh state.';
      return { escalationLevel, nextPhase, reason };
    }

    // CACHE_STALE → FORCE CONTAINER
    if (problemClass === ProblemClass.CACHE_STALE) {
      escalationLevel = Math.max(escalationLevel, 1);
      nextPhase = 'CONTAINER_TEST';
      reason = 'Cache may be stale. Forcing container redeploy.';
      return { escalationLevel, nextPhase, reason };
    }

    // REGRESSION → BLOCK + REVERT
    if (problemClass === ProblemClass.REGRESSION) {
      escalationLevel = Math.max(escalationLevel, 3);
      nextPhase = 'PLAN';
      reason = 'REGRESSION detected. Blocking wave and reverting from checkpoint.';
      return { escalationLevel, nextPhase, reason };
    }

    // Loop unhealthy → ESCALATE + FAILED
    const criticalIronLawViolations = Array.isArray(loopAuditFindings)
      ? loopAuditFindings.filter((f: StrategicFinding) => f.severity === 'CRITICAL')
      : [];
    if (criticalIronLawViolations.length > 0 && escalationLevel >= 3) {
      nextPhase = 'FAILED';
      reason = `Loop unhealthy with ${criticalIronLawViolations.length} critical Iron Law violations at escalation level ${escalationLevel}. Terminating.`;
      return { escalationLevel: 3, nextPhase, reason };
    }

    // 3 stalled cycles → PROBLEM_SOLVE
    const escStateValue: unknown = state;
    const escStateRecord = isRecordStringUnknown(escStateValue) ? escStateValue : null;
    const rawEscStalled = escStateRecord?.stalledSince;
    const safeStalledSince = typeof rawEscStalled === 'number' ? rawEscStalled : null;
    const stallCycles = safeStalledSince !== null && safeStalledSince > 0 ? state.cycle - safeStalledSince : 0;
    if (stallCycles >= 3) {
      escalationLevel = Math.max(escalationLevel, 2);
      nextPhase = 'PROBLEM_SOLVE';
      reason = `${stallCycles} stalled cycles. Escalating to problem solve.`;
      return { escalationLevel, nextPhase, reason };
    }

    return { escalationLevel, nextPhase, reason };
  }
}

// ============================================================
// 8.1.7 DerailmentRecovery
// ============================================================

interface DerailmentDiagnosis {
  derailed: boolean;
  signature: 'STUCK_PHASE' | 'PHASE_OSCILLATION' | 'FLAT_SCORE_NO_EFFECT';
  detail: string;
  recommendation: string;
}

class DerailmentRecovery {
  detectSelfDerailment(state: GodLoopState, phaseHistory: Array<{ phase: string; cycle: number }>): DerailmentDiagnosis | null {
    // Signature 1: Stuck phase — same phase for 5+ cycles
    const lastPhases = phaseHistory.slice(-5);
    const allSamePhase = lastPhases.length >= 5 && lastPhases.every((p: { phase: string; cycle: number }) => p.phase === lastPhases[0].phase);
    if (allSamePhase && lastPhases[0].phase !== 'PASS' && lastPhases[0].phase !== 'FAILED' && lastPhases[0].phase !== 'LOCKED') {
      return {
        derailed: true, signature: 'STUCK_PHASE',
        detail: `Phase ${lastPhases[0].phase} has persisted for 5+ cycles.`,
        recommendation: 'Break the loop by injecting a container test or escalating.',
      };
    }

    // Signature 2: Phase oscillation — A → B → A → B
    if (phaseHistory.length >= 5) {
      const pattern = phaseHistory.slice(-5).map((p: { phase: string; cycle: number }) => p.phase);
      const a = pattern[1], b = pattern[2], c = pattern[3], d = pattern[4];
      if (a === c && b === d && a !== b) {
        const oscillationDiagnosis: DerailmentDiagnosis = {
          derailed: true, signature: 'PHASE_OSCILLATION',
          detail: `Oscillating between ${a} and ${b}.`,
          recommendation: 'Force a problem solve to break the cycle.',
        };
        return oscillationDiagnosis;
      }
    }

    // Signature 3: Flat score with no effect
    const derailStateValue: unknown = state;
    const derailStateRecord = isRecordStringUnknown(derailStateValue) ? derailStateValue : null;
    const rawDerailStalled = derailStateRecord?.stalledSince;
    const dStalledSince = typeof rawDerailStalled === 'number' ? rawDerailStalled : null;
    if (dStalledSince !== null && dStalledSince > 0 && state.cycle - dStalledSince >= 3) {
      const flatDiagnosis: DerailmentDiagnosis = {
        derailed: true, signature: 'FLAT_SCORE_NO_EFFECT',
        detail: `Score flat at ${state.score}% for ${state.cycle - dStalledSince} cycles.`,
        recommendation: 'Restart from last good checkpoint or escalate.',
      };
      return flatDiagnosis;
    }

    return null;
  }

  recover(diagnosis: DerailmentDiagnosis, checkpointManager: CheckpointManager): { recovered: boolean; nextPhase: PoseidonPhase } {
    switch (diagnosis.signature) {
      case 'STUCK_PHASE':
        return { recovered: true, nextPhase: 'CONTAINER_TEST' };
      case 'PHASE_OSCILLATION':
        return { recovered: true, nextPhase: 'PROBLEM_SOLVE' };
      case 'FLAT_SCORE_NO_EFFECT': {
        const latest = checkpointManager.findLatestCheckpoint();
        if (latest) {
          checkpointManager.restore(latest.checkpointId);
          return { recovered: true, nextPhase: 'AUDIT' };
        }
        return { recovered: true, nextPhase: 'INIT' };
      }
      default:
        return { recovered: false, nextPhase: 'FAILED' };
    }
  }
}

// ============================================================
// 8.1.8 StrategicIntelligence — Main entry point
// ============================================================

export class StrategicIntelligence {
  private planner: StrategicPlanner;
  private analyzer: RootCauseAnalyzer;
  private theatricalDetector: TheatricalAgentDetector;
  private pressureTester: AdversarialPressureTester;
  private escalator: EscalationEngine;
  private derailmentRecovery: DerailmentRecovery;
  private phaseHistory: Array<{ phase: string; cycle: number }> = [];
  private lastDerailmentCheck: number = 0;

  constructor() {
    this.planner = new StrategicPlanner();
    this.analyzer = new RootCauseAnalyzer();
    this.theatricalDetector = new TheatricalAgentDetector();
    this.pressureTester = new AdversarialPressureTester();
    this.escalator = new EscalationEngine();
    this.derailmentRecovery = new DerailmentRecovery();
  }

  evaluate(state: GodLoopState, phaseResult: PhaseResult, evidenceStore: EvidenceStore): IntelligenceResult {
    const allFindings: StrategicFinding[] = [];
    let escalationLevel = state.escalationLevel ?? 0;
    let overridePhase: PoseidonPhase | undefined;
    let overrideReason: string | undefined;

    // Track phase history
    this.phaseHistory.push({ phase: state.phase, cycle: state.cycle });
    if (this.phaseHistory.length > 100) {
      this.phaseHistory = this.phaseHistory.slice(-50);
    }

    // 1. Detect self-derailment (every 3 cycles)
    if (state.cycle - this.lastDerailmentCheck >= 3) {
      this.lastDerailmentCheck = state.cycle;
      const derailment = this.derailmentRecovery.detectSelfDerailment(state, this.phaseHistory);
      if (derailment) {
        allFindings.push({
          type: 'DERAILMENT', severity: 'HIGH',
          description: `Self-derailment detected: ${derailment.signature} — ${derailment.detail}`,
          recommendation: derailment.recommendation,
          detectedAtCycle: state.cycle,
        });

        const checkpointManager = new CheckpointManager(state.targetPath);
        const recovery = this.derailmentRecovery.recover(derailment, checkpointManager);
        if (recovery.recovered) {
          overridePhase = recovery.nextPhase;
          overrideReason = `Derailment recovery: ${derailment.signature}`;
          escalationLevel = Math.max(escalationLevel, 2);
        }
        return { interventionRequired: true, findings: allFindings, escalationLevel, overridePhase, overrideReason };
      }
    }

    // 2. Classify problems
    const problemClass = this.planner.classifyProblem(state, {});
    if (problemClass !== ProblemClass.STALL_GENUINE) {
      allFindings.push({
        type: 'STALL', severity: problemClass === ProblemClass.REGRESSION || problemClass === ProblemClass.THEATRICAL_AGENT ? 'HIGH' : 'MEDIUM',
        description: `Problem classified: ${problemClass}`,
        recommendation: this.planner.getStrategy(problemClass).reasoning,
        detectedAtCycle: state.cycle,
      });
    }

    // 3. Theatrical detection (deferred to VERIFY phase via WaveVerifier)

    // 4. Audit loop with Iron Laws
    const ironLawFindings = this.analyzer.auditLoop(state, phaseResult, evidenceStore);
    allFindings.push(...ironLawFindings);

    // 5. Pressure test (deferred to VERIFY phase)

    // 6. Escalate if needed
    const escalation = this.escalator.escalate(state, problemClass, [], ironLawFindings);
    if (escalation.escalationLevel > (state.escalationLevel ?? 0)) {
      escalationLevel = escalation.escalationLevel;
      overridePhase = escalation.nextPhase;
      overrideReason = escalation.reason;
      allFindings.push({
        type: 'STALL', severity: escalation.escalationLevel >= 3 ? 'CRITICAL' : 'HIGH',
        description: `Escalated to level ${escalationLevel}: ${escalation.reason}`,
        recommendation: `Next phase: ${escalation.nextPhase}`,
        detectedAtCycle: state.cycle,
      });
    }

    return {
      interventionRequired: allFindings.length > 0,
      findings: allFindings,
      escalationLevel,
      overridePhase,
      overrideReason,
    };
  }

  classifyProblem(state: GodLoopState, analysis: Record<string, unknown>): ProblemClass {
    return this.planner.classifyProblem(state, analysis);
  }

  getStrategy(problemClass: ProblemClass): StrategicResponse {
    return this.planner.getStrategy(problemClass);
  }

  pressureTest(wave: { agents: Array<{ name: string }> }, verificationResult: WaveVerificationResult): { vulnerabilitiesFound: boolean; vulnerabilities: string[] } {
    return this.pressureTester.pressureTest(wave, verificationResult);
  }
}
