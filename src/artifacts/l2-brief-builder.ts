/**
 * L2 Brief Builder — Assembles the SINGLE comprehensive brief that serves as
 * the SOLE input to the LLM's monolithic spec generation.
 *
 * The brief contains ALL analysis data, ALL writing strategy, ALL reference
 * excerpts, ALL anti-slop rules, and ALL quality gates. The LLM reads this
 * document in its entirety and writes the complete 12-section L2 engineering
 * specification in a single pass.
 *
 * Additionally provides:
 *   - appendComplianceAndAppendix: Appends compliance matrix, operational
 *     appendix, and blind spots to the LLM-generated document.
 *   - formatDeepeningFeedback: Formats depth-gap feedback for revision.
 *   - formatAuditFeedback: Formats cross-section audit feedback for revision.
 *
 * Determinism contract: no Date.now(), no Math.random(), no network I/O.
 * The only I/O is fs.readFileSync inside readSourceFiles (reading project code).
 *
 * @module artifacts/l2-brief-builder
 */

import * as fs from 'fs';

import { tridentLog } from '../utils.js';
import type { AnalysisResult } from './analysis-engine.ts';
import type { DiscoveryResult } from '../shared/auto-discover.js';
import type { L2Strategy } from './l2-strategy.ts';
import type { AdversarialChallenge } from './l2-adversarial.ts';

// ============================================================================
// TYPES
// ============================================================================

/** The construct runtime view — the typed CodeConstruct fields plus the
 *  loosely-typed shape the discovery pipeline can attach (kind/methods/file/
 *  fields/properties/params/returns). The R9 runtime-contract law: no `as any`
 *  — the view is a concrete structural type over the known runtime union. */
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

/** The test runtime view — the typed TestSpec fields plus the expected
 *  fallback the builder reads. */
interface TestView {
  input: Record<string, unknown>;
  expectedResult?: string;
  expected?: string;
}

/** Section ordering labels for the human-readable SECTION ORDER block. */
const SECTION_ORDER_LABELS: string[] = [
  'Executive Summary',
  'Architecture',
  'Data Model',
  'Engine Class',
  'Defense Rules',
  'Algorithm Specs',
  'Test Specs',
  'Blind Spots',
  'Integration',
  'Evidence Format',
  'File Manifest',
  'Migration',
];

// ============================================================================
// 1. readSourceFiles
// ============================================================================

/**
 * Read source files and extract their content.
 *
 * For each file path, reads the file content and stores it in a map of
 * filePath → content. Files that cannot be read are silently skipped with
 * a WARN-level log entry.
 *
 * @param filePaths - Absolute or relative paths to source files.
 * @returns Map of filePath → file content string.
 */
export function readSourceFiles(filePaths: string[]): Map<string, string> {
  const sourceExtracts = new Map<string, string>();
  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      sourceExtracts.set(filePath, content);
    } catch (e: unknown) {
      tridentLog('WARN', 'l2-brief-builder', `Failed to read source file: ${filePath}`);
    }
  }
  return sourceExtracts;
}

// ============================================================================
// 2. buildBrief
// ============================================================================

/**
 * Build the comprehensive generation brief — the SOLE input to the LLM's
 * monolithic spec write.
 *
 * The brief contains ALL data the LLM needs: analysis (threats, defenses,
 * algorithms, tests, types, discovered patterns, discovered failures, source
 * extracts), writing strategy (complexity, narrative, reader questions,
 * design tensions, adversarial challenges, depth budgets, density modes,
 * reference excerpts), anti-slop rules, and quality gates.
 *
 * The resulting string is typically 500–1500 lines. Every piece of data
 * is derived from real analysis output — no template text, no placeholders.
 *
 * @param analysis - Deterministic analysis result (constructs, threats, defenses, etc.)
 * @param discovery - Auto-discovered project intelligence (patterns, failures).
 * @param sourceExtracts - Real source code extracts keyed by file path.
 * @param strategy - Writing strategy (complexity, narrative, questions, etc.)
 * @param projectName - Human-readable project name for the brief header.
 * @returns The complete brief string.
 */
export function buildBrief(
  analysis: AnalysisResult,
  discovery: DiscoveryResult,
  sourceExtracts: Map<string, string>,
  strategy: L2Strategy,
  projectName: string,
): string {
  let brief = '';

  // === HEADER ===
  brief += `# L2 GENERATION BRIEF — ${projectName}\n\n`;
  brief += `You are generating a Layer 2 engineering specification. `;
  brief += `Read ALL data below and write the spec SECTION BY SECTION.\n\n`;

  // === WRITING STRATEGY ===
  brief += `## WRITING STRATEGY\n\n`;
  brief += `Complexity: ${strategy.complexity.tier} (score: ${strategy.complexity.score})\n`;
  brief += `Domain: ${strategy.complexity.domainType}\n`;
  brief += `Total target: ${strategy.complexity.totalTargetLines} lines\n\n`;

  brief += `### Narrative Arc\n${strategy.narrative.arc}\n\n`;

  brief += `### Section Hooks (use these as opening lines)\n`;
  for (const [section, hook] of Object.entries(strategy.narrative.sectionHooks)) {
    brief += `- **${section}**: ${hook}\n`;
  }
  brief += '\n';

  // === SECTION DEPTH BUDGETS ===
  brief += `## SECTION DEPTH BUDGETS\n\n`;
  brief += `| Section | Mode | Min Lines | Max Lines |\n`;
  brief += `|---------|------|-----------|----------|\n`;
  for (const [section, mode] of Object.entries(strategy.densityModes)) {
    const budget = (strategy.depthBudgets as Record<string, { min: number; max: number }>)[section];
    const modeName = typeof mode === 'string' ? mode : mode.mode || '?';
    brief += `| ${section} | ${modeName} | ${budget?.min || '?'} | ${budget?.max || '?'} |\n`;
  }
  brief += '\n';

  // === SECTION ORDER ===
  brief += `## SECTION ORDER (write in this order — later sections depend on earlier ones)\n\n`;
  brief += SECTION_ORDER_LABELS.map((label, i) => `${i + 1}. ${label}`).join('\n');
  brief += '\n\n';

  // === ANALYSIS DATA ===
  brief += `## ANALYSIS DATA — REAL PROJECT CONSTRUCTS\n\n`;
  brief += `**CRITICAL: This spec is about the ACTUAL project listed below. `;
  brief += `Every section MUST reference these real constructs by name. `;
  brief += `Do NOT generate generic engineering content. `;
  brief += `Write about THESE specific classes, functions, and interfaces.**\n\n`;

  // --- Constructs (THE MOST IMPORTANT SECTION — gives LLM the actual vocabulary) ---
  const constructs = analysis.constructs || [];
  if (constructs.length > 0) {
    brief += `### PROJECT CONSTRUCTS (${constructs.length} total — USE THESE EXACT NAMES)\n\n`;
    // Group by kind
    const classes = constructs.filter((c: ConstructView) => c.kind === 'class' || c.type === 'class');
    const interfaces = constructs.filter((c: ConstructView) => c.kind === 'interface' || c.type === 'interface');
    const functions = constructs.filter((c: ConstructView) => c.kind === 'function' || c.type === 'function');

    if (classes.length > 0) {
      brief += `**Classes (${classes.length}):**\n`;
      for (const c of classes.slice(0, 20)) {
        const cc = c as ConstructView;
        const methods = (cc.methods || []).slice(0, 8).map((m: string | { name?: string }) =>
          typeof m === 'string' ? m : (m.name || String(m))
        );
        brief += `- \`${cc.name}\` (${cc.file || cc.filePath || '?'}:${cc.line || '?'}): ${methods.join(', ') || 'no methods'}\n`;
      }
      brief += '\n';
    }
    if (interfaces.length > 0) {
      brief += `**Interfaces (${interfaces.length}):**\n`;
      for (const c of interfaces.slice(0, 15)) {
        const cc = c as ConstructView;
        const fields = (cc.fields || cc.properties || []).slice(0, 8).map((f: string | { name?: string }) =>
          typeof f === 'string' ? f : (f.name || String(f))
        );
        brief += `- \`${cc.name}\` (${cc.file || cc.filePath || '?'}): ${fields.join(', ') || 'no fields listed'}\n`;
      }
      brief += '\n';
    }
    if (functions.length > 0) {
      brief += `**Functions (${functions.length}):**\n`;
      for (const c of functions.slice(0, 15)) {
        const cc = c as ConstructView;
        const params = (cc.parameters || cc.params || []).slice(0, 5).map((p: string | { name?: string }) =>
          typeof p === 'string' ? p : (p.name || String(p))
        );
        brief += `- \`${cc.name}(${params.join(', ')})\` → ${cc.returnType || cc.returns || '?'} (${cc.file || cc.filePath || '?'}:${cc.line || '?'})\n`;
      }
      brief += '\n';
    }
  }

  // --- Threats ---
  brief += `### Threats (write a PRIORITY section for each, CRITICAL first)\n\n`;
  const threats = analysis.threats || [];
  for (const threat of threats) {
    const t = threat;
    brief += `#### ${t.pattern} (${t.severity}, score: ${t.score}, ${t.findings?.length || 0} instances)\n`;
    if (t.defeatVectors?.length) {
      brief += `Defeat vectors: ${t.defeatVectors.join('; ')}\n`;
    }
    brief += `Findings (file:line — description):\n`;
    for (const f of (t.findings || []).slice(0, 10)) {
      brief += `- \`${f.file}:${f.line}\` — ${f.description}\n`;
    }
    brief += '\n';
  }

  // --- Defenses ---
  brief += `### Defense Rules\n\n`;
  const defenses = analysis.defenses || [];
  for (const defense of defenses) {
    const d = defense;
    brief += `- **${d.rule}** — ${d.checkMethod}, weight ${d.weight}, severity ${d.violationSeverity}, order ${d.analysisOrder}\n`;
    brief += `  Pass: ${d.thresholds?.passThreshold?.operator} ${d.thresholds?.passThreshold?.value}`;
    brief += `, Warn: ${d.thresholds?.warnThreshold?.operator} ${d.thresholds?.warnThreshold?.value}`;
    brief += `, Fail: ${d.thresholds?.failThreshold?.operator} ${d.thresholds?.failThreshold?.value}\n`;
    brief += `  Domain: ${d.domain}\n`;
  }
  brief += '\n';

  // --- Algorithms ---
  const algorithms = analysis.algorithms || [];
  if (algorithms.length > 0) {
    brief += `### Algorithm Pseudocode (reference when writing Algorithm Specs)\n\n`;
    for (let i = 0; i < algorithms.length; i++) {
      brief += `#### Algorithm ${i + 1}:\n\`\`\`\n${algorithms[i]}\n\`\`\`\n\n`;
    }
  }

  // --- Tests ---
  const tests = analysis.tests || [];
  if (tests.length > 0) {
    brief += `### Test Specifications (reference when writing Test Specs)\n\n`;
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i] as TestView;
      brief += `#### Test ${i + 1}:\n`;
      brief += `Input: \`${JSON.stringify(t.input).substring(0, 200)}\`\n`;
      brief += `Expected: ${t.expectedResult || t.expected || 'See defense rule'}\n\n`;
    }
  }

  // --- Types ---
  const types = analysis.types || [];
  if (types.length > 0) {
    brief += `### Generated Types (reference when writing Data Model)\n\n`;
    brief += '```typescript\n';
    for (const type of types.slice(0, 15)) {
      brief += type + '\n\n';
    }
    brief += '```\n\n';
  }

  // --- Discovery: Patterns ---
  const patterns = discovery.patterns || [];
  if (patterns.length > 0) {
    brief += `### Discovered Patterns (file:line — type — name)\n\n`;
    for (const p of patterns.slice(0, 20)) {
      brief += `- \`${p.file}:${p.line}\` — ${p.type} — ${p.name}\n`;
    }
    brief += '\n';
  }

  // --- Discovery: Failure Modes ---
  const failureModes = discovery.failureModes || [];
  if (failureModes.length > 0) {
    brief += `### Discovered Failure Modes\n\n`;
    for (const fm of failureModes.slice(0, 15)) {
      brief += `- \`${fm.file}:${fm.line}\` — ${fm.message}\n`;
    }
    brief += '\n';
  }

  // --- Source Extracts ---
  if (sourceExtracts.size > 0) {
    brief += `### Source Code Extracts (REAL code from the project — reference these exact implementations)\n\n`;
    for (const [file, code] of sourceExtracts) {
      brief += `#### ${file}\n\`\`\`typescript\n${code.substring(0, 3000)}${code.length > 3000 ? '\n... (truncated)' : ''}\n\`\`\`\n\n`;
    }

    // Extract actual TypeScript types/interfaces from source files
    const extractedTypes: string[] = [];
    for (const [file, code] of sourceExtracts) {
      const typeMatches = code.matchAll(/(?:export\s+)?(?:interface|type)\s+(\w+)[\s\S]*?(?=\n(?:export\s+)?(?:interface|type|function|class|const|\/\/\/)|\n\n)/g);
      for (const match of typeMatches) {
        const fullMatch = match[0].trim();
        if (fullMatch.length > 10 && fullMatch.length < 500) {
          extractedTypes.push(`// From ${file}\n${fullMatch}`);
        }
      }
      // Also extract function signatures
      const funcMatches = code.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)(?:\s*:\s*[^{]+)?/g);
      for (const match of funcMatches) {
        extractedTypes.push(`// Function in ${file}\n${match[0]}`);
      }
    }
    if (extractedTypes.length > 0) {
      brief += `### EXISTING TYPES AND SIGNATURES — USE THESE EXACT NAMES (DO NOT INVENT ALTERNATIVES)\n\n`;
      brief += `The following types, interfaces, and function signatures already exist in the codebase.\n`;
      brief += `Your spec MUST use these EXACT names. If you need zone.ceiling, write zone.ceiling — NOT zone.top.\n\n`;
      brief += '```typescript\n';
      for (const t of extractedTypes.slice(0, 30)) {
        brief += t + '\n\n';
      }
      brief += '```\n\n';
    }
  }

  // === READER QUESTIONS ===
  brief += `## READER QUESTIONS (your spec MUST answer these)\n\n`;
  for (const q of strategy.questions) {
    brief += `- **[${q.section}]** ${q.question}\n`;
    brief += `  Answer source: ${q.answerSource}\n`;
  }
  brief += '\n';

  // === DESIGN TENSIONS ===
  brief += `## DESIGN TENSIONS (your spec MUST resolve these)\n\n`;
  for (const t of strategy.tensions) {
    brief += `### ${t.rule}\n`;
    brief += `**Cost:** ${t.cost}\n`;
    brief += `**Resolution:** ${t.resolution}\n\n`;
  }

  // === ADVERSARIAL CHALLENGES ===
  brief += `## ADVERSARIAL CHALLENGES (your spec MUST defend against these)\n\n`;
  for (let i = 0; i < strategy.challenges.length; i++) {
    const c = strategy.challenges[i];
    brief += `### Challenge ${i + 1}: ${c.type}\n`;
    brief += `${c.challenge}\n\n`;
    brief += `**Required defense:** ${c.requiredDefense}\n\n`;
  }

  // === REFERENCE QUALITY BAR ===
  brief += `## REFERENCE QUALITY BAR\n\n`;
  brief += `For each section type, here is what GOLD quality looks like. Match this depth.\n\n`;
  for (const [section, ref] of Object.entries(strategy.references)) {
    brief += `### ${section} reference:\n${ref}\n\n`;
  }

  // === ANTI-SLOP RULES ===
  brief += `## ANTI-SLOP RULES (VIOLATION = IMMEDIATE REJECT)\n\n`;
  brief += `The following are FORBIDDEN in your output:\n`;
  brief += `- Template phrases: "implement actual logic", "based on the analysis", `;
  brief += `"add proper error handling", "ensure all code paths", "see description above", `;
  brief += `"placeholder", "todo"\n`;
  brief += `- Repeated text blocks (same 50-char prefix appearing 3+ times)\n`;
  brief += `- Generic type annotations (\`: any\` in Data Model section)\n`;
  brief += `- Vague test assertions (\`toBeTruthy()\`, \`toBeDefined()\`)\n`;
  brief += `- Missing complexity statements (no \`O(\` in algorithm sections)\n`;
  brief += `- Missing worked examples (no "Example" or "Input.*→" in algorithm sections)\n`;
  brief += `- Missing phases (no "Phase 1", "Phase 2" in migration section)\n`;
  brief += `- Missing rollback (no "rollback" or "revert" in migration section)\n`;
  brief += `- Code blocks in PROSE sections (Executive Summary, Blind Spots)\n`;
  brief += `- TODO/FIXME markers anywhere\n`;
  brief += `- DUPLICATE SECTIONS — each section number (## N.) must appear EXACTLY ONCE\n`;
  brief += `- DUPLICATE NUMBERING — numbered lists must not repeat numbers (1, 2, 3, 3 = REJECT)\n`;
  brief += `- INCONSISTENT TYPE DEFINITIONS — if interface Foo is defined twice, fields MUST match\n\n`;
  brief += `MANDATORY CONTENT REQUIREMENTS:\n`;
  brief += `- Zero "any" type annotations in Data Model\n`;
  brief += `- Every threshold needs a rationale paragraph explaining WHY this value (not just "passThreshold = 0" but "passThreshold = 0 BECAUSE...")\n`;
  brief += `- Every algorithm needs a worked example with actual computed numbers\n`;
  brief += `- Every algorithm needs complexity notation (O(?))\n`;
  brief += `- Every algorithm needs DERIVATION FROM FIRST PRINCIPLES: explain WHY this formula was chosen, derive it step by step, compare against alternatives (e.g., "TVD over KL-divergence BECAUSE TVD is symmetric, bounded [0,1], and handles zero-probability")\n`;
  brief += `- Every defense rule MUST have ALL 5 elements: Purpose (prose), Implementation (FULL TypeScript CLASS ≥ 100 lines — NOT a function), Threshold reference (with rationale), Worked Example (with numbers), Complexity statement (O(?))\n`;
  brief += `- Every file:line reference must match actual codebase\n`;
  brief += `- Every defense rule MUST be a CLASS, not a function. Use the pattern: \`export class [RuleName]Rule implements DefenseRule { ... }\`. Each class needs: constructor with dependency injection, private readonly fields, public async methods, error handling (try/catch with meaningful recovery). Minimum 100 lines per class implementation\n`;
  brief += `- The Operational Appendix MUST include: maintenance guide, threshold tuning guide, debugging guide (common failure modes + diagnostic steps), extension guide (how to add a new defense rule step by step), performance troubleshooting\n`;
  brief += `- Minimum line count per section: see budget table above\n\n`;

  // === QUALITY GATES ===
  brief += `## QUALITY GATES\n\n`;
  brief += `Each section must pass these density mode validation rules:\n\n`;
  for (const [section, modeInfo] of Object.entries(strategy.densityModes)) {
    const info = modeInfo as { mode?: string; purpose?: string; validationRules?: string[] };
    const modeName = typeof info === 'string' ? info : info?.mode || '?';
    const purpose = typeof info === 'string' ? 'See budget table' : info?.purpose || 'See budget table';
    const rules: string[] = typeof info === 'string' ? [] : (info?.validationRules || []);
    brief += `### ${section} (${modeName})\n`;
    brief += `Purpose: ${purpose}\n`;
    if (rules.length > 0) {
      brief += `Validation rules:\n`;
      for (const rule of rules) {
        brief += `- ${rule}\n`;
      }
    }
    brief += '\n';
  }

  // === INSTRUCTIONS ===
  brief += `## INSTRUCTIONS\n\n`;
  brief += `Write the COMPLETE L2 engineering spec NOW. ALL 15 sections in ONE document.\n`;
  brief += `Start with "# BUILD SPEC: ${projectName}".\n`;
  brief += `Target: ${strategy.complexity.totalTargetLines}+ lines. WRITE MORE, NOT LESS.\n`;
  brief += `Do NOT stop until ALL sections are complete. Do NOT abbreviate. Do NOT summarize.\n`;
  brief += `Do NOT be concise. BE THOROUGH. Every section must be FULLY developed.\n\n`;
  brief += `MANDATORY: Your output MUST contain ALL 15 section headings:\n`;
  brief += `## 1. Executive Summary\n## 2. Architecture\n## 3. Data Model\n`;
  brief += `## 4. Engine Class\n## 5. Defense Rules\n## 6. Algorithm Specs\n`;
  brief += `## 7. Test Specs\n## 8. Blind Spots\n## 9. Integration\n`;
  brief += `## 10. Evidence Format\n## 11. File Manifest\n## 12. Migration\n`;
  brief += `## 13. Compliance Matrix\n## 14. Operational Appendix\n## 15. What This Spec Does NOT Cover\n\n`;
  brief += `OUTPUT REQUIREMENTS — NO LIMITS, NO CONSTRAINTS, MAXIMUM QUALITY:\n`;
  brief += `- Executive Summary: 4-6 paragraphs of dense engineering reasoning. No code.\n`;
  brief += `- Architecture: Multiple ASCII diagrams (component view, data flow view, phase dependency view). 5+ design decisions with full rationale.\n`;
  brief += `- Data Model: EVERY interface with JSDoc on EVERY field. Include constants, type unions, utility types. Zero "any".\n`;
  brief += `- Engine Class: FULL implementation — the entire DetectionEngine class with every method body written out. Constructor, run(), extractConstructs(), buildCallGraph(), every phase runner. 300+ lines of TypeScript.\n`;
  brief += `- Defense Rules: Each rule gets ALL 5 elements fully written out: Purpose (paragraph), Model (mathematical description), Implementation (FULL TypeScript CLASS — minimum 100 lines, NOT a function — with constructor, dependency injection, private readonly fields, public async methods, and try/catch error handling), Pseudocode Summary (numbered steps), Worked Example (Input → Process → Output with actual numbers). Threshold reference with full derivation.\n`;
  brief += `- Algorithm Specs: For EACH algorithm: Formula stated, DERIVATION from first principles (WHY this formula, derive step by step, compare against at least one alternative and explain why rejected), Complexity proof (O(?) with justification), Worked Example (3+ examples with real numbers computed step by step).\n`;
  brief += `- Test Specs: Full test SUITES — describe/it blocks with 3+ tests per rule (positive, negative, edge case). Each test has arrange/act/assert. 5+ expect() calls per test with SPECIFIC values. Include test helper functions.\n`;
  brief += `- Blind Spots: Each blind spot gets 3-4 sentences: what we cannot detect, WHY (technical reason), conservative fallback mechanism, false positive risk assessment.\n`;
  brief += `- Integration: Multiple ASCII diagrams (data flow, integration points, hook registration). Full import code snippets with actual file paths. Phase input population table.\n`;
  brief += `- Evidence Format: Full JSON schema with field types, constraints, descriptions. 2+ sample outputs with realistic values. Merkle chain explanation.\n`;
  brief += `- File Manifest: Complete table with every file, type (NEW/MODIFY), line estimate, purpose, dependencies.\n`;
  brief += `- Migration: 3+ phases, each with: what changes (detailed), what could break (specific failure modes), rollback steps (numbered, with time estimates), validation gates (measurable criteria). Include rollback code.\n`;
  brief += `- Compliance Matrix: Full table mapping each defense rule to Bible source, spec section, implementation file, test file, evidence file.\n`;
  brief += `- Operational Appendix: Maintenance guide, threshold tuning guide (table: constant → increase effect → decrease effect), debugging guide (common failure modes + diagnostic steps), extension guide (step-by-step: how to add a new defense rule), performance troubleshooting.\n`;
  brief += `- What This Spec Does NOT Cover: Honest enumeration of out-of-scope items with rationale for exclusion.\n\n`;
  brief += `CODE IS KING. 60%+ of your output must be fenced TypeScript code blocks.\n`;
  brief += `Every defense rule implementation must be REAL working TypeScript — not pseudocode, not skeleton, not TODO.\n`;
  brief += `Every test must be REAL working TypeScript with REAL assertions — not descriptions of what tests would do.\n`;
  brief += `Every algorithm must show REAL mathematical computation with REAL numbers.\n\n`;
  brief += `CRITICAL STRUCTURAL RULES:\n`;
  brief += `- Each section number (## 1, ## 2, etc.) must appear EXACTLY ONCE.\n`;
  brief += `- If you define an interface/type, do NOT redefine it with different fields elsewhere.\n`;
  brief += `- Numbered lists must be sequential — no duplicates, no gaps.\n`;
  brief += `- Every threshold needs "BECAUSE" rationale explaining WHY this specific value.\n\n`;

  return brief;
}

// ============================================================================
// 3. appendComplianceAndAppendix
// ============================================================================

/**
 * Append the compliance matrix, operational appendix, and blind spots section
 * to the LLM-generated document.
 *
 * This runs AFTER the LLM has written the full spec. The tool does NOT
 * assemble sections — the document is already complete. It only APPENDS
 * auto-generated tables and sections derived from deterministic analysis.
 *
 * Appended sections:
 *   1. Compliance Matrix — principle → spec section → implementation → test → evidence
 *   2. Operational Appendix — threshold tuning guide + extension guide
 *   3. What This Spec Does NOT Cover — blind spots from strategy challenges and tensions
 *
 * @param doc - The FULL document written by the LLM.
 * @param analysis - Deterministic analysis result.
 * @param strategy - Writing strategy (for blind spots derivation).
 * @returns The final document with all appended sections.
 */
export function appendComplianceAndAppendix(
  doc: string,
  analysis: AnalysisResult,
  strategy: L2Strategy,
): string {
  let finalDoc = doc;

  // Determine next section number from existing ## N. headers
  let sectionNum = (doc.match(/^## \d+\./gm) || []).length + 1;

  // --- 1. Compliance Matrix ---
  finalDoc += `\n---\n\n## ${sectionNum}. Compliance Matrix\n\n`;
  finalDoc += `| Principle | Spec Section | Implementation | Test | Evidence |\n`;
  finalDoc += `|-----------|-------------|----------------|------|----------|\n`;
  const defenses = analysis.defenses || [];
  for (const defense of defenses) {
    const d = defense;
    finalDoc += `| ${d.bibleSource || 'N/A'} | Defense Rules | ${d.rule} | ${d.rule} test | evidence/${d.domain}.json |\n`;
  }
  sectionNum++;

  // --- 2. Operational Appendix ---
  finalDoc += `\n---\n\n## ${sectionNum}. Operational Appendix\n\n`;

  // 2a. Maintenance Guide
  finalDoc += `### Maintenance Guide\n\n`;
  finalDoc += `This specification is a living document. When the codebase changes, `;
  finalDoc += `re-run the deterministic analysis pipeline to regenerate threats, `;
  finalDoc += `defenses, and test specifications. Update the compliance matrix `;
  finalDoc += `and threshold tuning guide after each analysis cycle.\n\n`;

  // 2b. Threshold Tuning Guide
  finalDoc += `### Threshold Tuning Guide\n\n`;
  finalDoc += `| Constant | Increase Effect | Decrease Effect |\n`;
  finalDoc += `|----------|----------------|----------------|\n`;
  for (const defense of defenses) {
    const d = defense;
    const val = d.thresholds?.failThreshold?.value;
    if (val !== undefined) {
      finalDoc += `| ${d.rule} (${val}) | More lenient — fewer findings | Stricter — more findings |\n`;
    }
  }

  // 2c. Extension Guide
  finalDoc += `\n### Extension Guide\n\n`;
  finalDoc += `To add new defense rules: register in the defense catalog, add to pipeline phases, `;
  finalDoc += `implement the check function, add test input/output, update threshold tuning guide.\n`;
  sectionNum++;

  // --- 3. What This Spec Does NOT Cover (Blind Spots) ---
  finalDoc += `\n---\n\n## ${sectionNum}. What This Spec Does NOT Cover\n\n`;

  // Blind spots from adversarial challenges of type BLIND_SPOT
  const blindSpotChallenges = strategy.challenges.filter(
    (c: AdversarialChallenge) => c.type === 'BLIND_SPOT',
  );
  for (const challenge of blindSpotChallenges) {
    finalDoc += `- ${challenge.data?.limitation || challenge.challenge}\n`;
  }

  // Tensions as known limitations
  for (const tension of strategy.tensions) {
    finalDoc += `- ${tension.cost.substring(0, 150)}...\n`;
  }
  finalDoc += '\n';

  return finalDoc;
}

// ============================================================================
// 4. formatDeepeningFeedback
// ============================================================================

/**
 * Format deepening gaps as feedback for the LLM during the revision loop.
 *
 * Each gap includes its type (WORKED_EXAMPLE, THRESHOLD_RATIONALE, EDGE_CASE,
 * COMPLEXITY, CROSS_REFERENCE), a human-readable description of what is
 * missing, and a specific fix instruction.
 *
 * @param result - The deepening result containing pass/fail status and gap list.
 * @returns Formatted feedback string for the LLM.
 */
export function formatDeepeningFeedback(
  result: { passed: boolean; gaps: any[] },
): string {
  const gaps = result.gaps || [];

  let feedback = `DEEPENING PASS — ${gaps.length} depth gap(s) found.\n\n`;
  feedback += `Address each gap and call the tool again with the updated sections.\n\n`;

  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i];
    feedback += `${i + 1}. [${gap.type}] ${gap.description}\n`;
    feedback += `   FIX: ${gap.fix}\n`;
    if (gap.requiredCount !== undefined && gap.actualCount !== undefined) {
      feedback += `   Required: ${gap.requiredCount}, Found: ${gap.actualCount}\n`;
    }
    if (gap.section) {
      feedback += `   Section: ${gap.section}\n`;
    }
    if (gap.ruleName) {
      feedback += `   Rule: ${gap.ruleName}\n`;
    }
    feedback += '\n';
  }

  return feedback;
}

// ============================================================================
// 5. formatAuditFeedback
// ============================================================================

/**
 * Format cross-section audit issues as feedback for the LLM during the
 * revision loop.
 *
 * Collects issues from all audit checks (threshold consistency, completeness
 * chain, adversarial coverage, type name consistency, file path verification,
 * function signature consistency), sorts them by severity (CRITICAL first),
 * and formats each with a specific fix instruction.
 *
 * @param result - The cross-section audit result with pass/fail status and
 *                 per-check detail objects.
 * @returns Formatted feedback string for the LLM.
 */
/** One check's mismatch entry — the object-shaped rows the feedback reader
 *  consumes (description + fix). The declared CrossSectionAuditResult types
 *  the mismatches as string[], so the reader casts the loose rows through a
 *  concrete structural view (R9 runtime-contract law — no `any`). */
interface AuditFeedbackCheckEntry { description?: string; fix?: string }
interface AuditFeedbackBrokenChain { breakPoint?: string; threat?: string; fix?: string }
interface AuditFeedbackCheck {
  passed?: boolean;
  mismatches?: AuditFeedbackCheckEntry[];
  brokenChains?: AuditFeedbackBrokenChain[];
}
interface AuditFeedbackInput {
  checks?: Record<string, AuditFeedbackCheck>;
}

export function formatAuditFeedback(result: unknown): string {
  let feedback = `CROSS-SECTION AUDIT: issues found.\n\n`;

  const inputChecks = (result && typeof result === 'object' && (result as AuditFeedbackInput).checks) as Record<string, AuditFeedbackCheck> | null | undefined;
  const checks: Record<string, AuditFeedbackCheck> = inputChecks ?? ({} as Record<string, AuditFeedbackCheck>);
  const allIssues: Array<{ severity: string; description: string; fix?: string }> = [];

  // --- Collect threshold consistency issues ---
  if (checks.thresholdConsistency && !checks.thresholdConsistency.passed) {
    for (const m of (checks.thresholdConsistency.mismatches || [])) {
      allIssues.push({
        severity: 'CRITICAL',
        description: `THRESHOLD MISMATCH: ${m.description}`,
        fix: m.fix,
      });
    }
  }

  // --- Collect completeness chain issues ---
  if (checks.completenessChain && !checks.completenessChain.passed) {
    for (const chain of (checks.completenessChain.brokenChains || [])) {
      allIssues.push({
        severity: chain.breakPoint === 'NO_DEFENSE' ? 'CRITICAL' : 'HIGH',
        description: `COMPLETENESS: Threat "${chain.threat}" → ${chain.breakPoint}`,
        fix: chain.fix,
      });
    }
  }

  // --- Collect adversarial coverage issues ---
  if (checks.adversarialCoverage && !checks.adversarialCoverage.passed) {
    for (const m of (checks.adversarialCoverage.mismatches || [])) {
      allIssues.push({
        severity: 'HIGH',
        description: `CHALLENGE NOT ADDRESSED: ${m.description}`,
        fix: m.fix,
      });
    }
  }

  // --- Collect type name consistency issues ---
  if (checks.typeNameConsistency && !checks.typeNameConsistency.passed) {
    for (const m of (checks.typeNameConsistency.mismatches || [])) {
      allIssues.push({
        severity: 'MEDIUM',
        description: `TYPE MISMATCH: ${m.description}`,
        fix: m.fix,
      });
    }
  }

  // --- Collect file path verification issues ---
  if (checks.filePathVerification && !checks.filePathVerification.passed) {
    for (const m of (checks.filePathVerification.mismatches || [])) {
      allIssues.push({
        severity: 'MEDIUM',
        description: `FILE PATH: ${m.description}`,
        fix: m.fix,
      });
    }
  }

  // --- Collect function signature consistency issues ---
  if (checks.functionSignatureConsistency && !checks.functionSignatureConsistency.passed) {
    for (const m of (checks.functionSignatureConsistency.mismatches || [])) {
      allIssues.push({
        severity: 'MEDIUM',
        description: `SIGNATURE MISMATCH: ${m.description}`,
        fix: m.fix,
      });
    }
  }

  // --- Sort by severity (CRITICAL first) ---
  const severityRank: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };
  allIssues.sort(
    (a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9),
  );

  // --- Format each issue ---
  for (let i = 0; i < allIssues.length; i++) {
    const issue = allIssues[i];
    feedback += `${i + 1}. [${issue.severity}] ${issue.description}\n`;
    feedback += `   FIX: ${issue.fix}\n\n`;
  }

  feedback += `Rewrite the affected sections and call the tool again.\n`;

  return feedback;
}
