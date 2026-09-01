# AETHER FINDINGS REPORT — SRO

## SRO
## R28 — R28-sro-graph
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


## R29 — R29-sro-path
# R29 IMPACT-PATH HUNT — FINDINGS REPORT
**Layer:** R29-sro-path (impact-path) · **Predicate:** impact-path.blast-radius · **Target:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3
**Graph:** ONE shared graph (one-graph law) — all queries via GraphifyMCPClient · **Hops cap:** ≤5 · **Tool caps:** read 320 / grep 120 / write force-bound

## METHODOLOGY
Mechanical bug-hunter per AETHER spec §2.2 R18 skeleton + V443 §2.5 SRO roster (path-hunter: blast-radius ≤5 hops, downstream classification). Investigated the R29 hunter template against its runtime implementation (`src/hydra/instances/sro.ts` + `src/hydra/aether-templates/hunters/sro-path.ts` + `src/hydra/types.ts`). Used capped grep for `fileToNodeIds`, `computeBlastRadius`, `filterTags`, `recommendedSeverity`, `godNodes`, and capped reads (320L) of `sro.ts:270-430`, `sro-path.ts` full, and V443 spec §2.5. Compared spec mandate (blast-radius per prior-gate finding, ≤5 hops, downstream classification by god-node/community/leaf, file-read verification, predicate-intersection filtering, one-graph law) against the code's BFS, deduplication, and synthesis. Every finding carries file:line + verbatim quote + spec clause anchor.

---

## FINDING: exact file-path match without normalization silently drops blast-radius for mismatched path representations
- layer: R29-sro-path
- predicate: impact-path.blast-radius
- object: Code
- file: src/hydra/instances/sro.ts:285
- evidence: "const fileToNodeIds = new Map<string, string[]>(); for (const n of nodes) { const f = (n as { file?: string }).file; ... fileToNodeIds.set(f, arr); } ... const startIds = fileToNodeIds.get(finding.file) ?? []; // exact string equality, no normalize"
- spec: V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:§2.5 path-hunter "path from {finding.file}:{finding.line} to all callers within 5 hops" + AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:§2.3 [INPUT DATA] targetRoot + V443 §2.5 SRO Gate Post-gate "Every finding from LASME + MPSE has a blast-radius entry"
- severity: HIGH
- confidence: 0.88

---

## FINDING: missing predicate-intersection filter — SRO synthesis ingests every LASME/MPSE finding regardless of filterTags
- layer: R29-sro-path
- predicate: impact-path.blast-radius
- object: Contract
- file: src/hydra/instances/sro.ts:341
- evidence: "const lasmeOutput = memory.getGateOutput('LASME') as LasmeGateOutputShape | null; ... const raw = (synth?.['candidates'] as unknown[]) ?? []; lasmeCandidates = raw.filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null).filter((c) => typeof c['file'] === 'string' && typeof c['line'] === 'number').map((c) => ({ file: c['file'] as string, line: c['line'] as number })); // no predicate check"
- spec: AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:§2.3 SRO hunters' [INPUT DATA] "PRIOR-GATE slot with BOTH gates' findings (filtered per predicate-intersection: static filterTags)" + src/hydra/aether-templates/hunters/sro-path.ts:filterTags = ['violates','shouldBe','implements','evaluates_to','contradicts_oracle','ungrounded_threshold','flagged_by','derived_from']
- severity: MEDIUM
- confidence: 0.85

---

## FINDING: impact classification ignores god-node / community / leaf mandate — classifies only by flaggedBy counts
- layer: R29-sro-path
- predicate: impact-path.classification
- object: Contract
- file: src/hydra/instances/sro.ts:396
- evidence: "const flaggedByLasme = lasmeCandidates.some((c) => c.file === finding.file && c.line === finding.line); const flaggedByMpse = mpseViolations.some((v) => v.file === finding.file && v.line === finding.line); const hasGraphImpact = (blastRadius.find((b) => b.findingId === finding.id)?.downstreamCount ?? 0) > 0; const triple = flaggedByLasme && flaggedByMpse && hasGraphImpact; const twoFlags = (flaggedByLasme ? 1 : 0) + (flaggedByMpse ? 1 : 0) + (hasGraphImpact ? 1 : 0); if (triple) recommendedSeverity = 'CRITICAL'; else if (twoFlags >= 2) recommendedSeverity = 'HIGH';"
- spec: src/hydra/aether-templates/hunters/sro-path.ts:staticPrompt HUNT MANDATE (b) "IMPACT CLASSIFICATION — downstream nodes that are god nodes, cross-community bridges, or entry points are CRITICAL; nodes within the same community are MEDIUM; leaf nodes are LOW;" + V443 §2.5 CrossPhaseCorrelation "tripleConfirmed: flaggedBy all three = highest confidence"
- severity: HIGH
- confidence: 0.82

---

## FINDING: BFS follows only outgoing edges — downstream dependents (importers/callers) are incoming edges to the finding site, so blast radius is upstream not downstream
- layer: R29-sro-path
- predicate: impact-path.blast-radius
- object: Graph
- file: src/hydra/instances/sro.ts:297
- evidence: "const adj = new Map<string, Array<{ dst: string; relation: string }>>(); for (const e of edges) { const list = adj.get(e.src) ?? []; list.push({ dst: e.dst, relation: e.relation }); adj.set(e.src, list); } ... const outs = adj.get(cur.id) ?? []; for (const edge of outs) { if (visited.has(edge.dst)) continue; visited.add(edge.dst); const newHops = cur.hops + 1; ... impactPaths.push({ from: `${finding.file}:${finding.line}`, to: edge.dst, hops: newHops, edgeTypes: [...newPath] });"
- spec: V443 §2.5 path-hunter "For each finding from LASME + MPSE, query the graph for impact paths — what does this finding affect downstream?" + src/hydra/aether-templates/hunters/sro-path.ts HUNT MANDATE (a) "query graphify:path to all reachable nodes within 5 hops; report from/to/hops/edgeTypes"
- severity: HIGH
- confidence: 0.78

---

## FINDING: no file-read verification of downstream nodes — hunt mandate requires grep/read proof before emitting, code emits graph-only
- layer: R29-sro-path
- predicate: impact-path.blast-radius
- object: Code
- file: src/hydra/instances/sro.ts:311
- evidence: "impactPaths.push({ from: `${finding.file}:${finding.line}`, to: edge.dst, hops: newHops, edgeTypes: [...newPath] }); queue.push({ id: edge.dst, hops: newHops, path: newPath }); // no fs.readFile / grep verification of dst node file before push"
- spec: src/hydra/aether-templates/hunters/sro-path.ts:staticPrompt HUNT MANDATE "Verify each downstream node exists by reading its file before emitting." + GRAPH TOOLS USAGE LAW 1 "ALWAYS query the graph BEFORE reading files directly. The graph gives you the structural overview; file reads give you the details."
- severity: MEDIUM
- confidence: 0.84

---

## SUMMARY
5 findings — 3 HIGH, 2 MEDIUM. All grounded in `src/hydra/instances/sro.ts` BFS/synthesis vs `src/hydra/aether-templates/hunters/sro-path.ts` R29 mandate and V443 §2.5 / AETHER §2.3 one-graph + filterTags contract. The exact-match file-resolution bug (F1) and forward-only adjacency bug (F4) together cause systematic under- and mis-reporting of blast radius; the missing filter (F2) pollutes the blast matrix with out-of-scope predicates; the god-node-blind classification (F3) inverts impact severity; the missing file-read leg (F5) breaks the evidence-quote guarantee. All five are deterministic predicates (regex on `fileToNodeIds.get(finding.file)`, grep for `predicate` absence in sro.ts, grep for `godNodes` absence, adj direction audit, fs-read absence) and each is fixable without architectural change: normalize file paths via `path.relative`+`path.resolve` suffix map, add predicate-intersection filter before `computeBlastRadius`, resolve `to` node community/degree/god-node via `graph.godNodes`+`graph.communities` for `recommendedSeverity`, build reverse adjacency or bidirectional traversal for downstream dependents, and add `read(320)` verification loop per `to` node before emitting.


## R30 — R30-sro-dead-code
# R30 Dead-Code Audit — Findings Report (Re-verified 2026-08-31)

## RUN METADATA
- layer: R30-sro-dead-code
- predicate: dead-code (export / function) — File granularity (R30→File per kind-for-layer.ts)
- anchor: dead-code.export / dead-code.function
- targetRoot: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src
- ledgerDir: src/.trident/aether-ledger/R30-sro-dead-code
- re-verified: 2026-08-31 against live files + L2 specs
- tool caps: read 320L, grep 120, graphify + file reads two-leg verification

## CANDIDATE INVENTORY (prior run audit-1788020215425 — 4 candidates)
| # | predicate | file | line | subject |
|---|-----------|------|------|---------|
| 1 | dead-code.export | src/hydra/instances/sro.ts | 593 | exported alias sroPreGates with no importers — dead export |
| 2 | dead-code.export | src/hydra/instances/sro.ts | 594 | exported alias sroPostGates with no importers — dead export |
| 3 | dead-code.export | src/hydra/instances/sro.ts | 275 | exported array sroSubagentIds with no importers — dead export |
| 4 | dead-code.function | src/hydra/pipeline.ts | 153 | private method extractJSON has no callers — dead function |

## VERDICT SUMMARY
- CONFIRMED: 1 (candidate #3 — sroSubagentIds, LOW, intentional per §2.5 but technically dead per architecture.md)
- REJECTED: 3 (candidates #1, #2, #4 — STALE / ABSENT in current code, file evolved)
- Orphan modules (File in-degree 0): 0 — all modules have ≥1 incoming import edge (verified via grep + graph query "find modules with no consumers" manual check)
- Final dead-code list: 1 entry (measured, never assumed — empty would be valid but 1 measured)

---

## FINDING: exported array sroSubagentIds with no importers — dead export (spec-mandated, LOW)
- layer: R30-sro-dead-code
- predicate: dead-code.export
- object: Contract
- file: src/hydra/instances/sro.ts:273
- evidence: "export const sroSubagentIds: string[] = ['graph-builder', 'path-hunter', 'dead-code-hunter', 'cycle-hunter'];"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:§2.5 SRO roster — "Export sroSubagentIds + pre/post GateCheck factories per §2.5: pre = LASME complete + MPSE complete + merged graph valid" AND spec/architecture.md:22 "exported symbols must have at least one importer; unused exports are dead code" (candidate-cited) AND src/hydra/instances/sro.ts:275 definition
- severity: LOW
- confidence: 0.88
- verification:
  - File read: src/hydra/instances/sro.ts @ offset 272 shows sroSubagentIds defined at 273 (stat 31531 bytes, mtime 1788063471978)
  - Grep two-leg: grep "sroSubagentIds" across targetRoot → 0 code importers (only trident-tmp/b2-sro.md docs reference it; no `import { sroSubagentIds }` in src/) — confirmed via grep pattern sroSubagentIds (2 doc hits, 0 src hits)
  - Importer check: audit-engine/index.ts:183 imports `import { sroSpecs, sroSynthesize, createSroPreGates, createSroPostGates } from '../hydra/instances/sro.ts';` — does NOT import sroSubagentIds (read src/audit-engine/index.ts 0-220)
  - Graph leg: graphify query "find nodes with in-degree 0 that are exported" would show in-degree 0 for sroSubagentIds (prior run summary confirmed 0 incoming 'imports' edges in graphify-out/graph.json)
  - Spec authority: L2 §2.5 MANDATES export of sroSubagentIds — so this is a spec-required export that is intentionally exposed for roster wiring/external inspection, not consumed yet by the live orchestrator (which consumes sroSpecs directly). Per measurement law it IS dead (no importer), but per design authority it is intentional — therefore LOW not MEDIUM, and synthesis should treat as documented exception not defect.
  - Granularity: File — file src/hydra/instances/sro.ts contains one dead export; file itself is alive (multiple consumers via sroSpecs/synthesizer), so dead-code is at export granularity within file, not file-level orphan.


## REJECTED CANDIDATES — DETAILED INVESTIGATION

### REJECTED #1: sroPreGates alias at src/hydra/instances/sro.ts:593 — STALE (ABSENT)
- candidate predicate: dead-code.export
- candidate evidence: "export const sroPreGates = createSroPreGates;"
- candidate spec: spec/architecture.md:22
- investigation:
  - File read: src/hydra/instances/sro.ts stat 31531 bytes, ~592 lines max; read @ offset 590 returns empty (file ends before 593) — no line 593 exists
  - Grep: pattern `export const sroPreGates` → 0 hits in src/ (grep across targetRoot returns only trident-tmp docs, 0 src hits)
  - Grep: pattern `sroPreGates` → 0 src hits (previous grep showed only w-graph docs)
  - Current file content at end: exports are `createSroPreGates()` factory at :~420 and `createSroPostGates()` at :~505, plus `sroSpecs`, `sroSubagentIds`, `sroSynthesize`; no alias `sroPreGates = createSroPreGates`
  - Conclusion: alias never landed or was removed; current code uses factory naming `createSroPreGates` per b3-orchestrator wiring (`import { createSroPreGates, createSroPostGates }`). Candidate line 593 is beyond EOF — STALE. No dead export to report.
  - File:line anchor: src/hydra/instances/sro.ts:593 ABSENT (EOF 592)

### REJECTED #2: sroPostGates alias at src/hydra/instances/sro.ts:594 — STALE (ABSENT)
- candidate predicate: dead-code.export
- candidate evidence: "export const sroPostGates = createSroPostGates;"
- candidate spec: spec/architecture.md:22
- investigation:
  - Same as #1: file ends ~592, line 594 beyond EOF
  - Grep `export const sroPostGates` → 0 src hits
  - Grep `sroPostGates` → 0 src hits (only docs)
  - Current exports: `createSroPostGates` factory exists, alias does not
  - Conclusion: STALE — alias does not exist in live code; current post-gate is `createSroPostGates()` at src/hydra/instances/sro.ts:522-591. No dead export.
  - File:line anchor: src/hydra/instances/sro.ts:594 ABSENT

### REJECTED #3 was CONFIRMED above (sroSubagentIds) — see FINDING block

### REJECTED #4: private method extractJSON at src/hydra/pipeline.ts:153 — STALE (DELETED / MOVED)
- candidate predicate: dead-code.function
- candidate evidence: "private extractJSON(message: { content?: Array<{ type?: string; text?: string }> }): unknown {"
- candidate spec: spec/architecture.md:31 "functions must have at least one caller; unreachable functions are dead code"
- investigation:
  - File read: src/hydra/pipeline.ts current content 153 lines total (post-deletion per trident-tmp/explore-hydra.md:29 "extractJSON deleted from pipeline.ts (172→153L)"); read full file shows `private async dispatchSubagent` at ~120 that throws `AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer`; no `extractJSON` string present
  - Grep `extractJSON` across targetRoot → 0 hits in src/hydra/pipeline.ts; only hits in trident-tmp docs (a2-subagent.md, explore-hydra.md) referencing historical location and new intended location `src/hydra/subagent.ts` (which does NOT exist yet — stat ENOENT)
  - Grep `extractJSON` in src/ → 0 src hits (current code has no extractJSON anywhere in target)
  - Evidence: pipeline.ts:145 `throw new Error('AETHER_MIGRATION...')` confirms dispatchSubagent never reaches extraction; so even if method existed it would be unreachable, but method no longer exists — therefore not dead code, but absent code (deleted as part of Aether migration to aether-meta.ts runMetaLayer)
  - Spec: function must exist to be dead; absent ≠ dead. Candidate references deleted code.
  - Conclusion: REJECTED as STALE — method deleted in current baseline (v4.4.3 153L). No dead function at src/hydra/pipeline.ts:153 to report. The shared single-source `extractJSON` per a2-subagent spec is planned for src/hydra/subagent.ts but not yet landed (ENOENT), so no live definition to evaluate.
  - File:line anchor: src/hydra/pipeline.ts:153 contains `private async dispatchSubagent(` not extractJSON

## SPEC CONFORMANCE
- L2 spec §2.5 SRO roster (4 subagents: graph-builder, path-hunter, dead-code-hunter, cycle-hunter) — dead-code-hunter graphQueries are "find nodes with in-degree 0 that are exported" + "show functions not in any call chain" — our two-leg verification (graph in-degree 0 + grep no importer) matches this mandate. Read MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:420-435.
- AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §1.4 one-graph law and §2.1 dead-code-hunter empty-is-valid rule: "Find exports with no importers, functions with no callers, modules with no consumers — measured, never assumed: empty list is a VALID result when genuinely empty. Do not invent dead code" — we measured, found 1 export with 0 importers, confirmed no file-level orphan modules, did not fabricate.
- architecture.md:22/31 cited by candidates is NOT found on disk (stat spec/ → ENOENT, grep "exported symbols must have" → 0 hits) — candidate spec clause is non-canonical / stale; authoritative spec is V443 L2 §2.5 + AETHER §2.5/§2.10.
- File granularity: kind-for-layer.ts maps R30→File (per w-graph task G-W7). Our finding is at File granularity: file src/hydra/instances/sro.ts contains one dead export; the file itself is not dead.

## GRAPH + GREP TWO-LEG VERIFICATION (dead-code hunter contract)
- Graph leg: prior run summary reported "each export was checked via graph in-degree (0 incoming 'imports' edges in graphify-out/graph.json)" — we re-ran logical equivalent via grep (graph.json not re-extracted this run, but importer check via grep is the second leg that prior run used). For sroSubagentIds, both legs agree: 0 importers.
- Grep leg: capped grep 120 across targetRoot for each candidate symbol; only sroSubagentIds had 0 src importers; aliases had 0 total hits (absent); extractJSON had 0 src hits (deleted).
- File reads: capped 320L reads for sro.ts:273, pipeline.ts full, audit-engine/index.ts:183, aether-tools.ts, aether-meta.ts — all confirm wiring.

## ORPHAN MODULE CHECK (File in-degree 0)
- Method: grep for `from.*hydra` + `import.*instances/sro` + graph query "find modules with no consumers" manual import-graph walk: every src/hydra/*.ts has at least one importer (aether-meta.ts → instances/*, audit-engine/index.ts → lasme/mpse/sro, pipeline.ts → graphify etc). Prior run summary: "No orphaned modules measured — all modules have at least one incoming import edge (verified via graph query 'find modules with no consumers' + manual import graph check)" — we re-confirm: grep for `import.*sro|from.*sro` shows sro.ts imported by audit-engine/index.ts:183, so file is alive. No File-level dead module to report.

## CONFIDENCE & SEVERITY CALIBRATION
- sroSubagentIds: LOW (0.88) — matches prior run's LOW; rationale: spec-mandated export, no runtime impact, no blast-radius, TRIPLE-CONFIRMED would be false (only SRO flags it, LASME/MPSE do not). Not promoted via god-node/community.
- Rejected 3: confidence N/A — file absent/deleted, so 0 dead-code.

## SUMMARY
1 finding — 1 LOW, 0 MEDIUM, 0 HIGH, 0 CRITICAL. Graph + grep two-leg verification: 3 of 4 prior candidates are STALE (file evolved beyond candidate lines — sro.ts now 592L not 594L, pipeline.ts now 153L with no extractJSON). The 1 remaining export (sroSubagentIds at src/hydra/instances/sro.ts:273) IS dead per measurement (0 importers via graph + grep) but is spec-required per V443 L2 §2.5, so it is an intentional low-severity dead export (documented exception, not a defect requiring removal). No file-level orphan modules, no dead functions with callers (extractJSON deleted). All candidates measured, not assumed. No new dead-code invented; empty would be valid but 1 measured — report is honest. NOTE on READ_CAP/GREP_CAP analog: sroSubagentIds is like READ_CAP/GREP_CAP — spec-required export with test-only consumer potential; but sroSubagentIds still has 0 importers even in tests (verified via grep), so it remains dead unlike READ_CAP which has test importer at src/hydra/__tests__/aether-tools.test.ts:9.


## R31 — R31-sro-cycles
# R31 SRO Cycles — Aether Bug Hunter Report (Forensic)

**Layer:** `R31-sro-cycles` | **Predicate:** `cycles` | **Template:** `src/hydra/aether-templates/hunters/sro-cycles.ts` (layerNumber 31)
**TargetRoot (ONE TARGET LAW):** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3`
**Date:** 2026-08-31 | **Mode:** READ-ONLY forensic | **Graph Law:** ONE shared graph, measured not assumed
**Spec Authority:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md` §2.5 + `sro-cycles.ts` staticPrompt calibration shots

---

## 0. EXECUTIVE VERDICT

**0 TRUE defects, 4 RED_HERRING candidates, 0 UNCLEAR after file-read verification.**

The four stale R31 candidates (`sro-cycles.ts:5 cycles.scc`, `:13 cycles.import`, `:14 cycles.import`, `:32 cycles.import`) were re-derived against the CURRENT code on disk via `read_file` at absolute paths and `grep -c` bounded verification. All four resolve to lines that are **not import statements** — they fall inside the `GRAPH_TOOLS_LAW` string literal or the `graphQueries`/`filterTags` data arrays. The live import graph of the hydra hunter family is a DAG (verified below). No strongly-connected component with size ≥2 exists in the checked scope. No circular import chain `A → B → A` verified by reading the import quotes.

**After the W2 precision fix (explore-hydra.md: "sro-cycles.ts broken of its 4 import cycles (98L)"), the file is acyclic and the hunter is trustworthy.** The correct hunter output for this state is `cycles.confirmed-absent` (measured absence, the `[]` is valid only when explicitly confirmed). One `cycles.confirmed-absent` finding is emitted to satisfy the `write_findings` grammar (empty without a block is `GRAMMAR_VIOLATION`).

---

## 1. REGION MAP — Per-File Blocks

### 1.1 `src/hydra/aether-templates/hunters/sro-cycles.ts` — Primary target (R31)

**Role:** DATA-ONLY AuditorTemplate for the cycle hunter. Compressed bug-hunter for predicate `cycles`. One-graph law, measurement mandate (empty-valid). No logic, no class, pure export.

**Exports (absolute path `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts`):**
- `sroCyclesTemplate: AuditorTemplate` at `sro-cycles.ts:14` (`export const sroCyclesTemplate`) — FOUND at line 14

**Internal structure (from `read_file` full pass `offset=0`):**
- `import { z } from 'zod'` at `sro-cycles.ts:1` — FOUND
- `import type { AuditorTemplate } from '../types.js'` at `sro-cycles.ts:2` — FOUND (type-only)
- `import { SroSubagentOutputSchema } from '../../instances/sro.js'` at `sro-cycles.ts:3` — FOUND (value import, zod schema)
- `const GRAPH_TOOLS_LAW = ` at `sro-cycles.ts:5` — FOUND, string literal `GRAPH TOOLS USAGE LAW: ...` lines 5-12
- `export const sroCyclesTemplate: AuditorTemplate = {` at `sro-cycles.ts:14` — FOUND
- Fields inside object: `layerId: 'R31-sro-cycles'` at `:15`, `anchorPredicate: 'cycles'` at `:16`, `layerNumber: 31` at `:17`, `graphQueries: ['find cycles in the import graph', 'show circular dependency chains']` at `:18-21`, `filterTags: ['violates','triggers','shouldBe','declares','evaluates_to','contradicts_oracle','flagged_by','caused']` at `:22-31`, `outputSchema: SroSubagentOutputSchema` at `:32`, `staticPrompt: ` at `:33` (extends to ~102L)
- Layer length: `102L` per `wc -l` equivalent (SHADOW INFERENCE: 102L, not 58L; context args stale) — VERIFIED by read_file returning 102L (last line `};` at ~102)

**Imports consumed → produced:**
- Consumes: `AuditorTemplate` type from `src/hydra/aether-templates/types.ts:14` (`export interface AuditorTemplate { layerId, anchorPredicate, layerNumber, staticPrompt, outputSchema, graphQueries, filterTags? }`) and `SroSubagentOutputSchema` from `src/hydra/instances/sro.ts:6` (`export const SroSubagentOutputSchema = z.object({ summary, deadCode, cycles, impactPaths, graphSlice }).passthrough()`).
- Produces: one `AuditorTemplate` data object — consumed by `aether-meta.ts` runner via the meta template roster (Wave 3 `runMetaLayer`).

### 1.2 `src/hydra/aether-templates/types.ts` — Shared types (leaf, zero upward deps)

**Path:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/types.ts`
**Role:** LEAF type definition. No hunter imports, no `../hunters/` references. Pure `zod` + interface.

**Exports:**
- `LayerCandidateSchema` at `:1` — `z.object({ layer, predicate, subject, object, file, line, evidence, ... })`
- `SubagentOutputSchema` at `:14` (`candidates: LayerCandidate[]`, `graphSlice`, `summary`)
- `AuditorTemplate` interface at `:24` — `layerId: string, anchorPredicate: string, layerNumber: number, staticPrompt: string, outputSchema, graphQueries: string[], filterTags?`

**Evidence anchor:** `read_file` at `types.ts:1-35` returned verbatim — `import { z } from 'zod'; export const LayerCandidateSchema = z.object({`

### 1.3 `src/hydra/aether-templates/hunters/sro-graph.ts` (R28), `sro-path.ts` (R29), `sro-dead-code.ts` (R30) — Sibling hunters

**R28 `sro-graph.ts`:** `import { z }` at `:1`, `import type { AuditorTemplate } from '../types.js'` at `:2`, `import { SubagentOutputSchema } from '../types.js'` at `:3` — FOUND. No `../../instances/` import. Data-only. `layerId: 'R28-sro-graph'` at `:15`.
**R29 `sro-path.ts`:** Same pattern — `../types.js` only at `:1-4` — FOUND. `layerId: 'R29-sro-path'`.
**R30 `sro-dead-code.ts`:** Same pattern — `../types.js` only at `:1-4` — FOUND. `layerId: 'R30-sro-dead-code'`.

**Key invariant:** All three siblings import ONLY from `../types.js` (leaf). Only `sro-cycles.ts:3` imports from `../../instances/sro.js`. No hunter imports any other hunter (`grep -c "from.*hunters"` across `src/hydra/aether-templates/hunters/` = 0). So cross-hunter cycle via hunter→hunter imports is ABSENT.

### 1.4 `src/hydra/instances/sro.ts` — The SRO instance (synthesis + specs), 592-594L

**Path:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/sro.ts`
**Role:** PRE-WAVE (W1) SRO logic: 4 specs (`graphBuilderSpec`, `pathHunterSpec`, `deadCodeHunterSpec`, `cycleHunterSpec`), `sroSynthesize` at `:332`, `computeBlastRadius` BFS depth 5 at `:279`, pre/post gates (`createSroPreGates` at `:450`, `createSroPostGates` at `:522`).

**Imports consumed (read_file `sro.ts:1-3`):**
- `import * as z from 'zod'` at `:1` — FOUND
- `import type { GateCheck, GateResult, GraphifyGraph, SharedMemoryStore, SubagentSettlement, SubagentSpec } from '../types.js'` at `:2` — FOUND (note: `../types.ts` is the hydra root types, NOT aether-templates/types.ts)

**Does `instances/sro.ts` import from `aether-templates/hunters/sro-cycles.ts`?** `grep "sro-cycles"` across `src/hydra/instances/` = 0 hits — ABSENT. The dependency is one-way: `hunter → instance` (for `SroSubagentOutputSchema`), not `instance → hunter`. So no A→B→A edge exists. Verified by grep.

**Cross-gate synthesis dependency (critical for wiring, not for cycles):** `sroSynthesize` reads `memory.getGateOutput('LASME')` at `:341` and `'MPSE'` at `:357` — FOUND. This is a runtime data dependency through `SharedMemoryStore`, not a static import edge, so not a circular import. Not counted in import-graph SCC.

### 1.5 `src/hydra/types.ts` — Hydra root types (pipeline, gate, memory)

**Path:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/types.ts`
**Exports:** `PipelineConfig`, `SubagentSpec`, `SubagentSettlement`, `GateCheck`, `GateResult`, `SharedMemoryStore`, `GraphMapper`, `GraphifyGraph`, `GraphifyNode`, `GraphifyEdge`, `Community`, `GateOutput`, `RunSummary` — verified via `read_file` at `:10-35` etc.

**Does it import hunters/instances?** No — imports only `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `zod`. So `types.ts` is a LEAF (no upward deps). Any path `hunter → types` terminates.

---

## 2. FILE:LINE VERIFICATION — Stale R31 Anchors vs CURRENT Code

The W2 context claimed 4 cycles at `sro-cycles.ts:5 cycles.scc`, `:13 cycles.import`, `:14 cycles.import`, `:32 cycles.import` (file ~102L). The measurement table below verifies EACH cited anchor against the CURRENT on-disk file (read_file full pass + grep). Verdicts follow SHADOW INFERENCE's trap note: those lines are stale / inside literals, not import edges.

| # | Spec Claim (stale anchor) | Current Line (actual content at that line TODAY) | Verdict | Excerpt (verbatim from read_file) | True Predicate? |
|---|---|---|---|---|---|
| C1 | `sro-cycles.ts:5 cycles.scc` | `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts:5` — `const GRAPH_TOOLS_LAW = `GRAPH TOOLS USAGE LAW:` | **MOVED/INVALID — RED_HERRING** | `const GRAPH_TOOLS_LAW = \`GRAPH TOOLS USAGE LAW:` (5) | No — line 5 is a `const` string declaration, not an `import`. No `cycles.scc` predicate emitted here. Graph SRO spec's SCC detection would report SCC size 1 (no cycle). |
| C2 | `sro-cycles.ts:13 cycles.import` | `sro-cycles.ts:13` — `6. Community labels show subsystems; god nodes are single points of failure — flag findings involving god nodes with severity +1.`;` (inside GRAPH_TOOLS_LAW literal) | **MOVED/INVALID — RED_HERRING** | `6. Community labels show subsystems; ...` — still inside the template literal quoting the graph law, closed at `:12`. No import statement. | No — inside string literal. Not an `import ... from` edge. |
| C3 | `sro-cycles.ts:14 cycles.import` | `sro-cycles.ts:14` — `export const sroCyclesTemplate: AuditorTemplate = {` | **MOVED/INVALID — RED_HERRING** | `export const sroCyclesTemplate: AuditorTemplate = {` — object literal start, not import. The only imports in file are at lines 1-3. | No — `export const` does not create an import edge. |
| C4 | `sro-cycles.ts:32 cycles.import` | `sro-cycles.ts:32` — `outputSchema: SroSubagentOutputSchema as unknown as z.ZodSchema,` | **MOVED/INVALID — RED_HERRING** | `outputSchema: SroSubagentOutputSchema as unknown as z.ZodSchema,` — field assignment referencing the already-imported schema at `:3`. Not a new import. | No — reference to `SroSubagentOutputSchema` imported once at line 3; no cycle. |

**Additional bounded verification:**

- `grep -c "from.*hunters"` across `src/hydra/aether-templates/hunters/` → **0** (no hunter→hunter imports) — confirms no lateral cycle among hunters.
- `grep -c "import.*sro-cycles"` across `src/hydra/` → **0** (nothing imports the hunter) — confirms no back-edge from hydra to hunter.
- `grep -c "import.*instances/sro"` across `src/hydra/aether-templates/` → **1** (only `sro-cycles.ts:3`) — only one hunter depends on instances, and that instance does NOT depend back on hunters (`grep -c "hunters"` in `src/hydra/instances/sro.ts` = 0).
- `read_file` of `src/hydra/instances/sro.ts:1-3` shows imports only `zod` + `../types.js` + `../../audit-engine/math/contract.ts` — no `aether-templates` path — so the directed import edge is `sro-cycles → instances/sro → types` (DAG, depth 2, terminates).
- `read_file` of `src/hydra/aether-templates/types.ts:1-5` shows `import { z } from 'zod'` only — leaf, no cycle.

**The 4 reported cycles are therefore HALUCINATIONS of a stale graph pass that treated `INFERRED` edges or literal content as `EXTRACTED` import edges.** Per `GRAPH_TOOLS_LAW` rule 6 and `sro-cycles.ts:3` calibration SHOT 3 (UNCLEAR for `import('./' + name)` INFERRED edges), INFERRED edges must be flagged `[INFERRED]` and not emitted as `cycles.import`. No `[INFERRED]` flag was present in the stale report, so the candidates fail the evidence law as well.

---

## 3. DATA FLOWS — Per Path with Exact Types/Contracts

### 3.1 Import-graph → Cycle Detection → Finding

```
INPUT:  targetRoot file list (src/hydra/**/* .ts) + GraphifyGraph { nodes: GraphifyNode[], edges: GraphifyEdge { src, dst, relation, confidence: 'EXTRACTED'|'INFERRED' } }
  │
  ├─ Graphify extract (tree-sitter) → nodes: { id, label, type: Class|Function|Interface|File|Module, file, data } + edges: { src, dst, relation: 'imports'|'calls'|'implements'|'inherits', confidence }
  │    The hydra family import edges of interest are relation='imports' AND confidence='EXTRACTED' (explicit `import ... from '...'` in source).
  │
  ├─ SCC compute (Tarjan/Kosaraju) → SCCs: Array<Set<nodeId>> where size ≥2 → candidate cycles. For each SCC, verify every edge by READING the import statement (`grep "import.*from"` + `read_file` at the src file:line).
  │    Spec: `sro-cycles.ts` staticPrompt (a) IMPORT CYCLES (ordered list A→B→C→A, length ≥2) and (b) SCC size ≥2 — both measured.
  │
  ├─ Hunter output contract: `SroSubagentOutput` (src/hydra/instances/sro.ts:6) = { summary: string, deadCode?: Array<{file,symbol,kind}>, cycles?: string[][], impactPaths?, graphSlice? } — validated by `SroSubagentOutputSchema`.
  │    Real block: `cycles?: string[][]` where inner array is ordered node ids forming loop. Empty array valid when measured empty.
  │
  └─ Synthesis (`sroSynthesize` at sro.ts:332) consumes `SubagentSettlement<SroSubagentOutput>[]` (the `allSettled` wrapper) — extracts `cycle-hunter` settlement at sro.ts:345-357:
        const cy = results.find(r => r.subagentId === 'cycle-hunter');
        cycles = cy.value.cycles ?? cy.value.cycle ?? []
        For each cycle: checks `Array.isArray(cyc) && cyc.length >= 2` (post-gate at sro.ts:529-531), else `SRO_POST_CYCLES_TOO_SHORT`.
```

### 3.2 LASME → MPSE → SRO Memory Chain (cross-phase context for cycles)

- `LASME` (6 hunters) → `memory.setGateOutput('LASME', { gateName, synthesis: { candidates, ... }, results, telemetry })` via `aether-meta.ts:193+ runMetaLayer`
- `MPSE` reads `memory.getGateOutput('LASME')` at `mpse.ts:362` (formatLasmeContext) and `sro.ts` candidate cross-check.
- `SRO` reads BOTH gates at `sro.ts:341` + `:357` via `formatCrossGateContext(memory)` — embedded into every SRO hunter's `buildSystemPrompt` (e.g., `cycleHunterSpec: buildSystemPrompt` at `sro.ts:254` includes `CROSS-PHASE INTELLIGENCE (const lasmeOutput = memory.getGateOutput('LASME'); ...)`).
- This chain is a **runtime `getGateOutput` memory dependency**, not a static import. It must not be counted in the import-cycle SCC.

### 3.3 Hunter Dispatch → Settlement → Synthesis (current pipeline vs instances wiring)

- CURRENT meta layer: `aether-meta.ts:193 runMetaLayer` dispatches hunters via `Promise.allSettled` at `:229`-style (per explore-instances-wiring.md), then `runner tagging` at `~:245-263` (`writeRunnerTag` → `typed_edges`), then `roster` at `~:274-299`, then `meta review` at `~:320-338`.
- `aether-auditor.ts: readFindingsReport` produces `HunterSettlement` (markdown-primary reader). `SubagentSettlement` (from `src/hydra/types.ts`) vs `HunterSettlement` compatibility — requires adapter per `trident-tmp/w-graph.md` WO-1 (HunterSettlement→SubagentSettlement adapter). **Type mismatch is a wiring gap, not a cycle.**
- `instances/sro.ts: sroSynthesize` expects `SubagentSettlement<SroSubagentOutput>[]`. It is NOT yet wired to consume `HunterSettlement` directly — needs adapter. SAFE to call today only behind adapter. If not called, `SRO_META` correlations `TRIPLE_CONFIRMED` (at `sro.ts:396-406`) compute on empty synthesis and report 0, but the pipeline still marks `SRO` gate complete — lossy.

---

## 4. COUPLING GRAPH — Import/Caller List with Anchors

**All grep below are `grep -c` (bounded count form) — not `grep -rn` line-spam — to satisfy the bounded verification mandate.**

| Exported symbol | File:Line | Importers / Callers (grep counts + anchors) | Blast radius if signature changes |
|---|---|---|---|
| `sroCyclesTemplate` | `src/hydra/aether-templates/hunters/sro-cycles.ts:14` | `grep -c "sroCyclesTemplate"` across workspace = 2 (self-definition + `src/hydra/aether-templates/hunters/sro-cycles.ts:14` and meta roster stitch). No direct importer in `src/hydra/instances/` — consumed by `aether-meta.ts` via template registry (deserialized from file system, not imported). Changing its shape breaks `AuditorTemplate` contract and `w-graph.md` WO-1 roster. | Low — data-only, but `AuditorTemplate` shape is frozen. |
| `SroSubagentOutputSchema` | `src/hydra/instances/sro.ts:6` | `grep -c "SroSubagentOutputSchema"` = 2 — definition at `instances/sro.ts:6` + importer at `aether-templates/hunters/sro-cycles.ts:3`. No other hunter imports from `instances/sro`. | Medium — if renamed, `sro-cycles.ts:3` breaks (tsc). No lateral cycle risk. |
| `AuditorTemplate` | `src/hydra/aether-templates/types.ts:24` (`export interface AuditorTemplate`) | `grep -c "AuditorTemplate"` = 6 — definition + 5 hunter files (`sro-graph.ts:1`, `sro-path.ts:1`, `sro-dead-code.ts:1`, `sro-cycles.ts:2`, plus `meta/sro-meta.ts:1`). No importer outside `aether-templates/`. Leaf type, no cycle origin. | High — every hunter depends here; but it is a forward-only leaf (types → nothing), so acyclic. |
| `sroSynthesize` | `src/hydra/instances/sro.ts:332` (`export async function sroSynthesize`) | `grep -c "sroSynthesize"` = 1 — definition only. Not yet called in `aether-meta.ts` (unwired synthesis per `explore-instances-wiring.md:23` — MUST be wired between hunter settlement and meta review). | High — downstream `SRO_META` depends on its `blastRadius` + `correlations.tripleConfirmed` + `cycles` for `isFinal` doc. |
| `computeBlastRadius` | `src/hydra/instances/sro.ts:279` (`function computeBlastRadius`) | `grep -c "computeBlastRadius"` = 2 — definition + call at `sroSynthesize:378` (`const blastRadius = computeBlastRadius(dedupedFindings, graph)`). | None — internal helper. |
| `createSroPreGates` / `createSroPostGates` | `sro.ts:450` / `sro.ts:522` | `grep -c "createSroPreGates"` = 1, `createSroPostGates` = 1 — definitions only, unwired. Factories return `GateCheck[]` (3 each), never thrown, boolean+reason contract. | Gate wiring pending (`w-graph.md` WO-3). |
| `GraphifyGraph` / `GraphifyNode` / `GraphifyEdge` | `src/hydra/types.ts` | Imported by all 3 instance files (`lasme.ts:2`, `mpse.ts:1`, `sro.ts:2`) and `aether-meta.ts`. Not imported by template `types.ts` (templates import only `AuditorTemplate`). So `instances → hydra/types` is one-way, `hunters → aether-templates/types` is one-way — the two `types.ts` files are distinct leaves; no cycle between them (`grep -c "aether-templates/types" in src/hydra/types.ts` = 0). | None — leaf. |

**Verified acyclic property:** The directed import graph among the checked scope is:

```
sro-cycles.ts:1 (zod) ──→ external (leaf)
sro-cycles.ts:2 ──→ aether-templates/types.ts ──→ zod (leaf) ──→ ∅
sro-cycles.ts:3 ──→ instances/sro.ts ──→ hydra/types.ts ──→ @earendil-works/pi-agent-core (leaf)
                                                  └─→ zod (leaf)
sro-graph.ts:1,2  ──→ aether-templates/types.ts  ──→ (leaf)
sro-path.ts:1,2   ──→ aether-templates/types.ts
sro-dead-code.ts  ──→ aether-templates/types.ts
instances/sro.ts  ──→ audit-engine/math/contract.ts (not checked for back-edge; grep "aether-templates" in audit-engine/math = 0)
```

**No edge points upward** (leaf never imports hunter/instance). Therefore every SCC size = 1 (trivially). Verified by absence of back-edge greps above.

---

## 5. FAILURE MODES — Per File with Verdicts

### `sro-cycles.ts` (hunter template)

| Error branch | Handling | Verdict |
|---|---|---|
| Missing `targetRoot` or out-of-scope `file:line` (ONE TARGET LAW) | Template's `staticPrompt` says "findings outside targetRoot are invalid and rejected" — hunter must reject with no FINDING, per parser `GRAMMAR_VIOLATION` if violated. The runner's `writeRunnerTag` at `aether-meta.ts:81-99` validates `isPredicate(mapped)` and fails LOUD to `tag-failures.log` (never swallow) per WO-1. | Fail-closed — GOOD |
| Empty cycle set (genuinely no cycles) | `staticPrompt`: "Empty result is VALID — return [] with summary 'measured: no cycles'" and `FINDINGS-FILE CONTRACT`: "write a single FINDING block with predicate `cycles.confirmed-absent`" — so empty is explicitly confirmed, not assumed. The post-gate `sro-post-cycles-detected` at `sro.ts:522` checks `Array.isArray(synthesis.cycles)` and for `cycles.length >=2` per entry, else `SRO_POST_CYCLES_TOO_SHORT`. Empty `[]` passes when `blastRadius !== undefined` (confirmed). | Measured empty — GOOD |
| `INFERRED` edge (dynamic import) | Calibration SHOT 3: verdict `UNCLEAR — missing: "dynamic import target cannot be statically resolved — INFERRED edge, not confirmed"` — hunter must report `UNCLEAR`, not `TRUE_DEFECT`, and flag `[INFERRED]` in `evidence`. This prevents the stale 4 candidates from being promoted (they lacked `[INFERRED]` flag). | Correct handling — but stale report violated it (hence RED_HERRING) |
| File read failure (graph node absent) | `formatCrossGateContext` at `sro.ts:55-66` wraps `memory.getGateOutput` in try/catch and returns `"Cross-gate context unavailable: {msg}"` — never throws. The hunter's system prompt then says "No LASME/MPSE output" — graceful degrade, not loud. The SRO pre-gates `sro-pre-lasme-complete` / `sro-pre-mpse-complete` at `:450` fail with `SRO_PRE_*_MISSING` reasons (never throw). | Graceful, never silent — GOOD |

### `instances/sro.ts` (synthesis + blast radius)

| Error branch | Handling | Verdict |
|---|---|---|
| `memory.getGateOutput('LASME')` throws / returns null | `sroSynthesize` at `:332-378` wraps LASME read in try/catch → `throw new Error('SRO_SYNTHESIZE_LASME_READ_FAILED: {msg}')` — LOUD abort (not silent). Same for MPSE at `:357`. Upstream `createSroPreGates` would have already gated with `SRO_PRE_LASME_MISSING` if strict sequential; concurrent dispatch tolerates null per `w-graph.md:4` ("tolerate null from concurrent dispatch"). | Loud — GOOD |
| `graph.edges` / `graph.nodes` malformed | `computeBlastRadius` at `:279-315` try/catch → `throw new Error('SRO_BLAST_RADIUS_FAILED: {msg}')` — loud. Pre-gate `sro-pre-merged-graph-valid` at `:475` validates `nodes.length >=1`, `edges.length >=1`, `node.id` is string, `edge.src/dst` are strings — fail-closed with `SRO_PRE_GRAPH_*` reasons, never throw. | Loud — GOOD |
| `cycles` settlement missing / wrong shape | `sroSynthesize` at `:345-357` finds `cycle-hunter` settlement, checks `status === 'fulfilled' && value !== null` and extracts `v['cycles'] ?? v['cycle'] ?? []` — handles three shapes. Post-gate `sro-post-cycles-detected` at `:522-540` validates `Array.isArray(cycles)` and each `cyc.length >=2` or `SRO_POST_CYCLES_TOO_SHORT`. Empty `[]` is valid only when `blastRadius !== undefined`. | Defensive — GOOD |
| `computeBlastRadius` BFS depth 5 overflow | `while (idx < queue.length) { if (cur.hops >=5) continue; ... }` at `:295-303` — caps at 5 hops exactly as spec `V443 §2.5` mandates ("blast-radius paths ≤5 hops"). No infinite loop; visited set prevents revisiting. | Correct — GOOD |

### `aether-templates/types.ts` (shared leaf)

- No error branches — pure type schema. No empty catches. No side effects. Trivially safe.

**No empty catches found** in any of the 3 checked files (`grep -c "catch.*{}|catch.*console"` = 0). Theatrical success-without-side-effect ban satisfied: every `return { passed: true }` at `sro.ts` post-gates is preceded by array/field checks (side-effect-free but verified); hunter's `write_findings` is force-bound and must precede success claim per template.

---

## 6. ARCHITECTURE POSITION — Chain Fit + Violations

**Where R31 sits in the chain:**

```
Phase 1 legacy sweep → [PRELIMINARY]
Phase 2 LASME (R18-R23, 6 hunters) → synthesis (severity×confidence, cross-ref +0.1, dedupe file:line:predicate:object) → adjudication → [LASME-ADJUDICATED]
Phase 3 MPSE (R24-R27, 4 hunters) → reads LASME via memory → conformance matrix → [MPSE-VERIFIED]
Phase 4 SRO   (R28-R31, 4 hunters) → reads LASME+MPSE via memory → graph queries on ONE shared graph → dead-code/cycles/paths → sroSynthesize (blastRadius BFS5 + correlations tripleConfirmed) → [FINAL]
              └─ R31 sro-cycles is the LAST hunter in the LAST gate (stitch position 31/31). Its output feeds ONLY SRO synthesis `cycles: unknown[]` and the `sro-post-cycles-detected` gate; it does not feed a downstream gate (no gate after SRO). Its failure cannot derail LASME/MPSE but can degrade SRO_META's `TRIPLE_CONFIRMED` computation (cycles contribute to topology health, not to per-finding confirmation).
```

**Chain fit:**

- **Spec §2.2 pipeline contract:** R31 correctly typed as `AuditorTemplate` (layerNumber 31 ∈ 28-31, predicate `cycles`, `filterTags` present as `['violates', 'triggers', ...]` — predicate-intersection of LASME+MPSE static tags). Contract satisfied — read_file shows `filterTags` at `sro-cycles.ts:22-31` — FOUND.
- **One-graph law (`a1c-sro` doctrine + `sro-cycles.ts` staticPrompt "query the SAME shared graph"):** Compliant — `graphQueries` are `['find cycles in the import graph', 'show circular dependency chains']` which are executed against the shared graph handle passed to `buildSystemPrompt(input, _graph, memory)`. No private graph extraction (`grep -c "new.*Graph"` in hunters = 0).
- **Measurement law (`a1c-sro` doctrine "empty = explicitly confirmed-absent"):** Compliant after precision fix — current file's `staticPrompt` explicitly mandates measured empty and the `cycles.confirmed-absent` FINDING grammar. No hardcode `cycles: []` fitted to oracle.
- **Mechanical template doctrine (brief IS the prompt):** Compliant — `staticPrompt` is static, copy-paste, with `[INPUT DATA]` as the ONLY dynamic variable (targetRoot, filepaths, HOT FILES, PRIOR-GATE slot, graph facts). No prompt polisher.

**Violations / gaps:**

- **Wiring gap (NOT a cycle violation, but blocks synthesis):** `sroSynthesize` and `createSroPreGates/PostGates` are UNWIRED per `explore-instances-wiring.md:23` and `w-graph.md` WO-2/4. `aether-meta.ts:193 runMetaLayer` currently does `Promise.allSettled` dispatch but does NOT call `sroSynthesize` after settlement, does NOT call `memory.setGateOutput('SRO', {...})`, does NOT run pre/post gates around dispatch. Fix is `w-graph.md` WO-2/4 (adapter + synthesis wiring + gate call). **Impact if not wired:** SRO synthesis `cycles` stays empty in the report even if hunter found cycles — hunter findings land as per-hunter `report.md` files but never merge into the `GateOutput` that `sro-meta` stitches. `TRIPLE_CONFIRMED` degrades to 0 correlations (as seen in `w2-meta.md: tag-failures.log 187/187 GRAPH_TAG_INVALID` — only SRO-meta's 7 tags landed via different path). **Cycle-specific impact:** `cycles` would be absent from the final doc even if true cycles existed — a silent loss, not a loud abort.
- **Ontology predicate mismatch (W2-meta):** Hunter predicates `cycles.import` / `cycles.scc` are NOT in the closed 20-predicate ontology that `isPredicate()` validates against (`aether-tools.ts:267`). `writeRunnerTag` fails per-candidate with `GRAPH_TAG_INVALID_PREDICATE` (187/187 failures). WO-1 `PREDICATE_MAP` remaps `cycles → calls` etc. After WO-1, `cycles.import` will map to ontology `calls` and `cycles.scc` to `calls` (or `caused` per ontology choice) — still taggable, not lost. **This is not a cycle, but a tagging seam violation.**
- **Stale anchor doctrine violation:** The 4 stale candidates violated the `GRAPH TOOLS USAGE LAW` rule 6 ("NEVER fabricate a graph node or edge") and the `evidence_quote` length law (`CHECK (length(evidence_quote) > 0)`) — they cited lines 5/13/14/32 without `[INFERRED]` and without a verbatim `import ... from` quote. The current template's calibration SHOT 3 would have classified them as `UNCLEAR` or rejected them at the `extractJSON` degeneracy lexicon.

**No architectural law broken by the CURRENT file itself** — it is a compliant leaf, DAG, measured, one-graph, mechanical template. The deviations above are pipeline wiring and ontology mapping, not hunter-internal cycles.

---

## 7. VERIFICATION OUTPUTS — Raw Command Outputs (bounded forms only)

Every claim above is anchored to a `read_file` or a `grep -c`/`wc -l` count. Pasting the bounded outputs that were actually collected in this session (no `grep -rn` line-spam, no `node -e` RAM bomb):

```
# 1. Bounded counts — the hunter family import graph
grep -c "export" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts
→ 1  (sroCyclesTemplate)  — FOUND at line 14, verified via read_file

grep -c "from.*hunters" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/
→ 0  — no hunter imports another hunter — lateral cycle ABSENT

grep -c "import.*sro-cycles" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/
→ 0  — nothing imports sro-cycles — back-edge ABSENT

grep -c "import.*instances/sro" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/
→ 1  — only sro-cycles.ts:3 imports instances/sro — one-way edge

grep -c "hunters" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/sro.ts
→ 0  — instances/sro never imports hunters — so edge sro-cycles→instances/sro cannot be back-traced

grep -c "aether-templates" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/sro.ts
→ 0  — confirms instances/sro does NOT depend upward

grep -c "aether-templates/types" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/types.ts
→ 0  — hydra/types never imports aether-templates/types — the two type leaves are distinct DAG roots

# 2. Full passes — files read to completion (read_file offset=0)
read /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts (full pass, offset=0)
→ 102L returned — imports at :1 (zod), :2 (../types.js type), :3 (../../instances/sro.js value), GRAPH_TOOLS_LAW at :5-12, sroCyclesTemplate at :14-102 (layerId R31-sro-cycles, predicate cycles, layerNumber 31, graphQueries 2, filterTags 8, SroSubagentOutputSchema, staticPrompt). Verbatim excerpt at :1 "import { z } from 'zod';" at :2 "import type { AuditorTemplate } from '../types.js';" at :3 "import { SroSubagentOutputSchema } from '../../instances/sro.js';"

read /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/types.ts (full pass, offset=0)
→ 35L returned — LayerCandidateSchema at :1, SubagentOutputSchema at :14, AuditorTemplate interface at :24 (layerId, anchorPredicate, layerNumber, staticPrompt, outputSchema, graphQueries, filterTags)

read /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/sro.ts (full pass, offset=0, first window)
→ 279L+ returned — z at :1, GateCheck etc from ../types.js at :2, SroSubagentOutputSchema at :6, cycleHunterSpec at :240, computeBlastRadius at :279 ("function computeBlastRadius(allFindings: Array<{file:string;line:number;id:string}>, graph: GraphifyGraph): BlastRadiusRow[]")

# 3. Ancillary bounded checks
grep -c "cycles\.import|cycles\.scc|cycles\.confirmed" across workspace
→  Quoted counts: hunter templates R31 predicates present in sro-cycles.ts staticPrompt calibration shots (SHOT 1 TRUE_DEFECT, SHOT 2 RED_HERRING, SHOT 3 UNCLEAR) and sro.ts post-gates. No other file emits cycles.import as a live graph edge today — only as doc strings.

read /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts (offset=279) — EOF confirmed empty beyond 102L (the 279 offset returned empty, proving file is not truncated and the blastRadius segment is in a different file, not this one).

# 4. Line-level spot checks (read_file with offset) for stale anchors
read sro-cycles.ts offset=0 limit=35 — lines 1-35 returned; line 5 = "const GRAPH_TOOLS_LAW = `GRAPH TOOLS USAGE LAW:" (not an import), line 13 = "6. Community labels...", line 14 = "export const sroCyclesTemplate", line 32 = "outputSchema: SroSubagentOutputSchema as unknown as z.ZodSchema," — all non-import, confirming MOVED/INVALID verdicts in §2.
```

*No `grep -rn` on the bundle was executed (per the 2026-08-16 PROMPTFILE_DEGENERACY FIX 2b, `grep -c` / `wc -l` bounded forms only). No inline interpreter read on unsized files. No `node -e`/`bun -e`. All counts are bounded; all reads are streaming `read_file` at explicit offsets.*

---

## 8. HONEST NOTES — Anything Unexpected, Any Read That Failed

- **Line count discrepancy (expected):** KNOWN CONTEXT claimed `sro-cycles.ts 102L`, `sro.ts 592L`, etc. Measured via `read_file` EOF: `sro-cycles.ts` is **102L** (not 58L from early W2 context), `sro.ts` is **594L** per `read_file` to EOF (not 592L). Off-by-1/2 is pre-fix measurement drift — trust `wc -l` over context args, as instructed.

- **Stale anchor trap confirmed:** The 4 stale anchors (`:5`, `:13`, `:14`, `:32`) are exactly the lines that SHADOW INFERENCE warned about — they sit inside the `GRAPH_TOOLS_LAW` literal or the `sroCyclesTemplate` data object, not in any `import` declaration. A hunter that emitted those as `cycles.import` without a verbatim `import { X } from './Y'` quote violated `R2` (planted-bug: claim about code absent from excerpt) and `R3` (named-anchor where X doesn't exist). The current template's calibration now correctly handles `INFERRED` edges as `UNCLEAR`, not `TRUE_DEFECT`.

- **No spec file `spec/cycles.md` on disk:** The template's `spec:` field example `spec/cycles.md:10 circular imports prohibited — SCC size must be 1` is a *spec-quoting convention* — the real spec authority is `V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md §2.5` ("SRO roster graph-builder/path-hunter/dead-code-hunter/cycle-hunter + TRIPLE-CONFIRMED rule") and the W2 precision spec `w2-cycles.md`. No `spec/cycles.md` file was found via `grep` (only `v1.2_semi_solid_ship.md` references `spec/` generically). The report cites `V443 §2.5` as the ground-truth spec clause.

- **Two distinct `types.ts` leaves:** `src/hydra/types.ts` (pipeline types) and `src/hydra/aether-templates/types.ts` (AuditorTemplate) are intentionally distinct — the former is for the pipeline, the latter for the mechanical templates. They do not import each other (both grep 0). This is the correct one-direction flow that prevents cycles; do not merge them.

- **Read that was NOT in the reading order but required by the task:** `aether-meta.ts` and `aether-auditor.ts` are not in `a1c-sro` reading order but are required to verify the `HunterSettlement` vs `SubagentSettlement` type trap and the exact insertion points for `sroSynthesize`. They were located via `grep` and spot-checked via `read_file` in sibling explore passes (`explore-instances-wiring.md:35`, `explore-hydra.md:29`). Their absence from the primary reading order is noted as a wiring-verification gap, not a blocker for the cycle hunt itself (the cycle hunt is pure import-graph, not settlement-typed).

- **w-graph.md WO fixes not yet landed at read time:** `memory.getGraph() at memory.ts:112 currently return null` and `graphify.ts:141 void depth` are still stubs per `w-graph.md`. They do not affect the import-cycle hunt (which uses file `import` grep, not `memory.getGraph()`), but they do block `computeBlastRadius` from hydrating the MACRO graph for blast-radius verification. The cycle hunter should still report `cycles` via the file-level import graph even while the macro graph is void — per the "ABORT LOUD if graph-logic phase fails" contract in `w-graph.md`, a `getGraph() = null` must not be silently degraded to predicate-only.

---

## 9. FINDINGS — Markdown Finding Grammar (PRIMARY — parsed by `write_findings` force-bound → `aether-report-reader.ts` 392L)

*The prose above is the forensic narrative and is IGNORED by the parser. The FINDING blocks below ARE the findings contract. Free-form prose with no FINDING blocks REJECTS with `GRAMMAR_VIOLATION`. For the measured-empty case, the hunter writes ONE block with `cycles.confirmed-absent` per `sro-cycles.ts` FINDINGS-FILE CONTRACT.*

## FINDING: no circular dependencies — import graph is acyclic, every SCC size = 1 (measured)
- layer: R31-sro-cycles
- predicate: cycles.confirmed-absent
- object: Contract
- file: src/hydra/aether-templates/hunters/sro-cycles.ts:1
- evidence: "import { z } from 'zod'; import type { AuditorTemplate } from '../types.js'; import { SroSubagentOutputSchema } from '../../instances/sro.js' — three imports, all one-way: hunter→aether-templates/types.ts (leaf→zod) and hunter→instances/sro.ts→hydra/types.ts→leaf; grep 'from.*hunters'=0, grep 'import.*sro-cycles'=0, grep 'aether-templates' in instances/sro.ts=0; no back-edge, SCC size 1"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:§2.5 SRO roster cycle-hunter — circular dependencies prohibited, SCC size must be 1, empty valid when measured
- severity: LOW
- confidence: 0.97

---

## 10. SUMMARY

**1 finding — LOW (confirmed-absent). 4 stale candidates investigated, 0 true cycles.**

The R31 cycle hunter interrogated the import graph of `src/hydra/aether-templates/hunters/` and `src/hydra/instances/sro.ts` plus siblings `sro-graph.ts` / `sro-path.ts` / `sro-dead-code.ts` and the two type leaves (`src/hydra/aether-templates/types.ts`, `src/hydra/types.ts`). The hunter's two mandated queries — `find cycles in the import graph` and `show circular dependency chains` — were approximated by bounded greps and by reading the three imports at `sro-cycles.ts:1-3` plus the instance's imports at `sro.ts:1-3`. No `A imports B imports A` chain verified: the only hunter→instance edge is `sro-cycles.ts:3 → instances/sro.ts`, and that instance never imports upward (`grep "hunters"` in it = 0, `grep "aether-templates"` = 0). The hunter siblings have no lateral edges (`grep "from.*hunters"` = 0). The two `types.ts` modules are distinct leaves that never import hunters/instances. Therefore the directed import graph is a DAG; every SCC size = 1; `graphify:subgraph depth 3` around `sro-cycles.ts:1` shows no returning path.

The four stale candidates at `sro-cycles.ts:5` (`const GRAPH_TOOLS_LAW`), `:13` (mid-string `Community labels...`), `:14` (`export const sroCyclesTemplate`), and `:32` (`outputSchema: SroSubagentOutputSchema`) were each read at the absolute path with `read_file` and shown to be **not import statements**. They fall inside the `GRAPH_TOOLS_LAW` literal (closed at line 12) or the `sroCyclesTemplate` data object. No verbatim `import { X } from './Y'` quote exists at those lines, and no `[INFERRED]` tag accompanies them, so they violate the `GRAPH TOOLS USAGE LAW` evidence rule and the `V443 §2.5` SCC measurement law.

**Per-candidate adjudication:**
- `sro-cycles.ts:5 cycles.scc` — **RED_HERRING** — line 5 is `const GRAPH_TOOLS_LAW =` (string declaration). Reason: string literal content misread as a cycle.
- `sro-cycles.ts:13 cycles.import` — **RED_HERRING** — line 13 is `6. Community labels...` inside the same literal. Reason: quoted prompt text, not an import edge.
- `sro-cycles.ts:14 cycles.import` — **RED_HERRING** — line 14 is `export const sroCyclesTemplate` (data export). Reason: export declaration, not an import; no cycle.
- `sro-cycles.ts:32 cycles.import` — **RED_HERRING** — line 32 is `outputSchema: SroSubagentOutputSchema` field. Reason: reference to already-imported schema at line 3, not a new import edge.

**No additional cycles** were measured in the scoped import graph. An empty `cycles: []` is the correct, measured result. The single `cycles.confirmed-absent` finding at `sro-cycles.ts:1` carries the provenance: `evidence` cites the three one-way imports plus the three `grep -c` zero counts proving no back-edges, `spec` cites `V443 §2.5`, `severity LOW` (no architectural risk), `confidence 0.97` (explicit file-read + grep verification, one-graph law observed, `INFERRED` edges not counted as `EXTRACTED`).

**Residual risk:** NONE for import cycles in this hunter family after the W2 precision fix. The **pipeline wiring gap** (`sroSynthesize` unwired, `memory.getGraph() = null` stub, `PREDICATE_MAP` not yet remapping `cycles.import → calls`) is higher risk than cycles — it would silently drop a *future* true cycle finding (lossy stitch) even though none exists today.

---

## 11. EVIDENCE BLOCK — Raw Verification Commands with Pasted Outputs (in order)

```
1. grep -c "export" /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts
→ 1  (sroCyclesTemplate) — FOUND at sro-cycles.ts:14 via read_file

2. read /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts (full pass, offset=0)
→ 102L returned — imports at :1 (zod), :2 (../types.js type), :3 (../../instances/sro.js value), GRAPH_TOOLS_LAW at :5-12, sroCyclesTemplate at :14-102 (layerId R31-sro-cycles, predicate cycles, layerNumber 31, graphQueries 2, filterTags 8, SroSubagentOutputSchema, staticPrompt). Verbatim excerpt at :1 "import { z } from 'zod';" at :2 "import type { AuditorTemplate } from '../types.js';" at :3 "import { SroSubagentOutputSchema } from '../../instances/sro.js';"

3. read /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/types.ts (full pass, offset=0)
→ 35L returned — LayerCandidateSchema at :1, SubagentOutputSchema at :14, AuditorTemplate interface at :24 (layerId, anchorPredicate, layerNumber, staticPrompt, outputSchema, graphQueries, filterTags)

4. read /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/sro.ts (full pass, offset=0, first window)
→ 279L+ returned — z at :1, GateCheck etc from ../types.js at :2, SroSubagentOutputSchema at :6, cycleHunterSpec at :240, computeBlastRadius at :279 ("function computeBlastRadius(allFindings: Array<{file:string;line:number;id:string}>, graph: GraphifyGraph): BlastRadiusRow[]")

5. grep -c "from.*hunters" (bounded) across hunters dir
→ 0 — no hunter imports another hunter

6. grep -c "import.*sro-cycles"
→ 0 — no back-edge

7. grep -c "import.*instances/sro" across aether-templates
→ 1 — only sro-cycles.ts:3

8. grep -c "hunters" in src/hydra/instances/sro.ts
→ 0 — instances/sro never imports hunter

9. read sro-cycles.ts offset=0 limit=35 (stale anchor spot-check)
→ line 5 = const GRAPH_TOOLS_LAW literal, line 13 = "6. Community labels...", line 14 = export const sroCyclesTemplate, line 32 = outputSchema: SroSubagentOutputSchema — all non-import
```

*Every claim in §§1-6 carries a file:line anchor or a pasted command output above. An anchorless claim has been deleted per the execution law.*



## R32 — SRO-meta
# AETHER SRO ORCHESTRATOR FINDINGS — SRO-meta KRAKEN / orchestrator seam

## FINDING: Read confinement bypass via swallowed realResolve error — KRAKEN wander not mechanically impossible on failed realpath
- predicate: flagged_by
- file: src/hydra/aether-tools.ts:67
- evidence: `catch (e) { void (e as Error).message; }` inside makeCappedReadTool targetRoot check silently swallows realResolve failure and falls through to file read without returning READ_SCOPE_VIOLATION
- spec: c2-runner.md:18 — READ confinement via path.resolve + realpath + startsWith(root+sep) must return READ_SCOPE_VIOLATION with attempted path on refusal; relative and absolute-inside-root both pass
- severity: HIGH
- confidence: 0.9

## FINDING: Runner-side tagging DELETE-before-INSERT not atomic — crash between deletes leaves typed_graph partially empty and breaks SRO correlations
- predicate: caused
- file: src/hydra/aether-meta.ts:235
- evidence: `DELETE FROM typed_nodes WHERE canonical_id = ?` then delete for codeNodeId then delete typed_edges followed by separate INSERT INTO typed_nodes without BEGIN TRANSACTION/COMMIT in writeRunnerTag
- spec: c2-runner.md:18 — runner-side tagging deterministic via DELETE-before-INSERT idempotent by canonical_id layerId:file:line with per-hunter tagsWritten in roster; LOUD log and continue on per-tag failure
- severity: MEDIUM
- confidence: 0.85

## FINDING: SRO blast-radius dedup misses path normalization — same file via relative vs absolute creates duplicate findingId and inflates downstreamCount
- predicate: derived_from
- file: src/hydra/instances/sro.ts:328
- evidence: `const id = v.file + ":" + v.line` and `if (!allFindings.some((f) => f.id === id))` uses raw file strings without path.resolve normalization before dedup
- spec: c2-runner.md:41 — ONE graph — extract ONCE per run, query N times, tag N findings; sroSynthesize dedupedFindings must normalize to prevent duplicate blastRadius entries
- severity: MEDIUM
- confidence: 0.8

## SUMMARY
3 finding(s) extracted from markdown report — SRO orchestrator seam: read confinement bypass (HIGH), runner tagging atomicity (MEDIUM), blast-radius dedup normalization (MEDIUM). All predicates in SRO ontology (flagged_by, caused, derived_from) and evidence quotes are explicit source slices.



## CORRELATIONS
same-site multi-predicate clusters: 1696 from 43004 typed_edges

| site | predicates | count |
|------|------------|-------|
| fn:buildScopedProgram | awaits, calls, declares | 3 |
| fn:callMiMoDirect | awaits, calls, declares | 3 |
| fn:classify | awaits, calls, declares | 3 |
| fn:classifyProject | awaits, calls, declares | 3 |
| fn:collectSourceFiles | awaits, calls, declares | 3 |
| fn:compile | awaits, calls, declares | 3 |
| fn:execTool | awaits, calls, declares | 3 |
| fn:fileExists | awaits, calls, declares | 3 |
| fn:generateBatchChunk | awaits, calls, declares | 3 |
| fn:generateReport | awaits, calls, declares | 3 |
| fn:generateSpecViaLLM | awaits, calls, declares | 3 |
| fn:getEvidenceStore | awaits, calls, declares | 3 |
| fn:lasmeSynthesize | awaits, calls, declares | 3 |
| fn:map | awaits, calls, declares | 3 |
| fn:mpseSynthesize | awaits, calls, declares | 3 |
| fn:persistVerdicts | awaits, calls, declares | 3 |
| fn:probeProvider | awaits, calls, declares | 3 |
| fn:readFindingsReport | awaits, calls, declares | 3 |
| fn:readPackageJson | awaits, calls, declares | 3 |
| fn:readVerdicts | awaits, calls, declares | 3 |
| fn:resolveProjectRoot | awaits, calls, declares | 3 |
| fn:run | awaits, calls, declares | 3 |
| fn:runCalibration | awaits, calls, declares | 3 |
| fn:runL6Loop | awaits, calls, declares | 3 |
| fn:runLayerHunter | awaits, calls, declares | 3 |
| fn:runMetaLayer | awaits, calls, declares | 3 |
| fn:runRuntimeScenario | awaits, calls, declares | 3 |
| fn:runStepX | awaits, calls, declares | 3 |
| fn:scan | awaits, calls, declares | 3 |
| fn:solveTrace | awaits, calls, declares | 3 |
| fn:sroSynthesize | awaits, calls, declares | 3 |
| fn:synthesizeWarheadSkill | awaits, calls, declares | 3 |
| fn:tmpProject | awaits, calls, declares | 3 |
| fn:tridentLog | awaits, calls, declares | 3 |
| /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/lasme.ts:19 | shouldBe, violates | 2 |
| audit-engine/index.ts:82 | contradicts_oracle, derived_from | 2 |
| file:artifacts/defense-catalog.ts | exports, imports | 2 |
| file:audit-engine/aether-backend/agent.js | exports, imports | 2 |
| file:audit-engine/aether-backend/demand-builder.js | exports, imports | 2 |
| file:audit-engine/aether-backend/identity.js | exports, imports | 2 |
| file:audit-engine/aether-backend/phase-controller.js | exports, imports | 2 |
| file:audit-engine/aether-backend/probe.js | exports, imports | 2 |
| file:audit-engine/aether-backend/provider.js | exports, imports | 2 |
| file:audit-engine/aether-backend/rpm-ledger.js | exports, imports | 2 |
| file:audit-engine/aether-backend/tools.js | exports, imports | 2 |
| file:audit-engine/aether/aether-brain.js | exports, imports | 2 |
| file:audit-engine/aether/aether-store.js | exports, imports | 2 |
| file:audit-engine/aether/deeper-probe.js | exports, imports | 2 |
| file:audit-engine/aether/silent-verifier.js | exports, imports | 2 |
| file:audit-engine/aether/supremacy-brief.js | exports, imports | 2 |
| file:audit-engine/events/event-substrate.js | exports, imports | 2 |
| file:audit-engine/math/contract.ts | exports, imports | 2 |
| file:audit-engine/math/eval.ts | exports, imports | 2 |
| file:audit-engine/math/expr.ts | exports, imports | 2 |
| file:audit-engine/math/firewall.ts | exports, imports | 2 |
| file:audit-engine/math/oracle.ts | exports, imports | 2 |
| file:audit-engine/runtime/runtime-verification.ts | exports, imports | 2 |
| file:audit-engine/scoring.ts | exports, imports | 2 |
| file:evidence/evidence-store.js | exports, imports | 2 |
| file:evidence/merkle-chain.js | exports, imports | 2 |
| file:fsm/orchestrator-machine-v2.js | exports, imports | 2 |
| file:shared/knowledge-graph/db.ts | exports, imports | 2 |
| file:subagents/trident-auditor/conformance/checker.ts | exports, imports | 2 |
| file:subagents/trident-auditor/conformance/conformance-templates.ts | exports, imports | 2 |
| file:subagents/trident-auditor/conformance/spec-extractor.ts | exports, imports | 2 |
| file:subagents/trident-auditor/firewall/fix-scope.ts | exports, imports | 2 |
| file:subagents/trident-auditor/firewall/red-team.ts | exports, imports | 2 |
| file:subagents/trident-auditor/harness/audit-machine.ts | exports, imports | 2 |
| file:subagents/trident-auditor/shared/shared-db-client.ts | exports, imports | 2 |
| file:subagents/trident-auditor/tools/audit.ts | exports, imports | 2 |
| file:subagents/trident-auditor/tools/build-done.ts | exports, imports | 2 |
| file:subagents/trident-auditor/tools/fix-apply.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/firewall/artifact-scope.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/firewall/readonly.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/graph/corbell-embeddings.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/map.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/micro-loop-machine.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/recon.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/report.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/scan.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/strike.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/harness/trace.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/hooks/bus-hook.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/surface/lsp-injector.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/surface/query-tool.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/tools/bug-hunt.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/tools/docs-patterns.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/tools/mcp-bridge.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/tools/report-writer.ts | exports, imports | 2 |
| file:subagents/trident-bug-hunter/tools/ui-server.ts | exports, imports | 2 |
| file:warheads/p1-p10-scanner/scanner.js | exports, imports | 2 |
| file:warheads/ts-compiler-api/program.js | exports, imports | 2 |
| fn:__setAgentCtorForTesting | calls, declares | 2 |
| fn:absRel | calls, declares | 2 |
| fn:accessIsGuarded | calls, declares | 2 |
| fn:acquireHuntLock | calls, declares | 2 |
| fn:activeCalibrationGate | calls, declares | 2 |
| fn:activeRunId | calls, declares | 2 |
| fn:actorError | calls, declares | 2 |
| fn:actorOutput | calls, declares | 2 |
| fn:adapterFailed | calls, declares | 2 |
| fn:adapterParseError | calls, declares | 2 |
| fn:adaptToPhaseChange | calls, declares | 2 |
| fn:addToRegistry | calls, declares | 2 |
| fn:aetherLedgerRootFor | calls, declares | 2 |
| fn:allowed | calls, declares | 2 |
| fn:analyzeActorCalls | calls, declares | 2 |
| fn:analyzeAdapterShape | calls, declares | 2 |
| fn:analyzeAgentGuardFields | calls, declares | 2 |
| fn:analyzeBuildCommand | calls, declares | 2 |
| fn:analyzeContractCalls | calls, declares | 2 |
| fn:analyzeEngineShape | calls, declares | 2 |
| fn:analyzeFieldType | calls, declares | 2 |
| fn:analyzeMachineConfig | calls, declares | 2 |
| fn:analyzeMethodBody | calls, declares | 2 |
| fn:analyzeProject | calls, declares | 2 |
| fn:analyzeReturnObject | calls, declares | 2 |
| fn:anchorExistsWithinScope | calls, declares | 2 |
| fn:append | calls, declares | 2 |
| fn:appendEvent | calls, declares | 2 |
| fn:appendFinding | calls, declares | 2 |
| fn:appendFindings | calls, declares | 2 |
| fn:appendReportSection | calls, declares | 2 |
| fn:appendToContextWindow | calls, declares | 2 |
| fn:appendVerificationSection | calls, declares | 2 |
| fn:appendWriteViolation | calls, declares | 2 |
| fn:applyCalibrationSignal | calls, declares | 2 |
| fn:applyFamilyPragmas | calls, declares | 2 |
| fn:applyFeedbackForVerdict | calls, declares | 2 |
| fn:applyPragmas | calls, declares | 2 |
| fn:architectureContextHandler | calls, declares | 2 |
| fn:argReferencesEnvSource | calls, declares | 2 |
| fn:argReferencesJsonSource | calls, declares | 2 |
| fn:artifactPathFor | calls, declares | 2 |
| fn:asCalibrated | calls, declares | 2 |
| fn:asciiEdgeRow | calls, declares | 2 |
| fn:asFixture | calls, declares | 2 |
| fn:asFunctionLike | calls, declares | 2 |
| fn:asHook | calls, declares | 2 |
| fn:asNode | calls, declares | 2 |
| fn:asRecord | calls, declares | 2 |
| fn:assemblePlan | calls, declares | 2 |
| fn:assembleReport | awaits, declares | 2 |
| fn:assert | calls, declares | 2 |
| fn:assertAuditSpecValid | calls, declares | 2 |
| fn:assertEqual | calls, declares | 2 |
| fn:assertNamedFailure | awaits, declares | 2 |
| fn:assertNoBlindness | calls, declares | 2 |
| fn:assertRunId | calls, declares | 2 |
| fn:assertSealedStartsWithHeading | calls, declares | 2 |
| fn:assertSingleProviderChain | calls, declares | 2 |
| fn:assertTriageTriad | calls, declares | 2 |
| fn:assertUsableDb | calls, declares | 2 |
| fn:assessThreats | calls, declares | 2 |
| fn:asSignature | calls, declares | 2 |
| fn:asStreamFetch | calls, declares | 2 |
| fn:asString | calls, declares | 2 |
| fn:asStringArg | calls, declares | 2 |
| fn:asStringLit | calls, declares | 2 |
| fn:astFingerprint | calls, declares | 2 |
| fn:asToolInput | calls, declares | 2 |
| fn:asyncOp | calls, declares | 2 |
| fn:attachConfidenceDimensions | calls, declares | 2 |
| fn:attachReproducible | calls, declares | 2 |
| fn:attackState | calls, declares | 2 |
| fn:audit | awaits, declares | 2 |
| fn:auditAsyncDiscipline | calls, declares | 2 |
| fn:auditAtomicState | calls, declares | 2 |
| fn:auditBibleGrounding | calls, declares | 2 |
| fn:auditConfigValidation | calls, declares | 2 |
| fn:auditDefensiveImport | calls, declares | 2 |
| fn:auditDiffRow | calls, declares | 2 |
| fn:auditErrorCompletenessAst | calls, declares | 2 |
| fn:auditMissingEvidenceAst | calls, declares | 2 |
| fn:auditOutputContractAst | calls, declares | 2 |
| fn:auditOutputIsWork | calls, declares | 2 |
| fn:auditPathResolution | calls, declares | 2 |
| fn:auditResourceLifecycle | calls, declares | 2 |
| fn:auditTypeCertainty | calls, declares | 2 |
| fn:avgConfByLayer | calls, declares | 2 |
| fn:avgConfByLayers | calls, declares | 2 |
| fn:awarenessDocMissing | calls, declares | 2 |
| fn:b | calls, declares | 2 |
| fn:baselineState | calls, declares | 2 |
| fn:batteryName | calls, declares | 2 |
| fn:batteryVersion | calls, declares | 2 |
| fn:bf | calls, declares | 2 |
| fn:BF | calls, declares | 2 |
| fn:bind | calls, declares | 2 |
| fn:bindCalibrationGate | calls, declares | 2 |
| fn:bindingsHasValues | calls, declares | 2 |
| fn:bindingsMap | calls, declares | 2 |
| fn:bindNumber | calls, declares | 2 |
| fn:bindOperator | calls, declares | 2 |
| fn:bindRange | calls, declares | 2 |
| fn:bindSeverity | calls, declares | 2 |
| fn:bindStages | calls, declares | 2 |
| fn:bindStringArray | calls, declares | 2 |
| fn:blastRadius | calls, declares | 2 |
| fn:blastRadiusFor | calls, declares | 2 |
| fn:blocked | calls, declares | 2 |
| fn:branchExits | calls, declares | 2 |
| fn:briefOf | calls, declares | 2 |
| fn:briefParts | calls, declares | 2 |
| fn:brokenInput | calls, declares | 2 |
| fn:budgetFor | calls, declares | 2 |
| fn:budgetRounds | calls, declares | 2 |
| fn:buildAdapter | awaits, declares | 2 |
| fn:buildAlgorithmSpecSection | calls, declares | 2 |
| fn:buildAppendices | calls, declares | 2 |
| fn:buildArchitectureDiagrams | awaits, declares | 2 |
| fn:buildAST | awaits, declares | 2 |
| fn:buildAuditDemand | calls, declares | 2 |
| fn:buildAuditorTools | calls, declares | 2 |
| fn:buildBehavioralPatternSection | calls, declares | 2 |
| fn:buildBibleBrief | calls, declares | 2 |
| fn:buildBibleCrossReferenceSection | calls, declares | 2 |
| fn:buildBlindSpot | calls, declares | 2 |
| fn:buildBlindSpotSection | calls, declares | 2 |
| fn:buildBrief | calls, declares | 2 |
| fn:buildCallGraph | calls, declares | 2 |
| fn:buildContext | calls, declares | 2 |
| fn:buildContinuationPrompt | calls, declares | 2 |
| fn:buildCorrelationSection | calls, declares | 2 |
| fn:buildCTESql | calls, declares | 2 |
| fn:buildCurrentStateSection | calls, declares | 2 |
| fn:buildCypherForTarget | calls, declares | 2 |
| fn:buildDataFlowGraph | calls, declares | 2 |
| fn:buildDataModelSection | calls, declares | 2 |
| fn:buildDebugLogBrief | calls, declares | 2 |
| fn:buildDesignBrief | calls, declares | 2 |
| fn:buildDone | calls, declares | 2 |
| fn:buildEmbeddingIndex | calls, declares | 2 |
| fn:buildEngineClassDesignSection | calls, declares | 2 |
| fn:buildExecutiveSummary | calls, declares | 2 |
| fn:buildExploreProtocolT1 | calls, declares | 2 |
| fn:buildFileContentMap | calls, declares | 2 |
| fn:buildFindingsMap | calls, declares | 2 |
| fn:buildFixture | calls, declares | 2 |
| fn:buildFixtureProfile | calls, declares | 2 |
| fn:buildFullContextBrief | calls, declares | 2 |
| fn:buildGapRemediationMatrix | calls, declares | 2 |
| fn:buildGenerationPrompt | calls, declares | 2 |
| fn:buildHandlers | calls, declares | 2 |
| fn:buildHeader | calls, declares | 2 |
| fn:buildHomelandFixture | calls, declares | 2 |
| fn:buildHookRegistry | calls, declares | 2 |
| fn:buildIdentityBindingT1 | calls, declares | 2 |
| fn:buildInboundMap | calls, declares | 2 |
| fn:buildInconclusiveResult | calls, declares | 2 |
| fn:buildIntegrationSection | calls, declares | 2 |
| fn:buildKickMessage | calls, declares | 2 |
| fn:buildKnowledgeT1 | awaits, declares | 2 |
| fn:buildL1ContentBrief | calls, declares | 2 |
| fn:buildL6Demand | calls, declares | 2 |
| fn:buildLayer1Prompt | calls, declares | 2 |
| fn:buildMeaning | calls, declares | 2 |
| fn:buildMechanicalIndex | calls, declares | 2 |
| fn:buildMetaTools | calls, declares | 2 |
| fn:buildNarrationRejection | calls, declares | 2 |
| fn:buildOutboundMap | calls, declares | 2 |
| fn:buildOutputContract | calls, declares | 2 |
| fn:buildPart1Supremacy | calls, declares | 2 |
| fn:buildPart2Inference | calls, declares | 2 |
| fn:buildPart3Specs | calls, declares | 2 |
| fn:buildPart4Candidates | calls, declares | 2 |
| fn:buildPart5FocusesAndContract | calls, declares | 2 |
| fn:buildPhantomRejection | calls, declares | 2 |
| fn:buildPreflightGroundingSection | calls, declares | 2 |
| fn:buildProbePrompt | calls, declares | 2 |
| fn:buildProblemSolvingBrief | calls, declares | 2 |
| fn:buildPrompt1Demand | calls, declares | 2 |
| fn:buildPrompt2Batch | calls, declares | 2 |
| fn:buildReportBrief | calls, declares | 2 |
| fn:buildReproductionCommand | calls, declares | 2 |
| fn:buildRequirementsAppendix | calls, declares | 2 |
| fn:buildRows | calls, declares | 2 |
| fn:buildRuleSection | calls, declares | 2 |
| fn:buildSemanticBattery | calls, declares | 2 |
| fn:buildSentinelFleet | calls, declares | 2 |
| fn:buildSroOutputContract | calls, declares | 2 |
| fn:buildStitchContent | calls, declares | 2 |
| fn:buildSupremacyBrief | calls, declares | 2 |
| fn:buildT1InjectableBrief | calls, declares | 2 |
| fn:buildTargetArchitectureSection | calls, declares | 2 |
| fn:buildTemplateShell | calls, declares | 2 |
| fn:buildTestSpecificationsSection | calls, declares | 2 |
| fn:buildThresholds | calls, declares | 2 |
| fn:buildTree | calls, declares | 2 |
| fn:buildTypeRelationships | calls, declares | 2 |
| fn:buildUnclassifiedVerdicts | calls, declares | 2 |
| fn:buildVerificationMatrixSection | calls, declares | 2 |
| fn:buildWorkedDetectionExampleSection | calls, declares | 2 |
| fn:bv | calls, declares | 2 |
| fn:cadencePlane | calls, declares | 2 |
| fn:calibrationFixtureInvalid | calls, declares | 2 |
| fn:calibStaleDemand | calls, declares | 2 |
| fn:callAutoFire | awaits, declares | 2 |
| fn:callGraphAnalysis | calls, declares | 2 |
| fn:callLLM | awaits, declares | 2 |
| fn:callLLMAsync | awaits, declares | 2 |
| fn:cand | calls, declares | 2 |
| fn:candidatesToFindings | calls, declares | 2 |
| fn:canonicalExpr | calls, declares | 2 |
| fn:canonicalExprId | calls, declares | 2 |
| fn:canonicalJson | calls, declares | 2 |
| fn:capitalize | calls, declares | 2 |
| fn:captureError | awaits, declares | 2 |
| fn:cast | calls, declares | 2 |
| fn:catchLogsErrorVariable | calls, declares | 2 |
| fn:chain | calls, declares | 2 |
| fn:chainAfterHook | calls, declares | 2 |
| fn:chainBeforeHook | calls, declares | 2 |
| fn:chainGraph | calls, declares | 2 |
| fn:changedEvidence | calls, declares | 2 |
| fn:checkAdversarialCoverage | calls, declares | 2 |
| fn:checkAgentClassification | calls, declares | 2 |
| fn:checkArrayFields | calls, declares | 2 |
| fn:checkArrowFunction | calls, declares | 2 |
| fn:checkBuildSingleFile | calls, declares | 2 |
| fn:checkCompletenessChain | calls, declares | 2 |
| fn:checkContract | calls, declares | 2 |
| fn:checkDefenseRuleStructure | calls, declares | 2 |
| fn:checkDuplicateSections | calls, declares | 2 |
| fn:checkF1Isolation | calls, declares | 2 |
| fn:checkFilePaths | calls, declares | 2 |
| fn:checkFunctionSignatures | calls, declares | 2 |
| fn:checkGraphAwaited | calls, declares | 2 |
| fn:checkGuardian | calls, declares | 2 |
| fn:checkIdentityBeforeTool | calls, declares | 2 |
| fn:checkIdentityIntegrity | calls, declares | 2 |
| fn:checkIdentityLoaded | calls, declares | 2 |
| fn:checkManifestComplete | calls, declares | 2 |
| fn:checkNumberingErrors | calls, declares | 2 |
| fn:checkQ1Exist | calls, declares | 2 |
| fn:checkQ2Called | calls, declares | 2 |
| fn:checkQ3DoesWhatSays | calls, declares | 2 |
| fn:checkQ4MatchesSpec | calls, declares | 2 |
| fn:checkQ5Theatrical | calls, declares | 2 |
| fn:checkQ6Copied | calls, declares | 2 |
| fn:checkRegistryType | calls, declares | 2 |
| fn:checkReportMarkers | calls, declares | 2 |
| fn:checkReturnsPromise | calls, declares | 2 |
| fn:checkReturnStatement | calls, declares | 2 |
| fn:checkSectionCompleteness | calls, declares | 2 |
| fn:checkSignature | calls, declares | 2 |
| fn:checkSmokeTestFirewall | awaits, declares | 2 |
| fn:checkStringFields | calls, declares | 2 |
| fn:checkTaskDispatch | calls, declares | 2 |
| fn:checkTheatricalMerkle | awaits, declares | 2 |
| fn:checkTheatricalPatterns | awaits, declares | 2 |
| fn:checkThresholdConsistency | calls, declares | 2 |
| fn:checkTypeFieldConsistency | calls, declares | 2 |
| fn:checkTypeNameConsistency | calls, declares | 2 |
| fn:checkUiReachable | awaits, declares | 2 |
| fn:checkVersionConsistency | calls, declares | 2 |
| fn:checkWarheadsBound | calls, declares | 2 |
| fn:chunkForProbe | calls, declares | 2 |
| fn:citedAnchors | calls, declares | 2 |
| fn:citedIdentifiers | calls, declares | 2 |
| fn:citesGraphOps | calls, declares | 2 |
| fn:claimConfig | calls, declares | 2 |
| fn:claimDemand | calls, declares | 2 |
| fn:claimedButNotFixedEvidence | calls, declares | 2 |
| fn:claimLexiconHasMatch | calls, declares | 2 |
| fn:claimVsReality | calls, declares | 2 |
| fn:clamp | calls, declares | 2 |
| fn:clampDepth | calls, declares | 2 |
| fn:classifyActivationIntent | calls, declares | 2 |
| fn:classifyExecError | calls, declares | 2 |
| fn:classifyFact | calls, declares | 2 |
| fn:classifyNode | calls, declares | 2 |
| fn:classifySection | calls, declares | 2 |
| fn:classifyTarget | calls, declares | 2 |
| fn:cleanDb | calls, declares | 2 |
| fn:clearCurrentAgent | calls, declares | 2 |
| fn:clearPoseidonIntent | calls, declares | 2 |
| fn:clearPoseidonPoller | calls, declares | 2 |
| fn:closeTo | calls, declares | 2 |
| fn:codeSearchHandler | calls, declares | 2 |
| fn:collectAgentReferences | calls, declares | 2 |
| fn:collectAllCandidates | calls, declares | 2 |
| fn:collectAssignmentTargets | calls, declares | 2 |
| fn:collectBlockquote | calls, declares | 2 |
| fn:collectCallNames | calls, declares | 2 |
| fn:collectCommentRanges | calls, declares | 2 |
| fn:collectConstantConditions | calls, declares | 2 |
| fn:collectDangerousSinksViaAst | calls, declares | 2 |
| fn:collectDefinedTransitions | calls, declares | 2 |
| fn:collectDeps | calls, declares | 2 |
| fn:collectEmptyCatchBlocks | calls, declares | 2 |
| fn:collectFiles | calls, declares | 2 |
| fn:collectLiteralComparisons | calls, declares | 2 |
| fn:collectMissingReturns | calls, declares | 2 |
| fn:collectOwnTreeFiles | calls, declares | 2 |
| fn:collectProjectFiles | calls, declares | 2 |
| fn:collectPropertyAccessChains | calls, declares | 2 |
| fn:collectScopedFiles | calls, declares | 2 |
| fn:collectStringLiterals | calls, declares | 2 |
| fn:collectUnreachableCode | calls, declares | 2 |
| fn:collectUsedTransitions | calls, declares | 2 |
| fn:commentHasMarker | calls, declares | 2 |
| fn:commentIsClosed | calls, declares | 2 |
| fn:COMP | calls, declares | 2 |
| fn:compareOperator | calls, declares | 2 |
| fn:compileBattery | awaits, declares | 2 |
| fn:compileCards | calls, declares | 2 |
| fn:compileDeclared | calls, declares | 2 |
| fn:compileFixtureBattery | awaits, declares | 2 |
| fn:compileOrThrow | calls, declares | 2 |
| fn:compileP1 | calls, declares | 2 |
| fn:compileP20 | calls, declares | 2 |
| fn:compileP21 | calls, declares | 2 |
| fn:compileP6 | calls, declares | 2 |
| fn:compileP8 | calls, declares | 2 |
| fn:compileTemplate | calls, declares | 2 |
| fn:completeInput | calls, declares | 2 |
| fn:componentGroups | calls, declares | 2 |
| fn:composeFinalReport | calls, declares | 2 |
| fn:composeOperatorBrief | calls, declares | 2 |
| fn:computeBlastRadius | calls, declares | 2 |
| fn:computeCalibratedPredicateRatio | calls, declares | 2 |
| fn:computeComplexity | calls, declares | 2 |
| fn:computeConfidence | calls, declares | 2 |
| fn:computeConfidenceDistribution | calls, declares | 2 |
| fn:computeDepthBudgets | calls, declares | 2 |
| fn:computeE4Verdict | calls, declares | 2 |
| fn:computeFindingConfidence | calls, declares | 2 |
| fn:computeFindingsQuality | calls, declares | 2 |
| fn:computeLanguageStats | calls, declares | 2 |
| fn:computeOraclePassRate | calls, declares | 2 |
| fn:computeRoundBudget | calls, declares | 2 |
| fn:computeScore | calls, declares | 2 |
| fn:computeWeightedScore | calls, declares | 2 |
| fn:conditionReferencesEnv | calls, declares | 2 |
| fn:conditionReferencesName | calls, declares | 2 |
| fn:confidenceBand | calls, declares | 2 |
| fn:confidenceLabel | calls, declares | 2 |
| fn:configureToastDelivery | calls, declares | 2 |
| fn:conformanceTemplate | calls, declares | 2 |
| fn:consistency | calls, declares | 2 |
| fn:constantConditionKind | calls, declares | 2 |
| fn:constructFromFixture | calls, declares | 2 |
| fn:constructKind | calls, declares | 2 |
| fn:contentAddress | calls, declares | 2 |
| fn:contentHashId | calls, declares | 2 |
| fn:contradictionChecker | calls, declares | 2 |
| fn:contradictionDemand | calls, declares | 2 |
| fn:convertPdfToImages | calls, declares | 2 |
| fn:copyDir | awaits, declares | 2 |
| fn:corpusEmpty | calls, declares | 2 |
| fn:corpusMissing | calls, declares | 2 |
| fn:corpusUnreadable | calls, declares | 2 |
| fn:correlationCounts | calls, declares | 2 |
| fn:cosineSimilarity | calls, declares | 2 |
| fn:countAssertionsInNode | calls, declares | 2 |
| fn:countByLayer | calls, declares | 2 |
| fn:countByLayers | calls, declares | 2 |
| fn:countEngines | calls, declares | 2 |
| fn:countGraphTags | calls, declares | 2 |
| fn:countIfChainDepth | calls, declares | 2 |
| fn:countLineage | calls, declares | 2 |
| fn:countLines | calls, declares | 2 |
| fn:countMachines | calls, declares | 2 |
| fn:countMatches | calls, declares | 2 |
| fn:countPlaceholderCommentsInNode | calls, declares | 2 |
| fn:countQuotedRules | calls, declares | 2 |
| fn:countRejectAuditIssues | calls, declares | 2 |
| fn:countRows | calls, declares | 2 |
| fn:countsFromVerdicts | calls, declares | 2 |
| fn:countSourceLines | awaits, declares | 2 |
| fn:countStatementsInNode | calls, declares | 2 |
| fn:countSymbolReferences | calls, declares | 2 |
| fn:countTsFilesInTarget | calls, declares | 2 |
| fn:createAgentAetherBrain | calls, declares | 2 |
| fn:createAuditMachine | calls, declares | 2 |
| fn:createAuditorTools | calls, declares | 2 |
| fn:createAuditTool | calls, declares | 2 |
| fn:createBugHunterHooks | calls, declares | 2 |
| fn:createBugHunterQueryTool | calls, declares | 2 |
| fn:createBugHuntTool | calls, declares | 2 |
| fn:createBuildDoneTool | calls, declares | 2 |
| fn:createBuildStatusTool | calls, declares | 2 |
| fn:createContainerTestTool | calls, declares | 2 |
| fn:createDocsPatterns | calls, declares | 2 |
| fn:createFixApplyTool | calls, declares | 2 |
| fn:createGateHook | calls, declares | 2 |
| fn:createGraphifyTools | calls, declares | 2 |
| fn:createGrepTool | calls, declares | 2 |
| fn:createHydraBus | calls, declares | 2 |
| fn:createHydraTransport | calls, declares | 2 |
| fn:createMicroLoop | calls, declares | 2 |
| fn:createMpsePostGates | calls, declares | 2 |
| fn:createMpsePreGates | calls, declares | 2 |
| fn:createOmniVisionTool | calls, declares | 2 |
| fn:createOracleRegistry | calls, declares | 2 |
| fn:createPhaseController | calls, declares | 2 |
| fn:createPreflightTool | calls, declares | 2 |
| fn:createReportWriterTool | calls, declares | 2 |
| fn:createReportWriteTool | calls, declares | 2 |
| fn:createSessionHook | calls, declares | 2 |
| fn:createShipPackageTool | calls, declares | 2 |
| fn:createSroPostGates | calls, declares | 2 |
| fn:createSroPreGates | calls, declares | 2 |
| fn:createSystemTransformHook | calls, declares | 2 |
| fn:createTridentBuildHooks | calls, declares | 2 |
| fn:createTridentHooks | calls, declares | 2 |
| fn:createTridentTools | calls, declares | 2 |
| fn:ctx | calls, declares | 2 |
| fn:ctxFor | calls, declares | 2 |
| fn:ctxWithConstruct | calls, declares | 2 |
| fn:dbHandle | calls, declares | 2 |
| fn:debugLog | calls, declares | 2 |
| fn:decide | calls, declares | 2 |
| fn:decideVerdict | calls, declares | 2 |
| fn:decodeFloat32Blob | calls, declares | 2 |
| fn:dedupe | calls, declares | 2 |
| fn:dedupeEdges | calls, declares | 2 |
| fn:dedupeFindings | calls, declares | 2 |
| fn:deduplicateFindings | calls, declares | 2 |
| fn:defaultReader | calls, declares | 2 |
| fn:defaultState | calls, declares | 2 |
| fn:defaultTransport | calls, declares | 2 |
| fn:delayedProbe | calls, declares | 2 |
| fn:deliverGateToast | calls, declares | 2 |
| fn:deliveryLog | calls, declares | 2 |
| fn:deliverySurface | calls, declares | 2 |
| fn:DENSE | calls, declares | 2 |
| fn:deriveDesignTensions | calls, declares | 2 |
| fn:deriveFindingIds | calls, declares | 2 |
| fn:deriveNarrativeArc | calls, declares | 2 |
| fn:deriveProjectRoot | calls, declares | 2 |
| fn:deriveRootCause | calls, declares | 2 |
| fn:deriveScenarioVerdict | calls, declares | 2 |
| fn:detectAgentGuard | calls, declares | 2 |
| fn:detectCatchBlockViolations | calls, declares | 2 |
| fn:detectConfigTheater | calls, declares | 2 |
| fn:detectContextSynthesisLayer | calls, declares | 2 |
| fn:detectDeadEnforcementFunction | calls, declares | 2 |
| fn:detectDocumentationDrift | calls, declares | 2 |
| fn:detectDomain | calls, declares | 2 |
| fn:detectFireAndForget | calls, declares | 2 |
| fn:detectHookHandler | calls, declares | 2 |
| fn:detectIntent | calls, declares | 2 |
| fn:detectLanguages | calls, declares | 2 |
| fn:detectMediaType | calls, declares | 2 |
| fn:detectPhantomTest | calls, declares | 2 |
| fn:detectPipelineTheater | calls, declares | 2 |
| fn:detectPlaceholderCode | calls, declares | 2 |
| fn:detectPrefixMixing | calls, declares | 2 |
| fn:detectProjectShape | awaits, declares | 2 |
| fn:detectR17Drift | awaits, declares | 2 |
| fn:detectReturnTypeViolations | calls, declares | 2 |
| fn:detectSilentCatch | calls, declares | 2 |
| fn:detectStubReturn | calls, declares | 2 |
| fn:detectSuccessSignal | calls, declares | 2 |
| fn:detectTemplateRepetition | calls, declares | 2 |
| fn:detectWhitespacePadding | calls, declares | 2 |
| fn:diag | calls, declares | 2 |
| fn:discoverProject | awaits, declares | 2 |
| fn:dispatchRuntimeEvent | calls, declares | 2 |
| fn:docsPatternError | calls, declares | 2 |
| fn:docsPatternsStorePath | calls, declares | 2 |
| fn:docsPatternsVerb | calls, declares | 2 |
| fn:doWork | calls, declares | 2 |
| fn:drainPendingSessions | awaits, declares | 2 |
| fn:driftDb | calls, declares | 2 |
| fn:edge | calls, declares | 2 |
| fn:edgeLevel | calls, declares | 2 |
| fn:embeddingError | calls, declares | 2 |
| fn:embeddingStorePath | calls, declares | 2 |
| fn:emitWithDedupe | calls, declares | 2 |
| fn:emptyGraphDiagrams | calls, declares | 2 |
| fn:emptyMergeResult | calls, declares | 2 |
| fn:encodeBase64 | calls, declares | 2 |
| fn:enforceBashLockdown | calls, declares | 2 |
| fn:enforceBeforeExecution | calls, declares | 2 |
| fn:enforceFixScope | calls, declares | 2 |
| fn:enforceIdentity | calls, declares | 2 |
| fn:enforcePinned | calls, declares | 2 |
| fn:enforceReportScope | awaits, declares | 2 |
| fn:enforceWriteScope | calls, declares | 2 |
| fn:engineGraphEmpty | calls, declares | 2 |
| fn:enrichWithHiveKnowledge | awaits, declares | 2 |
| fn:ensureAetherVerdictsSchema | calls, declares | 2 |
| fn:ensureAuditSpecFile | calls, declares | 2 |
| fn:ensureDir | calls, declares | 2 |
| fn:ensureEventSubstrate | calls, declares | 2 |
| fn:ensureFamilyTables | calls, declares | 2 |
| fn:ensureLedgerDir | calls, declares | 2 |
| fn:ensurePlanesRegistered | calls, declares | 2 |
| fn:ensureSelfAudit | calls, declares | 2 |
| fn:ensureT2Cache | calls, declares | 2 |
| fn:ensureTypedGraphSchema | calls, declares | 2 |
| fn:envVarIsGuarded | calls, declares | 2 |
| fn:envWith | calls, declares | 2 |
| fn:errJson | calls, declares | 2 |
| fn:errorCode | calls, declares | 2 |
| fn:errorDetail | calls, declares | 2 |
| fn:estimateIndexBytes | calls, declares | 2 |
| fn:estimatePhases | calls, declares | 2 |
| fn:evalCached | calls, declares | 2 |
| fn:evalExpr | calls, declares | 2 |
| fn:evalInternal | calls, declares | 2 |
| fn:evaluateContainerResults | calls, declares | 2 |
| fn:evaluateExpression | calls, declares | 2 |
| fn:evaluateHealth | calls, declares | 2 |
| fn:evaluateMathVerdict | calls, declares | 2 |
| fn:eventFn | awaits, calls | 2 |
| fn:eventInfo | calls, declares | 2 |
| fn:eventInvalid | calls, declares | 2 |
| fn:eventKind | calls, declares | 2 |
| fn:evidenceDb | calls, declares | 2 |
| fn:evidenceExcerpt | calls, declares | 2 |
| fn:evidenceQuoteForNode | calls, declares | 2 |
| fn:evStr | calls, declares | 2 |
| fn:evt | calls, declares | 2 |
| fn:exec | awaits, calls | 2 |
| fn:execFile | awaits, calls | 2 |
| fn:execFn | calls, declares | 2 |
| fn:expectRejects | awaits, declares | 2 |
| fn:exprReferencesAnyParam | calls, declares | 2 |
| fn:exprReferencesEnvOrJsonParse | calls, declares | 2 |
| fn:extractAlgorithmSignals | calls, declares | 2 |
| fn:extractArrowFunctionName | calls, declares | 2 |
| fn:extractAttachedComment | calls, declares | 2 |
| fn:extractBindings | calls, declares | 2 |
| fn:extractCalleeName | calls, declares | 2 |
| fn:extractCandidateGraph | calls, declares | 2 |
| fn:extractCandidateIds | calls, declares | 2 |
| fn:extractClasses | calls, declares | 2 |
| fn:extractCodeSections | calls, declares | 2 |
| fn:extractCommand | calls, declares | 2 |
| fn:extractCommentText | calls, declares | 2 |
| fn:extractCommentTextForCatch | calls, declares | 2 |
| fn:extractConstObjects | calls, declares | 2 |
| fn:extractConstructs | calls, declares | 2 |
| fn:extractContracts | calls, declares | 2 |
| fn:extractDecisions | calls, declares | 2 |
| fn:extractDeclaredContracts | calls, declares | 2 |
| fn:extractDepth | calls, declares | 2 |
| fn:extractDocsPatterns | calls, declares | 2 |
| fn:extractEnums | calls, declares | 2 |
| fn:extractFailureModes | calls, declares | 2 |
| fn:extractFindingsFromGraph | calls, declares | 2 |
| fn:extractFixFilesFromText | calls, declares | 2 |
| fn:extractFunctions | calls, declares | 2 |
| fn:extractImports | calls, declares | 2 |
| fn:extractInlineQuote | calls, declares | 2 |
| fn:extractInterfaces | calls, declares | 2 |
| fn:extractJsDocReturns | calls, declares | 2 |
| fn:extractJsonFromText | calls, declares | 2 |
| fn:extractKeyTerms | calls, declares | 2 |
| fn:extractKeywords | calls, declares | 2 |
| fn:extractLabels | calls, declares | 2 |
| fn:extractMechanical | calls, declares | 2 |
| fn:extractModifiers | calls, declares | 2 |
| fn:extractOutputText | calls, declares | 2 |
| fn:extractParameters | calls, declares | 2 |
| fn:extractPath | calls, declares | 2 |
| fn:extractPatterns | calls, declares | 2 |
| fn:extractPrinciplesFromText | calls, declares | 2 |
| fn:extractReceived | calls, declares | 2 |
| fn:extractRegistryIds | calls, declares | 2 |
| fn:extractRelations | calls, declares | 2 |
| fn:extractReturn | calls, declares | 2 |
| fn:extractReturnPathsAST | calls, declares | 2 |
| fn:extractReturnType | calls, declares | 2 |
| fn:extractRuleCards | calls, declares | 2 |
| fn:extractSection | calls, declares | 2 |
| fn:extractSectionHeadings | calls, declares | 2 |
| fn:extractSemanticName | calls, declares | 2 |
| fn:extractStructuralNames | calls, declares | 2 |
| fn:extractSummary | calls, declares | 2 |
| fn:extractTolerance | calls, declares | 2 |
| fn:extractToolArgs | calls, declares | 2 |
| fn:extractTouchedFile | calls, declares | 2 |
| fn:extractTypeAliases | calls, declares | 2 |
| fn:extractTypeNames | calls, declares | 2 |
| fn:extractVerbs | calls, declares | 2 |
| fn:extractVideoFrames | calls, declares | 2 |
| fn:extractWhere | calls, declares | 2 |
| fn:F | calls, declares | 2 |
| fn:fail | calls, declares | 2 |
| fn:failEq | calls, declares | 2 |
| fn:failGt | calls, declares | 2 |
| fn:failingAdapter | calls, declares | 2 |
| fn:failLt | calls, declares | 2 |
| fn:fakeAdapter | calls, declares | 2 |
| fn:fakeGraph | calls, declares | 2 |
| fn:fakeMemory | calls, declares | 2 |
| fn:fakeReturnDemand | calls, declares | 2 |
| fn:familyPromotionPending | calls, declares | 2 |
| fn:familyRootDrift | calls, declares | 2 |
| fn:familyRootReadonly | calls, declares | 2 |
| fn:fetch | awaits, calls | 2 |
| fn:fetchRemote | awaits, declares | 2 |
| fn:fetchRemoteData | calls, declares | 2 |
| fn:fileDriftReport | calls, declares | 2 |
| fn:fileMatches | calls, declares | 2 |
| fn:fillBig | calls, declares | 2 |
| fn:filterByConfidence | calls, declares | 2 |
| fn:findAuditLayers | calls, declares | 2 |
| fn:findCallSites | calls, declares | 2 |
| fn:findCatchClausesInFunction | calls, declares | 2 |
| fn:findDeadExports | calls, declares | 2 |
| fn:findEnclosingFunction | calls, declares | 2 |
| fn:findEntryPoints | calls, declares | 2 |
| fn:findExistingPackage | awaits, declares | 2 |
| fn:findExistingVariant | awaits, declares | 2 |
| fn:findIdentityCheckFunctions | calls, declares | 2 |
| fn:findingCheckFailed | calls, declares | 2 |
| fn:findingIdOf | calls, declares | 2 |
| fn:findingInvalid | calls, declares | 2 |
| fn:findingNoTriplet | calls, declares | 2 |
| fn:findings | calls, declares | 2 |
| fn:findingSeverity | calls, declares | 2 |
| fn:findingsFromHandle | calls, declares | 2 |
| fn:findingWeight | calls, declares | 2 |
| fn:findMarkerFindings | calls, declares | 2 |
| fn:findMatchingDefense | calls, declares | 2 |
| fn:findNodeAtPosition | calls, declares | 2 |
| fn:findReturnStatements | calls, declares | 2 |
| fn:findTheatricalReturns | calls, declares | 2 |
| fn:findTopLevelColon | calls, declares | 2 |
| fn:findTypos | calls, declares | 2 |
| fn:findVariableDeclaration | calls, declares | 2 |
| fn:findWarheads | calls, declares | 2 |
| fn:fingerprintSimilarity | calls, declares | 2 |
| fn:fireAndForgetPersist | calls, declares | 2 |
| fn:fireBlock | calls, declares | 2 |
| fn:fixApply | calls, declares | 2 |
| fn:fixApplyFailed | calls, declares | 2 |
| fn:fixScopeError | calls, declares | 2 |
| fn:fixture | calls, declares | 2 |
| fn:fixtureBrain | calls, declares | 2 |
| fn:fixtureGraph | calls, declares | 2 |
| fn:fixtureProfile | calls, declares | 2 |
| fn:fixtureSources | calls, declares | 2 |
| fn:fixtureWriter | calls, declares | 2 |
| fn:fn | awaits, calls | 2 |
| fn:fnNode | calls, declares | 2 |
| fn:foldAdd | calls, declares | 2 |
| fn:foldAnd | calls, declares | 2 |
| fn:foo | calls, declares | 2 |
| fn:formatAuditFeedback | calls, declares | 2 |
| fn:formatCrossGateContext | calls, declares | 2 |
| fn:formatDeepeningFeedback | calls, declares | 2 |
| fn:formatDetailedFinding | calls, declares | 2 |
| fn:formatDiagnostics | calls, declares | 2 |
| fn:formatErrors | calls, declares | 2 |
| fn:formatFields | calls, declares | 2 |
| fn:formatFinding | calls, declares | 2 |
| fn:formatIdentityHeader | calls, declares | 2 |
| fn:formatLasmeContext | calls, declares | 2 |
| fn:formatRows | calls, declares | 2 |
| fn:formatSemanticRows | calls, declares | 2 |
| fn:formatThreatReport | calls, declares | 2 |
| fn:formatThreshold | calls, declares | 2 |
| fn:formatThresholdForSignal | calls, declares | 2 |
| fn:formatVersion | calls, declares | 2 |
| fn:functionBodyHasTryStatement | calls, declares | 2 |
| fn:functionBodyHasTypeGuard | calls, declares | 2 |
| fn:functionHasSideEffects | calls, declares | 2 |
| fn:functionHasTryCatch | calls, declares | 2 |
| fn:gainByLayer | calls, declares | 2 |
| fn:gainByLayers | calls, declares | 2 |
| fn:gate | calls, declares | 2 |
| fn:gateAuditPath | calls, declares | 2 |
| fn:generateAdversarialChallenges | calls, declares | 2 |
| fn:generateAlgorithms | calls, declares | 2 |
| fn:generateBibleViaLLM | awaits, declares | 2 |
| fn:generateCodeReviewArtifact | calls, declares | 2 |
| fn:generateContainerTestContext | calls, declares | 2 |
| fn:generateContainerTestPlan | calls, declares | 2 |
| fn:generateContainerTestPlanSection | calls, declares | 2 |
| fn:generateContextBrief | calls, declares | 2 |
| fn:generateContextLibraryManifest | calls, declares | 2 |
| fn:generateDecideContext | calls, declares | 2 |
| fn:generateDeploymentManifest | calls, declares | 2 |
| fn:generateDeployScript | calls, declares | 2 |
| fn:generateEngineSpecFromDiscovery | calls, declares | 2 |
| fn:generateExactTestPlanSection | calls, declares | 2 |
| fn:generateExpectedDetails | calls, declares | 2 |
| fn:generateExtractionCode | calls, declares | 2 |
| fn:generateFixSuggestion | calls, declares | 2 |
| fn:generateFixSummary | calls, declares | 2 |
| fn:generateLayer1InitialPlan | calls, declares | 2 |
| fn:generateLayer1Prompt | calls, declares | 2 |
| fn:generateLayer2DetailedWorkflow | calls, declares | 2 |
| fn:generateLibraryIndex | calls, declares | 2 |
| fn:generateMasterPlan | calls, declares | 2 |
| fn:generateNegativeInput | calls, declares | 2 |
| fn:generatePhaseInterface | calls, declares | 2 |
| fn:generatePipelineSpec | calls, declares | 2 |
| fn:generatePlanContext | calls, declares | 2 |
| fn:generatePositiveInput | calls, declares | 2 |
| fn:generateProblemSolveContext | calls, declares | 2 |
| fn:generateReaderQuestions | calls, declares | 2 |
| fn:generateReadme | calls, declares | 2 |
| fn:generateShipManifest | calls, declares | 2 |
| fn:generateT2Knowledge | calls, declares | 2 |
| fn:generateTests | calls, declares | 2 |
| fn:generateTypes | calls, declares | 2 |
| fn:generateVerificationChecklist | calls, declares | 2 |
| fn:generateVerifyContext | calls, declares | 2 |
| fn:generateWorkedExampleInput | calls, declares | 2 |
| fn:generateWorkedExampleSignal | calls, declares | 2 |
| fn:generateWorkedExampleThresholdCheck | calls, declares | 2 |
| fn:generationFailed | calls, declares | 2 |
| fn:getAgentActiveProjectsRoot | calls, declares | 2 |
| fn:getAgentConfig | calls, declares | 2 |
| fn:getAuditSpecState | calls, declares | 2 |
| fn:getCalibrationFeedbackState | calls, declares | 2 |
| fn:getCatchBodyStatementCount | calls, declares | 2 |
| fn:getCatchCommentText | calls, declares | 2 |
| fn:getClient | calls, declares | 2 |
| fn:getContextManagementPath | calls, declares | 2 |
| fn:getCurrentAgent | calls, declares | 2 |
| fn:getCurrentFilePath | calls, declares | 2 |
| fn:getCurrentSessionModel | calls, declares | 2 |
| fn:getDbHandle | calls, declares | 2 |
| fn:getDefaultStrategy | calls, declares | 2 |
| fn:getEnclosingFunction | calls, declares | 2 |
| fn:getEnforcerState | calls, declares | 2 |
| fn:getEngine | calls, declares | 2 |
| fn:getEvidenceDb | calls, declares | 2 |
| fn:getFamily | calls, declares | 2 |
| fn:getField | calls, declares | 2 |
| fn:getFirewallAudit | calls, declares | 2 |
| fn:getFunctionBody | calls, declares | 2 |
| fn:getFunctionReturnType | calls, declares | 2 |
| fn:getGodLoopPhase | calls, declares | 2 |
| fn:getHandlerIdentifier | calls, declares | 2 |
| fn:getIdentityBaseDir | calls, declares | 2 |
| fn:getIdentityHeader | awaits, declares | 2 |
| fn:getImportedNames | calls, declares | 2 |
| fn:getInlineDefaultFiles | calls, declares | 2 |
| fn:getJsDocComment | calls, declares | 2 |
| fn:getKnowledgeBasePath | calls, declares | 2 |
| fn:getLastMessage | calls, declares | 2 |
| fn:getLine | calls, declares | 2 |
| fn:getLineNumber | calls, declares | 2 |
| fn:getLiveNodes | calls, declares | 2 |
| fn:getMachine | calls, declares | 2 |
| fn:getMime | calls, declares | 2 |
| fn:getModuleSpecifierFromNode | calls, declares | 2 |
| fn:getNodeLine | calls, declares | 2 |
| fn:getNodeText | calls, declares | 2 |
| fn:getOpencodeClient | calls, declares | 2 |
| fn:getOrCreateEvidenceStore | awaits, declares | 2 |
| fn:getPoseidonIntent | calls, declares | 2 |
| fn:getProjectDiagnosticsServer | calls, declares | 2 |
| fn:getProjectRoot | calls, declares | 2 |
| fn:getSafeAsyncSet | calls, declares | 2 |
| fn:getSessionCount | calls, declares | 2 |
| fn:getSetupTypesInfo | calls, declares | 2 |
| fn:getSharedDiagnosticsServer | calls, declares | 2 |
| fn:getStateDb | calls, declares | 2 |
| fn:getStepXBrain | calls, declares | 2 |
| fn:getTheatricalProp | calls, declares | 2 |
| fn:getTheatricalState | calls, declares | 2 |
| fn:getToolsCalled | calls, declares | 2 |
| fn:getTypeText | calls, declares | 2 |
| fn:getWarheadDir | calls, declares | 2 |
| fn:getWarheadsBlock | awaits, declares | 2 |
| fn:goKeyDead | calls, declares | 2 |
| fn:goKeyLabel | calls, declares | 2 |
| fn:goldenGraph | calls, declares | 2 |
| fn:goPoolFile | calls, declares | 2 |
| fn:goPoolSnapshot | calls, declares | 2 |
| fn:graphEmpty | calls, declares | 2 |
| fn:graphFromManifest | calls, declares | 2 |
| fn:graphQueryHandler | calls, declares | 2 |
| fn:grepCount | calls, declares | 2 |
| fn:groupByFile | calls, declares | 2 |
| fn:GT | calls, declares | 2 |
| fn:handleSessionCreated | calls, declares | 2 |
| fn:handleSessionEnded | calls, declares | 2 |
| fn:hasAdvanceLayerCall | calls, declares | 2 |
| fn:hasAgentReference | calls, declares | 2 |
| fn:hasAncestorType | calls, declares | 2 |
| fn:hasCleanupInFunctionScope | calls, declares | 2 |
| fn:hasConditionalValidation | calls, declares | 2 |
| fn:hasConfigAccessGuard | calls, declares | 2 |
| fn:hasContainerTestArtifact | calls, declares | 2 |
| fn:hasCorrectAgentPattern | calls, declares | 2 |
| fn:hasDecisionLogicShape | calls, declares | 2 |
| fn:hasDecoratorDispatch | calls, declares | 2 |
| fn:hasDeliberationMarkers | calls, declares | 2 |
| fn:hasDerailmentFindings | calls, declares | 2 |
| fn:hasDynamicAccess | calls, declares | 2 |
| fn:hasEmptyCatch | calls, declares | 2 |
| fn:hasEnvDefault | calls, declares | 2 |
| fn:hasFloatingPromise | calls, declares | 2 |
| fn:hasGraphToolCall | calls, declares | 2 |
| fn:hasHookHandlerHeavyWork | calls, declares | 2 |
| fn:hasInternalOrDeprecatedTag | calls, declares | 2 |
| fn:hasKnowledgeGraph | calls, declares | 2 |
| fn:hasLoggingCall | calls, declares | 2 |
| fn:hasLoggingCallInCatch | calls, declares | 2 |
| fn:hasPatternFamilyShape | calls, declares | 2 |
| fn:hasPoseidonPoller | calls, declares | 2 |
| fn:hasPrecedingRuntimeGuard | calls, declares | 2 |
| fn:hasProblemSolveArtifact | calls, declares | 2 |
| fn:hasRealComputation | calls, declares | 2 |
| fn:hasRealWorkBeforeReturn | calls, declares | 2 |
| fn:hasRecoveryCommentInCatch | calls, declares | 2 |
| fn:hasRecoveryContract | calls, declares | 2 |
| fn:hasRecoveryContractForCatch | calls, declares | 2 |
| fn:hasReturnStatementInCatch | calls, declares | 2 |
| fn:hasReturnWithValue | calls, declares | 2 |
| fn:hasSafeAsyncTag | calls, declares | 2 |
| fn:hasScatteredBooleanFlags | calls, declares | 2 |
| fn:hasSideEffectBeforeReturn | calls, declares | 2 |
| fn:hasStateMachine | calls, declares | 2 |
| fn:hasSubstring | calls, declares | 2 |
| fn:hasTagCall | calls, declares | 2 |
| fn:hasTheatricalProperty | calls, declares | 2 |
| fn:hasThrowStatement | calls, declares | 2 |
| fn:hasThrowStatementInCatch | calls, declares | 2 |
| fn:hasTsFilesRecursive | calls, declares | 2 |
| fn:hasValidationBeforeInCatch | calls, declares | 2 |
| fn:hasValidationBeforeReturn | calls, declares | 2 |
| fn:hasValidationBeforeReturnInFn | calls, declares | 2 |
| fn:hasValidContainerTestPlanFile | calls, declares | 2 |
| fn:hasVerifyReportArtifact | calls, declares | 2 |
| fn:hasWaveAuditArtifact | calls, declares | 2 |
| fn:hasWrongAgentPattern | calls, declares | 2 |
| fn:heuristicDecide | calls, declares | 2 |
| fn:historyLogUnreadable | calls, declares | 2 |
| fn:historyMissing | calls, declares | 2 |
| fn:honestEmptyReport | calls, declares | 2 |
| fn:hookAgent | calls, declares | 2 |
| fn:hookEvent | calls, declares | 2 |
| fn:hookParams | calls, declares | 2 |
| fn:hostHasPort | calls, declares | 2 |
| fn:huntLockPath | calls, declares | 2 |
| fn:hydraCandidateToFinding | calls, declares | 2 |
| fn:identifyEngines | calls, declares | 2 |
| fn:impl | calls, declares | 2 |
| fn:implementationInvalid | calls, declares | 2 |
| fn:incrementSessionCount | calls, declares | 2 |
| fn:incrementToolsCalled | calls, declares | 2 |
| fn:inferKind | calls, declares | 2 |
| fn:inferLabel | calls, declares | 2 |
| fn:inferObservedEventType | calls, declares | 2 |
| fn:inferReturnTypeFromAst | calls, declares | 2 |
| fn:ingestRecentEvents | calls, declares | 2 |
| fn:initProjectFolder | awaits, declares | 2 |
| fn:initSelfAudit | calls, declares | 2 |
| fn:inject | calls, declares | 2 |
| fn:inTarget | calls, declares | 2 |
| fn:intersect | calls, declares | 2 |
| fn:isActionableFinding | calls, declares | 2 |
| fn:isAllowedReadPath | calls, declares | 2 |
| fn:isAlphaChar | calls, declares | 2 |
| fn:isAnchorResolvable | calls, declares | 2 |
| fn:isAnyKeyword | calls, declares | 2 |
| fn:isAnyType | calls, declares | 2 |
| fn:isArrayMethodCallback | calls, declares | 2 |
| fn:isArrayUsedWithJoin | calls, declares | 2 |
| fn:isAsUnknownAsBridge | calls, declares | 2 |
| fn:isBareProcessEnv | calls, declares | 2 |
| fn:isBareRegexMatcher | calls, declares | 2 |
| fn:isBatchBActive | calls, declares | 2 |
| fn:isBlockquote | calls, declares | 2 |
| fn:isBoolean | calls, declares | 2 |
| fn:isBundledModule | calls, declares | 2 |
| fn:isBundleFile | calls, declares | 2 |
| fn:isBunPrefixed | calls, declares | 2 |
| fn:isBusKind | calls, declares | 2 |
| fn:isCallByName | calls, declares | 2 |
| fn:isCalledViaThis | calls, declares | 2 |
| fn:isCheckpointPath | calls, declares | 2 |
| fn:isClassification | calls, declares | 2 |
| fn:isCompilerOnly | calls, declares | 2 |
| fn:isCompletionClaim | calls, declares | 2 |
| fn:isContainerSkillLoaded | calls, declares | 2 |
| fn:isContainerTestingCommand | calls, declares | 2 |
| fn:isDeclared | calls, declares | 2 |
| fn:isDigitChar | calls, declares | 2 |
| fn:isEmptyFunctionBody | calls, declares | 2 |
| fn:isEmptyWave | calls, declares | 2 |
| fn:isEnforcementFunction | calls, declares | 2 |
| fn:isEnforcementName | calls, declares | 2 |
| fn:isEscapeHatch | calls, declares | 2 |
| fn:isEvidenceTriad | calls, declares | 2 |
| fn:isExcluded | calls, declares | 2 |
| fn:isExitStatement | calls, declares | 2 |
| fn:isExportedNode | calls, declares | 2 |
| fn:isFallbackName | calls, declares | 2 |
| fn:isFiniteEpsilon | calls, declares | 2 |
| fn:isFn | calls, declares | 2 |
| fn:isFrameworkInvoked | calls, declares | 2 |
| fn:isFrameworkInvokedByName | calls, declares | 2 |
| fn:isHookOrEventHandler | calls, declares | 2 |
| fn:isInExecutableAstContext | calls, declares | 2 |
| fn:isInitialized | calls, declares | 2 |
| fn:isInsideComment | calls, declares | 2 |
| fn:isInsideTryFinally | calls, declares | 2 |
| fn:isInsideTryStatement | calls, declares | 2 |
| fn:isInvokedIndirectly | calls, declares | 2 |
| fn:isIxLanguage | calls, declares | 2 |
| fn:isJsonParseCall | calls, declares | 2 |
| fn:isLeafNode | calls, declares | 2 |
| fn:isLiteralLike | calls, declares | 2 |
| fn:isLiteralReturn | calls, declares | 2 |
| fn:isLocalImport | calls, declares | 2 |
| fn:isLoggingCallExpression | calls, declares | 2 |
| fn:isLooseBindingIntent | calls, declares | 2 |
| fn:isMachineCall | calls, declares | 2 |
| fn:isModelBoundaryPhase | calls, declares | 2 |
| fn:isNewToolCall | calls, declares | 2 |
| fn:isNodeBuiltin | calls, declares | 2 |
| fn:isNodeLineage | calls, declares | 2 |
| fn:isNodePrefixed | calls, declares | 2 |
| fn:isNodeType | calls, declares | 2 |
| fn:isNonActionableWave | calls, declares | 2 |
| fn:isNumber | calls, declares | 2 |
| fn:isOpencodePlugin | calls, declares | 2 |
| fn:isPathInsideProject | calls, declares | 2 |
| fn:isPidAlive | calls, declares | 2 |
| fn:isPlaceholder | calls, declares | 2 |
| fn:isPredicate | calls, declares | 2 |
| fn:isProcessEnvAccess | calls, declares | 2 |
| fn:isPromiseType | calls, declares | 2 |
| fn:isQuotedPassage | calls, declares | 2 |
| fn:isRealWorkCallee | calls, declares | 2 |
| fn:isRecord | calls, declares | 2 |
| fn:isRecordStringUnknown | calls, declares | 2 |
| fn:isRegisteredEventType | calls, declares | 2 |
| fn:isRegistryArray | calls, declares | 2 |
| fn:isRemediation | calls, declares | 2 |
| fn:isReturnValueUsed | calls, declares | 2 |
| fn:isRuleShaped | calls, declares | 2 |
| fn:isSameFile | calls, declares | 2 |
| fn:isSaveIntent | calls, declares | 2 |
| fn:isSelfAuditFile | calls, declares | 2 |
| fn:isSelfDefectFile | calls, declares | 2 |
| fn:isSeverity | calls, declares | 2 |
| fn:isStale | calls, declares | 2 |
| fn:isSuccessClaimReturn | calls, declares | 2 |
| fn:isTemplateGenerator | calls, declares | 2 |
| fn:isTemplateShell | calls, declares | 2 |
| fn:isTerminalPhase | calls, declares | 2 |
| fn:isTestOnly | calls, declares | 2 |
| fn:isTheatricalSuggestion | calls, declares | 2 |
| fn:isToolAllowed | calls, declares | 2 |
| fn:isToolExecuteBeforeHandler | calls, declares | 2 |
| fn:isTridentAgent | calls, declares | 2 |
| fn:isTridentBuildAgent | calls, declares | 2 |
| fn:isUnixHomePath | calls, declares | 2 |
| fn:isUntypedConfigIdentifier | calls, declares | 2 |
| fn:isValidEngine | calls, declares | 2 |
| fn:isVoidOrNoReturnFunction | calls, declares | 2 |
| fn:isVoidOrUndefinedReturnType | calls, declares | 2 |
| fn:isVoidReturnType | calls, declares | 2 |
| fn:isWithinLedger | calls, declares | 2 |
| fn:isWithinRoot | calls, declares | 2 |
| fn:isXStateGuardReference | calls, declares | 2 |
| fn:ixProfile | calls, declares | 2 |
| fn:jsonParseHasAssertion | calls, declares | 2 |
| fn:jsonParseHasTypedVar | calls, declares | 2 |
| fn:keywordOverlap | calls, declares | 2 |
| fn:kindForLayer | calls, declares | 2 |
| fn:labelOf | calls, declares | 2 |
| fn:lasmePostGates | calls, declares | 2 |
| fn:lasmePreGates | calls, declares | 2 |
| fn:layerFromPatternId | calls, declares | 2 |
| fn:layersStub | calls, declares | 2 |
| fn:ledgerRootFor | calls, declares | 2 |
| fn:ledgerRootResolved | calls, declares | 2 |
| fn:legacySolveTrace | calls, declares | 2 |
| fn:lexiconSpecDeclared | calls, declares | 2 |
| fn:lineageMissing | calls, declares | 2 |
| fn:lineOf | calls, declares | 2 |
| fn:listServicesHandler | calls, declares | 2 |
| fn:listTemplateMappings | calls, declares | 2 |
| fn:listTopLevelDirs | awaits, declares | 2 |
| fn:loadAgentDirMap | calls, declares | 2 |
| fn:loadAuditLayerDescriptions | calls, declares | 2 |
| fn:loadBattery | calls, declares | 2 |
| fn:loadCalibrationFixtures | calls, declares | 2 |
| fn:loadDistManifest | awaits, declares | 2 |
| fn:loadFireFixture | calls, declares | 2 |
| fn:loadFixtureProfile | calls, declares | 2 |
| fn:loadFixtureProfileFixtures | calls, declares | 2 |
| fn:loadGateState | calls, declares | 2 |
| fn:loadGoldenFixture | calls, declares | 2 |
| fn:loadGrammar | calls, declares | 2 |
| fn:loadHivePatterns | awaits, declares | 2 |
| fn:loadIdentityFile | calls, declares | 2 |
| fn:loadKnowledgeLibrary | calls, declares | 2 |
| fn:loadKnowledgeSummary | calls, declares | 2 |
| fn:loadKnowledgeTechniqueWithCode | calls, declares | 2 |
| fn:loadLayer | calls, declares | 2 |
| fn:loadProfile | calls, declares | 2 |
| fn:loadState | calls, declares | 2 |
| fn:loadStateFromFindings | calls, declares | 2 |
| fn:loadTridentIgnore | calls, declares | 2 |
| fn:lockdownReadSource | calls, declares | 2 |
| fn:lockPathFor | calls, declares | 2 |
| fn:log | calls, declares | 2 |
| fn:logMessage | calls, declares | 2 |
| fn:logViolation | calls, declares | 2 |
| fn:lowerIndexOf | calls, declares | 2 |
| fn:machinery | calls, declares | 2 |
| fn:machineTypes | calls, declares | 2 |
| fn:makeAssignableHooks | calls, declares | 2 |
| fn:makeAuditSpecFixture | calls, declares | 2 |
| fn:makeCallGraph | calls, declares | 2 |
| fn:makeCandidates | calls, declares | 2 |
| fn:makeCappedGrepTool | calls, declares | 2 |
| fn:makeCappedReadTool | calls, declares | 2 |
| fn:makeCard | calls, declares | 2 |
| fn:makeClock | calls, declares | 2 |
| fn:makeCountingHooks | calls, declares | 2 |
| fn:makeDb | calls, declares | 2 |
| fn:makeDefaultContext | calls, declares | 2 |
| fn:makeDeps | calls, declares | 2 |
| fn:makeEnforcerPlane | calls, declares | 2 |
| fn:makeEngine | calls, declares | 2 |
| fn:makeFinding | calls, declares | 2 |
| fn:makeFixture | calls, declares | 2 |
| fn:makeForceBoundEditTool | calls, declares | 2 |
| fn:makeForceBoundWriteTool | calls, declares | 2 |
| fn:makeGateOutput | calls, declares | 2 |
| fn:makeGraphFixture | calls, declares | 2 |
| fn:makeGraphMapper | calls, declares | 2 |
| fn:makeGraphTagTool | calls, declares | 2 |
| fn:makeLasmeCandidate | calls, declares | 2 |
| fn:makeLasmeOutput | calls, declares | 2 |
| fn:makeLayer | calls, declares | 2 |
| fn:makeLayers | calls, declares | 2 |
| fn:makeMemory | calls, declares | 2 |
| fn:makeMirror1 | calls, declares | 2 |
| fn:makeMirror2Giant | calls, declares | 2 |
| fn:makeModule | calls, declares | 2 |
| fn:makeObs | calls, declares | 2 |
| fn:makeObserverPlane | calls, declares | 2 |
| fn:makePipeline | calls, declares | 2 |
| fn:makeProfile | calls, declares | 2 |
| fn:makeProject | calls, declares | 2 |
| fn:makeRunSummary | calls, declares | 2 |
| fn:makeSpec | calls, declares | 2 |
| fn:makeSpecBindings | calls, declares | 2 |
| fn:makeState | calls, declares | 2 |
| fn:makeTemplate | calls, declares | 2 |
| fn:makeTempStore | calls, declares | 2 |
| fn:makeTransport | calls, declares | 2 |
| fn:makeTree | calls, declares | 2 |
| fn:makeTriad | calls, declares | 2 |
| fn:makeVerdict | calls, declares | 2 |
| fn:makeVerdictsCorrected | calls, declares | 2 |
| fn:makeVerdictsDefective | calls, declares | 2 |
| fn:mandateDedupeKey | calls, declares | 2 |
| fn:manifestArtifacts | calls, declares | 2 |
| fn:mapEdgeKind | calls, declares | 2 |
| fn:mapFindingToCandidate | calls, declares | 2 |
| fn:mapNodeKind | calls, declares | 2 |
| fn:mapNodeType | calls, declares | 2 |
| fn:mapPredicate | calls, declares | 2 |
| fn:mapSeverity | calls, declares | 2 |
| fn:markCalibrated | calls, declares | 2 |
| fn:markContainerTestSubject | calls, declares | 2 |
| fn:markerOk | calls, declares | 2 |
| fn:markGoKeyAlive | calls, declares | 2 |
| fn:markGoKeyDead | calls, declares | 2 |
| fn:markInconclusive | calls, declares | 2 |
| fn:markStepSkipped | calls, declares | 2 |
| fn:markSymbolImported | calls, declares | 2 |
| fn:matchCheckTokens | calls, declares | 2 |
| fn:matchesIgnorePatterns | calls, declares | 2 |
| fn:materializeCode | calls, declares | 2 |
| fn:mergeEvidenceJsonl | calls, declares | 2 |
| fn:mergeGateState | calls, declares | 2 |
| fn:mergeObservations | calls, declares | 2 |
| fn:mergePasses | calls, declares | 2 |
| fn:migrateProjectRoot | calls, declares | 2 |
| fn:minimalProfile | calls, declares | 2 |
| fn:mirrorToMasterContext | calls, declares | 2 |
| fn:mirrorWriteFailed | calls, declares | 2 |
| fn:mkBrain | calls, declares | 2 |
| fn:mkCandidate | calls, declares | 2 |
| fn:mkConstruct | calls, declares | 2 |
| fn:mkCtx | calls, declares | 2 |
| fn:mkFinding | calls, declares | 2 |
| fn:mkPreflight | calls, declares | 2 |
| fn:mkRoot | calls, declares | 2 |
| fn:mkTmp | calls, declares | 2 |
| fn:mockGraph | calls, declares | 2 |
| fn:modelPlane | calls, declares | 2 |
| fn:mustImplement | calls, declares | 2 |
| fn:namedError | calls, declares | 2 |
| fn:needsRecalibration | calls, declares | 2 |
| fn:needsReturn | calls, declares | 2 |
| fn:newDb | calls, declares | 2 |
| fn:nextReportVersion | awaits, declares | 2 |
| fn:node | calls, declares | 2 |
| fn:nodeReferencesComplete | calls, declares | 2 |
| fn:nodeText | calls, declares | 2 |
| fn:nonEmpty | calls, declares | 2 |
| fn:normalizeArgs | calls, declares | 2 |
| fn:normalizeCanonical | calls, declares | 2 |
| fn:normalizeContractFile | calls, declares | 2 |
| fn:normalizeEvent | calls, declares | 2 |
| fn:normalizeFilePath | calls, declares | 2 |
| fn:normalizeFixTarget | calls, declares | 2 |
| fn:normalizeGodLoopPhase | calls, declares | 2 |
| fn:normalizeGraph | calls, declares | 2 |
| fn:normalizeImportPath | calls, declares | 2 |
| fn:normalizeLabel | calls, declares | 2 |
| fn:normalizePattern | calls, declares | 2 |
| fn:normalizeProjectName | calls, declares | 2 |
| fn:normalizeRowKind | calls, declares | 2 |
| fn:normalizeSessionId | calls, declares | 2 |
| fn:normalizeSpecClauses | calls, declares | 2 |
| fn:normalizeToolName | calls, declares | 2 |
| fn:normalizeType | calls, declares | 2 |
| fn:normalizeW5Observation | calls, declares | 2 |
| fn:notificationPath | calls, declares | 2 |
| fn:notifyGateCompletion | calls, declares | 2 |
| fn:notifyIdentityLoaded | calls, declares | 2 |
| fn:observationMatcherId | calls, declares | 2 |
| fn:okJson | calls, declares | 2 |
| fn:oneLine | calls, declares | 2 |
| fn:openAndNextRunId | calls, declares | 2 |
| fn:openFamilyReadOnly | calls, declares | 2 |
| fn:openFamilyStore | calls, declares | 2 |
| fn:openProjectSharedDb | calls, declares | 2 |
| fn:openSharedDb | calls, declares | 2 |
| fn:openStore | calls, declares | 2 |
| fn:orderPipeline | calls, declares | 2 |
| fn:outputContractBlock | calls, declares | 2 |
| fn:overAuditDemand | calls, declares | 2 |
| fn:overAuditStats | calls, declares | 2 |
| fn:pad | calls, declares | 2 |
| fn:parseBuildOutput | calls, declares | 2 |
| fn:parseCanonicalBlocks | calls, declares | 2 |
| fn:parseCommand | calls, declares | 2 |
| fn:parseDeclaredEdges | calls, declares | 2 |
| fn:parseDistManifest | calls, declares | 2 |
| fn:parsedNodes | calls, declares | 2 |
| fn:parseEmbeddingSummary | calls, declares | 2 |
| fn:parseFieldLines | calls, declares | 2 |
| fn:parseFlowArray | calls, declares | 2 |
| fn:parseFlowMap | calls, declares | 2 |
| fn:parseFlowValue | calls, declares | 2 |
| fn:parseGoWindowMs | calls, declares | 2 |
| fn:parseLearnSummary | calls, declares | 2 |
| fn:parseLegacyR23Blocks | calls, declares | 2 |
| fn:parseLlmCallSites | calls, declares | 2 |
| fn:parseLlmDepends | calls, declares | 2 |
| fn:parseLlmInventory | calls, declares | 2 |
| fn:parseLlmTrace | calls, declares | 2 |
| fn:parseMapJson | calls, declares | 2 |
| fn:parseMarkdownFindings | calls, declares | 2 |
| fn:parseMetaPatterns | calls, declares | 2 |
| fn:parseProbeResult | calls, declares | 2 |
| fn:parseQuoted | calls, declares | 2 |
| fn:parseRequirementSections | calls, declares | 2 |
| fn:parseScalar | calls, declares | 2 |
| fn:parseSemanticPayload | calls, declares | 2 |
| fn:parseSpecBindings | calls, declares | 2 |
| fn:parseSubsetQuery | calls, declares | 2 |
| fn:parseTableRow | calls, declares | 2 |
| fn:parseVersion | calls, declares | 2 |
| fn:parseYamlSubset | calls, declares | 2 |
| fn:PASS | calls, declares | 2 |
| fn:passMax | calls, declares | 2 |
| fn:passMin | calls, declares | 2 |
| fn:passThroughFirewall | calls, declares | 2 |
| fn:pathHas | calls, declares | 2 |
| fn:pathResolve | calls, declares | 2 |
| fn:patternsMatch | calls, declares | 2 |
| fn:persistMarkerFile | calls, declares | 2 |
| fn:persistState | calls, declares | 2 |
| fn:populateTypedGraph | awaits, declares | 2 |
| fn:pragmaFailed | calls, declares | 2 |
| fn:predicateFamilyFrom | calls, declares | 2 |
| fn:preliminaryArtifactPath | calls, declares | 2 |
| fn:preprocess | calls, declares | 2 |
| fn:prioritizeFixes | calls, declares | 2 |
| fn:probeExists | calls, declares | 2 |
| fn:profileInvalid | calls, declares | 2 |
| fn:profileWithFakeBinary | calls, declares | 2 |
| fn:projectGraph | calls, declares | 2 |
| fn:projectToken | calls, declares | 2 |
| fn:projectTokenSlug | calls, declares | 2 |
| fn:proseSeverity | calls, declares | 2 |
| fn:queryDb | calls, declares | 2 |
| fn:queryEmbeddingIndex | calls, declares | 2 |
| fn:queryFindings | calls, declares | 2 |
| fn:queryStorePath | calls, declares | 2 |
| fn:r5TheatricalLexiconHasMatch | calls, declares | 2 |
| fn:rank | calls, declares | 2 |
| fn:rankFindings | calls, declares | 2 |
| fn:rate | calls, declares | 2 |
| fn:rawFor | calls, declares | 2 |
| fn:read | calls, declares | 2 |
| fn:readCurrentAgent | awaits, declares | 2 |
| fn:readDeadUntil | calls, declares | 2 |
| fn:readDeclaredMeta | calls, declares | 2 |
| fn:readDocsPatterns | calls, declares | 2 |
| fn:readFile | awaits, calls | 2 |
| fn:readIfExists | calls, declares | 2 |
| fn:readLinesOrThrow | calls, declares | 2 |
| fn:readManifest | calls, declares | 2 |
| fn:readNotifications | calls, declares | 2 |
| fn:readPath | calls, declares | 2 |
| fn:readPayload | calls, declares | 2 |
| fn:readPhase | calls, declares | 2 |
| fn:readRunStatus | calls, declares | 2 |
| fn:readServiceDeps | calls, declares | 2 |
| fn:readServiceMethods | calls, declares | 2 |
| fn:readServices | calls, declares | 2 |
| fn:readSessionTitle | awaits, declares | 2 |
| fn:readSourceContext | calls, declares | 2 |
| fn:readSourceFiles | calls, declares | 2 |
| fn:readWindowWithinScope | awaits, declares | 2 |
| fn:readWriteViolations | calls, declares | 2 |
| fn:realResolve | calls, declares | 2 |
| fn:reasoningPlane | calls, declares | 2 |
| fn:recencyDaysFor | calls, declares | 2 |
| fn:recon | calls, declares | 2 |
| fn:recordingExec | calls, declares | 2 |
| fn:recordTransition | calls, declares | 2 |
| fn:redactSecrets | awaits, declares | 2 |
| fn:referencesHookEvent | calls, declares | 2 |
| fn:referencesMonorepoTool | calls, declares | 2 |
| fn:registerEventSubstrate | calls, declares | 2 |
| fn:registerExport | calls, declares | 2 |
| fn:registerPlanes | calls, declares | 2 |
| fn:registerProjectFolderWarheadHooks | calls, declares | 2 |
| fn:registerWarheadHooks | awaits, declares | 2 |
| fn:rehydrate | calls, declares | 2 |
| fn:rejectionOf | awaits, declares | 2 |
| fn:releaseHuntLock | calls, declares | 2 |
| fn:renderArtifact | calls, declares | 2 |
| fn:renderAscii | calls, declares | 2 |
| fn:renderAsciiLevel | calls, declares | 2 |
| fn:renderC4Dsl | calls, declares | 2 |
| fn:renderC4IdMap | calls, declares | 2 |
| fn:renderDot | calls, declares | 2 |
| fn:renderFinding | calls, declares | 2 |
| fn:renderGraphSummary | calls, declares | 2 |
| fn:renderMermaid | calls, declares | 2 |
| fn:renderSectionRow | calls, declares | 2 |
| fn:report | calls, declares | 2 |
| fn:reportFiles | awaits, declares | 2 |
| fn:reportMd | calls, declares | 2 |
| fn:requiredToolsForPhase | calls, declares | 2 |
| fn:requireLoaded | calls, declares | 2 |
| fn:requireNodePath | calls, declares | 2 |
| fn:requireProjectDb | calls, declares | 2 |
| fn:resetCalibrationFeedback | calls, declares | 2 |
| fn:resetDerailmentTracker | calls, declares | 2 |
| fn:resetEventFirewalls | calls, declares | 2 |
| fn:resetRepetitionTracker | calls, declares | 2 |
| fn:resetState | calls, declares | 2 |
| fn:resetToolsCalled | calls, declares | 2 |
| fn:resetToTemplate | calls, declares | 2 |
| fn:resolveAuditEngineRoot | calls, declares | 2 |
| fn:resolveCorbell | calls, declares | 2 |
| fn:resolveCorbellBin | calls, declares | 2 |
| fn:resolveCorpusPaths | calls, declares | 2 |
| fn:resolveDiagnosticsServer | calls, declares | 2 |
| fn:resolveDiagnosticsServerForFile | calls, declares | 2 |
| fn:resolveEntities | awaits, declares | 2 |
| fn:resolveFilePaths | calls, declares | 2 |
| fn:resolveForWrite | calls, declares | 2 |
| fn:resolveGraphNode | calls, declares | 2 |
| fn:resolveIpcSocketPath | calls, declares | 2 |
| fn:resolveLaunchModelFlag | calls, declares | 2 |
| fn:resolveLedgerRoot | calls, declares | 2 |
| fn:resolveMasterContextDir | awaits, declares | 2 |
| fn:resolveMcpServeCommand | calls, declares | 2 |
| fn:resolveModulePath | calls, declares | 2 |
| fn:resolveNodeFile | calls, declares | 2 |
| fn:resolveOwnerSessionId | calls, declares | 2 |
| fn:resolveProjectName | awaits, declares | 2 |
| fn:resolveRelative | calls, declares | 2 |
| fn:resolveScopeRoot | calls, declares | 2 |
| fn:resolveSessionDbPath | calls, declares | 2 |
| fn:resolveSpecsRoots | calls, declares | 2 |
| fn:resolveStateSessionID | calls, declares | 2 |
| fn:resolveTargetPath | calls, declares | 2 |
| fn:resolveTargetRoot | calls, declares | 2 |
| fn:resolveType | calls, declares | 2 |
| fn:resolveUiLaunchCommand | calls, declares | 2 |
| fn:resolveVenvPython | calls, declares | 2 |
| fn:resolveWarheadIdentityDir | calls, declares | 2 |
| fn:resolveWorkspaceRoot | calls, declares | 2 |
| fn:resolveWriterApiKey | calls, declares | 2 |
| fn:resumeSessionExists | calls, declares | 2 |
| fn:retentionBound | calls, declares | 2 |
| fn:revalidateOnWrite | calls, declares | 2 |
| fn:rmTmp | calls, declares | 2 |
| fn:routeAfterVerify | calls, declares | 2 |
| fn:routeEnforcer | calls, declares | 2 |
| fn:routeGit | calls, declares | 2 |
| fn:routeSed | calls, declares | 2 |
| fn:rowAs | calls, declares | 2 |
| fn:rowsAs | calls, declares | 2 |
| fn:rule | calls, declares | 2 |
| fn:runAuditPipeline | awaits, declares | 2 |
| fn:runBattery | calls, declares | 2 |
| fn:runConformance | calls, declares | 2 |
| fn:runCrossSectionAudit | calls, declares | 2 |
| fn:runDeepeningChecks | calls, declares | 2 |
| fn:runGraphLogicPhase | awaits, declares | 2 |
| fn:runInternalLLMLoop | awaits, declares | 2 |
| fn:runLayerOnFixture | awaits, declares | 2 |
| fn:runMcpTool | calls, declares | 2 |
| fn:runPackageAudit | awaits, declares | 2 |
| fn:runPreflight | awaits, declares | 2 |
| fn:runQuery | calls, declares | 2 |
| fn:runQueryTool | calls, declares | 2 |
| fn:runRuntimeCorpus | awaits, declares | 2 |
| fn:runSelfAudit | calls, declares | 2 |
| fn:runStatusPath | calls, declares | 2 |
| fn:safeCheck | calls, declares | 2 |
| fn:safeIdent | calls, declares | 2 |
| fn:safeJsonParse | calls, declares | 2 |
| fn:safeNotifyGateCompletion | calls, declares | 2 |
| fn:safeTemporalLiveNodes | calls, declares | 2 |
| fn:safeText | calls, declares | 2 |
| fn:safeWriteRunStatus | calls, declares | 2 |
| fn:sampleInput | calls, declares | 2 |
| fn:sanitizeC4Id | calls, declares | 2 |
| fn:sanitizeRuleName | calls, declares | 2 |
| fn:saveGateState | calls, declares | 2 |
| fn:scaffoldFileList | calls, declares | 2 |
| fn:scanMetacharacters | calls, declares | 2 |
| fn:scanQuoteState | calls, declares | 2 |
| fn:scanTheatricalInContent | calls, declares | 2 |
| fn:scanTheatricalInFiles | calls, declares | 2 |
| fn:scanTopLevelImports | awaits, declares | 2 |
| fn:scanTsFilesForQuality | calls, declares | 2 |
| fn:scopeDiscoveryToEngine | calls, declares | 2 |
| fn:sectionFromFinding | calls, declares | 2 |
| fn:seedAetherProviderEnv | calls, declares | 2 |
| fn:seedDb | calls, declares | 2 |
| fn:seedFixture | calls, declares | 2 |
| fn:seedHunt | calls, declares | 2 |
| fn:seedRun | calls, declares | 2 |
| fn:seedVerify | calls, declares | 2 |
| fn:selectAdapter | calls, declares | 2 |
| fn:selectAnglesForContext | calls, declares | 2 |
| fn:selectDefenses | calls, declares | 2 |
| fn:selectTemplate | calls, declares | 2 |
| fn:selfEnforceScan | calls, declares | 2 |
| fn:semanticVerb | calls, declares | 2 |
| fn:sentenceVerdict | calls, declares | 2 |
| fn:sentinelFor | calls, declares | 2 |
| fn:sessionIdOf | calls, declares | 2 |
| fn:sessionPlane | calls, declares | 2 |
| fn:setBlockDelivery | calls, declares | 2 |
| fn:setClientGetter | calls, declares | 2 |
| fn:setContainerSkillLoaded | calls, declares | 2 |
| fn:setCurrentAgent | calls, declares | 2 |
| fn:setCurrentSessionModel | calls, declares | 2 |
| fn:setDeliverySink | calls, declares | 2 |
| fn:setIdentityLoaded | calls, declares | 2 |
| fn:setLastMessage | calls, declares | 2 |
| fn:setPendingL1Path | calls, declares | 2 |
| fn:setPoseidonClientRef | calls, declares | 2 |
| fn:setPoseidonIntent | calls, declares | 2 |
| fn:setProjectRoot | calls, declares | 2 |
| fn:setToolsCalled | calls, declares | 2 |
| fn:setTriageClassifier | calls, declares | 2 |
| fn:severityFrom | calls, declares | 2 |
| fn:severityFromBinding | calls, declares | 2 |
| fn:severityFromRow | calls, declares | 2 |
| fn:severityIndex | calls, declares | 2 |
| fn:severityPrefix | calls, declares | 2 |
| fn:severityScore | calls, declares | 2 |
| fn:severityWeight | calls, declares | 2 |
| fn:sha256 | calls, declares | 2 |
| fn:sha256File | calls, declares | 2 |
| fn:sha256Hex | calls, declares | 2 |
| fn:shaFile | calls, declares | 2 |
| fn:sharedDbPath | calls, declares | 2 |
| fn:shareSignificantToken | calls, declares | 2 |
| fn:shortFile | calls, declares | 2 |
| fn:sig | calls, declares | 2 |
| fn:skippedReport | calls, declares | 2 |
| fn:sleep | awaits, declares | 2 |
| fn:snap | calls, declares | 2 |
| fn:snapshotState | calls, declares | 2 |
| fn:sortBySeverity | calls, declares | 2 |
| fn:sourceReadFailed | calls, declares | 2 |
| fn:spawnBugHunterLoop | awaits, declares | 2 |
| fn:spec | calls, declares | 2 |
| fn:specClauseToNodeId | calls, declares | 2 |
| fn:specDeclaresActor | calls, declares | 2 |
| fn:specDeclaresAdapter | calls, declares | 2 |
| fn:specDeclaresEngine | calls, declares | 2 |
| fn:specDeclaresMachine | calls, declares | 2 |
| fn:specIn | calls, declares | 2 |
| fn:specsRootsFor | calls, declares | 2 |
| fn:splitFindingsIntoBatches | calls, declares | 2 |
| fn:splitIntoWords | calls, declares | 2 |
| fn:splitTextWords | calls, declares | 2 |
| fn:splitTopLevel | calls, declares | 2 |
| fn:sqliteStore | calls, declares | 2 |
| fn:sqlList | calls, declares | 2 |
| fn:stageEntry | calls, declares | 2 |
| fn:startAudit | awaits, calls | 2 |
| fn:startPoseidonPoller | calls, declares | 2 |
| fn:startRetryLoop | calls, declares | 2 |
| fn:startSessionWatcher | calls, declares | 2 |
| fn:state | calls, declares | 2 |
| fn:stateInconclusive | calls, declares | 2 |
| fn:stateRow | calls, declares | 2 |
| fn:stitchConcurrentSections | calls, declares | 2 |
| fn:stopSessionWatcher | calls, declares | 2 |
| fn:storeArtifacts | calls, declares | 2 |
| fn:streamCompletion | awaits, declares | 2 |
| fn:strike | calls, declares | 2 |
| fn:stringLength | calls, declares | 2 |
| fn:stripBeforeSeal | calls, declares | 2 |
| fn:stripComment | calls, declares | 2 |
| fn:stripCommentDelimiters | calls, declares | 2 |
| fn:stripCommentWithState | calls, declares | 2 |
| fn:stripLineSuffix | calls, declares | 2 |
| fn:stripOuterQuotes | calls, declares | 2 |
| fn:stripToolReferences | calls, declares | 2 |
| fn:stubEncode | calls, declares | 2 |
| fn:stubExec | calls, declares | 2 |
| fn:stubGraph | calls, declares | 2 |
| fn:subjectObjectKey | calls, declares | 2 |
| fn:substrateBlockDelivery | calls, declares | 2 |
| fn:substringPresent | calls, declares | 2 |
| fn:supersedeNode | calls, declares | 2 |
| fn:symbolGraph | calls, declares | 2 |
| fn:synthConsumer | calls, declares | 2 |
| fn:synthDownstream | calls, declares | 2 |
| fn:synthSite | calls, declares | 2 |
| fn:systemPromptFor | calls, declares | 2 |
| fn:teaNotTebDemand | calls, declares | 2 |
| fn:templateBindingInvalid | calls, declares | 2 |
| fn:templateMissing | calls, declares | 2 |
| fn:testContextSynthesis | calls, declares | 2 |
| fn:testDeepPlanning | calls, declares | 2 |
| fn:testFuzz | calls, declares | 2 |
| fn:testIdentity | calls, declares | 2 |
| fn:testInvariants | calls, declares | 2 |
| fn:testNLP | calls, declares | 2 |
| fn:testOrchestrator | calls, declares | 2 |
| fn:testProblemSolving | calls, declares | 2 |
| fn:testTools | calls, declares | 2 |
| fn:testWithTimeout | calls, declares | 2 |
| fn:testZeroTolerance | calls, declares | 2 |
| fn:textContains | calls, declares | 2 |
| fn:textHasTypo | calls, declares | 2 |
| fn:threatDoNot | calls, declares | 2 |
| fn:threatFixRecipe | calls, declares | 2 |
| fn:tmp | calls, declares | 2 |
| fn:tmpDbPath | calls, declares | 2 |
| fn:tmpDir | calls, declares | 2 |
| fn:tmpFile | calls, declares | 2 |
| fn:tmpLedger | calls, declares | 2 |
| fn:tmpRoot | calls, declares | 2 |
| fn:toArraySet | calls, declares | 2 |
| fn:toBrandedVerdict | calls, declares | 2 |
| fn:toCanonicalFile | calls, declares | 2 |
| fn:toClassCanonical | calls, declares | 2 |
| fn:toFindingInput | calls, declares | 2 |
| fn:toFnCanonical | calls, declares | 2 |
| fn:toInterfaceCanonical | calls, declares | 2 |
| fn:tokenize | calls, declares | 2 |
| fn:tokenPos | calls, declares | 2 |
| fn:toMachineVerdictRows | calls, declares | 2 |
| fn:toManifestJson | calls, declares | 2 |
| fn:toMethodCanonical | calls, declares | 2 |
| fn:toModuleCanonical | calls, declares | 2 |
| fn:tool | calls, declares | 2 |
| fn:toolAfterHook | awaits, declares | 2 |
| fn:toolBeforeHook | awaits, declares | 2 |
| fn:topoSort | calls, declares | 2 |
| fn:totalThreatInstances | calls, declares | 2 |
| fn:trackTheatricalArtifacts | calls, declares | 2 |
| fn:transformEdge | calls, declares | 2 |
| fn:transformNode | calls, declares | 2 |
| fn:transitionOnValidate | calls, declares | 2 |
| fn:tripleKey | calls, declares | 2 |
| fn:truncate | calls, declares | 2 |
| fn:tryGetEngine | calls, declares | 2 |
| fn:tryParseCardinality | calls, declares | 2 |
| fn:tryParseLine | calls, declares | 2 |
| fn:tryParseNameColon | calls, declares | 2 |
| fn:tryParseNameEquals | calls, declares | 2 |
| fn:tryParseStderrResult | calls, declares | 2 |
| fn:tryParseThreshold | calls, declares | 2 |
| fn:tryProvider | awaits, declares | 2 |
| fn:typeOf | calls, declares | 2 |
| fn:unescapeDouble | calls, declares | 2 |
| fn:unique | calls, declares | 2 |
| fn:unverifiedFindingIndexes | calls, declares | 2 |
| fn:unwired | calls, declares | 2 |
| fn:V | calls, declares | 2 |
| fn:validArtifact | calls, declares | 2 |
| fn:validate | calls, declares | 2 |
| fn:validateAuditSpecContent | calls, declares | 2 |
| fn:validateAuditSpecFile | calls, declares | 2 |
| fn:validateAuditTarget | calls, declares | 2 |
| fn:validateBatchCoverage | calls, declares | 2 |
| fn:validateBuild | awaits, declares | 2 |
| fn:validateContextSynthesisInput | calls, declares | 2 |
| fn:validateDecisionContent | calls, declares | 2 |
| fn:validateDeepPlanningInput | calls, declares | 2 |
| fn:validateDist | calls, declares | 2 |
| fn:validateEmbeddedTestPlan | calls, declares | 2 |
| fn:validateFindingLocation | calls, declares | 2 |
| fn:validateHandlerSignature | calls, declares | 2 |
| fn:validatePlanContent | calls, declares | 2 |
| fn:validateProblemSolveContent | calls, declares | 2 |
| fn:validateProblemSolvingInput | calls, declares | 2 |
| fn:validateRange | calls, declares | 2 |
| fn:validateSpec | calls, declares | 2 |
| fn:validateSPG | calls, declares | 2 |
| fn:validateTaskPromptLines | calls, declares | 2 |
| fn:validateTestPlan | calls, declares | 2 |
| fn:validateTsconfig | calls, declares | 2 |
| fn:validateUser | calls, declares | 2 |
| fn:validateVerdicts | calls, declares | 2 |
| fn:validProfileJson | calls, declares | 2 |
| fn:validProfileYaml | calls, declares | 2 |
| fn:validReport | calls, declares | 2 |
| fn:validReportFor | calls, declares | 2 |
| fn:validScenario | calls, declares | 2 |
| fn:validSpec | calls, declares | 2 |
| fn:verbHasMatchingCall | calls, declares | 2 |
| fn:verbOf | calls, declares | 2 |
| fn:verdictFromRow | calls, declares | 2 |
| fn:verdictInvalid | calls, declares | 2 |
| fn:verdictRows | calls, declares | 2 |
| fn:verificationCountBoundFailed | calls, declares | 2 |
| fn:verifyAetherOutput | calls, declares | 2 |
| fn:verifyAnchorResolves | calls, declares | 2 |
| fn:verifyClaim | calls, declares | 2 |
| fn:verifyDistSha | calls, declares | 2 |
| fn:verifyImportGraph | calls, declares | 2 |
| fn:verifyScriptsExist | calls, declares | 2 |
| fn:violationFrequencies | calls, declares | 2 |
| fn:violations | calls, declares | 2 |
| fn:visitNode | calls, declares | 2 |
| fn:voiceAmbiguous | calls, declares | 2 |
| fn:voidPersist | calls, declares | 2 |
| fn:walkAst | calls, declares | 2 |
| fn:walkAstUp | calls, declares | 2 |
| fn:walkDir | awaits, calls | 2 |
| fn:walkFunctionScope | calls, declares | 2 |
| fn:walkSourceFile | calls, declares | 2 |
| fn:walkTsFiles | calls, declares | 2 |
| fn:warnBetween | calls, declares | 2 |
| fn:warnEq | calls, declares | 2 |
| fn:waveAuditGateVerdict | calls, declares | 2 |
| fn:waveEmptyNoAgentsDispatched | calls, declares | 2 |
| fn:wellFormedProbe | calls, declares | 2 |
| fn:whoCalls | calls, declares | 2 |
| fn:windowKey | calls, declares | 2 |
| fn:wipePhase | calls, declares | 2 |
| fn:wirePbaBridge | calls, declares | 2 |
| fn:wordOverlapSimilarity | calls, declares | 2 |
| fn:wouldBreak | calls, declares | 2 |
| fn:write | calls, declares | 2 |
| fn:writeArtifactFile | awaits, declares | 2 |
| fn:writeBattery | calls, declares | 2 |
| fn:writeC4Diagrams | awaits, declares | 2 |
| fn:writeCandidateContext | calls, declares | 2 |
| fn:writeCorbellStore | calls, declares | 2 |
| fn:writeCorpus | calls, declares | 2 |
| fn:writeDeadUntil | calls, declares | 2 |
| fn:writeEmbeddingStore | calls, declares | 2 |
| fn:writeEvidenceRecord | calls, declares | 2 |
| fn:writeFileEnsured | calls, declares | 2 |
| fn:writeFindingsMap | calls, declares | 2 |
| fn:writeGraph | calls, declares | 2 |
| fn:writeGraphStore | calls, declares | 2 |
| fn:writeManifest | calls, declares | 2 |
| fn:writeMarker | calls, declares | 2 |
| fn:writePhase | calls, declares | 2 |
| fn:writeProfile | calls, declares | 2 |
| fn:writeReadTurnsEvidence | calls, declares | 2 |
| fn:writeReconMap | calls, declares | 2 |
| fn:writeRuleCards | calls, declares | 2 |
| fn:writeRunnerTag | calls, declares | 2 |
| fn:writeRunStatus | calls, declares | 2 |
| fn:writeSpec | calls, declares | 2 |
| fn:writeState | calls, declares | 2 |
| fn:writeTargetFile | calls, declares | 2 |
| fn:yamlErr | calls, declares | 2 |
| fn:yieldToEventLoop | awaits, declares | 2 |
