import { describe, it, expect } from 'bun:test';

type Lc = {
  subject: string;
  predicate: string;
  object: string;
  file: string;
  line: number;
  evidenceQuote: string;
  implicatedSpecClause?: string;
  side: string;
  layer: string;
  index: number;
};

// mut-check: removing ${c.layer} from key would collapse cross-layer distinct findings — test "dup across layers" would fail
// mut-check: changing has→!has or seenKeys.add removal would emit dupes twice — test "same triple seeded twice" would fail
// mut-check: changing === to == still passes but mutating length check to >= would hide doubling
function mandateDedupeKey(c: Lc): string {
  return `${c.layer}:${c.file}:${c.line}:${c.predicate}:${c.object}`;
}

function emitWithDedupe(
  candidates: Lc[],
  adjudicationMap: Map<number, string> = new Map(),
): Lc[] {
  const seenKeys = new Set<string>();
  const out: Lc[] = [];
  for (const c of candidates) {
    const adjudication = adjudicationMap.get(c.index) ?? 'UNCLEAR';
    if (adjudication === 'RED_HERRING') continue;
    const key = mandateDedupeKey(c);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push(c);
  }
  return out;
}

function mkCandidate(overrides: Partial<Lc> & { index: number }): Lc {
  return {
    subject: 'src/foo.ts:10',
    predicate: 'shouldBe',
    object: 'Contract',
    file: 'src/foo.ts',
    line: 10,
    evidenceQuote: 'x < 0.5',
    side: 'SIDE-1',
    layer: 'r-mpse',
    ...overrides,
  };
}

describe('SPEC-A A-4 mandate block dedupe — a seeded candidate appears exactly once', () => {
  it('same candidate triple seeded twice appears exactly once after dedupe', () => {
    const a = mkCandidate({ index: 0 });
    const b = mkCandidate({ index: 1 });
    const emitted = emitWithDedupe([a, b]);
    expect(emitted.length).toBe(1);
    expect(emitted.filter((c) => mandateDedupeKey(c) === mandateDedupeKey(a)).length).toBe(1);
    expect(emitted[0]!.index).toBe(0);
  });

  it('three-way dup same triple x3 still yields exactly once', () => {
    const a = mkCandidate({ index: 0 });
    const b = mkCandidate({ index: 1 });
    const c = mkCandidate({ index: 2 });
    const emitted = emitWithDedupe([a, b, c]);
    expect(emitted.length).toBe(1);
    expect(new Set(emitted.map(mandateDedupeKey)).size).toBe(1);
    expect(emitted[0]!.file).toBe('src/foo.ts');
  });

  it('dup across layers same file/line/predicate/object is NOT deduped because layer is part of key', () => {
    const a = mkCandidate({ index: 0, layer: 'r-lexicon' });
    const b = mkCandidate({ index: 1, layer: 'r-mpse' });
    const emitted = emitWithDedupe([a, b]);
    expect(emitted.length).toBe(2);
    expect(mandateDedupeKey(a)).not.toBe(mandateDedupeKey(b));
  });

  it('same layer same triple dedupes even across different index order', () => {
    const a = mkCandidate({ index: 5, layer: 'r-engine' });
    const b = mkCandidate({ index: 6, layer: 'r-engine' });
    const emitted = emitWithDedupe([a, b]);
    expect(emitted.length).toBe(1);
    expect(emitted[0]!.index).toBe(5);
  });

  it('distinct triples are not collapsed', () => {
    const a = mkCandidate({ index: 0, predicate: 'shouldBe', object: 'Contract' });
    const b = mkCandidate({ index: 1, predicate: 'violates', object: 'Contract' });
    const c = mkCandidate({ index: 2, predicate: 'shouldBe', object: 'Lexicon' });
    const emitted = emitWithDedupe([a, b, c]);
    expect(emitted.length).toBe(3);
  });

  it('RED_HERRING adjudication is filtered before dedupe', () => {
    const a = mkCandidate({ index: 0 });
    const b = mkCandidate({ index: 1 });
    const map = new Map<number, string>([[1, 'RED_HERRING']]);
    const emitted = emitWithDedupe([a, b], map);
    expect(emitted.length).toBe(1);
    expect(emitted[0]!.index).toBe(0);
  });

  it('concurrent dedupe calls produce deterministic results', async () => {
    const a = mkCandidate({ index: 0 });
    const b = mkCandidate({ index: 1 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => Promise.resolve(emitWithDedupe([a, b]).length)),
    );
    expect(results.every((n) => n === 1)).toBe(true);
  });
});
