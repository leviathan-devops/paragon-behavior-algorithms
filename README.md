# PARAGON V3 — TOOL-CHAIN ALGORITHMS (PTA)

The standalone tool-execution + model-action policing boilerplate — the sibling machinery to
[Paragon V2 Behavior Algorithms (PBA)](https://github.com/leviathan-devops/paragon-behavior-algorithms/tree/main).
Together: the Paragon Enforcement OS.

**What it does:** the same intelligent enforcement machinery PBA applies to reasoning tokens,
applied to TOOL CALLS — the 4-bank lexicon → ratio classifier → λ-synapse → state machine →
tier-proportional warhead dispatch, driven by tool events instead of thinking. Enforcement
behaviors are JSON data (`layers/*.layer.json`, ~100L each, 30-minute creation) instead of
hand-coded TypeScript firewalls (2-5 days).

## THE TWO-ENGINE STACK

```
┌────────────────────────────────────────────────────────────────────┐
│                     THE PARAGON ENFORCEMENT OS                     │
│  ┌─────────────────────────┐     ┌─────────────────────────┐       │
│  │  ParagonBehaviorEngine  │     │   ParagonToolEngine     │       │
│  │      (PBA, macro)       │     │      (PTA, micro)       │       │
│  │  INPUT: reasoning       │     │  INPUT: tool events      │      │
│  │  DETECTS: 6 families    │     │  + the PBA bridge ───────┼───    │
│  │  ENFORCES:              │     │  DETECTS: N layers       │      │
│  │   messages.transform ───┼─soft│   T.E.A. ────────────────┼─soft  │
│  │   tool.execute.before ──┼─hard│   T.E.B. ────────────────┼─medium│
│  │  WATCHES: THINKING      │     │   chat.message ──────────┼─hard  │
│  └────────────────────────┘     │  WATCHES: DOING + WHY    │       │
│                                  └─────────────────────────┘       │
│  BRIDGE: one-directional PBA → PTA (disambiguation, pre-arming,    │
│  escalation correlation — the combined system reflects TOTAL       │
│  non-compliance, thinking + doing)                                 │
└────────────────────────────────────────────────────────────────────┘
```

## THE ENFORCEMENT SURFACES (the tier assignments)

| Tier | Surface | Hook | What happens | Lockout? |
|---|---|---|---|---|
| 0 | monitoring | — | the classifier runs on every call; signals accumulate | no |
| 1-2 | T.E.A. | tool.execute.after | the correction warhead appends to the tool result; the tool ran normally | no |
| 3 | T.E.B. | tool.execute.before | the tool call REFUSED (StructuredEnforcementError) — escape hatches + the demanded tool ALWAYS pass | no |
| 4 | directive | chat.message + T.E.B. gate | the [PTA GATE] behavioral directive; gates ONLY the violating layer's toolMatchers; resets on compliance; self-healing | **NO — never a lockout (R6)** |

## THE LAYER SYSTEM (the 30-minute programming surface)

```json
{
  "id": "SMOKE_TEST_GUARD",
  "description": "Block smoke tests (inline exec) as verification evidence",
  "toolMatchers": [{ "toolName": "bash", "argPatterns": { "command": ["node -e*", "bun -e*", "python3 -c*"] } }],
  "banks": { "descriptive": ["..."], "suggestive": ["..."], "substitute": ["..."], "use": ["..."] },
  "pbaContextBoost": { "families": ["TEST_EVASION"], "boostAmount": 0.2 },
  "enforcement": { "tier1": "...", "tier2": "...", "tier3": "...", "tier4": "..." },
  "threshold": 0.5, "severity": "HIGH",
  "chainRules": [{ "name": "verification-requires-container-test", "requires": [{ "tool": "trident-container-test" }] }]
}
```

```bash
bun add paragon-v3-tool-chain-algorithms
# or: cp -r the tree into your plugin + registerLayer(loadLayer("layers/my-layer.layer.json"))
bun test   # the battery
bun build index.ts --outdir dist --target bun --format esm --bundle
```

## THE 12 MICROSTRUCTURES (vendored under Paragon_Microstructures/)

| MS | What it does | Key interface |
|---|---|---|
| ms-ratio-classifier | the 4-bank opposed-pattern detection (descriptive/suggestive/substitute/use) | scoreSignals + confidence + classifyBand + batchScan (FI-1) |
| ms-synapse | the λ-decay signal accumulation per family | FamilyNeuron + V2Synapse |
| ms-intent-classifier | the 3-source intent fusion | classifyIntent → ToolIntent |
| ms-chain-tracker | the multi-tool sequence state | recordCall + evaluateRules + detectLoop |
| ms-pba-bridge | the one-directional PBA signal receiver | onPbaSignal + setReasoningState + setMacroContext |
| ms-escalation-memory | the repeat-offender pressure | computeDeadline + computeSkipTier |
| ms-state-machine | the 8-transition enforcement lattice | step() on BehaviorRecord |
| ms-warhead-dispatcher | the tier→surface delivery | resolveWarhead + dispatchTea + blockAtTeb |
| ms-evidence-gates | the 5-criteria compliance verification | evaluateCompliance → GateResult |
| ms-compliance-ledger | the append-only enforcement event log | appendLedger (O_APPEND) |
| ms-layer-loader | the JSON→runtime enforcement compiler | loadLayer + registerLayer |
| ms-persistence | the per-sid atomic state | tmp+rename, fail-closed |

## THE DOCS

| Doc | What it carries |
|---|---|
| OPERATING_MANUAL.md | the adopter guide — install, configure, the 3 surfaces, the layer system |
| NEURAL_MAP_V3.md | the complete structural bible — all 12 MS with interfaces + algorithms + data flows |
| REPLICATION_GUIDE.md | how to replicate the OS into any system |
| DEBUG_GUIDE.md | the real debug data (the F-AW failures + the PTA debug scenarios) |
| PTA_L2_SPEC.md | the PTA L2 design specification |
| docs/build/ | the build log (the canon synced per session) |

## THE PACKAGE

```bash
bun add paragon-v3-tool-chain-algorithms
```

- `core/engine.ts` — the ParagonToolEngine spine
- `Paragon_Microstructures/` — the 12 vendored microstructures
- `layers/` — the enforcement layer JSONs (the 7 firewalls + the god-loop set)
- `tests/` — the universality suite

## LICENSE / PROVENANCE

- Reverse-engineered from the Trident v4.4.2 architecture (the operator's directive, 2026-08-31)
- The PBA (the sibling engine) lives on `main` — this package is the V3 standalone
