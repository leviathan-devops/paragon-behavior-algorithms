# MPSE META — Candidates vs Specs & Code — Independent Investigation
**Orchestrator:** Muse Spark — MPSE meta aether orchestrator
**Date:** 2026-08-29 UTC
**Gate:** MPSE (R24 contract, R25 oracle, R26 stage, R27 provenance + mpse-meta)
**TargetRoot:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src`
**Roster:** R24 6 raw → 8 durable, R25 4, R26 2, R27 4, mpse-meta 7 = 23-24 candidates audited
**Method:** graphify:query|path|subgraph before read(320)/grep(120); specs PARAGON §4.2, V443 §2.1-2.8, AETHER §1.3-1.4, KB-MPSE-02/03; ledger reports R24-R27 + _meta-mpse report.md + investigation.md + findings-report.md cross-checked
**Graph:** 1847 nodes / 3120 edges / 4 communities (math-oracle, math-eval, math-contract, hydra-aether-templates), god nodes Bindings:12 MathContract:9 GraphifyMCPMapper SQLiteMemoryStore:5, typed_edges delta 0 live (Phase-1 stubs, tagsWritten 0 all hunters)

---

## R24-mpse-contract — 6 roster raw + 8 durable artifact candidates

### C1 · MathExpr 30-kind union allegedly missing `until` · `src/audit-engine/math/expr.ts:12` · CLAIM `contract.violated`
- **Evidence quoted:** `export type MathExpr = | { kind: 'var'; name: string } | { kind: 'lit'; value: number | string | boolean } | { kind: 'add'; l: MathExpr; r: MathExpr } ... | { kind: 'until'; a: MathExpr; b: MathExpr };`
- **Spec:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:239` + `KB-MPSE-03:239-269` 30-kind closed MathExpr union incl. temporal until
- **Code/Code-window:** expr.ts:14 defines `until` with `a/b` (PARAGON variant `l/r`), `ALL_KINDS` size 30, rename header `lit ↔ PARAGON num/bool, var ↔ sym/ref` documents pinned mapping; TEMPORAL_KINDS includes `until`
- **Graph:** `graphify:subgraph expr.ts degree high` EXTRACTED `until` node; `path MathExpr → temporal` EXTRACTED
- **Investigation:** Hunter claimed missing `until` but evidence itself contains `| { kind: 'until'; ... }`. Durable findings-report.md:713 confirms 30 kinds present. PARAGON `l/r` vs code `a/b` is intentional rename. **VERDICT: RED_HERRING — FALSE POSITIVE** 0.95 No fix.

### C2 · stage param silently coerced to `inv` · `src/audit-engine/math/contract.ts:76` · CLAIM `contract.violated`
- **Evidence:** `const eff: Stage = (stage === 'pre' || stage === 'post' || stage === 'inv' || stage === 'temporal') ? stage as Stage : 'inv';`
- **Spec:** `KB-MPSE-03:336` checkContract evaluates stage's expr set; invalid stage must loud-fail never silent coercion
- **Code:** contract.ts:72 `checkContract(contract: MathContract, stage: Stage | string, ...)` — then ternary coerces unknown → inv; no throw
- **Graph:** no loud-fail edge; query trace shows stage-selective logic 78-83 but no UNKNOWN_STAGE throw
- **Investigation:** Verified via grep. Spec 336 explicit loud-fail. **VERDICT: TRUE_DEFECT CONFIRMED** 0.90 HIGH Fix: `if (!['pre','post','inv','temporal'].includes(stage)) throw new Error('UNKNOWN_STAGE: '+stage)`

### C3 · OracleDeclaration epsilon optional defaults to 0 · `src/audit-engine/math/oracle.ts:18` `const eps = decl.epsilon ?? 0;`
- **Evidence duplicate R25-F0 same line 15-18**
- **Spec:** `KB-MPSE-02:658` + `PARAGON:681/695` epsilon REQUIRED — `|eval−oracle| ≤ epsilon` with explicit provenance; no implicit default + W4-oracle.md:106 non-integer float without epsilon THROWS OracleEpsilonError
- **Code:** oracle.ts:5 `epsilon?: number` optional; :10-12 isFiniteEpsilon only checks finite>=0; :17 throw only on NaN/Inf/negative NOT undefined because `undefined ??0→0` passes; :26 Math.abs≤eps uses collapsed 0; firewall.ts correctly requires tolerance no default — proves intended discipline REQUIRED; r-mpse.ts flags hasEpsilonField absence
- **Graph:** subgraph depth3 blast radius expr.ts contract.ts r-mpse.ts firewall.ts; no epsilon-required edge
- **Investigation:** Byte-exact. **VERDICT: TRUE_DEFECT CONFIRMED** 0.95 HIGH Fix: before ??0 `if (typeof decl.oracleValue==='number'&&!Number.isInteger(decl.oracleValue)&&decl.epsilon===undefined) throw OracleEpsilonError`

### C4 · VerifiedMathSpec brand gate allegedly missing passThroughFirewall · `src/audit-engine/math/firewall.ts:5`
- **Evidence:** `const __verified: unique symbol = Symbol('__verified'); ... function passThroughFirewall(raw: RawMathSpec): VerifiedMathSpec { const evaluated = evaluateExpression(...); if (Math.abs(evaluated - raw.oracle) > raw.tolerance) throw FirewallError; return {...raw, [__verified]:true} }`
- **Spec:** V443:688 VerifiedMathSpec sole constructor `|eval−oracle|≤tol`
- **Code:** Implements brand + Math.abs + throw exactly mandated
- **Graph:** EXTRACTED correct
- **Investigation:** Hunter claimed missing but code present. **VERDICT: RED_HERRING FALSE POSITIVE** 0.93 No fix

### C5 · SpecBindingDeclaration provenance TRACE_GAP · `src/audit-engine/index.ts:291` `grep checkContract\( in src: 0 production hits; audit() 291-360 parseSpecBindings → six try/catch → runAuditPipeline, never imports math/contract.ts:checkContract`
- **Spec:** V443:180 verify each declared contract; trace call chains; No code without preceding math + V443:241 every clause via graphify:path
- **Code:** No import; pipeline.ts:132 dead dispatch; memory stubs
- **Graph:** query trace hops[] length0; path spec→code no path
- **Investigation:** Zero hits outside prompts confirmed. Meta TD-7 0.94 CRITICAL. **VERDICT: TRUE_DEFECT TRACE_GAP CONFIRMED** 0.94 CRITICAL Fix: wire audit()→checkContract 4-role ladder or trace-exempt:deferred

### C6 · extractBindings allegedly casts Set to string · `src/audit-engine/math/contract.ts:42+58` `if (v instanceof Set) values[k]=v as unknown as ScalarValue; else if (Array.isArray(v)) values[k]=[...v]`
- **Spec:** V443:120 Sets become first-class bindings — without string cast + PARAGON:703 `extractBindings(source: EvidenceStoreSnapshot)`
- **Code:** No String(v); retains Set; eval.ts Set→array [...v] for card/sum — but Law 18 ISOLATION math imports NOTHING; EvidenceStoreSnapshot host type at src/machines/mpse-discharge.ts
- **Graph:** signature mismatched missing EvidenceStoreSnapshot INFERRED not defect
- **Investigation:** Mis-read as string cast; meta RED_HERRING 4 0.90. **VERDICT: RED_HERRING CONFIRMED** 0.90

**R24 durable addenda:**
- Families/Structures PROPOSED §4.2.8/4.2.9 — **RED_HERRING 0.92**
- Oracle hash triple sha256 [k,value,epsilon] — **RED_HERRING 0.85**
- BrandedVerdict plain union — **RED_HERRING 0.91**
- checkContract DIE throw pure evaluator vs caller ladder — **RED_HERRING 0.88** (stage coercion C2 remains TRUE separate)
- Discharge Set→array — **UNCLEAR 0.62**
- Firewall REJECT bypass `Function("use strict"; return (expr))()` — **TRUE_DEFECT 0.92 HIGH**
- Demo f(T)=24 unimplemented — **TRUE_DEFECT 0.85 MEDIUM**
- Temporal ESCALATE swallow UNVERIFIABLE not throw — **TRUE_DEFECT 0.78 MEDIUM**

R24 tally: 6 raw → 2 TRUE (C2,C3,C5) +3 RED_HERRING ; durable 8 →1 TRUE +6 RED+1 UNCLEAR ; verdicts.json 4 TRUE

---

## R25-mpse-oracle — 4 candidates

### O1 · Bare equality without epsilon in eval.ts:96 `if (kind === 'eq') res = lv === rv;` — Spec PARAGON:695 floats ONLY via Math.abs — Code eval handles MathExpr structural equality not oracle threshold; integer thresholds exempt. **RED_HERRING 0.78**

### O2 · Oracle verdict strict equality contract.ts:53 `return ev === ov ? 'VALID' : 'CONTRADICTED';` — numeric floats correctly epsilon-guarded at oracle.ts:22-27 Math.abs≤eps; fallback for literals. **RED_HERRING**

### O3 · Float oracle registration defaults epsilon to zero oracle.ts:24 `const eps = decl.epsilon ?? 0;` — Same as R24 C3 **TRUE_DEFECT 0.95 CRITICAL**

### O4 · Set equality via JSON.stringify order-sensitive contract.ts:52 `JSON.stringify(ev)===JSON.stringify(ov)` — Spec PARAGON:710 unordered set required. **TRUE_DEFECT 0.88 MEDIUM** Fix Set size+has

R25 tally: 1 TRUE +2 RED +1 TRUE

---

## R26-mpse-stage — 2 roster +5 meta expanded

### S1 · pipeline.ts:143 `throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed...')` — Spec V443:250/560 PipelineConfig Promise.allSettled via buildSystemPrompt — Code void tools then throw unconditionally, fulfilledCount 0. **TRUE_DEFECT CRITICAL 0.96**

### S2 · mpseSynthesize continue `src/hydra/instances/mpse.ts:401` — defers post-gate failure. **TRUE_DEFECT HIGH 0.88** Fix fulfilledCount>=1 throw

Plus: aetherInputBuilder missing filtered LASME 0.92 TRUE, countGraphTags size>0?1:0 not COUNT(*) 0.95 TRUE, runMetaLayer unsequenced 0.88 TRUE, hasMetaSection fallback templated META 0.85 TRUE, 9-tool vs 4-tool wiring void 0.80 TRUE — all 5 TRUE

---

## R27-mpse-provenance — 4 roster

### P1 · memory.ts:133 `getGraph(): return null; // Phase-1 stub` — Spec AETHER:412 SQLiteMemoryStore hydrate typed_nodes/edges + V443 §2.8 TencentDB — Code three stubs getGraph/mergeGraphSlice/queryGraph null; grep tencent 0. **TRUE_DEFECT TRACE_GAP 0.94 HIGH**

### P2 · provenance hunter filterTags `['spec-clause','trace']` zero intersection mpse-provenance.ts:107 — LASME predicates r-lexicon|r-actor|... none equal — **TRUE_DEFECT 0.90 HIGH**

### P3 · pipeline.ts:42 Extract ONCE but 3 extracts per audit (lasme→mpse→sro) — Spec V443:210 Extract ONCE query N — **TRUE_DEFECT 0.88 MEDIUM**

### P4 · graph-mapper.ts:122 `findId = low.includes` substring BFS no SpecClause ontology — Spec V443:188 path spec→code + unreachable — **UNCLEAR 0.62** escalate

Plus orphaned instances/mpse.ts 515L 0.92 TRUE, divergent pipeline throw 0.90 TRUE

---

## mpse-meta — 7 roster

M1 ontology divergence `mpse-contract.ts:47` contract.* predicates absent from `ontology.ts:8 PREDICATES.mpse=['evaluates_to','contradicts_oracle','grounded_through','unguarded_threshold']` → zero tags — **TRUE CRITICAL 0.97**
M2 synthetic meta template `aether-meta.ts:238` hardcoded prompt not import mpseMetaTemplate — **TRUE HIGH 0.94**
M3 targetRoot mis-wired `aether-meta.ts:287` ledgerRoot not codebase — **TRUE HIGH 0.92**
M4 direct SQL bypass corbell-bridge `aether-meta.ts:78` — **TRUE HIGH 0.90** AP-7
M5 DELETE by predicate not canonical_id `aether-meta.ts:73` — **TRUE MED 0.88**
M6 missing filterTags enforcement `aether-meta.ts:165 inputDataBuilder` — **TRUE MED 0.86**
M7 fallback heading false-positive `aether-meta.ts:212` — **TRUE MED**

Meta 10 findings align: pipeline CRIT 0.96, layerNumber drift 0.94, SubagentSpec function drift 0.89, graphify depth 0.91/0.86, memory null 0.92/0.88, trace-gap 0.94, append guard 0.83, layerNumber UNCLEAR 0.62

---

## CROSS-HUNTER & GRAPH

- Epsilon hotspot R24 C3+R25 O3 corroborated 0.95
- TRACE_GAP convergence R24 C5 + meta F8 + R27 P1 + R26 S1 → systematic 0.94
- God nodes Bindings:12 MathContract:9 SQLiteMemoryStore:5 — single point failures
- Tag delta 0 live explains M1 ontology block — 22 candidates rejected

## FIX ORDER

1. M1 dispatch CRIT 0.97 + S1 CRIT 0.96 + C5 TRACE_GAP CRIT 0.94 — unblock hydra/provenance/tagging
2. C3/O3 epsilon REQUIRED 0.95 — throw before ??0
3. C2 stage loud-fail 0.90 UNKNOWN_STAGE
4. P1/P3 memory Phase-2 SELECT + tx INSERT
5. Pipeline dedup + S1/S2 gating + V443:560 Promise.allSettled AP-9
6. P2/M6 filterTags enforcement
7. M2-M5 wiring + ontology alignment
8. Durable: firewall REJECT 0.92, f(T) 0.85, ESCALATE throw 0.78, set unordered 0.88, depth forward 0.91, append guard 0.83
9. UNCLEAR escalate: Set brand KB-01, depthLimit BECAUSE, spec ontology, heading

**Summary:** ~19-20 TRUE (4 CRIT 12 HIGH) +8 RED_HERRING +4 UNCLEAR +1 REJECTED schema — MPSE-VERIFIED 67 per _meta-mpse/report.md
