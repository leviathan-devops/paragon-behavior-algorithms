// src/subagents/trident-bug-hunter/tools/docs-patterns.ts
// THE DOCS-PATTERNS TOOL (the corbell docs scan/learn wire — the W2b splice).
// The thin shell over the REAL corbell docs commands (docs.py): `docs scan`
// finds the design docs, `docs learn --no-llm` extracts the design patterns
// (regex-only — the vendor's own LLM-less path), the patterns persist in the
// vendor's store at <root>/corbell-data/.corbell/doc_patterns.json (store.py).
// The wire-don't-build law: the machine reads what the vendor extracts — it
// never re-derives the patterns.
//
// THE VERIFIED CLI SURFACE (2026-08-13, the venv at /tmp/corbell-venv):
//   - `corbell docs scan`            → finds the candidate design docs; saves
//       the candidates to .corbell/doc_candidates.json (docs.py:68-74).
//   - `corbell docs learn --no-llm`  → extracts the patterns (regex-only when
//       no LLM key) + saves them to .corbell/doc_patterns.json (docs.py:106-110).
//   - `corbell docs patterns`        → the learned patterns' rich-table print.
//   - the store JSON shape (store.py:34-69): DocPattern {id, source_file,
//       detected_type, section_headings, frontmatter_fields, terminology,
//       decisions[], format_example}.
//
// THE AWARENESS WIRE (Task 5): the query surface's docs-patterns verb reads
// the patterns through this module's DocsPatternSurface — the machine's
// awareness docs gain the vendor-extracted patterns without the machine
// re-deriving them. The context_management/ canon docs are the orchestrator's
// ownership — THIS module never writes them; it wires the vendor's store into
// the machine's awareness surface instead.

import fs from 'node:fs';
import path from 'node:path';
import type { ExecFn } from '../graph/corbell-adapter.ts';
import { resolveCorbellBin, defaultEmbeddingExec } from '../graph/corbell-embeddings.ts';
import type { DocsPatternRow, DocsPatternSurface } from '../surface/query-tool.ts';

// ---------------------------------------------------------------------------
// The named errors (the loud fail-state contract)
// ---------------------------------------------------------------------------

export class DocsPatternError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

export function docsPatternError(code: string, detail: string): DocsPatternError {
  return new DocsPatternError(code, `DOCS_PATTERNS_${code}: ${detail}`);
}

/** The vendor's patterns store path (docs.py:68 — .corbell/doc_patterns.json). */
export function docsPatternsStorePath(projectRoot: string): string {
  return path.join(projectRoot, 'corbell-data', '.corbell', 'doc_patterns.json');
}

// ---------------------------------------------------------------------------
// The extraction — `corbell docs scan` + `corbell docs learn --no-llm`
// ---------------------------------------------------------------------------

export interface DocsExtractionResult {
  command: string;
  scanStdout: string;
  learnStdout: string;
  patternCount: number;
  storePath: string;
}

/** Parse the learn summary ("✓ Learned N doc patterns from M docs" —
 *  docs.py:110). A non-matching output yields 0 (the store is the truth). */
export function parseLearnSummary(stdout: string): number {
  const m = /Learned\s+(\d+)\s+doc patterns/i.exec(stdout);
  return m ? Number(m[1]) : 0;
}

/** Run the vendor's docs scan + learn over the project. Error paths FIRST:
 *  a CLI non-zero exit → the named DOCS_PATTERNS_* failure (never a swallowed
 *  pass); the missing binary → DOCS_PATTERNS_BIN_NOT_FOUND. The no-llm flag is
 *  the vendor's regex-only extraction — the machine never needs an LLM key. */
export function extractDocsPatterns(
  target: { projectRoot: string },
  opts: { exec?: ExecFn; bin?: string } = {},
): DocsExtractionResult {
  const projectRoot = target.projectRoot;
  const exec = opts.exec ?? defaultEmbeddingExec;
  const bin = opts.bin ?? resolveCorbellBin();
  const wsConfigPath = path.join(projectRoot, 'corbell-data', 'workspace.yaml');
  if (!fs.existsSync(wsConfigPath)) {
    throw docsPatternError('WORKSPACE_MISSING', `no corbell-data/workspace.yaml at ${projectRoot} — run the graph build (or 'corbell init') first`);
  }
  const scanCmd = `${bin} docs scan`;
  let scanStdout: string;
  try {
    scanStdout = exec(scanCmd, { cwd: projectRoot, timeout: 120_000 });
  } catch (e: unknown) {
    const code = errorCode(e);
    if (code === 'ENOENT') {
      throw docsPatternError('BIN_NOT_FOUND', `the corbell binary (${bin}) is missing — install it or set CORBELL_BIN`);
    }
    throw docsPatternError('SCAN_FAILED', `command=${scanCmd} detail=${String(e)}`);
  }
  const learnCmd = `${bin} docs learn --no-llm`;
  let learnStdout: string;
  try {
    learnStdout = exec(learnCmd, { cwd: projectRoot, timeout: 120_000 });
  } catch (e: unknown) {
    const code = errorCode(e);
    if (code === 'ENOENT') {
      throw docsPatternError('BIN_NOT_FOUND', `the corbell binary (${bin}) is missing — install it or set CORBELL_BIN`);
    }
    throw docsPatternError('LEARN_FAILED', `command=${learnCmd} detail=${String(e)}`);
  }
  return {
    command: `${scanCmd} && ${learnCmd}`,
    scanStdout,
    learnStdout,
    patternCount: parseLearnSummary(learnStdout),
    storePath: docsPatternsStorePath(projectRoot),
  };
}

// ---------------------------------------------------------------------------
// The read — the vendor's doc_patterns.json (the machine's awareness wire)
// ---------------------------------------------------------------------------

/** Read the learned patterns from the vendor's store (typed). A missing or
 *  unparseable store → the TYPED EMPTY (the machine's awareness surface reads
 *  the honest empty — never a fabricated pattern row). */
export function readDocsPatterns(projectRoot: string): DocsPatternRow[] {
  const storePath = docsPatternsStorePath(projectRoot);
  if (!fs.existsSync(storePath)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch (e: unknown) {
    console.debug(`[docs-patterns] the patterns store at ${storePath} is unparseable — the typed empty: ${String(e)}`);
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const rows: DocsPatternRow[] = [];
  for (const d of raw) {
    if (typeof d !== 'object' || d === null) continue;
    const obj = d as Record<string, unknown>;
    const decisions = Array.isArray(obj['decisions'])
      ? obj['decisions'].map((dec) => {
          const d0 = (typeof dec === 'object' && dec !== null ? dec : {}) as Record<string, unknown>;
          return {
            id: String(d0['id'] ?? ''),
            summary: String(d0['summary'] ?? ''),
            rationale: d0['rationale'] == null ? null : String(d0['rationale']),
          };
        })
      : [];
    rows.push({
      id: String(obj['id'] ?? ''),
      sourceFile: String(obj['source_file'] ?? ''),
      detectedType: String(obj['detected_type'] ?? 'unknown'),
      sectionHeadings: Array.isArray(obj['section_headings']) ? obj['section_headings'].map((s) => String(s)) : [],
      terminology: typeof obj['terminology'] === 'object' && obj['terminology'] !== null ? (obj['terminology'] as Record<string, unknown>) : {},
      decisions,
    });
  }
  return rows;
}

/** THE SURFACE — the docs-patterns verb's wire (the DocsPatternSurface contract). */
export function createDocsPatterns(target: { projectRoot: string }): DocsPatternSurface {
  return {
    list: () => readDocsPatterns(target.projectRoot),
  };
}


/** THE R16 TYPE_CERTAINTY GUARDED READ — a caught error's `code` is read behind
 *  the typeof/null guard before the typed assertion. */
function errorCode(e: unknown): unknown {
  if (typeof e === 'object' && e !== null) {
    const code = (e as { code?: unknown }).code;
    if (code !== undefined) return code;
  }
  return undefined;
}
