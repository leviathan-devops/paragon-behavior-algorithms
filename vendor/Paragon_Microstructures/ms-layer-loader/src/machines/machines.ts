// ms-layer-loader — src/machines/machines.ts
// The layer system's pattern families and the canonical SMOKE_TEST_GUARD fixture as data.

export const LAYER_LOADER_LEXICON = {
  // Loader validation config — the required-field surface that throws LOADER_VALIDATION_FAILED
  requiredFields: ['id', 'toolMatchers', 'banks', 'enforcement', 'threshold'] as const,
  bankBands: ['descriptive', 'suggestive', 'substitute', 'use'] as const,
  enforcementTiers: ['tier1', 'tier2', 'tier3', 'tier4'] as const,
  // Glob compilation: * -> .* ; banks unanchored, argPatterns anchored
  globRules: {
    wildcard: '*',
    replacement: '.*',
    bankAnchored: false,
    argPatternAnchored: true,
    flag: 'i' as const,
  },
};

// The canonical layer JSON fixture (MASTER §4 SMOKE_TEST_GUARD — the spec example)
export const SMOKE_TEST_GUARD_FIXTURE = {
  id: 'SMOKE_TEST_GUARD',
  description: 'Block smoke tests (inline exec) being used as verification evidence',
  toolMatchers: [
    {
      toolName: 'bash',
      argPatterns: {
        command: ['node -e*', 'bun -e*', 'python3 -c*', 'python -c*', 'echo *done*'],
      },
    },
  ],
  banks: {
    descriptive: [
      'for the container test',
      'as pre-flight check',
      'before running the real test',
      'per the tool result',
    ],
    suggestive: ['just quickly check', 'verify it works', 'smoke test', 'quick test', 'simple check'],
    substitute: ['instead of the container', 'faster than the full test', 'good enough for now', 'skip the full test'],
    use: ['per the tool result', 'the container test passed', 'trident-container-test', 'the sanctioned path'],
  },
  pbaContextBoost: { families: ['TEST_EVASION', 'FORGERY_INTENT'], boostAmount: 0.2 },
  enforcement: {
    tier1: 'tier1 {count} {args}',
    tier2: 'tier2 {count}',
    tier3: 'tier3 {count}',
    tier4: '[PTA GATE] tier4 {escalationCount}',
  },
  threshold: 0.9,
  severity: 'HIGH',
  chainRules: [
    {
      name: 'verification-requires-container-test',
      description: 'Verification claims require the container test to have been called',
      requires: [{ tool: 'trident-container-test' }],
      violation: { layerId: 'SMOKE_TEST_GUARD' },
    },
  ],
} as const;
