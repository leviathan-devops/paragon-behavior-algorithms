// R3 VIOLATION — must FIRE: floating promise not in SAFE_ASYNC_DEFAULTS, not @safe-async, not fireAndForget/void pattern (FORENSIC §2.3)
export async function fetchRemoteData(): Promise<void> { return; }
export async function callerViolation(): Promise<void> {
  fetchRemoteData();
}
