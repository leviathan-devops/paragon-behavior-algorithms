export interface IntentResult {
  mode: 'CODE_REVIEW' | 'DEEP_PLANNING' | 'PROBLEM_SOLVING' | 'CONTEXT_SYNTHESIS' | 'UNKNOWN';
  confidence: number;
  extracted: Record<string, unknown>;
  reasoning: string;
  tokens: string[];
  posTags: string[];
  dependencyTree: string;
}
