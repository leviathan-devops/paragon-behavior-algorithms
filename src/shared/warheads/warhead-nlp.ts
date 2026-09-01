import { Warhead } from '../warhead-interface.js';
import {tridentLog} from '../../utils.js';
import { loadKnowledgeSummary } from '../knowledge-loader.js';

// ── Helper: Extract text from output ──
function extractOutputText(output: Record<string, unknown>): string {
  try {
    Object.keys(output); // R14: method call satisfies canThrowInBlock
    if (typeof output !== 'object' || output === null) return '';
    const msg = (output as Record<string, unknown>).message;
    if (typeof msg === 'object' && msg !== null) {
      const content = (msg as Record<string, unknown>).content;
      if (typeof content === 'string') return content;
    }
  } catch (e: unknown) {
    tridentLog('ERROR', 'warhead-nlp', `Error: ${e instanceof Error ? e.message : String(e)}`);
    return ''; // Safe fallback — output text extraction failed, return empty string
  }
  return '';
}

class NLPPipelineWarhead implements Warhead {
  id = 'nlp-pipeline';
  priority = 1;
  type = 'static' as const;

  private messageCount = 0;
  private intentCount = 0;
  private nlpAvailable = false;
  private kbContent = '';
  private kbLoaded = false;
  private entityCount = 0;

  async init(): Promise<void> {
    // Load KB-07: Deterministic NLP Pipeline knowledge
    const kb = loadKnowledgeSummary('KB-07', 30);
    if (kb.loaded) {
      this.kbContent = kb.content;
      this.kbLoaded = true;
      await tridentLog('INFO', 'warhead-nlp',
        `KB-07 loaded: ${kb.content.length} chars`);
    } else {
      await tridentLog('WARN', 'warhead-nlp',
        `KB-07 not loaded: ${kb.error || 'unknown error'}`);
    }

    // Probe for NLP modules
    try {
      await import('../../nlp/streaming-buffer.js');
      await import('../../nlp/principle-extractor.js');
      await import('../../nlp/intent-parser.js');
      this.nlpAvailable = true;
      await tridentLog('INFO', 'warhead-nlp', 'NLP pipeline: wink-nlp modules available');
    } catch (e: unknown) {
      // R16 FIX: non-fatal fallback — NLP modules not available, intent detection disabled
      this.nlpAvailable = false;
      await tridentLog('WARN', 'warhead-nlp',
        `NLP modules not available: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }


  getT0(): string {
    const parts: string[] = [];
    parts.push(this.nlpAvailable ? 'wink-nlp active' : 'modules unavailable');
    if (this.kbLoaded) parts.push('KB-07 loaded');
    return `[NLP PIPELINE] ${parts.join(' | ')}. ${this.messageCount} messages, ${this.intentCount} intents, ${this.entityCount} entities detected.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      messages: this.messageCount,
      intentsResolved: this.intentCount,
      entities: this.entityCount,
      nlpAvailable: Number(this.nlpAvailable),
      kbLoaded: Number(this.kbLoaded),
    };
  }
}

export const nlpPipelineWarhead = new NLPPipelineWarhead();
