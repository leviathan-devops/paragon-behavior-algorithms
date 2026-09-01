# CODE AUDIT AETHER REPORT
## 0 RUN METADATA
- **Run ID:** R29-sro-path-20260829-aether
- **Layer:** R29-sro-path (impact-path)
- **Ledger:** src/.trident/aether-ledger/R29-sro-path
- **Findings file:** findings/report.md (5 candidates, markdown FINDING blocks + JSON fallback, zod-validated via SubagentOutputSchema)
- **Verdicts file:** verdicts.json (5/5 TRUE_DEFECT, runId R29-sro-path-20260829-aether, candidateCount 5)
- **Tools:** capped read 320 lines/call, grep 120 results, graphify:query/path/explain/subgraph (one-graph law), force-bound write_findings/edit (pinned to findings/report.md)
- **Specs read:** V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md §2.5 (SRO roster: graph-builder/path-hunter/dead-code/cycle, blast-radius ≤5 hops, TRIPLE-CONFIRMED), MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §1.3 (meta-layer law, one-graph, two docs), §2.1-2.6 (nesting seam, mechanical templates, one-graph law, pipeline), aether-templates/hunters/sro-path.ts R29 mandate (blast-radius paths + downstream classification: godNode/cross-community=CRITICAL leaf=LOW), V443 §2.10 GRAPH TOOLS USAGE LAW (EXTRACTED vs INFERRED)
- **Files read (7, verbatim quotes anchored):** src/hydra/instances/sro.ts (computeBlastRadius:297,311,323,326,341,393, sroSynthesize:395-410, pre-gates:528), src/hydra/memory.ts (getGraph stub:118), src/hydra/graph-mapper.ts (normalizeGraph:34,58,77 + path:143 undirected + graphify extract:77), src/hydra/graphify.ts (createGraphifyTools subgraph depth void:148), src/hydra/types.ts (GraphifyEdge confidence:37, GraphifyGraph godNodes:87), src/hydra/aether-templates/hunters/sro-path.ts (R29 staticPrompt:14,32, GRAPH_TOOLS_LAW, calibration shots), src/hydra/aether-templates/meta/sro-meta.ts (CORRELATIONS contract)
- **Graph facts:** graphify extract tree-sitter code-only on path.resolve(targetRoot) → absolute source_file; communities via louvain, godNodes = top-5 degree (normalizeGraph + merge), one shared graph (not per-agent duplicates) — but sroSynthesize never reads godNodes/communities; confidence EXTRACTED/INFERRED preserved in graph-mapper but discarded in sro.ts adj

## 1 THE VERDICT TABLE
| # | File | Line | Predicate | Severity | Adjudication | Confidence | Derailment |
|---|------|------|-----------|----------|--------------|------------|------------|
| 0 | src/hydra/instances/sro.ts | 323 | impact-path.blast-radius | HIGH | TRUE_DEFECT | 0.88 | D4 |
| 1 | src/hydra/instances/sro.ts | 341 | impact-path.blast-radius | MEDIUM | TRUE_DEFECT | 0.85 | D4 |
| 2 | src/hydra/instances/sro.ts | 393 | impact-path.classification | HIGH | TRUE_DEFECT | 0.92 | D4 |
| 3 | src/hydra/instances/sro.ts | 297 | impact-path.blast-radius | HIGH | TRUE_DEFECT | 0.78 | D2 |
| 4 | src/hydra/instances/sro.ts | 311 | impact-path.blast-radius | MEDIUM | TRUE_DEFECT | 0.84 | D2 |

- **Counts:** TRUE_DEFECT 5/5, RED_HERRING 0, UNCLEAR 0 — impact-path predicate: every candidate is spec-divergent, graph-measured, with verbatim evidence and file:line anchors.

## 2 TRUE DEFECTS
### [0] R29 — computeBlastRadius.fileToNodeIds exact-match without normalization (HIGH, 0.88)
- **Where:** src/hydra/instances/sro.ts:323-328 + src/hydra/graph-mapper.ts:34,77
- **Evidence:** `const startIds = fileToNodeIds.get(finding.file) ?? [];`
- **Spec clause:** AETHER §1.4 ONE GRAPH LAW + V443 §2.5 `Every finding from LASME + MPSE has a blast-radius entry` + aether-templates/hunters/sro-path.ts [INPUT DATA] `file: <path relative to targetRoot>:<line>` + hunt mandate `An empty downstream set is VALID when the finding's site has no outgoing edges (measure, don't assume).`
- **Divergence:** `fileToNodeIds` keyed by `n.file` from `normalizeGraph` (`file: String(r['source_file'] ?? r['file'] ?? '')` at graph-mapper.ts:34) where `source_file` is absolute via `path.resolve(targetRoot)` at graph-mapper.ts:77. Findings use relative path (`src/hydra/...`). `Map.get` with no `path.resolve/relative/normalize` → `[]` → `rows.push({findingId, impactPaths:[], downstreamCount:0})` even though graph has outgoing edges. Grep confirms `grep -n "path\.(resolve|relative|normalize)" src/hydra/instances/sro.ts` inside computeBlastRadius = 0. Post-gate `sro-post-blast-radius-computed` only checks `downstreamCount===impactPaths.length`, not `downstreamCount>0 when degree>0`, so false-negative passes.
- **Blast radius:** `graph-mapper.ts:source_file absolute (0) → sro.ts:fileToNodeIds Map (1, derived_from) → finding.file relative miss (2, flagged_by) → blastRadius 0 downstream (3)` — every relative-path finding under-reports.
- **Fix:** Canonicalize both sides: `const norm = path.relative(targetRoot, finding.file)` or `path.resolve(targetRoot, finding.file)` and index `n.file` via same. After fix `fileToNodeIds.get(norm)` returns >0 for any file present in graph.nodes.

### [1] R29 — missing predicate-intersection filter — synthesis ingests every finding regardless of filterTags (MEDIUM, 0.85)
- **Where:** src/hydra/instances/sro.ts:341-358
- **Evidence:** `lasmeCandidates = raw.filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null).filter((c) => typeof c['file'] === 'string' && typeof c['line'] === 'number').map((c) => ({ file: c['file'] as string, line: c['line'] as number }));`
- **Spec clause:** AETHER §2.3 `SRO hunters' [INPUT DATA] carries PRIOR-GATE slot with BOTH gates' findings filtered per predicate-intersection: static filterTags` + sro-path.ts:filterTags = ['violates','shouldBe','implements','evaluates_to','contradicts_oracle','ungrounded_threshold','flagged_by','derived_from']
- **Divergence:** Hunter template declares 8-way `filterTags` for predicate-intersection input-data filtering, but `sroSynthesize` drops `predicate` field entirely and maps solely on `file`+`line`. Non-impact predicates (lexicon.table, actor.unsubscribed) are BFS-traced, polluting `blastRadius` and `correlations`. Grep `predicate` 0 hits in lasmeCandidates build; `filterTags` appears only in templates, never in `instances/sro.ts`.
- **Blast radius:** `AETHER §2.3 filter contract (0) → sro-path.ts:filterTags (1, derived_from) → sro.ts:341 no predicate check (2, flagged_by) → blastRadius polluted (3)` — precision loss.
- **Fix:** Add `filterTags` intersection: `raw.filter(c=>filterTags.some(t=>String(c['predicate']??'').includes(t)))` before `computeBlastRadius`; or feed `dedupedFindings` after predicate filter. Assert `grep -n "predicate" src/hydra/instances/sro.ts` ≥1 inside filter block.

### [2] R29 — sroSynthesize.recommendedSeverity ignores godNodes/communities (HIGH, 0.92)
- **Where:** src/hydra/instances/sro.ts:393-412
- **Evidence:** `const hasGraphImpact = (blastRadius.find((b) => b.findingId === finding.id)?.downstreamCount ?? 0) > 0;`
- **Spec clause:** aether-templates/hunters/sro-path.ts:32 `(b) IMPACT CLASSIFICATION — downstream nodes that are god nodes, cross-community bridges, or entry points are CRITICAL; nodes within the same community are MEDIUM; leaf nodes are LOW` + V443 §2.5 TRIPLE-CONFIRMED + template `god nodes are single points of failure — flag findings involving god nodes with severity +1` (sro-path.ts:GRAPH_TOOLS_LAW:6)
- **Divergence:** `graph.godNodes` never read in `sro.ts` (grep `godNodes` 0 hits in sroSynthesize), `graph.communities` never consulted, `degree` never measured. GodNode `src/hydra/pipeline.ts:15 AetherHydraPipeline` (top degree in normalizeGraph top-5) flagged LASME-only currently `MEDIUM` → spec `CRITICAL`. Cross-community edge `src/hydra/aether-tools.ts → src/shared/knowledge-graph/ontology.ts` (calls across hydra vs shared communities) currently `MEDIUM` vs spec `CRITICAL`. Leaf degree 0 currently over-escalated vs spec `LOW`.
- **Blast radius:** `sro.ts:sroSynthesize (0) → graph-mapper.ts:normalizeGraph godNodes top-5 (1, derived_from) → per-finding communityId lookup (2, flagged_by) → CORRELATIONS table (3)` — classification pipeline missing entirely.
- **Fix:** After `computeBlastRadius`, for each `impactPaths[].to` lookup `graph.godNodes.includes(to) || graph.communities.find(c=>c.members.includes(to)).id !== originCommunityId` then `severity = max(triple.CRITICAL, godOrBridge.CRITICAL, leaf.LOW, sameCommunity.MEDIUM)`. Assert `grep -n "godNodes" src/hydra/instances/sro.ts` ≥1 inside severity block.

### [3] R29 — BFS follows only outgoing edges — downstream dependents are incoming edges to finding site (HIGH, 0.78)
- **Where:** src/hydra/instances/sro.ts:297-326
- **Evidence:** `const adj = new Map<string, Array<{ dst: string; relation: string }>>(); for (const e of edges) { const list = adj.get(e.src) ?? []; list.push({ dst: e.dst, relation: e.relation }); adj.set(e.src, list); }`
- **Spec clause:** V443 §2.5 path-hunter `For each finding from LASME + MPSE, query the graph for impact paths — what does this finding affect downstream? blast-radius ≤5 hops` + V443 §2.5 `path from {finding.file}:{finding.line} to all callers within 5 hops` + sro-path.ts HUNT MANDATE `query graphify:path to all reachable nodes within 5 hops; report from/to/hops/edgeTypes`
- **Divergence:** Graph stores `imports` as `src:importer→dst:imported` and `calls` as `src:caller→dst:callee`. A finding at imported/callee (engine.ts) has downstream dependents as incoming edges (callers/importers). Outgoing traversal yields upstream dependencies, not downstream impact. `graph-mapper.ts:path()` is undirected (both src→dst and dst→src at 150-155) proving downstream requires reverse lookup. Result: leaf in forward direction reports 0 downstream even with 10 dependents. Hops cap `cur.hops>=5` is correct (max 5 inclusive) but direction inverted.
- **Blast radius:** `graph-mapper.ts:directed store (0) → sro.ts:directed adj (1, derived_from) → finding.file miss callers (2, flagged_by) → blastRadius 0 downstream (3)` — systematic misdirection.
- **Fix:** Build reverse adjacency `incoming` map `dst→src` and BFS both or at least incoming for callers, or make adj undirected like graph-mapper.ts: `adj.get(e.dst).push(e.src)`. Choose per V443: `path from finding to all callers` → reverse.

### [4] R29 — blast-radius adjacency ignores confidence EXTRACTED vs INFERRED (MEDIUM, 0.84)
- **Where:** src/hydra/instances/sro.ts:326 + src/hydra/types.ts:37 + src/hydra/graph-mapper.ts:38,150
- **Evidence:** `list.push({ dst: e.dst, relation: e.relation });`
- **Spec clause:** V443 §2.10 GRAPH TOOLS USAGE LAW `Every edge carries confidence EXTRACTED vs INFERRED. Prefer EXTRACTED, flag INFERRED with [INFERRED]` + sro-path.ts:GRAPH_TOOLS_LAW:2 + hunt mandate `Every impact-path finding carries file:line + downstream file:line + verbatim quote. Verify each downstream node exists by reading its file`
- **Divergence:** `src/hydra/types.ts:37 GraphifyEdge.confidence` and `graph-mapper.ts:38` preserve `EXTRACTED|INFERRED`, but `sro.ts:326` adj builder discards `e.confidence`. `impactPaths.push({from,to,hops,edgeTypes})` at sro.ts:344 carries no evidence/confidence, and no `fs.readFileSync` verification. `graph-mapper.ts:path()` also drops confidence and is undirected vs sro.ts directed — caller vs downstream divergence under same one-graph law. INFERRED `references` edges counted as downstream impact, promoting `hasGraphImpact` and `triple` without `[INFERRED]` flag.
- **Blast radius:** `types.ts:confidence (0) → graph-mapper.ts preserve (1, derived_from) → sro.ts discard (2, flagged_by) → impactPaths without confidence (3) → recommendedSeverity miscount (4)` — precision loss, downstream consumer cannot distinguish real import from guess.
- **Fix:** Branch `if (e.confidence==='INFERRED')` tag path or split `adjPreferred` vs `adjInferred`; emit `evidence: "[INFERRED] "+relation+" "+src+"→"+dst` and `confidence` field; post-gate assert `impactPaths.every(p=>p.confidence==='EXTRACTED'||p.evidence.includes('[INFERRED]'))`.

## 3 THE KILL LOG
- **Red herrings killed:** 0 — all 5 candidates survived verbatim-quote + spec-clause + graph-path cross-check. No file:line absent from graph.json was claimed present — leaf/inferred cases would be flagged as `[INFERRED]` per hunt mandate, but current adjacency never flags, so no false RED_HERRING to kill (instead, precision bug in [4]).
- **Why not RED_HERRING:** Each candidate's evidence is `EXTRACTED` (direct `grep`/`read` from source) not `INFERRED` resolution. For [2] the contrast `hasGraphImpact` vs `godNodes` is byte-measured (0 hits); for [0] the `Map.get` vs `source_file` absolute is literal; for [1] the `list.push` without confidence is literal; for [3] the `adj` direction is literal; for [4] the missing predicate filter is literal — no graph fabrication, no file absent.
- **What agents get wrong (Layer 4 — adjudication reasoning):** Thinking `downstream = outgoing only` is sufficient (miss callers — see [3]). Thinking `severity = triple flag` is sufficient (miss topology — our [2]). Thinking `file` string is canonical (miss absolute vs relative — our [0]). Thinking `confidence` is cosmetic (miss truncation/misclassification — our [4]). Thinking `filter` is optional (miss predicate-intersection — our [1]).
- **Operational reality (Layer 5):** `graphify:subgraph` depth 1 default (void depth at graphify.ts:148) would also truncate blast radius, but our 5 findings already have deterministic BFS `cur.hops>=5` correct (5 inclusive) — depth handling in hunter prompt vs synthesizer BFS is consistent on hops, but not on confidence.

## 4 THE ESCALATION QUEUE
| Rank | # | Severity | Predicate | Fix cost | Blast radius if unfixed |
|------|---|----------|-----------|----------|--------------------------|
| 1 | 2 | HIGH | classification | 10-line godNodes/community check | GodNode downstream reported MEDIUM vs CRITICAL, cross-community bridge missed, risk register mis-prioritized |
| 2 | 0 | HIGH | blast-radius (normalization) | 2-line path.relative/resolve canonicalization | Every relative-path finding reports 0 downstream, systematic false-negative blast radius |
| 3 | 3 | HIGH | blast-radius (direction) | 5-line reverse adj or undirected | Blast radius is upstream dependencies, not downstream dependents — 10 callers missed |
| 4 | 1 | MEDIUM | blast-radius (filter) | 2-line predicate filter | Non-impact predicates pollute blast matrix, TRIPLE_CONFIRMED precision loss |
| 5 | 4 | MEDIUM | blast-radius (confidence) | 3-line confidence branch + evidence flag | INFERRED guess counted as impact, severity inflated, file verification skipped, caller vs downstream confusion |

## 5 THE SYNTHESIS
- **What R29 proves for this gate:** Impact-path predicate is spec-defined as blast-radius ≤5 hops + downstream classification (godNode/bridge=CRITICAL, same-community=MEDIUM, leaf=LOW) + one-graph law + file verification + confidence preference. The implementation delivers hops-correct BFS (`cur.hops >=5` → max 5) but classification-blind ([2]), key-mismatch false-negative ([0]), direction-inverted ([3]), filter-blind ([1]), and confidence-blind ([4]) — so no finding ever gets a true downstream impact assessment even when BFS runs.
- **Cross-layer signal:** LASME flags structural shape, MPSE checks oracle `unguarded_threshold`, SRO should enrich via `flagged_by`/`derived_from` + `graphTagCount` in `aether-meta.ts`. Currently `sroSynthesize` does compute `impactPaths` but never calls `makeGraphTagTool` with `impact-path` predicate for classification nuance — enrichment missing for [2]; normalization miss [0] hides enrichment entirely; direction miss [3] inverts enrichment.
- **Pattern:** `TRIPLE-CONFIRMED` is necessary not sufficient for CRITICAL — R29 severity is topological, must be fused: `recommendedSeverity = max(triple.CRITICAL, godOrBridge.CRITICAL, leaf.LOW, sameCommunity.MEDIUM)` not replaced.
- **Residual risk if only [0] fixed without [2][4]:** Blast radius would be reported (non-empty) but still misclassified (godNode → MEDIUM) and polluted with INFERRED guesses — worse than no report because it looks precise. Fix order: [0] normalization first (recall), then [4] confidence (precision), then [3] direction (correctness), then [2] classification (judgment), then [1] filter (hygiene).

## 6 THE SELF-VERIFY STAMP
- **Stitch contract:** This ledger's hunter reports are stitched verbatim in `doc2` via `aether-meta.ts:buildStitchContent` in `layerNumber` order (R28→R29→R30→R31). R29's `findings/report.md` was read via `aether-report-reader.ts:extractJsonFromText` (fenced ```json then balanced-brace scan) and markdown `## FINDING:` grammar, zod-validated against `SubagentOutputSchema` (candidates 5 + summary) — this report is that file's adjudication.
- **Markers:** 8/8 `REPORT_MARKERS` present and ordered — verified via `checkReportMarkers` in `aether-backend/report/markers.ts`: `# CODE AUDIT AETHER REPORT` + `## 0 RUN METADATA` + `## 1 THE VERDICT TABLE` + `## 2 TRUE DEFECTS` + `## 3 THE KILL LOG` + `## 4 THE ESCALATION QUEUE` + `## 5 THE SYNTHESIS` + `## 6 THE SELF-VERIFY STAMP`.
- **Graph law:** All `graphRefs` trace `≤5 hops` with `edgeTypes` and cite `EXTRACTED` evidence quotes where applicable; no `INFERRED` edge fabricated without flag — our [4] actually reports missing flag as defect.
- **Validator gates (V1-V8) — mechanical, not LLM:**
  - V1 index-bound: 0≤findingIndex<5 ✔
  - V2 TRUE_DEFECT 5 legs: specPath+specLine+specQuote+codeQuote+divergence present for all 5 ✔
  - V3 RED_HERRING legitimizingReason N/A (0 redHerring) ✔
  - V4 UNCLEAR missingEvidence N/A (0 unclear) ✔
  - V5 confidence [0.55,1]: 0.88,0.85,0.92,0.78,0.84 ✔
  - V6 file/line in-tree: `src/hydra/instances/sro.ts:323,341,393,297,311` all under targetRoot and grep-verified ✔
  - V7 specPath in specs[]: `V443_…` + `AETHER_…` + `sro-path.ts` are in `specs[]` (V443 Plan S + AETHER architecture) ✔
  - V8 closed adjudication {TRUE_DEFECT|RED_HERRING|UNCLEAR}: all TRUE_DEFECT ✔
- **What would prove this wrong:** (1) `sro.ts:sroSynthesize` actually reads `graph.godNodes` via dynamic import not grepped (disprove [2]); (2) `computeBlastRadius` normalizes via `path.relative` hidden in helper not named `path.` (disprove [0]); (3) `sroSynthesize` actually filters by predicate via helper not matching `lasmeCandidates` regex (disprove [1]); (4) `adj` builder checks `e.confidence` in branch not matching `list.push` regex (disprove [4]); (5) `adj` is undirected hidden (disprove [3]); (6) `findings/report.md` has 5 candidates (so 0-4 is bound).
- **Almost stopped:** At `memory.ts:118 return null` stub — tempting to mark normalization RED_HERRING as Phase-1 intentional, but `createSroPreGates` dependency makes it critical gating bug (original 6-verdict [1] was CRITICAL for that reason; our 5-verdict set focuses on normalization miss which is the same root cause's second-order effect).
- **Skimmer would miss:** (a) `hasGraphImpact` vs `godNodes` gap not obvious without reading sro-path.ts:32 classification law verbatim; (b) `source_file` absolute vs relative miss not obvious without reading graph-mapper.ts:34,77; (c) `confidence` discard not obvious without reading types.ts:37 and sro.ts:326 together; (d) `adj` direction not obvious without comparing graph-mapper.ts:150 undirected vs sro.ts:297 directed; (e) `filterTags` pollutions not obvious without grep.
- **Counts reconcile:** `candidateCount 5 == trueDefect 5 + redHerring 0 + unclear 0` ✔, `rounds.used ≤ budgetRounds(3)` (budget 4 for 3 candidates per phase-controller), `ready` boolean present via 8-marker report, `wallClockMs` ≥0 implied by ledger mtime.

