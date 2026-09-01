/**
 * Type Generation Engine — DP L2 Phase 5
 *
 * Consumes an OrderedPipeline (Phase 4 output) and generates TypeScript
 * interface definitions for every phase's input and output fields.  Each field
 * is looked up in the static TYPE_MAP; unknown fields fall back to `unknown`.
 *
 * Additionally generates a top-level `BuildPlanPipeline` interface that
 * aggregates all phase outputs and the dependency list.
 *
 * Determinism contract: no Date.now(), no Math.random(), stable ordering for a
 * given input.
 *
 * Phase 5 input : OrderedPipeline
 * Phase 5 output: string[] (TypeScript interface blocks)
 *
 * @module artifacts/type-generator
 */

import type { OrderedPipeline, PipelinePhase } from './pipeline-orderer.ts';
import type { DefenseSpec } from './defense-catalog.ts';

// ============================================================================
// TYPE MAP — I/O field name → TypeScript type
// ============================================================================

/**
 * Static mapping of I/O field names to TypeScript type expressions.  Covers all
 * domains in the defense catalog: core, evidence, general, async, state, nlp,
 * persistence, and testing.
 */
export const TYPE_MAP: Record<string, string> = {
  // --- Core types ---
  'constructs': 'CodeConstruct[]',
  'callGraph': 'CallGraph',
  'requirements': 'RequirementSection[]',
  'entryPoints': 'string[]',
  'sourceFiles': 'string[]',

  // --- Evidence domain ---
  'evidenceArtifacts': 'EvidenceArtifact[]',
  'buildTime': 'number',
  'testResults': 'TestResult[]',
  'expectedOutput': 'string',

  // --- General domain ---
  'existenceReport': 'ExistenceReport',
  'uncalledReport': 'UncalledReport',
  'apiSurfaceReport': 'ApiSurfaceReport',
  'signatureMatchReport': 'SignatureMatchReport',
  'exportCoverage': 'ExportCoverage',
  'importResolutionReport': 'ImportResolutionReport',
  'typeCoverageReport': 'TypeCoverageReport',
  'deadCodeReport': 'DeadCodeReport',
  'duplicateReport': 'DuplicateReport',

  // --- Evidence domain outputs ---
  'provenanceReport': 'ProvenanceReport',
  'freshnessReport': 'FreshnessReport',
  'commandVerification': 'CommandVerification',
  'outputVerification': 'OutputVerification',
  'chainReport': 'ChainReport',
  'containerTestReport': 'ContainerTestReport',
  'sourceCountReport': 'SourceCountReport',

  // --- Async domain ---
  'awaitReport': 'AwaitReport',
  'resolutionReport': 'ResolutionReport',
  'errorPropagationReport': 'ErrorPropagationReport',
  'raceReport': 'RaceReport',
  'callbackDepthReport': 'CallbackDepthReport',

  // --- State domain ---
  'stateMachine': 'StateMachine',
  'transitionReport': 'TransitionReport',
  'initialStateReport': 'InitialStateReport',
  'reachabilityReport': 'ReachabilityReport',

  // --- NLP domain ---
  'content': 'string',
  'referenceContent': 'string',
  'tokenReport': 'TokenReport',
  'coherenceReport': 'CoherenceReport',
  'entityReport': 'EntityReport',
  'languageReport': 'LanguageReport',

  // --- Persistence domain ---
  'writeOperations': 'WriteOperation[]',
  'writeReport': 'WriteReport',
  'rollbackReport': 'RollbackReport',
  'atomicityReport': 'AtomicityReport',
  'idempotencyReport': 'IdempotencyReport',

  // --- Testing domain ---
  'coverageReport': 'CoverageReport',
  'negativeTestReport': 'NegativeTestReport',
  'positiveTestReport': 'PositiveTestReport',
  'authenticityReport': 'AuthenticityReport',

  // --- Default fallback ---
  'unknown': 'unknown',
};

// --- Internal helpers ---

/** Capitalize the first letter of a string. */
function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Resolve a field name to its TypeScript type via TYPE_MAP (fallback: unknown). */
function resolveType(field: string): string {
  return TYPE_MAP[field] ?? 'unknown';
}

/** Format field names into interface body lines (field: type;). */
function formatFields(fields: string[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const f of fields) {
    if (seen.has(f)) continue;
    seen.add(f);
    lines.push(`  ${f}: ${resolveType(f)};`);
  }
  return lines;
}

/** Generate a single TypeScript interface block from a phase. */
function generatePhaseInterface(
  phase: PipelinePhase,
  kind: 'input' | 'output',
): string {
  const pascalDomain = capitalize(phase.domain);
  const ifaceName = `Phase${pascalDomain}_${kind === 'input' ? 'Input' : 'Output'}`;
  const fields = kind === 'input' ? phase.inputs : phase.outputs;
  const comment = kind === 'input'
    ? `/** Input types for Phase: ${phase.domain} */`
    : `/** Output types for Phase: ${phase.domain} */`;

  const bodyLines = formatFields(fields);
  const body = bodyLines.length > 0
    ? bodyLines.join('\n')
    : '  // (no fields)';

  return `${comment}\ninterface ${ifaceName} {\n${body}\n}`;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate TypeScript interface definitions from an ordered pipeline.
 *
 * For each phase produces `Phase{Domain}_Input` and `Phase{Domain}_Output`
 * interfaces, plus a top-level `BuildPlanPipeline` interface aggregating all
 * phase outputs and the dependency list.
 *
 * @param pipeline - The ordered pipeline from Phase 4.
 * @returns Array of TypeScript interface definition strings.
 */
export function generateTypes(pipeline: OrderedPipeline): string[] {
  const interfaces: string[] = [];

  // Phase-level Input / Output interfaces
  for (const phase of pipeline.phases) {
    interfaces.push(generatePhaseInterface(phase, 'input'));
    interfaces.push(generatePhaseInterface(phase, 'output'));
  }

  // Top-level BuildPlanPipeline interface
  const phaseOutputRefs = pipeline.phases.map((p) => {
    const pascal = capitalize(p.domain);
    return `  phase${pascal}Output: Phase${pascal}_Output;`;
  });

  interfaces.push([
    '/** Top-level pipeline container — aggregates all phase outputs. */',
    'interface BuildPlanPipeline {',
    ...phaseOutputRefs,
    '  dependencies: PipelineDependency[];',
    '}',
  ].join('\n'));

  return interfaces;
}

// Re-export for convenience
export type { DefenseSpec } from './defense-catalog.ts';
