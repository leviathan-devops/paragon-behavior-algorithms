// R8 GOLDEN — must stay SILENT: marker inside string literal is DATA, never a defect (FORENSIC §2.5 string-literal false positive)
// The old regex flagged this ~266 FP class; the new AST comment-node-only detector stays silent because string literals are not comment nodes.
export const TODO_STRING = "TODO is just data";
export const FIXME_DATA = "FIXME is just a string value, not a marker";
export const HACK_VALUE = 'HACK inside a string literal should not fire';
export function getMessage() {
  const msg = "TODO: this is a message string, not a code marker";
  return msg;
}
// Even template literals with markers are DATA (closed - intentional, by design): template markers are string data not comments
