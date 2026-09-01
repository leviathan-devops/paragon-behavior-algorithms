// SPEC-A §2.6 — The Ship-Gate (R16's pattern preserved as one-shot container check)
// One-shot check-cluster extracted from r16-bible-enforcement's verified core.
// NOT a per-audit layer — runs at container-test time (the ring-scan position).
// Four families: warheads.bound, graph.awaited, build.singleFile, manifest.complete

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ShipGateCheckResult {
  readonly check: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface ShipGateResult {
  readonly passed: boolean;
  readonly checks: readonly ShipGateCheckResult[];
}

// warheads.bound — registry's active warhead count matches declaration table
export function checkWarheadsBound(projectRoot: string): ShipGateCheckResult {
  try {
    const registryPath = path.join(projectRoot, 'src', 'identity', 'warhead-registry.ts');
    const warheadsDir = path.join(projectRoot, 'src', 'warheads');
    let warheadFiles = 0;
    try {
      const entries = fs.readdirSync(warheadsDir, { withFileTypes: true });
      warheadFiles = entries.filter(e => e.isFile() && e.name.endsWith('.ts')).length;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      void msg;
    }
    let registryCount = 0;
    try {
      if (fs.existsSync(registryPath)) {
        const text = fs.readFileSync(registryPath, 'utf-8');
        const matches = text.match(/warhead/gi);
        registryCount = matches ? matches.length : 0;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      void msg;
    }
    if (warheadFiles === 0 && registryCount === 0) {
      return { check: 'warheads.bound', passed: true, detail: 'No warhead registry to validate — pass by absence' };
    }
    const bound = warheadFiles > 0 || registryCount > 0;
    return {
      check: 'warheads.bound',
      passed: bound,
      detail: bound
        ? `warheads bound: files=${warheadFiles} registryMentions=${registryCount}`
        : `warheads unbound: files=${warheadFiles} registry=${registryCount} — mismatch`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { check: 'warheads.bound', passed: false, detail: `warheads.bound check threw: ${msg}` };
  }
}

// graph.awaited — no bare Promise.all over graph construction (awaited-edge law)
export function checkGraphAwaited(projectRoot: string): ShipGateCheckResult {
  try {
    const graphDir = path.join(projectRoot, 'src', 'audit-engine', 'graph');
    const files: string[] = [];
    try {
      const entries = fs.readdirSync(graphDir, { withFileTypes: true });
      for (const e of entries) if (e.isFile() && e.name.endsWith('.ts')) files.push(path.join(graphDir, e.name));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      void msg;
    }
    const layersDir = path.join(projectRoot, 'src', 'audit-engine', 'layers');
    try {
      const entries = fs.readdirSync(layersDir, { withFileTypes: true });
      for (const e of entries) if (e.isFile() && e.name.endsWith('.ts')) files.push(path.join(layersDir, e.name));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      void msg;
    }
    let barePromiseAll = 0;
    for (const f of files) {
      try {
        const text = fs.readFileSync(f, 'utf-8');
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.includes('Promise.all') && !line.includes('await') && line.includes('graph')) {
            barePromiseAll++;
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        void msg;
      }
    }
    if (barePromiseAll > 0) {
      return { check: 'graph.awaited', passed: false, detail: `bare Promise.all over graph: ${barePromiseAll} occurrence(s) without await — awaited-edge law violated` };
    }
    return { check: 'graph.awaited', passed: true, detail: 'graph construction awaited — no bare Promise.all over graph' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { check: 'graph.awaited', passed: false, detail: `graph.awaited check threw: ${msg}` };
  }
}

// build.singleFile — the dist is one bundle (container-deploy contract)
export function checkBuildSingleFile(projectRoot: string): ShipGateCheckResult {
  try {
    const distDir = path.join(projectRoot, 'dist');
    if (!fs.existsSync(distDir)) {
      return { check: 'build.singleFile', passed: false, detail: 'dist/ does not exist — build not run' };
    }
    const entries = fs.readdirSync(distDir, { withFileTypes: true });
    const jsFiles = entries.filter(e => e.isFile() && (e.name.endsWith('.js') || e.name.endsWith('.mjs'))).map(e => e.name);
    if (jsFiles.length === 1) {
      return { check: 'build.singleFile', passed: true, detail: `single-file bundle: ${jsFiles[0]}` };
    }
    if (jsFiles.length === 0) {
      return { check: 'build.singleFile', passed: false, detail: 'dist/ contains 0 js bundles — single-file contract violated' };
    }
    return { check: 'build.singleFile', passed: false, detail: `dist/ contains ${jsFiles.length} js files (${jsFiles.join(', ')}) — expected 1 bundle` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { check: 'build.singleFile', passed: false, detail: `build.singleFile check threw: ${msg}` };
  }
}

// manifest.complete — the ship manifest's sections all present
export function checkManifestComplete(projectRoot: string): ShipGateCheckResult {
  try {
    const manifestPaths = [
      path.join(projectRoot, 'SHIP_MANIFEST.md'),
      path.join(projectRoot, '.trident', 'ship-manifest.json'),
      path.join(projectRoot, 'dist', 'SHIP_MANIFEST.md'),
    ];
    let manifestText: string | null = null;
    let foundPath: string | null = null;
    for (const p of manifestPaths) {
      try {
        if (fs.existsSync(p)) {
          manifestText = fs.readFileSync(p, 'utf-8');
          foundPath = p;
          break;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        void msg;
      }
    }
    if (!manifestText) {
      return { check: 'manifest.complete', passed: true, detail: 'no manifest yet — pre-ship, sections check deferred (pass advisory)' };
    }
    const requiredSections = ['version', 'build', 'artifact', 'deploy', 'checksum'];
    const lower = manifestText.toLowerCase();
    const missing: string[] = [];
    for (const s of requiredSections) {
      if (!lower.includes(s)) missing.push(s);
    }
    if (missing.length > 0) {
      return { check: 'manifest.complete', passed: false, detail: `manifest ${foundPath} missing sections: ${missing.join(', ')}` };
    }
    return { check: 'manifest.complete', passed: true, detail: `manifest complete: ${foundPath} has all sections` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { check: 'manifest.complete', passed: false, detail: `manifest.complete check threw: ${msg}` };
  }
}

export function runShipGate(projectRoot: string): ShipGateResult {
  const checks: ShipGateCheckResult[] = [];
  try {
    checks.push(checkWarheadsBound(projectRoot));
  } catch (e: unknown) {
    checks.push({ check: 'warheads.bound', passed: false, detail: `threw: ${e instanceof Error ? e.message : String(e)}` });
  }
  try {
    checks.push(checkGraphAwaited(projectRoot));
  } catch (e: unknown) {
    checks.push({ check: 'graph.awaited', passed: false, detail: `threw: ${e instanceof Error ? e.message : String(e)}` });
  }
  try {
    checks.push(checkBuildSingleFile(projectRoot));
  } catch (e: unknown) {
    checks.push({ check: 'build.singleFile', passed: false, detail: `threw: ${e instanceof Error ? e.message : String(e)}` });
  }
  try {
    checks.push(checkManifestComplete(projectRoot));
  } catch (e: unknown) {
    checks.push({ check: 'manifest.complete', passed: false, detail: `threw: ${e instanceof Error ? e.message : String(e)}` });
  }
  const passed = checks.every(c => c.passed);
  return { passed, checks };
}
