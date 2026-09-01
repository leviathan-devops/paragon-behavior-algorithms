import fc from 'fast-check';
import { deepPlanningMachine } from '../../fsm/deep-planning-machine.ts';
import { problemSolvingStateMachine } from '../../modes/problem-solving-state-machine.ts';
import { contextSynthesisMachine } from '../../fsm/context-synthesis-machine.ts';
import { OrchestratorMachineV2 } from '../../fsm/orchestrator-machine-v2.ts';
import type { Finding } from '../../types.ts';
import { deduplicateFindings, shortFile, confidenceLabel, parseVersion, formatVersion } from '../../utils.ts';
import { setCurrentAgent, getCurrentAgent, clearCurrentAgent } from '../../hooks/agent-state.ts';
import { createTridentTools } from '../../tools/trident-tools.ts';
import { detectIntent } from '../../nlp/intent-parser.ts';
import { interpret } from 'xstate';

export function testZeroTolerance(): number {
  let c = 0;

  fc.assert(fc.property(fc.constantFrom('INVALID', '', '{}', '[]', '  '), (evt) => {
    let ok = true;
    try { const s = interpret(deepPlanningMachine).start(); s.send({ type: evt }); } catch (e: unknown) { console.warn('[deep-properties] deep-planning machine rejected event: ' + String(e)); ok = false; }
    try { problemSolvingStateMachine.validateLayerContent(1, evt); } catch (e: unknown) { console.warn('[deep-properties] problem-solving validate rejected: ' + String(e)); ok = false; }
    try { const s = interpret(contextSynthesisMachine).start(); s.send({ type: evt }); } catch (e: unknown) { console.warn('[deep-properties] context-synthesis machine rejected event: ' + String(e)); ok = false; }
    try { const m = new OrchestratorMachineV2(); m.startMode('CODE_REVIEW'); } catch (e: unknown) { console.warn('[deep-properties] orchestrator startMode rejected: ' + String(e)); ok = false; }
    return ok;
  }), { numRuns: 100 }); c += 100;

  fc.assert(fc.property(fc.constant(null), () => {
    try { createTridentTools(); return true; } catch { return false; }
  }), { numRuns: 50 }); c += 50;

  fc.assert(fc.property(fc.string({ minLength: 0, maxLength: 500 }), (input) => {
    try { detectIntent(input); return true; } catch { return false; }
  }), { numRuns: 500 }); c += 500;

  fc.assert(fc.property(fc.string({ minLength: 0, maxLength: 100 }), (name) => {
    try { setCurrentAgent(name); clearCurrentAgent(); return true; } catch { return false; }
  }), { numRuns: 50 }); c += 50;

  fc.assert(fc.property(fc.array(fc.anything()), (arr) => {
    try { deduplicateFindings(arr as unknown as Finding[]); return true; } catch { return false; }
  }), { numRuns: 50 }); c += 50;

  fc.assert(fc.property(fc.string({ minLength: 0, maxLength: 200 }), (s) => {
    try { shortFile(s); return true; } catch { return false; }
  }), { numRuns: 50 }); c += 50;

  fc.assert(fc.property(fc.double(), (n) => {
    try { confidenceLabel(n); return true; } catch { return false; }
  }), { numRuns: 50 }); c += 50;

  fc.assert(fc.property(fc.string({ minLength: 0, maxLength: 50 }), (s) => {
    try { parseVersion(s); return true; } catch { return false; }
  }), { numRuns: 50 }); c += 50;

  fc.assert(fc.property(fc.integer(), fc.integer(), fc.integer(), (a, b, cc) => {
    try { formatVersion(a, b, cc); return true; } catch { return false; }
  }), { numRuns: 50 }); c += 50;

  return c;
}

export function testInvariants(): number {
  let c = 0;
  fc.assert(fc.property(fc.array(fc.record({ file: fc.string(), category: fc.string() })), (items: Array<{ file: string; category: string }>) => {
    const r = deduplicateFindings(items.map((x: { file: string; category: string }, i: number) => ({ ...x, line: i, severity: 'HIGH' as const, layer: 0, detector: 'd', title: 't', evidence: 'e', remediation: 'r', evidenceType: 'STATIC' as const })));
    return r.length <= items.length;
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.float({ min: -1, max: 2 }), (n) => {
    const label = confidenceLabel(n);
    return ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(label);
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.integer(), fc.integer(), fc.integer(), (a, b, cc) => {
    return formatVersion(a, b, cc).startsWith('V');
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.constant('START'), () => {
    const s = interpret(deepPlanningMachine).start();
    s.send({ type: 'START' });
    return s.getSnapshot().value !== undefined;
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.constantFrom(...(['CODE_REVIEW','DEEP_PLANNING','PROBLEM_SOLVING','CONTEXT_SYNTHESIS'] as const)), (mode) => {
    const m = new OrchestratorMachineV2();
    m.startMode(mode);
    return typeof m.getStatus() === 'string' && typeof m.getLayer() === 'number';
  }), { numRuns: 50 }); c += 50;
  return c;
}

export function testFuzz(): number {
  let c = 0;
  fc.assert(fc.property(fc.string({ minLength: 0, maxLength: 10000 }), (input) => {
    try { detectIntent(input); return true; } catch { return false; }
  }), { numRuns: 200 }); c += 200;
  fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), (layerCount) => {
    try {
      const m = new OrchestratorMachineV2();
      m.startMode('CODE_REVIEW');
      for (let i = 0; i < Math.min(layerCount, m.getMaxLayers()); i++) { m.advanceLayer(); }
      return m.getStatus() !== 'ERROR';
    } catch { return false; }
  }), { numRuns: 100 }); c += 100;
  fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 1000 }), (name) => {
    try { setCurrentAgent(name); const a = getCurrentAgent(); clearCurrentAgent(); return a !== undefined; }
    catch { return false; }
  }), { numRuns: 100 }); c += 100;
  fc.assert(fc.property(fc.constantFrom(NaN, Infinity, -Infinity, 0, 1), (n) => {
    try { return typeof confidenceLabel(n) === 'string'; }
    catch { return false; }
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.string({ minLength: 0, maxLength: 200 }), (input) => {
    try { detectIntent(input); return true; }
    catch { return false; }
  }), { numRuns: 100 }); c += 100;
  fc.assert(fc.property(fc.constantFrom('V1.2.3', '', 'abc', '1.2.3.4', 'V0.0.0', 'V999.999.999'), (v) => {
    try { const p = parseVersion(v); return typeof p.major === 'number'; }
    catch { return false; }
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.constant(undefined), () => {
    try { const tools = createTridentTools(); return Object.keys(tools).length >= 8; }
    catch { return false; }
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.array(fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant({}))), (items) => {
    try { const r = deduplicateFindings(items as unknown as Finding[]); return Array.isArray(r); }
    catch { return false; }
  }), { numRuns: 50 }); c += 50;
  return c;
}
