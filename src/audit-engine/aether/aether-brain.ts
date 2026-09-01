/**
 * aether-brain.ts — THE AETHER BRAIN (S2 — the SPEC-2 §2.2/§9.2)
 *
 * THE ONLY LLM-USING SURFACE in the audit pipeline. THE BRAIN IS A COMPOSER,
 * NEVER A JUDGE (the fusion law §2.7): the machinery (the calibration, the
 * graph, the triads, the silent-verifier) DECIDES; the brain WRITES. It
 * consumes the supremacy brief (the ONLY ground truth) and produces the
 * judgment-pass prose: the per-finding adjudication, the deeper root, the
 * concrete fix, and the executive-summary narrative.
 *
 * THE FIVE MECHANISMS (§9.2.2):
 *   1 THE THIN-BRIEF VALIDATION — fewer than one finding → AETHER_COMPOSE_FAILED
 *     (the loud refusal — the aether cannot judge nothing)
 *   2 THE BOUNDED-CHUNK PROBE DRIVE — the S4 engine slices ≤4 findings/batch
 *     (the 4,000-char filter); a coverage failure → re-probe ONCE
 *   3 THE NARRATIVE COMPOSITION — the STRONGER model writes the executive
 *     summary (it sets the report's trust); the probes are the fast model's
 *   4 THE RETRY-CAPACITY — a malformed/empty/rejected model result → ONE retry;
 *     the second failure → AETHER_COMPOSE_FAILED (NO partial set dressed full)
 *   5 THE DETERMINISTIC COMPOSITION — TEMPERATURE 0 (the same brief → the same
 *     verdict shape; only the prose varies, and the verifier gates it)
 *
 * THE MODEL IS A NAMED CONFIG, NEVER HARDCODED: the DefaultAetherBrain takes
 * its ModelRefs by injection — the unit battery mocks them (no live call).
 *
 * THE ProbedVerdict TYPE: owned by this wave per SPEC-2 §2.2/§2.9, re-exported
 * from silent-verifier.ts (S-PB1's identical surface) so both import paths —
 * '../aether/aether-brain.ts' (the §10.1 battery's) and silent-verifier's own —
 * resolve to THE SAME type (never an incompatible redefinition).
 */
import { tridentLog } from '../../utils.js';
import type { GroundTruth } from './supremacy-brief.js';
import type { ProbedVerdict } from './silent-verifier.js';
import {
  AETHER_COMPOSE_FAILED,
  buildProbePrompt,
  chunkForProbe,
  parseProbeResult,
  validateBatchCoverage,
} from './deeper-probe.js';
import type { AuditFinding } from '../types.js';

export type { ProbedVerdict } from './silent-verifier.js';
export { AETHER_COMPOSE_FAILED } from './deeper-probe.js';

// ── THE STEP-X NAMED REGISTERS (SPEC-2 §13 — the calibrated constants, each
//    with its §2.12/§9.2.4 BECAUSE) ──
export const STEPX_CONSTANTS = {
  PROBE_BATCH_SIZE: 4,        // the 4000-char bounded chunk (the AETHER bible)
  SOURCE_WINDOW_LINES: 80,    // the supremacy brief's window
  PROBE_MAX_TOKENS: 600,      // the per-finding verdict budget
  NARRATIVE_MAX_TOKENS: 400,  // the executive summary budget
  TEMPERATURE: 0,             // the deterministic composition
  RETRY_ONCE: true,           // the schedule-completion retry (a malformed batch → ONE retry)
} as const;

// ── THE BRAIN SURFACE (SPEC-2 §2.2/§9.2.3 — the LLM-composition contract) ──
export interface AetherBrief {
  groundTruth: GroundTruth;    // the supremacy brief (S3) — the ONLY data the brain sees
  findings: AuditFinding[];    // the D17-calibrated findings (the evidence triads included)
}

export interface CompositionResult {
  verdicts: ProbedVerdict[];
  narrative: string;           // the report's introduction + the executive summary prose
  modelMeta: { model: string; provider: string; composedAt: number };
}

export interface AetherBrain {
  // THE COMPOSITION ENTRY — the brain produces its judgment-pass prose.
  // THE CONTRACT: the output is a STRUCTURED set of per-finding verdicts + a narrative.
  compose(brief: AetherBrief): Promise<CompositionResult>;
}

// ── THE NAMED MODEL CONFIG (§9.2.6 — the model + the provider + the token
//    budget are INJECTED, never hardcoded in the class body. The battery's
//    mock satisfies this surface; the runtime wires the real backend.) ──
export interface ModelCompleteRequest {
  prompt: string;
  maxTokens: number;
  temperature: number;
}

export interface ModelRef {
  model: string;
  provider: string;
  complete(req: ModelCompleteRequest): Promise<string>;
}

export interface AetherBrainConfig {
  probeModel: ModelRef;        // the fast/cheap model — the per-finding adjudication
  narrativeModel: ModelRef;    // the stronger model — the executive summary
}

/** THE DEFAULT BRAIN (the SPEC-2 §9.2 five-mechanism composition). PURE over
 *  its brief: NO filesystem, NO tool calls, NO state mutation — the frozen
 *  model's general reasoning over the ground truth, temperature 0. */
export class DefaultAetherBrain implements AetherBrain {
  private readonly config: AetherBrainConfig;

  constructor(config: AetherBrainConfig) {
    // THE ERROR PATH FIRST: a brain without its NAMED models cannot compose —
    // thrown at construction, never a mid-audit surprise.
    if (!config || !config.probeModel || !config.narrativeModel) {
      throw new TypeError(`${AETHER_COMPOSE_FAILED}: the brain requires its NAMED model config (the probe + the narrative ModelRef) — never hardcoded`);
    }
    this.config = config;
  }

  async compose(brief: AetherBrief): Promise<CompositionResult> {
    // ── STAGE 0 — THE THIN-BRIEF VALIDATION (MECHANISM 1 — the loud refusal).
    //    The brain never fabricates a set over an empty input. ──
    if (!brief || !Array.isArray(brief.findings) || brief.findings.length < 1) {
      throw new Error(`${AETHER_COMPOSE_FAILED}: no findings to probe — the aether cannot judge nothing`);
    }
    if (!brief.groundTruth || !Array.isArray(brief.groundTruth.findings) || brief.groundTruth.findings.length < 1) {
      throw new Error(`${AETHER_COMPOSE_FAILED}: no findings to probe — the aether cannot judge nothing`);
    }

    // ── STAGE 1 — THE BOUNDED-CHUNK PROBE DRIVE (MECHANISM 2 — the S4 engine
    //    slices ≤4/batch; the brain fires the FAST model per batch; the
    //    coverage guard re-probes ONCE, never silently skips). ──
    const batches = chunkForProbe(brief.groundTruth.findings, STEPX_CONSTANTS.PROBE_BATCH_SIZE);
    const verdicts: ProbedVerdict[] = [];
    for (const batch of batches) {
      const probed = await this.probeBatch(batch, brief.groundTruth);
      verdicts.push(...probed);
    }

    // ── STAGE 2 — THE NARRATIVE COMPOSITION (MECHANISM 3 — the STRONGER model
    //    sets the report's trust; a failure is LOUD, never a fake summary). ──
    const narrative = await this.composeNarrative(brief, verdicts);

    return {
      verdicts,
      narrative,
      modelMeta: {
        // BOTH models are named — the composition is the probes (the fast
        // model) + the narrative (the stronger); the meta reports what ran.
        model: `${this.config.probeModel.model} (probes) + ${this.config.narrativeModel.model} (narrative)`,
        provider:
          this.config.probeModel.provider === this.config.narrativeModel.provider
            ? this.config.probeModel.provider
            : `${this.config.probeModel.provider}|${this.config.narrativeModel.provider}`,
        composedAt: Date.now(),
      },
    };
  }

  /** THE PROBE BATCH (MECHANISM 2 + 4 — fire the fast model, parse, check the
   *  coverage; a malformed/empty/rejected result → retried ONCE with the same
   *  prompt; the second failure → AETHER_COMPOSE_FAILED). */
  private async probeBatch(
    batch: AetherBrief['groundTruth']['findings'],
    groundTruth: GroundTruth,
  ): Promise<ProbedVerdict[]> {
    const prompt = buildProbePrompt(batch, groundTruth);
    const attempts = STEPX_CONSTANTS.RETRY_ONCE ? 2 : 1;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const raw = await this.config.probeModel.complete({
          prompt,
          maxTokens: STEPX_CONSTANTS.PROBE_MAX_TOKENS,
          temperature: STEPX_CONSTANTS.TEMPERATURE,
        });
        const parsed = parseProbeResult(raw, batch);
        if (!validateBatchCoverage(batch, parsed)) {
          throw new Error(
            `${AETHER_COMPOSE_FAILED}: the batch coverage failed — the verdicts must reference the batch's findings 1:1 (got ${parsed.length} for ${batch.length})`,
          );
        }
        return parsed;
      } catch (err) {
        // THE CATCH LOGS + DRIVES THE RETRY (never an empty catch): the first
        // failure is the transient hiccup; the loop's exhaustion is the LOUD fail.
        lastError = err;
        void tridentLog(
          'WARN',
          'aether-brain',
          `probe batch attempt ${attempt}/${attempts} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${AETHER_COMPOSE_FAILED}: the probe batch failed after the retry — ${detail}`);
  }

  /** THE NARRATIVE (MECHANISM 3 + 4 — the stronger model composes the
   *  executive summary from the verdict counts; the same one-retry law; the
   *  second failure → AETHER_COMPOSE_FAILED — NO fake report). */
  private async composeNarrative(brief: AetherBrief, verdicts: ProbedVerdict[]): Promise<string> {
    // THE NARRATIVE'S DATA (computed from the verdicts, never hardcoded): the
    // per-adjudication counts the summary must state.
    let truePositives = 0;
    let redHerrings = 0;
    let unclear = 0;
    for (const verdict of verdicts) {
      if (verdict.adjudication === 'TRUE_POSITIVE') truePositives++;
      else if (verdict.adjudication === 'RED_HERRING') redHerrings++;
      else unclear++;
    }
    const top = [...verdicts].sort((a, b) => a.consequenceRank - b.consequenceRank)[0];
    const topRef = top ? brief.findings[top.findingIndex] : undefined;
    const topAnchor = topRef ? `${topRef.file}:${topRef.line}` : '(none)';

    const prompt = [
      `THE STEP-X EXECUTIVE SUMMARY — the report's first read for ${brief.groundTruth.projectInfo.name}.`,
      `The adjudicated counts: ${truePositives} TRUE_POSITIVE, ${redHerrings} RED_HERRING, ${unclear} UNCLEAR (of ${verdicts.length} findings).`,
      `The top consequence-rank-1 anchor: ${topAnchor}.`,
      `Write the consequence-ranked executive summary (the verdict + the fix order).`,
      `THE SUPREMACY CONTRACT: the DATA above is the only ground truth. NEVER invent a`,
      `file/line that is not in the brief. The ambiguous is "UNREADABLE — approximate: X".`,
    ].join('\n');

    const attempts = STEPX_CONSTANTS.RETRY_ONCE ? 2 : 1;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const raw = await this.config.narrativeModel.complete({
          prompt,
          maxTokens: STEPX_CONSTANTS.NARRATIVE_MAX_TOKENS,
          temperature: STEPX_CONSTANTS.TEMPERATURE,
        });
        if (typeof raw !== 'string' || raw.trim().length === 0) {
          throw new Error(`${AETHER_COMPOSE_FAILED}: the narrative model returned an empty summary`);
        }
        return raw.trim();
      } catch (err) {
        lastError = err;
        void tridentLog(
          'WARN',
          'aether-brain',
          `narrative attempt ${attempt}/${attempts} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${AETHER_COMPOSE_FAILED}: the narrative composition failed after the retry — ${detail}`);
  }
}
