// src/v2/lexicons/masking.ts — the length-preserving code/prompt masker (v2 W3)
//
// THE D6 FALSE-POSITIVE CLASS THIS FILE KILLS: command quotation flagged as
// claims. Reasoning text is saturated with shell evidence — "`npm test` passes",
// "$ bun test", "# exit 0" pasted terminal transcripts — and a frame scanner
// reading that raw text flags the QUOTED COMMAND as an agent claim. The masker
// replaces exactly those regions with 'X' repeated to the SAME length before
// any member matches, so the detector layer never sees quoted-command content.
//
// THE LENGTH-PRESERVING LAW: every replacement emits 'X'.repeat(match.length).
// The masked text stays byte-aligned with the source — offsets stable, excerpt
// lengths honest (boundedSlice(200) still yields ≤200 chars of REAL evidence),
// and no structural information about the quoted content survives into matching.
//
// THE SPAN GRAMMAR (deterministic, CommonMark-shaped):
//   1. Fenced spans: ``` … ``` — lazy match to the NEXT closing fence, or to
//      end-of-string when the fence is UNCLOSED. Unclosed fences are COMMON in
//      streamed reasoning (the closing ticks have not arrived yet mid-chain),
//      so everything after an opening ``` is treated as code until proven
//      otherwise — the conservative direction for a false-positive killer.
//   2. Inline spans: ` … ` — single line, non-empty or empty pair, lazy.
//   3. Prompt lines: a line STARTING with `$ `, `## `, or `# ` — the whole line
//      is masked. `## ` is checked before `# ` by alternation order; a `###`
//      heading does NOT match (`## ` requires the space after two hashes).
//
// THE COMPOSITION ORDER: maskAll = maskCodeSpans(maskPromptLines(text)).
// Prompt lines go FIRST — their backticks become X's and drop out of the span
// pass — then the backtick-span pass runs over what remains. Either order is
// length-stable; this order minimizes double work.
//
// THE DETECTOR-ONLY LAW (ISE): masking is a mechanical PRE-FILTER on the scan
// input. It never decides anything — it only removes regions whose content must
// not be read as agent-authored claims. The decision layers live elsewhere.

/** Fenced code spans — closed OR unclosed (unclosed runs to end-of-string). */
const FENCED_SPAN_RE = /```[\s\S]*?(?:```|$)/g;

/** Inline code spans — single-line `…`, lazy. */
const INLINE_SPAN_RE = /`[^`\n]*`/g;

/** Shell-prompt lines — `$ `, `## `, or `# ` at line start; whole line masked. */
const PROMPT_LINE_RE = /^(?:\$ |## |# ).*$/gm;

/**
 * maskCodeSpans — replaces backtick spans (fenced ```…``` then inline `…`)
 * with length-preserving 'X' placeholders.
 */
export function maskCodeSpans(text: string): string {
  if (typeof text !== 'string' || text === '') return '';
  const fenced = text.replace(FENCED_SPAN_RE, (m) => 'X'.repeat(m.length));
  return fenced.replace(INLINE_SPAN_RE, (m) => 'X'.repeat(m.length));
}

/**
 * maskPromptLines — replaces every shell-prompt line (`$ `, `## `, `# `
 * prefixes) with length-preserving 'X' placeholders. Newlines are untouched,
 * so line structure (and byte offsets) survive intact.
 */
export function maskPromptLines(text: string): string {
  if (typeof text !== 'string' || text === '') return '';
  return text.replace(PROMPT_LINE_RE, (line) => 'X'.repeat(line.length));
}

/**
 * maskAll — the scan-input transform: maskCodeSpans(maskPromptLines(text)).
 * This is what StreamPredicateLexicon.scan() runs BEFORE any member matches,
 * so every registered member automatically inherits the D6 exemption.
 */
export function maskAll(text: string): string {
  return maskCodeSpans(maskPromptLines(text));
}
