// t1-brief-builder.ts — Builds the brief for T1 Injectable generation.
// T1 is anti-pattern-first: WRONG code → RIGHT code pairs, troubleshooting matrix, quick reference.

import type { AnalysisResult } from './analysis-engine.ts';
import type { DiscoveryResult } from '../shared/auto-discover.js';
import type { L2Strategy } from './l2-strategy.ts';

export function buildT1Brief(
  analysis: AnalysisResult,
  discovery: DiscoveryResult,
  strategy: L2Strategy,
  agentName: string,
): string {
  let brief = '';
  brief += `# T1 INJECTABLE BRIEF — ${agentName}\n\n`;
  brief += `Write a T1 operations injectable. Runtime guide for the build agent.\n`;
  brief += `Anti-pattern-first. SHORT. ACTIONABLE. Code-heavy.\n\n`;

  brief += `## THREATS\n`;
  for (const t of analysis.threats) {
    const tt = t;
    brief += `- ${tt.pattern} (${tt.severity}, ${tt.findings?.length || 0} instances)\n`;
    if (tt.defeatVectors?.length) {
      brief += `  Defeat: ${tt.defeatVectors.join('; ')}\n`;
    }
  }

  brief += `\n## DEFENSES\n`;
  for (const d of analysis.defenses) {
    const dd = d;
    brief += `- ${dd.rule} — ${dd.checkMethod}, threshold: ${dd.thresholds?.failThreshold?.value}\n`;
  }

  if (discovery.failureModes?.length > 0) {
    brief += `\n## KNOWN FAILURE MODES\n`;
    for (const fm of discovery.failureModes.slice(0, 8)) {
      brief += `- ${fm.message} (${fm.file}:${fm.line})\n`;
    }
  }

  if (discovery.patterns?.length > 0) {
    brief += `\n## DISCOVERED PATTERNS\n`;
    for (const p of discovery.patterns.slice(0, 10)) {
      brief += `- ${p.type} — ${p.name} (${p.file}:${p.line})\n`;
    }
  }

  brief += `\n## DEFENSE PIPELINE (for implementation order section)\n`;
  for (const phase of (analysis.pipeline?.phases || [])) {
    const ph = phase;
    brief += `${ph.domain}: ${ph.defenses?.join(', ')} (${ph.executionModel})\n`;
  }

  brief += `\n## INSTRUCTIONS\n\n`;
  brief += `Write the T1 injectable NOW. Output ONLY markdown.\n`;
  brief += `Start with "# ${agentName.toUpperCase()} OPERATIONS DIRECTIVE"\n\n`;
  brief += `STRUCTURE:\n\n`;
  brief += `## Anti-Patterns (WRONG → RIGHT)\n`;
  brief += `Write at LEAST 5 WRONG/RIGHT pairs — one per threat pattern detected.\n`;
  brief += `Each pair MUST have a \`### [PATTERN_NAME] — [Description]\` heading.\n`;
  brief += `Format:\n`;
  brief += `### DEAD_CODE — Phantom Export\n`;
  brief += '```typescript\n// WRONG — [specific broken code pattern from analysis]\n// Use REAL patterns from the findings above\n```\n';
  brief += '```typescript\n// RIGHT — [specific corrected code]\n// Real replacement code\n```\n\n';
  brief += `## Troubleshooting Matrix\n`;
  brief += `The Troubleshooting Matrix MUST have at LEAST 5 rows with SPECIFIC symptoms\n`;
  brief += `(not generic like 'something breaks').\n`;
  brief += `| Symptom | Cause | Fix |\n|---------|-------|-----|\n`;
  brief += `| [Specific Symptom] | [Root Cause] | [Specific Fix Command] |\n\n`;
  brief += `## Key Configuration\n`;
  brief += `| Config | Value | Effect |\n|--------|-------|--------|\n\n`;
  brief += `## Implementation Order\n`;
  brief += `Numbered list from the defense pipeline above\n\n`;
  brief += `RULES:\n`;
  brief += `- Each WRONG/RIGHT pair MUST use REAL code patterns from the analysis\n`;
  brief += `- Maximum 300 lines\n`;
  brief += `- NO prose paragraphs. Bullets + code blocks ONLY.\n`;
  brief += `- NO "implement actual logic" or "add proper error handling"\n`;
  brief += `- Every entry in the troubleshooting matrix must be SPECIFIC (not generic)\n\n`;

  return brief;
}
