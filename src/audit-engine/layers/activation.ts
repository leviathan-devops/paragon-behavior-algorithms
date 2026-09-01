import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'bun:sqlite';
export function hasKnowledgeGraph(targetPath: string): boolean {
  const dbPath = path.join(targetPath, '.trident', 'knowledge-graph', 'shared.db');
  try {
    if (!fs.existsSync(dbPath)) return false;
    const db = new Database(dbPath, { readonly: true } as unknown as Record<string, unknown>);
    try {
      const row = db.prepare('SELECT COUNT(*) as c FROM graph_nodes').get() as Record<string, unknown> | null | undefined;
      const c = row ? Number((row as Record<string, unknown>)['c'] ?? 0) : 0;
      return c > 0;
    } catch (e: unknown) {
      console.error('[activation] hasKnowledgeGraph query failed', e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      try { db.close(); } catch (e: unknown) { console.error('[activation] close failed', e instanceof Error ? e.message : String(e)); }
    }
  } catch (e: unknown) {
    console.error('[activation] hasKnowledgeGraph open failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}
export function hasDerailmentFindings(targetPath: string): boolean {
  const dbPath = path.join(targetPath, '.trident', 'knowledge-graph', 'shared.db');
  try {
    if (!fs.existsSync(dbPath)) return false;
    const db = new Database(dbPath, { readonly: true } as unknown as Record<string, unknown>);
    try {
      const row = db.prepare('SELECT COUNT(*) as c FROM findings').get() as Record<string, unknown> | null | undefined;
      const c = row ? Number((row as Record<string, unknown>)['c'] ?? 0) : 0;
      return c > 0;
    } catch (e: unknown) {
      console.error('[activation] hasDerailmentFindings query failed', e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      try { db.close(); } catch (e: unknown) { console.error('[activation] close failed', e instanceof Error ? e.message : String(e)); }
    }
  } catch (e: unknown) {
    console.error('[activation] hasDerailmentFindings open failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}
export function isBatchBActive(targetPath: string): boolean {
  return hasKnowledgeGraph(targetPath) && hasDerailmentFindings(targetPath);
}
export function isGraphActive(targetPath: string): boolean {
  return hasKnowledgeGraph(targetPath);
}
