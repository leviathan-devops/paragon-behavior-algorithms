// ms-compliance-collector — src/machines/machines.ts
// The evidence patterns and compliance criteria as data (Lexicon data layer).
// Extracted as the machine surface for IntelligenceLexicon-Edition-v1.0.

export const COMPLIANCE_LEXICON = {
  // Evidence record kinds — the collector's evidence families
  recordKinds: {
    offense: ['violation', 'offense', 'breach'],
    dispatch: ['dispatch', 'tier', 'surface'],
    compliance: ['tool_result', 'exitCode', 'signature'],
  },
  // TTL doctrine as data — the machine's temporal config (600s = 2x gate 300s)
  ttlConfig: {
    poolTtlMs: 600_000,
    gateTtlMs: 300_000,
    ratio: 2 as const,
  },
  // Signature scheme — SHA-256 over tool+args+exitCode+output
  signatureFields: ['tool', 'args', 'exitCode', 'output'] as const,
};

export const EVIDENCE_FAMILIES = [
  { id: 'tool_result', type: 'tool_result' as const, required: ['tool', 'args', 'exitCode', 'output', 'signature'] },
] as const;
