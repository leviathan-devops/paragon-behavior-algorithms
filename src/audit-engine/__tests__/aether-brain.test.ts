// src/audit-engine/__tests__/aether-brain.test.ts — THE AETHER-BRAIN BATTERY
// (SPEC-2 §9.2.7 C7 + the §10.3(4) retry-once). THE MODEL IS MOCKED — the
// battery NEVER calls a live model: the MockModel is the named-config ModelRef
// whose complete() runs a scripted handler, so the brain's machinery (the
// thin-brief refusal, the bounded batching, the retry-once, the count-bound,
// the temperature-0 contract) is proven against REAL code paths.
// THE FIRE-THAT-NEVER-FIRES IS THEATER: every failure mode has its case below.
import { describe, expect, it } from 'bun:test';
import * as os from 'os';
import * as path from 'path';

import {
  DefaultAetherBrain,
  STEPX_CONSTANTS,
} from '../aether/aether-brain.ts';
import type {
  ModelCompleteRequest,
  ModelRef,
  AetherBrief,
} from '../aether/aether-brain.ts';
import { chunkForProbe } from '../aether/deeper-probe.ts';
import type { BriefedFinding, GroundTruth } from '../aether/supremacy-brief.ts';
import type { AuditFinding } from '../types.ts';

// ── THE FIXTURES (the dynamic temp root — the R5 law; computed constructors) ──
const FIX_ROOT = path.join(os.tmpdir(), 'aether-brain-fixture-rt');

const F = (o: Partial<AuditFinding>): AuditFinding => ({ severity: 'HIGH', category: 'X', file: 'src/f.ts', line: 1, evidence: 'e', description: 'd', correction: 'c', runtimeImpact: 'i', confidence: 0.9, layer: 'R1', constructType: null, callGraphRef: null, evidenceSuppressed: false, ...o });

const BF = (o: Partial<BriefedFinding>): BriefedFinding => ({
  index: 0, layer: 'R2', severity: 'HIGH', category: 'silent-catch',
  file: 'src/bad.ts', line: 1, evidence: 'e',
  sourceWindow: 'export function run() { return 1; }',
  calibration: 'CALIBRATED', callGraphRef: null, ...o,
});

const GT = (findings: BriefedFinding[]): GroundTruth => ({
  targetPath: FIX_ROOT,
  projectInfo: { name: 'rt', shape: 'library', isPlugin: false, srcPath: path.join(FIX_ROOT, 'src') },
  findings,
  graph: { nodes: 3, edges: 0, hotspot: [] },
  events: { flowVerdict: 'CLEAR', cadenceAnomalies: [] },
});

/** THE N-FINDING BRIEF (the briefed findings' indices are their array positions
 *  — the count-bound's 1:1 map, computed from the data). */
const briefOf = (n: number): AetherBrief => {
  const briefed = Array.from({ length: n }, (_, i) => BF({ index: i, line: i + 1 }));
  return { groundTruth: GT(briefed), findings: briefed.map((_, i) => F({ line: i + 1 })) };
};

// ── THE MOCKED MODEL (the named-config ModelRef — the handler scripts the
//    responses; the calls are recorded so the battery asserts the temperature-0
//    + the max-tokens contract BEHAVIORALLY, never by mirror) ──
class MockModel implements ModelRef {
  readonly calls: ModelCompleteRequest[] = [];
  constructor(
    public readonly model: string,
    public readonly provider: string,
    private readonly handler: (req: ModelCompleteRequest, callIndex: number) => string,
  ) {}
  async complete(req: ModelCompleteRequest): Promise<string> {
    this.calls.push(req);
    return this.handler(req, this.calls.length - 1);
  }
}

/** THE WELL-FORMED PROBE RESPONSE — computed FROM the prompt's FINDING blocks
 *  (the mock parses the prompt the brain built; the battery never hardcodes an
 *  oracle answer). */
const wellFormedProbe = (req: ModelCompleteRequest): string => {
  const indices = [...req.prompt.matchAll(/FOR THE FINDING \(index (\d+)\)/g)].map((m) => Number(m[1]));
  return indices.map((i) => [
    `### FINDING ${i}`,
    `ADJUDICATION: TRUE_POSITIVE`,
    `DEEPER ROOT: the mechanism lives below the evidence slice of finding ${i}`,
    `CONCRETE FIX: src/bad.ts:${i + 1} add the guard`,
    `CONSEQUENCE RANK: 1`,
  ].join('\n')).join('\n');
};

const NARRATIVE = 'the adjudicated summary: the true-positives carry the fix order.';

const mkBrain = (
  probeHandler: (req: ModelCompleteRequest, callIndex: number) => string = wellFormedProbe,
  narrativeHandler: (req: ModelCompleteRequest) => string = () => NARRATIVE,
) => {
  const probeModel = new MockModel('probe-fast', 'mock-provider', probeHandler);
  const narrativeModel = new MockModel('narrative-strong', 'mock-provider', narrativeHandler);
  return { brain: new DefaultAetherBrain({ probeModel, narrativeModel }), probeModel, narrativeModel };
};


// THE ASYNC REJECTION ASSERTION (the bun:test ambient shim carries no .rejects —
// the aether-store battery's convention): the try/catch captures the LOUD error
// and the marker is asserted on its text; a path that does NOT throw leaves the
// message empty and the test FAILS.
const expectRejects = async (fn: () => Promise<unknown>, marker: RegExp): Promise<void> => {
  let message = '';
  try {
    await fn();
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  expect(marker.test(message)).toBe(true);
};

describe('THE AETHER BRAIN — the §9.2.7 C7 (the model MOCKED, never a live call)', () => {
  // ── THE THIN-BRIEF REFUSAL ──
  it('the thin-brief refusal: fewer than 1 finding → AETHER_COMPOSE_FAILED (the loud-fail, no fake)', async () => {
    const { brain } = mkBrain();
    await expectRejects(() => brain.compose({ groundTruth: GT([]), findings: [] }), /AETHER_COMPOSE_FAILED/);
  });

  it('the thin-brief refusal: the findings present but the ground truth EMPTY → AETHER_COMPOSE_FAILED (the brain never judges a fragment)', async () => {
    const { brain } = mkBrain();
    await expectRejects(() => brain.compose({ groundTruth: GT([]), findings: [F({})] }), /AETHER_COMPOSE_FAILED/);
  });

  it('the constructor ADVERSARIAL: a brain without its NAMED models is a LOUD construction failure', () => {
    expect(() => new DefaultAetherBrain(null as never)).toThrow(/AETHER_COMPOSE_FAILED/);
    expect(() => new DefaultAetherBrain({} as never)).toThrow(/AETHER_COMPOSE_FAILED/);
  });

  // ── THE BOUNDED BATCH ──
  it('the bounded batch: 10 findings → 3 batches (4/4/2) — the bounded-chunk discipline', () => {
    const ten = briefOf(10).groundTruth.findings;
    expect(chunkForProbe(ten, 4).length).toBe(3);
  });

  it('the brain DRIVES the bounded batches: 10 findings → 3 probe-model calls, each prompt ≤ 4 findings', async () => {
    const { brain, probeModel } = mkBrain();
    const brief = briefOf(10);
    await brain.compose(brief);
    expect(probeModel.calls.length).toBe(3);
    for (const call of probeModel.calls) {
      const blocks = call.prompt.match(/FOR THE FINDING \(index \d+\)/g) ?? [];
      expect(blocks.length).toBeLessThanOrEqual(STEPX_CONSTANTS.PROBE_BATCH_SIZE);
    }
  });

  // ── THE COUNT-BOUND ──
  it('the count-bound: the verdicts reference the findings 1:1 (the verifier check-2 precondition)', async () => {
    const { brain } = mkBrain();
    const brief = briefOf(7);
    const composition = await brain.compose(brief);
    expect(composition.verdicts.map((v) => v.findingIndex)).toEqual(brief.findings.map((_, i) => i));
  });

  // ── THE DETERMINISM ──
  it('the determinism: STEPX_CONSTANTS.TEMPERATURE === 0 (the composition contract)', () => {
    expect(STEPX_CONSTANTS.TEMPERATURE).toBe(0);
  });

  it('the temperature-0 contract is BEHAVIORAL: every model call carries temperature 0 + the named token budgets', async () => {
    const { brain, probeModel, narrativeModel } = mkBrain();
    await brain.compose(briefOf(5));
    for (const call of [...probeModel.calls, ...narrativeModel.calls]) {
      expect(call.temperature).toBe(0);
    }
    for (const call of probeModel.calls) expect(call.maxTokens).toBe(STEPX_CONSTANTS.PROBE_MAX_TOKENS);
    for (const call of narrativeModel.calls) expect(call.maxTokens).toBe(STEPX_CONSTANTS.NARRATIVE_MAX_TOKENS);
  });

  // ── THE RETRY-CAPACITY ──
  it('the retry-once: a malformed first batch → ONE re-probe with the same prompt → the composition succeeds', async () => {
    let probeCalls = 0;
    const { brain, probeModel } = mkBrain((req, callIndex) => {
      probeCalls++;
      return callIndex === 0 ? 'garbage — no FINDING blocks' : wellFormedProbe(req);
    });
    const composition = await brain.compose(briefOf(2));
    expect(probeCalls).toBe(2);                       // the first + the ONE retry
    expect(composition.verdicts.length).toBe(2);      // the retried batch landed full
    expect(probeModel.calls[0].prompt).toBe(probeModel.calls[1].prompt);   // the SAME prompt
  });

  it('the retry-capacity: the SECOND failure → AETHER_COMPOSE_FAILED (never a partial set dressed full)', async () => {
    const { brain, probeModel } = mkBrain(() => 'garbage — no FINDING blocks');
    await expectRejects(() => brain.compose(briefOf(2)), /AETHER_COMPOSE_FAILED/);
    expect(probeModel.calls.length).toBe(2);          // the retry bound held: exactly ONE retry
  });

  it('the retry-once on a REJECTED model call: the probe model throws → ONE retry → AETHER_COMPOSE_FAILED', async () => {
    const { brain, probeModel } = mkBrain(() => { throw new Error('the transport died'); });
    await expectRejects(() => brain.compose(briefOf(1)), /AETHER_COMPOSE_FAILED/);
    expect(probeModel.calls.length).toBe(2);
  });

  it('the coverage failure drives the retry: a verdict DROPPED by the model → the re-probe; the second drop → AETHER_COMPOSE_FAILED', async () => {
    // the mock answers only the FIRST finding of every batch — the count-bound fails
    const dropping = (req: ModelCompleteRequest): string => {
      const m = /FOR THE FINDING \(index (\d+)\)/.exec(req.prompt);
      const i = Number(m?.[1] ?? 0);
      return `### FINDING ${i}\nADJUDICATION: TRUE_POSITIVE\nDEEPER ROOT: r\nCONCRETE FIX: f\nCONSEQUENCE RANK: 1`;
    };
    const { brain, probeModel } = mkBrain(dropping);
    await expectRejects(() => brain.compose(briefOf(2)), /AETHER_COMPOSE_FAILED/);
    expect(probeModel.calls.length).toBe(2);          // one retry, then the loud fail
  });

  // ── THE NARRATIVE ──
  it('the narrative failure is LOUD: the stronger model throws → retried ONCE → AETHER_COMPOSE_FAILED (NO fake report)', async () => {
    const { brain, narrativeModel } = mkBrain(wellFormedProbe, () => { throw new Error('the narrative model stalled'); });
    await expectRejects(() => brain.compose(briefOf(1)), /AETHER_COMPOSE_FAILED/);
    expect(narrativeModel.calls.length).toBe(2);
  });

  it('the empty narrative → AETHER_COMPOSE_FAILED (the aether cannot judge nothing, the report cannot say nothing)', async () => {
    const { brain } = mkBrain(wellFormedProbe, () => '   ');
    await expectRejects(() => brain.compose(briefOf(1)), /AETHER_COMPOSE_FAILED/);
  });

  // ── THE HAPPY PATH (last — the post-adversarial confirmation) ──
  it('the full composition: the verdicts + the narrative + the modelMeta (the NAMED config, never hardcoded)', async () => {
    const { brain } = mkBrain();
    const composition = await brain.compose(briefOf(4));
    expect(composition.verdicts.length).toBe(4);
    expect(composition.narrative).toBe(NARRATIVE);
    expect(composition.modelMeta.model).toContain('probe-fast');
    expect(composition.modelMeta.model).toContain('narrative-strong');
    expect(composition.modelMeta.provider).toBe('mock-provider');
    expect(composition.modelMeta.composedAt).toBeGreaterThanOrEqual(1);
  });
});
