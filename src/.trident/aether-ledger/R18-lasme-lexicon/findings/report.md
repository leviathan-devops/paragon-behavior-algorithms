# R18-lasme-lexicon — Lexicon Bug Hunter Report

**Target:** `src` under `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3`
**Layer:** R18-lasme-lexicon (lexicon integrity)
**Date:** 2026-05-13
**Hunter:** Muse Spark — R18 aether

## METHODOLOGY

Graph-first audit per GRAPH TOOLS USAGE LAW. Queried graph concepts before file reads:
- `find all interfaces with more than 5 members` → hot files: `src/audit-engine/types.ts` (PreflightResult 10 members, AuditFinding 13 members), `src/audit-engine/lexicons/audit-lexicons.ts` (PatternFamily 8 members), `src/hydra/aether-templates/types.ts` (AuditorTemplate)
- `show if/else chains deeper than 3` → hot files: `src/audit-engine/layers/r-lexicon.ts` (countIfChainDepth), `src/audit-engine/evidence-gate.ts` (switch 7 branches), `src/audit-engine/scoring.ts` (grade ladder but calibrated)
- `find numeric literals not in named constants` → hot files: `src/audit-engine/evidence-gate.ts` (0.1/1.5 bare), `src/audit-engine/layers/r-lexicon.ts` (only calibrated 3), `src/audit-engine/lexicons/` (calibrated)

File reads verified against graph shards depth 3. Calibrated against 3 shots:
- SHOT 1 DTO width without matcher/order-2 is RED_HERRING (validated: PreflightResult is data DTO, not lexicon — excluded)
- SHOT 2 5-branch ladder with uncalibrated thresholds is TRUE_DEFECT (validated: evidence-gate switch + bare 0.1/1.5 matches)
- SHOT 3 bare numeric without decision context is UNCLEAR (validated: clamp bound 1.0 in scoring excluded)

One finding per failure class; evidence is verbatim source line or [INFERRED] graph edge.

## SPEC GROUND TRUTH

- **PatternFamily 8-field identity** (Lexicon Bible PART 1.2 + ISE T1:30): `src/audit-engine/layers/r-lexicon.ts:7` — `PATTERN_FAMILY_REQUIRED_FIELDS = ['id','kind','matcher','triggerCondition','severity','messageTemplate','remediationHook','exampleHits']` — every lexicon member must be typed, matcher Order-2+ `(node,ctx)=>MatchResult`.
- **ISE Order-2+ law**: `src/audit-engine/lexicons/audit-lexicons.ts:23` — `matcher: (node: CodeConstruct, ctx: AnalysisContext) => MatchResult | null; // Order-2+ — AST-structural, takes construct+ctx` — bare regex or non-ctx matcher is slop, registration must reject.
- **Decision ladder → lexicon**: `src/audit-engine/layers/r-lexicon.ts:6` — `DECISION_LADDER_DEPTH_THRESHOLD = 3; // calib: V443 §2.3 depth>=3 decision ladder minimum (ISE SLOP-SIG-1)` — ≥3 branches must be driven by typed PatternFamily, not if/else/switch tower.
- **Named-threshold law**: `src/audit-engine/scoring.ts:15` header — `HARDCODE BAN: every numeric threshold is a NAMED const with a BECAUSE comment — grep audit enforces.` — bare literal gating a decision with no `// calib:` is violation.
- **Evidence-triad law**: `src/audit-engine/lexicons/audit-lexicons.ts:143` — `// THE EVIDENCE TRIAD: every finding carries {Pattern,State,Evidence} — no triplet = no finding.` + lasme-lexicon template `Fire on what IS: every finding carries file+line+a verbatim quote ... Do not fire on thresholds carrying a calib: comment`.

## FINDINGS

## FINDING: degenerate lexicon — PatternFamily matcher accepts non-function shape as valid
- layer: R18-lasme-lexicon
- predicate: lexicon.degenerate
- object: Contract
- file: src/audit-engine/layers/r-lexicon.ts:71
- evidence: "if (structurallyFunction) fields.add('matcher'); else fields.add('matcher');"
- spec: src/audit-engine/lexicons/audit-lexicons.ts:23 matcher must take (node, ctx) Order-2+ and decide on AST structure
- severity: HIGH
- confidence: 0.92

## FINDING: degenerate lexicon — class PatternFamily never checks id/kind, forces false SIDE-2
- layer: R18-lasme-lexicon
- predicate: lexicon.family
- object: Contract
- file: src/audit-engine/layers/r-lexicon.ts:88
- evidence: "if (memberName === 'exampleHits') { fields.add('exampleHits'); hasExampleHits = true; }"
- spec: src/audit-engine/layers/r-lexicon.ts:7 PATTERN_FAMILY_REQUIRED_FIELDS 8-field identity including id and kind
- severity: HIGH
- confidence: 0.89

## FINDING: missing lexicon — 7-branch switch tower in EvidenceGate with no PatternFamily
- layer: R18-lasme-lexicon
- predicate: lexicon.missing
- object: Contract
- file: src/audit-engine/evidence-gate.ts:22
- evidence: "switch (layer) {"
- spec: src/audit-engine/layers/r-lexicon.ts:6 DECISION_LADDER_DEPTH_THRESHOLD = 3; depth>=3 decision ladder minimum must be lexicon-driven (ISE SLOP-SIG-1)
- severity: HIGH
- confidence: 0.87

## FINDING: uncalibrated threshold — bare 0.1 literal gates confidence decision without named constant or calib
- layer: R18-lasme-lexicon
- predicate: lexicon.threshold
- object: Contract
- file: src/audit-engine/evidence-gate.ts:71
- evidence: "confidence = finding.confidence * 0.1;"
- spec: src/audit-engine/scoring.ts:15 HARDCODE BAN: every numeric threshold is a NAMED const with a BECAUSE comment
- severity: HIGH
- confidence: 0.9

## FINDING: uncalibrated threshold — bare 1.5 literal amplifies confidence without calibration
- layer: R18-lasme-lexicon
- predicate: lexicon.threshold
- object: Contract
- file: src/audit-engine/evidence-gate.ts:73
- evidence: "confidence = Math.min(1.0, finding.confidence * 1.5);"
- spec: src/audit-engine/scoring.ts:15 HARDCODE BAN: every numeric threshold is a NAMED const with a BECAUSE comment
- severity: MEDIUM
- confidence: 0.88

## FINDING: lexicon drift — evidence quote always line 1-2, not the decision ladder site
- layer: R18-lasme-lexicon
- predicate: lexicon.drift
- object: Contract
- file: src/audit-engine/layers/r-lexicon.ts:205
- evidence: "const lineIdx = Math.max(0, countIfChainDepth(sf) > 0 ? 1 : 0);"
- spec: src/hydra/aether-templates/hunters/lasme-lexicon.ts:18 Fire on what IS: every finding carries file+line+a verbatim quote from the source — evidence must match the decision site
- severity: MEDIUM
- confidence: 0.85

## FINDING: lexicon drift — SIDE-2 PatternFamily finding always reports line 1, not declaration line
- layer: R18-lasme-lexicon
- predicate: lexicon.drift
- object: Contract
- file: src/audit-engine/layers/r-lexicon.ts:218
- evidence: "const lineNum = sf.getLineAndCharacterOfPosition(sf.getStart()).line + 1;"
- spec: src/hydra/aether-templates/hunters/lasme-lexicon.ts:18 Fire on what IS: every finding carries file+line+a verbatim quote — declaration line must be the PatternFamily node, not file start
- severity: MEDIUM
- confidence: 0.84

## SUMMARY

7 findings — 3 HIGH (degenerate matcher, missing id/kind, missing lexicon for switch tower + uncalibrated 0.1), 2 MEDIUM thresholds (1.5) + 2 MEDIUM drift. The lexicon detector `src/audit-engine/layers/r-lexicon.ts` is itself degenerate: its PatternFamily shape check accepts any matcher shape (both branches add `matcher`), its class branch never validates `id`/`kind`, and its evidence emission is detached from the decision site (always lines 1-2 / line 1). This allows degenerate lexicons to pass and emits drifted evidence. Separately, `src/audit-engine/evidence-gate.ts` hosts the canonical missing-lexicon + uncalibrated-threshold pair: a 7-branch `switch(layer)` tower that should be a lexicon/table but is a switch, and two bare literals `0.1`/`1.5` gating confidence without named constants or `// calib:` comments, directly violating the scoring-module HARDCODE BAN that is enforced elsewhere. No finding fires on scoring.ts (all thresholds are `// BECAUSE` named), on `PreflightResult` DTO (wide interface without decision semantics — SHOT 1 RED_HERRING), or on `1.0` clamp bounds without decision context (SHOT 3 UNCLEAR). Graph blast radius: `evidence-gate.ts` is a god-adjacent hub (EvidenceGate used by LayerEngine + scoring + audit-engine/index), so threshold drift there propagates confidence miscalculation to all hydra synthesis. Recommended fixes: (1) fix matcher type guard to `if (structurallyFunction) fields.add('matcher')` else do not add, (2) add `id`/`kind` checks in class branch, (3) emit ladder line via AST node position, not `lines[1]`, (4) replace switch with `FOUNDING_LEXICON_MAP`-style table or PatternFamily dispatch, (5) extract `CONFIDENCE_SUPPRESSED_FACTOR=0.1` and `CONFIDENCE_SUPPORTED_FACTOR=1.5` as `// calib:` named constants (as scoring.ts does).
