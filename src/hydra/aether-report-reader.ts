import * as fs from 'node:fs';

// ── Grammar constants — single source of truth (hardcode ban: never duplicate inline) ──
export const MD_FINDING_HEADER = '## FINDING:';
export const MD_SUMMARY_HEADER = '## SUMMARY';
export const MD_FIELD_KEYS = [
  'predicate',
  'file',
  'evidence',
  'spec',
  'severity',
  'confidence',
  'layer',
  'object',
] as const;

export const MD_REQUIRED_FIELDS = ['predicate', 'file', 'evidence', 'spec'] as const;

// Legacy R23 header:  ### F-THRESHOLD-01 [CRITICAL] — subject   (em dash or hyphen)
const LEGACY_F_HEADER_RE =
  /^###\s+F-(\S+)\s+\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s+[—-]\s+(.+)$/gm;
const REPORT_PREDICATE_RE = /^##\s+Predicate:\s*`?([^`\n]+)`?/m;
const HUNT_ID_RE = /\*\*Hunt ID:\*\*\s*([^\n]+)/;
const FILE_LINE_RE = /([\w./@\-]+\.[a-zA-Z]{1,4}):(\d+)/;
const BACKTICK_SPAN_RE = /`([^`]{10,})`/g;

export interface FindingsReadResult {
  findings: unknown;
  fileBytes: number;
  fileMtime: number;
  raw: string;
}

function stripOuterQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('`') && t.endsWith('`'))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function extractSummary(raw: string, fallbackCount: number): string {
  // Prefer ## SUMMARY body
  const summaryRe = new RegExp(
    '^##\\s+SUMMARY\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|\\Z)',
    'im',
  );
  const m = raw.match(summaryRe);
  if (m && m[1] && m[1].trim().length > 0) return m[1].trim().slice(0, 4000);
  // Fallback: first # heading text
  const h1 = raw.match(/^#\s+(.+)$/m);
  if (h1 && h1[1]) return `${h1[1].trim()} — ${fallbackCount} finding(s) extracted from markdown report`;
  return `${fallbackCount} finding(s) extracted from markdown report`;
}

function parseFieldLines(blockBody: string): Map<string, string> {
  const map = new Map<string, string>();
  const lineRe = /^\s*-\s*(\w+):\s*(.+)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(blockBody)) !== null) {
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    // only keep known grammar keys (lowercased match against MD_FIELD_KEYS)
    const known = (MD_FIELD_KEYS as readonly string[]).includes(key);
    if (known) map.set(key, val);
    // unknown keys also kept as-is for forward-compat (carry as string)
    else map.set(key, val);
  }
  return map;
}

// ── Canonical parser: ## FINDING: blocks with - key: value lines ──
function parseCanonicalBlocks(raw: string): { candidates: unknown[]; summary: string } | null {
  const headerRe = /^##\s+FINDING:\s*(.+)$/gm;
  const headers: { subject: string; index: number }[] = [];
  let hm: RegExpExecArray | null;
  while ((hm = headerRe.exec(raw)) !== null) {
    headers.push({ subject: hm[1]!.trim(), index: hm.index });
  }
  if (headers.length === 0) return null; // no canonical blocks — caller falls to legacy/JSON

  const candidates: unknown[] = [];
  let firstError: Error | null = null;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    const nextIdx = i + 1 < headers.length ? headers[i + 1]!.index : raw.length;
    const blockBody = raw.slice(h.index, nextIdx);
    const fields = parseFieldLines(blockBody);

    // Validate required fields — error paths FIRST, named GRAMMAR_VIOLATION
    for (const req of MD_REQUIRED_FIELDS) {
      if (!fields.has(req) || !fields.get(req) || fields.get(req)!.trim().length === 0) {
        const err = new Error(
          `GRAMMAR_VIOLATION: block "${h.subject}" missing required field '${req}' — each ${MD_FINDING_HEADER} block must carry - predicate, - file (path:line), - evidence, - spec`,
        );
        // record first error, but continue collecting other blocks' errors is not needed — throw immediately (loud fail)
        if (!firstError) firstError = err;
        // per spec: conversational prose with field structure is required; a block missing fields is a named violation, not a silent skip
        throw err;
      }
    }

    const predicate = stripOuterQuotes(fields.get('predicate')!);
    const fileField = stripOuterQuotes(fields.get('file')!);
    const evidenceRaw = fields.get('evidence')!;
    const evidence = stripOuterQuotes(evidenceRaw);
    const specClause = stripOuterQuotes(fields.get('spec')!);

    // file:line split at last colon
    const colonAt = fileField.lastIndexOf(':');
    if (colonAt < 1 || colonAt === fileField.length - 1) {
      throw new Error(
        `GRAMMAR_VIOLATION: block "${h.subject}" malformed field 'file' — expected "<path>:<line>" got "${fileField}"`,
      );
    }
    const file = fileField.slice(0, colonAt).trim();
    const lineStr = fileField.slice(colonAt + 1).trim();
    const line = Number.parseInt(lineStr, 10);
    if (!Number.isFinite(line) || line <= 0 || !Number.isInteger(line)) {
      throw new Error(
        `GRAMMAR_VIOLATION: block "${h.subject}" malformed field 'file' line part — expected positive integer got "${lineStr}"`,
      );
    }
    if (evidence.length === 0) {
      throw new Error(`GRAMMAR_VIOLATION: block "${h.subject}" malformed field 'evidence' — empty after stripping quotes`);
    }

    const candidate: Record<string, unknown> = {
      subject: h.subject,
      predicate,
      file,
      line,
      evidence,
      implicatedSpecClause: specClause,
    };
    // Optional / pass-through fields
    const layerVal = fields.get('layer');
    if (layerVal) candidate.layer = stripOuterQuotes(layerVal);
    else candidate.layer = 'unknown-layer';

    const objectVal = fields.get('object');
    if (objectVal) candidate.object = stripOuterQuotes(objectVal);
    else candidate.object = 'Contract';

    const sev = fields.get('severity');
    if (sev) {
      const s = stripOuterQuotes(sev).toUpperCase();
      if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(s)) {
        throw new Error(
          `GRAMMAR_VIOLATION: block "${h.subject}" malformed field 'severity' — expected CRITICAL|HIGH|MEDIUM|LOW got "${sev}"`,
        );
      }
      candidate.severity = s;
    }
    const conf = fields.get('confidence');
    if (conf) {
      const n = Number.parseFloat(stripOuterQuotes(conf));
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new Error(
          `GRAMMAR_VIOLATION: block "${h.subject}" malformed field 'confidence' — expected 0.0-1.0 got "${conf}"`,
        );
      }
      candidate.confidence = n;
    }

    candidates.push(candidate);
  }

  // If headers existed but every block threw, the throw above already surfaced.
  // If we reach here with zero candidates (should not happen), treat as null to allow fallback.
  if (candidates.length === 0) {
    if (firstError) throw firstError;
    return null;
  }
  const summary = extractSummary(raw, candidates.length);
  return { candidates, summary };
}

// ── Legacy R23 recovery: ### F-ID [SEV] — subject  blocks ──
// Derives layer from Hunt ID / report predicate, file:line from body, evidence from backtick spans.
// This path is recovery-only for the live-run R23 report; it is intentionally narrow to avoid
// over-tolerating free prose (noise still rejects).
function parseLegacyR23Blocks(raw: string): { candidates: unknown[]; summary: string } | null {
  // Find all legacy headers
  const headers: { id: string; severity: string; subject: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  // Reset lastIndex for global regex
  LEGACY_F_HEADER_RE.lastIndex = 0;
  while ((m = LEGACY_F_HEADER_RE.exec(raw)) !== null) {
    headers.push({ id: m[1]!, severity: m[2]!, subject: m[3]!.trim(), index: m.index });
  }
  if (headers.length === 0) return null;

  // Report-level predicate and layer
  const predMatch = raw.match(REPORT_PREDICATE_RE);
  const reportPredicate = predMatch ? predMatch[1]!.trim().replace(/^`|`$/g, '').split(/\s+/)[0]! : 'unknown';
  const huntMatch = raw.match(HUNT_ID_RE);
  const reportLayer = huntMatch ? huntMatch[1]!.trim() : 'unknown-layer';

  const candidates: unknown[] = [];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    const nextIdx = i + 1 < headers.length ? headers[i + 1]!.index : raw.length;
    const body = raw.slice(h.index, nextIdx);

    // file:line — first FILE_LINE_RE in body
    const fl = body.match(FILE_LINE_RE);
    if (!fl || !fl[1] || !fl[2]) {
      // Legacy block without file:line is not a valid finding — skip (do not throw) so that
      // other blocks can still yield candidates; if ALL blocks lack file:line, caller gets null -> JSON fallback -> GRAMMAR_VIOLATION.
      continue;
    }
    const file = fl[1].trim();
    const line = Number.parseInt(fl[2]!, 10);
    if (!Number.isFinite(line) || line <= 0) continue;

    // evidence — first backtick span >=10 chars that looks like code (not prose between spans)
    let evidence = '';
    let bm: RegExpExecArray | null;
    BACKTICK_SPAN_RE.lastIndex = 0;
    // Prefer spans inside **Code does:** / **Evidence:** sections (code-proximal)
    const codeSectionIdx = body.indexOf('**Code does:**');
    const evidenceSectionIdx = body.indexOf('**Evidence:**');
    const preferredStart = codeSectionIdx >= 0 ? codeSectionIdx : evidenceSectionIdx >= 0 ? evidenceSectionIdx : 0;
    const searchBody = preferredStart > 0 ? body.slice(preferredStart) : body;
    // Reset regex on searchBody
    BACKTICK_SPAN_RE.lastIndex = 0;
    let searchTarget = searchBody;
    // Also keep original body as fallback if preferred yields nothing
    for (const target of [searchTarget, body]) {
      BACKTICK_SPAN_RE.lastIndex = 0;
      while ((bm = BACKTICK_SPAN_RE.exec(target)) !== null) {
        const span = bm[1]!.trim();
        if (/^[\w./@\-]+\.[a-zA-Z]{1,4}:\d+(-\d+)?$/.test(span)) continue;
        if (span.length < 10) continue;
        // prose-between-spans filter: if span contains markdown headings or pure natural language without code chars, skip
        // code-like must contain = ( ) ; . : or Math. or if/for/const etc
        const codeLike = /[=(){};]|\b(Math|if|for|const|let|var|function|return|import)\b|\.\w+\(/.test(span);
        const isProseBetween = span.includes('**') || span.includes('Spec expects') || span.includes('Code does');
        if (isProseBetween && !codeLike) continue;
        if (!codeLike && span.split(' ').length > 8) continue; // long natural language without code chars
        evidence = span;
        break;
      }
      if (evidence) break;
    }
    if (!evidence) {
      // Fallback: use the subject + file context as evidence (still non-empty, honest)
      evidence = `${h.subject} — ${file}:${line}`;
    }

    candidates.push({
      subject: h.subject,
      predicate: reportPredicate,
      object: 'Contract', // domain-derived: LASME/MPSE findings are contract conformance (spec §2.4); documented in code comment
      file,
      line,
      evidence,
      severity: h.severity,
      layer: reportLayer,
    });
  }

  if (candidates.length === 0) return null;
  const summary = extractSummary(raw, candidates.length);
  return { candidates, summary };
}

export function parseMarkdownFindings(raw: string): { candidates: unknown[]; summary: string } | null {
  // Primary: canonical ## FINDING: blocks — error paths FIRST
  const canonical = parseCanonicalBlocks(raw);
  if (canonical) return canonical;
  // Recovery: legacy R23 ### F- blocks
  const legacy = parseLegacyR23Blocks(raw);
  if (legacy) return legacy;
  // No markdown findings at all — signal caller to try JSON dialect
  return null;
}

function extractJsonFromText(txt: string): unknown {
  const fenced = txt.match(/```json\s*\n([\s\S]*?)\n```/);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_e) {
      void (_e as Error).message;
    }
  }
  const fenced2 = txt.match(/```json([\s\S]*?)```/);
  if (fenced2 && fenced2[1]) {
    try {
      return JSON.parse(fenced2[1].trim());
    } catch (_e) {
      void (_e as Error).message;
    }
  }
  try {
    return JSON.parse(txt.trim());
  } catch (_e) {
    void (_e as Error).message;
  }
  const objStart = txt.indexOf('{');
  if (objStart >= 0) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = objStart; i < txt.length; i++) {
      const ch = txt[i] as string;
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const cand = txt.slice(objStart, i + 1);
          try {
            return JSON.parse(cand);
          } catch (_e) {
            void (_e as Error).message;
            break;
          }
        }
      }
    }
  }
  throw new Error('REPORT_PARSE_FAILED: no parseable JSON found');
}

export async function readFindingsReport(
  reportPath: string,
  schema?: { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { message: string } } },
): Promise<FindingsReadResult> {
  if (!reportPath || typeof reportPath !== 'string' || reportPath.trim() === '') throw new Error('HUNTER_NO_REPORT: reportPath required');
  let stat: fs.Stats;
  try {
    stat = fs.statSync(reportPath);
  } catch (_e) {
    void (_e as Error).message;
    throw new Error('HUNTER_NO_REPORT: ' + reportPath);
  }
  let raw: string;
  try {
    raw = fs.readFileSync(reportPath, 'utf-8');
  } catch (e) {
    throw new Error('HUNTER_NO_REPORT: ' + String((e as Error).message));
  }
  if (raw.trim().length === 0) throw new Error('REPORT_PARSE_FAILED: empty file');

  // ── Primary: markdown grammar ──
  let mdCandidates: { candidates: unknown[]; summary: string } | null = null;
  try {
    mdCandidates = parseMarkdownFindings(raw);
  } catch (e) {
    // Canonical block present but malformed -> loud fail with named field (teaches fix)
    const msg = String((e as Error).message);
    if (msg.startsWith('GRAMMAR_VIOLATION')) throw e;
    // Unexpected error in markdown path -> propagate as GRAMMAR_VIOLATION
    throw new Error(`GRAMMAR_VIOLATION: ${msg}`);
  }
  if (mdCandidates && mdCandidates.candidates.length > 0) {
    const mdPayload = { candidates: mdCandidates.candidates, summary: mdCandidates.summary };
    if (schema) {
      const res = schema.safeParse(mdPayload);
      if (!res.success) throw new Error(`REPORT_SCHEMA_FAILED: ${res.error?.message ?? 'invalid'}`);
      return { findings: res.data as unknown, fileBytes: stat.size, fileMtime: stat.mtimeMs, raw };
    }
    return { findings: mdPayload, fileBytes: stat.size, fileMtime: stat.mtimeMs, raw };
  }

  // ── Dialect: JSON (back-compat) ──
  let parsed: unknown;
  let jsonError: Error | null = null;
  try {
    parsed = extractJsonFromText(raw);
  } catch (e) {
    jsonError = e as Error;
  }
  if (!jsonError && parsed !== undefined) {
    if (schema) {
      const res = schema.safeParse(parsed);
      if (!res.success) throw new Error(`REPORT_SCHEMA_FAILED: ${res.error?.message ?? 'invalid'}`);
      return { findings: res.data as unknown, fileBytes: stat.size, fileMtime: stat.mtimeMs, raw };
    }
    return { findings: parsed, fileBytes: stat.size, fileMtime: stat.mtimeMs, raw };
  }

  // ── All markdown + JSON paths failed -> named GRAMMAR_VIOLATION ──
  // If the file had no markdown blocks at all (mdCandidates === null) and no JSON, the first missing field is the finding header itself.
  throw new Error(
    `GRAMMAR_VIOLATION: no '${MD_FINDING_HEADER}' block found and no parseable JSON — findings must use the markdown finding grammar (${MD_FINDING_HEADER} <subject> + - predicate, - file (path:line), - evidence, - spec) or the JSON dialect {"candidates":[...],"summary":"..."}`,
  );
}
