// pipeline-generator.ts — v4.4 deterministic pipeline extracted as standalone module
// This avoids function signature conflicts with the passthrough generateLayer2DetailedWorkflow
// All functions extracted from v4.4 deep-planning-artifact.ts

import { assessThreats } from './threat-modeler.ts';
import type { ThreatReport, ThreatFinding } from './threat-modeler.ts';
import { selectDefenses, THREAT_PATTERN_DIRECT_MAP } from './defense-catalog.ts';
import { formatThreshold } from './defense-catalog.ts';
import type { DefenseSpec, DefenseDomain } from './defense-catalog.ts';
import { orderPipeline } from './pipeline-orderer.ts';
import type { OrderedPipeline } from './pipeline-orderer.ts';
import { generateTypes } from './type-generator.ts';
import { generateAlgorithms } from './algorithm-generator.ts';
import { generateTests } from './test-generator.ts';
import type { TestSpec } from './test-generator.ts';
import type { DiscoveryResult } from '../shared/auto-discover.ts';
import type { RequirementSection } from './deep-planning-artifact.ts';
import type { CodeConstruct, CallGraph } from '../audit-engine/types.ts';
import { tridentLog } from '../utils.ts';


// ============================================================================
// LAYER 1: GENERATIVE PROMPT (internal function, 400-600 lines)
// ============================================================================

function generateLayer1Prompt(
  requirements: string,
  architecture: string,
  discovery?: DiscoveryResult | null
): string {
  let p = '';
  
  // v4.4.1: Actually USE the requirements and architecture parameters
  // These were previously accepted but completely ignored
  
  // Section 1: Problem Statement — FROM REQUIREMENTS
  p += '## 1. Problem Statement\n\n';
  if (requirements && requirements.length > 20) {
    p += requirements + '\n\n';
  } else {
    p += 'No specific requirements provided. Building from codebase discovery.\n\n';
  }
  
  // Section 2: Architecture — FROM ARCHITECTURE
  if (architecture && architecture.length > 20) {
    p += '## 2. Architecture\n\n';
    p += architecture + '\n\n';
  }
  
  // Section 3: Codebase Intelligence — from discovery
  if (discovery) {
    p += '## 3. Discovery Intelligence\n\n';
    const fileCount = typeof discovery.totalFiles === 'number' ? discovery.totalFiles : 'N/A';
    const totalLines = typeof discovery.totalLines === 'number' ? discovery.totalLines : 'N/A';
    p += `- **Files:** ${fileCount}\n`;
    p += `- **Lines:** ${totalLines}\n`;
    if (discovery.languages) {
      const langs = typeof discovery.languages === 'object' ? 
        Object.entries(discovery.languages as Record<string,number>).map(([k,v]) => `${k} (${v})`).join(', ') : 'unknown';
      p += `- **Languages:** ${langs}\n`;
    }
    if (discovery.warheads) p += `- **Warheads:** ${discovery.warheads}\n`;
    if (discovery.auditLayers) p += `- **Audit Layers:** ${discovery.auditLayers}\n`;
    p += '\n';
  }
  
  // Section 4: Core Insight
  p += '## 4. Core Insight\n\n';
  p += 'The implementation must produce runtime-grade software that works correctly in a ';
  p += 'real runtime environment — not just code that compiles. Every function follows P1-P10 ';
  p += 'principles. Every catch block handles errors. Every type validates at boundaries. ';
  p += 'Every resource cleans up in all paths.\n\n';
  
  // Section 5: Scope
  p += '## 5. Scope\n\n';
  if (requirements) {
    const lines = requirements.split('\n').filter(l => l.trim().length > 10);
    for (const line of lines.slice(0, 20)) {
      p += `- ${line.trim().substring(0, 200)}\n`;
    }
    p += '\n';
  }
  
  // Section 6: Success Criteria
  p += '## 6. Success Criteria\n\n';
  p += '| Criterion | Threshold |\n';
  p += '|-----------|----------|\n';
  p += '| TypeScript compilation | 0 errors |\n';
  p += '| Bundle build | Exit 0 |\n';
  p += '| Plugin loads | Runtime verification |\n';
  p += '| Tools respond | All registered tools return valid results |\n';
  p += '\n';
  
  return p;
}


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function safeIdent(name: string): string {
  if (!name || typeof name !== 'string') return 'unnamed';
  return name.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function safeClassName(name: string): string {
  const parts = safeIdent(name).split(/[-_]/);
  return parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

export function parseRequirementSections(requirements: string): RequirementSection[] {
  if (!requirements || requirements.length < 50) {
    return [{ title: 'Requirements', content: requirements, type: 'paragraph', subItems: [], hasCode: false, hasDiagram: false }];
  }

  // D-N deficiency markers (D-1:, D-2:, etc.) — split even when space-delimited
  // Insert newlines before D-N markers that appear mid-line so each becomes its own line
  const dPattern = /^D-(\d+):\s*/gm;
  // Also split mid-line D-N markers: "foo D-2: bar" → "foo\nD-2: bar"
  const preSplit = requirements.replace(/\s+(D-\d+:)/g, '\n$1');
  void dPattern; // referenced for documentation — the preSplit handles the actual splitting
  const lines = preSplit.split('\n');

  // --- PASS 1: Find all section boundaries ---
  interface Boundary {
    lineIndex: number;
    sectionType: RequirementSection['type'];
    sectionTitle: string;
  }

  const boundaries: Boundary[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Track code blocks — never detect headers inside code blocks
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (!trimmed) continue;

    // PART detection: "PART 1:" or "PART 1 —" or "## PART"
    const partMatch = trimmed.match(/^(?:##\s+)?PART\s+(\d+)[:\s—-]+(.+)/i);
    if (partMatch) {
      boundaries.push({
        lineIndex: i,
        sectionType: 'part',
        sectionTitle: `PART ${partMatch[1]}: ${partMatch[2].trim().substring(0, 80)}`,
      });
      continue;
    }

    // Deficiency detection: "D-1:" or "D-1 —"
    const defMatch = trimmed.match(/^(D-\d+)[:\s—-]+(.+)/);
    if (defMatch) {
      boundaries.push({
        lineIndex: i,
        sectionType: 'deficiency',
        sectionTitle: `${defMatch[1]}: ${defMatch[2].trim().substring(0, 80)}`,
      });
      continue;
    }

    // ## Header detection
    const headerMatch = trimmed.match(/^##\s+(.+)/);
    if (headerMatch) {
      boundaries.push({
        lineIndex: i,
        sectionType: 'header',
        sectionTitle: headerMatch[1].trim().substring(0, 80),
      });
      continue;
    }

    // ### Header detection
    const subHeaderMatch = trimmed.match(/^###\s+(.+)/);
    if (subHeaderMatch) {
      boundaries.push({
        lineIndex: i,
        sectionType: 'header',
        sectionTitle: subHeaderMatch[1].trim().substring(0, 80),
      });
      continue;
    }

    // Numbered item: "1." or "1)" at start
    const numMatch = trimmed.match(/^(\d+)[\.\)]\s+(.+)/);
    if (numMatch) {
      boundaries.push({
        lineIndex: i,
        sectionType: 'numbered',
        sectionTitle: trimmed.substring(0, 80),
      });
      continue;
    }
  }

  // If no boundaries found, return the whole text as one paragraph section
  if (boundaries.length === 0) {
    return [{ title: 'Requirements', content: requirements, type: 'paragraph', subItems: [], hasCode: false, hasDiagram: false }];
  }

  // --- PASS 2: Clip content between adjacent boundaries ---
  const sections: RequirementSection[] = [];

  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b].lineIndex;
    const end = b + 1 < boundaries.length ? boundaries[b + 1].lineIndex : lines.length;

    // Content is the lines from this boundary to the next (exclusive of next boundary)
    const contentLines = lines.slice(start, end);
    const content = contentLines.join('\n').trim();

    // Detect sub-items, code blocks, and diagrams within the clipped content
    const subItems: string[] = [];
    let hasCode = false;
    let hasDiagram = false;
    let inCode = false;

    for (const line of contentLines) {
      const t = line.trim();
      if (t.startsWith('```')) {
        inCode = !inCode;
        if (!inCode) hasCode = true;
        continue;
      }
      if (inCode) continue;

      if (/^[-*]\s+/.test(t)) {
        subItems.push(t.replace(/^[-*]\s+/, '').substring(0, 200));
      }

      if (/[═╔╗╚╝║╠╣╦╩╬┌┬┐├┼┤└┴┘│─]/.test(t) && t.length > 5) {
        hasDiagram = true;
      }
    }

    if (content.length > 10 || boundaries[b].sectionTitle.length > 3) {
      sections.push({
        title: boundaries[b].sectionTitle,
        content,
        type: boundaries[b].sectionType,
        subItems,
        hasCode,
        hasDiagram,
      });
    }
  }

  return sections;
}

// ============================================================================
// PHASE OUTPUTS INTERFACE
// ============================================================================

interface PhaseOutputs {
  threats: ThreatReport[];
  defenses: DefenseSpec[];
  pipeline: OrderedPipeline;
  types: string[];
  algorithms: string[];
  tests: TestSpec[];
}

// ============================================================================
// PHASE 8: SYNTHESIS — PLAN ASSEMBLY (16 build functions)
// ============================================================================

/** Static date for deterministic output — no Date.now() or Math.random(). */
const PLAN_STATIC_DATE = '2025-01-01T00:00:00.000Z';

/**
 * Assembles the complete build plan from all phase outputs.
 * Sections are domain-driven: their presence is conditional on which threat
 * domains were found, not hardcoded.
 */
function assemblePlan(
  phaseOutputs: PhaseOutputs,
  requirements: string,
  sections: RequirementSection[],
  discovery: DiscoveryResult,
  projectName: string,
  architecture: string,
  targetPath: string,
): string {
  const parts: string[] = [];

  // --- ALWAYS present ---
  parts.push(buildHeader(discovery, projectName, targetPath));
  parts.push(buildExecutiveSummary(phaseOutputs));
  parts.push(buildCurrentStateSection(phaseOutputs.threats, discovery));
  parts.push(buildTargetArchitectureSection(phaseOutputs.pipeline));

  // --- CONDITIONAL: types (Phase 5) ---
  if (phaseOutputs.types.length > 0) {
    parts.push(buildDataModelSection(phaseOutputs.types));
  }

  // --- CONDITIONAL: algorithms (Phase 6) ---
  if (phaseOutputs.algorithms.length > 0) {
    parts.push(buildAlgorithmSpecSection(phaseOutputs.algorithms, phaseOutputs.defenses));
  }

  // --- CONDITIONAL: engine class design (Phase 5 + Phase 4) ---
  if (phaseOutputs.types.length > 0 && phaseOutputs.pipeline.phases.length > 1) {
    parts.push(buildEngineClassDesignSection(phaseOutputs.types, phaseOutputs.pipeline));
  }

  // --- DOMAIN-SPECIFIC: build sections based on which domains have defenses ---
  const domains = [...new Set(phaseOutputs.defenses.map((d) => d.domain))];

  if (domains.includes('general')) {
    parts.push(buildRuleSection('GENERAL', phaseOutputs.defenses.filter((d) => d.domain === 'general')));
  }
  if (domains.includes('nlp')) {
    parts.push(buildRuleSection('NLP', phaseOutputs.defenses.filter((d) => d.domain === 'nlp')));
  }
  if (domains.includes('async')) {
    parts.push(buildRuleSection('ASYNC', phaseOutputs.defenses.filter((d) => d.domain === 'async')));
  }
  if (domains.includes('state')) {
    parts.push(buildRuleSection('STATE', phaseOutputs.defenses.filter((d) => d.domain === 'state')));
  }
  if (domains.includes('persistence')) {
    parts.push(buildRuleSection('PERSISTENCE', phaseOutputs.defenses.filter((d) => d.domain === 'persistence')));
  }
  if (domains.includes('evidence')) {
    parts.push(buildRuleSection('EVIDENCE', phaseOutputs.defenses.filter((d) => d.domain === 'evidence')));
    parts.push(buildVerificationMatrixSection(phaseOutputs.defenses, phaseOutputs.threats));
    parts.push(buildPreflightGroundingSection(phaseOutputs.defenses));
  }
  if (domains.includes('testing')) {
    parts.push(buildRuleSection('TESTING', phaseOutputs.defenses.filter((d) => d.domain === 'testing')));
  }

  // --- ALWAYS present (if threats/defenses found) ---
  if (phaseOutputs.threats.length > 0) {
    parts.push(buildBehavioralPatternSection(phaseOutputs.threats));
  }
  if (phaseOutputs.defenses.length > 0) {
    parts.push(buildBlindSpotSection(phaseOutputs.defenses));
  }
  if (phaseOutputs.pipeline.phases.length > 0) {
    parts.push(buildIntegrationSection(phaseOutputs.pipeline));
  }

  // --- CONDITIONAL: tests (Phase 7) ---
  if (phaseOutputs.tests.length > 0) {
    parts.push(buildTestSpecificationsSection(phaseOutputs.tests));
  }

  // --- CONDITIONAL: worked detection example (end-to-end trace) ---
  if (phaseOutputs.threats.length > 0 && phaseOutputs.defenses.length > 0) {
    parts.push(buildWorkedDetectionExampleSection(phaseOutputs.threats, phaseOutputs.defenses, phaseOutputs.tests));
  }

  // --- ALWAYS present ---
  parts.push(buildGapRemediationMatrix(phaseOutputs.threats, phaseOutputs.defenses));
  parts.push(buildBibleCrossReferenceSection(phaseOutputs.defenses));

  // --- CONDITIONAL: appendices (discovery data) ---
  if (discovery && discovery.codeSections && discovery.codeSections.length > 0) {
    parts.push(buildAppendices(discovery));
  }

  // --- Requirements appendix (always include raw requirements) ---
  parts.push(buildRequirementsAppendix(requirements, sections, architecture, phaseOutputs.threats, phaseOutputs.defenses));

  return parts.join('\n\n---\n\n') + '\n';
}

// ============================================================================
// BUILD FUNCTION 1: Header
// ============================================================================

function buildHeader(discovery: DiscoveryResult, projectName: string, targetPath: string): string {
  let out = `# Deep Planning Build Spec: ${projectName}\n\n`;
  out += `**Generated:** ${PLAN_STATIC_DATE}\n`;
  out += `**Project Root:** ${discovery.projectRoot || targetPath}\n`;
  out += `**Target Path:** ${targetPath}\n`;
  out += `**Total Files:** ${discovery.totalFiles}\n`;
  out += `**Total Lines:** ${discovery.totalLines.toLocaleString()}\n`;
  if (discovery.languages && Object.keys(discovery.languages).length > 0) {
    const langs = Object.entries(discovery.languages)
      .map(([k, v]) => `${k} (${v})`)
      .join(', ');
    out += `**Languages:** ${langs}\n`;
  }
  if (discovery.entryPoints && discovery.entryPoints.length > 0) {
    out += `**Entry Points:** ${discovery.entryPoints.join(', ')}\n`;
  }
  out += `**Pipeline Engine:** 8-Phase Deterministic Synthesizer\n`;
  out += `**Analysis Orders:** 1 (regex pre-filter) → 2 (AST) → 3 (TypeChecker) → 4 (CFG) → 5 (execution)\n`;
  return out;
}

// ============================================================================
// BUILD FUNCTION 2: Executive Summary
// ============================================================================

function buildExecutiveSummary(outputs: PhaseOutputs): string {
  let out = '## Executive Summary\n\n';

  const threats = outputs.threats;
  const defenses = outputs.defenses;
  const domains = [...new Set(defenses.map((d) => d.domain))];

  const criticalCount = threats.filter((t) => t.severity === 'CRITICAL').length;
  const highCount = threats.filter((t) => t.severity === 'HIGH').length;
  const mediumCount = threats.filter((t) => t.severity === 'MEDIUM').length;
  const lowCount = threats.filter((t) => t.severity === 'LOW').length;

  out += `**Threats found:** ${threats.length} `;
  out += `(${criticalCount} CRITICAL, ${highCount} HIGH, ${mediumCount} MEDIUM, ${lowCount} LOW)\n\n`;

  out += `**Defenses selected:** ${defenses.length} across ${domains.length} domain${domains.length !== 1 ? 's' : ''}`;
  if (domains.length > 0) {
    out += `: ${domains.join(', ')}`;
  }
  out += '\n\n';

  const parallelPhases = outputs.pipeline.phases.filter((p) => p.executionModel === 'parallel').length;
  out += `**Pipeline phases:** ${outputs.pipeline.phases.length} `;
  out += `(${parallelPhases} parallelizable, ${outputs.pipeline.phases.length - parallelPhases} sequential)\n\n`;

  out += `**Type definitions generated:** ${outputs.types.length}\n`;
  out += `**Algorithm specifications:** ${outputs.algorithms.length}\n`;
  out += `**Test specifications:** ${outputs.tests.length}\n\n`;

  if (criticalCount > 0) {
    out += '**CRITICAL threats require immediate attention:**\n\n';
    for (const t of threats.filter((t) => t.severity === 'CRITICAL')) {
      // Use human-readable label, not the raw pattern key, so that the
      // first occurrence of the raw pattern name appears in the detailed
      // threat assessment section (#### PATTERN_NAME) with its findings.
      const label = (t.pattern || 'UNKNOWN').split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
      out += `- **${label}** — Score: ${t.score}`;
      if (t.defeatVectors.length > 0) {
        out += ` — ${t.defeatVectors[0]}`;
      }
      out += '\n';
    }
    out += '\n';
  }

  if (highCount > 0) {
    out += '**HIGH severity threats:**\n\n';
    for (const t of threats.filter((t) => t.severity === 'HIGH')) {
      const label = (t.pattern || 'UNKNOWN').split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
      out += `- **${label}** — Score: ${t.score}`;
      if (t.defeatVectors.length > 0) {
        out += ` — ${t.defeatVectors[0]}`;
      }
      out += '\n';
    }
    out += '\n';
  }

  // Summary metrics table
  out += '### Summary Metrics\n\n';
  out += '| Metric | Value |\n';
  out += '|--------|-------|\n';
  const totalFindings = threats.reduce((s, t) => s + t.findings.length, 0);
  out += `| Total Threats | ${threats.length} |\n`;
  out += `| Total Findings | ${totalFindings} |\n`;
  out += `| CRITICAL Threats | ${criticalCount} |\n`;
  out += `| HIGH Threats | ${highCount} |\n`;
  out += `| MEDIUM Threats | ${mediumCount} |\n`;
  out += `| LOW Threats | ${lowCount} |\n`;
  out += `| Defenses Selected | ${defenses.length} |\n`;
  out += `| Active Domains | ${domains.length} |\n`;
  out += `| Pipeline Phases | ${outputs.pipeline.phases.length} |\n`;
  out += `| Parallelizable Phases | ${parallelPhases} |\n`;
  out += `| Sequential Phases | ${outputs.pipeline.phases.length - parallelPhases} |\n`;
  out += `| Type Definitions | ${outputs.types.length} |\n`;
  out += `| Algorithm Specs | ${outputs.algorithms.length} |\n`;
  out += `| Test Specs | ${outputs.tests.length} |\n`;
  out += `| Cross-Phase Dependencies | ${outputs.pipeline.dependencies.length} |\n\n`;

  // Domain coverage summary
  out += '### Domain Coverage\n\n';
  out += '| Domain | Defenses | Threats Covered |\n';
  out +=('|--------|----------|----------------|\n');
  for (const domain of domains) {
    const domainDefenses = defenses.filter((d) => d.domain === domain);
    const domainThreats = threats.filter((t) =>
      domainDefenses.some((d) => {
        const threatKey = t.pattern.toLowerCase();
        const threatKeyHyphen = threatKey.replace(/_/g, '-');
        const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
        return d.threatPattern === t.pattern
          || d.threatPattern === threatKeyHyphen
          || (mappedPattern !== undefined && mappedPattern === d.threatPattern);
      }),
    );
    out += `| ${domain} | ${domainDefenses.length} | ${domainThreats.length} |\n`;
  }
  out += '\n';

  // Build readiness assessment
  out += '### Build Readiness Assessment\n\n';
  const hasCritical = criticalCount > 0;
  const allCriticalRemediated = hasCritical && threats
    .filter((t) => t.severity === 'CRITICAL')
    .every((t) =>
      defenses.some((d) => {
        const threatKey = t.pattern.toLowerCase();
        const threatKeyHyphen = threatKey.replace(/_/g, '-');
        const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
        return d.threatPattern === t.pattern
          || d.threatPattern === threatKeyHyphen
          || (mappedPattern !== undefined && mappedPattern === d.threatPattern);
      }),
    );
  const hasUnremediated = threats.some((t) =>
    !defenses.some((d) => {
      const threatKey = t.pattern.toLowerCase();
      const threatKeyHyphen = threatKey.replace(/_/g, '-');
      const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
      return d.threatPattern === t.pattern
        || d.threatPattern === threatKeyHyphen
        || (mappedPattern !== undefined && mappedPattern === d.threatPattern);
    }),
  );
  out += `| Check | Status | Action Required |\n`;
  out += `|-------|--------|----------------|\n`;
  out += `| Critical threats | ${hasCritical ? (allCriticalRemediated ? '✅ REMEDIATED' : '⚠️ PRESENT') : '✅ NONE'} | ${hasCritical ? (allCriticalRemediated ? 'Defenses applied' : 'Remediate before build') : 'No action needed'} |\n`;
  out += `| Unremediated threats | ${hasUnremediated ? '⚠️ PRESENT' : '✅ ALL COVERED'} | ${hasUnremediated ? 'Add catalog defenses' : 'No action needed'} |\n`;
  out += `| Defense coverage | ${defenses.length >= threats.length ? '✅ FULL' : '⚠️ PARTIAL'} | ${defenses.length >= threats.length ? 'All threats have defenses' : 'Some threats lack defenses'} |\n`;
  out += `| Pipeline phases | ${outputs.pipeline.phases.length > 0 ? '✅ GENERATED' : '❌ EMPTY'} | ${outputs.pipeline.phases.length > 0 ? 'No action needed' : 'No defenses selected'} |\n`;
  out += `| Type definitions | ${outputs.types.length > 0 ? '✅ GENERATED' : '❌ NONE'} | ${outputs.types.length > 0 ? 'No action needed' : 'Pipeline has no I/O types'} |\n`;
  out += `| Algorithm specs | ${outputs.algorithms.length > 0 ? '✅ GENERATED' : '❌ NONE'} | ${outputs.algorithms.length > 0 ? 'No action needed' : 'No pseudocode available'} |\n`;
  out += `| Test specs | ${outputs.tests.length > 0 ? '✅ GENERATED' : '❌ NONE'} | ${outputs.tests.length > 0 ? 'No action needed' : 'No test cases available'} |\n\n`;

  if (hasCritical) {
    out += '> ⚠️ **WARNING:** Critical threats detected. The build plan includes ';
    out += 'defenses for these threats, but they must be implemented and verified ';
    out += 'before the build can proceed safely.\n\n';
  }

  return out;
}

// ============================================================================
// BUILD FUNCTION 3: Current State Analysis
// ============================================================================

function buildCurrentStateSection(threats: ThreatReport[], discovery: DiscoveryResult): string {
  let out = '## Current State Analysis\n\n';

  // Codebase overview
  out += '### Codebase Overview\n\n';
  out += `| Metric | Value |\n`;
  out += `|--------|-------|\n`;
  out += `| Total Files | ${discovery.totalFiles} |\n`;
  out += `| Total Lines | ${discovery.totalLines.toLocaleString()} |\n`;
  if (discovery.languages && Object.keys(discovery.languages).length > 0) {
    out += `| Languages | ${Object.keys(discovery.languages).join(', ')} |\n`;
  }
  if (discovery.entryPoints) {
    out += `| Entry Points | ${discovery.entryPoints.length} |\n`;
  }
  if (discovery.patterns) {
    out += `| Discovered Patterns | ${discovery.patterns.length} |\n`;
  }
  if (discovery.failureModes) {
    out += `| Known Failure Modes | ${discovery.failureModes.length} |\n`;
  }
  if (discovery.codeSections) {
    out += `| Code Sections | ${discovery.codeSections.length} |\n`;
  }
  out += '\n';

  // Threat assessment
  out += '### Threat Assessment\n\n';

  if (threats.length === 0) {
    out += 'No threats detected. The 6-Question analysis engine found no deficiencies.\n\n';
    out += 'This may indicate:\n';
    out += '- The codebase is clean and well-structured\n';
    out += '- No code constructs were provided for analysis (empty constructs array)\n';
    out += '- The requirements do not identify specific deficiencies\n\n';
    return out;
  }

  const critical = threats.filter((t) => t.severity === 'CRITICAL');
  const high = threats.filter((t) => t.severity === 'HIGH');
  const rest = threats.filter((t) => t.severity !== 'CRITICAL' && t.severity !== 'HIGH');

  if (critical.length > 0) {
    out += '#### CRITICAL Threats\n\n';
    for (const t of critical) {
      out += formatThreatReport(t);
    }
  }

  if (high.length > 0) {
    out += '#### HIGH Threats\n\n';
    for (const t of high) {
      out += formatThreatReport(t);
    }
  }

  if (rest.length > 0) {
    out += '#### MEDIUM / LOW Threats\n\n';
    for (const t of rest) {
      out += formatThreatReport(t);
    }
  }

  // Threat impact analysis
  if (threats.length > 0) {
    out += '### Threat Impact Analysis\n\n';
    out += 'Each threat has a specific impact on the build plan. The following ';
    out += 'analysis describes how each threat affects the build and what ';
    out += 'mitigation is required.\n\n';

    out += '| # | Threat | Severity | Score | Findings | Impact Area | Mitigation |\n';
    out += '|---|--------|----------|-------|----------|-------------|------------|\n';
    for (let i = 0; i < threats.length; i++) {
      const t = threats[i];
      const impactAreas: Record<string, string> = {
        'THEATRICAL_IMPLEMENTATION': 'Code quality, Evidence integrity',
        'MISSING_IMPLEMENTATION': 'Code completeness, Build reliability',
        'DEAD_CODE': 'Code maintainability, Bundle size',
        'MISMATCH_BRANDING_ILLUSION': 'API contract, Documentation accuracy',
        'DUPLICATE_IMPLEMENTATION': 'Code maintainability, Bug propagation',
        'SPEC_GAP': 'Spec compliance, Feature completeness',
      };
      const mitigations: Record<string, string> = {
        'THEATRICAL_IMPLEMENTATION': 'AST body analysis + return value verification',
        'MISSING_IMPLEMENTATION': 'Existence check + body complexity threshold',
        'DEAD_CODE': 'Call graph analysis + unused export detection',
        'MISMATCH_BRANDING_ILLUSION': 'Verb-call pattern matching via AST',
        'DUPLICATE_IMPLEMENTATION': 'AST fingerprinting + Jaccard similarity',
        'SPEC_GAP': 'Structural name extraction + construct lookup',
      };
      const impact = impactAreas[t.pattern] || 'Code quality';
      const mitigation = mitigations[t.pattern] || 'Domain-specific defense check';
      out += `| ${i + 1} | ${t.pattern.substring(0, 35)} | ${t.severity} | ${t.score} | ${t.findings.length} | ${impact} | ${mitigation} |\n`;
    }
    out += '\n';

    // Risk assessment
    out += '### Risk Assessment\n\n';
    out += 'Overall risk score based on threat severity and finding count. ';
    out += 'Higher scores indicate greater build risk.\n\n';

    let totalRisk = 0;
    out += '| Threat | Severity | Score | Finding Count | Risk Index |\n';
    out += '|--------|----------|-------|--------------|------------|\n';
    for (const t of threats) {
      const severityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const riskIndex = t.score * severityWeight[t.severity] * Math.min(t.findings.length, 100);
      totalRisk += riskIndex;
      out += `| ${t.pattern.substring(0, 35)} | ${t.severity} | ${t.score} | ${t.findings.length} | ${riskIndex} |\n`;
    }
    out += `| **TOTAL** | — | — | ${threats.reduce((s, t) => s + t.findings.length, 0)} | **${totalRisk}** |\n\n`;

    const riskLevel = totalRisk > 10000 ? 'CRITICAL' : totalRisk > 5000 ? 'HIGH' : totalRisk > 1000 ? 'MEDIUM' : 'LOW';
    out += `**Overall Risk Level:** ${riskLevel} (total risk index: ${totalRisk})\n\n`;

    // Threat distribution by question
    out += '### Threat Distribution by Question\n\n';
    out += 'The 6 Questions engine produces threats grouped by question type. ';
    out += 'This distribution shows which types of analysis are most productive ';
    out += 'for this codebase.\n\n';
    out += '| Question | Description | Threat Count | Finding Count |\n';
    out += '|----------|-------------|--------------|---------------|\n';
    const questionDescriptions: Record<string, string> = {
      Q1: 'Existence — does the construct exist in source?',
      Q2: 'Called — is the function/tool/class actually called?',
      Q3: 'Does-What-Says — does the body implement what the spec says?',
      Q4: 'Matches-Spec — does the code structurally match the spec?',
      Q5: 'Theatrical — is the function theatrical/fake?',
      Q6: 'Copied — are there copy-paste duplicates?',
    };
    const questionStats: Record<string, { threats: number; findings: number }> = {};
    for (const t of threats) {
      for (const f of t.findings) {
        if (!questionStats[f.question]) questionStats[f.question] = { threats: 0, findings: 0 };
        questionStats[f.question].findings++;
      }
      // Each threat is associated with at least one question
      const questions = [...new Set(t.findings.map(f => f.question))];
      for (const q of questions) {
        if (!questionStats[q]) questionStats[q] = { threats: 0, findings: 0 };
        questionStats[q].threats++;
      }
    }
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']) {
      const stats = questionStats[q] || { threats: 0, findings: 0 };
      out += `| ${q} | ${questionDescriptions[q]} | ${stats.threats} | ${stats.findings} |\n`;
    }
    out += '\n';
  }

  return out;
}

// ============================================================================
// BUILD FUNCTION 4: Target Architecture
// ============================================================================

function buildTargetArchitectureSection(pipeline: OrderedPipeline): string {
  let out = '## Target Architecture\n\n';

  if (pipeline.phases.length === 0) {
    out += 'No pipeline phases generated. This indicates no defenses were selected.\n\n';
    return out;
  }

  // Pipeline overview
  out += '### Pipeline Phases\n\n';
  out += '```\n';
  for (const phase of pipeline.phases) {
    const parallel = phase.executionModel === 'parallel' ? ' [PARALLEL]' : ' [SEQUENTIAL]';
    out += `${phase.id}${parallel}\n`;
    out += `  Domain: ${phase.domain}\n`;
    out += `  Defenses: ${phase.defenses.join(', ')}\n`;
    out += `  Inputs:  ${phase.inputs.join(', ') || '(none)'}\n`;
    out += `  Outputs: ${phase.outputs.join(', ') || '(none)'}\n`;
    if (phase.dependencies.length > 0) {
      for (const dep of phase.dependencies) {
        out += `  ← depends on: ${dep.from} (${dep.sharedFields.join(', ')})\n`;
      }
    }
    out += '\n';
  }
  out += '```\n\n';

  // Data flow
  out += '### Data Flow\n\n';
  out += '```\n';
  let prevOutputs = '';
  for (const phase of pipeline.phases) {
    out += `[${phase.id}]\n`;
    out += `  INPUT:  ${phase.inputs.join(', ') || '(none)'}\n`;
    out += `  OUTPUT: ${phase.outputs.join(', ') || '(none)'}\n`;
    if (prevOutputs) {
      out += `  ↑ feeds from: ${prevOutputs}\n`;
    }
    out += '\n';
    prevOutputs = phase.outputs.join(', ');
  }
  out += '```\n\n';

  // Cross-phase dependencies
  if (pipeline.dependencies.length > 0) {
    out += '### Cross-Phase Dependencies\n\n';
    out += '| From | To | Shared Fields | Required |\n';
    out += '|------|----|---------------|----------|\n';
    for (const dep of pipeline.dependencies) {
      out += `| ${dep.from} | ${dep.to} | ${dep.sharedFields.join(', ')} | ${dep.required ? 'YES' : 'NO'} |\n`;
    }
    out += '\n';
  }

  // Architecture overview
  out += '### Architecture Overview\n\n';
  out += `The defense pipeline consists of ${pipeline.phases.length} phase(s) organized by domain. `;
  const parallelCount = pipeline.phases.filter(p => p.executionModel === 'parallel').length;
  const sequentialCount = pipeline.phases.filter(p => p.executionModel === 'sequential').length;
  out += `${parallelCount} phase(s) can execute in parallel (no inter-dependencies), `;
  out += `${sequentialCount} phase(s) must execute sequentially (have dependency constraints).\n\n`;

  // Domain distribution
  out += '### Domain Distribution\n\n';
  out += '| Phase | Domain | Defense Count | Execution Model |\n';
  out += '|-------|--------|--------------|-----------------|\n';
  for (const phase of pipeline.phases) {
    out += `| ${phase.id} | ${phase.domain} | ${phase.defenses.length} | ${phase.executionModel} |\n`;
  }
  out += '\n';

  // Pipeline execution strategy
  out += '### Pipeline Execution Strategy\n\n';
  out += 'The pipeline executes in domain-grouped phases. Within each phase, ';
  out += 'defense checks run independently on the phase inputs. Results are ';
  out += 'aggregated into the phase output, which feeds the next phase.\n\n';
  out += '```\n';
  out += 'Input Data\n';
  out += '    │\n';
  for (let i = 0; i < pipeline.phases.length; i++) {
    const phase = pipeline.phases[i];
    out += `    ▼\n`;
    out += `[${phase.id}] ─── ${phase.defenses.length} defense(s) ──→ ${phase.outputs.join(', ') || '(output)'}\n`;
    if (i < pipeline.phases.length - 1) {
      out += `    │\n`;
    }
  }
  out += '    ▼\n';
  out += 'Build Plan Output\n';
  out += '```\n\n';

  // Defense coverage per phase
  out += '### Defense Coverage Per Phase\n\n';
  for (const phase of pipeline.phases) {
    out += `**${phase.id}** (${phase.domain} domain):\n`;
    for (const defenseName of phase.defenses) {
      out += `- ${defenseName}\n`;
    }
    out += '\n';
  }

  return out;
}

// ============================================================================
// BUILD FUNCTION 5: Behavioral Patterns
// ============================================================================

function buildBehavioralPatternSection(threats: ThreatReport[]): string {
  let out = '## Behavioral Patterns\n\n';

  out += 'Patterns derived from threat analysis — each threat reveals a behavioral ';
  out += 'anti-pattern that the build plan must defend against.\n\n';

  if (threats.length === 0) {
    out += 'No behavioral patterns identified (no threats detected).\n\n';
    return out;
  }

  out += '| # | Pattern | Severity | Score | Source Question |\n';
  out += '|---|---------|----------|-------|-----------------|\n';
  for (let i = 0; i < threats.length; i++) {
    const t = threats[i];
    const questions = [...new Set(t.findings.map((f) => f.question))].join(', ');
    out += `| ${i + 1} | ${t.pattern.substring(0, 60)} | ${t.severity} | ${t.score} | ${questions} |\n`;
  }
  out += '\n';

  // Detailed behavioral pattern descriptions
  out += '### Pattern Details\n\n';
  for (const t of threats) {
    out += `**${t.pattern}** (${t.severity}, Score: ${t.score})\n\n`;
    if (t.defeatVectors.length > 0) {
      out += 'Defeat vectors:\n';
      for (const v of t.defeatVectors) {
        out += `- ${v}\n`;
      }
      out += '\n';
    }
    // Group findings by question
    const byQuestion: Record<string, typeof t.findings> = {};
    for (const f of t.findings) {
      if (!byQuestion[f.question]) byQuestion[f.question] = [];
      byQuestion[f.question].push(f);
    }
    for (const [q, findings] of Object.entries(byQuestion)) {
      out += `- **${q}**: ${findings.length} finding(s)\n`;
      const displayFindings = findings.slice(0, 10);
      for (const f of displayFindings) {
        if (f.file && f.line) {
          out += `  - \`${f.file}:${f.line}\` — ${f.description}\n`;
        } else {
          out += `  - ${f.description}\n`;
        }
      }
      if (findings.length > 10) {
        out += `  - _... and ${findings.length - 10} more (truncated)_\n`;
      }
    }
    out += '\n';
  }

  // Pattern correlation analysis
  out += '### Pattern Correlation Analysis\n\n';
  out += 'Threats often co-occur — a single code deficiency may trigger multiple ';
  out += 'threat patterns. The following analysis shows which patterns are ';
  out += 'correlated based on shared files and questions.\n\n';
  out += '| Threat A | Threat B | Shared Questions | Correlation |\n';
  out += '|----------|----------|------------------|-------------|\n';
  for (let i = 0; i < threats.length; i++) {
    for (let j = i + 1; j < threats.length; j++) {
      const a = threats[i];
      const b = threats[j];
      const aQuestions = new Set(a.findings.map(f => f.question));
      const bQuestions = new Set(b.findings.map(f => f.question));
      const shared = [...aQuestions].filter(q => bQuestions.has(q));
      if (shared.length > 0) {
        out += `| ${a.pattern.substring(0, 30)} | ${b.pattern.substring(0, 30)} | ${shared.join(', ')} | ${shared.length > 1 ? 'STRONG' : 'WEAK'} |\n`;
      }
    }
  }
  out += '\n';

  // Pattern severity distribution
  out += '### Pattern Severity Distribution\n\n';
  out += '| Severity | Count | Patterns |\n';
  out += '|----------|-------|----------|\n';
  const severityGroups: Record<string, string[]> = {};
  for (const t of threats) {
    if (!severityGroups[t.severity]) severityGroups[t.severity] = [];
    severityGroups[t.severity].push(t.pattern);
  }
  for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
    const patterns = severityGroups[sev] || [];
    out += `| ${sev} | ${patterns.length} | ${patterns.join(', ').substring(0, 80)} |\n`;
  }
  out += '\n';

  // Defense recommendations per pattern
  out += '### Defense Recommendations\n\n';
  out += 'Each behavioral pattern maps to a defense strategy. The following ';
  out += 'recommendations describe the approach for each pattern.\n\n';
  const defenseStrategies: Record<string, { strategy: string; priority: string; approach: string }> = {
    'THEATRICAL_IMPLEMENTATION': { strategy: 'AST body analysis + return value inspection', priority: 'IMMEDIATE', approach: 'Walk AST to detect literal returns, empty bodies, and floating promises' },
    'MISSING_IMPLEMENTATION': { strategy: 'Existence verification + body complexity check', priority: 'HIGH', approach: 'Check body length and strip comments to detect trivial implementations' },
    'DEAD_CODE': { strategy: 'Call graph analysis + unused export detection', priority: 'MEDIUM', approach: 'Build call graph and flag constructs with zero call sites' },
    'MISMATCH_BRANDING_ILLUSION': { strategy: 'Verb-call pattern matching', priority: 'MEDIUM', approach: 'Extract verbs from requirements and check AST body for matching calls' },
    'DUPLICATE_IMPLEMENTATION': { strategy: 'AST fingerprinting + Jaccard similarity', priority: 'LOW', approach: 'Compare AST node-type sequences between constructs' },
    'SPEC_GAP': { strategy: 'Structural name extraction + construct lookup', priority: 'HIGH', approach: 'Extract names from requirement text and check if constructs exist' },
  };
  for (const t of threats) {
    const strategy = defenseStrategies[t.pattern] || { strategy: 'Domain-specific defense check', priority: 'MEDIUM', approach: 'Apply the matched defense rule from the catalog' };
    out += `**${t.pattern}** (${t.severity})\n`;
    out += `- **Strategy:** ${strategy.strategy}\n`;
    out += `- **Priority:** ${strategy.priority}\n`;
    out += `- **Approach:** ${strategy.approach}\n`;
    out += `- **Findings:** ${t.findings.length} instances detected\n\n`;
  }

  return out;
}

// ============================================================================
// BUILD FUNCTION 6: Blind Spots
// ============================================================================

function buildBlindSpotSection(defenses: DefenseSpec[]): string {
  let out = '## Blind Spots\n\n';

  out += 'Defenses that fell through to blind-spot entries — threats with no ';
  out += 'exact catalog match. These represent gaps in the defense catalog ';
  out += 'that require manual attention.\n\n';

  const blindSpotDefenses = defenses.filter(d => 
    d.checkMethod === 'unknown' || 
    d.bibleSource === 'N/A - blind spot' ||
    (d.rule && d.rule.startsWith('No catalog defense for:'))
  );

  if (blindSpotDefenses.length === 0) {
    // Check inactive domains — these ARE blind spots even when no threats
    // triggered defense selection for those domains.
    const activeDomains = new Set(defenses.map(d => d.domain));
    const allDomains: DefenseDomain[] = ['general', 'evidence', 'async', 'state', 'nlp', 'persistence', 'testing'];
    const inactiveDomains = allDomains.filter(d => !activeDomains.has(d));

    if (inactiveDomains.length > 0) {
      out += `**${inactiveDomains.length} domain blind spots detected** — no threats found in these domains, so no defenses were activated:\n\n`;
      for (const domain of inactiveDomains) {
        out += `- **${domain.toUpperCase()}**: No threats triggered defense selection for this domain. `;
        out += `The catalog has defenses for ${domain} patterns but they were not activated.\n`;
      }
      out += '\n';
    } else {
      out += '**No blind spots detected.** All threats were matched to catalog defenses.\n\n';
    }
  } else {
    out += '| # | Rule | Threat Pattern | Domain | Bible Source |\n';
    out += '|---|------|----------------|--------|-------------|\n';
    for (let i = 0; i < blindSpotDefenses.length; i++) {
      const d = blindSpotDefenses[i];
      out += `| ${i + 1} | ${d.rule} | ${d.threatPattern.substring(0, 60)} | ${d.domain} | ${d.bibleSource} |\n`;
    }
    out += '\n';

    out += '### Blind Spot Details\n\n';
    for (const d of blindSpotDefenses) {
      out += `#### ${d.rule}\n\n`;
      out += `- **Threat Pattern:** ${d.threatPattern}\n`;
      out += `- **Domain:** ${d.domain}\n`;
      out += `- **Check Method:** ${d.checkMethod}\n`;
      out += `- **Analysis Order:** ${d.analysisOrder}\n`;
      out += `- **Bible Source:** ${d.bibleSource}\n`;
      out += `- **Violation Severity:** ${d.violationSeverity}\n\n`;
      out += 'This defense was generated as a fallback because no exact catalog ';
      out += 'match was found for the threat pattern. The build plan should ';
      out += 'address this gap by either:\n';
      out += '1. Adding a new catalog entry for this threat pattern\n';
      out += '2. Documenting why this threat is accepted (risk acceptance)\n';
      out += '3. Implementing a custom check method\n\n';
    }
  }

  // Domain coverage analysis
  const allDomains: DefenseDomain[] = ['general', 'evidence', 'async', 'state', 'nlp', 'persistence', 'testing'];
  const activeDomains = new Set(defenses.map((d) => d.domain));
  const inactiveDomains = allDomains.filter((d) => !activeDomains.has(d));

  out += '### Domain Coverage Analysis\n\n';
  out += 'The following domains are covered by the selected defenses. Inactive ';
  out += 'domains represent potential blind spots — threat patterns that the ';
  out += 'current defense catalog does not address for this project.\n\n';
  out += '| Domain | Status | Defense Count | Covering Defenses |\n';
  out += '|--------|--------|--------------|-------------------|\n';
  for (const domain of allDomains) {
    const domainDefenses = defenses.filter((d) => d.domain === domain);
    const isActive = domainDefenses.length > 0;
    const patterns = [...new Set(domainDefenses.map((d) => d.threatPattern))].join(', ');
    out += `| ${domain.toUpperCase()} | ${isActive ? 'ACTIVE' : 'INACTIVE'} | ${domainDefenses.length} | ${patterns || '—'} |\n`;
  }
  out += '\n';

  if (inactiveDomains.length > 0) {
    out += '### Inactive Domain Risks\n\n';
    out += 'The following domains have no active defenses. If the codebase ';
    out += 'exhibits threats in these domains, they will not be detected.\n\n';
    for (const domain of inactiveDomains) {
      out += `**${domain.toUpperCase()}**\n`;
      const domainRisks: Record<string, string> = {
        async: 'Floating promises, unhandled rejections, race conditions, callback hell',
        state: 'Invalid state transitions, missing initial states, unreachable terminal states',
        nlp: 'Token overflow, incoherent output, entity mismatch, wrong language',
        persistence: 'Silent write failures, no rollback, non-atomic writes, non-idempotent operations',
        testing: 'Low coverage, no negative tests, no positive tests, theatrical test functions',
        evidence: 'Theatrical evidence, stale evidence, fake command output, unverified output',
        general: 'Missing implementations, dead code, signature mismatches, copy-paste duplicates',
      };
      out += `- Potential risks: ${domainRisks[domain] || 'Unknown'}\n`;
      out += `- Recommendation: Scan codebase for ${domain}-related anti-patterns\n`;
      out += `- If threats found: Add catalog entries and re-run defense selection\n\n`;
    }
  }

  return out;
}

// ============================================================================
// BUILD FUNCTION 7: Integration Map
// ============================================================================

function buildIntegrationSection(pipeline: OrderedPipeline): string {
  let out = '## Integration Map\n\n';

  out += 'How pipeline phases connect — data dependencies, execution order, ';
  out += 'and parallelization opportunities.\n\n';

  if (pipeline.phases.length === 0) {
    out += 'No integration map — pipeline has no phases.\n\n';
    return out;
  }

  // Execution order
  out += '### Execution Order\n\n';
  out += '```\n';
  for (let i = 0; i < pipeline.phases.length; i++) {
    const phase = pipeline.phases[i];
    const arrow = i < pipeline.phases.length - 1 ? ' →' : '';
    out += `[${i + 1}] ${phase.id} (${phase.executionModel})${arrow}\n`;
  }
  out += '```\n\n';

  // Phase dependency graph
  out += '### Phase Dependency Graph\n\n';
  out += '```\n';
  for (const phase of pipeline.phases) {
    if (phase.dependencies.length === 0) {
      out += `${phase.id} ← (root — no dependencies)\n`;
    } else {
      for (const dep of phase.dependencies) {
        out += `${phase.id} ← ${dep.from}`;
        if (dep.sharedFields.length > 0) {
          out += ` [${dep.sharedFields.join(', ')}]`;
        }
        if (!dep.required) {
          out += ' (optional)';
        }
        out += '\n';
      }
    }
  }
  out += '```\n\n';

  // Integration matrix
  out += '### Integration Matrix\n\n';
  out += '| Phase | Depends On | Produces | Consumes |\n';
  out += '|-------|-----------|----------|----------|\n';
  for (const phase of pipeline.phases) {
    const deps = phase.dependencies.map((d) => d.from).join(', ') || '—';
    const produces = phase.outputs.join(', ') || '—';
    const consumes = phase.inputs.join(', ') || '—';
    out += `| ${phase.id} | ${deps} | ${produces} | ${consumes} |\n`;
  }
  out += '\n';

  // Parallelization analysis
  out += '### Parallelization Analysis\n\n';
  const parallelPhases = pipeline.phases.filter((p) => p.executionModel === 'parallel');
  const sequentialPhases = pipeline.phases.filter((p) => p.executionModel === 'sequential');
  out += `**Parallelizable phases:** ${parallelPhases.length} of ${pipeline.phases.length}\n`;
  out += `**Sequential phases:** ${sequentialPhases.length} of ${pipeline.phases.length}\n\n`;

  if (parallelPhases.length > 0) {
    out += 'Parallel phases can execute concurrently since they have no ';
    out += 'inter-dependencies. This reduces total execution time.\n\n';
    out += '| Phase | Domain | Defenses | Estimated Time |\n';
    out += '|-------|--------|----------|----------------|\n';
    for (const phase of parallelPhases) {
      const defenseCount = phase.defenses.length;
      out += `| ${phase.id} | ${phase.domain} | ${defenseCount} | ~${defenseCount * 50}ms |\n`;
    }
    out += '\n';
  }

  if (sequentialPhases.length > 0) {
    out += 'Sequential phases must execute in dependency order. Each phase ';
    out += 'consumes outputs from its dependencies.\n\n';
    out += '| Phase | Domain | Defenses | Depends On |\n';
    out += '|-------|--------|----------|------------|\n';
    for (const phase of sequentialPhases) {
      const deps = phase.dependencies.map((d) => d.from).join(', ') || '—';
      out += `| ${phase.id} | ${phase.domain} | ${phase.defenses.length} | ${deps} |\n`;
    }
    out += '\n';
  }

  // Data flow boundaries
  out += '### Data Flow Boundaries\n\n';
  out += 'Each phase defines a data boundary — inputs that must be available ';
  out += 'before execution and outputs that become available after. These ';
  out += 'boundaries determine the integration contract between phases.\n\n';
  for (const phase of pipeline.phases) {
    out += `**${phase.id}** (${phase.domain} domain)\n`;
    out += `- **Input contract:** ${phase.inputs.length > 0 ? phase.inputs.join(', ') : '(none — root phase)'}\n`;
    out += `- **Output contract:** ${phase.outputs.length > 0 ? phase.outputs.join(', ') : '(none — terminal phase)'}\n`;
    out += `- **Execution model:** ${phase.executionModel}\n`;
    out += `- **Defense count:** ${phase.defenses.length}\n`;
    if (phase.dependencies.length > 0) {
      out += `- **Dependencies:**\n`;
      for (const dep of phase.dependencies) {
        out += `  - ${dep.from} → shares: ${dep.sharedFields.join(', ') || '(none)'}${dep.required ? '' : ' (optional)'}\n`;
      }
    }
    out += '\n';
  }

  return out;
}

// ============================================================================
// BUILD FUNCTION 8: Gap Remediation Matrix
// ============================================================================

/** Helper: find the first matching defense for a threat. */
function findMatchingDefense(threat: ThreatReport, defenses: DefenseSpec[]): DefenseSpec | null {
  return defenses.find((d) => {
    const threatKey = threat.pattern.toLowerCase();
    const threatKeyHyphen = threatKey.replace(/_/g, '-');
    const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
    return d.threatPattern === threat.pattern
      || d.threatPattern === threatKeyHyphen
      || (mappedPattern !== undefined && mappedPattern === d.threatPattern);
  }) ?? null;
}

/** Helper: generate a finding-specific fix suggestion based on the finding description. */
function generateFixSuggestion(finding: ThreatFinding, threat: ThreatReport, defense: DefenseSpec): string {
  const desc = finding.description.toLowerCase();
  if (desc.includes('floating promise')) return 'Add `await` before async call or use `.then()` chain';
  if (desc.includes('empty catch')) return 'Add error logging or re-throw the error';
  if (desc.includes('empty function body')) return 'Add real implementation logic';
  if (desc.includes('returns literal value')) return 'Replace with computed result';
  if (desc.includes('returns success claim')) return 'Add preceding side-effect calls before return';
  if (desc.includes('bare return')) return 'Return a meaningful value or remove the function';
  if (desc.includes('dead code') || desc.includes('never called')) return 'Remove unused function or add a call site';
  if (desc.includes('duplicate') || desc.includes('similarity')) return 'Extract shared logic into a helper function';
  if (desc.includes('trivial body')) return 'Add real computation to the function body';
  return `Apply ${defense.checkMethod} defense rule`;
}

function buildGapRemediationMatrix(threats: ThreatReport[], defenses: DefenseSpec[]): string {
  let out = '## Gap Remediation Matrix\n\n';

  out += 'Maps each threat to its defense, the gap it addresses, and the ';
  out += 'remediation implementation.\n\n';

  out += '| # | Threat | Severity | Defense Rule | Domain | Check Method | Gap |\n';
  out += '|---|--------|----------|-------------|--------|--------------|-----|\n';

  let i = 1;
  for (const t of threats) {
    const matchingDefenses = defenses.filter((d) => {
      const threatKey = t.pattern.toLowerCase();
      const threatKeyHyphen = threatKey.replace(/_/g, '-');
      const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
      return d.threatPattern === t.pattern
        || d.threatPattern === threatKeyHyphen
        || (mappedPattern !== undefined && mappedPattern === d.threatPattern);
    });

    if (matchingDefenses.length === 0) {
      out += `| ${i} | ${t.pattern.substring(0, 50)} | ${t.severity} | (no defense) | — | — | UNREMEDIATED |\n`;
      i++;
    } else {
      for (const d of matchingDefenses) {
        const gap = `Order ${d.analysisOrder} check: ${d.checkMethod}`;
        out += `| ${i} | ${t.pattern.substring(0, 50)} | ${t.severity} | ${d.rule} | ${d.domain} | ${d.checkMethod} | ${gap} |\n`;
        i++;
      }
    }
  }

  if (threats.length === 0) {
    out += `| — | (no threats) | — | — | — | — | — |\n`;
  }

  out += '\n';

  // Finding-specific remediation rows — per-file:line fix suggestions
  out += '### Finding-Specific Remediation\n\n';
  out += '| Location | Finding | Defense Rule | Suggested Fix |\n';
  out += '|----------|---------|-------------|---------------|\n';
  for (const t of threats) {
    const matchedDefense = findMatchingDefense(t, defenses);
    if (!matchedDefense) continue;

    // Add specific remediation for top findings
    const topFindings = t.findings.slice(0, 10);
    for (const f of topFindings) {
      if (!f.file) continue;
      const shortFile = (f.file || 'unknown').split('/').slice(-2).join('/');
      const fixSuggestion = generateFixSuggestion(f, t, matchedDefense);
      out += `| ${shortFile}:${f.line || '?'} | ${f.description.slice(0, 80)} | ${matchedDefense.rule} | ${fixSuggestion} |\n`;
    }
  }
  out += '\n';

  // Remediation priority
  if (threats.length > 0) {
    out += '### Remediation Priority\n\n';
    out += 'Threats sorted by severity (CRITICAL first):\n\n';
    const sorted = [...threats].sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return order[a.severity] - order[b.severity];
    });
    for (const t of sorted) {
      const defense = defenses.find((d) => {
        const threatKey = t.pattern.toLowerCase();
        const threatKeyHyphen = threatKey.replace(/_/g, '-');
        const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
        return d.threatPattern === t.pattern
          || d.threatPattern === threatKeyHyphen
          || (mappedPattern !== undefined && mappedPattern === d.threatPattern);
      });
      out += `- [${t.severity}] **${t.pattern}** → ${defense ? defense.rule : '(unremediated)'}\n`;
    }
    out += '\n';
  }

  // Detailed remediation implementation steps
  if (threats.length > 0) {
    out += '### Remediation Implementation Details\n\n';
    out += 'For each threat, the following section describes the concrete implementation ';
    out += 'steps required to remediate the deficiency. Each remediation includes ';
    out += 'the defense rule to implement, the check method to apply, and the ';
    out += 'verification steps to confirm the fix.\n\n';

    const sorted = [...threats].sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return order[a.severity] - order[b.severity];
    });

    for (const t of sorted) {
      const matchingDefenses = defenses.filter((d) => {
        const threatKey = t.pattern.toLowerCase();
        const threatKeyHyphen = threatKey.replace(/_/g, '-');
        const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
        return d.threatPattern === t.pattern
          || d.threatPattern === threatKeyHyphen
          || (mappedPattern !== undefined && mappedPattern === d.threatPattern);
      });

      out += `#### ${t.pattern} (${t.severity}, Score: ${t.score})\n\n`;

      // Summarize findings
      const questionCounts: Record<string, number> = {};
      for (const f of t.findings) {
        questionCounts[f.question] = (questionCounts[f.question] || 0) + 1;
      }
      out += `**Findings:** ${t.findings.length} total across ${Object.keys(questionCounts).length} question(s)\n`;
      for (const [q, count] of Object.entries(questionCounts)) {
        out += `- ${q}: ${count} finding(s)\n`;
      }
      out += '\n';

      // Defeat vectors
      if (t.defeatVectors.length > 0) {
        out += '**Defeat Vectors:**\n';
        for (const v of t.defeatVectors) {
          out += `- ${v}\n`;
        }
        out += '\n';
      }

      if (matchingDefenses.length === 0) {
        out += '**Remediation:** UNREMEDIATED — no catalog defense matched this threat.\n';
        out += 'Manual intervention required:\n';
        out += '1. Analyze the threat pattern and determine if a new catalog entry is needed\n';
        out += '2. Implement a custom check method for this threat\n';
        out += '3. Add test cases that verify the check catches the threat\n\n';
      } else {
        for (const d of matchingDefenses) {
          out += `**Defense:** ${d.rule} (${d.domain} domain)\n`;
          out += `- **Check Method:** \`${d.checkMethod}\`\n`;
          out += `- **Analysis Order:** ${d.analysisOrder}\n`;
          out += `- **Thresholds:** pass ${formatThreshold(d.thresholds.passThreshold)}, `;
          out += `warn ${formatThreshold(d.thresholds.warnThreshold)}, `;
          out += `fail ${formatThreshold(d.thresholds.failThreshold)}\n`;
          out += `- **Bible Source:** ${d.bibleSource}\n`;
          out += `- **Weight:** ${d.weight} (confidence contribution)\n\n`;

          out += '**Implementation Steps:**\n';
          const analysisOrderNames: Record<number, string> = {
            1: 'Regex pre-filter scan',
            2: 'AST structural walk',
            3: 'TypeChecker query',
            4: 'Control flow graph analysis',
            5: 'Runtime execution verification',
          };
          out += `1. Implement \`${d.checkMethod}\` using ${analysisOrderNames[d.analysisOrder] || 'static analysis'}\n`;
          out += `2. Feed inputs: ${d.inputs.join(', ') || '(none required)'}\n`;
          out += `3. Extract signal and compare against thresholds (pass ${formatThreshold(d.thresholds.passThreshold)})\n`;
          out += `4. On FAIL: emit ${d.violationSeverity} finding with defeat vector evidence\n`;
          out += `5. On WARN: emit review notice with partial confidence (${d.weight}/10 weight)\n`;
          out += `6. On PASS: record evidence in output: ${d.outputs.join(', ') || '(none)'}\n\n`;

          out += '**Verification:**\n';
          out += `- Run the check against the current codebase\n`;
          out += `- Confirm the check produces a finding for each threat instance\n`;
          out += `- Verify the finding includes file, line, and description\n`;
          out += `- Ensure the defeat vector is documented in the finding\n\n`;
        }
      }
    }
  }

  return out;
}

// ============================================================================
// BUILD FUNCTION 9: Bible Cross-Reference
// ============================================================================

function buildBibleCrossReferenceSection(defenses: DefenseSpec[]): string {
  let out = '## Bible Cross-Reference\n\n';

  out += 'Defense rules grouped by Bible source section. Each entry traces back ';
  out += 'to the specific Bible principle that motivates the defense.\n\n';

  if (defenses.length === 0) {
    out += 'No defenses to cross-reference.\n\n';
    return out;
  }

  // Group by Bible section (first token of bibleSource)
  const bySection: Record<string, DefenseSpec[]> = {};
  for (const d of defenses) {
    const section = (d.bibleSource || 'Unknown').split(' ')[0];
    if (!bySection[section]) bySection[section] = [];
    bySection[section].push(d);
  }

  for (const [section, defs] of Object.entries(bySection).sort()) {
    out += `### ${section}\n\n`;
    out += '| Rule | Threat Pattern | Check Method | Order | Severity |\n';
    out += '|------|---------------|-------------|-------|----------|\n';
    for (const d of defs) {
      out += `| ${d.rule} | ${d.threatPattern.substring(0, 50)} | ${d.checkMethod} | ${d.analysisOrder} | ${d.violationSeverity} |\n`;
    }
    out += '\n';
  }

  // Domain summary
  out += '### Domain Summary\n\n';
  out += '| Domain | Rule Count | Avg Order | Bible Sections |\n';
  out += '|--------|-----------|----------|----------------|\n';
  const domains = [...new Set(defenses.map((d) => d.domain))];
  for (const domain of domains) {
    const domainDefs = defenses.filter((d) => d.domain === domain);
    const avgOrder = (
      domainDefs.reduce((sum, d) => sum + d.analysisOrder, 0) / domainDefs.length
    ).toFixed(1);
    const sections = [...new Set(domainDefs.map((d) => (d.bibleSource || 'Unknown').split(' ')[0]))].join(', ');
    out += `| ${domain} | ${domainDefs.length} | ${avgOrder} | ${sections} |\n`;
  }
  out += '\n';

  // Principle traceability — map each defense to its Bible principle
  out += '### Principle Traceability\n\n';
  out += 'Each defense rule traces back to a specific Bible principle. The ';
  out += 'following table shows the full traceability chain from defense rule ';
  out += 'to Bible source to analysis order to implementation.\n\n';
  out += '| Defense Rule | Bible Source | Principle | Analysis Order | Check Method |\n';
  out += '|-------------|-------------|-----------|----------------|-------------|\n';
  for (const d of defenses) {
    // Extract principle from bibleSource (format: "Section/file.md")
    const principle = (d.bibleSource || 'Unknown').split('/').pop()?.replace('.md', '') || d.bibleSource;
    out += `| ${d.rule} | ${d.bibleSource} | ${principle} | ${d.analysisOrder} | \`${d.checkMethod}\` |\n`;
  }
  out += '\n';

  // Bible principle descriptions
  out += '### Bible Principle Descriptions\n\n';
  out += 'The Bible principles that motivate the selected defenses. Each ';
  out += 'principle defines a specific analysis approach that the defense ';
  out += 'implements.\n\n';

  const principles = new Map<string, string>();
  for (const d of defenses) {
    const key = d.bibleSource;
    if (!principles.has(key)) {
      const principleName = (d.bibleSource || 'Unknown').split('/').pop()?.replace('.md', '') || d.bibleSource;
      const principleDescriptions: Record<string, string> = {
        'defense_in_depth': 'Defense in Depth — multiple independent checks ensure that if one layer fails, another catches the deficiency. Each check operates at a different analysis order (regex → AST → TypeChecker → CFG → execution) to provide orthogonal verification.',
        'evidence_chain': 'Evidence Chain — every claim must be backed by machine-generated evidence with an unbroken chain from source to conclusion. The chain prevents theatrical evidence from passing as real.',
        'existential_verification': 'Existential Verification — before trusting that something exists, mechanically verify its presence using AST analysis. Never accept a name or declaration as proof of implementation.',
        'signature_matching': 'Signature Matching — the function name and body must match what the spec requires. Verbs in requirements map to expected call patterns in the AST body.',
        'dead_code_detection': 'Dead Code Detection — every defined construct must be called by at least one other construct. Uncalled code represents waste and potential confusion.',
        'duplicate_detection': 'Duplicate Detection — structurally similar constructs indicate copy-paste duplication. AST fingerprinting detects duplicates that share the same node-type sequence.',
      };
      principles.set(key, principleDescriptions[principleName] || `${principleName} — Bible principle from ${d.bibleSource}`);
    }
  }

  for (const [source, description] of principles) {
    const principleName = source.split('/').pop()?.replace('.md', '') || source;
    out += `#### ${principleName}\n\n`;
    out += `**Bible Source:** ${source}\n\n`;
    out += `${description}\n\n`;
    // List defenses that implement this principle
    const implementingDefenses = defenses.filter((d) => d.bibleSource === source);
    out += `**Implementing defenses (${implementingDefenses.length}):**\n`;
    for (const d of implementingDefenses) {
      out += `- ${d.rule} (Order ${d.analysisOrder}, \`${d.checkMethod}\`)\n`;
    }
    out += '\n';
  }

  // Analysis order coverage
  out += '### Analysis Order Coverage\n\n';
  out += 'The Bible defines 5 analysis orders. The selected defenses cover ';
  out += 'the following orders. Gaps in order coverage mean certain types of ';
  out += 'threats cannot be detected.\n\n';
  out += '| Order | Method | Defenses | Coverage |\n';
  out += '|-------|--------|----------|----------|\n';
  const orderNames: Record<number, string> = {
    1: 'Regex (L0)',
    2: 'AST (L1)',
    3: 'TypeChecker (L2)',
    4: 'CFG (L3)',
    5: 'Execution (L4)',
  };
  for (let order = 1; order <= 5; order++) {
    const orderDefenses = defenses.filter((d) => d.analysisOrder === order);
    const coverage = orderDefenses.length > 0 ? 'COVERED' : 'GAP';
    out += `| ${order} | ${orderNames[order]} | ${orderDefenses.length} | ${coverage} |\n`;
  }
  out += '\n';

  return out;
}

// ============================================================================
// BUILD FUNCTION 10: Domain Rule Section
// ============================================================================

function buildRuleSection(domain: string, defenses: DefenseSpec[]): string {
  let out = `## ${domain} Domain Rules\n\n`;

  out += `> ${defenses.length} rule${defenses.length !== 1 ? 's' : ''} activated for this domain`;
  const threatPatterns = defenses.map((d) => d.threatPattern).filter((v, i, a) => a.indexOf(v) === i);
  if (threatPatterns.length > 0 && threatPatterns.length <= 5) {
    out += ` based on: ${threatPatterns.join(', ')}`;
  } else if (threatPatterns.length > 5) {
    out += ` based on ${threatPatterns.length} unique threat patterns`;
  }
  out += '\n\n';

  for (const d of defenses) {
    out += `### ${d.rule}: ${d.threatPattern}\n\n`;
    out += `**Analysis Order:** ${d.analysisOrder} | **Violation Severity:** ${d.violationSeverity}\n`;

    // Analysis Order explanation (1=regex tip of spear, 2=AST confirmation, etc.)
    const analysisOrderExplanations: Record<number, string> = {
      1: 'Regex pre-filter (L0) — fast source scanning, tip of the spear; flags candidates for deeper analysis',
      2: 'AST structural walk (L1) — confirms regex hits via TypeScript syntax tree traversal; definitive structural proof',
      3: 'TypeChecker query (L2) — type-level analysis via ts.createProgram; resolves types, checks annotations',
      4: 'Control flow graph (L3) — path enumeration and reachability analysis; data flow and control flow verification',
      5: 'Runtime execution (L4) — actual command execution and output capture; the ground truth layer',
    };
    out += `**Analysis Order Meaning:** ${analysisOrderExplanations[d.analysisOrder] || 'unknown order'}\n`;

    out += `**Bible Source:** ${d.bibleSource}\n\n`;
    out += `**Check Method:** \`${d.checkMethod}\`\n`;
    out += `**Inputs:** ${d.inputs.join(', ') || '(none)'}\n`;
    out += `**Outputs:** ${d.outputs.join(', ') || '(none)'}\n`;
    out += `**Weight:** ${d.weight} | **Violation Severity:** ${d.violationSeverity}\n`;
    out += `**Thresholds:** pass ${formatThreshold(d.thresholds.passThreshold)}, `;
    out += `warn ${formatThreshold(d.thresholds.warnThreshold)}, `;
    out += `fail ${formatThreshold(d.thresholds.failThreshold)}\n\n`;

    // Detection method based on analysis order
    const detectionMethods: Record<number, string> = {
      1: 'regex (L0 pre-filter — fast source scanning)',
      2: 'AST walk via ts.forEachChild (Order 2 structural analysis)',
      3: 'TypeChecker query via ts.createProgram (Order 3 type analysis)',
      4: 'Control flow graph path analysis (Order 4 CFG/DFA)',
      5: 'Runtime command execution + output capture (Order 5 execution)',
    };
    out += `**Detection Method:** ${detectionMethods[d.analysisOrder] || 'unknown'}\n\n`;

    out += '**Implementation Notes:**\n';
    out += `- This rule runs in the ${domain} domain phase of the pipeline\n`;
    out += `- Check method \`${d.checkMethod}\` extracts signals from the input\n`;
    out += `- Results are compared against thresholds to determine PASS/WARN/FAIL\n`;
    out += `- Violation contributes ${d.weight} to the overall confidence score\n\n`;

    // Anti-pattern examples
    out += '**Anti-Pattern Examples:**\n';
    const antiPatterns: Record<string, string[]> = {
      'ast-existence-check': [
        '```typescript\n// ANTI-PATTERN: Empty function body\nfunction validate(data: any): boolean {\n  return true; // No actual validation\n}\n```',
        '```typescript\n// ANTI-PATTERN: Trivial implementation\nfunction process(input: string): string {\n  return input; // No processing\n}\n```',
      ],
      'signature-match-ast': [
        '```typescript\n// ANTI-PATTERN: Name says "validate" but body doesn\'t validate\nfunction validateInput(data: any): boolean {\n  console.log(data); // Logging, not validating\n  return true;\n}\n```',
      ],
      'call-graph-uncalled': [
        '```typescript\n// ANTI-PATTERN: Exported but never imported or called\nexport function unusedHelper() {\n  // Dead code — nobody calls this\n}\n```',
      ],
      'ast-fingerprint-diff': [
        '```typescript\n// ANTI-PATTERN: Copy-paste with trivial rename\nfunction processA(data) { return data.map(x => x * 2); }\nfunction processB(data) { return data.map(x => x * 2); }\n```',
      ],
      'provenance-chain-verify': [
        '```typescript\n// ANTI-PATTERN: Hardcoded evidence string\nconst evidence = "Test passed: 100%";\nreturn { passed: true, evidence }; // No machine generation\n```',
      ],
    };
    const patterns = antiPatterns[d.checkMethod] || [
      `Example: The \`${d.checkMethod}\` check scans for ${d.threatPattern} patterns in the input data.`,
      'When a violation is detected, the check emits a finding with file, line, and description.',
    ];
    for (const p of patterns) {
      out += `${p}\n`;
    }
    out += '\n';

    // Signal extraction details
    out += '**Signal Extraction:**\n';
    const signalDescriptions: Record<number, string[]> = {
      1: [
        '- Signal: `patternMatches` (count) — number of regex pattern matches in source',
        '- Signal: `matchDensity` (ratio) — matches per kilobyte of source code',
      ],
      2: [
        '- Signal: `nodeCount` (count) — number of relevant AST nodes found',
        '- Signal: `bodyComplexity` (count) — number of statements in function bodies',
        '- Signal: `hasReturn` (boolean) — whether function has a return statement',
      ],
      3: [
        '- Signal: `typeResolved` (boolean) — whether return type is resolved',
        '- Signal: `paramCount` (count) — number of typed parameters',
      ],
      4: [
        '- Signal: `pathCount` (count) — number of control flow paths',
        '- Signal: `unreachablePaths` (count) — paths that never execute',
      ],
      5: [
        '- Signal: `exitCode` (count) — process exit code from command execution',
        '- Signal: `outputMatches` (boolean) — whether output matches expected pattern',
      ],
    };
    const signals = signalDescriptions[d.analysisOrder] || ['- Signal: `checkResult` (boolean) — whether the check passed'];
    for (const s of signals) {
      out += `${s}\n`;
    }
    out += '\n';

    // Integration with other rules
    out += '**Pipeline Integration:**\n';
    out += `- Inputs consumed: ${d.inputs.length > 0 ? d.inputs.join(', ') : '(root — no dependencies)'}\n`;
    out += `- Outputs produced: ${d.outputs.length > 0 ? d.outputs.join(', ') : '(terminal — no dependents)'}\n`;
    out += `- Execution model: ${d.analysisOrder <= 2 ? 'parallel (no cross-domain dependencies)' : 'sequential (depends on earlier phase output)'}\n`;
    out += `- Confidence weight: ${d.weight}/10 — ${d.weight >= 8 ? 'critical (failure blocks build)' : d.weight >= 5 ? 'moderate (failure requires review)' : 'low (failure is informational)'}\n\n`;
  }

  return out;
}

// ============================================================================
// BUILD FUNCTION 11: Data Model
// ============================================================================

function buildDataModelSection(types: string[]): string {
  let out = '## Data Model\n\n';

  out += 'TypeScript interfaces generated from pipeline phase I/O signatures. ';
  out += 'Each phase has an input interface (what it consumes) and an output ';
  out += 'interface (what it produces).\n\n';

  out += `**${types.length} type definitions generated.**\n\n`;

  // Type summary table
  out += '### Type Summary\n\n';
  out += '| # | Interface | Kind | Key Fields |\n';
  out += '|---|-----------|------|------------|\n';
  for (let i = 0; i < types.length; i++) {
    const typeDef = types[i];
    const nameMatch = typeDef.match(/interface\s+(\w+)/);
    const name = nameMatch ? nameMatch[1] : `Type ${i + 1}`;
    const kind = name.includes('Input') ? 'Input' : name.includes('Output') ? 'Output' : name.includes('Pipeline') ? 'Container' : 'Definition';
    // Extract field names
    const fieldMatches = typeDef.matchAll(/^\s*(\w+)[?:]\s*/gm);
    const fields = [...fieldMatches].map(m => m[1]).slice(0, 3).join(', ') || '(none)';
    out += `| ${i + 1} | ${name} | ${kind} | ${fields} |\n`;
  }
  out += '\n';

  // Type dependency graph
  out += '### Type Dependency Graph\n\n';
  out += 'Interfaces depend on each other through field types. The pipeline ';
  out += 'container aggregates all phase outputs.\n\n';
  out += '```\n';
  for (const typeDef of types) {
    const nameMatch = typeDef.match(/interface\s+(\w+)/);
    if (nameMatch) {
      const name = nameMatch[1];
      if (name.includes('Pipeline')) {
        out += `${name} (top-level container)\n`;
      } else if (name.includes('Input')) {
        out += `  ${name} → consumed by phase\n`;
      } else if (name.includes('Output')) {
        out += `  ${name} → produced by phase → aggregated into Pipeline\n`;
      }
    }
  }
  out += '```\n\n';

  // Type definitions
  out += '### Type Definitions\n\n';
  for (const typeDef of types) {
    out += '```typescript\n';
    out += typeDef;
    out += '\n```\n\n';
  }

  // Usage examples
  out += '### Usage Examples\n\n';
  out += 'The generated types are used in the engine class methods to type-check ';
  out += 'inputs and outputs at each pipeline phase.\n\n';
  out += '```typescript\n';
  out += '// Example: Phase input preparation\n';
  out += 'const phaseInput: PhaseGeneral_Input = {\n';
  out += '  constructs: classifiedConstructs,\n';
  out += '};\n\n';
  out += '// Example: Phase output consumption\n';
  out += 'const phaseOutput: PhaseGeneral_Output = engine.runGeneral(phaseInput);\n';
  out += 'if (phaseOutput.existenceReport.failed.length > 0) {\n';
  out += '  // Handle failed existence checks\n';
  out += '}\n\n';
  out += '// Example: Pipeline aggregation\n';
  out += 'const pipeline: BuildPlanPipeline = {\n';
  out += '  phaseGeneralOutput: phaseOutput,\n';
  out += '  dependencies: pipelineDeps,\n';
  out += '};\n';
  out += '```\n\n';

  return out;
}

// ============================================================================
// BUILD FUNCTION 12: Algorithm Specifications
// ============================================================================

function buildAlgorithmSpecSection(algorithms: string[], defenses: DefenseSpec[]): string {
  let out = '## Algorithm Specifications\n\n';

  out += 'Pseudocode for each defense rule — signal extraction, threshold ';
  out += 'comparison, decision logic, severity assignment, and a worked example. ';
  out += 'Each algorithm is deterministic and derived from the defense catalog ';
  out += 'thresholds.\n\n';

  out += `**${algorithms.length} algorithm specifications generated.**\n\n`;

  // Algorithm summary table
  out += '### Algorithm Summary\n\n';
  out += '| # | Algorithm | Analysis Order | Key Signals | Decision Logic |\n';
  out += '|---|-----------|----------------|-------------|----------------|\n';
  for (let i = 0; i < algorithms.length; i++) {
    const algo = algorithms[i];
    // Extract rule name from first line
    const ruleMatch = algo.match(/Rule:\s*(.+)/);
    const rule = ruleMatch ? ruleMatch[1].trim() : `Algorithm ${i + 1}`;
    const orderMatch = algo.match(/Order:\s*(\d)/);
    const order = orderMatch ? orderMatch[1] : '—';
    // Extract signals
    const signalMatches = algo.matchAll(/signal\s*[:=]\s*(\w+)/gi);
    const signals = [...signalMatches].map(m => m[1]).slice(0, 3).join(', ') || 'check result';
    // Extract decision
    const hasPass = algo.includes('PASS');
    const hasWarn = algo.includes('WARN');
    const hasFail = algo.includes('FAIL');
    const decisions = [hasPass && 'PASS', hasWarn && 'WARN', hasFail && 'FAIL'].filter(Boolean).join('/') || 'PASS/FAIL';
    out += `| ${i + 1} | ${rule.substring(0, 40)} | ${order} | ${signals} | ${decisions} |\n`;
  }
  out += '\n';

  // Analysis order descriptions
  out += '### Analysis Order Reference\n\n';
  out += 'Each algorithm operates at a specific analysis order. The order ';
  out += 'determines the detection method and the type of signals extracted.\n\n';
  out += '| Order | Method | Signal Types | Use Case |\n';
  out += '|-------|--------|-------------|----------|\n';
  out += '| 1 | Regex (L0) | Pattern matches, density | Fast pre-filtering of source files |\n';
  out += '| 2 | AST (L1) | Node count, body complexity, return type | Structural analysis of functions/methods |\n';
  out += '| 3 | TypeChecker (L2) | Type resolution, param types | Type-level verification |\n';
  out += '| 4 | CFG (L3) | Path count, reachability | Control flow and data flow analysis |\n';
  out += '| 5 | Execution (L4) | Exit code, output match | Runtime verification via command execution |\n\n';

  // ── Per-algorithm detailed breakdown with worked examples ──
  out += '### Algorithm Details\n\n';
  for (let i = 0; i < algorithms.length; i++) {
    const algo = algorithms[i];
    const defense = defenses[i]; // algorithms[i] corresponds to defenses[i] by construction

    // Full pseudocode block
    out += '#### Pseudocode\n\n';
    out += '```\n';
    out += algo;
    out += '\n```\n\n';

    // Structured breakdown — signal extraction, threshold comparison, decision logic, severity
    if (defense) {
      const t = defense.thresholds;

      // 1. Signal Extraction
      out += '**1. Signal Extraction:**\n';
      const signalExtractionDescriptions: Record<number, string[]> = {
        1: [
          '- **Source:** Raw source text scanned with compiled regex patterns\n',
          '- **What to look for:** Pattern matches in the AST text that indicate the anti-pattern\n',
          '- **Extraction method:** `countMatches(regex, source)` and `matchDensity = patternMatches / len(source)`\n',
        ],
        2: [
          '- **Source:** TypeScript AST nodes walked via `ts.forEachChild`\n',
          '- **What to look for:** Function body statements, return statements, call expressions, nesting depth\n',
          '- **Extraction method:** `ts.createSourceFile()` → recursive visitor → collect node counts and structural signals\n',
        ],
        3: [
          '- **Source:** TypeScript TypeChecker via `ts.createProgram`\n',
          '- **What to look for:** Type annotations, `any` usage, resolved return types\n',
          '- **Extraction method:** `program.getTypeChecker()` → query types at symbol locations\n',
        ],
        4: [
          '- **Source:** Control flow graph built from AST\n',
          '- **What to look for:** Path count, unreachable blocks, cyclomatic complexity\n',
          '- **Extraction method:** `buildCFG(sourceFile)` → enumerate paths from entry to exit\n',
        ],
        5: [
          '- **Source:** Runtime command execution and output capture\n',
          '- **What to look for:** Exit code, output match against expected, side-effect observation\n',
          '- **Extraction method:** `execute(targetFunction, input)` → compare output to expected\n',
        ],
      };
      const signalLines = signalExtractionDescriptions[defense.analysisOrder] || [
        `- **Source:** ${defense.checkMethod}\n`,
        '- **Extraction method:** defense-specific signal collection\n',
      ];
      for (const sl of signalLines) {
        out += sl;
      }
      out += '\n';

      // 2. Threshold Comparison — with actual operators and values
      out += '**2. Threshold Comparison:**\n';
      out += '| Band | Signal Condition | Operator | Value | Meaning |\n';
      out += '|------|-----------------|----------|-------|---------|\n';
      out += `| PASS | ${defense.checkMethod} signal ${formatThreshold(t.passThreshold)} | ${t.passThreshold.operator} | ${t.passThreshold.value} | Meets defense criteria — no finding emitted |\n`;
      out += `| WARN | ${defense.checkMethod} signal ${formatThreshold(t.warnThreshold)} | ${t.warnThreshold.operator} | ${t.warnThreshold.value} | Borderline — partial pass, review recommended |\n`;
      out += `| FAIL | ${defense.checkMethod} signal ${formatThreshold(t.failThreshold)} | ${t.failThreshold.operator} | ${t.failThreshold.value} | Violates defense criteria — finding emitted |\n`;
      out += '\n';

      // 3. Decision Logic
      out += '**3. Decision Logic:**\n';
      out += '```text\n';
      out += `if signal ${formatThreshold(t.passThreshold)}:\n`;
      out += `    verdict = PASS                    // no finding, record evidence\n`;
      out += `elif signal ${formatThreshold(t.warnThreshold)}:\n`;
      out += `    verdict = WARN                    // review notice, partial confidence (${defense.weight}/10)\n`;
      out += `else:\n`;
      out += `    verdict = FAIL                    // finding emitted with defeat vector evidence\n`;
      out += '```\n\n';

      // 4. Severity Assignment
      out += '**4. Severity Assignment:**\n';
      out += `- On FAIL verdict → finding severity = **${defense.violationSeverity}**\n`;
      out += `- Severity is derived from \`defense.violationSeverity\` (static, per-rule)\n`;
      const severityImpact: Record<string, string> = {
        CRITICAL: 'blocks the build — must be fixed before proceeding',
        HIGH: 'requires immediate remediation — build can proceed but with high risk',
        MEDIUM: 'should be remediated — review and address in next iteration',
        LOW: 'informational — log and track for future improvement',
      };
      out += `- Impact: ${severityImpact[defense.violationSeverity] || 'unknown'}\n\n`;

      // Worked Example
      out += '**Worked Example:**\n';
      const weInputs = generateWorkedExampleInput(defense);
      const weSignal = generateWorkedExampleSignal(defense);
      const weThresholdCheck = generateWorkedExampleThresholdCheck(defense);
      out += weInputs;
      out += weSignal;
      out += weThresholdCheck;
      out += `- **Severity:** ${defense.violationSeverity}\n`;
      out += `- **Output:** finding { rule: "${defense.rule}", severity: "${defense.violationSeverity}", file: "...", line: 42 }\n\n`;
    }
  }

  // Algorithm execution notes
  out += '### Execution Notes\n\n';
  out += '- All algorithms are deterministic — same input always produces same output\n';
  out += '- No Date.now(), Math.random(), or external state is used\n';
  out += '- Signal extraction uses the analysis order specified in the defense spec\n';
  out += '- Threshold comparison follows the pass/warn/fail bands from the catalog\n';
  out += '- Each algorithm returns a verdict (PASS/WARN/FAIL) and optionally findings\n';
  out += '- Algorithms execute in pipeline phase order — parallel within a phase, sequential across phases\n';
  out += '- Worked examples illustrate the exact signal/threshold/severity flow for each rule\n\n';

  return out;
}

// ── Worked Example helpers ──

/** Generate the "Input:" line for a worked example based on the defense's check method. */
function generateWorkedExampleInput(defense: DefenseSpec): string {
  const inputsByMethod: Record<string, string> = {
    'ast-existence-check': 'Input: function with 0 executable statements (empty body or bare `return`)',
    'ast-signature-compare': 'Input: function named "validate" that calls console.log instead of validating',
    'callgraph-walk': 'Input: exported function with 0 call sites in the call graph',
    'ast-fingerprint-compare': 'Input: two functions with identical AST node sequences (copy-paste)',
    'provenance-chain-verify': 'Input: evidence artifact with no tool identifier or timestamp',
    'timestamp-window-check': 'Input: evidence artifact with timestamp from outside the session window',
    'catch-block-analysis': 'Input: try-catch block where catch body has 0 statements',
    'ast-await-detection': 'Input: async function body with 0 await expressions',
    'container-test-presence': 'Input: build directory with no ContainerTestResult.json file',
    'coverage-threshold-check': 'Input: test suite report showing 45% coverage',
    'negative-test-scan': 'Input: test suite with 0 tests having expectedResult === FAIL',
    'positive-test-scan': 'Input: test suite with 0 tests having expectedResult === PASS',
    'test-body-analysis': 'Input: test function body with 0 assert/expect calls',
  };
  return `- **${inputsByMethod[defense.checkMethod] || `Input: construct matching the ${defense.threatPattern} pattern`}**\n`;
}

/** Generate the "Signal:" line for a worked example based on the defense's check method. */
function generateWorkedExampleSignal(defense: DefenseSpec): string {
  const signalsByMethod: Record<string, string> = {
    'ast-existence-check': '- **Signal:** `hasRealStatements` = false, `bodyLength` = 0\n',
    'ast-signature-compare': '- **Signal:** `declaredBehavior` = "validate", `actualBehavior` = "log"\n',
    'callgraph-walk': '- **Signal:** `callSiteCount` = 0, `isCalled` = false\n',
    'ast-fingerprint-compare': '- **Signal:** `similarity` = 1.0 (identical fingerprints)\n',
    'provenance-chain-verify': '- **Signal:** `machineGenerated` = false, `provenanceChainLength` = 0\n',
    'timestamp-window-check': '- **Signal:** `ageMinutes` = 1440 (24 hours old)\n',
    'catch-block-analysis': '- **Signal:** `emptyCatchCount` = 1, `errorPropagated` = false\n',
    'ast-await-detection': '- **Signal:** `awaitCount` = 0, `hasAwait` = false\n',
    'container-test-presence': '- **Signal:** `containerTestPresent` = false, `testPassRate` = undefined\n',
    'coverage-threshold-check': '- **Signal:** `coveragePercent` = 0.45\n',
    'negative-test-scan': '- **Signal:** `negativeTestCount` = 0\n',
    'positive-test-scan': '- **Signal:** `positiveTestCount` = 0\n',
    'test-body-analysis': '- **Signal:** `theatricalTestCount` = 5, `authenticTestCount` = 0\n',
  };
  return signalsByMethod[defense.checkMethod] || `- **Signal:** primary signal fails ${formatThreshold(defense.thresholds.failThreshold)}\n`;
}

/** Generate the "Threshold check:" line showing the comparison that triggers FAIL. */
function generateWorkedExampleThresholdCheck(defense: DefenseSpec): string {
  const ft = defense.thresholds.failThreshold;
  return `- **Threshold check:** signal ${formatThreshold(ft)} → FAIL\n`;
}

// ============================================================================
// BUILD FUNCTION 13: Engine Class Design
// ============================================================================

function buildEngineClassDesignSection(types: string[], pipeline: OrderedPipeline): string {
  let out = '## Engine Class Design\n\n';

  out += 'Class hierarchy derived from pipeline phases. Each phase becomes a ';
  out += 'method on the engine class, with inputs and outputs typed by the ';
  out += 'Phase 5 type definitions.\n\n';

  out += '### Engine Class Skeleton\n\n';
  out += '```typescript\n';
  out += '/**\n';
  out += ' * Build Plan Pipeline Engine — orchestrates all defense phases.\n';
  out += ' * Generated deterministically from the 8-phase synthesis.\n';
  out += ' */\n';
  out += 'export class BuildPlanPipelineEngine {\n';

  // Phase methods
  for (const phase of pipeline.phases) {
    const methodName = phase.id.replace(/[-\s]/g, '_');
    out += '\n';
    out += `  /**\n`;
    out += `   * ${phase.id} — ${phase.domain} domain\n`;
    out += `   * Execution model: ${phase.executionModel}\n`;
    out += `   * Defenses: ${phase.defenses.join(', ')}\n`;
    if (phase.dependencies.length > 0) {
      out += `   * Depends on: ${phase.dependencies.map((d) => d.from).join(', ')}\n`;
    }
    out += `   */\n`;
    out += `  ${methodName}(): ${phase.outputs.length > 0 ? 'PhaseOutput' : 'void'} {\n`;
    out += `    // Implementation generated by algorithm specifications\n`;
    if (phase.outputs.length > 0) {
      out += `    // Produces: ${phase.outputs.join(', ')}\n`;
    }
    out += `  }\n`;
  }

  // Main run method
  out += '\n';
  out += '  /**\n';
  out += '   * Execute the full pipeline in dependency order.\n';
  out += '   */\n';
  out += '  run(): void {\n';
  for (const phase of pipeline.phases) {
    const methodName = phase.id.replace(/[-\s]/g, '_');
    out += `    this.${methodName}();\n`;
  }
  out += '  }\n';

  out += '}\n';
  out += '```\n\n';

  // Type reference
  if (types.length > 0) {
    out += '### Type References\n\n';
    out += `See Data Model section for ${types.length} type definitions `;
    out += 'that define the input/output shapes for each phase method.\n\n';
  }

  // Method documentation
  out += '### Method Documentation\n\n';
  out += 'Each method in the engine class corresponds to a pipeline phase. ';
  out += 'The following table documents the method signatures, their inputs, ';
  out += 'outputs, and execution model.\n\n';
  out += '| Method | Phase | Domain | Inputs | Outputs | Execution |\n';
  out += '|--------|-------|--------|--------|---------|-----------|\n';
  for (const phase of pipeline.phases) {
    const methodName = phase.id.replace(/[-\s]/g, '_');
    out += `| ${methodName}() | ${phase.id} | ${phase.domain} | ${phase.inputs.join(', ') || '(none)'} | ${phase.outputs.join(', ') || '(none)'} | ${phase.executionModel} |\n`;
  }
  out += '\n';

  // Error handling patterns
  out += '### Error Handling Patterns\n\n';
  out += 'The engine class follows consistent error handling patterns across ';
  out += 'all phase methods. Each method may produce findings that represent ';
  out += 'threats detected during analysis.\n\n';
  out += '```typescript\n';
  out += '// Pattern 1: Phase returns findings array\n';
  out += 'const findings: Finding[] = engine.phaseGeneral(input);\n';
  out += 'if (findings.some(f => f.severity === \'CRITICAL\')) {\n';
  out += '  throw new BuildPlanError(\'Critical threats detected\', findings);\n';
  out += '}\n\n';
  out += '// Pattern 2: Pipeline accumulates all findings\n';
  out += 'const allFindings: Finding[] = [];\n';
  out += 'for (const phase of pipeline.phases) {\n';
  out += '  const phaseFindings = engine.executePhase(phase, input);\n';
  out += '  allFindings.push(...phaseFindings);\n';
  out += '}\n\n';
  out += '// Pattern 3: Early exit on CRITICAL\n';
  out += 'for (const phase of pipeline.phases) {\n';
  out += '  const result = engine.executePhase(phase, input);\n';
  out += '  if (result.hasCritical) {\n';
  out += '    return { status: \'BLOCKED\', findings: result.findings };\n';
  out += '  }\n';
  out += '}\n';
  out += 'return { status: \'PASSED\', findings: allFindings };\n';
  out += '```\n\n';

  // Integration points
  out += '### Integration Points\n\n';
  out += 'The engine class integrates with the following external systems:\n\n';
  out += '| Integration | Direction | Interface | Description |\n';
  out += '|-------------|-----------|-----------|-------------|\n';
  out += '| Auto-Discovery | Input | DiscoveryResult | Project scanning provides code sections and patterns |\n';
  out += '| Code Classifier | Input | CodeConstruct[] | AST analysis provides function/method constructs |\n';
  out += '| Call Graph | Input | CallGraph | Call relationships between constructs |\n';
  out += '| Defense Catalog | Internal | DefenseSpec[] | Static catalog of defense rules |\n';
  out += '| Threat Modeler | Internal | ThreatReport[] | 6 Questions engine produces threat reports |\n';
  out += '| Pipeline Orderer | Internal | OrderedPipeline | Topological sort of defense phases |\n';
  out += '| Type Generator | Internal | string[] | TypeScript interface definitions |\n';
  out += '| Algorithm Generator | Internal | string[] | Pseudocode for each defense |\n';
  out += '| Test Generator | Internal | TestSpec[] | Negative and positive test cases |\n';
  out += '| Build Plan Output | Output | string | Assembled markdown build plan document |\n\n';

  return out;
}

// ============================================================================
// BUILD FUNCTION 14: Test Specifications
// ============================================================================

function buildTestSpecificationsSection(tests: TestSpec[]): string {
  let out = '## Test Specifications\n\n';

  out += 'Test cases generated from threat-defense pairs. Each defense has ';
  out += 'a NEGATIVE test (simulates the attack, expects FAIL) and a POSITIVE ';
  out += 'test (simulates a legitimate case, expects PASS). Unmatched threats ';
  out += 'produce BLIND-SPOT tests.\n\n';

  const negTests = tests.filter((t) => t.name.startsWith('NEG:'));
  const posTests = tests.filter((t) => t.name.startsWith('POS:'));
  const blindTests = tests.filter((t) => t.name.startsWith('BLIND:'));

  out += `**Total tests:** ${tests.length} `;
  out += `(${negTests.length} negative, ${posTests.length} positive, ${blindTests.length} blind-spot)\n\n`;

  // Test summary table
  out += '### Test Summary\n\n';
  out += '| # | Name | Category | Expected | Defeat Vector |\n';
  out += '|---|------|----------|----------|---------------|\n';
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    out += `| ${i + 1} | ${t.name.substring(0, 50)} | ${t.category} | ${t.expectedResult} | ${t.defeatVector.substring(0, 60)} |\n`;
  }
  out += '\n';

  // Detailed test specs
  out += '### Test Details\n\n';
  for (const t of tests) {
    out += `#### ${t.name}\n\n`;
    out += `- **Category:** ${t.category}\n`;
    out += `- **Expected Result:** ${t.expectedResult}\n`;
    out += `- **Defeat Vector:** ${t.defeatVector}\n`;
    if (t.expectedProvenance) {
      out += `- **Expected Provenance:** ${t.expectedProvenance}\n`;
    }
    out += `- **Expected Details:**\n`;
    for (const detail of t.expectedDetail) {
      out += `  - ${detail}\n`;
    }
    out += `- **Input:**\n`;
    out += '```json\n';
    out += JSON.stringify(t.input, null, 2);
    out += '\n```\n\n';

    // Test execution steps
    out += '**Execution Steps:**\n';
    out += `1. Prepare test environment with the input data shown above\n`;
    out += `2. Run the defense check method against the input\n`;
    out += `3. Capture the check output and any findings produced\n`;
    out += `4. Compare the output against the expected result: ${t.expectedResult}\n`;
    out += `5. Record the test result (PASS/FAIL) and any findings\n\n`;

    // Pass/fail criteria
    out += '**Pass/Fail Criteria:**\n';
    out += `- **PASS:** The check produces the expected result (${t.expectedResult})\n`;
    out += `- **FAIL:** The check produces a different result than expected\n`;
    out += `- **ERROR:** The check throws an exception or crashes\n\n`;

    // Expected findings
    if (t.expectedDetail.length > 0) {
      out += '**Expected Findings:**\n';
      for (const detail of t.expectedDetail) {
        out += `- ${detail}\n`;
      }
      out += '\n';
    }

    // Expected Output — explicit finding structure
    out += '**Expected Output:**\n';
    const expectedSeverity = t.expectedResult === 'FAIL' ? 'CRITICAL' : 'NONE';
    const expectedRule = t.name.replace(/^(NEG:|POS:|BLIND:)\s*/, '');
    if (t.expectedResult === 'FAIL') {
      out += `- Finding: { severity: "${expectedSeverity}", rule: "${expectedRule}" }\n`;
      if (t.expectedDetail.length > 0) {
        out += `- Evidence: "${t.expectedDetail[0]}"\n`;
      }
      out += `- Verdict: FAIL — the defense check detected the threat in the input\n\n`;
    } else if (t.expectedResult === 'PASS') {
      out += `- Finding: (none — no violation detected)\n`;
      out += `- Verdict: PASS — the legitimate input does not trigger the defense\n\n`;
    } else {
      out += `- Verdict: ${t.expectedResult}\n\n`;
    }

    // Test category explanation
    const categoryDescriptions: Record<string, string> = {
      NEGATIVE: 'Negative test — simulates an attack/defeat vector. The check should FAIL (detect the threat). If the check PASSES, the defense is not working.',
      POSITIVE: 'Positive test — simulates a legitimate case. The check should PASS (no threat detected). If the check FAILS, the defense is too aggressive (false positive).',
      'BLIND-SPOT': 'Blind-spot test — threat has no catalog defense. Documents the gap for manual review.',
    };
    const catDesc = categoryDescriptions[t.category] || 'Test case for the defense check method.';
    out += `**Category Explanation:** ${catDesc}\n\n`;
  }

  return out;
}

// ============================================================================
// BUILD FUNCTION 15a: Worked Detection Example (end-to-end trace)
// ============================================================================

/**
 * Traces a single CRITICAL threat through the entire pipeline: from threat
 * detection → defense selection → algorithm execution → test validation →
 * expected output. This gives the build agent a concrete narrative of how
 * the defense system works end-to-end.
 */
function buildWorkedDetectionExampleSection(
  threats: ThreatReport[],
  defenses: DefenseSpec[],
  tests: TestSpec[],
): string {
  let out = '## Worked Detection Example (End-to-End Trace)\n\n';

  out += 'This section traces a single CRITICAL threat through the entire ';
  out += 'defense pipeline — from initial detection to the final finding output. ';
  out += 'It demonstrates how each phase (threat modeler → defense selection → ';
  out += 'algorithm execution → test validation) connects end-to-end.\n\n';

  // Select the best candidate: CRITICAL first, then highest score
  const sorted = [...threats].sort((a, b) => {
    if (a.severity !== b.severity) {
      const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return order[a.severity] - order[b.severity];
    }
    return b.score - a.score;
  });
  const threat = sorted[0];

  // Find the matching defense
  const matchingDefense = findMatchingDefense(threat, defenses) || defenses[0];
  // Find the matching test (NEG: prefix, same defense)
  const matchingNegTest = tests.find((t) =>
    t.name.startsWith('NEG:') && t.name.includes(matchingDefense.rule)
  ) || tests.find((t) => t.name.startsWith('NEG:'));

  out += `### Selected Threat: ${threat.pattern}\n\n`;

  // ── Step 1: How the threat modeler detected it ──
  out += '**Step 1 — Threat Detection (Phase 2: Threat Modeler)**\n\n';
  out += `The 6-Question threat modeler identified this threat as **${threat.severity}** (score: ${threat.score}).\n\n`;
  const questionsInvolved = [...new Set(threat.findings.map((f) => f.question))];
  const questionDescriptions: Record<string, string> = {
    Q1: 'Existence — does the construct actually exist with real implementation?',
    Q2: 'Signature Match — does the function name match its declared behavior?',
    Q3: 'Call Graph Reachability — is the function actually called from any path?',
    Q4: 'Execution Effect — does the function produce real side effects?',
    Q5: 'Evidence Authenticity — is the evidence machine-generated and verifiable?',
    Q6: 'Structural Uniqueness — is the construct unique or a copy-paste duplicate?',
  };
  out += 'Detection was triggered by the following 6-Question analysis:\n\n';
  for (const q of questionsInvolved) {
    const qFindings = threat.findings.filter((f) => f.question === q);
    out += `- **${q}**: ${questionDescriptions[q] || 'threat analysis question'}\n`;
    out += `  - ${qFindings.length} finding(s) generated\n`;
    const sample = qFindings[0];
    if (sample) {
      if (sample.file && sample.line) {
        out += `  - Sample: \`${sample.file}:${sample.line}\` — ${sample.description}\n`;
      } else {
        out += `  - Sample: ${sample.description}\n`;
      }
    }
  }
  out += '\n';
  out += `The threat modeler classified ${threat.findings.length} total findings under ` +
    `${questionsInvolved.length} question(s), yielding a ${threat.severity} severity at score ${threat.score}.\n\n`;

  // ── Step 2: Which defense rule was selected ──
  out += '**Step 2 — Defense Selection (Phase 3: Defense Catalog)**\n\n';
  if (matchingDefense) {
    out += `The defense catalog matched this threat to the rule **${matchingDefense.rule}**.\n\n`;
    out += `- **Domain:** ${matchingDefense.domain}\n`;
    out += `- **Threat Pattern Match:** ${matchingDefense.threatPattern}\n`;
    out += `- **Check Method:** \`${matchingDefense.checkMethod}\`\n`;
    out += `- **Analysis Order:** ${matchingDefense.analysisOrder}\n`;
    const analysisOrderNames: Record<number, string> = {
      1: 'regex pre-filter (fast source scan, tip of the spear)',
      2: 'AST structural walk (TypeScript syntax tree confirmation)',
      3: 'TypeChecker query (type-level analysis)',
      4: 'control flow graph analysis (path enumeration)',
      5: 'runtime execution verification (command + output capture)',
    };
    out += `- **What this means:** The check runs via ${analysisOrderNames[matchingDefense.analysisOrder] || 'static analysis'}\n`;
    out += `- **Violation Severity:** ${matchingDefense.violationSeverity}\n`;
    out += `- **Bible Source:** ${matchingDefense.bibleSource}\n`;
    out += `- **Thresholds:** pass ${formatThreshold(matchingDefense.thresholds.passThreshold)}, `;
    out += `warn ${formatThreshold(matchingDefense.thresholds.warnThreshold)}, `;
    out += `fail ${formatThreshold(matchingDefense.thresholds.failThreshold)}\n\n`;
    out += `The selection algorithm used \`THREAT_PATTERN_DIRECT_MAP\` and keyword overlap `;
    out += `to match the threat pattern "${threat.pattern}" to the defense rule.\n\n`;
  } else {
    out += 'No matching defense was found in the catalog. This threat falls through to ';
    out += 'the blind-spot handler for manual remediation.\n\n';
  }

  // ── Step 3: What algorithm runs to check for it ──
  out += '**Step 3 — Algorithm Execution (Phase 6: Algorithm Generator)**\n\n';
  if (matchingDefense) {
    out += `The algorithm generator produced pseudocode for \`${matchingDefense.checkMethod}\`:\n\n`;
    out += '```text\n';
    out += `function check_${matchingDefense.rule.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}(input):\n`;
    out += `  // ── Signal Extraction ──\n`;
    out += `  // Extracts signals via ${matchingDefense.analysisOrder === 2 ? 'AST walk' : matchingDefense.analysisOrder === 1 ? 'regex scan' : 'specialized check'}\n`;
    out += `  signal = extract_${matchingDefense.checkMethod}(input)\n\n`;
    out += `  // ── Threshold Comparison ──\n`;
    out += `  if signal ${formatThreshold(matchingDefense.thresholds.passThreshold)}:\n`;
    out += `    return { result: 'PASS', severity: '${matchingDefense.violationSeverity}' }\n`;
    out += `  elif signal ${formatThreshold(matchingDefense.thresholds.warnThreshold)}:\n`;
    out += `    return { result: 'WARN', severity: '${matchingDefense.violationSeverity}' }\n`;
    out += `  else:\n`;
    out += `    return { result: 'FAIL', severity: '${matchingDefense.violationSeverity}' }\n`;
    out += '```\n\n';
    out += `When the construct matching this threat is fed into the algorithm, the `;
    out += `signal fails the pass threshold (${formatThreshold(matchingDefense.thresholds.failThreshold)}), `;
    out += `producing a FAIL verdict.\n\n`;
  }

  // ── Step 4: What test validates the fix ──
  out += '**Step 4 — Test Validation (Phase 7: Test Generator)**\n\n';
  if (matchingNegTest) {
    out += `The test generator produced a **NEGATIVE test** that simulates the attack vector:\n\n`;
    out += `- **Test Name:** ${matchingNegTest.name}\n`;
    out += `- **Defeat Vector:** ${matchingNegTest.defeatVector}\n`;
    out += `- **Expected Result:** ${matchingNegTest.expectedResult}\n`;
    if (matchingNegTest.expectedDetail.length > 0) {
      out += `- **Expected Details:**\n`;
      for (const d of matchingNegTest.expectedDetail) {
        out += `  - ${d}\n`;
      }
    }
    out += '\n';
    out += '**Test Input:**\n';
    out += '```json\n';
    out += JSON.stringify(matchingNegTest.input, null, 2);
    out += '\n```\n\n';
    out += 'This test feeds the attack vector into the defense check. The check ';
    out += 'should produce a FAIL verdict (detecting the threat). If it produces ';
    out += 'PASS, the defense is broken and must be fixed.\n\n';
  } else {
    out += 'No specific negative test was generated for this threat-defense pair.\n\n';
  }

  // ── Step 5: What the expected output looks like ──
  out += '**Step 5 — Expected Output (Finding Structure)**\n\n';
  out += 'When this defense fires in production, the finding emitted looks like:\n\n';
  out += '```json\n';
  const sampleFinding = threat.findings[0];
  const findingFile = sampleFinding?.file || 'src/some-file.ts';
  const findingLine = sampleFinding?.line || 42;
  const findingDesc = sampleFinding?.description || `${threat.pattern} detected`;
  out += JSON.stringify({
    rule: matchingDefense?.rule || 'unknown',
    severity: matchingDefense?.violationSeverity || threat.severity,
    verdict: 'FAIL',
    file: findingFile,
    line: findingLine,
    description: findingDesc,
    threatPattern: threat.pattern,
    threatScore: threat.score,
    defeatVector: threat.defeatVectors[0] || 'N/A',
    defenseDomain: matchingDefense?.domain || 'unknown',
    checkMethod: matchingDefense?.checkMethod || 'unknown',
    analysisOrder: matchingDefense?.analysisOrder || 0,
  }, null, 2);
  out += '\n```\n\n';

  out += '### End-to-End Flow Summary\n\n';
  out += '```text\n';
  out += 'Phase 2: Threat Modeler\n';
  out += `  └─→ ${threat.pattern} detected (${threat.severity}, score ${threat.score})\n`;
  out += `      └─→ ${threat.findings.length} findings across ${questionsInvolved.length} questions\n\n`;
  out += 'Phase 3: Defense Catalog\n';
  out += `  └─→ Matched to: ${matchingDefense?.rule || '(no match)'}\n`;
  out += `      └─→ checkMethod: ${matchingDefense?.checkMethod || 'N/A'}, order ${matchingDefense?.analysisOrder || 'N/A'}\n\n`;
  out += 'Phase 6: Algorithm Generator\n';
  out += `  └─→ Pseudocode for ${matchingDefense?.checkMethod || 'N/A'} produced\n`;
  out += `      └─→ FAIL verdict when signal ${matchingDefense ? formatThreshold(matchingDefense.thresholds.failThreshold) : 'N/A'}\n\n`;
  out += 'Phase 7: Test Generator\n';
  out += `  └─→ NEG test simulates attack vector\n`;
  out += `      └─→ Expected result: FAIL (threat detected)\n\n`;
  out += 'Phase 8: Plan Assembly\n';
  out += `  └─→ Finding: { severity: "${matchingDefense?.violationSeverity || threat.severity}", `;
  out += `rule: "${matchingDefense?.rule || 'unknown'}" }\n`;
  out += '```\n\n';

  return out;
}

// ============================================================================
// BUILD FUNCTION 15: Verification Matrix
// ============================================================================

function buildVerificationMatrixSection(defenses: DefenseSpec[], threats: ThreatReport[]): string {
  let out = '## Verification Matrix\n\n';

  out += 'Evidence domain defenses and their verification requirements. ';
  out += 'Each defense maps to a verification check that must pass before ';
  out += 'the build is considered complete.\n\n';

  const evidenceDefenses = defenses.filter((d) => d.domain === 'evidence');

  if (evidenceDefenses.length === 0) {
    out += 'No evidence domain defenses — verification matrix is empty.\n\n';
    return out;
  }

  out += '| # | Defense Rule | Check Method | Order | Thresholds | Verification |\n';
  out += '|---|-------------|-------------|-------|------------|--------------|\n';
  for (let i = 0; i < evidenceDefenses.length; i++) {
    const d = evidenceDefenses[i];
    const thresholds = `pass ${formatThreshold(d.thresholds.passThreshold)}, warn ${formatThreshold(d.thresholds.warnThreshold)}, fail ${formatThreshold(d.thresholds.failThreshold)}`;
    const verification = `Run ${d.checkMethod} and verify result ${d.thresholds.failThreshold.operator} ${d.thresholds.failThreshold.value}`;
    out += `| ${i + 1} | ${d.rule} | ${d.checkMethod} | ${d.analysisOrder} | ${thresholds} | ${verification} |\n`;
  }
  out += '\n';

  // Evidence threats
  const evidenceThreats = threats.filter((t) =>
    evidenceDefenses.some((d) => {
      const threatKey = t.pattern.toLowerCase();
      const threatKeyHyphen = threatKey.replace(/_/g, '-');
      const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
      return d.threatPattern === t.pattern
        || d.threatPattern === threatKeyHyphen
        || (mappedPattern !== undefined && mappedPattern === d.threatPattern);
    }),
  );

  if (evidenceThreats.length > 0) {
    out += '### Evidence Threats Requiring Verification\n\n';
    for (const t of evidenceThreats) {
      out += `- **${t.pattern}** (${t.severity}, Score: ${t.score})\n`;
      if (t.defeatVectors.length > 0) {
        out += `  - Defeat vector: ${t.defeatVectors[0]}\n`;
      }
      // Show sample findings (capped at 5 for readability)
      const sampleFindings = t.findings.slice(0, 5);
      if (sampleFindings.length > 0) {
        out += `  - Sample findings (${t.findings.length} total):\n`;
        for (const f of sampleFindings) {
          if (f.file && f.line) {
            out += `    - \`${f.file}:${f.line}\` — ${f.description}\n`;
          } else {
            out += `    - ${f.description}\n`;
          }
        }
        if (t.findings.length > 5) {
          out += `    - _... and ${t.findings.length - 5} more_\n`;
        }
      }
    }
    out += '\n';
  }

  // Full coverage matrix — all threats × all evidence defenses
  out += '### Full Coverage Matrix\n\n';
  out += 'Maps every threat to every evidence defense to show which threats ';
  out += 'are covered and which are not.\n\n';
  out += '| Threat | Severity | Defense | Covered? | Check Method |\n';
  out += '|--------|----------|---------|----------|-------------|\n';
  for (const t of threats) {
    let hasCoverage = false;
    for (const d of evidenceDefenses) {
      const covered = (() => {
        const threatKey = t.pattern.toLowerCase();
        const threatKeyHyphen = threatKey.replace(/_/g, '-');
        const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
        return d.threatPattern === t.pattern
          || d.threatPattern === threatKeyHyphen
          || (mappedPattern !== undefined && mappedPattern === d.threatPattern);
      })();
      if (covered) {
        hasCoverage = true;
        out += `| ${t.pattern.substring(0, 40)} | ${t.severity} | ${d.rule} | YES | \`${d.checkMethod}\` |\n`;
      }
    }
    if (!hasCoverage) {
      out += `| ${t.pattern.substring(0, 40)} | ${t.severity} | — | NO (general domain) | — |\n`;
    }
  }
  out += '\n';

  // Evidence chain requirements
  out += '### Evidence Chain Requirements\n\n';
  out += 'Each evidence defense contributes to the evidence chain. The chain ';
  out += 'must be unbroken from threat detection to verification.\n\n';
  out += '| Step | Defense | Input | Output | Chain Link |\n';
  out += '|------|---------|-------|--------|-----------|\n';
  for (let i = 0; i < evidenceDefenses.length; i++) {
    const d = evidenceDefenses[i];
    const link = i === 0 ? 'Initial detection' : `Links from step ${i}`;
    out += `| ${i + 1} | ${d.rule} | ${d.inputs.join(', ') || '(none)'} | ${d.outputs.join(', ') || '(none)'} | ${link} |\n`;
  }
  out += '\n';

  return out;
}

// ============================================================================
// BUILD FUNCTION 16: Preflight Grounding
// ============================================================================

function buildPreflightGroundingSection(defenses: DefenseSpec[]): string {
  let out = '## Preflight Grounding\n\n';

  out += 'Preflight checks that must pass BEFORE the build begins. These are ';
  out += 'derived from evidence domain defenses and ensure the build starts ';
  out += 'from a verified baseline.\n\n';

  const evidenceDefenses = defenses.filter((d) => d.domain === 'evidence');

  if (evidenceDefenses.length === 0) {
    out += 'No evidence domain defenses — no preflight grounding checks required.\n\n';
    return out;
  }

  out += '### Preflight Checklist\n\n';
  for (let i = 0; i < evidenceDefenses.length; i++) {
    const d = evidenceDefenses[i];
    out += `${i + 1}. **${d.rule}** — ${d.threatPattern}\n`;
    out += `   - Check: \`${d.checkMethod}\`\n`;
    out += `   - Pass threshold: ${formatThreshold(d.thresholds.passThreshold)}\n`;
    out += `   - Analysis order: ${d.analysisOrder}\n`;
    out += `   - Bible source: ${d.bibleSource}\n`;
    out += `   - If FAIL: address ${d.threatPattern} before proceeding\n\n`;
  }

  out += '### Grounding Protocol\n\n';
  out += '```\n';
  out += '1. Run all preflight checks in analysis-order sequence (1→5)\n';
  out += '2. Any FAIL → stop and remediate before build\n';
  out += '3. Any WARN → document and proceed with caution\n';
  out += '4. All PASS → build baseline is verified, proceed to implementation\n';
  out += '```\n\n';

  // Detailed preflight remediation guide
  out += '### Preflight Remediation Guide\n\n';
  out += 'If a preflight check fails, the following remediation steps must be ';
  out += 'taken before the build can proceed. Each step is tied to a specific ';
  out += 'defense rule and its check method.\n\n';

  for (const d of evidenceDefenses) {
    out += `#### ${d.rule} Remediation\n\n`;
    out += `- **Check Method:** \`${d.checkMethod}\`\n`;
    out += `- **Analysis Order:** ${d.analysisOrder}\n`;
    out += `- **Failure Condition:** Result ${formatThreshold(d.thresholds.failThreshold)}\n\n`;

    const analysisOrderNames: Record<number, string> = {
      1: 'Regex scan of source files',
      2: 'AST structural walk via TypeScript parser',
      3: 'TypeChecker query via ts.createProgram',
      4: 'Control flow graph path analysis',
      5: 'Runtime command execution and output capture',
    };

    out += `**How the check works:**\n`;
    out += `The check uses ${analysisOrderNames[d.analysisOrder] || 'static analysis'} to extract `;
    out += `signals from the input data (${d.inputs.join(', ') || 'none'}). `;
    out += `The extracted signal is compared against thresholds:\n`;
    out += `- **Pass:** signal ${formatThreshold(d.thresholds.passThreshold)}\n`;
    out += `- **Warn:** signal ${formatThreshold(d.thresholds.warnThreshold)}\n`;
    out += `- **Fail:** signal ${formatThreshold(d.thresholds.failThreshold)}\n\n`;

    out += `**Remediation steps:**\n`;
    out += `1. Identify the specific evidence artifact that failed the check\n`;
    out += `2. Trace the artifact back to its source (file, line, command)\n`;
    out += `3. Fix the underlying issue that caused the evidence deficiency\n`;
    out += `4. Re-generate the evidence artifact\n`;
    out += `5. Re-run \`${d.checkMethod}\` to verify the fix\n`;
    out += `6. Document the remediation in the build log\n\n`;

    out += `**Output:** ${d.outputs.join(', ') || '(none)'}\n`;
    out += `**Bible Source:** ${d.bibleSource}\n\n`;
  }

  // Preflight execution order
  out += '### Execution Order\n\n';
  out += 'Preflight checks must be executed in analysis-order sequence to ';
  out += 'ensure dependencies are satisfied. Checks at lower orders produce ';
  out += 'evidence that higher-order checks consume.\n\n';
  out += '| Sequence | Order | Defense | Check Method | Depends On |\n';
  out += '|----------|-------|---------|-------------|------------|\n';
  const sortedEvidence = [...evidenceDefenses].sort((a, b) => a.analysisOrder - b.analysisOrder);
  for (let i = 0; i < sortedEvidence.length; i++) {
    const d = sortedEvidence[i];
    const depends = sortedEvidence
      .filter((other) => other.analysisOrder < d.analysisOrder)
      .map((other) => other.rule)
      .join(', ') || '(none)';
    out += `| ${i + 1} | ${d.analysisOrder} | ${d.rule} | \`${d.checkMethod}\` | ${depends} |\n`;
  }
  out += '\n';

  return out;
}

// ============================================================================
// BUILD FUNCTION 17: Appendices
// ============================================================================

function buildAppendices(discovery: DiscoveryResult): string {
  let out = '## Appendices\n\n';

  // File manifest
  out += '### File Manifest\n\n';
  out += '| File | Est. Lines | Type |\n';
  out += '|------|-----------|------|\n';

  if (discovery.codeSections && discovery.codeSections.length > 0) {
    const byFile: Record<string, number> = {};
    const byFileType: Record<string, string> = {};
    for (const cs of discovery.codeSections) {
      byFile[cs.filePath] = (byFile[cs.filePath] || 0) + (cs.code || '').split('\n').length;
      byFileType[cs.filePath] = cs.type;
    }
    const files = Object.entries(byFile).slice(0, 30);
    for (const [file, lines] of files) {
      out += `| \`${file.substring(0, 60)}\` | ~${lines} | ${byFileType[file] || 'unknown'} |\n`;
    }
    if (Object.keys(byFile).length > 30) {
      out += `| ... and ${Object.keys(byFile).length - 30} more files | — | — |\n`;
    }
  } else {
    out += '| (no code sections available) | — | — |\n';
  }
  out += '\n';

  // Performance estimates
  out += '### Performance Estimates\n\n';
  out += '| Operation | Cost | Frequency | Mitigation |\n';
  out += '|-----------|------|-----------|------------|\n';
  out += '| Phase 1: Intelligence Gathering | ~100ms | Once per tool call | Cache discovery data |\n';
  out += '| Phase 2: Threat Detection (6 Questions) | ~50ms per section | Once per tool call | Cache construct scan |\n';
  out += '| Phase 3: Defense Matching | ~5ms per threat | Once per plan generation | Static catalog lookup |\n';
  out += '| Phase 4: Pipeline Ordering | ~10ms | Once per plan generation | Kahn sort O(V+E) |\n';
  out += '| Phase 5: Type Generation | ~5ms | Once per plan generation | Static TYPE_MAP |\n';
  out += '| Phase 6: Algorithm Generation | ~10ms per defense | Once per plan generation | Static template |\n';
  out += '| Phase 7: Test Generation | ~20ms per defense | Once per plan generation | Static input generators |\n';
  out += '| Phase 8: Plan Assembly | ~5ms | Once per plan generation | String concatenation |\n\n';

  // Configuration
  out += '### Configuration\n\n';
  out += '| Parameter | Value |\n';
  out += '|-----------|-------|\n';
  out += `| Project Root | ${discovery.projectRoot || 'N/A'} |\n`;
  out += `| Total Files | ${discovery.totalFiles} |\n`;
  out += `| Total Lines | ${discovery.totalLines.toLocaleString()} |\n`;
  if (discovery.packageJson) {
    const name = (discovery.packageJson as Record<string, unknown>).name || 'N/A';
    const version = (discovery.packageJson as Record<string, unknown>).version || 'N/A';
    out += `| Package Name | ${name} |\n`;
    out += `| Package Version | ${version} |\n`;
  }
  out += '\n';

  // Discovery patterns
  if (discovery.patterns && discovery.patterns.length > 0) {
    out += '### Discovered Patterns\n\n';
    out += '| # | Pattern | Type | Location |\n';
    out += '|---|---------|------|----------|\n';
    for (let i = 0; i < Math.min(discovery.patterns.length, 30); i++) {
      const p = discovery.patterns[i];
      out += `| ${i + 1} | ${p.name.substring(0, 40)} | ${p.type} | \`${p.file}:${p.line}\` |\n`;
    }
    if (discovery.patterns.length > 30) {
      out += `| ... | ${discovery.patterns.length - 30} more patterns | — | — |\n`;
    }
    out += '\n';
  }

  // Pattern type distribution
  if (discovery.patterns && discovery.patterns.length > 0) {
    out += '### Pattern Type Distribution\n\n';
    const typeCounts: Record<string, number> = {};
    for (const p of discovery.patterns) {
      typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
    }
    out += '| Pattern Type | Count | Percentage |\n';
    out += '|-------------|-------|-----------|\n';
    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / discovery.patterns.length) * 100).toFixed(1);
      out += `| ${type} | ${count} | ${pct}% |\n`;
    }
    out += '\n';
  }

  // Known failure modes
  if (discovery.failureModes && discovery.failureModes.length > 0) {
    out += '### Known Failure Modes\n\n';
    out += '| # | Location | Pattern | Message |\n';
    out += '|---|----------|---------|---------|\n';
    for (let i = 0; i < Math.min(discovery.failureModes.length, 30); i++) {
      const f = discovery.failureModes[i];
      out += `| ${i + 1} | \`${f.file}:${f.line}\` | \`${f.pattern.substring(0, 40)}\` | ${f.message.substring(0, 60)} |\n`;
    }
    if (discovery.failureModes.length > 30) {
      out += `| ... | ${discovery.failureModes.length - 30} more | — | — |\n`;
    }
    out += '\n';
  }

  // Language breakdown
  if (discovery.languages && Object.keys(discovery.languages).length > 0) {
    out += '### Language Breakdown\n\n';
    out += '| Language | File Count | Percentage |\n';
    out += '|----------|-----------|-----------|\n';
    const totalLangs = Object.values(discovery.languages).reduce((a: number, b: number) => a + b, 0);
    for (const [lang, count] of Object.entries(discovery.languages).sort((a, b) => (b[1] as number) - (a[1] as number))) {
      const pct = (((count as number) / totalLangs) * 100).toFixed(1);
      out += `| ${lang} | ${count} | ${pct}% |\n`;
    }
    out += '\n';
  }

  // Code section analysis
  if (discovery.codeSections && discovery.codeSections.length > 0) {
    out += '### Code Section Analysis\n\n';
    const typeCounts: Record<string, number> = {};
    for (const cs of discovery.codeSections) {
      typeCounts[cs.type] = (typeCounts[cs.type] || 0) + 1;
    }
    out += '| Section Type | Count | Description |\n';
    out += '|-------------|-------|-------------|\n';
    const typeDescriptions: Record<string, string> = {
      tool: 'Tool entry point — plugin tool definition',
      hook: 'Hook function — lifecycle event handler',
      class: 'Class declaration — object-oriented construct',
      config: 'Configuration — settings or constants',
      export: 'Export declaration — public API surface',
      function: 'Function declaration — standalone function',
      unknown: 'Unclassified code section',
    };
    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      out += `| ${type} | ${count} | ${typeDescriptions[type] || 'Code section'} |\n`;
    }
    out += '\n';
  }

  // Entry points detail
  if (discovery.entryPoints && discovery.entryPoints.length > 0) {
    out += '### Entry Points\n\n';
    out += '| # | Entry Point | Status |\n';
    out += '|---|------------|--------|\n';
    for (let i = 0; i < discovery.entryPoints.length; i++) {
      out += `| ${i + 1} | \`${discovery.entryPoints[i]}\` | Active |\n`;
    }
    out += '\n';
  }

  // Decisions discovered
  if (discovery.decisions && discovery.decisions.length > 0) {
    out += '### Discovered Decisions\n\n';
    out += '| # | File | Line | Rationale |\n';
    out += '|---|------|------|-----------|\n';
    for (let i = 0; i < Math.min(discovery.decisions.length, 20); i++) {
      const d = discovery.decisions[i];
      out += `| ${i + 1} | \`${d.file}\` | ${d.line} | ${d.rationale.substring(0, 70)} |\n`;
    }
    if (discovery.decisions.length > 20) {
      out += `| ... | ${discovery.decisions.length - 20} more | — | — |\n`;
    }
    out += '\n';
  }

  // Warheads and audit layers
  if (discovery.warheads && discovery.warheads.length > 0) {
    out += '### Warheads\n\n';
    out += discovery.warheads.join(', ') + '\n\n';
  }
  if (discovery.auditLayers && discovery.auditLayers.length > 0) {
    out += '### Audit Layers\n\n';
    out += discovery.auditLayers.join(', ') + '\n\n';
  }

  // Glossary
  out += '### Glossary\n\n';
  out += '| Term | Definition |\n';
  out += '|------|-----------|\n';
  out += '| **6 Questions Engine** | Threat modeling system with 6 analysis questions (Q1-Q6) that detect code deficiencies |\n';
  out += '| **Defense Catalog** | Static catalog of ~40 defense rules across 7 domains (general, evidence, async, state, nlp, persistence, testing) |\n';
  out += '| **Analysis Order** | Detection method level (1=regex, 2=AST, 3=TypeChecker, 4=CFG, 5=execution) — higher orders provide deeper analysis |\n';
  out += '| **Pipeline Phase** | A group of defense checks that execute together, organized by domain |\n';
  out += '| **Threat Report** | A finding from the 6 Questions engine with severity, score, defeat vectors, and individual findings |\n';
  out += '| **Defense Spec** | A catalog entry defining a defense rule with check method, thresholds, and Bible source |\n';
  out += '| **Blind Spot** | A threat with no matching catalog defense — represents a gap in the defense catalog |\n';
  out += '| **Defeat Vector** | An attack path that exploits a threat — describes how the deficiency can be abused |\n';
  out += '| **Bible Source** | The reference document that motivates a defense rule (e.g., Algorithmic Systems/defense_in_depth.md) |\n';
  out += '| **Code Construct** | An AST-extracted code element (function, method, class) used for threat analysis |\n';
  out += '| **Call Graph** | AST-derived graph of function/method call relationships |\n';
  out += '| **Topological Sort** | Ordering algorithm for pipeline phases based on type dependencies (B.inputs ∩ A.outputs → A before B) |\n\n';

  return out;
}

// ============================================================================
// BUILD FUNCTION 18: Requirements Appendix
// ============================================================================

/** Extract action verbs from requirement section content for coverage matching. */
function extractVerbsFromContent(content: string): string[] {
  const lower = content.toLowerCase();
  const verbs = ['detect', 'validate', 'verify', 'generate', 'parse', 'write', 'read',
    'transform', 'analyze', 'process', 'test', 'compute', 'search', 'implement',
    'export', 'import', 'handle', 'check', 'build', 'audit'];
  return verbs.filter(v => lower.includes(v));
}

/** Match extracted verbs to threat patterns from the threat model. */
function matchVerbsToThreats(verbs: string[], threats: ThreatReport[]): ThreatReport[] {
  const verbToPattern: Record<string, string> = {
    detect: 'THEATRICAL_IMPLEMENTATION',
    validate: 'SPEC_GAP',
    verify: 'THEATRICAL_IMPLEMENTATION',
    generate: 'MISSING_IMPLEMENTATION',
    parse: 'MISMATCH_BRANDING_ILLUSION',
    write: 'SPEC_GAP',
    read: 'SPEC_GAP',
    transform: 'MISMATCH_BRANDING_ILLUSION',
    analyze: 'THEATRICAL_IMPLEMENTATION',
    process: 'DEAD_CODE',
    test: 'THEATRICAL_IMPLEMENTATION',
    compute: 'MISSING_IMPLEMENTATION',
    search: 'DEAD_CODE',
    implement: 'MISSING_IMPLEMENTATION',
    export: 'SPEC_GAP',
    import: 'SPEC_GAP',
    handle: 'THEATRICAL_IMPLEMENTATION',
    check: 'THEATRICAL_IMPLEMENTATION',
    build: 'MISSING_IMPLEMENTATION',
    audit: 'THEATRICAL_IMPLEMENTATION',
  };
  const matchedPatterns = new Set<string>();
  for (const v of verbs) {
    const p = verbToPattern[v];
    if (p) matchedPatterns.add(p);
  }
  return threats.filter(t => matchedPatterns.has(t.pattern));
}

function buildRequirementsAppendix(
  requirements: string,
  sections: RequirementSection[],
  architecture: string,
  threats: ThreatReport[],
  defenses: DefenseSpec[],
): string {
  let out = '## Requirements Appendix\n\n';

  out += `### Parsed Sections (${sections.length})\n\n`;
  out += '| # | Title | Type | Has Code | Has Diagram | Sub-items |\n';
  out += '|---|-------|------|----------|-------------|-----------|\n';
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    out += `| ${i + 1} | ${s.title.substring(0, 60)} | ${s.type} | ${s.hasCode ? 'YES' : 'NO'} | ${s.hasDiagram ? 'YES' : 'NO'} | ${s.subItems.length} |\n`;
  }
  out += '\n';

  if (architecture && architecture.length > 20) {
    out += '### Architecture Context\n\n';
    out += architecture + '\n\n';
  }

  // Section type distribution
  out += '### Section Type Distribution\n\n';
  out += '| Section Type | Count | Description |\n';
  out += '|-------------|-------|-------------|\n';
  const typeCounts: Record<string, number> = {};
  for (const s of sections) {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  }
  const typeDescriptions: Record<string, string> = {
    part: 'Major requirement part (PART 1, PART 2, etc.)',
    deficiency: 'Deficiency description (D-1, D-2, etc.)',
    numbered: 'Numbered requirement item',
    architecture: 'Architecture description',
    code: 'Code example or snippet',
    paragraph: 'Free-text paragraph',
    header: 'Section header',
  };
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    out += `| ${type} | ${count} | ${typeDescriptions[type] || 'Requirement section'} |\n`;
  }
  out += '\n';

  // Requirements coverage analysis
  out += '### Requirements Coverage Analysis\n\n';
  out += 'The following analysis shows how the requirements map to the ';
  out += 'threat model and defense catalog.\n\n';
  const numberedSections = sections.filter(s => s.type === 'numbered' || s.type === 'deficiency');
  if (numberedSections.length > 0) {
    out += '| # | Requirement | Matched Threats | Covering Defenses | Domains |\n';
    out += '|---|-------------|-----------------|-------------------|---------|\n';
    for (let i = 0; i < numberedSections.length; i++) {
      const section = numberedSections[i];
      const content = section.content.slice(0, 100).replace(/\|/g, '\\|');
      // Find threats whose pattern appears in this section's content
      const matchedThreats = threats.filter(t => 
        section.content.toLowerCase().includes(t.pattern.toLowerCase().replace(/_/g, ' '))
      );
      // Find defenses covering those threats
      const coveringDefenses = matchedThreats.flatMap(t => 
        defenses.filter(d => {
          const threatKey = t.pattern.toLowerCase();
          const threatKeyHyphen = threatKey.replace(/_/g, '-');
          const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
          return d.threatPattern === t.pattern
            || d.threatPattern === threatKeyHyphen
            || (mappedPattern !== undefined && mappedPattern === d.threatPattern);
        })
      );
      const domains = [...new Set(coveringDefenses.map(d => d.domain))];
      const threatNames = [...new Set(matchedThreats.map(t => t.pattern))];
      const defenseNames = [...new Set(coveringDefenses.map(d => d.rule))];
      out += `| ${i+1} | ${content} | ${threatNames.join(', ') || 'none'} | ${defenseNames.join(', ') || 'none'} | ${domains.join(', ') || 'none'} |\n`;
    }
    out += '\n';
  }

  out += '### Raw Requirements\n\n';
  out += '```\n';
  out += requirements.substring(0, 5000);
  if (requirements.length > 5000) {
    out += '\n... (truncated, full length: ' + requirements.length + ' chars)';
  }
  out += '\n```\n\n';

  return out;
}

// ============================================================================
// HELPER: Format Threat Report
// ============================================================================

function formatThreatReport(t: ThreatReport): string {
  let out = `#### ${t.pattern}\n\n`;
  out += `**Severity:** ${t.severity} | **Score:** ${t.score}\n\n`;

  // Findings grouped by question
  const byQuestion: Record<string, typeof t.findings> = {};
  for (const f of t.findings) {
    if (!byQuestion[f.question]) byQuestion[f.question] = [];
    byQuestion[f.question].push(f);
  }

  for (const [question, findings] of Object.entries(byQuestion)) {
    out += `**${question}** (${findings.length} finding${findings.length !== 1 ? 's' : ''}):\n`;
    const displayFindings = findings.slice(0, 20);
    for (const f of displayFindings) {
      if (f.file && f.line) {
        out += `- \`${f.file}:${f.line}\` — ${f.description}\n`;
      } else {
        out += `- ${f.description}\n`;
      }
    }
    if (findings.length > 20) {
      out += `- _... and ${findings.length - 20} more findings (truncated for readability — see full report for details)_\n`;
    }
    out += '\n';
  }

  if (t.defeatVectors.length > 0) {
    out += '**Defeat Vectors:**\n';
    for (const v of t.defeatVectors) {
      out += `- ${v}\n`;
    }
    out += '\n';
  }

  return out;
}

// ============================================================================
// BUILD FUNCTION: Concise Plan Summary (returned to tool output, < 30KB)
// ============================================================================

/**
 * Builds a concise summary of the full plan for tool output buffer.
 * The full plan is written to disk; this summary provides the key info.
 */
function buildPlanSummary(fullPlan: string, outputs: PhaseOutputs, planPath: string): string {
  const lines = fullPlan.split('\n');
  const threats = outputs.threats;
  const defenses = outputs.defenses;
  const pipeline = outputs.pipeline;
  const types = outputs.types;
  const algorithms = outputs.algorithms;
  const tests = outputs.tests;

  let out = '';

  // Header
  out += '# Deep Planning Build Spec — Summary\n\n';
  out += `**Full plan:** ${lines.length} lines saved to \`${planPath}\`\n\n`;
  out += `**Threats:** ${threats.length} | **Defenses:** ${defenses.length} | **Domains:** ${new Set(defenses.map(d => d.domain)).size} | **Phases:** ${pipeline.phases.length}\n\n`;

  // Threat Summary (compact)
  out += '## Threat Assessment\n\n';
  for (const t of threats) {
    out += `### ${t.pattern} — ${t.severity} (Score: ${t.score})\n`;
    out += `**${t.findings.length} findings** | ${t.defeatVectors.join('; ')}\n\n`;
    // Show first 5 findings with file:line
    const shown = t.findings.slice(0, 5);
    for (const f of shown) {
      if (f.file) {
        const shortFile = (f.file || 'unknown').split('/').slice(-2).join('/');
        out += `- \`${shortFile}:${f.line || '?'}\` — ${f.description}\n`;
      } else {
        out += `- ${f.description}\n`;
      }
    }
    if (t.findings.length > 5) {
      out += `- _... and ${t.findings.length - 5} more (see full plan)_\n`;
    }
    out += '\n';
  }

  // Defense Rules (one line each)
  out += '## Defense Rules\n\n';
  out += '| # | Rule | Domain | Order | Check Method | Thresholds |\n';
  out += '|---|------|--------|-------|-------------|------------|\n';
  for (let i = 0; i < defenses.length; i++) {
    const d = defenses[i];
    out += `| ${i+1} | ${d.rule} | ${d.domain} | ${d.analysisOrder} | ${d.checkMethod} | pass ${formatThreshold(d.thresholds.passThreshold)}, warn ${formatThreshold(d.thresholds.warnThreshold)} |\n`;
  }
  out += '\n';

  // Pipeline Phases
  out += '## Pipeline Phases\n\n```\n';
  for (const phase of pipeline.phases) {
    out += `${phase.id} [${phase.executionModel.toUpperCase()}]\n`;
    out += `  Defenses: ${phase.defenses.join(', ')}\n`;
    out += `  Inputs: ${phase.inputs.join(', ')} → Outputs: ${phase.outputs.join(', ')}\n`;
  }
  out += '```\n\n';

  // Blind Spots
  const blindSpotDefenses = defenses.filter(d => d.checkMethod === 'unknown' || d.bibleSource === 'N/A - blind spot' || (d.rule && d.rule.startsWith('No catalog defense for:')));
  if (blindSpotDefenses.length > 0) {
    out += '## Blind Spots\n\n';
    for (const d of blindSpotDefenses) {
      out += `- **${d.rule}** (${d.threatPattern})\n`;
    }
    out += '\n';
  } else {
    const activeDomains = new Set(defenses.map(d => d.domain));
    const allDomains: DefenseDomain[] = ['general', 'evidence', 'async', 'state', 'nlp', 'persistence', 'testing'];
    const inactive = allDomains.filter(d => !activeDomains.has(d));
    if (inactive.length > 0) {
      out += '## Blind Spots\n\n';
      out += `**${inactive.length} inactive domains** — no threats triggered: ${inactive.join(', ')}\n\n`;
    }
  }

  // Generated artifacts count
  out += `## Generated Artifacts\n\n`;
  out += `- Type definitions: ${types.length}\n`;
  out += `- Algorithm specifications: ${algorithms.length}\n`;
  out += `- Test specifications: ${tests.length}\n`;
  out += `- Total plan lines: ${lines.length}\n\n`;
  out += `**Read the full plan:** \`${planPath}\`\n`;

  return out;
}

// ============================================================================
// LAYER 2: DETAILED WORKFLOW (exported) — 8-Phase Synthesizer
// ============================================================================

// ============================================================================
// MAIN EXPORT — Called directly from trident-tools.ts handler
// ============================================================================

export function generatePipelineSpec(
  constructs: CodeConstruct[],
  callGraph: CallGraph | null,
  requirements: string,
  architecture: string,
  discovery: DiscoveryResult | null | undefined,
  projectName: string,
  targetPath: string,
): string {
  if (!requirements || typeof requirements !== 'string') requirements = 'No requirements specified.';
  if (!architecture || typeof architecture !== 'string') architecture = 'No architecture specified.';

  const effectiveDiscovery: DiscoveryResult = discovery ?? {
    projectRoot: targetPath,
    totalFiles: 0, totalLines: 0, directoryTree: '', languages: {},
    packageJson: null, entryPoints: [], patterns: [],
    failureModes: [], decisions: [], warheads: [], auditLayers: [], codeSections: [],
  };

  try {
    tridentLog('INFO', 'pipeline-generator', `Starting pipeline: ${constructs.length} constructs, requirements=${requirements.length}chars`);

    const sections = parseRequirementSections(requirements);
    const effectiveCallGraph: CallGraph = callGraph ?? {
      entries: new Map(), totalCallSites: 0, resolvedCallSites: 0, coveragePercent: 0,
    };

    const threats = assessThreats(constructs, effectiveCallGraph, sections, effectiveDiscovery);
    tridentLog('INFO', 'pipeline-generator', `Phase 2 complete: ${threats.length} threats`);

    const defenses = selectDefenses(threats);
    tridentLog('INFO', 'pipeline-generator', `Phase 3 complete: ${defenses.length} defenses`);

    const pipeline = orderPipeline(defenses);
    const types = generateTypes(pipeline);
    const algorithms = generateAlgorithms(defenses);
    const tests = generateTests(threats, defenses);
    tridentLog('INFO', 'pipeline-generator', `Phases 4-7 complete: pipeline=${pipeline.phases.length}, types=${types.length}, tests=${tests.length}`);

    const fullPlan = assemblePlan(
      { threats, defenses, pipeline, types, algorithms, tests },
      requirements, sections, effectiveDiscovery, projectName, architecture, targetPath,
    );
    tridentLog('INFO', 'pipeline-generator', `Phase 8 complete: spec=${fullPlan.length} chars`);

    return fullPlan;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('ERROR', 'pipeline-generator', `Pipeline failed: ${msg}`);
    return `# BUILD SPEC (PIPELINE ERROR)\n\n**Pipeline failed:** ${msg}\n\n**Constructs:** ${constructs.length}\n**Requirements:** ${requirements.substring(0, 200)}\n\nFalling back to passthrough mode.`;
  }
}
