// actuation/index.ts — the actuation layer barrel
export {
  dispatchDirective,
  throwMandate,
  shouldRedispatch,
  markDispatched,
  resetDispatchTracker,
} from './dispatch.js';
export * from './warhead-templates.js';
