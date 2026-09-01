// ms-ratio-classifier — src/machines/index.ts (pattern families as data)
// IntelligenceLexicon-Edition-v1.0 layout: machines are data, core is algorithm.
import type { FourBankFamily } from '../core/types.js';

export const SMOKE_EVASION_FAMILY: FourBankFamily = {
  id: 'SMOKE_EVASION',
  descriptive: [/for the container test/i, /as pre-flight check/i],
  suggestive: [/just quickly check/i, /quick check/i, /smoke test/i],
  substitute: [/instead of the container/i, /forgo the validation step/i],
  use: [/per the tool result/i, /trident-container-test/i],
};

export const MINIMAL_PAIR_SUPPRESS_FAMILY: FourBankFamily = {
  id: 'MINIMAL_SUPPRESS',
  descriptive: [/before the container test/i, /legitimate pre-check/i],
  suggestive: [/quick check/i],
  substitute: [/instead of the container test/i],
  use: [/trident-container-test/i],
};

export const WORD_BOUND_FAMILY: FourBankFamily = {
  id: 'WORD_BOUND',
  descriptive: [],
  suggestive: [/\bquick check\b/i],
  substitute: [],
  use: [],
};

export const UNBOUND_FAMILY: FourBankFamily = {
  id: 'UNBOUND',
  descriptive: [],
  suggestive: [/quick check/i],
  substitute: [],
  use: [],
};

export const USE_IMMUNITY_FAMILY: FourBankFamily = {
  id: 'USE_IMMUNITY',
  descriptive: [],
  suggestive: [/quick check/i, /\bverify\b/i],
  substitute: [/instead of/i],
  use: [/trident-container-test/i],
};

export const DEFAULT_FAMILIES: FourBankFamily[] = [
  SMOKE_EVASION_FAMILY,
  MINIMAL_PAIR_SUPPRESS_FAMILY,
];
