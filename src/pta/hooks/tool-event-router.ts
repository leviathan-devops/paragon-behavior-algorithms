import type { ParagonToolEngine } from "../engine.js";
import type { EnforcementEvent } from "../types.js";

export type RawToolEvent = {
  type?: string;
  event?: string;
  toolName?: string;
  tool?: string;
  name?: string;
  args?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
  sessionId?: string;
  sessionID?: string;
  sid?: string;
  output?: string;
  result?: string;
  exitCode?: number;
  timestamp?: number;
};

function normalizeToolName(raw: RawToolEvent): string {
  return raw.toolName ?? raw.tool ?? raw.name ?? "unknown";
}
function normalizeArgs(raw: RawToolEvent): Record<string, unknown> {
  return raw.args ?? raw.arguments ?? {};
}
function normalizeSessionId(raw: RawToolEvent): string {
  return raw.sessionId ?? raw.sessionID ?? raw.sid ?? "default";
}
function normalizeType(raw: RawToolEvent): string {
  const t = raw.type ?? raw.event ?? "";
  if (t === "tool.call.started" || t === "tool.execute.before" || t === "tool.call.completed" || t === "tool.execute.after") return t;
  if (t.includes("started")) return "tool.call.started";
  if (t.includes("completed") || t.includes("after")) return "tool.call.completed";
  if (t.includes("before")) return "tool.execute.before";
  return "tool.execute.before";
}

export function normalizeEvent(raw: RawToolEvent): EnforcementEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const toolName = normalizeToolName(raw);
  if (!toolName || toolName === "unknown") return null;
  const args = normalizeArgs(raw);
  const sessionId = normalizeSessionId(raw);
  const type = normalizeType(raw);
  return {
    type,
    toolName,
    args,
    sessionId,
    output: raw.output ?? raw.result,
    exitCode: raw.exitCode,
    timestamp: raw.timestamp ?? Date.now(),
  };
}

export class ToolEventRouter {
  private engine: ParagonToolEngine;
  constructor(engine: ParagonToolEngine) {
    if (!engine || typeof engine !== "object") throw new TypeError("engine required");
    if (typeof (engine as unknown as { onToolEvent?: unknown }).onToolEvent !== "function") throw new TypeError("engine.onToolEvent must be function");
    this.engine = engine;
  }
  route(raw: RawToolEvent): string | void {
    try {
      const ev = normalizeEvent(raw);
      if (!ev) {
        console.error("[PTA router] normalizeEvent returned null for", JSON.stringify(raw).substring(0,200));
        return;
      }
      return this.engine.onToolEvent(ev);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA router] route failed: ${m}`);
      throw err;
    }
  }
  handleStarted(raw: RawToolEvent): void {
    const ev = normalizeEvent({ ...raw, type: "tool.call.started" });
    if (!ev) throw new TypeError("invalid started event");
    this.engine.onToolEvent(ev);
  }
  handleCompleted(raw: RawToolEvent): void {
    const ev = normalizeEvent({ ...raw, type: "tool.call.completed" });
    if (!ev) throw new TypeError("invalid completed event");
    this.engine.onToolEvent(ev);
  }
  handleBefore(raw: RawToolEvent): void {
    const ev = normalizeEvent({ ...raw, type: "tool.execute.before" });
    if (!ev) throw new TypeError("invalid before event");
    this.engine.onToolEvent(ev);
  }
  handleAfter(raw: RawToolEvent): string | void {
    const ev = normalizeEvent({ ...raw, type: "tool.execute.after" });
    if (!ev) throw new TypeError("invalid after event");
    return this.engine.onToolEvent(ev);
  }
}

export function createToolEventRouter(engine: ParagonToolEngine): ToolEventRouter {
  return new ToolEventRouter(engine);
}
