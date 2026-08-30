// config/index.ts — the config layer barrel
export {
  loadDomainModule,
  getLoadedDomain,
  clearLoadedDomains,
} from './loader.js';
export { default as tridentDomain } from './trident/index.js';
export { default as tradingDomain } from './trading/index.js';
export { default as salesDomain } from './sales/index.js';
