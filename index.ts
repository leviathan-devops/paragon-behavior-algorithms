// index.ts — THE PARAGON V2 ENTRY POINT
//
// The universal behavior enforcement boilerplate.
// Plug in a domain module (config/) + a platform adapter (hooks/) = enforcement.

// Core exports (the fixed machinery — types exported once here)
export * from './core/types.js';
export * from './core/classifier.js';
export * from './core/synapse.js';
export * from './core/machine.js';
export * from './core/gate-engine.js';
export * from './core/collector.js';
export * from './core/role-gate.js';
export * from './core/circuit.js';

// THE INTEGRATION SPINE (the engine composes everything)
export * from './core/engine.js';

// Capture exports
export * from './capture/event-router.js';

// Actuation exports
export * from './actuation/dispatch.js';

// Config exports (the reference domains ride the barrel)
export * from './config/loader.js';
export { tridentDomain, tradingDomain, salesDomain } from './config/index.js';

// Hooks exports (PlatformAdapter already exported via core/types.js)
export { MockAdapter } from './hooks/platform-adapter.js';
export { OpenCodeAdapter } from './hooks/opencode.js';
