import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ReconEntry {
  readonly specPath: string;
  readonly lines: number;
  readonly clauses: string[];
}

export function writeReconMap(ledgerRoot: string, entries: readonly ReconEntry[]): string {
  if (!ledgerRoot || typeof ledgerRoot !== 'string') throw new Error('writeReconMap: ledgerRoot required');
  if (!Array.isArray(entries)) throw new Error('writeReconMap: entries must be array');
  const filePath = path.join(path.resolve(ledgerRoot), 'evidence', 'recon-map.md');
  const lines: string[] = ['# RECON MAP', ''];
  for (const e of entries) {
    if (!e.specPath || typeof e.lines !== 'number') throw new Error(`writeReconMap: invalid entry ${JSON.stringify(e)}`);
    lines.push(`## ${e.specPath} (${e.lines} lines)`);
    for (const c of e.clauses) lines.push(`- ${c}`);
    lines.push('');
  }
  const content = lines.join('\n');
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`writeReconMap failed: ${msg}`);
  }
  return filePath;
}

export function writeCandidateContext(ledgerRoot: string, index: number, content: string): string {
  if (!ledgerRoot || typeof ledgerRoot !== 'string') throw new Error('writeCandidateContext: ledgerRoot required');
  if (!Number.isInteger(index) || index < 0) throw new Error('writeCandidateContext: index must be >=0 integer');
  if (typeof content !== 'string') throw new Error('writeCandidateContext: content must be string');
  const name = `cand-${String(index).padStart(2, '0')}-context.txt`;
  const filePath = path.join(path.resolve(ledgerRoot), 'evidence', name);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`writeCandidateContext failed: ${msg}`);
  }
  return filePath;
}

export function appendWriteViolation(ledgerRoot: string, entry: { attempted: string; ledgerRoot: string }): string {
  if (!ledgerRoot || typeof ledgerRoot !== 'string') throw new Error('appendWriteViolation: ledgerRoot required');
  const filePath = path.join(path.resolve(ledgerRoot), 'evidence', 'write-violations.log');
  const row = JSON.stringify({ at: Date.now(), attempted: entry.attempted, ledgerRoot: entry.ledgerRoot }) + '\n';
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, row, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`appendWriteViolation failed: ${msg}`);
  }
  return filePath;
}

export function readWriteViolations(ledgerRoot: string): string[] {
  const filePath = path.join(path.resolve(ledgerRoot), 'evidence', 'write-violations.log');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return raw.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
