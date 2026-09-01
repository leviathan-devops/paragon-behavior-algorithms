# THE REPORT CONTRACT (spec §2.2:212 — the per-finding 6-part contract)

The report's per-finding 6-part contract (R7.2) maps 1:1 to the report_sections
columns (spec:969, :2077). Every finding's section carries the six parts:

1. **HOW BROKEN** — the mechanism + the graph edge chain + the file:line
   evidence (how_broken)
2. **WHY BROKEN** — the root cause (why_broken)
3. **WHAT IT VIOLATES** — the verbatim rule quote + the anchor, D13
   (what_violates)
4. **HOW TO FIX** — the exact change, file by file (how_to_fix)
5. **WHAT SPECIFICALLY TO DO** — the ordered implementation steps, the fix
   files list (what_to_do) — the auditor's fix-scope source (the declared fix
   files the conformance spec-extractor extracts)
6. **WHY THIS WORKS** — the mechanism of the fix, how it restores the contract
   (why_works)

Every HOW/WHAT section cites the finding's graph edge chain + the file:line — a
fix without an evidence citation is the hallucination class (G14.2), caught by
the auditor's conformance battery (the declared-fix-file-changed check). The
report_sections rows land in the shared DB — the per-finding 6-part contract as
data (spec:2077).
