// ms-chain-tracker — src/machines/index.ts (pattern families / bank configs as data)
// Copy-and-customize: add your chain rule families here. Each family = opposed signal groups.
import type { ChainRule } from '../core/types.js';

export interface ChainBankConfig {
  id: string;
  description: string;
  // Pinned rule templates for this microstructures
  rules: ChainRule[];
}

// Canonical pinned bank: verification-requires-audit / no-bash-before-ship / loop triplet
export const CHAIN_BANKS: ChainBankConfig[] = [
  {
    id: 'verification-requires-audit',
    description: 'Verification claims require audit to have been called (MASTER MS-04)',
    rules: [{ name: 'needs-audit', description: 'verification requires audit', requires: [{ tool: 'trident-code-audit' }], violation: { layerId: 'L1' } }],
  },
  {
    id: 'forbidden-precedent',
    description: 'Ship must not follow raw bash without gate (forbidden precedent)',
    rules: [{ name: 'no-bash-before-ship', description: 'no bash before ship', forbids: [{ tool: 'bash' }], violation: { layerId: 'L2' } }],
  },
  {
    id: 'loop-detection',
    description: 'Loop = >=3 same tool in windowSize with <=1 unique completed output',
    rules: [],
  },
];

export const DEFAULT_CHAIN_MACHINES = CHAIN_BANKS;
