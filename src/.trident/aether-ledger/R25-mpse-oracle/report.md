# CODE AUDIT SHADOW REPORT — /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3 — R25-mpse-oracle-20260831-001

## 0 RUN METADATA
- **Run ID:** R25-mpse-oracle-20260831-001
- **Ledger Root:** src/.trident/aether-ledger/R25-mpse-oracle
- **Target Root:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3
- **Specs:**
  - /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/KNOWLEDGE_LIBRARY/Codename:PARAGON/PARAGON_L2_BUILD_SPEC.md (234253 bytes, primary §4.2.5 oracle — `a non-integer float without the epsilon THROWS OracleEpsilonError`)
  - /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md (§2.2.4 epsilon REQUIRED, MC-A-06 `forall d ∈ oracleDeclarations: present(d.epsilon)`)
  - /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/MASTER_CONTEXT/V443_PLAN_S_CODE_AUDIT_SHADOW_L2_SPEC.md (§2.6.3 8 markers + §2.10 budgetRounds)
- **Focuses:** mpse oracle predicate — `evaluates_to` / `contradicts_oracle` / `unguarded_threshold` (ontology.ts:4 mpse family)
- **Candidates In:** 3 (r-mpse ×3, oracle predicate lane — interface optional + register ??0 + verifyAndDischarge || true)
- **Budget Rounds:** 5 = 4 + ceil(3/8) per budgetRounds() — §2.10 pin verified (c=4→5, c=12→6, c=80→14)
- **Rounds Used:** 4 (P0 recon 1 + P1/P2 evidencing 2 + P3 report 1 + P4 verify 1, within budget)
- **Wall Clock ms:** 13120
- **Probe ms:** 640
- **Provider:** opencode-go/muse-spark-1.2-contributor
- **Phase Log:** PROBING→RECON→EVIDENCING→ADJUDICATING→REPORTING→VERIFYING→DONE
- **Validator Rejects:** 0
- **Ready:** true

## 1 THE VERDICT TABLE
| # | Layer | File:Line | Side | Adjudication | Confidence | Spec Link | One-Liner |
|---|---|---|---|---|---|---|---|
| 0 | r-mpse | src/audit-engine/math/oracle.ts:8 | S1 | TRUE_DEFECT | 0.98 | V443 §2.2.4 / MC-A-06 | interface makes epsilon optional — violates REQUIRED |
| 1 | r-mpse | src/audit-engine/math/oracle.ts:26 | S1 | TRUE_DEFECT | 0.96 | PARAGON:695 | missing epsilon laundered to 0 via ??0 — hidden tolerance not banned |
| 2 | r-mpse | src/audit-engine/math/oracle.ts:71 | S2 | TRUE_DEFECT | 0.95 | V443 §2.2.4 / KB-01:357 | verifyAndDischarge || true + void discharged — |eval−oracle|≤epsilon bypass |

Counts: TRUE_DEFECT 3 · RED_HERRING 0 · UNCLEAR 0 · UNCLASSIFIED 0 = 3 candidates. `candidatesIn == trueDefect + redHerring + unclear` ✓ Manifest ready true. `rounds 4 ≤ budget 5` ✓ MC-S-03.

## 2 TRUE DEFECTS
### TD-0 — oracle.ts:8 `readonly epsilon?: number;` — interface optional violates MC-A-06 present(epsilon)
- **File:** src/audit-engine/math/oracle.ts:8
- **Code Quote (verbatim, 27 chars):** `  readonly epsilon?: number;`
- **Extended Code Window (oracle.ts:3-9):**
  ```ts
  export interface OracleDeclaration {
    readonly exprId: string;
    readonly oracleValue: number | boolean | readonly (string | number)[];
    readonly anchor: ProvenanceAnchor;
    readonly unit?: string;
    readonly epsilon?: number; // <- OPTIONAL — should be REQUIRED per spec
  }
  ```
- **Spec Path:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md
- **Spec Line:** 118
- **Spec Quote:** `OracleDeclaration{exprId, oracleValue, anchor, unit?, epsilon} — epsilon REQUIRED at registration (PARAGON oracle.ts:43's law)`
- **Spec Context:** V443 Plan A §2.2.4: `OracleDeclaration{exprId, oracleValue, anchor, unit?, epsilon} — epsilon REQUIRED at registration (PARAGON oracle.ts:43's law)` + MC-A-06 `forall d ∈ oracleDeclarations: present(d.epsilon)` ∧ `|eval−oracle| = tol+1e-12 → FirewallError` + KB-MPSE-02:658-668 VerifiedMathSpec brand + oracle epsilon law + KB-01:357-360 |eval−oracle|≤epsilon.
- **Divergence:** Spec declares epsilon as REQUIRED (non-optional) with finite >=0 per PARAGON oracle.ts:43 and MC-A-06 forall d present(d.epsilon). Code makes epsilon optional (?:) permitting `register({exprId, oracleValue, anchor})` with no epsilon to type-check, defeating compile-time brand gate and allowing laundering to 0 downstream.
- **Why TRUE_DEFECT (Law 1):** spec quote + code quote + one-sentence divergence present; no legitimate reason; confidence 0.98 (three legs quoted verbatim).
- **Derailment Mode:** D1 (single-admissible-reading)
- **Confidence:** 0.98
- **Evidence:** evidence/cand-00-context.txt
- **Fix:** `readonly epsilon: number;` (remove `?`), remove `??0` defaults at register/discharge/verify, validate presence before isFiniteEpsilon.

**What the spec declares:** epsilon REQUIRED at registration — every OracleDeclaration must carry finite epsilon.
**What the code shows:** `readonly epsilon?: number;` at oracle.ts:8 — missing is silently allowed.
**The divergence:** REQUIRED vs optional — MUST carry vs MAY omit.
**The correction:** restore REQUIRED gate — `if (decl.epsilon===undefined) throw ORACLE_EPSILON_REQUIRED` before any default, and interface `epsilon: number`.

### TD-1 — oracle.ts:26 `const eps = decl.epsilon ?? 0;` — missing epsilon laundered to 0, ORACLE_EPSILON_REQUIRED unreachable
- **File:** src/audit-engine/math/oracle.ts:26
- **Code Quote (verbatim, 32 chars):** `      const eps = decl.epsilon ?? 0;`
- **Extended Code Window (oracle.ts:25-31):**
  ```ts
    register(decl: OracleDeclaration): void {
      const eps = decl.epsilon ?? 0; // <- THE DEFECT — masks missing as 0
      if (!isFiniteEpsilon(eps)) throw new Error(`ORACLE_EPSILON_REQUIRED: epsilon must be finite >=0 for ${decl.exprId}`);
      if (store.has(decl.exprId)) throw new Error(`ORACLE_CONFLICT: duplicate exprId ${decl.exprId}`);
      const normalized: OracleDeclaration = { ...decl, epsilon: eps };
      store.set(decl.exprId, normalized);
    },
  ```
- **Spec Path:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/KNOWLEDGE_LIBRARY/Codename:PARAGON/PARAGON_L2_BUILD_SPEC.md
- **Spec Line:** 695
- **Spec Quote:** `a non-integer float without the epsilon THROWS OracleEpsilonError (the hidden tolerance BANNED)`
- **Spec Context:** PARAGON §4.2.5 OracleDeclaration + discharge discipline — `|evaluated − oracle| ≤ epsilon` everywhere (KB-01:357-360, W4:106). V443 Plan A §2.2.4: `OracleDeclaration{exprId, oracleValue, anchor, unit?, epsilon} — epsilon REQUIRED at registration (PARAGON oracle.ts:43's law)` + MC-A-06 `forall d ∈ oracleDeclarations: present(d.epsilon)` ∧ `|eval−oracle| = tol+1e-12 → FirewallError`.
- **Divergence:** Spec declares a non-integer float without epsilon must THROW OracleEpsilonError; code does `const eps = decl.epsilon ?? 0` and only checks `isFiniteEpsilon(eps)` (passes for 0), which permits float oracleValue=0.1 with eps=0 (no throw), so hidden zero-tolerance not banned. The normalized `{ ...decl, epsilon: eps }` stores 0 and contentHash serializes `[k, oracleValue, 0]` masking missing vs explicit-0; discharge at :46 and verify at :62/:68/:73 repeat same `??0`.
- **Why TRUE_DEFECT (Law 1):** spec quote + code quote + divergence present; no legitimate reason; confidence 0.96.
- **Derailment Mode:** D1
- **Confidence:** 0.96
- **Evidence:** evidence/cand-01-context.txt
- **Fix:** `if (decl.epsilon===undefined || !isFiniteEpsilon(decl.epsilon)) throw ORACLE_EPSILON_REQUIRED` before `store.set`, `store.set(decl.exprId, decl)` no normalization.

**What the spec declares:** a non-integer float without epsilon THROWS OracleEpsilonError — hidden tolerance BANNED.
**What the code shows:** `const eps = decl.epsilon ?? 0;` at oracle.ts:26 — missing is silently 0.
**The divergence:** present vs absent both become 0 — MUST THROW is MUST-NOT-THROW.
**The correction:** restore REQUIRED gate — presence-first check, no default, contentHash then distinguishes missing vs 0 (missing never reaches hash).

### TD-2 — oracle.ts:71 `})() || true) : false;` + `void discharged;` — verifyAndDischarge bypasses |eval−oracle|≤epsilon
- **File:** src/audit-engine/math/oracle.ts:71
- **Code Quote (verbatim, 24 chars):** `      })() || true) : false;`
- **Extended Code Window (oracle.ts:59-77):**
  ```ts
    verifyAndDischarge(exprId, evaluated): { discharged: boolean; epsilonEnforced: boolean } {
      const discharged = (store.get(exprId)!==undefined) ? (():boolean=>{const c=store.get(exprId)!; const eps=c.epsilon ??0; if(!isFiniteEpsilon(eps)) throw ...; return true})() && store.get(exprId)!==undefined && ((()=>{const d=store.get(exprId)!; const ov=d.oracleValue; const eps=d.epsilon ??0; if(typeof ov==='number' && typeof evaluated==='number') return Math.abs(evaluated - (ov as number)) <= eps; return true})() || true) : false;
      const ok = store.get(exprId)!==undefined ? (():boolean=>{try{return (():boolean=>{const decl=store.get(exprId)!; const ov2=decl.oracleValue; const eps2=decl.epsilon ??0; if(typeof ov2==='number' && typeof evaluated==='number') return Math.abs((evaluated as number)-(ov2 as number)) <= eps2; ...})();}catch{return false}})() : false;
      void discharged;
      return { discharged: ok, epsilonEnforced: isFiniteEpsilon(store.get(exprId)?.epsilon ?? 0) };
    },
  ```
- **Spec Path:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md
- **Spec Line:** 120
- **Spec Quote:** `the comparison |evaluated − oracle| ≤ epsilon everywhere (KB-01:357-360)`
- **Spec Context:** V443 §2.2.4: the comparison `|evaluated − oracle| ≤ epsilon` everywhere (KB-01:357-360) + V443 §2.2.5 firewall brand gate passThroughFirewall sole constructor with |eval−oracle|≤tol + PARAGON oracle.ts:75 discharge integer-equality + 43 epsilon REQUIRED + KB-01:316-382 firewall+oracle law.
- **Divergence:** Spec mandates `|evaluated−oracle|≤epsilon` everywhere; code computes `discharged` via `((Math.abs<=eps) || true)` making it collateral true whenever isFiniteEpsilon passes (false || true => true), then `void discharged` discards the bypassed result and `epsilonEnforced` via `??0` reports true for laundered 0. Contradicts spec's ≤epsilon everywhere; latent bypass survives any refactor that reuses discharged.
- **Why TRUE_DEFECT (Law 1):** spec quote + code quote + divergence present; confidence 0.95.
- **Derailment Mode:** D5
- **Confidence:** 0.95
- **Evidence:** evidence/cand-02-context.txt
- **Fix:** remove `|| true` at :71, remove `void discharged` at :75, unify `discharged`/`ok` into single `Math.abs<=epsilon` without default, and `epsilonEnforced = isFiniteEpsilon(store.get(exprId)?.epsilon)` with presence check.

**What the spec declares:** |evaluated−oracle| ≤ epsilon everywhere — epsilon is the tolerance.
**What the code shows:** `})() || true) : false;` at oracle.ts:71 + `void discharged;` at :75 — bypass + dead discard.
**The divergence:** MUST enforce vs MUST-NOT enforce — `false` becomes `true`.
**The correction:** `Math.abs(evaluated-ov) <= decl.epsilon` as sole predicate, no `|| true`, no `??0`, `epsilonEnforced` presence-checked.

## 3 THE KILL LOG
*No RED_HERRING candidates — all 3 oracle predicate sites are TRUE_DEFECT per §2.2.4/§2.8. Controls verified as conformant (not in candidate set):*
- **firewall.ts:54** `const diff = Math.abs(evaluated - raw.oracle); if (diff > raw.tolerance) throw FirewallError` — correctly enforces `diff > tolerance` (strict >) per KB-01:357-360 `≤ tol` law; `passThroughFirewall` is sole constructor for `VerifiedMathSpec` with `__verified` unique symbol at firewall.ts:8 — conformant, no epsilon fallback (evidence: evidence/control-firewall.txt).
- **contract.ts:94-119** stage dispatch `pre→REJECT/post→THROW/inv→DIE/temporal→ESCALATE` + `extractBindings` Set/Array first-class (contract.ts:66-77) — conformant per KB-03:336-360 + MC-A-05.
- **eval.ts:12** `DEPTH_LIMIT_DEFAULT=256` / `DOMAIN_SIZE_LIMIT_DEFAULT=10_000` with BECAUSE at expr.ts:50-55 — named+calibrated exemption per §2.10, not magic.
- **oracle.ts:49** `return Math.abs(evaluated - ov) <= eps;` in `discharge` — would be legitimate if `eps` were presence-checked; flagged only via surrounding `??0` context (already counted as TD-1).

## 4 THE ESCALATION QUEUE
*No UNCLEAR candidates — all 3 candidates adjudicated to TRUE_DEFECT with confidence ≥0.95 (>0.85 threshold). Previous UNCLEAR at eval.ts:12 resolved by reading expr.ts:50-55 BECAUSE comment — confirmed exempt per SPEC-A §2.10, thus not a candidate in this 3-candidate lane. Queue empty.*

## 5 THE SYNTHESIS
**Cross-cutting pattern:** The three r-mpse candidates (0,1,2) all orbit the same `register()` → `discharge()` → `verifyAndDischarge()` epsilon chain. The chain is the classic "optional-then-launder-then-bypass": interface makes epsilon optional (TD-0), register launders missing to 0 before validation (TD-1), verifyAndDischarge bypasses the already-laundered check via `|| true` and dead `void` (TD-2). The fix unifies the three: remove optional, validate presence first, enforce `Math.abs<=epsilon` without default or bypass. Fix size 1 interface line + 6 `??0` sites + 2 theatrical lines = 9 lines touched, zero redesign, stage-respecting checkContract and firewall brand gate untouched.

**Oracle predicate coverage (ontology.ts:4 mpse family):**
| Predicate | Meaning | Realization |
|---|---|---|
| `evaluates_to` | MathExpr → oracleValue via discharge | oracle.ts:49 number branch `Math.abs(ev-ov)≤eps` would be ✓ after TD-1 fix; currently fails for missing epsilon (TD-1) |
| `contradicts_oracle` | toBrandedVerdict CONTRADICTED | contract.ts:35-44 ✓, but oracle's verifyAndDischarge contradicts via || true (TD-2) |
| `grounded_through` | anchor provenance | oracle.ts:8 anchor preserved, hash at :38 includes eps but not anchor — minor collision, not defect |
| `unguarded_threshold` | literal without epsilon | r-mpse.ts:138-145 Order-1 scan for `epsilon|tolerance` — weak detector; TD-0/TD-1 are exactly this gap |

**What the graph would add (Batch B):** `r-graph` would check adapter↔machine wiring parity via SRO edges; `r-dh-feed` would re-adjudicate hunter findings as candidates; `r-provenance` would BFS spec→code traces ≤64 — not applicable to this 3-candidate oracle lane (graphMode auto, store empty, isBatchBActive false). The second brief (Batch B) will re-query via B3 engine with ONE shared DB handle per SPEC-B B6 — no per-call `new Database()` — so this fix does not regress graph-mode activation.

**Counts reconcile:** `3 == 3+0+0` ✓ `candidatesIn == trueDefect + redHerring + unclear` per manifest. `rounds 4 ≤ budget 5` ✓ MC-S-03. `ready true` ✓.

## 6 THE SELF-VERIFY STAMP
- **P4 Claims Rechecked:** 3 (all TRUE_DEFECT specQuotes + codeQuotes re-read via file windows at oracle.ts:8, :26, :71; no kill/unclear to re-read)
- **Discrepancies Found:** 0 (all file:line still match 79L oracle.ts; no line drift since P1)
- **Discrepancies Fixed:** 0 (no edit_file needed; citations stable)
- **Write Violations:** 0 (evidence/write-violations.log empty post-P4 — no out-of-scope writes; Write-Scope Law held globally; prior ledger's write-violations.log was from earlier scope-test, not this run)
- **Validator Rejects:** 0 (first P3 write was schema-valid; no repair loop needed — ready true)
- **P4 Verdict:** PASS — every TRUE_DEFECT citation re-read verbatim; report 8/8 markers present (title + sections 0-6); manifest counts reconcile `3 == 3+0+0`; rounds `4 ≤ 5`; ready true.
- **Evidence:** evidence/recon-map.md + evidence/cand-00-context.txt + evidence/cand-01-context.txt + evidence/cand-02-context.txt + evidence/write-violations.log are the P4 re-check targets.
