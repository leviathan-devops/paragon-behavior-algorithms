# PTA OPERATING MANUAL — Paragon V3 Tool-Chain Algorithms

> Version: 1.0.0 · 2026-08-31 · Status: ACTIVE
> Package: paragon-v3-tool-chain-algorithms
> Predecessor: paragon-v2-behavior-algorithms (PBA / STTGF v2)
> Specs: PTA_L2_SPEC.md 2.1-2.13 (2,441L) · PBA_PTA_MASTER_L1_SPEC.md 0-9 (1,410L) · index.ts (18L) · package.json (25L)

---

## Table of Contents

1. What PTA Is (§1)
2. Two-Engine Architecture (§2)
3. Installation (§3)
4. Configuration — ToolChainModule (§4)
5. The 3 Enforcement Surfaces (§5)
6. The Layer System (§6)
7. 30-Minute Walkthrough — 3 Real Examples (§7)
8. The PBA Bridge — 3 Mechanisms (§8)
9. The 4-Tier Escalation Ladder (§9)
10. Scenario Rolodex — What to Expect S-01..S-18 (§10)
11. Troubleshooting (§11)
12. API Reference (§12)

---

## 1. What PTA Is

PTA — Paragon V3 Tool-Chain Algorithms — is the micro engine of the Paragon Enforcement OS. It polices tool execution and model actions: what the model is DOING and WHY. PBA (Paragon V2) polices reasoning tokens: what the model is THINKING. Together they form the Paragon Enforcement OS.

Source: PTA_L2_SPEC.md §0 + PBA_PTA_MASTER_L1_SPEC.md §0.

**The fundamental problem** — PTA_L2_SPEC.md §0: PBA polices reasoning via 3 capture planes, 6 behavioral families, λ-synapse, 8-transition state machine, tier-proportional warheads. The tool firewalls (7 hand-coded systems, ~3,800L total) are dumb static pattern-matchers — no intent classification, no reasoning awareness, no shared state, no proportional escalation. Building a new one takes 2-5 days.

PTA applies the SAME intelligent machinery PBA proved (4-bank lexicon → ratio classifier → λ-synapse → state machine → warhead dispatch + per-sid persistence + evidence ledger) to the tool execution substrate. New layers are JSON data — 30 minutes vs 2-5 days (86% reduction: ~3,800L → ~520L).

| Engine | Substrate | Input | Detects | Enforces via | Watches |
|--------|-----------|-------|---------|--------------|---------|
| PBA (macro) | Reasoning tokens | reasoning, text-think, tool-cadence | 6 families (TEST_EVASION, etc.) | messages.transform (soft) + tool.execute.before (hard) | "what are you THINKING?" |
| PTA (micro) | Tool execution | tool.call.started, tool.call.completed, tool.execute.before + bridge | N tool-chain families | tool.execute.after (soft) + tool.execute.before (medium) + chat.message (hard) | "what are you DOING and WHY?" |

What PTA replaces — PTA_L2_SPEC.md §2.12:

| # | Old Firewall | File | Old LOC | New Layer ID | Watches |
|---|-------------|------|---------|-------------|---------|
| 1 | SSTF | semantic-smoke-firewall.ts | ~1,780L | SMOKE_TEST_GUARD | bash inline-exec (node -e, bun -e) |
| 2 | Config Lock | ct-anti-derailment.ts (CTX-01..14) | 848L | CONFIG_LOCK | write/edit to protected paths |
| 3 | Trident Tool Block | poseidon-state.ts:221-231 | ~50L | TOOL_PERMISSION | trident-poseidon from leaf nodes |
| 4 | Poseidon Permissions | poseidon-enforcer-hook.ts | 434L | PHASE_ENFORCEMENT | tools not matching phase |
| 5 | Hash-as-Proof | sttgf-contract.ts | ~200L | HASH_AS_PROOF | bash hash-verb shapes |
| 6 | Container Substitution | within SSTF | ~200L | CONTAINER_SUBSTITUTION | bun test / docker run |
| 7 | Ship Gate | trident-hooks.ts | ~300L | SHIP_EVIDENCE_GATE | ship without evidence |

Key principle — R6 (master spec §0): "NOTHING should kill the agent loop or brick normal execution — the point is to CHANGE BEHAVIOR." No tier locks the agent. Demanded tools + escape hatches (read, grep, glob) transit at every tier.

Failure inventory — PTA_L2_SPEC.md §1:

- F-1 SSTF (CRITICAL): regex tower, no intent, DISABLED 2026-08-15 at line 465-471, intelligence ceiling — 4-bank classifier solves it
- F-2 Config Lock (HIGH): static path+verb, no PBA awareness, binary block/allow
- F-3 Tool Block (MEDIUM): no phase awareness, two overlapping systems
- F-4 Hash-as-Proof (MEDIUM): command-shape only, fires on legitimate hash usage
- F-5 Container Substitution (MEDIUM): single-tool check, no chain awareness
- F-6 Ship Gate (HIGH): evidence polling at ship time (late), not during build
- F-7 Poseidon Permissions (HIGH): mini-PTA hand-coded (434L), no PBA signals, hardcoded warheads

Shared defects: no intent classification, no reasoning awareness, no shared state, no proportional escalation. PTA solves all 4.

---

## 2. Two-Engine Architecture

### The Two-Engine Diagram

Source: PTA_L2_SPEC.md Pre-Context (verbatim) + PBA_PTA_MASTER_L1_SPEC.md §1 — operator-approved.

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                     THE PARAGON ENFORCEMENT OS                      │
 │                                                                     │
 │  ┌─────────────────────────┐     ┌─────────────────────────┐        │
 │  │  ParagonBehaviorEngine  │     │   ParagonToolEngine     │        │
 │  │      (PBA, macro)       │     │      (PTA, micro)       │        │
 │  │                         │     │                          │       │
 │  │  INPUT:                 │     │  INPUT:                  │       │
 │  │  reasoning tokens       │     │  tool.call.started       │       │
 │  │  text-think plane       │     │  tool.call.completed     │       │
 │  │  tool-cadence plane     │     │  tool.execute.before     │       │
 │  │                         │     │  + PBA signal stream ───┼──────  │
 │  │  DETECTS:               │     │  (the bridge)            │ flow  │
 │  │  6 behavioral families  │     │                          │ thru  │
 │  │                         │     │  DETECTS:               │        │
 │  │  ENFORCES:              │     │  N tool-chain families   │       │
 │  │  messages.transform ────┼─soft│  (intent+chain+result)   │       │
 │  │  tool.execute.before ───┼─hard│                          │       │
 │  │                         │     │  ENFORCES:              │        │
 │  │  WATCHES:               │     │  T.E.A. ────────────────┼─soft   │
 │  │  "what are you          │     │  T.E.B. ────────────────┼─medium │
 │  │   THINKING?"            │     │  chat.message ──────────┼─hard   │
 │  │                         │     │                          │       │
 │  └─────────────────────────┘     │  WATCHES:               │        │
 │                                   │  "what are you DOING    │       │
 │                                   │   and WHY?"             │        │
 │                                   └─────────────────────────┘       │
 │                                                                     │
 │  ┌─────────────────────────────────────────────────────────────┐    │
 │  │  SHARED MACHINERY (identical for both)                      │    │
 │  │  4-bank lexicon → ratio classifier → λ-synapse → state      │    │
 │  │  machine → tier-proportional warhead dispatch + per-sid     │    │
 │  │  persistence + evidence ledger + escalation memory           │    │
 │  └─────────────────────────────────────────────────────────────┘    │
 │                                                                     │
 │  ┌─────────────────────────────────────────────────────────────┐    │
 │  │  THE BRIDGE (one-directional: PBA → PTA)                     │    │
 │  │  PBA.onSignal() → PTA.pbaBridge.onPbaSignal()               │    │
 │  │  PBA.onStateChange() → PTA.pbaBridge.onPbaStateChange()     │    │
 │  └─────────────────────────────────────────────────────────────┘    │
 └─────────────────────────────────────────────────────────────────────┘
```

The Two-Engine Architecture places PBA (macro, reasoning) and PTA (micro, tool execution) as sibling engines sharing identical machinery (4-bank lexicon, ratio classifier, λ-synapse, state machine, warhead dispatch, per-sid persistence, evidence ledger, escalation memory) but watching different substrates. The bridge flows one way: PBA.onSignal → PTA.pbaBridge.onPbaSignal and PBA.onStateChange → PTA.pbaBridge.onPbaStateChange (PBA_L2_SPEC.md Pre-Context lines 52-57). PTA receives PBA reasoning context as input to its intent classifier — "PTA should have PTA's data capture as part of its input stream" (R5).

### Wiring — PBA_PTA_MASTER_L1_SPEC.md §1:122-152

```typescript
import { ParagonBehaviorEngine } from 'paragon-v2-behavior-algorithms';
import { ParagonToolEngine } from 'paragon-v3-tool-chain-algorithms';
const pba = new ParagonBehaviorEngine(pbaDomain);
const pta = new ParagonToolEngine(ptaModule);
pba.onSignal((signal) => {
  pta.pbaBridge.onPbaSignal({
    family: signal.family, confidence: signal.confidence,
    excerpt: signal.excerpt, seq: signal.seq, sessionId: signal.sessionId,
  });
});
pba.onStateChange((state) => {
  pta.pbaBridge.onPbaStateChange({
    tier: state.tier, escalationCount: state.escalationCount,
    activeFamilies: state.activeFamilies, lastWarheadBody: state.lastWarheadBody,
  });
});
// Both engines run independently and async. PTA doesn't wait for PBA.
// If bridge disabled, PTA works standalone with lower accuracy.
```

### Shared vs Unique Machinery — PTA_L2_SPEC.md §2.1

Shared (identical, adapted for tool events):

| Machinery | PBA | PTA | Identical? |
|-----------|-----|-----|-----------|
| 4-bank lexicon | PatternFamilyMember | ToolChainLayer.banks | Same opposed-bank, same weights neg+1/pos+1+2/pos+2/neg+3 |
| Ratio classifier | pos/(pos+neg+1) | Same formula, same bands ENFORCE>=0.5 DAMPEN>=0.3 SUPPRESS<0.3 | YES |
| FI-1 batch scan | Every member scores full batch | Same on tool results | YES |
| λ-synapse | decay 0.05, refractory 25, per-family thresholds | Same decay, same threshold structure | YES |
| State machine | 8 transitions, tier 0-4, rearm first | Same lattice, tool-event driven | YES |
| Escalation memory | 5/2/0, skip-tier ≥2→t2 ≥3→t3, genuine/minimum | Same | YES |
| Warhead dispatch | Tier-proportional, {count,excerpt,instrument,anchor} | Same, {count,toolName,args,chain,pbaFamilies,anchor} | Same fills differ |
| Per-sid persistence | machine-state-<sid>.json, atomic tmp+rename | pta-state-<sid>.json, same atomic | YES |
| Evidence ledger | interventions.jsonl O_APPEND | pta-ledger.jsonl O_APPEND | YES |

PTA-unique additions:

| Addition | File | What | Why PBA doesn't have it |
|----------|------|------|------------------------|
| Intent Classifier | core/intent-classifier.ts (~200L) | 3-source intent fusion (tool+chain+PBA) | Reasoning tokens ARE intent |
| Chain Tracker | core/chain-tracker.ts (~180L) | Multi-tool sequence, loop detection | No chain of reasoning tokens |
| PBA Bridge | core/pba-bridge.ts (~150L) | Receives PBA signals, ring buffer, pre-arming | One-directional by design |
| Layer System | layers/ + config/loader.ts (~150L) | JSON-defined enforcement, 30-min | PBA families are TypeScript-defined |
| T.E.A. | tool.execute.after | Correction in tool result (tool ran) | PBA soft is messages.transform |
| T.E.B. | tool.execute.before | Refusal before execution | PBA hard is also t.e.b. but PTA uses at tier3+gate |
| chat.message | chat.message | [PTA GATE] directive + T.E.B. gate | PBA has no equivalent — one level heavier |

Enforcement weight: PBA soft (messages.transform, ignorable) < PTA soft (T.E.A., ignorable) < PBA hard (t.e.b. throw) < PTA hard (chat.message, heaviest — model MUST respond). 95%+ enforcement at T.E.A.

### The Fractally Integrated Principle — PBA_PTA_MASTER_L1_SPEC.md §1 R7

"COMPLIMENTARY FRACTALLY INTEGRATED SEPARATE ENFORCEMENT LAYERS ATTACKING DIFFERENT ANGLES OF THE SAME BEHAVIOR."

PBA corrects thinking ("stop THINKING about skipping"), PTA corrects doing ("stop USING bash as substitute") — same behavior, different angles, simultaneously. Both visible, both reset on compliance.

---

## 3. Installation

### Prerequisites

- Runtime: bun (R9: "we are using bun for everything")
- TypeScript 5.5+ (devDependencies in package.json:21-24: typescript ^5.5.0, @types/bun ^1.1.0)
- Sibling (optional): paragon-v2-behavior-algorithms (PBA) for bridge wiring

### Install

```bash
bun add paragon-v3-tool-chain-algorithms
bun add /path/to/Paragon_V3_Tool-Chain_Algorithms
bun run typecheck
bun run build
```

### Package Shape — package.json:1-25

```json
{
  "name": "paragon-v3-tool-chain-algorithms",
  "version": "1.0.0",
  "type": "module",
  "main": "index.ts",
  "exports": {
    ".": "./index.ts",
    "./core": "./core/index.ts",
    "./capture": "./capture/index.ts",
    "./actuation": "./actuation/index.ts",
    "./config": "./config/index.ts",
    "./hooks": "./hooks/index.ts"
  }
}
```

Scripts — package.json:16-20:

| Script | Command | Purpose |
|--------|---------|---------|
| typecheck | tsc --noEmit | Type check |
| test | bun test | Suite |
| build | bun build index.ts --outdir dist --target bun --format esm | ESM bundle |

### Directory Layout — PTA_L2_SPEC.md §2.2

```
Paragon_V3_Tool-Chain_Algorithms/
├── core/                        THE MACHINERY (fixed — never edited by adopters)
│   ├── engine.ts                PTA spine — tool-event driven (~475L)
│   ├── types.ts                 ALL type definitions (~265L)
│   ├── intent-classifier.ts     ★ 3-source intent classification (~200L)
│   ├── chain-tracker.ts         ★ Multi-tool sequence state (~180L)
│   ├── synapse.ts               λ-decay accumulation (~100L)
│   ├── machine.ts               8-transition state lattice (~220L)
│   ├── gate-engine.ts           Evidence gates (~120L)
│   ├── collector.ts             Compliance collection (~110L)
│   └── pba-bridge.ts            ★ PBA signal stream (~150L)
├── actuation/
│   ├── warhead-templates.ts     PTA adaptive templates (~220L)
│   └── dispatch.ts              T.E.A./T.E.B./chat.message dispatch (~160L)
├── capture/
│   └── tool-event-router.ts     Routes tool events → engine (~100L)
├── layers/                      ★ THE PROGRAMMING SURFACE
│   ├── _template.json           Creation template (all fields documented)
│   ├── _guide.md                30-minute walkthrough
│   └── <name>.layer.json        Each enforcement behavior as data
├── hooks/
│   ├── platform-adapter.ts      PlatformAdapter interface (~60L)
│   ├── opencode-adapter.ts      Wraps opencode hooks + chat.message (~180L)
│   └── mock.ts                  MockAdapter for harness (~80L)
├── config/
│   └── loader.ts                JSON → runtime compilation (~150L)
├── tests/
│   └── universality.test.ts     Per-layer dispatch (~100L)
├── index.ts                     Public re-exports (18 lines, 15 named exports)
├── package.json
├── tsconfig.json
├── OPERATING_MANUAL.md          ← you are here (500+ lines)
├── NEURAL_MAP_V3.md             (800+ lines)
├── REPLICATION_GUIDE.md         (300+ lines)
├── DEBUG_GUIDE.md               (200+ lines)
└── PTA_L2_SPEC.md              Design authority (2,441 lines)
```

Total: ~2,500L core machinery + layers as JSON data. ★ = PTA-unique.

---

## 4. Configuration — ToolChainModule

### The Adopter Interface — PTA_L2_SPEC.md §2.3

The ONLY interface an adopter implements. Mirrors PBA's DomainModule. Engine constructed: new ParagonToolEngine(module: ToolChainModule). Everything else automatic.

```typescript
import { ParagonToolEngine } from 'paragon-v3-tool-chain-algorithms';
import type { ToolChainModule } from 'paragon-v3-tool-chain-algorithms';

const module: ToolChainModule = {
  name: 'trident-toolchain',
  brandPrefix: 'PTA',
  layers: [
    // ToolChainLayer[] — each is one enforcement behavior
  ],
  chainRules: [
    // ChainRule[] — global multi-tool sequence rules
  ],
  compliance: {
    escapeHatches: ['read', 'grep', 'glob'],
    remediationTools: ['trident-code-audit', 'trident-container-test'],
    verificationPatterns: [/container-test-results\.json/, /TRIDENT_CODE_REVIEW/],
  },
  pbaBridge: {
    enabled: true,
    signalFilter: ['TEST_EVASION', 'FORGERY_INTENT'],
    contextWindowSize: 20,
    confidenceBoost: 0.2,
  },
};
const pta = new ParagonToolEngine(module);
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Domain id (trident-toolchain). Used in persistence file names, ledger entries. |
| brandPrefix | string | yes | Warhead tag prefix (PTA -> [PTA ENFORCER]). |
| layers | ToolChainLayer[] | yes | Enforcement layers. Loaded from JSON via config/loader.ts. |
| chainRules | ChainRule[] | no | Global chain rules evaluated on every tool call. Layer-local chainRules also supported. |
| compliance.escapeHatches | string[] | yes | Tools that transit at any tier. Default: read,grep,glob. |
| compliance.remediationTools | string[] | yes | Demanded tools — excluded from enforcement. Trigger COMPLIANCE_VERIFIED. |
| compliance.verificationPatterns | RegExp[] | yes | Output patterns for genuine vs minimum. |
| pbaBridge.enabled | boolean | no | Receive PBA signals. Default false — standalone works, boost not requirement (AP-3). |
| pbaBridge.signalFilter | string[] | no | Which PBA families. undefined = all. |
| pbaBridge.contextWindowSize | number | no | Ring buffer size. Default 20. |
| pbaBridge.confidenceBoost | number | no | Boost per family. Default 0.2, cap 1.0. See §8. |

### Minimal Standalone — AP-3

PTA works without PBA. Tool match + chain alone provide classification, lower accuracy for ambiguous calls but chain violations still fire:

```typescript
const standalone: ToolChainModule = {
  name: 'standalone-enforcement',
  brandPrefix: 'PTA',
  layers: [smokeSubstitutionLayer],
  chainRules: [],
  compliance: {
    escapeHatches: ['read', 'grep', 'glob'],
    remediationTools: ['trident-container-test'],
    verificationPatterns: [/container-test-results\.json/],
  },
  pbaBridge: { enabled: false },
};
```

### Loading Layers — PTA_L2_SPEC.md §2.7, config/loader.ts

```typescript
import { loadLayer } from 'paragon-v3-tool-chain-algorithms/config';
import { ParagonToolEngine } from 'paragon-v3-tool-chain-algorithms';
const pta = new ParagonToolEngine(module);
const layer = loadLayer('layers/sstf-smoke-substitution.layer.json');
pta.registerLayer(layer);
// Layer is now live — matching tool calls go through intent classifier
import { readdirSync } from 'fs';
for (const file of readdirSync('layers').filter(f => f.endsWith('.layer.json'))) {
  pta.registerLayer(loadLayer(`layers/${file}`));
}
```

---

## 5. The 3 Enforcement Surfaces

Source: PTA_L2_SPEC.md §2.6 + PBA_PTA_MASTER_L1_SPEC.md §3.

> Critical invariant: tool.execute.before (T.E.B. check surface) runs intent classifier on EVERY tool call at EVERY tier. Tier determines delivery surface, not whether checking happens. No "starts checking at tier 2."

### Surface Overview — Enforcement Weight

```
 PBA soft:  messages.transform  -> advisory in model context (ignorable)
 PTA soft:  T.E.A. (tool.execute.after)  -> advisory in tool result (tool still ran)
 PBA hard:  tool.execute.before -> THROW (tool blocked)
 PTA hard:  chat.message        -> actual chat message (model MUST respond — heaviest)
 95%+ enforcement at T.E.A.  T.E.B. tier 3  chat.message tier 4 rare
```

| Tier | Surface | Hook | What Happens | Tool Ran? | Lockout? |
|------|---------|------|-------------|-----------|----------|
| 0 | — | — | Monitoring. Intent classifier runs, synapse accumulates. No enforcement. | Yes | No |
| 1 | T.E.A. | tool.execute.after | Correction appended to tool output. | Yes (100%) | No |
| 2 | T.E.A. | tool.execute.after | Escalated correction (count, deadline, chain, PBA). | Yes (100%) | No |
| 3 | T.E.B. | tool.execute.before | Refused — StructuredEnforcementError. Demanded+hatches transit. | No | No |
| 4 | chat.message + T.E.B. gate | chat.message + tool.execute.before | [PTA GATE] directive. Only demanded + hatches transit until compliance. Self-healing. | Demanded: yes | No |

### T.E.A. — Correction Delivery (Tiers 1-2) — PTA_L2_SPEC.md §2.6, actuation/dispatch.ts

Tool runs normally. After it completes, correction appended via tool.execute.after:

```typescript
function deliverCorrectionViaTea(layer: ToolChainLayer, tier: number, context: ToolIntent, toolOutput: string): string {
  const body = fillTemplate(layer.enforcement[`tier${tier}`], {
    count: getDispatchCount(layer.id),
    toolName: context.sources.toolMatch.toolName,
    args: JSON.stringify(context.sources.toolMatch),
    chainViolations: context.sources.chainContext.chainViolations.join(', '),
    pbaFamilies: context.sources.pbaContext.activeFamilies.join(', '),
    anchor: `pta:${layer.id}:${Date.now()}`,
  });
  return toolOutput + `\n\n${body}`;
}
```

Model sees at tier 1 — bash("bun -e 'console.log(1)'"):

```
$ bun -e 'console.log(1)'
1
[PTA] SMOKE_SUBSTITUTION — Tier 1
DETECTED: Inline script execution used as verification substitute.
YOUR TOOL CALL: bash with command "bun -e 'console.log(1)'"
WHY THIS FIRED: Tool match (conf 0.43) + Chain: trident-container-test never called + PBA: TEST_EVASION tier 1
WHAT THIS MEANS: Output looks like verification but is not evidence.
CORRECT BEHAVIOR: trident-container-test — sanctioned pipeline, produces container-test-results.json
SELF-CHECK: Am I calling trident-container-test? Will next call produce output matching verificationPatterns?
(pta:SMOKE_SUBSTITUTION:1693487400000)
```

### T.E.B. — Refusal (Tier 3) — PTA_L2_SPEC.md §2.6

Tool call refused BEFORE execution. StructuredEnforcementError:

```typescript
function blockAtTeb(layer: ToolChainLayer, context: ToolIntent): never {
  const body = fillTemplate(layer.enforcement.tier3, {
    count: getDispatchCount(layer.id),
    toolName: context.sources.toolMatch.toolName,
    chainViolations: context.sources.chainContext.chainViolations.join(', '),
    pbaFamilies: context.sources.pbaContext.activeFamilies.join(', '),
    pbaTier: context.sources.pbaContext.macroTier,
  });
  throw new StructuredEnforcementError({ machine: 'pta', detected: `${layer.id} at tier 3`, correction: body, evidenceRequired: true, tier: 3 });
}
```

Escape hatches + remediationTools excluded — transit even at tier 3.

### chat.message — Directive + Gate (Tier 4) — PTA_L2_SPEC.md §2.6, R12

Carries [PTA GATE] prefix.

```typescript
function dispatchDirective(layer: ToolChainLayer, context: ToolIntent, adapter: PlatformAdapter): void {
  const body = fillTemplate(layer.enforcement.tier4, {
    count: getDispatchCount(layer.id),
    escalationCount: getEscalationCount(),
    pbaFamilies: context.sources.pbaContext.activeFamilies.join(', '),
    pbaTier: context.sources.pbaContext.macroTier,
  });
  adapter.inject({ type: 'chat.message', content: `[PTA GATE] ${body}`, sessionId: getSessionId() });
}
```

T.E.B. gates: only demanded + escape hatches transit until COMPLIANCE_VERIFIED -> all unblock -> reset. Not a lockout (R6, AP-8): tools not matching violating layer's toolMatchers continue normally.

---

## 6. The Layer System

### What a Layer Is — PTA_L2_SPEC.md §2.7

A layer is a JSON file (~40-120 lines) defining ONE enforcement behavior — what PBA calls a family but with detection banks, chain rules, warhead bodies bundled. Replaces 200-1,700L TypeScript firewall code. ~30 minutes vs 2-5 days.

Each layer watches tools (toolMatchers), detects via 4 opposed banks (banks), amplifies via PBA (pbaContextBoost), dispatches corrections (enforcement tier1-4).

### Layer JSON Schema — PTA_L2_SPEC.md §2.3

```typescript
interface ToolChainLayer {
  id: string;
  description: string;
  toolMatchers: { toolName: string | RegExp; argPatterns?: Record<string, (string | RegExp)[]>; }[];
  banks: { descriptive: RegExp[]; suggestive: RegExp[]; substitute: RegExp[]; use: RegExp[]; };
  pbaContextBoost?: { families: string[]; boostAmount: number; };
  enforcement: { tier1: string; tier2: string; tier3: string; tier4: string; };
  threshold: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  chainRules?: ChainRule[];
}
interface ChainRule {
  name: string; description: string;
  requires?: { tool: string | RegExp; args?: Record<string, string|RegExp>; withinMs?: number }[];
  forbids?: { tool: string | RegExp; withinMs?: number }[];
  violation: { layerId: string; customMessage?: string };
}
```

Bank semantics — PTA_L2_SPEC.md §2.3, PBA_PTA_MASTER_L1_SPEC.md §2:

| Bank | Weight | Role | Example |
|------|--------|------|---------|
| descriptive | neg+1 | Legitimate context — suppresses | "for the container test", "as pre-flight check" |
| suggestive | pos+1 (+2 word-bound) | Violation pattern | "just quickly check", "smoke test" |
| substitute | pos+2 | Theatrical alternative | "instead of the container", "good enough for now" |
| use | neg+3 SHORT-CIRCUIT | Sanctioned usage — stops all scoring | "trident-container-test", "the sanctioned path" |

confidence = pos / (pos + neg + 1). ENFORCE >= 0.5, DAMPEN >= 0.3 (x0.5), SUPPRESS < 0.3.
FI-1 batch scan: every family scores full batch, pos>0 + conf>=0.5 + pos>neg -> synthesizes violation weight=conf x 2.

Fill fields — PTA_L2_SPEC.md §2.7:

| Field | Source | Example |
|-------|--------|---------|
| {count} | Per-layer dispatch count | "7 times" |
| {toolName} | Tool called | "bash" |
| {args} | Tool args (JSON) | {"command": "bun test"} |
| {chainViolations} | Violated chain rules | "verification-requires-audit" |
| {pbaFamilies} | Active PBA families | "TEST_EVASION" |
| {pbaTier} | PBA tier | "3" |
| {escalationCount} | Lifetime escalations | "7" |
| {anchor} | Audit trail ref | "(pta:SMOKE:1693487400000)" |

### Compilation — config/loader.ts

```
"node -e*" -> /^node -e.*$/i
"quick test" -> /quick test/i
{ command: ["bun -e*"] } -> { command: [/^bun -e.*$/i] }
```

Throws LOADER_VALIDATION_FAILED if required fields missing.

### Layer Evaluation (per tool call) — PTA_L2_SPEC.md §2.4

1. toolMatchers match -> build text blob (toolName + JSON(args) + PBA excerpt)
2. Score 4 banks -> confidence = pos/(pos+neg+1)
3. Chain rules via ChainTracker.evaluateRules() -> chainConfidence = violations ? 0.8 : 0
4. PBA boost via pbaContextBoost -> pbaConfidence = sum(boostAmount), cap 1.0
5. Fuse: totalConfidence = (toolConf x 0.5) + (chainConf x 0.3) + (pbaConf x 0.2)
6. >= threshold -> ENFORCE; >= threshold x 0.6 -> DAMPEN (accumulate in synapse); else SUPPRESS
7. Conflicts: highest confidence wins -> highest severity -> first registered (deterministic — AP-4)

---

## 7. 30-Minute Walkthrough — 3 Real Examples

Source: PTA_L2_SPEC.md 2.7 + PBA_PTA_MASTER_L1_SPEC.md section 4.

The 30-Minute Process: Minutes 0-5 describe, 5-20 fill JSON, 20-30 register.

### Example 1 — SMOKE_TEST_GUARD — PBA_PTA_MASTER_L1_SPEC.md section 4

```json
{
  "id": "SMOKE_TEST_GUARD",
  "description": "Block smoke tests (inline exec) being used as verification evidence",
  "toolMatchers": [{ "toolName": "bash", "argPatterns": { "command": ["node -e*", "bun -e*", "python3 -c*"] } }],
  "banks": {
    "descriptive": ["for the container test", "as pre-flight check"],
    "suggestive": ["just quickly check", "verify it works"],
    "substitute": ["instead of the container", "faster than the full test"],
    "use": ["trident-container-test", "the sanctioned path"]
  },
  "pbaContextBoost": { "families": ["TEST_EVASION"], "boostAmount": 0.2 },
  "enforcement": {
    "tier1": "DETECTED: Inline execution. Tool: bash {args} PBA: {pbaFamilies} ({anchor})",
    "tier2": "Repeated {count} for SMOKE_TEST_GUARD ({anchor})",
    "tier3": "REFUSED — SMOKE_TEST_GUARD tier 3 ({anchor})",
    "tier4": "[PTA GATE] SMOKE_TEST_GUARD cycles {escalationCount} ({anchor})"
  },
  "threshold": 0.9, "severity": "HIGH",
  "chainRules": [{ "name": "verification-requires-container-test", "requires": [{ "tool": "trident-container-test" }], "violation": { "layerId": "SMOKE_TEST_GUARD" } }]
}
```

### Example 2 — CONFIG_LOCK — PTA_L2_SPEC.md 2.7

```json
{
  "id": "CONFIG_LOCK",
  "description": "Prevent direct writes to protected config paths — use the config tool",
  "toolMatchers": [
    { "toolName": "write", "argPatterns": { "filePath": ["*config*", "*.env*"] } },
    { "toolName": "edit", "argPatterns": { "filePath": ["*config*", "*.env*"] } }
  ],
  "banks": {
    "descriptive": ["reading the config", "inspecting the plugin config"],
    "suggestive": ["just edit the config directly", "quickly patch the env"],
    "substitute": ["faster to edit directly", "skip the config tool"],
    "use": ["trident-config", "the config tool", "the sanctioned config path"]
  },
  "pbaContextBoost": { "families": ["PERMISSION_GATE"], "boostAmount": 0.2 },
  "enforcement": {
    "tier1": "DETECTED: Direct write to protected path. Tool: {toolName} {args} ({anchor})",
    "tier2": "Repeated {count} for CONFIG_LOCK ({anchor})",
    "tier3": "REFUSED — CONFIG_LOCK tier 3 ({anchor})",
    "tier4": "[PTA GATE] CONFIG_LOCK cycles {escalationCount} ({anchor})"
  },
  "threshold": 0.9, "severity": "CRITICAL",
  "chainRules": [{ "name": "config-requires-tool", "requires": [{ "tool": "trident-config" }], "violation": { "layerId": "CONFIG_LOCK" } }]
}
```

### Example 3 — WAVE_DISPATCH — PTA_L2_SPEC.md 2.13

```json
{
  "id": "WAVE_DISPATCH",
  "description": "During DISPATCH: tools must be dispatched via wave-manager batch, not individually",
  "toolMatchers": [{ "toolName": "task" }],
  "banks": {
    "descriptive": ["dispatching wave", "parallel task"],
    "suggestive": ["single task", "one at a time"],
    "substitute": ["simpler to dispatch individually", "just one agent needed"],
    "use": ["trident-wave-manager", "batch dispatch"]
  },
  "pbaContextBoost": { "families": ["PERMISSION_GATE"], "boostAmount": 0.2 },
  "enforcement": {
    "tier1": "Single task dispatch detected. Use trident-wave-manager ({anchor})",
    "tier2": "Dispatched {count} individual tasks ({anchor})",
    "tier3": "Individual task dispatch blocked ({anchor})",
    "tier4": "[PTA GATE] DISPATCH VIOLATION — {escalationCount} ({anchor})"
  },
  "threshold": 0.8, "severity": "HIGH",
  "chainRules": [{ "name": "dispatch-requires-wave-manager", "requires": [{ "tool": "trident-wave-manager" }], "violation": { "layerId": "WAVE_DISPATCH" } }]
}
```

## 8. The PBA Bridge — 3 Mechanisms — PTA_L2_SPEC.md 2.5

Wiring: pba.onSignal -> pta.pbaBridge.onPbaSignal.
Ring buffer 20, pre-arming boostBaseline, escalation correlation.
Mechanism 1: Intent Disambiguation — bridge provides WHY.
Mechanism 2: Predictive Pre-Arming — fires sooner (3 calls -> 2 calls).
Mechanism 3: Escalation Correlation — correlateEscalation function.

```typescript
function correlateEscalation(ptaNaturalTier: number, pbaMacroTier: number): number {
  return Math.max(ptaNaturalTier, pbaMacroTier >= 3 ? 2 : pbaMacroTier >= 2 ? 1 : 0);
}
```

| PBA tier | PTA minimum | Rationale |
|----------|-------------|-----------|
| 0-1 | Natural | No correlation |
| 2 | max(natural, 1) | PBA tier 2 -> PTA skips 0 |
| 3+ | max(natural, 2) | PBA tier 3+ -> PTA skips 1 |

## 9. The 4-Tier Escalation Ladder — PBA_PTA_MASTER_L1_SPEC.md 3, PTA_L2_SPEC.md 2.9

```
Tier 1 -> T.E.A. correction (tool ran)
Tier 2 -> T.E.A. escalated (count, deadline)
Tier 3 -> T.E.B. block (tool refused)
Tier 4 -> [PTA GATE] chat.message + T.E.B. gate -> COMPLIANCE_VERIFIED -> reset
```

Escalation memory: 1st tier1/5events, 2nd tier2/2events, 3rd tier3/0events.
Compliance: GENUINE (artifact) clean slate, MINIMUM (no artifact) probation.
Warhead: 6 sections — DETECTED, WHY FIRED, WHAT IT MEANS, CORRECT BEHAVIOR, SELF-CHECK, RESET PATH.

## 10. Scenario Rolodex S-01..S-18 — PBA_PTA_MASTER_L1_SPEC.md section 7

| # | Scenario | PBA | PTA | Expected |
|---|----------|-----|-----|----------|
| S-01 | Reasoning-only | FIRES | quiet | PBA steer only, PTA tier 0 |
| S-02 | Tool-only | quiet | FIRES | PTA only, PBA tier 0 |
| S-03 | Coordinated | FIRES | FIRES | Both visible same turn |
| S-04 | Chain break | may fire | FIRES | PTA mentions chain |
| S-05 | Pre-arming | fires | SOONER | 1st call vs 3rd |
| S-06 | Escalation correlation | tier3 | tier2 | Skip tier 1 |
| S-07 | Compliance cascade | resets | resets | Both reset on single comply |
| S-08 | Minimum compliance | — | probation | Esc stays, half-window |
| S-09 | Repeat offender | esc>=3 | tier3 | Direct tier 3 |
| S-10 | Synapse decay | — | λ->0 | Fade, no enforcement |
| S-11 | Loop detection | — | FIRES | Same tool x3+ |
| S-12 | Phase-aware | — | FIRES | enterPhase() |
| S-13 | Use-bank short-circuit | — | ALLOWS | Sanctioned transits at tier 4 |
| S-14 | Descriptive suppression | — | SUPPRESSES | Legitimate context |
| S-15 | Adversarial paraphrase | — | FIRES (FI-1) | Batch scan |
| S-16 | Multi-layer conflict | — | highest wins | Confidence -> severity -> first |
| S-17 | PBA off, PTA standalone | off | works alone | Lower accuracy |
| S-18 | Full escalation ladder | escalates | escalates | Tier 1->2->3->4->comply->reset |

### S-18 Detailed — PBA_PTA_MASTER_L1_SPEC.md 7:1038-1073

```
TURN 1: Model thinks "let me just get this working first"
  PBA TEST_EVASION tier 1 steer. Bridge: SMOKE_TEST_GUARD pre-armed (+0.2)
TURN 2: bash("bun -e 'console.log(1)'")
  PTA: Source1 0.3 + Source2 0.8 + Source3 0.2 -> fusion 0.43 < 0.9 -> ACCUMULATE. λ=0.63. Tool runs.
TURN 3: bash("python3 -c 'print(42)'") conf 0.55
  λ=0.63 x e^(-0.05x2)+0.55=1.12 > 0.9 -> FIRE! T.E.A. fires.
  BOTH ENGINES: PBA "stop THINKING" + PTA "stop USING bash as substitute" — FRACTALLY INTEGRATED.
TURN 4: trident-container-test -> use bank SHORT-CIRCUIT -> ALLOW. GENUINE COMPLY. Both reset.
```

## 11. Troubleshooting

Layer not firing: check registered, tool matcher, banks score, threshold, use-bank, descriptive, bridge, chain window.
Bridge not connecting: check enabled, signalFilter, wiring order, sessionId, PBA firing.
Intent classifier: legitimate blocked -> use bank, violation passes -> threshold, paraphrase -> FI-1.
Chain desync: withinMs, registered, loop window.
Escalation: stuck tier1 (deadline 0), jump 1->3 (skip-tier), never tier4 (deadline+debounce).
Build: tsc, test runner, build output.

## 12. API Reference — index.ts:1-18 + PTA_L2_SPEC.md 2.3

```typescript
export { ParagonToolEngine } from './core/engine.js';
export type { ToolChainModule, ToolChainLayer, ToolIntent } from './core/types.js';
export { V2Synapse, FamilyNeuron } from './core/synapse.js';
export { ChainTracker } from './core/chain-tracker.js';
export { PbaBridgeImpl, correlateEscalation } from './core/pba-bridge.js';
export { ComplianceCollector } from './core/collector.js';
export { evaluateCompliance, createEvidenceRecord } from './core/gate-engine.js';
export { step, createInitialRecord } from './core/machine.js';
export { classifyIntent } from './core/intent-classifier.js';
export { fillTemplate, resolveWarhead } from './actuation/warhead-templates.js';
export { dispatchTea, blockAtTeb, dispatchDirective } from './actuation/dispatch.js';
export { ToolEventRouter } from './capture/tool-event-router.js';
export { MockAdapter } from './hooks/mock.js';
export { OpencodeAdapter } from './hooks/opencode-adapter.js';
```

ToolChainModule, ToolChainLayer, ToolIntent, ChainRule, PtaSessionState, PbaBridge, V2Synapse, FamilyNeuron, step, evaluateCompliance, classifyIntent, PlatformAdapter, warhead templates, persistence files (pta-state, pta-synapse, pta-chain, pta-ledger).

---

*End of OPERATING_MANUAL.md — Paragon V3 Tool-Chain Algorithms v1.0.0*
*Sources: PTA_L2_SPEC.md 2.1-2.13 (2,441L) · PBA_PTA_MASTER_L1_SPEC.md 0-9 (1,410L) · index.ts (18L) · package.json (25L)*
