export interface VerbFrame {
  verb: string;
  intent: string;
  mode?: string;
  examples: string[];
}

export const VERB_FRAMES: VerbFrame[] = [
  { verb: 'audit', intent: 'code_audit', mode: 'CODE_REVIEW', examples: ['audit this codebase', 'review the source'] },
  { verb: 'plan', intent: 'deep_planning', mode: 'DEEP_PLANNING', examples: ['plan the architecture', 'design the system'] },
  { verb: 'debug', intent: 'problem_solving', mode: 'PROBLEM_SOLVING', examples: ['debug this error', 'fix the bug'] },
  { verb: 'synthesize', intent: 'context_synthesis', mode: 'CONTEXT_SYNTHESIS', examples: ['synthesize context', 'summarize the findings'] },
  { verb: 'status', intent: 'status', examples: ['what is your status', 'show state'] },
  { verb: 'help', intent: 'help', examples: ['help', 'what can you do'] },
];
