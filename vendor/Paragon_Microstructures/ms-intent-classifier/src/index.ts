// ms-intent-classifier — src/index.ts (public entry)
// IntelligenceLexicon-Edition-v1.0 layout: entry re-exports from src/core/.
// The 3-source intent fusion engine (MASTER_L1_SPEC §2 MS-03, PTA_L2_SPEC §2.4).
import type { ToolIntent, LayerShape, PbaSignal, IntentSources } from './core/types.js';
import { classifyIntent } from './core/engine.js';

export type { ToolIntent, LayerShape, PbaSignal, IntentSources };
export { classifyIntent };
