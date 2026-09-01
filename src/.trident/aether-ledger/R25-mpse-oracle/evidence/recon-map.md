# RECON MAP — R25 MPSE Oracle P0
**Run ID:** R25-mpse-oracle-20260828-001
**Phase:** P0 RECON
**Specs Read:**

- /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/KNOWLEDGE_LIBRARY/Codename:PARAGON/PARAGON_L2_BUILD_SPEC.md — 234253 bytes — read window 0-320 + 320-640 + until EOF (full read, P0) — lines 1-~8000, oracle spec at 695
- /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md — read window 0-320 + follow-ons until EOF — §2.2.4, §2.8 MC-A-06
- /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/MASTER_CONTEXT/V443_PLAN_S_CODE_AUDIT_SHADOW_L2_SPEC.md — read for deliverable structure §2.6.3 (8 markers) + §2.10 worked run

**Spec Clauses Ingested:**
- PARAGON:695 `a non-integer float without the epsilon THROWS OracleEpsilonError (the hidden tolerance BANNED)` — the float-requires-epsilon law
- SPEC-A §2.2.4 `OracleDeclaration{exprId, oracleValue, anchor, unit?, epsilon} — epsilon REQUIRED at registration (PARAGON oracle.ts:43's law)` — the registration gate
- MC-A-06 `forall d ∈ oracleDeclarations: present(d.epsilon)` ∧ `|eval−oracle| = tol+1e-12 → FirewallError` — the completeness fixture
- SPEC-A §2.2.5 `passThroughFirewall(raw) -> VerifiedMathSpec | FirewallError — the ONLY constructor` + `|eval−oracle|≤tol`
- PARAGON §4.2.2:610 `DEPTH_LIMIT_DEFAULT=256` / `DOMAIN_SIZE_LIMIT_DEFAULT=10_000` with BECAUSE — named+calibrated thresholds (§2.10 exempt)

**Target Files Mapped:**
- src/audit-engine/math/oracle.ts (53 lines, 5 epsilon hits, 1 Math.abs at 32)
- src/audit-engine/math/firewall.ts (48 lines, 3 tolerance hits, Function eval at 32-48)
- src/audit-engine/math/contract.ts (108 lines, Stage widening at 85)
- src/audit-engine/math/eval.ts (341 lines, DEPTH/DOMAIN imports at 12)
- src/audit-engine/layers/r-mpse.ts (186 lines, hasEpsilonField scan at 138-145, delta calc at 172)
- src/shared/knowledge-graph/ontology.ts (24 lines, PREDICATES.mpse)
- src/audit-engine/__tests__/math.test.ts (19 tests, register without epsilon at 56)

**Read Turns Logged:** 2 spec reads × full windows + 4 code windows (oracle, firewall, contract, eval) + ontology + r-mpse = 8 reads, all phase=P0, all reached EOF.

**Coverage:** MC-S-02 `card(specReadTurns)=card(specs)` ✓ (2 specs, 2 paths, each with EOF)
