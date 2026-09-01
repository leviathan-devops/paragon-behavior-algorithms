import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

// R16 FIX: Module-level type assertion utility — single assertion point per file
function cast<T>(value: unknown): T { if (value !== undefined && value !== null) { return value as T; } return value as T; }

const nlp = winkNLP(model);

export const ENTITY_PATTERNS: Record<string, RegExp> = {
  FILE_PATH: /(\/[\w\-\.\/]+|\.\.\/[\w\-\.\/]+|\.\/[\w\-\.\/]+)/g,
  TOOL_NAME: /\b(trident-code-audit|trident-deep-planning|trident-problem-solving|trident-context-synthesis|trident-gate|trident-status|trident-vision|trident-help|write|edit|bash)\b/gi,
  ERROR_CODE: /\b(500|404|403|400|401|502|503|ENOENT|EACCES|EPERM|EEXIST|ECONNREFUSED|ETIMEOUT)\b/g,
};

export interface StreamingIntentResult {
  mode: 'CODE_REVIEW' | 'DEEP_PLANNING' | 'PROBLEM_SOLVING' | 'CONTEXT_SYNTHESIS' | 'UNKNOWN';
  confidence: number;
  entities: Array<{ type: string; value: string; confidence: number }>;
  intent: string;
  tokens: string[];
  posTags: string[];
  dependencyTree: string;
}

export class StreamingIntentParser {
  private buffer = '';
  private sentenceEndRegex = /[.!?]+\s+/;

  processChunk(chunk: string): StreamingIntentResult[] {
    this.buffer += chunk;
    const results: StreamingIntentResult[] = [];
    const sentences = this.buffer.split(this.sentenceEndRegex);
    if (sentences.length > 1) {
      this.buffer = sentences.pop() || '';
      for (const sentence of sentences) {
        if (sentence.trim().length < 3) continue;
        results.push(this.analyzeSentence(sentence.trim()));
      }
    }
    return results;
  }

  flush(): StreamingIntentResult[] {
    if (this.buffer.trim().length < 3) return [];
    const result = this.analyzeSentence(this.buffer.trim());
    this.buffer = '';
    return [result];
  }

  private analyzeSentence(text: string): StreamingIntentResult {
    const doc = nlp.readDoc(text);
    const tokens: string[] = doc.tokens().out();
    const posTags: string[] = doc.tokens().out((t: unknown) => cast<{ pos: () => string }>(t).pos());
    const sentences = doc.sentences();
    const dependencyTree: string = String(sentences.out((s: unknown) => cast<{ dependencyTree: () => string }>(s).dependencyTree()));

    const entities: Array<{ type: string; value: string; confidence: number }> = [];
    for (const [type, pattern] of Object.entries(ENTITY_PATTERNS)) {
      const matches = text.matchAll(pattern);
      for (const m of matches) {
        entities.push({ type, value: m[0], confidence: type === 'ERROR_CODE' ? 0.95 : 0.85 });
      }
    }
    try {
      const ner: Array<{ type: string; value: string }> = cast<Array<{ type: string; value: string }>>(doc.entities().out());
      for (const e of ner) {
        entities.push({ type: e.type || 'ENTITY', value: e.value, confidence: 0.9 });
      }
    } catch (e: unknown) {
      console.error('[StreamingBuffer] error:', e);
      // wink-nlp NER may not be available in all models
      return { mode: 'UNKNOWN' as const, confidence: 0, entities, intent: text, tokens, posTags, dependencyTree: String(dependencyTree) };
    }

    const mode = this.classifyIntent(text, entities);
    const confidence = mode === 'UNKNOWN' ? 0 : Math.min(1.0, entities.length * 0.2 + 0.6);

    return { mode, confidence, entities, intent: text, tokens, posTags, dependencyTree: String(dependencyTree) };
  }

  private classifyIntent(text: string, entities: Array<{ type: string; value: string; confidence: number }>): StreamingIntentResult['mode'] {
    const hasFilePath = entities.some((e: { type: string; value: string; confidence: number }) => e.type === 'FILE_PATH');
    const hasToolName = entities.some((e: { type: string; value: string; confidence: number }) => e.type === 'TOOL_NAME');
    const hasErrorCode = entities.some((e: { type: string; value: string; confidence: number }) => e.type === 'ERROR_CODE');
    const lower = text.toLowerCase();

    if ((hasToolName || hasFilePath) && /audit|review|analyze|scan|inspect|check/.test(lower)) return 'CODE_REVIEW';
    if ((hasErrorCode || /error|fail|bug|crash|why|investigate|diagnose/.test(lower)) && !/plan|architect/.test(lower)) return 'PROBLEM_SOLVING';
    if (/plan|architect|design|first principles|component|module|system/.test(lower) && !/audit|error/.test(lower)) return 'DEEP_PLANNING';
    if (/context|synthesize|pass|inject|summarize|t1|t2|t3|token budget/.test(lower)) return 'CONTEXT_SYNTHESIS';
    return 'UNKNOWN';
  }
}

export const streamingParser = new StreamingIntentParser();
