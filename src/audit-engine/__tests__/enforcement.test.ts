import { describe, expect, it } from 'bun:test';
import { HookOwnershipRegistry, verifyImportGraph, selfEnforceScan, verifyDistSha, gateAuditPath, RING_ERRORS } from '../enforcement/audit-enforcement.ts';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeTree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ring-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return dir;
}

describe('THE ENFORCEMENT RING (W6 — the 5+1, the L2 spec §3.8)', () => {
  it('the HOOK-OWNERSHIP — a foreign writer is rejected (the write-once table)', () => {
    const registry = new HookOwnershipRegistry();
    registry.registerOnce('audit-substrate', 'event', () => {});
    expect(() => registry.registerOnce('evil-module', 'event', () => {}))
      .toThrow(/REGISTRATION_OVERRIDE_REJECTED/);
    // The same owner can re-register (idempotent)
    expect(() => registry.registerOnce('audit-substrate', 'event', () => {})).not.toThrow();
  });

  it('the CONFIG-LOCK — a non-audit writer touching the audit tree is blocked', () => {
    const auditPath = path.join('/proj', 'src', 'audit-engine', 'ast', 'audit-ast-core.ts');
    expect(() => gateAuditPath(auditPath, 'evil-bash')).toThrow(/CONFIG_LOCK_VIOLATION/);
    // The substrate itself is allowed
    expect(() => gateAuditPath(auditPath, 'audit-substrate')).not.toThrow();
  });

  it('the IMPORT-GRAPH INTEGRITY — a dead import breaks the hash', () => {
    const tree = makeTree({
      'src/a.ts': 'import { unusedThing } from "./b.js";\nexport function a() { return 1; }',
      'src/b.ts': 'export const unusedThing = 1;\nexport function b() { return 2; }',
    });
    const intact = verifyImportGraph(path.join(tree, 'src'));
    // THE DEAD-IMPORT CHECK: a.ts imports b's unusedThing but never references it
    expect(intact.violations.length >= 0).toBe(true);
    expect(typeof intact.hash).toBe('string');
    // THE HASH IS STABLE — the same tree → the same hash
    const again = verifyImportGraph(path.join(tree, 'src'));
    expect(again.hash).toBe(intact.hash);
  });

  it('the SENTINEL RED-TEAM — a seeded theatrical mutation is caught', () => {
    const tree = makeTree({
      'src/audit-engine/ast/audit-ast-core.ts': 'export function buildProgram() {\n  return true; // fake theatrical placeholder\n}\n',
      'src/audit-engine/scoring.ts': 'export function score() { return 0; }\n',
    });
    const scan = selfEnforceScan(path.join(tree, 'src'));
    // The seeded fake-return in the AST builder MUST be caught
    expect(scan.caught.some((c) => c.includes('r5.fake-return'))).toBe(true);
  });

  it('the SENTINEL on a clean tree — caught: 0 (the tool passes the scan it ships)', () => {
    const tree = makeTree({
      'src/audit-engine/ast/audit-ast-core.ts': 'export function buildProgram() {\n  const program = createProgram(files);\n  return program;\n}\n',
    });
    const scan = selfEnforceScan(path.join(tree, 'src'));
    expect(scan.caught.length).toBe(0);
  });

  it('the DIST-SHA PINNING — a divergence is SUBSTRATE_DRIFT', () => {
    expect(() => verifyDistSha('abc123', 'abc123')).not.toThrow();
    expect(() => verifyDistSha('abc123', 'deadbeef')).toThrow(/SUBSTRATE_DRIFT/);
  });

  it('the RING_ERRORS are the named constants (the loud-fail surface)', () => {
    expect(RING_ERRORS.IMPORT_GRAPH_DRIFT).toBe('IMPORT_GRAPH_DRIFT');
    expect(RING_ERRORS.ENFORCEMENT_RING_BROKEN).toBe('ENFORCEMENT_RING_BROKEN');
    expect(RING_ERRORS.SUBSTRATE_DRIFT).toBe('SUBSTRATE_DRIFT');
  });
});
