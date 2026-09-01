import { type ActorRef } from 'xstate';

// === Deep Planning Types ===
export interface DeepPlanningContext {
  principles: Array<{ name: string; statement: string; constraints: string[]; successCriteria: string[] }>;
  components: Array<{ name: string; description: string; dependencies: string[]; failureModes: string[]; verificationSteps: string[] }>;
  contextLibrary: string;
  totalSections: number;
  sections: string[];
  parseable: boolean;
  error: string | null;
}

export type DeepPlanningEvent =
  | { type: 'START'; requirements: string; architecture: string }
  | { type: 'SUBMIT_LAYER1'; principles: DeepPlanningContext['principles'] }
  | { type: 'SUBMIT_LAYER2'; components: DeepPlanningContext['components'] }
  | { type: 'SUBMIT_LAYER3'; contextLibrary: string }
  | { type: 'RETRY'; error: string }
  | { type: 'RESET' };

// === Problem Solving Types ===
export interface ProblemSolvingContext {
  assumption: { hypothesis: string; reasoningChain: string[]; confirmCriteria: string[]; disproveCriteria: string[] } | null;
  action: { exactCommands: string[]; predictedOutputs: string[]; environmentState: string } | null;
  observation: { rawEvidence: string; expectedVsActual: Array<{ expected: string; actual: string }>; logsChecked: string[] } | null;
  gap: { rootCause: string; contributingFactors: string[]; evidenceStrength: number } | null;
  metaReflection: { correctActions: string[]; wrongAssumptions: string[]; patternMatch: string } | null;
  verification: { passed: boolean; evidence: string; remainingIssues: string[] } | null;
  iteration: number;
  error: string | null;
}

export type ProblemSolvingEvent =
  | { type: 'SUBMIT_ASSUMPTION'; data: ProblemSolvingContext['assumption'] }
  | { type: 'SUBMIT_ACTION'; data: ProblemSolvingContext['action'] }
  | { type: 'SUBMIT_OBSERVATION'; data: ProblemSolvingContext['observation'] }
  | { type: 'SUBMIT_GAP'; data: ProblemSolvingContext['gap'] }
  | { type: 'SUBMIT_META'; data: ProblemSolvingContext['metaReflection'] }
  | { type: 'SUBMIT_VERIFICATION'; data: ProblemSolvingContext['verification'] }
  | { type: 'NEW_ITERATION' }
  | { type: 'RETRY'; error: string }
  | { type: 'RESET' };

// === Context Synthesis Types ===
export interface ContextSynthesisContext {
  rawContext: string;
  scoredItems: Array<{ content: string; relevance: number; tokenCount: number }>;
  compressed: string;
  tokenBudget: number;
  currentTokens: number;
  sections: string[];
  error: string | null;
}

export type ContextSynthesisEvent =
  | { type: 'COLLECT'; context: string }
  | { type: 'SCORE'; items: ContextSynthesisContext['scoredItems'] }
  | { type: 'COMPRESS'; compressed: string }
  | { type: 'FORMAT'; sections: string[] }
  | { type: 'RETRY'; error: string }
  | { type: 'RESET' };

// === Orchestrator Types ===
export interface SessionState {
  mode: 'idle' | 'deep_planning' | 'problem_solving' | 'context_synthesis' | 'code_review';
  artifacts: Map<string, string>;
  machineRef: import('xstate').ActorRef<any, any> | null;
}

export interface OrchestratorContext {
  sessions?: Map<string, SessionState>;
  currentSession: string | null;
  error: string | null;
  // v4.4.2 additions for enhanced state machine
  mode?: string;
  currentLayer?: number;
  maxLayers?: number;
  completedLayers?: number[];
  failedLayers?: number[];
}

export type OrchestratorEvent =
  | { type: 'START_SESSION'; sessionId: string }
  | { type: 'SET_MODE'; sessionId: string; mode: SessionState['mode'] }
  | { type: 'ADD_ARTIFACT'; sessionId: string; key: string; value: string }
  | { type: 'END_SESSION'; sessionId: string }
  | { type: 'ERROR'; sessionId: string; error: string }
  | { type: 'RECOVER'; sessionId: string };
