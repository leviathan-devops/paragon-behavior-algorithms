// src/subagents/trident-bug-hunter/graph/sqlite-store.ts
// THE SQLITE STORE (W2, spec §3.6 lines 887-1003) — the compaction-inert
// persistence. THE CORE RULE: this file is a THIN FACADE over W1's db.ts — it
// calls THROUGH `openStore` / `writeGraph` / `mirrorToMasterContext`, never
// around them, never a new driver (the zero-add rule: bun:sqlite is the
// runtime-native driver; the driver resolution lives in db.ts's header).
//
// THE LINEAGE-MANDATORY LAW (O28.4): a node/edge without a lineage is REJECTED
// by W1's writeGraph with the LINEAGE_MISSING throw. THIS FILE NEVER
// VALIDATES ITSELF — it passes the rows through so the SAME law that guards
// W1's store guards this one (a second, divergent validator would be the
// degraded-duality risk the law exists to kill).
//
// THE MIRROR (D27): the mirrorToMasterContext copies the graph + the findings
// summaries + the events to <root>/MASTER_CONTEXT/knowledge-graph/graph.db —
// the all-agents awareness surface. The .trident shared.db is the TRUTH; the
// mirror is the SUMMARY (the mirror write failure is the named
// MIRROR_WRITE_FAILED, never a silent skip).
//
// THE STORE PATH (the machine's ONE durable truth, spec §1.3:119):
// <project>/.trident/knowledge-graph/shared.db.

import path from 'node:path';
import type { DbClient } from '../../../shared/knowledge-graph/db.ts';
import { openStore, writeGraph as writeGraphW1, mirrorToMasterContext as mirrorW1 } from '../../../shared/knowledge-graph/db.ts';
import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import type { BuildResult, GraphNode, GraphEdge } from './interface.ts';

/** The store's own convenience surface over W1's DbClient. */
export interface GraphStore {
  readonly dbPath: string;
  /** The lineage-mandatory write: passes THROUGH W1's writeGraph (LINEAGE_MISSING on a lineage-less node/edge). */
  writeGraph(nodes: GraphNode[], edges: GraphEdge[]): void;
  /** The adapter's BuildResult → the store (the wave's MAP actor path). */
  persistBuildResult(result: BuildResult): { nodes: number; edges: number };
  /** The D27 SUMMARY mirror to <root>/MASTER_CONTEXT/knowledge-graph/graph.db. */
  mirrorToMasterContext(): string;
  close(): void;
}

/** Open the shared store for the project. The default path is the machine's
 *  ONE durable truth: <root>/.trident/knowledge-graph/shared.db (spec §1.3:119).
 *  `openStore` applies the WAL + busy_timeout 5000 pragmas (the two-agent write
 *  contention, G3.6) and the C18.4 schema — all in W1's db.ts. */
export function sqliteStore(profile: ProjectProfile, dbPath?: string): GraphStore {
  const p = dbPath ?? path.join(profile.project.root, '.trident', 'knowledge-graph', 'shared.db');
  const db: DbClient = openStore(p);
  return {
    dbPath: p,
    writeGraph(nodes: GraphNode[], edges: GraphEdge[]): void {
      writeGraphW1(db, nodes, edges); // THROUGH W1 — the LINEAGE_MISSING surface
    },
    persistBuildResult(result: BuildResult): { nodes: number; edges: number } {
      writeGraphW1(db, result.nodes, result.edges);
      return { nodes: result.nodes.length, edges: result.edges.length };
    },
    mirrorToMasterContext(): string {
      return mirrorW1(db, profile); // THROUGH W1 — the D27 SUMMARY copy
    },
    close(): void {
      db.close();
    },
  };
}

// The free-function facades — the W2 writers (the harness/map actor) + the
// spec's tests call the db-first form (spec §3.6:934-944), exactly as W1
// exports its own free functions.

/** The db-first lineage-mandatory write facade (spec §3.6:934-944). */
export function writeGraph(db: DbClient, nodes: GraphNode[], edges: GraphEdge[]): void {
  db.writeGraph(nodes, edges);
}

/** The db-first BuildResult persistence facade. */
export function persistBuildResult(db: DbClient, result: BuildResult): { nodes: number; edges: number } {
  db.writeGraph(result.nodes, result.edges);
  return { nodes: result.nodes.length, edges: result.edges.length };
}

/** The db-first mirror facade (the profile the mirror writes under). */
export function mirrorToMasterContext(db: DbClient, profile: ProjectProfile): string {
  return db.mirrorToMasterContext(profile);
}
