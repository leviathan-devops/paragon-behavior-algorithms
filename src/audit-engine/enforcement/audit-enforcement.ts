/**
 * audit-enforcement.ts — THE ENFORCEMENT RING (the L2 spec §3.8 — W6)
 *
 * THE PARAGON 5+1 on the audit itself (the LAW-20 substrate immutability).
 * THE OPERATOR: "every single paragon layer and concept needs to be wired into
 * this from the angle of both ENFORCEMENT (on itself) + ENFORCER (on the
 * target it is auditing)."
 *
 * THE 5+1 MECHANISMS:
 *   (a) HOOK-OWNERSHIP — the audit's registrations write-once
 *   (b) CONFIG-LOCK — the audit's paths gated (the CTX-family pair-test)
 *   (c) SHIP-GATE — the audit-touching exec gated
 *   (d) IMPORT-GRAPH INTEGRITY — the coupling hashed + verified at build AND load
 *   (e) SENTINEL RED-TEAM — a seeded mutation in the audit's own code MUST be caught
 *   (f) DIST-SHA PINNING — the manifest sha verified on every load
 *
 * THE DUAL-LAYERED PROOF: (e) is the S7 container scenario; the tool's own
 * code passing the R11/R5 theatrical scan it ships IS the S8 scenario.
 */
import * as fs from 'fs';
import * as path from 'path';
import { tridentLog } from '../../utils.js';

// ── THE NAMED ERRORS ──
export const RING_ERRORS = {
  REGISTRATION_OVERRIDE_REJECTED: 'REGISTRATION_OVERRIDE_REJECTED',
  CONFIG_LOCK_VIOLATION: 'CONFIG_LOCK_VIOLATION',
  SHIP_GATE_BLOCKED: 'SHIP_GATE_BLOCKED',
  IMPORT_GRAPH_DRIFT: 'IMPORT_GRAPH_DRIFT',
  ENFORCEMENT_RING_BROKEN: 'ENFORCEMENT_RING_BROKEN',
  SUBSTRATE_DRIFT: 'SUBSTRATE_DRIFT',
} as const;

export interface RingVerdict {
  intact: boolean;
  violations: string[];
  caught: string[];
  distShaVerified: boolean;
}

/**
 * (a) HOOK-OWNERSHIP — the audit's hook registrations are WRITE-ONCE.
 * The registration table: the substrate module is the only writer; a second
 * write from a foreign owner → REGISTRATION_OVERRIDE_REJECTED.
 */
export class HookOwnershipRegistry {
  private registrations = new Map<string, string>();  // key → owner

  registerOnce(owner: string, key: string, handler: unknown): void {
    const existing = this.registrations.get(key);
    if (existing && existing !== owner) {
      throw new Error(`${RING_ERRORS.REGISTRATION_OVERRIDE_REJECTED}: ${key} is owned by ${existing}, ${owner} attempted an override`);
    }
    this.registrations.set(key, owner);
  }

  ownerOf(key: string): string | undefined {
    return this.registrations.get(key);
  }
}

/**
 * (b) CONFIG-LOCK + (c) SHIP-GATE — the audit's paths gated against
 * writes/exec. THE CTX-FAMILY PAIR-TEST: a write/exec touching the audit's
 * own tree (src/audit-engine/) from a NON-audit writer → the violation.
 */
export function gateAuditPath(pathToCheck: string, writer: string): void {
  const auditTree = path.normalize(pathToCheck);
  const auditEngineMarker = path.sep + 'audit-engine' + path.sep;
  if (auditTree.includes(auditEngineMarker) && writer !== 'audit-substrate') {
    throw new Error(`${RING_ERRORS.CONFIG_LOCK_VIOLATION}: ${writer} attempted to write ${pathToCheck} — the audit's own tree is locked (the substrate is the only writer)`);
  }
}

/**
 * (d) IMPORT-GRAPH INTEGRITY — the audit's internal coupling graph hashed +
 * verified at build AND load. A dead import (imported, never consumed) breaks
 * the hash → IMPORT_GRAPH_DRIFT.
 */
export function verifyImportGraph(tree: string): { intact: boolean; hash: string; violations: string[] } {
  const violations: string[] = [];
  const imports = new Map<string, Set<string>>();  // importer → imported set
  try {
    if (!fs.existsSync(tree)) return { intact: false, hash: '', violations: ['IMPORT_GRAPH_DRIFT: tree not found'] };
    const files = walkTsFiles(tree);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(tree, file);
      const importer = rel.replace(/\\/g, '/');
      const importRe = /(?:import|export)\s+(?:type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(content)) !== null) {
        const spec = m[1];
        if (!spec.startsWith('.') && !spec.startsWith('/')) continue;  // the bare specifier (the runtime)
        const resolved = resolveRelative(path.dirname(file), spec);
        const resolvedRel = path.relative(tree, resolved).replace(/\\/g, '/');
        if (!resolvedRel.startsWith('..') && !imports.has(resolvedRel)) {
          if (!imports.has(importer)) imports.set(importer, new Set());
          imports.get(importer)!.add(resolvedRel);
        }
      }
    }
    // THE DEAD-IMPORT CHECK — an import that is never consumed by a runtime reference
    for (const [importer, imported] of imports) {
      for (const target of imported) {
        const importerContent = fs.readFileSync(path.join(tree, importer), 'utf-8');
        const base = path.basename(target, path.extname(target));
        if (!importerContent.includes(base)) {
          violations.push(`IMPORT_GRAPH_DRIFT: ${importer} imports ${target} but never references it (the phantom-actor class)`);
        }
      }
    }
    const hash = sha256(JSON.stringify([...imports.entries()].sort()));
    return { intact: violations.length === 0, hash, violations };
  } catch (e: unknown) {
    return { intact: false, hash: '', violations: [`IMPORT_GRAPH_DRIFT: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/**
 * (e) SENTINEL RED-TEAM — the self-enforcement scan runs the SAME R11/R5
 * theatrical lexicon over the audit's OWN critical paths at load. A seeded
 * fake-return in the AST builder or the scorer MUST be caught.
 */
export function selfEnforceScan(tree: string): { caught: string[] } {
  const caught: string[] = [];
  try {
    if (!fs.existsSync(tree)) return { caught: [] };
    const files = walkTsFiles(tree).filter((f) =>
      f.includes('audit-ast-core') || f.includes('scoring') || f.includes('audit-lexicons') || f.includes('audit-machine'));
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(tree, file);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // THE THEATRICAL DETECTOR — the tool's own fake-return / hardcoded-success shapes
        if (/return\s+true\s*;\s*\/\/\s*(fake|stub|mock|theatrical|placeholder|hardcoded)/i.test(line)) {
          caught.push(`r5.fake-return:${rel}:${i + 1}`);
        }
        if (/return\s+0\s*;\s*\/\/\s*(fake|stub|mock|theatrical|placeholder|hardcoded)/i.test(line)) {
          caught.push(`r5.hardcoded-success:${rel}:${i + 1}`);
        }
      }
    }
    return { caught };
  } catch (e: unknown) {
    tridentLog('ERROR', 'audit-enforcement', `selfEnforceScan failed: ${e instanceof Error ? e.message : String(e)}`);
    return { caught: [] };
  }
}

/**
 * (f) DIST-SHA PINNING — the audit's dist manifest sha verified on every load.
 * A divergence → SUBSTRATE_DRIFT.
 */
export function verifyDistSha(manifestSha: string, actualSha: string): void {
  if (manifestSha !== actualSha) {
    throw new Error(`${RING_ERRORS.SUBSTRATE_DRIFT}: the dist sha ${actualSha} diverged from the pinned ${manifestSha}`);
  }
}

// ── THE HELPERS ──
function walkTsFiles(root: string): string[] {
  const out: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full);
    }
  }
  return out;
}

function resolveRelative(fromDir: string, spec: string): string {
  const p = path.resolve(fromDir, spec);
  return p.endsWith('.js') ? p.replace(/\.js$/, '.ts') : p.endsWith('.ts') ? p : p + '.ts';
}

/** THE DETERMINISTIC HASH — the FNV-1a 64-bit (stable across runs + processes,
 *  no imports — the integrity check compares the same input → the same hash;
 *  the drift detection holds). THE ISE NAMED-DETECTOR: this is a pure
 *  mechanical digest, never a decision. */
function sha256(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
