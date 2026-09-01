import { describe, test, expect, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseSpecBindings } from '../spec-bindings.ts';

const TMP = os.tmpdir();
let tmpRoot = '';

function mkRoot(): string {
  tmpRoot = fs.mkdtempSync(path.join(TMP, 'sb-t-'));
  return tmpRoot;
}
function writeSpec(root: string, name: string, content: string): string {
  const p = path.join(root, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}
afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (err: unknown) { void err; }
});

describe('shape: name-equals-value', () => {
  test('sl[3] = 2.5 parsed with provenance', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'a.md', 'sl[3] = 2.5\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations.length).toBe(1);
    const d = r.declarations[0]!;
    expect(d.name).toBe('sl[3]');
    expect(d.value).toBe(2.5);
    expect(d.tolerance).toBe(0);
    expect(d.specPath).toBe(spec);
    expect(d.line).toBe(1);
    expect(d.quote).toBe('sl[3] = 2.5');
    expect(r.unclear.length).toBe(0);
  });
  test('N(1+P) equals 24 via name-equals', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'b.md', '# spec\nN(1+P) = 24\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations.some((d) => d.value === 24)).toBe(true);
  });
});

describe('shape: name-colon-value-tolerance', () => {
  test('colon with ± tolerance', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'c.md', 'threshold: 0.38 ± 0.02\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations.length).toBe(1);
    expect(r.declarations[0]!.value).toBe(0.38);
    expect(r.declarations[0]!.tolerance).toBe(0.02);
  });
  test('colon with tolerance: N variant', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'd.md', 'sl: 2.5 tolerance: 0.1\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations[0]!.value).toBe(2.5);
    expect(r.declarations[0]!.tolerance).toBe(0.1);
  });
  test('colon with +- ascii', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'e.md', 'alpha: 1.0 +- 0.05\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations[0]!.tolerance).toBe(0.05);
  });
});

describe('shape: threshold phrases', () => {
  test('threshold 0.38 parsed', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'f.md', 'threshold 0.38\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations.length).toBe(1);
    expect(r.declarations[0]!.value).toBe(0.38);
    expect(r.declarations[0]!.quote).toContain('threshold');
  });
  test('at least 0.96 parsed', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'g.md', 'at least 0.96\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations[0]!.value).toBe(0.96);
  });
  test('>= 0.96 parsed', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'h.md', '>= 0.96\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations[0]!.value).toBe(0.96);
  });
});

describe('shape: cardinalities', () => {
  test('|O| = 24 parsed', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'i.md', '|O| = 24\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations[0]!.name).toBe('|O|');
    expect(r.declarations[0]!.value).toBe(24);
  });
});

describe('shape: backtick table + JSON blocks', () => {
  test('backtick table row parsed', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'j.md', '```\n| sl[3] | 2.5 | 0.1 |\n```\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations.length).toBe(1);
    expect(r.declarations[0]!.name).toBe('sl[3]');
    expect(r.declarations[0]!.value).toBe(2.5);
    expect(r.declarations[0]!.tolerance).toBe(0.1);
  });
  test('JSON block parsed', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'k.md', '{\n  "threshold": 0.38,\n  "epsilon": 0.01\n}\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations.some((d) => d.name === 'threshold' && d.value === 0.38)).toBe(true);
    expect(r.declarations.some((d) => d.name === 'epsilon' && d.value === 0.01)).toBe(true);
  });
});

describe('coverage fixture: spec-END declaration caught', () => {
  test('binding at last line is parsed', () => {
    const root = mkRoot();
    const lines = ['# Title', 'some prose', 'more prose', 'finalThreshold = 9.99'];
    const spec = writeSpec(root, 'end.md', lines.join('\n'));
    const r = parseSpecBindings([spec]);
    expect(r.declarations.some((d) => d.value === 9.99)).toBe(true);
    const d = r.declarations.find((x) => x.value === 9.99)!;
    expect(d.line).toBe(4);
  });
});

describe('UNCLEAR path', () => {
  test('unparseable clause lands in unclear with reason', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'unc.md', 'sl[3] = ???\nthreshold ???\n');
    const r = parseSpecBindings([spec]);
    expect(r.unclear.length >= 1).toBe(true);
    for (const u of r.unclear) {
      expect(u.clause.length > 0).toBe(true);
      expect(u.specPath).toBe(spec);
      expect(u.line > 0).toBe(true);
      expect(u.reason.length > 0).toBe(true);
    }
  });
  test('no binding dropped silently', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'unc2.md', '|O| = ???\n');
    const r = parseSpecBindings([spec]);
    expect(r.unclear.length).toBe(1);
    expect(r.declarations.length).toBe(0);
  });
});

describe('honest-empty', () => {
  test('spec with zero bindings yields empty declarations not error', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'empty.md', '# Just prose\nNo bindings here, only natural language.\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations.length).toBe(0);
    expect(r.unclear.length).toBe(0);
  });
});

describe('provenance MC-A-12', () => {
  test('every declaration carries specPath line quote', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'prov.md', 'a = 1\nb: 2 ± 0.1\nthreshold 3\n|O| = 4\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations.length).toBe(4);
    for (const d of r.declarations) {
      expect(d.specPath).toBe(spec);
      expect(d.line > 0).toBe(true);
      expect(d.quote.length > 0).toBe(true);
      expect(d.name.length > 0).toBe(true);
    }
  });
});

describe('adversarial', () => {
  test('empty array returns empty', () => {
    const r = parseSpecBindings([]);
    expect(r.declarations.length).toBe(0);
    expect(r.unclear.length).toBe(0);
  });
  test('null throws TypeError', () => {
    expect(() => parseSpecBindings(null as unknown as string[])).toThrow();
  });
  test('missing file maps to unclear not throw', () => {
    const fake = path.join(TMP, 'no-such-spec-xyz-9999.md');
    const r = parseSpecBindings([fake]);
    expect(r.unclear.length).toBe(1);
    expect(r.unclear[0]!.reason).toContain('read failed');
  });
  test('concurrent calls produce independent results', async () => {
    const root = mkRoot();
    const s1 = writeSpec(root, 'c1.md', 'x = 1\n');
    const s2 = writeSpec(root, 'c2.md', 'y = 2\n');
    const [a, b] = await Promise.all([Promise.resolve(parseSpecBindings([s1])), Promise.resolve(parseSpecBindings([s2]))]);
    expect(a.declarations[0]!.value).toBe(1);
    expect(b.declarations[0]!.value).toBe(2);
  });
  test('boundary: very long file last line still parsed', () => {
    const root = mkRoot();
    const many = Array.from({ length: 500 }, (_, i) => `prose line ${i}`).join('\n') + '\nfinalVal = 123.456\n';
    const spec = writeSpec(root, 'long.md', many);
    const r = parseSpecBindings([spec]);
    expect(r.declarations.some((d) => d.value === 123.456)).toBe(true);
  });
  test('boundary: empty file', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'empty2.md', '');
    const r = parseSpecBindings([spec]);
    expect(r.declarations.length).toBe(0);
  });
  test('values computed from data not hardcoded', () => {
    const root = mkRoot();
    const spec = writeSpec(root, 'calc.md', 'myVal = 42.123\n');
    const r = parseSpecBindings([spec]);
    expect(r.declarations[0]!.value).toBe(42.123);
  });
});
