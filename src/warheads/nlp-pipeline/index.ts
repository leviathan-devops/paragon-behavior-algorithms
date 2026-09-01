import { StreamingBuffer } from './streaming-buffer.js';
import { IntentRouter } from './intent-router.js';
import { tridentLog } from '../../utils.js';

export { StreamingBuffer, IntentRouter };

export interface NLPStatus {
  messagesProcessed: number;
  intentsRouted: number;
  lastIntent: string | null;
  bufferSize: number;
}

export class NLPPipeline {
  public buffer: StreamingBuffer;
  public router: IntentRouter;
  private messagesProcessed: number = 0;
  private intentsRouted: number = 0;
  private lastIntent: string | null = null;

  constructor() {
    this.buffer = new StreamingBuffer();
    this.router = new IntentRouter();
    tridentLog('INFO', 'nlp-pipeline', 'NLP Pipeline initialized');
  }

  /** Process a message through the pipeline: tokenize → classify → route */
  processMessage(text: string, sessionId?: string): string | null {
    this.messagesProcessed++;
    
    // Add to streaming buffer
    this.buffer.append(text);
    
    // Classify intent
    const intent = this.router.classifyIntent(text);
    if (intent) {
      this.intentsRouted++;
      this.lastIntent = intent;
      tridentLog('INFO', 'nlp-pipeline', `Message routed as intent: ${intent} (total: ${this.intentsRouted})`);
    }
    
    return intent;
  }

  /** Flush pending buffer content */
  flushBuffer(): string[] {
    return this.buffer.flush();
  }

  /** Get pipeline status */
  getStatus(): NLPStatus {
    return {
      messagesProcessed: this.messagesProcessed,
      intentsRouted: this.intentsRouted,
      lastIntent: this.lastIntent,
      bufferSize: this.buffer.size(),
    };
  }
}
