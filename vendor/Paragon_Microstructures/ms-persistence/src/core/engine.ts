import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { EnforcementEvent } from './types.js';

export type { EnforcementEvent, PersistenceConfig } from './types.js';

function defaultStateDir(): string {
  return path.join(os.tmpdir(), 'pta-state');
}

function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[Persistence] ensureDir failed for ${dir}: ${msg}`);
    throw e;
  }
}

function atomicWrite(filePath: string, data: string): void {
  const tmp = filePath + '.tmp';
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(tmp, data, 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch (cleanupErr) {
      console.error(`[Persistence] tmp cleanup failed: ${String(cleanupErr)}`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[Persistence] atomicWrite failed for ${filePath}: ${msg}`);
    throw e;
  }
}

export class Persistence {
  private readonly stateDir: string;

  constructor(stateDir?: string) {
    this.stateDir = stateDir ?? defaultStateDir();
  }

  getStateDir(): string {
    return this.stateDir;
  }

  private filePath(name: string): string {
    return path.join(this.stateDir, name);
  }

  persistState(sid: string, record: unknown): void {
    if (!sid || typeof sid !== 'string') throw new Error('Persistence.persistState: sid is required');
    try {
      const data = JSON.stringify(record);
      atomicWrite(this.filePath(`pta-state-${sid}.json`), data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Persistence] persistState failed: ${msg}`);
      throw e;
    }
  }

  loadState(sid: string): unknown | null {
    if (!sid || typeof sid !== 'string') return null;
    try {
      const raw = fs.readFileSync(this.filePath(`pta-state-${sid}.json`), 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      try {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[Persistence] loadState corrupt for ${sid}: ${msg}`);
      } catch (logErr) {
        console.error(`[Persistence] loadState log failed: ${String(logErr)}`);
      }
      return null;
    }
  }

  persistSynapse(sid: string, snapshot: unknown): void {
    if (!sid || typeof sid !== 'string') throw new Error('Persistence.persistSynapse: sid is required');
    try {
      const data = JSON.stringify(snapshot);
      atomicWrite(this.filePath(`pta-synapse-${sid}.json`), data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Persistence] persistSynapse failed: ${msg}`);
      throw e;
    }
  }

  loadSynapse(sid: string): unknown | null {
    if (!sid || typeof sid !== 'string') return null;
    try {
      const raw = fs.readFileSync(this.filePath(`pta-synapse-${sid}.json`), 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      try {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[Persistence] loadSynapse corrupt for ${sid}: ${msg}`);
      } catch (logErr) {
        console.error(`[Persistence] loadSynapse log failed: ${String(logErr)}`);
      }
      return null;
    }
  }

  persistChain(sid: string, record: unknown): void {
    if (!sid || typeof sid !== 'string') throw new Error('Persistence.persistChain: sid is required');
    try {
      const data = JSON.stringify(record);
      atomicWrite(this.filePath(`pta-chain-${sid}.json`), data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Persistence] persistChain failed: ${msg}`);
      throw e;
    }
  }

  loadChain(sid: string): unknown | null {
    if (!sid || typeof sid !== 'string') return null;
    try {
      const raw = fs.readFileSync(this.filePath(`pta-chain-${sid}.json`), 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return null;
    }
  }

  appendLedger(event: EnforcementEvent): void {
    if (!event || typeof event !== 'object') throw new Error('Persistence.appendLedger: event is required');
    try {
      ensureDir(this.stateDir);
      const line = JSON.stringify(event) + '\n';
      const ledgerPath = this.filePath('pta-ledger.jsonl');
      fs.appendFileSync(ledgerPath, line, 'utf8');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Persistence] appendLedger failed: ${msg}`);
      throw e;
    }
  }

  readLedger(): EnforcementEvent[] {
    try {
      const ledgerPath = this.filePath('pta-ledger.jsonl');
      const raw = fs.readFileSync(ledgerPath, 'utf8');
      const lines = raw.split('\n').filter((l) => l.trim().length > 0);
      const events: EnforcementEvent[] = [];
      for (const line of lines) {
        try {
          events.push(JSON.parse(line));
        } catch (parseErr) {
          console.error(`[Persistence] readLedger skipped corrupt line: ${String(parseErr)}`);
        }
      }
      return events;
    } catch (e) {
      if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      return [];
    }
  }
}

export function persistState(sid: string, record: unknown, stateDir?: string): void {
  new Persistence(stateDir).persistState(sid, record);
}
export function loadState(sid: string, stateDir?: string): unknown | null {
  return new Persistence(stateDir).loadState(sid);
}
export function persistSynapse(sid: string, snapshot: unknown, stateDir?: string): void {
  new Persistence(stateDir).persistSynapse(sid, snapshot);
}
export function loadSynapse(sid: string, stateDir?: string): unknown | null {
  return new Persistence(stateDir).loadSynapse(sid);
}
export function appendLedger(event: EnforcementEvent, stateDir?: string): void {
  new Persistence(stateDir).appendLedger(event);
}
