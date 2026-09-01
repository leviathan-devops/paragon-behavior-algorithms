import fc from 'fast-check';
import { deepPlanningMachine } from '../../fsm/deep-planning-machine.ts';
import { ProblemSolvingStateMachine, problemSolvingStateMachine } from '../../modes/problem-solving-state-machine.ts';
import { contextSynthesisMachine } from '../../fsm/context-synthesis-machine.ts';
import { OrchestratorMachineV2 } from '../../fsm/orchestrator-machine-v2.ts';
import { deduplicateFindings } from '../../utils.ts';
import { interpret } from 'xstate';

export function testDeepPlanning(): number {
  let c = 0;
  fc.assert(fc.property(fc.constant('START'), (e) => {
    const s = interpret(deepPlanningMachine).start();
    s.send({ type: e });
    return s.getSnapshot().value === 'layer1';
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.integer({min:3,max:10}), (n) => {
    const s = interpret(deepPlanningMachine).start();
    s.send({type:'START'}); s.send({type:'SUBMIT_LAYER1',count:n});
    const val = s.getSnapshot().value;
    return val !== 'idle';
  }), { numRuns: 50 }); c += 50;
  return c;
}

export function testProblemSolving(): number {
  let c = 0;
  // The problem-solving machine is the class-based ProblemSolvingStateMachine
  // (modes/problem-solving-state-machine.ts) — property tests against its real API.
  fc.assert(fc.property(fc.integer({ min: 1, max: 6 }), (layer) => {
    const config = problemSolvingStateMachine.getLayerConfig(layer);
    return config !== null && config.name.length > 0 && config.description.length > 0;
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.integer(), (layer) => {
    const config = problemSolvingStateMachine.getLayerConfig(layer);
    return layer < 1 || layer > 6 ? config === null : config !== null;
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.string({ minLength: 0, maxLength: 2000 }), (input) => {
    const r = problemSolvingStateMachine.validateLayerContent(1, input);
    return r.valid === (input.length > 0) && Array.isArray(r.missing);
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.integer({ min: 0, max: 500 }), () => {
    const fresh = new ProblemSolvingStateMachine();
    const before = fresh.getIteration();
    fresh.newIteration();
    return fresh.getIteration() === before + 1;
  }), { numRuns: 50 }); c += 50;
  return c;
}

export function testContextSynthesis(): number {
  let c = 0;
  fc.assert(fc.property(fc.string({minLength:1}), (ctx) => {
    const s = interpret(contextSynthesisMachine).start();
    s.send({type:'COLLECT',context:ctx});
    return s.getSnapshot().value === 't1_collection';
  }), { numRuns: 50 }); c += 50;
  return c;
}

export function testOrchestrator(): number {
  let c = 0;
  fc.assert(fc.property(fc.constantFrom(...(['CODE_REVIEW','DEEP_PLANNING','PROBLEM_SOLVING','CONTEXT_SYNTHESIS'] as const)), (mode) => {
    const m = new OrchestratorMachineV2();
    m.startMode(mode);
    return m.getStatus() === 'RUNNING' && m.getLayer() === 1;
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.string({minLength:1}), (reason) => {
    const m = new OrchestratorMachineV2();
    m.startMode('CODE_REVIEW');
    m.fail('test: ' + reason);
    return m.getStatus() === 'ERROR';
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.array(fc.string()), (items: string[]) => {
    const r = deduplicateFindings(items.map((s: string, i: number) => ({file:s,line:i,category:'t',severity:'HIGH' as const,layer:0,detector:'d',title:'t',evidence:'e',remediation:'r',evidenceType:'STATIC' as const})));
    return Array.isArray(r);
  }), { numRuns: 30 }); c += 30;
  return c;
}
