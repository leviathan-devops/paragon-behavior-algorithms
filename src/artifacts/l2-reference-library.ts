/**
 * L2 Reference Library — Stored excerpts from gold-standard specs
 * per section type. Used by the brief builder to show the LLM
 * what each section should look like.
 *
 * Each excerpt is a SHORT (20-40 line) slice from the CME spec that
 * demonstrates the FORMAT and QUALITY bar for that section type.
 * The LLM reads these excerpts and mirrors the structure, density,
 * and rigor when generating its own sections.
 *
 * The library is a static `Record<string, ReferenceExcerpt>` — no
 * computation, no side effects. It is consumed by the brief builder
 * during Phase 1 (analysis) and injected into the generation prompt.
 *
 * Determinism contract: every entry is a constant string literal.
 * No Date.now(), no Math.random(), no I/O.
 *
 * @module artifacts/l2-reference-library
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single reference excerpt from a gold-standard spec section.
 * The brief builder injects the `excerpt` text into the generation
 * prompt alongside a `why` explanation so the LLM understands what
 * quality bar to hit.
 */
export interface ReferenceExcerpt {
  /** Source spec file the excerpt was taken from. */
  source: string;
  /** Human-readable section reference within the source spec. */
  section: string;
  /** Line range in the source spec (e.g. '41-120'). */
  lines: string;
  /**
   * Explanation of why this excerpt demonstrates gold quality.
   * Read by the LLM as guidance for what to replicate.
   */
  why: string;
  /** The actual excerpt text — verbatim from the source spec. */
  excerpt: string;
}

// ============================================================================
// REFERENCE EXCERPT LIBRARY
// ============================================================================

/**
 * Stored excerpts from the CME (Context Management Engine) spec, one per
 * section type. Each entry shows the LLM what GOLD quality looks like for
 * that section so it can mirror the structure, density, and rigor.
 *
 * Section types covered:
 * - `executiveSummary`   — pure prose framing the problem
 * - `architecture`       — ASCII diagrams + execution model
 * - `dataModel`          — TypeScript interfaces with JSDoc
 * - `engineClass`        — class implementation with error handling
 * - `defenseRules`       — Purpose / Model / Implementation / Pseudocode / Example
 * - `algorithmSpecs`     — formula derivation with worked numbers
 * - `testSpecs`          — specific numeric assertions (not toBeTruthy)
 * - `blindSpots`         — honest "what we cannot see" format
 * - `integration`        — data flow with file:line references
 * - `evidenceFormat`     — JSON schema + sample output
 * - `migration`          — phased rollout with rollback steps
 */
export const REFERENCE_EXCERPTS: Record<string, ReferenceExcerpt> = {
  // ==========================================================================
  // EXECUTIVE SUMMARY
  // ==========================================================================
  executiveSummary: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§1 Executive Summary',
    lines: '41-120',
    why:
      'Shows how to frame a problem with SPECIFIC failure examples, not generic statements. ' +
      'Opens by showing the ACTUAL current code being replaced, catalogs 5 specific failure ' +
      'modes in a table, then describes the solution with the 5 Rules this engine implements.',
    excerpt: `## 1. Executive Summary

### 1.1 The Problem — "Right Track" Intelligence

The current implementation classifies tools with a hardcoded set:

    const IMPLEMENT = new Set(['write', 'edit', 'bash']);

This binary classifier answers "did the agent do something?" but never asks
"did the agent do the RIGHT things in the RIGHT order?" The result is a
guardian that cannot distinguish a focused 12-step build from a 40-read
exploration spree. Both pass. Only the first should.

### 1.2 Failure Modes Not Detected

| # | Scenario               | Current Behavior        | Actual Distance |
|---|------------------------|-------------------------|-----------------|
| 1 | read→read→read at BUILD | PASS (no BLOCK)        | 0.85 MISALIGNED |
| 2 | write before any read   | PASS (write detected)  | 0.40 DRIFTING   |
| 3 | 20 reads, 0 writes      | PASS (no BLOCK)        | 1.00 MISALIGNED |
| 4 | test→test→test at PLAN  | PASS (no BLOCK)        | 0.72 DRIFTING   |
| 5 | claim without evidence  | PASS (no BLOCK)        | 0.60 DRIFTING   |

### 1.3 The Solution — Three-Layer Trajectory Engine

This spec defines an engine that replaces "did X happen?" with "is the
agent's trajectory close enough to the expected workflow path?" It
implements five detection rules (T-1 through T-5) that score semantic
distance, detect stagnation, verify context freshness, check claim
backing, and enforce required categories at each gate.`,
  },

  // ==========================================================================
  // ARCHITECTURE
  // ==========================================================================
  architecture: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§2 Architecture Overview',
    lines: '121-236',
    why:
      'Shows ASCII component diagrams that map data flow between modules, an execution ' +
      'model explaining the per-tool-invocation lifecycle, and a cost-gradient layering ' +
      'principle (cheap checks first, expensive checks last). No code — pure structural reasoning.',
    excerpt: `## 2. Architecture Overview

### 2.1 Component Diagram

    ┌──────────────────────────────────────────────────────┐
    │                    tool.before hook                   │
    └──────────────────┬───────────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │   TrajectoryCollector   │  ← accumulates per-session nodes
          └────────────┬────────────┘
                       │
    ┌──────────────────▼───────────────────────────────────┐
    │              ContextManagementEngine                  │
    │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐ │
    │  │  T-1    │ │  T-2    │ │  T-3    │ │  T-4 / T-5  │ │
    │  │ Traject.│ │ Context │ │ Stagnat.│ │ Claim/Req.  │ │
    │  └────┬────┘ └────┬────┘ └────┬────┘ └──────┬──────┘ │
    │       └───────────┴───────────┴──────────────┘       │
    │                        │                              │
    │              TrajectoryVerdict { distance, action }   │
    └────────────────────────┬─────────────────────────────┘
                             │
                    BLOCK / WARN / PASS

### 2.2 Execution Model

Every tool invocation enters the engine via a single synchronous entry point.
The engine runs rules in cost-gradient order: cheap distribution checks (T-1)
before expensive file-freshness lookups (T-2). If any rule returns BLOCK, the
remaining rules are skipped — the verdict is already decided.

### 2.3 Cost-Gradient Principle

Rules are ordered by computational cost so that the cheapest disqualifier
runs first:

  T-1 (distribution distance): O(n) over trajectory nodes — runs always
  T-3 (stagnation window):     O(n) over last K nodes — runs always
  T-4 (claim backing):         O(n) AST scan — runs on CLAIM category
  T-2 (file freshness):        O(m) file stat calls — runs on MODIFY only
  T-5 (required category):     O(1) set lookup — runs at gate transitions

This ordering means that a clearly misaligned trajectory (T-1 returns
MISALIGNED) short-circuits before any file I/O occurs.`,
  },

  // ==========================================================================
  // DATA MODEL
  // ==========================================================================
  dataModel: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§3 Data Model',
    lines: '237-596',
    why:
      'Shows the EXACT density of types — 15+ interfaces, 20+ exported constants with ' +
      'computed values (FRESHNESS_WINDOW_MS = 5 * 60 * 1000), discriminated unions for ' +
      'state types, readonly fields everywhere. This is what CODE mode looks like.',
    excerpt: `## 3. Data Model

### 3.1 Core Types

/** A single node in the agent's tool-use trajectory. */
interface TrajectoryNode {
  readonly tool: string;
  readonly category: SemanticCategory;
  readonly timestamp: number;
  readonly gate: GateName;
}

/** Semantic categories derived from tool classification. */
type SemanticCategory = 'EXPLORE' | 'CREATE' | 'MODIFY' | 'VERIFY' | 'CLAIM';

/** Freshness state for a file observed during a session. */
type FreshnessState = 'NEVER_READ' | 'FRESH' | 'STALE';

/** The engine's verdict on a single rule evaluation. */
interface TrajectoryVerdict {
  readonly ruleId: string;
  readonly distance: number;
  readonly verdict: 'ALIGNED' | 'DRIFTING' | 'MISALIGNED';
  readonly action: 'BLOCK' | 'WARN' | 'PASS';
  readonly reason: string;
}

/** Reference path: expected category distribution per gate. */
interface ReferencePath {
  readonly gate: GateName;
  readonly distributions: Readonly<Record<SemanticCategory, number>>;
  readonly required: ReadonlySet<SemanticCategory>;
}

// Computed constants — never magic numbers in the codebase
export const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;   // 5 minutes
export const STAGNATION_WINDOW = 8;                  // last N nodes
export const MISALIGNED_THRESHOLD = 0.60;
export const DRIFTING_THRESHOLD = 0.30;
export const TVD_WEIGHT = 0.45;
export const ORDERING_WEIGHT = 0.30;
export const REQUIRED_WEIGHT = 0.25;`,
  },

  // ==========================================================================
  // ENGINE CLASS
  // ==========================================================================
  engineClass: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§4 ContextManagementEngine — Full Implementation',
    lines: '597-890',
    why:
      'Shows a real class with a constructor that injects dependencies, private state fields ' +
      'with JSDoc, a primary evaluate() method that runs all rules in order, and explicit ' +
      'error handling that degrades gracefully (never crashes the hook). This is the ' +
      'integration point between the spec and the plugin runtime.',
    excerpt: `## 4. ContextManagementEngine — Full Implementation

\`\`\`typescript
class ContextManagementEngine {
  private readonly trajectory: TrajectoryNode[];
  private readonly fileRegistry: FileFreshnessRegistry;
  private readonly gateState: GateState;
  private readonly logger: (msg: string) => void;

  constructor(deps: {
    trajectory: TrajectoryNode[];
    fileRegistry: FileFreshnessRegistry;
    gateState: GateState;
    logger?: (msg: string) => void;
  }) {
    this.trajectory = deps.trajectory;
    this.fileRegistry = deps.fileRegistry;
    this.gateState = deps.gateState;
    this.logger = deps.logger ?? (() => {});
  }

  evaluate(node: TrajectoryNode): TrajectoryVerdict {
    // T-1: Semantic trajectory (cheapest — run first)
    const t1 = this.checkTrajectoryAlignment(node);
    if (t1.action === 'BLOCK') return t1;

    // T-3: Stagnation (cheap — scan last K nodes)
    const t3 = this.checkStagnation(node);
    if (t3.action === 'BLOCK') return t3;

    // T-4: Claim backing (medium cost — AST scan)
    if (node.category === 'CLAIM') {
      const t4 = this.checkClaimBacking(node);
      if (t4.action === 'BLOCK') return t4;
    }

    // T-2: File freshness (expensive — stat calls)
    if (node.category === 'MODIFY') {
      const t2 = this.checkFileFreshness(node);
      if (t2.action === 'BLOCK') return t2;
    }

    // All rules passed — return the worst non-blocking verdict
    return this.worstPassing(t1, t3);
  }
}
\`\`\`

Note the cost-gradient ordering: cheap distribution checks before expensive
file-stat calls. The engine never throws — if any rule encounters an error,
it returns a conservative PASS verdict and logs the blind spot.`,
  },

  // ==========================================================================
  // DEFENSE RULES
  // ==========================================================================
  defenseRules: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§5 Rule T-1: Semantic Trajectory Analysis',
    lines: '891-1060',
    why:
      'Shows the EXACT structure — Purpose (2 paragraphs), Model (mathematical description), ' +
      'Implementation (100+ line TypeScript class), Pseudocode Summary (numbered steps), ' +
      'Worked Example (actual numbers: TVD=0.08 → distance=0.036 → ALIGNED).',
    excerpt: `## 5. Rule T-1: Semantic Trajectory Analysis

### 5.1 Purpose

Rule T-1 answers: "Is the agent's tool-use distribution close to what we
expect at this gate?" A healthy BUILD session shows a mix of EXPLORE, CREATE,
and VERIFY. A session of pure EXPLORE at BUILD time is suspicious — the agent
may be stuck reading without committing.

### 5.2 The Reference Path Model

Each gate has an expected category distribution:

| Gate   | EXPLORE | CREATE | MODIFY | VERIFY | CLAIM |
|--------|---------|--------|--------|--------|-------|
| PLAN   | 0.60    | 0.10   | 0.00   | 0.00   | 0.30  |
| BUILD  | 0.25    | 0.35   | 0.15   | 0.15   | 0.10  |
| TEST   | 0.20    | 0.10   | 0.10   | 0.50   | 0.10  |

### 5.3 WorkflowAlignmentScorer — Full Implementation

\`\`\`typescript
class WorkflowAlignmentScorer {
  score(actual: TrajectoryNode[], reference: ReferencePath): TrajectoryVerdict {
    const actualDist = this.computeDistribution(actual);
    const refDist = reference.distributions;

    const tvd = this.computeTVD(actualDist, refDist);
    const orderingPenalty = this.computeOrderingPenalty(actual, reference);
    const requiredMissing = this.checkRequired(actual, reference.required);

    const distance = TVD_WEIGHT * tvd
      + ORDERING_WEIGHT * orderingPenalty
      + REQUIRED_WEIGHT * requiredMissing;

    const verdict = distance > MISALIGNED_THRESHOLD ? 'MISALIGNED'
      : distance > DRIFTING_THRESHOLD ? 'DRIFTING'
      : 'ALIGNED';

    return { ruleId: 'T-1', distance, verdict, action: this.actionFor(verdict),
             reason: \`TVD=\${tvd.toFixed(3)}, ordering=\${orderingPenalty.toFixed(3)}\` };
  }
}
\`\`\`

### 5.4 Pseudocode Summary

1. Count tool nodes per semantic category → actual distribution
2. Compute TVD between actual and reference distributions
3. Compute ordering penalty (are CREATE tools before VERIFY tools?)
4. Check if any required category is completely absent
5. Distance = 0.45*TVD + 0.30*ordering + 0.25*required

### 5.5 Worked Example

Actual: {EXPLORE: 0.3, CREATE: 0.3, MODIFY: 0.1, VERIFY: 0.15, CLAIM: 0.15}
Reference BUILD: {EXPLORE: 0.25, CREATE: 0.35, MODIFY: 0.15, VERIFY: 0.15, CLAIM: 0.10}
TVD = 0.5 * (0.05 + 0.05 + 0.05 + 0 + 0.05) = 0.10
Distance = 0.45*0.10 + 0.30*0.02 + 0.25*0 = 0.051 → ALIGNED`,
  },

  // ==========================================================================
  // ALGORITHM SPECS
  // ==========================================================================
  algorithmSpecs: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§11 Workflow Alignment Scoring Algorithm',
    lines: '2243-2375',
    why:
      'Shows HOW to derive a formula from first principles. The TVD formula is stated, ' +
      'justified (symmetric, bounded, handles zeros), and then computed with actual numbers ' +
      'in 3 worked examples (healthy BUILD, pure exploration, backward-heavy).',
    excerpt: `## 11. Workflow Alignment Scoring Algorithm

### 11.1.1 Category Distribution Distance (TVD)

    TVD(P, Q) = 0.5 * Σ_c |P(c) - Q(c)|

**Why TVD over KL-divergence:**

- TVD is symmetric: TVD(P,Q) = TVD(Q,P) — order doesn't matter
- TVD is bounded: 0 ≤ TVD ≤ 1 — interpretable as a percentage
- TVD handles zero-probability: defined when Q(c)=0 and P(c)>0
  (KL-divergence is undefined here → infinity)

**Worked Example A (healthy BUILD):**

    Actual:    {EXPLORE: 0.30, CREATE: 0.30, MODIFY: 0.10, VERIFY: 0.15, CLAIM: 0.15}
    Reference: {EXPLORE: 0.25, CREATE: 0.35, MODIFY: 0.15, VERIFY: 0.15, CLAIM: 0.10}
    TVD = 0.5 * (|0.30-0.25| + |0.30-0.35| + |0.10-0.15| + |0.15-0.15| + |0.15-0.10|)
        = 0.5 * (0.05 + 0.05 + 0.05 + 0.00 + 0.05)
        = 0.5 * 0.20 = 0.10
    distance = 0.45 * 0.10 + 0.30 * 0.02 + 0.25 * 0.00 = 0.051 → ALIGNED

**Worked Example B (pure exploration — MISALIGNED):**

    Actual:    {EXPLORE: 1.00, CREATE: 0.00, MODIFY: 0.00, VERIFY: 0.00, CLAIM: 0.00}
    Reference: {EXPLORE: 0.25, CREATE: 0.35, MODIFY: 0.15, VERIFY: 0.15, CLAIM: 0.10}
    TVD = 0.5 * (0.75 + 0.35 + 0.15 + 0.15 + 0.10) = 0.5 * 1.50 = 0.75
    requiredMissing = 1.0 (CREATE absent)
    distance = 0.45*0.75 + 0.30*0.50 + 0.25*1.00 = 0.688 → MISALIGNED

**Worked Example C (backward-heavy — DRIFTING):**

    Actual:    {EXPLORE: 0.10, CREATE: 0.10, MODIFY: 0.10, VERIFY: 0.60, CLAIM: 0.10}
    Reference: {EXPLORE: 0.25, CREATE: 0.35, MODIFY: 0.15, VERIFY: 0.15, CLAIM: 0.10}
    TVD = 0.5 * (0.15 + 0.25 + 0.05 + 0.45 + 0.00) = 0.5 * 0.90 = 0.45
    distance = 0.45*0.45 + 0.30*0.40 + 0.25*0.00 = 0.323 → DRIFTING`,
  },

  // ==========================================================================
  // TEST SPECS
  // ==========================================================================
  testSpecs: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§19 Test Specifications',
    lines: '3038-3200',
    why:
      'Shows the EXACT assertion format — specific numeric values, not "should work". ' +
      'Every test has: arrange (create test data), act (call the function), ' +
      'assert (expect specific value). Test helpers provided.',
    excerpt: `## 19. Test Specifications

### 19.2 T-1 Workflow Alignment Tests

\`\`\`typescript
describe('WorkflowAlignmentScorer', () => {
  it('returns ALIGNED for healthy BUILD trajectory', () => {
    // Arrange
    const actual = [
      node('read',  EXPLORE),
      node('write', CREATE),
      node('test',  VERIFY),
    ];
    // Act
    const result = scorer.score(actual, REFERENCE_PATHS.BUILD);
    // Assert
    expect(result.distance).toBeLessThanOrEqual(0.30);
    expect(result.verdict).toBe('ALIGNED');
    expect(result.action).toBe('PASS');
  });

  it('returns MISALIGNED for pure exploration', () => {
    const actual = [
      node('read', EXPLORE),
      node('read', EXPLORE),
      node('read', EXPLORE),
    ];
    const result = scorer.score(actual, REFERENCE_PATHS.BUILD);
    expect(result.distance).toBeGreaterThan(0.60);
    expect(result.verdict).toBe('MISALIGNED');
    expect(result.requiredCategoryPresent).toBe(false);
  });

  it('returns DRIFTING for verify-heavy at BUILD', () => {
    const actual = [node('test', VERIFY), node('test', VERIFY), node('test', VERIFY)];
    const result = scorer.score(actual, REFERENCE_PATHS.BUILD);
    expect(result.distance).toBeGreaterThan(0.30);
    expect(result.distance).toBeLessThanOrEqual(0.60);
    expect(result.verdict).toBe('DRIFTING');
  });
});
\`\`\`

### 19.3 Test Helpers

\`\`\`typescript
function node(tool: string, category: SemanticCategory): TrajectoryNode {
  return { tool, category, timestamp: Date.now(), gate: 'BUILD' };
}
\`\`\``,
  },

  // ==========================================================================
  // BLIND SPOTS
  // ==========================================================================
  blindSpots: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§15 Blind Spot Reporting',
    lines: '2524-2618',
    why:
      'Shows HOW to be honest — 6 blind spot types, each with: what we cannot see, ' +
      'why, and conservative fallback action. "Rather than silently passing (which would ' +
      'be the Branding Illusion), the engine reports blind spots explicitly."',
    excerpt: `## 15. Blind Spot Reporting

### 15.1 Philosophy

Rather than silently passing (which would be the Branding Illusion — claiming
intelligence that doesn't exist), the engine reports blind spots explicitly.
Each blind spot includes a conservative fallback so the agent is never left
without guidance.

### 15.2 Blind Spot Types

1. **INSUFFICIENT_TRAJECTORY** — fewer than 5 nodes collected
   - Why: Distribution distance is unreliable with <5 samples
   - Fallback: conservative ALIGNED + report to log

2. **NO_REFERENCE_PATH** — gate has no reference path defined
   - Why: Cannot score distance without a reference
   - Fallback: conservative ALIGNED + report to log

3. **NO_TASK_QUEUE** — task queue not available
   - Why: Cannot check claim backing without task data
   - Fallback: DIRECTED/ON_TRACK + report to log

4. **AMBIGUOUS_BASH** — bash command doesn't match known patterns
   - Why: Cannot classify semantic category confidently
   - Fallback: NAVIGATE (neutral category) + report to log

5. **FRESHNESS_UNKNOWN** — file modification time unavailable
   - Why: Cannot verify file was read before write
   - Fallback: PASS (don't block on unknown — avoid false positives)

6. **GATE_TRANSITION_IN_FLIGHT** — gate transition happening simultaneously
   - Why: Reference path may change mid-evaluation
   - Fallback: defer evaluation until next observation

### 15.3 Reporting Format

Each blind spot is included in the TrajectoryVerdict's \`blindSpots\` array:

    { type: 'INSUFFICIENT_TRAJECTORY', nodeCount: 3, fallback: 'ALIGNED' }`,
  },

  // ==========================================================================
  // INTEGRATION
  // ==========================================================================
  integration: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§20 Integration Plan',
    lines: '3750-3900',
    why:
      'Shows data flow with file:line references — the ACTUAL import statements, hook ' +
      'registration code, and orchestrator wiring. Written as full TypeScript, not prose. ' +
      'Maps every new component to its registration point in the plugin runtime.',
    excerpt: `## 20. Integration Plan

### 20.1 Hook Registration

The engine integrates into the existing \`tool.before\` hook chain. The full
composition runs before any tool executes:

\`\`\`typescript
// src/hooks/tool-before-hook.ts:42
import { ContextManagementEngine } from '../engines/context-engine.ts';
import { TrajectoryCollector } from '../state/trajectory-collector.ts';

const trajectoryCollector = new TrajectoryCollector();
const engine = new ContextManagementEngine({
  trajectory: trajectoryCollector.getAll(),
  fileRegistry: globalFileRegistry,
  gateState: currentGateState,
  logger: (msg) => console.error(\`[CME] \${msg}\`),
});

export async function beforeToolHandler(event: ToolBeforeEvent): Promise<HookResult> {
  // 1. Classify the tool into a semantic category
  const category = classifyTool(event.toolName);        // line 58
  // 2. Record the trajectory node
  const node = trajectoryCollector.record(event, category); // line 64
  // 3. Evaluate all rules
  const verdict = engine.evaluate(node);                 // line 67
  // 4. Apply the action
  if (verdict.action === 'BLOCK') {
    return { block: true, message: verdict.reason };
  }
  if (verdict.action === 'WARN') {
    return { warn: verdict.reason };
  }
  return { pass: true };
}
\`\`\`

### 20.2 Import Map

| Component                | Source File                          | Import Path                         |
|--------------------------|--------------------------------------|-------------------------------------|
| ContextManagementEngine  | src/engines/context-engine.ts:1      | ../engines/context-engine           |
| TrajectoryCollector      | src/state/trajectory-collector.ts:1  | ../state/trajectory-collector       |
| classifyTool             | src/utils/tool-classifier.ts:12      | ../utils/tool-classifier            |
| REFERENCE_PATHS          | src/config/reference-paths.ts:1      | ../config/reference-paths           |

### 20.3 Gate Transition Wiring

Gate transitions are emitted by the gate state machine. The engine listens
for transitions to run T-5 (required category check):

    gateStateMachine.on('transition', (event) => {
      const verdict = engine.checkRequiredCategories(event.toGate);
      if (verdict.action === 'BLOCK') {
        event.preventDefault();
      }
    });`,
  },

  // ==========================================================================
  // EVIDENCE FORMAT
  // ==========================================================================
  evidenceFormat: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§21 Evidence Output Format',
    lines: '3901-4000',
    why:
      'Shows a JSON schema with field-level documentation and a complete sample output object. ' +
      'Every field has a JSDoc-style comment explaining its purpose. The sample includes ' +
      'realistic values so the LLM knows what populated output looks like.',
    excerpt: `## 21. Evidence Output Format

### 21.1 Schema

\`\`\`typescript
interface CMEEvidence {
  /** Session ID for correlation with other hooks. */
  sessionId: string;
  /** Gate at time of evaluation. */
  gate: GateName;
  /** Timestamp of the evaluation (ms since epoch). */
  timestamp: number;
  /** Trajectory length at evaluation time. */
  nodeCount: number;
  /** Per-rule verdicts (T-1 through T-5). */
  verdicts: TrajectoryVerdict[];
  /** Final aggregate action applied by the engine. */
  finalAction: 'BLOCK' | 'WARN' | 'PASS';
  /** Blind spots encountered during evaluation. */
  blindSpots: BlindSpotReport[];
  /** Rule that triggered the final action (null if PASS). */
  triggeringRule: string | null;
}
\`\`\`

### 21.2 Sample Output

\`\`\`json
{
  "sessionId": "abc-123-def",
  "gate": "BUILD",
  "timestamp": 1700000000000,
  "nodeCount": 24,
  "verdicts": [
    {
      "ruleId": "T-1",
      "distance": 0.68,
      "verdict": "MISALIGNED",
      "action": "BLOCK",
      "reason": "TVD=0.75, ordering=0.50, required=1.00"
    },
    {
      "ruleId": "T-3",
      "distance": 0.00,
      "verdict": "ALIGNED",
      "action": "PASS",
      "reason": "No stagnation in last 8 nodes"
    }
  ],
  "finalAction": "BLOCK",
  "blindSpots": [],
  "triggeringRule": "T-1"
}
\`\`\`

### 21.3 Persistence

Evidence is written to \`.trident/cme-evidence/<sessionId>.json\` after every
evaluation. Files are append-only — each evaluation adds a new JSONL line.
This enables post-hoc analysis without modifying the engine.`,
  },

  // ==========================================================================
  // MIGRATION
  // ==========================================================================
  migration: {
    source: 'CME_CONTEXT_MANAGEMENT_ENGINE_SPEC.md',
    section: '§22 Migration Strategy',
    lines: '4001-4032',
    why:
      'Shows the EXACT rollback specificity — not "have a rollback" but ' +
      '"Step 1: Disable T-5 BLOCK. Step 2: If still failing, disable all interventions. ' +
      'Step 3: Legacy logic remains available." Each phase has a day estimate and a gate.',
    excerpt: `## 22. Migration Strategy

### 22.1 Phase 1: Parallel Deployment (Day 1-2)

- Deploy new engine alongside legacy logic
- New engine runs in observe-only mode (no interventions applied)
- Compare new verdicts with legacy behavior
- **Gate:** zero crashes, zero false positives in observe mode

### 22.2 Phase 2: Advisory Mode (Day 3-4)

- Enable T-2 (context freshness) and T-3 (stagnation) interventions
- T-1, T-4, and T-5 remain observe-only
- **Gate:** advisory interventions accepted by agents >80% of the time

### 22.3 Phase 3: Full Enforcement (Day 5-6)

- Enable all rules including T-1 (trajectory) and T-5 (required category)
- Remove legacy code path
- **Gate:** 96%+ pass rate on container test suite

### Rollback Plan

1. **If Phase 2 shows >20% rejection rate:** disable new rules, stay in observe mode
2. **If Phase 3 shows >5% false positive rate:** disable T-5 BLOCK only, keep others
3. **If still failing:** disable all interventions. Legacy logic remains available
   behind a feature flag until Phase 3 gate passes cleanly.`,
  },
};
