// ms-pba-bridge — src/machines/index.ts (pattern families / bridge lexicon as data)
// Copy-and-customize: register your PBA families → layer boost mappings here.
export interface BridgeFamily {
  family: string;
  description: string;
  boostLayers: Array<{ layerId: string; boostAmount: number }>;
}

export const BRIDGE_FAMILIES: BridgeFamily[] = [
  { family: 'TEST_EVASION', description: 'PBA TEST_EVASION → SMOKE_SUBSTITUTION pre-arm', boostLayers: [{ layerId: 'SMOKE_SUBSTITUTION', boostAmount: 0.2 }] },
  { family: 'FORGERY_INTENT', description: 'PBA FORGERY_INTENT → SMOKE_SUBSTITUTION pre-arm', boostLayers: [{ layerId: 'SMOKE_SUBSTITUTION', boostAmount: 0.2 }] },
];

// correlateEscalation pin table (MASTER MS-05) — data form for machines view
export const CORRELATE_TABLE: Array<{ pbaTier: number; floor: number }> = [
  { pbaTier: 0, floor: 0 },
  { pbaTier: 1, floor: 0 },
  { pbaTier: 2, floor: 1 },
  { pbaTier: 3, floor: 2 },
  { pbaTier: 4, floor: 2 },
];

export const DEFAULT_BRIDGE_MACHINES = BRIDGE_FAMILIES;
