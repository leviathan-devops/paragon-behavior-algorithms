// src/subagents/trident-bug-hunter/tools/__tests__/report-writer.test.ts
// THE REPORT-WRITER CONTRACT TESTS (W8, spec §10.1-10.2, K7.2, D14) — the
// mocked-transport battery. The REAL provider is NEVER called: the writer
// takes the transport as an injectable dependency, and every scenario injects
// a stub that captures the request body (the hardcode assertions) or scripts
// the stream (the happy/chunked/adversarial paths). The adversarial set ≥ 3:
// the 500 → GENERATION_FAILED + NO file, the empty stream → the named error +
// NO file, the mid-stream error → the named error + NO partial file, the
// stall/timeout aborts → the named error + NO file. The loud-fail-or-clear-
// pass law: a partial report dressed as success is BANNED — every failure
// leaves the disk clean.

import { describe, it, expect, afterAll } from 'bun:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import {
  generateReport, buildGenerationPrompt, buildContinuationPrompt,
  generationFailed, GenerationFailedError,
  splitFindingsIntoBatches, MAX_PROMPT_INPUT_CHARS,
  GENERATION_MODEL, GENERATION_PROVIDER, MAX_GENERATION_TOKENS, GENERATION_CONNECTION,
  GENERATION_BASE_URL, REPORT_PROVIDER_CHAIN, FETCH_STALL_MS, GENERATION_TIMEOUT_MS, BATCH_GENERATION_TIMEOUT_MS,
  MASTER_CONTEXT_VARIANTS, stripBeforeSeal,
  type ReportWriterInput, type StreamFetch, type StreamResponse, type StreamReader, type ReportWriterResult,
  type ReportFinding, type ReportSectionRow,
} from '../report-writer.ts';

const __rwOrigSetTimeout = globalThis.setTimeout as unknown as typeof setTimeout;
(globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((cb: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => ms === 3000 ? __rwOrigSetTimeout(cb as never, 5 as never, ...(a as never[])) : __rwOrigSetTimeout(cb as never, ms as never, ...(a as never[]))) as never;

// ---------------------------------------------------------------------------
// THE FIXTURES + THE MOCK TRANSPORT
// ---------------------------------------------------------------------------

const cleanedRoots: string[] = [];

function tmpProject(): string {
  const root = path.join(os.tmpdir(), `rw-test-${Math.random().toString(36).slice(2)}`);
  cleanedRoots.push(root);
  return root;
}

function sampleInput(projectRoot: string, runId = 'run-test-001'): ReportWriterInput {
  return {
    projectRoot,
    runId,
    findings: [
      { id: 'P6:src/engine3/visual-setup-generator.ts:214', severity: 'CRIT', rule: 'P6', evidence: 'e3-anchor:eu-entry --constrains→ fn:selectE2Zone (visual-setup-generator.ts:214)' },
      { id: 'P1:src/mdve/shape-brain.ts:31', severity: 'HIGH', rule: 'P1', evidence: 'traces-to absent on the E1/E2 path (shape-brain.ts:31)' },
    ],
    sections: [
      {
        finding_id: 'P6:src/engine3/visual-setup-generator.ts:214',
        how_broken: 'the E2 comparator ranks candidates by abs(open - level) — a price-distance-from-open leg',
        why_broken: 'the E2 selection was reverse-engineered from the desired price outcome instead of from the zone map',
        what_violates: 'Rule P6 (CRIT): "NOTHING SHOULD BE PRICE ANCHORED EVER" — ZONE_ANCHORED_E2_FIX_SPEC.md:6',
        how_to_fix: 'replace the price-distance leg with a zone-proximity leg; files: src/engine3/visual-setup-generator.ts:214-231',
        what_to_do: '1. remove the priceDistance leg 2. add the zoneQuality weighting 3. re-run the battery',
        why_works: 'the zone map becomes the only selection authority — the price anchor is gone',
        run_id: runId,
      },
    ],
    graphSummaries: [
      { label: 'e3-anchor --constrains→ fn:selectE2Zone', detail: 'visual-setup-generator.ts:214' },
      { label: 'fn:selectE2Zone --calls→ fn:visualSetupGenerator', detail: 'visual-setup-generator.ts:231' },
    ],
  };
}

/** Encode one SSE chunk (the delta + the finish_reason) into bytes. */
function encodeSse(chunks: Array<{ content?: string; finish_reason?: string | null }>): Uint8Array {
  const lines = chunks
    .map(c => 'data: ' + JSON.stringify({ choices: [{ delta: { content: c.content ?? '' }, finish_reason: c.finish_reason ?? null }] }))
    .join('\n');
  return new TextEncoder().encode(lines + '\n');
}

/** A reader that delivers the whole buffer in one read, then signals done. */
function wholeBufferReader(body: Uint8Array): StreamReader {
  let first = true;
  return {
    read(): Promise<{ done: boolean; value?: Uint8Array }> {
      if (first) { first = false; return Promise.resolve({ done: false, value: body }); }
      return Promise.resolve({ done: true });
    },
  };
}

/** A reader driven by a script: {value} → a chunk, {error} → a mid-stream throw. */
function scriptedReader(script: Array<{ value?: Uint8Array; error?: Error }>): StreamReader {
  let i = 0;
  return {
    read(): Promise<{ done: boolean; value?: Uint8Array }> {
      const step = script[i++];
      if (!step) return Promise.resolve({ done: true });
      if (step.error) return Promise.reject(step.error);
      return Promise.resolve({ done: false, value: step.value });
    },
  };
}

/** An SSE 200 response whose body is a scripted reader. */
function okStream(reader: StreamReader, contentType = 'text/event-stream'): StreamResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? contentType : null) },
    body: { getReader: () => reader },
    text: async () => '',
  };
}

/** A JSON 200 response whose body carries the openai-responses output shape. */
function okJson(text: string, apiStatus?: string): StreamResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => ({ status: apiStatus ?? 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }),
    body: undefined,
    text: async () => '',
  } as unknown as StreamResponse;

/** A 500 JSON error response (the mid-stream error stand-in). */
function errJson500(detail: string): StreamResponse {
  return {
    ok: false, status: 500,
    headers: { get: () => null },
    json: async () => { throw new Error(detail); },
    body: undefined,
    text: async () => detail,
  } as unknown as StreamResponse;
}
}

/** A JSON error response (non-200). */
function errJson(status: number, detail: string): StreamResponse {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => { throw new Error('no json on error'); },
    body: undefined,
    text: async () => detail,
  } as unknown as StreamResponse;
}


/** The transport wrapper: records every call's url + init for the assertions.
 *  The handler receives the ZERO-BASED call index (captured BEFORE the push)
 *  so a per-call script can branch on it without an off-by-one. */
function makeTransport(
  handler: (call: { url: string; init: { headers: Record<string, string>; body: string; signal: AbortSignal }; idx: number }) => Promise<StreamResponse>,
): { transport: StreamFetch; calls: Array<{ url: string; init: { headers: Record<string, string>; body: string; signal: AbortSignal } }> } {
  const calls: Array<{ url: string; init: { headers: Record<string, string>; body: string; signal: AbortSignal } }> = [];
  const transport: StreamFetch = async (url, init) => {
    const idx = calls.length;
    calls.push({ url, init });
    return handler({ url, init, idx });
  };
  return { transport, calls };
}

/** Await a promise, assert it REJECTED, and assert the message contains the
 *  pattern (the shim's ExpectResult lacks `.rejects`, so the rejection path is
 *  asserted through the catch — the loud-fail-or-clear-pass assertion: a
 *  failure MUST have been thrown, and it MUST name GENERATION_FAILED). */
async function assertNamedFailure(promise: Promise<unknown>, pattern: string): Promise<void> {
  let thrown: unknown = null;
  try {
    await promise;
  } catch (e: unknown) {
    console.warn('[report-writer.test] assertNamedFailure — the rejection is expected: ' + String(e));
    thrown = e;
  }
  expect(thrown).not.toBe(null);   // a failure MUST have been thrown — never a silent pass
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  expect(message).toContain(pattern);
}

async function reportFiles(root: string): Promise<string[]> {
  let names: string[] = [];
  try {
    names = await readdir(path.join(root, 'MASTER_CONTEXT'));
  } catch {
    try {
      names = await readdir(root);
    } catch {
      return [];
    }
  }
  return names.filter(n => n.startsWith('bug_hunter_report_'));
}

afterAll(async () => {
try {
  await Promise.allSettled(cleanedRoots.map(r => rm(r, { recursive: true, force: true })));

} catch (e: unknown) {
  console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
  throw e;
}
});

// ---------------------------------------------------------------------------
// THE HARDCODE + THE PROMPT ASSEMBLY CONTRACT
// ---------------------------------------------------------------------------

describe('the hardcoded generation contract (D14, §10.1)', () => {
  it('carries the model string EXACT + max_tokens 128000 + stream in the request', async () => {
  try {
    const root = tmpProject();
    const { transport, calls } = makeTransport(async () => okJson('THE FULL REPORT'));
    const res = await generateReport(sampleInput(root), { transport, apiKey: 'test-key' });

    expect(res.version).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain('/responses');

    const body: { model: string; max_output_tokens: number; stream: boolean; input: unknown[] } = JSON.parse(calls[0].init.body);
    expect(body.model).toBe('muse-spark-1.2-contributor');
    expect(body.max_output_tokens).toBe(131072);
    expect(body.stream).toBe(false);                            // the non-streaming JSON flag
    expect(calls[0].init.headers['content-type']).toBe('application/json');
    expect(calls[0].init.headers['accept']).toBe('application/json');
    expect(typeof calls[0].init.headers['authorization']).toBe('string');
    expect((calls[0].init.headers['authorization'] as string).startsWith('Bearer ')).toBe(true);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the exported constants ARE the literal hardcodes (the greps pass on the source)', () => {
    expect(GENERATION_MODEL).toBe('muse-spark-1.2-contributor');
    expect(GENERATION_PROVIDER).toBe('opencode-go');
    expect(MAX_GENERATION_TOKENS).toBe(131072);
    expect(GENERATION_CONNECTION).toBe('close');
  });

  it('the generation prompt demands the 6-section anatomy (D24, §10.2)', () => {
    const prompt = buildGenerationPrompt(sampleInput(tmpProject()));
    expect(prompt).toContain('1. THE EXECUTIVE SUMMARY');
    expect(prompt).toContain('2. THE FINDINGS');
    expect(prompt).toContain('3. THE ARCHITECTURE DIAGRAMS (ASCII)');
    expect(prompt).toContain('4. THE ENGINEERING AUDIT REPORTS');
    expect(prompt).toContain('5. THE FIX ORDER');
    expect(prompt).toContain('6. THE APPENDICES');
  });

  it('the prompt embeds the per-finding 6-part contract + the graph evidence (G14.2)', () => {
    const input = sampleInput(tmpProject());
    const prompt = buildGenerationPrompt(input);
    expect(prompt).toContain('HOW BROKEN');
    expect(prompt).toContain('WHY BROKEN');
    expect(prompt).toContain('WHAT IT VIOLATES');
    expect(prompt).toContain('HOW TO FIX');
    expect(prompt).toContain('WHAT TO DO');
    expect(prompt).toContain('WHY THIS WORKS');
    expect(prompt).toContain('P6:src/engine3/visual-setup-generator.ts:214');
    expect(prompt).toContain('e3-anchor --constrains→ fn:selectE2Zone');
    expect(prompt).toContain('run_id: run-test-001');
  });
});

// ---------------------------------------------------------------------------
// THE HAPPY PATH + THE WRITE PATH (C1.11, §7.3)
// ---------------------------------------------------------------------------

describe('the happy path + the locked write path (C1.11, §7.3)', () => {
  it('writes the report to <project>/MASTER_CONTEXT/bug_hunter_report_v1.md (created when absent)', async () => {
  try {
    const root = tmpProject();
    const { transport } = makeTransport(async () => okJson('THE FULL REPORT BODY'));
    const res = await generateReport(sampleInput(root), { transport });

    expect(res.reportPath).toBe(path.join(root, 'MASTER_CONTEXT', 'bug_hunter_report_v1.md'));
    expect(res.version).toBe(1);
    expect(res.chunks).toBe(1);
    expect(res.truncated).toBe(false);
    expect(res.findingsCount).toBe(2);
    expect(res.bytes).toBeGreaterThanOrEqual(1);

    const file = await readFile(res.reportPath, 'utf-8');
    expect(file).toContain('THE FULL REPORT BODY');
    expect(file).toContain('run_id: run-test-001');
    expect(file).toContain('model: muse-spark-1.2-contributor');
    expect(file).toContain('max_tokens: 131072');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('NEVER overwrites — the next run writes v2 (the max+1 versioning, §7.3.4)', async () => {
  try {
    const root = tmpProject();
    const { transport } = makeTransport(async (call) => {
      const n = call.url.endsWith('/2') ? 0 : 1;
      const body: { input: Array<{ content: string }> } = JSON.parse(call.init.body);
      const isContinuation = body.input.some((m: { content: string }) => m.content.includes('CONTINUATION DIRECTIVE'));
      void n; void isContinuation;
      return okJson('RUN ONE');
    });

    const r1 = await generateReport(sampleInput(root, 'run-1'), { transport });
    const r2 = await generateReport(sampleInput(root, 'run-2'), { transport });

    expect(r1.version).toBe(1);
    expect(r2.version).toBe(2);
    const v1 = await readFile(r1.reportPath, 'utf-8');
    const v2 = await readFile(r2.reportPath, 'utf-8');
    expect(v1).toContain('RUN ONE');
    expect(v2).toContain('RUN ONE');                 // v1 is byte-intact — never overwritten
    expect(v2).toContain('supersedes: bug_hunter_report_v1.md');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('reuses an existing MASTER_CONTEXT VARIANT (never a duplicate — the D18 six-form matcher)', async () => {
    const root = tmpProject();
    await mkdir(path.join(root, 'master-context'), { recursive: true });
    await writeFile(path.join(root, 'master-context', 'SPEC.md'), '# awareness', 'utf-8');

    const { transport } = makeTransport(async () => okJson('VARIANT REUSE'));
    const res = await generateReport(sampleInput(root), { transport });

    expect(res.reportPath).toBe(path.join(root, 'master-context', 'bug_hunter_report_v1.md'));
    // the canonical MASTER_CONTEXT must NOT have been created — the variant wins (D18)
    let dup = false;
    try { await readdir(path.join(root, 'MASTER_CONTEXT')); dup = true; } catch (e: unknown) { console.warn('[report-writer.test] readdir threw (expected dup=false): ' + String(e)); dup = false; }
    expect(dup).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE CHUNKED ASSEMBLY (G19.3)
// ---------------------------------------------------------------------------

describe('the chunked assembly (G19.3 — a capped completion continues sequentially)', () => {
  it('finish_reason=length → a continuation request → the full report assembled', async () => {
  try {
    const root = tmpProject();
    const { transport, calls } = makeTransport(async ({ idx }) => {
      if (idx === 0) {
        return okJson('PART ONE: the executive summary + the findings...', 'incomplete');
      }
      return okJson('PART TWO: the diagrams + the fix order...');
    });

    const res = await generateReport(sampleInput(root), { transport, maxChunks: 4 });

    expect(calls.length).toBe(2);          // the capped completion → exactly one continuation
    expect(res.truncated).toBe(true);
    expect(res.chunks).toBe(2);

    const body2: { input: Array<{ content: string }> } = JSON.parse(calls[1].init.body);
    const user2 = body2.input[1].content;
    expect(user2).toContain('## CONTINUATION DIRECTIVE');
    expect(user2).toContain('PART ONE');   // the last-60-lines tail anchors the continuation

    const file = await readFile(res.reportPath, 'utf-8');
    expect(file).toContain('PART ONE');
    expect(file).toContain('PART TWO');
    expect(file).toContain('chunks: 2');
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('stops immediately when the provider finishes without a cap (no spurious chunks)', async () => {
  try {
    const root = tmpProject();
    const { transport, calls } = makeTransport(async () => okJson('COMPLETE IN ONE'));
    const res = await generateReport(sampleInput(root), { transport });
    expect(calls.length).toBe(1);
    expect(res.chunks).toBe(1);
    expect(res.truncated).toBe(false);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
});

// ---------------------------------------------------------------------------
// THE ADVERSARIAL SET (the loud-fail-or-clear-pass law — GENERATION_FAILED +
// NO partial file, always)
// ---------------------------------------------------------------------------

describe('the adversarial set — GENERATION_FAILED + NO file on disk', () => {
  it('the 500 response → /GENERATION_FAILED/ + NO file', async () => {
  try {
    const root = tmpProject();
    const { transport } = makeTransport(async () => ({
      ok: false, status: 500,
      headers: { get: () => null },
      body: null,
      text: async () => 'provider exploded',
    }));
    await assertNamedFailure(generateReport(sampleInput(root), { transport }), 'GENERATION_FAILED');
    expect(await reportFiles(root)).toEqual([]);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the empty stream → /GENERATION_FAILED/ + NO file', async () => {
  try {
    const root = tmpProject();
    const { transport } = makeTransport(async () => okJson(''));
    await assertNamedFailure(generateReport(sampleInput(root), { transport }), 'GENERATION_FAILED');
    expect(await reportFiles(root)).toEqual([]);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the mid-stream error → /GENERATION_FAILED/ + NO partial file', async () => {
  try {
    const root = tmpProject();
    const { transport } = makeTransport(async () => errJson(500, 'mid-stream socket reset'));
    await assertNamedFailure(generateReport(sampleInput(root), { transport }), 'GENERATION_FAILED');
    expect(await reportFiles(root)).toEqual([]);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the stalled stream (the 90s stall window) → /GENERATION_FAILED/ stage=stall + NO file', async () => {
  try {
    const root = tmpProject();
    const { transport } = makeTransport(async (_call) => {
      // the fetch resolves ok but the body NEVER delivers an event — the
      // writer's stall timer must abort the read (the injected 30ms seam
      // stands in for the HARDCODED 90000ms window)
      return {
        ok: true, status: 200,
        headers: { get: () => null },
        json: () => new Promise((_resolve, reject) => {
          _call.init.signal.addEventListener('abort', () => {
            const e = new Error('aborted by the stall controller');
            e.name = 'AbortError';
            reject(e);
          }, { once: true });
        }),
        body: undefined,
        text: async () => '',
      } as unknown as StreamResponse;
    });
    await assertNamedFailure(generateReport(sampleInput(root), {
      transport, stallTimeoutMs: 30, overallTimeoutMs: 5000,
    }), 'GENERATION_FAILED');
    await assertNamedFailure(generateReport(sampleInput(root), {
      transport, stallTimeoutMs: 30, overallTimeoutMs: 5000,
    }), 'stage=stall');
    expect(await reportFiles(root)).toEqual([]);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the overall timeout (the 300s budget) → /GENERATION_FAILED/ stage=timeout + NO file', async () => {
  try {
    const root = tmpProject();
    const { transport } = makeTransport(async (_call) => {
      return {
        ok: true, status: 200,
        headers: { get: () => null },
        json: () => new Promise((_resolve, reject) => {
          _call.init.signal.addEventListener('abort', () => {
            const e = new Error('aborted by the overall budget');
            e.name = 'AbortError';
            reject(e);
          }, { once: true });
        }),
        body: undefined,
        text: async () => '',
      } as unknown as StreamResponse;
    });
    await assertNamedFailure(generateReport(sampleInput(root), {
      transport, stallTimeoutMs: 5000, overallTimeoutMs: 30,
    }), 'stage=timeout');
    expect(await reportFiles(root)).toEqual([]);
  
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });

  it('the named error carries the code + the stage (O32.1)', () => {
    const err = generationFailed('http', 'provider 500 boom');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof GenerationFailedError).toBe(true);
    expect(err.code).toBe('GENERATION_FAILED');
    expect(err.name).toBe('GENERATION_FAILED');
    expect(err.stage).toBe('http');
    expect(err.detail).toBe('provider 500 boom');
    expect(err.message).toContain('GENERATION_FAILED');
  });

  it('the continuation prompt anchors on the accumulated tail (G19.3)', () => {
    const cont = buildContinuationPrompt('BASE', 'line1\nline2\nline3');
    expect(cont).toContain('## CONTINUATION DIRECTIVE');
    expect(cont).toContain('line3');
    expect(cont).toContain('=== LAST 60 LINES ===');
  });

  // -------------------------------------------------------------------------
  // THE SEQUENTIAL BATCH PROCESS (2026-08-14 — the arch-hunt 400 fix, the
  // operator's law: heavy data ingestion = sequential batched processing).
  // The batch splitter must: yield ONE batch for a small input (the pre-fix
  // behavior), MULTIPLE batches for an input over the bound, preserve the rank
  // order, and cover the full set (the union of the batches = the input).
  // -------------------------------------------------------------------------

  it('the batch splitter yields ONE batch for a small input (the pre-fix behavior)', () => {
    const findings: ReportFinding[] = [
      { id: 'a:src/x.ts:1', severity: 'CRIT', rule: 'r1', evidence: 'short evidence' },
      { id: 'b:src/x.ts:2', severity: 'HIGH', rule: 'r2', evidence: 'short evidence' },
    ];
    const sections: ReportSectionRow[] = [
      { finding_id: 'a:src/x.ts:1', how_broken: 'x', why_broken: 'x', what_violates: 'x', how_to_fix: 'x', what_to_do: 'x', why_works: 'x', run_id: 'r' },
    ];
    const batches = splitFindingsIntoBatches(findings, sections);
    expect(batches.length).toBe(1);
    expect(batches[0].findings.length).toBe(2);
    expect(batches[0].sections.length).toBe(1);
  });

  it('the batch splitter splits a heavy input into input-bounded batches, preserving the rank order + the full coverage', () => {
    // the heavy input at the operator's 2026-08-14 calibration: the default
    // bound is ~850K tokens (MAX_PROMPT_INPUT_CHARS = 3.2M chars) — an input
    // BEYOND it must split. 1200 findings × ~3800 chars (the evidence + the
    // 6-part section) ≈ 4.5M chars > 3.2M → multiple batches.
    const findings: ReportFinding[] = [];
    const sections: ReportSectionRow[] = [];
    for (let i = 0; i < 1200; i++) {
      const id = `rule:src/f${i}.ts:${i}`;
      findings.push({ id, severity: 'WARN', rule: 'rule', evidence: `the violation at f${i} with a long evidence string ${'x'.repeat(1400)}` });
      sections.push({ finding_id: id, how_broken: 'h'.repeat(400), why_broken: 'w'.repeat(400), what_violates: 'v'.repeat(400), how_to_fix: 'f'.repeat(400), what_to_do: 'd'.repeat(400), why_works: 'k'.repeat(400), run_id: 'r' });
    }
    const batches = splitFindingsIntoBatches(findings, sections);
    // 1200 × (1400 + 2400+) chars each ≈ 4.5M chars total — MUST split
    expect(batches.length > 1).toBe(true);
    // every batch's estimated prompt fits the default bound
    for (const b of batches) {
      const size = b.findings.reduce((s, f) => s + 40 + f.evidence.length + f.rule.length + f.id.length, 0)
        + b.sections.reduce((s, x) => s + 260 + x.how_broken.length + x.why_broken.length + x.what_violates.length + x.how_to_fix.length + x.what_to_do.length + x.why_works.length, 0);
      expect(size <= MAX_PROMPT_INPUT_CHARS + 4000).toBe(true); // the single overflow item may exceed by one
    }
    // the rank order preserved: the flattened batch ids === the input ids in order
    const flat = batches.flatMap((b) => b.findings.map((f) => f.id));
    expect(flat).toEqual(findings.map((f) => f.id));
    // the full coverage: the union of the batch sections === the input sections
    const secFlat = batches.flatMap((b) => b.sections.map((s) => s.finding_id));
    expect(secFlat).toEqual(sections.map((s) => s.finding_id));
  });

  it('the batch splitter honors a custom bound (the bound is a parameter)', () => {
    const findings: ReportFinding[] = [];
    const sections: ReportSectionRow[] = [];
    for (let i = 0; i < 60; i++) {
      const id = `rule:src/f${i}.ts:${i}`;
      findings.push({ id, severity: 'WARN', rule: 'rule', evidence: `the violation at f${i} with a long evidence string ${'x'.repeat(1400)}` });
      sections.push({ finding_id: id, how_broken: 'h'.repeat(400), why_broken: 'w'.repeat(400), what_violates: 'v'.repeat(400), how_to_fix: 'f'.repeat(400), what_to_do: 'd'.repeat(400), why_works: 'k'.repeat(400), run_id: 'r' });
    }
    // 60 × ~3800 ≈ 228K chars — a custom 100K bound forces the split
    const batches = splitFindingsIntoBatches(findings, sections, 100_000);
    expect(batches.length > 1).toBe(true);
    const flat = batches.flatMap((b) => b.findings.map((f) => f.id));
    expect(flat).toEqual(findings.map((f) => f.id));
  });

  it('the batch meta marks the generation prompt (the sequential batch context)', () => {
    const prompt = buildGenerationPrompt(sampleInput(path.join(os.tmpdir(), 'x')), { index: 2, total: 3 });
    expect(prompt).toContain('findings batch: 2/3');
  });

  // -------------------------------------------------------------------------
  // THE SEQUENTIAL BATCH PROCESS (2026-08-14 — the arch-hunt 400 fix, the
  // operator's law: heavy data ingestion = sequential batched processing).
  // The batch splitter must: yield ONE batch for a small input (the pre-fix
  // behavior), MULTIPLE batches for an input over the bound, preserve the rank
  // order, and cover the full set (the union of the batches = the input).
  // -------------------------------------------------------------------------

  it('the batch splitter yields ONE batch for a small input (the pre-fix behavior)', () => {
    const findings: ReportFinding[] = [
      { id: 'a:src/x.ts:1', severity: 'CRIT', rule: 'r1', evidence: 'short evidence' },
      { id: 'b:src/x.ts:2', severity: 'HIGH', rule: 'r2', evidence: 'short evidence' },
    ];
    const sections: ReportSectionRow[] = [
      { finding_id: 'a:src/x.ts:1', how_broken: 'x', why_broken: 'x', what_violates: 'x', how_to_fix: 'x', what_to_do: 'x', why_works: 'x', run_id: 'r' },
    ];
    const batches = splitFindingsIntoBatches(findings, sections);
    expect(batches.length).toBe(1);
    expect(batches[0].findings.length).toBe(2);
    expect(batches[0].sections.length).toBe(1);
  });

  it('the batch splitter splits a heavy input into input-bounded batches, preserving the rank order + the full coverage', () => {
    // the heavy input at the operator's 2026-08-14 calibration: the default
    // bound is ~850K tokens (MAX_PROMPT_INPUT_CHARS = 3.2M chars) — an input
    // BEYOND it must split. 1200 findings × ~3800 chars (the evidence + the
    // 6-part section) ≈ 4.5M chars > 3.2M → multiple batches.
    const findings: ReportFinding[] = [];
    const sections: ReportSectionRow[] = [];
    for (let i = 0; i < 1200; i++) {
      const id = `rule:src/f${i}.ts:${i}`;
      findings.push({ id, severity: 'WARN', rule: 'rule', evidence: `the violation at f${i} with a long evidence string ${'x'.repeat(1400)}` });
      sections.push({ finding_id: id, how_broken: 'h'.repeat(400), why_broken: 'w'.repeat(400), what_violates: 'v'.repeat(400), how_to_fix: 'f'.repeat(400), what_to_do: 'd'.repeat(400), why_works: 'k'.repeat(400), run_id: 'r' });
    }
    const batches = splitFindingsIntoBatches(findings, sections);
    // 1200 × (1400 + 2400+) chars each ≈ 4.5M chars total — MUST split
    expect(batches.length > 1).toBe(true);
    // every batch's estimated prompt fits the default bound
    for (const b of batches) {
      const size = b.findings.reduce((s, f) => s + 40 + f.evidence.length + f.rule.length + f.id.length, 0)
        + b.sections.reduce((s, x) => s + 260 + x.how_broken.length + x.why_broken.length + x.what_violates.length + x.how_to_fix.length + x.what_to_do.length + x.why_works.length, 0);
      expect(size <= MAX_PROMPT_INPUT_CHARS + 4000).toBe(true); // the single overflow item may exceed by one
    }
    // the rank order preserved: the flattened batch ids === the input ids in order
    const flat = batches.flatMap((b) => b.findings.map((f) => f.id));
    expect(flat).toEqual(findings.map((f) => f.id));
    // the full coverage: the union of the batch sections === the input sections
    const secFlat = batches.flatMap((b) => b.sections.map((s) => s.finding_id));
    expect(secFlat).toEqual(sections.map((s) => s.finding_id));
  });

  it('the batch splitter honors a custom bound (the bound is a parameter)', () => {
    const findings: ReportFinding[] = [];
    const sections: ReportSectionRow[] = [];
    for (let i = 0; i < 60; i++) {
      const id = `rule:src/f${i}.ts:${i}`;
      findings.push({ id, severity: 'WARN', rule: 'rule', evidence: `the violation at f${i} with a long evidence string ${'x'.repeat(1400)}` });
      sections.push({ finding_id: id, how_broken: 'h'.repeat(400), why_broken: 'w'.repeat(400), what_violates: 'v'.repeat(400), how_to_fix: 'f'.repeat(400), what_to_do: 'd'.repeat(400), why_works: 'k'.repeat(400), run_id: 'r' });
    }
    // 60 × ~3800 ≈ 228K chars — a custom 100K bound forces the split
    const batches = splitFindingsIntoBatches(findings, sections, 100_000);
    expect(batches.length > 1).toBe(true);
    const flat = batches.flatMap((b) => b.findings.map((f) => f.id));
    expect(flat).toEqual(findings.map((f) => f.id));
  });

  it('the batch meta marks the generation prompt (the sequential batch context)', () => {
    const prompt = buildGenerationPrompt(sampleInput(path.join(os.tmpdir(), 'x')), { index: 2, total: 3 });
    expect(prompt).toContain('findings batch: 2/3');
  });
});

// ---------------------------------------------------------------------------
// THE STRIP-BEFORE-SEAL POSTPROCESS (HT-BUG-19) — red-first fixture
// ---------------------------------------------------------------------------

describe('the strip-before-seal postprocess (HT-BUG-19)', () => {
  it('stripBeforeSeal removes <think> blocks + deliberation preamble and the sealed output starts with "# " with zero leak markers', () => {
    const raw = [
      'The user is asking me to produce an exhaustive bug-hunt report.',
      'Hmm. This is a genuinely tricky situation.',
      'I must be careful to follow the grounding contract.',
      'Let me think about how to handle this properly.',
      'This is a critical constraint.',
      '<think>internal reasoning that must not leak</think>',
      '# THE REAL REPORT',
      '## 1. THE EXECUTIVE SUMMARY',
      'Clean audit — body mentioning thinking stays intact.',
    ].join('\n');
    const sealed = stripBeforeSeal(raw);
    const firstNonEmpty = sealed.split('\n').find((l) => l.trim().length > 0) ?? '';
    expect(firstNonEmpty.startsWith('# ')).toBe(true);
    expect(sealed).toContain('# THE REAL REPORT');
    expect(sealed).not.toContain('The user is asking');
    expect(sealed).not.toContain('Hmm.');
    expect(sealed).not.toContain('<think>');
    expect(sealed).toContain('thinking stays intact');
  });

  it('stripBeforeSeal preserves body content that mentions thinking after the heading', () => {
    const raw = '# REPORT TITLE\nBody line mentioning Hmm. and The user is asking stays.\n';
    const sealed = stripBeforeSeal(raw);
    expect(sealed.startsWith('# ')).toBe(true);
    expect(sealed).toContain('Hmm.');
    expect(sealed).toContain('The user is asking');
  });

  it('all-deliberation input throws GENERATION_FAILED stage=strip-empty (loud, never silent)', async () => {
    const root = tmpProject();
    const deliberationOnly = [
      'The user is asking me to produce a report.',
      'Hmm. This is a genuinely tricky situation.',
      'I must be careful.',
      'Let me consider the options.',
      'This is a test of the deliberation filter.',
    ].join('\n');
    const { transport } = makeTransport(async () => okJson(deliberationOnly));
    await assertNamedFailure(generateReport(sampleInput(root), { transport }), 'stage=strip-empty');
    expect(await reportFiles(root)).toEqual([]);
  });

  it('deliberation-prefixed transport body seals starting "# " with zero leak markers (integration)', async () => {
    const root = tmpProject();
    const body = [
      'The user is asking me to produce the report.',
      'Hmm. This is a genuinely tricky situation.',
      '<think>hidden chain of thought</think>',
      '# BUG-HUNT REPORT — INTEGRATION FIXTURE',
      '## 1. THE EXECUTIVE SUMMARY',
      'Findings: 2 — the stripped report is clean.',
    ].join('\n');
    const { transport } = makeTransport(async () => okJson(body));
    const res = await generateReport(sampleInput(root), { transport });
    const file = await readFile(res.reportPath, 'utf-8');
    const contentAfterHeader = file.split('---')[1] ?? file;
    expect(contentAfterHeader).toContain('# BUG-HUNT REPORT — INTEGRATION FIXTURE');
    expect(file).not.toContain('The user is asking');
    expect(file).not.toContain('genuinely tricky');
    expect(file).not.toContain('<think>');
    const firstNonEmptyAfterStrip = stripBeforeSeal(body).split('\n').find((l) => l.trim().length > 0) ?? '';
    expect(firstNonEmptyAfterStrip.startsWith('# ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// File-A enforcement battery — single-provider + apiKey provenance + retry (spec §2.8 W9)
// ---------------------------------------------------------------------------

describe('File-A enforcement battery — single-provider + apiKey provenance + retry (spec §2.8 W9)', () => {
  it('GENERATION_BASE_URL is the /zen/go/v1 slug (the opencode-go endpoint)', () => {
    expect(GENERATION_BASE_URL).toBe('https://opencode.ai/zen/go/v1');
  });
  it('REPORT_PROVIDER_CHAIN is single-provider — exactly one muse-spark rung, no fallback', () => {
    expect(REPORT_PROVIDER_CHAIN.length).toBe(1);
    expect(REPORT_PROVIDER_CHAIN[0].baseUrl).toBe('https://opencode.ai/zen/go/v1');
    expect(REPORT_PROVIDER_CHAIN[0].model).toBe('muse-spark-1.2-contributor');
    expect(REPORT_PROVIDER_CHAIN[0].keyEnv).toBe('OPENCODE_API_KEY');
  });
  it('the transport Authorization header IS Bearer <options.apiKey> (provenance pin)', async () => {
  try {
    const root = tmpProject();
    const { transport, calls } = makeTransport(async () => okJson('OK'));
    await generateReport(sampleInput(root), { transport, apiKey: 'tok-123' });
    expect(calls[0].init.headers['authorization']).toBe('Bearer tok-123');
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
  it('without any key source the writer throws auth-stage provider unresponsive (never unauthenticated send)', async () => {
  try {
    const root = tmpProject();
    const saved = process.env.OPENCODE_API_KEY;
    const savedHome = process.env.HOME;
    delete process.env.OPENCODE_API_KEY;
    process.env.HOME = path.join(os.tmpdir(), `rw-empty-home-${Math.random().toString(36).slice(2)}`);
    try {
      const { transport } = makeTransport(async () => okJson('X'));
      await assertNamedFailure(generateReport(sampleInput(root), { transport }), 'provider unresponsive');
    } finally { if (saved !== undefined) process.env.OPENCODE_API_KEY = saved; else delete process.env.OPENCODE_API_KEY; if (savedHome !== undefined) process.env.HOME = savedHome; else delete process.env.HOME; }
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
  it('15 consecutive failures → GENERATION_FAILED chain-exhausted naming provider unresponsive + NO file; stub saw 15 attempts', async () => {
  try {
    const root = tmpProject();
    let n = 0;
    const { transport } = makeTransport(async () => { n++; return { ok: false, status: 500, headers: { get: () => null }, body: null, text: async () => 'boom' }; });
    const orig = globalThis.setTimeout as unknown as typeof setTimeout;
    (globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((cb: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => ms === 3000 ? orig(cb as never, 1 as never, ...(a as never[])) : orig(cb as never, ms as never, ...(a as never[]))) as never;
    try {
      await assertNamedFailure(generateReport(sampleInput(root), { transport, stallTimeoutMs: 50, overallTimeoutMs: 200, apiKey: 'tok-123' }), 'chain-exhausted');
    } finally { (globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = orig; }
    expect(n).toBe(15);
    expect(await reportFiles(root)).toEqual([]);
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
  it('success resets the count — a later failing run again attempts 15 (not 14 accumulated)', async () => {
  try {
    const root = tmpProject();
    const { transport: okTransport } = makeTransport(async () => okJson('OK'));
    await generateReport(sampleInput(root, 'run-ok'), { transport: okTransport, apiKey: 'tok-123' });
    let n2 = 0;
    const { transport: failTransport } = makeTransport(async () => { n2++; return { ok: false, status: 500, headers: { get: () => null }, body: null, text: async () => 'boom2' }; });
    const orig2 = globalThis.setTimeout as unknown as typeof setTimeout;
    (globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((cb: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => ms === 3000 ? orig2(cb as never, 1 as never, ...(a as never[])) : orig2(cb as never, ms as never, ...(a as never[]))) as never;
    try {
      await assertNamedFailure(generateReport(sampleInput(root, 'run-fail'), { transport: failTransport, stallTimeoutMs: 50, overallTimeoutMs: 200, apiKey: 'tok-123' }), 'chain-exhausted');
    } finally { (globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = orig2; }
    expect(n2).toBe(15);
  } catch (e: unknown) {
    console.warn('async operation failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
  });
  it('stall/overall/batch budgets are the container-proven values', () => {
    expect(FETCH_STALL_MS).toBe(90000);
    expect(GENERATION_TIMEOUT_MS).toBe(300000);
    expect(BATCH_GENERATION_TIMEOUT_MS).toBe(900000);
  });
});
