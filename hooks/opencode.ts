// hooks/opencode.ts — THE OPENCODE PLATFORM ADAPTER
//
// Wires the ParagonEngine to opencode's hook surface (1.14.x):
//   message.part.updated / message.updated → the capture + the role gate
//   messages.transform → the intervention append (the steer/demand delivery)
//   tool.execute.before → the tier≥3 interception (the deny)
//   tool.execute.after → the compliance observation (the loop closer)
//
// The adapter is stateless; the state lives in the engine (per-session).

import type { PlatformAdapter, PlatformEvent,
               StructuredEnforcementError } from '../core/types.js';
import type { ParagonEngine } from '../core/engine.js';

// ═══ THE OPENCODE MESSAGE SHAPES (the minimal structural surface) ══

interface OcMessage {
  id?: string;
  role?: string;
  parts?: Array<{ type?: string; text?: string }>;
  [key: string]: unknown;
}

interface OcTransformInput {
  messages?: OcMessage[];
  [key: string]: unknown;
}

// ═══ THE ADAPTER ══

export class OpenCodeAdapter implements PlatformAdapter {
  constructor(private readonly engine: ParagonEngine) {}

  /** Normalize an opencode event envelope into a PlatformEvent. */
  normalizeEvent(rawEvent: unknown): PlatformEvent | null {
    const evt = rawEvent as { type?: string; properties?: unknown };
    if (!evt || typeof evt.type !== 'string') return null;
    return { type: evt.type, properties: evt.properties };
  }

  /**
   * THE INJECTION: append the enforcement text to the LAST assistant text
   * part — the model sees it in its own next context (the steer delivery).
   * Returns true when the append landed (the byte-delivery proof).
   */
  inject(text: string, context: unknown): boolean {
    const input = context as OcTransformInput;
    if (!input || !Array.isArray(input.messages)) return false;
    for (let i = input.messages.length - 1; i >= 0; i--) {
      const msg = input.messages[i];
      if (msg?.role !== 'assistant') continue;
      const parts = Array.isArray(msg.parts) ? msg.parts : [];
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j];
        if (part && (part.type === 'text' || part.type === undefined) &&
            typeof part.text === 'string') {
          const before = part.text.length;
          part.text = part.text + '\n\n' + text;
          // The byte-proof: the delivery is verifiable by the length delta
          void before;
          return part.text.length > before;
        }
      }
    }
    return false;
  }

  /** THE INTERCEPTION: tier≥3 blocks the generic tool with the mandate. */
  interceptTool(toolName: string, args: Record<string, unknown>): StructuredEnforcementError | null {
    const sessionID = this.resolveSession(args);
    return this.engine.interceptTool(sessionID, toolName, args);
  }

  /** THE OBSERVATION: every completed tool call feeds the compliance loop. */
  observeTool(toolName: string, args: Record<string, unknown>, result: unknown): void {
    const sessionID = this.resolveSession(args);
    const exitCode = this.resolveExitCode(result);
    this.engine.observeTool(sessionID, toolName, args, exitCode);
  }

  /** THE COMPLETION: the text-complete surface (the behavioral feed). */
  observeCompletion(text: string, sessionID: string): void {
    this.engine.observeText(text, sessionID, 'text-think');
  }

  // ══ THE HOOK BINDINGS (the opencode hook factory) ══

  /**
   * Build the opencode plugin hook object. The returned handlers are the
   * exact shape opencode 1.14.x expects (event, messages.transform,
   * tool.execute.before, tool.execute.after).
   */
  buildHooks() {
    const engine = this.engine;
    const adapter = this;

    return {
      event: async ({ event }: { event: unknown }) => {
        const normalized = adapter.normalizeEvent(event);
        if (normalized) engine.handleEvent(event);
      },

      'messages.transform': async (input: unknown, output: OcTransformInput) => {
        const sessionID = adapter.resolveSession(output as Record<string, unknown>);
        engine.tryIntervene(sessionID, 'messages.transform', (text) => {
          adapter.inject(text, { messages: output.messages });
        });
        return output;
      },

      'tool.execute.before': async (input: unknown, toolName: string,
        args: Record<string, unknown>) => {
        const sessionID = adapter.resolveSession(args);
        // The intervention attempt on the tool surface (the PRIMED lift)
        engine.tryIntervene(sessionID, 'tool-before', () => {});
        const block = engine.interceptTool(sessionID, toolName, args);
        if (block) throw block;
      },

      'tool.execute.after': async (input: unknown, toolName: string,
        args: Record<string, unknown>, result: unknown) => {
        adapter.observeTool(toolName, args, result);
      },
    };
  }

  // ══ THE RESOLVERS ══

  private resolveSession(args: Record<string, unknown> | null | undefined): string {
    if (args && typeof args === 'object') {
      const sid = args['sessionID'];
      if (typeof sid === 'string' && sid !== '') return sid;
    }
    return 'default';
  }

  private resolveExitCode(result: unknown): number | undefined {
    if (result === null || result === undefined) return undefined;
    if (typeof result === 'object') {
      const r = result as Record<string, unknown>;
      if (typeof r['exitCode'] === 'number') return r['exitCode'];
      if (typeof r['exit'] === 'number') return r['exit'];
      // MCP/class tools: no numeric exit — the absence of explicit failure marks
      if (typeof r['error'] === 'string' && r['error'] !== '') return 1;
      if (r['isError'] === true) return 1;
    }
    return undefined;  // no numeric exit + no failure marks = success (F-R6-3 semantics)
  }
}
