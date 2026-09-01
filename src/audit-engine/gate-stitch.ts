import * as fs from 'node:fs';
import * as path from 'node:path';
import { Database } from 'bun:sqlite';
import { tridentLog } from '../utils.js';

export function stitchConcurrentSections(ledgerRoot: string, doc1Path: string, doc2Path: string, sharedDbPath: string): { stitched: string[]; missing: string[]; correlationRows: number } {
  const stitched: string[] = [];
  const missing: string[] = [];
  const sectionFiles = ['lasme-section.md', 'mpse-section.md', 'sro-section.md'];
  const analysisFiles = ['lasme-analysis.md', 'mpse-analysis.md', 'sro-analysis.md'];
  for (const name of sectionFiles) {
    const p = path.join(ledgerRoot, name);
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        fs.appendFileSync(path.resolve(doc2Path), content + '\n\n', 'utf-8');
        stitched.push(name);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        tridentLog('WARN', 'audit-engine', `gate-stitch: missing section ${name} — gate failed or did not write: ${msg}`);
        missing.push(name);
      }
    } else {
      tridentLog('WARN', 'audit-engine', `gate-stitch: missing section ${name} — gate failed or did not write`);
      missing.push(name);
    }
  }
  for (const name of analysisFiles) {
    const p = path.join(ledgerRoot, name);
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        fs.appendFileSync(path.resolve(doc1Path), content + '\n\n', 'utf-8');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        tridentLog('WARN', 'audit-engine', `gate-stitch: missing analysis ${name} — gate failed or did not write: ${msg}`);
      }
    } else {
      tridentLog('WARN', 'audit-engine', `gate-stitch: missing analysis ${name} — gate failed or did not write`);
    }
  }
  let correlationRows = 0;
  let perLayerCounts: Array<{ layer_id: string; n: number }> = [];
  let totalTags = 0;
  let db: InstanceType<typeof Database> | null = null;
  try {
    if (fs.existsSync(sharedDbPath)) {
      db = new Database(sharedDbPath, { readonly: true } as unknown as Record<string, unknown>) as InstanceType<typeof Database>;
      try {
        const rows = (db as unknown as { prepare: (s: string) => { all: () => Array<{ layer_id: string; n: number }> } }).prepare('SELECT layer_id, COUNT(*) as n FROM typed_edges GROUP BY layer_id').all() as Array<{ layer_id: string; n: number }>;
        perLayerCounts = rows;
        totalTags = rows.reduce((a, r) => a + (typeof r.n === 'number' ? r.n : 0), 0);
        correlationRows = totalTags;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        tridentLog('WARN', 'audit-engine', `gate-stitch: correlation query failed: ${msg}`);
      }
      try {
        const cross = (db as unknown as { prepare: (s: string) => { all: () => Array<{ file: string; cnt: number }> } }).prepare(`SELECT file, COUNT(DISTINCT created_run) as cnt FROM typed_nodes GROUP BY file HAVING cnt >= 2 LIMIT 20`).all() as Array<{ file: string; cnt: number }>;
        void cross;
      } catch {
        void 0;
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('WARN', 'audit-engine', `gate-stitch: db open failed: ${msg}`);
  } finally {
    try { (db as unknown as { close?: () => void })?.close?.(); } catch { void 0; }
  }
  try {
    if (totalTags > 0) {
      let block = '## CORRELATIONS\n';
      for (const r of perLayerCounts) block += `- ${r.layer_id}: ${r.n} tags\n`;
      block += '\n';
      fs.appendFileSync(path.resolve(doc2Path), block, 'utf-8');
    } else {
      fs.appendFileSync(path.resolve(doc2Path), '## CORRELATIONS\nNo graph tags recorded this run (typed_edges empty) — the tagging seam recorded failures; see tag-failures.log.\n\n', 'utf-8');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('WARN', 'audit-engine', `gate-stitch: CORRELATIONS append failed: ${msg}`);
  }
  return { stitched, missing, correlationRows };
}
