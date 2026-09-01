// R1 VIOLATION — must FIRE: registered hook handler lacking output.error/output.system contract (FORENSIC §2.2)
// Mimics src/hooks/trident-hooks.ts:3772 registration shape: return { 'tool.execute.before': composedBefore }
// The handler is REGISTERED (present in HOOK REGISTRY built from PropertyAssignment 'tool.execute.before': identifier)
// AND lacks output.error handling → the registry-gated detector flags it. Old bare-config regex would ALSO flag any function mentioning config, but new registry model ONLY flags registered handlers.
export async function badToolBeforeHandler(input: Record<string, unknown>, output: Record<string, unknown>) {
  // Intentionally missing: output.error = "[BLOCK]"; output.isError = true;
  // This handler is registered but has no blocking contract — the finding fires.
  const tool = (input as { tool?: string }).tool;
  if (tool === 'bash') {
    return; // missing output.error contract
  }
}
// Registration site — property assignment with hook event name (the registry builder extracts the initializer identifier):
export const handlers = {
  'tool.execute.before': badToolBeforeHandler,
  'system.transform': badToolBeforeHandler,
} as const;
