// actuation/warhead-templates.ts — THE ADAPTIVE WARHEAD LIBRARY (port)
// Ported from Trident_Agent/Active_Projects/v4.4.2-baseline/src/v2/enforcement/warhead-templates.ts
// byte-identical machinery, family union bound to this tree (core/types ViolationFamily).
import type { ViolationFamily } from '../core/types.js';
export type MacroIntent =
  | 'VERIFICATION_AVOIDANCE'
  | 'FABRICATION'
  | 'THEATRICAL_COMPLETION'
  | 'SCOPE_REDUCTION'
  | 'DOUBT_PARALYSIS'
  | 'PERMISSION_SEEKING';
export const META_LEXICON: Record<ViolationFamily, MacroIntent> = {
  TEST_EVASION: 'VERIFICATION_AVOIDANCE',
  FORGERY_INTENT: 'FABRICATION',
  THEATRICAL_PLANNING: 'THEATRICAL_COMPLETION',
  SCOPE_SHRINK: 'SCOPE_REDUCTION',
  DOUBT_HEDGE: 'DOUBT_PARALYSIS',
  PERMISSION_GATE: 'PERMISSION_SEEKING',
  RISK_LIMIT: 'VERIFICATION_AVOIDANCE',
  STOP_LOSS: 'VERIFICATION_AVOIDANCE',
  DISCLOSURE: 'VERIFICATION_AVOIDANCE',
  STOP_LOSS_EVASION: 'VERIFICATION_AVOIDANCE',
  CLAIM: 'FABRICATION',
  COMPLIANCE: 'VERIFICATION_AVOIDANCE',
  FOLLOWUP: 'VERIFICATION_AVOIDANCE',
  CLAIM_FABRICATION: 'FABRICATION',
  COMPLIANCE_BREACH: 'FABRICATION',
  FOLLOWUP_EVASION: 'VERIFICATION_AVOIDANCE',
  RISK: 'VERIFICATION_AVOIDANCE',
};
export interface AdaptiveWarheadTemplate {
  macroIntent: MacroIntent;
  tier: 1 | 2 | 3 | 4;
  severity: 'ADVISORY' | 'ESCALATED' | 'DENIAL' | 'MANDATE';
  fillFields: string[];
  template: string;
}
export const TEMPLATES: AdaptiveWarheadTemplate[] = [
  {
    macroIntent: 'VERIFICATION_AVOIDANCE', tier: 1, severity: 'ADVISORY',
    fillFields: ['count', 'excerpt'],
    template: '⚠ Your reasoning describes verification work you intend to do later instead of doing now. This pattern has fired {count} times this session.\n\nThe matched excerpt: "{excerpt}"\n\nREQUIRED: Run the actual verification you are describing. Use your tool to execute the test, check, or validation. Cite the output before continuing.\n\nIf your current task genuinely does not involve verification, state so explicitly and continue.',
  },
  {
    macroIntent: 'VERIFICATION_AVOIDANCE', tier: 2, severity: 'ESCALATED',
    fillFields: ['count', 'excerpt', 'instrument'],
    template: '⛔ ENFORCEMENT ESCALATION — TIER 2\n\nYour previous turn was flagged for test-evasion ("{excerpt}"). You did not run the verification. The pattern is sustaining.\n\nREQUIRED: Call {instrument} now. This tool is never blocked. After it returns, cite its output.\n\nYour non-instrument tool calls will be blocked at tier 3.',
  },
  {
    macroIntent: 'VERIFICATION_AVOIDANCE', tier: 3, severity: 'DENIAL',
    fillFields: ['count', 'excerpt', 'instrument'],
    template: '⛔ TOOL BLOCKED — TIER 3\n\nYour tool call has been blocked. Your reasoning has matched test-evasion ("{excerpt}") for {count} turns without running the demanded verification.\n\nWHY: Your reasoning described verification work you were not performing. The enforcement escalated to prevent unverified output from shipping.\n\nTO UNBLOCK: Call {instrument}. This tool passes at every tier. After it succeeds, your tier resets to 0 and your tools unblock automatically.\n\nYou may also use: read, grep, glob (these are never blocked).',
  },
  {
    macroIntent: 'VERIFICATION_AVOIDANCE', tier: 4, severity: 'MANDATE',
    fillFields: ['count', 'instrument'],
    template: '⛔ SOLVE-MANDATE — TIER 4\n\nAll generic tools are blocked. Your reasoning has matched test-evasion for an extended period without compliance.\n\nTO CONTINUE: Call {instrument}. This tool passes at every tier. After it succeeds, your tier resets to 0 and your tools unblock automatically.\n\nYou may also use: trident-problem-solving, read, grep, glob.',
  },
  {
    macroIntent: 'FABRICATION', tier: 1, severity: 'ADVISORY',
    fillFields: ['count', 'excerpt'],
    template: '⚠ Your reasoning contains a pattern matching fabrication — describing or planning to produce results without running the work that produces them. This has fired {count} times.\n\nThe matched excerpt: "{excerpt}"\n\nREQUIRED: Run the actual work. Produce the actual result. Cite the tool output. Do not describe results you have not produced.',
  },
  {
    macroIntent: 'FABRICATION', tier: 2, severity: 'ESCALATED',
    fillFields: ['count', 'excerpt'],
    template: '⛔ ENFORCEMENT ESCALATION — FABRICATION AT TIER 2\n\nYour previous turn contained fabrication-pattern reasoning ("{excerpt}"). You did not produce the actual result.\n\nFABRICATION is the highest-severity detection: an unevidenced claim presented as fact is indistinguishable from a lie.\n\nREQUIRED: Produce the actual result. Show the tool output. If you cannot, state that explicitly — do not describe what the result would look like.',
  },
  {
    macroIntent: 'FABRICATION', tier: 3, severity: 'DENIAL',
    fillFields: ['count', 'excerpt'],
    template: '⛔ TOOL BLOCKED — FABRICATION DETECTED\n\nYour tool call has been blocked. Your reasoning has matched fabrication ("{excerpt}") for {count} turns without producing the actual result.\n\nWHY: Claims without evidence are indistinguishable from deception. The enforcement requires the actual artifact.\n\nTO UNBLOCK: Produce the actual result via your tools. Cite the output. Your tools unblock when the evidence exists.',
  },
  {
    macroIntent: 'FABRICATION', tier: 4, severity: 'MANDATE',
    fillFields: ['count', 'instrument'],
    template: '⛔ SOLVE-MANDATE — FABRICATION AT TIER 4\n\nAll generic tools are blocked. Fabrication-pattern reasoning has sustained for {count} turns without producing evidence.\n\nTO CONTINUE: Use trident-problem-solving to diagnose why you cannot produce the evidence. This tool passes at every tier.',
  },
  {
    macroIntent: 'THEATRICAL_COMPLETION', tier: 1, severity: 'ADVISORY',
    fillFields: ['count', 'excerpt'],
    template: '⚠ Your reasoning describes completion you have not verified — declaring or\nplanning to declare work as done without the evidence that proves it. This\nhas fired {count} times.\n\nThe matched excerpt: "{excerpt}"\n\nREQUIRED: Run the verification that would prove the completion. Show the\ntool output. Do not describe the completion — demonstrate it.\n\nWHAT THIS DETECTS: The pattern where you narrate the end state ("the build\nis done", "the system works") without running the tests, the build, or the\nprobe that would prove it. The narration is not the evidence — the tool\nresult is.\n\nIF YOUR WORK IS GENUINELY COMPLETE: Run the verification that proves it.\nThe completion claim becomes valid when the evidence exists.',
  },
  {
    macroIntent: 'THEATRICAL_COMPLETION', tier: 2, severity: 'ESCALATED',
    fillFields: ['count', 'excerpt', 'instrument'],
    template: '⛔ ENFORCEMENT ESCALATION — THEATRICAL COMPLETION AT TIER 2\n\nYour previous turn described completion without evidence ("{excerpt}").\nThe pattern is sustaining. An unevidenced completion claim is\nindistinguishable from a false report.\n\nREQUIRED: Run the verification that proves the completion. Cite the tool\nresult. Until you do, your non-instrument tool calls will be blocked at\ntier 3.\n\nWHAT THIS DETECTS: You described the end state without the evidence. The\nsystem escalated because the pattern is continuing, not diminishing.\n\nTHE INSTRUMENT: {instrument} is the demanded verification. It is never\nblocked. After it succeeds, your tier resets to 0.',
  },
  {
    macroIntent: 'THEATRICAL_COMPLETION', tier: 3, severity: 'DENIAL',
    fillFields: ['count', 'excerpt', 'instrument'],
    template: '⛔ TOOL BLOCKED — THEATRICAL COMPLETION DETECTED\n\nYour tool call has been blocked. Your reasoning has described completion\n("{excerpt}") for {count} turns without the evidence that proves it.\n\nWHY: An unevidenced completion claim is the theatrical class — the output\nlooks done but the verification is absent. The enforcement prevents\nunverified claims from becoming the basis for further work.\n\nTO UNBLOCK: Run the verification. Cite the output. Your tools unblock\nwhen the evidence exists.\n\nTHE ALWAYS-AVAILABLE: read, grep, glob — these pass at every tier.',
  },
  {
    macroIntent: 'THEATRICAL_COMPLETION', tier: 4, severity: 'MANDATE',
    fillFields: ['count', 'instrument'],
    template: '⛔ SOLVE-MANDATE — THEATRICAL COMPLETION AT TIER 4\n\nAll generic tools are blocked. Completion-pattern reasoning has sustained\nwithout evidence for an extended period.\n\nWHY: The enforcement held the mandate because the model did not comply\nwith the demanded verification. The tier stays at 4 until the instrument\nis called and succeeds.\n\nTO CONTINUE: Use trident-problem-solving to produce the verification.\nThis tool passes at every tier. After it completes, your tier resets to 0.',
  },
  {
    macroIntent: 'SCOPE_REDUCTION', tier: 1, severity: 'ADVISORY',
    fillFields: ['count', 'excerpt'],
    template: '⚠ Your reasoning is shrinking the scope of the work — describing a reduced\nversion of what was asked instead of decomposing and executing the full\nscope. This has fired {count} times.\n\nThe matched excerpt: "{excerpt}"\n\nREQUIRED: Decompose the full scope into waves and execute the first wave.\nThe scope is the operator\'s — never yours to reduce. If the scope genuinely\ncannot be executed as stated, state WHY and propose the decomposition — do\nnot silently shrink.',
  },
  {
    macroIntent: 'SCOPE_REDUCTION', tier: 2, severity: 'ESCALATED',
    fillFields: ['count', 'excerpt'],
    template: '⛔ ENFORCEMENT ESCALATION — SCOPE REDUCTION AT TIER 2\n\nYour previous turn contained scope-shrink reasoning ("{excerpt}"). The\npattern is sustaining. The operator\'s scope is not yours to reduce.\n\nREQUIRED: Decompose the full scope. Start the first wave. If the scope is\ngenuinely impossible, state the specific constraint — not "too ambitious"\nor "iterate later." The constraint must be mechanical (a missing dependency,\na hardware limit), not a confidence assessment.',
  },
  {
    macroIntent: 'SCOPE_REDUCTION', tier: 3, severity: 'DENIAL',
    fillFields: ['count', 'excerpt', 'instrument'],
    template: '⛔ TOOL BLOCKED — SCOPE REDUCTION DETECTED\n\nYour tool call has been blocked. Your reasoning has described scope\nreduction ("{excerpt}") for {count} turns without executing the full scope.\n\nWHY: Scope reduction is the most common derailment for autonomous agents —\nthe agent contracts the work to fit its confidence instead of expanding its\nexecution to fit the scope. The enforcement prevents the contraction.\n\nTO UNBLOCK: Decompose the full scope into waves. Execute the first wave.\nCite the output. Your tools unblock when the first wave lands.',
  },
  {
    macroIntent: 'SCOPE_REDUCTION', tier: 4, severity: 'MANDATE',
    fillFields: ['count', 'instrument'],
    template: '⛔ SOLVE-MANDATE — SCOPE REDUCTION AT TIER 4\n\nAll generic tools are blocked. Scope-reduction reasoning has sustained for\nan extended period. The operator\'s scope has not been decomposed.\n\nTO CONTINUE: Use trident-problem-solving to decompose the scope into\nexecutable waves. This tool passes at every tier. After it completes,\nyour tier resets to 0.',
  },
  {
    macroIntent: 'DOUBT_PARALYSIS', tier: 1, severity: 'ADVISORY',
    fillFields: ['count', 'excerpt'],
    template: '⚠ Your reasoning contains doubt-hedging — expressing uncertainty without\nresolving it through verification. Doubt is useful when it drives\ninvestigation; it is paralysing when it replaces investigation. This has\nfired {count} times.\n\nThe matched excerpt: "{excerpt}"\n\nREQUIRED: Verify the claim you are doubting. Run the check, read the file,\nexecute the probe. You KNOW or you FIND OUT — "maybe" is not a terminal\nstate.',
  },
  {
    macroIntent: 'DOUBT_PARALYSIS', tier: 2, severity: 'ESCALATED',
    fillFields: ['count', 'excerpt'],
    template: '⛔ ENFORCEMENT ESCALATION — DOUBT PARALYSIS AT TIER 2\n\nYour previous turn contained doubt-hedging ("{excerpt}"). The pattern is\nsustaining — you are expressing uncertainty without resolving it.\n\nREQUIRED: Run the mechanical check that resolves the doubt. State the\nevidence you find. "Maybe" is replaced by the finding.',
  },
  {
    macroIntent: 'DOUBT_PARALYSIS', tier: 3, severity: 'DENIAL',
    fillFields: ['count', 'excerpt', 'instrument'],
    template: '⛔ TOOL BLOCKED — DOUBT PARALYSIS DETECTED\n\nYour tool call has been blocked. Your reasoning has hedged ("{excerpt}")\nfor {count} turns without running the check that resolves the doubt.\n\nWHY: Sustained doubt without investigation is the analysis-paralysis\nderailment — the agent stalls because it cannot act without certainty, and\nit cannot reach certainty without acting.\n\nTO UNBLOCK: Run the check. State the finding. Your tools unblock when the\nevidence replaces the doubt.',
  },
  {
    macroIntent: 'DOUBT_PARALYSIS', tier: 4, severity: 'MANDATE',
    fillFields: ['count', 'instrument'],
    template: '⛔ SOLVE-MANDATE — DOUBT PARALYSIS AT TIER 4\n\nAll generic tools are blocked. Doubt-pattern reasoning has sustained for an\nextended period without resolution.\n\nTO CONTINUE: Use trident-problem-solving to structure the investigation\nthat resolves the doubt. This tool passes at every tier.',
  },
  {
    macroIntent: 'PERMISSION_SEEKING', tier: 1, severity: 'ADVISORY',
    fillFields: ['count', 'excerpt'],
    template: '⚠ Your reasoning is deferring decisions to the operator — asking for\npermission instead of executing. The operator gave you the scope; your job\nis to execute it, not to seek approval at every boundary. This has fired\n{count} times.\n\nThe matched excerpt: "{excerpt}"\n\nREQUIRED: Take the next step. Decompose the problem and act. "Should I\ncontinue?" is replaced by the execution.',
  },
  {
    macroIntent: 'PERMISSION_SEEKING', tier: 2, severity: 'ESCALATED',
    fillFields: ['count', 'excerpt'],
    template: '⛔ ENFORCEMENT ESCALATION — PERMISSION SEEKING AT TIER 2\n\nYour previous turn deferred a decision ("{excerpt}"). The pattern is\nsustaining. The operator\'s law: execute, never announce.\n\nREQUIRED: Take the next concrete action. State what you did and cite the\nresult. "Should I proceed?" is replaced by the proceeding.',
  },
  {
    macroIntent: 'PERMISSION_SEEKING', tier: 3, severity: 'DENIAL',
    fillFields: ['count', 'excerpt', 'instrument'],
    template: '⛔ TOOL BLOCKED — PERMISSION SEEKING DETECTED\n\nYour tool call has been blocked. Your reasoning has deferred decisions\n("{excerpt}") for {count} turns instead of executing.\n\nWHY: Permission-seeking is the stall derailment — the agent burns turns\nasking instead of acting. The operator gave the scope; the execution is\nyour job.\n\nTO UNBLOCK: Take the next concrete action. Your tools unblock when the\nexecution replaces the permission-seeking.',
  },
  {
    macroIntent: 'PERMISSION_SEEKING', tier: 4, severity: 'MANDATE',
    fillFields: ['count', 'instrument'],
    template: '⛔ SOLVE-MANDATE — PERMISSION SEEKING AT TIER 4\n\nAll generic tools are blocked. Permission-seeking reasoning has sustained\nfor an extended period without execution.\n\nTO CONTINUE: Use trident-problem-solving to decompose the problem into\nexecutable steps. This tool passes at every tier.',
  },
];
export const TEMPLATE_MAP: ReadonlyMap<string, AdaptiveWarheadTemplate> = new Map(
  TEMPLATES.map((t) => [`${t.macroIntent}:${t.tier}`, t] as const),
);
export function templateFor(macroIntent: MacroIntent, tier: number): AdaptiveWarheadTemplate | null {
  const t = Math.min(4, Math.max(1, tier)) as 1 | 2 | 3 | 4;
  return TEMPLATE_MAP.get(`${macroIntent}:${t}`) ?? null;
}
export interface WarheadFillContext {
  count?: number;
  excerpt?: string;
  instrument?: string;
  instrumentTier3?: string;
}
const DEFAULT_INSTRUMENT = 'trident-container-test';
const DEFAULT_TIER3_INSTRUMENT = 'trident-problem-solving';
export function fallbackWarhead(family: string, ctx: WarheadFillContext): string {
  const excerpt = (ctx.excerpt && ctx.excerpt.length > 0 ? ctx.excerpt : '(unknown)').slice(0, 60);
  return `⚠ ENFORCEMENT: Your reasoning matched an unidentified pattern (${family}).\n\nThe matched excerpt: "${excerpt}"\n\nVERIFY your current action: run the actual verification, produce the actual result, or state explicitly why the flagged pattern does not apply.`;
}
export function resolveWarhead(family: string, tier: number, context: WarheadFillContext = {}): string {
  const macroIntent = (META_LEXICON as Record<string, MacroIntent>)[family];
  if (!macroIntent) return fallbackWarhead(family, context);
  const tpl = templateFor(macroIntent, tier);
  if (!tpl) return fallbackWarhead(family, context);
  const excerpt = (context.excerpt && context.excerpt.length > 0 ? context.excerpt : '(unknown)').slice(0, 60);
  const count = String(context.count ?? 1);
  const instrument = context.instrument ?? DEFAULT_INSTRUMENT;
  const instrumentTier3 = context.instrumentTier3 ?? DEFAULT_TIER3_INSTRUMENT;
  return tpl.template
    .replaceAll('{count}', count)
    .replaceAll('{excerpt}', excerpt)
    .replaceAll('{instrumentTier3}', instrumentTier3)
    .replaceAll(DEFAULT_TIER3_INSTRUMENT, instrumentTier3)
    .replaceAll('{instrument}', instrument);
}
export function resolveWarheadWithLexicon(family: string, tier: number, context: WarheadFillContext = {}, extraLexicon: Record<string, MacroIntent> = {}): string {
  const merged = { ...META_LEXICON, ...extraLexicon } as Record<string, MacroIntent>;
  const macroIntent = merged[family];
  if (!macroIntent) return fallbackWarhead(family, context);
  const tpl = templateFor(macroIntent, tier);
  if (!tpl) return fallbackWarhead(family, context);
  const excerpt = (context.excerpt && context.excerpt.length > 0 ? context.excerpt : '(unknown)').slice(0, 60);
  const count = String(context.count ?? 1);
  const instrument = context.instrument ?? DEFAULT_INSTRUMENT;
  const instrumentTier3 = context.instrumentTier3 ?? DEFAULT_TIER3_INSTRUMENT;
  return tpl.template
    .replaceAll('{count}', count)
    .replaceAll('{excerpt}', excerpt)
    .replaceAll('{instrumentTier3}', instrumentTier3)
    .replaceAll(DEFAULT_TIER3_INSTRUMENT, instrumentTier3)
    .replaceAll('{instrument}', instrument);
}
export function hasAdaptiveTemplate(family: string, extraLexicon: Record<string, MacroIntent> = {}): boolean {
  const merged = { ...META_LEXICON, ...extraLexicon } as Record<string, MacroIntent>;
  return merged[family] !== undefined;
}
