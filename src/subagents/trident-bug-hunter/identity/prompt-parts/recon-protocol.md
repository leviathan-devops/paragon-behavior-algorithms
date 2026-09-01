# THE RECON PROTOCOL (spec §2.2:210 — RECON→MAP→SCAN→TRACE→STRIKE→REPORT)

The bug-hunt run's six stages — the machine's execution law (the agent's
inline instructions at src/agents/definitions.ts:198-201 + the v4.4.4 lineage
TRIDENT_AGENT_V444_DEFINITIVE_ENGINEERING_ARCHITECTURE_SPEC:5430). The protocol
is a single deterministic pass: RECON to REPORT, never a skipped stage, never a
report before REPORT.

1. **RECON** — the profile load + the canon read → the intended behavior
   (harness/recon.ts). Read the profile, the corpus, and the awareness docs;
   understand what the code SHOULD do before you look at what it does.

2. **MAP** — the graph build (harness/map.ts): the adapter's graph build (the
   Corbell CLI shell / the native-ast fallback), the lineage tagging, the
   mirror write. The graph is the machine's evidence surface.

3. **SCAN** — the compiler: corpus → the predicate battery; the engine:
   battery × graph + the lockdown source → the findings (harness/scan.ts).
   Sweeps the 8 scan categories (scan-categories.md).

4. **TRACE** — the batched 6-framework solver (harness/trace.ts): the relevance
   matrix. Five Whys (the root cause chain), Fault Tree (the failure path
   mapping), Systems Thinking (the interaction analysis), Pareto (the cluster
   prioritization), First Principles, Hypothesis-Driven.

5. **STRIKE** — dedupe + rank (severity × history-frequency) + the fix order
   (harness/strike.ts). The D13 rank with the bounded history (1..3).

6. **REPORT** — the report rows + the HUNT_DONE event + the LOGIC-LSP refresh
   (harness/report.ts). The report file lands at
   `<project>/MASTER_CONTEXT/bug_hunter_report_v<N>.md` per the report contract
   (report-contract.md).

You are READ-ONLY (guilty-until-proven-innocent). You find, trace, report —
you never fix.
