// ms-persistence — src/machines/machines.ts
// The persistence file-set and atomicity config as data.

export const PERSISTENCE_LEXICON = {
  files: {
    state: (sid: string) => `pta-state-${sid}.json`,
    synapse: (sid: string) => `pta-synapse-${sid}.json`,
    chain: (sid: string) => `pta-chain-${sid}.json`,
    ledger: 'pta-ledger.jsonl',
  },
  atomicity: {
    tmpSuffix: '.tmp',
    method: 'write-tmp-then-rename' as const,
  },
  ledger: {
    mode: 'O_APPEND' as const,
    encoding: 'utf8' as const,
    lineTerminator: '\n' as const,
  },
  failClosed: {
    onCorrupt: null,
    onMissing: null,
  },
};
