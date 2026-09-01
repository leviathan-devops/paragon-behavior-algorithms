// ms-compliance-collector — src/machines/index.ts
// Machine registry for the evidence/compliance lexicon.
export { COMPLIANCE_LEXICON, EVIDENCE_FAMILIES } from './machines.js';
import { COMPLIANCE_LEXICON } from './machines.js';
export const DEFAULT_MACHINES = [COMPLIANCE_LEXICON] as const;
