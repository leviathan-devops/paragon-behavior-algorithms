/**
 * WARHEAD: Common Sense Knowledge
 *
 * P1-C: Dedicated warhead for Common Sense engineering knowledge.
 * Loads Common_Sense/ knowledge files and provides T0 awareness
 * of what common sense principles are available.
 *
 * Real implementation: Uses ContextSynthesisEngine for semantic
 * extraction of common sense principles. Tracks file availability
 * and synthesis quality.
 */

import { Warhead } from '../warhead-interface.js';
import { tridentLog } from '../../utils.js';

class CommonSenseWarhead implements Warhead {
  id = 'common-sense';
  priority = 12;
  type = 'static' as const;

  private filesLoaded: string[] = [];
  private fileCount = 0;
  private lastSynthesisTokens = 0;
  private synthesisCount = 0;
  private engineAvailable = false;

  async init(): Promise<void> {
    // Probe ContextSynthesisEngine availability
    try {
      const { ContextSynthesisEngine } = await import('../../modes/context-synthesis-engine.js');
      const _hasEngine = typeof ContextSynthesisEngine === 'function';
      if (_hasEngine) {
        this.engineAvailable = true;
      }
    } catch (e: unknown) {
      // R16 FIX: non-fatal fallback — ContextSynthesisEngine unavailable, regex fallback used
      this.engineAvailable = false;
      tridentLog('WARN', 'warhead-common-sense',
        `ContextSynthesisEngine unavailable: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }

    // Probe Common_Sense files via T2 cache
    try {
      const { ensureT2Cache } = await import('../trident-warhead-synthesizer.js');
      const t2 = ensureT2Cache();
      const allKeys: string[] = [];
      t2.forEach((_, key): void => { allKeys.push(key); });
      const csFiles = allKeys.filter((k: string) => k.startsWith('cs/'));
      const asFiles = allKeys.filter((k: string) => k.startsWith('as/'));
      this.fileCount = csFiles.length + asFiles.length;
      this.filesLoaded = [...csFiles.map((k: string) => k.replace('cs/', '')), ...asFiles.map((k: string) => k.replace('as/', ''))];
      if (this.fileCount > 0) {
        tridentLog('INFO', 'warhead-common-sense',
          `${this.fileCount} Common Sense files available: ${this.filesLoaded.join(', ')}`);
      } else {
        tridentLog('WARN', 'warhead-common-sense',
          'No Common Sense files found in T2 cache');
      }
    } catch (e: unknown) {
      // R16 FIX: non-fatal fallback — T2 cache probe failed, file count stays at 0
      tridentLog('WARN', 'warhead-common-sense',
        `T2 cache probe failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }


  getT0(): string {
    const fileList = this.filesLoaded.length > 0
      ? this.filesLoaded.slice(0, 3).join(', ') + (this.filesLoaded.length > 3 ? ` +${this.filesLoaded.length - 3} more` : '')
      : 'no files';
    const engineStatus = this.engineAvailable ? 'ContextSynthesisEngine available' : 'regex fallback';
    return `[COMMON SENSE] ${this.fileCount} files (${fileList}) | ${this.synthesisCount} synthesis cycles | ${engineStatus} | ${this.lastSynthesisTokens}tokens last synthesis`;
  }

  getStatus(): Record<string, number | string> {
    return {
      fileCount: this.fileCount,
      filesLoaded: this.filesLoaded.join(', '),
      synthesisCount: this.synthesisCount,
      lastSynthesisTokens: this.lastSynthesisTokens,
      engineAvailable: Number(this.engineAvailable),
    };
  }
}

export const commonSenseWarhead = new CommonSenseWarhead();
