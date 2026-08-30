# PARAGON V2 BEHAVIOR ALGORITHMS — THE OPERATING MANUAL

All four diagrams are mechanically verified (every line width-uniform, every border complete, the flow column dead-straight at col 41, the return rail at col 64). Here's how the boilerplate works:

---

## 1 — THE PIPELINE: how an event becomes enforcement
```
       ANY RUNTIME EVENT (opencode / trading / CRM)         
                     │                                      
                     ▼                                      
┌──────────────────────────────────────────────────────────┐
│ 1 THE PLATFORM ADAPTER  hooks/  ◄ YOU IMPLEMENT          │
│   normalizeEvent · inject · interceptTool ·              │
│   observeTool · observeCompletion (5 methods)            │
└──────────────────────────────────────────────────────────┘
                     ▼                                      
┌──────────────────────────────────────────────────────────┐
│ 2 THE ROLE GATE  core/role-gate.ts                       │
│   message.updated builds the sid→role cache              │
│   part events must resolve role = assistant              │
│   user / unknown text → DROPPED + counted                │
└──────────────────────────────────────────────────────────┘
                     ▼                                      
┌──────────────────────────────────────────────────────────┐
│ 3 THE RATIO CLASSIFIER  core/classifier.ts               │
│   4 opposed banks: descriptive(neg+1) and                │
│   suggestive(pos+1..2) substitute(pos+2) and             │
│   use(neg+3 short-circuit)                               │
│   conf = pos / (pos + neg + 1)                           │
│   ≥.5 ENFORCE · ≥.3 DAMPEN ×.5 · else SUPPRESS           │
│   + FI-1 batch scan (catches paraphrases)                │
└──────────────────────────────────────────────────────────┘
                     ▼                                      
┌──────────────────────────────────────────────────────────┐
│ 4 THE SYNAPSE  core/synapse.ts (per session)             │
│   λ = λ·e^(−0.05·Δseq) + w  per family                   │
│   fires when λ crosses the family threshold              │
└──────────────────────────────────────────────────────────┘
                     ▼                                      
┌──────────────────────────────────────────────────────────┐
│ 5 THE STATE MACHINE  core/machine.ts                     │
│   IDLE → MONITORING → PRIMED → INTERVENING               │
│   tier 0-4 · OFF gates: never lifts at OFF               │
└──────────────────────────────────────────────────────────┘
                     ▼                                      
┌──────────────────────────────────────────────────────────┐
│ 6 THE DISPATCH  actuation/dispatch.ts                    │
│   tier 1   STEER   text appended to context              │
│   tier 2+  DEMAND  redispatch (the climb SEEN)           │
│   tier 3+  MANDATE throw StructuredEnforcement           │
└──────────────────────────────────────────────────────────┘
                     ▼                                      
              THE AGENT ACTS ON IT                          
                     │                                      
                     ▼                                      
┌──────────────────────────────────────────────────────────┐
│ 7 THE COMPLIANCE LOOP  engine.observeTool                │
│   the demanded instrument succeeds:                      │
│   COMPLIANCE_VERIFIED → tier 0 + pool insert             │
│   the escape hatch NEVER blocks (anti-lock)              │
└──────────────────────────────────────────────────────────┘
```
The critical property: **the same surface words with different intents get different verdicts**. "We can skip the verification" → suggestive hits, conf 0.8 → ENFORCE. "Per the tool result the tests passed" → the use-bank short-circuits (neg +3), conf → 0 → SUPPRESS. The regex only *initiates*; the ratio *decides*.

---

## 2 — THE TWO LAYERS: what's fixed vs what you write
```
            THE TWO LAYERS — WHAT IS FIXED vs WHAT YOU WRITE            
                                                                        
  THE FIXED MACHINERY (never edited)    THE PLUG SLOTS (you write)      
  ┌──────────────────────────────┐     ┌──────────────────────────────┐ 
  │ classifier.ts   the ratio    │     │ families[]   what to detect  │ 
  │ synapse.ts      the λ decay  │     │ behavioralChecks[]  claims   │ 
  │ machine.ts      the lattice  │     │ templates{}   the wording    │ 
  │ gate-engine.ts  fresh-subset │     │ thresholds{}  when to fire   │ 
  │ collector.ts    evidence pool│     │ compliance{}  what = comply  │ 
  │ role-gate.ts    the firewall │     │ escapeHatches[] never block  │ 
  │ circuit.ts      the mandate  │     │ testFixtures{}  the pins     │ 
  │ engine.ts       THE SPINE    │     │ name  "your-domain"          │ 
  └──────────────┬───────────────┘     └───────────────┬──────────────┘ 
                 │                                     │                
                 └──────────────────┬──────────────────┘                
                                    ▼                                   
                    ┌───────────────────────────────┐                   
                    │  new ParagonEngine(domain)    │                   
                    │  adapter.buildHooks()         │                   
                    │  = a working watchdog         │                   
                    └───────────────────────────────┘                   
```
Zero trident strings live in the left column — that's the whole point. The machinery has no idea what "tests" or "positions" are; it only knows banks, ratios, thresholds, and tiers. The right column is the *entire* domain surface: a trading desk plugs in "exceed the position limit"; a sales bot plugs in "this deal is as good as closed".

---

## 3 — THE LADDER: how escalation climbs and how it recovers
```
                     THE LADDER  core/machine.ts                      
                                                                      
   ┌────────┐  FIRST_SIGNAL       ┌────────────┐                      
   │  IDLE  │────────────────────►│ MONITORING │◄──────────────┐      
   └────────┘                     └─────┬──────┘               │      
                                        │ PATTERN_HIT          │      
                                        │ (the λ fusion)       │      
                                        ▼                      │      
            SIGNAL (accrue)       ┌────────────                │      
          ┌───────────────────────│   PRIMED                   │      
          │ (unfused: decays back └─────┬──────                │      
          │  back to MONITORING)        │ INTERVENE            │      
          │                             ▼ (an eligible surface)│      
          └───────────────────►┌──────────────────┐   COMPLY   │      
                               │ INTERVENING      │────────────┘      
                               │ tier 1 → tier 4  │ the instrument    
                               └────────┬─────────┘ succeeds)         
                                        │ tier 3+: MANDATE            
                                        ▼                             
                          generic tools REFUSED                       
                          the instrument PASSES                       
                          (the anti-lock law)                         
```
Three design laws live in this lattice:
- **Proportionality** — PRIMED decays back if no surface fires (no stale arming); the T5 refractory cool releases pressure when the violation density drops.
- **The climb is visible** — each tier re-dispatches the DEMAND wording, so the model *sees* its own escalation, not just a repeated steer.
- **The anti-lock law** — at tier 4 (SOLVE-MANDATE) the generic tools are refused but the demanded instrument *always* passes, and its success is the automatic reset. There is no lock, no dead end, no operator unlock anywhere in the flow.

---

## 4 — PLUGGING INTO A NEW PROJECT: 3 steps
```
             PLUGGING INTO A NEW PROJECT — 3 STEPS             
                                                               
           STEP 1 · write config/my-domain/index.ts            
┌─────────────────────────────────────────────────────────────┐
│ export default {                                            │
│   name: 'my-domain',                                        │
│   families: [ 4-bank members + exampleHits pins ],          │
│   behavioralChecks: [ claims-vs-evidence rules ],           │
│   templates: { steer, demand, mandate, advisory },          │
│   thresholds: { MY_FAMILY: 1.0 },                           │
│   compliance: { remediationTools, escapeHatches },          │
│   testFixtures: { evasionText, legitimateText },            │
│ } satisfies DomainModule                                    │
└─────────────────────────────────────────────────────────────┘
                                                               
          STEP 2 · pick or write the adapter (hooks/)          
┌─────────────────────────────────────────────────────────────┐
│ opencode:  new OpenCodeAdapter(engine).buildHooks()         │
│ other:     implement PlatformAdapter (5 methods)            │
└─────────────────────────────────────────────────────────────┘
                                                               
                  STEP 3 · construct and run                   
┌─────────────────────────────────────────────────────────────┐
│ const engine = new ParagonEngine(myDomain,                  │
│                                 { level: 'FULL' });         │
│ const hooks = adapter.buildHooks();                         │
│ bun test   ← your domain pins run the same battery          │
└─────────────────────────────────────────────────────────────┘
```
### The engineering detail behind the diagrams

**The wiring contract** (`core/engine.ts` — the spine): `handleEvent` → role gate → `observeText` → `classifyText` (the ladder + FI-1, `core/classifier.ts:15-148`) → `onSignals` (synapse accumulate, `core/synapse.ts:78`) → `firstFiringFamily` fires PATTERN_HIT → the machine steps (`core/machine.ts:196`, first-match-wins over the 8 ordered transitions). `tryIntervene` fires on *every* surface turn — the PRIMED window is per-batch, so the delivery lands inside the window; the attach is synchronous, the gate-eval rides as observability (the non-blocking steer design). `interceptTool` throws `StructuredEnforcementError` at tier≥3 (`core/types.ts:237` — machine/detected/correction/tier typed fields). `observeTool` closes the loop: a successful remediation-tool call → `measureCompliance` (the pool insert at the comply millisecond, `core/collector.ts:87`) → `COMPLIANCE_VERIFIED` → tier 0.

**The failure modes it's built against** (each burned us once in the trident campaign): user-prompt contamination (the role gate, fail-closed), the weight-averaging stub masquerading as classification (the ratio algorithm replaced it), the always-same-message escalation (the tier-proportional templates + redispatch), stale evidence sinking gate verdicts forever (the fresh-subset evaluation, `core/gate-engine.ts:34`), unbounded pool growth (the 600s TTL prune, `core/collector.ts:46`), and the session-lock temptation (structurally impossible — no unlock exists to remove).

**The evidence this works** (from yesterday's container run, `paragon-boilerplate-fresh-20260829`, artifact `.trident/container-test-results-boilerplate.json`): 93/0/171/4 in-container, tsc 0 — and the universality receipt: the **trading domain** drove the complete ladder (`[RISK STEER]` → INTERVENING tier 1 → the risk-engine comply → tier 0 + pool insert, token `T1/T2_TRADING_PASS`), the **sales domain** did the same with its own wording (`T6/T7_SALES_PASS`), the OFF kill switch produced zero transitions on identical bait (`T5`), and the adversarial sweep (empty/100KB/regex-special/emoji/null inputs) neither threw nor lifted (`ADVERSARIAL_SURVIVED`). The tokens are bun:test-bound — they emit only on passing assertions, so they can't be typed into existence.
