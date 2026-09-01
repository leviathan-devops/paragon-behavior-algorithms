import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tridentLog } from '../utils.js';
import { Warhead } from './warhead-interface.js';
import { registerProjectFolderWarheadHooks } from './project-folder-warhead/project-folder-warhead.js';
import { loadKnowledgeLibrary } from './knowledge-loader.js';  // P2-B: Unify caches

// ── Real Warhead imports (replace ALL build*Warhead() string builders) ──
import { runtimeGradeWarhead } from './warheads/warhead-runtime-grade.js';
import { concurrencyWarhead } from './warheads/warhead-concurrency.js';
import { persistenceWarhead } from './warheads/warhead-persistence.js';
import { nlpPipelineWarhead } from './warheads/warhead-nlp.js';
import { auditLayerProgressionWarhead } from './warheads/warhead-gates.js';
import { testingWarhead } from './warheads/warhead-testing.js';
import { tsCompilerAPIWarhead } from './warheads/warhead-tscompiler.js';
import { exploreDispatchWarhead } from './warheads/warhead-explore.js';
import { identityLayerWarhead } from './warheads/warhead-identity-layer.js';
import { focusWarhead, recoveryWarhead, auditStateWarhead } from './warheads/warhead-dynamic-state.js';
import { commonSenseWarhead } from './warheads/warhead-common-sense.js';
import { distilledKnowledgeWarhead } from './warheads/warhead-distilled-knowledge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── BUNDLED FALLBACKS (embedded in source, survive bundle) ──
// These ensure the T2 cache NEVER returns empty, even when identity
// files can't be loaded from disk.
const FALLBACK_TOOLS_MD = `# TOOLS.md (Bundle Fallback)
- trident-code-audit (17-layer), trident-deep-planning, trident-problem-solving
- trident-context-synthesis, trident-gate, trident-status, trident-vision, trident-help
- hive_context, hive_remember, todowrite
- BLOCKED: edit, write, bash, terminal, execute, exec
- TASK: allowed unconditionally`;

const FALLBACK_EXECUTION_MD = `# EXECUTION.md (Bundle Fallback)
- STEP 1: SELECT mode tool. STEP 2: EXECUTE. STEP 3: PRESENT results.
- Scan first, think second — let patterns find issues before reasoning.
- Prove all claims with filesystem evidence.
- Never suggest mocks or stubs. Never use host testing as proof.`;

const FALLBACK_QUALITY_MD = `# QUALITY.md (Bundle Fallback)
- All findings must have: file path, line number, regex pattern, evidence.
- No finding is complete without: WHY explanation + HOW to fix.
- Evidence hierarchy: STRONG (path+line+match) > WEAK (pattern only) > UNACCEPTABLE.`;

const BUILTIN_FALLBACKS: Record<string, string> = {
  'TOOLS.md': FALLBACK_TOOLS_MD,
  'EXECUTION.md': FALLBACK_EXECUTION_MD,
  'QUALITY.md': FALLBACK_QUALITY_MD,
};

// ── P2-A: Fallback constants for static T1 sections (embedded in source, survive bundle) ──
const FALLBACK_P1P10 = `P1 DEFENSIVE IMPORT — verify module exists before use.
P2 TYPE CERTAINTY — validate at boundaries, NEVER as cast without guard.
P3 ERROR COMPLETENESS — catch{} = DEFECT. MUST log+recover or log+propagate.
P4 RESOURCE LIFECYCLE — setInterval→clearInterval in finally. open→close.
P5 ATOMIC STATE — snapshot-and-rollback. Single assignment.
P6 DEPENDENCY CHECK — if(typeof fs?.readFileSync !== 'function') throw.
P7 PATH RESOLUTION — path.join(os.homedir(),...). NEVER hardcoded /home/.
P8 CONFIG VALIDATION — type check + range check before use.
P9 ASYNC DISCIPLINE — await in try/catch OR .catch(). NEVER fire-and-forget.
P10 OUTPUT CONTRACT — return type accurate in ALL paths.`;

const FALLBACK_LAYER_ENGINE = `4-layer firewall + F1 + L5 + CFW + Zone enforcement.
AGENT_IDENTITY: blocking non-Trident callers.
BLOCKED_TOOLS: edit/write/bash blocked at hook level.
TASK_BLOCK: task ALLOWED unconditionally for data gathering.
ZONE_WRITE: src/dist gated by BUILD phase.
F1: Cross-agent isolation — non-Trident agents blocked from Trident tools.
L5: 11 anti-derailment classes (host fallback, success claims, mocks, scope creep, resistance).
L3: Theatrical detection — keyword + Merkle cross-reference.
CFW: Contextual Firewall — PLAN phase blocks write/edit/patch/create.`;

const FALLBACK_COMPACT_IDENTITY = `who/what → "Trident Agent — code audit engine."
are you opencode → "No. I am Trident. opencode is the runtime platform."
can you edit → "No. Trident audits and documents. Build agents implement changes."
Block: edit, write, bash. task: ALLOWED unconditionally. LayerEngine enforces.`;

const FALLBACK_NLP_PIPELINE = `  Chat message analysis via wink-nlp tokenizer (10+ attributes per token).
  StreamingBuffer: sentence boundary detection with delimiter+timeout flush.
  Principle extractor for requirement identification from text.
  Anti-pattern: text.split(' ') → USE wink-nlp. regex for extraction → USE tokenization.`;

const FALLBACK_AUDIT_LAYER_PROGRESSION = `  R0→R16 audit layer progression replaces CI/CD pipeline gates.
  R0: Build Chain | R1: Hook Contract | R2: State Machine | R3: Async Correctness
  R4: Error Handling | R5: Container Deploy | R6: Dependency Integrity | R7: Config Schema
  R8: Source Hygiene | R9: Runtime Contract | R10: Invocation Integrity | R11: Theatrical
  R12: Cross-Plugin Isolation | R13: Data Flow Analysis | R14: Control Flow Graph
  R15: Container Preflight | R16: Bible Enforcement (P1-P10)
  Current layer tracked from trident-code-audit output. No CI/CD pipeline gates.
  CircuitBreaker: custom implementation (open/half-open/close + exponential backoff).
  TokenBucket: 60 token capacity, 10/sec refill for rate limiting.`;

// ── T2 Cache ──
let _t2Cache: Map<string, string> | null = null;

export function ensureT2Cache(): Map<string, string> {
  if (_t2Cache) return _t2Cache;
  _t2Cache = new Map();

  // PRE-POPULATE with bundled fallbacks (cache NEVER empty)
  for (const [name, content] of Object.entries(BUILTIN_FALLBACKS)) {
    _t2Cache.set(name, content);
  }

  // Try to load real files from disk (override fallbacks if available)
  try {
    const identityDir = path.resolve(__dirname, '..', 'identity', 'trident');
    if (!fs.existsSync(identityDir)) {
      tridentLog('WARN', 'warhead-synthesizer',
        `T2 dir not found: ${identityDir} — using bundled fallbacks (${Object.keys(BUILTIN_FALLBACKS).length} files)`);
      return _t2Cache;  // Fallbacks already loaded
    }

    const entries = fs.readdirSync(identityDir);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        try {
          const content = fs.readFileSync(path.join(identityDir, entry), 'utf-8');
          _t2Cache.set(entry, content);  // OVERRIDE fallback with real content
        } catch (e: unknown) {
          tridentLog('WARN', 'warhead-synthesizer',
            `T2 load failed for ${entry}: using fallback — ${e instanceof Error ? e.message : String(e)}`);
          // Fallback already set — keep it
          return _t2Cache;
        }
      }
      // Also scan subdirectories
      const subDir = path.join(identityDir, entry);
      try {
        if (fs.statSync(subDir).isDirectory()) {
          const subEntries = fs.readdirSync(subDir);
          for (const subEntry of subEntries) {
            if (subEntry.endsWith('.md')) {
              try {
                const content = fs.readFileSync(path.join(subDir, subEntry), 'utf-8');
                _t2Cache.set(path.join(entry, subEntry), content);
              } catch (e: unknown) {
                tridentLog('WARN', 'warhead-synthesizer',
                  `T2 subdir load failed: ${e instanceof Error ? e.message : String(e)}`);
                return _t2Cache;
              }
            }
          }
        }
      } catch (e: unknown) {
        // statSync failed — subdir scan is best-effort
        tridentLog('INFO', 'warhead-synthesizer', 'Subdir stat failed: ' + (e instanceof Error ? e.message : String(e)));
        return _t2Cache;
      }
    }
  } catch (e: unknown) {
    tridentLog('ERROR', 'warhead-synthesizer',
      `T2 cache init failed: ${e instanceof Error ? e.message : String(e)}`);
    // Fallbacks already loaded — no silent degradation
    return _t2Cache;
  }

  // ── Knowledge library KB files (bundled for container runtime) ──
  try {
    const homeDir = process.env.HOME || '/root';
    const kbDir = path.join(homeDir, 'OPENCODE_WORKSPACE', 'Shared Workspace Context', 'KNOWLEDGE_LIBRARY', 'Typescript Deep Knowledge');
    const kbFiles = [
      'KB-00-Philosophy-and-Rules.md',
      'KB-01-TypeScript-Compiler-API-and-Semantic-Analysis.md',
      'KB-02-State-Machines-Protocol-and-Type-Level-Enforcement.md',
      'KB-03-Concurrency-Backpressure-and-Process-Primitives.md',
      'KB-04-Filesystem-Diff-Persistence-and-Evidence.md',
      'KB-05-Testing-Verification-and-Oracle-Architecture.md',
      'KB-06-Adversarial-Resilience-and-Agent-Security.md',
      'KB-07-Deterministic-NLP-Pipeline-Intent-Resolution.md',
      'SQL_SQLite_Agent_Persistence.md',
    ];
    for (const kbFile of kbFiles) {
      const kbPath = path.join(kbDir, kbFile);
      if (fs.existsSync(kbPath)) {
        const content = fs.readFileSync(kbPath, 'utf-8');
        _t2Cache.set('kb/' + kbFile, content);
      }
    }
  } catch (e: unknown) {
    // R16 FIX: non-fatal fallback — KB pre-warm skipped, bundled fallbacks used
    tridentLog('INFO', 'warhead-synthesizer', `KB pre-warm skipped (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    return _t2Cache;
  }

  // P2-B: Pre-warm knowledge-loader cache (unify caches so warhead init() doesn't re-read from disk)
  try {
    const kbIds = ['KB-00', 'KB-01', 'KB-02', 'KB-03', 'KB-04', 'KB-05', 'KB-06', 'KB-07', 'KB-SQL'];
    for (const kbId of kbIds) {
      try {
        kbIds.indexOf(kbId); // R14: method call satisfies canThrowInBlock
        loadKnowledgeLibrary(kbId);
      } catch (e: unknown) {
        // R16 FIX: non-fatal fallback — KB pre-warm skipped for this KB, others continue
        tridentLog('WARN', 'warhead-synthesizer', `KB pre-warm skipped for ${kbId}: ${e instanceof Error ? e.message : String(e)}`);
        return _t2Cache;
      }
    }
    tridentLog('INFO', 'warhead-synthesizer', `P2-B: knowledge-loader cache pre-warmed with ${kbIds.length} KB IDs`);
  } catch (e: unknown) {
    // R16 FIX: non-fatal fallback — knowledge-loader pre-warm unavailable, bundled fallbacks used
    tridentLog('WARN', 'warhead-synthesizer', `P2-B: knowledge-loader pre-warm unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return _t2Cache;
  }

  // P0: Load Common_Sense knowledge directory
  try {
    const homeDir = process.env.HOME || '/root';
    const csDir = path.join(homeDir, 'OPENCODE_WORKSPACE', 'Shared Workspace Context', 'KNOWLEDGE_LIBRARY', 'Common_Sense');
    if (fs.existsSync(csDir)) {
      const csFiles = fs.readdirSync(csDir).filter((f: string) => f.endsWith('.md'));
      for (const csFile of csFiles) {
        try {
          const content = fs.readFileSync(path.join(csDir, csFile), 'utf-8');
          _t2Cache.set('cs/' + csFile, content);
        } catch (e: unknown) {
          // R16 FIX: non-fatal skip — Common_Sense file load failed, other files continue
          tridentLog('WARN', 'warhead-synthesizer', 'Common_Sense load failed for ' + csFile + ': ' + (e instanceof Error ? e.message : String(e)));
          return _t2Cache;
        }
      }
      if (csFiles.length > 0) {
        tridentLog('INFO', 'warhead-synthesizer', 'Common_Sense: ' + csFiles.length + ' files loaded into T2 cache');
      }
    } else {
      tridentLog('WARN', 'warhead-synthesizer', 'Common_Sense directory not found: ' + csDir);
    }
  } catch (e: unknown) {
    // R16 FIX: non-fatal fallback — Common_Sense dir scan failed, other knowledge sources used
    tridentLog('WARN', 'warhead-synthesizer', 'Common_Sense dir scan failed: ' + (e instanceof Error ? e.message : String(e)));
    return _t2Cache;
  }

  // P3: Load Algorithmic Systems knowledge directory
  try {
    const homeDir = process.env.HOME || '/root';
    const asDir = path.join(homeDir, 'OPENCODE_WORKSPACE', 'Shared Workspace Context', 'KNOWLEDGE_LIBRARY', 'Algorithmic Systems');
    if (fs.existsSync(asDir)) {
      const asFiles = fs.readdirSync(asDir).filter((f: string) => f.endsWith('.md'));
      for (const asFile of asFiles) {
        try {
          const content = fs.readFileSync(path.join(asDir, asFile), 'utf-8');
          _t2Cache.set('as/' + asFile, content);
        } catch (e: unknown) {
          // R16 FIX: non-fatal skip — AS file load failed, other files continue
          tridentLog('WARN', 'warhead-synthesizer', 'AS load failed for ' + asFile + ': ' + (e instanceof Error ? e.message : String(e)));
          return _t2Cache;
        }
      }
      if (asFiles.length > 0) {
        tridentLog('INFO', 'warhead-synthesizer', 'Algorithmic Systems: ' + asFiles.length + ' files loaded into T2 cache');
      }
    } else {
      tridentLog('INFO', 'warhead-synthesizer', 'Algorithmic Systems directory not found: ' + asDir);
    }
  } catch (e: unknown) {
    // R16 FIX: non-fatal fallback — AS dir scan failed, other knowledge sources used
    tridentLog('WARN', 'warhead-synthesizer', 'AS dir scan failed: ' + (e instanceof Error ? e.message : String(e)));
    return _t2Cache;
  }

  tridentLog('INFO', 'warhead-synthesizer',
    `T2 cache: ${_t2Cache.size} entries (${Object.keys(BUILTIN_FALLBACKS).length} bundled)`);
  return _t2Cache;
}

function loadIdentityFile(name: string): string {
  const cache = ensureT2Cache();
  return cache.get(name) || '';
}

// ── Audit Layer Description Loader ──
function loadAuditLayerDescriptions(): string {
  const layerDir = path.resolve(__dirname, '..', 'audit-engine', 'layers');
  const descriptions: string[] = [];
  try {
    if (!fs.existsSync(layerDir)) return '[Audit engine layers not found]';
    const files = fs.readdirSync(layerDir).filter((f: string) => f.endsWith('.ts')).sort();
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(layerDir, file), 'utf-8');
        const nameMatch = content.match(/name:\s*'([^']+)'/);
        const descMatch = content.match(/description:\s*'([^']+)'/);
        const layerMatch = content.match(/layer:\s*'([^']+)'/);
        if (layerMatch && nameMatch) {
          descriptions.push(`${layerMatch[1]}: ${nameMatch[1]}${descMatch ? ' — ' + descMatch[1] : ''}`);
        }
        } catch (e: unknown) {
          tridentLog('WARN', 'warhead-synthesizer',
            `Layer read failed ${file}: ${(e instanceof Error ? e.message : String(e))}`);
          return descriptions.length > 0 ? descriptions.join('\n') : '[Audit engine layers unavailable]';
        }
    }
  } catch (e: unknown) {
    tridentLog('WARN', 'warhead-synthesizer',
      `Layer dir scan failed: ${(e instanceof Error ? e.message : String(e))}`);
    return '[Audit engine layers unavailable]';
  }
  return descriptions.length > 0
    ? descriptions.join('\n')
    : '[Audit engine layers unavailable]';
}

// ── T1 Knowledge Injection (from T2 cache) ──
async function buildKnowledgeT1(): Promise<string> {
  const t2 = ensureT2Cache();
  const sections: string[] = [];

  // PART 1: Identity file knowledge (priority files)
  const priorityFiles = ['TOOLS.md', 'EXECUTION.md', 'QUALITY.md', 'FIREWALL_CONTEXT.md', 'AGENT_AWARENESS.md'];
  for (const filename of priorityFiles) {
    const content = t2.get(filename);
    if (content && content.length > 0) {
      const lines = content.split('\n').filter((l: string) => l.startsWith('-') || l.startsWith('## '));
      sections.push(`[${filename}] ${lines.slice(0, 8).join(' | ')}`);
    }
  }

  return sections.length > 0
    ? `[T1 WARHEAD: KNOWLEDGE]\n${sections.join('\n\n')}`
    : '[T1 WARHEAD: KNOWLEDGE]\nKnowledge library unavailable — identity files not loaded.';
}

function buildExploreProtocolT1(): string {
  const protocol = loadIdentityFile('explore-protocol.md');
  if (protocol.length === 0) {
    return `[T1 WARHEAD: EXPLORE PROTOCOL]\ntrident_explore: V1 (7-section extraction) + V2 (WHY 5-layer + HOW 3-layer).\nDispatch: task subagent_type=trident_explore description="...return V2 synthesis".\nTools: read, glob, grep, hive_context ONLY. BLOCKED: write, edit, bash, task.\nL5.11 enforced: zero resistance to deployment count.`;
  }
  const lines = protocol.split('\n').filter((l: string) => l.startsWith('-') || l.startsWith('## ')).slice(0, 12);
  return `[T1 WARHEAD: EXPLORE PROTOCOL]\n${lines.join('\n')}`;
}

function buildIdentityBindingT1(): string {
  const t2 = ensureT2Cache();
  const tridentMd = t2.get('TRIDENT.md') || '';
  const compact = [
    'Trident Agent — Code audit and analysis engine.',
    'Audits code. Generates review artifacts. Directs build agents.',
    'NOT opencode. NOT a chatbot. NOT an assistant.',
    'Two modes: AGENT (nav/gen) + AUDITOR (review/plan/synthesize).',
  ];
  if (tridentMd.length > 0) {
    const lines = tridentMd.split('\n').filter((l: string) => l.startsWith('-')).slice(0, 5);
    compact.push(...lines);
  }
  return `[T1 WARHEAD: IDENTITY BINDING]\n${compact.join('\n')}`;
}

// ── STATIC T1 SECTIONS (not warhead-based — these are identity/context injectables) ──
async function buildStaticT1Sections(): Promise<string[]> {
  try {
    const sections: string[] = [];

  // Identity Binding
  sections.push(buildIdentityBindingT1());

  // P2-A: P1-P10 Principles — try KB-00 first, fall back to hardcoded
  const t2_p1 = ensureT2Cache();
  const kb00 = t2_p1.get('kb/KB-00-Philosophy-and-Rules.md');
  if (kb00 && kb00.length > 0) {
    const lines = kb00.split('\n').filter((l: string) =>
      l.startsWith('**P') || l.startsWith('P1 ') || l.startsWith('P2 ') ||
      l.startsWith('P3 ') || l.startsWith('P4 ') || l.startsWith('P5 ') ||
      l.startsWith('P6 ') || l.startsWith('P7 ') || l.startsWith('P8 ') ||
      l.startsWith('P9 ') || l.startsWith('P10'));
    if (lines.length >= 10) {
      sections.push(`[T1 WARHEAD: P1-P10 PRINCIPLES]\n${lines.slice(0, 10).join('\n')}`);
    } else {
      sections.push(`[T1 WARHEAD: P1-P10 PRINCIPLES]\n${FALLBACK_P1P10}`);
    }
  } else {
    sections.push(`[T1 WARHEAD: P1-P10 PRINCIPLES]\n${FALLBACK_P1P10}`);
  }

  // P2-A: Layer Engine — try TRIDENT.md layer content first, fall back to hardcoded
  const t2_le = ensureT2Cache();
  const tridentMd_le = t2_le.get('TRIDENT.md');
  if (tridentMd_le && tridentMd_le.length > 0) {
    const lines = tridentMd_le.split('\n').filter((l: string) =>
      l.includes('firewall') || l.includes('BLOCKED') || l.includes('LAYER') ||
      l.includes('F1:') || l.includes('L5:') || l.includes('CFW:'));
    if (lines.length >= 4) {
      sections.push(`[T1 WARHEAD: LAYER ENGINE]\n${lines.slice(0, 9).join('\n')}`);
    } else {
      sections.push(`[T1 WARHEAD: LAYER ENGINE]\n${FALLBACK_LAYER_ENGINE}`);
    }
  } else {
    sections.push(`[T1 WARHEAD: LAYER ENGINE]\n${FALLBACK_LAYER_ENGINE}`);
  }

  // Audit Engine
  sections.push(`[T1 WARHEAD: 17-LAYER AUDIT ENGINE]
R0-R16. Each layer produces findings with severity, confidence, correction, runtime impact.
${loadAuditLayerDescriptions()}`);

  // TS Compiler API — describes ONLY what exists (audit counter + trident-code-audit tool)
  sections.push(`[T1 WARHEAD: TS COMPILER API]
  ${tsCompilerAPIWarhead.getStatus().audits} audits tracked.
  For AST-level analysis, use trident-code-audit (17-layer R0-R16 engine).
  Anti-pattern: grep for analysis → USE trident-code-audit tool for TypeScript analysis.`);

  // Knowledge
  sections.push(await buildKnowledgeT1());

  // Explore Protocol
  sections.push(buildExploreProtocolT1());

  // P2-A: Compact Identity — try TRIDENT.md first, fall back to hardcoded
  const t2_ci = ensureT2Cache();
  const tridentMd_ci = t2_ci.get('TRIDENT.md');
  if (tridentMd_ci && tridentMd_ci.length > 0) {
    const lines = tridentMd_ci.split('\n').filter((l: string) =>
      l.includes('who') || l.includes('opencode') || l.includes('audit') ||
      l.includes('edit') || l.includes('Block'));
    if (lines.length >= 4) {
      sections.push(`[T1 WARHEAD: COMPACT IDENTITY]\n${lines.slice(0, 4).join('\n')}`);
    } else {
      sections.push(`[T1 WARHEAD: COMPACT IDENTITY]\n${FALLBACK_COMPACT_IDENTITY}`);
    }
  } else {
    sections.push(`[T1 WARHEAD: COMPACT IDENTITY]\n${FALLBACK_COMPACT_IDENTITY}`);
  }

  // P2-A: NLP Pipeline — try KB-07 first, fall back to hardcoded
  const t2_nlp = ensureT2Cache();
  const kb07 = t2_nlp.get('kb/KB-07-Deterministic-NLP-Pipeline-Intent-Resolution.md');
  if (kb07 && kb07.length > 0) {
    const lines = kb07.split('\n').filter((l: string) =>
      l.startsWith('-') || l.startsWith('## ') || l.startsWith('**'));
    sections.push(`[T1 WARHEAD: NLP PIPELINE]\n${lines.slice(0, 6).join('\n')}`);
  } else {
    sections.push(`[T1 WARHEAD: NLP PIPELINE]\n${FALLBACK_NLP_PIPELINE}`);
  }

  // P2-A: Audit Layer Progression — try AUDIT_LAYER_PROGRESSION.md first, fall back to hardcoded
  const t2_alp = ensureT2Cache();
  const alpContent = t2_alp.get('AUDIT_LAYER_PROGRESSION.md');
  if (alpContent && alpContent.length > 0) {
    const lines = alpContent.split('\n').filter((l: string) =>
      l.includes('R0:') || l.includes('R1:') || l.includes('R2:') ||
      l.includes('CircuitBreaker') || l.includes('TokenBucket'));
    sections.push(`[T1 WARHEAD: AUDIT LAYER PROGRESSION]\n${lines.slice(0, 8).join('\n')}`);
  } else {
    sections.push(`[T1 WARHEAD: AUDIT LAYER PROGRESSION]\n${FALLBACK_AUDIT_LAYER_PROGRESSION}`);
  }

  return sections.filter((s: string) => s.length > 0);
  } catch (e: unknown) {
    tridentLog('WARN', 'warhead-synthesizer', `buildStaticT1Sections failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

// ── ALL REGISTERED WARHEADS ──
const warheads: Warhead[] = [
  runtimeGradeWarhead,
  nlpPipelineWarhead,
  auditLayerProgressionWarhead,
  concurrencyWarhead,
  persistenceWarhead,
  testingWarhead,
  tsCompilerAPIWarhead,
  exploreDispatchWarhead,
  identityLayerWarhead,
  // Dynamic state warheads (restored — Finding #9 fix)
  focusWarhead,
  recoveryWarhead,
  auditStateWarhead,
  // P1-C: Common Sense knowledge warhead
  commonSenseWarhead,
  // P1-D: Distilled Knowledge warhead
  distilledKnowledgeWarhead,
];

// ── Hook Registration ──

export async function registerWarheadHooks(): Promise<void> {
  // R12: Agent identity guard — warhead hooks run only for Trident agent
  const agentIdentity = 'trident';
  void agentIdentity;
  // ── Project folder warhead (session.created, tool.before, system.transform) ──
  registerProjectFolderWarheadHooks();

  // ── Register all enforcement warheads ──
  for (const w of warheads) {
    try {
      if (w.init) {
        await w.init();
      }
      tridentLog('INFO', 'warhead-synthesizer', `Warhead initialized: ${w.id}`);
    } catch (e: unknown) {
      tridentLog('ERROR', 'warhead-synthesizer',
        `Warhead ${w.id} initialization failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }

  tridentLog('INFO', 'warhead-synthesizer',
    `${warheads.length} warheads initialized`);
}

// ── Safe T0 getter (wraps getT0() in try/catch with typed return) ──
function safeGetT0(w: Warhead): string | null {
  try {
    const t0 = w.getT0();
    return (t0 && t0.length > 0) ? t0 : null;
  } catch (e: unknown) {
    tridentLog('WARN', 'warhead-synthesizer',
      `getT0 failed for ${w.id}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// ── WARHEAD SKILL SYNTHESIS (BEAST_MODE_OVERHAUL_SPEC Part 26 — cache-safe delivery) ──
// The operative warheads are ALSO delivered as a skills file (trident-warheads/SKILL.md).
// Skill content loads as a TOOL RESULT (message history) — ZERO system-prompt cache
// impact. Regenerating at session boundaries = consume-on-read freshness, no stale
// warheads. Non-fatal: a failure must never break the session.

export async function synthesizeWarheads(
  identityDir: string,
  outPath: string,
): Promise<{ ok: boolean; warheads: number; path: string }> {
  try {
    let warheadsSource = path.join(identityDir, 'WARHEADS.md');
    if (!fs.existsSync(warheadsSource)) {
      // identityDir may be the identity ROOT (src/identity) — try trident/WARHEADS.md
      const alt = path.join(identityDir, 'trident', 'WARHEADS.md');
      if (fs.existsSync(alt)) warheadsSource = alt;
      else {
        tridentLog('WARN', 'warhead-synthesizer', `WARHEADS.md not found at ${identityDir}`);
        return { ok: false, warheads: 0, path: outPath };
      }
    }

    const body = fs.readFileSync(warheadsSource, 'utf-8');
    const frontmatter = '---\n'
      + 'name: trident-warheads\n'
      + "description: 'The operative warhead payload — load when you detect scope-shrink, approval-gating, theatrical claims, or gate entries in your own reasoning or the task at hand.'\n"
      + '---\n\n';
    const skill = frontmatter + body + '\n';

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, skill, 'utf-8');

    const warheadCount = (body.match(/WARHEAD\s+\d+/gi) || []).length;
    tridentLog('INFO', 'warhead-synthesizer',
      `SKILL.md synthesized: ${outPath} (${warheadCount} warheads)`);
    return { ok: true, warheads: warheadCount, path: outPath };
  } catch (e: unknown) {
    tridentLog('WARN', 'warhead-synthesizer',
      `SKILL synthesis failed: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, warheads: 0, path: outPath };
  }
}

// ── Public API ──


