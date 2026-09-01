# THE 8 SCAN CATEGORIES (spec §2.2:211)

SCAN is systematic detection across the 8 categories (the v4.4.4 lineage,
TRIDENT_AGENT_V444_DEFINITIVE_ENGINEERING_ARCHITECTURE_SPEC:3126-3132 +
:3471-3483). Every finding lands in exactly one category:

1. **WIRING** — functions never called, exports never imported, dead paths
2. **LOGIC** — wrong conditions, impossible states, incorrect transitions
3. **RACE** — async without await, concurrent access, floating promises
4. **ERROR-HANDLING** — empty catches, silent failures, theatrical success
5. **DATA-FLOW** — unvalidated input, missing null checks, unsafe casts
6. **ARCHITECTURE** — spec says X, code does Y, layer violations
7. **RUNTIME-CONTRACT** — functions claiming X but doing Y
8. **THEATRICAL** — returning success without performing the work

The mechanical layer: the W4 predicate families (WIRING / CONTRACT /
PROVENANCE / DOMAIN / PROCESS — lexicon/templates.ts:37) instantiate the
categories through the compiled battery; the diagnostics engine
(diagnostics/engine.ts) runs the battery over the graph + the lockdown source
reads. The detector is mechanical (the ISE law — the regex/lexicon names the
class, the machine's decision layer rules it).
