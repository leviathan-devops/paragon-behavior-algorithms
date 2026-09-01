// R8 GOLDEN — must stay SILENT: annotated intentional marker list with closure vocabulary (FORENSIC §2.5 closure annotation)
// Mined from src/hooks/trident-hooks.ts:129 and src/audit-engine/layers/r11-theatrical-integrity.ts:10
// INTENTIONAL PATTERN LIST — required for enforcement coverage (by design - closed, wontfix)
// TODO: legacy pattern - closed (wontfix - intentional list for enforcement diagnostics)
// FIXME: known false-positive shape - resolved by design, intentional for test coverage
// HACK: required for container-test theater detection - done (by design, intentional)
// This file's markers carry closure terms (closed|resolved|done|wontfix|by design|intentional) → exempt
export const INTENTIONAL_PATTERNS = ['TODO', 'FIXME', 'HACK'] as const; // intentional pattern inventory — not unresolved work
