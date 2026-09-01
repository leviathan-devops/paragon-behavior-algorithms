import {AuditFinding, AuditResult, confidenceLabel} from '../audit-engine/types.ts';
import { shortFile } from '../utils.js';

export function generateCodeReviewArtifact(
  result: AuditResult,
  targetPath: string,
  projectName: string,
  agentName: string
): string {
  const critical = result.findings.filter((f: AuditFinding) => f.severity === 'CRITICAL');
  const high = result.findings.filter((f: AuditFinding) => f.severity === 'HIGH');
  const medium = result.findings.filter((f: AuditFinding) => f.severity === 'MEDIUM');
  const low = result.findings.filter((f: AuditFinding) => f.severity === 'LOW');
  const ts = new Date().toISOString();
  const dist = result.confidenceDistribution;
  const total = dist.definite + dist.high + dist.moderate + dist.low + dist.noise;

  let a = `# TRIDENT CODE AUDIT — ${projectName}\n\n`;
  a += `**Score:** ${result.score}/100 — ${result.grade}\n`;

  if (total > 0) {
    const avgConf = result.findings.reduce((s: number, f: AuditFinding) => s + f.confidence, 0) / result.findings.length;
    const fpEstimate = result.findings.filter((f: AuditFinding) => f.confidence < 0.70).length;
    a += `**Confidence Distribution:** `;
    a += `${dist.definite} Definite | ${dist.high} High | ${dist.moderate} Moderate | ${dist.low + dist.noise} Low/Noise\n`;
    a += `**Average Confidence:** ${avgConf.toFixed(2)} — Estimated false positives: ${fpEstimate}\n`;
  }

  a += `**Files:** ${result.sourceFilesScanned} source | ${result.filesScanned} total\n`;
  a += `**Findings:** ${critical.length} CRIT | ${high.length} HIGH | ${medium.length} MED | ${low.length} LOW\n`;
  a += `**Timestamp:** ${ts}\n\n`;

  const passing = result.layers.filter((l: AuditResult['layers'][number]) => l.findingCount === 0).length;
  const failing = result.layers.filter((l: AuditResult['layers'][number]) => l.findingCount > 0).length;
  a += `## 1. Executive Summary\n\n`;
  a += `${projectName} scores ${result.score}/100 (${result.grade}). `;
  a += `${critical.length > 0 ? critical.length + ' critical blockers prevent first-attempt deployment. ' : 'No critical blockers found. '}`;
  a += `${high.length > 0 ? high.length + ' high-severity issues will fail container testing. ' : ''}`;
  a += `${failing}/${result.layers.length} audit layers flagged issues. `;
  a += `Estimated fix effort: ${estimatePhases(critical.length, high.length, medium.length)} phases.\n\n`;

  a += `## 2. Mechanical Evidence\n\n`;
  a += `| Check | Result | Detail |\n`;
  a += `|-------|--------|--------|\n`;
  for (const f of result.preflight.findings) {
    a += `| ${f.check} | ${f.passed ? 'PASS' : 'FAIL'} | ${f.detail} |\n`;
  }
  a += `\n`;

  a += `## 3. Confidence Distribution\n\n`;
  a += `| Range | Count | % |\n`;
  a += `|-------|-------|----|\n`;
  if (total > 0) {
    a += `| 0.95-1.00 (Definite) | ${dist.definite} | ${((dist.definite / total) * 100).toFixed(1)}% |\n`;
    a += `| 0.85-0.94 (High) | ${dist.high} | ${((dist.high / total) * 100).toFixed(1)}% |\n`;
    a += `| 0.70-0.84 (Moderate) | ${dist.moderate} | ${((dist.moderate / total) * 100).toFixed(1)}% |\n`;
    a += `| < 0.70 (Low/Noise) | ${dist.low + dist.noise} | ${(((dist.low + dist.noise) / total) * 100).toFixed(1)}% |\n`;
  }
  a += `\n*(Findings below 0.70 confidence are excluded from scoring)*\n\n`;

  a += `## 4. Findings Index\n\n`;
  a += `| # | Conf | Sev | Layer | File:Line | Category | Description |\n`;
  a += `|---|---|---|---|---|---|---|\n`;
  const all = [...critical, ...high, ...medium, ...low];
  all.forEach((f: AuditFinding, i: number): void => {
    const short = f.description.length > 80 ? f.description.substring(0, 77) + '...' : f.description;
    a += `| ${i + 1} | ${f.confidence.toFixed(2)} | ${f.severity.substring(0, 4)} | ${f.layer} | ${shortFile(f.file)}:${f.line} | ${f.category} | ${short} |\n`;
  });
  a += `\n`;

  if (critical.length > 0) {
    a += `## 5. CRITICAL — Prevents Deployment\n\n`;
    for (const f of critical) { a += formatDetailedFinding(f); }
  }

  if (high.length > 0) {
    a += `## 6. HIGH — Will Fail Container Test\n\n`;
    for (const f of high) { a += formatDetailedFinding(f); }
  }

  if (medium.length > 0) {
    a += `## 7. MEDIUM — Quality Issues\n\n`;
    for (const f of medium.slice(0, 15)) { a += formatDetailedFinding(f); }
    if (medium.length > 15) a += `\n... and ${medium.length - 15} more medium findings\n\n`;
  }

  a += `## Fix Prioritization\n\n`;
  a += `| Phase | Scope | Findings | Score Gain | Confidence |\n`;
  a += `|-------|-------|----------|------------|------------|\n`;
  a += `| 1 | Build | R0 | ${countByLayer(result, 'R0')} | +${gainByLayer(result, 'R0')} | ${avgConfByLayer(result, 'R0')} |\n`;
  a += `| 2 | Deploy | R5,R7 | ${countByLayers(result, ['R5','R7'])} | +${gainByLayers(result, ['R5','R7'])} | ${avgConfByLayers(result, ['R5','R7'])} |\n`;
  a += `| 3 | Hooks | R1,R12 | ${countByLayers(result, ['R1','R12'])} | +${gainByLayers(result, ['R1','R12'])} | ${avgConfByLayers(result, ['R1','R12'])} |\n`;
  a += `| 4 | Core | R2,R10,R11 | ${countByLayers(result, ['R2','R10','R11'])} | +${gainByLayers(result, ['R2','R10','R11'])} | ${avgConfByLayers(result, ['R2','R10','R11'])} |\n`;
  a += `| 5 | Robustness | R3,R2,R9 | ${countByLayers(result, ['R3','R2','R9'])} | +${gainByLayers(result, ['R3','R2','R9'])} | ${avgConfByLayers(result, ['R3','R2','R9'])} |\n`;
  a += `| 6 | Quality | R6,R3 | ${countByLayers(result, ['R6','R3'])} | +${gainByLayers(result, ['R6','R3'])} | ${avgConfByLayers(result, ['R6','R3'])} |\n`;
  a += `| 7 | Re-audit | All | — | — | — |\n\n`;

  a += `## Layer Summary\n\n`;
  a += `| Layer | Name | Findings | Avg Confidence | Evidence Suppressed |\n`;
  a += `|-------|------|----------|---------------|--------------------|\n`;
  for (const l of result.layers) {
    a += `| ${l.layer} | ${l.name} | ${l.findingCount} | ${l.avgConfidence.toFixed(2)} | ${l.evidenceSuppressed ? 'YES' : 'no'} |\n`;
  }
  a += `\n`;

  a += `## Audit Meta — Transparency Report\n\n`;
  a += `| Metric | Value |\n`;
  a += `|--------|-------|\n`;
  a += `| Call Graph Coverage | ${result.auditMeta.callGraphCoverage}% (${result.auditMeta.resolvedCallSites}/${result.auditMeta.totalCallSites} resolved) |\n`;
  a += `| Type Checker | ${result.auditMeta.checkerAvailable ? 'Available' : 'UNAVAILABLE'} |\n`;
  a += `| Self-Audit | ${result.auditMeta.selfAudit ? 'YES — cannot find bugs in itself' : 'No'} |\n`;
  a += `| Suppressed Below Floor | ${result.auditMeta.suppressedBelowFloor} |\n`;
  a += `\n`;

  if (result.auditMeta.blindSpots.length > 0) {
    a += `### Known Blind Spots\n\n`;
    for (const bs of result.auditMeta.blindSpots) {
      a += `- **WARNING:** ${bs}\n`;
    }
    a += `\n`;
  }

  if (result.suppressedFindings.length > 0) {
    a += `### Suppressed Findings (confidence < 0.50)\n\n`;
    a += `| Layer | Sev | File:Line | Confidence | Description |\n`;
    a += `|-------|-----|-----------|------------|-------------|\n`;
    for (const sf of result.suppressedFindings.slice(0, 15)) {
      a += `| ${sf.layer} | ${sf.severity.substring(0, 4)} | ${shortFile(sf.file)}:${sf.line} | ${sf.confidence.toFixed(2)} | ${sf.description.substring(0, 60)} |\n`;
    }
    if (result.suppressedFindings.length > 15) {
      a += `\n... and ${result.suppressedFindings.length - 15} more suppressed\n`;
    }
    a += `\n`;
  }

  a += `## Verification Checklist\n\n`;
  a += generateVerificationChecklist(result);
  a += `- [ ] Re-run audit — expect score ≥ 80\n`;
  a += `\n`;

  a += `---\n*Generated by Trident v4.3 AST-Powered Code Review Engine*\n`;
  a += `*Confidence-weighted | Call-graph-aware | Mechanical-evidence-gated*\n`;
  return a;
}

function formatDetailedFinding(f: AuditFinding): string {
  let s = `### [${f.layer}] ${f.category} — ${f.severity} (confidence: ${f.confidence.toFixed(2)} — ${confidenceLabel(f.confidence)})\n\n`;
  s += `| Field | Value |\n`;
  s += `|-------|-------|\n`;
  s += `| **File** | \`${shortFile(f.file)}:${f.line}\` |\n`;
  if (f.constructType) s += `| **AST Construct** | ${f.constructType} |\n`;
  if (f.callGraphRef) s += `| **Call Graph** | ${f.callGraphRef} |\n`;
  s += `| **Evidence** | \`${f.evidence.substring(0, 120)}\` |\n`;
  s += `| **Problem** | ${f.description} |\n`;
  s += `| **Runtime Impact** | ${f.runtimeImpact} |\n`;
  s += `| **Fix** | ${f.correction} |\n`;
  if (f.evidenceSuppressed) s += `| **Evidence Suppressed** | YES — preflight contradicts |\n`;
  s += `\n`;
  return s;
}

function generateVerificationChecklist(result: AuditResult): string {
  const checks: string[] = [];

  const critical = result.findings.filter((f: AuditFinding) => f.severity === 'CRITICAL');
  const high = result.findings.filter((f: AuditFinding) => f.severity === 'HIGH');

  for (const f of critical) {
    checks.push(`Fix ${f.layer}-C: ${f.description.substring(0, 60)} at ${shortFile(f.file)}:${f.line}`);
  }
  for (const f of high) {
    checks.push(`Fix ${f.layer}-H: ${f.description.substring(0, 60)} at ${shortFile(f.file)}:${f.line}`);
  }

  checks.push('Run tsc --noEmit — expect 0 errors');
  checks.push('Run bun run build — expect single-file output');
  checks.push('Container TUI: identity injection PASS');
  checks.push('Container TUI: tool block PASS');
  checks.push('Container TUI: all 8 tools registered');

  return checks.map(c => `- [ ] ${c}\n`).join('');
}

function estimatePhases(crit: number, high: number, med: number): number {
  let p = 0;
  if (crit > 0) p++;
  if (high > 0) p++;
  if (med > 0) p += Math.ceil(med / 10);
  return Math.max(p, 1);
}

function countByLayer(result: AuditResult, layer: string): number {
  return result.findings.filter((f: AuditFinding) => f.layer === layer).length;
}

function countByLayers(result: AuditResult, layers: string[]): number {
  return result.findings.filter((f: AuditFinding) => layers.includes(f.layer)).length;
}

function gainByLayer(result: AuditResult, layer: string): number {
  return result.findings.filter((f: AuditFinding) => f.layer === layer).reduce((s: number, f: AuditFinding) => {
    const w = f.severity === 'CRITICAL' ? 15 : f.severity === 'HIGH' ? 8 : f.severity === 'MEDIUM' ? 3 : 1;
    return s + Math.round(w * f.confidence);
  }, 0);
}

function gainByLayers(result: AuditResult, layers: string[]): number {
  return layers.reduce((s, l) => s + gainByLayer(result, l), 0);
}

function avgConfByLayer(result: AuditResult, layer: string): string {
  const findings = result.findings.filter((f: AuditFinding) => f.layer === layer);
  if (findings.length === 0) return '—';
  return (findings.reduce((s: number, f: AuditFinding) => s + f.confidence, 0) / findings.length).toFixed(2);
}

function avgConfByLayers(result: AuditResult, layers: string[]): string {
  const findings = result.findings.filter((f: AuditFinding) => layers.includes(f.layer));
  if (findings.length === 0) return '—';
  return (findings.reduce((s: number, f: AuditFinding) => s + f.confidence, 0) / findings.length).toFixed(2);
}
