// src/shared/knowledge-graph/profile-loader.ts
// THE FAIL-CLOSED LOADER (W1) — the machine's constitution: it NEVER runs on an
// invalid profile (O16, spec §8.1 lines 3640-3684).
//
// loadProfile(profilePath) per the pseudocode spec §3.1 lines 463-481:
//   exists check → PROFILE_INVALID · parse (JSON | YAML) · zod safeParse →
//   PROFILE_INVALID (field+value+remedy) · project.root realpath+EXISTS+isDirectory →
//   PROFILE_INVALID · rules.corpus EXISTS → CORPUS_MISSING {path} ·
//   history.failureLogs EXISTS → HISTORY_MISSING {path} (the named-error contract
//   at line 1794 WINS over the §3.1:479 comment mapping failureLogs to CORPUS_MISSING —
//   the divergence is recorded in the honest notes).
//
// THE YAML REALITY: no yaml library exists anywhere in the tree (package.json is
// the ground truth — verified). This file carries a SELF-CONTAINED YAML-SUBSET
// parser handling exactly the profile shape (the §8.2 profile.yaml at lines
// 3690-3814 is the acceptance shape): block mappings at any depth, scalar values,
// inline + full-line comments, inline flow arrays `[a, b]`, inline flow maps
// `{ k: v, k2: v2 }` (nested), block sequences of scalars, block sequences of
// multi-line maps (the stages list), dotted keys (the p1.*/p8.* bindings), and
// folded multi-line quoted strings. Any construct outside the subset → a parse
// error → PROFILE_INVALID with the field + the line. Zero dependencies added.
//
// ISE NOTE (the INTELLIGENT-SYSTEMS warhead): the regexes below are the mechanical
// SYNTAX-DETECTION layer of a tokenizer — literal shape matchers for scalar typing
// (the number/boolean guards, the plain-key guards, the tab guard). They carry NO
// decision semantics: nothing is classified from them; every token's semantic
// meaning is assigned by the parser structure (the recursive descent) + the zod
// schema downstream. The regex is the right tool here precisely because it is a
// detector-only tokenizer, never a decision system — the decision layer is the
// state machine of the recursive-descent parse + the ProjectProfileSchema.

import fs from 'node:fs';
import path from 'node:path';
import { ProjectProfileSchema, type ProjectProfile } from './profile-schema.ts';

// ---------------------------------------------------------------------------
// The named-error vocabulary (O32.1, spec line 1794) — the machine's debugging
// contract: the error names the field + the value + the remedy.
// ---------------------------------------------------------------------------

export function profileInvalid(field: string, value: unknown, remedy: string): Error {
  return new Error(`PROFILE_INVALID: field=${field} value=${JSON.stringify(value)} remedy=${remedy}`);
}

export function corpusMissing(profilePath: string): Error {
  return new Error(`CORPUS_MISSING: path=${profilePath} remedy=the corpus file must exist (fix the profile's rules.corpus)`);
}

export function historyMissing(profilePath: string): Error {
  return new Error(`HISTORY_MISSING: path=${profilePath} remedy=the failure log must exist (fix the profile's history.failureLogs)`);
}

// ---------------------------------------------------------------------------
// The YAML-subset parser (fail-closed)
// ---------------------------------------------------------------------------

/** A parse failure in the YAML subset — carries the field context + the offending line. */
class YamlParseError extends Error {
  readonly fieldPath: string;
  readonly lineText: string;
  readonly lineNo: number;

  constructor(fieldPath: string, lineText: string, lineNo: number, reason: string) {
    const near = lineText.trim() === '' ? '' : ` near "${lineText.trim()}"`;
    super(`yaml parse error at line ${lineNo}: ${reason}${near}`);
    this.name = 'YamlParseError';
    this.fieldPath = fieldPath;
    this.lineText = lineText;
    this.lineNo = lineNo;
  }
}

function yamlErr(keyPath: string[], text: string, lineNo: number, reason: string): never {
  throw new YamlParseError(keyPath.join('.'), text, lineNo, reason);
}

/** Strip a `#` comment outside quoted strings; return the comment-stripped text. */
function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === null) {
      if (c === "'" || c === '"') q = c;
      else if (c === '#') return s.slice(0, i);
    } else if (q === "'") {
      if (c === "'") { if (s[i + 1] === "'") i++; else q = null; }
    } else {
      if (c === '\\') i++;
      else if (c === '"') q = null;
    }
  }
  return s;
}

/** Track the quote state across a string; return the open quote char or null. */
function scanQuoteState(s: string, open: string | null): string | null {
  let q = open;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === null) {
      if (c === "'" || c === '"') q = c;
    } else if (q === "'") {
      if (c === "'") { if (s[i + 1] === "'") i++; else q = null; }
    } else {
      if (c === '\\') i++;
      else if (c === '"') q = null;
    }
  }
  return q;
}

/** Strip comments while returning the final quote state (for folded-string detection). */
function stripCommentWithState(s: string): { text: string; quoteOpen: string | null } {
  let q: string | null = null;
  let cut = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === null) {
      if (c === "'" || c === '"') q = c;
      else if (c === '#') { cut = i; break; }
    } else if (q === "'") {
      if (c === "'") { if (s[i + 1] === "'") i++; else q = null; }
    } else {
      if (c === '\\') i++;
      else if (c === '"') q = null;
    }
  }
  return { text: s.slice(0, cut).trimEnd(), quoteOpen: q };
}

/**
 * Fold multi-line quoted strings (YAML folded scalars) into single logical lines
 * and strip comments/blank lines. Continuation lines join with a single space
 * (YAML's newline→space rule for double-quoted scalars) and their leading
 * indentation is removed.
 */
function preprocess(physical: string[]): { indent: number; text: string; line: number }[] {
  const out: { indent: number; text: string; line: number }[] = [];
  let folding: string | null = null;   // the open quote char across a folded value
  let currentText = '';
  let currentIndent = 0;
  let currentLineNo = 0;

  for (let i = 0; i < physical.length; i++) {
    const raw = physical[i];

    if (folding !== null) {
      // a continuation of a folded quoted value — YAML joins with a space
      const stripped = raw.trimStart();
      currentText += ' ' + stripped;
      folding = scanQuoteState(stripped, folding);
      if (folding === null) {
        // the quote closed — the logical line is complete; trailing content is a comment
        out.push({ indent: currentIndent, text: stripComment(currentText).trimEnd(), line: currentLineNo });
        currentText = '';
      }
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed === '') continue;
    if (/^\t/.test(trimmed)) yamlErr([], trimmed, i + 1, 'tabs are not allowed in indentation (the subset is space-indented)');

    const indent = raw.length - raw.trimStart().length;
    const { text, quoteOpen } = stripCommentWithState(trimmed);
    if (text.trim() === '') continue;

    if (quoteOpen !== null) {
      folding = quoteOpen;
      currentText = text;
      currentIndent = indent;
      currentLineNo = i + 1;
    } else {
      out.push({ indent, text, line: i + 1 });
    }
  }

  if (folding !== null) yamlErr([], currentText, currentLineNo, 'unterminated quoted string');
  return out;
}

/** Split a flow string on a separator at the TOP nesting level (quotes + braces/brackets respected). */
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let depth = 0;
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === null) {
      if (c === "'" || c === '"') q = c;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      else if (c === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    } else if (q === "'") {
      if (c === "'") { if (s[i + 1] === "'") i++; else q = null; }
    } else {
      if (c === '\\') i++;
      else if (c === '"') q = null;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

function unescapeDouble(s: string): string {
  return s.replace(/\\(.)/g, (_m, ch: string) => {
    switch (ch) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '0': return '\0';
      case '"': return '"';
      case '\\': return '\\';
      case "'": return "'";
      default: return ch; // unknown escapes pass the char through (none in the profile)
    }
  });
}

/** Parse a scalar token into a JS value (number | boolean | null | string). */
function parseScalar(t: string): string | number | boolean | null {
  if (t === '') return null;
  const lower = t.toLowerCase();
  if (lower === 'null' || t === '~') return null;
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  return t;
}

/** Parse a quoted scalar; asserts the quote closes on this logical line. */
function parseQuoted(t: string, line: number): string {
  if (t.startsWith("'")) {
    if (t.length < 2 || !t.endsWith("'")) yamlErr([], t, line, 'unterminated single-quoted string');
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t.startsWith('"')) {
    if (t.length < 2 || !t.endsWith('"')) yamlErr([], t, line, 'unterminated double-quoted string');
    return unescapeDouble(t.slice(1, -1));
  }
  yamlErr([], t, line, `unexpected token: "${t}"`);
}

function parseFlowArray(inner: string, line: number): unknown[] {
  const arr: unknown[] = [];
  if (inner.trim() === '') return arr;
  for (const part of splitTopLevel(inner, ',')) {
    const p = part.trim();
    if (p === '') continue;
    arr.push(parseFlowValue(p, line));
  }
  return arr;
}

function parseFlowMap(inner: string, line: number): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  if (inner.trim() === '') return obj;
  for (const part of splitTopLevel(inner, ',')) {
    const p = part.trim();
    if (p === '') continue;
    const ci = findTopLevelColon(p);
    if (ci < 0) yamlErr([], p, line, `flow map entry "${p}" must be "key: value"`);
    const k = p.slice(0, ci).trim();
    if (k === '' || /["'{}[\]\s]/.test(k)) yamlErr([], p, line, `flow map key "${k}" is not a plain key`);
    const v = p.slice(ci + 1).trim();
    obj[k] = v === '' ? null : parseFlowValue(v, line);
  }
  return obj;
}

/** Find the first `:` outside quotes/brackets/braces in a flow string. */
function findTopLevelColon(s: string): number {
  let depth = 0;
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === null) {
      if (c === "'" || c === '"') q = c;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      else if (c === ':' && depth === 0) return i;
    } else if (q === "'") {
      if (c === "'") { if (s[i + 1] === "'") i++; else q = null; }
    } else {
      if (c === '\\') i++;
      else if (c === '"') q = null;
    }
  }
  return -1;
}

/** Parse a single-line flow value: flow map | flow array | quoted | scalar. */
function parseFlowValue(token: string, line: number): unknown {
  const t = token.trim();
  if (t === '') return null;
  if (t.startsWith('{')) {
    if (!t.endsWith('}')) yamlErr([], t, line, `flow map is not closed on a single line: "${t}"`);
    return parseFlowMap(t.slice(1, -1), line);
  }
  if (t.startsWith('[')) {
    if (!t.endsWith(']')) yamlErr([], t, line, `flow array is not closed on a single line: "${t}"`);
    return parseFlowArray(t.slice(1, -1), line);
  }
  if (t.startsWith("'") || t.startsWith('"')) return parseQuoted(t, line);
  if (t.indexOf(':') >= 0) yamlErr([], t, line, `an unquoted value containing ":" is outside the supported subset: "${t}"`);
  return parseScalar(t);
}

/**
 * Parse the YAML-subset document. The profile shape (spec §8.2) is the acceptance
 * shape: a top-level block mapping with nested mappings, block sequences of
 * scalars, block sequences of multi-line maps (stages), and single-line flow
 * maps/arrays as values. Anything outside → YamlParseError → PROFILE_INVALID.
 */
export function parseYamlSubset(raw: string): Record<string, unknown> {
  const logical = preprocess(raw.split('\n'));
  if (logical.length === 0) yamlErr([], '(empty document)', 1, 'the profile must contain a top-level mapping');

  let pos = 0;
  const keyPath: string[] = [];

  function parseMapping(indent: number): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    while (pos < logical.length) {
      const l = logical[pos];
      if (l.indent < indent) break;
      if (l.indent > indent) yamlErr(keyPath, l.text, l.line, `unexpected indentation (expected depth ${indent})`);
      if (l.text.startsWith('-')) yamlErr(keyPath, l.text, l.line, 'a sequence item cannot appear where a mapping key is expected');
      const ci = l.text.indexOf(':');
      if (ci < 0) yamlErr(keyPath, l.text, l.line, 'expected "key: value"');
      const key = l.text.slice(0, ci).trim();
      if (key === '') yamlErr(keyPath, l.text, l.line, 'empty mapping key');
      if (/["'{}[\]\s]/.test(key)) yamlErr(keyPath, l.text, l.line, `key "${key}" is not a plain scalar key`);
      const rest = l.text.slice(ci + 1).trim();
      pos++;
      keyPath.push(key);
      if (rest === '') {
        if (pos < logical.length && logical[pos].indent > indent) {
          const childIndent = logical[pos].indent;
          obj[key] = logical[pos].text.startsWith('-') ? parseSequence(childIndent) : parseMapping(childIndent);
        } else {
          obj[key] = null;
        }
      } else {
        obj[key] = parseFlowValue(rest, l.line);
      }
      keyPath.pop();
    }
    return obj;
  }

  function parseSequence(indent: number): unknown[] {
    const arr: unknown[] = [];
    while (pos < logical.length) {
      const l = logical[pos];
      if (l.indent < indent) break;
      if (l.indent > indent) yamlErr(keyPath, l.text, l.line, 'unexpected indentation inside a sequence');
      if (!l.text.startsWith('-')) yamlErr(keyPath, l.text, l.line, 'expected a "- " sequence item');
      const item = l.text.slice(1).trimStart();
      pos++;
      if (item === '') yamlErr(keyPath, l.text, l.line, 'a sequence item must have an inline value in this subset');

      // a block-map item: "- key: value" (the stages form — continuation keys at a deeper indent)
      const ci = item.indexOf(':');
      const isMapItem = ci > 0 && !/^[{[]/.test(item) && !(item.startsWith("'") || item.startsWith('"'));
      if (isMapItem) {
        const key = item.slice(0, ci).trim();
        if (key === '' || /["'{}[\]\s]/.test(key)) yamlErr(keyPath, l.text, l.line, `sequence map key "${key}" is not a plain key`);
        const rest = item.slice(ci + 1).trim();
        const itemMap: Record<string, unknown> = {};
        keyPath.push(String(arr.length), key);
        if (rest === '') {
          if (pos < logical.length && logical[pos].indent > indent) {
            const childIndent = logical[pos].indent;
            itemMap[key] = logical[pos].text.startsWith('-') ? parseSequence(childIndent) : parseMapping(childIndent);
          } else {
            itemMap[key] = null;
          }
        } else {
          itemMap[key] = parseFlowValue(rest, l.line);
          // continuation keys (entry:/contract:) at a deeper indent belong to this item
          if (pos < logical.length && logical[pos].indent > indent) {
            Object.assign(itemMap, parseMapping(logical[pos].indent));
          }
        }
        arr.push(itemMap);
        keyPath.pop(); keyPath.pop();
      } else {
        arr.push(parseFlowValue(item, l.line));
      }
    }
    return arr;
  }

  const root = parseMapping(0);
  if (pos < logical.length) yamlErr(keyPath, logical[pos].text, logical[pos].line, 'unexpected trailing content');
  return root;
}

// ---------------------------------------------------------------------------
// The loader
// ---------------------------------------------------------------------------

/** The first zod issue's offending value — zod 4.1.8 does NOT populate
 * `issue.received` (verified), so the received value is extracted by walking the
 * issue path through the parsed input. Falls back to `undefined` when unwalkable. */
function extractReceived(input: unknown, p: PropertyKey[]): unknown {
  let cur: unknown = input;
  for (const k of p) {
    if (cur !== null && typeof cur === 'object' && k in (cur as Record<PropertyKey, unknown>)) {
      cur = (cur as Record<PropertyKey, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Load + validate the profile. Fail-closed: the machine NEVER runs on an invalid
 * profile (O16). The frozen ProjectProfile is returned on success.
 */
export function loadProfile(profilePath: string): ProjectProfile {
  // (a) the file must exist
  if (!fs.existsSync(profilePath)) {
    throw profileInvalid('profilePath', profilePath, 'the profile file must exist');
  }

  // (b) read
  let raw: string;
  try {
    raw = fs.readFileSync(profilePath, 'utf8');
  } catch (e: unknown) {
    throw profileInvalid('profilePath', profilePath, `the profile file must be readable: ${String(e)}`);
  }

  // (c) parse — .json → JSON.parse; otherwise the YAML subset
  let parsed: unknown;
  if (profilePath.endsWith('.json')) {
    try {
      parsed = JSON.parse(raw);
    } catch (e: unknown) {
      throw profileInvalid('yaml', raw.slice(0, 200), `the profile JSON must parse: ${String(e)}`);
    }
  } else {
    try {
      parsed = parseYamlSubset(raw);
    } catch (e: unknown) {
      if (e instanceof YamlParseError) {
        throw profileInvalid(e.fieldPath === '' ? 'yaml' : e.fieldPath, e.lineText, `the profile YAML must parse within the supported subset - ${e.message}`);
      }
      throw profileInvalid('yaml', raw.slice(0, 120), `the profile YAML must parse: ${String(e)}`);
    }
  }

  // (d) zod safeParse → PROFILE_INVALID with ALL issues' fields + values + a
  // self-contained remedy. BUG-D5 FIX (2026-08-27 container battle-test): the
  // old error surfaced ONLY the first issue and pointed its remedy at
  // profile-schema.ts — unreadable in deployed (dist-only) environments. The
  // predictable consequence, observed LIVE in-container: agents brute-forced
  // field values field-by-field because no obtainable artifact carried the
  // contract. THE FIX: every issue is listed in ONE error, and the remedy now
  // embeds a MINIMAL-VIABLE-PROFILE template the caller can copy, fill the two
  // bracketed paths in, and re-run — zero source access required.
  const result = ProjectProfileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 12);
    const collapseNote =
      result.error.issues.length > issues.length
        ? ` | (+${result.error.issues.length - issues.length} more issues truncated - fix these first)`
        : '';
    const detail = issues
      .map((issue) => {
        const field = issue.path.join('.') || '(top-level)';
        const value = extractReceived(parsed, issue.path);
        const valueText = value === undefined ? '' : ` value=${JSON.stringify(value)}`;
        return `${field}:${valueText} ${issue.message}`;
      })
      .join(' | ') + collapseNote;
    const remedy =
      'MUST be written per this embedded minimal-viable-profile YAML template - fill ONLY the two <angle-bracket> paths: ' +
      'profileVersion: 1 | project: { name: p, root: </abs/project/root>, languages: [typescript], entryPoints: [src/main.ts], build: bun run build, test: bun test } | ' +
      "graph: { substrate: native-ast, scope: [src], excludes: ['node_modules', 'dist', '.trident'] } | " +
      'rules: { corpus: [<path/to/existing/spec.md>] } | pipeline: { stages: [ { id: s1, entry: main, contract: stage-contract-prose } ] } | history: { failureLogs: [] } | awareness: { docs: [] }' +
      ' | ALL-REQUIRED-TOP-LEVEL-FIELDS = profileVersion, project, graph, rules, pipeline, history, awareness';
    throw new Error(`PROFILE_INVALID (${result.error.issues.length} issue${result.error.issues.length === 1 ? '' : 's'}): ${detail} remedy=${remedy}`);
  }
  const profile = result.data;

  // (e) project.root — realpath BEFORE the exists check (spec line 532: a
  // symlinked root resolves); then EXISTS + isDirectory, else PROFILE_INVALID
  let resolvedRoot: string;
  try {
    resolvedRoot = fs.realpathSync(profile.project.root);
  } catch {
    throw profileInvalid('project.root', profile.project.root, 'the project root must exist and be a directory');
  }
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw profileInvalid('project.root', profile.project.root, 'the project root must exist and be a directory');
  }

  // (f) every rules.corpus path EXISTS (resolved against the project root), else CORPUS_MISSING {path}
  for (const entry of profile.rules.corpus) {
    if (!fs.existsSync(path.resolve(resolvedRoot, entry))) {
      throw corpusMissing(entry);
    }
  }

  // (g) every listed history.failureLogs path EXISTS, else HISTORY_MISSING {path}
  //     — the named-error contract at line 1794 WINS over the §3.1:479 comment
  for (const entry of profile.history.failureLogs) {
    if (!fs.existsSync(path.resolve(resolvedRoot, entry))) {
      throw historyMissing(entry);
    }
  }

  // (h) the frozen profile
  return profile;
}
