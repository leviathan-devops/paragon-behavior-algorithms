import type { ParagonToolEngine } from '../core/engine.js';
import type { PlatformAdapter, PlatformEvent } from './platform-adapter.js';
import { normalizeEvent } from './platform-adapter.js';

export class OpencodeAdapter implements PlatformAdapter {
  private injectedMessages: Array<{ type: string; content?: string; [key: string]: unknown }> = [];

  constructor(private readonly engine: ParagonToolEngine) {
    if (!engine) throw new Error('OpencodeAdapter: engine required');
  }

  normalizeEvent(rawEvent: unknown): PlatformEvent | null {
    return normalizeEvent(rawEvent);
  }

  inject(message: { type: string; content?: string; body?: string; text?: string; [key: string]: unknown }): void {
    if (!message || typeof message.type !== 'string') throw new Error('OpencodeAdapter.inject: message.type required');
    try {
      this.injectedMessages.push({ ...message });
    } catch (e) {
      console.error(`[OpencodeAdapter] inject failed: ${String(e)}`);
      throw e;
    }
  }

  getInjectedMessages(): Array<{ type: string; content?: string; [key: string]: unknown }> {
    return [...this.injectedMessages];
  }

  clearInjected(): void {
    this.injectedMessages.length = 0;
  }

  interceptTool(toolName: string, args: Record<string, unknown>, sessionId: string): string | null {
    if (!toolName || typeof toolName !== 'string') throw new Error('OpencodeAdapter.interceptTool: toolName required');
    if (!sessionId || typeof sessionId !== 'string') throw new Error('OpencodeAdapter.interceptTool: sessionId required');
    try {
      const sid = sessionId || 'default';
      this.engine.onToolEvent(sid, { type: 'started', toolName, args });
      const result = this.engine.onToolEvent(sid, { type: 'before', toolName, args });
      if (result !== null && typeof result === 'string') return result;
      return null;
    } catch (e) {
      if (e !== null && typeof e === 'object' && 'name' in e && (e as Error).name === 'StructuredEnforcementError') {
        throw e;
      }
      console.error(`[OpencodeAdapter] interceptTool failed: ${String(e)}`);
      throw e;
    }
  }

  observeTool(toolName: string, args: Record<string, unknown>, result: unknown, sessionId: string): void {
    if (!toolName || typeof toolName !== 'string') throw new Error('OpencodeAdapter.observeTool: toolName required');
    try {
      const sid = sessionId || 'default';
      const exitCode = result !== null && typeof result === 'object' && 'exitCode' in (result as Record<string, unknown>) ? Number((result as Record<string, unknown>).exitCode) : 0;
      const output = result !== null && typeof result === 'object' && 'output' in (result as Record<string, unknown>) ? String((result as Record<string, unknown>).output) : String(result ?? '');
      this.engine.onToolEvent(sid, { type: 'completed', toolName, args, exitCode, output });
    } catch (e) {
      console.error(`[OpencodeAdapter] observeTool failed: ${String(e)}`);
      throw e;
    }
  }

  observeCompletion(toolName: string, exitCode: number, output: string, sessionId: string, args?: Record<string, unknown>): void {
    if (!toolName || typeof toolName !== 'string') throw new Error('OpencodeAdapter.observeCompletion: toolName required');
    try {
      const sid = sessionId || 'default';
      this.engine.onToolEvent(sid, { type: 'completed', toolName, args, exitCode, output });
    } catch (e) {
      console.error(`[OpencodeAdapter] observeCompletion failed: ${String(e)}`);
      throw e;
    }
  }
}
