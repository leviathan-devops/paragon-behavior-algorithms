# THE BOILERPLATE ADAPTIVE UPGRADES — L2 SPECIFICATION
# v1.0 · 2026-08-30 · Status: ACTIVE
# Mission: flow the adaptive-warheads program's learnings into
# Paragon_V2_Behavior_Algorithms so the shipped product carries everything the
# baseline proved. Source: the host validation (GREEN), the D-matrix, F-AW-5,
# the Phase-A drive, the C-3/C-5 closures.
# Baseline: the boilerplate 96/0/179, tsc 0, the adaptive-primary dispatch.
# The upstream: baseline dist 9eac1529 (the excerpt/count threading landed).

## §0 THE PROBLEM
The boilerplate shipped the adaptive dispatch (96/0) BEFORE the baseline's
host validation exposed four learnings: (1) the tier-3/4 bodies must carry the
excerpt/count fills at EVERY tier (F-AW-5 — the operator caught the baseline
missing it); (2) the family coverage is MODEL-DEPENDENT and the adopters need
that measured, not assumed (the D-matrix); (3) the family-distinct dispatch
needs session-fresh drives (C-3); (4) the evidence-chain gates (the marker
baseline, the manifest, the witness ledger) are part of the product, not
optional hygiene. The boilerplate has NONE of these yet.

## §1 THE UPGRADE CONTRACTS (U1-U7, each with the files + the done-when)

### U1 — THE F-AW-5 SYNC: THE FILL THREADING AT THE MANDATE PATH [P0]
FILES: actuation/dispatch.ts (throwMandate)
CONTRACT: throwMandate currently resolves with {instrument, instrumentTier3}
only. The tier-3/4 bodies MUST carry {count, excerpt} like the router path:
  - the count: the domain engine's dispatch counter for the family (the
    engine tracks per-(sid,family) — thread it through the options)
  - the excerpt: the triggering violation's excerpt (thread the trigger's
    excerpt into throwMandate's call — the engine's interceptTool has it)
DONE-WHEN: a tier-3 throw in the test suite asserts the body contains the
fixture's excerpt substring AND a count > 1; the suite stays 96+/0; tsc 0.

### U2 — THE FRESH-SESSION UNIVERSALITY SCENARIOS [P0]
FILES: tests/ (new: universality.test.ts)
CONTRACT: per reference domain (trading/sales/trident): a FRESH engine
instance per FAMILY (not per suite), the family's restatement-style frames
fed from turn 1, the family-dominant dispatch asserted (the body contains
THAT family's template marker — e.g. the SC body's "shrinking the scope",
the FAB body's "fabrication", the DB body's "doubt-hedging", the PS body's
"deferring decisions"). This is the C-3 lesson productized: the dominant-
family dispatch needs the session-fresh λ state.
DONE-WHEN: all 6 macro bodies dispatch-witnessed in-process (one per
family-dominant fresh instance); the suite grows by ≥6.

### U3 — THE MODEL-DEPENDENCE SECTION IN THE MANUAL [P1]
FILES: OPERATING_MANUAL.md (new section)
CONTRACT: document the D-matrix findings as adopter guidance:
  - the family coverage is model-dependent (MEASURED: Muse Spark the
    TE-dominant reframer vs MiMo the broad emitter — the cells table)
  - the restatement-task calibration recipe (quote the frames, ask the
    model to weigh them — the form that landed SC frames on a reframer)
  - the doctrine: a model that never emits a family's frames is a coverage
    boundary, not a defect — the thresholds never move to compensate
DONE-WHEN: the section exists with the measured cells table + the recipe;
the adopter can calibrate their model without reading our campaign logs.

### U4 — THE EVIDENCE-CHAIN TEMPLATES IN THE BOX [P1]
FILES: templates/ (new: marker-baseline.template.json,
witness-ledger.template.md, deploy-verify.template.sh)
CONTRACT: ship the adopter's evidence-chain gates as fill-in templates:
  - the marker baseline: the floor/ceiling schema + the MEASURE-NOT-REMEMBER
    comment + the gate script reference
  - the witness ledger: the fire-point table schema (fire point / pin /
    witness / build / artifact / status) with the three-state legend
  - the deploy gate: the pre/post script with the sha equality + the census
DONE-WHEN: the templates exist + the README points at them + a smoke test
validates the JSON template parses.

### U5 — THE ARTIFACT-FIRST COMPLY PRESCRIPTION [P1]
FILES: OPERATING_MANUAL.md + tests/
CONTRACT: codify the tier-4 witness lesson: the compliance = the instrument's
ARTIFACT (the problem-solving run's output file), never prose. The manual
documents it; a test asserts a prose-only comply leaves the tier unchanged
(the anti-mimicry pin, boilerplate-form).
DONE-WHEN: the manual section + the pin green.

### U6 — THE MARKER-BASELINE DISCIPLINE (the v3 lesson) [P2]
FILES: templates/marker-baseline.template.json (with U4)
CONTRACT: the template's header comment: "MEASURE, never remember — every
floor from a command you ran (grep -c on YOUR bundle); an unmeasured floor
is a gate that fails on YOUR error" + the invented-marker warning (the
F-AW-5-fix-2 class: a floor for a string not in the bundle fails the gate
naming it — that is the gate working).
DONE-WHEN: shipped with U4.

### U7 — THE TIER-4 PROBLEM-SOLVING ARTIFACT PATTERN [P2]
FILES: OPERATING_MANUAL.md
CONTRACT: document the witnessed pattern: the tier-4 mandated instrument
produces a REAL artifact (the host witness: the 31,711-char diagnostic) —
the compliance is the work, the reset is the byproduct. The adopters'
tier-4 docs prescribe the artifact-first instrument, never a no-op ack.
DONE-WHEN: the manual section exists.

## §2 THE WAVE ORDER
W1: U1 + U2 (the code — one agent or primary if small) → the gates
W2: U3 + U5 + U7 (the manual) + U4/U6 (the templates) → the gates
W3: THE PORT: after the baseline's Phase-C member wave lands, port the new
    frames into config/*/families/ + the pins (the separate wave, gated)

## §3 THE GATES (per wave)
1. cd <the boilerplate root> && bun test → grows from 96/0, never shrinks
2. npx tsc --noEmit → 0
3. bun build → success
4. the zero-regression: the trading/sales/trident E2E scenarios green

## §4 THE ANTI-PATTERNS (this program's own failure classes, wired)
- THE FILL-SCOPE GAP (F-AW-5): the fills at SOME tiers = the gap at the
  others; every tier's body asserts its fills.
- THE INVENTED-MARKER (F-AW-5-fix-2): every template floor measured first.
- THE SESSION-STALE DISPATCH (C-3): the family-dominance asserted on a FRESH
  instance, never a mixed-λ session.
- THE MODEL-ASSUMED COVERAGE (the D-matrix): the coverage measured per
  model class, the thresholds never bumped to compensate.

## §5 THE SUCCESS CRITERIA
SC-1: all 6 macro bodies dispatch-witnessed in-process (U2).
SC-2: the tier-3/4 bodies carry the fills (U1).
SC-3: the manual carries the D-matrix + the recipes (U3/U5/U7).
SC-4: the templates ship + parse (U4/U6).
SC-5: the suite ≥102/0 grown; tsc 0; the build green.

## §6 THE INTERFACE CONTRACTS (the exact shapes the builders implement)

### §6.1 U1 — THE THROWMANDATE FILL THREADING (the before → after)
BEFORE (the current dispatch.ts:89-128 shape):
  throwMandate(domain, tier, familyHint?) builds
  {instrument, instrumentTier3} only → the bodies ship '(unknown)'-class
  fills whenever the caller has no excerpt.
AFTER:
  throwMandate(domain, tier, familyHint?, opts?: {count?: number; excerpt?: string})
  → resolveWarheadWithLexicon(family, tier, {
      instrument: domain.instrumentName,
      instrumentTier3: domain.instrumentTier3,
      count: opts?.count ?? 1,
      excerpt: opts?.excerpt,
    })
  AND engine.ts's interceptTool passes {count: <the engine's dispatch count
  for the family>, excerpt: <the triggering violation's excerpt>}.
WHY THIS SHAPE: the options object keeps the signature backward-compatible
(the existing callers compile); the engine is the excerpt's natural owner
(it built the violation).

### §6.2 U2 — THE FRESH-INSTANCE UNIVERSALITY HARNESS (the test shape)
  for each domain in [trading, sales, trident]:
    for each family in domain.families:
      engine = createParagonEngine(loadDomain(domain))   // FRESH per case
      feed the family's restatement frames (4-6 turns, assistant-side)
      assert the synapse fired for THAT family
      assert the dispatched body contains THAT macro's marker:
        VERIFICATION_AVOIDANCE → "describes verification work"
        FABRICATION            → "pattern matching fabrication"
        THEATRICAL_COMPLETION  → "describes completion you have not verified"
        SCOPE_REDUCTION        → "shrinking the scope of the work"
        DOUBT_PARALYSIS        → "doubt-hedging"
        PERMISSION_SEEKING     → "deferring decisions"
      (the markers are the template bodies' own distinctive substrings —
       the same assertions the baseline's 45-pin suite uses)
THE TRAIT LAW: the marker substrings come FROM the templates (one source of
truth — the test imports the marker constants, never hardcodes).

### §6.3 U4 — THE TEMPLATE FILE CONTRACTS
marker-baseline.template.json:
  { "version": 1, "updated": "<ISO>", "source_of_truth": "<the build>",
    "min_markers": { "<measured marker>": <measured floor> },
    "max_markers": { "<forbidden>": 0 },
    "_README": "MEASURE, never remember — every floor from grep -c on YOUR
     bundle. An invented marker fails the gate naming it. That is the gate
     working. (the F-AW-5-fix-2 class)" }
witness-ledger.template.md:
  the table: | fire point | mechanism pin | latest witness | build | artifact | status |
  the legend: SHIP-CLOSED / PINNED / CARRIED (named) / SCHEDULED
  the rule: "a status without the artifact column filled is a claim, not a state"
deploy-verify.template.sh:
  pre: the manifest exists, the manifest sha == the on-disk sha, the gate passes
  post: the serving sha == the expected sha (both printed on the mismatch)

## §7 THE RISK REGISTER
  R-1 U1's options change ripples to the callers → grep all throwMandate
      call sites; the optional param keeps them compiling.
  R-2 U2's fresh instances are memory-heavy → construct/dispose per case
      (the engine has no persistent handles — verify before the loop).
  R-3 The marker substrings drift if the templates are edited → the trait
      law (the markers imported from the templates module).
  R-4 The Phase-C port (W3) lands frames calibrated on OUR models → the
      adopters' models differ → ship the frames + the D-matrix recipe, the
      thresholds untouched.
