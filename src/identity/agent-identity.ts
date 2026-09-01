const VANILLA_AGENTS = new Set(['plan', 'build', 'general', 'explore']);
const TRIDENT_AGENTS = new Set(['trident']);
const TRIDENT_PREFIX = 'trident_';
const TRIDENT_HYBRID_PREFIX = 'trident-';

export function isTridentAgent(agentName: string | undefined): boolean {
  if (!agentName) return false;
  if (TRIDENT_AGENTS.has(agentName)) return true;
  if (agentName.startsWith(TRIDENT_PREFIX)) return true;
  if (agentName.startsWith(TRIDENT_HYBRID_PREFIX)) return true;
  return false;
}

export function isTridentBuildAgent(agentName: string | undefined): boolean {
  if (!agentName) return false;
  var lower = agentName.toLowerCase();
  return lower === 'trident_build' || lower === 'trident-build';
}

export function isVanillaAgent(agentName: string | undefined): boolean {
  return VANILLA_AGENTS.has(agentName ?? '');
}

export function isOtherPluginAgent(agentName: string | undefined): boolean {
  if (!agentName) return false;
  return !VANILLA_AGENTS.has(agentName) && !isTridentAgent(agentName);
}
