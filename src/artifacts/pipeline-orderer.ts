/**
 * Pipeline Dependency Ordering Engine — DP L2 Phase 4
 *
 * Transforms a flat DefenseSpec list into a domain-grouped, dependency-sorted
 * pipeline. If defense B consumes a field that defense A produces, A MUST run
 * before B.  Uses Kahn's topological sort with cycle breaking.
 *
 * Determinism: no Date.now(), no Math.random(), stable ordering.
 *
 * @module artifacts/pipeline-orderer
 */

import type { DefenseSpec, DefenseDomain } from './defense-catalog.ts';

/** Directed dependency edge between two defenses. */
export interface PipelineDependency {
  /** Producer defense rule name. */
  from: string;
  /** Consumer defense rule name. */
  to: string;
  /** Fields shared between producer output and consumer input. */
  sharedFields: string[];
  /** True when the consumer cannot run without the producer's output. */
  required: boolean;
}

/** A single phase in the ordered pipeline — one per active domain. */
export interface PipelinePhase {
  /** Phase ID derived from domain (e.g. "phase-evidence"). */
  id: string;
  /** Defense rule names in this phase. */
  defenses: string[];
  /** Domain label. */
  domain: string;
  /** Parallel if no intra-phase deps, sequential otherwise. */
  executionModel: 'sequential' | 'parallel';
  /** Union of all defense inputs. */
  inputs: string[];
  /** Union of all defense outputs. */
  outputs: string[];
  /** Cross-phase dependencies feeding this phase. */
  dependencies: PipelineDependency[];
}

/** Fully ordered pipeline ready for Phase 5 type generation. */
export interface OrderedPipeline {
  phases: PipelinePhase[];
  dependencies: PipelineDependency[];
  /** THE 2026-08-10 FIX: the analysis-engine's orderPipeline fallback assigns
   *  totalRules: 0 (analysis-engine.ts:175) — the field was missing from the
   *  interface (TS2353). The orderer's real outputs carry it. */
  totalRules: number;
}

// --- Internal helpers ---

/** Set intersection of two string arrays. */
function intersect(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

/** Deduplicate a string array preserving order. */
function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

/** Collect dependency edges among a set of defenses. */
function collectDeps(specs: DefenseSpec[]): PipelineDependency[] {
  const deps: PipelineDependency[] = [];
  for (const a of specs) {
    for (const b of specs) {
      if (a.rule === b.rule) continue;
      const shared = intersect(b.inputs, a.outputs);
      if (shared.length > 0) {
        deps.push({ from: a.rule, to: b.rule, sharedFields: shared, required: true });
      }
    }
  }
  return deps;
}

/**
 * Topological sort via Kahn's algorithm.  If a cycle is detected, the weakest
 * edge (lowest in-degree) is removed and the sort recurses.
 */
function topoSort(adj: Map<string, Set<string>>, inDeg: Map<string, number>): string[] {
  const result: string[] = [];
  const nodes = [...adj.keys()].sort();
  const queue = nodes.filter((n) => (inDeg.get(n) ?? 0) === 0).sort();

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const nb of [...adj.get(node)!].sort()) {
      inDeg.set(nb, (inDeg.get(nb) ?? 0) - 1);
      if ((inDeg.get(nb) ?? 0) === 0) {
        const idx = queue.findIndex((q) => q > nb);
        if (idx === -1) queue.push(nb);
        else queue.splice(idx, 0, nb);
      }
    }
    adj.get(node)!.clear();
  }

  if (result.length < nodes.length) {
    const remaining = nodes.filter((n) => !result.includes(n));
    let weakest: { from: string; to: string } | null = null;
    let minW = Infinity;
    for (const from of remaining) {
      for (const to of adj.get(from)!) {
        if (remaining.includes(to)) {
          const w = inDeg.get(to) ?? 0;
          if (w < minW) { minW = w; weakest = { from, to }; }
        }
      }
    }
    if (weakest) {
      adj.get(weakest.from)!.delete(weakest.to);
      inDeg.set(weakest.to, (inDeg.get(weakest.to) ?? 0) - 1);
      return result.concat(topoSort(adj, inDeg));
    }
    return result.concat(remaining.sort());
  }
  return result;
}

/**
 * Order a flat DefenseSpec list into a domain-grouped, dependency-sorted
 * pipeline. Only domains with defenses produce a phase (conditional presence).
 *
 * @param defenses - Flat DefenseSpec array from Phase 3.
 * @returns OrderedPipeline with phases sorted topologically.
 */
export function orderPipeline(defenses: DefenseSpec[]): OrderedPipeline {
  // Step 1: Group by domain (conditional phase presence)
  const domainMap = new Map<DefenseDomain, DefenseSpec[]>();
  for (const d of defenses) {
    const list = domainMap.get(d.domain) ?? [];
    list.push(d);
    domainMap.set(d.domain, list);
  }

  // Step 2: Build per-phase metadata
  const phaseMeta = [...domainMap.entries()].map(([domain, specs]) => ({
    id: `phase-${domain}`,
    domain,
    specs,
    inputs: unique(specs.flatMap((s) => s.inputs)),
    outputs: unique(specs.flatMap((s) => s.outputs)),
    executionModel: (collectDeps(specs).length > 0 ? 'sequential' : 'parallel') as
      'sequential' | 'parallel',
  }));

  // Step 3: Cross-phase dependency edges + adjacency for topo sort
  const crossDeps: PipelineDependency[] = [];
  const adj = new Map<string, Set<string>>(phaseMeta.map((p) => [p.id, new Set<string>()]));
  const inDeg = new Map<string, number>(phaseMeta.map((p) => [p.id, 0]));

  for (let i = 0; i < phaseMeta.length; i++) {
    for (let j = 0; j < phaseMeta.length; j++) {
      if (i === j) continue;
      const a = phaseMeta[i], b = phaseMeta[j];
      if (intersect(b.inputs, a.outputs).length > 0) {
        adj.get(a.id)!.add(b.id);
        inDeg.set(b.id, (inDeg.get(b.id) ?? 0) + 1);
        for (const aSpec of a.specs) {
          for (const bSpec of b.specs) {
            const overlap = intersect(bSpec.inputs, aSpec.outputs);
            if (overlap.length > 0) {
              crossDeps.push({ from: aSpec.rule, to: bSpec.rule, sharedFields: overlap, required: true });
            }
          }
        }
      }
    }
  }

  // Step 4: Topological sort
  const sorted = topoSort(adj, inDeg);
  const byId = new Map(phaseMeta.map((p) => [p.id, p]));

  // Step 5: Build final phases in sorted order
  const phases: PipelinePhase[] = sorted.map((pid) => {
    const pm = byId.get(pid)!;
    return {
      id: pm.id,
      defenses: pm.specs.map((s) => s.rule),
      domain: pm.domain,
      executionModel: pm.executionModel,
      inputs: pm.inputs,
      outputs: pm.outputs,
      dependencies: crossDeps.filter((d) => pm.specs.some((s) => s.rule === d.to)),
    };
  });

  return { phases, dependencies: crossDeps, totalRules: phases.reduce((n: number, ph) => n + ph.defenses.length, 0) };
}
