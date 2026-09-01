// shared-llm-loop.ts — Common LLM generation loop used by ALL tools (L1/L2/L3/T1/T2).
// Each tool provides a brief + options, this function handles the LLM calls,
// quality checks, and revision loop.

import { generateSpecViaLLM } from './llm-generator.ts';
import { runDeepeningChecks, runCrossSectionAudit, formatDeepeningFeedback, formatAuditFeedback } from './l2-quality-audit.ts';
import type { CrossSectionAuditResult, DeepeningGap } from './l2-quality-audit.ts';
import type { AnalysisResult } from './analysis-engine.ts';
import type { L2Strategy } from './l2-strategy.ts';
import { tridentLog } from '../utils.js';

export interface LLMLoopOptions {
  useSplit: boolean;
  maxIterations: number;
  skipQualityChecks?: boolean;
  systemOverride?: string;
}

/**
 * Count REJECT-level issues from a CrossSectionAuditResult.
 * Each failed check (passed === false) counts as one REJECT-level issue.
 * WARN-only checks (passed === true) do not count.
 */
function countRejectAuditIssues(audit: CrossSectionAuditResult): number {
  let count = 0;
  const checks = audit.checks;
  const checkEntries = Object.values(checks) as Array<{ passed: boolean }>;
  for (const check of checkEntries) {
    if (!check.passed) count++;
  }
  return count;
}

export async function runInternalLLMLoop(
  brief: string,
  analysis: AnalysisResult | null,
  strategy: L2Strategy,
  options: LLMLoopOptions,
): Promise<string> {
  let generatedSpec = '';
  let lastFeedback = '';

  for (let iter = 1; iter <= options.maxIterations; iter++) {
    tridentLog('INFO', 'shared-llm-loop', `Iteration ${iter}/${options.maxIterations}`);
    try {
      generatedSpec = await generateSpecViaLLM(brief, lastFeedback || undefined, options.useSplit, options.systemOverride);
    } catch (llmErr: unknown) {
      tridentLog('ERROR', 'shared-llm-loop',
        `LLM failed iter ${iter}: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`);
      if (iter === options.maxIterations) throw llmErr;
      continue;
    }
    tridentLog('INFO', 'shared-llm-loop',
      `Iter ${iter}: ${generatedSpec.split('\n').length} lines`);

    if (options.skipQualityChecks || !analysis) break;

    const deepening = runDeepeningChecks(generatedSpec, analysis);
    const audit = runCrossSectionAudit(generatedSpec, analysis, strategy);

    // ── OPTIMIZATION 1: Early termination at 85%+ quality ──
    // Stop early when remaining issues are only WARN-level (no REJECT).
    const rejectCount = (deepening.gaps || []).filter((g: DeepeningGap & { severity?: string }) => g.severity === 'REJECT').length
      + countRejectAuditIssues(audit);
    const totalIssues = (deepening.gaps || []).length + audit.issueCount;
    const passRate = totalIssues > 0 ? 1 - (rejectCount / Math.max(totalIssues, 1)) : 1;

    if (deepening.passed && audit.passed) {
      tridentLog('INFO', 'shared-llm-loop', `Iter ${iter}: ALL CHECKS PASSED`);
      break;
    }
    if (rejectCount === 0 && passRate >= 0.85) {
      tridentLog('INFO', 'shared-llm-loop',
        `Iter ${iter}: 85%+ quality (0 REJECT issues, ${totalIssues} WARN) — accepting`);
      break;
    }

    const parts: string[] = [];
    if (!deepening.passed) parts.push(formatDeepeningFeedback(deepening));
    if (!audit.passed) parts.push(formatAuditFeedback(audit));
    lastFeedback = parts.join('\n\n');
    tridentLog('WARN', 'shared-llm-loop',
      `Iter ${iter}: ${deepening.gaps.length} gaps, ${audit.issueCount} issues, ${rejectCount} REJECT`);
  }
  return generatedSpec;
}
