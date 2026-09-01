# WARHEAD: BUG-HUNTER-FIRST + CONCURRENCY-FIRST (v1 — 2026-08-23)

## THE TRIGGER

ANY bug-finding, defect-hunting, red-team, or "what's broken" task on a codebase with a
wired bug-hunter machinery. ANY new shared-state or store added to the system.

## THE LAWS

### LAW 1 — THE MACHINERY IS THE FIRST RESORT
Manual hook-crawling, hand-grepping control flow, and personal debugging are the LAST
resort — never the first move. Before touching code in an investigation:
1. Run `trident-bug-hunter-hunt` against the target with the project profile.
2. Read its findings; only THEN descend manually into what it flagged.
MANUAL-FIRST DEBUGGING WHEN THE MACHINE EXISTS IS A DERAILMENT — it wastes the operator's
time re-discovering bug classes the corpus already encodes.

### LAW 2 — THE CORPUS MUST BE MACHINE-ACTIONABLE
A rule corpus written as PROSE CONTRACTS ("session state must be per-session rows") compiles
to ZERO matchable patterns → empty battery → zero scan coverage → a FALSE-CLEAN report on a
dirty tree. Every corpus rule must carry (or reference) a mechanically detectable pattern:
a named symbol, a call shape, a structural signature. After authoring: verify the compiled
battery has ≥1 actionable card per rule; a zero-card compile is a LOUD fail (inconclusive),
never a clean pass.

### LAW 3 — ZERO-FINDINGS ON A NON-TRIVIAL TARGET IS SUSPECT
A hunt over 100+ files / thousands of indexed methods returning ZERO findings is presumed
FALSE-CLEAN until coverage is proven: rules-compiled count > 0, scan coverage count > 0,
per-stage execution logged. The report writer must receive that coverage data and print it.
An empty-data report whose generation still "succeeds" = the false-clean class (the Plutus
W10 lesson; reproduced live on trident-v443 2026-08-23).

### LAW 4 — THE REPORT WRITER STRIPS ITS OWN THINKING
A generated artifact must NEVER contain the model's meta-commentary ("The user is asking…",
"Let me think…", "This is tricky…"). The thinking-preamble law applies to EVERY generation
surface: parseProbeResult AND the report writer AND any future LLM-composed deliverable.
Strip-before-seal is mandatory; a leaked deliberation stream in a sealed artifact is a
CRITICAL defect.

### LAW 5 — CONCURRENCY-FIRST STORES
Every SQL store added to this system MUST, at creation:
- `PRAGMA journal_mode=WAL` (persistent; N readers + 1 writer never block readers)
- `PRAGMA busy_timeout ≥ 5000` on every connection (writers queue, never crash)
- Per-scope isolation by construction (per-session rows or per-project files) — no shared
  mutable keys across sessions/projects
- NO install/data under /tmp (wiped by design)
Verified pattern: poseidon-state sessions.db (the model). Violating instance: corbell
workspace.db pre-migration (locked-db crashes across concurrent hunts).

### LAW 6 — HUNTS ARE SINGLETONS, BUILDS ARE EXPLICIT
Only ONE hunt may run at a time (global lockfile; second caller receives
HUNT_ALREADY_RUNNING). The minutes-long graph build NEVER runs inside a tool call by
default (`graph.rebuild: false`); the index is rebuilt explicitly when the tree changes.
Orphan-proofing: long commands exec via `exec` prefix (shell self-replaces) so timeouts
kill the real worker, never orphaning torch-loaded grandchildren.

## ENFORCEMENT HOOKS

- preflight.sh: the corbell tripwire fails the gate when the durable installs vanish.
- READER-NULL probe + sampler: feed-death prints itself (audit-events).
- Hunt reports must carry the coverage block (rules compiled / stages executed / methods
  scanned) — absent coverage block = inconclusive, not clean.
