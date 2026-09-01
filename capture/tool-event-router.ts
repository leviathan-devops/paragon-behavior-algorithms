import type { ParagonToolEngine } from '../core/engine.js';
import type { ToolIntent } from '../core/types.js';

export type ToolEventType = 'started' | 'completed' | 'before';

export interface ToolEvent {
  type: ToolEventType;
  toolName: string;
  args?: Record<string, unknown>;
  exitCode?: number;
  output?: string;
  sessionId: string;
}

export class ToolEventRouter {
  constructor(private readonly engine: ParagonToolEngine) {
    if (!engine) throw new Error('ToolEventRouter: engine required');
  }

  route(event: ToolEvent): ToolIntent | string | null {
    if (!event || typeof event.toolName !== 'string' || !event.toolName) throw new Error('ToolEventRouter.route: event.toolName required');
    if (!event.sessionId || typeof event.sessionId !== 'string') throw new Error('ToolEventRouter.route: event.sessionId required');
    if (!['started', 'completed', 'before'].includes(event.type)) throw new Error(`ToolEventRouter.route: unknown event type '${(event as unknown as Record<string, unknown>).type}'`);
    try {
      return this.engine.onToolEvent(event.sessionId, {
        type: event.type,
        toolName: event.toolName,
        args: event.args,
        exitCode: event.exitCode,
        output: event.output,
      });
    } catch (e) {
      throw e;
    }
  }

  onStarted(sessionId: string, toolName: string, args: Record<string, unknown>): void {
    try {
      this.engine.onToolEvent(sessionId, { type: 'started', toolName, args });
    } catch (e) {
      console.error(`[ToolEventRouter] onStarted failed: ${String(e)}`);
      throw e;
    }
  }

  onCompleted(sessionId: string, toolName: string, exitCode: number, output: string, args?: Record<string, unknown>): void {
    try {
      this.engine.onToolEvent(sessionId, { type: 'completed', toolName, args, exitCode, output });
    } catch (e) {
      console.error(`[ToolEventRouter] onCompleted failed: ${String(e)}`);
      throw e;
    }
  }

  onBefore(sessionId: string, toolName: string, args: Record<string, unknown>): ToolIntent | string | null {
    try {
      return this.engine.onToolEvent(sessionId, { type: 'before', toolName, args });
    } catch (e) {
      throw e;
    }
  }
}
