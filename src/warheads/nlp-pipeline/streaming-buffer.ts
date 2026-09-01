import { tridentLog } from '../../utils.js';

export class StreamingBuffer {
  private buffer: string = '';
  private readonly sentenceDelimiters = /[.!?]\s/;
  private readonly flushTimeoutMs: number = 2000;
  private lastFlushTime: number = Date.now();

  /** Append text to buffer */
  append(text: string): void {
    this.buffer += text;
    tridentLog('DEBUG', 'streaming-buffer', `Buffer size: ${this.buffer.length} chars`);
  }

  /** Get complete sentences from buffer */
  getSentences(): string[] {
    const sentences: string[] = [];
    const parts = this.buffer.split(this.sentenceDelimiters);
    
    // Keep the last incomplete sentence in buffer
    if (parts.length > 1) {
      for (let i = 0; i < parts.length - 1; i++) {
        const s = parts[i].trim();
        if (s.length > 0) sentences.push(s);
      }
      this.buffer = parts[parts.length - 1];
    }
    
    // Auto-flush if timeout exceeded
    const now = Date.now();
    if (now - this.lastFlushTime > this.flushTimeoutMs && this.buffer.trim().length > 0) {
      sentences.push(this.buffer.trim());
      this.buffer = '';
      this.lastFlushTime = now;
    }
    
    return sentences;
  }

  /** Explicit flush — returns all buffered content */
  flush(): string[] {
    const result: string[] = [];
    if (this.buffer.trim().length > 0) {
      result.push(this.buffer.trim());
      this.buffer = '';
    }
    this.lastFlushTime = Date.now();
    return result;
  }

  /** Get current buffer size */
  size(): number { return this.buffer.length; }
}
