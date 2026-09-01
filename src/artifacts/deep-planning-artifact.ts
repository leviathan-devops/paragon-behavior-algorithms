/**
 * Deep Planning Artifact Generator — Trident
 *
 * Produces 3 DISTINCT, GOLD-STANDARD outputs:
 *
 *   LAYER 1: Initial Plan  (generateLayer1InitialPlan)
 *            Generative prompt + project metadata. 400-600 line comprehensive
 *            prompt document for building a system.
 *
 *   LAYER 2: Detailed Workflow  (generateLayer2DetailedWorkflow)
 *            500-1000 line phased implementation with ACTUAL TypeScript code
 *            in each phase.
 *
 *   LAYER 3: Full Context Library  (generateContextLibraryManifest)
 *            9 files written to disk, each 200+ lines with dense reference
 *            content.
 *
 * `generateBuildSpecArtifact()` is a backward-compatible wrapper that calls
 * `generateLayer1InitialPlan()` + `generateLayer2DetailedWorkflow()` and
 * concatenates them (800-1200 lines total).
 */

import * as fs from 'fs';
import * as path from 'path';
import { TRIDENT_CONFIG } from '../config.js';
import type { DiscoveryResult, DiscoveredPattern, CodeSection } from '../shared/auto-discover.js';
import { tridentLog } from '../utils.js';
import * as ts from 'typescript';
import type { AnalysisResult } from './analysis-engine.ts';
import {analyzeProject, resetRepetitionTracker} from './analysis-engine.ts';
import { generatePipelineSpec } from './pipeline-generator.ts';

// ============================================================================
// REQUIREMENT SECTION TYPE — shared contract for parseRequirementSections
// (imported by pipeline-generator.ts and threat-modeler.ts)
// ============================================================================

export interface RequirementSection {
  title: string;
  content: string;
  type: 'part' | 'deficiency' | 'header' | 'numbered' | 'paragraph';
  subItems: string[];
  hasCode: boolean;
  hasDiagram: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function safeIdent(name: string): string {
  if (!name || typeof name !== 'string') return 'unnamed';
  return name.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

// ============================================================================
// ENGINE IDENTIFICATION (L3: group discovery by directory -> engines)
// ============================================================================

export interface EngineInfo {
  name: string;
  directory: string;
  patterns: DiscoveredPattern[];
  codeSections: CodeSection[];
}

export function identifyEngines(discovery: DiscoveryResult | null | undefined): EngineInfo[] {
  if (!discovery) return [];
  const dirMap = new Map<string, { patterns: DiscoveredPattern[]; codeSections: CodeSection[] }>();
  for (const pat of discovery.patterns) {
    const dir = path.dirname(pat.file);
    if (!dirMap.has(dir)) dirMap.set(dir, { patterns: [], codeSections: [] });
    dirMap.get(dir)!.patterns.push(pat);
  }
  for (const cs of discovery.codeSections) {
    const dir = path.dirname(cs.filePath);
    if (!dirMap.has(dir)) dirMap.set(dir, { patterns: [], codeSections: [] });
    dirMap.get(dir)!.codeSections.push(cs);
  }
  const engines: EngineInfo[] = [];
  for (const [dir, data] of dirMap) {
    const totalItems = data.patterns.length + data.codeSections.length;
    if (totalItems >= 3) {
      let engineName = path.basename(dir) || 'root';
      if (engineName === '.' || engineName === '') engineName = 'root';
      engines.push({ name: engineName, directory: dir, patterns: data.patterns, codeSections: data.codeSections });
    }
  }
  engines.sort((a, b) => (b.patterns.length + b.codeSections.length) - (a.patterns.length + a.codeSections.length));
  return engines;
}

export function scopeDiscoveryToEngine(discovery: DiscoveryResult, engine: EngineInfo): DiscoveryResult {
  return {
    ...discovery,
    patterns: engine.patterns,
    codeSections: engine.codeSections,
    failureModes: discovery.failureModes.filter(fm => path.dirname(fm.file) === engine.directory),
    decisions: discovery.decisions.filter(d => path.dirname(d.file) === engine.directory),
  };
}

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
    const lines = (requirements || '').split('\n').filter(l => l.trim().length > 10);
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
// THREAT FIX HELPERS — map threat patterns to actionable fix instructions
// (Bug 1 + Bug 2: defeatVectors describe defects, NOT fixes)
// ============================================================================

function threatFixRecipe(pattern: string): string[] {
  const p = pattern.toUpperCase();
  if (p.includes('THEATRICAL')) {
    return [
      'Read the function at the indicated line',
      'If the body returns a hardcoded literal (true, false, string, number) → implement the actual logic the function name promises',
      'If the body is empty or only has a return statement → add real working code before the return',
      'If async function lacks await → add await before all Promise-returning calls',
      'Add input validation at the top of the function',
      'Add error paths for invalid inputs (never return success unconditionally)',
    ];
  }
  if (p.includes('DEAD_CODE') || p.includes('DEAD')) {
    return [
      'Check if the function/variable is truly uncalled — search for its name across the entire codebase',
      'If genuinely dead → delete it and remove its export statement',
      'If only called from tests → move to a test fixture file',
      'If intentionally public API → add a usage comment explaining why it is exported',
    ];
  }
  if (p.includes('DUPLICATE')) {
    return [
      'Compare the two flagged constructs side by side',
      'Extract the shared logic into a parameterized helper function',
      'Replace each original with a call to the helper',
      'Delete the duplicated code bodies',
    ];
  }
  if (p.includes('MISSING')) {
    return [
      'Read the function signature to understand what it promises',
      'Implement the body to fulfill the promise',
      'Add validation, error handling, and return the correct type',
    ];
  }
  // Generic fallback
  return [
    'Read the code at the indicated file:line',
    'Understand what the function is supposed to do',
    'Implement the missing logic',
    'Add error handling for edge cases',
  ];
}

function threatDoNot(pattern: string, count: number): string {
  const p = pattern.toUpperCase();
  if (p.includes('THEATRICAL')) return `DO NOT create functions that return hardcoded values without real logic — ${count} instances detected`;
  if (p.includes('DEAD_CODE') || p.includes('DEAD')) return `DO NOT export functions or variables that no other code calls — ${count} instances detected`;
  if (p.includes('DUPLICATE')) return `DO NOT copy-paste implementations — extract shared logic into helpers — ${count} instances detected`;
  if (p.includes('MISSING')) return `DO NOT leave function bodies empty — implement the logic the name promises — ${count} instances detected`;
  return `DO NOT repeat the ${pattern} pattern — ${count} instances detected`;
}

// ============================================================================
// LAYER 1: PROMPT GENERATION (exported) — generates structured prompt string
// ============================================================================

export function buildLayer1Prompt(
  requirements: string,
  architecture: string,
  discovery?: DiscoveryResult | null,
  analysis?: AnalysisResult | null,
): string {
  let p = '';

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  const SEV_RANK: Record<string, number> = {
    CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4,
  };
  const sevOrder = (s: string): number =>
    s && SEV_RANK[s] !== undefined ? SEV_RANK[s] : 5;

  // Defensively extract all analysis data (arrays may be undefined on partial runs)
  const threats: any[] = analysis && Array.isArray(analysis.threats) ? analysis.threats : [];
  const defenseList: any[] = analysis && Array.isArray(analysis.defenses) ? analysis.defenses : [];
  const algorithms: string[] = analysis && Array.isArray(analysis.algorithms) ? analysis.algorithms : [];
  const tests: any[] = analysis && Array.isArray(analysis.tests) ? analysis.tests : [];

  // Sort threats: CRITICAL first, then by score descending
  const sortedThreats = [...threats].sort((a, b) => {
    const rankDiff = sevOrder(a.severity) - sevOrder(b.severity);
    if (rankDiff !== 0) return rankDiff;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  // Count findings per severity
  const sevCounts: Record<string, number> = {};
  let totalFindings = 0;
  for (const t of sortedThreats) {
    const sev = t.severity || 'UNKNOWN';
    const cnt = Array.isArray(t.findings) ? t.findings.length : 0;
    sevCounts[sev] = (sevCounts[sev] || 0) + cnt;
    totalFindings += cnt;
  }

  // Find the defense that addresses a given threat pattern
  function findDefenseForThreat(threatPattern: string): any | null {
    if (!threatPattern) return null;
    for (const d of defenseList) {
      if (d.threatPattern === threatPattern) return d;
      if (d.threatPattern && threatPattern.indexOf(d.threatPattern) !== -1) return d;
      // Fuzzy: rule name contains pattern keyword
      const key = String(threatPattern).toLowerCase().split(/[-_\s]/)[0];
      if (key && key.length > 2 && d.rule && String(d.rule).toLowerCase().indexOf(key) !== -1) return d;
    }
    return null;
  }

  // Analysis-order -> readable layer name
  const orderLabel = (order: number): string => {
    const labels: Record<number, string> = {
      1: 'regex', 2: 'AST', 3: 'typechecker', 4: 'CFG', 5: 'execution',
    };
    return labels[order] || 'unknown';
  };

  // Convert algorithm pseudocode into concise bullet directives
  function algoToDirectives(algo: string): string[] {
    return algo.split('\n')
      .map(l => l.replace(/^[\s>*\-]+/, '').trim())
      .filter(l => l.length > 2 && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*/'))
      .slice(0, 6);
  }

  const fileCount = discovery?.totalFiles ?? 'N';

  // ===========================================================================
  // SECTION 1: MISSION
  // ===========================================================================
  p += '## MISSION\n\n';
  if (totalFindings > 0) {
    const sevSummary = Object.entries(sevCounts)
      .sort(([a], [b]) => sevOrder(a) - sevOrder(b))
      .map(([sev, cnt]) => `${cnt} ${sev}`)
      .join(', ');
    p += `Eliminate ${sortedThreats.length} threat patterns (${sevSummary}) spanning ${totalFindings} instances across ${fileCount} files. Execute the priorities below in order.\n\n`;
  } else if (requirements && requirements.length > 20) {
    p += requirements + '\n\n';
  } else {
    p += 'Build runtime-grade software. Every function works correctly, every error is handled, every resource cleans up in all paths. Execute the priorities below in order.\n\n';
  }

  // Bug 3: Add ONE sentence of project context after the mission line
  if (discovery) {
    const lang = Object.keys(discovery.languages || {}).filter(k => k !== 'json' && k !== 'md').join('/');
    p += `\nThis is a ${lang} project with ${discovery.totalFiles} files, ${discovery.entryPoints.length} entry point(s)`;
    if (discovery.warheads && discovery.warheads.length > 0) p += `, ${discovery.warheads.length} warheads`;
    if (discovery.auditLayers && discovery.auditLayers.length > 0) p += `, ${discovery.auditLayers.length} audit layers`;
    p += `. Entry: ${discovery.entryPoints.join(', ')}\n`;
  }

  // ===========================================================================
  // SECTION 2: PRIORITIES (threat-driven directives)
  // ===========================================================================
  if (sortedThreats.length > 0) {
    for (let i = 0; i < sortedThreats.length; i++) {
      const t = sortedThreats[i];
      const patternName = String(t.pattern || 'UNKNOWN_PATTERN');
      const sev = t.severity || 'UNKNOWN';
      const findings: any[] = Array.isArray(t.findings) ? t.findings : [];
      const count = findings.length;
      const defeatVectors: string[] = Array.isArray(t.defeatVectors) ? t.defeatVectors : [];

      // --- Priority header ---
      p += `## PRIORITY ${i + 1}: ${patternName} (${sev} — ${count} instances)\n\n`;

      // --- Pattern description ---
      if (defeatVectors.length > 0) {
        p += `${count} instances detected. ${String(defeatVectors[0]).trim()}.\n\n`;
      } else {
        p += `${count} instances detected.\n\n`;
      }

      // --- Top files to fix FIRST ---
      if (findings.length > 0) {
        p += 'Top files to fix FIRST:\n';
        for (let f = 0; f < Math.min(findings.length, 8); f++) {
          const finding = findings[f];
          const loc = `${finding.file || '?'}:${finding.line || '?'}`;
          const desc = String(finding.description || finding.question || '').substring(0, 120);
          p += `${f + 1}. \`${loc}\` — ${desc}\n`;
        }
        p += '\n';
      }

      // --- For EACH instance: numbered fix steps (Bug 1: use fix recipes, not defeatVectors) ---
      p += 'For EACH instance:\n';
      p += '1. Open the file at the indicated line number\n';
      p += `2. Read the code and confirm the ${patternName} defect is present\n`;
      // REPLACE lines that say "Fix: [defeatVector]" with actual fix steps
      const fixSteps = threatFixRecipe(t.pattern || '');
      let stepNum = 3;
      for (let s = 0; s < fixSteps.length; s++) {
        p += `   ${stepNum}. ${fixSteps[s]}\n`;
        stepNum++;
      }
      p += `${stepNum}. After fixing, re-read the file to confirm the change is correct\n`;
      stepNum++;
      p += `${stepNum}. Run: \`bun build src/index.ts --outdir dist --target bun --format esm --bundle\`\n`;
      stepNum++;
      p += `${stepNum}. If build fails → fix the error immediately, rebuild\n\n`;

      // --- Defense implementation substep ---
      const defense = findDefenseForThreat(patternName);
      if (defense) {
        const defIdx = defenseList.indexOf(defense);
        const layer = orderLabel(defense.analysisOrder ?? 0);
        p += `### Step ${i + 1}.1: Build defense — ${defense.rule}\n\n`;
        p += `Create a ${layer}-based checker that enforces this rule:\n`;
        p += `- **Check method:** ${defense.checkMethod || 'unknown'}\n`;
        p += `- **Weight:** ${defense.weight ?? '?'}/10 — **Violation severity:** ${defense.violationSeverity || 'UNKNOWN'}\n`;
        if (defense.thresholds) {
          const passT = defense.thresholds.passThreshold;
          const failT = defense.thresholds.failThreshold;
          if (passT) p += `- **Pass threshold:** ${passT.operator || '>='} ${passT.value ?? '?'}\n`;
          if (failT) p += `- **Fail threshold:** ${failT.operator || '<'} ${failT.value ?? '?'}\n`;
        }

        // What it should do (from algorithm data, as directives not raw dumps)
        if (defIdx >= 0 && defIdx < algorithms.length) {
          const directives = algoToDirectives(algorithms[defIdx]);
          if (directives.length > 0) {
            p += '\nWhat it should do:\n';
            for (const line of directives) {
              p += `- ${line}\n`;
            }
          }
        }

        // Bug 4: Tell the builder WHERE to create the checker
        p += `\nLocation: Create or modify in \`src/audit-engine/layers/\` or the appropriate engine directory.\n`;

        // Test input
        if (defIdx >= 0 && defIdx < tests.length) {
          const test = tests[defIdx];
          const inputStr = JSON.stringify(test.input).substring(0, 120);
          p += `\nTest with: \`${inputStr}\`\n`;
          if (test.expectedResult) p += `Expected result: ${test.expectedResult}\n`;
        }
        p += '\n';
      }

      // --- Gate: don't proceed until current priority resolved ---
      const isLast = i >= sortedThreats.length - 1;
      if (isLast) {
        p += `DO NOT proceed to verification until ALL ${count} ${patternName} instances are resolved and the build passes.\n\n`;
      } else {
        const nextPattern = String(sortedThreats[i + 1].pattern || 'next priority');
        p += `DO NOT proceed to Priority ${i + 2} (${nextPattern}) until ALL ${count} ${patternName} instances are resolved and the build passes.\n\n`;
      }
    }
  }

  // ===========================================================================
  // SECTION 3: DO NOT (imperative anti-patterns)
  // ===========================================================================
  const antiPatterns: string[] = [];

  // From threat patterns (CRITICAL + HIGH only) — Bug 2: human-readable directives, not raw defeatVectors
  for (const t of sortedThreats) {
    const sev = t.severity || 'UNKNOWN';
    if (sev === 'CRITICAL' || sev === 'HIGH') {
      const patternName = String(t.pattern || 'UNKNOWN');
      const cnt = Array.isArray(t.findings) ? t.findings.length : 0;
      if (cnt > 0) {
        antiPatterns.push(threatDoNot(patternName, cnt));
      }
    }
  }

  // From discovery failure modes
  if (discovery && discovery.failureModes) {
    for (let fm = 0; fm < Math.min(discovery.failureModes.length, 5); fm++) {
      const f = discovery.failureModes[fm];
      const msg = String(f.message || 'defect').substring(0, 100);
      antiPatterns.push(`DO NOT repeat the pattern at \`${f.file}:${f.line}\` — ${msg}`);
    }
  }

  if (antiPatterns.length > 0) {
    p += '## DO NOT\n\n';
    for (const ap of antiPatterns) {
      p += `- ${ap}\n`;
    }
    p += '\n';
  }

  // ===========================================================================
  // SECTION 4: VERIFY (exact commands, sequential)
  // ===========================================================================
  p += '## VERIFY (run these exact commands in order)\n\n';
  p += '1. Run: `bun build src/index.ts --outdir dist --target bun --format esm --bundle` — must exit 0\n';
  p += '2. Run: `trident-code-audit` on the target — must show 0 CRITICAL findings\n';
  p += '3. Deploy to container and verify the plugin loads without errors\n';
  p += '4. Verify every registered tool responds with valid results\n';

  // Defense-specific verification steps
  if (defenseList.length > 0) {
    let vStep = 5;
    const seenMethods = new Set<string>();
    for (const d of defenseList) {
      const cm = d.checkMethod || '';
      if (cm && !seenMethods.has(cm)) {
        seenMethods.add(cm);
        const passT = d.thresholds?.passThreshold;
        const passStr = passT ? `${passT.operator || '>='} ${passT.value ?? '?'}` : 'pass';
        p += `${vStep}. Run: ${d.rule} check (${cm}) — must ${passStr}\n`;
        vStep++;
      }
    }
  }
  p += '\n';

  // ===========================================================================
  // FALLBACK: If no analysis data, provide minimal guidance
  // ===========================================================================
  if (!analysis || threats.length === 0) {
    p += '## NOTE\n\n';
    p += 'No AST threat analysis was available for this target. ';
    if (requirements && requirements.length > 20) {
      p += 'Follow the mission requirements above. ';
    }
    p += 'Run `trident-deep-planning` with `layer=2` on the target to generate a full threat analysis.\n\n';
  }

  return p;
}

// ============================================================================
// LAYER 1: INITIAL PLAN (exported) — Generative prompt + project metadata
// ============================================================================

// ============================================================================
// TEST-PLAN-FIRST (v2.0 mandate): mandatory container test plan generators
// Called by BOTH generateLayer1InitialPlan and generateLayer2DetailedWorkflow.
// Planning defines the tests; tests define "done"; the container validates both.
// ============================================================================

const ADVERSARIAL_ANGLE_LIBRARY: Array<{ id: string; name: string; question: string }> = [
  { id: 'IDENTITY', name: 'Identity Injection', question: 'Does the agent know its identity in the runtime environment?' },
  { id: 'TOOLS', name: 'Tool Availability', question: 'Are all required tools registered and callable?' },
  { id: 'FIREWALL', name: 'Firewall Enforcement', question: 'Are restricted operations actually blocked?' },
  { id: 'AUDIT', name: 'Audit Accuracy', question: 'Does the audit find real defects, not phantom ones?' },
  { id: 'LIFECYCLE', name: 'Lifecycle', question: 'Does activation/deactivation work as designed?' },
  { id: 'ERRORS', name: 'Error Propagation', question: 'What happens when a tool throws mid-operation?' },
  { id: 'BOUNDARY', name: 'Boundary Conditions', question: 'Empty input, max-size input, malformed data?' },
  { id: 'PERMISSIONS', name: 'Permission Bypass', question: 'Can a subagent escalate privileges?' },
  { id: 'STATE', name: 'State Corruption', question: 'What happens if persisted state is invalid?' },
  { id: 'CONFIG', name: 'Configuration Drift', question: 'What happens if env vars are missing?' },
  { id: 'CONCURRENCY', name: 'Concurrency', question: 'Parallel operations — races, collisions?' },
  { id: 'INTEGRATION', name: 'Integration Failure', question: 'Do modules work together as a system?' },
];

// Heuristic: map context keywords to relevant angles
function selectAnglesForContext(context: string): string[] {
  const l = (context || '').toLowerCase();
  const selected: string[] = [];
  const map: Array<{ key: string; angle: string }> = [
    { key: 'hook', angle: 'FIREWALL' },
    { key: 'firewall', angle: 'FIREWALL' },
    { key: 'audit', angle: 'AUDIT' },
    { key: 'identity', angle: 'IDENTITY' },
    { key: 'tool', angle: 'TOOLS' },
    { key: 'poseidon', angle: 'LIFECYCLE' },
    { key: 'error', angle: 'ERRORS' },
    { key: 'boundary', angle: 'BOUNDARY' },
    { key: 'permission', angle: 'PERMISSIONS' },
    { key: 'state', angle: 'STATE' },
    { key: 'config', angle: 'CONFIG' },
    { key: 'parallel', angle: 'CONCURRENCY' },
    { key: 'integrat', angle: 'INTEGRATION' },
  ];
  for (const m of map) {
    if (l.includes(m.key) && !selected.includes(m.angle)) selected.push(m.angle);
  }
  // Fill to minimum 5 with defaults
  const defaults = ['IDENTITY', 'TOOLS', 'FIREWALL', 'AUDIT', 'LIFECYCLE'];
  for (const d of defaults) {
    if (selected.length >= 5) break;
    if (!selected.includes(d)) selected.push(d);
  }
  return selected.slice(0, 5);
}

export function generateContainerTestPlanSection(
  context: string,
  angleSelection?: string[],
): string {
  const angleIds = (angleSelection && angleSelection.length >= 5
    ? angleSelection
    : selectAnglesForContext(context)).slice(0, 8);
  const angles = ADVERSARIAL_ANGLE_LIBRARY.filter(a => angleIds.includes(a.id));

  let out = '\n## CONTAINER TEST PLAN\n\n';
  out += 'This plan is written BEFORE implementation. It defines what "done" means.\n';
  out += 'Post-ship behavior in a real runtime environment, adversarially.\n\n';
  out += '### Adversarial Angles\n';
  angles.forEach((angle, i): void => {
    out += `${i + 1}. **${angle.name}** — ${angle.question}\n`;
  });
  out += '\n### Evidence Requirement\n';
  out += 'Every scenario: stream output, artifact on disk, SHA256, or exit code.\n';
  out += '"I tested it and it works" is NOT evidence.\n\n';
  out += '### Pass Threshold\n';
  out += 'ALL scenarios pass with mechanical evidence → runtime grade achieved.\n';
  return out;
}

// ── Container-testing skill contract (plan-first, token-based) ──
// The generated plan is a REAL plan: a build agent can extract the
// ## CONTAINER TEST PLAN section verbatim into .trident/test-plan.md and feed it
// to trident-container-test setup — it passes validateTestPlan (exact headers,
// 2000+ chars, behavioral tokens, adversarial present). Pass tokens are
// TOOL-RESULT-BOUND (JSON fields, error codes, gate values) per the
// anti-circularity rule — never agent-typeable words.
const CT_TOKEN_TEMPLATES: Record<string, { prompt: string; pass: string; fail: string; evidence: string }> = {
  IDENTITY:    { prompt: 'deploy the build, then trident-container-test action=verify-agent and verify-model', pass: '"verified":true', fail: '"verified":false', evidence: 'verify-agent JSON' },
  TOOLS:       { prompt: 'trident-container-test action=suite suite=quick', pass: 'SUITE_DISPATCHED', fail: 'unknown_action', evidence: 'suite JSON' },
  FIREWALL:    { prompt: 'attempt an inline smoke op (node -e) via bash in the container', pass: 'SSTF BLOCK', fail: 'node -e output', evidence: 'stream excerpt with the block code' },
  AUDIT:       { prompt: 'run the audit tool against the target and read the artifact', pass: 'CODE_REVIEW', fail: 'ARGUMENT VALIDATION FAILED', evidence: 'artifact file + lines' },
  LIFECYCLE:   { prompt: 'trident-container-test action=switch-agent agent=build then back', pass: '"switched":true', fail: '"switched":false', evidence: 'switch JSON' },
  ERRORS:      { prompt: 'call a container-test action with missing required params', pass: 'invalid_params', fail: 'ReferenceError', evidence: 'error JSON' },
  BOUNDARY:    { prompt: 'call setup with an undersized testPlan (probe-only)', pass: 'TEST PLAN VALIDATION FAILED', fail: 'testPlanValidated', evidence: 'setup JSON' },
  PERMISSIONS: { prompt: 'have the agent attempt a blocked tool (write in normal mode)', pass: 'BLOCKED', fail: 'file written', evidence: 'stream excerpt with the block' },
  STATE:       { prompt: 'trident-container-test action=connect to a nonexistent container', pass: 'container_not_found', fail: '"connected":true', evidence: 'connect JSON' },
  CONFIG:      { prompt: 'trident-container-test action=setup with a valid plan', pass: '"testPlanValidated":true', fail: 'TEST PLAN VALIDATION FAILED', evidence: 'setup JSON' },
  CONCURRENCY: { prompt: 'trident-container-test action=check twice on the same pattern', pass: '"matchCount"', fail: '"scannedBytes":0', evidence: 'both check JSONs (cursor advance)' },
  INTEGRATION: { prompt: 'trident-container-test action=alive', pass: '"overall":true', fail: '"overall":false', evidence: 'alive JSON' },
};

export function generateExactTestPlanSection(
  components: Array<{ name: string; description: string }>,
  defenses: string[],
  context: string,
): string {
  const angles = selectAnglesForContext(context + ' ' + (defenses || []).join(' '))
    .map(id => ADVERSARIAL_ANGLE_LIBRARY.find(a => a.id === id))
    .filter((a): a is { id: string; name: string; question: string } => !!a);
  const comps = (components && components.length > 0
    ? components
    : [{ name: 'system', description: context || 'the system under test' }]);
  const usedAngles = angles.length >= 5 ? angles.slice(0, 8) : angles;

  let out = '\n## CONTAINER TEST PLAN — EXACT (spec contract — plan-first)\n\n';
  out += 'This plan is the DEFINITION OF DONE. Extract this section verbatim into .trident/test-plan.md ';
  out += 'and feed it to trident-container-test action=setup — it passes validateTestPlan. ';
  out += 'Pass tokens are TOOL-RESULT-BOUND (JSON fields / error codes / gate values) — an agent ';
  out += 'cannot satisfy them by typing. Every component and its importers must map to a scenario.\n\n';
  out += '## OBJECTIVE\n';
  out += 'Runtime-grade verification of: ' + comps.map(c => c.name).join(', ') + '.\n';
  out += 'Each component maps to scenarios below; blast radius (importers of changed files) covered by regression scenarios.\n\n';
  out += '## TOOLS UNDER TEST\n';
  comps.forEach((c): void => { out += '- ' + c.name + ' — ' + (c.description || '').substring(0, 120) + ' (scenarios below)\n'; });
  out += '\n## TEST SCENARIOS\n';
  let n = 0;
  for (const comp of comps) {
    for (const angle of usedAngles) {
      n++;
      const t = CT_TOKEN_TEMPLATES[angle.id] || CT_TOKEN_TEMPLATES.INTEGRATION;
      out += '### Scenario ' + n + ': ' + comp.name + ' — ' + angle.name + '\n';
      out += '- Feature under test: ' + comp.name + ' (' + angle.question + ')\n';
      out += '- Prompt: ' + t.prompt + '\n';
      out += '- Pass token: ' + t.pass + '\n';
      out += '- Fail token: ' + t.fail + '\n';
      out += '- Max wait: 60000\n';
      out += '- Evidence capture: ' + t.evidence + '\n\n';
    }
  }
  out += '## ADVERSARIAL\n';
  out += '### Adversarial 1: ' + comps[0].name + ' — hostile input\n';
  out += '- Feature under test: ' + comps[0].name + ' rejects malformed/undersized input\n';
  out += '- Prompt: send malformed input targeting ' + comps[0].name + '\n';
  out += '- Pass token: ARGUMENT VALIDATION FAILED\n';
  out += '- Fail token: accepted-invalid-input\n';
  out += '- Max wait: 60000\n';
  out += '- Evidence capture: stream excerpt with the rejection token\n\n';
  out += '## EVIDENCE\n';
  out += 'Per scenario: action=check pattern="<pass token>" MUST match AND pattern="<fail token>" MUST NOT match; ';
  out += 'the pass token must appear in a TOOL RESULT (tool-result-context) not agent free text (anti-circularity); ';
  out += 'artifacts + sha256 as declared.\n\n';
  out += '## PASS CRITERIA\n';
  out += 'ALL ' + n + ' scenarios + adversarial pass with passToken present AND failToken absent (tool-result-context verified). ';
  out += 'Any failToken appearance = suite FAILED.\n';
  return out;
}
// ============================================================================
// LAYER 1: INITIAL PLAN (exported)
// ============================================================================

export function generateLayer1InitialPlan(
  targetPath: string,
  projectName: string,
  requirements: string,
  architecture: string,
  discovery?: DiscoveryResult | null,
  analysis?: AnalysisResult | null,
): string {
  const ts = new Date().toISOString();
  const version = TRIDENT_CONFIG.version;

  let a = '';

  // -- HEADER --
  a += `# BUILD SPEC ARTIFACT — ${projectName}\n\n`;
  a += `**Target:** ${targetPath}\n`;
  a += `**Generated:** ${ts}\n`;
  a += `**Trident Version:** v${version}\n`;
  a += `**Status:** PLANNING\n`;
  a += `**Artifact Type:** BUILD_SPEC (Layer 1 Prompt + Layer 2 Implementation)\n`;
  a += `**Discovery:** ${discovery ? `ENABLED (${discovery.totalFiles} files, ${discovery.totalLines} lines)` : 'DISABLED'}\n\n`;

  if (discovery) {
    a += `**Discovered Intelligence:**\n`;
    a += `- Languages: ${Object.entries(discovery.languages).map(([k, v]) => `${k} (${v})`).join(', ')}\n`;
    a += `- Entry Points: ${discovery.entryPoints.join(', ') || 'none'}\n`;
    a += `- Patterns: ${discovery.patterns.length} | Failures: ${discovery.failureModes.length} | Decisions: ${discovery.decisions.length}\n`;
    a += `- Warheads: ${discovery.warheads.length} | Audit Layers: ${discovery.auditLayers.length}\n\n`;
  }

  a += `---\n\n`;

  // -- EMBED LAYER 1 (GENERATIVE PROMPT) --
  a += generateLayer1Prompt(requirements, architecture, discovery);

  // -- TEST-PLAN-FIRST (v2.0 mandate): the plan defines what "done" means --
  a += generateContainerTestPlanSection(requirements + ' ' + architecture);

  return a;
}

// ============================================================================
// LAYER 2: DETAILED WORKFLOW (exported) — Implementation build spec
// ============================================================================

// ============================================================================
// LAYER 2: DETAILED WORKFLOW (exported) — v2.0 ASSEMBLER
// The agent writes FULL MARKDOWN sections; the tool ASSEMBLES them with
// discovery data. NO pipe-delimited parsing. Content is inserted VERBATIM.
// ============================================================================

export function generateLayer2DetailedWorkflow(
  targetPath: string,
  projectName: string,
  requirements: string,
  architecture: string,
  discovery?: DiscoveryResult | null,
  // FULL MARKDOWN SECTIONS — agent writes complete engineering content:
  executiveSummary?: string,
  architectureOverview?: string,
  dataModel?: string,
  engineDesign?: string,
  defenseRules?: string[],
  blindSpots?: string,
  integrationPlan?: string,
  evidenceFormat?: string,
  testSpecs?: string,
  migrationStrategy?: string,
): string {
  // SECTION VALIDATION — no boilerplate allowed
  const sections: Record<string, string | string[] | undefined> = {
    executiveSummary, architectureOverview, dataModel, engineDesign,
    defenseRules, blindSpots, integrationPlan, evidenceFormat, testSpecs, migrationStrategy,
  };
  const missing: string[] = [];
  for (const [name, value] of Object.entries(sections)) {
    if (!value || (typeof value === 'string' && value.trim().length < 50) || (Array.isArray(value) && value.length === 0)) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error('Missing required sections for L2 artifact: ' + missing.join(', ') + '. Each section needs at least 50 characters of markdown content. Generate from the context brief.');
  }

  let spec = '';

  // HEADER
  spec += `# BUILD SPEC: ${projectName}\n\n`;
  spec += `**Version:** 1.0\n`;
  spec += `**Generated:** ${new Date().toISOString()}\n`;
  spec += `**Target:** ${targetPath}\n`;
  if (discovery) {
    spec += `**Files Discovered:** ${discovery.totalFiles}\n`;
    spec += `**Lines Analyzed:** ${discovery.totalLines}\n`;
    spec += `**Patterns:** ${discovery.patterns.length} | **Failure Modes:** ${discovery.failureModes.length}\n`;
  }
  spec += `\n---\n\n`;

  // TABLE OF CONTENTS
  spec += `## Table of Contents\n\n`;
  spec += `1. [Executive Summary](#1-executive-summary)\n`;
  spec += `2. [Architecture Overview](#2-architecture-overview)\n`;
  spec += `3. [Data Model](#3-data-model)\n`;
  spec += `4. [Engine Class Design](#4-engine-class-design)\n`;
  let sectionNum = 5;
  const ruleCount = defenseRules?.length || 0;
  for (let i = 0; i < ruleCount; i++) {
    spec += `${sectionNum + i}. [Defense Rule ${i + 1}](#${sectionNum + i}-defense-rule-${i + 1})\n`;
  }
  sectionNum += ruleCount;
  spec += `${sectionNum++}. [Blind Spot Reporting](#blind-spot-reporting)\n`;
  spec += `${sectionNum++}. [Integration](#integration)\n`;
  spec += `${sectionNum++}. [Evidence Output Format](#evidence-output-format)\n`;
  spec += `${sectionNum++}. [Test Specifications](#test-specifications)\n`;
  spec += `${sectionNum++}. [File Manifest](#file-manifest)\n`;
  spec += `${sectionNum++}. [Bible Compliance Matrix](#bible-compliance-matrix)\n`;
  spec += `${sectionNum++}. [Migration Strategy](#migration-strategy)\n`;
  spec += `\n---\n\n`;
  // ── PLAN-FIRST (container-testing skill contract): the EXACT test plan is
  // embedded directly after the TOC — the verification suite is part of the
  // spec contract, not an appendix. A build agent extracts this section
  // verbatim into .trident/test-plan.md and feeds it to trident-container-test
  // setup (it passes validateTestPlan).
  const componentsArg = [{ name: projectName, description: targetPath }];
  const defensesArg: string[] = [];
  if (defenseRules) defensesArg.push(...defenseRules);
  spec += `## 0B. CONTAINER TEST PLAN — EXACT (spec contract — plan-first)\n\n`;
  spec += generateExactTestPlanSection(componentsArg, defensesArg, requirements + ' ' + architecture);
  spec += `\n---\n\n`;


  // SECTION 1: Executive Summary
  spec += `## 1. Executive Summary\n\n`;
  if (executiveSummary && executiveSummary.trim().length > 50) {
    spec += executiveSummary.trim() + '\n\n';
  } else if (requirements && requirements.trim().length > 20) {
    spec += requirements.trim() + '\n\n';
  } else {
    spec += '*No executive summary provided. The requirements parameter should contain the problem statement and solution overview.*\n\n';
  }
  if (discovery && discovery.failureModes.length > 0) {
    spec += `### Discovered Failure Modes\n\n`;
    spec += `| # | Failure Mode | Location | Pattern |\n`;
    spec += `|---|-------------|----------|--------|\n`;
    for (let i = 0; i < Math.min(discovery.failureModes.length, 30); i++) {
      const fm = discovery.failureModes[i];
      spec += `| ${i + 1} | ${fm.message.substring(0, 80)} | \`${fm.file}:${fm.line}\` | \`${fm.pattern}\` |\n`;
    }
    spec += '\n';
  }

  // SECTION 2: Architecture Overview
  spec += `## 2. Architecture Overview\n\n`;
  if (architectureOverview && architectureOverview.trim().length > 50) {
    spec += architectureOverview.trim() + '\n\n';
  } else if (architecture && architecture.trim().length > 20) {
    spec += architecture.trim() + '\n\n';
  } else {
    spec += '*No architecture overview provided.*\n\n';
  }
  if (discovery) {
    spec += `### Project Structure\n\n`;
    spec += '```\n' + discovery.directoryTree + '\n```\n\n';
    if (discovery.entryPoints.length > 0) {
      spec += `### Entry Points\n\n`;
      for (const ep of discovery.entryPoints) {
        spec += `- \`${ep}\`\n`;
      }
      spec += '\n';
    }
    if (discovery.languages && Object.keys(discovery.languages).length > 0) {
      spec += `### Language Breakdown\n\n`;
      spec += `| Language | Files |\n|----------|-------|\n`;
      for (const [lang, count] of Object.entries(discovery.languages)) {
        spec += `| ${lang} | ${count} |\n`;
      }
      spec += '\n';
    }
  }

  // SECTION 3: Data Model
  spec += `## 3. Data Model\n\n`;
  if (dataModel && dataModel.trim().length > 50) {
    spec += dataModel.trim() + '\n\n';
  } else {
    spec += '*No data model provided. Include full TypeScript interface definitions with field-by-field rationale.*\n\n';
  }
  if (discovery && discovery.patterns.length > 0) {
    const interfaces = discovery.patterns.filter((p: DiscoveredPattern) => p.type === 'interface');
    const classes = discovery.patterns.filter((p: DiscoveredPattern) => p.type === 'class');
    if (interfaces.length > 0 || classes.length > 0) {
      spec += `### Existing Types in Codebase\n\n`;
      spec += `| Type | Kind | Location | Signature |\n`;
      spec += `|------|------|----------|----------|\n`;
      for (const i of interfaces.slice(0, 15)) {
        spec += `| ${i.name} | interface | \`${i.file}:${i.line}\` | \`${(i.signature || '').substring(0, 80)}\` |\n`;
      }
      for (const c of classes.slice(0, 10)) {
        spec += `| ${c.name} | class | \`${c.file}:${c.line}\` | \`${(c.signature || '').substring(0, 80)}\` |\n`;
      }
      spec += '\n';
    }
  }

  // SECTION 4: Engine Class Design
  spec += `## 4. Engine Class Design\n\n`;
  if (engineDesign && engineDesign.trim().length > 50) {
    spec += engineDesign.trim() + '\n\n';
  } else {
    spec += '*No engine design provided. Include complete TypeScript class skeletons with method bodies, constructor injection, lifecycle hooks.*\n\n';
  }
  if (discovery && discovery.codeSections) {
    const classSections = discovery.codeSections.filter((s: CodeSection) => s.type === 'class');
    if (classSections.length > 0) {
      spec += `### Existing Class Reference\n\n`;
      for (const cs of classSections.slice(0, 5)) {
        spec += `**${cs.sectionName}** (\`${cs.filePath}:${cs.lineStart}-${cs.lineEnd}\`)\n\n`;
        spec += '```typescript\n' + cs.code.substring(0, 600) + '\n```\n\n';
      }
    }
  }

  // SECTIONS 5-N: Defense Rules
  if (defenseRules && defenseRules.length > 0) {
    for (let i = 0; i < defenseRules.length; i++) {
      const sectionNumber = 5 + i;
      spec += `## ${sectionNumber}. Defense Rule ${i + 1}\n\n`;
      if (defenseRules[i] && defenseRules[i].trim().length > 50) {
        spec += defenseRules[i].trim() + '\n\n';
      } else {
        spec += `*No content provided for defense rule ${i + 1}.*\n\n`;
      }
      if (discovery && i < discovery.failureModes.length) {
        const fm = discovery.failureModes[i];
        spec += `### Related Discovered Failure\n\n`;
        spec += `**Pattern:** \`${fm.pattern}\`\n`;
        spec += `**Location:** \`${fm.file}:${fm.line}\`\n`;
        spec += `**Message:** ${fm.message}\n\n`;
        if (fm.codeSnippet) {
          spec += '```typescript\n' + fm.codeSnippet.substring(0, 400) + '\n```\n\n';
        }
      }
    }
  }

  // BLIND SPOT REPORTING
  spec += `## Blind Spot Reporting\n\n`;
  if (blindSpots && blindSpots.trim().length > 50) {
    spec += blindSpots.trim() + '\n\n';
  } else {
    spec += '*No blind spot analysis provided. Include: what the engine cannot detect, why, and impact.*\n\n';
  }
  if (discovery && discovery.failureModes.length > (defenseRules?.length || 0)) {
    spec += `### Unmatched Failure Modes\n\n`;
    spec += `These failure modes have no corresponding defense rule:\n\n`;
    for (let i = defenseRules?.length || 0; i < Math.min(discovery.failureModes.length, (defenseRules?.length || 0) + 15); i++) {
      const fm = discovery.failureModes[i];
      spec += `- \`${fm.file}:${fm.line}\` — ${fm.message.substring(0, 100)}\n`;
    }
    spec += '\n';
  }

  // INTEGRATION
  spec += `## Integration\n\n`;
  if (integrationPlan && integrationPlan.trim().length > 50) {
    spec += integrationPlan.trim() + '\n\n';
  } else {
    spec += '*No integration plan provided. Include: import paths, hook registration, orchestrator wiring.*\n\n';
  }
  if (discovery) {
    if (discovery.warheads && discovery.warheads.length > 0) {
      spec += `### Existing Enforcement Infrastructure\n\n`;
      spec += `**Warheads:** ${discovery.warheads.join(', ')}\n\n`;
    }
    if (discovery.auditLayers && discovery.auditLayers.length > 0) {
      spec += `**Audit Layers:** ${discovery.auditLayers.join(', ')}\n\n`;
    }
  }

  // EVIDENCE OUTPUT FORMAT
  spec += `## Evidence Output Format\n\n`;
  if (evidenceFormat && evidenceFormat.trim().length > 50) {
    spec += evidenceFormat.trim() + '\n\n';
  } else {
    spec += `### Finding Structure\n\n`;
    spec += '```typescript\n';
    spec += `interface Finding {\n`;
    spec += `  rule: string;        // Rule that generated this finding\n`;
    spec += `  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';\n`;
    spec += `  message: string;     // Human-readable description\n`;
    spec += `  file: string;        // Source file\n`;
    spec += `  line: number;        // Source line\n`;
    spec += `  evidence: string;    // Code snippet or pattern match\n`;
    spec += `  recommendation: string; // Suggested fix\n`;
    spec += `}\n`;
    spec += '```\n\n';
    if (discovery && discovery.failureModes.length > 0) {
      const fm = discovery.failureModes[0];
      spec += `### Sample Output\n\n`;
      spec += '```json\n';
      spec += JSON.stringify({
        rule: 'Defense Rule 1',
        severity: 'HIGH',
        message: fm.message,
        file: fm.file,
        line: fm.line,
        evidence: (fm.codeSnippet || '').substring(0, 100) || fm.pattern,
        recommendation: 'Apply defense rule algorithm and verify fix'
      }, null, 2) + '\n```\n\n';
    }
  }

  // TEST SPECIFICATIONS
  spec += `## Test Specifications\n\n`;
  if (testSpecs && testSpecs.trim().length > 50) {
    spec += testSpecs.trim() + '\n\n';
  } else {
    spec += '*No test specifications provided. Include negative and positive tests per rule.*\n\n';
  }

  // FILE MANIFEST — ALWAYS from discovery
  spec += `## File Manifest\n\n`;
  if (discovery && discovery.codeSections && discovery.codeSections.length > 0) {
    spec += `| File | Type | Lines | Section |\n`;
    spec += `|------|------|-------|--------|\n`;
    for (const cs of discovery.codeSections.slice(0, 60)) {
      spec += `| \`${cs.filePath}\` | ${cs.type} | ${cs.lineStart}-${cs.lineEnd} | ${cs.sectionName.substring(0, 60)} |\n`;
    }
    spec += '\n';
  } else {
    spec += '*No files discovered. Run discovery on a valid target path.*\n\n';
  }

  // BIBLE COMPLIANCE MATRIX — static
  spec += `## Bible Compliance Matrix\n\n`;
  spec += `| Standard | Section | Requirement | How Satisfied |\n`;
  spec += `|----------|---------|-------------|---------------|\n`;
  spec += `| RGAAS | §4 Tool Design | Atomicity, Observability, Safety | Each defense rule is an atomic check |\n`;
  spec += `| RGAAS | §8 Verification | Read-back verification | Evidence output format provides verifiable findings |\n`;
  spec += `| RGAAS | §9 Constraints | Path whitelisting | Rules operate on specified target paths |\n`;
  spec += `| SSEB | §3 Analysis Order | AST not regex | Rules use TypeScript compiler API where applicable |\n`;
  spec += `| SSEB | §4 Enforcement | Pre-write blocking | Integration plan specifies hook registration |\n`;
  spec += `| SSEB | §7 Anti-theatrical | No {success:true} stubs | Rules require real side effects |\n`;
  spec += `| SECT3 | IL-01 | Read before write | Discovery runs before spec generation |\n`;
  spec += `| SECT3 | IL-02 | Prove before claim | Evidence format requires verifiable output |\n`;
  spec += `| SECT3 | IL-06 | Error path completeness | Failure modes section documents all error paths |\n`;
  spec += `| SECT3 | IL-10 | No silent failures | Blind spots section documents what cannot be detected |\n`;
  spec += `\n`;

  // MIGRATION STRATEGY
  spec += `## Migration Strategy\n\n`;
  if (migrationStrategy && migrationStrategy.trim().length > 50) {
    spec += migrationStrategy.trim() + '\n\n';
  } else {
    spec += `### Phase 1: Foundation\n`;
    spec += `- Build core data structures and interfaces\n`;
    spec += `- Verification: TypeScript compilation passes\n`;
    spec += `- Rollback: \`git checkout HEAD -- src/\`\n\n`;
    spec += `### Phase 2: Core Rules\n`;
    spec += `- Implement defense rules one at a time\n`;
    spec += `- Verification: Each rule produces findings on test inputs\n`;
    spec += `- Rollback: \`git revert <commit>\`\n\n`;
    spec += `### Phase 3: Integration\n`;
    spec += `- Wire into orchestrator and hooks\n`;
    spec += `- Verification: Plugin loads, tools registered, hooks fire\n`;
    spec += `- Rollback: Disable plugin in config\n\n`;
    spec += `### Phase 4: Full Deployment\n`;
    spec += `- Enable in production container\n`;
    spec += `- Verification: Container test passes, ship gate green\n`;
    spec += `- Rollback: Revert to previous bundle\n\n`;
  }

  // (test plan is embedded plan-first after the TOC — see ## 0B)
  spec += `\n---\n*Generated by Trident Deep Planning Engine*\n`;

  return spec;
}

// ============================================================================
// WRAPPER: Backward-compatible combined artifact (Layer 1 + Layer 2)
// ============================================================================

export function generateBuildSpecArtifact(
  targetPath: string,
  projectName: string,
  requirements: string,
  architecture: string,
  discovery?: DiscoveryResult | null
): string {
  return generateLayer1InitialPlan(targetPath, projectName, requirements, architecture, discovery)
    + '\n\n---\n\n'
    + generateLayer2DetailedWorkflow(targetPath, projectName, requirements, architecture, discovery);
}

// ============================================================================
// LAYER 3: FULL CONTEXT LIBRARY MANIFEST (exported, 9 files to disk)
// Each file is 200+ lines. Signature preserved for trident-tools.ts.
// ============================================================================

export function generateContextLibraryManifest(
  projectName: string,
  architecture: string,
  patterns: string[],
  failures: string[],
  decisions: string[],
  targetPath?: string,
  discovery?: DiscoveryResult | null,
  recursive?: boolean,
  engineSpecs?: string[],
): string {
  const safeName = safeIdent(projectName);
  const version = TRIDENT_CONFIG.version;
  resetRepetitionTracker();

  // 1. RUN FULL ANALYSIS ON PROJECT
  const analysis = analyzeProject(targetPath || '', '', discovery ?? null);

  // 2. IDENTIFY ENGINES
  const engines = identifyEngines(discovery);

  let manifest = '';
  manifest += `# CONTEXT LIBRARY — ${projectName}\n\n`;
  manifest += `**Generated:** ${new Date().toISOString()}\n`;
  manifest += `**Trident Version:** v${version}\n`;
  manifest += `**Engines:** ${engines.length}\n`;
  manifest += `**Total Threats:** ${analysis?.threats.length ?? 0}\n`;
  manifest += `**Total Defenses:** ${analysis?.defenses.length ?? 0}\n`;
  manifest += `**Discovery:** ${discovery ? `ENABLED (${discovery.totalFiles} files)` : 'DISABLED'}\n\n`;

  // Engine identification table
  if (engines.length > 0) {
    manifest += `## Engine Identification\n\n`;
    manifest += `| # | Engine | Directory | Patterns | Code Sections |\n`;
    manifest += `|---|--------|-----------|----------|---------------|\n`;
    for (let i = 0; i < engines.length; i++) {
      manifest += `| ${i + 1} | ${engines[i].name} | \`${engines[i].directory}\` | ${engines[i].patterns.length} | ${engines[i].codeSections.length} |\n`;
    }
    manifest += `\n`;
  }

  // 3. WRITE TO DISK
  if (!targetPath) {
    return manifest;
  }

  const contextLibDir = path.join(targetPath, 'context-library');
  try {
    fs.mkdirSync(contextLibDir, { recursive: true });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    tridentLog('WARN', 'deep-planning', `Failed to create context-library dir: ${errMsg}`);
    return manifest;
  }

  // 4. PER-ENGINE FULL L2 SPECS
  if (engineSpecs && engineSpecs.length > 0) {
    for (let i = 0; i < engineSpecs.length; i++) {
      const engineFilename = `${String(i + 1).padStart(2, '0')}_${safeIdent(engines[i]?.name || 'engine_' + (i + 1)).toUpperCase()}_SPEC.md`;
      try {
        fs.writeFileSync(path.join(contextLibDir, engineFilename), engineSpecs[i], 'utf-8');
        tridentLog('INFO', 'deep-planning', `Agent-provided engine spec written: ${engineFilename} (${(engineSpecs[i] || '').split('\n').length} lines)`);
        manifest += `### ${engines[i]?.name || 'Engine ' + (i + 1)}\n- File: \`${engineFilename}\`\n- Lines: ${(engineSpecs[i] || '').split('\n').length}\n\n`;
      } catch (e: unknown) {
        tridentLog('WARN', 'deep-planning', `Failed to write engine spec: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else if (engines.length > 0 && discovery) {
    // AUTO-GENERATE per-engine specs using PIPELINE
    for (const engine of engines) {
      try {
        const scopedDiscovery = scopeDiscoveryToEngine(discovery, engine);
        const engineDir = path.join(targetPath, engine.directory);
        const engineAnalysis = analyzeProject(engineDir, `Engine: ${engine.name}`, scopedDiscovery);

        let spec: string;
        if (engineAnalysis) {
          // PIPELINE generates the full spec from AST analysis for this engine
          spec = generatePipelineSpec(
            engineAnalysis.constructs,
            engineAnalysis.callGraph,
            `Engine: ${engine.name} (${engine.patterns.length} patterns, ${engine.codeSections.length} code sections)`,
            architecture,
            scopedDiscovery,
            engine.name,
            engineDir,
          );
        } else {
          // No constructs — fallback to discovery-based spec
          spec = generateEngineSpecFromDiscovery(engine, scopedDiscovery);
        }

        const engineFilename = `${safeIdent(engine.name).toUpperCase()}_SPEC.md`;
        fs.writeFileSync(path.join(contextLibDir, engineFilename), spec, 'utf-8');
        const specLines = (spec || '').split('\n').length;
        tridentLog('INFO', 'deep-planning', `Engine spec written: ${engineFilename} (${specLines} lines, ${engineAnalysis?.threats.length ?? 0} threats)`);
        manifest += `### ${engine.name}\n- File: \`${engineFilename}\`\n- Lines: ${specLines}\n- Threats: ${engineAnalysis?.threats.length ?? 0}\n- Defenses: ${engineAnalysis?.defenses.length ?? 0}\n\n`;
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        tridentLog('ERROR', 'deep-planning', `Engine spec generation failed for ${engine.name}: ${errMsg}`);
        manifest += `### ${engine.name}\n- **ERROR:** ${errMsg}\n\n`;
      }
    }
  } else {
    manifest += `\n**No engines identified from discovery data.**\n\n`;
  }

  // 5. MASTER PLAN
  try {
    const masterPlan = generateMasterPlan(projectName, engines, analysis, discovery ?? null);
    fs.writeFileSync(path.join(contextLibDir, 'MASTER_OVERHAUL_PLAN.md'), masterPlan, 'utf-8');
    tridentLog('INFO', 'deep-planning', `Master plan written (${(masterPlan || '').split('\n').length} lines)`);
  } catch (e: unknown) {
    tridentLog('WARN', 'deep-planning', `Failed to write master plan: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 6. INDEX
  try {
    const indexContent = generateLibraryIndex(projectName, engines, analysis, discovery ?? null);
    fs.writeFileSync(path.join(contextLibDir, 'INDEX.md'), indexContent, 'utf-8');
  } catch (e: unknown) {
    tridentLog('WARN', 'deep-planning', `Failed to write index: ${e instanceof Error ? e.message : String(e)}`);
  }

  manifest += `\n---\n*Generated by Trident v${version} — L3 Batch Engine Spec Generator*\n`;
  return manifest;
}

// ============================================================================
// L3 HELPERS: Master plan, engine fallback spec, library index
// ============================================================================

function generateMasterPlan(
  projectName: string,
  engines: EngineInfo[],
  analysis: AnalysisResult | null,
  discovery: DiscoveryResult | null,
): string {
  let p = '';
  p += `# OVERHAUL PLAN — ${projectName}\n\n`;
  p += `**Generated:** ${new Date().toISOString()}\n`;
  p += `**Engines:** ${engines.length}\n`;
  p += `**Total Threats:** ${analysis?.threats.length ?? 0}\n`;
  p += `**Total Defenses:** ${analysis?.defenses.length ?? 0}\n\n`;

  p += `## Engine Architecture\n\n`;
  p += `| Engine | Directory | Patterns | Code Sections |\n`;
  p += `|--------|-----------|----------|---------------|\n`;
  for (const engine of engines) {
    p += `| ${engine.name} | \`${engine.directory}\` | ${engine.patterns.length} | ${engine.codeSections.length} |\n`;
  }
  p += '\n';

  if (analysis && analysis.threats.length > 0) {
    p += `## Threat Distribution\n\n`;
    const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const t of analysis.threats) {
      const sev = t.severity || 'UNKNOWN';
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    }
    p += `| Severity | Count |\n|----------|-------|\n`;
    for (const [sev, count] of Object.entries(bySeverity)) {
      p += `| ${sev} | ${count} |\n`;
    }
    p += '\n';
  }

  if (analysis && analysis.pipeline && analysis.pipeline.phases) {
    p += `## Build Order\n\n`;
    for (let bi = 0; bi < analysis.pipeline.phases.length; bi++) {
      const phase = analysis.pipeline.phases[bi];
      p += `### Phase ${bi}: ${phase.domain || 'unknown'} (${phase.executionModel || '?'})\n`;
      if (phase.defenses && phase.defenses.length > 0) {
        p += `Defenses: ${phase.defenses.join(', ')}\n\n`;
      } else {
        p += '\n';
      }
    }
  }

  p += `## Shared Infrastructure\n\n`;
  p += `- **Type System:** ${analysis?.types.length ?? 0} generated interfaces\n`;
  p += `- **Defense Pipeline:** ${analysis?.defenses.length ?? 0} active rules\n`;
  p += `- **Test Coverage:** ${analysis?.tests.length ?? 0} generated test cases\n`;
  p += `- **Evidence Format:** JSON with Merkle chain\n`;

  return p;
}

function generateEngineSpecFromDiscovery(engine: EngineInfo, discovery: DiscoveryResult): string {
  let spec = '';
  spec += `# ENGINE SPEC: ${engine.name}\n\n`;
  spec += `**Directory:** \`${engine.directory}\`\n`;
  spec += `**Patterns:** ${engine.patterns.length}\n`;
  spec += `**Code Sections:** ${engine.codeSections.length}\n\n`;

  spec += `## Patterns\n\n`;
  spec += `| Pattern | Type | File | Line |\n`;
  spec += `|---------|------|------|------|\n`;
  for (const p of engine.patterns) {
    spec += `| ${p.name} | ${p.type} | \`${p.file}\` | ${p.line} |\n`;
  }
  spec += '\n';

  if (engine.codeSections.length > 0) {
    spec += `## Code Sections\n\n`;
    for (const cs of engine.codeSections) {
      spec += `### ${cs.sectionName}\n`;
      spec += `**Type:** ${cs.type} | **Lines:** ${cs.lineStart}-${cs.lineEnd}\n\n`;
      spec += '```typescript\n' + cs.code.substring(0, 500) + '\n```\n\n';
    }
  }

  const engineFailures = discovery.failureModes.filter(fm => path.dirname(fm.file) === engine.directory);
  if (engineFailures.length > 0) {
    spec += `## Failure Modes\n\n`;
    for (const fm of engineFailures) {
      spec += `- \`${fm.file}:${fm.line}\` — ${fm.message}\n`;
    }
  }

  spec += `\n---\n*Generated from discovery data (no AST constructs found for pipeline analysis)*\n`;
  return spec;
}

function generateLibraryIndex(
  projectName: string,
  engines: EngineInfo[],
  analysis: AnalysisResult | null,
  discovery: DiscoveryResult | null,
): string {
  let idx = '';
  idx += `# Context Library Index — ${projectName}\n\n`;
  idx += `**Generated:** ${new Date().toISOString()}\n\n`;
  idx += `## Engine Specs\n\n`;
  idx += `| File | Engine | Lines |\n`;
  idx += `|------|--------|-------|\n`;
  for (const engine of engines) {
    const fname = `${safeIdent(engine.name).toUpperCase()}_SPEC.md`;
    idx += `| [${fname}](${fname}) | ${engine.name} | Pipeline-generated |\n`;
  }
  idx += `| [MASTER_OVERHAUL_PLAN.md](MASTER_OVERHAUL_PLAN.md) | - | Overview |\n`;
  idx += '\n';

  if (discovery) {
    idx += `## Project Metrics\n\n`;
    idx += `- Files: ${discovery.totalFiles}\n`;
    idx += `- Lines: ${discovery.totalLines}\n`;
    idx += `- Patterns: ${discovery.patterns.length}\n`;
    idx += `- Failure Modes: ${discovery.failureModes.length}\n`;
    idx += `- Engines: ${engines.length}\n`;
  }

  if (analysis) {
    idx += `## Analysis Summary\n\n`;
    idx += `- Threats: ${analysis.threats.length}\n`;
    idx += `- Defenses: ${analysis.defenses.length}\n`;
    idx += `- Pipeline Phases: ${analysis.pipeline?.phases?.length ?? 0}\n`;
    idx += `- Test Cases: ${analysis.tests.length}\n`;
  }

  return idx;
}

// ============================================================================
// CONTEXT BRIEF GENERATOR — ingests source files, extracts structure,
// returns a brief that tells the agent exactly what to write in each section
// ============================================================================

export interface ContextFileEntry {
  path: string;
  content: string;
  lines: number;
}

// -- SEMANTIC INTELLIGENCE: Type Analysis --
interface FieldTypeAnalysis {
  category: string;
  referencedType: string | null;
  unionMembers: string[] | null;
  isOptional: boolean;
  isReadonly: boolean;
  isGeneric: boolean;
  genericArguments: string[] | null;
}

// -- SEMANTIC INTELLIGENCE: Method Body Analysis --
interface MethodBodyAnalysis {
  returnCount: number;
  hasEarlyExit: boolean;
  throwCount: number;
  hasErrorHandling: boolean;
  hasLoop: boolean;
  hasAsyncAwait: boolean;
  hasProcessExecution: boolean;
  hasFilesystemIO: boolean;
  hasNetworkIO: boolean;
  sideEffectCategories: string[];
}

// -- SEMANTIC INTELLIGENCE: Cross-File Type Relationships --
interface TypeRelationship {
  typeName: string;
  definedIn: string;
  consumedBy: string[];
  producedBy: string[];
  acceptedBy: string[];
}

interface ExtractedInterface {
  name: string;
  fields: Array<{ name: string; type: string; optional: boolean; comment?: string; typeAnalysis?: FieldTypeAnalysis }>;
  file: string;
  line: number;
  comment?: string | null;
}

interface ExtractedClass {
  name: string;
  methods: Array<{ name: string; params: string; returnType: string; line: number; bodyAnalysis?: MethodBodyAnalysis }>;
  fields: Array<{ name: string; type: string; modifier: string; line: number }>;
  file: string;
  line: number;
  comment?: string | null;
}

interface ExtractedFunction {
  name: string;
  params: string;
  returnType: string;
  file: string;
  line: number;
  isExported: boolean;
  isAsync: boolean;
  comment?: string | null;
}

interface ExtractedTypeAlias {
  name: string;
  definition: string;
  file: string;
  line: number;
}

interface ExtractedEnum {
  name: string;
  values: string[];
  file: string;
  line: number;
}

interface ExtractedImport {
  from: string;
  imports: string[];
  file: string;
}

interface ExtractedConstObject {
  name: string;
  typeAnnotation: string;
  file: string;
  line: number;
  endLine: number;
  body: string;
  checkMethodBody: string | null;
  hasCheckMethod: boolean;
  comment?: string | null;
}

// ============================================================================
// SEMANTIC INTELLIGENCE: Leading comment extraction via TypeScript AST
// ============================================================================

function extractAttachedComment(
  sourceFile: ts.SourceFile,
  pos: number
): string | null {
  const text = sourceFile.getFullText();
  const commentRanges = ts.getLeadingCommentRanges(text, pos);
  if (!commentRanges || commentRanges.length === 0) return null;

  return commentRanges
    .map(function(range: ts.CommentRange) {
      const raw = text.substring(range.pos, range.end);
      if (raw.startsWith('/**') || raw.startsWith('/*!')) {
        return raw
          .replace(/^\/\*[*!]\s*/, '')
          .replace(/\s*\*\/$/, '')
          .split('\n')
          .map(function(line: string) { return line.replace(/^\s*\*\s?/, '').trim(); })
          .filter(function(l: string) { return l.length > 0; })
          .join('\n');
      }
      if (raw.startsWith('//')) {
        return raw.replace(/^\/\/\s*/, '').trim();
      }
      return '';
    })
    .join('\n')
    .trim() || null;
}

// ============================================================================
// SEMANTIC INTELLIGENCE: Field type classification via AST type guards
// ============================================================================

function analyzeFieldType(
  propertyNode: ts.PropertySignature,
  sourceFile: ts.SourceFile
): FieldTypeAnalysis {
  const typeNode = propertyNode.type;
  const analysis: FieldTypeAnalysis = {
    category: 'complex',
    referencedType: null,
    unionMembers: null,
    isOptional: !!propertyNode.questionToken,
    isReadonly: (ts.getCombinedModifierFlags(propertyNode as ts.Declaration) & ts.ModifierFlags.Readonly) !== 0,
    isGeneric: false,
    genericArguments: null,
  };

  if (!typeNode) return analysis;

  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName;
    const name = ts.isIdentifier(typeName) ? typeName.text : typeName.getText(sourceFile);
    analysis.category = 'reference';
    analysis.referencedType = name;
    if (['Map', 'Set', 'Promise', 'Array', 'ReadonlyArray', 'Partial', 'Required', 'Pick', 'Omit', 'Record'].indexOf(name) !== -1) {
      analysis.isGeneric = true;
      if (typeNode.typeArguments) {
        analysis.genericArguments = typeNode.typeArguments.map(function(a: ts.TypeNode) { return a.getText(sourceFile); });
      }
    }
  } else if (ts.isArrayTypeNode(typeNode)) {
    analysis.category = 'array';
    analysis.referencedType = typeNode.elementType.getText(sourceFile);
  } else if (ts.isUnionTypeNode(typeNode)) {
    analysis.category = 'union';
    analysis.unionMembers = typeNode.types.map(function(t: ts.TypeNode) { return t.getText(sourceFile); });
  } else if (ts.isLiteralTypeNode(typeNode)) {
    analysis.category = 'literal';
  } else if (ts.isTypeLiteralNode(typeNode)) {
    analysis.category = 'inline-object';
  } else if (ts.isFunctionTypeNode(typeNode)) {
    analysis.category = 'function';
  } else if (ts.isMappedTypeNode(typeNode)) {
    analysis.category = 'mapped';
  } else if (ts.isConditionalTypeNode(typeNode)) {
    analysis.category = 'conditional';
  } else if (typeNode.kind === ts.SyntaxKind.StringKeyword ||
             typeNode.kind === ts.SyntaxKind.NumberKeyword ||
             typeNode.kind === ts.SyntaxKind.BooleanKeyword ||
             typeNode.kind === ts.SyntaxKind.AnyKeyword ||
             typeNode.kind === ts.SyntaxKind.UnknownKeyword ||
             typeNode.kind === ts.SyntaxKind.UndefinedKeyword ||
             typeNode.kind === ts.SyntaxKind.NullKeyword ||
             typeNode.kind === ts.SyntaxKind.VoidKeyword ||
             typeNode.kind === ts.SyntaxKind.NeverKeyword ||
             typeNode.kind === ts.SyntaxKind.ObjectKeyword ||
             typeNode.kind === ts.SyntaxKind.SymbolKeyword ||
             typeNode.kind === ts.SyntaxKind.BigIntKeyword) {
    analysis.category = 'primitive';
  }

  return analysis;
}

// ============================================================================
// SEMANTIC INTELLIGENCE: Method body analysis via AST walk
// ============================================================================

function analyzeMethodBody(
  fnNode: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile
): MethodBodyAnalysis {
  const body = fnNode.body;
  const empty: MethodBodyAnalysis = {
    returnCount: 0, hasEarlyExit: false, throwCount: 0,
    hasErrorHandling: false, hasLoop: false, hasAsyncAwait: false,
    hasProcessExecution: false, hasFilesystemIO: false, hasNetworkIO: false,
    sideEffectCategories: [],
  };
  if (!body) return empty;

  const analysis = Object.assign({}, empty);
  const sideEffects = new Set<string>();

  function walk(node: ts.Node): void {
    if (ts.isReturnStatement(node)) {
      analysis.returnCount++;
      if (node.expression) {
        if (node.expression.kind === ts.SyntaxKind.NullKeyword ||
            node.expression.kind === ts.SyntaxKind.FalseKeyword ||
            node.expression.kind === ts.SyntaxKind.UndefinedKeyword) {
          analysis.hasEarlyExit = true;
        }
      }
    }
    if (ts.isThrowStatement(node)) analysis.throwCount++;
    if (ts.isTryStatement(node)) analysis.hasErrorHandling = true;
    if (ts.isForStatement(node) || ts.isForOfStatement(node) ||
        ts.isForInStatement(node) || ts.isWhileStatement(node)) analysis.hasLoop = true;
    if (ts.isAwaitExpression(node)) analysis.hasAsyncAwait = true;
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      if (/exec(Sync)?|spawn(Sync)?/.test(callText)) { analysis.hasProcessExecution = true; sideEffects.add('process-exec'); }
      if (/writeFileSync|readFileSync|mkdirSync|appendFileSync|rmSync|unlinkSync/.test(callText)) { analysis.hasFilesystemIO = true; sideEffects.add('fs-io-sync'); }
      if (/writeFile\b|appendFile\b|mkdir\b|rm\b/.test(callText)) { analysis.hasFilesystemIO = true; sideEffects.add('fs-io-async'); }
      if (/\bfetch\b|http\.request|https\.request|axios/.test(callText)) { analysis.hasNetworkIO = true; sideEffects.add('network'); }
    }
    ts.forEachChild(node, walk);
  }

  // Handle both block bodies and expression bodies
  if (ts.isBlock(body)) {
    walk(body);
  } else {
    // Arrow function with expression body — wrap in virtual check
    walk(body);
  }

  analysis.sideEffectCategories = Array.from(sideEffects);
  return analysis;
}

// ============================================================================
// SEMANTIC INTELLIGENCE: Cross-file type relationship map
// ============================================================================

function buildTypeRelationships(
  allI: ExtractedInterface[],
  allT: ExtractedTypeAlias[],
  allC: ExtractedClass[],
  allF: ExtractedFunction[],
  allI2: ExtractedImport[]
): TypeRelationship[] {
  const rels = new Map<string, TypeRelationship>();

  // Register all type definitions
  for (const iface of allI) {
    if (!rels.has(iface.name)) {
      rels.set(iface.name, { typeName: iface.name, definedIn: iface.file, consumedBy: [], producedBy: [], acceptedBy: [] });
    }
  }
  for (const ta of allT) {
    if (!rels.has(ta.name)) {
      rels.set(ta.name, { typeName: ta.name, definedIn: ta.file, consumedBy: [], producedBy: [], acceptedBy: [] });
    }
  }

  // Functions that produce/accept types
  for (const fn of allF) {
    for (const [name, rel] of rels) {
      if (fn.returnType.indexOf(name) !== -1) {
        rel.producedBy.push(fn.name + '() in ' + fn.file);
      }
      if (fn.params.indexOf(name) !== -1) {
        rel.acceptedBy.push(fn.name + '() in ' + fn.file);
      }
    }
  }

  // Class methods that produce/accept types
  for (const cls of allC) {
    for (const method of cls.methods) {
      for (const [name, rel] of rels) {
        if (method.returnType.indexOf(name) !== -1) {
          rel.producedBy.push(cls.name + '.' + method.name + '() in ' + cls.file);
        }
        if (method.params.indexOf(name) !== -1) {
          rel.acceptedBy.push(cls.name + '.' + method.name + '() in ' + cls.file);
        }
      }
    }
  }

  // Import graph -> consumedBy
  for (const imp of allI2) {
    for (const importedName of imp.imports) {
      const rel = rels.get(importedName);
      if (rel && rel.consumedBy.indexOf(imp.file) === -1) {
        rel.consumedBy.push(imp.file);
      }
    }
  }

  // Interface fields that reference known types
  for (const iface of allI) {
    for (const field of iface.fields) {
      for (const [name, rel] of rels) {
        if (field.type.indexOf(name) !== -1 && rel.consumedBy.indexOf(iface.name + ' in ' + iface.file) === -1) {
          rel.consumedBy.push(iface.name + ' in ' + iface.file);
        }
      }
    }
  }

  return Array.from(rels.values())
    .filter(function(r) { return r.consumedBy.length > 0 || r.producedBy.length > 0; })
    .sort(function(a, b) {
      return (b.consumedBy.length + b.producedBy.length + b.acceptedBy.length) -
             (a.consumedBy.length + a.producedBy.length + a.acceptedBy.length);
    });
}

function extractInterfaces(content: string, filePath: string): ExtractedInterface[] {
  const results: ExtractedInterface[] = [];
  const lines = content.split('\n');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const ifaceRegex = /^export\s+interface\s+(\w+)/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(ifaceRegex);
    if (!match) continue;
    const name = match[1];
    const matchLine = i + 1;
    const fields: ExtractedInterface['fields'] = [];
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      const line = lines[j];
      if (line.includes('{')) depth++;
      if (line.includes('}')) {
        depth--;
        if (depth === 0) break;
      }
      if (j > i && depth >= 1) {
        const fm = line.match(/^\s*(readonly\s+)?(\w+)(\?)?:\s*(.+?);?\s*(\/\/.*)?$/);
        if (fm && !fm[2].startsWith('//')) {
          fields.push({
            name: fm[2],
            type: fm[4].trim().replace(/\/\/.*/, '').trim(),
            optional: !!fm[3],
            comment: fm[5]?.trim(),
          });
        }
      }
    }

    // AST: Extract comment and field type analysis
    let commentNode: ts.Node | null = null;
    function findNode(node: ts.Node): ts.Node | null {
      if (commentNode) return commentNode;
      const nodeLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      if (nodeLine === matchLine) {
        commentNode = node;
        return commentNode;
      }
      ts.forEachChild(node, findNode);
      return null;
    }
    commentNode = findNode(sourceFile);

    const result: ExtractedInterface = { name, fields, file: filePath, line: matchLine };

    if (commentNode) {
      const comment = extractAttachedComment(sourceFile, commentNode.getFullStart());
      if (comment) result.comment = comment;
      // Field type analysis via AST
      if (ts.isInterfaceDeclaration(commentNode)) {
        for (const field of fields) {
          for (const member of commentNode.members) {
            if (ts.isPropertySignature(member) && member.name && ts.isIdentifier(member.name) && member.name.text === field.name) {
              field.typeAnalysis = analyzeFieldType(member, sourceFile);
              break;
            }
          }
        }
      }
    }

    results.push(result);
  }
  return results;
}

function extractClasses(content: string, filePath: string): ExtractedClass[] {
  const results: ExtractedClass[] = [];
  const lines = content.split('\n');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const clsRegex = /^export\s+class\s+(\w+)/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(clsRegex);
    if (!match) continue;
    const name = match[1];
    const matchLine = i + 1;
    const methods: ExtractedClass['methods'] = [];
    const fields: Array<{ name: string; type: string; modifier: string; line: number }> = [];
    let braceDepth = 1; // Start at 1 — class opening brace is on line i, loop starts at i+1
    let classStarted = true;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].includes('{')) braceDepth++;
      if (lines[j].includes('}')) { braceDepth--; if (braceDepth <= 0) break; }
      if (lines[j].match(/^export\s+(class|interface|function)/)) break;
      // Method extraction
      const mm = lines[j].match(/^\s+(async\s+)?(\w+)\s*\(([^)]*)\)\s*:\s*(.+?)\s*\{/);
      if (mm && mm[2] !== 'constructor') {
        methods.push({ name: mm[2], params: mm[3].trim(), returnType: mm[4].trim(), line: j + 1 });
      }
      // Private/protected/public field extraction (not method params, not inside method body)
      // Only extract at class body depth 1 (direct class members)
      if (classStarted && braceDepth === 1) {
        const fm = lines[j].match(/^\s+(private\s+|public\s+|protected\s+|readonly\s+)+(readonly\s+)?(\w+)(\?)?:\s*([^=;]+?)(?:\s*=\s*.+)?;/);
        if (fm && !lines[j].includes('(') && fm[3]) {
          fields.push({ name: fm[3], type: fm[5].trim(), modifier: fm[1].trim(), line: j + 1 });
        }
      }
    }

    // AST: Extract comment and method body analysis
    let commentNode: ts.Node | null = null;
    function findNode(node: ts.Node): ts.Node | null {
      if (commentNode) return commentNode;
      const nodeLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      if (nodeLine === matchLine) {
        commentNode = node;
        return commentNode;
      }
      ts.forEachChild(node, findNode);
      return null;
    }
    commentNode = findNode(sourceFile);

    const result: ExtractedClass = { name, methods, fields, file: filePath, line: matchLine };

    if (commentNode) {
      const comment = extractAttachedComment(sourceFile, commentNode.getFullStart());
      if (comment) result.comment = comment;
      // Method body analysis via AST
      if (ts.isClassDeclaration(commentNode)) {
        for (const m of methods) {
          for (const member of commentNode.members) {
            if ((ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) &&
                member.name && ts.isIdentifier(member.name) && member.name.text === m.name) {
              m.bodyAnalysis = analyzeMethodBody(member as unknown as ts.FunctionLikeDeclaration, sourceFile);
              break;
            }
          }
        }
      }
    }

    results.push(result);
  }
  return results;
}

function extractFunctions(content: string, filePath: string): ExtractedFunction[] {
  const results: ExtractedFunction[] = [];
  const lines = content.split('\n');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const fnRegex = /^export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*(.+?))?\s*\{/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(fnRegex);
    if (!match) continue;
    const matchLine = i + 1;

    // AST: Extract comment
    let commentNode: ts.Node | null = null;
    function findNode(node: ts.Node): ts.Node | null {
      if (commentNode) return commentNode;
      const nodeLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      if (nodeLine === matchLine) {
        commentNode = node;
        return commentNode;
      }
      ts.forEachChild(node, findNode);
      return null;
    }
    commentNode = findNode(sourceFile);

    const result: ExtractedFunction = {
      name: match[2], params: match[3].trim(),
      returnType: match[4]?.trim() || 'void',
      file: filePath, line: matchLine, isExported: true, isAsync: !!match[1],
    };

    if (commentNode) {
      const comment = extractAttachedComment(sourceFile, commentNode.getFullStart());
      if (comment) result.comment = comment;
    }

    results.push(result);
  }
  return results;
}

function extractTypeAliases(content: string, filePath: string): ExtractedTypeAlias[] {
  const results: ExtractedTypeAlias[] = [];
  const lines = content.split('\n');
  const tyRegex = /^export\s+type\s+(\w+)\s*=\s*(.+?);?$/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(tyRegex);
    if (!match) continue;
    results.push({ name: match[1], definition: match[2].trim(), file: filePath, line: i + 1 });
  }
  return results;
}

function extractEnums(content: string, filePath: string): ExtractedEnum[] {
  const results: ExtractedEnum[] = [];
  const lines = content.split('\n');
  const enRegex = /^export\s+(const\s+)?enum\s+(\w+)/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(enRegex);
    if (!match) continue;
    const name = match[2];
    const values: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].includes('}')) break;
      const vm = lines[j].match(/^\s+(\w+)/);
      if (vm) values.push(vm[1]);
    }
    results.push({ name, values, file: filePath, line: i + 1 });
  }
  return results;
}

function extractImports(content: string, filePath: string): ExtractedImport[] {
  const results: ExtractedImport[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^import\s+(?:(\w+)|\{([^}]+)\})\s+from\s+['"]([^'"]+)['"]/);
    if (!match) continue;
    const imports: string[] = match[1] ? [match[1]] : match[2].split(',').map((s: string) => s.trim());
    results.push({ from: match[3], imports, file: filePath });
  }
  return results;
}

function extractConstObjects(content: string, filePath: string): ExtractedConstObject[] {
  const results: ExtractedConstObject[] = [];
  const lines = content.split('\n');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const constRegex = /^export\s+const\s+(\w+)\s*:\s*(\w+)\s*=\s*\{/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(constRegex);
    if (!match) continue;
    const name = match[1];
    const matchLine = i + 1;
    const typeAnnotation = match[2];
    // Capture full object body by tracking brace depth
    let depth = 0;
    let bodyStart = i;
    let bodyEnd = i;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (j > i && depth <= 0) { bodyEnd = j; break; }
    }
    const body = lines.slice(bodyStart, bodyEnd + 1).join('\n');

    // Extract check/scan method body if present (this is where algorithms live)
    let checkMethodBody: string | null = null;
    let hasCheckMethod = false;
    const checkMatch = body.match(/(?:check|scan|run|execute|analyze)\s*(?:\s*\([^)]*\))?\s*[:=>]\s*(?:async\s*)?\(?\s*(?:function)?\s*\(?[^)]*\)?\s*(?:=>)?\s*\{/);
    if (checkMatch) {
      hasCheckMethod = true;
      // Find the method body by tracking braces from the match position
      const methodStart = body.indexOf(checkMatch[0]);
      if (methodStart >= 0) {
        const bodyLines = body.substring(methodStart).split('\n');
        let mDepth = 0;
        let mEnd = 0;
        for (let k = 0; k < bodyLines.length; k++) {
          for (const ch of bodyLines[k]) {
            if (ch === '{') mDepth++;
            if (ch === '}') mDepth--;
          }
          if (k > 0 && mDepth <= 0) { mEnd = k; break; }
        }
        checkMethodBody = bodyLines.slice(0, mEnd + 1).join('\n');
      }
    }

    // Only include if the object is substantial (>5 lines) or has a check method
    if (bodyEnd - bodyStart > 5 || hasCheckMethod) {
      // AST: Extract comment
      let commentNode: ts.Node | null = null;
      function findNode(node: ts.Node): ts.Node | null {
        if (commentNode) return commentNode;
        const nodeLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        if (nodeLine === matchLine) {
          commentNode = node;
          return commentNode;
        }
        ts.forEachChild(node, findNode);
        return null;
      }
      commentNode = findNode(sourceFile);

      const result: ExtractedConstObject = {
        name, typeAnnotation, file: filePath, line: matchLine, endLine: bodyEnd + 1,
        body, checkMethodBody, hasCheckMethod,
      };

      if (commentNode) {
        const comment = extractAttachedComment(sourceFile, commentNode.getFullStart());
        if (comment) result.comment = comment;
      }

      results.push(result);
    }
  }
  return results;
}

function extractAlgorithmSignals(content: string): string[] {
  const signals: string[] = [];
  const lines = content.split('\n');
  const patterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /\bif\s*\(/, label: 'conditional logic' },
    { regex: /\bfor\s*\(/, label: 'iteration' },
    { regex: /\bwhile\s*\(/, label: 'loop' },
    { regex: /\.map\s*\(/, label: 'map transformation' },
    { regex: /\.filter\s*\(/, label: 'filter operation' },
    { regex: /\.reduce\s*\(/, label: 'reduce operation' },
    { regex: /\btry\s*\{/, label: 'error handling' },
    { regex: /\bcatch\s*\(/, label: 'catch clause' },
    { regex: /\bthrow\s+new\s+/, label: 'error throwing' },
    { regex: /\bawait\s+/, label: 'async operation' },
    { regex: /\bPromise\b/, label: 'promise usage' },
    { regex: /writeFileSync|readFileSync|mkdirSync/, label: 'filesystem I/O' },
    { regex: /execSync|exec\(|spawn\(/, label: 'process execution' },
    { regex: /writeFile|appendFile/, label: 'async file I/O' },
    { regex: /\bSet\s*<|new\s+Set\(/, label: 'set data structure' },
    { regex: /\bMap\s*<|new\s+Map\(/, label: 'map data structure' },
    { regex: /forEach|entries\(\)|values\(\)|keys\(\)/, label: 'collection iteration' },
  ];
  const found = new Set<string>();
  for (const line of lines) {
    for (const { regex, label } of patterns) {
      if (regex.test(line) && !found.has(label)) { found.add(label); signals.push(label); }
    }
  }
  return signals;
}

export function generateContextBrief(
  files: ContextFileEntry[],
  requirements: string,
  layer: number,
): string {
  const allI: ExtractedInterface[] = [];
  const allC: ExtractedClass[] = [];
  const allF: ExtractedFunction[] = [];
  const allT: ExtractedTypeAlias[] = [];
  const allE: ExtractedEnum[] = [];
  const allI2: ExtractedImport[] = [];
  const allConsts: ExtractedConstObject[] = [];
  const algoMap = new Map<string, string[]>();
  let total = 0;

  for (const f of files) {
    allI.push(...extractInterfaces(f.content, f.path));
    allC.push(...extractClasses(f.content, f.path));
    allF.push(...extractFunctions(f.content, f.path));
    allT.push(...extractTypeAliases(f.content, f.path));
    allE.push(...extractEnums(f.content, f.path));
    allI2.push(...extractImports(f.content, f.path));
    allConsts.push(...extractConstObjects(f.content, f.path));
    const sig = extractAlgorithmSignals(f.content);
    if (sig.length > 0) algoMap.set(f.path, sig);
    total += f.lines;
  }

  let b = '';
  b += `# CONTEXT BRIEF — Layer ${layer} Spec Generation\n\n`;
  b += `**Files:** ${files.length} | **Lines:** ${total} | `;
  b += `Interfaces: ${allI.length} | Classes: ${allC.length} | Functions: ${allF.length} | Const Objects: ${allConsts.length} | Types: ${allT.length} | Enums: ${allE.length}\n\n`;
  b += `**Requirements:** ${requirements.substring(0, 500)}\n\n---\n\n`;

  b += `## 1. File Inventory\n\n| File | Lines | IF | CLS | FN | TY | EN |\n|------|-------|----|----|----|----|----|\n`;
  for (const f of files) {
    b += `| \`${f.path}\` | ${f.lines} | ${allI.filter(i => i.file === f.path).length} | ${allC.filter(c => c.file === f.path).length} | ${allF.filter(fn => fn.file === f.path).length} | ${allT.filter(t => t.file === f.path).length} | ${allE.filter(e => e.file === f.path).length} |\n`;
  }
  b += `\n`;

  if (allI.length > 0) {
    b += `## 2. Extracted Interfaces (${allI.length})\n\n**Adapt for Data Model section.**\n\n`;
    for (const iface of allI) {
      b += `### ${iface.name} (${iface.file}:${iface.line})\n\n\`\`\`typescript\nexport interface ${iface.name} {\n`;
      for (const fd of iface.fields) b += `  ${fd.name}${fd.optional ? '?' : ''}: ${fd.type};${fd.comment ? ' ' + fd.comment : ''}\n`;
      b += `}\n\`\`\`\n\n`;
      // SEMANTIC: Show extracted comment
      if (iface.comment) {
        b += `> ${iface.comment.replace(/\n/g, '\n> ')}\n\n`;
      }
      // SEMANTIC: Show field type analysis from AST
      for (const fd of iface.fields) {
        if (fd.typeAnalysis) {
          const ta = fd.typeAnalysis;
          let details = ta.category;
          if (ta.referencedType) details += ' -> ' + ta.referencedType;
          if (ta.isOptional) details += ' (optional)';
          if (ta.isReadonly) details += ' (readonly)';
          if (ta.unionMembers) details += ' union: ' + ta.unionMembers.join(' | ');
          if (ta.isGeneric && ta.genericArguments) details += ' generic<' + ta.genericArguments.join(', ') + '>';
          b += `    ${fd.name} AST: ${details}\n`;
        }
      }
      // Blank line separator only if we added type analysis lines
      const hasTypeAnalysis = iface.fields.some(fd => fd.typeAnalysis);
      if (hasTypeAnalysis) b += `\n`;
    }
  }

  if (allC.length > 0) {
    b += `## 3. Extracted Classes (${allC.length})\n\n**Use for Engine Design section.**\n\n`;
    for (const cls of allC) {
      b += `### ${cls.name} (${cls.file}:${cls.line})\n`;
      // SEMANTIC: Show extracted comment
      if (cls.comment) {
        b += `\n> ${cls.comment.replace(/\n/g, '\n> ')}\n\n`;
      }
      if (cls.fields && cls.fields.length > 0) {
        b += `**State Fields:**\n`;
        for (const f of cls.fields) b += `- \`${f.modifier} ${f.name}: ${f.type}\` (L${f.line})\n`;
        b += `\n`;
      }
      b += `**Methods:**\n`;
      for (const m of cls.methods) b += `- \`${m.name}(${m.params}): ${m.returnType}\` (L${m.line})\n`;
      // SEMANTIC: Method behavioral analysis table
      if (cls.methods && cls.methods.length > 0) {
        const hasAnalysis = cls.methods.some((m) => Boolean(m.bodyAnalysis));
        if (hasAnalysis) {
          b += `\n**Method Behavioral Analysis:**\n\n`;
          b += `| Method | Returns | Throws | Error Handling | Loops | Async | Side Effects |\n`;
          b += `|--------|---------|--------|---------------|-------|-------|-------------|\n`;
          for (const m of cls.methods) {
            const ba = m.bodyAnalysis as MethodBodyAnalysis | undefined;
            if (ba) {
              b += `| ${m.name} | ${ba.returnCount} | ${ba.throwCount} | ${(ba.hasErrorHandling ? 'yes' : 'no')} | ${(ba.hasLoop ? 'yes' : 'no')} | ${(ba.hasAsyncAwait ? 'yes' : 'no')} | ${(ba.sideEffectCategories.length > 0 ? ba.sideEffectCategories.join(', ') : '-')} |\n`;
            }
          }
          b += `\n`;
        }
      }
      // Add code snippet showing the class context
      const clsFile = files.find(f => f.path === cls.file);
      if (clsFile) {
        const clsLines = clsFile.content.split('\n');
        const snippetStart = Math.max(0, cls.line - 2);
        const snippetEnd = Math.min(clsLines.length, cls.line + 15);
        b += `**Code context (lines ${snippetStart + 1}-${snippetEnd}):**\n\`\`\`typescript\n`;
        for (let si = snippetStart; si < snippetEnd; si++) b += clsLines[si] + '\n';
        b += `\`\`\`\n\n`;
      }
    }
  }

  if (allF.length > 0) {
    b += `## 4. Extracted Functions (${allF.length})\n\n**Describe each in Defense Rules / Engine Design.**\n\n`;
    for (const fn of allF) {
      b += `- \`${fn.isAsync ? 'async ' : ''}function ${fn.name}(${fn.params}): ${fn.returnType}\` (${fn.file}:${fn.line})\n`;
      // SEMANTIC: Show extracted comment
      if (fn.comment) {
        b += `  > ${fn.comment.replace(/\n/g, '\n  > ')}\n`;
      }
      // Add code snippet for each function
      const fnFile = files.find(f => f.path === fn.file);
      if (fnFile) {
        const fnLines = fnFile.content.split('\n');
        const snStart = Math.max(0, fn.line - 1);
        const snEnd = Math.min(fnLines.length, fn.line + 20);
        b += `\n  \`\`\`typescript\n`;
        for (let si = snStart; si < snEnd; si++) b += `  ${fnLines[si]}\n`;
        b += `  \`\`\`\n`;
      }
    }
    b += `\n`;
  }

  if (allConsts.length > 0) {
    b += `## 5. Extracted Rule/Const Objects (${allConsts.length})\n\n`;
    b += `**THESE ARE THE ACTUAL ALGORITHM IMPLEMENTATIONS. Read each check() method body carefully.**\n`;
    b += `**This is where S1-S5, R13, R14, and other rules live. Describe each algorithm step-by-step in the spec.**\n\n`;
    for (const c of allConsts) {
      b += `### ${c.name}: ${c.typeAnnotation} (${c.file}:${c.line}-${c.endLine})\n\n`;
      if (c.hasCheckMethod && c.checkMethodBody) {
        b += `**Algorithm (check method body):**\n\n\`\`\`typescript\n${c.checkMethodBody}\n\`\`\`\n\n`;
      } else {
        // Show first 30 lines of body if no check method found
        const bodyLines = c.body.split('\n').slice(0, 30);
        b += `**Object body (first 30 lines):**\n\n\`\`\`typescript\n${bodyLines.join('\n')}\n\`\`\`\n\n`;
      }
    }
  }

  if (allT.length > 0 || allE.length > 0) {
    b += `## 6. Type Aliases and Enums\n\n`;
    for (const t of allT) b += `- \`type ${t.name} = ${t.definition}\` (${t.file}:${t.line})\n`;
    for (const e of allE) b += `- \`enum ${e.name} { ${e.values.join(', ')} }\` (${e.file}:${e.line})\n`;
    b += `\n`;
  }

  if (algoMap.size > 0) {
    b += `## 6. Algorithm Signals\n\n`;
    for (const [fp, sigs] of algoMap) b += `**${fp}:** ${sigs.join(', ')}\n`;
    b += `\n`;
  }

  if (allI2.length > 0) {
    const im = new Map<string, Set<string>>();
    for (const imp of allI2) { for (const n of imp.imports) { if (!im.has(n)) im.set(n, new Set()); im.get(n)!.add(imp.file); } }
    b += `## 7. Import Graph\n\n| Symbol | Used By |\n|--------|---------|\n`;
    for (const [sym, users] of Array.from(im.entries()).sort((a, b) => b[1].size - a[1].size).slice(0, 50)) {
      b += `| \`${sym}\` | ${Array.from(users).map(f => path.basename(f)).join(', ')} |\n`;
    }
    b += `\n`;
  }

  // SEMANTIC: Cross-file type relationships
  const relationships = buildTypeRelationships(allI, allT, allC, allF, allI2);
  if (relationships.length > 0) {
    b += `## 8.5 Cross-File Type Relationships\n\n`;
    b += `| Type | Defined In | Produced By | Accepted By | Consumers |\n`;
    b += `|------|-----------|-------------|-------------|----------|\n`;
    for (const r of relationships.slice(0, 40)) {
      b += `| \`${r.typeName}\` | ${path.basename(r.definedIn)} | ${r.producedBy.slice(0, 3).join(', ')} | ${r.acceptedBy.slice(0, 3).join(', ')} | ${r.consumedBy.length} refs |\n`;
    }
    b += `\n`;
  }

  b += `## 9. Agent Instructions\n\n`;
  b += `Ingested ${files.length} files (${total} lines). Extracted ${allI.length} interfaces, ${allC.length} classes, ${allF.length} functions, ${allConsts.length} const/rule objects.\n\n`;
  b += `**WRITE THE LAYER ${layer} SPEC NOW.** \n\n`;
  b += `**CRITICAL: For every rule, algorithm, or const object in Section 5, READ THE CHECK() METHOD BODY shown there.**\n`;
  b += `**Trace through every condition, every branch, every loop. Describe the algorithm step-by-step.**\n`;
  b += `**Do NOT summarize algorithms as "detects X" — explain HOW: what conditions, what data structures, what flow.**\n\n`;
  b += `**If a code snippet is truncated, READ THE FULL SOURCE FILE at the path shown. The snippets are starting points, not complete pictures.**\n\n`;
  if (layer === 2) {
    b += `## SECTION A: EXTRACTION-BASED SECTIONS (trace from source code above)\n\n`;
    b += `1. **executiveSummary** — What is being built and why. Include the problem statement, failure modes, and the three-engine model.\n`;
    b += `2. **architectureOverview** — System diagram (ASCII), execution flow, component interaction, cost-gradient layering principle.\n`;
    b += `3. **dataModel** — Full TypeScript interfaces adapted from Section 2. Add field-by-field rationale. Show how types connect.\n`;
    b += `4. **engineDesign** — For EACH class in Section 3: constructor, state fields, every method. For EACH rule object in Section 5: trace the check() method body line by line. Explain the algorithm conditions, branches, and data flow. Include pseudocode.\n`;
    b += `5. **defenseRules** — One detailed section per rule. For each: purpose, the QUESTION it asks, the AST entry point, severity, the ALGORITHM (traced from the check method body in Section 5), false-positive guards, worked example with code.\n`;
    b += `6. **blindSpots** — What each engine CANNOT detect. Be specific.\n`;
    b += `7. **evidenceFormat** — JSON schemas for each engine's output. Show example output objects.\n`;
    b += `8. **testSpecs** — Test table with SPECIFIC inputs and expected outputs per rule. Include false-positive guard tests.\n\n`;
    b += `## SECTION B: SYNTHESIS-BASED SECTIONS (these do NOT exist in source — you must DESIGN them)\n\n`;
  b += `GENERATION CONTRACTS (MANDATORY — CME-grade depth, per the container-testing skill):\n\n`;
  b += `C1. EVERY component/engine/action listed in any table MUST ALSO have its own ### <Name> — <method> pseudocode subsection (50-100 lines per major method). A table row is NOT a method spec.\n`;
  b += `C2. Every hook/middleware rewrite MUST include the FULL line-by-line function code — not a before/after comparison table.\n`;
  b += `C3. Every change to an existing file MUST include an INSERTION-POINT mapping: file, function, before/after/inside which block, with surrounding context lines.\n`;
  b += `C4. Every changed state/init function MUST include the exact initialization diff (createSession/constructor changes).\n`;
  b += `C5. EVERY component MUST include an ASCII data-flow diagram.\n`;
  b += `C6. A component×component PEER INTERACTION TABLE is REQUIRED.\n`;
  b += `C7. Test specs MUST include test-code pseudocode with concrete expect() calls.\n`;
  b += `C8. The spec MUST include a 'what this overhaul does NOT fix' blind-spot subsection.\n`;
  b += `C9. The ## 0B CONTAINER TEST PLAN section is ALREADY in this document after the TOC — do NOT duplicate it; build against it.\n\n`;
    b += `**These components are NEW. They do not exist in any source file. You must invent them by understanding the integration requirements.**\n\n`;
    b += `9. **integrationPlan** — Write the ACTUAL integration code. This means:\n`;
    b += `   - The GuardianHook composition (show the full beforeHook function with all enforcement layers composed in order)\n`;
    b += `   - The plugin entry point changes (show the import statements and instantiation code)\n`;
    b += `   - The hook registration sequence (which hooks fire in what order)\n`;
    b += `   - Import paths for every new component\n`;
    b += `   - Write this as FULL TypeScript code, not prose description\n\n`;
    b += `10. **pipelineDesign** — Design the pipeline orchestration layer. This means:\n`;
    b += `   - A PipelineEngine class that manages stage progression (EXPLORE -> ARCHITECT -> CODER -> REVIEWER -> TEST_ENGINEER -> CRITIC)\n`;
    b += `   - Stage gate evaluation logic (what conditions must be met to advance)\n`;
    b += `   - Rollback protocol (what happens when RGE audit fails in REVIEWER)\n`;
    b += `   - Session state management and checkpoint serialization\n`;
    b += `   - Write this as FULL TypeScript class implementation with methods, not just interface definitions\n\n`;
    b += `11. **identityDesign** — Write the complete T1 system prompt for the agent. This means:\n`;
    b += `   - Full identity text that tells the agent what it is and how it should behave\n`;
    b += `   - Pipeline protocol instructions (what to do at each stage)\n`;
    b += `   - Enforcement rules the agent must follow\n`;
    b += `   - Write this as the actual prompt string, not a description of what the prompt should say\n\n`;
    b += `12. **migrationStrategy** — Phased rollout with:\n`;
    b += `   - Specific phases with DAY estimates (e.g., "Day 1-2: Engine Adaptation")\n`;
    b += `   - Deliverables per phase\n`;
    b += `   - Verification gate per phase (what must pass before proceeding)\n`;
    b += `   - Rollback condition per phase\n\n`;
    b += `13. **bibleCompliance** — Map each P1-P12 principle to how this spec satisfies it. Table format.\n\n`;
    b += `14. **sourceAttribution** — Track which component comes from which source project. Table format.\n\n`;
    b += `**Minimum 3000 lines. The synthesis sections (9-14) must contain FULL CODE, not descriptions of code.**\n`;
    b += `**Write TypeScript implementations for PipelineEngine and GuardianHook. Write the actual T1 prompt string.**\n`;
    b += `**Then call trident-deep-planning AGAIN with layer=2 and all section params.**\n`;
  } else {
    b += `Generate context library files using extracted content. Each 200+ lines.\n`;
  }

  b += `\n---\n*Trident Context Brief Engine*\n`;
  return b;
}
