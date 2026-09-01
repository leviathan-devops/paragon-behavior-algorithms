# AETHER SRO ORCHESTRATOR FINDINGS — SRO-meta KRAKEN / orchestrator seam

## FINDING: Read confinement bypass via swallowed realResolve error — KRAKEN wander not mechanically impossible on failed realpath
- predicate: flagged_by
- file: src/hydra/aether-tools.ts:67
- evidence: `catch (e) { void (e as Error).message; }` inside makeCappedReadTool targetRoot check silently swallows realResolve failure and falls through to file read without returning READ_SCOPE_VIOLATION
- spec: c2-runner.md:18 — READ confinement via path.resolve + realpath + startsWith(root+sep) must return READ_SCOPE_VIOLATION with attempted path on refusal; relative and absolute-inside-root both pass
- severity: HIGH
- confidence: 0.9

## FINDING: Runner-side tagging DELETE-before-INSERT not atomic — crash between deletes leaves typed_graph partially empty and breaks SRO correlations
- predicate: caused
- file: src/hydra/aether-meta.ts:235
- evidence: `DELETE FROM typed_nodes WHERE canonical_id = ?` then delete for codeNodeId then delete typed_edges followed by separate INSERT INTO typed_nodes without BEGIN TRANSACTION/COMMIT in writeRunnerTag
- spec: c2-runner.md:18 — runner-side tagging deterministic via DELETE-before-INSERT idempotent by canonical_id layerId:file:line with per-hunter tagsWritten in roster; LOUD log and continue on per-tag failure
- severity: MEDIUM
- confidence: 0.85

## FINDING: SRO blast-radius dedup misses path normalization — same file via relative vs absolute creates duplicate findingId and inflates downstreamCount
- predicate: derived_from
- file: src/hydra/instances/sro.ts:328
- evidence: `const id = v.file + ":" + v.line` and `if (!allFindings.some((f) => f.id === id))` uses raw file strings without path.resolve normalization before dedup
- spec: c2-runner.md:41 — ONE graph — extract ONCE per run, query N times, tag N findings; sroSynthesize dedupedFindings must normalize to prevent duplicate blastRadius entries
- severity: MEDIUM
- confidence: 0.8

## SUMMARY
3 finding(s) extracted from markdown report — SRO orchestrator seam: read confinement bypass (HIGH), runner tagging atomicity (MEDIUM), blast-radius dedup normalization (MEDIUM). All predicates in SRO ontology (flagged_by, caused, derived_from) and evidence quotes are explicit source slices.
