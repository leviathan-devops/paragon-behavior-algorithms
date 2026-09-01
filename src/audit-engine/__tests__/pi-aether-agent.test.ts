// src/audit-engine/__tests__/pi-aether-agent.test.ts — THE PI HARNESS BATTERY
// (the ported boilerplate machinery). THE LEDGER runs on its INJECTABLE CLOCK;
// the tools run against REAL temp filesystems; the wiring contract is pinned
// at source level. THE LIVE MODEL CALLS are the container suite's job — this
// battery proves the machinery deterministically.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

import { RpmLedger } from '../aether/rpm-ledger.js';
import { AetherAgent, AETHER_MODEL } from '../harness/pi-aether-agent.js';
import { createGrepTool, createReadTool } from '../harness/pi-audit-tools.js';
import { createReportWriteTool } from '../aether/pi-report-write-tool.js';
import { createAgentAetherBrain } from '../aether/agent-brain.js';

let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-aether-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'bad.ts'), [
    'export function run(cb: any) { try { cb(); } catch (e) {} }',
    'export function d() { return true; }',
  ].join('\n'));
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// ── THE RPM LEDGER (ported verbatim — the deterministic-clock proofs) ──
describe('THE RPM LEDGER — the token bucket + the shared TTL exile', () => {
  it('ADMISSION: unprofiled = unlimited; fresh profiled = ok at capacity', () => {
    const t0 = 1_000_000;
    const l = new RpmLedger('t', { clock: () => t0 });
    expect(l.admission('unknown', t0)).toBe('ok');
    expect(l.admission('nvidia', t0)).toBe('ok');
  });
  it('EXILE: record429 → exiled inside EXILE_MS → re-admitted after the roll', () => {
    let now = 2_000_000;
    const l = new RpmLedger('t', { clock: () => now });
    l.record429('nvidia', now);
    expect(l.admission('nvidia', now + 44_999)).toBe('exiled');
    expect(l.admission('nvidia', now + 45_001)).toBe('ok');
  });
  it('ACQUIRE ON EXILE IS INSTANT-FALSE (never waits out another provider’s exile)', async () => {
    let now = 3_000_000;
    const l = new RpmLedger('t', { clock: () => now });
    l.record429('nvidia', now);
    const t0 = Date.now();
    expect(await l.acquire('nvidia')).toBe(false);
    expect(Date.now() - t0 < 500).toBe(true);
  });
});

// ── THE KEY SEEDING (single-provider opencode-go — 2026-08-24 hardcode) ──
describe('THE KEY SEEDING', () => {
  it('construction seeds the single opencode-go key when absent; exported values are never overwritten', () => {
    const saved = process.env.OPENCODE_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    try {
      const a = new AetherAgent({ targetRoot: root, judgmentPath: '/tmp/x.md' });
      expect(typeof process.env.OPENCODE_API_KEY === 'string' && String(process.env.OPENCODE_API_KEY).length > 20).toBe(true);
      const sentinel = 'opencode-go-exported-wins';
      process.env.OPENCODE_API_KEY = sentinel;
      new AetherAgent({ targetRoot: root, judgmentPath: '/tmp/x.md' });
      expect(process.env.OPENCODE_API_KEY).toBe(sentinel);   // env wins over the seed
    } finally {
      if (saved !== undefined) process.env.OPENCODE_API_KEY = saved; else delete process.env.OPENCODE_API_KEY;
    }
  });
});

// ── THE TOOLS ──
describe('THE GREP TOOL — scoped investigation', () => {
  it('finds line-anchored matches INSIDE the target root only', async () => {
    const grep = createGrepTool(root);
    const r = await grep.execute('g1', { pattern: 'export function run' }, undefined, undefined);
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain('bad.ts');
    expect(text).toContain('export function run');
  });
  it('an empty pattern is REJECTED (named, loud)', async () => {
    const grep = createGrepTool(root);
    const r = await grep.execute('g2', { pattern: '' }, undefined, undefined);
    const text = (r.content[0] as { text: string }).text;
    expect(text.startsWith('GREP_INVALID')).toBe(true);
  });
});

describe('THE REPORT-WRITE TOOL — force-pinned, section-validating', () => {
  const judgmentPath = path.join(os.tmpdir(), `pi-aether-judgment-${Date.now()}.md`);
  afterAll(() => fs.rmSync(judgmentPath, { force: true }));

  it('REJECTS empty content', async () => {
    const w = createReportWriteTool(judgmentPath);
    const r = await w.execute('w1', { content: '' }, undefined, undefined);
    expect((r.content[0] as { text: string }).text.startsWith('REPORT_WRITE_REJECTED')).toBe(true);
  });
  it('REJECTS missing required sections (named)', async () => {
    const w = createReportWriteTool(judgmentPath);
    const r = await w.execute('w2', { content: '# STEP-X JUDGMENT\npartial garbage' }, undefined, undefined);
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain('missing required section(s)');
    expect(text).toContain('THE EXECUTIVE SUMMARY');
  });
  it('REJECTS zero FINDING blocks', async () => {
    const w = createReportWriteTool(judgmentPath);
    const body = ['# STEP-X JUDGMENT', '## 1. THE EXECUTIVE SUMMARY', 'x', '## 2. THE FINDING BLOCKS', '## 3. THE RED-HERRINGS'].join('\n');
    const r = await w.execute('w3', { content: body }, undefined, undefined);
    expect((r.content[0] as { text: string }).text).toContain('zero FINDING blocks');
  });
  it('ACCEPTS a complete judgment and WRITES THE FILE (the deliverable lands)', async () => {
    const w = createReportWriteTool(judgmentPath);
    const body = [
      '# STEP-X JUDGMENT',
      '## 1. THE EXECUTIVE SUMMARY',
      '7 TRUE_POSITIVE findings.',
      '## 2. THE FINDING BLOCKS',
      '### FINDING 0',
      'ADJUDICATION: TRUE_POSITIVE',
      'DEEPER ROOT: the catch swallows the rejection',
      'CONCRETE FIX: bad.ts:1 log + rethrow',
      'CONSEQUENCE RANK: 1',
      '## 3. THE RED-HERRINGS',
      '(none)',
    ].join('\n');
    const r = await w.execute('w4', { content: body }, undefined, undefined);
    expect((r.content[0] as { text: string }).text.startsWith('JUDGMENT WRITTEN')).toBe(true);
    expect(fs.readFileSync(judgmentPath, 'utf-8')).toContain('### FINDING 0');
  });
});

// ── THE BRAIN ADAPTER ──
describe('THE AGENT BRAIN — always constructible, loud on thin briefs', () => {
  it('constructs with NO env setup (the seeded-key plug-and-play law — single opencode-go)', () => {
    const saved = process.env.OPENCODE_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    try {
      const brain = createAgentAetherBrain({ targetPath: root });
      expect(typeof brain.compose).toBe('function');
    } finally {
      if (saved !== undefined) process.env.OPENCODE_API_KEY = saved;
    }
  });
  it('THIN-BRIEF REFUSAL: an empty findings set throws BEFORE any agent run', async () => {
    const brain = createAgentAetherBrain({ targetPath: root });
    let threw: unknown = null;
    try {
      await brain.compose({
        groundTruth: { targetPath: root, projectInfo: { name: 't', shape: 'library', isPlugin: false, srcPath: path.join(root, 'src') }, findings: [], graph: { nodes: 0, edges: 0, hotspot: [] }, events: { flowVerdict: 'CLEAR', cadenceAnomalies: [] } },
        findings: [],
      });
    } catch (e: unknown) {
      threw = e;
    }
    expect(threw instanceof Error).toBe(true);
    expect((threw as Error).message).toContain('no findings to probe');
  });
  it('THE BRIEF FILE IS WRITTEN with the finding windows + the judgment contract', async () => {
    const brain = createAgentAetherBrain({ targetPath: root });
    // drive compose with a stubbed AetherAgent.run via prototype patch (the
    // sanctioned seam — the RUN itself is container-proven; here we pin the
    // BRIEF construction contract):
    const findingsSrc = fs.readFileSync(path.join(root, 'src', 'bad.ts'), 'utf-8');
    let capturedBrief = '';
    const orig = AetherAgent.prototype.run;
    AetherAgent.prototype.run = async function (opts: { promptFilePath: string; judgmentPath?: string }) {
      capturedBrief = fs.readFileSync(opts.promptFilePath, 'utf-8');
      fs.writeFileSync(String(opts.judgmentPath ?? '/tmp/pi-aether-judgment.md'), '# STEP-X JUDGMENT\n## 1. THE EXECUTIVE SUMMARY\nx\n## 2. THE FINDING BLOCKS\n### FINDING 0\nADJUDICATION: UNCLEAR\nDEEPER ROOT: unknown\nCONCRETE FIX: investigate manually\nCONSEQUENCE RANK: 3\n## 3. THE RED-HERRINGS\n(none)');
      return { text: '', lines: 0, roundsUsed: 1, toolCallsMade: 0, toolCallNames: [], errors: [], fileStates: [] };
    };
    try {
      await brain.compose({
        groundTruth: {
          targetPath: root,
          projectInfo: { name: 't', shape: 'library', isPlugin: false, srcPath: path.join(root, 'src') },
          findings: [{ index: 0, layer: 'R2', severity: 'HIGH', category: 'silent-catch', file: 'src/bad.ts', line: 1, evidence: 'catch (e) {}', sourceWindow: findingsSrc.slice(0, 40), calibration: 'CALIBRATED', callGraphRef: null }],
          graph: { nodes: 2, edges: 0, hotspot: [] },
          events: { flowVerdict: 'CLEAR', cadenceAnomalies: [] },
        },
        findings: [{ index: 0, layer: 'R2', severity: 'HIGH', category: 'silent-catch', file: 'src/bad.ts', line: 1, evidence: 'catch (e) {}', sourceWindow: '', calibration: 'CALIBRATED', callGraphRef: null }],
      } as never);
    } catch { /* the parse may reject the minimal judgment — irrelevant here */ }
    AetherAgent.prototype.run = orig;
    expect(capturedBrief).toContain('### FINDING 0');
    expect(capturedBrief).toContain('SOURCE WINDOW:');
    expect(capturedBrief).toContain('THE JUDGMENT CONTRACT');
  });
});

// ── THE WIRING PINS (single-provider 2024-08-24; cwd-independent 2026-08-28:
// the read used to resolve off process.cwd()/.. — ENOENT ×6 whenever bun ran
// from the project root. Anchored to THIS file's location instead.) ──
describe('THE PORT CONTRACT — pinned at source (single-provider 2026-08-24)', () => {
  const harnessSrc = fs.readFileSync(path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'harness', 'pi-aether-agent.ts'), 'utf-8');
  it('single-provider chain: ONLY opencode-go/muse-spark-1.2-contributor on https://opencode.ai/zen/go/v1 (no fallback)', () => {
    expect(harnessSrc.includes("AETHER_PROVIDER_ID = 'opencode-go'")).toBe(true);
    expect(harnessSrc.includes('muse-spark-1.2-contributor')).toBe(true);
    expect(harnessSrc.includes('https://opencode.ai/zen/go/v1')).toBe(true);
    expect(harnessSrc.includes("provider: 'nvidia'")).toBe(false);
    expect(harnessSrc.includes("provider: 'openrouter'")).toBe(false);
    expect(harnessSrc.includes("provider: 'inferx'")).toBe(false);
    expect(harnessSrc.includes('ZEN_KEYS_B64')).toBe(false);
  });
  it('single-provider mechanics: 15 retries × 3s, done verifier + loud provider unresponsive', () => {
    expect(harnessSrc.includes('AETHER_DEGENERATE_DONE')).toBe(true);
    expect(harnessSrc.includes('Array.isArray(msgContent)')).toBe(true);
    expect(harnessSrc.includes("stopReason: 'error' as const")).toBe(true);
    expect(harnessSrc.includes('chainErrorMessage')).toBe(true);
    expect(harnessSrc.includes('GO_RUNG_ATTEMPTS = 3')).toBe(true);
    expect(harnessSrc.includes('RETRY_BACKOFF_MS = 2500')).toBe(true);
    expect(harnessSrc.includes('provider unresponsive')).toBe(true);
    expect(harnessSrc.includes('AETHER_BASE_URL')).toBe(true);
  });
  it('xhigh reasoning is wired into the Agent state', () => {
    expect(harnessSrc.includes("thinkingLevel: 'xhigh'")).toBe(true);
    expect(harnessSrc.includes('xhigh: 131072')).toBe(true);
  });
  it('AETHER_MODEL is opencode-go/muse-spark-1.2-contributor (single-provider hardcode)', () => {
    expect(AETHER_MODEL).toBe('opencode-go/muse-spark-1.2-contributor');
  });
});
