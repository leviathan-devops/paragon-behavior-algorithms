import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { tridentLog } from '../utils.js';
import type { AuditFinding } from '../audit-engine/types.ts';
export const SELF_DEFECT_PATHS: string[] = [
  'src/hydra/',
  'src/audit-engine/harness/',
  'src/audit-engine/aether-backend/',
  'src/audit-engine/graph-logic-phase.ts',
  'src/audit-engine/index.ts',
];
const SEVERITY_WEIGHT: Record<string, number> = { CRITICAL: 10, HIGH: 5, MEDIUM: 2, LOW: 1, INFO: 0.5 };
export interface WeightedFinding extends AuditFinding {
  weightedScore: number;
  correlationCount: number;
  isSelfDefect: boolean;
  blastRadius: number;
  recencyDays: number | null;
}
export interface FindingsMap {
  runId: string;
  targetRoot: string;
  generatedAt: number;
  totalFindings: number;
  selfDefects: WeightedFinding[];
  ranked: WeightedFinding[];
  clusters: Array<{ key: string; file: string; line: number; count: number; hunters: string[]; severities: string[]; maxScore: number }>;
  byFile: Record<string, WeightedFinding[]>;
  byLayer: Record<string, WeightedFinding[]>;
  bySeverity: Record<string, WeightedFinding[]>;
  byCorrelation: Record<string, WeightedFinding[]>;
  bySubsystem: Record<string, WeightedFinding[]>;
  rolodexPath: string;
}
export interface FindingsMapOptions {
  runId: string;
  targetRoot: string;
  ledgerRoot: string;
  macroGraphInDegree?: Map<string, number>;
}
function isSelfDefectFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  for (const p of SELF_DEFECT_PATHS) {
    if (p.endsWith('/')) { if (normalized.includes(p) || normalized.startsWith(p)) return true; }
    else { if (normalized === p || normalized.endsWith('/' + p) || normalized.includes(p)) return true; }
  }
  return false;
}
function severityWeight(s: string): number { return SEVERITY_WEIGHT[s] ?? 1; }
function confidenceBand(c: number): 'high-trust' | 'verify' | 'low' { if (c >= 0.85) return 'high-trust'; if (c >= 0.70) return 'verify'; return 'low'; }
function blastRadiusFor(file: string, inDegree?: Map<string, number>): number {
  if (!inDegree) return 0;
  const direct = inDegree.get(file) ?? 0;
  const base = path.basename(file);
  let sum = direct;
  for (const [k, v] of inDegree) { if (k.endsWith('/' + base) || k === base) sum = Math.max(sum, v); }
  return Math.min(sum, 50);
}
function recencyDaysFor(file: string, targetRoot: string): number | null {
  try {
    const resolved = path.isAbsolute(file) ? file : path.join(targetRoot, file);
    if (!fs.existsSync(resolved)) return null;
    const stat = fs.statSync(resolved);
    const diff = Date.now() - stat.mtimeMs;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  } catch (_e: unknown) { void _e; return null; }
}
function correlationCounts(findings: AuditFinding[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of findings) { const k = `${f.file}:${f.line}`; m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}
export function computeWeightedScore(f: AuditFinding, correlationCount: number, isSelfDefect: boolean, blastRadius: number): number {
  const sw = severityWeight(f.severity);
  const conf = typeof f.confidence === 'number' ? f.confidence : 0.5;
  const corrMult = correlationCount >= 2 ? 1.5 : 1.0;
  const selfMult = isSelfDefect ? 2.0 : 1.0;
  const blastMult = 1 + Math.min(blastRadius, 50) / 100;
  return sw * conf * corrMult * selfMult * blastMult;
}
export function buildFindingsMap(findings: AuditFinding[], opts: FindingsMapOptions): FindingsMap {
  const corrMap = correlationCounts(findings);
  const weighted: WeightedFinding[] = findings.map((f) => {
    const key = `${f.file}:${f.line}`;
    const cc = corrMap.get(key) ?? 1;
    const isSelf = isSelfDefectFile(f.file);
    const br = blastRadiusFor(f.file, opts.macroGraphInDegree);
    const rd = recencyDaysFor(f.file, opts.targetRoot);
    const score = computeWeightedScore(f, cc, isSelf, br);
    return { ...f, weightedScore: score, correlationCount: cc, isSelfDefect: isSelf, blastRadius: br, recencyDays: rd };
  });
  weighted.sort((a, b) => b.weightedScore - a.weightedScore);
  const selfDefects = weighted.filter((w) => w.isSelfDefect && (w.severity === 'CRITICAL' || w.severity === 'HIGH'));
  const byFile: Record<string, WeightedFinding[]> = {};
  const byLayer: Record<string, WeightedFinding[]> = {};
  const bySeverity: Record<string, WeightedFinding[]> = {};
  const byCorrelation: Record<string, WeightedFinding[]> = {};
  const bySubsystem: Record<string, WeightedFinding[]> = {};
  for (const w of weighted) {
    const fk = w.file;
    if (!byFile[fk]) byFile[fk] = [];
    byFile[fk]!.push(w);
    const lk = w.layer;
    if (!byLayer[lk]) byLayer[lk] = [];
    byLayer[lk]!.push(w);
    const sk = w.severity;
    if (!bySeverity[sk]) bySeverity[sk] = [];
    bySeverity[sk]!.push(w);
    const ck = w.correlationCount >= 2 ? `cluster-${w.file}:${w.line}` : 'single';
    if (!byCorrelation[ck]) byCorrelation[ck] = [];
    byCorrelation[ck]!.push(w);
    const subsystem = w.file.includes('hydra') ? 'hydra' : w.file.includes('harness') ? 'harness' : w.file.includes('aether-backend') ? 'aether-backend' : w.file.includes('graph-logic') ? 'graph-logic' : 'project';
    if (!bySubsystem[subsystem]) bySubsystem[subsystem] = [];
    bySubsystem[subsystem]!.push(w);
  }
  const clusterMap = new Map<string, WeightedFinding[]>();
  for (const w of weighted) { const k = `${w.file}:${w.line}`; if (!clusterMap.has(k)) clusterMap.set(k, []); clusterMap.get(k)!.push(w); }
  const clusters: FindingsMap['clusters'] = [];
  for (const [key, members] of clusterMap) {
    if (members.length < 2) continue;
    const first = members[0]!;
    const hunters = [...new Set(members.map((m) => m.layer))];
    const severities = [...new Set(members.map((m) => m.severity))];
    const maxScore = Math.max(...members.map((m) => m.weightedScore));
    clusters.push({ key, file: first.file, line: first.line, count: members.length, hunters, severities, maxScore });
  }
  clusters.sort((a, b) => b.maxScore - a.maxScore);
  const rolodexPath = path.join(path.resolve(opts.ledgerRoot), 'findings-map.json');
  return {
    runId: opts.runId,
    targetRoot: opts.targetRoot,
    generatedAt: Date.now(),
    totalFindings: findings.length,
    selfDefects,
    ranked: weighted,
    clusters,
    byFile,
    byLayer,
    bySeverity,
    byCorrelation,
    bySubsystem,
    rolodexPath,
  };
}
export function writeFindingsMap(ledgerRoot: string, map: FindingsMap): string {
  const dest = path.join(path.resolve(ledgerRoot), 'findings-map.json');
  const tmp = path.join(path.resolve(ledgerRoot), `findings-map.json.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(path.resolve(ledgerRoot), { recursive: true });
  const payload = JSON.stringify(map, null, 2);
  try {
    fs.writeFileSync(tmp, payload, 'utf-8');
    fs.renameSync(tmp, dest);
  } catch (e: unknown) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_e2: unknown) { void _e2; }
    throw e;
  }
  return dest;
}
export interface OperatorBriefOptions {
  map: FindingsMap;
  ledgerRoot: string;
  wallMs?: number;
  huntersFulfilled?: number;
  huntersRejected?: number;
  graphState?: { macro?: { nodes: number; edges: number; substrate?: string }; micro?: { nodes: number; edges: number }; tagsWritten?: number };
  blockExists?: boolean;
}
export function composeOperatorBrief(opts: OperatorBriefOptions): string {
  const { map, ledgerRoot, wallMs, huntersFulfilled, huntersRejected, graphState, blockExists } = opts;
  const wallMin = wallMs !== undefined ? (wallMs / 60000).toFixed(1) : '?';
  const hf = huntersFulfilled ?? 0;
  const hr = huntersRejected ?? 0;
  const macroNodes = graphState?.macro?.nodes ?? 0;
  const macroEdges = graphState?.macro?.edges ?? 0;
  const microNodes = graphState?.micro?.nodes ?? 0;
  const microEdges = graphState?.micro?.edges ?? 0;
  const tags = graphState?.tagsWritten ?? 0;
  const lines: string[] = [];
  lines.push(`[AUDIT COMPLETE] ${map.runId} \u00b7 ${wallMin}min \u00b7 ${map.totalFindings} candidates \u00b7 ${hf}/${hr} hunters`);
  lines.push(`  graph: macro ${macroNodes}/${macroEdges} \u00b7 micro ${microNodes}/${microEdges} \u00b7 tags ${tags}`);
  lines.push('');
  if (map.selfDefects.length > 0) {
    lines.push(`\u26a0 SELF-DEFECTS (the tool flagged its OWN machinery) \u2014 ${map.selfDefects.length} HIGH+:`);
    for (let i = 0; i < Math.min(map.selfDefects.length, 10); i++) {
      const sd = map.selfDefects[i]!;
      const band = confidenceBand(sd.confidence);
      const corr = sd.correlationCount >= 2 ? ` \u00d7${sd.correlationCount}-hunter correlation` : '';
      const excerpt = (sd.description ?? sd.evidence ?? '').slice(0, 140).replace(/\n/g, ' ');
      lines.push(`  ${i + 1}. ${sd.file}:${sd.line} \u2014 ${excerpt} (${sd.layer}, conf ${sd.confidence.toFixed(2)} ${band}${corr}) \u2192 ${sd.correction ?? 'Fix the tool machinery'}`);
    }
    lines.push(`  \u2192 DIRECTIVE: Fix these before the next audit run. See SELF_DEFECT_BLOCK.json.`);
    if (blockExists) lines.push(`  \u2192 BLOCK: the next run refuses until dispositioned (F10)`);
    lines.push('');
  }
  lines.push(`TOP PROJECT FINDINGS (ranked by weighted score = severityWeight \u00d7 confidence \u00d7 correlation \u00d7 selfDefect \u00d7 blastRadius):`);
  const top = map.ranked.filter((r) => !r.isSelfDefect).slice(0, 10);
  if (top.length === 0 && map.ranked.length > 0) { for (let i = 0; i < Math.min(5, map.ranked.length); i++) { const r = map.ranked[i]!; const band = confidenceBand(r.confidence); lines.push(`  ${i + 1}. [${r.severity}] ${r.file}:${r.line} \u2014 ${(r.description ?? r.evidence).slice(0, 120)} (${r.layer} \u00d7${r.correlationCount}, conf ${r.confidence.toFixed(2)} ${band}) blast-radius: ${r.blastRadius} callers`); } }
  else {
    for (let i = 0; i < Math.min(top.length, 10); i++) {
      const r = top[i]!;
      const band = confidenceBand(r.confidence);
      const corr = r.correlationCount >= 2 ? ` \u00d7${r.correlationCount}` : '';
      lines.push(`  ${i + 1}. [${r.severity}] ${r.file}:${r.line} \u2014 ${(r.description ?? r.evidence).slice(0, 120)} (${r.layer}${corr}, conf ${r.confidence.toFixed(2)} ${band}) blast-radius: ${r.blastRadius} callers affected recency:${r.recencyDays ?? '?'}d`);
    }
    if (top.length === 0) lines.push('  (no non-self project findings)');
  }
  lines.push('');
  if (map.clusters.length > 0) {
    lines.push(`CORRELATION CLUSTERS (same file:line flagged by \u22652 hunters${map.clusters.some((c) => c.count >= 3) ? ' \u2014 TRIPLE_CONFIRMED where \u22653 agree' : ''}):`);
    for (const cl of map.clusters.slice(0, 5)) {
      lines.push(`  ${cl.key} \u2014 ${cl.count} hunters [${cl.hunters.join(',')}] severities [${cl.severities.join(',')}] maxScore ${cl.maxScore.toFixed(2)}`);
    }
    lines.push('');
  }
  lines.push(`FULL REPORTS:`);
  lines.push(`  doc2: ${path.join(path.resolve(ledgerRoot), 'findings-report.md')} (${map.totalFindings} findings) \u00b7 _meta-*/report.md (the DEEP adjudications \u2014 READ THESE for per-hunter reasoning) \u00b7 verdicts.json \u00d7${map.totalFindings}`);
  lines.push('');
  lines.push(`RELEVANCE ROLODEX: ${path.join(path.resolve(ledgerRoot), 'findings-map.json')}`);
  lines.push(`  (by-file \u2192 by-layer \u2192 by-severity \u2192 by-correlation \u2192 by-subsystem) byFile=${Object.keys(map.byFile).length} byLayer=${Object.keys(map.byLayer).length} clusters=${map.clusters.length}`);
  lines.push('');
  lines.push(`DIRECTIVES:`);
  if (map.selfDefects.length > 0) lines.push(`  1. SELF-DEFECT: fix tool machinery findings above \u2014 next run BLOCKED until SELF_DEFECT_BLOCK.json dispositioned`);
  lines.push(`  2. TOP FINDINGS: address ranked findings in order \u2014 highest weightedScore first`);
  if (map.clusters.length > 0) lines.push(`  3. CLUSTERS: prioritize correlation clusters \u2014 multi-hunter agreement signals real defects`);
  lines.push(`  4. ROLODEX: query findings-map.json by file/layer/severity for targeted reads`);
  lines.push('');
  if (blockExists) lines.push(`BLOCK STATUS: ACTIVE \u2014 SELF_DEFECT_BLOCK.json present \u2014 next audit will refuse until deleted with disposition`);
  else lines.push(`BLOCK STATUS: clear`);
  return lines.join('\n');
}
export { isSelfDefectFile, confidenceBand, SELF_DEFECT_PATHS as SELF_DEFECT_PATHS_FINDINGS };
void tridentLog;
void crypto;
