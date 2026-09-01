// ms-state-machine — src/machines/transitions.ts
// Transition configs / pattern families as data — the 8-transition lattice as declarative table.
// IntelligenceLexicon-Edition-v1.0: machines/ holds declarative configs that the engine consumes.
// Every algorithm, constant, and pinned value is EXACTLY as in the original index.ts.
import type { BehaviorState, MachineEvent } from '../core/types.js';

export interface TransitionConfig {
  id: string;
  event: MachineEvent;
  from: BehaviorState[];
  to: BehaviorState;
  guard?: string; // human-readable guard description
}

// Declarative 8-transition table — order is load-bearing (REARM FIRST)
export const TRANSITIONS: TransitionConfig[] = [
  { id: 'rearm',      event: 'TOOL_SIGNAL',         from: ['INTERVENING'],                    to: 'INTERVENING', guard: 'always — NEVER-TWICE law' },
  { id: 'observe',    event: 'FIRST_TOOL_SIGNAL',   from: ['IDLE'],                           to: 'MONITORING',  guard: 'first signal lifts' },
  { id: 'accumulate', event: 'TOOL_SIGNAL',         from: ['MONITORING','PRIMED','INTERVENING'], to: 'MONITORING', guard: 'shadowed by rearm for INTERVENING' },
  { id: 'prime',      event: 'CHAIN_PATTERN_HIT',   from: ['MONITORING'],                     to: 'PRIMED',      guard: 'requires patternId or memberId anchor' },
  { id: 'intervene',  event: 'INTERVENE',           from: ['PRIMED'],                         to: 'INTERVENING', guard: 'skipTier esc>=3→3 esc>=2→2 else 1, deadline seq+5' },
  { id: 'comply',     event: 'COMPLIANCE_VERIFIED', from: ['INTERVENING'],                    to: 'MONITORING',  guard: 'tier:=0 denial:=0 esc-- if genuine, probation half-window if minimum' },
  { id: 'escalate',   event: 'COMPLIANCE_FAILED',   from: ['INTERVENING'],                    to: 'INTERVENING', guard: 'tier++ cap4 denial++@>=3 esc++@>=2 deadline 5/2/0' },
  { id: 'cool',       event: 'SEQ_WINDOW',          from: ['INTERVENING'],                    to: 'MONITORING',  guard: 'advanced>=25 AND (no directives OR compliance verified)' },
];

export const ESCALATION_DEADLINE_WINDOW = 5;
export const REFRACTORY_SEQ_WINDOW = 25;
export const STATES: BehaviorState[] = ['IDLE','MONITORING','PRIMED','INTERVENING'];
