# R22lasme-adapter Hunt — Adapter Delegation Integrity

Method: Graph-first (query delegation patterns → path trace adapter→engine → file-verify), capped reads 320/grep 120, ledger-isolated.

## FINDING: dispatchSubagent snapshot merge discarded and delegation replaced by throw — parity violation
- layer: R22-lasme-adapter
- predicate: violates
- object: Adapter
- file: src/hydra/pipeline.ts:144
- evidence: "void tools; // tools assembled but unused — the primary path (runMetaLayer) bypasses this method"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:§2.1 adapter must delegate tool set to engine — assembled spread merge must be consumed, not voided
- severity: HIGH
- confidence: 0.92

## FINDING: aether-auditor builds 9-tool set then discards result — delegates to engine with divergent 5-tool set
- layer: R22-lasme-adapter
- predicate: violates
- object: Adapter
- file: src/hydra/aether-auditor.ts:94
- evidence: "buildAuditorTools(resolvedLedger, graph, targetRoot);"
- spec: src/hydra/aether-auditor.ts:divergences Q1-tools — assembled buildAuditorTools result must be delegated to AetherAgent, not used only for side-effects
- severity: HIGH
- confidence: 0.88

## FINDING: aether-meta builds meta tool set then discards — meta delegates to generic auditor tools losing graphify and append semantics
- layer: R22-lasme-adapter
- predicate: wraps
- object: Adapter
- file: src/hydra/aether-meta.ts:233
- evidence: "try { buildMetaTools(doc1Path, doc2Path, graph); } catch (e) { void (e as Error).message; }"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:§2.4 meta tools must include graphify×4+write_meta_doc+children_status — discarding buildMetaTools violates wrapper contract
- severity: HIGH
- confidence: 0.86

## FINDING: graph-mapper extract discards caller scope/exclude — adapter delegation loses filter intent, parity violation
- layer: R22-lasme-adapter
- predicate: violates
- object: Adapter
- file: src/hydra/graph-mapper.ts:74
- evidence: "void opts?.exclude;"
- spec: src/hydra/types.ts:63 GraphMapper.extract scope/exclude must be forwarded — adapter voiding params diverges from contract
- severity: MEDIUM
- confidence: 0.81

## SUMMARY
4 findings — 3 HIGH (delegation parity / stale delegation), 1 MEDIUM (snapshot filter loss). Pattern: adapter layer merges delegation state via spread (`[...graphifyTools, ...additionalTools]`, tool factories, graph handles) then discards it via `void` or throws `AETHER_MIGRATION`, delegating to a different engine factory with divergent contract. Graph mapper silently drops `scope`/`exclude` filters. All findings carry file:line+verbatim quote and spec clause; graph path `adapter→engine` traced via hydra pipeline.
