import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RunManifest {
  readonly runId: string;
  readonly ready: boolean;
  readonly stage?: 'probe' | 'recon' | 'evidencing' | 'reporting' | 'verifying' | 'budget-exhausted' | 'validator-reject';
  readonly error?: { code: string; message: string; remedy: string };
  readonly provider: 'opencode-go/muse-spark-1.2-contributor';
  readonly counts: { candidatesIn: number; trueDefect: number; redHerring: number; unclear: number; unclassifiedEmitted: number };
  readonly rounds: { used: number; budget: number };
  readonly wallClockMs: number;
  readonly probeMs: number;
  readonly phaseLog: ReadonlyArray<{ phase: string; enteredAt: number; exitedAt: number }>;
  readonly validatorRejects: number;
}

export function writeManifest(ledgerRoot: string, manifest: RunManifest): string {
  if (!ledgerRoot || typeof ledgerRoot !== 'string') throw new Error('writeManifest: ledgerRoot required');
  if (!manifest || typeof manifest.runId !== 'string' || manifest.runId.length === 0) throw new Error('writeManifest: manifest.runId required');
  const filePath = path.join(path.resolve(ledgerRoot), 'manifest.json');
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`writeManifest mkdir failed: ${msg}`);
  }
  const json = JSON.stringify(manifest, null, 2);
  try {
    fs.writeFileSync(filePath, json, 'utf-8');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`writeManifest write failed: ${msg}`);
  }
  return filePath;
}

export function readManifest(ledgerRoot: string): RunManifest {
  const filePath = path.join(path.resolve(ledgerRoot), 'manifest.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as RunManifest;
}
