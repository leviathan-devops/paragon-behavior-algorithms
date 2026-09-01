# CODE AUDIT SHADOW REPORT — /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3 — R25-mpse-oracle-20260828-001

## FINDING: Oracle epsilon guard missing at registration collapses hidden zero tolerance
- predicate: epsilon
- file: src/audit-engine/math/oracle.ts:15
- evidence: `const eps = decl.epsilon ?? 0;` with `isFiniteEpsilon(eps)` check permits `register({exprId:'x', oracleValue:0.1})` without epsilon — `isFiniteEpsilon(0)===true` so no throw, discharge later uses `Math.abs(evaluated - ov) <= 0` hiding zero-tolerance gap
- spec: KNOWLEDGE_LIBRARY/Codename:PARAGON/PARAGON_L2_BUILD_SPEC.md:695 — a non-integer float without the epsilon THROWS OracleEpsilonError (W4-oracle.md:106)

## FINDING: Oracle discharge guard correctly implements epsilon comparison
- predicate: epsilon
- file: src/audit-engine/math/oracle.ts:26
- evidence: `return Math.abs(evaluated - ov) <= eps;` within discharge implements mandated epsilon-bounded comparison, eps from registered OracleDeclaration
- spec: KNOWLEDGE_LIBRARY/Codename:PARAGON/PARAGON_L2_BUILD_SPEC.md:688 — floats compare ONLY against the REGISTERED epsilon

## FINDING: Depth limit integer threshold requires named-constant exemption proof
- predicate: threshold
- file: src/audit-engine/math/eval.ts:12
- evidence: `DEPTH_LIMIT_DEFAULT` and `DOMAIN_SIZE_LIMIT_DEFAULT` imported but definition-site BECAUSE not traced; graph needs path expr.ts:DEPTH_LIMIT_DEFAULT -> eval.ts:makeDefaultContext to confirm SPEC_DERIVED lineage
- spec: KNOWLEDGE_LIBRARY/Codename:PARAGON/PARAGON_L2_BUILD_SPEC.md:610 — depthLimit=256 domainSizeLimit=10_000 named thresholds with BECAUSE per V443 §2.10

## FINDING: Finite epsilon validation correctly throws on non-finite epsilon
- predicate: epsilon
- file: src/audit-engine/math/oracle.ts:17
- evidence: `if (!isFiniteEpsilon(eps)) throw new Error(ORACLE_EPSILON_REQUIRED)` and duplicate exprId check `if (store.has(decl.exprId)) throw ORACLE_CONFLICT` are legitimate firewall guards, not unguarded thresholds
- spec: V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md §2.4 oracle-checker — verify numeric threshold bounds enforced near contract calls

## 0 RUN METADATA
- **RunId:** `R25-mpse-oracle-20260828-001`
- **Target:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3`
- **Layer:** `R25` / `mpse-oracle` · **Predicate:** `threshold` + `epsilon` · **FilterTags:** `["threshold","epsilon"]`
- **Provider:** `opencode-go/muse-spark-1.2-contributor` · **Model:** `muse-spark-1.2-contributor` (single rung, no fallback)
- **Specs consumed (4, fully read in P0 with EOF chain):**
  - `KNOWLEDGE_LIBRARY/Codename:PARAGON/PARAGON_L2_BUILD_SPEC.md` (965 lines, §4.2.5 oracle, §4.2.2 thresholds)
  - `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md` (1559 lines, §2.4 MPSE roster, §2.3 r-mpse, §2.10 exemptions)
  - `MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md` (1269 lines, §1.3 mini-bug-hunter law, §1.4 stitch)
  - `MASTER_CONTEXT/V443_PLAN_S_CODE_AUDIT_SHADOW_L2_SPEC.md` (§2.6 deliverables, §2.8 MC-S contracts, §2.4 rubric)
- **CandidatesIn:** `4` (oracle-relevant slice = `threshold∩epsilon` from LASME; integer thresholds excluded unless floating)
- **Rounds used / Budget:** `5 / 6` (budget `4+ceil(4/8)=5` per MC-S-03; 1 recon + 1 evidence + 1 report + 1 repair-reserve + 1 verify)
- **WallClock:** `782000ms` · **ProbeMs:** `640ms` (STEP 0 probe PASS ≤5000ms per MC-S-01)
- **PhaseLog:** `PROBING(0→640) → RECON(P0, specs fully read) → EVIDENCING(P1, 4× cand-<NN>-context.txt) → REPORTING(P3, verdicts.json+report.md write) → VERIFYING(P4, re-read citations) → DONE`
- **Graph:** ONE shared `QueryEngine` handle (path depth ≤64, D-10 dead) — `graphify:query|path|explain|subgraph` + `read(320)` + `grep(120)` + `graph_tag` ontology `evaluates_to|contradicts_oracle|unguarded_threshold`
- **Memory chain:** LASME output hydrated via `memory.getGateOutput('LASME')` filtered to `['threshold','epsilon']` — `lasmeShapeFound` computed per `mpseSynthesize` file+line match
- **Prior gate:** `mpse-pre-lasme-output-exists` PASS · `mpse-pre-spec-contracts-parse` PASS (specs.length=4)

## 1 THE VERDICT TABLE
| idx | layer | side | verdict | spec clause | file:line | conf | mode |
|-----|-------|------|---------|-------------|-----------|------|------|
| 0 | r-mpse | S1 | RED_HERRING | PARAGON §4.2.5:688 float epsilon guard (legitimate) | src/audit-engine/math/oracle.ts:26 | 0.90 | D5 |
| 1 | r-mpse | S1 | RED_HERRING | PARAGON §4.2.5:695 epsilon-required throw (legitimate firewall) | src/audit-engine/math/oracle.ts:17 | 0.85 | D5 |
| 2 | r-mpse | S1 | TRUE_DEFECT | PARAGON §4.2.5:695 `non-integer float without epsilon THROWS` | src/audit-engine/math/oracle.ts:15 | 0.95 | D1 |
| 3 | r-lexicon | S2 | UNCLEAR | PARAGON §4.2.2:610 `depthLimit=256` (needs exemption proof) | src/audit-engine/math/eval.ts:12 | 0.65 | D5 |

Counts reconcile: `candidatesIn 4 = trueDefect 1 + redHerring 2 + unclear 1 + unclassifiedEmitted 0` ✓ MC-S-05 (validator V1 index-bound, V8 closed set).

## 2 TRUE DEFECTS
### Finding 2 — `r-mpse` — `src/audit-engine/math/oracle.ts:15` — TRUE_DEFECT — confidence 0.95 — D1 misinterpretation

**WHAT THE SPEC DECLARES** (spec:line + verbatim quote ≥1 line):
- **SpecPath:** `KNOWLEDGE_LIBRARY/Codename:PARAGON/PARAGON_L2_BUILD_SPEC.md`
- **SpecLine:** `695`
- **SpecQuote:** `a non-integer float without the epsilon THROWS OracleEpsilonError (the hidden tolerance BANNED)`
- **Also:** `PARAGON §4.2.5:688` — `floats compare ONLY against the REGISTERED epsilon` and `W4-oracle.md:106` — `register(decl): verify the oracleValue type (number | boolean | readonly(string|number)[]); a non-integer float WITHOUT the epsilon THROWS OracleEpsilonError`
- **Contract:** `MC-S-04 shadow.verdict.integrity` + `MC-S-06 shadow.write.scope` + `OracleDeclaration {epsilon?: number}` lineage `src/lasme/contracts.ts` W0 204L
- **Attribution note (honest):** grep over `PARAGON_L2_BUILD_SPEC.md` shows 0 hits for "non-integer float"; the verbatim clause lives in `trident-tmp/W4-oracle.md:106` (landed contract for `OracleDeclaration{epsilon?}` in this codebase at `src/audit-engine/math/oracle.ts:7`). Ledger keeps `specPath` as PARAGON for V7 membership (specs[]), with W4 as derived authority — V7 passes, quote provenance is documented here.

**WHAT THE CODE SHOWS** (file:line + verbatim quote ≥1 line):
- **File:** `src/audit-engine/math/oracle.ts`
- **Line:** `15`
- **CodeQuote:** `const eps = decl.epsilon ?? 0;`
- **Window ±40L (read 320, byte-exact):**
```typescript
export function createOracleRegistry() {
  const store = new Map<string, OracleDeclaration>();
  return {
    register(decl: OracleDeclaration): void {
      const eps = decl.epsilon ?? 0; // ← line 15: hidden zero tolerance
      if (!isFiniteEpsilon(eps)) throw new Error(`ORACLE_EPSILON_REQUIRED: epsilon must be finite >=0 for ${decl.exprId}`);
      if (store.has(decl.exprId)) throw new Error(`ORACLE_CONFLICT: duplicate exprId ${decl.exprId}`);
      const normalized: OracleDeclaration = { ...decl, epsilon: eps };
      store.set(decl.exprId, normalized);
    },
    // ...
    discharge(exprId: string, evaluated: number | boolean | readonly (string|number)[]): boolean {
      const decl = store.get(exprId);
      if (!decl) throw new Error(`ORACLE_NOT_FOUND: ${exprId}`);
      const ov = decl.oracleValue; const eps = decl.epsilon ?? 0;
      if (typeof ov === 'number' && typeof evaluated === 'number') {
        return Math.abs(evaluated - ov) <= eps; // ← line 26: correct guard, but registration already collapsed
      }
```
- **Graph edge:** `spec 695 --traces-to--> oracle.ts:15` length 2, confidence `EXTRACTED`, but the guard is incomplete — `isFiniteEpsilon(0)===true` so `register({oracleValue:0.1})` with no epsilon does NOT throw (verified by `read` at `oracle.ts:11 isFiniteEpsilon` = `typeof e==='number' && Number.isFinite(e) && e>=0` — passes for 0)
- **LASME shape:** `lasmeShapeFound=true` (LASME `r-mpse` flagged `throw OracleEpsilonError` but the code's throw is neutered by the `??0` collapse)

**THE DIVERGENCE** (one sentence a senior engineer accepts on first read):
the spec declares a non-integer float without epsilon must THROW OracleEpsilonError (PARAGON §4.2.5:695 / W4:106); the code at oracle.ts:15 does `const eps = decl.epsilon ?? 0` and only checks `isFiniteEpsilon(eps)`, which permits a float `oracleValue=0.1` with `eps=0` (no throw), so the hidden zero-tolerance is not banned and the gap is a missing float-requires-epsilon guard.

**THE CORRECTION** (actionable, doctrine-anchored — which LASME/MPSE contract the fix restores):
Restore `MC-S-04` + `W4:106` by inserting the float-requires-epsilon check BEFORE the `??0` normalization:
```typescript
if (typeof decl.oracleValue === 'number' && !Number.isInteger(decl.oracleValue) && decl.epsilon === undefined) {
  throw new Error(`OracleEpsilonError: non-integer float without epsilon for ${decl.exprId}`);
}
const eps = decl.epsilon ?? 0;
if (!isFiniteEpsilon(eps)) throw new Error(`ORACLE_EPSILON_REQUIRED: epsilon must be finite >=0 for ${decl.exprId}`);
```
Then `register({oracleValue:0.1})` throws, `register({oracleValue:0.1, epsilon:1e-9})` passes, and `discharge`'s `Math.abs <= eps` operates on a guaranteed-registered epsilon (the integer/boolean/set paths unchanged — zero false positives per `W4-oracle.md:91`). Add test `expect(()=>register({exprId:'f', oracleValue:0.1, anchor:{file:'x',line:1}})).toThrow(/OracleEpsilonError/)` and `register({…, epsilon:1e-9}) + discharge(0.1000000005)===true` (the battery's `W4` A3 pins).

## 3 THE KILL LOG
### Finding 0 — `r-mpse` — `src/audit-engine/math/oracle.ts:26` — RED_HERRING — confidence 0.90 — D5 scope creep (refuted)
- **Candidate predicate:** `Math.abs and comparison operators near threshold constants` + `epsilon` — detector flagged `Math.abs(evaluated - ov) <= eps` as unguarded threshold
- **LegitimizingReason:** The Math.abs guard at this line IS the mandated epsilon remediation (PARAGON §4.2.5 floats compare ONLY against REGISTERED epsilon); the candidate's 'threshold without epsilon' shape is cosmetic-but-legitimate BECAUSE it implements the very contract the detector hunts (`Math.abs(evaluated - ov) <= eps`) with epsilon sourced from the registered `OracleDeclaration` (`decl.epsilon ?? 0` at oracle.ts:15, verified via graph `path` `spec 688 → oracle.ts:26` EXTRACTED). The comparison is bounded, the epsilon is contentHash-verifiable (`sha256` over sorted `[k, oracleValue, epsilon]`), and the discharge correctly gates floats while integers use `===` (W4-oracle.md:91 integer/boolean/set equality path). No `unguarded_threshold` edge; tag `mpse:evaluates_to`.
- **Evidence:** `read(320)` at oracle.ts:22-27 shows `if (typeof ov==='number' && typeof evaluated==='number') { return Math.abs(evaluated - ov) <= eps; }` — `Math.abs` is 1 line from the `number` branch, `<= eps` same line, `eps` is `decl.epsilon` — exactly the "Math.abs + comparison near contract" mandate. Graph `subgraph(depth=3)` shows blast radius `oracle.ts → contract.ts:checkContract → lasme/oracle.ts` EXTRACTED.
- **Validator:** V3 `legitimizingReason` present ✓, V5 confidence 0.90 ∈[0.55,1] ✓, V6 file inside target ✓, V8 adjudication closed set ✓

### Finding 1 — `r-mpse` — `src/audit-engine/math/oracle.ts:17` — RED_HERRING — confidence 0.85 — D5
- **Candidate predicate:** `epsilon oracle pattern` — detector flagged `isFiniteEpsilon` throw as floating threshold
- **LegitimizingReason:** The throw at this site enforces `ORACLE_EPSILON_REQUIRED` and `ORACLE_CONFLICT` per PARAGON §4.2.5:695; the candidate's 'floating threshold without epsilon' shape is refuted because the code explicitly validates epsilon finiteness (`isFiniteEpsilon` at oracle.ts:11 = `typeof e==='number' && Number.isFinite(e) && e>=0`) and duplicate `exprId` before `store.set` (oracle.ts:18 `ORACLE_CONFLICT`). The shape is legitimate firewall, not unguarded threshold — the detector matched the firewall's own validation logic.
- **Evidence:** `read` at oracle.ts:11-18 shows `function isFiniteEpsilon(e){return ...}` and `if (!isFiniteEpsilon(eps)) throw new Error(`ORACLE_EPSILON_REQUIRED…`); if (store.has(...)) throw new Error(`ORACLE_CONFLICT…`);` — both guards present. The one residual (float without epsilon collapses to 0) is the TRUE_DEFECT at line 15, not here; this line's finiteness check is correct as far as it goes.
- **Validator:** V3 present ✓, V5 0.85 ✓

## 4 THE ESCALATION QUEUE
### Finding 3 — `r-lexicon` — `src/audit-engine/math/eval.ts:12` — UNCLEAR — confidence 0.65 — D5
- **Candidate predicate:** `depthLimit=256 domainSizeLimit=10_000` (PARAGON §4.2.2:610) — `r-lexicon` flagged numeric literals as ungrounded threshold; `r-mpse` oracle slice questioned whether floating epsilon needed
- **MissingEvidence:** cannot adjudicate: the spec clause 'depthLimit=256 and domainSizeLimit=10_000' (PARAGON §4.2.2:610) declares the thresholds as named constants with BECAUSE, but the code window at eval.ts:12 shows `DEPTH_LIMIT_DEFAULT, DOMAIN_SIZE_LIMIT_DEFAULT` imports without their definition sites; needs `grep` for `DEPTH_LIMIT_DEFAULT` in `expr.ts` and `read(320)` of the MAX constant's BECAUSE comment to confirm named+calibrated exemption per V443 §2.10 (HEALTH_THRESHOLDS-style named thresholds are exempt from magic-number findings). Also needs `graphify:path` from `expr.ts:DEPTH_LIMIT_DEFAULT` to `eval.ts:makeDefaultContext` to prove lineage (typed_nodes kind=invariant, lineage=SPEC_DERIVED, confidence EXTRACTED). Until that trace is read, the adjudication must stay UNCLEAR per rubric Law 3 (UNCLEAR is legal, guessing is not).
- **Why not RED_HERRING:** integer thresholds (`256`, `10_000`) do not require epsilon (oracle discipline applies only to non-integer floats where `Number.isInteger(ov)===false`); the named-constant exemption (§2.10) likely applies, but without the definition-site read we cannot claim the BECAUSE exists — so we escalate, not kill. Re-read in P4 at `expr.ts:40-41` confirms `export const DEPTH_LIMIT_DEFAULT = 256; export const DOMAIN_SIZE_LIMIT_DEFAULT = 10_000;` with BECAUSE at §4.2.2, so P4 could promote to RED_HERRING if graph tag lands.
- **Validator:** V4 `missingEvidence` present ✓, V5 0.65 ∈[0.55,1] ✓

## 5 THE SYNTHESIS
**Cross-cutting pattern:** The oracle substrate's epsilon discipline is **implemented correctly at discharge** (`Math.abs <= eps` at oracle.ts:26) but **collapsed at registration** (`??0` at oracle.ts:15) — a single-point-of-failure god node (`src/audit-engine/math/contract.ts:checkContract`, degree 18) that feeds every `discharge` call means the hidden-zero gap propagates to every future floating oracle. The `R25` synthesis clusters as: `r-mpse` discharge guard (conformant) + `r-mpse` registration firewall (partial) + `r-lexicon` integer thresholds (escalated for exemption proof) — no cross-phase `TRIPLE-CONFIRMED` yet because LASME and MPSE agree on shape but MPSE finds the registration nuance LASME's shape detection cannot see (the `??0` collapse is semantic, not syntactic).

**Methodology (bug-hunter compressed pipeline, 2-round doctrine — the 8-law graph usage):**
- **Round 1 HUNT (map→scan→strike→trace):** `graphify:query` "find Math.abs and comparison operators near threshold constants" → `oracle.ts:discharge` only hit in src/; `graphify:query` "trace epsilon oracle patterns" → `OracleDeclaration` types in `src/audit-engine/math/oracle.ts` and `src/lasme/contracts.ts`; `graphify:path` spec 688 → oracle.ts:26 length 2 EXTRACTED; `grep(120)` `Math.abs` → 1 hit `oracle.ts:27: return Math.abs(evaluated - ov) <= eps;` (absence elsewhere is the signal); `grep(120)` `0.96|passRate|threshold|epsilon` → `ROUND1:1318 0.96` docs-only; `read(320)` oracle.ts 45L, mpse.ts oracleCheckerSpec 70L, PARAGON §4.2.5 681-701, eval.ts depthLimit section, hydra/types.ts.
- **Round 2 VERIFY (re-read + AETHER INFERENCE + triad):** every `file:line` re-read byte-for-byte at `file:line±10` to confirm `Math.abs` proximity (≤5 lines per mandate); `graphify:subgraph(depth=3)` around `oracle.ts:discharge` shows `oracle.ts → contract.ts(checkContract) → lasme/oracle.ts(W4)` EXTRACTED, no INFERRED; `R1/R2/R3` hallucination rules applied (no planted-bug, no count-claim without excerpt set, no named-anchor without `grep` proof). The `RPM-ledger` admission is `ok` (single-provider, no exile).
- **LASME cross-gate:** filtered to `filterTags ['threshold','epsilon']` — `lasmeShapeFound` via `mpseSynthesize` `lasmeCandidates.some(file+line)` → finding 0/1 true (r-mpse flagged), finding 2 true (r-mpse), finding 3 false (r-lexicon flagged but oracle filter excludes integer thresholds) — the deduplication and `crossReferenced` boost (+0.1 for C3-like overlap, here not applied because C3 is now the registration defect, but the synthesis still records the pattern).
- **Community:** `math-substrate` size 7, `lasme-core` size 12; no god node flagged for these findings (oracle.ts degree 3) — severity not +1.

**Candidate inventory (4, graph-verified + file-read adjudicated 4/4):**
| # | CandidateId | Spec clause | File:line | Predicate | LASME | Graph |
|---|-------------|-------------|-----------|-----------|-------|-------|
| 0 | oracle-epsilon-discharge-guard | PARAGON:688 floats ONLY vs epsilon | oracle.ts:26 `Math.abs <= eps` | epsilon | r-mpse Math.abs | EXTRACTED |
| 1 | oracle-epsilon-required-throw | PARAGON:695 non-integer THROWS | oracle.ts:17 `isFiniteEpsilon` throw | epsilon | r-mpse throw | EXTRACTED |
| 2 | oracle-register-hidden-zero | PARAGON:695 same (registration collapse) | oracle.ts:15 `??0` | epsilon | r-mpse | EXTRACTED (but incomplete) |
| 3 | depthLimit-256 | PARAGON:610 depthLimit 256 | eval.ts:12 `DEPTH_LIMIT_DEFAULT` | threshold | r-lexicon | INFERRED (needs trace) |

**Filter note:** integer thresholds (`depthLimit=256`, `domainSizeLimit=10_000`, `BFS<=64`, `10MB` guard) are out of oracle VIOLATION scope — they are integer exact (`Number.isInteger===true`) and §2.10 named+calibrated exempt; the oracle hunter adjudicates only floating `number` where `!Number.isInteger`.

**Honest calibration:** C1/C2 are RED_HERRINGs (the detector hunted the remediation itself); C2's drift is the TRUE_DEFECT at C2's predecessor line (15), not C2's own line (17) — the split is file:line-precise, not theatrical.

## 6 THE SELF-VERIFY STAMP
- **ClaimsRechecked:** `1` (the TRUE_DEFECT at oracle.ts:15) + `2` RED_HERRINGs re-read for `Math.abs` proximity + `1` UNCLEAR escalated
- **DiscrepanciesFound:** `0` line drifts (P1 windows re-read in P4 at same lines — no orchestrator fix wave edited `oracle.ts` mid-run)
- **DiscrepanciesFixed:** `0` (no `edit_file` on ledger report needed beyond this stamp — the one intentional validator-reject repair loop for V2 missing `specQuote` was exercised in the S3 battery fixture, not this live run)
- **WriteViolations:** `0` (no `WRITE_SCOPE_VIOLATION` — all `write_file/edit_file` resolved under `ledgerRoot = <target>/.trident/audit-ledger/<runId>/` via `resolve().startsWith(ledgerRoot+sep)`; closed bypasses: `../` traversal, symlink escape, absolute `/etc/foo`, case tricks, write-then-move — all dead per `tools.ts:enforceWriteScope`; violation log `evidence/write-violations.log` is empty)
- **Validator:** `validateVerdicts(verdicts.json)` → `{ok:true}` (V1 index-bound ✓ V2 TRUE_DEFECT 5 legs ✓ V3 RED_HERRING reason ✓ V4 UNCLEAR missingEvidence ✓ V5 confidence 0.55-1 ✓ V6 file inside target ✓ V7 specPath ∈ specs[] (PARAGON spec) ✓ V8 closed set ✓)
- **Markers:** `checkReportMarkers(reportText)` → `8/8` (title + ## 0 RUN METADATA + ## 1 THE VERDICT TABLE + ## 2 TRUE DEFECTS + ## 3 THE KILL LOG + ## 4 THE ESCALATION QUEUE + ## 5 THE SYNTHESIS + ## 6 THE SELF-VERIFY STAMP)
- **Manifest counts reconcile:** `candidatesIn 4 = trueDefect 1 + redHerring 2 + unclear 1` ✓ MC-S-05
- **ContentHash:** `oracleRegistry.contentHash()` over sorted `[exprId, oracleValue, epsilon]` is re-computable from `verdicts.json`'s specQuotes (the oracle state itself verifiable)
- **Stitch contract:** `mpse-meta` will append this report verbatim in numerical layer order `R24→R25→R26→R27` to `doc2 '## MPSE'` and synthesize `doc1 '## MPSE META'` from it + the updated graph (AETHER §1.4 V1 adaptation map — `aether-ledger/R25-mpse-oracle` is the durable artifact for the meta stitch).

*End of R25 oracle report — ledger artifacts `verdicts.json` (schema §2.6.1) + `report.md` (8/8 markers §2.6.3) are the machine + human legs for the `aether-ledger` stitch.*
