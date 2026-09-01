import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScopedProgram, AST_ERRORS } from '../ast/audit-ast-core.ts';
import { AuditEngine } from '../index.ts';

/*
RED-BEFORE OUTPUT (captured 2026-08-27 before fix, layout B = no-src + Checkpoints bundle):
  Layout A: src + Checkpoints sibling => { ok: true, fileCount: 3 }  // NOT reproducing - src walker excludes sibling
  Layout B: no src, lib + Checkpoints => { ok: false, namedError: "AST_FILE_TOO_LARGE: dist-index.js (11.0MB > 10MB cap) - the audit engine does not parse bundled single-file artifacts", fileCount: 0 }
  Layout C: src/Checkpoints => { ok: false, namedError: "AST_FILE_TOO_LARGE: dist-index.js (11.0MB > 10MB cap) - the audit engine does not parse bundled single-file artifacts", fileCount: 0 }
  Layout D: src/giant.ts => { ok: false, namedError: "AST_FILE_TOO_LARGE: giant.ts (11.0MB > 10MB cap) - the audit engine does not parse bundled single-file artifacts", fileCount: 0 }
  Verdict: prime suspect partially confirmed - Checkpoints bundle kills audit ONLY when inside walked tree (B/C), not when sibling to src (A). The homeland root with src+Checkpoints sibling currently shows ok:true (defect masked by src-scope), but ANY target without src (or with Checkpoints inside src) hits the fatal empty-result path -> buildEmptyResult lies with '0 source | 0 total | 0/0 audit layers flagged' and sourceFilesScanned 0.
  Engine audit on layout B before fix: score 0, sourceFilesScanned 0, blindSpots ['ZERO source files found - target path may be dist-only'], findings[0].evidence 'Target path ... contains 0 .ts source files' (generic, no named cause), second finding 'scope-probe-fatal: AST_FILE_TOO_LARGE: dist-index.js ...' exists but buildEmptyResult header remains lying.
GREEN-AFTER EXPECTED: layout B/C with Checkpoints bundle excluded -> ok true, fileCount 3, engine.audit sourceFilesScanned >=3, report not lying; layout D giant .ts still loud-fails with named AST_FILE_TOO_LARGE: giant.ts
*/

function fillBig(file: string, sizeMb: number): void {
  const buf = Buffer.alloc(sizeMb * 1024 * 1024, 0x78);
  fs.writeFileSync(file, buf);
}
function mkTmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'r0-reg-')); }
function makeMirror1(dir: string): void {
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Checkpoints/x'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lib/a.ts'), 'export const a=1;');
  fs.writeFileSync(path.join(dir, 'lib/b.ts'), 'export const b=2;');
  fs.writeFileSync(path.join(dir, 'lib/c.ts'), 'export const c=3;');
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'commonjs', strict: true }, include: ['lib'] }));
  fillBig(path.join(dir, 'Checkpoints/x/dist-index.js'), 11);
}
function makeMirror2Giant(dir: string): void {
  fs.mkdirSync(path.join(dir, 'x/src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'x/src/a.ts'), 'export const a=1;');
  fs.writeFileSync(path.join(dir, 'x/src/b.ts'), 'export const b=2;');
  fs.writeFileSync(path.join(dir, 'x/src/giant-source.ts'), 12);
  fs.writeFileSync(path.join(dir, 'x/tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'commonjs', strict: true }, include: ['src'] }));
}

describe('R0 EMPTY-TARGET REGRESSION - archive bundle must not kill populated audit', () => {
  describe('Mirror #1 - populated target + decoy 11MB bundle in Checkpoints (archive-prone)', () => {
    it('buildScopedProgram excludes archive bundle and returns populated (RED before: ok false AST_FILE_TOO_LARGE)', async () => {
      const dir = mkTmp();
      try {
        makeMirror1(dir);
        const r = await buildScopedProgram(dir, { fileCap: 1000 });
        expect(r.ok).toBe(true);
        expect(r.fileCount).toBeGreaterThanOrEqual(3);
        expect(r.namedError).toBeNull();
        expect(r.state).toBe('EMITTED');
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    it('AuditEngine.audit on mirror #1 does NOT return false-empty (sourceFilesScanned >=3)', async () => {
      const dir = mkTmp();
      try {
        makeMirror1(dir);
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'mirror1' }));
        const engine = new AuditEngine();
        const result = await engine.audit(dir);
        expect(result.sourceFilesScanned).toBeGreaterThanOrEqual(3);
        expect(result.auditMeta.blindSpots.join(' ')).not.toContain('ZERO source files found');
        const hasEmptyLying = result.findings.some(f => f.evidence === 'Target path ' + dir + ' contains 0 .ts source files');
        expect(hasEmptyLying).toBe(false);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    it('adversarial: nested archive dirs are also excluded', async () => {
      const dir = mkTmp();
      try {
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'src/Checkpoints/nested'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'src/baselines'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'src/snapshots'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src/a.ts'), 'export const a=1;');
        fillBig(path.join(dir, 'src/Checkpoints/nested/bundle.js'), 11);
        fillBig(path.join(dir, 'src/baselines/big.js'), 11);
        fillBig(path.join(dir, 'src/snapshots/big.js'), 11);
        const r = await buildScopedProgram(dir, { fileCap: 1000 });
        expect(r.ok).toBe(true);
        expect(r.fileCount).toBeGreaterThanOrEqual(1);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    it('adversarial: empty target still yields honest EMPTY_TARGET', async () => {
      const dir = mkTmp();
      try {
        fs.mkdirSync(path.join(dir, 'Checkpoints/x'), { recursive: true });
        fillBig(path.join(dir, 'Checkpoints/x/dist-index.js'), 11);
        const r = await buildScopedProgram(dir, { fileCap: 1000 });
        expect(r.ok).toBe(false);
        expect(r.namedError).toContain(AST_ERRORS.EMPTY_TARGET);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    it('adversarial: concurrent builds on same mirror do not race', async () => {
      const dir = mkTmp();
      try {
        makeMirror1(dir);
        const results = await Promise.all([buildScopedProgram(dir, {}), buildScopedProgram(dir, {}), buildScopedProgram(dir, {})]);
        for (const r of results) { expect(r.ok).toBe(true); expect(r.fileCount).toBeGreaterThanOrEqual(3); }
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    it('adversarial: boundary - file exactly 10MB is allowed, 10MB+1 fails only if .ts', async () => {
      const dir = mkTmp();
      try {
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src/a.ts'), 'export const a=1;');
        const tenMb = 10 * 1024 * 1024;
        fs.writeFileSync(path.join(dir, 'src/boundary.ts'), Buffer.alloc(tenMb, 0x61));
        const r = await buildScopedProgram(dir, {});
        expect(r.ok).toBe(true);
        const r2dir = mkTmp();
        try {
          fs.mkdirSync(path.join(r2dir, 'src'), { recursive: true });
          fs.writeFileSync(path.join(r2dir, 'src/a.ts'), 'export const a=1;');
          fs.writeFileSync(path.join(r2dir, 'src/just-over.ts'), Buffer.alloc(tenMb + 1, 0x61));
          const r2 = await buildScopedProgram(r2dir, {});
          expect(r2.ok).toBe(false);
          expect(r2.namedError).toContain(AST_ERRORS.AST_FILE_TOO_LARGE);
          expect(r2.namedError).toContain('just-over.ts');
        } finally { fs.rmSync(r2dir, { recursive: true, force: true }); }
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
  });

  describe('Mirror #2 - giant SOURCE file must still loud-fail with named cause', () => {
    it('buildScopedProgram on 12MB giant-source.ts fails LOUDLY naming the file', async () => {
      const dir = mkTmp();
      try {
        makeMirror2Giant(dir);
        const target = path.join(dir, 'x');
        const r = await buildScopedProgram(target, { fileCap: 1000 });
        expect(r.ok).toBe(false);
        expect(r.namedError).toContain(AST_ERRORS.AST_FILE_TOO_LARGE);
        expect(r.namedError).toContain('giant-source.ts');
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    it('AuditEngine.audit on giant-source mirror surfaces named error in finding/report', async () => {
      const dir = mkTmp();
      try {
        makeMirror2Giant(dir);
        const target = path.join(dir, 'x');
        fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'mirror2' }));
        const engine = new AuditEngine();
        const result = await engine.audit(target);
        const allText = JSON.stringify(result.findings) + result.report + result.auditMeta.blindSpots.join(' ');
        expect(allText).toContain('AST_FILE_TOO_LARGE');
        expect(allText).toContain('giant-source.ts');
        expect(result.sourceFilesScanned).toBe(0);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    it('adversarial: bad target handling', async () => {
      const bad = path.join(os.tmpdir(), '__definitely_not_exist_12345__' + Date.now());
      const r = await buildScopedProgram(bad, {});
      expect(r.ok).toBe(false);
    });
  });
});
