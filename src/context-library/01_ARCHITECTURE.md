# Architecture — trident-brain-v4.3.3

**Version:** v4.3.3
**Generated:** 2026-06-18T18:38:16.737Z

---

## System Purpose

trident-brain-v4.3.3 is a precision engineering system built on the principle
that mechanical verification produces more reliable software than human
judgment alone. It provides:

- **Mechanical code auditing** via sequential layers
- **Mode-based workflows** with sequential layer pipelines
- **Persistent context** that survives session boundaries via artifact files
- **Identity enforcement** via SCAN+REPLACE hooks on system transform
- **Container-grade testing** with evidence collection

## Directory Structure

```
src/
  fsm/
    (5 files)
  audit-engine/
    layers/
      (18 files)
    types/
  agents/
    (1 files)
  identity/
    trident/
      explore/
        (5 files)
  modes/
    (6 files)
  evidence/
    (3 files)
  nlp/
    grammars/
      (4 files)
  warheads/
    container-testing/
      (4 files)
    seven-q-enforcement/
      rules/
        (1 files)
    common/
    ts-compiler-api/
      analyzers/
        (1 files)
    xstate-fsm/
      guards/
        (1 files)
    concurrency/
      (3 files)
    p1-p10-scanner/
      rules/
        (1 files)
    nlp-pipeline/
      (4 files)
  intent/
  tools/
    (2 files)
  shared/
    project-folder-warhead/
      (5 files)
    warheads/
      (12 files)
  hooks/
    (5 files)
  security/
    (2 files)
  tests/
    fsm/
      (3 files)
    deep/
      (1 files)
    identity/
      (1 files)
    evidence/
    nlp/
      (1 files)
    layers/
    tools/
      (1 files)
  artifacts/
    (5 files)
```

## Entry Points

- `index.ts`

## Language Distribution

| Language | File Count | Percentage |
|----------|-----------|----------|
| ts | 127 | 85% |
| md | 13 | 9% |
| json | 8 | 5% |
| py | 1 | 1% |

## Component Map

| Component | Role | Primary Interface | Dependencies |
|-----------|------|-------------------|-------------|
| Plugin Entry (`index.ts`) | Bootstrap, register hooks+tools | `default export: Plugin` | config, hooks, tools |
| Orchestrator (`orchestrator.ts`) | State machine, mode routing | `OrchestratorState` | types |
| Hook Layer (`hooks/`) | Event interception, identity | Hook functions | config, utils |
| Tool Layer (`tools/`) | Command execution | ToolDefinition[] | orchestrator, audit |
| Audit Engine (`audit-engine/`) | Code verification | `LayerEngine.run()` | types, utils |
| Artifact Gen (`artifacts/`) | Markdown generation | Generator functions | discovery, utils |
| Auto-Discover (`shared/auto-discover.ts`) | Project scanning | `discoverProject()` | fs, path |
| Config (`config.ts`) | Constants | `TRIDENT_CONFIG` | env vars |
| Utils (`utils.ts`) | Shared helpers | `tridentLog`, `writeArtifactFile` | fs, path, config |

## Data Flow

```
User Input (tool call)
     |
     v
+-----------------+
|  Tool Handler   |
|  (zod validate) |
+--------+--------+
         | validated args
         v
+-----------------+     +------------------+
|  Orchestrator   |---->|  Auto-Discover   |
|  (mode routing) |     |  (scan project)  |
+--------+--------+     +--------+---------+
         | mode + layer           | DiscoveryResult
         v                        v
+--------------------------------------+
|        Artifact Generator            |
|  (deep-planning | problem-solving     |
|   | context-synthesis | code-review)  |
+------------------+-------------------+
                   | markdown string
                   v
+-----------------+     +------------------+
|  writeArtifact  |---->|  Context Library |
|  File (to disk) |     |  (9 files)       |
+-----------------+     +------------------+
```

## Decision Records (ADR Summary)

Full details in 04_DECISIONS.md. Summary here:

| ID | Decision | Chosen | Key Rejection |
|----|----------|--------|---------------|
| ADR-1 | Bundle strategy | Single-file esbuild | Multi-file tsc output |
| ADR-2 | Identity injection | SCAN+REPLACE on transform | Static system prompt |
| ADR-3 | Pipeline execution | Sequential layers | Parallel Promise.all |
| ADR-4 | Discovery model | Unified DiscoveryResult | Per-tool scanning |
| ADR-5 | Validation behavior | Warning (not error) | Hard fail on missing |

## Runtime Specifications

| Component | Runtime | Lifecycle | Failure Mode |
|-----------|---------|-----------|-------------|
| Plugin Entry | hot | Loaded once at startup | If fails, plugin doesn't register |
| Hooks | hot | Fire on every matching event | If throws, event continues (logged) |
| Tools | warm | Fire on explicit invocation | If throws, error returned to user |
| Orchestrator | warm | Per-mode-cycle | If throws, mode aborts with error |
| Audit Engine | cold | On audit command | If throws, returns empty findings |
| Artifact Gen | cold | On mode completion | If throws, partial artifact written |

## Security and Guardrail Architecture

### Tool Firewall
The `tool.execute.before` hook acts as a firewall:
- Validates tool name against allowlist
- Checks mode state (some tools restricted per mode)
- Logs all tool invocations for evidence trail

### Identity Enforcement
The `system.transform` hook enforces identity:
- SCANs system prompt for identity block markers
- REPLACEs existing block with current identity
- PUSHes new block if none exists (first injection)
- Fires on every compaction event (identity persistence)

### Evidence Chain
The `tool.execute.after` hook records evidence:
- Captures tool name, args, result, timestamp
- Writes to tamper-evident store
- Enables post-hoc audit of all tool activity

## Warheads

| # | Warhead | Type |
|---|---------|------|
| 1 | warheads | Extension point |
| 2 | warheadDir | Extension point |
| 3 | nlpPipelineWarhead | Extension point |
| 4 | commonSenseWarhead | Extension point |
| 5 | persistenceWarhead | Extension point |
| 6 | testingWarhead | Extension point |
| 7 | tsCompilerAPIWarhead | Extension point |
| 8 | runtimeGradeWarhead | Extension point |
| 9 | focusWarhead | Extension point |
| 10 | recoveryWarhead | Extension point |
| 11 | auditStateWarhead | Extension point |
| 12 | exploreDispatchWarhead | Extension point |
| 13 | identityLayerWarhead | Extension point |
| 14 | concurrencyWarhead | Extension point |
| 15 | auditLayerProgressionWarhead | Extension point |
| 16 | distilledKnowledgeWarhead | Extension point |

## Audit Layers

| # | Layer | Purpose |
|---|-------|--------|
| 1 | r5-container-deploy | Mechanical code check |
| 2 | r14-control-flow-graph | Mechanical code check |
| 3 | r3-async-correctness | Mechanical code check |
| 4 | r16-bible-enforcement | Mechanical code check |
| 5 | r9-runtime-contract | Mechanical code check |
| 6 | r1-hook-contract | Mechanical code check |
| 7 | r0-build-chain | Mechanical code check |
| 8 | r2-state-machine | Mechanical code check |
| 9 | r8-source-hygiene | Mechanical code check |
| 10 | r10-invocation-integrity | Mechanical code check |
| 11 | r7-config-schema | Mechanical code check |
| 12 | r4-error-handling | Mechanical code check |
| 13 | r15-container-preflight | Mechanical code check |
| 14 | r11-theatrical-integrity | Mechanical code check |
| 15 | r6-dependency-integrity | Mechanical code check |
| 16 | r13-data-flow-analysis | Mechanical code check |
| 17 | r12-cross-plugin-isolation | Mechanical code check |
| 18 | r17-theatrical-integrity | Mechanical code check |

## Project Metrics

- **Total Files:** 149
- **Total Lines:** 27958
- **Avg Lines/File:** 188
- **Languages:** 4
- **Patterns:** 50
- **Failures:** 20
- **Decisions:** 0


---
*Generated by Trident v4.3.3*
