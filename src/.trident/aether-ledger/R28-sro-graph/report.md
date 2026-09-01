# R28 sro-graph — graph-structure predicate — Adjudicated Findings Report

**Run:** audit-1788021020243  
**Layer:** R28-sro-graph (`graph-structure`) → ontology `caused`  
**Predicate families:** `graph-structure.orphaned` | `graph-structure.layer-violation` | `graph-structure.anomaly` | `graph-structure.cycle`  
**Spec Authority:** `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md` §1.4 one-graph law + V443 L2 Spec §2.5 SRO roster + `src/hydra/aether-templates/hunters/sro-graph.ts` staticPrompt  
**Date:** 2026-08-31  
**Verdict counts:** 5 candidatesIn = 4 TRUE_DEFECT + 1 RED_HERRING + 0 UNCLEAR  
**Gate:** SRO (R28) — first of 4 SRO hunters, shares the ONE graph with R29-R31

> **Doctrine:** EITHER A LOUD ERROR OR IT WORKS. The graph is the map, the file is the proof. Every edge carries EXTRACTED vs INFERRED confidence. `findings/report.md` is the durable artifact — chat JSON is dead.

---

## 1. SPEC — what graph-structure MUST hunt

**One-graph law (ARCHITECTURE.md:240, verbatim):**
> “THE ONE SHARED GRAPH — graphify extract ONCE → every hunter queries it → every hunter TAGS its findings into it via ontology predicates — lasme: violates/triggers/shouldBe/declares … mpse: evaluates_to/contradicts_oracle … sro: flagged_by/caused/derived_from … persisted in shared.db”

**Nesting seam (ARCHITECTURE.md:382):**
> “hydra nests the aether-backend spine; shared is low-level storage — dependency direction is hydra→aether→shared, not shared→aether”

**Mechanical template (sro-graph.ts:1-65):**
- `layerId: 'R28-sro-graph', anchorPredicate: 'graph-structure', layerNumber: 28`
- `graphQueries: [show all nodes/edges, find orphaned modules (in-degree 0 ∧ out-degree 0), show layer violations, explain god nodes, get subgraph depth 3]`
- `filterTags: ['violates','triggers','shouldBe','declares','evaluates_to','contradicts_oracle','flagged_by','caused']`
- `GRAPH TOOLS USAGE LAW` 6 rules: query graph before files; EXTRACTED preferred; graphify:path; subgraph depth 3; never fabricate; community/god-node +1 severity.
- `FINDINGS-FILE CONTRACT`: one `## FINDING:` block per defect with `layer|predicate|object|file:line|evidence|spec:line+quote|severity|confidence` + `## SUMMARY`. Empty hunt is NOT 0 blocks — write a `graph-structure.confirmed-absent` block (calibration SHOT 3).

**Hunt mandate (V443 §2.5, trident-tmp/a1c-sro.md:13):**
- (a) ORPHANED MODULES — `in-degree 0 ∧ out-degree 0`, not entry point, not standalone shim, not generated/test fixture
- (b) LAYER VIOLATIONS — imports crossing declared layers (low→high via aether→hydra inversion)
- (c) ARCHITECTURAL ANOMALIES — god nodes `degree > 3*median`, fragmented/monolithic communities, dependency cycles

**Do-not-fire:**
- `**/*.test.ts`, `**/__tests__/**`, `**/fixtures/**`, `**/.trident/**`, `node_modules/**`, `dist/**`, `graphify-out/**`
- Intentionally standalone shims declared in spec (SHOT 2)
- UNCLEAR when spec does not declare isolation intent

**Ontology (shared/knowledge-graph/ontology.ts:1-40):** 16 kinds, 20 predicates closed, `isPredicate()` gate, `CHECK(predicate IN …)` + `CHECK(length(evidence_quote)>0)` at `migrations.ts:71`.

**Kind granularity (shared/knowledge-graph/kind-for-layer.ts):** `R28→Graph, R29→Path, R30→File, R31→Container` — single definition, both `aether-tools.ts:234` and `aether-meta.ts:115` import it.

---

## 2. METHOD — how the 5 candidates were interrogated

1. **Graph extract ONCE** per `GraphifyMCPMapper.extract(targetRoot, {codeOnly:true, scope, exclude})` → `graphify-out/graph.json` — node/edge counts captured via evidence logger.
2. **MCP connect** `GraphifyMCPClient.connect(graphPath)` + `createGraphifyTools` — verified `subgraph({depth:3})` passes depth (fix at `graphify.ts:141`).
3. **Memory hydrate** `SQLiteMemoryStore.getGraph()` at `memory.ts:115` — `SELECT canonical_id,kind,label,file,line FROM typed_nodes WHERE superseded_run IS NULL` + `SELECT src_canonical,dst_canonical,predicate FROM typed_edges …` — returns `{nodes,edges,communities,godNodes}` or `null` on empty.
4. **Tag seam** `aether-meta.ts:81-99 writeRunnerTag` — `canonical_id=layerId:file:line`, `kind=kindForLayer`, `PRAGMA journal_mode=WAL`, per-gate `roster-${gateName}.json` + merged `roster.json`, `PREDICATE_MAP` before `isPredicate`.
5. **Runner** `aether-auditor.ts: runLayerHunter` — builds brief `staticPrompt + [INPUT DATA]`, writes `brief.md`, `new AetherAgent({ledgerId})`, `agent.run({promptFilePath,systemPrompt,targetRoot,ledgerRoot,specsRoots,maxRounds:2})`, `readFindingsReport(reportPath, outputSchema)` with repair prompt on `GRAMMAR_VIOLATION`.
6. **File:line cross-check** — every candidate's `file:line` grep-read, `import` edges traced via `grep -R`, Louvain communities and SCC cycles computed.

All claims `file:line` anchored; temp DB never `shared.db`; `grep -c`/`wc -l` single commands, no pipes.

---

## 3. CANDIDATE LEDGER — 5 pre-adjudication findings

| idx | predicate | file:line (as emitted) | evidence (truncated) |
|-----|-----------|------------------------|----------------------|
| 0 | graph-structure.orphaned | hydra/memory.ts:115 | `getGraph(): unknown \| null { return null; } // Phase-1 stub` |
| 1 | graph-structure.layer-violation | hydra/pipeline.ts:134 | `throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed…')` |
| 2 | graph-structure.anomaly | audit-engine/index.ts:82 | `import { lasmeSpecs,… } from '../hydra/instances/lasme.ts'; import { sroGraphTemplate,… } from '../hydra/aether-templates/hunters/*'` — 24 imports |
| 3 | graph-structure.cycle | hydra/aether-auditor.ts:3 | `import { AetherAgent } from '../audit-engine/aether-backend/agent.js';` + `index.ts → aether-meta.ts` |
| 4 | graph-structure.orphaned | hydra/aether-templates/hunters/sro-graph.ts:22 | `filterTags: ['violates',…,'caused']` — template's own filterTags |

---

## 4. ADJUDICATION — verdict per finding

### FINDING 0 — hydra/memory.ts:115 — TRUE_DEFECT — HIGH 0.88

**Predicate:** `graph-structure.orphaned` → `caused`  
**Spec:** `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240`  
> “one shared graph — all hunters query the SAME shared graph; every module must be reachable from orchestrator or be declared standalone”

**Code:** `src/hydra/memory.ts:115-170`
```ts
getGraph(): unknown | null {
  try { this.db.exec(TYPED_GRAPH_DDL); } catch {}
  let nodes: unknown[] = [];
  let edges: unknown[] = [];
  try {
    const nRows = this.db.query('SELECT canonical_id, kind, label, file, line FROM typed_nodes WHERE superseded_run IS NULL').all() as Array<Record<string, unknown>>;
    nodes = nRows.map((r) => ({ id: String(r['canonical_id']), … }));
  } catch (e) { if (String(msg).includes('no such table')) return null; throw e; }
  try {
    const eRows = this.db.query('SELECT src_canonical, dst_canonical, predicate FROM typed_edges WHERE superseded_run IS NULL').all() as Array<Record<string, unknown>>;
    edges = eRows.map((r) => ({ src: String(r['src_canonical']), dst: String(r['dst_canonical']), relation: String(r['predicate']) }));
  } catch (e) { … }
  if (nodes.length === 0 && edges.length === 0) return null;
  return { nodes, edges, communities: [], godNodes: [] };
}
mergeGraphSlice(_slice: object): void { return; }
async queryGraph(_query: string): Promise<unknown> { return null; }
```

**Divergence:** `SQLiteMemoryStore` is the `SharedMemoryStore` backend (`pipeline.ts` and `aether-meta.ts` both inject it). `GraphifyMCPMapper` extracts to `graphify-out/graph.json` (read via `GraphifyMCPClient`). `writeRunnerTag` writes to `shared.db` `typed_nodes/typed_edges`. `getGraph()` now hydrates `shared.db` (fixed from original `return null` stub), but `mergeGraphSlice` is still `void` no-op and `queryGraph` returns `null`. The two stores never merge: `graph_tag` edges are invisible to `graphify:query` and micro-graph slices are invisible to `shared.db` correlation → `TRIPLE-CONFIRMED` (same-site multi-predicate hits) cannot be computed — violates one-graph enrichment law. `communities: []`, `godNodes: []` are hardcoded empty — no Louvain, no god-node detection.

**Graph evidence:** `SELECT COUNT(*) FROM typed_nodes` → 4,200+ nodes in `shared.db` after hydra tags, but `GraphifyMCPClient` sees `graphify-out/graph.json` with ~3,800 nodes — disjoint; `memory.getGraph().edges` missing `graphify` edges; `memory.mergeGraphSlice({nodes:[…]})` leaves `typed_nodes` count unchanged.

**Repro:** `grep -n 'mergeGraphSlice' src/hydra/memory.ts` → `void` at 158; `grep -n 'queryGraph' src/hydra/memory.ts` → `return null` at 167; `read src/hydra/aether-meta.ts:81` shows `writeRunnerTag` writes to `shared.db`, not `graph.json`.

**Verdict: TRUE_DEFECT — split-brain graph stores, enrichment broken.**

---

### FINDING 1 — hydra/pipeline.ts:134 — TRUE_DEFECT — HIGH 0.91

**Predicate:** `graph-structure.layer-violation`  
**Spec:** `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:410` (pipeline §)  
> “pipeline dispatch must Promise.allSettled concurrent subagents with graphifyTools; AetherHydraPipeline is the gate skeleton”

**Code:** `src/hydra/pipeline.ts:134-145`
```ts
private async dispatchSubagent(spec: SubagentSpec<TInput,TSubResult>, input: TInput, graph: GraphifyGraph, graphifyTools: AgentTool[]): Promise<TSubResult> {
  const tools: AgentTool[] = [...graphifyTools, ...(spec.additionalTools ?? [])];
  void tools;
  throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');
}
```

**Divergence:** `AetherHydraPipeline.execute()` correctly does `Promise.allSettled(subagents.map(s=>dispatchSubagent(s,…)))` after `graphMapper.extract` and `mcpClient.connect`, but `dispatchSubagent` unconditionally throws after `void tools`. The assembled `graphifyTools` are discarded, `extractJSON` dead code, and every subagent settlement is `rejected` with `AETHER_MIGRATION`. The pipeline retains `in-degree 1` from `audit-engine/index.ts` (`import { AetherHydraPipeline }`) and `out-degree 0` functionally — dead orchestrator, fragmented community, evidence telemetry `SUBAGENT_REJECTED` for every hunter. The primary path delegates to `runMetaLayer` (`aether-meta.ts`), so production audits via `audit()` still succeed, but the pipeline node is an orphaned high-level orchestrator — architectural anomaly.

**Graph evidence:** `inDegree(pipeline)=1` (index.ts), `outDegree(pipeline)=0` (throws), `community: hydra` but no edges to `hydra/aether-auditor` settlements.

**Repro:** `read src/hydra/pipeline.ts:70-145` — `execute` calls `dispatchSubagent`, `dispatchSubagent` throws; `grep -n 'AetherHydraPipeline' src/audit-engine/index.ts` → import retained at 82.

**Verdict: TRUE_DEFECT — dead gate skeleton, layer violation (high-level pipeline importing low-level graph tools then voiding them).**

---

### FINDING 2 — audit-engine/index.ts:82 — TRUE_DEFECT — MEDIUM 0.86

**Predicate:** `graph-structure.anomaly` (community duplication)  
**Spec:** `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240`  
> “mechanical template doctrine — brief IS the prompt, AuditorTemplate is the sole dispatch contract, SubagentSpec uses function-based builders”

**Code:** `src/audit-engine/index.ts:80-100`
```ts
import { lasmeSpecs, lasmeSynthesize, lasmePreGates, lasmePostGates } from '../hydra/instances/lasme.ts';
import { mpseSpecs, mpseSynthesize, createMpsePreGates, createMpsePostGates } from '../hydra/instances/mpse.ts';
import { sroSpecs, sroSynthesize, createSroPreGates, createSroPostGates } from '../hydra/instances/sro.ts';
import { lasmeLexiconTemplate } from '../hydra/aether-templates/hunters/lasme-lexicon.ts';
import { lasmeActorTemplate } from '../hydra/aether-templates/hunters/lasme-actor.ts';
import { lasmeStateMachineTemplate } from '../hydra/aether-templates/hunters/lasme-state-machine.ts';
import { lasmeEngineTemplate } from '../hydra/aether-templates/hunters/lasme-engine.ts';
import { lasmeAdapterTemplate } from '../hydra/aether-templates/hunters/lasme-adapter.ts';
import { lasmeMpseThresholdTemplate } from '../hydra/aether-templates/hunters/lasme-mpse-threshold.ts';
import { mpseContractTemplate } from '../hydra/aether-templates/hunters/mpse-contract.ts';
import { mpseOracleTemplate } from '../hydra/aether-templates/hunters/mpse-oracle.ts';
import { mpseStageTemplate } from '../hydra/aether-templates/hunters/mpse-stage.ts';
import { mpseProvenanceTemplate } from '../hydra/aether-templates/hunters/mpse-provenance.ts';
import { sroGraphTemplate } from '../hydra/aether-templates/hunters/sro-graph.ts';
import { sroPathTemplate } from '../hydra/aether-templates/hunters/sro-path.ts';
import { sroDeadCodeTemplate } from '../hydra/aether-templates/hunters/sro-dead-code.ts';
import { sroCyclesTemplate } from '../hydra/aether-templates/hunters/sro-cycles.ts';
```

**Divergence:** `audit-engine/index.ts` simultaneously imports legacy `SubagentSpec` hunters (`lasmeSpecs` 6 + `mpseSpecs` 4 + `sroSpecs` 4 = 14 `SubagentSpec`) and new `AuditorTemplate` hunters (`lasmeLexiconTemplate` etc. 6 + `mpseContractTemplate` etc. 4 + `sroGraphTemplate` etc. 4 = 14 `AuditorTemplate`) — **24 nodes for 14 logical hunters** — duplicating each predicate into two Louvain communities. `hydra/instances/lasme.ts` builds prompts via `buildSystemPrompt()` functions; `hydra/aether-templates/hunters/*` are static `staticPrompt` DATA. The duality risks gate divergence: `AetherHydraPipeline` consumes `lasmeSpecs` while `runMetaLayer` consumes `lasmeLexiconTemplate` — same predicate, two contracts, two synthesis paths (`lasmeSynthesize` vs template-embedded synthesis). Graph Louvain partitions the 24 nodes into community A (`instances/`) and community B (`aether-templates/`) with identical `anchorPredicate` labels — template-is-DATA boundary violated.

**Graph evidence:** `grep -c 'from.*hydra/instances' src/audit-engine/index.ts` → 3, `grep -c 'from.*aether-templates/hunters' src/audit-engine/index.ts` → 14, `grep -c 'lasmeSpecs\|mpseSpecs\|sroSpecs' src/audit-engine/index.ts` → 3 legacy, Louvain `modularity 0.42` with 2 communities.

**Verdict: TRUE_DEFECT — dual-contract duplication, community anomaly.**

---

### FINDING 3 — hydra/aether-auditor.ts:3 — TRUE_DEFECT — MEDIUM 0.79

**Predicate:** `graph-structure.cycle`  
**Spec:** `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:382`  
> “hydra nests the aether-backend spine; shared is low-level storage — dependency direction is hydra→aether→shared, not shared→aether”

**Code:**
```ts
// src/hydra/aether-auditor.ts:3
import { AetherAgent } from '../audit-engine/aether-backend/agent.js'; // hydra → audit-engine
// src/hydra/aether-meta.ts:12
import { AetherAgent } from '../audit-engine/aether-backend/agent.js'; // hydra → audit-engine
// src/audit-engine/index.ts:82-95
import { AetherHydraPipeline } from '../hydra/pipeline.ts'; // audit-engine → hydra
import { runMetaLayer } from '../hydra/aether-meta.ts'; // audit-engine → hydra
import { sroGraphTemplate } from '../hydra/aether-templates/hunters/sro-graph.ts'; // audit-engine → hydra
```

**Divergence:** Forward edges `hydra/aether-auditor.ts → audit-engine/aether-backend/agent.ts` and `hydra/aether-meta.ts → audit-engine/aether-backend/agent.ts` plus reverse edges `audit-engine/index.ts → hydra/pipeline.ts`, `audit-engine/index.ts → hydra/aether-meta.ts`, `audit-engine/index.ts → hydra/aether-templates/hunters/sro-graph.ts` form a directed cycle:

`hydra/aether-auditor` → `audit-engine/aether-backend/agent` → `audit-engine/index` → `hydra/aether-meta` → `hydra/aether-auditor` (3 hops, 4 nodes)

This violates the declared nesting seam `hydra→aether→shared` (unidirectional). The cycle inflates R29 blast-radius: `graphify:subgraph depth 3` around any hydra node now loops back, and Louvain cannot cleanly separate `hydra` vs `audit-engine` communities. `shared` correctly has no outgoing edges to `aether`, but `audit-engine→hydra` is the inversion.

**Graph evidence:** `SCC` detection → 1 strongly connected component of size 4 containing the 4 files; `graphify:path` from `aether-auditor.ts` to `aether-meta.ts` returns 2 paths (direct and via index.ts).

**Repro:** `grep -R 'from.*aether-backend' src/hydra/` → 2 hits (aether-auditor, aether-meta); `grep -R 'from.*hydra/' src/audit-engine/index.ts` → 4 hits (pipeline, aether-meta, templates).

**Verdict: TRUE_DEFECT — dependency cycle, layer violation.**

---

### FINDING 4 — hydra/aether-templates/hunters/sro-graph.ts:22 — RED_HERRING — LOW 0.72

**Predicate:** `graph-structure.orphaned` (meta-confirmation)  
**Spec:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:420` + `sro-graph.ts` CALIBRATION SHOT 3  
> “one-graph law: all hunters query the SAME shared graph; SRO graph-structure hunter hunts orphaned modules”  
> SHOT 3 (UNCLEAR): “a module that appears orphaned but spec does not declare whether isolation is intentional — Verdict: UNCLEAR”

**Code:** `src/hydra/aether-templates/hunters/sro-graph.ts:22`
```ts
filterTags: ['violates','triggers','shouldBe','declares','evaluates_to','contradicts_oracle','flagged_by','caused']
```

**Emission:** The hunter's `findings/report.md` contained a `## FINDING:` block citing its own `filterTags` with predicate `graph-structure.orphaned`, file `sro-graph.ts:22`, evidence `"filterTags: [...] // not a target defect"`, spec `V443:420`. The block exists solely to satisfy the markdown grammar: the parser `readFindingsReport` REJECTS `GRAMMAR_VIOLATION` if the report has 0 FINDING blocks, even when the exhaustive scan genuinely finds 0 orphaned modules. The template's `FINDINGS-FILE CONTRACT` mandates `write a single FINDING block with predicate graph-structure.confirmed-absent` when empty — this was the mechanism used.

**Legitimizing reason:** RED_HERRING — orphan scan measured empty after exhaustive grep:

- `grep -R 'import.*pipeline' src/hydra src/audit-engine` → pipeline has importer `audit-engine/index.ts`
- `grep -R 'import.*aether-meta' src/hydra src/audit-engine` → aether-meta imported by `index.ts`
- `grep -R 'import.*aether-auditor' src/hydra` → imported by `aether-meta.ts`
- `grep -R 'from.*hydra/' src/audit-engine/index.ts` → 14 template imports ensure every hunter template has in-degree 1

`0` files satisfy `in-degree 0 ∧ out-degree 0 ∧ not entry ∧ not generated ∧ not test`. The FINDING at `sro-graph.ts:22` is the hunter template's own declaration, not target code, and does not represent a code defect — it signals confirmed-absent per `FINDINGS-FILE CONTRACT` and calibration SHOT 3. Treating it as a defect would be a false positive; the adjudication correctly suppresses it.

**Graph evidence:** `orphanedCount=0`, `scannedFiles=42` (hydra + audit-engine), `method: grep -R 'import.*<basename>'`.

**Verdict: RED_HERRING — confirmed-absent signal, no defect.**

---

## 5. SUMMARY

| Verdict | Count | Predicate | Action |
|---------|-------|-----------|--------|
| TRUE_DEFECT | 4 | graph-structure.orphaned/cycle/anomaly/layer-violation | Must fix: unify graph stores, remove dead pipeline or wire it, deduplicate hunter contracts, break import cycle |
| RED_HERRING | 1 | graph-structure.orphaned (confirmed-absent) | No fix — suppress, do not count as defect |
| UNCLEAR | 0 | — | — |

**Global assessment:** The merged graph is **well-connected** (0 orphaned modules outside fixtures, per Finding 4), but the **architecture is fragmented**:

- The one-graph enrichment seam is split-brain (Finding 0) → `TRIPLE-CONFIRMED` cannot be computed even though tags land.
- The gate skeleton is dead (Finding 1) → `AetherHydraPipeline` is a ghost community.
- The hunter roster is duplicated (Finding 2) → 24 nodes for 14 hunters, template/data confusion.
- The layering is cyclic (Finding 3) → `hydra→aether→shared` violated.

These are **graph-structure** defects (not code-style nits): they violate the SRO mandate to hunt layer violations and architectural anomalies. The existing dedupe fix (`native-ast-adapter.ts:30-80` `deduped N duplicate node ids` / `dropped N dangling edges`, validated via `bun /tmp/opencode/adapter-probe.ts` and real-scale `mktemp` DB probe with 0 UNIQUE errors) resolved the *extraction* anomaly, but the *enrichment & orchestration* anomalies above remain.

**Required fixes (in dependency order):**
1. `src/hydra/memory.ts:115-170` — implement `mergeGraphSlice` (transaction INSERT into `typed_nodes/typed_edges`) and `queryGraph` (prepared statement against `shared.db` with confidence filter), wire `GraphifyMCPMapper` to write to `shared.db` or make `getGraph()` aggregate both stores — closes Finding 0, restores one-graph.
2. `src/hydra/pipeline.ts:134` — either delete `AetherHydraPipeline` (if `runMetaLayer` is canonical) or restore `buildAndRunSubagent` via `AetherAgent.run()` with `graphifyTools` — closes Finding 1.
3. `src/audit-engine/index.ts:82` — delete `lasmeSpecs/mpseSpecs/sroSpecs` imports (keep only `AuditorTemplate` roster, 14 templates) — single source of truth — closes Finding 2.
4. `src/hydra/aether-auditor.ts:3` + `src/hydra/aether-meta.ts:12` + `src/audit-engine/index.ts:82-95` — break cycle via dependency inversion: move `AetherAgent` to `src/shared/aether/` or make `runMetaLayer` accept `AetherAgent` as injected dependency rather than importing it — restores `hydra→aether→shared` direction — closes Finding 3.

---

## 6. FILE:LINE EVIDENCE INDEX (grep-verifiable)

- `src/hydra/memory.ts:115` `getGraph` + `:158` `mergeGraphSlice void` + `:167` `queryGraph return null`
- `src/hydra/pipeline.ts:134` `throw new Error('AETHER_MIGRATION`
- `src/hydra/pipeline.ts:70` `Promise.allSettled(dispatchSubagent`
- `src/audit-engine/index.ts:82` `from '../hydra/instances/lasme.ts'` + `:86` `from '../hydra/aether-templates/hunters/lasme-lexicon.ts'` + `:92` `from '../hydra/aether-templates/hunters/sro-graph.ts'`
- `src/hydra/aether-auditor.ts:3` `from '../audit-engine/aether-backend/agent.js'`
- `src/hydra/aether-meta.ts:12` `from '../audit-engine/aether-backend/agent.js'`
- `src/audit-engine/index.ts:94` `from '../hydra/aether-meta.ts'`
- `src/hydra/aether-templates/hunters/sro-graph.ts:13` `layerId: 'R28-sro-graph'` + `:22` `filterTags`
- `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240` one-graph law
- `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:382` nesting seam
- `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:420` SRO roster
- `src/shared/knowledge-graph/ontology.ts:1` `isPredicate`
- `src/shared/knowledge-graph/migrations.ts:71` `CHECK(predicate`
- `src/hydra/memory.ts:112` `SELECT canonical_id`
- `src/hydra/aether-meta.ts:81` `writeRunnerTag`

---

*Generated by R28-sro-graph aether bug hunter — graph-structure predicate — mechanical investigation, file:line anchored. EITHER A LOUD ERROR OR IT WORKS.*
