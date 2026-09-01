/**
 * ContainerIntelligenceProbe — Generates intelligent, context-specific
 * analytical questions for the container agent based on God Loop state.
 *
 * The container agent is a DIAGNOSTIC DATA STREAM, not an audit runner.
 * This class crafts specific questions that force the agent to explore
 * the codebase and report real findings from real files.
 *
 * 30/70 Trust Model:
 *   - 30% trust container TUI text (analytical insights)
 *   - 70% trust mechanical disk evidence
 *   - Mechanical evidence ALWAYS overrules TUI text
 */

// Type-only definitions inlined to avoid circular dependency with god-loop.ts
// (god-loop.ts dynamically imports container-intelligence-probe.ts)
interface FindingSignature {
  file: string;
  line: number;
  layer: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  signature: string;
  correction: string;
  sourceHash: string;
  fileType: 'source' | 'bundle';
  status: 'pending' | 'planned' | 'in_progress' | 'fixed' | 'verified';
  firstSeenAt: number;
  lastSeenAt: number;
  fixAttempted: boolean;
  fixVerified: boolean;
}

interface WaveAgentSpec {
  agentId: string;
  agentType: string;
  targetFiles: string[];
  findings: FindingSignature[];
  contextT1Path: string;
  instructions: string;
}

interface WaveManifest {
  wave: number;
  agentCount: number;
  agents: WaveAgentSpec[];
  dependencyDag: string[][];
  preWaveHash: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

interface GodLoopState {
  phase: string;
  cycle: number;
  wave: number;
  score: number;
  highestScore: number;
  targetPath: string;
  evidenceRootHash: string;
  snapshotHash: string;
  postWaveHash: string;
  waveManifest: WaveManifest | null;
  preAuditFindings: FindingSignature[];
  postAuditFindings: FindingSignature[];
  stalledSince: number;
  error: string | null;
  startedAt: number;
  lastTransition: number;
  derailmentCount: number;
  contextBridgePath: string | null;
  planReference: string | null;
}

// R14 FIX: Module-level comparator avoids nested-return false positive in sort callback
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function severityCompare(a: FindingSignature, b: FindingSignature): number {
  return (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
}

export class ContainerIntelligenceProbe {

  /**
   * Generate a context-specific probe question based on God Loop state.
   * The question is ALWAYS specific and analytical — never generic.
   */
  generateProbe(state: GodLoopState): string {
    // Stall diagnosis — deepest analytical probe
    if (state.stalledSince >= 2) {
      return this.generateStallProbe(state);
    }

    // Post-audit analysis — ask agent to validate findings
    if ((state.phase === 'AUDIT_RECHECK' || state.phase === 'SCORE') &&
        state.preAuditFindings && state.preAuditFindings.length > 0) {
      return this.generateFindingAnalysisProbe(state);
    }

    // Post-wave verification — ask agent to check agent fixes
    if (state.phase === 'VERIFY' && state.waveManifest) {
      return this.generateWaveVerificationProbe(state);
    }

    // Default: general runtime health check
    return this.generateRuntimeHealthProbe(state);
  }

  /**
   * When stalled, ask the container agent to diagnose WHY progress stopped.
   */
  private generateStallProbe(state: GodLoopState): string {
    const topFindings = (state.preAuditFindings ?? [])
      .sort(severityCompare)
      .slice(0, 10);

    const findingLines = topFindings.map((f: FindingSignature): string =>
      `  - ${f.layer} ${f.severity}: ${f.file}:${f.line} — ${f.signature}`,
    ).join('\n');

    return `DIAGNOSTIC TASK: The God Loop has stalled at score ${state.score}/100 for ${state.stalledSince} cycles. ` +
      `I need your help diagnosing why progress has stopped.\n\n` +
      `Here are the top ${topFindings.length} unresolved findings:\n` +
      findingLines + '\n\n' +
      `For EACH finding, read the actual source file and tell me:\n` +
      `1. Is this a REAL issue or a FALSE POSITIVE? Explain why.\n` +
      `2. If real: what is the SPECIFIC fix? Quote the exact code that needs to change.\n` +
      `3. If false positive: what should the audit engine suppress?\n\n` +
      `Read the actual files at /plugin/src/. Do NOT guess. Quote real code.`;
  }

  /**
   * After audit, ask the container agent to analyze findings from its runtime perspective.
   */
  private generateFindingAnalysisProbe(state: GodLoopState): string {
    const criticalHigh = (state.preAuditFindings ?? [])
      .filter((f: FindingSignature): boolean => f.severity === 'critical' || f.severity === 'high')
      .slice(0, 8);

    if (criticalHigh.length === 0) return this.generateRuntimeHealthProbe(state);

    const analysisLines = criticalHigh.map((f: FindingSignature): string =>
      `File: /plugin/src/${f.file} (line ${f.line}, ${f.layer} ${f.severity})`,
    ).join('\n');

    return `ANALYSIS TASK: The mechanical audit found ${criticalHigh.length} critical/high findings. ` +
      `I need your first-hand perspective from inside the running codebase.\n\n` +
      `For each file listed below, READ the actual source and tell me:\n` +
      `1. Can you observe this issue at runtime? (Does it cause crashes, wrong behavior, etc.?)\n` +
      `2. What is the ROOT CAUSE — not just the symptom?\n` +
      `3. What is the MINIMAL fix that won't break other code?\n\n` +
      analysisLines + '\n\n' +
      `Be precise. Quote real code. Reference real line numbers. Do NOT hallucinate.`;
  }

  /**
   * After a build wave, ask the container agent to verify agent fixes are real.
   */
  private generateWaveVerificationProbe(state: GodLoopState): string {
    if (!state.waveManifest || !state.waveManifest.agents) {
      return this.generateRuntimeHealthProbe(state);
    }

    const allFiles = state.waveManifest.agents
      .flatMap((a: { targetFiles: string[] }): string[] => a.targetFiles);

    const fileList = allFiles.map((f: string): string => `  /plugin/src/${f}`).join('\n');

    return `VERIFICATION TASK: Build agents claim to have fixed ${allFiles.length} files. ` +
      `I need you to verify their work is REAL, not theatrical.\n\n` +
      `For each file below, READ it and tell me:\n` +
      `1. Did the file actually change? (Compare to what you'd expect from the fix description)\n` +
      `2. Is the fix SUBSTANTIVE (real code change) or THEATRICAL (just comments, logging, etc.)?\n` +
      `3. Did the fix introduce any NEW issues?\n\n` +
      `Files to check:\n` +
      fileList + '\n\n' +
      `Quote the actual code you see. Do NOT trust the agent's claims — verify with your own eyes.`;
  }

  /**
   * General runtime health check — what does the agent observe from inside?
   */
  private generateRuntimeHealthProbe(state: GodLoopState): string {
    return `RUNTIME HEALTH CHECK: You are running inside the Trident v4.4 plugin. ` +
      `Current God Loop state: phase=${state.phase}, cycle=${state.cycle}, score=${state.score}/100.\n\n` +
      `From your perspective INSIDE the running codebase:\n` +
      `1. What works correctly? (List specific tools/features that function)\n` +
      `2. What errors or crashes do you observe? (Check /tmp/opencode*.log if available)\n` +
      `3. What performance issues do you see? (Slow responses, timeouts)\n` +
      `4. What are the top 3 things that need fixing from your runtime perspective?\n\n` +
      `Be specific. Reference actual files, actual errors, actual behavior.`;
  }
}
