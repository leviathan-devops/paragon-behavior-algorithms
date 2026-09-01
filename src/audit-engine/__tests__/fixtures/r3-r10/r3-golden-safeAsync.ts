// R3 GOLDEN 2 — must STAY SILENT: callee annotated @safe-async and named fireAndForget (FORENSIC §2.3 — declared safe set)
export async function callerSafe(): Promise<void> {
  fireAndForgetPersist();
  voidPersist();
}
/** @safe-async */
export async function voidPersist(): Promise<void> { return; }
export async function fireAndForgetPersist(): Promise<void> { return; }
