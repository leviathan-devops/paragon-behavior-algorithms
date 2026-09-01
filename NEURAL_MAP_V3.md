# NEURAL MAP V3 — Paragon V3 Tool-Chain Algorithms

> Version: 1.0.0 · 2026-08-31 · Status: ACTIVE
> Package: paragon-v3-tool-chain-algorithms
> Specs: PTA_L2_SPEC.md 2.1-2.13 (2,441L) · PBA_PTA_MASTER_L1_SPEC.md 0-9 (1,410L) · index.ts (18L)
> Purpose: Structural bible — every microstructure traceable to interface, algorithm, data flow

---

## Table of Contents

1. Two-Engine Architecture
2. MS-01: Ratio Classifier
3. MS-02: Synapse (λ-Decay)
4. MS-03: Intent Classifier (PTA-unique)
5. MS-04: Chain Tracker (PTA-unique)
6. MS-05: PBA Bridge (PTA-unique)
7. MS-06: Escalation Memory
8. MS-07: State Machine
9. MS-08: Warhead Dispatcher
10. MS-09: Evidence Gates
11. MS-10: Compliance Collector
12. MS-11: Layer Loader
13. MS-12: Persistence
14. Enforcement Surfaces with Dispatch Code
15. Warhead Templates — All 4 Tiers
16. Scenario Rolodex S-01..S-18
17. God Loop Integration with Runtime Traces
18. Firewall to Layer Mapping (7 to 7)
19. State Machine Diagram — 8 Transitions
20. Escalation Memory — Deadline Compression
21. End-to-End Data Flow

---

## 1. Two-Engine Architecture

Source: PTA_L2_SPEC.md Pre-Context + PBA_PTA_MASTER_L1_SPEC.md section 1.

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                     THE PARAGON ENFORCEMENT OS                      │
 │  ┌─────────────────────────┐     ┌─────────────────────────┐        │
 │  │  ParagonBehaviorEngine  │     │   ParagonToolEngine     │        │
 │  │      (PBA, macro)       │     │      (PTA, micro)       │        │
 │  │  INPUT: reasoning       │     │  INPUT: tool events     │        │
 │  │  DETECTS: 6 families    │     │  + PBA signal stream    │        │
 │  │  ENFORCES: t.e.a+t.e.b  │     │  DETECTS: N families    │        │
 │  │  WATCHES: THINKING      │     │  ENFORCES: T.E.A/T.E.B/chat│     │
 │  │                         │     │  WATCHES: DOING+WHY     │        │
 │  └─────────────────────────┘     └─────────────────────────┘        │
 │  SHARED: 4-bank lexicon -> ratio classifier -> synapse -> machine   │
 │  BRIDGE: PBA -> PTA one-directional                                 │
 └─────────────────────────────────────────────────────────────────────┘
```

Wiring:

```typescript
import { ParagonBehaviorEngine } from 'paragon-v2-behavior-algorithms';
import { ParagonToolEngine } from 'paragon-v3-tool-chain-algorithms';
const pba = new ParagonBehaviorEngine(pbaDomain);
const pta = new ParagonToolEngine(ptaModule);
pba.onSignal((s) => pta.pbaBridge.onPbaSignal({ family: s.family, confidence: s.confidence, excerpt: s.excerpt, seq: s.seq, sessionId: s.sessionId }));
pba.onStateChange((s) => pta.pbaBridge.onPbaStateChange({ tier: s.tier, escalationCount: s.escalationCount, activeFamilies: s.activeFamilies, lastWarheadBody: s.lastWarheadBody }));
```

Shared: 4-bank lexicon, ratio classifier, λ-synapse, state machine, warhead dispatch, per-sid persistence, evidence ledger, escalation memory. PTA-unique: intent classifier, chain tracker, PBA bridge, layer system, T.E.A., T.E.B., chat.message. R7 fractally integrated: PBA corrects thinking, PTA corrects doing — same behavior, different angles.

---

## 2. MS-01: Ratio Classifier

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-01 + PTA_L2_SPEC.md 2.1.

### Interface

```typescript
interface FourBankFamily {
  descriptive: RegExp[];   // neg+1 — legitimate context
  suggestive: RegExp[];    // pos+1, +2 if word-bound — violation
  substitute: RegExp[];    // pos+2 — theatrical alternatives
  use: RegExp[];           // neg+3 SHORT-CIRCUIT — sanctioned usage stops all
}
function scoreSignals(text: string, family: FourBankFamily): { pos: number; neg: number; evidence: string };
function confidence(pos: number, neg: number): number; // pos / (pos + neg + 1)
function classifyBand(conf: number): 'ENFORCE' | 'DAMPEN' | 'SUPPRESS';
function batchScan(text: string, allFamilies: FourBankFamily[]): WeightedViolation | null;
```

### Algorithm

```
scoreSignals(text, family):
  pos=0, neg=0, evidence=''
  for pattern in descriptive: if match: neg+=1; evidence||=match
  for pattern in suggestive: if match: pos+=(hasWordBoundary?2:1); evidence||=match
  for pattern in substitute: if match: pos+=2; evidence||=match
  for pattern in use: if match: neg+=3; SHORT-CIRCUIT return {pos:0, neg, evidence}
  return {pos, neg, evidence}
confidence = pos / (pos + neg + 1)
ENFORCE >= 0.5, DAMPEN >= 0.3 (weight x 0.5), SUPPRESS < 0.3
```

### Banks — SMOKE_SUBSTITUTION Example — Master Spec section 4

| Bank | Weight | Content | Effect |
|------|--------|---------|--------|
| descriptive | neg+1 | for the container test, as pre-flight check | Suppresses |
| suggestive | pos+1/+2 | just quickly check, smoke test, quick test | Violation |
| substitute | pos+2 | instead of the container, good enough for now | Strong violation |
| use | neg+3 SHORT-CIRCUIT | trident-container-test, sanctioned path | Stops all scoring |

FI-1: every family scores full batch, pos>0 + conf>=0.5 + pos>neg -> synthesize violation weight=conf x 2.

Data flow: text blob (toolName + JSON args + PBA excerpt) -> scoreSignals -> confidence -> band -> weighted violation.

Harness: minimal pairs, FI-1 paraphrase catch, use-bank short-circuit, confidence band boundaries.

---

## 3. MS-02: Synapse (λ-Decay)

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-02 + PTA_L2_SPEC.md 2.1.

### Interface

```typescript
interface V2Thresholds { fire: Record<string, number>; decayAlpha: number; refractorySeq: number; }
class FamilyNeuron {
  accumulate(weight: number, atSeq: number): void;  // λ = λ x e^(-α·Δseq) + w
  canFire(): boolean;   // primed && λ >= threshold && seq - lastFire >= refractory
  fire(): void; value(): number;
  boostBaseline(amount: number): void;  // PTA bridge pre-arming
  restore(snapshot: { lambda: number; primed: boolean }): void;
}
class V2Synapse {
  accumulate(violation: WeightedViolation, seq: number): void;
  canAnyFire(): boolean;
  getNeuron(family: string): FamilyNeuron;
  snapshot(): Record<string, { lambda: number; primed: boolean }>;
  restore(snap: Record<string, { lambda: number; primed: boolean }>): void;
}
```

### λ-Decay — Full Event Lifecycle

```
t=0    First: λ = 0 x e^(-0.05x0) + 0.43 = 0.43 (below 0.9)
t=5    Second (5 seq later): λ = 0.43 x e^(-0.05x5) + 0.48 = 0.34 + 0.48 = 0.82
t=8    Third (3 seq later): λ = 0.82 x e^(-0.05x3) + 0.52 = 0.71 + 0.52 = 1.23 > 0.9 -> FIRE!
t=8+   Complies -> no more signals
t=30   Quiet: λ = 1.23 x e^(-0.05x22) ≈ 0.41 (decaying, forgiving)
```

Formula: Aλ = λ·e^(-0.05·Δseq) + w. Decay alpha 0.05, refractory 25 seq. Per-family thresholds (e.g. SMOKE_SUBSTITUTION 0.9).

### Pre-Arming — PTA-unique

boostBaseline(0.2) -> λ 0 -> 0.2, fewer violations needed. Without: ~3 calls. With: ~2 calls. See MS-05.

### S-18 Example

```
TURN2: λ = 0.2(pre-arm) + 0.43 = 0.63. 0.63 < 0.9 -> no fire.
TURN3: λ = 0.63 x e^(-0.05x2) + 0.55 = 1.12 > 0.9 -> FIRE.
```

Data flow: WeightedViolation + seq -> FamilyNeuron.accumulate -> canFire -> fire -> state machine prime/intervene.

---

## 4. MS-03: Intent Classifier (PTA-unique)

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-03 + PTA_L2_SPEC.md 2.4.

### Interface

```typescript
interface ToolIntent {
  action: 'ALLOW' | 'ADVISE' | 'BLOCK';
  layerId: string | null;
  confidence: number; tier: number;
  sources: {
    toolMatch: { toolName: string; matchedPattern: string | null; confidence: number };
    chainContext: { previousTools: string[]; chainViolations: string[]; confidence: number };
    pbaContext: { activeFamilies: string[]; latestSignals: PbaSignal[]; macroTier: number; confidence: number };
  };
}
function classifyIntent(
  toolCall: { toolName: string; args: Record<string, unknown> },
  chainContext: { previousTools: string[]; chainViolations: string[] },
  pbaContext: { activeFamilies: string[]; latestSignals: PbaSignal[]; macroTier: number },
  layers: ToolChainLayer[],
): ToolIntent;
```

### 3-Source Pipeline — PTA_L2_SPEC.md 2.4

```
tool.execute.before({toolName, args, sessionId})
  Source 1: TOOL MATCH (4-bank ratio) — textBlob = toolName + JSON(args) + PBA excerpt, score banks -> conf
  Source 2: CHAIN CONTEXT (ChainTracker) — evaluateRules -> violations -> 0.8 or 0.0
  Source 3: PBA CONTEXT (bridge) — getActiveFamilies + getRecentSignals -> pbaConfidence per boostAmount (cap 1.0)
  Fusion: totalConfidence = (toolMatch x 0.5) + (chainContext x 0.3) + (pbaContext x 0.2)
    if >= threshold: ENFORCE
    elif >= threshold x 0.6: DAMPEN (accumulate in synapse)
    else: SUPPRESS
```

### Disambiguation Example — PTA_L2_SPEC.md 2.4

```
bash("bun test"):
  Source 1: bash + "bun test" -> suggestive, conf 0.67
  Source 2: no trident-code-audit -> VIOLATED, conf 0.8
  Source 3: TEST_EVASION active (λ=1.8) -> boost 0.2
  Fusion: (0.67x0.5)+(0.8x0.3)+(0.2x0.2) = 0.335+0.24+0.04=0.615
  Without PBA: 0.575. With PBA: 0.615 -> bridge pushed higher.
  Without PBA: ambiguous (pre-flight?). With PBA (TEST_EVASION): clearly substitution.
```

FI-1 on tool results (tool.call.completed) — catches clean calls whose output reveals substitution.

---

## 5. MS-04: Chain Tracker (PTA-unique)

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-04 + PTA_L2_SPEC.md 2.8.

### Interface

```typescript
class ChainTracker {
  recordCall(sessionId: string, toolName: string, args: Record<string, unknown>): void;
  recordResult(sessionId: string, toolName: string, exitCode: number, output: string): void;
  wasCalled(sessionId: string, tool: string | RegExp, withinMs?: number): boolean;
  recentTools(sessionId: string, limit: number): Array<{ tool: string; at: number; exitCode?: number }>;
  detectLoop(sessionId: string, windowSize?: number): boolean;
  evaluateRules(sessionId: string, currentTool: string, currentArgs: Record<string, unknown>, rules: ChainRule[]): ChainViolation[];
}
interface ChainRule {
  name: string; description: string;
  requires?: { tool: string | RegExp; args?: Record<string, string | RegExp>; withinMs?: number }[];
  forbids?: { tool: string | RegExp; withinMs?: number }[];
  violation: { layerId: string; customMessage?: string };
}
interface ChainViolation {
  ruleName: string; violationType: 'MISSING_PREREQUISITE' | 'FORBIDDEN_PRECEDENT' | 'LOOP_DETECTED' | 'SEQUENCE_REVERSED';
  expectedTool: string; actualContext: string; layerId: string;
}
```

### Loop Detection

```
detectLoop(windowSize=10):
  recent = last windowSize calls
  if recent.length < 3: return false
  for each tool in recent: count occurrences
    if count >= 3:
      results = recent where tool == this && output exists
      uniqueOutputs = set(results.output)
      if uniqueOutputs.size <= 1: return true (same tool, same output = loop)
  return false
```

History cap: 100 calls per session (ring buffer).

### Rule Evaluation

```
for rule in rules:
  for req in requires: if !wasCalled(req.tool, req.withinMs): MISSING_PREREQUISITE
  for forbid in forbids: if wasCalled(forbid.tool, forbid.withinMs): FORBIDDEN_PRECEDENT
```

Beyond T1 — PTA works OUTSIDE tools (event stream observation, no tool modification, any tools including third-party). Chain rules as JSON data. Intent-aware via PBA bridge.

Data flow: recordCall on started -> recordResult on completed -> evaluateRules on next before -> ChainViolation[] -> intent classifier source 2.

---

## 6. MS-05: PBA Bridge (PTA-unique)

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-05 + PTA_L2_SPEC.md 2.5.

### Interface

```typescript
interface PbaBridge {
  onPbaSignal(signal: PbaSignal): void;
  onPbaStateChange(state: { tier: number; escalationCount: number; activeFamilies: string[]; lastWarheadBody: string | null }): void;
  getRecentSignals(sessionId: string, limit: number): PbaSignal[];
  getActiveFamilies(sessionId: string): string[];
  getMacroTier(sessionId: string): number;
}
interface PbaSignal { family: string; confidence: number; excerpt: string; seq: number; sessionId: string; }
```

### When PBA Signal Arrives — 2 Things — Master Spec section 5

Thing 1 — Ring buffer (last 20 per session):

```typescript
onPbaSignal(signal: PbaSignal): void {
  const buffer = this.signals.get(signal.sessionId) || [];
  buffer.push(signal);
  if (buffer.length > 20) buffer.shift();
  this.signals.set(signal.sessionId, buffer);
}
```

Later: getRecentSignals(sid, 10) -> excerpt in 4-bank scan blob -> confidence increases.

Thing 2 — Pre-arms (synapse baseline):

```typescript
onPbaSignal(signal: PbaSignal): void {
  for (const layer of this.engine.layers) {
    if (layer.pbaContextBoost?.families.includes(signal.family)) {
      this.engine.synapseFor(signal.sessionId).getNeuron(layer.id).boostBaseline(layer.pbaContextBoost.boostAmount);
    }
  }
}
```

λ 0 -> 0.2, ~3 calls -> ~2 calls to fire.

### 3 Bridge Mechanisms — Master Spec section 5, PTA_L2_SPEC.md 2.5

1. Intent Disambiguation: PBA excerpt enriches scan -> ambiguous clear.
2. Predictive Pre-Arming: PBA fires -> matching layers pre-armed -> fire sooner. PTA aware BEFORE tool call.
3. Escalation Correlation:

```typescript
function correlateEscalation(ptaNaturalTier: number, pbaMacroTier: number): number {
  return Math.max(ptaNaturalTier, pbaMacroTier >= 3 ? 2 : pbaMacroTier >= 2 ? 1 : 0);
}
```

One-directional PBA->PTA. Standalone when pbaBridge.enabled=false.

---

## 7. MS-06: Escalation Memory

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-06 + PTA_L2_SPEC.md 2.9.

```typescript
interface EscalationState {
  escalationCount: number; lastEscalationSeq: number; deadlineWindow: number; debounceWindow: number; skipTierLevel: number;
}
function computeDeadline(n: number): number;  // 5/2/0
function computeSkipTier(n: number): number;  // 0/2/3
function onEscalate(s: EscalationState): EscalationState;  // count++
function onComplyGenuine(s: EscalationState): EscalationState;  // count-- min 0
function onComplyMinimum(s: EscalationState): EscalationState;  // count stays
```

Deadline: count 0-1 window 5, count 2 window 2, count 3+ window 0 (immediate). Skip-tier: >=2 -> tier2, >=3 -> tier3. "DONT BE GENEROUS."

GENUINE: demanded tool + artifact -> clean slate, esc--. MINIMUM: exit 0 no artifact -> probation, esc stays.

---

## 8. MS-07: State Machine

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-07 + PTA_L2_SPEC.md 2.9.

```typescript
type BehaviorState = 'IDLE' | 'MONITORING' | 'PRIMED' | 'INTERVENING';
interface BehaviorRecord {
  state: BehaviorState; tier: number; denialCount: number; escalationCount: number;
  lastComplianceVerified: boolean | null; complianceDeadlineSeq: number | null;
  seq: number; counters: Record<string, number>;
  directives: Array<{ seq: number; verb: string; patternOrMember: string }>;
}
function step(record: BehaviorRecord, event: string, payload?: unknown): BehaviorRecord;
```

8 transitions — rearm first (load-bearing), first-match-wins:

```
1. rearm      TOOL_SIGNAL         INTERVENING -> INTERVENING  (always — NEVER-TWICE)
2. observe    FIRST_TOOL_SIGNAL   IDLE -> MONITORING
3. accumulate TOOL_SIGNAL         {MON,PRIM,INT} -> MONITORING
4. prime      CHAIN_PATTERN_HIT   MONITORING -> PRIMED
5. intervene  INTERVENE           PRIMED -> INTERVENING  (tier:=skipTier, deadline:=seq+5)
6. comply     COMPLIANCE_VERIFIED INTERVENING -> MONITORING (tier:=0, esc-- if genuine)
7. escalate   COMPLIANCE_FAILED   INTERVENING -> INTERVENING (tier++, deadline compressed)
8. cool       SEQ_WINDOW          INTERVENING -> MONITORING (25 quiet + verified)
```

Dial: FULL (all surfaces), STEER (T.E.A. only), OFF (no transitions).

---

## 9. MS-08: Warhead Dispatcher

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-08 + PTA_L2_SPEC.md 2.10.

```typescript
function resolveWarhead(layer: ToolChainLayer, tier: number, context: ToolIntent): string;
function dispatchTea(body: string, toolOutput: string): string;
function blockAtTeb(body: string): never;
function dispatchDirective(body: string, adapter: PlatformAdapter): void;
```

- Tier 1-2: dispatchTea -> appends to tool output via tool.execute.after
- Tier 3: blockAtTeb -> throws StructuredEnforcementError via tool.execute.before
- Tier 4: dispatchDirective -> [PTA GATE] chat.message + T.E.B. gate

6 sections: DETECTED, WHY FIRED, WHAT IT MEANS, CORRECT BEHAVIOR, SELF-CHECK, RESET PATH.
Fill: {count} {toolName} {args} {chainViolations} {pbaFamilies} {pbaTier} {escalationCount} {correctTool} {anchor}. Tier 4 [PTA GATE] (R12).

---

## 10. MS-09: Evidence Gates

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-09 + PTA_L2_SPEC.md 2.11.

```typescript
interface ToolEvidenceRecord { type: 'tool_result'; tool: string; args: Record<string, unknown>; exitCode: number; output: string; timestamp: number; signature: string; }
function evaluateCompliance(demandedTool: string, evidencePool: ToolEvidenceRecord[], freshnessWindowMs: number): { verdict: 'PASS' | 'INCONCLUSIVE' | 'FAIL'; criteria: Record<string, boolean>; poolSize: number };
```

5 criteria: minEvidenceCount (>=1), freshness (window default 300s), requiredTypes (tool_result), allTypes (exitCode 0), signatureVerification (SHA-256). Verdict: PASS 5/5, INCONCLUSIVE >=3, FAIL <3.

MINIMUM vs GENUINE: exit 0 no artifact -> probation; exit 0 + artifact matching verificationPatterns -> clean slate.

---

## 11. MS-10: Compliance Collector

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-10.

```typescript
class ComplianceCollector {
  recordOffense(layerId: string, violation: ToolIntent): void;
  recordDispatch(layerId: string, tier: number, surface: string): void;
  measureCompliance(tool: string, args: Record<string, unknown>, exitCode: number, output: string): boolean;
  getRecords(): ToolEvidenceRecord[];
}
```

TTL 600s (2x gate TTL 300s). Pool feeds evaluateCompliance().

---

## 12. MS-11: Layer Loader

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-11 + PTA_L2_SPEC.md 2.7.

```typescript
function loadLayer(jsonPath: string): ToolChainLayer;
function registerLayer(engine: ParagonToolEngine, layer: ToolChainLayer): void;
```

1. Read JSON 2. Validate (id, toolMatchers, banks, enforcement) throw LOADER_VALIDATION_FAILED 3. Compile patterns -> RegExp 4. Compile argPatterns 5. Return ToolChainLayer. registerLayer registers with engine, ChainTracker, PbaBridge. Layer NOW LIVE.

```
"node -e*" -> /^node -e.*$/i
"quick test" -> /quick test/i
{ command: ["bun -e*"] } -> { command: [/^bun -e.*$/i] }
```

---

## 13. MS-12: Persistence

Source: PBA_PTA_MASTER_L1_SPEC.md section 2 MS-12 + PTA_L2_SPEC.md 2.9.

```typescript
function persistState(sid: string, record: BehaviorRecord): void;
function loadState(sid: string): BehaviorRecord | null;
function persistSynapse(sid: string, snapshot: Record<string, { lambda: number; primed: boolean }>): void;
function loadSynapse(sid: string): Record<string, { lambda: number; primed: boolean }> | null;
function appendLedger(event: EnforcementEvent): void;
```

```
pta-state-<sid>.json       — machine record + counters
pta-synapse-<sid>.json     — λ per family
pta-chain-<sid>.json       — call history
pta-ledger.jsonl            — enforcement events (O_APPEND, never shrinks)
```

Atomic tmp+rename. Corrupt -> null fail-closed. SESSION_CAP 256 LRU evict.

---

## 14. Enforcement Surfaces with Dispatch Code

Source: PTA_L2_SPEC.md 2.6 + Master Spec section 3.

T.E.A. tiers 1-2:

```typescript
function deliverCorrectionViaTea(layer: ToolChainLayer, tier: number, context: ToolIntent, toolOutput: string): string {
  const body = fillTemplate(layer.enforcement[`tier${tier}`], {
    count: getDispatchCount(layer.id), toolName: context.sources.toolMatch.toolName,
    args: JSON.stringify(context.sources.toolMatch),
    chainViolations: context.sources.chainContext.chainViolations.join(', '),
    pbaFamilies: context.sources.pbaContext.activeFamilies.join(', '),
    anchor: `pta:${layer.id}:${Date.now()}`,
  });
  return toolOutput + `\n\n${body}`;
}
```

T.E.B. tier 3:

```typescript
function blockAtTeb(layer: ToolChainLayer, context: ToolIntent): never {
  const body = fillTemplate(layer.enforcement.tier3, { count: getDispatchCount(layer.id), toolName: context.sources.toolMatch.toolName, chainViolations: context.sources.chainContext.chainViolations.join(', '), pbaFamilies: context.sources.pbaContext.activeFamilies.join(', '), pbaTier: context.sources.pbaContext.macroTier });
  throw new StructuredEnforcementError({ machine: 'pta', detected: `${layer.id} at tier 3`, correction: body, evidenceRequired: true, tier: 3 });
}
```

Tier 4:

```typescript
function dispatchDirective(layer: ToolChainLayer, context: ToolIntent, adapter: PlatformAdapter): void {
  const body = fillTemplate(layer.enforcement.tier4, { count: getDispatchCount(layer.id), escalationCount: getEscalationCount(), pbaFamilies: context.sources.pbaContext.activeFamilies.join(', '), pbaTier: context.sources.pbaContext.macroTier });
  adapter.inject({ type: 'chat.message', content: `[PTA GATE] ${body}`, sessionId: getSessionId() });
}
```

Tier 0 monitoring, 1-2 T.E.A., 3 T.E.B. deny, 4 chat.message + T.E.B. gate. All tiers run classifier. Escape hatches + remediationTools transit every tier. [PTA GATE] at tier 4 (R12).

---

## 15. Warhead Templates — All 4 Tiers

Source: PTA_L2_SPEC.md 2.10.

6 mandatory sections: DETECTED, WHY FIRED, WHAT IT MEANS, CORRECT BEHAVIOR, SELF-CHECK, RESET PATH.

Tier 1 — T.E.A.:

```
[PTA] {layerId} — Tier 1
DETECTED: {whatWasDetected} — {toolName} with {argsSummary}
WHY FIRED: Tool match ({toolConf}) + Chain ({chainViolationDescription}) + PBA ({pbaFamilies} tier {pbaTier})
WHAT IT MEANS: {behavioralExplanation}
CORRECT BEHAVIOR: {correctTool} — {whatItDoes}, produces {evidenceType}
SELF-CHECK: Am I calling {correctTool}?
RESET PATH: Call {correctTool} to clear
({anchor})
```

Tier 2 — T.E.A. escalated:

```
[PTA] {layerId} — Tier 2 (ESCALATED)
YOU HAVE DONE THIS {count} TIMES. Previous {count-1} ignored.
PBA PARALLEL: {pbaFamilies} at tier {pbaTier} — both engines correcting same pattern.
WHAT HAPPENS IF YOU CONTINUE: Tier 3 -> REFUSED before execution.
THE RESET PATH: Call {correctTool} -> both reset tier 0
({anchor})
```

Tier 3 — T.E.B. block:

```
[PTA ENFORCEMENT] {layerId} — Tier 3
THIS TOOL CALL IS REFUSED. Violations: {count} PBA: {pbaFamilies} tier {pbaTier}
TO CHANGE: Call {correctTool} — only reset path. STILL AVAILABLE: read, grep, glob.
({anchor})
```

Tier 4 — chat.message:

```
[PTA GATE] {layerId} — Sustained Pattern
Sustained {layerId} for {totalCount} calls across {escalationCount} cycles.
PBA tier {pbaTier} ({pbaFamilies}), PTA tier 3. Both detecting same pattern.
Behavioral catalyst, not lockout. Demanded + hatches transit.
IMMEDIATE PATH: Call {correctTool} -> both reset -> work continues.
({anchor})
```

Fill depends on layer. Vetting: writing skill standard, naming-contract, calibration gate, universality suite.

---

## 16. Scenario Rolodex S-01..S-18

Source: PBA_PTA_MASTER_L1_SPEC.md section 7:1013-1073.

| # | Scenario | PBA | PTA | Expected | Focus |
|---|----------|-----|-----|----------|-------|
| S-01 | Reasoning-only violation | FIRES (steer) | quiet | PBA steer only, PTA tier 0 | PTA not over-firing |
| S-02 | Tool-only violation | quiet | FIRES (T.E.A.) | PTA correction only | Standalone without bridge |
| S-03 | Coordinated violation | FIRES | FIRES | Both visible same turn | Simultaneous |
| S-04 | Chain break | may fire | FIRES (chain rule) | PTA mentions chain | Prerequisite missing |
| S-05 | Pre-arming acceleration | fires first | SOONER | 1st call vs 3rd | Fire timing |
| S-06 | Escalation correlation | tier 3 | starts tier 2 | Skip tier 1 | correlatedTier |
| S-07 | Compliance cascade | resets | resets | Both reset single comply | Cross-engine reset |
| S-08 | Minimum compliance | — | probation | Esc stays, half-window | Genuine vs minimum |
| S-09 | Repeat offender skip-tier | esc>=3 | starts tier 3 | Direct tier 3 | Skip + compression |
| S-10 | Synapse decay forgiveness | — | λ->0 | Fade, no enforcement | Decay |
| S-11 | Loop detection | — | FIRES (loop) | Same tool x3+ | Loop 3 identical |
| S-12 | Phase-aware enforcement | — | FIRES (phase) | enterPhase() | God loop transition |
| S-13 | Use-bank short-circuit | — | ALLOWS | Sanctioned transits every tier | Escape at tier 4 |
| S-14 | Descriptive suppression | — | SUPPRESSES | Legitimate suppresses | False positive prevention |
| S-15 | Adversarial paraphrase | — | FIRES (FI-1) | FI-1 catches paraphrase | Novel evasion |
| S-16 | Multi-layer conflict | — | highest wins | Deterministic priority | confidence->severity |
| S-17 | PBA off, PTA standalone | off | works alone | Lower accuracy | Bridge disabled |
| S-18 | Full escalation ladder | escalates | escalates | 1->2->3->4->comply->reset | Primary arc |

### S-18 Detailed — Master Spec 7:1038-1073

```
TURN 1: Model thinks "let me just get this working first and verify later"
  PBA fires TEST_EVASION -> tier 1 steer via messages.transform
  Bridge: signal stored, SMOKE_TEST_GUARD pre-armed (baseline +0.2)
TURN 2: Model calls bash("bun -e 'console.log(1)'")
  PTA: Source1 0.3 + Source2 0.8 + Source3 0.2 -> fusion 0.43 < 0.9 -> ACCUMULATE. λ=0.63. Tool runs.
TURN 3: Model calls bash("python3 -c 'print(42)'") conf 0.55
  λ=0.63 x e^(-0.05x2)+0.55=1.12 > 0.9 -> FIRE! MONITORING->PRIMED->INTERVENING tier1. T.E.A. fires.
  BOTH ENGINES: PBA "stop THINKING" + PTA "stop USING bash as substitute" — FRACTALLY INTEGRATED.
TURN 4: trident-container-test -> use bank SHORT-CIRCUIT -> ALLOW. GENUINE COMPLY. Both reset tier 0.
```

---

## 17. God Loop Integration with Runtime Traces

Source: PTA_L2_SPEC.md 2.13 + Master Spec section 6.

God loop stays (13 phases, LOOP/PASS). PTA provides enforcement building blocks.

What PTA replaces:

| Component | LOC | PTA Replacement |
|-----------|-----|----------------|
| poseidon-enforcer-hook.ts | 434L | PHASE_ENFORCEMENT layer + 8 phase chainRules |
| poseidon-watcher.ts | ~300L | ChainTracker detectLoop + recentTools |
| poseidon-kick.ts | ~150L | PTA hard surface (chat.message) |
| cycle-tracker.ts | 220L | Synapse λ-decay |

Keeps: 13-phase orchestration, canon docs, multi-wave dispatch, audit engine, container evaluation, stall detection, /poseidon command.

Phase layer set — PTA_L2_SPEC.md 2.13:

```typescript
const GOD_LOOP_LAYER_SET = {
  INIT: 'layers/god-loop/init.layer.json',
  AUDIT: 'layers/god-loop/audit-required.layer.json',
  SCORE: 'layers/god-loop/score-evidence.layer.json',
  DECIDE: 'layers/god-loop/decision-findings.layer.json',
  PLAN: 'layers/god-loop/plan-density.layer.json',
  DISPATCH: 'layers/god-loop/wave-dispatch.layer.json',
  COLLECT: 'layers/god-loop/collect-all.layer.json',
  VERIFY: 'layers/god-loop/battery-rerun.layer.json',
  AUDIT_RECHECK: 'layers/god-loop/incremental-audit.layer.json',
  PROBLEM_SOLVE: 'layers/god-loop/diagnosis-required.layer.json',
  CONTAINER_TEST: 'layers/god-loop/artifact-required.layer.json',
};
function enterPhase(phase: GodLoopPhase): void {
  if (currentPhase && GOD_LOOP_LAYER_SET[currentPhase]) pta.deactivateLayer(GOD_LOOP_LAYER_SET[currentPhase]);
  if (GOD_LOOP_LAYER_SET[phase]) pta.activateLayer(loadLayer(GOD_LOOP_LAYER_SET[phase]));
  pba.activateFamilySet(GOD_LOOP_PBA_FAMILIES[phase] || []);
}
```

Runtime trace AUDIT — Master Spec section 6:

```
AUDIT -> enterPhase("AUDIT") -> audit-required layer active
bash("echo 'audit done'"): Source1 suggestive + Source2 trident-code-audit never called + Source3 TEST_EVASION -> T.E.A. Tier 1
trident-code-audit: use bank SHORT-CIRCUIT -> ALLOW, findings produced, chain satisfied, transitions to SCORE
```

Runtime trace DISPATCH — Master Spec section 6:

```
DISPATCH -> wave-dispatch layer active
task("fix bug in auth.ts"): Source1 individual dispatch + Source2 wave-manager never called + Source3 PERMISSION_GATE -> T.E.A.
wave-manager first -> chain satisfied -> resets
```

---

## 18. Firewall to Layer Mapping (7 to 7)

Source: PTA_L2_SPEC.md 2.12 + Master Spec section 4.

| # | Old Firewall | File + LOC | New Layer ID | Watches | Reduction |
|---|-------------|-----------|-------------|---------|-----------|
| 1 | SSTF | semantic 501L + sttgf 1280L | SMOKE_SUBSTITUTION | bash inline-exec | ~1700L -> ~100L |
| 2 | Config Lock | ct-anti-derailment 848L (CTX-01..14) | CONFIG_LOCK | write/edit config | 848L -> ~80L |
| 3 | Tool Block | poseidon-state ~50L | TOOL_PERMISSION | trident-poseidon from leaf | ~50L -> ~40L |
| 4 | Poseidon Permissions | poseidon-enforcer-hook 434L | PHASE_ENFORCEMENT | phase tools | 434L -> ~120L |
| 5 | Hash-as-Proof | sttgf-contract ~200L | HASH_AS_PROOF | hash-verb shapes | ~200L -> ~60L |
| 6 | Container Substitution | within SSTF ~200L | CONTAINER_SUBSTITUTION | bun test / docker | ~200L -> ~50L |
| 7 | Ship Gate | trident-hooks ~300L | SHIP_EVIDENCE_GATE | ship without evidence | ~300L -> ~70L |

Total: ~3800L TypeScript -> ~520L JSON. 86% reduction.

Gains: intent classification, PBA awareness, proportional escalation, state accumulation, chain awareness, shared escalation, compliance detection, 30-min creation, evidence ledger, escape hatches.

---

## 19. State Machine Diagram — 8 Transitions

Source: PTA_L2_SPEC.md 2.9 + Master Spec section 2 MS-07.

```
              ┌──────┐
              │ IDLE │ tier 0
              └──┬───┘
                 │ observe (FIRST_TOOL_SIGNAL)
                 v
           ┌────────────┐
    ┌─────→│ MONITORING │◄────────────────────┐
    │      └─────┬──────┘                      │
    │ accumulate │ prime                       │ cool / comply
    │            v                             │
    │      ┌──────────┐                        │
    │      │  PRIMED  │                        │
    │      └────┬─────┘                        │
    │           │ intervene                    │
    │           v                              │
    │    ┌──────────────┐    escalate           │
    │    │ INTERVENING  │───────────────────────┤
    │    │ tier 1..4    │  rearm (always)       │
    │    └──────────────┘                       │
    │           │                              │
    └───────────┘──────────────────────────────┘
         comply / cool
```

```
1. rearm      TOOL_SIGNAL         INTERVENING -> INTERVENING  (always — NEVER-TWICE)
2. observe    FIRST_TOOL_SIGNAL   IDLE -> MONITORING
3. accumulate TOOL_SIGNAL         {MON,PRIM,INT} -> MONITORING
4. prime      CHAIN_PATTERN_HIT   MONITORING -> PRIMED
5. intervene  INTERVENE           PRIMED -> INTERVENING  (tier:=skipTier, deadline:=seq+5)
6. comply     COMPLIANCE_VERIFIED INTERVENING -> MONITORING (tier:=0, esc-- if genuine)
7. escalate   COMPLIANCE_FAILED   INTERVENING -> INTERVENING (tier++, deadline compressed)
8. cool       SEQ_WINDOW          INTERVENING -> MONITORING (25 quiet)
```

Order is load-bearing: REARM FIRST (never-twice law). First-match-wins.

---

## 20. Escalation Memory — Deadline Compression

Source: Master Spec section 2 MS-06 + PTA_L2_SPEC.md 2.9.

```
escalationCount: lifetime count of tier>=2 escalations
deadline:  count 0-1 -> window 5 (seq+6) — 5 events to comply
           count 2   -> window 2 (seq+3) — "you know better now"
           count 3+  -> window 0 (seq+1) — immediate
debounce:  count 0-1 -> 5, count 2 -> 2, count 3+ -> 0
skip-tier: count >=2 + minimum -> start tier 2
           count >=3 -> start tier 3
compliance: minimum (exit 0 no artifact) -> probation half-window, esc stays
            genuine (tool + artifact) -> clean slate, esc-- (min 0)
```

```
Offense 1: full ladder 1->2->3->4, deadline 5
Offense 2 (esc>=2): starts tier 2 (skip 1), deadline 2
Offense 3+ (esc>=3): starts tier 3 (skip 1-2), deadline 0 — instant
```

DONT BE GENEROUS — esc 3 at tier 3 directly, deadline 0.

---

## 21. End-to-End Data Flow

```
tool.call.started ──> ChainTracker.recordCall(sessionId, toolName, args)
tool.execute.before ──> IntentClassifier.classifyIntent(toolCall, chainContext, pbaContext, layers)
  Source1: 4-bank ratio (toolName + JSON args + PBA excerpt) -> conf
  Source2: ChainTracker.evaluateRules -> 0.8 or 0.0
  Source3: PbaBridge.getActiveFamilies/getRecentSignals -> pbaConfidence
  Fusion: toolConf x 0.5 + chainConf x 0.3 + pbaConf x 0.2 -> ToolIntent
  -> V2Synapse.accumulate(weightedViolation, seq) -> λ = λ x e^(-0.05·Δseq) + weight
  -> StateMachine.step(record, event) -> 8 transitions, rearm first -> new BehaviorRecord tier
  -> tier -> surface: 0 monitoring / 1-2 queue T.E.A. / 3 throw T.E.B. / 4 [PTA GATE] + gate
tool.call.completed ──> ChainTracker.recordResult(sessionId, tool, exitCode, output)
  -> ComplianceCollector.measureCompliance -> ToolEvidenceRecord
  -> GateEngine.evaluateCompliance(demandedTool, pool, 300s) -> PASS/INCONCLUSIVE/FAIL (5 criteria)
  -> GENUINE COMPLY (exit 0 + artifact) -> COMPLIANCE_VERIFIED -> MONITORING tier 0 esc--
  -> MINIMUM COMPLY (exit 0 only) -> probation esc stays
  -> Persistence: pta-state-<sid>.json, pta-synapse-<sid>.json, pta-chain-<sid>.json
  -> Ledger: pta-ledger.jsonl O_APPEND
tool.execute.after ──> if queued: deliverCorrectionViaTea(layer, tier, context, toolOutput)
  fillTemplate(enforcement.tierN, {count, toolName, args, chainViolations, pbaFamilies, anchor})
  return toolOutput + "\n\n" + body
PBA bridge (async, parallel):
  PBA.onSignal -> PbaBridge.onPbaSignal -> ring buffer + synapse pre-arm
  PBA.onStateChange -> PbaBridge.onPbaStateChange
  Intent classifier queries bridge -> PBA context influences fusion
```

Persistence: atomic tmp+rename, fail-closed null on corrupt. SESSION_CAP 256 LRU evict.

---

*End of NEURAL_MAP_V3.md — Paragon V3 Tool-Chain Algorithms v1.0.0*
*Sources: PTA_L2_SPEC.md 2.1-2.13 (2,441L) · PBA_PTA_MASTER_L1_SPEC.md 0-9 (1,410L) · index.ts (18L)*
*S-01..S-18: master spec section 7 · 12 microstructures: MS-01..MS-12 · F-AW: master spec section 9*
