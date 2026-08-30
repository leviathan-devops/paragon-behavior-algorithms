// capture/index.ts — the capture layer barrel
export {
  synapseFor,
  processBatch,
  createEventRouter,
} from './event-router.js';
export type { StreamBatch, EventHandler } from './event-router.js';
