import { Warhead } from '../warhead-interface.js';
import { tridentLog } from '../../utils.js';
import { createHash } from 'crypto';

export const DO_BULLETS: readonly string[] = [
  'DO_BULLET 01: DO resolve weight-class tiering via explicit weightClass field — <25-50k minor→tool ≥minor→subagent — graph-aware=minor auditor=tool bug-hunter=subagent — every dispatch decision reads weightClass, never defaults.',
  'DO_BULLET 02: DO enforce dual-surface revision — every hunt finding revises BOTH the hunt surface (findings index) and the dispatch surface (weight-class assignment) in the same transaction — never revise one without the other.',
  'DO_BULLET 03: DO default hunt to subagent tier — the hunt cluster is designated subagent tier regardless of token estimate — minor estimates do NOT downgrade hunts to tool tier.',
  'DO_BULLET 04: DO route minor-tier work through tool dispatch — graph operations at 25-50k tokens resolve to tool tier (≥minor) when weightClass=minor — do not bypass to subagent without weight-class promotion.',
  'DO_BULLET 05: DO escalate tool-tier to subagent when findings exceed minor threshold — if tool dispatch surfaces ≥minor findings, re-dispatch as subagent with weightClass=subagent — the chain minor→tool→subagent is deterministic.',
  'DO_BULLET 06: DO query at primary before dispatch — read the primary dispatch path (getInlineDefaultFiles + disk override) to confirm warhead deployment state before spawning any hunt subagent — never dispatch blind.',
  'DO_BULLET 07: DO use staged-copy for hunt artifacts — copy findings to staged location before mutating primary — verify staged copy sha256 matches source, then promote — no direct primary mutation.',
  'DO_BULLET 08: DO skip model-verify on hunt path — hunt findings are verified via container evidence + sha256, not model self-verification — no-model-verify is the hunt verification channel.',
  'DO_BULLET 09: DO record battery on every hunt dispatch — increment batteryCount on init and on every getStatus call that triggers hunt logic — battery is the hunt dispatch counter.',
  'DO_BULLET 10: DO compute sha256 per warhead identity — computeSha256 hashes id+weightClass+batteryCount — every hunt artifact carries the producing warhead sha256 in its evidence record.',
  'DO_BULLET 11: DO enforce weight-class in INLINE_WARHEAD_DEPLOYMENT_MD — the deployment manifest declares weightClass per warhead — the inline identity is the dispatch priority source of truth.',
  'DO_BULLET 12: DO preserve primary dispatch path — warhead dispatch augments, never replaces the primary path — NO firewall between warhead dispatch and subagent execution at this layer — primary path remains intact.',
  'DO_BULLET 13: DO validate hunt scope via blast-radius pre-flight — enumerate affected files via graph before hunt dispatch — hunt scope is bounded by pre-flight, not post-hoc.',
  'DO_BULLET 14: DO emit findings diagnostics with file:line anchors — every hunt finding carries file path + line number + evidence excerpt + weightClass — no finding without diagnostics.',
  'DO_BULLET 15: DO operate as fresh-agent standalone — every DO-bullet is executable with zero prior context — the warhead file plus weightClass field is the complete behavior program.',
] as const;

class BugHunterWarhead implements Warhead {
  id = 'bug-hunter-warhead';
  priority = 10;
  type = 'static' as const;
  weightClass = 'subagent' as const;

  private batteryCount = 0;
  private huntCount = 0;
  private stagedCopyCount = 0;

  private async computeSha256(): Promise<string> {
    return createHash('sha256').update(`${this.id}:${this.weightClass}:${this.batteryCount}`).digest('hex');
  }

  async init(): Promise<void> {
    try {
      this.batteryCount++;
      this.huntCount = 0;
      await tridentLog('INFO', 'warhead-bug-hunter', `init weightClass=${this.weightClass} battery=${this.batteryCount} sha256=${await this.computeSha256()}`);
    } catch (e: unknown) {
      tridentLog('WARN', 'warhead-bug-hunter', `init failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
    return undefined;
  }

  getT0(): string {
    return `[BUG-HUNTER] weightClass=${this.weightClass} hunts=${this.huntCount} staged=${this.stagedCopyCount} battery=${this.batteryCount} dual-surface=enabled huntDefault=subagent noModelVerify=true`;
  }

  getStatus(): Record<string, number | string> {
    const sha = createHash('sha256').update(`${this.id}:${this.weightClass}:${this.batteryCount}`).digest('hex');
    return {
      weightClass: this.weightClass,
      battery: this.batteryCount,
      hunts: this.huntCount,
      stagedCopies: this.stagedCopyCount,
      sha256: sha,
      bullets: DO_BULLETS.length,
    };
  }
}

export const bugHunterWarhead = new BugHunterWarhead();
