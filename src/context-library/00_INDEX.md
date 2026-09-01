# Context Library Index — trident-brain-v4.3.3

**Project:** trident-brain-v4.3.3 (`trident-brain-v4-3-3`)
**Version:** v4.3.3
**Generated:** 2026-06-18T18:38:16.736Z
**Discovery:** 149 files, 27958 lines

---

## Purpose

This context library is the **single source of truth** for understanding,
building, and testing trident-brain-v4.3.3. It is designed to be consumed by both
human engineers and AI agents who need deep, mechanical understanding of
the system.

**This is not documentation.** This is a reference specification.
Every claim here is backed by discovered data or explicitly marked as
a design decision with rationale.

## File Cross-References

| File | When to Read | Key Questions Answered |
|------|-------------|----------------------|
| 01_ARCHITECTURE | Before any code change | How do components connect? Data flows? |
| 02_PATTERNS | When implementing new code | What structural patterns exist? |
| 03_FAILURE_MODES | When debugging | What breaks? Where? Why? How to fix? |
| 04_DECISIONS | When questioning design | Why was X chosen over Y? Cost? |
| 05_BUILD_PLAN | When building from scratch | What order do I build in? Commands? |
| 06_HOOK_API | When integrating hooks | Contracts? Input/output shapes? |
| 07_CONTAINER_TESTING | When verifying | How to test in container? Evidence? |
| 08_SUCCESS_CRITERIA | Before shipping | What must pass? Thresholds? |

## Key Principles

1. **Mechanical verification over human judgment.** Run a deterministic check,
   don't ask "does this look right?" See 08_SUCCESS_CRITERIA.md.

2. **Single-file bundles.** All internal modules inlined into one JS file.
   External deps marked `--external`. See 05_BUILD_PLAN.md.

3. **SCAN+REPLACE for identity.** Never unshift. Always find existing block
   and replace in-place. Idempotent by design. See 06_HOOK_API.md.

4. **DiscoveryResult as source of truth.** All mode tools derive output
   from the same discovery scan. No stale cached data.

5. **Validation as warning, not error.** Missing headings produce warnings,
   not pipeline failures. Forward progress preserved.

6. **Sequential layer pipelines.** Layer N+1 depends on Layer N output.
   Parallelism adds complexity without value for linear dependencies.

7. **Evidence over assertion.** Every claim must have a source: discovered
   file:line reference, test output, or explicit design decision.

## Critical Rules (Must Follow)

1. `tsc --noEmit` MUST return exit code 0 before any commit.
2. esbuild MUST mark `@opencode-ai/plugin` and `zod` as `--external`.
3. The bundle MUST NOT contain relative imports (`../../../`).
4. Identity injection MUST use SCAN+REPLACE, never unshift without check.
5. Every catch block MUST either re-throw, log with context, or have
   a documented fallback. Empty catches are CRITICAL findings.
6. Every tool MUST have a zod schema with `.strict()` to reject unknown fields.
7. The orchestrator state machine MUST throw on out-of-range layer access.
8. Context library MUST have exactly 9 files. Fewer = incomplete.
9. Self-audit score MUST be >= 80 before shipping. >= 90 is target.
10. Sequential tool calls (5+) MUST NOT throw state machine errors.
11. Container identity test: "who are you" MUST return correct identity.
12. No CRITICAL findings in self-audit, or all CRITICAL findings justified.

## Architecture Summary

- **Languages:** ts (127), json (8), md (13), py (1)
- **Entry Points:** index.ts
- **Total Files:** 149
- **Total Lines:** 27958
- **Patterns Discovered:** 50
- **Failure Modes:** 20
- **Design Decisions:** 0
- **Warheads:** 16
- **Audit Layers:** 18

## Quick Navigation

```
trident-brain-v4.3.3/
âââ context-library/
â   âââ 00_INDEX.md          <- You are here
â   âââ 01_ARCHITECTURE.md   <- System design, components
â   âââ 02_PATTERNS.md       <- Structural patterns
â   âââ 03_FAILURE_MODES.md  <- Known defects
â   âââ 04_DECISIONS.md      <- ADR log
â   âââ 05_BUILD_PLAN.md     <- Build phases
â   âââ 06_HOOK_API.md       <- Hook contracts
â   âââ 07_CONTAINER_TESTING.md
â   âââ 08_SUCCESS_CRITERIA.md
âââ src/
â   âââ index.ts             <- Plugin entry
â   âââ orchestrator.ts      <- State machine
â   âââ hooks/               <- Hook handlers
â   âââ tools/               <- Tool definitions
â   âââ audit-engine/        <- Audit layers
â   âââ artifacts/           <- Artifact generators
âââ dist/
    âââ index.js            <- Single-file bundle
```

## Discovery Data Summary

### Patterns (52 entries)
- output.args fix
- v4.3.2 guard pattern
- deepPlanningMachine (export) — deep-planning-machine.ts:11
- DeepPlanningContext (interface) — types.ts:4
- ProblemSolvingContext (interface) — types.ts:23
- ContextSynthesisContext (interface) — types.ts:46
- SessionState (interface) — types.ts:65
- OrchestratorContext (interface) — types.ts:71
- MachineState (interface) — orchestrator-machine-v2.ts:24
- OrchestratorMachineV2 (class) — orchestrator-machine-v2.ts:53
- orchestratorMachineV2 (export) — orchestrator-machine-v2.ts:180
- problemSolvingMachine (export) — problem-solving-machine.ts:12
- contextSynthesisMachine (export) — context-synthesis-machine.ts:11
- KnownPattern (interface) — hive-loader.ts:16
- parseMetaPatterns (function) — hive-loader.ts:171
- ... and 37 more (see 02_PATTERNS.md)

### Failures (20 entries)
- [OrchestratorMachine] ${errorMsg} — orchestrator-machine-v2.ts:79 [pattern: throw new Error(`[OrchestratorMachine] ${errorMsg}`]
- [OrchestratorMachine] Cannot advance layer from status ${this.state.status} — orchestrator-machine-v2.ts:115 [pattern: throw new Error(`[OrchestratorMachine] Cannot advance layer from status ${this.s]
- [Component] operation failed: — hive-loader.ts:50 [pattern: console.error("[Component] operation failed:"]
-  console.log('caught:', e.message); — scoring.ts:43 [pattern: catch(e) { console.log('caught:', e.message); }]
- LOAD FAILED: — scoring.ts:46 [pattern: console.error('LOAD FAILED:']
-  console.log('MISSING:', e.message); — scoring.ts:48 [pattern: catch(e) { console.log('MISSING:', e.message); }]
- [Context] failed: — r14-control-flow-graph.ts:395 [pattern: console.error("[Context] failed:"]
- [component] failed: — r16-bible-enforcement.ts:214 [pattern: console.error("[component] failed:"]
- config.${propName} required — r16-bible-enforcement.ts:448 [pattern: throw new Error('config.${propName} required']
- [Component] operation failed: — r4-error-handling.ts:26 [pattern: console.error("[Component] operation failed:"]
- ... and 10 more (see 03_FAILURE_MODES.md)

### Decisions (0 entries)

---
*Generated by Trident v4.3.3*
