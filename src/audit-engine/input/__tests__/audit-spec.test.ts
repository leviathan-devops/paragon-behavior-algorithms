import { describe, expect, test, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  AUDIT_SPEC_RELATIVE_PATH,
  isPlaceholder,
  isTemplateShell,
  validateAuditSpecContent,
  validateAuditSpecFile,
  formatDiagnostics,
  ensureAuditSpecFile,
  resetToTemplate,
  assertAuditSpecValid,
  revalidateOnWrite,
  getAuditSpecState,
  resetState,
} from '../audit-spec.ts';

const DENSE = (c: string, n: number) => c.repeat(Math.ceil(n / c.length)).slice(0, n);
const TMP = os.tmpdir();

function validSpec(overrides: Record<string, unknown> = {}, projectRoot?: string): string {
  const root = projectRoot ?? fs.mkdtempSync(path.join(TMP, 'audit-valid-'));
  const codebase = path.join(root, 'src');
  try { fs.mkdirSync(codebase, { recursive: true }); fs.writeFileSync(path.join(codebase, 'a.ts'), 'export const x=1;'); } catch (e: unknown) { void e; }
  const specFile = path.join(root, 'spec.md');
  try { fs.writeFileSync(specFile, '# spec\ncontent'); } catch (e: unknown) { void e; }
  const base: Record<string, unknown> = {
    codebase,
    specs: [specFile],
    knownContext: DENSE('k', 220),
    doctrine: DENSE('d', 110),
    measurements: DENSE('m', 110),
    graphMode: 'auto',
  };
  return JSON.stringify({ ...base, ...overrides }, null, 2);
}

let tmpRoot = '';

function mkRoot(): string {
  tmpRoot = fs.mkdtempSync(path.join(TMP, 'audit-spec-t-'));
  return tmpRoot;
}
afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e: unknown) { void e; }
  resetState();
});

describe('isPlaceholder', () => {
  test('detects bracketed floor instructions', () => {
    expect(isPlaceholder('[FLOOR 200c: something]')).toBe(true);
    expect(isPlaceholder('[ABS PATH: the src/ root]')).toBe(true);
    expect(isPlaceholder('[OPTIONAL \u226530c: focus]')).toBe(true);
    expect(isPlaceholder('real content that is long enough and dense')).toBe(false);
    expect(isPlaceholder(42)).toBe(false);
  });
});

describe('isTemplateShell', () => {
  test('fresh template shell is detected', () => {
    const root = mkRoot();
    resetToTemplate(root);
    const content = fs.readFileSync(path.join(root, AUDIT_SPEC_RELATIVE_PATH), 'utf-8');
    expect(isTemplateShell(content)).toBe(true);
  });
  test('valid spec is not a shell', () => {
    const c = validSpec();
    expect(isTemplateShell(c)).toBe(false);
  });
});

describe('ensure reset', () => {
  test('ensure creates template if absent', () => {
    const root = mkRoot();
    const p = ensureAuditSpecFile(root);
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, 'utf-8')).toContain('[ABS PATH');
  });
  test('reset overwrites with shell', () => {
    const root = mkRoot();
    ensureAuditSpecFile(root);
    const p = path.join(root, AUDIT_SPEC_RELATIVE_PATH);
    fs.writeFileSync(p, validSpec({}, root));
    resetToTemplate(root);
    expect(fs.readFileSync(p, 'utf-8')).toContain('[FLOOR 200c');
  });
});

describe('validation codebase', () => {
  test('missing codebase error', () => {
    const c = validSpec({ codebase: undefined });
    const diags = validateAuditSpecContent(c, TMP);
    expect(diags.some((d) => d.field === 'codebase' && d.severity === 'error')).toBe(true);
  });
  test('placeholder codebase error', () => {
    const c = validSpec({ codebase: '[ABS PATH: the src/ root]' });
    const diags = validateAuditSpecContent(c, TMP);
    expect(diags.some((d) => d.field === 'codebase' && d.severity === 'error')).toBe(true);
  });
  test('non-existing path error', () => {
    const fake = path.join(TMP, 'absolutely-not-existing-xyz-12345');
    const c = validSpec({ codebase: fake });
    const diags = validateAuditSpecContent(c, TMP);
    expect(diags.some((d) => d.field === 'codebase' && d.severity === 'error' && d.message.includes('does not exist'))).toBe(true);
  });
  test('existing dir with 0 ts warning', () => {
    const root = mkRoot();
    const emptyDir = path.join(root, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const specFile = path.join(root, 'spec.md');
    fs.writeFileSync(specFile, 'spec');
    const content = JSON.stringify({ codebase: emptyDir, specs: [specFile], knownContext: DENSE('k',220), doctrine: DENSE('d',110), measurements: DENSE('m',110), graphMode: 'auto' });
    const diags = validateAuditSpecContent(content, root);
    expect(diags.some((d) => d.severity === 'warning' && d.message.includes('0 .ts'))).toBe(true);
  });
  test('existing dir with ts no codebase warning', () => {
    const root = mkRoot();
    const c = validSpec({}, root);
    const diags = validateAuditSpecContent(c, root);
    expect(diags.filter((d) => d.field === 'codebase' && d.severity === 'warning').length).toBe(0);
  });
  test('relative path error', () => {
    const c = validSpec({ codebase: 'src' });
    const diags = validateAuditSpecContent(c, TMP);
    expect(diags.some((d) => d.field === 'codebase' && d.severity === 'error')).toBe(true);
  });
});

describe('validation specs MANDATORY', () => {
  test('missing specs MANDATORY', () => {
    const root = mkRoot();
    const dir = path.join(root, 'src'); fs.mkdirSync(dir, {recursive:true}); fs.writeFileSync(path.join(dir,'a.ts'),'x');
    const content = JSON.stringify({ codebase: dir, knownContext: DENSE('k',220), doctrine: DENSE('d',110), measurements: DENSE('m',110), graphMode: 'auto' });
    const diags = validateAuditSpecContent(content, root);
    expect(diags.some((d) => d.field === 'specs' && d.message.includes('MANDATORY'))).toBe(true);
  });
  test('empty specs array MANDATORY', () => {
    const c = validSpec({ specs: [] });
    const diags = validateAuditSpecContent(c, TMP);
    expect(diags.some((d) => d.field === 'specs' && d.message.includes('MANDATORY'))).toBe(true);
  });
  test('spec file not found specs[0]', () => {
    const fake = path.join(TMP, 'not-a-spec-xyz-999.md');
    const c = validSpec({ specs: [fake] });
    const diags = validateAuditSpecContent(c, TMP);
    expect(diags.some((d) => d.field === 'specs[0]' && d.message.includes('file not found'))).toBe(true);
  });
  test('placeholder specs entry error', () => {
    const c = validSpec({ specs: ['[ABS PATH: a CURRENT-generation spec]'] });
    const diags = validateAuditSpecContent(c, TMP);
    expect(diags.some((d) => d.field === 'specs[0]' && d.severity === 'error')).toBe(true);
  });
  test('stale mtime warning', () => {
    const root = mkRoot();
    const dir = path.join(root, 'src'); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'a.ts'),'x');
    const stale = path.join(root, 'stale.md'); fs.writeFileSync(stale,'old');
    const oldTime = Date.now() - 100 * 86400000;
    fs.utimesSync(stale, new Date(oldTime), new Date(oldTime));
    const content = JSON.stringify({ codebase: dir, specs: [stale], knownContext: DENSE('k',220), doctrine: DENSE('d',110), measurements: DENSE('m',110), graphMode: 'auto' });
    const diags = validateAuditSpecContent(content, root);
    expect(diags.some((d) => d.field === 'specs[0]' && d.severity === 'warning' && d.message.includes('old'))).toBe(true);
  });
  test('fresh spec no staleness warning', () => {
    const root = mkRoot();
    const c = validSpec({}, root);
    const diags = validateAuditSpecContent(c, root);
    expect(diags.filter((d) => d.field.startsWith('specs[') && d.severity === 'warning').length).toBe(0);
  });
  test('freshnessDays override extends horizon', () => {
    const root = mkRoot();
    const dir = path.join(root, 'src'); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'a.ts'),'x');
    const stale = path.join(root, 'stale2.md'); fs.writeFileSync(stale,'old');
    const oldTime = Date.now() - 60 * 86400000;
    fs.utimesSync(stale, new Date(oldTime), new Date(oldTime));
    const content = JSON.stringify({ codebase: dir, specs: [stale], knownContext: DENSE('k',220), doctrine: DENSE('d',110), measurements: DENSE('m',110), graphMode: 'auto', freshnessDays: 90 });
    const diags = validateAuditSpecContent(content, root);
    expect(diags.filter((d) => d.field === 'specs[0]' && d.severity === 'warning').length).toBe(0);
  });
  test('relative spec path error', () => {
    const c = validSpec({ specs: ['relative/spec.md'] });
    const diags = validateAuditSpecContent(c, TMP);
    expect(diags.some((d) => d.field === 'specs[0]' && d.severity === 'error')).toBe(true);
  });
});

describe('validation floors', () => {
  test('knownContext <200c error', () => {
    const c = validSpec({ knownContext: 'short' });
    expect(validateAuditSpecContent(c, TMP).some((d) => d.field === 'knownContext' && d.severity === 'error')).toBe(true);
  });
  test('knownContext placeholder error', () => {
    const c = validSpec({ knownContext: '[FLOOR 200c: measured state]' });
    expect(validateAuditSpecContent(c, TMP).some((d) => d.field === 'knownContext')).toBe(true);
  });
  test('doctrine <100c error', () => {
    const c = validSpec({ doctrine: 'tiny' });
    expect(validateAuditSpecContent(c, TMP).some((d) => d.field === 'doctrine' && d.severity === 'error')).toBe(true);
  });
  test('measurements <100c error', () => {
    const c = validSpec({ measurements: 'tiny' });
    expect(validateAuditSpecContent(c, TMP).some((d) => d.field === 'measurements' && d.severity === 'error')).toBe(true);
  });
  test('exact floor boundary passes', () => {
    const c = validSpec({ knownContext: DENSE('x',200), doctrine: DENSE('y',100), measurements: DENSE('z',100) });
    const diags = validateAuditSpecContent(c, TMP);
    expect(diags.filter((d) => ['knownContext','doctrine','measurements'].includes(d.field) && d.severity==='error').length).toBe(0);
  });
  test('missing doctrine error', () => {
    const raw = JSON.parse(validSpec());
    delete raw.doctrine;
    expect(validateAuditSpecContent(JSON.stringify(raw), TMP).some((d)=>d.field==='doctrine' && d.severity==='error')).toBe(true);
  });
  test('null knownContext error', () => {
    const raw = JSON.parse(validSpec());
    raw.knownContext = null;
    expect(validateAuditSpecContent(JSON.stringify(raw), TMP).some((d)=>d.field==='knownContext')).toBe(true);
  });
});

describe('validation focuses', () => {
  test('focuses entry <30c error', () => {
    const c = validSpec({ focuses: ['short'] });
    expect(validateAuditSpecContent(c, TMP).some((d)=>d.field==='focuses[0]' && d.message.includes('30c'))).toBe(true);
  });
  test('focuses placeholder error', () => {
    const c = validSpec({ focuses: ['[OPTIONAL \u226530c: a specific audit focus]'] });
    expect(validateAuditSpecContent(c, TMP).some((d)=>d.field==='focuses[0]')).toBe(true);
  });
  test('focuses absent no error', () => {
    const raw = JSON.parse(validSpec());
    delete raw.focuses;
    expect(validateAuditSpecContent(JSON.stringify(raw), TMP).filter((d)=>d.field.startsWith('focuses')).length).toBe(0);
  });
  test('focuses empty string error', () => {
    const c = validSpec({ focuses: [''] });
    expect(validateAuditSpecContent(c, TMP).some((d)=>d.field==='focuses[0]')).toBe(true);
  });
  test('focuses >=30c passes', () => {
    const c = validSpec({ focuses: [DENSE('f',35)] });
    expect(validateAuditSpecContent(c, TMP).filter((d)=>d.field.startsWith('focuses')).length).toBe(0);
  });
  test('focuses not an array error', () => {
    const c = validSpec({ focuses: 'not-array' as unknown as string[] });
    expect(validateAuditSpecContent(c, TMP).some((d)=>d.field==='focuses')).toBe(true);
  });
  test('focuses non-string entry error', () => {
    const c = validSpec({ focuses: [123 as unknown as string] });
    expect(validateAuditSpecContent(c, TMP).some((d)=>d.field==='focuses[0]')).toBe(true);
  });
});

describe('validation graphMode', () => {
  test('graphMode on without graph error', () => {
    const root = mkRoot();
    const c = validSpec({ graphMode: 'on' }, root);
    const diags = validateAuditSpecContent(c, root);
    expect(diags.some((d)=>d.field==='graphMode' && d.message.includes('has no SRO store'))).toBe(true);
  });
  test('graphMode auto without graph no error', () => {
    const root = mkRoot();
    const c = validSpec({ graphMode: 'auto' }, root);
    expect(validateAuditSpecContent(c, root).filter((d)=>d.field==='graphMode').length).toBe(0);
  });
  test('graphMode off without graph no error', () => {
    const root = mkRoot();
    const c = validSpec({ graphMode: 'off' }, root);
    expect(validateAuditSpecContent(c, root).filter((d)=>d.field==='graphMode').length).toBe(0);
  });
  test('graphMode placeholder error', () => {
    const c = validSpec({ graphMode: '[auto|on|off]' });
    expect(validateAuditSpecContent(c, TMP).some((d)=>d.field==='graphMode')).toBe(true);
  });
  test('graphMode invalid string error', () => {
    const c = validSpec({ graphMode: 'maybe' });
    expect(validateAuditSpecContent(c, TMP).some((d)=>d.field==='graphMode' && d.message.includes('invalid'))).toBe(true);
  });
  test('graphMode missing error', () => {
    const raw = JSON.parse(validSpec());
    delete raw.graphMode;
    expect(validateAuditSpecContent(JSON.stringify(raw), TMP).some((d)=>d.field==='graphMode')).toBe(true);
  });
  test('graphMode on with graph present no error', () => {
    const root = mkRoot();
    const gDir = path.join(root, '.trident', 'knowledge-graph');
    fs.mkdirSync(gDir, { recursive: true });
    fs.writeFileSync(path.join(gDir, 'shared.db'), 'not-empty');
    const c = validSpec({ graphMode: 'on' }, root);
    expect(validateAuditSpecContent(c, root).filter((d)=>d.field==='graphMode').length).toBe(0);
  });
});

describe('JSON file errors', () => {
  test('invalid JSON error JSON field', () => {
    const diags = validateAuditSpecContent('{ not json', TMP);
    expect(diags.some((d)=>d.field==='JSON')).toBe(true);
  });
  test('validateAuditSpecFile not found file error', () => {
    const fake = path.join(TMP, 'no-such-dir-xyz', 'audit-spec.json');
    const diags = validateAuditSpecFile(fake);
    expect(diags.some((d)=>d.field==='file')).toBe(true);
  });
});

describe('formatDiagnostics', () => {
  test('empty diags ready message', () => {
    expect(formatDiagnostics([])).toContain('ALL FIELDS PASS');
  });
  test('error diags contain cross and fix arrow', () => {
    const out = formatDiagnostics([{ field: 'codebase', severity: 'error', message: 'bad', fix: 'fix it' }]);
    expect(out).toContain('\u2717');
    expect(out).toContain('\u2192');
    expect(out).toContain('Fix all');
  });
  test('warning only shows warning but not blocked', () => {
    const out = formatDiagnostics([{ field: 'codebase', severity: 'warning', message: '0 .ts', fix: 'add ts' }]);
    expect(out).toContain('\u26a0');
  });
});

describe('state machine', () => {
  test('reset FRESH', () => {
    const root = mkRoot();
    resetToTemplate(root);
    expect(getAuditSpecState()).toBe('FRESH');
  });
  test('validate with errors EDITING', () => {
    resetState();
    const root = mkRoot();
    const p = path.join(root, AUDIT_SPEC_RELATIVE_PATH);
    resetToTemplate(root);
    fs.writeFileSync(p, JSON.stringify({ codebase: path.join(TMP,'nope-xyz'), specs: [], knownContext: 'x', doctrine: 'y', measurements: 'z', graphMode: 'auto' }));
    validateAuditSpecFile(p);
    expect(getAuditSpecState()).toBe('EDITING');
  });
  test('validate clean VALIDATED', () => {
    const root = mkRoot();
    resetToTemplate(root);
    const p = path.join(root, AUDIT_SPEC_RELATIVE_PATH);
    const codebase = path.join(root, 'src'); fs.mkdirSync(codebase,{recursive:true}); fs.writeFileSync(path.join(codebase,'a.ts'),'x');
    const specFile = path.join(root,'spec.md'); fs.writeFileSync(specFile,'hi');
    const content = JSON.stringify({ codebase, specs:[specFile], knownContext:DENSE('k',220), doctrine:DENSE('d',110), measurements:DENSE('m',110), graphMode:'auto'});
    fs.writeFileSync(p, content);
    validateAuditSpecFile(p);
    expect(getAuditSpecState()).toBe('VALIDATED');
  });
  test('revalidateOnWrite returns formatted block', () => {
    const root = mkRoot();
    const out = revalidateOnWrite(validSpec({}, root), root);
    expect(typeof out).toBe('string');
    expect(out.length > 0).toBe(true);
  });
});

describe('assertAuditSpecValid refusal', () => {
  test('throws with diagnostics when errors present', () => {
    const root = mkRoot();
    resetToTemplate(root);
    expect(() => assertAuditSpecValid(root)).toThrow('AUDIT SPEC VALIDATION');
  });
  test('does not throw when valid', () => {
    const root = mkRoot();
    const codebase = path.join(root, 'src'); fs.mkdirSync(codebase,{recursive:true}); fs.writeFileSync(path.join(codebase,'a.ts'),'x');
    const specFile = path.join(root,'spec.md'); fs.writeFileSync(specFile,'hi');
    const content = JSON.stringify({ codebase, specs:[specFile], knownContext:DENSE('k',220), doctrine:DENSE('d',110), measurements:DENSE('m',110), graphMode:'auto'});
    fs.mkdirSync(path.join(root, '.trident'), { recursive: true });
    fs.writeFileSync(path.join(root, AUDIT_SPEC_RELATIVE_PATH), content);
    expect(() => assertAuditSpecValid(root)).not.toThrow();
  });
});

describe('adversarial null undefined concurrent boundary', () => {
  test('null parsed fields handled', () => {
    const diags = validateAuditSpecContent(JSON.stringify({ codebase: null, specs: null, knownContext: null, doctrine: null, measurements: null, graphMode: null }), TMP);
    expect(diags.length > 3).toBe(true);
  });
  test('empty object multiple errors', () => {
    const diags = validateAuditSpecContent('{}', TMP);
    expect(diags.filter((d)=>d.severity==='error').length).toBeGreaterThanOrEqual(4);
  });
  test('concurrent ensure calls do not throw', () => {
    const root = mkRoot();
    ensureAuditSpecFile(root);
    ensureAuditSpecFile(root);
    expect(fs.existsSync(path.join(root, AUDIT_SPEC_RELATIVE_PATH))).toBe(true);
  });
  test('boundary exactly at floor lengths pass one below fails', () => {
    const atFloor = validSpec({ knownContext: DENSE('a',200) });
    expect(validateAuditSpecContent(atFloor,TMP).filter((d)=>d.field==='knownContext').length).toBe(0);
    const below = validSpec({ knownContext: DENSE('a',199) });
    expect(validateAuditSpecContent(below,TMP).some((d)=>d.field==='knownContext')).toBe(true);
  });
  test('very large focuses array handled', () => {
    const many = Array.from({length:50}, (_,i)=> i===25 ? 'short' : DENSE('f',35));
    const c = validSpec({ focuses: many });
    const diags = validateAuditSpecContent(c, TMP);
    expect(diags.some((d)=>d.field==='focuses[25]')).toBe(true);
  });
});
