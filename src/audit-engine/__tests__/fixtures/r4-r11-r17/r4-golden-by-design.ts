// by design: expected failure for idempotent DDL guard
export function good2() {
  try { foo(); } catch (e) {}
}
function foo(){}
