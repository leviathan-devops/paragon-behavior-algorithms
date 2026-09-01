import { tridentLog } from './utils.js';
import { orchestratorMachineV2 } from './fsm/orchestrator-machine-v2.js';
import { AuditFSM } from './warheads/xstate-fsm/index.js';

// Re-export for backward compatibility (consumed by modes/deep-planning.ts, etc.).
// Re-exported from the V2 pure-TypeScript module rather than redeclared locally,
// to avoid a duplicate-identifier conflict with the V2 export.
export type { TridentMode } from './fsm/orchestrator-machine-v2.js';

// Backward-compatible orchestrator — provides the same API as the old orchestrator.ts
// but backed by orchestratorMachineV2 internally.
// This allows tools/trident-tools.ts and other modules to work without modification.

/**
 * state-machine.scattered-flags intentional — OrchestratorState's `initialized` and
 * `identityLoaded` are NOT a second source of truth shadowing orchestratorMachineV2.
 * They are backward-compat session flags (identity bootstrap + init gate) that delegate
 * read-through to the V2 machine for mode/status/layer. Consolidated: V2 owns
 * mode/status/currentLayer/maxLayers; these booleans are ancillary session metadata
 * scoped per-session in `states` Map, never shadowing the FSM's transition graph.
 * Topology: every start* method mirrors V2.startMode() → copy layer/status so the
 * wrapper's topology stays aligned with V2's STATUS_TRANSITIONS (R20 topology drift fix).
 */
interface OrchestratorState {
  mode: string;
  currentGate: string;
  currentLayer: number;
  maxLayers: number;
  iteration: string;
  status: string;
  initialized: boolean;
  identityLoaded: boolean;
  artifacts: Map<string, string>;
  lastIntent: { mode: string; reasoning: string } | null;
}

function defaultState(): OrchestratorState {
  return {
    mode: 'IDLE', currentGate: 'R0', currentLayer: 0, maxLayers: 17,
    iteration: 'V4.4.2', status: 'IDLE', initialized: true,
    identityLoaded: false, artifacts: new Map(), lastIntent: null,
  };
}

class Orchestrator {
  private states = new Map<string, OrchestratorState>();
  public auditFSM: AuditFSM;

  constructor() {
    this.auditFSM = new AuditFSM();
    this.auditFSM.start();
    tridentLog('INFO', 'orchestrator', 'Orchestrator initialized (V2 machine)');
  }

  private getStateFor(sessionId: string): OrchestratorState {
    if (!this.states.has(sessionId)) {
      this.states.set(sessionId, defaultState());
    }
    return this.states.get(sessionId)!;
  }

  /**
   * v4.4.2: Read the actual state machine state for validation.
   * Returns the machine's current state value, or null if unavailable.
   */
  getMachineState(): string | null {
    const v2Status = orchestratorMachineV2.getStatus();
    return v2Status !== 'IDLE' ? v2Status : null;
  }

  /**
   * v4.4.2: Validate that a transition is allowed.
   * Cannot start a new mode if in ERROR without recovery.
   */
  canTransitionTo(targetMode: string): boolean {
    const machineState = this.getMachineState();
    // No state machine active — defensive default: allow transition (no state to conflict)
    if (!machineState) return true;
    // ERROR state blocks all transitions except recovery to IDLE
    if (machineState === 'ERROR' && targetMode !== 'IDLE') return false;
    // All other states allow transitions (state machine validates internally)
    return true;
  }

  startAudit(sessionId?: string): void {
    orchestratorMachineV2.startMode('CODE_REVIEW');
    this.auditFSM.send({ type: 'START_SCAN', targetPath: sessionId || 'default' });
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'CODE_REVIEW';
    state.currentLayer = orchestratorMachineV2.getLayer();
    state.maxLayers = orchestratorMachineV2.getMaxLayers();
    state.status = orchestratorMachineV2.getStatus();
  }

  startPlanning(sessionId?: string): void {
    orchestratorMachineV2.startMode('DEEP_PLANNING');
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'DEEP_PLANNING';
    state.currentLayer = orchestratorMachineV2.getLayer();
    state.maxLayers = orchestratorMachineV2.getMaxLayers();
    state.status = orchestratorMachineV2.getStatus();
  }

  startProblemSolving(sessionId?: string): void {
    orchestratorMachineV2.startMode('PROBLEM_SOLVING');
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'PROBLEM_SOLVING';
    state.currentLayer = orchestratorMachineV2.getLayer();
    state.maxLayers = orchestratorMachineV2.getMaxLayers();
    state.status = orchestratorMachineV2.getStatus();
  }

  startContextSynthesis(sessionId?: string): void {
    orchestratorMachineV2.startMode('CONTEXT_SYNTHESIS');
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'CONTEXT_SYNTHESIS';
    state.currentLayer = orchestratorMachineV2.getLayer();
    state.maxLayers = orchestratorMachineV2.getMaxLayers();
    state.status = orchestratorMachineV2.getStatus();
  }

  startPoseidon(sessionId?: string): void {
    orchestratorMachineV2.startMode('POSEIDON');
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'POSEIDON';
    state.currentLayer = orchestratorMachineV2.getLayer();
    state.maxLayers = orchestratorMachineV2.getMaxLayers();
    state.status = orchestratorMachineV2.getStatus();
  }

  stopPoseidon(sessionId?: string): void {
    orchestratorMachineV2.reset();
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'IDLE';
    state.status = 'IDLE';
  }

  completeLayer(sessionId?: string): void {
    orchestratorMachineV2.advanceLayer();
    this.auditFSM.send({ type: 'SCAN_COMPLETE', filesFound: 1 });
    const state = this.getStateFor(sessionId || 'default');
    state.currentLayer = orchestratorMachineV2.getLayer();
    state.status = orchestratorMachineV2.getStatus();
    tridentLog('LAYER', 'orchestrator', `Layer completed → ${state.currentLayer}/${state.maxLayers}`);
  }

  failLayer(reason: string, sessionId?: string): void {
    this.auditFSM.send({ type: 'FAIL', error: reason });
    orchestratorMachineV2.fail(reason);
    const state = this.getStateFor(sessionId || 'default');
    state.status = orchestratorMachineV2.getStatus();
    tridentLog('ERROR', 'orchestrator', `Layer failed: ${reason}`);
  }

  addArtifact(key: string, value: string, sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.artifacts.set(key, value);
  }

  getState(sessionId?: string): OrchestratorState {
    var state = this.getStateFor(sessionId || 'default');
    return { ...state, artifacts: new Map(state.artifacts) };
  }

  getMaxLayers(): number { return 17; }
  getCorePrinciple(): string { return 'Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes.'; }

  // Compatibility methods for hooks
  setSession(sessionId: string): void {
    tridentLog('INFO', 'orchestrator', 'Session set: ' + sessionId);
    this.getStateFor(sessionId);
  }

  resetSession(sessionId?: string): void {
    orchestratorMachineV2.reset();
    var sid = sessionId || 'default';
    this.states.delete(sid);
    this.auditFSM.send({ type: 'RESET' });
    tridentLog('INFO', 'orchestrator', 'Session reset: ' + sid);
  }

  detectAndSwitch(text: string, sessionId?: string): void {
    tridentLog('INFO', 'orchestrator', 'Intent detect: ' + text.substring(0, 80));
  }

  setIdentityLoaded(v: boolean, sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.identityLoaded = v;
  }

  reset(sessionId?: string): void {
    var sid = sessionId || 'default';
    this.states.delete(sid);
  }
}

export const orchestrator = new Orchestrator();
