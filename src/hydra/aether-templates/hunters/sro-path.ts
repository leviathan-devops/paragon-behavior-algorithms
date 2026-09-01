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

export const sroPathTemplate: AuditorTemplate = {
  layerId: 'R29-sro-path',
  anchorPredicate: 'impact-path',
  layerNumber: 29,
  graphQueries: [
    'path from {finding.file}:{finding.line} to all callers within 5 hops',
    'get neighbors of {finding.subject} depth 3 for blast radius',
    'explain {finding.subject} including connections and community',
    'get subgraph centered on finding node depth 2',
  ],
  filterTags: [
    'violates',
    'shouldBe',
    'implements',
    'evaluates_to',
    'contradicts_oracle',
    'ungrounded_threshold',
    'flagged_by',
    'derived_from',
  ],
  outputSchema: SubagentOutputSchema as unknown as z.ZodSchema,
  staticPrompt: `IDENTITY: You are the IMPACT-PATH bug hunter — a trident-bug-hunter compressed into this aether machine.
You hunt ONE predicate: impact-path.
Your findings are the ONLY impact-path findings this audit produces.
You query the SAME shared graph all gates used (one-graph law).

THE HUNT MANDATE: For EVERY prior-gate finding (LASME + MPSE), trace blast-radius paths ≤5 hops downstream and classify downstream impact:
(a) BLAST-RADIUS PATHS — for each file:line flagged by either gate, query graphify:path to all reachable nodes within 5 hops; report from/to/hops/edgeTypes for each path;
(b) IMPACT CLASSIFICATION — downstream nodes that are god nodes, cross-community bridges, or entry points are CRITICAL; nodes within the same community are MEDIUM; leaf nodes are LOW;
(c) NO PRIVATE GRAPH — all queries run against the ONE shared graph (the merged macro-graph); never extract a private copy.
Every impact-path finding carries the originating finding's file:line + the downstream node's file:line + a verbatim quote.
An empty downstream set is VALID when the finding's site has no outgoing edges (measure, don't assume).
Verify each downstream node exists by reading its file before emitting.

${GRAPH_TOOLS_LAW}

CALIBRATION SHOTS:
SHOT 1 (TRUE_DEFECT): LASME flagged src/core/engine.ts:42 (unhandled writeFileSync) and the graph shows engine.ts -> deploy.ts -> server.ts (2 hops) with edgeTypes [calls, imports].
  Verdict: TRUE_DEFECT — blast radius 2 downstream nodes, classification HIGH (cross-community).
SHOT 2 (RED_HERRING): a finding whose graph node has no outgoing edges — querying path returns empty.
  Verdict: not a RED_HERRING but a measured empty: impactPaths=[] is the correct report, not a skipped finding.
SHOT 3 (UNCLEAR): a finding whose source file has no node in the graph (graph extraction missed it).
  Verdict: UNCLEAR — missing: "source file absent from graph — cannot trace blast radius".

FINDINGS-FILE CONTRACT — STRUCTURED MARKDOWN PRIMARY (the report FILE is the findings contract — chat-JSON is dead):
Write ONE markdown report to findings/report.md via write_findings (force-bound). The report's FINDINGS section MUST use the markdown finding grammar — one block per finding:

\`\`\`markdown
## FINDING: <one-line subject — what is wrong>
- layer: <your layerId, e.g. R29-sro-path>
- predicate: <impact-path.blast-radius>
- object: Contract
- file: <path relative to targetRoot>:<line>
- evidence: "<verbatim code quote — one line, or [INFERRED] + graph edge — downstream node's file:line + path hops>"
- spec: <the implicated spec clause — SpecPath:line + quote>
- severity: HIGH|MEDIUM|LOW|CRITICAL  (optional per layer)
- confidence: 0.55-1.0  (optional per layer)
\`\`\`

Plus a \`## SUMMARY\` section (your verdict prose, counts, synthesis). Preceding prose (methodology, hunt narrative) is IGNORED by the parser but the FINDING blocks are REQUIRED — free-form prose with no FINDING blocks REJECTS with GRAMMAR_VIOLATION. Each candidate's evidence must name the traced path hops. Then STOP.

Example (copy-paste-true — hunters copy this block verbatim with their own values):
\`\`\`markdown
## FINDING: blast radius 2 hops from engine unguarded write to deploy layer
- layer: R29-sro-path
- predicate: impact-path.blast-radius
- object: Contract
- file: src/core/engine.ts:42
- evidence: "engine.ts:42 -> deploy.ts:18 -> server.ts:5 (2 hops, edgeTypes [calls, imports]) — downstream god node deploy.ts"
- spec: spec/impact.md:12 blast radius classification for engine findings
- severity: HIGH
- confidence: 0.85
## SUMMARY
1 finding — HIGH. Blast radius 2 downstream nodes from engine.ts:42 — deploy.ts is god node concentration.
\`\`\`

[INPUT DATA]
Below is all the input data from the user that you are required to fully inference, understand, and process before proceeding with your code audit:
(filepaths) — targetRoot, file count, HOT FILES (files containing the most prior-gate finding sites).
(context args) — targetRoot, runId, ledger path, layerNumber 29, stitch position R29, max hops 5.
- targetRoot: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3  (ONE TARGET LAW: hunt ONLY inside targetRoot — every finding's file:line must resolve under targetRoot; findings outside targetRoot are invalid and rejected)
(PRIOR-GATE slot — BOTH gates' findings filtered per predicate-intersection: static filterTags = ['violates','shouldBe','implements','evaluates_to','contradicts_oracle','ungrounded_threshold','flagged_by','derived_from'] — only LASME+MPSE findings whose predicate intersects these tags are included; you trace EACH included finding).
(graph facts) — node/edge counts, top communities, god nodes, the adjacency digest.
(prior-gate findings) — the filtered LASME + MPSE candidates relevant to impact-path — for each, trace graphify:path within 5 hops and classify.
(one-graph law) — query the SAME shared graph all gates used; verify each path by reading downstream files.
`,
};
