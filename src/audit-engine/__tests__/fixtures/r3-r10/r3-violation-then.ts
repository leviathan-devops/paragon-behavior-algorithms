// R3 VIOLATION 2 — must FIRE: .then without .catch (FORENSIC §2.3) — no checker needed
export async function asyncOp(): Promise<string> { return 'ok'; }
export async function callerThen(): Promise<void> {
  asyncOp().then((v) => console.log(v));
}
