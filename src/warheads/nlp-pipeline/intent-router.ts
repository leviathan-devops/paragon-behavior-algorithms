import { tridentLog } from '../../utils.js';

export interface IntentMatch {
  intent: string;
  confidence: number;
  mode?: string;
}

export class IntentRouter {
  private readonly verbFrames: Array<{ pattern: RegExp; intent: string; mode?: string }> = [
    // Audit / code review intents
    { pattern: /\b(audit|review|inspect|scan|check)\s/i, intent: 'code_audit', mode: 'CODE_REVIEW' },
    { pattern: /\b(find|detect|locate|identify)\s.*\b(bug|issue|problem|vulnerability|error)\b/i, intent: 'code_audit', mode: 'CODE_REVIEW' },
    
    // Planning intents
    { pattern: /\b(plan|design|architecture|architect)\s/i, intent: 'deep_planning', mode: 'DEEP_PLANNING' },
    { pattern: /\b(how\s+(would|should|could|can)\s+(we|i|you))\s/i, intent: 'deep_planning', mode: 'DEEP_PLANNING' },
    
    // Problem-solving intents
    { pattern: /\b(debug|fix|solve|troubleshoot|resolve)\s/i, intent: 'problem_solving', mode: 'PROBLEM_SOLVING' },
    { pattern: /\b(why\s+(is|does|did|are)\s)/i, intent: 'problem_solving', mode: 'PROBLEM_SOLVING' },
    { pattern: /\b(error|failure|crash|bug)\s/i, intent: 'problem_solving', mode: 'PROBLEM_SOLVING' },
    
    // Context synthesis intents
    { pattern: /\b(synthesize|summarize|compress|extract|document)\s/i, intent: 'context_synthesis', mode: 'CONTEXT_SYNTHESIS' },
    { pattern: /\b(what\s+(is|are|does)\s)/i, intent: 'context_synthesis', mode: 'CONTEXT_SYNTHESIS' },
    { pattern: /\b(explain|describe|tell me about)\s/i, intent: 'context_synthesis', mode: 'CONTEXT_SYNTHESIS' },
    
    // Poseidon mode intent
    { pattern: /\bposeidon\b/i, intent: 'poseidon', mode: 'POSEIDON' },

    // Status / help intents
    { pattern: /\b(status|state|health)\b/i, intent: 'status' },
    { pattern: /\b(help|what can you do|commands|tools)\b/i, intent: 'help' },
  ];

  /** Classify intent from text */
  classifyIntent(text: string): string | null {
    if (!text || text.trim().length === 0) return null;
    
    let bestMatch: IntentMatch | null = null;
    
    for (const frame of this.verbFrames) {
      if (frame.pattern.test(text)) {
        const confidence = this.calculateConfidence(text, frame.pattern);
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { intent: frame.intent, confidence, mode: frame.mode };
        }
      }
    }
    
    if (bestMatch && bestMatch.confidence > 0.3) {
      tridentLog('DEBUG', 'intent-router', `Classified as "${bestMatch.intent}" (confidence: ${bestMatch.confidence.toFixed(2)})`);
      return bestMatch.intent;
    }
    
    tridentLog('DEBUG', 'intent-router', `No intent matched for text: "${text.substring(0, 50)}..."`);
    return null;
  }

  /** Get mode for intent */
  intentToMode(intent: string): string | null {
    for (const frame of this.verbFrames) {
      if (frame.intent === intent && frame.mode) return frame.mode;
    }
    return null;
  }

  private calculateConfidence(text: string, pattern: RegExp): number {
    // Base confidence from match
    let confidence = 0.6;
    
    // Boost based on text length (longer text = more context)
    if (text.length > 100) confidence += 0.1;
    if (text.length > 200) confidence += 0.1;
    
    // Boost if multiple match indicators
    const match = pattern.exec(text);
    if (match && match[0].length > 10) confidence += 0.1;
    
    return Math.min(1.0, confidence);
  }
}
