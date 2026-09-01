export function checkAccessValidated(user: string) {
  if (!validateUser(user)) return { ok: false };
  const exists = queryDb(user);
  if (!exists) return { ok: false };
  return { ok: true };
}
function validateUser(u: string){ return u.length>0; }
function queryDb(u: string){ return true; }
