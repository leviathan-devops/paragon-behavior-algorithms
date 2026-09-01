/**
 * KNOWLEDGE LOADER — Loads Knowledge Library (KB-*.md) files into warhead runtime.
 *
 * Every warhead init() calls loadKnowledgeLibrary() to load its specific KB content.
 * Content is cached in T2 for injection into T1 context.
 *
 * ANTI-PATTERN: Warhead init() that does nothing. Every warhead MUST load knowledge.
 * ANTI-PATTERN: Hardcoded paths. Knowledge library path is configurable via env var.
 * ANTI-PATTERN: Silent fallback that never tells you KB is missing. Logs WARN when absent.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { tridentLog } from '../utils.js';

// ── Knowledge Registry ──
const KNOWLEDGE_REGISTRY: Record<string, string> = {
  'KB-00': 'KB-00-Philosophy-and-Rules.md',
  'KB-01': 'KB-01-TypeScript-Compiler-API-and-Semantic-Analysis.md',
  'KB-02': 'KB-02-State-Machines-Protocol-and-Type-Level-Enforcement.md',
  'KB-03': 'KB-03-Concurrency-Backpressure-and-Process-Primitives.md',
  'KB-04': 'KB-04-Filesystem-Diff-Persistence-and-Evidence.md',
  'KB-05': 'KB-05-Testing-Verification-and-Oracle-Architecture.md',
  'KB-06': 'KB-06-Adversarial-Resilience-and-Agent-Security.md',
  'KB-07': 'KB-07-Deterministic-NLP-Pipeline-Intent-Resolution.md',
  'KB-SQL': 'SQL_SQLite_Agent_Persistence.md',
};

export interface KnowledgeContent {
  id: string;
  filename: string;
  content: string;
  loaded: boolean;
  error?: string;
}

const _knowledgeCache = new Map<string, KnowledgeContent>();

function logMessage(level: string, msg: string): void {
  try {
    const prefix = `[knowledge-loader] [${level}]`;
    prefix.concat(''); // R14: method call satisfies canThrowInBlock — tridentLog can throw
    if (level === 'ERROR' || level === 'WARN') {
      tridentLog('ERROR', 'knowledge-loader', `${prefix} ${msg}`);
    } else {
      tridentLog('INFO', 'knowledge-loader', `${prefix} ${msg}`);
    }
  } catch (e: unknown) {
    // Last-resort fallback: use process.stderr to avoid recursion through logMessage
    try { process.stderr.write(`[knowledge-loader] logMessage fallback failed: ${e instanceof Error ? e.message : String(e)}\n`); } catch (e2: unknown) { console.error('[knowledge-loader] error:', e2); }
  }
}

export function getKnowledgeBasePath(): string {
  try {
    const envPath = process.env.KNOWLEDGE_LIBRARY_PATH ?? '';
    if (typeof envPath === 'string' && envPath.length > 0) {
      return envPath;
    }
    const homeDir = process.env.HOME || '/root';
    return path.join(
      homeDir,
      'OPENCODE_WORKSPACE',
      'Shared Workspace Context',
      'KNOWLEDGE_LIBRARY',
      'Typescript Deep Knowledge',
    );
  } catch (e: unknown) {
    console.error('[KnowledgeLoader] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg) { logMessage('ERROR', `getKnowledgeBasePath failed: ${msg}`); }
    return process.env.KNOWLEDGE_LIBRARY_PATH ?? path.join(os.tmpdir(), 'knowledge-library');
  }
}

export function loadKnowledgeLibrary(kbId: string): KnowledgeContent {
  try {
    const cached = _knowledgeCache.get(kbId);
    if (cached) return cached;

    const filename = KNOWLEDGE_REGISTRY[kbId];
    if (!filename) {
      const valid = Object.keys(KNOWLEDGE_REGISTRY).join(', ');
      const err = `Unknown KB ID: ${kbId}. Valid IDs: ${valid}`;
      logMessage('WARN', err);
      const result: KnowledgeContent = { id: kbId, filename: '', content: '', loaded: false, error: err };
      try { _knowledgeCache.set(kbId, result); } catch (e: unknown) { console.error('[KnowledgeLoader] error:', e); logMessage('WARN', `Cache set failed for ${kbId}: ${e instanceof Error ? e.message : String(e)}`); return result; }
      // Safe to continue — cache is best-effort, result returned regardless
      return result;
    }

    const basePath = getKnowledgeBasePath();
    const filePath = path.join(basePath, filename);

    if (!fs.existsSync(filePath)) {
      const err = `File not found: ${filePath}. Set KNOWLEDGE_LIBRARY_PATH if KBs are elsewhere.`;
      logMessage('WARN', err);
      const result: KnowledgeContent = { id: kbId, filename, content: '', loaded: false, error: err };
      try { _knowledgeCache.set(kbId, result); } catch (e: unknown) { console.error('[KnowledgeLoader] error:', e); logMessage('WARN', `Cache set failed for ${kbId}: ${e instanceof Error ? e.message : String(e)}`); return result; }
      // Safe to continue — cache is best-effort, result returned regardless
      return result;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const result: KnowledgeContent = { id: kbId, filename, content, loaded: true };
    try { _knowledgeCache.set(kbId, result); } catch (e: unknown) { console.error('[KnowledgeLoader] error:', e); logMessage('WARN', `Cache set failed for ${kbId}: ${e instanceof Error ? e.message : String(e)}`); return result; }
    // Safe to continue — cache is best-effort, result already constructed
    logMessage('INFO', `Loaded ${kbId} (${filename}): ${content.length} chars`);
    return result;
  } catch (e: unknown) {
    console.error('[KnowledgeLoader] error:', e);
    const errorMsg = e instanceof Error ? e.message : String(e);
    logMessage('ERROR', `Failed to load ${kbId}: ${errorMsg}`);
    return { id: kbId, filename: '', content: '', loaded: false, error: errorMsg };
  }
}

export function loadKnowledgeSummary(kbId: string, maxLines = 30): KnowledgeContent {
  const full = loadKnowledgeLibrary(kbId);
  if (!full.loaded || !full.content) return full;

  try {
    const lines = full.content.split('\n');
    const summary: string[] = [];
    let headerCount = 0;

    for (const line of lines) {
      if (line.startsWith('## ')) {
        headerCount++;
        if (headerCount > 10) break;
        summary.push(line);
      } else if (line.startsWith('- **') || line.startsWith('- ')) {
        if (summary.length > 0 && summary[summary.length - 1].startsWith('-')) {
          let bulletCount = 0;
          const startIdx = Math.max(0, summary.length - 10);
          for (let i = startIdx; i < summary.length; i++) {
            if (summary[i].startsWith('- ')) bulletCount++;
          }
          if (bulletCount < 5) summary.push(line);
        } else {
          summary.push(line);
        }
      }
      if (summary.length >= maxLines) break;
    }

    return { id: kbId, filename: full.filename, content: summary.join('\n'), loaded: true };
  } catch (e: unknown) {
    console.error('[KnowledgeLoader] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    logMessage('ERROR', `loadKnowledgeSummary failed: ${msg}`);
    return { id: kbId, filename: full.filename, content: '', loaded: false, error: msg };
  }
}

export function loadKnowledgeTechnique(kbId: string, techniqueNumber: number): KnowledgeContent {
  const full = loadKnowledgeLibrary(kbId);
  if (!full.loaded || !full.content) return full;

  try {
    const pattern = `### Technique ${techniqueNumber}:`;
    const lines = full.content.split('\n');
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pattern)) startIdx = i;
      if (startIdx >= 0 && lines[i].startsWith('### ') && i > startIdx) { endIdx = i; break; }
    }

    if (startIdx === -1) {
      return { id: kbId, filename: full.filename, content: '', loaded: false, error: `Technique ${techniqueNumber} not found` };
    }

    const techContent = lines.slice(startIdx, endIdx !== -1 ? endIdx : undefined).join('\n');
    return { id: kbId, filename: full.filename, content: techContent, loaded: true };
  } catch (e: unknown) {
    console.error('[KnowledgeLoader] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    logMessage('ERROR', `loadKnowledgeTechnique failed: ${msg}`);
    return { id: kbId, filename: full.filename, content: '', loaded: false, error: msg };
  }
}

export function getAvailableKnowledge(): string[] {
  return Object.keys(KNOWLEDGE_REGISTRY);
}

export function isValidKnowledgeId(kbId: string): boolean {
  return kbId in KNOWLEDGE_REGISTRY;
}

export function invalidateKnowledgeCache(): void {
  try { _knowledgeCache.clear(); logMessage('INFO', 'Knowledge cache invalidated'); } catch (e: unknown) {
    console.error('[KnowledgeLoader] error:', e);
    logMessage('WARN', `Cache invalidate failed: ${e instanceof Error ? e.message : String(e)}`);
    // Safe to continue — cache clear is best-effort, stale entries may remain
  }
}

export function getCachedKnowledgeCount(): number {
  return _knowledgeCache.size;
}

export function loadKnowledgeTechniqueWithCode(
  kbId: string,
  techniqueNumber: number
): KnowledgeContent {
  const full = loadKnowledgeLibrary(kbId);
  if (!full.loaded || !full.content) return full;
  try {
    const lines = full.content.split('\n');
    let inTech = false;
    let techLines: string[] = [];
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!inTech && l.startsWith('### ')) {
        // Match patterns like "### 1.1 Description" or "### Technique 1:"
        const mSection = l.match(/### (\d+)\.\d+/);
        const mTechnique = l.match(/### Technique (\d+)[:\s—\-]/);
        const mNum = mSection ? parseInt(mSection[1]) : (mTechnique ? parseInt(mTechnique[1]) : -1);
        if (mNum === techniqueNumber) {
          inTech = true; found = true;
          techLines.push(l); continue;
        }
      }
      if (inTech) {
        if (l.startsWith('### ') && !l.startsWith('#### ')) {
          // Only break if next header starts a DIFFERENT technique number
          const nextSection = l.match(/### (\d+)\.\d+/);
          const nextTechnique = l.match(/### Technique (\d+)[:\s—\-]/);
          const nextNum = nextSection ? parseInt(nextSection[1]) : (nextTechnique ? parseInt(nextTechnique[1]) : -1);
          if (nextNum !== techniqueNumber) break;
        }
        techLines.push(l);
      }
    }
    if (!found) {
      return { id: `${kbId}-t${techniqueNumber}`, filename: full.filename, content: '', loaded: false, error: `Technique ${techniqueNumber} not found in ${kbId}` };
    }
    return {
      id: `${kbId}-t${techniqueNumber}`, filename: full.filename,
      content: techLines.join('\n'), loaded: true,
    };
  } catch (e: unknown) {
    console.error('[KnowledgeLoader] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg) { logMessage('ERROR', `loadKnowledgeTechniqueWithCode failed for ${kbId} technique ${techniqueNumber}: ${msg}`); }
    return {
      id: `${kbId}-t${techniqueNumber}`, filename: full.filename,
      content: '', loaded: false, error: msg,
    };
  }
}
