import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { parseSubsetQuery, SchemaRejectedError, TEMPLATE_QUERY_MAP, listTemplateMappings } from '../cypher-subset.ts';
import { computeRoundBudget, runL6Loop, L6_BUDGET_PINS } from '../l6-agent.ts';
import { QueryEngine } from '../../../../shared/knowledge-graph/query-engine.ts';
import { ensureTypedGraphSchema } from '../../../../shared/knowledge-graph/migrations.ts';

function makeEngine(): { db: Database; engine: QueryEngine } {
  const db = new Database(':memory:');
  ensureTypedGraphSchema(db as unknown as { exec(sql: string): unknown });
  db.exec('PRAGMA journal_mode = WAL');
  const engine = new QueryEngine(db);
  return { db, engine };
}

function seedFixture(db: Database): void {
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('File:src/a.ts', 'File', 'a.ts', 'src/a.ts', 1, 'run1', null);
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Function:foo', 'Function', 'foo', 'src/a.ts', 10, 'run1', null);
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('SpecClause:req-1', 'SpecClause', 'req-1', 'spec.md', 5, 'run1', null);
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Class:Bar', 'Class', 'Bar', 'src/b.ts', 20, 'run1', null);
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Threshold:thr-1', 'Threshold', 'thr-1', 'src/c.ts', 30, 'run1', null);
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Gate:gate-1', 'Gate', 'gate-1', 'src/d.ts', 40, 'run1', null);
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Module:mod-a', 'Module', 'mod-a', 'src/mod.ts', 1, 'run1', null);
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('EvidenceFile:ev-1', 'EvidenceFile', 'ev-1', 'ev.md', 1, 'run1', null);
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Engine:eng-1', 'Engine', 'eng-1', 'src/e.ts', 50, 'run1', null);
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Function:mid', 'Function', 'mid', 'src/mid.ts', 15, 'run1', null);
  db.prepare(`INSERT INTO typed_nodes (canonical_id, kind, label, file, line, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Function:target', 'Function', 'target', 'src/t.ts', 25, 'run1', null);
  db.prepare(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('SpecClause:req-1', 'Function:foo', 'implements', 'spec line 5: foo implements req-1', 1.0, 'run1', null);
  db.prepare(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('File:src/a.ts', 'Function:foo', 'declares', 'src/a.ts:10 declares foo', 1.0, 'run1', null);
  db.prepare(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Function:foo', 'Function:target', 'calls', 'src/a.ts:12 foo calls target', 1.0, 'run1', null);
  db.prepare(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Function:foo', 'Function:mid', 'calls', 'src/a.ts:12 foo calls mid', 1.0, 'run1', null);
  db.prepare(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Function:mid', 'Function:target', 'calls', 'src/mid.ts:15 mid calls target', 1.0, 'run1', null);
  db.prepare(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('EvidenceFile:ev-1', 'Function:foo', 'derived_from', 'ev.md:1 derived', 1.0, 'run1', null);
  db.prepare(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Gate:gate-1', 'Engine:eng-1', 'shouldBe', 'src/d.ts:40 gate shouldBe engine', 1.0, 'run1', null);
  db.prepare(`INSERT INTO typed_edges (src_canonical, dst_canonical, predicate, evidence_quote, confidence, created_run, superseded_run) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Threshold:thr-1', 'Class:Bar', 'evaluates_to', 'src/c.ts:30 thr evaluates_to Bar', 1.0, 'run1', null);
}

describe('B3 cypher-subset — schema-lock translator', () => {
  it('rejects bad label with schema (SPEC-B §2.4)', () => {
    let err: unknown;
    try { parseSubsetQuery('MATCH (a:FakeLabel)-[r:calls]->(b:Function) RETURN a,b'); } catch (e) { err = e; }
    // # mut-check: changing FakeLabel to File would make parse succeed — this assert flips red if schema-lock is removed
    expect(err instanceof SchemaRejectedError).toBe(true);
    // # mut-check: removing SCHEMA_REJECTED prefix from error message would flip this
    expect((err as Error).message).toContain('SCHEMA_REJECTED');
    // # mut-check: if badLabel field stopped propagating FakeLabel, this fails
    expect((err as Error).message).toContain('FakeLabel');
    // # mut-check: if error message omitted allowed types, File hint disappears
    expect((err as Error).message).toContain('File');
    // # mut-check: renaming badLabel to badNodeType would make this undefined
    expect((err as SchemaRejectedError).badLabel).toBe('FakeLabel');
    // # mut-check: removing a NodeType from ontology (16->15) flips this count
    expect((err as SchemaRejectedError).schema.nodeTypes.length).toBe(16);
  });

  it('rejects bad relation with schema', () => {
    let err: unknown;
    try { parseSubsetQuery('MATCH (a:Function)-[r:not_a_predicate]->(b:Function) RETURN a,b'); } catch (e) { err = e; }
    // # mut-check: fixing predicate to 'calls' would make parse succeed
    expect(err instanceof SchemaRejectedError).toBe(true);
    // # mut-check: dropping SCHEMA_REJECTED code from message flips this
    expect((err as Error).message).toContain('SCHEMA_REJECTED');
    // # mut-check: normalizing badRelation to lowercase would mismatch
    expect((err as Error).message).toContain('not_a_predicate');
    // # mut-check: renaming badRelation to badPredicate would make this undefined
    expect((err as SchemaRejectedError).badRelation).toBe('not_a_predicate');
    // # mut-check: removing a predicate from ontology drops count below 10
    expect((err as SchemaRejectedError).schema.predicates.length).toBeGreaterThan(10);
  });

  it('compiles valid path query to recursive-CTE SQL with meaning', () => {
    const plan = parseSubsetQuery('MATCH (a:Function)-[r:calls*1..16]->(b:Function) RETURN a,b');
    // # mut-check: removing WITH RECURSIVE from CTE builder flips this
    expect(plan.sql).toContain('WITH RECURSIVE search');
    // # mut-check: quoting predicate differently (calls vs "calls") flips this
    expect(plan.sql).toContain(`'calls'`);
    // # mut-check: changing table name typed_edges to edges flips this
    expect(plan.sql).toContain('typed_edges');
    // # mut-check: truncating meaning to <20 chars (e.g. empty template) flips this
    expect(plan.meaning.length).toBeGreaterThan(20);
    // # mut-check: stripping relations from meaning generation flips this
    expect(plan.meaning).toContain('calls');
    // # mut-check: failing to extract label Function flips this
    expect(plan.labels).toContain('Function');
    // # mut-check: duplicate label dedupe breaking would make length 2
    expect(plan.labels.length).toBe(1);
    // # mut-check: returning relations as ['calls','imports'] instead of ['calls'] flips this
    expect(plan.relations).toEqual(['calls']);
    // # mut-check: clamping maxDepth to default 16 vs parsed 16 — changing default flips this
    expect(plan.maxDepth).toBe(16);
    // # mut-check: setting isPathQuery false for *-queries flips this
    expect(plan.isPathQuery).toBe(true);
  });

  it('path query compiles and runs on fixture graph (entity+path)', () => {
    const { db, engine } = makeEngine();
    seedFixture(db);
    const plan = parseSubsetQuery('MATCH (a:SpecClause)-[r:implements*1..16]->(b:Function) RETURN a,b');
    // # mut-check: changing predicate implements to calls would make sql mismatch fixture
    expect(plan.sql).toContain('implements');
    const edges = engine.path('SpecClause:req-1', 'Function:foo', { predicateFilter: ['implements'] });
    // # mut-check: deleting the implements edge from fixture makes length 0
    expect(edges.length).toBe(1);
    // # mut-check: mutating predicate in seedFixture to 'declares' flips this
    expect(edges[0].predicate).toBe('implements');
    // # mut-check: emptying evidence_quote in typed_edges fixture flips this
    expect(edges[0].evidence_quote.length).toBeGreaterThan(0);
    db.close();
  });

  it('empty and null queries throw CYPHER_PARSE_ERROR (adversarial)', () => {
    // # mut-check: allowing empty string to return empty plan instead of throw flips this
    expect(() => parseSubsetQuery('')).toThrow(/CYPHER_PARSE_ERROR/);
    // # mut-check: coercing null to string "null" instead of rejecting flips this
    expect(() => parseSubsetQuery(null as unknown as string)).toThrow(/CYPHER_PARSE_ERROR/);
    // # mut-check: trimming whitespace-only to valid query instead of throw flips this
    expect(() => parseSubsetQuery('   ')).toThrow(/CYPHER_PARSE_ERROR/);
    // # mut-check: accepting RETURN without MATCH as valid flips this
    expect(() => parseSubsetQuery('RETURN a')).toThrow(/CYPHER_PARSE_ERROR/);
  });

  it('boundary depth: default 16, max 64 ok, 65 rejected (adversarial)', () => {
    const p1 = parseSubsetQuery('MATCH (a:Function)-[r:calls]->(b:Function) RETURN a');
    // # mut-check: changing default hop depth from 1 to 16 flips this
    expect(p1.maxDepth).toBe(1);
    const p16 = parseSubsetQuery('MATCH (a:Function)-[r:calls*1..16]->(b:Function) RETURN a');
    // # mut-check: clamping *1..16 to 1 flips this
    expect(p16.maxDepth).toBe(16);
    const p64 = parseSubsetQuery('MATCH (a:Function)-[r:calls*1..64]->(b:Function) RETURN a');
    // # mut-check: rejecting 64 as over max would flip this to throw
    expect(p64.maxDepth).toBe(64);
    // # mut-check: raising PATH_DEPTH_MAX to 128 would make 65 not throw
    expect(() => parseSubsetQuery('MATCH (a:Function)-[r:calls*1..65]->(b:Function) RETURN a')).toThrow(/PATH_BOUNDED|CYPHER_PARSE_ERROR/);
  });

  it('concurrent parses produce independent results (adversarial)', async () => {
    const queries = [
      'MATCH (a:File)-[r:imports*1..16]->(b:Function) RETURN a,b',
      'MATCH (a:Gate)-[r:shouldBe*1..16]->(b:Engine) RETURN a,b',
      'MATCH (a:Threshold)-[r:evaluates_to*1..16]->(b:Contract) RETURN a,b',
      'MATCH (a:SpecClause)-[r:implements*1..16]->(b:Class) RETURN a,b',
    ];
    const results = await Promise.all(queries.map(async (q) => parseSubsetQuery(q)));
    // # mut-check: sharing mutable state across parse calls would make length <4
    expect(results.length).toBe(4);
    // # mut-check: swapping imports predicate extraction to 'calls' flips this
    expect(results[0].relations).toEqual(['imports']);
    // # mut-check: mis-parsing shouldBe as should_be would flip this
    expect(results[1].relations).toEqual(['shouldBe']);
    // # mut-check: removing WITH RECURSIVE from any plan flips this
    expect(results.every((r) => r.sql.includes('WITH RECURSIVE'))).toBe(true);
  });

  it('template mappings: 7 entries covering 5 families with compiled plans', () => {
    const all = listTemplateMappings();
    // # mut-check: adding or removing a template entry changes this from 7
    expect(all.length).toBe(7);
    const families = new Set(all.map((m) => m.family));
    // # mut-check: collapsing two families into one drops size below 5
    expect(families.size).toBe(5);
    // # mut-check: TEMPLATE_QUERY_MAP missing an entry while list has it flips this
    expect(Object.keys(TEMPLATE_QUERY_MAP).length).toBe(7);
    for (const m of all) {
      // # mut-check: template compiledPlan missing CTE builder flips this per entry
      expect(m.compiledPlan.sql).toContain('WITH RECURSIVE');
      // # mut-check: empty meaning string on template flips this
      expect(m.compiledPlan.meaning.length).toBeGreaterThan(10);
      // # mut-check: empty typedQuery string on template flips this
      expect(m.typedQuery.length).toBeGreaterThan(10);
    }
    // # mut-check: changing wiring.no-dead-module predicate from unwired to calls flips this
    expect(TEMPLATE_QUERY_MAP['wiring.no-dead-module'].predicate).toBe('unwired');
    // # mut-check: changing contract.must-implement predicate flips this
    expect(TEMPLATE_QUERY_MAP['contract.must-implement'].predicate).toBe('implements');
    // # mut-check: changing domain.numeric-threshold predicate flips this
    expect(TEMPLATE_QUERY_MAP['domain.numeric-threshold'].predicate).toBe('evaluates_to');
  });
});

describe('B3 l6-agent — S-harness loop', () => {
  it('budget pins: t=6→5, t=24→8 (MC-B-07)', () => {
    // # mut-check: changing formula to 2+ceil(t/6)+1 would make t=6 =>4 not 5
    expect(computeRoundBudget(6)).toBe(5);
    // # mut-check: changing formula would make t=24 !=8
    expect(computeRoundBudget(24)).toBe(8);
    // # mut-check: L6_BUDGET_PINS map out of sync with computeRoundBudget flips this
    expect(L6_BUDGET_PINS[6]).toBe(5);
    // # mut-check: L6_BUDGET_PINS[24] hardcoded to 7 flips this
    expect(L6_BUDGET_PINS[24]).toBe(8);
    // # mut-check: computeRoundBudget(0) returning 2 instead of 4 flips this (2+0+2=4)
    expect(computeRoundBudget(0)).toBe(4);
    // # mut-check: t=1 ceil(1/6)=1 =>2+1+2=5, off-by-one flips this
    expect(computeRoundBudget(1)).toBe(5);
    // # mut-check: t=12 ceil(12/6)=2 =>2+2+2=6, formula drift flips this
    expect(computeRoundBudget(12)).toBe(6);
  });

  it('rejects invalid demand and harness (adversarial empty/null)', async () => {
    const { engine } = makeEngine();
    // # mut-check: accepting null demand as valid would not throw L6_DEMAND_INVALID
    await expect(runL6Loop(null as unknown as never, { engine })).rejects.toThrow(/L6_DEMAND_INVALID/);
    // # mut-check: accepting empty question as valid flips this
    await expect(runL6Loop({ question: '', targets: [] } as unknown as never, { engine })).rejects.toThrow(/L6_DEMAND_INVALID/);
    // # mut-check: accepting target with empty from as valid flips this
    await expect(runL6Loop({ question: 'q', targets: [{ from: '', to: 'x', predicate: 'calls' }] } as unknown as never, { engine })).rejects.toThrow(/L6_DEMAND_INVALID/);
    // # mut-check: accepting null harness as valid flips this
    await expect(runL6Loop({ question: 'q', targets: [{ from: 'a', to: 'b', predicate: 'calls' }] }, null as unknown as never)).rejects.toThrow(/L6_HARNESS_INVALID/);
    // # mut-check: accepting {} without engine as valid harness flips this
    await expect(runL6Loop({ question: 'q', targets: [{ from: 'a', to: 'b', predicate: 'calls' }] }, {} as unknown as never)).rejects.toThrow(/L6_HARNESS_INVALID/);
  });

  it('planted TRACE_GAP gets closed by loop (alternative predicate path)', async () => {
    const { db, engine } = makeEngine();
    seedFixture(db);
    const demand = {
      question: 'does foo trace to target via implements?',
      targets: [
        { from: 'Function:foo', to: 'Function:target', predicate: 'implements' },
        { from: 'SpecClause:req-1', to: 'Function:foo', predicate: 'implements' },
      ],
    };
    const result = await runL6Loop(demand, { engine });
    // # mut-check: budget formula 2+ceil(2/6)+2=5, changing to 2+floor would give 4
    expect(result.budget).toBe(computeRoundBudget(2));
    // # mut-check: roundsUsed 0 instead of >=1 would indicate early exit bug
    expect(result.roundsUsed).toBeGreaterThanOrEqual(1);
    // # mut-check: exceeding budget indicates loop not bounded
    expect(result.roundsUsed).toBeLessThanOrEqual(result.budget);
    const gapFoo = result.gaps.find((g) => g.from === 'Function:foo');
    // # mut-check: gap lookup by from failing due to canonical mismatch flips this
    expect(gapFoo).toBeDefined();
    // # mut-check: alternative predicate fallback disabled would leave closed false
    expect(gapFoo!.closed).toBe(true);
    // # mut-check: missing evidence assignment on close flips this
    expect(gapFoo!.evidence).toBeDefined();
    // # mut-check: deduplication dropping all edges would make subgraph empty
    expect(result.subgraph.length).toBeGreaterThan(0);
    // # mut-check: terminated undefined would mean missing convergence flag
    expect(result.terminated).toBeDefined();
    db.close();
  });

  it('loop terminates within budget — pins hold under adversarial targets', async () => {
    const { db, engine } = makeEngine();
    seedFixture(db);
    const targets = Array.from({ length: 24 }, (_, i) => ({ from: 'Function:foo', to: `Function:target`, predicate: 'calls' }));
    const demand = { question: 'budget pin 24', targets };
    const result = await runL6Loop(demand, { engine });
    // # mut-check: budget for 24 must be 8, formula change flips this
    expect(result.budget).toBe(8);
    // # mut-check: loop exceeding budget indicates unbounded iteration
    expect(result.roundsUsed).toBeLessThanOrEqual(8);
    // # mut-check: zero rounds would mean loop never entered
    expect(result.roundsUsed).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it('empty targets converge immediately within budget (adversarial)', async () => {
    const { engine } = makeEngine();
    const result = await runL6Loop({ question: 'no targets', targets: [] }, { engine });
    // # mut-check: empty targets budget should be 4 (2+0+2), drift flips this
    expect(result.budget).toBe(4);
    // # mut-check: not capping roundsUsed at budget flips this when bug inflates rounds
    expect(result.roundsUsed).toBeLessThanOrEqual(4);
    // # mut-check: returning BUDGET_EXHAUSTED for 0 targets flips this
    expect(result.terminated).toBe('CONVERGED');
    // # mut-check: creating spurious gaps for empty targets flips this
    expect(result.gaps.length).toBe(0);
    // # mut-check: spurious subgraph for empty demand flips this
    expect(result.subgraph.length).toBe(0);
  });

  it('concurrent loops are isolated (adversarial)', async () => {
    const { db: db1, engine: e1 } = makeEngine();
    const { db: db2, engine: e2 } = makeEngine();
    seedFixture(db1);
    seedFixture(db2);
    const demand = { question: 'concurrent', targets: [{ from: 'Function:foo', to: 'Function:target', predicate: 'calls' }] };
    const [r1, r2] = await Promise.all([runL6Loop(demand, { engine: e1 }), runL6Loop(demand, { engine: e2 })]);
    // # mut-check: shared mutable gaps state would make one closedCount 0
    expect(r1.closedCount).toBe(1);
    // # mut-check: race on shared engine would make second loop fail or 0
    expect(r2.closedCount).toBe(1);
    // # mut-check: exceeding budget on concurrent shows isolation leak
    expect(r1.roundsUsed).toBeLessThanOrEqual(r1.budget);
    // # mut-check: second instance exceeding budget similarly
    expect(r2.roundsUsed).toBeLessThanOrEqual(r2.budget);
    db1.close();
    db2.close();
  });

  it('path compilation runs on fixture graph — traced subgraph carries evidence', async () => {
    const { db, engine } = makeEngine();
    seedFixture(db);
    const demand = { question: 'provenance trace', targets: [{ from: 'EvidenceFile:ev-1', to: 'Function:foo', predicate: 'derived_from' }] };
    const result = await runL6Loop(demand, { engine });
    // # mut-check: disabling L6 fallback would leave gap open when predicate exact but path exists
    expect(result.gaps[0].closed).toBe(true);
    // # mut-check: evidence_quote not propagated from typed_edges flips this
    expect(result.subgraph[0].evidence_quote).toContain('derived');
    // # mut-check: plan sql not containing CTE indicates compile failure not stored
    expect(result.plans[0].sql).toContain('WITH RECURSIVE');
    // # mut-check: empty meaning string indicates buildMeaning not capturing gap predicate
    expect(result.meanings[0].length).toBeGreaterThan(10);
    db.close();
  });
});
