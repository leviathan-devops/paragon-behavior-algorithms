export function bad2() {
  try { foo(); } catch (e) { console.log("ignored"); }
}
function foo(){}
