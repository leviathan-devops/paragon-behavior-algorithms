// src/subagents/trident-auditor/conformance/spec-extractor.ts
// THE DECLARED-CONTRACT EXTRACTION (W9, K8.5, spec §4.7:2077 + §7.4.2).
//
// THE SPECIFY ACTOR'S SOURCE: the report_sections + findings rows become the
// declared contracts {findingId → {files, contract, acceptance}} the conformance
// checker audits against. The declared fix files are the auditor's fix-scope
// source — they live INSIDE report_sections.what_to_do (the ordered
// implementation steps) and how_to_fix (the exact change, file by file),
// embedded as path tokens with optional :line anchors. The spec §7.4.2's
// resolveDeclaredFixFiles pseudocode queries a `file` column that the real
// C18.4 schema does NOT have — the honest resolution is the TEXT EXTRACTION
// here (a W9 divergence recorded: the extractor pulls the path tokens out of
// the prose columns the schema DOES have, verified against the real db.ts DDL).

import type { SharedDbClient } from '../shared/shared-db-client.ts';

// ---------------------------------------------------------------------------
// THE CONTRACT SHAPE
// ---------------------------------------------------------------------------

/** A declared contract — the SPECIFY actor's output, the conformance checker's
 *  expected side of the declared-vs-implemented comparison (§4.8:2125-2135). */
export interface DeclaredContract {
  findingId: string;          // the finding the contract covers
  files: string[];            // the declared fix files (normalized, deduped)
  contract: string;           // the declared contract text (the what_violates quote + the anchor)
  acceptance: string;         // the checkable acceptance criterion (the how_to_fix/what_to_do)
}

// ---------------------------------------------------------------------------
// THE FILE-TOKEN EXTRACTION (the fix-files discovery)
// ---------------------------------------------------------------------------

/** A path-like token: a relative path segment chain ending in a source
 *  extension, optionally with a :line or :line-range suffix. The regex is the
 *  mechanical DETECTOR only — it finds the candidates; the decision (a token
 *  is a declared fix file) is the extension + path-prefix filter below. */
const FILE_TOKEN_RE =
  /((?:src|identity|test|tests|scripts|lib|packages|app|MASTER_CONTEXT|fixtures)\/[A-Za-z0-9_./-]*\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|json))(?::\d+(?:-\d+)?)?/g;

/** Strip the :line/:range suffix from a path token. */
export function stripLineSuffix(token: string): string {
  return token.replace(/:\d+(?:-\d+)?$/, '');
}

/** Normalize a path token for the declared-set comparison (the fix-scope's
 *  normalizeFixTarget convention — backslashes + dot segments + ./ prefix). */
export function normalizeContractFile(file: string): string {
  return file.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
}

/** THE FIX-FILES EXTRACTOR — pull the declared fix file paths out of the
 *  report's prose columns (what_to_do + how_to_fix). The :line anchors are
 *  stripped; the paths are normalized + deduped. Empty text → []. */
export function extractFixFilesFromText(...texts: Array<string | undefined>): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(FILE_TOKEN_RE)) {
      const token = m[0];
      if (!token) continue;
      const file = normalizeContractFile(stripLineSuffix(token));
      if (file.length > 0) found.add(file);
    }
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// THE SPECIFY EXTRACTION
// ---------------------------------------------------------------------------

/** Read the declared contracts for a run — the report_sections (the 6-part
 *  contract) + the findings (the rule/severity/evidence context). The contract
 *  files come from the what_to_do + how_to_fix text extraction. */
export function extractDeclaredContracts(client: SharedDbClient, runId: string): DeclaredContract[] {
  const sections = client.reportSections(runId);
  const findings = client.findings(runId);

  const findingById = new Map<string, { rule_id: string; severity: string; evidence: string }>();
  for (const f of findings) {
    const key = `${f.rule_id}:${f.file ?? ''}:${f.line ?? ''}`;
    // the report's finding_id convention (e.g. 'P6:src/x.ts:214' — the
    // report-writer test fixture) matches rule:file:line; the plain rule_id is
    // the fallback key.
    if (!findingById.has(f.rule_id)) findingById.set(f.rule_id, { rule_id: f.rule_id, severity: f.severity, evidence: f.evidence });
    if (!findingById.has(key)) findingById.set(key, { rule_id: f.rule_id, severity: f.severity, evidence: f.evidence });
  }

  return sections.map(s => {
    const files = extractFixFilesFromText(s.what_to_do, s.how_to_fix);
    const ctx = findingById.get(s.finding_id);
    const anchor = ctx ? `${ctx.rule_id} [${ctx.severity}]` : s.finding_id;
    return {
      findingId: s.finding_id,
      files,
      contract: `${s.what_violates}${s.what_violates.trim() ? ` (${anchor})` : ''}`,
      acceptance: s.how_to_fix,
    };
  });
}
