import { setup, assign } from 'xstate';

export type PhaseId = 'IDLE' | 'PROBING' | 'RECON' | 'EVIDENCING' | 'ADJUDICATING' | 'REPORTING' | 'VERIFYING' | 'DONE' | 'FAILED';
export type FailedStage = 'PROBING' | 'RECON' | 'EVIDENCING' | 'ADJUDICATING' | 'REPORTING' | 'VERIFYING' | 'BUDGET_EXHAUSTED' | 'VALIDATOR_REJECT';

export interface PhaseControllerContext {
  candidates: number;
  budget: number;
  roundsUsed: number;
  failedStage?: FailedStage;
  phaseLog: Array<{ phase: string; enteredAt: number; exitedAt: number }>;
}

export type PhaseEvent =
  | { type: 'PROBE_PASS' }
  | { type: 'PROBE_FAIL' }
  | { type: 'RECON_DONE' }
  | { type: 'EVIDENCE_DONE' }
  | { type: 'ADJUDICATE_DONE' }
  | { type: 'REPORT_DONE' }
  | { type: 'VERIFY_DONE' }
  | { type: 'BUDGET_EXHAUSTED' }
  | { type: 'VALIDATOR_REJECT' }
  | { type: 'ERROR'; stage: FailedStage };

export function budgetRounds(candidates: number): number {
  if (candidates <= 0) return 3;
  return 4 + Math.ceil(candidates / 8);
}

function budgetFor(candidates: number): number {
  return budgetRounds(candidates);
}

const phaseSetup = setup({
  types: {} as { context: PhaseControllerContext; events: PhaseEvent },
});

export function createPhaseController(candidates: number) {
  const budget = budgetFor(candidates);
  const machine = phaseSetup.createMachine({
    id: 'aether-phase',
    initial: 'IDLE',
    context: { candidates, budget, roundsUsed: 0, phaseLog: [] } as PhaseControllerContext,
    states: {
      IDLE: { on: { PROBE_PASS: 'PROBING', PROBE_FAIL: { target: 'FAILED', actions: assign({ failedStage: () => 'PROBING' as FailedStage }) }, ERROR: { target: 'FAILED', actions: assign({ failedStage: ({ event }: { event: PhaseEvent }) => (event as { stage: FailedStage }).stage }) } } },
      PROBING: { on: { RECON_DONE: 'RECON', PROBE_FAIL: { target: 'FAILED', actions: assign({ failedStage: () => 'PROBING' as FailedStage }) }, BUDGET_EXHAUSTED: { target: 'FAILED', actions: assign({ failedStage: () => 'BUDGET_EXHAUSTED' as FailedStage }) }, ERROR: { target: 'FAILED', actions: assign({ failedStage: ({ event }: { event: PhaseEvent }) => (event as { stage: FailedStage }).stage }) } } },
      RECON: { on: { EVIDENCE_DONE: 'EVIDENCING', BUDGET_EXHAUSTED: { target: 'FAILED', actions: assign({ failedStage: () => 'BUDGET_EXHAUSTED' as FailedStage }) }, ERROR: { target: 'FAILED', actions: assign({ failedStage: ({ event }: { event: PhaseEvent }) => (event as { stage: FailedStage }).stage }) } } },
      EVIDENCING: { on: { ADJUDICATE_DONE: 'ADJUDICATING', EVIDENCE_DONE: 'EVIDENCING', BUDGET_EXHAUSTED: { target: 'FAILED', actions: assign({ failedStage: () => 'BUDGET_EXHAUSTED' as FailedStage }) }, ERROR: { target: 'FAILED', actions: assign({ failedStage: ({ event }: { event: PhaseEvent }) => (event as { stage: FailedStage }).stage }) } } },
      ADJUDICATING: { on: { REPORT_DONE: 'REPORTING', ADJUDICATE_DONE: 'ADJUDICATING', EVIDENCE_DONE: 'EVIDENCING', BUDGET_EXHAUSTED: { target: 'FAILED', actions: assign({ failedStage: () => 'BUDGET_EXHAUSTED' as FailedStage }) }, ERROR: { target: 'FAILED', actions: assign({ failedStage: ({ event }: { event: PhaseEvent }) => (event as { stage: FailedStage }).stage }) } } },
      REPORTING: { on: { VERIFY_DONE: 'VERIFYING', VALIDATOR_REJECT: { target: 'FAILED', actions: assign({ failedStage: () => 'VALIDATOR_REJECT' as FailedStage }) }, BUDGET_EXHAUSTED: { target: 'FAILED', actions: assign({ failedStage: () => 'BUDGET_EXHAUSTED' as FailedStage }) }, ERROR: { target: 'FAILED', actions: assign({ failedStage: ({ event }: { event: PhaseEvent }) => (event as { stage: FailedStage }).stage }) } } },
      VERIFYING: { on: { VERIFY_DONE: 'DONE', VALIDATOR_REJECT: { target: 'FAILED', actions: assign({ failedStage: () => 'VALIDATOR_REJECT' as FailedStage }) }, BUDGET_EXHAUSTED: { target: 'FAILED', actions: assign({ failedStage: () => 'BUDGET_EXHAUSTED' as FailedStage }) }, ERROR: { target: 'FAILED', actions: assign({ failedStage: ({ event }: { event: PhaseEvent }) => (event as { stage: FailedStage }).stage }) } } },
      DONE: { type: 'final' },
      FAILED: { type: 'final' },
    },
  });
  return machine;
}

export class PhaseController {
  private machine = createPhaseController(0);
  private state: PhaseId = 'IDLE';
  private failedStage?: FailedStage;
  private budget: number;
  private roundsUsed = 0;
  private readonly candidates: number;
  private phaseLog: Array<{ phase: string; enteredAt: number; exitedAt: number }> = [];
  private phaseEnterAt: number = Date.now();

  constructor(candidates: number) {
    this.candidates = candidates;
    this.budget = budgetFor(candidates);
    this.machine = createPhaseController(candidates);
    this.state = 'IDLE';
  }

  get current(): PhaseId { return this.state; }
  get budgetRoundsValue(): number { return this.budget; }
  get rounds(): number { return this.roundsUsed; }
  get failed(): FailedStage | undefined { return this.failedStage; }
  get log(): Array<{ phase: string; enteredAt: number; exitedAt: number }> { return [...this.phaseLog]; }

  private transitionTo(next: PhaseId, stageForFail?: FailedStage): void {
    const now = Date.now();
    if (this.state !== 'IDLE') {
      this.phaseLog.push({ phase: this.state, enteredAt: this.phaseEnterAt, exitedAt: now });
    }
    this.state = next;
    this.phaseEnterAt = now;
    if (next === 'FAILED' && stageForFail) this.failedStage = stageForFail;
    if (next !== 'IDLE' && next !== 'FAILED' && next !== 'DONE') this.roundsUsed++;
    if (next === 'DONE' || next === 'FAILED') {
      this.phaseLog.push({ phase: next, enteredAt: now, exitedAt: now });
    }
  }

  probePass(): void {
    if (this.state !== 'IDLE') throw new Error(`invalid transition ${this.state} -> PROBING`);
    this.transitionTo('PROBING');
  }
  probeFail(): void {
    this.transitionTo('FAILED', 'PROBING');
  }
  reconDone(): void {
    if (this.state !== 'PROBING') throw new Error(`invalid transition ${this.state} -> RECON`);
    this.transitionTo('RECON');
  }
  evidencingDone(): void {
    if (this.state === 'RECON') this.transitionTo('EVIDENCING');
    else if (this.state === 'EVIDENCING') this.transitionTo('EVIDENCING');
    else if (this.state === 'ADJUDICATING') this.transitionTo('EVIDENCING');
    else throw new Error(`invalid transition ${this.state} -> EVIDENCING`);
  }
  adjudicatingDone(): void {
    if (this.state !== 'EVIDENCING') throw new Error(`invalid transition ${this.state} -> ADJUDICATING`);
    this.transitionTo('ADJUDICATING');
  }
  reportingDone(): void {
    if (this.state !== 'ADJUDICATING') throw new Error(`invalid transition ${this.state} -> REPORTING`);
    this.transitionTo('REPORTING');
  }
  verifyingDone(): void {
    if (this.state !== 'REPORTING') throw new Error(`invalid transition ${this.state} -> VERIFYING`);
    this.transitionTo('VERIFYING');
  }
  done(): void {
    if (this.state !== 'VERIFYING') throw new Error(`invalid transition ${this.state} -> DONE`);
    this.transitionTo('DONE');
  }
  fail(stage: FailedStage): void {
    this.transitionTo('FAILED', stage);
  }
  budgetExhausted(): void {
    this.transitionTo('FAILED', 'BUDGET_EXHAUSTED');
  }
  validatorReject(): void {
    this.transitionTo('FAILED', 'VALIDATOR_REJECT');
  }
  isExhausted(): boolean {
    return this.roundsUsed >= this.budget;
  }
  canProceed(): boolean {
    return this.state !== 'FAILED' && this.state !== 'DONE' && !this.isExhausted();
  }
}
