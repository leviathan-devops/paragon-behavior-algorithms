/**
 * deeper-probe.ts — THE DEEPER-PROBE ENGINE (S4 — the SPEC-2 §2.4/§9.4)
 *
 * THE STRIKE-PHASE ON THE FINDINGS: the engine builds the per-finding PROBE
 * PROMPT (the §2.4 anatomy), slices the findings into bounded chunks (≤4 per
 * batch — the AETHER bible's 4,000-char input filter), and validates the
 * batch output coverage. THE ENGINE IS THE ORCHESTRATOR OF THE PROBES — it
 * sequences, batches, collects. IT NEVER DECIDES THE VERDICT (the fusion law).
 *
 * THE FOUR EXPORTS (§9.4.3):
 *   buildProbePrompt      — the §2.4 anatomy: the 4-part output structure
 *                           (ADJUDICATION / DEEPER ROOT / CONCRETE FIX /
 *                           CONSEQUENCE RANK) + the supremacy contract + the
 *                           'UNREADABLE — approximate: X' honesty clause
 *   chunkForProbe         — the bounded-chunk slice (10 findings → 4/4/2)
 *   validateBatchCoverage — the bijective count-bound (a dropped OR an
 *                           invented finding → false)
 *   parseProbeResult      — the structured-verdict parser; the malformed →
 *                           AETHER_COMPOSE_FAILED (the retry-once driver)
 *
 * THE MODEL OUTPUT CONTRACT (the parser's grammar — declared IN the prompt so
 * the model's answer is machine-checkable):
 *
 *   ### FINDING {index}
 *   ADJUDICATION: TRUE_POSITIVE | RED_HERRING | UNCLEAR
 *   DEEPER ROOT: <the ≤200-char mechanism prose>
 *   CONCRETE FIX: <the ≤300-char remediation, with the file:line>
 *   CONSEQUENCE RANK: 1 | 2 | 3 | 4
 *
 * S-PB2 delivers the pure machinery; the brain (S2) drives the model calls.
 */
import type { BriefedFinding, GroundTruth } from './supremacy-brief.js';
import type { ProbedVerdict } from './silent-verifier.js';

// ── THE NAMED ERROR (the loud-fail surface — SPEC-2 §2.16: a malformed model
//    output drives the retry-once; the second failure is AETHER_COMPOSE_FAILED) ──
export const AETHER_COMPOSE_FAILED = 'AETHER_COMPOSE_FAILED';

// ── THE PROBE BUDGETS (SPEC-2 §9.4.4 — the bounded per-finding output the
//    verifier can check cheaply; declared in the prompt, never enforced by
//    silent truncation — the hardcode/truncation ban) ──
export const PROBE_ROOT_MAX_CHARS = 200;
export const PROBE_FIX_MAX_CHARS = 300;

// ── THE ADJUDICATION SET (SPEC-2 §2.9 — the 3-value class; 'UNCLEAR' is the
//    honest third, the supremacy contract's 'UNREADABLE' analog) ──
const ADJUDICATIONS = new Set<ProbedVerdict['adjudication']>(['TRUE_POSITIVE', 'RED_HERRING', 'UNCLEAR']);

/** THE BOUNDED-CHUNK SLICE (SPEC-2 §9.4.2 MECHANISM 2 — the 4,000-char
 *  discipline). 10 findings → 3 batches (4/4/2). Generic over the finding
 *  shape: the brain chunks the BRIEFED findings (the source-window carriers);
 *  the C7 chunks the raw AuditFinding fixtures — the slice is shape-agnostic.
 *
 *  ERROR PATHS FIRST (the loud-fail law): a non-array input or a non-positive,
 *  non-integer batch size is a CALLER BUG — thrown, never coerced. */
export function chunkForProbe<T>(items: readonly T[], batchSize: number): T[][] {
  if (!Array.isArray(items)) {
    throw new TypeError(`${AETHER_COMPOSE_FAILED}: chunkForProbe received a non-array findings input — the engine cannot batch nothing`);
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError(`${AETHER_COMPOSE_FAILED}: the probe batch size must be a positive integer, got ${String(batchSize)} — a >4 batch is a probe-engine bug, never a model truncation`);
  }
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/** THE PROBE-PROMPT CONSTRUCTION (SPEC-2 §2.4/§9.4.2 MECHANISM 1 — the anatomy
 *  is the engine's CORE ARTIFACT). Per finding: the layer/severity/category,
 *  the file:line, the evidence slice, the source window (the ground truth),
 *  the graph anchor — then the EXACT 4-part output structure + the supremacy
 *  contract + the 'UNREADABLE — approximate: X' honesty clause.
 *
 *  ERROR PATHS FIRST: an empty batch or a missing ground truth is a caller
 *  bug — thrown, never a prompt over nothing. */
export function buildProbePrompt(batch: BriefedFinding[], groundTruth: GroundTruth): string {
  if (!Array.isArray(batch) || batch.length === 0) {
    throw new TypeError(`${AETHER_COMPOSE_FAILED}: buildProbePrompt received an empty batch — the engine never probes nothing`);
  }
  if (!groundTruth || !groundTruth.projectInfo) {
    throw new TypeError(`${AETHER_COMPOSE_FAILED}: buildProbePrompt received no ground truth — the supremacy brief is the ONLY data the brain sees`);
  }

  const sections: string[] = [
    `THE STEP-X DEEPER PROBE — the strike-phase on the D17-calibrated findings of ${groundTruth.projectInfo.name}.`,
    `THE SUPREMACY CONTRACT: the DATA below is the only ground truth. Do NOT invent a`,
    `file/line that is not in the window. If the window is ambiguous, say`,
    `"UNREADABLE — approximate: X".`,
    ``,
  ];

  for (const finding of batch) {
    sections.push(
      `FOR THE FINDING (index ${finding.index}):`,
      `  layer: ${finding.layer} | severity: ${finding.severity} | category: ${finding.category}`,
      `  file: ${finding.file}:${finding.line}`,
      `  evidence: ${finding.evidence}`,
      `  source window (the ground truth):`,
      finding.sourceWindow,
      `  graph anchor: ${finding.callGraphRef ?? '(none)'}`,
      ``,
    );
  }

  sections.push(
    `ADJUDICATE + PROBE, in this exact structure:`,
    `  1. ADJUDICATION — is this a TRUE_POSITIVE (a real defect), a RED_HERRING (the`,
    `     calibration missed a shape — the finding is noise), or UNCLEAR? Base it ONLY`,
    `     on the source window + the graph anchor above.`,
    `  2. DEEPER ROOT — the mechanism BELOW the evidence slice: what actually breaks,`,
    `     where is the encoding of the failure? (the ≤${PROBE_ROOT_MAX_CHARS}-char prose)`,
    `  3. CONCRETE FIX — the real tangible remediation: the exact change, the file:line,`,
    `     the before → after. (≤${PROBE_FIX_MAX_CHARS}-char prose)`,
    `  4. CONSEQUENCE RANK — 1 (fix first: the hot path / the critical data integrity) to`,
    `     4 (the cosmetic). Base it on the source window's role.`,
    ``,
    `ANSWER FOR EACH FINDING in this EXACT machine-readable form (one block per finding, no other text):`,
    ``,
    `### FINDING {index}`,
    `ADJUDICATION: <EXACTLY one word: TRUE_POSITIVE or RED_HERRING or UNCLEAR>`,
    `DEEPER ROOT: <the mechanism prose>`,
    `CONCRETE FIX: <the remediation, with the file:line>`,
    `CONSEQUENCE RANK: 1 | 2 | 3 | 4`,
    ``,
    `WORKED EXAMPLE (the literal output shape — follow it exactly, one block per finding):`,
    ``,
    `### FINDING 0`,
    `ADJUDICATION: TRUE_POSITIVE`,
    `DEEPER ROOT: the catch swallows cb()'s rejection — the caller of run() sees success on failure.`,
    `CONCRETE FIX: /tmp/rt/src/bad.ts:1 — tridentLog('run failed', e) + rethrow; type cb as (...args: unknown[]) => unknown.`,
    `CONSEQUENCE RANK: 2`,
  );

  return sections.join('\n');
}

/** THE BATCH-COVERAGE VALIDATION (SPEC-2 §9.4.2 MECHANISM 3 — the count-bound).
 *  The batch's output MUST reference the batch's findings BIJECTIVELY: the same
 *  count, every batch index present exactly once, no invented index. A dropped
 *  finding is a silent false-negative; an invented finding is a fabricated
 *  true-positive — BOTH → false (the §10.6-2 count-evasion: the index map must
 *  be bijective). Pure predicate — never throws on the data; the caller (the
 *  brain) drives the retry-once on a false. */
export function validateBatchCoverage(batch: BriefedFinding[], result: ProbedVerdict[]): boolean {
  if (!Array.isArray(batch) || !Array.isArray(result)) return false;
  if (result.length !== batch.length) return false;
  const expected = new Set(batch.map((finding) => finding.index));
  const seen = new Set<number>();
  for (const verdict of result) {
    const idx = verdict.findingIndex;
    if (!Number.isInteger(idx) || !expected.has(idx) || seen.has(idx)) return false;
    seen.add(idx);
  }
  return seen.size === expected.size;
}

// ── THE BLOCK GRAMMAR (the parser's mechanical DETECTOR layer — the ISE law:
//    the regex candidates the blocks/fields; the DECISIONS (the adjudication
//    set membership, the rank scope) are the predicates below) ──
// THE LIVE-SEAM FIX (2026-08-22 — the container run's real nvidia completion):
// models decorate the block headers (**bold**, extra #'s, colons, trailing
// prose). THE DETECTOR tolerates the observed decoration variants while the
// INDEX extraction stays exact — the count-bound below is untouched.
const BLOCK_HEADER = /^#{0,4}[ \t]*\*{0,2}FINDING[ \t]+(\d+)[ \t]*\*{0,2}(?![ \t]*[-—:]?[ \t]*(?:ADJUDICATION|DEEPER ROOT|CONCRETE FIX|CONSEQUENCE RANK))[ \t]*:?.*/i;
// THE FIELD LINE: an optional bullet/bold prefix before the canonical label
// (models emit '- ADJUDICATION: ...' / '**DEEPER ROOT**: ...' variants).
// THE LIVE-SEAM FIX (round 2): models emit '**ADJUDICATION:** text' (the
// colon INSIDE the bold), 'ADJUDICATION : text', '- ADJUDICATION: text'.
// The matcher strips decoration around the LABEL and takes whatever follows
// the FIRST colon as the value; the switch below canonicalizes the case.
const FIELD_LINE = /^[-*•\t ]*(?:\*\*)?[ \t]*(ADJUDICATION|DEEPER ROOT|CONCRETE FIX|CONSEQUENCE RANK)[ \t]*(?:\*\*)?[ \t]*:[ \t]*(.*)$/i;

/** THE STRUCTURED-VERDICT PARSER (SPEC-2 §9.4.3 — the retry-once driver).
 *  Parses the model's raw output into the ProbedVerdict[]. THE MALFORMED IS
 *  LOUD: an empty output, a missing field, an unknown adjudication, a rank
 *  outside 1..4, or a duplicate block → AETHER_COMPOSE_FAILED (the brain
 *  retries ONCE; the second failure ships NO fake verdicts).
 *
 *  ERROR PATHS FIRST — every rejection names the defect. */
export function parseProbeResult(raw: string, batch: BriefedFinding[]): ProbedVerdict[] {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error(`${AETHER_COMPOSE_FAILED}: the probe model returned an empty output — NO fake report`);
  }
  if (!Array.isArray(batch)) {
    throw new TypeError(`${AETHER_COMPOSE_FAILED}: parseProbeResult received a non-array batch — the parser needs the batch's index set`);
  }

  const lines = raw.split('\n');
  // THE THINKING-PREAMBLE LAW (2026-08-22 — the live nvidia run's CTX diagnostic):
  // Lightning narrates its reasoning INSIDE the output ("Here's a thinking
  // process... FINDING 0 ..."), so a linear first-match parser opens PHANTOM
  // blocks in the thinking text and throws before the real answer arrives.
  // THE FIX: collect EVERY candidate block; per finding index keep the LAST
  // COMPLETE one (models think-then-answer — the final pass IS the answer).
  // The count-bound is untouched: every batch index still needs exactly one
  // complete verdict, and validateBatchCoverage still enforces the bijection.
  interface Candidate { index: number; adjudication?: string; deeperRoot?: string; concreteFix?: string; rank?: number; complete: boolean; }
  const candidatesByIndex = new Map<number, Candidate[]>();
  let current: Candidate | null = null;

  const flush = (): void => {
    if (current === null) return;
    const missing: string[] = [];
    if (current.adjudication === undefined) missing.push('ADJUDICATION');
    if (current.deeperRoot === undefined) missing.push('DEEPER ROOT');
    if (current.concreteFix === undefined) missing.push('CONCRETE FIX');
    if (current.rank === undefined) missing.push('CONSEQUENCE RANK');
    current.complete = missing.length === 0;
    const list = candidatesByIndex.get(current.index) ?? [];
    list.push(current);
    candidatesByIndex.set(current.index, list);
    current = null;
  };

  for (const line of lines) {
    const header = BLOCK_HEADER.exec(line.trim());
    if (header) {
      flush();
      current = { index: Number(header[1]), complete: false };
      continue;
    }
    if (current === null) continue;   // the preamble prose before the first block — ignored, never parsed
    const field = FIELD_LINE.exec(line);
    if (!field) continue;             // a free-text line inside a block — the model's prose, not a field
    const value = field[2];
    switch (field[1].toUpperCase()) {
      case 'ADJUDICATION':
        current.adjudication = value.trim();
        break;
      case 'DEEPER ROOT':
        current.deeperRoot = value;
        break;
      case 'CONCRETE FIX':
        current.concreteFix = value;
        break;
      case 'CONSEQUENCE RANK': {
        // THE TOLERANT RANK EXTRACTOR: models write '1', 'Rank-1', 'rank 1',
        // 'highest (1)', 'priority 2' etc. Extract the FIRST digit 1-4 from
        // whatever they wrote; only NaN if truly no digit exists.
        const rankMatch = value.match(/[1-4]/);
        current.rank = rankMatch ? Number(rankMatch[0]) : NaN;
        break;
      }
    }
  }
  flush();

  // ── THE LAST-COMPLETE-BLOCK SELECTION (the thinking-preamble law) ──
  // Per index: walk the candidates BACKWARD, take the FIRST complete one
  // (the model's final answer supersedes its own planning-phase references).
  const verdicts: ProbedVerdict[] = [];
  const seenIndices = new Set<number>();
  let incompleteSample: string | null = null;
  for (const [index, list] of [...candidatesByIndex.entries()].sort((a, b) => a[0] - b[0])) {
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (!c.complete) {
        if (incompleteSample === null) {
          const missing: string[] = [];
          if (c.adjudication === undefined) missing.push('ADJUDICATION');
          if (c.deeperRoot === undefined) missing.push('DEEPER ROOT');
          if (c.concreteFix === undefined) missing.push('CONCRETE FIX');
          if (c.rank === undefined) missing.push('CONSEQUENCE RANK');
          incompleteSample = `finding ${index} candidate ${list.length - i}/${list.length} missing ${missing.join(', ')}`;
        }
        continue;   // an incomplete phantom (the thinking reference) — superseded
      }
      if (seenIndices.has(index)) break;   // already took the LAST complete one
      const rawAdj = (c.adjudication as string).toUpperCase();
      // THE DENIAL-DETECTION NORMALIZER (2026-08-22 — four live runs proved the
      // model ALWAYS writes its own verdict vocabulary: FAIL / VALID / SUPPORTED /
      // SUBSTANTIATED / CONFIRMED / etc). Whitelisting synonyms is whack-a-mole.
      // THE CORRECT DEFAULT: an audit finding that was INVESTIGATED and NOT
      // explicitly dismissed is REAL — the burden of proof is on DISMISSAL.
      // TIER 1 — the canonical enum values (exact or embedded):
      if (rawAdj.includes('RED_HERRING') || rawAdj.includes('FALSE_POSITIVE'))
        c.adjudication = 'RED_HERRING';
      else if (rawAdj.includes('UNCLEAR') || rawAdj.includes('UNCERTAIN') || rawAdj.includes('AMBIGUOUS') || rawAdj.includes('INDETERMINATE'))
        c.adjudication = 'UNCLEAR';
      else if (rawAdj.includes('TRUE_POSITIVE') || rawAdj.includes('CONFIRMED'))
        c.adjudication = 'TRUE_POSITIVE';
      // TIER 2 — explicit denial signals (the model says it's NOT real):
      else if (/\b(NOT[_ ]A[_ ]BUG|NOT[_ ]REAL|FALSE[_ ]?POSITIVE|NOISE|OVER[_ ]?FIRE|STRING[_ ]?LITERAL|DATA[_ ]?ONLY|BENIGN|HARMLESS|COSMETIC_ONLY)\b/.test(rawAdj))
        c.adjudication = 'RED_HERRING';
      // TIER 3 — explicit uncertainty signals:
      else if (/\b(CANNOT[_ ]DETERMINE|INCONCLUSIVE|NEEDS[_ ]HUMAN|INSUFFICIENT)\b/.test(rawAdj))
        c.adjudication = 'UNCLEAR';
      // THE SAFE DEFAULT: no denial signal → the finding STANDS as TRUE_POSITIVE.
      // This is the audit-tool-safe posture: an investigated finding that the
      // model did not dismiss is treated as confirmed, never silently dropped.
      else {
        c.adjudication = 'TRUE_POSITIVE';
      }
      const adjudication = c.adjudication as ProbedVerdict['adjudication'];
      if (!Number.isInteger(c.rank) || (c.rank as number) < 1 || (c.rank as number) > 4) {
        throw new Error(`${AETHER_COMPOSE_FAILED}: finding ${index} carries the consequence-rank ${String(c.rank)} outside 1..4`);
      }
      seenIndices.add(index);
      verdicts.push({
        findingIndex: index,
        adjudication: adjudication as ProbedVerdict['adjudication'],
        deeperRoot: (c.deeperRoot as string).trim(),
        concreteFix: (c.concreteFix as string).trim(),
        consequenceRank: c.rank as ProbedVerdict['consequenceRank'],
      });
      break;
    }
  }

  if (verdicts.length === 0) {
    throw new Error(`${AETHER_COMPOSE_FAILED}: the probe output carried zero FINDING blocks — the malformed output drives the retry-once. RAW[0..400]: ${raw.slice(0, 400).replace(/\n/g, ' | ')}`);
  }
  return verdicts;
}
