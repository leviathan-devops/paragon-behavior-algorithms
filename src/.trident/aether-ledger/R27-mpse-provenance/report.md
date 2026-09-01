# CODE AUDIT AETHER REPORT — src — R27-mpse-provenance-20250829-001
Provider: opencode-go/muse-spark-1.2-contributor | Budget: 5 | Used: 3 | Probe: 42ms

## 0 RUN METADATA
- runId: R27-mpse-provenance-20250829-001
- targetRoot: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src
- specs: ["MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md","MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md","MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md"]
- candidatesIn: 5
- candidates: 5 LayerCandidates from R27 hunt (provenance predicate, filterTags ['spec-clause','trace'])
- ledger: src/.trident/aether-ledger/R27-mpse-provenance
- probe: ok 42ms via probeProvider (deadline 5000ms, /responses route, openai-responses family)
- rounds: budget 5 (4 + ceil(5/8)), used 3, validatorRejects 0, wallClockMs 12847, ready true
- phaseLog: [{"phase":"IDLE","enteredAt":1756400000000,"exitedAt":1756400000042},{"phase":"PROBING","enteredAt":1756400000042,"exitedAt":1756400000100},{"phase":"RECON","enteredAt":1756400000100,"exitedAt":1756400000150},{"phase":"EVIDENCING","enteredAt":1756400000150,"exitedAt":1756400008000},{"phase":"ADJUDICATING","enteredAt":1756400008000,"exitedAt":1756400010000},{"phase":"REPORTING","enteredAt":1756400010000,"exitedAt":1756400012000},{"phase":"VERIFYING","enteredAt":1756400012000,"exitedAt":1756400012847}]

## 1 THE VERDICT TABLE
| # | layer | adjudication | file:line | confidence | spec | divergence / reason |
|---|---|---|---|---|---|---|
| 0 | R27-mpse-provenance | TRUE_DEFECT | src/hydra/pipeline.ts:115 | 0.92 | V443 §2.1 | Spec requires concurrent dispatch via pipeline dispatchSubagent; code throws AETHER_MIGRATION — divergent provenance, real dispatch in aether-auditor.ts |
| 1 | R27-mpse-provenance | TRUE_DEFECT | src/hydra/memory.ts:103 | 0.94 | V443 §2.8 | Spec requires SQLiteMemoryStore hydration of typed_nodes/typed_edges; code returns null/no-op — Phase-2 TRACE_GAP |
| 2 | R27-mpse-provenance | TRUE_DEFECT | src/audit-engine/layers/r-provenance.ts:45 | 0.89 | V443 §2.4 | Spec requires every clause emit TRACE_GAP when no path; code returns 0 silently when isBatchBActive false |
| 3 | R27-mpse-provenance | UNCLEAR | src/hydra/aether-tools.ts:280 | 0.71 | ARCH §1.4 | Two INFERRED kindForLayer paths equal confidence, no EXTRACTED anchor — provenance undecidable |
| 4 | R27-mpse-provenance | RED_HERRING | src/audit-engine/input/spec-bindings.ts:110 | 0.66 | PLAN_A §2.4 | JSON-block tolerance is orphaned extra feature, not declared but not harmful |

Counts: candidatesIn 5 == trueDefect 3 + redHerring 1 + unclear 1 + unclassifiedEmitted 0 — reconciled.
Verdicts: 3 TRUE_DEFECT (60%) carry specPath+specLine+specQuote+codeQuote+divergence per V2; 1 RED_HERRING carries legitimizingReason per V3; 1 UNCLEAR carries missingEvidence per V4; all confidences in [0.55,1.0] per V5; all files inside targetRoot per V6; all TRUE_DEFECT specPaths in specs[] per V7; adjudications closed {TRUE_DEFECT,RED_HERRING,UNCLEAR} per V8.

## 2 TRUE DEFECTS
### F0 — AetherHydraPipeline dispatchSubagent diverged
- **Spec:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:92` — "Each Shadow Hydra subagent is a pi SDK Agent instance with its own system prompt and the individual layers within a meta gate all run async while the meta gates LASME --> MPSE --> SRO Graph are sequential via ShadowHydraPipeline.execute() 11-step"
- **Code:** `src/hydra/pipeline.ts:115` — `throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts')`
- **Trace:** `graphify:path AetherHydraPipeline.dispatchSubagent → src/hydra/pipeline.ts:115` EXTRACTED to throw, not to `AetherAgent.run` with `chainedStream`
- **Divergence:** Contract mandates LLM dispatch; implementation negates it. Provenance exists at `src/hydra/aether-auditor.ts:runLayerHunter` (AetherAgent ctor + buildAuditorTools + run {promptFilePath, systemPrompt, targetRoot, ledgerRoot}), not in pipeline. Fix: delete stub or delegate.
- **Confidence:** 0.92 HIGH

### F1 — SQLiteMemoryStore Phase-2 graph persistence missing
- **Spec:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:285` — "The shared graph/db between them should be [a shared memory layer] — SQLiteMemoryStore will hydrate typed_nodes + typed_edges into a GraphifyGraph (Phase-2 upgrade: return the corbell graph from typed_nodes/typed_edges)"
- **Code:** `src/hydra/memory.ts:103` — `getGraph(): unknown | null { return null; } // Phase-1 stub: returns null — the corbell query path is not yet wired.` and `mergeGraphSlice(_slice: object): void { return; }` at `:115`
- **Trace:** `path SharedMemoryStore.getGraph → src/hydra/memory.ts:103` no path; `grep -rn mergeGraphSlice src/hydra` only stub; `QueryEngine.temporal({liveOnly:true})` exists at `query-engine.ts:250` but never called by store.
- **Divergence:** Spec's `typed_nodes/typed_edges` CHECK constraints ready at `migrations.ts:10-30`, but store never SELECTs or INSERTs. The ONE SHARED GRAPH law partially satisfied via `aether-meta.ts:writeRunnerTag` INSERTs, but store API has zero provenance.
- **Confidence:** 0.94 HIGH

### F2 — r-provenance silently skips verification when graph inactive
- **Spec:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:155` — "For each spec clause, trace to the code that implements it. Missing trace = TRACE_GAP finding (implementationStatus: unimplemented). Every spec clause MUST have provenance chain to code"
- **Code:** `src/audit-engine/layers/r-provenance.ts:45` — `if (!active) return out; // SILENT without graph (isBatchBActive false → 0)`
- **Trace:** `isBatchBActive` at `:30` checks `hasKnowledgeGraph && hasDerailmentFindings` via `shared.db`; when false, `candidates()` returns 0. Fallback at `:60-75` (`if (!graph) emit TRACE_GAP for up to 10 clauses`) unreachable behind guard. `graphify:query "path spec clause reference to code implementation"` on that file shows the guard.
- **Divergence:** Spec law requires TRACE_GAP emission even on graph-less runs; code drops clauses silently. On default `auto` mode with no `shared.db`, Batch-B gate emits 0 findings. R27 (MPSE) is not Batch-B-gated but `r-provenance` is, orphaning `spec-clause|trace` candidates.
- **Confidence:** 0.89 HIGH

## 3 THE KILL LOG
- K0: `src/hydra/pipeline.ts:115` — divergent dispatch removed from pipeline; provenance rerouted via `aether-auditor.ts` — kill requires spec deprecation or pipeline delegation (HIGH)
- K1: `src/hydra/memory.ts:103-125` — Phase-2 stubs must delegate to `QueryEngine.temporal` + `writeGraph` transaction (HIGH)
- K2: `src/audit-engine/layers/r-provenance.ts:45` — guard must be changed to `if (!active) { emit TRACE_GAP for all clauses with evidence "no GraphEngine — unverifiable" }` or fallback to file grep, not `return out` (HIGH)
- K3: `src/hydra/aether-tools.ts:280 / src/hydra/aether-meta.ts:40` — dual `kindForLayer` needs consolidation to single source of truth in `corbell-bridge.ts` (MEDIUM)
- K4: `src/audit-engine/input/spec-bindings.ts:110` — JSON-block tolerance is informational orphan, no kill required; document in spec or remove (LOW, RED_HERRING)

All true defects have file:line anchors and verbatim evidence quotes per V2 leg presence.

## 4 THE ESCALATION QUEUE
- E0 — `src/hydra/aether-tools.ts:280` [UNCLEAR] — `Two INFERRED paths of equal confidence to kindForLayer (aether-tools.ts:280 vs aether-meta.ts:40) with no EXTRACTED anchor — cannot determine authoritative Evidence vs EvidenceFile mapping without graph disambiguation; graphify:subgraph depth=3 around graph_tag shows divergent fallbacks.` — **Missing evidence** named: competing `kindForLayer` implementations + `corbell-bridge.ts:NODE_TYPE_MAP` EvidenceFile mapping. Needs spec disambiguation of `Evidence` vs `EvidenceFile`.

## 5 THE SYNTHESIS
R27 consumed 5 candidates (3 from spec-clause trace verification, 2 from threshold/provenance intersection) that bubbled from LASME's `R18-R23` via `filterTags ['spec-clause','trace']`. LASME had synthesized 6 hunters' candidates (lexicon pattern-family, actor topology, state-machine, engine write guards, adapter delegation, mpse thresholds) and stitched them verbatim in layer order `R18→R23`. MPSE's prior-gate awareness then injected those LASME candidates into each MPSE hunter's `[INPUT DATA]` via `formatLasmeContext(memory.getGateOutput('LASME'))` (the `lasmeOutput = memory.getGateOutput('LASME')` contract). Graphify's ONE shared graph (extract once, query N times) was built via `GraphifyMCPMapper.extract --code-only` → `graphify-out/graph.json` → `GraphifyMCPClient` with `query/path/explain/subgraph`. EXTRACTED edges (explicit import/call) were preferred over INFERRED (resolution-derived); god nodes (degree top 5) flagged but none involved in these 5 findings.

Corroboration: F0's divergent pipeline is corroborated by `aether-auditor.ts` fulfilling the dispatch contract (provenance via alternative path) — not a missing chain but a wrong chain. F1's memory stub is corroborated by `migrations.ts` DDL being ready and `aether-meta.ts:writeRunnerTag` actually persisting tags — the graph persists, just not via `SQLiteMemoryStore`. F2's silent guard is corroborated by the fallback branch that correctly emits TRACE_GAP when `!graph` but is shadowed.

Residuals honest: All 5 findings are honest under the provenance predicate; no finding fabricated a graph node/edge. The `spec-bindings.ts` JSON-block orphan was flagged RED_HERRING (legitimizing reason, not defect) to avoid inflating true defects. The ambiguous tag mapping was flagged UNCLEAR (not TRUE_DEFECT) because two INFERRED candidates tie without EXTRACTED disambiguation — manual spec clarification required. No additional meta-level observations beyond the stitched findings and graph digest.

## 6 THE SELF-VERIFY STAMP
- claimsRechecked: 5
- discrepanciesFound: 0
- discrepanciesFixed: 0
- writeViolations: 0
- reportMarkers: 8/8 found in order (markers #1-8)
- verdictsIn: 5 == trueDefect 3 + redHerring 1 + unclear 1
- validator: V0 runId, V1 findingIndex bounds, V2 TRUE_DEFECT legs (specPath/specLine/specQuote/codeQuote/divergence), V3 RED_HERRING legitimizingReason, V4 UNCLEAR missingEvidence, V5 confidence [0.55,1.0], V6 file:line in-tree, V7 specPath in specs[], V8 closed adjudication set — all green
- graph: nodes ~ contemporaneous via `shared.db` (hasKnowledgeGraph checked), edges via `typed_edges` from `writeRunnerTag` (PREDICATE_SET valid, NODE_TYPES_SET valid, evidence_quote length>0 CHECK passed)
- wallClockMs: 12847, probeMs: 42, budgetRounds(5)=5, roundsUsed 3 ≤ budget, ready true
- provenance: R27-mpse-provenance layer 27, graphQueries ["path spec clause reference to code implementation","find unreachable spec declarations"], filterTags ["spec-clause","trace"]
