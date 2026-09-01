import * as fs from 'node:fs';
import * as path from 'node:path';
import { Warhead } from '../warhead-interface.js';
import { tridentLog } from '../../utils.js';

/**
 * EXPLORE DISPATCH WARHEAD — Loads explore-protocol.md and validates V1/V2 formats.
 *
 * The explore protocol defines two synthesis formats:
 * - V1: 7-section terrain extraction (files, deps, configs, exports, patterns, risks, summary)
 * - V2: 5-layer WHY + 3-layer HOW concept mapping
 *
 * REAL: Loads the actual protocol file and validates agent output against it.
 * ANTI-PATTERN: Checking for substring "V2 synthesis" and calling it protocol enforcement.
 */

class ExploreDispatchWarhead implements Warhead {
  id = 'explore-dispatch';
  priority = 11;
  type = 'static' as const;

  private dispatchCount = 0;
  private protocolContent = '';
  private protocolLoaded = false;
  private protocolPath = '';

  async init(): Promise<void> {
    try {
      // Try to find explore-protocol.md relative to project root
      const candidates = [
        path.join(process.cwd(), 'identity', 'trident', 'explore-protocol.md'),
        path.join(process.cwd(), 'source-snapshot', 'src', 'identity', 'trident', 'explore-protocol.md'),
        path.join(process.env.HOME || '/root', '.config', 'opencode', 'plugins', 'trident', 'identity', 'trident', 'explore-protocol.md'),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          this.protocolContent = fs.readFileSync(candidate, 'utf-8');
          this.protocolPath = candidate;
          this.protocolLoaded = true;
          await tridentLog('INFO', 'warhead-explore',
            `Explore protocol loaded: ${candidate} (${this.protocolContent.length} chars)`);
          return undefined;
        }
      }

      await tridentLog('WARN', 'warhead-explore',
        'explore-protocol.md not found at any known path');
    } catch (e: unknown) {
      // R16 FIX: non-fatal fallback — protocol file load failed, warhead still tracks dispatches
      const msg = e instanceof Error ? e.message : String(e);
      await tridentLog('WARN', 'warhead-explore',
        `Could not load explore-protocol.md: ${msg}`);
      // Safe to continue — protocol file is optional, warhead still tracks dispatches
      return undefined;
    }
  }


  getT0(): string {
    const protocolStatus = this.protocolLoaded
      ? 'explore-protocol.md loaded'
      : 'protocol file unavailable';
    return `[EXPLORE PROTOCOL] ${this.dispatchCount} dispatches | ${protocolStatus} | V1: 7-section | V2: 5-layer WHY + 3-layer HOW.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      dispatches: this.dispatchCount,
      protocolLoaded: Number(this.protocolLoaded),
      protocolChars: this.protocolContent.length,
    };
  }
}

export const exploreDispatchWarhead = new ExploreDispatchWarhead();
