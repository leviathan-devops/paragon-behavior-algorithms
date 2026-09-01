/**
 * audit-project-context.ts — THE PROJECT-TYPE + CONTEXT GATE (the L2 spec §3.2 — W2)
 *
 * THE SCORE-CAP FIX: the plugin-specific layers (R1/R8/R12/R15/R16) fire on
 * ANY project — a non-plugin library's ordinary methods are structurally
 * scanned as if they were plugin hook handlers → 34 false MEDIUM HOOK_CONTRACT
 * findings → the god loop's progressive score caps ~23-30 → PASS (≥96)
 * unreachable for non-plugin projects.
 * THE FIX: detect the project shape (the @opencode-ai/plugin import probe +
 * the package.json evidence + the directory evidence) → gate the plugin-
 * specific layers OUT of the score's weight pool for non-plugin targets (the
 * findings STAY informational in the report) + context-adjust the weights.
 * THE DUALITY: the tool contextualizes the target; the tool's own project-
 * shape is detected + gated by the enforcement ring's import-graph integrity.
 *
 * THE OPERATOR: "the scoring system is fucked and needs major context aware
 * rework" + "the mechanisms that it audits codebases for are itself built
 * into the tool."
 */
import * as fs from 'fs';
import * as path from 'path';
import { ProjectContext, ProjectShape, PLUGIN_SPECIFIC_LAYERS, Severity, SEVERITY_WEIGHT } from '../types.ts';

/**
 * THE SHAPE DETECTOR — the small state machine (never a prose guess).
 *
 * THE IMPORT EVIDENCE: scan the target's src/index.ts + the top-level imports
 * for the exact string '@opencode-ai/plugin'. THE REGEX IS THE DETECTOR (the
 * exact-string match); THE CLASSIFIER IS THE DECISION (the ISE law).
 *
 * THE SHAPE TAXONOMY:
 *   plugin       — the import present
 *   library      — the package.json exports a library entry, no plugin import
 *   app          — a main entry, no library exports
 *   monorepo     — the packages/ or the workspace pattern
 *   test-heavy   — the tests/ dominates
 *   indeterminate — nothing decisive — the conservative default (gated OFF)
 */
export async function detectProjectShape(target: string): Promise<ProjectContext> {
  const evidence = { imports: [] as string[], pkgFields: {} as Record<string, unknown>, dirs: [] as string[] };

  // STEP 1 — THE IMPORT EVIDENCE (the @opencode-ai/plugin probe)
  evidence.imports = await scanTopLevelImports(target);

  // STEP 2 — THE PACKAGE EVIDENCE (the exports/main/workspaces fields)
  evidence.pkgFields = await readPackageJson(target);

  // STEP 3 — THE DIRECTORY EVIDENCE (the top-level entries)
  evidence.dirs = await listTopLevelDirs(target);

  // STEP 4 — THE SHAPE CLASSIFIER (the small state machine)
  const isPlugin = evidence.imports.includes('@opencode-ai/plugin');
  const pkg = evidence.pkgFields;
  const shape: ProjectShape =
    isPlugin ? 'plugin' :
    (typeof pkg.workspaces !== 'undefined' || evidence.dirs.includes('packages')) ? 'monorepo' :
    evidence.dirs.some((d) => d.startsWith('test')) ? 'test-heavy' :
    (typeof pkg.exports !== 'undefined' || typeof pkg.module !== 'undefined') ? 'library' :
    typeof pkg.main !== 'undefined' ? 'app' :
    'indeterminate';

  return buildContext(shape, isPlugin, evidence);
}

/**
 * STEP 5 — THE LAYER GATE: the plugin-specific layers excluded from the score's
 * weight pool for non-plugin targets. THE FINDINGS STAY in the report as
 * informational (the honest transparency, never a silent drop).
 * gateVerdict: GATED (the plugin layers excluded) | UNGATED (the plugin shape)
 * | INDETERMINATE (the conservative default = GATED).
 */
function buildContext(
  shape: ProjectShape,
  isPlugin: boolean,
  evidence: { imports: string[]; pkgFields: Record<string, unknown>; dirs: string[] },
): ProjectContext {
  const gatedLayers = isPlugin ? [] : [...PLUGIN_SPECIFIC_LAYERS];
  const gateVerdict = isPlugin ? 'UNGATED' : shape === 'indeterminate' ? 'INDETERMINATE' : 'GATED';
  const scoreWeights: Record<Severity, number> = { ...SEVERITY_WEIGHT };
  return { shape, isPlugin, evidence, gatedLayers, scoreWeights, gateVerdict };
}

/** Scan the target's src/index.ts + the top-level imports for '@opencode-ai/plugin'. */
async function scanTopLevelImports(target: string): Promise<string[]> {
  const imports: string[] = [];
  const candidates = [
    path.join(target, 'src', 'index.ts'),
    path.join(target, 'src', 'index.tsx'),
    path.join(target, 'index.ts'),
  ];
  for (const candidate of candidates) {
    const source = readIfExists(candidate);
    if (!source) continue;
    const importRe = /(?:import|export)\s+(?:type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(source)) !== null) {
      imports.push(m[1]);
    }
  }
  // Also scan the whole src/ tree's top-level import statements (the cheap pass)
  const srcDir = path.join(target, 'src');
  if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
    for (const entry of fs.readdirSync(srcDir)) {
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
      const source = readIfExists(path.join(srcDir, entry));
      if (!source) continue;
      const importRe = /(?:import|export)\s+(?:type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(source)) !== null) {
        if (!imports.includes(m[1])) imports.push(m[1]);
      }
    }
  }
  return imports;
}

async function readPackageJson(target: string): Promise<Record<string, unknown>> {
  const raw = readIfExists(path.join(target, 'package.json'));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function listTopLevelDirs(target: string): Promise<string[]> {
  try {
    return fs.readdirSync(target).filter((name) => {
      try {
        return fs.statSync(path.join(target, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function readIfExists(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
