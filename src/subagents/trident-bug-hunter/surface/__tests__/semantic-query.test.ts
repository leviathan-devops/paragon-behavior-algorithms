// src/subagents/trident-bug-hunter/surface/__tests__/semantic-query.test.ts
// THE SEMANTIC + DOCS VERB BATTERY (the W2b surface splices). The corbell-native
// verbs (semantic-search / code-search / docs-patterns) dispatch through the
// SAME runQuery surface as the 7 structural verbs — this battery exercises the
// dispatch + the D22 formatting with FAKE surfaces (hermetic), plus the loud
// failures (a verb without its surface), plus the adversarial topK coercions.

import { describe, it, expect, beforeAll } from 'bun:test';
import { openStore, type DbClient } from '../../../../shared/knowledge-graph/db.ts';
import { runQuery, type SemanticSurface, type DocsPatternSurface } from '../query-tool.ts';

let db: DbClient;

beforeAll(() => {
  db = openStore(':memory:');
});

const fakeSemantic: SemanticSurface = {
  query: (query, topK) => {
    if (query === 'NO_MATCH') return [];
    return [1, 2].slice(0, topK).map((i) => ({
      rank: i,
      serviceId: 'svc',
      filePath: `src/mod${i}.ts`,
      symbol: `sym${i}`,
      chunkType: 'function',
      startLine: i * 10,
      endLine: i * 10 + 5,
      content: `content ${i}`,
      language: 'typescript',
      score: 1 - i * 0.1,
    }));
  },
};

const fakeDocs: DocsPatternSurface = {
  list: () => [
    { id: 'pat-1', sourceFile: '/proj/DESIGN.md', detectedType: 'design_doc', sectionHeadings: ['Decision'], terminology: {}, decisions: [{ id: 'd1', summary: 'zone-anchored', rationale: null }] },
  ],
};

describe('semantic-search / code-search — the top-k chunks + the similarity scores', () => {
  it('semantic-search returns the ranked hits with the scores (the D22-able rows)', () => {
    const rows = runQuery({ verb: 'semantic-search', query: 'pipeline', topK: 2 }, db, undefined, { semantic: fakeSemantic });
    expect(rows.length).toBe(2);
    expect(rows[0]['rank']).toBe(1);
    expect(rows[0]['file']).toBe('src/mod1.ts');
    expect(typeof rows[0]['score']).toBe('number');
  });

  it('code-search is the alias — the same dispatch, the same rows', () => {
    const rows = runQuery({ verb: 'code-search', query: 'pipeline', topK: 1 }, db, undefined, { semantic: fakeSemantic });
    expect(rows.length).toBe(1);
    expect(rows[0]['rank']).toBe(1);
  });

  it('the empty query → the TYPED EMPTY, never an exception', () => {
    const rows = runQuery({ verb: 'semantic-search', query: '   ', topK: 5 }, db, undefined, { semantic: fakeSemantic });
    expect(rows.length).toBe(0);
  });

  it('the empty result (no matches) → the honest empty', () => {
    const rows = runQuery({ verb: 'semantic-search', query: 'NO_MATCH', topK: 5 }, db, undefined, { semantic: fakeSemantic });
    expect(rows.length).toBe(0);
  });

  it('a verb without the semantic surface → the loud SEMANTIC_UNAVAILABLE', () => {
    let threw = '';
    try {
      runQuery({ verb: 'semantic-search', query: 'x' }, db);
    } catch (e: unknown) {
      console.warn('[semantic-query.test] runQuery threw (expected): ' + String(e));
      threw = String(e);
    }
    expect(threw).toContain('SEMANTIC_UNAVAILABLE');
  });

  it('--format llm emits the token-minimal records (the D22 pattern)', () => {
    const rows = runQuery({ verb: 'semantic-search', query: 'pipeline', topK: 1, format: 'llm' }, db, undefined, { semantic: fakeSemantic });
    const record = String(rows[0]['record']);
    expect(record).toContain('rank=1');
    expect(record).toContain('score=0.9');
    expect(record).toContain('file=src/mod1.ts');
  });

  it('the adversarial topK: 0 and negative coerce to 1 (never an empty-from-bad-arg)', () => {
    const zero = runQuery({ verb: 'semantic-search', query: 'x', topK: 0 }, db, undefined, { semantic: fakeSemantic });
    expect(zero.length).toBe(1);
    const neg = runQuery({ verb: 'semantic-search', query: 'x', topK: -3 }, db, undefined, { semantic: fakeSemantic });
    expect(neg.length).toBe(1);
  });
});

describe('docs-patterns — the learned patterns from the corbell docs store', () => {
  it('returns the pattern rows (the source + the type + the decisions)', () => {
    const rows = runQuery({ verb: 'docs-patterns' }, db, undefined, { docs: fakeDocs });
    expect(rows.length).toBe(1);
    expect(rows[0]['sourceFile']).toBe('/proj/DESIGN.md');
    expect(rows[0]['type']).toBe('design_doc');
    expect(String(rows[0]['decisions'])).toContain('zone-anchored');
  });

  it('a verb without the docs surface → the loud DOCS_UNAVAILABLE', () => {
    let threw = '';
    try {
      runQuery({ verb: 'docs-patterns' }, db);
    } catch (e: unknown) {
      console.warn('[semantic-query.test] runQuery threw (expected): ' + String(e));
      threw = String(e);
    }
    expect(threw).toContain('DOCS_UNAVAILABLE');
  });

  it('the empty docs store → the honest empty', () => {
    const empty: DocsPatternSurface = { list: () => [] };
    const rows = runQuery({ verb: 'docs-patterns' }, db, undefined, { docs: empty });
    expect(rows.length).toBe(0);
  });

  it('--format llm formats the pattern rows (the D22 pattern)', () => {
    const rows = runQuery({ verb: 'docs-patterns', format: 'llm' }, db, undefined, { docs: fakeDocs });
    const record = String(rows[0]['record']);
    expect(record).toContain('pattern=pat-1');
    expect(record).toContain('type=design_doc');
  });
});

describe('the verb union — the invalid verb still fails loudly', () => {
  it('an unknown verb names the full verb set including the new corbell-native verbs', () => {
    let threw = '';
    try {
      runQuery({ verb: 'nope' as never }, db);
    } catch (e: unknown) {
      console.warn('[semantic-query.test] runQuery threw (expected): ' + String(e));
      threw = String(e);
    }
    expect(threw).toContain('QUERY_INVALID');
    expect(threw).toContain('semantic-search');
    expect(threw).toContain('docs-patterns');
  });
});
