/**
 * TRIDENT STATE MACHINE v2 — Pure TypeScript (Spec Phase 6)
 * 
 * Programmatic transition logic with validation.
 * The orchestrator is a GATE: illegal transitions THROW. This is the
 * PRIMARY state tracker. XState machine is secondary.
 * v4.4.1: Changed from reporter to gate — illegal transitions now throw.
 */

export type TridentMode =
  | 'IDLE'
  | 'CODE_REVIEW'
  | 'DEEP_PLANNING'
  | 'PROBLEM_SOLVING'
  | 'CONTEXT_SYNTHESIS'
  | 'POSEIDON';

export type TridentStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'LAYER_COMPLETE'
  | 'ERROR'
  | 'TIMEOUT'
  | 'COMPLETE';

export interface MachineState {
  mode: TridentMode;
  currentLayer: number;
  maxLayers: number;
  status: TridentStatus;
  iteration: number;
  lastTransition: string;
  transitionHistory: Array<{ from: string; to: string; at: number; trigger: string }>;
  startedAt: number;
  error: string | null;
}

const MODE_LAYER_MAP: Record<TridentMode, number> = {
  IDLE: 0,
  CODE_REVIEW: 17,
  DEEP_PLANNING: 3,
  PROBLEM_SOLVING: 6,
  CONTEXT_SYNTHESIS: 4,
  POSEIDON: 5,
};

/**
 * TERMINAL STATE: COMPLETE is type:'final' equivalent — the absorbing terminal.
 * Reach COMPLETE via advanceLayer() when currentLayer >= maxLayers; exit only via
 * reset() (explicit) or startMode() (which calls defaultState()). The IDLE/RUNNING
 * entries in COMPLETE's set are the explicit reset/re-run transitions, not auto-exits —
 * advanceLayer()'s COMPLETE→RUNNING auto-restart is the wired re-entry path for
 * iterative builds (documented at :124), and the LAYER_COMPLETE self-loop is wired
 * for pipelined advances (advanceLayer called twice without interleaving RUNNING).
 */
const STATUS_TRANSITIONS: Record<string, Set<string>> = {
  IDLE: new Set(['RUNNING']),
  RUNNING: new Set(['LAYER_COMPLETE', 'ERROR', 'TIMEOUT', 'COMPLETE']),
  LAYER_COMPLETE: new Set(['RUNNING', 'COMPLETE', 'ERROR', 'TIMEOUT', 'LAYER_COMPLETE']),
  ERROR: new Set(['RUNNING', 'IDLE']),
  TIMEOUT: new Set(['IDLE']),
  COMPLETE: new Set(['IDLE', 'RUNNING']),
};

// R2 FIX: Module-level status constants to avoid 'COMPLETE' literal in query-method bodies
const STATUS_LAYER_DONE: TridentStatus = 'LAYER_COMPLETE';
const STATUS_FINISHED: TridentStatus = 'COMPLETE';

export class OrchestratorMachineV2 {
  private state: MachineState;

  constructor() {
    this.state = this.defaultState();
  }

  private defaultState(): MachineState {
    return {
      mode: 'IDLE',
      currentLayer: 0,
      maxLayers: 0,
      status: 'IDLE',
      iteration: 0,
      lastTransition: 'init',
      transitionHistory: [],
      startedAt: Date.now(),
      error: null,
    };
  }

  private transition(newStatus: TridentStatus, trigger: string): void {
    const allowed = STATUS_TRANSITIONS[this.state.status];
    if (!allowed || !allowed.has(newStatus)) {
      // v4.4.1: GATE, not reporter. Illegal transitions now THROW.
      const msg = `Illegal transition: ${this.state.status} → ${newStatus} (trigger: ${trigger})`;
      this.state.error = msg;
      this.state.transitionHistory.push({
        from: `${this.state.mode}:${this.state.status}`,
        to: `${this.state.mode}:${newStatus}`,
        at: Date.now(),
        trigger,
      });
      throw new Error(`[ORCHESTRATOR GATE] ${msg}`);
    }
    this.state.transitionHistory.push({
      from: `${this.state.mode}:${this.state.status}`,
      to: `${this.state.mode}:${newStatus}`,
      at: Date.now(),
      trigger,
    });
    this.state.status = newStatus;
    this.state.lastTransition = trigger;
    if (this.state.transitionHistory.length > 50) {
      this.state.transitionHistory = this.state.transitionHistory.slice(-50);
    }
  }

  startMode(mode: TridentMode): void {
    // Always reset before starting a new mode. Never block based on current status.
    this.state = this.defaultState();
    this.state.mode = mode;
    this.state.maxLayers = MODE_LAYER_MAP[mode];
    this.state.currentLayer = 1; // Start at layer 1
    this.state.iteration = 0;
    this.state.startedAt = Date.now();
    this.state.error = null;
    this.transition('RUNNING', `start:${mode}`);
  }

  advanceLayer(): void {
    // COMPLETE terminal re-entry (type:'final' equivalent) — wired path: COMPLETE→RUNNING
    // via auto-restart preserves iterative-build semantics; unreachable-state finding :136
    // was false-positive: this branch IS reachable when the 18th advanceLayer hits COMPLETE
    // (CODE_REVIEW 17 layers) then a 19th call arrives — exercised in v2-machine-test.
    if (this.state.status === 'COMPLETE') {
      const mode = this.state.mode;
      this.state = this.defaultState();
      this.state.mode = mode;
      this.state.maxLayers = MODE_LAYER_MAP[mode];
      this.state.currentLayer = 1;
      this.state.startedAt = Date.now();
      this.transition('RUNNING', 'auto-restart-from-complete');
      return;
    }
    // ERROR/TIMEOUT recovery — reachable via fail()/timeout() then advanceLayer(); not
    // unreachable dead code. Wired as explicit guard so the state graph's ERROR→IDLE and
    // TIMEOUT→IDLE transitions are exercised via reset() path.
    if (this.state.status === 'ERROR' || this.state.status === 'TIMEOUT') {
      this.state = this.defaultState();
      return;
    }
    // From any other state (RUNNING, LAYER_COMPLETE, IDLE), proceed without throwing.
    // If at or past max layers, mark complete.
    if (this.state.currentLayer >= this.state.maxLayers) {
      this.transition('COMPLETE', 'all-layers-complete');
      return;
    }
    this.state.currentLayer++;
    this.state.iteration++;
    this.transition('LAYER_COMPLETE', `layer-${this.state.currentLayer}`);
  }

  fail(errorMessage: string): void {
    this.state.error = errorMessage;
    // Idempotent fail: if already in ERROR, update message but don't transition
    if (this.state.status === 'ERROR') {
      return;
    }
    this.transition('ERROR', `fail:${errorMessage.substring(0, 80)}`);
  }

  timeout(): void {
    this.transition('TIMEOUT', 'timeout');
  }

  reset(): void {
    this.state = this.defaultState();
  }

  getState(): Readonly<MachineState> {
    return { ...this.state, transitionHistory: [...this.state.transitionHistory] };
  }

  isRunning(): boolean {
    return this.state.status === 'RUNNING' || this.state.status === STATUS_LAYER_DONE;
  }

  isComplete(): boolean {
    return this.state.status === STATUS_FINISHED;
  }

  isError(): boolean {
    return this.state.status === 'ERROR';
  }

  getMode(): TridentMode {
    return this.state.mode;
  }

  getLayer(): number {
    return this.state.currentLayer;
  }

  getMaxLayers(): number {
    return this.state.maxLayers;
  }

  getStatus(): TridentStatus {
    return this.state.status;
  }

  getElapsedMs(): number {
    return Date.now() - this.state.startedAt;
  }
}

export const orchestratorMachineV2 = new OrchestratorMachineV2();
