// config/loader.ts — THE DOMAIN MODULE LOADER
//
// Loads a domain module by name. The domain module is a directory under
// config/ with an index.ts that exports a DomainModule.

import type { DomainModule } from '../core/types.js';

// The loaded domain cache
const loaded = new Map<string, DomainModule>();

export async function loadDomainModule(name: string): Promise<DomainModule> {
  const cached = loaded.get(name);
  if (cached) return cached;

  try {
    const mod = await import(`./${name}/index.js`);
    const domain = mod.default as DomainModule;
    if (!domain || !domain.families || !domain.templates) {
      throw new Error(`Domain module '${name}' is missing required exports`);
    }
    loaded.set(name, domain);
    return domain;
  } catch (err) {
    throw new Error(`Failed to load domain module '${name}': ${err instanceof Error ? err.message : err}`);
  }
}

export function getLoadedDomain(name: string): DomainModule | undefined {
  return loaded.get(name);
}

export function clearLoadedDomains(): void {
  loaded.clear();
}
