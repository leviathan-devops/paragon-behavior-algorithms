# MPSE VERDICTS — Adjudicated Report (GATE)
**Gate:** MPSE (R24-R27) + mpse-meta orchestrator  
**TargetRoot:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3`  
**Ledger:** `src/.trident/aether-ledger/mpse-meta` (findings: `findings/report.md`, verdicts: `verdicts.json`, this report: `evidence/gate-report.md`)  
**Adjudicated:** 2026-08-29T00:00:00Z — Post-hunt file-read verification + graph digest  
**Score ladder:** [PRELIMINARY 84] → [LASME-ADJUDICATED 81] → **[MPSE-VERIFIED 67]** → [FINAL pending SRO]

---

## Summary Counts
- **Total findings adjudicated:** 10
- **TRUE_DEFECT:** 9 (2 CRITICAL, 5 HIGH, 2 MEDIUM)
- **UNCLEAR:** 1 (MEDIUM)
- **RED_HERRING:** 0

---

## Verdict Table

| # | Layer | Predicate | File:line | Severity | Hunter | Verdict | Adj Conf | Reason |
|---|-------|-----------|-----------|----------|--------|---------|----------|--------|
| F1 | R24-mpse-contract | contract.violated | `src/hydra/pipeline.ts:132` | CRITICAL | 0.95 | **TRUE_DEFECT** | 0.96 | `dispatchSubagent` unconditionally throws `AETHER_MIGRATION` |
| F2 | R24-mpse-contract | contract.drift | `src/hydra/aether-templates/meta/mpse-meta.ts:180` | HIGH | 0.92 | **TRUE_DEFECT** | 0.94 | `mpse-meta` hardcodes `layerNumber: 24` vs prompt “meta carries no layerNumber” |
| F3 | R24-mpse-contract | contract.drift | `src/hydra/types.ts:28` | HIGH | 0.88 | **TRUE_DEFECT** | 0.89 | `SubagentSpec.buildSystemPrompt` function-type vs mechanical DATA |
| F4 | R25-mpse-oracle | oracle.missing-wiring | `src/hydra/graphify.ts:132` | HIGH | 0.90 | **TRUE_DEFECT** | 0.91 | `void depth;` discards threshold `depth=3` |
| F5 | R25-mpse-oracle | oracle.unguarded | `src/hydra/graphify.ts:133` | MEDIUM | 0.85 | **TRUE_DEFECT** | 0.86 | `get_neighbors {label:center}` never receives `depth` |
| F6 | R26-mpse-stage | stage.violated-inv | `src/hydra/memory.ts:129` | HIGH | 0.90 | **TRUE_DEFECT** | 0.92 | `getGraph(): return null` — graph persistence invariant broken |
| F7 | R26-mpse-stage | stage.skipped-pre | `src/hydra/memory.ts:138` | HIGH | 0.87 | **TRUE_DEFECT** | 0.88 | `mergeGraphSlice` no-op `return;` |
| F8 | R27-mpse-provenance | provenance.trace-gap | `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:400` | CRITICAL | 0.93 | **TRUE_DEFECT** | 0.94 | `checkContract()` zero provenance |
| F9 | R26-mpse-stage | stage.violated-inv | `src/hydra/aether-meta.ts:212` | MEDIUM | 0.82 | **TRUE_DEFECT** | 0.83 | `fs.appendFileSync` without `O_APPEND` offset guard |
| F10 | R27-mpse-provenance | provenance.divergent | `src/hydra/aether-templates/types.ts:26` | MEDIUM | 0.78 | **UNCLEAR** | 0.62 | `layerNumber: number` required vs prompt “meta no layerNumber” |

*Detailed reasoning preserved in evidence/gate-verdicts.json — gate adjudication 9 TRUE_DEFECT, 1 UNCLEAR, 0 RED_HERRING. Full fix order in gate-verdicts.json.*
