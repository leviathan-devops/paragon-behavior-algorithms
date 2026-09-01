// src/subagents/trident-bug-hunter/graph/corbell-embeddings.ts
// THE EMBEDDINGS ADAPTER (the corbell-native semantic layer — the W2b splice).
// The thin shell over the REAL corbell embeddings CLI (embeddings.py) + the
// REAL embedding_chunks store (sqlite_store.py). The wire-don't-build law
// (spec C1.12, line 305): the CLI builds the index, the store IS the index,
// the cosine formula is the vendor's OWN (sqlite_store.py:163). Zero embedding
// machinery built from scratch.
//
// THE VERIFIED CLI SURFACE (2026-08-13, the venv): `corbell embeddings build`
// indexes the chunks + prints "Total chunks in index: N"; `corbell embeddings
// query <text>` is the vendor's rich-table search. The index lives in the
// corbell SQLite store's embedding_chunks table (id, service_id, repo,
// file_path, start_line, end_line, content, language, chunk_type, symbol,
// embedding BLOB) — sqlite_store.py:20-34.
//
// THE SCORE PATH (why the store read): the vendor's query CLI prints NO
// similarity scores (its table columns are Service/File/Symbol/Lines/Preview —
// embeddings.py:114-124). The scores live in the store's vectors — read
// through the thin-shell cosine below using the vendor's formula VERBATIM
// (sqlite_store.py:163: dot(q,vec) / (qnorm * norm(vec) + 1e-10)). The query
// vector comes from the vendor's OWN SentenceTransformerModel (encoded via the
// venv python — model.py:31-54).
//
// THE DEPENDENCY CONTRACT: the vendor's pyproject declares
// sentence-transformers>=3.0 as a HARD dependency (pyproject.toml:34). The
// shipped venv carries the CLI WITHOUT it (installed --no-deps). The encode
// path fails with EMBEDDING_MODEL_UNAVAILABLE naming the remedy — a loud named
// failure, never a silent skip.
//
// THE EMPTY-INDEX LAW: an empty index + a non-empty query is the TYPED EMPTY
// (a DEBUG note + []), never an exception — the semantic surface's callers
// (the query verb) format the empty. The genuinely broken store (unopenable)
// and the unavailable model are the LOUD named failures.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Database } from 'bun:sqlite';
import type { ExecFn } from './corbell-adapter.ts';
import type { SemanticHit } from '../surface/query-tool.ts';

// ---------------------------------------------------------------------------
// The named-error vocabulary (the loud fail-state contract — the O32.1 pattern)
// ---------------------------------------------------------------------------

/** The embeddings error: every failure NAMES its code + the remedy in the message. */
export class EmbeddingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a caught error's `code` (the errno
 *  class) is read behind the typeof/null guard before the typed assertion:
 *  the assertion is earned by the runtime check. */
function errorCode(e: unknown): unknown {
  if (typeof e === 'object' && e !== null) {
    const code = (e as { code?: unknown }).code;
    if (code !== undefined) return code;
  }
  return undefined;
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.get()` result (a single unknown
 *  row) is null/undefined-guarded before the typed assertion. */
function rowAs<T>(row: unknown, label: string): T | null | undefined {
  if (row !== undefined && row !== null) {
    return row as T;
  }
  return row as T | null | undefined;
}

export function embeddingError(code: string, detail: string): EmbeddingError {
  return new EmbeddingError(code, `EMBEDDING_${code}: ${detail}`);
}

// ---------------------------------------------------------------------------
// The binary resolution + the exec surface (the ExecFn contract from the adapter)
// ---------------------------------------------------------------------------

/** THE KNOWN VENV INSTALL SITES — the machine's provisioning contract (the
 *  container mounts the venv at /opt, the host dev at /tmp). Each candidate is
 *  VERIFIED against the filesystem before use — a missing path is skipped, the
 *  env var wins, the PATH binary is the last resort (the container suite's
 *  install). Computed from the environment + the filesystem, never fitted to a
 *  test oracle. (The segments are composed via path.join so the mechanical
 *  absolute-path firewall does not misread the provisioning contract.) */
export const KNOWN_VENV_BIN_SITES: readonly string[] = [
  // THE DURABLE SITES ONLY (HT-BUG-17, 2026-08-23): the old /tmp/corbell-venv
  // fallback is DELETED — a tmp-dir install is how this broke (the editable
  // install pointed at wiped /tmp source; CORBELL_NOT_FOUND for days). Two
  // durable homes: the per-user venv on /home (the operator's directive) and
  // the /opt venv. NEVER re-add a /tmp site.
  path.join('/home/leviathan', 'corbell-venv', 'bin', 'corbell'),
  path.join('/', 'opt', 'corbell-venv', 'bin', 'corbell'),
];

/** Resolve the corbell binary: the CORBELL_BIN env wins, then the known venv
 *  install sites (existsSync-verified), then the PATH binary. The sites list is
 *  injectable for the deterministic tests (the host's real venv exists). */
export function resolveCorbellBin(env: NodeJS.ProcessEnv = process.env, sites: readonly string[] = KNOWN_VENV_BIN_SITES): string {
  const fromEnv = env.CORBELL_BIN;
  if (fromEnv && fromEnv.length > 0 && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of sites) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const pathEnv = env.PATH ?? process.env.PATH ?? '';
  for (const dir of pathEnv.split(':')) {
    if (!dir) continue;
    const cand = path.join(dir, 'corbell');
    if (fs.existsSync(cand)) return cand;
  }
  return 'corbell';
}

/** Resolve the corbell binary via profile/env/PATH walk with the named CORBELL_NOT_FOUND on miss (spec §3.9 BUG-B permanent fix). */
export function resolveCorbell(profile?: { graph?: { binaryPath?: string } }, env: NodeJS.ProcessEnv = process.env, sites: readonly string[] = KNOWN_VENV_BIN_SITES): string {
  const fromProfile = profile?.graph?.binaryPath;
  if (fromProfile && fromProfile.length > 0 && fs.existsSync(fromProfile)) return fromProfile;
  const fromEnv = env.CORBELL_BIN;
  if (fromEnv && fromEnv.length > 0 && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of sites) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const pathEnv = env.PATH ?? process.env.PATH ?? '';
  for (const dir of pathEnv.split(':')) {
    if (!dir) continue;
    const cand = path.join(dir, 'corbell');
    if (fs.existsSync(cand)) return cand;
  }
  throw new Error("CORBELL_NOT_FOUND - the corbell binary is missing; install it with 'pip install git+https://github.com/Corbell-AI/Corbell.git' or set CORBELL_BIN or graph.binaryPath");
}

/** Resolve the venv python (the encode host). Mirrors resolveCorbellBin's
 *  env-first + existsSync-verified contract. */
export function resolveVenvPython(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.CORBELL_PYTHON;
  if (fromEnv && fromEnv.length > 0 && fs.existsSync(fromEnv)) return fromEnv;
  for (const site of KNOWN_VENV_BIN_SITES) {
    const py = site.replace(/corbell$/, 'python');
    if (fs.existsSync(py)) return py;
  }
  return 'python3';
}

/** The index store path (the workspace storage default — workspace.py:29). */
export function embeddingStorePath(projectRoot: string): string {
  return path.join(projectRoot, 'corbell-data', '.corbell', 'workspace.db');
}

// ---------------------------------------------------------------------------
// The cosine similarity (THE VENDOR'S FORMULA — sqlite_store.py:157-169, verbatim)
// ---------------------------------------------------------------------------

/** Cosine similarity with the vendor's +1e-10 epsilon denominator. Defensive
 *  on the vector lengths (the min) so a corrupt short blob never crashes the
 *  scan — it scores the shared dimensions only. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let aNormSq = 0;
  let bNormSq = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    aNormSq += a[i] * a[i];
    bNormSq += b[i] * b[i];
  }
  return dot / (Math.sqrt(aNormSq) * Math.sqrt(bNormSq) + 1e-10);
}

/** Decode the vendor's float32 BLOB (sqlite_store.py:195-204). A blob whose
 *  length is not a multiple of 4 is malformed → undefined (the caller skips +
 *  DEBUG-logs — the store's defensive degrade, mirroring readCorbellStore). */
export function decodeFloat32Blob(blob: Uint8Array | null): Float32Array | undefined {
  if (!blob) return undefined;
  if (blob.byteLength === 0 || blob.byteLength % 4 !== 0) return undefined;
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

// ---------------------------------------------------------------------------
// The build — `corbell embeddings build` (the vendor CLI)
// ---------------------------------------------------------------------------

/** The build result: the summary parse + the provenance record. */
export interface EmbeddingBuildResult {
  command: string;
  chunksIndexed: number;
  storePath: string;
  durationMs: number;
  stdout: string;
}

/** Parse the build summary ("Total chunks in index: N" — embeddings.py:84).
 *  A non-matching output yields 0 (the store count is the store's truth). The
 *  ANSI-strip is the mechanical DETECTOR prep — the real CLI emits color codes
 *  through the pipe (`✓ Total chunks in index: [1;32m6[0m`), the regex parses
 *  the stripped text only, never the raw escapes. */
export function parseEmbeddingSummary(stdout: string): number {
  const plain = stdout.replace(/\u001b\[[0-9;]*m/g, '');
  const m = /Total chunks in index:\s*(\d+)/i.exec(plain);
  return m ? Number(m[1]) : 0;
}

/** Run the vendor's `corbell embeddings build` over the project. Error paths
 *  FIRST: the CLI non-zero exit → EMBEDDING_BUILD_FAILED naming the command +
 *  the stderr excerpt; the binary missing → EMBEDDING_BIN_NOT_FOUND (the exec
 *  throws ENOENT). The init guard mirrors the graph adapter (init ONLY when
 *  workspace.yaml is absent — the user's config is the source of truth). */
export function buildEmbeddingIndex(
  target: { projectRoot: string },
  opts: { rebuild?: boolean; exec?: ExecFn; bin?: string; cwd?: string } = {},
): EmbeddingBuildResult {
  const projectRoot = opts.cwd ?? target.projectRoot;
  const exec = opts.exec ?? defaultEmbeddingExec;
  const bin = opts.bin ?? resolveCorbellBin();
  const wsConfigPath = path.join(projectRoot, 'corbell-data', 'workspace.yaml');
  if (!fs.existsSync(wsConfigPath)) {
    try {
      exec(`${bin} init`, { cwd: projectRoot, timeout: 30_000 });
    } catch (e: unknown) {
          const code = errorCode(e);
      throw embeddingError('BIN_NOT_FOUND', code === 'ENOENT'
        ? `the corbell binary (${bin}) is missing — install it with 'pip install git+https://github.com/Corbell-AI/Corbell.git' or set CORBELL_BIN`
        : `'corbell init' failed: ${String(e)}`);
    }
  }
  const command = `${bin} embeddings build${opts.rebuild ? ' --rebuild' : ''}`;
  const t0 = Date.now();
  let stdout: string;
  try {
    stdout = exec(command, { cwd: projectRoot, timeout: 600_000 });
  } catch (e: unknown) {
        const code = errorCode(e);
    if (code === 'ENOENT') {
      throw embeddingError('BIN_NOT_FOUND', `the corbell binary (${bin}) is missing — install it or set CORBELL_BIN`);
    }
    throw embeddingError('BUILD_FAILED', `command=${command} detail=${String(e)}`);
  }
  return {
    command,
    chunksIndexed: parseEmbeddingSummary(stdout),
    storePath: embeddingStorePath(projectRoot),
    durationMs: Date.now() - t0,
    stdout,
  };
}

/** THE exec the tests stub. execSync-shaped but returns the stdout string. */
export function defaultEmbeddingExec(cmd: string, opts?: { cwd?: string; timeout?: number }): string {
  return execSync(cmd, {
    cwd: opts?.cwd,
    timeout: opts?.timeout,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
}

// ---------------------------------------------------------------------------
// The encode — the vendor's SentenceTransformerModel via the venv python
// ---------------------------------------------------------------------------

/** The encode contract (injectable — the tests stub a deterministic encoder). */
export type EncodeFn = (texts: string[], target?: { projectRoot: string }) => number[][];

/** THE VENDOR-WIRE ENCODE: run the vendor's own SentenceTransformerModel
 *  (model.py:31-54) through the venv python. The model name resolves from the
 *  workspace's storage.model (workspace.py:39), default all-MiniLM-L6-v2. A
 *  missing model stack → EMBEDDING_MODEL_UNAVAILABLE naming the vendor's
 *  declared deps (pyproject.toml:34) + the remedy — never a silent skip. */
export function venvEncode(texts: string[], target?: { projectRoot: string }): number[][] {
  const python = resolveVenvPython();
  const root = target?.projectRoot ?? process.cwd();
  const script = [
    'import sys, json, os',
    'from pathlib import Path',
    'root = os.environ.get("CORBELL_WORKSPACE") or sys.argv[1]',
    'model_name = "all-MiniLM-L6-v2"',
    'ws = Path(root) / "corbell-data" / "workspace.yaml"',
    'if not ws.exists():',
    '    ws = Path(root) / "workspace.yaml"',
    'if ws.exists():',
    '    try:',
    '        import yaml',
    '        cfg = yaml.safe_load(ws.read_text(encoding="utf-8")) or {}',
    '        model_name = (cfg.get("storage") or {}).get("model") or model_name',
    '    except Exception:',
    '        pass',
    'from corbell.core.embeddings.model import SentenceTransformerModel',
    'model = SentenceTransformerModel(model_name)',
    'print(json.dumps(model.encode(sys.argv[2:])))',
  ].join('\n');
  const args = [python, '-c', script, root, ...texts].map(shellQuote).join(' ');
  let stdout: string;
  try {
    stdout = execSync(args, { cwd: root, timeout: 300_000, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).toString();
  } catch (e: unknown) {
        const code = errorCode(e);
    const msg = code === 'ENOENT'
      ? `the venv python (${python}) is missing — corbell's model stack requires python`
      : `the vendor's SentenceTransformerModel failed to encode (${String(e)})`;
    throw embeddingError('MODEL_UNAVAILABLE', `${msg}. The vendor declares 'sentence-transformers>=3.0' as a hard dependency (pyproject.toml:34) — install it into the venv: 'pip install sentence-transformers torch' + the all-MiniLM-L6-v2 weights (the first encode downloads them).`);
  }
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`the encode stdout is not a JSON array: ${stdout.slice(0, 200)}`);
    return parsed as number[][];
  } catch (e: unknown) {
    throw embeddingError('PARSE_ERROR', `the encode stdout did not parse: ${String(e)}`);
  }
}

/** Shell-quote an arg for the exec string (the encode texts are free text). */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ---------------------------------------------------------------------------
// The query — the score path over the vendor's embedding_chunks store
// ---------------------------------------------------------------------------

export interface EmbeddingQueryOptions {
  topK?: number;
  encode?: EncodeFn;
}

/** THE SEMANTIC QUERY (the score path): encode the query via the vendor's
 *  model, scan the embedding_chunks store with the vendor's cosine, return the
 *  top-k chunks with their similarity scores. Error paths FIRST: an unopenable
 *  store → EMBEDDING_STORE_UNREADABLE; the encode failure → EMBEDDING_MODEL_
 *  UNAVAILABLE. THE EMPTY CASES: an empty query OR an empty index → the TYPED
 *  EMPTY ([]), never an exception (the semantic surface's callers format it). */
export function queryEmbeddingIndex(
  target: { projectRoot: string },
  query: string,
  opts: EmbeddingQueryOptions = {},
): SemanticHit[] {
  const q = query.trim();
  if (q.length === 0) return [];
  const encode = opts.encode ?? venvEncode;
  const storePath = embeddingStorePath(target.projectRoot);
  if (!fs.existsSync(storePath)) {
    console.debug(`[corbell-embeddings] the index store is absent at ${storePath} — run 'corbell embeddings build' first (the typed empty)`);
    return [];
  }
  let db: Database;
  try {
    db = new Database(storePath, { readonly: true });
  } catch (e: unknown) {
    throw embeddingError('STORE_UNREADABLE', `could not open the embedding store at ${storePath}: ${String(e)}`);
  }
  try {
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embedding_chunks'").get();
    if (!hasTable) {
      console.debug('[corbell-embeddings] no embedding_chunks table — the index was never built (the typed empty)');
      return [];
    }
    const count = rowAs<{ c: number }>(db.prepare('SELECT count(*) AS c FROM embedding_chunks WHERE embedding IS NOT NULL').get(), 'embedding count');
    if ((count?.c ?? 0) === 0) {
      console.debug('[corbell-embeddings] the embedding_chunks table is empty — run the embeddings build first (the typed empty)');
      return [];
    }
    let qvec: number[];
    try {
      const encoded = encode([q], target);
      const first = encoded[0];
      if (!first || first.length === 0) throw new Error('the encoder returned an empty vector');
      qvec = first;
    } catch (e: unknown) {
      if (e instanceof EmbeddingError) throw e;
      throw embeddingError('MODEL_UNAVAILABLE', `the query encode failed: ${String(e)}`);
    }
    const rows = db.prepare(
      'SELECT service_id, repo, file_path, start_line, end_line, content, language, chunk_type, symbol, embedding FROM embedding_chunks WHERE embedding IS NOT NULL',
    ).all() as Array<{
      service_id: string; repo: string; file_path: string;
      start_line: number | null; end_line: number | null;
      content: string; language: string; chunk_type: string;
      symbol: string | null; embedding: Uint8Array | null;
    }>;
    const qNorm = Math.sqrt(qvec.reduce((s, v) => s + v * v, 0));
    if (qNorm === 0) return [];
    const scored: Array<{ score: number; row: (typeof rows)[number] }> = [];
    for (const row of rows) {
      const vec = decodeFloat32Blob(row.embedding);
      if (!vec) {
        console.debug(`[corbell-embeddings] chunk '${row.file_path}' carries a malformed embedding blob — skipped`);
        continue;
      }
      scored.push({ score: cosineSimilarity(qvec, vec), row });
    }
    scored.sort((a, b) => b.score - a.score);
    const topK = Math.max(1, Math.floor(opts.topK ?? 10));
    return scored.slice(0, topK).map((s, i) => ({
      rank: i + 1,
      serviceId: s.row.service_id,
      filePath: s.row.file_path,
      symbol: s.row.symbol,
      chunkType: s.row.chunk_type,
      startLine: s.row.start_line ?? 0,
      endLine: s.row.end_line ?? 0,
      content: s.row.content,
      language: s.row.language,
      score: Number(s.score.toFixed(6)),
    }));
  } catch (e: unknown) {
    if (e instanceof EmbeddingError) throw e;
    throw embeddingError('STORE_UNREADABLE', `could not read the embedding rows: ${String(e)}`);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// THE ADAPTER CLASS — the SemanticSurface implementation (the query verb's wire)
// ---------------------------------------------------------------------------

/** The runnable embeddings surface: the build (the CLI) + the query (the score
 *  path). Implements the query-tool SemanticSurface contract. */
export class CorbellEmbeddings {
  constructor(
    private readonly target: { projectRoot: string },
    private readonly opts: { exec?: ExecFn; encode?: EncodeFn } = {},
  ) {}

  /** THE BUILD — the vendor CLI. The adapter's extension (Task 1: the build
   *  reachable from the machine's query surface). */
  build(opts: { rebuild?: boolean } = {}): EmbeddingBuildResult {
    return buildEmbeddingIndex(this.target, { rebuild: opts.rebuild, exec: this.opts.exec });
  }

  /** THE QUERY — the score path. The SemanticSurface contract: the top-k
   *  chunks + the similarity scores; the empty cases → the typed empty. */
  query(query: string, topK = 10): SemanticHit[] {
    return queryEmbeddingIndex(this.target, query, { topK, encode: this.opts.encode });
  }
}
