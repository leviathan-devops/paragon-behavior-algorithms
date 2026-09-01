// SPEC-A §2.4 — specBindings parser: bounded parser over specs[] text → SpecBindings
import * as fs from 'node:fs';

export interface SpecBindingDeclaration {
  readonly name: string;
  readonly value: number;
  readonly tolerance: number;
  readonly specPath: string;
  readonly line: number;
  readonly quote: string;
}

export interface SpecBindingUnclear {
  readonly clause: string;
  readonly specPath: string;
  readonly line: number;
  readonly reason: string;
}

export interface SpecBindings {
  readonly declarations: readonly SpecBindingDeclaration[];
  readonly unclear: readonly SpecBindingUnclear[];
}

const NUM_RE = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?';

function extractTolerance(remainder: string): number {
  if (!remainder) return 0;
  const m1 = remainder.match(new RegExp(`(?:±|\\+\\-|\\+\\/-|\\+/-)\\s*(${NUM_RE})`, 'i'));
  if (m1) {
    const v = parseFloat(m1[1]!);
    if (!Number.isNaN(v)) return Math.abs(v);
  }
  const m2 = remainder.match(new RegExp(`tolerance\\s*:\\s*(${NUM_RE})`, 'i'));
  if (m2) {
    const v = parseFloat(m2[1]!);
    if (!Number.isNaN(v)) return Math.abs(v);
  }
  return 0;
}

function tryParseNameEquals(line: string): { name: string; value: number; tolerance: number } | null {
  const re = new RegExp(`^\\s*([a-zA-Z_$][\\w$]*(?:\\[[^\\]]+\\])?(?:\\([^)]+\\))?)\\s*=\\s*(${NUM_RE})\\s*(.*)$`);
  const m = line.match(re);
  if (!m) return null;
  const name = m[1]!.trim();
  const value = parseFloat(m[2]!);
  if (Number.isNaN(value)) return null;
  const tolerance = extractTolerance(m[3] ?? '');
  return { name, value, tolerance };
}

function tryParseNameColon(line: string): { name: string; value: number; tolerance: number } | null {
  const re = new RegExp(`^\\s*([a-zA-Z_$][\\w$\\s\\[\\]\\(\\)\\-\\|]*?)\\s*:\\s*(${NUM_RE})\\s*(.*)$`);
  const m = line.match(re);
  if (!m) return null;
  const name = m[1]!.trim();
  if (name.length === 0) return null;
  const value = parseFloat(m[2]!);
  if (Number.isNaN(value)) return null;
  const tolerance = extractTolerance(m[3] ?? '');
  return { name, value, tolerance };
}

function tryParseThreshold(line: string): { name: string; value: number; tolerance: number } | null {
  const re = new RegExp(`(?:threshold|at\\s+least|≥|>=)\\s*(${NUM_RE})`, 'i');
  const m = line.match(re);
  if (!m) return null;
  const value = parseFloat(m[1]!);
  if (Number.isNaN(value)) return null;
  const tolerance = extractTolerance(line);
  const lower = line.toLowerCase();
  let name = 'threshold';
  if (lower.includes('at least')) name = 'at least';
  if (line.includes('≥') || line.includes('>=')) name = 'threshold';
  const prefix = line.match(/([a-zA-Z_][\w$]*)\s*(?:threshold|at\s+least|≥|>=)/i);
  if (prefix && prefix[1] && prefix[1].toLowerCase() !== 'threshold' && prefix[1].toLowerCase() !== 'at') {
    name = prefix[1].trim();
  }
  return { name, value, tolerance };
}

function tryParseCardinality(line: string): { name: string; value: number; tolerance: number } | null {
  const re = new RegExp(`\\|\\s*([^|]+?)\\s*\\|\\s*=\\s*(${NUM_RE})`);
  const m = line.match(re);
  if (!m) return null;
  const inner = m[1]!.trim();
  const value = parseFloat(m[2]!);
  if (Number.isNaN(value)) return null;
  const name = `|${inner}|`;
  const tolerance = extractTolerance(line.slice((m.index ?? 0) + m[0].length));
  return { name, value, tolerance };
}

function parseTableRow(line: string): { name: string; value: number; tolerance: number } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim()).filter((c) => c.length > 0);
  if (cells.length < 2) return null;
  const headerHints = new Set(['name', 'param', 'binding', 'metric', 'value', 'tolerance', 'tol', '±', 'description', 'spec', 'clause']);
  const looksHeader = cells.every((c) => headerHints.has(c.toLowerCase()) || Number.isNaN(parseFloat(c)));
  if (looksHeader && cells.some((c) => headerHints.has(c.toLowerCase()))) {
    const hasNumeric = cells.some((c) => !Number.isNaN(parseFloat(c)));
    if (!hasNumeric) return null;
  }
  const name = cells[0]!;
  const value = parseFloat(cells[1]!);
  if (Number.isNaN(value)) return null;
  let tolerance = 0;
  if (cells.length >= 3) {
    const t = parseFloat(cells[2]!);
    if (!Number.isNaN(t)) tolerance = Math.abs(t);
    else tolerance = extractTolerance(cells[2]!);
  }
  if (tolerance === 0 && cells.length >= 3) tolerance = extractTolerance(cells.slice(2).join(' '));
  return { name, value, tolerance };
}

function isLooseBindingIntent(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;
  if (t.startsWith('#') || t.startsWith('//') || t.startsWith('>')) return false;
  if (/UNCLEAR/i.test(t)) return true;
  if (/\|\s*[^|]+\s*\|\s*=/.test(t)) return true;
  if (/(?:threshold|at\s+least|≥|>=)/i.test(t)) return true;
  if (/[a-zA-Z_$][\w$]*\s*(\[[^\]]+\])?\s*=\s*\S+/.test(t)) return true;
  if (/[a-zA-Z_$][\w$]*\s*:\s*\S+/.test(t)) return true;
  if (t.startsWith('|') && t.endsWith('|') && t.includes('|')) return true;
  return false;
}

function tryParseLine(line: string): { name: string; value: number; tolerance: number } | null {
  let r = tryParseCardinality(line);
  if (r) return r;
  r = tryParseThreshold(line);
  if (r) return r;
  r = tryParseNameEquals(line);
  if (r) return r;
  r = tryParseNameColon(line);
  if (r) return r;
  r = parseTableRow(line);
  if (r) return r;
  return null;
}

export function parseSpecBindings(specPaths: string[]): SpecBindings {
  if (!Array.isArray(specPaths)) {
    throw new TypeError('parseSpecBindings: specPaths must be an array');
  }
  const declarations: SpecBindingDeclaration[] = [];
  const unclear: SpecBindingUnclear[] = [];

  if (specPaths.length === 0) {
    return { declarations, unclear };
  }

  for (const specPath of specPaths) {
    if (typeof specPath !== 'string' || specPath.trim().length === 0) {
      unclear.push({ clause: String(specPath), specPath: String(specPath), line: 0, reason: 'invalid spec path: not a non-empty string' });
      continue;
    }
    let content: string;
    try {
      content = fs.readFileSync(specPath, 'utf-8');
    } catch (e) {
      const reason = e instanceof Error ? e.message.slice(0, 120) : String(e);
      unclear.push({ clause: specPath, specPath, line: 0, reason: `read failed: ${reason}` });
      continue;
    }
    const lines = content.split(/\r?\n/);
    let inBacktick = false;
    let backtickFence = '';
    let jsonBuffer: string[] = [];
    let jsonStartLine = 0;
    let jsonDepth = 0;
    let inJson = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const lineNum = i + 1;
      const quote = raw;
      const trimmed = raw.trim();

      if (!inBacktick && trimmed.startsWith('```')) {
        inBacktick = true;
        backtickFence = trimmed.slice(0, 3);
        continue;
      }
      if (inBacktick) {
        if (trimmed.startsWith(backtickFence)) {
          inBacktick = false;
          backtickFence = '';
          continue;
        }
        if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
        const parsed = tryParseLine(raw);
        if (parsed) {
          declarations.push({ name: parsed.name, value: parsed.value, tolerance: parsed.tolerance, specPath, line: lineNum, quote });
        } else if (isLooseBindingIntent(raw)) {
          unclear.push({ clause: trimmed, specPath, line: lineNum, reason: 'unparseable clause inside backtick block' });
        } else if (parseTableRow(raw) === null && trimmed.includes('|')) {
          const maybe = trimmed.includes('---') || trimmed.toLowerCase().includes('name') || trimmed.toLowerCase().includes('value');
          if (!maybe) {
            unclear.push({ clause: trimmed, specPath, line: lineNum, reason: 'unparseable table row' });
          }
        }
        continue;
      }

      if (!inJson && trimmed.startsWith('{')) {
        inJson = true;
        jsonBuffer = [raw];
        jsonStartLine = lineNum;
        jsonDepth = (raw.match(/{/g) ?? []).length - (raw.match(/}/g) ?? []).length;
        if (jsonDepth === 0) {
          const text = jsonBuffer.join('\n');
          try {
            const obj = JSON.parse(text);
            if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
              for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
                if (typeof v === 'number' && !Number.isNaN(v)) {
                  const tolKey = Object.keys(obj as Record<string, unknown>).find((kk) => kk.toLowerCase() === `${k.toLowerCase()}_tolerance` || kk.toLowerCase() === `${k.toLowerCase()} tolerance` || kk.toLowerCase() === 'tolerance');
                  let tolerance = 0;
                  if (tolKey) {
                    const tv = (obj as Record<string, unknown>)[tolKey];
                    if (typeof tv === 'number') tolerance = Math.abs(tv);
                  }
                  declarations.push({ name: k, value: v, tolerance, specPath, line: jsonStartLine, quote: text.slice(0, 200) });
                }
              }
            }
          } catch {
            unclear.push({ clause: text.slice(0, 200), specPath, line: jsonStartLine, reason: 'unparseable JSON block' });
          }
          inJson = false;
          jsonBuffer = [];
        }
        continue;
      }
      if (inJson) {
        jsonBuffer.push(raw);
        jsonDepth += (raw.match(/{/g) ?? []).length - (raw.match(/}/g) ?? []).length;
        if (jsonDepth <= 0) {
          const text = jsonBuffer.join('\n');
          try {
            const obj = JSON.parse(text);
            if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
              for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
                if (typeof v === 'number' && !Number.isNaN(v)) {
                  declarations.push({ name: k, value: v, tolerance: 0, specPath, line: jsonStartLine, quote: text.slice(0, 200) });
                }
              }
            }
          } catch {
            unclear.push({ clause: text.slice(0, 200), specPath, line: jsonStartLine, reason: 'unparseable JSON block' });
          }
          inJson = false;
          jsonBuffer = [];
          jsonDepth = 0;
        }
        continue;
      }

      if (trimmed.length === 0) continue;
      const isBlockquote = trimmed.startsWith('> ') || trimmed === '>';
      const isHeader = trimmed.startsWith('#');
      const isList = trimmed.startsWith('- ') || trimmed.startsWith('* ');
      if (isHeader || isBlockquote || isList) {
        const inner = trimmed.replace(/^#+\s*/, '').replace(/^>\s*/, '').replace(/^[-*]\s*/, '');
        if (inner.trim().length === 0) continue;
        const parsed = tryParseLine(inner);
        if (parsed) {
          declarations.push({ name: parsed.name, value: parsed.value, tolerance: parsed.tolerance, specPath, line: lineNum, quote });
          continue;
        }
        if (isLooseBindingIntent(inner)) {
          unclear.push({ clause: inner.trim(), specPath, line: lineNum, reason: 'unparseable clause: loose binding intent without valid numeric value' });
          continue;
        }
        continue;
      }

      const parsed = tryParseLine(raw);
      if (parsed) {
        declarations.push({ name: parsed.name, value: parsed.value, tolerance: parsed.tolerance, specPath, line: lineNum, quote });
        continue;
      }
      if (isLooseBindingIntent(raw)) {
        unclear.push({ clause: trimmed, specPath, line: lineNum, reason: 'unparseable clause: binding-like syntax without valid numeric value' });
      }
    }
  }

  return { declarations, unclear };
}
