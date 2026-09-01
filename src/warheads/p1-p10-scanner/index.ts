import { P1P10Scanner } from './scanner.js';
import type { ScanResult } from './scanner.js';
import { tridentLog } from '../../utils.js';

export { P1P10Scanner };
export type { ScanResult };

export class P1P10Verification {
  private scanner: P1P10Scanner;
  private lastResults: ScanResult[] = [];

  constructor() {
    this.scanner = new P1P10Scanner();
    tridentLog('INFO', 'p1-p10', 'P1-P10 Scanner initialized');
  }

  /** Scan a directory for P1-P10 compliance */
  scan(targetPath: string): { results: ScanResult[]; score: number } {
    try {
      this.lastResults = this.scanner.scanDirectory(targetPath);
    } catch (e: unknown) {
      tridentLog('ERROR', 'p1-p10', `Scanner crashed, continuing with empty results: ${e instanceof Error ? e.message : String(e)}`);
      this.lastResults = [];
    }
    
    const totalChecks = this.lastResults.length;
    const passed = this.lastResults.filter((r: ScanResult) => r.passed).length;
    const score = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 100;
    
    tridentLog('INFO', 'p1-p10', `Scan complete: ${passed}/${totalChecks} passed (${score}%)`);
    return { results: this.lastResults, score };
  }

  /** Get last scan results */
  getLastResults(): ScanResult[] {
    return [...this.lastResults];
  }
}
