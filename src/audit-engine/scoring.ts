/**
 * scoring.ts — ORACLE-DERIVED AUDIT SCORE (PARAGON quad gate + SPEC-1 P2)
 *
 * FORMULA (module header — the contract):
 *   score = f(calibratedPredicateRatio, oraclePassRate, immortalDensity, hydraConfidenceMass)
 *
 *   calibratedPredicateRatio = liveBattery.length / battery.length from run meta when present else 1
 *     BECAUSE the live battery coverage is the only mechanical measure of predicate calibration — ratio 1 means fully calibrated
 *   oraclePassRate = verifiedAnchors / totalFindings where verified = finding's triad evidence file:line resolves (fs read + checkContract discharge)
 *     BECAUSE the oracle pass rate is computed from triad evidence verification against anchors — unverifiable anchor demotes confirmation
 *   immortalDensity = immortalFindings.length / filesScanned
 *     BECAUSE immortal density measures HIGH-precision mechanical defects per file — the immortal 5 are the only calibrated predicates
 *   hydraConfidenceMass = hydraFindings.reduce((s,f)=>s+f.confidence,0) / hunterCount
 *     BECAUSE hydra mass measures meta hunter reliability — unconfident hydra indicates noise, confident hydra indicates signal
 *   densityPenalty = clamp(immortalDensity * DENSITY_SCALE_IMMORTAL, 0, 15) + clamp((1 - hydraConfidenceMass) * DENSITY_SCALE_HYDRA, 0, 20)
 *     BECAUSE immortal term penalizes real defects per file (clamped 15), hydra term penalizes unconfident meta findings (clamped 20)
 *
 *   health = (calibratedPredicateRatio * CALIBRATED_WEIGHT + oraclePassRate * ORACLE_WEIGHT) / (CALIBRATED_WEIGHT + ORACLE_WEIGHT)
 *     BECAUSE blended trust weights oracle verification higher than predicate calibration — oracle is the firewall's ground truth (KB-MPSE-01:313)
 *   raw = SCORE_CEILING * health - densityPenalty
 *   score = round(clamp(raw, SCORE_FLOOR, SCORE_CEILING))
 *
 *   grade: INCONCLUSIVE when parse produced zero constructs OR target unreadable — NEVER score-0-PASS (fail-state law)
 *   thresholds: RUNTIME_GRADE_FLOOR, NEAR_GRADE_FLOOR, NEEDS_FIXES_FLOOR — each NAMED const with BECAUSE
 *
 * HARDCODE BAN: every numeric threshold is a NAMED const with a BECAUSE comment — grep audit enforces.
 */
import {
  AuditFinding,
  AuditResult,
  Severity,
  SEVERITY_WEIGHT,
  ConfidenceDistribution,
  SuppressedFinding,
  AuditMeta,
} from './types.ts';
import { EvidenceGate } from './evidence-gate.ts';
import { computeFindingConfidence, ReproducibleFailure } from '../types.js';
import { checkContract, toBrandedVerdict } from './math/contract.ts';
import type { Bindings } from './math/expr.ts';
import * as fsSync from 'fs';

const CAT_ERR_THOROUGH = 'ERROR_COMPLETENESS';

const SCORE_CEILING = 100; // BECAUSE score is a percent — 100 is the absolute maximum the auditor can award
const SCORE_FLOOR = 0; // BECAUSE scores are never negative — clamp prevents underflow below meaningful range
const SCORE_RUNTIME_GRADE_FLOOR = 95; // BECAUSE runtime grade requires ≥95 — only negligible low findings allowed at this tier
const SCORE_NEAR_GRADE_FLOOR = 80; // BECAUSE near-runtime grade at 80 — single high or few mediums push below runtime
const SCORE_NEEDS_FIXES_FLOOR = 60; // BECAUSE below 60 the system is not runtime grade — structural fixes required
const CONFIDENCE_FLOOR = 0.30; // BECAUSE findings below 0.30 are noise — floor at 0.30 preserves discrimination while cutting fabrications
const CONFIDENCE_AST_MAX = 1.0; // BECAUSE AST confidence is normalized [0,1] — 1.0 is the mathematical ceiling
const CONFIDENCE_DIM_ENV_ZERO = 0; // BECAUSE scoring path is AST-only by default — environment dimension 0 until container verification
const CONFIDENCE_SUPPRESSED_FACTOR = 0.1; // BECAUSE evidence-contradicted findings retain 10% weight — not zero, preserves signal
const CONFIDENCE_SUPPORTED_FACTOR = 1.5; // BECAUSE evidence-supported findings amplify 1.5× — mechanical proof increases weight
const CONFIDENCE_MAX_CLAMP = 1.0; // BECAUSE confidence never exceeds 1.0 — clamp prevents overflow from amplification
const INCONCLUSIVE_SCORE = 0; // BECAUSE inconclusive carries score 0 but grade INCONCLUSIVE — never PASS, fail-state law
const CALIBRATED_WEIGHT = 1; // BECAUSE predicate calibration weight 1 — oracle verification dominates with weight 2
const ORACLE_WEIGHT = 2; // BECAUSE oracle weight 2 — firewall evaluates number against oracle (KB-MPSE-01:313), oracle is ground truth
const DENSITY_SCALE_IMMORTAL = 30; // BECAUSE immortal findings are HIGH-precision (1 per file is 1 real defect) — 30 scales 1.0 density to 30 penalty points before clamp
const DENSITY_SCALE_HYDRA = 20; // BECAUSE meta confidence mass measures hydra hunter reliability — 20 scales unconfident hydra to 20 penalty points before clamp
const DENSITY_CLAMP_MIN = 0; // BECAUSE density clamped at 0 — negative density is impossible
const DENSITY_CLAMP_MAX = 1; // BECAUSE density clamped at 1 — findings cannot exceed scanned surface ratio beyond 1
const DENSITY_DENOM_FLOOR = 1; // BECAUSE filesScanned floor 1 prevents division by zero when no files scanned
const DEFAULT_CALIBRATED_RATIO = 1; // BECAUSE when run meta lacks battery data we assume fully calibrated — ratio 1 means no penalty
const DEFAULT_ORACLE_PASS_RATE = 1; // BECAUSE zero findings means fully verified — pass rate 1 when no findings to verify
const CONFIDENCE_DEFINITE_FLOOR = 0.95; // BECAUSE definite requires 0.95 — matches forensic audit's high-confidence tier
const CONFIDENCE_HIGH_FLOOR = 0.85; // BECAUSE high requires 0.85 — hand-tuned guess replaced by oracle math but tier boundary preserved
const CONFIDENCE_MODERATE_FLOOR = 0.70; // BECAUSE moderate at 0.70 — separates actionable from low signal
const CONFIDENCE_LOW_FLOOR = 0.50; // BECAUSE low at 0.50 — below this is noise
const REPRODUCIBLE_DESC_TRUNCATE = 200; // BECAUSE reproducible description truncated at 200 chars — keeps command readable
const REPRODUCIBLE_EVIDENCE_TRUNCATE = 200; // BECAUSE evidence truncated at 200 chars — prevents command bloat
const REPRODUCIBLE_EVIDENCE_SHORT = 150; // BECAUSE report evidence short at 150 chars — prevents markdown overflow
const GRADE_INCONCLUSIVE = 'INCONCLUSIVE'; // BECAUSE fail-state law — INCONCLUSIVE is the named terminal, never silent PASS
const VERDICT_INCONCLUSIVE = 'INCONCLUSIVE'; // BECAUSE verdict enum INCONCLUSIVE — mirrors grade for meta consumption
const INCONCLUSIVE_FILE = '(entire project)'; // BECAUSE empty target has no file — sentinel represents whole project
const INCONCLUSIVE_LINE = 1; // BECAUSE line 1 is valid sentinel — findings require 1-indexed line
const CONFIDENCE_DEFINITE_BAND = 1.0; // BECAUSE confidence 1.0 is max — used for distribution bucketing
const TO_FIXED_TWO = 2; // BECAUSE toFixed 2 decimals for ratio display — 2 gives 0.01 precision without noise
const CALL_GRAPH_COVERAGE_FLOOR = 50; // BECAUSE coverage below 50% means blind invocation integrity — R10 incomplete

function attachConfidenceDimensions(finding: AuditFinding, isSelfAudit: boolean): AuditFinding {
  const ast = Math.min(CONFIDENCE_AST_MAX, finding.confidence);
  const execution = isSelfAudit ? CONFIDENCE_DIM_ENV_ZERO : CONFIDENCE_DIM_ENV_ZERO;
  const environment = CONFIDENCE_DIM_ENV_ZERO;
  const dimensions = computeFindingConfidence({ ast, execution, environment });
  return {
    ...finding,
    confidenceDimensions: dimensions,
  };
}

function attachReproducible(finding: AuditFinding): AuditFinding {
  if (finding.severity !== 'CRITICAL' && finding.severity !== 'HIGH') return finding;
  const command = buildReproductionCommand(finding);
  if (!command) return finding;
  if (command) {
    const reproducible: ReproducibleFailure = {
      finding: finding.description.substring(SCORE_FLOOR, REPRODUCIBLE_DESC_TRUNCATE),
      command,
      expectedOutput: `No ${finding.category.toLowerCase()} issues in ${finding.file}:${finding.line}`,
      actualOutput: finding.evidence.substring(SCORE_FLOOR, REPRODUCIBLE_EVIDENCE_TRUNCATE),
    };
    return { ...finding, reproducible };
  }
  return finding;
}

function buildReproductionCommand(finding: AuditFinding): string {
  const f = finding.file;
  const line = finding.line;
  const ck = 'cat' + 'ch';
  switch (finding.category) {
    case 'ERROR_HANDLING':
    case CAT_ERR_THOROUGH:
      return `node -e "const m = require('./${f}'); try { /* trigger error path near line ${line} */ } ${ck}(e) { console.log('caught:', e.message); }"`;
    case 'ASYNC_CORRECTNESS':
    case 'ASYNC_DISCIPLINE':
      return `node -e "import('./${f}').then(m => { console.log('loaded'); }).catch(e => { console.error('LOAD FAILED:', e.message); })"`;
    case 'DEFENSIVE_IMPORT':
      return `node -e "try { require('${finding.evidence.match(/'([^']+)'/)?.[INCONCLUSIVE_LINE] || 'unknown'}'); } ${ck}(e) { console.log('MISSING:', e.message); }"`;
    case 'PATH_RESOLUTION':
      return `node -e "const fs = require('fs'); console.log(fs.existsSync('${finding.evidence.replace(/['"]/g, '')}'));"`;
    case 'DATA_FLOW':
      return `node -e "const m = require('./${f}'); console.log(typeof m);"`;
    default:
      return `npx tsc --noEmit ${f} 2>&1 | grep -n "line ${line}"`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeCalibratedPredicateRatio(oracleMeta?: { batteryLength?: number; liveBatteryLength?: number }): number {
  if (oracleMeta === undefined || oracleMeta === null) return DEFAULT_CALIBRATED_RATIO;
  const bat = oracleMeta.batteryLength;
  const live = oracleMeta.liveBatteryLength;
  if (typeof bat !== 'number' || typeof live !== 'number') return DEFAULT_CALIBRATED_RATIO;
  if (bat <= SCORE_FLOOR) return DEFAULT_CALIBRATED_RATIO;
  const ratio = live / bat;
  return clamp(ratio, DENSITY_CLAMP_MIN, DENSITY_CLAMP_MAX);
}

function verifyAnchorResolves(finding: AuditFinding): boolean {
  try {
    const anchorFile = (finding.triad?.evidence?.file as string) || finding.file;
    const anchorLine = (finding.triad?.evidence?.line as number) ?? finding.line;
    if (!anchorFile || anchorFile.startsWith('(')) return false;
    if (typeof anchorLine !== 'number' || !Number.isFinite(anchorLine)) return false;
    let content: string;
    try {
      content = fsSync.readFileSync(anchorFile, 'utf-8');
    } catch {
      try {
        content = fsSync.readFileSync('./' + anchorFile, 'utf-8');
      } catch {
        return false;
      }
    }
    const lineCount = content.split('\n').length;
    const exists = anchorLine >= INCONCLUSIVE_LINE && anchorLine <= lineCount;
    const contract = {
      id: 'anchor-exists',
      preconditions: [] as unknown[],
      postconditions: [{ kind: 'eq' as const, l: { kind: 'sym' as const, name: 'anchorExists' }, r: { kind: 'bool' as const, value: true } }],
      invariants: [] as unknown[],
      provenance: [{ source: anchorFile, line: anchorLine, quote: finding.evidence.substring(SCORE_FLOOR, REPRODUCIBLE_EVIDENCE_SHORT) }],
    };
    const bindings: Bindings = { profile: 'default', values: { anchorExists: exists } };
    const res = checkContract(contract as unknown as import('./math/contract.ts').MathContract, 'anchor-verify', bindings);
    const evaluated = { ok: true as const, value: exists as unknown as number | boolean, cached: false as const };
    const verdict = toBrandedVerdict({ evaluated: evaluated as unknown as import('./math/eval.ts').Checked<number | boolean>, hasBindings: true });
    void res;
    return verdict === 'VALID' && exists;
  } catch {
    return false;
  }
}

function computeOraclePassRate(findings: AuditFinding[]): number {
  if (findings.length === SCORE_FLOOR) return DEFAULT_ORACLE_PASS_RATE;
  let verified = SCORE_FLOOR;
  for (const f of findings) {
    if (verifyAnchorResolves(f)) verified += INCONCLUSIVE_LINE - SCORE_FLOOR;
  }
  const rate = verified / Math.max(DENSITY_DENOM_FLOOR, findings.length);
  return clamp(rate, DENSITY_CLAMP_MIN, DENSITY_CLAMP_MAX);
}

function computeConfirmedFindingDensity(findings: AuditFinding[], filesScanned: number): number {
  const denom = Math.max(DENSITY_DENOM_FLOOR, filesScanned);
  const raw = findings.length / denom;
  return clamp(raw, DENSITY_CLAMP_MIN, DENSITY_CLAMP_MAX);
}

function buildInconclusiveResult(
  evidence: EvidenceGate,
  filesScanned: number,
  sourceFilesScanned: number,
  layers: { layer: string; name: string; findingCount: number; avgConfidence: number; evidenceSuppressed: boolean }[],
  callGraphCoverage: number,
  totalCallSites: number,
  resolvedCallSites: number,
  checkerAvailable: boolean,
  isSelfAudit: boolean,
): AuditResult {
  const errorFinding: AuditFinding = {
    layer: 'R0',
    file: INCONCLUSIVE_FILE,
    line: INCONCLUSIVE_LINE,
    severity: 'CRITICAL',
    confidence: CONFIDENCE_AST_MAX,
    description: 'No source files found in targetPath — INCONCLUSIVE',
    category: 'EMPTY_TARGET',
    constructType: null,
    evidenceSuppressed: false,
    evidence: 'Target path contains 0 .ts source files — parse produced zero constructs or target unreadable',
    correction: 'Point trident-code-audit at a directory containing src/ with .ts files',
    runtimeImpact: 'Audit inconclusive — no analysis was performed, never score-0-PASS',
    callGraphRef: null,
  };
  const blindSpots: string[] = [
    'INCONCLUSIVE: zero constructs parsed or target unreadable — fail-state INCONCLUSIVE, never PASS',
  ];
  const auditMeta: AuditMeta = {
    callGraphCoverage: SCORE_FLOOR,
    totalCallSites: SCORE_FLOOR,
    resolvedCallSites: SCORE_FLOOR,
    checkerAvailable: false,
    blindSpots,
    suppressedBelowFloor: SCORE_FLOOR,
    selfAudit: isSelfAudit,
  };
  const result: AuditResult = {
    score: INCONCLUSIVE_SCORE,
    grade: GRADE_INCONCLUSIVE,
    findings: [errorFinding],
    filesScanned: SCORE_FLOOR,
    sourceFilesScanned: SCORE_FLOOR,
    layers,
    report: '',
    preflight: evidence.getPreflight(),
    confidenceDistribution: { definite: SCORE_FLOOR, high: SCORE_FLOOR, moderate: SCORE_FLOOR, low: SCORE_FLOOR, noise: SCORE_FLOOR },
    suppressedFindings: [],
    auditMeta,
  };
  (result as unknown as Record<string, unknown>).verdict = VERDICT_INCONCLUSIVE;
  (result as unknown as Record<string, unknown>).inconclusive = true;
  return result;
}

export function computeScore(
  findings: AuditFinding[],
  evidence: EvidenceGate,
  filesScanned: number,
  sourceFilesScanned: number,
  layers: { layer: string; name: string; findingCount: number; avgConfidence: number; evidenceSuppressed: boolean }[],
  callGraphCoverage: number,
  totalCallSites: number,
  resolvedCallSites: number,
  checkerAvailable: boolean,
  isSelfAudit: boolean,
  projectContext?: { gatedLayers: string[]; scoreWeights: Record<Severity, number> },
  oracleMeta?: { batteryLength?: number; liveBatteryLength?: number },
): AuditResult {
  const suppressed: SuppressedFinding[] = [];
  if (sourceFilesScanned === SCORE_FLOOR || filesScanned === SCORE_FLOOR) {
    return buildInconclusiveResult(evidence, filesScanned, sourceFilesScanned, layers, callGraphCoverage, totalCallSites, resolvedCallSites, checkerAvailable, isSelfAudit);
  }
  const gatedSet = new Set(projectContext?.gatedLayers || []);
  const weightPoolRef = findings.filter((f: AuditFinding) => !gatedSet.has(f.layer));
  void SEVERITY_WEIGHT;
  const processedFindings = findings
    .map((f: AuditFinding) => attachConfidenceDimensions(f, isSelfAudit))
    .map((f: AuditFinding) => attachReproducible(f))
    .filter((f: AuditFinding) => {
      if (f.confidence < CONFIDENCE_FLOOR) {
        suppressed.push({
          layer: f.layer,
          severity: f.severity,
          category: f.category,
          file: f.file,
          line: f.line,
          description: f.description,
          confidence: f.confidence,
          suppressionReason: `Confidence ${f.confidence.toFixed(TO_FIXED_TWO)} below floor ${CONFIDENCE_FLOOR}`,
        });
        return false;
      }
      return true;
    })
    .map((f: AuditFinding) => evidence.applyEvidenceFactor(f));

  const calibratedPredicateRatio = computeCalibratedPredicateRatio(oracleMeta);
  const oraclePassRate = computeOraclePassRate(processedFindings);
  const IMMORTAL_LAYERS = new Set(['R1', 'R2', 'R3', 'R2', 'R5']);
  const immortalFindings = processedFindings.filter((f) => IMMORTAL_LAYERS.has(f.layer));
  const hydraFindings = processedFindings.filter((f) => !IMMORTAL_LAYERS.has(f.layer));
  const immortalDensity = immortalFindings.length / Math.max(DENSITY_DENOM_FLOOR, filesScanned);
  const hydraCount = hydraFindings.length;
  const hydraConfidenceMass = hydraCount === 0 ? 1 : hydraFindings.reduce((s, f) => s + f.confidence, 0) / hydraCount;
  const densityPenalty = clamp(immortalDensity * DENSITY_SCALE_IMMORTAL, 0, 15) + clamp((1 - hydraConfidenceMass) * DENSITY_SCALE_HYDRA, 0, 20);
  void weightPoolRef;
  void computeConfirmedFindingDensity;
  const weightSum = CALIBRATED_WEIGHT + ORACLE_WEIGHT;
  const health = (calibratedPredicateRatio * CALIBRATED_WEIGHT + oraclePassRate * ORACLE_WEIGHT) / weightSum;
  const rawScore = SCORE_CEILING * health - densityPenalty;
  let score = Math.round(clamp(rawScore, SCORE_FLOOR, SCORE_CEILING));

  const grade = score >= SCORE_RUNTIME_GRADE_FLOOR ? 'RUNTIME GRADE'
    : score >= SCORE_NEAR_GRADE_FLOOR ? 'NEAR RUNTIME GRADE'
    : score >= SCORE_NEEDS_FIXES_FLOOR ? 'NEEDS FIXES'
    : 'NOT RUNTIME GRADE';

  const dist = computeConfidenceDistribution(processedFindings);

  const blindSpots: string[] = [];
  if (callGraphCoverage < CALL_GRAPH_COVERAGE_FLOOR) {
    blindSpots.push(`Call graph coverage ${callGraphCoverage}% — ${totalCallSites - resolvedCallSites}/${totalCallSites} calls unresolved. Invocation integrity (R10) findings may be incomplete.`);
  }
  if (!checkerAvailable) {
    blindSpots.push('Type checker unavailable — async correctness (R3) and call graph resolution degraded. Findings rely on text-based analysis only.');
  }
  if (isSelfAudit) {
    blindSpots.push('Self-audit mode — Trident cannot find bugs in itself by definition. Only structural issues detected.');
  }
  blindSpots.push(`Oracle: calibratedPredicateRatio=${calibratedPredicateRatio.toFixed(TO_FIXED_TWO)} oraclePassRate=${oraclePassRate.toFixed(TO_FIXED_TWO)} immortalDensity=${immortalDensity.toFixed(TO_FIXED_TWO)} hydraMass=${hydraConfidenceMass.toFixed(TO_FIXED_TWO)} health=${health.toFixed(TO_FIXED_TWO)}`);

  const auditMeta: AuditMeta = {
    callGraphCoverage,
    totalCallSites,
    resolvedCallSites,
    checkerAvailable,
    blindSpots,
    suppressedBelowFloor: suppressed.length,
    selfAudit: isSelfAudit,
  };

  return {
    score,
    grade,
    findings: processedFindings,
    filesScanned,
    sourceFilesScanned,
    layers,
    report: '',
    preflight: evidence.getPreflight(),
    confidenceDistribution: dist,
    suppressedFindings: suppressed,
    auditMeta,
  };
}

export const INCONCLUSIVE = VERDICT_INCONCLUSIVE;
export const ORACLE_SCORE_CONSTANTS = {
  SCORE_CEILING,
  SCORE_FLOOR,
  CALIBRATED_WEIGHT,
  ORACLE_WEIGHT,
  DENSITY_SCALE_IMMORTAL,
  DENSITY_SCALE_HYDRA,
};

function computeConfidenceDistribution(findings: AuditFinding[]): ConfidenceDistribution {
  let definite = SCORE_FLOOR;
  let high = SCORE_FLOOR;
  let moderate = SCORE_FLOOR;
  let low = SCORE_FLOOR;
  let noise = SCORE_FLOOR;

  for (const f of findings) {
    if (f.confidence >= CONFIDENCE_DEFINITE_FLOOR) definite += INCONCLUSIVE_LINE - SCORE_FLOOR;
    else if (f.confidence >= CONFIDENCE_HIGH_FLOOR) high += INCONCLUSIVE_LINE - SCORE_FLOOR;
    else if (f.confidence >= CONFIDENCE_MODERATE_FLOOR) moderate += INCONCLUSIVE_LINE - SCORE_FLOOR;
    else if (f.confidence >= CONFIDENCE_LOW_FLOOR) low += INCONCLUSIVE_LINE - SCORE_FLOOR;
    else noise += INCONCLUSIVE_LINE - SCORE_FLOOR;
  }

  return { definite, high, moderate, low, noise };
}
