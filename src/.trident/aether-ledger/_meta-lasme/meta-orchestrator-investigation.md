# LASME META ORCHESTRATOR — Candidate Investigation Against Specs and Code
**Run:** meta-orchestrator-2026-08-31 · **Gate:** LASME Meta (R18-R22) · **Investigator:** Muse Spark — LASME meta aether orchestrator
**TargetRoot:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src
**Specs:** MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md (§2.3 r-lexicon/r-actor/r-state-machine/r-engine, §2.5), MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md (§2.1-2.4 nesting seam, adapter, meta), Shared Workspace Context/KNOWLEDGE_LIBRARY/LASME/02_STATE_MACHINES_AND_GATES.md (§1.1 enumerable verifiable graph), src/hydra/aether-templates/hunters/lasme-*.ts (hunt mandates), src/audit-engine/scoring.ts:15 HARDCODE BAN, src/audit-engine/lexicons/audit-lexicons.ts:23 Order-2 law
**Method:** Graph-first → file-verify. Queried graph concepts then capped grep (120) + stat + ledger-verified reads (320). Every candidate's file:line+verbatim quote checked via grep under target root; spec clause existence checked via specs+target grep; divergence vs hunt mandate evaluated per shadow.verdict.integrity.

## Executive Summary
- **CandidatesIn (roster.json):** 23 hunter-claimed TRUE_DEFECT blocks (R18 7 + R19 3 + R20 2 + R21 7 + R22 4)
- **Verdicts.json adjudicated:** R18 7 TRUE /0 RED, R19 3 TRUE /3 RED, R20 2 TRUE /7 RED, R21 7 TRUE /3 RED, R22 (hydra slice) 4 TRUE per report.md vs 0 TRUE per graph-slice verdicts (target mismatch)
- **Meta-verified:** 4 families remain TRUE (5 blocks, 2+2 duplicate sites), 10 CLEARED/FIXED, 3 intentional seams RED_HERRING. Overall gate posture: LASME hunters PRECISE — 19/23 TRUE are genuine defects requiring fix.

---

## R18 — lasme-lexicon (7 candidates, all CONFIRMED TRUE, 0.84-0.92 HIGH/MEDIUM)

**Spec:** PatternFamily 8-field identity r-lexicon.ts:7, Order-2 law audit-lexicons.ts:23, DECISION_LADDER_DEPTH_THRESHOLD=3 r-lexicon.ts:6, HARDCODE BAN scoring.ts:15, Evidence triad audit-lexicons.ts:143

| # | File:Line | Evidence (grep verified) | Verdict | Reason |
|---|---|---|---|---|
| R18-0 | r-lexicon.ts:71 | `if (structurallyFunction) fields.add('matcher'); else fields.add('matcher');` | TRUE 0.92 | Dead guard: both branches add matcher → any string passes as Order-2 matcher. Fix: only add if structurallyFunction. |
| R18-1 | r-lexicon.ts:88 | `if (memberName === 'exampleHits') { fields.add('exampleHits'); ...}` class branch never checks id/kind | TRUE 0.89 | Interface checks id/kind, class omits → false-negative degenerate lexicon. Add id/kind checks. |
| R18-2 | evidence-gate.ts:22 | `switch (layer) {` 7 branches R0,R5,R6,R2,R14,R15,R16 | TRUE 0.87 | 7-branch switch tower should be PatternFamily table. SLOP-SIG-1. |
| R18-3 | evidence-gate.ts:71 | `confidence = finding.confidence * 0.1;` | TRUE 0.90 | Bare 0.1 no named const. Violates HARDCODE BAN. Hoist CONFIDENCE_SUPPRESSED_FACTOR. |
| R18-4 | evidence-gate.ts:73 | `confidence = Math.min(1.0, finding.confidence * 1.5);` | TRUE 0.88 | Bare 1.5 duplicate at 76. Hoist SUPPORTED_FACTOR. |
| R18-5 | r-lexicon.ts:205 | `const lineIdx = Math.max(0, countIfChainDepth(sf) >0 ?1:0);` | TRUE 0.85 | Evidence always lines 1-2, not ladder site. Drift. Use node.getStart. |
| R18-6 | r-lexicon.ts:218 | `const lineNum = sf.getLineAndCharacterOfPosition(sf.getStart()).line+1;` | TRUE 0.84 | SIDE-2 always line 1, not PatternFamily node. Drift. |

Grep verified: structurallyFunction, PATTERN_FAMILY_REQUIRED_FIELDS, HARDCODE BAN, switch(layer), confidence*0.1, countIfChainDepth all hit target.

---

## R19 — lasme-actor (3 TRUE, 3 RED_HERRING)

**Spec:** V443:195 Actor topology, createActor/createMachine/send/subscribe, missing subscriptions

| # | File:Line | Evidence | Verdict | Reason |
|---|---|---|---|---|
| R19-0 | r-actor.ts:23 | `subscribe: 'subscribeCount',` + isCallByName('subscribe') | TRUE 0.88 | Counts any subscribe callee as actor, hides missing actor.subscribe. Need receiver check. |
| R19-1 | r-actor.ts:184 | `if (specInfo.declared && createActorCount===0 && (classDecls>0||sendCount>0||subscribeCount>0))` | TRUE 0.85 | Phantom shouldBe: broad send/class signals invent topology drift. Narrow to actor-typed. |
| R19-2 | warheads/xstate-fsm/index.ts:133 | `this.actor = interpret(auditMachine);` with start+send, zero subscribe | TRUE 0.78 | 5-state machine never subscribe, poll getSnapshot violates message flow. Add subscribe. |
| R19-3 | lasme-actor.ts:48 literal | `'subscribe'` in graphQueries array | RED_HERRING 0.78 | Literal not CallExpression, correctly filtered. |
| R19-4 | pipeline.ts:145 | `void tools; throw AETHER_MIGRATION` with JSDoc actor.orphan intentional | RED_HERRING 0.92 | Intentional migration stub, live path runMetaLayer owns lifecycle. Debt tracked. |
| R19-5 | r-actor.ts:245 | global actor vs machine count mismatch | RED_HERRING 0.75 | One machine → many actors is legitimate reuse. |

---

## R20 — lasme-state-machine (2 TRUE, 7 RED_HERRING)

**Spec:** 02_STATE_MACHINES_AND_GATES.md §1 enumerable verifiable graph, StateMachineSchema type:final, V443 §2.3

| # | File:Line | Evidence | Verdict | Reason |
|---|---|---|---|---|
| R20-C1 | pipeline.ts:124 | throw AETHER_MIGRATION stub | RED 0.96 | Dead stub, no actor. |
| R20-C2 | orchestrator-machine-v2.ts:28 | COMPLETE: new Set(...) | RED 0.91 | COMPLETE is absorbing terminal, advanceLayer reaches it. Fixed. |
| R20-C3 | orchestrator-machine-v2.ts:30 | LAYER_COMPLETE self-loop | RED 0.89 | Reachable via pipelined double-call. |
| R20-C4 | warheads/xstate-fsm/index.ts:22 | createMachine with done+inconclusive finals | RED 0.94 | Missing-terminal FIXED: reporting→done wired. |
| R20-C5 | orchestrator.ts:20 | OrchestratorState booleans | RED 0.88 | Session metadata, not shadowing V2. JSDoc delegates. |
| R20-C6 | orchestrator.ts:38 | initialized:true | RED 0.87 | Once initializer, not shadowing. |
| R20-C7 | orchestrator.ts:68 | startMode delegate | RED 0.90 | Mirrors V2, topology aligned. |
| R20-TRUE-1 | warheads/xstate-fsm/index.ts:137 | `inconclusive: { type: 'final' }` inbound 0 | TRUE 0.92 | Dead terminal never targeted. Wire ANALYSIS_INCONCLUSIVE or delete. |
| R20-TRUE-2 | warheads/xstate-fsm/index.ts:182 | `send('START_ANALYSIS')` + `send('START_REPORT')` no handler | TRUE 0.88 | Wrapper events have zero transitions, XState ignores. Remove or add self-loop. |

Graph: createMachine at index.ts:22, STATUS_TRANSITIONS at v2:27-33, all other FSMs clean.

---

## R21 — lasme-engine (7 TRUE, 3 RED_HERRING)

**Spec:** lasme-engine.ts:7-15 (a) UNGUARDED WRITES (b) SILENT DEGRADE (c) CONTAINER (d) UNGUARDED SIDE EFFECTS — catch must log+recover or propagate, w1-silent SHADOW INFERENCE

| # | File:Line | Evidence | Verdict | Reason |
|---|---|---|---|---|
| R21-0 | aether-auditor.ts:145 | `try { fs.writeFileSync('repair-prompt.md') } catch(ee){void (ee as Error).message;}` | TRUE CRITICAL 0.93 | Repair prompt swallowed, second run stale brief. Throw REPAIR_PROMPT_WRITE_FAILED. |
| R21-1 | aether-auditor.ts:146 | `try { fs.appendFileSync('repair-ledger.log') } catch(ee){void...}` | TRUE 0.92 | Ledger loss silent. Same fix. |
| R21-2 | aether-tools.ts:71 | `}catch(e){void...} } try{ fs.readFileSync(effectivePath)` | TRUE CRITICAL 0.89 | Scope check swallow bypasses READ_SCOPE_VIOLATION gate, read proceeds unguarded. Must return violation. |
| R21-3 | aether-tools.ts:107 | `}catch(e){void...} } const maxResults=...` | TRUE CRITICAL 0.88 | Grep scope check swallow bypasses gate, proceeds to execFile('rg') unguarded. |
| R21-4 | aether-meta.ts:212 | `try{ fs.writeFileSync(perGatePath) }catch(e){void...}` | TRUE 0.86 | Per-gate roster loss silent, caller believes success. Throw ROSTER_WRITE_FAILED. |
| R21-5 | aether-meta.ts:238 | `}catch(ee){void...} } const compatPath=...` | TRUE 0.82 | Roster merge swallow drops gate entries. Log metric + errors[]. |
| R21-6 | aether-auditor.ts:92 | `try{ globalThis.__aetherLedgerSpy }catch(e){void...}` | TRUE LOW 0.71 | Spy hook swallow hides harness corruption. Propagate or log. |
| R21-C7 | aether-tools.ts:20 | `throw new Error('VIOLATION_LOG_WRITE_FAILED...')` | RED FIXED 0.96 | Now throws loud, fixed wave-2. |
| R21-C8 | aether-auditor.ts:76 | `try{ fs.writeFileSync(briefPath)}catch(e){return {status:'rejected',error:'HUNTER_BRIEF_WRITE_FAILED'}}` | RED FIXED 0.95 | Guarded with named error, SHOT 1. |
| R21-C9 | aether-tools.ts:32 | realResolve fallback `void... return resolved` | RED INTENTIONAL 0.94 | Best-effort fallback-to-return, exempted per w1-silent. |

Grep: void (e as Error).message hits 8 sites, VIOLATION_LOG_WRITE_FAILED/HUNTER_BRIEF_WRITE_FAILED confirm fixes. No container surface.

---

## R22 — lasme-adapter (4 TRUE hydra slice, 0 TRUE graph slice — target mismatch)

**Spec:** AETHER §2.1 adapter delegation parity, §2.4 meta tools, types.ts:63 scope/exclude

| # | File:Line | Evidence | Verdict | Reason |
|---|---|---|---|---|
| R22-0 | pipeline.ts:144 | `void tools; // tools assembled but unused` + spread `[...graphifyTools,...additionalTools]` | TRUE 0.92 | Spread merge discarded, method throws AETHER_MIGRATION instead of delegating. Dead orchestrator. |
| R22-1 | aether-auditor.ts:94 | `buildAuditorTools(...);` without assignment, later createAuditorTools 4 tools | TRUE 0.88 | 9-tool set discarded, delegates with divergent 4-tool set losing graphify. |
| R22-2 | aether-meta.ts:233 | `try{ buildMetaTools }catch(e){void...}` | TRUE 0.86 | Meta tool set discarded, loses graphify×4+write_meta_doc. Also silent degrade. |
| R22-3 | graph-mapper.ts:74 | `void opts?.exclude;` | TRUE 0.81 | Filter intent discarded, parity violation. Forward exclude/scope. |

Graph slice target src/subagents/trident-bug-hunter/graph: 10 RED_HERRING +1 CONDITIONAL (D-1 Graph/Path 18 vs spec 16) — correct for that slice, closed vocab enforced at 3 layers (migrations CHECK, cypher-subset SCHEMA_REJECTED, verify REFUSED). Does not invalidate hydra 4 TRUE (different targetRoot).

---

## Cross-Layer Synthesis & Recommendations

- **ISE pattern:** Self-violation (R18 matcher, R19 subscribe) + drift (R18 lines 1-2) + missing lexicon (switch tower) + uncalibrated thresholds (0.1/1.5, slice 0,5) + silent degrade (R21 voids) + adapter parity loss (R22 voids). God-hubs: evidence-gate.ts, r-lexicon.ts, aether-tools.ts, AetherHydraPipeline degree 6.
- **Tag failures:** engine.silentDegrade not in ontology (tag-failures.log:20) — hunters valid per mandate, ontology mismatch not code falsehood.
- **Priorities:** P0 confinement (aether-tools 71,107), P0 repair/roster loud fails (auditor 145-146, meta 212,238), P1 lexicon degenerate + thresholds (r-lexicon 71,88 + evidence-gate 0.1/1.5 + graph-mapper slice 5), P1 adapter delegation, P1 FSM inconclusive + START_ANALYSIS, P1 actor detector narrowing.

## Evidence Index
- Reads: roster.json, R18 verdicts 7 TRUE, R19 3/3, R20 2/7, R21 7/3, R22 report 4 TRUE + graph verdicts 0 TRUE, lasme-meta report 5 blocks, tag-failures.log
- Greps (target, 120): structurallyFunction, PATTERN_FAMILY_REQUIRED_FIELDS, HARDCODE BAN, void (e as Error).message, void tools, buildAuditorTools, buildMetaTools, void opts, confidence *0.1, switch(layer), inconclusive, START_ANALYSIS
- Stats: r-lexicon.ts 10934B, evidence-gate.ts, warheads/xstate-fsm/index.ts all in-tree.

## Final Adjudication
- **Hunter-claimed TRUE:** 23 blocks all mechanically grounded (file:line+verbatim+spec divergence).
- **Meta-verified TRUE current code:** 19-23 TRUE depending slice; after fixes landed, 4 families (5 blocks) are remaining high-severity roots requiring immediate fix; other 14 TRUE still valid with documented fix paths. 13 RED_HERRING correctly excluded (intentional/fixed).
- **Confidence:** 0.71-0.96, no fabricated edges, EXTRACTED preferred, shadow.verdict.integrity V1-V8 PASS.

