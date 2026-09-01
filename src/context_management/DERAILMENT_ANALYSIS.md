# Derailment Analysis — Why 12 Hours Were Wasted on Audit Gaming

## What Happened
The God Loop's phase sequence creates an infinite loop:
AUDIT → fix → recheck → AUDIT → fix → recheck → ...never reaches CONTAINER_TEST

## Why It Happened
1. CONTAINER_TEST is gated behind score >= 96
2. Score can't reach 96 because R8/R15/R16 produce false positives
3. False positives can't be "fixed" in source code without gaming the checker
4. PROBLEM_SOLVE (the stall breaker) is a NOP that resets the counter and loops back
5. The stall detector can never permanently fire because PROBLEM_SOLVE resets it

## Root Causes
1. ARCHITECTURE: PROBLEM_SOLVE doesn't solve problems — it generates text and loops
2. ARCHITECTURE: Container test should be parallel, not sequential after audit convergence
3. CHECKER: R8/R15/R16 use text matching from 4 months ago, never overhauled
4. BUILD: esbuild with externals instead of bun build
5. NO TRIAGE: System can't distinguish real bugs from checker false positives

## Fix
1. Build ProblemSolver engine with mental frameworks (Five Whys, Fault Tree, etc.)
2. Replace PROBLEM_SOLVE with ProblemSolver.solve() call
3. Overhaul R8/R15/R16 to AST-based detection
4. Switch to bun build
5. Container test BEFORE audit optimization
