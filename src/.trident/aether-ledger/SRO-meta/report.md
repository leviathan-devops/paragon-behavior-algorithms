# SRO-meta — sro-orchestrator predicate — Adjudication Report

**Layer:** SRO-meta (R32)  
**Predicate:** `sro-orchestrator` → ontology `flagged_by`/`caused`/`derived_from` (SRO family, per PREDICATE_MAP)  
**RunId:** audit-1788174665340  
**Date:** 2026-08-31  
**Scope:** `src/hydra/aether-tools.ts` + `src/hydra/aether-meta.ts` + `src/hydra/instances/sro.ts` + `src/shared/knowledge-graph/ontology.ts`  
**Verdict:** 3 TRUE_DEFECT, 0 RED_HERRING, 0 UNCLEAR — adjudicated against current HEAD (post-C2 runner: repair round + runner tagging + brand fix + read confinement)  
**Authority:** AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §56 ONE GRAPH LAW, §1.4 one-target law + AETHER_CLEANUP_OVERHAUL_PLAN.md §62 Scope Pinning + c2-runner.md §18 runner tagging/brand + ontology.ts closed vocab (16 NODE_TYPES, 20 predicates)

---

## 1. SPEC EXTRACTION

- `AETHER_CLEANUP_OVERHAUL_PLAN.md:62` Scope Pinning — reads confined to targetRoot via READ_SCOPE_VIOLATION; one-target law hunt ONLY inside targetRoot; every finding file:line must resolve under targetRoot
- `c2-runner.md:18` runner-side tagging deterministic via DELETE-before-INSERT idempotent by canonical_id layerId:file:line with per-hunter tagsWritten in roster; LOUD log and continue on per-tag failure; brand fix via isPredicate before INSERT; read confinement via path.resolve + realpath + startsWith(root+sep)
- `AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:56` ONE GRAPH LAW — extract ONCE, query N times with canonical file keys; graphify file keys canonical via path.resolve(targetRoot)
- `ontology.ts:1-10` 16 NODE_TYPES closed, 20 predicates (lasme 6, mpse 4, sro 5: caused/derived_from/resolved_to/superseded_by/flagged_by, wiring 5), CHECK constraints enforce closed vocab, isPredicate/isNodeType gates before INSERT
- `sro-meta.ts:14-80` SRO META template — full 120L orchestrator law (stitch VERBATIM R28-R31, CORRELATIONS computed+presented verbatim, doc1 final review with citations, APPEND-ONLY, graph tools law)
- `aether-tools.ts:60-75` makeCappedReadTool confinement block, `aether-meta.ts:230-250` writeRunnerTag DELETE/INSERT, `instances/sro.ts:320-340` computeBlastRadius fileToNodeIds vs finding.file

Hunt mandate for SRO-meta (R32): orchestrate SRO hunters R28-R31 (graph, path, deadCode, cycles) via Promise.allSettled, stitch VERBATIM into doc2, compute CORRELATIONS mechanically from typed_edges, append final SRO meta review to doc1. Do-not-fire: **/*.test.ts, **/__tests__/**, **/fixtures/**, **/.trident/**.

---

## 2. CANDIDATE INVENTORY

Roster `src/.trident/aether-ledger/SRO-meta` findings/report.md — 3 candidates emitted against sro-orchestrator predicate, all adjudicated file:line anchored.

| # | file:line | predicate (hunter → ontology) | candidate subject | confidence | adjudication | reason |
|---|-----------|-------------------------------|-------------------|------------|--------------|--------|
| C0 (V0) | hydra/aether-tools.ts:67 | sro-orchestrator → `flagged_by` | Read confinement bypass via swallowed realResolve error — KRAKEN wander not mechanically impossible on failed realpath | 0.90 | **TRUE_DEFECT** | catch swallows realResolve failure and falls through to read without READ_SCOPE_VIOLATION |
| C1 (V1) | hydra/aether-meta.ts:235 | sro-orchestrator → `caused` | Runner-side tagging DELETE-before-INSERT not atomic — crash between deletes leaves typed_graph partially empty | 0.85 | **TRUE_DEFECT** | DELETEs + INSERTs not in transaction — atomicity gap breaks correlations |
| C2 (V2) | hydra/instances/sro.ts:328 | sro-orchestrator → `derived_from` | SRO blast-radius dedup misses path normalization — duplicate findingId inflates downstreamCount | 0.80 | **TRUE_DEFECT** | raw file strings without path.resolve causes relative vs absolute duplicate |

Summary: 3/3 TRUE_DEFECT at HEAD — all are residual after C2 runner wave (confinement added but fail-open left, runner tagging added but non-atomic, graph keys not normalized).

---

## 3. CODE EVIDENCE

### V0 — Read/grep confinement fail-open (TRUE_DEFECT) — src/hydra/aether-tools.ts:67
- **Spec:** AETHER_CLEANUP_OVERHAUL_PLAN.md:62 Scope Pinning + c2-runner.md:18 read confinement via realpath + startsWith
- **Code:** `src/hydra/aether-tools.ts:60-75` 
```ts
if (targetRoot) {
  try {
    const rootReal = realResolve(path.resolve(targetRoot));
    const resolved = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(targetRoot, filePath);
    const realFile = realResolve(resolved);
    if (!isWithinRoot(realFile, rootReal) && realFile !== rootReal) {
      return { content: [{ type: 'text', text: `${READ_SCOPE_VIOLATION}: ...` }], details: null };
    }
  } catch (e) { void (e as Error).message; } // <- fail-open
}
try { const text = fs.readFileSync(effectivePath, 'utf-8'); ... } // proceeds without violation
```
- **Evidence quoted:** `catch (e) { void (e as Error).message; }` inside makeCappedReadTool targetRoot check silently swallows realResolve failure
- **Divergence:** Must fail-closed: on catch, return READ_SCOPE_VIOLATION with attempted path. Same at `makeCappedGrepTool:112-120`. Symlink loop or unreadable parent where realpath throws bypasses confinement — KRAKEN wander residual despite C2 fix. Verified at HEAD by reading file.
- **Impact:** HIGH — scope pinning is security boundary; fail-open violates one-target law.

### V1 — Runner tagging non-atomic (TRUE_DEFECT) — src/hydra/aether-meta.ts:235
- **Spec:** c2-runner.md:18 runner-side tagging DELETE-before-INSERT idempotent
- **Code:** `src/hydra/aether-meta.ts:232-245` `function writeRunnerTag(...) { const canon = \`\${layerId}:\${file}:\${line}\`; ... const db = new Database(dbPath); db.exec(TYPED_GRAPH_DDL); db.prepare('DELETE FROM typed_nodes WHERE canonical_id = ?').run(canon); db.prepare('DELETE FROM typed_nodes WHERE canonical_id = ?').run(codeNodeId); db.prepare('DELETE FROM typed_edges WHERE src_canonical = ?').run(codeNodeId, canon, predicate); db.prepare('INSERT INTO typed_nodes ...').run(canon,...); db.prepare('INSERT ...').run(codeNodeId,...); db.prepare('INSERT INTO typed_edges ...').run(...); }`
- **Evidence quoted:** `DELETE FROM typed_nodes WHERE canonical_id = ?` then deletes for codeNodeId/edges followed by separate INSERT without BEGIN TRANSACTION/COMMIT
- **Divergence:** Not atomic — crash between DELETE and INSERT leaves typed_graph empty for that canonical_id, downstream correlations compute 0 and roster tagsWritten overcount vs persisted rows. Need `BEGIN IMMEDIATE` / `COMMIT` wrapper (WAL already added per C2, but transaction still missing). Verified at HEAD.
- **Impact:** MEDIUM — breaks SRO correlation truth (typed_edges count != candidates).

### V2 — File-to-node key mismatch (TRUE_DEFECT) — src/hydra/instances/sro.ts:328
- **Spec:** AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:56 ONE GRAPH LAW + sro.ts mandate canonical keys
- **Code:** `src/hydra/instances/sro.ts:320-330` `const fileToNodeIds = new Map(); for (const n of nodes) { const f = (n as {file?:string}).file; fileToNodeIds.set(f, [...]); } for (const finding of allFindings) { const startIds = fileToNodeIds.get(finding.file) ?? []; if (startIds.length===0) rows.push({findingId:..., impactPaths:[], downstreamCount:0});`
- **Evidence quoted:** `const id = v.file + ":" + v.line` and `if (!allFindings.some((f) => f.id === id))` uses raw strings; `fileToNodeIds.get(finding.file)` uses relative finding.file vs absolute n.file from `graph-mapper.ts:34 path.resolve(targetRoot)`
- **Divergence:** No path.resolve/relative normalization — `hydra/instances/sro.ts:5` relative vs `.../src/hydra/instances/sro.ts:5` absolute returns [] false-empty, and duplicate findingId via relative vs absolute inflates downstreamCount. Grep shows zero normalization in block. Breaks blast-radius measurement.
- **Impact:** MEDIUM — false-negative empty blast radius hides god-node impact.

---

## 4. VERDICT

**SRO-orchestrator adjudication — 3 findings, 3 TRUE_DEFECT, 0 RED_HERRING:**

| findingIndex | file:line | predicate | adjudication | confidence | reason |
|---|---|---|---|---|---|
| 0 | src/hydra/aether-tools.ts:67 | flagged_by | TRUE_DEFECT | 0.90 | fail-open on realResolve error — must return READ_SCOPE_VIOLATION |
| 1 | src/hydra/aether-meta.ts:235 | caused | TRUE_DEFECT | 0.85 | DELETE-before-INSERT not atomic — needs transaction |
| 2 | src/hydra/instances/sro.ts:328 | derived_from | TRUE_DEFECT | 0.80 | key mismatch absolute vs relative — needs path.resolve normalization |

**Candidate inventory summary:** All 3 roster candidates are TRUE at HEAD. No historical RED_HERRING in this mini-run (previous 13-verdict full-run had 3 fixed). Residual next-wave scope is exactly these 3 plus earlier V3-V5/V7/V10-V12 not covered by this 3-finding hunt.

**Mechanical anchors:** Every TRUE_DEFECT carries specPath+specLine+specQuote, codeQuote file:line verbatim, divergence (spec≠code), confidence 0.80-0.90, severity HIGH/MEDIUM. No fabricated graph nodes — evidence is explicit source slices.

**Honest residual:** Read confinement fail-open is highest residual (security boundary); tagging atomicity and key normalization are next-wave WO scope beyond aether-meta.ts WAL fix. No UNCLEAR — all 3 measured against HEAD.

*Generated by SRO-meta — sro-orchestrator predicate — mechanical investigation, file:line anchored, confidence calibrated. Ledger: src/.trident/aether-ledger/SRO-meta/verdicts.json (runId audit-1788174665340) + this report + findings/report.md (3 FINDING blocks).*
