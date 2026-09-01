// l2-quality-audit.ts — L2 Deep Planning Quality Audit Engine
//
// Implements Phase 3 (Deepening), Phase 4 (Cross-Section Audit), and
// section-level quality gates for the v2.0 L2 generation pipeline.
//
// In v1.0, quality gates ran per-section during generation. In v2.0, the LLM
// writes the complete document and ALL quality gates run on the FULL document
// post-generation. This file provides the functions that extract sections,
// check quality, identify depth gaps, and audit cross-section consistency.
//
// Phases:
//   Phase 3 — Deepening: identifies DEPTH GAPS (structurally present but
//             semantically shallow content).
//   Phase 4 — Cross-Section Audit: verifies consistency across sections
//             (thresholds, types, signatures, file paths, completeness chain,
//             adversarial coverage).
//
// @module artifacts/l2-quality-audit

import type { AnalysisResult } from './analysis-engine.ts';
import type { L2Strategy} from './l2-strategy.ts';
import type { DefenseSpec } from './defense-catalog.ts';
import * as fs from 'fs';
import * as path from 'path';
import { tridentLog } from '../utils.js';

// ============================================================================
// EXPORTED TYPES
// ============================================================================

/** A single quality issue found in a section. */
export interface SectionQualityIssue {
  severity: 'REJECT' | 'WARN';
  type: 'SLOP' | 'DENSITY' | 'DEPTH' | 'STRUCTURE';
  message: string;
  fix: string;
}

/** Result of a section-level quality check. */
export interface SectionQualityResult {
  passed: boolean;
  section: string;
  issues: SectionQualityIssue[];
  lineCount: number;
  budgetMin: number;
  codeBlockCount: number;
  densityMode: string;
}

/** Result of the full cross-section audit (Phase 4). */
export interface CrossSectionAuditResult {
  passed: boolean;
  checks: {
    thresholdConsistency: { passed: boolean; mismatches: string[] };
    typeNameConsistency: { passed: boolean; mismatches: string[] };
    functionSignatureConsistency: { passed: boolean; mismatches: string[] };
    filePathVerification: { passed: boolean; issues: string[] };
    completenessChain: { passed: boolean; gaps: string[] };
    adversarialCoverage: { passed: boolean; missing: string[] };
    duplicateSections: { passed: boolean; duplicates: string[] };
    numberingErrors: { passed: boolean; errors: string[] };
    defenseRuleStructure: { passed: boolean; missing: string[] };
    typeFieldConsistency: { passed: boolean; conflicts: string[] };
    sectionCompleteness: { passed: boolean; missing: string[] };
  };
  issueCount: number;
}

/** A single depth gap found during deepening (Phase 3). */
export interface DeepeningGap {
  type: 'WORKED_EXAMPLE' | 'THRESHOLD_RATIONALE' | 'EDGE_CASE' | 'COMPLEXITY' | 'CROSS_REFERENCE';
  section: string;
  ruleName: string;
  description: string;
  fix: string;
  requiredCount: number;
  actualCount: number;
}

/** Result of the deepening check (Phase 3). */
export interface DeepeningResult {
  passed: boolean;
  gaps: DeepeningGap[];
}

// ============================================================================
// INTERNAL CONSTANTS: SECTION TITLE MAPPING
// ============================================================================

/**
 * Maps L2SectionType keys to human-readable markdown heading titles.
 * Used by checkSectionQuality to resolve a section key to its title for
 * extraction from the full document.
 */
const SECTION_TITLES: Record<string, string> = {
  executiveSummary: 'Executive Summary',
  architecture: 'Architecture',
  dataModel: 'Data Model',
  engineClass: 'Engine Class',
  defenseRules: 'Defense Rules',
  algorithmSpecs: 'Algorithm Specifications',
  testSpecs: 'Test Specifications',
  blindSpots: 'Blind Spots',
  integration: 'Integration',
  evidenceFormat: 'Evidence Format',
  fileManifest: 'File Manifest',
  migration: 'Migration',
};

/**
 * Template phrases that indicate slop — non-specific, boilerplate text
 * that should never appear in a finished spec.
 */
const TEMPLATE_PHRASES: string[] = [
  'implement actual logic',
  'based on the analysis',
  'contains code constructs awaiting classification',
  'no critical facts were provided',
  'add proper error handling',
  'ensure all code paths',
  'see description above',
  'see context brief',
  'placeholder',
  'todo',
];

// ============================================================================
// SECTION EXTRACTION
// ============================================================================

/**
 * Extract a section from a markdown document by its title.
 *
 * Handles both numbered headings (e.g., `## 1. Executive Summary`) and
 * unnumbered headings (e.g., `## Executive Summary`). Returns all content
 * from the heading line until the next heading at the same or higher level.
 *
 * @param doc          The full markdown document.
 * @param sectionTitle The title to search for (e.g., "Executive Summary").
 * @returns            The extracted section text including the heading line,
 *                     or empty string if the section is not found.
 */
export function extractSection(doc: string, sectionTitle: string): string {
  const lines = doc.split('\n');
  const titleLower = sectionTitle.toLowerCase().trim();

  // Phase 1: Find the heading line that matches the title.
  // Matches `## Title`, `## 1. Title`, `### Title`, etc.
  let startIndex = -1;
  let headingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      // Strip leading number prefix (e.g., "1. ") for comparison
      const title = headingMatch[2].replace(/^\d+\.\s*/, '').trim().toLowerCase();
      if (title === titleLower) {
        startIndex = i;
        headingLevel = level;
        break;
      }
    }
  }

  if (startIndex === -1) {
    return '';
  }

  // Phase 2: Collect lines until the next heading at the same or higher level.
  const result: string[] = [];
  for (let i = startIndex; i < lines.length; i++) {
    if (i > startIndex) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+/);
      if (headingMatch && headingMatch[1].length <= headingLevel) {
        break;
      }
    }
    result.push(lines[i]);
  }

  return result.join('\n');
}

// ============================================================================
// SECTION QUALITY GATE (spec §12)
// ============================================================================

/**
 * Check the quality of a single section extracted from the full document.
 *
 * Runs slop checks (template phrases, repeated blocks), density checks
 * (CODE needs code blocks, PROSE forbids them, MATH needs formulas,
 * SEQUENTIAL needs phases), depth checks (min line count), and
 * section-specific checks (`: any` in dataModel, `toBeTruthy()` in testSpecs).
 *
 * @param doc      The full markdown document.
 * @param section  The section key (e.g., 'dataModel') or title.
 * @param strategy The L2 writing strategy with density modes and depth budgets.
 * @param analysis The analysis result (unused in most checks but required by spec).
 * @returns        SectionQualityResult with all issues found.
 */
export function checkSectionQuality(
  doc: string,
  section: string,
  strategy: L2Strategy,
  analysis: AnalysisResult,
): SectionQualityResult {
  // Resolve section title from key
  const sectionTitle = SECTION_TITLES[section] || section;
  const content = extractSection(doc, sectionTitle);

  const issues: SectionQualityIssue[] = [];

  // Density mode and depth budget from strategy
  // densityModes is Record<L2SectionType, { mode: DensityMode; purpose; validationRules }>
  const modeEntry = (strategy.densityModes as unknown as Record<string, { mode: string }>)[section];
  const mode = modeEntry?.mode || 'PROSE';
  const budgetEntry = (strategy.depthBudgets as Record<string, { min: number; max: number }>)[section];
  const budget = budgetEntry || { min: 0, max: 9999 };

  // Count metrics
  const lineCount = content.split('\n').filter(l => l.trim().length > 0).length;
  const codeBlockCount = (content.match(/```[\s\S]*?```/g) || []).length;

  // ========================================================================
  // SLOP CHECK
  // ========================================================================

  // Check for template phrases
  for (const phrase of TEMPLATE_PHRASES) {
    if (content.toLowerCase().includes(phrase)) {
      issues.push({
        severity: 'REJECT',
        type: 'SLOP',
        message: `Template phrase detected: "${phrase}"`,
        fix: `Remove this phrase and replace with specific content.`,
      });
    }
  }

  // Check for repeated blocks (same prefix appearing > 2 times)
  const blocks = content.split('\n\n');
  const prefixes = new Map<string, number>();
  for (const block of blocks) {
    const prefix = block.substring(0, 50).trim().toLowerCase();
    if (prefix.length > 20) {
      prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
    }
  }
  for (const [prefix, count] of prefixes) {
    if (count > 2) {
      issues.push({
        severity: 'REJECT',
        type: 'SLOP',
        message: `Repeated block (${count}x): "${prefix}..."`,
        fix: `This text appears ${count} times. Each instance must be unique.`,
      });
    }
  }

  // ========================================================================
  // DENSITY CHECK
  // ========================================================================

  if (mode === 'CODE' && codeBlockCount === 0) {
    issues.push({
      severity: 'REJECT',
      type: 'DENSITY',
      message: `CODE mode section has 0 code blocks`,
      fix: `Add code blocks with real TypeScript.`,
    });
  }

  if (mode === 'PROSE' && codeBlockCount > 0) {
    issues.push({
      severity: 'REJECT',
      type: 'DENSITY',
      message: `PROSE mode section has ${codeBlockCount} code blocks — should have 0`,
      fix: `Remove code blocks. This section is prose only.`,
    });
  }

  if (mode === 'MATH') {
    const hasFormula = /[a-z]\s*=\s.*[+\-*/]/i.test(content) || /O\(/.test(content);
    if (!hasFormula) {
      issues.push({
        severity: 'REJECT',
        type: 'DENSITY',
        message: `MATH mode section has no formulas`,
        fix: `Add formal mathematical notation with named coefficients.`,
      });
    }
  }

  if (mode === 'SEQUENTIAL') {
    if (!content.includes('Phase 1') || !content.includes('Phase 2')) {
      issues.push({
        severity: 'REJECT',
        type: 'DENSITY',
        message: `SEQUENTIAL mode section missing phases`,
        fix: `Must contain "Phase 1", "Phase 2", and rollback steps.`,
      });
    }
  }

  // ========================================================================
  // DEPTH CHECK
  // ========================================================================

  if (lineCount < budget.min) {
    issues.push({
      severity: 'WARN',
      type: 'DEPTH',
      message: `${lineCount} lines written, budget minimum is ${budget.min}`,
      fix: `Add more content to reach at least ${budget.min} lines.`,
    });
  }

  // ========================================================================
  // SECTION-SPECIFIC CHECKS
  // ========================================================================

  if (section === 'dataModel') {
    if (content.includes(': any')) {
      issues.push({
        severity: 'REJECT',
        type: 'STRUCTURE',
        message: `Data Model contains ": any" type annotation`,
        fix: `Replace "any" with specific types or "unknown" with type guards.`,
      });
    }
  }

  if (section === 'testSpecs') {
    if (content.includes('toBeTruthy()') || content.includes('toBeDefined()')) {
      issues.push({
        severity: 'REJECT',
        type: 'STRUCTURE',
        message: `Test uses vague assertion (toBeTruthy/toBeDefined)`,
        fix: `Replace with specific value: toBe(X), toEqual(Y), toBeLessThan(Z).`,
      });
    }
  }

  // Suppress unused variable warning — analysis is required by the spec interface
  // and may be used by future section-specific checks.
  void analysis;

  return {
    passed: issues.filter(i => i.severity === 'REJECT').length === 0,
    section,
    issues,
    lineCount,
    budgetMin: budget.min,
    codeBlockCount,
    densityMode: mode,
  };
}

// ============================================================================
// PHASE 3: DEEPENING CHECKS (spec §7)
// ============================================================================

/**
 * Run deepening checks to identify DEPTH GAPS — content that is structurally
 * present but semantically shallow.
 *
 * Five checks run on the complete document:
 *   1. Worked examples per algorithm (need ≥ 2)
 *   2. Threshold rationale (need "because" near each threshold)
 *   3. Edge case handlers per defense rule (need ≥ 1)
 *   4. Complexity statements per algorithm (need O(...))
 *   5. Cross-references between defenses and tests
 *
 * @param doc      The full markdown document.
 * @param analysis The analysis result with defenses and discovery data.
 * @returns        DeepeningResult with all gaps found.
 */
export function runDeepeningChecks(
  doc: string,
  analysis: AnalysisResult,
): DeepeningResult {
  const gaps: DeepeningGap[] = [];
  const totalFiles = analysis.discovery?.totalFiles ?? 0;
  const constructsLen = analysis.constructs?.length ?? 0;

  // ========================================================================
  // CHECK 1: Worked examples per algorithm
  // ========================================================================

  const algorithmSection = extractSection(doc, 'Algorithm Specifications');
  const algoBlocks = algorithmSection
    .split(/^###\s/gm)
    .filter(s => s.trim().length > 0);

  for (let i = 0; i < algoBlocks.length; i++) {
    const block = algoBlocks[i];
    const exampleCount =
      (block.match(/Example|Input.*→|Given.*When.*Then/gi) || []).length;
    if (exampleCount < 2) {
      const ruleName = block.split('\n')[0]?.trim() || `Algorithm ${i + 1}`;
      gaps.push({
        type: 'WORKED_EXAMPLE',
        section: 'algorithmSpecs',
        ruleName,
        description: `"${ruleName}" has ${exampleCount} worked example(s). Required: 2.`,
        fix:
          `Add a worked example showing: ` +
          `Input [specific construct] → Signal extraction [specific computation] → ` +
          `Threshold comparison [pass/warn/fail values] → Verdict with severity. ` +
          `Use ACTUAL NUMBERS, not placeholders.`,
        requiredCount: 2,
        actualCount: exampleCount,
      });
    }
  }

  // ========================================================================
  // CHECK 2: Threshold rationale
  // ========================================================================

  for (const defense of analysis.defenses) {
    const d = defense;
    const failValue = d.thresholds?.failThreshold?.value;
    if (failValue === undefined) continue;

    // Search for this value in the full document
    const valuePattern = new RegExp(`${failValue}`, 'g');
    const matches = [...doc.matchAll(valuePattern)];
    for (const match of matches) {
      const lineNumber = doc.substring(0, match.index ?? 0).split('\n').length;
      // Check if nearby lines (within 5) contain rationale keywords
      const nearbyText = doc
        .split('\n')
        .slice(Math.max(0, lineNumber - 5), lineNumber + 5)
        .join(' ')
        .toLowerCase();
      const hasRationale = /because|since|rationale|calibrated|empirically|why.*threshold|chosen/i.test(
        nearbyText,
      );
      if (!hasRationale) {
        gaps.push({
          type: 'THRESHOLD_RATIONALE',
          section: 'algorithmSpecs',
          ruleName: d.rule,
          description: `Threshold value ${failValue} for "${d.rule}" at line ${lineNumber} has no rationale.`,
          fix:
            `Add: "Threshold ${failValue} because [reasoning]. ` +
            `At ${failValue + 1}: [effect of increase]. ` +
            `At ${Math.max(0, failValue - 1)}: [effect of decrease]. ` +
            `Calibrated from [data source]."`,
          requiredCount: 1,
          actualCount: 0,
        });
        break; // One gap per threshold
      }
    }
  }

  // ========================================================================
  // CHECK 3: Edge case handling per defense rule
  // ========================================================================

  const defenseSection = extractSection(doc, 'Defense Rules') || '';
  const ruleBlocks = defenseSection
    .split(/^###.*Rule|^####\s/gm)
    .filter(s => s.trim().length > 0);

  for (let i = 0; i < ruleBlocks.length; i++) {
    const block = ruleBlocks[i];
    const edgeCount =
      (block.match(
        /edge case|if empty|if null|if undefined|fallback|default|when zero|when missing|boundary/gi,
      ) || []).length;
    if (edgeCount < 1) {
      const ruleName = block.split('\n')[0]?.trim() || `Rule ${i + 1}`;
      gaps.push({
        type: 'EDGE_CASE',
        section: 'defenseRules',
        ruleName,
        description: `"${ruleName}" has 0 edge case handlers.`,
        fix:
          `Add edge case handling: What happens when input is empty? null? ` +
          `single element? max size (${constructsLen} elements)? ` +
          `Each case needs: expected behavior + code path.`,
        requiredCount: 1,
        actualCount: 0,
      });
    }
  }

  // ========================================================================
  // CHECK 4: Complexity statement per algorithm
  // ========================================================================

  for (const block of algoBlocks) {
    const hasComplexity = /O\(/.test(block);
    if (!hasComplexity) {
      const ruleName = block.split('\n')[0]?.trim() || 'Unknown algorithm';
      gaps.push({
        type: 'COMPLEXITY',
        section: 'algorithmSpecs',
        ruleName,
        description: `"${ruleName}" has no complexity statement.`,
        fix:
          `Add: "Complexity: O(?) time, O(?) space. ` +
          `Budget: < ?ms for typical project (${totalFiles} files)."`,
        requiredCount: 1,
        actualCount: 0,
      });
    }
  }

  // ========================================================================
  // CHECK 5: Cross-references between defenses and tests
  // ========================================================================

  for (const defense of analysis.defenses) {
    const d = defense;
    // Check if defense rule is referenced in tests
    const testSection = extractSection(doc, 'Test Specifications');
    if (!testSection.includes(d.rule)) {
      gaps.push({
        type: 'CROSS_REFERENCE',
        section: 'testSpecs',
        ruleName: d.rule,
        description: `Defense rule "${d.rule}" not referenced in Test Specs.`,
        fix: `Add a test for "${d.rule}" that calls the implementation and asserts the result.`,
        requiredCount: 1,
        actualCount: 0,
      });
    }
  }

  tridentLog(
    'INFO',
    'l2-quality-audit',
    `Deepening checks complete: ${gaps.length} gap(s) found ` +
      `(${gaps.filter(g => g.type === 'WORKED_EXAMPLE').length} examples, ` +
      `${gaps.filter(g => g.type === 'THRESHOLD_RATIONALE').length} thresholds, ` +
      `${gaps.filter(g => g.type === 'EDGE_CASE').length} edge cases, ` +
      `${gaps.filter(g => g.type === 'COMPLEXITY').length} complexity, ` +
      `${gaps.filter(g => g.type === 'CROSS_REFERENCE').length} cross-refs)`,
  );

  return {
    passed: gaps.length === 0,
    gaps,
  };
}

// ============================================================================
// PHASE 4: CROSS-SECTION AUDIT (spec §8)
// ============================================================================

// --- Internal helper: Threshold Consistency Check (spec §8.1) ---

/**
 * Check that numeric threshold values are consistent across all sections.
 *
 * For each defense rule's fail threshold, searches for that value in the
 * Data Model, Defense Rules, Algorithm Specs, and Test Specs sections.
 * If different numeric values appear near the rule name in different
 * sections, reports a mismatch.
 */
function checkThresholdConsistency(
  doc: string,
  analysis: AnalysisResult,
): { passed: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  for (const defense of analysis.defenses) {
    const d = defense;
    const failValue = d.thresholds?.failThreshold?.value;
    if (failValue === undefined) continue;

    const sections: string[] = ['dataModel', 'defenseRules', 'algorithmSpecs', 'testSpecs'];
    const valuesBySection: Record<string, number[]> = {};

    for (const sectionType of sections) {
      const sectionTitle = SECTION_TITLES[sectionType] || sectionType;
      const sectionContent = extractSection(doc, sectionTitle);
      if (!sectionContent) continue;

      const ruleLower = (d.rule || '').toLowerCase();
      const domainLower = (d.domain || '').toLowerCase();
      const lines = sectionContent.split('\n');

      for (const line of lines) {
        const lineLower = line.toLowerCase();
        if (
          (ruleLower && lineLower.includes(ruleLower)) ||
          (domainLower && lineLower.includes(domainLower))
        ) {
          const numMatch = line.match(/(\d+(?:\.\d+)?)/g);
          if (numMatch) {
            for (const num of numMatch) {
              const val = parseFloat(num);
              // Within 50% of the expected value — likely the same threshold
              if (Math.abs(val - failValue) < failValue * 0.5) {
                if (!valuesBySection[sectionType]) valuesBySection[sectionType] = [];
                valuesBySection[sectionType].push(val);
              }
            }
          }
        }
      }
    }

    // Check if all sections agree
    const allValues = Object.values(valuesBySection).flat();
    const uniqueValues = [...new Set(allValues)];
    if (uniqueValues.length > 1) {
      mismatches.push(
        `Threshold for "${d.rule}" has different values across sections: ` +
          `${JSON.stringify(valuesBySection)}. All sections must use ${failValue}. ` +
          `Check Data Model const declaration, Algorithm pseudocode, and Test assertions.`,
      );
    }
  }

  return {
    passed: mismatches.length === 0,
    mismatches,
  };
}

// --- Internal helper: Type Name Consistency Check ---

/**
 * Check that type and interface names used in code blocks are consistent
 * across all sections. Detects case-variant duplicates (e.g., "Result" vs
 * "result") and type names declared in one section but missing from others.
 */
function checkTypeNameConsistency(
  doc: string,
  analysis: AnalysisResult,
): { passed: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  // Extract all declared type/interface names from the document
  const declaredTypes = new Set<string>();
  const declMatches = [...doc.matchAll(/(?:interface|type)\s+(\w+)/g)];
  for (const m of declMatches) {
    if (m[1]) declaredTypes.add(m[1]);
  }

  // Also include type names from analysis
  for (const t of analysis.types) {
    const nameMatch = t.match(/(?:interface|type)\s+(\w+)/);
    if (nameMatch && nameMatch[1]) {
      declaredTypes.add(nameMatch[1]);
    }
  }

  // Check for case-variant duplicates (e.g., "Result" vs "result")
  const lowerMap = new Map<string, string[]>();
  for (const name of declaredTypes) {
    const lower = name.toLowerCase();
    if (!lowerMap.has(lower)) lowerMap.set(lower, []);
    lowerMap.get(lower)!.push(name);
  }

  for (const [, variants] of lowerMap) {
    if (variants.length > 1) {
      mismatches.push(
        `Type name case inconsistency: ${variants.join(' vs ')} — pick one casing and use it everywhere.`,
      );
    }
  }

  // Check that types declared in the Data Model are referenced in at least
  // one other section (algorithm specs or test specs).
  const dataModelContent = extractSection(doc, 'Data Model');
  const dmTypeNames = new Set<string>();
  for (const m of dataModelContent.matchAll(/(?:interface|type)\s+(\w+)/g)) {
    if (m[1]) dmTypeNames.add(m[1]);
  }

  if (dmTypeNames.size > 0) {
    const algoContent = extractSection(doc, 'Algorithm Specifications');
    const testContent = extractSection(doc, 'Test Specifications');
    const combinedContent = algoContent + '\n' + testContent;

    for (const typeName of dmTypeNames) {
      if (!combinedContent.includes(typeName)) {
        mismatches.push(
          `Type "${typeName}" declared in Data Model but not referenced in Algorithm Specs or Test Specs.`,
        );
      }
    }
  }

  return {
    passed: mismatches.length === 0,
    mismatches,
  };
}

// --- Internal helper: Function Signature Consistency Check ---

/**
 * Check that function signatures are consistent across all sections.
 * Extracts function declarations from code blocks and verifies that
 * the same function name always has the same parameter list.
 */
function checkFunctionSignatures(
  doc: string,
  analysis: AnalysisResult,
): { passed: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  // Extract function signatures: name + parameter list
  const sigMap = new Map<string, string[]>();
  const sigRegex =
    /(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w+)\s*[<(]([^)>]*)[)>]/g;
  const sigMatches = [...doc.matchAll(sigRegex)];
  for (const m of sigMatches) {
    const name = m[1];
    const params = m[2]?.trim() || '';
    if (name) {
      if (!sigMap.has(name)) sigMap.set(name, []);
      sigMap.get(name)!.push(params);
    }
  }

  // Also check method signatures inside classes
  const methodRegex = /(?:public|private|protected)?\s*(\w+)\s*\(([^)]*)\)\s*[:{]/g;
  const methodMatches = [...doc.matchAll(methodRegex)];
  for (const m of methodMatches) {
    const name = m[1];
    const params = m[2]?.trim() || '';
    if (name && name !== 'if' && name !== 'for' && name !== 'while' && name !== 'switch') {
      if (!sigMap.has(name)) sigMap.set(name, []);
      sigMap.get(name)!.push(params);
    }
  }

  // Check for inconsistent signatures (same name, different params)
  for (const [name, sigs] of sigMap) {
    // Normalize: trim whitespace, remove parameter names (keep types)
    const normalized = sigs.map(s =>
      s
        .split(',')
        .map(p => p.trim().split(/\s*:\s*/).pop() || '')
        .join(','),
    );
    const uniqueSigs = [...new Set(normalized)];
    if (uniqueSigs.length > 1) {
      mismatches.push(
        `Function "${name}" has inconsistent signatures across sections: ` +
          `${uniqueSigs.map(s => `(${s})`).join(' vs ')}. ` +
          `All call sites must use the same parameter list.`,
      );
    }
  }

  // Suppress unused variable warning
  void analysis;

  return {
    passed: mismatches.length === 0,
    mismatches,
  };
}

// --- Internal helper: File Path Verification Check ---

/**
 * Verify that file paths referenced in the document actually exist on disk.
 * Extracts paths matching `/src/...ts|js|json` patterns and checks each
 * against the filesystem using the project root from analysis.discovery.
 */
function checkFilePaths(
  doc: string,
  analysis: AnalysisResult,
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  const projectRoot = analysis.discovery?.projectRoot || '';

  // Extract file paths from the document
  // Pattern: paths containing /src/ and ending in .ts, .js, or .json
  const pathMatch = doc.match(/(?:\.?\/)?src\/[^\s"'`)]+\.(?:ts|js|json)/g) || [];

  // Deduplicate
  const uniquePaths = [...new Set(pathMatch)];

  for (const relPath of uniquePaths) {
    // Skip paths that look like planned new files or contain markers
    if (relPath.includes('NEW') || relPath.includes('TODO') || relPath.includes('PLACEHOLDER')) {
      continue;
    }

    if (projectRoot) {
      const cleanPath = relPath.replace(/^\.\//, '');
      const fullPath = path.join(projectRoot, cleanPath);
      if (!fs.existsSync(fullPath)) {
        issues.push(
          `Referenced file does not exist on disk: ${relPath} ` +
            `(checked: ${fullPath})`,
        );
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

// --- Internal helper: Completeness Chain Check (spec §8.2) ---

/**
 * Verify the threat → defense → test completeness chain.
 *
 * For each threat:
 *   1. Is the threat mentioned in the document?
 *   2. Is there a defense rule for this threat?
 *   3. Does the defense rule appear in the Defense Rules section?
 *   4. Does the defense rule have a test in the Test Specifications section?
 *   5. Does the test use a specific assertion (not vague toBeTruthy/toBeDefined)?
 */
function checkCompletenessChain(
  doc: string,
  analysis: AnalysisResult,
): { passed: boolean; gaps: string[] } {
  const gaps: string[] = [];

  const defenseSection = extractSection(doc, 'Defense Rules');
  const testSection = extractSection(doc, 'Test Specifications');

  for (const threat of analysis.threats) {
    const t = threat;
    const pattern = t.pattern || 'UNKNOWN';

    // Check 1: Is the threat mentioned in the document?
    if (!doc.includes(pattern)) {
      gaps.push(
        `Threat "${pattern}" is never mentioned in the spec. Add coverage in Defense Rules.`,
      );
      continue;
    }

    // Check 2: Is there a defense rule for this threat?
    const matchingDefense = analysis.defenses.find((d: DefenseSpec) => {
      const dRule = (d.rule || '').toLowerCase();
      const tPat = pattern.toLowerCase();
      return (
        (tPat.split('_')[0] && dRule.includes(tPat.split('_')[0])) ||
        tPat.includes((d.domain || '').toLowerCase())
      );
    });

    if (!matchingDefense) {
      gaps.push(
        `No defense rule addresses threat "${pattern}". Add a defense rule.`,
      );
      continue;
    }

    // Check 3: Does the defense rule have implementation in the section?
    const ruleEscaped = (matchingDefense.rule || '').replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    const rulePattern = new RegExp(ruleEscaped, 'i');
    if (!rulePattern.test(defenseSection)) {
      gaps.push(
        `Defense rule "${matchingDefense.rule}" not found in Defense Rules section.`,
      );
      continue;
    }

    // Check 4: Does the defense have a test?
    if (!testSection.includes(matchingDefense.rule)) {
      gaps.push(
        `No test found for defense rule "${matchingDefense.rule}". Add a test.`,
      );
      continue;
    }

    // Check 5: Does the test have a specific assertion?
    const testPattern = new RegExp(
      `${ruleEscaped}[^]*?expect\\(`,
      'is',
    );
    if (!testPattern.test(testSection)) {
      // Check for vague assertions
      const vaguePattern = new RegExp(
        `${ruleEscaped}[^]*?toBeTruthy|toBeDefined`,
        'is',
      );
      if (vaguePattern.test(testSection)) {
        gaps.push(
          `Test for "${matchingDefense.rule}" uses vague assertion. ` +
            `Replace with: expect(result.field).toBe(specificValue).`,
        );
      }
    }
  }

  return {
    passed: gaps.length === 0,
    gaps,
  };
}

// --- Internal helper: Adversarial Challenge Coverage Check (spec §8.3) ---

/**
 * Verify that each adversarial challenge from the strategy is addressed
 * somewhere in the document. Extracts keywords from each challenge and
 * searches for them in the document text.
 */
function checkAdversarialCoverage(
  doc: string,
  strategy: L2Strategy,
): { passed: boolean; missing: string[] } {
  const missing: string[] = [];
  const docLower = doc.toLowerCase();

  const challenges = strategy.challenges || [];

  for (const challenge of challenges) {
    // Extract keywords from the challenge text
    const challengeText: string = challenge.challenge || '';
    const keywords = challengeText
      .split(/\s+/)
      .filter(w => w.length > 6)
      .map(w => w.toLowerCase())
      .slice(0, 5);

    // Search for these keywords in the document
    let found = false;
    for (const keyword of keywords) {
      if (docLower.includes(keyword)) {
        found = true;
        break;
      }
    }

    if (!found) {
      const challengeType: string = challenge.type || 'UNKNOWN';
      const requiredDefense: string = challenge.requiredDefense || 'Add coverage.';
      missing.push(
        `Adversarial challenge (${challengeType}) not addressed in spec: ` +
          `${challengeText.substring(0, 100)}... Required defense: ${requiredDefense}`,
      );
    }
  }

  return {
    passed: missing.length === 0,
    missing,
  };
}

// === CHECK 7: Duplicate Section Detection ===
function checkDuplicateSections(doc: string): { passed: boolean; duplicates: string[] } {
  const duplicates: string[] = [];
  const headingCounts = new Map<string, number>();
  const headingPattern = /^(#{1,4})\s+(\d+\.?\s*)?(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(doc)) !== null) {
    const heading = match[0].trim().toLowerCase();
    headingCounts.set(heading, (headingCounts.get(heading) || 0) + 1);
  }

  for (const [heading, count] of headingCounts) {
    if (count > 1) {
      duplicates.push(`Section "${heading.substring(0, 80)}" appears ${count} times — consolidate into one section`);
    }
  }

  // Also check for duplicate numbered top-level sections (## 3. Data Model appearing twice)
  const numberedSections = new Map<string, number>();
  const numberedPattern = /^##\s+(\d+)\.\s+(.+)$/gm;
  while ((match = numberedPattern.exec(doc)) !== null) {
    const num = match[1];
    numberedSections.set(num, (numberedSections.get(num) || 0) + 1);
  }
  for (const [num, count] of numberedSections) {
    if (count > 1) {
      duplicates.push(`Section number ${num} appears ${count} times — duplicate sections must be merged`);
    }
  }

  return {
    passed: duplicates.length === 0,
    duplicates,
  };
}

// === CHECK 8: Numbering Validation ===
function checkNumberingErrors(doc: string): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  const sections = doc.split(/^##\s/m);

  for (const section of sections) {
    const numberedItems: number[] = [];
    const lines = section.split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*(\d+)\.\s/);
      if (m) {
        numberedItems.push(parseInt(m[1], 10));
      }
    }

    // Check for duplicate numbers
    const seen = new Set<number>();
    for (const num of numberedItems) {
      if (seen.has(num)) {
        errors.push(`Duplicate numbering: item ${num} appears more than once in a numbered list`);
      }
      seen.add(num);
    }

    // Check for gaps (1, 2, 4 — missing 3)
    if (numberedItems.length > 2) {
      const max = Math.max(...numberedItems);
      for (let i = 1; i <= max; i++) {
        if (!numberedItems.includes(i) && i > 1) {
          // Only report if it looks like a sequential list (starts at 1)
          if (numberedItems.includes(1)) {
            errors.push(`Numbering gap: item ${i} is missing from a sequential list`);
            break; // One gap per section is enough to flag
          }
        }
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

// === CHECK 9: Defense Rule Structure Enforcement ===
function checkDefenseRuleStructure(doc: string, analysis: AnalysisResult): { passed: boolean; missing: string[] } {
  const missing: string[] = [];
  const requiredElements = [
    { pattern: /purpose/i, name: 'Purpose' },
    { pattern: /implementation|typescript|```typescript/i, name: 'Implementation' },
    { pattern: /threshold/i, name: 'Threshold reference' },
    { pattern: /example|input.*→|worked/i, name: 'Worked Example' },
    { pattern: /complexity|O\(/i, name: 'Complexity statement' },
  ];

  // Extract each defense rule subsection (### N.N Rule Name)
  const ruleSections = doc.split(/^###\s+\d+\.\d+\s/i);
  if (ruleSections.length <= 1) return { passed: true, missing }; // No rule subsections found

  for (let i = 1; i < ruleSections.length; i++) {
    const ruleContent = ruleSections[i];
    const ruleName = ruleContent.split('\n')[0].trim().substring(0, 50);

    for (const elem of requiredElements) {
      if (!elem.pattern.test(ruleContent)) {
        missing.push(`Defense rule "${ruleName}" is missing: ${elem.name}`);
      }
    }
  }

  return {
    passed: missing.length === 0,
    missing,
  };
}

// === CHECK 10: Type Field Consistency ===
function checkTypeFieldConsistency(doc: string): { passed: boolean; conflicts: string[] } {
  const conflicts: string[] = [];

  // Find all interface/type definitions and check for same name with different fields
  const interfacePattern = /(?:interface|type)\s+(\w+)\s*(?:\{|extends|=)/g;
  const interfaceLocations: { name: string; pos: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = interfacePattern.exec(doc)) !== null) {
    interfaceLocations.push({ name: m[1], pos: m.index });
  }

  // Group by name
  const byName = new Map<string, number[]>();
  for (const loc of interfaceLocations) {
    const arr = byName.get(loc.name) || [];
    arr.push(loc.pos);
    byName.set(loc.name, arr);
  }

  // For interfaces defined more than once, extract fields and compare
  for (const [name, positions] of byName) {
    if (positions.length < 2) continue;

    const fieldSets: Set<string>[] = [];
    for (const pos of positions) {
      // Extract the interface body (from { to matching })
      let depth = 0;
      let bodyStart = pos;
      let bodyEnd = pos;
      for (let i = pos; i < doc.length && i < pos + 5000; i++) {
        if (doc[i] === '{') { if (depth === 0) bodyStart = i; depth++; }
        if (doc[i] === '}') { depth--; if (depth === 0) { bodyEnd = i; break; } }
      }
      const body = doc.substring(bodyStart, bodyEnd);

      // Extract field names (word before : or ; or ?)
      const fields = new Set<string>();
      const fieldPattern = /(\w+)\s*[?:]/g;
      let fm: RegExpExecArray | null;
      while ((fm = fieldPattern.exec(body)) !== null) {
        fields.add(fm[1]);
      }
      fieldSets.push(fields);
    }

    // Compare field sets
    for (let i = 0; i < fieldSets.length; i++) {
      for (let j = i + 1; j < fieldSets.length; j++) {
        const setA = fieldSets[i];
        const setB = fieldSets[j];
        const onlyInA = [...setA].filter(f => !setB.has(f));
        const onlyInB = [...setB].filter(f => !setA.has(f));
        if (onlyInA.length > 0 || onlyInB.length > 0) {
          conflicts.push(
            `Type "${name}" defined with inconsistent fields: ` +
            `definition ${i + 1} has [${onlyInA.join(', ') || 'none'}] extra, ` +
            `definition ${j + 1} has [${onlyInB.join(', ') || 'none'}] extra. ` +
            `CONSOLIDATE into a single definition.`,
          );
        }
      }
    }
  }

  return {
    passed: conflicts.length === 0,
    conflicts,
  };
}

// === CHECK 11: Section Completeness ===
function checkSectionCompleteness(doc: string): { passed: boolean; missing: string[] } {
  const requiredSections = [
    'Executive Summary', 'Architecture', 'Data Model', 'Engine Class',
    'Defense Rules', 'Algorithm', 'Test', 'Blind Spot',
    'Integration', 'Evidence', 'File Manifest', 'Migration',
  ];
  const missing: string[] = [];
  for (const section of requiredSections) {
    const pattern = new RegExp(`^##\\s+\\d+\\.\\s*${section}`, 'im');
    if (!pattern.test(doc)) {
      missing.push(`Missing required section: ## N. ${section}`);
    }
  }
  return { passed: missing.length === 0, missing };
}

/**
 * Run the full cross-section audit (Phase 4).
 *
 * Executes six checks on the complete document:
 *   1. Threshold consistency — numeric values agree across sections
 *   2. Type name consistency — type names use consistent casing
 *   3. Function signature consistency — signatures match across sections
 *   4. File path verification — referenced paths exist on disk
 *   5. Completeness chain — every threat has defense → implementation → test
 *   6. Adversarial coverage — every challenge from strategy is addressed
 *
 * @param doc      The full markdown document.
 * @param analysis The analysis result.
 * @param strategy The L2 writing strategy.
 * @returns        CrossSectionAuditResult with all check results.
 */
export function runCrossSectionAudit(
  doc: string,
  analysis: AnalysisResult,
  strategy: L2Strategy,
): CrossSectionAuditResult {
  // === CHECK 1: Threshold Consistency ===
  const thresholdConsistency = checkThresholdConsistency(doc, analysis);

  // === CHECK 2: Type Name Consistency ===
  const typeNameConsistency = checkTypeNameConsistency(doc, analysis);

  // === CHECK 3: Function Signature Consistency ===
  const functionSignatureConsistency = checkFunctionSignatures(doc, analysis);

  // === CHECK 4: File Path Verification ===
  const filePathVerification = checkFilePaths(doc, analysis);

  // === CHECK 5: Completeness Chain ===
  const completenessChain = checkCompletenessChain(doc, analysis);

  // === CHECK 6: Adversarial Challenge Coverage ===
  const adversarialCoverage = checkAdversarialCoverage(doc, strategy);

  // === CHECK 7: Duplicate Sections ===
  const duplicateSections = checkDuplicateSections(doc);

  // === CHECK 8: Numbering Errors ===
  const numberingErrors = checkNumberingErrors(doc);

  // === CHECK 9: Defense Rule Structure ===
  const defenseRuleStructure = checkDefenseRuleStructure(doc, analysis);

  // === CHECK 10: Type Field Consistency ===
  const typeFieldConsistency = checkTypeFieldConsistency(doc);

  // === CHECK 11: Section Completeness — REAL invocation (v4.4.3 R10 FIX:
  // the old wiring substituted completenessChain.gaps for the section check,
  // leaving checkSectionCompleteness dead and its verdict never computed).
  const sectionCompleteness = checkSectionCompleteness(doc);

  const checks = {
    thresholdConsistency,
    typeNameConsistency,
    functionSignatureConsistency,
    filePathVerification,
    completenessChain,
    adversarialCoverage,
    duplicateSections,
    numberingErrors,
    defenseRuleStructure,
    typeFieldConsistency,
    sectionCompleteness,
  };

  const allPassed =
    thresholdConsistency.passed &&
    typeNameConsistency.passed &&
    functionSignatureConsistency.passed &&
    filePathVerification.passed &&
    completenessChain.passed &&
    adversarialCoverage.passed &&
    duplicateSections.passed &&
    numberingErrors.passed &&
    defenseRuleStructure.passed &&
    typeFieldConsistency.passed &&
    sectionCompleteness.passed;

  const issueCount =
    thresholdConsistency.mismatches.length +
    typeNameConsistency.mismatches.length +
    functionSignatureConsistency.mismatches.length +
    filePathVerification.issues.length +
    completenessChain.gaps.length +
    adversarialCoverage.missing.length +
    duplicateSections.duplicates.length +
    numberingErrors.errors.length +
    defenseRuleStructure.missing.length +
    typeFieldConsistency.conflicts.length +
    sectionCompleteness.missing.length;

  tridentLog(
    'INFO',
    'l2-quality-audit',
    `Cross-section audit complete: ${allPassed ? 'PASSED' : 'FAILED'} ` +
      `(${issueCount} total issues — thresholds: ${thresholdConsistency.mismatches.length}, ` +
      `types: ${typeNameConsistency.mismatches.length}, ` +
      `signatures: ${functionSignatureConsistency.mismatches.length}, ` +
      `files: ${filePathVerification.issues.length}, ` +
      `completeness: ${completenessChain.gaps.length}, ` +
      `adversarial: ${adversarialCoverage.missing.length}, ` +
      `dupSections: ${duplicateSections.duplicates.length}, ` +
      `numbering: ${numberingErrors.errors.length}, ` +
      `ruleStructure: ${defenseRuleStructure.missing.length}, ` +
      `typeFields: ${typeFieldConsistency.conflicts.length}, ` +
      `sections: ${sectionCompleteness.missing.length})`,
  );

  return {
    passed: allPassed,
    checks,
    issueCount,
  };
}

// ============================================================================
// FEEDBACK FORMATTING
// ============================================================================

/**
 * Format deepening gaps as an LLM feedback string.
 *
 * Produces a structured message listing each depth gap with its type,
 * description, and fix instruction. Used to provide revision guidance
 * to the LLM after deepening checks fail.
 *
 * @param result The DeepeningResult to format.
 * @returns      Formatted feedback string for the LLM.
 */
export function formatDeepeningFeedback(result: DeepeningResult): string {
  if (result.gaps.length === 0) {
    return 'DEEPENING PASS — No depth gaps found. Document is sufficiently detailed.\n';
  }

  let feedback = `DEEPENING PASS — ${result.gaps.length} depth gap(s) found.\n\n`;
  feedback += `Address each gap and call the tool again with the updated sections.\n\n`;

  for (let i = 0; i < result.gaps.length; i++) {
    const gap = result.gaps[i];
    feedback += `${i + 1}. [${gap.type}] ${gap.description}\n`;
    feedback += `   FIX: ${gap.fix}\n\n`;
  }

  return feedback;
}

/**
 * Format cross-section audit issues as an LLM feedback string.
 *
 * Produces a structured message listing each check that failed with
 * its specific issues. Used to provide revision guidance to the LLM
 * after the cross-section audit fails.
 *
 * @param result The CrossSectionAuditResult to format.
 * @returns      Formatted feedback string for the LLM.
 */
export function formatAuditFeedback(result: CrossSectionAuditResult): string {
  if (result.passed) {
    return 'CROSS-SECTION AUDIT PASS — All 6 checks passed. Document is internally consistent.\n';
  }

  let feedback = `CROSS-SECTION AUDIT — ${result.issueCount} issue(s) found across failed checks.\n\n`;
  feedback += `Fix each issue and resubmit the document.\n\n`;

  let itemNum = 1;

  // Threshold Consistency
  if (!result.checks.thresholdConsistency.passed) {
    feedback += `--- Threshold Consistency ---\n`;
    for (const m of result.checks.thresholdConsistency.mismatches) {
      feedback += `${itemNum}. ${m}\n`;
      itemNum++;
    }
    feedback += '\n';
  }

  // Type Name Consistency
  if (!result.checks.typeNameConsistency.passed) {
    feedback += `--- Type Name Consistency ---\n`;
    for (const m of result.checks.typeNameConsistency.mismatches) {
      feedback += `${itemNum}. ${m}\n`;
      itemNum++;
    }
    feedback += '\n';
  }

  // Function Signature Consistency
  if (!result.checks.functionSignatureConsistency.passed) {
    feedback += `--- Function Signature Consistency ---\n`;
    for (const m of result.checks.functionSignatureConsistency.mismatches) {
      feedback += `${itemNum}. ${m}\n`;
      itemNum++;
    }
    feedback += '\n';
  }

  // File Path Verification
  if (!result.checks.filePathVerification.passed) {
    feedback += `--- File Path Verification ---\n`;
    for (const issue of result.checks.filePathVerification.issues) {
      feedback += `${itemNum}. ${issue}\n`;
      itemNum++;
    }
    feedback += '\n';
  }

  // Completeness Chain
  if (!result.checks.completenessChain.passed) {
    feedback += `--- Completeness Chain (Threat → Defense → Test) ---\n`;
    for (const gap of result.checks.completenessChain.gaps) {
      feedback += `${itemNum}. ${gap}\n`;
      itemNum++;
    }
    feedback += '\n';
  }

  // Adversarial Coverage
  if (!result.checks.adversarialCoverage.passed) {
    feedback += `--- Adversarial Challenge Coverage ---\n`;
    for (const missing of result.checks.adversarialCoverage.missing) {
      feedback += `${itemNum}. ${missing}\n`;
      itemNum++;
    }
    feedback += '\n';
  }

  // Duplicate Sections
  if (!result.checks.duplicateSections.passed) {
    feedback += `--- Duplicate Sections (CRITICAL — merge into one) ---\n`;
    for (const dup of result.checks.duplicateSections.duplicates) {
      feedback += `${itemNum}. ${dup}\n`;
      itemNum++;
    }
    feedback += '\n';
  }

  // Numbering Errors
  if (!result.checks.numberingErrors.passed) {
    feedback += `--- Numbering Errors ---\n`;
    for (const err of result.checks.numberingErrors.errors) {
      feedback += `${itemNum}. ${err}\n`;
      itemNum++;
    }
    feedback += '\n';
  }

  // Defense Rule Structure
  if (!result.checks.defenseRuleStructure.passed) {
    feedback += `--- Defense Rule Structure (each rule needs: Purpose, Implementation, Threshold, Example, Complexity) ---\n`;
    for (const miss of result.checks.defenseRuleStructure.missing) {
      feedback += `${itemNum}. ${miss}\n`;
      itemNum++;
    }
    feedback += '\n';
  }

  // Type Field Consistency
  if (!result.checks.typeFieldConsistency.passed) {
    feedback += `--- Type Field Consistency (CRITICAL — same type must have same fields) ---\n`;
    for (const conflict of result.checks.typeFieldConsistency.conflicts) {
      feedback += `${itemNum}. ${conflict}\n`;
      itemNum++;
    }
    feedback += '\n';
  }

  return feedback;
}
