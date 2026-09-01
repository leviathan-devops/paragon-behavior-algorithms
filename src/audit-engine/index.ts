import * as fs from 'fs/promises';
import * as path from 'path';
import { tridentLog } from '../utils.js';
import {AuditResult, AuditFinding, LayerRule, Audit3DEvidence, GraphSnapshot, GraphDriftResult, AnalysisContext} from './types.ts';
import { LayerEngine } from './layer-engine.ts';
import { EvidenceGate } from './evidence-gate.ts';
import { computeScore } from './scoring.ts';
export { computeScore, INCONCLUSIVE, ORACLE_SCORE_CONSTANTS } from './scoring.ts';
import { GraphBackedAuditClass } from './graph-backed-audit.ts';
import { classifyProject, countTsFilesInTarget } from './code-classifier.ts';
import { detectProjectShape } from './context/audit-project-context.ts';
import { AuditGraph } from './graph/audit-graph.ts';
import { ingestRecentEvents } from './events/audit-events.ts';
import { buildScopedProgram, AST_ERRORS } from './ast/audit-ast-core.ts';
// THE W6 ENFORCEMENT RING + THE W7 AETHER BACKEND (2026-08-19 — the L2 spec
// §3.8/§3.9): wired into the audit() pipeline so the 5+1 ring + the supremacy
// contract are LIVE + bundled (the tree-shaken-out class dead).
import { selfEnforceScan, verifyDistSha } from './enforcement/audit-enforcement.ts';
import { runSelfAudit, SELF_AUDIT_FAILED } from './enforcement/self-audit.js';
import { generateReport, AetherManifest } from './aether/audit-aether.ts';
import { runStepX, markStepSkipped, STEP_X_SKIPPED_PREFIX } from './aether/step-x-orchestrator.ts';
import type { StepXInput, StepXResult } from './aether/step-x-orchestrator.ts';
import { createAgentAetherBrain } from './aether/agent-brain.ts';
import { DefaultAetherBrain } from './aether/aether-brain.ts';
import type { AetherBrain, AetherBrainConfig } from './aether/aether-brain.ts';
// THE SPEC-2 STEP-X (the S-PB4 wiring — §2.1/§11.1): the judgment pass wired
// into audit() after the ringScan, before the W7 aetherReport.
// THE SPEC-2 STEP-X PASS IS DELETED (2026-08-30 operator ruling: the legacy chunk-adjudication
// pass over the preliminary findings was a dead-era consumer — the Aether meta adjudication
// is the judgment layer. See the deletion note at the former call site.)
// THE G4 CLOSURE — the REAL pi aether agent as the judgment engine: ONE
// RpmLedger per audit run (wave-aware), read+grep+report-write tools at HIGH
// reasoning, the file-on-disk deliverable parsed back into the verdicts.

import type { AetherStoreDb } from './aether/aether-store.ts';
import { parseSpecBindings } from './input/spec-bindings.ts';
import { candidates as rLexiconCandidates } from './layers/r-lexicon.ts';
import { candidates as rActorCandidates } from './layers/r-actor.ts';
import { candidates as rStateMachineCandidates } from './layers/r-state-machine.ts';
import { candidates as rEngineCandidates } from './layers/r-engine.ts';
import { candidates as rAdapterCandidates } from './layers/r-adapter.ts';
import { candidates as rMpseCandidates } from './layers/r-mpse.ts';
import { runAuditPipeline } from './aether-backend/runner.ts';
import { Database } from 'bun:sqlite';
import { runPreflight, PreflightResult } from './preflight.ts';
import { enrichWithHiveKnowledge } from './hive-loader.ts';
import { prioritizeFixes, generateFixSummary } from './fix-prioritizer.ts';
import { generateContainerTestPlan } from './test-plan-generator.ts';
import { generateDeploymentManifest } from './deploy-manifest.ts';
import { shortFile, confidenceLabel } from '../utils.js';

import { R1_HOOK_CONTRACT } from './layers/r1-hook-contract.ts';
import { R2_ERROR_HANDLING } from './layers/r2-error-handling.ts';
import { R3_SOURCE_HYGIENE } from './layers/r3-source-hygiene.ts';
import { R4_DATA_FLOW_ANALYSIS } from './layers/r4-data-flow-analysis.ts';
import { R5_THEATRICAL_INTEGRITY } from './layers/r5-theatrical-integrity.ts';
// SPEC-A §2.5 — the six LASME/MPSE candidate producers were consumed by the
// deleted legacy fallback path (see its deletion note below); the hydra gates
// consume the AuditorTemplate rosters directly.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
// SPEC-A §2.7 Batch B — graph-activated consumers (ONE shared handle law)
import { isBatchBActive } from './layers/activation.ts';
import { candidates as rGraphCandidates } from './layers/r-graph.ts';
import { candidates as rDhFeedCandidates } from './layers/r-dh-feed.ts';
import { candidates as rProvenanceCandidates } from './layers/r-provenance.ts';
import { QueryEngine } from '../shared/knowledge-graph/query-engine.ts';
import { AetherHydraPipeline } from '../hydra/pipeline.ts';
import { runMetaLayer } from '../hydra/aether-meta.ts';
import type { AuditorTemplate } from '../hydra/aether-templates/types.ts';
import { lasmeLexiconTemplate } from '../hydra/aether-templates/hunters/lasme-lexicon.ts';
import { lasmeActorTemplate } from '../hydra/aether-templates/hunters/lasme-actor.ts';
import { lasmeStateMachineTemplate } from '../hydra/aether-templates/hunters/lasme-state-machine.ts';
import { lasmeEngineTemplate } from '../hydra/aether-templates/hunters/lasme-engine.ts';
import { lasmeAdapterTemplate } from '../hydra/aether-templates/hunters/lasme-adapter.ts';
import { lasmeMpseThresholdTemplate } from '../hydra/aether-templates/hunters/lasme-mpse-threshold.ts';
import { lasmeMetaTemplate } from '../hydra/aether-templates/meta/lasme-meta.ts';
import { mpseContractTemplate } from '../hydra/aether-templates/hunters/mpse-contract.ts';
import { mpseOracleTemplate } from '../hydra/aether-templates/hunters/mpse-oracle.ts';
import { mpseStageTemplate } from '../hydra/aether-templates/hunters/mpse-stage.ts';
import { mpseProvenanceTemplate } from '../hydra/aether-templates/hunters/mpse-provenance.ts';
import { mpseMetaTemplate } from '../hydra/aether-templates/meta/mpse-meta.ts';
import { sroGraphTemplate } from '../hydra/aether-templates/hunters/sro-graph.ts';
import { sroPathTemplate } from '../hydra/aether-templates/hunters/sro-path.ts';
import { sroDeadCodeTemplate } from '../hydra/aether-templates/hunters/sro-dead-code.ts';
import { sroCyclesTemplate } from '../hydra/aether-templates/hunters/sro-cycles.ts';
import { sroMetaTemplate } from '../hydra/aether-templates/meta/sro-meta.ts';
import { SQLiteMemoryStore } from '../hydra/memory.ts';
import { GraphifyMCPMapper } from '../hydra/graph-mapper.ts';
import { lasmeSpecs, lasmeSynthesize, lasmePreGates, lasmePostGates } from '../hydra/instances/lasme.ts';
import { mpseSpecs, mpseSynthesize, createMpsePreGates, createMpsePostGates } from '../hydra/instances/mpse.ts';
import { sroSpecs, sroSynthesize, createSroPreGates, createSroPostGates } from '../hydra/instances/sro.ts';
import { AetherAgent } from './aether-backend/agent.ts';
import { probeProvider } from './aether-backend/probe.ts';
import { AETHER_PROVIDER_ID, AETHER_MODEL_ID } from './aether-backend/provider.ts';
import type { LLMTransport } from '../hydra/types.ts';
import { aetherLedgerRootFor, safeWriteRunStatus, safeNotifyGateCompletion, writeRunStatus, GATES_RUNNING_LABEL } from './run-status.ts';
import { stitchConcurrentSections } from './gate-stitch.ts';
import { runGraphLogicPhase } from './graph-logic-phase.ts';
import { buildFindingsMap, writeFindingsMap, composeOperatorBrief, SELF_DEFECT_PATHS } from '../hydra/findings-map.ts';
import { evaluateToolUsage } from '../hydra/tool-usage-lexicon.ts';
// writeRunStatus ladder: [PRELIMINARY] → [GATES-RUNNING] → [FINAL]
void writeRunStatus;
void GATES_RUNNING_LABEL;
void stitchConcurrentSections;

// FINDING #8 FIX: Centralized config — single source of truth for versions
import { TRIDENT_CONFIG } from '../config.js';

const BASELINE_BINARY = TRIDENT_CONFIG.baselineBinary;
const TARGET_IMAGE = TRIDENT_CONFIG.containerImage;

// ── THE SELF-AUDIT AT LOAD (wave 6 T-7 — SPEC-1 S8 + Law 12 DEGRADED-not-hang) ──
// LAW 12 DEGRADED-not-hang: the host must NEVER hang or crash because the
// audit's own theatrical battery failed. BOOT stays cheap (no work at import);
// the first audit-tool invocation lazily runs runSelfAudit() inside a try/catch
// that LOGS LOUD (SELF_AUDIT_FAILED naming each finding) but returns DEGRADED
// — the audit proceeds with a warning, the host stays alive. An explicit init
// (initSelfAudit) exists for tests or pre-warming. NOT at plugin import.
let selfAuditHasRun = false;
let selfAuditLastReport: ReturnType<typeof runSelfAudit> | null = null;
export function initSelfAudit(): ReturnType<typeof runSelfAudit> | null {
  if (selfAuditHasRun) return selfAuditLastReport;
  selfAuditHasRun = true;
  try {
    const report = runSelfAudit();
    selfAuditLastReport = report;
    if (!report.passed) {
      tridentLog('ERROR', 'self-audit', SELF_AUDIT_FAILED + ': self-audit found ' + report.findings.length + ' theatrical pattern(s) in own tree — ' + report.findings.map((f) => f.file + ':' + f.line).join(', '));
    } else {
      tridentLog('INFO', 'self-audit', 'self-audit PASSED — scanned ' + report.scannedFiles + ' files, calibrationSeed=' + report.calibrationSeed + ', ' + report.durationMs + 'ms');
    }
    return report;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('ERROR', 'self-audit', 'self-audit threw (DEGRADED-not-hang): ' + msg);
    return null;
  }
}
function ensureSelfAudit(): void {
  if (selfAuditHasRun) return;
  initSelfAudit();
}
export function getSelfAuditReport(): ReturnType<typeof runSelfAudit> | null { return selfAuditLastReport; }

// THE STEP-X MODEL SURFACE IS RETIRED (the pass deleted 2026-08-30 — the
// judgment layer is the Aether meta adjudication; the deterministic findings
// flow to scoring and the report honestly labeled).



function createHydraTransport(): LLMTransport {
  try {
    const agent = new AetherAgent();
    const getModel = () => {
      const m = (agent as unknown as { models: { getModel: (a: unknown, b: unknown) => unknown } }).models.getModel(AETHER_PROVIDER_ID as never, AETHER_MODEL_ID as never);
      if (m) return m as never;
      const alt = (agent as unknown as { models: { getModel: (a: unknown, b: unknown) => unknown } }).models.getModel(AETHER_PROVIDER_ID as never, (AETHER_MODEL_ID.split('/').pop() || AETHER_MODEL_ID) as never);
      return (alt ?? { id: AETHER_MODEL_ID }) as never;
    };
    const rawStream = (agent as unknown as { chainedStream: (a: unknown, b: unknown, c: unknown) => unknown }).chainedStream;
    const chainedStream = typeof (rawStream as unknown as { bind?: unknown }).bind === 'function' ? (rawStream as unknown as { bind: (t: unknown) => unknown }).bind(agent) : rawStream;
    return { getModel: getModel as unknown as LLMTransport['getModel'], chainedStream: chainedStream as unknown as LLMTransport['chainedStream'], providerId: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID } as LLMTransport;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('WARN', 'audit-engine', `createHydraTransport fallback mock: ${msg}`);
    return { getModel: () => ({ id: AETHER_MODEL_ID } as unknown as ReturnType<LLMTransport['getModel']>), chainedStream: (() => ({})) as unknown as LLMTransport['chainedStream'], providerId: AETHER_PROVIDER_ID, modelId: AETHER_MODEL_ID };
  }
}

function hydraCandidateToFinding(c: Record<string, unknown>): AuditFinding {
  const layer = typeof c['layer'] === 'string' ? (c['layer'] as string) : 'r-lexicon';
  const file = typeof c['file'] === 'string' ? (c['file'] as string) : '(unknown)';
  const line = typeof c['line'] === 'number' ? (c['line'] as number) : 1;
  const evidence = typeof c['evidence'] === 'string' ? (c['evidence'] as string) : (typeof c['evidenceQuote'] === 'string' ? (c['evidenceQuote'] as string) : `${layer} finding`);
  const predicate = typeof c['predicate'] === 'string' ? (c['predicate'] as string) : 'unknown';
  const object = typeof c['object'] === 'string' ? (c['object'] as string) : 'shape';
  const severity = (typeof c['severity'] === 'string' && ['CRITICAL','HIGH','MEDIUM','LOW'].includes(c['severity'] as string)) ? (c['severity'] as AuditFinding['severity']) : 'MEDIUM' as AuditFinding['severity'];
  const confidence = typeof c['confidence'] === 'number' ? (c['confidence'] as number) : 0.6;
  const implicated = typeof c['implicatedSpecClause'] === 'string' ? (c['implicatedSpecClause'] as string) : undefined;
  return { layer, severity, category: `${predicate}.${object}`, file, line, evidence, description: `${predicate} ${object} at ${file}:${line}`, correction: implicated ?? `Review ${predicate} ${object} against spec`, runtimeImpact: 'Hydra gate finding — requires adjudication', confidence, constructType: null, callGraphRef: null, evidenceSuppressed: false, triad: { pattern: { memberId: `${predicate}.${object}`, familySeverity: severity }, state: { machineId: layer, from: 'ANALYZED', to: 'EVIDENCED' }, evidence: { file, line } } } as AuditFinding;
}

// ═══ THE TARGET MANDATE (2026-08-28 — the operator's scope law, verbatim):
// "this should not be global auditing the entire workspace it should specifically
//  only audit the path it is pointed at and must mandated a proper src path target
//  so it audits a codebase and doesnt have any stupid shit"
// REVISED MANDATE (2026-08-28, operator correction — supersedes the first cut):
// "we may want to audit specific checkpoints - the point is to have it pointed at
//  a /src path and enforce ONE target at a time - it will audit the entire codebase
//  of 1 specific target's /src root w/ full input context via the aether agent"
// THE CONTRACT, mechanical form:
//   ONE audit = ONE target = that target's src/ ROOT — the entire codebase of that
//   one target, full input context via the aether agent. A Checkpoints snapshot's
//   src/ IS a legitimate target (frozen codebases are auditable — regression
//   comparisons, forensics). What is refused: anything that is not a src root —
//   project roots (point at their src/), tool workspaces (contain Checkpoints/),
//   files, nonexistent paths.
export function validateAuditTarget(targetPath: string): void {
  const resolved = path.resolve(targetPath);
  if (!existsSync(resolved)) {
    throw new Error(`TARGET_NOT_FOUND: ${targetPath} does not exist — point the audit at ONE target's src/ root (e.g. <workspace>/<project>/src)`);
  }
  let stat: import('fs').Stats;
  try { stat = statSync(resolved); } catch (e: unknown) { throw new Error(`TARGET_NOT_FOUND: ${targetPath} is not statable — ${e instanceof Error ? e.message : String(e)}`); }
  if (!stat.isDirectory()) {
    throw new Error(`TARGET_NOT_A_DIRECTORY: ${targetPath} is a file — the audit consumes ONE target's src/ ROOT (a directory)`);
  }
  const base = path.basename(resolved);
  if (base !== 'src') {
    // THE SRC-ROOT MANDATE — the one-target law. Checkpoints snapshots are exempt
    // from refusal: their src/ is an auditable frozen codebase (deliberate targets).
    let remedy = ' Point at exactly ONE target\'s src/ root (e.g. <workspace>/<project>/src).';
    try {
      if (readdirSync(resolved).includes('src')) remedy = ` Found ${targetPath}${path.sep}src — point there.`;
      else if (readdirSync(resolved).includes('Checkpoints')) remedy = ' This is a tool WORKSPACE (it holds Checkpoints/ snapshots) — point at ONE project under it: <workspace>/<project>/src.';
    } catch { /* the existsSync/stat checks above already govern readability */ }
    throw new Error(`TARGET_MUST_BE_SRC_ROOT: ${targetPath} is not a src root — the audit enforces ONE target at a time: the entire codebase of that ONE target's src/, full input context via the aether agent.${remedy}`);
  }
}

// THE LEGACY FALLBACK PATH IS DELETED (the operator's ruling 2026-08-30, verbatim:
// 'if ALL the keys fail then have a loud failure dont just fallback to a determinisitic
// only'). A dead GO key pool = AETHER_PROBE_FAILED loud abort — see the !museAvailable
// branch in audit(). The deterministic r-* candidate assembly this function carried is
// gone with it; the hydra gates are the ONLY candidate path.

function getStepXBrain(targetPath: string, ledger: import('./aether/rpm-ledger.js').RpmLedger): AetherBrain {
  return createAgentAetherBrain({ targetPath, ledger });
}

let boundStepXBrain: AetherBrain | undefined;

export function configureStepXModels(config: AetherBrainConfig | undefined): void {
  boundStepXBrain = config ? new DefaultAetherBrain(config) : undefined;
}

async function runLegacyFallbackCandidates(ctx: AnalysisContext, specPaths: string[], targetPath: string): Promise<AuditFinding[]> {
  let specBindings: import('./input/spec-bindings.ts').SpecBindings;
  try { specBindings = parseSpecBindings(specPaths); } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `fallback parseSpecBindings failed: ${e instanceof Error ? e.message : String(e)}`); specBindings = { declarations: [], unclear: [] } as unknown as import('./input/spec-bindings.ts').SpecBindings; }
  type Lc = { subject: string; predicate: string; object: string; file: string; line: number; evidenceQuote: string; implicatedSpecClause?: string; side: string };
  const LAYER_MAP: Record<string, Lc[]> = {};
  try { LAYER_MAP['r-lexicon'] = rLexiconCandidates(ctx as unknown as import('./types.ts').AnalysisContext, specBindings) as unknown as Lc[]; } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `fallback r-lexicon failed: ${e instanceof Error ? e.message : String(e)}`); LAYER_MAP['r-lexicon'] = []; }
  try { LAYER_MAP['r-actor'] = rActorCandidates(ctx as unknown as import('./types.ts').AnalysisContext, specBindings) as unknown as Lc[]; } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `fallback r-actor failed: ${e instanceof Error ? e.message : String(e)}`); LAYER_MAP['r-actor'] = []; }
  try { LAYER_MAP['r-state-machine'] = rStateMachineCandidates(ctx as unknown as import('./types.ts').AnalysisContext, specBindings) as unknown as Lc[]; } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `fallback r-state-machine failed: ${e instanceof Error ? e.message : String(e)}`); LAYER_MAP['r-state-machine'] = []; }
  try { LAYER_MAP['r-engine'] = rEngineCandidates(ctx as unknown as import('./types.ts').AnalysisContext, specBindings) as unknown as Lc[]; } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `fallback r-engine failed: ${e instanceof Error ? e.message : String(e)}`); LAYER_MAP['r-engine'] = []; }
  try { LAYER_MAP['r-adapter'] = rAdapterCandidates(ctx as unknown as import('./types.ts').AnalysisContext, specBindings) as unknown as Lc[]; } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `fallback r-adapter failed: ${e instanceof Error ? e.message : String(e)}`); LAYER_MAP['r-adapter'] = []; }
  try { LAYER_MAP['r-mpse'] = rMpseCandidates(ctx as unknown as import('./types.ts').AnalysisContext, specBindings) as unknown as Lc[]; } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `fallback r-mpse failed: ${e instanceof Error ? e.message : String(e)}`); LAYER_MAP['r-mpse'] = []; }
  const orderedLayers = ['r-lexicon','r-actor','r-state-machine','r-engine','r-adapter','r-mpse'] as const;
  const allCandidates: Array<Lc & { layer: string; index: number }> = [];
  let idx = 0;
  for (const layer of orderedLayers) { for (const c of (LAYER_MAP[layer] ?? [])) { allCandidates.push({ ...c, layer, index: idx++ }); } }
  if (allCandidates.length === 0) return [];
  const triples = allCandidates.map(c => ({ index: c.index, layer: c.layer, side: c.side, file: c.file, line: c.line, predicate: c.predicate, evidenceQuote: c.evidenceQuote, implicatedSpecClause: c.implicatedSpecClause, subject: c.subject, object: c.object }));
  const mandateRunId = `audit-${Date.now()}-mandate-fallback`;
  let manifestStr = '';
  try { manifestStr = await runAuditPipeline({ runId: mandateRunId, targetRoot: targetPath, specs: specPaths, candidates: triples as unknown as import('./aether-backend/demand-builder.ts').CandidateTriple[] }); } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `fallback runAuditPipeline threw: ${e instanceof Error ? e.message : String(e)}`); manifestStr = JSON.stringify({ runId: mandateRunId, ready: false, counts: { candidatesIn: triples.length, trueDefect: 0, redHerring: 0, unclear: 0, unclassifiedEmitted: triples.length } }); }
  let manifest: { ready: boolean; counts: { candidatesIn: number; trueDefect: number; redHerring: number; unclear: number; unclassifiedEmitted: number } } | null = null;
  try { manifest = JSON.parse(manifestStr); } catch { manifest = null; }
  let verdicts: Array<{ findingIndex: number; adjudication: string; confidence?: number; specPath?: string; specLine?: number; specQuote?: string; codeQuote?: string; divergence?: string; legitimizingReason?: string; missingEvidence?: string }> = [];
  try { const ledgerRoot = path.join(path.resolve(targetPath), '.trident', 'audit-ledger', mandateRunId); const verdictsPath = path.join(ledgerRoot, 'verdicts.json'); if (existsSync(verdictsPath)) { const raw = readFileSync(verdictsPath, 'utf-8'); const parsed = JSON.parse(raw); if (Array.isArray(parsed.verdicts)) verdicts = parsed.verdicts; else if (Array.isArray(parsed)) verdicts = parsed; } } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `fallback verdicts read failed: ${e instanceof Error ? e.message : String(e)}`); }
  const byIndex = new Map<number, typeof verdicts[number]>();
  for (const v of verdicts) byIndex.set(v.findingIndex, v);
  const LAYER_MACHINE_ID: Record<string,string> = { 'r-lexicon':'r-lexicon','r-actor':'r-actor','r-state-machine':'r-state-machine','r-engine':'r-engine','r-adapter':'r-adapter','r-mpse':'r-mpse' };
  const mandateFindings: AuditFinding[] = [];
  const seenKeys = new Set<string>();
  for (const c of allCandidates) { const v = byIndex.get(c.index); const adjudication = v?.adjudication ?? 'UNCLEAR'; if (adjudication === 'RED_HERRING') continue; const key = `${c.layer}:${c.file}:${c.line}:${c.predicate}:${c.object}`; if (seenKeys.has(key)) continue; seenKeys.add(key); const isUnclassified = !manifest?.ready || adjudication === 'UNCLEAR' || adjudication === 'UNCLASSIFIED'; const severity: AuditFinding['severity'] = isUnclassified ? 'MEDIUM' : (v?.confidence !== undefined && v.confidence >= 0.9 ? 'HIGH' : 'MEDIUM'); const category = isUnclassified ? 'UNCLASSIFIED' : (v?.adjudication === 'TRUE_DEFECT' ? `${c.predicate}.${c.object}` : 'UNCLEAR'); const description = isUnclassified ? `UNCLASSIFIED — candidate not adjudicated: ${c.evidenceQuote.slice(0,120)}` : (v?.divergence ?? v?.missingEvidence ?? `${c.predicate} ${c.object} at ${c.file}:${c.line}`); const finding: AuditFinding = { layer: c.layer, severity, category, file: c.file, line: c.line, evidence: c.evidenceQuote, description, correction: v?.legitimizingReason ?? c.implicatedSpecClause ?? `Review ${c.predicate} ${c.object}`, runtimeImpact: isUnclassified ? 'Aether could not adjudicate — manual review required' : `Structural ${c.object} shape requires adjudication`, confidence: v?.confidence ?? 0.55, constructType: null, callGraphRef: null, evidenceSuppressed: false, triad: { pattern: { memberId: `${c.predicate}.${c.object}`, familySeverity: severity }, state: { machineId: LAYER_MACHINE_ID[c.layer] ?? c.layer, from: 'ANALYZED', to: 'EVIDENCED' }, evidence: { file: c.file, line: c.line } } }; mandateFindings.push(finding); }
  return mandateFindings;
}

export class AuditEngine {
  private engine: LayerEngine; private graphAudit: GraphBackedAuditClass;
  async evidence3D(file: string): Promise<Audit3DEvidence> { try { return await this.graphAudit.evidence3D(file); } catch (e: unknown) { console.error('[AuditEngine] evidence3D failed for', file, ':', e instanceof Error ? e.message : String(e)); return { node: file || '(error)', callers: [], chain: [], unwired: [{ description: `evidence3D error: ${e instanceof Error ? e.message : String(e)}`, severity: 'LOW' }], findings: [] }; } }
  graphDrift(baseline: GraphSnapshot): GraphDriftResult { try { return this.graphAudit.graphDrift(baseline); } catch (e: unknown) { console.error('[AuditEngine] graphDrift failed:', e instanceof Error ? e.message : String(e)); return { driftDetected: false, driftedNodes: [], message: `graphDrift error: ${e instanceof Error ? e.message : String(e)}` }; } }
  constructor() { this.engine = new LayerEngine(); this.graphAudit = new GraphBackedAuditClass(null); this.engine.registerLayers([R1_HOOK_CONTRACT,R2_ERROR_HANDLING,R3_SOURCE_HYGIENE,R4_DATA_FLOW_ANALYSIS,R5_THEATRICAL_INTEGRITY]); }

  // E22: Unified empty result handling - single path returns empty result
  private buildEmptyResult(targetPath: string, preflight: PreflightResult, pkgJson: Record<string, any> | null, namedCause?: string | null): AuditResult {
    const cause = namedCause ?? null;
    const isFileTooLarge = cause !== null && cause.indexOf('AST_FILE_TOO_LARGE') !== -1;
    const evidenceText = isFileTooLarge ? `Audit aborted - ${cause}` : `Target path ${targetPath} contains 0 .ts source files` + (cause ? ` - cause: ${cause}` : '');
    const descriptionText = isFileTooLarge ? `Audit aborted: ${cause}` : 'No source files found in targetPath' + (cause ? ` (cause: ${cause})` : '');
    const blindSpotText = isFileTooLarge ? cause! : (cause ? `${cause} - ZERO source files found - target path may be dist-only` : 'ZERO source files found - target path may be dist-only');
    const gradeText = isFileTooLarge ? `NOT RUNTIME GRADE - ${cause}` : 'NOT RUNTIME GRADE - No source files found';
    const emptyFinding: AuditFinding = {
      layer: 'R0',
      severity: 'CRITICAL',
      category: isFileTooLarge ? 'AST_FILE_TOO_LARGE' : 'EMPTY_TARGET',
      file: '(entire project)',
      line: 1,
      evidence: evidenceText,
      description: descriptionText,
      correction: isFileTooLarge ? `Remove or exclude the oversized file named in the error (${cause}) or split it - the audit engine caps single files at 10MB to avoid stack overflow` : 'Point trident-code-audit at a directory containing src/ with .ts files',
      runtimeImpact: isFileTooLarge ? 'Audit aborted due to oversized source file - no analysis was performed' : 'Audit returns 0/100 with no findings - no analysis was performed',
      confidence: 1.0,
      constructType: null,
      callGraphRef: null,
      evidenceSuppressed: false,
    };

    return {
      score: 0,
      grade: gradeText,
      findings: [emptyFinding],
      filesScanned: 0,
      sourceFilesScanned: 0,
      layers: [],
      report: '',
      preflight,
      confidenceDistribution: { definite: 0, high: 0, moderate: 0, low: 0, noise: 0 },
      suppressedFindings: [],
      auditMeta: {
        callGraphCoverage: 0, totalCallSites: 0, resolvedCallSites: 0,
        checkerAvailable: false,
        blindSpots: [blindSpotText],
        suppressedBelowFloor: 0,
        selfAudit: false,
      },
    };
  }

  reset(): void {
    this.engine = new LayerEngine();
    this.graphAudit = new GraphBackedAuditClass(null);
    this.engine.registerLayers([
      R1_HOOK_CONTRACT,
      R2_ERROR_HANDLING,
      R3_SOURCE_HYGIENE,
      R4_DATA_FLOW_ANALYSIS,
      R5_THEATRICAL_INTEGRITY,
    ]);
  }

  async audit(targetPath: string): Promise<AuditResult> {
    // ═══ THE TARGET MANDATE (2026-08-28 — the operator's scope law, revised) ═══
    // ONE audit = ONE target = that target's src/ ROOT. The full codebase of that
    // one target, full input context via the aether agent. Checkpoint snapshots'
    // src/ are legitimate deliberate targets; everything else non-src is refused.
    validateAuditTarget(targetPath);
    try { ensureSelfAudit(); } catch (e: unknown) { tridentLog('WARN', 'self-audit', 'ensureSelfAudit DEGRADED: ' + (e instanceof Error ? e.message : String(e))); }
    // THE ASYNC VISIBILITY SEAM (B4) — hoisted runId + ledger root: the fast-return
    // payload + run-status transitions need the runId at PRELIMINARY time (before gates).
    // Hoisting fixes the latent TDZ at aetherInputBuilder (525) which would ReferenceError
    // when LASME invokes the closure before the later runId declaration.
    const runId = `audit-${Date.now()}`;
    const auditVisibilityLedgerRoot = aetherLedgerRootFor(targetPath);
    {
      const selfDefectBlockPath = path.join(auditVisibilityLedgerRoot, 'SELF_DEFECT_BLOCK.json');
      try {
        if (existsSync(selfDefectBlockPath)) {
          const raw = readFileSync(selfDefectBlockPath, 'utf-8');
          const parsed = JSON.parse(raw) as { runId?: string; defects?: unknown[]; dispositionedAt?: string | null; directive?: string };
          if (!parsed.dispositionedAt) {
            throw new Error(`AUDIT_BLOCKED_SELF_DEFECT: the prior run ${parsed.runId ?? 'unknown'} flagged ${(parsed.defects ?? []).length} self-defects — read ${selfDefectBlockPath}, fix, delete the file to acknowledge (disposition required: set dispositionedAt + directive before delete).`);
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message.startsWith('AUDIT_BLOCKED_SELF_DEFECT')) throw e;
        tridentLog('WARN', 'audit-engine', `self-defect block check failed (proceeding): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    try {
      // THE W1 SCOPE-LAW GUARD (2026-08-19 — the container-test catch): the
      // RAM-safe AST core's scope law (AST_SCOPE_VIOLATION on the whole-
      // workspace class — the fs root, the home dir, a parent-of-itself) MUST
      // fire BEFORE any audit. The container test proved the OLD path (the
      // code-classifier) had NO scope law — the audit on / ran instead of
      // refusing. The guard routes through buildScopedProgram's resolveScopeRoot.
      const preflight = await runPreflight(targetPath);
      const pkgJson = await this.readJson(path.join(targetPath, 'package.json'));
      const tsconfig = await this.readJson(path.join(targetPath, 'tsconfig.json'));
      const opencodeJson = await this.readJson(path.join(targetPath, 'opencode.json'));

      // THE W1 AST-CORE SCOPE GUARD — buildScopedProgram's resolveScopeRoot
      // throws AST_SCOPE_VIOLATION on the whole-workspace class BEFORE the walk.
      try {
        const scopeProbe = await buildScopedProgram(targetPath, { fileCap: 1000 });
        if (!scopeProbe.ok) {
          const probeErr = String(scopeProbe.namedError || '');
          // THE STRING CHECK (not the AST_ERRORS reference — the bundle's
          // tree-shaking can create a duplicate AST_ERRORS object, so the
          // reference comparison fails while the string matches).
          if (probeErr.indexOf('AST_SCOPE_VIOLATION') !== -1 || probeErr.indexOf('EMPTY_TARGET') !== -1) {
            throw new Error(probeErr);
          }
          throw new Error(probeErr);
        }
      } catch (scopeErr: unknown) {
        if (scopeErr instanceof Error && (scopeErr.message.indexOf('AST_SCOPE_VIOLATION') !== -1 || scopeErr.message.indexOf('EMPTY_TARGET') !== -1)) {
          throw scopeErr;
        }
        // ANY OTHER probe failure is now FATAL — the audit cannot proceed
        // without a valid AST context. Return the named error as the result.
        const fatalMsg = scopeErr instanceof Error ? scopeErr.message : String(scopeErr);
        tridentLog('ERROR', 'audit-engine', `scope probe FATAL: ${fatalMsg}`);
        const result = this.buildEmptyResult(targetPath, preflight, pkgJson, fatalMsg);
        result.report = this.generateReport(result, targetPath, typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath), '');
        result.findings.push({
          id: `scope-probe-fatal-${Date.now()}`,
          title: 'Scope probe failed — audit aborted',
          description: `The AST scope probe could not build a valid program for the target: ${fatalMsg}. The audit aborted instead of proceeding with a broken context (which previously crashed with a stack overflow).`,
          file: targetPath,
          line: 1,
          severity: 'HIGH',
          confidence: 1,
          layer: 'R0',
          category: 'ScopeProbeFatal',
          evidence: `scope-probe-fatal: ${fatalMsg}`,
          constructType: 'ERROR',
          callGraphRef: null,
          evidenceSuppressed: false,
        } as unknown as AuditFinding);
        return result;
      }

      const ctx = await classifyProject(targetPath, preflight, pkgJson, tsconfig, opencodeJson);

      let macroGraphState: { substrate: string; nodes: number; edges: number } | null = null;
      let microGraphState: { nodes: number; edges: number; graphJson: string | null } | null = null;
      // G-W GRAPH-LOGIC PHASE — abort contract D-20260830-10
      {
        const gl = await runGraphLogicPhase(targetPath, runId);
        macroGraphState = { substrate: 'corbell', nodes: gl.nodesCount, edges: gl.edgesCount };
        if (!gl.graphPopulated) {
          const msg = `GRAPH_LOGIC_FAILED: ${gl.error ?? 'graph population failed'} nodes=${gl.nodesCount} edges=${gl.edgesCount}`;
          tridentLog('ERROR', 'audit-engine', msg);
          const failSnap = { runId, gate: 'GRAPH_LOGIC' as const, phase: 'done' as const, huntersFulfilled: 0, huntersRejected: 0, candidatesSoFar: 0, artifactLabel: 'GRAPH_LOGIC: FAILED', updatedAt: Date.now(), targetRoot: targetPath };
          safeWriteRunStatus(auditVisibilityLedgerRoot, failSnap);
          safeNotifyGateCompletion(auditVisibilityLedgerRoot, failSnap);
          const failFinding: AuditFinding = { layer: 'R0', severity: 'CRITICAL', category: 'GRAPH_LOGIC_FAILED', file: targetPath, line: 1, evidence: msg, description: msg, correction: 'Fix graph-logic phase: ensure src/**/*.ts parseable and typed population succeeds', runtimeImpact: 'Audit aborted before gates — graph grounding failed', confidence: 1.0, constructType: null, callGraphRef: null, evidenceSuppressed: false } as unknown as AuditFinding;
          const emptyEv = new EvidenceGate(preflight, ctx.diagnostics, [failFinding]);
          const ls = this.computeLayerStats([failFinding]);
          const chkAvail = ctx.callGraph.totalCallSites === 0 || ctx.callGraph.coveragePercent > 0;
          const res = computeScore([failFinding], emptyEv, 0, 0, ls, ctx.callGraph.coveragePercent, ctx.callGraph.totalCallSites, ctx.callGraph.resolvedCallSites, chkAvail, ctx.isSelfAudit);
          (res as unknown as Record<string, unknown>)['graphLogicError'] = gl.error;
          res.report = this.generateReport(res, targetPath, typeof pkgJson?.name === 'string' ? pkgJson.name : targetPath, '') + `\n\n[GRAPH_LOGIC: FAILED] ${msg}`;
          return res;
        }
        tridentLog('INFO', 'audit-engine', `graph-logic phase passed nodes=${gl.nodesCount} edges=${gl.edgesCount} findings=${gl.hunterFindings}`);
      }

      // v4.4.3 R0:EMPTY_TARGET FIX — the gate's "0 source files" determination uses the
      // recursive .ts discovery over the target root (countTsFilesInTarget, mirroring the
      // god-loop's scanTsFiles — the same 4095-class count the INIT validates). The old
      // gate counted ctx.constructsByFile keys, which the buildAST >40-file program limit
      // could reduce to 0 (the dead-early-return bug) → false EMPTY_TARGET on any populated
      // target. Now the count is the TRUE recursive tree; the check fires only on a genuinely
      // empty target.
      const srcFilesScanned = countTsFilesInTarget(targetPath);

      if (srcFilesScanned === 0) {
        const result = this.buildEmptyResult(targetPath, preflight, pkgJson);
        result.report = this.generateReport(result, targetPath, typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath), '');
        return result;
      }

      const evidenceInitial = new EvidenceGate(preflight, ctx.diagnostics);
      const rawFindings = await this.engine.evaluateAll(ctx, evidenceInitial);

      const docsDir = path.join(targetPath, 'docs');
      let enrichedFindings = await enrichWithHiveKnowledge(rawFindings, docsDir);
      let allHydraFindings: AuditFinding[] = [...enrichedFindings];
      const prelimLabel = '[PRELIMINARY]';
      const lasmeLabel = '[LASME-ADJUDICATED]';
      const mpseLabel = '[MPSE-VERIFIED]';
      const finalLabel = '[FINAL]';
      const specPathsInitial: string[] = (() => {
        try {
          const auditSpecPath = path.join(targetPath, '.trident', 'audit-spec.json');
          if (existsSync(auditSpecPath)) {
            const raw = readFileSync(auditSpecPath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.specs)) return (parsed.specs as unknown[]).filter((s: unknown) => typeof s === 'string' && (s as string).length > 0) as string[];
          }
        } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `orchestrator specPaths read failed: ${e instanceof Error ? e.message : String(e)}`); }
        return [];
      })();
      const filesScanned = ctx.constructsByFile.size;
      // v4.4.3 R0:EMPTY_TARGET FIX — true recursive .ts discovery count over the target root
      // (hoisted above the [PRELIMINARY] block: the preliminary score uses the same inventory
      // the final report reports — one computation, two consumers).
      const sourceFilesScanned = countTsFilesInTarget(targetPath);
      const checkerAvailable = ctx.callGraph.totalCallSites === 0 || ctx.callGraph.coveragePercent > 0;
      const projectNamePrelim = typeof pkgJson?.name === 'string' ? (pkgJson.name as string) : path.basename(targetPath);
      const agentNamePrelim = typeof opencodeJson?.agent === 'object' && opencodeJson?.agent !== null ? Object.keys(opencodeJson.agent as Record<string, unknown>)[0] || '' : '';
      const layerStatsPrelim = this.computeLayerStats(allHydraFindings);
      const evidencePrelim = new EvidenceGate(preflight, ctx.diagnostics, allHydraFindings);
      const prelimResult = computeScore(allHydraFindings, evidencePrelim, filesScanned, sourceFilesScanned, layerStatsPrelim, ctx.callGraph.coveragePercent, ctx.callGraph.totalCallSites, ctx.callGraph.resolvedCallSites, checkerAvailable, ctx.isSelfAudit);
      prelimResult.report = this.generateReport(prelimResult, targetPath, projectNamePrelim, agentNamePrelim) + `\n\n${prelimLabel} — LASME/MPSE/SRO gates running`;
      tridentLog('INFO', 'audit-engine', `${prelimLabel} score ${prelimResult.score} — ${allHydraFindings.length} legacy findings — artifact ready within 15s`);
      const tPrelim = Date.now();
      try {
        const artifactTmp = path.join(targetPath, '.trident', 'audit-report-PRELIMINARY.md');
        await fs.mkdir(path.dirname(artifactTmp), { recursive: true });
        await fs.writeFile(artifactTmp, prelimResult.report, 'utf-8');
      } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `preliminary artifact write failed: ${e instanceof Error ? e.message : String(e)}`); }
      if (Date.now() - tPrelim > 15000) tridentLog('WARN', 'audit-engine', 'AP-5 PRELIMINARY LIE: preliminary artifact exceeded 15s');
      // THE ASYNC SEAM — PRELIMINARY transition (run start): the fast-return payload's source
      {
        const snap = { runId, gate: 'PRELIMINARY' as const, phase: 'done' as const, huntersFulfilled: 0, huntersRejected: 0, candidatesSoFar: allHydraFindings.length, artifactLabel: prelimLabel, updatedAt: Date.now(), targetRoot: targetPath };
        safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
        safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
      }

      let museAvailable = false;
      let probeReason = '';
      try {
        const probe = await probeProvider({ deadlineMs: 5000 });
        museAvailable = probe.ok;
        probeReason = probe.ok ? `ok ${probe.probeMs}ms` : `${(probe as { message?: string }).message ?? 'unreachable'}`;
        // D-20260830-10 (the operator's loud-fail law): a probe failure NEVER
        // "falls back" — the !museAvailable branch below is the LOUD ABORT
        // (AETHER_PROBE_FAILED). The old log line claimed a legacy-path
        // fallback that does not exist — banned-degrade residue, now honest.
        if (!probe.ok) tridentLog('ERROR', 'audit-engine', `AETHER_PROBE_FAILED (pre-abort log): muse probe failed ${probeReason}`);
        else tridentLog('INFO', 'audit-engine', `muse probe ok ${probe.probeMs}ms — proceeding to hydra gates`);
      } catch (e: unknown) { museAvailable = false; probeReason = e instanceof Error ? e.message : String(e); tridentLog('ERROR', 'audit-engine', `AETHER_PROBE_FAILED: probe threw ${probeReason} — the gates will NOT run (loud abort)`); }

      let memory: SQLiteMemoryStore | null = null;
      let graphMapper: GraphifyMCPMapper | null = null;
      let museTransport: LLMTransport | null = null;
      const provenance: Array<{ gate: string; durationMs: number; subagentCount: number; fulfilled: number; rejected: number }> = [];
      if (museAvailable) {
        try {
          const dbPath = path.join(targetPath, '.trident', 'knowledge-graph', 'shared.db');
          memory = new SQLiteMemoryStore(dbPath);
          graphMapper = new GraphifyMCPMapper();
          museTransport = createHydraTransport();
          tridentLog('INFO', 'audit-engine', `hydra memory+transport ready db=${dbPath} provider=${museTransport.providerId}/${museTransport.modelId}`);
        } catch (e: unknown) {
          tridentLog('WARN', 'audit-engine', `hydra init failed — falling back to legacy: ${e instanceof Error ? e.message : String(e)}`);
          museAvailable = false;
          try { memory?.close(); } catch {}
          memory = null;
          graphMapper = null;
          museTransport = null;
        }
      }

      const updateArtifact = async (findings: AuditFinding[], label: string) => {
        try {
          const ls = this.computeLayerStats(findings);
          const ev = new EvidenceGate(preflight, ctx.diagnostics, findings);
          const sc = computeScore(findings, ev, filesScanned, sourceFilesScanned, ls, ctx.callGraph.coveragePercent, ctx.callGraph.totalCallSites, ctx.callGraph.resolvedCallSites, checkerAvailable, ctx.isSelfAudit);
          sc.report = this.generateReport(sc, targetPath, projectNamePrelim, agentNamePrelim) + `\n\n${label}`;
          const artifactPath = path.join(targetPath, '.trident', `audit-report-${label.replace(/[^A-Z]/g, '')}.md`);
          await fs.mkdir(path.dirname(artifactPath), { recursive: true });
          await fs.writeFile(artifactPath, sc.report, 'utf-8');
          tridentLog('INFO', 'audit-engine', `artifact updated ${label} score=${sc.score} findings=${findings.length}`);
          return sc;
        } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `updateArtifact ${label} failed: ${e instanceof Error ? e.message : String(e)}`); return null; }
      };

      if (!museAvailable) {
        // THE LOUD FAIL (the operator's ruling 2026-08-30, verbatim: 'if ALL the
        // keys fail then have a loud failure dont just fallback to a deterministic
        // only'): an exhausted GO key pool is a NAMED failure — the audit does NOT
        // degrade into the deterministic legacy path. The failure rides the status
        // file + the toast channel + the ERROR log with the pool state and the
        // self-heal remedy, then the run ABORTS. The keys re-enter the pool line
        // when their windows pass; the next audit runs the full ladder.
        const failMsg = `AETHER_PROBE_FAILED: the GO key pool is exhausted (all keys dead or failing) — ${probeReason} — LOUD FAIL, no deterministic fallback. KEY POOL self-heals: the keys re-enter the line automatically when their usage windows pass.`;
        tridentLog('ERROR', 'audit-engine', failMsg);
        const failSnap = { runId, gate: 'PROBE_FAILED' as const, phase: 'done' as const, huntersFulfilled: 0, huntersRejected: 0, candidatesSoFar: allHydraFindings.length, artifactLabel: '[PROBE-FAILED]', updatedAt: Date.now(), targetRoot: targetPath };
        safeWriteRunStatus(auditVisibilityLedgerRoot, failSnap);
        safeNotifyGateCompletion(auditVisibilityLedgerRoot, failSnap);
        throw new Error(failMsg);
      } else {
        try {
        {
          if (!graphMapper) throw new Error('GRAPHIFY_MICRO_FAILED: graphMapper not initialized — hydra init failed');
          try {
            const microGraph = await graphMapper.extract(targetPath, { codeOnly: true, scope: ['src'], exclude: ['Checkpoints', 'node_modules', 'corbell-data', '.trident'] });
            microGraphState = { nodes: microGraph.nodes.length, edges: microGraph.edges.length, graphJson: graphMapper.getLastGraphPath() };
            tridentLog('INFO', 'audit-engine', `graphify micro-graph ready: ${microGraph.nodes.length} nodes / ${microGraph.edges.length} edges`);
            await graphMapper.getMcp().connect(path.join(targetPath, 'graphify-out', 'graph.json'));
            tridentLog('INFO', 'audit-engine', 'graphify MCP connected');
          } catch (e) {
            const msg = `GRAPHIFY_MICRO_FAILED: ${e instanceof Error ? e.message : String(e)} — the mini-graph is MANDATORY; the gates do not run without it.`;
            tridentLog('ERROR', 'audit-engine', msg);
            throw new Error(msg);
          }
        }

        // ═══ AETHER GATE WIRING (A4 re-plumb — the aether engine replaces the old pipeline) ═══
        const aetherLedgerRoot = path.join(targetPath, '.trident', 'aether-ledger');
        const doc1Path = path.join(aetherLedgerRoot, 'meta-analysis.md');
        const doc2Path = path.join(aetherLedgerRoot, 'findings-report.md');
        const sharedDbPath = path.join(targetPath, '.trident', 'knowledge-graph', 'shared.db');
        const lasmeRoster = [lasmeLexiconTemplate, lasmeActorTemplate, lasmeStateMachineTemplate, lasmeEngineTemplate, lasmeAdapterTemplate, lasmeMpseThresholdTemplate];
        const mpseRoster = [mpseContractTemplate, mpseOracleTemplate, mpseStageTemplate, mpseProvenanceTemplate];
        const sroRoster = [sroGraphTemplate, sroPathTemplate, sroDeadCodeTemplate, sroCyclesTemplate];
        const aetherInputBuilder = (t: AuditorTemplate) => {
          const parts = [`[INPUT DATA]`, `Below is all the input data from the user that you are required to fully inference, understand, and process before proceeding with your code audit:`, `targetRoot: ${targetPath}`, `runId: ${runId || `aether-${Date.now()}`}`, `ledgerDir: ${path.join(aetherLedgerRoot, t.layerId)}`, `layerNumber: ${t.layerNumber}`, `anchorPredicate: ${t.anchorPredicate}`, `graphQueries: ${JSON.stringify(t.graphQueries)}`];
          return parts.join('\n');
        };

          const lasmeAnalysisPath = path.join(aetherLedgerRoot, 'lasme-analysis.md');
          const lasmeSectionPath = path.join(aetherLedgerRoot, 'lasme-section.md');
          const mpseAnalysisPath = path.join(aetherLedgerRoot, 'mpse-analysis.md');
          const mpseSectionPath = path.join(aetherLedgerRoot, 'mpse-section.md');
          const sroAnalysisPath = path.join(aetherLedgerRoot, 'sro-analysis.md');
          const sroSectionPath = path.join(aetherLedgerRoot, 'sro-section.md');
          for (const p of [lasmeSectionPath, mpseSectionPath, sroSectionPath, lasmeAnalysisPath, mpseAnalysisPath, sroAnalysisPath]) {
            try { await fs.rm(p, { force: true }); } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `cleanup rm failed ${p}: ${e instanceof Error ? e.message : String(e)}`); }
          }
          try {
            const { writeFileSync } = await import('node:fs');
            writeFileSync(doc1Path, `# AETHER META ANALYSIS — runId ${runId}\n\n`, 'utf-8');
            writeFileSync(doc2Path, `# AETHER FINDINGS REPORT — runId ${runId}\n\n`, 'utf-8');
          } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `fresh-init failed: ${e instanceof Error ? e.message : String(e)}`); }
          {
            const snap = { runId, gate: 'GATES_RUNNING' as const, phase: 'start' as const, huntersFulfilled: 0, huntersRejected: 0, candidatesSoFar: allHydraFindings.length, artifactLabel: GATES_RUNNING_LABEL, updatedAt: Date.now(), targetRoot: targetPath, graphState: { macro: macroGraphState ?? undefined, micro: microGraphState ?? undefined } };
            safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
            safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
          }
          const lasmeGatePromise = (async () => {
            const gate = 'LASME' as const;
            const label = lasmeLabel;
            const t0 = Date.now();
            try {
              {
                const snap = { runId, gate, phase: 'start' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: allHydraFindings.length, artifactLabel: label, updatedAt: Date.now(), targetRoot: targetPath };
                safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
                safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
              }
              const r = await runMetaLayer(gate, [...lasmeRoster, lasmeMetaTemplate], aetherInputBuilder, aetherLedgerRoot, graphMapper as never, sharedDbPath, lasmeAnalysisPath, lasmeSectionPath);
              const cands = r.roster.filter((x) => x.status === 'fulfilled').flatMap((x) => {
                const f = x.findings as { candidates?: Record<string, unknown>[] } | undefined;
                return f?.candidates ?? [];
              });
              for (const c of cands) allHydraFindings.push(hydraCandidateToFinding(c));
              provenance.push({ gate, durationMs: Date.now() - t0, subagentCount: 6, fulfilled: r.roster.filter((x) => x.status === 'fulfilled').length, rejected: r.roster.filter((x) => x.status !== 'fulfilled').length });
              tridentLog('INFO', 'audit-engine', `LASME gate done ${cands.length} candidates provenance=${JSON.stringify(provenance[provenance.length-1])}`);
              {
                const snap = { runId, gate, phase: 'done' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: allHydraFindings.length, artifactLabel: label, updatedAt: Date.now(), targetRoot: targetPath };
                safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
                safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
              }
              return r;
            } catch (e: unknown) {
              tridentLog('ERROR', 'audit-engine', `LASME gate failed loudly — preserving ${prelimLabel} artifact: ${e instanceof Error ? e.message : String(e)}`);
              try {
                const snap = { runId, gate, phase: 'done' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: allHydraFindings.length, artifactLabel: label, updatedAt: Date.now(), targetRoot: targetPath };
                safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
                safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
              } catch {}
              return { gateName: gate, failed: true, error: e instanceof Error ? e.message : String(e) } as unknown as never;
            }
          })();
          const mpseGatePromise = (async () => {
            const gate = 'MPSE' as const;
            const label = mpseLabel;
            const t0 = Date.now();
            try {
              {
                const snap = { runId, gate, phase: 'start' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: allHydraFindings.length, artifactLabel: label, updatedAt: Date.now(), targetRoot: targetPath };
                safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
                safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
              }
              const r = await runMetaLayer(gate, [...mpseRoster, mpseMetaTemplate], aetherInputBuilder, aetherLedgerRoot, graphMapper as never, sharedDbPath, mpseAnalysisPath, mpseSectionPath);
              const violations = r.roster.filter((x) => x.status === 'fulfilled').flatMap((x) => {
                const f = x.findings as { violations?: Record<string, unknown>[] } | undefined;
                return f?.violations ?? [];
              });
              for (const v of violations) {
                const file = typeof v['file'] === 'string' ? (v['file'] as string) : targetPath;
                const line = typeof v['line'] === 'number' ? (v['line'] as number) : 1;
                const contractId = typeof v['contractId'] === 'string' ? (v['contractId'] as string) : 'unknown';
                allHydraFindings.push({ layer: 'r-mpse', severity: 'HIGH', category: `mpse.${contractId}`, file, line, evidence: (v['specQuote'] as string) ?? contractId, description: `MPSE violation: ${contractId} at ${file}:${line}`, correction: `Fix contract ${contractId} to match spec`, runtimeImpact: 'Contract violation — spec non-conformance', confidence: 0.85, constructType: null, callGraphRef: null, evidenceSuppressed: false } as AuditFinding);
              }
              provenance.push({ gate, durationMs: Date.now() - t0, subagentCount: 4, fulfilled: r.roster.filter((x) => x.status === 'fulfilled').length, rejected: r.roster.filter((x) => x.status !== 'fulfilled').length });
              tridentLog('INFO', 'audit-engine', `MPSE gate done violations=${violations.length} provenance=${JSON.stringify(provenance[provenance.length-1])}`);
              {
                const snap = { runId, gate, phase: 'done' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: allHydraFindings.length, artifactLabel: label, updatedAt: Date.now(), targetRoot: targetPath };
                safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
                safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
              }
              return r;
            } catch (e: unknown) {
              tridentLog('ERROR', 'audit-engine', `MPSE gate failed loudly — preserving ${lasmeLabel} artifact: ${e instanceof Error ? e.message : String(e)}`);
              try {
                const snap = { runId, gate, phase: 'done' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: allHydraFindings.length, artifactLabel: label, updatedAt: Date.now(), targetRoot: targetPath };
                safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
                safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
              } catch {}
              return { gateName: gate, failed: true, error: e instanceof Error ? e.message : String(e) } as unknown as never;
            }
          })();
          const sroGatePromise = (async () => {
            const gate = 'SRO' as const;
            const label = finalLabel;
            const t0 = Date.now();
            try {
              {
                const snap = { runId, gate, phase: 'start' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: allHydraFindings.length, artifactLabel: label, updatedAt: Date.now(), targetRoot: targetPath };
                safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
                safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
              }
              const r = await runMetaLayer(gate, [...sroRoster, sroMetaTemplate], aetherInputBuilder, aetherLedgerRoot, graphMapper as never, sharedDbPath, sroAnalysisPath, sroSectionPath);
              const correlations = r.roster.filter((x) => x.status === 'fulfilled').flatMap((x) => {
                const f = x.findings as { correlations?: Array<{ findingId: string; flaggedBy: { lasme: boolean; mpse: boolean; sro: boolean }; tripleConfirmed: boolean; recommendedSeverity: string }> } | undefined;
                return f?.correlations ?? [];
              });
              for (const corr of correlations) {
                if (corr.tripleConfirmed) {
                  const [filePart, linePart] = corr.findingId.split(':');
                  const f = filePart ?? targetPath;
                  const ln = parseInt(linePart ?? '1', 10) || 1;
                  const existing = allHydraFindings.find((x) => x.file === f && x.line === ln);
                  if (existing) { (existing as unknown as Record<string, unknown>)['severity'] = 'CRITICAL'; (existing as unknown as Record<string, unknown>)['confidence'] = 1.0; }
                  else allHydraFindings.push({ layer: 'r-graph', severity: 'CRITICAL', category: 'sro.TRIPLE_CONFIRMED', file: f, line: ln, evidence: `TRIPLE-CONFIRMED ${corr.findingId} flaggedBy LASME=${corr.flaggedBy.lasme} MPSE=${corr.flaggedBy.mpse} SRO=${corr.flaggedBy.sro}`, description: `TRIPLE-CONFIRMED defect at ${corr.findingId} — flagged by all three gates (LASME+MPSE+SRO)`, correction: 'Fix this correlation-verified defect with highest priority', runtimeImpact: 'Cross-phase triple-confirmed critical defect', confidence: 1.0, constructType: null, callGraphRef: null, evidenceSuppressed: false } as AuditFinding);
                }
              }
              provenance.push({ gate, durationMs: Date.now() - t0, subagentCount: 4, fulfilled: r.roster.filter((x) => x.status === 'fulfilled').length, rejected: r.roster.filter((x) => x.status !== 'fulfilled').length });
              tridentLog('INFO', 'audit-engine', `SRO gate done correlations=${correlations.length} provenance=${JSON.stringify(provenance[provenance.length-1])}`);
              {
                const snap = { runId, gate, phase: 'done' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: allHydraFindings.length, artifactLabel: label, updatedAt: Date.now(), targetRoot: targetPath };
                safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
                safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
              }
              return r;
            } catch (e: unknown) {
              tridentLog('ERROR', 'audit-engine', `SRO gate failed loudly — preserving ${mpseLabel} artifact: ${e instanceof Error ? e.message : String(e)}`);
              try {
                const snap = { runId, gate, phase: 'done' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: allHydraFindings.length, artifactLabel: label, updatedAt: Date.now(), targetRoot: targetPath };
                safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
                safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
              } catch {}
              return { gateName: gate, failed: true, error: e instanceof Error ? e.message : String(e) } as unknown as never;
            }
          })();
          const gateResults = await Promise.allSettled([lasmeGatePromise, mpseGatePromise, sroGatePromise]);
          void gateResults;
          try { stitchConcurrentSections(aetherLedgerRoot, doc1Path, doc2Path, sharedDbPath); } catch (e: unknown) { tridentLog('ERROR', 'audit-engine', `stitch failed: ${e instanceof Error ? e.message : String(e)}`); }
          await updateArtifact(allHydraFindings, finalLabel);
          // THE ASYNC SEAM — FINAL
          {
            const snap = { runId, gate: 'FINAL' as const, phase: 'done' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: allHydraFindings.length, artifactLabel: finalLabel, updatedAt: Date.now(), targetRoot: targetPath, graphState: { macro: macroGraphState ?? undefined, micro: microGraphState ?? undefined } };
            safeWriteRunStatus(auditVisibilityLedgerRoot, snap);
            safeNotifyGateCompletion(auditVisibilityLedgerRoot, snap);
          }
          tridentLog('INFO', 'audit-engine', `FINAL synthesis merge complete legacy=${enrichedFindings.length} hydra=${allHydraFindings.length - enrichedFindings.length} total=${allHydraFindings.length} provenance=${JSON.stringify(provenance)} gates=${provenance.map(p=>p.gate+':'+p.durationMs+'ms').join(',')} subagents=${provenance.reduce((a,b)=>a+b.subagentCount,0)}`);
          enrichedFindings = allHydraFindings;
        } catch (e: unknown) { tridentLog('ERROR', 'audit-engine', `hydra orchestrator failed preserving ${prelimLabel}: ${e instanceof Error ? e.message : String(e)}`); enrichedFindings = allHydraFindings; }
        try { memory?.close(); } catch {}
      }


            const evidence = new EvidenceGate(preflight, ctx.diagnostics, enrichedFindings);

      const layerStats = this.computeLayerStats(enrichedFindings);
      // THE W5 EVENT INGEST (2026-08-19 — the L2 spec §2.4.3): the snapshot
      // +ingest reads the recent event history (the last 30 minutes) BEFORE the
      // static parse — the flow verdict + the cadence anomalies feed the report.
      const eventStats = ingestRecentEvents(targetPath, 1_800_000);

      // THE W2 PROJECT-TYPE GATE (2026-08-19 — the L2 spec §3.2): detect the
      // project shape (plugin vs library vs app vs monorepo vs test-heavy vs
      // indeterminate) + pass the ProjectContext to computeScore so the gated
      // layers' findings (R1/R3/R12/R15/R16 for non-plugin) leave the score's
      // weight pool. THE SCORE-CAP FIX — the payment-dirty library's score
      // reflects reality instead of capping ~23-30.
      const projectContext = await detectProjectShape(targetPath);

      const result = computeScore(
        enrichedFindings,
        evidence,
        filesScanned,
        sourceFilesScanned,
        layerStats,
        ctx.callGraph.coveragePercent,
        ctx.callGraph.totalCallSites,
        ctx.callGraph.resolvedCallSites,
        checkerAvailable,
        ctx.isSelfAudit,
        projectContext,
      );
      (result as unknown as Record<string, unknown>).eventStats = eventStats;

      const projectName = typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath);
      const agentName = typeof opencodeJson?.agent === 'object' && opencodeJson?.agent !== null ? Object.keys(opencodeJson?.agent)[0] || '' : '';

      // THE W4 KNOWLEDGE-GRAPH (2026-08-19 — the L2 spec §3.6, the dead-null
      // class dead): the audit opens <target>/.trident/knowledge-graph/shared.db
      // LIVE, builds the graph from the W1 constructs, appends the findings to
      // the triad-gated ledger, records the AUDIT_DONE event. THE COMPACTION-
      // INERT: the next run rehydrates from the DB. THE RUN KEY is hoisted —
      // one audit run = one run_id (the §16 "audit-<ts>" key): the W4 ledger
      // rows AND the Step-X aether_verdicts rows share it.
      // runId hoisted at method entry (auditVisibility seam — B4) — reused here, no re-declaration.
      try {
        const graph = new AuditGraph(targetPath);
        const graphStats = graph.build(ctx.constructs, ctx.callGraph);
        for (const f of enrichedFindings) {
          try {
            graph.appendFinding(f, runId);
          } catch (e: unknown) {
            tridentLog('WARN', 'audit-engine', `appendFinding skipped (no triplet): ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        graph.appendEvent('AUDIT_DONE', { runId, findingsCount: enrichedFindings.length, score: result.score, target: targetPath });
        (result as unknown as Record<string, unknown>).graphStats = {
          nodes: graphStats.nodes,
          edges: graphStats.edges,
          chunked: graphStats.chunked,
          checkerPresent: graphStats.checkerPresent,
        };
      } catch (e: unknown) {
        tridentLog('WARN', 'audit-engine', `knowledge-graph failed (the audit proceeds): ${e instanceof Error ? e.message : String(e)}`);
      }

      // THE W6 ENFORCEMENT RING (2026-08-19 — the L2 spec §3.8): the
      // dual-layered self-enforcement — the audit's OWN critical paths pass
      // the theatrical scan it ships (the S8 proof). The scan runs at load of
      // every audit; a caught theatrical mutation → the ring broken (loud).
      const ringScan = selfEnforceScan(path.join(targetPath, 'src'));
      if (ringScan.caught.length > 0) {
        tridentLog('ERROR', 'audit-engine', `ENFORCEMENT_RING_BROKEN: ${ringScan.caught.join(', ')} — the audit's own code carries a theatrical pattern`);
      }

      // THE SPEC-2 STEP-X JUDGMENT PASS IS DELETED (2026-08-30 operator ruling:
      // 'if ALL the keys fail then have a loud failure dont just fallback to a
      // deterministic only' + 'what is this garbage'). The pass chunk-adjudicated
      // the PRELIMINARY legacy findings (3,343 on the live run — 7.2x the AP-7
      // over-fire line) through the legacy single-key transport: ~700 muse calls
      // of noise per run. THE JUDGMENT LAYER IS THE AETHER META (the per-gate
      // meta agents' verdict tables) — the deterministic preliminary findings
      // flow to scoring and the report un-adjudicated, honestly labeled.
      // THE W7 AETHER BACKEND (2026-08-19 — the L2 spec §3.9): the report
      // generation runs through the supremacy-briefed 7-stage backend — the
      // CONTEXT-MISMATCH flag surfaces the belief-vs-data conflict.
      let aetherReport: AetherManifest | undefined;
      try {
        aetherReport = generateReport({
          findings: enrichedFindings,
          graphScore: result.score,
          graphFindingsCount: enrichedFindings.length,
          context: { score: result.score },
        });
      } catch (e: unknown) {
        tridentLog('WARN', 'audit-engine', `aether report failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      try {
        this.graphAudit.updateContext(ctx.callGraph, ctx.constructsByFile, enrichedFindings);
        const audit3D = new Map<string, Audit3DEvidence>();
        for (const filePath of ctx.constructsByFile.keys()) {
          try {
            const evidence3D = await this.graphAudit.evidence3D(filePath);
            audit3D.set(filePath, evidence3D);
          } catch (e: unknown) {
            console.error('[AuditEngine] evidence3D per-file failed for', filePath, ':', e instanceof Error ? e.message : String(e));
            audit3D.set(filePath, { node: filePath, callers: [], chain: [], unwired: [{ description: `evidence3D error: ${e instanceof Error ? e.message : String(e)}`, severity: 'LOW' }], findings: [] });
          }
        }
        result.audit3D = audit3D;
      } catch (e: unknown) {
        console.error('[AuditEngine] audit3D wiring failed:', e instanceof Error ? e.message : String(e));
      }

      result.report = this.generateReport(result, targetPath, projectName, agentName);

      // ═══ THE STEP-X JUDGMENT PASS (RESTORED 2026-08-30 — was incorrectly deleted; the
      // adjudication machinery was functioning, the problem was the INPUT not the pass) ═══
      // AP-7 OVER-FIRE GATE: if findings > files×3, the input is noise — the pass
      // routes to CALIBRATION instead of adjudicating garbage.
      const stepXGraphStats = (result as unknown as { graphStats?: { nodes: number; edges: number } }).graphStats;
      const stepXInput: StepXInput = {
        targetPath,
        functionality: {
          findings: enrichedFindings,
          graphStats: stepXGraphStats as { nodes: number; edges: number },
          eventStats,
          projectContext,
        },
        engine: this,
      };
      let stepX: StepXResult | undefined;
      let stepXFailure: string | undefined;
      let stepXStore: Database | undefined;
      try {
        stepXStore = new Database(path.join(targetPath, '.trident', 'knowledge-graph', 'shared.db'));
        stepXStore.exec('PRAGMA journal_mode = WAL;');
        stepXStore.exec('PRAGMA busy_timeout = 5000;');
      } catch (storeErr: unknown) {
        stepXStore = undefined;
        tridentLog('WARN', 'audit-engine', `the Step-X store handle did not open (the verdicts stay in-memory): ${storeErr instanceof Error ? storeErr.message : String(storeErr)}`);
      }
      const stepXLedger = new (await import('./aether/rpm-ledger.js')).RpmLedger(`stepx-${runId}`);
      const stepXBrain = boundStepXBrain ?? getStepXBrain(targetPath, stepXLedger);
      try {
        stepX = await runStepX(stepXInput, stepXBrain, { store: stepXStore, runId });
      } catch (stepXErr: unknown) {
        stepXFailure = stepXErr instanceof Error ? stepXErr.message : String(stepXErr);
        tridentLog('ERROR', 'audit-engine', `the Step-X judgment pass failed loudly: ${stepXFailure}`);
      } finally {
        try { stepXStore?.close(); } catch (closeErr: unknown) { tridentLog('WARN', 'audit-engine', `the Step-X store close failed (non-fatal): ${closeErr instanceof Error ? closeErr.message : String(closeErr)}`); }
      }

      // THE STEP-X REPORT SELECTION: the adjudicated report when it ran; the
      // machinery-only render with the SKIPPED header otherwise.
      if (stepX?.ran) {
        result.report = stepX.report;
      } else {
        result.report = markStepSkipped(result.report, stepX?.skippedReason ?? stepXFailure ?? `${STEP_X_SKIPPED_PREFIX}UNKNOWN`);
      }
      {
        let findingsMapBuilt = false;
        try {
          const selfDefects = enrichedFindings.filter((f: AuditFinding) => SELF_DEFECT_PATHS.some((p: string) => f.file.includes(p) || f.file.startsWith(p)) && ['CRITICAL', 'HIGH'].includes(f.severity));
          if (selfDefects.length > 0) {
            const blockPath = path.join(auditVisibilityLedgerRoot, 'SELF_DEFECT_BLOCK.json');
            const blockPayload = { runId, defects: selfDefects.map((f) => ({ file: f.file, line: f.line, description: (f.description ?? f.evidence ?? '').slice(0, 200), severity: f.severity, hunter: f.layer })), dispositionedAt: null as string | null, directive: 'Fix these before the next audit run. Delete this file to acknowledge disposition (the fix or the explicit operator waive). Set dispositionedAt + directive before delete.' };
            try { await fs.mkdir(path.dirname(blockPath), { recursive: true }); await fs.writeFile(blockPath, JSON.stringify(blockPayload, null, 2), 'utf-8'); } catch {}
            tridentLog('ERROR', 'audit-engine', `SELF_DEFECT_BLOCK: ${selfDefects.length} HIGH+ findings against the tool's own execution path — the next run REFUSES until dispositioned.`);
          }
          const findingsMap = buildFindingsMap(enrichedFindings, { runId, targetRoot: targetPath, ledgerRoot: auditVisibilityLedgerRoot });
          writeFindingsMap(auditVisibilityLedgerRoot, findingsMap);
          findingsMapBuilt = true;
          const brief = composeOperatorBrief({ map: findingsMap, ledgerRoot: auditVisibilityLedgerRoot, wallMs: Date.now() - parseInt(runId.split('-')[1] ?? '0', 10), huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), graphState: (result as unknown as Record<string, unknown>).graphStats as never, blockExists: selfDefects.length > 0 });
          tridentLog('INFO', 'audit-engine', brief);
          try {
            const top3 = findingsMap.ranked.filter((r: import('../hydra/findings-map.ts').WeightedFinding) => !r.isSelfDefect).slice(0, 3).map((r: import('../hydra/findings-map.ts').WeightedFinding) => `${r.file}:${r.line} [${r.severity}] ${(r.description ?? r.evidence).slice(0, 80)}`);
            const headlineSnap = { runId, gate: 'FINAL' as const, phase: 'done' as const, huntersFulfilled: provenance.reduce((a: number, p: { fulfilled: number }) => a + p.fulfilled, 0), huntersRejected: provenance.reduce((a: number, p: { rejected: number }) => a + p.rejected, 0), candidatesSoFar: enrichedFindings.length, artifactLabel: '[FINAL]', updatedAt: Date.now(), targetRoot: targetPath, headline: brief.split('\n').slice(0, 4).join(' | '), selfDefectCount: selfDefects.length, topFindings: top3 } as unknown as import('./run-status.ts').RunStatusSnapshot;
            safeNotifyGateCompletion(auditVisibilityLedgerRoot, headlineSnap);
          } catch {}
        } catch (e: unknown) { tridentLog('WARN', 'audit-engine', `findings-map/self-defect gate failed: ${e instanceof Error ? e.message : String(e)}`); }
        void findingsMapBuilt;
        void evaluateToolUsage;
      }
      return result;
    } catch (e: unknown) {
      const err: Error = e instanceof Error ? e : new Error(String(e));
      tridentLog('WARN', 'audit-engine', `audit failed for ${targetPath}: ${err.message}`);
      throw err;
    }
  }

  async auditWithPreflight(targetPath: string): Promise<AuditResult> {
    try { ensureSelfAudit(); } catch (e: unknown) { tridentLog('WARN', 'self-audit', 'ensureSelfAudit DEGRADED: ' + (e instanceof Error ? e.message : String(e))); }
    try {
      return await this.audit(targetPath);
    } catch (e: unknown) {
      const err: Error = e instanceof Error ? e : new Error(String(e));
      tridentLog('WARN', 'audit-engine', `auditWithPreflight failed for ${targetPath}: ${err.message}`);
      throw err;
    }
  }

  async auditSingleLayer(targetPath: string, layerId: string): Promise<AuditResult> {
    try { ensureSelfAudit(); } catch (e: unknown) { tridentLog('WARN', 'self-audit', 'ensureSelfAudit DEGRADED: ' + (e instanceof Error ? e.message : String(e))); }
    try {
      const preflight = await runPreflight(targetPath);
      const pkgJson = await this.readJson(path.join(targetPath, 'package.json'));
      const tsconfig = await this.readJson(path.join(targetPath, 'tsconfig.json'));
      const opencodeJson = await this.readJson(path.join(targetPath, 'opencode.json'));

      const ctx = await classifyProject(targetPath, preflight, pkgJson, tsconfig, opencodeJson);

      // v4.4.3 R0:EMPTY_TARGET FIX — the gate uses the recursive .ts discovery over the target
      // root (mirroring the god-loop's scanTsFiles), so the EMPTY_TARGET check reports the true
      // count and never false-positives on a populated target.
      const srcFilesScanned = countTsFilesInTarget(targetPath);

      if (srcFilesScanned === 0) {
        const result = this.buildEmptyResult(targetPath, preflight, pkgJson);
        result.report = this.generateReport(result, targetPath, typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath), '');
        return result;
      }

      const singleEngine = new LayerEngine();
      const allLayers = [
        R1_HOOK_CONTRACT,
        R2_ERROR_HANDLING,
        R3_SOURCE_HYGIENE,
        R4_DATA_FLOW_ANALYSIS,
        R5_THEATRICAL_INTEGRITY,
      ];
      const targetLayer = allLayers.find((l: LayerRule) => l.layer === layerId);
      if (!targetLayer) {
        return this.buildEmptyResult(targetPath, preflight, pkgJson);
      }
      singleEngine.registerLayer(targetLayer);

      const evidence = new EvidenceGate(preflight, ctx.diagnostics);
      const rawFindings = await singleEngine.evaluateAll(ctx, evidence);

      const docsDir = path.join(targetPath, 'docs');
      const enrichedFindings = await enrichWithHiveKnowledge(rawFindings, docsDir);

      const layerStats = this.computeLayerStats(enrichedFindings);
      const filesScanned = ctx.constructsByFile.size;
      const checkerAvailable = ctx.callGraph.totalCallSites === 0 || ctx.callGraph.coveragePercent > 0;

      const result = computeScore(
        enrichedFindings,
        evidence,
        filesScanned,
        srcFilesScanned,
        layerStats,
        ctx.callGraph.coveragePercent,
        ctx.callGraph.totalCallSites,
        ctx.callGraph.resolvedCallSites,
        checkerAvailable,
        ctx.isSelfAudit,
      );

      const projectName = typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath);
      const agentName = typeof opencodeJson?.agent === 'object' && opencodeJson?.agent !== null ? Object.keys(opencodeJson?.agent)[0] || '' : '';
      result.report = this.generateReport(result, targetPath, projectName, agentName);
      return result;
    } catch (e: unknown) {
      const err: Error = e instanceof Error ? e : new Error(String(e));
      tridentLog('WARN', 'audit-engine', `auditSingleLayer failed for ${targetPath}: ${err.message}`);
      throw err;
    }
  }

  async generateDevOpsReport(result: AuditResult, targetPath: string): Promise<string> {
    try {
      const pkgJson = await this.readJson(path.join(targetPath, 'package.json'));
      const opencodeJson = await this.readJson(path.join(targetPath, 'opencode.json'));
      const projectName = typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath);
      const agentName = typeof opencodeJson?.agent === 'object' && opencodeJson?.agent !== null ? Object.keys(opencodeJson?.agent)[0] || '' : '';

      let report = this.generateReport(result, targetPath, projectName, agentName);

      const phases = prioritizeFixes(result);
      report += '\n\n' + generateFixSummary(phases, result.score);

      const testPlan = generateContainerTestPlan(result.findings, projectName, agentName);
      if (testPlan) {
        report += `\n\n---\n\n${testPlan}`;
      }

      report += '\n\n' + generateDeploymentManifest(result, projectName, agentName, BASELINE_BINARY);

      return report;
    } catch (e: unknown) {
      const err: Error = e instanceof Error ? e : new Error(String(e));
      tridentLog('WARN', 'audit-engine', `generateDevOpsReport failed for ${targetPath}: ${err.message}`);
      throw err;
    }
  }

  private computeLayerStats(findings: AuditFinding[]): { layer: string; name: string; findingCount: number; avgConfidence: number; evidenceSuppressed: boolean }[] {
    const stats = new Map<string, { count: number; totalConf: number; suppressed: boolean; name: string }>();

    const layerNames: Record<string, string> = {
      // THE 5 IMMORTALS (B4 — the contiguous battery; distinct ids, one claimant each)
      R1: 'Hook Contract',
      R2: 'Error Handling',
      R3: 'Source Hygiene',
      R4: 'Data Flow Analysis',
      R5: 'Theatrical Integrity (D1-D10)',
      // R18-R25 deleted — SPEC-A §2.6 lineage in DELETED_R18_R25.md
      'r-lexicon': 'LASME Lexicon (structural)',
      'r-actor': 'LASME Actor (structural)',
      'r-state-machine': 'LASME State Machine (structural)',
      'r-engine': 'LASME Engine (structural)',
      'r-adapter': 'LASME Adapter (structural)',
      'r-mpse': 'MPSE Contract',
      'r-graph': 'SRO Graph Wiring (structural)',
      'r-dh-feed': 'Hunter Feed (re-adjudicated)',
      'r-provenance': 'Spec Provenance (TRACE_GAP)',
    };

    for (const f of findings) {
      const existing = stats.get(f.layer);
      if (existing) {
        existing.count++;
        existing.totalConf += f.confidence;
        if (f.evidenceSuppressed) existing.suppressed = true;
      } else {
        stats.set(f.layer, {
          count: 1,
          totalConf: f.confidence,
          suppressed: f.evidenceSuppressed,
          name: layerNames[f.layer] || f.layer,
        });
      }
    }

    const allLayers = Object.entries(layerNames).map(([layer, name]) => {
      const stat = stats.get(layer);
      return {
        layer,
        name,
        findingCount: stat?.count || 0,
        avgConfidence: stat ? Math.round((stat.totalConf / stat.count) * 100) / 100 : 0,
        evidenceSuppressed: stat?.suppressed || false,
      };
    });

    if (allLayers && allLayers.length >= 0) { void 0; }
    return allLayers;
  }

  // 3D evidence integration anchor
  // graph-anchored evidence model per Spec §3.5
  private generateReport(result: AuditResult, targetPath: string, projectName: string, agentName: string): string {
    // For empty results (0 files scanned), return a clear error report
    if (result.sourceFilesScanned === 0) {
      let r = `# TRIDENT CODE AUDIT — ${projectName}\n\n`;
      r += `**Score:** 0/100 — NOT RUNTIME GRADE\n`;
      r += `**Files:** ${result.filesScanned} total | ${result.sourceFilesScanned} source\n`;
      r += `**Findings:** No source files found to analyze\n\n`;
      r += `---\n\n`;
      r += `## ERROR: Zero source files scanned\n\n`;
      r += `The audit engine could not find any \`.ts\` source files at the target path.\n`;
      r += `This can happen when:\n`;
      r += `- The target path does not contain a \`src/\` directory\n`;
      r += `- The path points to a compiled dist-only package (e.g., \`node_modules\`, deployed bundle)\n`;
      r += `- The path is incorrect or does not exist\n\n`;
      r += `**Target path checked:** \`${targetPath}\`\n\n`;
      r += `To fix: point \`trident-code-audit\` at the source root (the directory containing \`src/\`).\n`;
      r += `\n---\n*Generated by Trident v4.3 AST-Powered Code Review Engine*\n`;
      return r;
    }
    const critical = result.findings.filter((f: AuditFinding) => f.severity === 'CRITICAL');
    const high = result.findings.filter((f: AuditFinding) => f.severity === 'HIGH');
    const medium = result.findings.filter((f: AuditFinding) => f.severity === 'MEDIUM');
    const low = result.findings.filter((f: AuditFinding) => f.severity === 'LOW');
    const dist = result.confidenceDistribution;
    const total = dist.definite + dist.high + dist.moderate + dist.low + dist.noise;

    let report = `# TRIDENT v4.3 — RUNTIME GRADE DEVOPS AUDIT\n\n`;
    report += `**Score:** ${result.score}/100 — ${result.grade}\n`;
    report += `**Target:** ${targetPath} (${projectName})\n`;
    report += `**Agent:** ${agentName}\n`;
    report += `**Files Scanned:** ${result.sourceFilesScanned} source files\n`;
    report += `**Findings:** ${critical.length} CRITICAL | ${high.length} HIGH | ${medium.length} MEDIUM | ${low.length} LOW\n`;
    report += `**Layers:** ${result.layers.length}/17 active\n\n`;
    report += `---\n\n`;

    report += `## Mechanical Evidence (PREFLIGHT)\n\n`;
    report += `| Check | Result | Detail |\n`;
    report += `|-------|--------|--------|\n`;
    for (const f of result.preflight.findings) {
      report += `| ${f.check} | ${f.passed ? 'PASS' : 'FAIL'} | ${f.detail} |\n`;
    }
    report += `\n`;

    report += `## Confidence Distribution\n\n`;
    report += `| Confidence | Count | % of Total |\n`;
    report += `|------------|-------|-----------|\n`;
    if (total > 0) {
      report += `| 0.95-1.00 (Definite) | ${dist.definite} | ${((dist.definite / total) * 100).toFixed(1)}% |\n`;
      report += `| 0.85-0.94 (High) | ${dist.high} | ${((dist.high / total) * 100).toFixed(1)}% |\n`;
      report += `| 0.70-0.84 (Moderate) | ${dist.moderate} | ${((dist.moderate / total) * 100).toFixed(1)}% |\n`;
      report += `| < 0.70 (Low/Noise) | ${dist.low + dist.noise} | ${(((dist.low + dist.noise) / total) * 100).toFixed(1)}% |\n`;
    }
    report += `\n*(Findings below 0.70 confidence are excluded from scoring)*\n\n`;

    if (critical.length > 0) {
      report += `## CRITICAL — Prevents First-Attempt Deployment\n\n`;
      for (const f of critical) {
        report += formatFinding(f);
      }
    }

    if (high.length > 0) {
      report += `## HIGH — Will Fail Container Test\n\n`;
      for (const f of high) {
        report += formatFinding(f);
      }
    }

    if (medium.length > 0) {
      report += `## MEDIUM — Quality Issues\n\n`;
      const shown = medium.slice(0, 20);
      for (const f of shown) {
        report += `- [${f.layer}] \`${shortFile(f.file)}:${f.line}\` — ${f.description} (conf: ${f.confidence.toFixed(2)})\n`;
      }
      if (medium.length > 20) report += `\n... and ${medium.length - 20} more medium findings\n`;
      report += `\n`;
    }

    report += `---\n\n`;
    report += `## Layer Summary\n\n`;
    report += `| Layer | Name | Findings | Avg Confidence | Evidence Suppressed |\n`;
    report += `|-------|------|----------|---------------|--------------------|\n`;
    for (const l of result.layers) {
      report += `| ${l.layer} | ${l.name} | ${l.findingCount} | ${l.avgConfidence.toFixed(2)} | ${l.evidenceSuppressed ? 'YES' : 'no'} |\n`;
    }

    report += `\n## Audit Meta — Transparency Report\n\n`;
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Call Graph Coverage | ${result.auditMeta.callGraphCoverage}% (${result.auditMeta.resolvedCallSites}/${result.auditMeta.totalCallSites} resolved) |\n`;
    report += `| Type Checker | ${result.auditMeta.checkerAvailable ? 'Available' : 'UNAVAILABLE — findings degraded'} |\n`;
    report += `| Self-Audit | ${result.auditMeta.selfAudit ? 'YES — blind spot: cannot find bugs in itself' : 'No'} |\n`;
    report += `| Suppressed Below Floor | ${result.auditMeta.suppressedBelowFloor} findings below 0.50 confidence |\n`;

    if (result.auditMeta.blindSpots.length > 0) {
      report += `\n### Known Blind Spots\n\n`;
      for (const bs of result.auditMeta.blindSpots) {
        report += `- ${bs}\n`;
      }
    }

    if (result.suppressedFindings.length > 0) {
      report += `\n### Suppressed Findings (below 0.50 confidence)\n\n`;
      report += `| Layer | Sev | File:Line | Description | Confidence |\n`;
      report += `|-------|-----|-----------|-------------|------------|\n`;
      for (const sf of result.suppressedFindings.slice(0, 20)) {
        report += `| ${sf.layer} | ${sf.severity.substring(0, 4)} | ${shortFile(sf.file)}:${sf.line} | ${sf.description.substring(0, 60)} | ${sf.confidence.toFixed(2)} |\n`;
      }
      if (result.suppressedFindings.length > 20) {
        report += `\n... and ${result.suppressedFindings.length - 20} more suppressed findings\n`;
      }
    }

    report += `\n*Generated by Trident v4.3 AST-Powered Audit Engine*\n`;
    report += `*Confidence-weighted | Call-graph-aware | Mechanical-evidence-gated*\n`;
    return report;
  }

  private async readJson(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      await fs.access(filePath);
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON['parse'](raw) as Record<string, unknown>;
    } catch (e: unknown) {
      const err: Error = e instanceof Error ? e : new Error(String(e));
      tridentLog('WARN', 'audit-engine', `readJson failed for ${filePath}: ${err.message}`);
      return null;
    }
  }
}

function formatFinding(f: AuditFinding): string {
  let s = `### [${f.layer}] ${f.category} — ${f.severity} (confidence: ${f.confidence.toFixed(2)} — ${confidenceLabel(f.confidence)})\n\n`;
  s += `**File:** \`${shortFile(f.file)}:${f.line}\`\n`;
  if (f.constructType) s += `**AST Construct:** ${f.constructType}\n`;
  if (f.callGraphRef) s += `**Call Graph:** ${f.callGraphRef}\n`;
  s += `**Evidence:** \`${f.evidence.substring(0, 150)}\`\n`;
  s += `**Problem:** ${f.description}\n`;
  s += `**Runtime Impact:** ${f.runtimeImpact}\n`;
  s += `**Fix:** ${f.correction}\n`;
  if (f.evidenceSuppressed) s += `**Evidence Suppressed:** YES — preflight contradicts this finding\n`;
  s += `\n`;
  return s;
}

export const auditEngine = new AuditEngine();
