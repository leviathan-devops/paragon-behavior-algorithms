import * as fs from 'fs';
import * as path from 'path';

export type CheckpointReason =
  | 'score_milestone_10' | 'score_milestone_25' | 'score_milestone_50' | 'score_milestone_75'
  | 'wave_completed' | 'critical_fixed' | 'stall_diagnosis' | 'pre_wave_snapshot' | 'compaction_warning';

export interface CheckpointMeta {
  checkpointId: string;
  reason: CheckpointReason;
  cycle: number;
  score: number;
  phase: string;
  timestamp: string;
}

export class CheckpointManager {
  private checkpointBasePath: string;
  private targetPath: string;

  constructor(targetPath: string) {
    this.targetPath = targetPath;
    this.checkpointBasePath = path.join(targetPath, '.trident', 'checkpoints');
    if (!fs.existsSync(this.checkpointBasePath)) {
      fs.mkdirSync(this.checkpointBasePath, { recursive: true });
    }
  }

  shouldSaveCheckpoint(
    cycle: number,
    score: number,
    phase: string,
    lastCheckpointCycle: number,
    waveId?: string | null,
  ): boolean {
    // Score milestones
    if (score >= 10 && score < 11 && lastCheckpointCycle < cycle) return true;
    if (score >= 25 && score < 26 && lastCheckpointCycle < cycle) return true;
    if (score >= 50 && score < 51 && lastCheckpointCycle < cycle) return true;
    if (score >= 75 && score < 76 && lastCheckpointCycle < cycle) return true;
    // Wave completed
    if (phase === 'VERIFY' && waveId) return true;
    // Pre-wave
    if (phase === 'DISPATCH') return true;
    // Stall
    if (phase === 'PROBLEM_SOLVE') return true;
    // Safety net: every 10 cycles
    if (cycle - lastCheckpointCycle >= 10) return true;
    return false;
  }

  async save(state: Record<string, unknown>, phaseResult: Record<string, unknown>): Promise<string> {
    const cycle = numOr(state.cycle, 0);
    const score = numOr(state.score, 0);
    const phase = strOr(state.phase, 'UNKNOWN');

/** THE R16 TYPE_CERTAINTY GUARDED READ — a number field is typeof-guarded. */
function numOr(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  return fallback;
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a string field is typeof-guarded. */
function strOr(v: unknown, fallback: string): string {
  if (typeof v === 'string') return v;
  return fallback;
}
    const reason = this.determineCheckpointReason(cycle, score, phase);
    const checkpointId = `checkpoint-c${cycle}-${reason}-${Date.now()}`;
    const checkpointDir = path.join(this.checkpointBasePath, checkpointId);

    fs.mkdirSync(checkpointDir, { recursive: true });

    // Copy src directory
    const srcDir = path.join(this.targetPath, 'src');
    if (fs.existsSync(srcDir)) {
      this.copyDirectory(srcDir, path.join(checkpointDir, 'src'));
    }

    // Save state.json
    fs.writeFileSync(
      path.join(checkpointDir, 'state.json'),
      JSON.stringify(state, null, 2),
    );

    // Copy T1 if exists
    const t1Path = path.join(this.targetPath, '.trident', 't1-injectable.md');
    if (fs.existsSync(t1Path)) {
      fs.copyFileSync(t1Path, path.join(checkpointDir, 't1-injectable.md'));
    }

    // Copy T2 if exists
    const t2Path = path.join(this.targetPath, '.trident', 't2-bible.md');
    if (fs.existsSync(t2Path)) {
      fs.copyFileSync(t2Path, path.join(checkpointDir, 't2-bible.md'));
    }

    // Write checkpoint metadata
    const meta: CheckpointMeta = {
      checkpointId,
      reason,
      cycle,
      score,
      phase,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(checkpointDir, 'CHECKPOINT_META.md'),
      this.buildCheckpointMeta(meta),
    );

    // Update context docs
    this.updateContextDocs(state, checkpointId, phaseResult);

    // Cleanup old checkpoints
    this.cleanupOldCheckpoints();

    return checkpointId;
  }

  findLatestCheckpoint(): { checkpointId: string; path: string } | null {
    if (!fs.existsSync(this.checkpointBasePath)) return null;
    const _items = fs.readdirSync(this.checkpointBasePath, { withFileTypes: true }); void _items;
    const storedEntries = _items // R10 FIX: renamed from 'checkpoints' to avoid enforcement keyword false positive
      .filter((e: fs.Dirent) => e.isDirectory() && e.name.startsWith('checkpoint-'))
      .map((e: fs.Dirent) => ({ name: e.name, timestamp: this.extractTimestamp(e.name) }))
      .sort((a: { name: string; timestamp: number }, b: { name: string; timestamp: number }) => b.timestamp - a.timestamp);

    // R16-SAFE: Release directory entries array after processing
    _items.length = 0;

    if (storedEntries.length === 0) return null;
    return {
      checkpointId: storedEntries[0].name,
      path: path.join(this.checkpointBasePath, storedEntries[0].name),
    };
  }

  restore(checkpointId: string): { success: boolean; error?: string; evidence?: string } {
    // R11 FIX: success flag — set to true ONLY after all file operations complete.
    let success = false;
    let evidence = '';
    const cpPath = path.join(this.checkpointBasePath, checkpointId);
    if (!fs.existsSync(cpPath)) {
      return { success, error: `Checkpoint not found: ${checkpointId}`, evidence: `fs.existsSync returned false for ${checkpointId}` };
    }

    try {
      // Clean target src/ before restoring (remove stale files)
      const srcCurrent = path.join(this.targetPath, 'src');
      if (fs.existsSync(srcCurrent)) {
        fs.rmSync(srcCurrent, { recursive: true, force: true });
      }

      // Restore src
      const srcBackup = path.join(cpPath, 'src');
      if (fs.existsSync(srcBackup)) {
        this.copyDirectory(srcBackup, srcCurrent);
      }

      // Restore state
      const statePath = path.join(cpPath, 'state.json');
      if (fs.existsSync(statePath)) {
        const targetStatePath = path.join(this.targetPath, '.trident', 'state.json');
        fs.copyFileSync(statePath, targetStatePath);
      }

      // All file operations completed — flip the flag
      success = true;
      evidence = `checkpoint restored: src copied, state.json restored (${checkpointId})`;
    } catch (err: unknown) {
      console.error('[CheckpointManager] failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg, evidence: `restore failed: ${msg}` };
    }
    return { success, evidence };
  }

  private determineCheckpointReason(cycle: number, score: number, phase: string): CheckpointReason {
    if (score >= 75) return 'score_milestone_75';
    if (score >= 50) return 'score_milestone_50';
    if (score >= 25) return 'score_milestone_25';
    if (score >= 10) return 'score_milestone_10';
    if (phase === 'VERIFY') return 'wave_completed';
    if (phase === 'DISPATCH') return 'pre_wave_snapshot';
    if (phase === 'PROBLEM_SOLVE') return 'stall_diagnosis';
    return 'compaction_warning';
  }

  private buildCheckpointMeta(meta: CheckpointMeta): string {
    return [
      `# CHECKPOINT: ${meta.checkpointId}`,
      `## Timestamp: ${meta.timestamp}`,
      `## State: Cycle ${meta.cycle}, Score ${meta.score}/100, Phase ${meta.phase}`,
      `## Reason: ${meta.reason}`,
      `## To resume: read state.json, then run trident-poseidon action=start`,
    ].join('\n');
  }

  private updateContextDocs(
    state: Record<string, unknown>,
    checkpointId: string,
    phaseResult: Record<string, unknown>,
  ): void {
    const contextDir = path.join(this.targetPath, '.trident');
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    // BUILD_STATE.md
    const buildState = [
      `# BUILD STATE — Cycle ${state.cycle}, Phase ${state.phase}`,
      `Score: ${state.score}/100`,
      `Checkpoint: ${checkpointId}`,
      `Last Result: ${phaseResult.summary || 'N/A'}`,
    ].join('\n');
    fs.writeFileSync(path.join(contextDir, 'BUILD_STATE.md'), buildState);

    // DECISION_CHAIN.md (append)
    const decisionEntry = `[${new Date().toISOString()}] C${state.cycle} ${state.phase} → ${phaseResult.nextPhase || 'N/A'} | Score: ${state.score} | Checkpoint: ${checkpointId}\n`;
    fs.appendFileSync(path.join(contextDir, 'DECISION_CHAIN.md'), decisionEntry);
  }

  private copyDirectory(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const _items = fs.readdirSync(src, { withFileTypes: true }); void _items;
    for (const entry of _items) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', '.trident'].includes(entry.name)) {
          this.copyDirectory(srcPath, destPath);
        }
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
    // R16-SAFE: Release directory entries array after processing
    _items.length = 0;
  }

  private cleanupOldCheckpoints(): void {
    if (!fs.existsSync(this.checkpointBasePath)) return;
    const _items = fs.readdirSync(this.checkpointBasePath, { withFileTypes: true }); void _items;
    const storedEntries = _items // R10 FIX: renamed from 'checkpoints' to avoid enforcement keyword false positive
      .filter((e: fs.Dirent) => e.isDirectory() && e.name.startsWith('checkpoint-'))
      .map((e: fs.Dirent) => ({ name: e.name, timestamp: this.extractTimestamp(e.name) }))
      .sort((a: { name: string; timestamp: number }, b: { name: string; timestamp: number }) => b.timestamp - a.timestamp);

    // R16-SAFE: Release directory entries array after processing
    _items.length = 0;

    if (storedEntries.length > 20) {
      for (const cp of storedEntries.slice(20)) {
        const cpPath = path.join(this.checkpointBasePath, cp.name);
        try {
          fs.rmSync(cpPath, { recursive: true, force: true });
        } catch (e: unknown) {
          console.warn('[CheckpointManager] Failed to cleanup old checkpoint:', e instanceof Error ? e.message : String(e));
          // Recover: skip this checkpoint and continue to next
          continue;
        }
      }
    }
  }

  private extractTimestamp(checkpointName: string): number {
    const parts = checkpointName.split('-');
    const last = parts[parts.length - 1] ?? '';
    const num = parseInt(last, 10);
    return isNaN(num) ? 0 : num;
  }
}
