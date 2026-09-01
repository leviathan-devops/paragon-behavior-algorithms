export function getStatusValidated(x: string) {
  if (!validate(x)) return { success: false };
  return { success: true };
}
function validate(x:string){ return x.length>0; }
