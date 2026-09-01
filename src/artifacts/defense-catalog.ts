/**
 * Defense Catalog & Selection Engine — DP L2 Phase 3
 *
 * A static catalog of ~40 defense rules across 7 domains (general, evidence,
 * async, state, nlp, persistence, testing), plus a deterministic selection
 * algorithm that matches ThreatReport instances to the best-fit DefenseSpec.
 *
 * The catalog covers all Bible analysis orders (1-5) and all P1-P10
 * principles. Rules are organized by domain: general code quality, state
 * management, async/concurrency, NLP, persistence, and testing. When a threat
 * is found, the catalog selects defenses from the matching domain, falling
 * back to cross-domain keyword similarity, and finally to a blind-spot entry
 * if no defense exists.
 *
 * Phase 3 input : ThreatReport[]
 * Phase 3 output: DefenseSpec[] — one defense per threat, annotated by domain
 *
 * Determinism contract: every entry is static; `selectDefenses` uses no
 * Date.now(), no Math.random(), and yields stable ordering for a given input.
 *
 * @module artifacts/defense-catalog
 */

import type { ThreatReport } from './threat-modeler.ts';

// ============================================================================
// EXPORTED TYPES
// ============================================================================

/** Pass/Warn/Fail threshold triple for a defense rule. */
export interface ThresholdSet {
  /** Value above/below which the rule PASSES (operator defines direction). */
  passThreshold: { value: number; operator: string };
  /** Value in the warn band — partial pass, warrants review. */
  warnThreshold: { value: number; operator: string };
  /** Value beyond which the rule FAILS (operator defines direction). */
  failThreshold: { value: number; operator: string };
}

/** Domain enum — the 7 defense domains. */
export type DefenseDomain =
  | 'general'
  | 'evidence'
  | 'async'
  | 'state'
  | 'nlp'
  | 'persistence'
  | 'testing';

/** Severity levels for a rule violation. */
export type DefenseSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * A single defense rule in the catalog. Each rule declares which threat
 * pattern it defends against, the mechanical check method used to verify it,
 * its inputs/outputs (used by Phase 4 dependency ordering), threshold bands,
 * weight (confidence contribution), violation severity, Bible source, and the
 * analysis order (1-5) which controls when the check runs in the pipeline.
 */
export interface DefenseSpec {
  /** Human-readable rule identifier (e.g. "Existence Verification"). */
  rule: string;
  /** Domain this defense belongs to. */
  domain: DefenseDomain;
  /** Threat pattern string this rule defends against (keyword-matchable). */
  threatPattern: string;
  /** Mechanical check method identifier (e.g. "ast-existence-check"). */
  checkMethod: string;
  /** Names of input fields the check method consumes. */
  inputs: string[];
  /** Names of output fields the check method produces. */
  outputs: string[];
  /** Pass/Warn/Fail threshold triple. */
  thresholds: ThresholdSet;
  /** Confidence contribution weight (1-10). */
  weight: number;
  /** Severity if this rule is violated. */
  violationSeverity: DefenseSeverity;
  /** Analysis order — when in the pipeline the check runs (1-5). */
  analysisOrder: 1 | 2 | 3 | 4 | 5;
  /** Bible source file this rule is derived from. */
  bibleSource: string;
}

// ============================================================================
// CATALOG HELPERS
// ============================================================================

/** Pass threshold with "≥ value" semantics. */
function passMin(value: number): { value: number; operator: string } {
  return { value, operator: '>=' };
}
/** Warn threshold with "= value" band semantics. */
function warnEq(value: number): { value: number; operator: string } {
  return { value, operator: '=' };
}
/** Fail threshold with "< value" semantics. */
function failLt(value: number): { value: number; operator: string } {
  return { value, operator: '<' };
}
/** Fail threshold with "> value" semantics. */
function failGt(value: number): { value: number; operator: string } {
  return { value, operator: '>' };
}
/** Fail threshold with "= value" semantics (fail only when exactly equal). */
function failEq(value: number): { value: number; operator: string } {
  return { value, operator: '=' };
}
/** Pass threshold with "<= value" semantics. */
function passMax(value: number): { value: number; operator: string } {
  return { value, operator: '<=' };
}
/** Warn threshold with "between lo-hi" semantics. Stores range in operator field. */
function warnBetween(lo: number, hi: number): { value: number; operator: string } {
  return { value: lo, operator: 'between:' + lo + ':' + hi };
}

/**
 * Format a threshold entry as a human-readable comparison string.
 * Decodes 'between:lo:hi' operators into 'between lo and hi'.
 */
export function formatThreshold(t: { value: number; operator: string }): string {
  if (t.operator.startsWith('between:')) {
    const parts = t.operator.split(':');
    return `between ${parts[1]} and ${parts[2]}`;
  }
  return `${t.operator} ${t.value}`;
}

// ============================================================================
// DEFENSE CATALOG (~40 rules across 7 domains)
// ============================================================================

/**
 * The complete Bible Defense Catalog. Static, deterministic, covering all
 * P1-P10 principles and all Bible analysis orders (1-5). Rules are grouped by
 * domain in declaration order: general, evidence, async, state, nlp,
 * persistence, testing.
 *
 * Counts: general=9, evidence=7, async=5, state=3, nlp=4, persistence=4,
 * testing=4 → total 36 rule entries.
 */
export const DEFENSE_CATALOG: DefenseSpec[] = [
  // --------------------------------------------------------------------------
  // DOMAIN: GENERAL (9 rules) — Bible §1-§8, Algorithmic Systems/defense_in_depth.md
  // --------------------------------------------------------------------------
  {
    rule: 'Existence Verification',
    domain: 'general',
    threatPattern: 'missing-implementation',
    checkMethod: 'ast-existence-check',
    inputs: ['constructs'],
    outputs: ['existenceReport'],
    thresholds: {
      passThreshold: passMin(1),
      warnThreshold: warnEq(0),
      failThreshold: failLt(0),
    },
    weight: 10,
    violationSeverity: 'HIGH',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/defense_in_depth.md',
  },
  {
    rule: 'Call Graph Verification',
    domain: 'general',
    threatPattern: 'uncalled-function',
    checkMethod: 'callgraph-walk',
    inputs: ['callGraph'],
    outputs: ['uncalledReport'],
    thresholds: {
      passThreshold: passMin(1),
      warnThreshold: warnEq(0),
      failThreshold: failLt(0),
    },
    weight: 8,
    violationSeverity: 'MEDIUM',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/defense_in_depth.md',
  },
  {
    rule: 'API Surface Validation',
    domain: 'general',
    threatPattern: 'missing-exports',
    checkMethod: 'export-analysis',
    inputs: ['constructs', 'entryPoints'],
    outputs: ['apiSurfaceReport'],
    thresholds: {
      passThreshold: passMin(90),
      warnThreshold: warnBetween(70, 89),
      failThreshold: failLt(70),
    },
    weight: 9,
    violationSeverity: 'HIGH',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/defense_in_depth.md',
  },
  {
    rule: 'Signature Matching',
    domain: 'general',
    threatPattern: 'signature-mismatch',
    checkMethod: 'ast-signature-compare',
    inputs: ['constructs', 'requirements'],
    outputs: ['signatureMatchReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(80, 99),
      failThreshold: failLt(80),
    },
    weight: 7,
    violationSeverity: 'MEDIUM',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/defense_in_depth.md',
  },
  {
    rule: 'Export Completeness',
    domain: 'general',
    threatPattern: 'incomplete-exports',
    checkMethod: 'export-coverage',
    inputs: ['constructs'],
    outputs: ['exportCoverage'],
    thresholds: {
      passThreshold: passMin(95),
      warnThreshold: warnBetween(80, 94),
      failThreshold: failLt(80),
    },
    weight: 8,
    violationSeverity: 'HIGH',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/defense_in_depth.md',
  },
  {
    rule: 'Import Resolution',
    domain: 'general',
    threatPattern: 'unresolved-imports',
    checkMethod: 'import-resolution-check',
    inputs: ['sourceFiles'],
    outputs: ['importResolutionReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 9,
    violationSeverity: 'HIGH',
    analysisOrder: 3,
    bibleSource: 'Algorithmic Systems/defense_in_depth.md',
  },
  {
    rule: 'Type Annotation Presence',
    domain: 'general',
    threatPattern: 'missing-types',
    checkMethod: 'type-annotation-scan',
    inputs: ['constructs'],
    outputs: ['typeCoverageReport'],
    thresholds: {
      passThreshold: passMin(95),
      warnThreshold: warnBetween(80, 94),
      failThreshold: failLt(80),
    },
    weight: 6,
    violationSeverity: 'MEDIUM',
    analysisOrder: 3,
    bibleSource: 'Algorithmic Systems/defense_in_depth.md',
  },
  {
    rule: 'Dead Code Detection',
    domain: 'general',
    threatPattern: 'dead-code',
    checkMethod: 'callgraph-reachability',
    inputs: ['callGraph'],
    outputs: ['deadCodeReport'],
    thresholds: {
      passThreshold: passMax(0),
      warnThreshold: warnBetween(1, 5),
      failThreshold: failGt(5),
    },
    weight: 5,
    violationSeverity: 'LOW',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/defense_in_depth.md',
  },
  {
    rule: 'Duplicate Detection',
    domain: 'general',
    threatPattern: 'copy-paste-duplicate',
    checkMethod: 'ast-fingerprint-compare',
    inputs: ['constructs'],
    outputs: ['duplicateReport'],
    thresholds: {
      passThreshold: passMax(0),
      warnThreshold: warnBetween(1, 3),
      failThreshold: failGt(3),
    },
    weight: 5,
    violationSeverity: 'LOW',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/defense_in_depth.md',
  },

  // --------------------------------------------------------------------------
  // DOMAIN: EVIDENCE (7 rules) — Bible §5, Runtime_Grade_Standards/README.md
  // --------------------------------------------------------------------------
  {
    rule: 'Machine Generation Provenance',
    domain: 'evidence',
    threatPattern: 'theatrical-evidence',
    checkMethod: 'provenance-chain-verify',
    inputs: ['evidenceArtifacts'],
    outputs: ['provenanceReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 10,
    violationSeverity: 'CRITICAL',
    analysisOrder: 5,
    bibleSource: 'Runtime_Grade_Standards/README.md',
  },
  {
    rule: 'Timestamp Window',
    domain: 'evidence',
    threatPattern: 'stale-evidence',
    checkMethod: 'timestamp-window-check',
    inputs: ['evidenceArtifacts', 'buildTime'],
    outputs: ['freshnessReport'],
    thresholds: {
      passThreshold: { value: 5, operator: '<min' },
      warnThreshold: { value: 60, operator: 'between-min' },
      failThreshold: { value: 60, operator: '>min' },
    },
    weight: 8,
    violationSeverity: 'HIGH',
    analysisOrder: 5,
    bibleSource: 'Runtime_Grade_Standards/README.md',
  },
  {
    rule: 'Command Execution Verification',
    domain: 'evidence',
    threatPattern: 'fake-command-output',
    checkMethod: 'command-hash-verify',
    inputs: ['evidenceArtifacts'],
    outputs: ['commandVerification'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 9,
    violationSeverity: 'CRITICAL',
    analysisOrder: 5,
    bibleSource: 'Runtime_Grade_Standards/README.md',
  },
  {
    rule: 'Output Verification',
    domain: 'evidence',
    threatPattern: 'unverified-output',
    checkMethod: 'output-cross-reference',
    inputs: ['evidenceArtifacts', 'expectedOutput'],
    outputs: ['outputVerification'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 8,
    violationSeverity: 'HIGH',
    analysisOrder: 5,
    bibleSource: 'Runtime_Grade_Standards/README.md',
  },
  {
    rule: 'Evidence Chain Continuity',
    domain: 'evidence',
    threatPattern: 'broken-chain',
    checkMethod: 'chain-link-verify',
    inputs: ['evidenceArtifacts'],
    outputs: ['chainReport'],
    thresholds: {
      passThreshold: passMax(0),
      warnThreshold: warnBetween(1, 2),
      failThreshold: failGt(2),
    },
    weight: 9,
    violationSeverity: 'HIGH',
    analysisOrder: 5,
    bibleSource: 'Runtime_Grade_Standards/README.md',
  },
  {
    rule: 'Container Test Artifact',
    domain: 'evidence',
    threatPattern: 'no-container-test',
    checkMethod: 'container-test-presence',
    inputs: ['testResults'],
    outputs: ['containerTestReport'],
    thresholds: {
      passThreshold: passMin(1),
      warnThreshold: warnEq(0),
      failThreshold: failLt(0),
    },
    weight: 10,
    violationSeverity: 'CRITICAL',
    analysisOrder: 5,
    bibleSource: 'Runtime_Grade_Standards/README.md',
  },
  {
    rule: 'Triple Evidence Requirement',
    domain: 'evidence',
    threatPattern: 'single-source-evidence',
    checkMethod: 'evidence-source-count',
    inputs: ['evidenceArtifacts'],
    outputs: ['sourceCountReport'],
    thresholds: {
      passThreshold: passMin(3),
      warnThreshold: warnEq(2),
      failThreshold: failLt(2),
    },
    weight: 8,
    violationSeverity: 'HIGH',
    analysisOrder: 5,
    bibleSource: 'Runtime_Grade_Standards/README.md',
  },

  // --------------------------------------------------------------------------
  // DOMAIN: ASYNC (5 rules) — Bible §3, Algorithmic Systems/async_patterns.md
  // --------------------------------------------------------------------------
  {
    rule: 'Await Presence',
    domain: 'async',
    threatPattern: 'floating-promise',
    checkMethod: 'ast-await-detection',
    inputs: ['constructs'],
    outputs: ['awaitReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 9,
    violationSeverity: 'HIGH',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/async_patterns.md',
  },
  {
    rule: 'Promise Resolution',
    domain: 'async',
    threatPattern: 'unresolved-promise',
    checkMethod: 'promise-resolution-trace',
    inputs: ['constructs'],
    outputs: ['resolutionReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 8,
    violationSeverity: 'HIGH',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/async_patterns.md',
  },
  {
    rule: 'Error Propagation',
    domain: 'async',
    threatPattern: 'swallowed-error',
    checkMethod: 'catch-block-analysis',
    inputs: ['constructs'],
    outputs: ['errorPropagationReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 8,
    violationSeverity: 'HIGH',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/async_patterns.md',
  },
  {
    rule: 'Race Condition Detection',
    domain: 'async',
    threatPattern: 'race-condition',
    checkMethod: 'concurrent-access-scan',
    inputs: ['constructs'],
    outputs: ['raceReport'],
    thresholds: {
      passThreshold: passMax(0),
      warnThreshold: warnBetween(1, 2),
      failThreshold: failGt(2),
    },
    weight: 7,
    violationSeverity: 'MEDIUM',
    analysisOrder: 4,
    bibleSource: 'Algorithmic Systems/async_patterns.md',
  },
  {
    rule: 'Callback Hell Detection',
    domain: 'async',
    threatPattern: 'callback-hell',
    checkMethod: 'nesting-depth-analysis',
    inputs: ['constructs'],
    outputs: ['callbackDepthReport'],
    thresholds: {
      passThreshold: passMax(3),
      warnThreshold: warnBetween(4, 5),
      failThreshold: failGt(5),
    },
    weight: 4,
    violationSeverity: 'LOW',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/async_patterns.md',
  },

  // --------------------------------------------------------------------------
  // DOMAIN: STATE (3 rules) — Bible §P5, Algorithmic Systems/state_management.md
  // --------------------------------------------------------------------------
  {
    rule: 'State Transition Validation',
    domain: 'state',
    threatPattern: 'invalid-transition',
    checkMethod: 'transition-matrix-verify',
    inputs: ['stateMachine'],
    outputs: ['transitionReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 9,
    violationSeverity: 'HIGH',
    analysisOrder: 4,
    bibleSource: 'Algorithmic Systems/state_management.md',
  },
  {
    rule: 'Initial State Definition',
    domain: 'state',
    threatPattern: 'missing-initial-state',
    checkMethod: 'initial-state-presence',
    inputs: ['stateMachine'],
    outputs: ['initialStateReport'],
    thresholds: {
      passThreshold: passMin(1),
      warnThreshold: warnEq(0),
      failThreshold: failLt(0),
    },
    weight: 8,
    violationSeverity: 'HIGH',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/state_management.md',
  },
  {
    rule: 'Terminal State Reachability',
    domain: 'state',
    threatPattern: 'unreachable-terminal',
    checkMethod: 'terminal-reachability-analysis',
    inputs: ['stateMachine'],
    outputs: ['reachabilityReport'],
    thresholds: {
      passThreshold: passMin(1),
      warnThreshold: warnEq(0),
      failThreshold: failEq(0),
    },
    weight: 7,
    violationSeverity: 'MEDIUM',
    analysisOrder: 4,
    bibleSource: 'Algorithmic Systems/state_management.md',
  },

  // --------------------------------------------------------------------------
  // DOMAIN: NLP (4 rules) — Bible §5, Algorithmic Systems/nlp_patterns.md
  // --------------------------------------------------------------------------
  {
    rule: 'Token Budget Tracking',
    domain: 'nlp',
    threatPattern: 'token-overflow',
    checkMethod: 'token-count-verify',
    inputs: ['content'],
    outputs: ['tokenReport'],
    thresholds: {
      passThreshold: { value: 100, operator: '<budget%' },
      warnThreshold: warnBetween(80, 100),
      failThreshold: { value: 100, operator: '>budget%' },
    },
    weight: 6,
    violationSeverity: 'MEDIUM',
    analysisOrder: 1,
    bibleSource: 'Algorithmic Systems/nlp_patterns.md',
  },
  {
    rule: 'Semantic Coherence',
    domain: 'nlp',
    threatPattern: 'incoherent-output',
    checkMethod: 'semantic-similarity-check',
    inputs: ['content', 'referenceContent'],
    outputs: ['coherenceReport'],
    thresholds: {
      passThreshold: { value: 70, operator: '>0.7x100' },
      warnThreshold: warnBetween(50, 70),
      failThreshold: { value: 50, operator: '<0.5x100' },
    },
    weight: 5,
    violationSeverity: 'MEDIUM',
    analysisOrder: 5,
    bibleSource: 'Algorithmic Systems/nlp_patterns.md',
  },
  {
    rule: 'Entity Consistency',
    domain: 'nlp',
    threatPattern: 'entity-mismatch',
    checkMethod: 'entity-extraction-compare',
    inputs: ['content'],
    outputs: ['entityReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 5,
    violationSeverity: 'LOW',
    analysisOrder: 5,
    bibleSource: 'Algorithmic Systems/nlp_patterns.md',
  },
  {
    rule: 'Language Detection',
    domain: 'nlp',
    threatPattern: 'wrong-language',
    checkMethod: 'language-identification',
    inputs: ['content'],
    outputs: ['languageReport'],
    thresholds: {
      passThreshold: passMin(1),
      warnThreshold: warnEq(0),
      failThreshold: failLt(0),
    },
    weight: 4,
    violationSeverity: 'LOW',
    analysisOrder: 1,
    bibleSource: 'Algorithmic Systems/nlp_patterns.md',
  },

  // --------------------------------------------------------------------------
  // DOMAIN: PERSISTENCE (4 rules) — Bible §P5, Algorithmic Systems/persistence_patterns.md
  // --------------------------------------------------------------------------
  {
    rule: 'Write Verification',
    domain: 'persistence',
    threatPattern: 'silent-write-failure',
    checkMethod: 'write-confirmation-check',
    inputs: ['writeOperations'],
    outputs: ['writeReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 9,
    violationSeverity: 'HIGH',
    analysisOrder: 5,
    bibleSource: 'Algorithmic Systems/persistence_patterns.md',
  },
  {
    rule: 'Rollback Capability',
    domain: 'persistence',
    threatPattern: 'no-rollback',
    checkMethod: 'rollback-presence-check',
    inputs: ['writeOperations'],
    outputs: ['rollbackReport'],
    thresholds: {
      passThreshold: passMin(1),
      warnThreshold: warnEq(0),
      failThreshold: failLt(0),
    },
    weight: 8,
    violationSeverity: 'HIGH',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/persistence_patterns.md',
  },
  {
    rule: 'Atomic Operations',
    domain: 'persistence',
    threatPattern: 'non-atomic-write',
    checkMethod: 'atomicity-analysis',
    inputs: ['writeOperations'],
    outputs: ['atomicityReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 7,
    violationSeverity: 'MEDIUM',
    analysisOrder: 4,
    bibleSource: 'Algorithmic Systems/persistence_patterns.md',
  },
  {
    rule: 'Idempotency',
    domain: 'persistence',
    threatPattern: 'non-idempotent',
    checkMethod: 'idempotency-verification',
    inputs: ['operations'],
    outputs: ['idempotencyReport'],
    thresholds: {
      passThreshold: passMin(1),
      warnThreshold: warnEq(0),
      failThreshold: failLt(0),
    },
    weight: 6,
    violationSeverity: 'MEDIUM',
    analysisOrder: 5,
    bibleSource: 'Algorithmic Systems/persistence_patterns.md',
  },

  // --------------------------------------------------------------------------
  // DOMAIN: TESTING (4 rules) — Bible §5, Algorithmic Systems/testing_patterns.md
  // --------------------------------------------------------------------------
  {
    rule: 'Test Coverage',
    domain: 'testing',
    threatPattern: 'low-coverage',
    checkMethod: 'coverage-threshold-check',
    inputs: ['testResults'],
    outputs: ['coverageReport'],
    thresholds: {
      passThreshold: passMin(90),
      warnThreshold: warnBetween(70, 89),
      failThreshold: failLt(70),
    },
    weight: 8,
    violationSeverity: 'HIGH',
    analysisOrder: 5,
    bibleSource: 'Algorithmic Systems/testing_patterns.md',
  },
  {
    rule: 'Negative Test Presence',
    domain: 'testing',
    threatPattern: 'no-negative-tests',
    checkMethod: 'negative-test-scan',
    inputs: ['testResults'],
    outputs: ['negativeTestReport'],
    thresholds: {
      passThreshold: passMin(1),
      warnThreshold: warnEq(0),
      failThreshold: failLt(0),
    },
    weight: 7,
    violationSeverity: 'MEDIUM',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/testing_patterns.md',
  },
  {
    rule: 'Positive Test Presence',
    domain: 'testing',
    threatPattern: 'no-positive-tests',
    checkMethod: 'positive-test-scan',
    inputs: ['testResults'],
    outputs: ['positiveTestReport'],
    thresholds: {
      passThreshold: passMin(1),
      warnThreshold: warnEq(0),
      failThreshold: failLt(0),
    },
    weight: 6,
    violationSeverity: 'MEDIUM',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/testing_patterns.md',
  },
  {
    rule: 'Test Authenticity',
    domain: 'testing',
    threatPattern: 'theatrical-test',
    checkMethod: 'test-body-analysis',
    inputs: ['testResults'],
    outputs: ['authenticityReport'],
    thresholds: {
      passThreshold: passMin(100),
      warnThreshold: warnBetween(90, 99),
      failThreshold: failLt(90),
    },
    weight: 9,
    violationSeverity: 'CRITICAL',
    analysisOrder: 2,
    bibleSource: 'Algorithmic Systems/testing_patterns.md',
  },
];

// ============================================================================
// SELECTION ALGORITHM
// ============================================================================

/** Tokens extracted from a threat pattern / catalog threatPattern string. */
function extractKeywords(text: string): string[] {
  // Split on non-alphanumeric (keeps kebab-case segments as tokens), lowercase.
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/** Count shared keywords between two token lists (case-insensitive, ≥3 chars). */
function keywordOverlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  let count = 0;
  for (const t of a) if (setB.has(t)) count++;
  return count;
}

/** Default threshold triple used for blind-spot entries. */
const BLIND_SPOT_THRESHOLDS: ThresholdSet = {
  passThreshold: passMin(1),
  warnThreshold: warnEq(0),
  failThreshold: failLt(0),
};

/**
 * Build a blind-spot DefenseSpec for a threat with no catalog match. Marked
 * with checkMethod 'unknown', bibleSource 'N/A - blind spot', and weight 1 so
 * it never dominates the confidence score in downstream phases.
 */
function buildBlindSpot(threat: ThreatReport): DefenseSpec {
  return {
    rule: 'No catalog defense for: ' + threat.pattern,
    domain: 'general',
    threatPattern: threat.pattern,
    checkMethod: 'unknown',
    inputs: [],
    outputs: [],
    thresholds: BLIND_SPOT_THRESHOLDS,
    weight: 1,
    violationSeverity: threat.severity,
    analysisOrder: 1,
    bibleSource: 'N/A - blind spot',
  };
}

// ============================================================================
// THREAT PATTERN DIRECT MAP
// ============================================================================
// The threat modeler produces deterministic pattern names (e.g. THEATRICAL_IMPLEMENTATION)
// that don't substring-match to catalog threatPattern strings (e.g. 'theatrical-evidence').
// This direct map ensures correct domain assignment — without it, keyword overlap
// gives equal weight to 'theatrical' matching 'theatrical-evidence' and 'implementation'
// matching 'missing-implementation', causing the wrong domain to be selected.
export const THREAT_PATTERN_DIRECT_MAP: Record<string, string> = {
  'theatrical_implementation': 'theatrical-evidence',
  'missing_implementation': 'missing-implementation',
  'dead_code': 'dead-code',
  'mismatch_branding_illusion': 'signature-mismatch',
  'duplicate_implementation': 'copy-paste-duplicate',
  'spec_gap': 'missing-exports',
};

/**
 * Select defenses for a set of threat reports.
 *
 * Algorithm (deterministic — no Date/Math.random):
 *   0. Direct pattern map — deterministic highest-priority match for known
 *      threat modeler patterns to catalog threatPattern strings.
 *   1. For each threat, find matching catalog entries:
 *      a. Direct substring match (threat.pattern contains catalog.threatPattern
 *         or vice versa).
 *      b. Keyword intersection (threat pattern ↔ catalog threatPattern).
 *      c. If no match in the threat's implied domain (general default), search
 *         ALL domains by keyword similarity and pick the entry with the
 *         highest overlap.
 *   2. If still no match → emit a blind-spot entry for that threat.
 *   3. Deduplicate by rule name so multiple threats matching the same defense
 *      produce a single DefenseSpec.
 *   4. Return the unique DefenseSpec[], stable-ordered by catalog index.
 *
 * @param threats - Threat reports produced by the Phase 2 Threat Modeling Engine.
 * @returns Unique DefenseSpec[] — one entry per matched defense rule, plus
 *   optional blind-spot entries for unmatched threats.
 */
export function selectDefenses(threats: ThreatReport[]): DefenseSpec[] {
  // Pre-compute catalog keyword tokens once for stable, cheap matching.
  const catalogTokens = DEFENSE_CATALOG.map((entry) => ({
    entry,
    tokens: extractKeywords(entry.threatPattern),
  }));

  // Index catalog entries by threatPattern for O(1) direct map lookup.
  const catalogByPattern = new Map<string, DefenseSpec>();
  for (const entry of DEFENSE_CATALOG) {
    catalogByPattern.set(entry.threatPattern, entry);
  }

  const matchedRules = new Set<string>();
  const selected: DefenseSpec[] = [];
  const seenBlindSpots = new Set<string>();

  for (const threat of threats) {
    const threatKey = threat.pattern.toLowerCase();
    let bestEntry: DefenseSpec | null = null;
    let bestScore = 0;

    // Step 0: Direct pattern map — deterministic highest-priority match.
    const mappedPattern = THREAT_PATTERN_DIRECT_MAP[threatKey];
    if (mappedPattern) {
      const directEntry = catalogByPattern.get(mappedPattern);
      if (directEntry) {
        bestEntry = directEntry;
        bestScore = 1000; // guarantee this wins over keyword matches
      }
    }

    // Step 1a + 1b: scan catalog entries in declaration order for the best
    // match by substring containment then keyword overlap.
    if (!bestEntry) {
      const threatTokens = extractKeywords(threat.pattern);
      for (const { entry, tokens } of catalogTokens) {
        const tp = threat.pattern.toLowerCase();
        const cp = entry.threatPattern.toLowerCase();
        let score = 0;

        // Substring match — strongest signal.
        if (tp.includes(cp) || cp.includes(tp)) {
          score += 100;
        }
        // Keyword overlap — secondary signal.
        const overlap = keywordOverlap(threatTokens, tokens);
        score += overlap;

        if (score > bestScore) {
          bestScore = score;
          bestEntry = entry;
        }
      }
    }

    // Step 1c: if no positive match, the above loop leaves bestEntry null
    // (score 0). Cross-domain keyword similarity is already covered because we
    // scan ALL catalog entries regardless of domain above.

    // Step 2: no match → blind-spot entry.
    if (bestEntry === null) {
      const blind = buildBlindSpot(threat);
      if (!seenBlindSpots.has(blind.rule)) {
        seenBlindSpots.add(blind.rule);
        selected.push(blind);
      }
      continue;
    }

    // Step 3: deduplicate by rule name.
    if (!matchedRules.has(bestEntry.rule)) {
      matchedRules.add(bestEntry.rule);
      selected.push(bestEntry);
    }
  }

  // Step 4: stable ordering by catalog index (blind-spots sort last, they have
  // no catalog index — index = Number.MAX_SAFE_INTEGER).
  const indexByRule = new Map<string, number>();
  DEFENSE_CATALOG.forEach((entry, idx) => indexByRule.set(entry.rule, idx));

  // --------------------------------------------------------------------------
  // Secondary pass: activate domains based on finding descriptions
  // --------------------------------------------------------------------------
  const extraDomains = new Set<string>();
  for (const threat of threats) {
    for (const finding of threat.findings) {
      const desc = finding.description.toLowerCase();
      if (desc.includes('async') || desc.includes('promise') || desc.includes('await')) {
        extraDomains.add('async');
      }
      if (desc.includes('write') || desc.includes('file') || desc.includes('persist')) {
        extraDomains.add('persistence');
      }
      if (desc.includes('state') || desc.includes('transition')) {
        extraDomains.add('state');
      }
      if (desc.includes('nlp') || desc.includes('token') || desc.includes('language')) {
        extraDomains.add('nlp');
      }
      if (desc.includes('test') || desc.includes('coverage')) {
        extraDomains.add('testing');
      }
    }
  }
  // Add catalog defenses from extra domains
  for (const domain of extraDomains) {
    const domainDefenses = DEFENSE_CATALOG.filter(d => d.domain === domain);
    // Add highest-weight defense from each extra domain
    const best = domainDefenses.sort((a, b) => b.weight - a.weight)[0];
    if (best && !selected.some(s => s.rule === best.rule)) {
      selected.push(best);
    }
  }

  selected.sort((a, b) => {
    const ia = indexByRule.get(a.rule) ?? Number.MAX_SAFE_INTEGER;
    const ib = indexByRule.get(b.rule) ?? Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });

  return selected;
}