// src/subagents/trident-auditor/firewall/fix-scope.ts
// THE FIX_SCOPE_LEXICON (W9, spec §7.4:3473-3533, R10.4, K8.3, O5.3).
//
// THE SYSTEM: the auditor's write/edit/fix-apply tool.before hooks. The input:
// the target file + the report's declared fix files. The decision:
// ALLOW_FIX | BLOCKED. The auditor is the enforcement arm — it WRITES (unlike
// the bug hunter), but its writes are mechanically locked to the report's
// DECLARED FIX FILES (the operator's C1.9: "directly fix all mistakes" made
// safe by "intentionally separated so we dont pollute architecture").
//
// THE STATE MACHINE (§7.4.1:3480-3489):
//   PARSED
//     ├─ the target ∈ the report's declared fix files (the shared DB read:
//     │    report_sections.how_to_fix/what_to_do file lists for the active run)
//     │    AND the target EXISTS in the current graph (the current-graph
//     │    resolution) AND the target's lineage is CODE_DERIVED  ──► ALLOW_FIX
//     └─ any other target                                     ──► BLOCKED
//   THE FAIL-STATE IS BLOCKED — a fix to a file the report never declared, a
//   fix to a file that no longer exists (the stale declaration, G14.2), a fix
//   to a SPEC_DERIVED node (the declared architecture) — all BLOCK.
//
// THE CURRENT-GRAPH RESOLUTION (§7.4.2:3496-3515, G3.9): the allowlist is NOT
// a static snapshot. A declared file the build agent moved/renamed/deleted is
// a stale reference — the auditor must report it, never silently re-anchor it
// (the L7.1 guard). The declared-file string is matched against the current
// graph's CODE_DERIVED/HYBRID node files ONLY — a SPEC_DERIVED node carries a
// CORPUS ANCHOR (a doc file:line), not a code location, and a naive string
// match would false-positive on it (the W9 forward-map trap).
//
// THE DECISION LAYER: this is a state machine, never a regex verdict. The
// MPSE triplet rides EVERY decision (no triplet = no decision = no
// enforcement event — the bible §6 contract).
//
// THE D16 SEPARATION: the ONE cross-package type import permitted is the W3
// MPSE/LexiconDecision shape from trident-bug-hunter/firewall/lexicon-types.ts
// — TYPE-ONLY (`import type`, erased at build). A value import would violate
// the auditor↔bug-hunter runtime separation (the ONLY runtime bridge is the
// shared DB + the bus).

import * as path from 'node:path';
import type { MPSE } from '../../trident-bug-hunter/firewall/lexicon-types.js';

// ---------------------------------------------------------------------------
// THE NAMED ERROR + THE DECISION TYPE (O32.1 FIX_SCOPE_BLOCKED)
// ---------------------------------------------------------------------------

/** The exact error text — the base law (the message the hooks throw verbatim). */
export const FIX_SCOPE_ERROR_BASE =
  "fixes are ONLY allowed to the report's declared fix files";

/** The interpolated message — the allowed list appended at the block time
 *  (§7.4.1:3492 "the interpolated list from the shared DB at the block time"). */
export function fixScopeError(allowed: readonly string[]): string {
  return `${FIX_SCOPE_ERROR_BASE}: ${allowed.join(', ')}`;
}

/** THE FIX-SCOPE DECISION — the state machine's output with the MPSE triplet. */
export interface FixScopeDecision {
  verdict: 'ALLOW_FIX' | 'BLOCKED';
  pattern: string;
  token: string;
  message: string;
  mPSE: MPSE;
  // the test aliases — the pseudocode asserts d.state (spec §6.2:2670):
  state: FixScopeDecision['verdict'];
  triplet: MPSE;
}

// ---------------------------------------------------------------------------
// THE CURRENT-GRAPH SHAPE (the fix-scope's resolution input)
// ---------------------------------------------------------------------------

/** The minimal graph-node projection the current-graph resolution consumes —
 *  the D16 boundary: the auditor reads the nodes through the shared DB client
 *  (graph_nodes rows), never through the bug-hunter's GraphAdapter runtime. */
export interface FixScopeGraphNode {
  file: string | null;
  lineage: string;   // SPEC_DERIVED | CODE_DERIVED | HYBRID (O28.4)
}

export interface FixScopeGraph {
  nodes: FixScopeGraphNode[];
}

/** The classify options — the current-graph state (the staleness guard). */
export interface FixScopeOptions {
  /** The current graph nodes. Absent/empty when the graph could not be read. */
  graph?: FixScopeGraph | null;
  /** false when the current-graph resolution is KNOWN to have no record of the
   *  declared file (the spec test pseudocode §6.2:2679 passes {graphExists:false}
   *  to force the stale-declaration block). */
  graphExists?: boolean;
}

// ---------------------------------------------------------------------------
// THE DETECTORS (the mechanical matchers, O5) — the regex is the mechanical
// DETECTOR only (the path normalization + the declared-set membership); the
// DECISION is the FIX_SCOPE_DECISION state machine below.
// ---------------------------------------------------------------------------

/** Normalize a declared/target file for the comparison — strip a :line suffix
 *  (e.g. 'src/engine3/visual-setup-generator.ts:214' → the file), normalize
 *  the separators, resolve the dot segments. */
export function normalizeFixTarget(file: string): string {
  const withoutLine = file.replace(/:\d+(?:-\d+)?$/, '');
  const norm = path.normalize(withoutLine).replace(/\\/g, '/');
  return norm.replace(/^\.\//, '');
}

/** THE DECLARED-SET DETECTOR — is the target in the declared fix files? */
function isDeclared(target: string, declaredFiles: readonly string[]): boolean {
  const norm = normalizeFixTarget(target);
  return declaredFiles.map(normalizeFixTarget).includes(norm);
}

/** THE CURRENT-GRAPH RESOLUTION (§7.4.2) — find the CODE_DERIVED/HYBRID node
 *  whose file matches the target. THE SPEC_DERIVED TRAP: a SPEC_DERIVED node's
 *  `file` is a corpus anchor (a doc file:line), not a code location — it is
 *  EXCLUDED from the match set, so a naive string match cannot false-positive.
 *  Returns null when no code node carries the file (the stale-declaration). */
function resolveGraphNode(
  target: string,
  graph: FixScopeGraph | null | undefined,
): { node: FixScopeGraphNode | null; graphKnown: boolean } {
  if (!graph || !Array.isArray(graph.nodes)) return { node: null, graphKnown: false };
  const norm = normalizeFixTarget(target);
  const codeNode = graph.nodes.find(
    n => n.file !== null && n.file !== undefined && normalizeFixTarget(n.file) === norm && n.lineage !== 'SPEC_DERIVED',
  );
  if (codeNode) return { node: codeNode, graphKnown: true };
  // no code node carries the file — is there ANY node (e.g. a SPEC_DERIVED
  // node) carrying it? If yes the file exists in the graph but is the
  // architecture (not fixable); if no, the declared file is stale (gone).
  const anyNode = graph.nodes.find(
    n => n.file !== null && n.file !== undefined && normalizeFixTarget(n.file) === norm,
  );
  if (anyNode) return { node: anyNode, graphKnown: true };
  return { node: null, graphKnown: true };
}

// ---------------------------------------------------------------------------
// THE STATE MACHINE — classify (the §7.4 FIX_SCOPE_DECISION)
// ---------------------------------------------------------------------------

/** The ALLOW construction — the decision + the MPSE triplet (no triplet = no
 *  decision). The declared-allow is a CLOSED positive contract. */
function allowed(target: string, evidence: string): FixScopeDecision {
  const mPSE: MPSE = { Pattern: 'FIX_SCOPE_DECLARED', State: 'PARSED->ALLOW_FIX', Evidence: evidence };
  return { verdict: 'ALLOW_FIX', state: 'ALLOW_FIX', pattern: 'FIX_SCOPE_DECLARED', token: target, message: '', mPSE, triplet: mPSE };
}

/** THE BLOCK construction — the decision + the interpolated named error. The
 *  reason rides the message (the enforcement note records what was ATTEMPTED —
 *  the stale/SPEC_DERIVED reasons are named, never a bare generic error). */
function blocked(target: string, reason: string, allowedList: readonly string[]): FixScopeDecision {
  const mPSE: MPSE = { Pattern: 'FIX_SCOPE_BLOCKED', State: 'PARSED->BLOCKED', Evidence: reason };
  return { verdict: 'BLOCKED', state: 'BLOCKED', pattern: 'FIX_SCOPE_BLOCKED', token: target, message: `${fixScopeError(allowedList)} — ${reason}`, mPSE, triplet: mPSE };
}

/**
 * THE FIX_SCOPE_LEXICON classify — the decision layer (R10.4).
 *
 * @param input       the target: {file} — the write target the auditor proposes
 * @param declaredFiles the report's declared fix files (report_sections.what_to_do
 *                    file lists for the active run, extracted by the spec-extractor)
 * @param options     the current-graph state — {graphExists:false} forces the
 *                    stale-declaration block; {graph:{nodes}} resolves the target
 *                    against the current graph's CODE_DERIVED/HYBRID node files.
 *
 * THE STATE MACHINE:
 *   PARSED --(target NOT in the declared set)------------------> BLOCKED (undeclared)
 *   PARSED --(declared, graph known, node absent)--------------> BLOCKED (stale, G14.2)
 *   PARSED --(declared, node present but SPEC_DERIVED)---------> BLOCKED (architecture)
 *   PARSED --(declared, code node present)---------------------> ALLOW_FIX
 *   PARSED --(declared, graph unknown/absent)------------------> ALLOW_FIX (the
 *            declared check is the primary contract; the graph resolution
 *            runs at the fix-apply level with the real current graph)
 */
export function classify(
  input: { file: string },
  declaredFiles: readonly string[],
  options?: FixScopeOptions,
): FixScopeDecision {
  const target = input.file;

  // THE FAIL-CLOSED: an empty/malformed target is BLOCKED, never ALLOWed.
  if (typeof target !== 'string' || target.trim() === '') {
    return blocked(String(target), `the empty/malformed target ${JSON.stringify(target)} is not fixable`, declaredFiles);
  }

  // TRANSITION 1 — the declared-set membership (the primary contract).
  if (!isDeclared(target, declaredFiles)) {
    return blocked(target, `the target ${target} is NOT in the report's declared fix files`, declaredFiles);
  }

  // TRANSITION 2 — the current-graph resolution (the staleness guard, G3.9).
  if (options?.graphExists === false) {
    return blocked(target, `the declared file ${target} is absent from the current graph (the file moved/renamed/deleted since the hunt — the stale declaration, G14.2)`, declaredFiles);
  }
  if (options?.graph) {
    const { node, graphKnown } = resolveGraphNode(target, options.graph);
    if (graphKnown && node === null) {
      return blocked(target, `the declared file ${target} does not exist on the current graph (the build agent moved/renamed/deleted it — a fix to a phantom path is the G14.2 class)`, declaredFiles);
    }
    if (node && node.lineage === 'SPEC_DERIVED') {
      return blocked(target, `the declared file ${target} is a SPEC_DERIVED node — the declared architecture is not fixable`, declaredFiles);
    }
  }

  return allowed(target, target);
}

/** THE ENFORCE HOOK — the tool.before entry: the BLOCK throws the named error
 *  BEFORE the write lands (no write path at all). The write NEVER reaches an
 *  undeclared/stale/SPEC_DERIVED target. */
export function enforceFixScope(
  input: { file: string },
  declaredFiles: readonly string[],
  options?: FixScopeOptions,
): FixScopeDecision {
  const decision = classify(input, declaredFiles, options);
  if (decision.verdict === 'BLOCKED') {
    throw new Error(decision.message);
  }
  return decision;
}
