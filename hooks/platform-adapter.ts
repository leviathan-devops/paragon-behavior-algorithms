// hooks/platform-adapter.ts — THE ADAPTER INTERFACE
//
// Implement this per platform. The core handles everything else.
// The 5 methods are REQUIRED — an adapter without all 5 is incomplete.

import type { PlatformEvent, StructuredEnforcementError } from '../core/types.js';

export interface PlatformAdapter {
  /** Normalize a raw platform event into a PlatformEvent (or null to skip). */
  normalizeEvent(rawEvent: unknown): PlatformEvent | null;

  /** Inject enforcement text into the agent's context (the steer/demand append). */
  inject(text: string, context: unknown): void;

  /** Intercept a tool call before execution. Return an error to block, null to allow. */
  interceptTool(toolName: string, args: Record<string, unknown>): StructuredEnforcementError | null;

  /** Observe a completed tool call (the compliance detection + the evidence ingestion). */
  observeTool(toolName: string, args: Record<string, unknown>, result: unknown): void;

  /** Observe the completion text (the mutation pipeline). */
  observeCompletion(text: string, sessionID: string): void;
}

// ═══ THE MOCK ADAPTER (for testing) ═══

export class MockAdapter implements PlatformAdapter {
  injectedTexts: string[] = [];
  interceptedTools: Array<{ tool: string; blocked: boolean }> = [];
  observedTools: Array<{ tool: string; result: unknown }> = [];
  observedCompletions: string[] = [];

  normalizeEvent(raw: unknown): PlatformEvent | null {
    const evt = (raw as { event?: { type: string; properties?: unknown } })?.event;
    if (!evt || typeof evt.type !== 'string') return null;
    return { type: evt.type, properties: evt.properties };
  }

  inject(text: string, _context: unknown): void {
    this.injectedTexts.push(text);
  }

  interceptTool(toolName: string, _args: Record<string, unknown>): StructuredEnforcementError | null {
    this.interceptedTools.push({ tool: toolName, blocked: false });
    return null;
  }

  observeTool(toolName: string, _args: Record<string, unknown>, result: unknown): void {
    this.observedTools.push({ tool: toolName, result });
  }

  observeCompletion(text: string, _sessionID: string): void {
    this.observedCompletions.push(text);
  }
}
