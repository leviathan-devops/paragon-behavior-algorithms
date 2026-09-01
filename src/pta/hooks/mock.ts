import type { EnforcementEvent, PlatformAdapter } from "../types.js";

export class MockAdapter implements PlatformAdapter {
  public normalized: unknown[] = [];
  public injected: Array<{ type: string; content: string; sessionId?: string }> = [];
  public intercepted: EnforcementEvent[] = [];
  public observed: EnforcementEvent[] = [];
  public completions: EnforcementEvent[] = [];

  normalizeEvent(raw: unknown): EnforcementEvent | null {
    try {
      this.normalized.push(raw);
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const toolName = (r.toolName as string) ?? (r.tool as string) ?? (r.name as string) ?? "unknown";
      if (toolName === "unknown") return null;
      const args = (r.args as Record<string, unknown>) ?? (r.arguments as Record<string, unknown>) ?? {};
      const sessionId = (r.sessionId as string) ?? (r.sessionID as string) ?? (r.sid as string) ?? "default";
      const type = (r.type as string) ?? (r.event as string) ?? "tool.execute.before";
      return { type, toolName, args, sessionId, output: r.output as string | undefined, exitCode: r.exitCode as number | undefined, timestamp: Date.now() };
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[MockAdapter] normalizeEvent failed: ${m}`);
      return null;
    }
  }

  inject(message: { type: string; content: string; sessionId?: string }): void {
    if (!message || typeof message !== "object") throw new TypeError("message required");
    this.injected.push({ ...message });
  }

  interceptTool(event: EnforcementEvent): void {
    if (!event || typeof event !== "object") throw new TypeError("event required");
    this.intercepted.push({ ...event });
  }

  observeTool(event: EnforcementEvent): void {
    if (!event || typeof event !== "object") throw new TypeError("event required");
    this.observed.push({ ...event });
  }

  observeCompletion(event: EnforcementEvent): void {
    if (!event || typeof event !== "object") throw new TypeError("event required");
    this.completions.push({ ...event });
  }

  clear(): void {
    this.normalized = [];
    this.injected = [];
    this.intercepted = [];
    this.observed = [];
    this.completions = [];
  }

  getCalls(): { normalized: number; injected: number; intercepted: number; observed: number; completions: number } {
    return {
      normalized: this.normalized.length,
      injected: this.injected.length,
      intercepted: this.intercepted.length,
      observed: this.observed.length,
      completions: this.completions.length,
    };
  }
}
