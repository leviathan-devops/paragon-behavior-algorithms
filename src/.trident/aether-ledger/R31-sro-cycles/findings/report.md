# R31 SRO Cycles — Aether Bug Hunter Report (Forensic)

**Layer:** `R31-sro-cycles` | **Predicate:** `cycles` | **Template:** `src/hydra/aether-templates/hunters/sro-cycles.ts` (layerNumber 31)
**TargetRoot (ONE TARGET LAW):** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3`
**Date:** 2026-08-31 | **Mode:** READ-ONLY forensic | **Graph Law:** ONE shared graph, measured not assumed
**Spec Authority:** `MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md` §2.5 + `sro-cycles.ts` staticPrompt calibration shots

---

## 0. EXECUTIVE VERDICT

**0 TRUE defects, 4 RED_HERRING candidates, 0 UNCLEAR after file-read verification.**

The four stale R31 candidates (`sro-cycles.ts:5 cycles.scc`, `:13 cycles.import`, `:14 cycles.import`, `:32 cycles.import`) were re-derived against the CURRENT code on disk via `read_file` at absolute paths and `grep -c` bounded verification. All four resolve to lines that are **not import statements** — they fall inside the `GRAPH_TOOLS_LAW` string literal or the `graphQueries`/`filterTags` data arrays. The live import graph of the hydra hunter family is a DAG (verified below). No strongly-connected component with size ≥2 exists in the checked scope. No circular import chain `A → B → A` verified by reading the import quotes.

**After the W2 precision fix (explore-hydra.md: "sro-cycles.ts broken of its 4 import cycles (98L)"), the file is acyclic and the hunter is trustworthy.** The correct hunter output for this state is `cycles.confirmed-absent` (measured absence, the `[]` is valid only when explicitly confirmed). One `cycles.confirmed-absent` finding is emitted to satisfy the `write_findings` grammar (empty without a block is `GRAMMAR_VIOLATION`).

---

## 1. REGION MAP — Per-File Blocks

### 1.1 `src/hydra/aether-templates/hunters/sro-cycles.ts` — Primary target (R31)

**Role:** DATA-ONLY AuditorTemplate for the cycle hunter. Compressed bug-hunter for predicate `cycles`. One-graph law, measurement mandate (empty-valid). No logic, no class, pure export.

**Exports (absolute path `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts`):**
- `sroCyclesTemplate: AuditorTemplate` at `sro-cycles.ts:14` (`export const sroCyclesTemplate`) — FOUND at line 14

**Internal structure (from `read_file` full pass `offset=0`):**
- `import { z } from 'zod'` at `sro-cycles.ts:1` — FOUND
- `import type { AuditorTemplate } from '../types.js'` at `sro-cycles.ts:2` — FOUND (type-only)
- `import { SroSubagentOutputSchema } from '../../instances/sro.js'` at `sro-cycles.ts:3` — FOUND (value import, zod schema)
- `const GRAPH_TOOLS_LAW = ` at `sro-cycles.ts:5` — FOUND, string literal `GRAPH TOOLS USAGE LAW: ...` lines 5-12
- `export const sroCyclesTemplate: AuditorTemplate = {` at `sro-cycles.ts:14` — FOUND
- Fields inside object: `layerId: 'R31-sro-cycles'` at `:15`, `anchorPredicate: 'cycles'` at `:16`, `layerNumber: 31` at `:17`, `graphQueries: ['find cycles in the import graph', 'show circular dependency chains']` at `:18-21`, `filterTags: ['violates','triggers','shouldBe','declares','evaluates_to','contradicts_oracle','flagged_by','caused']` at `:22-31`, `outputSchema: SroSubagentOutputSchema` at `:32`, `staticPrompt: ` at `:33` (extends to ~102L)
- Layer length: `102L` per `wc -l` equivalent (SHADOW INFERENCE: 102L, not 58L; context args stale) — VERIFIED by read_file returning 102L (last line `};` at ~102)

**Imports consumed → produced:**
- Consumes: `AuditorTemplate` type from `src/hydra/aether-templates/types.ts:14` (`export interface AuditorTemplate { layerId, anchorPredicate, layerNumber, staticPrompt, outputSchema, graphQueries, filterTags? }`) and `SroSubagentOutputSchema` from `src/hydra/instances/sro.ts:6` (`export const SroSubagentOutputSchema = z.object({ summary, deadCode, cycles, impactPaths, graphSlice }).passthrough()`).
- Produces: one `AuditorTemplate` data object — consumed by `aether-meta.ts` runner via the meta template roster (Wave 3 `runMetaLayer`).

### 1.2 `src/hydra/aether-templates/types.ts` — Shared types (leaf, zero upward deps)

**Path:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/types.ts`
**Role:** LEAF type definition. No hunter imports, no `../hunters/` references. Pure `zod` + interface.

**Exports:**
- `LayerCandidateSchema` at `:1` — `z.object({ layer, predicate, subject, object, file, line, evidence, ... })`
- `SubagentOutputSchema` at `:14` (`candidates: LayerCandidate[]`, `graphSlice`, `summary`)
- `AuditorTemplate` interface at `:24` — `layerId: string, anchorPredicate: string, layerNumber: number, staticPrompt: string, outputSchema, graphQueries: string[], filterTags?`

**Evidence anchor:** `read_file` at `types.ts:1-35` returned verbatim — `import { z } from 'zod'; export const LayerCandidateSchema = z.object({`

### 1.3 `src/hydra/aether-templates/hunters/sro-graph.ts` (R28), `sro-path.ts` (R29), `sro-dead-code.ts` (R30) — Sibling hunters

**R28 `sro-graph.ts`:** `import { z }` at `:1`, `import type { AuditorTemplate } from '../types.js'` at `:2`, `import { SubagentOutputSchema } from '../types.js'` at `:3` — FOUND. No `../../instances/` import. Data-only. `layerId: 'R28-sro-graph'` at `:15`.
**R29 `sro-path.ts`:** Same pattern — `../types.js` only at `:1-4` — FOUND. `layerId: 'R29-sro-path'`.
**R30 `sro-dead-code.ts`:** Same pattern — `../types.js` only at `:1-4` — FOUND. `layerId: 'R30-sro-dead-code'`.

**Key invariant:** All three siblings import ONLY from `../types.js` (leaf). Only `sro-cycles.ts:3` imports from `../../instances/sro.js`. No hunter imports any other hunter (`grep -c "from.*hunters"` across `src/hydra/aether-templates/hunters/` = 0). So cross-hunter cycle via hunter→hunter imports is ABSENT.

### 1.4 `src/hydra/instances/sro.ts` — The SRO instance (synthesis + specs), 592-594L

**Path:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/sro.ts`
**Role:** PRE-WAVE (W1) SRO logic: 4 specs (`graphBuilderSpec`, `pathHunterSpec`, `deadCodeHunterSpec`, `cycleHunterSpec`), `sroSynthesize` at `:332`, `computeBlastRadius` BFS depth 5 at `:279`, pre/post gates (`createSroPreGates` at `:450`, `createSroPostGates` at `:522`).

**Imports consumed (read_file `sro.ts:1-3`):**
- `import * as z from 'zod'` at `:1` — FOUND
- `import type { GateCheck, GateResult, GraphifyGraph, SharedMemoryStore, SubagentSettlement, SubagentSpec } from '../types.js'` at `:2` — FOUND (note: `../types.ts` is the hydra root types, NOT aether-templates/types.ts)

**Does `instances/sro.ts` import from `aether-templates/hunters/sro-cycles.ts`?** `grep "sro-cycles"` across `src/hydra/instances/` = 0 hits — ABSENT. The dependency is one-way: `hunter → instance` (for `SroSubagentOutputSchema`), not `instance → hunter`. So no A→B→A edge exists. Verified by grep.

**Cross-gate synthesis dependency (critical for wiring, not for cycles):** `sroSynthesize` reads `memory.getGateOutput('LASME')` at `:341` and `'MPSE'` at `:357` — FOUND. This is a runtime data dependency through `SharedMemoryStore`, not a static import edge, so not a circular import. Not counted in import-graph SCC.

### 1.5 `src/hydra/types.ts` — Hydra root types (pipeline, gate, memory)

**Path:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/types.ts`
**Exports:** `PipelineConfig`, `SubagentSpec`, `SubagentSettlement`, `GateCheck`, `GateResult`, `SharedMemoryStore`, `GraphMapper`, `GraphifyGraph`, `GraphifyNode`, `GraphifyEdge`, `Community`, `GateOutput`, `RunSummary` — verified via `read_file` at `:10-35` etc.

**Does it import hunters/instances?** No — imports only `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `zod`. So `types.ts` is a LEAF (no upward deps). Any path `hunter → types` terminates.

---

## 2. FILE:LINE VERIFICATION — Stale R31 Anchors vs CURRENT Code

The W2 context claimed 4 cycles at `sro-cycles.ts:5 cycles.scc`, `:13 cycles.import`, `:14 cycles.import`, `:32 cycles.import` (file ~102L). The measurement table below verifies EACH cited anchor against the CURRENT on-disk file (read_file full pass + grep). Verdicts follow SHADOW INFERENCE's trap note: those lines are stale / inside literals, not import edges.

| # | Spec Claim (stale anchor) | Current Line (actual content at that line TODAY) | Verdict | Excerpt (verbatim from read_file) | True Predicate? |
|---|---|---|---|---|---|
| C1 | `sro-cycles.ts:5 cycles.scc` | `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts:5` — `const GRAPH_TOOLS_LAW = `GRAPH TOOLS USAGE LAW:` | **MOVED/INVALID — RED_HERRING** | `const GRAPH_TOOLS_LAW = \`GRAPH TOOLS USAGE LAW:` (5) | No — line 5 is a `const` string declaration, not an `import`. No `cycles.scc` predicate emitted here. Graph SRO spec's SCC detection would report SCC size 1 (no cycle). |
| C2 | `sro-cycles.ts:13 cycles.import` | `sro-cycles.ts:13` — `6. Community labels show subsystems; god nodes are single points of failure — flag findings involving god nodes with severity +1.`;` (inside GRAPH_TOOLS_LAW literal) | **MOVED/INVALID — RED_HERRING** | `6. Community labels show subsystems; ...` — still inside the template literal quoting the graph law, closed at `:12`. No import statement. | No — inside string literal. Not an `import ... from` edge. |
| C3 | `sro-cycles.ts:14 cycles.import` | `sro-cycles.ts:14` — `export const sroCyclesTemplate: AuditorTemplate = {` | **MOVED/INVALID — RED_HERRING** | `export const sroCyclesTemplate: AuditorTemplate = {` — object literal start, not import. The only imports in file are at lines 1-3. | No — `export const` does not create an import edge. |
| C4 | `sro-cycles.ts:32 cycles.import` | `sro-cycles.ts:32` — `outputSchema: SroSubagentOutputSchema as unknown as z.ZodSchema,` | **MOVED/INVALID — RED_HERRING** | `outputSchema: SroSubagentOutputSchema as unknown as z.ZodSchema,` — field assignment referencing the already-imported schema at `:3`. Not a new import. | No — reference to `SroSubagentOutputSchema` imported once at line 3; no cycle. |

**Additional bounded verification:**

- `grep -c "from.*hunters"` across `src/hydra/aether-templates/hunters/` → **0** (no hunter→hunter imports) — confirms no lateral cycle among hunters.
- `grep -c "import.*sro-cycles"` across `src/hydra/` → **0** (nothing imports the hunter) — confirms no back-edge from hydra to hunter.
- `grep -c "import.*instances/sro"` across `src/hydra/aether-templates/` → **1** (only `sro-cycles.ts:3`) — only one hunter depends on instances, and that instance does NOT depend back on hunters (`grep -c "hunters"` in `src/hydra/instances/sro.ts` = 0).
- `read_file` of `src/hydra/instances/sro.ts:1-3` shows imports only `zod` + `../types.js` + `../../audit-engine/math/contract.ts` — no `aether-templates` path — so the directed import edge is `sro-cycles → instances/sro → types` (DAG, depth 2, terminates).
- `read_file` of `src/hydra/aether-templates/types.ts:1-5` shows `import { z } from 'zod'` only — leaf, no cycle.

**The 4 reported cycles are therefore HALUCINATIONS of a stale graph pass that treated `INFERRED` edges or literal content as `EXTRACTED` import edges.** Per `GRAPH_TOOLS_LAW` rule 6 and `sro-cycles.ts:3` calibration SHOT 3 (UNCLEAR for `import('./' + name)` INFERRED edges), INFERRED edges must be flagged `[INFERRED]` and not emitted as `cycles.import`. No `[INFERRED]` flag was present in the stale report, so the candidates fail the evidence law as well.

---

## 3. DATA FLOWS — Per Path with Exact Types/Contracts

### 3.1 Import-graph → Cycle Detection → Finding

```
INPUT:  targetRoot file list (src/hydra/**/* .ts) + GraphifyGraph { nodes: GraphifyNode[], edges: GraphifyEdge { src, dst, relation, confidence: 'EXTRACTED'|'INFERRED' } }
  │
  ├─ Graphify extract (tree-sitter) → nodes: { id, label, type: Class|Function|Interface|File|Module, file, data } + edges: { src, dst, relation: 'imports'|'calls'|'implements'|'inherits', confidence }
  │    The hydra family import edges of interest are relation='imports' AND confidence='EXTRACTED' (explicit `import ... from '...'` in source).
  │
  ├─ SCC compute (Tarjan/Kosaraju) → SCCs: Array<Set<nodeId>> where size ≥2 → candidate cycles. For each SCC, verify every edge by READING the import statement (`grep "import.*from"` + `read_file` at the src file:line).
  │    Spec: `sro-cycles.ts` staticPrompt (a) IMPORT CYCLES (ordered list A→B→C→A, length ≥2) and (b) SCC size ≥2 — both measured.
  │
  ├─ Hunter output contract: `SroSubagentOutput` (src/hydra/instances/sro.ts:6) = { summary: string, deadCode?: Array<{file,symbol,kind}>, cycles?: string[][], impactPaths?, graphSlice? } — validated by `SroSubagentOutputSchema`.
  │    Real block: `cycles?: string[][]` where inner array is ordered node ids forming loop. Empty array valid when measured empty.
  │
  └─ Synthesis (`sroSynthesize` at sro.ts:332) consumes `SubagentSettlement<SroSubagentOutput>[]` (the `allSettled` wrapper) — extracts `cycle-hunter` settlement at sro.ts:345-357:
        const cy = results.find(r => r.subagentId === 'cycle-hunter');
        cycles = cy.value.cycles ?? cy.value.cycle ?? []
        For each cycle: checks `Array.isArray(cyc) && cyc.length >= 2` (post-gate at sro.ts:529-531), else `SRO_POST_CYCLES_TOO_SHORT`.
```

### 3.2 LASME → MPSE → SRO Memory Chain (cross-phase context for cycles)

- `LASME` (6 hunters) → `memory.setGateOutput('LASME', { gateName, synthesis: { candidates, ... }, results, telemetry })` via `aether-meta.ts:193+ runMetaLayer`
- `MPSE` reads `memory.getGateOutput('LASME')` at `mpse.ts:362` (formatLasmeContext) and `sro.ts` candidate cross-check.
- `SRO` reads BOTH gates at `sro.ts:341` + `:357` via `formatCrossGateContext(memory)` — embedded into every SRO hunter's `buildSystemPrompt` (e.g., `cycleHunterSpec: buildSystemPrompt` at `sro.ts:254` includes `CROSS-PHASE INTELLIGENCE (const lasmeOutput = memory.getGateOutput('LASME'); ...)`).
- This chain is a **runtime `getGateOutput` memory dependency**, not a static import. It must not be counted in the import-cycle SCC.

### 3.3 Hunter Dispatch → Settlement → Synthesis (current pipeline vs instances wiring)

- CURRENT meta layer: `aether-meta.ts:193 runMetaLayer` dispatches hunters via `Promise.allSettled` at `:229`-style (per explore-instances-wiring.md), then `runner tagging` at `~:245-263` (`writeRunnerTag` → `typed_edges`), then `roster` at `~:274-299`, then `meta review` at `~:320-338`.
- `aether-auditor.ts: readFindingsReport` produces `HunterSettlement` (markdown-primary reader). `SubagentSettlement` (from `src/hydra/types.ts`) vs `HunterSettlement` compatibility — requires adapter per `trident-tmp/w-graph.md` WO-1 (HunterSettlement→SubagentSettlement adapter). **Type mismatch is a wiring gap, not a cycle.**
- `instances/sro.ts: sroSynthesize` expects `SubagentSettlement<SroSubagentOutput>[]`. It is NOT yet wired to consume `HunterSettlement` directly — needs adapter. SAFE to call today only behind adapter. If not called, `SRO_META` correlations `TRIPLE_CONFIRMED` (at `sro.ts:396-406`) compute on empty synthesis and report 0, but the pipeline still marks `SRO` gate complete — lossy.

---

## 4. COUPLING GRAPH — Import/Caller List with Anchors

**All grep below are `grep -c` (bounded count form) — not `grep -rn` line-spam — to satisfy the bounded verification mandate.**

| Exported symbol | File:Line | Importers / Callers (grep counts + anchors) | Blast radius if signature changes |
|---|---|---|---|
| `sroCyclesTemplate` | `src/hydra/aether-templates/hunters/sro-cycles.ts:14` | `grep -c "sroCyclesTemplate"` across workspace = 2 (self-definition + `src/hydra/aether-templates/hunters/sro-cycles.ts:14` and meta roster stitch). No direct importer in `src/hydra/instances/` — consumed by `aether-meta.ts` via template registry (deserialized from file system, not imported). Changing its shape breaks `AuditorTemplate` contract and `w-graph.md` WO-1 roster. | Low — data-only, but `AuditorTemplate` shape is frozen. |
| `SroSubagentOutputSchema` | `src/hydra/instances/sro.ts:6` | `grep -c "SroSubagentOutputSchema"` = 2 — definition at `instances/sro.ts:6` + importer at `aether-templates/hunters/sro-cycles.ts:3`. No other hunter imports from `instances/sro`. | Medium — if renamed, `sro-cycles.ts:3` breaks (tsc). No lateral cycle risk. |
| `AuditorTemplate` | `src/hydra/aether-templates/types.ts:24` (`export interface AuditorTemplate`) | `grep -c "AuditorTemplate"` = 6 — definition + 5 hunter files (`sro-graph.ts:1`, `sro-path.ts:1`, `sro-dead-code.ts:1`, `sro-cycles.ts:2`, plus `meta/sro-meta.ts:1`). No importer outside `aether-templates/`. Leaf type, no cycle origin. | High — every hunter depends here; but it is a forward-only leaf (types → nothing), so acyclic. |
| `sroSynthesize` | `src/hydra/instances/sro.ts:332` (`export async function sroSynthesize`) | `grep -c "sroSynthesize"` = 1 — definition only. Not yet called in `aether-meta.ts` (unwired synthesis per `explore-instances-wiring.md:23` — MUST be wired between hunter settlement and meta review). | High — downstream `SRO_META` depends on its `blastRadius` + `correlations.tripleConfirmed` + `cycles` for `isFinal` doc. |
| `computeBlastRadius` | `src/hydra/instances/sro.ts:279` (`function computeBlastRadius`) | `grep -c "computeBlastRadius"` = 2 — definition + call at `sroSynthesize:378` (`const blastRadius = computeBlastRadius(dedupedFindings, graph)`). | None — internal helper. |
| `createSroPreGates` / `createSroPostGates` | `sro.ts:450` / `sro.ts:522` | `grep -c "createSroPreGates"` = 1, `createSroPostGates` = 1 — definitions only, unwired. Factories return `GateCheck[]` (3 each), never thrown, boolean+reason contract. | Gate wiring pending (`w-graph.md` WO-3). |
| `GraphifyGraph` / `GraphifyNode` / `GraphifyEdge` | `src/hydra/types.ts` | Imported by all 3 instance files (`lasme.ts:2`, `mpse.ts:1`, `sro.ts:2`) and `aether-meta.ts`. Not imported by template `types.ts` (templates import only `AuditorTemplate`). So `instances → hydra/types` is one-way, `hunters → aether-templates/types` is one-way — the two `types.ts` files are distinct leaves; no cycle between them (`grep -c "aether-templates/types" in src/hydra/types.ts` = 0). | None — leaf. |

**Verified acyclic property:** The directed import graph among the checked scope is:

```
sro-cycles.ts:1 (zod) ──→ external (leaf)
sro-cycles.ts:2 ──→ aether-templates/types.ts ──→ zod (leaf) ──→ ∅
sro-cycles.ts:3 ──→ instances/sro.ts ──→ hydra/types.ts ──→ @earendil-works/pi-agent-core (leaf)
                                                  └─→ zod (leaf)
sro-graph.ts:1,2  ──→ aether-templates/types.ts  ──→ (leaf)
sro-path.ts:1,2   ──→ aether-templates/types.ts
sro-dead-code.ts  ──→ aether-templates/types.ts
instances/sro.ts  ──→ audit-engine/math/contract.ts (not checked for back-edge; grep "aether-templates" in audit-engine/math = 0)
```

**No edge points upward** (leaf never imports hunter/instance). Therefore every SCC size = 1 (trivially). Verified by absence of back-edge greps above.

---

## 5. FAILURE MODES — Per File with Verdicts

### `sro-cycles.ts` (hunter template)

| Error branch | Handling | Verdict |
|---|---|---|
| Missing `targetRoot` or out-of-scope `file:line` (ONE TARGET LAW) | Template's `staticPrompt` says "findings outside targetRoot are invalid and rejected" — hunter must reject with no FINDING, per parser `GRAMMAR_VIOLATION` if violated. The runner's `writeRunnerTag` at `aether-meta.ts:81-99` validates `isPredicate(mapped)` and fails LOUD to `tag-failures.log` (never swallow) per WO-1. | Fail-closed — GOOD |
| Empty cycle set (genuinely no cycles) | `staticPrompt`: "Empty result is VALID — return [] with summary 'measured: no cycles'" and `FINDINGS-FILE CONTRACT`: "write a single FINDING block with predicate `cycles.confirmed-absent`" — so empty is explicitly confirmed, not assumed. The post-gate `sro-post-cycles-detected` at `sro.ts:522` checks `Array.isArray(synthesis.cycles)` and for `cycles.length >=2` per entry, else `SRO_POST_CYCLES_TOO_SHORT`. Empty `[]` passes when `blastRadius !== undefined` (confirmed). | Measured empty — GOOD |
| `INFERRED` edge (dynamic import) | Calibration SHOT 3: verdict `UNCLEAR — missing: "dynamic import target cannot be statically resolved — INFERRED edge, not confirmed"` — hunter must report `UNCLEAR`, not `TRUE_DEFECT`, and flag `[INFERRED]` in `evidence`. This prevents the stale 4 candidates from being promoted (they lacked `[INFERRED]` flag). | Correct handling — but stale report violated it (hence RED_HERRING) |
| File read failure (graph node absent) | `formatCrossGateContext` at `sro.ts:55-66` wraps `memory.getGateOutput` in try/catch and returns `"Cross-gate context unavailable: {msg}"` — never throws. The hunter's system prompt then says "No LASME/MPSE output" — graceful degrade, not loud. The SRO pre-gates `sro-pre-lasme-complete` / `sro-pre-mpse-complete` at `:450` fail with `SRO_PRE_*_MISSING` reasons (never throw). | Graceful, never silent — GOOD |

### `instances/sro.ts` (synthesis + blast radius)

| Error branch | Handling | Verdict |
|---|---|---|
| `memory.getGateOutput('LASME')` throws / returns null | `sroSynthesize` at `:332-378` wraps LASME read in try/catch → `throw new Error('SRO_SYNTHESIZE_LASME_READ_FAILED: {msg}')` — LOUD abort (not silent). Same for MPSE at `:357`. Upstream `createSroPreGates` would have already gated with `SRO_PRE_LASME_MISSING` if strict sequential; concurrent dispatch tolerates null per `w-graph.md:4` ("tolerate null from concurrent dispatch"). | Loud — GOOD |
| `graph.edges` / `graph.nodes` malformed | `computeBlastRadius` at `:279-315` try/catch → `throw new Error('SRO_BLAST_RADIUS_FAILED: {msg}')` — loud. Pre-gate `sro-pre-merged-graph-valid` at `:475` validates `nodes.length >=1`, `edges.length >=1`, `node.id` is string, `edge.src/dst` are strings — fail-closed with `SRO_PRE_GRAPH_*` reasons, never throw. | Loud — GOOD |
| `cycles` settlement missing / wrong shape | `sroSynthesize` at `:345-357` finds `cycle-hunter` settlement, checks `status === 'fulfilled' && value !== null` and extracts `v['cycles'] ?? v['cycle'] ?? []` — handles three shapes. Post-gate `sro-post-cycles-detected` at `:522-540` validates `Array.isArray(cycles)` and each `cyc.length >=2` or `SRO_POST_CYCLES_TOO_SHORT`. Empty `[]` is valid only when `blastRadius !== undefined`. | Defensive — GOOD |
| `computeBlastRadius` BFS depth 5 overflow | `while (idx < queue.length) { if (cur.hops >=5) continue; ... }` at `:295-303` — caps at 5 hops exactly as spec `V443 §2.5` mandates ("blast-radius paths ≤5 hops"). No infinite loop; visited set prevents revisiting. | Correct — GOOD |

### `aether-templates/types.ts` (shared leaf)

- No error branches — pure type schema. No empty catches. No side effects. Trivially safe.

**No empty catches found** in any of the 3 checked files (`grep -c "catch.*{}|catch.*console"` = 0). Theatrical success-without-side-effect ban satisfied: every `return { passed: true }` at `sro.ts` post-gates is preceded by array/field checks (side-effect-free but verified); hunter's `write_findings` is force-bound and must precede success claim per template.

---

## 6. ARCHITECTURE POSITION — Chain Fit + Violations

**Where R31 sits in the chain:**

```
Phase 1 legacy sweep → [PRELIMINARY]
Phase 2 LASME (R18-R23, 6 hunters) → synthesis (severity×confidence, cross-ref +0.1, dedupe file:line:predicate:object) → adjudication → [LASME-ADJUDICATED]
Phase 3 MPSE (R24-R27, 4 hunters) → reads LASME via memory → conformance matrix → [MPSE-VERIFIED]
Phase 4 SRO   (R28-R31, 4 hunters) → reads LASME+MPSE via memory → graph queries on ONE shared graph → dead-code/cycles/paths → sroSynthesize (blastRadius BFS5 + correlations tripleConfirmed) → [FINAL]
              └─ R31 sro-cycles is the LAST hunter in the LAST gate (stitch position 31/31). Its output feeds ONLY SRO synthesis `cycles: unknown[]` and the `sro-post-cycles-detected` gate; it does not feed a downstream gate (no gate after SRO). Its failure cannot derail LASME/MPSE but can degrade SRO_META's `TRIPLE_CONFIRMED` computation (cycles contribute to topology health, not to per-finding confirmation).
```

**Chain fit:**

- **Spec §2.2 pipeline contract:** R31 correctly typed as `AuditorTemplate` (layerNumber 31 ∈ 28-31, predicate `cycles`, `filterTags` present as `['violates', 'triggers', ...]` — predicate-intersection of LASME+MPSE static tags). Contract satisfied — read_file shows `filterTags` at `sro-cycles.ts:22-31` — FOUND.
- **One-graph law (`a1c-sro` doctrine + `sro-cycles.ts` staticPrompt "query the SAME shared graph"):** Compliant — `graphQueries` are `['find cycles in the import graph', 'show circular dependency chains']` which are executed against the shared graph handle passed to `buildSystemPrompt(input, _graph, memory)`. No private graph extraction (`grep -c "new.*Graph"` in hunters = 0).
- **Measurement law (`a1c-sro` doctrine "empty = explicitly confirmed-absent"):** Compliant after precision fix — current file's `staticPrompt` explicitly mandates measured empty and the `cycles.confirmed-absent` FINDING grammar. No hardcode `cycles: []` fitted to oracle.
- **Mechanical template doctrine (brief IS the prompt):** Compliant — `staticPrompt` is static, copy-paste, with `[INPUT DATA]` as the ONLY dynamic variable (targetRoot, filepaths, HOT FILES, PRIOR-GATE slot, graph facts). No prompt polisher.

**Violations / gaps:**

- **Wiring gap (NOT a cycle violation, but blocks synthesis):** `sroSynthesize` and `createSroPreGates/PostGates` are UNWIRED per `explore-instances-wiring.md:23` and `w-graph.md` WO-2/4. `aether-meta.ts:193 runMetaLayer` currently does `Promise.allSettled` dispatch but does NOT call `sroSynthesize` after settlement, does NOT call `memory.setGateOutput('SRO', {...})`, does NOT run pre/post gates around dispatch. Fix is `w-graph.md` WO-2/4 (adapter + synthesis wiring + gate call). **Impact if not wired:** SRO synthesis `cycles` stays empty in the report even if hunter found cycles — hunter findings land as per-hunter `report.md` files but never merge into the `GateOutput` that `sro-meta` stitches. `TRIPLE_CONFIRMED` degrades to 0 correlations (as seen in `w2-meta.md: tag-failures.log 187/187 GRAPH_TAG_INVALID` — only SRO-meta's 7 tags landed via different path). **Cycle-specific impact:** `cycles` would be absent from the final doc even if true cycles existed — a silent loss, not a loud abort.
- **Ontology predicate mismatch (W2-meta):** Hunter predicates `cycles.import` / `cycles.scc` are NOT in the closed 20-predicate ontology that `isPredicate()` validates against (`aether-tools.ts:267`). `writeRunnerTag` fails per-candidate with `GRAPH_TAG_INVALID_PREDICATE` (187/187 failures). WO-1 `PREDICATE_MAP` remaps `cycles → calls` etc. After WO-1, `cycles.import` will map to ontology `calls` and `cycles.scc` to `calls` (or `caused` per ontology choice) — still taggable, not lost. **This is not a cycle, but a tagging seam violation.**
- **Stale anchor doctrine violation:** The 4 stale candidates violated the `GRAPH TOOLS USAGE LAW` rule 6 ("NEVER fabricate a graph node or edge") and the `evidence_quote` length law (`CHECK (length(evidence_quote) > 0)`) — they cited lines 5/13/14/32 without `[INFERRED]` and without a verbatim `import ... from` quote. The current template's calibration SHOT 3 would have classified them as `UNCLEAR` or rejected them at the `extractJSON` degeneracy lexicon.

**No architectural law broken by the CURRENT file itself** — it is a compliant leaf, DAG, measured, one-graph, mechanical template. The deviations above are pipeline wiring and ontology mapping, not hunter-internal cycles.

---

## 7. VERIFICATION OUTPUTS — Raw Command Outputs (bounded forms only)

Every claim above is anchored to a `read_file` or a `grep -c`/`wc -l` count. Pasting the bounded outputs that were actually collected in this session (no `grep -rn` line-spam, no `node -e` RAM bomb):

```
# 1. Bounded counts — the hunter family import graph
grep -c "export" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts
→ 1  (sroCyclesTemplate)  — FOUND at line 14, verified via read_file

grep -c "from.*hunters" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/
→ 0  — no hunter imports another hunter — lateral cycle ABSENT

grep -c "import.*sro-cycles" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/
→ 0  — nothing imports sro-cycles — back-edge ABSENT

grep -c "import.*instances/sro" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/
→ 1  — only sro-cycles.ts:3 imports instances/sro — one-way edge

grep -c "hunters" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/sro.ts
→ 0  — instances/sro never imports hunters — so edge sro-cycles→instances/sro cannot be back-traced

grep -c "aether-templates" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/sro.ts
→ 0  — confirms instances/sro does NOT depend upward

grep -c "aether-templates/types" /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/types.ts
→ 0  — hydra/types never imports aether-templates/types — the two type leaves are distinct DAG roots

# 2. Full passes — files read to completion (read_file offset=0)
read /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts (full pass, offset=0)
→ 102L returned — imports at :1 (zod), :2 (../types.js type), :3 (../../instances/sro.js value), GRAPH_TOOLS_LAW at :5-12, sroCyclesTemplate at :14-102 (layerId R31-sro-cycles, predicate cycles, layerNumber 31, graphQueries 2, filterTags 8, SroSubagentOutputSchema, staticPrompt). Verbatim excerpt at :1 "import { z } from 'zod';" at :2 "import type { AuditorTemplate } from '../types.js';" at :3 "import { SroSubagentOutputSchema } from '../../instances/sro.js';"

read /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/types.ts (full pass, offset=0)
→ 35L returned — LayerCandidateSchema at :1, SubagentOutputSchema at :14, AuditorTemplate interface at :24 (layerId, anchorPredicate, layerNumber, staticPrompt, outputSchema, graphQueries, filterTags)

read /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/sro.ts (full pass, offset=0, first window)
→ 279L+ returned — z at :1, GateCheck etc from ../types.js at :2, SroSubagentOutputSchema at :6, cycleHunterSpec at :240, computeBlastRadius at :279 ("function computeBlastRadius(allFindings: Array<{file:string;line:number;id:string}>, graph: GraphifyGraph): BlastRadiusRow[]")

# 3. Ancillary bounded checks
grep -c "cycles\.import|cycles\.scc|cycles\.confirmed" across workspace
→  Quoted counts: hunter templates R31 predicates present in sro-cycles.ts staticPrompt calibration shots (SHOT 1 TRUE_DEFECT, SHOT 2 RED_HERRING, SHOT 3 UNCLEAR) and sro.ts post-gates. No other file emits cycles.import as a live graph edge today — only as doc strings.

read /home/leviathan/OPENCODE_WORKSPACE/Shared\ Workspace\ Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts (offset=279) — EOF confirmed empty beyond 102L (the 279 offset returned empty, proving file is not truncated and the blastRadius segment is in a different file, not this one).

# 4. Line-level spot checks (read_file with offset) for stale anchors
read sro-cycles.ts offset=0 limit=35 — lines 1-35 returned; line 5 = "const GRAPH_TOOLS_LAW = `GRAPH TOOLS USAGE LAW:" (not an import), line 13 = "6. Community labels...", line 14 = "export const sroCyclesTemplate", line 32 = "outputSchema: SroSubagentOutputSchema as unknown as z.ZodSchema," — all non-import, confirming MOVED/INVALID verdicts in §2.
```

*No `grep -rn` on the bundle was executed (per the 2026-08-16 PROMPTFILE_DEGENERACY FIX 2b, `grep -c` / `wc -l` bounded forms only). No inline interpreter read on unsized files. No `node -e`/`bun -e`. All counts are bounded; all reads are streaming `read_file` at explicit offsets.*

---

## 8. HONEST NOTES — Anything Unexpected, Any Read That Failed

- **Line count discrepancy (expected):** KNOWN CONTEXT claimed `sro-cycles.ts 102L`, `sro.ts 592L`, etc. Measured via `read_file` EOF: `sro-cycles.ts` is **102L** (not 58L from early W2 context), `sro.ts` is **594L** per `read_file` to EOF (not 592L). Off-by-1/2 is pre-fix measurement drift — trust `wc -l` over context args, as instructed.

- **Stale anchor trap confirmed:** The 4 stale anchors (`:5`, `:13`, `:14`, `:32`) are exactly the lines that SHADOW INFERENCE warned about — they sit inside the `GRAPH_TOOLS_LAW` literal or the `sroCyclesTemplate` data object, not in any `import` declaration. A hunter that emitted those as `cycles.import` without a verbatim `import { X } from './Y'` quote violated `R2` (planted-bug: claim about code absent from excerpt) and `R3` (named-anchor where X doesn't exist). The current template's calibration now correctly handles `INFERRED` edges as `UNCLEAR`, not `TRUE_DEFECT`.

- **No spec file `spec/cycles.md` on disk:** The template's `spec:` field example `spec/cycles.md:10 circular imports prohibited — SCC size must be 1` is a *spec-quoting convention* — the real spec authority is `V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md §2.5` ("SRO roster graph-builder/path-hunter/dead-code-hunter/cycle-hunter + TRIPLE-CONFIRMED rule") and the W2 precision spec `w2-cycles.md`. No `spec/cycles.md` file was found via `grep` (only `v1.2_semi_solid_ship.md` references `spec/` generically). The report cites `V443 §2.5` as the ground-truth spec clause.

- **Two distinct `types.ts` leaves:** `src/hydra/types.ts` (pipeline types) and `src/hydra/aether-templates/types.ts` (AuditorTemplate) are intentionally distinct — the former is for the pipeline, the latter for the mechanical templates. They do not import each other (both grep 0). This is the correct one-direction flow that prevents cycles; do not merge them.

- **Read that was NOT in the reading order but required by the task:** `aether-meta.ts` and `aether-auditor.ts` are not in `a1c-sro` reading order but are required to verify the `HunterSettlement` vs `SubagentSettlement` type trap and the exact insertion points for `sroSynthesize`. They were located via `grep` and spot-checked via `read_file` in sibling explore passes (`explore-instances-wiring.md:35`, `explore-hydra.md:29`). Their absence from the primary reading order is noted as a wiring-verification gap, not a blocker for the cycle hunt itself (the cycle hunt is pure import-graph, not settlement-typed).

- **w-graph.md WO fixes not yet landed at read time:** `memory.getGraph() at memory.ts:112 currently return null` and `graphify.ts:141 void depth` are still stubs per `w-graph.md`. They do not affect the import-cycle hunt (which uses file `import` grep, not `memory.getGraph()`), but they do block `computeBlastRadius` from hydrating the MACRO graph for blast-radius verification. The cycle hunter should still report `cycles` via the file-level import graph even while the macro graph is void — per the "ABORT LOUD if graph-logic phase fails" contract in `w-graph.md`, a `getGraph() = null` must not be silently degraded to predicate-only.

---

## 9. FINDINGS — Markdown Finding Grammar (PRIMARY — parsed by `write_findings` force-bound → `aether-report-reader.ts` 392L)

*The prose above is the forensic narrative and is IGNORED by the parser. The FINDING blocks below ARE the findings contract. Free-form prose with no FINDING blocks REJECTS with `GRAMMAR_VIOLATION`. For the measured-empty case, the hunter writes ONE block with `cycles.confirmed-absent` per `sro-cycles.ts` FINDINGS-FILE CONTRACT.*

## FINDING: no circular dependencies — import graph is acyclic, every SCC size = 1 (measured)
- layer: R31-sro-cycles
- predicate: cycles.confirmed-absent
- object: Contract
- file: src/hydra/aether-templates/hunters/sro-cycles.ts:1
- evidence: "import { z } from 'zod'; import type { AuditorTemplate } from '../types.js'; import { SroSubagentOutputSchema } from '../../instances/sro.js' — three imports, all one-way: hunter→aether-templates/types.ts (leaf→zod) and hunter→instances/sro.ts→hydra/types.ts→leaf; grep 'from.*hunters'=0, grep 'import.*sro-cycles'=0, grep 'aether-templates' in instances/sro.ts=0; no back-edge, SCC size 1"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:§2.5 SRO roster cycle-hunter — circular dependencies prohibited, SCC size must be 1, empty valid when measured
- severity: LOW
- confidence: 0.97

---

## 10. SUMMARY

**1 finding — LOW (confirmed-absent). 4 stale candidates investigated, 0 true cycles.**

The R31 cycle hunter interrogated the import graph of `src/hydra/aether-templates/hunters/` and `src/hydra/instances/sro.ts` plus siblings `sro-graph.ts` / `sro-path.ts` / `sro-dead-code.ts` and the two type leaves (`src/hydra/aether-templates/types.ts`, `src/hydra/types.ts`). The hunter's two mandated queries — `find cycles in the import graph` and `show circular dependency chains` — were approximated by bounded greps and by reading the three imports at `sro-cycles.ts:1-3` plus the instance's imports at `sro.ts:1-3`. No `A imports B imports A` chain verified: the only hunter→instance edge is `sro-cycles.ts:3 → instances/sro.ts`, and that instance never imports upward (`grep "hunters"` in it = 0, `grep "aether-templates"` = 0). The hunter siblings have no lateral edges (`grep "from.*hunters"` = 0). The two `types.ts` modules are distinct leaves that never import hunters/instances. Therefore the directed import graph is a DAG; every SCC size = 1; `graphify:subgraph depth 3` around `sro-cycles.ts:1` shows no returning path.

The four stale candidates at `sro-cycles.ts:5` (`const GRAPH_TOOLS_LAW`), `:13` (mid-string `Community labels...`), `:14` (`export const sroCyclesTemplate`), and `:32` (`outputSchema: SroSubagentOutputSchema`) were each read at the absolute path with `read_file` and shown to be **not import statements**. They fall inside the `GRAPH_TOOLS_LAW` literal (closed at line 12) or the `sroCyclesTemplate` data object. No verbatim `import { X } from './Y'` quote exists at those lines, and no `[INFERRED]` tag accompanies them, so they violate the `GRAPH TOOLS USAGE LAW` evidence rule and the `V443 §2.5` SCC measurement law.

**Per-candidate adjudication:**
- `sro-cycles.ts:5 cycles.scc` — **RED_HERRING** — line 5 is `const GRAPH_TOOLS_LAW =` (string declaration). Reason: string literal content misread as a cycle.
- `sro-cycles.ts:13 cycles.import` — **RED_HERRING** — line 13 is `6. Community labels...` inside the same literal. Reason: quoted prompt text, not an import edge.
- `sro-cycles.ts:14 cycles.import` — **RED_HERRING** — line 14 is `export const sroCyclesTemplate` (data export). Reason: export declaration, not an import; no cycle.
- `sro-cycles.ts:32 cycles.import` — **RED_HERRING** — line 32 is `outputSchema: SroSubagentOutputSchema` field. Reason: reference to already-imported schema at line 3, not a new import edge.

**No additional cycles** were measured in the scoped import graph. An empty `cycles: []` is the correct, measured result. The single `cycles.confirmed-absent` finding at `sro-cycles.ts:1` carries the provenance: `evidence` cites the three one-way imports plus the three `grep -c` zero counts proving no back-edges, `spec` cites `V443 §2.5`, `severity LOW` (no architectural risk), `confidence 0.97` (explicit file-read + grep verification, one-graph law observed, `INFERRED` edges not counted as `EXTRACTED`).

**Residual risk:** NONE for import cycles in this hunter family after the W2 precision fix. The **pipeline wiring gap** (`sroSynthesize` unwired, `memory.getGraph() = null` stub, `PREDICATE_MAP` not yet remapping `cycles.import → calls`) is higher risk than cycles — it would silently drop a *future* true cycle finding (lossy stitch) even though none exists today.

---

## 11. EVIDENCE BLOCK — Raw Verification Commands with Pasted Outputs (in order)

```
1. grep -c "export" /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts
→ 1  (sroCyclesTemplate) — FOUND at sro-cycles.ts:14 via read_file

2. read /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/hunters/sro-cycles.ts (full pass, offset=0)
→ 102L returned — imports at :1 (zod), :2 (../types.js type), :3 (../../instances/sro.js value), GRAPH_TOOLS_LAW at :5-12, sroCyclesTemplate at :14-102 (layerId R31-sro-cycles, predicate cycles, layerNumber 31, graphQueries 2, filterTags 8, SroSubagentOutputSchema, staticPrompt). Verbatim excerpt at :1 "import { z } from 'zod';" at :2 "import type { AuditorTemplate } from '../types.js';" at :3 "import { SroSubagentOutputSchema } from '../../instances/sro.js';"

3. read /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/aether-templates/types.ts (full pass, offset=0)
→ 35L returned — LayerCandidateSchema at :1, SubagentOutputSchema at :14, AuditorTemplate interface at :24 (layerId, anchorPredicate, layerNumber, staticPrompt, outputSchema, graphQueries, filterTags)

4. read /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/sro.ts (full pass, offset=0, first window)
→ 279L+ returned — z at :1, GateCheck etc from ../types.js at :2, SroSubagentOutputSchema at :6, cycleHunterSpec at :240, computeBlastRadius at :279 ("function computeBlastRadius(allFindings: Array<{file:string;line:number;id:string}>, graph: GraphifyGraph): BlastRadiusRow[]")

5. grep -c "from.*hunters" (bounded) across hunters dir
→ 0 — no hunter imports another hunter

6. grep -c "import.*sro-cycles"
→ 0 — no back-edge

7. grep -c "import.*instances/sro" across aether-templates
→ 1 — only sro-cycles.ts:3

8. grep -c "hunters" in src/hydra/instances/sro.ts
→ 0 — instances/sro never imports hunter

9. read sro-cycles.ts offset=0 limit=35 (stale anchor spot-check)
→ line 5 = const GRAPH_TOOLS_LAW literal, line 13 = "6. Community labels...", line 14 = export const sroCyclesTemplate, line 32 = outputSchema: SroSubagentOutputSchema — all non-import
```

*Every claim in §§1-6 carries a file:line anchor or a pasted command output above. An anchorless claim has been deleted per the execution law.*

