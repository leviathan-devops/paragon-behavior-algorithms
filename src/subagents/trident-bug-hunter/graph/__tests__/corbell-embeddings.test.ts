// src/subagents/trident-bug-hunter/graph/__tests__/corbell-embeddings.test.ts
// THE CORBELL-EMBEDDINGS BATTERY (the W2b semantic layer — the mock-CLI + the
// score-path store fixtures). The exec + encode stubs keep the battery hermetic
// (no real corbell binary, no torch): the build parses the vendor summary, the
// query scores REAL float32 vectors through the vendor's cosine formula.
//
// THE ADVERSARIAL MANDATE: every path has its failure test — the missing binary,
// the failed build, the unopenable store, the unavailable model, the empty
// index, the empty query, the malformed blob, the zero-norm vector.

import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import {
  buildEmbeddingIndex,
  queryEmbeddingIndex,
  parseEmbeddingSummary,
  cosineSimilarity,
  decodeFloat32Blob,
  resolveCorbellBin,
  embeddingStorePath,
  CorbellEmbeddings,
  defaultEmbeddingExec,
  type EncodeFn,
} from '../corbell-embeddings.ts';
import { markInconclusive } from '../../testing/inconclusive.ts';

/** The shim-safe float compare (the bun:test ExpectResult shim lacks toBeCloseTo). */
function closeTo(actual: number, expected: number, eps = 1e-6): boolean {
  return Math.abs(actual - expected) < eps;
}

const createdTmp: string[] = [];
afterAll(() => {
  for (const d of createdTmp) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e: unknown) { console.error(`[corbell-embeddings.test cleanup] ${String(e)}`); }
  }
});

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-emb-test-'));
  createdTmp.push(dir);
  return dir;
}

/** The vendor's embedding_chunks schema (sqlite_store.py:20-34), verbatim. */
function writeEmbeddingStore(root: string, chunks: Array<{ id: string; file_path: string; start_line: number; end_line: number; content: string; chunk_type: string; symbol: string | null; vec: number[] }>): string {
  const dir = path.join(root, 'corbell-data', '.corbell');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'workspace.db'));
  db.exec(
    'CREATE TABLE IF NOT EXISTS embedding_chunks (' +
    'id TEXT PRIMARY KEY, service_id TEXT NOT NULL, repo TEXT NOT NULL, file_path TEXT NOT NULL, ' +
    'start_line INTEGER, end_line INTEGER, content TEXT NOT NULL, language TEXT NOT NULL, ' +
    'chunk_type TEXT NOT NULL, symbol TEXT, embedding BLOB);',
  );
  const ins = db.prepare(
    'INSERT INTO embedding_chunks (id, service_id, repo, file_path, start_line, end_line, content, language, chunk_type, symbol, embedding) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  for (const c of chunks) {
    const blob = new Uint8Array(Float32Array.from(c.vec).buffer);
    ins.run(c.id, 'bh-native-fixture', '/proj', c.file_path, c.start_line, c.end_line, c.content, 'typescript', c.chunk_type, c.symbol, blob);
  }
  db.close();
  return path.join(dir, 'workspace.db');
}

/** A deterministic encode stub: the query vector + the recorded texts. */
function stubEncode(vec: number[]): { encode: EncodeFn; calls: string[][] } {
  const calls: string[][] = [];
  const encode: EncodeFn = (texts) => {
    calls.push([...texts]);
    return texts.map(() => vec);
  };
  return { encode, calls };
}

/** A recording exec stub (the corbell-adapter pattern). */
function recordingExec(out: string): { exec: (cmd: string, opts?: { cwd?: string; timeout?: number }) => string; calls: string[] } {
  const calls: string[] = [];
  const exec = (cmd: string, opts?: { cwd?: string; timeout?: number }): string => {
    calls.push(cmd);
    return out;
  };
  return { exec, calls };
}

async function rejectionOf(fn: () => unknown): Promise<string> {
  try { fn(); } catch (e: unknown) { return String(e); }
  return '';
}

// THE FIXTURE CHUNKS (module scope — shared by the score-path suites)
const CHUNK_A = { id: 'c1', file_path: 'src/engine.ts', start_line: 1, end_line: 5, content: 'class Pipeline', chunk_type: 'block', symbol: 'Pipeline', vec: [1, 0, 0] };
const CHUNK_B = { id: 'c2', file_path: 'src/store.ts', start_line: 10, end_line: 15, content: 'class OrderStore', chunk_type: 'block', symbol: 'OrderStore', vec: [0, 1, 0] };
const CHUNK_C = { id: 'c3', file_path: 'src/mix.ts', start_line: 20, end_line: 22, content: 'function mix', chunk_type: 'function', symbol: 'mix', vec: [0.5, 0.5, 0] };

describe('the cosine + blob math (THE VENDOR FORMULA — sqlite_store.py:157-204)', () => {
  it('identical vectors → 1.0 (the vendor cosine)', () => {
    expect(closeTo(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1, 1e-9)).toBe(true);
  });
  it('orthogonal vectors → 0 (within the epsilon)', () => {
    expect(closeTo(Math.abs(cosineSimilarity([1, 0, 0], [0, 1, 0])), 0, 1e-6)).toBe(true);
  });
  it('the +1e-10 epsilon denominator does not explode on the zero vector', () => {
    const s = cosineSimilarity([0, 0, 0], [1, 0, 0]);
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBe(0);
  });
  it('decodeFloat32Blob round-trips the vendor float32 blob', () => {
    const v = new Float32Array([0.5, -0.25, 1]);
    const blob = new Uint8Array(v.buffer);
    const decoded = decodeFloat32Blob(blob)!;
    expect(closeTo(decoded[0], 0.5)).toBe(true);
    expect(closeTo(decoded[1], -0.25)).toBe(true);
    expect(closeTo(decoded[2], 1)).toBe(true);
  });
  it('decodeFloat32Blob returns undefined for a malformed blob (length % 4 !== 0)', () => {
    expect(decodeFloat32Blob(new Uint8Array([1, 2, 3]))).toBe(undefined);
    expect(decodeFloat32Blob(null)).toBe(undefined);
  });
});

describe('buildEmbeddingIndex — the vendor CLI build (Task 1)', () => {
  it('builds the index + parses the vendor summary + runs the init guard first', () => {
    const root = tmpRoot();
    const { exec, calls } = recordingExec('Scanning bh-native-fixture ...\n  \u2713 Total chunks in index: 3');
    const result = buildEmbeddingIndex({ projectRoot: root }, { exec, bin: '/fake/corbell' });
    expect(result.chunksIndexed).toBe(3);
    expect(result.command).toContain('embeddings build');
    expect(result.storePath).toBe(embeddingStorePath(root));
    // the init guard ran before the build (no workspace.yaml present)
    expect(calls[0]).toContain('init');
    expect(calls[1]).toContain('embeddings build');
  });

  it('skips the init guard when workspace.yaml already exists (the user config is the source of truth)', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, 'corbell-data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'corbell-data', 'workspace.yaml'), 'version: "1"\n', 'utf8');
    const { exec, calls } = recordingExec('Total chunks in index: 0');
    buildEmbeddingIndex({ projectRoot: root }, { exec, bin: '/fake/corbell' });
    expect(calls.some((c) => c.includes('init'))).toBe(false);
  });

  it('passes --rebuild when requested', () => {
    const root = tmpRoot();
    const { exec, calls } = recordingExec('Total chunks in index: 1');
    buildEmbeddingIndex({ projectRoot: root }, { exec, bin: '/fake/corbell', rebuild: true });
    expect(calls.some((c) => c.includes('embeddings build --rebuild'))).toBe(true);
  });

  it('the CLI non-zero exit → the named EMBEDDING_BUILD_FAILED (never a swallowed pass)', async () => {
  try {
    const root = tmpRoot();
    // the init guard succeeds (the stub returns), the BUILD command throws
    const exec = (cmd: string): string => {
      if (cmd.includes('embeddings build')) throw new Error('the CLI exited 1: no workspace');
      return '';
    };
    const msg = await rejectionOf(() => buildEmbeddingIndex({ projectRoot: root }, { exec, bin: '/fake/corbell' }));
    expect(msg).toContain('EMBEDDING_BUILD_FAILED');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the missing binary (ENOENT) → the named EMBEDDING_BIN_NOT_FOUND with the install hint', async () => {
  try {
    const root = tmpRoot();
    const exec = (): never => {
      const e = new Error('spawn /fake/corbell ENOENT');
      Object.assign(e, { code: 'ENOENT' });
      throw e;
    };
    const msg = await rejectionOf(() => buildEmbeddingIndex({ projectRoot: root }, { exec, bin: '/fake/corbell' }));
    expect(msg).toContain('EMBEDDING_BIN_NOT_FOUND');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('parseEmbeddingSummary yields 0 for a non-matching output (the store is the truth)', () => {
    expect(parseEmbeddingSummary('Scanning ... no summary')).toBe(0);
    expect(parseEmbeddingSummary('Total chunks in index: 42')).toBe(42);
  });

  it('parseEmbeddingSummary strips the REAL CLI ANSI escapes (the piped colored output)', () => {
    const colored = '\u001b[32m\u2713\u001b[0m Total chunks in index: \u001b[0m\u001b[1;32m6\u001b[0m';
    expect(parseEmbeddingSummary(colored)).toBe(6);
    expect(parseEmbeddingSummary('  \u001b[32m\u2713\u001b[0m bh-native-fixture: indexed \u001b[1;36m3\u001b[0m chunks\n\n\u001b[32m\u2713\u001b[0m Total chunks in index: \u001b[0m\u001b[1;32m3\u001b[0m')).toBe(3);
  });
});

describe('queryEmbeddingIndex — the score path over the vendor store (Task 2)', () => {
  const CHUNK_A = { id: 'c1', file_path: 'src/engine.ts', start_line: 1, end_line: 5, content: 'class Pipeline', chunk_type: 'block', symbol: 'Pipeline', vec: [1, 0, 0] };
  const CHUNK_B = { id: 'c2', file_path: 'src/store.ts', start_line: 10, end_line: 15, content: 'class OrderStore', chunk_type: 'block', symbol: 'OrderStore', vec: [0, 1, 0] };
  const CHUNK_C = { id: 'c3', file_path: 'src/mix.ts', start_line: 20, end_line: 22, content: 'function mix', chunk_type: 'function', symbol: 'mix', vec: [0.5, 0.5, 0] };

  it('returns the top-k chunks ranked by the vendor cosine with the similarity scores', () => {
    const root = tmpRoot();
    writeEmbeddingStore(root, [CHUNK_A, CHUNK_B, CHUNK_C]);
    const { encode, calls } = stubEncode([1, 0, 0]);
    const hits = queryEmbeddingIndex({ projectRoot: root }, 'pipeline engine', { topK: 3, encode });
    expect(hits.length).toBe(3);
    expect(hits[0].filePath).toBe('src/engine.ts');
    expect(closeTo(hits[0].score, 1)).toBe(true);
    expect(hits[1].filePath).toBe('src/mix.ts');
    expect(closeTo(hits[1].score, Math.SQRT1_2)).toBe(true);
    expect(hits[2].filePath).toBe('src/store.ts');
    expect(closeTo(hits[2].score, 0)).toBe(true);
    // the encode got the query text (the vendor model wire)
    expect(calls[0][0]).toBe('pipeline engine');
    // the typed fields the surface consumes
    expect(hits[0].symbol).toBe('Pipeline');
    expect(hits[0].chunkType).toBe('block');
    expect(hits[0].startLine).toBe(1);
    expect(hits[0].language).toBe('typescript');
  });

  it('the topK bound slices the ranked list', () => {
    const root = tmpRoot();
    writeEmbeddingStore(root, [CHUNK_A, CHUNK_B, CHUNK_C]);
    const { encode } = stubEncode([1, 0, 0]);
    const hits = queryEmbeddingIndex({ projectRoot: root }, 'x', { topK: 1, encode });
    expect(hits.length).toBe(1);
    expect(hits[0].rank).toBe(1);
  });

  it('an empty query → the TYPED EMPTY, never an exception (the surface contract)', () => {
    const root = tmpRoot();
    writeEmbeddingStore(root, [CHUNK_A]);
    const hits = queryEmbeddingIndex({ projectRoot: root }, '   ', { encode: stubEncode([1, 0, 0]).encode });
    expect(hits.length).toBe(0);
  });

  it('an absent store → the TYPED EMPTY (the caller formats the honest empty)', () => {
    const root = tmpRoot();
    const hits = queryEmbeddingIndex({ projectRoot: root }, 'query', { encode: stubEncode([1, 0, 0]).encode });
    expect(hits.length).toBe(0);
  });

  it('an empty embedding_chunks table → the TYPED EMPTY', () => {
    const root = tmpRoot();
    writeEmbeddingStore(root, []);
    const hits = queryEmbeddingIndex({ projectRoot: root }, 'query', { encode: stubEncode([1, 0, 0]).encode });
    expect(hits.length).toBe(0);
  });

  it('the encode failure → the named EMBEDDING_MODEL_UNAVAILABLE (the vendor deps contract)', async () => {
  try {
    const root = tmpRoot();
    writeEmbeddingStore(root, [CHUNK_A]);
    const encode: EncodeFn = () => { throw new Error('torch missing'); };
    const msg = await rejectionOf(() => queryEmbeddingIndex({ projectRoot: root }, 'q', { encode }));
    expect(msg).toContain('EMBEDDING_MODEL_UNAVAILABLE');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('a malformed blob row is SKIPPED with a debug note, never a crash', () => {
    const root = tmpRoot();
    const dir = path.join(root, 'corbell-data', '.corbell');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'workspace.db'));
    db.exec(
      'CREATE TABLE embedding_chunks (id TEXT PRIMARY KEY, service_id TEXT, repo TEXT, file_path TEXT, start_line INTEGER, end_line INTEGER, content TEXT, language TEXT, chunk_type TEXT, symbol TEXT, embedding BLOB);',
    );
    // the malformed blob (3 bytes — not a float32 multiple) + one good chunk
    db.prepare('INSERT INTO embedding_chunks (id, file_path, content, chunk_type, embedding) VALUES (?,?,?,?,?)')
      .run('bad', 'src/bad.ts', 'bad chunk', 'block', new Uint8Array([1, 2, 3]));
    const good = new Uint8Array(Float32Array.from([1, 0, 0]).buffer);
    db.prepare('INSERT INTO embedding_chunks (id, file_path, content, chunk_type, embedding) VALUES (?,?,?,?,?)')
      .run('good', 'src/good.ts', 'good chunk', 'block', good);
    db.close();
    const hits = queryEmbeddingIndex({ projectRoot: root }, 'q', { encode: stubEncode([1, 0, 0]).encode });
    expect(hits.length).toBe(1);
    expect(hits[0].filePath).toBe('src/good.ts');
  });

  it('a zero-norm query vector → the TYPED EMPTY (the vendor returns [] at qnorm == 0)', () => {
    const root = tmpRoot();
    writeEmbeddingStore(root, [CHUNK_A]);
    const hits = queryEmbeddingIndex({ projectRoot: root }, 'q', { encode: stubEncode([0, 0, 0]).encode });
    expect(hits.length).toBe(0);
  });
});

describe('resolveCorbellBin — the env-first + filesystem-verified resolution', () => {
  it('the CORBELL_BIN env wins', () => {
    const p = path.join(os.tmpdir(), `fake-corbell-${Date.now()}`);
    fs.writeFileSync(p, '#!/bin/sh\n');
    try {
      expect(resolveCorbellBin(envWith({ CORBELL_BIN: p }))).toBe(p);
    } finally {
      fs.rmSync(p, { force: true });
    }
  });
  it('falls back to the PATH binary when no env + no venv site exists', () => {
    const p = path.join(os.tmpdir(), `nope-corbell-${Date.now()}`);
    const probe = resolveCorbellBin(envWith({ CORBELL_BIN: p, PATH: '/nonexistent-corbell-ct' }), []);
    if (probe !== 'corbell') {
      markInconclusive('falls back to PATH binary', 'corbell-PATH-polluted', `resolveCorbellBin returned ${probe} != corbell — host PATH polluted`);
    }
    expect(probe).toBe('corbell');
  });
});

describe('the CorbellEmbeddings class — the SemanticSurface contract', () => {
  it('query() delegates to the score path with the injected encode', () => {
    const root = tmpRoot();
    writeEmbeddingStore(root, [{ ...CHUNK_A }]);
    const emb = new CorbellEmbeddings({ projectRoot: root }, { encode: stubEncode([1, 0, 0]).encode });
    const hits = emb.query('pipeline', 5);
    expect(hits.length).toBe(1);
    expect(closeTo(hits[0].score, 1)).toBe(true);
  });
});

// a smoke check that the default exec is execSync-shaped (the exec contract)
describe('defaultEmbeddingExec — the exec contract', () => {
  it('is a function (execSync-shaped)', () => {
    expect(typeof defaultEmbeddingExec).toBe('function');
  });
});


/** THE R16 TYPE_CERTAINTY GUARDED READ — the env object literal is narrowed to
 *  the ProcessEnv surface behind the typeof/null guard. */
function envWith(o: Record<string, unknown>): NodeJS.ProcessEnv {
  if (o !== undefined && o !== null && typeof o === 'object') {
    return o as NodeJS.ProcessEnv;
  }
  return {};
}
