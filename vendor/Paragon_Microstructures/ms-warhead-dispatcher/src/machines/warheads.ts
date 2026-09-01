// ms-warhead-dispatcher — src/machines/warheads.ts
// Tier-to-surface pattern families and delivery configs as data.
// IntelligenceLexicon-Edition-v1.0: machines/ holds declarative configs consumed by the engine.

export interface WarheadTemplate {
  tier: 1 | 2 | 3 | 4;
  surface: 'TEA' | 'TEB' | 'GATE';
  severity: 'ADVISORY' | 'ESCALATED' | 'DENIAL' | 'MANDATE';
  requiredSections: string[];
  fillFields: string[];
}

export const REQUIRED_SECTIONS = ['DETECTED', 'WHY THIS FIRED', 'WHAT THIS MEANS', 'CORRECT BEHAVIOR', 'SELF-CHECK', 'RESET PATH'];
export const FILL_FIELDS = ['count','toolName','args','chainViolations','pbaFamilies','pbaTier','escalationCount','correctTool','anchor'];

export const TIER_SURFACE_MAP: WarheadTemplate[] = [
  { tier: 1, surface: 'TEA', severity: 'ADVISORY',  requiredSections: REQUIRED_SECTIONS, fillFields: FILL_FIELDS },
  { tier: 2, surface: 'TEA', severity: 'ESCALATED', requiredSections: REQUIRED_SECTIONS, fillFields: FILL_FIELDS },
  { tier: 3, surface: 'TEB', severity: 'DENIAL',    requiredSections: REQUIRED_SECTIONS, fillFields: FILL_FIELDS },
  { tier: 4, surface: 'GATE',severity: 'MANDATE',   requiredSections: REQUIRED_SECTIONS, fillFields: FILL_FIELDS },
];

export const TIER_TO_SURFACE: Record<number, 'TEA'|'TEB'|'GATE'> = {
  1: 'TEA', 2: 'TEA', 3: 'TEB', 4: 'GATE',
};
