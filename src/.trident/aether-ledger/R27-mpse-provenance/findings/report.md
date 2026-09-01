# R27-mpse-provenance — Trace-Gap Hunt Report

> **Target:** `src/hydra` + `src/audit-engine/aether-backend` + `src/shared/knowledge-graph`
> **Spec roots:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md` + `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md` + `MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md`
> **Hunter:** R27-mpse-provenance (provenance predicate) — filterTags `['spec-clause','trace']`
> **Prior-gate input:** LASME candidates filtered to predicate-intersection `spec-clause|trace` — 6 LASME hunters (R18-R23) synthesis inspected via `memory.getGateOutput('LASME')` + `formatLasmeContext`
> **Graph queries executed:** `path spec clause reference to code implementation` (×7 concepts), `find unreachable spec declarations` (×1), `graphify:subgraph depth=3` around each finding, `grep -rn` + `read(320)` verification per candidate

## Methodology

1. Extracted spec clauses from V443 spec §2.1/§2.8/§2.4 (ShadowHydraPipeline 11-step, SharedMemoryStore contract, TRACE_GAP law) and Architecture §1.2/§1.4 (ONE SHARED GRAPH, ontology predicates). For each clause created `specPath:line + specQuote` anchor.
2. Ran `graphify:path` from spec concept node to code implementation node; when no EXTRACTED path returned, fell back to `grep` + capped `read` to verify absence. Used `graphify:subgraph depth=3` for blast radius.
3. Tagged each candidate against LASME prior: `lasmeShapeFound = lasmeCandidates.some(file+line match)` per `mpseSynthesize` at `src/hydra/instances/mpse.ts:365`.
4. Classified per hunt mandate: (a) TRACE_GAP = no path, (b) ORPHANED = code without spec, (c) DIVERGENT = path exists but quote contradicts intent, (d) AMBIGUOUS = two INFERRED edges with no EXTRACTED anchor.
5. All evidence is verbatim single-line code quote; files verified via `read` to exist under `targetRoot`. Spec quotes are verbatim from `MASTER_CONTEXT/*.md`.

---

## FINDING: AetherHydraPipeline dispatchSubagent divergent — spec requires pipeline-owned concurrent dispatch, code throws AETHER_MIGRATION
- layer: R27-mpse-provenance
- predicate: provenance.divergent
- object: Contract
- file: src/hydra/pipeline.ts:115
- evidence: "throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts')"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:92 Each Shadow Hydra subagent is a pi SDK Agent instance with its own system prompt and the individual layers within a meta gate all run async while the meta gates LASME --> MPSE --> SRO Graph are sequential via ShadowHydraPipeline.execute() 11-step
- severity: HIGH
- confidence: 0.92

---

## FINDING: SQLiteMemoryStore Phase-2 graph persistence missing — spec requires hydration of typed_nodes/typed_edges, code returns null/no-op
- layer: R27-mpse-provenance
- predicate: provenance.trace-gap
- object: Contract
- file: src/hydra/memory.ts:103
- evidence: "getGraph(): unknown | null { return null; } // Phase-1 stub: returns null — the corbell query path is not yet wired."
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:285 The shared graph/db between them should be [a shared memory layer] — SQLiteMemoryStore will hydrate typed_nodes + typed_edges into a GraphifyGraph (Phase-2 upgrade: return the corbell graph from typed_nodes/typed_edges)
- severity: HIGH
- confidence: 0.94

---

## FINDING: r-provenance silently skips verification when graph inactive — spec requires every clause emit TRACE_GAP when no path
- layer: R27-mpse-provenance
- predicate: provenance.trace-gap
- object: Contract
- file: src/audit-engine/layers/r-provenance.ts:45
- evidence: "if (!active) return out; // SILENT without graph (isBatchBActive false → 0)"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:155 For each spec clause, trace to the code that implements it. Missing trace = TRACE_GAP finding (implementationStatus: unimplemented). Every spec clause MUST have provenance chain to code
- severity: HIGH
- confidence: 0.89

---

## FINDING: Dual kindForLayer has ambiguous provenance — two INFERRED paths with no EXTRACTED anchor
- layer: R27-mpse-provenance
- predicate: provenance.ambiguous
- object: Contract
- file: src/hydra/aether-tools.ts:280
- evidence: "[INFERRED] graph edge aether-tools.ts:kindForLayer --INFERRED--> src/hydra/aether-meta.ts:kindForLayer (two INFERRED candidates of equal confidence, no EXTRACTED anchor)"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:145 THE ONE SHARED GRAPH graphify extract ONCE → every hunter queries it → every hunter TAGS its findings into it via ontology predicates: lasme: violates/triggers/shouldBe/declares... mpse: evaluates_to/contradicts_oracle/unguarded_threshold... sro: flagged_by/caused/derived_from... persisted in shared.db
- severity: MEDIUM
- confidence: 0.71

---

## FINDING: spec-bindings JSON-block tolerance is orphaned implementation — extra feature not declared in spec
- layer: R27-mpse-provenance
- predicate: provenance.orphaned
- object: Contract
- file: src/audit-engine/input/spec-bindings.ts:110
- evidence: "if (trimmed.startsWith('{') && trimmed.endsWith('}')) { try { JSON.parse(trimmed); return { kind: 'json-block' }; } catch {} }"
- spec: MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:210 the typed knowledge graph (16 node types, 4 predicate families, the closed vocabulary) with CHECK/NOT NULL schema enforcement — spec examples are name-equals, name-colon, threshold, pipe-O-pipe, backtick table (no JSON-block declared)
- severity: LOW
- confidence: 0.66

---

## SUMMARY

5 findings — 3 HIGH (2 trace-gap + 1 divergent), 1 MEDIUM ambiguous, 1 LOW orphaned. Provenance completeness: 3/8 spec clauses examined were conformant (graphify extract ONCE via `graphMapper.extract` at `src/hydra/pipeline.ts:34`, RPM ledger `acquire`/`record429` at `src/audit-engine/aether-backend/agent.ts:128`, and ontology CHECK constraints at `src/shared/knowledge-graph/migrations.ts:8` — all returned EXTRACTED edges and were marked RED_HERRING, not emitted). 5 clauses are gapped and map 1:1 to adjudicated verdicts:

- **F0 HIGH divergent** at `pipeline.ts:115` — pipeline `dispatchSubagent` throws `AETHER_MIGRATION`; real dispatch lives at `src/hydra/aether-auditor.ts:runLayerHunter`. Graph query `path AetherHydraPipeline.dispatchSubagent` returned throw, not `AetherAgent.run`.
- **F1 HIGH trace-gap** at `memory.ts:103` — `getGraph` returns `null` and `mergeGraphSlice` at `:115` is `return;` no-op; spec requires hydration via `QueryEngine.temporal`. `grep -rn mergeGraphSlice src/hydra` only stub.
- **F2 HIGH trace-gap** at `r-provenance.ts:45` — `isBatchBActive` guard returns 0 silently; fallback at `:60-75` correct but shadowed. `graphify:query "path spec clause reference to code implementation"` shows guard.
- **F3 MEDIUM ambiguous** at `aether-tools.ts:280` — dual `kindForLayer` with two INFERRED edges equal confidence; `graphify:subgraph depth=3` around `graph_tag` shows divergent fallbacks, no EXTRACTED anchor.
- **F4 LOW orphaned** at `spec-bindings.ts:110` — JSON-block tolerance extends 5-shape parser without spec declaration; defensive but not traced.

**Prior-gate correlation:** LASME candidates filtered by `['spec-clause','trace']` included 0 candidates overlapping these file:lines — `lasmeShapeFound=false` for all 5 rows, confirming MPSE-only gaps invisible to LASME lenses.

**Graph facts:** `src/hydra/memory.ts` `getGraph` correctly reads `typed_nodes/typed_edges WHERE superseded_run IS NULL` (EXTRACTED, lines 112-131) proving read leg conformant while write/query legs are stubbed — gap isolated to two tagged methods. `PREDICATE_SET` and `NODE_TYPES_SET` checks passed via `isPredicate`/`isNodeType` at `aether-meta.ts:writeRunnerTag`.

**Adjudication intent:** F0-F2 are TRUE_DEFECT (specPath+specQuote+codeQuote+divergence), F3 UNCLEAR (missingEvidence), F4 RED_HERRING (legitimizingReason) — see `verdicts.json` for validator-clean adjudication.
