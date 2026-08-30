// src/v2/capture/tool-cadence-plane.ts — THE TOOL-CADENCE PLANE (spec §2.2.3)
//
// Filters tool events flowing through the SAME runtime event stream into a
// rolling per-session window of `{tool, at, exitOk?, commandShape}` entries
// (ring cap 100). This plane produces NO language signals — it feeds ONLY the
// macro-pattern engine: TEST_EVASION needs "test-tool calls: 0 while
// verification mentions > 0" (spec §2.4).
//
// THE DETECTION LEXICON (the ISE law — the regex is the mechanical DETECTOR,
// never the decision layer; the macro-pattern engine owns the DECISION):
//   /\bbun test\b|\bnpx vitest\b|\btsc\b/ — the verification-tool invocation
//   shape inside a bash command. Word-bounded so `bun testing` / `tsconfig`
//   do NOT match.
//
// THE RING LAW: cap 100 per session, oldest evicted — a bounded observer can
// never grow unbounded inside the hook phase.
//
// THE NEVER-MUTATE LAW: events are read-only; entries are OUR objects.

import { readPart, type RuntimeEvent } from './reasoning-plane.js';

export interface CadenceEntry {
  tool: string;
  at: number; // epoch-ms (event-provided when present)
  exitOk?: boolean | null; // null = unknown (the result surface didn't expose it)
  commandShape?: string; // whitespace-normalized command fingerprint, ≤200 chars
}

export const TEST_TOOL_PATTERN = /\bbun test\b|\bnpx vitest\b|\btsc\b/;

const RING_CAP = 100;
const COMMAND_SHAPE_MAX = 200;
const DEFAULT_SESSION = 'default';

/** Whitespace-collapsed, trimmed, bounded command fingerprint. */
export function shapeCommand(commandText: string): string {
  return commandText.replace(/\s+/g, ' ').trim().slice(0, COMMAND_SHAPE_MAX);
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

class ToolCadencePlane {
  private readonly windows = new Map<string, CadenceEntry[]>();

  /**
   * Record one tool observation into a session's ring window.
   * Default session keeps the mission's exact call shape:
   * recordTool(tool, at, exitOk, commandText?).
   */
  recordTool(tool: string, at: number, exitOk: boolean | null, commandText?: string, sessionID: string = DEFAULT_SESSION): void {
    if (typeof tool !== 'string' || tool === '') return;
    if (!Number.isFinite(at)) return;
    const window = this.windows.get(sessionID) ?? [];
    const entry: CadenceEntry = { tool, at, exitOk };
    if (typeof commandText === 'string' && commandText.trim() !== '') {
      entry.commandShape = shapeCommand(commandText);
    }
    window.push(entry);
    while (window.length > RING_CAP) window.shift(); // the ring law
    this.windows.set(sessionID, window);
  }

  /**
   * Count bash invocations whose command matches the verification-tool lexicon
   * within the session's window — the TEST_EVASION numerator.
   */
  testToolCallsInWindow(sessionID: string = DEFAULT_SESSION): number {
    const window = this.windows.get(sessionID);
    if (window === undefined) return 0;
    let count = 0;
    for (const entry of window) {
      if (entry.tool === 'bash' && typeof entry.commandShape === 'string' && TEST_TOOL_PATTERN.test(entry.commandShape)) count += 1;
    }
    return count;
  }

  /** Window occupancy probe (the battery asserts the ring eviction with this). */
  windowSize(sessionID: string = DEFAULT_SESSION): number {
    return this.windows.get(sessionID)?.length ?? 0;
  }

  /** The oldest surviving entry's timestamp — proves WHICH rows were evicted. */
  oldestAt(sessionID: string = DEFAULT_SESSION): number | null {
    const window = this.windows.get(sessionID);
    if (window === undefined || window.length === 0) return null;
    return window[0].at;
  }

  reset(): void {
    this.windows.clear();
  }

  /**
   * The event filter (1.14.51 corrected — the discovery probe proved that
   * tool.execute.after does NOT exist as an event type; it's a named hook).
   * PRIMARY: type 'message.part.updated' with part.type === 'tool'.
   */
  onEvent(event: RuntimeEvent | null | undefined): void {
    if (event === null || event === undefined || typeof event.type !== 'string') return;
    if (event.type !== 'message.part.updated') return;
    const part = readPart(event);
    if (part === null || part.type !== 'tool') return;
    if (typeof part.tool === 'string' && part.tool !== '') {
      const at = typeof part.time?.end === 'number' ? part.time.end : Date.now();
      this.recordTool(part.tool, at, null, typeof part.commandText === 'string' ? part.commandText : undefined, part.sessionID ?? DEFAULT_SESSION);
    }
  }
}

/** The singleton the router fans out to. */
export const cadencePlane = new ToolCadencePlane();
