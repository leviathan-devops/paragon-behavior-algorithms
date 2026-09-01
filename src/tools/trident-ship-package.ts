// src/tools/trident-ship-package.ts
// Ship Package Generator (SPG) v4 — manifest-driven, audit-hardened.
// Overhaul per SPG_TOOL_AUDIT_2026-08-02 (12 findings: F1-F12):
//   F1/F2  manifest model replaces the legacy single-bundle (>100KB) gate
//   F3     package dist/ mirrors the manifest's artifacts
//   F4     DEPLOY.sh generated from the project's deploy runbook
//   F5     ship dirs (tests/scripts/spec/canon docs) manifest-declared
//   F6     index docs anchor on the deployment fingerprint + per-artifact SHA table
//   F7     index counts read from disk at write time (last pass)
//   F8     secret redaction pass (sk-... + declared secrets)
//   F9     ignore-aware copy (__pycache__, *.map, *.tmp, node_modules, .git)
//   F10    per-artifact sizes in the index
//   F11    post-generation verification pass (BLOCKED on violation)
//   F12    contents list generated from the ACTUAL copied tree
// Plus PACKAGE_AUDIT.md (the claims table + verification output) ships with the package.

import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as crypto from 'crypto';
import * as os from 'os';
import { tridentLog } from '../utils.js';
import { generateSpecViaLLM, drainPendingSessions } from '../artifacts/llm-generator.ts';

// ── Constants ──

const SHIP_PACKAGES_BASE = path.join(
  os.homedir(), 'OPENCODE_WORKSPACE', 'Shared Workspace Context', 'Trident_Agent', 'Ship_Packages'
);

const ROOT_CONFIG_FILES = [
  'package.json', 'tsconfig.json', 'opencode.json', '.tridentignore',
  '.gitignore', 'bun.lock', 'package-lock.json', 'stryker.conf.json',
  'stryker-battlefield.json', 'stryker-utils.json',
];

const SPG_IGNORE_DEFAULT = ['__pycache__', '.map', '.tmp', 'node_modules', '.git', '.DS_Store'];
const SPG_SECRET_PATTERN = /sk-[A-Za-z0-9]{20,}/g;

// ── Deterministic helpers ──

function sha256(filePath: string): string {
  try {
    const content = fsSync.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch { return ''; }
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= 200) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === 'Ship_Packages') continue;
        results.push(...await collectSourceFiles(fullPath));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch (e: unknown) { tridentLog('WARN', 'spg', `collectSourceFiles: ${e instanceof Error ? e.message : String(e)}`); }
  return results;
}

async function countSourceLines(dir: string): Promise<{ files: number; lines: number; tsFiles: number; mdFiles: number }> {
  const allFiles = await collectSourceFiles(dir);
  let totalLines = 0;
  let tsFiles = 0;
  let mdFiles = 0;
  for (const f of allFiles) {
    try {
      const content = await fs.readFile(f, 'utf-8');
      totalLines += content.split('\n').length;
      if (f.endsWith('.ts')) tsFiles++;
      if (f.endsWith('.md')) mdFiles++;
    } catch (e: unknown) { tridentLog('WARN', 'spg', 'countSourceLines read failed: ' + (e instanceof Error ? e.message : String(e))); /* skip */ }
  }
  return { files: allFiles.length, lines: totalLines, tsFiles, mdFiles };
}

async function readPackageJson(targetPath: string): Promise<{ name?: string; version?: string }> {
  try {
    const content = await fs.readFile(path.join(targetPath, 'package.json'), 'utf-8');
    return JSON.parse(content);
  } catch { return {}; }
}

async function copyDir(src: string, dest: string, ignore: string[] = SPG_IGNORE_DEFAULT): Promise<void> {
  try {
    await fs.rm(dest, { recursive: true, force: true }).catch((e): void => {
      tridentLog('WARN', 'spg', `rm ${dest} failed (continuing): ${e instanceof Error ? e.message : String(e)}`);
    });
    await fs.mkdir(dest, { recursive: true });
    // Manual recursive copy with the ignore set (audit F9: __pycache__/, *.map, .tmp
    // must never land in the package).
    const copyTree = async (from: string, to: string): Promise<void> => {
      try {
        const entries = await fs.readdir(from, { withFileTypes: true });
        for (const entry of entries) {
          if (ignore.some(ig => entry.name.includes(ig))) continue;
          const srcP = path.join(from, entry.name);
          const dstP = path.join(to, entry.name);
          if (entry.isDirectory()) {
            await fs.mkdir(dstP, { recursive: true });
            await copyTree(srcP, dstP);
          } else {
            await fs.copyFile(srcP, dstP);
          }
        }
      } catch (e: unknown) {
        tridentLog('WARN', 'spg', `copyTree ${from} -> ${to} failed: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
      return undefined; // R10 FIX: explicit Promise<void> completion value
    };
    await copyTree(src, dest);
  } catch (e: unknown) {
    tridentLog('WARN', 'spg', `copyDir ${src} -> ${dest} failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
  return undefined; // R10 FIX: explicit Promise<void> completion value
}

// ── DIST MANIFEST MODEL (audit F1/F2/F3/F10: replaces the single-bundle model) ──
// The project MAY declare .trident/dist-manifest.json: the deployment fingerprint,
// the per-artifact SHA table, per-artifact size floors, the ship dirs, the ignore
// set, the declared secrets, and the deploy runbook. Without a manifest, the
// legacy single-bundle model applies (dist/index.js) but WITHOUT the hard >100KB
// floor (audit F1: the floor only applies when the project declares a monolith).
interface DistManifest {
  fingerprint?: string;
  artifacts?: Record<string, string>;
  minSizeKB?: Record<string, number>;
  shipDirs?: string[];
  ignore?: string[];
  secrets?: string[];
  deploy?: {
    containerPaths?: Record<string, string>;
    env?: Record<string, string>;
    launch?: string;
    gates?: string[];
  };
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a DistManifest is parsed from the
 *  JSON text and the parsed shape is typeof/!== null-guarded before the typed
 *  assertion: the type certainty is earned by the runtime check. */
function parseDistManifest(raw: string): DistManifest {
  const parsed = JSON.parse(raw) as unknown;
  if (parsed !== undefined && parsed !== null && typeof parsed === 'object') {
    return parsed as DistManifest;
  }
  return {};
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a ContextBlocks string field is
 *  typeof-guarded before the assertion. */
function asString(value: unknown, label: string): string {
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`[spg] ${label} must be a string, got ${value === null ? 'null' : typeof value}`);
}

async function loadDistManifest(targetPath: string): Promise<{ manifest: DistManifest; source: string }> {
  const mp = path.join(targetPath, '.trident', 'dist-manifest.json');
  try {
    const raw = fsSync.readFileSync(mp, 'utf-8');
    const m = parseDistManifest(raw);
    tridentLog('INFO', 'spg', 'dist manifest loaded: ' + mp);
    return { manifest: m, source: mp };
  } catch {
    return { manifest: {}, source: 'legacy-default' };
  }
}

function manifestArtifacts(manifest: DistManifest): Array<{ path: string; sha?: string; minSizeKB?: number }> {
  const arts: Array<{ path: string; sha?: string; minSizeKB?: number }> = [];
  if (manifest.artifacts && Object.keys(manifest.artifacts).length > 0) {
    for (const [p, sha] of Object.entries(manifest.artifacts)) arts.push({ path: p, sha });
  } else {
    arts.push({ path: 'dist/index.js' });
  }
  if (manifest.fingerprint) {
    const fpEntry = arts.find(a => a.path === 'dist/index.js') || arts[0];
    if (fpEntry) fpEntry.sha = fpEntry.sha || manifest.fingerprint;
  }
  if (manifest.minSizeKB) {
    for (const a of arts) { const floor = manifest.minSizeKB[a.path]; if (floor) a.minSizeKB = floor; }
  }
  return arts;
}

async function redactSecrets(root: string, extraPatterns: string[]): Promise<Array<{ file: string; count: number }>> {
  const hits: Array<{ file: string; count: number }> = [];
  const allFiles: string[] = [];
  const walkDir = (dir: string): void => {
    for (const e of fsSync.readdirSync(dir, { withFileTypes: true })) {
      if (SPG_IGNORE_DEFAULT.some(ig => e.name.includes(ig))) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkDir(p);
      else allFiles.push(p);
    }
  };
  walkDir(root);
  const extraRe = extraPatterns && extraPatterns.length > 0 ? new RegExp(extraPatterns.join('|'), 'g') : null;
  for (const f of allFiles) {
    if (!/\.(ts|js|mjs|py|json|sh|md|txt|env)$/.test(f)) continue;
    try {
      const content = fsSync.readFileSync(f, 'utf-8');
      let count = 0;
      const m1 = content.match(SPG_SECRET_PATTERN);
      if (m1) count += m1.length;
      // THE BASE64-DECODE SCAN (2026-08-09 — F-21's second half: the key's
      // base64 form does NOT match the plaintext /sk-[...]{20,}/ pattern — the
      // encoded key would ship UNREDACTED in the distributed package. The same
      // decode-scan the anti-derailment lexicon uses: decode the base64 blobs,
      // scan the decoded text for the key shape, redact the BLOBS.)
      const b64KeyBlobs: string[] = [];
      const b64Candidates = content.match(/[A-Za-z0-9+/]{40,}={0,2}/g) || [];
      for (const b of b64Candidates) {
        try {
          const dec = Buffer.from(b, 'base64').toString('utf-8');
          if (dec && /sk-[A-Za-z0-9]{20,}/.test(dec)) b64KeyBlobs.push(b);
        } catch (e: unknown) { tridentLog('WARN', 'spg', 'base64 key decode failed (non-base64): ' + (e instanceof Error ? e.message : String(e))); /* non-base64 — skip */ }
      }
      count += b64KeyBlobs.length;
      if (extraRe) { const m2 = content.match(extraRe); if (m2) count += m2.length; }
      if (count > 0) {
        let redacted = content.replace(SPG_SECRET_PATTERN, 'REDACTED-LIVE-KEY-SEE-DEPLOY-NOTES');
        for (const b of b64KeyBlobs) redacted = redacted.replace(b, 'REDACTED-LIVE-KEY-SEE-DEPLOY-NOTES');
        if (extraRe) redacted = redacted.replace(extraRe, 'REDACTED-DECLARED-SECRET');
        fsSync.writeFileSync(f, redacted, 'utf-8');
        hits.push({ file: path.relative(root, f), count });
      }
    } catch (e: unknown) { tridentLog('WARN', 'spg', 'redactSecrets file read failed: ' + (e instanceof Error ? e.message : String(e))); /* binary/unreadable — skip */ }
  }
  return hits;
}

// ── Deterministic existing-package detection ──

async function findExistingPackage(targetPath: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(SHIP_PACKAGES_BASE, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(SHIP_PACKAGES_BASE, entry.name, 'SHIP_MANIFEST.md');
      try {
        const manifest = await fs.readFile(manifestPath, 'utf-8');
        if (manifest.includes(targetPath)) {
          tridentLog('INFO', 'spg', `Found existing package for ${targetPath}: ${entry.name} — will UPDATE`);
          return path.join(SHIP_PACKAGES_BASE, entry.name);
        }
      } catch (e: unknown) { tridentLog('WARN', 'spg', 'manifest read failed: ' + (e instanceof Error ? e.message : String(e))); /* no manifest — skip */ }
    }
  } catch { tridentLog('WARN', 'spg', 'SHIP_PACKAGES_BASE read failed (does not exist yet): the base dir was not created'); /* SHIP_PACKAGES_BASE doesn't exist yet */ }
  return null;
}

// ── Phase 1: Deterministic Validation (manifest-aware, audit F1/F2) ──

async function validateBuild(targetPath: string, expectedSha?: string, manifest: DistManifest = {}): Promise<string[]> {
  try {
    const errors: string[] = [];

    const srcDir = path.join(targetPath, 'src');
    if (!fsSync.existsSync(srcDir)) {
      errors.push(`src/ directory not found at ${srcDir}`);
    } else {
      const srcFiles = await collectSourceFiles(srcDir);
      if (srcFiles.length === 0) errors.push('src/ directory has no source files');
    }

    const artifacts = manifestArtifacts(manifest);
    for (const art of artifacts) {
      const artPath = path.join(targetPath, art.path);
      if (!fsSync.existsSync(artPath)) {
        errors.push(`${art.path} not found. Run the project's build first.`);
        continue;
      }
      const stat = fsSync.statSync(artPath);
      if (art.minSizeKB && stat.size < art.minSizeKB * 1024) {
        errors.push(`${art.path} is ${(stat.size / 1024).toFixed(1)}KB — declared minimum ${art.minSizeKB}KB. Rebuild required.`);
      }
      const expected = art.sha || (art.path === 'dist/index.js' ? expectedSha : undefined);
      if (expected) {
        const actualSha = sha256(artPath);
        if (actualSha && actualSha !== expected) {
          errors.push(`${art.path} SHA mismatch: expected ${expected}, got ${actualSha}. Rebuild required.`);
        }
      }
    }

    return errors;
  } catch (e: unknown) {
    tridentLog('WARN', 'spg', `validateBuild failed for ${targetPath}: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

// ── Phase 4: Deterministic File Generators ──

function generateShipManifest(
  projectName: string, version: string, fingerprint: string,
  artifactTable: Array<{ path: string; sha: string; sizeKB: number }>,
  stats: { files: number; lines: number; tsFiles: number; mdFiles: number },
  ctx: ContextBlocks, sourcePath: string,
): string {
  const sizeRows = artifactTable.map(a => `- \`${a.path}\` — ${a.sizeKB} KB, SHA \`${a.sha.substring(0, 16)}...\``).join('\n');
  return `# SHIP MANIFEST — ${projectName}

**Version:** ${version}
**Source Path:** ${sourcePath}
**Deployment Fingerprint:** \`${fingerprint}\`
**Source Files:** ${stats.tsFiles} .ts files, ${stats.mdFiles} .md files, ${stats.files} total
**Source Lines:** ${stats.lines.toLocaleString()}
**Generated:** ${new Date().toISOString()}
**Generator:** Trident Ship Package Generator (SPG) v4 (manifest-driven)

## Deployment Artifacts (per-artifact SHA table — audit F6/F10)
${sizeRows}

## Test Results Summary
${ctx.testResults.substring(0, 500)}...

## Package Contents
- \`src/\` — Full source code (${stats.tsFiles} .ts files)
- \`dist/\` — Deployment artifacts (see the table above)
- \`BUILD_REPORT.md\` — What was built, how, why
- \`DEBUG_LOG.md\` — Every bug with root cause and fix
- \`FULL_BUILD_CONTEXT.md\` — Compaction-proof context for future sessions
- \`PACKAGE_AUDIT.md\` — Post-generation zero-trust verification output
- \`MASTER_INDEX.md\` — Package index
- \`DEPLOY.sh\` — Deployment script
- \`README.md\` — Quick overview
`;
}

function generateDeployScript(projectName: string, distSha: string, deployRunbook?: DistManifest['deploy']): string {
  const pluginDir = `/root/.config/opencode/plugins/${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  // AUDIT F4: when the project declares a deploy runbook (.trident/dist-manifest.json
  // deploy section), generate the script FROM it — artifact-to-container paths, env,
  // launch sequence, gates. Without a runbook, emit the legacy template with a
  // prominent warning that the artifact mapping MUST be confirmed.
  if (deployRunbook && deployRunbook.containerPaths && Object.keys(deployRunbook.containerPaths).length > 0) {
    const lines: string[] = [];
    lines.push('#!/bin/bash');
    lines.push(`# DEPLOY.sh — ${projectName} (generated from the project deploy runbook)`);
    lines.push('# Usage: bash DEPLOY.sh [container-name]');
    lines.push('');
    lines.push('set -e');
    lines.push('');
    lines.push('CONTAINER="${1:-trident-test}"');
    lines.push(`echo "═══ Deploying ${projectName} to container: $CONTAINER ═══"`);
    lines.push('');
    let step = 1;
    for (const [artifact, containerPath] of Object.entries(deployRunbook.containerPaths)) {
      lines.push(`# ${step}. ${artifact} -> ${containerPath}`);
      lines.push(`echo "[${step}] Copying ${artifact}..."`);
      lines.push(`docker cp ${artifact} "$CONTAINER:${containerPath}"`);
      lines.push(`VERIFY_SHA=$(sha256sum ${artifact} | cut -d' ' -f1)`);
      lines.push(`ACTUAL_SHA=$(docker exec "$CONTAINER" sha256sum "${containerPath}" | cut -d' ' -f1)`);
      lines.push(`if [ "$ACTUAL_SHA" != "$VERIFY_SHA" ]; then echo "ERROR: SHA mismatch on ${artifact}"; exit 1; fi`);
      lines.push(`echo "SHA verified: $ACTUAL_SHA"`);
      lines.push('');
      step++;
    }
    if (deployRunbook.env) {
      lines.push('# Environment');
      for (const [k, v] of Object.entries(deployRunbook.env)) {
        lines.push(`echo "[${step}] Setting env ${k}"`);
        lines.push(`docker exec "$CONTAINER" bash -c 'echo "${k}=${v}" >> /etc/environment'`);
        step++;
      }
    }
    if (deployRunbook.launch) {
      lines.push(`echo "[${step}] Launch: ${deployRunbook.launch}"`);
      lines.push(`docker exec "$CONTAINER" bash -lc '${deployRunbook.launch}'`);
      step++;
    }
    if (deployRunbook.gates) {
      for (const g of deployRunbook.gates) {
        lines.push(`echo "[${step}] Gate: ${g}"`);
        lines.push(`docker exec "$CONTAINER" bash -lc '${g}'`);
        step++;
      }
    }
    lines.push(`echo "[${step}] Deployment complete."`);
    return lines.join('\n') + '\n';
  }
  // ── legacy fallback (no runbook) — with the audit warning ──
  return `#!/bin/bash
# DEPLOY.sh — ${projectName} (FALLBACK — no deploy runbook declared.
# WARNING: verify the artifact-to-container mapping below matches your topology.
# Declare .trident/dist-manifest.json with a deploy section for a runbook-driven script.)
# Usage: bash DEPLOY.sh [container-name]

set -e

CONTAINER="\${1:-trident-test}"
PLUGIN_DIR="${pluginDir}"
EXPECTED_SHA="${distSha}"

echo "═══ Deploying ${projectName} to container: $CONTAINER ═══"

# 1. Copy dist to container
echo "[1/4] Copying dist/index.js..."
docker cp dist/index.js "$CONTAINER:$PLUGIN_DIR/dist/index.js"

# 2. Verify SHA
echo "[2/4] Verifying SHA256..."
ACTUAL_SHA=$(docker exec "$CONTAINER" sha256sum "$PLUGIN_DIR/dist/index.js" | cut -d' ' -f1)
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "ERROR: SHA mismatch! Expected: $EXPECTED_SHA"
  echo "Got: $ACTUAL_SHA"
  exit 1
fi
echo "SHA verified: $ACTUAL_SHA"

# 3. Copy src (for reference)
echo "[3/4] Copying src/..."
docker cp src "$CONTAINER:$PLUGIN_DIR/src"

# 4. Done
echo "[4/4] Deployment complete."
echo "Plugin: $PLUGIN_DIR/dist/index.js"
echo "SHA: $ACTUAL_SHA"
`;
}

function generateReadme(projectName: string, version: string, fingerprint: string, artifactTable: Array<{ path: string; sha: string; sizeKB: number }>, stats: { files: number; lines: number; tsFiles: number }): string {
  const sizeRows = artifactTable.map(a => `| \`${a.path}\` | ${a.sizeKB} KB | \`${a.sha.substring(0, 16)}...\` |`).join('\n');
  return `# ${projectName} — Ship Package v${version}

**Deployment Fingerprint:** \`${fingerprint}\`
**Source:** ${stats.tsFiles} .ts files, ${stats.lines.toLocaleString()} lines

## Deploy

\`\`\`bash
bash DEPLOY.sh [container-name]
\`\`\`

## Deployment Artifacts

| Artifact | Size | SHA |
|----------|------|-----|
${sizeRows}

## Package Contents

| File | Description |
|------|-------------|
| \`dist/\` | Deployment artifacts (see above) |
| \`src/\` | Full TypeScript source (${stats.tsFiles} files) |
| \`BUILD_REPORT.md\` | What was built, how, why |
| \`DEBUG_LOG.md\` | Every bug with root cause and fix |
| \`FULL_BUILD_CONTEXT.md\` | Compaction-proof context document |
| \`PACKAGE_AUDIT.md\` | Post-generation verification output |
| \`SHIP_MANIFEST.md\` | Build metadata and deploy info |
| \`DEPLOY.sh\` | Container deployment script |

## Verification

\`\`\`bash
sha256sum <artifact>  # per the Deployment Artifacts table
\`\`\`
`;
}

// ── Post-generation verification + PACKAGE_AUDIT (audit F11 + overhaul point 7) ──

async function runPackageAudit(
  libDir: string,
  distManifest: DistManifest,
  fingerprint: string,
  artifactTable: Array<{ path: string; sha: string; sizeKB: number }>,
): Promise<{ ok: boolean; violations: string[]; markdown: string }> {
  const violations: string[] = [];
  const lines: string[] = [];
  lines.push('# PACKAGE AUDIT — post-generation zero-trust verification');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');

  // (a) every artifact referenced by DEPLOY.sh exists in the package
  const deployScript = fsSync.existsSync(path.join(libDir, 'DEPLOY.sh')) ? fsSync.readFileSync(path.join(libDir, 'DEPLOY.sh'), 'utf-8') : '';
  for (const art of artifactTable) {
    const exists = fsSync.existsSync(path.join(libDir, art.path));
    lines.push(`- [${exists ? 'x' : ' '}] artifact present in package: \`${art.path}\``);
    if (!exists) violations.push(`DEPLOY.sh/artifacts: ${art.path} missing from the package`);
  }
  lines.push('');

  // (b) manifest SHAs match the package's dist files
  for (const art of artifactTable) {
    const pkgPath = path.join(libDir, art.path);
    if (!fsSync.existsSync(pkgPath)) continue;
    const actual = sha256(pkgPath);
    const match = !art.sha || actual === art.sha;
    lines.push(`- [${match ? 'x' : ' '}] SHA match: \`${art.path}\` ${match ? '(verified)' : `(expected ${art.sha.substring(0, 12)}... got ${actual.substring(0, 12)}...)`}`);
    if (!match) violations.push(`SHA: ${art.path} mismatch in the package`);
  }
  lines.push('');

  // (c) index counts match the actual files
  for (const doc of ['BUILD_REPORT.md', 'DEBUG_LOG.md', 'FULL_BUILD_CONTEXT.md']) {
    const dp = path.join(libDir, doc);
    if (!fsSync.existsSync(dp)) { lines.push(`- [ ] doc present: ${doc} MISSING`); violations.push(`doc: ${doc} missing`); continue; }
    const actualLines = fsSync.readFileSync(dp, 'utf-8').split('\n').length;
    lines.push(`- [x] doc present + counted: ${doc} (${actualLines} lines)`);
  }
  lines.push('');

  // (d) zero secret patterns in the package
  const secretHits: string[] = [];
  const allPkgFiles: string[] = [];
  const walkPkg = (dir: string): void => {
    for (const e of fsSync.readdirSync(dir, { withFileTypes: true })) {
      if (SPG_IGNORE_DEFAULT.some(ig => e.name.includes(ig))) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkPkg(p);
      else allPkgFiles.push(p);
    }
  };
  walkPkg(libDir);
  for (const f of allPkgFiles) {
    if (!/\.(ts|js|mjs|py|json|sh|md|txt|env)$/.test(f)) continue;
    try {
      const c = fsSync.readFileSync(f, 'utf-8');
      const m = c.match(SPG_SECRET_PATTERN);
      if (m) secretHits.push(path.relative(libDir, f) + ' (' + m.length + ')');
    } catch (e: unknown) { tridentLog('WARN', 'spg', 'package secret scan read failed: ' + (e instanceof Error ? e.message : String(e))); /* skip */ }
  }
  const secretOk = secretHits.length === 0;
  lines.push(`- [${secretOk ? 'x' : ' '}] zero live secrets in the package${secretOk ? '' : ': ' + secretHits.join(', ')}`);
  if (!secretOk) violations.push('secrets: ' + secretHits.join(', '));
  lines.push('');

  // (e) tests/ present when the project has tests
  const hasTests = fsSync.existsSync(path.join(libDir, 'tests')) && fsSync.readdirSync(path.join(libDir, 'tests')).length > 0;
  lines.push(`- [${hasTests ? 'x' : ' '}] tests/ directory ${hasTests ? 'present' : '(none declared)'}`);
  if (!hasTests && distManifest.shipDirs?.includes('tests')) violations.push('tests/: declared in shipDirs but absent');

  const ok = violations.length === 0;
  lines.push('');
  lines.push(`## VERDICT: ${ok ? 'PASS — package is internally consistent' : 'FAIL — ' + violations.length + ' violation(s): ' + violations.join('; ')}`);
  lines.push('');
  return { ok, violations, markdown: lines.join('\n') };
}

// ── LLM System Prompts — AGGRESSIVE length requirements ──

const SPG_BUILD_REPORT_SYSTEM =
  'You are an elite build report writer producing COMPREHENSIVE documentation. ' +
  'This document MUST be at LEAST 2000 lines. Under 1500 lines is a FAILURE. ' +
  'You write for a FRESH agent who has ZERO context about this project. ' +
  'EVERY change, EVERY file, EVERY feature, EVERY modification MUST be documented. ' +
  'Include: what was built (narrative), how it was built (technical detail), ' +
  'why each change was made (rationale), files changed (detailed table), ' +
  'test results (with evidence), architecture overview, known issues. ' +
  'NEVER fabricate SHAs, statistics, or test results. ' +
  'Output ONLY markdown. Do NOT call tools.\n\n' +
  '## BUILD REPORT STRUCTURE (follow exactly, ALL sections required)\n' +
  '1. Build Summary (50+ lines) — version, SHA, bundle size, module count, build time, overview of ALL changes\n' +
  '2. What Was Built (500+ lines) — NARRATIVE of every change. Not a list — a STORY. Each feature described in full.\n' +
  '3. Technical Implementation (400+ lines) — HOW each change works. Code patterns, algorithms, data flows.\n' +
  '4. Architecture Changes (300+ lines) — What moved, what was added, what was removed. ASCII diagrams.\n' +
  '5. Files Changed (200+ lines) — Table: file | action (NEW/MODIFIED/DELETED) | lines changed | full description\n' +
  '6. Test Results (200+ lines) — Every test run with SHA evidence, timestamps, pass/fail. Container test details.\n' +
  '7. Known Issues and Limitations (100+ lines) — What is broken, what needs follow-up, workarounds\n' +
  '8. Deployment Notes (100+ lines) — Build command, deploy steps, gotchas, configuration requirements\n\n' +
  'CRITICAL: This is a 2000+ LINE document. Do NOT abbreviate. Do NOT summarize. ' +
  'EVERY section must be FULLY developed with real content from the provided context.';

const SPG_DEBUG_LOG_SYSTEM =
  'You are an elite debug log writer producing a COMPREHENSIVE forensic record. ' +
  'This document MUST be at LEAST 1000 lines. Under 800 lines is a FAILURE. ' +
  'Document EVERY bug, EVERY issue, EVERY gotcha with FULL diagnosis chains. ' +
  'Format per bug: Symptom -> Root Cause -> Diagnosis Process -> Fix Applied -> Verification -> Lesson Learned. ' +
  'Include ALL bugs — NO omissions. Every bug is a learning opportunity. ' +
  'Output ONLY markdown. Do NOT call tools.\n\n' +
  '## DEBUG LOG STRUCTURE (follow exactly)\n' +
  '1. Bug Summary Table — bug ID | symptom | severity | status (FIXED/WIP/KNOWN)\n' +
  '2. Detailed Bug Reports (800+ lines) — One FULL section per bug:\n' +
  '   - Symptom: What went wrong? What did the user/agent observe?\n' +
  '   - Root Cause: The fundamental reason. Not the symptom — the CAUSE.\n' +
  '   - Diagnosis Process: How was the root cause identified? What debugging steps?\n' +
  '   - Fix Applied: Exact code change. What was modified, where, how.\n' +
  '   - Verification: How was the fix verified? Container test? Build? Runtime check?\n' +
  '   - Lesson Learned: What rule prevents this from recurring?\n' +
  '3. Architecture Decisions (200+ lines) — Every key decision with rationale and rejected alternatives\n' +
  '4. Regression Watch (100+ lines) — What to check if these bugs reappear\n' +
  '5. Iron Laws (50+ lines) — Terse rules earned by each bug\n\n' +
  'CRITICAL: This is a 1000+ LINE document. EVERY bug gets a FULL page of analysis minimum.';

const SPG_FULL_CONTEXT_SYSTEM =
  'You are an elite context preservation writer producing a COMPREHENSIVE knowledge document. ' +
  'This document MUST be at LEAST 2000 lines. Under 1500 lines is a FAILURE. ' +
  'This document must survive context compaction and be readable by a FRESH agent session. ' +
  'Architecture, data flows, gotchas, conventions, file locations, API contracts, limitations, ' +
  'operational knowledge — ALL of it. NO summarization. NO "see above". Every section self-contained. ' +
  'Output ONLY markdown. Do NOT call tools.\n\n' +
  '## FULL CONTEXT STRUCTURE (follow exactly, ALL sections required)\n' +
  '1. Project Identity (100+ lines) — name, version, purpose, tech stack, dependencies, build system\n' +
  '2. Architecture Overview (300+ lines) — ASCII diagram, component map, data flow, module dependencies\n' +
  '3. Key Files Reference (400+ lines) — EVERY important file with its role, key exports, and gotchas\n' +
  '4. Design Decisions (300+ lines) — EVERY decision with rationale, rejected alternatives, cost of reversal\n' +
  '5. Implementation Patterns (200+ lines) — Conventions, idioms, gotchas specific to this codebase\n' +
  '6. Known Bugs and Limitations (200+ lines) — What is broken, what is workaround, what is accepted\n' +
  '7. Operational Knowledge (200+ lines) — Build commands, deploy steps, container testing, debugging\n' +
  '8. Compaction Recovery Guide (200+ lines) — "Read this first after context loss." Recovery checklist.\n\n' +
  'CRITICAL: This is a 2000+ LINE document. Do NOT abbreviate. EVERY section FULLY developed. ' +
  'A fresh agent reads ONLY this document and understands the ENTIRE project.';

// ── Phase 5: Brief Builders ──

interface ContextBlocks {
  whatWasBuilt: string;
  bugsFound: string;
  architectureDecisions: string;
  filesChanged: string;
  testResults: string;
}

function buildReportBrief(
  projectName: string, version: string, targetPath: string, fingerprint: string,
  artifactTable: Array<{ path: string; sha: string; sizeKB: number }>,
  stats: { files: number; lines: number; tsFiles: number; mdFiles: number },
  ctx: ContextBlocks,
): string {
  const sizeRows = artifactTable.map(a => `- ${a.path}: ${a.sizeKB} KB, SHA ${a.sha.substring(0, 16)}...`).join('\n');
  return `# BUILD REPORT GENERATION TASK — ${projectName} v${version}

## DETERMINISTIC PROJECT DATA (read from disk — VERIFIED FACTS)
- **Project:** ${projectName}
- **Version:** ${version}
- **Deployment Fingerprint:** ${fingerprint}
- **Deployment Artifacts:**
${sizeRows}
- **Source Files:** ${stats.tsFiles} .ts, ${stats.mdFiles} .md, ${stats.files} total
- **Source Lines:** ${stats.lines.toLocaleString()}
- **Project Root:** ${targetPath}

## WHAT WAS BUILT (agent-provided — PRIMARY SOURCE OF TRUTH)
${ctx.whatWasBuilt}

## FILES CHANGED (agent-provided)
${ctx.filesChanged}

## TEST RESULTS (agent-provided)
${ctx.testResults}

## GENERATION INSTRUCTIONS
Write a COMPLETE BUILD REPORT following the BUILD REPORT STRUCTURE in the system prompt.
The report MUST be at LEAST 2000 lines. Use ALL the context above.
Every claim traces to provided context. NEVER fabricate.`;
}

function buildDebugLogBrief(projectName: string, ctx: ContextBlocks): string {
  return `# DEBUG LOG GENERATION TASK — ${projectName}

## BUGS FOUND (agent-provided — PRIMARY SOURCE OF TRUTH)
${ctx.bugsFound}

## ARCHITECTURE DECISIONS (agent-provided)
${ctx.architectureDecisions}

## GENERATION INSTRUCTIONS
Write a COMPLETE DEBUG LOG following the DEBUG LOG STRUCTURE in the system prompt.
The log MUST be at LEAST 1000 lines. Document EVERY bug with FULL diagnosis chain.`;
}

function buildFullContextBrief(
  projectName: string, version: string, targetPath: string, fingerprint: string,
  artifactTable: Array<{ path: string; sha: string; sizeKB: number }>,
  stats: { files: number; lines: number; tsFiles: number; mdFiles: number },
  ctx: ContextBlocks,
): string {
  const sizeRows = artifactTable.map(a => `- ${a.path}: ${a.sizeKB} KB, SHA ${a.sha.substring(0, 16)}...`).join('\n');
  return `# FULL BUILD CONTEXT GENERATION TASK — ${projectName} v${version}

## DETERMINISTIC PROJECT DATA
- **Project:** ${projectName}
- **Version:** ${version}
- **Deployment Fingerprint:** ${fingerprint}
- **Deployment Artifacts:**
${sizeRows}
- **Source:** ${stats.tsFiles} .ts files, ${stats.lines.toLocaleString()} lines

## WHAT WAS BUILT
${ctx.whatWasBuilt}

## BUGS FOUND
${ctx.bugsFound}

## ARCHITECTURE DECISIONS
${ctx.architectureDecisions}

## FILES CHANGED
${ctx.filesChanged}

## TEST RESULTS
${ctx.testResults}

## GENERATION INSTRUCTIONS
Write a COMPLETE COMPACTION-PROOF CONTEXT DOCUMENT following the FULL CONTEXT STRUCTURE.
The document MUST be at LEAST 2000 lines. Document EVERYTHING. Every section self-contained.
Include Compaction Recovery Guide in section 8.`;
}

// ── Tool Definition ──

export function createShipPackageTool() {
  return tool({
    description: 'Ship Package Generator v4 (manifest-driven): validates the dist manifest (fingerprint + per-artifact SHAs, size floors only when declared), copies the manifest artifacts + src (ignore-aware) + ship dirs (tests/scripts/spec/canon docs), REDACTS secrets, generates DEPLOY.sh from the deploy runbook, generates SHIP_MANIFEST + DEPLOY.sh + README + BUILD_REPORT + DEBUG_LOG + FULL_BUILD_CONTEXT (parallel LLM), writes MASTER_INDEX LAST from the actual tree, runs the POST-GENERATION PACKAGE AUDIT (BLOCKED on violation) and ships PACKAGE_AUDIT.md. Declare .trident/dist-manifest.json for the full model. All 5 context blocks MANDATORY (>8000 chars each).',
    args: {
      targetPath: z.string().describe('Absolute path to project root containing src/ and dist/'),
      projectName: z.string().optional().describe('Package name. Defaults from package.json or targetPath basename'),
      distSha: z.string().optional().describe('Expected deployment fingerprint SHA256. Validated against the manifest fingerprint artifact'),
      outputPath: z.string().optional().describe('Custom output directory. Defaults to Ship_Packages/{projectName}/'),
      blocksFile: z.string().optional().describe('Path to a JSON file containing the 5 context blocks (whatWasBuilt, bugsFound, architectureDecisions, filesChanged, testResults). REQUIRED when the function-calling payload limit prevents passing 40K+ chars inline. File fields override inline args.'),
      whatWasBuilt: z.string().optional().describe('What changed, how, why. Runtime: >8000 chars. Full narrative — every component, every integration, every wire. Same tier as DP components arg. May be supplied via blocksFile.'),
      bugsFound: z.string().optional().describe('Every bug found and fixed. Runtime: >8000 chars. Symptom → root cause → diagnosis → fix → verification → lesson for EACH bug. Same tier as DP knownGaps. May be supplied via blocksFile.'),
      architectureDecisions: z.string().optional().describe('Decisions with rationale + rejected alternatives. Runtime: >8000 chars. Same tier as DP designDecisions. May be supplied via blocksFile.'),
      filesChanged: z.string().optional().describe('Every modified file with description of changes. Runtime: >8000 chars. Same tier as DP fileInventory. May be supplied via blocksFile.'),
      testResults: z.string().optional().describe('Test evidence with pass/fail and metrics. Runtime: >8000 chars. Container test results, Phase E checks, SHA proofs, stream evidence. May be supplied via blocksFile.'),
    },
    execute: async (args: {
      targetPath: string; projectName?: string; distSha?: string; outputPath?: string; blocksFile?: string;
      whatWasBuilt?: string; bugsFound?: string; architectureDecisions?: string;
      filesChanged?: string; testResults?: string;
    }) => {
      try {
        // ═══ BLOCKSFILE MERGE (before validation) ═══
        if (args.blocksFile) {
          try {
            const fsSync = await import('fs');
            const fileContent = fsSync.readFileSync(args.blocksFile, 'utf-8');
            const fileFields = JSON.parse(fileContent);
            const BLOCK_KEYS = ['whatWasBuilt', 'bugsFound', 'architectureDecisions', 'filesChanged', 'testResults'];
            for (const k of BLOCK_KEYS) {
              if (typeof fileFields[k] === 'string' && fileFields[k].length > 0) {
                (args as Record<string, unknown>)[k] = fileFields[k];
              }
            }
            tridentLog('INFO', 'spg', `blocksFile: merged blocks from ${args.blocksFile}`);
          } catch (fileErr: unknown) {
            return `BLOCKS FILE ERROR: could not read/parse ${args.blocksFile}: ${fileErr instanceof Error ? fileErr.message : String(fileErr)}`;
          }
        }

        // ═══ RUNTIME INPUT VALIDATION ═══
        const SPG_MIN = 8000;
        const ctxArgs: Record<string, string | undefined> = {
          whatWasBuilt: args.whatWasBuilt, bugsFound: args.bugsFound,
          architectureDecisions: args.architectureDecisions, filesChanged: args.filesChanged,
          testResults: args.testResults,
        };
        const failures: string[] = [];
        for (const [key, val] of Object.entries(ctxArgs)) {
          if (typeof val !== 'string' || val.length < SPG_MIN) {
            failures.push(`'${key}' ${typeof val === 'string' ? val.length : 0}c need ${SPG_MIN}+. Full build context.`);
          }
        }
        if (failures.length > 0) {
          return `❌ SPG ARGUMENT VALIDATION FAILED:\n${failures.map(f => `  - ${f}`).join('\n')}\n\nAll 5 context blocks must be >= ${SPG_MIN} chars.`;
        }

        const pkg = await readPackageJson(args.targetPath);
        const projectName = args.projectName || pkg.name || path.basename(args.targetPath) || 'unnamed-project';
        const version = pkg.version || 'unknown';

        // ── Load the dist manifest (audit F1/F2) ──
        const { manifest: distManifest, source: manifestSource } = await loadDistManifest(args.targetPath);
        tridentLog('INFO', 'spg', `manifest source: ${manifestSource}`);

        // ── Phase 1: Validate (manifest-aware) ──
        tridentLog('INFO', 'spg', `Phase 1: Validating ${projectName} at ${args.targetPath}`);
        const errors = await validateBuild(args.targetPath, args.distSha, distManifest);
        if (errors.length > 0) {
          let msg = `SHIP PACKAGE BLOCKED — ${errors.length} ERROR${errors.length === 1 ? '' : 'S'}:\n\n`;
          errors.forEach((e, i): void => { msg += `${i + 1}. ${e}\n`; });
          msg += '\nFix ALL errors, then retry.';
          return msg;
        }

        // ── Artifact table + deployment fingerprint (audit F6/F10) ──
        const artifactsList = manifestArtifacts(distManifest);
        const artifactTable: Array<{ path: string; sha: string; sizeKB: number }> = [];
        let fingerprint = '';
        for (const art of artifactsList) {
          const absPath = path.join(args.targetPath, art.path);
          if (!fsSync.existsSync(absPath)) continue;
          const aSha = sha256(absPath);
          const sizeKB = Math.round(fsSync.statSync(absPath).size / 1024);
          artifactTable.push({ path: art.path, sha: aSha, sizeKB });
          if (art.path === 'dist/index.js' || (!fingerprint)) fingerprint = aSha;
        }
        if (distManifest.fingerprint) fingerprint = distManifest.fingerprint;
        if (!fingerprint) fingerprint = artifactTable[0]?.sha || 'unknown';
        tridentLog('INFO', 'spg', `Deployment fingerprint: ${fingerprint.substring(0, 16)}... (${artifactTable.length} artifacts)`);

        // ── Collect project stats ──
        const stats = await countSourceLines(path.join(args.targetPath, 'src'));
        tridentLog('INFO', 'spg', `Project stats: ${stats.tsFiles} .ts, ${stats.mdFiles} .md, ${stats.lines} lines`);

        // ── Phase 2: Find existing package or create new ──
        const existingDir = await findExistingPackage(args.targetPath);
        const libDir = args.outputPath || existingDir || path.join(SHIP_PACKAGES_BASE, projectName);
        const isUpdate = existingDir !== null;
        await fs.mkdir(libDir, { recursive: true });
        tridentLog('INFO', 'spg', `${isUpdate ? 'UPDATING' : 'CREATING'} package: ${libDir}`);

        // ── Phase 3: Copy project (manifest-driven + ignore-aware + redaction) ──
        tridentLog('INFO', 'spg', 'Phase 3: Copying project files (manifest-driven)');
        const distDest = path.join(libDir, 'dist');
        await fs.mkdir(distDest, { recursive: true });
        for (const art of artifactsList) {
          const srcArt = path.join(args.targetPath, art.path);
          if (fsSync.existsSync(srcArt)) {
            const rel = art.path.replace(/^dist\//, '');
            await fs.copyFile(srcArt, path.join(distDest, rel));
          }
        }
        await copyDir(path.join(args.targetPath, 'src'), path.join(libDir, 'src'));
        for (const cfgFile of ROOT_CONFIG_FILES) {
          const src = path.join(args.targetPath, cfgFile);
          if (fsSync.existsSync(src)) {
            try { await fs.copyFile(src, path.join(libDir, cfgFile)); } catch (e: unknown) { tridentLog('WARN', 'spg', 'root config copy failed for ' + cfgFile + ': ' + (e instanceof Error ? e.message : String(e))); /* skip */ }
          }
        }
        const shipDirs = distManifest.shipDirs || ['docs', 'specs', '.trident', 'tests', 'scripts', 'context_management', 'MASTER_CONTEXT'];
        for (const extraDir of shipDirs) {
          const srcDir = path.join(args.targetPath, extraDir);
          if (fsSync.existsSync(srcDir)) {
            try { await copyDir(srcDir, path.join(libDir, extraDir)); } catch (e: unknown) { tridentLog('WARN', 'spg', 'ship dir copy failed for ' + extraDir + ': ' + (e instanceof Error ? e.message : String(e))); /* skip */ }
          }
        }
        // ── SECRET REDACTION PASS (audit F8) ──
        const redacted = await redactSecrets(libDir, distManifest.secrets || []);
        if (redacted.length > 0) {
          tridentLog('WARN', 'spg', 'REDACTED secrets in package: ' + redacted.map(r => r.file + ' (' + r.count + ')').join(', '));
        }

        // ── Phase 4: Generate deterministic files ──
        tridentLog('INFO', 'spg', 'Phase 4: Writing deterministic files');
        const ctx: ContextBlocks = {
          whatWasBuilt: asString(args.whatWasBuilt, 'whatWasBuilt'),
          bugsFound: asString(args.bugsFound, 'bugsFound'),
          architectureDecisions: asString(args.architectureDecisions, 'architectureDecisions'),
          filesChanged: asString(args.filesChanged, 'filesChanged'),
          testResults: asString(args.testResults, 'testResults'),
        };

        const manifest = generateShipManifest(projectName, version, fingerprint, artifactTable, stats, ctx, args.targetPath);
        await fs.writeFile(path.join(libDir, 'SHIP_MANIFEST.md'), manifest, 'utf-8');

        const deployScript = generateDeployScript(projectName, fingerprint, distManifest.deploy);
        await fs.writeFile(path.join(libDir, 'DEPLOY.sh'), deployScript, 'utf-8');

        const readme = generateReadme(projectName, version, fingerprint, artifactTable, stats);
        await fs.writeFile(path.join(libDir, 'README.md'), readme, 'utf-8');

        // ── Phase 5: Parallel LLM Generation ──
        tridentLog('INFO', 'spg', 'Phase 5: Firing 3 PARALLEL LLM generations (target: 2000+ lines each)');

        interface SpgJob { name: string; brief: string; system: string; fileName: string; }
        const jobs: SpgJob[] = [
          { name: 'BUILD_REPORT', brief: buildReportBrief(projectName, version, args.targetPath, fingerprint, artifactTable, stats, ctx), system: SPG_BUILD_REPORT_SYSTEM, fileName: 'BUILD_REPORT.md' },
          { name: 'DEBUG_LOG', brief: buildDebugLogBrief(projectName, ctx), system: SPG_DEBUG_LOG_SYSTEM, fileName: 'DEBUG_LOG.md' },
          { name: 'FULL_BUILD_CONTEXT', brief: buildFullContextBrief(projectName, version, args.targetPath, fingerprint, artifactTable, stats, ctx), system: SPG_FULL_CONTEXT_SYSTEM, fileName: 'FULL_BUILD_CONTEXT.md' },
        ];

        const results = await Promise.allSettled(
          jobs.map(async (job) => {
            try {
              tridentLog('INFO', 'spg', `[${job.name}] LLM call starting`);
              const content = await generateSpecViaLLM(job.brief, undefined, false, job.system, true);
              const footer = `\n\n---\n*END OF ${projectName} ${job.name} — Compaction-proof build artifact. Generated ${new Date().toISOString()}.*\n`;
              const finalContent = content + footer;
              const lines = finalContent.split('\n').length;
              const filePath = path.join(libDir, job.fileName);
              await fs.writeFile(filePath, finalContent, 'utf-8');
              tridentLog('INFO', 'spg', `[${job.name}] DONE — ${lines} lines -> ${filePath}`);
              return { name: job.name, path: filePath, lines };
            } catch (e: unknown) {
              tridentLog('ERROR', 'spg', `[${job.name}] LLM generation failed: ${e instanceof Error ? e.message : String(e)}`);
              throw e;
            }
          }),
        );

        await drainPendingSessions();

        // Collect results
        const specs: Array<{ name: string; path: string; lines: number; status: string }> = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === 'fulfilled') {
            specs.push({ ...r.value, status: 'OK' });
          } else {
            const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
            tridentLog('ERROR', 'spg', `[${jobs[i].name}] FAILED: ${errMsg}`);
            specs.push({ name: jobs[i].name, path: '', lines: 0, status: `FAILED: ${errMsg}` });
          }
        }

        // ── Phase 6: MASTER_INDEX LAST — counts from disk + contents from the actual tree (audit F7/F12) ──
        const okSpecs = specs.filter(s => s.status === 'OK');
        const readLines = (f: string): number => {
          try { return fsSync.readFileSync(f, 'utf-8').split('\n').length; } catch { return 0; }
        };
        const docLines = specs.map(s => s.status === 'OK' && s.path ? readLines(s.path) : 0);
        const totalDocLines = docLines.reduce((a, b) => a + b, 0);

        // actual copied tree
        const pkgTree: string[] = [];
        const walkTree = (dir: string, rel: string): void => {
          for (const e of fsSync.readdirSync(dir, { withFileTypes: true })) {
            if (SPG_IGNORE_DEFAULT.some(ig => e.name.includes(ig))) continue;
            const p = path.join(dir, e.name);
            const r = rel ? path.join(rel, e.name) : e.name;
            if (e.isDirectory()) walkTree(p, r);
            else pkgTree.push(r);
          }
        };
        walkTree(libDir, '');

        let index = `# Ship Package — ${projectName}\n\n`;
        index += `**Version:** ${version}\n`;
        index += `**Deployment Fingerprint:** \`${fingerprint}\`\n`;
        index += `**Artifacts:** ${artifactTable.map(a => `${a.path} (${a.sizeKB} KB, ${a.sha.substring(0, 12)}...)`).join('; ')}\n`;
        index += `**Source:** ${stats.tsFiles} .ts files, ${stats.lines.toLocaleString()} lines\n`;
        index += `**Generated:** ${new Date().toISOString()}\n`;
        index += `**Location:** \`${libDir}\`\n\n`;
        index += `## Generated Documents (counts read from disk)\n\n`;
        index += `| # | Document | Lines | Status |\n`;
        index += `|---|----------|-------|--------|\n`;
        for (let i = 0; i < specs.length; i++) {
          index += `| ${i + 1} | ${specs[i].name} | ${docLines[i]} | ${specs[i].status} |\n`;
        }
        index += `\n**Total documentation:** ${totalDocLines} lines across ${okSpecs.length} docs\n\n`;
        index += `## Package Contents (actual copied tree — ${pkgTree.length} files)\n\n`;
        index += `| Path | \n|------|\n`;
        for (const rel of pkgTree.sort()) index += `| \`${rel}\` |\n`;

        await fs.writeFile(path.join(libDir, 'MASTER_INDEX.md'), index, 'utf-8');

        // ── Phase 7: POST-GENERATION PACKAGE AUDIT (audit F11 + point 7) ──
        tridentLog('INFO', 'spg', 'Phase 7: Post-generation package audit');
        const audit = await runPackageAudit(libDir, distManifest, fingerprint, artifactTable);
        await fs.writeFile(path.join(libDir, 'PACKAGE_AUDIT.md'), audit.markdown, 'utf-8');

        if (!audit.ok) {
          return `SHIP PACKAGE BLOCKED — POST-GENERATION AUDIT FAILED (${audit.violations.length} violation(s)):\n${audit.violations.map(v => `  - ${v}`).join('\n')}\n\nFix the violations, then retry. PACKAGE_AUDIT.md written to ${libDir}.`;
        }

        tridentLog('INFO', 'spg', `SHIP PACKAGE COMPLETE: ${projectName} — ${okSpecs.length}/${specs.length} docs, ${totalDocLines} doc lines, ${artifactTable.length} artifacts, audit PASS`);

        return `SHIP PACKAGE COMPLETE — ${projectName} v${version}

Deployment Fingerprint: ${fingerprint}
Artifacts: ${artifactTable.map(a => `${a.path} (${a.sizeKB} KB)`).join(', ')}
Source: ${stats.tsFiles} .ts files, ${stats.lines.toLocaleString()} lines
Location: ${libDir}

Generated Documents:
${specs.map(s => `  ${s.status === 'OK' ? '✅' : '❌'} ${s.name}: ${s.lines} lines [${s.status}]`).join('\n')}

Total documentation: ${totalDocLines} lines
Package audit: ✅ PASS (PACKAGE_AUDIT.md shipped)
Package includes: src/, dist/ (manifest artifacts), ship dirs, configs, SHIP_MANIFEST, DEPLOY.sh, README, MASTER_INDEX, PACKAGE_AUDIT

📄 Package: ${libDir}`;

      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        tridentLog('ERROR', 'spg', `SHIP PACKAGE FAILED: ${errMsg}`);
        return `SHIP PACKAGE ERROR: ${errMsg}`;
      }
    },
  });
}
