// SPEC-A §2.1 — the audit input pipeline (mechanic-for-mechanic port of wave-spec.ts)
import * as fs from 'node:fs';
import * as path from 'node:path';

export const AUDIT_SPEC_RELATIVE_PATH = '.trident/audit-spec.json';

export type AuditSpecState = 'FRESH' | 'EDITING' | 'VALIDATED' | 'RUNNING';

let _state: AuditSpecState = 'FRESH';
export function getAuditSpecState(): AuditSpecState { return _state; }
export function setAuditSpecState(s: AuditSpecState): void { _state = s; }

function transitionOnValidate(diags: AuditSpecDiagnostic[]): void {
  const hasError = diags.some((d) => d.severity === 'error');
  if (hasError) _state = 'EDITING';
  else _state = 'VALIDATED';
}
export function markRunning(): void { _state = 'RUNNING'; }
export function resetState(): void { _state = 'FRESH'; }

function buildTemplateShell(): string {
  return JSON.stringify({
    codebase: '[ABS PATH: the src/ root the audit scans — must EXIST on disk]',
    specs: ['[ABS PATH: a CURRENT-generation spec governing this codebase — must EXIST. NO stale specs from 8 checkpoints ago unless there is a tangible reason]'],
    focuses: ['[OPTIONAL ≥30c: a specific audit focus, e.g. \'adapter wiring in brains/\' — remove the key entirely if none]'],
    knownContext: '[FLOOR 200c: measured state, prior findings, file:line anchors the audit must reconcile]',
    doctrine: '[FLOOR 100c: verbatim operator rulings/conventions governing THIS codebase]',
    measurements: '[FLOOR 100c: counts, sizes, line counts the audit must reconcile against]',
    graphMode: '[auto|on|off — the graph-activated layers\' activation. auto = active iff the SRO graph exists]',
  }, null, 2);
}

const PLACEHOLDER_RE = /^\[.*(?:FLOOR|TARGET|SET TO|NAME:|TEMPLATE:|FILEPATH:|DUPLICATE|ABS PATH|OPTIONAL).*\]$/is;

export function isPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return PLACEHOLDER_RE.test(value.trim());
}

export function isTemplateShell(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed.codebase === 'string' && isPlaceholder(parsed.codebase)) return true;
    if (Array.isArray(parsed.specs) && parsed.specs.length > 0 && parsed.specs.every((v: unknown) => isPlaceholder(v))) return true;
    if (typeof parsed.knownContext === 'string' && isPlaceholder(parsed.knownContext)) return true;
    if (typeof parsed.doctrine === 'string' && isPlaceholder(parsed.doctrine)) return true;
    if (typeof parsed.measurements === 'string' && isPlaceholder(parsed.measurements)) return true;
    if (typeof parsed.graphMode === 'string' && isPlaceholder(parsed.graphMode)) return true;
    return false;
  } catch { return true; }
}

export interface AuditSpecDiagnostic {
  field: string;
  severity: 'error' | 'warning';
  message: string;
  fix: string;
}

const CTX_FLOORS: Record<string, number> = {
  knownContext: 200,
  doctrine: 100,
  measurements: 100,
};

function hasTsFilesRecursive(root: string): boolean {
  try {
    const stack: string[] = [root];
    const skip = new Set(['node_modules', 'dist', '.git', '.trident', 'coverage', '.next', 'build', 'out']);
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (skip.has(e.name)) continue;
          stack.push(p);
        } else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
          return true;
        }
      }
    }
    return false;
  } catch { return false; }
}

function hasKnowledgeGraph(projectRoot: string): boolean {
  const dbPath = path.join(projectRoot, '.trident', 'knowledge-graph', 'shared.db');
  try { return fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0; } catch { return false; }
}

export function validateAuditSpecContent(content: string, projectRoot: string): AuditSpecDiagnostic[] {
  const diags: AuditSpecDiagnostic[] = [];
  let parsed: any;
  try { parsed = JSON.parse(content); }
  catch (e) {
    return [{ field: 'JSON', severity: 'error', message: `parse error: ${e instanceof Error ? e.message.slice(0, 80) : 'invalid JSON'}`, fix: 'fix the JSON syntax and save again' }];
  }

  const codebase = parsed.codebase;
  if (codebase === undefined || codebase === null || (typeof codebase === 'string' && codebase.trim().length === 0) || isPlaceholder(codebase)) {
    diags.push({ field: 'codebase', severity: 'error', message: 'audit-spec.codebase: path does not exist → use the absolute src/ root', fix: 'set codebase to an absolute path that EXISTS on disk (e.g. /home/.../src)' });
  } else if (typeof codebase === 'string') {
    if (!path.isAbsolute(codebase)) {
      diags.push({ field: 'codebase', severity: 'error', message: 'audit-spec.codebase: path does not exist → use the absolute src/ root', fix: 'use an absolute path starting with /' });
    } else if (!fs.existsSync(codebase)) {
      diags.push({ field: 'codebase', severity: 'error', message: 'audit-spec.codebase: path does not exist → use the absolute src/ root', fix: 'use the absolute src/ root that EXISTS on disk' });
    } else {
      try {
        const stat = fs.statSync(codebase);
        if (!stat.isDirectory()) {
          const hasTs = hasTsFilesRecursive(path.dirname(codebase));
          if (!hasTs) diags.push({ field: 'codebase', severity: 'warning', message: 'v1 scope is TypeScript — the tree contains 0 .ts files', fix: 'point codebase at a directory containing .ts files' });
        } else {
          if (!hasTsFilesRecursive(codebase)) {
            diags.push({ field: 'codebase', severity: 'warning', message: 'v1 scope is TypeScript — the tree contains 0 .ts files', fix: 'point codebase at a directory containing .ts files' });
          }
        }
      } catch (e) {
        diags.push({ field: 'codebase', severity: 'error', message: 'audit-spec.codebase: path does not exist → use the absolute src/ root', fix: 'use the absolute src/ root that EXISTS' });
      }
    }
  } else {
    diags.push({ field: 'codebase', severity: 'error', message: 'audit-spec.codebase: path does not exist → use the absolute src/ root', fix: 'set codebase to an absolute path string' });
  }

  const specs = parsed.specs;
  if (!Array.isArray(specs) || specs.length === 0) {
    diags.push({ field: 'specs', severity: 'error', message: 'audit-spec.specs: MANDATORY — ≥1 current-generation spec (the adjudication ground truth). A missing specs array is refused.', fix: 'add at least one absolute spec path that EXISTS on disk' });
  } else {
    const freshnessDays = typeof parsed.freshnessDays === 'number' && parsed.freshnessDays > 0 ? parsed.freshnessDays : 45;
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      if (typeof s !== 'string' || s.trim().length === 0 || isPlaceholder(s)) {
        if (isPlaceholder(s)) {
          diags.push({ field: `specs[${i}]`, severity: 'error', message: `specs[${i}]: file not found → remove the stale/absent path`, fix: 'replace the placeholder with an absolute spec path that EXISTS' });
        } else {
          diags.push({ field: `specs[${i}]`, severity: 'error', message: `specs[${i}]: file not found → remove the stale/absent path`, fix: 'use an absolute path that EXISTS on disk' });
        }
        continue;
      }
      if (!path.isAbsolute(s)) {
        diags.push({ field: `specs[${i}]`, severity: 'error', message: `specs[${i}]: file not found → remove the stale/absent path`, fix: 'use an absolute path starting with /' });
        continue;
      }
      if (!fs.existsSync(s)) {
        diags.push({ field: `specs[${i}]`, severity: 'error', message: `specs[${i}]: file not found → remove the stale/absent path`, fix: 'remove the stale/absent path or fix the location' });
        continue;
      }
      try {
        const mtimeMs = fs.statSync(s).mtimeMs;
        const ageDays = (Date.now() - mtimeMs) / 86400000;
        if (ageDays > freshnessDays) {
          const days = Math.floor(ageDays);
          diags.push({ field: `specs[${i}]`, severity: 'warning', message: `specs[${i}]: mtime ${days}d old → current generation only (remove unless there is a tangible reason)`, fix: 'use a current-generation spec or remove the stale entry' });
        }
      } catch (e) {
        diags.push({ field: `specs[${i}]`, severity: 'warning', message: `specs[${i}]: mtime check failed — ${e instanceof Error ? e.message.slice(0, 40) : String(e)}`, fix: 'ensure the spec file is readable' });
      }
    }
  }

  for (const field of Object.keys(CTX_FLOORS)) {
    const floor = CTX_FLOORS[field];
    const val = parsed[field];
    if (val === undefined || val === null) {
      diags.push({ field, severity: 'error', message: `${field}: MISSING < ${floor}c floor`, fix: `write ${floor}–${floor * 4}c of dense real context` });
    } else if (typeof val !== 'string' || isPlaceholder(val)) {
      if (isPlaceholder(val)) {
        diags.push({ field, severity: 'error', message: `${field}: ${String(val).length}c < ${floor}c floor → anchors, numbers, prior findings`, fix: `replace the bracketed instruction with ${floor * 2}–${floor * 4}c of dense real content` });
      } else {
        diags.push({ field, severity: 'error', message: `${field}: MISSING < ${floor}c floor`, fix: `write ${floor}–${floor * 4}c of dense real context` });
      }
    } else if (val.length < floor) {
      diags.push({ field, severity: 'error', message: `${field}: ${val.length}c < ${floor}c floor → anchors, numbers, prior findings`, fix: `write ${floor * 2}–${floor * 4}c with dense real context (anchors, numbers, quotes)` });
    }
  }

  if (parsed.focuses !== undefined && parsed.focuses !== null) {
    if (!Array.isArray(parsed.focuses)) {
      diags.push({ field: 'focuses', severity: 'error', message: 'focuses: must be an array of strings', fix: 'set focuses to an array or remove the key' });
    } else {
      for (let i = 0; i < parsed.focuses.length; i++) {
        const f = parsed.focuses[i];
        if (typeof f !== 'string') {
          diags.push({ field: `focuses[${i}]`, severity: 'error', message: `focuses[${i}]: not a string`, fix: 'use a string ≥30c' });
          continue;
        }
        if (isPlaceholder(f)) {
          diags.push({ field: `focuses[${i}]`, severity: 'error', message: `focuses[${i}]: ${f.length}c < 30c floor`, fix: 'replace placeholder with ≥30c of real focus or remove the key' });
          continue;
        }
        if (f.length > 0 && f.length < 30) {
          diags.push({ field: `focuses[${i}]`, severity: 'error', message: `focuses[${i}]: ${f.length}c < 30c floor`, fix: 'expand to ≥30c or remove the entry' });
        }
        if (f.length === 0) {
          diags.push({ field: `focuses[${i}]`, severity: 'error', message: `focuses[${i}]: 0c < 30c floor`, fix: 'remove empty focuses entries' });
        }
      }
    }
  }

  const graphMode = parsed.graphMode;
  if (graphMode === undefined || graphMode === null || (typeof graphMode === 'string' && graphMode.trim().length === 0) || isPlaceholder(graphMode)) {
    if (isPlaceholder(graphMode)) {
      diags.push({ field: 'graphMode', severity: 'error', message: 'graphMode: still a placeholder', fix: 'set to auto|on|off' });
    } else if (graphMode === undefined || graphMode === null) {
      diags.push({ field: 'graphMode', severity: 'error', message: 'graphMode: missing', fix: 'set to auto|on|off (default auto)' });
    } else {
      diags.push({ field: 'graphMode', severity: 'error', message: 'graphMode: missing', fix: 'set to auto|on|off' });
    }
  } else if (typeof graphMode === 'string') {
    const gm = graphMode.trim();
    if (gm !== 'auto' && gm !== 'on' && gm !== 'off') {
      diags.push({ field: 'graphMode', severity: 'error', message: `graphMode: invalid "${gm}" → use auto|on|off`, fix: 'set graphMode to auto, on, or off' });
    } else if (gm === 'on' && !hasKnowledgeGraph(projectRoot)) {
      diags.push({ field: 'graphMode', severity: 'error', message: 'graphMode=on but .trident/knowledge-graph has no SRO store → set auto or run the hunter first', fix: 'set graphMode to auto or run the hunter to build the graph' });
    }
  } else {
    diags.push({ field: 'graphMode', severity: 'error', message: 'graphMode: must be a string auto|on|off', fix: 'set to auto|on|off' });
  }

  return diags;
}

export function validateAuditSpecFile(filePath: string): AuditSpecDiagnostic[] {
  let content: string;
  try { content = fs.readFileSync(filePath, 'utf-8'); }
  catch { return [{ field: 'file', severity: 'error', message: 'spec file not found', fix: 'create the file first via ensureAuditSpecFile' }]; }
  const projectRoot = path.dirname(path.dirname(filePath));
  const diags = validateAuditSpecContent(content, projectRoot);
  transitionOnValidate(diags);
  return diags;
}

export function formatDiagnostics(diags: AuditSpecDiagnostic[]): string {
  if (diags.length === 0) return '✓ ALL FIELDS PASS — ready to run audit';
  const errors = diags.filter((d) => d.severity === 'error');
  const warnings = diags.filter((d) => d.severity === 'warning');
  const lines: string[] = [];
  lines.push('AUDIT SPEC VALIDATION');
  lines.push('');
  for (const d of diags) {
    const icon = d.severity === 'error' ? '✗' : '⚠';
    lines.push(`${icon} ${d.field}: ${d.message}`);
    lines.push(`  → ${d.fix}`);
  }
  lines.push('');
  if (errors.length > 0) {
    lines.push(`${errors.length} error(s), ${warnings.length} warning(s)`);
    lines.push('Fix all ✗ errors, then re-run the audit');
  } else {
    lines.push('All checks passed — ready to run audit (warnings advisory)');
  }
  return lines.join('\n');
}

export function resetToTemplate(projectRoot: string): void {
  const specPath = path.join(projectRoot, AUDIT_SPEC_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, buildTemplateShell(), 'utf-8');
  _state = 'FRESH';
}

export function ensureAuditSpecFile(projectRoot: string): string {
  const specPath = path.join(projectRoot, AUDIT_SPEC_RELATIVE_PATH);
  if (!fs.existsSync(specPath)) resetToTemplate(projectRoot);
  return specPath;
}

export function assertAuditSpecValid(projectRoot: string): void {
  const specPath = path.join(projectRoot, AUDIT_SPEC_RELATIVE_PATH);
  const diags = validateAuditSpecFile(specPath);
  const errors = diags.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new Error(formatDiagnostics(diags));
  }
}

export function revalidateOnWrite(content: string, projectRoot: string): string {
  const diags = validateAuditSpecContent(content, projectRoot);
  transitionOnValidate(diags);
  return formatDiagnostics(diags);
}
