// l1-brief-builder.ts — Builds the L1 BUILD TASK DIRECTIVE brief.
//
// L1 is a build directive: phased instructions with anti-patterns.
// An agent reads this brief and executes the build sequence.
//
// All content is derived from analysis data — no template text.
// Every anti-pattern must reference REAL file:line evidence.
// Every build step must reference REAL constructs from the codebase.

import type { AnalysisResult } from './analysis-engine.ts';
import type { DiscoveryResult } from '../shared/auto-discover.js';
import type { L2Strategy } from './l2-strategy.ts';

// ============================================================================
// HELPERS
// ============================================================================

/** The construct runtime view — the typed CodeConstruct fields plus the
 *  loosely-typed shape the discovery pipeline can attach (kind/methods/file/
 *  description/name). The R9 runtime-contract law: no `as any` — the view is
 *  a concrete structural type over the known union of runtime shapes. */
interface ConstructView {
  kind?: string;
  type?: string;
  name?: string;
  file?: string;
  filePath?: string;
  line?: number;
  methods?: Array<string | { name?: string }>;
  fields?: Array<string | { name?: string }>;
  properties?: Array<string | { name?: string }>;
  parameters?: Array<string | { name?: string }>;
  params?: Array<string | { name?: string }>;
  returnType?: string | null;
  returns?: string;
}

/** The phase runtime view — the typed PipelinePhase fields plus the
 *  description/name fallbacks the builder reads. */
interface PhaseView {
  id?: string;
  description?: string;
  name?: string;
  domain?: string;
  defenses?: string[];
  executionModel?: string;
}

/** The defense runtime view — the typed DefenseSpec fields plus the
 *  description fallback the builder reads. */
interface DefenseView {
  rule: string;
  description?: string;
  checkMethod?: string;
  domain?: string;
  violationSeverity?: string;
}

/** The threat runtime view — the typed ThreatReport fields. */
interface ThreatView {
  pattern: string;
  severity: string;
  findings?: Array<{ file?: string; line?: number; message?: string; snippet?: string }>;
  defeatVectors?: string[];
}

/** Count total threat instances across all patterns. */
function totalThreatInstances(threats: AnalysisResult['threats']): number {
  return threats.reduce((sum, t) => sum + (t.findings?.length || 0), 0);
}

/** Extract a short file list from discovery entry points or patterns. */
function scaffoldFileList(discovery: DiscoveryResult): string[] {
  if (discovery.entryPoints.length > 0) return discovery.entryPoints.slice(0, 8);
  return discovery.patterns.slice(0, 8).map((p) => p.file);
}

// ============================================================================
// SEVERITY ORDERING
// ============================================================================

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Sort defenses by violation severity (most severe first). */
function sortBySeverity<T extends { violationSeverity?: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (SEV_ORDER[a.violationSeverity ?? ''] ?? 2) - (SEV_ORDER[b.violationSeverity ?? ''] ?? 2),
  );
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build the L1 BUILD TASK DIRECTIVE brief.
 *
 * Takes the same analysis data as L2 but transforms it into a build directive
 * format — phased build steps with anti-patterns, not a spec or code-fix list.
 *
 * The returned string is a complete prompt for an LLM to produce a build directive.
 */
export function buildL1Brief(
  analysis: AnalysisResult,
  discovery: DiscoveryResult,
  strategy: L2Strategy,
  projectName: string,
): string {
  const L: string[] = [];

  const tier = strategy.complexity.tier;
  const domain = strategy.complexity.domainType;
  const threats = analysis.threats;
  const defenses = analysis.defenses;
  const pipeline = analysis.pipeline;
  const tests = analysis.tests;
  const types = analysis.types;
  const constructs = analysis.constructs;
  const fileList = scaffoldFileList(discovery);

  // ═════════════════════════════════════════════════════════════════════════
  // HEADER — Project identity + scope
  // ═════════════════════════════════════════════════════════════════════════

  L.push(`# BUILD DIRECTIVE: ${projectName}`);
  L.push('');
  L.push(`## Project Context`);
  L.push(`${discovery.totalFiles} source files | ${discovery.totalLines} lines | ${tier} complexity | ${domain} domain`);
  L.push(`${constructs.length} code constructs detected (classes, functions, interfaces)`);
  L.push(`${threats.length} threat patterns | ${totalThreatInstances(threats)} total findings | ${defenses.length} defense rules`);
  L.push(`${pipeline.phases.length} pipeline phases | ${tests.length} test cases`);
  L.push('');

  // ═════════════════════════════════════════════════════════════════════════
  // CONCRETE CODE EVIDENCE — What exists in the codebase right now
  // ═════════════════════════════════════════════════════════════════════════

  L.push(`## Detected Constructs (use these EXACT names in the directive)`);
  // Group constructs by type
  const classes = constructs.filter((c: ConstructView) => c.kind === 'class' || c.type === 'class');
  const interfaces = constructs.filter((c: ConstructView) => c.kind === 'interface' || c.type === 'interface');
  const functions = constructs.filter((c: ConstructView) => c.kind === 'function' || c.type === 'function');

  if (classes.length > 0) {
    L.push(`### Classes (${classes.length})`);
    for (const c of classes.slice(0, 15)) {
      const cc = c as ConstructView;
      const methods = (cc.methods || []).slice(0, 5).map((m: string | { name?: string }) =>
        typeof m === 'string' ? m : (m.name || String(m))
      );
      L.push(`- \`${cc.name}\` (${cc.file || cc.filePath || '?'}): ${methods.join(', ') || 'no methods detected'}`);
    }
  }
  if (interfaces.length > 0) {
    L.push(`### Interfaces (${interfaces.length})`);
    for (const c of interfaces.slice(0, 10)) {
      const cc = c as ConstructView;
      L.push(`- \`${cc.name}\` (${cc.file || cc.filePath || '?'})`);
    }
  }
  if (functions.length > 0) {
    L.push(`### Functions (${functions.length})`);
    for (const c of functions.slice(0, 10)) {
      const cc = c as ConstructView;
      L.push(`- \`${cc.name}()\` (${cc.file || cc.filePath || '?'})`);
    }
  }
  L.push('');

  // ═════════════════════════════════════════════════════════════════════════
  // THREAT EVIDENCE — Real file:line findings (not generic advice)
  // ═════════════════════════════════════════════════════════════════════════

  L.push(`## Threat Evidence (reference these in ❌ anti-patterns)`);
  for (const t of threats) {
    const tt = t as ThreatView;
    const findings = (tt.findings || []).slice(0, 5);
    L.push(`### ${tt.pattern} (${findings.length} instances)`);
    for (const f of findings) {
      L.push(`- \`${f.file}:${f.line}\` — ${f.message || f.snippet || 'detected'}`);
    }
    if (tt.defeatVectors && tt.defeatVectors.length > 0) {
      L.push(`Defeat vectors: ${tt.defeatVectors.join(', ')}`);
    }
  }
  L.push('');

  // ═════════════════════════════════════════════════════════════════════════
  // DEFENSE RULES — What must be enforced
  // ═════════════════════════════════════════════════════════════════════════

  L.push(`## Defense Rules (each becomes a build constraint)`);
  const sortedDefs = sortBySeverity(defenses as DefenseView[]);
  for (const d of sortedDefs) {
    const dd = d as DefenseView;
    const sev = dd.violationSeverity || 'MEDIUM';
    L.push(`- [${sev}] \`${dd.rule}\` — ${dd.description || dd.checkMethod || 'must enforce'} (domain: ${dd.domain || 'general'})`);
  }
  L.push('');

  // ═════════════════════════════════════════════════════════════════════════
  // PIPELINE PHASES — Execution order
  // ═════════════════════════════════════════════════════════════════════════

  L.push(`## Pipeline Phases (build in this order)`);
  for (const phase of pipeline.phases) {
    const pp = phase as PhaseView;
    L.push(`${pp.id}: ${pp.executionModel} — ${pp.description || pp.name || ''}`);
  }
  L.push('');

  // ═════════════════════════════════════════════════════════════════════════
  // TEST CASES — What tests exist
  // ═════════════════════════════════════════════════════════════════════════

  if (tests.length > 0) {
    L.push(`## Test Cases (${tests.length})`);
    const negTests = tests.filter((t) => t.name?.startsWith('NEG'));
    const posTests = tests.filter((t) => t.name?.startsWith('POS'));
    const blindTests = tests.filter((t) => t.name?.startsWith('BLIND'));
    L.push(`- NEG (attack vectors): ${negTests.length}`);
    L.push(`- POS (legitimate): ${posTests.length}`);
    L.push(`- BLIND (no defense): ${blindTests.length}`);
    L.push('');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // KNOWN DEFECTS — Must be fixed during build
  // ═════════════════════════════════════════════════════════════════════════

  if (discovery.failureModes.length > 0) {
    L.push(`## Known Defects (must address during build)`);
    for (const fm of discovery.failureModes.slice(0, 12)) {
      L.push(`- \`${fm.file}:${fm.line}\` — ${fm.message}`);
    }
    L.push('');
  }

  // ═════════════════════════════════════════════════════════════════════════
  // DIRECTORY STRUCTURE
  // ═════════════════════════════════════════════════════════════════════════

  L.push(`## Directory Structure (from discovery)`);
  const treeLines = discovery.directoryTree.split('\n').slice(0, 25);
  for (const tl of treeLines) {
    L.push(tl);
  }
  L.push('');

  // ═════════════════════════════════════════════════════════════════════════
  // GENERATION INSTRUCTIONS
  // ═════════════════════════════════════════════════════════════════════════

  L.push(`## YOUR TASK: Write the Build Directive`);
  L.push('');
  L.push(`Write a BUILD DIRECTIVE for the ${projectName} project. Another agent will read your directive and execute it to build/fix the project.`);
  L.push('');
  L.push(`### Format Requirements:`);
  L.push(`- Phased structure: Phase 0 (Scaffold) → Phase 1 (Types) → Phase 2 (Implementation) → Phase 3 (Pipeline) → Phase 4 (Testing) → Phase 5 (Polish)`);
  L.push(`- Each phase has numbered steps (1. 2. 3.) — each step is a concrete action`);
  L.push(`- After each phase, add ❌ anti-patterns referencing the REAL threat evidence above (include file:line)`);
  L.push(`- End with a deliverable spec and self-review checklist`);
  L.push(`- Reference REAL class names, function names, and file paths from the data above`);
  L.push(`- Maximum 800 lines — be concise, every line must be actionable`);
  L.push('');
  L.push(`### Critical Rules:`);
  L.push(`1. Every build step must reference a REAL construct from the Detected Constructs list above`);
  L.push(`2. Every ❌ anti-pattern must cite a REAL file:line from the Threat Evidence above`);
  L.push(`3. Every defense rule from the Defense Rules list must appear as a constraint in at least one phase`);
  L.push(`4. Every known defect from the Known Defects list must be addressed in a build step`);
  L.push(`5. Do NOT write generic advice like "avoid using any type" — instead write "❌ \`${threats[0]?.findings?.[0]?.file || 'types.ts'}:${threats[0]?.findings?.[0]?.line || 1}\` uses \`any\` — replace with explicit interface"`);
  L.push(`6. Do NOT explain WHY — just say WHAT to do and WHAT NOT to do`);
  L.push(`7. Reference defense rules by their EXACT rule name from the list above`);
  L.push('');
  L.push(`### Phase Structure:`);
  L.push(`- **Phase 0 — Scaffold**: Create directory structure, config files, entry points. Reference the Directory Structure above.`);
  L.push(`- **Phase 1 — Core Types**: Define every type from the Detected Constructs list. List each type by name.`);
  L.push(`- **Phase 2 — Implementation**: Implement every class and function from the Detected Constructs list. For each, specify method signatures and what they must do. Reference defense rules as constraints.`);
  L.push(`- **Phase 3 — Pipeline**: Wire the pipeline phases in order. List each phase by ID.`);
  L.push(`- **Phase 4 — Testing**: Write tests for each threat pattern. Reference the test case counts above.`);
  L.push(`- **Phase 5 — Polish**: Fix every known defect. Run build verification. Export audit.`);
  L.push('');
  L.push(`Write the complete directive now. Follow the phases in order. Do not skip steps.`);

  return L.join('\n');
}
