import { StructuredEnforcementError } from '../core/types.js';
import type { WarheadLayer, WarheadContext, PlatformAdapter } from '../core/types.js';
export { StructuredEnforcementError } from '../core/types.js';
export type { WarheadLayer, WarheadContext, PlatformAdapter, DeliverySurface } from '../core/types.js';

const REQUIRED_SECTIONS = ['DETECTED', 'WHY THIS FIRED', 'WHAT THIS MEANS', 'CORRECT BEHAVIOR', 'SELF-CHECK', 'RESET PATH'];

export function fillTemplate(template: string, context: WarheadContext): string {
  let out = template;
  const fields: Record<string, string> = {
    count: String(context.count ?? 1),
    toolName: context.toolName ?? 'unknown',
    args: context.args ?? '{}',
    chainViolations: context.chainViolations ?? 'none',
    pbaFamilies: context.pbaFamilies ?? 'none',
    pbaTier: String(context.pbaTier ?? 0),
    escalationCount: String(context.escalationCount ?? 0),
    correctTool: context.correctTool ?? 'trident-container-test',
    anchor: context.anchor ?? `pta:${Date.now()}`,
  };
  for (const [k, v] of Object.entries(fields)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

export function resolveWarhead(layer: WarheadLayer, tier: number, context: WarheadContext): string {
  const t = Math.min(4, Math.max(1, tier)) as 1 | 2 | 3 | 4;
  const raw = layer.enforcement[`tier${t}` as keyof typeof layer.enforcement];
  if (!raw) throw new Error(`Missing enforcement template for tier ${t} in layer ${layer.id}`);
  return fillTemplate(raw, context);
}

export function validateWarhead(body: string): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!body.includes(section)) missing.push(section);
  }
  return { valid: missing.length === 0, missing };
}

export function getRequiredSections(): string[] {
  return [...REQUIRED_SECTIONS];
}

export function getDefaultTemplates(layerId: string): WarheadLayer['enforcement'] {
  return {
    tier1: `⚠ [PTA] ${layerId} — Tier 1\n\n─────────────────────────────────────────────────────────────\nDETECTED: Tool call matched layer ${layerId}.\n\nYOUR TOOL CALL: {toolName} with args {args}\n\nWHY THIS FIRED:\n• Tool match: {toolName} matched pattern (confidence derived from 4-bank scan)\n• Chain context: {chainViolations}\n• PBA context: {pbaFamilies} active (tier {pbaTier})\n\nWHAT THIS MEANS:\nThis tool call matches a pattern that indicates a potential enforcement violation. The detection considers the tool shape, chain context, and reasoning signals.\n\nCORRECT BEHAVIOR:\n→ {correctTool} — the sanctioned tool for this operation\n→ Always passes at every enforcement tier\n\nSELF-CHECK BEFORE NEXT TOOL CALL:\n□ Am I calling {correctTool} instead of {toolName}?\n□ Will my next tool call produce verifiable output?\n─────────────────────────────────────────────────────────────\nRESET PATH: Call {correctTool} to clear enforcement. ({anchor})`,
    tier2: `⛔ [PTA] ${layerId} — Tier 2 (ESCALATED)\n\n─────────────────────────────────────────────────────────────\nDETECTED: Repeated tool calls matched layer ${layerId} ({count} times).\n\nYOUR TOOL CALL: {toolName} with args {args}\n\nWHY THIS FIRED:\n• Tool match: {toolName} matched pattern — repeated {count} times\n• Chain context: {chainViolations}\n• PBA context: {pbaFamilies} at tier {pbaTier}\n\nWHAT THIS MEANS:\nPrevious corrections for this pattern were not acted upon. Enforcement escalates proportionally. The next tier blocks the tool call.\n\nCORRECT BEHAVIOR:\n→ {correctTool} — the demanded tool that resets enforcement\n→ Produces verifiable evidence of correct behavior\n\nSELF-CHECK BEFORE NEXT TOOL CALL:\n□ Have I addressed the previous correction?\n□ Is {correctTool} the right next call?\n─────────────────────────────────────────────────────────────\nRESET PATH: Call {correctTool} to clear enforcement. ({anchor})`,
    tier3: `⛔ [PTA ENFORCEMENT] ${layerId} — Tier 3\n\n─────────────────────────────────────────────────────────────\nDETECTED: Tool call REFUSED — layer ${layerId} at tier 3.\n\nYOUR TOOL CALL: {toolName} with args {args}\nViolations: {count} tool calls matched this pattern\nChain violations: {chainViolations}\nPBA context: {pbaFamilies} at tier {pbaTier}\n\nWHY THIS FIRED:\n• Repeated violations despite corrections at tier 1 and 2\n• Tool match confidence exceeded threshold with chain + PBA context\n\nWHAT THIS MEANS:\nThis tool call is refused before execution. The pattern has persisted through advisory corrections.\n\nCORRECT BEHAVIOR:\n→ Call {correctTool} — the ONLY path that resets enforcement\n→ It always passes — no tier blocks it\n\nSELF-CHECK:\n□ Am I calling {correctTool} next?\n□ Do I understand why {toolName} was blocked?\n─────────────────────────────────────────────────────────────\nRESET PATH: Call {correctTool} on your current target. Enforcement resets on compliance. ({anchor})`,
    tier4: `[PTA GATE] BEHAVIORAL CORRECTION — ${layerId}\n\n─────────────────────────────────────────────────────────────\nDETECTED: Sustained pattern for ${layerId} across {escalationCount} cycle(s).\n\nPBA has been correcting your reasoning at tier {pbaTier} (families: {pbaFamilies})\nPTA has been correcting your tool calls at tier 3 — both engines detecting the same pattern.\n\nWHY THIS FIRED:\n• Tier 3 blocks were not followed by compliance\n• Sustained non-compliance across multiple enforcement cycles\n\nWHAT THIS MEANS:\nThis is a behavioral catalyst — not a lockout. The demanded tool and escape hatches always pass. Only the violating pattern is gated.\n\nCORRECT BEHAVIOR:\n→ Call {correctTool} on your current target\n→ Process the evidence it produces\n→ Both engines reset to clean state — your work continues\n\nSELF-CHECK:\n□ Do I understand the demanded corrective action?\n□ Will my next call be {correctTool}?\n─────────────────────────────────────────────────────────────\nRESET PATH: {correctTool} always passes. On compliance, both engines reset. ({anchor})`,
  };
}
