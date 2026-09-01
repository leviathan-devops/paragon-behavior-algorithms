// ms-escalation-memory — src/machines/index.ts (escalation tables as data)
// Copy-and-customize: tune your deadline/skip tables here (pin values preserved).
export const DEADLINE_TABLE: Array<{ count: string; window: number }> = [
  { count: '0-1', window: 5 },
  { count: '2', window: 2 },
  { count: '3+', window: 0 },
];

export const SKIP_TIER_TABLE: Array<{ count: string; tier: number }> = [
  { count: '0-1', tier: 0 },
  { count: '2', tier: 2 },
  { count: '3+', tier: 3 },
];

// Machines view: re-export data tables for tool/status surfaces
export const ESCALATION_MACHINES = { DEADLINE_TABLE, SKIP_TIER_TABLE };
export const DEFAULT_ESCALATION_MACHINES = ESCALATION_MACHINES;
