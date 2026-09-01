# POST-COMPACTION RESUME — Trident v4.4.2

## READ FIRST
1. src/context_management/CURRENT_STATE.md
2. src/context_management/DERAILMENT_ANALYSIS.md

## CURRENT TASK
Two parallel engineering tasks are IN PROGRESS:
1. Problem Solver Engine (src/poseidon/problem-solver.ts) — mental frameworks for autonomous diagnosis
2. R8/R15/R16 AST overhaul — replace text matching with AST-based detection

## NEXT STEPS AFTER TASKS COMPLETE
1. Verify problem-solver.ts compiles and is integrated into god-loop.ts
2. Verify R8/R15/R16 checkers produce fewer false positives
3. Switch build command from esbuild to bun build in package.json
4. Build dist with bun build
5. Deploy to container and TEST:
   - Plugin loads
   - Hooks fire
   - Identity injection works
   - Tools register
   - Poseidon Mode converges
6. Fix REAL bugs found during container testing
7. Generate ship package

## DO NOT
- Do NOT spend time fixing audit false positives by gaming checkers
- Do NOT add more .tridentignore patterns
- Do NOT rename variables to avoid keyword matching
- Do NOT use esbuild — use bun build
- Do NOT gate container test behind audit score

## KEY CONSTRAINTS
- Build: bun build src/index.ts --outdir dist --target bun --format esm --bundle
- 52 pre-existing TSC errors (zod v4, TS6.0) — ignore, esbuild/bun ignores them
- The dist-single-file check requires NO external imports in output
- Container testing is the PRIMARY gate, not audit score
