// src/subagents/trident-auditor/conformance/checker.ts
// THE DECLARED-VS-IMPLEMENTED DIFF RUNNER (W9, spec §4.8:2108-2135, D38).
//
// THE CONFORMANCE BATTERY — the 6th family instantiated against the diff. The
// ternary verdicts (the ONLY canon the store accepts — W1 throws verdictInvalid
// on anything else):
//   CONFORMANT — the declared fix file changed (sha differs) AND the contract's
//                check passes on the file AND no same-rule regressions (§4.8).
//   PARTIAL    — the fix file changed but the contract is only partially
//                satisfied (an edge case unmet — the auditor fixes it or flags it).
//   VIOLATED   — the declared fix is absent (before_sha === after_sha — the
//                claimed-but-not-fixed class) OR the predicate still fires OR a
//                same-rule regression appears. BLOCKS the clear (D25).
//
// THE ZERO-TRUST (R10.3): the `claim` column is NEVER read — the before/after
// sha pair is the mechanical truth, the only evidence. The no-new-same-rule-
// violations check is a REAL battery re-run over the changed files' content
// (the rules re-execute against the post-fix content) — never a string
// comparison of verdict rows.
//
// THE FIXED_BY CANON: 'trident_build' (the build agent's implementation) vs
// 'trident_auditor' (the auditor's own surgical fix completing a PARTIAL) —
// the fixedBy distinction the conformance_verdicts table carries (db.ts).

import type { ConformanceVerdict, ConformanceVerdictInput } from '../../../shared/knowledge-graph/db.ts';
import { auditDiffRow } from '../firewall/red-team.ts';
import type { SharedDbClient } from '../shared/shared-db-client.ts';
import type { ImplementationRow } from '../shared/shared-db-client.ts';
import type { DeclaredContract } from './spec-extractor.ts';
import { conformanceTemplate } from './conformance-templates.ts';

// ---------------------------------------------------------------------------
// THE PROBE INTERFACES — the checker's injectable seams. The checker itself is
// pure (no fs, no battery): the VERIFY actor supplies the real content reader
// + the real predicate re-run. The tests inject deterministic probes.
// ---------------------------------------------------------------------------

/** Read the post-fix content of a file (the battery re-run's input). */
export type ContentReader = (file: string) => string;

/** A predicate re-run: does the SAME rule still fire on the changed file?
 *  Returns the firing rule ids (empty = the rule is satisfied on the change).
 *  THE REAL BATTERY RE-RUN — never a string comparison of verdict rows. */
export type RuleFireCheck = (file: string, content: string) => string[];

/** The contract-satisfaction check: does the declared contract hold on the
 *  changed content? (the acceptance criterion — a partial change is PARTIAL). */
export type ContractAcceptance = (contract: DeclaredContract, content: string) => boolean;

// ---------------------------------------------------------------------------
// THE CHECKER
// ---------------------------------------------------------------------------

export interface ConformanceCheckOptions {
  /** The content reader (default: a stub returning '' — the VERIFY actor
   *  supplies the real fs read). */
  readContent?: ContentReader;
  /** The battery re-run over the changed files (default: no regressions —
   *  the VERIFY actor supplies the real battery). */
  ruleFireCheck?: RuleFireCheck;
  /** The contract acceptance (default: the contract text is present in the
   *  changed content — a strict oracle-free check). */
  contractAcceptance?: ContractAcceptance;
  /** The verdict writer — who produced the change (default 'trident_build'). */
  fixedBy?: 'trident_build' | 'trident_auditor';
}

export interface ConformanceResult {
  verdicts: ConformanceVerdictInput[];
  conformanceZero: boolean;   // count(*) of non-CONFORMANT === 0 (§4.8:2135, D25)
}

/** THE CONFORMANCE VERDICT ROW (a returned verdict — for the machine's REPORT
 *  actor + the tests). The evidence + the fixedBy ride it. */
export interface ConformanceVerdictRow {
  findingId: string;
  verdict: ConformanceVerdict;
  evidence: string;
  fixedBy: 'trident_build' | 'trident_auditor';
}

/** THE TERNARY VERDICT DECIDER — one contract vs its implementation row(s). */
export function decideVerdict(
  contract: DeclaredContract,
  impl: ImplementationRow,
  options: ConformanceCheckOptions,
): ConformanceVerdictRow {
  const fixedBy = options.fixedBy ?? 'trident_build';
  const readContent = options.readContent ?? (() => '');
  const ruleFireCheck = options.ruleFireCheck ?? (() => []);
  const contractAcceptance = options.contractAcceptance
    ?? ((c: DeclaredContract, content: string) => content.includes(c.contract));

  // THE ZERO-TRUST CORE (R10.3): the sha pair is the ONLY evidence — the claim
  // is never read. before_sha === after_sha → the claimed-but-not-fixed class.
  const { verdict: diffClass, evidence: diffEvidence } = auditDiffRow(impl.file, impl.before_sha, impl.after_sha);
  if (diffClass === 'CLAIMED_BUT_NOT_FIXED') {
    return {
      findingId: contract.findingId,
      verdict: 'VIOLATED',
      evidence: `${conformanceTemplate('declared-fix-file-changed').messageTemplate} — ${diffEvidence}`,
      fixedBy,
    };
  }

  // THE FILE CHANGED — now the contract + the regression checks on the post-fix
  // content (the changed file's CURRENT content, read through the injectable
  // reader — the real battery re-run, never a string comparison).
  const content = readContent(impl.file);

  // THE NO-NEW-SAME-RULE-VIOLATIONS check: the battery re-runs on the changed
  // file; the SAME rules that fired in the hunt must now be silent. A still-
  // firing rule → VIOLATED (the predicate still fires, §4.8).
  const stillFiring = ruleFireCheck(impl.file, content);
  if (stillFiring.length > 0) {
    return {
      findingId: contract.findingId,
      verdict: 'VIOLATED',
      evidence: `${conformanceTemplate('no-new-same-rule-violations').messageTemplate} — the rule(s) ${stillFiring.join(', ')} still fire on ${impl.file}`,
      fixedBy,
    };
  }

  // THE CONTRACT ACCEPTANCE — the declared contract must hold on the change.
  const satisfied = contractAcceptance(contract, content);
  if (!satisfied) {
    return {
      findingId: contract.findingId,
      verdict: 'PARTIAL',
      evidence: `the fix file ${impl.file} changed but the declared contract is only partially satisfied (${contract.findingId})`,
      fixedBy,
    };
  }

  return {
    findingId: contract.findingId,
    verdict: 'CONFORMANT',
    evidence: `the declared fix file changed (${impl.file} ${impl.before_sha} -> ${impl.after_sha}) + the declared contract holds + zero same-rule regressions`,
    fixedBy,
  };
}

/** THE CONFORMANCE BATTERY — run the declared-vs-implemented diff runner over
 *  every declared contract + its implementation rows. Every contract whose
 *  declared files have NO implementation row is VIOLATED (the declared fix is
 *  absent — the build agent never touched it). */
export function runConformance(
  contracts: DeclaredContract[],
  implementations: ImplementationRow[],
  options: ConformanceCheckOptions = {},
): ConformanceResult {
  const byFile = new Map<string, ImplementationRow>();
  for (const impl of implementations) {
    const key = impl.file.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!byFile.has(key)) byFile.set(key, impl);
  }

  const verdicts: ConformanceVerdictInput[] = [];
  const rows: ConformanceVerdictRow[] = [];

  for (const contract of contracts) {
    if (contract.files.length === 0) {
      // a contract without a declared fix file cannot be audited — VIOLATED
      // (the report declared no file, so the fix is definitionally absent).
      rows.push({
        findingId: contract.findingId,
        verdict: 'VIOLATED',
        evidence: `no declared fix file for ${contract.findingId} — the contract is unauditable`,
        fixedBy: options.fixedBy ?? 'trident_build',
      });
      continue;
    }
    const impls = contract.files
      .map(f => byFile.get(f.replace(/\\/g, '/').replace(/^\.\//, '')))
      .filter((i): i is ImplementationRow => i !== undefined);

    if (impls.length === 0) {
      rows.push({
        findingId: contract.findingId,
        verdict: 'VIOLATED',
        evidence: `the declared fix files [${contract.files.join(', ')}] have NO implementation row — the build agent never touched them`,
        fixedBy: options.fixedBy ?? 'trident_build',
      });
      continue;
    }

    // a contract with MULTIPLE declared files: the strictest verdict wins
    // (any VIOLATED → VIOLATED; else any PARTIAL → PARTIAL; else CONFORMANT).
    let worst: ConformanceVerdictRow | null = null;
    for (const impl of impls) {
      const row = decideVerdict(contract, impl, options);
      if (!worst || rank(row.verdict) > rank(worst.verdict)) worst = row;
    }
    if (worst) rows.push(worst);
  }

  for (const r of rows) {
    verdicts.push({ findingId: r.findingId, verdict: r.verdict, evidence: r.evidence, fixedBy: r.fixedBy });
  }

  return { verdicts, conformanceZero: rows.every(r => r.verdict === 'CONFORMANT') };
}

/**
 * THE VERDICT SEVERITY BANDS — the strictest-verdict-wins rule (§4.8: a
 * multi-file fix is CONFORMANT only when EVERY declared file conforms; a single
 * VIOLATED file must block the clear — D25). THE CALIBRATION (the D38 law):
 * the bands encode the enforcement semantics — VIOLATED blocks the LOGIC-LSP
 * clear, PARTIAL lets the auditor surgically complete the miss, CONFORMANT
 * contributes toward zero (§4.8:2127-2133). The band is a documented ordinal,
 * never a magic ladder: the strictest verdict is max(severity band) across the
 * contract's declared files.
 */
const VERDICT_SEVERITY_BANDS: Record<ConformanceVerdict, number> = {
  CONFORMANT: 0,   // contributes toward zero
  PARTIAL: 1,      // the auditor fixes it or flags it
  VIOLATED: 2,     // blocks the clear — the LOGIC-LSP stays active
};

function rank(v: ConformanceVerdict): number {
  const band = VERDICT_SEVERITY_BANDS[v];
  return band === undefined ? VERDICT_SEVERITY_BANDS.VIOLATED : band;
}

/** THE CONFORMANCE REPORT ACTOR'S WRITE — append the verdict rows through the
 *  shared client (W1's store validates the ternary — verdictInvalid otherwise).
 *  Returns the conformanceZero + the count. */
export function persistVerdicts(
  client: SharedDbClient,
  runId: string,
  rows: ConformanceVerdictRow[],
): { count: number; conformanceZero: boolean } {
  for (const r of rows) {
    client.appendConformanceVerdict({
      findingId: r.findingId,
      verdict: r.verdict,
      evidence: r.evidence,
      fixedBy: r.fixedBy,
    }, runId);
  }
  return { count: rows.length, conformanceZero: rows.every(r => r.verdict === 'CONFORMANT') };
}
