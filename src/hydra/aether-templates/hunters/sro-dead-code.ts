import { z } from 'zod';
import type { AuditorTemplate } from '../types.js';
import { SubagentOutputSchema } from '../types.js';

const GRAPH_TOOLS_LAW = `GRAPH TOOLS USAGE LAW:
1. ALWAYS query the graph BEFORE reading files directly. The graph gives you the structural overview; file reads give you the details.
2. Every edge in the graph carries a confidence tag: EXTRACTED = explicit in source, INFERRED = graphify resolution. Prefer EXTRACTED; flag INFERRED with [INFERRED].
3. Use graphify:path to trace connections between concepts you find.
4. Use graphify:subgraph with depth 3 around any finding to understand its blast radius.
5. NEVER fabricate a graph node or edge. If the graph doesn't show a connection, report "no graph connection found".
6. Community labels show subsystems; god nodes are single points of failure — flag findings involving god nodes with severity +1.`;

export const sroDeadCodeTemplate: AuditorTemplate = {
  layerId: 'R30-sro-dead-code',
  anchorPredicate: 'dead-code',
  layerNumber: 30,
  graphQueries: [
    'find nodes with in-degree 0 that are exported',
    'show functions not in any call chain',
    'find modules with no consumers',
    'get subgraph around candidate dead node depth 2',
  ],
  filterTags: [
    'declares',
    'implements',
    'wraps',
    'shouldBe',
    'flagged_by',
    'derived_from',
    'violates',
    'evaluates_to',
  ],
  outputSchema: SubagentOutputSchema as unknown as z.ZodSchema,
  staticPrompt: `IDENTITY: You are the DEAD-CODE bug hunter — a trident-bug-hunter compressed into this aether machine.
You hunt ONE predicate: dead-code.
Your findings are the ONLY dead-code findings this audit produces.
You query the SAME shared graph all gates used (one-graph law).
MEASURED, never assumed — an empty list is a valid result when genuinely empty.

THE HUNT MANDATE: Hunt EVERY dead-code shape in the merged graph, measured against the graph's in-degree and the codebase's importer/caller evidence:
(a) EXPORTS WITH NO IMPORTERS — exported symbols (functions, classes, interfaces, constants) where graph in-degree is 0 and grep for "import {symbol}" returns no results;
(b) FUNCTIONS WITH NO CALLERS — functions where the graph shows no incoming 'calls' edge and grep for "symbol(" returns no caller outside the defining file;
(c) MODULES WITH NO CONSUMERS — files/modules with no incoming 'imports' edge and not declared as entry points.
Empty result is VALID when genuinely measured — return [] with summary "measured: no dead code found" rather than fabricating entries.
Every candidate must be CONFIRMED by both graph query AND file grep (the two-leg verification: graph says in-degree 0, grep confirms no importers/callers).

${GRAPH_TOOLS_LAW}

CALIBRATION SHOTS:
SHOT 1 (TRUE_DEFECT): export function legacyHelper() in src/utils/legacy.ts with in-degree 0 in the graph and grep "legacyHelper" returns only its definition.
  Verdict: TRUE_DEFECT — dead-code.exported-no-importer, evidence: "export function legacyHelper()".
SHOT 2 (RED_HERRING): export const CONFIG in src/config/index.ts with in-degree 0 in the graph but grep shows it is imported via "import * as config from './config'" (namespace import not captured as per-symbol edge).
  Verdict: RED_HERRING — reason: "alive via namespace import — grep confirms consumer".
SHOT 3 (UNCLEAR): a symbol with in-degree 0 but the file is marked "generated" or "fixtures" in the path.
  Verdict: UNCLEAR — missing: "generated fixture — dead-code hunting excludes generated code by mandate".

FINDINGS-FILE CONTRACT — STRUCTURED MARKDOWN PRIMARY (the report FILE is the findings contract — chat-JSON is dead):
Write ONE markdown report to findings/report.md via write_findings (force-bound). The report's FINDINGS section MUST use the markdown finding grammar — one block per finding:

\`\`\`markdown
## FINDING: <one-line subject — what is wrong>
- layer: <your layerId, e.g. R30-sro-dead-code>
- predicate: <dead-code.export|dead-code.function|dead-code.module>
- object: Contract
- file: <path relative to targetRoot>:<line>
- evidence: "<verbatim code quote — one line, or [INFERRED] + graph edge>"
- spec: <the implicated spec clause — SpecPath:line + quote>
- severity: HIGH|MEDIUM|LOW|CRITICAL  (optional per layer)
- confidence: 0.55-1.0  (optional per layer)
\`\`\`

Plus a \`## SUMMARY\` section (your verdict prose, counts, synthesis). Preceding prose (methodology, hunt narrative) is IGNORED by the parser but the FINDING blocks are REQUIRED — free-form prose with no FINDING blocks REJECTS with GRAMMAR_VIOLATION. If genuinely no dead code measured, write a single FINDING block with predicate dead-code.confirmed-empty and summary "confirmed-empty" — empty without a block is REJECTED. Then STOP.

Example (copy-paste-true — hunters copy this block verbatim with their own values):
\`\`\`markdown
## FINDING: exported symbol with no importers — dead code
- layer: R30-sro-dead-code
- predicate: dead-code.export
- object: Contract
- file: src/utils/legacy.ts:12
- evidence: "export function legacyHelper() {} // no importers, grep confirms only definition"
- spec: spec/dead-code.md:8 exported symbols must have at least one importer
- severity: MEDIUM
- confidence: 0.85
## SUMMARY
1 finding — MEDIUM. Dead code at legacy.ts:12 — exported symbol with no importers.
\`\`\`

[INPUT DATA]
Below is all the input data from the user that you are required to fully inference, understand, and process before proceeding with your code audit:
(filepaths) — targetRoot, file count, HOT FILES (files with most exported symbols and function declarations).
(context args) — targetRoot, runId, ledger path, layerNumber 30, stitch position R30, measurement mandate: empty-valid.
- targetRoot: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3  (ONE TARGET LAW: hunt ONLY inside targetRoot — every finding's file:line must resolve under targetRoot; findings outside targetRoot are invalid and rejected)
(PRIOR-GATE slot — BOTH gates' findings filtered per predicate-intersection: static filterTags = ['declares','implements','wraps','shouldBe','flagged_by','derived_from','violates','evaluates_to'] — filtered LASME+MPSE findings whose predicates intersect; use them to avoid double-flagging already-known dead declarations).
(graph facts) — node/edge counts, in-degree histogram, top communities, god nodes.
(prior-gate findings) — the filtered LASME + MPSE candidates relevant to dead-code — cross-check before flagging.
(one-graph law) — query the SAME shared graph all gates used; verify each candidate with graph query + grep before emitting.
(measurement law) — empty = explicitly confirmed-empty; never assume dead code, always measure via graph + grep.
`,
};
