# MPSE META AUDIT — Contract/Oracle/Stage/Provenance Forensic

> Target: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src
> Predicate: mpse-meta (contract conformance, oracle epsilon, stage-gate, provenance trace-gap)
> Date: 2026-08-30 — Aether overhaul post-Wave2
> Run: audit-1788174665340

## Methodology

One-target law verification: hunt ONLY inside targetRoot (src/). Graphify extraction and corbell typed graph inspected via hydra/memory.ts, hydra/graph-mapper.ts, hydra/graphify.ts. MPSE contract oracle stage provenance clauses extracted from MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240 (mechanical template doctrine), V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:§2.4 (MPSE roster + gate conditions), and PARAGON_L2 spec for epsilon handling. Each candidate verified by graph-adjacent file reads (320-line windows) then evidence quote extraction. Prior-gate LASME candidates filtered per filterTags intersections (contract: threshold/contract/spec-clause, oracle: threshold/epsilon, stage: pre-condition/post-condition/invariant, provenance: spec-clause/trace). Tool outputs capped at 320 lines (read) and 120 results (grep). Confidence is severity×evidence strength.

---

## FINDING: Contract violation — dual hunter hierarchies coexist as parallel communities violating mechanical template doctrine
- layer: mpse-meta
- predicate: contract.violated
- object: Contract
- file: audit-engine/index.ts:82
- evidence: "import { lasmeSpecs, lasmeSynthesize, lasmePreGates, lasmePostGates } from '../hydra/instances/lasme.ts';"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240 mechanical template doctrine — brief IS the prompt, AuditorTemplate is the sole dispatch contract, SubagentSpec uses function-based builders
- severity: HIGH
- confidence: 0.89

**Legs:** (1) Spec clause — AETHER §2.2 mandates registry aether-templates/hunters/{lasme-*,mpse-*,sro-*} + meta/* as SOLE dispatch contract (14 hunters + 3 metas, each AuditorTemplate R18→R31), explicitly replacing function-typed SubagentSpec<TInput,TSubResult> (hydra/types.ts:28 buildSystemPrompt(input,graph,memory): string). (2) Code quote — audit-engine/index.ts:82-95 simultaneously imports BOTH hierarchies: `lasmeSpecs` from hydra/instances/lasme.ts AND `lasmeLexiconTemplate` from hydra/aether-templates/hunters/lasme-lexicon.ts plus mpse/sro equivalents (14 template imports + 3 spec arrays). Verified via reading audit-engine/index.ts 320-line window and grep for `from.*hydra/instances` and `from.*aether-templates`. (3) Divergence — import graph bipartite duplication: 6 LASME concepts exist twice (r-lexicon → rLexiconSpec in instances/lasme.ts:177 and lasmeLexiconTemplate in aether-templates/hunters/lasme-lexicon.ts), likewise 4 MPSE and 4 SRO. Degree analysis: audit-engine/index.ts has fan-in from callers and fan-out to both hierarchies making it god node. Community detection assigns instances/ and aether-templates/ to separate communities despite identical anchor predicates, violating declared layer boundary (templates are DATA, not functions — §2.2). This is same root cause as SRO R28 FINDING 3, cross-validated for MPSE gate.

---

## FINDING: Oracle unguarded threshold — numeric oracle equality uses bare === without epsilon envelope
- layer: mpse-meta
- predicate: oracle.unguarded
- object: Contract
- file: audit-engine/math/contract.ts:54
- evidence: "return ev === ov ? 'VALID' : 'CONTRADICTED';"
- spec: MASTER_CONTEXT/PARAGON_L2_BUILD_SPEC.md:681-701 OracleDeclaration {exprId, oracleValue, epsilon?} — floats compare ONLY against REGISTERED epsilon via discharge discipline
- severity: HIGH
- confidence: 0.91

**Legs:** (1) Spec clause — PARAGON §4.2.5 defines OracleDeclaration with optional epsilon and the discharge discipline: floats compare ONLY against REGISTERED epsilon (the integer/boolean/set equality, the floats compare ONLY against the REGISTERED epsilon, a missing oracle → UNMEASURABLE fail-closed). V443 §2.4 oracle-checker mandate: "For each numeric threshold, verify the epsilon bound is enforced in code — Math.abs + comparison operators near threshold constants; threshold without epsilon guard is VIOLATION". (2) Code quote — audit-engine/math/contract.ts:54 in toBrandedVerdict: `return ev === ov ? 'VALID' : 'CONTRADICTED';` handles generic oracleValue including numbers with strict equality, and for arrays does `JSON.stringify(ev) === JSON.stringify(ov)` similarly bare. No Math.abs, no epsilon band, no tolerance read from OracleDeclaration.epsilon. (3) Divergence — any floating-point oracle (e.g., price equality epsilon 0.005) will fail on tiny noise because code demands exact bitwise equality. Graph query "find Math.abs and comparison operators near threshold constants" near this function returns zero hits (verified via grep for Math.abs in math/ directory — only hydra instances, not here). This mirrors mpse-oracle SHOT 2 true-defect pattern (bare equality without epsilon envelope). The checkContract path for stage 'inv' also bypasses epsilon — checked.

---

## FINDING: Stage invariant violated — read/grep confinement fails open on error swallowing scope violation
- layer: mpse-meta
- predicate: stage.violated-inv
- object: Contract
- file: hydra/aether-tools.ts:70
- evidence: "} catch (e) { void (e as Error).message; }"
- spec: MASTER_CONTEXT/AETHER_CLEANUP_OVERHAUL_PLAN.md:§6 Scope Pinning — reads confined to targetRoot via READ_SCOPE_VIOLATION + AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §1.4 one-target law — hunt ONLY inside targetRoot
- severity: CRITICAL
- confidence: 0.9

**Legs:** (1) Spec clause — W1 scope-law guard + AETHER_CLEANUP_OVERHAUL_PLAN §6 defines scope pinning: reads confined to targetRoot via path.resolve + startsWith(root+sep), realpath for symlinks, READ_SCOPE_VIOLATION + attempted path on refusal; relative and absolute-inside-root both pass. Invariant: confinement must be fail-closed (any error in scope resolution must deny, not allow). (2) Code quote — hydra/aether-tools.ts:70 inside makeCappedReadTool's targetRoot guard: `} catch (e) { void (e as Error).message; }` — the catch after `if (!isWithinRoot(realFile, rootReal))` check's outer try swallows errors from realResolve/isWithinRoot and falls through to `fs.readFileSync(effectivePath)` without returning violation. Identical pattern in makeCappedGrepTool at ~115: `} catch (e) { void (e as Error).message; }` after grep root check. (3) Divergence — an attacker-controlled path that throws during realResolve (e.g., dangling symlink, ENOENT) will bypass confinement and read outside targetRoot — the KRAKEN wander residual the confinement was meant to kill. SRO-meta already flagged this as CRITICAL fail-open bypass (this finding cross-confirms R28-meta finding). MPSE stage lens: pre-condition `targetRoot inside scope` is not enforced on all paths from read entry — invariant violated.

---

## FINDING: Provenance trace gap — SharedMemoryStore.mergeGraphSlice is no-op void despite spec mandating corbell merge transaction
- layer: mpse-meta
- predicate: provenance.trace-gap
- object: Contract
- file: hydra/memory.ts:140
- evidence: "mergeGraphSlice(_slice: object): void { return; }"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:240 one shared graph — all hunters query the SAME shared graph; V443 §2.8 SharedMemoryStore.mergeGraphSlice()/queryGraph() hydrate path for corbell merged graph
- severity: HIGH
- confidence: 0.88

**Legs:** (1) Spec clause — V443 §2.8 defines SharedMemoryStore.mergeGraphSlice(slice: object): void as hydrate path for corbell merged graph (phase-2 upgrade: transform slice into typed_nodes/typed_edges rows INSERT OR REPLACE into typed_nodes, INSERT into typed_edges with lineage validation inside transaction, mirroring db.ts writeGraph semantics) and getGraph()/queryGraph() as query path. AETHER §1.4 one-graph law: all hunters query the SAME shared graph (extract ONCE, query N times via graphify) with canonical file keys. (2) Code quote — hydra/memory.ts:140-150: `mergeGraphSlice(_slice: object): void { return; }` with comment "Phase-1 stub: no-op — graph slices are merged by graphify's GraphMapper.merge. Phase-2 upgrade: transform the slice into typed_nodes/typed_edges rows..." and sibling `queryGraph(_query: string): Promise<unknown> { return null; }` also stub. (3) Divergence — graph extraction lives in GraphifyMCPMapper.extract() writing graphify-out/graph.json, while SRO tagging lives in aether-meta.ts:writeRunnerTag() writing directly to shared.db. The two graphs never merge: getGraph now reads typed_nodes (later version) but mergeGraphSlice never hydrates Graphify slices into corbell, and queryGraph never queries corbell — provenance path spec clause → code implementation via graphify:path therefore returns "no graph connection found" for any clause requiring corbell proof, producing false TRACE_GAPs. This matches SRO R28 FINDING 1 dual-graph split root cause, now proven as MPSE provenance gap.

---

## FINDING: Contract drift — MPSE pre-gate reads memory from wrong shape, always reports LASME missing
- layer: mpse-meta
- predicate: contract.violated
- object: Contract
- file: hydra/instances/mpse.ts:418
- evidence: "const mem = (_target as unknown as { memory?: SharedMemoryStore }).memory;"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:420 MPSE Gate Conditions Pre-gates: LASME gate completed (evidence: manifest exists in shared memory) + Spec §2.1 PipelineConfig gates.pre: GateCheck<TInput> where TInput is AuditGateInput
- severity: MEDIUM
- confidence: 0.87

**Legs:** (1) Spec clause — V443 §2.4 MPSE Pre-gates: "LASME gate output exists in memory" and PipelineConfig gates.pre is GateCheck<TInput>[] where TInput = AuditGateInput {targetRoot: string, specs?: string[], specPaths?: string[]} (hydra/instances/mpse.ts:5-9). The pipeline's pre-gate invocation is `gate.check(input)` with input being the TInput passed to pipeline.execute (hydra/pipeline.ts:16). (2) Code quote — hydra/instances/mpse.ts:418 inside createMpsePreGates lasmeGateExists: `const mem = (_target as unknown as { memory?: SharedMemoryStore }).memory;` casts the AuditGateInput to an object with optional memory field and reads it; if undefined, returns `MPSE_PRE_LASME_MISSING: LASME gate output not found in shared memory — cannot verify pre-gate without memory handle`. (3) Divergence — AuditGateInput never carries memory; memory lives on PipelineConfig.memory (hydra/pipeline.ts:6) and SharedMemoryStore is accessed via `this.memory` or config.memory, not via input. The gate therefore always takes the `cannot verify without memory handle` branch unless the caller illegally injects memory into the input object, masking a true LASME completion. The LASME post-gate correctly validates synthesis, but MPSE pre-gate is wired to the wrong data source — contract drift between spec wiring (shared memory store) and implementation (input field). Verified by reading hydra/types.ts AuditGateInput interface and hydra/pipeline.ts pre-gate loop.

---

## FINDING: Dead dispatch seam voids tools and always throws — AetherHydraPipeline pipeline is orphaned contract
- layer: mpse-meta
- predicate: provenance.trace-gap
- object: Contract
- file: hydra/pipeline.ts:143
- evidence: "throw new Error('AETHER_MIGRATION: buildAndRunSubagent removed — the primary path uses runMetaLayer from aether-meta.ts');"
- spec: MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:410 pipeline dispatch must Promise.allSettled concurrent subagents with graphifyTools; AetherHydraPipeline is the gate skeleton
- severity: MEDIUM
- confidence: 0.91

**Legs:** (1) Spec clause — AETHER §2.1 defines nesting seam assembling boilerplate (new ShadowAgent/AetherAgent + brief-builder.weave + buildAuditorTools) and running it via PipelineConfig.execute with Promise.allSettled concurrent subagents; §1.2 Hole Map H2 rounds doctrine as must-live mechanic. (2) Code quote — hydra/pipeline.ts:143-149 `private async dispatchSubagent(...): Promise<TSubResult> { const tools: AgentTool[] = [...graphifyTools, ...(spec.additionalTools ?? [])]; void tools; // tools assembled but unused — primary path bypasses this method throw new Error('AETHER_MIGRATION: ...'); }` — `void tools` explicitly marks assembled graphifyTools as unused dead code. (3) Divergence — class AetherHydraPipeline is still imported and instantiated in audit-engine/index.ts:78 `import { AetherHydraPipeline } from '../hydra/pipeline.ts';` giving file in-degree 1 yet core dispatch has out-degree 0 functionally — dead node masquerading as live orchestrator. Real dispatch is runMetaLayer in hydra/aether-meta.ts:168-260 which directly calls runLayerHunter. Provenance trace from spec pipeline contract to code implementation finds two competing implementations (pipeline.ts dead seam vs aether-meta.ts live seam) with no EXTRACTED edge disambiguating which is authoritative — the spec's pipeline contract therefore has orphaned provenance (one implementation is dead). This corroborates SRO R28 FINDING 2.

---

## SUMMARY

6 findings — 2 HIGH (dual hierarchies, mergeGraphSlice no-op, oracle bare equality), 1 CRITICAL (read confinement fail-open), 2 MEDIUM (MPSE pre-gate memory shape drift, dead dispatch seam). Cross-gate synthesis: the dual-hierarchy contract drift (Finding 1) explains why MPSE pre-gate (Finding 5) must cast input to read memory — the PipelineConfig vs AuditorTemplate split creates two parallel type worlds. The mergeGraphSlice no-op (Finding 4) plus getGraph stub legacy directly causes provenance trace gaps for any MPSE clause requiring corbell graph proof; without hydrating Graphify slices, the "one shared graph" law is violated and TRIPLE-CONFIRMED correlation (LASME+MPSE+SRO same file:line) cannot be computed across split stores. The oracle bare equality (Finding 2) and read confinement fail-open (Finding 3) share same root class: missing epsilon/bound enforcement near decision gates — both perform strict equality / isWithinRoot checks without tolerance or fail-closed error handling. The dead dispatch seam (Finding 6) confirms pipeline.ts is orphaned provenance; its surviving import in audit-engine/index.ts keeps graph degree artificially inflated, masking true orchestrator (aether-meta.ts).

**Counts:** candidates 6, HIGH 3, CRITICAL 1, MEDIUM 2. All findings carry file:line + verbatim evidence + implicated spec clause per markdown grammar. No INFERRED edges fabricated; every graph claim verified via grep/read with 320/120 caps. The MPSE gate stitch contract (R24→R27) must still emit 4 verbatim hunter sections under "## MPSE" after LASME; meta review APPEND-ONLY law (## MPSE META) is mechanically enforced. Honest residuals: LASME candidates filtered per filterTags were examined via hydra/instances/mpse.ts formatLasmeContext — predicate-intersection rule statically wired; runtime filtering occurs in aether-meta.ts prior-gate slot injection. No new orphans created by these findings.
