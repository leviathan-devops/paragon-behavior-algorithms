// R8 VIOLATION — must FIRE: unresolved TODO in comment without closure annotation (FORENSIC §2.5)
// This is a real unresolved marker — the AST comment-node detector flags it, the closure vocab does NOT exempt it.
export function incompleteFeature() {
  // TODO: fix this before shipping — needs proper error handling
  return 42;
}
// FIXME: broken logic in edge case handling
export const pendingHack = 1; // HACK: workaround for race condition - remove after refactor
