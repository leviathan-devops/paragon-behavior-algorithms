# REPLICATION GUIDE — Paragon V3 Tool-Chain Algorithms

> Version: 1.0.0 · 2026-08-31 · Status: ACTIVE
> Package: paragon-v3-tool-chain-algorithms
> Specs: PTA_L2_SPEC.md 2.1-2.13 (2,441L) · PBA_PTA_MASTER_L1_SPEC.md 0-9 (1,410L) · index.ts (18L)
> Purpose: How to build PTA into any system — enterPhase, bridge, hooks, layers, MS composition, new layer creation

---

## Table of Contents

1. The enterPhase Pattern
2. Bridge Wiring — PBA to PTA
3. Hook Registration — T.E.A. / T.E.B. / chat.message
4. Layer JSON Schema — Every Field
5. Microstructure Composition — Assembling Engines
6. Creating a New Layer — Step by Step
7. Worked Example — Custom Tool-Chain Workflow from Scratch

---

## 1. The enterPhase Pattern

Source: PTA_L2_SPEC.md §2.13 + PBA_PTA_MASTER_L1_SPEC.md §6.

The enterPhase pattern activates/deactivates enforcement layers per phase. Each phase maps to one layer; entering a phase deactivates the previous layer and activates the new one. This is how the god loop (13 phases) uses PTA as its enforcement substrate — and how any phased system can adopt PTA.

### The Layer Set

```typescript
// Each phase of your system maps to a PTA layer JSON
const LAYER_SET: Record<string, string> = {
  INIT:           'layers/my-system/init.layer.json',
  PLAN:           'layers/my-system/plan-required.layer.json',
  BUILD:          'layers/my-system/build-tools.layer.json',
  VERIFY:         'layers/my-system/verify-required.layer.json',
  SHIP:           'layers/my-system/ship-evidence.layer.json',
  // Terminal phases — no enforcement
  // DONE and FAILED have no layers
};
```

For the god loop — PTA_L2_SPEC.md §2.13 — the full mapping is:

```typescript
const GOD_LOOP_LAYER_SET = {
  INIT:           'layers/god-loop/init.layer.json',
  AUDIT:          'layers/god-loop/audit-required.layer.json',
  SCORE:         'layers/god-loop/score-evidence.layer.json',
  DECIDE:        'layers/god-loop/decision-findings.layer.json',
  PLAN:          'layers/god-loop/plan-density.layer.json',
  DISPATCH:       'layers/god-loop/wave-dispatch.layer.json',
  COLLECT:        'layers/god-loop/collect-all.layer.json',
  VERIFY:         'layers/god-loop/battery-rerun.layer.json',
  AUDIT_RECHECK:  'layers/god-loop/incremental-audit.layer.json',
  PROBLEM_SOLVE:  'layers/god-loop/diagnosis-required.layer.json',
  CONTAINER_TEST: 'layers/god-loop/artifact-required.layer.json',
  // PASS and LOOP are terminals — no enforcement
};
```

### enterPhase Implementation

```typescript
import { loadLayer } from 'paragon-v3-tool-chain-algorithms/config';

let currentPhase: string | null = null;

function enterPhase(phase: string): void {
  // Deactivate previous phase layer
  if (currentPhase && LAYER_SET[currentPhase]) {
    pta.deactivateLayer(LAYER_SET[currentPhase]);
  }
  // Activate new phase layer
  const layerPath = LAYER_SET[phase];
  if (layerPath) {
    const layer = loadLayer(layerPath);
    pta.activateLayer(layer);
  }
  // Also update PBA family set per phase (if using bridge)
  if (pba) {
    pba.activateFamilySet(PBA_FAMILIES[phase] || []);
  }
  currentPhase = phase;
}
```

### Usage

```typescript
// System transitions through phases — enforcement follows
enterPhase('INIT');     // init layer active
// ... init work ...
enterPhase('PLAN');     // plan layer active, init layer deactivated
// ... plan work ...
enterPhase('BUILD');    // build layer active
// Wrong tool during BUILD -> PTA fires for build-phase violation
enterPhase('VERIFY');   // verify layer active
```

### Cross-Consistency Rules — PTA_L2_SPEC.md §7

- PTA synapse thresholds are per-layer (in layer JSON), NOT global — each layer calibrates independently
- PTA state machine is per-session, NOT per-layer — all layers share the same tier (highest-confidence drives tier)
- PBA bridge is one-directional PBA->PTA only, never reverse
- Escape hatches are global (per ToolChainModule), NOT per-layer
- Layer conflicts: highest confidence -> highest severity -> first registered (deterministic)
- Hard surface (chat.message) fires ONLY at tier 4, never below

---

## 2. Bridge Wiring — PBA to PTA

Source: PTA_L2_SPEC.md §2.5 + PBA_PTA_MASTER_L1_SPEC.md §5.

### The Wiring Code

```typescript
import { ParagonBehaviorEngine } from 'paragon-v2-behavior-algorithms';
import { ParagonToolEngine } from 'paragon-v3-tool-chain-algorithms';
import type { ToolChainModule } from 'paragon-v3-tool-chain-algorithms';

// 1. Create both engines — each with its own module
const pba = new ParagonBehaviorEngine(pbaDomain);
const pta = new ParagonToolEngine(ptaModule);

// 2. Wire the bridge — PBA -> PTA, one direction, never reverse
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
    lastWarheadBody: state.lastWarheadBody,
  });
});

// 3. Both engines run independently and async.
//    PTA doesn't wait for PBA — it uses PBA data as context when available.
//    If pbaBridge.enabled = false, PTA works standalone.
```

### What the Bridge Does — 3 Mechanisms

Mechanism 1 — Intent Disambiguation: PBA excerpt enriches 4-bank scan text blob.
Mechanism 2 — Predictive Pre-Arming: PBA fires -> matching layers get synapse boost (0.2).
Mechanism 3 — Escalation Correlation: correlateEscalation(ptaTier, pbaTier) -> max(ptaTier, pbaTier>=3?2 : pbaTier>=2?1 : 0).

### Configuration

```typescript
const ptaModule: ToolChainModule = {
  name: 'trident-toolchain',
  brandPrefix: 'PTA',
  layers: [...],
  chainRules: [],
  compliance: {
    escapeHatches: ['read', 'grep', 'glob'],
    remediationTools: ['trident-code-audit', 'trident-container-test'],
    verificationPatterns: [/container-test-results\.json/],
  },
  pbaBridge: {
    enabled: true,                          // false = standalone
    signalFilter: ['TEST_EVASION', 'FORGERY_INTENT'],  // undefined = all
    contextWindowSize: 20,                  // ring buffer per session
    confidenceBoost: 0.2,                   // per matching family, cap 1.0
  },
};
```

### Standalone (No PBA)

```typescript
const standalone: ToolChainModule = {
  name: 'standalone-enforcement',
  brandPrefix: 'PTA',
  layers: [myLayer],
  chainRules: [],
  compliance: {
    escapeHatches: ['read', 'grep', 'glob'],
    remediationTools: ['trident-container-test'],
    verificationPatterns: [/container-test-results\.json/],
  },
  pbaBridge: { enabled: false },
};
```

PTA works standalone. The bridge is a boost, not a dependency (AP-3). The suite includes standalone-mode coverage.

---

## 3. Hook Registration — T.E.A. / T.E.B. / chat.message

Source: PTA_L2_SPEC.md §2.6 + hooks/platform-adapter.ts, hooks/opencode-adapter.ts.

### PlatformAdapter Interface — hooks/platform-adapter.ts (~60L)

```typescript
interface PlatformAdapter {
  normalizeEvent(raw: unknown): PlatformEvent;
  inject(message: { type: string; content: string; sessionId: string }): void;
  interceptTool(event: PlatformEvent): ToolIntent | null;
  observeTool(event: PlatformEvent): void;
  observeCompletion(event: PlatformEvent): void;
}
interface PlatformEvent {
  toolName: string;
  args: Record<string, unknown>;
  sessionId: string;
  seq: number;
  output?: string;
  exitCode?: number;
}
```

### OpencodeAdapter — hooks/opencode-adapter.ts (~180L)

Wraps opencode hooks:

```typescript
import { OpencodeAdapter } from 'paragon-v3-tool-chain-algorithms/hooks/opencode-adapter';

const adapter = new OpencodeAdapter(pta);

// Wire to opencode hook system
hooks.on('tool.execute.before', async (event) => {
  const intent = adapter.interceptTool(event);
  // intent.action: ALLOW -> transit, ADVISE -> queue T.E.A., BLOCK -> throw
  if (intent && intent.action === 'BLOCK') {
    throw new StructuredEnforcementError({
      machine: 'pta',
      detected: `${intent.layerId} at tier ${intent.tier}`,
      correction: resolveWarhead(getLayer(intent.layerId), intent.tier, intent),
      evidenceRequired: true,
      tier: intent.tier,
    });
  }
  adapter.observeTool(event);
});

hooks.on('tool.execute.after', async (event) => {
  const queued = pta.getQueuedCorrection(event.sessionId);
  if (queued) {
    event.output = dispatchTea(queued.body, event.output);
  }
  adapter.observeCompletion(event);
});

hooks.on('chat.message', async (event) => {
  // Tier 4: PTA injects [PTA GATE] directive via adapter.inject()
  // The directive appears as a chat message the model must process
});
```

### MockAdapter — hooks/mock.ts (~80L) — For Harness

```typescript
import { MockAdapter } from 'paragon-v3-tool-chain-algorithms/hooks/mock';

const mock = new MockAdapter(pta);
// Simulate tool calls without opencode
mock.simulateToolCall({ toolName: 'bash', args: { command: 'bun -e "test"' }, sessionId: 'test-sid' });
const intent = mock.getLastIntent();
// intent.sources, intent.confidence, intent.tier available for assertions
```

### Hook Lifecycle

```
tool.call.started    -> ChainTracker.recordCall + PTA observeTool
tool.execute.before  -> IntentClassifier.classifyIntent -> Synapse.accumulate -> StateMachine.step -> tier -> ALLOW/ADVISE/BLOCK
                       BLOCK: throw StructuredEnforcementError (tool does not run)
                       ADVISE: queue T.E.A. correction
tool.call.completed  -> ChainTracker.recordResult + ComplianceCollector.measureCompliance
                       GateEngine.evaluateCompliance -> genuine/minimum/probation
tool.execute.after   -> if queued: dispatchTea (append correction to output)
chat.message         -> tier 4: adapter.inject([PTA GATE] directive) + T.E.B. gates
```

---

## 4. Layer JSON Schema — Every Field

Source: PTA_L2_SPEC.md §2.3 (ToolChainLayer) + layers/_template.json (38L) + config/loader.ts.

### ToolChainLayer

```typescript
interface ToolChainLayer {
  id: string;                    // Unique id, e.g. SMOKE_SUBSTITUTION
  description: string;           // Human-readable enforcement description
  toolMatchers: {                // WHICH tools this layer watches
    toolName: string | RegExp;   // Exact or regex: 'bash', /trident-.*/
    argPatterns?: Record<string, (string | RegExp)[]>;  // Narrow by args
  }[];
  banks: {                       // WHAT patterns to detect — 4 opposed banks
    descriptive: RegExp[];       // neg+1 — legitimate context (suppresses)
    suggestive: RegExp[];        // pos+1 (+2 word-bound) — violation pattern
    substitute: RegExp[];        // pos+2 — theatrical alternative
    use: RegExp[];               // neg+3 SHORT-CIRCUIT — sanctioned stops all
  };
  pbaContextBoost?: {            // PBA amplification
    families: string[];          // PBA families that boost this layer
    boostAmount: number;         // Default 0.2, cap 1.0
  };
  enforcement: {                 // WHAT to say per tier — warhead bodies
    tier1: string;               // T.E.A. correction
    tier2: string;               // T.E.A. escalated (count + deadline)
    tier3: string;               // T.E.B. block (throw)
    tier4: string;               // chat.message directive + T.E.B. gate
  };
  threshold: number;             // λ fire threshold, e.g. 0.9
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  chainRules?: ChainRule[];      // Layer-local chain rules
}
```

### ChainRule

```typescript
interface ChainRule {
  name: string; description: string;
  requires?: { tool: string | RegExp; args?: Record<string, string | RegExp>; withinMs?: number }[];
  forbids?: { tool: string | RegExp; withinMs?: number }[];
  violation: { layerId: string; customMessage?: string };
}
```

### Fill Fields in Enforcement Texts — PTA_L2_SPEC.md §2.7

| Field | Source | Example |
|-------|--------|---------|
| {count} | Per-layer dispatch count | "7 times" |
| {toolName} | Tool called | "bash" |
| {args} | Tool args (JSON) | {"command": "bun test"} |
| {chainViolations} | Violated chain rules | "verification-requires-audit" |
| {pbaFamilies} | Active PBA families | "TEST_EVASION" |
| {pbaTier} | PBA tier 0-4 | "3" |
| {escalationCount} | Lifetime escalations | "7" |
| {anchor} | Audit trail ref | "(pta:SMOKE:1693487400000)" |

### Bank Weights and Bands

| Bank | Weight | Role |
|------|--------|------|
| descriptive | neg+1 | Legitimate context — suppresses detection |
| suggestive | pos+1 (+2 word-bound) | Violation pattern |
| substitute | pos+2 | Theatrical alternative |
| use | neg+3 SHORT-CIRCUIT | Sanctioned — stops all scoring, SUPPRESS |

confidence = pos / (pos + neg + 1). ENFORCE >= 0.5, DAMPEN >= 0.3 (x0.5), SUPPRESS < 0.3.

### Compilation — config/loader.ts (~150L)

```
"node -e*"           -> /^node -e.*$/i
"quick test"         -> /quick test/i
{ command: ["bun -e*"] } -> { command: [/^bun -e.*$/i] }
```

Throws LOADER_VALIDATION_FAILED if id, toolMatchers, banks, or enforcement missing.

See layers/_template.json for the fully documented template (80+ lines, every field with inline docs).
See layers/_guide.md for the 30-minute walkthrough guide (200+ lines, 3 real examples).

---

## 5. Microstructure Composition — Assembling Engines

Source: PTA_L2_SPEC.md §2.1, §2.2, and index.ts (18L — 15 named exports).

### The 12 Microstructures

Each MS is independently importable. Zero cross-MS dependencies — compose freely.

| MS | Module | File | Export | Purpose |
|----|--------|------|--------|---------|
| MS-01 | Ratio Classifier | core/synapse.ts (4-bank) | scoreSignals, confidence, classifyBand, batchScan | 4-bank detection |
| MS-02 | Synapse | core/synapse.ts | V2Synapse, FamilyNeuron | λ-decay accumulation |
| MS-03 | Intent Classifier | core/intent-classifier.ts | classifyIntent | 3-source fusion |
| MS-04 | Chain Tracker | core/chain-tracker.ts | ChainTracker | Multi-tool sequences |
| MS-05 | PBA Bridge | core/pba-bridge.ts | PbaBridgeImpl, correlateEscalation | PBA signal flow |
| MS-06 | Escalation Memory | core/machine.ts (part) | computeDeadline, computeSkipTier | Deadline + skip-tier |
| MS-07 | State Machine | core/machine.ts | step, createInitialRecord | 8 transitions |
| MS-08 | Warhead Dispatcher | actuation/dispatch.ts + warhead-templates.ts | dispatchTea, blockAtTeb, dispatchDirective, fillTemplate | Tier surfaces |
| MS-09 | Evidence Gates | core/gate-engine.ts | evaluateCompliance, createEvidenceRecord | 5 criteria gates |
| MS-10 | Compliance Collector | core/collector.ts | ComplianceCollector | Evidence pool, TTL 600s |
| MS-11 | Layer Loader | config/loader.ts | loadLayer, registerLayer, createRegistry | JSON -> runtime |
| MS-12 | Persistence | core (persistence) | persistState, loadState, persistSynapse, loadSynapse, appendLedger | Per-sid atomic |

### Composing the Engine — core/engine.ts (~475L)

```typescript
import { ParagonToolEngine } from 'paragon-v3-tool-chain-algorithms';
import { loadLayer } from 'paragon-v3-tool-chain-algorithms/config';
import type { ToolChainModule } from 'paragon-v3-tool-chain-algorithms';

// The engine orchestrates: tool event -> intent classify -> synapse -> machine -> dispatch -> compliance
const module: ToolChainModule = {
  name: 'my-domain',
  brandPrefix: 'PTA',
  layers: [loadLayer('layers/my-layer.layer.json')],
  chainRules: [],
  compliance: {
    escapeHatches: ['read', 'grep', 'glob'],
    remediationTools: ['my-verify-tool'],
    verificationPatterns: [/my-evidence\.json/],
  },
  pbaBridge: { enabled: false },
};

const engine = new ParagonToolEngine(module);
// engine holds: sessions Map<sid, PtaSessionState>, roleGate, gates, circuit, collector, chainTracker, pbaBridge
// engine exposes: registerLayer, deactivateLayer, activateLayer, pbaBridge, hook methods
```

### Standalone MS Usage

```typescript
// Use ChainTracker alone
import { ChainTracker } from 'paragon-v3-tool-chain-algorithms';
const tracker = new ChainTracker();
tracker.recordCall('sid-1', 'bash', { command: 'bun test' });
tracker.wasCalled('sid-1', 'trident-code-audit'); // false -> violation
tracker.detectLoop('sid-1'); // loop check

// Use Synapse alone
import { V2Synapse } from 'paragon-v3-tool-chain-algorithms';
const synapse = new V2Synapse({ fire: { SMOKE: 0.9 }, decayAlpha: 0.05, refractorySeq: 25 });
synapse.accumulate({ family: 'SMOKE', weight: 0.43 }, 0);
synapse.canAnyFire(); // false (0.43 < 0.9)
synapse.getNeuron('SMOKE').boostBaseline(0.2); // PTA bridge pre-arming

// Use Intent Classifier alone
import { classifyIntent } from 'paragon-v3-tool-chain-algorithms';
const intent = classifyIntent(
  { toolName: 'bash', args: { command: 'bun test' } },
  { previousTools: [], chainViolations: ['verification-requires-audit'] },
  { activeFamilies: ['TEST_EVASION'], latestSignals: [signal], macroTier: 1 },
  layers,
);
```

### Import Paths — package.json exports

```typescript
import { ParagonToolEngine } from 'paragon-v3-tool-chain-algorithms';
import { ChainTracker } from 'paragon-v3-tool-chain-algorithms/core';
import { ToolEventRouter } from 'paragon-v3-tool-chain-algorithms/capture';
import { dispatchTea } from 'paragon-v3-tool-chain-algorithms/actuation';
import { loadLayer } from 'paragon-v3-tool-chain-algorithms/config';
import { OpencodeAdapter, MockAdapter } from 'paragon-v3-tool-chain-algorithms/hooks';
```

---

## 6. Creating a New Layer — Step by Step

Source: PTA_L2_SPEC.md §2.7 (30-minute process) + layers/_guide.md + layers/_template.json.

### The 30-Minute Process

```
Minutes 0-5:   Describe the behavior in natural language
               "I want to prevent X. The model should use Y instead."
Minutes 5-20:  Fill the layer JSON
               - toolMatchers: which tools to watch
               - banks: 4 pattern sets (descriptive/suggestive/substitute/use)
               - enforcement: tier1-4 warhead bodies (follow 6-section standard)
               - pbaContextBoost + chainRules + threshold + severity
Minutes 20-30: Register and run checks
               pta.registerLayer(loadLayer("layers/my-layer.layer.json"))
```

### Step 1 — Describe in Natural Language (5 min)

Write one sentence: what behavior to prevent and what the model should do instead.

Example: "I want to prevent the model from writing to the dist/ folder directly — it should use the build system."

Example: "I want to prevent hash commands used as proof that code works — the model should use the verification tool."

### Step 2 — Fill the Template (15 min)

Copy layers/_template.json -> layers/my-layer.layer.json. Fill:

1. **id**: unique, SCREAMING_SNAKE (e.g. DIST_WRITE_GUARD, HASH_PROOF_GUARD)
2. **description**: one sentence from Step 1
3. **toolMatchers**: which tools to watch — exact toolName or regex, plus argPatterns to narrow
4. **banks**: 4 pattern sets — think about legitimate vs violation vs alternative vs sanctioned
5. **enforcement**: tier1-4 bodies — follow warhead standard (§5), use fill fields
6. **pbaContextBoost**: which PBA families amplify this layer (e.g. FORGERY_INTENT for hash proof)
7. **chainRules**: prerequisite tools (e.g. verification tool must have been called)
8. **threshold**: 0.8-0.9 typical, lower for high-signal violations
9. **severity**: LOW/MEDIUM/HIGH/CRITICAL

Template — layers/_template.json:

```json
{
  "id": "EXAMPLE_LAYER",
  "description": "Template layer — copy and fill",
  "toolMatchers": [{ "toolName": "bash", "argPatterns": { "command": ["node -e*"] } }],
  "banks": {
    "descriptive": ["for the container test"],
    "suggestive": ["just quickly check"],
    "substitute": ["instead of the container"],
    "use": ["trident-container-test"]
  },
  "pbaContextBoost": { "families": ["TEST_EVASION"], "boostAmount": 0.2 },
  "enforcement": { "tier1": "...", "tier2": "...", "tier3": "...", "tier4": "..." },
  "threshold": 0.9,
  "severity": "HIGH",
  "chainRules": [{ "name": "requires-prerequisite", "requires": [{ "tool": "trident-container-test" }], "violation": { "layerId": "EXAMPLE_LAYER" } }]
}
```

### Step 3 — Register and Run Checks (10 min)

```typescript
import { loadLayer } from 'paragon-v3-tool-chain-algorithms/config';
const layer = loadLayer('layers/my-layer.layer.json');
pta.registerLayer(layer);
// Layer is NOW LIVE
```

Verification — layers/_guide.md describes the harness pattern for new layers:

```typescript
// Harness pattern — harness file at layers/my-layer.test.ts
import { classifyIntent } from 'paragon-v3-tool-chain-algorithms';
import { ChainTracker } from 'paragon-v3-tool-chain-algorithms';
import { MockAdapter } from 'paragon-v3-tool-chain-algorithms/hooks/mock';

// Violation: should produce confidence >= threshold
const violationIntent = classifyIntent(
  { toolName: 'bash', args: { command: 'my-violation-command' } },
  { previousTools: [], chainViolations: ['my-chain-rule'] },
  { activeFamilies: ['TEST_EVASION'], latestSignals: [signal], macroTier: 1 },
  [myLayer],
);
// Violation confidence should be high (ENFORCE band)

// Legitimate: should produce confidence < 0.3 (SUPPRESS)
const legitIntent = classifyIntent(
  { toolName: 'bash', args: { command: 'legitimate usage' } },
  { previousTools: ['my-verify-tool'], chainViolations: [] },
  { activeFamilies: [], latestSignals: [], macroTier: 0 },
  [myLayer],
);
// Legitimate confidence should be low (SUPPRESS — use bank short-circuit or descriptive)
```

Common mistakes — layers/_guide.md:

- Forgetting use bank -> legitimate sanctioned calls fire violations (false positives)
- Overly broad toolMatchers -> layer fires on unrelated tools
- Missing chainRules -> prerequisite violations not detected
- Wrong threshold -> too high never fires, too low fires on noise
- Hardcoded messages instead of fill templates -> not tier-proportional

---

## 7. Worked Example — Custom Tool-Chain Workflow from Scratch

Source: PTA_L2_SPEC.md §2.7 worked structure + §2.2 boilerplate layout + §2.13 god loop integration.

### The Goal

Build a custom phased workflow — a documentation-generation pipeline with 4 phases (GATHER -> DRAFT -> REVIEW -> PUBLISH) where each phase requires specific tools and the model must not skip phases or use wrong tools.

### Step 1 — Define the Phases and Required Tools

| Phase | Required Tools | Layer ID |
|-------|---------------|----------|
| GATHER | read, grep, glob (research) | GATHER_TOOLS |
| DRAFT | write, edit (producing drafts) | DRAFT_TOOLS |
| REVIEW | trident-code-audit (review) | REVIEW_REQUIRED |
| PUBLISH | trident-ship-package (publish) | PUBLISH_EVIDENCE |

Chain: GATHER -> DRAFT -> REVIEW -> PUBLISH. Each phase requires the previous phase tool to have been called.

### Step 2 — Create the Layers

```json
// layers/workflow/gather-tools.layer.json
{
  "id": "GATHER_TOOLS",
  "description": "During GATHER: model must use research tools (read, grep, glob)",
  "toolMatchers": [{ "toolName": "write" }, { "toolName": "edit" }],
  "banks": {
    "descriptive": ["researching the codebase", "gathering context", "reading source files"],
    "suggestive": ["just write it directly", "skip the research", "I know what to write"],
    "substitute": ["faster to write without reading", "good enough without research"],
    "use": ["read", "grep", "glob", "per the source files"]
  },
  "pbaContextBoost": { "families": ["SCOPE_SHRINK"], "boostAmount": 0.2 },
  "enforcement": {
    "tier1": "DETECTED: Write during GATHER phase without research. Tool: {toolName} PBA: {pbaFamilies}. Correct: read/grep/glob first. ({anchor})",
    "tier2": "Repeated {count} writes without research. Next tier refuses. ({anchor})",
    "tier3": "REFUSED — GATHER phase requires research first. Use read/grep/glob. ({anchor})",
    "tier4": "[PTA GATE] GATHER VIOLATION {escalationCount} cycles. Research first. ({anchor})"
  },
  "threshold": 0.8, "severity": "MEDIUM",
  "chainRules": [{ "name": "gather-requires-research", "requires": [{ "tool": "read" }], "violation": { "layerId": "GATHER_TOOLS" } }]
}
```

```json
// layers/workflow/review-required.layer.json
{
  "id": "REVIEW_REQUIRED",
  "description": "REVIEW phase: audit tool must be called before publishing",
  "toolMatchers": [{ "toolName": "trident-ship-package" }],
  "banks": {
    "descriptive": ["after the review", "per the audit findings", "review complete"],
    "suggestive": ["just publish it", "ship without review", "skip the audit"],
    "substitute": ["faster without review", "good enough to ship"],
    "use": ["trident-code-audit", "per the review findings"]
  },
  "pbaContextBoost": { "families": ["TEST_EVASION", "FORGERY_INTENT"], "boostAmount": 0.2 },
  "enforcement": {
    "tier1": "DETECTED: Ship without review. Tool: trident-ship-package Chain: {chainViolations} PBA: {pbaFamilies} ({anchor})",
    "tier2": "Repeated {count} ship attempts without review. Next refuses. ({anchor})",
    "tier3": "REFUSED — REVIEW required before publish. Call trident-code-audit. ({anchor})",
    "tier4": "[PTA GATE] PUBLISH without REVIEW — {escalationCount} cycles. Audit first. ({anchor})"
  },
  "threshold": 0.9, "severity": "CRITICAL",
  "chainRules": [{ "name": "publish-requires-review", "requires": [{ "tool": "trident-code-audit" }], "violation": { "layerId": "REVIEW_REQUIRED" } }]
}
```

### Step 3 — Wire the Engine

```typescript
import { ParagonToolEngine } from 'paragon-v3-tool-chain-algorithms';
import { loadLayer } from 'paragon-v3-tool-chain-algorithms/config';
import { OpencodeAdapter } from 'paragon-v3-tool-chain-algorithms/hooks/opencode-adapter';

const workflowModule: ToolChainModule = {
  name: 'doc-workflow',
  brandPrefix: 'PTA',
  layers: [],
  chainRules: [],
  compliance: {
    escapeHatches: ['read', 'grep', 'glob'],
    remediationTools: ['trident-code-audit', 'trident-ship-package'],
    verificationPatterns: [/TRIDENT_CODE_REVIEW/, /SHIP_MANIFEST/],
  },
  pbaBridge: { enabled: false }, // standalone for this example
};

const pta = new ParagonToolEngine(workflowModule);

// Load workflow layers
for (const f of ['gather-tools', 'draft-tools', 'review-required', 'publish-evidence']) {
  pta.registerLayer(loadLayer(`layers/workflow/${f}.layer.json`));
}

// Wire hooks
const adapter = new OpencodeAdapter(pta);
hooks.on('tool.execute.before', (e) => {
  const intent = adapter.interceptTool(e);
  if (intent?.action === 'BLOCK') throw new StructuredEnforcementError({ machine: 'pta', detected: intent.layerId, correction: resolveWarhead(getLayer(intent.layerId), intent.tier, intent), tier: intent.tier });
  adapter.observeTool(e);
});
hooks.on('tool.execute.after', (e) => {
  const q = pta.getQueuedCorrection(e.sessionId);
  if (q) e.output = dispatchTea(q.body, e.output);
  adapter.observeCompletion(e);
});
```

### Step 4 — Phase-Aware Enforcement with enterPhase

```typescript
const PHASE_LAYERS = {
  GATHER:  'layers/workflow/gather-tools.layer.json',
  DRAFT:   'layers/workflow/draft-tools.layer.json',
  REVIEW:  'layers/workflow/review-required.layer.json',
  PUBLISH: 'layers/workflow/publish-evidence.layer.json',
};

function enterPhase(phase: string): void {
  if (currentPhase && PHASE_LAYERS[currentPhase]) pta.deactivateLayer(PHASE_LAYERS[currentPhase]);
  if (PHASE_LAYERS[phase]) pta.activateLayer(loadLayer(PHASE_LAYERS[phase]));
  currentPhase = phase;
}

// Workflow execution
enterPhase('GATHER');   // read/grep/glob expected, write/edit flagged
// ... research ...

enterPhase('DRAFT');    // write/edit expected
// ... drafting ...

enterPhase('REVIEW');   // trident-code-audit expected
// model calls trident-ship-package here -> REFUSED (REVIEW_REQUIRED chain: trident-code-audit not called)
// model calls trident-code-audit -> use bank -> ALLOW -> chain satisfied

enterPhase('PUBLISH');  // trident-ship-package expected
// model calls trident-ship-package -> ALLOW (prerequisite satisfied)
```

### Step 5 — Harness

Harness pattern per layer — see Section 6 for the general harness template. For this workflow, verify that:

- Writing without prior research triggers the GATHER layer
- Shipping without prior review triggers the REVIEW layer
- The correct tool in each phase transits without triggering

---

*End of REPLICATION_GUIDE.md — Paragon V3 Tool-Chain Algorithms v1.0.0*
*Sources: PTA_L2_SPEC.md 2.1-2.13 (2,441L) · PBA_PTA_MASTER_L1_SPEC.md 0-9 (1,410L) · index.ts (18L) · layers/_template.json (38L)*
*enterPhase: PTA_L2_SPEC.md 2.13 · bridge: 2.5 · hooks: 2.6 · MS composition: 2.1-2.2 · worked example: 2.7 + custom composition*
