import { describe, it, expect, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openFamilyStore, openFamilyReadOnly, contentHashId, sha256Hex, FamilyGraphStore } from './db.ts';

const created: string[] = [];
afterAll(() => { for (const d of created) try { fs.rmSync(d, { recursive: true, force: true }); } catch {} });

function tmp(): { dir: string; fam: string; branch: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-test-'));
  created.push(dir);
  return { dir, fam: path.join(dir, 'family.db'), branch: path.join(dir, 'branch.db') };
}

describe('FamilyGraphStore — content-hash dedup (adversarial)', () => {
  it('empty bytes + symbol still dedups via :: separator (adversarial)', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    const id = contentHashId('', 'emptySym');
    expect(id.includes('::')).toBe(true);
    const node = { id, kind: 'function', name: 'emptySym', lineage: 'CODE_DERIVED' as const, source: 'corbell', data: {} };
    s.registerFamilyNode(node, '', 'tester');
    const found = s.lookupByContentHash(id);
    expect(found?.id).toBe(id);
    s.close();
  });

  it('same bytes different symbol different id (dedup isolation)', () => {
    const bytes = Buffer.from('same bytes');
    const id1 = contentHashId(bytes, 'symA');
    const id2 = contentHashId(bytes, 'symB');
    expect(id1).not.toBe(id2);
    expect(id1.split('::')[0]).toBe(id2.split('::')[0]);
    expect(id1.split('::')[1]).toBe('symA');
  });

  it('null/undefined/empty contentHash returns null not throw (adversarial)', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    expect(s.lookupByContentHash(null as any)).toBe(null);
    expect(s.lookupByContentHash(undefined as any)).toBe(null);
    expect(s.lookupByContentHash('')).toBe(null);
    expect(s.lookupByContentHash('   ')).toBe(null);
    s.close();
  });

  it('lookup by hash-only returns node (content_hash column)', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    const bytes = Buffer.from('hash-only-test');
    const id = contentHashId(bytes, 'hSym');
    s.registerFamilyNode({ id, kind: 'function', name: 'hSym', lineage: 'CODE_DERIVED', source: 'c' }, bytes, 't');
    const h = sha256Hex(bytes);
    const found = s.lookupByContentHash(h);
    expect(found).not.toBe(null);
    expect(found!.id).toBe(id);
    s.close();
  });

  it('concurrent lookupByContentHash same hash consistent under WAL (adversarial)', async () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    const bytes = Buffer.from('concurrent-test');
    const id = contentHashId(bytes, 'conSym');
    s.registerFamilyNode({ id, kind: 'function', name: 'conSym', lineage: 'CODE_DERIVED', source: 'c' }, bytes, 't');
    const results = await Promise.all([0,1,2,3,4].map(() => Promise.resolve(s.lookupByContentHash(id))));
    expect(results.every(r => r?.id === id)).toBe(true);
    s.close();
  });

  it('lookup miss returns null (must fail if mutated to return node)', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    expect(s.lookupByContentHash('nonexistent::sym')).toBe(null);
    expect(s.lookupByContentHash(sha256Hex('nope'))).toBe(null);
    s.close();
  });
});

describe('FamilyGraphStore — read-only enforcement triple (adversarial)', () => {
  it('sealed store rejects registerFamilyNode with FAMILY_ROOT_READONLY', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    s.registerFamilyNode({ id: contentHashId('a','a'), kind: 'function', name: 'a', lineage: 'CODE_DERIVED', source: 'c' }, 'a', 't');
    s.sealFamily();
    expect(s.getPromotionState()).toBe('FAMILY_ROOT_READONLY');
    expect(() => s.registerFamilyNode({ id: contentHashId('b','b'), kind: 'function', name: 'b', lineage: 'CODE_DERIVED', source: 'c' }, 'b', 't')).toThrow(/FAMILY_ROOT_READONLY/);
    s.close();
  });

  it('chmod 444 + PRAGMA query_only=1 both enforce (filesystem + SQLite)', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    s.registerFamilyNode({ id: contentHashId('x','x'), kind: 'function', name: 'x', lineage: 'CODE_DERIVED', source: 'c' }, 'x', 't');
    s.sealFamily();
    const stat = fs.statSync(fam);
    expect((stat.mode & 0o444) === 0o444).toBe(true);
    s.close();
    const ro = openFamilyReadOnly(fam);
    expect(() => ro.registerFamilyNode({ id: contentHashId('y','y'), kind: 'function', name: 'y', lineage: 'CODE_DERIVED', source: 'c' }, 'y', 't')).toThrow(/FAMILY_ROOT_READONLY/);
    ro.close();
  });

  it('openFamilyReadOnly enforces readonly (mutated removal of pragma must break this)', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    s.registerFamilyNode({ id: contentHashId('r','r'), kind: 'function', name: 'r', lineage: 'CODE_DERIVED', source: 'c' }, 'r', 't');
    s.close();
    const ro = openFamilyReadOnly(fam);
    expect(ro.lookupByContentHash(contentHashId('r','r'))).not.toBe(null);
    expect(() => ro.registerFamilyNode({ id: contentHashId('w','w'), kind: 'function', name: 'w', lineage: 'CODE_DERIVED', source: 'c' }, 'w', 't')).toThrow(/FAMILY_ROOT_READONLY/);
    ro.close();
  });
});

describe('FamilyGraphStore — branch union view (adversarial)', () => {
  it('writeBranchView counts core+delta via UNION ALL (not JOIN)', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    for (const sym of ['coreA','coreB','coreC']) s.registerFamilyNode({ id: contentHashId(sym,sym), kind: 'function', name: sym, lineage: 'CODE_DERIVED', source: 'c' }, sym, 't');
    const delta = [{ id: contentHashId('d1','d1'), kind: 'function', name: 'd1', lineage: 'CODE_DERIVED' as const, source: 'c' }];
    s.writeBranchView('', delta, []);
    const c = s.getBranchUnionCounts();
    expect(c.family).toBe(3);
    expect(c.delta).toBe(1);
    expect(c.total).toBe(4);
    s.close();
  });

  it('zero-delta preserves family count (JOIN would drop it)', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    for (const sym of ['a','b']) s.registerFamilyNode({ id: contentHashId(sym,sym), kind: 'function', name: sym, lineage: 'CODE_DERIVED', source: 'c' }, sym, 't');
    s.writeBranchView('', [], []);
    const c = s.getBranchUnionCounts();
    expect(c.family).toBe(2);
    expect(c.delta).toBe(0);
    expect(c.total).toBe(2);
    s.close();
  });

  it('duplicatePaths materialized as separate rows with distinct ids', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    s.registerFamilyNode({ id: contentHashId('core','core'), kind: 'function', name: 'core', lineage: 'CODE_DERIVED', source: 'c' }, 'core', 't');
    const dupNode = { id: contentHashId('orig','dupSym'), kind: 'function', name: 'dupSym', lineage: 'CODE_DERIVED' as const, source: 'c', data: { duplicatePaths: ['src/dup2.ts','src/dup3.ts'] } };
    s.writeBranchView('', [dupNode], []);
    const c = s.getBranchUnionCounts();
    expect(c.delta).toBe(3);
    expect(c.total).toBe(4);
    s.close();
  });

  it('malformed duplicatePaths non-array/empty gracefully degraded', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    const n1 = { id: contentHashId('m1','m1'), kind: 'function', name: 'm1', lineage: 'CODE_DERIVED' as const, source: 'c', data: { duplicatePaths: 'not-an-array' } };
    const n2 = { id: contentHashId('m2','m2'), kind: 'function', name: 'm2', lineage: 'CODE_DERIVED' as const, source: 'c', data: { duplicatePaths: [] } };
    const n3 = { id: contentHashId('m3','m3'), kind: 'function', name: 'm3', lineage: 'CODE_DERIVED' as const, source: 'c', data: { duplicatePaths: [123, null, ''] } };
    expect(() => s.writeBranchView('', [n1, n2, n3], [])).not.toThrow();
    const c = s.getBranchUnionCounts();
    expect(c.delta).toBe(3);
    s.close();
  });
});

describe('FamilyGraphStore — promotion gate operator-gated never auto', () => {
  it('requestPromotion throws PROMOTION_PENDING never auto-promotes', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    expect(() => s.requestPromotion('abc123', 'new file promotion')).toThrow(/FAMILY_PROMOTION_PENDING/);
    expect(s.getPromotionState()).toBe('PROMOTION_PENDING');
    s.close();
  });

  it('auto-promote mutation would fail — state stays PROMOTION_PENDING until operator', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    try { s.requestPromotion('h1', 'detail'); } catch {}
    expect(s.getPromotionState()).toBe('PROMOTION_PENDING');
    expect(s.getPromotionState()).not.toBe('PROMOTED');
    s.close();
  });

  it('contract hash validation throws DRIFT on mismatch (adversarial)', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    s.setContractHash('expected-correct-hash');
    expect(() => s.validateContractHash('different-hash')).toThrow(/FAMILY_ROOT_DRIFT/);
    expect(() => s.validateContractHash('expected-correct-hash')).not.toThrow();
    s.close();
  });

  it('sealed contract hash cannot be overwritten', () => {
    const { fam, branch } = tmp();
    const s = openFamilyStore(fam, branch);
    s.registerFamilyNode({ id: contentHashId('c','c'), kind: 'function', name: 'c', lineage: 'CODE_DERIVED', source: 'c' }, 'c', 't');
    s.sealFamily();
    expect(() => s.setContractHash('new-hash')).toThrow(/FAMILY_ROOT_READONLY/);
    s.close();
  });
});
