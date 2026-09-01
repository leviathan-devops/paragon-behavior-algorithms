// l2-strategy.ts — Strategy derivation for L2 Deep Planning artifact generation.
// Computes complexity, narrative arc, reader questions, design tensions,
// adversarial challenges, and depth budgets — ALL derived from analysis data.

import type { AnalysisResult } from './analysis-engine.ts';
import type { DiscoveryResult } from '../shared/auto-discover.js';
import type { CodeConstruct } from '../audit-engine/types.ts';
import type { ThreatReport } from './threat-modeler.ts';
import { generateAdversarialChallenges, type AdversarialChallenge } from './l2-adversarial.ts';

// ============================================================================
// SECTION TYPES
// ============================================================================

export type L2SectionType =
  | 'executiveSummary'
  | 'architecture'
  | 'dataModel'
  | 'engineClass'
  | 'defenseRules'
  | 'algorithmSpecs'
  | 'testSpecs'
  | 'blindSpots'
  | 'integration'
  | 'evidenceFormat'
  | 'fileManifest'
  | 'migration';

export type DensityMode = 'PROSE' | 'CODE' | 'HYBRID' | 'MATH' | 'SEQUENTIAL';

/**
 * Section dependency graph. A section can only be generated after its
 * dependencies are complete and quality-checked.
 */
export const SECTION_DEPENDENCIES: Record<L2SectionType, L2SectionType[]> = {
  executiveSummary: [],
  architecture: [],
  dataModel: ['architecture'],
  engineClass: ['dataModel'],
  defenseRules: ['dataModel', 'engineClass'],
  algorithmSpecs: ['defenseRules'],
  testSpecs: ['dataModel', 'defenseRules', 'algorithmSpecs'],
  blindSpots: ['defenseRules'],
  integration: ['engineClass', 'defenseRules'],
  evidenceFormat: ['dataModel'],
  fileManifest: [],
  migration: ['engineClass', 'defenseRules', 'integration'],
};

/**
 * Section generation order. Respects the dependency graph while
 * optimizing for narrative flow.
 */
export const SECTION_ORDER: L2SectionType[] = [
  'executiveSummary',
  'architecture',
  'dataModel',
  'engineClass',
  'defenseRules',
  'algorithmSpecs',
  'testSpecs',
  'blindSpots',
  'integration',
  'evidenceFormat',
  'fileManifest',
  'migration',
];

export const SECTION_TITLES: Record<L2SectionType, string> = {
  executiveSummary: 'Executive Summary',
  architecture: 'Architecture',
  dataModel: 'Data Model',
  engineClass: 'Engine Class Design',
  defenseRules: 'Defense Rules',
  algorithmSpecs: 'Algorithm Specifications',
  testSpecs: 'Test Specifications',
  blindSpots: 'Blind Spots',
  integration: 'Integration',
  evidenceFormat: 'Evidence Format',
  fileManifest: 'File Manifest',
  migration: 'Migration Strategy',
};

// ============================================================================
// STRATEGY TYPES
// ============================================================================

export interface ReaderQuestion {
  section: string;
  question: string;
  answerSource: string;
}

export interface DesignTension {
  rule: string;
  cost: string;
  resolution: string;
}

export interface L2Strategy {
  complexity: {
    score: number;
    tier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    totalTargetLines: number;
    domainType: string;
    domainMultiplier: number;
  };
  narrative: {
    dominantThreat: string;
    arc: string;
    sectionHooks: Record<string, string>;
  };
  questions: ReaderQuestion[];
  tensions: DesignTension[];
  challenges: AdversarialChallenge[];
  depthBudgets: Record<L2SectionType, { min: number; max: number }>;
  densityModes: Record<L2SectionType, { mode: DensityMode; purpose: string; validationRules: string[] }>;
  references: Record<string, { source: string; section: string; lines: string; why: string; excerpt: string }>;
}

// ============================================================================
// DOMAIN MULTIPLIERS
// ============================================================================

export const DOMAIN_MULTIPLIERS: Record<string, number> = {
  'utility': 1,
  'web-application': 2,
  'audit-engine': 3,
  'planning-engine': 4,
  'mission-critical': 5,
};

// ============================================================================
// §5.2 COMPLEXITY SCORING
// ============================================================================

/**
 * Detect domain from construct patterns. Checks construct names and file
 * paths for domain indicators.
 */
export function detectDomain(constructs: CodeConstruct[]): string {
  const allText = constructs.map(c => `${c.name || ''} ${c.filePath || ''}`).join(' ').toLowerCase();

  if (allText.includes('audit') || allText.includes('layer') || allText.includes('finding')) return 'audit-engine';
  if (allText.includes('plan') || allText.includes('wave') || allText.includes('dispatch')) return 'planning-engine';
  if (allText.includes('render') || allText.includes('component') || allText.includes('route')) return 'web-application';
  return 'utility';
}

/**
 * Compute complexity from SPECIFIC ANALYSIS VALUES, not estimated.
 */
export function computeComplexity(analysis: AnalysisResult, discovery: DiscoveryResult): {
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  totalTargetLines: number;
  domainType: string;
  domainMultiplier: number;
} {
  const constructCount = analysis.constructs.length;
  const threatInstanceCount = analysis.threats.reduce(
    (sum, t) => sum + (t.findings?.length || 0), 0
  );
  const defenseCount = analysis.defenses.length;

  // Domain detection from construct patterns
  const domainType = detectDomain(analysis.constructs);
  const domainMultiplier = DOMAIN_MULTIPLIERS[domainType] || 1;

  const score =
    Math.round(constructCount / 1000) +
    Math.round(threatInstanceCount / 100) +
    (defenseCount * 2) +
    domainMultiplier;

  const tier = score > 100 ? 'CRITICAL' : score > 30 ? 'HIGH' : score > 10 ? 'MEDIUM' : 'LOW';

  const totalTargetLines =
    tier === 'CRITICAL' ? 5000 :
    tier === 'HIGH' ? 3500 :
    tier === 'MEDIUM' ? 2500 : 1500;

  return { score, tier, totalTargetLines, domainType, domainMultiplier };
}

// ============================================================================
// §5.3 NARRATIVE ARC DERIVATION
// ============================================================================

export const NARRATIVE_TEMPLATES: Record<string, {
  arc: (instances: number, target: number) => string;
  hooks: (instances: number) => Record<L2SectionType, string>;
}> = {
  THEATRICAL_IMPLEMENTATION: {
    arc: (n, target) =>
      `${n} functions lie about what they do — they return hardcoded values, ` +
      `have empty bodies, or leave promises floating without await. They pass ` +
      `compilation but fail at runtime. This spec designs the detection system ` +
      `that catches every flavor of the lie and the defense pipeline that ` +
      `prevents regression. Target: ${target} lines.`,
    hooks: (n) => ({
      executiveSummary: `${n} functions in this codebase return hardcoded values without doing real work.`,
      architecture: 'Detection requires walking every function body in the AST and analyzing its semantic content.',
      dataModel: 'Define the vocabulary: what is a "theatrical finding"? What severity levels exist?',
      engineClass: 'The detection engine walks the AST, applies 5 rules, and emits findings to the evidence chain.',
      defenseRules: 'Each rule catches a different flavor of the lie: empty body, literal return, floating promise, empty catch, missing implementation.',
      algorithmSpecs: 'The math behind each detection: signal extraction, threshold comparison, verdict computation.',
      testSpecs: 'Mechanical proof: for each theatrical pattern, a test construct that triggers detection and asserts the exact finding.',
      blindSpots: 'What the detector CANNOT see: dynamic dispatch, eval(), string-based calls, callback patterns.',
      integration: 'How findings flow from the detector to the audit gate and evidence chain.',
      evidenceFormat: 'JSON schema for each finding, hash-linked into the Merkle evidence chain.',
      fileManifest: 'Every file to create or modify, with line estimates.',
      migration: 'Deploy in 3 phases: observe-only -> advisory -> enforcement, with rollback at each step.',
    }),
  },

  DEAD_CODE: {
    arc: (n, target) =>
      `${n} constructs are exported but never called by any other code. ` +
      `They consume maintenance effort, mislead readers, and bloat the bundle. ` +
      `This spec designs the call-graph-based detection system and the ` +
      `remediation pipeline. Target: ${target} lines.`,
    hooks: (n) => ({
      executiveSummary: `${n} functions and variables are defined but never called.`,
      architecture: 'Detection requires building a complete call graph from entry points through all reachable code.',
      dataModel: 'Define the call graph structure: nodes, edges, reachability sets.',
      engineClass: 'The analysis engine builds the call graph, computes reachability, and identifies unreachable constructs.',
      defenseRules: 'Each rule catches a different unreachable pattern: never imported, imported but unused, called only from tests.',
      algorithmSpecs: 'BFS/DFS reachability computation from entry points.',
      testSpecs: 'For each unreachable pattern, a test construct + expected finding.',
      blindSpots: 'Dynamic import(), require(), eval(), and string-based dispatch are invisible to static analysis.',
      integration: 'How dead code findings integrate with the build system for automatic removal suggestions.',
      evidenceFormat: 'JSON finding with construct name, location, caller count (0), and reachability proof.',
      fileManifest: 'Files to create/modify.',
      migration: 'Phase 1: observe -> Phase 2: warn -> Phase 3: auto-remove with guard.',
    }),
  },

  DUPLICATE_IMPLEMENTATION: {
    arc: (n, target) =>
      `${n} function pairs share 70%+ AST structure — copy-paste duplicates ` +
      `that should be unified into parameterized helpers. This spec designs ` +
      `the fingerprint-based detection system. Target: ${target} lines.`,
    hooks: (n) => ({
      executiveSummary: `${n} pairs of functions are near-identical copy-paste duplicates.`,
      architecture: 'Detection requires fingerprinting every function body and comparing pairwise via Jaccard similarity.',
      dataModel: 'Define the fingerprint structure: AST node type sequence, similarity score.',
      engineClass: 'The analysis engine fingerprints, buckets, and compares constructs.',
      defenseRules: 'Each rule catches a different duplication type: exact copy, parameterized copy, structural copy.',
      algorithmSpecs: 'Jaccard similarity computation on AST fingerprint sets.',
      testSpecs: 'For each duplication type, a pair of constructs + expected similarity score + expected finding.',
      blindSpots: 'Semantic duplicates (same logic, different syntax) escape AST fingerprinting.',
      integration: 'How duplicate findings suggest specific refactoring (extract shared helper).',
      evidenceFormat: 'JSON finding with both construct names, similarity score, shared AST nodes.',
      fileManifest: 'Files to create/modify.',
      migration: 'Phase 1: observe -> Phase 2: warn -> Phase 3: block on new duplicates.',
    }),
  },

  DEFAULT: {
    arc: (n, target) =>
      `${n} instances of quality issues detected. This spec designs the ` +
      `detection and remediation system. Target: ${target} lines.`,
    hooks: (n) => ({
      executiveSummary: `${n} quality issues detected in the codebase.`,
      architecture: 'Detection uses AST analysis and call graph computation.',
      dataModel: 'Define the types for findings, rules, and thresholds.',
      engineClass: 'The analysis engine applies rules and emits findings.',
      defenseRules: 'Each rule catches a specific quality pattern.',
      algorithmSpecs: 'Algorithm logic per rule.',
      testSpecs: 'Test constructs and expected findings.',
      blindSpots: 'What the analysis cannot detect.',
      integration: 'How findings integrate with the build and audit system.',
      evidenceFormat: 'JSON finding schema.',
      fileManifest: 'Files to create/modify.',
      migration: 'Deployment phases.',
    }),
  },
};

/**
 * Derive the narrative arc from the DOMINANT THREAT PATTERN — the
 * highest-severity, highest-instance-count threat.
 */
export function deriveNarrativeArc(
  analysis: AnalysisResult,
  complexity: { tier: string; totalTargetLines: number },
): L2Strategy['narrative'] {
  // Sort threats by severity then by instance count
  const severityRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const sorted = [...analysis.threats].sort((a, b) => {
    const sa = severityRank[a.severity] || 0;
    const sb = severityRank[b.severity] || 0;
    if (sb !== sa) return sb - sa;
    return (b.findings?.length || 0) - (a.findings?.length || 0);
  });

  const dominant = sorted[0];
  const pattern = (dominant?.pattern || 'UNKNOWN').toUpperCase();
  const instanceCount = dominant?.findings?.length || 0;

  // Select narrative template by pattern
  const templates = NARRATIVE_TEMPLATES[pattern] || NARRATIVE_TEMPLATES.DEFAULT;

  return {
    dominantThreat: pattern,
    arc: templates.arc(instanceCount, complexity.totalTargetLines),
    sectionHooks: templates.hooks(instanceCount) as unknown as Record<string, string>,
  };
}

// ============================================================================
// §5.4 ANTICIPATED READER QUESTION GENERATION
// ============================================================================

/**
 * Generate reader questions SYSTEMATICALLY from analysis data using
 * deterministic rules. Every question has a specific data source that
 * answers it.
 */
export function generateReaderQuestions(
  analysis: AnalysisResult,
  discovery: DiscoveryResult,
): ReaderQuestion[] {
  const questions: ReaderQuestion[] = [];

  // RULE 1: For each defense rule with weight >= 7, ask about blocking behavior
  for (const defense of analysis.defenses) {
    const d = defense;
    if (d.weight >= 7) {
      questions.push({
        section: 'defenseRules',
        question: `Rule "${d.rule}" has weight ${d.weight}/10 and severity ${d.violationSeverity}. ` +
          `If this check FAILs, does the entire audit fail? Or just this layer?`,
        answerSource: `violationSeverity=${d.violationSeverity} — if CRITICAL, yes, audit fails`,
      });
    }
  }

  // RULE 2: For each defense, compare finding count to threshold
  for (const defense of analysis.defenses) {
    const d = defense;
    const matchingThreat = analysis.threats.find((t: ThreatReport) =>
      t.pattern?.toLowerCase().includes(d.domain?.toLowerCase()) ||
      t.pattern?.toLowerCase().includes(d.rule?.toLowerCase().split('-')[0])
    );
    if (matchingThreat) {
      const findingCount = matchingThreat.findings?.length || 0;
      const failValue = d.thresholds?.failThreshold?.value;
      if (failValue !== undefined && findingCount > failValue) {
        questions.push({
          section: 'defenseRules',
          question: `Rule "${d.rule}" FAIL threshold is ${d.thresholds.failThreshold.operator} ${failValue}. ` +
            `Analysis found ${findingCount} instances. On the UNFIXED codebase, this check ` +
            `produces ${findingCount} FAIL findings. Is this the intended first-run experience?`,
          answerSource: `findingCount=${findingCount} vs failThreshold=${failValue}`,
        });
      }
    }
  }

  // RULE 3: For large construct counts, ask about performance
  if (analysis.constructs.length > 10000) {
    const estimated_ms = Math.round(analysis.constructs.length * 0.025);
    questions.push({
      section: 'algorithmSpecs',
      question: `AST analysis processes ${analysis.constructs.length} constructs. ` +
        `At ~0.025ms per construct, this takes ~${estimated_ms}ms. ` +
        `At 10x scale (${analysis.constructs.length * 10} constructs), ` +
        `estimated time: ~${estimated_ms * 10}ms. Is there a scaling cliff?`,
      answerSource: `constructs.length=${analysis.constructs.length}`,
    });
  }

  // RULE 4: For defenses in the same pipeline phase, ask about interaction
  for (const phase of analysis.pipeline?.phases || []) {
    const ph = phase;
    if (ph.defenses && ph.defenses.length > 1) {
      questions.push({
        section: 'defenseRules',
        question: `Rules ${ph.defenses.join(' and ')} both execute in the ${ph.domain} phase ` +
          `(${ph.executionModel}). If a construct triggers BOTH rules with different severities, ` +
          `which finding wins? Does the spec define priority?`,
        answerSource: `pipeline phase: ${ph.domain}, executionModel: ${ph.executionModel}`,
      });
    }
  }

  // RULE 5: For threats with defeat vectors mentioning false positives
  for (const threat of analysis.threats) {
    const t = threat;
    if (t.defeatVectors) {
      for (const dv of t.defeatVectors) {
        if (dv.toLowerCase().includes('false') || dv.toLowerCase().includes('legitimate')) {
          questions.push({
            section: 'blindSpots',
            question: `${t.pattern} detection might flag legitimate code. ` +
              `The defeat vector says: "${dv}". How does the spec handle false positives?`,
            answerSource: `defeatVector: ${dv}`,
          });
        }
      }
    }
  }

  // RULE 6: For each threshold value, ask "why this value?"
  for (const defense of analysis.defenses) {
    const d = defense;
    const passValue = d.thresholds?.passThreshold?.value;
    const failValue = d.thresholds?.failThreshold?.value;
    if (passValue !== undefined) {
      questions.push({
        section: 'algorithmSpecs',
        question: `Why is the "${d.rule}" pass threshold ${d.thresholds.passThreshold.operator} ${passValue}? ` +
          `What happens at ${passValue + 1}? At ${Math.max(0, passValue - 1)}?`,
        answerSource: `DefenseSpec.thresholds.passThreshold for ${d.rule}`,
      });
    }
  }

  return questions;
}

// ============================================================================
// §5.5 DESIGN TENSION DERIVATION
// ============================================================================

/**
 * Derive design tensions from defense rule interactions and analysis data.
 * Each tension identifies a cost of the chosen approach and provides a
 * concrete resolution.
 */
export function deriveDesignTensions(
  analysis: AnalysisResult,
): DesignTension[] {
  const tensions: DesignTension[] = [];

  for (const defense of analysis.defenses) {
    const d = defense;
    const method = d.checkMethod || '';

    // TENSION RULE 1: Call graph methods require full compilation
    if (method.includes('callgraph') || method.includes('reachability')) {
      tensions.push({
        rule: d.rule,
        cost: `Requires full TypeScript compilation. If tsconfig is broken or ` +
          `dependencies are missing, the call graph is incomplete and detection ` +
          `produces false negatives — uncalled functions appear as "reachable" ` +
          `because their callers were never resolved.`,
        resolution: `Fall back to export-name scanning (grep for import references ` +
          `across .ts files) when TypeScript compilation fails. Report ` +
          `'CALL_GRAPH_INCOMPLETE' as a blind spot. Partial results are better ` +
          `than no results, but the confidence score is reduced.`,
      });
    }

    // TENSION RULE 2: AST await detection produces false positives on fire-and-forget
    if (method.includes('await')) {
      tensions.push({
        rule: d.rule,
        cost: `Walks every function body looking for await expressions. Functions ` +
          `that intentionally don't await (fire-and-forget event handlers, ` +
          `void-returning async callbacks) will be flagged as false positives. ` +
          `This creates noise and erodes trust in the finding.`,
        resolution: `Suppress findings for functions whose names match event handler ` +
          `patterns: onEvent, onMessage, handler, listener, callback. ` +
          `Also suppress for functions decorated with @fireAndForget or ` +
          `annotated with // ASYNC_OK. Document the suppression list in the spec.`,
      });
    }

    // TENSION RULE 3: Fingerprint comparison is O(n^2)
    if (method.includes('fingerprint') || method.includes('jaccard')) {
      const n = analysis.constructs.length;
      const comparisons = n * (n - 1) / 2;
      const estimatedSeconds = (comparisons * 0.000001).toFixed(2);
      tensions.push({
        rule: d.rule,
        cost: `Pairwise comparison is O(n^2). With ${n} constructs, that's ` +
          `${comparisons.toLocaleString()} comparisons. At ~1us per comparison, ` +
          `this takes ~${estimatedSeconds} seconds. For large codebases (>50K constructs), ` +
          `this becomes a performance bottleneck that freezes the tool.`,
        resolution: `Bucket constructs by AST node count first (O(n)). Only compare ` +
          `within the same bucket — constructs with different node counts cannot ` +
          `have >70% similarity. This reduces from O(n^2) to O(n x avgBucketSize). ` +
          `For ${n} constructs with ~${Math.ceil(Math.sqrt(n))} buckets, ` +
          `avgBucketSize ~= ${Math.ceil(n / Math.ceil(Math.sqrt(n)))}, giving ` +
          `${(n * Math.ceil(n / Math.ceil(Math.sqrt(n))) * 0.000001).toFixed(2)}s.`,
      });
    }

    // TENSION RULE 4: Provenance verification may reject hand-written evidence
    if (method.includes('provenance') || method.includes('machine-generation')) {
      tensions.push({
        rule: d.rule,
        cost: `Evidence written by hand (developer writing JSON manually) will ` +
          `fail the machine-generation check even if the content is correct. ` +
          `This forces all evidence to go through the tool pipeline, which ` +
          `may not be possible for edge cases (custom integrations, migration ` +
          `from other systems).`,
        resolution: `Provide an override mechanism: evidence with a ` +
          `'manual_override: true' field and a 'reviewer' signature bypasses ` +
          `the provenance check but is flagged for manual review. The spec ` +
          `must document this escape hatch and its audit implications.`,
      });
    }

    // TENSION RULE 5: Threshold may be miscalibrated for project size
    const findingCount = analysis.threats.find((t: ThreatReport) =>
      t.pattern?.toLowerCase().includes(d.rule?.toLowerCase().split('-')[0] || '')
    );
    if (findingCount) {
      const fc = findingCount.findings?.length || 0;
      const failValue = d.thresholds?.failThreshold?.value;
      if (failValue !== undefined && fc > failValue * 100) {
        tensions.push({
          rule: d.rule,
          cost: `FAIL threshold is ${failValue} but analysis found ${fc} instances. ` +
            `The threshold is calibrated for a clean codebase, not for this project's ` +
            `current state. Running the check as-is produces ${fc} FAIL findings, ` +
            `which overwhelms the developer and makes the check useless as a gate.`,
          resolution: `Scale the threshold by project size: ` +
            `adjustedThreshold = baseThreshold x (totalFiles / 100). ` +
            `For this project (${fc} findings): adjustedThreshold = ${failValue} x (${fc}/100) ~= ${Math.ceil(failValue * fc / 100)}. ` +
            `Or use a percentage-based threshold instead of absolute count. ` +
            `Document the scaling formula in the spec.`,
        });
      }
    }
  }

  // TENSION RULE 6: Cross-domain conflicts
  for (let i = 0; i < analysis.defenses.length; i++) {
    for (let j = i + 1; j < analysis.defenses.length; j++) {
      const a = analysis.defenses[i];
      const b = analysis.defenses[j];
      // Check if both are in the same domain
      if (a.domain === b.domain && a.rule !== b.rule) {
        tensions.push({
          rule: `${a.rule} + ${b.rule}`,
          cost: `Both rules operate in the ${a.domain} domain. If a construct ` +
            `triggers BOTH rules, the developer sees two findings for the same ` +
            `location, which is confusing and noisy.`,
          resolution: `Deduplicate findings at the same file:line — keep only ` +
            `the higher-severity finding, mention the other in the evidence. ` +
            `Or merge the rules into one if their detection logic overlaps >50%.`,
        });
      }
    }
  }

  return tensions;
}

// ============================================================================
// §5.6 DENSITY MODE ASSIGNMENT
// ============================================================================

export const SECTION_DENSITY_MODES: Record<L2SectionType, {
  mode: DensityMode;
  purpose: string;
  validationRules: string[];
}> = {
  executiveSummary: {
    mode: 'PROSE',
    purpose: 'Teach the reader the problem and the solution shape. No code. No formulas.',
    validationRules: [
      'Zero fenced code blocks (grep for "```" -> REJECT if found)',
      'Zero formulas (grep for "O(" -> REJECT if found)',
      'Minimum 3 paragraphs',
    ],
  },

  architecture: {
    mode: 'PROSE',
    purpose: 'Show how the system is shaped. ASCII diagrams + prose. Code only for entry points.',
    validationRules: [
      'At least 1 ASCII diagram (grep for box-drawing or "+-" patterns)',
      'Code blocks allowed only for entry point signatures (max 5 lines each)',
    ],
  },

  dataModel: {
    mode: 'CODE',
    purpose: 'Define the vocabulary. Pure TypeScript interfaces, types, and constants.',
    validationRules: [
      'At least N interface/type definitions where N = discoveredTypeCount x 0.8',
      'Every interface has JSDoc comment (grep for "/**" before each "interface")',
      'Zero "any" type annotations (grep for ": any" -> REJECT)',
      'Zero "unknown" without type guard (grep for "unknown" not followed by "if" within 3 lines)',
    ],
  },

  engineClass: {
    mode: 'HYBRID',
    purpose: 'Show the orchestrator. Prose for design decisions, code for implementation.',
    validationRules: [
      'At least 1 class or module implementation (>= 30 lines of code)',
      'At least 3 paragraphs of prose explaining design decisions',
      'Code has error handling (grep for "catch" or "throw" or "return { result")',
    ],
  },

  defenseRules: {
    mode: 'HYBRID',
    purpose: 'Explain + implement each rule. Prose explains, code implements, pseudocode summarizes.',
    validationRules: [
      'Each rule has: Purpose (prose), Implementation (code >= 20 lines), Threshold reference',
      'Implementation has conditional logic (grep for "if " or "switch" or "return { result")',
      'At least 1 test reference per rule (grep for "test" or "expect" or "Input:")',
    ],
  },

  algorithmSpecs: {
    mode: 'MATH',
    purpose: 'Prove the math. Formal notation, formulas, worked examples with actual numbers.',
    validationRules: [
      'At least 1 formula per algorithm (grep for "=" with mathematical context)',
      'Every algorithm has complexity statement (grep for "O(" -> REJECT if missing)',
      'Every algorithm has worked example (grep for "Example" or "Input.*->" -> REJECT if missing)',
      'Worked example has actual numbers (regex \\d+ in example section)',
    ],
  },

  testSpecs: {
    mode: 'CODE',
    purpose: 'Prove correctness. Test functions with expect() assertions.',
    validationRules: [
      'Zero uses of toBeTruthy() or toBeDefined() without specific value',
      'At least defenseCount x 2 expect() calls with specific values',
      'At least 1 negative test per rule (grep for "fail" or "negative" or "invalid")',
      'At least 1 positive test per rule (grep for "pass" or "positive" or "valid")',
    ],
  },

  blindSpots: {
    mode: 'PROSE',
    purpose: 'Admit limits honestly. What the system CANNOT detect.',
    validationRules: [
      'Each blind spot has: what we cannot see + why + conservative fallback',
      'No code blocks (grep for "```" -> REJECT)',
    ],
  },

  integration: {
    mode: 'HYBRID',
    purpose: 'Show how the system connects to everything else.',
    validationRules: [
      'At least 1 data flow description',
      'At least 1 integration point with file:line reference',
    ],
  },

  evidenceFormat: {
    mode: 'CODE',
    purpose: 'Define the JSON output schema. Schema + sample.',
    validationRules: [
      'At least 1 JSON schema block (grep for "```json" -> REJECT if missing)',
      'At least 1 sample JSON output with realistic values',
    ],
  },

  fileManifest: {
    mode: 'CODE',
    purpose: 'Enumerate every file to create/modify with line estimates.',
    validationRules: [
      'Table format with columns: File, Type (NEW/MODIFY), Lines, Purpose',
      'At least defenseCount entries (one file per defense rule)',
    ],
  },

  migration: {
    mode: 'SEQUENTIAL',
    purpose: 'Plan the transition. Phase 1 -> 2 -> 3 with rollback.',
    validationRules: [
      'Contains "Phase 1" (grep -> REJECT if missing)',
      'Contains "Phase 2" (grep -> REJECT if missing)',
      'Contains "rollback" or "revert" (grep -> REJECT if missing)',
      'Each phase has: what changes, what could break, rollback step',
    ],
  },
};

// ============================================================================
// §5.8 DEPTH BUDGET COMPUTATION
// ============================================================================

/**
 * Compute per-section depth budgets from the complexity tier and defense
 * count. Higher tiers get more lines; defense-dependent sections scale
 * with defense count.
 */
export function computeDepthBudgets(
  complexity: { tier: string; totalTargetLines: number },
  defenseCount: number,
): Record<L2SectionType, { min: number; max: number }> {
  const tierMultiplier = complexity.tier === 'CRITICAL' ? 1.5 :
    complexity.tier === 'HIGH' ? 1.2 :
    complexity.tier === 'MEDIUM' ? 1.0 : 0.7;

  return {
    executiveSummary: { min: Math.round(30 * tierMultiplier), max: Math.round(60 * tierMultiplier) },
    architecture: { min: Math.round(50 * tierMultiplier), max: Math.round(120 * tierMultiplier) },
    dataModel: { min: Math.round(80 * tierMultiplier), max: Math.round(200 * tierMultiplier) },
    engineClass: { min: Math.round(100 * tierMultiplier), max: Math.round(250 * tierMultiplier) },
    defenseRules: { min: Math.round(defenseCount * 80 * tierMultiplier), max: Math.round(defenseCount * 150 * tierMultiplier) },
    algorithmSpecs: { min: Math.round(defenseCount * 60 * tierMultiplier), max: Math.round(defenseCount * 100 * tierMultiplier) },
    testSpecs: { min: Math.round(defenseCount * 40 * tierMultiplier), max: Math.round(defenseCount * 80 * tierMultiplier) },
    blindSpots: { min: Math.round(20 * tierMultiplier), max: Math.round(50 * tierMultiplier) },
    integration: { min: Math.round(40 * tierMultiplier), max: Math.round(80 * tierMultiplier) },
    evidenceFormat: { min: Math.round(30 * tierMultiplier), max: Math.round(60 * tierMultiplier) },
    fileManifest: { min: Math.round(20 * tierMultiplier), max: Math.round(40 * tierMultiplier) },
    migration: { min: Math.round(30 * tierMultiplier), max: Math.round(60 * tierMultiplier) },
  };
}

// ============================================================================
// FULL STRATEGY DERIVATION
// ============================================================================

/**
 * Derive the complete L2 writing strategy from analysis data.
 * Calls all sub-functions and assembles a single L2Strategy object.
 */
export function deriveFullStrategy(analysis: AnalysisResult, discovery: DiscoveryResult): L2Strategy {
  const complexity = computeComplexity(analysis, discovery);
  return {
    complexity,
    narrative: deriveNarrativeArc(analysis, complexity),
    questions: generateReaderQuestions(analysis, discovery),
    tensions: deriveDesignTensions(analysis),
    challenges: generateAdversarialChallenges(analysis, { tier: complexity.tier, constructs: analysis.constructs.length }),
    depthBudgets: computeDepthBudgets(complexity, analysis.defenses.length),
    densityModes: SECTION_DENSITY_MODES,
    references: {}, // populated by l2-reference-library
  };
}

/**
 * Fallback strategy when no analysis is available (e.g., empty project or
 * analysis failure). Produces a minimal LOW-tier strategy.
 */
export function getDefaultStrategy(): L2Strategy {
  return {
    complexity: { score: 0, tier: 'LOW', totalTargetLines: 1500, domainType: 'utility', domainMultiplier: 1 },
    narrative: { dominantThreat: 'UNKNOWN', arc: 'Write an engineering spec for the project.', sectionHooks: {} },
    questions: [],
    tensions: [],
    challenges: [],
    depthBudgets: computeDepthBudgets({ tier: 'LOW', totalTargetLines: 1500 }, 0),
    densityModes: SECTION_DENSITY_MODES,
    references: {},
  };
}
