export function classify(n: number) {
  if (n < 0) return { ok: false };
  if (n === 0) return { ok: false };
  const v = validateRange(n);
  if (!v) return { ok: false };
  return { ok: true };
}
function validateRange(n:number){ return n<100; }
