/**
 * TRIDENT MULTI-MODE — SHARED TYPES
 */

export interface Finding {
  id?: string;
  severity: Severity;
  layer: number;
  detector: string;
  category: string;
  title: string;
  file: string;
  line?: number;
  evidence: string;
  remediation: string;
  evidenceType: 'STATIC' | 'EXECUTION' | 'CONTAINER' | 'PROOF';
  commandExecuted?: string;
  commandOutput?: string;
  proofVerified?: boolean;
}

export const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO'
} as const;

export type Severity = typeof SEVERITY[keyof typeof SEVERITY];

export interface FindingConfidence {
  ast: number;
  execution: number;
  environment: number;
  combined: number;
}

export function computeFindingConfidence(input: Omit<FindingConfidence, 'combined'>): FindingConfidence {
  const combined = input.ast * 0.5 + input.execution * 0.3 + input.environment * 0.2;
  return { ...input, combined: Math.round(combined * 1000) / 1000 };
}

export function confidenceLabel(c: FindingConfidence): string {
  if (c.execution === 0) return 'UNVERIFIED (AST-only)';
  if (c.environment === 0) return 'PARTIAL (not container-tested)';
  return 'VERIFIED';
}

export interface ReproducibleFailure {
  finding: string;
  command: string;
  expectedOutput: string;
  actualOutput: string;
}

export interface LayerConfig {
  number: number;
  name: string;
  thinking: string;
  evokes: string[];
  requires: GateRequirement[];
  minChars?: number;
  files?: string[];
}

export interface GateRequirement {
  field: string;
  type: 'boolean' | 'number' | 'string' | 'array';
  value?: unknown;
}

export interface LayerGate<TInput, TOutput> {
  validate(input: TInput): { pass: boolean; data: TOutput; message?: string };
}

export interface LayerResult {
  layer: number;
  status: 'pass' | 'fail' | 'error';
  data: unknown;
  gateMessage?: string;
}

export const CONTEXT_SYNTHESIS_LAYERS: LayerConfig[] = [
  { number: 1, name: 'CONTEXT COLLECTION', thinking: 'What context exists?', evokes: ['T1', 'T2', 'T3', 'T4'], requires: [{ field: 'T1', type: 'boolean', value: true }], minChars: 500 },
  { number: 2, name: 'RELEVANCE SCORING', thinking: 'What matters most?', evokes: ['Score'], requires: [{ field: 'Score', type: 'number', value: 0 }], minChars: 300 },
  { number: 3, name: 'COMPRESSION', thinking: 'How to compress?', evokes: ['Compress'], requires: [{ field: 'Compressed', type: 'boolean', value: true }], minChars: 400 },
  { number: 4, name: 'INJECTION FORMAT', thinking: 'T0-ready format?', evokes: ['Format'], requires: [{ field: 'Format', type: 'string', value: 'T0' }], minChars: 200 }
];

export const DEEP_PLANNING_LAYERS: LayerConfig[] = [
  {
    number: 1,
    name: 'INITIAL PLAN',
    thinking: 'What is this really? What are we trying to solve?',
    evokes: ['First Principles', 'Surface Understanding', 'Constraints', 'Success Criteria', 'Open Questions'],
    requires: [
      { field: 'First_Principles', type: 'number', value: 3 },
      { field: 'Surface_Understanding', type: 'boolean', value: true },
      { field: 'Constraints', type: 'number', value: 3 },
      { field: 'Success_Criteria', type: 'number', value: 1 },
      { field: 'Open_Questions', type: 'number', value: 2 }
    ],
    files: ['01_INITIAL_PLAN.md'],
    minChars: 500
  },
  {
    number: 2,
    name: 'DETAILED BUILD WORKFLOW',
    thinking: 'How does it decompose? What are the parts?',
    evokes: ['Components', 'Sequencing', 'Dependencies', 'Failure Modes', 'Verification'],
    requires: [
      { field: 'Components', type: 'number', value: 5 },
      { field: 'Failure_Modes', type: 'number', value: 3 },
      { field: 'Dependencies', type: 'number', value: 3 },
      { field: 'Critical_Path', type: 'boolean', value: true }
    ],
    files: ['02_COMPONENTS.md', '03_SEQUENCE.md', '04_DEPENDENCIES.md', '05_FAILURE_MODES.md', '06_VERIFICATION.md'],
    minChars: 2000
  },
  {
    number: 3,
    name: 'SELF-CONTAINED CONTEXT LIBRARY',
    thinking: 'Can I explain it so another agent can execute it?',
    evokes: ['Architecture', 'Interfaces', 'State Management', 'Error Handling'],
    requires: [
      { field: 'Architecture', type: 'boolean', value: true },
      { field: 'Interfaces', type: 'boolean', value: true },
      { field: 'State_Management', type: 'boolean', value: true },
      { field: 'Error_Handling', type: 'boolean', value: true }
    ],
    files: ['00_INDEX.md', 'ARCHITECTURE.md', 'COMPONENTS.md', 'DATA_FLOW.md', 'INTERFACES.md', 'STATE.md', 'ERRORS.md'],
    minChars: 1500
  }
];

export const PROBLEM_SOLVING_LAYERS: LayerConfig[] = [
  { number: 1, name: 'ASSUMPTION', thinking: 'What do I assume?', evokes: ['Assumption'], requires: [{ field: 'Assumption', type: 'boolean', value: true }], minChars: 300 },
  { number: 2, name: 'ACTION', thinking: 'What action?', evokes: ['Action'], requires: [{ field: 'Action', type: 'boolean', value: true }], minChars: 200 },
  { number: 3, name: 'OBSERVATION', thinking: 'What happened?', evokes: ['Evidence'], requires: [{ field: 'Evidence', type: 'boolean', value: true }], minChars: 300 },
  { number: 4, name: 'GAP ANALYSIS', thinking: 'Gap analysis?', evokes: ['Gap'], requires: [{ field: 'Gap', type: 'boolean', value: true }], minChars: 300 },
  { number: 5, name: 'META-REFLECTION', thinking: 'What should I have done?', evokes: ['Pattern'], requires: [{ field: 'Pattern', type: 'boolean', value: true }], minChars: 200 },
  { number: 6, name: 'VERIFICATION', thinking: 'Did it work?', evokes: ['Verify'], requires: [{ field: 'Verify', type: 'string' }], minChars: 200 }
];

export const WHY_EXPLANATIONS: Record<string, string> = {
  LAYER_1: 'Without first principles, you solve symptoms not root causes.',
  LAYER_2: 'Without decomposition, complex tasks fail due to unseen dependencies.',
  LAYER_3: 'Without self-contained context, other agents cannot execute your plan.'
};

export const HOW_EXPLANATIONS: Record<string, string> = {
  LAYER_1: 'Identify 3+ first principles, surface understanding in own words, list constraints.',
  LAYER_2: 'Break into 5+ components, sequence by dependency, identify 3+ failure modes.',
  LAYER_3: 'Document architecture diagrams, interface contracts, state schemas, error cases.'
};
