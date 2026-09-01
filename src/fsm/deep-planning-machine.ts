import { createMachine, assign } from 'xstate';

type DeepPlanningEvent = 
  | { type: 'START' }
  | { type: 'SUBMIT_LAYER1'; count: number }
  | { type: 'SUBMIT_LAYER2'; count: number }
  | { type: 'SUBMIT_LAYER3'; content: string }
  | { type: 'RETRY'; error: string }
  | { type: 'RESET' };

export const deepPlanningMachine = createMachine({
  id: 'deepPlanning',
  types: { context: {} as { principles: number; components: number; contextLibrary: string; error: string | null } },
  initial: 'idle',
  context: { principles: 0, components: 0, contextLibrary: '', error: null },
  states: {
    idle: { on: { START: { target: 'layer1', actions: 'clearError' } } },
    layer1: { entry: 'clearError', on: { SUBMIT_LAYER1: { target: 'layer1Validation', actions: 'setPrinciples' } } },
    layer1Validation: {
      always: [
        { target: 'layer2', guard: 'principlesReady' },
        { target: 'errorState', actions: 'principlesError' },
      ],
    },
    layer2: { on: { SUBMIT_LAYER2: { target: 'layer2Validation', actions: 'setComponents' } } },
    layer2Validation: {
      always: [
        { target: 'layer3', guard: 'componentsReady' },
        { target: 'errorState', actions: 'componentsError' },
      ],
    },
    layer3: { on: { SUBMIT_LAYER3: { target: 'layer3Validation', actions: 'setLibrary' } } },
    layer3Validation: {
      always: [
        { target: 'done', guard: 'libraryReady' },
        { target: 'errorState', actions: 'libraryError' },
      ],
    },
    errorState: { on: { RETRY: 'layer1', RESET: 'idle' } },
    done: { type: 'final' },
  },
}, {
  actions: {
    clearError: assign({ error: (_) => null }),
    setPrinciples: assign({ principles: ({ event }) => event.count }),
    setComponents: assign({ components: ({ event }) => event.count }),
    setLibrary: assign({ contextLibrary: ({ event }) => event.content }),
    principlesError: assign({ error: ({ context }) => `Need >= 3 principles, got ${context.principles}` }),
    componentsError: assign({ error: ({ context }) => `Need >= 5 components, got ${context.components}` }),
    libraryError: assign({ error: (_) => 'Context library is empty' }),
  },
  guards: {
    principlesReady: ({ context }) => context.principles >= 3,
    componentsReady: ({ context }) => context.components >= 5,
    libraryReady: ({ context }) => context.contextLibrary.length > 0,
  },
});
