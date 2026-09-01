import * as ts from 'typescript';
import {LayerRule, CodeConstruct, AnalysisContext, AuditFinding} from '../types.ts';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Structural Build Command Analysis
// ---------------------------------------------------------------------------

interface BuildCommandAnalysis {
  /** Primary build tool token (first non-flag, non-env-var token). */
  tool: string;
  /** All --flag tokens as a Set for O(1) lookup. */
  flags: Set<string>;
  /** Every whitespace-delimited token in the script. */
  tokens: string[];
  /** True when a known bundler tool appears among the tokens. */
  hasBundler: boolean;
  /** True when --bundle flag is present. */
  hasBundleFlag: boolean;
  /** True when --platform=node flag is present. */
  hasPlatformNode: boolean;
  /** Raw script string for evidence. */
  raw: string;
}

const KNOWN_BUNDLERS = new Set([
  'esbuild', 'bun', 'tsup', 'rollup', 'webpack', 'vite', 'parcel', 'ncc',
]);

const KNOWN_COMPILERS = new Set(['tsc', 'tsc-alias', 'ttsc']);

const MONOREPO_TOOLS = new Set(['turbo', 'nx']);

/**
 * Tokenize a shell build command into a structural representation.
 * Replaces all prior string-matching with Set-based O(1) lookups.
 */
function analyzeBuildCommand(script: string): BuildCommandAnalysis {
  const tokens = script.split(/\s+/).filter(t => t.length > 0);
  const flags = new Set(tokens.filter(t => t.startsWith('-')));

  // Primary tool = first token that is not a flag and not an env assignment
  let tool = '';
  for (const t of tokens) {
    if (t.startsWith('-')) continue;
    // Skip env-var assignments like NODE_ENV=production (contain '=' but no '/')
    if (t.search('=') !== -1 && t.search('/') === -1) continue;
    tool = t;
    break;
  }

  const hasBundler = tokens.some(t => {
    const base = t.split('/').pop() || t;
    return KNOWN_BUNDLERS.has(t) || KNOWN_BUNDLERS.has(base);
  });

  const hasBundleFlag = flags.has('--bundle');
  const hasPlatformNode = flags.has('--platform=node');

  return { tool, flags, tokens, hasBundler, hasBundleFlag, hasPlatformNode, raw: script };
}

/** Check whether any token in the command refers to a monorepo orchestrator. */
function referencesMonorepoTool(analysis: BuildCommandAnalysis): boolean {
  return analysis.tokens.some(t => MONOREPO_TOOLS.has(t));
}

/** Check whether the tool set is compiler-only (no bundler present). */
function isCompilerOnly(analysis: BuildCommandAnalysis): boolean {
  const toolBase = analysis.tool.split('/').pop() || analysis.tool;
  return KNOWN_COMPILERS.has(toolBase) && !analysis.hasBundler;
}

// ---------------------------------------------------------------------------
// Structural tsconfig Validation (ts.readConfigFile)
// ---------------------------------------------------------------------------

interface TsconfigValidation {
  exists: boolean;
  parseable: boolean;
  config: ts.ParsedCommandLine | null;
  errorText: string | null;
}

function validateTsconfig(projectRoot: string): TsconfigValidation {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return { exists: false, parseable: false, config: null, errorText: null };
  }

  const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (readResult.error) {
    const msg = ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n');
    return { exists: true, parseable: false, config: null, errorText: msg };
  }

  const parsed = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    projectRoot,
  );

  return { exists: true, parseable: true, config: parsed, errorText: null };
}

// ---------------------------------------------------------------------------
// Structural dist/ Validation
// ---------------------------------------------------------------------------

interface DistValidation {
  exists: boolean;
  isSingleFile: boolean;
  fileCount: number;
  totalSize: number;
}

function validateDist(projectRoot: string): DistValidation {
  const distPath = path.join(projectRoot, 'dist');
  if (!fs.existsSync(distPath)) {
    return { exists: false, isSingleFile: false, fileCount: 0, totalSize: 0 };
  }

  const stat = fs.statSync(distPath);
  if (!stat.isDirectory()) {
    return { exists: true, isSingleFile: true, fileCount: 1, totalSize: stat.size };
  }

  const entries = fs.readdirSync(distPath).filter(e => {
    const fullPath = path.join(distPath, e);
    return fs.statSync(fullPath).isFile();
  });

  const totalSize = entries.reduce((sum, e) => {
    return sum + fs.statSync(path.join(distPath, e)).size;
  }, 0);

  return {
    exists: true,
    isSingleFile: entries.length === 1,
    fileCount: entries.length,
    totalSize,
  };
}

// ---------------------------------------------------------------------------
// Layer Rule
// ---------------------------------------------------------------------------

export const R0_BUILD_CHAIN: LayerRule = {
  layer: 'R0',
  name: 'Build Chain Integrity',
  description: 'Validates build system produces single-file bundle suitable for container deployment',
  applicableTo: [],
  enabled: true,

  evaluate(_construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const pkg = ctx.packageJson;
    if (!pkg) return findings;

    const buildScript: string = pkg.scripts?.build || '';
    const analysis = analyzeBuildCommand(buildScript);

    // -----------------------------------------------------------------
    // CHECK 1: Compiler-only build (tsc without bundler) → CRITICAL
    // Structural: token classification via KNOWN_COMPILERS / KNOWN_BUNDLERS sets
    // -----------------------------------------------------------------
    if (isCompilerOnly(analysis)) {
      findings.push({
        layer: 'R0',
        severity: 'CRITICAL',
        category: 'BUILD_CHAIN',
        file: 'package.json',
        line: 0,
        evidence: analysis.raw,
        description: 'Build uses tsc instead of bundler — produces multi-file output that breaks container deployment',
        correction: 'Change build script to use esbuild/bun/tsup with --bundle for single-file output',
        runtimeImpact: 'Plugin fails to load in container — import resolution fails when only index.js is copied',
        confidence: 0.95,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // -----------------------------------------------------------------
    // CHECK 2: Build tool config files exist without a build script → MEDIUM
    // Structural: fs.existsSync() on known config paths
    // -----------------------------------------------------------------
    const buildToolConfigFiles = [
      'tsup.config.ts', 'tsup.config.js', 'tsup.config.mjs',
      'rollup.config.ts', 'rollup.config.js', 'rollup.config.mjs',
      'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
      'webpack.config.ts', 'webpack.config.js', 'webpack.config.mjs',
    ];

    if (!buildScript) {
      for (const configFile of buildToolConfigFiles) {
        const configPath = path.join(ctx.projectRoot, configFile);
        if (fs.existsSync(configPath)) {
          findings.push({
            layer: 'R0',
            severity: 'MEDIUM',
            category: 'BUILD_CHAIN',
            file: configFile,
            line: 0,
            evidence: `${configFile} exists but no build script in package.json`,
            description: `Build configuration file ${configFile} found but no corresponding build script`,
            correction: `Add a build script to package.json that uses ${configFile}`,
            runtimeImpact: 'Build configuration exists but is never invoked — dist may be stale or missing',
            confidence: 0.80,
            constructType: null,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
          break;
        }
      }
    }

    // -----------------------------------------------------------------
    // CHECK 3: Monorepo build system files → LOW
    // Structural: fs.existsSync() + Set-based token lookup
    // -----------------------------------------------------------------
    const buildSystemFiles = ['turbo.json', 'nx.json'];

    for (const systemFile of buildSystemFiles) {
      const systemPath = path.join(ctx.projectRoot, systemFile);
      if (fs.existsSync(systemPath)) {
        const hasMonorepoRef = referencesMonorepoTool(analysis);
        if (!hasMonorepoRef && buildScript) {
          findings.push({
            layer: 'R0',
            severity: 'LOW',
            category: 'BUILD_CHAIN',
            file: systemFile,
            line: 0,
            evidence: `${systemFile} exists alongside non-monorepo build script`,
            description: `Monorepo build system file ${systemFile} found but build script doesn't reference it`,
            correction: `Ensure build script is compatible with ${systemFile} or remove unused config`,
            runtimeImpact: 'Build system configuration mismatch may cause inconsistent builds',
            confidence: 0.60,
            constructType: null,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }

    // -----------------------------------------------------------------
    // CHECK 4: esbuild without --bundle → HIGH
    // Structural: Set.has() on parsed flags
    // -----------------------------------------------------------------
    const toolIsEsbuild = analysis.tokens.some(t => {
      const base = t.split('/').pop() || t;
      return base === 'esbuild';
    });

    if (toolIsEsbuild && !analysis.hasBundleFlag) {
      findings.push({
        layer: 'R0',
        severity: 'HIGH',
        category: 'BUILD_CHAIN',
        file: 'package.json',
        line: 0,
        evidence: analysis.raw,
        description: 'esbuild build missing --bundle flag — produces multi-file output',
        correction: 'Add --bundle flag to esbuild command',
        runtimeImpact: 'Same as tsc — multi-file output breaks container deployment',
        confidence: 0.95,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // -----------------------------------------------------------------
    // CHECK 5: esbuild without --platform=node → MEDIUM
    // Structural: Set.has() on parsed flags
    // -----------------------------------------------------------------
    if (toolIsEsbuild && !analysis.hasPlatformNode) {
      findings.push({
        layer: 'R0',
        severity: 'MEDIUM',
        category: 'BUILD_CHAIN',
        file: 'package.json',
        line: 0,
        evidence: analysis.raw,
        description: 'esbuild build missing --platform=node — may produce browser-incompatible output',
        correction: 'Add --platform=node to esbuild command',
        runtimeImpact: 'Node builtins (fs, path) not externalized — bundle may contain polyfills that fail',
        confidence: 0.90,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // -----------------------------------------------------------------
    // CHECK 6: No type-check script alongside esbuild → MEDIUM
    // Structural: Object.keys() lookup on scripts record
    // -----------------------------------------------------------------
    const scriptKeys = new Set(Object.keys(pkg.scripts || {}));
    if (!scriptKeys.has('build:check') && toolIsEsbuild) {
      findings.push({
        layer: 'R0',
        severity: 'MEDIUM',
        category: 'BUILD_CHAIN',
        file: 'package.json',
        line: 0,
        evidence: 'No build:check script',
        description: 'No type checking script — esbuild does not type-check, errors slip through',
        correction: 'Add "build:check": "tsc --noEmit" script',
        runtimeImpact: 'Type errors caught at runtime instead of build time',
        confidence: 0.90,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // -----------------------------------------------------------------
    // CHECK 7 (NEW): tsconfig.json validation via ts.readConfigFile()
    // Structural: TypeScript compiler API parse + diagnostic inspection
    // -----------------------------------------------------------------
    const tsconfigResult = validateTsconfig(ctx.projectRoot);
    if (tsconfigResult.exists && !tsconfigResult.parseable) {
      findings.push({
        layer: 'R0',
        severity: 'HIGH',
        category: 'BUILD_CHAIN',
        file: 'tsconfig.json',
        line: 0,
        evidence: tsconfigResult.errorText || 'tsconfig.json parse failure',
        description: 'tsconfig.json exists but cannot be parsed by the TypeScript compiler',
        correction: 'Fix JSON syntax errors in tsconfig.json — ensure valid JSON with no trailing commas',
        runtimeImpact: 'TypeScript compilation fails — build pipeline blocked',
        confidence: 0.95,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // -----------------------------------------------------------------
    // CHECK 8 (NEW): dist/ directory validation via fs.existsSync()
    // Structural: filesystem stat + entry enumeration
    // -----------------------------------------------------------------
    const distResult = validateDist(ctx.projectRoot);
    if (buildScript && !distResult.exists) {
      findings.push({
        layer: 'R0',
        severity: 'MEDIUM',
        category: 'BUILD_CHAIN',
        file: 'dist/',
        line: 0,
        evidence: 'dist/ directory not found',
        description: 'Build script defined but dist/ output directory does not exist — build may never have run',
        correction: 'Run the build script to produce dist/ output before deployment',
        runtimeImpact: 'Container deployment copies dist/ — missing directory causes load failure',
        confidence: 0.75,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    if (distResult.exists && !distResult.isSingleFile && distResult.fileCount > 1) {
      findings.push({
        layer: 'R0',
        severity: 'MEDIUM',
        category: 'BUILD_CHAIN',
        file: 'dist/',
        line: 0,
        evidence: `dist/ contains ${distResult.fileCount} files (${distResult.totalSize} bytes total)`,
        description: `dist/ contains ${distResult.fileCount} files — expected single-file bundle for container deployment`,
        correction: 'Configure bundler with --bundle to produce a single output file',
        runtimeImpact: 'Multi-file dist/ may have unresolved imports when only the entry file is copied to container',
        confidence: 0.70,
        constructType: null,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // -----------------------------------------------------------------
    // CHECK 9 (NEW): TypeScript program diagnostics from ctx
    // Structural: ts.Diagnostic[] inspection (pre-computed by scanner)
    // -----------------------------------------------------------------
    if (ctx.diagnostics && ctx.diagnostics.length > 0) {
      const errorDiags = ctx.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
      if (errorDiags.length > 0) {
        const firstDiag = errorDiags[0];
        const diagFile = firstDiag.file?.fileName || 'unknown';
        const diagMsg = ts.flattenDiagnosticMessageText(firstDiag.messageText, ' ');
        findings.push({
          layer: 'R0',
          severity: 'HIGH',
          category: 'BUILD_CHAIN',
          file: diagFile,
          line: firstDiag.file && firstDiag.start !== undefined
            ? ts.getLineAndCharacterOfPosition(firstDiag.file, firstDiag.start).line + 1
            : 0,
          evidence: `${errorDiags.length} TypeScript error(s): ${diagMsg}`,
          description: `TypeScript program has ${errorDiags.length} compile error(s) — build output may be stale or broken`,
          correction: 'Fix TypeScript errors before building — run tsc --noEmit to see all errors',
          runtimeImpact: 'Build may succeed with esbuild (no type-check) but runtime behavior is undefined',
          confidence: 0.90,
          constructType: null,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    return findings;
  },
};
