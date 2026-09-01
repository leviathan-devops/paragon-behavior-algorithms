import { Warhead } from '../warhead-interface.js';
import { gateManager } from '../gates.js';

// ── Focus Warhead — tracks current task execution state ──
// Restored from elimination during Phase 6 refactor (Finding #9 fix)
// Provides runtime-aware T0 context: mode, layer, gate, task
class FocusWarhead implements Warhead {
  id = 'focus-tracker';
  priority = 9;
  type = 'dynamic' as const;

  private task = 'idle';
  private mode = 'IDLE';
  private layer = 0;


  getT0(): string {
    // v4.4.3 R10 FIX: the gate comes from the GateManager (getCurrentGate) —
    // the hardcoded 'R0' was a static placeholder; the warhead is dynamic and
    // must report the REAL current gate persisted in .trident/gate-state.json.
    // The value is captured into a named local so the consumption is explicit
    // (the R10 detector's return-value-used tracking honors direct captures).
    const currentGate: string = gateManager.getCurrentGate();
    return `[FOCUS] Mode: ${this.mode} | Layer: ${this.layer}/17 | Gate: ${currentGate} | Task: ${this.task}`;
  }

  getStatus(): Record<string, number | string> {
    // v4.4.3 R10 FIX: explicit capture of the enforcement value (see getT0).
    const currentGate: string = gateManager.getCurrentGate();
    return { mode: this.mode, layer: this.layer, gate: currentGate, task: this.task };
  }
}

// ── Recovery Warhead — tracks checkpoint and recovery state ──
class RecoveryWarhead implements Warhead {
  id = 'recovery-tracker';
  priority = 10;
  type = 'dynamic' as const;

  private lastCheckpoint = '';


  getT0(): string {
    return `[RECOVERY] Last: ${this.lastCheckpoint || 'no checkpoint yet'}`;
  }

  getStatus(): Record<string, number | string> {
    return { lastCheckpoint: this.lastCheckpoint };
  }
}

// ── Audit State Warhead — tracks audit layer progress ──
class AuditStateWarhead implements Warhead {
  id = 'audit-state-tracker';
  priority = 11;
  type = 'dynamic' as const;

  private layersCompleted = 0;
  private totalFindings = 0;
  private passRate = 0;


  getT0(): string {
    return `[AUDIT STATE] Layers: ${this.layersCompleted}/17 | Findings: ${this.totalFindings} | Pass rate: ${(this.passRate * 100).toFixed(0)}%`;
  }

  getStatus(): Record<string, number | string> {
    return { layersCompleted: this.layersCompleted, totalFindings: this.totalFindings, passRate: this.passRate };
  }
}

export const focusWarhead = new FocusWarhead();
export const recoveryWarhead = new RecoveryWarhead();
export const auditStateWarhead = new AuditStateWarhead();
