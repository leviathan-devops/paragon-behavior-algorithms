// src/subagents/trident-bug-hunter/diagnostics/__tests__/engine.test.ts
// THE DIAGNOSTICS ENGINE TESTS (W5) — the spec section 6.3 pseudocode (lines
// 2722-2754) transcribed + the adversarial additions (>= 3). The FIRE fixtures
// (the fabricated-E3 graph, the price-anchored comparator, the golden-as-input)
// + the GOLDEN fixtures (the known-good zero-findings state) are stub/tmpdir
// fixtures built in THIS suite — NEVER the real Plutus_Agent (W10's curation).
// The determinism (K21.2) is asserted EXPLICITLY via JSON.stringify equality —
// any ordering/randomness/timestamp drift fails the run.
//
// THE MATCHER SURFACE: the assertions conform to W1's ambient bun:test shim
// (bun-modules.d.ts — toBe/toEqual/toContain/toThrow + not). The async-error
// assertions use the explicit try/catch capture form (the shim's ExpectResult
// has no `rejects`).
//
// TYPE-SURFACE NOTE (recorded honestly): the spec's §6.3 `findingsStore.append(
// { ruleId: 'P6', verdict: 'VIOLATION', evidence: '' })` is transcribed against
// this wave's findings-store surface (append(db, finding, runId)) — the
// pseudocode's object is an abbreviation of the W1 FindingInput (severity is
// required by the type; the empty evidence trips the FINDING_NO_TRIPLET gate
// before severity/verdict are ever validated).

import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openStore} from '../../../../shared/knowledge-graph/db.ts';
import { ProjectProfileSchema, type ProjectProfile } from '../../../../shared/knowledge-graph/profile-schema.ts';
import type { GraphAdapter, GraphNode } from '../../graph/interface.ts';
import { compileTemplate, TEMPLATE_LIBRARY, type CompiledPredicate } from '../../lexicon/templates.ts';
import { engine, runBattery } from '../engine.ts';
import { append, appendFindings, queryFindings, type NormalizedFinding } from '../findings-store.ts';

// ---------------------------------------------------------------------------
// The tmpdir fixtures (created per-suite, cleaned up after — never the real
// Plutus_Agent)
// ---------------------------------------------------------------------------

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-diagnostics-engine-'));
const createdTmp: string[] = [tmpBase];

afterAll(() => {
  for (const d of createdTmp) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (e: unknown) {
      console.error(`[engine.test cleanup] failed to remove ${d}: ${String(e)}`);
    }
  }
});

function fixtureProfile(failureLogs: string[] = []): ProjectProfile {
  return ProjectProfileSchema.parse({
    profileVersion: 1,
    project: { name: 'fixture', root: tmpBase, languages: ['typescript'], entryPoints: ['src/index.ts'], build: 'bun build', test: 'bun test' },
    graph: { substrate: 'native-ast', scope: ['src'], excludes: [] },
    rules: { corpus: ['corpus.md'], bindings: {} },
    pipeline: { stages: [{ id: 'harvest', entry: 'harvestOrders', contract: 'the temporal filter' }] },
    history: { failureLogs },
    awareness: { docs: [] },
  });
}

/** The minimal GraphAdapter stub — the checks read it; it never executes anything. */
function stubGraph(overrides: Partial<GraphAdapter> = {}): GraphAdapter {
  return {
    build: async () => ({ nodes: [], edges: [], durationMs: 0, adapter: 'native-ast', lineage: { spec: 0, code: 0, hybrid: 0 } }),
    whoCalls: () => [],
    chain: () => [],
    imports: () => [],
    awaits: () => [],
    unwired: () => [],
    nodes: () => [],
    ...overrides,
  };
}

/** The stub source reads — the fixture sources the checks read (the
 *  provenance.quoted-not-synthesized class); the graph-class predicates
 *  (P1/P6/P20) read the graph only. */
function fixtureSources(): { read(file: string): string } {
  return { read: () => '' };
}

// ---------------------------------------------------------------------------
// The P-battery fixture predicates (the spec's P-numbers as predicate ids —
// the engine normalizes every finding's ruleId to the predicate's id, so the
// P1/P6/P20 ids ARE the assertion surface, §6.3)
// ---------------------------------------------------------------------------

/** P1 — the E3-never-anchor trace (provenance.traces-to-source, CRIT — the
 *  fabrication/provenance class, D23). Fires when an E3 node lacks a
 *  traces-to edge from the E1/E2 provenance. */
function compileP1(): CompiledPredicate {
  const card = { verbatimQuote: 'E3 is not permitted to override pre-existing E1/E2 data architecture.', anchor: 'fixture-corpus.md:1', severity: 'CRIT' as const };
  return {
    ...compileTemplate(TEMPLATE_LIBRARY['provenance.traces-to-source'], { ...card, targetKinds: ['stage'], requiredTraces: ['e1', 'e2'] }, card, 'fixture-battery'),
    id: 'P1',
  };
}

/** P6 — the no-price-anchored-comparator rule (domain.numeric-threshold, CRIT
 *  — the price-anchoring class, D23). Fires when the computed
 *  abs(open - level) exceeds the ceiling. */
function compileP6(): CompiledPredicate {
  const card = { verbatimQuote: 'No price-anchored comparator is permitted in the E2 selection path.', anchor: 'fixture-corpus.md:2', severity: 'CRIT' as const };
  return {
    ...compileTemplate(TEMPLATE_LIBRARY['domain.numeric-threshold'], { ...card, symbol: 'priceAnchor', valuePath: 'comparator', operator: 'gt', threshold: 1.0 }, card, 'fixture-battery'),
    id: 'P6',
  };
}

/** P20 — the golden-never-input rule (domain.numeric-threshold, CRIT — the
 *  fitted-to-golden class, D23). Fires when the live input EQUALS the golden
 *  constant (a fitted value fed as the live input). */
function compileP20(): CompiledPredicate {
  const card = { verbatimQuote: 'The golden constant is never fed as the live input.', anchor: 'fixture-corpus.md:3', severity: 'CRIT' as const };
  return {
    ...compileTemplate(TEMPLATE_LIBRARY['domain.numeric-threshold'], { ...card, symbol: 'rwlInput', valuePath: 'pips', operator: 'lte', threshold: 0.2 }, card, 'fixture-battery'),
    id: 'P20',
  };
}

// ---------------------------------------------------------------------------
// The fixture graphs (§6.3: the fabricated-E3 / the price-anchored / the
// golden-as-input / the clean-E3)
// ---------------------------------------------------------------------------

function fixtureGraph(kind: 'fabricated-e3' | 'price-anchored' | 'golden-input' | 'clean-e3'): GraphAdapter {
  const stageNode = (name: string, file: string, line: number): GraphNode => ({
    id: `stage:${name}`, kind: 'stage', name, file, line, lineage: 'CODE_DERIVED', source: 'fixture:corbell',
  });
  const fnNode = (id: string, name: string, file: string, line: number, data: Record<string, unknown>): GraphNode => ({
    id, kind: 'function', name, file, line, lineage: 'CODE_DERIVED', source: 'fixture:corbell', data,
  });
  switch (kind) {
    case 'fabricated-e3': {
      // the E3 node with a BAR-ONLY derivation — the incoming edge is a `calls`
      // from a bar-epoch function, with NO traces-to edge from E1/E2 → P1 fires.
      const e3 = stageNode('e3-anchor', 'src/engine.ts', 42);
      return stubGraph({
        nodes: (k) => (k !== undefined && k !== 'stage' ? [] : [e3]),
        chain: () => [{ from: 'fn:barEpoch', to: 'stage:e3-anchor', kind: 'calls', file: 'src/bar.ts', line: 9 }],
      });
    }
    case 'clean-e3': {
      // the E3 node WITH the E1 provenance edge → P1 stays silent.
      const e3 = stageNode('e3-anchor', 'src/engine.ts', 42);
      return stubGraph({
        nodes: (k) => (k !== undefined && k !== 'stage' ? [] : [e3]),
        chain: () => [{ from: 'e1-source', to: 'stage:e3-anchor', kind: 'traces-to', file: 'src/e1.ts', line: 3 }],
      });
    }
    case 'price-anchored': {
      // the price-anchored comparator — abs(open - level) = 1.504 > the 1.0
      // ceiling → P6 fires (the 11-site class).
      const anchor = fnNode('fn:priceAnchor', 'priceAnchor', 'src/e2-selector.ts', 31, { open: 102.8, level: 101.296, comparator: 1.504 });
      return stubGraph({ nodes: (k) => (k !== undefined && k !== 'function' ? [] : [anchor]) });
    }
    case 'golden-input': {
      // the golden constant (0.2) fed as the live input — pips = 0.2 <= the
      // 0.2 threshold → P20 fires (the fitted-to-golden class).
      const rwl = fnNode('fn:rwlInput', 'rwlInput', 'src/shape-brain.ts', 1560, { pips: 0.2 });
      return stubGraph({ nodes: (k) => (k !== undefined && k !== 'function' ? [] : [rwl]) });
    }
  }
}

/** The hand-built findings-row helper for the store tests. */
function mkFinding(ruleId: string, file: string, line: number, evidence: string): NormalizedFinding {
  return { ruleId, severity: 'CRIT', file, line, rangeStart: line, rangeEnd: line, evidence, verdict: 'VIOLATION' };
}

// ---------------------------------------------------------------------------
// THE DIAGNOSTICS ENGINE (spec §6.3:2722-2754 transcribed verbatim)
// ---------------------------------------------------------------------------

describe('THE DIAGNOSTICS ENGINE (spec §6.3:2722-2754 transcribed)', () => {
  it('fires P1 on the fabricated-E3 fixture graph (the E3 anchor with no E1/E2 provenance edge)', () => {
    const graph = fixtureGraph('fabricated-e3');
    const battery = [compileP1()];
    const findings = engine.run(battery, { graph, source: fixtureSources() });
    expect(findings.filter((f) => f.ruleId === 'P1' && f.verdict === 'VIOLATION').length).toBe(1);
    expect(findings[0].evidence).toContain('e3-anchor'); // the MPSE Evidence carries the edge chain
  });

  it('stays SILENT on a clean E3 graph (the traces-to provenance edge present)', () => {
    const findings = engine.run([compileP1()], { graph: fixtureGraph('clean-e3'), source: fixtureSources() });
    expect(findings.filter((f) => f.ruleId === 'P1' && f.verdict === 'VIOLATION').length).toBe(0);
  });

  it('fires P6 on the price-anchored comparator fixture (the 11-site class)', () => {
    const graph = fixtureGraph('price-anchored');
    const findings = engine.run([compileP6()], { graph, source: fixtureSources() });
    expect(findings.some((f) => f.ruleId === 'P6' && f.verdict === 'VIOLATION')).toBe(true);
  });

  it('fires P20 on the golden-as-input fixture', () => {
    const graph = fixtureGraph('golden-input');
    const findings = engine.run([compileP20()], { graph, source: fixtureSources() });
    expect(findings.some((f) => f.ruleId === 'P20' && f.verdict === 'VIOLATION')).toBe(true);
  });

  it('is DETERMINISTIC — the same graph + the same battery → the same findings', () => {
    const battery = [compileP1(), compileP6(), compileP20()];
    const ctx = { graph: fixtureGraph('fabricated-e3'), source: fixtureSources() };
    const r1 = engine.run(battery, ctx);
    const r2 = engine.run(battery, ctx);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it('rejects a finding without the MPSE evidence string (FINDING_NO_TRIPLET)', () => {
    const db = openStore(':memory:');
    expect(() => append(db, { ruleId: 'P6', severity: 'CRIT', verdict: 'VIOLATION', evidence: '' }, 'run-x'))
      .toThrow(/FINDING_NO_TRIPLET/); // no triplet = no finding (O9.1)
    db.close();
  });

  it('rejects an evidence-less finding THROUGH the engine — a template defect is a loud FINDING_NO_TRIPLET, never a silent skip', () => {
    const broken = {
      id: 'x', family: 'DOMAIN' as const, template: 't', bindings: {},
      verbatimQuote: 'q', anchor: 'a', severity: 'HIGH' as const, batteryVersion: 'v',
      check: () => [{ ruleId: 'x', severity: 'HIGH' as const, file: 'a.ts', line: 1, evidence: '', verdict: 'VIOLATION' as const }],
    };
    const db = openStore(':memory:');
    expect(() => runBattery([broken], fixtureGraph('fabricated-e3'), fixtureProfile(), 'run-x', db))
      .toThrow(/FINDING_NO_TRIPLET/);
    db.close();
  });

  // --- THE ADVERSARIAL CASES (>= 3 — the spec's testing doctrine, adversarial-first) ---

  it('ADVERSARIAL: an EMPTY battery is the valid honest zero — zero findings, never an error', () => {
    const findings = engine.run([], { graph: fixtureGraph('fabricated-e3'), source: fixtureSources() });
    expect(findings.length).toBe(0); // the clean project's zero-rule corpus — a VALID state
  });

  it('ADVERSARIAL: an EMPTY graph fails LOUDLY with the named ENGINE_GRAPH_EMPTY — never a silent zero', () => {
    expect(() => engine.run([compileP1()], { graph: stubGraph(), source: fixtureSources() }))
      .toThrow(/ENGINE_GRAPH_EMPTY/);
  });

  it('ADVERSARIAL: a predicate that throws mid-check aborts the run with FINDING_CHECK_FAILED (atomic per predicate)', () => {
    const throwing = {
      id: 'p-throw', family: 'DOMAIN' as const, template: 't', bindings: {},
      verbatimQuote: 'q', anchor: 'a', severity: 'HIGH' as const, batteryVersion: 'v',
      check: () => { throw new Error('boom'); },
    };
    expect(() => engine.run([throwing], { graph: fixtureGraph('fabricated-e3'), source: fixtureSources() }))
      .toThrow(/FINDING_CHECK_FAILED/);
  });

  it('ADVERSARIAL: the dedupe collapses a duplicate ruleId+file+line within a run to ONE finding (K4.3)', () => {
    const dup = {
      id: 'P1', family: 'PROVENANCE' as const, template: 'provenance.traces-to-source', bindings: {},
      verbatimQuote: 'q', anchor: 'a', severity: 'CRIT' as const, batteryVersion: 'v',
      check: () => [
        { ruleId: 'P1', severity: 'CRIT' as const, file: 'a.ts', line: 1, evidence: 'first occurrence wins', verdict: 'VIOLATION' as const },
        { ruleId: 'P1', severity: 'CRIT' as const, file: 'a.ts', line: 1, evidence: 'the later duplicate collapses', verdict: 'VIOLATION' as const },
      ],
    };
    const summary = runBattery([dup], fixtureGraph('fabricated-e3'), fixtureProfile(), 'run-dup');
    expect(summary.findingsCount).toBe(2);   // the raw collection
    expect(summary.dedupedCount).toBe(1);    // the dedupe collapsed
    expect(summary.findings.length).toBe(1);
    expect(summary.findings[0].evidence).toBe('first occurrence wins');
  });

  it('ADVERSARIAL: ranks by severity × history-frequency (K21.3 — the bounded 1..3 weight)', () => {
    const logPath = path.join(tmpBase, 'failure-log.md');
    fs.writeFileSync(logPath, ['# the failure log', 'P-med broke the contract', 'P-med again', 'P-med third time'].join('\n'));
    createdTmp.push(logPath);
    const med = {
      id: 'P-med', family: 'DOMAIN' as const, template: 't', bindings: {},
      verbatimQuote: 'q', anchor: 'a', severity: 'MED' as const, batteryVersion: 'v',
      check: () => [{ ruleId: 'P-med', severity: 'MED' as const, file: 'b.ts', line: 2, evidence: 'med', verdict: 'VIOLATION' as const }],
    };
    const crit = {
      id: 'P-crit', family: 'DOMAIN' as const, template: 't', bindings: {},
      verbatimQuote: 'q', anchor: 'a', severity: 'CRIT' as const, batteryVersion: 'v',
      check: () => [{ ruleId: 'P-crit', severity: 'CRIT' as const, file: 'c.ts', line: 3, evidence: 'crit', verdict: 'VIOLATION' as const }],
    };
    // P-med: severityScore 2 × freq 3 (bounded) = 6; P-crit: 4 × freq 1 = 4 → P-med first
    const summary = runBattery([med, crit], fixtureGraph('fabricated-e3'), fixtureProfile([logPath]), 'run-rank');
    expect(summary.findings.map((f) => f.ruleId)).toEqual(['P-med', 'P-crit']);
  });

  it('ADVERSARIAL: is IDEMPOTENT + runId-scoped — a second run with a new runId lands its own rows, never touching the first run\'s rows', () => {
    const db = openStore(':memory:');
    const battery = [compileP1()];
    const graph = fixtureGraph('fabricated-e3');
    const r1 = runBattery(battery, graph, fixtureProfile(), 'run-1', db);
    const r2 = runBattery(battery, graph, fixtureProfile(), 'run-2', db);
    expect(r1.findings.length).toBe(1);
    expect(r2.findings.length).toBe(1);
    expect(r1.predicatesExecuted).toBe(7);
    expect(r2.predicatesExecuted).toBe(7);
    const one = queryFindings(db, { runId: 'run-1' });
    const two = queryFindings(db, { runId: 'run-2' });
    expect(one.length).toBe(1);
    expect(two.length).toBe(1);
    expect(one[0].ruleId).toBe('P1');
    expect(two[0].ruleId).toBe('P1');
    expect(queryFindings(db, { runId: 'run-1' }).length).toBe(1); // run-2 never touched run-1's rows
    db.close();
  });
});

// ---------------------------------------------------------------------------
// THE FINDINGS STORE (the append-only wrapper — the single write boundary)
// ---------------------------------------------------------------------------

describe('THE FINDINGS STORE (the append-only wrapper, K4.3)', () => {
  it('appends the run\'s findings through W1 with the runId + the week scoping', () => {
    const db = openStore(':memory:');
    const res = appendFindings(db, [mkFinding('P1', 'a.ts', 1, 'evidence-1'), mkFinding('P6', 'b.ts', 2, 'evidence-2')], 'run-a', 'W1');
    expect(res.runId).toBe('run-a');
    expect(res.week).toBe('W1');
    expect(res.appended).toBe(2);
    expect(queryFindings(db, { runId: 'run-a', week: 'W1' }).length).toBe(2);
    db.close();
  });

  it('queries by runId / week / ruleId — the deduped rows in the ledger (append) order', () => {
    const db = openStore(':memory:');
    appendFindings(db, [mkFinding('P1', 'a.ts', 1, 'e1'), mkFinding('P6', 'b.ts', 2, 'e2')], 'run-a', 'W1');
    appendFindings(db, [mkFinding('P1', 'a.ts', 1, 'e1b'), mkFinding('P20', 'c.ts', 3, 'e3')], 'run-b', 'W2');
    expect(queryFindings(db, { runId: 'run-a' }).length).toBe(2);
    expect(queryFindings(db, { week: 'W1' }).length).toBe(2);
    expect(queryFindings(db, { ruleId: 'P1' }).length).toBe(2);
    expect(queryFindings(db, { runId: 'run-b', ruleId: 'P20' }).length).toBe(1);
    expect(queryFindings(db, { runId: 'run-a' }).map((f) => f.ruleId)).toEqual(['P1', 'P6']); // the ledger order
    db.close();
  });

  it('is deterministic — the same inputs → the same rows, byte for byte', () => {
    const db = openStore(':memory:');
    appendFindings(db, [mkFinding('P1', 'a.ts', 1, 'e1'), mkFinding('P6', 'b.ts', 2, 'e2')], 'run-x');
    const a = queryFindings(db);
    const b = queryFindings(db);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    db.close();
  });
});
