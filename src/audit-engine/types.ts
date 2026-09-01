import * as ts from 'typescript';
import type { EvidenceTriad } from './triad.ts';

export enum ConstructType {
  FUNCTION_DECLARATION = 'FUNCTION_DECLARATION',
  ARROW_FUNCTION = 'ARROW_FUNCTION',
  METHOD_DECLARATION = 'METHOD_DECLARATION',
  CALL_EXPRESSION = 'CALL_EXPRESSION',
  NEW_EXPRESSION = 'NEW_EXPRESSION',
  AWAIT_EXPRESSION = 'AWAIT_EXPRESSION',
  TRY_STATEMENT = 'TRY_STATEMENT',
  CATCH_CLAUSE = 'CATCH_CLAUSE',
  THROW_STATEMENT = 'THROW_STATEMENT',
  FINALLY_BLOCK = 'FINALLY_BLOCK',
  IMPORT_DECLARATION = 'IMPORT_DECLARATION',
  EXPORT_DECLARATION = 'EXPORT_DECLARATION',
  RE_EXPORT = 'RE_EXPORT',
  EXPORT_ASSIGNMENT = 'EXPORT_ASSIGNMENT',
  STRING_LITERAL = 'STRING_LITERAL',
  TEMPLATE_EXPRESSION = 'TEMPLATE_EXPRESSION',
  REGULAR_EXPRESSION_LITERAL = 'REGULAR_EXPRESSION_LITERAL',
  RETURN_STATEMENT = 'RETURN_STATEMENT',
  VARIABLE_DECLARATION = 'VARIABLE_DECLARATION',
  CLASS_DECLARATION = 'CLASS_DECLARATION',
  INTERFACE_DECLARATION = 'INTERFACE_DECLARATION',
  TYPE_ALIAS = 'TYPE_ALIAS',
  BOOLEAN_LITERAL = 'BOOLEAN_LITERAL',
  NULL_LITERAL = 'NULL_LITERAL',
  OBJECT_LITERAL = 'OBJECT_LITERAL',
  PROPERTY_ASSIGNMENT = 'PROPERTY_ASSIGNMENT',
  BLOCK_COMMENT = 'BLOCK_COMMENT',
  LINE_COMMENT = 'LINE_COMMENT',
  PROPERTY_ACCESS_EXPRESSION = 'PROPERTY_ACCESS_EXPRESSION',
  IF_STATEMENT = 'IF_STATEMENT',
  FOR_STATEMENT = 'FOR_STATEMENT',
  WHILE_STATEMENT = 'WHILE_STATEMENT',
  SWITCH_STATEMENT = 'SWITCH_STATEMENT',
  ARRAY_LITERAL = 'ARRAY_LITERAL',
  SPREAD_ELEMENT = 'SPREAD_ELEMENT',
  BINARY_EXPRESSION = 'BINARY_EXPRESSION',
  CONDITIONAL_EXPRESSION = 'CONDITIONAL_EXPRESSION',
  AS_EXPRESSION = 'AS_EXPRESSION',
  TYPE_REFERENCE = 'TYPE_REFERENCE',
}

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface CodeConstruct {
  type: ConstructType;
  name: string;
  filePath: string;
  line: number;
  endLine: number;
  body: string;
  node: ts.Node;
  isDefinition: boolean;
  isCallSite: boolean;
  isAsync: boolean;
  modifiers: string[];
  parent: CodeConstruct | null;
  children: CodeConstruct[];
  parameters: { name: string; type: string | null }[];
  returnType: string | null;
}

export interface CallSiteEntry {
  callSiteFile: string;
  callSiteLine: number;
  hasAwait: boolean;
  isInsideTry: boolean;
  isInsideCatch: boolean;
  isInsideFinally: boolean;
  returnValueUsed: boolean;
  calleeResolved: boolean;
  calleeReturnsPromise: boolean;
}

export interface CallGraphEntry {
  calleeFile: string;
  calleeLine: number;
  calleeName: string;
  callSites: CallSiteEntry[];
}

export interface CallGraph {
  entries: Map<string, CallGraphEntry>;
  totalCallSites: number;
  resolvedCallSites: number;
  coveragePercent: number;
}

export interface SymbolTableEntry {
  name: string;
  filePath: string;
  line: number;
  isExported: boolean;
  isImported: boolean;
  importedBy: string[];
  constructType: ConstructType;
}

export interface SymbolTable {
  symbols: Map<string, SymbolTableEntry>;
}

export interface SuppressedFinding {
  layer: string;
  severity: Severity;
  category: string;
  file: string;
  line: number;
  description: string;
  confidence: number;
  suppressionReason: string;
}

export interface AuditMeta {
  callGraphCoverage: number;
  totalCallSites: number;
  resolvedCallSites: number;
  checkerAvailable: boolean;
  blindSpots: string[];
  suppressedBelowFloor: number;
  selfAudit: boolean;
}

export interface ProjectLanguageStats {
  typescript: number;
  javascript: number;
  python: number;
  rust: number;
  go: number;
  java: number;
  csharp: number;
  other: number;
  total: number;
}

export interface AnalysisContext {
  constructs: CodeConstruct[];
  symbolTable: SymbolTable;
  callGraph: CallGraph;
  preflight: PreflightResult;
  packageJson: Record<string, any> | null;
  tsconfig: Record<string, any> | null;
  opencodeJson: Record<string, any> | null;
  diagnostics: ts.Diagnostic[];
  projectRoot: string;
  constructsByFile: Map<string, CodeConstruct[]>;
  isSelfAudit: boolean;
  checker: ts.TypeChecker | null;
  // v4.4.2 additions — multi-language awareness + evidence integrity
  languageStats?: ProjectLanguageStats;
  evidenceChainHash?: string;
  // THE W2 PROJECT-TYPE GATE (2026-08-19): the ProjectContext flows through
  // the AnalysisContext so the lexicon-backed layers (R1/R3/R11/R2/R5) can
  // gate on the project shape (the plugin vs the non-plugin).
  projectContext?: { gatedLayers: string[]; isPlugin: boolean; shape?: string };
  identityVerified?: boolean;
  // Spec Phase 0: Multi-language scanner metadata
  skippedExtensions?: string[];
  totalFilesScanned?: number;
  totalFilesSkipped?: number;
}

export interface PreflightResult {
  typeCheckPassed: boolean;
  typeCheckError: string | null;
  buildPassed: boolean;
  buildError: string | null;
  distExists: boolean;
  distIsSingleFile: boolean;
  distSize: number;
  hasRelativeImports: boolean;
  sourceMapExists: boolean;
  findings: PreflightFinding[];
}

export interface PreflightFinding {
  check: string;
  passed: boolean;
  detail: string;
}

export interface AuditFinding {
  layer: string;
  severity: Severity;
  category: string;
  file: string;
  line: number;
  evidence: string;
  description: string;
  message?: string;
  rule?: string;
  correction?: string;
  runtimeImpact?: string;
  confidence: number;
  constructType: ConstructType | null;
  callGraphRef: string | null;
  evidenceSuppressed: boolean;
  confidenceDimensions?: import('../types.js').FindingConfidence;
  reproducible?: import('../types.js').ReproducibleFailure;
  triad?: EvidenceTriad;
}

export interface LayerRule {
  layer: string;
  name: string;
  description: string;
  applicableTo: ConstructType[];
  excludeTypes?: ConstructType[];
  requireAsync?: boolean;
  requireHasBody?: boolean;
  requireDefinition?: boolean;
  requireCallSite?: boolean;
  evaluate: (construct: CodeConstruct | null, ctx: AnalysisContext) => AuditFinding[];
  requireEvidence?: string;
  enabled: boolean;
  auditSelf?: boolean;
}

export interface CallerInfo {
  filePath: string;
  line: number;
  constructName: string;
}

export interface ChainStep {
  from: string;
  to: string;
  evidence: string;
}

export interface UnwiredInfo {
  description: string;
  severity: Severity;
}

export interface Audit3DEvidence {
  node: string;
  callers: CallerInfo[];
  chain: ChainStep[];
  unwired: UnwiredInfo[];
  findings: AuditFinding[];
}

export interface GraphSnapshot {
  timestamp: number;
  nodes: string[];
  edges: string[];
  callGraphSnapshot?: {
    entries: { calleeFile: string; calleeName: string; calleeLine: number; callSites: CallSiteEntry[] }[];
    totalCallSites: number;
    resolvedCallSites: number;
  };
}

export interface GraphDriftResult {
  driftDetected: boolean;
  driftedNodes: string[];
  message: string;
}

export interface GraphBackedAudit {
  evidence3D(file: string): Promise<Audit3DEvidence>;
  graphDrift(baseline: GraphSnapshot): GraphDriftResult;
}

export interface AuditResult {
  score: number;
  grade: string;
  findings: AuditFinding[];
  filesScanned: number;
  sourceFilesScanned: number;
  layers: { layer: string; name: string; findingCount: number; avgConfidence: number; evidenceSuppressed: boolean }[];
  report: string;
  preflight: PreflightResult;
  confidenceDistribution: ConfidenceDistribution;
  suppressedFindings: SuppressedFinding[];
  auditMeta: AuditMeta;
  audit3D?: Map<string, Audit3DEvidence>;
}

export interface ConfidenceDistribution {
  definite: number;
  high: number;
  moderate: number;
  low: number;
  noise: number;
}

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 15,
  HIGH: 8,
  MEDIUM: 3,
  LOW: 1,
};

// ── THE PROJECT-TYPE GATE (W2 — the L2 spec §3.2) ──
// THE SCORE-CAP FIX: the plugin-specific layers (R1 hook-contract, R3/R12
// cross-plugin isolation, R15 container-preflight, R16 bible-enforcement) fire
// on ANY project — a non-plugin library's ordinary methods are structurally
// scanned as if they were plugin hook handlers → 34 false MEDIUM findings →
// the god loop's progressive score caps ~23-30 → PASS (≥96) unreachable.
// THE FIX: the shape detector classifies the target; the gated layers'
// findings are EXCLUDED from the score's weight pool (they STAY in the report
// as informational). THE OPERATOR: "the scoring system is fucked and needs
// major context aware rework."
export type ProjectShape = 'plugin' | 'library' | 'app' | 'monorepo' | 'test-heavy' | 'indeterminate';
export type GateVerdict = 'GATED' | 'UNGATED' | 'INDETERMINATE';

export interface ProjectContext {
  shape: ProjectShape;
  isPlugin: boolean;
  evidence: { imports: string[]; pkgFields: Record<string, unknown>; dirs: string[] };
  gatedLayers: string[];                 // the plugin-specific layers excluded for non-plugin
  scoreWeights: Record<Severity, number>;// the context-adjusted weights (the audit's 15/8/3/1 preserved)
  gateVerdict: GateVerdict;
}

// THE PLUGIN-SPECIFIC LAYERS (BECAUSE §3.2.4): these validate the
// @opencode-ai/plugin hook surface + the plugin runtime + the plugin canon. A
// non-plugin library has NONE of those — scanning for them produces the
// false-findings class that caps the score.
export const PLUGIN_SPECIFIC_LAYERS = ['R1', 'R3', 'R12', 'R15', 'R16'];

export const CONFIDENCE_LABELS: { min: number; max: number; label: string }[] = [
  { min: 0.95, max: 1.00, label: 'Definite' },
  { min: 0.85, max: 0.94, label: 'High' },
  { min: 0.70, max: 0.84, label: 'Moderate' },
  { min: 0.50, max: 0.69, label: 'Low' },
  { min: 0.00, max: 0.49, label: 'Noise' },
];

export function confidenceLabel(confidence: number): string {
  for (const entry of CONFIDENCE_LABELS) {
    if (confidence >= entry.min && confidence <= entry.max) return entry.label;
  }
  return 'Unknown';
}
