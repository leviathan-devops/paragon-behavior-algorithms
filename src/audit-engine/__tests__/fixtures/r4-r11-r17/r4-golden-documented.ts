// documented non-fatal cleanup — intentional best-effort idempotent path
export function good() {
  try { doWork(); } catch (e) {
    // non-fatal: best-effort cleanup, documented idempotent retry
  }
}
function doWork(){}
