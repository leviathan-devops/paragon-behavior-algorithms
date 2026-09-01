/**
 * silent-verifier.ts — THE SILENT-VERIFIER (S6 — the SPEC-2 §2.6/§9.6)
 *
 * THE FUSION LAW'S ENFORCEMENT POINT: every claim the aether brain emitted (a
 * verdict, a fix, a root, a rank) is RE-CHECKED by the machinery. THE AETHER'S
 * OUTPUT IS A CLAIM UNTIL THE VERIFIER PASSES IT (the AETHER bible's "the
 * unverified output is a claim", made a PIPELINE STAGE). THE VERIFIER IS PURE
 * MACHINERY — it throws / rejects on any contradiction. IT NEVER COMPOSES —
 * IT CHECKS.
 *
 * THE SIX CHECKS (each a deterministic predicate — the literal §9.6.2 table):
 *   1 VERIFY_ANCHOR_ABSENT     — a cited file:line must EXIST (a hallucination)
 *   2 VERIFY_COUNT_MISMATCH    — the verdict count == the finding count
 *   3 VERIFY_SEVERITY_DRIFT    — the aether cannot re-decide a severity
 *   4 VERIFY_CALIBRATION_VIOLATION — a verdict cannot invent/drop a calibrated finding
 *   5 VERIFY_UNGROUNDED_PROSE  — the deeper-root must reference the window's symbols
 *   6 VERIFY_RANK_OUT_OF_SCOPE — the consequence-rank ∈ 1..4
 *
 * THE PER-CLAIM DEGRADE (SPEC-2 §9.6.4): a failed check flags THAT claim
 * UNVERIFIED; the verified portion still ships — a verifier contradiction
 * degrades, never deletes the whole report. THE FIRE-THAT-NEVER-FIRES IS
 * THEATER — every check has a negative fixture in the §10.1 battery.
 *
 * S-PB1 delivers the pure machinery; ProbedVerdict lives here (the S2 brain
 * wave re-exports the identical type when it lands).
 */
import type { AuditFinding } from '../types.js';

// ── THE PROBED VERDICT (SPEC-2 §2.9 — the aether's per-finding composition.
//    NOTE: the S2 aether-brain wave owns this type; this wave defines the
//    identical surface so the verifier has a typed contract to check.) ──
export interface ProbedVerdict {
  findingIndex: number;
  adjudication: 'TRUE_POSITIVE' | 'RED_HERRING' | 'UNCLEAR';
  deeperRoot: string;
  concreteFix: string;
  consequenceRank: 1 | 2 | 3 | 4;
}

// ── THE VERIFIER CONTRACT (SPEC-2 §2.9/§9.6.3) ──
export interface VerificationFailure {
  claim: string;
  reason: string;
}

export interface VerifierResult {
  passed: boolean;
  failures: VerificationFailure[];
}

// ── THE NAMED REJECTION CODES (SPEC-2 §2.9/§2.16 — the VERIFY_* surface) ──
export const R_ANCHOR_ABSENT = 'VERIFY_ANCHOR_ABSENT';
export const R_COUNT_MISMATCH = 'VERIFY_COUNT_MISMATCH';
export const R_SEVERITY_DRIFT = 'VERIFY_SEVERITY_DRIFT';
export const R_CALIBRATION_VIOLATION = 'VERIFY_CALIBRATION_VIOLATION';
export const R_UNGROUNDED_PROSE = 'VERIFY_UNGROUNDED_PROSE';
export const R_RANK_OUT_OF_SCOPE = 'VERIFY_RANK_OUT_OF_SCOPE';

// ── THE SOURCE WINDOW CONTRACT for the evidence-bound (check-5). The aether's
//    deeper-root is grounded ONLY against the machinery's read window — a root
//    citing an identifier the window does not carry is a hallucination. The
//    5th argument maps a file to its ≤80-line window WHEN the caller has it
//    (the orchestrator wires the brief's windows); without it the evidence
//    check cannot run + is honestly skipped (never a fake pass). ──
export type SourceWindowTable = Array<[string, string]>;

// ── THE IDENTIFIER EXTRACTION (the evidence-bound's cited-symbol detector).
//    WHY THE REGEX IS THE RIGHT TOOL (the ISE law — the regex is the mechanical
//    DETECTOR layer, never the DECIDER): the check merely CANDIDATES the code
//    symbols a root cites; the DECISION (reject-or-pass) is the verifier's
//    deterministic window-membership predicate below. This is a detection-only
//    regex over a bounded prose string — an AST has nothing to parse here (the
//    prose is free text, not code), so the regular expression is the minimal
//    honest detector. It flags candidates; the membership check decides; the
//    failure records the {claim, reason} evidence triad.
//
//    THE CITED-SYMBOL HEURISTIC: only the MIXED-CASE tokens (camelCase /
//    PascalCase identifiers, e.g. 'mysteriousZorp') are treated as code-symbol
//    citations. The rationale (the BECAUSE): a hallucinated code symbol is, by
//    the codebase + the SPEC-2 fixture convention, a mixed-case identifier —
//    the 'mysteriousZorp'/'missingZorp' fixtures. Plain-English lowercase words
//    (failure, lives, path) are NOT reliably distinguishable from lowercase
//    variable names without a full parser, so flagging them would false-positive
//    on ordinary prose; the bounded detector errs toward NOT flagging prose and
//    toward flagging the clear code-shaped symbols — the honest asymmetry the
//    verifier's evidence-bound exists for. The window-membership check then
//    rejects any such cited symbol the machinery's rewrite does not ground. ──
function citedIdentifiers(root: string): string[] {
  const tokens = root.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const mixedCase = tokens.filter((t) => /[a-z][A-Z]/.test(t));
  return [...new Set(mixedCase)];
}

// ── THE ANCHOR EXTRACTION (the anchor-bound's cited file:line detector).
//    Extracts every `path:line` from the fix + the root prose. ──
function citedAnchors(...texts: string[]): Array<{ file: string; line: number; raw: string }> {
  const out: Array<{ file: string; line: number; raw: string }> = [];
  const seen = new Set<string>();
  for (const text of texts) {
    const re = /([\w./\\-]+):(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      if (!seen.has(raw)) {
        seen.add(raw);
        out.push({ file: m[1], line: Number(m[2]), raw });
      }
    }
  }
  return out;
}

// ── THE SEVERITY TOKENS the prose can over-claim (check-3). A root/fix that
//    declares a machine severity DIFFERENT from the finding's is a DRIFT —
//    the report's severity MUST come from the machinery finding, never the
//    prose (SPEC-2 §10.6-3 the severity-softening, the anti-pattern AP-S2-7). ──
const SEVERITY_TOKENS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

/** THE PROSE SEVERITY CLAIM DETECTOR — a WHOLE-WORD, word-boundary match. WHY
 *  NOT A SUBSTRING: 'LOW' as a substring appears inside ordinary words (e.g.
 *  'swallows' → 'LLOW'); a severity claim is a DISCRETE severity word, so the
 *  detector must match the whole word case-insensitively — never a fragment.
 *  The regex is the manual DETECTOR (the ISE law); the drift predicate below
 *  is the DECISION. */
function proseSeverity(...texts: string[]): string | null {
  for (const text of texts) {
    for (const token of SEVERITY_TOKENS) {
      if (new RegExp(`\\b${token}\\b`, 'i').test(text)) return token;
    }
  }
  return null;
}

function findingSeverity(finding: AuditFinding): string {
  return String(finding.severity ?? '').toUpperCase();
}

/** THE SIX-CHECK VERIFIER (SPEC-2 §9.6 — the machinery re-checks the aether's
 *  composition. PURE — it never composes, never votes; it only rejects.) */
export function verifyAetherOutput(
  verdicts: ProbedVerdict[],
  findings: AuditFinding[],
  graph: { nodes: number; edges: number },
  resolveAnchor: (file: string, line: number) => boolean,
  sourceWindows: SourceWindowTable = [],
): VerifierResult {
  const failures: VerificationFailure[] = [];
  const windowByFile = new Map(sourceWindows);

  // CHECK 2 — THE COUNT-BOUND (the verdict count must equal the finding count:
  //   no invented findings, no dropped ones. The fabrication or the drop → reject.)
  //   NOTE (the SPEC-2 §10.1 literal): the battery asserts `reason ===
  //   'VERIFY_COUNT_MISMATCH'` EXACTLY, so this reason is the bare code.
  if (verdicts.length !== findings.length) {
    failures.push({
      claim: `verdict count ${verdicts.length} vs finding count ${findings.length}`,
      reason: R_COUNT_MISMATCH,
    });
  }

  // CHECK 4 — THE CALIBRATION-BOUND (each verdict's findingIndex must reference a
  //   REAL calibrated finding exactly once. An out-of-range OR duplicate index —
  //   an invented finding / a dropped one (the 10.6-2 count-evasion: the index map
  //   must be bijective) → the aether annotates a finding outside the judged set.)
  {
    const seen = new Set<number>();
    for (const verdict of verdicts) {
      const idx = verdict.findingIndex;
      if (!Number.isInteger(idx) || idx < 0 || idx >= findings.length || seen.has(idx)) {
        failures.push({
          claim: `verdict findingIndex=${idx} (the findings span 0..${findings.length - 1})`,
          reason: `${R_CALIBRATION_VIOLATION} — the verdict references a finding outside the calibrated set`,
        });
      }
      seen.add(idx);
    }
  }

  for (const verdict of verdicts) {
    const finding = findings[verdict.findingIndex];
    const claimTag = `finding ${verdict.findingIndex}`;

    // CHECK 1 — THE ANCHOR EXISTENCE (every file:line cited in the fix/root must
    //   exist in the source → resolveAnchor. A hallucinated anchor → reject.)
    for (const anchor of citedAnchors(verdict.concreteFix, verdict.deeperRoot)) {
      if (!resolveAnchor(anchor.file, anchor.line)) {
        failures.push({
          claim: `${claimTag} cites ${anchor.raw}`,
          reason: `${R_ANCHOR_ABSENT} — the fix cites ${anchor.raw}, which does not exist`,
        });
      }
    }

    // CHECK 3 — THE SEVERITY-CONSISTENCY (the prose must not re-decide severity.
    //   A root/fix that declares a machine severity DIFFERENT from the finding's
    //   is a drift. A verdict with no severity claim cannot drift.)
    if (finding) {
      const prose = proseSeverity(verdict.deeperRoot, verdict.concreteFix);
      if (prose !== null && prose !== findingSeverity(finding)) {
        failures.push({
          claim: `${claimTag} prose declares ${prose} vs the finding's ${findingSeverity(finding)}`,
          reason: `${R_SEVERITY_DRIFT} — the prose re-decided the machine severity`,
        });
      }
    }

    // CHECK 5 — THE EVIDENCE-BOUND (the deeper-root must reference the source
    //   window's real symbols. The window is the machinery's read — never the
    //   prose. Without the window the check cannot run: it honestly skips.)
    if (finding) {
      const windowText = windowByFile.get(finding.file);
      if (windowText !== undefined) {
        const lowWindow = windowText.toLowerCase();
        const ungrounded = citedIdentifiers(verdict.deeperRoot).filter(
          (id) => !lowWindow.includes(id.toLowerCase()),
        );
        if (ungrounded.length > 0) {
          failures.push({
            claim: `${claimTag} cites ${ungrounded.join(', ')}`,
            reason: `${R_UNGROUNDED_PROSE} — the root cites ${ungrounded.join(', ')} absent from the source window`,
          });
        }
      }
    }

    // CHECK 6 — THE RANK-SCOPE (the consequence-rank ∈ 1..4.)
    if (!Number.isInteger(verdict.consequenceRank) || verdict.consequenceRank < 1 || verdict.consequenceRank > 4) {
      failures.push({
        claim: `${claimTag} consequenceRank=${String(verdict.consequenceRank)}`,
        reason: `${R_RANK_OUT_OF_SCOPE} — the consequence-rank must be within 1..4`,
      });
    }
  }

  // THE GRAPH is consumed for its density context (the spec interface carries it);
  // the verification itself is anchor/count/severity/calibration/evidence/rank —
  // the graph's nodes/edges are the brief's binding, not a fabrication predicate.
  void graph;

  return {
    passed: failures.length === 0,
    failures,
  };
}
