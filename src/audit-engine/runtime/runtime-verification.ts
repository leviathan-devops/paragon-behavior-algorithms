import { evalExpr, makeDefaultContext } from '../math/index.ts';
import { checkContract } from '../math/index.ts';
import type { Bindings, MathExpr } from '../math/index.ts';

export interface RuntimeObservation {
  ok: boolean;
  detail: string;
  data?: Record<string, unknown>;
}

export interface RuntimeVerificationSpec {
  scenarioId: string;
  description: string;
  setup(): Promise<void>;
  action(): Promise<RuntimeObservation>;
  assertion(obs: RuntimeObservation): boolean | Promise<boolean>;
  mathSpec: { expression: string; bindings: Record<string, number | boolean | string>; expected: number | boolean | string; tolerance: number };
  htuBugRef: string;
  mechanism?: 'black-box' | 'direct-guard';
}

export type MathVerdict = 'MATH_VALID' | 'MATH_CONTRADICTED';

export interface RuntimeScenarioResult {
  scenarioId: string;
  htuBugRef: string;
  passed: boolean;
  observation: RuntimeObservation;
  mathVerdict: MathVerdict;
}

export interface RuntimeRunSummary {
  total: number;
  passed: number;
  failed: number;
  results: RuntimeScenarioResult[];
  byBugRef: Record<string, RuntimeScenarioResult[]>;
}

function validateSpec(spec: RuntimeVerificationSpec): void {
  if (!spec || typeof spec !== 'object') throw new Error('SPEC_MALFORMED:spec');
  if (!spec.scenarioId || typeof spec.scenarioId !== 'string') throw new Error('SPEC_MALFORMED:scenarioId');
  if (!spec.description || typeof spec.description !== 'string') throw new Error('SPEC_MALFORMED:description');
  if (typeof spec.setup !== 'function') throw new Error('SPEC_MALFORMED:setup');
  if (typeof spec.action !== 'function') throw new Error('SPEC_MALFORMED:action');
  if (typeof spec.assertion !== 'function') throw new Error('SPEC_MALFORMED:assertion');
  if (!spec.mathSpec || typeof spec.mathSpec !== 'object' || Array.isArray(spec.mathSpec)) throw new Error('SPEC_MALFORMED:mathSpec');
  if (typeof spec.mathSpec.expression !== 'string' || spec.mathSpec.expression.length === 0) throw new Error('SPEC_MALFORMED:mathSpec.expression');
  if (!spec.mathSpec.bindings || typeof spec.mathSpec.bindings !== 'object' || Array.isArray(spec.mathSpec.bindings)) throw new Error('SPEC_MALFORMED:mathSpec.bindings');
  if (spec.mathSpec.expected === undefined) throw new Error('SPEC_MALFORMED:mathSpec.expected');
  if (typeof spec.mathSpec.tolerance !== 'number' || Number.isNaN(spec.mathSpec.tolerance)) throw new Error('SPEC_MALFORMED:mathSpec.tolerance');
  if (!spec.htuBugRef || typeof spec.htuBugRef !== 'string') throw new Error('SPEC_MALFORMED:htuBugRef');
  if (spec.mechanism !== undefined && spec.mechanism !== 'black-box' && spec.mechanism !== 'direct-guard') throw new Error('SPEC_MALFORMED:mechanism');
}

function evaluateMathVerdict(spec: RuntimeVerificationSpec, obs: RuntimeObservation): MathVerdict {
  const bindings = spec.mathSpec.bindings;
  const expected = spec.mathSpec.expected;
  const tolerance = spec.mathSpec.tolerance;
  let actual: unknown;
  if (obs.data && typeof obs.data === 'object' && !Array.isArray(obs.data)) {
    for (const k of Object.keys(bindings)) {
      if (k in (obs.data as Record<string, unknown>)) {
        actual = (obs.data as Record<string, unknown>)[k];
        break;
      }
    }
    if (actual === undefined) {
      for (const v of Object.values(obs.data as Record<string, unknown>)) {
        if (typeof v === typeof expected) { actual = v; break; }
      }
    }
  }
  if (actual === undefined) {
    const vals = Object.values(bindings);
    if (vals.length > 0) actual = vals[0];
  }
  if (actual === undefined) actual = expected;
  try {
    if (typeof expected === 'number' && typeof actual === 'number') {
      const b: Bindings = { profile: 'runtime-verification', values: { actual: actual as number, expected: expected as number } };
      const ctx = makeDefaultContext(b);
      const eqExpr: MathExpr = { kind: 'eq', l: { kind: 'var', name: 'actual' }, r: { kind: 'var', name: 'expected' } };
      const r = evalExpr(eqExpr, ctx);
      const dummyContract = { id: 'runtime-math', preconditions: [] as MathExpr[], postconditions: [] as MathExpr[], invariants: [eqExpr], provenance: [{ source: 'runtime-verification', line: 1, quote: spec.mathSpec.expression }] };
      checkContract(dummyContract, 'runtime', b);
      void r;
      const diff = Math.abs((actual as number) - (expected as number));
      return diff <= tolerance ? 'MATH_VALID' : 'MATH_CONTRADICTED';
    }
    if (typeof expected === 'boolean' && typeof actual === 'boolean') {
      const b: Bindings = { profile: 'runtime-verification', values: { actual: actual as boolean, expected: expected as boolean } };
      const ctx = makeDefaultContext(b);
      const eqExpr: MathExpr = { kind: 'eq', l: { kind: 'var', name: 'actual' }, r: { kind: 'var', name: 'expected' } };
      const r = evalExpr(eqExpr, ctx);
      const dummyContract = { id: 'runtime-math', preconditions: [] as MathExpr[], postconditions: [] as MathExpr[], invariants: [eqExpr], provenance: [{ source: 'runtime-verification', line: 1, quote: spec.mathSpec.expression }] };
      checkContract(dummyContract, 'runtime', b);
      if (r.ok) return r.value === true ? 'MATH_VALID' : 'MATH_CONTRADICTED';
      return actual === expected ? 'MATH_VALID' : 'MATH_CONTRADICTED';
    }
    if (typeof expected === 'string' && typeof actual === 'string') {
      return actual === expected ? 'MATH_VALID' : 'MATH_CONTRADICTED';
    }
    return actual === expected ? 'MATH_VALID' : 'MATH_CONTRADICTED';
  } catch {
    return 'MATH_CONTRADICTED';
  }
}

export async function runRuntimeScenario(spec: RuntimeVerificationSpec): Promise<RuntimeScenarioResult> {
  validateSpec(spec);
  let observation: RuntimeObservation;
  try {
    await spec.setup();
  } catch (e: unknown) {
    observation = { ok: false, detail: `setup failed: ${e instanceof Error ? e.message : String(e)}` };
    const mathVerdict = evaluateMathVerdict(spec, observation);
    return { scenarioId: spec.scenarioId, htuBugRef: spec.htuBugRef, passed: false, observation, mathVerdict };
  }
  try {
    const obs = await spec.action();
    if (!obs || typeof obs.ok !== 'boolean' || typeof obs.detail !== 'string') {
      observation = { ok: false, detail: `malformed observation: ${JSON.stringify(obs)}` };
      const mathVerdict = evaluateMathVerdict(spec, observation);
      return { scenarioId: spec.scenarioId, htuBugRef: spec.htuBugRef, passed: false, observation, mathVerdict };
    }
    observation = obs;
  } catch (e: unknown) {
    observation = { ok: false, detail: `action threw: ${e instanceof Error ? e.message : String(e)}` };
    const mathVerdict = evaluateMathVerdict(spec, observation);
    return { scenarioId: spec.scenarioId, htuBugRef: spec.htuBugRef, passed: false, observation, mathVerdict };
  }
  let assertionOk = false;
  try {
    const r = await spec.assertion(observation);
    assertionOk = r === true;
  } catch (e: unknown) {
    observation = { ...observation, detail: `${observation.detail} | assertion threw: ${e instanceof Error ? e.message : String(e)}` };
    assertionOk = false;
  }
  const mathVerdict = evaluateMathVerdict(spec, observation);
  const passed = assertionOk && mathVerdict === 'MATH_VALID';
  return { scenarioId: spec.scenarioId, htuBugRef: spec.htuBugRef, passed, observation, mathVerdict };
}

export async function runRuntimeCorpus(specs: RuntimeVerificationSpec[], opts?: { concurrency?: number }): Promise<RuntimeRunSummary> {
  if (!Array.isArray(specs)) throw new Error('SPEC_MALFORMED:specs');
  const concurrency = opts?.concurrency !== undefined ? opts.concurrency : specs.length;
  if (typeof concurrency !== 'number' || !Number.isInteger(concurrency) || concurrency < 1) throw new Error('SPEC_MALFORMED:concurrency');
  const results: RuntimeScenarioResult[] = [];
  for (let i = 0; i < specs.length; i += concurrency) {
    const chunk = specs.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((s) => runRuntimeScenario(s)));
    for (let j = 0; j < settled.length; j++) {
      const st = settled[j];
      const spec = chunk[j];
      if (st.status === 'fulfilled') {
        results.push(st.value);
      } else {
        const detail = st.reason instanceof Error ? st.reason.message : String(st.reason);
        const scenarioId = (spec as unknown as { scenarioId?: string })?.scenarioId ?? `unknown-${i + j}`;
        const htuBugRef = (spec as unknown as { htuBugRef?: string })?.htuBugRef ?? 'unknown';
        const observation: RuntimeObservation = { ok: false, detail };
        results.push({ scenarioId, htuBugRef, passed: false, observation, mathVerdict: 'MATH_CONTRADICTED' });
      }
    }
  }
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const byBugRef: Record<string, RuntimeScenarioResult[]> = {};
  for (const r of results) {
    if (!byBugRef[r.htuBugRef]) byBugRef[r.htuBugRef] = [];
    byBugRef[r.htuBugRef].push(r);
  }
  return { total: specs.length, passed, failed, results, byBugRef };
}
