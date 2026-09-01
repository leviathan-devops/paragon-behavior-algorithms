// R1 GOLDEN — must stay SILENT: plain function with config param, NOT a registered hook handler (FORENSIC §2.2 bare-config FP class)
// The old regex `/config/` flagged ANY function containing a variable/param named config (~1000 FPs).
// The new registry model: handler is finding ONLY when IS registered hook handler present in registry.
// This function mentions config but is NOT in the registry → can NEVER fire → the ~1000-FP class dies.
export function plainConfigFn(config: { timeout: number; retries: number }) {
  return config.timeout * config.retries;
}
export function loadConfiguration(configuration: string) {
  const config = JSON.parse(configuration);
  return config;
}
export function helperWithConfigParam(config: unknown, verbose: boolean) {
  if (verbose) console.log('config', config);
  return config;
}
// Even mentioning tool.execute in a string inside a non-registered function should NOT fire if not registered:
// Plain function mentioning hook names in strings is DATA unless it's the actual registered handler.
export function documentationHelper() {
  return "See tool.execute.before for hook docs";
}
