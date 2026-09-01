export function verifyTokenReal(t: string) {
  const checked = checkSignature(t);
  if (!checked) return { valid: false };
  return { valid: true };
}
function checkSignature(t: string){ return t==="ok"; }
