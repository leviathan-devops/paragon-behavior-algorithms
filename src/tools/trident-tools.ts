// @ts-ignore
import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as crypto from 'crypto';
import { tridentLog } from '../utils.js';
import { orchestrator } from '../orchestrator.js';
import { AuditEngine } from '../audit-engine/index.js';
import type { AuditFinding } from '../audit-engine/types.js';
import { generateCodeReviewArtifact } from '../artifacts/code-review-artifact.ts';
import {generateLayer2DetailedWorkflow, generateContextLibraryManifest, generateContextBrief, generateContainerTestPlanSection, generateExactTestPlanSection} from '../artifacts/deep-planning-artifact.ts';

import {buildBibleBrief, generateBibleViaLLM, auditBibleGrounding} from '../artifacts/context-synthesis-artifact.ts';
import { createOmniVisionTool } from './omni-vision.js';
import { createContainerTestTool } from './container-test.js';
import { createShipPackageTool } from './trident-ship-package.js';
import { createPreflightTool } from './trident-preflight.ts';

import * as fsSync from 'fs';
import { TRIDENT_CONFIG } from '../config.js';
// trident-vision REMOVED — replaced by zai-vision_* and visual-cortex_* MCP tools
import { tridentPoseidonTool, setPoseidonClientRef } from './trident-poseidon.js';
import { godLoopOrchestrator } from '../poseidon/god-loop.js';
// THE BUG-HUNTER MACHINE (the W7 registration — the merge port from the v4.4.3
// payload): the bug-hunt entry + the 7-verb query surface (spec §5.2:2367-2374).
// The package index exports the tool creators; this map appends them additively.
import { createBugHuntTool, createBugHunterQueryTool } from '../subagents/trident-bug-hunter/index.ts';
import { createAuditTool, createFixApplyTool, createBuildDoneTool } from '../subagents/trident-auditor/index.ts';
import { createReportWriterTool } from '../subagents/trident-bug-hunter/index.ts';
import { discoverProject, type DiscoveryResult, type DiscoveredPattern, type DiscoveredFailure, type DiscoveredDecision } from '../shared/auto-discover.js';
import { validateDeepPlanningInput, validateContextSynthesisInput, validateProblemSolvingInput, validateEmbeddedTestPlan } from './input-validation.js';
import { interpret } from 'xstate';
import { deepPlanningMachine } from '../fsm/deep-planning-machine.js';
import { contextSynthesisMachine } from '../fsm/context-synthesis-machine.js';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { P1P10Verification } from '../warheads/p1-p10-scanner/index.js';
import {getDefaultStrategy} from '../artifacts/l2-strategy.ts';
import { readSourceFiles } from '../artifacts/l2-brief-builder.ts';
import { aetherLedgerRootFor, runStatusPath, readRunStatus, NO_ACTIVE_RUN, preliminaryArtifactPath, artifactPathFor, readNotifications, configureToastDelivery } from '../audit-engine/run-status.js';

// ── THE OWNER SESSION RESOLVER (the wave-cron v3 pattern, wave-cron.ts:102-111):
// the newest ROOT session (parent_id IS NULL) in opencode.db = the dispatching
// orchestrator. The tool execute() signature carries no sessionID — this probe is
// the mechanically-proven fallback (the v3 checkpoint's resolveMainSessionId).
function resolveOwnerSessionId(): string | null {
  try {
    const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Database } = require('bun:sqlite') as { Database: new (p: string, opts?: { readonly?: boolean }) => { query: (sql: string) => { get: () => { id?: string } | null } } };
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.query('SELECT id FROM session WHERE parent_id IS NULL ORDER BY rowid DESC LIMIT 1').get();
      return row && typeof row.id === 'string' && row.id !== 'default' ? row.id : null;
    } finally {
      try { (db as unknown as { close: () => void }).close(); } catch { /* readonly probe — best effort */ }
    }
  } catch {
    return null;
  }
}
import { REFERENCE_EXCERPTS } from '../artifacts/l2-reference-library.ts';
import { generateSpecViaLLM, setClientGetter, drainPendingSessions } from '../artifacts/llm-generator.ts';
import { runInternalLLMLoop } from '../artifacts/shared-llm-loop.ts';
// l3-engine-discoverer no longer needed — L3 is directed, not autonomous
import { setPendingL1Path } from '../hooks/agent-state.js';

// M7: No shared singleton — create fresh AuditEngine per invocation
// M3: Wire completeLayer/failLayer for state machine hardening

// ═══ RUNTIME INPUT VALIDATION ═══
// Per-tool validators live in ./input-validation.ts (validateDeepPlanningInput,
// validateContextSynthesisInput, validateProblemSolvingInput, validateTestPlan).
// They replace zod .min() which crashes the opencode SDK's resolveTools.

// ═══ L2 DESIGN MODE HELPERS ═══

/**
 * Extract the most important terms from a requirements string.
 * Used by the topic alignment quality gate to verify the LLM output
 * matches what was asked for.
 *
 * Strategy: Find domain-specific capitalized words, CamelCase identifiers,
 * and key nouns that appear in the requirements. Filter out common words.
 */
function extractKeyTerms(requirements: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
    'have', 'has', 'will', 'can', 'not', 'but', 'all', 'any', 'new', 'use',
    'must', 'should', 'system', 'tool', 'agent', 'engine', 'layer', 'phase',
    'step', 'section', 'build', 'spec', 'output', 'input', 'file', 'code',
  ]);

  const terms = new Set<string>();

  // Strategy 1: CamelCase identifiers (WarheadNode, ContextMatcher, etc.)
  const camelCase = requirements.match(/\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/g) || [];
  for (const term of camelCase) {
    if (term.length > 3) terms.add(term);
  }

  // Strategy 2: ALL_CAPS constants
  const allCaps = requirements.match(/\b[A-Z]{2,}[A-Z_]*\b/g) || [];
  for (const term of allCaps) {
    if (term.length > 2 && term !== 'API' && term !== 'TUI' && term !== 'LLM') terms.add(term);
  }

  // Strategy 3: Key nouns — words that appear multiple times in requirements
  const words = requirements.toLowerCase().split(/[^a-z]+/);
  const wordCounts: Record<string, number> = {};
  for (const word of words) {
    if (word.length < 4 || STOP_WORDS.has(word)) continue;
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  }
  // Words appearing 2+ times are likely key terms
  for (const [word, count] of Object.entries(wordCounts)) {
    if (count >= 2) terms.add(word);
  }

  // Strategy 4: Words from quoted strings
  const quoted = requirements.match(/"([^"]{3,30})"/g) || [];
  for (const q of quoted) {
    const inner = q.replace(/"/g, '').toLowerCase();
    if (inner.length > 3 && !STOP_WORDS.has(inner)) terms.add(inner);
  }

  // Return top 8 terms (sorted by length descending — longer terms are more specific)
  const result = [...terms].sort((a, b) => b.length - a.length).slice(0, 8);
  return result.length > 0 ? result : [];
}

/**
 * Build a brief for design mode — requirements are PRIMARY directive.
 * Unlike audit mode (which leads with codebase analysis), design mode
 * leads with what the user wants to build, using contextFiles as reference.
 */
function buildDesignBrief(
  args: Record<string, any>,
  sourceExtracts: Map<string, string>,
  strategy: any,
  projectName: string,
): string {
  const L: string[] = [];

  L.push(`# BUILD SPEC: ${projectName}`);
  L.push('');
  L.push('## PRIMARY DIRECTIVE — What This Spec Must Cover');
  L.push('');
  L.push(args.requirements || 'No requirements provided.');
  L.push('');

  // Architecture
  if (args.architecture) {
    L.push('## Architecture (provided by user)');
    L.push('');
    L.push(args.architecture);
    L.push('');
  }

  // Data model
  if (args.dataModel) {
    L.push('## Data Model (provided by user)');
    L.push('');
    L.push(args.dataModel);
    L.push('');
  }

  // Engine design
  if (args.engineDesign) {
    L.push('## Engine Design (provided by user)');
    L.push('');
    L.push(args.engineDesign);
    L.push('');
  }

  // Defense rules
  if (args.defenseRules && args.defenseRules.length > 0) {
    L.push('## Defense Rules (provided by user)');
    L.push('');
    for (const rule of args.defenseRules) {
      L.push(`- ${rule}`);
    }
    L.push('');
  }

  // Integration plan
  if (args.integrationPlan) {
    L.push('## Integration Plan (provided by user)');
    L.push('');
    L.push(args.integrationPlan);
    L.push('');
  }

  // Test specs
  if (args.testSpecs) {
    L.push('## Test Specifications (provided by user)');
    L.push('');
    L.push(args.testSpecs);
    L.push('');
  }

  // Migration strategy
  if (args.migrationStrategy) {
    L.push('## Migration Strategy (provided by user)');
    L.push('');
    L.push(args.migrationStrategy);
    L.push('');
  }

  // Blind spots
  if (args.blindSpots) {
    L.push('## Blind Spots (provided by user)');
    L.push('');
    L.push(args.blindSpots);
    L.push('');
  }

  // Reference source files (CONTEXT, not analysis target)
  if (sourceExtracts.size > 0) {
    L.push('## REFERENCE MATERIAL (context — do NOT analyze these as codebases to audit)');
    L.push('');
    L.push('The following source files are REFERENCE for your design. Use them to understand');
    L.push('existing patterns, interfaces, and architecture. Do NOT write a spec ABOUT these files.');
    L.push('Write a spec FOR the system described in the PRIMARY DIRECTIVE above.');
    L.push('');
    for (const [filePath, content] of sourceExtracts) {
      L.push(`### Reference: ${path.basename(filePath)}`);
      L.push('```');
      // Truncate large files to avoid overwhelming the brief
      L.push(content.length > 3000 ? content.substring(0, 3000) + '\n... (truncated)' : content);
      L.push('```');
      L.push('');
    }
  }

  // ═══ v4.4.2 STRUCTURED CONTEXT INJECTION — L2 ═══
  if (args.context && typeof args.context === 'string' && args.context.length > 10) {
    L.push('## AGENT FIRST-HAND CONTEXT — PRIMARY SOURCE OF TRUTH');
    L.push('');
    L.push('The following is first-hand knowledge from the agent that called this tool.');
    L.push('EVERY name, file, component, gate, tier, and structure mentioned below is REAL.');
    L.push('You MUST use ONLY these names and structures in your output.');
    L.push('NEVER invent alternative names, fictional scripts, or idealized architectures.');
    L.push('');
    L.push(args.context);
    L.push('');
  }
  if (args.components && typeof args.components === 'string' && args.components.length > 10) {
    L.push('## COMPONENTS TO BUILD');
    L.push(args.components);
    L.push('');
  }
  if (args.constraints && typeof args.constraints === 'string' && args.constraints.length > 10) {
    L.push('## HARD CONSTRAINTS');
    L.push(args.constraints);
    L.push('');
  }
  if (args.designDecisions && typeof args.designDecisions === 'string' && args.designDecisions.length > 10) {
    L.push('## DESIGN DECISIONS');
    L.push(args.designDecisions);
    L.push('');
  }
  if (args.knownGaps && typeof args.knownGaps === 'string' && args.knownGaps.length > 10) {
    L.push('## KNOWN GAPS AND BUGS');
    L.push(args.knownGaps);
    L.push('');
  }
  if (args.sourceLineage && typeof args.sourceLineage === 'string' && args.sourceLineage.length > 10) {
    L.push('## SOURCE LINEAGE');
    L.push(args.sourceLineage);
    L.push('');
  }
  if (args.fileInventory && typeof args.fileInventory === 'string' && args.fileInventory.length > 10) {
    L.push('## FILE INVENTORY');
    L.push(args.fileInventory);
    L.push('');
  }

  // Generation instructions — L2 engineering spec format
  L.push('## GENERATION INSTRUCTIONS — L2 ENGINEERING SPECIFICATION');
  L.push('');
  L.push('Write a COMPLETE engineering spec for the system described in the PRIMARY DIRECTIVE.');
  L.push('The spec MUST cover the topic described in PRIMARY DIRECTIVE — do NOT drift to other topics.');
  L.push('Use the user-provided sections above as the spec content structure.');
  L.push('Include: Executive Summary, Architecture, Data Model, Engine Class, Defense Rules,');
  L.push('Algorithm Specs, Test Specs, Integration, Compliance Matrix, What This Spec Does NOT Cover.');
  L.push('');
  L.push('Target 2000+ lines. NO MAXIMUM. 5000+ is normal for complex systems.');
  L.push('LENGTH IS NEVER A CONCERN. DENSITY is the ONLY metric. Be PRECISE not CONCISE.');
  L.push('');
  L.push('CODE BLOCKS: Full pseudocode implementations — TypeScript interfaces with all fields,');
  L.push('algorithm descriptions with step-by-step logic, method signatures with parameters and');
  L.push('return types, configuration objects with exact keys. Complete enough that a build agent');
  L.push('can implement directly — like the CME spec pattern. NOT complete runtime code.');
  L.push('Pseudocode building blocks that serve as the implementation blueprint.');
  L.push('');
  L.push('## GROUNDING CONTRACT');
  L.push('');
  L.push('Every file path, Docker image name, config value, constant MUST come from provided context.');
  L.push('Unknown values: PROPOSED: [value]. NEVER fabricate from training data.');
  L.push('Code blocks: Full TypeScript interfaces with all fields. Pseudocode algorithms');
  L.push('with step-by-step logic. Method signatures with parameters and return types.');
  L.push('Configuration objects with exact keys. Complete enough that a build agent can');
  L.push('implement directly — like the CME spec pattern. NOT complete implementations —');
  L.push('pseudocode building blocks that serve as the implementation blueprint.');
  L.push('');
  L.push('## THRESHOLD RATIONALE REQUIREMENT (CRITICAL)');
  L.push('');
  L.push('Every numeric threshold, constant, limit, and cutoff in this spec MUST include a');
  L.push('"BECAUSE" paragraph explaining the engineering reasoning for that specific value.');
  L.push('');
  L.push('Format:');
  L.push('  threshold = X BECAUSE [specific engineering reasoning — what failure mode');
  L.push('  occurs at X-0.1, what false positives occur at X+0.1, what analysis or data');
  L.push('  supports choosing X over alternatives]');
  L.push('');
  L.push('A threshold WITHOUT a BECAUSE paragraph is a DEFECT.');
  L.push('');

  return L.join('\n');
}

// ═══ L1 CONTENT GENERATOR BRIEF ═══
// L1 is a <800 line chat prompt / content generator. NOT an engineering spec.
// Takes requirements + reference docs and generates whatever content is asked for.
// Can produce: deployment guides, subagent prompts, context docs, behavior alignment, etc.

function buildL1ContentBrief(
  args: Record<string, any>,
  sourceExtracts: Map<string, string>,
  projectName: string,
): string {
  const L: string[] = [];

  L.push(`# CONTENT GENERATION TASK: ${projectName}`);
  L.push('');

  // FIRST-HAND CONTEXT — this is the PRIMARY source of truth
  if (args.context && args.context.length > 10) {
    L.push('## PRIMARY FIRST-HAND CONTEXT — SOURCE OF TRUTH');
    L.push('');
    L.push('The following is first-hand knowledge from the agent that called this tool.');
    L.push('EVERY name, file, component, gate, tier, and structure mentioned below is REAL and ACTUAL.');
    L.push('You MUST use ONLY these names and structures in your output.');
    L.push('NEVER invent alternative names, fictional scripts, fictional gates, or idealized architectures.');
    L.push('If the context says the system has 7 circuit breaker checks, write about 7 — NOT 8.');
    L.push('If the context says scripts are named deploy.sh, write deploy.sh — NOT 01-inject-artifacts.sh.');
    L.push('');
    L.push(args.context);
    L.push('');
  }

  // v4.4.2 structured context fields — flat string injection
  if (args.components && typeof args.components === 'string' && args.components.length > 10) {
    L.push('## COMPONENTS TO BUILD');
    L.push('');
    L.push(args.components);
    L.push('');
  }
  if (args.constraints && typeof args.constraints === 'string' && args.constraints.length > 10) {
    L.push('## HARD CONSTRAINTS');
    L.push('');
    L.push(args.constraints);
    L.push('');
  }
  if (args.designDecisions && typeof args.designDecisions === 'string' && args.designDecisions.length > 10) {
    L.push('## DESIGN DECISIONS');
    L.push('');
    L.push(args.designDecisions);
    L.push('');
  }
  if (args.knownGaps && typeof args.knownGaps === 'string' && args.knownGaps.length > 10) {
    L.push('## KNOWN GAPS AND BUGS');
    L.push('');
    L.push(args.knownGaps);
    L.push('');
  }
  if (args.sourceLineage && typeof args.sourceLineage === 'string' && args.sourceLineage.length > 10) {
    L.push('## SOURCE LINEAGE');
    L.push('');
    L.push(args.sourceLineage);
    L.push('');
  }
  if (args.fileInventory && typeof args.fileInventory === 'string' && args.fileInventory.length > 10) {
    L.push('## FILE INVENTORY');
    L.push('');
    L.push(args.fileInventory);
    L.push('');
  }

  // Key facts — must appear verbatim
  if (args.keyFacts && args.keyFacts.length > 0) {
    L.push('## KEY FACTS — MUST APPEAR IN OUTPUT');
    L.push('');
    for (const fact of args.keyFacts) {
      L.push(`- ${fact}`);
    }
    L.push('');
  }

  // What to generate
  L.push('## WHAT TO GENERATE');
  L.push('');
  L.push(args.requirements || 'No requirements specified. Generate based on context and reference material below.');
  L.push('');

  // Inline parameters (if provided)
  if (args.architecture) {
    L.push('## ARCHITECTURE CONTEXT');
    L.push(args.architecture);
    L.push('');
  }
  if (args.dataModel) {
    L.push('## DATA MODEL CONTEXT');
    L.push(args.dataModel);
    L.push('');
  }
  if (args.integrationPlan) {
    L.push('## INTEGRATION CONTEXT');
    L.push(args.integrationPlan);
    L.push('');
  }

  // Reference material
  if (sourceExtracts.size > 0) {
    L.push('## REFERENCE MATERIAL');
    L.push('');
    L.push('Use the following as reference. Synthesize into the output. Do NOT copy verbatim.');
    L.push('');
    for (const [filePath, content] of sourceExtracts) {
      const truncated = content.length > 3000 ? content.substring(0, 3000) + '\n... (truncated)' : content;
      L.push(`### ${path.basename(filePath)}`);
      L.push('```');
      L.push(truncated);
      L.push('```');
      L.push('');
    }
  }

  // Format — L1 specific
  L.push('## FORMAT — L1 INITIAL PLAN');
  L.push('');
  L.push('Generate the content described in WHAT TO GENERATE above.');
  L.push('Target 300-800 lines depending on task scope. Maximum 2200 lines.');
  L.push('Flexible structure — output depends on requirements.');
  L.push('If asked for a guide, write a guide. If asked for a prompt, write a prompt.');
  L.push('If asked for a checklist, write a checklist.');
  L.push('Use the reference material to ground every claim.');
  L.push('Output ONLY the content. No preamble. No filler. Be PRECISE not CONCISE.');
  L.push('');

  // ═══ GROUNDING CONTRACT — Anti-Fabrication ═══
  L.push('## GROUNDING CONTRACT');
  L.push('');
  L.push('Every file path, Docker image name, config value MUST come from provided context.');
  L.push('Unknown values: PROPOSED: [value]. NEVER fabricate from training data.');
  L.push('Code blocks: Full TypeScript interfaces with all fields. Pseudocode algorithms');
  L.push('with step-by-step logic. Method signatures with parameters and return types.');
  L.push('Configuration objects with exact keys. Pseudocode building blocks — not complete');
  L.push('runtime code, not stubs. Complete enough that a build agent can implement directly.');
  L.push('');

  return L.join('\n');
}

// ═══ PROBLEM SOLVING BRIEF ═══
// PS is an LLM-powered diagnostic tool — same architecture as L1.
// Reads actual source code, builds a brief, LLM produces comprehensive analysis.

function buildProblemSolvingBrief(
  problem: string,
  sourceExtracts: Map<string, string>,
  findings: string[],
  reasoning: string[],
  projectName: string,
): string {
  const L: string[] = [];

  L.push(`# PROBLEM SOLVING TASK: ${projectName}`);
  L.push('');

  L.push('## PROBLEM');
  L.push('');
  L.push(problem);
  L.push('');

  if (reasoning && reasoning.length > 0) {
    L.push('## REASONING CHAIN (user-provided context)');
    L.push('');
    for (const r of reasoning) {
      L.push(`- ${r}`);
    }
    L.push('');
  }

  if (findings && findings.length > 0) {
    L.push('## KNOWN FINDINGS (from audit or prior analysis)');
    L.push('');
    for (const f of findings) {
      L.push(`- ${f}`);
    }
    L.push('');
  }

  if (sourceExtracts.size > 0) {
    L.push('## SOURCE CODE (read this carefully — trace root causes to specific lines)');
    L.push('');
    for (const [file, code] of sourceExtracts) {
      const truncated = code.length > 4000 ? code.substring(0, 4000) + '\n... (truncated)' : code;
      L.push(`### ${file}`);
      L.push('```typescript');
      L.push(truncated);
      L.push('```');
      L.push('');
    }
  }

  L.push('## OUTPUT FORMAT');
  L.push('');
  L.push('Produce a comprehensive diagnostic analysis. Structure:');
  L.push('');
  L.push('1. **Classification**: Is this a question, task, or plan-first?');
  L.push('2. **Root Cause Analysis**: Trace the problem to its fundamental cause.');
  L.push('   Ask "why?" repeatedly. Each answer MUST cite specific file:line from the source code above.');
  L.push('   Do NOT say "insufficient evidence" — the code is right there. Read it and analyze it.');
  L.push('3. **Evidence**: List every code pattern that contributes to the problem, with file:line citations.');
  L.push('4. **Fix Strategy**: Prioritized phases. Each fix references exact file:line and what to change.');
  L.push('   Include the corrected code for each fix.');
  L.push('5. **Risk Assessment**: What could break? Blast radius of each fix?');
  L.push('6. **Verification Plan**: How to verify each fix worked.');
  L.push('');
  L.push('Target 300-800 lines. Every claim must cite file:line. No template phrases.');
  L.push('Output ONLY the analysis. No preamble. No meta-commentary.');

  return L.join('\n');
}

// ═══ T1 INJECTABLE BRIEF ═══
// T1 is a 150-350 line operational protocol — NOT an engineering spec.
// Format: dense bullets, correct/wrong pairs, troubleshooting, lookup tables.
// Battle-scarred, imperative, zero theory. Agent reads this and knows EXACTLY what to do.

function buildT1InjectableBrief(
  args: Record<string, any>,
  sourceExtracts: Map<string, string>,
  projectName: string,
): string {
  const L: string[] = [];

  L.push(`# T1 INJECTABLE GENERATION: ${projectName}`);
  L.push('');

  // What this injectable covers
  L.push('## WHAT THIS INJECTABLE COVERS');
  L.push('');
  L.push(args.requirements || `Operational protocol for ${projectName}.`);
  L.push('');

  // Reference material
  if (sourceExtracts.size > 0) {
    L.push('## REFERENCE MATERIAL');
    L.push('');
    L.push('Mine the following for rules, patterns, gotchas, and failure modes.');
    L.push('Extract the PRACTICAL knowledge — what breaks, what works, what to NEVER do.');
    L.push('');
    for (const [filePath, content] of sourceExtracts) {
      const truncated = content.length > 3000 ? content.substring(0, 3000) + '\n... (truncated)' : content;
      L.push(`### ${path.basename(filePath)}`);
      L.push('```');
      L.push(truncated);
      L.push('```');
      L.push('');
    }
  }

  // T1 format — VERY specific to injectable quality bar
  L.push('## T1 INJECTABLE FORMAT — FOLLOW EXACTLY');
  L.push('');
  L.push('Generate a T1 INJECTABLE document. This is an OPERATIONAL PROTOCOL, not an engineering spec.');
  L.push('');
  L.push('### STRUCTURE (use these sections):');
  L.push('1. **CRITICAL RULES** — Bullet list of hard ALWAYS/NEVER rules. Each rule 1-2 sentences max.');
  L.push('2. **CORRECT/WRONG PAIRS** — For every key rule, show ✅ CORRECT and ❌ WRONG code example.');
  L.push('3. **STEP-BY-STEP PROCEDURES** — Numbered steps with exact bash/python commands. Copy-paste-ready.');
  L.push('4. **TROUBLESHOOTING MATRIX** — Table or bullet list: error → cause → fix.');
  L.push('5. **QUICK REFERENCE** — Compact lookup table at the end with key facts.');
  L.push('');
  L.push('### QUALITY BAR:');
  L.push('- 150-600 lines depending on complexity. Every line must earn its place.');
  L.push('- Dense. Zero fluff. Zero theory. Zero explanation of WHY.');
  L.push('- Imperative tone: ALWAYS, NEVER, MUST, FORBIDDEN.');
  L.push('- Battle-scarred: write from accumulated failures, not first principles.');
  L.push('- Copy-paste code blocks must be RUNNABLE as-is.');
  L.push('- An agent reads this and knows EXACTLY what to do — no ambiguity.');
  L.push('');
  L.push('### FORBIDDEN:');
  L.push('- NO Executive Summary, Architecture, Data Model, or any L2-style sections.');
  L.push('- NO trade-off analysis, alternative comparison, or design justification.');
  L.push('- NO prose paragraphs longer than 2 sentences.');
  L.push('- NO pseudocode — only real runnable commands.');
  L.push('- NO "implement actual logic" or other template phrases.');
  L.push('');
  L.push('### T1 STANDARD (the operator\'s law):');
  L.push('The output is LINE-COUNTED, not token-counted. TARGET 300-800 LINES. MAX 1200 LINES.');
  L.push('A T1 under 300 lines is UNDER-DELIVERED — every section must carry the full engineering');
  L.push('detail (the 7-Q depth: return/error/side-effect/callers/edge/evidence/rollback where applicable).');
  L.push('DENSITY is the only metric. Do NOT pad with whitespace — pad with CONTENT.');
  L.push('');
  L.push('Output ONLY the T1 injectable document.');
  L.push('');

  return L.join('\n');
}

// FINDING #10 FIX: Async readFile instead of sync readFileSync

/** Collect all .ts/.js source files from a directory (recursive, max 50). */
async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= 50) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        const sub = await collectSourceFiles(fullPath);
        results.push(...sub);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch (e: unknown) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
  return results;
}
async function resolveProjectName(targetPath: string): Promise<string> {
  try {
    const pkgPath = path.join(targetPath, 'package.json');
    const content = await fs.readFile(pkgPath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    const pkg: { name?: string } = parsed !== undefined && parsed !== null && typeof parsed === 'object'
      ? parsed as { name?: string }
      : {};
    if (pkg?.name) return pkg.name;
  } catch (e: unknown) {
    tridentLog('WARN', 'trident-tools', `resolveProjectName: no package.json at ${targetPath}`);
  }
  return path.basename(targetPath) || 'unnamed-project';
}

// FINDING #5 FIX: Write artifact .md files to disk so they survive session end
// ARTIFACT STORAGE POLICY: ALL artifacts go to GENERATED_ARTIFACTS/{modeFolder}/
// Names are SEMANTIC — extracted from the first H1 heading in the content
const ARTIFACTS_BASE = TRIDENT_CONFIG.artifactsBase;

const MODE_FOLDERS: Record<string, string> = {
  CODE_REVIEW: 'CODE_REVIEW',
  DP_L2_SPEC: 'DP_L2_SPEC',
  DP_L1_CONTENT: 'DP_L1_CONTENT',
  DP_L3_LIBRARY: 'DP_L3_LIBRARY',
  PROBLEM_SOLVING: 'PROBLEM_SOLVING',
  CS_T1_INJECTABLE: 'CS_T1_INJECTABLE',
  CS_T2_KNOWLEDGE: 'CS_T2_KNOWLEDGE',
};

function extractSemanticName(content: string, modeFolder: string): string {
  // Strategy 1: Extract first # H1 heading from the markdown content
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    let name = h1Match[1].trim()
      .replace(/\*\*/g, '')           // remove bold markers
      .replace(/[`'"“”]/g, '')         // remove quotes
      .replace(/[—–-]+/g, '_')         // replace dashes with underscore
      .replace(/[^a-zA-Z0-9_ ]/g, '') // remove other special chars
      .trim()
      .replace(/\s+/g, '_')           // spaces to underscores
      .replace(/_+/g, '_')            // collapse multiple underscores
      .replace(/^_|_$/g, '')           // trim leading/trailing underscores
      .toUpperCase();
    
    // Limit length but keep it meaningful
    if (name.length > 100) name = name.substring(0, 100);
    if (name.length >= 10) return name;
  }
  
  // Strategy 2: Look for "Project:" or "Project Name:" metadata
  const projectMatch = content.match(/\*{0,2}(?:Project|Plugin|Package)\s*Name?\s*\*{0,2}:?\s*(.+?)(?:\n|$)/i);
  if (projectMatch) {
    let name = projectMatch[1].trim()
      .replace(/[^a-zA-Z0-9_ ]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase();
    if (name.length > 5) return `${modeFolder}_${name}`;
  }
  
  // Strategy 3: Look for a title-like pattern in the first 200 chars
  const firstLines = content.substring(0, 200);
  const titleMatch = firstLines.match(/^[A-Z][A-Za-z0-9\s\-_]{5,60}$/m);
  if (titleMatch) {
    let name = titleMatch[0].trim().replace(/\s+/g, '_').toUpperCase();
    if (name.length > 5) return name;
  }
  
  // Strategy 4: Extract from content context — look for significant keywords
  const contextMatch = content.match(/(?:TRIDENT|Audit|Review|Plan|Spec|Build|Context|Injectable)\s*(?:\w+\s*){0,4}/i);
  if (contextMatch) {
    let name = modeFolder + '_' + contextMatch[0].trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
    if (name.length > 5) return name;
  }
  
  // Final fallback: mode folder name with a unique content hash
  const shortHash = content.length.toString(16) + '-' + content.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `${modeFolder}_${shortHash}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function writeArtifactFile(modeFolder: string, content: string, outputPath?: string, outputName?: string, fileName?: string): Promise<string> {
  const folder = MODE_FOLDERS[modeFolder] || modeFolder;
  // PRIORITY: outputPath + fileName → write to outputPath/fileName.md directly
  if (outputPath && fileName) {
    try {
      if (!(await fileExists(outputPath))) {
        await fs.mkdir(outputPath, { recursive: true });
      }
      const finalPath = path.join(outputPath, `${fileName.replace(/\.md$/i, '')}.md`);
      await fs.writeFile(finalPath, content, 'utf-8');
      tridentLog('INFO', 'trident-tools', `Artifact saved to: ${finalPath}`);
      return finalPath;
    } catch (err: unknown) {
      tridentLog('ERROR', 'trident-tools', `writeArtifactFile fileName path failed: ${(err instanceof Error ? err : new Error(String(err))).message}`);
    }
  }

  // If outputPath specified, write directly there instead of GENERATED_ARTIFACTS
  if (outputPath) {
    try {
      // DIRECTORY BUG FIX: when outputPath is an existing directory and no
      // fileName/outputName is provided, writing literally to the directory path
      // creates a FILE named after the directory (e.g., "GENERATED_ARTIFACTS"
      // becomes a file, not a folder). Auto-generate a semantic name inside the
      // directory instead. (Identified by PS diagnostic analysis.)
      const fsSync = await import('fs');
      const isDir = fsSync.existsSync(outputPath) && fsSync.statSync(outputPath).isDirectory();
      if (isDir) {
        const semanticName = outputName
          ? outputName.replace(/\.md$/i, '')
          : extractSemanticName(content, modeFolder);
        const finalPath = path.join(outputPath, `${semanticName}.md`);
        await fs.writeFile(finalPath, content, 'utf-8');
        tridentLog('INFO', 'trident-tools', `Artifact saved inside directory: ${finalPath}`);
        return finalPath;
      }
      const dir = path.dirname(outputPath);
      if (!(await fileExists(dir))) {
        await fs.mkdir(dir, { recursive: true });
      }
      const finalPath = outputName ? path.join(dir, outputName) : outputPath;
      await fs.writeFile(finalPath, content, 'utf-8');
      tridentLog('INFO', 'trident-tools', `Artifact saved to custom path: ${finalPath}`);
      return finalPath;
    } catch (err: unknown) {
      tridentLog('ERROR', 'trident-tools', `writeArtifactFile custom path failed: ${(err instanceof Error ? err : new Error(String(err))).message}`);
      // Fall through to default behavior
    }
  }
  const artifactDir = path.join(ARTIFACTS_BASE, folder);
  try {
    if (!(await fileExists(artifactDir))) {
      await fs.mkdir(artifactDir, { recursive: true });
    }
    const semanticName = extractSemanticName(content, modeFolder);
    const fileName = `${semanticName}.md`;
    const filePath = path.join(artifactDir, fileName);

    let finalPath = filePath;
    let counter = 1;
    while (await fileExists(finalPath)) {
      finalPath = path.join(artifactDir, `${semanticName}_${counter}.md`);
      counter++;
    }

    await fs.writeFile(finalPath, content, 'utf-8');
    tridentLog('INFO', 'trident-tools', `Artifact saved: ${finalPath}`);
    return finalPath;
  } catch (err: unknown) {
    tridentLog('ERROR', 'trident-tools', `writeArtifactFile failed: ${(err instanceof Error ? err : new Error(String(err))).message}`);
    return '';
  }
}

function storeArtifacts(artifacts: Record<string, string>): void {
  for (const [key, value] of Object.entries(artifacts)) {
    orchestrator.addArtifact(key, value);
  }
}

function isBundleFile(filePath: string): boolean {
  if (filePath.includes('/dist/') || filePath.includes('/node_modules/') ||
      filePath.includes('.bundle.') || filePath.includes('.min.') ||
      filePath.endsWith('bundle.js')) {
    return true;
  }
  try {
    const fd = fsSync.openSync(filePath, 'r');
    const buffer = Buffer.alloc(256);
    const bytes = fsSync.readSync(fd, buffer, 0, 256, 0);
    fsSync.closeSync(fd);
    const sentinel = buffer.toString('utf-8', 0, bytes);
    const patterns = ['"use strict"', '(function(', 'webpackChunk', '__webpack_require__', 'let __esModule', '//# sourceMappingURL'];
    return patterns.some((p: string) => sentinel.includes(p));
  } catch (e: unknown) {
    tridentLog('DEBUG', 'trident-tools', `detectBundledSentinel failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function loadTridentIgnore(targetPath: string): string[] {
  const ignorePath = path.join(targetPath, '.tridentignore');
  const defaultPatterns = [
    'dist/**', 'node_modules/**', 'build/**', 'out/**',
    '.trident/**', '.manta/**', '*.js.map', '*.min.js',
    '*.bundle.*', '*.test.ts', '*.spec.ts'
  ];
  try {
    if (fsSync.existsSync(ignorePath)) {
      const content = fsSync.readFileSync(ignorePath, 'utf-8');
      const patterns = content.split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith('#'));
      return [...defaultPatterns, ...patterns];
    }
  } catch (e: unknown) {
    tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`);
    tridentLog('DEBUG', 'trident-tools', `loadTridentIgnore failed: ${e instanceof Error ? e.message : String(e)}`);
    return defaultPatterns;
  }
  return defaultPatterns;
}

function matchesIgnorePatterns(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const regex = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    if (new RegExp(regex).test(filePath)) return true;
  }
  return false;
}

function filterByConfidence<T extends { confidence?: number }>(
  findings: T[], floor: number = 0.85
): { dispatched: T[]; logged: T[]; excluded: T[] } {
  const dispatched: T[] = [];
  const logged: T[] = [];
  const excluded: T[] = [];
  for (const f of findings) {
    const conf = f.confidence ?? 1.0;
    if (conf < 0.50) excluded.push(f);
    else if (conf < floor) logged.push(f);
    else dispatched.push(f);
  }
  return { dispatched, logged, excluded };
}

function validateFindingLocation(filePath: string, line: number): boolean {
  try {
    const content = fsSync.readFileSync(filePath, 'utf-8');
    const lineCount = content.split('\n').length;
    return line >= 1 && line <= lineCount;
  } catch (e: unknown) {
    tridentLog('DEBUG', 'trident-tools', `validateFindingLocation failed for ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function formatValidationReport(
  validations: Array<{ layer: number; name: string; valid: boolean; missing: string[] }>,
  modeName: string
): string {
  const passCount = validations.filter((v: { layer: number; name: string; valid: boolean; missing: string[] }) => v.valid).length;
  const allValid = passCount === validations.length;
  const noneValid = passCount === 0 && validations.length > 0;

  let r = `## Mode Validation — ${modeName}\n\n`;

  // v4.4.2: No more escape hatch — report all failures, never skip
  if (noneValid) {
    r += `⚠ ALL LAYERS FAILED VALIDATION\n\n`;
  }

  r += `**Result:** ${allValid ? 'PASS' : noneValid ? 'FAIL' : 'PARTIAL'} (${passCount}/${validations.length} layers validated)\n\n`;
  r += `| Layer | Name | Status | Missing Requirements |\n`;
  r += `|-------|------|--------|---------------------|\n`;
  for (const v of validations) {
    r += `| ${v.layer} | ${v.name} | ${v.valid ? 'PASS' : (noneValid ? 'FAIL' : 'PARTIAL')} | ${v.missing.length > 0 ? v.missing.join(', ') : '—'} |\n`;
  }
  r += `\n`;
  if (!allValid) {
    r += `**Note:** Missing requirements indicate content that would benefit from more detailed input parameters.\n`;
  }
  return r;
}

// ============================================================================
// SEMANTIC DETECTION FUNCTIONS
// ============================================================================

/**
 * @deprecated The Problem solving loop replaced 6-layer pipeline. This function is kept
 * for backward compatibility but no longer called by the trident-problem-solving
 * tool. Classification is handled by the LLM diagnostic engine.
 */
function detectProblemSolvingLayer(problem: string): 1 | 2 | 3 | 4 | 5 | 6 {
  const lower = (problem || '').toLowerCase();
  if (/\b(verification|verify|test\s+result|confirm|check\s+result|pass\s+fail)\b/.test(lower)) return 6;
  if (/\b(meta.?reflection|meta.?analysis|reflect|lessons?\s+learned|what\s+went\s+wrong|self.?critique)\b/.test(lower)) return 5;
  if (/\b(gap\s*analysis|gap|discrepancy|mismatch|missing\s+vs\s+expected|delta)\b/.test(lower)) return 4;
  if (/\b(observation|observe|what\s+happened|evidence|data\s+collected|result\s+observed)\b/.test(lower)) return 3;
  if (/\b(action|plan|execute|implement|steps?\s+taken|do\s+this)\b/.test(lower)) return 2;
  if (/\b(assumption|premise|hypothesis|supposition|what\s+we\s+believe)\b/.test(lower)) return 1;
  return 1; // Default: assumption
}

/**
 * Detect context-synthesis output mode (T1 vs T2) from requirements text.
 * If text mentions T2 keywords, force T2. If T1 keywords, force T1.
 * Otherwise, fall back to the outputMode parameter.
 */
function detectContextSynthesisLayer(text: string, outputMode: string): 'T1' | 'T2' {
  // Explicit outputMode parameter ALWAYS wins. Detection text is a hint, not an override.
  if (outputMode === 'T2') return 'T2';
  if (outputMode === 'T1') return 'T1';
  const lower = (text || '').toLowerCase();
  if (/\b(t2|knowledge\s+file|bible)\b/.test(lower)) return 'T2';
  if (/\b(t1|injectable|config)\b/.test(lower)) return 'T1';
  return 'T1';  // Safe default
}

let opencodeClient: OpencodeClient | null = null;

export function getOpencodeClient(): OpencodeClient | null { return opencodeClient; }

export function createTridentTools(client?: OpencodeClient) {
  opencodeClient = client || null;
  setClientGetter(() => opencodeClient);
  godLoopOrchestrator.setClientGetter(() => opencodeClient);
  try { setPoseidonClientRef(opencodeClient); } catch (e) { /* non-fatal — the kick resolves lazily */ }
  return {
    'trident-code-audit': tool({
      description: 'Run CODE_REVIEW mode: 3-layer pipeline (preflight → 17-layer audit R0-R16 → artifact) against a project path. Produces dense code review artifact with findings table, fix code, verification checklist.',
      args: {
        targetPath: z.string().describe('Absolute path to the project root to audit'),
        action: z.enum(['full', 'quick', 'preflight-only', 'status']).default('full').describe('Audit depth: full=preflight+17 layers+artifact, quick=17 layers+artifact, preflight-only=just tsc+build+dist, status=read live run-status.json + artifact headers (the poll channel)'),
      },
      execute: async (args: { targetPath: string; action: 'full' | 'quick' | 'preflight-only' | 'status' }, context?: { sessionID?: string }) => {
        if (!(await fileExists(args.targetPath))) {
          throw new Error('targetPath does not exist: ' + args.targetPath);
        }
        // THE ASYNC SEAM — action=status (the poll channel): reads run-status.json + artifact headers, never fabricates
        if (args.action === 'status') {
          const ledgerRoot = aetherLedgerRootFor(args.targetPath);
          const statusPath = runStatusPath(ledgerRoot);
          const res = readRunStatus(ledgerRoot);
          if (!res.ok) {
            if (res.reason === NO_ACTIVE_RUN) {
              return JSON.stringify({ ready: false, error: NO_ACTIVE_RUN, statusPath, hint: 'No active or recent audit run — run trident-code-audit action=full first' }, null, 2);
            }
            return JSON.stringify({ ready: false, error: 'CORRUPT', statusPath, detail: res.error, raw: res.raw ? String(res.raw).slice(0, 500) : undefined }, null, 2);
          }
          let artifactInfo: Record<string, unknown> = { exists: false };
          try {
            const artifactPath = artifactPathFor(args.targetPath, res.snapshot.artifactLabel);
            if (fsSync.existsSync(artifactPath)) {
              const raw = fsSync.readFileSync(artifactPath, 'utf-8');
              const headerLines = raw.split('\n').slice(0, 14).join('\n');
              // mechanical detector only — headerLines is plain markdown text, not code AST; the structural truth is the run-status.json triad + the artifact file existence
              const scoreMatch = headerLines.match(/Score[^\n]*/);
              const findingsMatch = headerLines.match(/Findings[^\n]*/);
              artifactInfo = { exists: true, path: artifactPath, header: headerLines.slice(0, 800), scoreLine: scoreMatch ? scoreMatch[0] : undefined, findingsLine: findingsMatch ? findingsMatch[0] : undefined };
            } else {
              artifactInfo = { exists: false, path: artifactPath };
            }
          } catch (_artifactErr: unknown) {
            void _artifactErr;
            try { tridentLog('WARN', 'trident-code-audit', `status artifact read failed: ${_artifactErr instanceof Error ? _artifactErr.message : String(_artifactErr)}`); } catch (_logErr: unknown) { void _logErr; }
            artifactInfo = { exists: false, error: 'artifact read failed' };
          }
          let notifications: unknown[] = [];
          try { notifications = readNotifications(ledgerRoot, 10); } catch (_nErr: unknown) { void _nErr; }
          return JSON.stringify({ ready: true, snapshot: res.snapshot, artifact: artifactInfo, notifications, statusPath, ladder: res.snapshot.gate }, null, 2);
        }
        // TIMEOUT WRAPPER: REMOVED (2026-08-22 — the operator: "this should
        // be event aware not dumb"). The blind Promise.race wall-clock kill
        // was a pre-Step-X guard for the ts.createProgram freeze class, which
        // the W1 RAM-safe AST core eliminated. Every remaining hang surface
        // has its own targeted protection: chainedStream stall guard (60s
        // no-event per LLM call), RPM ledger admission gate, parseProbeResult
        // retry-once, silent-verifier six checks. A successful agentic
        // judgment pass at HIGH reasoning takes 3-8 minutes — a wall-clock
        // kill would murder it mid-flight. NO MACRO TIMEOUT.
        // THE SYNCHRONOUS-PREFIX FIX (2026-08-30 — the operator caught the hang):
        // The async function's SYNCHRONOUS PREFIX (P1P10 scan, ts.createProgram)
        // runs IMMEDIATELY upon creation, blocking the event loop for minutes
        // BEFORE the tool handler can return. setImmediate() defers the start
        // to the NEXT event loop iteration — AFTER this return has executed.
        // This is the JavaScript event loop's fundamental behavior: an async
        // function is NOT a thread; it's a synchronous function that pauses
        // at await points. The prefix before the first await runs synchronously.
        const startAudit = (): Promise<string> => {
          return (async () => {
          orchestrator.startAudit();
          const projectName = await resolveProjectName(args.targetPath);

          // Collect supplementary findings from warhead analyzers
          const supplementaryFindings: AuditFinding[] = [];

          // TsProgramWrapper: DISABLED — creates full ts.Program which maxes CPU and freezes.
          // The AuditEngine already runs its own AST analysis. This was dead code for a reason.
          // Only enable for explicit full audits with timeout protection.
          // To re-enable: add a timeout wrapper around createProgram + runAll.

          // P1-P10 Scanner: principle verification — LOG ONLY (Wave M: FP mass exits denominator; scan stays as status signal)
          if (args.targetPath) {
            try {
              const p1p10 = new P1P10Verification();
              const scanResult = p1p10.scan(args.targetPath);
              tridentLog('INFO', 'trident-tools', `P1-P10 scan: ${scanResult.score}% — contributed ${scanResult.results.filter(r => !r.passed).length} findings`);
            } catch (e: unknown) {
              tridentLog('WARN', 'trident-tools', 'P1-P10 scan failed: ' + (e instanceof Error ? e.message : String(e)));
            }
          }

          if (args.action === 'preflight-only') {
            const { runPreflight } = await import('../audit-engine/preflight.js');
            const result = await runPreflight(args.targetPath);
            return JSON.stringify({
              action: 'preflight-only',
              targetPath: args.targetPath,
              typeCheckPassed: result.typeCheckPassed,
              buildPassed: result.buildPassed,
              distExists: result.distExists,
              distIsSingleFile: result.distIsSingleFile,
              distSizeKB: (result.distSize / 1024).toFixed(1),
              sourceMapExists: result.sourceMapExists,
              findings: result.findings,
              typeCheckError: result.typeCheckError,
              buildError: result.buildError,
            }, null, 2);
          }

          if (args.action === 'full') {
            orchestrator.completeLayer();
          }

          const engine = new AuditEngine();
          let result;
          if (args.action === 'quick') {
            result = await engine.audit(args.targetPath);
          } else {
            result = await engine.auditWithPreflight(args.targetPath);
          }
          orchestrator.completeLayer();

          const rawFindings = [...result.findings, ...supplementaryFindings];
          const ignorePatterns = loadTridentIgnore(args.targetPath);
          const culledFindings = rawFindings.filter((f: AuditFinding) => {
            if (isBundleFile(f.file)) return false;
            if (matchesIgnorePatterns(f.file, ignorePatterns)) return false;
            if (!validateFindingLocation(f.file, f.line)) return false;
            return true;
          });
          const { dispatched, logged, excluded } = filterByConfidence(culledFindings, 0.85);
          tridentLog('INFO', 'trident-code-audit',
            `FP elimination: ${rawFindings.length} raw → ${excluded.length} excluded (ignore/bundle/location) → ${logged.length} filtered (confidence <0.85) → ${dispatched.length} dispatched`);
          result.findings = dispatched;

          // THE SPEC-2 §11.1 ANCHOR (the S-PB4 container-proof fix): result.report is
          // the FINAL report — the Step-X adjudicated render OR the un-erasable
          // markStepSkipped wrapper. When the engine wrapped/replaced it, the tool
          // returns THAT (the loud header survives the tool boundary); the legacy
          // artifact render applies only to the unwrapped machinery-only path.
          const engineReport = typeof result.report === 'string' ? result.report : '';
          const stepXFinaled =
            engineReport.startsWith('# TRIDENT CODE AUDIT — STEP-X SKIPPED') ||
            engineReport.includes('(the STEP-X adjudicated report)');
          const artifact = stepXFinaled
            ? engineReport
            : generateCodeReviewArtifact(result, args.targetPath, projectName, '');
          const mdPath = await writeArtifactFile('CODE_REVIEW', artifact);
          storeArtifacts({
            'code-review': artifact,
            'artifact-path': mdPath,
            'raw-audit-result': JSON.stringify({ score: result.score, grade: result.grade, findings: result.findings.length }),
          });

          // Validation failure is a WARNING, not an error — do not put machine in ERROR state

          return artifact + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '');
        })();
        };

        // THE SYNCHRONOUS-PREFIX FIX + INSTANT RETURN (for action=full):
        // setImmediate defers the audit start to the NEXT event loop tick —
        // AFTER this return executes. The tool handler returns instantly.
        // For quick/preflight-only: inline is fine (they complete in seconds).
        if (args.action === 'full') {
          const ledgerRoot = aetherLedgerRootFor(args.targetPath);
          const statusPath = runStatusPath(ledgerRoot);
          const artifactPath = preliminaryArtifactPath(args.targetPath);

          // THE TOAST CHANNEL — resolve the owner session (the wave-cron v3 fallback
          // pattern: newest root session via the opencode.db probe) and configure the
          // promptAsync delivery into it. Failure to configure = the JSONL + log
          // channels still work (proven) — the toast is additive visibility.
          try {
            // THE CALLING SESSION (the v3 wave-dispatch pattern: context.sessionID is the
            // caller — the toast lands in the session that FIRED the audit). Fallback:
            // the DB probe (newest root session) when context is absent.
            const callingSessionId = (context && typeof context.sessionID === 'string' && context.sessionID !== 'default') ? context.sessionID : null;
            const ownerSessionId = callingSessionId ?? resolveOwnerSessionId();
            const client = getOpencodeClient();
            if (ownerSessionId && client && typeof (client as { session?: { promptAsync?: unknown } }).session?.promptAsync === 'function') {
              const sess = (client as { session: { promptAsync: (args: { path: { id: string }; body: { parts: Array<{ type: string; text: string }> } }) => Promise<unknown> } }).session;
              configureToastDelivery((text: string) => {
                void sess.promptAsync({
                  path: { id: ownerSessionId },
                  body: { parts: [{ type: 'text', text }] },
                }).catch((toastErr: unknown) => {
                  try {
                    tridentLog('WARN', 'trident-code-audit', `GATE_TOAST_DELIVERY_FAILED: ${toastErr instanceof Error ? toastErr.message : String(toastErr)}`);
                  } catch (_logErr: unknown) {
                    void _logErr;
                  }
                });
              });
              tridentLog('INFO', 'trident-code-audit', `TOAST_CHANNEL_CONFIGURED ownerSession=${ownerSessionId}`);
            } else {
              tridentLog('WARN', 'trident-code-audit', `TOAST_CHANNEL_UNAVAILABLE owner=${ownerSessionId ?? 'none'} client=${client ? 'yes' : 'no'} — falling back to JSONL+log channels only`);
            }
          } catch (toastConfigErr: unknown) {
            tridentLog('WARN', 'trident-code-audit', `TOAST_CHANNEL_CONFIG_FAILED: ${toastConfigErr instanceof Error ? toastConfigErr.message : String(toastConfigErr)} — JSONL+log channels remain`);
          }

          // FIRE DETACHED — setImmediate defers the audit start to the NEXT
          // event loop tick, AFTER this return executes. The tool handler
          // returns INSTANTLY; the audit begins on the next tick.
          setImmediate(() => {
            startAudit().then(
              () => {},
              (err: unknown) => {
                try {
                  tridentLog('ERROR', 'trident-code-audit', 'DETACHED_AUDIT_FAILED: ' + (err instanceof Error ? err.message : String(err)));
                } catch (_logErr: unknown) {
                  void _logErr;
                }
              },
            );
          });

          // RETURN INSTANTLY (~50ms — the progress token)
          return JSON.stringify(
            {
              started: true,
              detached: true,
              statusPath,
              artifactPath,
              poll: `trident-code-audit action=status targetPath=${args.targetPath}`,
              note: 'Audit running detached — poll status for gate transitions; in-session toasts fire at each gate completion',
            },
            null,
            2,
          );
        }
        // quick/preflight-only: run inline (they complete in seconds)
        return await startAudit();
      },
    }),

    'trident-deep-planning': tool({
      description: 'Run DEEP_PLANNING mode: 3-layer pipeline (Initial Plan → Detailed Workflow → Context Library). Validates output against DeepPlanningModule requirements at each layer. Produces Build Spec + Context Library Manifest.',
      args: {
        targetPath: z.string().optional().describe('Absolute path to project root. Source files are read as REFERENCE material for the spec. The tool does NOT audit or analyze this code — it reads it as context.'),
        requirements: z.string().optional().describe('MINIMUM 4000+ CHARS for layer=2 (500+ for layer=1). PRIMARY input. What system to design and build. The spec will be generated from these requirements using contextFiles as reference material. Include FR-1 through FR-N with interface specs, acceptance criteria, and testable outputs.'),
        architecture: z.string().optional().describe('Architecture description for the spec'),
        patterns: z.array(z.string()).optional().describe('Known patterns to include in context library (merged with auto-discovered patterns)'),
        failures: z.array(z.string()).optional().describe('Known failure modes to document (merged with auto-discovered failures)'),
        decisions: z.array(z.string()).optional().describe('Design decisions already made (merged with auto-discovered decisions)'),
        layer: z.union([z.literal(1), z.literal(2), z.literal(3)]).describe('REQUIRED — no default. Choose CONSCIOUSLY: 1=Initial Plan (quick top-level approach), 2=Detailed Workflow (3000+ line implementation build spec), 3=Context Library (manifest). Passing 1 when you meant 2 silently produces the wrong artifact — there is no auto-detect and no fallback.'),
        inputFile: z.string().optional().describe('Path to a JSON file containing the 8 structured fields (requirements, context, components, constraints, designDecisions, knownGaps, sourceLineage, fileInventory). REQUIRED for L2 when the function-calling payload limit prevents passing 68K+ chars as inline args. Fields from the file MERGE with inline args (file wins for its fields).'),
        context: z.string().describe('MINIMUM 16000+ CHARS for layer=2 (2000+ for layer=1). MANDATORY: First-hand context from the calling agent. Paste actual file names, actual architecture, actual implementation details. The LLM uses this as PRIMARY source of truth and will NOT invent alternatives. Fill to the minimum for your layer — short content causes validation failure.'),
        keyFacts: z.array(z.string()).optional().describe('Critical facts that MUST appear in the output verbatim'),
        outputPath: z.string().describe('MANDATORY: Absolute directory path where the artifact .md file must be written.'),
        fileName: z.string().optional().describe('Output filename WITHOUT extension. Example: "FULL_BUILD_REPORT" → writes FULL_BUILD_REPORT.md. The agent MUST provide this.'),
        outputName: z.string().optional().describe('DEPRECATED: Use fileName instead.'),
        contextFiles: z.array(z.string()).optional().describe('MANDATORY for L2/L3 when generating from external source code. Absolute paths to ALL source files the tool must read before generating. The tool reads each file, extracts TypeScript interfaces/classes/functions/algorithms, and returns a STRUCTURED BRIEF that tells the agent exactly what to write in each spec section. Without this, the tool can only template-fill from the section parameters below.'),

        // FULL MARKDOWN SECTIONS — agent writes complete engineering content:
        executiveSummary: z.string().optional().describe('Full markdown for Executive Summary section. Write complete paragraphs with engineering reasoning. Include problem statement, failure analysis, and solution approach.'),
        architectureOverview: z.string().optional().describe('Full markdown for Architecture section. Include ASCII diagrams, execution model, design rationale with full paragraphs.'),
        dataModel: z.string().optional().describe('Full markdown for Data Model section. Include complete TypeScript interface definitions with field-by-field rationale.'),
        engineDesign: z.string().optional().describe('Full markdown for Engine Class Design. Include complete TypeScript class skeletons with method bodies, constructor injection, lifecycle hooks.'),
        defenseRules: z.array(z.string()).optional().describe('Full markdown for EACH defense rule section. One string per rule. Each must include: purpose, algorithm with pseudocode, implementation TypeScript, worked example with numbered steps.'),
        blindSpots: z.string().optional().describe('Full markdown for Blind Spot Reporting. Honest analysis of what the engine cannot detect and why.'),
        integrationPlan: z.string().optional().describe('Full markdown for Integration section. Import paths, hook registration, orchestrator wiring with TypeScript code.'),
        evidenceFormat: z.string().optional().describe('Full markdown for Evidence Output Format. JSON schema, field table, sample output.'),
        testSpecs: z.string().optional().describe('Full markdown for Test Specifications. Negative and positive tests per rule.'),
        migrationStrategy: z.string().optional().describe('Full markdown for Migration Strategy. Phased rollout with rollback conditions.'),
        engineSpecs: z.array(z.string()).optional().describe('DEPRECATED: L3 now generates internally. Do not use.'),
        recursive: z.boolean().optional().describe('DEPRECATED: L3 now generates internally. Do not use.'),
        domains: z.array(z.object({
          name: z.string().describe('Domain name — becomes the filename. e.g., "CME_CONTEXT_MANAGEMENT_ENGINE"'),
          context: z.string().describe('FULL architecture description for this domain. Everything the LLM needs to write the spec. This is the PRIMARY DIRECTIVE for this domain\'s L2 generation.'),
          files: z.array(z.string()).optional().describe('Source file paths belonging to this domain. Read as reference material for the brief.'),
        })).optional().describe('MANDATORY for layer=3 (or use domainNames+domainContexts). Array of domain definitions. Each domain becomes one L2 spec file.'),
        domainsJson: z.string().optional().describe('ALTERNATIVE: JSON string of domains array. Example: \'[{"name":"AUTH","context":"Design auth..."}]\''),
        domainNames: z.array(z.string()).optional().describe('SIMPLEST for layer=3: Array of domain names. Zip with domainContexts. Example: ["AUTH_ENGINE", "RATE_LIMITER"]'),
        domainContexts: z.array(z.string()).optional().describe('SIMPLEST for layer=3: Array of domain descriptions (same order as domainNames). Example: ["Design auth engine with JWT...", "Design rate limiter with sliding window..."]'),
        // v4.4.2 structured context — ALL appended at END (inserting mid-object breaks SDK schema converter)
        components: z.string().describe('MINIMUM 8000+ CHARS for layer=2. Components to build. Name, purpose, source, target file. Every component: purpose, file location, exported interfaces, dependencies, data flow, failure modes.'),
        constraints: z.string().describe('MINIMUM 8000+ CHARS for layer=2. Hard constraints. Each with full WHY: origin, type, impact, failure mode prevented.'),
        designDecisions: z.string().describe('MINIMUM 8000+ CHARS for layer=2. Decisions with rationale + rejected alternatives. Chosen + rejected + rationale + cost per decision.'),
        knownGaps: z.string().describe('MINIMUM 8000+ CHARS for layer=2. Bugs, audit findings. Each with impact, location, description, status.'),
        sourceLineage: z.string().describe('MINIMUM 8000+ CHARS for layer=2. Pattern attribution. Version introduced, problem solved, evolution, superseded by.'),
        fileInventory: z.string().describe('MINIMUM 8000+ CHARS for layer=2. File map. All files: path, lines, purpose, key exports.'),
      },
      execute: async (args: {
        targetPath?: string;
        requirements?: string;
        architecture?: string;
        patterns?: string[];
        failures?: string[];
        decisions?: string[];
        layer?: number | string;
        inputFile?: string;
        contextFiles?: string[];
        outputPath?: string;
        fileName?: string;
        outputName?: string;
        components: string;
        executiveSummary?: string;
        architectureOverview?: string;
        dataModel?: string;
        engineDesign?: string;
        defenseRules?: string[];
        blindSpots?: string;
        integrationPlan?: string;
        evidenceFormat?: string;
        testSpecs?: string;
        migrationStrategy?: string;
        engineSpecs?: string[];
        recursive?: boolean;
        domains?: Array<{ name: string; context: string; files?: string[] }>;
        domainsJson?: string;
        domainNames?: string[];
        domainContexts?: string[];
      }) => {
        // inputFile merge: read structured fields from JSON file BEFORE validation.
        // The function-calling payload limit truncates 68K+ inline args — L2's
        // mega-input can only arrive via file. File fields override inline args.
        if (args.inputFile) {
          try {
            const fileContent = fsSync.readFileSync(args.inputFile, 'utf-8');
            const fileFields = JSON.parse(fileContent);
            const MERGE_FIELDS = ['requirements', 'context', 'components', 'constraints', 'designDecisions', 'knownGaps', 'sourceLineage', 'fileInventory'];
            for (const f of MERGE_FIELDS) {
              if (typeof fileFields[f] === 'string' && fileFields[f].length > 0) {
                (args as Record<string, unknown>)[f] = fileFields[f];
              }
            }
            tridentLog('INFO', 'trident-deep-planning', `inputFile: merged fields from ${args.inputFile}`);
          } catch (fileErr: unknown) {
            return `INPUT FILE ERROR: could not read/parse ${args.inputFile}: ${fileErr instanceof Error ? fileErr.message : String(fileErr)}`;
          }
        }

        // Per-tool input validation — layer-conditional (L1 light, L2 full 84K, L3 domains)
        const dpValidationError = validateDeepPlanningInput(args as Record<string, unknown>);
        if (dpValidationError) return dpValidationError;

        // Validate targetPath if provided
        if (args.targetPath && !(await fileExists(args.targetPath))) {
          throw new Error('targetPath does not exist: ' + args.targetPath);
        }

        try {
          // Step 1: Layer determination — default to L1 (content generation).
          // L1 is the most common layer. L2/L3 require explicit layer=2 or layer=3.
          // LAYER IS REQUIRED — no default (operator mandate: the agent must
          // consciously choose which layer runs; a silent L1 default produced
          // the wrong artifact when the agent omitted the arg).
          if (args.layer === undefined || args.layer === null || args.layer === '') {
            return '❌ DP ARGUMENT VALIDATION FAILED:\n  - layer is REQUIRED (no default): pass 1 (Initial Plan), 2 (Detailed Workflow), or 3 (Context Library) explicitly. There is no auto-detect and no fallback — choose consciously.';
          }
          const layer = typeof args.layer === 'string' ? (parseInt(args.layer) || 0) : (typeof args.layer === 'number' ? args.layer : 0);
          if (layer !== 1 && layer !== 2 && layer !== 3) {
            return '❌ DP ARGUMENT VALIDATION FAILED:\n  - layer must be 1, 2, or 3. Received: ' + JSON.stringify(args.layer) + '. Choose consciously — 2 is the 3000+ line Detailed Workflow build spec.';
          }
          const layerNames: Record<number, string> = {
            1: 'INITIAL PROMPT',
            2: 'DETAILED WORKFLOW (Implementation Build Spec)',
            3: 'CONTEXT LIBRARY',
          };

          // Update orchestrator state non-blocking (startMode — no longer throws)
          try { orchestrator.startPlanning(); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); /* Non-fatal: orchestrator state update is best-effort; deep-planning continues regardless of state machine errors */ }
          const machineActor = interpret(deepPlanningMachine).start();
          const projectName = args.targetPath
            ? await resolveProjectName(args.targetPath)
            : (args.requirements?.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '-') || 'project');

          // Auto-discovery — only if targetPath is provided
          let discovery: DiscoveryResult | null = null;
          if (args.targetPath) {
            try {
              discovery = await discoverProject(args.targetPath);
              tridentLog('INFO', 'trident-deep-planning', `Auto-discovery: ${discovery.totalFiles} files, ${discovery.totalLines} lines, ${discovery.patterns.length} patterns, ${discovery.failureModes.length} failure modes, ${discovery.decisions.length} decisions`);
            } catch (e: unknown) {
              tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`);
              tridentLog('WARN', 'trident-deep-planning', `Auto-discovery failed (falling back to user input): ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          // Auto-generate requirements/architecture (from discovery in backward mode, from args in forward mode)
          const inputParams = args.requirements || (discovery
            ? `Auto-discovered project: ${discovery.totalFiles} files, ${discovery.totalLines} lines across ${Object.keys(discovery.languages).length} languages. Entry points: ${discovery.entryPoints.join(', ') || 'none detected'}. Languages: ${Object.entries(discovery.languages).map(([k, v]: [string, number]) => `${k} (${v} files)`).join(', ')}.`
            : 'No requirements specified.');

          const architecture = args.architecture || (discovery ? discovery.directoryTree : 'No architecture specified.');

          // Merge user-provided patterns with auto-discovered patterns
          const discoveryPatterns = discovery
            ? discovery.patterns.map((p: DiscoveredPattern) => `${p.name} (${p.type}) — ${p.file}:${p.line}`)
            : [];
          const mergedPatterns = [...(args.patterns || []), ...discoveryPatterns];

          // Merge user-provided failures with auto-discovered failure modes
          const discoveryFailures = discovery
            ? discovery.failureModes.map((f: DiscoveredFailure) => `${f.message} — ${f.file}:${f.line} [pattern: ${f.pattern}]`)
            : [];
          const mergedFailures = [...(args.failures || []), ...discoveryFailures];

          // Merge user-provided decisions with auto-discovered decisions
          const discoveryDecisions = discovery
            ? discovery.decisions.map((d: DiscoveredDecision) => `${d.rationale} — ${d.file}:${d.line}`)
            : [];
          const mergedDecisions = [...(args.decisions || []), ...discoveryDecisions];

          const targetPathForGen = args.targetPath || 'context-ingestion';

          // ═══ v4.4.2 L1 — CONTENT GENERATOR (<1000 lines, chat prompt) ═══
          // L1 takes requirements + contextFiles and generates content.
          // Can generate: build directives, context docs, subagent prompts,
          // behavior alignment, etc. Whatever the requirements specify.
          // Uses buildDesignBrief() — same data path as L2, shorter output.
          if (layer === 1) {
          try {
            tridentLog('INFO', 'trident-deep-planning', 'L1: Generating content from requirements + contextFiles');
            // Read contextFiles as reference material
            const l1SourceExtracts = args.contextFiles
              ? readSourceFiles(args.contextFiles)
              : new Map<string, string>();
            // If targetPath provided, read its source files as additional reference
            if (targetPathForGen && targetPathForGen !== 'context-ingestion') {
              const targetFiles = await collectSourceFiles(targetPathForGen);
              for (const tf of targetFiles.slice(0, 15)) {
                try {
                  const content = fsSync.readFileSync(tf, 'utf-8');
                  l1SourceExtracts.set(tf, content);
                } catch (e: unknown) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
              }
            }
            const l1Strategy = getDefaultStrategy();
            const l1Brief = buildL1ContentBrief(args, l1SourceExtracts, projectName);
            const L1_SYSTEM = 'You are an elite engineering planner. Generate a Layer 1 initial plan. ' +
              'Target 300-800 lines depending on task scope. Maximum 2200 lines. ' +
              'Flexible structure — output depends on requirements. ' +
              'Output ONLY the content. No preamble. No filler. Be PRECISE not CONCISE.\n\n' +
              'ANTI-HALLUCINATION RULES — ZERO TOLERANCE:\n' +
              '1. NEVER invent file names, script names, or component names. Use ONLY names from provided context.\n' +
              '2. NEVER invent architecture. If the context describes 7 gates, write about 7 — not 8.\n' +
              '3. NEVER idealize or improve the architecture. Document WHAT EXISTS, not what SHOULD exist.\n' +
              '4. If you lack context for a section, write CONTEXT NEEDED: [describe what is missing].\n' +
              '5. NEVER create fictional evidence, fictional mechanisms, or fabricated values.\n' +
              '6. The provided context is the source of truth. The requirements describe what to GENERATE.\n' +
              '7. If the requirements say "document what was built" — describe what was ACTUALLY built.';
            const l1Output = await runInternalLLMLoop(l1Brief, null, l1Strategy, {
              useSplit: false, maxIterations: 1, skipQualityChecks: true,
              systemOverride: L1_SYSTEM,
            });
            // TEST-PLAN-FIRST (v2.0 mandate): append the mandatory container test
            // plan section — planning defines the tests, tests define "done".
            // NOTE: the L1 scope variable is `inputParams` (requirements string),
            // NOT `requirements` — a ReferenceError here was silently caught and
            // the append silently skipped (the GATE-C verification bug).
            let l1FinalOutput = l1Output;
            try {
              const l1TestPlan = generateContainerTestPlanSection(inputParams + ' ' + (architecture || ''));
              l1FinalOutput = l1Output + '\n' + l1TestPlan;
              const l1TpError = validateEmbeddedTestPlan(l1FinalOutput);
              // INSTRUMENTATION (GATE-C verification): write a marker so we can
              // prove the append path executed in the deployed runtime.
              try {
                await fs.appendFile(path.join(os.tmpdir(), 'trident-l1-append-marker.txt'),
                  `APPENDED ${new Date().toISOString()} len=${l1TestPlan.length} err=${l1TpError || 'none'}\n`, 'utf-8');
              } catch (markerErr: unknown) { tridentLog('WARN', 'trident-tools', 'L1 append marker write failed: ' + (markerErr instanceof Error ? markerErr.message : String(markerErr))); }
              if (l1TpError) {
                tridentLog('WARN', 'trident-deep-planning', `L1 test plan validation: ${l1TpError}`);
              }
            } catch (l1TpErr: unknown) {
              tridentLog('WARN', 'trident-tools', `L1 test-plan wiring failed (non-fatal): ${l1TpErr instanceof Error ? l1TpErr.message : String(l1TpErr)}`);
              try {
                await fs.appendFile(path.join(os.tmpdir(), 'trident-l1-append-marker.txt'),
                  `THREW ${new Date().toISOString()} ${l1TpErr instanceof Error ? l1TpErr.message : String(l1TpErr)}\n`, 'utf-8');
              } catch (markerErr: unknown) { tridentLog('WARN', 'trident-tools', 'L1 throw marker write failed: ' + (markerErr instanceof Error ? markerErr.message : String(markerErr))); }
            }
            const l1Path = await writeArtifactFile('DP_L1_CONTENT', l1FinalOutput, args.outputPath, args.outputName, args.fileName);
            setPendingL1Path(l1Path);
            storeArtifacts({ 'layer': '1', 'layer-name': 'INITIAL PLAN', 'mode': 'LLM_GENERATED', 'artifact-path': l1Path });
            try { machineActor.send({ type: 'SUBMIT_LAYER1' }); orchestrator.completeLayer(); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
            const l1Lines = l1Output.split('\n').length;
            const l1Sha = crypto.createHash('sha256').update(l1Output).digest('hex').substring(0, 16);
            tridentLog('INFO', 'trident-deep-planning', `L1 COMPLETE: ${l1Lines} lines written to ${l1Path} (sha256: ${l1Sha})`);
            return JSON.stringify({
              status: 'L1_CONTENT_WRITTEN',
              path: l1Path,
              lines: l1Lines,
              sha256: l1Sha,
              preview: l1Output.split('\n').slice(0, 10).join('\n'),
              message: `L1 content (${l1Lines} lines) written directly to ${l1Path}. Do NOT rewrite, truncate, or summarize.`,
            }, null, 2);
          } catch (l1Err: unknown) {
            const l1Msg = l1Err instanceof Error ? l1Err.message : String(l1Err);
            tridentLog('ERROR', 'trident-deep-planning', `L1 FAILED: ${l1Msg}`);
            return `L1 GENERATION ERROR: ${l1Msg}`;
          }
          }

          // ═══ v4.4.2 L2 — DENSE ENGINEERING SPEC (3000+ lines, written to disk) ═══
          // L2 takes requirements + contextFiles and generates a dense engineering
          // spec for building a system from scratch. Like CME/Kronos reference specs.
          // Uses buildDesignBrief() — same data path as L1, longer/denser output.
          // NO analyzeProject. NO audit mode. Requirements + reference docs only.
          if (layer === 2) {
          try {
            tridentLog('INFO', 'trident-deep-planning', 'L2: Generating engineering spec from requirements + contextFiles');

            // ── STEP 1: GATHER REFERENCE MATERIAL ──
            const l2SourceExtracts = args.contextFiles
              ? readSourceFiles(args.contextFiles)
              : new Map<string, string>();
            // If targetPath provided, read its source files as additional reference
            if (targetPathForGen && targetPathForGen !== 'context-ingestion') {
              const targetFiles = await collectSourceFiles(targetPathForGen);
              for (const tf of targetFiles.slice(0, 15)) {
                try {
                  const content = fsSync.readFileSync(tf, 'utf-8');
                  l2SourceExtracts.set(tf, content);
                } catch (e: unknown) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
              }
              tridentLog('INFO', 'trident-deep-planning', `L2: Read ${targetFiles.length} reference files from targetPath`);
            }
            const l2HasSourceFiles = l2SourceExtracts.size > 0;
            const l2HasRequirements = !!args.requirements && args.requirements.length > 50;

            if (!l2HasSourceFiles && !l2HasRequirements) {
              throw new Error(
                'Insufficient Context. Provide:\n' +
                '  - requirements: Detailed description of the system to build\n' +
                '  - contextFiles: Reference docs/source files to synthesize into the spec\n' +
                '  - targetPath: Project to read as additional reference material',
              );
            }

            // ── STEP 2: DERIVE STRATEGY ──
            const l2Strategy = getDefaultStrategy();
            l2Strategy.references = REFERENCE_EXCERPTS;

            // ── STEP 3: BUILD BRIEF (always from requirements + reference docs) ──
            const l2Brief = buildDesignBrief(args, l2SourceExtracts, l2Strategy, projectName);

            tridentLog('INFO', 'trident-deep-planning',
              `L2 brief built: ${l2Brief.split('\n').length} lines — ` +
              `source files: ${l2SourceExtracts.size}, ` +
              `has requirements: ${l2HasRequirements}`);

            // ── STEP 4: INTERNAL LLM GENERATION LOOP ──
            // v2 (2026-08-02, 2-hour-bug fix): MAX_L2_ITERATIONS=1. The v1 loop
            // multiplied wall-clock: a gate failure triggered a FULL regeneration
            // round (3 sequential chunks × up to 6 LLM calls each) — 2+ hours on
            // the free tier. v2 generates ONCE (parallel chunks, ~30-40 min) and
            // the gates are WARN-ONLY: unmet demands are appended to the artifact
            // as a GENERATION DEMANDS block ("Block the CLAIM, not the WORK").
            // Transient LLM errors now fail fast instead of silently re-running
            // for hours — the operator's fail token is patience.
            const MAX_L2_ITERATIONS = 1;
            let generatedSpec = '';
            let lastFeedback = '';

            // ── L2 PREAMBLE CLEANUP (shared): strip leading LLM self-narration
            // lines before the first markdown heading. Models occasionally leak
            // lines like 'No file-write tool is available...' despite the
            // 'No preamble' instruction — mechanical hygiene for the artifact.
            const stripL2Preamble = (spec: string): string => {
              const lines = spec.split('\n');
              let firstHeading = -1;
              for (let i = 0; i < lines.length; i++) {
                if (/^#{1,3}\s+/.test(lines[i])) { firstHeading = i; break; }
              }
              if (firstHeading <= 0) return spec;
              const head = lines.slice(0, firstHeading).join('\n');
              if (/no file[- ]write tool|i (cannot|can't|don't|do not) have|i (cannot|can't) write|note:|as an ai|i'll (write|save|create)/i.test(head)) {
                tridentLog('WARN', 'trident-deep-planning', 'L2 preamble stripped (' + firstHeading + ' lines)');
                return lines.slice(firstHeading).join('\n');
              }
              return spec;
            };
            const L2_SYSTEM = 'You are an elite engineering spec writer. ' +
              'Generate a Layer 2 detailed implementation specification. ' +
              'Target 3000+ lines. NO MAXIMUM. 5000+ is normal for complex systems. ' +
              'You do NOT need a file-write tool: this call RETURNS TEXT and the caller writes the artifact. ' +
              'Never mention tools, limitations, or your environment in the output. ' +
'GENERATION CONTRACTS (CME-grade depth — a table row is NOT a method spec): ' +
'C1 every component/engine/action listed in any table MUST also have its own ### <Name> — <method> pseudocode subsection (50-100 lines per major method). ' +
'C2 every hook rewrite MUST include the FULL line-by-line function code inside a code fence. ' +
'C3 every change to an existing file MUST include an INSERTION-POINT mapping (file, function, before/after/inside which block, context). ' +
'C4 every changed state/init function MUST include the exact initialization diff. ' +
'C5 EVERY component MUST include an ASCII data-flow diagram. ' +
'C6 a component×component PEER INTERACTION TABLE is REQUIRED. ' +
'C7 test specs MUST include test-code pseudocode with concrete expect() calls. ' +
'C8 include a what-this-does-NOT-fix blind-spot subsection. ' +
'C9 the ## CONTAINER TEST PLAN section is embedded after the TOC in this document — never duplicate it, build against it. ' +
'C10 when writing the ## CONTAINER TEST PLAN content, use ONLY the 7-field scenario format (Feature under test / Prompt / Pass token / Fail token / Max wait / Evidence capture) with tool-result-bound pass tokens. ' +
              'Imposed section structure: Executive Summary, Architecture Overview, ' +
              'Component Design (each with full TypeScript interfaces, pseudocode algorithms, ' +
              'data flow, integration points, file paths, test specs), Data Model, ' +
              'Integration Plan, Test Specifications, Migration Strategy, Known Gaps. ' +
              'Full pseudocode blocks REQUIRED — tangible building blocks for build agents. ' +
              'Algorithm descriptions with step-by-step logic. Complete type definitions. ' +
              'Method signatures with parameters. Config objects with exact keys. ' +
              'Do NOT write complete method bodies — pseudocode building blocks only. ' +
              'Every file path must match FILE INVENTORY. Every config must match CONSTRAINTS. ' +
              'Unknown values: PROPOSED: [value]. NEVER fabricate from training data. ' +
              'LENGTH IS NEVER A CONCERN. DENSITY is the ONLY metric. Be PRECISE not CONCISE. ' +
              'Output ONLY the specification. No preamble.';

            for (let l2Iter = 1; l2Iter <= MAX_L2_ITERATIONS; l2Iter++) {
              tridentLog('INFO', 'trident-deep-planning',
                `L2 generation iteration ${l2Iter}/${MAX_L2_ITERATIONS}`);

              try {
                // CHUNKED GENERATION v2 (2-hour-bug fix): the v1 sequential loop
                // multiplied wall-clock — each chunk call is itself 1 call + up to
                // 5 continuations (continuationTarget), so 3 SEQUENTIAL chunks ran
                // up to 18 sequential LLM calls (~2-4h on the free tier), and a
                // gate failure regenerated ALL 3 chunks again (36 calls total).
                // v2:
                //   (1) PARALLEL generation — the 3 section ranges are standalone
                //       (the SYSTEM prompt fixes the structure numbering), so they
                //       run CONCURRENTLY via Promise.all; total time ≈ ONE chunk.
                //   (2) continuationTarget 2000 → 1300 per chunk (3×1300 = 3900 ≥
                //       the 3000-line gate, with margin for model shortfall).
                //   (3) gates are WARN-ONLY (single round): unmet demands are
                //       appended to the artifact and the best effort is SAVED.
                // Operator mandate: "the loop must not multiply the 45-60 min a
                // 3000-line L2 inherently takes."
                const L2_SECTION_RANGES = ['1-3', '4-6', '7-9'];
                const chunkBriefs = L2_SECTION_RANGES.map((range) =>
                  l2Brief + '\n\nSECTION RANGE: write ONLY sections ' + range +
                  ' of the spec structure (per the SYSTEM structure numbering). ' +
                  'This range is a STANDALONE chunk — do NOT reference or wait for ' +
                  'other ranges. Write every section of this range with FULL ' +
                  'engineering depth (pseudocode, interfaces, data flows, failure ' +
                  'modes, rationale). End your output when this range is complete.\n'
                );
                tridentLog('INFO', 'trident-deep-planning',
                  `L2 PARALLEL generating ${chunkBriefs.length} chunks (sections ${L2_SECTION_RANGES.join(', ')}, target 1300 lines each)`);
                const chunks = await Promise.all(chunkBriefs.map(brief =>
                  generateSpecViaLLM(brief, undefined, false, L2_SYSTEM, undefined, 1300)
                ));
                generatedSpec = chunks.map((c) => c.trim()).join('\n\n');
                tridentLog('INFO', 'trident-deep-planning',
                  `L2 PARALLEL chunks complete: ${generatedSpec.split('\n').length} lines total (${chunks.map((c, i) => `chunk${i + 1}:${c.split('\n').length}`).join(' ')})`);
              } catch (llmErr: unknown) {
                console.error(`[trident-deep-planning] L2 LLM generation failed on iteration ${l2Iter}: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`);
                if (l2Iter === MAX_L2_ITERATIONS) {
                  // v4.4.3 R10 FIX: preserve the original error context — the old
                  // throw replaced the caught error with a bare new Error, losing
                  // the cause chain. The original error is now carried as `cause`.
                  const l2RootErr = llmErr instanceof Error ? llmErr : new Error(String(llmErr));
                  const l2Wrapped = new Error(
                    `L2 generation failed after ${MAX_L2_ITERATIONS} iterations. ` +
                    `Last error: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`,
                    { cause: l2RootErr },
                  );
                  throw l2Wrapped;
                }
                continue;
              }

              generatedSpec = stripL2Preamble(generatedSpec);
              tridentLog('INFO', 'trident-deep-planning',
                `L2 iteration ${l2Iter}: LLM generated ${generatedSpec.split('\n').length} lines (post-preamble-strip)`);

              // ── GATES v2 (WARN-ONLY, single round — the 2-hour-bug fix) ──
              // v1 gates FAILED the iteration and triggered a FULL regeneration
              // round (3 sequential chunks × up to 6 LLM calls each) — 2+ hours
              // on the free tier. v2 collects every unmet demand into
              // unmetL2Demands and appends them to the artifact as a GENERATION
              // DEMANDS block (operator doctrine: "Block the CLAIM, not the
              // WORK" — the WORK is saved, the claim of gate-passing is blocked
              // loudly). Build agents MUST satisfy the demands. One generation
              // pass → guaranteed completion.
              const unmetL2Demands: string[] = [];

              // ── TOPIC ALIGNMENT GATE ──
              // Extract key terms from requirements, verify they appear in output.
              // Prevents topic drift (e.g., "warhead generation" → "memory lifecycle").
              if (args.requirements && args.requirements.length > 50) {
                const keyTerms = extractKeyTerms(args.requirements);
                const missingTerms = keyTerms.filter(term =>
                  !generatedSpec.toLowerCase().includes(term.toLowerCase())
                );
                if (missingTerms.length > 0) {
                  tridentLog('ERROR', 'trident-deep-planning',
                    `L2 TOPIC DRIFT: missing terms [${missingTerms.join(', ')}] — appending demand, saving best effort`);
                  unmetL2Demands.push(
                    'TOPIC ALIGNMENT: the spec is missing requirement key terms [' + missingTerms.join(', ') + ']. ' +
                    'Regenerate the affected sections with EXPLICIT focus on these terms. The requirements describe: "' +
                    args.requirements.substring(0, 200) + '..."',
                  );
                } else {
                  tridentLog('INFO', 'trident-deep-planning',
                    `L2 topic alignment PASSED: all ${keyTerms.length} key terms present`);
                }
              }

              // ── LINE COUNT GATE ──
              // L2 specs must be 3000+ lines (operator mandate — a 2320-line spec
              // passed the old 2000-line gate and missed the requirement).
              const L2_MIN_LINES = 3000;
              const currentLines = generatedSpec.split('\n').length;
              if (currentLines < L2_MIN_LINES) {
                // Identify thin sections by heading for the expansion work order
                const sectionLines: Array<{ heading: string; lines: number }> = [];
                const specLines = generatedSpec.split('\n');
                let curHeading = '(front matter)';
                let curCount = 0;
                for (const sl of specLines) {
                  if (/^#{1,3}\s+/.test(sl)) {
                    if (curCount > 0) sectionLines.push({ heading: curHeading, lines: curCount });
                    curHeading = sl.trim().substring(0, 80);
                    curCount = 0;
                  } else {
                    curCount++;
                  }
                }
                if (curCount > 0) sectionLines.push({ heading: curHeading, lines: curCount });
                const thinSections = sectionLines.filter(s => s.lines < 80);
                const thinList = thinSections.length > 0
                  ? thinSections.map(s => `  - "${s.heading}" (${s.lines} lines — needs full depth)`).join('\n')
                  : '  - ALL sections need more depth (no single thin section identified)';
                tridentLog('ERROR', 'trident-deep-planning',
                  `L2 LINE COUNT FAILURE: ${currentLines} lines < ${L2_MIN_LINES} minimum — appending demand, saving best effort`);
                unmetL2Demands.push(
                  `LINE COUNT: the spec is ${currentLines} lines; the operator mandate is ${L2_MIN_LINES}+. ` +
                  'SURGICALLY EXPAND the document — do NOT regenerate from scratch, keep ALL existing correct content. ' +
                  'These sections are thin and MUST be expanded to full engineering depth (full pseudocode or interfaces, ' +
                  'data flows, failure modes with root causes, design rationale with rejected alternatives, cross-references):\n' +
                  thinList + '\n' +
                  'Use the provided context fields (components, constraints, designDecisions, knownGaps, sourceLineage, ' +
                  'fileInventory) — they contain material NOT yet incorporated. Expand each component into its own ' +
                  'deep-dive subsection.',
                );
              } else {
                tridentLog('INFO', 'trident-deep-planning',
                  `L2 line count PASSED: ${currentLines} lines >= ${L2_MIN_LINES}`);
              }

              // ── STRUCTURAL GATE (container-testing skill contract: tables ≠ depth) ──
              // The 3000-line gate enforces VOLUME; this enforces STRUCTURE. The CME
              // reference depth comes from per-method pseudocode, line-by-line hook
              // code, insertion-point maps, init diffs, ASCII diagrams, peer tables,
              // and tool-result-bound test tokens.
              const specText = generatedSpec;
              const codeFences = (specText.match(/```/g) || []).length;
              const fenceBlocks = specText.split('```').filter((s, i) => i % 2 === 1).join('\n');
              const hasBoxDrawing = /[\u2500-\u257F]/.test(specText);
              const hasArrowFlow = /(-->|--->|⟶|=>)/.test(specText);
              const structuralChecks: Array<{ id: string; ok: boolean; demand: string }> = [
                { id: 'METHOD_DEPTH', ok: codeFences >= 12, demand: 'EVERY engine/method/action MUST have its own ### <Method> pseudocode subsection (50-100 lines). A table row is NOT a method spec. Expand every component with per-method code blocks.' },
                { id: 'INSERTION_POINTS', ok: /(insert (before|after)|inside (the )?(function|block|method)|at line \d+)/i.test(specText), demand: 'EVERY change to an existing file MUST map the exact insertion point (file, function, before/after/inside which block, surrounding context).' },
                { id: 'HOOK_CODE', ok: /(messages\.transform|tool\.execute\.before|system\.transform)/.test(fenceBlocks), demand: 'EVERY hook rewrite MUST include the FULL line-by-line function code inside a code fence — not a before/after table.' },
                { id: 'INIT_DIFF', ok: /(createSession|constructor|initialize|initState)\(/.test(fenceBlocks), demand: 'EVERY changed state/init function MUST include the exact initialization diff inside a code fence.' },
                { id: 'DATA_FLOW', ok: hasBoxDrawing || hasArrowFlow, demand: 'EVERY component MUST include an ASCII data-flow diagram.' },
                { id: 'PEER_TABLE', ok: /^\|\s*[A-Z][A-Z0-9_]{2,}\s*\|\s*[A-Z][A-Z0-9_]{2,}\s*\|/m.test(specText), demand: 'A component×component PEER INTERACTION TABLE is REQUIRED.' },
                { id: 'TEST_CODE', ok: /expect\(|assert\.|assert\(/.test(fenceBlocks), demand: 'Test specs MUST include test-code pseudocode with concrete expect() calls.' },
                { id: 'TEST_PLAN_COMPONENTS', ok: (() => {
                  // FIX (2026-08-02): componentsArg was referenced but NEVER
                  // declared — the structural gate threw a ReferenceError (TDZ)
                  // every time it ran. v1's line-gate `continue` masked it; the
                  // single-round v2 flow exposed it as a crash AFTER ~12min of
                  // parallel generation. Derive component names locally: parse
                  // "### <Name>" headings from args.components, fall back to
                  // the project name. The 0B test plan must name a real component.
                  const raw = typeof args.components === 'string'
                    ? args.components
                    : JSON.stringify(args.components ?? '');
                  const l2ComponentNames: string[] = [...raw.matchAll(/^###\s+([A-Za-z0-9_]+)/gm)].map(m => m[1]);
                  const l2CheckNames = l2ComponentNames.length > 0 ? l2ComponentNames : [projectName];
                  const plan = specText.split('## CONTAINER TEST PLAN')[1] || '';
                  return l2CheckNames.some(c => plan.includes(c));
                })(), demand: 'The ## CONTAINER TEST PLAN (0B) MUST reference the actual component names (not placeholders).' },
                { id: 'TEST_PLAN_TOKENS', ok: /Pass token:/.test(specText) && /Fail token:/.test(specText) && /Max wait:/.test(specText), demand: 'The ## CONTAINER TEST PLAN MUST use the 7-field scenario format: Feature under test / Prompt / Pass token / Fail token / Max wait / Evidence capture.' },
                { id: 'TEST_PLAN_ADVERSARIAL', ok: /## ADVERSARIAL/.test(specText) && /## TEST SCENARIOS/.test(specText) && /## PASS CRITERIA/.test(specText), demand: 'The ## CONTAINER TEST PLAN MUST include TEST SCENARIOS (5+), ADVERSARIAL (1+), EVIDENCE and PASS CRITERIA sections.' },
              ];
              const structuralMisses = structuralChecks.filter(c => !c.ok);
              if (structuralMisses.length > 0) {
                tridentLog('ERROR', 'trident-deep-planning',
                  `L2 STRUCTURAL GAP: ${structuralMisses.map(m => m.id).join(', ')} — appending demands, saving best effort`);
                unmetL2Demands.push(
                  'STRUCTURE: the spec lacks CME-grade structure. SURGICALLY EXPAND — do NOT regenerate from scratch, keep ALL existing correct content. MISSING ELEMENTS (fix EACH):\n' +
                  structuralMisses.map(m => `  - ${m.id}: ${m.demand}`).join('\n'),
                );
              } else {
                tridentLog('INFO', 'trident-deep-planning', 'L2 structural gate PASSED: all 10 checks ok');
              }

              // ── FINALIZE ROUND (single-round policy) ──
              if (unmetL2Demands.length > 0) {
                const demandBlock = '\n\n---\n\n## GENERATION DEMANDS (UNMET — single-round policy)\n' +
                  'This artifact was generated in ONE round; the v1 multi-round regeneration loop was removed because ' +
                  'it multiplied generation time 2-4x on slow models (observed 2+ hour runs). The following gate demands ' +
                  'were NOT met by the generated content. The build agent MUST satisfy every demand below when ' +
                  'implementing from this spec:\n\n' +
                  unmetL2Demands.map((d, i) => `${i + 1}. ${d}`).join('\n\n') + '\n';
                generatedSpec += demandBlock;
                tridentLog('ERROR', 'trident-deep-planning',
                  `L2 saved WITH ${unmetL2Demands.length} UNMET DEMAND(S) appended (${generatedSpec.split('\n').length} lines total)`);
              } else {
                tridentLog('INFO', 'trident-deep-planning',
                  `L2 ALL GATES PASSED in one round (${currentLines} lines)`);
              }

              // Single-round policy: no gate-triggered regeneration exists.
              // Break unconditionally — the loop body always completes once.
              break;
            }

            // ── STEP 5: FINALIZE AND WRITE ──
            let l2FinalDoc = generatedSpec; // No appendComplianceAndAppendix (no analysis data)
            // TEST-PLAN-FIRST (v2.0 mandate): append the exact scenario-level
            // container test plan — the definition of done for build agents.
            try {
              const l2TpComponents = [{ name: projectName, description: targetPathForGen || args.targetPath || '' }];
              const l2TpDefenses: string[] = [];
              l2FinalDoc = l2FinalDoc + '\n' + generateExactTestPlanSection(l2TpComponents, l2TpDefenses, (args.requirements || '') + ' ' + (args.architecture || ''));
              const l2TpError = validateEmbeddedTestPlan(l2FinalDoc);
              if (l2TpError) {
                tridentLog('WARN', 'trident-deep-planning', `L2 test plan validation: ${l2TpError}`);
              }
            } catch (l2TpErr: unknown) {
              tridentLog('WARN', 'trident-tools', `L2 test-plan wiring failed (non-fatal): ${l2TpErr instanceof Error ? l2TpErr.message : String(l2TpErr)}`);
            }
            let l2ArtifactPath: string;
            if (args.outputPath) {
              // outputPath contract:
              //   - outputPath + fileName → outputPath is a DIRECTORY; write fileName.md inside it
              //   - outputPath only + path exists as directory → semantic name inside (writeArtifactFile handles)
              //   - outputPath only + path is a file or doesn't exist → write literally to outputPath
              // Previously fileName was silently discarded when outputPath was set,
              // causing "GENERATED_ARTIFACTS" to become a FILE instead of a directory.
              try {
                if (args.fileName) {
                  await fs.mkdir(args.outputPath, { recursive: true });
                  l2ArtifactPath = path.join(args.outputPath, `${args.fileName.replace(/\.md$/i, '')}.md`);
                  await fs.writeFile(l2ArtifactPath, l2FinalDoc, 'utf-8');
                  tridentLog('INFO', 'trident-tools', `Artifact saved inside directory: ${l2ArtifactPath}`);
                } else {
                  const outDir = path.dirname(args.outputPath);
                  await fs.mkdir(outDir, { recursive: true });
                  // v2 (2026-08-06 — the CST1 dumb-bug fix): the outputPath is a DIRECTORY +
                  // the fileName → the artifact INSIDE the dir (mkdir + join). The v1 wrote
                  // the artifact AT the outputPath as the file path — REPLACING the
                  // GENERATED_ARTIFACTS directory entry (the dir became a file, the
                  // artifact lost its folder + its fileName).
                  const l2OutPath = args.fileName
                    ? path.join(args.outputPath, String(args.fileName).replace(/\.md$/i, '') + '.md')
                    : args.outputPath;
                  await fs.mkdir(path.dirname(l2OutPath), { recursive: true });
                  await fs.writeFile(l2OutPath, l2FinalDoc, 'utf-8');
                  l2ArtifactPath = args.outputPath;
                  tridentLog('INFO', 'trident-tools', `Artifact saved to user-specified path: ${l2ArtifactPath}`);
                }
              } catch (writeErr: unknown) {
                tridentLog('WARN', 'trident-tools', `Failed to write to outputPath ${args.outputPath}: ${writeErr instanceof Error ? writeErr.message : String(writeErr)} — falling back to default`);
                l2ArtifactPath = await writeArtifactFile('DP_L2_SPEC', l2FinalDoc, args.outputPath, args.outputName);
              }
            } else {
              l2ArtifactPath = await writeArtifactFile('DP_L2_SPEC', l2FinalDoc, args.outputPath, args.outputName);
            }

            storeArtifacts({
              'layer': '2',
              'layer-name': 'DETAILED WORKFLOW (LLM-GENERATED)',
              'output': l2FinalDoc,
              'mode': 'LLM_GENERATED',
              'quality': 'GOLD',
              'line-count': String(l2FinalDoc.split('\n').length),
            });

            try { machineActor.send({ type: 'SUBMIT_LAYER2', count: 10 }); orchestrator.completeLayer(); }
            catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }

            const l2Lines = l2FinalDoc.split('\n').length;
            const l2Tests = (l2FinalDoc.match(/expect\(/g) || []).length;
            const l2CodeBlocks = (l2FinalDoc.match(/```/g) || []).length / 2;

            tridentLog('INFO', 'trident-deep-planning',
              `L2 BUILD SPEC COMPLETE: ${l2Lines} lines — ` +
              `${(l2FinalDoc.match(/threat/gi) || []).length} threats, ${(l2FinalDoc.match(/defense|defend/gi) || []).length} defenses, ${l2Tests} test assertions`);

            return `L2 BUILD SPEC COMPLETE

Lines: ${l2Lines}
Quality: LLM-GENERATED from requirements + reference docs
Test assertions: ${l2Tests}
Code blocks: ${l2CodeBlocks}

📄 Artifact saved: ${l2ArtifactPath}`;
          } catch (l2Err: unknown) {
            const l2ErrMsg = l2Err instanceof Error ? l2Err.message : String(l2Err);
            const l2ErrStack = l2Err instanceof Error ? l2Err.stack : '';
            tridentLog('ERROR', 'trident-deep-planning', `L2 INTERNAL LOOP FAILED: ${l2ErrMsg}`);
            tridentLog('ERROR', 'trident-deep-planning', `L2 STACK: ${l2ErrStack}`);
            return `L2 GENERATION ERROR: ${l2ErrMsg}\n\nStack: ${l2ErrStack || 'no stack'}`;
          }
          }

          // ═══ v4.4.2 L3 CONTEXT LIBRARY — INTERNAL PARALLEL GENERATION ═══
          // L3 is a DIRECTED batch executor. The caller provides explicit domain
          // definitions (name + context + files). For each domain, L3 internally
          // calls the SAME brief builders and LLM functions as L2/L1, running
          // all domains in parallel via Promise.allSettled. Each file writes to
          // disk as its LLM call completes. No subagents. No agent cooperation.
          // No domains = HARD FAIL. L3 is ALWAYS directed.
          if (layer === 3) {
          try {
            // ── HARD GATE: domains are MANDATORY ──
            // Accept domains as: (1) objects array, (2) JSON string, (3) flat name+context arrays
            let l3Domains: Array<{ name: string; context: string; files?: string[] }> | undefined = Array.isArray(args.domains) ? args.domains as Array<{ name: string; context: string; files?: string[] }> : undefined;
            if ((!l3Domains || l3Domains.length === 0) && args.domainsJson) {
              try {
                l3Domains = JSON.parse(args.domainsJson) as Array<{ name: string; context: string; files?: string[] }>;
                tridentLog('INFO', 'trident-deep-planning', `L3: Parsed ${l3Domains.length} domains from domainsJson`);
              } catch (parseErr: unknown) {
                // v4.4.3 R10 FIX: log the original error before rethrowing — the
                // wrapped error keeps the JSON failure's context (cause) plus the
                // log trace (the R10 error-context-lost class correction).
                console.error(`[trident-deep-planning] L3 domainsJson parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
                const l3RootErr = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
                throw new Error(
                  `L3: Failed to parse domainsJson: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
                  { cause: l3RootErr },
                );
              }
            }
            if ((!l3Domains || l3Domains.length === 0) && args.domainNames && args.domainNames.length > 0) {
              const names = args.domainNames;
              const contexts = args.domainContexts || [];
              l3Domains = names.map((name, i) => ({
                name,
                context: contexts[i] || `Generate engineering spec for ${name}`,
              }));
              tridentLog('INFO', 'trident-deep-planning', `L3: Built ${l3Domains.length} domains from domainNames+domainContexts`);
            }
            if (!l3Domains || l3Domains.length === 0) {
              throw new Error(
                'L3 REQUIRES explicit domain definitions. Pass domainNames=["AUTH_ENGINE","RATE_LIMITER"] + domainContexts=["Design auth...","Design rate limiter..."]. ' +
                'L3 is ALWAYS directed — no autonomous fallback. No domains = no generation.'
              );
            }
            tridentLog('INFO', 'trident-deep-planning',
              `L3: ${l3Domains.length} directed domains: ${l3Domains.map(d => d.name).join(', ')}`);

            // ── Create output folder ──
            const libDir = args.outputPath || path.join(targetPathForGen, 'context-library');
            await fs.mkdir(libDir, { recursive: true });
            tridentLog('INFO', 'trident-deep-planning', `L3: Output folder: ${libDir}`);

            // ── Build ALL jobs: L2 specs (one per domain) + L1 index doc ──
            const jobs: Array<{
              name: string;
              type: 'L2' | 'L1';
              brief: string;
              useSplit: boolean;
              systemOverride?: string;
              fileName: string;
            }> = [];

            // L2 JOBS: one per domain — SAME brief builder as L2 tool
            for (let i = 0; i < l3Domains.length; i++) {
              const d = l3Domains[i];
              const domainFiles = (d.files || []).slice(0, 15);
              const sourceExtracts = domainFiles.length > 0
                ? readSourceFiles(domainFiles)
                : new Map<string, string>();

              // If targetPath provided and no domain files, add project source as reference
              if (targetPathForGen && targetPathForGen !== 'context-ingestion' && sourceExtracts.size === 0) {
                const targetFiles = await collectSourceFiles(targetPathForGen);
                for (const tf of targetFiles.slice(0, 10)) {
                  try {
                    const content = fsSync.readFileSync(tf, 'utf-8');
                    sourceExtracts.set(tf, content);
                  } catch (e: unknown) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
                }
              }

              // EXACT same brief builder as L2 uses
              const domainArgs = {
                ...args,
                requirements: d.context,
                contextFiles: domainFiles,
              };
              const strategy = getDefaultStrategy();
              const brief = buildDesignBrief(domainArgs, sourceExtracts, strategy, projectName);

              jobs.push({
                name: d.name,
                type: 'L2',
                brief,
                useSplit: false,  // single call per domain — parallel ACROSS domains, no front+back split
                systemOverride: undefined,  // default L2 anti-slop SYSTEM prompt
                fileName: `${String(i).padStart(2, '0')}_${d.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`,
              });
            }

            // L1 JOB: README/index doc — SAME brief builder as L1 tool
            const l1IndexArgs = {
              ...args,
              requirements: `Generate a README.md for a context library containing ${l3Domains.length} engine specs: ` +
                `${l3Domains.map(d => d.name).join(', ')}. Project: ${projectName}. ` +
                `Include: table of contents, cross-reference index, how to use this library, ` +
                `reading order, and a summary of each domain.`,
              context: `Domains in this library:\n${l3Domains.map(d => `- ${d.name}: ${d.context.substring(0, 200)}`).join('\n')}`,
            };
            const l1IndexExtracts = new Map<string, string>();
            const l1IndexBrief = buildL1ContentBrief(l1IndexArgs, l1IndexExtracts, projectName);
            const L3_L1_SYSTEM = 'You are an elite technical writer generating a README for an engineering context library. ' +
              'Write a comprehensive navigation document: table of contents, cross-reference index, reading order. ' +
              'Reference EVERY domain spec by its exact filename. Output ONLY markdown. 200-400 lines.';

            jobs.push({
              name: 'README',
              type: 'L1',
              brief: l1IndexBrief,
              useSplit: false,  // L1: single call, no split
              systemOverride: L3_L1_SYSTEM,
              fileName: 'README.md',
            });

            // ── EXECUTE ALL JOBS IN PARALLEL — write each file as it completes ──
            tridentLog('INFO', 'trident-deep-planning',
              `L3: Firing ${jobs.length} PARALLEL LLM generations (${jobs.filter(j => j.type === 'L2').length} L2 specs + ${jobs.filter(j => j.type === 'L1').length} L1 index)`);

            const results = await Promise.allSettled(
              jobs.map(async (job) => {
                try {
                  tridentLog('INFO', 'trident-deep-planning', `L3: [${job.name}] starting LLM call`);
                  const content = await generateSpecViaLLM(
                    job.brief,
                    undefined,
                    job.useSplit,
                    job.systemOverride,
                    true,  // skipDelete — sessions cleaned up in batch after all jobs complete
                  );
                  const lines = content.split('\n').length;
                  tridentLog('INFO', 'trident-deep-planning', `L3: [${job.name}] LLM returned ${lines} lines`);
                  // Write to disk IMMEDIATELY as this job completes
                  const filePath = path.join(libDir, job.fileName);
                  await fs.writeFile(filePath, content, 'utf-8');
                  tridentLog('INFO', 'trident-deep-planning', `L3: [${job.name}] DONE — ${lines} lines → ${filePath}`);
                  return { name: job.name, type: job.type, path: filePath, lines };
                } catch (e: unknown) {
                  tridentLog('ERROR', 'trident-deep-planning', `L3: [${job.name}] generation failed: ${e instanceof Error ? e.message : String(e)}`);
                  throw e;
                }
              })
            );

            // Batch cleanup — delete ALL sessions after all jobs complete
            await drainPendingSessions();

            // ── Collect results ──
            const specs: Array<{ name: string; type: string; path: string; lines: number; status: string }> = [];
            for (let i = 0; i < results.length; i++) {
              const r = results[i];
              if (r.status === 'fulfilled') {
                specs.push({ ...r.value, status: 'OK' });
              } else {
                const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
                tridentLog('ERROR', 'trident-deep-planning', `L3: [${jobs[i].name}] FAILED: ${errMsg}`);
                specs.push({ name: jobs[i].name, type: jobs[i].type, path: '', lines: 0, status: `FAILED: ${errMsg}` });
              }
            }

            // ── Deterministic MASTER_INDEX.md (no LLM) ──
            const okSpecs = specs.filter(s => s.status === 'OK');
            const totalLines = okSpecs.reduce((sum, s) => sum + s.lines, 0);
            let index = `# Context Library — ${projectName}\n\n`;
            index += `**Generated:** ${new Date().toISOString()}\n`;
            index += `**Domains:** ${okSpecs.length}/${specs.length} succeeded\n`;
            index += `**Total Lines:** ${totalLines}\n`;
            index += `**Location:** \`${libDir}\`\n\n`;
            index += `## Specs\n\n`;
            index += `| # | Domain | Type | Lines | Status | File |\n`;
            index += `|---|--------|------|-------|--------|------|\n`;
            for (let i = 0; i < specs.length; i++) {
              const s = specs[i];
              index += `| ${i} | ${s.name} | ${s.type} | ${s.lines} | ${s.status} | ${s.path ? `\`${path.basename(s.path)}\`` : '—'} |\n`;
            }
            const indexPath = path.join(libDir, 'MASTER_INDEX.md');
            await fs.writeFile(indexPath, index, 'utf-8');

            // ── Store artifacts + advance state machine ──
            const manifestArtifactPath = await writeArtifactFile('DP_L3_LIBRARY', index);
            storeArtifacts({ 'layer': '3', 'output': index, 'mode': 'INTERNAL_PARALLEL' });
            try { machineActor.send({ type: 'SUBMIT_LAYER3', content: index }); orchestrator.completeLayer(); }
            catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }

            tridentLog('INFO', 'trident-deep-planning',
              `L3 COMPLETE: ${okSpecs.length}/${specs.length} specs, ${totalLines} total lines, library at ${libDir}`);

            return `L3 CONTEXT LIBRARY COMPLETE

Domains: ${okSpecs.length}/${specs.length} succeeded
Total lines: ${totalLines}
Location: ${libDir}

Specs:
${specs.map(s => `  - ${s.name} [${s.type}]: ${s.lines} lines [${s.status}]`).join('\n')}

📄 Master Index: ${indexPath}
📄 Manifest: ${manifestArtifactPath}`;

          } catch (l3Err: unknown) {
            const l3Msg = l3Err instanceof Error ? l3Err.message : String(l3Err);
            tridentLog('ERROR', 'trident-deep-planning', `L3 FAILED: ${l3Msg}`);
            return `L3 GENERATION ERROR: ${l3Msg}`;
          }
          }

          // ====================================================================
          // CONTEXT FILE INGESTION — read external source files before generating
          // ====================================================================
          // When contextFiles is provided, the tool reads every file, extracts
          // TypeScript interfaces, classes, functions, and algorithms, and
          // returns a STRUCTURED BRIEF to the agent. The agent uses this brief
          // to write the full spec content, then calls the tool again with the
          // section parameters filled in.
          //
          // This is the TWO-CALL PATTERN:
          //   Call 1: contextFiles=[...], layer=2 -> returns brief (no artifact)
          //   Call 2: layer=2, dataModel="...", engineDesign="...", ... -> writes artifact
          //
          // Or SINGLE-CALL when the agent provides both contextFiles AND section content.
          let contextBrief: string | null = null;
          const hasSectionContent = args.executiveSummary || args.dataModel || args.engineDesign ||
                                    args.defenseRules || args.integrationPlan || args.testSpecs;
          if (args.contextFiles && args.contextFiles.length > 0 && !hasSectionContent) {
            // TWO-CALL PATTERN: First call — ingest context, return brief
            const fileContents: Array<{ path: string; content: string; lines: number }> = [];
            let totalLines = 0;
            for (const filePath of args.contextFiles) {
              try {
                const content = await fs.readFile(filePath, 'utf-8');
                const lineCount = content.split('\n').length;
                fileContents.push({ path: filePath, content, lines: lineCount });
                totalLines += lineCount;
              } catch (e: unknown) {
                tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`);
                tridentLog('WARN', 'trident-deep-planning', `Failed to read context file: ${filePath}`);
                continue;
              }
            }
            tridentLog('INFO', 'trident-deep-planning',
              `Context ingestion: ${fileContents.length}/${args.contextFiles.length} files read, ${totalLines} total lines`);

            contextBrief = generateContextBrief(fileContents, args.requirements || '', layer);

            // AUTO-GENERATE sections from brief + discovery data
            // The tool does BOTH phases in one call — no stopping halfway
            tridentLog('INFO', 'trident-deep-planning',
              `Context ingestion: ${fileContents.length}/${args.contextFiles.length} files read, ${totalLines} total lines. Auto-generating sections from brief data.`);

            // Auto-fill section content from discovery + brief data
            const disc = discovery;
            const fileCount = disc ? disc.totalFiles : fileContents.length;
            const lineCount = disc ? disc.totalLines : totalLines;
            const languages = disc ? Object.entries(disc.languages).map(function(e: [string, number]) { return e[0] + ' (' + e[1] + ' files)'; }).join(', ') : 'TypeScript';
            const entryPoints = disc ? disc.entryPoints.join(', ') : 'index.ts';
            const dirTree = disc ? disc.directoryTree : 'See context brief above';

            // Build auto-sections from real data
            if (!args.executiveSummary) (args as Record<string, unknown>).executiveSummary =
              '## Executive Summary\n\nThis build spec covers ' + (args.requirements || 'the specified requirements') +
              '.\n\nThe target project has ' + fileCount + ' files spanning ' + lineCount + ' lines across ' + languages + '. ' +
              'Entry points: ' + entryPoints + '. ' +
              (disc ? 'Auto-discovery found ' + disc.patterns.length + ' patterns, ' + disc.failureModes.length + ' failure modes, and ' + disc.decisions.length + ' design decisions.' : '') +
              '\n\nThe context brief above contains extracted interfaces, classes, functions, and algorithms from the provided source files. ' +
              'These form the foundation for the architecture, data model, and engine design sections below.';

            if (!args.architectureOverview) (args as Record<string, unknown>).architectureOverview =
              '## Architecture Overview\n\n' + dirTree + '\n\n' +
              'The project structure follows a modular architecture with clear separation of concerns. ' +
              'The context brief analysis reveals key architectural constructs that inform the build plan.';

            if (!args.dataModel) (args as Record<string, unknown>).dataModel =
              '## Data Model\n\nBased on AST extraction from the context brief:\n\n' +
              contextBrief.substring(0, 2000) +
              '\n\n*(Full interface and type definitions are in the context brief above)*';

            if (!args.engineDesign) (args as Record<string, unknown>).engineDesign =
              '## Engine Class Design\n\nThe engine integrates with the existing codebase through the patterns and constructs ' +
              'identified in the context brief. Key integration points are the discovered entry points and the ' +
              'module structure shown in the architecture overview.';

            if (!args.defenseRules || (Array.isArray(args.defenseRules) && args.defenseRules.length === 0)) (args as Record<string, unknown>).defenseRules =
              ['Validate all inputs at module boundaries',
               'Log all errors with context — never silently swallow',
               'Use discriminated unions for return types'];

            if (!args.blindSpots) (args as Record<string, unknown>).blindSpots =
              '## Blind Spots\n\n' +
              (disc && disc.failureModes.length > 0
                ? 'Known failure modes from discovery: ' + disc.failureModes.slice(0, 5).map(function(f: DiscoveredFailure) { return f.message + ' (' + f.file + ':' + f.line + ')'; }).join('; ')
                : 'No failure modes discovered. Manual review recommended for edge cases.') +
              '\n\nAreas requiring further investigation: performance characteristics under load, ' +
              'concurrent access patterns, and error recovery behavior.';

            if (!args.integrationPlan) (args as Record<string, unknown>).integrationPlan =
              '## Integration Plan\n\n' +
              '1. Implement core types and interfaces from the data model section\n' +
              '2. Build engine classes following the design above\n' +
              '3. Wire into existing entry points: ' + entryPoints + '\n' +
              '4. Add defense rules at module boundaries\n' +
              '5. Write tests covering each threat vector\n' +
              '6. Document migration path for existing consumers';

            if (!args.evidenceFormat) (args as Record<string, unknown>).evidenceFormat =
              '## Evidence Format\n\nAll claims must cite file:line evidence. ' +
              'Use format: [EVIDENCE: file.ts:NN showing observation]. ' +
              'Runtime behavior verified through container TUI testing per RUNTIME_BEHAVIOR_CONTAINER_TESTING_LAW.md.';

            if (!args.testSpecs) (args as Record<string, unknown>).testSpecs =
              '## Test Specifications\n\n' +
              '1. Unit tests for each new type and interface\n' +
              '2. Integration tests for engine class methods\n' +
              '3. Container TUI tests for runtime behavior verification\n' +
              (disc ? '4. Regression tests for discovered failure modes: ' + disc.failureModes.slice(0, 3).map(function(f: DiscoveredFailure) { return f.message; }).join(', ') : '4. Edge case tests for boundary conditions');

            if (!args.migrationStrategy) (args as Record<string, unknown>).migrationStrategy =
              '## Migration Strategy\n\n' +
              'Phase 1: Add new types and interfaces (non-breaking)\n' +
              'Phase 2: Implement engine classes behind feature flag\n' +
              'Phase 3: Wire into existing code paths\n' +
              'Phase 4: Remove feature flag and legacy code\n' +
              'Phase 5: Full deployment with monitoring';

            // Prepend brief to output so agent has full context
            tridentLog('INFO', 'trident-deep-planning', 'Auto-generated all 10 sections from brief data. Proceeding to artifact assembly.');
          }

          let output: string;
          let artifactPath: string | undefined;

          // Step 6: Assemble artifact from sections (Layer 1 auto-fill, Layer 2 explicit, Layer 3 context lib)
          if (layer === 1 || layer === 2) {
            // Validate required sections
            const requiredSections: Record<string, string | string[] | undefined> = {
              executiveSummary: args.executiveSummary,
              architectureOverview: args.architectureOverview,
              dataModel: args.dataModel,
              engineDesign: args.engineDesign,
              defenseRules: args.defenseRules,
              blindSpots: args.blindSpots,
              integrationPlan: args.integrationPlan,
              evidenceFormat: args.evidenceFormat,
              testSpecs: args.testSpecs,
              migrationStrategy: args.migrationStrategy,
            };
            const missing: string[] = [];
            for (const [name, value] of Object.entries(requiredSections)) {
              if (!value || (typeof value === 'string' && value.trim().length < 50) || (Array.isArray(value) && value.length === 0)) {
                missing.push(name);
              }
            }
            if (missing.length > 0) {
              throw new Error('Missing required sections: ' + missing.join(', ') + '. Generate content from the context brief and call again.');
            }

            const L2_ARTIFACT_MIN_LINES = 3000;
            output = generateLayer2DetailedWorkflow(
              targetPathForGen, projectName, inputParams, architecture, discovery,
              args.executiveSummary, args.architectureOverview, args.dataModel,
              args.engineDesign, args.defenseRules, args.blindSpots,
              args.integrationPlan, args.evidenceFormat, args.testSpecs, args.migrationStrategy,
            );
          } else {
            output = generateContextLibraryManifest(
              projectName, architecture, mergedPatterns, mergedFailures, mergedDecisions,
              targetPathForGen, discovery, args.recursive, args.engineSpecs,
            );
          }

          // ── L2 ARTIFACT LINE GATE (operator mandate 3000+) ──
          // The prompt demanded 3000+ but nothing enforced it — a 2320-line
          // spec shipped. Below target -> append the EXPANSION DEMAND with
          // thin-section work orders so the caller/next iteration expands.
          var l2ArtLines = output.split('\n').length;
          if (l2ArtLines < 3000) {
            tridentLog('WARN', 'trident-deep-planning', `L2 artifact ${l2ArtLines} lines < 3000 — expansion demand appended`);
            output = output + '\n\n## L2 LINE TARGET DEMAND\n' +
              `This spec is ${l2ArtLines} lines; the mandate is 3000+. ` +
              'Surgically EXPAND the thin sections below with full engineering detail ' +
              '(interfaces, pseudocode, data flows, test specs) until the target is met:\n' +
              '1. Expand every component design to full interface + algorithm + integration detail.\n' +
              '2. Expand the test specification tables with concrete inputs and expected outputs.\n' +
              '3. Expand the migration strategy and known gaps with exact file paths and schemas.\n';
          }
          artifactPath = await writeArtifactFile('DP_L2_SPEC', output);
          if (args.outputPath) {
            try {
              // v2 (2026-08-06 — the CST1 dumb-bug fix): outputPath = the DIRECTORY +
              // fileName = the artifact inside it (mkdir + join). v1 wrote the artifact
              // AT the outputPath as the file path — replacing the directory entry.
              const outPath = args.fileName
                ? path.join(args.outputPath, String(args.fileName).replace(/\.md$/i, '') + '.md')
                : args.outputPath;
              await fs.mkdir(path.dirname(outPath), { recursive: true });
              await fs.writeFile(outPath, output, 'utf-8');
              artifactPath = outPath;
              tridentLog('INFO', 'trident-deep-planning', `Artifact written to: ${outPath}`);
            } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
          }

          // State machine update
          try {
            if (layer === 2) {
              const discoveryPhases = discovery
                ? [discovery.patterns, discovery.failureModes, discovery.decisions, discovery.warheads, discovery.entryPoints, discovery.auditLayers]
                    .filter((arr: unknown[]) => arr.length > 0).length
                : 0;
              const componentsCount = Math.max(discoveryPhases, 5);
              machineActor.send({ type: 'SUBMIT_LAYER2', count: componentsCount });
            } else {
              machineActor.send({ type: 'SUBMIT_LAYER3', content: output });
            }
            orchestrator.completeLayer();
          } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); /* Non-fatal: state machine update is best-effort; artifact already persisted */ }

          // Store artifacts for orchestrator state
          storeArtifacts({
            'layer': String(layer),
            'layer-name': layerNames[layer],
            'output': output,
            ...(artifactPath ? { 'artifact-path': artifactPath } : {}),
            'mode': 'layer-' + layer,
            'auto-discovery': discovery ? JSON.stringify({
              totalFiles: discovery.totalFiles,
              totalLines: discovery.totalLines,
              patterns: discovery.patterns.length,
              failureModes: discovery.failureModes.length,
              decisions: discovery.decisions.length,
              warheads: discovery.warheads.length,
              entryPoints: discovery.entryPoints,
              languages: discovery.languages,
            }) : 'disabled',
          });

          const nextLayersMap: Record<number, number[]> = {
            1: [2, 3],
            2: [3],
            3: [],
          };

          const layerHints: Record<number, string> = {
            1: 'Layer 1 (Initial Prompt) complete. For L2 spec generation, call with layer=2 and contextFiles pointing to source files.',
            2: 'Layer 2 (Detailed Workflow) complete. For context library, call with layer=3.',
            3: 'Layer 3 (Context Library) complete. All deep-planning layers finished.',
          };

          return {
            layer,
            layerName: layerNames[layer],
            output,
            artifactPath: artifactPath || undefined,
            nextLayers: nextLayersMap[layer],
            hint: layerHints[layer],
          };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `PLAN-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-deep-planning', `[${errorId}] ${errMsg}`);
          return { error: 'Deep planning failed', errorId, message: (err instanceof Error ? err.message : String(err)) };
        }
      },
    }),

    'trident-problem-solving': tool({
      description: 'Run problem-solving loop: Triviality Gate -> Classify -> Define Done -> Gather Evidence -> Decide (with framework selection) -> Act (intent gate) -> Verify -> Report. Frameworks (Five Whys, Fault Tree, Systems Thinking, Pareto, First Principles, Hypothesis-Driven) are selectable tools within the Decide step, not mandatory stages. Produces outcome-first artifact with no layer scaffolding.',
      args: {
        targetPath: z.string().describe('Absolute path to the affected project'),
        outputPath: z.string().describe('MANDATORY: Absolute path where the diagnostic artifact must be written.'),
        outputName: z.string().optional().describe('Optional filename override. If omitted, auto-generated from first heading.'),
        problem: z.string().describe('MINIMUM 500+ CHARS. Problem statement — what is broken or wrong. Symptom + what breaks + expected vs actual.'),
        reasoning: z.array(z.string()).describe('Reasoning chain steps. Use "observation|hypothesis|evidence|conclusion" pipe format for best evidence output'),
        workingPlan: z.array(z.string()).describe('Working plan phases. Use "description|files|expected outcome|risk|rollback" pipe format for best recommendation output'),
        findings: z.array(z.string()).optional().describe('Findings discovered during investigation'),
        // v4.4.2 structured context — APPENDED AT END
        components: z.string().describe('MINIMUM 500+ CHARS. Affected components with file references.'),
        knownGaps: z.string().describe('MINIMUM 500+ CHARS. Known bugs related to this problem.'),
        context: z.string().describe('MINIMUM 2000+ CHARS. Session knowledge: what was tried, what was observed, relevant architecture.'),
      },
      execute: async (args: {
        targetPath: string;
        problem: string;
        reasoning: string[];
        workingPlan: string[];
        findings?: string[];
        outputPath: string;
        outputName?: string;
      }) => {
        if (!(await fileExists(args.targetPath))) {
          throw new Error('targetPath does not exist: ' + args.targetPath);
        }
        // Per-tool input validation — problem-solving specific rules
        const psValidationError = validateProblemSolvingInput(args as Record<string, unknown>);
        if (psValidationError) return psValidationError;
        try {
          orchestrator.startProblemSolving();

          // === LLM-POWERED PROBLEM SOLVING ===
          // Read actual source code, build brief, LLM generates comprehensive analysis.
          // Enriches findings with discovery data (patterns, failure modes) if available.
          const psSourceExtracts = new Map<string, string>();
          if (args.targetPath && args.targetPath !== 'context-ingestion') {
            const targetFiles = await collectSourceFiles(args.targetPath);
            for (const tf of targetFiles.slice(0, 15)) {
              try {
                const content = fsSync.readFileSync(tf, 'utf-8');
                psSourceExtracts.set(tf, content);
              } catch (e: unknown) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
            }
          }

          // Enrich findings with auto-discovery data
          let psDiscoveryFindings: string[] = args.findings || [];
          try {
            const psDiscovery = await discoverProject(args.targetPath || process.cwd());
            for (const pat of psDiscovery.patterns.slice(0, 20)) {
              psDiscoveryFindings.push(`${pat.type}: ${pat.name} at ${pat.file}:${pat.line}`);
            }
            for (const fail of psDiscovery.failureModes.slice(0, 10)) {
              psDiscoveryFindings.push(`FAILURE: ${fail.message} at ${fail.file}:${fail.line}`);
            }
          } catch (e: unknown) {
            tridentLog('WARN', 'trident-tools', `PS discovery failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
          }

          const psProjectName = args.targetPath ? await resolveProjectName(args.targetPath) : 'problem-analysis';

          const psBrief = buildProblemSolvingBrief(
            args.problem,
            psSourceExtracts,
            psDiscoveryFindings,
            args.reasoning || [],
            psProjectName,
          );

          const PS_SYSTEM = 'You are an elite diagnostic engineer. ' +
            'You solve problems by reading actual code, tracing root causes to specific file:line patterns, ' +
            'and producing comprehensive fix strategies with corrected code. ' +
            'You NEVER say "insufficient evidence" — the code is provided. Read it and analyze it. ' +
            'Every claim MUST cite file:line. Every fix MUST include the corrected code. ' +
            'Trace root causes by asking "why?" repeatedly until you reach the fundamental cause. ' +
            'Output ONLY the analysis. No preamble. No meta-commentary.';

          tridentLog('INFO', 'trident-problem-solving', `PS: Generating analysis from ${psSourceExtracts.size} source files`);

          const psOutput = await runInternalLLMLoop(psBrief, null, getDefaultStrategy(), {
            useSplit: false, maxIterations: 1, skipQualityChecks: true,
            systemOverride: PS_SYSTEM,
          });

          const mdPath = await writeArtifactFile('PROBLEM_SOLVING', psOutput, args.outputPath, args.outputName);
          storeArtifacts({
            'problem-solving-plan': psOutput,
            'artifact-path': mdPath,
            'mode': 'LLM_GENERATED',
          });

          tridentLog('INFO', 'trident-problem-solving', `PS COMPLETE: ${psOutput.split('\n').length} lines written to ${mdPath}`);
          return psOutput + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '');
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `PS-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-problem-solving', `[${errorId}] ${errMsg}`);
          return JSON.stringify({ error: 'Problem solving failed', errorId, message: (err instanceof Error ? err.message : String(err)) }, null, 2);
        }
      },
    }),

    'trident-context-synthesis': tool({
      description: 'Run CONTEXT_SYNTHESIS mode: 4-layer pipeline (Context Collection → Relevance Scoring → Compression → Injection Format). Validates output against ContextSynthesisModule requirements at each layer. outputMode=T1 (default) produces a lightweight injectable; outputMode=T2 produces a dense, bible-style standalone knowledge file written to disk.',
      args: {
        projectName: z.string().describe('Agent/project name (used for plugin path and agent config)'),
        config: z.record(z.string(), z.any()).optional().describe('opencode.json config object (model, provider, plugin, agent) — used in T1 mode'),
        patterns: z.array(z.string()).optional().describe('Patterns to embed in the injectable / knowledge file'),
        keyFacts: z.array(z.string()).describe('Critical facts the agent must know. MANDATORY — provide 3-10 key facts.'),
        sourcePath: z.string().optional().describe('Absolute path to the project root (used in T2 mode for architecture discovery)'),
        targetPaths: z.array(z.string()).optional().describe('File paths for trident_explore subagent dispatch (T2 mode only)'),
        targetPath: z.string().optional().describe('Single project-root path used for discovery and reference-file collection (mirrors sourcePath semantics).'),
        outputMode: z.enum(['T1', 'T2']).describe('T1=injectable config. T2=dense bible. NO DEFAULT — caller MUST specify.'),
        outputPath: z.string().describe('MANDATORY: Absolute directory path where the artifact .md file must be written.'),
        fileName: z.string().optional().describe('Output filename WITHOUT extension. Example: "T2_BIBLE" → writes T2_BIBLE.md'),
        outputName: z.string().optional().describe('Output filename override — passed through to writeArtifactFile as the outputName param.'),
        targetLines: z.number().min(100).max(16000).default(800).optional().describe('Target line count — default 800 (operator T1 band 300-800 / max 1200, clamped in the T1 branch).'),
        executiveSummary: z.string().optional().describe('TWO-CALL PATTERN: Call 1 (empty) returns a data brief. Call 2 (provide >100 chars for T1, >200 chars for T2) saves the LLM-written content as the artifact.'),
        inputFile: z.string().optional().describe('Path to a JSON file containing the structured fields (requirements, keyFacts, context, components, constraints, designDecisions, knownGaps, sourceLineage, fileInventory). REQUIRED for T2 when the function-calling payload limit or 2000-char read truncation prevents passing large fields inline. File fields override inline args. Same pattern as DP inputFile and SPG blocksFile.'),
        // v4.4.2 structured context — APPENDED AT END (mid-insert breaks SDK)
        components: z.string().describe('MINIMUM 1000+ CHARS for T2. Components to build. Name, purpose, file, interfaces.'),
        constraints: z.string().describe('MINIMUM 1000+ CHARS for T2. Hard constraints with WHY for each.'),
        designDecisions: z.string().describe('MINIMUM 1000+ CHARS for T2. Decisions with rationale + rejected alternatives.'),
        knownGaps: z.string().describe('MINIMUM 1000+ CHARS for T2. Bugs, audit findings, open issues with status.'),
        sourceLineage: z.string().describe('MINIMUM 1000+ CHARS for T2. Pattern attribution — where each pattern came from.'),
        fileInventory: z.string().describe('File map of the project.'),
        context: z.string().describe('MINIMUM 4000+ CHARS for T2. Full narrative context. PRIMARY source of truth — project state, architecture, decisions.'),
        requirements: z.string().describe('MINIMUM 500+ CHARS for T2. What to synthesize — purpose and scope of this knowledge file.'),
      },
      execute: async (args: {
        projectName: string;
        config?: Record<string, unknown>;
        patterns?: string[];
        keyFacts: string[];
        sourcePath?: string;
        targetPaths?: string[];
        targetPath?: string;
        outputMode: 'T1' | 'T2';
        outputPath: string;
        fileName?: string;
        outputName?: string;
        targetLines?: number;
        executiveSummary?: string;
        inputFile?: string;
        context: string;
        requirements: string;
        components: string;
        constraints: string;
        designDecisions: string;
        knownGaps: string;
        sourceLineage: string;
        fileInventory: string;
      }) => {
        // inputFile merge: read structured fields from JSON file BEFORE validation.
        // The 2000-char read truncation and payload limits make large T2 fields
        // impossible to pass inline. File fields override inline args.
        // Same pattern as DP inputFile and SPG blocksFile.
        if (args.inputFile) {
          try {
            const fileContent = fsSync.readFileSync(args.inputFile, 'utf-8');
            const fileFields = JSON.parse(fileContent);
            const CS_MERGE_STRINGS = ['requirements', 'context', 'components', 'constraints', 'designDecisions', 'knownGaps', 'sourceLineage', 'fileInventory', 'outputMode', 'projectName'];
            for (const f of CS_MERGE_STRINGS) {
              if (typeof fileFields[f] === 'string' && fileFields[f].length > 0) {
                (args as Record<string, unknown>)[f] = fileFields[f];
              }
            }
            if (Array.isArray(fileFields.keyFacts) && fileFields.keyFacts.length > 0) {
              (args as Record<string, unknown>).keyFacts = fileFields.keyFacts;
            }
            tridentLog('INFO', 'trident-context-synthesis', `inputFile: merged fields from ${args.inputFile}`);
          } catch (fileErr: unknown) {
            return `INPUT FILE ERROR: could not read/parse ${args.inputFile}: ${fileErr instanceof Error ? fileErr.message : String(fileErr)}`;
          }
        }

        // Per-tool input validation — mode-conditional (T1 light, T2 dense grounding)
        const csValidationError = validateContextSynthesisInput(args as Record<string, unknown>);
        if (csValidationError) return csValidationError;
        // Validate sourcePath if provided
        if (args.sourcePath && !(await fileExists(args.sourcePath))) {
          throw new Error('sourcePath does not exist: ' + args.sourcePath);
        }
        try {
          orchestrator.startContextSynthesis();
          const csMachineActor = interpret(contextSynthesisMachine).start();

          // Detect T1 vs T2 from requirements text (keyFacts + patterns + projectName) AND outputMode parameter
          // If requirements text contains "T2", "knowledge file", or "bible" → force T2
          // If requirements text contains "T1", "injectable", or "config" → force T1
          // Otherwise, use the outputMode parameter as-is
          const detectionText = [
            args.projectName,
            ...(args.keyFacts || []),
            ...(args.patterns || []),
          ].join(' ');
          const mode = detectContextSynthesisLayer(detectionText, args.outputMode || 'T1');

          // Run discovery for BOTH T1 and T2 — T1 needs project intelligence too
          let discovery: DiscoveryResult | null = null;
          if (args.targetPath) {
            try {
              discovery = await discoverProject(args.targetPath);
              tridentLog('INFO', 'trident-context-synthesis', `Discovery: ${discovery.totalFiles} files, ${discovery.patterns.length} patterns, ${discovery.failureModes.length} failures`);
            } catch (e: unknown) {
              tridentLog('WARN', 'trident-context-synthesis', `Discovery failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          if (mode === 'T2') {
            // ═══ v4.4.2 T2 INTERNAL LLM GENERATION ═══
            // T2 produces a Knowledge Transfer Bible — compaction-proof context synthesis.
            // NO appendComplianceAndAppendix — that's L2-specific. T2 has its own closing format.
            try {
              tridentLog('INFO', 'trident-context-synthesis', 'T2: Internal LLM generation (bible format)');
              // Read reference material from targetPath and contextFiles
              const t2SourceExtracts = new Map<string, string>();
              if (args.targetPath) {
                const t2Files = await collectSourceFiles(args.targetPath);
                for (const tf of t2Files.slice(0, 15)) {
                  try { t2SourceExtracts.set(tf, fsSync.readFileSync(tf, 'utf-8')); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
                }
              }
              if (args.targetPaths) {
                for (const tf of args.targetPaths) {
                  try { t2SourceExtracts.set(tf, fsSync.readFileSync(tf, 'utf-8')); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
                }
              }
              const t2Brief = buildBibleBrief(args, t2SourceExtracts, args.projectName);
              const CS_T2_SYSTEM = 'You are an elite knowledge synthesizer. Generate a comprehensive T2 knowledge bible. ' +
                'Target 3000+ lines. Document EVERYTHING: architecture, decisions, bugs, fixes, constraints, file inventory. ' +
                'Every fact grounded in provided context — NEVER fabricate from training data. ' +
                'Reach density by EXPANDING provided facts: every component gets a full analytical deep-dive — purpose, mechanism, data flow, failure modes, rationale, cross-references to other provided facts. Synthesize; never copy-paste input text. ' +
                'FORBIDDEN inventions: interface definitions not verbatim in context, error formats not in context, directory paths not in context, test evidence not described in context (if context does not describe a test, it DID NOT HAPPEN), versions/SHAs/line-counts not in context. ' +
                'Unknown facts: CONTEXT NEEDED: [what is missing]. ' +
                'Include Myth vs Reality section, decision registry, bug catalog, iron laws, compaction recovery guide. ' +
                'Be PRECISE not CONCISE. DENSITY is the ONLY metric.';
              const t2RawOutput = await generateBibleViaLLM(t2Brief, CS_T2_SYSTEM);

              // ── GROUNDING AUDIT — mechanical fabrication detection ──
              // Compares bible claims against input context. Invented interfaces
              // and evidence claims are rewritten in place. Count is reported.
              const t2SourceContext = [
                args.context, args.components, args.constraints, args.designDecisions,
                args.knownGaps, args.sourceLineage, args.fileInventory, args.requirements,
                ...(args.keyFacts || []),
              ].filter((x): x is string => typeof x === 'string').join('\n');
              const groundingAudit = auditBibleGrounding(t2RawOutput, t2SourceContext);
              const t2Output = groundingAudit.output;
              if (groundingAudit.fabricationsFound > 0) {
                tridentLog('WARN', 'trident-context-synthesis',
                  `GROUNDING AUDIT: ${groundingAudit.fabricationsFound} fabrications rewritten: ${groundingAudit.details.slice(0, 5).join('; ')}`);
              }

              // MANDATORY: Verify compaction-proof marking exists
              // The entire point of T2 is compaction-proof context synthesis
              if (!/compaction.proof|compaction-proof/i.test(t2Output)) {
                tridentLog('WARN', 'trident-context-synthesis',
                  'T2: Missing compaction-proof marking — appending mandatory footer');
                // Append the mandatory compaction-proof closing if the LLM didn't include it
                const compactionFooter = `\n\n---\n\n## THE FINAL WORD\n\n` +
                  `This document is **compaction-proof** — read it after context loss.\n` +
                  `Every rule was earned by regression. Every decision is documented.\n` +
                  `No excuse for regression. This bible IS the system knowledge.\n\n` +
                  `*END OF ${args.projectName.toUpperCase()} BIBLE*`;
                const t2FinalDoc = t2Output + compactionFooter;
                const t2Path = await writeArtifactFile('CS_T2_KNOWLEDGE', t2FinalDoc, args.outputPath, args.outputName);
                storeArtifacts({ 'output': t2FinalDoc, 'mode': 'LLM_GENERATED' });
                try { csMachineActor.send({ type: 'FORMAT', sections: [t2FinalDoc] }); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
                tridentLog('INFO', 'trident-context-synthesis', `T2 COMPLETE: ${t2FinalDoc.split('\n').length} lines (compaction footer appended, ${groundingAudit.fabricationsFound} fabrications audited)`);
                return `T2 KNOWLEDGE BIBLE COMPLETE\n\nLines: ${t2FinalDoc.split('\n').length}\nCompaction-proof: YES (footer appended)\nGrounding audit: ${groundingAudit.fabricationsFound} fabrications rewritten\n\n📄 Artifact saved: ${t2Path}`;
              }

              // Compaction-proof marking present — save as-is
              const t2Path = await writeArtifactFile('CS_T2_KNOWLEDGE', t2Output, args.outputPath, args.outputName);
              storeArtifacts({ 'output': t2Output, 'mode': 'LLM_GENERATED' });
              try { csMachineActor.send({ type: 'FORMAT', sections: [t2Output] }); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
              tridentLog('INFO', 'trident-context-synthesis', `T2 COMPLETE: ${t2Output.split('\n').length} lines (compaction-proof verified, ${groundingAudit.fabricationsFound} fabrications audited)`);
              return `T2 KNOWLEDGE BIBLE COMPLETE\n\nLines: ${t2Output.split('\n').length}\nCompaction-proof: VERIFIED\nGrounding audit: ${groundingAudit.fabricationsFound} fabrications rewritten\n\n📄 Artifact saved: ${t2Path}`;
            } catch (t2Err: unknown) {
              const t2Msg = t2Err instanceof Error ? t2Err.message : String(t2Err);
              tridentLog('ERROR', 'trident-context-synthesis', `T2 FAILED: ${t2Msg}`);
              return `T2 GENERATION ERROR: ${t2Msg}`;
            }
          }

          // ═══ v4.4.2 T1 INTERNAL LLM GENERATION ═══
          {
            try {
              tridentLog('INFO', 'trident-context-synthesis', 'T1: Internal LLM generation');
              // Read reference material
              const t1SourceExtracts = new Map<string, string>();
              if (args.targetPath) {
                const t1Files = await collectSourceFiles(args.targetPath);
                for (const tf of t1Files.slice(0, 10)) {
                  try { t1SourceExtracts.set(tf, fsSync.readFileSync(tf, 'utf-8')); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
                }
              }
              if (args.targetPaths) {
                for (const tf of args.targetPaths) {
                  try { t1SourceExtracts.set(tf, fsSync.readFileSync(tf, 'utf-8')); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
                }
              }
              const t1Strategy = getDefaultStrategy();
              // T4: T1 target band — operator's line-count law. Clamped [300, 1200], default 800.
              const t1TargetLines = Math.min(1200, Math.max(300, args.targetLines ?? 800));
              const CS_T1_SYSTEM = 'You are an elite context synthesizer. Generate a T1 injectable. ' +
                `Target ${t1TargetLines} lines (operator's line-count band: TARGET 300-800, MAX 1200). ` +
                'COMPACT but COMPLETE — every essential fact, decision, bug. ' +
                'Dense reference material readable in under 2 minutes. No filler. No prose. ' +
                'Maximum signal density. DENSITY is the only metric. Do NOT pad with whitespace — pad with CONTENT.';
              const t1Brief = buildT1InjectableBrief(args, t1SourceExtracts, args.projectName || 'agent');
              let t1Output = await runInternalLLMLoop(t1Brief, null, t1Strategy, {
                useSplit: false, maxIterations: 1, skipQualityChecks: true, systemOverride: CS_T1_SYSTEM,
              });
              let t1Lines = t1Output.split('\n').length;

              // T4 LINE-STANDARD ENFORCEMENT (LINE-COUNT, not token-count).
              // Floor: ONE bounded expansion pass if under 300 (single-round policy — never a loop).
              if (t1Lines < 300) {
                tridentLog('WARN', 'trident-context-synthesis',
                  `T1 UNDER-DELIVERED: ${t1Lines} lines < 300 floor — running ONE bounded expansion pass`);
                const t1ExpansionBrief = t1Brief + '\n\n---\n\n## CURRENT T1 OUTPUT\n\n' +
                  t1Output + '\n\n---\n\n## EXPANSION REQUIRED\n\n' +
                  `EXPANSION REQUIRED: the T1 is ${t1Lines} lines; the operator's floor is 300. ` +
                  'SURGICALLY EXPAND every thin section to full engineering depth — interfaces, pseudocode, data flows, failure modes, evidence, rollback. ' +
                  'Output the COMPLETE expanded T1.';
                const t1Expanded = await runInternalLLMLoop(t1ExpansionBrief, null, t1Strategy, {
                  useSplit: false, maxIterations: 1, skipQualityChecks: true, systemOverride: CS_T1_SYSTEM,
                });
                const t1ExpandedLines = t1Expanded.split('\n').length;
                t1Output = t1ExpandedLines >= t1Lines ? t1Expanded : t1Output;
                t1Lines = Math.max(t1Lines, t1ExpandedLines);
                tridentLog('INFO', 'trident-context-synthesis',
                  t1ExpandedLines >= 300
                    ? `T1 expansion pass: ${t1ExpandedLines} lines (>= 300 floor)`
                    : `T1 STILL UNDER FLOOR after expansion pass: ${t1ExpandedLines} lines — keeping best effort`);
              }

              // T4 FRONTMATTER: every T1 opens with the TRIPLE DUTY header + trigger line (if absent).
              if (!/TRIPLE DUTY:/.test(t1Output)) {
                const reqFirstLine = (args.requirements && args.requirements.trim().length > 0)
                  ? args.requirements.trim().split('\n')[0].trim()
                  : '';
                const t1Trigger = (reqFirstLine.length > 0 && reqFirstLine.length <= 160)
                  ? reqFirstLine
                  : `When the agent needs orientation for ${args.projectName || 'agent'} — read this file fully before operating.`;
                const t1Frontmatter = `# [T1: ${args.projectName || 'agent'}] — TRIPLE DUTY: ORIENTING\n` +
                  `**Trigger:** ${t1Trigger} — **Duty:** ORIENTING (tooling/context orientation). **One-shot operational protocol. Read fully. Then operate.**\n`;
                t1Output = t1Frontmatter + t1Output;
                t1Lines = t1Output.split('\n').length;
              }

              // Ceiling: MAX 1200 — truncate gracefully, frontmatter preserved (it leads the doc).
              if (t1Lines > 1200) {
                const t1RawLines = t1Lines;
                t1Output = t1Output.split('\n').slice(0, 1200).join('\n') +
                  `\n-- truncated at the 1200-line max (was ${t1RawLines} lines)`;
                t1Lines = t1Output.split('\n').length;
                tridentLog('WARN', 'trident-context-synthesis', `T1 OVER 1200 MAX: truncated ${t1RawLines} -> ${t1Lines} lines`);
              }

              const t1Path = await writeArtifactFile('CS_T1_INJECTABLE', t1Output, args.outputPath, args.outputName);
              storeArtifacts({ 'output': t1Output, 'mode': 'LLM_GENERATED' });
              try { csMachineActor.send({ type: 'COLLECT', context: t1Output }); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
              tridentLog('INFO', 'trident-context-synthesis', `T1 COMPLETE: ${t1Lines} lines (target ${t1TargetLines}, band 300-800 / max 1200)`);
              return `T1 INJECTABLE COMPLETE\n\nLines: ${t1Lines}\nTarget: ${t1TargetLines}\n\n📄 Artifact saved: ${t1Path}`;
            } catch (t1Err: unknown) {
              const t1Msg = t1Err instanceof Error ? t1Err.message : String(t1Err);
              tridentLog('ERROR', 'trident-context-synthesis', `T1 FAILED: ${t1Msg}`);
              return `T1 GENERATION ERROR: ${t1Msg}`;
            }
          }

        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `CS-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-context-synthesis', `[${errorId}] ${errMsg}`);
          return JSON.stringify({ error: 'Context synthesis failed', errorId, message: (err instanceof Error ? err.message : String(err)) }, null, 2);
        }
      },
    }),

    'trident-poseidon': tridentPoseidonTool,

    'trident-gate': tool({
      description: 'Evaluate a specific audit layer or get gate criteria for a layer',
      args: {
        action: z.enum(['evaluate', 'criteria']).describe('evaluate=run layer, criteria=show what layer checks'),
        layer: z.enum(['R0', 'R1', 'R2', 'R3', 'R2', 'R5', 'R6', 'R7', 'R3', 'R9', 'R10', 'R11', 'R12', 'R2', 'R14', 'R15', 'R16']).describe('Audit layer to evaluate'),
        targetPath: z.string().optional().describe('Project path (required for evaluate)'),
      },
      execute: async (args: {
        action: 'evaluate' | 'criteria';
        layer: string;
        targetPath?: string;
      }) => {
        if (args.action === 'criteria') {
          const layerDescriptions: Record<string, string> = {
            R0: 'Build Chain Integrity — validates esbuild --bundle, --platform=node, build:check script',
            R1: 'Hook API Contract — validates input.agent, output.system, correct opencode 1.14.34 API',
            R2: 'State Machine Completeness — traces advanceLayer() calls, dead transitions',
            R3: 'Async Correctness — detects fire-and-forget, unhandled promises',
            R2: 'Error Handling — catches empty catch blocks, swallowed errors',
            R5: 'Container Deployment — validates binary, config, plugin paths for container',
            R6: 'Dependency Integrity — checks require in ESM, missing imports, .ts extensions',
            R7: 'Config Schema — validates opencode.json structure (model, provider, agent, plugin)',
            R3: 'Source Hygiene — detects dead exports, typos, duplicates',
            R9: 'Runtime Contract — catches key mismatches, hardcoded paths, type violations',
            R10: 'Invocation Integrity — finds defined-but-never-called enforcement functions',
            R11: 'Theatrical Integrity — detects () => true stubs, paper tiger enforcement',
            R12: 'Cross-Plugin Isolation — finds hooks without agent guards',
            R2: 'Data Flow Analysis — detects any→specific type flow, unvalidated→sensitive paths',
            R14: 'Control Flow Graph — finds dead error handlers, unreachable code, missing returns in catch',
            R15: 'Container Preflight — validates env vars, paths, bundle integrity',
            R16: 'Bible Enforcement — P1-P11 mechanical checks (defensive imports, type certainty, error completeness, etc.)',
          };
          return JSON.stringify({
            layer: args.layer,
            description: layerDescriptions[args.layer] || 'Unknown layer',
          }, null, 2);
        }

        if (!args.targetPath) {
          return JSON.stringify({ error: 'targetPath required for evaluate action' });
        }

        if (!(await fileExists(args.targetPath))) {
          return JSON.stringify({ error: 'targetPath does not exist', path: args.targetPath });
        }

        try {
          const engine = new AuditEngine();
          const result = await engine.auditSingleLayer(args.targetPath, args.layer);
          const gateFindings = result.findings;
          const corrections = new Set(gateFindings.map((f: AuditFinding) => f.correction || ''));
          const sharedCorrection = corrections.size === 1 ? Array.from(corrections)[0] : null;
          const compactFindings = gateFindings.map((f: AuditFinding) => ({
            file: f.file, line: f.line, severity: f.severity, category: f.category,
            description: f.description,
            evidence: typeof f.evidence === 'string' ? f.evidence.substring(0, 80) : f.evidence,
            confidence: f.confidence,
          }));
          return JSON.stringify({
            layer: args.layer,
            findingsCount: gateFindings.length,
            severityBreakdown: {
              critical: gateFindings.filter((f: AuditFinding) => f.severity === 'CRITICAL').length,
              high: gateFindings.filter((f: AuditFinding) => f.severity === 'HIGH').length,
              medium: gateFindings.filter((f: AuditFinding) => f.severity === 'MEDIUM').length,
              low: gateFindings.filter((f: AuditFinding) => f.severity === 'LOW').length,
            },
            sharedCorrection: sharedCorrection,
            topFindings: compactFindings.slice(0, 15),
            remainingCount: Math.max(0, compactFindings.length - 15),
            overallScore: result.score,
            grade: result.grade,
          }, null, 2);
        } catch (err: unknown) {
          // FINDING #2 FIX: Log error to file instead of silent catch
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `GATE-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-gate', `[${errorId}] ${errMsg}`);
          return JSON.stringify({ error: (err instanceof Error ? err.message : String(err)), errorId });
        }
      },
    }),

    'trident-status': tool({
      description: 'Show current Trident Agent state: mode, layer, iteration, status, artifact metadata',
      args: {},
      execute: async () => {
        const state = orchestrator.getState();
        const artifactMeta: Record<string, { length: number; preview: string }> = {};
        for (const [key, value] of state.artifacts) {
          artifactMeta[key] = {
            length: value.length,
            preview: value.substring(0, 120),
          };
        }
        return JSON.stringify({
          mode: state.mode,
          currentLayer: state.currentLayer,
          maxLayers: orchestrator.getMaxLayers(),
          iteration: state.iteration,
          status: state.status,
          initialized: state.initialized,
          identityLoaded: state.identityLoaded,
          artifactCount: state.artifacts.size,
          artifactKeys: Array.from(state.artifacts.keys()),
          artifactMetadata: artifactMeta,
          lastIntent: state.lastIntent ? {
            mode: state.lastIntent.mode,
            reasoning: state.lastIntent.reasoning,
          } : null,
          corePrinciple: orchestrator.getCorePrinciple(),
        }, null, 2);
      },
    }),

    'trident-help': tool({
      description: 'Show Trident Agent help: modes, commands, 17-layer audit engine, artifacts',
      args: {},
      execute: async () => {
        return `## TRIDENT — Runtime Grade Audit Engine

**CORE PRINCIPLE:** "Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."

**MODE-BASED TOOLS (with pipeline validation):**
| Tool | Mode | Pipeline Layers | Artifacts |
|------|------|-----------------|-----------|
| trident-code-audit | CODE_REVIEW | 3 stages (preflight → R0-R16 → artifact) | Code review report |
| trident-deep-planning | DEEP_PLANNING | 3 layers (L1 first-principles → L2 workflow → L3 context-lib) | Build Spec + Context Library |
| trident-problem-solving | PROBLEM_SOLVING | Problem solving loop (triviality→classify→done→evidence→decide→act→verify→report) | Outcome-first result |
| trident-context-synthesis | CONTEXT_SYNTHESIS | 4 layers (collect→score→compress→inject) | T1 Injectable (outputMode=T1) / T2 Knowledge File (outputMode=T2) |

**SUPPORTING TOOLS:**
| Tool | Purpose |
|------|---------|
| trident-gate | Evaluate/query specific audit layers (R0-R16) |
| trident-status | Show current mode, layer, artifacts (machine-parseable JSON) |
| zai-vision_* / visual-cortex_* | VISION | MCP-based image analysis (replaces trident-vision) |
| trident-help | This reference |

**17-LAYER AUDIT ENGINE (inside CODE_REVIEW):**
| Layer | Name | What It Catches |
|-------|------|-----------------|
| R0 | Build Chain | tsc vs esbuild, missing --bundle |
| R1 | Hook Contract | Wrong input.agent, output.message.content |
| R2 | State Machine | Missing advanceLayer(), dead transitions |
| R3 | Async | Fire-and-forget, unhandled promises |
| R2 | Error Handling | Empty catch, swallowed errors |
| R5 | Container Deploy | Wrong binary, missing config |
| R6 | Dependencies | require() in ESM, .ts imports |
| R7 | Config Schema | opencode.json structure errors |
| R3 | Source Hygiene | Dead exports, typos |
| R9 | Runtime Contract | Key mismatches, hardcoded paths |
| R10 | Invocation | Defined-but-never-called functions |
| R11 | Theatrical | () => true stubs, paper tigers |
| R12 | Cross-Plugin | Hooks without agent guards |
| R2 | Data Flow Analysis | any→specific, unvalidated→sensitive paths |
| R14 | Control Flow Graph | Dead error handlers, unreachable paths |
| R15 | Container Pre-flight | Env vars, paths, bundle integrity |
| R16 | Bible Enforcement | P1-P11 mechanical checks |

**MODE MODULES (wired into tools):**
- DeepPlanningModule: validates 3-layer output quality
- ProblemSolvingModule: validates 6-layer reasoning + iteration tracking
- ContextSynthesisModule: validates 4-layer compression + injection`;
      },
    }),

    'trident-omni-vision': createOmniVisionTool(client as OpencodeClient),
    'trident-container-test': createContainerTestTool(),
    'trident-ship-package': createShipPackageTool(),
    'trident-preflight': createPreflightTool(),
    // THE WAVE GENERATOR (the WAVE_DISPATCH_OVERHAUL_SPEC Part 25.1 — the ONLY
    // subagent dispatch path — the wave MANAGER (the generate + the resume — the
    // aether pipeline → the prompt files → the BATCH FORM / the RESUME BATCH
    // FORM; the orchestrator dispatches the returned batch — the tool NEVER
    // spawns). THE SINGLE TOOL — the legacy generator/dispatch names are NOT
    // registered (the operator's mandate: ONE wave manager tool):
    // THE WATCH INSTRUMENT (Part 23 — the orchestrator's control surface):
    // THE STEERING SURFACE (2026-08-12 — the orchestration overhaul): send any
    // prompt into an EXISTING subagent session (the resume channel cloned + the
    // input mechanism modified; queue by default, interrupt conditional):
    // THE PHASE-0 PROBE TOOL (Part 8/18 — the temporary load-bearing verifications):
    // THE BUG-HUNTER MACHINE (the W7 registration — the merge port from the
    // v4.4.3 payload): the bug-hunt entry (K7.1 — the S2 container scenario's
    // tool) + the 7-verb query surface (K5.1 — the awareness surface for ALL
    // agents). spec §5.2:2367-2374.
    // THE GRAPH LOGIC PRIMARY (Wave T — D-20260830-11): 'trident-graph-logic' is the
    // primary operator-facing tool for the graph-logic phase (src/audit-engine/graph-logic-phase.ts
    // — L6 traversal + L7 verified tracing). It invokes createBugHuntTool — the grounded
    // findings pipeline's first-class phase. The old alias REMOVED (D-20260830-11:
    // primary surface is ONE name; NO aliases on the primary). 'trident-bug-hunter-hunt'
    // stays as the bug-hunter SUBAGENT surface (B1 frozen).
    // DUAL-TOOL WORKFLOW: Step 1 run Graph Logic (trident-graph-logic) to populate the
    // typed code graph + produce findings; Step 2 run trident-code-audit with the findings
    // report + graph context feeding its precision (R24 findings-feed consumes the hunt runId).
    'trident-graph-logic': createBugHuntTool(),
    'trident-bug-hunter-hunt': createBugHuntTool(),
    'trident-bug-hunter-query': createBugHunterQueryTool(),
    // THE AUDITOR + THE WRITER TOOLS (the W9 registration-gap fix 2026-08-12 —
    // the §5.2 mandate's 5-tool surface COMPLETED: trident-audit + fix-apply
    // were granted in the agent configs but UNREACHABLE without these entries —
    // the S6 container scenario's tools; the report-writer = the regeneration
    // surface). The recon's 2-of-5 finding closed.
    'trident-auditor-audit': createAuditTool(),
    'trident-auditor-fix-apply': createFixApplyTool(),
    'trident-bug-hunter-report-writer': createReportWriterTool(),
    // THE BUILD-DONE PRODUCER (2026-08-13 — the S6 registration gap, CONFIRMED
    // in the suite container: the agent observed "build-done is not a registered
    // tool in my current toolset" — the §5.5 step-4 seam (the build agent's fix
    // applications → the implementations rows + the BUILD_DONE event) was
    // exported but NEVER registered in the platform tool map. The audit loop's
    // BUILD_DONE → AUDIT_DONE chain could not start through the tool surface.
    // THE FIX: the registration completes the auditor's 5-tool surface
    // (trident-audit + fix-apply + build-done + report-writer + the query).
    'trident-auditor-build-done': createBuildDoneTool(),
    // THE TASK-PREFLIGHT TOOL REMOVED (2026-08-08 — the operator: "we should
    // remove the TASK PREFLIGHT (not the args preflight) tool now that wave
    // generator exists it is redundant and leads to confusion"). The module
    // (trident-task-preflight.ts) REMAINS — it exports the SHARED MACHINERY
    // (validateAgentSpec, mechanicallyRepair, extractTemplateSkeleton, etc.)
    // the aether backend consumes. Only the TOOL registration is gone.
    // THE WAVE-DISPATCH → WAVE-GENERATOR ALIAS (2026-08-07 — the rename: the
    // tool is GENERATOR-ONLY, the old "dispatch" name confused agents into
    // believing it spawned; the old name resolves to the new tool for one
    // release with a WARN, then removed):
    // THE SINGLE TOOL (2026-08-11 — the operator's mandate: ONE wave manager
    // tool — the legacy dispatch alias REMOVED, not registered):
  };
}
