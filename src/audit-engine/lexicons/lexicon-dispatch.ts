/**
 * lexicon-dispatch.ts — THE LEXICON DISPATCH MAP (the W3 integration)
 *
 * THE LAYER → PATTERNS MAP: the lexicon-backed layers (R2/R3/R11/R2/R5/R1)
 * dispatch through the PatternFamily battery — the matchers FLAG, the machine
 * DECIDES (the ISE law). THE DUAL-LAYERED: the tool's OWN detectors are the
 * same PatternFamilies.
 */
import { PatternFamily, AnalysisContext, runBattery, LexiconFinding } from './audit-lexicons.ts';
import { FOUNDING_PATTERNS } from './audit-lexicon-inventory.ts';

// THE LAYER → PATTERN MAP (the R-layer id → its lexicon patterns)
export const FOUNDING_LEXICON_MAP: Record<string, PatternFamily[]> = {
  'R2': FOUNDING_PATTERNS.filter((p) => p.id.startsWith('r2.')),
  'R8': FOUNDING_PATTERNS.filter((p) => p.id.startsWith('r3.')), // R3 async hijack fix: moved hygiene lexicon to R8 to free R3 for async correctness hand-rolled
  // THE BUG-3 FIX (2026-08-20 — the container red-team caught it): R11 AND R5
  // were BOTH mapped to the same r5.* patterns AND both are registered enabled
  // layers — the theatrical lexicon batteries ran TWICE, so every fake-return /
  // always-pass finding was duplicated (the container audit showed R11 r5.fake-
  // return + R5 r5.fake-return for the SAME bad.ts:6). THE canonical theatrical
  // lexicon layer is R5 (the "Theatrical Integrity (D1-D10)" layer). R11 keeps
  // its OWN hand-rolled evaluate (r11-theatrical-integrity.ts:515) — which the
  // lexicon path was previously BYPASSING via the early return. Collapsed: only
  // R5 runs the r5.* battery.
  'R5': FOUNDING_PATTERNS.filter((p) => p.id.startsWith('r5.')),
  'R4': FOUNDING_PATTERNS.filter((p) => p.id.startsWith('r4.')),
  'R1': FOUNDING_PATTERNS.filter((p) => p.id.startsWith('r1.')),
};

// THE ANALYSIS-CONTEXT BRIDGE — the audit's AnalysisContext → the lexicon's AnalysisContext
export function toLexiconContext(ctx: {
  checker: unknown | null;
  callGraph: { totalCallSites: number; coveragePercent: number };
  projectContext?: { gatedLayers: string[]; isPlugin: boolean };
}): AnalysisContext {
  return {
    checker: ctx.checker,
    callGraph: ctx.callGraph,
    projectContext: ctx.projectContext,
  };
}

export { runBattery };
export type { LexiconFinding };
