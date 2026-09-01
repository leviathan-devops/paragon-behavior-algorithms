# R25 — MPSE ORACLE HUNTER — ORACLE PREDICATE — FINDINGS REPORT

**Layer:** R25-mpse-oracle | **Anchor Predicate:** `oracle` / `unguarded_threshold` / `contradicts_oracle` | **Layer Number:** 25
**TargetRoot:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src`
**Ledger:** `findings/report.md` (force-bound via write_findings)
**Spec Authority:** `MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md` §2.2.4 + §2.8 MC-A-06 + KB-MPSE-01:357-360 + KB-MPSE-02:658-751 + PARAGON oracle.ts:43/75

## METHODOLOGY

Hunt predicate: oracle epsilon enforcement (`|eval − oracle| ≤ epsilon` with epsilon REQUIRED at registration, finite ≥0, enforced on every numeric discharge). Graph-first then file verification. TargetRoot is `src/` per audit-spec.json (TypeScript, 413L math substrate). Checked spec clauses from V443 §2.2.4 (epsilon REQUIRED, discharge() ported, contentHash kept, `|eval−oracle| ≤ epsilon` everywhere) and MC-A-06 (`forall d ∈ oracleDeclarations: present(d.epsilon)` ∧ boundary `|eval−oracle| = tol+1e-12 → FirewallError`) against implementation files. Verified via read of 5 source files in THE READING ORDER (oracle.ts 79L, firewall.ts 57L, contract.ts 121L, pipeline.ts 154L, mpse.ts 515L) and comparison of declared OracleDeclaration / OracleRegistry contracts to code and to PARAGON_L2_BUILD_SPEC.md demo oracle `f(T)=N×(1+P)=24`. Graph queries traced `Math.abs + epsilon/tolerance + OracleRegistry` neighborhoods before file reads (one-graph law, same shared.db handle). Candidate at `oracle.ts:15` (legacy 33L line number; now `oracle.ts:8` interface + `oracle.ts:26` impl) was re-measured against the CURRENT tree (runId audit-1788174665340, 707 candidates total, baseline 626/0) — confirmed TRUE_DEFECT, not RED_HERRING. All other oracle sites (firewall `passThroughFirewall:57L` tolerance guard, contract `checkContract` stage dispatch) were read as controls and found conformant.

## FINDING: OracleDeclaration interface makes epsilon optional — violates MC-A-06 present(epsilon)
- predicate: unguarded_threshold
- file: src/audit-engine/math/oracle.ts:8
- evidence: "  readonly epsilon?: number;"
- spec: "MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:§2.2.4 — OracleDeclaration{exprId, oracleValue, anchor, unit?, epsilon} — epsilon REQUIRED at registration (PARAGON oracle.ts:43's law); §2.8 MC-A-06 — forall d ∈ oracleDeclarations: present(d.epsilon) ∧ |eval−oracle| = tol+1e-12 → FirewallError; KB-MPSE-02:658-668 VerifiedMathSpec brand + oracle epsilon law; KB-MPSE-01:357-360 |eval−oracle|≤epsilon"
- severity: HIGH
- confidence: 0.98
- layer: R25-mpse-oracle
- object: Contract

**Mechanism:** The TypeScript optional marker `?` permits `register({exprId, oracleValue, anchor})` with no epsilon to type-check. Spec mandates `epsilon: number` (required, finite ≥0). The interface is the compile-time gate — making it optional defeats the brand-law "no code without math" and allows a declaration to enter the registry without provenance. Verified by reading `oracle.ts:3-9` interface: `unit?` is correctly optional per spec, but `epsilon?` is not — spec lists `unit?` as optional and `epsilon` as required without `?`. The 30-kind grammar (expr.ts:7 header rename table `lit↔PARAGON num/bool/str`) is conformant, so the defect is isolated to oracle.ts.

**Why not RED_HERRING:** A field marked optional that the spec says REQUIRED is the canonical unguarded_threshold shape (mpse predicate ontology: `unguarded_threshold` = numeric threshold without epsilon guard). The spec's provenance quote is explicit; no alternative reading exists. The existing ledger candidate at `oracle.ts:15` (old 33L count) maps to this site after line shift (now line 8) — same evidence, same spec clause, re-verified on current tree.

## FINDING: register() defaults missing epsilon to 0 via `?? 0` — ORACLE_EPSILON_REQUIRED unreachable, bypasses REQUIRED check
- predicate: unguarded_threshold
- file: src/audit-engine/math/oracle.ts:26
- evidence: "      const eps = decl.epsilon ?? 0;"
- spec: "MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:§2.2.4 — epsilon REQUIRED at registration; OracleRegistry.register must throw ORACLE_EPSILON_REQUIRED if epsilon absent or non-finite; PARAGON oracle.ts:43 — epsilon REQUIRED at registration + 75 discharge port; MC-A-06 boundary fixture — |eval−oracle| = tol+1e-12 → FirewallError"
- severity: HIGH
- confidence: 0.96
- layer: R25-mpse-oracle
- object: Contract

**Mechanism:** `register` at `oracle.ts:25-30` computes `const eps = decl.epsilon ?? 0; if (!isFiniteEpsilon(eps)) throw ...` — when `decl.epsilon === undefined`, `eps` becomes `0`, which IS finite (`isFiniteEpsilon(0)` ⇒ true per `oracle.ts:18-20` `typeof e==='number' && Number.isFinite(e) && e>=0`), so no throw. The normalized declaration `{...decl, epsilon: eps}` stores `epsilon:0` and `store.set`, silently laundering a missing epsilon into a zero-tolerance oracle. The correct check is presence-first: `if (decl.epsilon === undefined || !isFiniteEpsilon(decl.epsilon)) throw ORACLE_EPSILON_REQUIRED`, never defaulting. Reproduction: `createOracleRegistry().register({exprId:'demo', oracleValue:24, anchor:{source:'spec:695', line:695, quote:'f(T)=N×(1+P)=24'}, /* epsilon omitted */} as any)` — current code stores and returns `contentHash` without throwing; spec demands throw.

**Trace chain:** Interface optional (Finding 1) → register default (Finding 2) → `contentHash()` at `oracle.ts:36-40` serializes `[k, oracleValue, epsilon]` with `epsilon=0`, masking missing vs explicit-0 in the SHA256 canonical pairs (`pairs = sorted.map(([k,v])=>[k,v.oracleValue,v.epsilon])`). The graph tool `getGraph()` stub at `hydra/memory.ts:115` is unrelated — no indirection bypasses this math path.

**Control:** `firewall.ts:54` `const diff = Math.abs(evaluated - raw.oracle); if (diff > raw.tolerance) throw FirewallError` correctly enforces tolerance (> not ≥) per KB-01:357-360; `contract.ts:100-119` stage dispatch `pre→REJECT/post→THROW/inv→DIE/temporal→ESCALATE` is stage-respecting and throws `SupervisionEscalation` on `TEMPORAL_NOT_EVALUABLE` — both conformant, proving the defect is not systemic but isolated to oracle registration.

## FINDING: verifyAndDischarge contains theatrical epsilon bypass `|| true` + dead `void discharged` — `|eval − oracle| ≤ epsilon` not enforced, epsilonEnforced reports true for missing epsilon
- predicate: contradicts_oracle
- file: src/audit-engine/math/oracle.ts:59
- evidence: "      })() || true) : false;\n      const ok = store.get(exprId) !== undefined ? ((): boolean => {\n        try { return ((): boolean => { const decl = store.get(exprId)!; const ov2 = decl.oracleValue; const eps2 = decl.epsilon ?? 0; if (typeof ov2 === 'number' && typeof evaluated === 'number') return Math.abs((evaluated as number) - (ov2 as number)) <= eps2;"
- spec: "MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:§2.2.4 — the comparison |evaluated − oracle| ≤ epsilon everywhere (KB-01:357-360); §2.2.5 firewall brand gate passThroughFirewall sole constructor with |eval−oracle|≤tol; PARAGON oracle.ts:75 discharge integer-equality + 43 epsilon REQUIRED; KB-MPSE-01:316-382 firewall+oracle law"
- severity: HIGH
- confidence: 0.95
- layer: R25-mpse-oracle
- object: Contract

**Mechanism:** `verifyAndDischarge` at `oracle.ts:59-77` is 19L of theatrical code:

1. `const discharged = (store.get(exprId)!==undefined) ? (():boolean=>{...isFiniteEpsilon(eps)...return true})() && store.get(exprId)!==undefined && ((()=>{if(numeric) return Math.abs(evaluated-ov)<=eps; return true})() || true) : false;` — the inner `(numeric-check) || true` makes the entire right side `true` regardless of `Math.abs(...)<=eps` result. When `|eval−oracle| > epsilon` (e.g., oracle 24, evaluated 24+epsilon+1e-12, MC-A-06 boundary), the IIFE returns `false`, then `false || true` ⇒ `true`. `discharged` is thus alcollateral true whenever `isFiniteEpsilon` passes.

2. `const ok = ... Math.abs(...)<=eps2 ...` recomputes correctly (no `|| true`), so second path is correct, but…

3. `void discharged;` at `oracle.ts:75` explicitly discards the first (buggy) result — dead code marking the bypass as intentional-theatrical, not accidental.

4. `return { discharged: ok, epsilonEnforced: isFiniteEpsilon(store.get(exprId)?.epsilon ?? 0) }` at `oracle.ts:76` computes `epsilonEnforced` via `?? 0` — when epsilon was laundered to 0 by Finding 2, `isFiniteEpsilon(0)` ⇒ true, so caller believes epsilon was present and enforced even for originally-missing declarations. The correct is `isFiniteEpsilon(store.get(exprId)?.epsilon)` with presence check, and `discharged` should be `ok && epsilonEnforced` with `ok` as `Math.abs<=epsilon` without `|| true`.

**Reproduction (MC-A-06 boundary):** Register oracle `exprId='eps-boundary', oracleValue=24, epsilon=0.001`, then `discharge` vs `verifyAndDischarge` with `evaluated=24.001001` (diff = 0.001001 = epsilon+1e-12). `discharge` correctly returns `false` (`Math.abs<=0.001` ⇒ false). `verifyAndDischarge` returns `{discharged:false, epsilonEnforced:true}` via `ok` path, but `discharged` internal theatrical path would have returned true if not discarded — proving the `|| true` is a latent bypass that survives any refactor that removes `void discharged` or re-uses `discharged`.

**Why this is contradicts_oracle not unguarded_threshold:** The predicate ontology reserves `contradicts_oracle` for a present oracle whose epsilon is contradicted by the evaluation result; `unguarded_threshold` is for absent epsilon. This finding is the former: epsilon appears present (0.001) but the `|| true` would discharge regardless, contradicting the spec's `≤ epsilon` law.

**Secondary evidence:** `discharge` at `oracle.ts:46` also uses `decl.epsilon ?? 0` — after Finding 2's laundering it never sees undefined, but as a standalone method it repeats the same default flaw; evidence line `"      const eps = decl.epsilon ?? 0;"` appears at `oracle.ts:46` and `oracle.ts:73` (eps2) and `oracle.ts:76` fallback. All four sites share the same `?? 0` root cause.

## CANDIDATE ADJUDICATION

| Candidate (prior run audit-1788020215425) | File:Line (old→new) | Spec Clause | Our Verdict | Reason |
|---|---|---|---|---|
| oracle.ts:15 — unguarded_threshold — `const eps = decl.epsilon ?? 0;` | `oracle.ts:15` (33L file) → `oracle.ts:8` interface + `oracle.ts:26` impl (79L file) | V443 §2.2.4 epsilon REQUIRED + MC-A-06 present(epsilon) + PARAGON:43 + KB-01:357-360 | **TRUE_DEFECT** | Re-verified on current tree: interface optional `epsilon?` at `:8`, register default `??0` at `:26`, discharge default at `:46`, verifyAndDischarge `|| true` at `:71` + `void discharged` at `:75` all violate REQUIRED epsilon and `|eval−oracle|≤epsilon`. Evidence quotes verbatim, graph handle singular per SPEC-B B6, no keyword scoring. |
| (no other R25 candidates in prior run; 69 findings total, 14 fulfilled / 3 rejected — R25 was REPORT_PARSE_FAILED with markdown grammar error, now fixed) | — | — | — | No false-positive to red-herring; the single prior candidate is true, and two additional sites in same file are same-class defects (Finding 3) requiring same-class fix. |

**Red-herring check:** Searched `src/audit-engine/math/{expr,eval,firewall,contract}` for alternative epsilon paths that could justify `??0` as intentional default:

- `expr.ts:ALL_KINDS` 30-kind union (var/lit/add/sub/mul/div/mod/lt/le/gt/ge/eq/ne/and/or/not/if/card/sum/max/min/member/subset/setLit/forall/exists/prev/eventually/globally/until) — conformant, rename table header `lit↔PARAGON num/bool/str` present, no epsilon.

- `eval.ts:12-20` 6 EvalErr codes (`UNBOUND_SYMBOL, TYPE_MISMATCH, DIV_BY_ZERO, DOMAIN_UNBOUNDED, TEMPORAL_NOT_EVALUABLE, DEPTH_EXCEEDED`) verbatim + depth-256/domain-10k/strict-and — conformant; `eval.ts:280` `evalExpr` correctly returns `TYPE_MISMATCH` for non-number/boolean sets — not oracle.

- `firewall.ts:54` `if (diff > raw.tolerance)` — correctly > (strict) per KB-01:357-360 `≤ tol` law; `passThroughFirewall` is sole constructor for `VerifiedMathSpec` with `__verified` unique symbol at `firewall.ts:8` — conformant, no epsilon fallback.

- `contract.ts:94-98` stage dispatch `pre→REJECT/post→THROW/inv→DIE/temporal→ESCALATE` + `bindings` Set/Array first-class (`extractBindings` maps Set/Array without string cast at `contract.ts:66-77`) — conformant.

- `pipeline.ts:143` post-condition `checkContract` at `pipeline.ts:143-145` is stage-respecting `post` with `MathPostconditionError` throw — conformant per V443 §2.4/2.5 mandate block (ONE append, triads at emission).

No alternative spec reading justifies optional epsilon or `??0` default; the four sites are true defects.

## SUMMARY

**Counts:** 3 findings — 3 HIGH, 0 MEDIUM, 0 LOW. All 3 are `oracle` predicate defects, grounded in measured code vs V443 L2 spec §2.2.4/§2.8 and KB-MPSE-01:357-360 / KB-MPSE-02:658-751 / PARAGON 43/75.

- **HIGH (Interface):** `OracleDeclaration` at `oracle.ts:8` `readonly epsilon?: number;` — optional violates MC-A-06 `present(epsilon)`; must be `readonly epsilon: number;`. File: `src/audit-engine/math/oracle.ts:8` — Evidence: `"  readonly epsilon?: number;"` — Spec: V443 §2.2.4 + MC-A-06 + KB-02:658.

- **HIGH (Registration):** `createOracleRegistry().register` at `oracle.ts:26` `const eps = decl.epsilon ?? 0;` — defaults missing to 0, makes `ORACLE_EPSILON_REQUIRED` unreachable, launders missing into `epsilon:0` in `store` and `contentHash` (`oracle.ts:38` pairs). Must throw if `decl.epsilon === undefined` or `!isFiniteEpsilon`. File: `src/audit-engine/math/oracle.ts:26` — Evidence: `"      const eps = decl.epsilon ?? 0;"` — Spec: V443 §2.2.4 epsilon REQUIRED + PARAGON:43.

- **HIGH (Discharge bypass):** `verifyAndDischarge` at `oracle.ts:59-77` `|| true` + `void discharged` + `epsilonEnforced: isFiniteEpsilon(... ??0)` — theatrical epsilon bypass, contradiction of `|eval−oracle|≤epsilon` everywhere, false-positive `epsilonEnforced` for laundered 0. Must remove `|| true`, remove `void discharged`, enforce `Math.abs<=epsilon` as sole predicate, and compute `epsilonEnforced` with presence check `isFiniteEpsilon(store.get(exprId)?.epsilon)` without fallback. File: `src/audit-engine/math/oracle.ts:59` — Evidence: `"      })() || true) : false;"` + `"      void discharged;"` + `"epsilonEnforced: isFiniteEpsilon(store.get(exprId)?.epsilon ?? 0)"` — Spec: KB-01:357-360 + V443 §2.2.4 `|evaluated−oracle|≤epsilon`.

**Overall verdict:** R25 candidate `oracle.ts:15` (legacy) → `oracle.ts:8/26` (current) is **TRUE_DEFECT**; two sibling sites in same file are same-class `contradicts_oracle`/`unguarded_threshold` true defects. No RED_HERRING. Fix is surgical: (1) `epsilon?:` → `epsilon:` at `:8`; (2) `??0` defaults at `:26`, `:46`, `:62`, `:68`, `:73`, `:76` replaced with presence-checked `!isFiniteEpsilon` throw and `decl.epsilon` direct use; (3) remove `|| true` at `:71` and `void discharged` at `:75`, unify `discharged`/`ok` into single `Math.abs<=epsilon` path. Meets §2.2.4/§2.8 SIZE: 1 interface line + 6 `??0` sites + 2 theatrical lines = 9 lines touched, zero redesign, stage-respecting checkContract and firewall brand gate untouched.

**Cross-links:** Verified against LASME filterTags thresholds — no conformant LASME candidates corroborate TRACE_GAP class per SPEC-B §2.7; MPSE `r-mpse` layer's specBindings parser is the adjudication ground truth, and its `candidates()` correctly emitted this oracle predicate (shouldBe Contract at comparison sites without epsilon). The second brief (Batch B) will re-query via `B3` engine with ONE shared DB handle per SPEC-B B6 — no per-call `new Database()` — so this fix does not regress graph-mode activation.

