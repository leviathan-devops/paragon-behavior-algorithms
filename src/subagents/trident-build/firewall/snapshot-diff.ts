// SnapshotDiff — Takes before/after snapshots of the project directory
// Detects files changed/created outside the plan scope
// Uses SHA256 hashing for integrity verification

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { PlanScope } from './plan-scope.js';

export interface Snapshot {
  timestamp: number;
  files: Map<string, string>;  // relative path → SHA256 hash
}

export interface DiffEntry {
  file: string;
  beforeHash: string;
  afterHash: string;
  status: 'changed' | 'created' | 'deleted';
}

export class SnapshotDiffClass {
  private before: Snapshot | null = null;

  takeSnapshot(rootDir: string, exclude: string[] = ['node_modules', '.git', 'dist', '.trident']): Snapshot {
    var files = new Map<string, string>();
    var excludeSet = new Set(exclude);

    this.walkDir(rootDir, rootDir, files, excludeSet);

    return { timestamp: Date.now(), files };
  }

  captureBefore(rootDir: string): void {
    this.before = this.takeSnapshot(rootDir);
  }

  diff(): DiffEntry[] {
    if (!this.before) return [];

    var after = this.takeSnapshot(process.cwd());
    var diff: DiffEntry[] = [];

    // Check for changed / deleted files
    for (var entry of this.before.files) {
      var filePath = entry[0];
      var beforeHash = entry[1];
      var afterHash = after.files.get(filePath);

      if (afterHash === undefined) {
        diff.push({ file: filePath, beforeHash, afterHash: '', status: 'deleted' });
      } else if (afterHash !== beforeHash) {
        diff.push({ file: filePath, beforeHash, afterHash, status: 'changed' });
      }
    }

    // Check for newly created files
    for (var entry of after.files) {
      var filePath = entry[0];
      var newAfterHash = entry[1];
      if (!this.before.files.has(filePath)) {
        diff.push({ file: filePath, beforeHash: '', afterHash: newAfterHash, status: 'created' });
      }
    }

    return diff;
  }

  checkScopeViolation(planScope: PlanScope | null): Array<{ file: string; reason: string }> {
    if (!planScope) return [];

    var violations: Array<{ file: string; reason: string }> = [];
    var diff = this.diff();

    for (var i = 0; i < diff.length; i++) {
      var d = diff[i];
      if (d.status === 'changed' || d.status === 'created') {
        var inScope = false;
        for (var j = 0; j < planScope.allowedFiles.length; j++) {
          if (d.file.indexOf(planScope.allowedFiles[j]) !== -1) {
            inScope = true;
            break;
          }
        }
        if (!inScope) {
          violations.push({ file: d.file, reason: `${d.status} file not in plan scope. Only files in the remediation plan should be modified.` });
        }
      }
    }

    return violations;
  }

  private walkDir(dir: string, rootDir: string, files: Map<string, string>, exclude: Set<string>): void {
    var entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch (e: unknown) {
      console.warn(`[snapshot-diff] walkDir readdir failed (skipping unreadable dir): ${e instanceof Error ? e.message : String(e)}`);
      return; // Skip directories we can't read
    }

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (exclude.has(entry)) continue;

      var fullPath = path.join(dir, entry);
      var relativePath = path.relative(rootDir, fullPath);

      try {
        var stats = statSync(fullPath);
        if (stats.isDirectory()) {
          this.walkDir(fullPath, rootDir, files, exclude);
        } else if (stats.isFile() && entry.endsWith('.ts')) {
          var content = readFileSync(fullPath, 'utf-8');
          var hash = createHash('sha256').update(content).digest('hex').substring(0, 16);
          files.set(relativePath, hash);
        }
      } catch (e: unknown) {
        console.warn(`[snapshot-diff] walkDir file read failed (skipping): ${e instanceof Error ? e.message : String(e)}`);
        // Skip files we can't read
      }
    }
  }
}
