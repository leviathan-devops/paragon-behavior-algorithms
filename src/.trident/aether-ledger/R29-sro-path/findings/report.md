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
