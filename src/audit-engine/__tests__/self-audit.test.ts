import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runSelfAudit, scanTheatricalInContent, scanTheatricalInFiles, resolveAuditEngineRoot, collectOwnTreeFiles, SELF_AUDIT_MIN_FILES, SELF_AUDIT_FAILED } from '../enforcement/self-audit.ts';

describe('SELF-AUDIT AT LOAD — wave 6 T-7 (SPEC-1 S8 + Law 12 DEGRADED-not-hang)', () => {
  it('runSelfAudit scans ≥10 own-tree files (layers + scoring + ast) — calibration seed is measured', () => {
    const report = runSelfAudit();
    expect(typeof report.passed).toBe('boolean');
    expect(Array.isArray(report.findings)).toBe(true);
    expect(typeof report.scannedFiles).toBe('number');
    expect(typeof report.durationMs).toBe('number');
    expect(typeof report.calibrationSeed).toBe('number');
    expect(report.scannedFiles).toBeGreaterThanOrEqual(SELF_AUDIT_MIN_FILES);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.calibrationSeed).toBe(report.findings.length);
  });

  it('resolveAuditEngineRoot works from src AND dist (import.meta/require relative)', () => {
    const root = resolveAuditEngineRoot();
    expect(root !== null).toBe(true);
    if (root) {
      expect(fs.existsSync(path.join(root, 'scoring.ts'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'layers'))).toBe(true);
      const files = collectOwnTreeFiles(root);
      expect(files.length).toBeGreaterThanOrEqual(SELF_AUDIT_MIN_FILES);
      expect(files.some((f) => f.includes('layers'))).toBe(true);
      expect(files.some((f) => f.includes('scoring.ts'))).toBe(true);
      expect(files.some((f) => f.includes('ast'))).toBe(true);
    }
  });

  it('clean golden with validation stays silent — no false-fire on validated ok:true', () => {
    const cleanValidated = `export function validateInput(x: string){ if(!x) throw new Error('bad'); return {ok:true}; }
export function checkAndReturn(v: string){ validateInput(v); return {success:true}; }`;
    const findings = scanTheatricalInContent(cleanValidated, 'clean-validated.ts');
    expect(findings.length).toBe(0);
  });

  it('THE SEEDED-MUTATION PROOF: injected theatrical mutation MUST be caught — battery not fitted-to-golden (red-first)', () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-audit-mutant-'));
    try {
      const smallLayerSrc = `export function helper(x: number): number { return x + 1; }
export function validatedPath(input: string){ if(!input) throw new Error('no'); return {ok:true}; }`;
      const mutantAppend = `\nexport function ok(){return {ok:true};}\n`;
      const cleanPath = path.join(tmpdir, 'layer-clean.ts');
      const mutantPath = path.join(tmpdir, 'layer-mutant.ts');
      fs.writeFileSync(cleanPath, smallLayerSrc, 'utf-8');
      fs.writeFileSync(mutantPath, smallLayerSrc + mutantAppend, 'utf-8');

      const cleanContent = fs.readFileSync(cleanPath, 'utf-8');
      const cleanFindings = scanTheatricalInContent(cleanContent, cleanPath);
      expect(cleanFindings.length).toBe(0);

      const mutantContent = fs.readFileSync(mutantPath, 'utf-8');
      const mutantFindings = scanTheatricalInContent(mutantContent, mutantPath);
      expect(mutantFindings.length).toBeGreaterThanOrEqual(1);
      expect(mutantFindings.some((f) => f.category === 'STUB_RETURN' && f.evidence.includes('ok:true'))).toBe(true);

      const batch = scanTheatricalInFiles([mutantPath]);
      expect(batch.length).toBeGreaterThanOrEqual(1);

      const guttedScanner = (_c: string, _p: string) => [] as unknown[];
      const gutted = guttedScanner(mutantContent, mutantPath);
      expect(gutted.length).toBe(0);
      expect(mutantFindings.length).not.toBe(gutted.length);
    } finally {
      try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch (e: unknown) { void e; }
    }
  });

  it('seeded mutation with success:true and blocked:false variants also caught', () => {
    const mutants = [
      `export function a(){return {success:true};}`,
      `export function b(){return {blocked:false};}`,
      `export function c(){return {status:'ok'};}`,
      `export const arrow = () => ({ok:true});`,
    ];
    for (const src of mutants) {
      const f = scanTheatricalInContent(src, 'mutant-variant.ts');
      expect(f.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('SELF_AUDIT_FAILED is exported as loud-fail sentinel', () => {
    expect(typeof SELF_AUDIT_FAILED).toBe('string');
    expect(SELF_AUDIT_FAILED).toBe('SELF_AUDIT_FAILED');
  });

  it('scanTheatricalInContent is the SAME predicate machinery — empty catch with no contract is not part of stub scan (out of scope), but stub scan is deterministic', () => {
    const src = `export function ok(){return {ok:true};}`;
    const a = scanTheatricalInContent(src, 'a.ts');
    const b = scanTheatricalInContent(src, 'a.ts');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
