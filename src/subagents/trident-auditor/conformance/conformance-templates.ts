// src/subagents/trident-auditor/conformance/conformance-templates.ts
// THE 6TH FAMILY — THE CONFORMANCE SHAPES (W9, D10, spec §4.1:1705 family
// + §4.8:2125-2135).
//
// THE PREDICATE TEMPLATE LIBRARY (W4) has the 5 families (WIRING / CONTRACT /
// PROVENANCE / DOMAIN / PROCESS); the auditor adds the 6th: CONFORMANCE — the
// declared-vs-implemented shapes the conformance battery instantiates. Each
// template mirrors the compiled_predicates contract (family / template /
// messageTemplate / severity) so the shapes are consistent with the battery
// the bug-hunter compiles — the D16 boundary: the CONFORMANCE family is the
// auditor's OWN template surface, never an import of the bug-hunter's library.

/** The CONFORMANCE family id (the compiled_predicates.family canon, §4.1:1705). */
export const CONFORMANCE_FAMILY = 'CONFORMANCE' as const;
export type ConformanceFamily = typeof CONFORMANCE_FAMILY;

/** The 6th-family shape kinds — the three conformance checks the battery runs. */
export type ConformanceTemplateKind =
  | 'declared-fix-file-changed'     // the declared file's sha differs (before !== after)
  | 'declared-contract-satisfied'   // the contract's check now passes on the changed file
  | 'no-new-same-rule-violations';  // the battery re-run on the changed files finds no NEW
                                    // violations of the SAME rules (the regression check)

/** THE CONFORMANCE TEMPLATE — one shape of the 6th family. The shape is DATA
 *  (id/kind/severity/messageTemplate), never code — the checker instantiates
 *  the shapes against the actual diff (§4.8). */
export interface ConformanceTemplate {
  id: string;                       // 'conformance.declared-fix-file-changed'
  family: ConformanceFamily;        // 'CONFORMANCE'
  kind: ConformanceTemplateKind;
  severity: 'CRIT' | 'HIGH';
  messageTemplate: string;          // the evidence text the verdicts carry
}

/** THE CONFORMANCE FAMILY — the three shapes, ORDER-LOCKED (the battery runs
 *  them in this order). */
export const CONFORMANCE_TEMPLATES: readonly ConformanceTemplate[] = [
  {
    id: 'conformance.declared-fix-file-changed',
    family: CONFORMANCE_FAMILY,
    kind: 'declared-fix-file-changed',
    severity: 'CRIT',
    messageTemplate: 'the declared fix file changed (before_sha !== after_sha)',
  },
  {
    id: 'conformance.declared-contract-satisfied',
    family: CONFORMANCE_FAMILY,
    kind: 'declared-contract-satisfied',
    severity: 'CRIT',
    messageTemplate: 'the declared contract holds on the changed file (the predicate check passes)',
  },
  {
    id: 'conformance.no-new-same-rule-violations',
    family: CONFORMANCE_FAMILY,
    kind: 'no-new-same-rule-violations',
    severity: 'HIGH',
    messageTemplate: 'the battery re-run on the changed files reports zero NEW same-rule violations',
  },
];

/** The template lookup — the checker's instantiation source. */
export function conformanceTemplate(kind: ConformanceTemplateKind): ConformanceTemplate {
  const t = CONFORMANCE_TEMPLATES.find(x => x.kind === kind);
  if (!t) throw new Error(`CONFORMANCE_TEMPLATE_MISSING: no template for kind=${kind}`);
  return t;
}
