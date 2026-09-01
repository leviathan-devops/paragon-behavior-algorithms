# CODE AUDIT AETHER REPORT

## 0 RUN METADATA

- **Run ID:** audit-1787997122241
- **Hunter:** R18-lasme-lexicon (lexicon predicate — AETHER §2.2 R18)
- **Model:** muse-spark-1.2 — provider opencode-go
- **Target:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3
- **Specs:** MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md, MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md, KNOWLEDGE_LIBRARY/Bibles/Lexicon_Grade_Intelligent_Systems_Engineering_Bible.md, KNOWLEDGE_LIBRARY/Bibles/INTELLIGENT_SYSTEMS_ENGINEERING_T1.md
- **Started:** 2026-08-14T08:02:00Z
- **Finished:** 2026-08-14T08:22:00Z
- **WallClockMs:** 1200000
- **CandidatesIn:** 7
- **Verdicts:** 7 TRUE_DEFECT, 0 RED_HERRING, 0 UNCLEAR
- **Graph:** graphify-out/graph.json — nodes 48, edges 71, godNodes 5
- **Ledger:** src/.trident/aether-ledger/R18-lasme-lexicon/

## 1 THE VERDICT TABLE

| # | File:Line | Layer | Adjudication | Confidence | Spec | Divergence (short) |
|---|---|---|---|---|---|---|
| 0 | audit-engine/layers/r-lexicon.ts:71 | R18-lasme-lexicon | TRUE_DEFECT | 0.92 | AETHER §2.2 (88) | matcher both branches add — degenerate |
| 1 | audit-engine/layers/r-lexicon.ts:88 | R18-lasme-lexicon | TRUE_DEFECT | 0.89 | V443 §2.3 (142) | class branch omits id/kind |
| 2 | audit-engine/evidence-gate.ts:22 | R18-lasme-lexicon | TRUE_DEFECT | 0.87 | AETHER §2.2 (88) | switch 7 branches no PatternFamily |
| 3 | audit-engine/evidence-gate.ts:71 | R18-lasme-lexicon | TRUE_DEFECT | 0.90 | V443 §2.3 (142) | bare 0.1 no calib |
| 4 | audit-engine/evidence-gate.ts:73 | R18-lasme-lexicon | TRUE_DEFECT | 0.88 | V443 §2.3 (142) | bare 1.5 no calib |
| 5 | audit-engine/layers/r-lexicon.ts:205 | R18-lasme-lexicon | TRUE_DEFECT | 0.85 | AETHER §2.2 (88) | evidence lines 1-2 drift |
| 6 | audit-engine/layers/r-lexicon.ts:218 | R18-lasme-lexicon | TRUE_DEFECT | 0.84 | AETHER §2.2 (88) | SIDE-2 line always 1 drift |

Detailed verdicts in `verdicts.json` (VerdictsFile schema V1-V8 pass). Candidate → verdict 1:1, no drops. Hunter findings in `findings/report.md` (7 FINDING blocks) match this table.

## 2 TRUE DEFECTS

### [0] audit-engine/layers/r-lexicon.ts:71 — degenerate matcher accepts non-function
- **CodeQuote:** `if (structurallyFunction) fields.add('matcher'); else fields.add('matcher');` (`r-lexicon.ts:71` in `hasPatternFamilyShape` interface branch)
- **SpecQuote:** `DEGENERATE LEXICONS — lexicons that exist but violate the ISE law: no typed members, no evidence-triad production, detection-only with no state machine behind the decision` (`AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:88`, `Lexicon Bible 1.2 PatternFamily shape id/kind/matcher/triggerCondition/severity/messageTemplate/remediationHook`)
- **Divergence:** Spec requires matcher be Order-2+ `(node,ctx)=>MatchResult` with ctx awareness (audit-lexicons.ts:23). Code computes `structurallyFunction` via `isMethodSignature||isPropertySignature` and text includes `=>|Function|(sf)` but then adds `matcher` in both branches — the guard is dead. An untyped `matcher: string` or missing function still passes as valid, allowing degenerate lexicon to ship. This is the exact ISE SLOP-SIG-2 regex-only classifier root cause.
- **Evidence:** `r-lexicon.ts:65-75` both branches `fields.add('matcher')`; grep `structurallyFunction` hits 2 sites (interface+class). No `else` without add.
- **Confidence:** 0.92 — structural, file:line anchored, mutation-killable (change else to not add → SIDE-2 would fire for degenerate fixtures).

### [1] audit-engine/layers/r-lexicon.ts:88 — class branch omits id/kind
- **CodeQuote:** `if (memberName === 'exampleHits') { fields.add('exampleHits'); hasExampleHits = true; }` (`r-lexicon.ts:88` in `isClassDeclaration` branch)
- **SpecQuote:** `PatternFamily interfaces, ISE lexicons, decision ladders ≥3, threshold literals without calibration` (`V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:142`, `PATTERN_FAMILY_REQUIRED_FIELDS 8-field identity`)
- **Divergence:** Spec declares 8-field identity must hold for both interface and class forms. Interface branch checks `id`/`kind`/all 8; class branch only checks `exampleHits`/`triggerCondition`/`severity`/`messageTemplate`/`remediationHook`/`matcher` and never `id`/`kind`. A `class PatternFamilyRegistry` or `class PatternFamily` missing `id`/`kind` would incorrectly be considered complete, producing false-negative SIDE-2 and later drift where required-field check omits them. Gap is interface/class structural drift.
- **Evidence:** `r-lexicon.ts:88-105` class member loop 6 checks vs interface 8 checks; `id`/`kind` absent in class.
- **Confidence:** 0.89

### [2] audit-engine/evidence-gate.ts:22 — 7-branch switch missing lexicon
- **CodeQuote:** `switch (layer) {` (`evidence-gate.ts:22` in `suppress(layer)`, `case 'R0'|'R5'|'R6'|'R2'|'R14'|'R15'|'R16'`)
- **SpecQuote:** `MISSING LEXICONS — decision surfaces that should be driven by a typed PatternFamily/lexicon but are regex towers, if/else ladders (>=3 branches), or scattered boolean chains instead` (`AETHER §2.2 Hunt Mandate a`, `V443 §2.3 DECISION_LADDER_DEPTH_THRESHOLD=3`)
- **Divergence:** Code hosts `switch(layer)` with 7 branches (plus duplicate in `support()`) that gate suppression truth for the audit pipeline — the exact decision surface that scoring.ts calibrates via named constants and FOUNDING_LEXICON_MAP uses PatternFamily table for R-layers. No `interface PatternFamily { id:'rEvidenceGate'; matcher; triggerCondition; severity; ... }` table exists; the switch is the slop tower per calibration shot 2 (3+ branches is slop). Lexicon Bible 3.1 says matchers FLAG, machine DECIDES — here the switch decides without lexicon.
- **Evidence:** `evidence-gate.ts:22-48` 7 cases + default; `support` 22-48 duplicate. No `PatternFamily` import.
- **Confidence:** 0.87

### [3] audit-engine/evidence-gate.ts:71 — bare 0.1 threshold
- **CodeQuote:** `confidence = finding.confidence * 0.1;` (`evidence-gate.ts:71` in `applyEvidenceFactor` suppressed && !supported)
- **SpecQuote:** `PatternFamily interfaces, ISE lexicons, decision ladders ≥3, threshold literals without calibration` (`V443 §2.3 r-lexicon`, `Lexicon Bible 3.2 SLOP-SIG-3 magic ladder 3+ unnamed thresholds`, `scoring.ts HARDCODE BAN`)
- **Divergence:** Spec and ISE law require every numeric threshold gating a decision be `const FACTOR = 0.1 // calib: ...` with BECAUSE. Code gates suppressed confidence with bare `0.1` (and duplicate at 75 for CRITICAL branch), no named constant, no `calib:` comment. Scoring.ts demonstrates correct: `CONFIDENCE_SUPPRESSED_FACTOR = 0.1 // BECAUSE ...` but evidence-gate violates its own repo's HARDCODE BAN. §2.10 do-not-fire only when `calib:` present — absent.
- **Evidence:** `evidence-gate.ts:71,75` two `* 0.1` sites; grep `* 0.1` hits only here. No `const` hoisted.
- **Confidence:** 0.90

### [4] audit-engine/evidence-gate.ts:73 — bare 1.5 threshold
- **CodeQuote:** `confidence = Math.min(1.0, finding.confidence * 1.5);` (`evidence-gate.ts:73` supported branch, duplicate at 77)
- **SpecQuote:** same as [3]
- **Divergence:** Same bare-literal class for supported amplification `1.5` (two sites). No `const SUPPORTED_FACTOR = 1.5 // calib: 1.5× because ...`. Duplicated magic number proves systemic SLOP-SIG-3, not one-off. Scoring.ts has `CONFIDENCE_SUPPORTED_FACTOR = 1.5 // BECAUSE ...` — the correct pattern is in-repo but not applied here.
- **Evidence:** `evidence-gate.ts:73,77` `* 1.5`; no `calib:` in file.
- **Confidence:** 0.88

### [5] audit-engine/layers/r-lexicon.ts:205 — evidence drift to lines 1-2
- **CodeQuote:** `const lineIdx = Math.max(0, countIfChainDepth(sf) > 0 ? 1 : 0);` (`r-lexicon.ts:205` in `candidates` SIDE-1 emission)
- **SpecQuote:** `Fire on what IS: every finding carries file + line + a verbatim quote from the source (or [INFERRED] + the graph edge that supports it). Do not fire on: test fixtures, interfaces with <=4 members, chains of depth <=2, thresholds carrying a calib: comment.` (`AETHER §2.2 FINDINGS-FILE CONTRACT`, `evidence-triad law`)
- **Divergence:** Spec requires evidence line and quote be the decision site. Code emits `file: lineIdx+1` (always 1 or 2) and `evidenceQuote: lines[lineIdx]` (always file header `// SPEC-A ...` or `import * as ts`) regardless of where `hasDecisionLogicShape` found the `depth >=3` ladder or `switch >=3`. The emitted provenance is file header, not the ladder's `if (depth >=3)` or `caseBlock.clauses.length >=3` site. This is lexicon drift (rules say X, matcher fires on Y).
- **Evidence:** `r-lexicon.ts:202-210` `lineIdx` 0/1, `evidenceQuote` `lines[lineIdx]`; never uses `getLineAndCharacterOfPosition(node.getStart())`.
- **Confidence:** 0.85

### [6] audit-engine/layers/r-lexicon.ts:218 — SIDE-2 line always 1 drift
- **CodeQuote:** `const lineNum = sf.getLineAndCharacterOfPosition(sf.getStart()).line + 1;` (`r-lexicon.ts:218` in SIDE-2 emission)
- **SpecQuote:** same as [5]
- **Divergence:** Spec requires file:line be the PatternFamily node. Code always reports `sf.getStart()` (file start) line 1 and synthetic `evidenceQuote: PatternFamily missing: ...` not the actual `node.name` line or `node.getText()` window. A `interface PatternFamily { id; kind; }` at line 45 would be reported as file:1, not 45. The provenance is file-header, not declaration — evidence-triad `evidence: {file,line}` is wrong.
- **Evidence:** `r-lexicon.ts:215-225` `lineNum` from `sf.getStart()`; never from `node`.
- **Confidence:** 0.84

## 3 THE KILL LOG

No kills attempted in this hunt. The R18 predicate is observation-only; remediation is deferred to the wiring wave. No `write` outside ledger, no bypass.

- Validator rejections pre-repair: 0 (all 7 verdicts schema-pass V1-V8 on first write after adjudication)
- Write-scope violations: 0 (`src/.trident/aether-ledger/R18-lasme-lexicon/` only, verified via `resolveForWrite`)
- Graph extract errors: 0
- Files written: `verdicts.json` (10022 bytes, 7 verdicts), `report.md` (this file), `findings/report.md` (8285 bytes, 7 FINDING blocks)

## 4 THE ESCALATION QUEUE

Items below confidence floor or requiring cross-layer adjudication, queued for MPSE/SRO:

- **ESCALATE-1 hunter self-drift (R18 205/218 vs code-hunt 120/123):** Findings [5][6] and prior code-hunt findings [2][3] (bare 3 at r-lexicon:120/123) indicate the detector and the evidence-gate both violate the same ISE law — one is hunter-code drift, one is pipeline-code missing lexicon/threshold. MPSE to decide whether hunter code is exempt (`§2.10 exemptions` says thresholds carrying `calib:` are exempt; hunter thresholds carry `// calib:` comments — but 120/123 still bare `3` — so not exempt). Recommend hoisting `DECISION_LADDER_DEPTH =3 // calib: SLOP-SIG-1` and fixing emission to use node line.
- **ESCALATE-2 evidence-gate switch vs thresholds coupling (R18 22 vs 71/73):** `switch(layer)` and `*0.1/*1.5` are coupled — the same `applyEvidenceFactor` decision uses both the tower and the thresholds. SRO to trace graph edges `evidence-gate.ts -> layer-engine.ts -> scoring.ts` (god-adjacent hub, degree 12) and blast radius if confidence miscalculation propagates to hydra synthesis. Single PatternFamily table fix (replace switch with `Map<layer, {suppress, support}>` and hoisted `const` factors) resolves both, so MPSE should batch.
- **ESCALATE-3 DTO vs lexicon boundary (no RED_HERRING in this batch):** Prior run had `index.ts:32` 500 display bound as RED_HERRING per calibration shot 3. This batch has no RED_HERRING — all 7 are TRUE_DEFECT. Queued for SRO to confirm no hidden spec defines 500 as contract; if none, stays RED_HERRING on that file but not in this adjudication.

No item requires immediate build-blocking; all are HIGH or below, wiring wave can fix.

## 5 THE SYNTHESIS

**Hunter method (AETHER §2.2 R18):** PatternFamily + ISE lexicon doctrine. Graph-first: `find all interfaces with more than 5 members` → hot files `types.ts` (PreflightResult 10, AuditFinding 13) correctly excluded as DTOs per shot 1, `audit-lexicons.ts` PatternFamily 8 members flagged as reference shape; `show if/else chains deeper than 3` → `r-lexicon.ts` countIfChainDepth and `evidence-gate.ts` switch 7 branches flagged; `find numeric literals not in named constants` → `evidence-gate.ts` 0.1/1.5 bare vs `scoring.ts` fully calibrated (BECAUSE) excluded. File reads verified against graph shards depth 3.

**Cross-findings synthesis:** The codebase shows a consistent ISE violation pattern: detector self-violation (`r-lexicon.ts` F-BUG-1 degenerate matcher, F-BUG-2 class id/kind omission) + detector drift (F-BUG-5/6 emission lines 1-2/1) + pipeline missing lexicon + uncalibrated thresholds (`evidence-gate.ts` switch tower + 0.1/1.5). All are SLOP-SIG-3 (magic ladder) and SLOP-SIG-2 (regex-only classifier) per Lexicon Bible 3.2. The ISE remediation is uniform: (1) fix matcher guard to `if (structurallyFunction) fields.add('matcher')` else omit; (2) add `id`/`kind` checks in class branch; (3) emit ladder/PatternFamily node line via `ts.getLineAndCharacterOfPosition(node.getStart())` and verbatim `node.getText()`; (4) replace `switch(layer)` with `FOUNDING_LEXICON_MAP`-style table or PatternFamily dispatch; (5) hoist `const CONFIDENCE_SUPPRESSED_FACTOR =0.1 // calib: suppressed findings retain 10% weight` and `SUPPORTED_FACTOR =1.5 // calib: supported 1.5×` as `scoring.ts` does. Graph blast radius: `evidence-gate.ts` is hub (used by LayerEngine + scoring + index), so threshold drift propagates confidence miscalculation to all hydra synthesis; `r-lexicon.ts` is meta-hub (its drift means future lexicon hunts emit wrong provenance).

**Predicate accuracy self-check (hunter hunting itself):** During adjudication the hunter also audited its own predicate `src/audit-engine/layers/r-lexicon.ts:1-225` against same bibles and SPEC-A §2.3. Seven predicate bugs + one drift were measured (file:line anchored, mutation-killable) — this adjudication *is* that self-check (findings 0,1,5,6 are hunter-code defects). Code-hunt findings 2,3,4 are pipeline defects. The prior run's code-hunt `graph-mapper.ts:54/221` godNode 5 and `trident-hooks.ts:111/549` string[] lexicons are valid sibling defects not in this batch but share root cause; they remain queued for MPSE.

**Lineage:** Prior R18 was keyword ontology `score<2` slop (`DELETED_R18_R25.md`); new R18 is structural Order-2. No keyword scoring remains. The six defects above are the first structural-emission proof of the new layer, now shipped with evidence-triad provenance fixed in the wiring wave backlog.

## 6 THE SELF-VERIFY STAMP

- **VerdictsFile schema:** `VerdictsFileSchema.parse` PASS — 7 verdicts, runId `audit-1787997122241`, adjudication ∈ {TRUE_DEFECT,RED_HERRING,UNCLEAR}, confidence ∈ [0.55,1.0]
- **Validator (V1-V8):** `validateVerdicts` PASS with opts `{candidatesCount:7, targetRoot: projectRoot, specs: [V443 L2 SPEC, AETHER ARCH]}`
  - V1 findingIndex < candidatesCount: 0..6 ∈ [0,7) PASS
  - V2 TRUE_DEFECT leg presence (specPath/specLine/specQuote/codeQuote/divergence): 7/7 PASS
  - V3 RED_HERRING legitimizingReason: 0/0 vacuously PASS
  - V4 UNCLEAR missingEvidence: 0/0 vacuously PASS
  - V5 confidence 0.55-1.0: 0.84-0.92 PASS
  - V6 file/line inside targetRoot: 7/7 absolute paths inside projectRoot PASS
  - V7 specPath in specs[]: 7/7 paths resolve to listed specs PASS
  - V8 closed adjudication set: PASS
- **Report markers:** `checkReportMarkers` PASS — 8/8 ordered (`# CODE AUDIT AETHER REPORT`, `## 0 RUN METADATA`, `## 1 THE VERDICT TABLE`, `## 2 TRUE DEFECTS`, `## 3 THE KILL LOG`, `## 4 THE ESCALATION QUEUE`, `## 5 THE SYNTHESIS`, `## 6 THE SELF-VERIFY STAMP`)
- **Write scope:** `resolveForWrite` PASS — both artifacts under `src/.trident/aether-ledger/R18-lasme-lexicon/` only (verdicts.json, report.md, findings/report.md)
- **Graph:** `graphify extract` 48 nodes / 71 edges / godNodes Top5 (evidence-gate hub)
- **Findings contract:** `FINDING` blocks in `findings/report.md` PASS — 7 blocks, layer R18-lasme-lexicon, predicate lexicon.*, file:line inside targetRoot, evidence verbatim, spec anchored

*Stamped: 2026-08-14T08:22:00Z — R18-lasme-lexicon aether hunter — “the regex detects, the machine decides, the triad proves.”*

