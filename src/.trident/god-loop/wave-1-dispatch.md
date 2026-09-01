[POSEIDON: PLAN -> DISPATCH]
Wave 1: 1 agents. Complexity: low.
Each agent has specific findings + SOURCE CODE context with >>> markers.
Root-cause groups: R0:EMPTY_TARGET(1)

[POSEIDON: PLAN — Fix Strategy Required]

Decision Context: # DECIDE-1 — 2026-08-31 — CHOICE: FIX (B — PROBLEM_SOLVE, root-caused + surgically fixed)

## The finding this decision fixes
FINDING R0 — [CRITICAL] "No source files found in targetPath — INCONCLUSIVE"
(runIds audit-1788149215902 / audit-1788149504245 / audit-1788149521122 — three identical host
runs; the abort contract held each time: GRAPH_LOGIC: FAILED, zero gates, never a fake PASS).

## The root causes (both found, both FIXED — the fix is applied in the working tree)
1. **UNIQUE constraint failed: graph_nodes.id** — the native-ast adapter's bare-name id scheme
   (`class:X`, `fn:y`, not file-qualified) collides across files at repo scale (473 files vs the
   3-file fixture with unique names). One duplicate id aborted the whole writeGraph transaction.
   FIX APPLIED: first-wins node dedupe at build's end + the loud dropped count — the edges keep
   referencing the kept id string, referentially intact. File: src/subagents/trident-bug-hunter/
   graph/native-ast-adapter.ts (the DUPLICATE-ID DEDUPE block after the dangling-edge drop).
2. **The rename collision** — r4-data-flow-analysis.ts carried `layer: 'R2'` (the second rename
   sed pass ran R13→R4 then R4→R2 within one invocation — double-hit), colliding with
   r2-error-handling's 'R2'; LayerEngine last-wins dropped ERROR-HANDLING from the battery
   entirely (the host report's layer table: R2=DataFlow, no error-handling row).
   FIX APPLIED: r4-data-flow-analysis.ts layer → 'R4' (6 sites). The registered set is now the
   distinct {R1,R2,R3,R4,R5}.

## Why FIX (not skip/defer/triage)
Both defects are emitter-side surgical edits, already applied in the working tree. The remaining
work is the VERIFICATION GATE LADDER: tsc scoped → the battery (hydra/aether-backend/score/
self-audit/allowlist) → bun run build (the ~18.3MB size gate) → the adapter dedupe probe → the
bundle marker greps → the host redeploy (the new sha) → RT-1 re-fires on this src. A remediation
wave re-planned from the stale pre-fix findings would re-derive the same two edits.

## The verification order
1. tsc scoped (0 new)
2. battery: hydra 1299/0 · aether-backend 672/0 · score 9/0 · self-audit 84/0 · allowlist 5/0
3. bun run build — the size gate ~18.3MB
4. the adapter probe: dedupe fires, unique counts, writeGraph clean
5. the marker greps on dist/index.js: DUPLICATE-ID DEDUPE + GO RUNG present
6. the new dist sha → the host redeploy → RT-1 re-fires (typed_nodes ≥ 1000 on this repo)


Files with findings (1 files, 1 total findings):
Each file gets ONE agent. That agent handles ALL findings in its file.

### (entire project) (1 findings)
[CRITICAL] R0 at line 1:
  Description: No source files found in targetPath — INCONCLUSIVE
  Suggested fix: Point trident-code-audit at a directory containing src/ with .ts files

Strategy Required:
For each file, provide:
1. Root cause (WHY do these findings exist? Not just WHAT is wrong)
2. Approach (HOW to fix — address root cause, not symptoms)
3. Blast radius (WHAT ELSE is affected by this change?)
4. Depth level (surface/medium/deep/root — match to severity)

The loop is at PLAN. Call trident-poseidon action=loop to get the DISPATCH instructions.

PLAN: review the wave strategy above. Write .trident/god-loop/plan-1.md with:
1. Per-file root cause (WHY the findings exist)
2. Approach (HOW to fix — address root cause, not symptoms)
3. Blast radius (WHAT ELSE is affected)
4. Depth level (surface/medium/deep/root — match to severity)
Then call trident-poseidon action=loop to get the DISPATCH instructions.