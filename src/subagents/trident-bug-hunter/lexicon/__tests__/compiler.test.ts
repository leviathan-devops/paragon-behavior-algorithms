// src/subagents/trident-bug-hunter/lexicon/__tests__/compiler.test.ts
// THE LEXICON COMPILER TESTS (W4) — the spec section 6.3 pseudocode (lines
// 2687-2720) transcribed VERBATIM + the adversarial additions (>= 3). The
// fixtures are tmpdir-created (the spec's corpus-a.md with 3 known quotes, the
// soft-voice corpus-b, the quote-less corpus, the hostile corpus with the
// 'run everything' fake rule, the empty corpus) — the fixtures NEVER point at a
// real project. A test that cannot fail is a defect: the determinism is asserted
// EXPLICITLY (any ordering/randomness drift fails), and the hostile corpus is
// proven to compile as DATA (the check is a pure graph/source read, never an
// execution). The engine (diagnostics/) is W5 — NOT this suite's scope.
//
// TYPE-SURFACE NOTE (recorded honestly): the assertions conform to W1's ambient
// bun:test shim (src/shared/knowledge-graph/bun-modules.d.ts — the matcher
// surface the strict `types: ["node"]` tsconfig can resolve). The shim's matcher
// set is toBe/toEqual/toBeTruthy/toBeFalsy/toContain/toHaveProperty/toThrow/
// toBeGreaterThanOrEqual/toBeLessThanOrEqual (+ not) — the regex assertions use
// the RegExp.test() form and the async-error assertions use the explicit
// try/catch capture form. The shim is W1's deliverable; the minimal-change law
// forbids editing it — the tests conform to its surface.

import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectProfileSchema, type ProjectProfile } from '../../../../shared/knowledge-graph/profile-schema.ts';
import { openStore } from '../../../../shared/knowledge-graph/db.ts';
import type { GraphAdapter } from '../../graph/interface.ts';
import { compile, compileBattery, batteryVersion } from '../compiler.ts';
import { extractRuleCards } from '../rule-card.ts';
import { writeRuleCards, loadBattery } from '../compiled-store.ts';

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-lexicon-test-'));
const createdTmp: string[] = [tmpBase];

afterAll(() => {
  for (const d of createdTmp) {
    try { fs.rmSync(d, { recursive: true, force: true }); }
    catch (e: unknown) { console.error(`[compiler.test cleanup] failed to remove ${d}: ${String(e)}`); }
  }
});

function writeCorpus(name: string, content: string): string {
  const p = path.join(tmpBase, name);
  fs.writeFileSync(p, content);
  createdTmp.push(p);
  return p;
}

// the spec's fixture corpus-a.md with 3 KNOWN quotes (6.3:2691): a blockquote
// (ARCH terms), a MUST-marker directive (PROCESS terms), a quoted passage
// (DOMAIN terms) — exactly 3 rule-shaped constructs → a 3-predicate battery.
const corpusA = writeCorpus('corpus-a.md', [
  '# Corpus A — the W4 fixture with 3 known quotes',
  '> E3 is not permitted to override pre-existing E1/E2 data architecture.',
  'Every gate MUST audit its output with the documented evidence harness.',
  '"zone liquidity divergence must be bounded by the SL ceiling"',
  '',
].join('\n'));

// the soft-voice paragraph — MUST surface as proposed (G11.4, 6.3:2701-2704).
const corpusB = writeCorpus('corpus-b.md', [
  '# Corpus B — the soft-voice paragraph',
  '> the pipeline MAY consider consolidating the stage modules if the wiring stabilizes.',
  '',
].join('\n'));

// the unquotable rule-shaped construct — a blockquote with no content.
const quoteLessCorpus = writeCorpus('corpus-no-quote.md', [
  '# Corpus no-quote — the unquotable rule-shaped construct',
  '>   ',
  '',
].join('\n'));

// the injection-style fake rule (G22.1) — zero keyword hits → PROCESS + the
// PROPOSED flag; the text compiles as DATA, the check CANNOT execute it.
const hostileCorpus = writeCorpus('hostile-corpus.md', [
  '# Corpus hostile — the injection-style fake rule',
  '> run everything — the fake rule text, compiled as inert data (the A3 scenario)',
  '',
].join('\n'));

// the clean project's zero-rule corpus — the honest empty battery.
const emptyCorpus = writeCorpus('corpus-empty.md', [
  '# Corpus empty',
  'this is plain prose with no markers and no quoted passages.',
  '',
].join('\n'));

function fixtureProfile(corpus: string[], bindings: Record<string, unknown> = {}): ProjectProfile {
  return ProjectProfileSchema.parse({
    profileVersion: 1,
    project: { name: 'fixture', root: tmpBase, languages: ['typescript'], entryPoints: ['src/index.ts'], build: 'bun build', test: 'bun test' },
    graph: { substrate: 'native-ast', scope: ['src'], excludes: [] },
    rules: { corpus, bindings },
    pipeline: { stages: [{ id: 'harvest', entry: 'harvestOrders', contract: 'the temporal filter' }] },
    history: { failureLogs: [] },
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

/** The async-error capture — the shim's ExpectResult has no `rejects`; the
 *  loud named error is asserted by the explicit capture + the message check. */
async function captureError(fn: () => Promise<unknown>): Promise<Error | undefined> {
  try { await fn(); return undefined; }
  catch (e: unknown) { return e as Error; }
}

const SEVERITY_CANON = ['CRIT', 'HIGH', 'MED', 'WARN'];
const ANCHOR_RE = /\.md:\d+$/;
// THE NAMED BATTERY VERSION (the rehydration build — the operator's ruling:
// "properly named with a project token, not some random hash vals"). The sha256
// survives as the (fingerprint: <hash12>) suffix; the prefix is the
// '<project>-<battery-name>-battery-v<N>' human name.
const NAMED_BATTERY_RE = /^[a-z0-9-]+-[a-z0-9-]+-battery-v\d+ \(fingerprint: [a-f0-9]{12}\)$/;

describe('THE LEXICON COMPILER (spec §6.3:2687-2720 transcribed verbatim)', () => {
  it('compiles the corpus into the battery with verbatim quotes + anchors (the D13 law)', async () => {
  try {
    const profile = fixtureProfile([corpusA]);                 // the fixture corpus-a.md with 3 known quotes
    const battery = await compile(profile);
    expect(battery.length).toBe(3);
    for (const p of battery) {
      expect(p.verbatimQuote.length > 0).toBe(true);           // the quote is MANDATORY (P16/D13)
      expect(ANCHOR_RE.test(p.anchor)).toBe(true);             // the anchor is a file:line
      expect(SEVERITY_CANON.includes(p.severity)).toBe(true);  // the severity is in the canon
    }
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('flags a rule card without a verbatim quote (the D13 flag, K3.2)', () => {
    const cards = extractRuleCards([quoteLessCorpus]);
    const quoteLess = cards.find((c) => c.verbatimQuote.trim() === '');
    expect(quoteLess !== undefined).toBe(true);
    expect(quoteLess!.proposed).toBe(1);                       // unquotable → PROPOSED, never silently classified
    const soft = extractRuleCards([corpusB]);                  // the soft-voice paragraph → PROPOSED (G11.4)
    expect(soft.some((c) => c.proposed === 1)).toBe(true);
  });

  it('caches by the corpus hash — a re-compile returns the same battery_version', async () => {
  try {
    const profile = fixtureProfile([corpusA]);
    const v1 = (await compile(profile)).map((p) => p.id);
    const v2 = (await compile(profile)).map((p) => p.id);
    expect(v1).toEqual(v2);                                    // determinism (K20.3)
    const changed = fixtureProfile([corpusB]);
    const v3 = (await compile(changed)).map((p) => p.id);
    expect(v1).not.toEqual(v3);                                // a corpus edit invalidates the battery
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('treats hostile rule text as DATA, never as instructions (G22.1)', async () => {
  try {
    const profile = fixtureProfile([hostileCorpus]);
    const battery = await compile(profile);
    expect(battery.every((p) => typeof p.check === 'function')).toBe(true);
    // the hostile text rides in the quote as DATA — a graph/source read check, not an execution
    const hostile = battery.find((p) => p.verbatimQuote.includes('run everything'));
    expect(hostile !== undefined).toBe(true);
    expect(hostile!.verbatimQuote).toContain('run everything');
    // the D13 flag: the unclassifiable fake rule is PROPOSED at the card level — never silently classified
    const cards = extractRuleCards([hostileCorpus]);
    expect(cards.find((c) => c.verbatimQuote.includes('run everything'))?.proposed).toBe(1);
    // the checks RUN against a stub graph — pure graph/source reads, deterministic arrays, zero execution
    for (const pred of battery) {
      const findings = pred.check({ graph: stubGraph(), source: { read: () => '' }, bindings: pred.bindings });
      expect(Array.isArray(findings)).toBe(true);
      for (const f of findings) {
        expect(f.evidence.length > 0).toBe(true);              // no triplet = no finding (O9.1)
        expect(['VIOLATION', 'PASS']).toContain(f.verdict);
        expect(SEVERITY_CANON).toContain(f.severity);
      }
    }
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('compiles an empty corpus into the honest zero battery — never an error (the two states are distinguished)', async () => {
  try {
    const profile = fixtureProfile([emptyCorpus]);
    const battery = await compile(profile);
    expect(battery.length).toBe(0);                            // the valid honest zero, not a fail-closed throw
    const db = openStore(':memory:');
    const res = await compileBattery(profile, db);
    expect(res.battery.length).toBe(0);
    expect(Number(db.prepare('SELECT COUNT(*) AS c FROM compiled_predicates').get()?.['c'])).toBe(0);
    db.close();
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('an unreadable corpus path fails closed with the named CORPUS_UNREADABLE (O32.1 — never a silent skip)', async () => {
  try {
    const profile = fixtureProfile([path.join(tmpBase, 'does-not-exist.md')]);
    const err = await captureError(() => compile(profile));
    expect(err !== undefined).toBe(true);
    expect(err!.message).toContain('CORPUS_UNREADABLE');
    expect(err!.message).toContain('does-not-exist.md');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('throws D13_VIOLATION on a quote-less card (the D13 mechanical gate)', async () => {
  try {
    const profile = fixtureProfile([quoteLessCorpus]);
    const err = await captureError(() => compile(profile));
    expect(err !== undefined).toBe(true);
    expect(err!.message).toContain('D13_VIOLATION');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('is cached — a second compile with the same corpus returns the same version + fromCache (spec §3.9:1274-1279)', async () => {
  try {
    const db = openStore(':memory:');
    const first = await compileBattery(fixtureProfile([corpusA]), db);
    expect(first.fromCache).toBe(false);
    expect(NAMED_BATTERY_RE.test(first.batteryVersion)).toBe(true); // the named '<project>-<battery>-v<N> (fingerprint: <hash12>)' form
    const second = await compileBattery(fixtureProfile([corpusA]), db);
    expect(second.fromCache).toBe(true);                       // the corpus-hash cache hit
    expect(second.batteryVersion).toBe(first.batteryVersion);
    expect(second.battery.map((x) => x.id)).toEqual(first.battery.map((x) => x.id));
    db.close();
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('a corpus edit changes the battery version (the content-hash invalidation, K20.3)', async () => {
    const a = batteryVersion(fixtureProfile([corpusA]));
    const b = batteryVersion(fixtureProfile([corpusB]));
    expect(NAMED_BATTERY_RE.test(a)).toBe(true);
    expect(NAMED_BATTERY_RE.test(b)).toBe(true);
    expect(a).not.toBe(b);
    // a content-only edit (same shape, different bytes) also invalidates — never mtime
    const editedPath = writeCorpus('corpus-a-edited.md', [
      '# Corpus A — the W4 fixture with 3 known quotes',
      '> E3 is not permitted to override pre-existing E1/E2 data architecture.',
      'Every gate MUST audit its output with the documented evidence harness.',
      '"zone liquidity divergence must be DERIVED, never invented"',
      '',
    ].join('\n'));
    expect(batteryVersion(fixtureProfile([editedPath]))).not.toBe(a);
  });

  it('is DETERMINISTIC — the same corpus always produces the same battery, byte for byte (K20.3)', async () => {
  try {
    const profile = fixtureProfile([corpusA]);
    const shape = (b: { id: string; family: string; template: string; verbatimQuote: string; anchor: string; severity: string; batteryVersion: string }[]) =>
      JSON.stringify(b);
    const a = await compile(profile);
    const b = await compile(profile);
    expect(shape(a)).toBe(shape(b));
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('maps the classification to the family (ARCH→CONTRACT, PROCESS→PROCESS, DOMAIN→DOMAIN — spec §3.9 selectTemplate)', async () => {
  try {
    const battery = await compile(fixtureProfile([corpusA]));
    expect(battery.map((x) => x.family)).toEqual(['CONTRACT', 'PROCESS', 'DOMAIN']);
    expect(battery[0].template).toBe('contract.must-implement');
    expect(battery[1].template).toBe('process.gates-measure-outputs-not-logic');
    expect(battery[2].template).toBe('domain.numeric-threshold');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('classifies the domain terms into DOMAIN (spec §3.8:1200-1204)', () => {
    const cards = extractRuleCards([corpusA]);
    const dom = cards.find((c) => c.verbatimQuote.includes('zone liquidity'));
    expect(dom !== undefined).toBe(true);
    expect(dom!.classification).toBe('DOMAIN');
  });

  it('honors the DECLARED classification/severity metadata over the vote (the 2026-08-13 P6 silent-findings root — the corpus says classification: DOMAIN, the quote votes LOGIC via the anchor term)', async () => {
  try {
    // THE RUNTIME-PROVEN CASE (the suite container plutus-bh-suite-20260813):
    // the fixture corpus declares 'classification: DOMAIN' + 'severity: HIGH'
    // on the lines following the rule, but the keyword vote on the quote
    // ('price anchored' → the LOGIC term 'anchor') classified the card as LOGIC
    // → selectTemplate picked provenance.traces-to-source (no bindings) → the
    // domain.numeric-threshold predicate NEVER compiled → the P6 check was
    // structurally absent despite the correct profile bindings + the enriched
    // graph data. THE FIX: the declared metadata overrides the vote.
    const declaredCorpus = writeCorpus('corpus-declared-p6.md', [
      '# THE RULES',
      '',
      '- P6: NOTHING SHOULD BE PRICE ANCHORED EVER',
      '  "Nothing should be price anchored - the level is data, never a hardcoded anchor."',
      '  classification: DOMAIN',
      '  severity: HIGH',
      '',
    ].join('\n'));
    const cards = extractRuleCards([declaredCorpus]);
    const p6 = cards.find((c) => c.verbatimQuote.includes('price anchored'));
    expect(p6 !== undefined).toBe(true);
    expect(p6!.classification).toBe('DOMAIN');   // the DECLARED value wins over the LOGIC vote
    expect(p6!.severity).toBe('HIGH');           // the DECLARED severity wins over the CRIT rating
    // AND the compiled battery picks the domain template — the P6 chain's missing link
    const battery = await compile(fixtureProfile([declaredCorpus], {
      'domain.numeric-threshold': { symbol: 'selectZone', valuePath: 'comparator', operator: 'gt', threshold: 1.0 },
    }));
    const dom = battery.find((b) => b.template === 'domain.numeric-threshold');
    expect(dom !== undefined).toBe(true);
    expect(dom!.bindings['symbol']).toBe('selectZone');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});

describe('THE COMPILED STORE (W1\'s compiled_predicates via the pass-through surface)', () => {
  it('lands the battery rows in compiled_predicates with the calibrated column at its DEFAULT PENDING', async () => {
  try {
    const db = openStore(':memory:');
    const { battery, batteryVersion } = await compileBattery(fixtureProfile([corpusA]), db);
    expect(battery.length).toBe(3);
    const rows = db.prepare(
      'SELECT id,family,template,bindings,verbatim_quote,anchor,severity,check_code,battery_version,calibrated FROM compiled_predicates',
    ).all();
    expect(rows.length).toBe(battery.length);
    for (const r of rows) {
      expect(String(r['calibrated'])).toBe('PENDING');         // the W5 gate's default (db.ts:267)
      expect(String(r['verbatim_quote']).length > 0).toBe(true); // the D13 quote mandatory on every row
      expect(ANCHOR_RE.test(String(r['anchor']))).toBe(true);
      expect(SEVERITY_CANON.includes(String(r['severity']))).toBe(true);
      expect(String(r['battery_version'])).toBe(batteryVersion);
      const code = JSON.parse(String(r['check_code']));
      expect(code).toHaveProperty('template');                 // the honest reinstatement shape
      expect(code).toHaveProperty('bindings');
    }
    // the write is idempotent — a recompile replaces the rows, never accumulates
    await compileBattery(fixtureProfile([corpusA]), db);
    expect(Number(db.prepare('SELECT COUNT(*) AS c FROM compiled_predicates').get()?.['c'])).toBe(battery.length);
    db.close();
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('a fresh reader reinstantiates the checks from the stored template + params (loadBattery)', async () => {
  try {
    const db = openStore(':memory:');
    const { battery, batteryVersion } = await compileBattery(fixtureProfile([corpusA]), db);
    const loaded = loadBattery(db, batteryVersion);
    expect(loaded.map((x) => x.id)).toEqual(battery.map((x) => x.id));
    expect(loaded.map((x) => x.verbatimQuote)).toEqual(battery.map((x) => x.verbatimQuote));
    expect(loaded.map((x) => x.batteryVersion)).toEqual(battery.map((x) => x.batteryVersion));
    expect(loaded.every((x) => typeof x.check === 'function')).toBe(true);
    for (const pred of loaded) {
      const findings = pred.check({ graph: stubGraph(), source: { read: () => '' }, bindings: pred.bindings });
      expect(Array.isArray(findings)).toBe(true);
    }
    db.close();
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('writeRuleCards replaces the previous rows for the corpus_hash (idempotent, never accumulated)', () => {
    const db = openStore(':memory:');
    const cards = extractRuleCards([corpusA]);
    writeRuleCards(db, cards, 'hash-a');
    writeRuleCards(db, cards, 'hash-a');
    expect(Number(db.prepare('SELECT COUNT(*) AS c FROM rule_cards WHERE corpus_hash = ?').get('hash-a')?.['c'])).toBe(cards.length);
    const rows = db.prepare('SELECT quote,anchor,classification,severity,proposed,corpus_hash FROM rule_cards').all();
    expect(rows.every((r) => String(r['corpus_hash']) === 'hash-a')).toBe(true);
    db.close();
  });

  it('an invalid binding fails closed with the named TEMPLATE_BINDING error, never a coerced default (spec §3.9 failure modes)', async () => {
  try {
    const profile = fixtureProfile([corpusA], {
      declaredPredicates: {
        'p.test': { template: 'domain.numeric-threshold', verbatimQuote: 'the divergence ceiling', anchor: 'corpus.md:1', severity: 'HIGH', threshold: 'not-a-number' },
      },
    });
    const err = await captureError(() => compile(profile));
    expect(err !== undefined).toBe(true);
    expect(err!.message).toContain('TEMPLATE_BINDING');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the declared-predicate path compiles profile bindings outside the corpus extraction (spec §3.9:1233-1235)', async () => {
  try {
    const profile = fixtureProfile([corpusA], {
      declaredPredicates: {
        'p.test': { template: 'domain.numeric-threshold', verbatimQuote: 'the divergence ceiling', anchor: 'corpus.md:1', severity: 'HIGH', symbol: 'harvestOrders', valuePath: 'divergence', operator: 'gt', threshold: 0.35 },
      },
    });
    const battery = await compile(profile);
    expect(battery.length).toBe(4);                            // 3 corpus cards + 1 declared
    const p = battery.find((x) => x.template === 'domain.numeric-threshold' && x.verbatimQuote === 'the divergence ceiling');
    expect(p !== undefined).toBe(true);
    expect(p!.severity).toBe('HIGH');
    // the declared predicate fires on a graph whose divergence exceeds the ceiling
    const graph = stubGraph({
      nodes: () => [{ id: 'fn:harvestOrders', kind: 'function', name: 'harvestOrders', file: 'src/engine.ts', line: 12, lineage: 'CODE_DERIVED', source: 'corbell', data: { divergence: 0.42 } }],
    });
    const findings = p!.check({ graph, source: { read: () => '' }, bindings: p!.bindings });
    expect(findings.some((f) => f.ruleId === 'domain.numeric-threshold' && f.verdict === 'VIOLATION')).toBe(true);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('a declared predicate without a verbatim quote is a D13_VIOLATION (the quote is mandatory on every row)', async () => {
  try {
    const profile = fixtureProfile([corpusA], {
      declaredPredicates: {
        'p.quote-less': { template: 'wiring.no-dead-module', anchor: 'corpus.md:1', severity: 'HIGH' },
      },
    });
    const err = await captureError(() => compile(profile));
    expect(err !== undefined).toBe(true);
    expect(err!.message).toContain('D13_VIOLATION');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});
