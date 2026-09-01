# LAYERS GUIDE — The 30-Minute Layer Creation Walkthrough

> Version: 1.0.0 · 2026-08-31 · Part of Paragon V3 Tool-Chain Algorithms
> Specs: PTA_L2_SPEC.md 2.7 (layer system) · 2.12 (firewall mapping) · Master Spec 4 (SMOKE_TEST_GUARD canonical)
> Purpose: How to create a new enforcement layer in 30 minutes — what a layer is, JSON schema, 3 real examples, check, debug, modify, mistakes
> Template: layers/_template.json (every field documented inline, 80+ lines)

---

## Table of Contents

1. What a Layer Is
2. The Layer JSON Schema — Every Field
3. Example 1: SMOKE_TEST_GUARD
4. Example 2: CONFIG_LOCK
5. Example 3: WAVE_DISPATCH
6. How to Check a Layer
7. How to Debug a Layer That Is Not Firing
8. How to Modify an Existing Layer
9. Common Mistakes and How to Avoid Them
10. Quick Reference Card

---

## 1. What a Layer Is

Source: PTA_L2_SPEC.md 2.7.

A layer is a JSON file (~40-120 lines) that defines ONE enforcement behavior — what PBA calls a "family" but with its own detection banks, chain rules, and warhead bodies bundled. It replaces 200-1,700 lines of hand-coded TypeScript firewall code. Creating a new layer takes ~30 minutes vs 2-5 days for a new firewall.

Each layer watches specific tools (toolMatchers), detects violations via 4 opposed banks (banks), optionally amplifies when PBA fires matching families (pbaContextBoost), and dispatches tier-proportional corrections (enforcement tier1-4).

A layer answers three questions:

- WHICH tools does it watch? — toolMatchers (toolName + optional argPatterns)
- WHAT patterns does it detect? — banks (descriptive/suggestive/substitute/use, 4 opposed banks)
- WHAT does it say at each enforcement tier? — enforcement (tier1 correction through tier4 directive)

Plus amplification (pbaContextBoost), chain rules (chainRules), and calibration (threshold, severity).

How enforcement flows — PTA_L2_SPEC.md 2.4:

```
tool.execute.before({toolName, args, sessionId})
  For each active layer whose toolMatchers match:
    textBlob = toolName + JSON.stringify(args) + PBA excerpt (if bridge active)
    Score blob against 4 banks -> confidence = pos/(pos+neg+1)
    Check chain rules -> chainConfidence = violations ? 0.8 : 0
    Check pbaContextBoost -> pbaConfidence = sum(boostAmount), cap 1.0
    Fusion: totalConfidence = (toolConf x 0.5) + (chainConf x 0.3) + (pbaConf x 0.2)
    if totalConfidence >= threshold: ENFORCE
    elif >= threshold x 0.6: DAMPEN (accumulate in synapse)
    else: SUPPRESS (clean call)
```

Layers share: state machine (per-session, all layers same tier), escalation memory (per-session), synapse (per-family lambda), persistence (per-sid). Layer is the programming surface — JSON data, not code.

The 30-minute process:

```
Minutes 0-5:   Describe the behavior in natural language — one sentence
Minutes 5-20:  Fill the layer JSON — toolMatchers, banks, enforcement, chainRules
Minutes 20-30: Register + check — pta.registerLayer(loadLayer(path))
```

---

## 2. The Layer JSON Schema — Every Field

Source: PTA_L2_SPEC.md 2.3 (ToolChainLayer) + layers/_template.json + config/loader.ts.

Top-level fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique identifier — SCREAMING_SNAKE (e.g. SMOKE_TEST_GUARD) |
| description | string | yes | Human-readable enforcement description |
| toolMatchers | array | yes | WHICH tools this layer watches — toolName + optional argPatterns |
| banks | object | yes | WHAT patterns to detect — 4 opposed banks |
| enforcement | object | yes | WHAT to say at each tier — tier1 through tier4 warhead bodies |
| threshold | number | yes | Fire threshold (0.0-1.0, e.g. 0.9, 0.8 for high-signal) |
| severity | string | yes | LOW, MEDIUM, HIGH, or CRITICAL |
| pbaContextBoost | object | no | Which PBA families boost this layer + boostAmount |
| chainRules | array | no | Layer-local chain rules (prerequisites, forbids) |

### toolMatchers — Which Tools

```json
"toolMatchers": [
  {
    "toolName": "bash",
    "argPatterns": { "command": ["node -e*", "bun -e*", "python3 -c*"] }
  }
]
```

- toolName: exact string or regex — 'bash', 'write', /trident-.*/ (matched against toolCall.toolName)
- argPatterns: Record<string, string[]> — key = argument name, value = glob patterns. OR-matched within each argument.
- Compilation — config/loader.ts: "node -e*" -> /^node -e.*$/i, "quick test" -> /quick test/i

Multiple matchers — layer watches any tool matching ANY matcher:

```json
"toolMatchers": [
  { "toolName": "write", "argPatterns": { "filePath": ["*config*", "*.env*"] } },
  { "toolName": "edit", "argPatterns": { "filePath": ["*config*", "*.env*"] } }
]
```

No argPatterns watches ALL calls to the tool: `"toolMatchers": [{ "toolName": "task" }]`

### banks — 4 Opposed Banks

```json
"banks": {
  "descriptive": ["for the container test", "as pre-flight check"],
  "suggestive": ["just quickly check", "verify it works"],
  "substitute": ["instead of the container", "good enough for now"],
  "use": ["trident-container-test", "the sanctioned path"]
}
```

| Bank | Weight | Role | Example |
|------|--------|------|---------|
| descriptive | neg+1 | Legitimate context — suppresses detection | for the container test |
| suggestive | pos+1 (+2 word-bound) | Violation pattern | just quickly check, smoke test |
| substitute | pos+2 | Theatrical alternative | instead of the container |
| use | neg+3 SHORT-CIRCUIT | Sanctioned — stops all scoring | trident-container-test |

Algorithm: scoreSignals(text, banks) with use SHORT-CIRCUIT returning {pos:0}. confidence = pos/(pos+neg+1). ENFORCE >= 0.5, DAMPEN >= 0.3, SUPPRESS < 0.3.
Text blob: toolName + JSON.stringify(args) + PBA excerpt. FI-1: every family scores full batch, pos>0 + conf>=0.5 + pos>neg -> synthesize weight=conf x 2.

### pbaContextBoost — PBA Amplification

```json
"pbaContextBoost": {
  "families": ["TEST_EVASION", "FORGERY_INTENT"],
  "boostAmount": 0.2
}
```

- families: PBA family names that boost this layer
- boostAmount: per active family, default 0.2, capped at 1.0
- PBA families: TEST_EVASION, FORGERY_INTENT, THEATRICAL_PLANNING, SCOPE_SHRINK, DOUBT_HEDGE, PERMISSION_GATE

### enforcement — What to Say

```json
"enforcement": {
  "tier1": "DETECTED: ... YOUR TOOL CALL: {toolName} {args} WHY THIS FIRED: ... CORRECT BEHAVIOR: trident-container-test ... SELF-CHECK: ... RESET PATH: ... ({anchor})",
  "tier2": "Repeated {count} for SMOKE_TEST_GUARD. PBA {pbaFamilies} tier {pbaTier}. Next tier refuses. ({anchor})",
  "tier3": "REFUSED — SMOKE_TEST_GUARD tier 3. Count {count} PBA {pbaFamilies} ({anchor})",
  "tier4": "[PTA GATE] SMOKE_TEST_GUARD cycles {escalationCount} PBA {pbaFamilies} ({anchor})"
}
```

Delivery: tier1-2 via T.E.A. (tool still ran), tier3 via T.E.B. (throw StructuredEnforcementError), tier4 via chat.message ([PTA GATE] directive + T.E.B. gate).
Standard: 6 sections DETECTED, WHY FIRED, WHAT IT MEANS, CORRECT BEHAVIOR, SELF-CHECK, RESET PATH.
Fill fields: {count} {toolName} {args} {chainViolations} {pbaFamilies} {pbaTier} {escalationCount} {correctTool} {anchor}. Tier 4 [PTA GATE] (R12).

### threshold + severity

- threshold: 0.9 typical, 0.8 for high-signal like WAVE_DISPATCH
- severity: LOW, MEDIUM, HIGH, CRITICAL — for conflict resolution

### chainRules — Multi-Tool Sequences

```json
"chainRules": [
  {
    "name": "verification-requires-container-test",
    "description": "Verification claims require the container run to have been called",
    "requires": [{ "tool": "trident-container-test" }],
    "violation": { "layerId": "SMOKE_TEST_GUARD" }
  }
]
```

- name: unique rule name
- requires: ALL must be satisfied (AND). Each: tool, optional args, optional withinMs (default: session-start).
- forbids: ANY matched is violation.
- violation: which layer fires (layerId + optional customMessage).
- History cap: 100 calls/session.

---

## 3. Example 1: SMOKE_TEST_GUARD

Source: PBA_PTA_MASTER_L1_SPEC.md section 4 — the canonical reference + PTA_L2_SPEC.md 2.7.

Natural language: "Block smoke tests (inline exec) being used as verification evidence."

The full layer JSON:

```json
{
  "id": "SMOKE_TEST_GUARD",
  "description": "Block smoke tests (inline exec) being used as verification evidence",
  "toolMatchers": [
    {
      "toolName": "bash",
      "argPatterns": {
        "command": ["node -e*", "bun -e*", "python3 -c*", "python -c*", "echo *done*"]
      }
    }
  ],
  "banks": {
    "descriptive": [
      "for the container test",
      "as pre-flight check",
      "before running the real test",
      "per the tool result"
    ],
    "suggestive": [
      "just quickly check",
      "verify it works",
      "smoke test",
      "quick test",
      "simple check"
    ],
    "substitute": [
      "instead of the container",
      "faster than the full test",
      "good enough for now",
      "skip the full test"
    ],
    "use": [
      "per the tool result",
      "the container test passed",
      "trident-container-test",
      "the sanctioned path"
    ]
  },
  "pbaContextBoost": {
    "families": ["TEST_EVASION", "FORGERY_INTENT"],
    "boostAmount": 0.2
  },
  "enforcement": {
    "tier1": "DETECTED: Inline script execution as substitute. YOUR TOOL CALL: bash with \"{args}\" WHY THIS FIRED: Tool match + chain {chainViolations} + PBA {pbaFamilies} tier {pbaTier} WHAT THIS MEANS: Output looks like verification but is not evidence. CORRECT BEHAVIOR: trident-container-test — sanctioned pipeline, produces container-test-results.json SELF-CHECK: Am I calling trident-container-test? RESET PATH: Call trident-container-test to clear. ({anchor})",
    "tier2": "Repeated {count} for SMOKE_TEST_GUARD. PBA: {pbaFamilies} tier {pbaTier}. Next tier refuses this tool call. Reset: trident-container-test. ({anchor})",
    "tier3": "REFUSED — SMOKE_TEST_GUARD tier 3. Violations: {count} Chain: {chainViolations} PBA: {pbaFamilies} tier {pbaTier}. Call trident-container-test (excluded from enforcement, always transits). Available: read, grep, glob ({anchor})",
    "tier4": "[PTA GATE] BEHAVIORAL CORRECTION — SMOKE_TEST_GUARD cycles {escalationCount} PBA {pbaFamilies} tier {pbaTier}. Behavioral catalyst — demanded tool + hatches transit. Call trident-container-test. On compliance, both engines reset. ({anchor})"
  },
  "threshold": 0.9,
  "severity": "HIGH",
  "chainRules": [
    {
      "name": "verification-requires-container-test",
      "description": "Verification claims require the container run to have been called",
      "requires": [{ "tool": "trident-container-test" }],
      "violation": { "layerId": "SMOKE_TEST_GUARD" }
    }
  ]
}
```

Why these values:

- toolMatchers: bash with inline-exec command patterns (node -e, bun -e, python3 -c, echo done) — 5 glob patterns replacing 1280L of TypeScript
- pbaContextBoost: TEST_EVASION + FORGERY_INTENT — smoke correlates with reasoning about skipping verification
- threshold 0.9 HIGH severity — high confidence needed
- chainRules: trident-container-test must have been called

How it behaves:

```
TURN 1: PBA TEST_EVASION -> SMOKE_TEST_GUARD pre-armed (lambda 0 -> 0.2)
TURN 2: bash("bun -e 'console.log(1)'") -> fusion 0.43 < 0.9 -> ACCUMULATE lambda=0.63, tool runs
TURN 3: bash("python3 -c 'print(42)'") -> lambda=1.12 > 0.9 -> FIRE tier1 T.E.A.
TURN 4: trident-container-test -> use bank SHORT-CIRCUIT -> ALLOW, reset
```

---

## 4. Example 2: CONFIG_LOCK

Source: PTA_L2_SPEC.md 2.7 + PBA_PTA_MASTER_L1_SPEC.md section 4 mapping row 2.

Natural language: "Prevent config file writes. The model should never modify .config directly — it should use the config tool."

The full layer JSON:

```json
{
  "id": "CONFIG_LOCK",
  "description": "Prevent direct writes to protected config paths — use the config tool",
  "toolMatchers": [
    { "toolName": "write", "argPatterns": { "filePath": ["*config*", "*.env*", "*plugin*"] } },
    { "toolName": "edit", "argPatterns": { "filePath": ["*config*", "*.env*", "*plugin*"] } }
  ],
  "banks": {
    "descriptive": [
      "reading the config",
      "inspecting the plugin config",
      "checking the env file",
      "per the config tool result"
    ],
    "suggestive": [
      "just edit the config directly",
      "quickly patch the env",
      "modify the plugin config",
      "write to config"
    ],
    "substitute": [
      "faster to edit directly",
      "just patch it",
      "skip the config tool",
      "good enough to write directly"
    ],
    "use": [
      "trident-config",
      "the config tool",
      "per the config tool result",
      "the sanctioned config path"
    ]
  },
  "pbaContextBoost": {
    "families": ["PERMISSION_GATE", "SCOPE_SHRINK"],
    "boostAmount": 0.2
  },
  "enforcement": {
    "tier1": "DETECTED: Direct write to protected config path. YOUR TOOL CALL: {toolName} with filePath in {args}. WHY THIS FIRED: Tool match + chain {chainViolations} + PBA {pbaFamilies}. CORRECT BEHAVIOR: trident-config — validates + persists atomically. SELF-CHECK: Am I using trident-config? RESET PATH: Call trident-config to clear. ({anchor})",
    "tier2": "Repeated {count} for CONFIG_LOCK. PBA: {pbaFamilies} tier {pbaTier}. Next tier refuses write/edit for config paths. Reset: trident-config. ({anchor})",
    "tier3": "REFUSED — CONFIG_LOCK tier 3. Protected path write blocked. Violations: {count} PBA: {pbaFamilies}. Call trident-config (excluded, always transits). Available: read, grep, glob ({anchor})",
    "tier4": "[PTA GATE] BEHAVIORAL CORRECTION — CONFIG_LOCK cycles {escalationCount} PBA {pbaFamilies} tier {pbaTier}. Behavioral catalyst — trident-config + hatches transit. Call trident-config. On compliance, both engines reset. ({anchor})"
  },
  "threshold": 0.9,
  "severity": "CRITICAL",
  "chainRules": [
    {
      "name": "config-requires-tool",
      "description": "Config file modifications require the config tool to have been called",
      "requires": [{ "tool": "trident-config" }],
      "violation": { "layerId": "CONFIG_LOCK" }
    }
  ]
}
```

Why these values:

- toolMatchers: write + edit to protected paths (*config*, *.env*, *plugin*)
- severity CRITICAL — config corruption is unrecoverable (vs HIGH for smoke)
- pbaContextBoost: PERMISSION_GATE + SCOPE_SHRINK
- Replaces ct-anti-derailment.ts:848L (CTX-01..14) with ~80L JSON

How it behaves:

```
write(filePath: ".config/opencode/.env") -> suggestive + chain (no trident-config) -> T.E.A. tier1
write(filePath: "src/component.ts") -> no toolMatcher match -> no scoring -> transit
read(filePath: ".config/opencode/.env") -> no toolMatcher match (write/edit only) -> transit
trident-config -> use bank SHORT-CIRCUIT -> ALLOW
```

---

## 5. Example 3: WAVE_DISPATCH

Source: PTA_L2_SPEC.md 2.13 (god loop DISPATCH phase layer) + PBA_PTA_MASTER_L1_SPEC.md section 6.

Natural language: "During DISPATCH phase, tools must be dispatched via wave-manager batch, not individually."

The full layer JSON:

```json
{
  "id": "WAVE_DISPATCH",
  "description": "During DISPATCH: tools must be dispatched via wave-manager batch, not individually",
  "toolMatchers": [
    { "toolName": "task" }
  ],
  "banks": {
    "descriptive": [
      "dispatching wave",
      "parallel task",
      "batch dispatch"
    ],
    "suggestive": [
      "single task",
      "one at a time",
      "sequential dispatch"
    ],
    "substitute": [
      "simpler to dispatch individually",
      "just one agent needed"
    ],
    "use": [
      "trident-wave-manager",
      "batch dispatch",
      "parallel wave"
    ]
  },
  "pbaContextBoost": {
    "families": ["PERMISSION_GATE", "SCOPE_SHRINK"],
    "boostAmount": 0.2
  },
  "enforcement": {
    "tier1": "Single task dispatch detected. Use trident-wave-manager for batch dispatch — sequential costs 5x wall-clock. Chain: {chainViolations} PBA: {pbaFamilies} ({anchor})",
    "tier2": "Dispatched {count} individual tasks instead of wave manager. The batch form is the demanded path. ({anchor})",
    "tier3": "Individual task dispatch blocked during DISPATCH phase. Use trident-wave-manager. ({anchor})",
    "tier4": "[PTA GATE] DISPATCH VIOLATION — {escalationCount} escalations. PBA: {pbaFamilies} tier {pbaTier}. STOP individual dispatches. Use trident-wave-manager batch form. ({anchor})"
  },
  "threshold": 0.8,
  "severity": "HIGH",
  "chainRules": [
    {
      "name": "dispatch-requires-wave-manager",
      "description": "task calls require wave-manager generate to have been called first",
      "requires": [{ "tool": "trident-wave-manager" }],
      "violation": { "layerId": "WAVE_DISPATCH" }
    }
  ]
}
```

Why these values:

- toolMatchers: task with no argPatterns — watches ALL task calls
- threshold 0.8 (lower than 0.9) — dispatch violations are high-signal
- pbaContextBoost: PERMISSION_GATE + SCOPE_SHRINK
- chainRules: wave-manager generate must have been called first
- Activation: enterPhase('DISPATCH') activates this layer

How it behaves:

```
God loop enters DISPATCH -> enterPhase("DISPATCH") -> WAVE_DISPATCH active
task(description="fix bug") -> suggestive + chain(trident-wave-manager not called) -> T.E.A. tier1
trident-wave-manager -> use bank -> ALLOW, chain satisfied
Next task() calls -> chain satisfied -> lower confidence
God loop enters COLLECT -> WAVE_DISPATCH deactivated
```

---

## 6. How to Check a Layer

Use classifyIntent and related utilities to evaluate layer behavior. Create scenarios for both the violation case and the legitimate case to verify the layer distinguishes correctly. The violation scenario uses the triggering tool with chain violations and PBA context active. The legitimate scenario uses a benign tool call with no chain violations.

Also verify: layer loads without LOADER_VALIDATION_FAILED, pbaContextBoost families match real PBA families, chainRules violation.layerId matches layer id, enforcement texts contain fill fields, threshold calibrated.

---

## 7. How to Debug a Layer That Is Not Firing

Diagnosis checklist:

1. Registered? — pta.layers.map(l => l.id) — does your layer ID appear?

2. Tool matcher matches? — Evaluate toolName + argPatterns regex against actual tool call.

3. Banks score correctly? — scoreSignals(textBlob, layer.banks) -> {pos, neg, confidence}:
   textBlob = toolName + JSON.stringify(args) + PBA excerpt (if bridge)
   confidence = pos / (pos + neg + 1) — ENFORCE >= 0.5, DAMPEN >= 0.3, SUPPRESS < 0.3

4. Use-bank short-circuit? — If tool call text matches any use pattern: SHORT-CIRCUIT return {pos:0}. Always SUPPRESS. Most common cause.

5. Descriptive suppression? — Check descriptive bank: neg may be suppressing below threshold.

6. Threshold too high? — Compare totalConfidence vs layer.threshold. totalConfidence = (toolConf x 0.5) + (chainConf x 0.3) + (pbaConf x 0.2).

7. Bridge wired? — pta.pbaBridge.getActiveFamilies(sid) — is the PBA family in pbaContextBoost.families active?

8. Chain rule window? — chainTracker.wasCalled(sid, req.tool, req.withinMs) — was prerequisite recorded?

Most common: use bank overlap, overly broad descriptive, threshold too high.

---

## 8. How to Modify an Existing Layer

Edit + re-register:

```typescript
// 1. Edit the JSON file — change banks, threshold, enforcement, etc.
// 2. Reload and re-register
import { loadLayer } from 'paragon-v3-tool-chain-algorithms/config';
pta.deactivateLayer('MY_LAYER');
const updated = loadLayer('layers/my-layer.layer.json');
pta.registerLayer(updated);       // new version live
```

What can be changed without restart: banks, enforcement (tier1-4), threshold, severity, chainRules, pbaContextBoost.

What requires care: id change (deactivate old, register new — synapse per-id), toolMatchers change (narrow/broad), removing a layer (deactivateLayer).

Modify pattern — Narrowing:

```json
// Before: watches all bash
{ "toolName": "bash" }
// After: watches only bash with inline-exec commands
{ "toolName": "bash", "argPatterns": { "command": ["node -e*", "bun -e*"] } }
```

Modify pattern — Adjusting sensitivity:

```json
// Before: rarely fires (threshold too high)
"threshold": 0.9,
// After: more sensitive
"threshold": 0.8,
```

---

## 9. Common Mistakes and How to Avoid Them

| # | Mistake | Symptom | Fix |
|---|---------|---------|-----|
| 1 | Forgetting use bank | Legitimate calls fire violations | Always populate use with sanctioned pattern |
| 2 | Overly broad toolMatchers | Layer fires on unrelated tools | Narrow with argPatterns |
| 3 | Missing chainRules | Prerequisite violations not detected | Add chainRules requires |
| 4 | Wrong threshold | Never fires or fires on noise | 0.9 default, 0.8 for high-signal |
| 5 | Hardcoded enforcement messages | Not tier-proportional, no fill fields | Use tier1-4 with fill fields |
| 6 | Wrong pbaContextBoost families | PBA context never amplifies | Check family names: TEST_EVASION, FORGERY_INTENT, etc. |
| 7 | Duplicate layer IDs | Second overwrites first | Each needs unique SCREAMING_SNAKE id |
| 8 | Overlapping bank vocabulary | FI-1 cross-layer contamination | Keep suggestive banks domain-specific |
| 9 | Short withinMs on chain rules | Prerequisite called but expired | Default (no withinMs) = session-start. Avoid short windows (AP-5) |
| 10 | Not handling use-bank short-circuit | Legitimate calls always suppressed | use bank neg+3 SHORT-CIRCUIT — sanctioned always SUPPRESS |

---

## 10. Quick Reference Card

The 30-Minute Process:

```
Minutes 0-5:   Describe behavior in natural language — one sentence
Minutes 5-20:  Fill layer JSON — toolMatchers, banks, enforcement, pbaContextBoost, chainRules, threshold, severity
Minutes 20-30: Register + check — pta.registerLayer(loadLayer(path))
```

Layer JSON skeleton:

```json
{
  "id": "MY_LAYER",
  "description": "What this enforces — one sentence",
  "toolMatchers": [{ "toolName": "myTool", "argPatterns": { "myArg": ["pattern*"] } }],
  "banks": { "descriptive": ["..."], "suggestive": ["..."], "substitute": ["..."], "use": ["..."] },
  "pbaContextBoost": { "families": ["TEST_EVASION"], "boostAmount": 0.2 },
  "enforcement": { "tier1": "...{count}...{anchor}", "tier2": "...", "tier3": "...", "tier4": "[PTA GATE] ...{escalationCount}..." },
  "threshold": 0.9,
  "severity": "HIGH",
  "chainRules": [{ "name": "requires-x", "requires": [{ "tool": "x" }], "violation": { "layerId": "MY_LAYER" } }]
}
```

Bank quick reference:

| Bank | Weight | When to Add |
|------|--------|-------------|
| descriptive | neg+1 | Legitimate context that should suppress enforcement |
| suggestive | pos+1/+2 | The violation pattern — what the model does wrong |
| substitute | pos+2 | Theatrical alternatives / excuses for the violation |
| use | neg+3 SHORT-CIRCUIT | The sanctioned correct tool/pattern — always suppresses |

File locations:

| File | Purpose |
|------|---------|
| layers/_template.json | Fully documented template — copy this to create a new layer |
| layers/_guide.md | This file — the 30-minute walkthrough |
| layers/<name>.layer.json | Your layer — one enforcement behavior as JSON data |
| OPERATING_MANUAL.md | Full adopter guide |
| NEURAL_MAP_V3.md | Complete system map — all 12 MS |

---

*End of layers/_guide.md — Paragon V3 Tool-Chain Algorithms v1.0.0*
*Sources: PTA_L2_SPEC.md 2.7 (layer system) · 2.12 (firewall mapping) · Master Spec 4 · layers/_template.json*

