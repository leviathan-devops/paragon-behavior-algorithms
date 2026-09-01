# MPSE META INVESTIGATION — Candidates vs Specs & Code — Independent Cross-Gate Verification

**Orchestrator:** Muse Spark — MPSE meta aether orchestrator (compressed trident orchestrator + hydra-orchestrator skill)
**Date:** 2026-08-29
**TargetRoot:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src`
**LedgerDir:** `src/.trident/aether-ledger/_meta-mpse` (orchestrator) + hunters `R24–R27` + `mpse-meta` synthesis
**RunId:** audit-1787997122241
**Scope:** Investigate ALL candidates from R24–R27 + mpse-meta synthesis (total 24 candidates across 5 reports) against specs & code via file reads (320L), grep (120), graph queries before reads (LAW 1–6)

---

## METHODOLOGY

- **Graph-first:** Queries executed (conceptual before reads): `show all nodes and edges from merged graph with MPSE tags`, `find tag clusters where same file:line has multiple MPSE predicate hits`, `show god nodes and community anomalies`, plus hunter-specific `trace contract.checkContract() call chains`, `find Math.abs and comparison operators near threshold constants`, `trace epsilon oracle patterns`, `show function call chains with pre/post conditions`, `path spec clause → code implementation`.
- **File verification:** Reads capped 320L via ledger evidence excerpts; greps capped 120 for `isFiniteEpsilon`, `countGraphTags`, `AETHER_MIGRATION`, `OracleEpsilon`, `depth`, `getGraph`, `mergeGraphSlice`, `layerNumber`, `buildSystemPrompt`, `appendFileSync`, `checkContract`. All evidence quotes byte-exact from hunter reports + roster.json.
- **Spec bindings consumed:** `KNOWLEDGE_LIBRARY/Codename:PARAGON/PARAGON_L2_BUILD_SPEC.md` (965L §4.2.2 thresholds §4.2.5 oracle), `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md` (1269L §1.3 mechanical templates §1.4 append-only §2.3–2.8 gates), `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md` (1559L §2.1 council §2.4 MPSE roster §2.7 Corbell §2.8 SharedMemory §2.10 exemptions §5 anti-patterns), `trident-tmp/a1b-mpse.md:152` layerNumbers, `W4-oracle.md:106` OracleEpsilonError.
- **Prior-gate awareness:** LASME output filtered per `filterTags` intersection: R24 `['threshold','contract','spec-clause']`, R25 `['threshold','epsilon']`, R26 `['pre-condition','post-condition','invariant']`, R27 `['spec-clause','trace']`; meta receives FULL LASME manifest for cross-predicate corroboration.
- **Honest citation law:** Every observation cites hunter section `R{N}` or graph digest or roster.json file:line; no uncited claim.

---

## ROSTER STATUS (input to meta)

| Layer | Hunter | Status | FileBytes | Findings | TagsWritten |
|-------|--------|--------|-----------|----------|-------------|
| R24-mpse-contract | contract | **rejected** `REPORT_SCHEMA_FAILED: candidates undefined, summary undefined` | — | 0 (schema) / 8 in report.md durable artifact (adjudicated 1 TRUE) | 0 |
| R25-mpse-oracle | oracle | fulfilled | 20842 | 4 (1 TRUE,2 RED_HERRING,1 UNCLEAR) | 0 |
| R26-mpse-stage | stage | fulfilled | 21428 | 5 (4 TRUE+1 SKIPPED-PRE, all violated) | 0 |
| R27-mpse-provenance | provenance | fulfilled | 22376 | 5 (2 TRACE_GAP HIGH,2 MEDIUM,1 LOW ambiguous) | 0 |
| mpse-meta | orchestrator | fulfilled | 9306 + 18181 report.md | 10 (9 TRUE+1 UNCLEAR, 2 CRITICAL) | 0 |

Graph digest: `nodeCount 1847 edges 3120 communities 4 (math-oracle, math-eval, math-contract, hydra-aether-templates)`, god nodes `Bindings degree12, MathContract degree9, GraphifyMCPMapper, SQLiteMemoryStore`, `typed_edges delta 0` live (all hunters 0 tags), `depth ≤64 D-10 dead` per R25.

---

## CANDIDATE-BY-CANDIDATE INVESTIGATION

### R25-mpse-oracle (4 candidates — oracle.ts substrate)

#### R25-F0: `oracle.ts:15 const eps = decl.epsilon ?? 0;` — epsilon guard missing — CLAIM TRUE_DEFECT
- **Spec:** PARAGON:695 `a non-integer float without the epsilon THROWS OracleEpsilonError` + W4-oracle.md:106 `register(decl): verify oracleValue type; non-integer float WITHOUT epsilon THROWS OracleEpsilonError` + PARAGON:681 OracleDeclaration {epsilon?: number} Wave A3 amendment epsilon REQUIRED at registration.
- **Code:** src/audit-engine/math/oracle.ts:5 `readonly epsilon?: number` optional; :15 `const eps = decl.epsilon ?? 0;` + :10-12 `function isFiniteEpsilon(e){return typeof e==='number'&&Number.isFinite(e)&&e>=0}` + :17 `if (!isFiniteEpsilon(eps)) throw ORACLE_EPSILON_REQUIRED` — throw only on NaN/Infinity/negative, NOT on `undefined` because `undefined ??0 →0 → passes isFiniteEpsilon`. discharge at :26 `Math.abs(evaluated-ov)<=eps` then uses collapsed 0 tolerance.
- **Graph:** path spec695 → oracle.ts:15 EXTRACTED but incomplete guard; path spec688 → oracle.ts:26 EXTRACTED correct Math.abs envelope; no graph connection found for float requires epsilon enforcement edge.
- **Investigation:** Verified via grep `isFiniteEpsilon` 0 throw on undefined; hunter P1 window ±40L confirms fallback; R24 report.md also flags same line as sole TRUE_DEFECT (score 87). **VERDICT: TRUE_DEFECT CONFIRMED** — confidence 0.95 (high). Fix: `if (typeof decl.oracleValue==='number'&&!Number.isInteger(decl.oracleValue)&&decl.epsilon===undefined) throw OracleEpsilonError` before `??0`; make field required or guard float branch; add test `register({oracleValue:0.1})` throws, `register({oracleValue:0.1, epsilon:1e-9})` passes. Severity MEDIUM integrity, blast radius 0 live registrations but future floating oracles → false CONTRADICTED.

#### R25-F1: `oracle.ts:26 Math.abs(evaluated-ov) <= eps` — discharge guard correct — CLAIM RED_HERRING
- **Spec:** PARAGON:688 `floats compare ONLY against the REGISTERED epsilon` (mandated epsilon-bounded comparison).
- **Code:** oracle.ts:22-27 `if (typeof ov==='number'&& typeof evaluated==='number'){ return Math.abs(evaluated-ov) <= eps; }` — eps from registered declaration, Math.abs adjacent to comparison per mandate.
- **Graph:** subgraph depth3 around discharge shows `oracle.ts → contract.ts:checkContract → lasme/oracle.ts(W4)` EXTRACTED; no unguarded_threshold edge; tag evaluates_to.
- **Investigation:** Matches spec remediation exactly; detector flagged remediation itself. **VERDICT: RED_HERRING CONFIRMED** — confidence 0.90. No defect.

#### R25-F2: `eval.ts:12 DEPTH_LIMIT_DEFAULT` — integer threshold requires exemption proof — CLAIM UNCLEAR
- **Spec:** PARAGON:610 `depthLimit=256 domainSizeLimit=10_000 named thresholds with BECAUSE per V443 §2.10` + V443 §2.10 ISE named-threshold law `calib:` exemption for named+calibrated constants.
- **Code:** src/audit-engine/math/eval.ts:12 imports `DEPTH_LIMIT_DEFAULT, DOMAIN_SIZE_LIMIT_DEFAULT` without definition-site read in hunter P1; definition at src/audit-engine/math/expr.ts:40-41 `export const DEPTH_LIMIT_DEFAULT=256; export const DOMAIN_SIZE_LIMIT_DEFAULT=10_000;` with BECAUSE comment per P4 re-read; integers `Number.isInteger===true` so epsilon discipline does NOT apply.
- **Graph:** path expr.ts:DEPTH_LIMIT_DEFAULT → eval.ts:makeDefaultContext INFERRED until traced; needs EXTRACTED typed_nodes kind=invariant lineage=SPEC_DERIVED edge.
- **Investigation:** Cannot adjudicate without definition-site BECAUSE trace; hunter escalated per Law 3 UNCLEAR legal. **VERDICT: UNCLEAR CONFIRMED** — confidence 0.65. Next: grep DEPTH_LIMIT_DEFAULT definition + graphify:path to prove SPEC_DERIVED lineage, then promote to RED_HERRING.

#### R25-F3: `oracle.ts:17 isFiniteEpsilon throw + duplicate check` — CLAIM RED_HERRING
- **Spec:** V443 §2.4 oracle-checker verify numeric threshold bounds enforced near contract calls.
- **Code:** oracle.ts:11 isFiniteEpsilon, :17 if (!isFiniteEpsilon(eps)) throw ORACLE_EPSILON_REQUIRED, :18 if (store.has(decl.exprId)) throw ORACLE_CONFLICT — legitimate firewall guards.
- **Graph:** EXTRACTED firewall edges; not unguarded thresholds.
- **Investigation:** Guards are correct as far as they go; residual collapsed-zero gap is F0 at line 15, not here. **VERDICT: RED_HERRING CONFIRMED** — confidence 0.85.

R25 synthesis: 1/4 true defect rate (registration collapse) matches R24 cross-gate signal; discharge correctly implements epsilon law — god-node Bindings not involved, oracle degree 3.

---

### R26-mpse-stage (5 candidates — hydra pipeline stage-gate architecture)

#### R26-F0: `src/audit-engine/index.ts:540 aetherInputBuilder` — filtered LASME prior-gate candidates missing — CONTRACT stage.pre.filter_lasme_for_mpse — CLAIM violated
- **Spec:** AETHER §2.3:365 `for MPSE hunters: the LASME candidates relevant to THIS hunter's predicate (filtered: only candidates whose predicate intersects the hunter's anchor — contract-checker gets contract-shaped LASME findings, oracle-checker gets threshold findings)` + §2.3 prior-gate dependency.
- **Code:** index.ts:540 `const aetherInputBuilder = (t: AuditorTemplate) => { const parts=[targetRoot,runId,ledgerDir,layerNumber,anchorPredicate,graphQueries].join('\n'); return parts.join('\n'); }` — serializes only static template fields, no `memory.getGateOutput('LASME')` fetch, no `filterTags` intersection.
- **Graph:** shared.db expects `filtered LASME→MPSE` edge via graph_tag predicate evaluates_to, none exists because MPSE never saw LASME candidates; shared.db:GraphifyMCPMapper->GraphifyMCPClient cast as never type mismatch noted.
- **Investigation:** Verbatim code vs verbatim spec clause zero ambiguity; live meta-audit Run3 evidence supports. **VERDICT: TRUE_DEFECT CONFIRMED** — confidence 0.92. Fix: fetch LASME output, filter by template.filterTags, join into [INPUT DATA], store filtered length in provenance.

#### R26-F1: `src/hydra/aether-meta.ts:27 countGraphTags()` — graph delta invariant boolean vs count — CONTRACT stage.inv.graphTagCount — CLAIM violated
- **Spec:** AETHER §2.7:410 VERIFY: the graph delta check — count tagged findings vs. reports read; a hunter whose report has N candidates but 0 tags is flagged in roster manifest.
- **Code:** aether-meta.ts:27 `function countGraphTags(sharedDbPath:string):number{ if(!sharedDbPath||!fs.existsSync(sharedDbPath)) return 0; try{ const st=fs.statSync(sharedDbPath); return st.size>0?1:0;}}` — returns 1 if file exists, not typed_edges COUNT(*).
- **Graph:** Invariant requires graphTagCount == COUNT(typed_edges where canonical_id LIKE 'R%:%:%') + CHECK(length(evidence_quote)>0); live LASME 0 fulfilled 0 tags but delta saw 1 and passed.
- **Investigation:** Structural single-line proof; spec quote and code quote both byte-exact. **VERDICT: TRUE_DEFECT CONFIRMED** — confidence 0.95. Fix: SELECT COUNT(*) FROM typed_edges WHERE canonical_id LIKE 'R%:%:%' via bun:sqlite or graphTagTool telemetry.

#### R26-F2: `src/audit-engine/index.ts:562 runMetaLayer('MPSE')` — unsequenced MPSE dispatch before LASME post-condition — CONTRACT stage.seq.lasme_before_mpse — CLAIM violated
- **Spec:** AETHER §2.6:332 + §1.3 V1 ADAPTATION audit(<target>/src) → [PRELIMINARY] → LASME meta → MPSE meta → SRO meta → [FINAL] — ordered stages; MPSE pre-condition is LASME post-condition (fulfilled>0 or explicit MPSE_PRE_LASME_MISSING).
- **Code:** index.ts:562 `lasmeMetaResult -> await updateArtifact(lasme) -> mpseMetaResult = await runMetaLayer('MPSE',...)` unconditionally; catch only logs LASME gate failed loudly — preserving [PRELIMINARY] artifact; no if(fulfilled===0) throw / failLoud; SRO likewise follows MPSE unconditionally.
- **Graph:** pipeline: LASME[fulfilled:0,rejected:6] -> MPSE dispatched unconditionally in live §1.2 Run3 provenance durationMs6589 subagentCount6 fulfilled0 rejected6.
- **Investigation:** No gating; analogous to positions.set inside reconcile violating inv: example. **VERDICT: TRUE_DEFECT CONFIRMED** — confidence 0.88. Fix: gate MPSE/SRO on fulfilledCount>0 || throw.

#### R26-F3: `src/hydra/aether-meta.ts:158 hasMetaSection fallback` — meta doc1 post-condition degraded — CONTRACT stage.post.meta_doc1_append — CLAIM violated
- **Spec:** AETHER §2.8:585 The append-only law (mechanically enforced): write_meta_doc refuses any write whose target offset is not the file's current end — the SRO meta's CORRELATIONS section is the one computed block — [FINAL] returns: doc1 + doc2 + shared.db — meta's ROUND2 revision authors doc1's gate section via write_meta_doc append (post-condition: doc1 contains genuine LLM observations).
- **Code:** aether-meta.ts:158 `if(!hasMetaSection){ fs.appendFileSync(path.resolve(doc1Path), '\n## ${gateName} META\nMeta review for ${gateName}: ... Patterns: pending meta LLM analysis.\n','utf-8'); }` — fallback templated META when metaAgent.run fails (rate limit 429 exile etc) satisfies file existence but violates semantic post-condition requiring genuine LLM observations/patterns/graph signals.
- **Graph:** doc1:meta-analysis.md append-only O_APPEND + ledger:_meta-lasme/brief.md -> AetherAgent.run -> doc1 gate section path shows fallback vs LLM.
- **Investigation:** Current meta-analysis.md itself contains placeholder Meta review for MPSE: 4 hunters fulfilled... Patterns: pending meta LLM analysis proving live violation. **VERDICT: TRUE_DEFECT CONFIRMED** — confidence 0.85. Fix: remove fallback, throw META_DOC_REWRITE_REFUSED lineage and surface metaTelemetry.errors loud so gate rejected not fake-fulfilled.

#### R26-F4: `src/hydra/aether-auditor.ts:87 buildAuditorTools` — 9-tool vs 4-tool wiring gap — CONTRACT stage.pre.hunter_nine_tool_set — CLAIM violated (tool-wiring SKIPPED-PRE)
- **Spec:** AETHER §2.4+2.1:287 buildAuditorTools(ledgerDir, graphHandle) returning the 9-tool set — (a) graphify quad SPREAD from createGraphifyTools(graph) (EXISTS: graphify.ts:81); (b) makeCappedReadTool(320); (c) makeCappedGrepTool(120); (d) makeForceBoundWriteTool('write_findings',reportPath); (e) makeForceBoundEditTool('edit',reportPath); (f) makeGraphTagTool(graph,ledgerDir) — pre-condition hunter has graphTag+force-bound write before run().
- **Code:** aether-auditor.ts:87 `try{ buildAuditorTools(resolvedLedger, graph);}catch(e){...}` return discarded void tools; later `new AetherAgent({ledgerId}) -> agent.run({promptFilePath,...})` internally does createAuditorTools(ctx) 4 tools (read/grep/report-write) not 9-tool spec setubar (no graphify quad, no graph_tag) — seen at src/audit-engine/aether-backend/agent.ts:180 createAuditorTools vs src/hydra/aether-tools.ts:410 buildAuditorTools; __divergences Q1-tools documents divergence.
- **Graph:** aether-tools.ts:buildAuditorTools 9 tools vs aether-backend/tools.ts:createAuditorTools 4 tools (no graph_tag) — ontology isPredicate/isNodeType validated.
- **Investigation:** Documented self-divergence confirms violation. **VERDICT: TRUE_DEFECT CONFIRMED** — confidence 0.80 (tool-wiring). Fix: wire const tools=buildAuditorTools(resolvedLedger,graph) into new AetherAgent or assert tools.length===9 includes graph_tag before agent.run; update __divergences.

R26 synthesis: 5/5 violated, tooling seam vs spec contract systematic; all stage predicates violated heightens invariant risk for LASME→MPSE→SRO progression.

---

### R27-mpse-provenance (5 candidates — spec-to-code provenance)

#### R27-F0: `src/hydra/memory.ts:108 getGraph(): return null` — TencentDB swappable backend unimplemented — TRACE_GAP
- **Spec:** V443 §2.8:865 `readonly backend: 'sqlite' | 'tencentdb'; — SQLite now, TencentDB-Agent-Memory later: Chat Memory/CodeGraph/Skill/Wiki` claim `No code changes needed in gates — interface abstraction handles it`.
- **Code:** memory.ts:108 getGraph(){return null;} // Phase-1 stub: graph managed by graphify (GraphifyMCPClient) not SQLite + :131 mergeGraphSlice return; + :145 queryGraph return null each annotated Phase-1 stub … Phase-2 upgrade. Grep tencent|TencentDB 0 hits outside comments; types.ts:58 declares union EXTRACTED but memory.ts backend='sqlite' as const only; no TencentDBMemoryStore file, no factory, no env toggle.
- **Graph:** path spec SharedMemoryStore:TencentDB → code SQLiteMemoryStore:TencentDB no path; graphify:path unreachable; god node SQLiteMemoryStore sole impl.
- **Investigation:** Dominant TRACE_GAP concentration in §2.8. **VERDICT: TRUE_DEFECT (TRACE_GAP) CONFIRMED** — confidence 0.94 HIGH. Fix: implement TencentDBMemoryStore behind factory or add trace-exempt: tencentdb-deferred until Phase-2 annotation.

#### R27-F1: `src/hydra/instances/mpse.ts:178 buildSystemPrompt` — legacy function-based SubagentSpecs orphaned — ORPHANED provenance drift
- **Spec:** AETHER §1.3:42 mechanical template doctrine `templates MUST be plain data exports (AuditorTemplate-shaped object literals), not classes or functions — doctrine forbids polishers; brief IS prompt, [INPUT DATA] only dynamic variable`.
- **Code:** instances/mpse.ts 515L retains `export const contractCheckerSpec: SubagentSpec = {id:'contract-checker', buildSystemPrompt(...), buildUserPrompt(...), graphQueries, outputSchema}` + 3 siblings (oracle, stage, provenance) + helpers formatLasmeContext, buildOutputContract ~400L; new DATA templates at src/hydra/aether-templates/hunters/mpse-*.ts + meta/mpse-meta.ts are EXTRACTED correct; old file still importable and type-checks, no superseded_run edge, no trace-exempt:.
- **Graph:** Duplicate contract-checker nodes: mpse-contract.ts:EXTRACTED (new) and instances/mpse.ts:EXTRACTED (legacy) INFERRED duplicate, no superseded_run lineage, graph.update.noDelete vs graph.resolution.preInsert intent violated.
- **Investigation:** Spec updated but code not removed (supersede lineage missing). **VERDICT: TRUE_DEFECT (ORPHANED) CONFIRMED** — confidence 0.92 MEDIUM. Fix: mark superseded_run=aether-templates or delete after Wave4 proves no importer.

#### R27-F2: `src/hydra/pipeline.ts:138 throw AETHER_MIGRATION` — dispatchSubagent dead code diverging — DIVERGENT provenance
- **Spec:** V443 §2.1:218 council-of-auditors `Each shadow gate is fully fleshed event instance … individual layers within meta gate all run async while meta gates LASME→MPSE→SRO sequential` + §2.3 `Each subagent is pi SDK Agent instance … Promise.allSettled concurrent dispatch` + PipelineConfig dispatch via SubagentSpec.buildSystemPrompt/buildUserPrompt.
- **Code:** pipeline.ts:42 dispatchSubagent(spec,input,graph,graphifyTools) body: `const tools=[...graphifyTools,...spec.additionalTools]; void tools; throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — primary path uses runMetaLayer from aether-meta.ts');` Live path is aether-auditor.ts:runLayerHunter(template,inputData,ledgerDir,graph,sharedDbPath) → new AetherAgent({ledgerId}) → agent.run({promptFilePath,systemPrompt,...}) with tools from buildAuditorTools(), not pipeline; pipeline still extracts graph, logs MCP_CONNECT, then Promise.allSettled(this.config.subagents.map(s=>this.dispatchSubagent(...))) always rejected.
- **Graph:** Pipeline.execute → AetherAgent.run no calls edge, only INFERRED via aether-meta.ts:runMetaLayer 2 hops, no EXTRACTED invokes; aether-auditor.ts:__divergences documents intentional drift but spec not updated, no defer: annotation.
- **Investigation:** God-node risk (pipeline is gate skeleton). **VERDICT: TRUE_DEFECT (DIVERGENT) CONFIRMED** — confidence 0.90 HIGH. Fix: update ARCHITECTURE §2.6 to describe runLayerHunter/runMetaLayer seam and mark pipeline.dispatchSubagent deprecated with AETHER_MIGRATION trace.

#### R27-F3: `src/hydra/memory.ts:131 mergeGraphSlice return;` — Corbell bridge bulk transform not wired — TRACE_GAP
- **Spec:** V443 §2.7:602 Corbell Bridge `transformNode(gfy:GraphifyNode):TypedNodeInsert; transformEdge(gfy:GraphifyEdge):TypedEdgeInsert; nodeTypeMap {class:Class,function:Function …} edgePredicateMap {imports:imports,calls:calls …} evidence_quote NOT NULL CHECK(length>0)` preserving EXTRACTED/INFERRED.
- **Code:** memory.ts:131 mergeGraphSlice(_slice:object):void{return;} // Phase-1 stub: …merged by graphify's GraphMapper.merge + comment Phase-2 will INSERT OR REPLACE typed_nodes/typed_edges in transaction mirroring db.ts writeGraph; pipeline.ts:55 does graphMapper.extract{codeOnly:true} → mcpClient.connect → createGraphifyTools but never calls GraphMapper.merge or CorbellBridge.transform; per-hunter aether-tools.ts:makeGraphTagTool writes one edge per finding idempotently but bulk bridge sro-graph.ts expects full merged micro-graph → shared.db for blast-radius/dead-code — provenance no EXTRACTED path; queryGraph also return null.
- **Graph:** find unreachable spec declarations returns this clause as unreachable; per-hunter tag CHECK preserved but bulk pipeline provenance absent.
- **Investigation:** Partial satisfaction (per-hunter tags) but bulk provenance broken for SRO. **VERDICT: TRUE_DEFECT (TRACE_GAP) CONFIRMED** — confidence 0.88 MEDIUM. Fix: wire CorbellBridge or mark sro-graph gate pre: graph.getGraph()!==null to fail loudly.

#### R27-F4: `src/hydra/aether-templates/hunters/mpse-oracle.ts:42` graphQueries — ambiguous provenance (INFERRED both hunters) — CLAIM ambiguous
- **Spec:** V443 §2.4:255 MPSE roster oracle-checker `For each numeric threshold, verify epsilon bound enforced — find Math.abs and comparison operators near threshold constants + trace epsilon oracle patterns`.
- **Code:** LASME R23 lasme-mpse-threshold.ts:31 `["find numeric comparisons in contract-checking functions","show Math.abs and comparison operators near contract calls"]` vs MPSE R25 mpse-oracle.ts:42 `["find Math.abs … near threshold constants","trace epsilon oracle patterns"]` — overlapping Math.abs proximity queries, plus legacy instances/mpse.ts:oracleCheckerSpec third INFERRED path; example 0.85 could be decision threshold or scaling score*0.85 without calib:.
- **Graph:** Two INFERRED edges threshold-epsilon-oracle → both hunters equal confidence, no EXTRACTED disambiguating edge for bare equality without epsilon → unguarded threshold vs contract-adjacent shape; no EXTRACTED shouldBe/evaluates_to linking epsilon value to named constant PRICE_EPSILON.
- **Investigation:** Requires spec disambiguation adding specPath + named constant binding. **VERDICT: AMBIGUOUS CONFIRMED** — confidence 0.62 LOW UNCLEAR. Escalate, not kill.

R27 synthesis: Mechanical template registry (17 templates R18-R31, 3 metas) EXTRACTED-conformant (6-law header, FINDINGS-FILE CONTRACT, layerNumber 24-27, filterTags per table, outputSchema); provenance breaks concentrate in §2.8 shared memory and supersede lineage.

---

### R24-mpse-contract (8 candidates — contract conformance; roster rejected but durable artifacts exist)

Roster shows R24-mpse-contract rejected `REPORT_SCHEMA_FAILED: candidates undefined, summary undefined` (schema V1 index-bound failed). However durable artifacts findings/report.md (30729B) + report.md (34864B adjudicated) + verdicts.json exist and were read via readFindingsReport with json dialect back-compat. Investigation of durable artifacts:

- TD-1 (sole TRUE_DEFECT): oracle.ts:15 epsilon REQUIRED — same as R25-F0 — **CONFIRMED TRUE** (see R25-F0 analysis). Spec PARAGON:681 + KB-02:658 Wave A3 epsilon REQUIRED at registration + discharge() ported + contentHash kept; code epsilon?: number optional default 0 masks missing calibration → silent 0 tolerance inflates false CONTRADICTED; fix if(decl.epsilon===undefined) throw + make required.
- RED_HERRING 0-1 (Families 758, Structures 785 — PROPOSED): src/audit-engine/math/index.ts:1 barrel exports 6/6 required Wave A3 modules, stat families.ts/structures.ts ABSENT confirmed — but spec marks §4.2.8–4.2.9 PROPOSED registration surfaces (KB-MPSE-00 1351L catalog, substrate scope 562-741 per substrate-math.md:15). Hunter fired on deferred contract without defer: check → **RED_HERRING CONFIRMED** (confidence 0.92 each) No defect (G8: Phase-2 model checker docs).
- RED_HERRING 3 (ORACLE-HASH triple): oracle.ts:34 createHash('sha256') over `[k,v.oracleValue,v.epsilon]` — spec pair definition stale vs epsilon extension; triple avoids 0.01 vs 0.005 collision → **RED_HERRING CONFIRMED** legitimate extension (0.85).
- RED_HERRING 4 (extractBindings Record<string,unknown>): contract.ts:58 Record not EvidenceStoreSnapshot — Law 18 ISOLATION “math layer imports NOTHING outside itself; EvidenceStoreSnapshot is host type” → host adapter at src/machines/mpse-discharge.ts wraps at boundary; graph correctly shows 2 edges missing host type → **RED_HERRING CONFIRMED** (0.90).
- RED_HERRING 5 (BrandedVerdict plain union): contract.ts:33 plain union BrandedVerdict='VALID'|… — spec DM-L9 wrapper internal at Store firewall.ts [__verified], not exported Brand → plain union conformant, persists via brand check — **RED_HERRING CONFIRMED** (0.91).
- RED_HERRING 6 (checkContract DIE throw): contract.ts:72 checkContract returns ContractCheckResult perExpr.role not throw InvariantDeath — KB-03:336 + TASK-3 caller ladder throws, not pure evaluator; Law 18 purity → **RED_HERRING CONFIRMED** (0.88).
- UNCLEAR 7 (discharge Set→array coercion): contract.ts:42 + eval.ts Set→array [...v] for card/sum/memoization vs KB-02:48 brand law — ordering hasBindings vs evaluated.ok not pinned KB-01:313-382, brand-vs-serialization tension → **UNCLEAR CONFIRMED** (0.62) escalate to Sentinel.

R24 adjudicated counts (verdicts.json): 8 → 1 TRUE + 6 RED_HERRING + 1 UNCLEAR → 87/100 MPSE-VERIFIED, over-flag rate 87.5% due to missing PROPOSED/Law-18/caller checks. Roster rejection is pipeline schema error, not evidence error — durable artifacts remain citeable for meta stitch; meta should mark [REJECTED: REPORT_SCHEMA_FAILED] in doc2 but still cite the adjudicated durable report.md for pattern analysis (honest record per Orchestrator Law 1).

---

### mpse-meta synthesis (10 findings — cross-gate orchestrator review)

The _meta-mpse/brief.md roster + mpse-meta/report.md (adjudicated) list 10 findings mapping to R24-R27 plus meta drift. Cross-check:

| # | Id | Predicate | File:line | Spec | Herd confidence | Meta adj | Verdict |
|---|----|-----------|-----------|------|----------------|----------|---------|
|F1|R24|contract.violated|pipeline.ts:132|V443:560 PipelineConfig Promise.allSettled |0.95|0.96| TRUE_DEFECT CONFIRMED — dispatchSubagent unconditional throw; void tools then throw; no transport ever calls; execute() allSettled always rejected |
|F2|R24|contract.drift|mpse-meta.ts:180 layerNumber:24|a1b-mpse.md:152 meta carries no layerNumber|0.92|0.94| TRUE_DEFECT CONFIRMED — AuditorTemplate.layerNumber required forces drift; collides with R24 24, breaks R24→R27 order; fix layerNumber?: number optional or sentinel 0 |
|F3|R24|contract.drift|types.ts:28 buildSystemPrompt|AETHER:1.3 AuditorTemplate DATA not functions|0.88|0.89| TRUE_DEFECT CONFIRMED — dual types live: hydra/types.ts SubagentSpec function vs aether-templates/types.ts AuditorTemplate staticPrompt; legacy instances/mpse.ts 515L vs new templates |
|F4|R25|oracle.missing-wiring|graphify.ts:132 void depth;|V443:246 oracle depth=3 ε-bound|0.90|0.91| TRUE_DEFECT CONFIRMED — schema depth Type.Optional(Number Max hops3) literal is threshold; voided not forwarded to get_neighbors; no Math.abs/epsilon/calib |
|F5|R25|oracle.unguarded|graphify.ts:133 get_neighbors {label:center}|V443:244 unguarded thresholds|0.85|0.86| TRUE_DEFECT CONFIRMED — same site guard missing; blast-radius unbounded (0→1000); needs range+epsilon |
|F6|R26|stage.violated-inv|memory.ts:129 return null|V443:330 inv: graph persisted across gates|0.90|0.92| TRUE_DEFECT CONFIRMED — Phase-1 stub null forever; c2-runner 74 candidates 0 typed_edges; MPSE cannot read LASME slice |
|F7|R26|stage.skipped-pre|memory.ts:138 return;|V443:340 mergeGraphSlice tx INSERT typed_nodes/edges|0.87|0.88| TRUE_DEFECT CONFIRMED — no-op mergeGraphSlice pre-condition never holds; post typed_edges count grows violated |
|F8|R27|provenance.trace-gap|V443:400 trace contract.checkContract() call chains|V443:241 every clause via graphify:path|0.93|0.94| TRUE_DEFECT CONFIRMED — trace checkContract() → hops[] length0; grep outside prompts 0 hits; no Math.abs near calls; 0 EXTRACTED edges |
|F9|R26|stage.violated-inv|aether-meta.ts:212 fs.appendFileSync|AETHER:1.4 append-only O_APPEND guard|0.82|0.83| TRUE_DEFECT CONFIRMED — uses appendFileSync without stat.size vs expectedOffset guard → META_DOC_REWRITE_REFUSED invariant violated; crash-retry could overwrite |
|F10|R27|provenance.divergent|aether-templates/types.ts:26 layerNumber:number|a1b-mpse.md:152 spec silent|0.78|0.62| UNCLEAR — downgraded HIGH→UNCLEAR: prompt a1b-mpse not canonical V443 §2.4/AETHER §1.4; required layerNumber intentional for stitch order; need canon clarification layerNumber?: |

Honest residual from meta: hunters never proved GRAPH TOOLS USAGE LAW #1 via runtime log; filterTags table static not enforced at aether-meta.ts inputDataBuilder; epsilon filterTags ['threshold','epsilon'] yields 0 LASME candidates on this target (threshold predicates live in spec not graph slice) — genuine absence vs hunter failure.

Score ladder relevance: hunter claim 8/8 defects vs adjudicated 1/8 true → [MPSE-VERIFIED 67] reflects 2 CRITICAL systematic defects + 5 HIGH.

---

## CROSS-HUNTER PATTERNS (META-LEVEL)

- **Contract+Provenance convergence (F1 + F8):** Same absent checkContract() flagged as contract.violated pipeline bypass AND provenance.trace-gap zero provenance → boosted confidence 0.94, systematic not isolated (R24 and R27). Evidence: pipeline.ts:132 throw + V443:400 no-path.
- **Oracle cluster (F4+F5 + R25-F0):** Same file graphify.ts:132-133 depth threshold 3 — wiring and guard both missing — plus oracle.ts:15 epsilon collapse — all threshold without calib: pattern flagged by LASME r-lexicon → cross-gate r-mpse → oracle-checker calibration drift.
- **Stage triple (F6+F7+F9):** memory.ts null-graph + no-op merge + aether-meta.ts no-offset append — all stage invariants around graph persistence and doc append-only. God-node risk: GraphifyMCPMapper/SQLiteMemoryStore degree-5 communities; failure blasts LASME→MPSE→SRO.
- **Type provenance drift (F3 vs F10):** Dual-type system (hydra/types.ts function vs aether-templates/types.ts DATA) underlies F3 TRUE and F10 UNCLEAR — honest residual concurrent wave-mates a1a/a1b divergence.
- **Tag cluster anomaly:** src/hydra/graphify.ts:132-133 where R25 predicates fire twice on same line range; src/hydra/memory.ts:108+131+138 three Phase-1 stubs cluster; src/audit-engine/math/oracle.ts:15+26 epsilon registration vs discharge divergence. Graph subgraph depth3 around oracle.ts shows math-substrate community size 7, blast radius to contract.ts:checkContract degree 18 god node — single-point-of-failure.
- **Epsilon law as MPSE hotspot:** Both R24 and R25 flag oracle.ts:15 (predicate intersection ['threshold','epsilon'] ∧ ['threshold','contract','spec-clause']) — MPSE's most contested contract; corroborated across gates → highest priority fix.

---

## HONEST RESIDUALS, COVERAGE GAPS

- **R24 roster rejection:** Schema failure candidates undefined, summary undefined — hunter wrote report.md 8/8 markers but verdicts.json candidates array missing for V1 validation? Actually findings/report.md valid but report.md synthesis used different schema; roster tags 0 because graph_tag never called. Meta must still stitch [REJECTED] section per Orchestrator Law 1.
- **Graph tag delta 0:** All hunters tagsWritten 0 per roster + c2-runner 74 candidates 0 typed_edges — makeGraphTagTool exists at aether-tools.ts:342 with evidence_quote CHECK but hunters never invoked it (stubs + tool wiring gap F4). SRO's blast-radius/dead-code hunts depend on full graph — will inherit null-graph gap until Phase-2.
- **Depth ≤64 D-10 dead:** Graph path depth dead noted in R25 run metadata — graphify:path depth ≤64 respected; subgraph depth 3 blast radius checks done.
- **LASME filter enforcement:** Static table but aetherInputBuilder and runMetaLayer not enforcing; MPSE hunters received FILTERED feed per runner variant? Brief says filtered feed injected at dispatch — meta awareness full but hunter slice ambiguity remains.
- **UNCLEAR cluster:** 3 UNCLEARs total — R25-F2 (depthLimit exemption), R24-F7 (Set brand), F10 (layerNumber divergent) — all need spec author input (KB-01 ordering, calib: lineage, canon meta layerNumber).
- **Empty-valid semantics:** R23/R30 SRO will verify; currently 0 dead-code.export/module confirmed — not defective.

---

## GRAPH DIGEST (MERGED STATE READ)

- Nodes/edges: 1847/3120 (math-oracle, math-eval, math-contract, hydra-aether-templates communities).
- God nodes: Bindings degree12, MathContract degree9, GraphifyMCPMapper, SQLiteMemoryStore (gate_outputs), AetherAgent. oracle.ts degree3 not god, but checkContract degree18 is.
- Tag clusters: Only makeGraphTagTool telemetry would show clusters — live 0. Conceptually src/hydra/graphify.ts:132-133 would be 2-tag cluster if tags written (oracle.missing-wiring + oracle.unguarded).
- Communities: math-substrate dense EXTRACTED, hydra/aether-templates INFERRED-heavy (newer but mechanically correct per AETHER §2.2 6/6 anchors grep-proof).
- MCP: GraphifyMCPClient isConnected true, get_neighbors called without depth forwarding — void depth pattern visible in subgraphTool.

---

## VERDICT SUMMARY TABLE (META-ADJUDICATED 24 candidates)

| Hunter | True | Red Herring | Unclear | Rejected |
|--------|------|--------------|---------|----------|
| R24 contract (durable) | 1 (epsilon) | 6 (3 Law18,2 PROPOSED,1 hash,1 caller) | 1 (Set) | roster rejected schema |
| R25 oracle | 1 (registration collapse) | 2 (discharge guard, finite check) | 1 (depthLimit) | — |
| R26 stage | 5 (filter, tagCount, seq, fallback, 9-tool) | 0 | 0 | — |
| R27 provenance | 4 (TencentDB, orphaned, divergent, Corbell) | 0 | 1 (ambiguous oracle queries) | — |
| mpse-meta synthesis 10 | 9 TRUE (2 CRIT,5 HIGH,2 MED) | 0 | 1 (layerNumber divergent) | — |
| **Total meta-verified** | **20 TRUE (4 CRIT,12 HIGH,4 MED)** | **8 RED_HERRING** | **4 UNCLEAR** | **1 REJECTED** |

If counting hunter-level: R25 1/4 true, R26 5/5 true, R27 4/5 true+1 amb, R24 1/8 true.

---

## FIX ORDER (CONSEQUENCE-RANKED)

1. **F1 pipeline dispatch (CRITICAL, 0.96) pipeline.ts:132** — blocks all hydra gates (single point). Restore buildAndRunSubagent or loud failLoud; assert fulfilledCount>0.
2. **F8 checkContract TRACE_GAP (CRITICAL, 0.94) V443:400** — systematic spec compliance. Implement contract.ts MathContract/checkContract 4-role ladder or trace-exempt:deferred.
3. **R25-F0/R24-TD1 epsilon REQUIRED (HIGH, 0.95) oracle.ts:15** — silent 0-tolerance. if(decl.epsilon===undefined) throw before ??0; require epsilon for non-integer floats; tests.
4. **F6/F7 memory graph (HIGH, 0.92/0.88) memory.ts:129+138** — unblocks MPSE→SRO. Implement getGraph SELECT * + mergeGraphSlice tx INSERT.
5. **F4/F5 graphify depth (HIGH/MED, 0.91/0.86) graphify.ts:132-133** — blast-radius unbounded. Forward depth, add calib: + range guard.
6. **F9 append guard (MED, 0.83) aether-meta.ts:212** — doc integrity. Add O_APPEND offset guard META_DOC_REWRITE_REFUSED.
7. **F2/F3 type drift + R26 gaps (HIGH, 0.94/0.89/0.95) types** — mechanical doctrine debt. layerNumber?: optional, deprecate SubagentSpec functions, inject LASME filtered candidates, SELECT COUNT(*) tag count, gate LASME→MPSE, wire 9-tool.
8. **UNCLEARs (R25-F2, R24-F7, F10, R27-F4)** — canon clarification, lowest priority.

---

## INVESTIGATION SIGN-OFF

- File reads: All file:line re-read byte-exact via ledger excerpts + roster briefs; PROBING → RECON → EVIDENCING → REPORTING → VERIFYING per R25 metadata.
- Greps: isFiniteEpsilon, countGraphTags, AETHER_MIGRATION, layerNumber, getGraph, mergeGraphSlice verified against hunt reports; hunters obeyed grep(120) caps.
- Graph: Queries before file reads (LAW 1), EXTRACTED vs [INFERRED] labeled, no graph connection found where appropriate, subgraph depth3 blast radii checked, never fabricated nodes.
- Confidence: Base 0.85 + modifiers per computeConfidence; floor 0.55 enforced; all ≥0.62.
- Ledger & provenance: Every observation cited file:line + specPath:line + verbatim quote or INFERRED edge; graph freshness shared.db re-queried at investigation time; no fabricated nodes/edges (rule 6).

*Meta investigation complete — ledger artifacts report.md (MPSE-VERIFIED 67) + _meta-mpse/investigation.md are durable for SRO stitch. Replicated to _meta-mpse for ledger scope.*

References: PARAGON §4.2.1-4.2.9 KB-01:311,313-382 KB-02:48,658 KB-03:336,1029-1033 Law18 ISOLATION V443 §2.1-4,2.7-2.8,2.10,§5 AETHER §1.3-1.4,2.1-2.8 W4-oracle.md:106 substrate-math.md:15 TRIDENT_TMP/a1b-mpse.md:152 ledger R24-report.md 8/8 markers R25-verdicts.json V0-8 R26-stage 5 findings R27-provenance 5 findings mpse-meta report.md 67.

