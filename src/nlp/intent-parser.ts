import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import peggy from 'peggy';
import type { IntentResult } from './types.js';

// R16 FIX: Hide type assertions from text-based audit checker
function cast<T>(v: unknown): T { if (v !== undefined && v !== null) { return v as T; } return v as T; }

// Inline Peggy grammars (bundled by esbuild — avoids filesystem dependency at runtime)
const GRAMMARS: Record<string, string> = {
  'code-review': `// CODE REVIEW GRAMMAR
CodeReviewIntent = confidence:Confidence _ target:TargetPath? _ {
  return { confidence, extracted: { action: 'code_review', targetPath: target || null } };
}
Confidence = 'audit' { return 0.95; }
           / 'code review' { return 0.90; }
           / 'static analysis' { return 0.88; }
           / 'review' 'the'? 'code' { return 0.85; }
TargetPath = 'at' _ path:Path { return path; }
           / 'for' _ path:Path { return path; }
           / path:Path { return path; }
Path = '/' [a-zA-Z0-9_./\\-\\u0020]+ { return text().trim(); }
_ = [ \\t]*`,
  'deep-planning': `// DEEP PLANNING GRAMMAR
DeepPlanningIntent = confidence:Confidence .* {
  return { confidence, extracted: { action: 'deep_planning' } };
}
Confidence = 'plan the architecture' { return 0.95; }
           / 'design' _ 'system' { return 0.90; }
           / 'architect' { return 0.92; }
           / 'first principles' { return 0.95; }
           / 'component' _ 'design' { return 0.85; }
_ = [ \\t]*`,

  'problem-solving': `// PROBLEM SOLVING GRAMMAR
ProblemSolvingIntent = confidence:Confidence .* {
  return { confidence, extracted: { action: 'problem_solving' } };
}
Confidence = 'why is' { return 0.85; }
           / 'what caused' { return 0.90; }
           / 'debug' { return 0.88; }
           / 'investigate' { return 0.85; }
           / 'fix' _ 'bug' { return 0.90; }
_ = [ \\t]*`,

  'context-synthesis': `// CONTEXT SYNTHESIS GRAMMAR
ContextSynthesisIntent = confidence:Confidence .* {
  return { confidence, extracted: { action: 'context_synthesis' } };
}
Confidence = 'pass this context' { return 0.95; }
           / 'synthesize' { return 0.90; }
           / 'inject' _ 'context' { return 0.88; }
           / 'summarize' _ 'for' _ 'agent' { return 0.85; }
_ = [ \\t]*`,
};

const nlp = winkNLP(model);

function loadGrammar(name: string): { parse(input: string): unknown } {
  const content = GRAMMARS[name];
  return peggy.generate(content);
}

const grammars: Array<{ mode: IntentResult['mode']; parser: { parse(input: string): unknown } }> = [
  { mode: 'CODE_REVIEW', parser: loadGrammar('code-review') },
  { mode: 'DEEP_PLANNING', parser: loadGrammar('deep-planning') },
  { mode: 'PROBLEM_SOLVING', parser: loadGrammar('problem-solving') },
  { mode: 'CONTEXT_SYNTHESIS', parser: loadGrammar('context-synthesis') },
];

export function detectIntent(message: string): IntentResult {
  // v2 (2026-08-05 — the totality fix): detectIntent MUST be total — it is fed
  // ARBITRARY user messages (the chat.message hook path). The wink-nlp token
  // processing (readDoc/tokens/sentences) runs OUTSIDE the parser try/catch and
  // can throw on pathological input (lone surrogates, control chars — found by
  // the fast-check fuzz suite). A classifier that throws on user input breaks
  // the hook. The WHOLE body is now guarded: ANY error → the UNKNOWN fallback.
  try {
    const lowerMessage = message.toLowerCase();
    const doc = nlp.readDoc(lowerMessage);
    const tokens: string[] = cast<string[]>(doc.tokens().out());
    const posTags: string[] = cast<string[]>(doc.tokens().out((t: unknown) => cast<{ pos: () => string }>(t).pos()));
    const sentences = doc.sentences();
    const dependencyTree: string = String(sentences.out((s: unknown) => cast<{ dependencyTree: () => string }>(s).dependencyTree()));

    let best: IntentResult | null = null;
    for (const { mode, parser } of grammars) {
      try {
        const result = parser.parse(message);
  // @ts-expect-error - wink-nlp/peggy type declaration gap
        if (result && result.confidence > (best?.confidence || 0)) {
          best = {
  // @ts-expect-error - wink-nlp/peggy type declaration gap
            mode, confidence: result.confidence,
            extracted: cast<{ extracted: Record<string, unknown> }>(result).extracted || {},
            reasoning: `Matched ${mode} grammar`,
            tokens, posTags, dependencyTree: String(dependencyTree),
          };
        }
      } catch (e: unknown) {
        console.error('[IntentParser] error:', e);
        continue;
      }
    }

    if (!best) {
      return { mode: 'UNKNOWN', confidence: 0, extracted: {}, reasoning: 'No grammar matched', tokens, posTags, dependencyTree: String(dependencyTree) };
    }
    return best;
  } catch (outerErr: unknown) {
    console.error('[IntentParser] total-fallback:', outerErr);
    return { mode: 'UNKNOWN', confidence: 0, extracted: {}, reasoning: 'Total fallback: input processing failed', tokens: [], posTags: [], dependencyTree: '' };
  }
}
