/**
 * FIX PRIORITIZER
 *
 * Orders findings by dependency — you can't test hooks until the build works.
 */

import { AuditFinding, AuditResult } from './types.ts';

interface FixPhase {
  phase: number;
  name: string;
  description: string;
  layers: string[];
  findings: AuditFinding[];
  scoreImprovement: number;
  afterFixCommands: string[];
  blocksPhases: number[];
}

export function prioritizeFixes(result: AuditResult): FixPhase[] {
  const phases: FixPhase[] = [];
  const allFindings = [...result.findings];

  const phaseDefs = [
    {
      phase: 1, name: 'Build Chain', description: 'Fix build system first — must build before anything else',
      layers: ['R0'], afterFixCommands: ['bun run build', 'bun run build:check'],
      blocksPhases: [2, 3, 4, 5, 6, 7], scoreGroup: 15,
    },
    {
      phase: 2, name: 'Deployment & Config', description: 'Enable container deployment — must deploy before testing',
      layers: ['R5', 'R7'], afterFixCommands: ['docker run --rm opencode-test:1.14.34 ls'],
      blocksPhases: [3, 4, 5, 6], scoreGroup: 15,
    },
    {
      phase: 3, name: 'Hook Contract', description: 'Fix hook implementations — must work before testing behavior',
      layers: ['R1', 'R12'], afterFixCommands: ['bun run build', 'deploy to container', 'TUI: "who are you"'],
      blocksPhases: [4, 6], scoreGroup: 15,
    },
    {
      phase: 4, name: 'Core Logic', description: 'Fix state machines and invocation — core behavior must be correct',
      layers: ['R2', 'R10', 'R11'], afterFixCommands: ['bun run build', 'bun test (if available)'],
      blocksPhases: [5, 6], scoreGroup: 12,
    },
    {
      phase: 5, name: 'Robustness', description: 'Fix error handling and runtime contract — make it resilient',
      layers: ['R3', 'R2', 'R9'], afterFixCommands: ['bun run build', 'bun run build:check'],
      blocksPhases: [6, 7], scoreGroup: 10,
    },
    {
      phase: 6, name: 'Quality', description: 'Fix dependency integrity, source hygiene',
      layers: ['R6', 'R3'], afterFixCommands: ['bun run build:check'],
      blocksPhases: [7], scoreGroup: 5,
    },
    {
      phase: 7, name: 'Self-Audit', description: 'Re-audit to verify score improved',
      layers: [], afterFixCommands: ['Re-run Trident v4.3 audit'],
      blocksPhases: [], scoreGroup: 0,
    },
  ];

  for (const def of phaseDefs) {
    const phaseFindings = allFindings.filter((f: AuditFinding) => def.layers.includes(f.layer));
    const critical = phaseFindings.filter((f: AuditFinding) => f.severity === 'CRITICAL').length;
    const high = phaseFindings.filter((f: AuditFinding) => f.severity === 'HIGH').length;
    const medium = phaseFindings.filter((f: AuditFinding) => f.severity === 'MEDIUM').length;

    // E17: Score improvement includes confidence and evidence factor
    let scoreImprovement = 0;
    for (const f of phaseFindings) {
      const evidenceFactor = f.evidenceSuppressed ? 0.1 : 1.0;
      const baseScore = f.severity === 'CRITICAL' ? def.scoreGroup :
                        f.severity === 'HIGH' ? 8 :
                        f.severity === 'MEDIUM' ? 3 : 1;
      scoreImprovement += Math.round(baseScore * f.confidence * evidenceFactor);
    }

    if (phaseFindings.length > 0 || def.phase === 7) {
      phases.push({
        phase: def.phase,
        name: def.name,
        description: def.description,
        layers: def.layers,
        findings: phaseFindings,
        scoreImprovement: def.phase === 7 ? 5 : scoreImprovement,
        afterFixCommands: def.afterFixCommands,
        blocksPhases: def.blocksPhases,
      });
    }
  }

  return phases;
}

export function generateFixSummary(phases: FixPhase[], currentScore: number): string {
  let summary = `## FIX PRIORITIZATION — Dependency-Ordered Action Plan\n\n`;
  summary += `**Current Score:** ${currentScore}/100\n`;
  summary += `**Phases:** ${phases.length} (fix in order — each phase unblocks the next)\n\n`;
  summary += `---\n\n`;

  for (const phase of phases) {
    const critical = phase.findings.filter((f: AuditFinding) => f.severity === 'CRITICAL').length;
    const high = phase.findings.filter((f: AuditFinding) => f.severity === 'HIGH').length;
    const medium = phase.findings.filter((f: AuditFinding) => f.severity === 'MEDIUM').length;

    summary += `### Phase ${phase.phase}: ${phase.name}\n`;
    summary += `**${phase.description}**\n\n`;
    summary += `| Severity | Count | Score Fix |\n`;
    summary += `|----------|-------|----------|\n`;

    if (critical > 0) summary += `| CRITICAL | ${critical} | +${critical * 15} |\n`;
    if (high > 0) summary += `| HIGH | ${high} | +${high * 8} |\n`;
    if (medium > 0) summary += `| MEDIUM | ${medium} | +${medium * 3} |\n`;
    summary += `\n**Total Score Improvement:** +${phase.scoreImprovement}\n`;
    summary += `**After fixing, run:** \`${phase.afterFixCommands.join(' && ')}\`\n\n`;

    if (phase.findings.length > 0) {
      for (const f of phase.findings) {
        summary += `- [${f.layer}] \`${f.file}:${f.line}\` — ${f.description.substring(0, 100)}\n`;
      }
    } else if (phase.phase === 7) {
      summary += `- Re-run audit with: "audit this project"\n`;
      summary += `- Compare scores — should be ≥ 80 (NEAR RUNTIME GRADE or better)\n`;
    }
    summary += `\n`;
  }

  summary += `---\n`;
  summary += `**Target:** Complete phases 1-7 to achieve RUNTIME GRADE (95+).\n`;
  summary += `Each phase unblocks the next — follow the order exactly.\n`;

  return summary;
}
