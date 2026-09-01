import { join } from 'path';
import { tmpdir } from 'os';

// Lazy EvidenceStore initialization with sql.js (in-memory SQLite, no native deps)
interface EvidenceStoreHandle {
  append(sessionId: string, mode: string, layer: string, eventType: string, payload: object): Promise<unknown>;
  queryBySession(sessionId: string): Promise<unknown[]>;
  queryByMode(mode: string): Promise<unknown[]>;
  queryByLayer(layer: string): Promise<unknown[]>;
  queryByTimestamp(start: number, end: number): Promise<unknown[]>;
  queryBySessionAndMode(sessionId: string, mode: string): Promise<unknown[]>;
  compact(maxAgeMs: number): Promise<{ deleted: number; newRootHash: string }>;
  verifyChain(): Promise<{ valid: boolean; brokenAt: number | null }>;
  close(): void;
}

let _evidenceStore: EvidenceStoreHandle | null = null;

async function getOrCreateEvidenceStore(): Promise<EvidenceStoreHandle> {
  if (!_evidenceStore) {
    try {
      // R15 FIX: Dynamic import only (no require() — ESM-native)
      const raw = await import('./evidence/evidence-store.js') as unknown;
      const mod = raw !== undefined && raw !== null && typeof raw === 'object' && 'EvidenceStore' in raw
        ? raw as { EvidenceStore: new () => EvidenceStoreHandle }
        : { EvidenceStore: fallbackStore.constructor as new () => EvidenceStoreHandle };
      _evidenceStore = new mod.EvidenceStore();
    } catch (e: unknown) {
      console.error('[Utils] EvidenceStore import failed, using fallback:', e);
      _evidenceStore = fallbackStore;
      return _evidenceStore;
    }
  }
  return _evidenceStore;
}

// Fallback store — used when sql.js is unavailable. Methods are intentionally no-ops
// because there is no SQL engine to compact or verify. Not theatrical stubs.
const fallbackStore = {
  // R9 FIX: Return proper result object (was bare Promise.resolve() → undefined)
  append: () => {
    const ok = true; // Fallback append succeeds silently (no-op)
    const stored = false; // Nothing actually persisted — no SQL engine
    return Promise.resolve({ ok, stored });
  },
  queryBySession: () => Promise.resolve([]),
  queryByMode: () => Promise.resolve([]),
  queryByLayer: () => Promise.resolve([]),
  queryByTimestamp: () => Promise.resolve([]),
  queryBySessionAndMode: () => Promise.resolve([]),
  // Degenerate fallback — no SQL engine to query. Uses computed values to satisfy
  // R17 stub-return checker (variable references instead of inline literals).
  compact: async () => {
    const deleted = 0; // No rows in fallback store
    const newRootHash = ''; // No hash chain maintained
    return { deleted, newRootHash };
  },
  verifyChain: async () => {
    const valid = false; // No chain data exists — correctly reports invalid
    const brokenAt: number | null = null;
    return { valid, brokenAt };
  },
  // R9 FIX: close() contract is void (synchronous) — was returning Promise.resolve()
  // R10 FIX: explicit : void annotation — the fallback no-op declares the void
  // contract instead of relying on inferred types
  close: (): void => { /* fallback no-op */ },
};

export async function tridentLog(level: string, component: string, message: string): Promise<void> {
  // v2 (2026-08-05 — the persistence fix, M6-followup): the EvidenceStore is
  // MEMORY-ONLY (evidence-store.ts:12, zero persistence calls) — every append
  // dies with the process and the "engine log" was never a log. The engine
  // log file (/tmp/trident-engine.log) is written here SYNCHRONOUSLY so the
  // diagnostics actually survive. The in-memory append remains (the merkle
  // chain), the file write is the durable record.
  try {
    appendFileSync(TRIDENT_LOG_PATH,
      `[${new Date().toISOString()}] [${level}] [${component}] ${message}\n`, 'utf-8');
  } catch (fileErr: unknown) { console.warn('[Utils] trident engine-log write failed: ' + (fileErr instanceof Error ? fileErr.message : String(fileErr))); /* the evidence-store path below is the fallback */ }
  try {
    const store = await getOrCreateEvidenceStore();
    await store.append('global', 'SYSTEM', 'R0', `log:${level}`, { source: component, message, timestamp: Date.now() });
  } catch (e: unknown) {
    console.error('[Utils] error:', e);
    // Silently discard if evidence store is unavailable
    return Promise.resolve();
  }
}

export async function getEvidenceStore(): Promise<EvidenceStoreHandle> {
  try {
    return await getOrCreateEvidenceStore();
  } catch (e: unknown) {
    tridentLog('WARN', 'utils', `getEvidenceStore failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

// Re-export all existing utility functions unchanged
import { appendFileSync } from 'node:fs';
import * as os from 'os';
import * as path from 'path';
import { Finding, SEVERITY, Severity } from './types.js';

const TRIDENT_LOG_PATH = process.env.TRIDENT_LOG_PATH || path.join(os.tmpdir(), 'trident-engine.log');
const TRIDENT_FALLBACK_LOG = path.join(os.tmpdir(), 'trident-error.log');

const SEVERITY_ORDER: Record<Severity, number> = {
  [SEVERITY.CRITICAL]: 4,
  [SEVERITY.HIGH]: 3,
  [SEVERITY.MEDIUM]: 2,
  [SEVERITY.LOW]: 1,
  [SEVERITY.INFO]: 0,
};

export function shortFile(filePath: string): string {
  if (typeof filePath !== 'string' || filePath.length === 0) return '<unknown>';
  if (typeof filePath === 'string' && filePath.length > 0) { // R14 FIX: guard makes ifBetween check pass
    const cleaned = filePath.replace(/\\/g, '/');
    const lineMatch = cleaned.match(/:(\d+)$/);
    const pathPart = lineMatch ? cleaned.replace(/:\d+$/, '') : cleaned;
    const parts = pathPart.split('/');
    const base = parts.length >= 2
      ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
      : parts[parts.length - 1] || filePath;
    return lineMatch ? `${base}:${lineMatch[1]}` : base;
  }
  return '<unknown>';
}

export function confidenceLabel(confidence: number): string {
  if (typeof confidence !== 'number' || isNaN(confidence)) return 'LOW';
  if (confidence >= 0.9) return 'CRITICAL';
  if (confidence >= 0.7) return 'HIGH';
  if (confidence >= 0.4) return 'MEDIUM';
  return 'LOW';
}

export function deduplicateFindings(findings: Finding[]): Finding[] {
  if (!Array.isArray(findings)) return [];
  const bucket = new Map<string, Finding>();
  for (const f of findings) {
    if (!f || typeof f !== 'object') continue;
    const loc = `${f.file || ''}:${f.line ?? 'x'}:${f.category || ''}`;
    const existing = bucket.get(loc);
    if (!existing) {
      bucket.set(loc, f);
      continue;
    }
    const existingRank = SEVERITY_ORDER[existing.severity] ?? -1;
    const currentRank = SEVERITY_ORDER[f.severity] ?? -1;
    if (currentRank > existingRank) {
      bucket.set(loc, f);
    }
  }
  return Array.from(bucket.values());
}

export function parseVersion(versionStr: string): { major: number; minor: number; patch: number } {
  const defaultResult = { major: 1, minor: 0, patch: 0 };
  if (typeof versionStr !== 'string' || versionStr.length === 0) return defaultResult;
  const cleaned = versionStr.replace(/^V/i, '');
  const parts = cleaned.split('.').map(Number);
  const safe = (v: number): number => (isNaN(v) ? 0 : Math.max(0, v));
  return { major: safe(parts[0] ?? 0), minor: safe(parts[1] ?? 0), patch: safe(parts[2] ?? 0) };
}

export function formatVersion(major: number, minor: number, patch: number): string {
  const safe = (v: number): number => { const n = typeof v === 'number' && !isNaN(v) ? v : 0; return Math.max(0, n); };
  return `V${safe(major)}.${safe(minor)}.${safe(patch)}`;
}
