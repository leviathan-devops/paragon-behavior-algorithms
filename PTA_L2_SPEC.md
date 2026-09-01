# PARAGON V3 TOOL-CHAIN ALGORITHMS (PTA) — L2 SPECIFICATION
# v1.0 · 2026-08-31 · Status: ACTIVE — the sibling machinery to PBA
#
# PURPOSE: Tool execution + model action policing — the same intelligent enforcement
# machinery PBA applies to reasoning tokens, applied to tool calls. PTA receives PBA's
# signal stream as input context so it always knows WHY the model is making a tool call,
# not just WHAT tool is being called. Together PBA + PTA form the Paragon Enforcement OS.
#
# PREDECESSOR: Paragon_V2_Behavior_Algorithms (PBA boilerplate, 106/0/216/5, tsc 0)
# BASELINE: The operator's approved PTA design from the 2026-08-31 planning session
#   (the Two-Engine Stack + the sibling boilerplate + intent classifier + chain tracker
#   + PBA bridge + layer system + god loop as building blocks)

---

## PRE-CONTEXT: THE TWO-ENGINE STACK (verbatim from the design session — approved by the operator)

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                     THE PARAGON ENFORCEMENT OS                      │
 │                                                                     │
 │  ┌─────────────────────────┐     ┌─────────────────────────┐        │
 │  │      PBA (macro)        │     │      PTA (micro)        │        │
 │  │                         │     │                          │       │
 │  │  INPUT:                 │     │  INPUT:                  │       │
 │  │  reasoning tokens       │     │  tool.call.started       │       │
 │  │  text-think plane       │     │  tool.call.completed     │       │
 │  │  tool-cadence plane     │     │  tool.execute.before     │       │
 │  │                         │     │  + PBA's signal stream ─┼──────  │
 │  │  DETECTS:               │     │  (the bridge)           │ │flow  │
 │  │  6 behavioral families  │     │                          │ │thru  │
 │  │  (derailment patterns)  │     │  DETECTS:               │        │
 │  │                         │     │  N tool-chain families   │       │
 │  │  ENFORCES:              │     │  (intent + chain + result)│      │
 │  │  messages.transform ────┼─soft│                          │       │
 │  │  tool.execute.before ───┼─hard│  ENFORCES:              │        │
 │  │                         │     │  tool.execute.before ───┼─soft   │
 │  │  WATCHES:               │     │  chat.message ──────────┼─hard   │
 │  │  "what are you          │     │                          │       │
 │  │   THINKING?"            │     │  WATCHES:               │        │
 │  │                         │     │  "what are you DOING     │       │
 │  └─────────────────────────┘     │   and WHY?"             │        │
│                                   └─────────────────────────┘       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │           SHARED MACHINERY (identical for both)              │    │
│  │  4-bank lexicon → ratio classifier → λ-synapse → state      │    │
│  │  machine → tier-proportional warhead dispatch               │    │
│  │  + per-sid persistence + evidence ledger                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │           THE PBA→PTA BRIDGE (the flow-through)               │    │
│  │  PBA.onSignal(signal) ────→ PTA.onReasoningContext(signal)  │    │
│  │  PBA.synapse.snapshot() ─→ PTA.setReasoningState(snapshot)  │    │
│  │  PBA.machine.record ─────→ PTA.setMacroContext(record)      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

**PBA** = reasoning tokens + model intent policing (the macro engine)
**PTA** = tool execution + model action policing (the micro engine)
**Both** pre-programmable with natural language based operating systems to enforce a set of behaviors.

---

## TABLE OF CONTENTS

- §0 THE FUNDAMENTAL PROBLEM
- §1 FAILURE INVENTORY — why the current tool firewalls are insufficient
- §2 THE FIX PLAN — the complete PTA design
  - §2.1 The Sibling Relationship (what's shared, what's different)
  - §2.2 The Boilerplate Structure
  - §2.3 Core Interfaces
  - §2.4 The Intent Classifier (3-source intelligence)
  - §2.5 The PBA Bridge (flow-through)
  - §2.6 The Enforcement Surfaces (soft + hard)
  - §2.7 The Layer System (the programming surface)
  - §2.8 The Chain Tracker (multi-tool sequence enforcement)
  - §2.9 The State Machine (tool-event driven)
  - §2.10 The Warhead Templates
  - §2.11 The Evidence Gates
  - §2.12 What PTA Replaces (the 7 firewalls → layers mapping)
  - §2.13 The God Loop Integration (PBA + PTA as building blocks)
- §3 IMPLEMENTATION ORDER (waves)
- §4 TESTING STRATEGY
- §5 ANTI-PATTERNS AGAINST FALSE SUCCESS
- §6 SUCCESS CRITERIA
- §7 COMPACTION-PROOF IMPLEMENTATION GUIDE
- §8 FINAL NOTES / OPEN QUESTIONS
- §9 THE V1/V2/V3 ROADMAP
- APPENDIX A — ZERO-TRUST AUDIT

---

## §0 THE FUNDAMENTAL PROBLEM

### What the system does now vs what it SHOULD do

**What exists:** PBA (Paragon V2 Behavior Algorithms) polices reasoning tokens — it watches what the model is THINKING via 3 capture planes (reasoning, text-think, tool-cadence), classifies deliberation patterns across 6 behavioral families (TEST_EVASION, FORGERY_INTENT, THEATRICAL_PLANNING, SCOPE_SHRINK, DOUBT_HEDGE, PERMISSION_GATE), accumulates signals through a λ-decay synapse, escalates through a 4-tier state machine (IDLE→MONITORING→PRIMED→INTERVENING, tier 0-4), and dispatches tier-proportional adaptive warheads that correct the model's THINKING. Proven live: battery 1457/0, host validation GREEN, operator receipt witnessed.

**What also exists (but is dumb):** 7 separate hand-coded tool firewalls — SSTF (semantic smoke firewall, 501-1280L), config lock (CTX-01..14, 848L), trident tool block (~400L), poseidon permissions (~300L), hash-as-proof detector (~200L), container substitution (~200L), ship gate (~300L). Each is a static pattern matcher on tool names and arguments. None share PBA's intelligent machinery. None track state across turns. None escalate proportionally. None are aware of the model's reasoning context. Building a new one takes 2-5 days of engineering.

**What SHOULD exist:** A sibling machinery to PBA that applies the SAME intelligent enforcement architecture (4-bank lexicon → ratio classifier → λ-synapse → state machine → tier-proportional warhead dispatch) to TOOL EXECUTION instead of reasoning tokens. PTA watches what the model is DOING, infers the INTENT behind each tool call from 3 sources (the tool itself, the chain context, and PBA's reasoning signals via the bridge), tracks multi-tool sequences, and enforces correct tool-chain behavior with proportional escalation. New enforcement layers are defined as JSON data (30 minutes) instead of hand-coded TypeScript (2-5 days).

### The root class of defect in one sentence

The tool firewalls are dumb static pattern-matchers while the enforcement problem at the tool level is the same class as the enforcement problem at the reasoning level — it requires intent classification, state accumulation, proportional escalation, and context awareness, which is exactly what PBA already built and proved, applied to a different substrate.

## §1 FAILURE INVENTORY — why the current tool firewalls are insufficient

### F-1: SSTF (Semantic Smoke Firewall) — DISABLED + intelligence ceiling [CRITICAL]

**What happened:** The SSTF was built (spec 591L, code 501L at `v4.4.3/src/firewalls/semantic-smoke-firewall.ts`) to block smoke tests as evidence. It works by pattern-matching tool names (`bash`, `node`) and argument shapes (`node -e*`, `bun -e*`, `python3 -c*`). The operator DISABLED it on 2026-08-15 (`semantic-smoke-firewall.ts:465-471` returns unconditional `ALLOW`).

**Root cause:** The SSTF is a REGEX TOWER — it matches tool command shapes without understanding WHY the tool is being called. A `bun -e` call during pre-flight check (legitimate) fires the same block as a `bun -e` call substituting for the container test (violation). No intent classification. No state tracking. No awareness that PBA already detected TEST_EVASION in the reasoning.

**Why it's broken:** Without intent classification, the firewall over-fires on legitimate usage and under-fires on novel evasion. The 4-bank ratio classifier solves this (PBA already proved it works for reasoning).

**Impact:** ~3800 lines of hand-code across the 7 firewalls, each with the same intelligence ceiling. Building a new one takes days. None share escalation state. None talk to each other or to PBA.

### F-2: Config Lock (CTX-01..14) — no state, no reasoning awareness [HIGH]

**What happened:** `v4.4.2-baseline/src/firewalls/ct-anti-derailment.ts` (848L) implements 14 config-lock rules (CTX-01 through CTX-14). Each rule pattern-matches a bash command's target path and verb against a protected list.

**Root cause:** Static path+verb matching. The model thinking "I should just edit the config directly" (a PERMISSION_GATE family signal PBA detects) is invisible to the config lock. The lock fires AFTER the model already decided to do the wrong thing — it doesn't PREVENT the intent from forming.

**Impact:** The model repeatedly attempts config writes, each blocked, burning tokens. PBA fires PERMISSION_GATE steers, but the config lock doesn't know about them — it keeps blocking at tier 0 forever instead of escalating.

### F-3: Trident Tool Block — no phase awareness [MEDIUM]

**What happened:** `v4.4.3/src/poseidon/poseidon-state.ts:221-231` blocks `trident_build`/`trident_explore` agents from calling `trident-poseidon` (leaf node security). The check is a static allowlist per agent type.

**Root cause:** The block doesn't know WHAT PHASE the god loop is in. A `trident-poseidon` call during DISPATCH (legitimate — advancing the loop) is different from during AUDIT (violation — the leaf node shouldn't advance the orchestrator). The phase-required-tools table exists in `poseidon-enforcer-hook.ts:109` but is a separate enforcement system.

**Impact:** Two overlapping enforcement systems (poseidon-state + enforcer-hook) that don't share state. 434L of enforcer-hook code that duplicates machinery PTA would provide for free.

### F-4: Hash-as-Proof Detector — command-shape only [MEDIUM]

**What happened:** `v4.4.2-baseline/src/firewalls/sttgf-contract.ts` (1219L) includes HASH_AS_PROOF_SHAPE — a regex that detects `sha256sum`/`shasum`/`md5sum` command shapes being used as "proof" that code works.

**Root cause:** The detector fires on the COMMAND SHAPE regardless of context. A `sha256sum` during deployment verification (legitimate — checking artifact integrity) fires the same as a `sha256sum` used to claim "the code works because the hash matches" (violation). PBA's FORGERY_INTENT family would disambiguate — the detector doesn't have access to it.

**Impact:** False positives on legitimate hash usage + false negatives on novel proof-substitution patterns.

### F-5: Container Substitution — single-tool check [MEDIUM]

**What happened:** The SSTF's container-substitution class (within `semantic-smoke-firewall.ts`) detects `bun test`/`docker run` being used instead of `trident-container-test`. Single call, single check, no chain awareness.

**Root cause:** The check doesn't know if `trident-container-test` was already called (chain context). A `bun test` BEFORE the container test (pre-flight, legitimate) fires the same as `bun test` INSTEAD of the container test (substitution). The chain context disambiguates — the firewall doesn't have it.

**Impact:** Over-blocking on legitimate pre-flight checks.

### F-6: Ship Gate — evidence-state polling, not real-time [HIGH]

**What happened:** `v4.4.2-baseline/src/hooks/trident-hooks.ts` (within the ship-gate section) checks the evidence state when a ship-intent tool call is made. If evidence state is `NO_EVIDENCE`, the ship is blocked.

**Root cause:** The gate polls the evidence state at SHIP TIME — it doesn't enforce that evidence was produced DURING the build. A model that skipped verification throughout can still attempt a ship (it gets blocked, but only at the end, after all the wasted cycles).

**Impact:** Late enforcement = wasted cycles. The enforcement should fire at the FIRST verification-skipping tool call, not at ship time.

### F-7: Poseidon Permissions — flat allowlist, no escalation [HIGH]

**What happened:** `v4.4.3/src/hooks/poseidon-enforcer-hook.ts` (434L) implements PHASE_REQUIRED_TOOLS (11 phases × expected tools) with a TEB state machine (IDLE→WATCHING→ADVISORY→LOCKED→RESET→DEGENERACY_BREAK).

**Root cause:** The enforcer hook IS a mini-PTA — it has state tracking, escalation, and phase awareness. But it's hand-coded (434L), doesn't use PBA's proven machinery, doesn't receive PBA's signals, and its warhead bodies are hardcoded strings instead of adaptive templates.

**Impact:** 434L of code that PTA would replace with ~100L of layer JSON. The enforcer doesn't share escalation state with PBA (a model at PBA tier 3 doesn't get PTA tier 2 automatically).

### The failure class summary

All 7 firewalls share the same 4 defects:
1. **No intent classification** — they match tool shapes, not the INTENT behind the call
2. **No reasoning awareness** — they don't receive PBA's signals (the WHY)
3. **No shared state** — each tracks its own counters, none share escalation
4. **No proportional escalation** — binary block/allow, no tier-proportional response

PTA solves all 4 by applying PBA's proven machinery to the tool execution substrate.

## §2 THE FIX PLAN — the complete PTA design

### §2.1 The Sibling Relationship (what's shared, what's different)

### What's Shared (identical machinery, adapted for tool events)

| Machinery | PBA (V2 boilerplate) | PTA (V3 boilerplate) | Identical? |
|---|---|---|---|
| Lexicon shape | `PatternFamilyMember` with 4 banks | `ToolChainLayer.banks` with 4 banks | Same opposed-bank structure |
| Bank semantics | descriptive (neg+1), suggestive (pos+1/+2 word-bound), substitute (pos+2), use (neg+3 short-circuit) | Identical — same bank weights, same suppression logic | YES |
| Ratio classifier | `confidence = pos / (pos + neg + 1)` — ENFORCE ≥0.5, DAMPEN ≥0.3 ×0.5, SUPPRESS <0.3 | Same formula, same bands | YES |
| FI-1 batch scan | Every member scores full batch, pos>0 + conf≥0.5 + pos>neg → synthesizes violation ×2 | Same scan on tool results | YES |
| λ-synapse | `Aλ = λ·e^(-0.05·Δseq) + w` per family, fire thresholds per domain, refractory 25 seq | Same decay, same threshold structure, thresholds per tool-chain family | YES |
| Macro fusion | ≥2 same-direction → PATTERN_HIT (ESCALATING_INSISTENCE, etc.) | Same ≥2 trigger + PTA-specific chain fusion (§2.8) | YES + extension |
| State machine | IDLE→MONITORING→PRIMED→INTERVENING, 8 transitions (rearm first), tier 0-4 | Same lattice, same transitions, tool-event driven | YES |
| Escalation memory | escalationCount, deadline 5/2/0, skip-tier ≥2→t2 ≥3→t3, compliance quality | Same compression table, same skip-tier, same genuine/minimum split | YES |
| Compliance quality | minimum (battery-shape) → probation half-window; genuine (problem-solving artifact) → clean slate + count-- | Same — minimum = tool called without artifact; genuine = demanded tool + artifact produced | YES |
| Circuit breaker | 3-strike, operator-gated reset, escape hatches always pass | Same — 3 consecutive denies → circuit open | YES |
| Warhead dispatch | Tier-proportional bodies filled with {count, excerpt, instrument, anchor} | Same — bodies filled with {count, toolName, args, chainContext, pbaContext, anchor} | YES (different fills) |
| Per-sid persistence | `machine-state-<sid>.json` + `synapse-state-<sid>.json`, atomic tmp+rename | `pta-state-<sid>.json` + `pta-synapse-<sid>.json`, same atomic pattern | YES |
| Evidence ledger | `interventions.jsonl` (O_APPEND, 97K+ rows) | `pta-ledger.jsonl` (O_APPEND) | YES |
| Gate engine | Fresh-subset evaluation, 5 criteria, presets per tier | Same — tool RESULTS as evidence records | YES |
| Role gate | Assistant-only (user/unknown → DROP) | Same — tool calls attributed to the correct session | YES |
| Session isolation | Per-sid records, SESSION_CAP=256, LRU evict | Same | YES |

### What's Different (PTA's unique additions)

| Addition | What it does | Why PBA doesn't have it |
|---|---|---|
| **Intent Classifier** (`core/intent-classifier.ts`) | Computes tool-call INTENT from 3 sources: (1) the tool match, (2) the chain context, (3) PBA's reasoning signals. Fuses into a single confidence score. | PBA doesn't need this — reasoning tokens ARE the intent. Tool calls need interpretation. |
| **Chain Tracker** (`core/chain-tracker.ts`) | Maintains per-session tool call history. Detects chain breaks (prerequisite not called), loops (same tool × N), reversals (step N before N-1). | PBA watches individual reasoning tokens — there's no "chain" of reasoning tokens to track. |
| **PBA Bridge** (`core/pba-bridge.ts`) | Receives PBA's signal stream + synapse snapshot + machine record. One-directional (PBA→PTA). Provides real-time reasoning context for intent classification. | PBA doesn't receive from PTA (by design — the macro engine observes, the micro engine acts on the observation). |
| **Layer System** (`layers/` + `config/loader.ts`) | Enforcement behaviors defined as JSON data. The loader compiles JSON into runtime enforcement (lexicon entries + chain rules + warhead bodies). 30-minute layer creation. | PBA's families are TypeScript-defined (`PatternFamilyMember` in `config/<domain>/index.ts`). PTA's are data-defined (JSON) for the 30-min story. |
| **Soft surface: T.E.A. (tool.execute.after)** | Correction warhead appended to the tool's output via the T.E.A. hook (tool still executed). The model reads the correction as part of the tool result. | PBA's soft surface is `messages.transform` (appended to model's context). PTA's is T.E.A. (appended to tool result). |
| **Medium surface: T.E.B. (tool.execute.before)** | Tool call REFUSED before execution (throw StructuredEnforcementError). This is where all legacy firewalls enforce today — PTA replaces them with the same surface but with intent classification + PBA awareness + state tracking. | PBA's hard surface is also `tool.execute.before` (throw). PTA uses T.E.B. at tier 3 (block) AND tier 4 (gate). |
| **Hard surface: chat.message + T.E.B. gate** | chat.message delivers the behavioral directive (the model MUST process it as conversation). T.E.B. gates tool calls — only the demanded tool + escape hatches pass until compliance. State machine tracks compliance. Self-healing — resets on compliance. Never a lockout. | PBA has no equivalent — chat.message is PTA's unique heavy surface (one level heavier than PBA's tool.execute.before throw). |
| **Hard surface: chat.message** | An actual chat message injected that the model MUST respond to. Like the Poseidon enforcer's kick. The heaviest enforcement available. | PBA's hard surface is `tool.execute.before` (throw — tool blocked). PTA's hard is one level heavier — a chat message the model cannot ignore. |

### The enforcement surface comparison

```
 ENFORCEMENT WEIGHT (lightest → heaviest):

 PBA soft:  messages.transform → advisory appended to model's context (model can ignore)
 PTA soft:  tool.execute.before → advisory appended to tool result (tool still runs)
 PBA hard:  tool.execute.before → THROW (tool call blocked)
 PTA hard:  chat.message → actual chat message (model MUST respond — heaviest)

 95%+ of PTA enforcement happens at T.E.A. (tier 1-2 correction warheads in tool results).
 T.E.B. blocks at tier 3. chat.message fires at tier 4 (rare — behavioral catalyst only).
```

### §2.2 The Boilerplate Structure

### Full file listing (what gets built)

```
 Paragon_V3_Tool-Chain_Algorithms/
 │
 ├── core/                              THE MACHINERY (fixed, never edited by adopters)
 │   ├── engine.ts                      PTA spine — tool-event driven (~475L, mirrors PBA's engine.ts)
 │   │                                  Orchestrates: tool event → intent classify → synapse →
 │   │                                  machine → dispatch → compliance loop
 │   │                                  Holds: sessions Map<sid, PtaSessionState>, roleGate,
 │   │                                  gates, circuit, collector, chainTracker, pbaBridge
 │   │
 │   ├── types.ts                       ALL type definitions (~265L)
 │   │                                  ToolChainModule, ToolChainLayer, ChainRule,
 │   │                                  ToolIntent, PbaSignal, PtaSessionState,
 │   │                                  EvidenceRecord, GateResult, StructuredEnforcementError
 │   │
 │   ├── intent-classifier.ts           ★ PTA UNIQUE — 3-source intent classification (~200L)
 │   │                                  classify(toolCall, chainContext, pbaContext) → ToolIntent
 │   │                                  Source 1: tool match (4-bank ratio)
 │   │                                  Source 2: chain context (rule violations)
 │   │                                  Source 3: PBA bridge (reasoning signals + confidence boost)
 │   │                                  Fusion: weighted average + PBA boost
 │   │
 │   ├── chain-tracker.ts               ★ PTA UNIQUE — multi-tool sequence state (~180L)
 │   │                                  recordCall / recordResult per session
 │   │                                  wasCalled / recentTools / detectLoop / evaluateRules
 │   │                                  ChainViolation → layerId mapping
 │   │
 │   ├── synapse.ts                     λ-decay accumulation (identical to PBA, ~100L)
 │   │                                  FamilyNeuron, V2Synapse, thresholds per tool-chain family
 │   │                                  Aλ = λ·e^(-0.05·Δseq) + w, refractory 25
 │   │
 │   ├── machine.ts                     8-transition state lattice (identical to PBA, ~220L)
 │   │                                  IDLE→MONITORING→PRIMED→INTERVENING, tier 0-4
 │   │                                  rearm, observe, accumulate, prime, intervene,
 │   │                                  comply, escalate, cool
 │   │                                  Escalation memory (deadline 5/2/0, skip-tier)
 │   │
 │   ├── gate-engine.ts                 Evidence gates — checks tool RESULTS (~120L)
 │   │                                  Fresh-subset evaluation, 5 criteria
 │   │                                  Evidence = tool call + exit code + output
 │   │                                  Was the DEMANDED tool actually called?
 │   │
 │   ├── collector.ts                   Compliance collection (~110L)
 │   │                                  recordOffense / recordDispatch / measureCompliance
 │   │                                  Pool: tool results as EvidenceRecords
 │   │                                  TTL 600s (2× gate TTL 300s)
 │   │
 │   └── pba-bridge.ts                  ★ PTA UNIQUE — receives PBA's signal stream (~150L)
 │                                      onPbaSignal / onPbaStateChange
 │                                      getRecentSignals / getActiveFamilies / getMacroTier
 │                                      Ring buffer of recent signals (configurable window)
 │                                      Confidence boost calculation
 │
 ├── actuation/
 │   ├── warhead-templates.ts           PTA adaptive templates (~220L)
 │   │                                  Template bodies for tool-chain violations
 │   │                                  Fill fields: {count, toolName, args, chainViolations,
 │   │                                  pbaFamilies, anchor}
 │   │                                  Tier-proportional: tier1 advisory → tier4 hard kick
 │   │
 │   └── dispatch.ts                    Soft + Hard surface dispatch (~160L)
 │                                      dispatchSoft: append advisory to tool result
 │                                      dispatchHard: send chat.message (the kick)
 │                                      throwMandate: StructuredEnforcementError at tier 3
 │
 ├── capture/
 │   └── tool-event-router.ts           Routes tool events → engine (~100L)
 │                                      tool.call.started → intent classify → synapse
 │                                      tool.call.completed → evidence record → compliance
 │                                      tool.execute.before → enforcement check
 │
 ├── layers/                            ★ THE PROGRAMMING SURFACE (what adopters create)
 │   ├── _template.json                 The layer creation template (all fields + docs)
 │   ├── _guide.md                      How to describe a new layer in natural language
 │   └── <name>.layer.json              Each enforcement behavior as data
 │
 ├── hooks/
 │   ├── platform-adapter.ts            PlatformAdapter interface (tool-event shape, ~60L)
 │   │                                  5 methods: normalizeEvent, inject, interceptTool,
 │   │                                  observeTool, observeCompletion
 │   ├── opencode-adapter.ts            Wraps opencode's tool hooks + chat.message (~180L)
 │   └── mock.ts                        MockAdapter for tests (~80L)
 │
 ├── config/
 │   └── loader.ts                      Loads layer JSONs → compiles to runtime (~150L)
 │                                      Parses banks → RegExp arrays
 │                                      Compiles argPatterns → matchers
 │                                      Registers layers + chainRules with the engine
 │
 ├── tests/
 │   └── universality.test.ts           Per-layer dispatch tests (~100L)
 │                                      Each layer: fires on violation, suppresses on legitimate
 │
 ├── OPERATING_MANUAL.md                How to install, configure, create layers
 ├── INSTALL.md                         Zero-to-enforcing quickstart
 └── package.json                       bun package (paragon-v3-tool-chain-algorithms)
```

★ = PTA's unique additions. Everything else mirrors PBA's proven architecture.

**Estimated total: ~2,500L of core machinery + layers as JSON data.**

### §2.3 Core Interfaces

#### ToolChainModule — the adopter-facing interface (like PBA's DomainModule)

```typescript
/**
 * The ONLY interface an adopter implements to wire PTA into their codebase.
 * Mirrors PBA's DomainModule — provides the domain content (layers, chain rules,
 * compliance config) that the fixed machinery (core/) consumes.
 *
 * The engine is constructed: `new PtaEngine(module: ToolChainModule)`
 * Everything else is automatic — the machinery does the enforcement.
 */
interface ToolChainModule {
  /** Unique identifier for this tool-chain domain (e.g. 'trident-toolchain') */
  name: string;

  /** Brand prefix for warhead tags (e.g. 'PTA' → "[PTA ENFORCER] ⛔ ...") */
  brandPrefix: string;

  /**
   * The enforcement layers — each is one behavior to enforce.
   * Like PBA's families[], but each layer carries its own detection (banks),
   * enforcement texts (tier1-4), and chain rules.
   */
  layers: ToolChainLayer[];

  /**
   * Multi-tool chain rules — sequences that must/must not occur.
   * Evaluated by the ChainTracker on every tool call.
   */
  chainRules: ChainRule[];

  /**
   * Compliance configuration — what counts as verification, what always passes.
   * Identical shape to PBA's DomainModule.compliance.
   */
  compliance: {
    /** Tools that ALWAYS pass at any tier (the escape hatch — never blocked) */
    escapeHatches: string[];
    /** The demanded tools — what the model SHOULD be calling (e.g. ['trident-code-audit']) */
    remediationTools: string[];
    /** Patterns in tool output that count as verification evidence */
    verificationPatterns: RegExp[];
  };

  /**
   * PBA bridge configuration — how PTA receives PBA's reasoning signals.
   * When enabled, PTA is aware of WHAT the model was thinking when it made
   * the tool call, making intent classification dramatically more accurate.
   */
  pbaBridge: {
    /** Whether to receive PBA signals (default: false — standalone mode works) */
    enabled: boolean;
    /**
     * Which PBA families to receive (e.g. ['TEST_EVASION', 'FORGERY_INTENT']).
     * If undefined, receive ALL families.
     */
    signalFilter?: string[];
    /**
     * How many recent PBA signals to keep in the bridge's ring buffer.
     * Default: 20. More = longer context window for intent classification.
     */
    contextWindowSize?: number;
    /**
     * How much PBA context boosts detection confidence.
     * Default: 0.2. When PBA fires a matching family, the layer's confidence
     * increases by this amount (capped at 1.0).
     */
    confidenceBoost?: number;
  };
}
```

#### ToolChainLayer — one enforcement behavior (the unit you program)

```typescript
/**
 * One enforcement behavior — what PBA calls a "family" but with its own
 * detection, enforcement texts, and chain rules bundled together.
 *
 * This is the unit that gets defined as JSON in layers/<name>.layer.json
 * and compiled by the config loader into runtime enforcement.
 *
 * Example: SMOKE_SUBSTITUTION — "block smoke tests as evidence"
 *   toolMatchers: bash with inline-exec patterns
 *   banks: descriptive (legitimate check context) / suggestive (violation patterns)
 *          substitute (theatrical alternatives) / use (sanctioned usage)
 *   enforcement: tier1 advisory → tier4 hard kick
 */
interface ToolChainLayer {
  /** Unique identifier (e.g. 'SMOKE_SUBSTITUTION', 'CONFIG_LOCK', 'CHAIN_BREAK') */
  id: string;

  /** Human-readable description of what this layer enforces */
  description: string;

  /**
   * WHICH tools this layer watches.
   * Each matcher specifies a tool name (or regex) and optionally
   * argument patterns to narrow the match.
   *
   * Example:
   *   toolMatchers: [
   *     { toolName: 'bash', argPatterns: { command: ['node -e*', 'bun -e*'] } },
   *     { toolName: 'write', argPatterns: { filePath: ['*config*'] } }
   *   ]
   */
  toolMatchers: {
    /** Tool name to match (exact string or regex — e.g. 'bash', /trident-.*/) */
    toolName: string | RegExp;
    /**
     * Argument patterns to narrow the match.
     * Key = argument name, Value = array of glob patterns or regexes.
     * ALL patterns are OR-matched within each argument.
     * If no argPatterns, the layer watches ALL calls to the tool.
     */
    argPatterns?: Record<string, (string | RegExp)[]>;
  }[];

  /**
   * WHAT patterns to detect — the 4-bank shape, identical to PBA.
   *
   * The ratio classifier scores each tool call's context (tool name + args +
   * result + surrounding model text) against these banks:
   *   descriptive (neg+1): context that makes the call LEGITIMATE (suppresses)
   *   suggestive (pos+1/+2): the violation pattern itself (word-bound +2)
   *   substitute (pos+2): theatrical alternatives to the sanctioned path
   *   use (neg+3): sanctioned usage — SHORT-CIRCUITS the entire family
   *
   * confidence = pos / (pos + neg + 1)
   * ENFORCE ≥ 0.5 · DAMPEN ≥ 0.3 (×0.5) · SUPPRESS < 0.3
   */
  banks: {
    descriptive: RegExp[];
    suggestive: RegExp[];
    substitute: RegExp[];
    use: RegExp[];
  };

  /**
   * PBA context amplification — which PBA families boost this layer.
   *
   * When PBA fires one of these families, the layer's detection confidence
   * increases by boostAmount (capped at 1.0). This is the KEY to PTA's
   * intelligence: an ambiguous bash call from a model with TEST_EVASION
   * λ=1.8 becomes a confident TOOL_SUBSTITUTION.
   */
  pbaContextBoost?: {
    /** PBA family names that boost this layer (e.g. ['TEST_EVASION']) */
    families: string[];
    /** Confidence boost amount (default: pbaBridge.confidenceBoost, typically 0.2) */
    boostAmount: number;
  };

  /**
   * WHAT to say at each tier — the warhead bodies.
   * Available fill fields: {count}, {toolName}, {args}, {chainViolations},
   * {pbaFamilies}, {anchor}
   */
  enforcement: {
    /** Tier 1 — T.E.A. correction warhead appended to tool result via tool.execute.after (tool still runs) */
    tier1: string;
    /** Tier 2 — T.E.A. escalated correction warhead (stronger, with count and deadline warning) */
    tier2: string;
    /** Tier 3 — T.E.B. tool call refused (throw StructuredEnforcementError) */
    tier3: string;
    /** Tier 4 — chat.message behavioral directive + T.E.B. gate (demanded tool + hatches only until compliance) */
    tier4: string;
  };

  /** λ fire threshold — how much accumulated signal before this layer fires */
  threshold: number;

  /** Severity for scoring and prioritization */
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  /**
   * Chain rules specific to this layer.
   * Evaluated by the ChainTracker — if violated, this layer fires.
   */
  chainRules?: ChainRule[];
}
```

#### ChainRule — multi-tool sequence enforcement

```typescript
/**
 * A rule about multi-tool sequences. The ChainTracker evaluates all active
 * rules on every tool call and reports violations.
 *
 * Example: "verification-requires-audit"
 *   Any tool call during a verification task requires trident-code-audit
 *   to have been called first.
 */
interface ChainRule {
  /** Unique rule name (e.g. 'verification-requires-audit') */
  name: string;

  /** Human-readable description */
  description: string;

  /**
   * What MUST have been called before the current tool.
   * ALL entries must be satisfied (AND, not OR).
   * If empty/undefined, no prerequisite check.
   */
  requires?: {
    /** The prerequisite tool (exact or regex) */
    tool: string | RegExp;
    /** Optional argument patterns to narrow the prerequisite */
    args?: Record<string, string | RegExp>;
    /**
     * Time window in ms. The prerequisite must have been called within
     * this window. Default: since session start.
     */
    withinMs?: number;
  }[];

  /**
   * What must NOT have been called (forbids).
   * If ANY of these were called within the window, the rule is violated.
   */
  forbids?: {
    tool: string | RegExp;
    withinMs?: number;
  }[];

  /**
   * What to do when the rule is violated.
   * Maps to a layer's enforcement — the layer fires at the appropriate tier.
   */
  violation: {
    /** Which layer's enforcement to fire */
    layerId: string;
    /** Optional override for the tier1 message (default: layer's own tier1) */
    customMessage?: string;
  };
}
```

#### ToolIntent — the intent classification result

```typescript
/**
 * The result of the Intent Classifier's 3-source analysis.
 * This is what the enforcement decision is made on.
 */
interface ToolIntent {
  /** The enforcement decision */
  action: 'ALLOW' | 'ADVISE' | 'BLOCK';

  /** Which layer fired (null = clean call, no layer matched) */
  layerId: string | null;

  /** Confidence 0.0-1.0 — how certain PTA is about this classification */
  confidence: number;

  /** Current enforcement tier (0-4, from the state machine) */
  tier: number;

  /** The 3 sources that produced this classification */
  sources: {
    /** Source 1: the tool match against the layer's banks */
    toolMatch: {
      toolName: string;
      /** Which bank pattern matched (null = no match) */
      matchedPattern: string | null;
      /** Confidence from the 4-bank ratio classifier alone */
      confidence: number;
    };

    /** Source 2: the chain context at the time of the call */
    chainContext: {
      /** The last N tool names called (most recent last) */
      previousTools: string[];
      /** Which chain rules were violated by this call */
      chainViolations: string[];
      /** Confidence derived from chain violations (0 = no violations, 1 = definite break) */
      confidence: number;
    };

    /** Source 3: PBA's reasoning signals via the bridge */
    pbaContext: {
      /** PBA families currently active (λ above threshold) */
      activeFamilies: string[];
      /** Recent PBA signals (from the bridge's ring buffer) */
      latestSignals: PbaSignal[];
      /** PBA's current enforcement tier (0-4) */
      macroTier: number;
      /** Confidence derived from PBA context (0 = no relevant signals) */
      confidence: number;
    };
  };
}

/** A PBA signal received via the bridge */
interface PbaSignal {
  /** Which PBA family fired (e.g. 'TEST_EVASION') */
  family: string;
  /** PBA's confidence for this signal (0.0-1.0) */
  confidence: number;
  /** The model's own words that triggered PBA */
  excerpt: string;
  /** PBA's sequence number */
  seq: number;
  /** Session ID */
  sessionId: string;
}
```

#### PtaSessionState — per-session state (like PBA's SessionState)

```typescript
interface PtaSessionState {
  sessionId: string;
  /** The PTA state machine record (tier, escalationCount, etc.) */
  record: BehaviorRecord;
  /** The synapse (λ per tool-chain family) */
  synapse: V2Synapse;
  /** The chain tracker's state for this session */
  chainState: {
    /** Recent tool calls (tool name, timestamp, exit code) */
    callHistory: Array<{ tool: string; at: number; exitCode?: number; args?: Record<string, unknown> }>;
    /** Active chain violations (for the current call) */
    activeViolations: ChainViolation[];
  };
  /** The PBA bridge's ring buffer for this session */
  pbaSignals: PbaSignal[];
  /** Behavioral counters (tool calls, verification calls, etc.) */
  behavioral: {
    toolCalls: number;
    verificationCalls: number;
    completionClaims: number;
    lastClaimTimestamp: number | null;
  };
  /** The last enforcement tier dispatched for this session */
  lastDispatchedTier: Map<string, number>; // layerId → tier
}
```

### §2.4 The Intent Classifier (3-source intelligence)

### The 3-source pipeline

Every tool call that reaches `tool.execute.before` passes through the intent classifier BEFORE any enforcement decision is made. The classifier fuses 3 independent sources into a single `ToolIntent`:

```
 tool.execute.before({toolName, args, sessionId})
         │
         ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  SOURCE 1: TOOL MATCH (the 4-bank ratio classifier)              │
 │  "What is being called?"                                         │
 │                                                                  │
 │  For each active layer whose toolMatchers match this tool:      │
 │    1. Build the text blob: toolName + JSON.stringify(args)      │
 │       + surrounding model text (if available from PBA bridge)    │
 │    2. Score against the layer's 4 banks:                         │
 │       descriptive (neg+1) — legitimate context → suppresses      │
 │       suggestive (pos+1, +2 word-bound) — violation pattern     │
 │       substitute (pos+2) — theatrical alternative                │
 │       use (neg+3, SHORT-CIRCUIT) — sanctioned usage → stops all  │
 │    3. confidence = pos / (pos + neg + 1)                        │
 │       ENFORCE ≥ 0.5 · DAMPEN ≥ 0.3 (×0.5) · SUPPRESS < 0.3      │
 └──────────────────┬──────────────────────────────────────────────┘
                    │
                    ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  SOURCE 2: CHAIN CONTEXT (the ChainTracker)                      │
 │  "What was called before this?"                                  │
 │                                                                  │
 │  1. ChainTracker.evaluateRules(sessionId, toolName, args)       │
 │  2. For each active ChainRule:                                   │
 │     a. Check requires[] — was each prerequisite tool called?    │
 │     b. Check forbids[] — was any forbidden tool called?         │
 │     c. Check loop — same tool called 3+ times with no result?   │
 │  3. ChainViolations[] returned (each maps to a layerId)          │
 │  4. chainConfidence = violations.length > 0 ? 0.8 : 0.0         │
 │     (definite chain break = high confidence, no break = 0)      │
 └──────────────────┬──────────────────────────────────────────────┘
                    │
                    ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  SOURCE 3: PBA CONTEXT (the bridge)                              │
 │  "What was the model thinking?"                                  │
 │                                                                  │
 │  1. pbaBridge.getActiveFamilies(sessionId)                      │
 │     → which PBA families have λ above threshold?                 │
 │  2. pbaBridge.getRecentSignals(sessionId, 10)                   │
 │     → the last 10 PBA signals (family + confidence + excerpt)    │
 │  3. pbaBridge.getMacroTier(sessionId)                           │
 │     → PBA's current enforcement tier (0-4)                      │
 │  4. For each active layer with pbaContextBoost:                  │
 │     if any of the layer's boost families are active:             │
 │       pbaConfidence += boostAmount (capped at 1.0)               │
 └──────────────────┬──────────────────────────────────────────────┘
                    │
                    ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  FUSION (the classification decision)                            │
 │                                                                  │
 │  totalConfidence = (toolMatch.confidence * 0.5) +               │
 │                    (chainContext.confidence * 0.3) +             │
 │                    (pbaContext.confidence * 0.2)                 │
 │  (weighted average: tool match is primary, chain is secondary,  │
 │   PBA context is tertiary but disambiguating)                     │
 │                                                                  │
 │  if totalConfidence >= layer.threshold:                          │
 │    → ENFORCE (fire the layer's tier-appropriate enforcement)     │
 │  elif totalConfidence >= layer.threshold * 0.6:                  │
 │    → DAMPEN (accumulate in synapse — repeated signals fire)     │
 │  else:                                                            │
 │    → SUPPRESS (clean call, no action)                            │
 └─────────────────────────────────────────────────────────────────┘
```

### The disambiguation example (why 3 sources matter)

```
Model calls bash("bun test")
├── Source 1 (tool match):
│   SMOKE_SUBSTITUTION layer: bash with "bun test" → suggestive match
│   confidence = 2/(2+0+1) = 0.67 (moderate — "bun test" looks like substitution)
│
├── Source 2 (chain context):
│   ChainTracker: trident-code-audit NOT called yet
│   ChainRule 'verification-requires-audit' → VIOLATED
│   confidence = 0.8 (definite chain break)
│
├── Source 3 (PBA context):
│   PBA bridge: TEST_EVASION family active (λ=1.8, above threshold 1.2)
│   Latest signal: {family: 'TEST_EVASION', confidence: 0.75,
│                   excerpt: 'let me just get this working first'}
│   SMOKE_SUBSTITUTION has pbaContextBoost: {families: ['TEST_EVASION'], boostAmount: 0.2}
│   confidence = 0.2 (boost applied)
│
└── Fusion:
    totalConfidence = (0.67 × 0.5) + (0.8 × 0.3) + (0.2 × 0.2)
                    = 0.335 + 0.24 + 0.04
                    = 0.615

    Layer threshold: 0.9
    0.615 < 0.9 → DAMPEN (accumulate in synapse)

    Without PBA context (source 3 = 0):
    totalConfidence = (0.67 × 0.5) + (0.8 × 0.3) + 0
                    = 0.335 + 0.24 + 0
                    = 0.575

    With PBA context:
    0.615 > 0.575 → the PBA context pushed it higher

    After 2 more similar calls (synapse accumulates):
    λ crosses threshold → FIRE at tier 1 (T.E.A. correction warhead)

THE KEY INSIGHT: Without PBA context, this call is ambiguous —
"bun test" could be a legitimate pre-flight check. WITH PBA context
(TEST_EVASION active = the model was THINKING about skipping verification),
the call is clearly a substitution. The PBA bridge disambiguates.
```

### The FI-1 batch scan (adapted for tool results)

Like PBA's FI-1 scan, PTA runs a batch scan on tool RESULTS (not just the call itself):

```typescript
// On tool.call.completed, before the result enters the evidence pool:
function batchScanOnResult(result: ToolResult, layers: ToolChainLayer[]): ToolIntent | null {
  const text = `${result.toolName} ${JSON.stringify(result.args)} ${result.output}`;
  for (const layer of layers) {
    // Skip if this layer doesn't watch this tool
    if (!matchesTool(layer.toolMatchers, result.toolName)) continue;

    // Score the RESULT text against the layer's banks
    const { pos, neg } = scoreSignals(text, layer.banks);
    const conf = pos / (pos + neg + 1);

    // FI-1: positive evidence in the RESULT that the tool was used as a substitute
    if (pos > 0 && conf >= 0.5 && pos > neg) {
      return synthesizeViolation(layer.id, result, conf * 2); // weight = conf × 2
    }
  }
  return null; // clean result
}
```

This catches cases where the tool CALL looked clean but the RESULT reveals substitution (e.g. the model called `bash` with innocent-looking args but the output contains "smoke test passed" — a substitute pattern in the result text).

### §2.5 The PBA Bridge (flow-through)

### The interface

```typescript
// core/pba-bridge.ts

/**
 * THE PBA BRIDGE — the flow-through from the macro engine to the micro engine.
 *
 * PBA calls these methods when its signals fire. PTA receives them in real-time
 * (same event loop tick or next tick — never delayed by polling).
 *
 * The bridge is ONE-DIRECTIONAL by design: PBA → PTA only.
 * PBA is the observer (reasoning), PTA is the actor (tool enforcement).
 * PBA never receives from PTA — the macro engine observes, the micro engine acts.
 */
interface PbaBridge {
  /**
   * PBA calls this on every signal that passes its confidence gates.
   * PTA stores the signal in a per-session ring buffer for intent classification.
   */
  onPbaSignal(signal: PbaSignal): void;

  /**
   * PBA calls this on every state machine transition (tier change, escalation,
   * compliance verified, etc.). PTA updates its macro context.
   */
  onPbaStateChange(state: {
    tier: number;                    // PBA's current enforcement tier (0-4)
    escalationCount: number;          // PBA's lifetime escalation count
    activeFamilies: string[];         // PBA families with λ above threshold
    lastWarheadBody: string | null;   // The last warhead PBA dispatched
  }): void;

  // === Query methods (PTA's Intent Classifier calls these) ===

  /** Get the last N PBA signals for this session (ring buffer) */
  getRecentSignals(sessionId: string, limit: number): PbaSignal[];

  /** Which PBA families currently have λ above their fire threshold? */
  getActiveFamilies(sessionId: string): string[];

  /** PBA's current enforcement tier for this session */
  getMacroTier(sessionId: string): number;
}
```

### The wiring (how PBA and PTA connect in the host codebase)

```typescript
// In the host codebase (e.g. trident-hooks.ts or the plugin entry point):

import { ParagonEngine } from 'paragon-v2-behavior-algorithms';
import { PtaEngine } from 'paragon-v3-tool-chain-algorithms';

// 1. Create both engines (each with its own module)
const pba = new ParagonEngine(pbaDomain);         // reasoning-token enforcement
const pta = new PtaEngine(ptaModule);              // tool-execution enforcement

// 2. Wire the bridge (PBA → PTA, one direction)
pba.onSignal((signal) => {
  pta.pbaBridge.onPbaSignal({
    family: signal.family,
    confidence: signal.confidence,
    excerpt: signal.excerpt,
    seq: signal.seq,
    sessionId: signal.sessionId,
  });
});

pba.onStateChange((state) => {
  pta.pbaBridge.onPbaStateChange({
    tier: state.tier,
    escalationCount: state.escalationCount,
    activeFamilies: state.activeFamilies,
    lastWarhoodBody: state.lastWarheadBody,
  });
});

// 3. Both engines run independently and async.
//    PTA doesn't wait for PBA — it uses PBA's data as context when available.
//    If the bridge is disabled (pbaBridge.enabled = false), PTA works standalone
//    with slightly lower intent classification accuracy.
```

### The bridge's 3 uses (how PBA context makes PTA intelligent)

**Use 1: Intent Disambiguation**

Without PBA context, a `bash("bun test")` call is ambiguous — it could be:
- A legitimate pre-flight check before the real test (descriptive context)
- A substitute for the container test (violation)

With PBA context showing TEST_EVASION λ=1.8 (the model was THINKING about skipping verification), the call is clearly a substitution. The PBA bridge disambiguates ambiguous tool calls by providing the reasoning context that a tool-only classifier cannot see.

**Use 2: Predictive Pre-Arming**

When PBA fires TEST_EVASION, PTA pre-arms its SMOKE_SUBSTITUTION family:
- The synapse's baseline λ for SMOKE_SUBSTITUTION increases by `confidenceBoost` (default 0.2)
- The next matching tool call starts from a higher baseline — it fires FASTER
- This is the "PTA is aware of the same reasoning/intent as PBA" the operator described

```typescript
// In the PbaBridge implementation:
onPbaSignal(signal: PbaSignal): void {
  // Store in ring buffer
  this.signals.get(signal.sessionId)?.push(signal);

  // Pre-arm matching layers
  for (const layer of this.engine.layers) {
    if (layer.pbaContextBoost?.families.includes(signal.family)) {
      // Boost the synapse baseline for this layer's family
      const neuron = this.engine.synapseFor(signal.sessionId).getNeuron(layer.id);
      neuron.boostBaseline(layer.pbaContextBoost.boostAmount);
      // ↑ This is a PTA-specific addition to the synapse — PBA doesn't need it
      //   because its signals ARE the baseline. PTA needs it because PBA's signals
      //   are EXTERNAL context that should lower the fire threshold for matching layers.
    }
  }
}
```

**Use 3: Escalation Correlation**

When PBA is at tier 3 (the model has been escalated for reasoning violations), and PTA fires for the first time, PTA starts at tier 2 instead of tier 1. The combined system reflects the model's TOTAL non-compliance (thinking + doing), not just one plane's view.

```typescript
// In the intent classifier's fusion step:
function correlateEscalation(ptaTier: number, pbaMacroTier: number): number {
  // PBA at tier 3+ → PTA starts at minimum tier 2
  // PBA at tier 2 → PTA starts at minimum tier 1
  // PBA at tier 0-1 → PTA starts at its own natural tier
  const correlatedTier = Math.max(ptaTier, pbaMacroTier >= 3 ? 2 : pbaMacroTier >= 2 ? 1 : 0);
  return correlatedTier;
}
```

### §2.6 The Enforcement Surfaces (T.E.A. / T.E.B. / chat.message)

PTA has three enforcement surfaces, each a different opencode hook. The tier (from the state machine) determines which surface delivers the correction. The intent classifier runs on EVERY tool call at EVERY tier — the tier changes the delivery mechanism, not whether checking happens.

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ PTA ENFORCEMENT SURFACES — THE CORRECT ARCHITECTURE                     │
 │                                                                         │
 │ T.E.B. (tool.execute.before) ← THE CHECK SURFACE (ALWAYS ACTIVE)       │
 │ ─────────────────────────────────────────────────────────────          │
 │ The intent classifier runs HERE on every tool call.                    │
 │                                                                         │
 │ Tier 0:   No violation → tool runs, nothing happens                   │
 │ Tier 1-2: Violation + below block threshold →                         │
 │           tool runs normally, correction warhead is QUEUED            │
 │           for delivery via T.E.A.                                     │
 │ Tier 3:   Violation + at block threshold →                            │
 │           tool call REFUSED (throw StructuredEnforcementError)         │
 │           The tool does NOT execute                                    │
 │ Tier 4:   Behavioral directive active →                               │
 │           T.E.B. gates: only the demanded tool + escape hatches       │
 │           pass. Resets on compliance. Self-healing.                   │
 │                                                                         │
 │                                                                         │
 │ T.E.A. (tool.execute.after) ← THE CORRECTION DELIVERY SURFACE          │
 │ ─────────────────────────────────────────────────────────────          │
 │ After the tool completes, the correction warhead is                    │
 │ APPENDED to the tool's output via this hook.                           │
 │                                                                         │
 │ Fires at Tier 1-2 (when T.E.B. allowed the tool to run).              │
 │ The tool ran 100% normally — no interference with execution.           │
 │ The correction arrives as part of the result the model reads.         │
 │                                                                         │
 │                                                                         │
 │ chat.message                   ← THE BEHAVIORAL DIRECTIVE SURFACE      │
 │ ─────────────────────────────────────────────────────────────          │
 │ Fires at Tier 4 only. An actual chat message is sent                   │
 │ that the model MUST process as part of the conversation.              │
 │                                                                         │
 │ Combined with T.E.B. gating: the directive tells the model WHAT        │
 │ to do, the gate ensures only the demanded tool passes until it         │
 │ does it. The state machine tracks compliance.                          │
 │ NOT A LOCKOUT — the demanded tool + read/grep/glob ALWAYS pass.       │
 │ Resets automatically on compliance. The point is behavior change.     │
 └─────────────────────────────────────────────────────────────────────────┘
```

### Tier 1-2: T.E.A. delivery (tool.execute.after)

The tool runs normally. After it completes, the correction warhead is appended to the output via the tool.execute.after hook:

```typescript
// actuation/dispatch.ts

// Called from the T.E.A. hook (tool.execute.after) when a correction is queued
function deliverCorrectionViaTea(
  layer: ToolChainLayer,
  tier: number,  // 1 or 2
  context: ToolIntent,
  toolOutput: string,  // the tool's normal output
): string {
  const body = fillTemplate(layer.enforcement[`tier${tier}`], {
    count: getDispatchCount(layer.id),
    toolName: context.sources.toolMatch.toolName,
    args: JSON.stringify(context.sources.toolMatch),
    chainViolations: context.sources.chainContext.chainViolations.join(', '),
    pbaFamilies: context.sources.pbaContext.activeFamilies.join(', '),
    anchor: `pta:${layer.id}:${Date.now()}`,
  });

  // Append the correction warhead AFTER the tool's normal output
  // The model reads both together on the next turn
  return toolOutput + `\n\n${body}`;
}
```

**What the model sees at Tier 1:**

```
  $ bun -e 'console.log(1)'
  1

  ⚠ [PTA] SMOKE_SUBSTITUTION — Tier 1

  ─────────────────────────────────────────────────────────────
  DETECTED: Inline script execution used as verification substitute.

  YOUR TOOL CALL: bash with command "bun -e 'console.log(1)'"

  WHY THIS FIRED:
  • Tool match: bash + inline-exec pattern (confidence: 0.43)
  • Chain: trident-container-test was never called — chain rule
    "verification-requires-container-test" violated
  • PBA: TEST_EVASION active in your reasoning (tier 1, λ=1.27)

  WHAT THIS MEANS:
  You are producing output that looks like verification but is not
  evidence. Inline execution proves the code runs once — it does not
  prove correctness and cannot be cited as proof.

  CORRECT BEHAVIOR:
  → trident-container-test — the sanctioned verification pipeline
  → Produces container-test-results.json with per-scenario verdicts
  → Always passes at every enforcement tier

  SELF-CHECK BEFORE NEXT TOOL CALL:
  □ Am I calling trident-container-test instead of bash inline-exec?
  □ Will my next tool call produce verifiable output?
  ─────────────────────────────────────────────────────────────
  (pta:SMOKE_SUB:3:0.43)
```

### Tier 3: T.E.B. block (tool.execute.before)

The tool call is REFUSED before execution. The model receives a StructuredEnforcementError with the full correction:

```typescript
// Called from the T.E.B. hook (tool.execute.before) when tier 3 is active
function blockAtTeb(
  layer: ToolChainLayer,
  context: ToolIntent,
): never {  // always throws
  const body = fillTemplate(layer.enforcement.tier3, {
    count: getDispatchCount(layer.id),
    toolName: context.sources.toolMatch.toolName,
    chainViolations: context.sources.chainContext.chainViolations.join(', '),
    pbaFamilies: context.sources.pbaContext.activeFamilies.join(', '),
    pbaTier: context.sources.pbaContext.macroTier,
  });

  throw new StructuredEnforcementError({
    machine: 'pta',
    detected: `${layer.id} at tier 3`,
    correction: body,
    evidenceRequired: true,
    tier: 3,
  });
}
```

### Tier 4: chat.message directive + T.E.B. gate

An actual chat message is sent (behavioral directive). T.E.B. gates tool calls — only the demanded tool + escape hatches pass until compliance:

```typescript
// Called when the state machine reaches tier 4
function dispatchDirective(
  layer: ToolChainLayer,
  context: ToolIntent,
  adapter: PlatformAdapter,
): void {
  const body = fillTemplate(layer.enforcement.tier4, {
    count: getDispatchCount(layer.id),
    escalationCount: getEscalationCount(),
    pbaFamilies: context.sources.pbaContext.activeFamilies.join(', '),
    pbaTier: context.sources.pbaContext.macroTier,
  });

  // Send the behavioral directive as an actual chat message
  adapter.inject({
    type: 'chat.message',
    content: body,
    sessionId: getSessionId(),
  });

  // T.E.B. is now gated by the state machine at tier 4:
  // - demanded tool → PASSES (always)
  // - read, grep, glob → PASSES (always)
  // - everything else matching this layer → REFUSED
  // When the model calls the demanded tool → COMPLIANCE_VERIFIED
  // → state machine resets → all tools unblock → both engines reset
}
```

**NOT A LOCKOUT:** The model is never bricked. The demanded tool always passes. Escape hatches always pass. The moment the model complies, everything resets. The point is behavior change through a directed enforcement window — the model MUST process the directive and act on it to continue its current pattern.

### The tier-to-surface mapping

```
 Tier 0: MONITORING — intent classifier runs, signals accumulate in synapse.
         No enforcement action. The engine is watching.

 Tier 1: INTERVENING — T.E.A. correction warhead appended to tool result.
         Tool ran normally. Correction is in the output the model reads.

 Tier 2: ESCALATED — T.E.A. stronger correction warhead (count, PBA context,
         chain violations, deadline warning). Tool still ran.
         The correction explicitly warns: "next escalation blocks this tool."

 Tier 3: DENY — T.E.B. tool call REFUSED (throw StructuredEnforcementError).
         The tool does NOT execute.
         Escape hatches (read/grep/glob) + demanded tool ALWAYS pass.
         The model can immediately call the correct tool.

 Tier 4: DIRECTIVE — chat.message behavioral directive sent.
         + T.E.B. gated by state machine: only demanded tool + hatches pass.
         + State machine tracks compliance: demanded tool called + artifact
           produced → COMPLIANCE_VERIFIED → all tools unblock → reset.

 ESCALATION MEMORY (same as PBA):
   escalationCount ≥ 2 → next violation starts at tier 2 (skip tier 1)
   escalationCount ≥ 3 → next violation starts at tier 3 (skip tiers 1-2)
   Deadlines compress: 1st offense 5 events, 2nd 2 events, 3rd+ 0 events

 THE ENFORCEMENT IS ALWAYS CHECKING:
   T.E.B. runs the intent classifier on EVERY tool call at EVERY tier.
   The tier determines the delivery surface (T.E.A. vs T.E.B. vs chat.message),
   not whether checking happens. There is no "starts checking at tier 2."
```

### §2.7 The Layer System (the programming surface)

### The layer JSON format (the 30-minute programming surface)

This is what replaces coding new tool firewalls. Instead of writing SSTF's 1280 lines of TypeScript, you write a ~100-line JSON:

```json
// layers/sstf-smoke-substitution.layer.json
{
  "id": "SMOKE_SUBSTITUTION",
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
    "tier1": "⚠ [PTA] Inline execution detected as evidence substitute. The sanctioned verification path is trident-container-test. Consider using it.",
    "tier2": "⛔ [PTA] You've used inline execution {count} times instead of the container test. The pattern is sustaining. trident-container-test is the demanded path.",
    "tier3": "⛔ [PTA DENY] This tool call is blocked. Inline execution as verification is forbidden. Call trident-container-test — it always passes.",
    "tier4": "[PTA BEHAVIORAL CORRECTION] ⛔ {escalationCount} enforcement cycles for smoke substitution. PBA detected {pbaFamilies} at tier {pbaTier}. This is a behavioral catalyst — the demanded tool and escape hatches always pass. Run trident-container-test. On compliance, both engines reset. Your work continues."
  },
  "threshold": 0.9,
  "severity": "HIGH",
  "chainRules": [
    {
      "name": "verification-requires-container-test",
      "description": "Verification claims require the container test to have been called",
      "requires": [{ "tool": "trident-container-test" }],
      "violation": { "layerId": "SMOKE_SUBSTITUTION" }
    }
  ]
}
```

### The 30-minute layer creation process

```
 Minutes 0-5:   Describe the behavior in natural language
               "I want to block config file writes. The model should
                never modify .config/opencode/.env directly — it should
                use the config tool."

 Minutes 5-20:  Fill the layer JSON
               - toolMatchers: which tools to watch
                 → [{ toolName: "write", argPatterns: { filePath: ["*config*"] } },
                    { toolName: "edit", argPatterns: { filePath: ["*config*"] } }]
               - banks: the 4 pattern sets
                 → descriptive: legitimate config references
                 → suggestive: direct config modification patterns
                 → substitute: "just edit it directly" patterns
                 → use: sanctioned config tool usage
               - enforcement: what to say at each tier
                 → tier1: advisory ("use the config tool")
                 → tier2: escalated ("you've tried {count} times")
                 → tier3: deny (tool call blocked)
                 → tier4: hard kick (chat message)
               - chainRules: if there's a prerequisite tool
                 → requires: [{ tool: "trident-config" }]
               - escapeHatches: what always passes
                 → ["trident-config", "read", "grep", "glob"]

 Minutes 20-30: Register and test
               pta.registerLayer(layerJson)
               bun test layers/config-lock.test.ts
               → Layer is live, enforcement begins immediately
```

### The config loader (compiles JSON → runtime enforcement)

```typescript
// config/loader.ts

function loadLayer(jsonPath: string): ToolChainLayer {
  const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'));

  // Compile string patterns → RegExp
  const compilePatterns = (patterns: string[]): RegExp[] =>
    patterns.map(p => new RegExp(p.replace(/\*/g, '.*'), 'i'));

  // Compile toolMatcher argPatterns
  const compileArgPatterns = (argPatterns: Record<string, string[]>): Record<string, RegExp[]> => {
    const compiled: Record<string, RegExp[]> = {};
    for (const [key, patterns] of Object.entries(argPatterns)) {
      compiled[key] = patterns.map(p =>
        new RegExp('^' + p.replace(/\*/g, '.*') + '$', 'i')
      );
    }
    return compiled;
  };

  return {
    id: raw.id,
    description: raw.description,
    toolMatchers: raw.toolMatchers.map((m: any) => ({
      toolName: m.toolName,
      argPatterns: m.argPatterns ? compileArgPatterns(m.argPatterns) : undefined,
    })),
    banks: {
      descriptive: compilePatterns(raw.banks.descriptive),
      suggestive: compilePatterns(raw.banks.suggestive),
      substitute: compilePatterns(raw.banks.substitute),
      use: compilePatterns(raw.banks.use),
    },
    pbaContextBoost: raw.pbaContextBoost,
    enforcement: raw.enforcement, // strings with {fill} placeholders
    threshold: raw.threshold,
    severity: raw.severity,
    chainRules: raw.chainRules,
  };
}

// Register with the engine:
function registerLayer(pta: PtaEngine, jsonPath: string): void {
  const layer = loadLayer(jsonPath);
  pta.registerLayer(layer);
  // Layer is now live — every matching tool call goes through
  // the intent classifier with this layer's banks and chain rules
}
```

### The fill template system (same as PBA)

Enforcement texts support `{fill}` placeholders resolved at dispatch:

| Fill field | Source | Example |
|---|---|---|
| `{count}` | Per-layer dispatch count (how many times this layer has fired) | "You've used inline execution **7** times" |
| `{toolName}` | The tool that was called | "This **bash** call substitutes..." |
| `{args}` | The tool's arguments (JSON stringified) | "Args: **{\\"command\\": \\"bun test\\"}**" |
| `{chainViolations}` | Which chain rules were violated | "Chain rule **verification-requires-audit** violated" |
| `{pbaFamilies}` | Which PBA families are active | "PBA detected **TEST_EVASION, FORGERY_INTENT**" |
| `{pbaTier}` | PBA's current tier | "PBA tier **3**" |
| `{escalationCount}` | Lifetime escalation count | "**7** escalations" |
| `{anchor}` | Audit trail reference | "(pta:SMOKE_SUBSTITUTION:1693487400000)" |

### §2.8 The Chain Tracker (multi-tool sequence enforcement)

### The ChainTracker interface

```typescript
// core/chain-tracker.ts

class ChainTracker {
  private sessions: Map<string, ChainSession>;

  /** Called on every tool.call.started — records the call for chain evaluation */
  recordCall(sessionId: string, toolName: string, args: Record<string, unknown>): void {
    const session = this.getOrCreate(sessionId);
    session.callHistory.push({
      tool: toolName,
      at: Date.now(),
      args,
    });
    // Cap history at 100 calls (ring buffer — keep recent context)
    if (session.callHistory.length > 100) {
      session.callHistory.shift();
    }
  }

  /** Called on every tool.call.completed — records the result */
  recordResult(sessionId: string, toolName: string, exitCode: number, output: string): void {
    const session = this.getOrCreate(sessionId);
    // Find the most recent call to this tool and attach the result
    for (let i = session.callHistory.length - 1; i >= 0; i--) {
      if (session.callHistory[i].tool === toolName && session.callHistory[i].exitCode === undefined) {
        session.callHistory[i].exitCode = exitCode;
        session.callHistory[i].output = output.substring(0, 500); // cap output for memory
        break;
      }
    }
  }

  /** Was this tool called before? (within the optional time window) */
  wasCalled(sessionId: string, tool: string | RegExp, withinMs?: number): boolean {
    const session = this.getOrCreate(sessionId);
    const cutoff = withinMs ? Date.now() - withinMs : 0;
    return session.callHistory.some(call =>
      call.at >= cutoff &&
      (typeof tool === 'string' ? call.tool === tool : tool.test(call.tool))
    );
  }

  /** Get the last N tool calls */
  recentTools(sessionId: string, limit: number): Array<{ tool: string; at: number; exitCode?: number }> {
    const session = this.getOrCreate(sessionId);
    return session.callHistory.slice(-limit);
  }

  /** Detect looping — same tool called 3+ times with no result variation */
  detectLoop(sessionId: string, windowSize: number = 10): boolean {
    const session = this.getOrCreate(sessionId);
    const recent = session.callHistory.slice(-windowSize);
    if (recent.length < 3) return false;

    // Count same-tool calls
    const toolCounts: Record<string, number> = {};
    for (const call of recent) {
      toolCounts[call.tool] = (toolCounts[call.tool] || 0) + 1;
    }

    // Any tool called 3+ times = potential loop
    for (const [tool, count] of Object.entries(toolCounts)) {
      if (count >= 3) {
        // Check if results are varying (if outputs differ, it's not a loop)
        const results = recent.filter(c => c.tool === tool && c.output !== undefined);
        const uniqueOutputs = new Set(results.map(r => r.output));
        if (uniqueOutputs.size <= 1) {
          return true; // Same tool, same or no output = loop
        }
      }
    }
    return false;
  }

  /** Evaluate all active chain rules against the current tool call */
  evaluateRules(
    sessionId: string,
    currentTool: string,
    currentArgs: Record<string, unknown>,
    rules: ChainRule[],
  ): ChainViolation[] {
    const violations: ChainViolation[] = [];

    for (const rule of rules) {
      // Check requires[] — ALL must be satisfied
      if (rule.requires && rule.requires.length > 0) {
        for (const req of rule.requires) {
          const satisfied = this.wasCalled(sessionId, req.tool, req.withinMs);
          if (!satisfied) {
            violations.push({
              ruleName: rule.name,
              violationType: 'MISSING_PREREQUISITE',
              expectedTool: String(req.tool),
              actualContext: `${currentTool} called without prerequisite ${req.tool}`,
              layerId: rule.violation.layerId,
            });
          }
        }
      }

      // Check forbids[] — ANY matched is a violation
      if (rule.forbids && rule.forbids.length > 0) {
        for (const forbid of rule.forbids) {
          const called = this.wasCalled(sessionId, forbid.tool, forbid.withinMs);
          if (called) {
            violations.push({
              ruleName: rule.name,
              violationType: 'FORBIDDEN_PRECEDENT',
              expectedTool: 'none',
              actualContext: `${forbid.tool} was called before ${currentTool}`,
              layerId: rule.violation.layerId,
            });
          }
        }
      }
    }

    return violations;
  }
}

interface ChainSession {
  callHistory: Array<{
    tool: string;
    at: number;
    args?: Record<string, unknown>;
    exitCode?: number;
    output?: string;
  }>;
}

interface ChainViolation {
  ruleName: string;
  violationType: 'MISSING_PREREQUISITE' | 'FORBIDDEN_PRECEDENT' | 'LOOP_DETECTED' | 'SEQUENCE_REVERSED';
  expectedTool: string;
  actualContext: string;
  layerId: string;  // which layer to fire when this violation is detected
}
```

### Beyond T1_MULTI_TOOL_CHAIN_PIPELINE (what PTA adds)

The T1 bible's multi-tool chain uses **mechanical firewalls INSIDE tool execute()** — each tool validates the previous step's output before running. This works but requires code INSIDE each tool.

PTA's chain enforcement works **OUTSIDE the tools** — the ChainTracker observes the tool call sequence from the event stream and enforces chain rules without any tool modification. This means:

1. **No tool code changes** — chain enforcement is external, not embedded
2. **Works with ANY tools** — including tools you don't own (opencode built-ins, third-party)
3. **Chain rules are data** — defined in layer JSON, not hardcoded in tool implementations
4. **Intent-aware** — the chain check considers WHY the tool is being called (via PBA bridge), not just whether the prerequisite was technically called

**What PTA extends beyond T1:**
- T1's mechanical firewall = Layer 1 (file existence) + Layer 3 (format validation) → PTA's chain rules + evidence gates
- T1's "NEXT: do X" instructions → PTA's tier 1 advisory texts
- T1's module-level PipelineRunContext → PTA's ChainTracker (per-session, capped, observable)
- T1 had NO state tracking, NO escalation, NO reasoning awareness → PTA adds all three

### §2.9 The State Machine (tool-event driven)

### The 8 transitions (identical to PBA, tool-event driven)

The state machine is the SAME lattice PBA proved live. The only difference is the input events (tool calls instead of reasoning tokens):

```
 TRANSITION    EVENT                  STATE CHANGE              GUARD
 ─────────────────────────────────────────────────────────────────────────
 rearm         TOOL_SIGNAL            INTERVENING → INTERVENING  (always —
                                                                 the NEVER-TWICE
                                                                 structural law)

 observe       FIRST_TOOL_SIGNAL      IDLE → MONITORING          level ≠ OFF
                                       (first tool call that
                                        matches any layer)

 accumulate    TOOL_SIGNAL            {MON,PRIM,INT} → MONITORING level ≠ OFF
                                       (subsequent matching
                                        calls accumulate in synapse)

 prime         CHAIN_PATTERN_HIT      MONITORING → PRIMED        patternId or
                                       (chain violation or         memberId anchor
                                        macro fusion fires)

 intervene     INTERVENE              PRIMED → INTERVENING        level ≠ OFF AND
                                       tier := skipTier             verb eligible
                                       deadline := seq+5

 comply        COMPLIANCE_VERIFIED    INTERVENING → MONITORING    demanded tool
                                       tier := 0                    called + artifact
                                       denial := 0                  produced
                                       esc-- (if genuine)

 escalate      COMPLIANCE_FAILED      INTERVENING → INTERVENING   deadline+debounce
                                       tier++                       passed, tier < 4
                                       denial++ (at ≥3)
                                       esc++ (at ≥2)
                                       deadline compressed

 cool          SEQ_WINDOW             INTERVENING → MONITORING    seq advanced ≥ 25
                                       (no signals for 25 seq)     AND compliance
                                                                    verified OR no
                                                                    outstanding
```

### The escalation memory (identical to PBA)

```
 escalationCount: lifetime count of tier≥2 escalations (never reset by comply
                  except genuine comply decrements by 1)

 deadline table:  count 0-1 → window 5 (seq+6, full)
                  count 2   → window 2 (seq+3, half)
                  count 3+  → window 0 (seq+1, immediate)

 debounce:        count 0-1 → 5
                  count 2   → 2
                  count 3+  → 0 (next tick escalates immediately)

 skip-tier:       count ≥2 + minimum comply → start at tier 2
                  count ≥3 → start at tier 3

 compliance quality:
                  minimum = demanded tool called, exit 0, but no artifact
                    → probation half-window, escalationCount STAYS
                  genuine = demanded tool called + artifact produced
                    → clean slate, escalationCount-- (min 0)
```

### The dial (same 3 levels as PBA)

```
 FULL:  all enforcement surfaces active (default)
 STEER: T.E.A. only (correction warheads, no T.E.B. blocking, no chat directives)
 OFF:   no enforcement (zero transitions — the machine never lifts)
```

### PtaSessionState and persistence

Per-session, atomic tmp+rename (same pattern as PBA):

```
 <state-dir>/pta-state-<sid>.json       — machine record + behavioral counters
 <state-dir>/pta-synapse-<sid>.json      — λ per tool-chain family
 <state-dir>/pta-chain-<sid>.json        — chain tracker's call history
 <state-dir>/pta-ledger.jsonl            — every enforcement event (O_APPEND)
```

The state dir is configurable per ToolChainModule (default: `~/.config/opencode/pta/`).

### §2.10 The Warhead Templates

### The warhead writing standard (same as PBA — every template is a behavior program)

Every PTA warhead template must be a **behavior program** — imperative, executable from the text alone by a zero-context agent. Each template carries:

1. **DETECTED** — what the model did (specific tool, args, pattern matched)
2. **WHY THIS FIRED** — the 3 sources (tool match, chain context, PBA context)
3. **WHAT THIS MEANS** — the behavioral explanation (2-3 sentences on why this matters)
4. **CORRECT BEHAVIOR** — the specific tool to call and what it produces
5. **SELF-CHECK** — questions the model answers before its next tool call
6. **RESET PATH** — how to clear the enforcement (always available)

### Default PTA templates (used when a layer doesn't define custom texts)

**Tier 1 — T.E.A. correction warhead (appended to tool result via tool.execute.after):**

```
⚠ [PTA] {layerId} — Tier 1

─────────────────────────────────────────────────────────────
DETECTED: {whatWasDetected}

YOUR TOOL CALL: {toolName} with args {argsSummary}
MATCHED PATTERN: {matchedPattern} in layer {layerId}

WHY THIS FIRED:
• Tool match: {toolMatchReason} (confidence: {toolConf})
• Chain context: {chainViolationDescription}
• PBA context: {pbaFamilies} active in your reasoning
  (PBA tier {pbaTier}, λ={lambda})

WHAT THIS MEANS:
{behavioralExplanation}

CORRECT BEHAVIOR:
→ {correctTool} — {whatItDoes}
→ Produces {evidenceType} that {whyEvidenceMatters}
→ Always passes at every enforcement tier

SELF-CHECK BEFORE NEXT TOOL CALL:
□ Am I calling {correctTool} instead of {toolName}?
□ Will my next tool call produce verifiable output?
─────────────────────────────────────────────────────────────
({anchor})
```

**Tier 2 — T.E.A. escalated correction (stronger, appended via tool.execute.after):**

```
⛔ [PTA] {layerId} — Tier 2 (ESCALATED)

─────────────────────────────────────────────────────────────
YOU HAVE DONE THIS {count} TIMES.

PREVIOUS CORRECTIONS IGNORED: {count-1} correction warheads delivered via T.E.A.
PBA PARALLEL ENFORCEMENT: {pbaFamilies} at tier {pbaTier}
  (PBA has ALSO been correcting your reasoning — you are receiving
   corrections from both the thinking layer and the doing layer
   for the SAME behavioral pattern)

WHY THIS IS ESCALATING:
Your tool calls continue to match {layerId} despite {count-1}
previous corrections. Each ignored correction increases enforcement
pressure. The next escalation REFUSES the tool call itself.

WHAT HAPPENS IF YOU CONTINUE:
Tier 3 → this tool call will be REFUSED before execution.
         The tool will not run. You will receive the correction
         in a StructuredEnforcementError instead of a tool result.

THE RESET PATH:
→ Call {correctTool} with a real target
→ On success + artifact, both PBA and PTA reset to tier 0
→ This is always available — never blocked

→ {correctTool} — always passes, always resets
─────────────────────────────────────────────────────────────
({anchor})
```

**Tier 3 — T.E.B. block (tool call refused via tool.execute.before):**

```
⛔ [PTA ENFORCEMENT] {layerId} — Tier 3

─────────────────────────────────────────────────────────────
THIS TOOL CALL IS REFUSED.

Tool: {toolName} with args {argsSummary}
Layer: {layerId} (severity: {severity})
Violations: {count} tool calls matched this pattern
Chain violations: {chainViolations}
PBA context: {pbaFamilies} at tier {pbaTier}

THE PATTERN:
You have repeatedly used {toolName} as a substitute for {correctTool}.
The enforcement engine has classified this as {behavioralClassification}.

TO CHANGE THIS BEHAVIOR:
→ Call {correctTool} — the ONLY path that resets enforcement
→ It always passes — no tier blocks it
→ On success + artifact, both PBA and PTA reset to tier 0

STILL AVAILABLE (never blocked):
→ read, grep, glob — for inspection
→ {correctTool} — for compliance
→ All other tools NOT matching {layerId}

THE SELF-HEALING PATH:
1. Call {correctTool} on the target you were working on
2. Process the result (it will contain real evidence)
3. Continue your work — enforcement resets automatically
─────────────────────────────────────────────────────────────
({anchor})
```

**Tier 4 — chat.message behavioral directive + T.E.B. gate:**

```
[PTA BEHAVIORAL CORRECTION] {layerId} — Sustained Pattern

─────────────────────────────────────────────────────────────
You have sustained {layerId} for {totalCount} tool calls
across {escalationCount} enforcement cycle(s).

PBA has been correcting your REASONING at tier {pbaTier}
(families: {pbaFamilies})
PTA has been correcting your TOOL CALLS at tier 3

Both engines are detecting the same behavioral pattern from
different angles: your reasoning shows {pbaPattern} and your
tool calls show {ptaPattern}.

THE CORRECTION:
This is a behavioral catalyst, not a lockout.
The demanded tool and escape hatches always pass.
Every tool EXCEPT the pattern that triggered this enforcement
continues to work normally.

IMMEDIATE PATH FORWARD:
→ Call {correctTool} on your current target
→ Process the evidence it produces
→ Both engines reset to clean state
→ Your work continues from where you are

WHY THIS IS NECESSARY:
Your current approach produces {consequenceOfBehavior}.
The demanded tool produces {benefitOfCorrectTool}.
The behavioral gap is {gapDescription}.

THIS MESSAGE IS PART OF YOUR CONTEXT.
Process it. Act on it. The enforcement resets on compliance.
─────────────────────────────────────────────────────────────
```

### How warheads are vetted for quality

Every warhead template goes through the same vetting as PBA's 24 templates:

1. **The warhead writing skill standard:** every template is a behavior program — imperative DO-bullets executable from the text alone. No vague instructions. Every mechanism named concretely.

2. **The naming-contract test:** every layer ID appears in the template registry. Every template's fillFields are validated at registration time.

3. **The calibration gate (same as PBA's D17):** before a layer goes live, its templates are tested against golden-state fixtures:
   - **fireTest:** the template fires on the expected violation input
   - **silentTest:** the template does NOT fire on legitimate input
   - Both must pass or the layer is excluded until calibrated

4. **The universality suite:** every layer's tier-1 body is asserted to contain the layer's distinctive marker substring (same as PBA's marker system).

### The template resolution (same composer contract as PBA)

```
 1. Layer provides custom enforcement.tier1-4 → use those (with {fill} substitution)
 2. Layer does NOT provide custom texts → use the generic PTA defaults above
 3. Always append the anchor: " ({anchor})"

 THE COMPOSER CONTRACT: The resolver returns the BODY only.
 The caller (dispatch.ts) owns the delivery surface:
   Tier 1-2 → deliverCorrectionViaTea → appends body to tool output (T.E.A. hook)
   Tier 3   → blockAtTeb → throws StructuredEnforcementError (T.E.B. hook)
   Tier 4   → dispatchDirective → sends chat.message + gates T.E.B.
```

### §2.11 The Evidence Gates

### Evidence = tool results (not just tool calls)

PBA's evidence gates check whether the demanded INSTRUMENT was called and produced a verified test result. PTA's gates check the same but at the tool level — was the demanded TOOL called and did it produce a RESULT?

```typescript
// core/gate-engine.ts (adapted for PTA)

interface ToolEvidenceRecord {
  type: 'tool_result';
  tool: string;                          // which tool was called
  args: Record<string, unknown>;         // with what arguments
  exitCode: number;                      // 0 = success
  output: string;                        // what the tool produced (capped at 500 chars)
  timestamp: number;
  signature: string;                     // SHA-256 for integrity verification
}

class PtaGateEngine {
  /**
   * Gate evaluation for a layer's enforcement:
   * "Was the demanded tool called with the right args and did it succeed?"
   */
  evaluateCompliance(
    layerId: string,
    demandedTool: string,
    evidencePool: ToolEvidenceRecord[],
    freshnessWindowMs: number = 300000,  // 5 minutes
  ): GateResult {
    const fresh = evidencePool.filter(e =>
      Date.now() - e.timestamp < freshnessWindowMs
    );
    const matching = fresh.filter(e =>
      e.tool === demandedTool && e.exitCode === 0
    );

    // 5 criteria (same structure as PBA):
    // 1. minEvidenceCount: at least 1 matching tool result
    // 2. freshness: within the window
    // 3. requiredTypes: type === 'tool_result'
    // 4. allTypes: exitCode === 0 (the tool succeeded)
    // 5. signatureVerification: SHA-256 recomputes correctly

    const criteria = {
      minEvidenceCount: matching.length >= 1,
      freshness: fresh.length > 0,
      requiredTypes: matching.every(e => e.type === 'tool_result'),
      allTypes: matching.every(e => e.exitCode === 0),
      signatureVerification: matching.every(e => verifySignature(e)),
    };

    const passCount = Object.values(criteria).filter(Boolean).length;
    const verdict = passCount === 5 ? 'PASS' : passCount >= 3 ? 'INCONCLUSIVE' : 'FAIL';

    return { verdict, criteria, poolSize: matching.length, totalFresh: fresh.length };
  }
}
```

### Compliance quality (same genuine/minimum split as PBA)

```
 MINIMUM COMPLY: The demanded tool was called and exited 0.
   → The model ran one tool, but produced no ARTIFACT (no file, no
     diagnostic output, no verification record).
   → Probation: half-window deadline, escalationCount STAYS.

 GENUINE COMPLY: The demanded tool was called, exited 0, AND produced
   an artifact (a file on disk, a diagnostic record, a verifiable output
   that matches the layer's verificationPatterns).
   → Clean slate: full window, escalationCount-- (min 0).

 Example:
   SMOKE_SUBSTITUTION layer demands trident-container-test.
   MINIMUM: model calls trident-container-test (exit 0, but no results artifact file).
   GENUINE: model calls trident-container-test AND .trident/container-test-results.json
            exists with valid content (matches verificationPatterns).
```

### §2.12 What PTA Replaces (the 7 firewalls → layers mapping)

### The 7 firewalls → 7 layers mapping

Each existing hand-coded tool firewall becomes a PTA layer (~100 lines of JSON each, replacing ~3800 lines total of TypeScript):

| # | Current firewall | Current LOC | PTA layer ID | What the layer watches | Reduction |
|---|---|---|---|---|---|
| 1 | SSTF semantic-smoke-firewall (`v4.4.3/src/firewalls/semantic-smoke-firewall.ts:501L` + `v4.4.2-baseline/src/firewalls/sttgf-firewall.ts:1280L`) | 501-1781L | SMOKE_SUBSTITUTION | bash with inline-exec patterns (`node -e*`, `bun -e*`, `python3 -c*`) | ~1700L → ~100L JSON |
| 2 | Config Lock CTX-01..14 (`v4.4.2-baseline/src/firewalls/ct-anti-derailment.ts:848L`) | 848L | CONFIG_LOCK | write/edit to protected paths (`*config*`, `*.env*`, `*plugin*`) | 848L → ~80L JSON |
| 3 | Trident Tool Block (`v4.4.3/src/poseidon/poseidon-state.ts:221-231`) | ~50L | TOOL_PERMISSION | trident-poseidon from leaf nodes (trident_build, trident_explore) | ~50L → ~40L JSON |
| 4 | Poseidon Permissions (`v4.4.3/src/hooks/poseidon-enforcer-hook.ts:434L`) | 434L | PHASE_ENFORCEMENT | tool calls not matching current god-loop phase's PHASE_REQUIRED_TOOLS | 434L → ~120L JSON (one chainRule per phase) |
| 5 | Hash-as-Proof (`v4.4.2-baseline/src/firewalls/sttgf-contract.ts` within 1219L) | ~200L | HASH_AS_PROOF | bash with hash-verb shapes used as verification claims | ~200L → ~60L JSON |
| 6 | Container Substitution (within SSTF) | ~200L | CONTAINER_SUBSTITUTION | bun test/docker run instead of trident-container-test | ~200L → ~50L JSON |
| 7 | Ship Gate (`v4.4.2-baseline/src/hooks/trident-hooks.ts` ship-gate section) | ~300L | SHIP_EVIDENCE_GATE | ship-intent tool calls when evidence pool is empty | ~300L → ~70L JSON |

**Total: ~3800L of TypeScript → ~520L of JSON. 86% code reduction. Plus: all 7 layers now share state, escalate together, and are PBA-aware.**

### What each layer gains by being a PTA layer (vs a standalone firewall)

| Gain | How |
|---|---|
| Intent classification | The 3-source classifier distinguishes legitimate usage from violation (the #1 problem with static firewalls) |
| PBA awareness | The layer knows WHY the model is making the tool call (PBA bridge provides reasoning context) |
| Proportional escalation | Tier 1 advisory → tier 4 hard kick, same as PBA's proven escalation |
| State accumulation | The synapse tracks how many times the pattern fired — repeated violations escalate faster |
| Chain awareness | ChainRules check prerequisites (was the demanded tool called first?) |
| Shared escalation | If PBA is at tier 3, PTA starts at tier 2 — combined enforcement reflects total non-compliance |
| Compliance detection | The gate engine verifies the demanded tool actually ran and produced an artifact |
| 30-minute creation | New layers are JSON, not TypeScript — describe the behavior, fill the template, register |
| Evidence ledger | Every enforcement event is recorded in pta-ledger.jsonl (audit trail) |
| Escape hatches | Configurable per ToolChainModule — read/grep/glob always pass by default |

### §2.13 The God Loop Integration (PBA + PTA as building blocks)

### The god loop stays as designed — PBA + PTA are its enforcement building blocks

The god loop (`v4.4.3/src/poseidon/god-loop.ts` 2364L, 13 phases, LOOP/PASS terminals, canon docs, multi-wave dispatch) is NOT replaced. What changes is that its enforcement substrate comes from PBA + PTA instead of inline hooks.

**What PTA replaces (the god loop's inline enforcement machinery):**

| God loop component | LOC | PTA replacement | How |
|---|---|---|---|
| `poseidon-enforcer-hook.ts` | 434L | PHASE_ENFORCEMENT layer + 8 phase chainRules | Each phase's PHASE_REQUIRED_TOOLS becomes a chainRule; the enforcer's TEB state machine is replaced by PTA's state machine (same 8 transitions); the enforcer's ADVISORY→LOCKED→RESET→DEGENERACY_BREAK is replaced by PTA's tier 0-4 |
| `poseidon-watcher.ts` | ~300L | PTA ChainTracker | The watcher's hash-distinct task detection is replaced by ChainTracker.detectLoop() + ChainTracker.recentTools(); activity monitoring is replaced by ChainTracker's call history |
| `poseidon-kick.ts` | ~150L | PTA hard surface (chat.message) | The kick's `[POSEIDON ENFORCER]` message is replaced by PTA's tier-4 dispatchHard — same mechanism (actual chat message), powered by the shared machinery |
| `cycle-tracker.ts` (partially) | 220L | PTA synapse λ-decay | Finding persistence is naturally tracked by λ-decay (same family accumulating = persistent, declining = fixed); stagnation detection via the synapse's λ plateau |

**What the god loop keeps (its own logic, NOT replaced):**

| God loop component | Why it stays |
|---|---|
| 13-phase state machine (INIT→AUDIT→SCORE→DECIDE→PLAN→DISPATCH→COLLECT→VERIFY→AUDIT_RECHECK→PROBLEM_SOLVE→CONTAINER_TEST→PASS/LOOP) | This is the ORCHESTRATION — PBA + PTA are the ENFORCEMENT. The orchestrator tells the model what to do; PBA + PTA enforce that it does it correctly. |
| Canon doc management (10 docs at INIT, updated at 3 points per round) | Canon docs are build-specific context management, not enforcement |
| Multi-wave dispatch (wave manifests, agent grouping, L1 prompt building) | Wave orchestration is the god loop's core competency |
| Audit engine integration (18-layer audit, finding quality, calibration) | The audit engine is a separate system (§2.12 covers its PTA integration) |
| Container test evaluation (LASME artifact, PASS routing) | Container test evaluation reads the results artifact — PTA's evidence gate checks that the artifact EXISTS but the god loop evaluates its content |
| Problem-solve stall detection and diagnosis routing | The stall detection logic (STALL_THRESHOLD=2, MAX_CYCLES=50) is god loop business logic |
| `/poseidon` command → activates the god loop's PTA layer set + PBA family set | The command becomes a toggle that registers/unregisters the god-loop layers |

### The integration shape

```typescript
// The god loop's phases each map to a PTA layer:

const GOD_LOOP_LAYER_SET = {
  INIT:           'layers/god-loop/init.layer.json',
  AUDIT:          'layers/god-loop/audit-required.layer.json',
  SCORE:          'layers/god-loop/score-evidence.layer.json',
  DECIDE:         'layers/god-loop/decision-findings.layer.json',
  PLAN:           'layers/god-loop/plan-density.layer.json',
  DISPATCH:       'layers/god-loop/wave-dispatch.layer.json',
  COLLECT:        'layers/god-loop/collect-all.layer.json',
  VERIFY:         'layers/god-loop/battery-rerun.layer.json',
  AUDIT_RECHECK:  'layers/god-loop/incremental-audit.layer.json',
  PROBLEM_SOLVE:  'layers/god-loop/diagnosis-required.layer.json',
  CONTAINER_TEST: 'layers/god-loop/artifact-required.layer.json',
  // PASS and LOOP are terminals — no enforcement
};

// The god loop activates the correct layer set as it enters each phase:
function enterPhase(phase: GodLoopPhase): void {
  // Deactivate previous phase's layer
  if (currentPhase && GOD_LOOP_LAYER_SET[currentPhase]) {
    pta.deactivateLayer(GOD_LOOP_LAYER_SET[currentPhase]);
  }

  // Activate new phase's layer
  const layerPath = GOD_LOOP_LAYER_SET[phase];
  if (layerPath) {
    pta.activateLayer(loadLayer(layerPath));
  }

  // PBA family set also changes per phase
  pba.activateFamilySet(GOD_LOOP_PBA_FAMILIES[phase] || []);
}
```

### Example: the DISPATCH phase layer

```json
// layers/god-loop/wave-dispatch.layer.json
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
    "tier1": "⚠ [PTA] Single task dispatch detected. Use trident-wave-manager for batch dispatch — sequential dispatch costs 5x wall-clock time.",
    "tier2": "⛔ [PTA] You've dispatched {count} individual tasks instead of using the wave manager. The batch form is the demanded path.",
    "tier3": "⛔ [PTA DENY] Individual task dispatch blocked during DISPATCH phase. Use trident-wave-manager.",
    "tier4": "[PTA ENFORCER] ⛔ DISPATCH VIOLATION — {escalationCount} escalations. PBA: {pbaFamilies} at tier {pbaTier}. STOP individual dispatches. Use trident-wave-manager batch form."
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

## §3 IMPLEMENTATION ORDER (waves)

### Wave 1: Core Engine + PBA Bridge + Intent Classifier (the machinery)

**Owner:** 1 builder agent (disjoint file set)

| File | Est. LOC | What |
|---|---|---|
| `core/engine.ts` | ~475 | PTA spine — tool-event driven orchestration |
| `core/types.ts` | ~265 | ALL interfaces (ToolChainModule, ToolChainLayer, ChainRule, ToolIntent, etc.) |
| `core/intent-classifier.ts` | ~200 | 3-source intent classification + fusion |
| `core/chain-tracker.ts` | ~180 | Multi-tool sequence tracking + rule evaluation |
| `core/synapse.ts` | ~100 | λ-decay (port from PBA, adapted for tool-chain families) |
| `core/machine.ts` | ~220 | 8-transition state lattice (port from PBA, tool-event events) |
| `core/gate-engine.ts` | ~120 | Evidence gates — tool results as evidence |
| `core/collector.ts` | ~110 | Compliance collection |
| `core/pba-bridge.ts` | ~150 | PBA signal reception + pre-arming + escalation correlation |
| `actuation/warhead-templates.ts` | ~220 | PTA template bodies + fill system |
| `actuation/dispatch.ts` | ~160 | T.E.A. correction delivery + T.E.B. block + chat.message directive |
| `capture/tool-event-router.ts` | ~100 | Routes tool events → engine |
| `hooks/platform-adapter.ts` | ~60 | PlatformAdapter interface |
| `hooks/opencode-adapter.ts` | ~180 | Wraps opencode's tool hooks + chat.message |
| `hooks/mock.ts` | ~80 | MockAdapter for tests |

**Gate:** `tsc --noEmit` = 0 errors, unit tests for intent classifier + chain tracker + bridge pass

### Wave 2: Layer System + First Layers (the programming surface)

**Owner:** 1 builder agent (disjoint from Wave 1)

| File | Est. LOC | What |
|---|---|---|
| `layers/_template.json` | ~80 | The creation template with all fields documented |
| `layers/_guide.md` | ~200 | How to describe a new layer in natural language |
| `layers/sstf-smoke-substitution.layer.json` | ~100 | SSTF as a PTA layer (proof of concept) |
| `layers/audit-tool-required.layer.json` | ~80 | Code-audit enforcement (the operator's example) |
| `config/loader.ts` | ~150 | Compiles JSON → runtime enforcement (regex compilation, layer registration) |
| `tests/universality.test.ts` | ~100 | Per-layer dispatch tests |

**Gate:** Layers load via loader, dispatch correctly in tests, `bun test` passes

### Wave 3: God Loop Integration + Container Test

**Owner:** 1 builder agent + orchestrator for container testing

| File | Est. LOC | What |
|---|---|---|
| `layers/god-loop/*.layer.json` (8 files) | ~800 | Each god-loop phase as a PTA layer |
| Integration wiring | ~100 | enterPhase() activation/deactivation |

**Gate:** Phase-E circuit breaker 10/10, god loop running with PTA enforcement in container

### Wave 4: Remaining Firewalls as Layers (v2 scope)

**Owner:** 1 builder agent

| Layer | Est. LOC | What |
|---|---|---|
| `layers/config-lock.layer.json` | ~80 | CTX-01..14 as PTA layer |
| `layers/tool-permission.layer.json` | ~40 | Trident tool block as PTA layer |
| `layers/hash-as-proof.layer.json` | ~60 | Hash-as-proof detector as PTA layer |
| `layers/container-substitution.layer.json` | ~50 | Container substitution as PTA layer |
| `layers/ship-evidence-gate.layer.json` | ~70 | Ship gate as PTA layer |

**Gate:** All layers load, dispatch, don't conflict (layer isolation test)

### Wave 5: Documentation + Package

**Owner:** Orchestrator

| File | What |
|---|---|
| `OPERATING_MANUAL.md` | Full install + configure + create-layers guide |
| `INSTALL.md` | Zero-to-enforcing quickstart |
| `package.json` | bun package shape |

## §4 TESTING STRATEGY

### The 4-tier ladder (same as PBA)

```
 Tier 1  BATTERY (unit)        Deterministic pins — intent classifier, chain tracker,
                               synapse λ-decay, state machine transitions, layer compilation,
                               PBA bridge signal handling
        Command: cd tests && bun test
        Proves: MECHANISM

 Tier 2  BUILD GATE            Bundle compiles, marker floors present, tsc 0
        Command: bun build && tsc --noEmit
        Proves: ARTIFACT

 Tier 3  CONTAINER             Real model + real tools + PTA enforcement live
                               The model calls tools, PTA classifies intent,
                               enforcement fires at the correct tier
        Command: trident-container-test (the full protocol)
        Proves: SYSTEM

 Tier 4  HOST                  Production ground — PTA enforcing real tool chains
                               on the host codebase, PBA bridge live
        Command: deploy + drive
        Proves: PRODUCT
```

### Unit test fixtures (per layer)

Every layer gets 3 fixture types (same as PBA's member testing):

```typescript
// (a) Minimal pairs — the same tool call is legitimate or violation depending on context
test('smoke-substitution: violation fires, pre-flight suppresses', () => {
  // Violation: bash("bun -e 'console.log(1)'") when PBA has TEST_EVASION active
  const violation = classifyIntent({
    toolCall: { toolName: 'bash', args: { command: 'bun -e "console.log(1)"' } },
    chainContext: { previousTools: [], chainViolations: ['verification-requires-container-test'] },
    pbaContext: { activeFamilies: ['TEST_EVASION'], latestSignals: [teSignal], macroTier: 1 },
  }, smokeLayer);
  expect(violation.confidence).toBeGreaterThan(0.5);

  // Pre-flight: same bash call but PBA is clean and container-test was already called
  const preflight = classifyIntent({
    toolCall: { toolName: 'bash', args: { command: 'bun -e "console.log(1)"' } },
    chainContext: { previousTools: ['trident-container-test'], chainViolations: [] },
    pbaContext: { activeFamilies: [], latestSignals: [], macroTier: 0 },
  }, smokeLayer);
  expect(preflight.confidence).toBeLessThan(0.3);
});

// (b) Chain rule evaluation — prerequisite missing vs present
test('chain rule: missing prerequisite fires', () => {
  const violations = chainTracker.evaluateRules(
    sessionId, 'bash', { command: 'bun test' },
    [verificationRequiresAuditRule],
  );
  expect(violations).toHaveLength(1);
  expect(violations[0].violationType).toBe('MISSING_PREREQUISITE');
});

// (c) PBA bridge — signal reception and boost
test('PBA bridge: TEST_EVASION signal boosts SMOKE_SUBSTITUTION', () => {
  pbaBridge.onPbaSignal({ family: 'TEST_EVASION', confidence: 0.75, ... });
  const activeFamilies = pbaBridge.getActiveFamilies(sessionId);
  expect(activeFamilies).toContain('TEST_EVASION');
  // The layer's confidence should be boosted when PBA has this family active
});
```

### Container test scenarios

| Scenario | Prompt | passToken | failToken |
|---|---|---|---|
| S1: Soft enforcement fires | Model calls bash with inline-exec instead of the audit tool | PTA tier-1 advisory text in tool result | Old static SSTF text |
| S2: PBA bridge disambiguates | Model calls ambiguous tool with PBA TEST_EVASION active | Intent confidence higher with PBA context | Same confidence without PBA |
| S3: Chain rule enforcement | Model calls task without first calling wave-manager | CHAIN_BREAK violation in ledger | No violation logged |
| S4: Escalation to tier 3 | Model repeatedly calls wrong tool despite advisories | StructuredEnforcementError in tool result | Tool call succeeds (no block) |
| S5: Hard kick (tier 4) | Model continues after tier 3 denial | [PTA ENFORCER] in chat.message | No chat message sent |
| S6: Compliance reset | Model calls demanded tool + produces artifact | COMPLIANCE_VERIFIED, both engines reset | No reset |

## §5 ANTI-PATTERNS AGAINST FALSE SUCCESS

### AP-1: The dumb firewall trap

**Failure mode:** PTA degenerates into a static pattern matcher (what the current firewalls are) — matching tool names without classifying intent.

**Symptom:** Over-blocking on legitimate usage (a `bun -e` during pre-flight gets blocked like a substitution).

**Prevention:** The 3-source intent classifier MUST consider PBA context and chain context, not just the tool match. The fusion weights (tool 0.5, chain 0.3, PBA 0.2) prevent any single source from dominating. If PBA is disabled, the chain context alone (0.3 weight) must still distinguish pre-flight from substitution.

### AP-2: The escalation amnesia trap

**Failure mode:** PTA resets to tier 0 on every session/restart, forgetting the model's history of violations.

**Symptom:** A model that was at tier 4 yesterday starts at tier 0 today.

**Prevention:** Per-sid persistence (`pta-state-<sid>.json` with escalationCount) + the same loadOrFresh fail-closed pattern PBA uses. The escalationCount survives restarts.

### AP-3: The bridge dependency trap

**Failure mode:** PTA becomes dependent on PBA — if PBA is disabled or not wired, PTA doesn't work.

**Symptom:** No enforcement when pbaBridge.enabled = false.

**Prevention:** PTA works standalone (the tool match source alone provides classification, just with lower accuracy for ambiguous calls). The PBA bridge is a BOOST, not a dependency. Test suite includes standalone-mode tests.

### AP-4: The layer conflict trap

**Failure mode:** Two layers match the same tool call and both fire, producing contradictory enforcement (one says "use tool A", the other says "use tool B").

**Symptom:** Model receives two conflicting advisories on the same tool call.

**Prevention:** The intent classifier returns ONE classification per tool call (the highest-confidence layer wins). If two layers have similar confidence, the higher severity wins. Layer priority is deterministic.

### AP-5: The chain false-positive trap

**Failure mode:** A chain rule fires when the prerequisite was actually called (e.g., the model called trident-code-audit 10 minutes ago, but the chain rule's withinMs is 5 minutes).

**Symptom:** CHAIN_BREAK violation for a satisfied prerequisite.

**Prevention:** Chain rule withinMs defaults to session-start (not a short window). The 30-min guide template warns against short withinMs values. Chain rule tests include both the satisfied and unsatisfied prerequisite cases.

### AP-6: The behavioral directive overuse trap

**Failure mode:** PTA sends chat.message directives too frequently, drowning the model and the user in enforcement messages.

**Symptom:** Multiple [PTA BEHAVIORAL CORRECTION] messages per session.

**Prevention:** The chat.message surface fires ONLY at tier 4 (after tiers 1-3 have been exhausted). The escalation from tier 3 to 4 requires the deadline+debounce to pass (same 5/2/0 compression as PBA). The refractory period (25 seq) prevents consecutive fires. Expected rate: < 5% of enforcement events reach tier 4. The tier-4 directive is a behavioral catalyst — it changes the model's context to force a behavior change, never to remove its ability to work.

### AP-7: The theatrical compliance trap

**Failure mode:** Model calls the demanded tool with minimal args (e.g., `trident-code-audit` with no target path) to trigger COMPLIANCE_VERIFIED without doing real work.

**Symptom:** COMPLIANCE_VERIFIED fires but no artifact is produced.

**Prevention:** The gate engine checks for an ARTIFACT (exitCode 0 + output matching verificationPatterns), not just exitCode 0. Minimum comply (exitCode 0 but no artifact) gets probation, not a clean slate. This is the same genuine/minimum split PBA proved.

### AP-8: The lockout trap

**Failure mode:** Tier 4 is implemented as "all tools blocked until compliance" — bricking the agent's ability to work.

**Symptom:** The model cannot call ANY tool (including read/grep/glob) after reaching tier 4.

**Prevention:** Tier 4 gates T.E.B. to pass ONLY the demanded tool + escape hatches (read, grep, glob, remediationTools). Everything NOT matching the violating layer's toolMatchers continues to work normally. The demanded tool ALWAYS passes — the model can comply at any moment. The state machine tracks compliance automatically — the moment the model calls the demanded tool with an artifact, everything resets. The point is behavior change through directed enforcement, never permission removal. **The agent loop is NEVER killed. Normal execution is NEVER bricked.**

### AP-9: The ignorable correction trap

**Failure mode:** Correction warheads are vague enough that the model reads them and continues the same behavior ("be careful about tool usage" — not actionable).

**Symptom:** Model receives tier 1 correction, continues same pattern, escalates to tier 3 immediately.

**Prevention:** Every correction warhead must follow the warhead writing skill standard: DETECTED (what specifically), WHY THIS FIRED (the 3 sources), WHAT THIS MEANS (behavioral consequence), CORRECT BEHAVIOR (specific tool + what it produces), SELF-CHECK (questions the model answers), RESET PATH (how to clear enforcement). A correction without ALL 6 sections is not a behavior program and will not change behavior. Generic warnings are BANNED.

## §6 SUCCESS CRITERIA

### SC-1: Core machinery builds and tests pass

**Pass condition:** `tsc --noEmit` = 0 errors, `bun test` = all pass (intent classifier, chain tracker, bridge, state machine, synapse, gates, collector, engine)
**Verification:** Command outputs pasted

### SC-2: SSTF replaced by a PTA layer

**Pass condition:** `layers/sstf-smoke-substitution.layer.json` loads, dispatches tier-1 advisory on a smoke-substitution tool call, dispatches tier-4 chat.message after repeated violations
**Verification:** Unit test output showing tier escalation + container test showing live enforcement

### SC-3: Audit tool enforcement (the operator's example)

**Pass condition:** `layers/audit-tool-required.layer.json` fires when a verification task doesn't call `trident-code-audit`
**Verification:** Unit test + container test with a model attempting to verify without the audit tool

### SC-4: PBA bridge works (flow-through verified)

**Pass condition:** PBA signal arrives → PTA bridge receives → intent confidence increases for matching layer → pre-arming activates
**Verification:** Unit test showing confidence delta with/without PBA context

### SC-5: Chain rules work (multi-tool sequences)

**Pass condition:** ChainTracker detects missing prerequisite (task without wave-manager) and fires the correct layer
**Verification:** Unit test + container test

### SC-6: Escalation works (tier 0-4 with compression)

**Pass condition:** Repeated violations escalate through tiers with the correct deadline compression (5/2/0) and skip-tier (≥2→t2, ≥3→t3)
**Verification:** Unit test asserting the escalate transition's deadline arithmetic

### SC-7: Compliance works (genuine vs minimum)

**Pass condition:** Demanded tool called + artifact produced → clean slate; tool called but no artifact → probation
**Verification:** Unit test asserting the comply transition's genuine/minimum split

### SC-8: God loop integration (PBA + PTA as building blocks)

**Pass condition:** God loop runs with PTA layers active — phase transitions activate/deactivate the correct layers, enforcement fires when the model uses wrong tools during a phase
**Verification:** Container test showing phase-aware enforcement

### SC-9: 30-minute layer creation (the programming surface test)

**Pass condition:** A new layer can be created, registered, and enforcing in under 30 minutes by someone who has never used PTA before (following layers/_guide.md)
**Verification:** A tester creates a new layer from scratch, unit test passes

### SC-10: All 7 firewalls replaceable

**Pass condition:** Each of the 7 current firewalls (SSTF, config lock, tool block, poseidon permissions, hash-as-proof, container substitution, ship gate) has a corresponding PTA layer that provides equivalent-or-better enforcement
**Verification:** Side-by-side comparison: each layer's test passes against the same fixtures the original firewall was tested with

## §7 COMPACTION-PROOF IMPLEMENTATION GUIDE

### Docs to maintain

1. THIS SPEC — the design authority for PTA
2. `OPERATING_MANUAL.md` — the adopter guide (install, configure, create layers)
3. `layers/_guide.md` — the 30-minute layer creation walkthrough
4. `layers/_template.json` — the template with all fields documented
5. The PTA ledger (`pta-ledger.jsonl`) — the enforcement audit trail

### Resume anchors

1. THIS SPEC's §3 (implementation order — which wave is next)
2. `tsc --noEmit` → 0 (the build is clean)
3. `cd tests && bun test` → all pass (the battery is green)
4. `ls layers/*.layer.json` → the layers that exist and are registered
5. The PBA boilerplate at `Paragon_V2_Behavior_Algorithms/` — the sibling (PTA mirrors its architecture)

### Cross-consistency rules

- PTA's synapse thresholds are per-layer (in layer JSON), NOT global — each layer calibrates independently
- PTA's state machine is per-session, NOT per-layer — all layers share the same enforcement tier (the highest-confidence layer drives the tier)
- The PBA bridge is one-directional — PBA → PTA only, never the reverse
- The escape hatches are global (per ToolChainModule), NOT per-layer — read/grep/glob always pass
- Layer conflicts resolved by highest confidence → highest severity → first registered (deterministic priority)
- The hard surface (chat.message) fires ONLY at tier 4 — never below

### Do-not-touch

- `core/synapse.ts` — pure math, identical to PBA (frozen)
- `core/machine.ts` — the 8-transition lattice (frozen after Wave 1 verification)
- The PBA boilerplate's `core/` — PTA mirrors it but never imports from it (clean separation)

## §8 FINAL NOTES / OPEN QUESTIONS

### OQ-1: Should PTA share state with PBA's persistence files?

**Current design:** Separate files (`pta-state-<sid>.json` vs `machine-state-<sid>.json`).
**Alternative:** Shared persistence (one file per session for both engines).

**Recommendation:** Separate for v1 (clean separation, each engine evolves independently). Shared state is a v2 optimization if the file I/O becomes a bottleneck. The bridge provides in-memory sharing which is sufficient for real-time enforcement.

### OQ-2: Should the hard surface (chat.message) be visible to the user?

**Current design:** Yes — the chat message appears in the user's chat stream (like Poseidon enforcer's kick).
**Alternative:** System-level message (model sees it, user doesn't).

**Recommendation:** Visible (current design). The operator should see when enforcement escalates to tier 4 — it's accountability. The Poseidon enforcer's kick is visible and that's proven. If noise becomes a problem, add a `visible: boolean` config to the hard surface.

### OQ-3: Should PTA support custom TypeScript layers alongside JSON layers?

**Current design:** JSON layers only (for the 30-min story). The TS escape hatch is v2.

**Recommendation:** Keep JSON-only for v1. The 10% of layers that need code (like SSTF's semantic content validation) can use the `verificationPatterns` field in compliance config as a bridge. Full TS layers in v2 when the need is proven.

### OQ-4: How should PTA handle multi-session enforcement (concurrent agents)?

**Current design:** Per-sid isolation (each session has its own state, synapse, chain tracker).

**Recommendation:** Per-sid is correct for v1. The use case for cross-session enforcement (e.g., "no agent should be editing this file while another is") is valid but complex — defer to v2 with a global chain tracker that watches all sessions' tool calls for file-level conflicts.

### OQ-5: What is the performance budget for the intent classifier?

**Current design:** No explicit budget. The classifier runs on EVERY tool call (3 regex banks + chain evaluation + PBA bridge query).

**Recommendation:** Target < 5ms per tool call (the SSTF_V4 spec's budget for its regex+lookup path was < 5ms). The 4-bank regex scoring is O(patterns × text-length) — with ~20 patterns per bank and ~500-char tool call text, this is sub-millisecond. The chain tracker is O(call-history-length) with a 100-call cap. The PBA bridge query is O(1) (ring buffer lookup). Total: well under 5ms. Add a performance test in Wave 1.

## §9 THE V1/V2/V3 ROADMAP

### V1: PTA as a substrate platform for complex systems (god loop is first proof)

**What it is:** The PTA boilerplate with core machinery + layer system + the god-loop layer set. The god loop runs with PTA as its enforcement building blocks.

**Deliverable:**
- `Paragon_V3_Tool-Chain_Algorithms/` — the boilerplate
- Core machinery (~2500L TypeScript across core/ + actuation/ + capture/ + hooks/)
- Layer system (config loader + template + guide)
- God loop layers (8 phase-specific layers)
- Container test proving the god loop with PTA enforcement

**Timeline:** 3 waves (core engine → layer system → god loop integration) ≈ 3 sessions

### V2: PTA embedded with the full layer list (replacing all 7 firewalls)

**What it is:** PTA wired directly into the Trident codebase with ALL current tool firewalls replaced as PTA layers. The inline firewalls are deleted.

**Deliverable:**
- All 7 firewall layers (SSTF, config lock, tool block, poseidon permissions, hash-as-proof, container substitution, ship gate)
- TypeScript escape hatch for complex layers
- PBA bridge wired to the live PBA engine on the host
- The old firewall code paths deleted (SSTF 1280L + config lock 848L + enforcer 434L + others)
- Container + host validation proving each layer

**Timeline:** 2 waves after V1 (remaining layers + validation) ≈ 2 sessions

### V3: The PTA config sentinel (natural language layer creation)

**What it is:** An agent that configures V1 + V2 systems via natural language. You describe what you want enforced, it asks specific questions, generates the layer JSON, registers it, and tests it.

**The target interaction:**
```
User: "I want to prevent the model from writing to the dist/ folder directly."
Sentinel: "Should the model be able to read from dist/? → yes"
Sentinel: "What tool should the model use instead? → the build system"
Sentinel: "Are there any exceptions? → during deployment only"
Sentinel: [generates layers/dist-write-lock.layer.json, registers, tests]
Sentinel: "Layer created. Enforcement is live."
```

**What it needs:**
- Full knowledge of the PTA layer schema and the layer creation process
- A question protocol (the specific set of questions that extract all needed data)
- The layer JSON generator (natural language → structured JSON)
- The test generator (minimal pair + chain rule + PBA boost tests)
- Guarded against creating broken or conflicting layers (validation before registration)

**Timeline:** After V2 is proven (the sentinel needs to know what it's configuring)

## APPENDIX A — ZERO-TRUST AUDIT

### Audit findings table

| # | Severity | Finding | Surgical edit applied |
|---|---|---|---|
| 1 | LOW | The spec uses "~" line estimates for files that don't exist yet | Estimates are clearly marked with "~" — acceptable for a design spec (actuals will differ) |
| 2 | LOW | The fusion weights (0.5/0.3/0.2) are initial values without empirical calibration | Marked as initial design values — will be tuned after Wave 1 container testing. The weights are in one place (the fusion function) so tuning is a one-line change. |
| 3 | LOW | The chain tracker's 100-call history cap is arbitrary | 100 is sufficient for most workflows (even the god loop's full cycle is ~20-30 tool calls). Configurable via PtaSessionState if needed. |
| 4 | INFO | The god loop integration assumes the god loop exists as designed in v4.4.3 | The operator confirmed: the god loop stays as designed, PTA provides the enforcement building blocks. The spec's §2.13 reflects this. |
| 5 | INFO | The 7 firewalls → layers mapping assumes the current firewall LOC (which may have drifted) | LOC values are from the explore wave's verified measurements. Minor drift is acceptable for the comparison table. |

### Verdict

**5 findings: 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW, 2 INFO. No unresolvable gaps.**

The spec is implementable as written. The 3 LOW findings are initial design values that will be tuned empirically during Wave 1 testing — none are blockers.

---

<!-- DOC-COMPLETE -->
<!-- PTA v1.0 · 2026-08-31 · The sibling machinery to PBA for tool execution + model action policing -->
<!-- PBA = reasoning tokens + model intent policing (macro) | PTA = tool execution + model action policing (micro) -->
<!-- Together: the Paragon Enforcement OS -->

