// Trident_Build agent identity detection
var BUILD_AGENT_NAMES = new Set(['trident_build', 'trident-build']);

export function isTridentBuildAgent(agentName: string | undefined): boolean {
  if (!agentName) return false;
  return BUILD_AGENT_NAMES.has(agentName.toLowerCase());
}

export function getBuildAgentDisplayName(): string {
  return 'Trident_Build';
}
