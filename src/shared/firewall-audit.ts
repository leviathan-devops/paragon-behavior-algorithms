import * as fs from 'node:fs';
import * as path from 'node:path';
import { tridentLog } from '../utils.js';

interface AuditEntry {
  layer: string;
  reason: string;
  toolName: string;
  sessionAgent?: string;
  timestamp: string;
}

export class FirewallAudit {
  private readonly logPath: string;
  private counters = new Map<string, number>();

  constructor(basePath?: string) {
    const dir = basePath || process.cwd();
    this.logPath = path.join(dir, '.trident', 'firewall-audit.jsonl');
  }

  log(entry: AuditEntry): void {
    try {
      this.counters.set(entry.layer, (this.counters.get(entry.layer) || 0) + 1);
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (e: unknown) {
      tridentLog('ERROR', 'FirewallAudit', 'Write failed: ' + (e instanceof Error ? e.message : String(e)));
      // Safe to continue — audit log write is best-effort, counters still updated in memory
    }
  }

  layerEntryCount(layer: string): number {
    return this.counters.get(layer) || 0;
  }

  totalCount(): number {
    let total = 0;
    for (const c of this.counters.values()) total += c;
    return total;
  }

  getLogPath(): string {
    return this.logPath;
  }
}
