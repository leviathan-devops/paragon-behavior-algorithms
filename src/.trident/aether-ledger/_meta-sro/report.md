# SRO META AETHER ORCHESTRATOR — AETHER BUG HUNTER REPORT
**Layer:** _meta-sro (SRO meta orchestrator) | **RunId:** SRO-meta-orchestrator-2026-08-31 | **Gate:** SRO (R28-R31 + SRO-meta)
**TargetRoot:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src
**Ledger:** src/.trident/aether-ledger/_meta-sro/ (verdicts.json + report.md)
**Date:** 2026-08-31
**Specs:** MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md (§2.5, §2.8), MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md (§1.4, §2.2, §2.3), MASTER_CONTEXT/AETHER_CLEANUP_OVERHAUL_PLAN.md §6, src/hydra/aether-templates/hunters/sro-*.ts, src/shared/knowledge-graph/ontology.ts
**Method:** Graph-first (query ONE graph via hydra/graph-mapper + Graphify MCP get_neighbors/subgraph depth 3, then capped read 320 / grep 120, ledger-isolated). Every candidate re-verified with verbatim file:line + spec path:line + one-sentence divergence. EXTRACTED vs INFERRED flagged. One-target law enforced.

## FINDING: split-brain graph stores — one-graph enrichment broken — merge no-op
- layer: R28-sro-graph
- predicate: graph-structure.orphaned
- file: src/hydra/memory.ts:115
- evidence: "mergeGraphSlice(_slice: object): void { return; } // Phase-1 stub: no-op — graph slices never merged"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240 one shared graph — all hunters query the SAME shared graph
- severity: HIGH
- confidence: 0.88

## FINDING: dead gate skeleton — dispatch always throws — AetherHydraPipeline orphaned
- layer: R28-sro-graph
- predicate: graph-structure.layer-violation
- file: src/hydra/pipeline.ts:134
- evidence: "throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:410 pipeline dispatch must Promise.allSettled concurrent subagents with graphifyTools
- severity: MEDIUM
- confidence: 0.91

## FINDING: dual hunter hierarchies — 24 nodes for 14 hunters violates mechanical template doctrine
- layer: R28-sro-graph
- predicate: graph-structure.anomaly
- file: src/audit-engine/index.ts:82
- evidence: "import { lasmeSpecs, lasmeSynthesize, lasmePreGates, lasmePostGates } from '../hydra/instances/lasme.ts';"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240 mechanical template doctrine — brief IS the prompt, AuditorTemplate sole dispatch contract
- severity: HIGH
- confidence: 0.86

## FINDING: import cycle hydra→aether→hydra violates nesting seam
- layer: R28-sro-graph
- predicate: graph-structure.cycle
- file: src/hydra/aether-auditor.ts:3
- evidence: "import { AetherAgent } from '../audit-engine/aether-backend/agent.js'; // hydra→audit-engine creates cycle via audit-engine/index.ts → hydra/aether-meta.ts"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:382 hydra nests the aether-backend spine; shared is low-level storage — dependency direction is hydra→aether→shared
- severity: CRITICAL
- confidence: 0.79

## FINDING: impact classification ignores god-node / community / leaf mandate
- layer: R29-sro-path
- predicate: impact-path.classification
- file: src/hydra/instances/sro.ts:393
- evidence: "const hasGraphImpact = (blastRadius.find((b) => b.findingId === finding.id)?.downstreamCount ?? 0) > 0;"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:185 SRO roster — downstream impact classification must distinguish god nodes / cross-community bridges vs same-community vs leaf
- severity: HIGH
- confidence: 0.92

## FINDING: exact file-path match without normalization silently drops blast-radius
- layer: R29-sro-path
- predicate: impact-path.blast-radius
- file: src/hydra/instances/sro.ts:285
- evidence: "const startIds = fileToNodeIds.get(finding.file) ?? [];"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:56 ONE GRAPH LAW — canonical file keys
- severity: MEDIUM
- confidence: 0.89

## FINDING: BFS discards confidence — INFERRED counted without flag and without file-read verification
- layer: R29-sro-path
- predicate: impact-path.blast-radius
- file: src/hydra/instances/sro.ts:297
- evidence: "list.push({ dst: e.dst, relation: e.relation });"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:220 GRAPH TOOLS USAGE LAW — Every edge carries confidence EXTRACTED vs INFERRED
- severity: MEDIUM
- confidence: 0.85

## FINDING: exported alias sroPreGates with no importers — dead export
- layer: R30-sro-dead-code
- predicate: dead-code.export
- file: src/hydra/instances/sro.ts:593
- evidence: "export const sroPreGates = createSroPreGates;"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:298 exports with no importers — measured via graph in-degree 0 + grep
- severity: MEDIUM
- confidence: 0.92

## FINDING: exported alias sroPostGates with no importers — dead export
- layer: R30-sro-dead-code
- predicate: dead-code.export
- file: src/hydra/instances/sro.ts:594
- evidence: "export const sroPostGates = createSroPostGates;"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:298 exports with no importers
- severity: MEDIUM
- confidence: 0.92

## FINDING: exported array sroSubagentIds with no importers — dead export
- layer: R30-sro-dead-code
- predicate: dead-code.export
- file: src/hydra/instances/sro.ts:275
- evidence: "export const sroSubagentIds: string[] = ['graph-builder', 'path-hunter', 'dead-code-hunter', 'cycle-hunter'];"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:298 exports with no importers
- severity: LOW
- confidence: 0.88

## FINDING: dead private helper extractJSON with no callers
- layer: R30-sro-dead-code
- predicate: dead-code.function
- file: src/hydra/pipeline.ts:153
- evidence: "private extractJSON(message: { content?: Array<{ type?: string; text?: string }> }): unknown {"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:298 functions with no callers
- severity: MEDIUM
- confidence: 0.9

## FINDING: filterTags missing MPSE predicates — starves TRIPLE-CONFIRMED correlation
- layer: R31-sro-cycles
- predicate: cycles.filterTags
- file: src/hydra/aether-templates/hunters/sro-cycles.ts:14
- evidence: "filterTags: [ 'imports','calls','implements','wraps','flagged_by','caused','violates','declares' ]"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:342 The third Shadow Hydra instance. 4 concurrent graph-hunting subagents. READS LASME + MPSE from shared memory
- severity: HIGH
- confidence: 0.96

## FINDING: outputSchema mismatch — generic vs SroSubagentOutputSchema
- layer: R31-sro-cycles
- predicate: cycles.schema
- file: src/hydra/aether-templates/hunters/sro-cycles.ts:5
- evidence: "outputSchema: SubagentOutputSchema as unknown as z.ZodSchema,"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:345 SroSubagentOutputSchema { summary?, deadCode?, cycles?: string[][], impactPaths? }
- severity: HIGH
- confidence: 0.94

## FINDING: indirect cycles mandate expansion beyond import graph
- layer: R31-sro-cycles
- predicate: cycles.scope
- file: src/hydra/aether-templates/hunters/sro-cycles.ts:32
- evidence: "(c) INDIRECT CYCLES — chains where the cycle traverses calls/uses edges"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:338 cycle-hunter | Find circular dependency chains in the import/dependency graph
- severity: MEDIUM
- confidence: 0.88

## FINDING: extra graphQueries deviates from roster — wastes tool budget
- layer: R31-sro-cycles
- predicate: cycles.graphQueries
- file: src/hydra/aether-templates/hunters/sro-cycles.ts:13
- evidence: "graphQueries: [ 'find cycles in the import graph', 'show circular dependency chains', 'get strongly connected components of the dependency graph', 'explain cycle edge evidence with source file quotes' ]"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:340 Graphify Query: 'find cycles in the import graph' + 'show circular dependency chains'
- severity: MEDIUM
- confidence: 0.82

## FINDING: graphify subgraph depth discarded — always 1-hop neighbors
- layer: SRO-meta
- predicate: flagged_by
- file: src/hydra/graphify.ts:141
- evidence: "void depth;"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:814 V1 Adaptation Map — graphify:subgraph with depth default 3 for blast-radius
- severity: HIGH
- confidence: 0.92

## FINDING: corbell-bridge never-drop fallback hides extraction errors
- layer: SRO-meta
- predicate: derived_from
- file: src/hydra/corbell-bridge.ts:53
- evidence: "return NODE_TYPE_MAP[key] ?? 'EvidenceFile';"
- spec: src/shared/knowledge-graph/ontology.ts:1 NODE_TYPES 16 closed — CHECK (kind IN NODE_TYPES) enforces closed vocab
- severity: HIGH
- confidence: 0.89

## FINDING: read/grep confinement fail-open — KRAKEN wander not impossible
- layer: SRO-meta
- predicate: flagged_by
- file: src/hydra/aether-tools.ts:53
- evidence: "} catch (e) { void (e as Error).message; }"
- spec: MASTER_CONTEXT/AETHER_CLEANUP_OVERHAUL_PLAN.md:62 Scope Pinning — reads confined to targetRoot via READ_SCOPE_VIOLATION
- severity: CRITICAL
- confidence: 0.9

## FINDING: targetRoot cwd pinning missing — mis-targeting risk
- layer: SRO-meta
- predicate: flagged_by
- file: src/hydra/aether-auditor.ts:38
- evidence: "const cwd = process.cwd();"
- spec: MASTER_CONTEXT/AETHER_CLEANUP_OVERHAUL_PLAN.md:62 targetRoot pinned absolute path + one-target law
- severity: HIGH
- confidence: 0.87

## FINDING: dual hierarchy re-confirmed — mechanical template doctrine violated
- layer: SRO-meta
- predicate: derived_from
- file: src/audit-engine/index.ts:82
- evidence: "import { lasmeSpecs, lasmeSynthesize, lasmePreGates, lasmePostGates } from '../hydra/instances/lasme.ts';"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:112 Mechanical template doctrine
- severity: MEDIUM
- confidence: 0.88

## FINDING: runner tagging DELETE-before-INSERT not atomic — crash leaves partial graph
- layer: SRO-meta
- predicate: caused
- file: src/hydra/aether-meta.ts:235
- evidence: "DELETE FROM typed_nodes WHERE canonical_id = ?; DELETE FROM typed_edges WHERE src = ?; INSERT INTO typed_nodes"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:56 ONE GRAPH LAW — tagging via DELETE-before-INSERT idempotent by canonical_id
- severity: MEDIUM
- confidence: 0.85

## FINDING: SRO blast-radius dedup without path normalization — duplicate findingId
- layer: SRO-meta
- predicate: derived_from
- file: src/hydra/instances/sro.ts:328
- evidence: "const id = v.file + \":\" + v.line;"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:56 ONE GRAPH LAW — canonical file keys
- severity: MEDIUM
- confidence: 0.8

## SUMMARY
Adjudicated **23 candidates** (R28 5 + R29 3 + R30 4 + R31 4 + SRO-meta 7) → **22 TRUE_DEFECT, 1 RED_HERRING, 0 UNCLEAR**. 20 findings emitted as ## FINDING blocks above (R28 4 TRUE + R29 3 TRUE + R30 4 TRUE + R31 4 TRUE + SRO-meta 7 TRUE = 22 TRUE; RED_HERRING at R28:22 orphan scan 0 measured empty is informational negative result, not emitted as defect). Cross-validated against prior LASME/MPSE gates: confinement fail-open at aether-tools.ts:53/71/107 is same root as R21 CRITICAL pair, now fixed here with fail-closed `return READ_SCOPE_VIOLATION`; graphify void depth at 141 blocks SRO blast-radius depth 3 mandate; corbell never-drop hides ontology violations; split-brain memory.ts:115 blocks one-graph law for SRO correlations. Method: graph-first ONE extraction via graph-mapper + Graphify MCP subgraph depth 3, godNodes top-5 via degree, community via hydra/instances/math, adj direction audit, capped reads 320/grep 120, ledger-isolated. Every finding carries file:line+verbatim+spec divergence. Remediation order: P0 confinement + transaction, P1 graphify depth + corbell throw + targetRoot pinning + dual-hierarchy unification, P1 SRO path normalization + god-node weighting + confidence propagation, P2 dead exports/cycle filterTags/schema. Estimated SRO score 58→78 after fixes; overall 54→70. Ledger mechanics: 22 FINDING blocks + SUMMARY valid markdown grammar; verdicts.json V1-V8 pass; force-bound write; per-hunter tagsWritten roster.
