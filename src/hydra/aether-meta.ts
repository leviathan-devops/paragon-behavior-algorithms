import * as fs from 'node:fs';
import * as path from 'node:path';
import { AetherAgent } from '../audit-engine/aether-backend/agent.js';
import { buildMetaTools } from './aether-tools.js';
import { runLayerHunter, type HunterSettlement } from './aether-auditor.js';
import type { AuditorTemplate } from './aether-templates/types.js';
import type { GraphifyMCPClient } from './graphify.js';
import { isPredicate, isNodeType } from '../shared/knowledge-graph/ontology.js';
import { TYPED_GRAPH_DDL } from '../shared/knowledge-graph/migrations.js';
import { kindForLayer } from '../shared/knowledge-graph/kind-for-layer.js';
import { Database } from 'bun:sqlite';
import { SQLiteMemoryStore } from './memory.js';
import { lasmeSynthesize, lasmePreGates, lasmePostGates } from './instances/lasme.js';
import { mpseSynthesize, createMpsePreGates, createMpsePostGates } from './instances/mpse.js';
import { sroSynthesize, createSroPreGates, createSroPostGates } from './instances/sro.js';
import type { SubagentSettlement, GraphifyGraph } from './types.js';

export type GateName = 'LASME' | 'MPSE' | 'SRO';

export interface MetaInputDataBuilder {
  (template: AuditorTemplate): string;
}

export interface RosterEntry {
  layerId: string;
  layerNumber: number;
  anchorPredicate: string;
  ledgerDir: string;
  reportPath: string;
  status: 'fulfilled' | 'rejected';
  error?: string;
  fileBytes?: number;
  fileMtime?: number;
  findingsCount?: number;
  tagsWritten?: number;
  durationMs: number;
  findings?: unknown;
}

export interface MetaRunResult {
  gateName: GateName;
  roster: RosterEntry[];
  doc1Path: string;
  doc2Path: string;
  docSectionsWritten: number;
  gateSectionLines: number;
  graphTagCount: number;
  metaTelemetry: unknown;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export const PREDICATE_MAP: Record<string, string> = {
  'lexicon.threshold': 'violates',
  'lexicon.degenerate': 'violates',
  'lexicon.missing': 'violates',
  'lexicon.family': 'violates',
  'lexicon.tower': 'violates',
  'lexicon.detector': 'violates',
  'lexicon.drift': 'violates',
  'actor.unsubscribed': 'violates',
  'actor.broken-flow': 'violates',
  'actor.orphan': 'violates',
  'actor.topology-drift': 'violates',
  'state-machine.topology-drift': 'violates',
  'state-machine.scattered-flags': 'violates',
  'state-machine.unreachable': 'violates',
  'state-machine.unreachable-state': 'violates',
  'state-machine.missing-terminal': 'violates',
  'engine.silentDegrade': 'violates',
  'engine.unguardedWrite': 'unguarded_threshold',
  'engine.unguardedSideEffect': 'unguarded_threshold',
  'adapter.delegation-parity': 'wraps',
  'adapter.snapshot-merge': 'wraps',
  'adapter.unguarded-wrap': 'wraps',
  'adapter.stale-delegation': 'wraps',
  'mpse.threshold': 'unguarded_threshold',
  'lasme-meta.orphan-actor': 'violates',
  'lasme-meta.actor-missing-subscribe': 'violates',
  'lasme-meta.topology-drift': 'violates',
  'lasme-meta.silent-degrade': 'violates',
  'lasme-meta.adapter-parity-stub': 'wraps',
  'lasme-meta.adapter-wraps': 'wraps',
  'lasme-meta.adapter-unguarded-wrap': 'wraps',
  'lasme-meta.delegation-parity-loss': 'wraps',
  'lasme-meta.stale-delegation': 'wraps',
  'lasme-meta.snapshot-merge-loss': 'wraps',
  'lasme-meta.scope-violation': 'violates',
  'lasme-meta.state-machine-topology-drift': 'violates',
  'lasme-meta.state-machine-scattered-flags': 'violates',
  'lasme-meta.state-machine-unreachable': 'violates',
  'lasme-meta.mpse-threshold-critical': 'unguarded_threshold',
  'epsilon': 'unguarded_threshold',
  'threshold': 'unguarded_threshold',
  'stage.skipped-pre': 'violates',
  'stage.violated-inv': 'violates',
  'stage.unsequenced': 'violates',
  'stage.missing-post': 'violates',
  'provenance.trace-gap': 'derived_from',
  'provenance.orphaned': 'derived_from',
  'provenance.divergent': 'derived_from',
  'provenance.ambiguous': 'derived_from',
  'contract.violated': 'contradicts_oracle',
  'contract.drift': 'contradicts_oracle',
  'contract.unimplemented': 'contradicts_oracle',
  'contract.missing-guard': 'unguarded_threshold',
  'oracle.missing-wiring': 'contradicts_oracle',
  'oracle.unguarded': 'unguarded_threshold',
  'graph-structure.orphaned': 'flagged_by',
  'graph-structure.layer-violation': 'violates',
  'graph-structure.anomaly': 'flagged_by',
  'graph-structure.cycle': 'violates',
  'impact-path.blast-radius': 'caused',
  'impact-path.classification': 'caused',
  'dead-code.function': 'unwired',
  'dead-code.export': 'unwired',
  'cycles.import': 'calls',
  'cycles.scc': 'calls',
  'cycles.confirmed-absent': 'flagged_by',
};



function countGraphTags(sharedDbPath: string): number {
  if (!sharedDbPath || !fs.existsSync(sharedDbPath)) return 0;
  try {
    const dbPath = path.resolve(sharedDbPath);
    const db = new Database(dbPath);
    try { (db as unknown as { exec: (s: string) => unknown }).exec('PRAGMA journal_mode=WAL;'); } catch (ee) { void (ee as Error).message; }
    try { (db as unknown as { exec: (s: string) => unknown }).exec('PRAGMA busy_timeout=5000;'); } catch (ee) { void (ee as Error).message; }
    try { (db as unknown as { exec: (s: string) => unknown }).exec(TYPED_GRAPH_DDL); } catch (ee) { void (ee as Error).message; }
    const row = (db as unknown as { prepare: (s: string) => { get: () => { c: number } } }).prepare('SELECT COUNT(*) as c FROM typed_edges').get() as { c: number };
    return typeof row.c === 'number' ? row.c : 0;
  } catch (e) {
    try {
      const st = fs.statSync(path.resolve(sharedDbPath));
      return st.size > 0 ? 1 : 0;
    } catch (ee) { void (ee as Error).message; return 0; }
  }
}

function writeRunnerTag(sharedDbPath: string, layerId: string, file: string, line: number, predicate: string, evidence: string, subject: string): void {
  const canon = `${layerId}:${file}:${line}`;
  const kind = kindForLayer(layerId);
  const originalPredicate = predicate;
  const mapped = PREDICATE_MAP[predicate] ?? predicate;
  if (!isPredicate(mapped)) throw new Error(`GRAPH_TAG_INVALID_PREDICATE: ${predicate} not in ontology`);
  predicate = mapped;
  if (!isNodeType(kind)) throw new Error(`GRAPH_TAG_INVALID_KIND: ${kind}`);
  const evidenceWithOriginal = originalPredicate !== mapped ? `${evidence} [original-predicate:${originalPredicate}]` : evidence;
  const evidence_quote = evidenceWithOriginal && evidenceWithOriginal.startsWith('[INFERRED]') ? evidenceWithOriginal : `explicit: ${evidenceWithOriginal || 'no evidence'}`;
  if (evidence_quote.length === 0) throw new Error('GRAPH_TAG_EVIDENCE_EMPTY');
  const dbPath = path.resolve(sharedDbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try { (db as unknown as { exec: (s: string) => unknown }).exec('PRAGMA journal_mode=WAL;'); } catch (ee) { void (ee as Error).message; }
  try { (db as unknown as { exec: (s: string) => unknown }).exec('PRAGMA busy_timeout=5000;'); } catch (ee) { void (ee as Error).message; }
  try { (db as unknown as { exec: (s: string) => unknown }).exec(TYPED_GRAPH_DDL); } catch (ee) { void (ee as Error).message; }
  const codeNodeId = `${file}:${line}:code`;
  try { (db as unknown as { prepare: (s: string) => { run: (...a: unknown[]) => unknown } }).prepare(`DELETE FROM typed_nodes WHERE canonical_id = ?`).run(canon); } catch (ee) { void (ee as Error).message; }
  try { (db as unknown as { prepare: (s: string) => { run: (...a: unknown[]) => unknown } }).prepare(`DELETE FROM typed_nodes WHERE canonical_id = ?`).run(codeNodeId); } catch (ee) { void (ee as Error).message; }
  try { (db as unknown as { prepare: (s: string) => { run: (...a: unknown[]) => unknown } }).prepare(`DELETE FROM typed_edges WHERE src_canonical = ? AND dst_canonical = ? AND predicate = ?`).run(codeNodeId, canon, predicate); } catch (ee) { void (ee as Error).message; }
  (db as unknown as { prepare: (s: string) => { run: (...a: unknown[]) => unknown } }).prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run) VALUES (?, ?, ?, ?, ?, ?)`).run(canon, kind, subject, file, line, layerId);
  (db as unknown as { prepare: (s: string) => { run: (...a: unknown[]) => unknown } }).prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run) VALUES (?, ?, ?, ?, ?, ?)`).run(codeNodeId, 'File', file, file, line, layerId);
  (db as unknown as { prepare: (s: string) => { run: (...a: unknown[]) => unknown } }).prepare(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run) VALUES (?, ?, ?, ?, ?, ?)`).run(codeNodeId, canon, predicate, evidence_quote, 1.0, layerId);
}

function buildStitchContent(sorted: RosterEntry[]): string {
  let out = '';
  for (const r of sorted) {
    if (r.status === 'fulfilled') {
      let body = '';
      try {
        body = fs.readFileSync(r.reportPath, 'utf-8');
      } catch (e) {
        body = `REPORT_READ_FAILED: ${String((e as Error).message ?? e).slice(0, 300)}`;
      }
      out += `## R${r.layerNumber} — ${r.layerId}\n${body}\n\n`;
    } else {
      out += `## R${r.layerNumber} — ${r.layerId} [REJECTED: ${r.error ?? 'unknown'}]\n\n`;
    }
  }
  return out;
}

function buildCorrelationSection(sharedDbPath: string): string {
  if (!sharedDbPath || !fs.existsSync(sharedDbPath)) return '\n## CORRELATIONS\ntyped_edges empty — shared.db not found\n';
  try {
    const db = new Database(path.resolve(sharedDbPath));
    try { (db as unknown as { exec: (s: string) => unknown }).exec(TYPED_GRAPH_DDL); } catch (ee) { void (ee as Error).message; }
    const rows = (db as unknown as { prepare: (s: string) => { all: () => Array<{ dst_canonical: string; predicate: string }> } }).prepare('SELECT dst_canonical, predicate FROM typed_edges').all() as Array<{ dst_canonical: string; predicate: string }>;
    if (!rows || rows.length === 0) return '\n## CORRELATIONS\ntyped_edges empty — 0 rows\n';
    const siteMap = new Map<string, Set<string>>();
    for (const r of rows) {
      const dst = String(r.dst_canonical ?? '');
      const pred = String(r.predicate ?? '');
      const lastColon = dst.lastIndexOf(':');
      if (lastColon < 0) continue;
      const beforeLine = dst.slice(0, lastColon);
      const firstColon = beforeLine.indexOf(':');
      const site = firstColon >= 0 ? beforeLine.slice(firstColon + 1) + ':' + dst.slice(lastColon + 1) : dst;
      const set = siteMap.get(site) ?? new Set<string>();
      set.add(pred);
      siteMap.set(site, set);
    }
    const clusters: Array<{ site: string; predicates: string[] }> = [];
    for (const [site, preds] of siteMap.entries()) {
      if (preds.size >= 2) clusters.push({ site, predicates: [...preds].sort() });
    }
    clusters.sort((a, b) => b.predicates.length - a.predicates.length || a.site.localeCompare(b.site));
    if (clusters.length === 0) {
      const byFile = new Map<string, Set<string>>();
      for (const r of rows) {
        const dst = String(r.dst_canonical ?? '');
        const pred = String(r.predicate ?? '');
        const lastColon = dst.lastIndexOf(':');
        const beforeLine = lastColon >= 0 ? dst.slice(0, lastColon) : dst;
        const firstColon = beforeLine.indexOf(':');
        const file = firstColon >= 0 ? beforeLine.slice(firstColon + 1) : beforeLine;
        const fileOnly = file.split(':')[0] ?? file;
        const s = byFile.get(fileOnly) ?? new Set<string>();
        s.add(pred);
        byFile.set(fileOnly, s);
      }
      for (const [file, preds] of byFile.entries()) {
        if (preds.size >= 2) clusters.push({ site: file, predicates: [...preds].sort() });
      }
      clusters.sort((a, b) => b.predicates.length - a.predicates.length || a.site.localeCompare(b.site));
    }
    if (clusters.length === 0) return `\n## CORRELATIONS\ntyped_edges: ${rows.length} rows, 0 multi-predicate sites — no clusters\n`;
    let out = `\n## CORRELATIONS\nsame-site multi-predicate clusters: ${clusters.length} from ${rows.length} typed_edges\n\n| site | predicates | count |\n|------|------------|-------|\n`;
    for (const c of clusters) out += `| ${c.site} | ${c.predicates.join(', ')} | ${c.predicates.length} |\n`;
    return out;
  } catch (e) {
    return `\n## CORRELATIONS\ntyped_edges query failed: ${String((e as Error).message).slice(0, 200)}\n`;
  }
}

export async function runMetaLayer(
  gateName: GateName,
  roster: AuditorTemplate[],
  inputDataBuilder: MetaInputDataBuilder,
  ledgerRoot: string,
  graph: GraphifyMCPClient,
  sharedDbPath: string,
  doc1Path: string,
  doc2Path: string
): Promise<MetaRunResult> {
  if (!gateName || !['LASME', 'MPSE', 'SRO'].includes(gateName)) throw new Error('META_GATE_INVALID: gateName must be LASME|MPSE|SRO');
  if (!Array.isArray(roster) || roster.length === 0) throw new Error('META_ROSTER_INVALID: roster must be non-empty array');
  if (typeof inputDataBuilder !== 'function') throw new Error('META_BUILDER_INVALID: inputDataBuilder must be function');
  if (!ledgerRoot || typeof ledgerRoot !== 'string' || ledgerRoot.trim() === '') throw new Error('META_LEDGER_INVALID: ledgerRoot required');
  if (!graph) throw new Error('META_GRAPH_INVALID: graph required');
  if (!doc1Path || !doc2Path) throw new Error('META_DOCS_INVALID: doc paths required');
  const root = path.resolve(ledgerRoot);
  ensureDir(root);
  ensureDir(path.dirname(path.resolve(doc1Path)));
  ensureDir(path.dirname(path.resolve(doc2Path)));
  if (!fs.existsSync(path.resolve(doc1Path))) fs.writeFileSync(path.resolve(doc1Path), `# AETHER META ANALYSIS — ${gateName} — ${Date.now()}\n\n`, 'utf-8');
  if (!fs.existsSync(path.resolve(doc2Path))) fs.writeFileSync(path.resolve(doc2Path), `# AETHER FINDINGS REPORT — ${gateName}\n\n`, 'utf-8');
  const dispatchResults: Array<{ template: AuditorTemplate; ledgerDir: string; promise: Promise<HunterSettlement> }> = [];
  for (const template of roster) {
    const ledgerDir = path.join(root, template.layerId);
    ensureDir(path.join(ledgerDir, 'findings'));
    ensureDir(path.join(ledgerDir, 'evidence'));
    let inputData = '';
    try {
      inputData = inputDataBuilder(template) ?? '';
    } catch (e) {
      inputData = `INPUT_BUILDER_FAILED: ${String((e as Error).message ?? e).slice(0, 300)}`;
    }
    const p = runLayerHunter(template, inputData, ledgerDir, graph, sharedDbPath);
    dispatchResults.push({ template, ledgerDir, promise: p });
  }
  const allSettled = await Promise.allSettled(dispatchResults.map((d) => d.promise));
  const settledEntries: RosterEntry[] = [];
  for (let i = 0; i < allSettled.length; i++) {
    const dr = dispatchResults[i]!;
    const outcome = allSettled[i]!;
    const template = dr.template;
    if (outcome.status === 'fulfilled') {
      const v = outcome.value;
      if (v.status === 'fulfilled') {
        const count = (() => {
          const f = v.findings as { candidates?: unknown[] } | null;
          if (f && Array.isArray(f.candidates)) return f.candidates.length;
          return 0;
        })();
        let tagsWritten = 0;
        if (sharedDbPath && v.findings && typeof v.findings === 'object') {
          const cands = (v.findings as { candidates?: unknown[] }).candidates;
          if (Array.isArray(cands)) {
            for (const cand of cands) {
              try {
                const c = cand as { predicate?: string; file?: string; line?: number; evidence?: string; subject?: string };
                const pred = String(c.predicate ?? '');
                const f = String(c.file ?? '');
                const ln = typeof c.line === 'number' ? c.line : Number.parseInt(String(c.line), 10);
                const ev = String(c.evidence ?? '');
                const subj = String(c.subject ?? 'finding');
                if (!f || !Number.isFinite(ln) || ln <= 0) throw new Error(`TAG_SKIP_INVALID_FILELINE: ${f}:${String(ln)}`);
                writeRunnerTag(sharedDbPath, template.layerId, f, ln, pred, ev, subj);
                tagsWritten++;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error(`TAG_FAILED layer ${template.layerId} ${msg}`);
                try { fs.appendFileSync(path.join(root, 'tag-failures.log'), `${Date.now()} TAG_FAILED ${template.layerId} ${msg}\n`, 'utf-8'); } catch (ee) { void (ee as Error).message; }
              }
            }
          }
        }
        settledEntries.push({ layerId: template.layerId, layerNumber: template.layerNumber, anchorPredicate: template.anchorPredicate, ledgerDir: dr.ledgerDir, reportPath: path.join(dr.ledgerDir, 'findings', 'report.md'), status: 'fulfilled', fileBytes: v.fileBytes, fileMtime: v.fileMtime, findings: v.findings, findingsCount: count, tagsWritten, durationMs: v.durationMs });
      } else {
        settledEntries.push({ layerId: template.layerId, layerNumber: template.layerNumber, anchorPredicate: template.anchorPredicate, ledgerDir: dr.ledgerDir, reportPath: path.join(dr.ledgerDir, 'findings', 'report.md'), status: 'rejected', error: (v as { error: string }).error, tagsWritten: 0, durationMs: v.durationMs });
      }
    } else {
      settledEntries.push({ layerId: template.layerId, layerNumber: template.layerNumber, anchorPredicate: template.anchorPredicate, ledgerDir: dr.ledgerDir, reportPath: path.join(dr.ledgerDir, 'findings', 'report.md'), status: 'rejected', error: String((outcome.reason as Error)?.message ?? outcome.reason).slice(0, 500), tagsWritten: 0, durationMs: 0 });
    }
  }
  try {
    const perGatePath = path.join(root, `roster-${gateName.toLowerCase()}.json`);
    fs.writeFileSync(perGatePath, JSON.stringify(settledEntries, null, 2), 'utf-8');
  } catch (e) { void (e as Error).message; }
  // per-gate files are the source of truth; roster.json is the compat view (last-writer-wins under concurrent gates — acceptable: per-gate files remain authoritative)
  try {
    const perGateFiles = ['lasme', 'mpse', 'sro'].map((g) => path.join(root, `roster-${g}.json`));
    const merged: RosterEntry[] = [];
    for (const pf of perGateFiles) {
      if (fs.existsSync(pf)) {
        try {
          const arr = JSON.parse(fs.readFileSync(pf, 'utf-8')) as RosterEntry[];
          if (Array.isArray(arr)) merged.push(...arr);
        } catch (ee) { void (ee as Error).message; }
      }
    }
    const compatPath = path.join(root, 'roster.json');
    if (merged.length > 0) {
      fs.writeFileSync(compatPath, JSON.stringify(merged, null, 2), 'utf-8');
    } else {
      fs.writeFileSync(compatPath, JSON.stringify(settledEntries, null, 2), 'utf-8');
    }
  } catch (e) {
    try { console.warn(`ROSTER_MERGE_WARN: ${(e as Error).message}`); } catch (ee) { void (ee as Error).message; }
    try { fs.writeFileSync(path.join(root, 'roster.json'), JSON.stringify(settledEntries, null, 2), 'utf-8'); } catch (ee) { void (ee as Error).message; }
  }
  // G-W1 adapter: HunterSettlement -> SubagentSettlement
  function toSettlement(h: unknown, layerId: string): SubagentSettlement<unknown> {
    const hh = h as { status: string; findings?: unknown; error?: string };
    if (hh.status === 'fulfilled') return { subagentId: layerId, status: 'fulfilled', value: hh.findings as never };
    return { subagentId: layerId, status: 'rejected', reason: new Error(String(hh.error ?? 'unknown')) };
  }
  const hunterSettlements: unknown[] = allSettled.map((o, idx) => {
    const lid = dispatchResults[idx]!.template.layerId;
    if (o.status === 'fulfilled') return o.value;
    return { layerId: lid, status: 'rejected', error: String((o.reason as Error)?.message ?? o.reason), ledgerDir: dispatchResults[idx]!.ledgerDir, durationMs: 0 };
  });
  const settlements: SubagentSettlement<unknown>[] = hunterSettlements.map((h, idx) => toSettlement(h, dispatchResults[idx]!.template.layerId));

  // G-W2..G-W4: gates + synthesis + memory setGateOutput
  let synthesisResult: unknown = null;
  try {
    const mem = new SQLiteMemoryStore(sharedDbPath);
    let g: GraphifyGraph | null = null;
    try { g = mem.getGraph() as GraphifyGraph | null; } catch (e) { void (e as Error).message; }
    const graphForSynth: GraphifyGraph = (g ?? { nodes: [], edges: [], communities: [], godNodes: [] }) as GraphifyGraph;
    const emptyGraph: GraphifyGraph = { nodes: [], edges: [], communities: [], godNodes: [] };
    if (gateName === 'LASME') {
      for (const gate of lasmePreGates()) {
        try { const r = await gate.check({ targetPath: path.resolve(ledgerRoot) } as never); if (!r.passed) console.warn(`[aether-meta] preGate ${gate.name} failed: ${r.reason}`); } catch (e) { void (e as Error).message; }
      }
      try { synthesisResult = await lasmeSynthesize(settlements as never, graphForSynth, mem as never); } catch (e) { console.warn(`[aether-meta] lasmeSynthesize failed: ${e instanceof Error ? e.message : String(e)}`); synthesisResult = { candidates: [], graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' }, error: String(e instanceof Error ? e.message : e) }; }
      for (const gate of lasmePostGates()) {
        try { const r = await gate.check(synthesisResult as never); if (!r.passed) console.warn(`[aether-meta] postGate ${gate.name} failed: ${r.reason}`); } catch (e) { void (e as Error).message; }
      }
    } else if (gateName === 'MPSE') {
      const mpseTarget = { targetRoot: path.resolve(ledgerRoot), specs: [], specPaths: [], memory: mem, graph: graphForSynth } as unknown as never;
      for (const gate of createMpsePreGates()) {
        try { const r = await gate.check(mpseTarget); if (!r.passed) console.warn(`[aether-meta] preGate ${gate.name} failed: ${r.reason}`); } catch (e) { void (e as Error).message; }
      }
      try { synthesisResult = await mpseSynthesize(settlements as never, graphForSynth, mem as never); } catch (e) { console.warn(`[aether-meta] mpseSynthesize failed: ${e instanceof Error ? e.message : String(e)}`); synthesisResult = { conformanceMatrix: [], violations: [], traceGaps: [], error: String(e instanceof Error ? e.message : e) }; }
      for (const gate of createMpsePostGates()) {
        try { const r = await gate.check(synthesisResult as never); if (!r.passed) console.warn(`[aether-meta] postGate ${gate.name} failed: ${r.reason}`); } catch (e) { void (e as Error).message; }
      }
    } else if (gateName === 'SRO') {
      const sroTarget = { targetRoot: path.resolve(ledgerRoot), specs: [], specPaths: [], memory: mem, graph: graphForSynth } as unknown as never;
      for (const gate of createSroPreGates()) {
        try { const r = await gate.check(sroTarget); if (!r.passed) console.warn(`[aether-meta] preGate ${gate.name} failed: ${r.reason}`); } catch (e) { void (e as Error).message; }
      }
      try { synthesisResult = await sroSynthesize(settlements as never, graphForSynth, mem as never); } catch (e) { console.warn(`[aether-meta] sroSynthesize failed: ${e instanceof Error ? e.message : String(e)}`); synthesisResult = { blastRadius: [], deadCode: [], cycles: [], correlations: [], error: String(e instanceof Error ? e.message : e) }; }
      for (const gate of createSroPostGates()) {
        try { const r = await gate.check(synthesisResult as never); if (!r.passed) console.warn(`[aether-meta] postGate ${gate.name} failed: ${r.reason}`); } catch (e) { void (e as Error).message; }
      }
    }
    if (synthesisResult !== null) {
      try {
        const resultsForStore = settlements as unknown as SubagentSettlement<unknown>[];
        mem.setGateOutput(gateName, { gateName, synthesis: synthesisResult, results: resultsForStore, telemetry: { durationMs: Date.now() - 0, subagentCount: settlements.length, fulfilledCount: settlements.filter(s => s.status==='fulfilled').length, rejectedCount: settlements.filter(s => s.status==='rejected').length, totalTokensIn: 0, totalTokensOut: 0 } } as never);
      } catch (e) { console.warn(`[aether-meta] setGateOutput failed: ${e instanceof Error ? e.message : String(e)}`); }
    }
    try { mem.close(); } catch (e) { void (e as Error).message; }
    void emptyGraph;
  } catch (e) { console.warn(`[aether-meta] synthesis wiring failed: ${e instanceof Error ? e.message : String(e)}`); }

  const sorted = [...settledEntries].sort((a, b) => a.layerNumber - b.layerNumber);
  const gateHeader = `## ${gateName}\n`;
  const stitchBody = buildStitchContent(sorted);
  const correlationSection = buildCorrelationSection(sharedDbPath);
  const gateBlock = gateHeader + stitchBody + correlationSection;
  const resolvedDoc2 = path.resolve(doc2Path);
  fs.appendFileSync(resolvedDoc2, gateBlock, 'utf-8');
  const gateSectionLines = gateBlock.split('\n').length;
  let metaTelemetry: unknown = null;
  try {
    const metaTemplate: AuditorTemplate = {
      layerId: `${gateName.toLowerCase()}-meta`,
      anchorPredicate: `${gateName.toLowerCase()}-meta`,
      layerNumber: sorted[0]?.layerNumber ?? 0,
      staticPrompt: `META ORCHESTRATOR ${gateName}: stitch verbatim done. Review the stitched doc2 + graph digest and append your analysis to doc1 via write_meta_doc. WRITE TARGET: doc1Path=${path.resolve(doc1Path)} — you MUST call write_meta_doc with path="${path.resolve(doc1Path)}" and content containing "## ${gateName} META".`,
      outputSchema: roster[0]!.outputSchema as never,
      graphQueries: ['show merged graph'],
    };
    void metaTemplate;
    const rosterManifestText = JSON.stringify(settledEntries, null, 2);
    const priorSections = fs.existsSync(path.resolve(doc1Path)) ? fs.readFileSync(path.resolve(doc1Path), 'utf-8').slice(0, 8000) : '';
    const graphDigest = `graph digest: ${settledEntries.filter((e) => e.status === 'fulfilled').length}/${settledEntries.length} fulfilled, tags pending`;
    const metaInputData = `doc1Path: ${path.resolve(doc1Path)}\ndoc2Path: ${path.resolve(doc2Path)}\nWRITE TARGET: write_meta_doc path MUST be ${path.resolve(doc1Path)} with "## ${gateName} META" header\n\nroster manifest:\n${rosterManifestText}\n\ngraph digest: ${graphDigest}\n\nprior meta sections (truncated):\n${priorSections.slice(0, 3000)}\n`;
    const metaBrief = metaTemplate.staticPrompt + '\n\n[INPUT DATA]\n' + metaInputData;
    const metaLedger = path.join(root, `_meta-${gateName.toLowerCase()}`);
    ensureDir(metaLedger);
    const metaBriefPath = path.join(metaLedger, 'brief.md');
    fs.writeFileSync(metaBriefPath, metaBrief, 'utf-8');
    if (typeof (globalThis as unknown as { __aetherScriptedRun?: unknown }).__aetherScriptedRun === 'function') {
      metaTelemetry = { scripted: true, skipped: false };
    } else {
      const metaTools = buildMetaTools(doc1Path, doc2Path, graph);
      const metaAgent = new AetherAgent({ ledgerId: `meta-${gateName}-${Date.now()}` });
      const metaResult = await metaAgent.run({ promptFilePath: metaBriefPath, systemPrompt: `You are the ${gateName} meta aether orchestrator.`, targetRoot: path.resolve(ledgerRoot), ledgerRoot: metaLedger, specsRoots: [path.resolve(ledgerRoot)], maxRounds: 2, tools: metaTools } as never);
      metaTelemetry = { roundsUsed: metaResult.roundsUsed, toolCallsMade: metaResult.toolCallsMade, toolCallNames: (metaResult as unknown as { toolCallNames?: string[] }).toolCallNames ?? [], errors: metaResult.errors };
      const cur = fs.existsSync(path.resolve(doc1Path)) ? fs.readFileSync(path.resolve(doc1Path), 'utf-8') : '';
      const hasMetaSection = cur.includes(`## ${gateName} META`) || cur.includes(`## ${gateName}\n`);
      if (!hasMetaSection) {
        throw new Error('META_DOC_SECTION_MISSING: gate ' + gateName + ' meta agent did not write ## ' + gateName + ' META section to ' + path.resolve(doc1Path));
      }
    }
    const isScripted = typeof (globalThis as unknown as { __aetherScriptedRun?: unknown }).__aetherScriptedRun === 'function';
    if (isScripted) {
      const cur2 = fs.existsSync(path.resolve(doc1Path)) ? fs.readFileSync(path.resolve(doc1Path), 'utf-8') : '';
      if (!cur2.includes(`## ${gateName} META`)) {
        fs.appendFileSync(path.resolve(doc1Path), `\n## ${gateName} META\nScripted meta review for ${gateName}: ${settledEntries.length} hunters in roster, ${settledEntries.filter((e) => e.status === 'fulfilled').length} fulfilled.\n`, 'utf-8');
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      fs.appendFileSync(path.resolve(doc1Path), `\n## ${gateName} META [META_RUN_FAILED: ${msg.slice(0, 300)}]\n`, 'utf-8');
    } catch (ee) { void (ee as Error).message; }
    metaTelemetry = { error: msg.slice(0, 500) };
  }
  const graphTagCount = countGraphTags(sharedDbPath);
  return { gateName, roster: settledEntries, doc1Path: path.resolve(doc1Path), doc2Path: resolvedDoc2, docSectionsWritten: sorted.length, gateSectionLines, graphTagCount, metaTelemetry };
}
