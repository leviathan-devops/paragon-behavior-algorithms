/**
 * supremacy-brief.ts — THE SUPREMACY BRIEF (S3 — the SPEC-2 §2.3/§9.3)
 *
 * THE GROUND-TRUTH ASSEMBLER: the ONLY data the aether brain sees is this brief.
 * It is built by the MACHINERY (the file reads + the binding), NEVER by the model.
 * THE SUPREMACY CONTRACT (SPEC-1 W7, made a BUILT-IN): the FILES/GRAPH are the
 * only ground truth; the context-args are BELIEF; a read that cannot resolve is
 * 'UNREADABLE', never a synthetic window.
 *
 * THE SCOPE LAW: readWindowWithinScope only reads files that resolve WITHIN the
 * resolved targetPath. An absolute path that escapes the root → 'UNREADABLE —
 * out of scope' (the aether is a tool stage — it never reads outside the audited
 * project, the data-exfiltration + the enforcement-ring violation). A missing
 * file → 'UNREADABLE — file absent' (the supremacy honesty, never a fabricated
 * window).
 *
 * S-PB1 delivers the pure machinery: buildSupremacyBrief (the binding) +
 * readWindowWithinScope (the scoped reader). The graph-query bridge (the
 * hotspot/callGraphRef population) wires in the later Step-X waves.
 */
import * as fs from 'fs/promises';
import * as path from 'path';

import type { AuditFinding } from '../types.js';
// THE FR-11 IMPORT-CONTRACT (SPEC-1 §2.10/§15): the graph context comes from the
// bug-hunter's REAL query verbs over the shared.db — ONE shared core, two surfaces.
import { runQuery } from '../../subagents/trident-bug-hunter/surface/query-tool.js';

// ── THE NAMED ERRORS (the loud-fail surface — SPEC-2 §2.9) ──
export const UNREADABLE_OUT_OF_SCOPE = 'UNREADABLE — out of scope';
export const UNREADABLE_FILE_ABSENT = 'UNREADABLE — file absent';

// ── THE MACHINERY FUNCTIONALITY SHAPE (StepXInput['functionality'] — the
//    D17-calibrated machinery output this wave consumes. Typed, never any.)
//    NOTE (the flagged spec deviation): the SPEC-2 §2.3 signature passes only
//    StepXInput['functionality'], which carries NO targetPath — yet the GroundTruth
//    (§2.3) requires targetPath + the source-window reads must resolve WITHIN it.
//    So the brief's machinery input also carries the audited root (the scope law's
//    anchor). The S1 orchestrator fills it from StepXInput.targetPath when wiring
//    the finder closure. NEVER a synthetic root — required, never optional. ──
export interface SupremacyMachinery {
  targetPath: string;
  findings: AuditFinding[];
  graphStats: { nodes: number; edges: number };
  eventStats: { reasoningObservations: number; cadenceToolCalls: number; flowVerdict: string };
  projectContext: { shape: string; isPlugin: boolean };
}

// ── THE SOURCE-WINDOW FINDER CONTRACT (the orchestrator wires the concrete
//    scoped reader — the only file-read path the brief uses) ──
export interface SourceWindowFinder {
  sourceWindow(file: string, line: number): string;
}

// ── THE GROUND TRUTH (the brain's ONLY data — SPEC-2 §2.3/§2.9) ──
export interface BriefedFinding {
  index: number;
  layer: string;
  severity: string;
  category: string;
  file: string;
  line: number;
  evidence: string;         // the ≤120-char evidence slice (the triad)
  sourceWindow: string;     // the ≤80-line excerpt (the deeper-probe material)
  calibration: 'CALIBRATED' | 'EXCLUDED';
  callGraphRef: string | null;
}

export interface GroundTruth {
  targetPath: string;
  projectInfo: { name: string; shape: string; isPlugin: boolean; srcPath: string };
  findings: BriefedFinding[];
  graph: { nodes: number; edges: number; hotspot: string[] };
  events: { flowVerdict: string; cadenceAnomalies: string[] };
}

// ── THE SOURCE-WINDOW BIAS (SPEC-2 §2.12/§9.3.4 — the BECAUSE: enough to show
//    the surrounding function + the caller skeleton without blowing the 4,000-char
//    brief budget; 80 ≈ the longest function in the measured codebase) ──
export const SOURCE_WINDOW_LINES = 80;

/** THE SCOPED SOURCE-WINDOW READER (the supremacy honesty + the scope law).
 *  Resolves the absolute path, verifies it is WITHIN the resolved targetPath,
 *  reads the ≤80-line window centered around the finding's line.
 *  NEVER a synthetic window — a failure yields a named 'UNREADABLE'. */
export async function readWindowWithinScope(
  targetPath: string,
  file: string,
  line: number,
  windowBias: number = SOURCE_WINDOW_LINES,
  windowRadius: number = SOURCE_WINDOW_LINES,
): Promise<string> {
  // ERROR PATHS FIRST (the loud-fail law — never a synthetic window):
  try {
    const root = path.resolve(targetPath);
    const abs = path.resolve(root, file);

    // THE SCOPE LAW: the absolute path must stay WITHIN the resolved root.
    // A '.' + path.sep guard defeats the prefix-collision (a sibling dir named
    // like the root must not alias) + the '../' escape is caught by resolve().
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      return UNREADABLE_OUT_OF_SCOPE;
    }

    const content = await fs.readFile(abs, 'utf8');
    const textLines = content.split('\n');
    if (textLines.length === 0) {
      return UNREADABLE_FILE_ABSENT;
    }

    // THE WINDOW BIAS (SPEC-2 §9.3.4): centered on the finding line — the
    // defect's mechanism lives AROUND the evidence slice, not strictly below it.
    const center = Math.max(0, line - 1);          // 1-indexed → 0-indexed
    const half = Math.max(1, Math.floor(windowRadius / 2));
    const start = Math.max(0, center - half);
    const end = Math.min(textLines.length, start + windowBias);
    return textLines.slice(start, end).join('\n');
  } catch (err) {
    // THE MISSING-FILE / the unreadable → 'UNREADABLE — file absent', never a
    // fabricated window. The error is caught + surfaced as the honest marker.
    void err;
    return UNREADABLE_FILE_ABSENT;
  }
}

/** THE BRIEF BUILDER (SPEC-2 §9.3 — THE GROUND-TRUTH ASSEMBLER). Binds the
 *  D17-calibrated findings + their source windows (via the injected finder) +
 *  the graph + the events into the GroundTruth the brain sees. THE BRIEF IS
 *  BUILT BY THE MACHINERY, NEVER BY THE MODEL.
 *
 *  THE FR-11 GRAPH-QUERY BRIDGE (the S3 mechanism 3 — the import-contract):
 *  when the caller binds the shared-db handle (options.graphDb), the hotspot +
 *  per-finding callGraphRef come from the REAL bug-hunter query verbs
 *  (runQuery 'unwired' / 'who-calls' over the C18.4 store) — ONE shared core,
 *  never a re-implemented traversal. Absent handle → the honest defaults
 *  (the brief stays buildable; the graph context is simply not enriched). */
export interface SupremacyBriefOptions {
  /** The OPEN SharedDb handle (the C18.4 store, structurally minimal) — enables
   *  the FR-11 query bridge (the bug-hunter verbs over the real graph). */
  graphDb?: { prepare(sql: string): unknown; exec(sql: string): void };
}

export function buildSupremacyBrief(
  machinery: SupremacyMachinery,
  finder: SourceWindowFinder,
  options: SupremacyBriefOptions = {},
): GroundTruth {
  // THE ERROR PATHS FIRST: a machinery input missing the findings array is a
  // broken brief — never a silent empty set. The zero-finding case is legal
  // (the empty-target audit skips the aether; the brief carries zero findings).
  const findings = machinery.findings ?? [];
  const graphStats = machinery.graphStats ?? { nodes: 0, edges: 0 };
  const eventStats = machinery.eventStats ?? { reasoningObservations: 0, cadenceToolCalls: 0, flowVerdict: 'UNKNOWN' };
  const projectContext = machinery.projectContext ?? { shape: 'indeterminate', isPlugin: false };

  const root = path.resolve(machinery.targetPath);

  // THE GRAPH-QUERY BRIDGE (the FR-11 import — the bug-hunter's verbs answer
  // "is this finding in a hot or dead path?" identically for the tool + the agent):
  let hotspot: string[] = [];
  const whoCallsRef = new Map<string, string>();
  if (options.graphDb) {
    try {
      // 'unwired' → the dead-code candidates (the hotspot list for the rank input)
      const unwiredRows = runQuery({ verb: 'unwired', format: 'llm' } as never, options.graphDb as never) as Array<Record<string, unknown>>;
      hotspot = unwiredRows
        .map((r) => String(r?.symbol ?? r?.name ?? r?.node ?? '')).filter((s) => s.length > 0).slice(0, 50);
      // 'who-calls' per finding file's basename symbol → the wiring anchor
      for (const finding of findings) {
        const key = `${finding.file}:${finding.line}`;
        if (whoCallsRef.has(key)) continue;
        const rows = runQuery({ verb: 'who-calls', symbol: path.basename(finding.file, '.ts'), format: 'llm' } as never, options.graphDb as never) as Array<Record<string, unknown>>;
        const callers = rows.map((r) => String(r?.caller ?? r?.from ?? '')).filter((s) => s.length > 0).slice(0, 5);
        if (callers.length > 0) whoCallsRef.set(key, `whoCalls(${path.basename(finding.file)}) → ${callers.join(', ')}`);
      }
    } catch (qErr: unknown) {
      // THE BRIDGE NEVER BREAKS THE BRIEF: a query failure degrades to the
      // empty defaults (logged by the orchestrator's drive), never a throw.
      void qErr;
      hotspot = [];
    }
  }

  const briefed: BriefedFinding[] = findings.map((finding, index) => ({
    index,
    layer: finding.layer,
    severity: finding.severity,
    category: finding.category,
    file: finding.file,
    line: finding.line,
    evidence: String(finding.evidence ?? '').slice(0, 120),
    sourceWindow: finder.sourceWindow(finding.file, finding.line),
    calibration: 'CALIBRATED' as const,   // the D17-calibrated set — the ONLY finds judged
    callGraphRef: whoCallsRef.get(`${finding.file}:${finding.line}`) ?? finding.callGraphRef ?? null,
  }));

  return {
    targetPath: root,
    projectInfo: {
      name: path.basename(root) || root,
      shape: projectContext.shape,
      isPlugin: projectContext.isPlugin,
      srcPath: path.join(root, 'src'),
    },
    findings: briefed,
    graph: {
      nodes: graphStats.nodes,
      edges: graphStats.edges,
      hotspot,   // the REAL unwired set when the graphDb is bound (the FR-11 bridge)
    },
    events: {
      flowVerdict: eventStats.flowVerdict,
      cadenceAnomalies: [],   // the W5 event anomalies — populated by the event-query bridge
    },
  };
}
