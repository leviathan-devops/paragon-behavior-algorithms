import { createMachine, assign } from 'xstate';

type ContextSynthesisEvent =
  | { type: 'COLLECT'; context: string }
  | { type: 'SCORE' }
  | { type: 'COMPRESS'; compressed: string }
  | { type: 'FORMAT'; sections: string[] }
  | { type: 'RETRY'; error: string }
  | { type: 'RESET' };

export const contextSynthesisMachine = createMachine({
  id: 'contextSynthesis',
  types: { context: {} as { rawContext: string; compressed: string; tokenBudget: number; currentTokens: number; error: string | null; sections: string[] } },
  initial: 'idle',
  context: { rawContext: '', compressed: '', tokenBudget: 4000, currentTokens: 0, error: null, sections: [] },
  states: {
    idle: { on: { COLLECT: { target: 't1_collection', actions: 'setRawContext' } } },
    t1_collection: { on: { SCORE: { target: 't2_scoring' } } },
    t2_scoring: { on: { COMPRESS: { target: 't3_compression', actions: 'setCompressed' } } },
    t3_compression: {
      always: [
        { target: 't4_format', guard: 'budgetReady' },
        { target: 'errorState', actions: 'overBudget' },
      ],
    },
    t4_format: { on: { FORMAT: { target: 'done', actions: 'setSections' } } },
    errorState: { on: { RETRY: 't1_collection', RESET: 'idle' } },
    done: { type: 'final' },
  },
}, {
  actions: {
    setRawContext: assign({ rawContext: ({ event }) => event.context }),
    setCompressed: assign({ compressed: ({ event }) => event.compressed }),
    setSections: assign({ sections: ({ event }) => event.sections }),
    overBudget: assign({ error: ({ context }) => `Token budget exceeded: ${context.currentTokens}/${context.tokenBudget}` }),
  },
  guards: {
    budgetReady: ({ context }) => context.currentTokens <= context.tokenBudget,
  },
});
