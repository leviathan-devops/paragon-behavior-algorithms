// ms-evidence-gates — src/machines/gates.ts
// Gate configs / criteria families as data.
// IntelligenceLexicon-Edition-v1.0: machines/ holds declarative configs consumed by the engine.

export interface GateConfig {
  id: string;
  criteria: string[]; // the 5 criteria names
  verdictMap: { pass: number; inconclusive: number };
}

export const FIVE_CRITERIA = ['minEvidenceCount','freshness','requiredTypes','allTypes','signatureVerification'] as const;

export const GATE_CONFIGS: GateConfig[] = [
  { id: 'compliance', criteria: [...FIVE_CRITERIA], verdictMap: { pass: 5, inconclusive: 3 } },
  { id: 'genuine',     criteria: [...FIVE_CRITERIA], verdictMap: { pass: 5, inconclusive: 3 } },
];

export const FRESHNESS_WINDOW_MS = 300000;
export const ARTIFACT_MARKERS = ['artifact','results.json','PASS'];
