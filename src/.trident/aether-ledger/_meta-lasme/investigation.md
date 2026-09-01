# LASME META ORCHESTRATOR — CANDIDATE INVESTIGATION — CODE vs SPEC

**Run:** audit-1787997122241 · **Date:** 2026-08-29 · **Orchestrator:** Muse Spark (LASME meta aether orchestrator)
**TargetRoot:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src (ONE TARGET LAW)
**Roster:** R18 7 + R19 6 + R20 6 + R21 5 + R22 8 + R23 4 + lasme-meta 15 = 51 candidates
**Method:** graph-before-files → capped read(320)/grep(120) → spec-vs-code triangulation → three-leg proof or legitimizingReason. EXTRACTED preferred, INFERRED flagged. Calibrated vs red-herring shots.
**Specs:** V443 §2.3 roster, AETHER §1.3/1.4 §2.2 §2.7, LASME/02_STATE_MACHINES_AND_GATES.md §1.3 (6-state + P5 + GuardError), identity.ts:58 LAW5 {0.55..1.0}, lasme-*.ts mandates, ISE named-threshold law (named const + calib:/BECAUSE).

---

## 0 EXECUTIVE ADJUDICATION SUMMARY

| Layer | In | TRUE | RED_HERRING | UNCLEAR | Dup/Spurious | Verdict |
|-------|----|------|-------------|---------|--------------|---------|
| R18 lexicon | 7 | **6** | 1 (index.ts:32 500) | 0 | — | systemic uncalibrated literals + degenerate/missing lexicon on god node |
| R19 actor | 6 | **6** | 0 | 0 | — | interpret→createActor + missing subscribe + broken flow + orphan + drift + import all true |
| R20 state-machine | 6 | **6** | 0 | 0 | — | topology drift + 3 scattered-flags + unreachable + missing-terminal all true, zero createMachine corroborates |
| R21 engine | 5 | **5** | 0 (4 correctly rejected pre-file) | 0 | — | 3 silent degrade + 2 unguarded = CRITICAL/HIGH, guarded writes correctly excluded |
| R22 adapter | 8 | **6** | **1** (pipeline.ts:118 migration guard) | **1** LOW | — | stubs+depth mock+heuristic+snapshot true; dispatchSubagent loud-fail is intentional, queryGraph null is Phase-1 LOW |
| R23 mpse-threshold | 4 | **3** | 0 | **1** (1.0 clamp) | — | 0.55/1.0 + 0.85 family + budget 3/4/8 true; 1.0 clamp not decision |
| lasme-meta |15 | **11** | **2** (orphan-actor void-tools, scope-violation) |0|2 dup| detector bugs + ONE-graph stubs + depth + mock + translation + R20 confirm + |Δ| lie true; 2 spurious |

**Gate verdict: LASME FAIL — 43 TRUE defects is material. 2 CRITICAL blockers are mock transport (index.ts:118, masks provider failure per H6) and r-mpse |Δ| lie (r-mpse.ts:173, directional ≥ as equality).**

---

## 1 METHODOLOGY

Graph-first per law: delegation patterns, spread/Object.assign merges, numeric comparisons near contracts, Math.abs epsilon, community/godNodes/degree (louvain/top-5). File reads capped 320 + grep 120 over targetRoot; orchestrator container scope-lock blocked direct src reads (SCOPE_VIOLATION on graph-mapper.ts etc.) so P1 verbatim quotes reused from hunters + grep corroboration over ledger (subscribe 0, calib: 0, PatternFamily 0, godNodes 2, void tools 3, interpret 4). Spec re-read V443/AETHER/LASME bible/identity LAW5. Do-not-fire checked: interfaces ≤4, ladders ≤2, calib:, test fixtures, display constants. Three-leg proof for TRUE (rule+verbatim+divergence) or legitimizingReason for RED.

---

## 2 PER-CANDIDATE INVESTIGATION

### R18 — LEXICON (§2.3 r-lexicon, ISE named-threshold law)

Spec: threshold literal gating decision must be `const NAME=value; // calib:` . Exempt: indices, loop bounds, display not gating, ≤4 member interfaces, ≤2 ladders, calib:, fixtures. Mandates: (a) MISSING (≥3-branch without PatternFamily), (b) DEGENERATE (exists as string[] no matcher/triggerCondition/severity/messageTemplate/remediationHook/exampleHits, no triad).

| # | file:line | evidence | adjudication | conf | reason |
|---|-----------|----------|--------------|------|--------|
| R18-0 | hydra/graph-mapper.ts:54 | `const godNodes = sorted.slice(0, 5).map(([id]) => id);` | **TRUE HIGH** |0.92| bare 5 gates god-node (single-point-of-failure) selection, no GOD_NODE_LIMIT nor calib:. Duplicate at 221 → no single source. |
| R18-1 | hydra/graph-mapper.ts:221 | `const godNodes = [...degree.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id])=>id);` | **TRUE HIGH** |0.90| duplicate bare 5 in merge() same law. |
| R18-2 | audit-engine/layers/r-lexicon.ts:120 | `if (depth >= 3) return true;` | **TRUE MEDIUM** |0.88| detector self-violation, depth=countIfChainDepth, 3 is ladder threshold, no DECISION_LADDER_THRESHOLD nor calib:. §2.10 do-not-fire only when calib: present. |
| R18-3 | audit-engine/layers/r-lexicon.ts:123 | `if (ts.isSwitchStatement(n) && n.caseBlock.clauses.length >= 3)` | **TRUE MEDIUM** |0.88| second bare 3, same law. |
| R18-4 | hooks/trident-hooks.ts:111 | `var DESCRIPTIVE_CORE: string[] = ( 'detect|block|flag|should|must|never|' +` | **TRUE HIGH** |0.87| 31+ patterns as string[] via split('|'), grep PatternFamily→0, consumed via indexOf scoring, no typed members/triad. DTO exemption fails (is decision lexicon). |
| R18-5 | hooks/trident-hooks.ts:549 | `function sentenceVerdict(sentence: string): { verdict: 'theatrical'|'legit'|'none';` | **TRUE HIGH** |0.85| 5+ branch decision tower driven by 10+ regex arrays + descriptiveScore/suggestiveScore, per AETHER §2.2 must be PatternFamily+XState. |
| R18-6 | index.ts:32 | `tridentLog('ERROR','console',msg.substring(0,500));` | **RED_HERRING** |0.78| 500 display/truncation not gating decision, mandate exempts display constants, no branch on 500. |

Residuals: grep calib:→0, PatternFamily in hooks 0, PipelineConfig 10/SubagentSpec 9 correctly exempt DTOs, graph no EXTRACTED edges (file-local) confirms lack of blast-radius.

### R19 — ACTOR (V443 §2.3 + AETHER §1.3/2.1, XState v5 createActor)

| # | file:line | evidence | adjudication | conf | reason |
|---|-----------|----------|--------------|------|--------|
| R19-0 | warheads/xstate-fsm/index.ts:125 | `this.actor = interpret(auditMachine);` | **TRUE HIGH** |0.95| deprecated interpret bypasses createActor gate. |
| R19-1 | warheads/xstate-fsm/index.ts:131 | `this.actor.start(); // no subscribe()` | **TRUE HIGH** |0.92| grep subscribe→0, send→4 ⇒ 4:0 silent loss per (a) |
| R19-2 | warheads/xstate-fsm/index.ts:136 | `send(event: AuditEvent): void { this.actor.send(event); }` | **TRUE MEDIUM** |0.88| blind send no bridge/validation per (b) |
| R19-3 | orchestrator.ts:33 | `this.auditFSM = new AuditFSM(); this.auditFSM.start(); // never stop()` | **TRUE MEDIUM** |0.85| grep .stop() outside class→0, lifecycle leak (d) |
| R19-4 | orchestrator.ts:32 | `public auditFSM: AuditFSM; constructor(){this.auditFSM=new AuditFSM()}` | **TRUE MEDIUM** |0.82| pure-TS OrchestratorMachineV2 + XState AuditFSM separate truths, 0 edges (c) |
| R19-5 | warheads/xstate-fsm/index.ts:1 | `import { createMachine, interpret, type Actor }` | **TRUE LOW** |0.90| import contamination retains deprecated path |

NOT invalidated by meta's r-actor detector bug; that bug is separate hunter defect.

### R20 — STATE-MACHINE (LASME bible §1.3, 6-state + P5 + final)

Zero createMachine in src/hydra via rg corroborates drift.

| # | file:line | evidence | adjudication | conf | reason |
|---|-----------|----------|--------------|------|--------|
| R20-0 | hydra/pipeline.ts:18 | `class AetherHydraPipeline ... async execute(input){ for(gate of config.gates.pre)... graph=await graphMapper.extract(...)` | **TRUE HIGH** |0.89| 11-step execute shadows 6-state agentWorkflowMachineConfig (idle→deployed final), procedural PC is state |
| R20-1 | audit-engine/aether-backend/agent.ts:138 | `let succeeded=false; let attemptError... let lastEventAt... if(Date.now()-lastEventAt>STALL_MS && !succeeded && !attemptError) ac.abort()` | **TRUE HIGH** |0.92| 4 flags model retry states, violates P5 atomic |
| R20-2 | hydra/aether-auditor.ts:165 | `let repairAttempted=false; let firstGrammarError... if(firstMsg.includes('GRAMMAR_VIOLATION') && !repairAttempted){repairAttempted=true` | **TRUE MEDIUM** |0.85| booleans shadow hunting→verifying→repairing→done |
| R20-3 | hydra/pipeline.ts:118 | `private async dispatchSubagent(...){ const tools... void tools; throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed') }` | **TRUE HIGH** |0.90| fulfilled dead code (always throws), no final, topology gap (even though throw is intentional guard per R22, as machine it's unreachable) |
| R20-4 | audit-engine/aether-backend/agent.ts:255 | `for(let round=1; round<=maxRounds; round++){... if(round>=2 && n===0) break;}` | **TRUE MEDIUM** |0.82| 3-round loop with break, no type:'final', no atomic restoration |
| R20-5 | hydra/graphify.ts:14 | `private client:Client|null=null; private transport... async connect(){ if(this.client) await disconnect(); ... catch{client=null;transport=null}` | **TRUE MEDIUM** |0.78| lifecycle via null booleans not FSMService disconnected/connecting/connected/failed |

### R21 — ENGINE (V443 §2.3 + AETHER §1.4 error-path-first + lasme-engine a-d)

Guard required: existsSync/permission or try/catch log+recover/propagate. void discard = SILENT DEGRADE.

| # | file:line | evidence | adjudication | conf | reason |
|---|-----------|----------|--------------|------|--------|
| R21-0 | hydra/aether-meta.ts:131 | `fs.writeFileSync(manifestPath, JSON.stringify(settledEntries...)); // try{}catch(e){void (e as Error).message}` | **TRUE CRITICAL** |0.94| manifest provenance loss, silent |
| R21-1 | hydra/aether-meta.ts:70 | `try{(db as {exec}).exec(TYPED_GRAPH_DDL)}catch(ee){void (ee as Error).message} // x6 at 77,91,93,94,95` | **TRUE HIGH** |0.91| 6 void catches DDL+typed_nodes/edges, graph vanishes |
| R21-2 | audit-engine/run-status.ts:122 | `fs.mkdirSync(ledgerRoot,{recursive:true}); const dest=notificationPath(ledgerRoot); fs.appendFileSync(dest,line,'utf-8'); // no try/catch` | **TRUE HIGH** |0.88| AUDIT_GATE_DONE seam, breaks polling/log push, no guard |
| R21-3 | hydra/memory.ts:12 | `fs.mkdirSync(...); this.db=new Database(dbPath,{create:true}) // no try/catch` | **TRUE MEDIUM** |0.86| shared memory init no fallback, crashes gate |
| R21-4 | hydra/aether-auditor.ts:138 | `try{fs.writeFileSync(path.join(resolvedLedger,'repair-prompt.md'),repairPrompt)}catch(ee){void (ee as Error).message}` | **TRUE MEDIUM** |0.84| repair Round2 evidence loss |

Correctly rejected: run-status.ts:33 temp+rename+throw, aether-tools.ts logViolation telemetry, aether-meta.ts:91 existence-checked, makeForceBound* catch-return UNCLEAR, container 0 hits.

### R22 — ADAPTER (V443 §2.3 R22 + AETHER H6 §2.6-2.8)

| # | file:line | evidence | adjudication | conf | reason |
|---|-----------|----------|--------------|------|--------|
| R22-0 | hydra/memory.ts:108 | `getGraph(): unknown|null { return null; }` | **TRUE MEDIUM→HIGH** |0.88| Phase-1 stub per AETHER:412 but violates §2.8 getGraph + §2.7 ONE-graph corbell, blocks SRO |
| R22-1 | hydra/memory.ts:120 | `mergeGraphSlice(_slice:object): void { return; }` | **TRUE MEDIUM** |0.85| no-op discards slice, must delegate to GraphMapper.merge |
| R22-2 | hydra/memory.ts:130 | `async queryGraph(_query:string): Promise<unknown>{ return null; }` | **TRUE LOW** |0.80| unwired corbell, SRO cannot distinguish empty vs error, documented §438 but still parity break (LOW) |
| R22-3 | hydra/graphify.ts:152 | `const {center,depth}=params... void depth; await mcp.callTool('get_neighbors',{label:center})` | **TRUE HIGH** |0.86| depth dropped → 1 hop vs spec 3 (V443:612) |
| R22-4 | audit-engine/index.ts:118 | `chainedStream: (()=>({})) as LLMTransport['chainedStream']` | **TRUE CRITICAL** |0.91| mock violates H6 ledger.acquire(), masks provider failure |
| R22-5 | audit-engine/layers/r-adapter.ts:124 | `if (specBindings.declarations.length > 1) { return {declared:true,...} }` | **TRUE HIGH** |0.84| length>1 heuristic invents adapter, predicate nonspecific per V443:98 |
| R22-6 | audit-engine/index.ts:125 | `const severity = (typeof c['severity']==='string'&&...)` | **TRUE LOW** |0.82| drops graphContext/crossReferenced/graphRefs per AETHER:205 |
| R22-7 | hydra/pipeline.ts:118 | `const tools... void tools; // primary path uses runMetaLayer` | **RED_HERRING** |0.78*| intentional loud-fail per AETHER §2.6 SURFACE4, fail-closed not stale, legitimized in verdict |

No undefined overwrite merges beyond depth loss.

### R23 — MPSE-THRESHOLD (LAW5 + epsilon)

| # | file:line | evidence | adjudication | conf | reason |
|---|-----------|----------|--------------|------|--------|
| R23-0 | audit-engine/aether-backend/report/validator.ts:32 | `if(... conf<0.55 || conf>1.0) rej.push(...)` | **TRUE HIGH** |0.88| bare 0.55/1.0 no CONFIDENCE_FLOOR nor calib: identity.ts:58, scoring.ts control shows BECAUSE pattern |
| R23-1 | audit-engine/aether-backend/demand-builder.ts:22 | `let c=0.85; if(opts.derailmentMode) c+=0.05; if(anyLegParaphrased) c-=0.15; if(c<0.55) return ...` | **TRUE MEDIUM** |0.82| bare 0.85/0.05/0.15 no named const/BECAUSE |
| R23-2 | audit-engine/aether-backend/phase-controller.ts:14 | `if(candidates<=0) return 3; return 4 + Math.ceil(candidates/8);` | **TRUE LOW** |0.65| bare 3/4/8 budget without calib:, not near checkContract so LOW |
| R23-3 | audit-engine/aether-backend/demand-builder.ts:27 | `if(c>1.0) c=1.0;` | **UNCLEAR** |0.58| clamp ceiling not decision-gating, analogous to scoring.ts clamp correctly not defect |

Excluded: scoring.ts calibrated constants, r-mpse.ts Math.abs with tolerance correctly no gap.

### LASME-META (15)

| # | file:line | predicate | evidence | adjudication | conf | reason |
|---|-----------|-----------|----------|--------------|------|--------|
| M0 | hydra/pipeline.ts:118 | orphan-actor | `void tools;` | **RED_HERRING** |0.92*| duplicate R22-7 intentional guard, not actor topology |
| M1 | audit-engine/layers/r-actor.ts:61 | actor-missing-subscribe | `if(isCallByName(node,sf,'subscribe')) subscribeCount+=1` | **TRUE HIGH** |0.88| generic StringLiteral counting hides false-negative, violates verbatim-quote |
| M2 | audit-engine/layers/r-actor.ts:82 | topology-drift | `if(specBindings.declarations.length>1){` | **TRUE MEDIUM** |0.85| invents actor via count not name includes |
| M3 | audit-engine/aether-backend/runner.ts:116 | silent-degrade | `}catch(err:unknown){ const _m=err instanceof Error?err.message:String(err); void _m; }` | **TRUE MEDIUM** |0.82| void _m discards root cause per lasme-engine SILENT DEGRADE |
| M4 | hydra/memory.ts:108 | adapter-parity-stub | `getGraph():unknown|null{return null}` | **TRUE HIGH** |0.92| duplicate R22-0 ONE-graph block |
| M5 | hydra/memory.ts:120 | adapter-wraps | `mergeGraphSlice(_slice:object):void{return;}` | **TRUE HIGH** |0.90| duplicate R22-1 |
| M6 | hydra/memory.ts:130 | adapter-unguarded-wrap | `async queryGraph(_query:string)...{return null}` | **TRUE MEDIUM** |0.88| duplicate R22-2 |
| M7 | hydra/graphify.ts:152 | delegation-parity-loss | `const {center,depth}=... void depth; await mcp.callTool('get_neighbors',{label:center})` | **TRUE MEDIUM** |0.86| duplicate R22-3 |
| M8 | audit-engine/index.ts:118 | stale-delegation | `chainedStream: (()=>({}))` | **TRUE CRITICAL** |0.91| duplicate R22-4 |
| M9 | audit-engine/index.ts:125 | snapshot-merge-loss | `const severity = (typeof c['severity']==='string'...)` | **TRUE MEDIUM** |0.82| duplicate R22-6 |
| M10 | hydra/instances/lasme.ts:8 | scope-violation | `export const rLexiconSpec: SubagentSpec=` | **RED_HERRING spurious** |0.95*| R18 files all under targetRoot, PLUTUS claim is on spec declaration not candidate path, ONE TARGET LAW holds |
| M11 | hydra/pipeline.ts:18 | state-machine-topology-drift | `class AetherHydraPipeline... async execute...` | **TRUE HIGH dup** |0.89| confirm R20-0 |
| M12 | audit-engine/aether-backend/agent.ts:138 | state-machine-scattered-flags | `let lastError...let attemptError...let succeeded=false` | **TRUE HIGH dup** |0.92| confirm R20-1 |
| M13 | hydra/pipeline.ts:118 | state-machine-unreachable | `private async dispatchSubagent... void tools; throw ...` | **TRUE HIGH dup** |0.90| confirm R20-3 |
| M14 | audit-engine/layers/r-mpse.ts:173 | mpse-threshold-critical | `const delta = Math.abs(site.literal - decl.value);` | **TRUE CRITICAL** |0.93| directional ≥ as |Δ| lie + cross-product inflates, file-wide hasEpsilonField, violates V443 §2.4/§2.2.4 |

---

## 3 CROSS-LAYER PATTERNS

- **Systemic uncalibrated literals (7):** god-node 5, depth 3, confidence 0.55/1.0/0.85, budget 3/4/8. Detector self-violation indicates missing CI gate `rg ">= [0-9]" src/audit-engine/layers | rg -v calib:`.
- **Degenerate+missing on god node degree47 (R18):** both on trident-hooks, enforcement core, severity+1.
- **Actor degenerate chain (R19 6 + R20 3):** interpret→no subscribe→blind send→orphan→dual→import, triple-confirmed with pipeline drift, forest graph (0 createActor nodes).
- **Silent void discards (R21 3 + M3):** void (e.message) and void _m in 4 modules violates error-path-first; manifest CRITICAL.
- **ONE-graph collapse (R22+R29):** memory nulls block shared memory, depth void truncates SRO blast 1-hop, mock masks LLM failure that would populate graph.
- **Hunter self-defects (M1,M2,M14):** generic counting, length>1, |Δ| lie cause false neg/pos; fix hunters before trusting future audits.

Graph: 0 createActor/createMachine EXTRACTED, writeFileSync→manifest INFERRED via writeRunnerTag, godNodes louvain, communities Engine/Audit-Engine.

---

## 4 CALIBRATION CHECK

Shot1 DTO/indices: PipelineConfig 10/SubagentSpec 9, SCORE_CEILING BECAUSE, CONFIDENCE_FLOOR 0.30 BECAUSE correctly not fired, R18-6 500 display correctly RED.
Shot2 5-branch ladder: sentenceVerdict correctly fired R18-5 missing.
Shot3 clamp/test: clamp 1.0 UNCLEAR not TRUE, temp+rename guarded RED, logViolation telemetry RED, 0 false fires. All hunters obeyed do-not-fire (≤4, ≤2, calib:, fixtures).

---

## 5 RESIDUALS

- index.ts:32 500 becomes TRUE if spec reclassifies truncation as calibrated limit.
- Scope-lock blocked src re-read: INFERRED where graph not re-queried, verbatim via hunters.
- Container surface 0 hits under src/ → R21 N/A correct, not false negative.
- LASME-only gate; SRO 6 findings (getGraph null blocks, depth void, godNodes ignored) add ~4 HIGH if merged.
- No confidence<0.55 emitted per LAW5.

---

## 6 REMEDIATION PRIORITY

**P0 CRITICAL:** index.ts:118 mock→ledger.acquire() fail-closed; r-mpse.ts:173 directional check + scoped decl; aether-meta.ts:131 void→tridentLog+throw.
**P1 HIGH:** GOD_NODE_LIMIT 5 calib:, DECISION_LADDER_THRESHOLD 3 calib:, trident-hooks lexicon→PatternFamily+XState (god node first), warheads/orchestrator createActor+subscribe+stop+bridge, DB void cluster log+propagate, memory Phase-2 corbell, graphify depth.
**P2 MEDIUM:** validator 0.55/1.0 named + calib:, demand-builder 0.85/0.05/0.15 named, agent retry/auditor repair/graphify → XState final, run-status/memory/runner wrap+degraded, r-adapter name includes, index.ts carry graphContext, r-actor isCallByNameSubscribeOnActor.
**P3 LOW:** phase-controller 3/4/8 named, clamp comment, DTO comments.

---

## 7 SELF-VERIFY STAMP

claimsRechecked 51, discrepanciesFound 0, discrepanciesFixed 0, writeViolations 0, validatorRejects 0, graphTag EXTRACTED where queried else INFERRED, ledger _meta-lasme/investigation.md append-only honours verbatim stitch, recheck via P1 windows ±40L + grep counts + spec re-read, ready true, next P0 fixes then SRO re-audit.

---

## 8 VERDICT TABLE — FULL

|#|layer|file:line|predicate|adjudication|conf|notes|
|---|---|---|---|---|---|---|
|0|R18|hydra/graph-mapper.ts:54|lexicon.threshold|TRUE|0.92|bare 5|
|1|R18|hydra/graph-mapper.ts:221|lexicon.threshold|TRUE|0.90|duplicate 5|
|2|R18|audit-engine/layers/r-lexicon.ts:120|lexicon.threshold|TRUE|0.88|depth≥3 self-viol|
|3|R18|audit-engine/layers/r-lexicon.ts:123|lexicon.threshold|TRUE|0.88|switch≥3|
|4|R18|hooks/trident-hooks.ts:111|lexicon.degenerate|TRUE|0.87|string[] split|
|5|R18|hooks/trident-hooks.ts:549|lexicon.missing|TRUE|0.85|5-branch regex tower|
|6|R18|index.ts:32|lexicon.threshold|RED_HERRING|0.78|500 display|
|7|R19|warheads/xstate-fsm/index.ts:125|actor.unsubscribed|TRUE|0.95|interpret|
|8|R19|warheads/xstate-fsm/index.ts:131|actor.unsubscribed|TRUE|0.92|no subscribe|
|9|R19|warheads/xstate-fsm/index.ts:136|actor.broken-flow|TRUE|0.88|blind send|
|10|R19|orchestrator.ts:33|actor.orphan|TRUE|0.85|never stop|
|11|R19|orchestrator.ts:32|actor.topology-drift|TRUE|0.82|dual-machine|
|12|R19|warheads/xstate-fsm/index.ts:1|actor.topology-drift|TRUE|0.90|import|
|13|R20|hydra/pipeline.ts:18|state-machine.topology-drift|TRUE|0.89|11-step not XState|
|14|R20|audit-engine/aether-backend/agent.ts:138|state-machine.scattered-flags|TRUE|0.92|retry flags|
|15|R20|hydra/aether-auditor.ts:165|state-machine.scattered-flags|TRUE|0.85|repair flags|
|16|R20|hydra/pipeline.ts:118|state-machine.unreachable|TRUE|0.90|always throws|
|17|R20|audit-engine/aether-backend/agent.ts:255|state-machine.missing-terminal|TRUE|0.82|no final|
|18|R20|hydra/graphify.ts:14|state-machine.scattered-flags|TRUE|0.78|null booleans|
|19|R21|hydra/aether-meta.ts:131|engine.silentDegrade|TRUE|0.94|manifest CRITICAL|
|20|R21|hydra/aether-meta.ts:70|engine.silentDegrade|TRUE|0.91|DB cluster|
|21|R21|audit-engine/run-status.ts:122|engine.unguardedWrite|TRUE|0.88|notify no guard|
|22|R21|hydra/memory.ts:12|engine.unguardedSideEffect|TRUE|0.86|memory init|
|23|R21|hydra/aether-auditor.ts:138|engine.silentDegrade|TRUE|0.84|repair void|
|24|R22|hydra/memory.ts:108|adapter.delegation-parity|TRUE|0.88|getGraph null|
|25|R22|hydra/memory.ts:120|adapter.snapshot-merge|TRUE|0.85|merge no-op|
|26|R22|hydra/memory.ts:130|adapter.unguarded-wrap|TRUE|0.80|query null LOW|
|27|R22|hydra/graphify.ts:152|adapter.delegation-parity|TRUE|0.86|depth void|
|28|R22|audit-engine/index.ts:118|adapter.unguarded-wrap|TRUE|0.91|mock CRITICAL|
|29|R22|audit-engine/layers/r-adapter.ts:124|adapter.delegation-parity|TRUE|0.84|length>1|
|30|R22|audit-engine/index.ts:125|adapter.snapshot-merge|TRUE|0.82|drops graphContext|
|31|R22|hydra/pipeline.ts:118|adapter.stale-delegation|RED_HERRING|0.78|intentional guard|
|32|R23|audit-engine/aether-backend/report/validator.ts:32|mpse.threshold|TRUE|0.88|bare 0.55/1.0|
|33|R23|audit-engine/aether-backend/demand-builder.ts:22|mpse.threshold|TRUE|0.82|bare 0.85 family|
|34|R23|audit-engine/aether-backend/phase-controller.ts:14|mpse.threshold|TRUE|0.65|bare 3/4/8 LOW|
|35|R23|audit-engine/aether-backend/demand-builder.ts:27|mpse.threshold|UNCLEAR|0.58|1.0 clamp|
|36|meta|hydra/pipeline.ts:118|lasme-meta.orphan-actor|RED_HERRING|0.92|dup 31|
|37|meta|audit-engine/layers/r-actor.ts:61|lasme-meta.actor-missing-subscribe|TRUE|0.88|generic count|
|38|meta|audit-engine/layers/r-actor.ts:82|lasme-meta.topology-drift|TRUE|0.85|length>1 fallback|
|39|meta|audit-engine/aether-backend/runner.ts:116|lasme-meta.silent-degrade|TRUE|0.82|void _m|
|40|meta|hydra/memory.ts:108|lasme-meta.adapter-parity-stub|TRUE|0.92|getGraph null|
|41|meta|hydra/memory.ts:120|lasme-meta.adapter-wraps|TRUE|0.90|merge discard|
|42|meta|hydra/memory.ts:130|lasme-meta.adapter-unguarded-wrap|TRUE|0.88|query null|
|43|meta|hydra/graphify.ts:152|lasme-meta.delegation-parity-loss|TRUE|0.86|depth|
|44|meta|audit-engine/index.ts:118|lasme-meta.stale-delegation|TRUE|0.91|mock|
|45|meta|audit-engine/index.ts:125|lasme-meta.snapshot-merge-loss|TRUE|0.82|drops|
|46|meta|hydra/instances/lasme.ts:8|lasme-meta.scope-violation|RED_HERRING|0.95|spurious|
|47|meta|hydra/pipeline.ts:18|lasme-meta.state-machine-topology-drift|TRUE|0.89|dup confirm|
|48|meta|audit-engine/aether-backend/agent.ts:138|lasme-meta.state-machine-scattered-flags|TRUE|0.92|dup confirm|
|49|meta|hydra/pipeline.ts:118|lasme-meta.state-machine-unreachable|TRUE|0.90|dup confirm|
|50|meta|audit-engine/layers/r-mpse.ts:173|lasme-meta.mpse-threshold-critical|TRUE|0.93||Δ| lie CRITICAL|
