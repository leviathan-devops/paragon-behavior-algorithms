import { StructuredEnforcementError } from './types.js';
import type { WarheadLayer, WarheadContext, PlatformAdapter } from './types.js';
export { StructuredEnforcementError } from './types.js';
export type { WarheadLayer, WarheadContext, PlatformAdapter, DeliverySurface } from './types.js';

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

export function dispatchTea(body: string, toolOutput: string): string {
  return toolOutput + '\n\n' + body;
}

export function blockAtTeb(body: string, layerId?: string): never {
  throw new StructuredEnforcementError({ detected: `${layerId ?? 'unknown'} at tier 3`, correction: body });
}

export function dispatchDirective(body: string, adapter: PlatformAdapter): void {
  const prefixed = `[PTA GATE] ${body}`;
  adapter.inject({ type: 'chat.message', content: prefixed });
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
