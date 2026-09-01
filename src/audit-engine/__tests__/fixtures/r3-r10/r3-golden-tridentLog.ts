// R3 GOLDEN — must STAY SILENT: tridentLog in catch is SAFE_ASYNC_DEFAULTS (FORENSIC §2.3 — ~476 FPs were tridentLog in catch)
declare function tridentLog(a: string, b: string, c: string): Promise<void>;
export async function fetchWithLog(): Promise<void> {
  try { await fetchRemote(); } catch (e: unknown) { tridentLog('WARN', 'test', String(e)); }
}
async function fetchRemote(): Promise<void> { return; }
