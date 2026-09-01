export function bad() {
  try { doWork(); } catch (e) {}
}
function doWork(){}
