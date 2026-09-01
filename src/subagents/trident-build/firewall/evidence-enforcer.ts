// EvidenceEnforcer — Ensures every changed file has a SHA256 hash
// Captures hashes before/after writes and verifies claims against reality

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface EvidenceEntry {
  file: string;
  claimedHash: string;
  actualHash: string;
  verified: boolean;
}

export class EvidenceEnforcer {
  private changedFiles = new Map<string, { claimedHash: string; actualHash: string; verified: boolean }>();

  captureBefore(filePath: string): void {
    if (!this.changedFiles.has(filePath)) {
      this.changedFiles.set(filePath, {
        claimedHash: '',
        actualHash: this.computeHash(filePath) || 'pending',
        verified: false,
      });
    }
  }

  captureAfter(filePath: string): string {
    var actualHash = this.computeHash(filePath) || '';
    var entry = this.changedFiles.get(filePath);
    if (entry) {
      entry.actualHash = actualHash;
      if (entry.claimedHash && entry.claimedHash === actualHash) {
        entry.verified = true;
      }
    } else {
      this.changedFiles.set(filePath, {
        claimedHash: '',
        actualHash,
        verified: false,
      });
    }
    return actualHash;
  }

  getReport(): EvidenceEntry[] {
    var report: EvidenceEntry[] = [];
    for (var entry of this.changedFiles) {
      report.push({
        file: entry[0],
        claimedHash: entry[1].claimedHash,
        actualHash: entry[1].actualHash,
        verified: entry[1].verified,
      });
    }
    return report;
  }

  getChangedCount(): number {
    return this.changedFiles.size;
  }

  private computeHash(filePath: string): string | null {
    try {
      var content = readFileSync(filePath, 'utf-8');
      return createHash('sha256').update(content).digest('hex').substring(0, 16);
    } catch {
      return null;
    }
  }
}
