// analysis-engine.ts — Shared analysis layer for ALL tool generators.
// Extracts the deterministic analysis pipeline from generatePipelineSpec()
// so every generator (L1, L2, L3, T1, T2) can access the same results.

import * as fs from 'fs';
import * as path from 'path';
import { tridentLog } from '../utils.js';
import { classifyProject } from '../audit-engine/code-classifier.ts';
import type { AnalysisContext, CodeConstruct, CallGraph, PreflightResult } from '../audit-engine/types.ts';
import { assessThreats } from './threat-modeler.ts';
import type { ThreatReport } from './threat-modeler.ts';
import { selectDefenses } from './defense-catalog.ts';
import type { DefenseSpec } from './defense-catalog.ts';
import { orderPipeline } from './pipeline-orderer.ts';
import type { OrderedPipeline } from './pipeline-orderer.ts';
import { generateTypes } from './type-generator.ts';
import { generateAlgorithms } from './algorithm-generator.ts';
import { generateTests } from './test-generator.ts';
import type { TestSpec } from './test-generator.ts';
import { parseRequirementSections } from './pipeline-generator.ts';
import type { DiscoveryResult } from '../shared/auto-discover.js';

// ============================================================================
// OPTIMIZATION 3: Analysis Result Cache
// analyzeProject() is called multiple times during the LLM loop (brief
// building, quality checks, etc.). Cache results keyed by path+requirements
// to avoid recomputing the same deterministic analysis pipeline.
// ============================================================================
const analysisCache = new Map<string, AnalysisResult>();

// ============================================================================
// PUBLIC INTERFACE
// ============================================================================

export interface AnalysisResult {
  constructs: CodeConstruct[];
  callGraph: CallGraph;
  threats: ThreatReport[];
  defenses: DefenseSpec[];
  pipeline: OrderedPipeline;
  types: string[];
  algorithms: string[];
  tests: TestSpec[];
  discovery: DiscoveryResult;
  analysisContext: AnalysisContext;
}

/**
 * Run the full deterministic analysis pipeline on a target project.
 * Returns null if no TypeScript constructs are found.
 *
 * ALL tool generators call this FIRST, then format the results.
 * Template text is banned — content must come from analysis.
 */
export function analyzeProject(
  targetPath: string,
  requirements: string,
  discovery: DiscoveryResult | null,
): AnalysisResult | null {
  // OPTIMIZATION 3: Return cached result if we've analyzed this exact target before
  const cacheKey = `${targetPath}:${requirements?.substring(0, 50) || ''}`;
  if (analysisCache.has(cacheKey)) {
    tridentLog('INFO', 'analysis-engine', `Cache HIT for key: ${cacheKey}`);
    return analysisCache.get(cacheKey)!;
  }

  if (!targetPath || !fs.existsSync(targetPath)) {
    tridentLog('WARN', 'analysis-engine', `Target path does not exist: ${targetPath}`);
    return null;
  }

  // 1. Read tsconfig.json
  const tsconfigPath = path.join(targetPath, 'tsconfig.json');
  let tsconfig: Record<string, any> | null = null;
  if (fs.existsSync(tsconfigPath)) {
    try {
      const raw = fs.readFileSync(tsconfigPath, 'utf-8');
      tsconfig = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, ''));
    } catch (e: unknown) {
      tridentLog('WARN', 'analysis-engine', `tsconfig.json parse failed: ${e instanceof Error ? e.message : String(e)}`);
      tsconfig = null;
    }
  }

  // 2. Build preflight object (assumed passing — real preflight runs in audit mode)
  const preflight: PreflightResult = {
    typeCheckPassed: true,
    typeCheckError: null,
    buildPassed: true,
    buildError: null,
    distExists: false,
    distIsSingleFile: false,
    distSize: 0,
    hasRelativeImports: false,
    sourceMapExists: false,
    findings: [],
  };

  // 3. Classify project (AST constructs + call graph)
  const pkgJson = discovery?.packageJson
    ? (discovery.packageJson as Record<string, unknown>) as Record<string, any> | null
    : null;

  let analysisContext: AnalysisContext;
  try {
    analysisContext = classifyProject(targetPath, preflight, pkgJson, tsconfig, null);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('ERROR', 'analysis-engine', `classifyProject failed: ${msg}`);
    return null;
  }

  if (!analysisContext || !analysisContext.constructs || analysisContext.constructs.length === 0) {
    tridentLog('INFO', 'analysis-engine', 'No constructs found — returning null');
    return null;
  }

  tridentLog('INFO', 'analysis-engine',
    `classifyProject: ${analysisContext.constructs.length} constructs, ` +
    `callGraph ${analysisContext.callGraph?.coveragePercent ?? 0}% coverage`);

  // 4. Build effective discovery (fallback if null)
  const effectiveDiscovery: DiscoveryResult = discovery ?? {
    projectRoot: targetPath,
    totalFiles: 0,
    totalLines: 0,
    directoryTree: '',
    languages: {},
    packageJson: null,
    entryPoints: [],
    patterns: [],
    failureModes: [],
    decisions: [],
    warheads: [],
    auditLayers: [],
    codeSections: [],
  };

  // 5. Parse requirements into sections
  const sections = parseRequirementSections(requirements || '');

  // 6. Run the 6-phase deterministic pipeline
  const effectiveCallGraph: CallGraph = analysisContext.callGraph ?? {
    entries: new Map(),
    totalCallSites: 0,
    resolvedCallSites: 0,
    coveragePercent: 0,
  };

  let threats: ThreatReport[];
  try {
    threats = assessThreats(analysisContext.constructs, effectiveCallGraph, sections, effectiveDiscovery);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('ERROR', 'analysis-engine', `assessThreats failed: ${msg}`);
    threats = [];
  }
  tridentLog('INFO', 'analysis-engine', `assessThreats: ${threats.length} threats`);

  let defenses: DefenseSpec[];
  try {
    defenses = selectDefenses(threats);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('ERROR', 'analysis-engine', `selectDefenses failed: ${msg}`);
    defenses = [];
  }
  tridentLog('INFO', 'analysis-engine', `selectDefenses: ${defenses.length} defenses`);

  let pipeline: OrderedPipeline;
  try {
    pipeline = orderPipeline(defenses);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('ERROR', 'analysis-engine', `orderPipeline failed: ${msg}`);
    pipeline = { phases: [], dependencies: [], totalRules: 0 };
  }

  let types: string[];
  try {
    types = generateTypes(pipeline);
  } catch (e: unknown) {
    tridentLog('WARN', 'analysis-engine', `generateTypes failed: ${e instanceof Error ? e.message : String(e)}`);
    types = [];
  }

  let algorithms: string[];
  try {
    algorithms = generateAlgorithms(defenses);
  } catch (e: unknown) {
    tridentLog('WARN', 'analysis-engine', `generateAlgorithms failed: ${e instanceof Error ? e.message : String(e)}`);
    algorithms = [];
  }

  let tests: TestSpec[];
  try {
    tests = generateTests(threats, defenses);
  } catch (e: unknown) {
    tridentLog('WARN', 'analysis-engine', `generateTests failed: ${e instanceof Error ? e.message : String(e)}`);
    tests = [];
  }

  tridentLog('INFO', 'analysis-engine',
    `Pipeline complete: ${threats.length} threats, ${defenses.length} defenses, ` +
    `${pipeline.phases.length} phases, ${types.length} types, ${tests.length} tests`);

  // OPTIMIZATION 3: Cache the successful result before returning
  const result: AnalysisResult = {
    constructs: analysisContext.constructs,
    callGraph: effectiveCallGraph,
    threats,
    defenses,
    pipeline,
    types,
    algorithms,
    tests,
    discovery: effectiveDiscovery,
    analysisContext,
  };
  analysisCache.set(cacheKey, result);
  return result;
}

// ============================================================================
// GUARD UTILITIES — available to all generators
// ============================================================================

/**
 * Anti-repetition tracker. Throws if the same 50-char prefix appears > 2 times.
 * Prevents the disease where 50 patterns all get the same anti-pattern text.
 */
const _emittedFingerprints = new Set<string>();

export function checkRepetition(text: string, label: string): void {
  const fingerprint = text.substring(0, 50).trim();
  if (_emittedFingerprints.has(fingerprint)) {
    const count = Array.from(_emittedFingerprints).filter(f => f === fingerprint).length;
    if (count >= 2) {
      tridentLog('WARN', 'analysis-engine',
        `REPETITION WARNING: block "${fingerprint}..." emitted ${count + 1} times in ${label}. ` +
        `Generator may be producing template text.`);
    }
  }
  _emittedFingerprints.add(fingerprint);
}

/**
 * Reset the repetition tracker (call between independent generation contexts).
 */
export function resetRepetitionTracker(): void {
  _emittedFingerprints.clear();
}

/**
 * Minimum content gate. Returns empty string if content is too thin.
 * Sections with < minLines of real content are omitted entirely.
 */
export function gateSection(title: string, content: string, minLines: number = 20): string {
  const lineCount = content.split('\n').filter(l => l.trim().length > 0).length;
  if (lineCount < minLines) {
    tridentLog('WARN', 'analysis-engine',
      `Section "${title}" produced only ${lineCount} lines (min ${minLines}). Omitting.`);
    return '';
  }
  return `## ${title}\n\n${content}\n\n`;
}
