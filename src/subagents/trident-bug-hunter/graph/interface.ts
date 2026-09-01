// src/subagents/trident-bug-hunter/graph/interface.ts
// THE GRAPHADAPTER CONTRACT (W2, spec §3.2 lines 536-660, C18.1). The machine's
// graph engine is a set of THIN SHELLS behind ONE interface — the machine never
// knows which adapter runs; the diagnostics engine, the query surface and the
// auditor all consume ONLY this surface (the driver contract).
//
// The lineage duality (SPEC_DERIVED | CODE_DERIVED | HYBRID — the operator's
// "clearly identifiable both") is MANDATORY on every node/edge: the store rejects
// a lineage-less node (O28.4). The `source` field is the provenance anchor
// (the corpus file:line for SPEC_DERIVED, the code file:line for CODE_DERIVED).
//
// DESIGN DIVERGENCE (recorded honestly): the spec's §3.2 BuildResult interface
// (lines 576-579) shapes `nodes: number; edges: number` (a COUNT summary), while
// the spec's OWN buildGraph pseudocode (lines 602-607) consumes `result.nodes` /
// `result.edges` as ARRAYS (`store.writeGraph(result.nodes, result.edges)`) and
// the W2 wave directive (the task expansion for Task 1) mandates the array shape
// with the `command` provenance field. This file carries the ARRAY shape — the
// store needs the rows, and the K18.2 duality counts ride alongside in
// `lineage`. The spec's count assertions are satisfied via `.length`.

import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema';

// The adapter classes are VALUE imports here (the selection factory needs the
// constructors at runtime). The adapters themselves import THIS module via
// `import type` ONLY — the type-only imports are erased at build, so there is
// no runtime import cycle (interface → adapter → (erased) interface).
import { CorbellAdapter } from './corbell-adapter.ts';
import { IxAdapter } from './ix-adapter.ts';
import { NativeAstAdapter } from './native-ast-adapter.ts';

// ---------------------------------------------------------------------------
// The lineage duality + the node/edge kinds (spec §3.2:547-568)
// ---------------------------------------------------------------------------

export type Lineage = 'SPEC_DERIVED' | 'CODE_DERIVED' | 'HYBRID';

export const LINEAGES: readonly Lineage[] = ['SPEC_DERIVED', 'CODE_DERIVED', 'HYBRID'];

export type GraphNodeKind =
  | 'class' | 'function' | 'method' | 'module' | 'stage' | 'rule' | 'file';

export type GraphEdgeKind =
  | 'imports' | 'calls' | 'awaits' | 'wires' | 'traces-to'
  | 'constrains' | 'implements' | 'extends';

export type Substrate = 'corbell' | 'ix' | 'native-ast';

/** A graph node. The lineage is MANDATORY; the source is the provenance anchor.
 *  file/line are optional because the SPEC_DERIVED nodes (stage/rule) carry a
 *  corpus anchor, not a code location (mirrors W1's db.ts GraphNode exactly). */
export interface GraphNode {
  id: string;                    // the adapter's canonical id (e.g. 'corbell:<method-uid>' | 'class:Name')
  kind: GraphNodeKind;
  name: string;                  // the symbol / declared name
  file?: string | null;          // the absolute path (or the corpus anchor for SPEC_DERIVED)
  line?: number | null;          // 1-indexed
  lineage: Lineage;              // MANDATORY — the store rejects a lineage-less node (O28.4)
  source: string;                // the provenance anchor: the corpus file:line OR the code file:line
  data?: Record<string, unknown>; // the adapter-specific extras (signature, params, stage contract)
}

/** A graph edge. APPEND-ONLY (INSERT-only) — never UPDATE/DELETE. */
export interface GraphEdge {
  id?: string;                   // assigned by the store
  sourceId: string;              // the GraphNode.id
  targetId: string;
  kind: GraphEdgeKind;
  lineage: Lineage;              // CODE_DERIVED for the code edges; HYBRID for the comparison edges (R5.2)
  file?: string | null;          // the evidence anchor
  line?: number | null;
}

/** A call site: where symbol is invoked. */
export interface CallSite { file: string; line: number; caller: string; }

/** One step of a trace between two nodes. */
export interface ChainStep { from: string; to: string; kind: string; file: string; line: number; }

/** A module's import edge. */
export interface ImportEdge { from: string; to: string; file: string; line: number; }

/** An async edge (a call that is awaited). */
export interface AwaitEdge { from: string; to: string; file: string; line: number; }

/** A node with ZERO inbound callers — the dead-machinery class. */
export interface DeadNode { id: string; name: string; file: string; line: number; }

/** The adapter's build result: the full rows (the store writes them) + the
 *  K18.2 duality counts + the provenance record (the exact CLI command exec'd). */
export interface BuildResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  durationMs: number;
  adapter: Substrate;
  lineage: { spec: number; code: number; hybrid: number };   // the node duality counts (K18.2)
  command?: string;                                           // the provenance: e.g. 'corbell graph build --methods'
}

/** THE driver contract every adapter implements (C18.1). */
export interface GraphAdapter {
  build(profile: ProjectProfile): Promise<BuildResult>;   // → the graph rows, ready for the store
  whoCalls(symbol: string): CallSite[];                    // {file, line, caller}
  chain(id: string): ChainStep[];                          // the trace {from, to, kind, file, line}
  imports(module: string): ImportEdge[];                   // the module's import edges
  awaits(symbol: string): AwaitEdge[];                     // the async edges
  unwired(): DeadNode[];                                   // the 0-inbound-callers (the dead-machinery class)
  nodes(kind?: GraphNodeKind): GraphNode[];                // the typed listings
}

// ---------------------------------------------------------------------------
// The named-error vocabulary (O32.1) — the loud fail-state contract
// ---------------------------------------------------------------------------

/** The base graph error: every failure NAMES its code in the message. */
export class GraphError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

/** ADAPTER_FAILED — the CLI call failed / the binary is missing / the substrate
 *  has no adapter. Carries the command + the detail for the honest report. */
export class AdapterFailedError extends GraphError {
  readonly command: string;
  readonly detail: string;
  constructor(command: string, detail: string) {
    super('ADAPTER_FAILED', `ADAPTER_FAILED: command=${command} detail=${detail}`);
    this.command = command;
    this.detail = detail;
  }
}

/** ADAPTER_PARSE_ERROR — the substrate returned output that does not parse. */
export class AdapterParseError extends GraphError {
  readonly section: string;
  readonly detail: string;
  constructor(section: string, detail: string) {
    super('ADAPTER_PARSE_ERROR', `ADAPTER_PARSE_ERROR: section=${section} detail=${detail}`);
    this.section = section;
    this.detail = detail;
  }
}

/** GRAPH_EMPTY — a build produced zero nodes. A LOUD fail (the engine refuses
 *  to run on an empty graph), never a silent empty success. */
export class GraphEmptyError extends GraphError {
  readonly detail: string;
  constructor(detail: string) {
    super('GRAPH_EMPTY', `GRAPH_EMPTY: detail=${detail}`);
    this.detail = detail;
  }
}

export function adapterFailed(command: string, detail: string): AdapterFailedError {
  return new AdapterFailedError(command, detail);
}

export function adapterParseError(section: string, detail: string): AdapterParseError {
  return new AdapterParseError(section, detail);
}

export function graphEmpty(detail: string): GraphEmptyError {
  return new GraphEmptyError(detail);
}


// ---------------------------------------------------------------------------
// W4 — FamilyGraphStore error vocabulary (spec \u00a73.1 error rules)
// ---------------------------------------------------------------------------

/** FAMILY_ROOT_READONLY — write attempt to the read-only family store (mode=ro). */
export class FamilyRootReadonlyError extends GraphError {
  readonly detail: string;
  constructor(detail: string) {
    super('FAMILY_ROOT_READONLY', `FAMILY_ROOT_READONLY: detail=${detail} (the family store is READ-ONLY mode=ro — a branch writes its own shared.db only)`);
    this.detail = detail;
  }
}

/** FAMILY_ROOT_DRIFT — core hash mismatches the profile-recorded hash (loader validates pre-build). */
export class FamilyRootDriftError extends GraphError {
  readonly expected: string;
  readonly actual: string;
  constructor(expected: string, actual: string) {
    super('FAMILY_ROOT_DRIFT', `FAMILY_ROOT_DRIFT: expected=${expected} actual=${actual} (the core drifted from the profile contract hash — reload the profile or re-seal the core)`);
    this.expected = expected;
    this.actual = actual;
  }
}

/** FAMILY_PROMOTION_PENDING — new file promotion to the core awaits the operator gate (never automatic). */
export class FamilyPromotionPendingError extends GraphError {
  readonly hash: string;
  constructor(hash: string, detail: string) {
    super('FAMILY_PROMOTION_PENDING', `FAMILY_PROMOTION_PENDING: hash=${hash} detail=${detail} (a new file awaits the operator gate — never auto-promoted)`);
    this.hash = hash;
  }
}

export function familyRootReadonly(detail: string): FamilyRootReadonlyError {
  return new FamilyRootReadonlyError(detail);
}

export function familyRootDrift(expected: string, actual: string): FamilyRootDriftError {
  return new FamilyRootDriftError(expected, actual);
}

export function familyPromotionPending(hash: string, detail: string): FamilyPromotionPendingError {
  return new FamilyPromotionPendingError(hash, detail);
}

// ---------------------------------------------------------------------------
// The substrate selection (spec §3.2:595-600) — the profile selects the adapter
// ---------------------------------------------------------------------------

/** Select the adapter for the profile's substrate (spec §3.2:595-600). */
export function selectAdapter(profile: ProjectProfile): GraphAdapter {
  switch (profile.graph.substrate) {
    case 'corbell':
      return new CorbellAdapter(profile);
    case 'ix':
      return new IxAdapter(profile);
    case 'native-ast':
      return new NativeAstAdapter(profile);
    default:
      throw adapterFailed(`substrate=${String(profile.graph.substrate)}`, 'no adapter for the selected substrate');
  }
}
