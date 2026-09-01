# PARAGON V2 — BEHAVIOR ALGORITHMS

The universal behavior enforcement boilerplate. Plug in a domain module (what to detect,
how to respond) + a platform adapter (the event surface) = a working enforcement stack.

## QUICK START — 5 STEPS

### 1. Pick a domain (or write your own)

Each domain is a directory under `config/` with an `index.ts` that exports a `DomainModule`:

```typescript
import type { DomainModule } from '../../core/types.js';

const myDomain: DomainModule = {
  name: 'my-domain',
  families: [ /* your detection families (4 banks each) */ ],
  behavioralChecks: [ /* your domain checks */ ],
  templates: {
    steer: (families, anchor) => `[MY-DOMAIN STEER] ${families}. (${anchor})`,
    demand: (families, anchor) => `[MY-DOMAIN DEMAND] ${families}. (${anchor})`,
    mandate: (tier) => `[MY-DOMAIN MANDATE] tier ${tier}.`,
    advisory: (id, summary) => `[MY-DOMAIN PATTERN] ${id}: ${summary}.`,
  },
  thresholds: { MY_FAMILY: 1.0 },
  compliance: {
    remediationTools: ['my-instrument'],
    verificationPatterns: [/my.?verify/i],
    escapeHatches: ['my-instrument'],
  },
  macroPatterns: [],
  testFixtures: { evasionText: '...', legitimateText: '...' },
};

export default myDomain;
```

### 2. Construct the engine (the integration spine)

```typescript
import { ParagonEngine, OpenCodeAdapter, tradingDomain } from './index.js';

// The engine composes: role gate → classifier → synapse → machine → gates → dispatch
const engine = new ParagonEngine(tradingDomain, { level: 'FULL' });

// The opencode adapter binds the hook surfaces (event, messages.transform,
// tool.execute.before/after) — or implement PlatformAdapter for your runtime.
const adapter = new OpenCodeAdapter(engine);
const hooks = adapter.buildHooks();
```

The engine's surface:
- `engine.handleEvent(rawEvent)` — the capture entry (the role gate built in)
- `engine.observeText(text, sid, plane)` — direct text feed
- `engine.tryIntervene(sid, surface, attach)` — the dispatch attempt (call from
  messages.transform and tool.before — the PRIMED window is per-batch)
- `engine.interceptTool(sid, tool, args)` — the tier≥3 deny (the escape hatch
  never blocks)
- `engine.observeTool(sid, tool, args, exitCode)` — the compliance observation
  (the remediation success closes the loop: tier 0 + the pool insert)

### 3. Run the tests

```bash
bun test   # 93 tests: the machinery pins + the 3 domain fixtures + the
           # engine integration + the trading/sales universality receipt
```

### 4. Deploy

Copy the built dist to your platform's plugin path and restart.

### 5. Observe

The enforcement ledger (JSONL) tracks every signal, every intervention, every compliance
event. The boot traces record the dial state. The grading law: MECHANICAL > OBSERVED > prose.

## THE ARCHITECTURE

```
DomainModule (WHAT to detect)
  ↓
┌── RoleGate (assistant-only) ──────────────────────────────────┐
│ ├── reasoning plane (the native reasoning parts)              │
│ ├── text-think plane (tagged + tagless text)                  │
│ └── tool-cadence plane (the tool ring)                        │
└────────────────────┬──────────────────────────────────────────┘
                     ▼
┌── CLASSIFIER (the 4-bank ratio) ──────────────────────────────┐
│  scoreSignals → pos/(pos+neg+1)                               │
│  ≥0.5 → PASS · ≥0.3 → DAMPEN · <0.3 → SUPPRESS              │
│  + FI-1 batch scan (the paraphrase class)                     │
└────────────────────┬──────────────────────────────────────────┘
                     ▼
┌── SYNAPSE (per-session λ decay) ──────────────────────────────┐
│  per-family fire thresholds · refractory 25 seq               │
└────────────────────┬──────────────────────────────────────────┘
                     ▼
┌── STATE MACHINE (IDLE→MON→PRIMED→INT, tier 0-4) ──────────────┐
│  OFF gates on observe/accumulate · compliance-gated cool      │
│  deadline+debounce escalation · tier-proportional templates   │
└────────────────────┬──────────────────────────────────────────┘
                     ▼
┌── ACTUATION ─────────────────────────────────────────────────┐
│  STEER (tier 1) → DEMAND (tier 2) → DENY (tier 3)           │
│  → MANDATE (tier 4) → the instrument → comply → reset       │
└──────────────────────────────────────────────────────────────┘
```

## THE REFERENCE DOMAINS

| Domain | Families | Checks | Location |
|--------|----------|--------|----------|
| trident | test-evasion, forgery, doubt-hedge, permission-gate | claim-evidence-gap, completion-without-verification | `config/trident/` |
| trading | risk-limit, stop-loss, disclosure-skip | risk-limit-entry, stop-loss-presence | `config/trading/` |
| sales | claim-fabrication, compliance-breach, follow-up-evasion | pipeline-integrity, promise-compliance | `config/sales/` |

Each domain has: the families (4 banks each), the behavioral checks, the templates
(STEER/DEMAND/MANDATE/ADVISORY), the thresholds, the compliance demands, and the macro
patterns. Copy one as a starting point and adapt for your domain.

## THE INTERFACE CONTRACTS

See `PARAGON_V2_BOILERPLATE_L2_SPEC.md` for the complete specification: every module's
TypeScript interface, every threshold's calibration, every anti-pattern, and the testing
strategy.
