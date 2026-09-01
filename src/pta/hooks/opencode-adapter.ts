import type { EnforcementEvent, PlatformAdapter } from "../types.js";
import type { ParagonToolEngine } from "../engine.js";
import { ToolEventRouter, normalizeEvent } from "./tool-event-router.js";

export class OpencodeAdapter implements PlatformAdapter {
  private engine: ParagonToolEngine;
  private router: ToolEventRouter;
  private injected: Array<{ type: string; content: string; sessionId?: string }> = [];

  constructor(engine: ParagonToolEngine) {
    if (!engine || typeof engine !== "object") throw new TypeError("engine required");
    this.engine = engine;
    this.router = new ToolEventRouter(engine);
    if (typeof (engine as unknown as { setAdapter?: unknown }).setAdapter === "function") {
      try { (engine as unknown as { setAdapter: (a: PlatformAdapter) => void }).setAdapter(this); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA adapter] setAdapter failed: ${m}`); }
    }
  }

  normalizeEvent(raw: unknown): EnforcementEvent | null {
    try {
      if (!raw || typeof raw !== "object") return null;
      return normalizeEvent(raw as never);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA adapter] normalizeEvent failed: ${m}`);
      return null;
    }
  }

  inject(message: { type: string; content: string; sessionId?: string }): void {
    if (!message || typeof message !== "object") throw new TypeError("message required");
    if (!message.type || typeof message.type !== "string") throw new TypeError("message.type required");
    if (typeof message.content !== "string") throw new TypeError("message.content must be string");
    try {
      this.injected.push({ ...message });
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA adapter] inject failed: ${m}`);
      throw err;
    }
  }

  interceptTool(event: EnforcementEvent): void {
    if (!event || typeof event !== "object") throw new TypeError("event required");
    try {
      const normalized: EnforcementEvent = { ...event, type: "tool.execute.before" };
      this.engine.onToolEvent(normalized);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA adapter] interceptTool error (propagating): ${m}`);
      throw err;
    }
  }

  observeTool(event: EnforcementEvent): void {
    if (!event || typeof event !== "object") throw new TypeError("event required");
    try {
      const normalized: EnforcementEvent = { ...event, type: "tool.call.started" };
      this.engine.onToolEvent(normalized);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA adapter] observeTool failed: ${m}`);
      throw err;
    }
  }

  observeCompletion(event: EnforcementEvent): void {
    if (!event || typeof event !== "object") throw new TypeError("event required");
    try {
      const normalized: EnforcementEvent = { ...event, type: "tool.call.completed" };
      this.engine.onToolEvent(normalized);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA adapter] observeCompletion failed: ${m}`);
      throw err;
    }
  }

  getInjected(): Array<{ type: string; content: string; sessionId?: string }> {
    return [...this.injected];
  }

  clearInjected(): void {
    this.injected = [];
  }
}
