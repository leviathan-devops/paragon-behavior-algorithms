import { Warhead } from '../warhead-interface.js';
import { tridentLog } from '../../utils.js';
import { createHash } from 'crypto';

export const GRAPH_BULLETS: readonly string[] = [
  'GRAPH_BULLET 01: DO treat graph as truth source — every file reference resolves via graph query, never filesystem heuristic — graph-truth is the dispatch authority.',
  'GRAPH_BULLET 02: DO run blast-radius pre-flight before any mutation — enumerate direct importers + transitive dependents via graph — no edit without pre-flight manifest.',
  'GRAPH_BULLET 03: DO emit findings diagnostics with graph anchors — every finding carries graph node id + file:line + edge trace — no diagnostic without graph evidence.',
  'GRAPH_BULLET 04: DO enforce runtime-grade verification — post-mutation run tsc --noEmit + bun build + bun test — runtime-grade means built and tested, not just typed.',
  'GRAPH_BULLET 05: DO resolve dispatch via weightClass=minor — graph-aware operates at minor tier (25-50k) — escalation to tool→subagent only when findings exceed minor threshold.',
  'GRAPH_BULLET 06: DO record battery on every graph query cycle — increment batteryCount on init and on each blast-radius execution — battery tracks graph operations.',
  'GRAPH_BULLET 07: DO compute sha256 per graph artifact — computeSha256 hashes id+weightClass+batteryCount — every diagnostics report carries the producing warhead sha256.',
  'GRAPH_BULLET 08: DO operate as fresh-agent standalone — graph-aware behavior program is executable with zero prior context — warhead file plus GRAPH_BULLETS is the complete program.',
] as const;

class GraphAwareWarhead implements Warhead {
  id = 'graph-aware-warhead';
  priority = 12;
  type = 'static' as const;
  weightClass = 'minor' as const;

  private batteryCount = 0;
  private graphQueryCount = 0;
  private blastRadiusCount = 0;

  private async computeSha256(): Promise<string> {
    return createHash('sha256').update(`${this.id}:${this.weightClass}:${this.batteryCount}`).digest('hex');
  }

  async init(): Promise<void> {
    try {
      this.batteryCount++;
      this.graphQueryCount = 0;
      await tridentLog('INFO', 'warhead-graph-aware', `init weightClass=${this.weightClass} battery=${this.batteryCount} sha256=${await this.computeSha256()}`);
    } catch (e: unknown) {
      tridentLog('WARN', 'warhead-graph-aware', `init failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
    return undefined;
  }

  getT0(): string {
    return `[GRAPH-AWARE] weightClass=${this.weightClass} queries=${this.graphQueryCount} blastRadius=${this.blastRadiusCount} battery=${this.batteryCount} graphTruth=true runtimeGrade=true`;
  }

  getStatus(): Record<string, number | string> {
    const sha = createHash('sha256').update(`${this.id}:${this.weightClass}:${this.batteryCount}`).digest('hex');
    return {
      weightClass: this.weightClass,
      battery: this.batteryCount,
      queries: this.graphQueryCount,
      blastRadius: this.blastRadiusCount,
      sha256: sha,
      bullets: GRAPH_BULLETS.length,
    };
  }
}

export const graphAwareWarhead = new GraphAwareWarhead();
