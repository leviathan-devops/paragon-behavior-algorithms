// ms-ratio-classifier — src/index.ts (public entry)
// IntelligenceLexicon-Edition-v1.0 layout: entry re-exports from src/core/.
// The 4-bank opposed-pattern detection engine (MASTER_L1_SPEC §2 MS-01).
import type { FourBankFamily, ScoreResult, ConfidenceBand, WeightedViolation } from './core/types.js';
import { scoreSignals, confidence, classifyBand, batchScan } from './core/classifier.js';

export type { FourBankFamily, ScoreResult, ConfidenceBand, WeightedViolation };
export { scoreSignals, confidence, classifyBand, batchScan };
