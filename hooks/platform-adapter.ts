export interface PlatformEvent {
  type: string;
  properties?: unknown;
  sessionId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
}

export interface PlatformAdapter {
  normalizeEvent(rawEvent: unknown): PlatformEvent | null;
  inject(message: { type: string; content?: string; body?: string; text?: string; [key: string]: unknown }): void;
  interceptTool(toolName: string, args: Record<string, unknown>, sessionId: string): string | null;
  observeTool(toolName: string, args: Record<string, unknown>, result: unknown, sessionId: string): void;
  observeCompletion(toolName: string, exitCode: number, output: string, sessionId: string, args?: Record<string, unknown>): void;
}

export function normalizeEvent(rawEvent: unknown): PlatformEvent | null {
  if (rawEvent === null || rawEvent === undefined) return null;
  if (typeof rawEvent !== 'object') return null;
  const evt = rawEvent as Record<string, unknown>;
  if (typeof evt.type !== 'string') return null;
  return {
    type: evt.type,
    properties: evt.properties,
    sessionId: typeof evt.sessionId === 'string' ? evt.sessionId : undefined,
    toolName: typeof evt.toolName === 'string' ? evt.toolName : undefined,
    args: evt.args !== null && typeof evt.args === 'object' ? evt.args as Record<string, unknown> : undefined,
  };
}
