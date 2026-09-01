## FINDING: split-brain graph stores — one-graph enrichment broken
- layer: R28-sro-graph
- predicate: graph-structure.orphaned
- object: Contract
- file: src/hydra/memory.ts:115
- evidence: "mergeGraphSlice(_slice: object): void { return; } // Phase-1 stub: no-op — graph slices never merged"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240 one shared graph — all hunters query the SAME shared graph; every module must be reachable from orchestrator or be declared standalone
- severity: HIGH
- confidence: 0.88

## FINDING: dead gate skeleton — dispatch always throws
- layer: R28-sro-graph
- predicate: graph-structure.layer-violation
- object: Contract
- file: src/hydra/pipeline.ts:134
- evidence: "throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:410 pipeline dispatch must Promise.allSettled concurrent subagents with graphifyTools; AetherHydraPipeline is the gate skeleton
- severity: HIGH
- confidence: 0.91

## FINDING: dual-contract hunter duplication — 24 nodes for 14 hunters
- layer: R28-sro-graph
- predicate: graph-structure.anomaly
- object: Contract
- file: src/audit-engine/index.ts:82
- evidence: "import { lasmeSpecs, lasmeSynthesize, lasmePreGates, lasmePostGates } from '../hydra/instances/lasme.ts'; import { lasmeLexiconTemplate } from '../hydra/aether-templates/hunters/lasme-lexicon.ts';"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240 mechanical template doctrine — brief IS the prompt, AuditorTemplate is the sole dispatch contract, SubagentSpec uses function-based builders
- severity: MEDIUM
- confidence: 0.86

## FINDING: import cycle hydra→aether→hydra violates nesting seam
- layer: R28-sro-graph
- predicate: graph-structure.cycle
- object: Contract
- file: src/hydra/aether-auditor.ts:3
- evidence: "import { AetherAgent } from '../audit-engine/aether-backend/agent.js'; // hydra→audit-engine creates cycle via audit-engine/index.ts → hydra/aether-meta.ts"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:382 hydra nests the aether-backend spine; shared is low-level storage — dependency direction is hydra→aether→shared, not shared→aether
- severity: MEDIUM
- confidence: 0.79

## FINDING: confirmed-absent — orphan scan measured 0, no defect
- layer: R28-sro-graph
- predicate: graph-structure.orphaned
- object: Contract
- file: src/hydra/aether-templates/hunters/sro-graph.ts:22
- evidence: "filterTags: ['violates','triggers','shouldBe','declares','evaluates_to','contradicts_oracle','flagged_by','caused'] // orphan scan 0 modules with in-degree 0 ∧ out-degree 0"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:420 one-graph law: all hunters query the SAME shared graph; SRO graph-structure hunter hunts orphaned modules
- severity: LOW
- confidence: 0.72

## SUMMARY
5 findings — 4 TRUE_DEFECT + 1 RED_HERRING. The merged graph is well-connected (0 orphaned modules), but the architecture is fragmented: split-brain stores (memory.ts:115), dead pipeline (pipeline.ts:134), dual hunter contracts (index.ts:82), and a 4-node SCC cycle (aether-auditor.ts:3 → agent → index → aether-meta → aether-auditor). Fixes: implement mergeGraphSlice/queryGraph, remove or wire pipeline, deduplicate to 14 AuditorTemplates, break cycle via dependency inversion.
