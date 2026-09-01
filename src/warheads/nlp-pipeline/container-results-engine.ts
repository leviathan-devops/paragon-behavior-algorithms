// ContainerResultsEngine — LASME classifier for .trident/container-test-results.json
//
// 2026-08-17 — the operator: the verify-report write-blocker was NEVER ported
// to the container-test results artifact. Existence of a JSON blob is NOT
// enough. A hand-written file that looks like the artifact is fabrication.
//
// THE ISE LAW: the PatternFamily is the DETECTOR, the STATE MACHINE is the
// DECISION, the evidence triad is the FINDING. Fail-state = INCONCLUSIVE,
// never PASS. A regex NEVER decides alone.
//
// THE WRITER LAW: only trident-container-test action=results may emit this
// artifact (writer === 'trident-container-test'). A model write of the path
// is rejected by the hook. No sanctioned writer stamp = INCONCLUSIVE.

export type ContainerResultsMachineState =
  | 'IDLE' | 'PARSED' | 'ANALYZED' | 'CLASSIFIED' | 'EVIDENCED' | 'EMITTED'
  | 'INCONCLUSIVE';

export type ScenarioVerdictLabel = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export interface ScenarioVerdict {
  name: string;
  passToken: string;
  failToken: string;
  passTokenMatch: boolean;
  failTokenAbsent: boolean;
  toolResultContext: boolean;
  timedOut: boolean;
  verdict: ScenarioVerdictLabel;
  byteOffset?: number;
  evidence?: string;
}

export interface ContainerResultsArtifact {
  schemaVersion: string;
  containerName: string;
  distSha: string;
  generatedAt: string;
  writer: 'trident-container-test';
  scenarios: ScenarioVerdict[];
  overallVerdict: ScenarioVerdictLabel;
}

export interface ContainerResultsEvidence {
  pattern: string;
  state: string;
  evidence: string;
}

export interface ContainerResultsEngineResult {
  valid: boolean;
  state: ContainerResultsMachineState;
  evidence: ContainerResultsEvidence[];
  artifact: ContainerResultsArtifact | null;
  reason: string;
}

export interface ResultsLexiconMember {
  id: string;
  kind: 'shape' | 'integrity' | 'circular';
  triggerCondition: string;
  severity: 'INFO' | 'WARN' | 'BLOCK';
  messageTemplate: string;
  /** Order-2 structural matcher — inspects parsed fields, never raw text. */
  match: (parsed: Record<string, unknown>) => boolean;
}

const REQUIRED_SCENARIO_KEYS = [
  'name', 'passToken', 'failToken', 'passTokenMatch', 'failTokenAbsent',
  'toolResultContext', 'timedOut', 'verdict',
] as const;

export const CONTAINER_RESULTS_LEXICON: ResultsLexiconMember[] = [
  {
    id: 'CR-SHAPE-WRITER',
    kind: 'shape',
    triggerCondition: 'writer field is not the sanctioned tool stamp',
    severity: 'BLOCK',
    messageTemplate: 'writer must be exactly "trident-container-test" — a hand-authored file is fabrication',
    match: (p) => p.writer !== 'trident-container-test',
  },
  {
    id: 'CR-SHAPE-IDENTITY',
    kind: 'shape',
    triggerCondition: 'containerName or distSha missing or empty',
    severity: 'BLOCK',
    messageTemplate: 'containerName + distSha are required identity fields',
    match: (p) => typeof p.containerName !== 'string' || p.containerName.length === 0
      || typeof p.distSha !== 'string' || p.distSha.length < 16,
  },
  {
    id: 'CR-SHAPE-SCENARIOS',
    kind: 'shape',
    triggerCondition: 'scenarios is missing, not an array, or empty',
    severity: 'BLOCK',
    messageTemplate: 'scenarios must be a non-empty array',
    match: (p) => !Array.isArray(p.scenarios) || p.scenarios.length === 0,
  },
  {
    id: 'CR-SHAPE-SCENARIO-FIELDS',
    kind: 'shape',
    triggerCondition: 'a scenario is missing a required field',
    severity: 'BLOCK',
    messageTemplate: 'every scenario requires name/passToken/failToken/passTokenMatch/failTokenAbsent/toolResultContext/timedOut/verdict',
    match: (p) => {
      if (!Array.isArray(p.scenarios)) return true;
      return p.scenarios.some((s) => {
        if (!s || typeof s !== 'object') return true;
        const rec = s as Record<string, unknown>;
        return REQUIRED_SCENARIO_KEYS.some((k) => rec[k] === undefined || rec[k] === null || rec[k] === '');
      });
    },
  },
  {
    id: 'CR-CIRCULAR-PASS',
    kind: 'circular',
    triggerCondition: 'passTokenMatch is true but toolResultContext is false',
    severity: 'BLOCK',
    messageTemplate: 'circular PASS — passTokenMatch without toolResultContext is agent-free-text theater',
    match: (p) => {
      if (!Array.isArray(p.scenarios)) return false;
      return p.scenarios.some((s) => {
        if (!s || typeof s !== 'object') return false;
        const rec = s as Record<string, unknown>;
        return rec.passTokenMatch === true && rec.toolResultContext !== true;
      });
    },
  },
  {
    id: 'CR-TIMEOUT-PASS',
    kind: 'integrity',
    triggerCondition: 'a timed-out scenario is marked PASS',
    severity: 'BLOCK',
    messageTemplate: 'a timedOut scenario cannot be PASS',
    match: (p) => {
      if (!Array.isArray(p.scenarios)) return false;
      return p.scenarios.some((s) => {
        if (!s || typeof s !== 'object') return false;
        const rec = s as Record<string, unknown>;
        return rec.timedOut === true && rec.verdict === 'PASS';
      });
    },
  },
  {
    id: 'CR-VERDICT-MISMATCH',
    kind: 'integrity',
    triggerCondition: 'verdict PASS without both token conditions',
    severity: 'BLOCK',
    messageTemplate: 'verdict PASS requires passTokenMatch=true AND failTokenAbsent=true AND toolResultContext=true AND timedOut=false',
    match: (p) => {
      if (!Array.isArray(p.scenarios)) return false;
      return p.scenarios.some((s) => {
        if (!s || typeof s !== 'object') return false;
        const rec = s as Record<string, unknown>;
        if (rec.verdict !== 'PASS') return false;
        return rec.passTokenMatch !== true || rec.failTokenAbsent !== true
          || rec.toolResultContext !== true || rec.timedOut === true;
      });
    },
  },
];

export class ContainerResultsEngine {
  private state: ContainerResultsMachineState = 'IDLE';
  private evidence: ContainerResultsEvidence[] = [];

  evaluate(raw: unknown): ContainerResultsEngineResult {
    this.state = 'IDLE';
    this.evidence = [];

    this.state = 'PARSED';
    if (raw === null || raw === undefined) {
      return this.emitInconclusive('EMPTY_INPUT');
    }
    let parsed: Record<string, unknown>;
    if (typeof raw === 'string') {
      try {
        const v = JSON.parse(raw) as unknown;
        if (!v || typeof v !== 'object' || Array.isArray(v)) {
          return this.emitInconclusive('NOT_OBJECT');
        }
        parsed = v as Record<string, unknown>;
      } catch {
        return this.emitInconclusive('JSON_PARSE_FAILED');
      }
    } else if (typeof raw === 'object' && !Array.isArray(raw)) {
      parsed = raw as Record<string, unknown>;
    } else {
      return this.emitInconclusive('NOT_OBJECT');
    }

    this.state = 'ANALYZED';
    const hits: ResultsLexiconMember[] = [];
    for (const member of CONTAINER_RESULTS_LEXICON) {
      if (member.match(parsed)) {
        hits.push(member);
        this.evidence.push({
          pattern: member.id,
          state: 'ANALYZED',
          evidence: member.messageTemplate,
        });
      }
    }

    this.state = 'CLASSIFIED';
    if (hits.length > 0) {
      return this.emitInconclusive('SHAPE_OR_INTEGRITY_FAIL: ' + hits.map((h) => h.id).join(','));
    }

    const scenarios = parsed.scenarios as ScenarioVerdict[];
    const overall = typeof parsed.overallVerdict === 'string'
      ? parsed.overallVerdict as ScenarioVerdictLabel
      : 'INCONCLUSIVE';
    if (overall !== 'PASS' && overall !== 'FAIL' && overall !== 'INCONCLUSIVE') {
      return this.emitInconclusive('OVERALL_VERDICT_INVALID');
    }
    const anyFail = scenarios.some((s) => s.verdict === 'FAIL');
    const anyInconclusive = scenarios.some((s) => s.verdict === 'INCONCLUSIVE');
    const derived: ScenarioVerdictLabel = anyFail ? 'FAIL' : anyInconclusive ? 'INCONCLUSIVE' : 'PASS';
    if (derived !== overall) {
      this.evidence.push({
        pattern: 'CR-OVERALL-DERIVED-MISMATCH',
        state: 'CLASSIFIED',
        evidence: 'overallVerdict=' + overall + ' derived=' + derived,
      });
      return this.emitInconclusive('OVERALL_VERDICT_MISMATCH');
    }

    this.state = 'EVIDENCED';
    const artifact: ContainerResultsArtifact = {
      schemaVersion: typeof parsed.schemaVersion === 'string' ? parsed.schemaVersion : '1',
      containerName: String(parsed.containerName),
      distSha: String(parsed.distSha),
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : new Date().toISOString(),
      writer: 'trident-container-test',
      scenarios,
      overallVerdict: overall,
    };

    this.state = 'EMITTED';
    return {
      valid: true,
      state: 'EMITTED',
      evidence: this.evidence,
      artifact,
      reason: 'VALID',
    };
  }

  private emitInconclusive(reason: string): ContainerResultsEngineResult {
    this.state = 'INCONCLUSIVE';
    this.evidence.push({ pattern: 'CR-INCONCLUSIVE', state: 'INCONCLUSIVE', evidence: reason });
    return {
      valid: false,
      state: 'INCONCLUSIVE',
      evidence: this.evidence,
      artifact: null,
      reason,
    };
  }

  getState(): ContainerResultsMachineState { return this.state; }
}

export const containerResultsEngine = new ContainerResultsEngine();

export function evaluateContainerResults(raw: unknown): ContainerResultsEngineResult {
  return new ContainerResultsEngine().evaluate(raw);
}

export function deriveScenarioVerdict(rec: {
  passTokenMatch: boolean;
  failTokenAbsent: boolean;
  toolResultContext: boolean;
  timedOut: boolean;
}): ScenarioVerdictLabel {
  if (rec.timedOut) return 'INCONCLUSIVE';
  if (rec.passTokenMatch && rec.failTokenAbsent && rec.toolResultContext) return 'PASS';
  return 'FAIL';
}
