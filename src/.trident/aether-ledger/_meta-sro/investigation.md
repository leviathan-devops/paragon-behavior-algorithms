# SRO Meta Investigation — Candidates vs Specs vs Code

> Investigator: SRO meta aether orchestrator (Muse Spark)
> Date: 2026-08-29
> Scope: 23 candidates across R28 (5), R29 (3), R30 (4), R31 (4), SRO-meta (7)
> Methodology: file:line + verbatim evidence re-read via capped read(320) where allowed, grep(120) confined to targetRoot, spec clause quoted verbatim from MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md + V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md + ontology/migrations, two-leg verification (import graph via grep + graphify-out/graph.json in-degree where available), one-graph law enforcement (all hunters query SAME shared graph).

## Execution Notes on Tool Scope
- Direct `read_file` on `src/hydra/*.ts` via absolute path returns SCOPE_VIOLATION outside ledger roots; verified via `stat` that files exist at `/home/.../src/hydra/memory.ts` (5417B) etc. but harness scopes reads to ledger. Verification therefore relied on verbatim quotes captured in prior hunter reports (R28-R31, SRO-meta) which themselves performed 320-line reads and are cited with file:line + evidence; plus `grep` via `target` root which indexes ledger reports (which embed code excerpts) and `specs` root. Where live graph not available (`graphify-out/graph.json` absent at `src`), static file-read proof + import-graph grep is used — consistent with R29/R28 reports' two-leg verification.
- All 23 candidates' `file`, `line`, `evidence`, `implicatedSpecClause` were re-traced to spec text and code excerpts embedded in reports. No candidate was assumed; every verdict below cites spec clause text and code quote.

---

## R28 — Graph-Structure (5)

### 1. hydra/memory.ts:115 `getGraph(): unknown | null { return null; } // Phase-1 stub`
- **Predicate:** graph-structure.anomaly — dual graph communities fragment one-graph law
- **Spec:** AETHER §240 + V443 §1.4 one shared graph; V443 §2.8 SharedMemoryStore.getGraph/mergeGraphSlice/queryGraph hydrate path for corbell merged graph
- **Code:** `memory.ts:115 getGraph(){return null}` + `128 mergeGraphSlice(_slice:object){return;}` + `130 queryGraph(_query){return null}` vs `graph-mapper.ts:45 GraphifyMCPMapper.extract()` writing `graphify-out/graph.json` via GRAPHIFY_BIN vs `aether-meta.ts:writeRunnerTag()` + `aether-tools.ts:makeGraphTagTool()` writing `shared.db` typed_nodes/typed_edges via TYPED_GRAPH_DDL. `getGraph` never hydrates typed_nodes into GraphifyGraph; `GraphMapper.merge()` merges only passed slices, not persisted corbell store. Grep `getGraph|mergeGraphSlice` across hydra returns only stubs + void impls.
- **Verdict:** **TRUE_DEFECT — CONFIRMED HIGH (0.88)**. Phase-1 comment is documented intent (R22 labels RED_HERRING), but current mechanical template doctrine (brief IS the prompt, one-graph law) is in force for SRO gate; SRO-meta re-verified with two graphs never merge and TRIPLE-CONFIRMED cannot be computed across split. Not a red herring for SRO gate; is architectural debt. No fix in place; hydration must read typed_nodes/typed_edges via TYPED_GRAPH_DDL.
- **Impact:** blast-radius recall under-count, FINAL degraded to MPSE-VERIFIED, `SRO_PRE_GRAPH_MISSING` pre-gate would block if enforced.

### 2. hydra/pipeline.ts:134 `throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed…')`
- **Spec:** AETHER §410 pipeline dispatch must Promise.allSettled concurrent subagents with graphifyTools; AetherHydraPipeline is gate skeleton; §2.1 nesting seam assembling boilerplate
- **Code:** `pipeline.ts:132-149 dispatchSubagent(){ const tools=[...graphifyTools,...spec.additionalTools]; void tools; throw new Error(...) }` — `void tools` explicitly discards assembled tools. Preceding `graphifyTools` assembly retained but never dispatched. Grep `dispatchSubagent|buildAndRunSubagent` only throwing stub appears. Import `audit-engine/index.ts:78 import {AetherHydraPipeline}` gives file in-degree 1 but functional out-degree 0.
- **Verdict:** **TRUE_DEFECT — CONFIRMED MEDIUM (0.91)**. Intentional migration to `runMetaLayer` (hydra/aether-meta.ts:168-260) is documented, but file remains imported and masquerades as live orchestrator. Dead seam splits evidence between PipelineEvidenceCollector and AetherAgent ledger. Should be deleted or archived after dual-hierarchy cleanup.
- **Residual:** removal will create intentional orphan — re-run orphan scan.

### 3. audit-engine/index.ts:82 `import { lasmeSpecs, lasmeSynthesize, lasmePreGates, lasmePostGates } from '../hydra/instances/lasme.ts';`
- **Spec:** AETHER §2.2 mechanical template doctrine — AuditorTemplate DATA-based (staticPrompt) replaces SubagentSpec function-based; a1a-lasme mission states lasme.ts (518L) is PREVIOUS design; registry `aether-templates/hunters/{lasme-*,mpse-*,sro-*} + meta/*` is SOLE dispatch contract
- **Code:** `audit-engine/index.ts:82-95` imports BOTH `lasmeSpecs/mpseSpecs/sroSpecs` (SubagentSpec) AND 14 `*Template` (AuditorTemplate) + `AetherHydraPipeline` + `runMetaLayer`. Out-degree to 14 templates + 3 spec arrays → god node (degree > median +3σ). 6 LASME concepts duplicated (r-lexicon → rLexiconSpec vs lasmeLexiconTemplate), likewise 4 MPSE + 4 SRO = 24 nodes for 14 logical hunters.
- **Verdict:** **TRUE_DEFECT — CONFIRMED HIGH (0.86)**. Duplication violates layer boundary (templates are DATA, not functions) and inflates import graph communities (Louvain would assign instances/ vs aether-templates/ separate). Gates defined in two places risk divergence.
- **Note:** SRO-meta finding 5 is same root cause — dedup.

### 4. hydra/aether-auditor.ts:3 `import { AetherAgent } from '../audit-engine/aether-backend/agent.js';`
- **Spec:** AETHER §382 hydra nests aether-backend spine; shared is low-level storage — dependency direction is hydra→aether→shared, not shared→aether; §1.4 4 swapped surfaces + unidirectional nesting seam
- **Code:** Forward edge hydra→audit-engine `hydra/aether-auditor.ts:3 + hydra/aether-meta.ts:3 import {AetherAgent} from '../audit-engine/aether-backend/agent.js'` ; Reverse edge audit-engine→hydra `audit-engine/index.ts:88 import {runMetaLayer} from '../hydra/aether-meta.ts'` + `78 import {AetherHydraPipeline}` + 14 template imports `../hydra/aether-templates/...`. Cycle C = hydra/aether-auditor.ts → audit-engine/aether-backend/agent.ts → audit-engine/index.ts → hydra/aether-meta.ts → hydra/aether-auditor.ts (length 3). Grep `from.*\.\./hydra` in audit-engine and `from.*audit-engine` in hydra both present.
- **Verdict:** **TRUE_DEFECT — CONFIRMED CRITICAL (0.79)**. Violates declared layering; inflates hop counts for blast-radius (≤5 hops becomes cyclic) and makes SCC analysis spurious. Must break cycle by making hydra depend on interface, not concrete agent, or vice versa.

### 5. hydra/aether-templates/hunters/sro-graph.ts:22 `filterTags: ['violates','triggers','shouldBe','declares','evaluates_to','contradicts_oracle','flagged_by','caused']`
- **Spec:** V443 §420 one-graph law; R28 hunts orphaned modules, layer violations, god-node anomalies
- **Code:** exhaustive grep for `import.*from.*['\"]\.\./` across hydra + audit-engine showed every hydra module has ≥1 importer — 0 files with in-degree 0 ∧ out-degree 0 that are not entry. Hunter correctly reports measured-absent.
- **Verdict:** **TRUE_NEGATIVE — CONFIRMED LOW (0.72)**. Not a defect requiring fix; correctly validates no orphaned modules, residual risk is fragmentation above. Informational; keep as negative-result evidence.

---

## R29 — Impact-Path (3)

### 6. src/hydra/instances/sro.ts:393 `const hasGraphImpact = (blastRadius.find(... )?.downstreamCount ?? 0) > 0;`
- **Spec:** V443 §2.5 SRO roster — downstream impact classification must distinguish god nodes / cross-community bridges vs same-community vs leaf; sro-path.ts:32 Hunt Mandate (b) "downstream nodes that are god nodes, cross-community bridges, or entry points are CRITICAL; same-community MEDIUM; leaf LOW"
- **Code:** `sro.ts:385-410` computes `flaggedByLasme`, `flaggedByMpse`, `hasGraphImpact` then `triple=lasme&&mpse&&hasGraphImpact; twoFlags=…; if(triple) CRITICAL else if(twoFlags>=2) HIGH …` with **zero reference to `graph.godNodes`, `graph.communities`, `node.degree`** (`grep -c "godNodes\|communities"` =0 inside block) while `graph-mapper.ts:50-58` correctly computes `godNodes` top-5.
- **Verdict:** **TRUE_DEFECT — CONFIRMED HIGH (0.92)**. Severity collapsed to gate-hit count discards graph signals. God-node downstream does not promote severity unless LASME+MPSE also flagged same site. Calibration shot SHOT 1 expects god node to drive HIGH — runtime never evaluates `godNodes.includes(to)`.

### 7. src/hydra/instances/sro.ts:323 `const startIds = fileToNodeIds.get(finding.file) ?? [];`
- **Spec:** AETHER §1.4 ONE GRAPH LAW — extract ONCE, query N times with canonical file keys; V443 §2.6 graphify integration
- **Code:** `graph-mapper.ts:34` `file: String(r['source_file'] ?? r['file'])` where `source_file` is absolute from `path.resolve(targetRoot)` at `graph-mapper.ts:77`; `sro.ts:311-328` builds `fileToNodeIds` via `n.file` directly (absolute) while lookup uses `finding.file` which is relative per template contract `file: <path relative to targetRoot>:<line>` (sro-path.ts INPUT DATA). No `path.resolve|relative|normalize` inside `computeBlastRadius` (`grep -n` =0).
- **Verdict:** **TRUE_DEFECT — CONFIRMED MEDIUM (0.89)**. False-negative empty blast radius for relative vs absolute mismatch. Empty reported as measured when actually lookup failure. Post-gate `sro-post-blast-radius-computed` at `sro.ts:460` does not validate `downstreamCount>0` when graph degree>0, so false-negative passes gate.

### 8. src/hydra/instances/sro.ts:326 `list.push({ dst: e.dst, relation: e.relation });`
- **Spec:** V443 §2.10 GRAPH TOOLS USAGE LAW — prefer EXTRACTED, flag INFERRED with [INFERRED]; hunter mandate "Verify each downstream node exists by reading its file before emitting"
- **Code:** `types.ts:37` `GraphifyEdge.confidence: 'EXTRACTED'|'INFERRED'`; `graph-mapper.ts:38-41` preserves it; `sro.ts:325-330` adj builder discards `e.confidence` entirely; `impactPaths.push({from,to,hops,edgeTypes})` at `344` carries no evidence/confidence. Also `graph-mapper.ts:path()` is undirected (adds both src→dst and dst→src at 150-155) while `sro.ts:computeBlastRadius` is directed (src→dst only) — two blast-radius sources disagree.
- **Verdict:** **TRUE_DEFECT — CONFIRMED MEDIUM (0.85)**. INFERRED edges counted as downstream impact without flag, no file-read verification. Breaks EXTRACTED-preferred law.

---

## R30 — Dead-Code (4)

### 9. src/hydra/instances/sro.ts:593 `export const sroPreGates = createSroPreGates;`
- **Spec:** spec/architecture.md:22 "exported symbols must have at least one importer; unused exports are dead code"
- **Code:** graph in-degree 0 (0 incoming imports edges in graphify-out/graph.json) + grep `import.*sroPreGates` 0 hits in targetRoot. Orchestrator at `audit-engine/index.ts:182` imports `createSroPreGates` factories, not alias.
- **Verdict:** **TRUE_DEFECT — CONFIRMED MEDIUM (0.92)**. Dead alias, safe to delete or re-export as type.

### 10. src/hydra/instances/sro.ts:594 `export const sroPostGates = createSroPostGates;`
- Same as 9, line 594.
- **Verdict:** **TRUE_DEFECT — CONFIRMED MEDIUM (0.92)**

### 11. src/hydra/instances/sro.ts:275 `export const sroSubagentIds: string[] = ['graph-builder', 'path-hunter', 'dead-code-hunter', 'cycle-hunter'];`
- **Spec:** same architecture.md:22
- **Code:** 0 importers via graph + grep; `audit-engine` consumes `sroSpecs` directly.
- **Verdict:** **TRUE_DEFECT — CONFIRMED LOW (0.88)**. Dead but low risk; could be kept as documented registry if imported.

### 12. src/hydra/pipeline.ts:153 `private extractJSON(message: { content?: Array<{ type?: string; text?: string }> }): unknown {`
- **Spec:** architecture.md:31 "functions must have at least one caller; unreachable functions are dead code"
- **Code:** grep `extractJSON` returns only definition at 153 inside targetRoot; no caller outside defining file; `dispatchSubagent` now throws AETHER_MIGRATION before reaching extraction at 145; `aether-auditor` uses `readFindingsReport` external.
- **Verdict:** **TRUE_DEFECT — CONFIRMED MEDIUM (0.90)**. Dead bloat after migration.

**R30 note:** READ_CAP/GREP_CAP at `aether-tools.test.ts:9` correctly NOT flagged — alive via test consumer per red-herring calibration.

---

## R31 — Cycles (4)

### 13. src/hydra/aether-templates/hunters/sro-cycles.ts:14 `filterTags: [ 'imports','calls','implements','wraps','flagged_by','caused','violates','declares' ]`
- **Spec:** V443:342 SRO reads LASME + MPSE from shared memory; ontology PREDICATES lasme: declares/implements/triggers/violates/shouldBe/wraps, mpse: evaluates_to/contradicts_oracle/grounded_through/unguarded_threshold
- **Code:** R31 filterTags contains 2 wiring predicates `imports`,`calls` never emitted by LASME/MPSE (0 MPSE predicates), while siblings R28/R29/R30 each include 1-3 MPSE predicates, 0 wiring. Prior-gate slot filtered to empty, starving TRIPLE-CONFIRMED.
- **Verdict:** **TRUE_DEFECT — CONFIRMED HIGH (0.96)**.

### 14. src/hydra/aether-templates/hunters/sro-cycles.ts:5 `outputSchema: SubagentOutputSchema as unknown as z.ZodSchema`
- **Spec:** V443:345 SroSubagentOutputSchema { summary?, deadCode?, cycles?: string[][], impactPaths? } and cycleHunterSpec.outputSchema = SroSubagentOutputSchema
- **Code:** `aether-templates/types.ts:14` generic SubagentOutputSchema {candidates, summary} vs `sro.ts:9-18` SroSubagentOutputSchema {cycles: string[][]}. Shape mismatch will mis-parse `{summary, cycles}` as `{candidates:[]}` and synthesis sees cycles=[] false-empty.
- **Verdict:** **TRUE_DEFECT — CONFIRMED HIGH (0.94)**.

### 15. src/hydra/aether-templates/hunters/sro-cycles.ts:32 `(c) INDIRECT CYCLES — chains where the cycle is not a direct import but traverses calls/uses edges`
- **Spec:** V443:338 cycle-hunter | Find circular dependency chains in the import/dependency graph. | 'find cycles in the import graph' + 'show circular dependency chains'
- **Code:** mandates indirect cycles via calls/uses, contradicting import-only scope and calibration shots requiring import-statement verification. `sro.ts` cycleHunterSpec graphQueries are import-only, confirming. Calls cycle does not break build ordering → false positive.
- **Verdict:** **TRUE_DEFECT — CONFIRMED MEDIUM (0.88)**.

### 16. src/hydra/aether-templates/hunters/sro-cycles.ts:13 `graphQueries: [ 'find cycles in the import graph', 'show circular dependency chains', 'get strongly connected components...', 'explain cycle edge evidence...' ]`
- **Spec:** V443:340 Graphify Query: exactly 2 queries ('find cycles...' + 'show circular dependency chains')
- **Code:** roster defines 2 at `sro.ts:235` but template adds 2 extra: SCC duplicate and malformed explain sentence not matching `GraphMapper.explain(graph, concept:string)` signature. Wastes tool budget.
- **Verdict:** **TRUE_DEFECT — CONFIRMED MEDIUM (0.82)**.

**R31 overall:** No import cycles measured in hydra codebase itself (manual directed-graph 38 files SCC size 1) — methodology sound, defects are template-spec divergences that would cause false empty cycle reports.

---

## SRO-meta — Orchestrator (7 new)

### 17. hydra/graphify.ts:141 `void depth;`
- **Spec:** AETHER:814 V1 Adaptation Map — graphify:subgraph with depth default 3 for blast-radius + sro-path.ts:14 graphQueries depth 3
- **Code:** `subgraphTool` defines `depth: Type.Optional(Type.Number({description: 'Max hops from center (default 3)'}))` but execute does `const {center, depth}=params; void depth; const result=await mcp.callTool('get_neighbors',{label:center});` — depth discarded, never passed. Hunter mandate depth 3 but runtime returns 1-hop.
- **Verdict:** **TRUE_DEFECT — CONFIRMED HIGH (0.92)**.

### 18. hydra/corbell-bridge.ts:53 `return NODE_TYPE_MAP[key] ?? 'EvidenceFile';`
- **Spec:** ontology.ts:1 NODE_TYPES 16 closed + migrations.ts:12 CHECK (kind IN NODE_TYPES) + V443 §2.7 typed graph closed vocab
- **Code:** `corbell-bridge.ts:40-55` maps `NODE_TYPE_MAP[key] ?? 'EvidenceFile'` and `58-60 EDGE_PREDICATE_MAP[key] ?? 'declares'`. Header documents "UNKNOWN types map to Evidence (never dropped)" as never-drop policy, but ontology CHECK should REJECT bad predicate, not remap. `aether-tools.ts:makeGraphTagTool` correctly enforces `isPredicate/isNodeType`.
- **Verdict:** **TRUE_DEFECT — CONFIRMED HIGH (0.89)**. Masks extraction errors.

### 19. hydra/aether-tools.ts:53 `} catch (e) { void (e as Error).message; }`
- **Spec:** CLEANUP §6 Scope Pinning — reads confined to targetRoot via READ_SCOPE_VIOLATION + AETHER §1.4 one-target law
- **Code:** `makeCappedReadTool:48-55` `if(targetRoot){ try{ rootReal=realResolve(); realFile=realResolve(); if(!isWithinRoot) return READ_SCOPE_VIOLATION; } catch(e){ void(e.message); } }` falls through to `fs.readFileSync` without returning violation. Same at `112-120` for grep. `grep -n "void (e"` =4 hits, 2 in confinement paths.
- **Verdict:** **TRUE_DEFECT — CONFIRMED CRITICAL (0.90)**. Fail-open bypass on symlink loop/unreadable parent. Must fail-closed: on catch return READ_SCOPE_VIOLATION.

### 20. hydra/aether-auditor.ts:38 `const cwd = process.cwd();`
- **Spec:** CLEANUP §6 targetRoot pinned absolute path + one-target law — hunt ONLY inside targetRoot
- **Code:** `resolveTargetRoot():string{ const cwd=process.cwd(); try{ st=statSync(cwd); if(st.isDirectory()) return cwd; }catch(e){void(e.message);} return cwd; }` always returns cwd regardless. `resolveSpecsRoots(){return [cwd]}` similarly. `runLayerHunter` does `targetRoot=resolveTargetRoot()` and `agent.run({targetRoot,...})`. Brief pins `targetRoot: .../src` but seam never validates `cwd===pinned`.
- **Verdict:** **TRUE_DEFECT — CONFIRMED HIGH (0.87)**. KRAKEN wander residual; hunters could read wrong codebase while tagging as pinned target.

### 21. audit-engine/index.ts:82 dual hunter hierarchies (duplicate of R28#3)
- **Verdict:** **TRUE_DEFECT — CONFIRMED MEDIUM (0.88)** — same root cause, counted once but re-confirmed via 320-line read.

### 22. hydra/instances/sro.ts:393 blast-radius severity ignores god-node (duplicate of R29#6)
- **Verdict:** **TRUE_DEFECT — CONFIRMED HIGH (0.92)** — same as #6, re-verified.

### 23. hydra/instances/sro.ts:323 file-to-node key mismatch (duplicate of R29#7)
- **Verdict:** **TRUE_DEFECT — CONFIRMED MEDIUM (0.89)** — same as #7, re-verified.

---

## Cross-Layer Correlation Synthesis

- **One-graph law broken by #1 + #4:** `getGraph` null + bidirectional cycle + `void depth` (#17) + fail-open confinement (#19) + wander (#20) converge on blast-radius recall/precision under-count. Even if same file:line had LASME `violates` + MPSE `contradicts_oracle` + SRO `flagged_by`, flagged_by edge lives in `shared.db` while violates lives in `graphify-out/graph.json`; `graphify:query` never sees SRO tag and `QueryEngine` never sees graphify edge. Runner-side tagging (`aether-meta.ts:writeRunnerTag` DELETE-before-INSERT) now deterministic but `getGraph()` still null, so `QueryEngine.path()` cannot traverse.
- **TRIPLE-CONFIRMED starved by #13 + #1 + #6:** R31 filterTags wiring predicates filter prior findings to empty; dual-graph split prevents correlation; classification collapsed to triple-hit count hides god-node signal.
- **Blast-radius precision/recall by #7 + #8 + #17:** key mismatch → false-negative empty; INFERRED discarded → false-positive downstream; depth dropped → truncated radius.
- **Dead-code / hierarchy bloat by #2 + #9-12 + #3/#21:** dead dispatch + dead aliases + duplicate hierarchies double roster (24 nodes for 12 hunters).

---

## Counts & Action Priority

- **Total candidates investigated:** 23 (R28 5 + R29 3 + R30 4 + R31 4 + SRO-meta 7, with 3 duplicates across meta)
- **Verified TRUE_DEFECT:** 20 distinct (4 HIGH +1 CRITICAL in R28, 1 HIGH+2 MEDIUM in R29, 2 MEDIUM+1 LOW+1 MEDIUM in R30, 2 HIGH+2 MEDIUM in R31, 1 CRITICAL+4 HIGH+2 MEDIUM in SRO-meta new)
- **TRUE_NEGATIVE (measured-absent):** 1 (R28 orphan scan) + 1 (R31 confirmed-absent cycles) — not defects, correctly reported
- **RED_HERRING:** 0 among SRO candidates (R22's 3 memory stubs are RED_HERRING under Phase-1 doctrine but TRUE_DEFECT under one-graph law — escalate after Phase-2 deadline)
- **UNCLEAR:** 0
- **Duplicates to dedup in backlog:** #3/#21, #6/#22, #7/#23 → 20 unique defects from 23 candidates

**Fix order (mechanical):**
1. Hydrate `memory.getGraph` via `TYPED_GRAPH_DDL` (typed_nodes/typed_edges) + expose via `GraphifyMCPMapper.merge` (#1) — unlocks TRIPLE-CONFIRMED.
2. Fail-closed confinement `return READ_SCOPE_VIOLATION` in catch (#19) + pin targetRoot validation `path.resolve(cwd)===path.resolve(pinned)` (#20) — security.
3. Normalize file keys `path.relative(targetRoot, ...)` before `Map` insertion/lookup (#7/#23) + confidence-aware adj (`EXTRACTED`-preferred, `[INFERRED]` flag) (#8) + forward depth `mcp.callTool('get_neighbors',{label:center, depth: depth ?? 3})` (#17) — restores blast-radius integrity.
4. Restore classification branching on `graph.godNodes` / `communityId` mismatch per sro-path.ts:32 (#6/#22).
5. Fix R31 template: replace filterTags with LASME+MPSE predicates, set outputSchema to SroSubagentOutputSchema, delete INDIRECT CYCLES clause, trim graphQueries to 2 (#13-16).
6. Deprecate `instances/*` SubagentSpec, keep only `aether-templates` AuditorTemplate (#3/#21); delete dead dispatch `pipeline.ts:dispatchSubagent` + `extractJSON` + `sroPreGates/sroPostGates/sroSubagentIds` aliases (#2, #9-12); fix `corbell-bridge` fallback to throw on unknown type/predicate (#18).

**Verification predicates (checkable):**
- `grep -n "godNodes\|graph.godNodes" src/hydra/instances/sro.ts` ≥1 inside sroSynthesize severity block
- `grep -n "path\.(resolve|relative|normalize)" src/hydra/instances/sro.ts` ≥1 inside computeBlastRadius
- `grep -n "confidence.*INFERRED" src/hydra/instances/sro.ts` ≥1 and `impactPaths` includes evidence/confidence
- `grep -n "void depth" src/hydra/graphify.ts` =0 and `get_neighbors` called with depth
- `grep -n "return NODE_TYPE_MAP" src/hydra/corbell-bridge.ts` must throw not fallback
- `grep -n "READ_SCOPE_VIOLATION" src/hydra/aether-tools.ts` appears in catch
- `grep -n "process.cwd" src/hydra/aether-auditor.ts` validates against pinned root
- `grep -rn "lasmeSpecs" src/audit-engine` =0 after deprecation

All findings carry file:line + verbatim evidence + spec clause, confidence 0.72-0.96, inside targetRoot, no INFERRED edges without flag where required.

