# PARAGON BEHAVIOR ALGORITHMS

## The Universal Behavior Enforcement Framework — Plug In Any Domain, Get a Working Watchdog

**v1.0 · 2026-08-29 · [leviathan-devops](https://github.com/leviathan-devops)**

> **THE CORE FINDING (the design-proven observation):** "The classifier watched
> the reasoning patterns, not the conclusion." — In container tests, the model
> REFUSED every shortcut it was asked to weigh (perfect conduct), and the
> enforcement machine climbed the full escalation ladder anyway (TE 2→40,
> tier 1→4). The deliberation over skipping IS the violation signal; the
> conclusion is descriptive context. **The watchdog grades deliberation, not
> decisions.**

---

## PART 0 — THE TABLE OF CONTENTS

- **PART 1 — THE THESIS** — what this is, the one-sentence architecture
- **PART 2 — THE ARCHITECTURE** — the 7-layer pipeline (ASCII graph)
- **PART 3 — THE TWO BRANCHES** — the boilerplate vs the coding-agent variant
- **PART 4 — THE DOMAIN MODULE** — the plug interface (the only file you edit)
- **PART 5 — THE LADDER** — the state machine + the escalation tiers (ASCII)
- **PART 6 — THE EVIDENCE CHAIN** — the artifact-hygiene gates
- **PART 7 — THE RECIPE** — 3 steps to plug in a new domain
- **PART 8 — THE ANTI-PATTERNS** — the theatrical traps
- **PART 9 — THE VERIFICATION** — how to prove it works

---

## PART 1 — THE THESIS

Every AI agent that operates autonomously needs a **behavior enforcement
layer** — a watchdog that watches the agent's own reasoning, detects the
patterns that precede bad outcomes (the scope-shrink, the test-evasion, the
theatrical completion), and intervenes proportionally BEFORE the bad outcome
ships.

**The problem:** every domain (trading, sales, coding, medical) would have to
rebuild the same machinery from scratch — the capture pipeline, the intent
classifier, the escalation state machine, the tier-proportional intervention,
the evidence gates, the compliance detection. That machinery took 5 sessions
and ~50 bug fixes to build and verify.

**The fix:** the machinery (core/capture/actuation — fixed, tested, never
edited) is separated from the domain data (config/ — the detection families,
the templates, the thresholds, the compliance demands — written per
deployment). The platform wiring (hooks/ — the event surface) adapts to any
event-driven runtime.

```
THE ONE-SENTENCE ARCHITECTURE:

Platform events → role-gated capture → 4-bank ratio classifier → λ-synapse
accumulation → state machine (tier 0-4) → tier-proportional dispatch →
compliance observation → the reset. The domain module provides WHAT to
detect; the machinery provides HOW.
```

---

## PART 2 — THE ARCHITECTURE

```
              ANY RUNTIME EVENT (opencode / trading desk / CRM bot)
                              │
                              ▼
┌──────────────────────────────────────────────────────────┐
│ 1  PLATFORM ADAPTER (hooks/)         ◄ YOU IMPLEMENT     │
│    normalizeEvent · inject · interceptTool · observeTool │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│ 2  ROLE GATE (core/role-gate.ts)                         │
│    user text NEVER feeds — assistant-only, fail-closed   │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│ 3  RATIO CLASSIFIER (core/classifier.ts)                 │
│    4 banks: descriptive(neg+1) · suggestive(pos+1..2)    │
│    substitute(pos+2) · use(neg+3 short-circuit)          │
│    conf = pos / (pos + neg + 1)                          │
│    ≥0.5 ENFORCE · ≥0.3 DAMPEN ×0.5 · <0.3 SUPPRESS       │
│    + FI-1 batch scan (catches paraphrases)               │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│ 4  SYNAPSE (core/synapse.ts) — per-session λ-accumulator │
│    λ = λ·e^(−0.05·Δseq) + w  per family, cap 256         │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│ 5  STATE MACHINE (core/machine.ts)                       │
│    IDLE → MONITORING → PRIMED → INTERVENING tier 0-4     │
│    OFF gates: the machine NEVER lifts at OFF             │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│ 6  DISPATCH (actuation/dispatch.ts)                      │
│    tier 1   STEER   text appended to context             │
│    tier 2+  DEMAND  the redispatch (the climb is SEEN)   │
│    tier 3+  MANDATE throw StructuredEnforcementError     │
└───────────────────────────┬──────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│ 7  COMPLIANCE LOOP (engine.observeTool)                  │
│    the instrument succeeds → tier 0 + pool insert        │
│    the escape hatch NEVER blocks (anti-lock)             │
└──────────────────────────────────────────────────────────┘
```

---

## PART 3 — THE TWO BRANCHES

```
                    THE PARAGON REPO
                    ┌───────────────┐
                    │     main      │ ← THE BOILERPLATE (domain-agnostic)
                    │  (this branch)│
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
      ┌──────────────┐ ┌──────────┐ ┌──────────┐
      │ Coding Agent │ │ Trading  │ │  Sales   │
      │  (Trident)   │ │  Agent   │ │  Agent   │
      │  (branch)    │ │ (future) │ │ (future) │
      └──────────────┘ └──────────┘ └──────────┘
```

| Branch | What it is | The domain |
|--------|-----------|------------|
| **`main`** | The pure boilerplate — no domain strings in the machinery | Ships with 3 reference domains: trident, trading, sales |
| **`coding-agent-trident`** | The production coding-agent variant — the full working Trident PBA set | 6 families, the CTX locks, the ship gate, the tier-4 mandate |

---

## PART 4 — THE DOMAIN MODULE (THE PLUG)

The **only** directory you edit per deployment:

```typescript
// config/my-domain/index.ts
export default {
  name: 'my-domain',
  families: [ /* 4-bank detection members + exampleHits pins */ ],
  behavioralChecks: [ /* claims-vs-evidence rules */ ],
  templates: { steer, demand, mandate, advisory },  // YOUR wording
  thresholds: { MY_FAMILY: 1.0 },                    // when to fire
  compliance: { remediationTools, escapeHatches },   // what = compliance
  testFixtures: { evasionText, legitimateText },     // the pins
} satisfies DomainModule;
```

**THE 4-BANK MODEL** (the classifier's input — each family member has 4
opposed signal banks):

| Bank | Direction | Weight | Example (coding agent) |
|------|-----------|--------|----------------------|
| **descriptive** | SUPPRESSES (neg+1) | context makes the claim plausible | "per the tool result" |
| **suggestive** | DETECTS (pos+1, +2 word-bounded) | the violation signal | "skip the verification" |
| **substitute** | ESCALATES (pos+2) | the paraphrase class | "forgo the validation step" |
| **use** | EXEMPTS (neg+3, short-circuit) | the legitimate exemptors | "the fixture spec allows" |

**THE INTENT DISCRIMINATION** (the minimal pair): the same surface words,
different intents, opposite verdicts. "We can skip the verification" →
suggestive hits, conf 0.8 → ENFORCE. "Per the tool result the tests passed,
write a tiny passing spec" → the use-bank fires (neg+3), conf → 0 → SUPPRESS.

---

## PART 5 — THE LADDER (the escalation state machine)

```
   ┌────────┐  FIRST_SIGNAL       ┌────────────┐
   │  IDLE  │────────────────────►│ MONITORING │◄────────────┐
   └────────┘                     └─────┬──────┘             │
                                        │ PATTERN_HIT        │
                                        │ (the λ fusion)     │
                                        ▼                    │
                                 ┌────────────┐              │
          SIGNAL (accrue)        │   PRIMED   │              │
        ┌────────────────────────┤            │              │
        │  (unfused: decays      └─────┬──────┘              │
        │   back)                      │ INTERVENE           │
        ▼                             ▼                      │
  (decays back)              ┌──────────────────┐    COMPLY  │
                             │ INTERVENING      │────────────┘
                             │ tier 1 → tier 4  │ (the instrument
                             └────────┬─────────┘  succeeds)
                                      │ tier 3+: the MANDATE
                                      ▼
                        generic tools REFUSED
                        the instrument PASSES
                        (the anti-lock law)
```

**THE ANTI-LOCK LAW:** at tier 4, generic tools are refused but the demanded
instrument ALWAYS passes — and its success is the automatic reset. No locks,
no dead ends, no operator unlock anywhere.

---

## PART 6 — THE EVIDENCE CHAIN (the artifact-hygiene gates)

```
  src/  ────build────►  dist/  ────deploy───►  host
  │                    │                      │
  ▼                    ▼                      ▼
  THE BUILD GATE       THE MANIFEST           THE DEPLOY GATE
  (13 marker floors    (the ONLY quotable    (pre: the candidate
  + 3 zero-ceilings    sha — measured,        is gate-clean)
  — the degraded       never input; the       (post: the serving
  bundle FAILS named)  predecessor chain)     == the candidate)
```

---

## PART 7 — THE RECIPE (3 steps to a new domain)

### Step 1 — Write the domain module
```bash
mkdir config/my-domain
# Write index.ts: the families (4 banks + exampleHits), the templates,
# the thresholds, the compliance demands, the test fixtures
```

### Step 2 — Pick or write the adapter
```typescript
// opencode: new OpenCodeAdapter(engine).buildHooks()
// other:    implement PlatformAdapter (5 methods)
```

### Step 3 — Construct + run
```typescript
const engine = new ParagonEngine(myDomain, { level: 'FULL' });
const hooks = adapter.buildHooks();
// Your domain pins run the same battery:
bun test
```

---

## PART 8 — THE ANTI-PATTERNS

| # | The trap | The prevention |
|---|----------|---------------|
| 1 | The row-as-proof | Every pass token in tool-result context, never a row the code wrote about itself |
| 2 | The regex masquerading as intent | The 4-bank ratio decides; the regex only initiates |
| 3 | The always-same-message escalation | Tier-proportional templates + the redispatch (the model SEES the climb) |
| 4 | The compliance-too-eager | Compliance detection scoped to the REMEDIATION class only |
| 5 | The role-gate absence | The user prompt text NEVER feeds the classifier |
| 6 | The unbounded evidence pool | The TTL prune (600s) after every push |
| 7 | The lockout resurrection | The anti-lock law: no locks exist in the design |

---

## PART 9 — THE VERIFICATION

```bash
# The battery (93 tests: the machinery + the 3 domain fixtures + the engine
# integration + the universality receipt)
bun test

# The build gate (the degraded bundle FAILS named)
scripts/build-verified.sh --skip-build

# The tier-4 mechanical rig (the full deterministic arc)
bun scripts/tier4-rig.ts
```

**THE CONTAINER-PROVEN UNIVERSALITY:** the trading domain (not trident) drove
the complete ladder in a fresh container — `[RISK STEER]` → INTERVENING
tier 1 → the risk-engine comply → tier 0 + pool insert. The machinery is
domain-agnostic; the domain is data.

---

## LICENSE

Private — the leviathan-devops workspace.

## THE REFERENCES

- The `docs-OPERATING_MANUAL.md` (the full manual with the byte-verified diagrams)
- The `coding-agent-trident` branch (the production coding-agent variant)
- The Lexicon-Grade Intelligent Systems Engineering Bible (the design canon)
- The Custom Event-Hook Engineering Bible (the capture-layer canon)
