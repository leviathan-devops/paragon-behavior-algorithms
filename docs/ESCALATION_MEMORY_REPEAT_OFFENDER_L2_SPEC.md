# THE ESCALATION MEMORY + REPEAT-OFFENDER DEADLINE — L2 SPECIFICATION
# v1.0 · 2026-08-30 · Status: ACTIVE — implementation begins this session
# Mission: close the minimum-viable-compliance exploit (G-1/G-2/G-3) — the
# model runs the battery once, gets a full reset, immediately returns to the
# evasion pattern, and gets another full deadline window. The system has no
# escalation memory. This spec gives it one.
# Predecessor: the host validation (GREEN on 9eac1529), the F-AW-8 entry
# (the tester-as-subject tier-4 experience), the D-matrix (the model-dependence
# measured), F-AW-5 (the excerpt/count gap — fixed + verified).
# Baseline: dist 57e5f4f07a631a25 (the Phase-C build), battery 1457/0/4989/73,
# tsc 0, the vendored core INTACT (v2-machine.ts:56-122).

## §0 THE PROBLEM (one sentence)

The compliance reset is unconditional and the re-escalation is identical to the
initial escalation — the model can exploit the cycle (one battery run → full
reset → 10 turns of evasion → one battery run → full reset → forever) because
the system has no escalation memory and no compliance-quality tracking.

## §0.1 THE OPERATOR'S DIRECTIVE (verbatim, 2026-08-30)

"this is what every model does all the time and all systems should be
engineered with this type of behavior in all its forms as the expected default"

"dont be generous"

"what we DONT want is dumb spammy tool call rape that makes it impossible to
do anything and has no sense or intelligence - but this needs to be SELF
ENFORCING and SELF MANAGING the current process is too weak there should not
be an ability to ignore"

## §1 THE THREE GAPS (precisely)

### G-1 THE COMPLIANCE RESET IS UNCONDITIONAL
One battery run erases the entire escalation history. The V2Record's
escalationCount (if it existed) would reset to 0. The model gets a clean slate
regardless of whether its behavior changed. The minimum-viable compliance
exploit: one bun test buys ~10 record events of evasion before the next
escalation begins.

### G-2 THE RE-ESCALATION IS IDENTICAL TO THE INITIAL ESCALATION
After a reset, the model gets the same full deadline window
(complianceDeadlineSeq = seq + ESCALATION_DEADLINE_WINDOW(5) + COMPLIANCE_DEBOUNCE_WINDOW(5)
= seq + 10 record events). A model that has been escalated to tier 3 once
already demonstrated it needs the teeth — but when it returns to the evasion
pattern, it starts at tier 1 with a full advisory window, not at tier 2 with
a compressed deadline.

### G-3 THE ESCALATION HAS NO MEMORY
The V2Record tracks tier, denialCount, and lastComplianceVerified — but NOT
how many times the session has escalated past tier 2. The system treats every
escalation as if it's the first: the same advisory nudge, the same deadline
window, the same graduated approach. A model that's been escalated 5 times
gets the same tier-1 nudge it ignored 5 times.

## §2 THE FIX — 3 SURGICAL CHANGES

### §2.1 CHANGE 1: THE ESCALATION MEMORY (V2Record.escalationCount)

V2Record gains:
  readonly escalationCount: number;

INITIAL VALUE: 0 (createInitialV2Record).
INCREMENT: at every COMPLIANCE_FAILED where the resulting tier >= 2.
NEVER DECREMENTS during the session (the escalation history is the session's
trust deficit — a tier reset doesn't reset the history).
PERSISTED in machine-state-<sid>.json (the isValidRecord validation updates).

THE COUNT DRIVES:
  - the repeat-offender deadline (§2.2)
  - the compliance quality classification (§2.3)

### §2.2 CHANGE 2: THE REPEAT-OFFENDER DEADLINE (the escalate transition)

THE CURRENT ARITHMETIC (v2-machine.ts escalate transition):
  complianceDeadlineSeq = r.seq + 1 + ESCALATION_DEADLINE_WINDOW(5)
  (the debounce window COMPLIANCE_DEBOUNCE_WINDOW(5) gates the tick)

THE NEW ARITHMETIC:
  the DEADLINE_WINDOW scales with the escalationCount:
    escalationCount 0-1: deadline = seq + 1 + 5  (seq + 6, the full window)
    escalationCount 2:   deadline = seq + 1 + 2  (seq + 3, half)
    escalationCount 3+:  deadline = seq + 1 + 0  (seq + 1, the minimum)

  the DEBOUNCE also compresses:
    escalationCount 0-1: debounce = 5 (the full debounce)
    escalationCount 2:   debounce = 2
    escalationCount 3+:  debounce = 0 (the next tick escalates immediately)

THE IMPLEMENTATION: the escalate transition reads r.escalationCount and
computes the window from the table above. The constants
ESCALATION_DEADLINE_WINDOW and COMPLIANCE_DEBOUNCE_WINDOW stay as the
first-offender values (the floor for a new session); the escalationCount
modifiers compress them for the repeat offenders.

### §2.3 CHANGE 3: THE COMPLIANCE QUALITY TRACKING (the comply transition)

THE COMPLIANCE HAS TWO QUALITY LEVELS:
  MINIMUM: the battery run (bun test) — the minimum-viable verification that
    proves the code compiles and the existing tests pass. This is the model
    running ONE command. It does NOT prove the model did real work.
  GENUINE: the problem-solving artifact (trident-problem-solving producing a
    real output file) — the model produced a diagnostic, a plan, or a fix.
    This IS real work.

THE COMPLY TRANSITION CHANGES:
  - the tier ALWAYS resets to 0 (the S14 law: the instrument always passes)
  - IF the instrument was the battery (minimum):
      escalationCount stays (the history remains)
      complianceDeadlineSeq = seq + 1 + HALF the normal window
      (the probation window — the model gets a shorter leash)
  - IF the instrument was the problem-solving (genuine):
      escalationCount decrements by 1 (the real work earns back trust,
      min 0)
      complianceDeadlineSeq = null (the full clean slate)
  - IF the instrument was the container-test (the status check):
      same as the battery (minimum — the status check doesn't prove real work)

THE HOOKS' COMPLIANCE DETECTION (trident-hooks.ts handleComplianceVerified):
  passes the instrument name to the machine so the comply transition can
  classify the quality. The demandedTool is already in scope at the deny
  site — the compliance handler needs to know WHICH instrument complied.

### §2.4 THE INTERVENE TRANSITION (the skip-tier for the repeat offender)

IF escalationCount >= 2 AND the last compliance was MINIMUM:
  the intervene transition sets tier := 2 (skip tier 1 — the model already
  had the advisory nudge and ignored it; the DEMAND is the appropriate
  starting point for a repeat offender)

IF escalationCount >= 3:
  the intervene transition sets tier := 3 (skip to the teeth — the model
  has demonstrated it ignores both the advisory AND the demand)

THIS IS NOT A LOCK: the instrument still passes at every tier (the S14 law).
The model can ALWAYS comply and reset. The skip-tier just means the model
doesn't get another free advisory cycle it already ignored.

## §3 THE FILES TOUCHED (the exact changes)

### §3.1 src/v2/machines/v2-machine.ts (the transition definitions, NOT the frozen core)
- V2Record: += escalationCount: number
- createInitialV2Record: escalationCount: 0
- isValidRecord: validate escalationCount >= 0
- the escalate transition: increment escalationCount when the resulting tier >= 2;
  compute the deadline/debounce from the escalationCount table (§2.2)
- the comply transition: classify the compliance quality (minimum vs genuine);
  the genuine comply decrements escalationCount (min 0); the minimum comply
  sets the probation deadline; the genuine comply clears the deadline
- the intervene transition: the skip-tier logic per §2.4

### §3.2 src/hooks/trident-hooks.ts (the compliance handler)
- the handleComplianceVerified call passes the instrument name (the demandedTool
  or the actual tool name) to the machine so the comply transition classifies

### §3.3 src/tests/v2-machine.test.ts (the new pins)
- the escalationCount increment at the tier-2+ COMPLIANCE_FAILED
- the repeat-offender deadline compression (the escalationCount 2 → the shorter
  deadline)
- the comply quality: the battery comply → the probation window; the
  problem-solving comply → the clean slate + the decrement
- the intervene skip-tier: the escalationCount ≥ 2 + the minimum comply → tier 2
  (not tier 1); the escalationCount ≥ 3 → tier 3
- the S14 pin: the instrument ALWAYS passes at every tier even for the repeat
  offender

### §3.4 src/tests/naming-contract.test.ts (the V2Record shape pin)
- the isValidRecord validation includes escalationCount

## §4 THE GATES (per change, per wave)
1. npx tsc --noEmit → 0
2. cd src/tests && bun test → grows from 1457/0, never shrinks
3. scripts/build-verified.sh → PASS (the baseline floors hold)
4. the targeted pins green (§3.3)
5. the container re-run: the repeat offender escalates faster (the tier-2
   crossing in ≤3 turns instead of 5-6 for the second offense)

## §5 THE ANTI-PATTERNS (what NOT to do)
- DO NOT touch v2-machine.ts:56-122 (the frozen core)
- DO NOT make the instrument blocked at any tier (the S14 law)
- DO NOT remove the battery from the escape hatch (the compliance must always
  be reachable)
- DO NOT make the escalate threshold depend on the compliance quality (the
  escalation is the count of tier-2+ crossings; the compliance quality
  affects the deadline and the skip-tier, not whether the escalation fires)
- DO NOT add the escalation memory to the boilerplate yet (the baseline proves
  it first, then the sync)

## §6 THE SUCCESS CRITERIA
SC-1: the repeat offender's second tier-2 escalation fires in ≤3 turns
      (vs 5-6 for the first)
SC-2: the tier-3+ escalationCount increments and persists across the comply
      resets
SC-3: the minimum comply (the battery) sets the probation deadline; the
      genuine comply (the problem-solving) clears it + decrements the count
SC-4: the intervene skip-tier fires for the escalationCount ≥ 2 + the minimum
      comply (the model starts at tier 2, not tier 1)
SC-5: the battery floor holds (zero regressions); tsc 0; the build gate PASS
SC-6: the container re-run witnesses the faster re-escalation live
