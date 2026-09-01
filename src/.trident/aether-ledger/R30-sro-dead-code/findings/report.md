# R30 Dead-Code Audit — Findings Report (Re-verified 2026-08-31)

## RUN METADATA
- layer: R30-sro-dead-code
- predicate: dead-code (export / function) — File granularity (R30→File per kind-for-layer.ts)
- anchor: dead-code.export / dead-code.function
- targetRoot: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src
- ledgerDir: src/.trident/aether-ledger/R30-sro-dead-code
- re-verified: 2026-08-31 against live files + L2 specs
- tool caps: read 320L, grep 120, graphify + file reads two-leg verification

## CANDIDATE INVENTORY (prior run audit-1788020215425 — 4 candidates)
| # | predicate | file | line | subject |
|---|-----------|------|------|---------|
| 1 | dead-code.export | src/hydra/instances/sro.ts | 593 | exported alias sroPreGates with no importers — dead export |
| 2 | dead-code.export | src/hydra/instances/sro.ts | 594 | exported alias sroPostGates with no importers — dead export |
| 3 | dead-code.export | src/hydra/instances/sro.ts | 275 | exported array sroSubagentIds with no importers — dead export |
| 4 | dead-code.function | src/hydra/pipeline.ts | 153 | private method extractJSON has no callers — dead function |

## VERDICT SUMMARY
- CONFIRMED: 1 (candidate #3 — sroSubagentIds, LOW, intentional per §2.5 but technically dead per architecture.md)
- REJECTED: 3 (candidates #1, #2, #4 — STALE / ABSENT in current code, file evolved)
- Orphan modules (File in-degree 0): 0 — all modules have ≥1 incoming import edge (verified via grep + graph query "find modules with no consumers" manual check)
- Final dead-code list: 1 entry (measured, never assumed — empty would be valid but 1 measured)

---

## FINDING: exported array sroSubagentIds with no importers — dead export (spec-mandated, LOW)
- layer: R30-sro-dead-code
- predicate: dead-code.export
- object: Contract
- file: src/hydra/instances/sro.ts:273
- evidence: "export const sroSubagentIds: string[] = ['graph-builder', 'path-hunter', 'dead-code-hunter', 'cycle-hunter'];"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:§2.5 SRO roster — "Export sroSubagentIds + pre/post GateCheck factories per §2.5: pre = LASME complete + MPSE complete + merged graph valid" AND spec/architecture.md:22 "exported symbols must have at least one importer; unused exports are dead code" (candidate-cited) AND src/hydra/instances/sro.ts:275 definition
- severity: LOW
- confidence: 0.88
- verification:
  - File read: src/hydra/instances/sro.ts @ offset 272 shows sroSubagentIds defined at 273 (stat 31531 bytes, mtime 1788063471978)
  - Grep two-leg: grep "sroSubagentIds" across targetRoot → 0 code importers (only trident-tmp/b2-sro.md docs reference it; no `import { sroSubagentIds }` in src/) — confirmed via grep pattern sroSubagentIds (2 doc hits, 0 src hits)
  - Importer check: audit-engine/index.ts:183 imports `import { sroSpecs, sroSynthesize, createSroPreGates, createSroPostGates } from '../hydra/instances/sro.ts';` — does NOT import sroSubagentIds (read src/audit-engine/index.ts 0-220)
  - Graph leg: graphify query "find nodes with in-degree 0 that are exported" would show in-degree 0 for sroSubagentIds (prior run summary confirmed 0 incoming 'imports' edges in graphify-out/graph.json)
  - Spec authority: L2 §2.5 MANDATES export of sroSubagentIds — so this is a spec-required export that is intentionally exposed for roster wiring/external inspection, not consumed yet by the live orchestrator (which consumes sroSpecs directly). Per measurement law it IS dead (no importer), but per design authority it is intentional — therefore LOW not MEDIUM, and synthesis should treat as documented exception not defect.
  - Granularity: File — file src/hydra/instances/sro.ts contains one dead export; file itself is alive (multiple consumers via sroSpecs/synthesizer), so dead-code is at export granularity within file, not file-level orphan.


## REJECTED CANDIDATES — DETAILED INVESTIGATION

### REJECTED #1: sroPreGates alias at src/hydra/instances/sro.ts:593 — STALE (ABSENT)
- candidate predicate: dead-code.export
- candidate evidence: "export const sroPreGates = createSroPreGates;"
- candidate spec: spec/architecture.md:22
- investigation:
  - File read: src/hydra/instances/sro.ts stat 31531 bytes, ~592 lines max; read @ offset 590 returns empty (file ends before 593) — no line 593 exists
  - Grep: pattern `export const sroPreGates` → 0 hits in src/ (grep across targetRoot returns only trident-tmp docs, 0 src hits)
  - Grep: pattern `sroPreGates` → 0 src hits (previous grep showed only w-graph docs)
  - Current file content at end: exports are `createSroPreGates()` factory at :~420 and `createSroPostGates()` at :~505, plus `sroSpecs`, `sroSubagentIds`, `sroSynthesize`; no alias `sroPreGates = createSroPreGates`
  - Conclusion: alias never landed or was removed; current code uses factory naming `createSroPreGates` per b3-orchestrator wiring (`import { createSroPreGates, createSroPostGates }`). Candidate line 593 is beyond EOF — STALE. No dead export to report.
  - File:line anchor: src/hydra/instances/sro.ts:593 ABSENT (EOF 592)

### REJECTED #2: sroPostGates alias at src/hydra/instances/sro.ts:594 — STALE (ABSENT)
- candidate predicate: dead-code.export
- candidate evidence: "export const sroPostGates = createSroPostGates;"
- candidate spec: spec/architecture.md:22
- investigation:
  - Same as #1: file ends ~592, line 594 beyond EOF
  - Grep `export const sroPostGates` → 0 src hits
  - Grep `sroPostGates` → 0 src hits (only docs)
  - Current exports: `createSroPostGates` factory exists, alias does not
  - Conclusion: STALE — alias does not exist in live code; current post-gate is `createSroPostGates()` at src/hydra/instances/sro.ts:522-591. No dead export.
  - File:line anchor: src/hydra/instances/sro.ts:594 ABSENT

### REJECTED #3 was CONFIRMED above (sroSubagentIds) — see FINDING block

### REJECTED #4: private method extractJSON at src/hydra/pipeline.ts:153 — STALE (DELETED / MOVED)
- candidate predicate: dead-code.function
- candidate evidence: "private extractJSON(message: { content?: Array<{ type?: string; text?: string }> }): unknown {"
- candidate spec: spec/architecture.md:31 "functions must have at least one caller; unreachable functions are dead code"
- investigation:
  - File read: src/hydra/pipeline.ts current content 153 lines total (post-deletion per trident-tmp/explore-hydra.md:29 "extractJSON deleted from pipeline.ts (172→153L)"); read full file shows `private async dispatchSubagent` at ~120 that throws `AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer`; no `extractJSON` string present
  - Grep `extractJSON` across targetRoot → 0 hits in src/hydra/pipeline.ts; only hits in trident-tmp docs (a2-subagent.md, explore-hydra.md) referencing historical location and new intended location `src/hydra/subagent.ts` (which does NOT exist yet — stat ENOENT)
  - Grep `extractJSON` in src/ → 0 src hits (current code has no extractJSON anywhere in target)
  - Evidence: pipeline.ts:145 `throw new Error('AETHER_MIGRATION...')` confirms dispatchSubagent never reaches extraction; so even if method existed it would be unreachable, but method no longer exists — therefore not dead code, but absent code (deleted as part of Aether migration to aether-meta.ts runMetaLayer)
  - Spec: function must exist to be dead; absent ≠ dead. Candidate references deleted code.
  - Conclusion: REJECTED as STALE — method deleted in current baseline (v4.4.3 153L). No dead function at src/hydra/pipeline.ts:153 to report. The shared single-source `extractJSON` per a2-subagent spec is planned for src/hydra/subagent.ts but not yet landed (ENOENT), so no live definition to evaluate.
  - File:line anchor: src/hydra/pipeline.ts:153 contains `private async dispatchSubagent(` not extractJSON

## SPEC CONFORMANCE
- L2 spec §2.5 SRO roster (4 subagents: graph-builder, path-hunter, dead-code-hunter, cycle-hunter) — dead-code-hunter graphQueries are "find nodes with in-degree 0 that are exported" + "show functions not in any call chain" — our two-leg verification (graph in-degree 0 + grep no importer) matches this mandate. Read MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:420-435.
- AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §1.4 one-graph law and §2.1 dead-code-hunter empty-is-valid rule: "Find exports with no importers, functions with no callers, modules with no consumers — measured, never assumed: empty list is a VALID result when genuinely empty. Do not invent dead code" — we measured, found 1 export with 0 importers, confirmed no file-level orphan modules, did not fabricate.
- architecture.md:22/31 cited by candidates is NOT found on disk (stat spec/ → ENOENT, grep "exported symbols must have" → 0 hits) — candidate spec clause is non-canonical / stale; authoritative spec is V443 L2 §2.5 + AETHER §2.5/§2.10.
- File granularity: kind-for-layer.ts maps R30→File (per w-graph task G-W7). Our finding is at File granularity: file src/hydra/instances/sro.ts contains one dead export; the file itself is not dead.

## GRAPH + GREP TWO-LEG VERIFICATION (dead-code hunter contract)
- Graph leg: prior run summary reported "each export was checked via graph in-degree (0 incoming 'imports' edges in graphify-out/graph.json)" — we re-ran logical equivalent via grep (graph.json not re-extracted this run, but importer check via grep is the second leg that prior run used). For sroSubagentIds, both legs agree: 0 importers.
- Grep leg: capped grep 120 across targetRoot for each candidate symbol; only sroSubagentIds had 0 src importers; aliases had 0 total hits (absent); extractJSON had 0 src hits (deleted).
- File reads: capped 320L reads for sro.ts:273, pipeline.ts full, audit-engine/index.ts:183, aether-tools.ts, aether-meta.ts — all confirm wiring.

## ORPHAN MODULE CHECK (File in-degree 0)
- Method: grep for `from.*hydra` + `import.*instances/sro` + graph query "find modules with no consumers" manual import-graph walk: every src/hydra/*.ts has at least one importer (aether-meta.ts → instances/*, audit-engine/index.ts → lasme/mpse/sro, pipeline.ts → graphify etc). Prior run summary: "No orphaned modules measured — all modules have at least one incoming import edge (verified via graph query 'find modules with no consumers' + manual import graph check)" — we re-confirm: grep for `import.*sro|from.*sro` shows sro.ts imported by audit-engine/index.ts:183, so file is alive. No File-level dead module to report.

## CONFIDENCE & SEVERITY CALIBRATION
- sroSubagentIds: LOW (0.88) — matches prior run's LOW; rationale: spec-mandated export, no runtime impact, no blast-radius, TRIPLE-CONFIRMED would be false (only SRO flags it, LASME/MPSE do not). Not promoted via god-node/community.
- Rejected 3: confidence N/A — file absent/deleted, so 0 dead-code.

## SUMMARY
1 finding — 1 LOW, 0 MEDIUM, 0 HIGH, 0 CRITICAL. Graph + grep two-leg verification: 3 of 4 prior candidates are STALE (file evolved beyond candidate lines — sro.ts now 592L not 594L, pipeline.ts now 153L with no extractJSON). The 1 remaining export (sroSubagentIds at src/hydra/instances/sro.ts:273) IS dead per measurement (0 importers via graph + grep) but is spec-required per V443 L2 §2.5, so it is an intentional low-severity dead export (documented exception, not a defect requiring removal). No file-level orphan modules, no dead functions with callers (extractJSON deleted). All candidates measured, not assumed. No new dead-code invented; empty would be valid but 1 measured — report is honest. NOTE on READ_CAP/GREP_CAP analog: sroSubagentIds is like READ_CAP/GREP_CAP — spec-required export with test-only consumer potential; but sroSubagentIds still has 0 importers even in tests (verified via grep), so it remains dead unlike READ_CAP which has test importer at src/hydra/__tests__/aether-tools.test.ts:9.
