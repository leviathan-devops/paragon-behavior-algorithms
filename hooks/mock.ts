import type { PlatformAdapter, PlatformEvent } from './platform-adapter.js';
import { normalizeEvent } from './platform-adapter.js';

export class MockAdapter implements PlatformAdapter {
  injectedMessages: Array<{ type: string; content?: string; body?: string; text?: string; [key: string]: unknown }> = [];
  interceptedTools: Array<{ toolName: string; args: Record<string, unknown>; sessionId: string }> = [];
  observedTools: Array<{ toolName: string; args: Record<string, unknown>; result: unknown; sessionId: string }> = [];
  completions: Array<{ toolName: string; exitCode: number; output: string; sessionId: string }> = [];

  normalizeEvent(rawEvent: unknown): PlatformEvent | null {
    return normalizeEvent(rawEvent);
  }

  inject(message: { type: string; content?: string; body?: string; text?: string; [key: string]: unknown }): void {
    if (!message || typeof message.type !== 'string') throw new Error('MockAdapter.inject: message.type required');
    this.injectedMessages.push({ ...message });
  }

  interceptTool(toolName: string, args: Record<string, unknown>, sessionId: string): string | null {
    this.interceptedTools.push({ toolName, args: { ...args }, sessionId });
    return null;
  }

  observeTool(toolName: string, args: Record<string, unknown>, result: unknown, sessionId: string): void {
    this.observedTools.push({ toolName, args: { ...args }, result, sessionId });
  }

  observeCompletion(toolName: string, exitCode: number, output: string, sessionId: string): void {
    this.completions.push({ toolName, exitCode, output, sessionId });
  }

  clear(): void {
    this.injectedMessages.length = 0;
    this.interceptedTools.length = 0;
    this.observedTools.length = 0;
    this.completions.length = 0;
  }
}
